// src/lib/fsrs.js
// ════════════════════════════════════════════════════════════════════════════
// Façade FSRS de MemoMaster — API publique stable pour toute l'application.
// ════════════════════════════════════════════════════════════════════════════
// Le modèle mémoire pur vit désormais dans `lib/srs/fsrsCore.js` (testable,
// optimisable), les règles propres à l'app (incubation anglaise, régime
// intensif, garde-fous) restent ici. Toutes les signatures historiques sont
// conservées : aucun appelant n'a besoin d'être modifié.
//
// Ce qui change réellement pour l'utilisateur :
//   • un oubli ne détruit plus l'historique mémoire de la fiche ;
//   • la difficulté ne sature plus à 10 (amortissement + retour à la moyenne) ;
//   • les révisions du même jour comptent enfin ;
//   • les intervalles peuvent utiliser des poids personnalisés (optimiseur) ;
//   • la dispersion des intervalles est déterministe et réellement répartie.
// ════════════════════════════════════════════════════════════════════════════

import { addDays, today, diffDays, isDue } from "../utils/dateUtils.js";
import {
  FSRS5_DEFAULT_W,
  DECAY,
  FACTOR,
  STATES,
  applyGrade,
  fuzzInterval,
  initialDifficulty,
  initialStability,
  intervalForRetention,
  retrievability,
} from "./srs/fsrsCore.js";

export { addDays, today, diffDays, isDue };
export { STATES as FSRS_STATES };

// ── Paramètres ─────────────────────────────────────────────────────────────
export const FSRS_DEFAULT_PARAMS = [...FSRS5_DEFAULT_W];
export const FSRS_PARAMS = FSRS_DEFAULT_PARAMS;
export const FSRS_DECAY = DECAY;
export const FSRS_FACTOR = FACTOR;
export const TARGET_R = 0.9;
export const DEFAULT_TARGET_RETENTION = TARGET_R;

/**
 * Poids actifs. Si l'optimiseur a produit des poids personnalisés, ils sont
 * injectés ici une fois au démarrage (voir `lib/srs/weightsStore.js`).
 */
let ACTIVE_WEIGHTS = [...FSRS5_DEFAULT_W];
let ACTIVE_TARGET_RETENTION = TARGET_R;

export function setActiveWeights(weights) {
  if (Array.isArray(weights) && weights.length === FSRS5_DEFAULT_W.length && weights.every(Number.isFinite)) {
    ACTIVE_WEIGHTS = [...weights];
    return true;
  }
  return false;
}
export function getActiveWeights() {
  return [...ACTIVE_WEIGHTS];
}
export function setActiveTargetRetention(r) {
  const v = Number(r);
  if (Number.isFinite(v) && v >= 0.7 && v <= 0.98) {
    ACTIVE_TARGET_RETENTION = v;
    return true;
  }
  return false;
}
export function getActiveTargetRetention() {
  return ACTIVE_TARGET_RETENTION;
}

export const FSRS_PRESETS = {
  DEFAULT: [...FSRS5_DEFAULT_W],
  // Profil linguistique : ancrage initial plus rapide, difficulté de départ plus douce.
  LANGUAGE: FSRS5_DEFAULT_W.map((v, i) => {
    if (i < 4) return +(v * 1.08).toFixed(4);
    if (i === 4) return +(v * 0.92).toFixed(4); // D0 plus bas : vocabulaire = acquisition rapide
    return v;
  }),
  // Profil STEM : première acquisition plus lente, difficulté de départ plus haute.
  STEM: FSRS5_DEFAULT_W.map((v, i) => {
    if (i < 4) return +(v * 0.92).toFixed(4);
    if (i === 4) return +(v * 1.08).toFixed(4);
    return v;
  }),
  // Profil examen : intervalles resserrés (à combiner avec targetRetention 0.95).
  RAPID_EXAM: FSRS5_DEFAULT_W.map((v, i) => (i < 4 ? +(v * 0.85).toFixed(4) : v)),
};

// ── Régime intensif ANGLAIS — paliers 1 → 3 → 7 → 14 jours ─────────────────
export const ENGLISH_INTENSIVE_LADDER = [1, 3, 7, 14];
export const ENGLISH_INTENSIVE_EXIT_INTERVAL =
  ENGLISH_INTENSIVE_LADDER[ENGLISH_INTENSIVE_LADDER.length - 1];
export const PRE_PRODUCTION_INTERVAL_CAP_DAYS = 3;
export const ENGLISH_INCUBATION_DAYS = 7;
/** Rétention cible du régime intensif anglais (remplace l'échelle fixe). */
export const ENGLISH_INTENSIVE_TARGET_R = 0.93;

const UNCAPPED_STAGES = new Set(["recalled", "produced", "mastered"]);
export const PRODUCTIVE_STAGES = new Set(["produced", "mastered"]);

