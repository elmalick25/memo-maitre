// ══════════════════════════════════════════════════════════════════════════════
// SRSEngine.js — SM-2 Spaced Repetition System (Anki-compatible)
// Zero external dependencies. Works with any async storage {get, set}.
//
// ⚠️ POURQUOI DEUX MOTEURS (FSRS ET SM-2) COEXISTENT-ILS ?
// L'application utilise "fsrs.js" pour le planificateur principal des fiches (moteur moderne
// basé sur DSR/FSRS avec le module de dates centralisé dateUtils.js).
// "SRSEngine.js" est conservé par souci de rétrocompatibilité pour les anciens modules
// ou les expériences isolées (comme le Lab ou d'anciens decks).
// TODO: Converger vers FSRS uniquement dans une future version majeure.
// ══════════════════════════════════════════════════════════════════════════════

export const SRS_STORAGE_KEY = "srs_data_v1";

// ── SM-2 core algorithm ────────────────────────────────────────────────────────
// score: 0 (oublié) | 1 (difficile) | 2 (incertain) | 3 (correct) | 4 (facile) | 5 (trivial)
// Returns updated card state: { interval, repetitions, easeFactor, nextReview, history }
export function sm2Update(card, score) {
  let { interval = 1, repetitions = 0, easeFactor = 2.5, history = [] } = card;

  // Reset if score < 3 (failed recall)
  if (score < 3) {
    interval = 1;
    repetitions = 0;
  } else {
    // Compute next interval
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Update ease factor (EF)
  easeFactor = easeFactor + 0.1 - (5 - score) * (0.08 + (5 - score) * 0.02);
  easeFactor = Math.max(1.3, Math.round(easeFactor * 1000) / 1000); // floor at 1.3

  const nextReview = Date.now() + interval * 24 * 60 * 60 * 1000; // ms timestamp

  const entry = { date: new Date().toISOString().slice(0, 10), score, interval };
  const newHistory = [...(history || []), entry].slice(-200); // keep last 200 reviews

  return { interval, repetitions, easeFactor, nextReview, history: newHistory };
}

// ── Default card state ─────────────────────────────────────────────────────────
export function defaultCardState() {
  return {
    interval: 1,
    repetitions: 0,
    easeFactor: 2.5,
    nextReview: Date.now(), // due now
    history: [],
  };
}

// ── Load full SRS data map from storage ────────────────────────────────────────
export async function loadSRSData(storage) {
  try {
    const data = await storage.get(SRS_STORAGE_KEY);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

// ── Save full SRS data map to storage ─────────────────────────────────────────
export async function saveSRSData(storage, data) {
  try {
    await storage.set(SRS_STORAGE_KEY, data);
  } catch (e) {
    console.error("[SRS] Save failed:", e);
  }
}

// ── Save a single card review ──────────────────────────────────────────────────
export async function recordReview(storage, cardId, score, currentData) {
  const existing = currentData[cardId] || defaultCardState();
  const updated = sm2Update(existing, score);
  const newData = { ...currentData, [cardId]: updated };
  await saveSRSData(storage, newData);
  return { newData, updatedCard: updated };
}

// ── Statistics ─────────────────────────────────────────────────────────────────
// Returns { overdueCount, dueTodayCount, nextReviewMs, urgentCards, upcomingCards }
export function getSRSStats(expressions, srsData) {
  const now = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayEndMs = todayEnd.getTime();

  const results = expressions
    .filter(e => e && e.id)
    .map(expr => {
      const s = srsData[expr.id] || defaultCardState();
      return {
        id: expr.id,
        front: expr.front || "",
        back: expr.back || "",
        category: expr.category || "",
        nextReview: s.nextReview,
        interval: s.interval,
        repetitions: s.repetitions,
        easeFactor: s.easeFactor,
        isOverdue: s.nextReview < now,
        isDueToday: s.nextReview >= now && s.nextReview <= todayEndMs,
      };
    })
    .sort((a, b) => a.nextReview - b.nextReview); // most urgent first

  const overdueCards   = results.filter(r => r.isOverdue);
  const dueTodayCards  = results.filter(r => r.isDueToday);
  const futureCards    = results.filter(r => !r.isOverdue && !r.isDueToday);

  const nextReviewMs = futureCards.length > 0 ? futureCards[0].nextReview : null;

  return {
    overdueCount:   overdueCards.length,
    dueTodayCount:  dueTodayCards.length,
    nextReviewMs,
    urgentCards:    overdueCards.slice(0, 5),   // top 5 most overdue
    upcomingCards:  dueTodayCards.slice(0, 5),
    allSorted:      results,
    overdueCards,
    dueTodayCards,
  };
}

// ── Heatmap data for last N days ───────────────────────────────────────────────
// Returns array of { date: "YYYY-MM-DD", count, totalScore }[]  for last 7 days
export function getHeatmapData(srsData, days = 7) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    let count = 0;
    let totalScore = 0;
    Object.values(srsData).forEach(card => {
      (card.history || []).forEach(h => {
        if (h.date === dateStr) {
          count++;
          totalScore += h.score || 0;
        }
      });
    });
    result.push({ date: dateStr, count, avgScore: count > 0 ? totalScore / count : 0 });
  }
  return result;
}

// ── Weekly stats for Claude narrative ─────────────────────────────────────────
export function getWeeklyStatsForClaude(expressions, srsData) {
  const heatmap = getHeatmapData(srsData, 7);
  const totalReviews  = heatmap.reduce((s, d) => s + d.count, 0);
  const activeDays    = heatmap.filter(d => d.count > 0).length;
  const { overdueCount, dueTodayCount, urgentCards } = getSRSStats(expressions, srsData);

  // Average ease factor across all tracked cards
  const tracked = Object.values(srsData);
  const avgEF = tracked.length > 0
    ? (tracked.reduce((s, c) => s + (c.easeFactor || 2.5), 0) / tracked.length).toFixed(2)
    : "2.50";

  // Most struggling words (lowest ease factor)
  const struggling = expressions
    .filter(e => srsData[e.id])
    .map(e => ({ front: e.front, ef: srsData[e.id].easeFactor || 2.5 }))
    .sort((a, b) => a.ef - b.ef)
    .slice(0, 5)
    .map(w => `"${w.front.slice(0, 40)}" (EF: ${w.ef.toFixed(2)})`);

  return {
    totalReviews,
    activeDays,
    avgEF,
    overdueCount,
    dueTodayCount,
    urgentFront: urgentCards.map(c => c.front.slice(0, 30)),
    heatmap: heatmap.map(d => `${d.date}: ${d.count} révisions`).join(" | "),
    struggling,
  };
}

// ── Format "next review in Xh / Xj" ──────────────────────────────────────────
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

// ── Score labels mapping ───────────────────────────────────────────────────────
export const SCORE_BUTTONS = [
  { score: 0, label: "Oublié",   emoji: "😵", color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
  { score: 2, label: "Difficile",emoji: "😓", color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  { score: 3, label: "Correct",  emoji: "✅", color: "#22C55E", bg: "rgba(34,197,94,0.12)"   },
  { score: 5, label: "Facile",   emoji: "🚀", color: "#4D6BFE", bg: "rgba(77, 107, 254,0.12)"  },
];
