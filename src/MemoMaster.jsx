import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ══════════════════════════════════════════════════════════════════════════════
// FIREBASE – CONFIG (memo-maitre)
// ══════════════════════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDKV8PbTisinWWfSL4g6BwzmQdt1yAgA-U",
  authDomain: "memo-maitre.firebaseapp.com",
  projectId: "memo-maitre",
  storageBucket: "memo-maitre.firebasestorage.app",
  messagingSenderId: "320016571088",
  appId: "1:320016571088:web:b4f2417a995a1b6d6d9cd5"
};
const FB_USER = "el_hadji_malick";

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);
const fbStorage = getStorage(firebaseApp);

const storage = {
  async get(key) {
    try {
      const snap = await getDoc(doc(db, "users", FB_USER, "data", key));
      if (snap.exists()) return snap.data().value !== undefined ? snap.data().value : null;
      return null;
    } catch {
      try {
        const raw = localStorage.getItem("memomaitre_" + key);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    }
  },
  async set(key, val) {
    try {
      await setDoc(doc(db, "users", FB_USER, "data", key), { value: val, updatedAt: Date.now() });
    } catch {
      try { localStorage.setItem("memomaitre_" + key, JSON.stringify(val)); } catch {}
    }
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS DATE
// ══════════════════════════════════════════════════════════════════════════════
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};
const today = () => new Date().toISOString().split("T")[0];
const formatDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

// ══════════════════════════════════════════════════════════════════════════════
// ALGORITHME FSRS v5
// ══════════════════════════════════════════════════════════════════════════════
const FSRS_PARAMS = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589, 1.5330,
  0.1544, 1.0071, 1.9395, 0.1100, 0.2900, 2.2700, 0.1500, 2.9898, 0.5100, 0.3400
];
const FSRS_DECAY = -0.5;
const FSRS_FACTOR = 19 / 81;
const TARGET_R = 0.9;

function fsrsR(t, S) { return Math.pow(1 + FSRS_FACTOR * (t / S), FSRS_DECAY); }
function fsrsNextInterval(S) { const t = S * (Math.pow(TARGET_R, 1 / FSRS_DECAY) - 1) / FSRS_FACTOR; return Math.max(1, Math.round(t)); }
function toFSRSGrade(q) { if (q === 0) return 1; if (q === 3) return 3; if (q === 5) return 4; return 3; }
function fsrsInitStability(grade) { return FSRS_PARAMS[grade - 1]; }
function fsrsInitDifficulty(grade) { const w = FSRS_PARAMS; return Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * (grade - 1)) + 1)); }
function fsrsNextDifficulty(D, grade) { const w = FSRS_PARAMS; const deltaD = -w[13] * (grade - 3); return Math.min(10, Math.max(1, D + deltaD * ((10 - D) / 9))); }
function fsrsNextStabilityRecall(D, S, R, grade) { const w = FSRS_PARAMS; const hardPenalty = grade === 2 ? w[15] : 1; const easyBonus = grade === 4 ? w[16] : 1; return S * ( 1 + Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) * (Math.exp((1 - R) * w[10]) - 1) * hardPenalty * easyBonus ); }
function fsrsNextStabilityForgot(D, S, R) { const w = FSRS_PARAMS; return w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp((1 - R) * w[14]); }

function fsrs(card, q) {
  const grade = toFSRSGrade(q);
  let { stability = null, difficulty = null, interval = 1, repetitions = 0, elapsedDays = null } = card;
  const t = elapsedDays ?? interval;

  if (stability === null || repetitions === 0) {
    stability = fsrsInitStability(grade);
    difficulty = fsrsInitDifficulty(grade);
    if (grade === 1) { interval = 1; repetitions = 0; } else { interval = fsrsNextInterval(stability); repetitions = 1; }
  } else {
    const R = fsrsR(t, stability);
    difficulty = fsrsNextDifficulty(difficulty, grade);
    if (grade === 1) {
      stability = Math.max(0.1, fsrsNextStabilityForgot(difficulty, stability, R));
      interval = 1; repetitions = 0;
    } else {
      stability = Math.max(stability, fsrsNextStabilityRecall(difficulty, stability, R, grade));
      interval = fsrsNextInterval(stability); repetitions++;
    }
  }

  const retention = Math.round(fsrsR(interval, stability) * 100);
  const nextReview = addDays(today(), interval);
  return { stability: +stability.toFixed(4), difficulty: +difficulty.toFixed(4), interval, repetitions, nextReview, retention };
}

// ══════════════════════════════════════════════════════════════════════════════
// BADGES & CONSTANTES
// ══════════════════════════════════════════════════════════════════════════════
const BADGES = [
  { id: "first_card", icon: "🌱", label: "Première pousse", desc: "Créer ta 1ère fiche", check: (s) => s.totalCards >= 1 },
  { id: "ten_cards", icon: "📚", label: "Bibliothécaire", desc: "10 fiches créées", check: (s) => s.totalCards >= 10 },
  { id: "fifty_cards", icon: "🗂️", label: "Encyclopédiste", desc: "50 fiches créées", check: (s) => s.totalCards >= 50 },
  { id: "streak3", icon: "🔥", label: "En feu", desc: "3 jours de streak", check: (s) => s.streak >= 3 },
  { id: "streak7", icon: "⚡", label: "Semaine parfaite", desc: "7 jours de streak", check: (s) => s.streak >= 7 },
  { id: "streak30", icon: "🏆", label: "Mois de légende", desc: "30 jours de streak", check: (s) => s.streak >= 30 },
  { id: "first_master", icon: "✅", label: "Premier maître", desc: "1ère fiche maîtrisée", check: (s) => s.mastered >= 1 },
  { id: "ten_master", icon: "🎓", label: "Diplômé", desc: "10 fiches maîtrisées", check: (s) => s.mastered >= 10 },
  { id: "all_reviewed", icon: "🧘", label: "Zen", desc: "0 fiche en retard", check: (s) => s.totalCards > 0 && s.dueCount === 0 },
  { id: "exam_mode", icon: "🎯", label: "Testeur", desc: "Terminer un mode examen", check: (s) => s.examsDone >= 1 },
  { id: "hundred_reviews", icon: "💎", label: "Diamant", desc: "100 révisions totales", check: (s) => s.totalReviews >= 100 },
  { id: "ai_user", icon: "🤖", label: "IA Partner", desc: "Générer 5 fiches via IA", check: (s) => s.aiGenerated >= 5 },
];

const CATEGORIES_DEFAULT = [
  { name: "🇬🇧 Anglais", examDate: "", targetScore: 90, priority: "haute", color: "#4F8EF7" },
  { name: "☕ Java / Spring Boot", examDate: "", targetScore: 85, priority: "haute", color: "#F0A040" },
  { name: "🖥️ Informatique Générale", examDate: "", targetScore: 80, priority: "normale", color: "#40C080" },
];

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_VISION = "llama-3.2-11b-vision-preview";

