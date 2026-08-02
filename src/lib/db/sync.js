import { synchronize } from '@nozbe/watermelondb/sync'
import { database } from './index'
import { Q } from '@nozbe/watermelondb'
import { db as firestoreDb, getFbUser, isCircuitOpen, closeCircuitBreaker, reportFirestoreError } from '../firebase'
import { collection, query, where, getDocs, getCountFromServer, writeBatch, doc, serverTimestamp, setDoc, onSnapshot } from 'firebase/firestore'
import { logEvent } from '../telemetry'
import { resolveConflict } from './conflictResolution'
import { localSignature, signaturesMatch } from './syncSignature'
import {
  applyRawToExpression,
  firebaseDocToRaw,
  markSynced,
  rawToCamelCase,
  recordToFirestore,
  safeArray,
  stripUndefined,
  toMs,
} from './expressionMapper'

let isSyncing = false
let rerunRequested = false
let hasReconciledThisSession = false

// ─── Throttle : au plus 1 cycle de sync (pull+push) toutes les 5s ───────────
const SYNC_MIN_GAP_MS = 5 * 1000
let _lastSyncRanAt = 0

// Vérification de divergence (compteur distant) : au plus 1 fois par minute.
// Coût : 1 lecture Firestore par tranche de 1000 fiches (agrégat count) → négligeable.
const COUNT_CHECK_MIN_GAP_MS = 60 * 1000
let _lastCountCheckAt = 0

const LAST_FULL_SYNC_KEY = 'memo_last_full_sync_ms'

const expressionsPath = (uid) => `users/${uid}/expressions`

// Un enregistrement WatermelonDB jamais poussé au serveur a _status === 'created'.
// C'est LE signal fiable pour distinguer « nouvelle fiche locale » (à pousser)
// de « fiche déjà synchronisée puis supprimée ailleurs » (à supprimer ici).
const isNeverSynced = (record) => record?._raw?._status === 'created'

// ─── Signature distante (publiée par les autres appareils) ──────────────────
// { count, reps, hist } — voir syncSignature.js. Mise à jour par le listener
// temps réel du document `sync_signal/latest`, donc sans lecture facturée
// supplémentaire.
let _remoteSignature = null
export function setRemoteSignature(sig) {
  if (sig && typeof sig === 'object') _remoteSignature = sig
}
export function getRemoteSignature() {
  return _remoteSignature
}

