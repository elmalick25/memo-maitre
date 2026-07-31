// src/lib/dailyQuests.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 9 — Quêtes quotidiennes (boucle courte) & hebdo (boucle longue).
//
// Génération DÉTERMINISTE par date (+ sel de profil) : pas de random pur, donc
// reproductible et testable. Recharger la page ne re-tire jamais les quêtes.
//
// PURE : aucune écriture, aucun accès au storage (c'est le hook qui persiste).
// ═══════════════════════════════════════════════════════════════════════════

import { hashSeed, makeRng, weightedPick } from "./rewardRoll.js";

export const QUESTS_STORAGE_KEY = "daily_quests_v1";

/** Compteurs suivis pendant la journée / la semaine. */
export function createCounters() {
  return {
    reviews: 0,        // révisions effectuées
    goodReviews: 0,    // révisions Good/Easy
    cardsCreated: 0,   // fiches créées
    sessions: 0,       // sessions terminées
    earlySession: 0,   // session lancée avant 10h
    lateSession: 0,    // session lancée après 21h
    produced: 0,       // expressions produites en contexte
    bestCombo: 0,      // meilleur combo du jour
    xp: 0,             // XP gagnée
    chests: 0,         // coffres ouverts
  };
}

// ── Catalogue de quêtes quotidiennes ───────────────────────────────────────
// `target` peut être un nombre ou une fonction du profil (adaptation douce).
const DAILY_POOL = [
  { id: "reviews_10",  weight: 20, icon: "🔁", counter: "reviews",      label: (t) => `${t} révisions`,                target: () => 10,  xp: 40 },
  { id: "reviews_25",  weight: 14, icon: "🔥", counter: "reviews",      label: (t) => `${t} révisions`,                target: (p) => (p.dueCount >= 25 ? 25 : 15), xp: 70 },
  { id: "good_8",      weight: 14, icon: "✅", counter: "goodReviews",  label: (t) => `${t} bonnes réponses`,          target: () => 8,   xp: 45 },
  { id: "create_1",    weight: 16, icon: "📝", counter: "cardsCreated", label: (t) => `${t} fiche créée`,              target: () => 1,   xp: 35 },
  { id: "create_3",    weight: 10, icon: "🧠", counter: "cardsCreated", label: (t) => `${t} fiches créées`,            target: () => 3,   xp: 60 },
  { id: "early",       weight: 10, icon: "🌅", counter: "earlySession", label: () => "Une session avant 10h",          target: () => 1,   xp: 50 },
  { id: "session_1",   weight: 14, icon: "🎯", counter: "sessions",     label: (t) => `${t} session terminée`,         target: () => 1,   xp: 40 },
  { id: "combo_5",     weight: 12, icon: "⚡", counter: "bestCombo",    label: (t) => `Un combo de ${t}`,              target: () => 5,   xp: 45 },
  { id: "produce_1",   weight: 8,  icon: "🗣️", counter: "produced",     label: (t) => `${t} expression produite`,      target: () => 1,   xp: 55 },
];

const WEEKLY_POOL = [
  { id: "w_reviews",  weight: 30, icon: "🏔️", counter: "reviews",      label: (t) => `${t} révisions cette semaine`,      target: (p) => Math.max(60, Math.round((p.avgDailyReviews || 12) * 5)), xp: 250 },
  { id: "w_days",     weight: 24, icon: "📆", counter: "sessions",     label: (t) => `Étudier ${t} jours cette semaine`,  target: () => 5,   xp: 300 },
  { id: "w_create",   weight: 22, icon: "🗂️", counter: "cardsCreated", label: (t) => `${t} nouvelles fiches`,             target: () => 10,  xp: 220 },
  { id: "w_xp",       weight: 24, icon: "💠", counter: "xp",           label: (t) => `${t} XP accumulés`,                 target: (p) => Math.max(400, Math.round((p.avgDailyXP || 80) * 5)), xp: 280 },
];

function buildQuest(def, profile) {
  const target = Math.max(1, Math.round(typeof def.target === "function" ? def.target(profile || {}) : def.target));
  return {
    id: def.id,
    icon: def.icon,
    counter: def.counter,
    target,
    xp: def.xp,
    label: def.label(target),
  };
}

