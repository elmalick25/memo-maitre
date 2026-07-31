// src/hooks/useXPLedger.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 1 — Hook du ledger XP (persisté, jamais recalculé).
// Gère aussi le combo de session et la file d'attente de toasts XP.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  XP_STORAGE_KEY,
  createXPState,
  normalizeXPState,
  applyXPEvent,
  xpForReview,
  xpForSource,
  migrateLegacyPowerLevel,
  legacyPowerLevel,
  comboLabel,
  XP_SOURCES,
} from "../lib/xpEngine";
import { getArchetype } from "../constants/gamification";
import { today } from "../utils/dateUtils";
import { rollReward, dailyMultiplier, dailyMultiplierFor } from "../lib/rewardRoll";
import { prestigeMultiplier, chestLuck } from "../lib/unlocks";

export function useXPLedger(storage, showToast) {
  const [xpState, setXpState] = useState(createXPState);
  const [loaded, setLoaded] = useState(false);
  const [combo, setCombo] = useState(0);
  // CHANTIER 10/11 : meilleur combo de LA session en cours (≠ streak de jours).
  const [sessionBestCombo, setSessionBestCombo] = useState(0);
  // CHANTIER 8 : dernier coffre tiré (consommé par l'UI puis remis à null).
  const [lastChest, setLastChest] = useState(null);
  const stateRef = useRef(xpState);
  const persistTimer = useRef(null);

  useEffect(() => { stateRef.current = xpState; }, [xpState]);

  // ── Chargement ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await storage.get(XP_STORAGE_KEY);
        if (cancelled) return;
        setXpState(normalizeXPState(raw));
      } catch (e) {
        console.warn("[xp] chargement impossible", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [storage]);

  const persist = useCallback((next) => {
    stateRef.current = next;
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      storage.set(XP_STORAGE_KEY, next).catch(() => {});
    }, 400);
  }, [storage]);

  const commit = useCallback((next, toast) => {
    setXpState(next);
    persist(next);
    if (toast && showToast) setTimeout(() => showToast(toast, "info"), 0);
  }, [persist, showToast]);

  /**
   * Migration douce : crédite une seule fois l'équivalent de l'ancien
   * powerLevel dérivé pour ne pas faire redémarrer les utilisateurs à 0.
   */
  const migrateOnce = useCallback((legacyParts) => {
    if (!loaded) return;
    const cur = stateRef.current;
    if (cur.migratedFromLegacy) return;
    const seed = legacyPowerLevel(legacyParts);
    const next = migrateLegacyPowerLevel(cur, seed);
    setXpState(next);
    persist(next);
    if (seed > 0 && showToast) {
      setTimeout(() => showToast(`✨ Progression reportée : ${seed.toLocaleString("fr-FR")} XP crédités.`, "success"), 600);
    }
  }, [loaded, persist, showToast]);

  /** XP d'une révision (difficulté + combo + streak + multiplicateur du jour). */
  const awardReview = useCallback((q, streak) => {
    const nextCombo = q === 0 ? 0 : combo + 1;
    setCombo(nextCombo);
    setSessionBestCombo((b) => Math.max(b, nextCombo));

    const gain = xpForReview(q, nextCombo, streak);
    const cur = stateRef.current;
    const level = getArchetype(cur.totalXP)?.level || 0;

    // ── CHANTIER 8 : multiplicateur du jour + prestige, appliqués au gain ──
    const daily = dailyMultiplier(today());
    const dayMult = dailyMultiplierFor(daily, gain.source);
    const pMult = prestigeMultiplier(cur.prestige);
    const amount = Math.max(1, Math.round(gain.amount * dayMult * pMult));

    let next = applyXPEvent(cur, {
      source: gain.source,
      amount,
      date: today(),
      reviews: 1,
      combo: nextCombo,
    });

    // ── CHANTIER 8 : tirage de coffre (déterministe, jamais pénalisant) ──
    const since = (cur.reviewsSinceChest || 0) + 1;
    const chest = rollReward(`${today()}:${next.totalXP}:${since}`, {
      reviewsSinceChest: since,
      baseXP: amount,
      rating: q,
      chestBoost: (daily.scope === "chest" ? 2 : 1) * chestLuck(level),
    });

    if (chest) {
      next = { ...next, reviewsSinceChest: 0, chestsOpened: (next.chestsOpened || 0) + 1 };
      if (chest.bonusXP > 0) {
        next = applyXPEvent(next, { source: "CHEST_BONUS", amount: chest.bonusXP, date: today() });
        next = { ...next, bonusXP: (next.bonusXP || 0) + chest.bonusXP };
      }
      setLastChest({ ...chest, key: Date.now() });
    } else {
      next = { ...next, reviewsSinceChest: since };
    }

    setXpState(next);
    persist(next);

    return {
      ...gain,
      amount,
      dayMult,
      prestigeMult: pMult,
      dailyBonus: dayMult > 1 ? daily : null,
      comboCount: nextCombo,
      comboLabel: comboLabel(nextCombo),
      bonusRoll: chest,   // ← événement optionnel, l'API de base ne change pas
    };
  }, [combo, persist]);

  /** XP d'une source explicite (création, pomodoro, PDF, leech, mastery…). */
  const awardSource = useCallback((source, { streak = 0, qty = 1, silent = false } = {}) => {
    const gain = xpForSource(source, streak, qty);
    if (!gain.amount) return gain;
    const cur = stateRef.current;
    const daily = dailyMultiplier(today());
    const dayMult = dailyMultiplierFor(daily, source);
    const amount = Math.max(1, Math.round(gain.amount * dayMult * prestigeMultiplier(cur.prestige)));
    const next = applyXPEvent(cur, { source, amount, date: today() });
    const suffix = dayMult > 1 ? ` ${daily.icon} ×${daily.mult}` : "";
    commit(next, silent ? null : `+${amount} XP · ${XP_SOURCES[source]?.label || source}${suffix}`);
    return { ...gain, amount, dayMult };
  }, [commit]);

  /**
   * CHANTIER 8 — XP bonus (coffre, quête, combo du jour).
   * Passe par le même ledger : rien n'est « hors comptabilité ».
   */
  const awardBonusXP = useCallback((amount, source = "CHEST_BONUS", label = null) => {
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    if (!amt) return 0;
    const next = applyXPEvent(stateRef.current, { source, amount: amt, date: today() });
    const withBonus = { ...next, bonusXP: (next.bonusXP || 0) + amt };
    commit(withBonus, label);
    return amt;
  }, [commit]);

  /** CHANTIER 12 — prestige : renaissance au niveau 1, bonus XP permanent. */
  const doPrestige = useCallback(() => {
    const cur = stateRef.current;
    const next = { ...cur, totalXP: 0, prestige: (cur.prestige || 0) + 1, bestCombo: cur.bestCombo };
    setXpState(next);
    persist(next);
    if (showToast) setTimeout(() => showToast(`♾️ Prestige ${next.prestige} : tu renais niveau 1 avec un bonus XP permanent.`, "success"), 0);
    return next.prestige;
  }, [persist, showToast]);

  const resetCombo = useCallback(() => { setCombo(0); setSessionBestCombo(0); }, []);
  const clearChest = useCallback(() => setLastChest(null), []);

  /**
   * CHANTIER 25 — Coffre GARANTI (journée parfaite de routine, etc.).
   * Contrairement au tirage variable, celui-ci n'est pas une loterie : il est
   * accordé parce qu'un objectif certain a été atteint.
   */
  const grantChest = useCallback((chest) => {
    if (!chest) return null;
    setLastChest(chest);
    if (chest.bonusXP) {
      const next = applyXPEvent(stateRef.current, { source: "CHEST_BONUS", amount: chest.bonusXP, date: today() });
      commit({ ...next, bonusXP: (next.bonusXP || 0) + chest.bonusXP, chestsOpened: (next.chestsOpened || 0) + 1 }, null);
    }
    return chest;
  }, [commit]);

  const archetype = useMemo(() => getArchetype(xpState.totalXP), [xpState.totalXP]);

  /** CHANTIER 8 — multiplicateur du jour (mémoïsé, déterministe par date). */
  const todayMultiplier = useMemo(() => dailyMultiplier(today()), []);

  return {
    xpState,
    xpLoaded: loaded,
    totalXP: xpState.totalXP,
    archetype,
    combo,
    sessionBestCombo,
    bestCombo: xpState.bestCombo || 0,
    prestige: xpState.prestige || 0,
    todayMultiplier,
    lastChest,
    clearChest,
    grantChest,
    awardReview,
    awardSource,
    awardBonusXP,
    doPrestige,
    resetCombo,
    migrateOnce,
  };
}

export default useXPLedger;
