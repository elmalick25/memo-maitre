// src/lib/xpEngine.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 1 — Moteur XP réel (ledger événementiel).
//
// Avant : `powerLevel` était RECALCULÉ à chaque render à partir de compteurs
// globaux (fiches × 10 + streak × 50 + …). Conséquence : réviser une carte ne
// rapportait rien en soi, et supprimer une fiche faisait BAISSER le niveau.
//
// Maintenant : chaque action émet un ÉVÉNEMENT XP, l'XP est accumulée et
// PERSISTÉE (jamais recalculée), avec un historique journalier pour les stats.
//
// Toutes les fonctions de ce module sont PURES : c'est l'appelant (le hook
// useXPLedger) qui persiste.
// ═══════════════════════════════════════════════════════════════════════════

import { calculateXPMultiplier } from "./XPSystem";

export const XP_STORAGE_KEY = "xp_ledger_v1";

/** Sources d'XP explicites (base, avant multiplicateurs). */
export const XP_SOURCES = {
  REVIEW_AGAIN:      { base: 3,   label: "Rappel tenté (Again)" },
  REVIEW_HARD:       { base: 6,   label: "Rappel difficile" },
  REVIEW_GOOD:       { base: 10,  label: "Bon rappel" },
  REVIEW_EASY:       { base: 8,   label: "Rappel facile" },
  CARD_CREATED:      { base: 5,   label: "Fiche créée" },
  CARD_MASTERED:     { base: 60,  label: "Fiche maîtrisée (production)" },
  CARD_PRODUCED:     { base: 30,  label: "Expression produite en contexte" },
  POMODORO_DONE:     { base: 50,  label: "Session Pomodoro terminée" },
  PDF_ANALYZED:      { base: 40,  label: "Document analysé" },
  LEECH_RESCUED:     { base: 45,  label: "Leech sauvé" },
  STREAK_REPAIRED:   { base: 20,  label: "Streak réparé" },
  SESSION_COMPLETED: { base: 25,  label: "Session de révision terminée" },
  // ── CHANTIER 25 — la routine quotidienne rejoint le moteur XP ──
  ROUTINE_STEP_DONE:   { base: 8,   label: "Étape de routine faite" },
  ROUTINE_PERFECT_DAY: { base: 120, label: "Journée Parfaite (routine 100 %)" },
  MIGRATION:         { base: 0,   label: "Report de progression" },
};

/** Bonus de combo : bonnes réponses consécutives dans une session. */
export const COMBO_STEPS = [
  { min: 20, mult: 1.6, label: "COMBO ×20" },
  { min: 10, mult: 1.4, label: "COMBO ×10" },
  { min: 5,  mult: 1.25, label: "COMBO ×5" },
  { min: 3,  mult: 1.1,  label: "COMBO ×3" },
];

export function comboMultiplier(combo) {
  const step = COMBO_STEPS.find((s) => (combo || 0) >= s.min);
  return step ? step.mult : 1;
}

export function comboLabel(combo) {
  const step = COMBO_STEPS.find((s) => (combo || 0) >= s.min);
  return step ? step.label : null;
}

/** Mappe une note FSRS (0 Again / 1 Hard / 3 Good / 5 Easy) vers une source. */
export function sourceForRating(q) {
  if (q === 0) return "REVIEW_AGAIN";
  if (q === 1) return "REVIEW_HARD";
  if (q >= 5) return "REVIEW_EASY";
  return "REVIEW_GOOD";
}

/**
 * XP d'une révision, modulée par difficulté perçue, combo de session et streak.
 * @returns {{ amount:number, base:number, combo:number, streakMult:number, source:string }}
 */
export function xpForReview(q, combo = 0, streak = 0) {
  const source = sourceForRating(q);
  const base = XP_SOURCES[source].base;
  // Un « Again » ne bénéficie pas du combo (il le casse), mais rapporte
  // quand même : l'effort de rappel compte.
  const cMult = q === 0 ? 1 : comboMultiplier(combo);
  const sMult = calculateXPMultiplier(streak || 0);
  return {
    source,
    base,
    combo: cMult,
    streakMult: sMult,
    amount: Math.max(1, Math.round(base * cMult * sMult)),
  };
}

/** XP d'une source non-révision (streak appliqué, pas de combo). */
export function xpForSource(source, streak = 0, qty = 1) {
  const def = XP_SOURCES[source];
  if (!def) return { source, amount: 0, base: 0, combo: 1, streakMult: 1 };
  const sMult = calculateXPMultiplier(streak || 0);
  return {
    source,
    base: def.base,
    combo: 1,
    streakMult: sMult,
    amount: Math.round(def.base * qty * sMult),
  };
}

// ── État persistant ────────────────────────────────────────────────────────