export function isEnglishCard(card) {
  const cat = String(card?.category || "");
  const lc = cat.toLowerCase();
  return lc.includes("anglais") || lc.includes("english") || cat.includes("🇬🇧");
}

export function hasRecalledStage(card) {
  return UNCAPPED_STAGES.has(card?.masteryStage);
}

export function hasReachedLastLadderStep(card) {
  return (Number(card?.interval) || 0) >= ENGLISH_INTENSIVE_EXIT_INTERVAL;
}

export function isEnglishIntensive(card) {
  if (!card || !isEnglishCard(card)) return false;
  return !(hasRecalledStage(card) && hasReachedLastLadderStep(card));
}

export const shouldCapInterval = isEnglishIntensive;

export function isIncubationEligible(card) {
  if (!card || !isEnglishCard(card)) return false;
  if (card.incubationDone) return false;
  if (hasRecalledStage(card)) return false;
  if ((Number(card.incubationDays) || 0) > 0 || card.incubationStart) return true;
  return Boolean(card.incubation);
}

export function incubationProgress(card) {
  const days = Math.max(0, Math.min(ENGLISH_INCUBATION_DAYS, Number(card?.incubationDays) || 0));
  return {
    active: isIncubationEligible(card),
    days,
    total: ENGLISH_INCUBATION_DAYS,
    remaining: Math.max(0, ENGLISH_INCUBATION_DAYS - days),
  };
}

export function nextIntensiveInterval(prevInterval, proposed) {
  const prev = Math.max(0, Number(prevInterval) || 0);
  const step = ENGLISH_INTENSIVE_LADDER.find((d) => d > prev) ?? ENGLISH_INTENSIVE_EXIT_INTERVAL;
  return Math.max(1, Math.min(Number(proposed) || 1, Math.max(step, 0)));
}

export function englishLadderStep(card) {
  const i = Number(card?.interval) || 0;
  let step = 0;
  ENGLISH_INTENSIVE_LADDER.forEach((d, idx) => {
    if (i >= d) step = idx + 1;
  });
  return { step, total: ENGLISH_INTENSIVE_LADDER.length };
}

// ── Ponts de compatibilité ─────────────────────────────────────────────────
export const fsrsR = retrievability;

export function calculateNextInterval(S, targetR = TARGET_R) {
  return Math.max(1, Math.round(intervalForRetention(S, targetR)));
}

/** Score applicatif {0,1,3,5} → grade FSRS {1,2,3,4}. */
export function toFSRSGrade(q) {
  if (q === 0) return 1;
  if (q === 1) return 2;
  if (q === 3) return 3;
  if (q === 5) return 4;
  return 3;
}

export function fromFSRSGrade(grade) {
  return { 1: 0, 2: 1, 3: 3, 4: 5 }[grade] ?? 3;
}

export function applyIntervalFuzz(interval, opts = {}) {
  return fuzzInterval(interval, opts.seed ?? opts.id ?? "");
}

// ── Moteur principal ───────────────────────────────────────────────────────
/**
 * Applique une révision à une fiche et renvoie son nouvel état.
 *
 * @param {Object} card  fiche MemoMaster
 * @param {number} q     0 Oublié · 1 Difficile · 3 Correct · 5 Facile
 * @param {Object} opts  { targetRetention, weights, currentDate, fuzz }
 */
