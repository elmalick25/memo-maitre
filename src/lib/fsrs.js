// src/lib/fsrs.js
// ══════════════════════════════════════════════════════════════════════════════
// Moteur FSRS (Free Spaced Repetition Scheduler) — Optimisation Haute Puissance
// ══════════════════════════════════════════════════════════════════════════════
// Basé sur les recherches FSRS (Jarrett Ye) et la science cognitive mnésique
// (Ebbinghaus, Bjork Desirable Difficulty, Rohrer Interleaving).
//
// Capacités clés :
//  1. Calcul analytique exact de la rétention R(t, S) et de la stabilité S.
//  2. Support de la rétention cible paramétrable (default 90%).
//  3. Régime intensif anglais (1 → 3 → 7 → 14j) & incubation 7 jours continus.
//  4. Fuzzing d'intervalle anti-tsunami (lissage des pics de révision).
//  5. Gestion déterministe de l'intra-day (t=0), des retards et des avances.
//  6. Matrice prédictive 4-boutons ({Again, Hard, Good, Easy}) pour l'UI.
//  7. Simulateur et boîte à outils de santé mnésique (predict, optimalDate, health).
// ══════════════════════════════════════════════════════════════════════════════

import { addDays, today, diffDays, isDue } from "../utils/dateUtils.js";
export { addDays, today, diffDays, isDue };

// ── Paramètres par défaut FSRS-5 ───────────────────────────────────────────
export const FSRS_DEFAULT_PARAMS = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589, 1.5330,
  0.1544, 1.0071, 1.9395, 0.1100, 0.2900, 2.2700, 0.1500, 2.9898, 0.5100, 0.3400
];
export const FSRS_PARAMS = FSRS_DEFAULT_PARAMS;

// Presets spécialisés selon le domaine cognitif
export const FSRS_PRESETS = {
  DEFAULT: [...FSRS_DEFAULT_PARAMS],
  // Profil linguistique : ancrage initial plus rapide, sensibilité aux contextes
  LANGUAGE: [
    0.4500, 1.2500, 3.4000, 16.0000, 6.8000, 0.5500, 1.1000, 0.0600, 1.5500,
    0.1500, 1.0500, 1.9000, 0.1100, 0.2800, 2.2500, 0.1500, 3.0000, 0.5000, 0.3300
  ],
  // Profil STEM / Formules : difficulté initiale plus marquée, consolidation progressive
  STEM: [
    0.3800, 1.1000, 2.9000, 14.5000, 7.5000, 0.5200, 1.0200, 0.0550, 1.4800,
    0.1600, 0.9800, 1.9800, 0.1200, 0.3000, 2.3000, 0.1600, 2.9000, 0.5200, 0.3500
  ],
  // Profil Examen Intensif : intervalles plus resserrés pour garantir >95% de rétention
  RAPID_EXAM: [
    0.3500, 1.0000, 2.6000, 12.0000, 7.8000, 0.5000, 1.0000, 0.0500, 1.4000,
    0.1700, 0.9500, 2.0500, 0.1300, 0.3200, 2.4000, 0.1700, 2.8000, 0.5500, 0.3600
  ],
};

export const FSRS_DECAY = -0.5;
export const FSRS_FACTOR = 19 / 81;
export const TARGET_R = 0.9;
export const DEFAULT_TARGET_RETENTION = TARGET_R;

// ── Régime intensif ANGLAIS — paliers 1 → 3 → 7 → 14 jours ─────────────────
export const ENGLISH_INTENSIVE_LADDER = [1, 3, 7, 14];
export const ENGLISH_INTENSIVE_EXIT_INTERVAL =
  ENGLISH_INTENSIVE_LADDER[ENGLISH_INTENSIVE_LADDER.length - 1];

export const PRE_PRODUCTION_INTERVAL_CAP_DAYS = 3;

