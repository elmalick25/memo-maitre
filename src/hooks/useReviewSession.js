import { useState, useCallback, useRef } from "react";
import { today } from "../utils/dateUtils";
import { isDue, getActiveTargetRetention } from "../lib/fsrs";
import { buildSession } from "../lib/srs/scheduler";
import { antiInterferenceReorder, composeDailySession } from "../lib/memoryLab";
import { isNewCard } from "../lib/newCardIntake";
import { countNeverSeenCards } from "../lib/reviewStats";

const MODULE_SESSIONS_STORAGE_KEY = "mm_interrupted_module_sessions_v1";

function loadInterruptedSessions(todayISO) {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(MODULE_SESSIONS_STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const cleaned = {};
    for (const [cat, sess] of Object.entries(parsed)) {
      if (sess && sess.date === todayISO && Array.isArray(sess.queue) && sess.index < sess.queue.length) {
        cleaned[cat] = sess;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

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
  const [reviewMode, setReviewMode] = useState("standard");
  const [reviewCategory, setReviewCategory] = useState(null);
  const [moduleSessions, setModuleSessions] = useState(() => loadInterruptedSessions(today()));

  const saveModuleSession = useCallback((category, queue, index) => {
    if (!category || !Array.isArray(queue)) return;
    setModuleSessions((prev) => {
      const next = { ...prev };
      if (index >= queue.length) {
        delete next[category];
      } else {
        next[category] = { category, queue, index, date: today(), updatedAt: Date.now() };
      }
      try {
        localStorage.setItem(MODULE_SESSIONS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clearModuleSession = useCallback((category) => {
    if (!category) return;
    setModuleSessions((prev) => {
      const next = { ...prev };
      delete next[category];
      try {
        localStorage.setItem(MODULE_SESSIONS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const [isEnteringFlow, setIsEnteringFlow] = useState(false);
  const [cardStartTime, setCardStartTime] = useState(null);
  // Statistiques de la dernière composition de file (temps estimé, sangsues).
  const lastSessionStatsRef = useRef(null);

  const [sessionStats, setSessionStats] = useState({
    reviewed: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    startTime: null,
  });

  // 1) Tri intelligent — branché sur l'ordonnanceur avancé
  // ────────────────────────────────────────────────────────────────────────
  // Avant : tri à deux clés (priorité de module, puis difficulté brute), puis
  // anti-interférence. Ce tri ignorait la seule information qui compte
  // vraiment — la probabilité de rappel MAINTENANT. Une fiche en retard de
  // trois semaines et une fiche due du jour se retrouvaient au même rang.
  //
  // Maintenant : lib/srs/scheduler.js calcule pour chaque fiche son urgence
  // (chute de rétention sous la cible), sa fragilité, son statut de sangsue et
  // son coût en secondes, puis compose une file bornée par le temps réel
  // disponible et entrelacée pour éviter l'interférence entre fiches proches.
  // L'ancien tri reste le filet de sécurité si l'ordonnanceur échoue.
  const getSmartQueue = useCallback((queue, opts = {}) => {
    const legacySort = () => {
      const sorted = [...queue].sort((a, b) => {
        const catA = categories.find((c) => c.name === a.category);
        const catB = categories.find((c) => c.name === b.category);
        const prioRank = (c) => (c?.priority === "haute" ? 0 : c?.priority === "normale" ? 1 : 2);
        const rankA = prioRank(catA);
        const rankB = prioRank(catB);
        if (rankA !== rankB) return rankA - rankB;
        const diffA = a.difficulty !== undefined ? a.difficulty : (5 - (a.easeFactor || 2.5)) * 2;
        const diffB = b.difficulty !== undefined ? b.difficulty : (5 - (b.easeFactor || 2.5)) * 2;
        return diffB - diffA;
      });
      return antiInterferenceReorder(sorted);
    };

    if (!Array.isArray(queue) || queue.length === 0) return [];

    try {
      const priorityCategories = (categories || [])
        .filter((c) => c.priority === "haute")
        .map((c) => c.name);

      const { queue: scheduled, stats } = buildSession(queue, {
        // On ne coupe pas la file ici : la sélection du plan du jour a déjà eu
        // lieu en amont. Le budget sert uniquement à ne pas laisser passer une
        // session absurde de plusieurs heures.
        budgetMinutes: opts.budgetMinutes ?? Math.max(10, Math.ceil(queue.length * 0.25)),
        maxCards: opts.maxCards ?? queue.length,
        targetRetention: getActiveTargetRetention?.() ?? 0.9,
        priorityCategories,
        currentDate: today(),
        newCardRatio: opts.newCardRatio ?? 0.35,
      });

      // Aucune fiche ne doit disparaître d'une file déjà validée : ce qui n'est
      // pas retenu par le budget est simplement replacé à la fin.
      const kept = new Set(scheduled.map((c) => c.id));
      const rest = queue.filter((c) => !kept.has(c.id));
      lastSessionStatsRef.current = stats;
      const full = [...scheduled, ...rest];
      return full.length === queue.length ? full : legacySort();
    } catch (e) {
      console.warn("[useReviewSession] ordonnanceur indisponible, tri de secours", e);
      return legacySort();
    }
  }, [categories]);

  // 2) Entrée dans le flow
  // BUGFIX : ce callback capturait la version de `startReview` du PREMIER
  // rendu (deps []), c'est-à-dire une closure où le plan du jour n'était pas
  // encore chargé → « Aucune fiche à réviser ! » alors que le tableau de bord
  // affichait des fiches dues. On passe par une ref toujours à jour.
  const startReviewRef = useRef(null);
  const handleEnterFlow = useCallback(() => {
    setIsEnteringFlow(true);
    if (window.navigator?.vibrate) window.navigator.vibrate([30, 50, 30]);
    setTimeout(() => {
      setIsEnteringFlow(false);
      startReviewRef.current?.(null, "flow");
    }, 550);
  }, []);


  // 3) Démarrage de session de révision
  const startReview = useCallback((catFilter = null, mode = "standard", fixedQueue = null, opts = {}) => {
    // Reprise silencieuse si une session est déjà en cours sur ce module aujourd'hui
    const existingSession = mode === "module" && catFilter ? moduleSessions[catFilter] : null;
    if (existingSession && !opts.restart && Array.isArray(existingSession.queue) && existingSession.queue.length > 0 && existingSession.index < existingSession.queue.length) {
      setReviewMode("module");
      setReviewCategory(catFilter);
      setReviewQueue(existingSession.queue);
      setReviewIndex(existingSession.index);
      setRevealed(false);
      setUserAnswer("");
      setSocraticHint("");
      setSocraticMode(false);
      setRabbitHoleOpen(false);
      setMnemonicText("");
      setCardStartTime(Date.now());
      setShowSessionSummary(false);
      setSessionTimer(0);
      setView("review");
      return;
    }

    let queue;
    let cappedFrom = 0;
    const bonus = opts.bonus === true;

    if (fixedQueue && fixedQueue.length > 0) {
      queue = getSmartQueue([...fixedQueue]);
    } else if (mode === "module" && catFilter) {
      queue = getSmartQueue(expressions.filter((e) => e.category === catFilter && !e.paused));
    } else if (bonus) {
      const planIds = new Set(dailyPlanResult?.plan?.ids || []);
      const pool = (catFilter ? todayReviews.filter((e) => e.category === catFilter) : todayReviews)
        .filter((e) => !planIds.has(e.id));
      const extraTarget = dailyTargetToday ? Math.max(5, Math.round(dailyTargetToday / 2)) : pool.length;
      queue = getSmartQueue(composeDailySession(pool, { todayISO: today(), target: extraTarget }));
    } else {
      const priorityCats = (categories || [])
        .filter((c) => c.priority === "haute")
        .map((c) => c.name);

      // On reste TOUJOURS dans le plan du jour ; la priorité du module
      // ne fait que réordonner la file.
      const planRemaining = catFilter
        ? (dailySessionPreview || []).filter((e) => e.category === catFilter)
        : (dailySessionPreview || []);

      {
        queue = [...planRemaining];
        if (!catFilter && priorityCats.length > 0) {
          queue = [
            ...queue.filter((e) => priorityCats.includes(e.category)),
            ...queue.filter((e) => !priorityCats.includes(e.category)),
          ];
        }


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

    setReviewMode(mode);
    setReviewCategory(catFilter);
    setReviewQueue(queue);
    setReviewIndex(0);
    if (mode === "module" && catFilter) {
      saveModuleSession(catFilter, queue, 0);
    }
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

  // La ref suit toujours la dernière version de startReview (voir handleEnterFlow).
  startReviewRef.current = startReview;



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
    reviewMode,
    setReviewMode,
    reviewCategory,
    setReviewCategory,
    saveModuleSession,
    clearModuleSession,
    moduleSessions,
  };
}
