// ══════════════════════════════════════════════════════════════════════════════
// reviewStats.js — Statistiques SRS lues DIRECTEMENT sur les expressions (FSRS)
//
// Remplace les anciennes fonctions de src/lib/SRSEngine.js (SM-2) qui lisaient
// un store séparé "srs_data_v1". Il n'existe plus qu'UNE seule source de vérité :
// les fiches `expression` elles-mêmes (champs nextReview, stability, difficulty,
// interval, repetitions, reviewHistory).
//
// Format d'une entrée reviewHistory (créée par MemoMaster.handleAnswerWithFeedback
// et par le nouvel onglet SRS de EnglishPractice) :
//   { date: "YYYY-MM-DD", q: 0|1|3|5, newLevel: number, interval: number,
//     migratedFromSM2?: boolean }
//
// Mapping choisi pour `avgScore` de la heatmap :
//   On utilise directement `q` (0/1/3/5) comme échelle 0-5. Les entrées SM-2
//   migrées (étape 4) sont converties score→q AU MOMENT de la migration selon :
//     score 0    → q 0    (raté)
//     score 1-2  → q 1    (difficile)
//     score 3-4  → q 3    (correct)
//     score 5    → q 5    (facile)
//   → la heatmap est donc uniforme quelle que soit l'origine.
//
// Concept "aisance" en FSRS :
//   SM-2  : easeFactor haut = facile     → struggling = tri ASC
//   FSRS  : difficulty haut = difficile  → struggling = tri DESC  (INVERSÉ)
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// Couche 8 — Impact réel du plafonnement sur la rétention (Q : "ça baisse mes 90% ?")
//
// Le plafond de session (Couche 2) ne modifie JAMAIS `nextReview` : une fiche
// non servie reste due, inchangée, et continue de décliner selon la courbe de
// l'oubli. Cette fonction mesure, sur l'état ACTUEL des fiches en retard, la
// rétrievabilité réelle (R, formule FSRS) vs la cible théorique (~90%) —
// sans avoir besoin de reconstruire tout l'historique.
// ══════════════════════════════════════════════════════════════════════════════
import { fsrsR } from "./fsrs.js";
import { diffDays, today as getTodayStr } from "../utils/dateUtils.js";
import { isCardMastered, isDueCard } from "./cardStatus.js";

/**
 * @returns {{ count: number, avgRetention: number|null, avgOverdueDays: number, worstRetention: number|null }}
 */
export function estimateBacklogRetention(expressions, todayISO) {
  const list = (Array.isArray(expressions) ? expressions : []).filter(
    (e) => e && typeof e.stability === "number" && e.stability > 0 && e.nextReview
  );
  let sumR = 0, sumOverdue = 0, counted = 0, worst = 1;
  for (const e of list) {
    const overdueDays = Math.max(0, diffDays(todayISO, e.nextReview));
    if (overdueDays <= 0) continue; // pas en retard → pas concernée
    const elapsed = (Number(e.interval) || 0) + overdueDays;
    const r = fsrsR(elapsed, e.stability);
    sumR += r; sumOverdue += overdueDays; counted++;
    if (r < worst) worst = r;
  }
  if (!counted) return { count: 0, avgRetention: null, avgOverdueDays: 0, worstRetention: null };
  return {
    count: counted,
    avgRetention: +(sumR / counted).toFixed(3),
    avgOverdueDays: +(sumOverdue / counted).toFixed(1),
    worstRetention: +worst.toFixed(3),
  };
}

