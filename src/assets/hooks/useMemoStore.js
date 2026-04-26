// src/hooks/useMemoStore.js
import { useState, useEffect, useRef, useCallback } from "react";
import { storage } from "../config/firebase";
import { CATEGORIES_DEFAULT, BADGES } from "../config/constants";
import { today, addDays } from "../lib/dateHelpers";

export function useMemoStore() {
  const [loaded, setLoaded] = useState(false);
  const [expressions, setExpressions] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES_DEFAULT);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({
    streak: 0, lastSession: null, totalReviews: 0, aiGenerated: 0, examsDone: 0
  });
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [videos, setVideos] = useState([]);
  const [customExams, setCustomExams] = useState([]);
  const [devLogs, setDevLogs] = useState([]);
  const [roadmap, setRoadmap] = useState([
    { id: 1, task: "Intégrer Firebase Storage", done: true },
    { id: 2, task: "Vision IA (Analyse de schémas)", done: true },
    { id: 3, task: "Biométrie Cognitive", done: true },
    { id: 4, task: "Mnémoniques Absurdes IA", done: true },
    { id: 5, task: "Lancer la v4 sur Vercel", done: false },
  ]);

  const statsRef = useRef(stats);
  useEffect(() => { statsRef.current = stats; }, [stats]);

  // ── Chargement initial ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const exps = (await storage.get("expressions_v3")) || [];
        const cats = (await storage.get("categories_v3")) || CATEGORIES_DEFAULT;
        const sess = (await storage.get("sessions_v3")) || [];
        const st = (await storage.get("stats_v3")) || { streak: 0, lastSession: null, totalReviews: 0, aiGenerated: 0, examsDone: 0 };
        const badges = (await storage.get("badges_v3")) || [];
        const storedVids = (await storage.get("videos_v3")) || [];
        const storedCustomExams = (await storage.get("customExams_v1")) || [];
        const storedLogs = (await storage.get("devLogs_v1")) || [];
        const storedRoadmap = (await storage.get("roadmap_v1")) || roadmap;

        setExpressions(exps);
        setCategories(cats);
        setSessions(sess);
        setStats(st);
        setUnlockedBadges(badges);
        setVideos(storedVids);
        setCustomExams(storedCustomExams);
        setDevLogs(storedLogs);
        setRoadmap(storedRoadmap);
        setLoaded(true);
      } catch (error) {
        console.error("Erreur chargement:", error);
        setLoaded(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sauvegarde automatique ───────────────────────────────────────────────
  useEffect(() => { if (loaded) storage.set("expressions_v3", expressions); }, [expressions, loaded]);
  useEffect(() => { if (loaded) storage.set("categories_v3", categories); }, [categories, loaded]);
  useEffect(() => { if (loaded) storage.set("sessions_v3", sessions); }, [sessions, loaded]);
  useEffect(() => { if (loaded) storage.set("stats_v3", stats); }, [stats, loaded]);
  useEffect(() => { if (loaded) storage.set("badges_v3", unlockedBadges); }, [unlockedBadges, loaded]);
  useEffect(() => { if (loaded) storage.set("customExams_v1", customExams); }, [customExams, loaded]);
  useEffect(() => { if (loaded) storage.set("devLogs_v1", devLogs); }, [devLogs, loaded]);
  useEffect(() => { if (loaded) storage.set("roadmap_v1", roadmap); }, [roadmap, loaded]);

  // ── Logique Badges ────────────────────────────────────────────────────────
  const checkBadges = useCallback((exps, st, sess, currentBadges) => {
    const mastered = exps.filter((e) => e.level >= 7).length;
    const dueCount = exps.filter((e) => e.nextReview <= today() && e.level < 7).length;
    const state = {
      totalCards: exps.length, streak: st.streak, mastered, dueCount,
      totalReviews: st.totalReviews, aiGenerated: st.aiGenerated, examsDone: st.examsDone
    };
    const newlyUnlocked = BADGES.filter((b) => !currentBadges.includes(b.id) && b.check(state));
    if (newlyUnlocked.length > 0) {
      setUnlockedBadges([...currentBadges, ...newlyUnlocked.map((b) => b.id)]);
      return newlyUnlocked[0]; // retourne le 1er badge débloqué pour l'affichage
    }
    return null;
  }, []);

  // ── Streak ────────────────────────────────────────────────────────────────
  const updateStreakAfterSession = useCallback((count) => {
    const todayStr = today();
    setStats((prev) => {
      const yesterday = addDays(todayStr, -1);
      let ns = prev.streak;
      if (prev.lastSession === yesterday) ns = prev.streak + 1;
      else if (prev.lastSession !== todayStr) ns = 1;
      const newStats = { ...prev, streak: ns, lastSession: todayStr, totalReviews: prev.totalReviews + count };
      statsRef.current = newStats;
      return newStats;
    });
    setSessions((prev) => {
      const existing = prev.find((s) => s.date === todayStr);
      if (existing) return prev.map((s) => s.date === todayStr ? { ...s, count: s.count + count } : s);
      return [...prev, { date: todayStr, count }];
    });
  }, []);

  // ── CRUD fiches ──────────────────────────────────────────────────────────
  const addExpression = useCallback((newExp) => {
    setExpressions((prev) => {
      const updated = [newExp, ...prev];
      return updated;
    });
  }, []);

  const updateExpression = useCallback((id, changes) => {
    setExpressions((prev) => prev.map((e) => e.id === id ? { ...e, ...changes } : e));
  }, []);

  const deleteExpression = useCallback((id) => {
    setExpressions((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // ── Catégories ────────────────────────────────────────────────────────────
  const addCategory = useCallback((cat) => {
    setCategories((prev) => [...prev, cat]);
  }, []);

  const deleteCategory = useCallback((name) => {
    setCategories((prev) => prev.filter((c) => c.name !== name));
    setExpressions((prev) => prev.filter((e) => e.category !== name));
  }, []);

  return {
    // Data
    loaded, expressions, categories, sessions, stats, unlockedBadges,
    videos, customExams, devLogs, roadmap, statsRef,
    // Setters directs (pour les cas complexes dans les vues)
    setExpressions, setCategories, setSessions, setStats,
    setUnlockedBadges, setVideos, setCustomExams, setDevLogs, setRoadmap,
    // Actions
    addExpression, updateExpression, deleteExpression,
    addCategory, deleteCategory,
    checkBadges, updateStreakAfterSession,
  };
}