export function createXPState() {
  return {
    version: 1,
    totalXP: 0,
    bySource: {},          // { SOURCE: xp cumulée }
    daily: [],             // [{ date, xp, events }] — 90 derniers jours
    sessionsHistory: [],   // [{ date, xpEarned, reviews, bestCombo }] — 60 derniers
    bestCombo: 0,
    // ── CHANTIER 8 — récompenses variables ──
    reviewsSinceChest: 0,   // compteur pour le tirage de coffre
    chestsOpened: 0,
    bonusXP: 0,             // XP issue des coffres/quêtes (traçabilité)
    // ── CHANTIER 12 — prestige ──
    prestige: 0,
    migratedFromLegacy: false,
    lastEventAt: null,
  };
}

export function normalizeXPState(raw) {
  const base = createXPState();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    bySource: raw.bySource && typeof raw.bySource === "object" ? raw.bySource : {},
    daily: Array.isArray(raw.daily) ? raw.daily : [],
    sessionsHistory: Array.isArray(raw.sessionsHistory) ? raw.sessionsHistory : [],
    totalXP: Number(raw.totalXP) || 0,
    reviewsSinceChest: Number(raw.reviewsSinceChest) || 0,
    chestsOpened: Number(raw.chestsOpened) || 0,
    bonusXP: Number(raw.bonusXP) || 0,
    prestige: Number(raw.prestige) || 0,
  };
}

/**
 * Applique un gain d'XP au ledger. PURE.
 * @param {object} state
 * @param {{source:string, amount:number, date:string, reviews?:number, combo?:number}} ev
 */
export function applyXPEvent(state, ev) {
  const s = normalizeXPState(state);
  const amount = Math.max(0, Math.round(Number(ev?.amount) || 0));
  if (amount === 0) return s;
  const date = ev?.date || new Date().toISOString().slice(0, 10);
  const source = ev?.source || "UNKNOWN";

  const bySource = { ...s.bySource, [source]: (s.bySource[source] || 0) + amount };

  const daily = s.daily.slice();
  const dIdx = daily.findIndex((d) => d.date === date);
  if (dIdx >= 0) daily[dIdx] = { ...daily[dIdx], xp: daily[dIdx].xp + amount, events: daily[dIdx].events + 1 };
  else daily.push({ date, xp: amount, events: 1 });
  const trimmedDaily = daily.slice(-90);

  const sessionsHistory = s.sessionsHistory.slice();
  const sIdx = sessionsHistory.findIndex((x) => x.date === date);
  const reviewsDelta = Number(ev?.reviews) || 0;
  if (sIdx >= 0) {
    sessionsHistory[sIdx] = {
      ...sessionsHistory[sIdx],
      xpEarned: sessionsHistory[sIdx].xpEarned + amount,
      reviews: (sessionsHistory[sIdx].reviews || 0) + reviewsDelta,
      bestCombo: Math.max(sessionsHistory[sIdx].bestCombo || 0, Number(ev?.combo) || 0),
    };
  } else {
    sessionsHistory.push({ date, xpEarned: amount, reviews: reviewsDelta, bestCombo: Number(ev?.combo) || 0 });
  }

  return {
    ...s,
    totalXP: s.totalXP + amount,
    bySource,
    daily: trimmedDaily,
    sessionsHistory: sessionsHistory.slice(-60),
    bestCombo: Math.max(s.bestCombo || 0, Number(ev?.combo) || 0),
    lastEventAt: Date.now(),
  };
}

/**
 * Migration douce : au 1er chargement post-mise à jour, on crédite l'XP
 * équivalente à l'ancien powerLevel dérivé pour ne pas repartir de zéro.
 */
export function migrateLegacyPowerLevel(state, legacyPower) {
  const s = normalizeXPState(state);
  if (s.migratedFromLegacy) return s;
  const seed = Math.max(0, Math.round(Number(legacyPower) || 0));
  const migrated = seed > 0
    ? applyXPEvent(s, { source: "MIGRATION", amount: seed, date: new Date().toISOString().slice(0, 10) })
    : s;
  return { ...migrated, migratedFromLegacy: true };
}

/** Formule legacy — conservée UNIQUEMENT pour calculer la graine de migration. */
export function legacyPowerLevel({ cards = 0, streak = 0, examsDone = 0, badges = 0 }) {
  return cards * 10 + streak * 50 + examsDone * 100 + badges * 200;
}

/** Somme d'XP sur les N derniers jours. */
export function xpInLastDays(state, days = 7) {
  const s = normalizeXPState(state);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return s.daily.filter((d) => d.date >= cutoff).reduce((acc, d) => acc + d.xp, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 8 / 12 — sources d'XP additionnelles (bonus variables & quêtes).
// Déclarées ici pour rester traçables dans `bySource`.
// ═══════════════════════════════════════════════════════════════════════════
XP_SOURCES.CHEST_BONUS   = { base: 0, label: "Coffre surprise" };
XP_SOURCES.QUEST_DAILY   = { base: 0, label: "Quête du jour" };
XP_SOURCES.QUEST_WEEKLY  = { base: 0, label: "Quête de la semaine" };
XP_SOURCES.QUEST_COMBO   = { base: 0, label: "Combo du jour (3/3)" };
XP_SOURCES.DAILY_BONUS   = { base: 0, label: "Multiplicateur du jour" };