export function fsrs(card, q, opts = {}) {
  // Temps de réponse : un « Correct » trop lent devient « Difficile »
  // (seuil selon le type de fiche). Jamais de promotion automatique.
  const responseMs = Number(opts.responseMs);
  const hasLatency = Number.isFinite(responseMs) && responseMs > 0;
  const latency = hasLatency
    ? evaluateResponseWithLatency(q, responseMs / 1000, card?.type || 'qa')
    : { q, adjusted: false };
  q = latency.q;
  const grade = toFSRSGrade(q);
  const weights = opts.weights || ACTIVE_WEIGHTS;
  const targetR = Number.isFinite(opts.targetRetention)
    ? Math.min(0.98, Math.max(0.7, opts.targetRetention))
    : ACTIVE_TARGET_RETENTION;
  const todayStr = opts.currentDate || today();

  const prev = card || {};
  let stability = Number(prev.stability) > 0 ? Number(prev.stability) : null;
  let difficulty = Number(prev.difficulty) > 0 ? Number(prev.difficulty) : null;
  let repetitions = Number(prev.repetitions) || 0;
  let lapses = Number(prev.lapses) || 0;
  const prevInterval = Number(prev.interval) || 0;

  // Reprise transparente des anciennes fiches SM-2 (easeFactor sans stabilité).
  if (stability === null && repetitions > 0) {
    stability = Math.max(0.5, prevInterval || 1);
    difficulty = prev.easeFactor
      ? Math.min(10, Math.max(1, 11 - (prev.easeFactor - 1.3) * 4.16))
      : initialDifficulty(3, weights);
  }

  // Temps réellement écoulé depuis la dernière révision.
  let elapsed;
  if (Number.isFinite(prev.elapsedDays)) {
    elapsed = Math.max(0, Number(prev.elapsedDays));
  } else if (prev.lastReviewDate) {
    elapsed = Math.max(0, diffDays(todayStr, prev.lastReviewDate));
  } else if (prev.nextReview && prevInterval > 0) {
    elapsed = Math.max(0, prevInterval + diffDays(todayStr, prev.nextReview));
  } else {
    elapsed = prevInterval;
  }

  const next = applyGrade(
    { stability, difficulty, state: prev.state || (repetitions > 0 ? STATES.REVIEW : STATES.NEW) },
    grade,
    stability === null ? 0 : elapsed,
    weights,
  );

  // Compteurs applicatifs. `repetitions` compte les rappels réussis consécutifs
  // et n'est JAMAIS utilisé pour décider de ré-initialiser la mémoire.
  let interval;
  const wasInLapse = prev.state === STATES.RELEARNING || prevInterval === 0 || (lapses > 0 && repetitions === 0);
  if (grade === 1) {
    lapses += 1;
    repetitions = 0;
    interval = 0; // à revoir dans la journée
  } else {
    repetitions += 1;
    if (wasInLapse && repetitions === 1) {
      // Re-consolidation post-oubli : retour dès le lendemain
      interval = 1;
    } else if (wasInLapse && repetitions === 2) {
      // Étape suivante limitée à 4 jours max pour éprouver la trace mnésique
      const naturalInterval = Math.max(1, Math.round(intervalForRetention(next.stability, targetR)));
      interval = Math.min(4, naturalInterval);
    } else {
      interval = Math.max(1, Math.round(intervalForRetention(next.stability, targetR)));
    }
  }

  // Règles pédagogiques MemoMaster ------------------------------------------
  let incubationPatch = null;
  if (isIncubationEligible(prev)) {
    const alreadyCreditedToday = prev.incubationLastDay === todayStr;
    let incubationDays = Math.max(0, Number(prev.incubationDays) || 0);
    if (grade === 1) incubationDays = Math.max(0, incubationDays - 1);
    else if (!alreadyCreditedToday) incubationDays += 1;
    const incubationDone = incubationDays >= ENGLISH_INCUBATION_DAYS;
    incubationPatch = {
      incubationDays,
      incubationLastDay: todayStr,
      incubationStart: prev.incubationStart || todayStr,
      incubationDone,
    };
    interval = incubationDone ? Math.max(1, Math.min(interval, 3)) : grade === 1 ? 0 : 1;
  } else if (interval > 0 && isEnglishIntensive(prev)) {
    // Régime intensif : rétention cible exigeante (≥ 93 %), délai propre à
    // chaque mot, plafonné au palier de sortie (14 j). Les étapes post-oubli
    // (1 j puis ≤ 4 j) restent prioritaires.
    if (!(wasInLapse && repetitions <= 2)) {
      const rEn = Math.max(targetR, ENGLISH_INTENSIVE_TARGET_R);
      interval = Math.max(1, Math.round(intervalForRetention(next.stability, rEn)));
    }
    interval = Math.min(interval, ENGLISH_INTENSIVE_EXIT_INTERVAL);
  } else if (interval >= 3 && opts.fuzz !== false) {
    // Dispersion activée par défaut : elle évite les vagues de révision.
    const fuzzSeed = String(prev.id || prev.front || 'card') + ':' + repetitions + ':' + todayStr;
    interval = fuzzInterval(interval, fuzzSeed);
  }

  interval = Math.max(0, Math.round(interval));
  const nextReviewDate = addDays(todayStr, interval);

  return {
    stability: +next.stability.toFixed(4),
    difficulty: +next.difficulty.toFixed(4),
    state: next.state,
    interval,
    repetitions,
    lapses,
    nextReview: nextReviewDate,
    retention: Math.round(retrievability(interval, next.stability) * 100),
    lastReviewDate: todayStr,
    elapsedDays: null,
    reviewHistoryEntry: {
      date: todayStr,
      q,
      grade,
      interval,
      elapsed,
      stability: +next.stability.toFixed(4),
      difficulty: +next.difficulty.toFixed(4),
      ...(hasLatency ? { responseMs: Math.round(responseMs) } : {}),
      ...(latency.adjusted ? { latencyAdjusted: true } : {}),
    },
    ...(incubationPatch || {}),
  };
}

/** Un usage productif réussi (parler/écrire) vaut un rappel fort. */
export function fsrsFromProduction(card, opts = {}) {
  return fsrs(card, 5, opts);
}

