// src/lib/db/realtimeExpressions.js
//
// ═══════════════════════════════════════════════════════════════════════════
// TEMPS RÉEL MULTI-APPAREILS — écoute incrémentale, quota-friendly
// ═══════════════════════════════════════════════════════════════════════════
//
// Avant : le seul canal « temps réel » était un document sentinelle
// (`sync_signal/latest`) qui déclenchait un cycle de sync complet. Ce cycle
// était étranglé (throttle 5 s, réconciliation 1×/30 min, disjoncteur quota),
// et sa détection de divergence ne regardait QUE le NOMBRE de fiches — or
// réviser une fiche ne change pas ce nombre. Résultat : le téléphone passait
// à 31 fiches dues, le PC restait à 34, même après rechargement.
//
// Ici : un `onSnapshot` sur la collection des fiches, filtré sur
// `updatedAt > lastSeen`. Firestore ne facture QUE les documents réellement
// modifiés (3 fiches révisées = 3 lectures), et la propagation est immédiate
// — pas de polling, pas de réconciliation complète. C'est à la fois le plus
// rapide ET le moins cher.
//
// Coût typique d'une journée : (nb de fiches révisées) lectures par appareil
// secondaire + 1 lecture d'attachement. Sans commune mesure avec les
// réconciliations complètes (N lectures) déclenchées auparavant.

import { Q } from '@nozbe/watermelondb'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { database } from './index'
import { db as firestoreDb, reportFirestoreError } from '../firebase'
import { resolveConflict } from './conflictResolution'
import { applyRawToExpression, firebaseDocToRaw, markSynced, toMs } from './expressionMapper'

const LAST_SEEN_PREFIX = 'memo_rt_last_seen_'
// Marge anti-dérive d'horloge : les `updatedAt` sont écrits avec l'horloge de
// l'appareil émetteur. Sans marge, une fiche révisée sur un téléphone dont
// l'horloge retarde de 2 min passerait sous le filtre et serait invisible.
const CLOCK_SKEW_MARGIN_MS = 5 * 60 * 1000
// Premier attachement : on ne remonte que 24 h en arrière (le reste est déjà
// couvert par la réconciliation autoritaire du démarrage) → attachement quasi
// gratuit au lieu d'une relecture de toute la collection.
const FIRST_ATTACH_LOOKBACK_MS = 24 * 60 * 60 * 1000

const lastSeenKey = (uid) => `${LAST_SEEN_PREFIX}${uid}`

function readLastSeen(uid) {
  try {
    const raw = parseInt(localStorage.getItem(lastSeenKey(uid)) || '0', 10)
    if (Number.isFinite(raw) && raw > 0) return raw
  } catch { /* ignore */ }
  return Date.now() - FIRST_ATTACH_LOOKBACK_MS
}

function writeLastSeen(uid, value) {
  try { localStorage.setItem(lastSeenKey(uid), String(value)) } catch { /* ignore */ }
}

/**
 * Applique un lot de documents distants dans WatermelonDB en respectant la
 * règle de conflit unique, puis marque les enregistrements comme synchronisés
 * (sinon WatermelonDB les considère « modifiés localement » et les repousse au
 * serveur, ce qui ressuscitait l'ancienne valeur — la boucle infernale).
 *
 * @returns {Promise<number>} nombre d'enregistrements réellement modifiés.
 */
export async function applyRemoteExpressionDocs(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return 0

  const expressions = database.collections.get('expressions')
  const ids = docs.map(d => d.id).filter(Boolean)
  const localById = new Map()
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400)
    const records = await expressions.query(Q.where('id', Q.oneOf(chunk))).fetch()
    records.forEach(r => localById.set(r.id, r))
  }

  const ops = []
  for (const entry of docs) {
    const { id, data } = entry
    if (!id || !data) continue
    const local = localById.get(id)

    if (data._deleted) {
      if (local) ops.push(local.prepareMarkAsDeleted())
      continue
    }

    const raw = firebaseDocToRaw({ id, data: () => data })

    if (!local) {
      // Fiche créée sur un autre appareil : elle vient du serveur, donc elle
      // est déjà « synchronisée » — inutile de la repousser.
      ops.push(markSynced(expressions.prepareCreate(exp => applyRawToExpression(exp, raw))))
      continue
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
      ops.push(markSynced(local.prepareUpdate(exp => applyRawToExpression(exp, raw))))
    }
  }

  if (ops.length === 0) return 0

  await database.write(async () => {
    for (let i = 0; i < ops.length; i += 450) {
      await database.batch(...ops.slice(i, i + 450))
    }
  })
  return ops.length
}

let unsubscribe = null
let currentUid = null

