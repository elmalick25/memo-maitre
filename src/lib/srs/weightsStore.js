// src/lib/srs/weightsStore.js
// ════════════════════════════════════════════════════════════════════════════
// Persistance et activation des poids FSRS personnalisés.
// ════════════════════════════════════════════════════════════════════════════
// L'optimisation est coûteuse (quelques secondes de calcul) : on la lance
// rarement, on stocke le résultat, et on l'active au démarrage de l'app.

import { FSRS5_DEFAULT_W } from "./fsrsCore.js";
import {
  MIN_REVIEWS_FOR_OPTIMIZATION,
  buildReviewSequences,
  calibrationReport,
  countReviews,
  optimizeWeights,
  suggestTargetRetention,
} from "./optimizer.js";
import { setActiveWeights, setActiveTargetRetention } from "../fsrs.js";

export const WEIGHTS_STORAGE_KEY = "fsrs_personal_weights_v1";
/** On ne ré-optimise pas plus d'une fois par semaine. */
export const REOPTIMIZE_AFTER_DAYS = 7;
export const REOPTIMIZE_AFTER_REVIEWS = 300;

const emptyProfile = () => ({
  weights: [...FSRS5_DEFAULT_W],
  targetRetention: 0.9,
  optimizedAt: null,
  reviewsAtOptimization: 0,
  improvement: 0,
  calibration: null,
});

/** Charge le profil et l'active. `storage` = { get, set } (async). */
export async function loadAndActivateWeights(storage) {
  try {
    const saved = (await storage?.get?.(WEIGHTS_STORAGE_KEY)) || null;
    const profile = saved && Array.isArray(saved.weights) ? saved : emptyProfile();
    setActiveWeights(profile.weights);
    setActiveTargetRetention(profile.targetRetention);
    return profile;
  } catch {
    return emptyProfile();
  }
}

/** Faut-il relancer une optimisation ? */
export function shouldReoptimize(profile, cards = []) {
  const reviews = countReviews(buildReviewSequences(cards));
  if (reviews < MIN_REVIEWS_FOR_OPTIMIZATION) return { due: false, reviews, reason: "not-enough-data" };
  if (!profile?.optimizedAt) return { due: true, reviews, reason: "never-optimized" };

  const ageDays = (Date.now() - new Date(profile.optimizedAt).getTime()) / 86400000;
  const newReviews = reviews - (profile.reviewsAtOptimization || 0);
  if (ageDays >= REOPTIMIZE_AFTER_DAYS && newReviews >= REOPTIMIZE_AFTER_REVIEWS) {
    return { due: true, reviews, reason: "new-data" };
  }
  return { due: false, reviews, reason: "up-to-date" };
}

/**
 * Lance l'optimisation complète sur l'historique, persiste et active le résultat.
 * @returns {{applied:boolean, profile:Object, report:Object}}
 */
export async function runOptimization(cards, storage, opts = {}) {
  const sequences = buildReviewSequences(cards);
  const result = optimizeWeights(sequences, opts);

  if (!result.converged) {
    return {
      applied: false,
      profile: emptyProfile(),
      report: { ...result, calibration: calibrationReport(sequences) },
    };
  }

  const calibration = calibrationReport(sequences, result.weights);
  const retention = suggestTargetRetention(sequences, result.weights);

  const profile = {
    weights: result.weights,
    targetRetention: retention.retention,
    optimizedAt: new Date().toISOString(),
    reviewsAtOptimization: result.reviews,
    improvement: result.improvement,
    calibration,
  };

  setActiveWeights(profile.weights);
  setActiveTargetRetention(profile.targetRetention);
  await storage?.set?.(WEIGHTS_STORAGE_KEY, profile);

  return { applied: true, profile, report: { ...result, calibration } };
}

export async function resetWeights(storage) {
  const profile = emptyProfile();
  setActiveWeights(profile.weights);
  setActiveTargetRetention(profile.targetRetention);
  await storage?.set?.(WEIGHTS_STORAGE_KEY, profile);
  return profile;
}
