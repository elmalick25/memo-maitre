// src/lib/srs/fsrsCore.js
// ════════════════════════════════════════════════════════════════════════════
// FSRS-5 — implémentation de référence, pure et sans dépendance applicative.
// ════════════════════════════════════════════════════════════════════════════
// Ce module ne connaît ni les fiches de l'app, ni les dates, ni l'anglais.
// Il expose uniquement le modèle mémoire (DSR : Difficulty / Stability /
// Retrievability) tel que défini par FSRS-5, afin qu'il puisse être testé,
// optimisé et simulé indépendamment du reste du code.
//
// Corrections apportées par rapport à l'implémentation précédente :
//   1. Mise à jour de la difficulté avec amortissement linéaire ΔD·(10−D)/9
//      et retour à la moyenne vers D₀(4) — sans quoi la difficulté saturait
//      à 10 et bloquait toute croissance de stabilité.
//   2. Stabilité intra-journalière (w₁₇, w₁₈), jusqu'ici ignorée : réviser
//      deux fois le même jour ne produisait aucun gain mesuré.
//   3. Machine à états explicite (new → learning → review → relearning).
//      Auparavant un échec remettait `repetitions` à 0, ce qui faisait
//      ré-initialiser la mémoire de la fiche à la révision suivante : tout
//      l'historique de stabilité était détruit à chaque oubli.
//   4. Courbe d'oubli paramétrable (decay), conforme à FSRS-5/6.
// ════════════════════════════════════════════════════════════════════════════

/** Poids FSRS-5 par défaut (jeu de référence open-source). */
export const FSRS5_DEFAULT_W = Object.freeze([
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616,
  0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
]);

export const DECAY = -0.5;
export const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81

export const STATES = Object.freeze({
  NEW: "new",
  LEARNING: "learning",
  REVIEW: "review",
  RELEARNING: "relearning",
});

