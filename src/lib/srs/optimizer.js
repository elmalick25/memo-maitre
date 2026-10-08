// src/lib/srs/optimizer.js
// ════════════════════════════════════════════════════════════════════════════
// Optimiseur de paramètres FSRS — apprend vos poids sur VOTRE historique.
// ════════════════════════════════════════════════════════════════════════════
// C'est le vrai différenciateur d'un moteur de révision : les poids par défaut
// sont une moyenne mondiale. Sur un historique personnel (≥ ~400 révisions)
// des poids ajustés réduisent typiquement de 10 à 25 % l'erreur de prédiction,
// donc autant de révisions inutiles en moins et d'oublis évités.
//
// Méthode : minimisation de la log-loss entre la retrievabilité prédite avant
// chaque révision et le résultat observé (rappel = 1, oubli = 0), par descente
// de gradient numérique avec Adam + projection dans les bornes admissibles.
// Tout est pur JavaScript, exécutable dans un worker, sans dépendance.
// ════════════════════════════════════════════════════════════════════════════

import {
  FSRS5_DEFAULT_W,
  GRADE,
  applyGrade,
  logLoss,
  retrievability,
} from "./fsrsCore.js";
import { diffDays, normalizeDate } from "../../utils/dateUtils.js";

/** Bornes admissibles pour chaque poids (issues du projet FSRS de référence). */
export const W_BOUNDS = Object.freeze([
  [0.001, 100], [0.001, 100], [0.001, 100], [0.001, 100],
  [1, 10], [0.001, 4], [0.001, 4], [0.001, 0.75],
  [0, 4.5], [0, 0.8], [0.001, 3.5], [0.001, 5],
  [0.001, 0.25], [0.001, 0.9], [0, 4], [0, 1],
  [1, 6], [0, 2], [0, 2],
]);

export const MIN_REVIEWS_FOR_OPTIMIZATION = 1000;

const project = (w) => w.map((v, i) => Math.min(W_BOUNDS[i][1], Math.max(W_BOUNDS[i][0], v)));

/**
 * Convertit les fiches de l'app en séquences de révision exploitables.
 * Accepte `reviewHistory: [{date, q|grade}]` (format MemoMaster).
 *
 * @returns {Array<Array<{grade:number, elapsed:number, recalled:0|1}>>}
 */
export function buildReviewSequences(cards = []) {
  const sequences = [];
  for (const card of cards) {
    const history = Array.isArray(card?.reviewHistory) ? card.reviewHistory : [];
    if (history.length < 2) continue;

    const entries = history
      .map((h) => ({
        date: normalizeDate(h?.date),
        grade: typeof h?.grade === "number" ? h.grade : qToGrade(h?.q),
      }))
      .filter((h) => h.date && h.grade >= 1 && h.grade <= 4)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (entries.length < 2) continue;

    const seq = entries.map((e, i) => ({
      grade: e.grade,
      elapsed: i === 0 ? 0 : Math.max(0, diffDays(e.date, entries[i - 1].date)),
      recalled: e.grade > GRADE.AGAIN ? 1 : 0,
    }));
    sequences.push(seq);
  }
  return sequences;
}

function qToGrade(q) {
  if (q === 0) return 1;
  if (q === 1) return 2;
  if (q === 3) return 3;
  if (q === 5) return 4;
  return 3;
}

export function countReviews(sequences) {
  return sequences.reduce((n, s) => n + Math.max(0, s.length - 1), 0);
}

/**
 * Log-loss moyenne d'un jeu de poids sur les séquences fournies.
 * La première révision de chaque fiche est ignorée : rien à prédire encore.
 */
export function evaluateWeights(sequences, w) {
  let loss = 0;
  let n = 0;
  for (const seq of sequences) {
    let memory = { stability: null, difficulty: null, state: "new" };
    for (let i = 0; i < seq.length; i++) {
      const step = seq[i];
      if (i > 0 && step.elapsed > 0 && memory.stability > 0) {
        loss += logLoss(retrievability(step.elapsed, memory.stability), step.recalled);
        n++;
      }
      memory = applyGrade(memory, step.grade, step.elapsed, w);
    }
  }
  return n > 0 ? loss / n : Number.POSITIVE_INFINITY;
}

/**
 * Optimise les poids par Adam sur gradient numérique (différences centrées).
 *
 * @param {Array} sequences  sortie de buildReviewSequences()
 * @param {Object} opts      { iterations, learningRate, initialWeights, onProgress }
 * @returns {{weights:number[], baselineLoss:number, loss:number, improvement:number,
 *            reviews:number, converged:boolean}}
 */