// ── INCUBATION ANGLAIS — 7 jours de contact QUOTIDIEN ──────────────────────
export const ENGLISH_INCUBATION_DAYS = 7;

/** La fiche peut-elle (encore) être en incubation quotidienne ? */
export function isIncubationEligible(card) {
  if (!card || !isEnglishCard(card)) return false;
  if (card.incubationDone) return false;
  if (hasRecalledStage(card)) return false;
  if ((Number(card.incubationDays) || 0) > 0 || card.incubationStart) return true;
  return Boolean(card.incubation);
}

/** Progression lisible pour l'UI : { active, days, total, remaining }. */
export function incubationProgress(card) {
  const days = Math.max(0, Math.min(ENGLISH_INCUBATION_DAYS, Number(card?.incubationDays) || 0));
  const active = isIncubationEligible(card);
  return {
    active,
    days,
    total: ENGLISH_INCUBATION_DAYS,
    remaining: Math.max(0, ENGLISH_INCUBATION_DAYS - days),
  };
}

const UNCAPPED_STAGES = new Set(['recalled', 'produced', 'mastered']);
export const PRODUCTIVE_STAGES = new Set(['produced', 'mastered']);

/** Le régime intensif ne concerne que les fiches d'anglais. */
export function isEnglishCard(card) {
  const cat = card?.category || "";
  const lc = String(cat).toLowerCase();
  return lc.includes("anglais") || lc.includes("english") || String(cat).includes("🇬🇧");
}

/** Condition 1 de sortie : la fiche est au moins `recalled`. */
export function hasRecalledStage(card) {
  const stage = card?.masteryStage;
  if (!stage) return false;
  return UNCAPPED_STAGES.has(stage);
}

/** Condition 2 de sortie : le dernier palier de l'échelle a été atteint. */
export function hasReachedLastLadderStep(card) {
  return (Number(card?.interval) || 0) >= ENGLISH_INTENSIVE_EXIT_INTERVAL;
}

/**
 * Vrai si la fiche est ENCORE dans le régime intensif anglais.
 * Sortie uniquement si `recalled` (ou +) ET dernier palier atteint.
 */
export function isEnglishIntensive(card) {
  if (!card || !isEnglishCard(card)) return false;
  return !(hasRecalledStage(card) && hasReachedLastLadderStep(card));
}

// Alias historique pour compatibilité
export function shouldCapInterval(card) {
  return isEnglishIntensive(card);
}

/**
 * Palier suivant de l'échelle intensive.
 * @param {number} prevInterval intervalle AVANT cette révision
 * @param {number} proposed     intervalle proposé par FSRS (borne haute)
 */
export function nextIntensiveInterval(prevInterval, proposed) {
  const prev = Math.max(0, Number(prevInterval) || 0);
  const step =
    ENGLISH_INTENSIVE_LADDER.find((d) => d > prev) ?? ENGLISH_INTENSIVE_EXIT_INTERVAL;
  const cap = Math.max(step, 0);
  return Math.max(1, Math.min(Number(proposed) || 1, cap));
}

/** Position lisible sur l'échelle (pour l'UI / les stats). */
export function englishLadderStep(card) {
  const i = Number(card?.interval) || 0;
  let step = 0;
  ENGLISH_INTENSIVE_LADDER.forEach((d, idx) => { if (i >= d) step = idx + 1; });
  return { step, total: ENGLISH_INTENSIVE_LADDER.length };
}

// ── Formules mathématiques fondamentales FSRS ──────────────────────────────

/**
 * Rétrievabilité (probabilité de rappel) après un temps t (jours) pour une stabilité S.
 * R(t, S) = (1 + FACTOR * (t / S)) ^ DECAY
 */
export function fsrsR(t, S) {
  if (S <= 0) return 0;
  if (t <= 0) return 1;
  return Math.pow(1 + FSRS_FACTOR * (t / S), FSRS_DECAY);
}

