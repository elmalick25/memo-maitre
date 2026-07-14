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

// ── Score buttons (repris tels quels depuis SRSEngine, pure UI) ───────────────
export const SCORE_BUTTONS = [
  { score: 0, label: "Oublié",    emoji: "😵", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  { score: 1, label: "Difficile", emoji: "😓", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  { score: 3, label: "Correct",   emoji: "✅", color: "#22C55E", bg: "rgba(34,197,94,0.12)" },
  { score: 5, label: "Facile",    emoji: "🚀", color: "#4D6BFE", bg: "rgba(77,107,254,0.12)" },
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
