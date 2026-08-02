import { synchronize } from '@nozbe/watermelondb/sync'
import { database } from './index'
import { Q } from '@nozbe/watermelondb'
import { db as firestoreDb, getFbUser, isCircuitOpen, closeCircuitBreaker, reportFirestoreError } from '../firebase'
import { collection, query, where, getDocs, getCountFromServer, writeBatch, doc, serverTimestamp, setDoc, onSnapshot } from 'firebase/firestore'
import { normalizeDate } from '../../utils/dateUtils'
import { logEvent } from '../telemetry'

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
const toMs = (value, fallback = Date.now()) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()
  if (value && typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}
const safeArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  return []
}
const stripUndefined = (value) => JSON.parse(JSON.stringify(value))

// Un enregistrement WatermelonDB jamais poussé au serveur a _status === 'created'.
// C'est LE signal fiable pour distinguer « nouvelle fiche locale » (à pousser)
// de « fiche déjà synchronisée puis supprimée ailleurs » (à supprimer ici).
const isNeverSynced = (record) => record?._raw?._status === 'created'

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
  if (!firestoreDb) return () => {}; // Firebase non configuré → mode local seul
  if (isCircuitOpen()) {
    console.info('[sync] Circuit breaker actif — listenToSyncSignal désactivé pour cette session.');
    return () => {};
  }

  return onSnapshot(
    doc(firestoreDb, 'users', uid, 'sync_signal', 'latest'),
    (snap) => {
      if (snap.exists() && !snap.metadata.hasPendingWrites) {
        if (isCircuitOpen()) return;
        onSignal();
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
    await setDoc(doc(firestoreDb, 'users', uid, 'sync_signal', 'latest'), { lastUpdate: serverTimestamp() }, { merge: true })
  } catch (e) {
    console.warn('[sync] Failed to write sync_signal', e)
  }
}

export async function syncWithFirebase(forceReconcile = false) {
  const uid = getFbUser()
  if (!uid) return false
  if (!firestoreDb) return false // Firebase non configuré → mode local seul
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
        const q = lastPulledAt
          ? query(collection(firestoreDb, expressionsPath(uid)), where('updatedAt', '>', lastPulledAt))
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
            // 🛡️ Résolution de conflit type CRDT : la progression la plus avancée gagne.
            const remoteRepetitions = Number(data.repetitions || 0)
            const localRepetitions = Number(local.repetitions || 0)

            const remoteNextReview = data.nextReview ? new Date(data.nextReview).getTime() : 0
            const localNextReview = local.nextReview ? new Date(normalizeDate(local.nextReview)).getTime() : 0

            const remoteIsMoreAdvanced =
              remoteRepetitions > localRepetitions ||
              (remoteRepetitions === localRepetitions && remoteNextReview > localNextReview + 86400000)

            const localIsMoreAdvanced =
              localRepetitions > remoteRepetitions ||
              (localRepetitions === remoteRepetitions && localNextReview > remoteNextReview + 86400000)

            if (remoteIsMoreAdvanced) {
              updated.push(raw)
            } else if (localIsMoreAdvanced) {
              fixesToPush.push({ id: docSnap.id, data: { ...recordToFirestore(local), _deleted: false }, merge: true })
            } else {
              const remoteUpdated = docUpdatedAt
              const localUpdated = toMs(local._raw?.updated_at, 0)
              if (remoteUpdated > localUpdated + 1000) {
                updated.push(raw)
              } else if (localUpdated > remoteUpdated + 1000) {
                fixesToPush.push({ id: docSnap.id, data: { ...recordToFirestore(local), _deleted: false }, merge: true })
              }
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
      const [localCount, remoteCount] = await Promise.all([
        database.collections.get('expressions').query().fetchCount(),
        getRemoteActiveCount(uid),
      ])
      if (remoteCount !== null && remoteCount !== localCount) {
        divergent = true
        console.warn(`[sync] Divergence détectée (local ${localCount} ≠ serveur ${remoteCount}) → réconciliation forcée.`)
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
      localOps.push(expressions.prepareCreate(exp => applyRawToExpression(exp, raw)))
      return
    }

    const remoteRepetitions = Number(data.repetitions || 0)
    const localRepetitions = Number(local.repetitions || 0)

    const remoteNextReview = data.nextReview ? new Date(data.nextReview).getTime() : 0
    const localNextReview = local.nextReview ? new Date(normalizeDate(local.nextReview)).getTime() : 0

    const remoteIsMoreAdvanced =
      remoteRepetitions > localRepetitions ||
      (remoteRepetitions === localRepetitions && remoteNextReview > localNextReview + 86400000)

    const localIsMoreAdvanced =
      localRepetitions > remoteRepetitions ||
      (localRepetitions === remoteRepetitions && localNextReview > remoteNextReview + 86400000)

    if (remoteIsMoreAdvanced) {
      localOps.push(local.prepareUpdate(exp => applyRawToExpression(exp, raw)))
    } else if (localIsMoreAdvanced) {
      remoteWrites.push({ id, data: { ...recordToFirestore(local), _deleted: false }, merge: true })
    } else {
      const remoteUpdated = toMs(data.updatedAt, 0)
      const localUpdated = toMs(local._raw?.updated_at, 0)
      if (remoteUpdated > localUpdated + 1000) {
        localOps.push(local.prepareUpdate(exp => applyRawToExpression(exp, raw)))
      } else if (localUpdated > remoteUpdated + 1000) {
        remoteWrites.push({ id, data: { ...recordToFirestore(local), _deleted: false }, merge: true })
      }
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

function firebaseDocToRaw(docSnap) {
  const data = docSnap.data() || {}
  const updatedAt = toMs(data.updatedAt, Date.now())
  return {
    id: docSnap.id,
    front: data.front || '',
    back: data.back || '',
    example: data.example || '',
    category: data.category || 'Général',
    type: data.type || 'qa',
    image_url: data.imageUrl || null,
    audio_url: data.audioUrl || null,
    layers: JSON.stringify(safeArray(data.layers)),
    level: Number(data.level || 0),
    next_review: data.nextReview ? normalizeDate(data.nextReview) : null,
    created_at: toMs(data.createdAt, updatedAt),
    updated_at: updatedAt,
    ease_factor: Number(data.easeFactor || 2.5),
    interval: Number(data.interval || 1),
    repetitions: Number(data.repetitions || 0),
    review_history: JSON.stringify(safeArray(data.reviewHistory)),
    // FIX : champs qui n'étaient jamais lus depuis Firestore → un autre appareil
    // ne recevait jamais l'état "en pause" ni la progression "production active".
    paused: !!data.paused,
    mastery_stage: data.masteryStage || null,
    productive_uses: JSON.stringify(safeArray(data.productiveUses)),
    last_productive_use_at: data.lastProductiveUseAt ? toMs(data.lastProductiveUseAt) : null,
  }
}

function applyRawToExpression(exp, raw) {
  exp._raw.id = raw.id
  exp.front = raw.front || ''
  exp.back = raw.back || ''
  exp.example = raw.example || ''
  exp.category = raw.category || 'Général'
  exp.type = raw.type || 'qa'
  exp.imageUrl = raw.image_url || null
  exp.audioUrl = raw.audio_url || null
  exp.layers = safeArray(raw.layers)
  exp.level = Number(raw.level || 0)
  exp.nextReview = raw.next_review ? normalizeDate(raw.next_review) : null
  exp.easeFactor = Number(raw.ease_factor || 2.5)
  exp.interval = Number(raw.interval || 1)
  exp.repetitions = Number(raw.repetitions || 0)
  exp.reviewHistory = safeArray(raw.review_history)
  exp.paused = !!raw.paused
  exp.masteryStage = raw.mastery_stage || 'discovered'
  exp.productiveUses = safeArray(raw.productive_uses)
  exp.lastProductiveUseAt = raw.last_productive_use_at || null
  exp._raw.created_at = toMs(raw.created_at)
  exp._raw.updated_at = toMs(raw.updated_at)
}

function recordToFirestore(record) {
  return {
    front: record.front || '',
    back: record.back || '',
    example: record.example || '',
    category: record.category || 'Général',
    type: record.type || 'qa',
    imageUrl: record.imageUrl || null,
    audioUrl: record.audioUrl || null,
    layers: safeArray(record.layers),
    level: Number(record.level || 0),
    nextReview: record.nextReview ? normalizeDate(record.nextReview) : null,
    createdAt: toMs(record.createdAt ?? record._raw?.created_at),
    updatedAt: toMs(record.updatedAt ?? record._raw?.updated_at),
    easeFactor: Number(record.easeFactor || 2.5),
    interval: Number(record.interval || 1),
    repetitions: Number(record.repetitions || 0),
    reviewHistory: safeArray(record.reviewHistory),
    paused: !!record.paused,
    masteryStage: record.masteryStage || 'discovered',
    productiveUses: safeArray(record.productiveUses),
    lastProductiveUseAt: record.lastProductiveUseAt || null,
  }
}

function rawToCamelCase(record) {
  return {
    front: record.front || '',
    back: record.back || '',
    example: record.example || '',
    category: record.category || 'Général',
    type: record.type || 'qa',
    imageUrl: record.image_url || null,
    audioUrl: record.audio_url || null,
    layers: safeArray(record.layers),
    level: Number(record.level || 0),
    nextReview: record.next_review ? normalizeDate(record.next_review) : null,
    createdAt: toMs(record.created_at),
    updatedAt: toMs(record.updated_at),
    easeFactor: Number(record.ease_factor || 2.5),
    interval: Number(record.interval || 1),
    repetitions: Number(record.repetitions || 0),
    reviewHistory: safeArray(record.review_history),
    paused: !!record.paused,
    masteryStage: record.mastery_stage || 'discovered',
    productiveUses: safeArray(record.productive_uses),
    lastProductiveUseAt: record.last_productive_use_at || null,
  }
}