/** Identifiant d'appareil stable — utile au débogage multi-appareils. */
function deviceId() {
  try {
    let id = localStorage.getItem('memo_device_id')
    if (!id) {
      id = Math.random().toString(36).slice(2, 10)
      localStorage.setItem('memo_device_id', id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

export async function pushExpressionsToFirebase() {
  const uid = getFbUser()
  if (!uid) return

  const expressionsRef = collection(firestoreDb, expressionsPath(uid))
  const existingDocs = await getDocs(query(expressionsRef))
  const existingIds = new Set()
  existingDocs.forEach(d => existingIds.add(d.id))

  const collectionLocal = database.collections.get('expressions')
  const allRecords = await collectionLocal.query().fetch()

  const writes = []
  for (const record of allRecords) {
    if (!existingIds.has(record.id)) {
      writes.push({ id: record.id, data: { ...recordToFirestore(record), _deleted: false } })
    }
  }

  if (writes.length > 0) {
    await commitExpressionWrites(uid, writes)
    await bumpSyncSignal(uid)
    console.info(`[sync] ${writes.length} fiches poussées vers Firebase`)
  }
}

export function listenToSyncSignal(uid, onSignal) {
  if (!uid) return () => {};
  // Le disjoncteur ne désactive PLUS cette écoute : elle coûte 1 document par
  // changement. La couper laissait l'appareil aveugle aux modifications de
  // l'autre appareil pendant des heures — exactement le symptôme signalé.

  return onSnapshot(
    doc(firestoreDb, 'users', uid, 'sync_signal', 'latest'),
    (snap) => {
      // ⚠️ On ne filtre plus sur `hasPendingWrites` : Firestore marque tout
      // l'instantané comme « en attente » dès que CET appareil a une écriture
      // en cours, ce qui faisait jeter le signal envoyé par l'AUTRE appareil.
      // Traiter deux fois notre propre signal est inoffensif (idempotent).
      if (snap.exists()) {
        if (isCircuitOpen()) return;
        const data = snap.data() || {};
        // La signature distante est publiée par l'appareil qui vient d'écrire.
        // On la mémorise : la détection de divergence devient GRATUITE
        // (plus besoin d'un agrégat `count` distant toutes les minutes) et,
        // surtout, elle voit désormais les RÉVISIONS (le nombre de fiches,
        // lui, ne bouge pas quand on révise).
        if (data.signature) setRemoteSignature(data.signature);
        onSignal(data);
      }
    },
    (err) => {
      reportFirestoreError(err, 'listenToSyncSignal');
    }
  );
}

export async function forceResetSync() {
  if (window.confirm("Voulez-vous vraiment réinitialiser la base locale ? Cela va tout retélécharger depuis le serveur.")) {
    try {
      await database.write(async () => {
        await database.unsafeResetDatabase();
      });
      alert("Base locale réinitialisée. L'application va redémarrer.");
      window.location.reload();
    } catch (e) {
      console.error("Erreur lors de la réinitialisation :", e);
      logEvent("sync:fail", { context: "forceResetSync", error: e?.message || String(e) });
      alert("Erreur lors de la réinitialisation.");
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 🩺 RÉPARATION DE SYNCHRO — appareil divergent (ex : 204 ici, 198 ailleurs)
// Bypasse le disjoncteur, le throttle et le cache 30 min, puis force une
// réconciliation complète « le serveur fait foi ».
// ══════════════════════════════════════════════════════════════════════════
export async function repairSyncNow() {
  const uid = getFbUser()
  if (!uid) return { ok: false, reason: 'not-signed-in' }

  closeCircuitBreaker()
  _lastSyncRanAt = 0
  _lastCountCheckAt = 0
  hasReconciledThisSession = false
  try { localStorage.removeItem('memo_last_reconcile_ms') } catch { }

  // Attend la fin d'un éventuel cycle en cours (max 10s) pour éviter les collisions.
  for (let i = 0; i < 40 && isSyncing; i++) {
    await new Promise(r => setTimeout(r, 250))
  }

  try {
    await syncWithFirebase(true)
    const [localCount, remoteCount] = await Promise.all([
      database.collections.get('expressions').query().fetchCount(),
      getRemoteActiveCount(uid),
    ])
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('cards_synced')) } catch { }
    }
    console.info(`[sync] Réparation terminée — local: ${localCount}, serveur: ${remoteCount}`)
    return { ok: true, local: localCount, remote: remoteCount }
  } catch (e) {
    reportFirestoreError(e, 'repairSyncNow')
    return { ok: false, reason: e?.message || String(e) }
  }
}

if (typeof window !== 'undefined') {
  // Accessible depuis la console du téléphone : window.repairSync()
  window.repairSync = repairSyncNow
}

// Compte les fiches actives côté serveur (agrégat → ~1 lecture, pas N).
async function getRemoteActiveCount(uid) {
  try {
    const snap = await getCountFromServer(
      query(collection(firestoreDb, expressionsPath(uid)), where('_deleted', '==', false))
    )
    return snap.data().count
  } catch (e) {
    console.warn('[sync] count distant indisponible', e?.message || e)
    return null
  }
}

async function bumpSyncSignal(uid) {
  try {
    // On publie la signature DANS le document sentinelle déjà écouté :
    // 1 écriture au lieu de 2, 0 lecture supplémentaire côté récepteurs.
    let signature = null
    try { signature = await localSignature(database) } catch { /* ignore */ }
    _remoteSignature = signature || _remoteSignature
    await setDoc(
      doc(firestoreDb, 'users', uid, 'sync_signal', 'latest'),
      { lastUpdate: serverTimestamp(), at: Date.now(), device: deviceId(), signature },
      { merge: true },
    )
  } catch (e) {
    console.warn('[sync] Failed to write sync_signal', e)
  }
}

export async function syncWithFirebase(forceReconcile = false) {
  const uid = getFbUser()
  if (!uid) return false
  if (!forceReconcile && isCircuitOpen()) return false
  if (isSyncing) {
    rerunRequested = true
    return false
  }
  const now = Date.now()
  if (!forceReconcile && now - _lastSyncRanAt < SYNC_MIN_GAP_MS) {
    rerunRequested = true
    return false
  }
  _lastSyncRanAt = now
  isSyncing = true
  let localChanged = false

  try {
    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt }) => {
        // NB : `updatedAt` est TOUJOURS écrit en millisecondes (nombre) — voir
        // commitExpressionWrites. Un champ de type Timestamp trierait après les
        // nombres dans Firestore et casserait ce filtre incrémental.
        // Marge anti-dérive d'horloge : `updatedAt` est écrit avec l'horloge de
        // l'appareil émetteur. Sans marge, une fiche révisée sur un appareil
        // dont l'horloge retarde de quelques minutes passait sous le filtre et
        // n'arrivait JAMAIS sur l'autre appareil (compteur figé à 34).
        const PULL_SKEW_MARGIN_MS = 5 * 60 * 1000
        const q = lastPulledAt
          ? query(
              collection(firestoreDb, expressionsPath(uid)),
              where('updatedAt', '>', Math.max(0, lastPulledAt - PULL_SKEW_MARGIN_MS)),
            )
          : collection(firestoreDb, expressionsPath(uid))

        const snapshot = await getDocs(q)
        const remoteIds = []
        snapshot.forEach(d => remoteIds.push(d.id))

        const localById = new Map()
        if (remoteIds.length > 0) {
          for (let i = 0; i < remoteIds.length; i += 400) {
            const chunk = remoteIds.slice(i, i + 400)
            const localRecords = await database.collections.get('expressions').query(Q.where('id', Q.oneOf(chunk))).fetch()
            localRecords.forEach(r => localById.set(r.id, r))
          }
        }

        const created = []
        const updated = []
        const deleted = []
        const fixesToPush = []

        let maxUpdatedAt = lastPulledAt || 0
        snapshot.forEach(docSnap => {
          const data = docSnap.data() || {}
          const docUpdatedAt = toMs(data.updatedAt, 0)
          if (docUpdatedAt > maxUpdatedAt) maxUpdatedAt = docUpdatedAt

          if (data._deleted) {
            if (localById.has(docSnap.id)) deleted.push(docSnap.id)
            return
          }

          const raw = firebaseDocToRaw(docSnap)
          const local = localById.get(docSnap.id)

          if (local) {
            // 🛡️ Règle de conflit UNIQUE (conflictResolution.js) : l'historique
            // de révision le plus long gagne, puis les répétitions, puis la
            // date de prochaine révision, et l'horodatage en dernier recours.
            const winner = resolveConflict(
              {
                reviewHistory: data.reviewHistory,
                repetitions: data.repetitions,
                nextReview: data.nextReview,
                updatedAt: docUpdatedAt,
              },
              {
                reviewHistory: local.reviewHistory,
                repetitions: local.repetitions,
                nextReview: local.nextReview,
                updatedAt: toMs(local._raw?.updated_at, 0),
              },
            )
            if (winner === 'remote') {
              updated.push(raw)
            } else if (winner === 'local') {
              fixesToPush.push({ id: docSnap.id, data: { ...recordToFirestore(local), _deleted: false }, merge: true })
            }
          } else {
            created.push(raw)
          }
        })

        if (fixesToPush.length > 0) {
          commitExpressionWrites(uid, fixesToPush).catch(e => console.warn('[sync] Échec réparation serveur', e))
        }

        if (created.length || updated.length || deleted.length) localChanged = true
        return { changes: { expressions: { created, updated, deleted } }, timestamp: maxUpdatedAt }
      },
      pushChanges: async ({ changes }) => {
        const writes = []
        const expressionsChanges = changes.expressions
        if (expressionsChanges) {
          expressionsChanges.created.forEach(record => writes.push({ id: record.id, data: { ...rawToCamelCase(record), _deleted: false } }))
          expressionsChanges.updated.forEach(record => writes.push({ id: record.id, data: { ...rawToCamelCase(record), _deleted: false }, merge: true }))
          // Pierre tombale permanente : c'est elle qui fait disparaître la fiche
          // sur TOUS les appareils. On ne supprime jamais physiquement le doc.
          expressionsChanges.deleted.forEach(id => writes.push({ id, data: { _deleted: true, deletedAt: Date.now() }, merge: true }))
        }
        await commitExpressionWrites(uid, writes)
        if (writes.length > 0) await bumpSyncSignal(uid)
      },
      // ⚠️ FIX MAJEUR. Par défaut, WatermelonDB protège les colonnes modifiées
      // localement : lors d'un pull, la valeur distante de ces colonnes est
      // IGNORÉE, puis la valeur locale (périmée) est repoussée au serveur.
      // C'est exactement ce qui figeait le PC à 34 fiches et pouvait annuler
      // les 3 révisions faites sur le téléphone. Ici, quand la version
      // distante gagne la règle de conflit, elle écrase pour de bon.
      conflictResolver: (table, local, remote, resolved) => {
        if (table !== 'expressions') return resolved
        const winner = resolveConflict(
          {
            reviewHistory: remote.review_history,
            repetitions: remote.repetitions,
            nextReview: remote.next_review,
            updatedAt: remote.updated_at,
          },
          {
            reviewHistory: local.review_history,
            repetitions: local.repetitions,
            nextReview: local.next_review,
            updatedAt: local.updated_at,
          },
        )
        if (winner !== 'remote') return resolved
        const forced = { ...resolved }
        for (const key of Object.keys(remote)) {
          if (key === 'id' || key.startsWith('_')) continue
          forced[key] = remote[key]
        }
        return forced
      },
    })

    // ── Réconciliation complète ────────────────────────────────────────────
    // Coûteuse (lit toute la collection) → limitée à 1×/30 min, SAUF si :
    //   • forceReconcile (réparation manuelle), ou
    //   • le compteur distant (1 lecture) diverge du compteur local.
    const RECONCILE_MIN_GAP_MS = 30 * 60 * 1000
    let lastReconcileAt = 0
    try { lastReconcileAt = parseInt(localStorage.getItem('memo_last_reconcile_ms') || '0', 10) || 0 } catch { }

    let divergent = false
    if (!forceReconcile && Date.now() - _lastCountCheckAt > COUNT_CHECK_MIN_GAP_MS) {
      _lastCountCheckAt = Date.now()
      const localSig = await localSignature(database)

      if (_remoteSignature) {
        // Chemin GRATUIT (0 lecture) : la signature distante nous a été poussée
        // par le listener temps réel. Elle inclut les révisions, contrairement
        // à l'ancien compteur de fiches.
        if (!signaturesMatch(localSig, _remoteSignature)) {
          divergent = true
          console.warn(
            `[sync] Divergence détectée via signature — local ${JSON.stringify(localSig)} ≠ serveur ${JSON.stringify(_remoteSignature)}`,
          )
        }
      } else {
        // Repli (aucune signature distante encore reçue) : agrégat count, 1 lecture.
        const remoteCount = await getRemoteActiveCount(uid)
        if (remoteCount !== null && remoteCount !== localSig.count) {
          divergent = true
          console.warn(`[sync] Divergence détectée (local ${localSig.count} ≠ serveur ${remoteCount}) → réconciliation forcée.`)
        }
      }
    }

    const canReconcile = forceReconcile || divergent || (Date.now() - lastReconcileAt > RECONCILE_MIN_GAP_MS)
    if (canReconcile && (!hasReconciledThisSession || forceReconcile || divergent)) {
      localChanged = (await reconcileAllExpressions(uid, { authoritative: forceReconcile || divergent })) || localChanged
      hasReconciledThisSession = true
      try {
        localStorage.setItem('memo_last_reconcile_ms', String(Date.now()))
        localStorage.setItem(LAST_FULL_SYNC_KEY, String(Date.now()))
      } catch { }
    }
  } catch (err) {
    reportFirestoreError(err, "syncWithFirebase")
  } finally {
    isSyncing = false
  }

  if (localChanged && typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('cards_synced')) } catch (_) { }
  }
  if (rerunRequested) {
    rerunRequested = false
    const delay = Math.max(250, SYNC_MIN_GAP_MS - (Date.now() - _lastSyncRanAt))
    setTimeout(() => syncWithFirebase().catch(err => reportFirestoreError(err, "syncWithFirebase_followup")), delay)
  }
  return localChanged
}

