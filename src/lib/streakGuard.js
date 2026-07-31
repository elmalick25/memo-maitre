// src/lib/streakGuard.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 2 — Streak avec garde-fous.
//
// Avant : un jour manqué = retour brutal à 1.
// Maintenant :
//   • Jetons de gel (streak freeze) : 2 par mois, consommés AUTOMATIQUEMENT
//     quand un jour est manqué (1 jeton = 1 jour couvert).
//   • Fenêtre de rattrapage : si le streak casse quand même, on peut le
//     réparer dans les 24h en faisant une session — une seule fois par mois.
//
// Fonctions PURES. L'appelant persiste le résultat dans `stats`.
// ═══════════════════════════════════════════════════════════════════════════

export const FREEZE_TOKENS_PER_MONTH = 2;
export const REPAIR_WINDOW_MS = 24 * 3600 * 1000;

const monthKey = (dateStr) => String(dateStr || "").slice(0, 7);

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.round((db - da) / 86400000);
}

/** Recharge mensuelle des jetons de gel (idempotent sur le mois courant). */
export function refillFreezeTokens(stats, todayStr, bonusTokens = 0) {
  const mk = monthKey(todayStr);
  if (stats?.freezeMonth === mk) return stats;
  return {
    ...stats,
    freezeMonth: mk,
    freezeTokens: FREEZE_TOKENS_PER_MONTH + Math.max(0, bonusTokens),
    repairUsedMonth: stats?.repairUsedMonth === mk ? mk : null,
  };
}

/**
 * Met à jour le streak après une session, en consommant des jetons de gel si
 * des jours ont été manqués.
 *
 * @returns {{ stats: object, outcome: 'same-day'|'continued'|'frozen'|'broken'|'first' , frozenDays:number }}
 */
export function advanceStreak(stats, todayStr, bonusTokens = 0) {
  const base = refillFreezeTokens({ ...stats }, todayStr, bonusTokens);
  const last = base.lastSession;

  if (!last) {
    return { stats: { ...base, streak: 1, lastSession: todayStr, longestStreak: Math.max(1, base.longestStreak || 0) }, outcome: "first", frozenDays: 0 };
  }
  const gap = daysBetween(last, todayStr);

  if (gap <= 0) return { stats: base, outcome: "same-day", frozenDays: 0 };

  if (gap === 1) {
    const streak = (base.streak || 0) + 1;
    return {
      stats: { ...base, streak, lastSession: todayStr, longestStreak: Math.max(streak, base.longestStreak || 0) },
      outcome: "continued",
      frozenDays: 0,
    };
  }

  // gap >= 2 → jours manqués = gap - 1
  const missed = gap - 1;
  const tokens = Math.max(0, base.freezeTokens || 0);
  if (tokens >= missed) {
    const streak = (base.streak || 0) + 1;
    return {
      stats: {
        ...base,
        streak,
        lastSession: todayStr,
        freezeTokens: tokens - missed,
        longestStreak: Math.max(streak, base.longestStreak || 0),
        brokenStreakValue: null,
        brokenAt: null,
      },
      outcome: "frozen",
      frozenDays: missed,
    };
  }

  // Streak cassé → on mémorise la valeur perdue pour permettre un rattrapage.
  return {
    stats: {
      ...base,
      streak: 1,
      lastSession: todayStr,
      brokenStreakValue: base.streak || 0,
      brokenAt: Date.now(),
    },
    outcome: "broken",
    frozenDays: 0,
  };
}

/** Le streak cassé est-il encore réparable (24h, 1×/mois) ? */
export function canRepairStreak(stats, nowMs = Date.now(), todayStr = new Date().toISOString().slice(0, 10)) {
  if (!stats?.brokenAt || !stats?.brokenStreakValue) return false;
  if (stats.brokenStreakValue < 3) return false;             // pas la peine pour 1-2 jours
  if (stats.repairUsedMonth === monthKey(todayStr)) return false;
  return nowMs - stats.brokenAt <= REPAIR_WINDOW_MS;
}

/** Applique la réparation : le streak perdu est restauré (+1 pour aujourd'hui). */
export function repairStreak(stats, todayStr = new Date().toISOString().slice(0, 10)) {
  if (!canRepairStreak(stats, Date.now(), todayStr)) return { stats, repaired: false, restored: 0 };
  const restored = (stats.brokenStreakValue || 0) + 1;
  return {
    stats: {
      ...stats,
      streak: restored,
      longestStreak: Math.max(restored, stats.longestStreak || 0),
      brokenStreakValue: null,
      brokenAt: null,
      repairUsedMonth: monthKey(todayStr),
    },
    repaired: true,
    restored,
  };
}

/** Temps restant (ms) dans la fenêtre de rattrapage. */
export function repairTimeLeft(stats, nowMs = Date.now()) {
  if (!stats?.brokenAt) return 0;
  return Math.max(0, REPAIR_WINDOW_MS - (nowMs - stats.brokenAt));
}
