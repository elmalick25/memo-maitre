// src/lib/fsrs.js
import { addDays, today } from "../utils/dateUtils.js";

const FSRS_PARAMS = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589, 1.5330,
  0.1544, 1.0071, 1.9395, 0.1100, 0.2900, 2.2700, 0.1500, 2.9898, 0.5100, 0.3400
];
const FSRS_DECAY = -0.5;
const FSRS_FACTOR = 19 / 81;
const TARGET_R = 0.9;

// ── Phase 2 : plafond d'intervalle tant que la fiche n'est pas "produced" ───
// Tant qu'une fiche n'a pas atteint au moins le stage "produced" (usage actif
// prouvé en contexte réel), on plafonne l'intervalle affiché à 3 jours — même
// si stability/difficulty calculées suggéreraient beaucoup plus. Ces valeurs
// (stability, difficulty) restent intactes : seul `interval` (et donc
// `nextReview`) est plafonné pour éviter qu'une fiche "connue par cœur mais
// jamais utilisée" ne disparaisse des révisions pendant des mois.
export const PRE_PRODUCTION_INTERVAL_CAP_DAYS = 3;
const PRODUCTIVE_STAGES = new Set(['produced', 'mastered']);

function shouldCapInterval(masteryStage) {
  if (!masteryStage) return true; // pas de stage connu → on protège par défaut
  return !PRODUCTIVE_STAGES.has(masteryStage);
}

export function fsrsR(t, S) {
  return Math.pow(1 + FSRS_FACTOR * (t / S), FSRS_DECAY);
}

function fsrsNextInterval(S) {
  const t = S * (Math.pow(TARGET_R, 1 / FSRS_DECAY) - 1) / FSRS_FACTOR;
  return Math.max(1, Math.round(t));
}

function toFSRSGrade(q) {
  if (q === 0) return 1;
  if (q === 1) return 2;
  if (q === 3) return 3;
  if (q === 5) return 4;
  return 3;
}

function fsrsInitStability(grade) { return FSRS_PARAMS[grade - 1]; }

function fsrsInitDifficulty(grade) {
  const w = FSRS_PARAMS;
  return Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * (grade - 1)) + 1));
}

function fsrsNextDifficulty(D, grade) {
  const w = FSRS_PARAMS;
  const deltaD = -w[13] * (grade - 3);
  return Math.min(10, Math.max(1, D + deltaD * ((10 - D) / 9)));
}

function fsrsNextStabilityRecall(D, S, R, grade) {
  const w = FSRS_PARAMS;
  const hardPenalty = grade === 2 ? w[15] : 1;
  const easyBonus = grade === 4 ? w[16] : 1;
  return S * (1 + Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) * (Math.exp((1 - R) * w[10]) - 1) * hardPenalty * easyBonus);
}

function fsrsNextStabilityForgot(D, S, R) {
  const w = FSRS_PARAMS;
  return w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp((1 - R) * w[14]);
}

export function fsrs(card, q) {
  const grade = toFSRSGrade(q);
  let { stability = null, difficulty = null, interval = 1, repetitions = 0, elapsedDays = null, easeFactor = null, masteryStage = null } = card;
  const t = elapsedDays ?? interval;

  // Migration des anciennes fiches SM-2 (qui ont des répétitions mais pas de stabilité FSRS)
  if (stability === null && repetitions > 0) {
    stability = Math.max(0.1, interval);
    difficulty = easeFactor ? Math.max(1, Math.min(10, 11 - (easeFactor - 1.3) * 4.16)) : 5;
  }

  if (stability === null || repetitions === 0) {
    stability = fsrsInitStability(grade);
    difficulty = fsrsInitDifficulty(grade);
    if (grade === 1) { interval = 0; repetitions = 0; }
    else { interval = fsrsNextInterval(stability); repetitions = 1; }
  } else {
    const R = fsrsR(t, stability);
    difficulty = fsrsNextDifficulty(difficulty, grade);
    if (grade === 1) {
      stability = Math.max(0.1, fsrsNextStabilityForgot(difficulty, stability, R));
      interval = 0; repetitions = 0;
    } else {
      stability = Math.max(stability, fsrsNextStabilityRecall(difficulty, stability, R, grade));
      interval = fsrsNextInterval(stability); repetitions++;
    }
  }

  // Plafond pré-production : n'altère PAS stability/difficulty, uniquement
  // l'intervalle effectif utilisé pour nextReview.
  if (interval > PRE_PRODUCTION_INTERVAL_CAP_DAYS && shouldCapInterval(masteryStage)) {
    interval = PRE_PRODUCTION_INTERVAL_CAP_DAYS;
  }

  const retention = Math.round(fsrsR(interval, stability) * 100);
  const nextReview = addDays(today(), interval);
  return {
    stability: +stability.toFixed(4),
    difficulty: +difficulty.toFixed(4),
    interval,
    repetitions,
    nextReview,
    retention
  };
}

/**
 * Phase 2 — Traite un usage productif correct comme un rappel très fort.
 * Équivalent à `fsrs(card, 5)` (grade "easy") mais explicite dans l'API pour
 * qu'on sache dans les call-sites qu'on donne un bonus de PRODUCTION, pas un
 * bonus de reconnaissance. `masteryStage` doit déjà avoir été mis à jour par
 * l'appelant (via recordProductiveUse) pour que le plafond d'intervalle soit
 * levé correctement.
 */
export function fsrsFromProduction(card) {
  return fsrs(card, 5);
}