/**
 * Calcule l'intervalle exact pour atteindre la rétention cible demandée.
 * I(S, R_target) = (S / FACTOR) * (R_target^(1/DECAY) - 1)
 */
export function calculateNextInterval(S, targetR = TARGET_R) {
  if (!S || S <= 0) return 1;
  const clampedR = Math.max(0.7, Math.min(0.98, Number(targetR) || TARGET_R));
  const t = (S / FSRS_FACTOR) * (Math.pow(clampedR, 1 / FSRS_DECAY) - 1);
  return Math.max(1, Math.round(t));
}

function fsrsNextInterval(S, targetR = TARGET_R) {
  return calculateNextInterval(S, targetR);
}

/**
 * Mappe le score de l'application q ∈ {0, 1, 3, 5} vers le grade FSRS ∈ {1, 2, 3, 4}.
 * 0 (Again) -> 1
 * 1 (Hard)  -> 2
 * 3 (Good)  -> 3
 * 5 (Easy)  -> 4
 */
export function toFSRSGrade(q) {
  if (q === 0) return 1;
  if (q === 1) return 2;
  if (q === 3) return 3;
  if (q === 5) return 4;
  return 3;
}

export function fromFSRSGrade(grade) {
  if (grade === 1) return 0;
  if (grade === 2) return 1;
  if (grade === 3) return 3;
  if (grade === 4) return 5;
  return 3;
}

function fsrsInitStability(grade, params = FSRS_PARAMS) {
  const g = Math.max(1, Math.min(4, Math.round(grade)));
  return params[g - 1];
}

function fsrsInitDifficulty(grade, params = FSRS_PARAMS) {
  const w = params;
  const g = Math.max(1, Math.min(4, Math.round(grade)));
  return Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * (g - 1)) + 1));
}

function fsrsNextDifficulty(D, grade, params = FSRS_PARAMS) {
  const w = params;
  const g = Math.max(1, Math.min(4, Math.round(grade)));
  const next_d = D - w[6] * (g - 3);
  const D0_3 = Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * (3 - 1)) + 1));
  const D_mean = w[7] * D0_3 + (1 - w[7]) * next_d;
  return Math.min(10, Math.max(1, D_mean));
}

function fsrsNextStabilityRecall(D, S, R, grade, params = FSRS_PARAMS) {
  const w = params;
  const g = Math.max(1, Math.min(4, Math.round(grade)));
  const hardPenalty = g === 2 ? w[15] : 1;
  const easyBonus = g === 4 ? w[16] : 1;
  const safeR = Math.max(0.001, Math.min(1, R));
  return Math.max(
    S,
    S * (1 + Math.exp(w[8]) * (11 - D) * Math.pow(Math.max(0.1, S), -w[9]) * (Math.exp((1 - safeR) * w[10]) - 1) * hardPenalty * easyBonus)
  );
}

function fsrsNextStabilityForgot(D, S, R, params = FSRS_PARAMS) {
  const w = params;
  const safeR = Math.max(0.001, Math.min(1, R));
  const safeS = Math.max(0.1, S);
  return w[11] * Math.pow(Math.max(1, D), -w[12]) * (Math.pow(safeS + 1, w[13]) - 1) * Math.exp((1 - safeR) * w[14]);
}

// ── Fuzzing d'Intervalle (Anti-Tsunami / Anti-Spikes) ───────────────────────
/**
 * Applique une dispersion contrôlée sur les intervalles longs pour éviter
 * les vagues artificielles de révision sur une seule journée future.
 */
export function applyIntervalFuzz(interval, opts = {}) {
  const i = Math.round(Number(interval) || 0);
  if (i < 3) return Math.max(0, i);

  const seed = opts.seed != null ? Math.abs(Math.sin(opts.seed)) : Math.random();
  let delta = 0;

  if (i >= 3 && i <= 7) {
    delta = seed > 0.6 ? 1 : seed < 0.3 ? -1 : 0;
  } else if (i <= 20) {
    const range = Math.max(1, Math.round(i * 0.05));
    delta = Math.round((seed * 2 - 1) * range);
  } else {
    const range = Math.max(2, Math.round(i * 0.05));
    delta = Math.round((seed * 2 - 1) * range);
  }

  return Math.max(1, i + delta);
}

