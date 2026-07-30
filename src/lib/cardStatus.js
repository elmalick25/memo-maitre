// src/lib/cardStatus.js
//
// Couche 6 — Unification du statut « fiche maîtrisée ».
//
// Historique : deux systèmes de maîtrise coexistent sans être réconciliés.
//   1. `level` (0-7), legacy SM-2, incrémenté à chaque révision réussie.
//   2. FSRS + `masteryStage` (discovered → recognized → recalled → produced →
//      mastered), plus fidèle à la réalité mnésique.
// Les deux servaient de filtres INDÉPENDANTS (todayReviews, composeWeakSpotSession,
// filtres facile/difficile), sans garantie de cohérence entre eux.
//
// Ce module centralise la définition dérivée, SANS migrer ni supprimer le champ
// `level` (choix conscient : la migration de données est un autre chantier).
//
// Toutes les fonctions sont PURES.

// ── Seuils configurables ──────────────────────────────────────────────────
/** Niveau legacy à partir duquel une fiche était considérée « maîtrisée ». */
export const MASTERED_LEVEL_THRESHOLD = 7;
/** Stades FSRS considérés comme une maîtrise réelle (production avérée). */
export const MASTERED_STAGES = new Set(['produced', 'mastered']);
/**
 * Intervalle FSRS (jours) au-delà duquel une fiche est de facto maîtrisée,
 * même si `level` n'a jamais été poussé à 7 (fiches créées après le passage
 * à FSRS, où `level` n'est plus le signal principal).
 */
export const MASTERED_INTERVAL_DAYS = 120;
/** Niveau à partir duquel une fiche sert de « consolidation » en session. */
export const CONSOLIDATION_LEVEL_THRESHOLD = 4;
/** Intervalle équivalent pour la consolidation côté FSRS. */
export const CONSOLIDATION_INTERVAL_DAYS = 21;

/**
 * Définition UNIQUE de « fiche maîtrisée ».
 *
 * Choix assumé (et non une disjonction hâtive) :
 *  - `level >= 7`   : verdict legacy explicite, on le respecte (les fiches
 *                     historiques n'ont pas de masteryStage fiable).
 *  - stage productif : la fiche a été RÉELLEMENT produite en contexte — c'est
 *                     le signal le plus fort dont on dispose.
 *  - interval très long : FSRS estime une rétention durable ; ne pas la traiter
 *                     comme maîtrisée reviendrait à la garder éternellement
 *                     dans les filtres « à travailler ».
 */
export function isCardMastered(card) {
  if (!card || typeof card !== 'object') return false;
  const level = Number(card.level) || 0;
  if (level >= MASTERED_LEVEL_THRESHOLD) return true;
  if (card.masteryStage && MASTERED_STAGES.has(card.masteryStage)) return true;
  const interval = Number(card.interval) || 0;
  const reps = Number(card.repetitions) || 0;
  if (reps >= 3 && interval >= MASTERED_INTERVAL_DAYS) return true;
  return false;
}

/** Inverse pratique : la fiche fait encore partie du travail quotidien. */
export function isCardActive(card) {
  return !isCardMastered(card);
}

/**
 * Fiche « solide mais pas finie » : candidate idéale à la partie
 * consolidation d'une session (on l'espace plutôt que de la marteler).
 */
export function isConsolidationCandidate(card) {
  if (!card || typeof card !== 'object') return false;
  if (isCardMastered(card)) return false;
  const level = Number(card.level) || 0;
  const interval = Number(card.interval) || 0;
  return level >= CONSOLIDATION_LEVEL_THRESHOLD || interval >= CONSOLIDATION_INTERVAL_DAYS;
}

/** Compte de fiches maîtrisées (helper d'affichage). */
export function countMasteredCards(cards) {
  return (Array.isArray(cards) ? cards : []).filter(isCardMastered).length;
}