async function reconcileAllExpressions(uid, { authoritative = false } = {}) {
  const expressions = database.collections.get('expressions')
  const [localRecords, remoteSnap] = await Promise.all([
    expressions.query().fetch(),
    getDocs(collection(firestoreDb, expressionsPath(uid))),
  ])

  const localById = new Map(localRecords.map(record => [record.id, record]))
  const remoteIds = new Set()          // tous les docs, tombstones compris
  const remoteActiveIds = new Set()    // docs non supprimés
  const localOps = []
  const remoteWrites = []

  remoteSnap.forEach(docSnap => {
    const data = docSnap.data() || {}
    const id = docSnap.id
    remoteIds.add(id)
    const local = localById.get(id)

    if (data._deleted) {
      if (local) localOps.push(local.prepareMarkAsDeleted())
      return
    }
    remoteActiveIds.add(id)

    // Backfill : les vieux docs sans `_deleted` ou avec un `updatedAt` non
    // numérique cassaient le filtre incrémental et le compteur distant.
    if (data._deleted === undefined || typeof data.updatedAt !== 'number') {
      remoteWrites.push({ id, data: { _deleted: false, updatedAt: toMs(data.updatedAt, Date.now()) }, merge: true })
    }

    const raw = firebaseDocToRaw(docSnap)
    if (!local) {
      localOps.push(markSynced(expressions.prepareCreate(exp => applyRawToExpression(exp, raw))))
      return
    }

    const winner = resolveConflict(
      {
        reviewHistory: data.reviewHistory,
        repetitions: data.repetitions,
        nextReview: data.nextReview,
        updatedAt: toMs(data.updatedAt, 0),
      },
      {
        reviewHistory: local.reviewHistory,
        repetitions: local.repetitions,
        nextReview: local.nextReview,
        updatedAt: toMs(local._raw?.updated_at, 0),
      },
    )

    if (winner === 'remote') {
      // markSynced : la valeur vient du serveur et gagne → on efface le drapeau
      // « modifié localement » pour qu'elle ne soit pas repoussée telle quelle.
      localOps.push(markSynced(local.prepareUpdate(exp => applyRawToExpression(exp, raw))))
    } else if (winner === 'local') {
      remoteWrites.push({ id, data: { ...recordToFirestore(local), _deleted: false }, merge: true })
    }
  })

  // ── Fiches présentes SEULEMENT en local ────────────────────────────────
  // ⚠️ C'était LA cause du décalage (ex. 204 sur le téléphone / 198 ailleurs) :
  // l'ancien code repoussait systématiquement ces fiches vers le serveur, ce
  // qui ressuscitait des fiches supprimées sur un autre appareil et figeait
  // le compteur du téléphone. Désormais :
  //   • jamais synchronisée (_status === 'created') → vraie nouveauté → push
  //   • déjà synchronisée mais absente/tombstonée côté serveur → supprimée
  //     ailleurs → on la supprime ici.
  const orphanLocals = localRecords.filter(r => !remoteActiveIds.has(r.id) && !remoteIds.has(r.id))
  const alreadyMarked = new Set()
  // Garde-fou : si le serveur renvoie 0 fiche alors qu'on en a localement,
  // c'est très probablement une lecture partielle/incident → on ne supprime rien.
  const serverLooksEmpty = remoteIds.size === 0 && localRecords.length > 0

  for (const local of orphanLocals) {
    if (isNeverSynced(local) || serverLooksEmpty) {
      remoteWrites.push({ id: local.id, data: { ...recordToFirestore(local), _deleted: false } })
    } else {
      alreadyMarked.add(local.id)
      localOps.push(local.prepareMarkAsDeleted())
    }
  }
  if (alreadyMarked.size > 0) {
    console.warn(`[sync] ${alreadyMarked.size} fiche(s) supprimée(s) sur un autre appareil → retirée(s) ici.`)
    logEvent('sync:ghost_cards_removed', { count: alreadyMarked.size })
  }

  if (localOps.length) {
    await database.write(async () => {
      for (let i = 0; i < localOps.length; i += 450) {
        await database.batch(...localOps.slice(i, i + 450))
      }
    })
  }
  await commitExpressionWrites(uid, remoteWrites)
  if (remoteWrites.length > 0) await bumpSyncSignal(uid)

  if (authoritative) {
    const localCount = await expressions.query().fetchCount()
    console.info(`[sync] Réconciliation autoritaire — local: ${localCount}, serveur actif: ${remoteActiveIds.size}`)
  }
  return localOps.length > 0
}

async function commitExpressionWrites(uid, writes) {
  const clean = writes.filter(w => w?.id && w.data)
  for (let i = 0; i < clean.length; i += 450) {
    const batch = writeBatch(firestoreDb)
    clean.slice(i, i + 450).forEach(({ id, data, merge }) => {
      const ref = doc(firestoreDb, expressionsPath(uid), id)
      // `updatedAt` DOIT rester un nombre (ms) : les filtres incrémentaux
      // `where('updatedAt', '>', lastPulledAt)` comparent des nombres. Un
      // serverTimestamp() (type Timestamp) triait après tous les nombres →
      // pulls incomplets ou surdimensionnés selon les docs. On garde une trace
      // serveur séparée pour l'audit/anti-dérive d'horloge.
      const payload = { ...stripUndefined(data), updatedAt: Date.now(), updatedAtServer: serverTimestamp() }
      if (merge) batch.set(ref, payload, { merge: true })
      else batch.set(ref, payload)
    })
    await batch.commit()
  }
}