/**
 * Démarre l'écoute temps réel des fiches pour un utilisateur.
 * Idempotent : un second appel avec le même uid ne recrée pas de listener.
 *
 * @returns {() => void} fonction d'arrêt.
 */
export function startRealtimeExpressions(uid, { onApplied } = {}) {
  if (!uid) return () => {}
  // Le disjoncteur quota ne coupe plus le temps réel : Firestore ne facture ici
  // que les fiches RÉELLEMENT modifiées (3 révisions = 3 lectures). Couper ce
  // canal était le pire des deux mondes : on économisait ~rien et l'appareil
  // restait figé sur un compteur périmé.
  if (unsubscribe && currentUid === uid) return stopRealtimeExpressions

  stopRealtimeExpressions()
  currentUid = uid

  const since = Math.max(0, readLastSeen(uid) - CLOCK_SKEW_MARGIN_MS)
  const q = query(collection(firestoreDb, 'users', uid, 'expressions'), where('updatedAt', '>', since))

  console.info(`[realtime] Écoute des fiches modifiées depuis ${new Date(since).toLocaleString()}`)
  retryAttempt = 0

  unsubscribe = onSnapshot(
    q,
    async (snapshot) => {
      // ⚠️ FIX MAJEUR (c'était une perte de données silencieuse) :
      // avant, un `if (snapshot.metadata.hasPendingWrites) return` jetait
      // l'instantané ENTIER dès que CET appareil avait une écriture en attente.
      // Or Firestore marque tout l'instantané, y compris les fiches modifiées
      // par l'AUTRE appareil : celles-ci étaient donc ignorées, et comme elles
      // étaient désormais en cache local, `docChanges()` ne les représentait
      // plus jamais. Le PC ne recevait littéralement jamais les 3 révisions du
      // téléphone. On filtre maintenant DOCUMENT PAR DOCUMENT.
      const docs = []
      let maxUpdatedAt = 0
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') return // sortie du filtre ≠ suppression
        // Echo de notre propre écriture non confirmée : déjà appliquée en base.
        if (change.doc.metadata.hasPendingWrites) return
        const data = change.doc.data() || {}
        docs.push({ id: change.doc.id, data })
        const ts = toMs(data.updatedAt, 0)
        if (ts > maxUpdatedAt) maxUpdatedAt = ts
      })

      if (docs.length === 0) return

      try {
        const applied = await applyRemoteExpressionDocs(docs)
        if (maxUpdatedAt > 0) writeLastSeen(uid, maxUpdatedAt)
        if (applied > 0) {
          console.info(`[realtime] ${applied} fiche(s) mise(s) à jour depuis un autre appareil.`)
          if (typeof window !== 'undefined') {
            try { window.dispatchEvent(new CustomEvent('cards_synced')) } catch { /* ignore */ }
          }
          if (typeof onApplied === 'function') onApplied(applied)
        }
      } catch (e) {
        reportFirestoreError(e, 'realtimeExpressions:apply')
      }
    },
    (err) => {
      reportFirestoreError(err, 'realtimeExpressions')
      // Avant : `stopRealtimeExpressions()` — une seule erreur réseau (tunnel,
      // veille du PC, wifi qui saute) tuait le temps réel pour toute la
      // session, et l'appareil restait figé sur son ancien compteur. On
      // reprogramme maintenant une reconnexion avec un délai croissant.
      scheduleRealtimeRetry(uid, { onApplied })
    },
  )

  return stopRealtimeExpressions
}

// ─── Reconnexion automatique (délai croissant, plafonné à 5 min) ─────────────
let retryTimer = null
let retryAttempt = 0

function scheduleRealtimeRetry(uid, opts) {
  if (retryTimer) return
  const delay = Math.min(5 * 60 * 1000, 5000 * Math.pow(2, retryAttempt))
  retryAttempt += 1
  console.info(`[realtime] Reconnexion dans ${Math.round(delay / 1000)}s (tentative ${retryAttempt}).`)
  retryTimer = setTimeout(() => {
    retryTimer = null
    unsubscribe = null
    currentUid = null
    startRealtimeExpressions(uid, opts)
  }, delay)
}

/**
 * Vérifie que l'écoute est bien vivante et la relance sinon.
 * Appelée au retour de veille / au retour d'onglet : c'est ce qui garantit
 * qu'un PC réveillé après plusieurs heures récupère l'état à jour.
 */
export function ensureRealtimeExpressions(uid, opts = {}) {
  if (!uid) return
  if (unsubscribe && currentUid === uid) return
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  retryAttempt = 0
  startRealtimeExpressions(uid, opts)
}

export function stopRealtimeExpressions() {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (unsubscribe) {
    try { unsubscribe() } catch { /* ignore */ }
  }
  unsubscribe = null
  currentUid = null
}

export function isRealtimeActive() {
  return !!unsubscribe
}