/** Clé ISO de semaine ("2026-W31") — lundi comme premier jour. */
export function weekKey(dateISO) {
  const d = new Date(`${String(dateISO).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "unknown";
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** 3 quêtes quotidiennes distinctes, déterministes pour (date, profil). */
export function generateDailyQuests(dateISO, profile = {}, count = 3) {
  const date = String(dateISO || "").slice(0, 10);
  const rng = makeRng(hashSeed(`quests:${date}:${profile.salt || ""}`));
  const pool = DAILY_POOL.slice();
  const out = [];
  while (out.length < count && pool.length) {
    const picked = weightedPick(pool, rng());
    pool.splice(pool.indexOf(picked), 1);
    // Pas deux quêtes sur le même compteur : sinon la barre paraît redondante.
    if (out.some((q) => q.counter === picked.counter)) continue;
    out.push(buildQuest(picked, profile));
  }
  return out;
}

/** 1 quête hebdo ambitieuse, visible dès le lundi. */
export function generateWeeklyQuest(dateISO, profile = {}) {
  const wk = weekKey(dateISO);
  const rng = makeRng(hashSeed(`weekly:${wk}:${profile.salt || ""}`));
  return { ...buildQuest(weightedPick(WEEKLY_POOL, rng()), profile), week: wk };
}

// ── État persistant ────────────────────────────────────────────────────────

export function createQuestState() {
  return {
    version: 1,
    date: null,
    week: null,
    daily: [],
    weekly: null,
    counters: createCounters(),
    weeklyCounters: createCounters(),
    claimed: [],          // ids de quêtes déjà créditées
    comboBonusClaimed: false, // bonus "combo du jour" (3/3)
    history: [],          // [{ date, completed }] — 30 derniers jours
  };
}

export function normalizeQuestState(raw) {
  const base = createQuestState();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    daily: Array.isArray(raw.daily) ? raw.daily : [],
    counters: { ...createCounters(), ...(raw.counters || {}) },
    weeklyCounters: { ...createCounters(), ...(raw.weeklyCounters || {}) },
    claimed: Array.isArray(raw.claimed) ? raw.claimed : [],
    history: Array.isArray(raw.history) ? raw.history : [],
  };
}

/** Recale l'état sur le jour (et la semaine) courants. PURE. */
export function ensureToday(state, dateISO, profile = {}) {
  const s = normalizeQuestState(state);
  const date = String(dateISO || "").slice(0, 10);
  const wk = weekKey(date);
  if (s.date === date && s.week === wk && s.daily.length) return s;

  const rolledDay = s.date !== date;
  const rolledWeek = s.week !== wk;
  const history = rolledDay && s.date
    ? [...s.history, { date: s.date, completed: s.daily.filter((q) => isQuestDone(q, s.counters)).length }].slice(-30)
    : s.history;

  return {
    ...s,
    date,
    week: wk,
    daily: rolledDay || !s.daily.length ? generateDailyQuests(date, profile) : s.daily,
    weekly: rolledWeek || !s.weekly ? generateWeeklyQuest(date, profile) : s.weekly,
    counters: rolledDay ? createCounters() : s.counters,
    weeklyCounters: rolledWeek ? createCounters() : s.weeklyCounters,
    claimed: rolledDay ? [] : s.claimed,
    comboBonusClaimed: rolledDay ? false : s.comboBonusClaimed,
    history,
  };
}

export function isQuestDone(quest, counters) {
  if (!quest) return false;
  return (counters?.[quest.counter] || 0) >= quest.target;
}

export function questProgress(quest, counters) {
  const cur = Math.min(counters?.[quest.counter] || 0, quest.target);
  return { cur, max: quest.target, pct: Math.round((cur / quest.target) * 100), done: cur >= quest.target };
}

/**
 * Applique un événement de progression. PURE.
 * @param {object} state
 * @param {object} delta  ex. { reviews: 1, goodReviews: 1, bestCombo: 4 }
 * @returns {{ state, completed: Array, weeklyCompleted: boolean, comboBonus: boolean }}
 */
export function trackQuestProgress(state, delta = {}) {
  const s = normalizeQuestState(state);
  const bump = (base) => {
    const next = { ...base };
    for (const [k, v] of Object.entries(delta)) {
      if (typeof v !== "number") continue;
      // bestCombo est un max, pas un cumul.
      next[k] = k === "bestCombo" ? Math.max(next[k] || 0, v) : (next[k] || 0) + v;
    }
    return next;
  };
  const counters = bump(s.counters);
  const weeklyCounters = bump(s.weeklyCounters);

  const completed = s.daily.filter(
    (q) => isQuestDone(q, counters) && !isQuestDone(q, s.counters) && !s.claimed.includes(q.id)
  );
  const weeklyCompleted =
    !!s.weekly && isQuestDone(s.weekly, weeklyCounters) && !isQuestDone(s.weekly, s.weeklyCounters)
    && !s.claimed.includes(`weekly:${s.weekly.id}`);

  const allDone = s.daily.length > 0 && s.daily.every((q) => isQuestDone(q, counters));
  const comboBonus = allDone && !s.comboBonusClaimed;

  const claimed = [
    ...s.claimed,
    ...completed.map((q) => q.id),
    ...(weeklyCompleted && s.weekly ? [`weekly:${s.weekly.id}`] : []),
  ];

  return {
    state: { ...s, counters, weeklyCounters, claimed, comboBonusClaimed: s.comboBonusClaimed || comboBonus },
    completed,
    weeklyCompleted,
    comboBonus,
  };
}

/** Bonus XP versé quand les 3 quêtes du jour tombent le même jour. */
export const DAILY_COMBO_BONUS_XP = 100;

/** Résumé prêt pour l'UI. */
export function questSummary(state) {
  const s = normalizeQuestState(state);
  const daily = s.daily.map((q) => ({ ...q, ...questProgress(q, s.counters) }));
  const weekly = s.weekly ? { ...s.weekly, ...questProgress(s.weekly, s.weeklyCounters) } : null;
  return {
    daily,
    weekly,
    doneCount: daily.filter((q) => q.done).length,
    total: daily.length,
    allDone: daily.length > 0 && daily.every((q) => q.done),
  };
}