// ── Score buttons (repris tels quels depuis SRSEngine, pure UI) ───────────────
export const SCORE_BUTTONS = [
  { score: 0, label: "Oublié",    emoji: "😵", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  { score: 1, label: "Difficile", emoji: "😓", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  { score: 3, label: "Correct",   emoji: "✅", color: "#22C55E", bg: "rgba(34,197,94,0.12)" },
  { score: 5, label: "Facile",    emoji: "🚀", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
];

// ── Format "next review in Xh / Xj" (pur) ────────────────────────────────────
export function formatTimeUntil(ms) {
  if (!ms) return null;
  const diff = ms - Date.now();
  if (diff <= 0) return "maintenant";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(diff / 86400000);
  return `${days}j`;
}

// ── Normalise `expression.nextReview` (peut être ISO "YYYY-MM-DD" ou number ms)
function nextReviewMs(expr) {
  const nr = expr?.nextReview;
  if (nr == null) return Date.now(); // due now par défaut
  if (typeof nr === "number") return nr;
  if (typeof nr === "string") {
    // ISO date → timestamp (fin de journée pour compat avec l'ancien comportement)
    const t = Date.parse(nr.length === 10 ? nr + "T00:00:00" : nr);
    return Number.isFinite(t) ? t : Date.now();
  }
  return Date.now();
}

// ── getSRSStats(expressions) : due/overdue calculés DEPUIS l'expression ──────
export function getSRSStats(expressions) {
  const now = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayEndMs = todayEnd.getTime();

  const results = (expressions || [])
    .filter(e => e && e.id)
    .map(expr => {
      const nr = nextReviewMs(expr);
      return {
        id: expr.id,
        front: expr.front || "",
        back: expr.back || "",
        category: expr.category || "",
        nextReview: nr,
        interval: expr.interval ?? 1,
        repetitions: expr.repetitions ?? 0,
        stability: expr.stability ?? null,
        difficulty: expr.difficulty ?? null,
        // easeFactor conservé pour compat rétro d'affichage éventuel
        easeFactor: expr.easeFactor ?? 2.5,
        isOverdue: nr < now,
        isDueToday: nr >= now && nr <= todayEndMs,
      };
    })
    .sort((a, b) => a.nextReview - b.nextReview);

  const overdueCards  = results.filter(r => r.isOverdue);
  const dueTodayCards = results.filter(r => r.isDueToday);
  const futureCards   = results.filter(r => !r.isOverdue && !r.isDueToday);

  return {
    overdueCount:  overdueCards.length,
    dueTodayCount: dueTodayCards.length,
    nextReviewMs:  futureCards.length > 0 ? futureCards[0].nextReview : null,
    urgentCards:   overdueCards.slice(0, 5),
    upcomingCards: dueTodayCards.slice(0, 5),
    allSorted:     results,
    overdueCards,
    dueTodayCards,
  };
}

// ── getHeatmapData(expressions, days) : parcourt expression.reviewHistory ────
// Retourne [{ date: "YYYY-MM-DD", count, avgScore }] pour les `days` derniers jours.
export function getHeatmapData(expressions, days = 7) {
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    buckets.set(dateStr, { date: dateStr, count: 0, totalScore: 0 });
  }

  (expressions || []).forEach(expr => {
    (expr?.reviewHistory || []).forEach(h => {
      if (!h || !h.date) return;
      const bucket = buckets.get(h.date);
      if (!bucket) return;
      // q est l'échelle unifiée 0/1/3/5 (voir mapping en tête de fichier).
      // On tolère un ancien champ `score` au cas où (fallback direct).
      const q = typeof h.q === "number" ? h.q : (typeof h.score === "number" ? h.score : 0);
      bucket.count += 1;
      bucket.totalScore += q;
    });
  });

  return Array.from(buckets.values()).map(b => ({
    date: b.date,
    count: b.count,
    avgScore: b.count > 0 ? b.totalScore / b.count : 0,
  }));
}

// ── getWeeklyStatsForClaude(expressions) : narrative hebdo pour le coach IA ──
export function getWeeklyStatsForClaude(expressions) {
  const heatmap = getHeatmapData(expressions, 7);
  const totalReviews = heatmap.reduce((s, d) => s + d.count, 0);
  const activeDays   = heatmap.filter(d => d.count > 0).length;
  const { overdueCount, dueTodayCount, urgentCards } = getSRSStats(expressions);

  // Fiches ayant au moins une révision → celles qu'on peut réellement noter
  const tracked = (expressions || []).filter(
    e => e && Array.isArray(e.reviewHistory) && e.reviewHistory.length > 0
  );

  // Difficulty moyenne (échelle FSRS 1..10 ; haut = plus dur)
  const avgDiff = tracked.length > 0
    ? tracked.reduce((s, e) => s + (typeof e.difficulty === "number" ? e.difficulty : 5), 0) / tracked.length
    : 5;

  // Équivalent "aisance" traditionnel pour l'affichage : on convertit
  // difficulty [1..10] → indicateur type easeFactor [1.3..2.8] approximatif.
  // ef ≈ 2.8 - ((D - 1) / 9) * 1.5   (D=1 → 2.8 ; D=10 → 1.3)
  const avgEF = (2.8 - ((avgDiff - 1) / 9) * 1.5).toFixed(2);

  // "Struggling" = fiches les plus DURES → tri difficulty DESC (inverse SM-2)
  const struggling = tracked
    .map(e => ({
      front: e.front || "",
      difficulty: typeof e.difficulty === "number" ? e.difficulty : 5,
    }))
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 5)
    .map(w => `"${w.front.slice(0, 40)}" (D: ${w.difficulty.toFixed(2)})`);

  // ── Phase 5 — Résumé des usages productifs de la semaine ────────────────────
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  let productiveUsesWeek = 0;
  const contextsWeek = new Set();
  const stageCounts = { discovered: 0, recognized: 0, recalled: 0, produced: 0, mastered: 0 };
  (expressions || []).forEach(e => {
    const stage = e?.masteryStage;
    if (stage && stageCounts[stage] != null) stageCounts[stage] += 1;
    (e?.productiveUses || []).forEach(u => {
      const t = typeof u?.date === "number" ? u.date : Date.parse(u?.date || "");
      if (Number.isFinite(t) && t >= weekAgo && u.correct) {
        productiveUsesWeek += 1;
        if (u.context) contextsWeek.add(u.context);
      }
    });
  });

  return {
    totalReviews,
    activeDays,
    avgEF,                    // même nom de champ qu'avant pour la UI
    avgDifficulty: +avgDiff.toFixed(2),
    overdueCount,
    dueTodayCount,
    urgentFront: urgentCards.map(c => (c.front || "").slice(0, 30)),
    heatmap: heatmap.map(d => `${d.date}: ${d.count} révisions`).join(" | "),
    struggling,
    // Phase 5 — nouveaux champs (rétrocompat : anciens champs préservés)
    productiveUsesWeek,
    productiveContextsWeek: Array.from(contextsWeek),
    masteryBreakdown: stageCounts,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Couche 7 — Instrumentation légère + garde-fou côté création
//
// Objectif : régler les constantes des couches 2 et 3 sur des DONNÉES RÉELLES
// (après ~2 semaines d'usage) plutôt que sur une estimation. On logge donc
// chaque jour : la taille de la pile due, la composition de la session servie,
// et le nombre de nouvelles fiches créées (génération IA + sauvetage de leech
// « ATOMISER » confondus — sinon l'entrée fuit par un chemin non mesuré).
//
// Fonctions PURES : la persistance (localStorage) est faite par l'appelant.
// ══════════════════════════════════════════════════════════════════════════════

/** Clé de persistance du journal (localStorage, géré par l'appelant). */
export const REVIEW_LOAD_LOG_KEY = "memomaitre_reviewLoadLog_v1";
/** Nombre de jours conservés dans le journal (rolling window). */
export const REVIEW_LOAD_LOG_MAX_DAYS = 60;
/**
 * Garde-fou création : au-delà de ce nombre de fiches JAMAIS VUES en attente,
 * on avertit (sans jamais bloquer) au moment de créer/générer des fiches.
 */
export const CREATION_GUARD_NEW_CARDS_THRESHOLD = 300;

/** Entrée vierge de journal pour un jour donné. */
export function makeDailyLogEntry(dateISO) {
  return {
    date: dateISO,
    pileSize: 0,          // fiches réellement dues ce jour-là
    served: 0,            // fiches effectivement servies en session
    leeches: 0,
    backlog: 0,
    due: 0,
    consolidation: 0,
    newCardsServed: 0,    // nouvelles fiches admises par le budget d'entrée
    newCardsCreated: 0,   // fiches créées (génération + sauvetage de leech)
    neverSeenBacklog: 0,  // total de fiches repetitions === 0 en attente
  };
}

/**
 * Fusionne un delta dans le journal pour la date donnée.
 * Les champs numériques fournis en `delta` sont ADDITIONNÉS, sauf
 * `pileSize` / `neverSeenBacklog` qui sont des instantanés (remplacés).
 *
 * @returns {Array} nouveau journal (tronqué à REVIEW_LOAD_LOG_MAX_DAYS).
 */
export function appendDailyLog(log, dateISO, delta = {}) {
  const list = Array.isArray(log) ? log.slice() : [];
  const idx = list.findIndex((e) => e && e.date === dateISO);
  const base = idx >= 0 ? { ...list[idx] } : makeDailyLogEntry(dateISO);
  const SNAPSHOT_FIELDS = new Set(["pileSize", "neverSeenBacklog"]);

  Object.entries(delta).forEach(([k, v]) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    base[k] = SNAPSHOT_FIELDS.has(k) ? v : (Number(base[k]) || 0) + v;
  });

  if (idx >= 0) list[idx] = base; else list.push(base);
  list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return list.slice(-REVIEW_LOAD_LOG_MAX_DAYS);
}

/** Résumé lisible du journal sur N jours (pour calibrer les seuils). */
export function summarizeReviewLoad(log, days = 14) {
  const list = (Array.isArray(log) ? log : []).slice(-days);
  if (!list.length) return { days: 0, avgPile: 0, avgServed: 0, avgCreated: 0, maxPile: 0 };
  const sum = (k) => list.reduce((s, e) => s + (Number(e?.[k]) || 0), 0);
  return {
    days: list.length,
    avgPile: +(sum("pileSize") / list.length).toFixed(1),
    avgServed: +(sum("served") / list.length).toFixed(1),
    avgCreated: +(sum("newCardsCreated") / list.length).toFixed(1),
    maxPile: list.reduce((m, e) => Math.max(m, Number(e?.pileSize) || 0), 0),
  };
}

/** Nombre de fiches jamais vues en attente (repetitions === 0). */
export function countNeverSeenCards(expressions) {
  return (Array.isArray(expressions) ? expressions : []).filter(
    (e) => e && (Number(e.repetitions) || 0) === 0 && !e.paused
  ).length;
}

/**
 * Garde-fou création (INFORMATIF, jamais bloquant).
 * @returns {{ warn: boolean, count: number, threshold: number, message: string|null }}
 */
export function checkCreationGuard(expressions, opts = {}) {
  const threshold = opts.threshold ?? CREATION_GUARD_NEW_CARDS_THRESHOLD;
  const count = countNeverSeenCards(expressions);
  const warn = count >= threshold;
  return {
    warn,
    count,
    threshold,
    message: warn
      ? `⚠️ ${count} fiches jamais vues en attente (seuil ${threshold}) — la création reste possible, mais pense à absorber le stock avant d'en générer davantage.`
      : null,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Calculs Statistiques Dynamiques FSRS & Activité
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calcule l'activité quotidienne réelle sur les `days` derniers jours (par défaut 30).
 * @returns {Array<{ date: string, count: number }>}
 */
export function computeDailyProgress(sessions = [], expressions = [], days = 30) {
  const buckets = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const toLocal = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets.set(toLocal(d), 0);
  }

  // 1) Agrégation depuis sessions
  (sessions || []).forEach(s => {
    if (!s || !s.date) return;
    const key = String(s.date).slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, buckets.get(key) + (Number(s.count) || 0));
    }
  });

  // 2) Agrégation depuis reviewHistory des fiches (pour garantir la complétude)
  const historyCounts = new Map();
  (expressions || []).forEach(e => {
    (e?.reviewHistory || []).forEach(h => {
      if (!h) return;
      let dateStr = null;
      if (typeof h.date === "string") {
        dateStr = h.date.slice(0, 10);
      } else if (typeof h.date === "number" || typeof h.timestamp === "number") {
        dateStr = toLocal(new Date(h.date || h.timestamp));
      }
      if (dateStr && buckets.has(dateStr)) {
        historyCounts.set(dateStr, (historyCounts.get(dateStr) || 0) + 1);
      }
    });
  });

  // Maximum entre sessions et reviewHistory par jour
  buckets.forEach((count, key) => {
    const histCount = historyCounts.get(key) || 0;
    buckets.set(key, Math.max(count, histCount));
  });

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

/**
 * Calcule la maîtrise et les statistiques détaillées par module.
 * @returns {Array<{ name: string, total: number, mastered: number, due: number, pct: number, avgDiff: number|string, lastReview: string }>}
 */
export function computeModuleComparison(categories = [], expressions = []) {
  const list = Array.isArray(expressions) ? expressions : [];
  const catMap = new Map();

  (categories || []).forEach(c => {
    if (c?.name) catMap.set(c.name, { name: c.name, total: 0, mastered: 0, due: 0, diffSum: 0, countWithDiff: 0, lastReview: null });
  });

  const todayStr = getTodayStr();

  list.forEach(e => {
    if (!e) return;
    const catName = e.category || "Autre";
    if (!catMap.has(catName)) {
      catMap.set(catName, { name: catName, total: 0, mastered: 0, due: 0, diffSum: 0, countWithDiff: 0, lastReview: null });
    }
    const item = catMap.get(catName);
    item.total += 1;
    if (isCardMastered(e)) item.mastered += 1;
    if (isDueCard(e, todayStr)) item.due += 1;
    if (typeof e.difficulty === "number" && !isNaN(e.difficulty)) {
      item.diffSum += e.difficulty;
      item.countWithDiff += 1;
    }
    (e.reviewHistory || []).forEach(h => {
      const d = typeof h?.date === "string" ? h.date.slice(0, 10) : null;
      if (d && (!item.lastReview || d > item.lastReview)) {
        item.lastReview = d;
      }
    });
  });

  return Array.from(catMap.values()).map(item => ({
    name: item.name,
    total: item.total,
    mastered: item.mastered,
    due: item.due,
    pct: item.total > 0 ? Math.round((item.mastered / item.total) * 100) : 0,
    avgDiff: item.countWithDiff > 0 ? +(item.diffSum / item.countWithDiff).toFixed(1) : "-",
    lastReview: item.lastReview || "-",
  }));
}

/**
 * Calcule la distribution des cartes par niveau (0 à 7).
 * @returns {Array<{ level: number, count: number }>}
 */
export function computeDifficultyDistribution(expressions = []) {
  const list = Array.isArray(expressions) ? expressions : [];
  const counts = [0, 0, 0, 0, 0, 0, 0, 0];
  list.forEach(e => {
    if (!e) return;
    const lvl = Math.min(7, Math.max(0, Math.round(Number(e.level) || 0)));
    counts[lvl] += 1;
  });
  return counts.map((count, level) => ({ level, count }));
}

/**
 * Calcule la répartition de l'activité par jour de la semaine (Lundi à Dimanche).
 * @returns {Array<{ name: string, dayIndex: number, reviews: number }>}
 */
export function computeDayOfWeekPerformance(sessions = [], expressions = []) {
  const DAYS = [
    { name: "Lundi", dayIndex: 1, reviews: 0 },
    { name: "Mardi", dayIndex: 2, reviews: 0 },
    { name: "Mercredi", dayIndex: 3, reviews: 0 },
    { name: "Jeudi", dayIndex: 4, reviews: 0 },
    { name: "Vendredi", dayIndex: 5, reviews: 0 },
    { name: "Samedi", dayIndex: 6, reviews: 0 },
    { name: "Dimanche", dayIndex: 0, reviews: 0 },
  ];

  const dayMap = new Map();
  DAYS.forEach(d => dayMap.set(d.dayIndex, d));

  const dateReviewMap = new Map();
  (sessions || []).forEach(s => {
    if (!s?.date) return;
    const d = String(s.date).slice(0, 10);
    dateReviewMap.set(d, (dateReviewMap.get(d) || 0) + (Number(s.count) || 0));
  });

  (expressions || []).forEach(e => {
    (e?.reviewHistory || []).forEach(h => {
      if (!h?.date) return;
      const d = String(h.date).slice(0, 10);
      if (!dateReviewMap.has(d)) {
        dateReviewMap.set(d, 1);
      }
    });
  });

  dateReviewMap.forEach((count, dateStr) => {
    const dt = new Date(dateStr + "T12:00:00");
    if (!isNaN(dt.getTime())) {
      const dayIdx = dt.getDay();
      const entry = dayMap.get(dayIdx);
      if (entry) entry.reviews += count;
    }
  });

  return DAYS;
}

/**
 * Extrait les cartes les plus difficiles.
 */
export function computeTopDifficultCards(expressions = [], limit = 5) {
  const list = (Array.isArray(expressions) ? expressions : []).filter(e => e && e.front);
  return list
    .map(e => ({
      id: e.id,
      front: e.front,
      back: e.back,
      category: e.category,
      difficulty: typeof e.difficulty === "number" ? e.difficulty : 5,
      stability: typeof e.stability === "number" ? e.stability : 1,
      lapseCount: Number(e.lapseCount) || 0,
    }))
    .sort((a, b) => b.difficulty - a.difficulty || a.stability - b.stability)
    .slice(0, limit);
}

/**
 * Calcule les points de la courbe de rétention FSRS prévisionnelle sur N jours.
 */
export function computeRetentionCurve(expressions = [], days = 30) {
  const list = (Array.isArray(expressions) ? expressions : []).filter(
    e => e && typeof e.stability === "number" && e.stability > 0
  );
  const avgStability = list.length > 0
    ? list.reduce((s, e) => s + e.stability, 0) / list.length
    : 5;
  const points = [];
  for (let t = 1; t <= days; t++) {
    points.push({ day: t, retention: Math.round(fsrsR(t, avgStability) * 100) });
  }
  return points;
}

/**
 * Calcule combien de fiches seront dues chaque jour des `days` prochains jours.
 * @returns {Array<{ date: string, count: number }>}
 */
export function computeFsrsForecast(expressions = [], days = 7) {
  const buckets = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const toLocal = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    buckets.set(toLocal(d), 0);
  }

  (expressions || []).forEach(e => {
    if (!e || e.paused) return;
    const nr = e.nextReview || e.dueDate;
    if (!nr) return;
    let dateStr = null;
    if (typeof nr === "number") {
      dateStr = toLocal(new Date(nr));
    } else if (typeof nr === "string") {
      dateStr = nr.slice(0, 10);
    }
    if (dateStr && buckets.has(dateStr)) {
      buckets.set(dateStr, buckets.get(dateStr) + 1);
    }
  });

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}
