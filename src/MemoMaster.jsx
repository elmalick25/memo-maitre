import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// ══════════════════════════════════════════════════════════════════════════════
// FIREBASE — CONFIG
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

// Init Firebase (évite la double initialisation en hot-reload Vite)
const firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

// Storage hybride : Firestore en priorité, localStorage en fallback silencieux
const storage = {
  async get(key) {
    try {
      const snap = await getDoc(doc(db, "users", FB_USER, "data", key));
      if (snap.exists()) return snap.data().value !== undefined ? snap.data().value : null;
      return null;
    } catch {
      // Fallback localStorage si Firestore échoue
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
      // Fallback localStorage
      try { localStorage.setItem("memomaitre_" + key, JSON.stringify(val)); } catch {}
    }
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// ALGORITHME SM-2 (SuperMemo-2 fidèle + extensions)
// q: 0=oublié, 3=hésité, 5=facile
// ══════════════════════════════════════════════════════════════════════════════
function sm2(card, q) {
  let { easeFactor = 2.5, interval = 1, repetitions = 0 } = card;
  if (q >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions++;
  } else {
    repetitions = 0;
    interval = 1;
  }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const nextReview = addDays(today(), interval);
  return { easeFactor: +easeFactor.toFixed(2), interval, repetitions, nextReview };
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS DATE
// ══════════════════════════════════════════════════════════════════════════════
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};
const today = () => new Date().toISOString().split("T")[0];
const formatDate = (d) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

// ══════════════════════════════════════════════════════════════════════════════
// BADGES SYSTÈME
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

// ══════════════════════════════════════════════════════════════════════════════
// CATÉGORIES PAR DÉFAUT
// ══════════════════════════════════════════════════════════════════════════════
const CATEGORIES_DEFAULT = [
  { name: "🇬🇧 Anglais", examDate: "", targetScore: 90, priority: "haute", color: "#4F8EF7" },
  { name: "☕ Java / Spring Boot", examDate: "", targetScore: 85, priority: "haute", color: "#F0A040" },
  { name: "🖥️ Informatique Générale", examDate: "", targetScore: 80, priority: "normale", color: "#40C080" },
];

// storage hybride défini plus haut (Firebase + localStorage fallback)

// ══════════════════════════════════════════════════════════════════════════════
// API GROQ — Ultra-rapide, quota généreux (14 400 req/jour gratuit)
// Modèle : llama-3.3-70b-versatile (intelligent) ou llama3-8b-8192 (rapide)
// ══════════════════════════════════════════════════════════════════════════════
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL   = "llama-3.3-70b-versatile";

async function callClaude(systemPrompt, userMessage, retries = 2) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          max_tokens: 1024,
          temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userMessage  },
          ],
        }),
      });
      if (res.status === 429) throw new Error("QUOTA_EXCEEDED");
      if (!res.ok) throw new Error(`Status: ${res.status}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response");
      return text;
    } catch (err) {
      if (err.message === "QUOTA_EXCEEDED" || i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HEATMAP
// ══════════════════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT / IMPORT
// ══════════════════════════════════════════════════════════════════════════════
function exportData(expressions, categories) {
  const data = { version: 3, exportedAt: new Date().toISOString(), categories, expressions };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `memomaster_backup_${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseImport(text) {
  try {
    const data = JSON.parse(text);
    if (data.expressions && Array.isArray(data.expressions)) {
      return { expressions: data.expressions, categories: data.categories || [] };
    }
  } catch {}
  // Essai CSV simple: front,back,category,example
  try {
    const lines = text.trim().split("\n").filter(Boolean);
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const expressions = lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj = {};
      header.forEach((h, i) => { obj[h] = vals[i]?.trim() || ""; });
      return {
        id: Date.now().toString() + Math.random(),
        front: obj.front || obj.recto || "",
        back: obj.back || obj.verso || "",
        example: obj.example || obj.exemple || "",
        category: obj.category || obj.categorie || obj.module || "Import",
        level: 0, nextReview: today(), createdAt: today(),
        easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [],
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
  // ── État principal ─────────────────────────────────────────────────────────
  const [view, setView] = useState("dashboard");
  const [expressions, setExpressions] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES_DEFAULT);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ streak: 0, lastSession: null, totalReviews: 0, aiGenerated: 0, examsDone: 0 });
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [videos, setVideos] = useState([]); 
  const [ytUrl, setYtUrl] = useState("");   
  const [loaded, setLoaded] = useState(false);

  // ── État UI ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const [newBadge, setNewBadge] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCat, setFilterCat] = useState("Toutes");
  const [filterLevel, setFilterLevel] = useState("Tous");

  // ── Révision ───────────────────────────────────────────────────────────────
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewSessionDone, setReviewSessionDone] = useState(0);

  // ── Mode examen ────────────────────────────────────────────────────────────
  const [examMode, setExamMode] = useState(false);
  const [examConfig, setExamConfig] = useState({ category: "Toutes", count: 10, timePerCard: 30, mode: "flashcard", difficulty: "adaptative" });
  const [examActive, setExamActive] = useState(false);
  const [examQueue, setExamQueue] = useState([]);
  const [examIndex, setExamIndex] = useState(0);
  const [examAnswers, setExamAnswers] = useState([]);
  const [examTimer, setExamTimer] = useState(0);
  const [examRevealed, setExamRevealed] = useState(false);
  const examTimerRef = useRef(null);
  // QCM
  const [qcmChoices, setQcmChoices] = useState([]);
  const [qcmSelected, setQcmSelected] = useState(null);
  const [qcmLoading, setQcmLoading] = useState(false);
  // Examens personnalisés
  const [customExams, setCustomExams] = useState([]);
  const [examSubView, setExamSubView] = useState("home"); // home | config | active | results | custom | createCustom
  const [selectedCustomExam, setSelectedCustomExam] = useState(null);
  const [newCustomExam, setNewCustomExam] = useState({ title: "", description: "", questions: [] });
  const [customExamEditQ, setCustomExamEditQ] = useState({ question: "", answer: "", choices: ["","","",""], isQcm: false });
  const [examStreak, setExamStreak] = useState(0); // streak de bonnes réponses en cours d'examen
  const [examStartTime, setExamStartTime] = useState(null);

  // ── Ajout / édition ────────────────────────────────────────────────────────
  const [addForm, setAddForm] = useState({ front: "", back: "", example: "", category: "" });
  const [editingId, setEditingId] = useState(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiBatchCount, setAiBatchCount] = useState(5);
  const [aiFromText, setAiFromText] = useState("");
  const [aiFromTextLoading, setAiFromTextLoading] = useState(false);
  const [batchPreview, setBatchPreview] = useState([]);
  const [showBatchPreview, setShowBatchPreview] = useState(false);
  const [addSubView, setAddSubView] = useState("single"); // single | batch | text
  const [listening, setListening] = useState(null);
  const recognitionRef = useRef(null);

  // ── Catégories ─────────────────────────────────────────────────────────────
  const [newCat, setNewCat] = useState({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#4F8EF7" });
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  // ── Refs pour streak stable ────────────────────────────────────────────────
  const statsRef = useRef(stats);
  useEffect(() => { statsRef.current = stats; }, [stats]);

  // ── AI English Practice ────────────────────────────────────────────────────
  const [practiceMessages, setPracticeMessages] = useState([
    { role: "assistant", text: "Hello! I'm your English conversation partner. I'm here to help you practice speaking and writing English naturally. What topic would you like to discuss today? 😊" }
  ]);
  const [practiceInput, setPracticeInput] = useState("");
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceListening, setPracticeListening] = useState(false);
  const [practiceTopic, setPracticeTopic] = useState("Free conversation");
  const [practiceLevel, setPracticeLevel] = useState("intermediate");
  const [practiceSpeaking, setPracticeSpeaking] = useState(false);
  const practiceRecRef = useRef(null);
  const practiceEndRef = useRef(null);
  const practiceMsgRef = useRef(practiceMessages);

  // ── REFS POUR LE MICRO DU CHAT ──
  const practiceMediaRecorderRef = useRef(null);
  const practiceAudioChunksRef = useRef([]);

  // ── AI Practice hooks (DOIVENT être avant tout return conditionnel) ─────────
  useEffect(() => { practiceMsgRef.current = practiceMessages; }, [practiceMessages]);
  useEffect(() => { practiceEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [practiceMessages]);

  // ══════════════════════════════════════════════════════════════════════════
  // CHARGEMENT INITIAL
  // ══════════════════════════════════════════════════════════════════════════
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

        setExpressions(exps);
        setCategories(cats);
        setSessions(sess);
        setStats(st);
        setUnlockedBadges(badges);
        setVideos(storedVids); 
        setCustomExams(storedCustomExams);

        setAddForm((f) => ({ ...f, category: cats[0]?.name || "" }));
        setLoaded(true);
      } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
      }
    })();
  }, []);

  // ── Persistance automatique ────────────────────────────────────────────────
  useEffect(() => { if (loaded) storage.set("expressions_v3", expressions); }, [expressions, loaded]);
  useEffect(() => { if (loaded) storage.set("categories_v3", categories); }, [categories, loaded]);
  useEffect(() => { if (loaded) storage.set("sessions_v3", sessions); }, [sessions, loaded]);
  useEffect(() => { if (loaded) storage.set("stats_v3", stats); }, [stats, loaded]);
  useEffect(() => { if (loaded) storage.set("badges_v3", unlockedBadges); }, [unlockedBadges, loaded]);
  useEffect(() => { if (loaded) storage.set("videos_v3", videos); }, [videos, loaded]); 
  useEffect(() => { if (loaded) storage.set("customExams_v1", customExams); }, [customExams, loaded]);

  // ══════════════════════════════════════════════════════════════════════════
  // BADGES — VÉRIFICATION
  // ══════════════════════════════════════════════════════════════════════════
  const checkBadges = useCallback((exps, st, sess, currentBadges) => {
    const mastered = exps.filter((e) => e.level >= 7).length;
    const dueCount = exps.filter((e) => e.nextReview <= today() && e.level < 7).length;
    const state = {
      totalCards: exps.length, streak: st.streak, mastered, dueCount,
      totalReviews: st.totalReviews, aiGenerated: st.aiGenerated, examsDone: st.examsDone,
    };
    const newlyUnlocked = BADGES.filter(
      (b) => !currentBadges.includes(b.id) && b.check(state)
    );
    if (newlyUnlocked.length > 0) {
      const newIds = [...currentBadges, ...newlyUnlocked.map((b) => b.id)];
      setUnlockedBadges(newIds);
      setNewBadge(newlyUnlocked[0]);
      setTimeout(() => setNewBadge(null), 4000);
    }
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // TOAST
  // ══════════════════════════════════════════════════════════════════════════
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // STREAK
  // ══════════════════════════════════════════════════════════════════════════
  const updateStreakAfterSession = useCallback((count) => {
    const todayStr = today();
    setStats((prev) => {
      const yesterday = addDays(todayStr, -1);
      let ns = prev.streak;
      if (prev.lastSession === yesterday) ns = prev.streak + 1;
      else if (prev.lastSession !== todayStr) ns = 1;
      const newStats = {
        ...prev,
        streak: ns,
        lastSession: todayStr,
        totalReviews: prev.totalReviews + count,
      };
      statsRef.current = newStats;
      return newStats;
    });
    setSessions((prev) => {
      const existing = prev.find((s) => s.date === todayStr);
      if (existing) return prev.map((s) => s.date === todayStr ? { ...s, count: s.count + count } : s);
      return [...prev, { date: todayStr, count }];
    });
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION IA GLOBALE (CRÉATION COMPLETE)
  // ══════════════════════════════════════════════════════════════════════════
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    
    try {
      const catName = addForm.category;
      const isEnglish = catName.toLowerCase().includes("anglais");
      const systemPrompt = `Tu es un assistant pédagogique expert pour un étudiant en Licence Informatique à Dakar, Sénégal.
Génère une fiche de révision en JSON UNIQUEMENT (sans markdown, sans backticks, sans texte avant ou après).
Format strict: {"front":"...","back":"...","example":"..."}
- front: le concept/mot/expression à mémoriser (concis, max 10 mots)
- back: explication claire en français (max 4 lignes, pédagogique et mémorable)
- example: un exemple concret et pratique d'utilisation
${isEnglish ? "Pour l'anglais: front=expression anglaise authentique, back=traduction + usage + nuances en français, example=phrase complète en anglais avec contexte naturel" : ""}
${catName.includes("Java") || catName.includes("Spring") ? "Pour Java/Spring: inclure le contexte d'usage, la syntaxe si pertinente, et quand utiliser ce concept" : ""}`;
      
      const raw = await callClaude(systemPrompt, `Génère une fiche sur: ${aiPrompt}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      
      setAddForm((f) => ({ ...f, front: parsed.front || "", back: parsed.back || "", example: parsed.example || "" }));
      showToast("✨ Fiche générée par l'IA !");
      setStats((prev) => ({ ...prev, aiGenerated: prev.aiGenerated + 1 }));
      setAiPrompt(""); 
      
    } catch (error) {
      console.error("Détail de l'erreur IA :", error);
      const msg = error.message?.includes("QUOTA") || error.message?.includes("429")
        ? "⏳ Quota Groq atteint — attends 1 minute et réessaie !"
        : "Erreur IA. Ton brouillon a été conservé.";
      showToast(msg, "error");
    } finally {
      setAiLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION IA CHIRURGICALE (MICRO-IA POUR UN CHAMP)
  // ══════════════════════════════════════════════════════════════════════════
  const handleMicroAI = async (field) => {
    if (!addForm.front.trim()) {
      showToast("Saisis d'abord le Recto !", "error");
      return;
    }
    setAiLoading(true);
    try {
      const isEnglish = addForm.category.toLowerCase().includes("anglais");
      let prompt = "";
      if (field === "back") {
        prompt = `Explique brièvement (max 3 lignes) ce concept : "${addForm.front}". ${isEnglish ? "Donne la traduction et le contexte d'usage." : "Sois pédagogique et direct."} Ne renvoie QUE l'explication, aucun texte avant ou après.`;
      } else if (field === "example") {
        prompt = `Donne un exemple concret et court pour illustrer : "${addForm.front}". ${isEnglish ? "Phrase complète en anglais." : "Code ou mise en situation pratique."} Ne renvoie QUE l'exemple, sans guillemets, sans texte avant ou après.`;
      }
      
      const raw = await callClaude("Tu es un assistant pédagogique direct et concis. Tu ne réponds que la stricte valeur demandée.", prompt);
      setAddForm((f) => ({ ...f, [field]: raw.trim() }));
      showToast(`✨ ${field === "back" ? "Explication" : "Exemple"} généré !`);
      setStats((prev) => ({ ...prev, aiGenerated: prev.aiGenerated + 1 }));
    } catch (error) {
      showToast("Erreur lors de la génération.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION IA EN BATCH (5-10 FICHES D'UN COUP)
  // ══════════════════════════════════════════════════════════════════════════
  const handleAIBatchGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiBatchLoading(true);
    try {
      const catName = addForm.category;
      const isEnglish = catName.toLowerCase().includes("anglais");
      const systemPrompt = `Tu es un assistant pédagogique expert pour un étudiant en Licence Informatique à Dakar.
Génère exactement ${aiBatchCount} fiches de révision variées sur le sujet demandé.
Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks.
Format strict: {"cards":[{"front":"...","back":"...","example":"..."},...]}
- front: concept/mot concis (max 10 mots), couvre différents angles du sujet
- back: explication claire en français (max 4 lignes, pédagogique)
- example: exemple concret et pratique
${isEnglish ? "Pour l'anglais: front=expression anglaise, back=traduction + usage + nuances, example=phrase complète en anglais" : ""}
${catName.includes("Java") || catName.includes("Spring") ? "Pour Java/Spring: inclure contexte, syntaxe si pertinent, quand utiliser" : ""}
Chaque fiche doit couvrir un aspect DIFFÉRENT du sujet pour maximiser l'apprentissage.`;
      const raw = await callClaude(systemPrompt, `Génère ${aiBatchCount} fiches sur: ${aiPrompt}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const cards = parsed.cards || parsed;
      setBatchPreview(Array.isArray(cards) ? cards : []);
      setShowBatchPreview(true);
      showToast(`✨ ${cards.length} fiches générées — vérifies-les avant de sauvegarder !`, "info");
    } catch (err) {
      console.error("Erreur batch IA:", err);
      showToast("Erreur lors de la génération. Réessaie !", "error");
    } finally {
      setAiBatchLoading(false);
    }
  };

  const confirmBatch = () => {
    if (batchPreview.length === 0) return;
    const newExps = batchPreview.map(card => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      front: (card.front || "").trim(),
      back: (card.back || "").trim(),
      example: (card.example || "").trim(),
      category: addForm.category,
      level: 0, nextReview: today(), createdAt: today(),
      easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [],
    })).filter(e => e.front && e.back);
    setExpressions(prev => {
      const updated = [...newExps, ...prev];
      checkBadges(updated, statsRef.current, sessions, unlockedBadges);
      return updated;
    });
    setStats(prev => ({ ...prev, aiGenerated: prev.aiGenerated + newExps.length }));
    showToast(`🎉 ${newExps.length} fiches sauvegardées dans "${addForm.category}" !`);
    setBatchPreview([]);
    setShowBatchPreview(false);
    setAiPrompt("");
  };

  const removeBatchCard = (idx) => {
    setBatchPreview(prev => prev.filter((_, i) => i !== idx));
  };

  // ══════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION IA DEPUIS UN TEXTE COLLÉ
  // ══════════════════════════════════════════════════════════════════════════
  const handleAIFromText = async () => {
    if (!aiFromText.trim()) return;
    setAiFromTextLoading(true);
    try {
      const catName = addForm.category;
      const raw = await callClaude(
        `Tu es un assistant pédagogique expert. À partir du texte fourni, identifie les 5 à 7 concepts clés les plus importants à mémoriser et génère des fiches de révision.
Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks.
Format strict: {"cards":[{"front":"...","back":"...","example":"..."},...]}
- front: concept clé extrait du texte (concis)
- back: explication mémorable basée sur le texte
- example: application concrète ou phrase d'exemple
Priorise les concepts les plus importants et difficiles à retenir.`,
        `Module cible: ${catName}\n\nTexte à analyser:\n${aiFromText.slice(0, 3000)}`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const cards = parsed.cards || parsed;
      setBatchPreview(Array.isArray(cards) ? cards : []);
      setShowBatchPreview(true);
      setAddSubView("batch");
      showToast(`✨ ${Array.isArray(cards) ? cards.length : 0} fiches extraites du texte !`);
    } catch (err) {
      console.error("Erreur from text:", err);
      showToast("Erreur lors de l'analyse. Réessaie !", "error");
    } finally {
      setAiFromTextLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SAISIE VOCALE (VERSION ROBUSTE)
  // ══════════════════════════════════════════════════════════════════════════
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startVoice = async (field) => {
    try {
      // 1. Demander l'accès au micro de façon standard
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // 2. Stocker les morceaux d'audio pendant que tu parles
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 3. Quand tu arrêtes l'enregistrement, on envoie à Groq
      mediaRecorder.onstop = async () => {
        setListening("processing"); // Indique à l'UI que l'IA réfléchit
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Préparation du fichier pour l'API Groq
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");
        formData.append("model", "whisper-large-v3");
        
        // Optimisation : préciser la langue aide Whisper à être encore plus précis
        const isEnglish = field === "front" && addForm.category.toLowerCase().includes("anglais");
        formData.append("language", isEnglish ? "en" : "fr");

        try {
          // Appel à l'API Groq (nécessite VITE_GROQ_API_KEY dans le .env ou Netlify)
          const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`
            },
            body: formData
          });
          
          if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
          const data = await res.json();
          
          // Ajout du texte transcrit dans le bon champ
          if (data.text) {
             setAddForm((f) => ({ ...f, [field]: (f[field] ? f[field] + " " : "") + data.text.trim() }));
             showToast("🎙️ Transcription réussie !");
          }
        } catch (err) {
          console.error("Erreur Whisper :", err);
          showToast("Échec de la transcription. Vérifie ta clé Groq.", "error");
        } finally {
          // Extinction propre du micro et de l'UI
          stream.getTracks().forEach(track => track.stop());
          setListening(null);
        }
      };

      // 4. Démarrer l'enregistrement
      mediaRecorder.start();
      setListening(field);
    } catch (err) {
      console.error("Accès micro refusé :", err);
      showToast("Accès au micro refusé. Vérifie les permissions.", "error");
      setListening(null);
    }
  };

  const stopVoice = () => {
    // Si on enregistre, on stop. Cela va déclencher le 'onstop' au-dessus.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };


  // ══════════════════════════════════════════════════════════════════════════
  // AJOUTER / ÉDITER UNE FICHE
  // ══════════════════════════════════════════════════════════════════════════
  const handleAdd = () => {
    if (!addForm.front.trim() || !addForm.back.trim()) {
      showToast("Recto et verso obligatoires !", "error");
      return;
    }
    if (editingId) {
      setExpressions((prev) =>
        prev.map((e) =>
          e.id === editingId
            ? { ...e, front: addForm.front.trim(), back: addForm.back.trim(), example: addForm.example.trim(), category: addForm.category }
            : e
        )
      );
      setEditingId(null);
      showToast("✏️ Fiche mise à jour !");
    } else {
      const newExp = {
        id: Date.now().toString(),
        front: addForm.front.trim(), back: addForm.back.trim(),
        example: addForm.example.trim(), category: addForm.category,
        level: 0, nextReview: today(), createdAt: today(),
        easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [],
      };
      setExpressions((prev) => {
        const updated = [newExp, ...prev];
        checkBadges(updated, statsRef.current, sessions, unlockedBadges);
        return updated;
      });
      showToast("✅ Fiche ajoutée !");
    }
    setAddForm((f) => ({ ...f, front: "", back: "", example: "" }));
  };

  const startEdit = (exp) => {
    setAddForm({ front: exp.front, back: exp.back, example: exp.example || "", category: exp.category });
    setEditingId(exp.id);
    setView("add");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAddForm((f) => ({ ...f, front: "", back: "", example: "" }));
  };

  const deleteExp = (id) => {
    setExpressions((prev) => prev.filter((e) => e.id !== id));
    showToast("Fiche supprimée.", "info");
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RÉVISION SM-2
  // ══════════════════════════════════════════════════════════════════════════
  const todayReviews = useMemo(
    () => expressions.filter((e) => e.nextReview <= today() && e.level < 7),
    [expressions]
  );
  const masteredCount = useMemo(() => expressions.filter((e) => e.level >= 7).length, [expressions]);

  const getSmartQueue = useCallback((queue) => {
    return [...queue].sort((a, b) => {
      const catA = categories.find((c) => c.name === a.category);
      const catB = categories.find((c) => c.name === b.category);
      const daysA = catA?.examDate ? Math.ceil((new Date(catA.examDate) - new Date()) / 86400000) : 999;
      const daysB = catB?.examDate ? Math.ceil((new Date(catB.examDate) - new Date()) / 86400000) : 999;
      if (daysA !== daysB) return daysA - daysB;
      return a.easeFactor - b.easeFactor; 
    });
  }, [categories]);

  const startReview = (catFilter = null) => {
    let queue = catFilter
      ? todayReviews.filter((e) => e.category === catFilter)
      : [...todayReviews];
    queue = getSmartQueue(queue);
    if (queue.length === 0) { showToast("Aucune fiche à réviser !", "info"); return; }
    setReviewQueue(queue);
    setReviewIndex(0);
    setRevealed(false);
    setReviewSessionDone(0);
    setView("review");
  };

  const handleAnswer = (q) => {
    const exp = reviewQueue[reviewIndex];
    const updated = sm2(exp, q);
    const newLevel = q === 0 ? 0 : q === 3 ? Math.max(exp.level, 1) : Math.min(7, exp.level + 1);
    const histEntry = { date: today(), q, newLevel, interval: updated.interval };
    setExpressions((prev) =>
      prev.map((e) =>
        e.id === exp.id
          ? { ...e, ...updated, level: newLevel, reviewHistory: [...(e.reviewHistory || []), histEntry] }
          : e
      )
    );
    const done = reviewSessionDone + 1;
    setReviewSessionDone(done);
    if (reviewIndex + 1 >= reviewQueue.length) {
      updateStreakAfterSession(done);
      setStats((prev) => {
        const ns = { ...prev };
        checkBadges(expressions, ns, sessions, unlockedBadges);
        return ns;
      });
      showToast(`🎉 ${done} carte(s) révisée(s) !`);
      setView("dashboard");
    } else {
      setReviewIndex((i) => i + 1);
      setRevealed(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RACCOURCIS CLAVIER
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const handler = (e) => {
      if (view === "review") {
        if (e.code === "Space" && !revealed) { e.preventDefault(); setRevealed(true); }
        if (revealed) {
          if (e.key === "1") handleAnswer(0);
          if (e.key === "2") handleAnswer(3);
          if (e.key === "3") handleAnswer(5);
        }
      }
      if (view === "exam" && examActive) {
        if (e.code === "Space" && !examRevealed && examConfig.mode !== "qcm") { e.preventDefault(); setExamRevealed(true); }
        if (examRevealed && examConfig.mode !== "qcm") {
          if (e.key === "1") handleExamAnswer(0);
          if (e.key === "2") handleExamAnswer(3);
          if (e.key === "3") handleExamAnswer(5);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, revealed, examActive, examRevealed]);

  // ══════════════════════════════════════════════════════════════════════════
  // MODE EXAMEN
  // ══════════════════════════════════════════════════════════════════════════
  const getDifficultyPool = (pool, difficulty) => {
    if (difficulty === "facile") return pool.filter(e => e.level >= 4);
    if (difficulty === "difficile") return pool.filter(e => e.level <= 2 || e.easeFactor <= 1.9);
    if (difficulty === "extreme") return pool.filter(e => e.level <= 1 || e.easeFactor <= 1.6);
    return pool; // adaptative = tout
  };

  const startExam = (customExamData = null) => {
    if (customExamData) {
      // Examen personnalisé
      const q = [...customExamData.questions].sort(() => Math.random() - 0.5);
      setExamQueue(q.map(qu => ({ ...qu, isCustom: true })));
      setExamIndex(0);
      setExamAnswers([]);
      setExamRevealed(false);
      setQcmSelected(null);
      setQcmChoices([]);
      setExamTimer(examConfig.timePerCard);
      setExamStreak(0);
      setExamStartTime(Date.now());
      setExamActive(true);
      setExamSubView("active");
      return;
    }
    let pool = examConfig.category === "Toutes" ? expressions : expressions.filter((e) => e.category === examConfig.category);
    pool = getDifficultyPool(pool, examConfig.difficulty);
    if (pool.length === 0) {
      // Fallback si filtre trop strict
      pool = examConfig.category === "Toutes" ? expressions : expressions.filter((e) => e.category === examConfig.category);
    }
    if (pool.length === 0) { showToast("Aucune fiche pour cet examen.", "error"); return; }
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(examConfig.count, pool.length));
    setExamQueue(shuffled);
    setExamIndex(0);
    setExamAnswers([]);
    setExamRevealed(false);
    setQcmSelected(null);
    setQcmChoices([]);
    setExamTimer(examConfig.timePerCard);
    setExamStreak(0);
    setExamStartTime(Date.now());
    setExamActive(true);
    setExamSubView("active");
  };

  // Génération des choix QCM par l'IA
  const generateQcmChoices = async (card) => {
    setQcmLoading(true);
    setQcmChoices([]);
    setQcmSelected(null);
    try {
      const allAnswers = expressions
        .filter(e => e.id !== card.id && e.category === card.category)
        .map(e => e.back).slice(0, 8);
      const raw = await callClaude(
        `Tu es un générateur de QCM pédagogique. Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks.`,
        `Question: "${card.front}"
Bonne réponse: "${card.back}"
Autres réponses disponibles dans la même catégorie: ${JSON.stringify(allAnswers)}

Génère 3 mauvaises réponses plausibles mais clairement incorrectes, qui ne soient pas trop similaires à la bonne réponse.
Si les autres réponses disponibles sont suffisantes, utilise-les. Sinon invente des distracteurs cohérents.
Retourne UNIQUEMENT ce JSON: {"wrong":["mauvaise1","mauvaise2","mauvaise3"]}`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const choices = [...parsed.wrong.slice(0, 3), card.back].sort(() => Math.random() - 0.5);
      setQcmChoices(choices);
    } catch {
      // Fallback: générer des distracteurs depuis les autres fiches
      const others = expressions
        .filter(e => e.id !== card.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(e => e.back);
      const choices = [...others, card.back].sort(() => Math.random() - 0.5);
      setQcmChoices(choices);
    } finally {
      setQcmLoading(false);
    }
  };

  useEffect(() => {
    if (!examActive) return;
    examTimerRef.current = setInterval(() => {
      setExamTimer((t) => {
        if (t <= 1) {
          handleExamAnswer(0); 
          return examConfig.timePerCard;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(examTimerRef.current);
  }, [examActive, examIndex]);

  // Charger les choix QCM quand on change de carte
  useEffect(() => {
    if (examActive && examQueue[examIndex] && examConfig.mode === "qcm" && !examQueue[examIndex].isCustom) {
      generateQcmChoices(examQueue[examIndex]);
    }
    if (examActive && examQueue[examIndex] && examQueue[examIndex].isCustom && examQueue[examIndex].isQcm) {
      const card = examQueue[examIndex];
      setQcmChoices([...card.choices].sort(() => Math.random() - 0.5));
      setQcmSelected(null);
    }
  }, [examIndex, examActive]);

  const handleExamAnswer = (q) => {
    clearInterval(examTimerRef.current);
    const card = examQueue[examIndex];
    const newStreak = q >= 3 ? examStreak + 1 : 0;
    setExamStreak(newStreak);
    const newAnswers = [...examAnswers, { card, q, timeSpent: examConfig.timePerCard - examTimer }];
    setExamAnswers(newAnswers);
    setQcmSelected(null);
    setQcmChoices([]);
    if (examIndex + 1 >= examQueue.length) {
      setExamActive(false);
      setStats((prev) => ({ ...prev, examsDone: prev.examsDone + 1 }));
      checkBadges(expressions, { ...stats, examsDone: stats.examsDone + 1 }, sessions, unlockedBadges);
      setExamSubView("results");
    } else {
      setExamIndex((i) => i + 1);
      setExamRevealed(false);
      setExamTimer(examConfig.timePerCard);
    }
  };

  const examScore = useMemo(() => {
    if (examAnswers.length === 0) return 0;
    const good = examAnswers.filter((a) => a.q >= 3).length;
    return Math.round((good / examAnswers.length) * 100);
  }, [examAnswers]);

  // ══════════════════════════════════════════════════════════════════════════
  // CATÉGORIES
  // ══════════════════════════════════════════════════════════════════════════
  const handleAddCat = () => {
    if (!newCat.name.trim() || categories.find((c) => c.name === newCat.name.trim())) {
      showToast("Nom invalide ou déjà existant.", "error");
      return;
    }
    setCategories((prev) => [...prev, { ...newCat, name: newCat.name.trim() }]);
    setNewCat({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#4F8EF7" });
    showToast("Module créé !");
  };

  const deleteCategory = (name) => {
    setCategories((prev) => prev.filter((c) => c.name !== name));
    setExpressions((prev) => prev.filter((e) => e.category !== name));
    showToast(`Module "${name}" et ses fiches supprimés.`, "info");
  };

  // ══════════════════════════════════════════════════════════════════════════
  // IMPORT
  // ══════════════════════════════════════════════════════════════════════════
  const handleImport = () => {
    const result = parseImport(importText);
    if (!result) { showToast("Format invalide. JSON ou CSV acceptés.", "error"); return; }
    const { expressions: newExps, categories: newCats } = result;
    setExpressions((prev) => {
      const existing = new Set(prev.map((e) => e.front + e.category));
      const toAdd = newExps.filter((e) => !existing.has(e.front + e.category));
      return [...prev, ...toAdd];
    });
    if (newCats.length > 0) {
      setCategories((prev) => {
        const existing = new Set(prev.map((c) => c.name));
        return [...prev, ...newCats.filter((c) => !existing.has(c.name))];
      });
    }
    setImportText("");
    setShowImport(false);
    showToast(`${newExps.length} fiche(s) importée(s) !`);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // DONNÉES DÉRIVÉES
  // ══════════════════════════════════════════════════════════════════════════
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
      list = list.filter(
        (e) => e.front.toLowerCase().includes(q) || e.back.toLowerCase().includes(q) || (e.example || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [expressions, filterCat, filterLevel, searchQuery]);

  const levelLabel = ["Nouveau", "J+1", "J+6", "Adaptatif", "Adaptatif", "Avancé", "Expert", "✅ Maîtrisé"];

  if (!loaded)
    return (
      <div style={s.loading}>
        <div style={s.spinnerWrap}>
          <div style={s.spinner} />
          <div style={s.spinnerRing} />
        </div>
        <p style={s.loadingText}>MémoMaître</p>
        <p style={s.loadingSub}>Chargement de ton espace d'apprentissage...</p>
      </div>
    );

  const currentCard = reviewQueue[reviewIndex];

  // ══════════════════════════════════════════════════════════════════════════
  // AI ENGLISH PRACTICE — FONCTIONS
  // ══════════════════════════════════════════════════════════════════════════
  const sendPracticeMessage = async (text) => {
    if (!text.trim() || practiceLoading) return;
    const userMsg = { role: "user", text: text.trim() };
    setPracticeMessages(prev => [...prev, userMsg]);
    setPracticeInput("");
    setPracticeLoading(true);
    try {
      const systemPrompt = `You are an English conversation coach for El Hadji Malick, a Computer Science student from Dakar, Senegal. Your role:
- Speak ONLY in English (never French unless the user makes a grammar mistake you want to explain)
- Level: ${practiceLevel} (${practiceLevel === "beginner" ? "simple vocabulary, short sentences" : practiceLevel === "intermediate" ? "varied vocabulary, natural flow" : "advanced vocabulary, idioms, complex structures"})
- Topic: ${practiceTopic}
- Keep responses conversational (2-4 sentences usually), like a real conversation partner
- Occasionally, subtly correct grammar mistakes by using the correct form naturally in your reply
- Ask follow-up questions to keep the conversation going
- Be encouraging and positive
- If asked about IT/programming topics, discuss them in English with technical depth
- DO NOT add labels like "Grammar note:" unless the user specifically asks for corrections`;
      // Construire l'historique pour Groq (format OpenAI : role user/assistant)
      const groqHistory = [];
      const recentMsgs = practiceMsgRef.current.slice(-10);
      for (const m of recentMsgs) {
        groqHistory.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.text });
      }
      groqHistory.push({ role: "user", content: text.trim() });

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          max_tokens: 400,
          temperature: 0.85,
          messages: [
            { role: "system", content: systemPrompt },
            ...groqHistory,
          ],
        })
      });
      if (res.status === 429) throw new Error("QUOTA");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "I didn't catch that. Could you try again?";
      const aiMsg = { role: "assistant", text: reply };
      setPracticeMessages(prev => [...prev, aiMsg]);
      speakText(reply);
    } catch (err) {
      const msg = err.message === "QUOTA"
        ? "⏳ API quota reached — wait 1 minute and try again! (Free tier limit)"
        : "Sorry, connection issue. Please try again! 🔄";
      setPracticeMessages(prev => [...prev, { role: "assistant", text: msg }]);
    } finally {
      setPracticeLoading(false);
    }
  };

  const speakText = (text) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "en-US";
    utt.rate = 0.92;
    utt.pitch = 1.05;
    // Chercher une voix anglaise naturelle
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang === "en-US" && v.name.includes("Google")) ||
                      voices.find(v => v.lang === "en-US" && !v.name.includes("Microsoft")) ||
                      voices.find(v => v.lang === "en-US") ||
                      voices.find(v => v.lang.startsWith("en"));
    if (preferred) utt.voice = preferred;
    setPracticeSpeaking(true);
    utt.onend = () => setPracticeSpeaking(false);
    utt.onerror = () => setPracticeSpeaking(false);
    window.speechSynthesis.speak(utt);
  };

  // ── FONCTION TOGGLE (DÉMARRER / ARRÊTER) ──
  const togglePracticeMic = async () => {
    // 1. SI ON ENREGISTRE DÉJÀ -> ON ARRÊTE
    if (practiceListening) {
      if (practiceMediaRecorderRef.current && practiceMediaRecorderRef.current.state === "recording") {
        practiceMediaRecorderRef.current.stop();
      }
      return; // On sort de la fonction, le 'onstop' va faire le reste
    }

    // 2. SINON -> ON DÉMARRE L'ENREGISTREMENT
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      practiceMediaRecorderRef.current = mediaRecorder;
      practiceAudioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          practiceAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setPracticeListening(false);
        setPracticeInput("⏳ Transcription Whisper en cours..."); // Indication visuelle

        const audioBlob = new Blob(practiceAudioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");
        formData.append("model", "whisper-large-v3");
        formData.append("language", "en"); // On force l'anglais pour le chatbot

        try {
          const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}` },
            body: formData
          });

          if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
          const data = await res.json();

          if (data.text) {
            const transcribedText = data.text.trim();
            setPracticeInput("");
            // ENVOI AUTOMATIQUE DU MESSAGE TRANSCRIT
            sendPracticeMessage(transcribedText);
          } else {
            setPracticeInput("");
          }
        } catch (err) {
          console.error("Erreur Whisper Chat :", err);
          setPracticeInput("");
          showToast("Erreur de transcription Whisper.", "error");
        } finally {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setPracticeListening(true);
    } catch (err) {
      console.error("Accès micro refusé :", err);
      showToast("Micro refusé. Vérifie les permissions.", "error");
      setPracticeListening(false);
    }
  };

  const resetPracticeChat = () => {
    window.speechSynthesis?.cancel();
    setPracticeSpeaking(false);
    setPracticeMessages([{ role: "assistant", text: `Great! Let's talk about "${practiceTopic}". I'm ready whenever you are — feel free to type or use your mic. What's on your mind? 🎤` }]);
  };

  // Variables Dashboard
  const hour = new Date().getHours();
  const greeting = hour >= 18 ? "Bonsoir" : "Bonjour";
  const estimatedTime = Math.ceil(todayReviews.length * 0.5); 
  const newCards = expressions.filter(e => e.level === 0);
  const criticalCards = todayReviews.filter(e => e.easeFactor <= 1.8);
  const weakestCat = categories.length > 0 ? categories.map(cat => {
    const catExps = expressions.filter(e => e.category === cat.name);
    const mastered = catExps.filter(e => e.level >= 7).length;
    const pct = catExps.length ? (mastered / catExps.length) * 100 : 0;
    return { name: cat.name, pct };
  }).sort((a, b) => a.pct - b.pct)[0]?.name || categories[0]?.name : "";

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={s.app}>
      <style>{CSS}</style>

      {/* ── TOAST ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ ...s.toast, background: toast.type === "error" ? "#ef4444" : toast.type === "info" ? "#3b82f6" : "linear-gradient(135deg,#4F8EF7,#7B5FF5)" }}>
          {toast.msg}
        </div>
      )}

      {/* ── BADGE NOTIF ──────────────────────────────────────────────────── */}
      {newBadge && (
        <div style={s.badgeNotif}>
          <span style={{ fontSize: 32 }}>{newBadge.icon}</span>
          <div>
            <div style={{ fontWeight: 800, color: "#E0E8FF", fontSize: 15 }}>Badge débloqué !</div>
            <div style={{ color: "#F0A040", fontWeight: 700 }}>{newBadge.label}</div>
            <div style={{ color: "#6B7A99", fontSize: 12 }}>{newBadge.desc}</div>
          </div>
        </div>
      )}

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav style={s.nav}>
        <div style={s.navBrand}>
          <div style={s.navLogo}>M²</div>
          <div>
            <div style={s.navTitle}>MémoMaître</div>
            <div style={s.navSub}>God Level Edition v3</div>
          </div>
        </div>
        <div style={s.navLinks}>
          {[
            { id: "dashboard", icon: "⚡", label: "Accueil" },
            { id: "add", icon: "✦", label: editingId ? "Éditer" : "Ajouter" },
            { id: "list", icon: "◈", label: "Fiches" },
            { id: "categories", icon: "◉", label: "Modules" },
            { id: "exam", icon: "🎯", label: "Examen" },
            { id: "practice", icon: "🗣️", label: "English AI" },
            { id: "stats", icon: "▣", label: "Stats" },
            { id: "badges", icon: "🏆", label: "Badges" },
          ].map((n) => (
            <button
              key={n.id}
              onClick={() => { setView(n.id); if (n.id !== "exam") { /* keep exam state */ } if (n.id === "exam") setExamSubView("home"); }}
              className={view === n.id ? "tab-active" : "hov"}
              style={s.navItem}
            >
              {n.icon} {n.label}
              {n.id === "dashboard" && todayReviews.length > 0 && (
                <span style={s.navBadge}>{todayReviews.length}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main style={s.main}>

        {/* ════════════════════════════════════════════════════════════════
            DASHBOARD
        ════════════════════════════════════════════════════════════════ */}
        {view === "dashboard" && (
          <div style={s.fadeIn}>
            <div style={s.heroGod}>
              <div>
                <h1 style={s.heroTitle}>{greeting} El Hadji Malick {hour >= 18 ? "🌙" : "☀️"}</h1>
                <p style={s.heroSub}>
                  {stats.streak > 0 
                    ? `Tu es sur une série de ${stats.streak} jours. Protège ton streak ! 🔥` 
                    : "C'est le moment de lancer ton premier streak de la semaine. 🌱"}
                </p>
              </div>
              <div style={s.miniHeatmap}>
                <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 700, marginRight: 8 }}>CETTE SEMAINE</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {weeks[11].map(date => {
                    const cnt = heatmap[date] || 0;
                    const isToday = date === today();
                    return (
                      <div key={date} title={`${date} : ${cnt} rév.`} style={{ width: 16, height: 16, borderRadius: 4, background: cnt > 0 ? "#4F8EF7" : "#EFF6FF", border: isToday ? "2px solid #1D4ED8" : "none", opacity: date > today() ? 0.3 : 1 }} />
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={s.missionCardGod} className="card-hov">
              <div style={s.missionHeader}>
                <div style={s.missionPulse}></div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: "#1D4ED8", margin: 0 }}>Mission du jour</h2>
              </div>
              
              <div style={{ display: "flex", gap: 20, marginTop: 24, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 42, fontWeight: 900, color: todayReviews.length > 0 ? "#1F2937" : "#40C080", lineHeight: 1 }}>
                    {todayReviews.length}
                  </div>
                  <div style={{ color: "#6B7A99", fontWeight: 600, marginTop: 4 }}>
                    Fiches à réviser (~{estimatedTime} min)
                  </div>
                  {criticalCards.length > 0 && (
                    <div style={s.dangerWarning}>
                      ⚠️ <strong>Attention :</strong> {criticalCards.length} fiches critiques risquent de repasser au niveau zéro d'ici demain.
                    </div>
                  )}
                </div>

                <div style={s.triageBox}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#7B5FF5" }}>{newCards.length}</div>
                  <div style={{ color: "#1F2937", fontSize: 13, fontWeight: 700 }}>Dans l'Inbox</div>
                  <div style={{ color: "#6B7A99", fontSize: 11, marginTop: 2 }}>Nouvelles fiches non apprises</div>
                </div>
              </div>

              <button 
                className="btn-glow hov" 
                onClick={() => startReview()} 
                disabled={todayReviews.length === 0}
                style={{ ...s.focusBtn, opacity: todayReviews.length === 0 ? 0.5 : 1, marginTop: 24 }}
              >
                {todayReviews.length > 0 ? "🚀 Lancer le Deep Focus" : "✅ Mission accomplie pour aujourd'hui"}
              </button>
            </div>

            <h2 style={s.sectionTitleLight}>⚡ État des modules</h2>
            <div style={s.modulesGrid}>
              {categories.map((cat) => {
                const catExps = expressions.filter((e) => e.category === cat.name);
                const dueCount = catExps.filter((e) => e.nextReview <= today() && e.level < 7).length;
                const mastered = catExps.filter((e) => e.level >= 7).length;
                const pct = catExps.length ? Math.round((mastered / catExps.length) * 100) : 0;
                const daysToExam = cat.examDate ? Math.ceil((new Date(cat.examDate) - new Date()) / 86400000) : null;
                const isUrgent = daysToExam !== null && daysToExam <= 7;
                const catColor = isUrgent ? "#EF4444" : (cat.color || "#1D4ED8");
                
                return (
                  <div key={cat.name} style={{ ...s.moduleCardLight, borderLeft: `6px solid ${catColor}` }} className="card-hov">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={s.moduleNameLight}>{cat.name}</div>
                      {dueCount > 0 && <span style={s.duePill}>{dueCount} dues</span>}
                    </div>
                    
                    {daysToExam !== null && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: isUrgent ? "#EF4444" : "#D97706", marginBottom: 8 }}>
                        {daysToExam > 0 ? `⏳ Examen J-${daysToExam}` : daysToExam === 0 ? "🚨 Examen aujourd'hui !" : "Passé"}
                      </div>
                    )}

                    <div style={s.progressWrap}>
                      <div style={s.progressTrackLight}>
                        <div style={{ ...s.progressFillLight, width: `${pct}%`, background: pct >= (cat.targetScore || 80) ? "#10B981" : catColor }} />
                      </div>
                      <span style={{ ...s.pctLabel, color: catColor }}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <h2 style={s.sectionTitleLight}>🤖 Renforcer tes points faibles</h2>
            <div style={{ ...s.aiBlock, marginBottom: 32, background: "linear-gradient(135deg, #F5F3FF, #EFF6FF)", border: "1px solid #E0E7FF" }}>
              <div style={s.aiHeader}>
                <span style={s.aiIcon}>✨</span>
                <div>
                  <div style={{ fontWeight: 800, color: "#1F2937", fontSize: 15 }}>
                    Suggestion IA : Concentre-toi sur <span style={{ color: "#7B5FF5" }}>{weakestCat}</span>
                  </div>
                  <div style={{ color: "#6B7A99", fontSize: 13 }}>
                    C'est ton module le moins maîtrisé. Génère une nouvelle fiche pour consolider tes bases.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <select
                  value={addForm.category || weakestCat}
                  onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                  style={{ ...s.select, flex: "0 0 auto", width: "auto", minWidth: 160 }}
                >
                  {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !aiLoading && handleAIGenerate()}
                  style={{ ...s.aiInput, flex: 1, border: "1px solid #C7D2FE" }}
                  placeholder="Tape un concept que tu as du mal à retenir..."
                />
                <button
                  className="hov btn-glow"
                  onClick={async () => { 
                    if(!addForm.category) setAddForm(f => ({...f, category: weakestCat}));
                    await handleAIGenerate(); 
                    setView("add"); 
                  }}
                  disabled={aiLoading || !aiPrompt.trim()}
                  style={{ ...s.aiBtn, background: "#7B5FF5" }}
                >
                  {aiLoading ? <span style={{ animation: "pulse 1s infinite", display: "inline-block" }}>⏳</span> : "Générer la fiche"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            RÉVISION SM-2
        ════════════════════════════════════════════════════════════════ */}
        {view === "review" && currentCard && (
          <div style={s.fadeIn}>
            <div style={s.reviewHeader}>
              <button onClick={() => { setView("dashboard"); if (reviewSessionDone > 0) updateStreakAfterSession(reviewSessionDone); }} style={s.backBtn}>← Quitter</button>
              <div style={s.reviewProgress}>
                <span style={{ color: "#4F8EF7", fontWeight: 800 }}>{reviewIndex + 1}</span>
                <span style={{ color: "#6B7A99" }}> / {reviewQueue.length}</span>
              </div>
            </div>
            <div style={s.progressBar}>
              <div style={{ ...s.progressBarFill, width: `${(reviewIndex / reviewQueue.length) * 100}%` }} />
            </div>

            <div style={s.flashCard} className="card-hov">
              <div style={s.cardTop}>
                <span style={s.catTag}>{currentCard.category}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={s.easeTag}>EF: {(currentCard.easeFactor || 2.5).toFixed(1)}</span>
                  <span style={{ ...s.easeTag, background: "#40C08022", color: "#40C080" }}>N{currentCard.level}</span>
                </div>
              </div>
              <div style={s.cardQ}>
                <div style={s.cardQLabel}>QUESTION</div>
                <div style={s.cardQText}>{currentCard.front}</div>
              </div>
              {!revealed ? (
                <>
                  <button className="hov btn-glow" onClick={() => setRevealed(true)} style={s.revealBtn}>
                    👁️ Voir la réponse
                  </button>
                  <div style={s.kbHint}>⌨️ <kbd style={s.kbd}>Espace</kbd> pour révéler</div>
                </>
              ) : (
                <div style={{ animation: "slideIn 0.3s ease" }}>
                  <div style={s.cardA}>
                    <div style={s.cardALabel}>RÉPONSE</div>
                    <div style={s.cardAText}>{currentCard.back}</div>
                    {currentCard.example && (
                      <div style={s.cardEx}>
                        <span style={{ color: "#4F8EF7", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>// exemple</span><br />
                        {currentCard.example}
                      </div>
                    )}
                  </div>
                  <div style={s.answerBtns}>
                    <button className="hov" onClick={() => handleAnswer(0)} style={s.btnOublie}>
                      😓 Oublié<br /><span style={{ fontSize: 11, opacity: 0.8 }}>Retour à zéro</span>
                      <span style={s.kbKey}>1</span>
                    </button>
                    <button className="hov" onClick={() => handleAnswer(3)} style={s.btnHesite}>
                      🤔 Hésité<br /><span style={{ fontSize: 11, opacity: 0.8 }}>Intervalle ×EF/2</span>
                      <span style={s.kbKey}>2</span>
                    </button>
                    <button className="hov" onClick={() => handleAnswer(5)} style={s.btnFacile}>
                      ⚡ Facile<br /><span style={{ fontSize: 11, opacity: 0.8 }}>SM-2 optimisé</span>
                      <span style={s.kbKey}>3</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {(currentCard.reviewHistory?.length || 0) > 0 && (
              <div style={s.cardHistory}>
                <span style={{ color: "#6B7A99", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>Historique: </span>
                {currentCard.reviewHistory.slice(-7).map((h, i) => (
                  <span key={i} style={{ ...s.histDot, background: h.q === 0 ? "#F04040" : h.q === 3 ? "#F0A040" : "#40C080" }} title={`${h.date} — ${h.q === 0 ? "Oublié" : h.q === 3 ? "Hésité" : "Facile"}`} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            AJOUTER GOD TIER (SPLIT VIEW + MICRO-IA + FLOW STATE)
        ════════════════════════════════════════════════════════════════ */}
        {view === "add" && (
          <div style={s.fadeIn}>
            <div style={s.pageHeader}>
              <div>
                <h1 style={s.pageTitle}>{editingId ? "✏️ Mode Édition" : "⚡ Création de Fiches"}</h1>
                <p style={s.pageSub}>
                  {editingId 
                    ? "Ajuste ta fiche en temps réel." 
                    : "Crée une fiche, génère-en plusieurs d'un coup, ou colle un texte pour l'analyser."}
                </p>
              </div>
              {editingId && (
                <button onClick={cancelEdit} className="hov" style={s.cancelEditBtn}>✕ Annuler</button>
              )}
            </div>

            {/* ── ONGLETS MODE CRÉATION ─── */}
            {!editingId && (
              <div style={{ display: "flex", gap: 8, marginBottom: 24, background: "white", padding: 6, borderRadius: 18, border: "1px solid #EFF6FF", boxShadow: "0 4px 15px rgba(29,78,216,0.04)" }}>
                {[
                  { id: "single", icon: "✦", label: "Fiche unique" },
                  { id: "batch", icon: "🚀", label: "Batch IA (×5-10)" },
                  { id: "text", icon: "📄", label: "Depuis un texte" },
                ].map(t => (
                  <button key={t.id} onClick={() => { setAddSubView(t.id); setShowBatchPreview(false); }}
                    className="hov"
                    style={{ flex: 1, padding: "12px 8px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'Sora', sans-serif", transition: "all 0.2s",
                      background: addSubView === t.id ? "linear-gradient(135deg, #1D4ED8, #3B82F6)" : "transparent",
                      color: addSubView === t.id ? "white" : "#6B7A99"
                    }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── MODE SINGLE : bloc IA classique ─── */}
            {(addSubView === "single" || editingId) && (
              <div style={s.aiGodBlock}>
                <div style={s.aiHeader}>
                  <span style={s.aiIconGlow}>✨</span>
                  <div>
                    <div style={{ fontWeight: 800, color: "#FFFFFF", fontSize: 16 }}>Auto-Génération IA</div>
                    <div style={{ color: "#DBEAFE", fontSize: 13 }}>Décris un concept complexe, Claude crée la fiche complète.</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <input 
                    value={aiPrompt} 
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !aiLoading && handleAIGenerate()}
                    style={s.aiInputDark} 
                    placeholder='Ex: "Différence entre interface et classe abstraite en Java", "Idiome: To bite the bullet"...' 
                  />
                  <button className="hov btn-glow" onClick={handleAIGenerate} disabled={aiLoading} style={s.aiBtnLight}>
                    {aiLoading ? <span style={{ animation: "pulse 1s infinite" }}>⏳ Création...</span> : "Générer la magie"}
                  </button>
                </div>
              </div>
            )}

            {/* ── MODE BATCH ─── */}
            {addSubView === "batch" && !editingId && (
              <div style={{ ...s.aiGodBlock, background: "linear-gradient(135deg, #0F172A 0%, #1D4ED8 50%, #059669 100%)" }}>
                <div style={s.aiHeader}>
                  <span style={{ fontSize: 32, textShadow: "0 0 20px rgba(255,255,255,0.6)" }}>🚀</span>
                  <div>
                    <div style={{ fontWeight: 800, color: "#FFFFFF", fontSize: 16 }}>Génération en Rafale</div>
                    <div style={{ color: "#DBEAFE", fontSize: 13 }}>Décris un sujet, Claude génère plusieurs fiches d'un coup couvrant différents angles.</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                  <input 
                    value={aiPrompt} 
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !aiBatchLoading && handleAIBatchGenerate()}
                    style={{ ...s.aiInputDark, flex: 1, minWidth: 200 }} 
                    placeholder='Ex: "Annotations Spring Boot", "Present perfect en anglais", "Algorithmes de tri"...' 
                  />
                  <select value={aiBatchCount} onChange={e => setAiBatchCount(+e.target.value)}
                    style={{ padding: "14px 16px", background: "#1e3a8a", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 14, color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    {[3, 5, 7, 10].map(n => <option key={n} value={n} style={{ background: "#1e3a8a", color: "white" }}>{n} fiches</option>)}
                  </select>
                  <button className="hov btn-glow" onClick={handleAIBatchGenerate} disabled={aiBatchLoading || !aiPrompt.trim()} style={s.aiBtnLight}>
                    {aiBatchLoading ? <span style={{ animation: "pulse 1s infinite" }}>⏳ Génération...</span> : `🚀 Générer ×${aiBatchCount}`}
                  </button>
                </div>

                {/* Aperçu batch */}
                {showBatchPreview && batchPreview.length > 0 && (
                  <div style={{ marginTop: 20, background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: "20px", border: "1px solid rgba(255,255,255,0.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <div style={{ color: "white", fontWeight: 800, fontSize: 14 }}>📋 {batchPreview.length} fiches prêtes — vérifie avant de sauvegarder</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { setBatchPreview([]); setShowBatchPreview(false); }} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Annuler</button>
                        <button className="hov btn-glow" onClick={confirmBatch} style={{ background: "#10B981", border: "none", color: "white", borderRadius: 10, padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                          ✅ Sauvegarder {batchPreview.length} fiches
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 380, overflowY: "auto" }}>
                      {batchPreview.map((card, idx) => (
                        <div key={idx} style={{ background: "white", borderRadius: 14, padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, color: "#1D4ED8", fontSize: 14, marginBottom: 6 }}>{card.front}</div>
                            <div style={{ color: "#4B5563", fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>{card.back}</div>
                            {card.example && <div style={{ color: "#6B7A99", fontSize: 12, fontStyle: "italic", borderLeft: "3px solid #3B82F6", paddingLeft: 8 }}>{card.example}</div>}
                          </div>
                          <button onClick={() => removeBatchCard(idx)} style={{ background: "#FEF2F2", border: "none", borderRadius: 8, padding: "6px 10px", color: "#EF4444", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MODE DEPUIS UN TEXTE ─── */}
            {addSubView === "text" && !editingId && (
              <div style={{ ...s.aiGodBlock, background: "linear-gradient(135deg, #312E81 0%, #4338CA 50%, #7B5FF5 100%)" }}>
                <div style={s.aiHeader}>
                  <span style={{ fontSize: 32, textShadow: "0 0 20px rgba(255,255,255,0.6)" }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 800, color: "#FFFFFF", fontSize: 16 }}>Génération depuis un Texte</div>
                    <div style={{ color: "#DBEAFE", fontSize: 13 }}>Colle un cours, article ou extrait — Claude extrait les concepts clés et crée les fiches.</div>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ marginBottom: 8 }}>
                    <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                      style={{ padding: "12px 16px", background: "#312E81", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", width: "100%" }}>
                      {catNames.map(c => <option key={c} value={c} style={{ background: "#312E81", color: "white" }}>{c}</option>)}
                    </select>
                  </div>
                  <textarea
                    value={aiFromText}
                    onChange={e => setAiFromText(e.target.value)}
                    style={{ ...s.aiInputDark, width: "100%", minHeight: 140, resize: "vertical", fontFamily: "'Sora', sans-serif", lineHeight: 1.6 }}
                    placeholder="Colle ici un extrait de cours, un article, des notes de classe, une documentation... (max ~3000 caractères)"
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{aiFromText.length}/3000 caractères</span>
                    <button className="hov btn-glow" onClick={handleAIFromText} disabled={aiFromTextLoading || !aiFromText.trim()} style={{ ...s.aiBtnLight, padding: "14px 24px" }}>
                      {aiFromTextLoading ? <span style={{ animation: "pulse 1s infinite" }}>⏳ Analyse...</span> : "🔍 Analyser et extraire les fiches"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={s.splitGrid}>
              
              <div style={s.formCol}>
                <div style={s.formGroup}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={s.label}>Module de destination</label>
                    <span style={s.shortcutHint}>Tab ⇥</span>
                  </div>
                  <select 
                    value={addForm.category} 
                    onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} 
                    style={s.selectGod}
                  >
                    {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div style={s.formGroup}>
                  <label style={s.label}>Recto <span style={{ color: "#3B82F6" }}>*</span></label>
                  <div style={s.inputWrapper}>
                    <input 
                      autoFocus 
                      value={addForm.front} 
                      onChange={(e) => setAddForm((f) => ({ ...f, front: e.target.value }))}
                      style={s.inputGod} 
                      placeholder="Le concept à mémoriser..." 
                    />
                    <button 
                      onClick={() => listening === "front" ? stopVoice() : startVoice("front")}
                      style={{ ...s.micBtnGod, color: listening === "front" ? "#EF4444" : "#6B7A99" }}
                      className={listening === "front" ? "mic-pulse" : "hov"}
                      title="Dictée Vocale"
                    >
                      🎙️
                    </button>
                  </div>
                </div>

                <div style={s.formGroup}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={s.label}>Verso <span style={{ color: "#3B82F6" }}>*</span></label>
                    <button 
                      onClick={() => handleMicroAI("back")} 
                      style={s.microAIBtn} title="Demander à l'IA d'expliquer le Recto"
                      disabled={aiLoading}
                    >
                      ✨ Expliquer
                    </button>
                  </div>
                  <div style={s.inputWrapper}>
                    <textarea 
                      value={addForm.back} 
                      onChange={(e) => setAddForm((f) => ({ ...f, back: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); handleAdd(); }
                      }}
                      style={{ ...s.inputGod, minHeight: 110, resize: "vertical" }} 
                      placeholder="L'explication claire et concise..." 
                    />
                  </div>
                </div>

                <div style={s.formGroup}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={s.label}>Exemple (Optionnel)</label>
                    <button 
                      onClick={() => handleMicroAI("example")} 
                      style={s.microAIBtn} title="Générer un exemple de code ou de phrase"
                      disabled={aiLoading}
                    >
                      💡 Exemple IA
                    </button>
                  </div>
                  <input 
                    value={addForm.example} 
                    onChange={(e) => setAddForm((f) => ({ ...f, example: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); handleAdd(); }
                    }}
                    style={s.inputGod} 
                    placeholder="Mise en contexte, extrait de code..." 
                  />
                </div>

                <div style={s.actionRow}>
                  <button 
                    className="hov btn-glow" 
                    onClick={handleAdd} 
                    style={s.btnGodPrimary}
                    disabled={!addForm.front.trim() || !addForm.back.trim()}
                  >
                    {editingId ? "💾 Mettre à jour" : "⚡ Ajouter la fiche"}
                    <span style={s.kbdDark}>Ctrl + ↵</span>
                  </button>
                  {!editingId && (
                    <button className="hov" onClick={() => setAddForm((f) => ({ ...f, front: "", back: "", example: "" }))} style={s.btnGodSecondary}>
                      Effacer
                    </button>
                  )}
                </div>
              </div>

              <div style={s.previewCol}>
                <div style={s.previewLabel}>LIVE PREVIEW</div>
                
                <div style={s.liveCard}>
                  <div style={s.cardTop}>
                    <span style={s.catTag}>{addForm.category || "Catégorie"}</span>
                    <span style={s.easeTag}>Niveau 0</span>
                  </div>
                  
                  <div style={s.cardQ}>
                    <div style={s.cardQLabel}>QUESTION</div>
                    <div style={{ ...s.cardQText, color: addForm.front ? "#1D4ED8" : "#9CA3AF" }}>
                      {addForm.front || "Tape un concept..."}
                    </div>
                  </div>
                  
                  <div style={s.cardA}>
                    <div style={s.cardALabel}>RÉPONSE</div>
                    <div style={{ ...s.cardAText, color: addForm.back ? "#1F2937" : "#9CA3AF" }}>
                      {addForm.back || "Tape la réponse ici..."}
                    </div>
                    
                    {(addForm.example || editingId) && (
                      <div style={s.cardEx}>
                        <span style={{ color: "#4F8EF7", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>// exemple</span><br />
                        <span style={{ color: addForm.example ? "#4B5563" : "#9CA3AF" }}>
                          {addForm.example || "L'exemple s'affichera ici..."}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={s.quickImportBox}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#4B5563" }}>📤 Import en masse (JSON/CSV)</span>
                    <button className="hov" onClick={() => setShowImport(!showImport)} style={s.btnTiny}>
                      {showImport ? "Fermer" : "Ouvrir"}
                    </button>
                  </div>
                  {showImport && (
                    <div style={{ marginTop: 12, animation: "fadeUp 0.3s ease" }}>
                      <textarea 
                        value={importText} 
                        onChange={(e) => setImportText(e.target.value)}
                        style={{ ...s.inputGod, minHeight: 80, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
                        placeholder="Colle ton CSV ici (front,back,category,example)..." 
                      />
                      <button className="hov" onClick={handleImport} style={{...s.btnGodPrimary, width: "100%", padding: "10px", marginTop: 8}}>
                        Importer
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            LISTE DES FICHES GOD TIER (BENTO GRID + SMART FILTERS)
        ════════════════════════════════════════════════════════════════ */}
        {view === "list" && (
          <div style={s.fadeIn}>
            
            {/* Header God Tier */}
            <div style={s.listHeaderGod}>
              <div style={{ flex: 1 }}>
                <h1 style={s.pageTitle}>◈ Bibliothèque de Savoir</h1>
                <p style={s.pageSub}>Explore, recherche et affine tes connaissances.</p>
              </div>
              <div style={s.listStatsRow}>
                <div style={s.listStatBox}>
                  <div style={s.listStatVal}>{filteredExps.length}</div>
                  <div style={s.listStatLabel}>Fiche{filteredExps.length > 1 ? "s" : ""}</div>
                </div>
                <div style={s.listStatBox}>
                  <div style={{ ...s.listStatVal, color: "#10B981" }}>{masteredCount}</div>
                  <div style={s.listStatLabel}>Maîtrisées</div>
                </div>
                <div style={s.listStatBox}>
                  <div style={{ ...s.listStatVal, color: "#EF4444" }}>
                    {expressions.filter((e) => e.nextReview <= today() && e.level < 7).length}
                  </div>
                  <div style={s.listStatLabel}>À réviser</div>
                </div>
              </div>
            </div>

            {/* Barre de contrôle intelligente (Toolbar) */}
            <div style={s.toolbarGod}>
              <div style={s.searchBoxGod}>
                <span style={{ fontSize: 18, color: "#6B7A99" }}>🔍</span>
                <input 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={s.searchFieldGod} 
                  placeholder="Chercher dans les concepts, définitions, exemples..." 
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} style={s.clearSearchBtn}>✕</button>
                )}
              </div>
              
              <div style={s.filtersContainer}>
                <div style={s.filterScroll}>
                  {["Toutes", ...catNames].map((c) => (
                    <button 
                      key={c} 
                      onClick={() => setFilterCat(c)}
                      style={{ 
                        ...s.chipGod, 
                        background: filterCat === c ? "#1D4ED8" : "white", 
                        color: filterCat === c ? "white" : "#4B5563",
                        border: filterCat === c ? "1px solid #1D4ED8" : "1px solid #DBEAFE"
                      }}
                      className="hov"
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div style={s.filterScroll}>
                  {["Tous", "Nouvelles", "En retard", "Maîtrisées"].map((l) => (
                    <button 
                      key={l} 
                      onClick={() => setFilterLevel(l)}
                      style={{ 
                        ...s.chipLevelGod, 
                        background: filterLevel === l ? "#F5F3FF" : "transparent",
                        color: filterLevel === l ? "#7B5FF5" : "#6B7A99",
                        fontWeight: filterLevel === l ? 800 : 600
                      }}
                      className="hov"
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredExps.length === 0 ? (
              <div style={s.emptyStateGod}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
                <h3 style={{ color: "#1F2937", fontSize: 20, fontWeight: 800 }}>Aucune fiche trouvée</h3>
                <p style={{ color: "#6B7A99", marginTop: 8, marginBottom: 24 }}>Élargis ta recherche ou crée un nouveau concept.</p>
                <button onClick={() => setView("add")} style={s.btnGodPrimary} className="hov btn-glow">
                  ⚡ Créer une fiche
                </button>
              </div>
            ) : (
              <div style={s.godGrid}>
                {filteredExps.map((exp) => {
                  const lvl = exp.level || 0;
                  const lvlColor = lvl >= 7 ? "#10B981" : lvl >= 5 ? "#3B82F6" : lvl >= 3 ? "#8B5CF6" : lvl >= 1 ? "#F59E0B" : "#9CA3AF";
                  const catObj = categories.find((c) => c.name === exp.category);
                  const catColor = catObj?.color || "#3B82F6";
                  
                  return (
                    <div key={exp.id} style={{ ...s.godCard, borderTop: `4px solid ${catColor}` }} className="card-hov">
                      <div style={s.godCardHeader}>
                        <span style={{ ...s.catTagGod, background: catColor + "15", color: catColor }}>
                          {exp.category}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }} title={`Niveau: ${levelLabel[lvl]}`}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: lvlColor, boxShadow: `0 0 8px ${lvlColor}88` }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7A99", fontFamily: "'JetBrains Mono', monospace" }}>
                            N{lvl}
                          </span>
                        </div>
                      </div>
                      
                      <div style={s.godCardBody}>
                        <div style={s.godFront}>{exp.front}</div>
                        <div style={s.godBack}>{exp.back}</div>
                        {exp.example && (
                          <div style={s.godExample}>
                            <span style={{ color: "#3B82F6", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>// exemple</span><br />
                            {exp.example}
                          </div>
                        )}
                      </div>

                      <div style={s.godCardFooter}>
                        <div style={s.godCardMeta}>
                          <div>
                            {lvl >= 7 ? "✅ Maîtrisée" : `📅 Rév: ${formatDate(exp.nextReview)}`}
                          </div>
                          <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 2 }}>
                            {exp.easeFactor && `EF: ${exp.easeFactor} `}
                            {(exp.reviewHistory?.length || 0) > 0 && `• ${exp.reviewHistory.length} Rév.`}
                          </div>
                        </div>
                        
                        <div style={s.godCardActions}>
                          <button 
                            onClick={() => { startEdit(exp); setAiPrompt(exp.front); }} 
                            style={{ ...s.actionBtnGod, background: "#F5F3FF", color: "#8B5CF6" }} 
                            className="hov" 
                            title="Améliorer avec l'IA"
                          >✨</button>
                          <button 
                            onClick={() => startEdit(exp)} 
                            style={{ ...s.actionBtnGod, background: "#EFF6FF", color: "#3B82F6" }} 
                            className="hov" 
                            title="Éditer"
                          >✏️</button>
                          <button 
                            onClick={() => deleteExp(exp.id)} 
                            style={{ ...s.actionBtnGod, background: "#FEF2F2", color: "#EF4444" }} 
                            className="hov" 
                            title="Supprimer"
                          >🗑️</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODULES / CATÉGORIES
        ════════════════════════════════════════════════════════════════ */}
        {view === "categories" && (
          <div style={s.fadeIn}>
            <h1 style={s.pageTitle}>◉ Modules académiques</h1>
            <p style={s.pageSub}>Organise par matière avec date d'examen et objectifs</p>

            <div style={s.formCard}>
              <h3 style={{ color: "#1F2937", fontWeight: 700, marginBottom: 16 }}>Nouveau module</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={s.formGroup}>
                  <label style={s.label}>Nom du module</label>
                  <input value={newCat.name} onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))}
                    style={s.input} placeholder="Ex: 🗄️ Bases de données" />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Date d'examen</label>
                  <input type="date" value={newCat.examDate} onChange={(e) => setNewCat((c) => ({ ...c, examDate: e.target.value }))} style={s.input} />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Objectif maîtrise (%)</label>
                  <input type="number" min={50} max={100} value={newCat.targetScore} onChange={(e) => setNewCat((c) => ({ ...c, targetScore: +e.target.value }))} style={s.input} />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Priorité</label>
                  <select value={newCat.priority} onChange={(e) => setNewCat((c) => ({ ...c, priority: e.target.value }))} style={s.select}>
                    <option value="haute">🔴 Haute</option>
                    <option value="normale">🟡 Normale</option>
                    <option value="faible">🟢 Faible</option>
                  </select>
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Couleur du module</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["#4F8EF7", "#F0A040", "#40C080", "#7B5FF5", "#F04040", "#40C0C0", "#F0C040", "#C040F0"].map((color) => (
                      <button key={color} onClick={() => setNewCat((c) => ({ ...c, color }))}
                        style={{ width: 28, height: 28, borderRadius: 8, background: color, border: newCat.color === color ? "3px solid black" : "2px solid transparent", cursor: "pointer" }} />
                    ))}
                  </div>
                </div>
              </div>
              <button className="hov" onClick={handleAddCat} style={s.btnPrimary}>Créer le module</button>
            </div>

            <div style={s.catDetailGrid}>
              {categories.map((cat) => {
                const catExps = expressions.filter((e) => e.category === cat.name);
                const mastered = catExps.filter((e) => e.level >= 7).length;
                const pct = catExps.length ? Math.round((mastered / catExps.length) * 100) : 0;
                const daysToExam = cat.examDate ? Math.ceil((new Date(cat.examDate) - new Date()) / 86400000) : null;
                const priorityColor = cat.priority === "haute" ? "#F04040" : cat.priority === "normale" ? "#F0A040" : "#40C080";
                const catColor = cat.color || "#4F8EF7";
                return (
                  <div key={cat.name} style={{ ...s.catDetailCard, borderTop: `3px solid ${catColor}` }} className="card-hov">
                    <div style={s.catDetailHeader}>
                      <span style={s.catDetailName}>{cat.name}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ ...s.priorityTag, background: priorityColor + "22", color: priorityColor }}>{cat.priority}</span>
                        <button onClick={() => { if (window.confirm(`Supprimer "${cat.name}" et toutes ses fiches ?`)) deleteCategory(cat.name); }}
                          style={s.delBtn} className="hov" title="Supprimer le module">🗑️</button>
                      </div>
                    </div>
                    {daysToExam !== null && (
                      <div style={{ ...s.examBadge, marginBottom: 10, background: daysToExam <= 7 ? "#FEE2E2" : "#EFF6FF", color: daysToExam <= 7 ? "#F04040" : catColor }}>
                        📅 {daysToExam > 0 ? `Examen dans ${daysToExam} jours` : "Examen aujourd'hui !"} — {formatDate(cat.examDate)}
                      </div>
                    )}
                    <div style={{ marginBottom: 8, fontSize: 13, color: "#6B7A99" }}>
                      Objectif: <strong style={{ color: catColor }}>{cat.targetScore}%</strong> · Actuel: <strong style={{ color: pct >= cat.targetScore ? "#40C080" : "#F0A040" }}>{pct}%</strong>
                    </div>
                    <div style={{ position: "relative" }}>
                      <div style={s.progressTrack}>
                        <div style={{ ...s.progressFill, width: `${pct}%`, background: pct >= cat.targetScore ? "linear-gradient(90deg,#40C080,#60E0A0)" : `linear-gradient(90deg,${catColor},${catColor}99)` }} />
                      </div>
                      {cat.targetScore < 100 && (
                        <div style={{ position: "absolute", left: `${cat.targetScore}%`, top: 0, bottom: 0, width: 2, background: "#F0A040" }} />
                      )}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, color: "#6B7A99" }}>{catExps.length} fiches · {mastered} maîtrisées</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODE EXAMEN — GOD TIER EDITION
        ════════════════════════════════════════════════════════════════ */}
        {view === "exam" && (
          <div style={s.fadeIn}>

            {/* ── HOME EXAMEN ──────────────────────────────────────────── */}
            {examSubView === "home" && (
              <div>
                {/* Hero */}
                <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #1D4ED8 60%, #7B5FF5 100%)", borderRadius: 28, padding: "40px 36px", marginBottom: 32, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -30, right: -30, fontSize: 180, opacity: 0.05 }}>🎯</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#93C5FD", letterSpacing: 3, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>CENTRE D'EXAMENS</div>
                  <h1 style={{ fontSize: 34, fontWeight: 900, color: "white", marginBottom: 10, letterSpacing: "-1px" }}>
                    Prouve ta maîtrise 🏆
                  </h1>
                  <p style={{ color: "#93C5FD", fontSize: 15, marginBottom: 28, maxWidth: 520, lineHeight: 1.6 }}>
                    3 modes d'examen pour forger tes connaissances comme de l'acier. La difficulté est la mère du progrès.
                  </p>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 20px", color: "white", fontSize: 13, fontWeight: 700, backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.15)" }}>
                      🎯 {stats.examsDone} examen{stats.examsDone !== 1 ? "s" : ""} passé{stats.examsDone !== 1 ? "s" : ""}
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 20px", color: "white", fontSize: 13, fontWeight: 700, backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.15)" }}>
                      📚 {expressions.length} fiches disponibles
                    </div>
                  </div>
                </div>

                {/* 3 Modes */}
                <h2 style={{ ...s.sectionTitle, marginTop: 0 }}>CHOISIR UN MODE D'EXAMEN</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 36 }}>
                  {[
                    { mode: "flashcard", icon: "🃏", title: "Flashcard Chrono", sub: "Mode Classique IA", desc: "Questions recto/verso avec timer. Auto-évaluation honnête. Le mode qui forge les champions.", color: "#1D4ED8", bg: "linear-gradient(135deg,#EFF6FF,#DBEAFE)", border: "#BFDBFE" },
                    { mode: "qcm", icon: "📝", title: "QCM Intelligent", sub: "IA génère les pièges", desc: "L'IA crée 3 mauvaises réponses plausibles pour chaque question. Le vrai test de compréhension.", color: "#7B5FF5", bg: "linear-gradient(135deg,#F5F3FF,#EDE9FE)", border: "#DDD6FE" },
                    { mode: "custom", icon: "🛠️", title: "Examens Perso", sub: "Tes propres questions", desc: "Crée et passe des examens entièrement personnalisés. Parfait pour simuler les vrais examens.", color: "#059669", bg: "linear-gradient(135deg,#ECFDF5,#D1FAE5)", border: "#A7F3D0" },
                  ].map(m => (
                    <div key={m.mode} onClick={() => { if (m.mode === "custom") setExamSubView("custom"); else { setExamConfig(c => ({...c, mode: m.mode})); setExamSubView("config"); } }}
                      style={{ background: m.bg, border: `2px solid ${m.border}`, borderRadius: 24, padding: "28px", cursor: "pointer", transition: "all 0.25s", position: "relative", overflow: "hidden" }}
                      className="card-hov">
                      <div style={{ fontSize: 40, marginBottom: 12 }}>{m.icon}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: m.color, letterSpacing: 2, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>{m.sub}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#1F2937", marginBottom: 8 }}>{m.title}</div>
                      <div style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>{m.desc}</div>
                      <div style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 8, background: m.color, color: "white", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700 }}>
                        Lancer →
                      </div>
                    </div>
                  ))}
                </div>

                {/* Historique rapide */}
                {stats.examsDone > 0 && (
                  <div style={{ background: "white", border: "1px solid #EFF6FF", borderRadius: 22, padding: "24px", boxShadow: "0 4px 15px rgba(29,78,216,0.04)" }}>
                    <div style={{ fontWeight: 800, color: "#1F2937", marginBottom: 8 }}>📊 Tes statistiques d'examen</div>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      {[
                        { label: "Examens passés", val: stats.examsDone, color: "#1D4ED8" },
                        { label: "Fiches maîtrisées", val: expressions.filter(e=>e.level>=7).length, color: "#10B981" },
                        { label: "Fiches à risque", val: expressions.filter(e=>e.easeFactor<=1.8 && e.level<7).length, color: "#EF4444" },
                      ].map((st,i) => (
                        <div key={i} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 28, fontWeight: 900, color: st.color }}>{st.val}</div>
                          <div style={{ fontSize: 12, color: "#6B7A99", fontWeight: 600 }}>{st.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CONFIG EXAMEN ────────────────────────────────────────── */}
            {examSubView === "config" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <button onClick={() => setExamSubView("home")} style={s.backBtn}>← Retour</button>
                  <h1 style={{ ...s.pageTitle, margin: 0 }}>
                    {examConfig.mode === "qcm" ? "📝 Configuration QCM" : "🃏 Configuration Flashcard"}
                  </h1>
                </div>

                <div style={s.formCard}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginBottom: 24 }}>
                    <div style={s.formGroup}>
                      <label style={s.label}>📚 Module</label>
                      <select value={examConfig.category} onChange={(e) => setExamConfig((c) => ({ ...c, category: e.target.value }))} style={s.select}>
                        <option value="Toutes">Toutes les matières</option>
                        <option disabled>──────────</option>
                        {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={s.formGroup}>
                      <label style={s.label}>🔢 Nombre de questions</label>
                      <input type="number" min={3} max={50} value={examConfig.count} onChange={(e) => setExamConfig((c) => ({ ...c, count: +e.target.value }))} style={s.input} />
                    </div>
                    <div style={s.formGroup}>
                      <label style={s.label}>⏱️ Temps par question (sec)</label>
                      <input type="number" min={10} max={300} value={examConfig.timePerCard} onChange={(e) => setExamConfig((c) => ({ ...c, timePerCard: +e.target.value }))} style={s.input} />
                    </div>
                  </div>

                  {/* Difficulté */}
                  <div style={s.formGroup}>
                    <label style={s.label}>🔥 Niveau de difficulté</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
                      {[
                        { val: "facile", icon: "😌", label: "Facile", desc: "Fiches déjà bien maîtrisées", color: "#10B981" },
                        { val: "adaptative", icon: "🎯", label: "Adaptative", desc: "Toutes les fiches", color: "#3B82F6" },
                        { val: "difficile", icon: "💪", label: "Difficile", desc: "Fiches fragiles seulement", color: "#F59E0B" },
                        { val: "extreme", icon: "💀", label: "EXTRÊME", desc: "Tes points les plus faibles", color: "#EF4444" },
                      ].map(d => (
                        <div key={d.val} onClick={() => setExamConfig(c => ({...c, difficulty: d.val}))}
                          style={{ border: `2px solid ${examConfig.difficulty === d.val ? d.color : "#EFF6FF"}`, borderRadius: 16, padding: "14px", cursor: "pointer", background: examConfig.difficulty === d.val ? d.color + "15" : "white", transition: "all 0.2s", textAlign: "center" }}>
                          <div style={{ fontSize: 22, marginBottom: 4 }}>{d.icon}</div>
                          <div style={{ fontWeight: 800, fontSize: 13, color: examConfig.difficulty === d.val ? d.color : "#1F2937" }}>{d.label}</div>
                          <div style={{ fontSize: 11, color: "#6B7A99", marginTop: 2 }}>{d.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Info selon mode */}
                  <div style={{ ...s.infoBox, background: examConfig.mode === "qcm" ? "#F5F3FF" : "#EFF6FF", border: `1px solid ${examConfig.mode === "qcm" ? "#DDD6FE" : "#DBEAFE"}`, marginBottom: 20 }}>
                    <span style={{ fontSize: 20 }}>{examConfig.mode === "qcm" ? "🤖" : "ℹ️"}</span>
                    <div>
                      <strong style={{ color: "#1F2937" }}>
                        {examConfig.mode === "qcm" ? "Mode QCM Intelligent" : "Mode Flashcard Classique"}
                      </strong>
                      <p style={{ color: "#6B7A99", fontSize: 13, marginTop: 4 }}>
                        {examConfig.mode === "qcm"
                          ? "L'IA génère des fausses réponses plausibles pour tester ta vraie compréhension. Ce mode prend quelques secondes par question pour préparer les distracteurs."
                          : "Mode pur d'auto-évaluation. Les fiches NE sont PAS mises à jour par SM-2. Utilise la révision normale pour l'apprentissage continu."}
                      </p>
                    </div>
                  </div>

                  <button className="hov btn-glow" onClick={() => startExam()} style={{ ...s.btnPrimary, padding: "18px 36px", fontSize: 16, width: "100%", textAlign: "center" }}>
                    🚀 Lancer l'examen · {examConfig.count} questions · {examConfig.difficulty}
                  </button>
                </div>
              </div>
            )}

            {/* ── EXAMEN ACTIF ─────────────────────────────────────────── */}
            {examSubView === "active" && examActive && examQueue[examIndex] && (() => {
              const card = examQueue[examIndex];
              const isQcmMode = examConfig.mode === "qcm" || (card.isCustom && card.isQcm);
              const timerPct = (examTimer / examConfig.timePerCard) * 100;
              const timerDanger = examTimer <= 10;
              return (
                <div style={s.fadeIn}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                    <button onClick={() => { clearInterval(examTimerRef.current); setExamActive(false); setExamSubView("home"); setExamAnswers([]); setExamQueue([]); }} style={s.backBtn}>✕ Abandonner</button>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {examStreak >= 3 && (
                        <div style={{ background: "#FEF3C7", color: "#92400E", padding: "6px 12px", borderRadius: 10, fontSize: 12, fontWeight: 800, animation: "pulse 1s infinite" }}>
                          🔥 Streak ×{examStreak}
                        </div>
                      )}
                      <div style={s.reviewProgress}>
                        <span style={{ color: "#4F8EF7", fontWeight: 800 }}>{examIndex + 1}</span>
                        <span style={{ color: "#6B7A99" }}> / {examQueue.length}</span>
                      </div>
                      <div style={{ ...s.timerBadge, background: timerDanger ? "#FEE2E2" : "#EFF6FF", color: timerDanger ? "#EF4444" : "#1D4ED8", animation: examTimer <= 5 ? "pulse 0.5s infinite" : "none", fontWeight: 900 }}>
                        ⏱ {examTimer}s
                      </div>
                    </div>
                  </div>

                  {/* Barre de progression timer */}
                  <div style={{ height: 8, background: "#DBEAFE", borderRadius: 4, marginBottom: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${timerPct}%`, background: timerDanger ? "linear-gradient(90deg,#EF4444,#F97316)" : "linear-gradient(90deg,#1D4ED8,#7B5FF5)", borderRadius: 4, transition: "width 1s linear, background 0.3s" }} />
                  </div>
                  {/* Barre progression globale */}
                  <div style={{ height: 4, background: "#EFF6FF", borderRadius: 4, marginBottom: 28, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${((examIndex) / examQueue.length) * 100}%`, background: "linear-gradient(90deg,#10B981,#3B82F6)", borderRadius: 4, transition: "width 0.4s ease" }} />
                  </div>

                  <div style={{ ...s.flashCard, maxWidth: 720 }}>
                    <div style={s.cardTop}>
                      <span style={s.catTag}>{card.category || "Examen Perso"}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {isQcmMode && <span style={{ ...s.easeTag, background: "#F5F3FF", color: "#7B5FF5" }}>📝 QCM</span>}
                        {!card.isCustom && <span style={s.easeTag}>Q{examIndex + 1}</span>}
                      </div>
                    </div>

                    <div style={s.cardQ}>
                      <div style={s.cardQLabel}>QUESTION {examConfig.difficulty === "extreme" ? "💀 EXTRÊME" : examConfig.difficulty === "difficile" ? "💪 DIFFICILE" : ""}</div>
                      <div style={s.cardQText}>{card.front || card.question}</div>
                    </div>

                    {/* MODE QCM */}
                    {isQcmMode && (
                      <div>
                        {qcmLoading ? (
                          <div style={{ textAlign: "center", padding: "28px", color: "#7B5FF5" }}>
                            <div style={{ fontSize: 28, animation: "pulse 1s infinite", display: "inline-block", marginBottom: 8 }}>🤖</div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>L'IA prépare tes pièges...</div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                            {qcmChoices.map((choice, ci) => {
                              const isCorrect = choice === (card.back || card.answer);
                              const isSelected = qcmSelected === ci;
                              let bg = "white", border = "2px solid #EFF6FF", color = "#1F2937";
                              if (isSelected && isCorrect) { bg = "#D1FAE5"; border = "2px solid #10B981"; color = "#065F46"; }
                              else if (isSelected && !isCorrect) { bg = "#FEE2E2"; border = "2px solid #EF4444"; color = "#991B1B"; }
                              else if (qcmSelected !== null && isCorrect) { bg = "#D1FAE5"; border = "2px solid #10B981"; color = "#065F46"; }
                              return (
                                <button key={ci}
                                  onClick={() => {
                                    if (qcmSelected !== null) return;
                                    setQcmSelected(ci);
                                    setTimeout(() => handleExamAnswer(isCorrect ? 5 : 0), 900);
                                  }}
                                  disabled={qcmSelected !== null}
                                  style={{ background: bg, border, borderRadius: 14, padding: "16px 20px", textAlign: "left", cursor: qcmSelected !== null ? "default" : "pointer", color, fontWeight: 600, fontSize: 14, transition: "all 0.2s", fontFamily: "'Sora', sans-serif", display: "flex", alignItems: "center", gap: 12 }}>
                                  <span style={{ width: 28, height: 28, borderRadius: "50%", background: isSelected ? (isCorrect ? "#10B981" : "#EF4444") : (qcmSelected !== null && isCorrect ? "#10B981" : "#EFF6FF"), color: (isSelected || (qcmSelected !== null && isCorrect)) ? "white" : "#6B7A99", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0, transition: "all 0.2s" }}>
                                    {String.fromCharCode(65 + ci)}
                                  </span>
                                  {choice}
                                  {qcmSelected !== null && isCorrect && <span style={{ marginLeft: "auto", fontSize: 16 }}>✅</span>}
                                  {isSelected && !isCorrect && <span style={{ marginLeft: "auto", fontSize: 16 }}>❌</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* MODE FLASHCARD */}
                    {!isQcmMode && (
                      !examRevealed ? (
                        <>
                          <button className="hov btn-glow" onClick={() => setExamRevealed(true)} style={s.revealBtn}>
                            👁️ Voir la réponse <span style={{ fontSize: 12, opacity: 0.7 }}>(Espace)</span>
                          </button>
                          <div style={s.kbHint}>⌨️ <kbd style={s.kbd}>Espace</kbd> pour révéler</div>
                        </>
                      ) : (
                        <div style={{ animation: "slideIn 0.3s ease" }}>
                          <div style={s.cardA}>
                            <div style={s.cardALabel}>RÉPONSE</div>
                            <div style={s.cardAText}>{card.back || card.answer}</div>
                            {card.example && <div style={s.cardEx}><span style={{ color: "#4F8EF7", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>// exemple</span><br />{card.example}</div>}
                          </div>
                          <div style={s.answerBtns}>
                            <button className="hov" onClick={() => handleExamAnswer(0)} style={s.btnOublie}>😓 Pas su<br /><span style={{fontSize:11,opacity:0.8}}>Retour à zéro</span><span style={s.kbKey}>1</span></button>
                            <button className="hov" onClick={() => handleExamAnswer(3)} style={s.btnHesite}>🤔 Hésité<br /><span style={{fontSize:11,opacity:0.8}}>À retravailler</span><span style={s.kbKey}>2</span></button>
                            <button className="hov" onClick={() => handleExamAnswer(5)} style={s.btnFacile}>⚡ Su !<br /><span style={{fontSize:11,opacity:0.8}}>Parfait</span><span style={s.kbKey}>3</span></button>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {/* Mini scores en temps réel */}
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                    {examAnswers.map((a, i) => (
                      <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: a.q === 0 ? "#EF4444" : a.q === 3 ? "#F59E0B" : "#10B981", boxShadow: `0 0 6px ${a.q === 0 ? "#EF444466" : a.q === 3 ? "#F59E0B66" : "#10B98166"}` }} />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── RÉSULTATS ───────────────────────────────────────────── */}
            {examSubView === "results" && examAnswers.length > 0 && (() => {
              const correct = examAnswers.filter(a => a.q >= 3).length;
              const score = Math.round((correct / examAnswers.length) * 100);
              const avgTime = Math.round(examAnswers.reduce((acc, a) => acc + (a.timeSpent || 0), 0) / examAnswers.length);
              const duration = examStartTime ? Math.round((Date.now() - examStartTime) / 1000) : 0;
              const grade = score >= 90 ? { label: "LÉGENDAIRE", icon: "🏆", color: "#7B5FF5", sub: "Tu domines absolument le sujet !" }
                : score >= 80 ? { label: "EXCELLENT", icon: "⭐", color: "#10B981", sub: "Maîtrise quasi parfaite. Continue !" }
                : score >= 70 ? { label: "BIEN", icon: "👍", color: "#3B82F6", sub: "Bonne base, quelques lacunes à combler." }
                : score >= 60 ? { label: "PASSABLE", icon: "🤔", color: "#F59E0B", sub: "À retravailler sérieusement." }
                : { label: "À RETRAVAILLER", icon: "💪", color: "#EF4444", sub: "La persévérance est la clé. Tu peux le faire !" };
              const wrongAnswers = examAnswers.filter(a => a.q === 0);
              const hesitating = examAnswers.filter(a => a.q === 3);
              return (
                <div style={s.fadeIn}>
                  {/* Score hero */}
                  <div style={{ background: `linear-gradient(135deg, ${grade.color}22, ${grade.color}08)`, border: `2px solid ${grade.color}44`, borderRadius: 28, padding: "40px 32px", marginBottom: 28, textAlign: "center", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: -20, right: -20, fontSize: 120, opacity: 0.06 }}>{grade.icon}</div>
                    <div style={{ fontSize: 80, marginBottom: 8 }}>{grade.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: grade.color, letterSpacing: 3, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>{grade.label}</div>
                    <div style={{ fontSize: 80, fontWeight: 900, color: grade.color, lineHeight: 1, marginBottom: 8 }}>{score}%</div>
                    <div style={{ fontSize: 16, color: "#4B5563", fontWeight: 600, marginBottom: 4 }}>{grade.sub}</div>
                    <div style={{ fontSize: 14, color: "#9CA3AF" }}>{correct} / {examAnswers.length} réponses correctes · {Math.floor(duration/60)}m{duration%60}s</div>
                  </div>

                  {/* Stats détaillées */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 28 }}>
                    {[
                      { icon: "✅", val: correct, label: "Correctes", color: "#10B981" },
                      { icon: "❌", val: wrongAnswers.length, label: "Incorrectes", color: "#EF4444" },
                      { icon: "🤔", val: hesitating.length, label: "Hésitations", color: "#F59E0B" },
                      { icon: "⚡", val: `${avgTime}s`, label: "Temps moyen", color: "#3B82F6" },
                    ].map((st, i) => (
                      <div key={i} style={{ background: "white", border: `2px solid ${st.color}22`, borderRadius: 18, padding: "18px", textAlign: "center", boxShadow: "0 4px 15px rgba(0,0,0,0.03)" }}>
                        <div style={{ fontSize: 24, marginBottom: 4 }}>{st.icon}</div>
                        <div style={{ fontSize: 26, fontWeight: 900, color: st.color }}>{st.val}</div>
                        <div style={{ fontSize: 12, color: "#6B7A99", fontWeight: 600, marginTop: 2 }}>{st.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Points faibles */}
                  {wrongAnswers.length > 0 && (
                    <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 22, padding: "24px", marginBottom: 20 }}>
                      <div style={{ fontWeight: 800, color: "#B91C1C", marginBottom: 14, fontSize: 15 }}>❌ Points à retravailler ({wrongAnswers.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {wrongAnswers.map(({ card }, i) => (
                          <div key={i} style={{ background: "white", borderRadius: 14, padding: "14px 18px", borderLeft: "4px solid #EF4444" }}>
                            <div style={{ fontWeight: 800, color: "#1D4ED8", marginBottom: 4 }}>{card.front || card.question}</div>
                            <div style={{ fontSize: 13, color: "#4B5563" }}>{card.back || card.answer}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hésitations */}
                  {hesitating.length > 0 && (
                    <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 22, padding: "24px", marginBottom: 20 }}>
                      <div style={{ fontWeight: 800, color: "#92400E", marginBottom: 14, fontSize: 15 }}>🤔 Hésitations à consolider ({hesitating.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {hesitating.map(({ card }, i) => (
                          <div key={i} style={{ background: "white", borderRadius: 12, padding: "12px 16px", borderLeft: "4px solid #F59E0B" }}>
                            <div style={{ fontWeight: 700, color: "#1D4ED8", fontSize: 13 }}>{card.front || card.question}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button className="hov btn-glow" onClick={() => { setExamAnswers([]); setExamQueue([]); setExamSubView("config"); }} style={{ ...s.btnPrimary, flex: 1 }}>🔄 Recommencer</button>
                    <button className="hov" onClick={() => { setExamAnswers([]); setExamQueue([]); setExamSubView("home"); }} style={{ ...s.btnSecondary, flex: 1 }}>🏠 Accueil Examens</button>
                    <button className="hov" onClick={() => startReview()} style={{ ...s.btnSecondary, flex: 1 }} disabled={todayReviews.length === 0}>
                      📋 Réviser ({todayReviews.length})
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ── EXAMENS PERSONNALISÉS ────────────────────────────────── */}
            {examSubView === "custom" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <button onClick={() => setExamSubView("home")} style={s.backBtn}>← Retour</button>
                    <h1 style={{ ...s.pageTitle, margin: 0 }}>🛠️ Mes Examens Perso</h1>
                  </div>
                  <button onClick={() => { setNewCustomExam({ title: "", description: "", questions: [] }); setExamSubView("createCustom"); }} style={{ ...s.btnPrimary, display: "flex", alignItems: "center", gap: 8 }} className="hov btn-glow">
                    + Créer un examen
                  </button>
                </div>

                {customExams.length === 0 ? (
                  <div style={s.emptyStateGod}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>📋</div>
                    <h3 style={{ color: "#1F2937", fontSize: 20, fontWeight: 800 }}>Aucun examen créé</h3>
                    <p style={{ color: "#6B7A99", marginTop: 8, marginBottom: 24 }}>Crée tes propres examens avec des questions personnalisées ou des QCM.</p>
                    <button onClick={() => { setNewCustomExam({ title: "", description: "", questions: [] }); setExamSubView("createCustom"); }} style={s.btnGodPrimary} className="hov btn-glow">
                      + Créer mon premier examen
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
                    {customExams.map((exam, i) => (
                      <div key={exam.id} style={{ background: "white", border: "1px solid #EFF6FF", borderRadius: 22, padding: "24px", boxShadow: "0 4px 15px rgba(29,78,216,0.04)", borderTop: "4px solid #7B5FF5" }} className="card-hov">
                        <div style={{ fontWeight: 900, color: "#1F2937", fontSize: 18, marginBottom: 6 }}>{exam.title}</div>
                        {exam.description && <div style={{ color: "#6B7A99", fontSize: 13, marginBottom: 12 }}>{exam.description}</div>}
                        <div style={{ fontSize: 12, color: "#7B5FF5", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>
                          {exam.questions.length} question{exam.questions.length !== 1 ? "s" : ""} · {exam.questions.filter(q=>q.isQcm).length} QCM
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setSelectedCustomExam(exam); startExam(exam); }} style={{ ...s.btnPrimary, flex: 1, textAlign: "center" }} className="hov">🚀 Passer</button>
                          <button onClick={() => { setCustomExams(prev => prev.filter(e => e.id !== exam.id)); showToast("Examen supprimé.", "info"); }} style={{ ...s.btnGodSecondary, padding: "10px 14px" }} className="hov">🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── CRÉER EXAMEN PERSO ───────────────────────────────────── */}
            {examSubView === "createCustom" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <button onClick={() => setExamSubView("custom")} style={s.backBtn}>← Retour</button>
                  <h1 style={{ ...s.pageTitle, margin: 0 }}>✍️ Créer un examen</h1>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" }}>
                  {/* Formulaire */}
                  <div>
                    <div style={s.formCard}>
                      <div style={s.formGroup}>
                        <label style={s.label}>📌 Titre de l'examen</label>
                        <input value={newCustomExam.title} onChange={e => setNewCustomExam(ex => ({...ex, title: e.target.value}))} style={s.input} placeholder="ex: Contrôle Java Spring Boot" />
                      </div>
                      <div style={s.formGroup}>
                        <label style={s.label}>📝 Description (optionnel)</label>
                        <input value={newCustomExam.description} onChange={e => setNewCustomExam(ex => ({...ex, description: e.target.value}))} style={s.input} placeholder="ex: Chapitre 3 — Annotations Spring" />
                      </div>
                    </div>

                    {/* Ajouter une question */}
                    <div style={{ ...s.formCard, marginTop: 20 }}>
                      <div style={{ fontWeight: 800, color: "#1F2937", marginBottom: 16 }}>
                        ➕ Ajouter une question
                      </div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                        {[{ val: false, label: "🃏 Flashcard" }, { val: true, label: "📝 QCM" }].map(t => (
                          <button key={String(t.val)} onClick={() => setCustomExamEditQ(q => ({...q, isQcm: t.val}))}
                            style={{ flex: 1, padding: "10px", borderRadius: 12, border: `2px solid ${customExamEditQ.isQcm === t.val ? "#7B5FF5" : "#EFF6FF"}`, background: customExamEditQ.isQcm === t.val ? "#F5F3FF" : "white", color: customExamEditQ.isQcm === t.val ? "#7B5FF5" : "#6B7A99", fontWeight: 700, cursor: "pointer", fontSize: 13, transition: "all 0.2s" }}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <div style={s.formGroup}>
                        <label style={s.label}>Question</label>
                        <input value={customExamEditQ.question} onChange={e => setCustomExamEditQ(q => ({...q, question: e.target.value}))} style={s.input} placeholder="Quelle annotation Spring crée un bean ?" />
                      </div>
                      <div style={s.formGroup}>
                        <label style={s.label}>Réponse correcte</label>
                        <input value={customExamEditQ.answer} onChange={e => setCustomExamEditQ(q => ({...q, answer: e.target.value}))} style={s.input} placeholder="@Component, @Service, @Repository..." />
                      </div>
                      {customExamEditQ.isQcm && (
                        <div style={s.formGroup}>
                          <label style={s.label}>3 Mauvaises réponses (pour le QCM)</label>
                          {customExamEditQ.choices.slice(0,3).map((ch, ci) => (
                            <input key={ci} value={ch} onChange={e => { const c = [...customExamEditQ.choices]; c[ci] = e.target.value; setCustomExamEditQ(q => ({...q, choices: c})); }} style={{ ...s.input, marginBottom: 8 }} placeholder={`Mauvaise réponse ${ci+1}`} />
                          ))}
                        </div>
                      )}
                      <button onClick={() => {
                        if (!customExamEditQ.question.trim() || !customExamEditQ.answer.trim()) { showToast("Question et réponse obligatoires !", "error"); return; }
                        const q = { id: Date.now().toString(), question: customExamEditQ.question.trim(), answer: customExamEditQ.answer.trim(), isQcm: customExamEditQ.isQcm, choices: customExamEditQ.isQcm ? [...customExamEditQ.choices.slice(0,3).filter(c=>c.trim()), customExamEditQ.answer.trim()] : [] };
                        setNewCustomExam(ex => ({...ex, questions: [...ex.questions, q]}));
                        setCustomExamEditQ({ question: "", answer: "", choices: ["","","",""], isQcm: customExamEditQ.isQcm });
                        showToast("✅ Question ajoutée !");
                      }} style={{ ...s.btnPrimary, width: "100%" }} className="hov">+ Ajouter cette question</button>
                    </div>

                    <button onClick={() => {
                      if (!newCustomExam.title.trim()) { showToast("Titre obligatoire !", "error"); return; }
                      if (newCustomExam.questions.length === 0) { showToast("Ajoute au moins une question !", "error"); return; }
                      const exam = { ...newCustomExam, id: Date.now().toString(), createdAt: today() };
                      setCustomExams(prev => [...prev, exam]);
                      showToast(`🎉 Examen "${exam.title}" créé !`);
                      setExamSubView("custom");
                    }} style={{ ...s.btnGodPrimary, marginTop: 16, width: "100%" }} className="hov btn-glow">
                      💾 Sauvegarder l'examen ({newCustomExam.questions.length} questions)
                    </button>
                  </div>

                  {/* Aperçu */}
                  <div style={{ position: "sticky", top: 90 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#6B7A99", letterSpacing: 2, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>APERÇU — {newCustomExam.questions.length} QUESTION(S)</div>
                    {newCustomExam.questions.length === 0 ? (
                      <div style={{ ...s.liveCard, textAlign: "center", padding: "40px 20px", color: "#9CA3AF" }}>
                        <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                        <div style={{ fontSize: 14 }}>Tes questions apparaîtront ici</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 500, overflowY: "auto" }}>
                        {newCustomExam.questions.map((q, i) => (
                          <div key={q.id} style={{ background: "white", border: "1px solid #EFF6FF", borderRadius: 14, padding: "14px 16px", borderLeft: `4px solid ${q.isQcm ? "#7B5FF5" : "#3B82F6"}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: q.isQcm ? "#7B5FF5" : "#3B82F6", marginBottom: 4 }}>{q.isQcm ? "📝 QCM" : "🃏 FLASHCARD"} #{i+1}</div>
                                <div style={{ fontWeight: 700, color: "#1F2937", fontSize: 13 }}>{q.question}</div>
                                <div style={{ color: "#10B981", fontSize: 12, marginTop: 4 }}>✓ {q.answer}</div>
                              </div>
                              <button onClick={() => setNewCustomExam(ex => ({...ex, questions: ex.questions.filter((_,j) => j !== i)}))} style={{ background: "#FEF2F2", border: "none", borderRadius: 8, padding: "4px 8px", color: "#EF4444", cursor: "pointer", fontSize: 12, marginLeft: 8 }}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            AI ENGLISH PRACTICE — CONVERSATION PARTNER WITH MIC
        ════════════════════════════════════════════════════════════════ */}
        {view === "practice" && (
          <div style={s.fadeIn}>
            {/* Hero */}
            <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #065F46 60%, #059669 100%)", borderRadius: 28, padding: "36px", marginBottom: 28, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -20, right: -20, fontSize: 160, opacity: 0.06 }}>🗣️</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#6EE7B7", letterSpacing: 3, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>AI CONVERSATION PARTNER</div>
              <h1 style={{ fontSize: 30, fontWeight: 900, color: "white", marginBottom: 8, letterSpacing: "-1px" }}>English Practice Room 🇬🇧</h1>
              <p style={{ color: "#A7F3D0", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
                Speak or type in English — your AI partner corrects you naturally and keeps the conversation flowing. The mic works exactly like ChatGPT.
              </p>
              {/* Controls */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#6EE7B7", fontWeight: 700 }}>TOPIC</span>
                  <select value={practiceTopic} onChange={e => { setPracticeTopic(e.target.value); }} style={{ padding: "10px 14px", background: "#064E3B", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", minWidth: 180 }}>
                    {["Free conversation", "Job interview", "Technology & AI", "Daily life in Senegal", "University & studies", "Programming & coding", "Travel & culture", "Business English", "IELTS preparation"].map(t => <option key={t} value={t} style={{ background: "#064E3B", color: "white" }}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#6EE7B7", fontWeight: 700 }}>LEVEL</span>
                  <select value={practiceLevel} onChange={e => setPracticeLevel(e.target.value)} style={{ padding: "10px 14px", background: "#064E3B", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    <option value="beginner" style={{ background: "#064E3B", color: "white" }}>🟢 Beginner</option>
                    <option value="intermediate" style={{ background: "#064E3B", color: "white" }}>🟡 Intermediate</option>
                    <option value="advanced" style={{ background: "#064E3B", color: "white" }}>🔴 Advanced</option>
                  </select>
                </div>
                <button onClick={resetPracticeChat} className="hov" style={{ marginTop: 18, padding: "10px 18px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  🔄 New Session
                </button>
                {practiceSpeaking && (
                  <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.2)", border: "1px solid #10B981", borderRadius: 12, padding: "10px 14px" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", animation: "pulse 0.8s infinite" }} />
                    <span style={{ color: "#6EE7B7", fontSize: 12, fontWeight: 700 }}>AI Speaking...</span>
                    <button onClick={() => { window.speechSynthesis.cancel(); setPracticeSpeaking(false); }} style={{ background: "none", border: "none", color: "#6EE7B7", cursor: "pointer", fontSize: 14 }}>⏹</button>
                  </div>
                )}
              </div>
            </div>

            {/* Chat area */}
            <div style={{ background: "white", border: "1px solid #D1FAE5", borderRadius: 24, overflow: "hidden", boxShadow: "0 10px 40px rgba(5,150,105,0.08)", display: "flex", flexDirection: "column", height: 480 }}>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
                {practiceMessages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-end" }}>
                    {msg.role === "assistant" && (
                      <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#059669,#10B981)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🤖</div>
                    )}
                    <div style={{
                      maxWidth: "75%",
                      padding: "14px 18px",
                      borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                      background: msg.role === "user" ? "linear-gradient(135deg, #1D4ED8, #3B82F6)" : "#F0FDF4",
                      color: msg.role === "user" ? "white" : "#1F2937",
                      fontSize: 15,
                      lineHeight: 1.6,
                      fontWeight: 500,
                      border: msg.role === "assistant" ? "1px solid #D1FAE5" : "none",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
                    }}>
                      {msg.text}
                      {msg.role === "assistant" && (
                        <button onClick={() => speakText(msg.text)} title="Listen" style={{ display: "block", marginTop: 8, background: "none", border: "none", color: "#059669", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: 0 }}>
                          🔊 Listen again
                        </button>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#1D4ED8,#7B5FF5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>😊</div>
                    )}
                  </div>
                ))}
                {practiceLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#059669,#10B981)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>
                    <div style={{ background: "#F0FDF4", border: "1px solid #D1FAE5", borderRadius: "20px 20px 20px 4px", padding: "14px 18px", display: "flex", gap: 6, alignItems: "center" }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", animation: `pulse 1.2s ${i*0.2}s infinite` }} />)}
                    </div>
                  </div>
                )}
                <div ref={practiceEndRef} />
              </div>

              {/* Input bar */}
              <div style={{ padding: "16px 20px", borderTop: "1px solid #D1FAE5", background: "#F0FDF4", display: "flex", gap: 10, alignItems: "center" }}>
                {/* MIC BUTTON — gros et visible */}
                <button
                  onClick={togglePracticeMic}
                  className={practiceListening ? "" : "hov"}
                  title={practiceListening ? "Click to stop and send" : "Click to speak (English)"}
                  style={{
                    width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                    background: practiceListening
                      ? "linear-gradient(135deg, #EF4444, #F97316)"
                      : "linear-gradient(135deg, #059669, #10B981)",
                    border: "none", cursor: "pointer", fontSize: 22,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: practiceListening ? "0 0 0 4px rgba(239,68,68,0.3), 0 4px 15px rgba(239,68,68,0.4)" : "0 4px 15px rgba(5,150,105,0.3)",
                    animation: practiceListening ? "pulse 0.8s infinite" : "none",
                    transition: "all 0.2s"
                  }}
                >
                  {practiceListening ? "⏹️" : "🎙️"}
                </button>

                <input
                  value={practiceInput}
                  onChange={e => setPracticeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPracticeMessage(practiceInput); } }}
                  placeholder={practiceListening ? "🎙️ Listening... click ⏹️ when finished!" : "Type in English or press the mic button to speak..."}
                  style={{ flex: 1, padding: "14px 18px", background: "white", border: "2px solid #D1FAE5", borderRadius: 14, fontSize: 15, color: "#1F2937", outline: "none", fontFamily: "'Sora', sans-serif", transition: "border-color 0.2s" }}
                  disabled={practiceListening || practiceInput.includes("⏳")}
                />

                <button
                  onClick={() => sendPracticeMessage(practiceInput)}
                  disabled={!practiceInput.trim() || practiceLoading || practiceListening}
                  className="hov btn-glow"
                  style={{ width: 52, height: 52, borderRadius: 16, background: practiceInput.trim() ? "linear-gradient(135deg,#1D4ED8,#3B82F6)" : "#EFF6FF", border: "none", cursor: practiceInput.trim() ? "pointer" : "default", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: practiceInput.trim() ? "0 4px 15px rgba(29,78,216,0.3)" : "none", transition: "all 0.2s" }}
                >
                  {practiceLoading ? <span style={{ animation: "pulse 1s infinite", display: "inline-block" }}>⏳</span> : "➤"}
                </button>
              </div>
            </div>

            {/* Mic tip MIS À JOUR */}
            <div style={{ marginTop: 16, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 16, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20 }}>💡</span>
              <div style={{ fontSize: 13, color: "#065F46", lineHeight: 1.6 }}>
                <strong>How to use the mic:</strong> Click the green 🎙️ button to start. Take your time, breathe, and think. 
                <strong> Click the red ⏹️ button when you are done.</strong> The AI will transcribe and reply instantly!
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STATS
        ════════════════════════════════════════════════════════════════ */}
        {view === "stats" && (
          <div style={s.fadeIn}>
            <h1 style={s.pageTitle}>▣ Statistiques</h1>
            <p style={s.pageSub}>Analytique de ta progression d'apprentissage</p>

            <div style={s.infoBox}>
              <span style={{ fontSize: 20 }}>🧠</span>
              <div>
                <strong style={{ color: "#1F2937" }}>Algorithme SuperMemo-2 actif</strong>
                <p style={{ color: "#6B7A99", fontSize: 13, marginTop: 4 }}>
                  Chaque fiche a un <em style={{ color: "#4F8EF7" }}>Easiness Factor (EF)</em> calculé sur tes performances.
                  Les fiches difficiles reviennent plus souvent. Priorité intelligente : les modules avec examens proches passent en premier.
                </p>
              </div>
            </div>

            <h2 style={s.sectionTitle}>📈 Courbe de progression (30 derniers jours)</h2>
            {(() => {
              // Build daily mastered count over last 30 days
              const last30 = Array.from({length: 30}, (_, i) => addDays(today(), -(29-i)));
              // For each day, count how many cards had level>=7 at that point
              // Approximate: use reviewHistory to track level changes over time
              const dayData = last30.map(date => {
                const mastered = expressions.filter(e => {
                  if (e.level < 7) return false;
                  // check if it was mastered by this date
                  const hist = e.reviewHistory || [];
                  const masteredEntry = hist.find(h => h.newLevel >= 7);
                  return masteredEntry ? masteredEntry.date <= date : e.createdAt <= date;
                }).length;
                const reviewed = sessions.filter(s => s.date === date).reduce((acc, s) => acc + s.count, 0);
                return { date, mastered, reviewed };
              });
              const maxMastered = Math.max(...dayData.map(d => d.mastered), 1);
              const maxReviewed = Math.max(...dayData.map(d => d.reviewed), 1);
              const W = 600, H = 160, PAD = 20;
              const pts = dayData.map((d, i) => {
                const x = PAD + (i / (last30.length - 1)) * (W - PAD * 2);
                const y = H - PAD - (d.mastered / maxMastered) * (H - PAD * 2);
                return `${x},${y}`;
              });
              const revPts = dayData.map((d, i) => {
                const x = PAD + (i / (last30.length - 1)) * (W - PAD * 2);
                const y = H - PAD - (d.reviewed / maxReviewed) * (H - PAD * 2);
                return `${x},${y}`;
              });
              const fillPts = `${PAD},${H - PAD} ${pts.join(' ')} ${W - PAD},${H - PAD}`;
              // Show only every 5 days as label
              const labels = last30.filter((_, i) => i % 5 === 0 || i === 29);
              return (
                <div style={{ background: "white", border: "1px solid #EFF6FF", borderRadius: 22, padding: "24px", marginBottom: 32, boxShadow: "0 4px 15px rgba(29,78,216,0.03)", overflowX: "auto" }}>
                  <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 24, height: 3, background: "linear-gradient(90deg,#1D4ED8,#3B82F6)", borderRadius: 2 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7A99" }}>Fiches maîtrisées</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 24, height: 3, background: "#10B981", borderRadius: 2, opacity: 0.6 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7A99" }}>Révisions du jour</span>
                    </div>
                    <div style={{ marginLeft: "auto", background: "#EFF6FF", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, color: "#1D4ED8" }}>
                      {dayData[29].mastered} maîtrisées aujourd'hui
                    </div>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: H }}>
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
                      <line key={i} x1={PAD} y1={PAD + p * (H - PAD * 2)} x2={W - PAD} y2={PAD + p * (H - PAD * 2)}
                        stroke="#EFF6FF" strokeWidth={1} />
                    ))}
                    {/* Area fill for mastered */}
                    <polygon points={fillPts} fill="url(#blueGrad)" opacity={0.15} />
                    <defs>
                      <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Reviewed line */}
                    <polyline points={revPts.join(' ')} fill="none" stroke="#10B981" strokeWidth={1.5} strokeOpacity={0.6} strokeDasharray="4,3" />
                    {/* Mastered line */}
                    <polyline points={pts.join(' ')} fill="none" stroke="#1D4ED8" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    {/* Today dot */}
                    {(() => {
                      const [tx, ty] = pts[pts.length - 1].split(',').map(Number);
                      return <circle cx={tx} cy={ty} r={5} fill="#1D4ED8" />;
                    })()}
                    {/* Date labels */}
                    {last30.map((date, i) => {
                      if (i % 5 !== 0 && i !== 29) return null;
                      const x = PAD + (i / (last30.length - 1)) * (W - PAD * 2);
                      const d = new Date(date);
                      const label = `${d.getDate()}/${d.getMonth()+1}`;
                      return <text key={date} x={x} y={H - 2} textAnchor="middle" fontSize={10} fill="#9CA3AF" fontFamily="JetBrains Mono, monospace">{label}</text>;
                    })}
                  </svg>
                </div>
              );
            })()}

            <h2 style={s.sectionTitle}>🔬 Rétention par module</h2>
            {(() => {
              const catData = categories.map(cat => {
                const catExps = expressions.filter(e => e.category === cat.name);
                if (catExps.length === 0) return null;
                const mastered = catExps.filter(e => e.level >= 7).length;
                const learning = catExps.filter(e => e.level >= 3 && e.level < 7).length;
                const weak = catExps.filter(e => e.level < 3).length;
                const pct = Math.round((mastered / catExps.length) * 100);
                return { cat, mastered, learning, weak, total: catExps.length, pct };
              }).filter(Boolean);
              return (
                <div style={{ background: "white", border: "1px solid #EFF6FF", borderRadius: 22, padding: "24px", marginBottom: 32, boxShadow: "0 4px 15px rgba(29,78,216,0.03)" }}>
                  {catData.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#9CA3AF", padding: "20px" }}>Crée des fiches pour voir la rétention par module</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {catData.map(({ cat, mastered, learning, weak, total, pct }) => {
                        const catColor = cat.color || "#4F8EF7";
                        return (
                          <div key={cat.name}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontWeight: 800, color: "#1F2937", fontSize: 14 }}>{cat.name}</span>
                              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700 }}>✅ {mastered}</span>
                                <span style={{ fontSize: 12, color: "#3B82F6", fontWeight: 700 }}>📚 {learning}</span>
                                <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 700 }}>⚠️ {weak}</span>
                                <span style={{ fontSize: 13, fontWeight: 900, color: catColor }}>{pct}%</span>
                              </div>
                            </div>
                            <div style={{ height: 12, borderRadius: 6, background: "#EFF6FF", overflow: "hidden", display: "flex" }}>
                              <div style={{ width: `${(mastered/total)*100}%`, background: "#10B981", transition: "width 0.5s" }} />
                              <div style={{ width: `${(learning/total)*100}%`, background: "#3B82F6", transition: "width 0.5s", opacity: 0.7 }} />
                              <div style={{ width: `${(weak/total)*100}%`, background: "#EF4444", transition: "width 0.5s", opacity: 0.5 }} />
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
                        {[{ color: "#10B981", label: "Maîtrisées (N7)" }, { color: "#3B82F6", label: "En apprentissage (N3-6)" }, { color: "#EF4444", label: "À renforcer (N0-2)" }].map((l, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color }} />
                            <span style={{ fontSize: 11, color: "#6B7A99", fontWeight: 600 }}>{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <h2 style={s.sectionTitle}>🟩 Activité de révision (12 semaines)</h2>
            <div style={s.heatmapCard}>
              <div style={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
                {weeks.map((week, wi) => (
                  <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {week.map((date) => {
                      const cnt = heatmap[date] || 0;
                      const alpha = cnt === 0 ? 0 : Math.min(0.2 + cnt * 0.12, 1);
                      const isToday = date === today();
                      return (
                        <div key={date} title={`${date}: ${cnt} fiche(s)`}
                          style={{ width: 14, height: 14, borderRadius: 3, background: cnt === 0 ? "#EFF6FF" : `rgba(79,142,247,${alpha})`, border: isToday ? "1.5px solid #4F8EF7" : "none", cursor: "default", transition: "all 0.2s" }} />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
                <span style={{ color: "#6B7A99", fontSize: 12 }}>Moins</span>
                {[0, 0.3, 0.55, 0.8, 1].map((a, i) => (
                  <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: a === 0 ? "#EFF6FF" : `rgba(79,142,247,${a})` }} />
                ))}
                <span style={{ color: "#6B7A99", fontSize: 12 }}>Plus</span>
              </div>
            </div>

            <h2 style={s.sectionTitle}>📊 Distribution des niveaux SM-2</h2>
            <div style={s.levelsChart}>
              {[...Array(8)].map((_, lvl) => {
                const cnt = expressions.filter((e) => e.level === lvl).length;
                const max = Math.max(...[...Array(8)].map((_, i) => expressions.filter((e) => e.level === i).length), 1);
                const colors = ["#F04040", "#F06040", "#F0A040", "#D0C040", "#A0C040", "#40C080", "#4F8EF7", "#7B5FF5"];
                return (
                  <div key={lvl} style={s.levelBar}>
                    <div style={{ fontSize: 11, color: colors[lvl], fontWeight: 700, marginBottom: 4 }}>{cnt}</div>
                    <div style={{ ...s.levelBarFill, height: `${Math.max(4, (cnt / max) * 120)}px`, background: colors[lvl] }} />
                    <div style={{ fontSize: 11, color: "#6B7A99", marginTop: 6 }}>{levelLabel[lvl]?.substring(0, 6)}</div>
                  </div>
                );
              })}
            </div>

            <h2 style={s.sectionTitle}>🔬 Analyse SM-2 par module</h2>
            <div style={s.sm2Grid}>
              {categories.map((cat) => {
                const catExps = expressions.filter((e) => e.category === cat.name && e.easeFactor);
                const avgEF = catExps.length ? (catExps.reduce((a, e) => a + (e.easeFactor || 2.5), 0) / catExps.length).toFixed(2) : "N/A";
                const avgInterval = catExps.length ? Math.round(catExps.reduce((a, e) => a + (e.interval || 1), 0) / catExps.length) : 0;
                const mastered = catExps.filter((e) => e.level >= 7).length;
                const pct = catExps.length ? Math.round((mastered / catExps.length) * 100) : 0;
                const catColor = cat.color || "#4F8EF7";
                return (
                  <div key={cat.name} style={{ ...s.sm2Card, borderTop: `3px solid ${catColor}` }} className="card-hov">
                    <div style={{ fontWeight: 700, color: "#1F2937", marginBottom: 12, fontSize: 14 }}>{cat.name}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: catColor }}>{avgEF}</div>
                        <div style={{ fontSize: 10, color: "#6B7A99" }}>EF moyen</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#40C080" }}>{avgInterval}j</div>
                        <div style={{ fontSize: 10, color: "#6B7A99" }}>Intervalle</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#7B5FF5" }}>{pct}%</div>
                        <div style={{ fontSize: 10, color: "#6B7A99" }}>Maîtrisé</div>
                      </div>
                    </div>
                    <div style={{ ...s.progressTrack, marginTop: 12 }}>
                      <div style={{ ...s.progressFill, width: `${pct}%`, background: `linear-gradient(90deg,${catColor},${catColor}99)` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <h2 style={s.sectionTitle}>📈 Métriques globales</h2>
            <div style={s.statsGrid}>
              {[
                { icon: "🔁", val: stats.totalReviews, label: "Révisions totales", color: "#4F8EF7" },
                { icon: "🤖", val: stats.aiGenerated, label: "Fiches IA", color: "#7B5FF5" },
                { icon: "🎯", val: stats.examsDone, label: "Examens blancs", color: "#F0A040" },
                { icon: "📅", val: sessions.length, label: "Jours actifs", color: "#40C080" },
              ].map((stat, i) => (
                <div key={i} style={{ ...s.statCard, borderTop: `3px solid ${stat.color}` }} className="card-hov">
                  <div style={s.statIcon}>{stat.icon}</div>
                  <div style={{ ...s.statNum, color: stat.color }}>{stat.val}</div>
                  <div style={s.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            BADGES
        ════════════════════════════════════════════════════════════════ */}
        {view === "badges" && (
          <div style={s.fadeIn}>
            <h1 style={s.pageTitle}>🏆 Badges & Achievements</h1>
            <p style={s.pageSub}>{unlockedBadges.length} / {BADGES.length} badges débloqués</p>

            <div style={{ ...s.progressTrack, height: 10, marginBottom: 32 }}>
              <div style={{ ...s.progressFill, width: `${(unlockedBadges.length / BADGES.length) * 100}%` }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {BADGES.map((badge) => {
                const unlocked = unlockedBadges.includes(badge.id);
                return (
                  <div key={badge.id} style={{ ...s.badgeCard, opacity: unlocked ? 1 : 0.4, border: unlocked ? "1px solid #4F8EF755" : "1px solid #EFF6FF" }} className={unlocked ? "card-hov" : ""}>
                    <div style={{ fontSize: 40, marginBottom: 10, filter: unlocked ? "none" : "grayscale(1)" }}>{badge.icon}</div>
                    <div style={{ fontWeight: 700, color: unlocked ? "#1F2937" : "#4B5870", fontSize: 14 }}>{badge.label}</div>
                    <div style={{ color: "#6B7A99", fontSize: 12, marginTop: 4 }}>{badge.desc}</div>
                    {unlocked && <div style={{ marginTop: 10, color: "#40C080", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>✓ DÉBLOQUÉ</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      <footer style={s.footer}>
        MémoMaître God Level Edition v3 · SM-2 + IA + Voice + Exam Mode · {new Date().getFullYear()} · Dakar 🇸🇳
      </footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CSS GLOBAL
// ══════════════════════════════════════════════════════════════════════════════
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #F0F5FF; color: #1F2937; } 
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #EFF6FF; } 
  ::-webkit-scrollbar-thumb { background: #BFDBFE; border-radius: 3px; } 
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes ring { to { transform: rotate(-360deg) scale(1.1); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes glow { 0%,100% { box-shadow: 0 0 15px rgba(29,78,216,0.2); } 50% { box-shadow: 0 0 30px rgba(29,78,216,0.4); } } 
  @keyframes badgeIn { from { opacity: 0; transform: translateX(120px); } to { opacity: 1; transform: translateX(0); } }
  .hov:hover { transform: translateY(-2px); transition: all 0.2s ease; }
  .card-hov:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(29,78,216,0.12) !important; transition: all 0.25s; } 
  .mic-pulse { animation: pulse 0.8s infinite; }
  textarea, input, select { font-family: 'Sora', sans-serif !important; color: #1F2937 !important; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: #3B82F6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.2) !important; }
  .tab-active { background: rgba(255,255,255,0.2) !important; font-weight: 700 !important; color: white !important; } 
  .btn-glow:hover { animation: glow 1.5s infinite; transition: all 0.3s; }
`;

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const s = {
  app: { minHeight: "100vh", background: "#F0F5FF", fontFamily: "'Sora', sans-serif", display: "flex", flexDirection: "column", color: "#1F2937" },
  loading: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F0F5FF", gap: 20 },
  spinnerWrap: { position: "relative", width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center" },
  spinner: { width: 36, height: 36, border: "3px solid transparent", borderTop: "3px solid #1D4ED8", borderRadius: "50%", animation: "spin 0.7s linear infinite" },
  spinnerRing: { position: "absolute", inset: 0, border: "3px solid transparent", borderBottom: "3px solid #3B82F655", borderRadius: "50%", animation: "ring 1.2s linear infinite" },
  loadingText: { color: "#1D4ED8", fontWeight: 800, fontSize: 22, letterSpacing: "-0.5px" },
  loadingSub: { color: "#6B7280", fontSize: 13, fontFamily: "JetBrains Mono, monospace" },
  main: { flex: 1, maxWidth: 1000, width: "100%", margin: "0 auto", padding: "32px 20px 80px" },
  fadeIn: { animation: "fadeUp 0.4s ease" },

  nav: { background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap", gap: 8, minHeight: 70, boxShadow: "0 4px 15px rgba(29,78,216,0.2)" },
  navBrand: { display: "flex", alignItems: "center", gap: 12 },
  navLogo: { width: 42, height: 42, background: "rgba(255,255,255,0.2)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "white", fontFamily: "'JetBrains Mono', monospace" },
  navTitle: { fontSize: 20, fontWeight: 800, color: "white", letterSpacing: "-0.5px" },
  navSub: { fontSize: 10, color: "#DBEAFE", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 },
  navLinks: { display: "flex", gap: 4, flexWrap: "wrap" },
  navItem: { padding: "8px 16px", borderRadius: 10, color: "rgba(255,255,255,0.8)", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'Sora', sans-serif", fontWeight: 600, background: "transparent", transition: "all 0.2s", position: "relative" },
  navBadge: { position: "absolute", top: -2, right: -2, background: "#F59E0B", color: "white", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #1D4ED8" },

  toast: { position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "14px 22px", borderRadius: 14, color: "white", fontWeight: 600, fontSize: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", animation: "slideIn 0.3s ease" },
  badgeNotif: { position: "fixed", top: 90, right: 20, zIndex: 9998, display: "flex", gap: 16, alignItems: "center", background: "white", border: "2px solid #F59E0B", borderRadius: 18, padding: "18px 24px", boxShadow: "0 12px 40px rgba(245,158,11,0.2)", animation: "badgeIn 0.4s ease" },

  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 28, fontWeight: 900, color: "#1D4ED8", letterSpacing: "-1px" },
  pageSub: { color: "#6B7280", fontSize: 14, marginTop: 6 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#1D4ED8", marginBottom: 16, marginTop: 32, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: "uppercase" },
  sectionTitleLight: { fontSize: 18, fontWeight: 700, color: "#1D4ED8", marginBottom: 16, marginTop: 32 },

  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 },
  statCard: { background: "white", borderRadius: 20, padding: "24px 16px", textAlign: "center", border: "1px solid #EFF6FF", boxShadow: "0 4px 15px rgba(29,78,216,0.04)", transition: "all 0.25s" },
  statIcon: { fontSize: 28, marginBottom: 12 },
  statNum: { fontSize: 38, fontWeight: 900, lineHeight: 1, color: "#1D4ED8" },
  statLabel: { fontSize: 13, color: "#6B7280", marginTop: 8, fontWeight: 600 },

  modulesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 },
  moduleCardLight: { background: "white", borderRadius: 20, padding: "20px", boxShadow: "0 4px 15px rgba(29,78,216,0.04)", border: "1px solid #EFF6FF", transition: "all 0.25s" },
  moduleNameLight: { fontWeight: 800, color: "#1F2937", fontSize: 16, marginBottom: 12 },
  examBadge: { borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, marginBottom: 12, display: "inline-block" },
  progressWrap: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  progressTrack: { flex: 1, height: 8, background: "#EFF6FF", borderRadius: 4, overflow: "hidden", position: "relative" },
  progressTrackLight: { flex: 1, height: 8, background: "#EFF6FF", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, transition: "width 0.5s ease", background: "linear-gradient(90deg, #1D4ED8, #60A5FA)" },
  progressFillLight: { height: "100%", borderRadius: 4, transition: "width 0.5s ease" },
  pctLabel: { fontSize: 13, fontWeight: 800, color: "#1D4ED8", minWidth: 38 },

  reviewHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  backBtn: { background: "white", border: "1px solid #DBEAFE", borderRadius: 10, padding: "8px 16px", color: "#1D4ED8", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Sora', sans-serif", transition: "all 0.2s" },
  reviewProgress: { fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: "#6B7280" },
  progressBar: { height: 8, background: "#DBEAFE", borderRadius: 4, marginBottom: 32, overflow: "hidden" },
  progressBarFill: { height: "100%", background: "linear-gradient(90deg, #1D4ED8, #3B82F6)", borderRadius: 4, transition: "width 0.4s ease" },
  timerBadge: { padding: "6px 14px", borderRadius: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 14 },
  flashCard: { background: "white", border: "1px solid #EFF6FF", borderRadius: 26, padding: "32px", boxShadow: "0 10px 40px rgba(29,78,216,0.08)", maxWidth: 700, margin: "0 auto" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  catTag: { background: "#EFF6FF", color: "#1D4ED8", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  easeTag: { background: "#F5F3FF", color: "#7C3AED", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" },
  cardQ: { background: "#F8FAFF", borderRadius: 20, padding: "28px", marginBottom: 20, border: "1px solid #EFF6FF" },
  cardQLabel: { fontSize: 11, color: "#60A5FA", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace" },
  cardQText: { fontSize: 26, fontWeight: 800, color: "#1D4ED8", lineHeight: 1.35 },
  revealBtn: { display: "block", width: "100%", padding: "18px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora', sans-serif" },
  kbHint: { textAlign: "center", marginTop: 12, color: "#9CA3AF", fontSize: 12 },
  cardA: { background: "#EFF6FF", border: "2px solid #DBEAFE", borderRadius: 20, padding: "28px", marginBottom: 20 },
  cardALabel: { fontSize: 11, color: "#3B82F6", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace" },
  cardAText: { fontSize: 18, fontWeight: 600, color: "#1F2937", lineHeight: 1.6 },
  cardEx: { marginTop: 16, padding: "14px 18px", background: "white", borderRadius: 12, fontSize: 14, color: "#4B5563", fontStyle: "italic", borderLeft: "4px solid #3B82F6" },
  
  answerBtns: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  btnOublie: { position: "relative", padding: "16px 8px", background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 16, fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'Sora', sans-serif", lineHeight: 1.5 },
  btnHesite: { position: "relative", padding: "16px 8px", background: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A", borderRadius: 16, fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'Sora', sans-serif", lineHeight: 1.5 },
  btnFacile: { position: "relative", padding: "16px 8px", background: "#D1FAE5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 16, fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'Sora', sans-serif", lineHeight: 1.5 },
  kbKey: { position: "absolute", top: 8, right: 10, fontSize: 10, opacity: 0.6, fontFamily: "JetBrains Mono, monospace", background: "white", padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)" },
  cardHistory: { display: "flex", alignItems: "center", gap: 6, marginTop: 20, justifyContent: "center" },
  histDot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },

  aiBlock: { background: "#EFF6FF", border: "1px solid #DBEAFE", borderRadius: 22, padding: "24px", marginBottom: 24 },
  aiHeader: { display: "flex", gap: 14, alignItems: "center" },
  aiIcon: { fontSize: 32, lineHeight: 1 },
  aiInput: { flex: 1, padding: "14px 18px", background: "white", border: "1px solid #DBEAFE", borderRadius: 12, fontSize: 14, color: "#1F2937", fontFamily: "'Sora', sans-serif" },
  aiBtn: { padding: "14px 24px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Sora', sans-serif", whiteSpace: "nowrap" },
  
  formCard: { background: "white", border: "1px solid #EFF6FF", borderRadius: 22, padding: "30px", marginBottom: 24, boxShadow: "0 4px 15px rgba(29,78,216,0.03)" },
  formGroup: { marginBottom: 20 },
  label: { display: "block", fontSize: 13, fontWeight: 700, color: "#4B5563", marginBottom: 8 },
  input: { width: "100%", padding: "14px 16px", background: "white", border: "2px solid #EFF6FF", borderRadius: 12, fontSize: 14, color: "#1F2937", transition: "all 0.2s" },
  select: { width: "100%", padding: "14px 16px", background: "white", border: "2px solid #EFF6FF", borderRadius: 12, fontSize: 14, color: "#1F2937", cursor: "pointer" },
  btnPrimary: { padding: "14px 28px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora', sans-serif" },
  btnSecondary: { padding: "14px 24px", background: "#F8FAFF", color: "#1D4ED8", border: "1px solid #DBEAFE", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora', sans-serif" },

  filterRow: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 },
  filterBtn: { padding: "8px 18px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora', sans-serif", border: "1px solid #DBEAFE", background: "white", color: "#4B5563" },
  cardList: { display: "flex", flexDirection: "column", gap: 14 },
  expCard: { background: "white", border: "1px solid #EFF6FF", borderRadius: 20, padding: "24px", transition: "all 0.25s", boxShadow: "0 2px 10px rgba(29,78,216,0.03)" },
  expHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  expCat: { padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  expLevel: { padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  expFront: { fontSize: 18, fontWeight: 800, color: "#1D4ED8", marginBottom: 8 },
  expBack: { fontSize: 15, color: "#4B5563", marginBottom: 8, lineHeight: 1.5 },
  expEx: { fontSize: 13, color: "#9CA3AF", fontStyle: "italic", marginBottom: 8 },
  expFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 16, borderTop: "1px solid #EFF6FF" },
  expDate: { fontSize: 12, color: "#60A5FA", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 },
  editBtn: { background: "#EFF6FF", border: "none", cursor: "pointer", fontSize: 15, padding: "6px 10px", borderRadius: 8, color: "#1D4ED8" },
  delBtn: { background: "#FEF2F2", border: "none", cursor: "pointer", fontSize: 15, padding: "6px 10px", borderRadius: 8, color: "#EF4444" },
  emptyState: { textAlign: "center", padding: "80px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },

  catDetailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 },
  catDetailCard: { background: "white", border: "1px solid #EFF6FF", borderRadius: 22, padding: "26px", transition: "all 0.25s", boxShadow: "0 4px 15px rgba(29,78,216,0.04)" },
  catDetailHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  catDetailName: { fontWeight: 900, color: "#1F2937", fontSize: 18 },
  priorityTag: { padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  infoBox: { background: "#EFF6FF", border: "1px solid #DBEAFE", borderRadius: 16, padding: "20px", display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 30 },

  heatmapCard: { background: "white", border: "1px solid #EFF6FF", borderRadius: 22, padding: "28px", marginBottom: 32, overflowX: "auto", boxShadow: "0 4px 15px rgba(29,78,216,0.03)" },
  levelsChart: { display: "flex", gap: 12, alignItems: "flex-end", height: 220, background: "white", border: "1px solid #EFF6FF", borderRadius: 22, padding: "24px", marginBottom: 32, boxShadow: "0 4px 15px rgba(29,78,216,0.03)" },
  levelBar: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" },
  levelBarFill: { width: "100%", minWidth: 24, borderRadius: "6px 6px 0 0", transition: "height 0.5s ease" },
  sm2Grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginBottom: 32 },
  sm2Card: { background: "white", border: "1px solid #EFF6FF", borderRadius: 20, padding: "24px", transition: "all 0.25s", boxShadow: "0 4px 15px rgba(29,78,216,0.03)" },
  badgeCard: { background: "white", border: "1px solid #EFF6FF", borderRadius: 22, padding: "28px", textAlign: "center", transition: "all 0.25s", boxShadow: "0 4px 15px rgba(29,78,216,0.03)" },

  footer: { textAlign: "center", padding: "24px", color: "#9CA3AF", fontSize: 12, borderTop: "1px solid #DBEAFE", fontFamily: "'JetBrains Mono', monospace", background: "transparent" },

  heroGod: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", padding: "24px 32px", borderRadius: 24, marginBottom: 24, boxShadow: "0 4px 15px rgba(29,78,216,0.03)", border: "1px solid #EFF6FF", flexWrap: "wrap", gap: 16 },
  heroTitle: { fontSize: 26, fontWeight: 900, color: "#1F2937", letterSpacing: "-0.5px", marginBottom: 4 },
  heroSub: { fontSize: 15, color: "#6B7A99", fontWeight: 500 },
  miniHeatmap: { background: "#F8FAFF", padding: "12px 16px", borderRadius: 16, border: "1px solid #EFF6FF", display: "flex", alignItems: "center" },
  
  missionCardGod: { background: "linear-gradient(135deg, #ffffff 0%, #F8FAFF 100%)", padding: "32px", borderRadius: 24, border: "2px solid #DBEAFE", marginBottom: 32, position: "relative", overflow: "hidden" },
  missionHeader: { display: "flex", alignItems: "center", gap: 12 },
  missionPulse: { width: 12, height: 12, borderRadius: "50%", background: "#EF4444", animation: "pulse 1.5s infinite" },
  dangerWarning: { marginTop: 12, padding: "10px 14px", background: "#FEF2F2", color: "#B91C1C", borderRadius: 10, fontSize: 13, borderLeft: "3px solid #EF4444" },
  triageBox: { background: "#F5F3FF", border: "1px solid #E0E7FF", borderRadius: 16, padding: "16px 20px", minWidth: 160, display: "flex", flexDirection: "column", justifyContent: "center" },
  focusBtn: { width: "100%", padding: "18px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 16, fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "'Sora', sans-serif" },
  
  duePill: { background: "#FEE2E2", color: "#EF4444", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800 },

  // --- STYLES AJOUT GOD TIER ---
  splitGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 32, alignItems: "start" },
  formCol: { background: "white", border: "1px solid #EFF6FF", borderRadius: 24, padding: "32px", boxShadow: "0 10px 40px rgba(29,78,216,0.04)" },
  previewCol: { position: "sticky", top: 90, display: "flex", flexDirection: "column", gap: 20 },
  previewLabel: { fontSize: 12, fontWeight: 800, color: "#6B7A99", letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace", paddingLeft: 12 },
  liveCard: { background: "white", border: "2px dashed #DBEAFE", borderRadius: 24, padding: "28px", boxShadow: "0 20px 50px rgba(29,78,216,0.06)", transition: "all 0.3s", opacity: 0.95 },
  
  aiGodBlock: { background: "linear-gradient(135deg, #1D4ED8 0%, #7B5FF5 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32, boxShadow: "0 15px 35px rgba(123,95,245,0.25)" },
  aiIconGlow: { fontSize: 32, textShadow: "0 0 20px rgba(255,255,255,0.6)" },
  aiInputDark: { flex: 1, padding: "16px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white", outline: "none", transition: "all 0.2s" },
  aiBtnLight: { padding: "16px 28px", background: "white", color: "#1D4ED8", border: "none", borderRadius: 16, fontWeight: 800, fontSize: 15, cursor: "pointer", whiteSpace: "nowrap" },
  
  inputWrapper: { position: "relative" },
  inputGod: { width: "100%", padding: "16px 20px", background: "#F8FAFF", border: "2px solid #EFF6FF", borderRadius: 16, fontSize: 15, color: "#1F2937", transition: "all 0.2s", fontFamily: "'Sora', sans-serif" },
  selectGod: { width: "100%", padding: "16px 20px", background: "#F8FAFF", border: "2px solid #EFF6FF", borderRadius: 16, fontSize: 15, color: "#1F2937", fontWeight: 600, cursor: "pointer", appearance: "none", fontFamily: "'Sora', sans-serif" },
  
  microAIBtn: { background: "#F5F3FF", color: "#7B5FF5", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", transition: "all 0.2s" },
  micBtnGod: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "white", border: "none", cursor: "pointer", fontSize: 20, padding: 8, borderRadius: 12, boxShadow: "0 4px 10px rgba(0,0,0,0.05)" },
  
  actionRow: { display: "flex", gap: 12, marginTop: 12 },
  btnGodPrimary: { flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "18px 24px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: "pointer" },
  btnGodSecondary: { padding: "18px 24px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  cancelEditBtn: { padding: "10px 20px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  
  kbdDark: { background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "white" },
  shortcutHint: { fontSize: 11, color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 },
  
  quickImportBox: { background: "white", border: "1px solid #EFF6FF", borderRadius: 16, padding: "20px", boxShadow: "0 4px 15px rgba(29,78,216,0.03)" },
  btnTiny: { background: "#EFF6FF", color: "#1D4ED8", border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" },

  // --- NOUVEAUX STYLES LISTE GOD TIER ---
  listHeaderGod: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 32 },
  listStatsRow: { display: "flex", gap: 16 },
  listStatBox: { background: "white", padding: "16px 24px", borderRadius: 20, border: "1px solid #EFF6FF", boxShadow: "0 4px 15px rgba(29,78,216,0.03)", textAlign: "center", minWidth: 100 },
  listStatVal: { fontSize: 28, fontWeight: 900, color: "#1D4ED8", lineHeight: 1 },
  listStatLabel: { fontSize: 12, fontWeight: 700, color: "#6B7A99", marginTop: 6, textTransform: "uppercase", letterSpacing: 1 },
  
  toolbarGod: { background: "white", padding: "16px", borderRadius: 24, border: "1px solid #EFF6FF", boxShadow: "0 10px 30px rgba(29,78,216,0.05)", marginBottom: 32, position: "sticky", top: 85, zIndex: 50 },
  searchBoxGod: { display: "flex", alignItems: "center", background: "#F8FAFF", padding: "0 20px", borderRadius: 16, border: "2px solid #EFF6FF", marginBottom: 16 },
  searchFieldGod: { flex: 1, padding: "16px 12px", background: "transparent", border: "none", fontSize: 15, fontFamily: "'Sora', sans-serif", color: "#1F2937", outline: "none" },
  clearSearchBtn: { background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 14, fontWeight: 800, padding: 8 },
  
  filtersContainer: { display: "flex", flexDirection: "column", gap: 12 },
  filterScroll: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" },
  chipGod: { padding: "8px 16px", borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora', sans-serif", whiteSpace: "nowrap", transition: "all 0.2s" },
  chipLevelGod: { padding: "8px 16px", borderRadius: 100, fontSize: 12, cursor: "pointer", fontFamily: "'Sora', sans-serif", whiteSpace: "nowrap", border: "none", transition: "all 0.2s" },
  
  emptyStateGod: { background: "white", border: "2px dashed #DBEAFE", borderRadius: 32, padding: "80px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" },
  
  godGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 24 },
  godCard: { background: "white", borderRadius: 24, display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(29,78,216,0.04)", borderRight: "1px solid #EFF6FF", borderBottom: "1px solid #EFF6FF", borderLeft: "1px solid #EFF6FF", overflow: "hidden", transition: "all 0.3s" },
  godCardHeader: { padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  catTagGod: { padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, letterSpacing: 0.5 },
  godCardBody: { padding: "0 24px", flex: 1 },
  godFront: { fontSize: 20, fontWeight: 800, color: "#1D4ED8", marginBottom: 12, lineHeight: 1.3 },
  godBack: { fontSize: 14, color: "#4B5563", lineHeight: 1.6, marginBottom: 16 },
  godExample: { background: "#F8FAFF", padding: "12px", borderRadius: 12, fontSize: 13, color: "#4B5563", fontStyle: "italic", borderLeft: "3px solid #3B82F6", marginBottom: 16 },
  
  godCardFooter: { padding: "16px 24px", background: "#F8FAFF", borderTop: "1px solid #EFF6FF", display: "flex", justifyContent: "space-between", alignItems: "center" },
  godCardMeta: { fontSize: 12, fontWeight: 700, color: "#6B7A99", fontFamily: "'JetBrains Mono', monospace" },
  godCardActions: { display: "flex", gap: 8 },
  actionBtnGod: { width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", fontSize: 14, transition: "transform 0.2s" }
};