// ── Moteur Principal FSRS ──────────────────────────────────────────────────
/**
 * Calcule le prochain état FSRS d'une carte après une révision.
 *
 * @param {Object} card       État actuel de la carte
 * @param {number} q          Score utilisateur (0: Again, 1: Hard, 3: Good, 5: Easy)
 * @param {Object} opts       Options de calcul (targetRetention, weights, currentDate, fuzz)
 * @returns {Object}          Nouvel état de la carte
 */
export function fsrs(card, q, opts = {}) {
  const grade = toFSRSGrade(q);
  const weights = opts.weights || FSRS_PARAMS;
  const targetR = typeof opts.targetRetention === "number"
    ? Math.max(0.7, Math.min(0.98, opts.targetRetention))
    : TARGET_R;
  const todayStr = opts.currentDate || today();

  let {
    stability = null,
    difficulty = null,
    interval = 1,
    repetitions = 0,
    elapsedDays = null,
    nextReview = null,
    easeFactor = null,
    masteryStage = null,
    lastReviewDate = null,
  } = card || {};

  // 1) Calcul robuste de elapsedDays (temps écoulé réel)
  if (elapsedDays === null) {
    if (lastReviewDate !== null) {
      elapsedDays = Math.max(0, diffDays(todayStr, lastReviewDate));
    } else if (nextReview !== null && interval > 0) {
      const daysLate = diffDays(todayStr, nextReview);
      elapsedDays = Math.max(0, interval + daysLate);
    } else {
      elapsedDays = interval;
    }
  }
  const t = Math.max(0, Number(elapsedDays) || 0);

  // 2) Migration transparente des anciennes fiches SM-2
  if (stability === null && repetitions > 0) {
    stability = Math.max(0.1, Number(interval) || 1);
    difficulty = easeFactor
      ? Math.max(1, Math.min(10, 11 - (easeFactor - 1.3) * 4.16))
      : 5;
  }

  // 3) Initialisation ou mise à jour de la mémoire
  if (stability === null || repetitions === 0) {
    // Fiche neuve : initialisation des paramètres cognitifs
    stability = fsrsInitStability(grade, weights);
    difficulty = fsrsInitDifficulty(grade, weights);

    if (grade === 1) {
      // Échec initial : intervalle 0 (révision aujourd'hui), répétitions à 0,
      // mais stabilité et difficulté initialisées pour refléter la trace mnésique.
      interval = 0;
      repetitions = 0;
    } else {
      interval = fsrsNextInterval(stability, targetR);
      repetitions = 1;
    }
  } else {
    // Fiche en cours d'apprentissage / révision
    if (t === 0) {
      // Cas intra-day (même journée) : R=1
      difficulty = fsrsNextDifficulty(difficulty, grade, weights);
      if (grade === 1) {
        stability = Math.max(0.1, fsrsNextStabilityForgot(difficulty, stability, 1, weights));
        interval = 0;
        repetitions = 0;
      } else {
        // En même journée avec Good/Easy, légère consolidation
        interval = fsrsNextInterval(stability, targetR);
        repetitions = Math.max(1, repetitions);
      }
    } else {
      // Cas standard (t > 0)
      const R = fsrsR(t, stability);
      difficulty = fsrsNextDifficulty(difficulty, grade, weights);
      if (grade === 1) {
        stability = Math.max(0.1, fsrsNextStabilityForgot(difficulty, stability, R, weights));
        interval = 0;
        repetitions = 0;
      } else {
        stability = fsrsNextStabilityRecall(difficulty, stability, R, grade, weights);
        interval = fsrsNextInterval(stability, targetR);
        repetitions++;
      }
    }
  }

  // 4) Incubation anglaise : 7 jours de contact quotidien
  let incubationPatch = null;
  if (isIncubationEligible(card)) {
    const alreadyCreditedToday = card?.incubationLastDay === todayStr;
    let incubationDays = Math.max(0, Number(card?.incubationDays) || 0);
    if (grade === 1) {
      incubationDays = Math.max(0, incubationDays - 1);
    } else if (!alreadyCreditedToday) {
      incubationDays += 1;
    }
    const incubationDone = incubationDays >= ENGLISH_INCUBATION_DAYS;
    incubationPatch = {
      incubationDays,
      incubationLastDay: todayStr,
      incubationStart: card?.incubationStart || todayStr,
      incubationDone,
    };
    interval = incubationDone ? Math.max(1, Math.min(interval, 3)) : (grade === 1 ? 0 : 1);
  } else if (interval > 0 && isEnglishIntensive(card)) {
    // Régime intensif anglais (1 → 3 → 7 → 14)
    const prevInterval = (Number(card?.repetitions) || 0) > 0 ? Number(card?.interval) || 0 : 0;
    interval = nextIntensiveInterval(prevInterval, interval);
  } else if (opts.fuzz === true && interval >= 3) {
    // Optionnel : Fuzzing d'intervalle anti-clustering
    interval = applyIntervalFuzz(interval, { seed: Number(card?.id?.length) || 0 });
  }

  interval = Math.max(0, Math.round(interval));
  const retention = Math.round(fsrsR(interval, stability) * 100);
  const nextReviewDate = addDays(todayStr, interval);

  const reviewHistoryEntry = {
    date: todayStr,
    q,
    grade,
    interval,
    stability: +stability.toFixed(4),
  };

  return {
    stability: +stability.toFixed(4),
    difficulty: +difficulty.toFixed(4),
    interval,
    repetitions,
    nextReview: nextReviewDate,
    retention,
    lastReviewDate: todayStr,
    reviewHistoryEntry,
    ...(incubationPatch || {}),
  };
}