export const GRADE = Object.freeze({ AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const S_MIN = 0.01;
const S_MAX = 36500;

/** Retrievabilité R(t,S) : probabilité de rappel après t jours. */
export function retrievability(t, S) {
  if (!(S > 0)) return 0;
  if (t <= 0) return 1;
  return Math.pow(1 + FACTOR * (t / S), DECAY);
}

/** Intervalle atteignant exactement la rétention cible pour une stabilité S. */
export function intervalForRetention(S, targetRetention = 0.9) {
  if (!(S > 0)) return 1;
  const r = clamp(Number(targetRetention) || 0.9, 0.7, 0.99);
  return (S / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
}

/** Stabilité initiale S₀(g) après la toute première réponse. */
export function initialStability(grade, w = FSRS5_DEFAULT_W) {
  const g = clamp(Math.round(grade), 1, 4);
  return clamp(w[g - 1], S_MIN, S_MAX);
}

/** Difficulté initiale D₀(g) = w₄ − e^{w₅(g−1)} + 1. */
export function initialDifficulty(grade, w = FSRS5_DEFAULT_W) {
  const g = clamp(Math.round(grade), 1, 4);
  return clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);
}

/**
 * Difficulté suivante — FSRS-5 complet.
 * ΔD = −w₆(g−3) ; D' = D + ΔD·(10−D)/9 ; D'' = w₇·D₀(4) + (1−w₇)·D'
 */
export function nextDifficulty(D, grade, w = FSRS5_DEFAULT_W) {
  const g = clamp(Math.round(grade), 1, 4);
  const deltaD = -w[6] * (g - 3);
  const damped = D + deltaD * ((10 - D) / 9);
  const reverted = w[7] * initialDifficulty(4, w) + (1 - w[7]) * damped;
  return clamp(reverted, 1, 10);
}

/** Stabilité après un rappel réussi (g ≥ 2). */
export function stabilityAfterRecall(D, S, R, grade, w = FSRS5_DEFAULT_W) {
  const g = clamp(Math.round(grade), 2, 4);
  const hardPenalty = g === GRADE.HARD ? w[15] : 1;
  const easyBonus = g === GRADE.EASY ? w[16] : 1;
  const r = clamp(R, 1e-6, 1);
  const gain =
    Math.exp(w[8]) *
    (11 - D) *
    Math.pow(S, -w[9]) *
    (Math.exp((1 - r) * w[10]) - 1) *
    hardPenalty *
    easyBonus;
  return clamp(S * (1 + gain), S, S_MAX);
}

/** Stabilité après un oubli (g = 1). Ne peut jamais dépasser S. */
export function stabilityAfterLapse(D, S, R, w = FSRS5_DEFAULT_W) {
  const r = clamp(R, 1e-6, 1);
  const sMin = w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
  return clamp(Math.min(sMin, S), S_MIN, S_MAX);
}

/** Stabilité après une re-révision le même jour : S·e^{w₁₇(g−3+w₁₈)}. */
export function stabilityShortTerm(S, grade, w = FSRS5_DEFAULT_W) {
  const g = clamp(Math.round(grade), 1, 4);
  return clamp(S * Math.exp(w[17] * (g - 3 + w[18])), S_MIN, S_MAX);
}

/**
 * Cœur du moteur : applique une réponse à un état mémoire.
 *
 * @param {{stability:number|null, difficulty:number|null, state:string}} memory
 * @param {number} grade   1 Again · 2 Hard · 3 Good · 4 Easy
 * @param {number} elapsed jours écoulés depuis la dernière révision
 * @param {number[]} w     poids FSRS
 * @returns {{stability:number, difficulty:number, state:string, retrievability:number}}
 */
export function applyGrade(memory, grade, elapsed, w = FSRS5_DEFAULT_W) {
  const g = clamp(Math.round(grade), 1, 4);
  const t = Math.max(0, Number(elapsed) || 0);
  const hasMemory = Number(memory?.stability) > 0 && Number(memory?.difficulty) > 0;

  if (!hasMemory) {
    return {
      stability: initialStability(g, w),
      difficulty: initialDifficulty(g, w),
      state: g === GRADE.AGAIN ? STATES.LEARNING : STATES.REVIEW,
      retrievability: 1,
    };
  }

  const S = clamp(Number(memory.stability), S_MIN, S_MAX);
  const D = clamp(Number(memory.difficulty), 1, 10);
  const R = retrievability(t, S);
  const difficulty = nextDifficulty(D, g, w);

  // Même journée : on n'a aucune information d'oubli, on applique le modèle
  // court terme au lieu de faire semblant que R = 1 signifie « rappel dur ».
  if (t === 0) {
    return {
      stability: stabilityShortTerm(S, g, w),
      difficulty,
      state: g === GRADE.AGAIN ? STATES.RELEARNING : memory.state || STATES.REVIEW,
      retrievability: R,
    };
  }

  if (g === GRADE.AGAIN) {
    return {
      stability: stabilityAfterLapse(difficulty, S, R, w),
      difficulty,
      state: STATES.RELEARNING,
      retrievability: R,
    };
  }

  return {
    stability: stabilityAfterRecall(difficulty, S, R, g, w),
    difficulty,
    state: STATES.REVIEW,
    retrievability: R,
  };
}

/**
 * Dispersion déterministe de l'intervalle (anti-« tsunami » de révisions).
 * Le hasard est dérivé de l'identifiant de la fiche ET du cycle courant
 * (date + nombre de rappels) : déterministe pour une révision donnée, mais
 * renouvelé à chaque cycle, donc sans biais cumulatif permanent.
 */
export function fuzzInterval(interval, seedKey = "") {
  const i = Math.round(Number(interval) || 0);
  if (i < 3) return Math.max(0, i);

  // Fenêtres de fuzz FSRS officielles.
  const ranges = [
    { start: 2.5, end: 7, factor: 0.15 },
    { start: 7, end: 20, factor: 0.1 },
    { start: 20, end: Infinity, factor: 0.05 },
  ];
  let delta = 1;
  for (const r of ranges) {
    delta += r.factor * Math.max(0, Math.min(i, r.end) - r.start);
  }
  const min = Math.max(2, Math.round(i - delta));
  const max = Math.round(i + delta);

  let h = 2166136261;
  const key = String(seedKey);
  for (let n = 0; n < key.length; n++) {
    h ^= key.charCodeAt(n);
    h = Math.imul(h, 16777619);
  }
  const unit = ((h >>> 0) % 100000) / 100000;
  return clamp(Math.round(min + unit * (max - min)), min, Math.max(min, max));
}

/** Vraisemblance logarithmique d'une prédiction (pour l'optimiseur). */
export function logLoss(predicted, actual) {
  const p = clamp(predicted, 1e-6, 1 - 1e-6);
  return -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
}
