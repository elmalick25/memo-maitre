// src/hooks/useXP.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  calculateLevel, 
  updateStreak, 
  calculateXPMultiplier, 
  checkBadges, 
  generateASCIIChart 
} from '../lib/XPSystem';
import { today } from '../utils/dateUtils';

const DEFAULT_XP_STATE = {
  wordsLearned: 0,
  speakingMinutes: 0,
  shadowingDone: 0,
  pronunciationScores: [], // Last 20 scores
  pronunciationAvgScore: 0,
  sessionsHistory: [], // { date, duration, xpEarned, activitiesDone: [] }
  currentStreak: 0,
  longestStreak: 0,
  lastSessionDate: null,
  totalXP: 0,
  badges: []
};

const STORAGE_KEY = 'xp_system_v1';

export function useXP(storage, showToast, callClaude) {
  const [xpState, setXpState] = useState(DEFAULT_XP_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const sessionXP = useRef(0);
  const sessionActivities = useRef([]);
  const sessionStartTime = useRef(Date.now());

  useEffect(() => {
    storage.get(STORAGE_KEY).then(data => {
      const state = data || DEFAULT_XP_STATE;
      
      // Update streak on load
      const todayStr = today();
      const { streak, longest } = updateStreak(state.lastSessionDate, todayStr, state.currentStreak, state.longestStreak);
      
      const newState = {
        ...state,
        currentStreak: streak,
        longestStreak: longest,
        lastSessionDate: todayStr
      };
      
      setXpState(newState);
      setIsLoaded(true);
      if (streak > state.currentStreak && streak >= 2) {
        showToast?.(`🔥 Streak : ${streak} jours !`, "success");
      }
      storage.set(STORAGE_KEY, newState);
    }).catch(e => {
      console.error("Failed to load XP state:", e);
      setIsLoaded(true);
    });
  }, []);

  const saveState = useCallback((newState) => {
    setXpState(newState);
    storage.set(STORAGE_KEY, newState);
  }, [storage]);

  const addXP = useCallback((baseAmount, reason, actionType = null) => {
    if (!isLoaded) return;
    
    // On utilise les reférences pour muter les variables de session, mais on calcule
    // le nouvel état de façon synchrone avec l'état actuel de xpState (via functional update)
    // Cependant, pour éviter les side-effects dans l'updater, on fait l'updater ET on lance l'effet.
    
    let amountToToast = 0;
    let toastMessage = "";
    let newlyUnlockedBadges = [];

    setXpState(prev => {
      const multiplier = calculateXPMultiplier(prev.currentStreak);
      const finalAmount = Math.round(baseAmount * multiplier);
      amountToToast = finalAmount;
      
      const newState = { ...prev };
      newState.totalXP += finalAmount;
      
      // Update metrics based on actionType
      if (actionType === "WORD_LEARNED") newState.wordsLearned += 1;
      if (actionType === "SHADOWING_DONE") newState.shadowingDone += 1;
      if (actionType === "SPEAKING_MINUTES") newState.speakingMinutes += (baseAmount / 5);
      
      if (actionType?.startsWith("PRONUNCIATION_")) {
        const score = parseInt(actionType.split("_")[1], 10) || 0;
        newState.pronunciationScores = [...newState.pronunciationScores, score].slice(-20);
        newState.pronunciationAvgScore = newState.pronunciationScores.reduce((a,b)=>a+b, 0) / Math.max(newState.pronunciationScores.length, 1);
      }

      // Check Badges
      let newActionData = actionType ? { type: actionType } : null;
      if (reason.toLowerCase().includes("role-play")) {
        if (!newActionData) newActionData = { type: "ROLE_PLAY_COMPLETED" };
        else newActionData.type = "ROLE_PLAY_COMPLETED";
      }
      if (reason.toLowerCase().includes("news")) {
        if (!newActionData) newActionData = { type: "NEWS_READ" };
        else newActionData.type = "NEWS_READ";
      }

      newlyUnlockedBadges = checkBadges(newState, newActionData);
      if (newlyUnlockedBadges.length > 0) {
        newState.badges = [...newState.badges, ...newlyUnlockedBadges];
      }

      // Session Tracking
      sessionXP.current += finalAmount;
      if (reason && !sessionActivities.current.includes(reason)) {
        sessionActivities.current.push(reason);
      }
      
      // Update today's history
      const todayStr = today();
      const todayIndex = newState.sessionsHistory.findIndex(s => s.date === todayStr);
      const durationMin = Math.round((Date.now() - sessionStartTime.current) / 60000);
      
      const todayRecord = {
        date: todayStr,
        duration: Math.max(durationMin, 1),
        xpEarned: sessionXP.current,
        activitiesDone: sessionActivities.current
      };

      if (todayIndex >= 0) {
        newState.sessionsHistory[todayIndex] = todayRecord;
      } else {
        newState.sessionsHistory = [...newState.sessionsHistory, todayRecord].slice(-30);
      }
      
      // Sauvegarde dans le storage depuis l'updater (bien que techniquement asynchrone, ok car storage.set n'interagit pas avec React)
      storage.set(STORAGE_KEY, newState);
      
      // On prépare le message du toast (en utilisant le multiplicateur calculé ici)
      if (finalAmount > 0) {
        const streakText = multiplier > 1 ? ` (x${multiplier} 🔥)` : "";
        toastMessage = `+${finalAmount} XP${streakText} : ${reason}`;
      }

      return newState;
    });
    
    // Appels d'effets secondaires en dehors de la fonction d'updater de React.
    // L'exécution se fera de manière asynchrone juste après.
    setTimeout(() => {
      newlyUnlockedBadges.forEach(b => showToast?.(`🏆 Nouveau badge : ${b}`, "success"));
      if (amountToToast > 0 && showToast && toastMessage) {
        showToast(toastMessage, "info");
      }
    }, 0);

  }, [isLoaded, showToast, storage]);

  const addBadge = useCallback((badgeName) => {
    let wasAdded = false;
    setXpState(prev => {
      if (prev.badges.includes(badgeName)) return prev;
      wasAdded = true;
      const newState = { ...prev, badges: [...prev.badges, badgeName] };
      storage.set(STORAGE_KEY, newState);
      return newState;
    });
    
    if (wasAdded) {
      setTimeout(() => {
        showToast?.(`🏆 Nouveau badge : ${badgeName}`, "success");
      }, 0);
    }
  }, [showToast, storage]);

  const getStats = useCallback(() => {
    const level = calculateLevel(xpState.totalXP);
    const nextLevelXP = calculateLevel(xpState.totalXP + 99999).max; // Helper to get next level max if we had proper array, but we can do it directly:
    const multiplier = calculateXPMultiplier(xpState.currentStreak);
    const asciiChart = generateASCIIChart(xpState.sessionsHistory);
    return { ...xpState, level, multiplier, asciiChart };
  }, [xpState]);

  const generateReport = async () => {
    if (!callClaude) throw new Error("callClaude not provided");
    const stats = getStats();
    const prompt = `Tu es un coach d'anglais ultra-motivant. Voici les statistiques de progression de l'étudiant.
Fais une analyse narrative en français, chaleureuse et engageante (2 paragraphes max), qui félicite l'étudiant, met en avant ses accomplissements de la semaine et lui donne un conseil pour la suite.
Statistiques:
- XP Total: ${stats.totalXP} (Niveau ${stats.level.name})
- Streak actuel: ${stats.currentStreak} 🔥
- Badges débloqués: ${stats.badges.join(", ")}
- Temps de parole cumulé: ${stats.speakingMinutes.toFixed(1)} minutes
- Mots appris: ${stats.wordsLearned}
- Score de prononciation moyen: ${stats.pronunciationAvgScore.toFixed(0)}%
- Graphique de la semaine dernière:\n${stats.asciiChart}
`;
    return await callClaude(prompt, "Tu es un coach d'anglais qui analyse la progression.");
  };

  return {
    xpState,
    isLoaded,
    addXP,
    addBadge,
    getStats,
    generateReport
  };
}