/**
 * Traite un usage productif réussi comme un rappel fort (Easy, q=5).
 */
export function fsrsFromProduction(card, opts = {}) {
  return fsrs(card, 5, opts);
}

/** Formate un intervalle en chaîne compacte ("1j", "3j", "2m", "1.2a"). */
export function formatInterval(days) {
  const d = Math.max(0, Number(days) || 0);
  if (d < 1) return "< 1j";
  if (d < 30) return `${Math.round(d)}j`;
  if (d < 365) return `${Math.round(d / 30)}m`;
  return `${(d / 365).toFixed(1)}a`;
}

/** Prévisualisation d'intervalle pour l'UI. */
export function getPreviewInterval(card, q) {
  if (!card) return "";
  const preview = fsrs(card, q);
  return `${preview.interval}j`;
}

/**
 * Matrice prédictive des 4 boutons ({ again, hard, good, easy }) pour un affichage instantané.
 */
export function calculateCardNextStates(card, opts = {}) {
  if (!card) return null;
  const grades = [
    { key: "again", q: 0, label: "Oublié", score: 0 },
    { key: "hard",  q: 1, label: "Difficile", score: 1 },
    { key: "good",  q: 3, label: "Correct", score: 3 },
    { key: "easy",  q: 5, label: "Facile", score: 5 },
  ];

  const result = {};
  grades.forEach(({ key, q, label, score }) => {
    const outcome = fsrs(card, q, opts);
    result[key] = {
      q,
      score,
      label,
      interval: outcome.interval,
      intervalLabel: formatInterval(outcome.interval),
      stability: outcome.stability,
      difficulty: outcome.difficulty,
      retention: outcome.retention,
      nextReview: outcome.nextReview,
    };
  });
  return result;
}

/**
 * Prédiction de la rétention exacte R(t, S) d'une fiche à une date cible donnée.
 */