export function formatInterval(days) {
  const d = Math.max(0, Number(days) || 0);
  if (d < 1) return "< 1j";
  if (d < 30) return `${Math.round(d)}j`;
  if (d < 365) return `${Math.round(d / 30)}m`;
  return `${(d / 365).toFixed(1)}a`;
}

export function getPreviewInterval(card, q) {
  if (!card) return "";
  return `${fsrs(card, q, { fuzz: false }).interval} j`;
}

export function calculateCardNextStates(card, opts = {}) {
  if (!card) return null;
  const grades = [
    { key: "again", q: 0, label: "Oublié", score: 0 },
    { key: "hard", q: 1, label: "Difficile", score: 1 },
    { key: "good", q: 3, label: "Correct", score: 3 },
    { key: "easy", q: 5, label: "Facile", score: 5 },
  ];
  const result = {};
  for (const { key, q, label, score } of grades) {
    const outcome = fsrs(card, q, { ...opts, fuzz: false });
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
  }
  return result;
}

export function predictRetentionAt(card, targetDateISO, currentDateISO = today()) {
  if (!card || !(Number(card.stability) > 0)) return 0;
  const lastDate = card.lastReviewDate || card.nextReview || currentDateISO;
  return +retrievability(Math.max(0, diffDays(targetDateISO, lastDate)), card.stability).toFixed(4);
}

export function calculateOptimalReviewDate(card, targetR = TARGET_R, currentDateISO = today()) {
  if (!card || !(Number(card.stability) > 0)) return currentDateISO;
  return addDays(card.lastReviewDate || currentDateISO, calculateNextInterval(card.stability, targetR));
}

export function getMemoryHealth(card, currentDateISO = today()) {
  if (!card) return { status: "unknown", score: 0, label: "Inconnu" };
  const s = Number(card.stability) || 0;
  const d = Number(card.difficulty) || 5;
  const reps = Number(card.repetitions) || 0;
  const elapsed = card.lastReviewDate ? Math.max(0, diffDays(currentDateISO, card.lastReviewDate)) : 0;
  const currentR = s > 0 ? retrievability(elapsed, s) : 0;

  const lapses = Number(card.lapseCount ?? card.lapses ?? 0) || 0;
  // Sangsue : la fiche est retombée plusieurs fois, reste difficile et fragile.
  const isLeech = lapses >= 3 && (d >= 7 || s < 5);

  let status = "learning";
  let label = "En apprentissage";
  let color = "#6366F1";
  if (isLeech) {
    status = "leech";
    label = "Sangsue";
    color = "#EF4444";
  } else if (s >= 90 && currentR >= 0.9) {
    status = "mastered";
    label = "Ancré durablement";
    color = "#10B981";
  } else if (currentR < 0.7) {
    status = "critical";
    label = "Rappel critique";
    color = "#F59E0B";
  } else if (s >= 20) {
    status = "solid";
    label = "Consolidé";
    color = "#0EA5E9";
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

export function simulateTrajectory(initialCard, gradesSequence = [3, 3, 3, 3, 3], opts = {}) {
  let card = { ...initialCard };
  const trajectory = [];
  let currentDate = opts.startDate || today();

  gradesSequence.forEach((q, i) => {
    const outcome = fsrs(card, q, { ...opts, currentDate, fuzz: false });
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
    card = { ...card, ...outcome, elapsedDays: null };
  });

  return trajectory;
}

export function cognitiveTag(card) {
  const diff = card?.difficulty ?? (card?.easeFactor ? 5 - (card.easeFactor - 1.5) * 2.5 : 5);
  if (diff >= 7) return { icon: "🔥", label: "Résistante", color: "#EF4444", level: "hard" };
  if (diff >= 4.5) return { icon: "⚡", label: "En cours", color: "#F59E0B", level: "medium" };
  return { icon: "🌊", label: "Fluide", color: "#10B981", level: "easy" };
}

export { initialStability, initialDifficulty, retrievability, intervalForRetention };

/**
 * Évalue la note en fonction du temps de réponse et du type de carte.
 * - Anglais / Vocabulaire / Q-A directe : seuil à 15s.
 * - Code / Concepts complexes / Maths : seuil adapté à 35s.
 * Un 'Correct' (q=3) dépassant le seuil est rétrogradé en 'Difficile' (q=1).
 * On ne promeut jamais automatiquement en 'Facile' (q=5).
 */
export function evaluateResponseWithLatency(q, latencySeconds, cardType = 'qa') {
  const isDeep = ['code', 'concept', 'formula'].includes(cardType);
  const threshold = isDeep ? 35 : 15;
  const sec = Number(latencySeconds) || 0;
  
  if (sec > threshold && q === 3) {
    return { q: 1, adjusted: true, reason: 'Latence excessive pour ce type de fiche' };
  }
  return { q, adjusted: false };
}

