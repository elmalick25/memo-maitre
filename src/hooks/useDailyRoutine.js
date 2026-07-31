// src/hooks/useDailyRoutine.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIERS 24-26 — La routine quotidienne devient un citoyen de 1ʳᵉ classe.
//
//   24. UN SEUL état partagé (fini les lectures localStorage éparpillées) :
//       la vue complète et l'alerte d'accueil consomment ce hook.
//   25. Chaque étape cochée alimente le moteur XP (pondérée par sa durée),
//       et la « Journée Parfaite » donne un bonus + un coffre GARANTI.
//   26. Un vrai streak de routine, indépendant du streak de révision, avec
//       les mêmes garde-fous (jetons de gel) via lib/streakGuard.js.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ROUTINE_STEPS,
  ROUTINE_STORAGE_KEY,
  ROUTINE_STREAK_KEY,
  routineSummary,
  routineFraming,
  routineNearMiss,
  getStep,
} from "../lib/routineSteps";
import { advanceStreak, refillFreezeTokens } from "../lib/streakGuard";
import { today as todayStr } from "../utils/dateUtils";
import { haptic } from "../lib/haptics";

/** Bonus XP d'une journée parfaite (au-delà des étapes elles-mêmes). */
export const ROUTINE_PERFECT_BONUS_XP = 120;

const readJSON = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const writeJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
};

export function readRoutineStats() {
  const s = readJSON(ROUTINE_STREAK_KEY) || {};
  return {
    streak: s.streak || 0,
    longestStreak: s.longestStreak || 0,
    perfectDays: s.perfectDays || 0,
    lastSession: s.lastSession || null,
    freezeTokens: s.freezeTokens,
    freezeMonth: s.freezeMonth,
    repairUsedMonth: s.repairUsedMonth || null,
  };
}

/** Le nombre de jours parfaits / le streak, lisibles sans monter le hook. */
export function readRoutineChecked() {
  const saved = readJSON(ROUTINE_STORAGE_KEY);
  if (saved && saved.date === todayStr()) return saved.checked || {};
  return {};
}

/**
 * @param {object} deps
 *   awardSource(source, opts)      — moteur XP (chantier 1)
 *   awardBonusXP(amount, src, msg) — XP hors barème (bonus journée parfaite)
 *   grantChest(chest)              — coffre garanti (chantier 8)
 *   showToast(msg, type)
 *   onPerfectDay({ streak })       — hook d'effets (confettis, badges…)
 */
export function useDailyRoutine({ awardSource, awardBonusXP, grantChest, showToast, onPerfectDay } = {}) {
  const [checked, setChecked] = useState({});
  const [routineStats, setRoutineStats] = useState(readRoutineStats);
  const [hour, setHour] = useState(() => new Date().getHours());
  const perfectFired = useRef(false);
  const deps = useRef({});
  deps.current = { awardSource, awardBonusXP, grantChest, showToast, onPerfectDay };

  // ── Chargement + recalage sur le jour courant (jamais de reset brutal du
  //    streak : la journée non finie ne casse rien, seul un jour SANS 100 %
  //    consomme un jeton de gel via advanceStreak). ──
  useEffect(() => {
    const t = todayStr();
    const saved = readJSON(ROUTINE_STORAGE_KEY);
    if (saved && saved.date === t) {
      setChecked(saved.checked || {});
      perfectFired.current = ROUTINE_STEPS.every((s) => (saved.checked || {})[s.id]);
    } else {
      setChecked({});
      writeJSON(ROUTINE_STORAGE_KEY, { date: t, checked: {} });
    }
    setRoutineStats((prev) => {
      const next = refillFreezeTokens({ ...prev }, t, 0);
      if (next !== prev) writeJSON(ROUTINE_STREAK_KEY, next);
      return next;
    });
  }, []);

  // Rafraîchit la période courante (l'alerte suit la journée sans reload).
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60000);
    return () => clearInterval(id);
  }, []);

  const persistChecked = useCallback((next) => {
    writeJSON(ROUTINE_STORAGE_KEY, { date: todayStr(), checked: next });
  }, []);

  const celebratePerfectDay = useCallback(() => {
    if (perfectFired.current) return;
    perfectFired.current = true;
    const { awardBonusXP: bonus, grantChest: chest, showToast: toast, onPerfectDay: cb } = deps.current;

    // ── 26. Streak de routine (indépendant du streak de révision) ──
    const res = advanceStreak(readRoutineStats(), todayStr(), 0);
    const nextStats = { ...res.stats, perfectDays: (readRoutineStats().perfectDays || 0) + 1 };
    setRoutineStats(nextStats);
    writeJSON(ROUTINE_STREAK_KEY, nextStats);

    // ── 25. Bonus XP + coffre GARANTI (pas une loterie) ──
    bonus?.(ROUTINE_PERFECT_BONUS_XP, "ROUTINE_PERFECT_DAY", `🏆 Journée Parfaite ! +${ROUTINE_PERFECT_BONUS_XP} XP`);
    chest?.({
      id: "routine_perfect",
      label: "Coffre de la Journée Parfaite",
      icon: "🏆",
      rarity: "epique",
      xpMult: 1,
      bonusXP: 60,
      freezeToken: 0,
      empty: false,
      guaranteed: true,
    });
    haptic("routine_perfect");
    toast?.(`🌟 Routine 100 % — série de routine : ${nextStats.streak} jour${nextStats.streak > 1 ? "s" : ""}`, "success");
    cb?.({ streak: nextStats.streak, perfectDays: nextStats.perfectDays });
  }, []);

  const toggleStep = useCallback((id) => {
    setChecked((prev) => {
      const wasDone = !!prev[id];
      const next = { ...prev, [id]: !wasDone };
      if (!next[id]) delete next[id];
      persistChecked(next);

      if (!wasDone) {
        // ── 25. XP pondérée par la durée : 20 min ≠ 2 min ──
        const step = getStep(id);
        const qty = Math.max(1, Math.round((step?.duration || 5) / 5));
        deps.current.awardSource?.("ROUTINE_STEP_DONE", { qty, silent: qty <= 1 });
        haptic("routine_step");
        if (ROUTINE_STEPS.every((s) => next[s.id])) setTimeout(celebratePerfectDay, 60);
      } else {
        perfectFired.current = false;
      }
      return next;
    });
  }, [persistChecked, celebratePerfectDay]);

  const checkStep = useCallback((id) => {
    setChecked((prev) => {
      if (prev[id]) return prev;
      const next = { ...prev, [id]: true };
      persistChecked(next);
      const step = getStep(id);
      const qty = Math.max(1, Math.round((step?.duration || 5) / 5));
      deps.current.awardSource?.("ROUTINE_STEP_DONE", { qty, silent: qty <= 1 });
      haptic("routine_step");
      if (ROUTINE_STEPS.every((s) => next[s.id])) setTimeout(celebratePerfectDay, 60);
      return next;
    });
  }, [persistChecked, celebratePerfectDay]);

  const resetDay = useCallback(() => {
    perfectFired.current = false;
    setChecked({});
    persistChecked({});
  }, [persistChecked]);

  const summary = useMemo(() => routineSummary(checked, hour), [checked, hour]);
  const framing = useMemo(() => routineFraming(summary), [summary]);
  const nearMiss = useMemo(() => routineNearMiss(summary), [summary]);

  return {
    checked,
    toggleStep,
    checkStep,
    resetDay,
    summary,
    framing,
    nearMiss,
    routineStreak: routineStats.streak || 0,
    routineStats,
    steps: ROUTINE_STEPS,
  };
}

export default useDailyRoutine;