export function optimizeWeights(sequences, opts = {}) {
  const {
    iterations = 60,
    learningRate = 0.05,
    initialWeights = FSRS5_DEFAULT_W,
    onProgress = null,
  } = opts;

  const reviews = countReviews(sequences);
  const baselineLoss = evaluateWeights(sequences, FSRS5_DEFAULT_W);

  if (reviews < MIN_REVIEWS_FOR_OPTIMIZATION) {
    return {
      weights: [...FSRS5_DEFAULT_W],
      baselineLoss,
      loss: baselineLoss,
      improvement: 0,
      reviews,
      converged: false,
      reason: "not-enough-data",
    };
  }

  let w = project([...initialWeights]);
  let best = { w: [...w], loss: evaluateWeights(sequences, w) };
  const m = new Array(w.length).fill(0);
  const v = new Array(w.length).fill(0);
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  let stagnation = 0;

  for (let it = 1; it <= iterations; it++) {
    const grad = new Array(w.length).fill(0);
    for (let i = 0; i < w.length; i++) {
      const span = W_BOUNDS[i][1] - W_BOUNDS[i][0];
      const h = Math.max(1e-4, span * 1e-3);
      const wp = [...w];
      const wm = [...w];
      wp[i] = Math.min(W_BOUNDS[i][1], w[i] + h);
      wm[i] = Math.max(W_BOUNDS[i][0], w[i] - h);
      const denom = wp[i] - wm[i];
      grad[i] = denom > 0 ? (evaluateWeights(sequences, wp) - evaluateWeights(sequences, wm)) / denom : 0;
    }

    for (let i = 0; i < w.length; i++) {
      m[i] = beta1 * m[i] + (1 - beta1) * grad[i];
      v[i] = beta2 * v[i] + (1 - beta2) * grad[i] * grad[i];
      const mHat = m[i] / (1 - Math.pow(beta1, it));
      const vHat = v[i] / (1 - Math.pow(beta2, it));
      const span = W_BOUNDS[i][1] - W_BOUNDS[i][0];
      w[i] -= learningRate * span * 0.02 * (mHat / (Math.sqrt(vHat) + eps));
    }
    w = project(w);

    const loss = evaluateWeights(sequences, w);
    if (loss < best.loss - 1e-6) {
      best = { w: [...w], loss };
      stagnation = 0;
    } else {
      stagnation++;
    }
    onProgress?.({ iteration: it, iterations, loss, bestLoss: best.loss });
    if (stagnation >= 8) break;
  }

  return {
    weights: best.w,
    baselineLoss,
    loss: best.loss,
    improvement: baselineLoss > 0 ? (baselineLoss - best.loss) / baselineLoss : 0,
    reviews,
    converged: true,
  };
}

/**
 * Rapport de calibration : le moteur dit-il la vérité ?
 * Compare la rétention prédite à la rétention observée, par tranches de 10 %.
 * Un moteur bien calibré a un écart moyen (ECE) < 0,03.
 */
export function calibrationReport(sequences, w = FSRS5_DEFAULT_W) {
  const bins = Array.from({ length: 10 }, (_, i) => ({
    from: i / 10,
    to: (i + 1) / 10,
    predicted: 0,
    observed: 0,
    count: 0,
  }));
  let n = 0;
  let sumPredicted = 0;
  let sumObserved = 0;

  for (const seq of sequences) {
    let memory = { stability: null, difficulty: null, state: "new" };
    for (let i = 0; i < seq.length; i++) {
      const step = seq[i];
      if (i > 0 && step.elapsed > 0 && memory.stability > 0) {
        const p = retrievability(step.elapsed, memory.stability);
        const bin = bins[Math.min(9, Math.floor(p * 10))];
        bin.predicted += p;
        bin.observed += step.recalled;
        bin.count++;
        sumPredicted += p;
        sumObserved += step.recalled;
        n++;
      }
      memory = applyGrade(memory, step.grade, step.elapsed, w);
    }
  }

  const filled = bins
    .filter((b) => b.count > 0)
    .map((b) => ({
      range: `${Math.round(b.from * 100)}–${Math.round(b.to * 100)} %`,
      predicted: b.predicted / b.count,
      observed: b.observed / b.count,
      count: b.count,
    }));

  const ece = n > 0 ? filled.reduce((s, b) => s + (b.count / n) * Math.abs(b.predicted - b.observed), 0) : 0;

  return {
    reviews: n,
    predictedRetention: n ? sumPredicted / n : 0,
    observedRetention: n ? sumObserved / n : 0,
    expectedCalibrationError: ece,
    logLoss: evaluateWeights(sequences, w),
    bins: filled,
    verdict: n < 100 ? "insufficient-data" : ece < 0.03 ? "well-calibrated" : ece < 0.07 ? "acceptable" : "miscalibrated",
  };
}

/**
 * Rétention cible optimale : celle qui maximise la mémorisation par minute.
 * Une cible trop haute (98 %) fait exploser la charge quotidienne, trop basse
 * (80 %) fait perdre les fiches. On simule le coût/bénéfice sur l'historique.
 */
export function suggestTargetRetention(sequences, w = FSRS5_DEFAULT_W) {
  const candidates = [0.83, 0.85, 0.87, 0.9, 0.92, 0.94];
  let bestChoice = { retention: 0.9, knowledgePerReview: 0 };

  for (const target of candidates) {
    let totalReviews = 0;
    let retainedDays = 0;
    for (const seq of sequences) {
      let memory = { stability: null, difficulty: null, state: "new" };
      for (const step of seq) {
        memory = applyGrade(memory, step.grade, step.elapsed, w);
        totalReviews++;
        // Jours pendant lesquels la fiche reste au-dessus de la cible.
        retainedDays += Math.max(1, (memory.stability / (Math.pow(0.9, -2) - 1)) * (Math.pow(target, -2) - 1));
      }
    }
    const score = totalReviews > 0 ? retainedDays / totalReviews : 0;
    if (score > bestChoice.knowledgePerReview) {
      bestChoice = { retention: target, knowledgePerReview: score };
    }
  }
  return bestChoice;
}