async function callClaude(systemPrompt, userMessage, isVision = false, imageUrl = null) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const messages = [{ role: "system", content: systemPrompt }];
  if (isVision && imageUrl) {
    messages.push({ role: "user", content: [{ type: "text", text: userMessage }, { type: "image_url", image_url: { url: imageUrl } }] });
  } else {
    messages.push({ role: "user", content: userMessage });
  }
  for (let i = 0; i <= 2; i++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model: isVision ? GROQ_VISION : GROQ_MODEL, max_tokens: 1024, temperature: 0.7, messages }),
      });
      if (res.status === 429) throw new Error("QUOTA_EXCEEDED");
      if (!res.ok) throw new Error(`Status: ${res.status}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response");
      return text;
    } catch (err) {
      if (err.message === "QUOTA_EXCEEDED" || i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

function buildHeatmap(sessions) {
  const map = {};
  (sessions || []).forEach((s) => { map[s.date] = (map[s.date] || 0) + s.count; });
  return map;
}

function getLast12Weeks() {
  const weeks = [];
  const endDate = new Date();
  const day = endDate.getDay();
  endDate.setDate(endDate.getDate() - day);
  for (let w = 11; w >= 0; w--) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(endDate);
      dt.setDate(endDate.getDate() - w * 7 + d);
      week.push(dt.toISOString().split("T")[0]);
    }
    weeks.push(week);
  }
  return weeks;
}

function parseImport(text) {
  try {
    const data = JSON.parse(text);
    if (data.expressions && Array.isArray(data.expressions)) return { expressions: data.expressions, categories: data.categories || [] };
  } catch {}
  try {
    const lines = text.trim().split("\n").filter(Boolean);
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const expressions = lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj = {};
      header.forEach((h, i) => { obj[h] = vals[i]?.trim() || ""; });
      return {
        id: Date.now().toString() + Math.random(),
        front: obj.front || obj.recto || "", back: obj.back || obj.verso || "", example: obj.example || obj.exemple || "", category: obj.category || obj.categorie || obj.module || "Import",
        level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
      };
    }).filter((e) => e.front && e.back);
    return { expressions, categories: [] };
  } catch {}
  return null;
}
// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function MemoMaster() {
  // Tous les états existants
  const [view, setView] = useState("dashboard");
  const [expressions, setExpressions] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES_DEFAULT);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ streak: 0, lastSession: null, totalReviews: 0, aiGenerated: 0, examsDone: 0 });
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [powerLevel, setPowerLevel] = useState(0);
  const [devLogs, setDevLogs] = useState([]);
  const [roadmap, setRoadmap] = useState([
    { id: 1, task: "Intégrer Firebase Storage", done: true },
    { id: 2, task: "Vision IA (Analyse de schémas)", done: true },
    { id: 3, task: "Biométrie Cognitive", done: true },
    { id: 4, task: "Mnémoniques Absurdes IA", done: true },
    { id: 5, task: "Lancer la v4 sur Vercel", done: false },
  ]);
  const [isDarkMode, setIsDarkMode] = useState(new Date().getHours() >= 19 || new Date().getHours() <= 6);
  const [lofiPlaying, setLofiPlaying] = useState(false);
  const [cardStartTime, setCardStartTime] = useState(null);

  const [toast, setToast] = useState(null);
  const [newBadge, setNewBadge] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCat, setFilterCat] = useState("Toutes");
  const [filterLevel, setFilterLevel] = useState("Tous");

  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewSessionDone, setReviewSessionDone] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [socraticHint, setSocraticHint] = useState("");
  const [evalLoading, setEvalLoading] = useState(false);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [mnemonicText, setMnemonicText] = useState("");
  const [mnemonicLoading, setMnemonicLoading] = useState(false);

  const [examConfig, setExamConfig] = useState({ category: "Toutes", count: 10, timePerCard: 30, mode: "standard", difficulty: "adaptative" });
  const [examActive, setExamActive] = useState(false);
  const [examQueue, setExamQueue] = useState([]);
  const [examIndex, setExamIndex] = useState(0);
  const [examAnswers, setExamAnswers] = useState([]);
  const [examTimer, setExamTimer] = useState(0);
  const [examRevealed, setExamRevealed] = useState(false);
  const examTimerRef = useRef(null);
  const [qcmChoices, setQcmChoices] = useState([]);
  const [qcmSelected, setQcmSelected] = useState(null);
  const [qcmLoading, setQcmLoading] = useState(false);
  const [customExams, setCustomExams] = useState([]);
  const [examSubView, setExamSubView] = useState("home");
  const [selectedCustomExam, setSelectedCustomExam] = useState(null);
  const [newCustomExam, setNewCustomExam] = useState({ title: "", description: "", questions: [] });
  const [customExamEditQ, setCustomExamEditQ] = useState({ question: "", answer: "", choices: ["","","",""], isQcm: false });
  const [examStreak, setExamStreak] = useState(0);
  const [examStartTime, setExamStartTime] = useState(null);

  const [addForm, setAddForm] = useState({ front: "", back: "", example: "", category: "", imageUrl: null });
  const [editingId, setEditingId] = useState(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiBatchCount, setAiBatchCount] = useState(5);
  const [aiFromText, setAiFromText] = useState("");
  const [aiFromTextLoading, setAiFromTextLoading] = useState(false);
  const [batchPreview, setBatchPreview] = useState([]);
  const [showBatchPreview, setShowBatchPreview] = useState(false);
  const [addSubView, setAddSubView] = useState("single");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [listening, setListening] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [newCat, setNewCat] = useState({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#4F8EF7" });
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [newLog, setNewLog] = useState("");

  const [docFile, setDocFile] = useState(null);
  const [docText, setDocText] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [docFullCard, setDocFullCard] = useState(false);
  const [docCategory, setDocCategory] = useState(CATEGORIES_DEFAULT[0].name);
  const [docErrorDetails, setDocErrorDetails] = useState(null);
  // ── LAB AMÉLIORÉ ─────────────────────────────────────────────────────────
  const [labSubView, setLabSubView] = useState("home"); // home | pdf | resume | coach | tools
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfExtractedText, setPdfExtractedText] = useState("");
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfGenMode, setPdfGenMode] = useState("fiches"); // fiches | resume | both
  const [pdfCardsCount, setPdfCardsCount] = useState(8);
  const [pdfGenLoading, setPdfGenLoading] = useState(false);
  const [pdfBatchPreview, setPdfBatchPreview] = useState([]);
  const [pdfSummary, setPdfSummary] = useState("");
  const [pdfSummaryLoading, setPdfSummaryLoading] = useState(false);
  // Résumé de cours standalone
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeResult, setResumeResult] = useState(null); // { summary, keyPoints, mindmap }
  const [resumeStyle, setResumeStyle] = useState("complet"); // complet | flash | cornell
  const [resumeParsing, setResumeParsing] = useState(false);

  const statsRef = useRef(stats);
  useEffect(() => { statsRef.current = stats; }, [stats]);

  // AI English Practice
  const [practicePersona, setPracticePersona] = useState("Standard");
  const [practiceMessages, setPracticeMessages] = useState([
    { role: "assistant", text: "Hello! I'm your English conversation partner. I'm here to help you practice speaking and writing English naturally. What topic would you like to discuss today? 😊" }
  ]);
  const [practiceInput, setPracticeInput] = useState("");
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceListening, setPracticeListening] = useState(false);
  const [practiceTopic, setPracticeTopic] = useState("Free conversation");
  const [practiceLevel, setPracticeLevel] = useState("intermediate");
  const [practiceSpeaking, setPracticeSpeaking] = useState(false);
  const practiceEndRef = useRef(null);
  const practiceMsgRef = useRef(practiceMessages);
  const practiceMediaRecorderRef = useRef(null);
  const practiceAudioChunksRef = useRef([]);

  useEffect(() => { practiceMsgRef.current = practiceMessages; }, [practiceMessages]);
  useEffect(() => { practiceEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [practiceMessages]);

  // ── NOUVEAUX ÉTATS GOD LEVEL ─────────────────────────────────────────────
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [coachPlan, setCoachPlan] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [worldBossHp, setWorldBossHp] = useState(100);
  const [palaceMode, setPalaceMode] = useState(false);
  // (doc2 states merged into unified lab state above)
  // Collab
  const [studyRoomUsers, setStudyRoomUsers] = useState([]);
  // Stress (simulé)
  const [stressLevel, setStressLevel] = useState(0);
  // Prédiction note
  const [predictedScore, setPredictedScore] = useState(null);
  // Confusion destroyer (post-exam)
  const [wrongAnswersForConfusion, setWrongAnswersForConfusion] = useState([]);

  // Chargement initial
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
        setAddForm((f) => ({ ...f, category: cats[0]?.name || "" }));
        setDocCategory(cats[0]?.name || "");
        setLoaded(true);
      } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
      }
    })();
  }, []);

  useEffect(() => {
    const calcPower = expressions.length * 10 + stats.streak * 50 + stats.examsDone * 100 + unlockedBadges.length * 200;
    setPowerLevel(calcPower);
  }, [expressions, stats, unlockedBadges]);

  useEffect(() => { if (loaded) storage.set("expressions_v3", expressions); }, [expressions, loaded]);
  useEffect(() => { if (loaded) storage.set("categories_v3", categories); }, [categories, loaded]);
  useEffect(() => { if (loaded) storage.set("sessions_v3", sessions); }, [sessions, loaded]);
  useEffect(() => { if (loaded) storage.set("stats_v3", stats); }, [stats, loaded]);
  useEffect(() => { if (loaded) storage.set("badges_v3", unlockedBadges); }, [unlockedBadges, loaded]);
  useEffect(() => { if (loaded) storage.set("customExams_v1", customExams); }, [customExams, loaded]);
  useEffect(() => { if (loaded) storage.set("devLogs_v1", devLogs); }, [devLogs, loaded]);
  useEffect(() => { if (loaded) storage.set("roadmap_v1", roadmap); }, [roadmap, loaded]);

  const checkBadges = useCallback((exps, st, sess, currentBadges) => {
    const mastered = exps.filter((e) => e.level >= 7).length;
    const dueCount = exps.filter((e) => e.nextReview <= today() && e.level < 7).length;
    const state = { totalCards: exps.length, streak: st.streak, mastered, dueCount, totalReviews: st.totalReviews, aiGenerated: st.aiGenerated, examsDone: st.examsDone };
    const newlyUnlocked = BADGES.filter((b) => !currentBadges.includes(b.id) && b.check(state));
    if (newlyUnlocked.length > 0) {
      const newIds = [...currentBadges, ...newlyUnlocked.map((b) => b.id)];
      setUnlockedBadges(newIds);
      setNewBadge(newlyUnlocked[0]);
      setTimeout(() => setNewBadge(null), 4000);
    }
  }, []);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

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

  // Upload Storage & Vision IA
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadLoading(true);
    try {
      const storageRef = ref(fbStorage, `users/${FB_USER}/images/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setAddForm(f => ({ ...f, imageUrl: url }));
      showToast("📸 Image sauvegardée et attachée !");
    } catch (error) {
      console.error("Erreur Upload:", error);
      showToast("Erreur lors de l'upload.", "error");
    }
    setUploadLoading(false);
  };

  const handleVisionAI = async () => {
    if (!addForm.imageUrl) return;
    setAiLoading(true);
    try {
      const prompt = `Tu es un expert technique. Analyse cette image (diagramme d'architecture, schéma de base de données, interface utilisateur ou code). Identifie le composant principal ou le concept clé et génère une fiche de révision pour le mémoriser. Réponds UNIQUEMENT en format JSON valide: {"front":"Nom du concept identifié","back":"Explication détaillée du rôle ou fonctionnement dans le schéma","example":"Application pratique ou exemple de code lié"}`;
      const raw = await callClaude(prompt, "Analyse cette image.", true, addForm.imageUrl);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setAddForm(f => ({ ...f, front: parsed.front || "", back: parsed.back || "", example: parsed.example || "" }));
      showToast("👁️ Vision IA : Fiche générée depuis l'image !");
    } catch (err) {
      showToast("Erreur Vision IA. L'image est peut-être complexe.", "error");
    }
    setAiLoading(false);
  };

  const handleSemanticSearch = async () => {
    if (!searchQuery.trim()) return;
    setSemanticLoading(true);
    try {
      const conceptsList = expressions.map(e => e.front).join(", ");
      const raw = await callClaude(`Tu es le moteur de recherche sémantique interne de l'application. L'utilisateur cherche : "${searchQuery}". Parmi les concepts suivants disponibles dans la base de données de l'utilisateur : [${conceptsList}]. Trouve les 3 concepts qui se rapprochent le plus DU SENS de sa recherche (pas besoin que ce soit le mot exact). Renvoie UNIQUEMENT une liste séparée par des virgules des concepts trouvés. Si rien ne correspond, renvoie "Aucun résultat sémantique".`, "Quels sont les concepts liés ?");
      setSearchQuery(raw.trim());
      showToast("🧠 Recherche Neurale appliquée !");
    } catch (err) {
      showToast("Erreur lors de la recherche neurale.", "error");
    }
    setSemanticLoading(false);
  };

  const generateMnemonic = async () => {
    const card = reviewQueue[reviewIndex];
    setMnemonicLoading(true);
    try {
      const raw = await callClaude(`Génère un moyen mnémotechnique ABSURDE, une histoire drôle ou une image mentale (Palais de mémoire) très marquante pour mémoriser ce concept technique. Concept: ${card.front} Explication: ${card.back} Sois extrêmement court et percutant (max 3 phrases). Ne renvoie que l'histoire, sans fioriture.`, "Aide-moi à mémoriser ça.");
      setMnemonicText(raw.trim());
    } catch (err) {
      showToast("Erreur lors de la génération du mnémonique.", "error");
    }
    setMnemonicLoading(false);
  };

  const handleSemanticEval = async () => {
    if (!userAnswer.trim()) return;
    setEvalLoading(true);
    setSocraticHint("");
    try {
      const card = reviewQueue[reviewIndex];
      const systemPrompt = `Tu es le "God Mode AI", un tuteur strict mais bienveillant pour un étudiant en informatique. La réponse attendue de la fiche est: "${card.back}". La réponse que l'étudiant vient de taper est: "${userAnswer}". Analyse sémantiquement la réponse de l'étudiant. 1. Si l'idée principale et l'essence du concept sont correctes (même avec des mots différents), renvoie exactement ce JSON : {"status": "correct"} 2. S'il a faux, s'il manque un détail crucial, ou si c'est très incomplet, NE DONNE PAS LA RÉPONSE. Renvoie ce JSON : {"status": "incorrect", "hint": "Pose une courte question socratique pour le guider et le faire réfléchir par lui-même."}`;
      const raw = await callClaude(systemPrompt, "Évalue cette réponse.");
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.status === "correct") {
        showToast("✅ Réponse correcte ! L'IA valide ta compréhension.");
        handleReveal();
      } else {
        setSocraticHint(parsed.hint || "Essaie d'approfondir. De quoi s'agit-il exactement ?");
      }
    } catch (err) {
      console.error("Erreur Socratique:", err);
      showToast("Erreur d'analyse. Affiche la réponse manuellement pour cette fois.", "error");
    } finally {
      setEvalLoading(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const catName = addForm.category;
      const isEnglish = catName.toLowerCase().includes("anglais");
      const systemPrompt = `Tu es un assistant pédagogique expert pour un étudiant en Licence Informatique à Dakar, Sénégal. Génère une fiche de révision en JSON UNIQUEMENT (sans markdown, sans backticks, sans texte avant ou après). Format strict: {"front":"...","back":"...","example":"..."} - front: le concept/mot/expression à mémoriser (concis, max 10 mots) - back: explication claire en français (max 4 lignes, pédagogique et mémorable) - example: un exemple concret et pratique d'utilisation ${isEnglish ? "Pour l'anglais: front=expression anglaise authentique, back=traduction + usage + nuances en français, example=phrase complète en anglais avec contexte naturel" : ""} ${catName.includes("Java") || catName.includes("Spring") ? "Pour Java/Spring: inclure le contexte d'usage, la syntaxe si pertinente, et quand utiliser ce concept" : ""}`;
      const raw = await callClaude(systemPrompt, `Génère une fiche sur: ${aiPrompt}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setAddForm((f) => ({ ...f, front: parsed.front || "", back: parsed.back || "", example: parsed.example || "" }));
      showToast("✨ Fiche générée par l'IA !");
      setStats((prev) => ({ ...prev, aiGenerated: prev.aiGenerated + 1 }));
      setAiPrompt("");
    } catch (error) {
      const msg = error.message?.includes("QUOTA") ? "⏳ Quota Groq atteint — attends 1 minute !" : "Erreur IA.";
      showToast(msg, "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleMicroAI = async (field) => {
    if (!addForm.front.trim()) { showToast("Saisis d'abord le Recto !", "error"); return; }
    setAiLoading(true);
    try {
      const isEnglish = addForm.category.toLowerCase().includes("anglais");
      let prompt = "";
      if (field === "back") prompt = `Explique brièvement (max 3 lignes) ce concept : "${addForm.front}". ${isEnglish ? "Donne la traduction et le contexte." : "Sois pédagogique."} Ne renvoie QUE l'explication.`;
      else if (field === "example") prompt = `Donne un exemple concret pour : "${addForm.front}". ${isEnglish ? "Phrase complète en anglais." : "Code ou mise en situation pratique."} Ne renvoie QUE l'exemple.`;
      const raw = await callClaude("Tu es un assistant pédagogique direct.", prompt);
      setAddForm((f) => ({ ...f, [field]: raw.trim() }));
      showToast(`✨ ${field === "back" ? "Explication" : "Exemple"} généré !`);
      setStats((prev) => ({ ...prev, aiGenerated: prev.aiGenerated + 1 }));
    } catch (error) { showToast("Erreur génération.", "error"); }
    setAiLoading(false);
  };

  const handleAIBatchGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiBatchLoading(true);
    try {
      const systemPrompt = `Tu es un assistant pédagogique expert. Génère ${aiBatchCount} fiches variées. Réponds UNIQUEMENT en JSON: {"cards":[{"front":"...","back":"...","example":"..."},...]}`;
      const raw = await callClaude(systemPrompt, `Génère ${aiBatchCount} fiches sur: ${aiPrompt}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const cards = parsed.cards || parsed;
      setBatchPreview(Array.isArray(cards) ? cards : []);
      setShowBatchPreview(true);
      showToast(`✨ ${cards.length} fiches générées !`, "info");
    } catch (err) { showToast("Erreur batch.", "error"); }
    setAiBatchLoading(false);
  };

  const confirmBatch = () => {
    if (batchPreview.length === 0) return;
    const newExps = batchPreview.map(card => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      front: (card.front || "").trim(), back: (card.back || "").trim(), example: (card.example || "").trim(), category: addForm.category,
      level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
    })).filter(e => e.front && e.back);
    setExpressions(prev => { const updated = [...newExps, ...prev]; checkBadges(updated, statsRef.current, sessions, unlockedBadges); return updated; });
    setStats(prev => ({ ...prev, aiGenerated: prev.aiGenerated + newExps.length }));
    showToast(`🎉 ${newExps.length} fiches sauvegardées !`);
    setBatchPreview([]); setShowBatchPreview(false); setAiPrompt("");
  };
  const removeBatchCard = (idx) => { setBatchPreview(prev => prev.filter((_, i) => i !== idx)); };

  const handleAIFromText = async () => {
    if (!aiFromText.trim()) return;
    setAiFromTextLoading(true);
    try {
      const raw = await callClaude(`À partir du texte fourni, extrais les 5 à 7 concepts clés en fiches de révision JSON. Format strict: {"cards":[{"front":"...","back":"...","example":"..."},...]}`, `Module: ${addForm.category}\n\nTexte:\n${aiFromText.slice(0, 3000)}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setBatchPreview(Array.isArray(parsed.cards || parsed) ? (parsed.cards || parsed) : []);
      setShowBatchPreview(true); setAddSubView("batch");
    } catch (err) { showToast("Erreur analyse texte.", "error"); }
    setAiFromTextLoading(false);
  };

  const startVoice = async (field) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      mediaRecorder.onstop = async () => {
        setListening("processing");
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");
        formData.append("model", "whisper-large-v3");
        formData.append("language", field === "front" && addForm.category.toLowerCase().includes("anglais") ? "en" : "fr");
        try {
          const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}` }, body: formData });
          if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
          const data = await res.json();
          if (data.text) { setAddForm((f) => ({ ...f, [field]: (f[field] ? f[field] + " " : "") + data.text.trim() })); showToast("🎙️ Transcription réussie !"); }
        } catch (err) { showToast("Échec transcription.", "error"); }
        stream.getTracks().forEach(track => track.stop());
        setListening(null);
      };
      mediaRecorder.start(); setListening(field);
    } catch (err) { showToast("Micro refusé.", "error"); setListening(null); }
  };
  const stopVoice = () => { if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop(); };

  const handleAdd = () => {
    if (!addForm.front.trim() || !addForm.back.trim()) { showToast("Recto et verso obligatoires !", "error"); return; }
    if (editingId) {
      setExpressions((prev) => prev.map((e) => e.id === editingId ? { ...e, front: addForm.front.trim(), back: addForm.back.trim(), example: addForm.example.trim(), category: addForm.category, imageUrl: addForm.imageUrl } : e ));
      setEditingId(null); showToast("✏️ Fiche mise à jour !");
    } else {
      const newExp = { id: Date.now().toString(), front: addForm.front.trim(), back: addForm.back.trim(), example: addForm.example.trim(), category: addForm.category, imageUrl: addForm.imageUrl, level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [] };
      setExpressions((prev) => { const updated = [newExp, ...prev]; checkBadges(updated, statsRef.current, sessions, unlockedBadges); return updated; });
      showToast("✅ Fiche ajoutée !");
    }
    setAddForm((f) => ({ ...f, front: "", back: "", example: "", imageUrl: null }));
  };

  const startEdit = (exp) => { setAddForm({ front: exp.front, back: exp.back, example: exp.example || "", category: exp.category, imageUrl: exp.imageUrl || null }); setEditingId(exp.id); setView("add"); };
  const cancelEdit = () => { setEditingId(null); setAddForm((f) => ({ ...f, front: "", back: "", example: "", imageUrl: null })); };
  const deleteExp = (id) => { setExpressions((prev) => prev.filter((e) => e.id !== id)); showToast("Fiche supprimée.", "info"); };

  const todayReviews = useMemo(() => expressions.filter((e) => e.nextReview <= today() && e.level < 7), [expressions]);
  const masteredCount = useMemo(() => expressions.filter((e) => e.level >= 7).length, [expressions]);

  const getSmartQueue = useCallback((queue) => {
    return [...queue].sort((a, b) => {
      const catA = categories.find((c) => c.name === a.category);
      const catB = categories.find((c) => c.name === b.category);
      const daysA = catA?.examDate ? Math.ceil((new Date(catA.examDate) - new Date()) / 86400000) : 999;
      const daysB = catB?.examDate ? Math.ceil((new Date(catB.examDate) - new Date()) / 86400000) : 999;
      if (daysA !== daysB) return daysA - daysB;
      const diffA = a.difficulty !== undefined ? a.difficulty : (5 - (a.easeFactor || 2.5)) * 2;
      const diffB = b.difficulty !== undefined ? b.difficulty : (5 - (b.easeFactor || 2.5)) * 2;
      return diffB - diffA;
    });
  }, [categories]);

  const startReview = (catFilter = null) => {
    let queue = catFilter ? todayReviews.filter((e) => e.category === catFilter) : [...todayReviews];
    queue = getSmartQueue(queue);
    if (queue.length === 0) { showToast("Aucune fiche à réviser !", "info"); return; }
    setReviewQueue(queue); setReviewIndex(0); setRevealed(false); setUserAnswer(""); setSocraticHint(""); setMnemonicText(""); setReviewSessionDone(0);
    setCardStartTime(Date.now());
    setView("review");
  };

  const handleReveal = () => {
    if (cardStartTime) {
      const timeTaken = Date.now() - cardStartTime;
      const card = reviewQueue[reviewIndex];
      if (timeTaken > 5000 && card.level >= 4) showToast("🧠 Fatigue cognitive détectée (> 5s). Prends ton temps ou fais une pause !", "info");
    }
    setRevealed(true);
  };

  const handleAnswer = (q) => {
    const exp = reviewQueue[reviewIndex];
    const updated = fsrs(exp, q);
    const newLevel = q === 0 ? 0 : q === 3 ? Math.max(exp.level, 1) : Math.min(7, exp.level + 1);
    const histEntry = { date: today(), q, newLevel, interval: updated.interval };
    setExpressions((prev) => prev.map((e) => e.id === exp.id ? { ...e, ...updated, level: newLevel, reviewHistory: [...(e.reviewHistory || []), histEntry] } : e));
    const done = reviewSessionDone + 1; setReviewSessionDone(done);
    if (reviewIndex + 1 >= reviewQueue.length) {
      updateStreakAfterSession(done);
      setStats((prev) => { const ns = { ...prev }; checkBadges(expressions, ns, sessions, unlockedBadges); return ns; });
      showToast(`🎉 ${done} carte(s) révisée(s) !`);
      setView("dashboard");
    } else {
      setReviewIndex((i) => i + 1); setRevealed(false); setUserAnswer(""); setSocraticHint(""); setMnemonicText("");
      setCardStartTime(Date.now());
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (view === "review") {
        if (e.code === "Space" && !revealed && document.activeElement.tagName !== "TEXTAREA") { e.preventDefault(); handleReveal(); }
        if (revealed && !document.activeElement.tagName.includes("TEXT")) { if (e.key === "1") handleAnswer(0); if (e.key === "2") handleAnswer(3); if (e.key === "3") handleAnswer(5); }
      }
      if (view === "exam" && examActive) {
        if (e.code === "Space" && !examRevealed && examConfig.mode !== "qcm") { e.preventDefault(); setExamRevealed(true); }
        if (examRevealed && examConfig.mode !== "qcm") { if (e.key === "1") handleExamAnswer(0); if (e.key === "2") handleExamAnswer(3); if (e.key === "3") handleExamAnswer(5); }
      }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [view, revealed, examActive, examRevealed, cardStartTime, reviewIndex]);

  const getDifficultyPool = (pool, difficulty) => {
    if (difficulty === "facile") return pool.filter(e => e.level >= 4);
    if (difficulty === "difficile") return pool.filter(e => e.level <= 2 || (e.difficulty !== undefined && e.difficulty >= 7) || (e.difficulty === undefined && e.easeFactor <= 1.9));
    if (difficulty === "extreme") return pool.filter(e => e.level <= 1 || (e.difficulty !== undefined && e.difficulty >= 9) || (e.difficulty === undefined && e.easeFactor <= 1.6));
    return pool;
  };

  const startExam = (customExamData = null) => {
    if (customExamData) {
      const q = [...customExamData.questions].sort(() => Math.random() - 0.5);
      setExamQueue(q.map(qu => ({ ...qu, isCustom: true })));
      setExamIndex(0); setExamAnswers([]); setExamRevealed(false); setQcmSelected(null); setQcmChoices([]);
      setExamTimer(examConfig.timePerCard); setExamStreak(0); setExamStartTime(Date.now()); setExamActive(true); setExamSubView("active");
      return;
    }
    let pool = examConfig.category === "Toutes" ? expressions : expressions.filter((e) => e.category === examConfig.category);
    pool = getDifficultyPool(pool, examConfig.difficulty);
    if (pool.length === 0) pool = examConfig.category === "Toutes" ? expressions : expressions.filter((e) => e.category === examConfig.category);
    if (pool.length === 0) { showToast("Aucune fiche pour cet examen.", "error"); return; }
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(examConfig.count, pool.length));
    setExamQueue(shuffled); setExamIndex(0); setExamAnswers([]); setExamRevealed(false); setQcmSelected(null); setQcmChoices([]);
    setExamTimer(examConfig.mode === "speedrun" && examConfig.timePerCard > 10 ? 5 : examConfig.timePerCard);
    setExamStreak(0); setExamStartTime(Date.now()); setExamActive(true); setExamSubView("active");
  };

  const generateQcmChoices = async (card) => {
    setQcmLoading(true); setQcmChoices([]); setQcmSelected(null);
    try {
      const allAnswers = expressions.filter(e => e.id !== card.id && e.category === card.category).map(e => e.back).slice(0, 8);
      const raw = await callClaude(`Tu es un générateur de QCM pédagogique. Réponds UNIQUEMENT en JSON valide.`, `Question: "${card.front}"\nBonne réponse: "${card.back}"\nAutres réponses: ${JSON.stringify(allAnswers)}\nGénère 3 fausses réponses (distracteurs) crédibles: {"wrong":["mauvaise1","mauvaise2","mauvaise3"]}`);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const choices = [...parsed.wrong.slice(0, 3), card.back].sort(() => Math.random() - 0.5);
      setQcmChoices(choices);
    } catch {
      const others = expressions.filter(e => e.id !== card.id).sort(() => Math.random() - 0.5).slice(0, 3).map(e => e.back);
      setQcmChoices([...others, card.back].sort(() => Math.random() - 0.5));
    } finally { setQcmLoading(false); }
  };

  useEffect(() => {
    if (!examActive) return;
    examTimerRef.current = setInterval(() => {
      setExamTimer((t) => {
        if (t <= 1) { handleExamAnswer(0); return examConfig.mode === "speedrun" && examConfig.timePerCard > 10 ? 5 : examConfig.timePerCard; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(examTimerRef.current);
  }, [examActive, examIndex]);

  useEffect(() => {
    if (examActive && examQueue[examIndex] && examConfig.mode === "qcm" && !examQueue[examIndex].isCustom) generateQcmChoices(examQueue[examIndex]);
    if (examActive && examQueue[examIndex] && examQueue[examIndex].isCustom && examQueue[examIndex].isQcm) {
      setQcmChoices([...examQueue[examIndex].choices].sort(() => Math.random() - 0.5)); setQcmSelected(null);
    }
  }, [examIndex, examActive]);

  const handleExamAnswer = (q) => {
    clearInterval(examTimerRef.current);
    const card = examQueue[examIndex];
    setExamStreak(q >= 3 ? examStreak + 1 : 0);
    const currentTimePerCard = examConfig.mode === "speedrun" && examConfig.timePerCard > 10 ? 5 : examConfig.timePerCard;
    setExamAnswers([...examAnswers, { card, q, timeSpent: currentTimePerCard - examTimer }]);
    setQcmSelected(null); setQcmChoices([]);
    if (examIndex + 1 >= examQueue.length) {
      setExamActive(false);
      setStats((prev) => ({ ...prev, examsDone: prev.examsDone + 1 }));
      checkBadges(expressions, { ...stats, examsDone: stats.examsDone + 1 }, sessions, unlockedBadges);
      const wrongs = examAnswers.filter(a => a.q < 3).map(a => a.card);
      setWrongAnswersForConfusion(wrongs);
      setExamSubView("results");
    } else {
      setExamIndex((i) => i + 1); setExamRevealed(false); setExamTimer(currentTimePerCard);
    }
  };

  const examScore = useMemo(() => {
    if (examAnswers.length === 0) return 0;
    const good = examAnswers.filter((a) => a.q >= 3).length;
    return Math.round((good / examAnswers.length) * 100);
  }, [examAnswers]);

  const handleAddCat = () => {
    if (!newCat.name.trim() || categories.find((c) => c.name === newCat.name.trim())) { showToast("Nom invalide ou existant.", "error"); return; }
    setCategories((prev) => [...prev, { ...newCat, name: newCat.name.trim() }]);
    setNewCat({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#4F8EF7" });
    showToast("Module créé !");
  };
  const deleteCategory = (name) => { setCategories((prev) => prev.filter((c) => c.name !== name)); setExpressions((prev) => prev.filter((e) => e.category !== name)); showToast(`Module supprimé.`, "info"); };
  const handleImport = () => {
    const result = parseImport(importText);
    if (!result) { showToast("Format invalide.", "error"); return; }
    setExpressions(prev => { const ex = new Set(prev.map(e => e.front+e.category)); return [...prev, ...result.expressions.filter(e => !ex.has(e.front+e.category))]; });
    if (result.categories.length > 0) setCategories(prev => { const ex = new Set(prev.map(c => c.name)); return [...prev, ...result.categories.filter(c => !ex.has(c.name))]; });
    setImportText(""); setShowImport(false); showToast("Import réussi !");
  };

  const heatmap = useMemo(() => buildHeatmap(sessions), [sessions]);
  const weeks = useMemo(() => getLast12Weeks(), []);
  const catNames = useMemo(() => categories.map((c) => c.name), [categories]);

  const filteredExps = useMemo(() => {
    let list = filterCat === "Toutes" ? expressions : expressions.filter((e) => e.category === filterCat);
    if (filterLevel !== "Tous") {
      if (filterLevel === "Maîtrisées") list = list.filter((e) => e.level >= 7);
      else if (filterLevel === "En retard") list = list.filter((e) => e.nextReview <= today() && e.level < 7);
      else if (filterLevel === "Nouvelles") list = list.filter((e) => e.level === 0);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => e.front.toLowerCase().includes(q) || e.back.toLowerCase().includes(q) || (e.example || "").toLowerCase().includes(q));
    }
    return list;
  }, [expressions, filterCat, filterLevel, searchQuery]);

  const levelLabel = ["Nouveau", "J+1", "J+6", "Adaptatif", "Adaptatif", "Avancé", "Expert", "✅ Maîtrisé"];

  const hour = new Date().getHours();
  const greeting = hour >= 18 ? "Bonsoir" : "Bonjour";
  const estimatedTime = Math.ceil(todayReviews.length * 0.5);
  const newCards = expressions.filter(e => e.level === 0);
  const criticalCards = todayReviews.filter(e => (e.difficulty !== undefined && e.difficulty >= 8) || (e.difficulty === undefined && e.easeFactor <= 1.8));
  const weakestCat = categories.length > 0 ? categories.map(cat => {
    const catExps = expressions.filter(e => e.category === cat.name);
    const mastered = catExps.filter(e => e.level >= 7).length;
    return { name: cat.name, pct: catExps.length ? (mastered / catExps.length) * 100 : 0 };
  }).sort((a, b) => a.pct - b.pct)[0]?.name || categories[0]?.name : "";

  const avgReviewsPerDay = stats.streak > 0 ? Math.max(1, Math.round(stats.totalReviews / stats.streak)) : 5;
  const remainingCardsToMaster = expressions.length - masteredCount;
  const predictedDaysToMastery = remainingCardsToMaster > 0 ? Math.ceil(remainingCardsToMaster / avgReviewsPerDay) : 0;

  // AI English Practice
  const sendPracticeMessage = async (text) => {
    if (!text.trim() || practiceLoading) return;
    const userMsg = { role: "user", text: text.trim() };
    setPracticeMessages(prev => [...prev, userMsg]);
    setPracticeInput(""); setPracticeLoading(true);
    try {
      const personaInst = practicePersona === "MMA" ? "Act like an aggressive MMA Fighter." : practicePersona === "Recruteur" ? "Act like a strict Tech Recruiter." : "Act as a friendly coach.";
      const systemPrompt = `You are an English coach for El Hadji Malick, a CS student in Dakar. Speak ONLY in English. Level: ${practiceLevel}. Topic: ${practiceTopic}. ${personaInst} Keep it conversational (2-4 sentences).`;
      const groqHistory = practiceMsgRef.current.slice(-10).map(m => ({ role: m.role, content: m.text }));
      groqHistory.push({ role: "user", content: text.trim() });
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` }, body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 400, temperature: 0.85, messages: [{ role: "system", content: systemPrompt }, ...groqHistory] }) });
      if (!res.ok) throw new Error("API Error");
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "I didn't catch that.";
      setPracticeMessages(prev => [...prev, { role: "assistant", text: reply }]);
      speakText(reply);
    } catch (err) { setPracticeMessages(prev => [...prev, { role: "assistant", text: "Connection error. Please try again! 🔄" }]); } 
    finally { setPracticeLoading(false); }
  };

  const speakText = (text) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text); utt.lang = "en-US"; utt.rate = 0.92;
    setPracticeSpeaking(true);
    utt.onend = () => setPracticeSpeaking(false); utt.onerror = () => setPracticeSpeaking(false);
    window.speechSynthesis.speak(utt);
  };

  const togglePracticeMic = async () => {
    if (practiceListening) { if (practiceMediaRecorderRef.current) practiceMediaRecorderRef.current.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      practiceMediaRecorderRef.current = mediaRecorder; practiceAudioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) practiceAudioChunksRef.current.push(event.data); };
      mediaRecorder.onstop = async () => {
        setPracticeListening(false); setPracticeInput("⏳ Transcription Whisper...");
        const audioBlob = new Blob(practiceAudioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData(); formData.append("file", audioBlob, "audio.webm"); formData.append("model", "whisper-large-v3"); formData.append("language", "en");
        try {
          const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}` }, body: formData });
          const data = await res.json();
          if (data.text) { setPracticeInput(""); sendPracticeMessage(data.text.trim()); } else { setPracticeInput(""); }
        } catch (err) { setPracticeInput(""); showToast("Erreur Whisper.", "error"); } 
        finally { stream.getTracks().forEach(track => track.stop()); }
      };
      mediaRecorder.start(); setPracticeListening(true);
    } catch (err) { showToast("Micro refusé.", "error"); }
  };

  const resetPracticeChat = () => { window.speechSynthesis?.cancel(); setPracticeSpeaking(false); setPracticeMessages([{ role: "assistant", text: `Great! Let's talk about "${practiceTopic}". I'm ready whenever you are! 🎤` }]); };

  // ══════════════════════════════════════════════════════════════════════════
  // FONCTIONS GOD LEVEL
  // ══════════════════════════════════════════════════════════════════════════

  const generateGraph = () => {
    showToast("🧠 Génération du graphe de connaissances...", "info");
    const nodes = categories.map((cat, i) => ({ id: cat.name, label: cat.name, color: cat.color, x: Math.random()*400, y: Math.random()*300 }));
    const edges = [];
    expressions.forEach(exp => {
      if (nodes.find(n => n.id === exp.category)) edges.push({ from: exp.front, to: exp.category });
    });
    setGraphData({ nodes, edges });
    showToast("✅ Graphe prêt (simulation)");
  };

  const generateCoachPlan = async () => {
    setCoachLoading(true);
    try {
      const prompt = `Agis en tant que coach IA. L'étudiant a ${expressions.length} fiches, les révisions dues aujourd'hui : ${todayReviews.length}. Son streak actuel : ${stats.streak} jours. Les examens à venir : ${categories.filter(c=>c.examDate).map(c=>`${c.name} le ${c.examDate}`).join(", ")}. Propose un planning de révision heure par heure pour les 24 prochaines heures en tenant compte de la courbe de l'oubli. Format JSON : {"plan": [{"time": "08:00", "activity": "..."}]}`;
      const raw = await callClaude("Tu es un coach pédagogique expert.", prompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      const data = JSON.parse(clean);
      setCoachPlan(data.plan);
      showToast("📋 Planning généré !");
    } catch (e) { showToast("Erreur planification", "error"); }
    setCoachLoading(false);
  };

  const attackWorldBoss = () => {
    const damage = Math.floor(Math.random() * 20) + 5;
    setWorldBossHp(prev => Math.max(0, prev - damage));
    showToast(`Tu infliges ${damage} dégâts !`);
    if (worldBossHp <= damage) {
      showToast("🎉 World Boss vaincu ! +500 XP");
      setPlayerLevel(prev => prev + 1);
      setWorldBossHp(100);
    }
  };

  const enterPalaceMode = () => {
    setPalaceMode(true);
    showToast("🏰 Palais de mémoire activé (exploration visuelle)");
  };

  const generateConfusionDestroyer = async () => {
    if (wrongAnswersForConfusion.length === 0) return;
    showToast("🧪 Génération des fiches 'confusion-destroyer'...");
    for (let card of wrongAnswersForConfusion) {
      try {
        const raw = await callClaude(
          `Tu es un expert en pédagogie. L'étudiant a échoué sur le concept : "${card.front}". Crée une fiche qui explique la différence entre ce concept et un concept similaire qui aurait pu prêter à confusion. JSON : {"front":"...", "back":"..."}`,
          `Concept erroné: ${card.front}`
        );
        const clean = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        const newExp = {
          id: Date.now().toString() + Math.random(),
          front: parsed.front || `Différence : ${card.front}`,
          back: parsed.back || "",
          category: card.category || "Général",
          level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
        };
        setExpressions(prev => [newExp, ...prev]);
      } catch (e) { console.error(e); }
    }
    setWrongAnswersForConfusion([]);
    showToast("✅ Fiches anti-confusion créées !");
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PDF.js — extraction de texte côté client (God Level)
  // ══════════════════════════════════════════════════════════════════════════
  const extractPdfText = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // Chargement dynamique de pdf.js depuis CDN
          if (!window.pdfjsLib) {
            await new Promise((res, rej) => {
              const script = document.createElement("script");
              script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
              script.onload = res; script.onerror = rej;
              document.head.appendChild(script);
            });
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          }
          const typedArray = new Uint8Array(e.target.result);
          const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map((item) => item.str).join(" ");
            fullText += `\n--- Page ${i} ---\n${pageText}`;
          }
          resolve({ text: fullText.trim(), pages: pdf.numPages });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handlePdfUpload = async (e, target = "lab") => {
    const file = e.target.files[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isText = file.type.startsWith("text/") || file.name.match(/\.(txt|md)$/i);
    if (target === "lab") {
      setPdfFileName(file.name);
      setPdfExtractedText("");
      setPdfBatchPreview([]);
      setPdfSummary("");
      setPdfParsing(true);
      try {
        if (isPdf) {
          const { text, pages } = await extractPdfText(file);
          setPdfExtractedText(text);
          setPdfPageCount(pages);
          showToast(`✅ PDF lu : ${pages} pages, ${text.split(" ").length} mots extraits !`);
        } else if (isText) {
          const text = await file.text();
          setPdfExtractedText(text);
          setPdfPageCount(1);
          showToast("✅ Fichier texte chargé !");
        } else {
          showToast("Seulement PDF et TXT sont supportés pour l'extraction directe.", "error");
        }
      } catch (err) {
        showToast("Erreur lecture PDF : " + err.message, "error");
      }
      setPdfParsing(false);
    } else {
      // target = "resume"
      setResumeFile(file);
      setResumeResult(null);
      setResumeParsing(true);
      try {
        if (isPdf) {
          const { text } = await extractPdfText(file);
          setResumeText(text);
          showToast("✅ Cours chargé ! Clique sur Résumer.");
        } else if (isText) {
          const text = await file.text();
          setResumeText(text);
          showToast("✅ Cours chargé !");
        } else {
          showToast("PDF ou TXT uniquement.", "error");
        }
      } catch (err) {
        showToast("Erreur lecture : " + err.message, "error");
      }
      setResumeParsing(false);
    }
  };

  // Génère les fiches depuis le texte PDF extrait
  const generateCardsFromPdf = async () => {
    if (!pdfExtractedText.trim()) { showToast("Aucun texte extrait. Charge d'abord un PDF.", "error"); return; }
    setPdfGenLoading(true);
    try {
      const textSlice = pdfExtractedText.substring(0, 8000);
      const system = `Tu es un assistant pédagogique expert. À partir du cours fourni, génère exactement ${pdfCardsCount} fiches de révision de qualité, couvrant les concepts essentiels. Réponds UNIQUEMENT en JSON valide sans markdown: {"cards":[{"front":"Concept/Question","back":"Explication complète et mémorable","example":"Exemple concret ou application"}]}`;
      const raw = await callClaude(system, `Module: ${docCategory}\n\nCours:\n${textSlice}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
      setPdfBatchPreview(cards);
      showToast(`✨ ${cards.length} fiches générées ! Vérifie avant de valider.`);
    } catch (err) {
      showToast("Erreur génération fiches : " + err.message, "error");
    }
    setPdfGenLoading(false);
  };

  // Génère un résumé du PDF
  const generatePdfSummary = async () => {
    if (!pdfExtractedText.trim()) { showToast("Aucun texte extrait. Charge d'abord un PDF.", "error"); return; }
    setPdfSummaryLoading(true);
    try {
      const textSlice = pdfExtractedText.substring(0, 8000);
      const raw = await callClaude(
        `Tu es un expert en synthèse pédagogique. Génère un résumé structuré du cours. Format : 1) Introduction (2-3 phrases), 2) Points clés (liste numérotée, 5-8 points essentiels avec explication courte), 3) Conclusion et à retenir. Sois précis, clair et utile pour un étudiant. Réponds en français.`,
        `Cours à résumer:\n${textSlice}`
      );
      setPdfSummary(raw.trim());
      showToast("📝 Résumé généré !");
    } catch (err) {
      showToast("Erreur résumé : " + err.message, "error");
    }
    setPdfSummaryLoading(false);
  };

  const confirmPdfCards = () => {
    if (pdfBatchPreview.length === 0) return;
    const newExps = pdfBatchPreview.map(card => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      front: (card.front || "").trim(), back: (card.back || "").trim(),
      example: (card.example || "").trim(), category: docCategory,
      level: 0, nextReview: today(), createdAt: today(),
      easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
    })).filter(e => e.front && e.back);
    setExpressions(prev => [...newExps, ...prev]);
    setStats(prev => ({ ...prev, aiGenerated: prev.aiGenerated + newExps.length }));
    showToast(`🎉 ${newExps.length} fiches sauvegardées dans "${docCategory}" !`);
    setPdfBatchPreview([]);
    setPdfExtractedText("");
    setPdfFileName("");
  };

  // ── RÉSUMÉ DE COURS STANDALONE ─────────────────────────────────────────
  const generateResume = async () => {
    if (!resumeText.trim()) { showToast("Colle ou charge un cours d'abord.", "error"); return; }
    setResumeLoading(true);
    setResumeResult(null);
    try {
      const textSlice = resumeText.substring(0, 9000);
      const styleInstr = resumeStyle === "flash"
        ? "Génère une synthèse ultra-courte : 5 points max, 1 phrase chacun. Parfait pour révision express 5 minutes avant l'examen."
        : resumeStyle === "cornell"
        ? "Génère un résumé format Cornell : une colonne 'Questions clés' (5-7 questions essentielles) et une colonne 'Réponses/Notes' avec les réponses détaillées. Format JSON: {\"type\":\"cornell\", \"rows\":[{\"question\":\"...\",\"answer\":\"...\"}], \"summary\":\"Résumé global en 2 phrases\"}"
        : "Génère un résumé complet structuré en JSON: {\"type\":\"complet\", \"intro\":\"Introduction du sujet (2-3 phrases)\", \"keyPoints\":[{\"title\":\"Titre du point\",\"content\":\"Explication (2-4 phrases)\"}], \"conclusion\":\"À retenir absolument (2-3 phrases)\", \"glossary\":[{\"term\":\"Terme\",\"def\":\"Définition courte\"}]}";
      const raw = await callClaude(
        `Tu es un professeur expert en synthèse pédagogique pour étudiants en licence informatique au Sénégal. ${styleInstr} Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après.`,
        `Cours à synthétiser:\n${textSlice}`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResumeResult(parsed);
      showToast("📝 Résumé prêt !");
    } catch (err) {
      showToast("Erreur : " + err.message, "error");
    }
    setResumeLoading(false);
  };

  // Ancien handler kept for compatibility
  const handleDocumentUpload = (e) => { handlePdfUpload(e, "lab"); };
  const analyzeDocument = generateCardsFromPdf;

  const joinStudyRoom = () => {
    setStudyRoomUsers(["El Hadji Malick", "Ami(e) 1", "Ami(e) 2"]);
    showToast("👥 Tu as rejoint la salle d'étude (simulation).");
  };

  const predictScore = () => {
    const avgLevel = expressions.reduce((sum, e) => sum + (e.level || 0), 0) / Math.max(1, expressions.length);
    const predicted = Math.min(20, Math.round((avgLevel / 7) * 16 + 4));
    setPredictedScore(predicted);
    showToast(`🎯 Note estimée à l'examen : ${predicted}/20`);
  };

  useEffect(() => {
    if (view === "review" && revealed) {
      setStressLevel(Math.floor(Math.random() * 40) + 60);
    }
  }, [revealed, view]);

  const theme = isDarkMode 
    ? { bg: "#0F172A", text: "#F8FAFC", textMuted: "#94A3B8", cardBg: "#1E293B", border: "#334155", inputBg: "#0F172A", highlight: "#3B82F6", nav: "#0F172A" } 
    : { bg: "#F0F5FF", text: "#1F2937", textMuted: "#6B7A99", cardBg: "white", border: "#EFF6FF", inputBg: "#F8FAFF", highlight: "#1D4ED8", nav: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)" };

  const currentCard = reviewQueue.length > 0 ? reviewQueue[reviewIndex] : null;

  if (!loaded) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: theme.bg, color: theme.highlight }}><div style={{ fontSize: 40, animation: "pulse 1s infinite" }}>🧠</div><h2>Initialisation du Second Cerveau...</h2></div>;

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: "'Sora', sans-serif", transition: "background 0.3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${theme.bg}; } ::-webkit-scrollbar-thumb { background: #3B82F6; border-radius: 3px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 15px rgba(59,130,246,0.4); } 50% { box-shadow: 0 0 30px rgba(59,130,246,0.8); } }
        .hov:hover { transform: translateY(-2px); transition: all 0.2s; }
        .card-hov:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,0.1) !important; transition: all 0.25s; }
        .btn-glow:hover { animation: glow 1.5s infinite; transition: all 0.3s; }
        .occlusion-img { filter: blur(12px); transition: filter 0.3s; cursor: pointer; } .occlusion-img:hover { filter: blur(0px); }
        input, select, textarea { font-family: 'Sora', sans-serif !important; color: ${theme.text} !important; outline: none; transition: border 0.2s; }
        input:focus, textarea:focus, select:focus { border-color: #3B82F6 !important; }
        .tab-active { background: ${isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.2)"} !important; font-weight: 700 !important; color: ${isDarkMode ? "white" : "white"} !important; }
      `}</style>

      {lofiPlaying && <iframe width="0" height="0" src="https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1" frameBorder="0" allow="autoplay" title="Lofi"></iframe>}

      {toast && <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "14px 22px", borderRadius: 14, color: "white", fontWeight: 700, fontSize: 14, background: toast.type === "error" ? "#ef4444" : toast.type === "info" ? "#3B82F6" : "linear-gradient(135deg,#4F8EF7,#7B5FF5)", boxShadow: "0 8px 30px rgba(0,0,0,0.15)", animation: "slideIn 0.3s ease" }}>{toast.msg}</div>}

      {newBadge && (
        <div style={{ position: "fixed", top: 90, right: 20, zIndex: 9998, display: "flex", gap: 16, alignItems: "center", background: theme.cardBg, border: "2px solid #F59E0B", borderRadius: 18, padding: "18px 24px", boxShadow: "0 12px 40px rgba(245,158,11,0.2)", animation: "slideIn 0.4s ease" }}>
          <span style={{ fontSize: 32 }}>{newBadge.icon}</span>
          <div><div style={{ fontWeight: 800, color: theme.text, fontSize: 15 }}>Badge débloqué !</div><div style={{ color: "#F0A040", fontWeight: 700 }}>{newBadge.label}</div><div style={{ color: theme.textMuted, fontSize: 12 }}>{newBadge.desc}</div></div>
        </div>
      )}

      <nav style={{ background: theme.nav, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap", gap: 8, minHeight: 70, borderBottom: isDarkMode ? `1px solid ${theme.border}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, background: "rgba(255,255,255,0.2)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "white", fontFamily: "'JetBrains Mono', monospace" }}>M²</div>
          <div><div style={{ fontSize: 20, fontWeight: 800, color: "white", letterSpacing: "-0.5px" }}>MémoMaître</div><div style={{ fontSize: 10, color: "#DBEAFE", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>GOD LEVEL v5</div></div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { id: "dashboard", icon: "⚡", label: "Accueil" },
            { id: "add", icon: "✦", label: editingId ? "Éditer" : "Ajouter" },
            { id: "list", icon: "◈", label: "Fiches" },
            { id: "categories", icon: "◉", label: "Modules" },
            { id: "exam", icon: "🎯", label: "Examen" },
            { id: "practice", icon: "🗣️", label: "English" },
            { id: "stats", icon: "▣", label: "Stats" },
            { id: "badges", icon: "🏆", label: "Badges" },
            { id: "lab", icon: "🧪", label: "Lab" },
          ].map((n) => (
            <button key={n.id} onClick={() => { setView(n.id); if (n.id === "exam") setExamSubView("home"); }} className={view === n.id ? "tab-active" : "hov"} style={{ padding: "8px 16px", borderRadius: 10, color: view === n.id ? "white" : "rgba(255,255,255,0.8)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: "transparent", transition: "all 0.2s" }}>
              {n.icon} {n.label} {n.id === "dashboard" && todayReviews.length > 0 && <span style={{ background: "#F59E0B", color: "white", borderRadius: "50%", padding: "2px 6px", fontSize: 10, fontWeight: 900, marginLeft: 4 }}>{todayReviews.length}</span>}
            </button>
          ))}
          <button onClick={() => setLofiPlaying(!lofiPlaying)} style={{ padding: "8px", borderRadius: 10, background: lofiPlaying ? "#10B981" : "rgba(255,255,255,0.1)", color: "white", border: "none", cursor: "pointer", fontSize: 14, marginLeft: 8 }} title="Focus Audio (Lo-Fi)">🎧</button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ padding: "8px", borderRadius: 10, background: "rgba(255,255,255,0.1)", color: "white", border: "none", cursor: "pointer", fontSize: 14 }} title="Thème">{isDarkMode ? "☀️" : "🌙"}</button>
        </div>
      </nav>

      <main style={{ flex: 1, maxWidth: 1000, width: "100%", margin: "0 auto", padding: "32px 20px 80px" }}>

        {/* ══════════════════════════════════════════════════════════════════
            LABORATOIRE GOD LEVEL
        ══════════════════════════════════════════════════════════════════ */}
        {view === "lab" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 30, fontWeight: 900, color: theme.highlight, margin: 0 }}>🧪 Laboratoire</h1>
                <p style={{ color: theme.textMuted, fontSize: 14, margin: 0 }}>Outils IA avancés — PDF, Résumés, Coach & Plus</p>
              </div>
            </div>

            {/* ── TABS LAB ───────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
              {[
                { id: "home", icon: "🏠", label: "Accueil" },
                { id: "pdf", icon: "📄", label: "PDF → Fiches" },
                { id: "resume", icon: "📝", label: "Résumé de cours" },
                { id: "coach", icon: "📅", label: "Coach IA" },
                { id: "tools", icon: "⚙️", label: "Outils" },
              ].map(tab => (
                <button key={tab.id} onClick={() => setLabSubView(tab.id)} style={{
                  padding: "10px 18px", borderRadius: 12,
                  background: labSubView === tab.id ? "linear-gradient(135deg,#1D4ED8,#3B82F6)" : theme.cardBg,
                  color: labSubView === tab.id ? "white" : theme.textMuted,
                  border: `1px solid ${labSubView === tab.id ? "transparent" : theme.border}`,
                  fontWeight: 700, fontSize: 13, cursor: "pointer"
                }}>{tab.icon} {tab.label}</button>
              ))}
            </div>

            {/* ── HOME ────────────────────────────────────────────────── */}
            {labSubView === "home" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                {[
                  { icon: "📄", title: "PDF → Fiches", desc: "Charge un PDF et génère des fiches automatiquement", color: "#3B82F6", action: () => setLabSubView("pdf") },
                  { icon: "📝", title: "Résumé de cours", desc: "Résumé intelligent : Complet, Flash ou Cornell", color: "#8B5CF6", action: () => setLabSubView("resume") },
                  { icon: "📅", title: "Coach IA", desc: "Planning heure par heure basé sur tes échéances", color: "#10B981", action: () => setLabSubView("coach") },
                  { icon: "🧠", title: "Graphe de savoirs", desc: "Visualise tes connexions de connaissances", color: "#F59E0B", action: generateGraph },
                  { icon: "🐉", title: "World Boss RPG", desc: `HP restant : ${worldBossHp}% — Révise pour attaquer !`, color: "#EF4444", action: attackWorldBoss },
                  { icon: "🎯", title: "Prédiction de note", desc: "Estime ta note sur 20 basé sur tes niveaux FSRS", color: "#06B6D4", action: predictScore },
                  { icon: "👥", title: "Salle d'étude", desc: "Rejoins une session collaborative (simulation)", color: "#F97316", action: joinStudyRoom },
                  ...(wrongAnswersForConfusion.length > 0 ? [{ icon: "🔬", title: "Anti-confusion IA", desc: `${wrongAnswersForConfusion.length} erreurs détectées — génère des fiches correctives`, color: "#EC4899", action: generateConfusionDestroyer }] : []),
                ].map((item, i) => (
                  <div key={i} className="card-hov" onClick={item.action} style={{
                    background: theme.cardBg, borderRadius: 20, padding: "22px", cursor: "pointer",
                    border: `1px solid ${theme.border}`, borderTop: `3px solid ${item.color}`,
                    display: "flex", flexDirection: "column", gap: 8
                  }}>
                    <div style={{ fontSize: 28 }}>{item.icon}</div>
                    <div style={{ fontWeight: 800, color: theme.text, fontSize: 15 }}>{item.title}</div>
                    <div style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.5 }}>{item.desc}</div>
                    <div style={{ marginTop: "auto", color: item.color, fontSize: 12, fontWeight: 700 }}>Ouvrir →</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── PDF → FICHES ────────────────────────────────────────── */}
            {labSubView === "pdf" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Upload zone */}
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: "28px", border: `2px dashed ${pdfExtractedText ? "#10B981" : theme.border}` }}>
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>{pdfExtractedText ? "✅" : "📄"}</div>
                    <h2 style={{ color: theme.text, margin: 0, fontSize: 20, fontWeight: 800 }}>
                      {pdfExtractedText ? `"${pdfFileName}" chargé` : "Charge ton cours PDF"}
                    </h2>
                    {pdfExtractedText && (
                      <p style={{ color: "#10B981", fontWeight: 700, marginTop: 6, fontSize: 14 }}>
                        {pdfPageCount} pages · {pdfExtractedText.split(" ").length.toLocaleString()} mots extraits
                      </p>
                    )}
                    {!pdfExtractedText && <p style={{ color: theme.textMuted, fontSize: 13 }}>PDF ou TXT — Le texte est extrait localement, aucun upload</p>}
                  </div>

                  <label style={{
                    display: "block", width: "100%", padding: "14px", background: pdfParsing ? theme.inputBg : "linear-gradient(135deg,#1D4ED8,#3B82F6)",
                    color: "white", borderRadius: 14, fontWeight: 800, fontSize: 15,
                    textAlign: "center", cursor: pdfParsing ? "default" : "pointer"
                  }}>
                    {pdfParsing ? "⏳ Extraction en cours..." : pdfExtractedText ? "📂 Changer de fichier" : "📂 Choisir un PDF ou TXT"}
                    <input type="file" accept=".pdf,.txt,.md" style={{ display: "none" }} onChange={(e) => handlePdfUpload(e, "lab")} disabled={pdfParsing} />
                  </label>

                  {pdfExtractedText && (
                    <div style={{ marginTop: 16, background: theme.inputBg, borderRadius: 12, padding: 14, maxHeight: 180, overflowY: "auto" }}>
                      <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700, marginBottom: 6, fontFamily: "JetBrains Mono, monospace" }}>APERÇU DU CONTENU EXTRAIT</div>
                      <p style={{ fontSize: 13, color: theme.text, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                        {pdfExtractedText.substring(0, 600)}{pdfExtractedText.length > 600 ? "..." : ""}
                      </p>
                    </div>
                  )}
                </div>

                {/* Config génération */}
                {pdfExtractedText && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", border: `1px solid ${theme.border}` }}>
                    <h3 style={{ color: theme.text, fontWeight: 800, marginBottom: 16, fontSize: 16 }}>⚙️ Configuration</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                      <div>
                        <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, display: "block", marginBottom: 6 }}>MODULE CIBLE</label>
                        <select value={docCategory} onChange={e => setDocCategory(e.target.value)} style={{
                          width: "100%", padding: "12px 14px", background: theme.inputBg,
                          border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text, fontSize: 14
                        }}>
                          {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, display: "block", marginBottom: 6 }}>NOMBRE DE FICHES</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {[5, 8, 12, 15, 20].map(n => (
                            <button key={n} onClick={() => setPdfCardsCount(n)} style={{
                              flex: 1, padding: "10px 0", borderRadius: 10,
                              background: pdfCardsCount === n ? "#3B82F6" : theme.inputBg,
                              color: pdfCardsCount === n ? "white" : theme.textMuted,
                              border: `1.5px solid ${pdfCardsCount === n ? "#3B82F6" : theme.border}`,
                              fontWeight: 800, fontSize: 13, cursor: "pointer"
                            }}>{n}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <button onClick={generateCardsFromPdf} disabled={pdfGenLoading || pdfSummaryLoading} className="btn-glow hov" style={{
                        flex: 1, padding: "14px", background: "linear-gradient(135deg,#1D4ED8,#3B82F6)",
                        color: "white", border: "none", borderRadius: 14, fontWeight: 800, fontSize: 15, cursor: "pointer"
                      }}>
                        {pdfGenLoading ? "⏳ Génération..." : `✨ Générer ${pdfCardsCount} fiches`}
                      </button>
                      <button onClick={generatePdfSummary} disabled={pdfGenLoading || pdfSummaryLoading} className="hov" style={{
                        flex: 1, padding: "14px", background: isDarkMode ? "#334155" : "#F0FDF4",
                        color: "#10B981", border: "2px solid #10B981", borderRadius: 14, fontWeight: 800, fontSize: 15, cursor: "pointer"
                      }}>
                        {pdfSummaryLoading ? "⏳ Résumé..." : "📝 Résumer le PDF"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Résumé PDF */}
                {pdfSummary && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", border: `2px solid #10B981` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ color: "#10B981", fontWeight: 800, margin: 0 }}>📝 Résumé du PDF</h3>
                      <button onClick={() => navigator.clipboard.writeText(pdfSummary).then(() => showToast("Copié !"))} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>📋 Copier</button>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, color: theme.text, fontSize: 14 }}>{pdfSummary}</div>
                  </div>
                )}

                {/* Aperçu des fiches générées */}
                {pdfBatchPreview.length > 0 && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", border: `2px solid #3B82F6` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <h3 style={{ color: theme.highlight, fontWeight: 800, margin: 0 }}>✨ {pdfBatchPreview.length} fiches prêtes</h3>
                      <button onClick={confirmPdfCards} className="btn-glow hov" style={{
                        padding: "10px 22px", background: "linear-gradient(135deg,#10B981,#059669)",
                        color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer"
                      }}>✅ Tout sauvegarder</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {pdfBatchPreview.map((card, idx) => (
                        <div key={idx} style={{ background: theme.inputBg, borderRadius: 14, padding: "16px", border: `1px solid ${theme.border}`, display: "flex", gap: 14, alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, color: theme.text, marginBottom: 4, fontSize: 14 }}>{card.front}</div>
                            <div style={{ color: theme.textMuted, fontSize: 13, lineHeight: 1.5 }}>{card.back}</div>
                            {card.example && <div style={{ color: "#3B82F6", fontSize: 12, marginTop: 6, fontStyle: "italic" }}>💡 {card.example}</div>}
                          </div>
                          <button onClick={() => setPdfBatchPreview(prev => prev.filter((_, i) => i !== idx))} style={{ background: "#FEF2F2", border: "none", color: "#EF4444", borderRadius: 8, padding: "6px 10px", cursor: "pointer", flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={confirmPdfCards} style={{
                      width: "100%", marginTop: 16, padding: 14,
                      background: "linear-gradient(135deg,#10B981,#059669)",
                      color: "white", border: "none", borderRadius: 14, fontWeight: 800, fontSize: 15, cursor: "pointer"
                    }}>🎉 Sauvegarder toutes les fiches dans "{docCategory}"</button>
                  </div>
                )}
              </div>
            )}

            {/* ── RÉSUMÉ DE COURS ─────────────────────────────────────── */}
            {labSubView === "resume" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: "28px", border: `1px solid ${theme.border}` }}>
                  <h2 style={{ color: theme.text, fontWeight: 800, marginBottom: 6, fontSize: 20 }}>📝 Résumé Intelligent de Cours</h2>
                  <p style={{ color: theme.textMuted, fontSize: 13, marginBottom: 20 }}>Colle ton cours ou charge un PDF — l'IA génère un résumé structuré en secondes.</p>

                  {/* Style de résumé */}
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, display: "block", marginBottom: 8 }}>STYLE DE RÉSUMÉ</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      {[
                        { id: "complet", icon: "📚", label: "Complet", desc: "Structuré avec glossaire" },
                        { id: "flash", icon: "⚡", label: "Flash", desc: "5 points essentiels" },
                        { id: "cornell", icon: "🗒️", label: "Cornell", desc: "Questions + Réponses" },
                      ].map(s => (
                        <button key={s.id} onClick={() => setResumeStyle(s.id)} style={{
                          flex: 1, padding: "12px 8px", borderRadius: 14, cursor: "pointer",
                          background: resumeStyle === s.id ? "linear-gradient(135deg,#8B5CF6,#7C3AED)" : theme.inputBg,
                          color: resumeStyle === s.id ? "white" : theme.textMuted,
                          border: `1.5px solid ${resumeStyle === s.id ? "#8B5CF6" : theme.border}`,
                          fontWeight: 700, textAlign: "center"
                        }}>
                          <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                          <div style={{ fontSize: 13 }}>{s.label}</div>
                          <div style={{ fontSize: 11, opacity: 0.8 }}>{s.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Upload PDF */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, display: "block", marginBottom: 8 }}>CHARGER UN FICHIER (optionnel)</label>
                    <label style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                      background: resumeFile ? "#F0FDF4" : theme.inputBg,
                      border: `1.5px dashed ${resumeFile ? "#10B981" : theme.border}`,
                      borderRadius: 12, cursor: resumeParsing ? "default" : "pointer", color: resumeFile ? "#10B981" : theme.textMuted
                    }}>
                      <span style={{ fontSize: 20 }}>{resumeParsing ? "⏳" : resumeFile ? "✅" : "📂"}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        {resumeParsing ? "Extraction en cours..." : resumeFile ? resumeFile.name : "PDF ou TXT — texte extrait localement"}
                      </span>
                      <input type="file" accept=".pdf,.txt,.md" style={{ display: "none" }} onChange={(e) => handlePdfUpload(e, "resume")} disabled={resumeParsing} />
                    </label>
                  </div>

                  {/* Zone texte */}
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, display: "block", marginBottom: 8 }}>CONTENU DU COURS</label>
                    <textarea
                      value={resumeText}
                      onChange={e => setResumeText(e.target.value)}
                      rows={8}
                      placeholder="Colle ici le contenu de ton cours... ou charge un fichier PDF ci-dessus."
                      style={{
                        width: "100%", padding: "14px 16px", background: theme.inputBg,
                        border: `1.5px solid ${theme.border}`, borderRadius: 14,
                        color: theme.text, fontSize: 14, lineHeight: 1.7, resize: "vertical"
                      }}
                    />
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, textAlign: "right" }}>
                      {resumeText.split(" ").filter(Boolean).length} mots
                    </div>
                  </div>

                  <button onClick={generateResume} disabled={resumeLoading || !resumeText.trim()} className="btn-glow hov" style={{
                    width: "100%", padding: "16px", fontSize: 16, fontWeight: 800,
                    background: resumeText.trim() ? "linear-gradient(135deg,#8B5CF6,#7C3AED)" : theme.inputBg,
                    color: resumeText.trim() ? "white" : theme.textMuted,
                    border: "none", borderRadius: 16, cursor: resumeText.trim() ? "pointer" : "default"
                  }}>
                    {resumeLoading ? "⏳ L'IA synthétise le cours..." : `📝 Générer le résumé ${resumeStyle === "flash" ? "Flash" : resumeStyle === "cornell" ? "Cornell" : "Complet"}`}
                  </button>
                </div>

                {/* Résultat */}
                {resumeResult && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "28px", border: `2px solid #8B5CF6`, animation: "fadeUp 0.4s ease" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
                      <h3 style={{ color: "#8B5CF6", fontWeight: 800, margin: 0, fontSize: 18 }}>
                        {resumeStyle === "flash" ? "⚡ Résumé Flash" : resumeStyle === "cornell" ? "🗒️ Notes Cornell" : "📚 Résumé Complet"}
                      </h3>
                      <button onClick={() => {
                        const text = resumeStyle === "cornell"
                          ? (resumeResult.rows || []).map(r => `Q: ${r.question}\nR: ${r.answer}`).join("\n\n") + (resumeResult.summary ? `\n\nSYNTHÈSE: ${resumeResult.summary}` : "")
                          : resumeStyle === "flash"
                          ? (Array.isArray(resumeResult) ? resumeResult : [resumeResult]).join("\n")
                          : `${resumeResult.intro || ""}\n\n${(resumeResult.keyPoints || []).map(p => `• ${p.title}: ${p.content}`).join("\n")}\n\n${resumeResult.conclusion || ""}`;
                        navigator.clipboard.writeText(text).then(() => showToast("📋 Copié !"));
                      }} style={{ background: "none", border: "1px solid #8B5CF6", color: "#8B5CF6", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>📋 Copier</button>
                    </div>

                    {/* Rendu Complet */}
                    {resumeStyle === "complet" && resumeResult.intro && (
                      <div>
                        <div style={{ background: isDarkMode ? "#1E3A5F" : "#EFF6FF", borderRadius: 14, padding: "16px 20px", marginBottom: 18, borderLeft: "4px solid #3B82F6" }}>
                          <div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 800, marginBottom: 8 }}>INTRODUCTION</div>
                          <p style={{ color: theme.text, lineHeight: 1.7, margin: 0, fontSize: 14 }}>{resumeResult.intro}</p>
                        </div>
                        {(resumeResult.keyPoints || []).map((kp, i) => (
                          <div key={i} style={{ background: theme.inputBg, borderRadius: 14, padding: "16px 20px", marginBottom: 12, borderLeft: "4px solid #8B5CF6" }}>
                            <div style={{ fontWeight: 800, color: "#8B5CF6", marginBottom: 8, fontSize: 14 }}>📌 {kp.title}</div>
                            <p style={{ color: theme.text, lineHeight: 1.7, margin: 0, fontSize: 14 }}>{kp.content}</p>
                          </div>
                        ))}
                        {resumeResult.conclusion && (
                          <div style={{ background: isDarkMode ? "#14532D" : "#F0FDF4", borderRadius: 14, padding: "16px 20px", marginBottom: 18, borderLeft: "4px solid #10B981" }}>
                            <div style={{ fontSize: 11, color: "#10B981", fontWeight: 800, marginBottom: 8 }}>À RETENIR</div>
                            <p style={{ color: theme.text, lineHeight: 1.7, margin: 0, fontSize: 14 }}>{resumeResult.conclusion}</p>
                          </div>
                        )}
                        {(resumeResult.glossary || []).length > 0 && (
                          <div style={{ background: theme.inputBg, borderRadius: 14, padding: "16px 20px" }}>
                            <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 800, marginBottom: 12 }}>GLOSSAIRE</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {resumeResult.glossary.map((g, i) => (
                                <div key={i} style={{ display: "flex", gap: 12 }}>
                                  <span style={{ fontWeight: 800, color: theme.highlight, minWidth: 120, fontSize: 13 }}>{g.term}</span>
                                  <span style={{ color: theme.textMuted, fontSize: 13 }}>{g.def}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rendu Flash */}
                    {resumeStyle === "flash" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {(Array.isArray(resumeResult) ? resumeResult : resumeResult.points || [resumeResult]).map((point, i) => (
                          <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: theme.inputBg, borderRadius: 12, padding: "14px 16px" }}>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#8B5CF6,#7C3AED)", color: "white", fontWeight: 900, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                            <span style={{ color: theme.text, fontSize: 14, lineHeight: 1.6 }}>{typeof point === "string" ? point : JSON.stringify(point)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Rendu Cornell */}
                    {resumeStyle === "cornell" && resumeResult.rows && (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 2, borderRadius: 12, overflow: "hidden", border: `1px solid ${theme.border}` }}>
                          <div style={{ background: isDarkMode ? "#1E3A5F" : "#EFF6FF", padding: "10px 14px", fontWeight: 800, color: "#3B82F6", fontSize: 12 }}>QUESTIONS CLÉS</div>
                          <div style={{ background: isDarkMode ? "#1E293B" : "#F8FAFF", padding: "10px 14px", fontWeight: 800, color: theme.textMuted, fontSize: 12 }}>RÉPONSES / NOTES</div>
                          {resumeResult.rows.map((row, i) => (
                            <>
                              <div key={`q${i}`} style={{ background: isDarkMode ? "#162032" : "#F0F5FF", padding: "14px", fontSize: 13, fontWeight: 700, color: theme.text, borderTop: `1px solid ${theme.border}` }}>{row.question}</div>
                              <div key={`a${i}`} style={{ background: theme.inputBg, padding: "14px", fontSize: 13, color: theme.text, lineHeight: 1.6, borderTop: `1px solid ${theme.border}` }}>{row.answer}</div>
                            </>
                          ))}
                        </div>
                        {resumeResult.summary && (
                          <div style={{ marginTop: 12, background: isDarkMode ? "#14532D" : "#F0FDF4", borderRadius: 12, padding: "14px 16px", borderLeft: "4px solid #10B981" }}>
                            <div style={{ fontSize: 11, color: "#10B981", fontWeight: 800, marginBottom: 6 }}>SYNTHÈSE GLOBALE</div>
                            <p style={{ color: theme.text, fontSize: 13, margin: 0, lineHeight: 1.7 }}>{resumeResult.summary}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bouton : convertir en fiches */}
                    <button onClick={() => { setLabSubView("pdf"); setPdfExtractedText(resumeText); setPdfFileName("cours_depuis_résumé.txt"); showToast("Contenu transféré ! Configure les fiches."); }} style={{
                      width: "100%", marginTop: 20, padding: "13px", background: theme.inputBg,
                      color: theme.textMuted, border: `1.5px solid ${theme.border}`,
                      borderRadius: 14, fontWeight: 700, cursor: "pointer", fontSize: 14
                    }}>→ Convertir aussi en fiches de révision</button>
                  </div>
                )}
              </div>
            )}

            {/* ── COACH IA ────────────────────────────────────────────── */}
            {labSubView === "coach" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: "28px", border: `1px solid ${theme.border}` }}>
                  <h2 style={{ color: theme.text, fontWeight: 800, marginBottom: 8, fontSize: 20 }}>📅 Coach IA — Planning Personnalisé</h2>
                  <p style={{ color: theme.textMuted, fontSize: 13, marginBottom: 20 }}>Basé sur tes {expressions.length} fiches, {todayReviews.length} révisions dues, et tes examens.</p>
                  <button onClick={generateCoachPlan} disabled={coachLoading} className="btn-glow hov" style={{
                    padding: "15px 32px", background: "linear-gradient(135deg,#059669,#10B981)", color: "white",
                    border: "none", borderRadius: 16, fontWeight: 800, fontSize: 16, cursor: "pointer"
                  }}>
                    {coachLoading ? "⏳ Génération du planning..." : "🤖 Générer mon planning 24h"}
                  </button>
                </div>
                {coachPlan && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", border: `2px solid #10B981` }}>
                    <h3 style={{ color: "#10B981", fontWeight: 800, marginBottom: 20 }}>📅 Ton planning optimisé</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {coachPlan.map((slot, idx) => (
                        <div key={idx} style={{ display: "flex", gap: 16, alignItems: "center", background: theme.inputBg, borderRadius: 12, padding: "14px 18px" }}>
                          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 14, fontWeight: 800, color: "#10B981", minWidth: 52 }}>{slot.time}</div>
                          <div style={{ color: theme.text, fontSize: 14 }}>{slot.activity}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── OUTILS ──────────────────────────────────────────────── */}
            {labSubView === "tools" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Salle d'étude */}
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", border: `1px solid ${theme.border}` }}>
                  <h3 style={{ color: theme.text, fontWeight: 800, marginBottom: 16 }}>👥 Salle d'Étude Collaborative</h3>
                  <button onClick={joinStudyRoom} style={{ padding: "12px 24px", background: "#F97316", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>Rejoindre la salle</button>
                  {studyRoomUsers.length > 0 && (
                    <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {studyRoomUsers.map(u => (
                        <div key={u} style={{ padding: "8px 14px", background: isDarkMode ? "#334155" : "#FFF7ED", borderRadius: 20, fontSize: 13, fontWeight: 700, color: "#F97316" }}>👤 {u}</div>
                      ))}
                    </div>
                  )}
                </div>
                {/* World Boss */}
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", border: `1px solid ${theme.border}` }}>
                  <h3 style={{ color: theme.text, fontWeight: 800, marginBottom: 12 }}>🐉 World Boss RPG</h3>
                  <div style={{ height: 12, background: theme.inputBg, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
                    <div style={{ height: "100%", width: `${worldBossHp}%`, background: `linear-gradient(90deg, #EF4444, #F97316)`, borderRadius: 6, transition: "width 0.5s" }} />
                  </div>
                  <p style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>HP : {worldBossHp}/100 — Révise tes fiches pour attaquer le boss !</p>
                  <button onClick={attackWorldBoss} style={{ padding: "12px 24px", background: "linear-gradient(135deg,#EF4444,#F97316)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>⚔️ Attaquer ({Math.floor(Math.random() * 15) + 5}-20 dégâts)</button>
                </div>
                {/* Prédiction */}
                {predictedScore && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", border: `2px solid #06B6D4`, textAlign: "center" }}>
                    <div style={{ fontSize: 50, fontWeight: 900, color: "#06B6D4" }}>{predictedScore}<span style={{ fontSize: 24 }}>/20</span></div>
                    <div style={{ color: theme.text, fontWeight: 700, marginTop: 8 }}>Note estimée à l'examen</div>
                    <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>Basée sur tes {expressions.length} fiches et leur niveau FSRS moyen</div>
                  </div>
                )}
                <button onClick={predictScore} style={{ padding: "13px 28px", background: "#06B6D4", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>🎯 Calculer ma note estimée</button>
              </div>
            )}
          </div>
        )}

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: theme.cardBg, padding: "24px 32px", borderRadius: 24, marginBottom: 24, boxShadow: "0 4px 15px rgba(0,0,0,0.03)", border: `1px solid ${theme.border}`, flexWrap: "wrap", gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 900, color: theme.text, letterSpacing: "-0.5px", marginBottom: 4 }}>{greeting} El Hadji Malick {hour >= 18 ? "🌙" : "☀️"}</h1>
                <p style={{ fontSize: 15, color: theme.textMuted, fontWeight: 500 }}>
                  {stats.streak > 0 ? `Tu es sur une série de ${stats.streak} jours. Protège ton streak ! 🔥` : "C'est le moment de lancer ton premier streak de la semaine. 🌱"}
                </p>
                <div style={{ marginTop: 15, padding: 12, background: isDarkMode ? "#1E3A8A" : "rgba(59,130,246,0.1)", borderRadius: 8, fontSize: 13, color: isDarkMode ? "#DBEAFE" : "#1D4ED8", border: `1px solid ${theme.highlight}44` }}>
                  <strong>🔮 Graphe Prédictif :</strong> {predictedDaysToMastery > 0 ? `À ce rythme (${avgReviewsPerDay} rév/jour), ton graphe sera maîtrisé dans ~${predictedDaysToMastery} jours.` : "Connaissances actuelles 100% maîtrisées !"}
                </div>
              </div>
              <div style={{ background: theme.inputBg, padding: "12px 16px", borderRadius: 16, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, marginRight: 8 }}>CETTE SEMAINE</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {weeks[11]?.map(date => {
                    const cnt = heatmap[date] || 0;
                    const isToday = date === today();
                    return <div key={date} title={`${date} : ${cnt} rév.`} style={{ width: 16, height: 16, borderRadius: 4, background: cnt > 0 ? "#4F8EF7" : (isDarkMode?"#334155":"#EFF6FF"), border: isToday ? "2px solid #1D4ED8" : "none", opacity: date > today() ? 0.3 : 1 }} />;
                  })}
                </div>
              </div>
            </div>
            <div style={{ background: isDarkMode ? "linear-gradient(135deg, #1E293B, #0F172A)" : "linear-gradient(135deg, #ffffff, #F8FAFF)", padding: "32px", borderRadius: 24, border: `2px solid ${theme.border}`, marginBottom: 32, position: "relative", overflow: "hidden" }} className="card-hov">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#EF4444", animation: "pulse 1.5s infinite" }}></div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: theme.highlight, margin: 0 }}>Mission du jour</h2>
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 24, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 42, fontWeight: 900, color: todayReviews.length > 0 ? theme.text : "#40C080", lineHeight: 1 }}>{todayReviews.length}</div>
                  <div style={{ color: theme.textMuted, fontWeight: 600, marginTop: 4 }}>Fiches à réviser (~{estimatedTime} min)</div>
                  {criticalCards.length > 0 && <div style={{ marginTop: 12, padding: "10px 14px", background: "#FEF2F2", color: "#B91C1C", borderRadius: 10, fontSize: 13, borderLeft: "3px solid #EF4444" }}>⚠️ <strong>Attention :</strong> {criticalCards.length} fiches critiques risquent de repasser au niveau zéro d'ici demain.</div>}
                </div>
                <div style={{ background: isDarkMode ? "#312E81" : "#F5F3FF", border: `1px solid ${isDarkMode?"#4338CA":"#E0E7FF"}`, borderRadius: 16, padding: "16px 20px", minWidth: 160, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#7B5FF5" }}>{newCards.length}</div>
                  <div style={{ color: theme.text, fontSize: 13, fontWeight: 700 }}>Dans l'Inbox</div>
                  <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>Nouvelles fiches non apprises</div>
                </div>
              </div>
              <button className="btn-glow hov" onClick={() => startReview()} disabled={todayReviews.length === 0} style={{ width: "100%", padding: "18px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 16, fontSize: 18, fontWeight: 800, cursor: todayReviews.length===0 ? "default":"pointer", opacity: todayReviews.length === 0 ? 0.5 : 1, marginTop: 24 }}>
                {todayReviews.length > 0 ? "🚀 Lancer le Deep Focus" : "✅ Mission accomplie pour aujourd'hui"}
              </button>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.highlight, marginBottom: 16, marginTop: 32 }}>⚡ État des modules</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {categories.map((cat) => {
                const catExps = expressions.filter((e) => e.category === cat.name);
                const dueCount = catExps.filter((e) => e.nextReview <= today() && e.level < 7).length;
                const mastered = catExps.filter((e) => e.level >= 7).length;
                const pct = catExps.length ? Math.round((mastered / catExps.length) * 100) : 0;
                const daysToExam = cat.examDate ? Math.ceil((new Date(cat.examDate) - new Date()) / 86400000) : null;
                const isUrgent = daysToExam !== null && daysToExam <= 7;
                const catColor = isUrgent ? "#EF4444" : (cat.color || "#1D4ED8");
                return (
                  // ✅ MODIFICATION ICI
                  <div key={cat.name} style={{
                    background: theme.cardBg,
                    borderRadius: 20,
                    padding: "20px",
                    boxShadow: "0 4px 15px rgba(0,0,0,0.03)",
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: theme.border,
                    borderLeftWidth: '6px',
                    borderLeftStyle: 'solid',
                    borderLeftColor: catColor,
                    transition: "all 0.25s"
                  }} className="card-hov">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontWeight: 800, color: theme.text, fontSize: 16, marginBottom: 12 }}>{cat.name}</div>
                      {dueCount > 0 && <span style={{ background: "#FEE2E2", color: "#EF4444", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>{dueCount} dues</span>}
                    </div>
                    {daysToExam !== null && <div style={{ fontSize: 12, fontWeight: 700, color: isUrgent ? "#EF4444" : "#D97706", marginBottom: 8 }}>{daysToExam > 0 ? `⏳ Examen J-${daysToExam}` : daysToExam === 0 ? "🚨 Examen aujourd'hui !" : "Passé"}</div>}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <div style={{ flex: 1, height: 8, background: theme.inputBg, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 4, transition: "width 0.5s ease", width: `${pct}%`, background: pct >= (cat.targetScore || 80) ? "#10B981" : catColor }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: catColor, minWidth: 38 }}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.highlight, marginBottom: 16, marginTop: 32 }}>🤖 Renforcer tes points faibles</h2>
            <div style={{ background: isDarkMode ? "#1E293B" : "linear-gradient(135deg, #F5F3FF, #EFF6FF)", border: `1px solid ${isDarkMode?"#334155":"#E0E7FF"}`, borderRadius: 22, padding: "24px", marginBottom: 32 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <span style={{ fontSize: 32, lineHeight: 1 }}>✨</span>
                <div>
                  <div style={{ fontWeight: 800, color: theme.text, fontSize: 15 }}>Suggestion IA : Concentre-toi sur <span style={{ color: "#7B5FF5" }}>{weakestCat}</span></div>
                  <div style={{ color: theme.textMuted, fontSize: 13 }}>C'est ton module le moins maîtrisé. Génère une nouvelle fiche pour consolider tes bases.</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <select value={addForm.category || weakestCat} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} style={{ flex: "0 0 auto", width: "auto", minWidth: 160, padding: "14px 16px", background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 12, fontSize: 14, color: theme.text, cursor: "pointer" }}>
                  {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !aiLoading && handleAIGenerate()} style={{ flex: 1, padding: "14px 18px", background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 12, fontSize: 14, color: theme.text }} placeholder="Tape un concept que tu as du mal à retenir..." />
                <button className="hov btn-glow" onClick={async () => { if(!addForm.category) setAddForm(f => ({...f, category: weakestCat})); await handleAIGenerate(); setView("add"); }} disabled={aiLoading || !aiPrompt.trim()} style={{ padding: "14px 24px", background: "#7B5FF5", color: "white", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {aiLoading ? <span style={{ animation: "pulse 1s infinite" }}>⏳</span> : "Générer la fiche"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VUE AJOUT / ÉDITION */}
        {view === "add" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, letterSpacing: "-1px" }}>{editingId ? "✏️ Mode Édition" : "⚡ Création de Fiches"}</h1>
                <p style={{ color: theme.textMuted, fontSize: 14, marginTop: 6 }}>{editingId ? "Ajuste ta fiche." : "Crée, génère en rafale, importe ou analyse une image."}</p>
              </div>
              {editingId && <button onClick={cancelEdit} className="hov" style={{ padding: "10px 20px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✕ Annuler</button>}
            </div>
            {!editingId && (
              <div style={{ display: "flex", gap: 8, marginBottom: 24, background: theme.cardBg, padding: 6, borderRadius: 18, border: `1px solid ${theme.border}`, boxShadow: "0 4px 15px rgba(0,0,0,0.04)" }}>
                {[
                  { id: "single", icon: "✦", label: "Fiche unique" },
                  { id: "batch", icon: "🚀", label: "Batch IA" },
                  { id: "text", icon: "📄", label: "Depuis un texte" },
                  { id: "file", icon: "📎", label: "Image & Vision IA" },
                ].map(t => (
                  <button key={t.id} onClick={() => { setAddSubView(t.id); setShowBatchPreview(false); }} className="hov" style={{ flex: 1, padding: "12px 8px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, transition: "all 0.2s", background: addSubView === t.id ? "linear-gradient(135deg, #1D4ED8, #3B82F6)" : "transparent", color: addSubView === t.id ? "white" : theme.textMuted }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            )}
            {/* Blocs single, batch, text, file */}
            {(addSubView === "single" || editingId) && (
              <div style={{ background: "linear-gradient(135deg, #1D4ED8 0%, #7B5FF5 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32, boxShadow: "0 15px 35px rgba(123,95,245,0.2)" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>✨</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Auto-Génération IA</div><div style={{ color: "#DBEAFE", fontSize: 13 }}>Décris un concept, l'IA crée la fiche complète.</div></div></div>
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !aiLoading && handleAIGenerate()} style={{ flex: 1, padding: "16px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white" }} placeholder='Ex: "Interface vs Classe abstraite"...' />
                  <button className="hov btn-glow" onClick={handleAIGenerate} disabled={aiLoading} style={{ padding: "16px 28px", background: "white", color: "#1D4ED8", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer" }}>{aiLoading ? "⏳" : "Générer"}</button>
                </div>
              </div>
            )}
            {addSubView === "batch" && !editingId && (
              <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #1D4ED8 50%, #059669 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>🚀</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Génération en Rafale</div><div style={{ color: "#DBEAFE", fontSize: 13 }}>L'IA génère plusieurs fiches d'un coup.</div></div></div>
                <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                  <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} style={{ flex: 1, minWidth: 200, padding: "16px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white" }} placeholder='Ex: "Annotations Spring Boot"...' />
                  <select value={aiBatchCount} onChange={e => setAiBatchCount(+e.target.value)} style={{ padding: "14px 16px", background: "#1e3a8a", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, color: "white", fontWeight: 700 }}>{[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} fiches</option>)}</select>
                  <button className="hov btn-glow" onClick={handleAIBatchGenerate} disabled={aiBatchLoading || !aiPrompt.trim()} style={{ padding: "16px 28px", background: "white", color: "#1D4ED8", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer" }}>{aiBatchLoading ? "⏳" : `🚀 ×${aiBatchCount}`}</button>
                </div>
                {showBatchPreview && batchPreview.length > 0 && (
                  <div style={{ marginTop: 20, background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: "20px", border: "1px solid rgba(255,255,255,0.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <div style={{ color: "white", fontWeight: 800, fontSize: 14 }}>📋 {batchPreview.length} fiches prêtes</div>
                      <div style={{ display: "flex", gap: 8 }}><button onClick={() => { setBatchPreview([]); setShowBatchPreview(false); }} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", borderRadius: 10, padding: "8px 14px", cursor: "pointer" }}>Annuler</button><button className="hov btn-glow" onClick={confirmBatch} style={{ background: "#10B981", border: "none", color: "white", borderRadius: 10, padding: "8px 18px", fontWeight: 800, cursor: "pointer" }}>✅ Sauvegarder</button></div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 380, overflowY: "auto" }}>
                      {batchPreview.map((card, idx) => (
                        <div key={idx} style={{ background: "white", borderRadius: 14, padding: "16px", display: "flex", gap: 12 }}>
                          <div style={{ flex: 1 }}><div style={{ fontWeight: 800, color: "#1D4ED8", marginBottom: 6 }}>{card.front}</div><div style={{ color: "#4B5563", fontSize: 13 }}>{card.back}</div></div>
                          <button onClick={() => removeBatchCard(idx)} style={{ background: "#FEF2F2", border: "none", borderRadius: 8, padding: "6px 10px", color: "#EF4444", cursor: "pointer" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {addSubView === "text" && !editingId && (
              <div style={{ background: "linear-gradient(135deg, #312E81 0%, #4338CA 50%, #7B5FF5 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>📄</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Génération depuis un Texte</div><div style={{ color: "#DBEAFE", fontSize: 13 }}>Colle un cours, l'IA extrait les concepts.</div></div></div>
                <div style={{ marginTop: 16 }}>
                  <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "12px 16px", background: "#312E81", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "white", fontWeight: 700, width: "100%", marginBottom: 8 }}>{catNames.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <textarea value={aiFromText} onChange={e => setAiFromText(e.target.value)} style={{ width: "100%", padding: "16px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white", minHeight: 140 }} placeholder="Colle ton texte ici..." />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}><span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{aiFromText.length}/3000</span><button className="hov btn-glow" onClick={handleAIFromText} disabled={aiFromTextLoading || !aiFromText.trim()} style={{ padding: "14px 24px", background: "white", color: "#312E81", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>{aiFromTextLoading ? "⏳" : "🔍 Analyser"}</button></div>
                </div>
              </div>
            )}
            {addSubView === "file" && !editingId && (
              <div style={{ background: "linear-gradient(135deg, #064E3B 0%, #059669 50%, #10B981 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>👁️</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>L'Œil de l'IA (Vision)</div><div style={{ color: "#D1FAE5", fontSize: 13 }}>Upload un schéma ou une capture d'écran. L'IA l'analysera pour en faire une fiche.</div></div></div>
                <div style={{ marginTop: 16 }}>
                  <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "12px 16px", background: "#064E3B", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "white", fontWeight: 700, width: "100%", marginBottom: 12 }}>{catNames.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <div style={{ border: "2px dashed rgba(255,255,255,0.4)", borderRadius: 16, padding: "40px 20px", textAlign: "center", background: "rgba(0,0,0,0.1)" }}>
                    {uploadLoading ? <div style={{ color: "white", fontWeight: 700 }}>⏳ Upload vers Storage en cours...</div> : (
                      <>
                        <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} id="file-upload-vision" />
                        <label htmlFor="file-upload-vision" className="hov" style={{ cursor: "pointer", color: "white", fontWeight: 800, fontSize: 16 }}><div style={{ fontSize: 40, marginBottom: 8 }}>📤</div>Clique pour sélectionner une image</label>
                      </>
                    )}
                  </div>
                  {addForm.imageUrl && (
                    <div style={{ marginTop: 20, textAlign: "center" }}>
                      <img src={addForm.imageUrl} alt="upload preview" style={{ maxHeight: 200, borderRadius: 12, marginBottom: 16, border: "2px solid white" }} />
                      <button onClick={handleVisionAI} disabled={aiLoading} className="btn-glow hov" style={{ display: "block", width: "100%", padding: "16px", background: "white", color: "#065F46", border: "none", borderRadius: 12, fontWeight: 900, cursor: "pointer", fontSize: 16 }}>{aiLoading ? "🧠 Analyse complexe en cours..." : "✨ Extraire le concept avec Vision IA"}</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 32, alignItems: "start" }}>
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 24, padding: "32px", boxShadow: "0 10px 40px rgba(0,0,0,0.04)" }}>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8, display: "block" }}>Module de destination</label>
                  <select value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} style={{ width: "100%", padding: "16px 20px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, fontWeight: 600, color: theme.text }}>{catNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>Recto <span style={{ color: "#3B82F6" }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <input autoFocus value={addForm.front} onChange={(e) => setAddForm((f) => ({ ...f, front: e.target.value }))} style={{ width: "100%", padding: "16px 20px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text }} placeholder="Le concept à mémoriser..." />
                    <button onClick={() => listening === "front" ? stopVoice() : startVoice("front")} className={listening === "front" ? "mic-pulse" : "hov"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: theme.cardBg, border: `1px solid ${theme.border}`, cursor: "pointer", fontSize: 20, padding: 8, borderRadius: 12, color: listening === "front" ? "#EF4444" : theme.textMuted }}>🎙️</button>
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><label style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted }}>Verso <span style={{ color: "#3B82F6" }}>*</span></label><button onClick={() => handleMicroAI("back")} disabled={aiLoading} style={{ background: "#F5F3FF", color: "#7B5FF5", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>✨ Expliquer</button></div>
                  <textarea value={addForm.back} onChange={(e) => setAddForm((f) => ({ ...f, back: e.target.value }))} onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); handleAdd(); } }} style={{ width: "100%", padding: "16px 20px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text, minHeight: 110 }} placeholder="L'explication claire..." />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><label style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted }}>Exemple</label><button onClick={() => handleMicroAI("example")} disabled={aiLoading} style={{ background: "#F5F3FF", color: "#7B5FF5", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>💡 Exemple</button></div>
                  <input value={addForm.example} onChange={(e) => setAddForm((f) => ({ ...f, example: e.target.value }))} style={{ width: "100%", padding: "16px 20px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text }} placeholder="Mise en contexte..." />
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="hov btn-glow" onClick={handleAdd} disabled={!addForm.front.trim() || !addForm.back.trim()} style={{ flex: 1, padding: "18px 24px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>{editingId ? "💾 Mettre à jour" : "⚡ Ajouter la fiche"}</button>
                  {!editingId && <button className="hov" onClick={() => setAddForm((f) => ({ ...f, front: "", back: "", example: "", imageUrl: null }))} style={{ padding: "18px 24px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Effacer</button>}
                </div>
              </div>
              <div style={{ position: "sticky", top: 90, display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: theme.textMuted, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace", paddingLeft: 12 }}>LIVE PREVIEW</div>
                <div style={{ background: theme.cardBg, border: `2px dashed ${theme.highlight}55`, borderRadius: 24, padding: "28px", boxShadow: "0 20px 50px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><span style={{ background: theme.inputBg, color: theme.highlight, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{addForm.category || "Catégorie"}</span><span style={{ background: "#F5F3FF", color: "#7C3AED", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Niveau 0</span></div>
                  <div style={{ background: theme.inputBg, borderRadius: 20, padding: "28px", marginBottom: 20, border: `1px solid ${theme.border}` }}><div style={{ fontSize: 11, color: "#60A5FA", fontWeight: 800, letterSpacing: 2, marginBottom: 14 }}>QUESTION</div><div style={{ fontSize: 26, fontWeight: 800, color: addForm.front ? theme.highlight : theme.textMuted }}>{addForm.front || "Tape un concept..."}</div></div>
                  {addForm.imageUrl && <img src={addForm.imageUrl} className="occlusion-img" alt="media" style={{ width: "100%", borderRadius: 16, marginBottom: 20, border: `1px solid ${theme.border}` }} title="L'image sera floutée pendant la révision" />}
                  <div style={{ background: isDarkMode?"#1E293B":"#EFF6FF", border: `2px solid ${isDarkMode?"#334155":"#DBEAFE"}`, borderRadius: 20, padding: "28px" }}><div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 800, letterSpacing: 2, marginBottom: 14 }}>RÉPONSE</div><div style={{ fontSize: 18, fontWeight: 600, color: addForm.back ? theme.text : theme.textMuted }}>{addForm.back || "Tape la réponse..."}</div>{(addForm.example || editingId) && <div style={{ marginTop: 16, padding: "14px 18px", background: theme.cardBg, borderRadius: 12, fontSize: 14, color: theme.textMuted, fontStyle: "italic", borderLeft: "4px solid #3B82F6" }}><span style={{ color: "#4F8EF7", fontSize: 11 }}>// exemple</span><br />{addForm.example || "L'exemple s'affichera ici..."}</div>}</div>
                </div>
                <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 16, padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted }}>📤 Import en masse (CSV)</span><button className="hov" onClick={() => setShowImport(!showImport)} style={{ background: theme.inputBg, color: theme.highlight, border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{showImport ? "Fermer" : "Ouvrir"}</button></div>
                  {showImport && <div style={{ marginTop: 12, animation: "fadeUp 0.3s ease" }}><textarea value={importText} onChange={(e) => setImportText(e.target.value)} style={{ width: "100%", padding: "16px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 12, color: theme.text, minHeight: 80, fontFamily: "JetBrains Mono" }} placeholder="front,back,category,example..." /><button className="hov" onClick={handleImport} style={{ width: "100%", padding: "10px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 12, fontWeight: 700, marginTop: 8, cursor: "pointer" }}>Importer</button></div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LISTE & RECHERCHE SÉMANTIQUE */}
        {view === "list" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 32 }}>
              <div style={{ flex: 1 }}><h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight }}>◈ Le Second Cerveau</h1><p style={{ color: theme.textMuted }}>Explore et visualise tes connaissances.</p></div>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ background: theme.cardBg, padding: "16px 24px", borderRadius: 20, border: `1px solid ${theme.border}`, textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 900, color: theme.highlight }}>{filteredExps.length}</div><div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted }}>Fiches</div></div>
                <div style={{ background: theme.cardBg, padding: "16px 24px", borderRadius: 20, border: `1px solid ${theme.border}`, textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 900, color: "#10B981" }}>{masteredCount}</div><div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted }}>Maîtrisées</div></div>
              </div>
            </div>
            <div style={{ background: theme.cardBg, padding: "16px", borderRadius: 24, border: `1px solid ${theme.border}`, boxShadow: "0 10px 30px rgba(0,0,0,0.05)", marginBottom: 32, position: "sticky", top: 85, zIndex: 50 }}>
              <div style={{ display: "flex", alignItems: "center", background: theme.inputBg, padding: "0 12px", borderRadius: 16, border: `2px solid ${theme.border}`, marginBottom: 16 }}>
                <span style={{ fontSize: 18, color: theme.textMuted }}>🔍</span>
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, padding: "16px 12px", background: "transparent", border: "none", fontSize: 15, color: theme.text }} placeholder="Chercher un concept..." />
                {searchQuery && <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 14, padding: 8 }}>✕</button>}
                <button onClick={handleSemanticSearch} disabled={semanticLoading} className="btn-glow hov" style={{ background: "linear-gradient(135deg, #7B5FF5, #6D28D9)", color: "white", border: "none", padding: "10px 16px", borderRadius: 12, fontWeight: 800, cursor: "pointer", marginLeft: 8 }}>
                  {semanticLoading ? "🧠 Recherche..." : "🧠 IA Sémantique"}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, flex: 1 }}>
                  {["Toutes", ...catNames].map((c) => <button key={c} onClick={() => setFilterCat(c)} className="hov" style={{ padding: "8px 16px", borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: "pointer", background: filterCat === c ? theme.highlight : theme.cardBg, color: filterCat === c ? "white" : theme.textMuted, border: filterCat === c ? `1px solid ${theme.highlight}` : `1px solid ${theme.border}` }}>{c}</button>)}
                </div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {["Tous", "Nouvelles", "En retard", "Maîtrisées"].map((l) => <button key={l} onClick={() => setFilterLevel(l)} className="hov" style={{ padding: "8px 16px", borderRadius: 100, fontSize: 12, cursor: "pointer", border: "none", background: filterLevel === l ? "#F5F3FF" : "transparent", color: filterLevel === l ? "#7B5FF5" : theme.textMuted, fontWeight: filterLevel === l ? 800 : 600 }}>{l}</button>)}
                </div>
              </div>
            </div>
            {filteredExps.length === 0 ? (
              <div style={{ background: theme.cardBg, border: `2px dashed ${theme.border}`, borderRadius: 32, padding: "80px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
                <h3 style={{ color: theme.text, fontSize: 20, fontWeight: 800 }}>Aucune fiche trouvée</h3>
                <p style={{ color: theme.textMuted, marginTop: 8, marginBottom: 24 }}>Élargis ta recherche ou crée un nouveau concept.</p>
                <button onClick={() => setView("add")} className="btn-glow hov" style={{ padding: "14px 28px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>⚡ Créer une fiche</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 24 }}>
                {filteredExps.map((exp) => {
                  const lvl = exp.level || 0;
                  const lvlColor = lvl >= 7 ? "#10B981" : lvl >= 5 ? "#3B82F6" : lvl >= 3 ? "#8B5CF6" : lvl >= 1 ? "#F59E0B" : "#9CA3AF";
                  const catColor = categories.find((c) => c.name === exp.category)?.color || "#3B82F6";
                  return (
                    <div key={exp.id} style={{ background: theme.cardBg, borderRadius: 24, display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", border: `1px solid ${theme.border}`, borderTop: `4px solid ${catColor}`, overflow: "hidden" }} className="card-hov">
                      <div style={{ padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, background: catColor + "22", color: catColor }}>{exp.category}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: lvlColor }} /><span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono'" }}>N{lvl}</span></div>
                      </div>
                      <div style={{ padding: "0 24px", flex: 1 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: theme.highlight, marginBottom: 12, lineHeight: 1.3 }}>{exp.front}</div>
                        {exp.imageUrl && <div style={{ fontSize: 11, background: "#10B98122", color: "#10B981", padding: "4px 8px", borderRadius: 8, display: "inline-block", marginBottom: 12, fontWeight: 700 }}>🖼️ Image attachée</div>}
                        <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.6, marginBottom: 16 }}>{exp.back}</div>
                        {exp.example && <div style={{ background: theme.inputBg, padding: "12px", borderRadius: 12, fontSize: 13, color: theme.textMuted, fontStyle: "italic", borderLeft: "3px solid #3B82F6", marginBottom: 16 }}><span style={{ color: "#3B82F6", fontSize: 10 }}>// exemple</span><br />{exp.example}</div>}
                      </div>
                      <div style={{ padding: "16px 24px", background: theme.inputBg, borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono'" }}>
                          <div>{lvl >= 7 ? "✅ Maîtrisée" : `📅 Rév: ${formatDate(exp.nextReview)}`}</div>
                          <div style={{ fontSize: 10, marginTop: 2 }}>{exp.difficulty !== undefined ? `Diff: ${exp.difficulty} ` : (exp.easeFactor ? `EF: ${exp.easeFactor} ` : "")}{(exp.reviewHistory?.length || 0) > 0 && `• ${exp.reviewHistory.length} Rév.`}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { startEdit(exp); setAiPrompt(exp.front); }} className="hov" style={{ width: 34, height: 34, borderRadius: 10, border: "none", cursor: "pointer", background: "#F5F3FF", color: "#8B5CF6" }} title="Améliorer">✨</button>
                          <button onClick={() => startEdit(exp)} className="hov" style={{ width: 34, height: 34, borderRadius: 10, border: "none", cursor: "pointer", background: "#EFF6FF", color: "#3B82F6" }} title="Éditer">✏️</button>
                          <button onClick={() => deleteExp(exp.id)} className="hov" style={{ width: 34, height: 34, borderRadius: 10, border: "none", cursor: "pointer", background: "#FEF2F2", color: "#EF4444" }} title="Supprimer">🗑️</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* RÉVISION SOCRATIQUE & MNÉMONIQUES */}
        {view === "review" && currentCard && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <button onClick={() => { setView("dashboard"); if (reviewSessionDone > 0) updateStreakAfterSession(reviewSessionDone); }} className="hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Quitter</button>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 15, color: theme.textMuted }}><span style={{ color: theme.highlight, fontWeight: 800 }}>{reviewIndex + 1}</span> / {reviewQueue.length}</div>
            </div>
            <div style={{ height: 8, background: theme.inputBg, borderRadius: 4, marginBottom: 32, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg, #1D4ED8, #3B82F6)", borderRadius: 4, transition: "width 0.4s ease", width: `${(reviewIndex / reviewQueue.length) * 100}%` }} />
            </div>
            <div className="card-hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 26, padding: "32px", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", maxWidth: 700, margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span style={{ background: theme.inputBg, color: theme.highlight, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{currentCard.category}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ background: "#F5F3FF", color: "#7C3AED", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>{currentCard.difficulty !== undefined ? `Diff: ${currentCard.difficulty.toFixed(1)}/10` : `EF: ${(currentCard.easeFactor || 2.5).toFixed(1)}`}</span>
                  <span style={{ background: "#40C08022", color: "#40C080", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>N{currentCard.level}</span>
                </div>
              </div>
              <div style={{ background: isDarkMode?"#0F172A":"#F8FAFF", borderRadius: 20, padding: "28px", marginBottom: 20, border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: 11, color: "#60A5FA", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>QUESTION</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: theme.highlight, lineHeight: 1.35, marginBottom: currentCard.imageUrl ? 20 : 0 }}>{currentCard.front}</div>
                {currentCard.imageUrl && (
                  <img src={currentCard.imageUrl} alt="support visuel" className={!revealed ? "occlusion-img" : ""} style={{ width: "100%", borderRadius: 16, border: `2px solid ${theme.border}` }} title={!revealed ? "Survole l'image pour l'apercevoir" : ""} />
                )}
              </div>
              {!revealed ? (
                <div style={{ marginTop: 24 }}>
                  <textarea style={{ width: "100%", padding: "16px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text, minHeight: 80, marginBottom: 12 }} placeholder="Tape ta réponse ici. L'IA Socratique va l'évaluer..." value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} />
                  {socraticHint && <div style={{ background: "#FFFBEB", borderLeft: "4px solid #F59E0B", padding: 12, borderRadius: 4, marginBottom: 16, color: "#92400E", fontSize: 14 }}><strong style={{ display: "block", marginBottom: 4 }}>🧙‍♂️ Tuteur IA :</strong> {socraticHint}</div>}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button className="hov btn-glow" onClick={handleSemanticEval} disabled={evalLoading || !userAnswer.trim()} style={{ flex: 1, padding: "18px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: (!userAnswer.trim() || evalLoading) ? 0.6 : 1 }}>{evalLoading ? "Analyse..." : "🧠 IA Socratique"}</button>
                    <button className="hov" onClick={handleReveal} style={{ flex: "0 0 auto", padding: "18px", background: "transparent", color: theme.textMuted, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Passer / Voir</button>
                  </div>
                  <div style={{ textAlign: "center", marginTop: 12, color: theme.textMuted, fontSize: 12 }}>⌨️ Espace pour forcer l'affichage</div>
                </div>
              ) : (
                <div style={{ animation: "slideIn 0.3s ease" }}>
                  <div style={{ background: isDarkMode?"#1E293B":"#EFF6FF", border: `2px solid ${isDarkMode?"#334155":"#DBEAFE"}`, borderRadius: 20, padding: "28px", marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>RÉPONSE</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: theme.text, lineHeight: 1.6 }}>{currentCard.back}</div>
                    {currentCard.example && <div style={{ marginTop: 16, padding: "14px 18px", background: theme.cardBg, borderRadius: 12, fontSize: 14, color: theme.textMuted, fontStyle: "italic", borderLeft: "4px solid #3B82F6" }}><span style={{ color: "#4F8EF7", fontSize: 11, fontFamily: "JetBrains Mono" }}>// exemple</span><br />{currentCard.example}</div>}
                  </div>
                  <button className="hov" onClick={generateMnemonic} disabled={mnemonicLoading} style={{ display: "block", width: "100%", padding: "12px", background: "linear-gradient(135deg, #F5F3FF, #EDE9FE)", color: "#7B5FF5", border: "1px solid #DDD6FE", borderRadius: 12, fontWeight: 800, marginBottom: 20, cursor: "pointer" }}>
                    {mnemonicLoading ? "⏳ Création d'une histoire absurde..." : "✨ Générer un Mnémonique Absurde (Ancrage)"}
                  </button>
                  {mnemonicText && (
                    <div style={{ background: "#F5F3FF", borderLeft: "4px solid #7B5FF5", padding: "16px", borderRadius: 12, color: "#4C1D95", marginBottom: 20, fontSize: 14, fontStyle: "italic", lineHeight: 1.6 }}>
                      {mnemonicText}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <button className="hov" onClick={() => handleAnswer(0)} style={{ position: "relative", padding: "16px 8px", background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 16, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>😓 Oublié<br /><span style={{ fontSize: 11, opacity: 0.8 }}>Retour à zéro</span><span style={{ position: "absolute", top: 8, right: 10, fontSize: 10, background: "white", padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)" }}>1</span></button>
                    <button className="hov" onClick={() => handleAnswer(3)} style={{ position: "relative", padding: "16px 8px", background: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A", borderRadius: 16, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>🤔 Hésité<br /><span style={{ fontSize: 11, opacity: 0.8 }}>Intervalle ×EF/2</span><span style={{ position: "absolute", top: 8, right: 10, fontSize: 10, background: "white", padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)" }}>2</span></button>
                    <button className="hov" onClick={() => handleAnswer(5)} style={{ position: "relative", padding: "16px 8px", background: "#D1FAE5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 16, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>⚡ Facile<br /><span style={{ fontSize: 11, opacity: 0.8 }}>FSRS optimisé</span><span style={{ position: "absolute", top: 8, right: 10, fontSize: 10, background: "white", padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)" }}>3</span></button>
                  </div>
                </div>
              )}
            </div>
            {(currentCard.reviewHistory?.length || 0) > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20, justifyContent: "center" }}>
                <span style={{ color: theme.textMuted, fontSize: 12, fontFamily: "JetBrains Mono" }}>Historique: </span>
                {currentCard.reviewHistory.slice(-7).map((h, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: h.q === 0 ? "#F04040" : h.q === 3 ? "#F0A040" : "#40C080" }} title={`${h.date} — ${h.q === 0 ? "Oublié" : h.q === 3 ? "Hésité" : "Facile"}`} />)}
              </div>
            )}
          </div>
        )}

        {/* MODE EXAMEN */}
        {view === "exam" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            {examSubView === "home" && (
              <div>
                <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #1D4ED8 60%, #7B5FF5 100%)", borderRadius: 28, padding: "40px 36px", marginBottom: 32, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -30, right: -30, fontSize: 180, opacity: 0.05 }}>🎯</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#93C5FD", letterSpacing: 3, marginBottom: 8, fontFamily: "JetBrains Mono" }}>CENTRE D'EXAMENS</div>
                  <h1 style={{ fontSize: 34, fontWeight: 900, color: "white", marginBottom: 10 }}>Prouve ta maîtrise 🏆</h1>
                  <p style={{ color: "#93C5FD", fontSize: 15, marginBottom: 28, maxWidth: 520, lineHeight: 1.6 }}>Affronte tes propres connaissances. La difficulté forge les champions.</p>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 20px", color: "white", fontSize: 13, fontWeight: 700, border: "1px solid rgba(255,255,255,0.15)" }}>🎯 {stats.examsDone} examens passés</div>
                    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 20px", color: "white", fontSize: 13, fontWeight: 700, border: "1px solid rgba(255,255,255,0.15)" }}>📚 {expressions.length} fiches disponibles</div>
                  </div>
                </div>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: theme.highlight, marginBottom: 16, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>CHOISIR UN MODE</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 36 }}>
                  {[
                    { mode: "flashcard", icon: "🃏", title: "Classique", sub: "Auto-évaluation", desc: "Questions recto/verso avec un timer généreux.", color: "#1D4ED8", bg: "linear-gradient(135deg,#EFF6FF,#DBEAFE)", border: "#BFDBFE" },
                    { mode: "qcm", icon: "📝", title: "QCM IA", sub: "L'IA te piège", desc: "L'IA génère 3 fausses réponses ultra-crédibles.", color: "#7B5FF5", bg: "linear-gradient(135deg,#F5F3FF,#EDE9FE)", border: "#DDD6FE" },
                    { mode: "speedrun", icon: "⚡", title: "Speedrun", sub: "5s par question", desc: "Test de réflexes absolu. Pas le temps de réfléchir.", color: "#F59E0B", bg: "linear-gradient(135deg,#FEF3C7,#FDE68A)", border: "#FCD34D" },
                    { mode: "boss", icon: "💀", title: "Boss Fight", sub: "Sanction extrême", desc: "Simule tes profs. Si tu échoues, tes fiches sont rétrogradées.", color: "#EF4444", bg: "linear-gradient(135deg,#FEE2E2,#FECACA)", border: "#FCA5A5" },
                    { mode: "custom", icon: "🛠️", title: "Examens Perso", sub: "Tes propres règles", desc: "Crée et passe tes propres devoirs surveillés.", color: "#059669", bg: "linear-gradient(135deg,#ECFDF5,#D1FAE5)", border: "#A7F3D0" },
                  ].map(m => (
                    <div key={m.mode} onClick={() => { if (m.mode === "custom") setExamSubView("custom"); else { setExamConfig(c => ({...c, mode: m.mode})); setExamSubView("config"); } }} className="card-hov" style={{ background: m.bg, border: `2px solid ${m.border}`, borderRadius: 24, padding: "28px", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>{m.icon}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: m.color, letterSpacing: 2, marginBottom: 4, fontFamily: "JetBrains Mono" }}>{m.sub}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#1F2937", marginBottom: 8 }}>{m.title}</div>
                      <div style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {examSubView === "config" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <button onClick={() => setExamSubView("home")} className="hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontWeight: 600 }}>← Retour</button>
                  <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, margin: 0 }}>{examConfig.mode === "qcm" ? "📝 Configuration QCM" : examConfig.mode === "speedrun" ? "⚡ Configuration Speedrun" : examConfig.mode === "boss" ? "💀 Configuration Boss Fight" : "🃏 Configuration Classique"}</h1>
                </div>
                <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 24, padding: "32px", boxShadow: "0 4px 15px rgba(0,0,0,0.03)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginBottom: 24 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>📚 Module</label>
                      <select value={examConfig.category} onChange={(e) => setExamConfig((c) => ({ ...c, category: e.target.value }))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text, cursor: "pointer" }}><option value="Toutes">Toutes les matières</option>{catNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>🔢 Nombre de questions</label>
                      <input type="number" min={3} max={50} value={examConfig.count} onChange={(e) => setExamConfig((c) => ({ ...c, count: +e.target.value }))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>⏱️ Temps (sec)</label>
                      <input type="number" min={examConfig.mode === "speedrun" ? 3 : 10} max={examConfig.mode === "speedrun" ? 10 : 300} value={examConfig.mode === "speedrun" && examConfig.timePerCard > 10 ? 5 : examConfig.timePerCard} onChange={(e) => setExamConfig((c) => ({ ...c, timePerCard: +e.target.value }))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }} disabled={examConfig.mode === "speedrun"} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>🔥 Difficulté</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
                      {[
                        { val: "facile", icon: "😌", label: "Facile", color: "#10B981" },
                        { val: "adaptative", icon: "🎯", label: "Adaptative", color: "#3B82F6" },
                        { val: "difficile", icon: "💪", label: "Difficile", color: "#F59E0B" },
                        { val: "extreme", icon: "💀", label: "EXTRÊME", color: "#EF4444" },
                      ].map(d => (
                        <div key={d.val} onClick={() => setExamConfig(c => ({...c, difficulty: d.val}))} style={{ border: `2px solid ${examConfig.difficulty === d.val ? d.color : theme.border}`, borderRadius: 16, padding: "14px", cursor: "pointer", background: examConfig.difficulty === d.val ? d.color + "15" : theme.inputBg, textAlign: "center" }}>
                          <div style={{ fontSize: 22, marginBottom: 4 }}>{d.icon}</div><div style={{ fontWeight: 800, fontSize: 13, color: examConfig.difficulty === d.val ? d.color : theme.text }}>{d.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button className="hov btn-glow" onClick={() => startExam()} style={{ width: "100%", padding: "18px 36px", background: examConfig.mode === "boss" ? "linear-gradient(135deg, #EF4444, #B91C1C)" : "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>🚀 Lancer l'examen</button>
                </div>
              </div>
            )}

            {examSubView === "active" && examActive && examQueue[examIndex] && (() => {
              const card = examQueue[examIndex];
              const isQcmMode = examConfig.mode === "qcm" || (card.isCustom && card.isQcm);
              const timerDanger = examTimer <= (examConfig.mode === "speedrun" ? 3 : 10);
              return (
                <div style={{ animation: "fadeUp 0.4s ease" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                    <button onClick={() => { clearInterval(examTimerRef.current); setExamActive(false); setExamSubView("home"); }} className="hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontWeight: 600 }}>✕ Abandonner</button>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {examStreak >= 3 && <div style={{ background: "#FEF3C7", color: "#92400E", padding: "6px 12px", borderRadius: 10, fontSize: 12, fontWeight: 800, animation: "pulse 1s infinite" }}>🔥 Streak ×{examStreak}</div>}
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 15, color: theme.textMuted }}><span style={{ color: theme.highlight, fontWeight: 800 }}>{examIndex + 1}</span> / {examQueue.length}</div>
                      <div style={{ padding: "6px 14px", borderRadius: 10, fontFamily: "JetBrains Mono", fontWeight: 900, fontSize: 14, background: timerDanger ? "#FEE2E2" : "#EFF6FF", color: timerDanger ? "#EF4444" : "#1D4ED8", animation: examTimer <= 5 ? "pulse 0.5s infinite" : "none" }}>⏱ {examTimer}s</div>
                    </div>
                  </div>
                  <div style={{ height: 4, background: theme.inputBg, borderRadius: 4, marginBottom: 28 }}><div style={{ height: "100%", background: "linear-gradient(90deg,#10B981,#3B82F6)", borderRadius: 4, transition: "width 0.4s", width: `${((examIndex) / examQueue.length) * 100}%` }} /></div>
                  <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 26, padding: "32px", maxWidth: 720, margin: "0 auto", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <span style={{ background: theme.inputBg, color: theme.highlight, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{card.category || "Perso"}</span>
                      {isQcmMode && <span style={{ background: "#F5F3FF", color: "#7B5FF5", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>📝 QCM</span>}
                      {examConfig.mode === "boss" && <span style={{ background: "#FEF2F2", color: "#EF4444", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>💀 BOSS</span>}
                    </div>
                    <div style={{ background: theme.inputBg, borderRadius: 20, padding: "28px", marginBottom: 20, border: `1px solid ${theme.border}` }}><div style={{ fontSize: 11, color: "#60A5FA", fontWeight: 800, letterSpacing: 2, marginBottom: 14 }}>QUESTION</div><div style={{ fontSize: 26, fontWeight: 800, color: theme.highlight }}>{card.front || card.question}</div></div>
                    {isQcmMode ? (
                      qcmLoading ? <div style={{ textAlign: "center", padding: "28px", color: "#7B5FF5" }}><div style={{ fontSize: 28, animation: "pulse 1s infinite" }}>🤖</div><div style={{ fontWeight: 700 }}>L'IA prépare les pièges...</div></div>
                      : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {qcmChoices.map((choice, ci) => {
                            const isCorrect = choice === (card.back || card.answer);
                            const isSelected = qcmSelected === ci;
                            let bg = theme.inputBg, border = `2px solid ${theme.border}`, color = theme.text;
                            if (isSelected && isCorrect) { bg = "#D1FAE5"; border = "2px solid #10B981"; color = "#065F46"; }
                            else if (isSelected && !isCorrect) { bg = "#FEE2E2"; border = "2px solid #EF4444"; color = "#991B1B"; }
                            else if (qcmSelected !== null && isCorrect) { bg = "#D1FAE5"; border = "2px solid #10B981"; color = "#065F46"; }
                            return (
                              <button key={ci} onClick={() => { if (qcmSelected !== null) return; setQcmSelected(ci); setTimeout(() => handleExamAnswer(isCorrect ? 5 : 0), 900); }} disabled={qcmSelected !== null} style={{ background: bg, border, borderRadius: 14, padding: "16px 20px", textAlign: "left", cursor: qcmSelected !== null ? "default" : "pointer", color, fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ width: 28, height: 28, borderRadius: "50%", background: isSelected ? (isCorrect ? "#10B981" : "#EF4444") : (qcmSelected !== null && isCorrect ? "#10B981" : (isDarkMode?"#334155":"#EFF6FF")), color: (isSelected || (qcmSelected !== null && isCorrect)) ? "white" : theme.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{String.fromCharCode(65 + ci)}</span>
                                {choice} {qcmSelected !== null && isCorrect && <span style={{ marginLeft: "auto" }}>✅</span>} {isSelected && !isCorrect && <span style={{ marginLeft: "auto" }}>❌</span>}
                              </button>
                            );
                          })}
                        </div>
                    ) : (
                      !examRevealed ? <button className="hov btn-glow" onClick={() => setExamRevealed(true)} style={{ width: "100%", padding: "18px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>👁️ Voir la réponse (Espace)</button>
                      : <div style={{ animation: "slideIn 0.3s ease" }}>
                          <div style={{ background: isDarkMode?"#1E293B":"#EFF6FF", border: `2px solid ${isDarkMode?"#334155":"#DBEAFE"}`, borderRadius: 20, padding: "28px", marginBottom: 20 }}><div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 800, letterSpacing: 2, marginBottom: 14 }}>RÉPONSE</div><div style={{ fontSize: 18, fontWeight: 600, color: theme.text }}>{card.back || card.answer}</div></div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                            <button className="hov" onClick={() => handleExamAnswer(0)} style={{ padding: "16px 8px", background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>😓 Pas su (1)</button>
                            <button className="hov" onClick={() => handleExamAnswer(3)} style={{ padding: "16px 8px", background: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A", borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>🤔 Hésité (2)</button>
                            <button className="hov" onClick={() => handleExamAnswer(5)} style={{ padding: "16px 8px", background: "#D1FAE5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>⚡ Su ! (3)</button>
                          </div>
                        </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {examSubView === "results" && examAnswers.length > 0 && (() => {
              const correct = examAnswers.filter(a => a.q >= 3).length;
              const score = Math.round((correct / examAnswers.length) * 100);
              const duration = examStartTime ? Math.round((Date.now() - examStartTime) / 1000) : 0;
              const grade = score >= 90 ? { label: "LÉGENDAIRE", icon: "🏆", color: "#7B5FF5" } : score >= 70 ? { label: "BIEN", icon: "👍", color: "#3B82F6" } : { label: "À RETRAVAILLER", icon: "💪", color: "#EF4444" };
              const bossPenalty = examConfig.mode === "boss" && score < 100;
              return (
                <div style={{ animation: "fadeUp 0.4s ease" }}>
                  <div style={{ background: bossPenalty ? "linear-gradient(135deg, #FEF2F2, #FECACA)" : `linear-gradient(135deg, ${grade.color}22, ${grade.color}08)`, border: `2px solid ${bossPenalty ? "#EF4444" : grade.color}44`, borderRadius: 28, padding: "40px 32px", marginBottom: 28, textAlign: "center" }}>
                    <div style={{ fontSize: 80, marginBottom: 8 }}>{bossPenalty ? "💀" : grade.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: bossPenalty ? "#EF4444" : grade.color, letterSpacing: 3, marginBottom: 8 }}>{bossPenalty ? "ÉCHEC FACE AU BOSS" : grade.label}</div>
                    <div style={{ fontSize: 80, fontWeight: 900, color: bossPenalty ? "#EF4444" : grade.color, lineHeight: 1 }}>{score}%</div>
                    {bossPenalty && <div style={{ color: "#991B1B", fontWeight: 700, marginTop: 10 }}>Pénalité: Tes fiches de ce module perdent de la maîtrise.</div>}
                    <div style={{ fontSize: 14, color: theme.textMuted, marginTop: 10 }}>{correct} / {examAnswers.length} correctes · Temps: {Math.floor(duration/60)}m{duration%60}s</div>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button className="hov btn-glow" onClick={() => { setExamAnswers([]); setExamQueue([]); setExamSubView("config"); }} style={{ flex: 1, padding: "16px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer" }}>🔄 Recommencer</button>
                    <button className="hov" onClick={() => { setExamAnswers([]); setExamQueue([]); setExamSubView("home"); }} style={{ flex: 1, padding: "16px", background: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>🏠 Accueil Examens</button>
                  </div>
                </div>
              );
            })()}

            {examSubView === "custom" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}><button onClick={() => setExamSubView("home")} className="hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontWeight: 600 }}>← Retour</button><button onClick={() => { setNewCustomExam({ title: "", description: "", questions: [] }); setExamSubView("createCustom"); }} style={{ padding: "10px 20px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer" }}>+ Créer</button></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
                  {customExams.map(exam => (
                    <div key={exam.id} style={{ background: theme.cardBg, padding: 24, borderRadius: 20, border: `1px solid ${theme.border}`, borderTop: "4px solid #7B5FF5" }}>
                      <div style={{ fontWeight: 900, color: theme.text, fontSize: 18, marginBottom: 6 }}>{exam.title}</div><div style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>{exam.description}</div><div style={{ fontSize: 12, color: "#7B5FF5", fontWeight: 700, marginBottom: 16 }}>{exam.questions.length} questions</div>
                      <div style={{ display: "flex", gap: 8 }}><button onClick={() => startExam(exam)} style={{ flex: 1, padding: "10px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>🚀 Passer</button><button onClick={() => setCustomExams(p => p.filter(e => e.id !== exam.id))} style={{ padding: "10px 14px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 10, cursor: "pointer" }}>🗑️</button></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {examSubView === "createCustom" && (
              <div>
                <button onClick={() => setExamSubView("custom")} className="hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontWeight: 600, marginBottom: 20 }}>← Retour</button>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div>
                    <div style={{ background: theme.cardBg, padding: 24, borderRadius: 20, border: `1px solid ${theme.border}`, marginBottom: 20 }}>
                      <input value={newCustomExam.title} onChange={e => setNewCustomExam(ex => ({...ex, title: e.target.value}))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text, marginBottom: 12 }} placeholder="Titre de l'examen" />
                      <input value={newCustomExam.description} onChange={e => setNewCustomExam(ex => ({...ex, description: e.target.value}))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }} placeholder="Description (optionnel)" />
                    </div>
                    <div style={{ background: theme.cardBg, padding: 24, borderRadius: 20, border: `1px solid ${theme.border}` }}>
                      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                        <button onClick={() => setCustomExamEditQ(q => ({...q, isQcm: false}))} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: !customExamEditQ.isQcm ? "#7B5FF5" : theme.inputBg, color: !customExamEditQ.isQcm ? "white" : theme.textMuted, fontWeight: 700, cursor: "pointer" }}>🃏 Flashcard</button>
                        <button onClick={() => setCustomExamEditQ(q => ({...q, isQcm: true}))} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: customExamEditQ.isQcm ? "#7B5FF5" : theme.inputBg, color: customExamEditQ.isQcm ? "white" : theme.textMuted, fontWeight: 700, cursor: "pointer" }}>📝 QCM</button>
                      </div>
                      <input value={customExamEditQ.question} onChange={e => setCustomExamEditQ(q => ({...q, question: e.target.value}))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text, marginBottom: 12 }} placeholder="Question" />
                      <input value={customExamEditQ.answer} onChange={e => setCustomExamEditQ(q => ({...q, answer: e.target.value}))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text, marginBottom: customExamEditQ.isQcm ? 12 : 20 }} placeholder="Réponse correcte" />
                      {customExamEditQ.isQcm && customExamEditQ.choices.slice(0,3).map((ch, ci) => <input key={ci} value={ch} onChange={e => { const c = [...customExamEditQ.choices]; c[ci] = e.target.value; setCustomExamEditQ(q => ({...q, choices: c})); }} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text, marginBottom: 8 }} placeholder={`Fausse réponse ${ci+1}`} />)}
                      <button onClick={() => { if (!customExamEditQ.question || !customExamEditQ.answer) return; setNewCustomExam(ex => ({...ex, questions: [...ex.questions, { id: Date.now().toString(), question: customExamEditQ.question, answer: customExamEditQ.answer, isQcm: customExamEditQ.isQcm, choices: customExamEditQ.isQcm ? [...customExamEditQ.choices.slice(0,3), customExamEditQ.answer] : [] }]})); setCustomExamEditQ({ question: "", answer: "", choices: ["","","",""], isQcm: customExamEditQ.isQcm }); showToast("Question ajoutée"); }} style={{ width: "100%", padding: "14px", background: "#10B981", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", marginTop: 12 }}>+ Ajouter la question</button>
                    </div>
                    <button onClick={() => { if (!newCustomExam.title || newCustomExam.questions.length === 0) return; setCustomExams(p => [...p, { ...newCustomExam, id: Date.now().toString(), createdAt: today() }]); setExamSubView("custom"); showToast("Examen sauvegardé !"); }} style={{ width: "100%", padding: "16px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", marginTop: 20 }}>💾 Sauvegarder l'examen</button>
                  </div>
                  <div style={{ background: theme.cardBg, padding: 24, borderRadius: 20, border: `1px solid ${theme.border}`, maxHeight: 600, overflowY: "auto" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, marginBottom: 16 }}>APERÇU ({newCustomExam.questions.length} questions)</div>
                    {newCustomExam.questions.map((q, i) => (
                      <div key={q.id} style={{ background: theme.inputBg, padding: 14, borderRadius: 12, marginBottom: 10, borderLeft: `4px solid ${q.isQcm ? "#7B5FF5" : "#3B82F6"}` }}><div style={{ fontSize: 11, color: q.isQcm ? "#7B5FF5" : "#3B82F6", fontWeight: 800, marginBottom: 4 }}>{q.isQcm ? "QCM" : "FLASHCARD"}</div><div style={{ fontWeight: 700, color: theme.text }}>{q.question}</div><div style={{ color: "#10B981", fontSize: 12 }}>✓ {q.answer}</div></div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI ENGLISH PRACTICE */}
        {view === "practice" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #065F46 60%, #059669 100%)", borderRadius: 28, padding: "36px", marginBottom: 28, position: "relative", overflow: "hidden", boxShadow: "0 10px 40px rgba(5,150,105,0.2)" }}>
              <div style={{ position: "absolute", top: -20, right: -20, fontSize: 160, opacity: 0.06 }}>🗣️</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#6EE7B7", letterSpacing: 3, marginBottom: 8, fontFamily: "JetBrains Mono" }}>AI CONVERSATION PARTNER</div>
              <h1 style={{ fontSize: 30, fontWeight: 900, color: "white", marginBottom: 8 }}>English Practice Room 🇬🇧</h1>
              <p style={{ color: "#A7F3D0", fontSize: 14, marginBottom: 20 }}>Speak or type in English. Choose a Persona to force yourself to adapt to different accents.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 11, color: "#6EE7B7", fontWeight: 700 }}>TOPIC</span><select value={practiceTopic} onChange={e => setPracticeTopic(e.target.value)} style={{ padding: "10px 14px", background: "#064E3B", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer", minWidth: 160 }}>{["Free conversation", "Job interview", "Technology & AI", "Daily life in Senegal", "Programming & coding"].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 11, color: "#6EE7B7", fontWeight: 700 }}>LEVEL</span><select value={practiceLevel} onChange={e => setPracticeLevel(e.target.value)} style={{ padding: "10px 14px", background: "#064E3B", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer" }}><option value="beginner">🟢 Beginner</option><option value="intermediate">🟡 Intermediate</option><option value="advanced">🔴 Advanced</option></select></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 11, color: "#6EE7B7", fontWeight: 700 }}>PERSONA</span><select value={practicePersona} onChange={e => setPracticePersona(e.target.value)} style={{ padding: "10px 14px", background: "#064E3B", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer" }}><option value="Standard">👨‍🏫 Standard</option><option value="MMA">🥊 MMA Fighter</option><option value="Recruteur">💼 Tech Recruiter</option></select></div>
                <button onClick={resetPracticeChat} className="hov" style={{ padding: "10px 18px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer" }}>🔄 New Session</button>
              </div>
            </div>
            <div style={{ background: theme.cardBg, border: `1px solid ${isDarkMode?"#334155":"#D1FAE5"}`, borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column", height: 480 }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
                {practiceMessages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-end" }}>
                    {msg.role === "assistant" && <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#059669,#10B981)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>}
                    <div style={{ maxWidth: "75%", padding: "14px 18px", borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px", background: msg.role === "user" ? "linear-gradient(135deg, #1D4ED8, #3B82F6)" : (isDarkMode?"#334155":"#F0FDF4"), color: msg.role === "user" ? "white" : theme.text, fontSize: 15, lineHeight: 1.6, border: msg.role === "assistant" && !isDarkMode ? "1px solid #D1FAE5" : "none" }}>
                      {msg.text}
                      {msg.role === "assistant" && <button onClick={() => speakText(msg.text)} style={{ display: "block", marginTop: 8, background: "none", border: "none", color: "#059669", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: 0 }}>🔊 Listen again</button>}
                    </div>
                    {msg.role === "user" && <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#1D4ED8,#7B5FF5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>😊</div>}
                  </div>
                ))}
                {practiceLoading && <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#059669,#10B981)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div><div style={{ background: isDarkMode?"#334155":"#F0FDF4", borderRadius: "20px 20px 20px 4px", padding: "14px 18px", display: "flex", gap: 6 }}>{[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", animation: `pulse 1.2s ${i*0.2}s infinite` }} />)}</div></div>}
                <div ref={practiceEndRef} />
              </div>
              <div style={{ padding: "16px 20px", borderTop: `1px solid ${isDarkMode?"#334155":"#D1FAE5"}`, background: isDarkMode?"#1E293B":"#F0FDF4", display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={togglePracticeMic} style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0, background: practiceListening ? "linear-gradient(135deg, #EF4444, #F97316)" : "linear-gradient(135deg, #059669, #10B981)", border: "none", cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", animation: practiceListening ? "pulse 0.8s infinite" : "none" }}>{practiceListening ? "⏹️" : "🎙️"}</button>
                <input value={practiceInput} onChange={e => setPracticeInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPracticeMessage(practiceInput); } }} placeholder={practiceListening ? "🎙️ Listening... click ⏹️ when finished!" : "Type in English or use mic..."} style={{ flex: 1, padding: "14px 18px", background: theme.inputBg, border: `2px solid ${isDarkMode?"#334155":"#D1FAE5"}`, borderRadius: 14, fontSize: 15, color: theme.text }} disabled={practiceListening || practiceInput.includes("⏳")} />
                <button onClick={() => sendPracticeMessage(practiceInput)} disabled={!practiceInput.trim() || practiceLoading || practiceListening} style={{ width: 52, height: 52, borderRadius: 16, background: practiceInput.trim() ? "linear-gradient(135deg,#1D4ED8,#3B82F6)" : theme.inputBg, border: "none", cursor: practiceInput.trim() ? "pointer" : "default", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{practiceLoading ? "⏳" : "➤"}</button>
              </div>
            </div>
          </div>
        )}

        {/* STATS */}
        {view === "stats" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, marginBottom: 8 }}>▣ Statistiques FSRS</h1>
            <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 22, padding: "24px", marginBottom: 32, boxShadow: "0 4px 15px rgba(0,0,0,0.03)" }}>
              <h2 style={{ fontSize: 16, color: theme.text, marginBottom: 16 }}>📊 Distribution des niveaux (0 à 7)</h2>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 220 }}>
                {[...Array(8)].map((_, lvl) => {
                  const cnt = expressions.filter((e) => e.level === lvl).length;
                  const max = Math.max(...[...Array(8)].map((_, i) => expressions.filter((e) => e.level === i).length), 1);
                  const colors = ["#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E", "#3B82F6", "#8B5CF6"];
                  return (
                    <div key={lvl} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                      <div style={{ fontSize: 11, color: colors[lvl], fontWeight: 700, marginBottom: 4 }}>{cnt}</div>
                      <div style={{ width: "100%", minWidth: 24, borderRadius: "6px 6px 0 0", background: colors[lvl], height: `${Math.max(4, (cnt / max) * 120)}px` }} />
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>N{lvl}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
              {[
                { icon: "🔁", val: stats.totalReviews, label: "Révisions totales", color: "#3B82F6" },
                { icon: "🤖", val: stats.aiGenerated, label: "Fiches IA", color: "#8B5CF6" },
                { icon: "🎯", val: stats.examsDone, label: "Examens blancs", color: "#F59E0B" },
                { icon: "📅", val: sessions.length, label: "Jours actifs", color: "#10B981" },
              ].map((stat, i) => (
                <div key={i} style={{ background: theme.cardBg, borderRadius: 20, padding: "24px 16px", textAlign: "center", border: `1px solid ${theme.border}`, borderTop: `3px solid ${stat.color}` }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>{stat.icon}</div><div style={{ fontSize: 38, fontWeight: 900, color: stat.color }}>{stat.val}</div><div style={{ fontSize: 13, color: theme.textMuted, marginTop: 8, fontWeight: 600 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BADGES */}
        {view === "badges" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, marginBottom: 8 }}>🏆 Badges</h1>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginTop: 24 }}>
              {BADGES.map((badge) => {
                const unlocked = unlockedBadges.includes(badge.id);
                return (
                  <div key={badge.id} style={{ background: theme.cardBg, border: `1px solid ${unlocked?"#3B82F655":theme.border}`, borderRadius: 22, padding: "28px", textAlign: "center", opacity: unlocked ? 1 : 0.4 }}>
                    <div style={{ fontSize: 40, marginBottom: 10, filter: unlocked ? "none" : "grayscale(1)" }}>{badge.icon}</div>
                    <div style={{ fontWeight: 700, color: unlocked ? theme.text : theme.textMuted, fontSize: 14 }}>{badge.label}</div>
                    <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>{badge.desc}</div>
                    {unlocked && <div style={{ marginTop: 10, color: "#10B981", fontSize: 11, fontWeight: 800 }}>✓ DÉBLOQUÉ</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CATEGORIES */}
        {view === "categories" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, marginBottom: 24 }}>◉ Modules</h1>
            <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 24, padding: "32px", marginBottom: 32 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input value={newCat.name} onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))} style={{ padding: 14, background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }} placeholder="Nom du module" />
                <input type="date" value={newCat.examDate} onChange={(e) => setNewCat((c) => ({ ...c, examDate: e.target.value }))} style={{ padding: 14, background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }} />
              </div>
              <button onClick={handleAddCat} className="btn-glow hov" style={{ width: "100%", padding: 16, background: "#1D4ED8", color: "white", border: "none", borderRadius: 12, fontWeight: 800, marginTop: 16, cursor: "pointer" }}>Créer le module</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
              {categories.map((cat) => (
                <div key={cat.name} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 22, padding: "26px", borderTop: `3px solid ${cat.color || "#3B82F6"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><span style={{ fontWeight: 900, color: theme.text, fontSize: 18 }}>{cat.name}</span><button onClick={() => { if (window.confirm(`Supprimer "${cat.name}" ?`)) deleteCategory(cat.name); }} style={{ background: "#FEF2F2", border: "none", padding: "6px 10px", borderRadius: 8, color: "#EF4444", cursor: "pointer" }}>🗑️</button></div>
                  <div style={{ color: theme.textMuted, fontSize: 13 }}>{expressions.filter((e) => e.category === cat.name).length} fiches</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
      <footer style={{ textAlign: "center", padding: "24px", color: theme.textMuted, fontSize: 12, borderTop: `1px solid ${theme.border}`, fontFamily: "JetBrains Mono, monospace" }}>
        MémoMaître God Level Edition v5 · FSRS v5 + IA + Voice + Exam Mode · {new Date().getFullYear()} · Dakar 🇸🇳
      </footer>
    </div>
  );
}