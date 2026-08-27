import { useState, useCallback, useRef } from "react";
import { today } from "../utils/dateUtils";
import { isDue } from "../lib/fsrs";
import { antiInterferenceReorder, composeDailySession } from "../lib/memoryLab";
import { isNewCard } from "../lib/newCardIntake";
import { countNeverSeenCards } from "../lib/reviewStats";

export default function useReviewSession({
  logReviewLoad = () => {},
  expressions = [],
  setExpressions = () => {},
  categories = [],
  dailyPlanResult = {},
  dailySessionPreview = [],
  todayReviews = [],
  dailyTargetToday = 0,
  dailyPlanCompleted = false,
  duePileSize = 0,
  sessionDoneToday = 0,
  setNewCardIntake = () => {},
  consumeIntakeSlot = (p) => p,
  setView = () => {},
  showToast = () => {},
  awardSource = () => {},
  haptic = () => {},
  playSound = () => {},
}) {
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [socraticHint, setSocraticHint] = useState("");
  const [socraticMode, setSocraticMode] = useState(false);
  const [rabbitHoleOpen, setRabbitHoleOpen] = useState(false);
  const [mnemonicText, setMnemonicText] = useState("");
  const [reviewSessionDone, setReviewSessionDone] = useState(0);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [voiceReviewActive, setVoiceReviewActive] = useState(false);
  const [isEnteringFlow, setIsEnteringFlow] = useState(false);
  const [cardStartTime, setCardStartTime] = useState(null);

  const [sessionStats, setSessionStats] = useState({
    reviewed: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    startTime: null,
  });

  // 1) Tri intelligent par priorité et anti-interférence
  const getSmartQueue = useCallback((queue) => {
    const sorted = [...queue].sort((a, b) => {
      const catA = categories.find((c) => c.name === a.category);
      const catB = categories.find((c) => c.name === b.category);
      const daysA = catA?.examDate ? Math.ceil((new Date(catA.examDate) - new Date()) / 86400000) : 999;
      const daysB = catB?.examDate ? Math.ceil((new Date(catB.examDate) - new Date()) / 86400000) : 999;
      if (daysA !== daysB) return daysA - daysB;
      const diffA = a.difficulty !== undefined ? a.difficulty : (5 - (a.easeFactor || 2.5)) * 2;
      const diffB = b.difficulty !== undefined ? b.difficulty : (5 - (b.easeFactor || 2.5)) * 2;
      return diffB - diffA;
    });
    return antiInterferenceReorder(sorted);
  }, [categories]);

  // 2) Entrée dans le flow
  const handleEnterFlow = useCallback(() => {
    setIsEnteringFlow(true);
    if (window.navigator?.vibrate) window.navigator.vibrate([30, 50, 30]);
    setTimeout(() => {
      setIsEnteringFlow(false);
      startReview(null, "flow");
    }, 550);
  }, []);

  // 3) Démarrage de session de révision
  const startReview = useCallback((catFilter = null, mode = "standard", fixedQueue = null, opts = {}) => {
    let queue;
    let cappedFrom = 0;
    const bonus = opts.bonus === true;

    if (fixedQueue && fixedQueue.length > 0) {
      queue = getSmartQueue([...fixedQueue]);
    } else if (mode === "exam" && catFilter) {
      queue = getSmartQueue(expressions.filter((e) => e.category === catFilter));
    } else if (bonus) {
      const planIds = new Set(dailyPlanResult?.plan?.ids || []);
      const pool = (catFilter ? todayReviews.filter((e) => e.category === catFilter) : todayReviews)
        .filter((e) => !planIds.has(e.id));
      const extraTarget = dailyTargetToday ? Math.max(5, Math.round(dailyTargetToday / 2)) : pool.length;
      queue = getSmartQueue(composeDailySession(pool, { todayISO: today(), target: extraTarget }));
    } else {
      const examCats = (categories || [])
        .filter((c) => c.examDate)
        .filter((c) => {
          const d = Math.ceil((new Date(c.examDate) - new Date()) / 86400000);
          return d >= 0 && d <= 3;
        })
        .map((c) => c.name);

      if (!catFilter && examCats.length > 0) {
        queue = getSmartQueue(expressions.filter((e) => examCats.includes(e.category)));
      } else {
        const planRemaining = catFilter
          ? (dailySessionPreview || []).filter((e) => e.category === catFilter)
          : (dailySessionPreview || []);

        queue = [...planRemaining];

        const servedNew = queue.filter(isNewCard);
        if (servedNew.length > 0) {
          setNewCardIntake((prev) => {
            let next = prev;
            for (const c of servedNew) next = consumeIntakeSlot(next, c.id, today());
            return next;
          });
        }

        if (dailyPlanResult?.capped) {
          cappedFrom = dailyPlanResult.pileSize;
        }

        if (mode === "interleaving" || mode === "flow") {
          const byCat = {};
          queue.forEach((e) => {
            if (!byCat[e.category]) byCat[e.category] = [];
            byCat[e.category].push(e);
          });
          const cats = Object.keys(byCat);
          if (cats.length > 0) {
            const maxLen = Math.max(...cats.map((c) => byCat[c].length));
            const rr = [];
            for (let i = 0; i < maxLen; i++) {
              for (const cat of cats) {
                if (byCat[cat][i]) rr.push(byCat[cat][i]);
              }
            }
            queue = rr;
          }
        } else {
          queue = getSmartQueue(queue);
        }
      }
    }

    if (queue.length === 0) {
      if (!fixedQueue && !bonus && dailyPlanCompleted && duePileSize > 0) {
        showToast(`✅ Objectif du jour atteint (${sessionDoneToday} fiches). ${duePileSize} fiches reviendront demain — repose ta mémoire !`, "success");
      } else {
        showToast("Aucune fiche à réviser !", "info");
      }
      return;
    }

    try {
      logReviewLoad({
        pileSize: todayReviews.length,
        served: queue.length,
        newCardsServed: queue.filter(isNewCard).length,
        neverSeenBacklog: countNeverSeenCards(expressions),
      });
    } catch (e) {
      console.warn("[couche7] log", e);
    }

    setReviewQueue(queue);
    setReviewIndex(0);
    setRevealed(false);
    setUserAnswer("");
    setSocraticHint("");
    setSocraticMode(false);
    setRabbitHoleOpen(false);
    setMnemonicText("");
    setReviewSessionDone(0);
    setCardStartTime(Date.now());
    setShowSessionSummary(false);
    setSessionTimer(0);
    setView("review");

    if (cappedFrom > queue.length) {
      showToast(`🎯 Plan du jour : ${queue.length} fiches restantes sur ${cappedFrom} dues (le reste revient demain)`, "info");
    }

    setVoiceReviewActive(mode === "vocal");
  }, [
    getSmartQueue,
    expressions,
    dailyPlanResult,
    dailySessionPreview,
    todayReviews,
    dailyTargetToday,
    dailyPlanCompleted,
    duePileSize,
    sessionDoneToday,
    setNewCardIntake,
    consumeIntakeSlot,
    categories,
    setView,
    showToast,
  ]);

  const handleReveal = useCallback(() => {
    if (cardStartTime) {
      const timeTaken = Date.now() - cardStartTime;
      const card = reviewQueue[reviewIndex];
      if (timeTaken > 30000 && card?.level >= 4) {
        showToast("🧠 Fatigue cognitive détectée (> 30s). Prends ton temps ou fais une pause !", "info");
      }
    }
    setRevealed(true);
  }, [cardStartTime, reviewQueue, reviewIndex, showToast]);

  return {
    reviewQueue,
    setReviewQueue,
    reviewIndex,
    setReviewIndex,
    revealed,
    setRevealed,
    userAnswer,
    setUserAnswer,
    socraticHint,
    setSocraticHint,
    socraticMode,
    setSocraticMode,
    rabbitHoleOpen,
    setRabbitHoleOpen,
    mnemonicText,
    setMnemonicText,
    reviewSessionDone,
    setReviewSessionDone,
    sessionTimer,
    setSessionTimer,
    showSessionSummary,
    setShowSessionSummary,
    voiceReviewActive,
    setVoiceReviewActive,
    isEnteringFlow,
    cardStartTime,
    setCardStartTime,
    sessionStats,
    setSessionStats,
    getSmartQueue,
    handleEnterFlow,
    startReview,
    handleReveal,
  };
}
