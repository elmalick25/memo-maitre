// src/lib/db/conflictResolution.js
//
// ═══════════════════════════════════════════════════════════════════════════
// RÉSOLUTION DE CONFLIT — source unique de vérité
// ═══════════════════════════════════════════════════════════════════════════
//
// Avant : la logique « qui gagne ? » était dupliquée à 3 endroits (pullChanges,
// reconcileAllExpressions, et rien du tout côté temps réel). Les trois copies
// divergeaient et aucune n'était testée → un appareil pouvait garder une fiche
// périmée (34 fiches à réviser alors qu'un autre appareil en montrait 31).
//
// Règle unique, ordonnée du signal le plus fiable au moins fiable :
//   1. L'historique de révision le plus LONG gagne (une révision ne se
//      « dé-révise » jamais : c'est un compteur monotone, insensible au
//      décalage d'horloge entre appareils).
//   2. À égalité d'historique : le nombre de répétitions le plus élevé gagne.
//   3. À égalité : la prochaine révision la plus LOINTAINE gagne (progression
//      SRS plus avancée), avec une tolérance d'un jour.
//   4. En dernier recours seulement : l'horodatage le plus récent (tolérance
//      de 1 s pour absorber les micro-écarts d'horloge).
//
// Toutes les fonctions sont PURES → testables sans Firebase ni WatermelonDB.

/** Longueur d'un historique de révision, quelle que soit sa forme (array ou JSON). */
export function historyLength(value) {
  if (Array.isArray(value)) return value.length
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  }
  return 0
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const toTime = (v) => {
  if (!v) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v instanceof Date) return v.getTime()
  if (typeof v?.toMillis === 'function') return v.toMillis()
  const parsed = Date.parse(v)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Tolérance d'un jour sur `nextReview` avant de considérer une avance réelle. */
const NEXT_REVIEW_TOLERANCE_MS = 86400000
/** Tolérance d'une seconde sur les horodatages (dérive d'horloge / arrondis). */
const UPDATED_AT_TOLERANCE_MS = 1000

/**
 * Compare deux états d'une même fiche.
 *
 * @param {object} remote - { reviewHistory, repetitions, nextReview, updatedAt }
 * @param {object} local  - même forme
 * @returns {'remote'|'local'|'equal'} qui doit gagner.
 */
export function resolveConflict(remote, local) {
  if (!remote) return 'local'
  if (!local) return 'remote'

  const rHist = historyLength(remote.reviewHistory)
  const lHist = historyLength(local.reviewHistory)
  if (rHist !== lHist) return rHist > lHist ? 'remote' : 'local'

  const rReps = num(remote.repetitions)
  const lReps = num(local.repetitions)
  if (rReps !== lReps) return rReps > lReps ? 'remote' : 'local'

  const rNext = toTime(remote.nextReview)
  const lNext = toTime(local.nextReview)
  if (rNext > lNext + NEXT_REVIEW_TOLERANCE_MS) return 'remote'
  if (lNext > rNext + NEXT_REVIEW_TOLERANCE_MS) return 'local'

  const rUp = toTime(remote.updatedAt)
  const lUp = toTime(local.updatedAt)
  if (rUp > lUp + UPDATED_AT_TOLERANCE_MS) return 'remote'
  if (lUp > rUp + UPDATED_AT_TOLERANCE_MS) return 'local'

  return 'equal'
}
