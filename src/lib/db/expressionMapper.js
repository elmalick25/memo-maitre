// src/lib/db/expressionMapper.js
//
// Conversions Firestore ⇄ WatermelonDB, extraites de sync.js pour être
// partagées avec le listener temps réel (realtimeExpressions.js) sans
// dupliquer la logique de mapping — une divergence entre les deux copies
// aurait suffi à recréer le bug de compteur désynchronisé.

import { normalizeDate } from '../../utils/dateUtils.js'

export const toMs = (value, fallback = Date.now()) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()
  if (value && typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

export const safeArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  return []
}

export const stripUndefined = (value) => JSON.parse(JSON.stringify(value))

/**
 * Marque un enregistrement comme « déjà synchronisé ».
 *
 * ⚠️ C'EST LE FIX CENTRAL DU BUG « le PC reste à 34 ».
 * WatermelonDB conserve, pour chaque enregistrement, la liste des colonnes
 * modifiées localement (`_changed`). Lors d'un pull, les valeurs distantes de
 * ces colonnes sont IGNORÉES puis ré-poussées au serveur : l'appareil en
 * retard écrasait donc la révision faite sur l'autre appareil, en boucle.
 * Quand une donnée vient du serveur et gagne le conflit, elle EST la vérité :
 * on efface le drapeau local pour qu'elle ne soit jamais renvoyée.
 */
export function markSynced(record) {
  try {
    if (record?._raw) {
      record._raw._status = 'synced'
      record._raw._changed = ''
    }
  } catch { /* ignore */ }
  return record
}

/** Document Firestore → raw WatermelonDB (snake_case). */
export function firebaseDocToRaw(docSnap) {
  const data = typeof docSnap?.data === 'function' ? (docSnap.data() || {}) : (docSnap || {})
  const id = docSnap?.id ?? data.id
  const updatedAt = toMs(data.updatedAt, Date.now())
  return {
    id,
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
    paused: !!data.paused,
    mastery_stage: data.masteryStage || null,
    productive_uses: JSON.stringify(safeArray(data.productiveUses)),
    last_productive_use_at: data.lastProductiveUseAt ? toMs(data.lastProductiveUseAt) : null,
  }
}

/** raw WatermelonDB → modèle WatermelonDB. */
export function applyRawToExpression(exp, raw) {
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

/** Modèle WatermelonDB → document Firestore. */
export function recordToFirestore(record) {
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

/** raw WatermelonDB (snake_case) → document Firestore (camelCase). */
export function rawToCamelCase(record) {
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
