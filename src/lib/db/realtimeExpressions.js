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
import { db as firestoreDb, isCircuitOpen, reportFirestoreError } from '../firebase'
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
  if (isCircuitOpen()) {
    console.info('[realtime] Disjoncteur quota actif — écoute temps réel désactivée.')
    return () => {}
  }
  if (unsubscribe && currentUid === uid) return stopRealtimeExpressions

  stopRealtimeExpressions()
  currentUid = uid

  const since = Math.max(0, readLastSeen(uid) - CLOCK_SKEW_MARGIN_MS)
  const q = query(collection(firestoreDb, 'users', uid, 'expressions'), where('updatedAt', '>', since))

  console.info(`[realtime] Écoute des fiches modifiées depuis ${new Date(since).toLocaleString()}`)

  unsubscribe = onSnapshot(
    q,
    async (snapshot) => {
      // Écritures locales pas encore confirmées : elles sont déjà appliquées
      // en base, les rejouer ne ferait qu'ajouter du bruit.
      if (snapshot.metadata.hasPendingWrites) return

      const docs = []
      let maxUpdatedAt = 0
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') return // sortie du filtre ≠ suppression
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
      stopRealtimeExpressions()
    },
  )

  return stopRealtimeExpressions
}

export function stopRealtimeExpressions() {
  if (unsubscribe) {
    try { unsubscribe() } catch { /* ignore */ }
  }
  unsubscribe = null
  currentUid = null
}

export function isRealtimeActive() {
  return !!unsubscribe
}