export function predictRetentionAt(card, targetDateISO, currentDateISO = today()) {
  if (!card || !card.stability || card.stability <= 0) return 0;
  const lastDate = card.lastReviewDate || card.nextReview || currentDateISO;
  const elapsed = Math.max(0, diffDays(targetDateISO, lastDate));
  return +fsrsR(elapsed, card.stability).toFixed(4);
}

/**
 * Calcule la date optimale de révision avant que la rétention ne descende sous targetR.
 */
export function calculateOptimalReviewDate(card, targetR = TARGET_R, currentDateISO = today()) {
  if (!card || !card.stability || card.stability <= 0) return currentDateISO;
  const idealInterval = calculateNextInterval(card.stability, targetR);
  const baseDate = card.lastReviewDate || currentDateISO;
  return addDays(baseDate, idealInterval);
}

/**
 * Diagnostic de santé mnésique global d'une carte.
 */
export function getMemoryHealth(card, currentDateISO = today()) {
  if (!card) return { status: "unknown", score: 0, label: "Inconnu" };
  const s = Number(card.stability) || 0;
  const d = Number(card.difficulty) || 5;
  const reps = Number(card.repetitions) || 0;
  const lastDate = card.lastReviewDate || currentDateISO;
  const elapsed = Math.max(0, diffDays(currentDateISO, lastDate));
  const currentR = s > 0 ? fsrsR(elapsed, s) : 0;

  let status = "learning";
  let label = "En apprentissage";
  let color = "#8B5CF6";

  if (reps === 0) {
    status = "new";
    label = "Nouvelle";
    color = "#8B5CF6";
  } else if (d >= 7.5 && (card.lapseCount || 0) >= 3) {
    status = "leech";
    label = "Sangsue (Fragile)";
    color = "#EF4444";
  } else if (s >= 100 || (card.interval || 0) >= 90) {
    status = "mastered";
    label = "Ancré durablement";
    color = "#10B981";
  } else if (currentR < 0.70) {
    status = "critical";
    label = "Rappel critique";
    color = "#F59E0B";
  } else if (s >= 20) {
    status = "solid";
    label = "Consolidé";
    color = "#A855F7";
  }

  return {
    status,
    label,
    color,
    stability: s,
    difficulty: d,
    retrievability: +(currentR * 100).toFixed(1),
    elapsedDays: elapsed,
    repetitions: reps,
  };
}

/**
 * Simulateur de trajectoire mnésique sur une suite de révisions.
 */
export function simulateTrajectory(initialCard, gradesSequence = [3, 3, 3, 3, 3], opts = {}) {
  let card = { ...initialCard };
  const trajectory = [];
  let currentDate = opts.startDate || today();

  for (let i = 0; i < gradesSequence.length; i++) {
    const q = gradesSequence[i];
    const outcome = fsrs(card, q, { ...opts, currentDate });
    trajectory.push({
      step: i + 1,
      q,
      date: currentDate,
      interval: outcome.interval,
      stability: outcome.stability,
      difficulty: outcome.difficulty,
      retention: outcome.retention,
      nextReview: outcome.nextReview,
    });
    currentDate = outcome.nextReview;
    card = { ...card, ...outcome, elapsedDays: outcome.interval, lastReviewDate: outcome.lastReviewDate };
  }

  return trajectory;
}

/**
 * Étiquette cognitive dérivée de la difficulté FSRS.
 */
export function cognitiveTag(card) {
  if (!card) return { icon: "🐣", label: "Facile", color: "#8B5CF6" };
  const diff = card.difficulty ?? (card.easeFactor ? 5 - (card.easeFactor - 1.5) * 2.5 : 2.5);
  if (diff >= 6.5) return { icon: "💀", label: "Difficile", color: "#EF4444" };
  if (diff >= 4.5) return { icon: "🤔", label: "Moyen", color: "#A855F7" };
  return { icon: "🐣", label: "Facile", color: "#8B5CF6" };
}
