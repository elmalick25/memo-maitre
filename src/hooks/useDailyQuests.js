// src/hooks/useDailyQuests.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 9 — Hook des quêtes quotidiennes & hebdo (persistées).
// Toute la logique métier vit dans lib/dailyQuests.js (pure) : ce hook ne fait
// que charger, recaler sur le jour courant, tracker et persister.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  QUESTS_STORAGE_KEY,
  createQuestState,
  normalizeQuestState,
  ensureToday,
  trackQuestProgress,
  questSummary,
  DAILY_COMBO_BONUS_XP,
} from "../lib/dailyQuests";
import { today } from "../utils/dateUtils";

export function useDailyQuests(storage, { onReward, showToast, profile } = {}) {
  const [state, setState] = useState(createQuestState);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(state);
  const timer = useRef(null);
  const profileRef = useRef(profile || {});

  useEffect(() => { ref.current = state; }, [state]);
  useEffect(() => { profileRef.current = profile || {}; }, [profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await storage.get(QUESTS_STORAGE_KEY);
        if (cancelled) return;
        setState(ensureToday(normalizeQuestState(raw), today(), profileRef.current));
      } catch (e) {
        console.warn("[quests] chargement impossible", e);
        if (!cancelled) setState(ensureToday(createQuestState(), today(), profileRef.current));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [storage]);

  const persist = useCallback((next) => {
    ref.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { storage.set(QUESTS_STORAGE_KEY, next).catch(() => {}); }, 400);
  }, [storage]);

  /** Enregistre une progression : { reviews: 1, goodReviews: 1, ... } */
  const track = useCallback((delta) => {
    if (!delta) return;
    const current = ensureToday(ref.current, today(), profileRef.current);
    const res = trackQuestProgress(current, delta);
    setState(res.state);
    persist(res.state);

    res.completed.forEach((q) => {
      onReward?.({ type: "daily", quest: q, xp: q.xp });
      showToast?.(`${q.icon} Quête bouclée : ${q.label} (+${q.xp} XP)`, "success");
    });
    if (res.weeklyCompleted && res.state.weekly) {
      onReward?.({ type: "weekly", quest: res.state.weekly, xp: res.state.weekly.xp });
      showToast?.(`🏔️ Quête de la semaine terminée ! +${res.state.weekly.xp} XP`, "success");
    }
    if (res.comboBonus) {
      onReward?.({ type: "combo", xp: DAILY_COMBO_BONUS_XP });
      showToast?.(`🎊 Combo du jour : 3/3 quêtes ! +${DAILY_COMBO_BONUS_XP} XP`, "success");
    }
    return res;
  }, [onReward, showToast, persist]);

  const summary = useMemo(() => questSummary(state), [state]);

  return { questState: state, questsLoaded: loaded, questSummary: summary, trackQuest: track };
}

export default useDailyQuests;
