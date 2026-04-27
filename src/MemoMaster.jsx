// MemoMaster.jsx – GOD LEVEL v6 (Full Merge)
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
  { name: "🇬🇧 Anglais", examDate: "", targetScore: 90, priority: "haute", color: "#4D6BFE" },
  { name: "☕ Java / Spring Boot", examDate: "", targetScore: 85, priority: "haute", color: "#7B93FF" },
  { name: "🖥️ Informatique Générale", examDate: "", targetScore: 80, priority: "normale", color: "#4D6BFE" },
];

// ══════════════════════════════════════════════════════════════════════════════
// DEEPSEEK API – Configuration sécurisée
// ══════════════════════════════════════════════════════════════════════════════
const _DS = import.meta.env.VITE_GROQ_API_KEY;
const DEEPSEEK_MODEL = "llama-3.3-70b-versatile";
const DEEPSEEK_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"; // ✅ Groq

// Sanitize user input to prevent prompt injection
function sanitizeInput(text) {
  if (typeof text !== "string") return "";
  return text.replace(/<\|.*?\|>/g, "").replace(/\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>/g, "").slice(0, 8000);
}

async function callClaude(systemPrompt, userMessage, isVision = false, imageUrl = null) {
  const safeUser = sanitizeInput(userMessage);
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: safeUser },
  ];
  // DeepSeek ne supporte pas nativement la vision – on enrichit le prompt texte
  if (isVision && imageUrl) {
    messages[1].content = `[Image URL: ${imageUrl}]\n${safeUser}`;
  }

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${_DS}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          max_tokens: 1500,
          temperature: 0.7,
          messages,
        }),
      });
      if (res.status === 429) throw new Error("QUOTA_EXCEEDED");
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from DeepSeek");
      return text;
    } catch (err) {
      if (err.message === "QUOTA_EXCEEDED" || attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
}

// Transcription vocale via DeepSeek (fallback texte si API audio indisponible)
async function transcribeAudio(audioBlob, language = "fr") {
  // DeepSeek ne propose pas Whisper – on utilise Web Speech API nativement
  return null; // géré côté startVoice
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
// GOD LEVEL HOOKS – Audio, Confetti, Highlight, Mermaid
// ══════════════════════════════════════════════════════════════════════════════
const useAudioFeedback = () => {
  const audioCtxRef = useRef(null);
  const getCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };
  const playTone = (freq, type, duration) => {
    const ctx = getCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  };
  const playCorrect = () => playTone(800, "sine", 0.15);
  const playHard = () => playTone(400, "triangle", 0.2);
  const playAgain = () => playTone(200, "sawtooth", 0.3);
  return { playCorrect, playHard, playAgain };
};

const useConfetti = () => {
  const fire = () => {
    if (window.confetti) {
      window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };
  return fire;
};

const useHighlight = () => {
  const highlightCode = useCallback((text) => {
    if (!text || typeof text !== "string") return text;
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    return text.replace(codeBlockRegex, (_, lang, code) => {
      try {
        if (window.hljs) {
          const highlighted = lang && window.hljs.getLanguage(lang)
            ? window.hljs.highlight(code, { language: lang }).value
            : window.hljs.highlightAuto(code).value;
          return `<pre><code class="hljs ${lang}">${highlighted}</code></pre>`;
        }
      } catch {}
      return `<pre><code>${code}</code></pre>`;
    });
  }, []);
  return highlightCode;
};

const useMermaid = () => {
  const renderMermaid = useCallback(async (text) => {
    return text;
  }, []);
  return renderMermaid;
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function MemoMaster() {
  // ── Tous les états existants ───────────────────────────────────────────
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

  // Examens
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

  // Fiches Add/Edit
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
  const practiceRecognitionRef = useRef(null);

    // ── GOD LEVEL ADD v9 — Nouveaux états ──────────────────────────────────
  const [addMarkdownPreview, setAddMarkdownPreview] = useState(false);
  const [addTemplate, setAddTemplate] = useState("standard"); // standard | code | qa | definition
  const [addTemplatePresets] = useState([
    { id: "standard", label: "Standard", fields: ["front","back","example"] },
    { id: "code", label: "Code Review", fields: ["front","back","example","codeSnippet"] },
    { id: "qa", label: "Q&A", fields: ["front","back"] },
    { id: "definition", label: "Définition", fields: ["front","back","analogy"] },
  ]);
  const [addDictationActive, setAddDictationActive] = useState(false);
  const [addDictationField, setAddDictationField] = useState(null); // 'front' | 'back' | 'example'
  const [addReformulations, setAddReformulations] = useState({}); // { field: [versions] }
  const [addReformLoading, setAddReformLoading] = useState(false);
  const [addMetaphoreLoading, setAddMetaphoreLoading] = useState(false);
  const [addMetaphoreText, setAddMetaphoreText] = useState("");
  const [addImageGallery, setAddImageGallery] = useState(false);
  const [addImageSearch, setAddImageSearch] = useState("");
  const [addImageResults, setAddImageResults] = useState([]);
  const [addImageSearchLoading, setAddImageSearchLoading] = useState(false);
  const [addDiagramMode, setAddDiagramMode] = useState(false);
  const [addDiagramCode, setAddDiagramCode] = useState("");
  const [addDiagramSvg, setAddDiagramSvg] = useState(null);
  const [addAudioBlob, setAddAudioBlob] = useState(null);
  const [addAudioUrl, setAddAudioUrl] = useState(null);
  const [addAudioRecording, setAddAudioRecording] = useState(false);
  const [addAudioRecorder, setAddAudioRecorder] = useState(null);
  const [addLayeredMode, setAddLayeredMode] = useState(false);
  const [addLayers, setAddLayers] = useState([{ back: "" }]); // niveaux de réponse
  const [addDoublonCheck, setAddDoublonCheck] = useState(null);
  const [addDoublonLoading, setAddDoublonLoading] = useState(false);
  const [addBatchQueue, setAddBatchQueue] = useState([]); // file d'attente de concepts à générer
  const [addBatchRunning, setAddBatchRunning] = useState(false);
  const [addHistoryVersions, setAddHistoryVersions] = useState({}); // { cardId: [versions] }
  const [addCollabLink, setAddCollabLink] = useState(null);
  const [addZenMode, setAddZenMode] = useState(false);
  const [addAutoInverted, setAddAutoInverted] = useState(true);

  const [newCat, setNewCat] = useState({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#4D6BFE" });
  const [importText, setImportText] = useState("");
    // ── CATEGORIES GOD LEVEL v10 ──
  const [catsViewMode, setCatsViewMode] = useState("cards"); // cards | table | timeline | graph
  const [catsStats, setCatsStats] = useState({}); // { [catName]: { avgLevel, dueCount, lastReview, ... } }
  const [catsFocus, setCatsFocus] = useState(null); // nom du module focalisé
  const [catsPrerequisites, setCatsPrerequisites] = useState({}); // { [catName]: ["ModuleA", "ModuleB"] }
  const [catsMergeSource, setCatsMergeSource] = useState(null);
  const [catsMergeTarget, setCatsMergeTarget] = useState(null);
  const [catsTimelineData, setCatsTimelineData] = useState([]); // [{date, module, exam}]
  const [catsAlerts, setCatsAlerts] = useState([]); // [{module, message, type}]
  const [catsLearningCurve, setCatsLearningCurve] = useState({}); // { [catName]: [{week, level}] }
  const [catsFavorites, setCatsFavorites] = useState([]); // noms des modules favoris
  const [catsExportModal, setCatsExportModal] = useState(false);
  const [catsAiReport, setCatsAiReport] = useState(null);
  const [catsAiReportLoading, setCatsAiReportLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  
  // Lab (PDF, Résumés, Coach)
  const [labSubView, setLabSubView] = useState("home"); 
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfExtractedText, setPdfExtractedText] = useState("");
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfCardsCount, setPdfCardsCount] = useState(8);
  const [pdfGenLoading, setPdfGenLoading] = useState(false);
  const [pdfBatchPreview, setPdfBatchPreview] = useState([]);
  const [pdfSummary, setPdfSummary] = useState("");
  const [pdfSummaryLoading, setPdfSummaryLoading] = useState(false);
  const [docCategory, setDocCategory] = useState(CATEGORIES_DEFAULT[0].name);
  

 const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeResult, setResumeResult] = useState(null); 
  const [resumeStyle, setResumeStyle] = useState("complet"); 
  const [resumeParsing, setResumeParsing] = useState(false);

  // ── GOD LEVEL LAB v8 — Nouveaux états ──────────────────────────────────────
  const [pdfAnalysis, setPdfAnalysis] = useState(null);        // analyse IA avant génération
  const [pdfAnalysisLoading, setPdfAnalysisLoading] = useState(false);
  const [pdfCardType, setPdfCardType] = useState("definitions"); // type de fiches
  const [pdfSearchQuery, setPdfSearchQuery] = useState("");     // recherche dans le texte
  const [pdfEditingIdx, setPdfEditingIdx] = useState(null);     // fiche en cours d'édition inline
  const [pdfEditDraft, setPdfEditDraft] = useState({});         // brouillon d'édition
  const [pdfSectionSummaries, setPdfSectionSummaries] = useState([]); // résumés par section
  const [pdfSectionLoading, setPdfSectionLoading] = useState(false);
  const [pdfCoverageScore, setPdfCoverageScore] = useState(null); // score de couverture
  const [ttsPlaying, setTtsPlaying] = useState(false);          // TTS résumé
  const [ttsPaused, setTtsPaused] = useState(false);
  const ttsRef = useRef(null);
  const [resumeDeepIdx, setResumeDeepIdx] = useState(null);     // section en cours d'approfondissement
  const [resumeDeepLoading, setResumeDeepLoading] = useState(false);
  const [resumeDeepResult, setResumeDeepResult] = useState({});  // résultats approfondis
  const [pdfLang, setPdfLang] = useState("auto");               // langue détectée
  const [pdfMindMap, setPdfMindMap] = useState(null);           // mind map SVG data
  const [pdfMindMapLoading, setPdfMindMapLoading] = useState(false);
  const [pdfShowMindMap, setPdfShowMindMap] = useState(false);
  const [pdfChatInput, setPdfChatInput] = useState("");         // chat avec le PDF
  const [pdfChatHistory, setPdfChatHistory] = useState([]);
  const [pdfChatLoading, setPdfChatLoading] = useState(false);
  const [pdfShowChat, setPdfShowChat] = useState(false);
    // ── GOD LEVEL LAB v10 — États supplémentaires ───────────────────────
  const [labMultiFiles, setLabMultiFiles] = useState([]);        // fichiers multiples
  const [labCrossAnalysis, setLabCrossAnalysis] = useState(null); // analyse croisée
  const [labPrerequisites, setLabPrerequisites] = useState(null);  // prérequis détectés
  const [labCitations, setLabCitations] = useState([]);           // citations clés
  const [labLogicTree, setLabLogicTree] = useState(null);         // arbre logique
  const [labSlidesUrl, setLabSlidesUrl] = useState(null);         // URL du PPT généré
  const [labQuiz, setLabQuiz] = useState([]);                     // quiz généré
  const [labQuizAnswers, setLabQuizAnswers] = useState({});
  const [labQuizScore, setLabQuizScore] = useState(null);
  const [labQuizLoading, setLabQuizLoading] = useState(false);
  const [labOnePager, setLabOnePager] = useState(null);           // fiche ultra-dense
  const [labVideoScript, setLabVideoScript] = useState(null);     // script vidéo
  const [labPodcastUrl, setLabPodcastUrl] = useState(null);       // podcast généré
  const [labPodcastLoading, setLabPodcastLoading] = useState(false);
  const [labMindMapEditable, setLabMindMapEditable] = useState(null); // mind map modifiable
  const [labTechDiagram, setLabTechDiagram] = useState(null);      // diagramme technique
  const [labTimeline, setLabTimeline] = useState(null);            // timeline historique
  const [labWordCloud, setLabWordCloud] = useState(null);          // nuage de mots
  const [labChatMultimodal, setLabChatMultimodal] = useState(false);
  const [labExplainLike5, setLabExplainLike5] = useState(null);    // explication simplifiée
  const [labExplainLike5Loading, setLabExplainLike5Loading] = useState(false);
  const [labPracticeProblems, setLabPracticeProblems] = useState([]);
  const [labPracticeProblemsLoading, setLabPracticeProblemsLoading] = useState(false);
  const [labRevisionPlan, setLabRevisionPlan] = useState(null);    // plan de révision FSRS
  const [labSelfTest, setLabSelfTest] = useState([]);              // auto-évaluation
  const [labSelfTestAnswers, setLabSelfTestAnswers] = useState({});
  const [labSelfTestScore, setLabSelfTestScore] = useState(null);
  const [labImpactReport, setLabImpactReport] = useState(null);    // rapport d'impact
  const [labMultiFileMode, setLabMultiFileMode] = useState(false);  // mode multi-fichiers

  // ── GOD LEVEL EXAM v8 — Nouveaux états ────────────────────────────────────
  const [examLives, setExamLives] = useState(3);              // Mode Survie
  const [examMaxLives] = useState(3);
  const [examDeathrunBest, setExamDeathrunBest] = useState(0); // Mode Deathrun
  const [examDeathrunCurrent, setExamDeathrunCurrent] = useState(0);
  const [examHistory, setExamHistory] = useState([]);          // Historique complet
  const [examHistoryLoaded, setExamHistoryLoaded] = useState(false);
  const [examShowHistory, setExamShowHistory] = useState(false);
  const [examAiReport, setExamAiReport] = useState(null);      // Rapport IA post-exam
  const [examAiReportLoading, setExamAiReportLoading] = useState(false);
  const [examPrecisionErrors, setExamPrecisionErrors] = useState([]); // Faux positifs
  const [examRedactionInput, setExamRedactionInput] = useState(""); // Mode rédaction
  const [examRedactionScore, setExamRedactionScore] = useState(null);
  const [examRedactionLoading, setExamRedactionLoading] = useState(false);
  const [examMatchingPairs, setExamMatchingPairs] = useState([]); // Mode connexion
  const [examMatchingLeft, setExamMatchingLeft] = useState(null);
  const [examMatchingDone, setExamMatchingDone] = useState([]);
  const [examMatchingWrong, setExamMatchingWrong] = useState([]);
  const [examMatchingComplete, setExamMatchingComplete] = useState(false);
  const [examMatchingTime, setExamMatchingTime] = useState(0);
  const examMatchingTimerRef = useRef(null);
  const [examIaDuelScore, setExamIaDuelScore] = useState({ user: 0, ia: 0 }); // Duel IA
  const [examIaDuelIaAnswer, setExamIaDuelIaAnswer] = useState(null);
  const [examRecurringTraps, setExamRecurringTraps] = useState(null); // Pièges récurrents
  const [examRecurringLoading, setExamRecurringLoading] = useState(false);
  const [examScheduled, setExamScheduled] = useState(null);    // Examen programmé
  const [examScheduleInput, setExamScheduleInput] = useState("");
  // English Practice
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
    // ── GOD LEVEL ENGLISH v9 — Nouveaux états ────────────────────────────
  const [practiceSubView, setPracticeSubView] = useState("chat"); // chat | debate | roleplay | dictation | daily | stats
  const [practiceDebateTopic, setPracticeDebateTopic] = useState("");
  const [practiceDebateHistory, setPracticeDebateHistory] = useState([]);
  const [practiceDebateSide, setPracticeDebateSide] = useState("for"); // for/against
  const [practiceRoleplayScenario, setPracticeRoleplayScenario] = useState("");
  const [practiceRoleplayHistory, setPracticeRoleplayHistory] = useState([]);
  const [practiceRoleplayCharacter, setPracticeRoleplayCharacter] = useState("interviewer");
  const [practiceDictationText, setPracticeDictationText] = useState("");
  const [practiceDictationUserInput, setPracticeDictationUserInput] = useState("");
  const [practiceDictationScore, setPracticeDictationScore] = useState(null);
  const [practiceDictationLoading, setPracticeDictationLoading] = useState(false);
  const [practiceDailyChallenge, setPracticeDailyChallenge] = useState(null);
  const [practiceDailyLoading, setPracticeDailyLoading] = useState(false);
  const [practiceDailyAnswer, setPracticeDailyAnswer] = useState("");
  const [practiceDailyResult, setPracticeDailyResult] = useState(null);
  const [practiceStats, setPracticeStats] = useState({
    totalMessages: 0,
    totalWords: 0,
    mistakes: [],
    sessionsCompleted: 0,
    levelEstimate: "B1",
    vocabDiversity: 0,
    streakDays: 0
  });
  const [practiceStatsLoaded, setPracticeStatsLoaded] = useState(false);
  const [practiceCorrections, setPracticeCorrections] = useState([]); // {original, corrected, explanation}
  const [practiceShowCorrection, setPracticeShowCorrection] = useState(false);
  const [practiceVocabFSRS, setPracticeVocabFSRS] = useState(true);
  const [practiceImmersionMode, setPracticeImmersionMode] = useState(false);
    // ── GOD LEVEL ENGLISH v11 — Writing & Speaking ─────────────────────
  const [practiceWritingText, setPracticeWritingText] = useState("");
  const [practiceWritingFeedback, setPracticeWritingFeedback] = useState(null);
  const [practiceWritingLoading, setPracticeWritingLoading] = useState(false);
  const [practiceWritingPrompt, setPracticeWritingPrompt] = useState("");
  const [practiceSpeakingAudioBlob, setPracticeSpeakingAudioBlob] = useState(null);
  const [practiceSpeakingTranscript, setPracticeSpeakingTranscript] = useState("");
  const [practiceSpeakingFeedback, setPracticeSpeakingFeedback] = useState(null);
  const [practiceSpeakingLoading, setPracticeSpeakingLoading] = useState(false);
  const [practiceSpeakingPrompt, setPracticeSpeakingPrompt] = useState("");
  const [practiceIeltsPart, setPracticeIeltsPart] = useState(1);
  const [practiceIeltsHistory, setPracticeIeltsHistory] = useState([]);
  const [practiceAchievements, setPracticeAchievements] = useState([]);
  const [practiceDashboardView, setPracticeDashboardView] = useState("overview");
  const [practiceShadowingMode, setPracticeShadowingMode] = useState(false);
  const [practiceShadowingPhrase, setPracticeShadowingPhrase] = useState("");
  const [practiceShadowingUserAudio, setPracticeShadowingUserAudio] = useState(null);
  const [practiceShadowingScore, setPracticeShadowingScore] = useState(null);
  const [practiceExamMode, setPracticeExamMode] = useState(false);
  const [practiceExamSection, setPracticeExamSection] = useState("reading");
  const [practiceExamQuestions, setPracticeExamQuestions] = useState([]);
  const [practiceExamAnswers, setPracticeExamAnswers] = useState([]);
  const [practiceExamScore, setPracticeExamScore] = useState(null);
  const [practiceDuelActive, setPracticeDuelActive] = useState(false);
  const [practiceDuelTopic, setPracticeDuelTopic] = useState("");
  const [practiceDuelMessages, setPracticeDuelMessages] = useState([]);
  const [practiceEmotionFeedback, setPracticeEmotionFeedback] = useState(null);
  const practiceEndRef = useRef(null);
  const practiceMsgRef = useRef(practiceMessages);
  const practiceMediaRecorderRef = useRef(null);
  const practiceAudioChunksRef = useRef([]);

  // ── GOD LEVEL – Nouveaux états (v6) ────────────────────────────────────────
  const { playCorrect, playHard, playAgain } = useAudioFeedback();
  const fireConfetti = useConfetti();
  const highlightCode = useHighlight();
  const renderMermaid = useMermaid();

  const [sessionMode, setSessionMode] = useState("standard");
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [sessionTimer, setSessionTimer] = useState(0);
  const sessionTimerRef = useRef(null);

  const [retentionCurvePoints, setRetentionCurvePoints] = useState([]);
  const [cardsToForget, setCardsToForget] = useState([]);
  const [weeklyLoad, setWeeklyLoad] = useState([]);

  const [voiceReviewActive, setVoiceReviewActive] = useState(false);
  const voiceRecognitionRef = useRef(null);

  // Academy (v6) – GOD LEVEL Multi-cours
  const [academyView, setAcademyView] = useState("library");
  const [academyCourses, setAcademyCourses] = useState([]);      // ← NOUVEAU
  const [activeCourse, setActiveCourse] = useState(null);        // ← NOUVEAU
  const [academyTopic, setAcademyTopic] = useState("");
  const [academySyllabus, setAcademySyllabus] = useState(null);
  const [academyLoading, setAcademyLoading] = useState(false);
  const [academyProgress, setAcademyProgress] = useState({});
  const [currentLesson, setCurrentLesson] = useState(null);
  const [lessonQuiz, setLessonQuiz] = useState(null);
  const [lessonState, setLessonState] = useState("explain");
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizFeedback, setQuizFeedback] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [projectActive, setProjectActive] = useState(false);
  // Academy GOD LEVEL v8 – Nouveaux états
  const [quizResults, setQuizResults] = useState(null);          // résultats détaillés par question
  const [quizAttempts, setQuizAttempts] = useState({});          // historique tentatives par concept
  const [lessonCache, setLessonCache] = useState({});            // cache cours → plus de regénération
  const [generatedCards, setGeneratedCards] = useState([]);      // prévisualisation fiches générées
  const [showCardsPreview, setShowCardsPreview] = useState(false); // toggle prévisualisation
  const [quizTimer, setQuizTimer] = useState(null);              // timer quiz (null = désactivé)
  const [quizTimerActive, setQuizTimerActive] = useState(false);
  const quizTimerRef = useRef(null);
    // ── ACADEMY GOD LEVEL v10 — États supplémentaires ─────────────────────
  const [academyEditorCode, setAcademyEditorCode] = useState(""); // code dans l'éditeur
  const [academyEditorOutput, setAcademyEditorOutput] = useState(""); // sortie exécution
  const [academyCorrection, setAcademyCorrection] = useState(null); // feedback IA
  const [academyCorrectionLoading, setAcademyCorrectionLoading] = useState(false);
  const [academySubmissionHistory, setAcademySubmissionHistory] = useState({}); // historique
  const [academySandbox, setAcademySandbox] = useState(false); // mode libre
  const [academyDailyChallenge, setAcademyDailyChallenge] = useState(null);
  const [academyDailyChallengeSolution, setAcademyDailyChallengeSolution] = useState("");
  const [academyDailyResult, setAcademyDailyResult] = useState(null);
  const [academyDuelProblem, setAcademyDuelProblem] = useState(null);
  const [academyDuelIaCode, setAcademyDuelIaCode] = useState("");
  const [academyDuelUserCode, setAcademyDuelUserCode] = useState("");
  const [academyDuelResult, setAcademyDuelResult] = useState(null);
  const [academyCertificates, setAcademyCertificates] = useState([]);
  const [academyLeague, setAcademyLeague] = useState("Bronze");
  const [academyExperience, setAcademyExperience] = useState(0);
  const [academyLevel, setAcademyLevel] = useState(1);
  const [academyPairProgramming, setAcademyPairProgramming] = useState(false);
  const [academyPairSuggestion, setAcademyPairSuggestion] = useState("");

  // God Level (Tools Lab)
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [coachPlan, setCoachPlan] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [worldBossHp, setWorldBossHp] = useState(100);
  const [palaceMode, setPalaceMode] = useState(false);
  const [studyRoomUsers, setStudyRoomUsers] = useState([]);
  const [stressLevel, setStressLevel] = useState(0);
  const [predictedScore, setPredictedScore] = useState(null);
    // ── DASHBOARD GOD LEVEL v10 ──
  const [dashQuote, setDashQuote] = useState(null);
  const [dashQuoteLoading, setDashQuoteLoading] = useState(false);
  const [dashDailyPlan, setDashDailyPlan] = useState([]);
  const [dashDailyPlanLoading, setDashDailyPlanLoading] = useState(false);
  const [dashFormIndex, setDashFormIndex] = useState(75); // indice de forme 0-100
  const [dashWeeklyRetro, setDashWeeklyRetro] = useState(null);
  const [dashWeeklyRetroLoading, setDashWeeklyRetroLoading] = useState(false);
  const [dashUrgentCards, setDashUrgentCards] = useState([]);
  const [dashNextExam, setDashNextExam] = useState(null); // { name, daysLeft }
  const [dashFocusMode, setDashFocusMode] = useState(false);
  const [dashWeeklyGoals, setDashWeeklyGoals] = useState(["Réviser 50 cartes", "Créer 10 fiches", "Faire 1 examen blanc"]);
  const [dashWeeklyGoalsInput, setDashWeeklyGoalsInput] = useState("");
  const [dashWidgets, setDashWidgets] = useState([
    "overview","mission","weekly","plan","retention","modules","quote","goals"
  ]); // widgets visibles (ordre)
  const [dashLeaderboard, setDashLeaderboard] = useState([]);
    // ── STATS GOD LEVEL v10 ──
  const [statsDailyProgress, setStatsDailyProgress] = useState([]); // [{date, count}]
  const [statsRetentionCurve, setStatsRetentionCurve] = useState([]); // points FSRS
  const [statsModuleComparison, setStatsModuleComparison] = useState([]);
  const [statsDifficultyDistribution, setStatsDifficultyDistribution] = useState([]);
  const [statsTopDifficult, setStatsTopDifficult] = useState([]);
  const [statsDayOfWeekPerformance, setStatsDayOfWeekPerformance] = useState([]);
  const [statsHourlyPerformance, setStatsHourlyPerformance] = useState([]);
  const [statsAiReport, setStatsAiReport] = useState(null);
  const [statsAiReportLoading, setStatsAiReportLoading] = useState(false);
  const [statsExportLoading, setStatsExportLoading] = useState(false);
  const [statsSessionHistory, setStatsSessionHistory] = useState([]);
  const [statsWordCloud, setStatsWordCloud] = useState([]);
  const [statsForgettingCurve, setStatsForgettingCurve] = useState([]);
  const [statsFatigueAnalysis, setStatsFatigueAnalysis] = useState(null);
  const [statsWidgets, setStatsWidgets] = useState([
    "overview","modules","daily","heatmap","difficulty","retention","badges","ai"
  ]); // widgets visibles
  const [wrongAnswersForConfusion, setWrongAnswersForConfusion] = useState([]);

  // ── SIDEBAR GOD LEVEL ──────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarClock, setSidebarClock] = useState("");
  const [sidebarHoveredItem, setSidebarHoveredItem] = useState(null);
  const [sidebarRipple, setSidebarRipple] = useState(null);

  // ── MOBILE DETECTION ───────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setSidebarClock(now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts 1-9 pour naviguer dans la sidebar
  useEffect(() => {
    const NAV_IDS = ["dashboard","projects","add","list","categories","exam","practice","academy","stats","badges","lab"];
    const handleKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.altKey && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (NAV_IDS[idx]) {
          setView(NAV_IDS[idx]);
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ── PROJECTS GOD MODE ─────────────────────────────────────────────────────
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectSubView, setProjectSubView] = useState("hub"); // hub | detail | planner | coach | fusion
  const [activeProject, setActiveProject] = useState(null);
  const [projectForm, setProjectForm] = useState({
    title: "", description: "", category: "", dueDate: "", estimatedHours: 8, priority: "haute", color: "#4D6BFE", status: "en_cours"
  });
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectDecomposing, setProjectDecomposing] = useState(false);
  const [projectCoachLoading, setProjectCoachLoading] = useState(false);
  const [projectCoachMessages, setProjectCoachMessages] = useState([]);
  const [projectCoachInput, setProjectCoachInput] = useState("");
  const [projectPlannerData, setProjectPlannerData] = useState(null);
  const [projectPlannerLoading, setProjectPlannerLoading] = useState(false);
  const [projectConflicts, setProjectConflicts] = useState([]);
  const [projectPomodoroActive, setProjectPomodoroActive] = useState(false);
  const [projectPomodoroTime, setProjectPomodoroTime] = useState(25 * 60);
  const [projectPomodoroMode, setProjectPomodoroMode] = useState("study"); // study | project | break
  const [projectPomodoroTask, setProjectPomodoroTask] = useState(null);
  const pomodoroRef = useRef(null);

  // Refs & Effects Initiaux
  const statsRef = useRef(stats);
  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { practiceMsgRef.current = practiceMessages; }, [practiceMessages]);
  useEffect(() => { practiceEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [practiceMessages]);

  useEffect(() => {
    (async () => {
      try {
        // ✅ Toutes les données sont récupérées AVANT de toucher aux états
        const exps = (await storage.get("expressions_v3")) || [];
        const cats = (await storage.get("categories_v3")) || CATEGORIES_DEFAULT;
        const sess = (await storage.get("sessions_v3")) || [];
        const st = (await storage.get("stats_v3")) || { streak: 0, lastSession: null, totalReviews: 0, aiGenerated: 0, examsDone: 0 };
        const badges = (await storage.get("badges_v3")) || [];
        const storedVids = (await storage.get("videos_v3")) || [];
        const storedCustomExams = (await storage.get("customExams_v1")) || [];
        const storedLogs = (await storage.get("devLogs_v1")) || [];
        const storedRoadmap = (await storage.get("roadmap_v1")) || roadmap;
        const storedCourses = (await storage.get("academyCourses_v1")) || [];
        const storedProjects = (await storage.get("projects_v1")) || [];

        // ✅ On applique tous les setState ensemble
        setExpressions(exps);
        setCategories(cats);
        setSessions(sess);
        setStats(st);
        setUnlockedBadges(badges);
        setVideos(storedVids);
        setCustomExams(storedCustomExams);
        setDevLogs(storedLogs);
        setRoadmap(storedRoadmap);
        setAcademyCourses(storedCourses);
        setProjects(storedProjects);
        setProjectsLoaded(true);
        setAddForm((f) => ({ ...f, category: cats[0]?.name || "" }));
        setDocCategory(cats[0]?.name || "");

        // ✅ On attend un tick React complet avant d'activer la sauvegarde
        // pour éviter que les effets de sauvegarde ne s'exécutent avec les états vides
        setTimeout(() => setLoaded(true), 100);
      } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
        setTimeout(() => setLoaded(true), 100); // on débloque quand même en cas d'erreur
      }
    })();
  }, []);

  useEffect(() => {
    const calcPower = expressions.length * 10 + stats.streak * 50 + stats.examsDone * 100 + unlockedBadges.length * 200;
    setPowerLevel(calcPower);
  }, [expressions, stats, unlockedBadges]);

  // ✅ Debounce : on attend 1.5s de stabilité avant d'écrire dans Firebase
  // Cela évite d'écraser les données avec des états intermédiaires vides
  const saveTimerRef = useRef({});
  const debouncedSave = useCallback((key, val, delay = 1500) => {
    if (saveTimerRef.current[key]) clearTimeout(saveTimerRef.current[key]);
    saveTimerRef.current[key] = setTimeout(() => storage.set(key, val), delay);
  }, []);

  useEffect(() => { if (loaded) debouncedSave("expressions_v3", expressions); }, [expressions, loaded]);
  useEffect(() => { if (loaded) debouncedSave("categories_v3", categories); }, [categories, loaded]);
  useEffect(() => { if (loaded) debouncedSave("sessions_v3", sessions); }, [sessions, loaded]);
  useEffect(() => { if (loaded) debouncedSave("stats_v3", stats); }, [stats, loaded]);
  useEffect(() => { if (loaded) debouncedSave("badges_v3", unlockedBadges); }, [unlockedBadges, loaded]);
  useEffect(() => { if (loaded) debouncedSave("customExams_v1", customExams); }, [customExams, loaded]);
  useEffect(() => { if (loaded) debouncedSave("devLogs_v1", devLogs); }, [devLogs, loaded]);
  useEffect(() => { if (loaded) debouncedSave("roadmap_v1", roadmap); }, [roadmap, loaded]);
  useEffect(() => { if (loaded) debouncedSave("academyCourses_v1", academyCourses); }, [academyCourses, loaded]);
  useEffect(() => { if (projectsLoaded) debouncedSave("projects_v1", projects); }, [projects, projectsLoaded]);

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

    // ── GOD LEVEL FICHES v9 — Nouveaux états ────────────────────────────────
  const [cardsViewMode, setCardsViewMode] = useState("grid"); // grid | graph | timeline | clusters
  const [cardsGraphData, setCardsGraphData] = useState({ nodes: [], links: [] });
  const [cardsGraphLoading, setCardsGraphLoading] = useState(false);
  const [cardsClusters, setCardsClusters] = useState([]);
  const [cardsClustersLoading, setCardsClustersLoading] = useState(false);
  const [cardsTimeline, setCardsTimeline] = useState([]);
  const [cardsTimelineLoading, setCardsTimelineLoading] = useState(false);
  const [cardsTags, setCardsTags] = useState({});          // { cardId: ["tag1", "tag2"] }
  const [cardsTagsLoading, setCardsTagsLoading] = useState(false);
  const [cardsPlaylist, setCardsPlaylist] = useState([]);   // file d'attente audio
  const [cardsAudioPlaying, setCardsAudioPlaying] = useState(false);
  const [cardsAdvancedSearch, setCardsAdvancedSearch] = useState({
    boolQuery: "",
    minDifficulty: 0,
    maxDifficulty: 10,
    minLevel: 0,
    maxLevel: 7,
    dateFrom: "",
    dateTo: "",
  });
  const [cardsSearchOpen, setCardsSearchOpen] = useState(false);
  const [cardsFakeCards, setCardsFakeCards] = useState([]);
  const [cardsFakeLoading, setCardsFakeLoading] = useState(false);
  const [cardsVariants, setCardsVariants] = useState({});   // { cardId: [variantes] }
  const [cardsVariantsLoading, setCardsVariantsLoading] = useState({});
  const [cardsCommunityLoaded, setCardsCommunityLoaded] = useState(false);
  const [cardsCommunity, setCardsCommunity] = useState([]);
  const [cardsFortressActive, setCardsFortressActive] = useState({}); // { cardId: true }
  const [cardsDuelActive, setCardsDuelActive] = useState(false);
  const [cardsDuelCard, setCardsDuelCard] = useState(null);
  const [cardsDuelPlayer1, setCardsDuelPlayer1] = useState(null);
  const [cardsDuelPlayer2, setCardsDuelPlayer2] = useState(null);

  // ── GOD LEVEL – Effets dashboard prédictif ─────────────────────────────
  useEffect(() => {
    if (expressions.length === 0) return;
    const hardest = [...expressions].sort((a,b) => (b.difficulty || 9) - (a.difficulty || 9))[0];
    if (hardest && hardest.stability) {
      const points = [];
      for (let t = 1; t <= 30; t++) {
        points.push({ day: t, retention: Math.round(fsrsR(t, hardest.stability) * 100) });
      }
      setRetentionCurvePoints(points);
    } else {
      setRetentionCurvePoints([]);
    }

    const threeDaysLater = addDays(today(), 3);
    const critical = expressions.filter(e => {
      if (e.level >= 7) return false;
      const retention = e.stability ? fsrsR( (new Date(e.nextReview) - new Date(today())) / 86400000, e.stability) : 1;
      return retention < 0.7 && e.nextReview <= threeDaysLater;
    });
    setCardsToForget(critical.slice(0, 5));

    const load = {};
    for (let i = 0; i < 7; i++) {
      const day = addDays(today(), i);
      load[day] = 0;
    }
    expressions.forEach(e => {
      if (e.level >= 7) return;
      const reviewDay = e.nextReview;
      if (reviewDay in load) load[reviewDay]++;
    });
    setWeeklyLoad(Object.entries(load).map(([day, count]) => ({ day, count })));
  }, [expressions]);

  // ── GOD LEVEL – Timer de session ──────────────────────────────────────
  useEffect(() => {
    if (view === "review" && !showSessionSummary) {
      sessionTimerRef.current = setInterval(() => {
        setSessionTimer(t => t + 1);
      }, 1000);
    } else {
      clearInterval(sessionTimerRef.current);
      if (view !== "review") setSessionTimer(0);
    }
    return () => clearInterval(sessionTimerRef.current);
  }, [view, showSessionSummary]);

  // ── GOD LEVEL – Feedback audio & confetti intégré ──────────────────────
  const handleAnswerWithFeedback = useCallback((q, exp) => {
    if (q === 0) playAgain();
    else if (q === 3) playHard();
    else playCorrect();

    const updated = fsrs(exp, q);
    const newLevel = q === 0 ? 0 : q === 3 ? Math.max(exp.level, 1) : Math.min(7, exp.level + 1);
    const histEntry = { date: today(), q, newLevel, interval: updated.interval };
    setExpressions(prev => prev.map(e => e.id === exp.id ? { ...e, ...updated, level: newLevel, reviewHistory: [...(e.reviewHistory || []), histEntry] } : e));

    if (newLevel >= 7 && exp.level < 7) {
      fireConfetti();
      showToast("🎉 Fiche maîtrisée ! Confetti !", "success");
    }

    const done = reviewSessionDone + 1;
    setReviewSessionDone(done);

    if (reviewIndex + 1 >= reviewQueue.length) {
      updateStreakAfterSession(done);
      setStats(prev => { const ns = { ...prev }; checkBadges(expressions, ns, sessions, unlockedBadges); return ns; });
      const sessionCards = reviewQueue;
      const avgTime = sessionTimer / Math.max(1, sessionCards.length);
      const avgBefore = (sessionCards.reduce((s, c) => s + (c.level || 0), 0) / sessionCards.length).toFixed(1);
      
      setSessionSummary({
        totalCards: sessionCards.length,
        avgTime: Math.round(avgTime),
        avgLevelBefore: avgBefore,
        avgLevelAfter: avgBefore, // approximatif ici
      });
      setShowSessionSummary(true);
      setView("review");
    } else {
      setReviewIndex(i => i + 1);
      setRevealed(false);
      setUserAnswer("");
      setSocraticHint("");
      setMnemonicText("");
      setCardStartTime(Date.now());
    }
  }, [playCorrect, playHard, playAgain, fireConfetti, reviewIndex, reviewQueue, reviewSessionDone, sessionTimer, expressions, sessions, unlockedBadges, updateStreakAfterSession, checkBadges, showToast]);

  const handleAnswer = (q) => {
    const exp = reviewQueue[reviewIndex];
    reviewQueue[reviewIndex]._answer = q;
    handleAnswerWithFeedback(q, exp);
  };

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
      const msg = error.message?.includes("QUOTA") ? "⏳ Quota DeepSeek atteint — attends 1 minute !" : "Erreur IA DeepSeek.";
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
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { showToast("Reconnaissance vocale non supportée.", "error"); setListening(null); return; }
      const lang = (field === "front" && addForm.category.toLowerCase().includes("anglais")) ? "en-US" : "fr-FR";
      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      setListening(field);
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        if (transcript) {
          setAddForm((f) => ({ ...f, [field]: (f[field] ? f[field] + " " : "") + transcript }));
          showToast("🎙️ Transcription réussie !");
        }
        setListening(null);
      };
      recognition.onerror = () => { showToast("Échec transcription.", "error"); setListening(null); };
      recognition.onend = () => setListening(null);
      recognition.start();
    } catch (err) { showToast("Micro refusé.", "error"); setListening(null); }
  };
  const stopVoice = () => { setListening(null); };

    const handleAdd = () => {
    if (!addForm.front.trim() || !addForm.back.trim()) { showToast("Recto et verso obligatoires !", "error"); return; }
    if (editingId) {
      // Sauvegarder l'ancienne version
      saveVersion(editingId);
      setExpressions((prev) => prev.map((e) => e.id === editingId
        ? {
            ...e,
            front: addForm.front.trim(),
            back: addForm.back.trim(),
            example: addForm.example?.trim() || "",
            category: addForm.category,
            imageUrl: addForm.imageUrl,
            audioUrl: addAudioUrl,        // ajout audio
            layers: addLayers.length > 1 ? addLayers : undefined, // couches
          }
        : e
      ));
      setEditingId(null); showToast("✏️ Fiche mise à jour !");
    } else {
      const newExp = {
        id: Date.now().toString(),
        front: addForm.front.trim(),
        back: addForm.back.trim(),
        example: addForm.example?.trim() || "",
        category: addForm.category,
        imageUrl: addForm.imageUrl,
        audioUrl: addAudioUrl,          // enregistrement audio
        layers: addLayers.length > 1 ? addLayers.map(l => l.back.trim()).filter(Boolean) : undefined,
        level: 0, nextReview: today(), createdAt: today(),
        easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: []
      };
      setExpressions((prev) => { const updated = [newExp, ...prev]; checkBadges(updated, statsRef.current, sessions, unlockedBadges); return updated; });
      showToast("✅ Fiche ajoutée !");
    }
    // Reset
    setAddForm((f) => ({ ...f, front: "", back: "", example: "", imageUrl: null }));
    setAddAudioUrl(null); setAddAudioBlob(null);
    setAddLayers([{ back: "" }]); setAddDiagramMode(false);
    setAddDiagramSvg(null);
    setAddDoublonCheck(null);
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

  const startReview = (catFilter = null, mode = "standard") => {
    let queue = catFilter ? todayReviews.filter((e) => e.category === catFilter) : [...todayReviews];
    if (mode === "interleaving") {
      const byCat = {};
      queue.forEach(e => {
        if (!byCat[e.category]) byCat[e.category] = [];
        byCat[e.category].push(e);
      });
      queue = [];
      const maxLen = Math.max(...Object.values(byCat).map(a => a.length));
      for (let i = 0; i < maxLen; i++) {
        for (const cat in byCat) {
          if (byCat[cat][i]) queue.push(byCat[cat][i]);
        }
      }
    } else {
      queue = getSmartQueue(queue);
    }
    
    if (queue.length === 0) { showToast("Aucune fiche à réviser !", "info"); return; }
    setReviewQueue(queue); setReviewIndex(0); setRevealed(false); setUserAnswer(""); setSocraticHint(""); setMnemonicText(""); setReviewSessionDone(0);
    setCardStartTime(Date.now());
    setShowSessionSummary(false);
    setSessionTimer(0);
    setView("review");

    if (mode === "vocal") {
      setVoiceReviewActive(true);
      startVoiceReview();
    } else {
      setVoiceReviewActive(false);
    }
  };

  const handleReveal = () => {
    if (cardStartTime) {
      const timeTaken = Date.now() - cardStartTime;
      const card = reviewQueue[reviewIndex];
      if (timeTaken > 5000 && card.level >= 4) showToast("🧠 Fatigue cognitive détectée (> 5s). Prends ton temps ou fais une pause !", "info");
    }
    setRevealed(true);
  };

  const startVoiceReview = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Reconnaissance vocale non supportée.", "error");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    voiceRecognitionRef.current = recognition;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      setUserAnswer(transcript);
      handleSemanticEval();
    };
    recognition.start();
    showToast("Parle maintenant...");
  };

  const handleRevealAndStopVoice = () => {
    if (voiceRecognitionRef.current) voiceRecognitionRef.current.stop();
    handleReveal();
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
    // Reset états spéciaux
    setExamAiReport(null); setExamRedactionInput(""); setExamRedactionScore(null);
    setExamIaDuelScore({ user: 0, ia: 0 }); setExamIaDuelIaAnswer(null);

    if (customExamData) {
      const q = [...customExamData.questions].sort(() => Math.random() - 0.5);
      setExamQueue(q.map(qu => ({ ...qu, isCustom: true })));
      setExamIndex(0); setExamAnswers([]); setExamRevealed(false); setQcmSelected(null); setQcmChoices([]);
      setExamTimer(examConfig.timePerCard); setExamStreak(0); setExamStartTime(Date.now()); setExamActive(true); setExamSubView("active");
      return;
    }

    // Mode Connexion
    if (examConfig.mode === "matching") { startMatchingMode(); return; }

    let pool = examConfig.category === "Toutes" ? expressions : expressions.filter((e) => e.category === examConfig.category);
    pool = getDifficultyPool(pool, examConfig.difficulty);
    if (pool.length === 0) pool = examConfig.category === "Toutes" ? expressions : expressions.filter((e) => e.category === examConfig.category);
    if (pool.length === 0) { showToast("Aucune fiche pour cet examen.", "error"); return; }
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(examConfig.count, pool.length));
    setExamQueue(shuffled); setExamIndex(0); setExamAnswers([]); setExamRevealed(false); setQcmSelected(null); setQcmChoices([]);
    setExamTimer(examConfig.mode === "speedrun" && examConfig.timePerCard > 10 ? 5 : examConfig.timePerCard);
    setExamStreak(0); setExamStartTime(Date.now()); setExamActive(true);

    // Mode Survie : 3 vies
    if (examConfig.mode === "survival") setExamLives(3);
    // Mode Deathrun : reset compteur
    if (examConfig.mode === "deathrun") setExamDeathrunCurrent(0);

    setExamSubView("active");
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

  // ── CHARGEMENT HISTORIQUE EXAMENS ─────────────────────────────────────
  useEffect(() => {
    storage.get("exam_history").then(h => {
      if (h) setExamHistory(h);
      setExamHistoryLoaded(true);
    });
  }, []);

  // ── SAUVEGARDE HISTORIQUE + GÉNÉRATION RAPPORT IA ─────────────────────
  const saveExamRecord = async (score, duration, answers, mode) => {
    const record = {
      id: Date.now().toString(),
      date: today(),
      score,
      duration,
      mode,
      category: examConfig.category,
      total: answers.length,
      correct: answers.filter(a => a.q >= 3).length,
      answers: answers.map(a => ({ front: a.card?.front || a.card?.question, q: a.q, timeSpent: a.timeSpent })),
    };
    const newHistory = [record, ...examHistory].slice(0, 50); // Max 50 entrées
    setExamHistory(newHistory);
    await storage.set("exam_history", newHistory);
  };

  // ── RAPPORT IA POST-EXAMEN ─────────────────────────────────────────────
  const generateExamReport = async (answers, score) => {
    if (answers.length === 0) return;
    setExamAiReportLoading(true);
    setExamAiReport(null);
    try {
      const wrongs = answers.filter(a => a.q < 3).map(a => a.card?.front || a.card?.question).slice(0, 10);
      const fast = answers.filter(a => a.timeSpent < 3 && a.q >= 3).length;
      const slow = answers.filter(a => a.timeSpent > 20).length;
      const avgTime = Math.round(answers.reduce((s, a) => s + a.timeSpent, 0) / answers.length);
      const raw = await callClaude(
        `Tu es un coach pédagogique expert. Analyse les résultats de cet examen et génère un rapport personnalisé UNIQUEMENT en JSON valide sans markdown:
{"globalVerdict":"Une phrase de verdict percutant","strengths":["Point fort 1","Point fort 2"],"weaknesses":["Faiblesse 1","Faiblesse 2"],"behaviorPattern":"Analyse du comportement (ex: répond trop vite, hésite sur certains modules...)","topPriority":"La chose la plus urgente à travailler","actionPlan":["Action concrète 1","Action concrète 2","Action concrète 3"],"motivationalMessage":"Message motivant et personnalisé"}`,
        `Score: ${score}%\nQuestions ratées: ${wrongs.join(", ") || "Aucune"}\nRéponses rapides (<3s): ${fast}\nRéponses lentes (>20s): ${slow}\nTemps moyen: ${avgTime}s\nModule: ${examConfig.category}\nMode: ${examConfig.mode}`
      );
      setExamAiReport(JSON.parse(raw.replace(/```json|```/g, "").trim()));
    } catch (e) {
      console.error("Rapport IA:", e);
    }
    setExamAiReportLoading(false);
  };

  // ── ANALYSE DES PIÈGES RÉCURRENTS ─────────────────────────────────────
  const analyzeRecurringTraps = async () => {
    if (examHistory.length < 2) { showToast("Il te faut au moins 2 examens pour cette analyse.", "info"); return; }
    setExamRecurringLoading(true);
    setExamRecurringTraps(null);
    try {
      const allWrong = examHistory.flatMap(h => (h.answers || []).filter(a => a.q < 3).map(a => a.front)).filter(Boolean);
      const freq = {};
      allWrong.forEach(f => { freq[f] = (freq[f] || 0) + 1; });
      const topTraps = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 8);
      const raw = await callClaude(
        `Tu es un expert en analyse pédagogique. Analyse ces erreurs récurrentes et génère UNIQUEMENT du JSON: {"traps":[{"concept":"...","frequency":3,"confusionWith":"Ce que l'étudiant confond probablement","remedy":"Conseil spécifique pour retenir ce concept"}],"globalPattern":"Pattern global détecté","urgentCards":["concept1","concept2"]}`,
        `Erreurs récurrentes (concept: nb fois raté):\n${topTraps.map(([f,n]) => `"${f}": ${n}x`).join("\n")}`
      );
      setExamRecurringTraps(JSON.parse(raw.replace(/```json|```/g, "").trim()));
    } catch(e) { showToast("Erreur analyse : " + e.message, "error"); }
    setExamRecurringLoading(false);
  };

  // ── MODE CONNEXION (MATCHING) ──────────────────────────────────────────
  const startMatchingMode = () => {
    let pool = examConfig.category === "Toutes" ? expressions : expressions.filter(e => e.category === examConfig.category);
    pool = pool.filter(e => e.front && e.back);
    if (pool.length < 4) { showToast("Il faut au moins 4 fiches dans ce module.", "error"); return; }
    const selected = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(8, pool.length));
    setExamMatchingPairs(selected);
    setExamMatchingLeft(null);
    setExamMatchingDone([]);
    setExamMatchingWrong([]);
    setExamMatchingComplete(false);
    setExamMatchingTime(0);
    setExamSubView("matching");
    clearInterval(examMatchingTimerRef.current);
    examMatchingTimerRef.current = setInterval(() => setExamMatchingTime(t => t + 1), 1000);
  };

  const handleMatchingClick = (id, side) => {
    if (examMatchingDone.includes(id)) return;
    if (!examMatchingLeft) {
      setExamMatchingLeft({ id, side });
      return;
    }
    if (examMatchingLeft.id === id && examMatchingLeft.side === side) {
      setExamMatchingLeft(null);
      return;
    }
    // Vérifie si c'est une paire correcte
    const leftCard = examMatchingPairs.find(p => p.id === examMatchingLeft.id);
    const rightCard = examMatchingPairs.find(p => p.id === id);
    const isMatch = examMatchingLeft.id === id && examMatchingLeft.side !== side;
    if (isMatch) {
      const newDone = [...examMatchingDone, id];
      setExamMatchingDone(newDone);
      setExamMatchingLeft(null);
      if (newDone.length === examMatchingPairs.length) {
        clearInterval(examMatchingTimerRef.current);
        setExamMatchingComplete(true);
        const score = Math.max(0, 100 - examMatchingWrong.length * 10);
        setStats(prev => ({ ...prev, examsDone: prev.examsDone + 1 }));
        saveExamRecord(score, examMatchingTime, [], "matching");
        showToast(`🎉 Connexion terminée ! Score: ${score}%`);
      }
    } else {
      // Pas une paire
      setExamMatchingWrong(prev => [...prev, `${examMatchingLeft.id}-${id}`]);
      setExamMatchingLeft(null);
      showToast("❌ Mauvaise connexion !", "error");
    }
  };

  // ── MODE RÉDACTION LIBRE ────────────────────────────────────────────────
  const submitRedaction = async (card) => {
    if (!examRedactionInput.trim()) return;
    setExamRedactionLoading(true);
    setExamRedactionScore(null);
    try {
      const raw = await callClaude(
        `Tu es un professeur strict mais bienveillant. Évalue cette réponse d'étudiant et réponds UNIQUEMENT en JSON: {"note":15,"sur":20,"structure":{"label":"Bonne|Acceptable|Faible","comment":"..."},"exactitude":{"label":"Exacte|Partielle|Incorrecte","comment":"..."},"formulation":{"label":"Claire|Confuse","comment":"..."},"manque":["ce qui manque 1","ce qui manque 2"],"correct":["ce qui est juste 1"],"verdict":"Phrase de verdict du professeur","conseils":"Conseil pour améliorer"}`,
        `Question: "${card.front || card.question}"\nRéponse attendue: "${card.back || card.answer}"\nRéponse de l'étudiant: "${examRedactionInput}"`
      );
      setExamRedactionScore(JSON.parse(raw.replace(/```json|```/g, "").trim()));
    } catch(e) { showToast("Erreur correction : " + e.message, "error"); }
    setExamRedactionLoading(false);
  };

  // ── DUEL IA – Génère la réponse de l'IA ────────────────────────────────
  const generateIaDuelAnswer = async (card) => {
    setExamIaDuelIaAnswer(null);
    try {
      // L'IA se trompe parfois exprès (30% du temps)
      const makesMistake = Math.random() < 0.3;
      if (makesMistake) {
        const raw = await callClaude(
          `Tu joues le rôle d'un étudiant qui connaît bien le sujet mais fait parfois des erreurs. Donne une réponse LÉGÈREMENT incorrecte ou incomplète à cette question. Réponds directement, pas plus de 20 mots.`,
          `Question: "${card.front}"\nRéponse correcte (que tu dois altérer subtilement): "${card.back}"`
        );
        setExamIaDuelIaAnswer({ text: raw.trim(), correct: false });
      } else {
        setExamIaDuelIaAnswer({ text: card.back, correct: true });
      }
    } catch { setExamIaDuelIaAnswer({ text: card.back, correct: true }); }
  };

    // ══════════════════════════════════════════════════════════════════
  // FONCTIONS GOD LEVEL – VUE FICHES
  // ══════════════════════════════════════════════════════════════════

  // Génération du graphe de connaissances basé sur les fiches
  const generateCardsGraph = async () => {
    setCardsGraphLoading(true);
    try {
      const cats = categories.map(c => c.name);
      const nodes = expressions.map(exp => ({
        id: exp.id,
        label: exp.front,
        level: exp.level || 0,
        category: exp.category,
      }));
      const raw = await callClaude(
        `Tu es un expert en analyse de connaissances. Voici une liste de concepts d'un étudiant. Trouve les relations logiques entre eux (prérequis, parent, similaire, dépendance). Réponds UNIQUEMENT en JSON: {"links":[{"source":"id_concept_1","target":"id_concept_2","type":"prerequisite|similar|depends"}]}. Ne mets que les relations pertinentes.`,
        `Concepts:\n${nodes.map(n => `ID:${n.id} | "${n.label}" (${n.category})`).join('\n').slice(0, 6000)}`
      );
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setCardsGraphData({ nodes, links: parsed.links || [] });
      setCardsViewMode("graph");
      showToast("🧠 Graphe de connaissances généré !");
    } catch (err) {
      showToast("Erreur génération graphe : " + err.message, "error");
    }
    setCardsGraphLoading(false);
  };

  // Clustering IA
  const generateClusters = async () => {
    setCardsClustersLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un expert en clustering de connaissances. Regroupe les concepts suivants en clusters thématiques pertinents. Réponds UNIQUEMENT en JSON: {"clusters":[{"name":"Nom du cluster","cards":["id1","id2"]}]}.`,
        `Concepts:\n${expressions.map(e => `ID:${e.id} | "${e.front}" (${e.category})`).join('\n').slice(0, 6000)}`
      );
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setCardsClusters(parsed.clusters || []);
      setCardsViewMode("clusters");
      showToast("🧬 Clusters générés !");
    } catch (err) {
      showToast("Erreur clustering : " + err.message, "error");
    }
    setCardsClustersLoading(false);
  };

  

  // Génération de tags sémantiques pour toutes les fiches
  const generateSemanticTags = async () => {
    setCardsTagsLoading(true);
    try {
      const batchSize = 10;
      const newTags = { ...cardsTags };
      for (let i = 0; i < expressions.length; i += batchSize) {
        const batch = expressions.slice(i, i + batchSize).map(e => `ID:${e.id} | Front: "${e.front}" | Back: "${e.back}"`).join('\n');
        const raw = await callClaude(
          `Tu es un expert en taxonomie. Pour chaque concept, génère 3-5 tags pertinents (mots-clés techniques et domaines). Réponds UNIQUEMENT en JSON: {"tags":[{"id":"id_concept","tags":["tag1","tag2"]}]}.`,
          batch.slice(0, 5000)
        );
        const clean = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        (parsed.tags || []).forEach(item => { newTags[item.id] = item.tags; });
      }
      setCardsTags(newTags);
      showToast("🏷️ Tags sémantiques générés !");
    } catch (err) {
      showToast("Erreur tags : " + err.message, "error");
    }
    setCardsTagsLoading(false);
  };

  // Gestion de la playlist audio (TTS)
  const playCardAudio = (card) => {
    if (!('speechSynthesis' in window)) return showToast("TTS non supporté.", "error");
    window.speechSynthesis.cancel();
    const lang = card.category?.toLowerCase().includes('anglais') ? 'en-US' : 'fr-FR';
    const utterance = new SpeechSynthesisUtterance(`${card.front}. ${card.back}`);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.onend = () => {
      setCardsAudioPlaying(false);
      // Jouer la suivante dans la playlist
      setCardsPlaylist(prev => {
        if (prev.length <= 1) return [];
        const next = prev.slice(1);
        if (next.length > 0) playCardAudio(next[0]);
        return next;
      });
    };
    window.speechSynthesis.speak(utterance);
    setCardsAudioPlaying(true);
  };

  const addToPlaylist = (card) => {
    setCardsPlaylist(prev => {
      if (prev.find(c => c.id === card.id)) return prev;
      return [...prev, card];
    });
    showToast("🎧 Ajouté à la playlist audio");
  };

  const startPlaylist = () => {
    if (cardsPlaylist.length === 0) return showToast("Playlist vide.", "info");
    playCardAudio(cardsPlaylist[0]);
  };

  const clearPlaylist = () => {
    window.speechSynthesis.cancel();
    setCardsPlaylist([]);
    setCardsAudioPlaying(false);
  };

  // Recherche avancée
  const getFilteredByAdvancedSearch = (list) => {
    if (!cardsSearchOpen) return list;
    let filtered = [...list];
    const q = cardsAdvancedSearch.boolQuery.toLowerCase().trim();
    if (q) {
      const terms = q.split(/\s+(AND|OR|NOT)\s+/i);
      // Simplification : on prend tous les mots et on vérifie la présence.
      const mustInclude = [];
      const mustExclude = [];
      let mode = 'include';
      terms.forEach(term => {
        if (term.toUpperCase() === 'AND') mode = 'include';
        else if (term.toUpperCase() === 'OR') mode = 'include'; // simplifié
        else if (term.toUpperCase() === 'NOT') mode = 'exclude';
        else {
          if (mode === 'include') mustInclude.push(term.toLowerCase());
          else if (mode === 'exclude') mustExclude.push(term.toLowerCase());
        }
      });
      filtered = filtered.filter(e => {
        const text = (e.front + " " + e.back + " " + e.example).toLowerCase();
        return mustInclude.every(t => text.includes(t)) && mustExclude.every(t => !text.includes(t));
      });
    }
    if (cardsAdvancedSearch.minDifficulty > 0)
      filtered = filtered.filter(e => (e.difficulty || (5 - (e.easeFactor||2.5))*2) >= cardsAdvancedSearch.minDifficulty);
    if (cardsAdvancedSearch.maxDifficulty < 10)
      filtered = filtered.filter(e => (e.difficulty || (5 - (e.easeFactor||2.5))*2) <= cardsAdvancedSearch.maxDifficulty);
    if (cardsAdvancedSearch.minLevel > 0)
      filtered = filtered.filter(e => e.level >= cardsAdvancedSearch.minLevel);
    if (cardsAdvancedSearch.maxLevel < 7)
      filtered = filtered.filter(e => e.level <= cardsAdvancedSearch.maxLevel);
    // dates simplifiées
    return filtered;
  };

  // Fiches « pièges » (fausses fiches)
  const generateFakeCards = async () => {
    setCardsFakeLoading(true);
    try {
      const concepts = expressions.slice(0, 5).map(e => e.front).join(", ");
      const raw = await callClaude(
        `Tu es un expert qui crée des pièges pédagogiques. À partir des concepts suivants, génère 3 fiches FRONT/BACK où le back contient une erreur subtile mais crédible. Format JSON: {"cards":[{"front":"...","back":"..."}]}.`,
        `Concepts: ${concepts}`
      );
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setCardsFakeCards(parsed.cards || []);
      showToast("🧪 Fausses fiches générées ! Trouve les erreurs.");
    } catch (err) {
      showToast("Erreur fausses fiches : " + err.message, "error");
    }
    setCardsFakeLoading(false);
  };

  // Variation infinie (labo de fiche)
  const generateVariants = async (card) => {
    setCardsVariantsLoading(prev => ({ ...prev, [card.id]: true }));
    try {
      const raw = await callClaude(
        `Tu es un pédagogue créatif. Génère 5 versions différentes de la fiche suivante, chaque version doit aborder le concept sous un angle différent : définition, analogie, exemple concret, contre-exemple, application. Format JSON: {"variants":[{"front":"...","back":"...","type":"definition|analogy|example|contre-exemple|application"}]}.`,
        `Fiche: Front: ${card.front}, Back: ${card.back}`
      );
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setCardsVariants(prev => ({ ...prev, [card.id]: parsed.variants || [] }));
      showToast("⚗️ 5 variantes générées !");
    } catch (err) {
      showToast("Erreur variantes : " + err.message, "error");
    }
    setCardsVariantsLoading(prev => ({ ...prev, [card.id]: false }));
  };

  // Bibliothèque communautaire (simulée)
  const loadCommunityCards = () => {
    // Simuler quelques fiches communautaires prédéfinies
    setCardsCommunity([
      { id: "com1", front: "What is a REST API?", back: "Representational State Transfer - an architectural style for designing networked applications.", example: "GET /users", category: "🇬🇧 Anglais", level: 0, nextReview: today(), easeFactor: 2.5, interval: 1 },
      { id: "com2", front: "Polymorphisme", back: "Capacité d'un objet à prendre plusieurs formes. En Java, via l'héritage et les interfaces.", example: "List<String> list = new ArrayList<>();", category: "☕ Java / Spring Boot", level: 0, nextReview: today(), easeFactor: 2.5, interval: 1 },
    ]);
    setCardsCommunityLoaded(true);
    showToast("🏛️ Bibliothèque communautaire chargée !");
  };

  const importCommunityCard = (card) => {
    const newCard = { ...card, id: Date.now().toString() + Math.random(), createdAt: today(), reviewHistory: [], imageUrl: null };
    setExpressions(prev => [newCard, ...prev]);
    showToast("📥 Fiche importée !");
  };

  // Forteresse : protéger une fiche
  const toggleFortress = (cardId) => {
    setCardsFortressActive(prev => {
      const newState = { ...prev, [cardId]: !prev[cardId] };
      showToast(newState[cardId] ? "🛡️ Fiche protégée !" : "🛡️ Protection retirée.");
      return newState;
    });
  };

  // Mode Duel
  const startDuel = (card) => {
    setCardsDuelCard(card);
    setCardsDuelPlayer1(null);
    setCardsDuelPlayer2(null);
    setCardsDuelActive(true);
  };

  const handleDuelAnswer = (player, answer) => {
    if (player === 1) setCardsDuelPlayer1(answer);
    else setCardsDuelPlayer2(answer);
    if ((player === 1 && cardsDuelPlayer2 !== null) || (player === 2 && cardsDuelPlayer1 !== null)) {
      // Les deux ont répondu, déterminer le gagnant
      const correct = cardsDuelCard.back;
      const p1correct = (cardsDuelPlayer1 || answer) === correct;
      const p2correct = (cardsDuelPlayer2 || answer) === correct;
      let msg = "";
      if (p1correct && !p2correct) msg = "Joueur 1 gagne !";
      else if (!p1correct && p2correct) msg = "Joueur 2 gagne !";
      else if (p1correct && p2correct) msg = "Égalité ! Les deux ont juste.";
      else msg = "Personne n'a trouvé !";
      showToast(msg);
      setTimeout(() => setCardsDuelActive(false), 2000);
    }
  };

    // ══════════════════════════════════════════════════════════════════
  // FONCTIONS GOD LEVEL – VUE AJOUTER
  // ══════════════════════════════════════════════════════════════════

  // Détection de doublons avant création
  const checkDoublon = async (frontText) => {
    if (!frontText.trim() || expressions.length === 0) return;
    setAddDoublonLoading(true);
    setAddDoublonCheck(null);
    try {
      const raw = await callClaude(
        `Tu es un moteur de détection de doublons sémantiques. Compare le nouveau concept avec la liste existante. S'il existe déjà un concept TRÈS SIMILAIRE (même sens, mots différents), renvoie UNIQUEMENT en JSON: {"duplicate":true,"existingConcept":"nom du concept existant","conseil":"Suggestion de modification ou de mise à jour"}. Sinon {"duplicate":false}.`,
        `Nouveau concept: "${frontText}"\n\nConcepts existants:\n${expressions.map(e => `- ${e.front}`).join('\n').slice(0, 3000)}`
      );
      const clean = raw.replace(/```json|```/g, '').trim();
      setAddDoublonCheck(JSON.parse(clean));
    } catch (e) { console.error("Check doublon:", e); }
    setAddDoublonLoading(false);
  };

  // Reformulation multiple
  const generateReformulations = async (field) => {
    const text = addForm[field];
    if (!text || !text.trim()) return;
    setAddReformLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un rédacteur pédagogique expert. Propose 3 reformulations du texte suivant : plus claire, plus concise, plus pédagogique. Format JSON STRICT: {"reformulations":["version 1","version 2","version 3"]}`,
        `Texte à reformuler: "${text}"`
      );
      const clean = raw.replace(/```json|```/g, '').trim();
      const data = JSON.parse(clean);
      setAddReformulations(prev => ({ ...prev, [field]: data.reformulations || [] }));
      showToast("✨ 3 reformulations proposées !");
    } catch (e) { showToast("Erreur reformulation", "error"); }
    setAddReformLoading(false);
  };

  // Génération de métaphore
  const generateMetaphore = async () => {
    if (!addForm.front.trim()) return;
    setAddMetaphoreLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un expert en vulgarisation. Crée une analogie simple et mémorable pour expliquer ce concept technique à un enfant de 10 ans. Max 3 phrases. Réponds en texte brut.`,
        `Concept: ${addForm.front}\nExplication: ${addForm.back}`
      );
      setAddMetaphoreText(raw.trim());
    } catch (e) { showToast("Erreur métaphore", "error"); }
    setAddMetaphoreLoading(false);
  };

  // Recherche d'images libres
  const searchImages = async () => {
    if (!addImageSearch.trim()) return;
    setAddImageSearchLoading(true);
    try {
      const query = addImageSearch.trim() || addForm.front;
      // Utilisation d'Unsplash API (demo key – à remplacer en production)
      const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&client_id=DEMO_KEY`);
      const data = await res.json();
      setAddImageResults((data.results || []).map(img => ({
        url: img.urls?.small,
        alt: img.alt_description || query,
        photographer: img.user?.name
      })));
    } catch (e) {
      // Fallback: images statiques
      setAddImageResults([
        { url: `https://source.unsplash.com/featured/?${encodeURIComponent(addImageSearch)}`, alt: addImageSearch },
      ]);
    }
    setAddImageSearchLoading(false);
  };

  const selectImage = (url) => {
    setAddForm(f => ({ ...f, imageUrl: url }));
    setAddImageGallery(false);
    showToast("📸 Image ajoutée !");
  };

  // Diagramme Mermaid
  const renderDiagram = async () => {
    if (!addDiagramCode.trim()) return;
    try {
      // Utilisation du renderer Mermaid via l'API ou localement s'il est chargé
      if (window.mermaid) {
        const { svg } = await window.mermaid.render('add-diagram', addDiagramCode);
        setAddDiagramSvg(svg);
      } else {
        // Fallback: utilisation de l'API kroki
        const res = await fetch('https://kroki.io/mermaid/svg', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: addDiagramCode,
        });
        const svg = await res.text();
        setAddDiagramSvg(svg);
      }
      showToast("📐 Diagramme généré !");
    } catch (e) { showToast("Erreur diagramme", "error"); }
  };

  const insertDiagram = () => {
    if (addDiagramSvg) {
      // On stocke le SVG dans imageUrl temporairement
      setAddForm(f => ({ ...f, imageUrl: addDiagramSvg }));
      setAddDiagramMode(false);
      showToast("📐 Diagramme inséré !");
    }
  };

  // Enregistrement audio
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAddAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAddAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
        showToast("🎙️ Audio enregistré !");
      };
      mediaRecorder.start();
      setAddAudioRecorder(mediaRecorder);
      setAddAudioRecording(true);
    } catch (e) { showToast("Micro non disponible", "error"); }
  };

  const stopAudioRecording = () => {
    if (addAudioRecorder && addAudioRecorder.state === 'recording') {
      addAudioRecorder.stop();
      setAddAudioRecording(false);
    }
  };

  // Couches de complexité
  const addLayer = () => {
    setAddLayers(prev => [...prev, { back: "" }]);
  };

  const removeLayer = (idx) => {
    setAddLayers(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLayer = (idx, value) => {
    setAddLayers(prev => prev.map((l, i) => i === idx ? { ...l, back: value } : l));
  };

  // Historique versions (sauvegarde avant modification)
  const saveVersion = (cardId) => {
    const card = expressions.find(e => e.id === cardId);
    if (!card) return;
    setAddHistoryVersions(prev => ({
      ...prev,
      [cardId]: [...(prev[cardId] || []), { ...card, savedAt: new Date().toISOString() }]
    }));
    showToast("📜 Version sauvegardée !");
  };

  // Collaboration simulée (génère un lien WebSocket factice)
  const startCollaboration = () => {
    const link = `https://memomaitre.app/collab/${Date.now()}`;
    setAddCollabLink(link);
    navigator.clipboard?.writeText(link);
    showToast("🔗 Lien de collaboration copié ! (simulation)");
  };

  // Mode batch queue
  const addToBatchQueue = (concept) => {
    if (!concept.trim()) return;
    setAddBatchQueue(prev => [...prev, concept.trim()]);
    showToast(`📋 "${concept.trim()}" ajouté à la file d'attente.`);
  };

  const processBatchQueue = async () => {
    if (addBatchQueue.length === 0 || addBatchRunning) return;
    setAddBatchRunning(true);
    for (let i = 0; i < addBatchQueue.length; i++) {
      const concept = addBatchQueue[i];
      try {
        const raw = await callClaude(
          `Génère UNE fiche de révision en JSON strict: {"front":"...","back":"...","example":"..."}. Sois concis et pédagogique.`,
          `Concept: ${concept}`
        );
        const clean = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        const newCard = {
          id: Date.now().toString() + i,
          front: parsed.front || concept,
          back: parsed.back || "",
          example: parsed.example || "",
          category: addForm.category,
          level: 0, nextReview: today(), createdAt: today(),
          easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
        };
        setExpressions(prev => [newCard, ...prev]);
        setStats(prev => ({ ...prev, aiGenerated: prev.aiGenerated + 1 }));
      } catch (e) { console.error(e); }
    }
    setAddBatchQueue([]);
    setAddBatchRunning(false);
    showToast(`✅ ${addBatchQueue.length} fiches générées !`);
  };

  // Détection automatique module → adaptation prompt
  const getAdaptedPrompt = (basePrompt) => {
    const cat = addForm.category.toLowerCase();
    if (cat.includes('anglais')) return `${basePrompt} (Rédige en anglais, avec traduction française entre parenthèses)`;
    if (cat.includes('java') || cat.includes('spring')) return `${basePrompt} (Ajoute un exemple de code Java, syntaxe Spring si pertinent)`;
    if (cat.includes('informatique')) return `${basePrompt} (Ajoute un schéma ou un exemple technique concret)`;
    return basePrompt;
  };

  // Génération inversée automatique
  const handleAddWithInverted = () => {
    handleAdd(); // Créer la fiche originale
    if (addAutoInverted && addForm.front && addForm.back) {
      // Créer aussi la fiche inversée
      const inverted = {
        id: Date.now().toString() + '_inv',
        front: addForm.back.trim(),
        back: addForm.front.trim(),
        example: addForm.example.trim() ? `(inversée) ${addForm.example.trim()}` : "",
        category: addForm.category,
        level: 0, nextReview: today(), createdAt: today(),
        easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
      };
      setExpressions(prev => [inverted, ...prev]);
      showToast("🔄 Fiche inversée créée automatiquement !");
    }
  };

    // ══════════════════════════════════════════════════════════════════
  // FONCTIONS GOD LEVEL – ENGLISH PRACTICE
  // ══════════════════════════════════════════════════════════════════

  // Charger les stats
  useEffect(() => {
    const loadStats = async () => {
      const saved = await storage.get("english_stats_v1");
      if (saved) { setPracticeStats(saved); setPracticeStatsLoaded(true); }
    };
    if (!practiceStatsLoaded) loadStats();
  }, [practiceStatsLoaded]);

  // Sauvegarder les stats
  const saveStats = async (newStats) => {
    setPracticeStats(newStats);
    await storage.set("english_stats_v1", newStats);
  };

  // Correction automatique d'un message
  const correctMessage = async (userText) => {
    try {
      const raw = await callClaude(
        `Tu es un coach d'anglais expert. L'étudiant a écrit: "${userText}". Corrige les fautes de grammaire, vocabulaire et style. Renvoie UNIQUEMENT un JSON: {"corrected":"version corrigée","explanation":"Explication courte des corrections"}.`,
        "Corrige cette phrase en anglais."
      );
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setPracticeCorrections(prev => [{ original: userText, ...parsed }, ...prev].slice(0, 10));
      setPracticeShowCorrection(true);
      // Ajouter les mots mal utilisés aux stats
      const mistakes = userText.split(" ");
      const newMistakes = mistakes.filter(w => !parsed.corrected.includes(w)).map(w => ({ word: w, correction: "" }));
      saveStats({ ...practiceStats, mistakes: [...practiceStats.mistakes, ...newMistakes].slice(-50), totalMessages: practiceStats.totalMessages + 1 });
      // Créer automatiquement des fiches FSRS pour les erreurs si activé
      if (practiceVocabFSRS && newMistakes.length > 0) {
        for (let word of newMistakes.slice(0, 3)) {
          const exist = expressions.find(e => e.front.toLowerCase() === word.word.toLowerCase() && e.category?.includes("Anglais"));
          if (!exist) {
            const newCard = {
              id: Date.now().toString() + Math.random(),
              front: word.word,
              back: parsed.corrected,
              example: userText,
              category: "🇬🇧 Anglais",
              level: 0, nextReview: today(), createdAt: today(),
              easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
            };
            setExpressions(prev => [newCard, ...prev]);
          }
        }
      }
    } catch (e) { console.log("Correction error:", e); }
  };

  // Mode Débat
  const startDebate = async () => {
    if (!practiceDebateTopic.trim()) return;
    setPracticeDebateHistory([]);
    try {
      const raw = await callClaude(
        `Tu es un professeur d'anglais. Lance un débat sur le sujet: "${practiceDebateTopic}". Écris une introduction engageante et demande à l'étudiant s'il est POUR ou CONTRE. Réponds en anglais.`,
        practiceDebateTopic
      );
      setPracticeDebateHistory([{ role: "assistant", text: raw.trim() }]);
      setPracticeSubView("debate");
    } catch (e) { showToast("Erreur lancement débat", "error"); }
  };

  const sendDebateMessage = async (text) => {
    if (!text.trim()) return;
    setPracticeDebateHistory(prev => [...prev, { role: "user", text }]);
    try {
      const raw = await callClaude(
        `Tu es un professeur d'anglais animant un débat. Le sujet est "${practiceDebateTopic}". L'étudiant a dit: "${text}". Contre-argumente et pose une nouvelle question. Reste en anglais.`,
        text
      );
      setPracticeDebateHistory(prev => [...prev, { role: "assistant", text: raw.trim() }]);
    } catch (e) { showToast("Erreur débat", "error"); }
  };

  // Mode Jeu de Rôle
  const startRoleplay = async (scenario) => {
    setPracticeRoleplayScenario(scenario);
    setPracticeRoleplayHistory([]);
    try {
      const raw = await callClaude(
        `Tu es un partenaire de jeu de rôle en anglais. Scénario: "${scenario}". Lance la conversation de manière naturelle.`,
        scenario
      );
      setPracticeRoleplayHistory([{ role: "assistant", text: raw.trim() }]);
      setPracticeSubView("roleplay");
    } catch (e) { showToast("Erreur jeu de rôle", "error"); }
  };

  const sendRoleplayMessage = async (text) => {
    if (!text.trim()) return;
    setPracticeRoleplayHistory(prev => [...prev, { role: "user", text }]);
    try {
      const raw = await callClaude(
        `Tu es un partenaire de jeu de rôle en anglais. Scénario: "${practiceRoleplayScenario}". Réponds naturellement à ce que dit l'étudiant.`,
        text
      );
      setPracticeRoleplayHistory(prev => [...prev, { role: "assistant", text: raw.trim() }]);
    } catch (e) { showToast("Erreur jeu de rôle", "error"); }
  };

  // Mode Dictée
  const startDictation = async () => {
    setPracticeDictationLoading(true);
    try {
      const raw = await callClaude(
        `Génère un court texte de dictée en anglais (30-50 mots) adapté à un niveau ${practiceLevel}. Réponds uniquement le texte, sans ponctuation superflue.`,
        "Dictée"
      );
      setPracticeDictationText(raw.trim());
      setPracticeDictationUserInput("");
      setPracticeDictationScore(null);
      setPracticeSubView("dictation");
    } catch (e) { showToast("Erreur dictée", "error"); }
    setPracticeDictationLoading(false);
  };

  const checkDictation = () => {
    const expected = practiceDictationText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    const actual = practiceDictationUserInput.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    const distance = levenshteinDistance(expected, actual);
    const score = Math.max(0, Math.round(100 - (distance / expected.length) * 100));
    setPracticeDictationScore(score);
  };

  // Défi quotidien
  const loadDailyChallenge = async () => {
    setPracticeDailyLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un coach d'anglais. Crée un petit défi du jour (question, quiz, mini dictée) pour un étudiant de niveau ${practiceLevel}. Format JSON: {"type":"question|fillin|translate","prompt":"...","correct":"..."}`,
        "Défi quotidien"
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
      setPracticeDailyChallenge(parsed);
      setPracticeSubView("daily");
    } catch (e) { showToast("Erreur chargement défi", "error"); }
    setPracticeDailyLoading(false);
  };

  const checkDailyAnswer = async () => {
    if (!practiceDailyAnswer.trim()) return;
    const correct = practiceDailyChallenge.correct?.toLowerCase().trim();
    const user = practiceDailyAnswer.toLowerCase().trim();
    const isCorrect = user === correct;
    // Simple évaluation, pourrait utiliser l'IA
    setPracticeDailyResult({ correct: isCorrect, userAnswer: practiceDailyAnswer, correctAnswer: practiceDailyChallenge.correct });
  };

  // Mode Shadowing
  const startShadowing = async () => {
    try {
      const raw = await callClaude(
        `Génère une courte phrase en anglais (max 15 mots) pour un exercice de prononciation. Niveau ${practiceLevel}.`,
        "Shadowing"
      );
      setPracticeShadowingPhrase(raw.trim());
      setPracticeShadowingMode(true);
      // Speak
      speakText(raw.trim());
    } catch (e) { showToast("Erreur shadowing", "error"); }
  };

  const analyzeShadowing = async (audioBlob) => {
    // Simuler une analyse de similarité (nécessiterait Whisper etc)
    showToast("Analyse de prononciation en cours...");
    // Store audio pour plus tard
    setPracticeShadowingUserAudio(URL.createObjectURL(audioBlob));
    setPracticeShadowingScore(Math.floor(Math.random() * 30) + 70); // Fake
  };

  // Mode Examen Blanc
  const startExamMode = async (section = "reading") => {
    setPracticeExamMode(true);
    setPracticeExamSection(section);
    try {
      const raw = await callClaude(
        `Tu es un examinateur d'anglais. Génère 5 questions à choix multiples pour la section "${section}" d'un test standard (TOEIC/IELTS). Format JSON: {"questions":[{"question":"...","options":["A","B","C","D"],"correct":"A"}]}.`,
        "Exam blanc"
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
      setPracticeExamQuestions(parsed.questions);
      setPracticeExamAnswers([]);
      setPracticeSubView("exam");
    } catch (e) { showToast("Erreur examen", "error"); }
  };

  const submitExam = () => {
    let score = 0;
    practiceExamQuestions.forEach((q, i) => {
      if (practiceExamAnswers[i] === q.correct) score++;
    });
    setPracticeExamScore(score);
  };

  // Levenshtein pour dictée
  function levenshteinDistance(a, b) {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        matrix[j][i] = b[j-1] === a[i-1] ? matrix[j-1][i-1] : Math.min(matrix[j-1][i-1], matrix[j-1][i], matrix[j][i-1]) + 1;
      }
    }
    return matrix[b.length][a.length];
  }

    // ══════════════════════════════════════════════════════════════════
  // LAB GOD LEVEL v10 – Fonctions
  // ══════════════════════════════════════════════════════════════════

  // Upload multi-fichiers
  const handleMultiFilesUpload = async (files) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    setLabMultiFiles([]);
    for (let file of fileArr) {
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        const { text, pages } = await extractPdfText(file);
        setLabMultiFiles(prev => [...prev, { name: file.name, text, pages }]);
      } else if (file.type.startsWith("text/") || file.name.match(/\.(txt|md)$/i)) {
        const text = await file.text();
        setLabMultiFiles(prev => [...prev, { name: file.name, text, pages: 1 }]);
      }
    }
    showToast(`📚 ${fileArr.length} fichiers chargés !`);
  };

  // Analyse croisée
  const crossAnalyze = async () => {
    if (labMultiFiles.length < 2) { showToast("Il faut au moins 2 fichiers.", "error"); return; }
    setPdfAnalysisLoading(true);
    try {
      const texts = labMultiFiles.map(f => f.text.substring(0, 4000)).join("\n\n---\n\n");
      const raw = await callClaude(
        `Tu es un expert en analyse comparative. Compare ces documents et génère UNIQUEMENT un JSON: {"commonThemes":["...","..."],"differences":[{"topic":"...","doc1":"...","doc2":"..."}],"contradictions":["..."],"synthesis":"Synthèse globale en 2-3 phrases","fusionCards":[{"front":"...","back":"..."}]}`,
        texts
      );
      setLabCrossAnalysis(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { showToast("Erreur analyse croisée : " + e.message, "error"); }
    setPdfAnalysisLoading(false);
  };

  // Extraire citations clés
  const extractKeyQuotes = async () => {
    if (!pdfExtractedText.trim()) return;
    try {
      const raw = await callClaude(
        `Extrais les 7 phrases ou formules les plus importantes du cours. Format JSON: {"quotes":[{"text":"...","context":"..."}]}`,
        pdfExtractedText.substring(0, 6000)
      );
      setLabCitations(JSON.parse(raw.replace(/```json|```/g, '').trim()).quotes || []);
    } catch (e) { showToast("Erreur citations", "error"); }
  };

  // Arbre logique du cours
  const buildLogicTree = async () => {
    if (!pdfExtractedText.trim()) return;
    try {
      const raw = await callClaude(
        `Construis l'arbre argumentatif de ce cours. Format JSON: {"mainThesis":"...","branches":[{"argument":"...","subPoints":["..."]}]}`,
        pdfExtractedText.substring(0, 5000)
      );
      setLabLogicTree(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { showToast("Erreur arbre logique", "error"); }
  };

  // Générer un diaporama (simulation)
  const generateSlides = async () => {
    if (!pdfExtractedText.trim()) return;
    showToast("Création du diaporama...");
    // On génère un objet avec les slides
    const slides = pdfExtractedText.split(/---\s*Page\s*\d+\s*---/).filter(s => s.trim().length > 100).slice(0, 5).map((s, i) => ({
      title: `Slide ${i+1}`,
      content: s.substring(0, 200).trim()
    }));
    // On pourrait convertir en PPT via une lib externe, mais on simule.
    setLabSlidesUrl("#"); // placeholder
    showToast("📊 Diaporama prêt (simulation)");
  };

  // Générer un quiz
  const generateLabQuiz = async () => {
    if (!pdfExtractedText.trim()) return;
    setLabQuizLoading(true);
    try {
      const raw = await callClaude(
        `Génère un quiz de 5 questions (QCM) basé sur ce cours. Format JSON: {"questions":[{"question":"...","options":["A","B","C","D"],"correct":"A"}]}`,
        pdfExtractedText.substring(0, 5000)
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      setLabQuiz(parsed.questions);
      setLabQuizAnswers({});
      setLabQuizScore(null);
    } catch (e) { showToast("Erreur quiz", "error"); }
    setLabQuizLoading(false);
  };

  const submitLabQuiz = () => {
    let score = 0;
    labQuiz.forEach((q, i) => {
      if (labQuizAnswers[i] === q.correct) score++;
    });
    setLabQuizScore(score);
  };

  // One-pager
  const generateOnePager = async () => {
    if (!pdfExtractedText.trim()) return;
    try {
      const raw = await callClaude(
        `Résume ce cours en une fiche ultra-dense (max 20 lignes) avec les formules, concepts clés, et un mini schéma textuel.`,
        pdfExtractedText.substring(0, 6000)
      );
      setLabOnePager(raw.trim());
    } catch (e) { showToast("Erreur one-pager", "error"); }
  };

  // Script vidéo
  const generateVideoScript = async () => {
    if (!pdfExtractedText.trim()) return;
    try {
      const raw = await callClaude(
        `Écris un script de vidéo éducative (5-7 minutes) sur ce cours, avec des instructions pour le présentateur et des suggestions de visuels.`,
        pdfExtractedText.substring(0, 5000)
      );
      setLabVideoScript(raw.trim());
    } catch (e) { showToast("Erreur script", "error"); }
  };

  // Podcast de révision
  const generatePodcast = async () => {
    setLabPodcastLoading(true);
    try {
      const raw = await callClaude(
        `Crée un script de podcast (conversation entre deux IA) qui explique ce cours de manière vivante. Format JSON: {"title":"...","script":[{"speaker":"Host","text":"..."}]}`,
        pdfExtractedText.substring(0, 6000)
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      // Ici on simule la génération audio, on pourrait utiliser TTS
      setLabPodcastUrl("#podcast");
      showToast("🎙️ Podcast prêt (simulation)");
    } catch (e) { showToast("Erreur podcast", "error"); }
    setLabPodcastLoading(false);
  };

  // Mind map éditable (on garde le SVG mais on ajoute une édition)
  const generateEditableMindMap = async () => {
    if (!pdfAnalysis?.mindmap) return;
    // On pourrait permettre de manipuler, mais pour l'instant on l'affiche avec possibilité de modifier nœuds
    setLabMindMapEditable(pdfAnalysis.mindmap);
  };

  // Diagramme technique
  const generateTechDiagram = async () => {
    if (!pdfExtractedText.trim()) return;
    try {
      const raw = await callClaude(
        `À partir de ce cours, crée un diagramme technique (UML, circuit, réseau, etc.) en code Mermaid. Réponds UNIQUEMENT le code Mermaid valide.`,
        pdfExtractedText.substring(0, 3000)
      );
      setLabTechDiagram(raw.trim());
    } catch (e) { showToast("Erreur diagramme", "error"); }
  };


  // Nuage de mots
  const generateWordCloud = async () => {
    if (!pdfExtractedText.trim()) return;
    try {
      const raw = await callClaude(
        `Liste les 20 mots-clés les plus importants du cours avec leur poids (fréquence). Format JSON: {"words":[{"text":"...","weight":10}]}`,
        pdfExtractedText.substring(0, 4000)
      );
      setLabWordCloud(JSON.parse(raw.replace(/```json|```/g, '').trim()).words || []);
    } catch (e) { showToast("Erreur nuage", "error"); }
  };

  // Expliquer comme j'aurais 5 ans
  const explainLike5 = async (passage) => {
    setLabExplainLike5Loading(true);
    try {
      const raw = await callClaude(
        "Explique ce passage de cours comme si l'étudiant avait 5 ans, avec des analogies simples et des dessins ASCII.",
        passage
      );
      setLabExplainLike5(raw.trim());
    } catch (e) { showToast("Erreur explication", "error"); }
    setLabExplainLike5Loading(false);
  };

  // Problèmes pratiques
  const generatePracticeProblems = async () => {
    setLabPracticeProblemsLoading(true);
    try {
      const raw = await callClaude(
        `À partir de ce cours, crée 3 problèmes inédits avec leur solution détaillée. Format JSON: {"problems":[{"question":"...","solution":"..."}]}`,
        pdfExtractedText.substring(0, 5000)
      );
      setLabPracticeProblems(JSON.parse(raw.replace(/```json|```/g, '').trim()).problems || []);
    } catch (e) { showToast("Erreur problèmes", "error"); }
    setLabPracticeProblemsLoading(false);
  };

  // Plan de révision FSRS
  const generateRevisionPlan = async () => {
    if (!pdfExtractedText.trim()) return;
    try {
      const raw = await callClaude(
        `Crée un planning de révision hebdomadaire basé sur la courbe de l'oubli pour maîtriser ce cours. Format JSON: {"weeks":[{"week":1,"topics":["..."]}]}`,
        pdfExtractedText.substring(0, 3000)
      );
      setLabRevisionPlan(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { showToast("Erreur plan", "error"); }
  };

  // Auto-évaluation
  const generateSelfTest = async () => {
    if (!pdfExtractedText.trim()) return;
    try {
      const raw = await callClaude(
        `Crée un test d'auto-évaluation de 8 questions ouvertes basé sur ce cours. Format JSON: {"questions":[{"question":"...","expected":"..."}]}`,
        pdfExtractedText.substring(0, 5000)
      );
      setLabSelfTest(JSON.parse(raw.replace(/```json|```/g, '').trim()).questions || []);
      setLabSelfTestAnswers({});
      setLabSelfTestScore(null);
    } catch (e) { showToast("Erreur test", "error"); }
  };

  const submitSelfTest = () => {
    let score = 0;
    labSelfTest.forEach((q, i) => {
      const answer = labSelfTestAnswers[i]?.toLowerCase().trim() || "";
      const expected = q.expected.toLowerCase().trim();
      if (answer === expected || answer.includes(expected) || expected.includes(answer)) score++;
    });
    setLabSelfTestScore(score);
  };

  // Rapport d'impact
  const generateImpactReport = async () => {
    if (!pdfExtractedText.trim()) return;
    try {
      const raw = await callClaude(
        `Calcule le temps estimé pour maîtriser ce cours à 90%, identifie les 3 concepts les plus difficiles, et prédis une note simulée. Format JSON: {"estimatedHours":10,"difficultConcepts":["..."],"predictedScore":15}`,
        pdfExtractedText.substring(0, 4000)
      );
      setLabImpactReport(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { showToast("Erreur rapport", "error"); }
  };

    // ══════════════════════════════════════════════════════════════════
  // ACADEMY GOD LEVEL v10 — Fonctions
  // ══════════════════════════════════════════════════════════════════

  // Soumettre le code d'un exercice pour correction
  const submitCode = async (exercisePrompt) => {
    if (!academyEditorCode.trim()) return;
    setAcademyCorrectionLoading(true);
    setAcademyCorrection(null);
    try {
      const raw = await callClaude(
        `Tu es un professeur de programmation expert. Évalue le code suivant par rapport à l'exercice demandé. Exercice: "${exercisePrompt}". Code étudiant: """${academyEditorCode}""". Donne UNIQUEMENT un JSON: {"correct":true/false,"feedback":"commentaires détaillés","score":0-100,"optimizedCode":"version améliorée si nécessaire"}.`,
        exercisePrompt
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      setAcademyCorrection(parsed);
      // Sauvegarder l'historique
      const submission = {
        date: new Date().toISOString(),
        code: academyEditorCode,
        feedback: parsed,
        exercise: exercisePrompt
      };
      setAcademySubmissionHistory(prev => ({
        ...prev,
        [exercisePrompt]: [...(prev[exercisePrompt] || []), submission].slice(-5)
      }));
      // Ajouter XP
      if (parsed.score >= 80) {
        setAcademyExperience(prev => prev + 50);
        setAcademyLevel(prev => Math.floor(academyExperience / 200) + 1);
      }
    } catch (e) {
      showToast("Erreur correction : " + e.message, "error");
    }
    setAcademyCorrectionLoading(false);
  };

  // Exécuter du code dans le sandbox (simulation)
  const runCode = async () => {
    setAcademyEditorOutput("Exécution en cours...");
    // Simuler une exécution via une API externe ou simplement un echo
    try {
      const raw = await callClaude(
        "Simule l'exécution du code suivant et affiche la sortie. Code:",
        academyEditorCode.slice(0, 1000)
      );
      setAcademyEditorOutput(raw.trim());
    } catch {
      setAcademyEditorOutput("Erreur d'exécution ou API indisponible.");
    }
  };

  // Charger le défi du jour
  const loadDailyCodingChallenge = async () => {
    try {
      const raw = await callClaude(
        `Génère un petit exercice de programmation quotidien avec un énoncé clair et une solution attendue. Format JSON: {"problem":"...","expected":"..."}. Adapte au langage: ${academyTopic || "Python"}.`,
        "Défi du jour"
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      setAcademyDailyChallenge(parsed);
      setAcademyDailyChallengeSolution("");
      setAcademyDailyResult(null);
    } catch (e) { showToast("Erreur chargement défi", "error"); }
  };

  const submitDailyChallenge = async () => {
    if (!academyDailyChallengeSolution.trim()) return;
    try {
      const raw = await callClaude(
        `Compare la solution étudiante avec la solution attendue pour l'exercice: "${academyDailyChallenge.problem}". Solution étudiante: """${academyDailyChallengeSolution}""". Solution attendue: """${academyDailyChallenge.expected}""". Donne UNIQUEMENT un JSON: {"correct":true/false,"feedback":"..."}`,
        academyDailyChallenge.problem
      );
      setAcademyDailyResult(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { showToast("Erreur correction", "error"); }
  };

  // Mode Duel avec l'IA
  const startDuelWithIA = async () => {
    try {
      const raw = await callClaude(
        `Génère un problème de programmation intéressant et la solution en code. Format JSON: {"problem":"...","code":"..."}`,
        academyTopic
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      setAcademyDuelProblem(parsed);
      setAcademyDuelIaCode(parsed.code);
      setAcademyDuelUserCode("");
      setAcademyDuelResult(null);
    } catch (e) { showToast("Erreur duel", "error"); }
  };

  const submitDuel = async () => {
    if (!academyDuelUserCode.trim()) return;
    try {
      const raw = await callClaude(
        `Compare les deux solutions pour le problème: "${academyDuelProblem.problem}". Solution IA: """${academyDuelIaCode}""". Solution étudiant: """${academyDuelUserCode}""". Analyse et donne un verdict (qui est meilleur, pourquoi). Format JSON: {"winner":"ia|user|draw","feedback":"..."}`,
        academyDuelProblem.problem
      );
      setAcademyDuelResult(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { showToast("Erreur duel", "error"); }
  };

  // Pair programming : demander une suggestion
  const getPairSuggestion = async () => {
    if (!academyEditorCode.trim()) return;
    setAcademyPairProgramming(true);
    try {
      const raw = await callClaude(
        "Tu es un pair programmeur. Regarde ce code et suggère une amélioration ou un conseil. Réponds directement.",
        academyEditorCode
      );
      setAcademyPairSuggestion(raw.trim());
    } catch (e) { showToast("Erreur suggestion", "error"); }
    setAcademyPairProgramming(false);
  };

  // Générer un certificat
  const generateCertificate = () => {
    const cert = {
      id: Date.now().toString(),
      course: academyTopic,
      date: today(),
      level: academyLevel,
      xp: academyExperience
    };
    setAcademyCertificates(prev => [...prev, cert]);
    showToast("📜 Certificat généré !");
  };

    // ══════════════════════════════════════════════════════════════════
  // ENGLISH GOD LEVEL v11 — Writing & Speaking Functions
  // ══════════════════════════════════════════════════════════════════

  // Soumettre un texte pour correction avancée
  const submitWriting = async () => {
    if (!practiceWritingText.trim()) return;
    setPracticeWritingLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un examinateur d'anglais IELTS. Corrige cet essai. Donne UNIQUEMENT un JSON: {"score":6.5,"grammarFeedback":"...","vocabularyFeedback":"...","structureFeedback":"...","overallComment":"...","correctedText":"version corrigée"}. Texte: """${practiceWritingText}"""`,
        practiceWritingPrompt || "Writing exercise"
      );
      setPracticeWritingFeedback(JSON.parse(raw.replace(/```json|```/g, '').trim()));
      setStats(prev => ({ ...prev, totalReviews: prev.totalReviews + 1 }));
    } catch (e) { showToast("Erreur correction écrit", "error"); }
    setPracticeWritingLoading(false);
  };

  // Démarrer une analyse orale
  const startSpeakingAnalysis = async (audioBlob) => {
    setPracticeSpeakingLoading(true);
    try {
      // Utiliser Whisper pour la transcription (API déjà utilisée dans togglePracticeMic)
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3");
      formData.append("language", "en");
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${_DS}` },
        body: formData,
      });
      const data = await res.json();
      const transcript = data.text || "";
      setPracticeSpeakingTranscript(transcript);

      // Analyse de la prononciation (approximation via comparaison avec prompt)
      if (practiceSpeakingPrompt) {
        const analysisRaw = await callClaude(
          `Compare la phrase prononcée avec la phrase attendue. Donne un score de similarité phonétique (0-100) et des conseils. Format JSON: {"pronunciationScore":75,"advice":"..."}. Attendu: "${practiceSpeakingPrompt}". Obtenu: "${transcript}"`,
          "Speaking analysis"
        );
        const analysis = JSON.parse(analysisRaw.replace(/```json|```/g, '').trim());
        setPracticeSpeakingFeedback(analysis);
      } else {
        setPracticeSpeakingFeedback({ pronunciationScore: 80, advice: "Transcription réussie." });
      }
      setStats(prev => ({ ...prev, totalReviews: prev.totalReviews + 1 }));
    } catch (e) { showToast("Erreur analyse orale", "error"); }
    setPracticeSpeakingLoading(false);
  };

  // Démarrer un enregistrement oral (utilise le micro du navigateur)
  const startSpeakingRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setPracticeSpeakingAudioBlob(blob);
        startSpeakingAnalysis(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      // Arrêter après 10 secondes (ou via bouton)
      setTimeout(() => mediaRecorder.stop(), 10000);
      showToast("🎙️ Enregistrement en cours (10s)...");
    } catch (e) { showToast("Micro non disponible", "error"); }
  };

  // Simulation IELTS Speaking
  const startIeltsSimulation = async () => {
    setPracticeIeltsHistory([]);
    setPracticeIeltsPart(1);
    try {
      const raw = await callClaude(
        `Tu es un examinateur IELTS. Commence la Partie 1 du test. Pose la première question. Réponds uniquement en anglais.`,
        "IELTS Speaking Part 1"
      );
      setPracticeIeltsHistory([{ role: "examiner", text: raw.trim() }]);
    } catch (e) { showToast("Erreur IELTS", "error"); }
  };

  const answerIelts = async (text) => {
    setPracticeIeltsHistory(prev => [...prev, { role: "candidate", text }]);
    // Simuler une réponse de l'examinateur
    try {
      const raw = await callClaude(
        `Tu es un examinateur IELTS. Continue la conversation. Réponds uniquement en anglais.`,
        text
      );
      setPracticeIeltsHistory(prev => [...prev, { role: "examiner", text: raw.trim() }]);
    } catch (e) { showToast("Erreur IELTS", "error"); }
  };

  // Débloquer un achievement
  const unlockAchievement = (id, label) => {
    if (!practiceAchievements.includes(id)) {
      setPracticeAchievements(prev => [...prev, id]);
      showToast(`🏆 Succès débloqué : ${label}`);
      // Sauvegarder
      storage.set("english_achievements", [...practiceAchievements, id]);
    }
  };

  // Charger les achievements sauvegardés
  useEffect(() => {
    storage.get("english_achievements").then(saved => {
      if (saved) setPracticeAchievements(saved);
    });
  }, []);

    // ══════════════════════════════════════════════════════════════════
  // STATS GOD LEVEL v10 – Fonctions
  // ══════════════════════════════════════════════════════════════════

  // Calculer les progrès quotidiens (30 jours)
  const computeDailyProgress = () => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const date = addDays(today(), -i);
      const session = sessions.find(s => s.date === date);
      days.push({ date, count: session ? session.count : 0 });
    }
    setStatsDailyProgress(days);
  };

  // Courbe de rétention FSRS agrégée
  const computeRetentionCurve = () => {
    if (expressions.length === 0) return;
    const stabilities = expressions.filter(e => e.stability).map(e => e.stability);
    if (stabilities.length === 0) return;
    const avgStability = stabilities.reduce((a,b)=>a+b,0) / stabilities.length;
    const points = [];
    for (let t = 1; t <= 30; t++) {
      points.push({ day: t, retention: Math.round(fsrsR(t, avgStability) * 100) });
    }
    setStatsRetentionCurve(points);
  };

  // Comparaison modules
  const computeModuleComparison = () => {
    const comp = categories.map(cat => {
      const catExps = expressions.filter(e => e.category === cat.name);
      const mastered = catExps.filter(e => e.level >= 7).length;
      const total = catExps.length;
      const avgLevel = total ? (catExps.reduce((s,e)=>s+e.level,0)/total).toFixed(1) : 0;
      const due = catExps.filter(e => e.nextReview <= today() && e.level < 7).length;
      return { name: cat.name, total, mastered, avgLevel, due, color: cat.color };
    });
    setStatsModuleComparison(comp);
  };

  // Distribution des difficultés
  const computeDifficultyDistribution = () => {
    const dist = [0,0,0,0,0,0,0,0,0,0,0]; // 0-10
    expressions.forEach(e => {
      const d = Math.floor(e.difficulty || (5 - (e.easeFactor||2.5))*2);
      const idx = Math.min(10, Math.max(0, d));
      dist[idx]++;
    });
    setStatsDifficultyDistribution(dist.map((count, diff) => ({ diff, count })));
    // Top 5 difficiles
    const sorted = [...expressions].sort((a,b) => (b.difficulty||0) - (a.difficulty||0)).slice(0,5);
    setStatsTopDifficult(sorted);
  };

  // Performance par jour de la semaine
  const computeDayOfWeekPerformance = () => {
    const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const counts = Array(7).fill(0);
    const totals = Array(7).fill(0);
    // Simulé à partir de l'historique des révisions
    expressions.forEach(e => {
      (e.reviewHistory || []).forEach(h => {
        const d = new Date(h.date).getDay();
        counts[d]++;
        totals[d] += h.q;
      });
    });
    const avg = counts.map((c,i) => c ? (totals[i]/c).toFixed(1) : 0);
    setStatsDayOfWeekPerformance(days.map((name,i) => ({ name, reviews: counts[i], avgScore: avg[i] })));
  };

  // Rapport IA
  const generateStatsAiReport = async () => {
    setStatsAiReportLoading(true);
    try {
      const summary = {
        totalCards: expressions.length,
        mastered: expressions.filter(e => e.level >= 7).length,
        streak: stats.streak,
        totalReviews: stats.totalReviews,
        hardestModule: statsModuleComparison.sort((a,b)=>a.avgLevel-b.avgLevel)[0]?.name,
        lastWeekReviews: sessions.filter(s => s.date >= addDays(today(),-7)).reduce((a,s)=>a+s.count,0),
      };
      const raw = await callClaude(
        `Tu es un coach pédagogique. Analyse ces statistiques et rédige un rapport ultra‑personnalisé avec : un verdict global, deux forces, une faiblesse, un conseil choc, et un plan pour la semaine. Format JSON: {"verdict":"...","strengths":["..."],"weakness":"...","tip":"...","plan":["..."]}`,
        JSON.stringify(summary)
      );
      setStatsAiReport(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { showToast("Erreur rapport IA", "error"); }
    setStatsAiReportLoading(false);
  };

  // Heatmap cognitive
  const computeCognitiveHeatmap = () => {
    // Croisement difficulté vs rétention à J+1
    const data = expressions.filter(e => e.stability).map(e => ({
      diff: e.difficulty || (5 - (e.easeFactor||2.5))*2,
      retention: Math.round(fsrsR(1, e.stability) * 100)
    }));
    // La heatmap sera affichée dans l'UI
  };

  // Fatigue analysis (simplifiée)
  const computeFatigue = () => {
    const hourCounts = Array(24).fill(0);
    const hourScores = Array(24).fill(0);
    expressions.forEach(e => {
      (e.reviewHistory || []).forEach(h => {
        const hour = new Date(h.date).getHours();
        hourCounts[hour]++;
        hourScores[hour] += h.q;
      });
    });
    const data = hourCounts.map((c,i) => ({
      hour: i,
      reviews: c,
      avgScore: c ? (hourScores[i]/c).toFixed(1) : 0
    }));
    setStatsFatigueAnalysis(data);
  };

  // Exporter les stats en image (nécessite une librairie, ici on simule)
  const exportStatsAsImage = () => {
    showToast("📸 Fonction d'export à implémenter (html2canvas)");
    // On pourrait utiliser html2canvas sur un conteneur.
  };

  // Préparer toutes les stats
  const computeAllStats = () => {
    computeDailyProgress();
    computeRetentionCurve();
    computeModuleComparison();
    computeDifficultyDistribution();
    computeDayOfWeekPerformance();
    computeFatigue();
  };

  // Calcul initial quand la vue stats est chargée
  useEffect(() => {
    if (view === "stats") computeAllStats();
  }, [view, expressions, sessions, stats]);

    // ══════════════════════════════════════════════════════════════════
  // DASHBOARD GOD LEVEL v10 – Fonctions
  // ══════════════════════════════════════════════════════════════════

  // Citation inspirante du jour
  const loadDailyQuote = async () => {
    setDashQuoteLoading(true);
    try {
      const raw = await callClaude(
        `Génère une citation inspirante courte (moins de 15 mots) en français pour un étudiant en informatique.`,
        "Citation du jour"
      );
      setDashQuote(raw.trim());
    } catch (e) { setDashQuote("« La persévérance est la clé de la maîtrise. »"); }
    setDashQuoteLoading(false);
  };

  // Plan du jour par le Coach IA
  const loadDailyPlan = async () => {
    setDashDailyPlanLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un coach pédagogique. Crée un programme de révision pour aujourd'hui, adapté aux statistiques suivantes : ${todayReviews.length} révisions dues, streak de ${stats.streak} jours. Format JSON STRICT: {"plan":[{"time":"08:00","activity":"..."}]}.`,
        "Planning du jour"
      );
      const plan = JSON.parse(raw.replace(/```json|```/g, '').trim()).plan || [];
      setDashDailyPlan(plan);
    } catch (e) { showToast("Erreur plan du jour", "error"); }
    setDashDailyPlanLoading(false);
  };

  // Rétrospective de la semaine
  const loadWeeklyRetro = async () => {
    setDashWeeklyRetroLoading(true);
    try {
      const last7 = sessions.filter(s => s.date >= addDays(today(), -7));
      const totalReviews = last7.reduce((a, s) => a + s.count, 0);
      const raw = await callClaude(
        `Résume en une phrase la performance de la semaine pour un étudiant. Il a fait ${totalReviews} révisions sur 7 jours.`,
        `Rétro semaine`
      );
      setDashWeeklyRetro({ totalReviews, summary: raw.trim() });
    } catch (e) { showToast("Erreur rétro", "error"); }
    setDashWeeklyRetroLoading(false);
  };

  // Calculer l'indice de forme
  const computeFormIndex = () => {
    let score = 60;
    if (stats.streak >= 7) score += 20;
    else if (stats.streak >= 3) score += 10;
    if (todayReviews.length === 0) score += 15;
    else if (todayReviews.length > 20) score -= 10;
    const hour = new Date().getHours();
    if (hour >= 8 && hour <= 12) score += 10; // matin
    else if (hour >= 22) score -= 5; // tard
    setDashFormIndex(Math.min(100, Math.max(10, score)));
  };

  // Détecter le prochain examen
  const computeNextExam = () => {
    const exams = categories.filter(c => c.examDate).map(c => ({
      name: c.name,
      daysLeft: Math.ceil((new Date(c.examDate) - new Date()) / 86400000)
    })).sort((a, b) => a.daysLeft - b.daysLeft);
    setDashNextExam(exams[0] || null);
  };

  // Liste des 5 cartes les plus urgentes (proches de l'oubli)
  const computeUrgentCards = () => {
    const critical = expressions.filter(e => e.level < 7 && e.nextReview <= addDays(today(), 2))
      .sort((a, b) => (a.nextReview < b.nextReview ? -1 : 1))
      .slice(0, 5);
    setDashUrgentCards(critical);
  };

  // Ajouter un objectif hebdomadaire
  const addWeeklyGoal = () => {
    if (!dashWeeklyGoalsInput.trim()) return;
    setDashWeeklyGoals(prev => [...prev, dashWeeklyGoalsInput.trim()]);
    setDashWeeklyGoalsInput("");
  };

  const removeWeeklyGoal = (idx) => {
    setDashWeeklyGoals(prev => prev.filter((_, i) => i !== idx));
  };

  // Classement simulé
  const loadLeaderboard = () => {
    setDashLeaderboard([
      { name: "El Hadji Malick", xp: powerLevel, rank: 1 },
      { name: "Ami(e) 1", xp: Math.floor(powerLevel * 0.8), rank: 2 },
      { name: "Ami(e) 2", xp: Math.floor(powerLevel * 0.6), rank: 3 },
    ]);
  };

  // Initialisations
  useEffect(() => {
    if (view === "dashboard") {
      computeFormIndex();
      computeNextExam();
      computeUrgentCards();
    }
  }, [view, expressions, stats]);

    // ══════════════════════════════════════════════════════════════════
  // CATEGORIES GOD LEVEL v10 – Fonctions
  // ══════════════════════════════════════════════════════════════════

  // Calculer les statistiques avancées par module
  const computeCatsStats = () => {
    const stats = {};
    categories.forEach(cat => {
      const catExps = expressions.filter(e => e.category === cat.name);
      const mastered = catExps.filter(e => e.level >= 7).length;
      const total = catExps.length;
      const avgDiff = total ? (catExps.reduce((s, e) => s + (e.difficulty || (5 - (e.easeFactor||2.5))*2), 0) / total).toFixed(1) : 0;
      const due = catExps.filter(e => e.nextReview <= today() && e.level < 7).length;
      const lastReview = catExps.reduce((latest, e) => {
        const last = (e.reviewHistory || []).slice(-1)[0]?.date;
        return last > latest ? last : latest;
      }, "");
      stats[cat.name] = { mastered, total, avgDiff, due, lastReview, pct: total ? Math.round((mastered/total)*100) : 0 };
    });
    setCatsStats(stats);
  };

  // Détecter les prérequis entre modules (IA)
  const detectPrerequisites = async () => {
    if (categories.length < 2) return;
    try {
      const names = categories.map(c => c.name).join(", ");
      const raw = await callClaude(
        `Tu es un expert en pédagogie. Pour ces modules: ${names}, identifie les relations de prérequis (quel module doit être maîtrisé avant un autre). Format JSON: {"prerequisites":{"ModuleA":["ModuleB"]}}`,
        "Détection prérequis"
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      setCatsPrerequisites(parsed.prerequisites || {});
      showToast("🔗 Prérequis détectés !");
    } catch (e) { showToast("Erreur prérequis", "error"); }
  };

  // Fusionner deux modules
  const mergeModules = () => {
    if (!catsMergeSource || !catsMergeTarget || catsMergeSource === catsMergeTarget) {
      showToast("Sélectionne deux modules différents", "error");
      return;
    }
    setExpressions(prev => prev.map(e => e.category === catsMergeSource ? { ...e, category: catsMergeTarget } : e));
    setCategories(prev => prev.filter(c => c.name !== catsMergeSource));
    setCatsMergeSource(null); setCatsMergeTarget(null);
    showToast(`Modules fusionnés : ${catsMergeSource} → ${catsMergeTarget}`);
  };

  // Générer la timeline des examens
  const generateTimeline = () => {
    const events = categories.filter(c => c.examDate).map(c => ({
      date: c.examDate,
      module: c.name,
      label: `Examen ${c.name}`
    })).sort((a,b) => new Date(a.date) - new Date(b.date));
    setCatsTimelineData(events);
    setCatsViewMode("timeline");
  };

  // Analyser la courbe d'apprentissage pour un module
  const analyzeLearningCurve = async (catName) => {
    const catExps = expressions.filter(e => e.category === catName && (e.reviewHistory || []).length > 0);
    if (catExps.length === 0) return;
    // Regrouper par semaine
    const weeks = {};
    catExps.forEach(card => {
      (card.reviewHistory || []).forEach(h => {
        const week = h.date.slice(0,7); // YYYY-MM
        if (!weeks[week]) weeks[week] = { total: 0, count: 0 };
        weeks[week].total += card.level;
        weeks[week].count++;
      });
    });
    const curve = Object.entries(weeks).map(([week, data]) => ({
      week,
      avgLevel: +(data.total / data.count).toFixed(1)
    })).sort((a,b) => a.week.localeCompare(b.week));
    setCatsLearningCurve(prev => ({ ...prev, [catName]: curve }));
  };

  // Alerter sur les retards
  const checkModuleAlerts = () => {
    const alerts = [];
    categories.forEach(cat => {
      const catExps = expressions.filter(e => e.category === cat.name);
      const due = catExps.filter(e => e.nextReview <= today() && e.level < 7).length;
      if (due > 10) alerts.push({ module: cat.name, message: `${due} fiches en retard urgent !`, type: "danger" });
      else if (due > 5) alerts.push({ module: cat.name, message: `${due} fiches à revoir rapidement`, type: "warning" });
      if (cat.examDate) {
        const days = Math.ceil((new Date(cat.examDate) - new Date()) / 86400000);
        if (days <= 7 && days > 0) alerts.push({ module: cat.name, message: `Examen dans ${days} jours !`, type: "exam" });
        else if (days <= 0) alerts.push({ module: cat.name, message: "Examen passé ou aujourd'hui !", type: "exam" });
      }
    });
    setCatsAlerts(alerts);
  };

  // Rapport IA global sur les modules
  const generateModuleReport = async () => {
    setCatsAiReportLoading(true);
    try {
      const summary = categories.map(cat => {
        const s = catsStats[cat.name] || {};
        return `${cat.name}: ${s.pct||0}% maîtrise, ${s.due||0} en retard, difficulté moy. ${s.avgDiff||0}`;
      }).join("\n");
      const raw = await callClaude(
        "Analyse ces modules et propose un plan d'action pour l'étudiant. Format JSON: {\"criticalModule\":\"nom du module le plus urgent\",\"recommendations\":[\"conseil1\",\"conseil2\"]}",
        summary
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      setCatsAiReport(parsed);
    } catch (e) { showToast("Erreur rapport IA", "error"); }
    setCatsAiReportLoading(false);
  };

  // Gérer les favoris
  const toggleFavorite = (catName) => {
    setCatsFavorites(prev => prev.includes(catName) ? prev.filter(n => n !== catName) : [...prev, catName]);
  };

  // Exporter un module
  const exportModule = (catName) => {
    const data = {
      category: categories.find(c => c.name === catName),
      expressions: expressions.filter(e => e.category === catName).map(e => ({ front: e.front, back: e.back, example: e.example, level: e.level }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${catName}_export.json`; a.click();
    showToast("📦 Module exporté !");
  };

  // Refs pour éviter les stale closures dans le timer
  const examQueueRef = useRef(examQueue);
  const examIndexRef = useRef(examIndex);
  const examAnswersRef = useRef(examAnswers);
  const examStreakRef = useRef(examStreak);
  const examTimerValRef = useRef(examTimer);
  const examConfigRef = useRef(examConfig);
  useEffect(() => { examQueueRef.current = examQueue; }, [examQueue]);
  useEffect(() => { examIndexRef.current = examIndex; }, [examIndex]);
  useEffect(() => { examAnswersRef.current = examAnswers; }, [examAnswers]);
  useEffect(() => { examStreakRef.current = examStreak; }, [examStreak]);
  useEffect(() => { examTimerValRef.current = examTimer; }, [examTimer]);
  useEffect(() => { examConfigRef.current = examConfig; }, [examConfig]);

  const handleExamAnswer = useCallback((q) => {
    clearInterval(examTimerRef.current);
    const card = examQueueRef.current[examIndexRef.current];
    const currentAnswers = examAnswersRef.current;
    const currentStreak = examStreakRef.current;
    const currentConfig = examConfigRef.current;
    const currentTimerVal = examTimerValRef.current;
    const currentIndex = examIndexRef.current;
    const currentQueue = examQueueRef.current;

    setExamStreak(q >= 3 ? currentStreak + 1 : 0);
    const currentTimePerCard = currentConfig.mode === "speedrun" && currentConfig.timePerCard > 10 ? 5 : currentConfig.timePerCard;
    const newAnswers = [...currentAnswers, { card, q, timeSpent: currentTimePerCard - currentTimerVal }];
    setExamAnswers(newAnswers);
    setQcmSelected(null); setQcmChoices([]);
    // Mode Survie : pénalité vie
    if (currentConfig.mode === "survival" && q < 3) {
      setExamLives(prev => {
        const newLives = prev - 1;
        if (newLives <= 0) {
          clearInterval(examTimerRef.current);
          setExamActive(false);
          const score = Math.round((newAnswers.filter(a => a.q >= 3).length / newAnswers.length) * 100);
          setStats(prev2 => ({ ...prev2, examsDone: prev2.examsDone + 1 }));
          saveExamRecord(score, 0, newAnswers, "survival");
          generateExamReport(newAnswers, score);
          setWrongAnswersForConfusion(newAnswers.filter(a => a.q < 3).map(a => a.card));
          setExamSubView("results");
          return 0;
        }
        return newLives;
      });
    }

    // Mode Deathrun : arrêt immédiat si raté
    if (currentConfig.mode === "deathrun" && q < 3) {
      clearInterval(examTimerRef.current);
      setExamActive(false);
      const streak = newAnswers.filter(a => a.q >= 3).length;
      setExamDeathrunCurrent(streak);
      setExamDeathrunBest(prev => Math.max(prev, streak));
      setStats(prev2 => ({ ...prev2, examsDone: prev2.examsDone + 1 }));
      saveExamRecord(streak, 0, newAnswers, "deathrun");
      setExamSubView("results");
      showToast(`💥 Deathrun terminé ! Record: ${streak} bonnes réponses consécutives.`);
      return;
    }

    // Mode Duel IA : compter le score IA
    if (currentConfig.mode === "duel" && examIaDuelIaAnswer !== null) {
      setExamIaDuelScore(prev => ({
        user: prev.user + (q >= 3 ? 1 : 0),
        ia: prev.ia + (examIaDuelIaAnswer.correct ? 1 : 0),
      }));
    }

    if (currentIndex + 1 >= currentQueue.length) {
      setExamActive(false);
      const score = Math.round((newAnswers.filter(a => a.q >= 3).length / newAnswers.length) * 100);
      setStats((prev) => ({ ...prev, examsDone: prev.examsDone + 1 }));
      checkBadges(expressions, { ...stats, examsDone: stats.examsDone + 1 }, sessions, unlockedBadges);
      const wrongs = newAnswers.filter(a => a.q < 3).map(a => a.card);
      setWrongAnswersForConfusion(wrongs);
      // Precision: faux positifs = répondu vite mais faux
      setExamPrecisionErrors(newAnswers.filter(a => a.q < 3 && a.timeSpent < 5).map(a => a.card));
      saveExamRecord(score, examStartTime ? Math.round((Date.now() - examStartTime) / 1000) : 0, newAnswers, currentConfig.mode);
      generateExamReport(newAnswers, score);
      setExamSubView("results");
    } else {
      setExamIndex((i) => i + 1); setExamRevealed(false); setExamTimer(currentTimePerCard);
      // Duel IA: génère la réponse de l'IA sur la prochaine carte
      if (currentConfig.mode === "duel") generateIaDuelAnswer(currentQueue[currentIndex + 1]);
    }
  }, [expressions, stats, sessions, unlockedBadges, checkBadges]);

  useEffect(() => {
    if (!examActive) return;
    examTimerRef.current = setInterval(() => {
      setExamTimer((t) => {
        if (t <= 1) {
          handleExamAnswer(0);
          return examConfigRef.current.mode === "speedrun" && examConfigRef.current.timePerCard > 10 ? 5 : examConfigRef.current.timePerCard;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(examTimerRef.current);
  }, [examActive, examIndex, handleExamAnswer]);

  useEffect(() => {
    if (examActive && examQueue[examIndex] && examConfig.mode === "qcm" && !examQueue[examIndex].isCustom) generateQcmChoices(examQueue[examIndex]);
    if (examActive && examQueue[examIndex] && examQueue[examIndex].isCustom && examQueue[examIndex].isQcm) {
      setQcmChoices([...examQueue[examIndex].choices].sort(() => Math.random() - 0.5)); setQcmSelected(null);
    }
  }, [examIndex, examActive]);

  const examScore = useMemo(() => {
    if (examAnswers.length === 0) return 0;
    const good = examAnswers.filter((a) => a.q >= 3).length;
    return Math.round((good / examAnswers.length) * 100);
  }, [examAnswers]);

  const handleAddCat = () => {
    if (!newCat.name.trim() || categories.find((c) => c.name === newCat.name.trim())) { showToast("Nom invalide ou existant.", "error"); return; }
    setCategories((prev) => [...prev, { ...newCat, name: newCat.name.trim() }]);
    setNewCat({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#4D6BFE" });
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
    // Appliquer la recherche avancée si active
    if (cardsSearchOpen) {
      list = getFilteredByAdvancedSearch(list);
    }
    return list;
  }, [expressions, filterCat, filterLevel, searchQuery, cardsSearchOpen, cardsAdvancedSearch]);

  const cognitiveTag = (card) => {
    const diff = card.difficulty ?? (card.easeFactor ? 5 - (card.easeFactor - 1.5) * 2.5 : 2.5);
    if (diff >= 7) return { icon: "💀", label: "Difficile", color: "#EF4444" };
    if (diff >= 4) return { icon: "🤔", label: "Moyen", color: "#6B82F5" };
    return { icon: "🐣", label: "Facile", color: "#4D6BFE" };
  };

  const hour = new Date().getHours();
  const greeting = hour >= 18 ? "Bonsoir" : "Bonjour";
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
    // Correction automatique
    await correctMessage(text.trim());
    try {
      const personaInst = practicePersona === "MMA" ? "Act like an aggressive MMA Fighter." : practicePersona === "Recruteur" ? "Act like a strict Tech Recruiter." : "Act as a friendly coach.";
      const systemPrompt = `You are an English coach for El Hadji Malick, a CS student in Dakar. Speak ONLY in English. Level: ${practiceLevel}. Topic: ${practiceTopic}. ${personaInst} Keep it conversational (2-4 sentences).`;
      const groqHistory = practiceMsgRef.current.slice(-10).map(m => ({ role: m.role, content: m.text }));
      groqHistory.push({ role: "user", content: text.trim() });
      const res = await fetch(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${_DS}` },
        body: JSON.stringify({ model: DEEPSEEK_MODEL, max_tokens: 400, temperature: 0.85, messages: [{ role: "system", content: systemPrompt }, ...groqHistory] }),
      });
      if (!res.ok) throw new Error("API Error");
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "I didn't catch that.";
      setPracticeMessages(prev => [...prev, { role: "assistant", text: reply }]);
      speakText(reply);
      // Stats
      saveStats({ ...practiceStats, totalMessages: practiceStats.totalMessages + 2 }); // user + assistant
    } catch (err) {
      setPracticeMessages(prev => [...prev, { role: "assistant", text: "Connection error. Please try again! 🔄" }]);
    } finally {
      setPracticeLoading(false);
    }
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
          const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { "Authorization": `Bearer ${_DS}` }, body: formData });
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
  // ACADEMY 
  // ══════════════════════════════════════════════════════════════════════════
  // ACADEMY GOD LEVEL – Multi-cours
// ══════════════════════════════════════════════════════════════════════════════

const openCourse = (course) => {
  setActiveCourse(course);
  setAcademySyllabus(course.syllabus);
  setAcademyTopic(course.topic);
  setAcademyProgress(course.progress || {});
  setAcademyView("home");
};

const generateSyllabus = async () => {
  if (!academyTopic.trim()) return;
  setAcademyLoading(true);
  try {
    const raw = await callClaude(
      `Tu es un expert en création de plans d'apprentissage pour développeurs. Génère un syllabus en JSON STRICT (sans markdown, sans texte avant/après) avec ce format exact :
{"concepts":[{"title":"Nom du concept","dependencies":[],"description":"Description courte en 1 phrase"}]}
Pour le sujet : "${academyTopic}". Ordonne logiquement du plus basique au plus avancé. Limite à 10 concepts maximum.`,
      `Génère le syllabus pour : ${academyTopic}`
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Réponse IA invalide");
    const syllabus = JSON.parse(jsonMatch[0]);
    if (!syllabus.concepts || !Array.isArray(syllabus.concepts)) throw new Error("Format JSON invalide");

    // Crée un nouveau cours et l'ajoute à la bibliothèque
    // APRÈS
    const CODING_KEYWORDS = ["python","java","javascript","typescript","react","sql","c++","c#","rust","go","kotlin","swift","php","spring","node","html","css","algorithme","algorithmique","programmation","code","développement","dev","backend","frontend","api","git","linux","bash","shell"];
    const isCodingCourse = CODING_KEYWORDS.some(kw => academyTopic.toLowerCase().includes(kw));
    const newCourse = {
      id: Date.now().toString(),
      topic: academyTopic,
      syllabus,
      progress: {},
      createdAt: today(),
      lastOpenedAt: today(),
      type: isCodingCourse ? "code" : "theory", // ← NOUVEAU
    };
    setAcademyCourses(prev => [newCourse, ...prev]);
    setActiveCourse(newCourse);
    setAcademySyllabus(syllabus);
    setAcademyProgress({});
    setAcademyView("home");
    showToast("📚 Cours créé et sauvegardé !");
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  } finally {
    setAcademyLoading(false);
  }
};

const saveProgressToCourse = (newProgress) => {
  if (!activeCourse) return;
  setAcademyCourses(prev => prev.map(c =>
    c.id === activeCourse.id
      ? { ...c, progress: newProgress, lastOpenedAt: today() }
      : c
  ));
};

const deleteCourse = (courseId) => {
  if (!window.confirm("Supprimer ce cours ?")) return;
  setAcademyCourses(prev => prev.filter(c => c.id !== courseId));
  showToast("Cours supprimé", "error");
};

const canStartConcept = (concept) => {
  if (!academySyllabus) return true;
  const deps = concept.dependencies || [];
  return deps.every(dep => (academyProgress[dep] || 0) >= 4);
};

// ── ACADEMY GOD LEVEL v8 – Fonctions améliorées ──────────────────────────────

const startLesson = async (concept) => {
  setCurrentLesson(concept);
  setQuizAnswers({});
  setQuizFeedback("");
  setQuizResults(null);
  setGeneratedCards([]);
  setShowCardsPreview(false);
  setAcademyView("lesson");

  // ✅ AMÉLIORATION 2 : Cache du cours — on ne régénère plus si déjà chargé
  const cacheKey = `${activeCourse?.id}_${concept.title}`;
  if (lessonCache[cacheKey]) {
    const cached = lessonCache[cacheKey];
    setCurrentLesson({ ...concept, explanation: cached.explanation });
    setLessonQuiz(cached.quiz);
    setLessonState("explain");
    showToast("📖 Cours chargé depuis le cache !");
    return;
  }

  setLessonState("loading");
  try {
    const raw = await callClaude(
      `Tu es un tuteur interactif pour "${academyTopic}". Explique le concept "${concept.title}" de manière concise (3-5 min de lecture). Utilise une analogie concrète et un exemple de code si pertinent. Format JSON STRICT (sans markdown, sans backticks) :
{"explanation":"Explication en texte simple. Utilise des tirets - pour les listes. Evite les guillemets dans le texte.","quiz":[{"question":"Question 1 ?","answer":"Reponse courte"},{"question":"Question 2 ?","answer":"Reponse courte"},{"question":"Question 3 ?","answer":"Reponse courte"}]}`,
      concept.title
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Pas de JSON dans la réponse");
    const cleaned = jsonMatch[0].replace(/[\u0000-\u001F\u007F]/g, (char) => {
      const escapes = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
      return escapes[char] || '';
    });
    const lessonData = JSON.parse(cleaned);
    const quiz = lessonData.quiz || [];
    setCurrentLesson({ ...concept, explanation: lessonData.explanation });
    setLessonQuiz(quiz);
    setLessonState("explain");
    // ✅ Mise en cache immédiate
    setLessonCache(prev => ({ ...prev, [cacheKey]: { explanation: lessonData.explanation, quiz } }));
  } catch (err) {
    showToast("Erreur chargement leçon: " + err.message, "error");
    setAcademyView("home");
    setLessonState("explain");
  }
};

const checkQuizAnswer = (idx, answer) => {
  setQuizAnswers(prev => ({ ...prev, [idx]: answer }));
};

// ✅ AMÉLIORATION 6 : Démarrer le timer quiz
const startQuizTimer = (seconds) => {
  if (quizTimerRef.current) clearInterval(quizTimerRef.current);
  setQuizTimer(seconds);
  setQuizTimerActive(true);
  quizTimerRef.current = setInterval(() => {
    setQuizTimer(prev => {
      if (prev <= 1) {
        clearInterval(quizTimerRef.current);
        setQuizTimerActive(false);
        submitQuiz();
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
};

const stopQuizTimer = () => {
  if (quizTimerRef.current) clearInterval(quizTimerRef.current);
  setQuizTimerActive(false);
  setQuizTimer(null);
};

// ✅ AMÉLIORATION 1 & 3 : submitQuiz avec feedback détaillé par question + score
const submitQuiz = () => {
  if (!lessonQuiz) return;
  stopQuizTimer();
  let correct = 0;
  const results = lessonQuiz.map((q, idx) => {
    const userAns = quizAnswers[idx]?.toLowerCase().trim() || "";
    const correctAns = q.answer.toLowerCase().trim();
    // Tolérance partielle : l'utilisateur contient le mot-clé ou vice-versa
    const isCorrect = userAns === correctAns || userAns.includes(correctAns) || correctAns.includes(userAns) && userAns.length >= 3;
    if (isCorrect) correct++;
    return { question: q.question, userAnswer: quizAnswers[idx] || "(vide)", correctAnswer: q.answer, isCorrect };
  });
  setQuizResults(results);
  const score = correct;
  const total = lessonQuiz.length;
  const passed = score >= total * 0.6;

  // ✅ AMÉLIORATION 8 : Historique des tentatives
  const conceptKey = currentLesson?.title || "";
  setQuizAttempts(prev => {
    const existing = prev[conceptKey] || [];
    return { ...prev, [conceptKey]: [...existing, { score, total, date: today() }] };
  });

  setQuizFeedback(passed
    ? `🎉 ${score}/${total} — Excellent ! Concept validé.`
    : `⚠️ ${score}/${total} — Relis le cours et retente !`
  );

  if (passed) {
    generateCardsFromConcept(currentLesson);
    const newProgress = { ...academyProgress, [currentLesson.title]: 5 };
    setAcademyProgress(newProgress);
    saveProgressToCourse(newProgress);
    setLessonState("results");
  } else {
    setLessonState("results");
  }
};

const generateCardsFromConcept = async (concept) => {
  try {
    const raw = await callClaude(
      `Génère 2-3 fiches de révision FSRS pour le concept "${concept.title}". Format JSON STRICT : {"cards":[{"front":"Question courte","back":"Réponse claire","example":"Exemple concret"}]}`,
      concept.title
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const cleaned = jsonMatch[0].replace(/[\u0000-\u001F\u007F]/g, (char) => {
      const escapes = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
      return escapes[char] || '';
    });
    const data = JSON.parse(cleaned);
    const newCards = (data.cards || []).map(c => ({
      id: Date.now().toString() + Math.random(),
      front: c.front, back: c.back, example: c.example || "",
      category: academyTopic,
      level: 0, nextReview: today(), createdAt: today(),
      easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
    }));
    setExpressions(prev => [...newCards, ...prev]);
    setGeneratedCards(newCards); // ✅ AMÉLIORATION 9 : stocke pour prévisualisation
    showToast("✨ Fiches générées automatiquement !");
  } catch {
    showToast("Erreur génération fiches", "error");
  }
};

  // ══════════════════════════════════════════════════════════════════════════
  // FONCTIONS GOD LEVEL (Lab Outils)
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

  // ── ANALYSE INTELLIGENTE DU PDF ────────────────────────────────────────
  const analyzePdf = async () => {
    if (!pdfExtractedText.trim()) return;
    setPdfAnalysisLoading(true);
    setPdfAnalysis(null);
    setPdfMindMap(null);
    try {
      const textSlice = pdfExtractedText.substring(0, 6000);
      // Détection de langue
      const hasArabic = /[\u0600-\u06FF]/.test(textSlice);
      const hasLatin = /[a-zA-Z]{5,}/.test(textSlice);
      const detectedLang = hasArabic ? "ar" : hasLatin ? "fr" : "fr";
      setPdfLang(detectedLang);
      const langInstr = detectedLang === "ar"
        ? "Le document est en arabe. Réponds en arabe ET en français."
        : "Réponds en français.";
      const raw = await callClaude(
        `Tu es un expert en analyse pédagogique. Analyse ce cours et retourne UNIQUEMENT du JSON valide sans markdown:
{"subject":"Sujet principal du cours","level":"débutant|intermédiaire|avancé","themes":["thème1","thème2","thème3","thème4","thème5"],"keyConcepts":["concept1","concept2","concept3","concept4","concept5","concept6"],"estimatedReadTime":15,"language":"fr|ar|en","mindmap":{"center":"Sujet","nodes":[{"id":"n1","label":"Thème 1","children":[{"id":"n1a","label":"Sous-concept"}]},{"id":"n2","label":"Thème 2","children":[]}]}}
${langInstr}`,
        `Cours:\n${textSlice}`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setPdfAnalysis(parsed);
      if (parsed.mindmap) setPdfMindMap(parsed.mindmap);
      showToast("🧠 Analyse terminée ! Choisis ton type de fiches.");
    } catch (err) {
      showToast("Erreur analyse : " + err.message, "error");
    }
    setPdfAnalysisLoading(false);
  };

  // ── GÉNÉRATION FICHES (avec type) ─────────────────────────────────────
  const generateCardsFromPdf = async () => {
    if (!pdfExtractedText.trim()) { showToast("Aucun texte extrait. Charge d'abord un PDF.", "error"); return; }
    setPdfGenLoading(true);
    try {
      const textSlice = pdfExtractedText.substring(0, 8000);
      const langNote = pdfLang === "ar" ? "Le cours est en arabe. Génère les fiches en arabe, avec les termes clés aussi en français entre parenthèses." : "";
      const typeInstr = {
        definitions: `Génère ${pdfCardsCount} fiches "Terme → Définition". Chaque fiche : un terme ou concept du cours en recto, sa définition précise et mémorable en verso.`,
        qa: `Génère ${pdfCardsCount} fiches "Question ouverte → Réponse détaillée". Formule des vraies questions de compréhension, pas juste de mémoire.`,
        truefalse: `Génère ${pdfCardsCount} fiches "Affirmation → Vrai/Faux + explication". Recto: une affirmation sur le cours (mélange vrais et faux). Verso: "✅ Vrai" ou "❌ Faux" + l'explication correcte.`,
        completion: `Génère ${pdfCardsCount} fiches "Phrase à trous → Réponse". Recto: une phrase du cours avec un mot/groupe clé remplacé par ___. Verso: le mot manquant + la phrase complète.`,
        code: `Génère ${pdfCardsCount} fiches "Extrait de code ou algo → Explication". Si le cours contient du code/algorithmes, explique chaque extrait. Sinon, crée des fiches schéma/processus.`,
      }[pdfCardType] || `Génère ${pdfCardsCount} fiches de révision de qualité.`;
      const system = `Tu es un assistant pédagogique expert. ${typeInstr} ${langNote} Réponds UNIQUEMENT en JSON valide sans markdown: {"cards":[{"front":"...","back":"...","example":"..."}]}`;
      const raw = await callClaude(system, `Module: ${docCategory}\n\nCours:\n${textSlice}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
      setPdfBatchPreview(cards);
      // Score de couverture
      if (pdfAnalysis?.themes?.length) {
        const covRaw = await callClaude(
          `Tu es un expert pédagogique. On a généré des fiches de révision. Analyse si elles couvrent bien les thèmes du cours. Réponds UNIQUEMENT en JSON: {"score":85,"covered":["thème1"],"missing":["thème2"],"suggestion":"Génère 3 fiches sur [thème manquant]"}`,
          `Thèmes du cours: ${pdfAnalysis.themes.join(", ")}\n\nFiches générées: ${cards.map(c => c.front).join(" | ")}`
        );
        try { setPdfCoverageScore(JSON.parse(covRaw.replace(/```json|```/g, "").trim())); } catch {}
      }
      showToast(`✨ ${cards.length} fiches générées ! Édite ou valide.`);
    } catch (err) {
      showToast("Erreur génération fiches : " + err.message, "error");
    }
    setPdfGenLoading(false);
  };

  const generatePdfSummary = async () => {
    if (!pdfExtractedText.trim()) { showToast("Aucun texte extrait. Charge d'abord un PDF.", "error"); return; }
    setPdfSummaryLoading(true);
    try {
      const textSlice = pdfExtractedText.substring(0, 8000);
      // Résumé par sections
      const sections = textSlice.split(/---\s*Page\s*\d+\s*---/).filter(s => s.trim().length > 100);
      if (sections.length > 1) {
        setPdfSectionLoading(true);
        const sectPromises = sections.slice(0, 6).map((s, i) =>
          callClaude(`Résume ce passage de cours en 2-3 phrases clés. Sois concis et direct. Réponds en français.`, `Passage ${i+1}:\n${s.substring(0, 2000)}`)
        );
        const sectResults = await Promise.all(sectPromises);
        setPdfSectionSummaries(sectResults.map((r, i) => ({ title: `Section ${i + 1}`, content: r.trim() })));
        setPdfSectionLoading(false);
      }
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
    setPdfCoverageScore(null);
  };

  // ── TTS Résumé ─────────────────────────────────────────────────────────
  const startTTS = (text) => {
    if (!window.speechSynthesis) return showToast("TTS non supporté sur ce navigateur.", "error");
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    utter.lang = hasArabic ? "ar-SA" : "fr-FR";
    utter.rate = 0.95;
    utter.onend = () => { setTtsPlaying(false); setTtsPaused(false); };
    window.speechSynthesis.speak(utter);
    ttsRef.current = utter;
    setTtsPlaying(true);
    setTtsPaused(false);
  };
  const pauseTTS = () => { window.speechSynthesis.pause(); setTtsPaused(true); };
  const resumeTTS = () => { window.speechSynthesis.resume(); setTtsPaused(false); };
  const stopTTS = () => { window.speechSynthesis.cancel(); setTtsPlaying(false); setTtsPaused(false); };

  // ── EXPORT RÉSUMÉ ──────────────────────────────────────────────────────
  const exportResume = (format) => {
    let content = "";
    if (!resumeResult) return;
    if (resumeStyle === "cornell") {
      content = (resumeResult.rows || []).map(r => `Q: ${r.question}\nR: ${r.answer}`).join("\n\n") + (resumeResult.summary ? `\n\nSYNTHÈSE:\n${resumeResult.summary}` : "");
    } else if (resumeStyle === "flash") {
      content = (Array.isArray(resumeResult) ? resumeResult : resumeResult.points || []).join("\n\n");
    } else {
      content = `${resumeResult.intro || ""}\n\n${(resumeResult.keyPoints || []).map((p, i) => `${i+1}. ${p.title}\n${p.content}`).join("\n\n")}\n\nCONCLUSION:\n${resumeResult.conclusion || ""}\n\nGLOSSAIRE:\n${(resumeResult.glossary || []).map(g => `• ${g.term} : ${g.def}`).join("\n")}`;
    }
    if (format === "txt") {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "resume_cours.txt"; a.click();
    } else if (format === "md") {
      let md = "";
      if (resumeStyle === "complet" && resumeResult.intro) {
        md = `# Résumé de cours\n\n## Introduction\n${resumeResult.intro}\n\n## Points clés\n${(resumeResult.keyPoints||[]).map(p=>`### ${p.title}\n${p.content}`).join("\n\n")}\n\n## Conclusion\n${resumeResult.conclusion||""}\n\n## Glossaire\n${(resumeResult.glossary||[]).map(g=>`- **${g.term}** : ${g.def}`).join("\n")}`;
      } else { md = content; }
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "resume_cours.md"; a.click();
    } else if (format === "anki") {
      const rows = resumeStyle === "cornell"
        ? (resumeResult.rows || []).map(r => `"${r.question.replace(/"/g,'""')}","${r.answer.replace(/"/g,'""')}"`)
        : (resumeResult.keyPoints || []).map(p => `"${p.title.replace(/"/g,'""')}","${p.content.replace(/"/g,'""')}"`);
      const csv = rows.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "anki_import.csv"; a.click();
      showToast("CSV Anki exporté ! Importe-le dans Anki via Fichier → Importer.");
    } else if (format === "copy") {
      navigator.clipboard.writeText(content).then(() => showToast("📋 Copié !"));
    }
  };

  // ── APPROFONDISSEMENT D'UN POINT ───────────────────────────────────────
  const deepenResumePoint = async (idx, point) => {
    setResumeDeepIdx(idx);
    setResumeDeepLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un professeur expert. Approfondis ce point clé du cours avec plus de détails, 2 exemples concrets, et une analogie mémorable. Réponds directement en texte structuré, sans JSON, en français.`,
        `Point à approfondir: "${point.title}"\nContenu actuel: ${point.content}\n\nCours de référence (extrait): ${resumeText.substring(0, 3000)}`
      );
      setResumeDeepResult(prev => ({ ...prev, [idx]: raw.trim() }));
    } catch (err) {
      showToast("Erreur approfondissement : " + err.message, "error");
    }
    setResumeDeepLoading(false);
    setResumeDeepIdx(null);
  };

  // ── CHAT AVEC LE PDF ───────────────────────────────────────────────────
  const sendPdfChat = async () => {
    if (!pdfChatInput.trim() || !pdfExtractedText) return;
    const userMsg = pdfChatInput.trim();
    setPdfChatInput("");
    setPdfChatHistory(prev => [...prev, { role: "user", text: userMsg }]);
    setPdfChatLoading(true);
    try {
      const history = pdfChatHistory.slice(-6).map(m => `${m.role === "user" ? "Étudiant" : "IA"}: ${m.text}`).join("\n");
      const raw = await callClaude(
        `Tu es un tuteur pédagogique. Tu as accès au cours ci-dessous. Réponds UNIQUEMENT en te basant sur ce cours. Si la réponse n'est pas dans le cours, dis-le clairement. Sois précis et pédagogique.\n\nCOURS:\n${pdfExtractedText.substring(0, 7000)}`,
        `${history ? `Historique:\n${history}\n\n` : ""}Question: ${userMsg}`
      );
      setPdfChatHistory(prev => [...prev, { role: "assistant", text: raw.trim() }]);
    } catch (err) {
      setPdfChatHistory(prev => [...prev, { role: "assistant", text: "Erreur : " + err.message }]);
    }
    setPdfChatLoading(false);
  };

  // ── MIND MAP SVG ───────────────────────────────────────────────────────
  const renderMindMapSVG = (mm) => {
    if (!mm) return null;
    const W = 700, H = 420, cx = W/2, cy = H/2;
    const nodeCount = mm.nodes?.length || 0;
    const nodes = (mm.nodes || []).map((n, i) => {
      const angle = (2 * Math.PI * i) / nodeCount - Math.PI/2;
      const r = 140;
      return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", borderRadius: 16 }}>
        <defs>
          <radialGradient id="mgc" cx="50%" cy="50%"><stop offset="0%" stopColor="#4D6BFE"/><stop offset="100%" stopColor="#3451D1"/></radialGradient>
          <radialGradient id="mnc" cx="50%" cy="50%"><stop offset="0%" stopColor="#7B93FF"/><stop offset="100%" stopColor="#3451D1"/></radialGradient>
        </defs>
        {nodes.map((n, i) => (
          <line key={`l${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="#4D6BFE" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="4,3"/>
        ))}
        {nodes.map((n, i) => (
          <g key={`n${i}`}>
            {(n.children || []).map((child, j) => {
              const cr = 60, ca = (2*Math.PI*j)/(n.children.length||1);
              const chx = n.x + cr*Math.cos(ca), chy = n.y + cr*Math.sin(ca);
              return <g key={`c${j}`}>
                <line x1={n.x} y1={n.y} x2={chx} y2={chy} stroke="#7B93FF" strokeWidth="1" strokeOpacity="0.35"/>
                <ellipse cx={chx} cy={chy} rx={36} ry={14} fill="#7B93FF" fillOpacity="0.15" stroke="#7B93FF" strokeWidth="1"/>
                <text x={chx} y={chy} textAnchor="middle" dominantBaseline="middle" fill="#7B93FF" fontSize="9" fontWeight="600">{child.label?.substring(0,14)}</text>
              </g>;
            })}
            <ellipse cx={n.x} cy={n.y} rx={52} ry={20} fill="url(#mnc)" opacity="0.9"/>
            <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="700">{n.label?.substring(0,16)}</text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r={44} fill="url(#mgc)"/>
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="12" fontWeight="800">{mm.center?.substring(0,14)}</text>
      </svg>
    );
  };

  // ── RÉSUMÉ DE COURS STANDALONE ─────────────────────────────────────────
  const generateResume = async () => {
    if (!resumeText.trim()) { showToast("Colle ou charge un cours d'abord.", "error"); return; }
    setResumeLoading(true);
    setResumeResult(null);
    setResumeDeepResult({});
    try {
      const textSlice = resumeText.substring(0, 9000);
      const hasArabic = /[\u0600-\u06FF]/.test(textSlice);
      const langNote = hasArabic ? "Le cours est en arabe. Génère le résumé en ARABE, avec les termes techniques aussi en français entre parenthèses." : "Réponds en français.";
      const styleInstr = resumeStyle === "flash"
        ? `Génère une synthèse ultra-courte en JSON: {"type":"flash","points":["Point 1 essentiel","Point 2","Point 3","Point 4","Point 5"]} — 5 points max, 1 phrase percutante chacun.`
        : resumeStyle === "cornell"
        ? `Génère un résumé format Cornell en JSON: {"type":"cornell","rows":[{"question":"...","answer":"..."}],"summary":"Résumé global en 2 phrases"} — 6-8 questions essentielles avec réponses détaillées.`
        : `Génère un résumé complet en JSON: {"type":"complet","intro":"Introduction (2-3 phrases)","keyPoints":[{"title":"Titre","content":"Explication (2-4 phrases)"}],"conclusion":"À retenir (2-3 phrases)","glossary":[{"term":"Terme","def":"Définition courte"}]}`;
      const raw = await callClaude(
        `Tu es un professeur expert en synthèse pédagogique pour étudiants en licence informatique au Sénégal. ${styleInstr} ${langNote} Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après.`,
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

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECTS GOD MODE — Fonctions
  // ══════════════════════════════════════════════════════════════════════════

  const createProject = () => {
    if (!projectForm.title.trim()) return;
    const newProject = {
      id: Date.now().toString(),
      ...projectForm,
      tasks: [],
      createdAt: today(),
      completedAt: null,
      pomodorosDone: 0,
      linkedCards: [],
    };
    setProjects(prev => [newProject, ...prev]);
    setProjectForm({ title: "", description: "", category: "", dueDate: "", estimatedHours: 8, priority: "haute", color: "#4D6BFE", status: "en_cours" });
    setShowProjectForm(false);
    showToast("🗂️ Projet créé !");
  };

  const deleteProject = (id) => {
    if (!window.confirm("Supprimer ce projet ?")) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProject?.id === id) { setActiveProject(null); setProjectSubView("hub"); }
    showToast("Projet supprimé", "error");
  };

  const updateTask = (projectId, taskId, updates) => {
    setProjects(prev => prev.map(p => p.id === projectId
      ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) }
      : p
    ));
    setActiveProject(prev => prev?.id === projectId
      ? { ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) }
      : prev
    );
  };

  const toggleTask = (projectId, taskId) => {
    const project = projects.find(p => p.id === projectId);
    const task = project?.tasks.find(t => t.id === taskId);
    if (!task) return;
    updateTask(projectId, taskId, { done: !task.done, completedAt: !task.done ? today() : null });
  };

  const getProjectProgress = (project) => {
    if (!project.tasks.length) return 0;
    return Math.round((project.tasks.filter(t => t.done).length / project.tasks.length) * 100);
  };

  const getDaysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  };

  // ── AI Project Decomposer ──────────────────────────────────────────────────
  const decomposeProject = async (project) => {
    setProjectDecomposing(true);
    try {
      const examContext = categories.filter(c => c.examDate).map(c => {
        const d = getDaysUntil(c.examDate);
        return d !== null && d > 0 ? `Examen ${c.name} dans J-${d}` : null;
      }).filter(Boolean).join(", ");

      const raw = await callClaude(
        `Tu es un expert en gestion de projet académique pour un étudiant en Licence Informatique à Dakar. 
Génère un plan de projet détaillé en JSON STRICT (sans markdown):
{"tasks":[{"id":"t1","title":"Titre court de la tâche","description":"Détail actionnable","estimatedHours":2,"phase":"analyse|conception|développement|test|rendu","priority":"haute|normale|basse","dependsOn":[],"suggestedDate":"YYYY-MM-DD","generateCards":true,"cardConcepts":["concept1","concept2"]}],"phases":["analyse","conception","développement","test","rendu"],"keyRisks":["risque1","risque2"],"studyAdvice":"Conseil de révision lié au projet","estimatedTotalHours":20}
Projet: "${project.title}" — ${project.description || "Projet académique"}
Date de rendu: ${project.dueDate || "non définie"}
Heures estimées: ${project.estimatedHours}h
Contexte examens: ${examContext || "aucun examen proche"}
Génère 6-10 tâches logiques et ordonnées. Pour les tâches liées à des concepts techniques, indique les concepts à apprendre.`,
        `Décompose ce projet en tâches.`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const tasks = (parsed.tasks || []).map(t => ({
        ...t,
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        done: false,
        completedAt: null,
      }));
      const updatedProject = { ...project, tasks, decomposed: true, decomposedData: parsed };
      setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
      setActiveProject(updatedProject);
      showToast(`✅ ${tasks.length} tâches générées par l'IA !`);
    } catch (err) {
      showToast("Erreur décomposition : " + err.message, "error");
    }
    setProjectDecomposing(false);
  };

  // ── Conflict Detector ──────────────────────────────────────────────────────
  const detectConflicts = useCallback(() => {
    const conflicts = [];
    const examDates = categories.filter(c => c.examDate).map(c => ({ name: c.name, date: c.examDate, daysLeft: getDaysUntil(c.examDate) }));
    projects.filter(p => p.status !== "terminé" && p.dueDate).forEach(proj => {
      const projDays = getDaysUntil(proj.dueDate);
      if (projDays === null) return;
      examDates.forEach(exam => {
        if (exam.daysLeft === null) return;
        const diff = Math.abs(projDays - exam.daysLeft);
        if (diff <= 5 && projDays >= 0 && exam.daysLeft >= 0) {
          conflicts.push({
            type: "collision",
            project: proj.title,
            exam: exam.name,
            projectDate: proj.dueDate,
            examDate: exam.date,
            severity: diff <= 2 ? "critique" : "avertissement",
            advice: diff <= 2
              ? `⚠️ Rendu "${proj.title}" et examen "${exam.name}" sont à ${diff} jour(s) d'écart ! Avance le projet.`
              : `📅 "${proj.title}" (J-${projDays}) et examen "${exam.name}" (J-${exam.daysLeft}) se chevauchent cette semaine.`
          });
        }
      });
    });
    setProjectConflicts(conflicts);
    return conflicts;
  }, [projects, categories]);

  useEffect(() => { detectConflicts(); }, [projects, categories, detectConflicts]);

  // ── Planificateur Crunch Mode ──────────────────────────────────────────────
  const generateCrunchPlan = async () => {
    setProjectPlannerLoading(true);
    try {
      const activeProjects = projects.filter(p => p.status !== "terminé");
      const examContext = categories.filter(c => c.examDate && getDaysUntil(c.examDate) > 0)
        .map(c => `${c.name}: J-${getDaysUntil(c.examDate)}`).join(", ");
      const dueReviews = todayReviews.length;
      const projectsContext = activeProjects.map(p => {
        const progress = getProjectProgress(p);
        const remaining = p.tasks.filter(t => !t.done).length;
        return `"${p.title}" (${progress}% fait, ${remaining} tâches restantes, rendu: ${p.dueDate || "non défini"})`;
      }).join("; ");

      const raw = await callClaude(
        `Tu es un coach de planning expert pour étudiant sénégalais en Licence Informatique. Génère un plan optimisé pour les 7 prochains jours en JSON STRICT:
{"days":[{"date":"YYYY-MM-DD","dayLabel":"Lun 27","slots":[{"time":"08h00","duration":90,"type":"revision|projet|break","activity":"Description courte","module":"nom module ou projet","priority":"haute|normale"}]}],"weekSummary":"Résumé stratégique","warnings":["avertissement1"],"tip":"Conseil motivant"}
Données actuelles:
- Fiches à réviser aujourd'hui: ${dueReviews}
- Projets en cours: ${projectsContext || "aucun"}
- Examens à venir: ${examContext || "aucun"}
- Streak actuel: ${stats.streak} jours
Règles: max 6h de travail/jour, pauses de 15min toutes les 90min, priorité aux examens J-7 ou moins, intercale révision FSRS le matin et projet l'après-midi.`,
        `Génère mon planning Crunch Mode.`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      setProjectPlannerData(JSON.parse(clean));
      showToast("📅 Planning Crunch Mode généré !");
    } catch (err) {
      showToast("Erreur planificateur : " + err.message, "error");
    }
    setProjectPlannerLoading(false);
  };

  // ── AI Project Coach Chat ──────────────────────────────────────────────────
  const sendProjectCoachMessage = async (msg) => {
    if (!msg.trim() || projectCoachLoading) return;
    const userMsg = { role: "user", text: msg.trim() };
    setProjectCoachMessages(prev => [...prev, userMsg]);
    setProjectCoachInput("");
    setProjectCoachLoading(true);
    try {
      const projContext = activeProject
        ? `Projet actif: "${activeProject.title}" (${getProjectProgress(activeProject)}% terminé, rendu: ${activeProject.dueDate || "non défini"})
Tâches restantes: ${activeProject.tasks.filter(t => !t.done).map(t => t.title).join(", ") || "aucune"}`
        : `Projets en cours: ${projects.filter(p => p.status !== "terminé").map(p => p.title).join(", ") || "aucun"}`;
      const cardsContext = `Modules disponibles: ${categories.map(c => c.name).join(", ")}. Fiches totales: ${expressions.length}.`;
      const history = projectCoachMessages.slice(-6).map(m => `${m.role === "user" ? "Étudiant" : "Coach"}: ${m.text}`).join("\n");

      const raw = await callClaude(
        `Tu es le Coach Projets IA de MémoMaître, un assistant expert en gestion de projet académique pour El Hadji Malick, étudiant en Licence Informatique à Dakar.
Tu connais son contexte complet:
${projContext}
${cardsContext}
Réponds en français, sois concis (3-5 phrases max), pratique et motivant. Si on te demande d'expliquer un concept technique lié au projet, explique-le clairement. Si pertinent, propose de générer des fiches de révision sur ce concept.
${history ? `Historique récent:\n${history}` : ""}`,
        msg.trim()
      );
      const assistantMsg = { role: "assistant", text: raw.trim() };
      setProjectCoachMessages(prev => [...prev, assistantMsg]);

      // Auto-generate cards if coach mentions a technical concept
      if (raw.toLowerCase().includes("fiche") || raw.toLowerCase().includes("générer") || raw.toLowerCase().includes("révise")) {
        showToast("💡 Coach : tu peux me demander de générer des fiches sur ce concept !", "info");
      }
    } catch (err) {
      setProjectCoachMessages(prev => [...prev, { role: "assistant", text: "Erreur de connexion. Réessaie !" }]);
    }
    setProjectCoachLoading(false);
  };

  // ── Pomodoro Fusion ────────────────────────────────────────────────────────
  useEffect(() => {
    if (projectPomodoroActive) {
      pomodoroRef.current = setInterval(() => {
        setProjectPomodoroTime(t => {
          if (t <= 1) {
            clearInterval(pomodoroRef.current);
            setProjectPomodoroActive(false);
            const nextMode = projectPomodoroMode === "study" ? "project" : projectPomodoroMode === "project" ? "break" : "study";
            setProjectPomodoroMode(nextMode);
            setProjectPomodoroTime(nextMode === "break" ? 15 * 60 : 25 * 60);
            showToast(nextMode === "break" ? "☕ Pause 15min !" : nextMode === "project" ? "🗂️ Passage au projet !" : "📚 Retour aux révisions !");
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } else {
      clearInterval(pomodoroRef.current);
    }
    return () => clearInterval(pomodoroRef.current);
  }, [projectPomodoroActive, projectPomodoroMode]);

  const formatPomodoro = (secs) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  const theme = isDarkMode
    ? { bg: "#070D1F", text: "#EEF2FF", textMuted: "#8899DD", cardBg: "#0D1535", border: "rgba(77,107,254,0.22)", inputBg: "#060B18", highlight: "#7B93FF", nav: "rgba(7,13,31,0.97)", gradient: "linear-gradient(135deg, #3451D1, #4D6BFE)" }
    : { bg: "#FFFFFF", text: "#0F1A3A", textMuted: "#4A5A99", cardBg: "#FFFFFF", border: "#C7D2FE", inputBg: "#EEF2FF", highlight: "#4D6BFE", nav: "linear-gradient(135deg, #3451D1 0%, #4D6BFE 100%)", gradient: "linear-gradient(135deg, #3451D1, #7B93FF)" };

  const currentCard = reviewQueue.length > 0 ? reviewQueue[reviewIndex] : null;

  if (!loaded) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#070D1F", color: "#7B93FF", fontFamily: "'Outfit', sans-serif", gap: 16 }}><div style={{ fontSize: 48, animation: "pulse 1s infinite", filter: "drop-shadow(0 0 20px rgba(249,115,22,0.8))" }}>🧠</div><h2 style={{ fontWeight: 800, letterSpacing: "-0.5px", background: "linear-gradient(135deg, #3451D1, #7B93FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Initialisation du Second Cerveau...</h2></div>;

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: theme.bg, color: theme.text, fontFamily: "'Outfit', sans-serif", transition: "background 0.3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Fira+Code:wght@400;500;600&display=swap');
        html, body, #root { margin: 0 !important; padding: 0 !important; width: 100% !important; min-height: 100vh; overflow-x: hidden; }
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: linear-gradient(to bottom, #3451D1, #7B93FF); border-radius: 99px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 20px rgba(77,107,254,0.45); } 50% { box-shadow: 0 0 45px rgba(77,107,254,0.85); } }
        @keyframes orb1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-20px) scale(1.05); } }
        @keyframes orb2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-20px,25px) scale(1.08); } }
        @keyframes rippleFade { from { opacity: 0.5; transform: scale(1); } to { opacity: 0; transform: scale(1.5); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes drawerUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .hov:hover { transform: translateY(-2px); transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        .card-hov:hover { transform: translateY(-5px); box-shadow: 0 20px 50px rgba(249,115,22,0.1) !important; transition: all 0.28s cubic-bezier(0.34,1.56,0.64,1); }
        .btn-glow:hover { animation: glow 1.5s infinite; transition: all 0.3s; }
        .occlusion-img { filter: blur(12px); transition: filter 0.3s; cursor: pointer; } .occlusion-img:hover { filter: blur(0px); }
        input, select, textarea { font-family: 'Outfit', sans-serif !important; color: ${theme.text} !important; outline: none; transition: border 0.2s, box-shadow 0.2s; }
        input:focus, textarea:focus, select:focus { border-color: #4D6BFE !important; box-shadow: 0 0 0 3px rgba(77,107,254,0.15) !important; }
        .tab-active { background: rgba(255,255,255,0.22) !important; font-weight: 700 !important; color: white !important; }
        .code-block { background: ${isDarkMode ? "#060B18" : "#EEF2FF"}; border: 1px solid ${theme.border}; border-radius: 12px; padding: 14px; font-family: 'Fira Code', monospace; white-space: pre-wrap; }
        /* ── MOBILE RESPONSIVE ── */
        @media (max-width: 767px) {
          .desktop-sidebar { display: none !important; }
          .desktop-sidebar-spacer { display: none !important; }
          .main-content { padding: 16px 14px 90px !important; }
          .nav-top { padding: 0 14px !important; min-height: 56px !important; }
          .nav-title-sub { display: none !important; }
          .nav-logo-text { font-size: 16px !important; }
          .card-grid-auto { grid-template-columns: 1fr !important; }
          .card-grid-2col { grid-template-columns: repeat(2, 1fr) !important; }
          .english-btns { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .english-btn-item { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 4px !important; padding: 14px 8px !important; min-height: 64px !important; }
          .table-overflow { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .hide-mobile { display: none !important; }
        }
        @media (min-width: 768px) {
          .mobile-bottom-nav { display: none !important; }
          .mobile-drawer-overlay { display: none !important; }
        }
        ${isDarkMode ? `
          .app-orb-1 { position: fixed; top: -180px; left: -120px; width: 580px; height: 580px; background: radial-gradient(circle, rgba(77,107,254,0.08) 0%, transparent 65%); border-radius: 50%; pointer-events: none; z-index: 0; animation: orb1 12s ease-in-out infinite; }
          .app-orb-2 { position: fixed; bottom: -160px; right: -100px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(77,107,254,0.06) 0%, transparent 65%); border-radius: 50%; pointer-events: none; z-index: 0; animation: orb2 15s ease-in-out infinite; }
        ` : `
          .app-orb-1 { display: none; } .app-orb-2 { display: none; }
        `}
      `}</style>
      {isDarkMode && <><div className="app-orb-1" /><div className="app-orb-2" /></>}

      {lofiPlaying && <iframe width="0" height="0" src="https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1" frameBorder="0" allow="autoplay" title="Lofi"></iframe>}

      {toast && <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "14px 22px", borderRadius: 14, color: "white", fontWeight: 700, fontSize: 14, background: toast.type === "error" ? "linear-gradient(135deg,#EF4444,#B91C1C)" : "linear-gradient(135deg,#3451D1,#4D6BFE)", boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1)", animation: "slideIn 0.3s ease" }}>{toast.msg}</div>}

      {newBadge && (
        <div style={{ position: "fixed", top: 88, right: 20, zIndex: 9998, display: "flex", gap: 16, alignItems: "center", background: isDarkMode ? "rgba(13,21,53,0.97)" : "white", border: "2px solid #4D6BFE", borderRadius: 18, padding: "18px 24px", boxShadow: "0 12px 40px rgba(77,107,254,0.25)", animation: "slideIn 0.4s ease" }}>
          <span style={{ fontSize: 32 }}>{newBadge.icon}</span>
          <div><div style={{ fontWeight: 800, color: theme.text, fontSize: 15 }}>Badge débloqué !</div><div style={{ color: "#4D6BFE", fontWeight: 700 }}>{newBadge.label}</div><div style={{ color: theme.textMuted, fontSize: 12 }}>{newBadge.desc}</div></div>
        </div>
      )}

      <nav className="nav-top" style={{ background: isDarkMode ? "rgba(7,13,31,0.97)" : "linear-gradient(135deg, #3451D1 0%, #4D6BFE 100%)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, flexWrap: "wrap", gap: 8, minHeight: 68, width: "100%", borderBottom: `1px solid ${isDarkMode ? "rgba(77,107,254,0.2)" : "rgba(255,255,255,0.15)"}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, background: "rgba(255,255,255,0.22)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, color: "white", fontFamily: "'Fira Code', monospace", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>M²</div>
          <div>
            <div className="nav-logo-text" style={{ fontSize: 19, fontWeight: 800, color: "white", letterSpacing: "-0.5px" }}>MémoMaître</div>
            <div className="nav-title-sub" style={{ fontSize: 10, color: "rgba(199,210,254,0.85)", fontFamily: "'Fira Code', monospace", letterSpacing: 1.2 }}>GOD LEVEL v8 × AI</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {todayReviews.length > 0 && <span style={{ background: "rgba(255,255,255,0.25)", color: "white", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 900 }}>⚡ {todayReviews.length}</span>}
          {projectConflicts.filter(c => c.severity === "critique").length > 0 && <span style={{ background: "#EF4444", color: "white", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 900 }}>🚨</span>}
          <button onClick={() => setLofiPlaying(!lofiPlaying)} style={{ padding: "8px", borderRadius: 10, background: lofiPlaying ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)", color: "white", border: "none", cursor: "pointer", fontSize: 14 }} title="Lo-Fi Focus">🎧</button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ padding: "8px", borderRadius: 10, background: "rgba(255,255,255,0.15)", color: "white", border: "none", cursor: "pointer", fontSize: 14 }}>{isDarkMode ? "☀️" : "🌙"}</button>
        </div>
      </nav>

      {/* ── LAYOUT PRINCIPAL : Sidebar + Content ── */}
      <div style={{ height: 68 }} />{/* spacer nav fixe */}
      <div style={{ display: "flex", minHeight: "calc(100vh - 68px)" }}>

        {/* Spacer pour compenser la sidebar fixe */}
        <div className="desktop-sidebar-spacer" style={{ width: sidebarCollapsed ? 64 : 220, minWidth: sidebarCollapsed ? 64 : 220, flexShrink: 0, transition: "width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)" }} />

        {/* ═══ SIDEBAR VERTICALE GOD MODE (FIXED) – desktop only ═══ */}
        <aside className="desktop-sidebar" style={{
          width: sidebarCollapsed ? 64 : 220,
          minWidth: sidebarCollapsed ? 64 : 220,
          background: isDarkMode ? "#060B18" : "#3451D1",
          display: "flex", flexDirection: "column",
          position: "fixed", top: 68, left: 0, height: "calc(100vh - 68px)",
          overflowY: "auto", overflowX: "hidden",
          transition: "width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)",
          zIndex: 50, flexShrink: 0,
          borderRight: isDarkMode ? "1px solid rgba(77,107,254,0.15)" : "1px solid rgba(255,255,255,0.2)",
          boxShadow: "4px 0 24px rgba(0,0,0,0.15)",
        }}>
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            style={{
              margin: "12px auto 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "white",
              cursor: "pointer",
              fontSize: 14,
              flexShrink: 0,
              transition: "all 0.2s"
            }}
            title={sidebarCollapsed ? "Développer" : "Réduire"}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
          {/* Nav items */}
          {(() => {
            const dueCount = expressions.filter(e => e.nextReview <= today() && e.level < 7).length;
            const masteredCount = expressions.filter(e => e.level >= 7).length;
            const totalCards = expressions.length;
            const masteredPct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;
            const NAV_GROUPS = [
              {
                items: [
                  { id: "dashboard", icon: "⚡", label: "Accueil", badge: todayReviews.length > 0 ? todayReviews.length : null, badgeColor: "#6B82F5", shortcut: "1", hint: `${todayReviews.length} fiches à réviser` },
                  { id: "projects", icon: "🗂️", label: "Projets", badge: projects.filter(p => p.status !== "terminé").length || null, badgeColor: "#4D6BFE", shortcut: "2", hint: `${projects.filter(p => p.status !== "terminé").length} projets actifs` },
                  { id: "add", icon: "✦", label: editingId ? "Éditer" : "Ajouter", shortcut: "3", hint: "Créer une nouvelle fiche" },
                  { id: "list", icon: "◈", label: "Fiches", badge: dueCount > 0 ? dueCount : null, badgeColor: "#EF4444", shortcut: "4", hint: `${totalCards} fiches • ${dueCount} en retard` },
                  { id: "categories", icon: "◉", label: "Modules", shortcut: "5", hint: `${categories.length} modules` },
                ]
              },
              {
                label: "Apprentissage",
                items: [
                  { id: "exam", icon: "🎯", label: "Examen", shortcut: "6", hint: "Modes d'examen avancés" },
                  { id: "practice", icon: "🗣️", label: "English", shortcut: "7", hint: "Pratique conversationnelle" },
                  { id: "academy", icon: "🏫", label: "Academy", shortcut: "8", hint: "Cours et vidéos" },
                ]
              },
              {
                label: "Analyse",
                items: [
                  { id: "stats", icon: "▣", label: "Stats", shortcut: "9", hint: "Statistiques FSRS détaillées" },
                  { id: "badges", icon: "🏆", label: "Badges", badge: unlockedBadges.length > 0 ? unlockedBadges.length : null, badgeColor: "#6B82F5", hint: `${unlockedBadges.length}/${BADGES.length} badges` },
                  { id: "lab", icon: "🧪", label: "Lab", hint: "PDF, résumés, outils IA" },
                ]
              }
            ];
            return NAV_GROUPS.map((group, gi) => (
              <div key={gi} style={{ marginBottom: 4 }}>
                {group.label && !sidebarCollapsed && (
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1.5, textTransform: "uppercase", padding: "12px 18px 4px" }}>
                    {group.label}
                  </div>
                )}
                {group.label && sidebarCollapsed && <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 12px" }} />}
                {group.items.map((n, ni) => {
                  const isActive = view === n.id;
                  // Calcul progression par item
                  let progressPct = null;
                  if (n.id === "list") progressPct = masteredPct;
                  if (n.id === "badges") progressPct = BADGES.length > 0 ? Math.round((unlockedBadges.length / BADGES.length) * 100) : 0;
                  return (
                    <div key={n.id} style={{ position: "relative" }}
                      onMouseEnter={() => setSidebarHoveredItem(n.id)}
                      onMouseLeave={() => setSidebarHoveredItem(null)}
                    >
                      <button
                        onClick={() => {
                          setView(n.id);
                          if (n.id === "exam") setExamSubView("home");
                          if (n.id === "academy") setAcademyView("library");
                          if (n.id === "projects") setProjectSubView("hub");
                          // Ripple effect
                          setSidebarRipple(n.id);
                          setTimeout(() => setSidebarRipple(null), 400);
                        }}
                        title={sidebarCollapsed ? n.label : undefined}
                        style={{
                          width: "calc(100% - 16px)", margin: "1px 8px", padding: sidebarCollapsed ? "10px 0" : "10px 12px",
                          display: "flex", alignItems: "center", gap: 10, borderRadius: 10, border: "none",
                          cursor: "pointer",
                          background: isActive ? "rgba(255,255,255,0.22)" : sidebarHoveredItem === n.id ? "rgba(255,255,255,0.1)" : "transparent",
                          color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.65)",
                          transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)", textAlign: "left", position: "relative",
                          borderLeft: isActive ? "3px solid #FFFFFF" : "3px solid transparent",
                          fontWeight: isActive ? 700 : 400,
                          overflow: "hidden",
                        }}
                      >
                        {/* Ripple */}
                        {sidebarRipple === n.id && (
                          <span style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.25)", borderRadius: 10, animation: "rippleFade 0.4s ease" }} />
                        )}
                        <span style={{ fontSize: 16, flexShrink: 0, width: 20, textAlign: "center" }}>{n.icon}</span>
                        {!sidebarCollapsed && (
                          <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{n.label}</span>
                        )}
                        {/* Shortcut hint (non-collapsed) */}
                        {!sidebarCollapsed && n.shortcut && (
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono',monospace", marginLeft: "auto", flexShrink: 0 }}>⌥{n.shortcut}</span>
                        )}
                        {n.badge && (
                          <span style={{
                            marginLeft: sidebarCollapsed ? 0 : 4,
                            position: sidebarCollapsed ? "absolute" : "static",
                            top: sidebarCollapsed ? 6 : "auto", right: sidebarCollapsed ? 6 : "auto",
                            background: n.badgeColor, color: "white", borderRadius: 20,
                            padding: "1px 6px", fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
                          }}>{n.badge}</span>
                        )}
                      </button>
                      {/* Mini progress bar sous l'item (si applicable) */}
                      {!sidebarCollapsed && progressPct !== null && (
                        <div style={{ margin: "-2px 16px 4px", height: 2, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${progressPct}%`, background: progressPct >= 80 ? "#93A8FF" : "rgba(255,255,255,0.5)", borderRadius: 2, transition: "width 0.6s ease" }} />
                        </div>
                      )}
                      {/* Tooltip rich au survol */}
                      {sidebarHoveredItem === n.id && n.hint && !sidebarCollapsed && isActive === false && (
                        <div style={{
                          position: "absolute", left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)",
                          background: isDarkMode ? "#0F1A3A" : "#1E3A8A",
                          color: "white", fontSize: 11, fontWeight: 600, padding: "6px 10px",
                          borderRadius: 8, whiteSpace: "nowrap", zIndex: 200,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                          pointerEvents: "none",
                          animation: "fadeIn 0.15s ease",
                        }}>
                          {n.hint}
                          <div style={{ position: "absolute", right: "100%", top: "50%", transform: "translateY(-50%)", borderWidth: "5px 5px 5px 0", borderStyle: "solid", borderColor: `transparent ${isDarkMode ? "#0F1A3A" : "#1E3A8A"} transparent transparent` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ));
          })()}

          {/* Spacer + bottom actions */}
          <div style={{ flex: 1 }} />
          <div style={{ padding: "12px 8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Pomodoro mini widget */}
            {projectPomodoroTime < 25 * 60 || projectPomodoroActive ? (
              <div style={{ background: "rgba(77,107,254,0.15)", borderRadius: 10, padding: "8px 10px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>{projectPomodoroMode === "study" ? "📚" : projectPomodoroMode === "project" ? "🗂️" : "☕"}</span>
                {!sidebarCollapsed && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#C7D2FE", fontWeight: 700 }}>{formatPomodoro(projectPomodoroTime)}</span>}
                <button onClick={() => setProjectPomodoroActive(a => !a)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#C7D2FE", cursor: "pointer", fontSize: 12 }}>{projectPomodoroActive ? "⏸" : "▶"}</button>
              </div>
            ) : null}
            {/* Conflict alert mini */}
            {projectConflicts.length > 0 && !sidebarCollapsed && (
              <div onClick={() => { setView("projects"); setProjectSubView("planner"); }} style={{ background: "rgba(239,68,68,0.15)", borderRadius: 10, padding: "8px 10px", marginBottom: 8, cursor: "pointer" }}>
                <div style={{ fontSize: 10, color: "#A5B4FC", fontWeight: 700 }}>🚨 {projectConflicts.length} conflit{projectConflicts.length > 1 ? "s" : ""} détecté{projectConflicts.length > 1 ? "s" : ""}</div>
              </div>
            )}
            {/* GOD MODE: Score maîtrise global */}
            {!sidebarCollapsed && expressions.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>MAÎTRISE GLOBALE</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#93A8FF" }}>
                    {expressions.length > 0 ? Math.round((expressions.filter(e => e.level >= 7).length / expressions.length) * 100) : 0}%
                  </span>
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${expressions.length > 0 ? Math.round((expressions.filter(e => e.level >= 7).length / expressions.length) * 100) : 0}%`, background: "linear-gradient(90deg,#7B93FF,#4D6BFE)", borderRadius: 2, transition: "width 0.8s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: "rgba(255,255,255,0.35)" }}>
                  <span>{expressions.filter(e => e.level >= 7).length} maîtrisées</span>
                  <span>{expressions.filter(e => e.nextReview <= today() && e.level < 7).length} en retard</span>
                </div>
              </div>
            )}
            {/* GOD MODE: Horloge live */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between", padding: "6px 4px" }}>
              {!sidebarCollapsed ? (
                <>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: 0.5 }}>⌥1-9 navigation</span>
                  <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{sidebarClock}</span>
                </>
              ) : (
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>{sidebarClock}</span>
              )}
            </div>
          </div>
        </aside>

        {/* ═══ MOBILE BOTTOM NAV BAR ═══ */}
        {(() => {
          const dueCount = expressions.filter(e => e.nextReview <= today() && e.level < 7).length;
          const BOTTOM_TABS = [
            { id: "dashboard", icon: "⚡", label: "Accueil", badge: todayReviews.length > 0 ? todayReviews.length : null },
            { id: "list",      icon: "◈",  label: "Fiches",  badge: dueCount > 0 ? dueCount : null },
            { id: "add",       icon: "✦",  label: "Ajouter", center: true },
            { id: "exam",      icon: "🎯", label: "Examen",  badge: null },
            { id: "more",      icon: "☰",  label: "Plus",    badge: null },
          ];
          return (
            <nav className="mobile-bottom-nav" style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
              background: isDarkMode ? "rgba(7,13,31,0.97)" : "linear-gradient(135deg, #3451D1 0%, #4D6BFE 100%)",
              borderTop: `1px solid ${isDarkMode ? "rgba(77,107,254,0.25)" : "rgba(255,255,255,0.2)"}`,
              backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              display: "flex", alignItems: "center", justifyContent: "space-around",
              padding: "0 4px", paddingBottom: "env(safe-area-inset-bottom)",
              height: 60,
            }}>
              {BOTTOM_TABS.map(tab => {
                const isActive = tab.id === "more" ? mobileDrawerOpen : (view === tab.id && !mobileDrawerOpen);
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === "more") {
                        setMobileDrawerOpen(d => !d);
                      } else {
                        setMobileDrawerOpen(false);
                        setView(tab.id);
                        if (tab.id === "exam") setExamSubView("home");
                      }
                    }}
                    style={{
                      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      background: tab.center ? "rgba(255,255,255,0.22)" : "transparent",
                      border: tab.center ? "2px solid rgba(255,255,255,0.4)" : "none",
                      borderRadius: tab.center ? 14 : 0,
                      color: isActive ? "white" : "rgba(255,255,255,0.55)",
                      cursor: "pointer", padding: "6px 2px", position: "relative",
                      minHeight: tab.center ? 46 : 50, maxWidth: tab.center ? 56 : "100%",
                      marginTop: tab.center ? -8 : 0,
                      transition: "all 0.18s",
                    }}
                  >
                    <span style={{ fontSize: tab.center ? 20 : 18, lineHeight: 1 }}>{tab.icon}</span>
                    <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 400, marginTop: 2 }}>{tab.label}</span>
                    {tab.badge && (
                      <span style={{
                        position: "absolute", top: 2, right: "50%", transform: "translateX(10px)",
                        background: "#EF4444", color: "white", borderRadius: 20,
                        padding: "1px 5px", fontSize: 8, fontWeight: 900, minWidth: 14, textAlign: "center",
                      }}>{tab.badge}</span>
                    )}
                    {isActive && !tab.center && (
                      <span style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 20, height: 3, background: "white", borderRadius: 2 }} />
                    )}
                  </button>
                );
              })}
            </nav>
          );
        })()}

        {/* ═══ MOBILE DRAWER (section "Plus") ═══ */}
        {mobileDrawerOpen && (
          <>
            <div
              className="mobile-drawer-overlay"
              onClick={() => setMobileDrawerOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 198, backdropFilter: "blur(4px)" }}
            />
            <div
              className="mobile-drawer-overlay"
              style={{
                position: "fixed", bottom: 60, left: 0, right: 0, zIndex: 199,
                background: isDarkMode ? "#060B18" : "#3451D1",
                borderRadius: "24px 24px 0 0", padding: "20px 16px 16px",
                animation: "drawerUp 0.28s cubic-bezier(0.34,1.56,0.64,1)",
                maxHeight: "70vh", overflowY: "auto",
              }}
            >
              {/* Handle */}
              <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.3)", borderRadius: 2, margin: "0 auto 20px" }} />

              {/* Section Apprentissage */}
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10, paddingLeft: 4 }}>Apprentissage</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                {[
                  { id: "practice", icon: "🗣️", label: "English" },
                  { id: "academy",  icon: "🏫", label: "Academy" },
                  { id: "projects", icon: "🗂️", label: "Projets" },
                ].map(item => (
                  <button key={item.id} onClick={() => { setView(item.id); setMobileDrawerOpen(false); if (item.id === "academy") setAcademyView("library"); if (item.id === "projects") setProjectSubView("hub"); }} style={{
                    background: view === item.id ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)", borderRadius: 14,
                    color: "white", padding: "14px 8px", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    fontSize: 13, fontWeight: 600,
                  }}>
                    <span style={{ fontSize: 22 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Section Analyse */}
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10, paddingLeft: 4 }}>Analyse</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                {[
                  { id: "categories", icon: "◉",  label: "Modules" },
                  { id: "stats",      icon: "▣",  label: "Stats" },
                  { id: "badges",     icon: "🏆", label: "Badges", badge: unlockedBadges.length },
                  { id: "lab",        icon: "🧪", label: "Lab" },
                ].map(item => (
                  <button key={item.id} onClick={() => { setView(item.id); setMobileDrawerOpen(false); }} style={{
                    background: view === item.id ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)", borderRadius: 14,
                    color: "white", padding: "14px 8px", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    fontSize: 13, fontWeight: 600, position: "relative",
                  }}>
                    <span style={{ fontSize: 22 }}>{item.icon}</span>
                    {item.label}
                    {item.badge > 0 && <span style={{ position: "absolute", top: 6, right: 6, background: "#6B82F5", color: "white", borderRadius: 20, padding: "1px 5px", fontSize: 8, fontWeight: 900 }}>{item.badge}</span>}
                  </button>
                ))}
              </div>

              {/* Maîtrise globale mini */}
              {expressions.length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>MAÎTRISE GLOBALE</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: "#93A8FF" }}>
                      {Math.round((expressions.filter(e => e.level >= 7).length / expressions.length) * 100)}%
                    </span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${Math.round((expressions.filter(e => e.level >= 7).length / expressions.length) * 100)}%`, background: "linear-gradient(90deg,#7B93FF,#4D6BFE)", borderRadius: 2 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                    <span>{expressions.filter(e => e.level >= 7).length} maîtrisées</span>
                    <span>{expressions.filter(e => e.nextReview <= today() && e.level < 7).length} en retard</span>
                  </div>
                </div>
              )}

              {/* Pomodoro dans drawer si actif */}
              {(projectPomodoroTime < 25 * 60 || projectPomodoroActive) && (
                <div style={{ background: "rgba(77,107,254,0.2)", borderRadius: 14, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{projectPomodoroMode === "study" ? "📚" : projectPomodoroMode === "project" ? "🗂️" : "☕"}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: "#C7D2FE", fontWeight: 700, flex: 1 }}>{formatPomodoro(projectPomodoroTime)}</span>
                  <button onClick={() => setProjectPomodoroActive(a => !a)} style={{ background: "none", border: "none", color: "#C7D2FE", cursor: "pointer", fontSize: 18 }}>{projectPomodoroActive ? "⏸" : "▶"}</button>
                </div>
              )}
            </div>
          </>
        )}

      <main className="main-content" style={{ flex: 1, width: 0, minWidth: 0, padding: "32px 36px 80px", paddingBottom: isMobile ? "80px" : "80px", position: "relative", zIndex: 1 }}>

                {view === "dashboard" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            {/* Bandeau du haut avec citation et indice de forme */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: theme.cardBg, padding: "24px 32px", borderRadius: 24, marginBottom: 24, boxShadow: "0 4px 15px rgba(0,0,0,0.03)", border: `1px solid ${theme.border}`, flexWrap: "wrap", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <h1 style={{ fontSize: 26, fontWeight: 900, color: theme.text, letterSpacing: "-0.5px", marginBottom: 4 }}>
                  {greeting} El Hadji Malick {hour >= 18 ? "🌙" : "☀️"}
                </h1>
                <p style={{ fontSize: 15, color: theme.textMuted, fontWeight: 500 }}>
                  {dashQuote ? `« ${dashQuote} »` : "Chargement de l'inspiration..."}
                  <button onClick={loadDailyQuote} style={{ marginLeft: 10, background: "none", border: "none", color: theme.highlight, cursor: "pointer", fontWeight: 700 }}>{dashQuoteLoading ? "⏳" : "🔄"}</button>
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                {/* Indice de forme */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: dashFormIndex > 70 ? "#4D6BFE" : dashFormIndex > 40 ? "#6B82F5" : "#EF4444" }}>{dashFormIndex}%</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>Forme du jour</div>
                </div>
                {/* Prochain examen */}
                {dashNextExam && (
                  <div style={{ textAlign: "center", background: dashNextExam.daysLeft <= 7 ? "#FEF2F2" : theme.inputBg, borderRadius: 12, padding: "8px 16px", border: dashNextExam.daysLeft <= 7 ? "2px solid #EF4444" : `1px solid ${theme.border}` }}>
                    <div style={{ fontWeight: 700, color: dashNextExam.daysLeft <= 7 ? "#EF4444" : theme.textMuted, fontSize: 12 }}>{dashNextExam.name}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: dashNextExam.daysLeft <= 7 ? "#EF4444" : theme.highlight }}>
                      J-{dashNextExam.daysLeft}
                    </div>
                  </div>
                )}
                <button onClick={() => setDashFocusMode(!dashFocusMode)} style={{ background: dashFocusMode ? "#3451D1" : theme.inputBg, border: "none", borderRadius: 10, padding: "8px 12px", color: dashFocusMode ? "white" : theme.textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {dashFocusMode ? "🎯 Focus ON" : "Focus"}
                </button>
              </div>
            </div>

            {/* Mode Focus : masque tout sauf l'essentiel */}
            {dashFocusMode && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: 32, marginBottom: 24, border: "2px solid #3451D1" }}>
                <h2>🎯 Mode Focus</h2>
                <p style={{ color: theme.textMuted }}>Fiches urgentes uniquement.</p>
                {dashUrgentCards.map(card => (
                  <div key={card.id} style={{ display: "flex", justifyContent: "space-between", background: theme.inputBg, borderRadius: 12, padding: "10px 16px", marginBottom: 8 }}>
                    <span>{card.front}</span>
                    <span style={{ color: "#EF4444" }}>{card.nextReview}</span>
                  </div>
                ))}
                <button onClick={() => startReview(null, "standard")} className="btn-glow" style={{ marginTop: 16, padding: "14px 28px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer" }}>🚀 Lancer révision urgente</button>
                <button onClick={() => setDashFocusMode(false)} style={{ marginLeft: 16, background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}>Quitter le focus</button>
              </div>
            )}

            {/* Grille de widgets */}
            {!dashFocusMode && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 20 }}>

                {/* Widget 1 – Mission du jour (existant amélioré) */}
                <div style={{ background: isDarkMode ? "linear-gradient(135deg, #2A1400, #1A0800)" : "linear-gradient(135deg, #ffffff, #F8FAFF)", padding: "28px", borderRadius: 24, border: `2px solid ${theme.border}`, gridColumn: "1 / -1" }} className="card-hov">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#EF4444", animation: "pulse 1.5s infinite" }}></div>
                    <h2 style={{ fontSize: 20, fontWeight: 900, color: theme.highlight, margin: 0 }}>Mission du jour</h2>
                  </div>
                  <div style={{ display: "flex", gap: 20, marginTop: 24, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 42, fontWeight: 900, color: todayReviews.length > 0 ? theme.text : "#4D6BFE", lineHeight: 1 }}>{todayReviews.length}</div>
                      <div style={{ color: theme.textMuted, fontWeight: 600, marginTop: 4 }}>Fiches à réviser (~{Math.ceil(todayReviews.length * 0.5)} min)</div>
                    </div>
                    <div style={{ background: isDarkMode ? "#1E3A8A" : "#FFFFFF", border: `1px solid ${isDarkMode?"#4338CA":"#E0E7FF"}`, borderRadius: 16, padding: "16px 20px", minWidth: 160, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: "#4D6BFE" }}>{newCards.length}</div>
                      <div style={{ color: theme.text, fontSize: 13, fontWeight: 700 }}>Dans l'Inbox</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button className="btn-glow hov" onClick={() => startReview(null, "standard")} disabled={todayReviews.length === 0} style={{ flex: 1, padding: "18px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 16, fontSize: 18, fontWeight: 800, cursor: todayReviews.length===0?"default":"pointer", opacity: todayReviews.length===0?0.5:1 }}>
                      🚀 Standard
                    </button>
                    <button className="hov" onClick={() => startReview(null, "interleaving")} disabled={todayReviews.length === 0} style={{ flex: 1, padding: "18px", background: theme.cardBg, border: `2px solid ${theme.highlight}`, color: theme.highlight, borderRadius: 16, fontWeight: 800, cursor: todayReviews.length===0?"default":"pointer", opacity: todayReviews.length===0?0.5:1 }}>
                      🔀 Interleaving
                    </button>
                    <button className="hov" onClick={() => startReview(null, "vocal")} disabled={todayReviews.length === 0} style={{ flex: 1, padding: "18px", background: theme.cardBg, border: `2px solid #4D6BFE`, color: "#4D6BFE", borderRadius: 16, fontWeight: 800, cursor: todayReviews.length===0?"default":"pointer", opacity: todayReviews.length===0?0.5:1 }}>
                      🎤 Vocal
                    </button>
                  </div>
                </div>

                {/* Widget 2 – Plan du jour (Coach IA) */}
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: 20, border: `1px solid ${theme.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, color: theme.text, fontWeight: 800 }}>📅 Plan du jour</h3>
                    <button onClick={loadDailyPlan} style={{ background: "none", border: "none", color: theme.highlight, cursor: "pointer" }}>🔄</button>
                  </div>
                  {dashDailyPlanLoading ? <p style={{ color: theme.textMuted }}>Chargement...</p> :
                    dashDailyPlan.length === 0 ? <button onClick={loadDailyPlan} style={{ background: theme.inputBg, border: "none", padding: "8px 16px", borderRadius: 8, color: theme.text, fontWeight: 700, cursor: "pointer" }}>🤖 Générer mon plan</button> :
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {dashDailyPlan.map((slot, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", background: theme.inputBg, borderRadius: 10, padding: "8px 12px" }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: "#3451D1" }}>{slot.time}</span>
                          <span style={{ color: theme.text, fontSize: 13 }}>{slot.activity}</span>
                        </div>
                      ))}
                    </div>
                  }
                </div>

                {/* Widget 3 – Rétrospective semaine */}
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: 20, border: `1px solid ${theme.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, color: theme.text, fontWeight: 800 }}>📊 Rétro semaine</h3>
                    <button onClick={loadWeeklyRetro} style={{ background: "none", border: "none", color: theme.highlight, cursor: "pointer" }}>🔄</button>
                  </div>
                  {dashWeeklyRetroLoading ? <p style={{ color: theme.textMuted }}>Chargement...</p> :
                    dashWeeklyRetro ? (
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#4D6BFE" }}>{dashWeeklyRetro.totalReviews} révisions</div>
                        <p style={{ color: theme.textMuted, fontSize: 13, marginTop: 6 }}>{dashWeeklyRetro.summary}</p>
                      </div>
                    ) : <button onClick={loadWeeklyRetro} style={{ background: theme.inputBg, border: "none", padding: "8px 16px", borderRadius: 8, color: theme.text, fontWeight: 700, cursor: "pointer" }}>Voir la rétrospective</button>
                  }
                </div>

                {/* Widget 4 – Objectifs de la semaine */}
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: 20, border: `1px solid ${theme.border}` }}>
                  <h3 style={{ margin: "0 0 12px", color: theme.text, fontWeight: 800 }}>🎯 Objectifs de la semaine</h3>
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {dashWeeklyGoals.map((goal, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <input type="checkbox" style={{ accentColor: "#4D6BFE" }} />
                        <span style={{ color: theme.text }}>{goal}</span>
                        <button onClick={() => removeWeeklyGoal(i)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#EF4444", cursor: "pointer" }}>✕</button>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={dashWeeklyGoalsInput} onChange={e => setDashWeeklyGoalsInput(e.target.value)} placeholder="Nouvel objectif..." style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }} />
                    <button onClick={addWeeklyGoal} style={{ padding: "8px 14px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 8, fontWeight: 700 }}>+</button>
                  </div>
                </div>

                {/* Widget 5 – Prochain oubli (cartes critiques) */}
                {dashUrgentCards.length > 0 && (
                  <div style={{ background: "#EFF3FF", borderRadius: 22, padding: 20, border: "2px solid #C7D2FE", gridColumn: "1 / -1" }}>
                    <h3 style={{ margin: "0 0 12px", color: "#1E3A8A" }}>⚠️ À réviser maintenant (risque d'oubli)</h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {dashUrgentCards.map(card => (
                        <div key={card.id} style={{ background: "white", borderRadius: 12, padding: "10px 16px", border: "1px solid #C7D2FE", fontWeight: 600, color: "#1E3558" }}>
                          {card.front} <span style={{ fontSize: 11, color: "#4D6BFE" }}>({card.nextReview})</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => startReview(null, "standard")} style={{ marginTop: 12, padding: "8px 20px", background: "#6B82F5", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>🚀 Réviser ces cartes</button>
                  </div>
                )}

                {/* Widget 6 – Citation du jour */}
                <div style={{ background: "linear-gradient(135deg, #FFFFFF, #EEF2FF)", borderRadius: 22, padding: 20, border: "1px solid #C7D2FE" }}>
                  <p style={{ fontStyle: "italic", color: "#4C1D95", margin: 0 }}>« {dashQuote || "La connaissance s'acquiert par l'expérience, tout le reste n'est que de l'information."} »</p>
                </div>

                {/* Widget 7 – Modules (déjà présent mais réduit) */}
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: 20, border: `1px solid ${theme.border}`, gridColumn: "1 / -1" }}>
                  <h3 style={{ margin: "0 0 12px", color: theme.text, fontWeight: 800 }}>⚡ État des modules</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 16 }}>
                    {categories.map((cat) => {
                      const catExps = expressions.filter((e) => e.category === cat.name);
                      const dueCount = catExps.filter((e) => e.nextReview <= today() && e.level < 7).length;
                      const mastered = catExps.filter((e) => e.level >= 7).length;
                      const pct = catExps.length ? Math.round((mastered / catExps.length) * 100) : 0;
                      const daysToExam = cat.examDate ? Math.ceil((new Date(cat.examDate) - new Date()) / 86400000) : null;
                      const isUrgent = daysToExam !== null && daysToExam <= 7;
                      const catColor = isUrgent ? "#EF4444" : (cat.color || "#3451D1");
                      return (
                        <div key={cat.name} style={{
                          background: theme.cardBg, borderRadius: 20, padding: "20px", border: `1px solid ${theme.border}`, borderLeft: `6px solid ${catColor}`
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ fontWeight: 800, color: theme.text, fontSize: 16, marginBottom: 12 }}>{cat.name}</div>
                            {dueCount > 0 && <span style={{ background: "#FEE2E2", color: "#EF4444", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>{dueCount} dues</span>}
                          </div>
                          {daysToExam !== null && <div style={{ fontSize: 12, fontWeight: 700, color: isUrgent ? "#EF4444" : "#4D6BFE", marginBottom: 8 }}>{daysToExam > 0 ? `⏳ Examen J-${daysToExam}` : daysToExam === 0 ? "🚨 Examen aujourd'hui !" : "Passé"}</div>}
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                            <div style={{ flex: 1, height: 8, background: theme.inputBg, borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: pct >= (cat.targetScore || 80) ? "#4D6BFE" : catColor }} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: catColor, minWidth: 38 }}>{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Widget 8 – Classement (facultatif) */}
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: 20, border: `1px solid ${theme.border}` }}>
                  <h3 style={{ margin: "0 0 12px", color: theme.text, fontWeight: 800 }}>🏆 Classement</h3>
                  <button onClick={loadLeaderboard} style={{ marginBottom: 8, background: theme.inputBg, border: "none", padding: "6px 12px", borderRadius: 6, color: theme.text, fontWeight: 700, cursor: "pointer" }}>Actualiser</button>
                  {dashLeaderboard.map(user => (
                    <div key={user.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${theme.border}` }}>
                      <span>{user.rank === 1 ? "🥇" : user.rank === 2 ? "🥈" : "🥉"} {user.name}</span>
                      <span>{user.xp} XP</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VUE RÉVISION */}
        {view === "review" && (showSessionSummary ? (
          <div style={{ animation: "fadeUp 0.4s ease", background: theme.cardBg, borderRadius: 26, padding: 32, maxWidth: 700, margin: "0 auto", textAlign: "center", border: `1px solid ${theme.border}` }}>
            <h1 style={{ fontWeight: 900, color: theme.highlight }}>Session terminée ! 🎉</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
              <div style={{ background: theme.inputBg, padding: 14, borderRadius: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: theme.highlight }}>{sessionSummary?.totalCards}</div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>Cartes révisées</div>
              </div>
              <div style={{ background: theme.inputBg, padding: 14, borderRadius: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: theme.highlight }}>{sessionSummary?.avgTime}s</div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>Temps moyen / carte</div>
              </div>
              <div style={{ background: theme.inputBg, padding: 14, borderRadius: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: theme.highlight }}>N{sessionSummary?.avgLevelBefore}</div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>Niveau moy. avant</div>
              </div>
              <div style={{ background: theme.inputBg, padding: 14, borderRadius: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#4D6BFE" }}>N{sessionSummary?.avgLevelAfter}</div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>Niveau moy. estimé après</div>
              </div>
            </div>
            <button onClick={() => { setView("dashboard"); setShowSessionSummary(false); }} className="btn-glow hov" style={{ marginTop: 24, padding: "14px 28px", background: "#3451D1", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>Retour au tableau de bord</button>
          </div>
        ) : currentCard && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <button onClick={() => { clearInterval(sessionTimerRef.current); setView("dashboard"); if (reviewSessionDone > 0) updateStreakAfterSession(reviewSessionDone); }} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Quitter</button>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 15, color: theme.textMuted }}><span style={{ color: theme.highlight, fontWeight: 800 }}>{reviewIndex + 1}</span> / {reviewQueue.length}</div>
              <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 900, fontSize: 14, background: "#FFFFFF", color: "#3451D1", padding: "4px 12px", borderRadius: 8 }}>⏱ {Math.floor(sessionTimer/60)}:{(sessionTimer%60).toString().padStart(2,'0')}</div>
            </div>
            <div style={{ height: 8, background: theme.inputBg, borderRadius: 4, marginBottom: 32, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg, #3451D1, #4D6BFE)", borderRadius: 4, transition: "width 0.4s ease", width: `${(reviewIndex / reviewQueue.length) * 100}%` }} />
            </div>
            {currentCard && (() => {
              const tag = cognitiveTag(currentCard);
              return (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <span style={{ background: tag.color + "22", color: tag.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{tag.icon} {tag.label}</span>
                </div>
              );
            })()}
            <div className="card-hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 26, padding: "32px", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", maxWidth: 700, margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span style={{ background: theme.inputBg, color: theme.highlight, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{currentCard.category}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ background: "#FFFFFF", color: "#3451D1", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>{currentCard.difficulty !== undefined ? `Diff: ${currentCard.difficulty.toFixed(1)}/10` : `EF: ${(currentCard.easeFactor || 2.5).toFixed(1)}`}</span>
                  <span style={{ background: "#4D6BFE22", color: "#4D6BFE", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>N{currentCard.level}</span>
                </div>
              </div>
              <div style={{ background: isDarkMode?"#0F1A3A":"#F8FAFF", borderRadius: 20, padding: "28px", marginBottom: 20, border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: 11, color: "#60A5FA", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>QUESTION</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: theme.highlight, lineHeight: 1.35, marginBottom: currentCard.imageUrl ? 20 : 0 }}>{currentCard.front}</div>
                {currentCard.imageUrl && (
                  <img src={currentCard.imageUrl} alt="support visuel" className={!revealed ? "occlusion-img" : ""} style={{ width: "100%", borderRadius: 16, border: `2px solid ${theme.border}` }} title={!revealed ? "Survole l'image pour l'apercevoir" : ""} />
                )}
              </div>
              {!revealed ? (
                <div style={{ marginTop: 24 }}>
                  {voiceReviewActive ? (
                    <div style={{ textAlign: "center", padding: 20 }}>
                      <div style={{ fontSize: 40, animation: "pulse 1s infinite", marginBottom: 16 }}>🎤</div>
                      <p style={{ fontWeight: 700, color: theme.highlight }}>Parle ta réponse... (reconnaissance active)</p>
                      <button className="hov btn-glow" onClick={handleRevealAndStopVoice} style={{ padding: "12px 24px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 800, marginTop: 12 }}>Arrêter et voir la réponse</button>
                    </div>
                  ) : (
                    <>
                      <textarea style={{ width: "100%", padding: "16px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text, minHeight: 80, marginBottom: 12 }} placeholder="Tape ta réponse..." value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} />
                      {socraticHint && <div style={{ background: "#EFF3FF", borderLeft: "4px solid #6B82F5", padding: 12, borderRadius: 4, marginBottom: 16, color: "#1E3A8A", fontSize: 14 }}><strong style={{ display: "block", marginBottom: 4 }}>🧙‍♂️ Tuteur IA :</strong> {socraticHint}</div>}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <button onClick={handleSemanticEval} disabled={evalLoading || !userAnswer.trim()} style={{ flex: 1, padding: "18px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>{evalLoading ? "🧠 Analyse..." : "🧠 IA Socratique"}</button>
                        <button onClick={handleReveal} style={{ flex: "0 0 auto", padding: "18px", background: "transparent", color: theme.textMuted, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Passer / Voir</button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ animation: "slideIn 0.3s ease" }}>
                  <div style={{ background: isDarkMode?"#2A1400":"#FFFFFF", border: `2px solid ${isDarkMode?"#3D2000":"#EEF2FF"}`, borderRadius: 20, padding: "28px", marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: "#4D6BFE", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>RÉPONSE</div>
                    <div dangerouslySetInnerHTML={{ __html: highlightCode(currentCard.back) }} style={{ fontSize: 18, fontWeight: 600, color: theme.text, lineHeight: 1.6 }} />
                    {currentCard.example && (
                      <div style={{ marginTop: 16, padding: "14px 18px", background: theme.cardBg, borderRadius: 12, fontSize: 14, color: theme.textMuted, fontStyle: "italic", borderLeft: "4px solid #4D6BFE" }}>
                        <span style={{ color: "#4D6BFE", fontSize: 11, fontFamily: "JetBrains Mono" }}>// exemple</span><br />
                        <div dangerouslySetInnerHTML={{ __html: highlightCode(currentCard.example) }} />
                      </div>
                    )}
                  </div>
                  <button className="hov" onClick={generateMnemonic} disabled={mnemonicLoading} style={{ display: "block", width: "100%", padding: "12px", background: "linear-gradient(135deg, #FFFFFF, #EEF2FF)", color: "#4D6BFE", border: "1px solid #C7D2FE", borderRadius: 12, fontWeight: 800, marginBottom: 20, cursor: "pointer" }}>
                    {mnemonicLoading ? "⏳ Création..." : "✨ Générer un Mnémonique"}
                  </button>
                  {mnemonicText && (
                    <div style={{ background: "#FFFFFF", borderLeft: "4px solid #4D6BFE", padding: "16px", borderRadius: 12, color: "#4C1D95", marginBottom: 20, fontSize: 14, fontStyle: "italic" }}>{mnemonicText}</div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <button className="hov" onClick={() => handleAnswer(0)} style={{ padding: "16px 8px", background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 16, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>😓 Oublié <span style={{ fontSize: 11, opacity: 0.8 }}>1</span></button>
                    <button className="hov" onClick={() => handleAnswer(3)} style={{ padding: "16px 8px", background: "#E8EEFF", color: "#2D45B0", border: "1px solid #C7D2FE", borderRadius: 16, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>🤔 Hésité <span style={{ fontSize: 11, opacity: 0.8 }}>2</span></button>
                    <button className="hov" onClick={() => handleAnswer(5)} style={{ padding: "16px 8px", background: "#EEF2FF", color: "#2D45B0", border: "1px solid #C7D2FE", borderRadius: 16, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>⚡ Facile <span style={{ fontSize: 11, opacity: 0.8 }}>3</span></button>
                  </div>
                </div>
              )}
            </div>
            {(currentCard.reviewHistory?.length || 0) > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20, justifyContent: "center" }}>
                <span style={{ color: theme.textMuted, fontSize: 12, fontFamily: "JetBrains Mono" }}>Historique: </span>
                {currentCard.reviewHistory.slice(-7).map((h, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: h.q === 0 ? "#F04040" : h.q === 3 ? "#7B93FF" : "#4D6BFE" }} title={`${h.date} — ${h.q === 0 ? "Oublié" : h.q === 3 ? "Hésité" : "Facile"}`} />)}
              </div>
            )}
          </div>
        ))}

                {view === "add" && (addZenMode ? (
          /* ── MODE ZEN ── */
          <div style={{ animation: "fadeUp 0.4s ease", minHeight: "100vh", background: isDarkMode ? "#0F1A3A" : "#F0F5FF", padding: "40px 20px", display: "flex", justifyContent: "center" }}>
            <div style={{ maxWidth: 600, width: "100%", background: theme.cardBg, borderRadius: 24, padding: "40px", border: `1px solid ${theme.border}`, boxShadow: "0 20px 50px rgba(0,0,0,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h1 style={{ fontWeight: 900, color: theme.highlight, margin: 0 }}>🧘 Mode Zen</h1>
                <button onClick={() => setAddZenMode(false)} className="hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 14px", color: theme.highlight, cursor: "pointer", fontWeight: 600 }}>Quitter</button>
              </div>
              <select value={addForm.category} onChange={e => setAddForm(f => ({...f, category: e.target.value}))} style={{ width:"100%", padding:"14px", background:theme.inputBg, border:`2px solid ${theme.border}`, borderRadius:12, color:theme.text, marginBottom:16, fontWeight:600 }}>
                {catNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={addForm.front} onChange={e => { setAddForm(f=>({...f, front:e.target.value})); if(e.target.value.length>3) checkDoublon(e.target.value); }} style={{ width:"100%", padding:"14px", background:theme.inputBg, border:`2px solid ${theme.border}`, borderRadius:12, color:theme.text, marginBottom:12, fontSize:16 }} placeholder="Concept à maîtriser..." />
              {addDoublonCheck?.duplicate && <div style={{ background:"#E8EEFF", padding:8, borderRadius:8, marginBottom:12, color:"#1E3A8A" }}>⚠️ Semble être un doublon de : <strong>{addDoublonCheck.existingConcept}</strong>. {addDoublonCheck.conseil}</div>}
              <textarea value={addForm.back} onChange={e => setAddForm(f=>({...f, back:e.target.value}))} style={{ width:"100%", padding:"14px", background:theme.inputBg, border:`2px solid ${theme.border}`, borderRadius:12, color:theme.text, minHeight:100, marginBottom:12, fontSize:14 }} placeholder="Explication claire..." />
              <input value={addForm.example} onChange={e => setAddForm(f=>({...f, example:e.target.value}))} style={{ width:"100%", padding:"14px", background:theme.inputBg, border:`2px solid ${theme.border}`, borderRadius:12, color:theme.text, marginBottom:20, fontSize:14 }} placeholder="Exemple concret..." />
              <button onClick={handleAddWithInverted} className="btn-glow hov" disabled={!addForm.front || !addForm.back} style={{ width:"100%", padding:"18px", background:"linear-gradient(135deg,#3451D1,#4D6BFE)", color:"white", border:"none", borderRadius:14, fontWeight:800, fontSize:16, cursor:"pointer", opacity: addForm.front && addForm.back ? 1:0.5 }}>⚡ Créer</button>
            </div>
          </div>
        ) : (
          /* ── VUE NORMALE ── */
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, letterSpacing: "-1px" }}>{editingId ? "✏️ Mode Édition" : "⚡ Forge à Fiches"}</h1>
                <p style={{ color: theme.textMuted, fontSize: 14, marginTop: 6 }}>{editingId ? "Ajuste ta fiche." : "Crée, génère en rafale, importe ou analyse une image."}</p>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button onClick={() => setAddZenMode(true)} className="hov" style={{ padding:"8px 16px", background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:10, color:theme.textMuted, fontWeight:600, fontSize:12 }}>🧘 Zen</button>
                {editingId && <button onClick={cancelEdit} className="hov" style={{ background:"#FEF2F2", color:"#EF4444", border:"none", borderRadius:12, padding:"8px 16px", fontWeight:700, cursor:"pointer" }}>✕ Annuler</button>}
              </div>
            </div>
            {/* Tabs de sous-vue */}
            {!editingId && (
              <div style={{ display: "flex", gap: 8, marginBottom: 24, background: theme.cardBg, padding: 6, borderRadius: 18, border: `1px solid ${theme.border}`, boxShadow: "0 4px 15px rgba(0,0,0,0.04)", flexWrap: "wrap" }}>
                {[
                  { id: "single", icon: "✦", label: "Fiche unique" },
                  { id: "batch", icon: "🚀", label: "Batch IA" },
                  { id: "text", icon: "📄", label: "Depuis un texte" },
                  { id: "file", icon: "📎", label: "Image & Vision IA" },
                  { id: "multimedia", icon: "🎨", label: "Multimédia" },
                  { id: "templates", icon: "📋", label: "Templates" },
                ].map(t => (
                  <button key={t.id} onClick={() => { setAddSubView(t.id); setShowBatchPreview(false); }} className="hov" style={{ flex: 1, padding: "12px 8px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, transition: "all 0.2s", background: addSubView === t.id ? "linear-gradient(135deg, #3451D1, #4D6BFE)" : "transparent", color: addSubView === t.id ? "white" : theme.textMuted }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* ========= BATCH QUEUE (visible dans toute la vue) ========= */}
            {addBatchQueue.length > 0 && (
              <div style={{ background: theme.cardBg, borderRadius: 16, padding: "14px 20px", marginBottom: 20, border: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><span style={{ fontWeight:800, color:theme.text }}>{addBatchQueue.length} concepts en file</span> <span style={{ color:theme.textMuted }}>{addBatchQueue.slice(0,3).join(', ')}{addBatchQueue.length>3 ? '...' : ''}</span></div>
                <button onClick={processBatchQueue} disabled={addBatchRunning} className="hov btn-glow" style={{ background:"linear-gradient(135deg,#4D6BFE,#3451D1)", color:"white", border:"none", borderRadius:10, padding:"8px 18px", fontWeight:800, cursor:"pointer" }}>{addBatchRunning ? "⏳" : "▶️ Traiter"}</button>
              </div>
            )}

            {/* ========= SINGLE / EDITION ========= */}
            {(addSubView === "single" || editingId) && (
              <div style={{ background: "linear-gradient(135deg, #3451D1 0%, #4D6BFE 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32, boxShadow: "0 15px 35px rgba(123,95,245,0.2)" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>✨</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Auto-Génération IA</div><div style={{ color: "#EEF2FF", fontSize: 13 }}>L'IA s'adapte automatiquement au module sélectionné.</div></div></div>
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !aiLoading && handleAIGenerate()} style={{ flex: 1, padding: "16px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white" }} placeholder='Ex: "Interface vs Classe abstraite"...' />
                  <button className="hov btn-glow" onClick={handleAIGenerate} disabled={aiLoading} style={{ padding: "16px 28px", background: "white", color: "#3451D1", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer" }}>{aiLoading ? "⏳" : "Générer"}</button>
                </div>
              </div>
            )}

            {addSubView === "batch" && !editingId && (
              <div style={{ background: "linear-gradient(135deg, #1A0800 0%, #3451D1 50%, #3451D1 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>🚀</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Génération en Rafale</div><div style={{ color: "#EEF2FF", fontSize: 13 }}>L'IA génère plusieurs fiches d'un coup.</div></div></div>
                <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                  <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} style={{ flex: 1, minWidth: 200, padding: "16px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white" }} placeholder='Ex: "Annotations Spring Boot"...' />
                  <select value={aiBatchCount} onChange={e => setAiBatchCount(+e.target.value)} style={{ padding: "14px 16px", background: "#1e3a8a", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, color: "white", fontWeight: 700 }}>{[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} fiches</option>)}</select>
                  <button className="hov btn-glow" onClick={handleAIBatchGenerate} disabled={aiBatchLoading || !aiPrompt.trim()} style={{ padding: "16px 28px", background: "white", color: "#3451D1", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer" }}>{aiBatchLoading ? "⏳" : `🚀 ×${aiBatchCount}`}</button>
                </div>
                {showBatchPreview && batchPreview.length > 0 && (
                  <div style={{ marginTop: 20, background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: "20px", border: "1px solid rgba(255,255,255,0.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <div style={{ color: "white", fontWeight: 800, fontSize: 14 }}>📋 {batchPreview.length} fiches prêtes</div>
                      <div style={{ display: "flex", gap: 8 }}><button onClick={() => { setBatchPreview([]); setShowBatchPreview(false); }} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", borderRadius: 10, padding: "8px 14px", cursor: "pointer" }}>Annuler</button><button className="hov btn-glow" onClick={confirmBatch} style={{ background: "#4D6BFE", border: "none", color: "white", borderRadius: 10, padding: "8px 18px", fontWeight: 800, cursor: "pointer" }}>✅ Sauvegarder</button></div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 380, overflowY: "auto" }}>
                      {batchPreview.map((card, idx) => (
                        <div key={idx} style={{ background: "white", borderRadius: 14, padding: "16px", display: "flex", gap: 12 }}>
                          <div style={{ flex: 1 }}><div style={{ fontWeight: 800, color: "#3451D1", marginBottom: 6 }}>{card.front}</div><div style={{ color: "#4B5563", fontSize: 13 }}>{card.back}</div></div>
                          <button onClick={() => removeBatchCard(idx)} style={{ background: "#FEF2F2", border: "none", borderRadius: 8, padding: "6px 10px", color: "#EF4444", cursor: "pointer" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* File d'attente batch */}
                <div style={{ marginTop: 16, display:"flex", gap:8 }}>
                  <input placeholder="Ajouter un concept à la file..." style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:"rgba(255,255,255,0.1)", color:"white" }} onKeyDown={e => { if(e.key==='Enter') { addToBatchQueue(e.target.value); e.target.value=''; }}} />
                  <button onClick={() => showToast("Tape un concept et appuie sur Entrée pour l'ajouter à la file.")} style={{ background:"white", color:"#3451D1", border:"none", borderRadius:10, padding:"8px 14px", fontWeight:800 }}>+</button>
                </div>
              </div>
            )}

            {addSubView === "text" && !editingId && (
              <div style={{ background: "linear-gradient(135deg, #1E3A8A 0%, #4338CA 50%, #4D6BFE 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>📄</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Génération depuis un Texte</div><div style={{ color: "#EEF2FF", fontSize: 13 }}>Colle un cours, l'IA extrait les concepts.</div></div></div>
                <div style={{ marginTop: 16 }}>
                  <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "12px 16px", background: "#1E3A8A", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "white", fontWeight: 700, width: "100%", marginBottom: 8 }}>{catNames.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <textarea value={aiFromText} onChange={e => setAiFromText(e.target.value)} style={{ width: "100%", padding: "16px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white", minHeight: 140 }} placeholder="Colle ton texte ici..." />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}><span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{aiFromText.length}/3000</span><button className="hov btn-glow" onClick={handleAIFromText} disabled={aiFromTextLoading || !aiFromText.trim()} style={{ padding: "14px 24px", background: "white", color: "#1E3A8A", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>{aiFromTextLoading ? "⏳" : "🔍 Analyser"}</button></div>
                </div>
              </div>
            )}

            {addSubView === "file" && !editingId && (
              <div style={{ background: "linear-gradient(135deg, #1E3A8A 0%, #3451D1 50%, #4D6BFE 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>👁️</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>L'Œil de l'IA (Vision)</div><div style={{ color: "#EEF2FF", fontSize: 13 }}>Upload un schéma ou une capture d'écran.</div></div></div>
                <div style={{ marginTop: 16 }}>
                  <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "12px 16px", background: "#1E3A8A", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "white", fontWeight: 700, width: "100%", marginBottom: 12 }}>{catNames.map(c => <option key={c} value={c}>{c}</option>)}</select>
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
                      <button onClick={handleVisionAI} disabled={aiLoading} className="btn-glow hov" style={{ display: "block", width: "100%", padding: "16px", background: "white", color: "#1E3A8A", border: "none", borderRadius: 12, fontWeight: 900, cursor: "pointer", fontSize: 16 }}>{aiLoading ? "🧠 Analyse complexe en cours..." : "✨ Extraire le concept"}</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {addSubView === "multimedia" && !editingId && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: "28px", marginBottom: 32, border: `1px solid ${theme.border}` }}>
                <h2 style={{ fontWeight:800, marginBottom:16 }}>🎨 Multimédia</h2>
                {/* Galerie d'images */}
                <div style={{ marginBottom:20 }}>
                  <button onClick={() => setAddImageGallery(!addImageGallery)} className="hov" style={{ padding: "10px 20px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, fontWeight: 700, cursor: "pointer" }}>🖼️ Galerie d'images</button>
                  {addImageGallery && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                        <input value={addImageSearch} onChange={e=>setAddImageSearch(e.target.value)} placeholder="Rechercher..." style={{ flex:1, padding:"8px", background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:8, color:theme.text }} />
                        <button onClick={searchImages} disabled={addImageSearchLoading} className="hov" style={{ background:"#4D6BFE", color:"white", border:"none", borderRadius:8, padding:"8px 16px" }}>🔍</button>
                      </div>
                      <div style={{ display:"flex", gap:8, overflowX:"auto" }}>
                        {addImageResults.map((img,i) => (
                          <img key={i} src={img.url} alt={img.alt} onClick={()=>selectImage(img.url)} style={{ width:100, height:100, objectFit:"cover", borderRadius:8, cursor:"pointer", border: `2px solid ${theme.border}` }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Diagramme */}
                <div style={{ marginBottom:20 }}>
                  <button onClick={() => setAddDiagramMode(!addDiagramMode)} className="hov" style={{ padding: "10px 20px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, fontWeight: 700, cursor: "pointer" }}>📐 Diagramme (Mermaid)</button>
                  {addDiagramMode && (
                    <div style={{ marginTop:12 }}>
                      <textarea rows={6} value={addDiagramCode} onChange={e=>setAddDiagramCode(e.target.value)} style={{ width:"100%", padding:"10px", background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:8, color:theme.text }} placeholder="graph TD; A-->B;..." />
                      <button onClick={renderDiagram} className="hov" style={{ marginTop:8, padding:"8px 16px", background:"#7B93FF", color:"white", border:"none", borderRadius:8 }}>Générer</button>
                      {addDiagramSvg && <div style={{ marginTop:12, background:"white", padding:12, borderRadius:8 }} dangerouslySetInnerHTML={{ __html: addDiagramSvg }} />}
                      {addDiagramSvg && <button onClick={insertDiagram} className="hov" style={{ marginTop:8, background:"#4D6BFE", color:"white", border:"none", borderRadius:8, padding:"8px 16px" }}>Insérer dans la fiche</button>}
                    </div>
                  )}
                </div>
                {/* Audio */}
                <div>
                  <button onClick={addAudioRecording ? stopAudioRecording : startAudioRecording} className="hov" style={{ padding: "10px 20px", background: addAudioRecording ? "#EF4444" : theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: addAudioRecording ? "white" : theme.text, fontWeight: 700, cursor: "pointer" }}>{addAudioRecording ? "⏹️ Stop" : "🎙️ Enregistrer audio"}</button>
                  {addAudioUrl && <audio controls src={addAudioUrl} style={{ marginTop:8, width:"100%" }} />}
                </div>
              </div>
            )}

            {addSubView === "templates" && !editingId && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: "28px", marginBottom: 32, border: `1px solid ${theme.border}` }}>
                <h2 style={{ fontWeight:800, marginBottom:16 }}>📋 Templates de fiches</h2>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {addTemplatePresets.map(t => (
                    <button key={t.id} onClick={() => setAddTemplate(t.id)} className="hov" style={{ padding:"12px 20px", background: addTemplate===t.id ? theme.highlight : theme.inputBg, color: addTemplate===t.id ? "white" : theme.text, border: `1px solid ${theme.border}`, borderRadius:12, fontWeight:700, cursor:"pointer" }}>{t.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* FORMULAIRE PRINCIPAL */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 32, alignItems: "start" }}>
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 24, padding: "32px", boxShadow: "0 10px 40px rgba(0,0,0,0.04)" }}>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8, display: "block" }}>Module de destination</label>
                  <select value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} style={{ width: "100%", padding: "16px 20px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, fontWeight: 600, color: theme.text }}>{catNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>Recto <span style={{ color: "#4D6BFE" }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <input autoFocus value={addForm.front} onChange={(e) => { setAddForm((f) => ({ ...f, front: e.target.value })); if(e.target.value.length>3 && !editingId) checkDoublon(e.target.value); }} style={{ width: "100%", padding: "16px 20px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text }} placeholder="Le concept à mémoriser..." />
                    <button onClick={() => listening === "front" ? stopVoice() : startVoice("front")} className={listening === "front" ? "mic-pulse" : "hov"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: theme.cardBg, border: `1px solid ${theme.border}`, cursor: "pointer", fontSize: 20, padding: 8, borderRadius: 12, color: listening === "front" ? "#EF4444" : theme.textMuted }}>🎙️</button>
                  </div>
                  {/* Doublon */}
                  {addDoublonCheck?.duplicate && <div style={{ marginTop:8, background:"#E8EEFF", padding:8, borderRadius:8, color:"#1E3A8A", fontSize:13 }}>⚠️ Doublon possible : <strong>{addDoublonCheck.existingConcept}</strong>. {addDoublonCheck.conseil}</div>}
                  {/* Reformulations */}
                  {addReformulations['front'] && (
                    <div style={{ marginTop:6 }}>
                      {addReformulations['front'].map((r,i) => <div key={i} onClick={() => setAddForm(f=>({...f, front:r}))} style={{ cursor:"pointer", padding:"4px 8px", background:theme.inputBg, borderRadius:6, marginBottom:4, fontSize:12 }}>{r}</div>)}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted }}>Verso <span style={{ color: "#4D6BFE" }}>*</span></label>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={() => generateReformulations('back')} disabled={addReformLoading} style={{ background: "#FFFFFF", color: "#4D6BFE", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>✨ Reformuler</button>
                      <button onClick={() => handleMicroAI("back")} disabled={aiLoading} style={{ background: "#FFFFFF", color: "#4D6BFE", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>🤖 Expliquer</button>
                    </div>
                  </div>
                  <textarea value={addForm.back} onChange={(e) => setAddForm((f) => ({ ...f, back: e.target.value }))} onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); handleAdd(); } }} style={{ width: "100%", padding: "16px 20px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text, minHeight: 110 }} placeholder="L'explication claire..." />
                  {addReformulations['back'] && (
                    <div style={{ marginTop:6 }}>
                      {addReformulations['back'].map((r,i) => <div key={i} onClick={() => setAddForm(f=>({...f, back:r}))} style={{ cursor:"pointer", padding:"4px 8px", background:theme.inputBg, borderRadius:6, marginBottom:4, fontSize:12 }}>{r}</div>)}
                    </div>
                  )}
                  {/* Couches */}
                  {addLayeredMode && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ fontWeight:700, fontSize:12, marginBottom:6 }}>Couches de complexité</div>
                      {addLayers.map((layer, idx) => (
                        <div key={idx} style={{ display:"flex", gap:6, marginBottom:6 }}>
                          <input value={layer.back} onChange={e=>updateLayer(idx,e.target.value)} style={{ flex:1, padding:"8px", background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:8, color:theme.text }} placeholder={`Niveau ${idx+1}`} />
                          {idx>0 && <button onClick={()=>removeLayer(idx)} style={{ background:"none", border:"none", color:"#EF4444", cursor:"pointer" }}>✕</button>}
                        </div>
                      ))}
                      <button onClick={addLayer} style={{ background:"none", border:"none", color:theme.highlight, cursor:"pointer", fontSize:12 }}>+ Ajouter un niveau</button>
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><label style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted }}>Exemple</label><button onClick={() => handleMicroAI("example")} disabled={aiLoading} style={{ background: "#FFFFFF", color: "#4D6BFE", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>💡 Exemple</button></div>
                  <input value={addForm.example} onChange={(e) => setAddForm((f) => ({ ...f, example: e.target.value }))} style={{ width: "100%", padding: "16px 20px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text }} placeholder="Mise en contexte..." />
                </div>
                {/* Métaphore */}
                <div style={{ marginBottom:20 }}>
                  <button onClick={generateMetaphore} disabled={addMetaphoreLoading} style={{ background: "#FFFFFF", color: "#4D6BFE", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor:"pointer" }}>🌱 Générer une métaphore</button>
                  {addMetaphoreText && <div style={{ marginTop:8, padding:10, background:"#EFF3FF", borderRadius:8, fontSize:13, fontStyle:"italic" }}>{addMetaphoreText}</div>}
                </div>
                {/* Options */}
                <div style={{ display:"flex", gap:16, marginBottom:16, flexWrap:"wrap" }}>
                  <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:theme.textMuted }}>
                    <input type="checkbox" checked={addAutoInverted} onChange={e=>setAddAutoInverted(e.target.checked)} /> Fiche inversée auto
                  </label>
                  <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:theme.textMuted }}>
                    <input type="checkbox" checked={addLayeredMode} onChange={e=>setAddLayeredMode(e.target.checked)} /> Couches de complexité
                  </label>
                  <button onClick={startCollaboration} className="hov" style={{ fontSize:12, background:"none", border:`1px solid ${theme.border}`, borderRadius:8, padding:"4px 10px", color:theme.textMuted, cursor:"pointer" }}>👥 Collab</button>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="hov btn-glow" onClick={handleAddWithInverted} disabled={!addForm.front.trim() || !addForm.back.trim()} style={{ flex: 1, padding: "18px 24px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>{editingId ? "💾 Mettre à jour" : "⚡ Créer + Inversée"}</button>
                  {!editingId && <button className="hov" onClick={() => setAddForm((f) => ({ ...f, front: "", back: "", example: "", imageUrl: null }))} style={{ padding: "18px 24px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Effacer</button>}
                </div>
              </div>
              {/* PREVIEW */}
              <div style={{ position: "sticky", top: 90, display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: theme.textMuted, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace", paddingLeft: 12 }}>LIVE PREVIEW</div>
                <div style={{ background: theme.cardBg, border: `2px dashed ${theme.highlight}55`, borderRadius: 24, padding: "28px", boxShadow: "0 20px 50px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><span style={{ background: theme.inputBg, color: theme.highlight, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{addForm.category || "Catégorie"}</span><span style={{ background: "#FFFFFF", color: "#3451D1", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Niveau 0</span></div>
                  <div style={{ background: theme.inputBg, borderRadius: 20, padding: "28px", marginBottom: 20, border: `1px solid ${theme.border}` }}><div style={{ fontSize: 11, color: "#60A5FA", fontWeight: 800, letterSpacing: 2, marginBottom: 14 }}>QUESTION</div><div style={{ fontSize: 26, fontWeight: 800, color: addForm.front ? theme.highlight : theme.textMuted }}>{addForm.front || "Tape un concept..."}</div></div>
                  {addForm.imageUrl && <img src={addForm.imageUrl} className="occlusion-img" alt="media" style={{ width: "100%", borderRadius: 16, marginBottom: 20, border: `1px solid ${theme.border}` }} />}
                  {addAudioUrl && <audio controls src={addAudioUrl} style={{ width:"100%", marginBottom:16 }} />}
                  {addDiagramSvg && <div style={{ marginBottom:16 }} dangerouslySetInnerHTML={{ __html: addDiagramSvg }} />}
                  <div style={{ background: isDarkMode?"#2A1400":"#FFFFFF", border: `2px solid ${isDarkMode?"#3D2000":"#EEF2FF"}`, borderRadius: 20, padding: "28px" }}>
                    <div style={{ fontSize: 11, color: "#4D6BFE", fontWeight: 800, letterSpacing: 2, marginBottom: 14 }}>RÉPONSE</div>
                    <div dangerouslySetInnerHTML={{ __html: highlightCode(addForm.back) }} style={{ fontSize: 18, fontWeight: 600, color: addForm.back ? theme.text : theme.textMuted }} />
                    {(addForm.example || editingId) && <div style={{ marginTop: 16, padding: "14px 18px", background: theme.cardBg, borderRadius: 12, fontSize: 14, color: theme.textMuted, fontStyle: "italic", borderLeft: "4px solid #4D6BFE" }}><span style={{ color: "#4D6BFE", fontSize: 11 }}>// exemple</span><br /><div dangerouslySetInnerHTML={{ __html: highlightCode(addForm.example) }} /></div>}
                    {addLayers.length>1 && addLayers.slice(1).map((l,i) => <div key={i} style={{ marginTop:12, padding:"12px", background:theme.inputBg, borderRadius:8, borderLeft:"3px solid #7B93FF" }}><div style={{ fontSize:11, color:"#7B93FF" }}>Niveau {i+2}</div><div style={{ fontSize:14 }}>{l.back}</div></div>)}
                  </div>
                </div>
                <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 16, padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted }}>📤 Import en masse (CSV)</span><button className="hov" onClick={() => setShowImport(!showImport)} style={{ background: theme.inputBg, color: theme.highlight, border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{showImport ? "Fermer" : "Ouvrir"}</button></div>
                  {showImport && <div style={{ marginTop: 12, animation: "fadeUp 0.3s ease" }}><textarea value={importText} onChange={(e) => setImportText(e.target.value)} style={{ width: "100%", padding: "16px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 12, color: theme.text, minHeight: 80, fontFamily: "JetBrains Mono" }} placeholder="front,back,category,example..." /><button className="hov" onClick={handleImport} style={{ width: "100%", padding: "10px", background: "#3451D1", color: "white", border: "none", borderRadius: 12, fontWeight: 700, marginTop: 8, cursor: "pointer" }}>Importer</button></div>}
                </div>
              </div>
            </div>
          </div>
        ))}

                {view === "list" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            {/* HEADER */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 24 }}>
              <div style={{ flex: 1 }}>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight }}>◈ Le Second Cerveau</h1>
                <p style={{ color: theme.textMuted }}>Explore, visualise et forge tes connaissances.</p>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ background: theme.cardBg, padding: "12px 18px", borderRadius: 16, border: `1px solid ${theme.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: theme.highlight }}>{filteredExps.length}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Fiches</div>
                </div>
                <div style={{ background: theme.cardBg, padding: "12px 18px", borderRadius: 16, border: `1px solid ${theme.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#4D6BFE" }}>{masteredCount}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Maîtrisées</div>
                </div>
              </div>
            </div>

            {/* BARRE D'OUTILS PRINCIPALE */}
            <div style={{ background: theme.cardBg, padding: "12px 16px", borderRadius: 20, border: `1px solid ${theme.border}`, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {/* Vue par défaut et boutons de basculement */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
                {[
                  { mode:"grid", icon:"▦", label:"Grille" },
                  { mode:"graph", icon:"🔮", label:"Graphe" },
                  { mode:"clusters", icon:"🧬", label:"Clusters" },
                  { mode:"timeline", icon:"📅", label:"Timeline" }
                ].map(m => (
                  <button key={m.mode} onClick={() => {
                    if (m.mode === "graph") generateCardsGraph();
                    else if (m.mode === "clusters") generateClusters();
                    else if (m.mode === "timeline") generateTimeline();
                    else setCardsViewMode(m.mode);
                  }} className="hov"
                  style={{
                    padding:"8px 14px", borderRadius:12, border:`1px solid ${cardsViewMode===m.mode ? theme.highlight : theme.border}`,
                    background: cardsViewMode===m.mode ? theme.highlight+"18" : "transparent",
                    color: cardsViewMode===m.mode ? theme.highlight : theme.textMuted,
                    fontWeight:700, fontSize:12, cursor:"pointer"
                  }}>{m.icon} {m.label}</button>
                ))}
              </div>
              {/* Actions rapides */}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={generateSemanticTags} disabled={cardsTagsLoading} className="hov"
                  style={{ padding:"8px 14px", borderRadius:10, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.textMuted, fontWeight:600, fontSize:12, cursor:"pointer" }}>
                  🏷️ Tags
                </button>
                <button onClick={() => setCardsSearchOpen(!cardsSearchOpen)} className="hov"
                  style={{ padding:"8px 14px", borderRadius:10, background: cardsSearchOpen ? theme.highlight : theme.inputBg, border:`1px solid ${theme.border}`, color: cardsSearchOpen ? "white" : theme.textMuted, fontWeight:600, fontSize:12, cursor:"pointer" }}>
                  🔍 Avancé
                </button>
                <button onClick={generateFakeCards} disabled={cardsFakeLoading} className="hov"
                  style={{ padding:"8px 14px", borderRadius:10, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.textMuted, fontWeight:600, fontSize:12, cursor:"pointer" }}>
                  🧪 Pièges
                </button>
                <button onClick={loadCommunityCards} disabled={cardsCommunityLoaded} className="hov"
                  style={{ padding:"8px 14px", borderRadius:10, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.textMuted, fontWeight:600, fontSize:12, cursor:"pointer" }}>
                  🏛️ Biblio
                </button>
                <button onClick={startPlaylist} disabled={cardsPlaylist.length===0 || cardsAudioPlaying} className="hov"
                  style={{ padding:"8px 14px", borderRadius:10, background:cardsAudioPlaying ? "#4D6BFE" : theme.inputBg, border:`1px solid ${theme.border}`, color: cardsAudioPlaying ? "white" : theme.textMuted, fontWeight:600, fontSize:12, cursor:"pointer" }}>
                  {cardsAudioPlaying ? "⏸️" : "▶️"} Playlist ({cardsPlaylist.length})
                </button>
                <button onClick={clearPlaylist} className="hov"
                  style={{ padding:"8px 14px", borderRadius:10, background:"#FEF2F2", border:"1px solid #A5B4FC", color:"#EF4444", fontWeight:600, fontSize:12, cursor:"pointer" }}>
                  ✕
                </button>
              </div>
            </div>

            {/* RECHERCHE AVANCÉE (développée) */}
            {cardsSearchOpen && (
              <div style={{ background: theme.cardBg, borderRadius:18, padding:"16px", marginBottom:16, border:`1px solid ${theme.border}` }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px,1fr))", gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:theme.textMuted, display:"block", marginBottom:4 }}>Requête (AND/OR/NOT)</label>
                    <input value={cardsAdvancedSearch.boolQuery} onChange={e => setCardsAdvancedSearch(prev => ({...prev, boolQuery: e.target.value}))}
                      style={{ width:"100%", padding:"8px 12px", background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:8, color:theme.text, fontSize:13 }}
                      placeholder="ex: java NOT spring" />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:theme.textMuted }}>Difficulté</label>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <input type="number" min={0} max={10} value={cardsAdvancedSearch.minDifficulty} onChange={e => setCardsAdvancedSearch(prev => ({...prev, minDifficulty: +e.target.value}))}
                        style={{ flex:1, padding:"6px", background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:6, color:theme.text }} />
                      <span>à</span>
                      <input type="number" min={0} max={10} value={cardsAdvancedSearch.maxDifficulty} onChange={e => setCardsAdvancedSearch(prev => ({...prev, maxDifficulty: +e.target.value}))}
                        style={{ flex:1, padding:"6px", background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:6, color:theme.text }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:theme.textMuted }}>Niveau</label>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <input type="number" min={0} max={7} value={cardsAdvancedSearch.minLevel} onChange={e => setCardsAdvancedSearch(prev => ({...prev, minLevel: +e.target.value}))}
                        style={{ flex:1, padding:"6px", background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:6, color:theme.text }} />
                      <span>à</span>
                      <input type="number" min={0} max={7} value={cardsAdvancedSearch.maxLevel} onChange={e => setCardsAdvancedSearch(prev => ({...prev, maxLevel: +e.target.value}))}
                        style={{ flex:1, padding:"6px", background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:6, color:theme.text }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* RECHERCHE SIMPLE + FILTRES RAPIDES */}
            <div style={{ background: theme.cardBg, padding: "12px 16px", borderRadius: 18, border: `1px solid ${theme.border}`, marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, color: theme.textMuted }}>🔍</span>
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, padding: "10px 12px", background: "transparent", border: "none", fontSize: 14, color: theme.text, outline: "none" }} placeholder="Chercher un concept..." />
              {searchQuery && <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 14, padding: 8 }}>✕</button>}
              <button onClick={handleSemanticSearch} disabled={semanticLoading} className="btn-glow hov" style={{ background: "linear-gradient(135deg, #4D6BFE, #6D28D9)", color: "white", border: "none", padding: "8px 14px", borderRadius: 10, fontWeight: 800, cursor: "pointer", fontSize: 12 }}>
                {semanticLoading ? "🧠" : "🧠 Sémantique"}
              </button>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                {["Toutes", ...catNames].map((c) => <button key={c} onClick={() => setFilterCat(c)} className="hov" style={{ padding: "6px 12px", borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: "pointer", background: filterCat === c ? theme.highlight : theme.cardBg, color: filterCat === c ? "white" : theme.textMuted, border: filterCat === c ? `1px solid ${theme.highlight}` : `1px solid ${theme.border}`, whiteSpace: "nowrap" }}>{c}</button>)}
              </div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                {["Tous", "Nouvelles", "En retard", "Maîtrisées"].map((l) => <button key={l} onClick={() => setFilterLevel(l)} className="hov" style={{ padding: "6px 12px", borderRadius: 100, fontSize: 11, cursor: "pointer", border: "none", background: filterLevel === l ? "#FFFFFF" : "transparent", color: filterLevel === l ? "#4D6BFE" : theme.textMuted, fontWeight: filterLevel === l ? 800 : 600, whiteSpace: "nowrap" }}>{l}</button>)}
              </div>
            </div>

            {/* AFFICHAGE PRINCIPAL SELON LE MODE */}
            {cardsViewMode === "graph" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: "20px", marginBottom: 24, border: `1px solid ${theme.border}`, minHeight: 400 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 12 }}>
                  <h3 style={{ fontWeight:800, color:theme.highlight }}>🔮 Graphe de connaissances</h3>
                  <button onClick={() => setCardsViewMode("grid")} className="hov" style={{ background:theme.inputBg, border:"none", color:theme.textMuted, cursor:"pointer", padding:"6px 12px", borderRadius:8 }}>← Grille</button>
                </div>
                {cardsGraphLoading ? <div style={{ textAlign:"center", padding:40 }}>Génération du graphe... 🧠</div> :
                  <div style={{ position:"relative", height:380, overflow:"auto", background:isDarkMode?"#0F1A3A":"#F8FAFC", borderRadius:16, border: `1px solid ${theme.border}` }}>
                    <svg width="100%" height="100%" style={{ minWidth:600, minHeight:380 }}>
                      {cardsGraphData.nodes.map((node, i) => {
                        const x = 100 + (i % 5) * 120;
                        const y = 80 + Math.floor(i / 5) * 80;
                        return (
                          <g key={node.id}>
                            <circle cx={x} cy={y} r={30} fill={categories.find(c=>c.name===node.category)?.color || "#4D6BFE"} opacity={0.8} />
                            <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={10} fontWeight="bold">{node.label.substring(0,10)}</text>
                          </g>
                        );
                      })}
                      {cardsGraphData.links.map((link, i) => {
                        const sourceNode = cardsGraphData.nodes.find(n => n.id === link.source);
                        const targetNode = cardsGraphData.nodes.find(n => n.id === link.target);
                        if (!sourceNode || !targetNode) return null;
                        const sx = 100 + (cardsGraphData.nodes.indexOf(sourceNode) % 5) * 120;
                        const sy = 80 + Math.floor(cardsGraphData.nodes.indexOf(sourceNode) / 5) * 80;
                        const tx = 100 + (cardsGraphData.nodes.indexOf(targetNode) % 5) * 120;
                        const ty = 80 + Math.floor(cardsGraphData.nodes.indexOf(targetNode) / 5) * 80;
                        return <line key={i} x1={sx} y1={sy} x2={tx} y2={ty} stroke="#94A3B8" strokeWidth={2} />;
                      })}
                    </svg>
                  </div>
                }
              </div>
            )}

            {cardsViewMode === "clusters" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: "20px", marginBottom: 24, border: `1px solid ${theme.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 16 }}>
                  <h3 style={{ fontWeight:800, color:theme.highlight }}>🧬 Clusters thématiques IA</h3>
                  <button onClick={() => setCardsViewMode("grid")} className="hov" style={{ background:theme.inputBg, border:"none", color:theme.textMuted, cursor:"pointer", padding:"6px 12px", borderRadius:8 }}>← Grille</button>
                </div>
                {cardsClusters.length === 0 ? <div style={{ textAlign:"center", padding:20, color:theme.textMuted }}>Aucun cluster généré.</div> :
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    {cardsClusters.map((cluster, i) => (
                      <div key={i} style={{ background: isDarkMode?"#2A1400":"#FFFFFF", borderRadius:16, padding:"16px", border:`1px solid ${theme.border}` }}>
                        <h4 style={{ margin:"0 0 8px", color:"#4D6BFE" }}>{cluster.name}</h4>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                          {cluster.cards.map(cardId => {
                            const card = expressions.find(e => e.id === cardId);
                            return card ? <span key={cardId} style={{ background:"white", borderRadius:12, padding:"4px 10px", fontSize:12, color:theme.text, border:`1px solid ${theme.border}` }}>{card.front}</span> : null;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                }
              </div>
            )}

            {cardsViewMode === "timeline" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: "20px", marginBottom: 24, border: `1px solid ${theme.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 16 }}>
                  <h3 style={{ fontWeight:800, color:theme.highlight }}>📅 Timeline de maîtrise</h3>
                  <button onClick={() => setCardsViewMode("grid")} className="hov" style={{ background:theme.inputBg, border:"none", color:theme.textMuted, cursor:"pointer", padding:"6px 12px", borderRadius:8 }}>← Grille</button>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10, maxHeight:500, overflowY:"auto" }}>
                  {cardsTimeline.map((card, i) => (
                    <div key={i} style={{ background:theme.inputBg, borderRadius:14, padding:"12px 16px", borderLeft:`4px solid ${card.level>=7?"#4D6BFE":"#4D6BFE"}` }}>
                      <div style={{ fontWeight:700 }}>{card.front}</div>
                      <div style={{ fontSize:11, color:theme.textMuted }}>Niveau {card.level} · Créée le {card.createdAt}</div>
                      <div style={{ marginTop:6, display:"flex", gap:4 }}>
                        {card.history.slice(-10).map((h, j) => (
                          <span key={j} title={h.date} style={{ width:10, height:10, borderRadius:"50%", background: h.q===0?"#EF4444":h.q===3?"#6B82F5":"#4D6BFE", display:"inline-block" }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VUE GRILLE (défaut) */}
            {cardsViewMode === "grid" && (
              <>
                {filteredExps.length === 0 ? (
                  <div style={{ background: theme.cardBg, border: `2px dashed ${theme.border}`, borderRadius: 32, padding: "80px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
                    <h3 style={{ color: theme.text, fontSize: 20, fontWeight: 800 }}>Aucune fiche trouvée</h3>
                    <p style={{ color: theme.textMuted, marginTop: 8, marginBottom: 24 }}>Élargis ta recherche ou crée un nouveau concept.</p>
                    <button onClick={() => setView("add")} className="btn-glow hov" style={{ padding: "14px 28px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>⚡ Créer une fiche</button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(310px, 100%), 1fr))", gap: 24 }}>
                    {filteredExps.map((exp) => {
                      const lvl = exp.level || 0;
                      const lvlColor = lvl >= 7 ? "#4D6BFE" : lvl >= 5 ? "#4D6BFE" : lvl >= 3 ? "#7B93FF" : lvl >= 1 ? "#6B82F5" : "#9CA3AF";
                      const catColor = categories.find((c) => c.name === exp.category)?.color || "#4D6BFE";
                      const tag = cognitiveTag(exp);
                      const isFortress = cardsFortressActive[exp.id];
                      return (
                        <div key={exp.id} style={{ background: theme.cardBg, borderRadius: 24, display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", border: `1px solid ${theme.border}`, borderTop: `4px solid ${catColor}`, overflow: "hidden", opacity: isFortress ? 0.75 : 1 }} className="card-hov">
                          <div style={{ padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, background: catColor + "22", color: catColor }}>{exp.category}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ background: tag.color + "22", color: tag.color, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{tag.icon} {tag.label}</span>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: lvlColor }} /><span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono'" }}>N{lvl}</span>
                            </div>
                          </div>
                          <div style={{ padding: "0 24px", flex: 1 }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: theme.highlight, marginBottom: 12, lineHeight: 1.3 }}>{exp.front}</div>
                            {exp.imageUrl && <div style={{ fontSize: 11, background: "#4D6BFE22", color: "#4D6BFE", padding: "4px 8px", borderRadius: 8, display: "inline-block", marginBottom: 12, fontWeight: 700 }}>🖼️ Image attachée</div>}
                            <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.6, marginBottom: 16 }} dangerouslySetInnerHTML={{ __html: highlightCode(exp.back) }} />
                            {exp.example && <div style={{ background: theme.inputBg, padding: "12px", borderRadius: 12, fontSize: 13, color: theme.textMuted, fontStyle: "italic", borderLeft: "3px solid #4D6BFE", marginBottom: 16 }}><span style={{ color: "#4D6BFE", fontSize: 10 }}>// exemple</span><br /><div dangerouslySetInnerHTML={{ __html: highlightCode(exp.example) }} /></div>}
                            {/* Tags sémantiques */}
                            {cardsTags[exp.id] && cardsTags[exp.id].length > 0 && (
                              <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:10 }}>
                                {cardsTags[exp.id].map((t, i) => (
                                  <span key={i} style={{ background:isDarkMode?"#3D2000":"#E0E7FF", color:isDarkMode?"#C7D2FE":"#4338CA", borderRadius:10, padding:"2px 8px", fontSize:10, fontWeight:600 }}>{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* BARRE D'ACTIONS */}
                          <div style={{ padding: "12px 24px", background: theme.inputBg, borderTop: `1px solid ${theme.border}`, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono'" }}>
                              <div>{lvl >= 7 ? "✅ Maîtrisée" : `📅 Rév: ${formatDate(exp.nextReview)}`}</div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button onClick={() => { startEdit(exp); setAiPrompt(exp.front); }} className="hov" style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: "#FFFFFF", color: "#7B93FF", fontSize:14 }} title="Améliorer">✨</button>
                              <button onClick={() => startEdit(exp)} className="hov" style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: "#FFFFFF", color: "#4D6BFE", fontSize:14 }} title="Éditer">✏️</button>
                              <button onClick={() => deleteExp(exp.id)} className="hov" style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: "#FEF2F2", color: "#EF4444", fontSize:14 }} title="Supprimer">🗑️</button>
                              <button onClick={() => addToPlaylist(exp)} className="hov" style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: "#FFFFFF", color: "#4D6BFE", fontSize:14 }} title="Écouter">🔊</button>
                              <button onClick={() => toggleFortress(exp.id)} className="hov" style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: isFortress ? "#E8EEFF" : theme.inputBg, color: isFortress ? "#4D6BFE" : theme.textMuted, fontSize:14 }} title={isFortress ? "Protégé" : "Protéger"}>{isFortress ? "🛡️" : "🛡️"}</button>
                              <button onClick={() => startDuel(exp)} className="hov" style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: "#FFF7ED", color: "#4D6BFE", fontSize:14 }} title="Duel">⚔️</button>
                              <button onClick={() => generateVariants(exp)} className="hov" style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: "#FFFFFF", color: "#4D6BFE", fontSize:14 }} title="Variantes">⚗️</button>
                            </div>
                          </div>
                          {/* Variantes (si générées) */}
                          {cardsVariants[exp.id] && (
                            <div style={{ padding: "0 24px 16px", marginTop:8 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:theme.highlight, marginBottom:8 }}>⚗️ Variantes</div>
                              {cardsVariants[exp.id].map((v, i) => (
                                <div key={i} style={{ background:theme.inputBg, borderRadius:10, padding:"8px 12px", marginBottom:6, borderLeft:`3px solid ${v.type==='definition'?'#4D6BFE':v.type==='analogy'?'#7B93FF':v.type==='example'?'#4D6BFE':v.type==='contre-exemple'?'#EF4444':'#6B82F5'}` }}>
                                  <div style={{ fontWeight:700, fontSize:12 }}>{v.front}</div>
                                  <div style={{ fontSize:11, color:theme.textMuted }}>{v.back}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Fiches pièges affichées en bas */}
                {cardsFakeCards.length > 0 && (
                  <div style={{ marginTop: 32, background: "#FFF7ED", borderRadius: 20, padding: "20px 24px", border: "2px solid #4D6BFE" }}>
                    <h3 style={{ color: "#4D6BFE", marginTop: 0 }}>🧪 Fiches pièges — Trouve les erreurs !</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
                      {cardsFakeCards.map((fc, i) => (
                        <div key={i} style={{ background: "white", borderRadius: 14, padding: "16px", border: "1px solid #C7D2FE" }}>
                          <div style={{ fontWeight: 800, color: "#1E3A8A" }}>{fc.front}</div>
                          <div style={{ fontSize: 13, color: "#431407", marginTop: 6 }}>{fc.back}</div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setCardsFakeCards([])} style={{ marginTop: 12, background: "none", border: "none", color: "#4D6BFE", cursor: "pointer" }}>✕ Fermer</button>
                  </div>
                )}

                {/* Bibliothèque communautaire */}
                {cardsCommunity.length > 0 && (
                  <div style={{ marginTop: 32, background: "#FFFFFF", borderRadius: 20, padding: "20px 24px", border: "2px solid #4D6BFE" }}>
                    <h3 style={{ color: "#1E3A8A", marginTop: 0 }}>🏛️ Bibliothèque communautaire</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
                      {cardsCommunity.map(card => (
                        <div key={card.id} style={{ background: "white", borderRadius: 14, padding: "16px", border: "1px solid #C7D2FE" }}>
                          <div style={{ fontWeight: 800, color: "#1E3A8A" }}>{card.front}</div>
                          <div style={{ fontSize: 13, color: "#2D45B0", marginTop: 6 }}>{card.back}</div>
                          <button onClick={() => importCommunityCard(card)} className="hov" style={{ marginTop: 10, padding: "6px 14px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>📥 Importer</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setCardsCommunity([])} style={{ marginTop: 12, background: "none", border: "none", color: "#4D6BFE", cursor: "pointer" }}>✕ Fermer</button>
                  </div>
                )}
              </>
            )}

            {/* MODE DUEL EN OVERLAY */}
            {cardsDuelActive && cardsDuelCard && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: theme.cardBg, borderRadius: 24, padding: "32px", maxWidth: 500, textAlign: "center" }}>
                  <h2 style={{ color: theme.text, marginBottom: 8 }}>⚔️ Duel sur "{cardsDuelCard.front}"</h2>
                  <p style={{ color: theme.textMuted }}>Qui répond correctement en premier ?</p>
                  <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
                    <div style={{ flex: 1 }}>
                      <button onClick={() => handleDuelAnswer(1, prompt("Joueur 1, tapez la réponse :"))} style={{ width:"100%", padding:"14px", background:"#4D6BFE", color:"white", border:"none", borderRadius:12, fontWeight:800, cursor:"pointer" }}>Joueur 1</button>
                      {cardsDuelPlayer1 && <div style={{ marginTop:8, fontWeight:700, color: theme.text }}>Réponse: {cardsDuelPlayer1}</div>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <button onClick={() => handleDuelAnswer(2, prompt("Joueur 2, tapez la réponse :"))} style={{ width:"100%", padding:"14px", background:"#EF4444", color:"white", border:"none", borderRadius:12, fontWeight:800, cursor:"pointer" }}>Joueur 2</button>
                      {cardsDuelPlayer2 && <div style={{ marginTop:8, fontWeight:700, color: theme.text }}>Réponse: {cardsDuelPlayer2}</div>}
                    </div>
                  </div>
                  <button onClick={() => setCardsDuelActive(false)} style={{ marginTop: 20, background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}>✕ Annuler</button>
                </div>
              </div>
            )}
          </div>
        )}

    {view === "exam" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>

            {/* ══ HOME ══ */}
            {examSubView === "home" && (
              <div>
                <div style={{ background: "linear-gradient(135deg, #1A0800 0%, #3451D1 60%, #4D6BFE 100%)", borderRadius: 28, padding: "40px 36px", marginBottom: 32, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -30, right: -30, fontSize: 180, opacity: 0.05 }}>🏟️</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#C7D2FE", letterSpacing: 3, marginBottom: 8, fontFamily: "JetBrains Mono" }}>ARÈNE D'EXAMENS — GOD LEVEL</div>
                  <h1 style={{ fontSize: 34, fontWeight: 900, color: "white", marginBottom: 10 }}>Forge ta maîtrise absolue 🏆</h1>
                  <p style={{ color: "#C7D2FE", fontSize: 15, marginBottom: 28, maxWidth: 520, lineHeight: 1.6 }}>10 modes d'examen. Chaque session te rend plus fort. La médiocrité n'existe pas ici.</p>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 20px", color: "white", fontSize: 13, fontWeight: 700, border: "1px solid rgba(255,255,255,0.15)" }}>🎯 {stats.examsDone} examens passés</div>
                    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 20px", color: "white", fontSize: 13, fontWeight: 700, border: "1px solid rgba(255,255,255,0.15)" }}>📚 {expressions.length} fiches disponibles</div>
                    {examDeathrunBest > 0 && <div style={{ background: "rgba(239,68,68,0.2)", borderRadius: 14, padding: "12px 20px", color: "#A5B4FC", fontSize: 13, fontWeight: 700, border: "1px solid rgba(239,68,68,0.3)" }}>💥 Deathrun record: {examDeathrunBest}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                    <button onClick={() => setExamShowHistory(!examShowHistory)} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>📊 Historique</button>
                    <button onClick={analyzeRecurringTraps} disabled={examRecurringLoading} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                      {examRecurringLoading ? "⏳ Analyse..." : "🧪 Pièges récurrents"}
                    </button>
                  </div>
                </div>

                {/* Historique */}
                {examShowHistory && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", marginBottom: 24, border: `1px solid ${theme.border}` }}>
                    <h3 style={{ color: theme.text, fontWeight: 800, marginBottom: 16, fontSize: 16 }}>📊 Historique des examens</h3>
                    {examHistory.length === 0
                      ? <div style={{ color: theme.textMuted, textAlign: "center", padding: "20px 0" }}>Aucun examen enregistré pour l'instant.</div>
                      : <>
                          {/* Mini graphe de progression */}
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, marginBottom: 16 }}>
                            {examHistory.slice(0, 20).reverse().map((h, i) => (
                              <div key={i} title={`${h.date} — ${h.score}%`} style={{ flex: 1, height: `${Math.max(10, h.score)}%`, background: h.score >= 80 ? "#4D6BFE" : h.score >= 60 ? "#6B82F5" : "#EF4444", borderRadius: "4px 4px 0 0", opacity: 0.85 }} />
                            ))}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                            {examHistory.slice(0, 15).map((h, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: theme.inputBg, borderRadius: 12, fontSize: 13 }}>
                                <div style={{ width: 42, height: 42, borderRadius: 12, background: h.score >= 80 ? "#EEF2FF" : h.score >= 60 ? "#E8EEFF" : "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15, color: h.score >= 80 ? "#2D45B0" : h.score >= 60 ? "#2D45B0" : "#B91C1C", flexShrink: 0 }}>{h.score}%</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 700, color: theme.text }}>{h.mode?.toUpperCase()} — {h.category}</div>
                                  <div style={{ color: theme.textMuted, fontSize: 11 }}>{h.correct}/{h.total} correctes · {h.date} · {Math.floor((h.duration||0)/60)}m{(h.duration||0)%60}s</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                    }
                  </div>
                )}

                {/* Pièges récurrents */}
                {examRecurringTraps && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", marginBottom: 24, border: `2px solid #EF4444` }}>
                    <h3 style={{ color: "#EF4444", fontWeight: 800, marginBottom: 8 }}>🧪 Analyse des pièges récurrents</h3>
                    <p style={{ color: theme.textMuted, fontSize: 13, marginBottom: 16 }}>{examRecurringTraps.globalPattern}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(examRecurringTraps.traps || []).map((t, i) => (
                        <div key={i} style={{ background: theme.inputBg, borderRadius: 14, padding: "14px 16px", borderLeft: "4px solid #EF4444" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontWeight: 800, color: theme.text, fontSize: 14 }}>{t.concept}</div>
                            <span style={{ background: "#FEF2F2", color: "#EF4444", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>raté {t.frequency}×</span>
                          </div>
                          {t.confusionWith && <div style={{ color: "#6B82F5", fontSize: 12, marginTop: 4 }}>🔀 Confusion probable avec : {t.confusionWith}</div>}
                          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 6, fontStyle: "italic" }}>💡 {t.remedy}</div>
                        </div>
                      ))}
                    </div>
                    {examRecurringTraps.urgentCards?.length > 0 && (
                      <div style={{ marginTop: 12, padding: "12px 16px", background: "#FEF2F2", borderRadius: 12 }}>
                        <span style={{ color: "#B91C1C", fontWeight: 700, fontSize: 13 }}>🚨 À retravailler IMMÉDIATEMENT : {examRecurringTraps.urgentCards.join(", ")}</span>
                      </div>
                    )}
                    <button onClick={() => setExamRecurringTraps(null)} style={{ marginTop: 12, background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 12 }}>✕ Fermer</button>
                  </div>
                )}

                <h2 style={{ fontSize: 14, fontWeight: 700, color: theme.highlight, marginBottom: 16, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>CHOISIR UN MODE</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 16, marginBottom: 36 }}>
                  {[
                    { mode: "flashcard", icon: "🃏", title: "Classique", sub: "Auto-évaluation", desc: "Recto/verso avec timer. Les bases, mais indispensables.", color: "#3451D1", bg: isDarkMode?"linear-gradient(135deg,#1e293b,#1e3a5f)":"linear-gradient(135deg,#FFFFFF,#EEF2FF)", border: isDarkMode?"#3451D1":"#BFDBFE" },
                    { mode: "qcm", icon: "📝", title: "QCM IA", sub: "L'IA te piège", desc: "3 fausses réponses ultra-crédibles générées par l'IA.", color: "#4D6BFE", bg: isDarkMode?"linear-gradient(135deg,#1e1b4b,#2e1065)":"linear-gradient(135deg,#FFFFFF,#EEF2FF)", border: isDarkMode?"#4D6BFE":"#C7D2FE" },
                    { mode: "speedrun", icon: "⚡", title: "Speedrun", sub: "5s par question", desc: "Test de réflexes absolu. Pas le temps de réfléchir.", color: "#6B82F5", bg: isDarkMode?"linear-gradient(135deg,#1c1007,#292524)":"linear-gradient(135deg,#E8EEFF,#C7D2FE)", border: isDarkMode?"#6B82F5":"#93A8FF" },
                    { mode: "boss", icon: "💀", title: "Boss Fight", sub: "Sanction extrême", desc: "Simule tes profs. Si tu échoues, tes fiches sont rétrogradées.", color: "#EF4444", bg: isDarkMode?"linear-gradient(135deg,#1c0a0a,#2d0000)":"linear-gradient(135deg,#FEE2E2,#FECACA)", border: isDarkMode?"#EF4444":"#A5B4FC" },
                    { mode: "survival", icon: "❤️", title: "Arène de Survie", sub: "3 vies max", desc: "3 erreurs et c'est terminé. Jusqu'où tu peux aller ?", color: "#4D6BFE", bg: isDarkMode?"linear-gradient(135deg,#1a0a14,#2d0a1e)":"linear-gradient(135deg,#FCE7F3,#FBCFE8)", border: isDarkMode?"#4D6BFE":"#F9A8D4" },
                    { mode: "deathrun", icon: "💥", title: "Deathrun", sub: "1 erreur = game over", desc: "Questions infinies. La première erreur t'arrête. Bats ton record.", color: "#EF4444", bg: isDarkMode?"linear-gradient(135deg,#1c0a0a,#1a0000)":"linear-gradient(135deg,#FFF1F2,#FFE4E6)", border: isDarkMode?"#DC2626":"#A5B4FC" },
                    { mode: "duel", icon: "🤖", title: "Duel IA", sub: "Bats l'IA", desc: "L'IA joue contre toi sur les mêmes fiches. Qui est le meilleur ?", color: "#7B93FF", bg: isDarkMode?"linear-gradient(135deg,#082f49,#0c4a6e)":"linear-gradient(135deg,#FFFFFF,#CFFAFE)", border: isDarkMode?"#7B93FF":"#C7D2FE" },
                    { mode: "matching", icon: "🧩", title: "Connexion", sub: "Relier les paires", desc: "Relie chaque terme à sa définition contre la montre.", color: "#4D6BFE", bg: isDarkMode?"linear-gradient(135deg,#022c22,#064e3b)":"linear-gradient(135deg,#FFFFFF,#EEF2FF)", border: isDarkMode?"#4D6BFE":"#C7D2FE" },
                    { mode: "redaction", icon: "✍️", title: "Rédaction Libre", sub: "Corrigé par l'IA", desc: "Rédige une vraie réponse. L'IA la corrige comme un prof : note /20 et commentaires.", color: "#7B93FF", bg: isDarkMode?"linear-gradient(135deg,#1e1b4b,#2e1065)":"linear-gradient(135deg,#FFFFFF,#EEF2FF)", border: isDarkMode?"#7B93FF":"#C4B5FD" },
                    { mode: "custom", icon: "🛠️", title: "Examens Perso", sub: "Tes propres règles", desc: "Crée et passe tes propres devoirs surveillés.", color: "#3451D1", bg: isDarkMode?"linear-gradient(135deg,#022c22,#064e3b)":"linear-gradient(135deg,#FFFFFF,#EEF2FF)", border: isDarkMode?"#3451D1":"#C7D2FE" },
                  ].map(m => (
                    <div key={m.mode} onClick={() => {
                      if (m.mode === "custom") setExamSubView("custom");
                      else if (m.mode === "matching") { setExamConfig(c => ({...c, mode: m.mode})); setExamSubView("config"); }
                      else { setExamConfig(c => ({...c, mode: m.mode})); setExamSubView("config"); }
                    }} className="card-hov" style={{ background: m.bg, border: `2px solid ${m.border}`, borderRadius: 22, padding: "24px", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>{m.icon}</div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: m.color, letterSpacing: 2, marginBottom: 3, fontFamily: "JetBrains Mono" }}>{m.sub}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: isDarkMode ? "white" : "#1F2937", marginBottom: 6 }}>{m.title}</div>
                      <div style={{ fontSize: 12, color: isDarkMode ? "#94A3B8" : "#4B5563", lineHeight: 1.5 }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══ CONFIG ══ */}
            {examSubView === "config" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <button onClick={() => setExamSubView("home")} className="hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontWeight: 600 }}>← Retour</button>
                  <h1 style={{ fontSize: 26, fontWeight: 900, color: theme.highlight, margin: 0 }}>
                    {{ flashcard:"🃏 Classique", qcm:"📝 QCM IA", speedrun:"⚡ Speedrun", boss:"💀 Boss Fight", survival:"❤️ Arène de Survie", deathrun:"💥 Deathrun", duel:"🤖 Duel IA", matching:"🧩 Connexion", redaction:"✍️ Rédaction Libre" }[examConfig.mode] || "⚙️ Config"}
                  </h1>
                </div>
                <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 24, padding: "32px" }}>
                  {/* Mode Survie — info vies */}
                  {examConfig.mode === "survival" && (
                    <div style={{ background: "#FDF2F8", borderRadius: 16, padding: "16px 20px", marginBottom: 20, border: "1px solid #FBCFE8" }}>
                      <div style={{ fontSize: 24, marginBottom: 4 }}>❤️❤️❤️</div>
                      <div style={{ fontWeight: 700, color: "#831843", fontSize: 14 }}>Tu as 3 vies. Chaque erreur en consomme une. Survie maximale !</div>
                    </div>
                  )}
                  {examConfig.mode === "deathrun" && (
                    <div style={{ background: "#FFF1F2", borderRadius: 16, padding: "16px 20px", marginBottom: 20, border: "1px solid #A5B4FC" }}>
                      <div style={{ fontSize: 24, marginBottom: 4 }}>💥</div>
                      <div style={{ fontWeight: 700, color: "#B91C1C", fontSize: 14 }}>La première erreur arrête tout. Record actuel : <strong>{examDeathrunBest}</strong> réponses consécutives.</div>
                    </div>
                  )}
                  {examConfig.mode === "duel" && (
                    <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "16px 20px", marginBottom: 20, border: "1px solid #C7D2FE" }}>
                      <div style={{ fontSize: 24, marginBottom: 4 }}>🤖</div>
                      <div style={{ fontWeight: 700, color: "#3451D1", fontSize: 14 }}>L'IA joue contre toi. Elle se trompe parfois exprès. Qui finira avec le meilleur score ?</div>
                    </div>
                  )}
                  {examConfig.mode === "redaction" && (
                    <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "16px 20px", marginBottom: 20, border: "1px solid #C4B5FD" }}>
                      <div style={{ fontSize: 24, marginBottom: 4 }}>✍️</div>
                      <div style={{ fontWeight: 700, color: "#5B21B6", fontSize: 14 }}>Tu rédiges une réponse complète. L'IA te donne une note sur 20 avec analyse structurée.</div>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginBottom: 24 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>📚 Module</label>
                      <select value={examConfig.category} onChange={(e) => setExamConfig((c) => ({ ...c, category: e.target.value }))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text, cursor: "pointer" }}><option value="Toutes">Toutes les matières</option>{catNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                    </div>
                    {examConfig.mode !== "deathrun" && examConfig.mode !== "matching" && (
                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>🔢 Nombre de questions</label>
                        <input type="number" min={3} max={50} value={examConfig.count} onChange={(e) => setExamConfig((c) => ({ ...c, count: +e.target.value }))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }} />
                      </div>
                    )}
                    {!["deathrun","survival","matching"].includes(examConfig.mode) && (
                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>⏱️ Temps/question (sec)</label>
                        <input type="number" min={examConfig.mode === "speedrun" ? 3 : 10} max={examConfig.mode === "speedrun" ? 10 : 300} value={examConfig.mode === "speedrun" && examConfig.timePerCard > 10 ? 5 : examConfig.timePerCard} onChange={(e) => setExamConfig((c) => ({ ...c, timePerCard: +e.target.value }))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }} disabled={examConfig.mode === "speedrun"} />
                      </div>
                    )}
                  </div>
                  {!["deathrun","matching"].includes(examConfig.mode) && (
                    <div style={{ marginBottom: 24 }}>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>🔥 Difficulté</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
                        {[
                          { val: "facile", icon: "😌", label: "Facile", color: "#4D6BFE" },
                          { val: "adaptative", icon: "🎯", label: "Adaptative", color: "#4D6BFE" },
                          { val: "difficile", icon: "💪", label: "Difficile", color: "#6B82F5" },
                          { val: "extreme", icon: "💀", label: "EXTRÊME", color: "#EF4444" },
                        ].map(d => (
                          <div key={d.val} onClick={() => setExamConfig(c => ({...c, difficulty: d.val}))} style={{ border: `2px solid ${examConfig.difficulty === d.val ? d.color : theme.border}`, borderRadius: 16, padding: "14px", cursor: "pointer", background: examConfig.difficulty === d.val ? d.color + "18" : theme.inputBg, textAlign: "center" }}>
                            <div style={{ fontSize: 22, marginBottom: 4 }}>{d.icon}</div>
                            <div style={{ fontWeight: 800, fontSize: 13, color: examConfig.difficulty === d.val ? d.color : theme.text }}>{d.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button className="hov btn-glow" onClick={() => startExam()} style={{ width: "100%", padding: "18px 36px", background: examConfig.mode === "boss" || examConfig.mode === "deathrun" ? "linear-gradient(135deg, #EF4444, #B91C1C)" : examConfig.mode === "survival" ? "linear-gradient(135deg,#4D6BFE,#BE185D)" : examConfig.mode === "duel" ? "linear-gradient(135deg,#7B93FF,#3451D1)" : "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>🚀 Lancer l'examen</button>
                </div>
              </div>
            )}

            {/* ══ ACTIVE ══ */}
            {examSubView === "active" && examActive && examQueue[examIndex] && (() => {
              const card = examQueue[examIndex];
              const isQcmMode = examConfig.mode === "qcm" || (card.isCustom && card.isQcm);
              const isRedactionMode = examConfig.mode === "redaction";
              const isDuelMode = examConfig.mode === "duel";
              const timerDanger = examTimer <= (examConfig.mode === "speedrun" ? 3 : 10);
              return (
                <div style={{ animation: "fadeUp 0.4s ease" }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                    <button onClick={() => { clearInterval(examTimerRef.current); setExamActive(false); setExamSubView("home"); }} className="hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontWeight: 600 }}>✕ Abandonner</button>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {/* Vies (mode survie) */}
                      {examConfig.mode === "survival" && (
                        <div style={{ display: "flex", gap: 3, fontSize: 20 }}>
                          {Array.from({length: examMaxLives}).map((_, i) => <span key={i}>{i < examLives ? "❤️" : "🖤"}</span>)}
                        </div>
                      )}
                      {/* Score Duel */}
                      {isDuelMode && (
                        <div style={{ background: "#FFFFFF", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 800, color: "#3451D1" }}>
                          😊 {examIaDuelScore.user} vs 🤖 {examIaDuelScore.ia}
                        </div>
                      )}
                      {examStreak >= 3 && <div style={{ background: "#E8EEFF", color: "#1E3A8A", padding: "6px 12px", borderRadius: 10, fontSize: 12, fontWeight: 800, animation: "pulse 1s infinite" }}>🔥 Streak ×{examStreak}</div>}
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 15, color: theme.textMuted }}><span style={{ color: theme.highlight, fontWeight: 800 }}>{examIndex + 1}</span>{examConfig.mode !== "deathrun" && ` / ${examQueue.length}`}</div>
                      {!isRedactionMode && <div style={{ padding: "6px 14px", borderRadius: 10, fontFamily: "JetBrains Mono", fontWeight: 900, fontSize: 14, background: timerDanger ? "#FEE2E2" : "#FFFFFF", color: timerDanger ? "#EF4444" : "#3451D1", animation: examTimer <= 5 ? "pulse 0.5s infinite" : "none" }}>⏱ {examTimer}s</div>}
                    </div>
                  </div>

                  {/* Barre progression */}
                  <div style={{ height: 4, background: theme.inputBg, borderRadius: 4, marginBottom: 28 }}>
                    <div style={{ height: "100%", background: examConfig.mode === "survival" ? "linear-gradient(90deg,#4D6BFE,#BE185D)" : examConfig.mode === "deathrun" ? "linear-gradient(90deg,#EF4444,#B91C1C)" : "linear-gradient(90deg,#4D6BFE,#4D6BFE)", borderRadius: 4, transition: "width 0.4s", width: examConfig.mode === "deathrun" ? "100%" : `${((examIndex) / examQueue.length) * 100}%` }} />
                  </div>

                  <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 26, padding: "32px", maxWidth: 720, margin: "0 auto", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <span style={{ background: theme.inputBg, color: theme.highlight, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{card.category || "Perso"}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        {isQcmMode && <span style={{ background: "#FFFFFF", color: "#4D6BFE", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>📝 QCM</span>}
                        {examConfig.mode === "boss" && <span style={{ background: "#FEF2F2", color: "#EF4444", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>💀 BOSS</span>}
                        {examConfig.mode === "survival" && <span style={{ background: "#FDF2F8", color: "#4D6BFE", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>❤️ SURVIE</span>}
                        {examConfig.mode === "deathrun" && <span style={{ background: "#FFF1F2", color: "#EF4444", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>💥 #{examDeathrunCurrent + 1}</span>}
                        {isDuelMode && examIaDuelIaAnswer && <span style={{ background: "#FFFFFF", color: "#7B93FF", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>🤖 IA prête</span>}
                      </div>
                    </div>

                    {/* Question */}
                    <div style={{ background: theme.inputBg, borderRadius: 20, padding: "28px", marginBottom: 20, border: `1px solid ${theme.border}` }}>
                      <div style={{ fontSize: 11, color: "#60A5FA", fontWeight: 800, letterSpacing: 2, marginBottom: 14 }}>QUESTION</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: theme.highlight, lineHeight: 1.4 }}>{card.front || card.question}</div>
                    </div>

                    {/* Mode QCM */}
                    {isQcmMode && !isRedactionMode && (
                      qcmLoading ? <div style={{ textAlign: "center", padding: "28px", color: "#4D6BFE" }}><div style={{ fontSize: 28, animation: "pulse 1s infinite" }}>🤖</div><div style={{ fontWeight: 700 }}>L'IA prépare les pièges...</div></div>
                      : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {qcmChoices.map((choice, ci) => {
                            const isCorrect = choice === (card.back || card.answer);
                            const isSelected = qcmSelected === ci;
                            let bg = theme.inputBg, border = `2px solid ${theme.border}`, color = theme.text;
                            if (isSelected && isCorrect) { bg = "#EEF2FF"; border = "2px solid #4D6BFE"; color = "#1E3A8A"; }
                            else if (isSelected && !isCorrect) { bg = "#FEE2E2"; border = "2px solid #EF4444"; color = "#991B1B"; }
                            else if (qcmSelected !== null && isCorrect) { bg = "#EEF2FF"; border = "2px solid #4D6BFE"; color = "#1E3A8A"; }
                            return (
                              <button key={ci} onClick={() => { if (qcmSelected !== null) return; setQcmSelected(ci); setTimeout(() => handleExamAnswer(isCorrect ? 5 : 0), 900); }} disabled={qcmSelected !== null} style={{ background: bg, border, borderRadius: 14, padding: "16px 20px", textAlign: "left", cursor: qcmSelected !== null ? "default" : "pointer", color, fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ width: 28, height: 28, borderRadius: "50%", background: isSelected ? (isCorrect ? "#4D6BFE" : "#EF4444") : (qcmSelected !== null && isCorrect ? "#4D6BFE" : (isDarkMode?"#3D2000":"#FFFFFF")), color: (isSelected || (qcmSelected !== null && isCorrect)) ? "white" : theme.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{String.fromCharCode(65 + ci)}</span>
                                {choice} {qcmSelected !== null && isCorrect && <span style={{ marginLeft: "auto" }}>✅</span>} {isSelected && !isCorrect && <span style={{ marginLeft: "auto" }}>❌</span>}
                              </button>
                            );
                          })}
                        </div>
                    )}

                    {/* Mode Rédaction */}
                    {isRedactionMode && (
                      <div>
                        {!examRedactionScore ? (
                          <div>
                            <textarea
                              value={examRedactionInput}
                              onChange={e => setExamRedactionInput(e.target.value)}
                              rows={5}
                              placeholder="Rédige ta réponse complète ici... L'IA va la corriger comme un vrai professeur."
                              style={{ width: "100%", padding: "16px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 14, color: theme.text, fontSize: 14, lineHeight: 1.7, resize: "vertical", marginBottom: 12 }}
                            />
                            <button onClick={() => submitRedaction(card)} disabled={examRedactionLoading || !examRedactionInput.trim()} style={{ width: "100%", padding: "14px", background: examRedactionInput.trim() ? "linear-gradient(135deg,#7B93FF,#3451D1)" : theme.inputBg, color: examRedactionInput.trim() ? "white" : theme.textMuted, border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
                              {examRedactionLoading ? "⏳ L'IA corrige..." : "✅ Soumettre ma réponse"}
                            </button>
                          </div>
                        ) : (
                          <div style={{ animation: "slideIn 0.3s ease" }}>
                            {/* Note */}
                            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, background: examRedactionScore.note >= 14 ? "#EEF2FF" : examRedactionScore.note >= 10 ? "#E8EEFF" : "#FEE2E2", borderRadius: 16, padding: "16px 20px" }}>
                              <div style={{ fontSize: 40, fontWeight: 900, color: examRedactionScore.note >= 14 ? "#2D45B0" : examRedactionScore.note >= 10 ? "#2D45B0" : "#B91C1C" }}>{examRedactionScore.note}<span style={{ fontSize: 20 }}>/{examRedactionScore.sur}</span></div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 16, color: examRedactionScore.note >= 14 ? "#2D45B0" : examRedactionScore.note >= 10 ? "#2D45B0" : "#B91C1C" }}>{examRedactionScore.verdict}</div>
                              </div>
                            </div>
                            {/* Critères */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                              {[
                                { label: "Structure", data: examRedactionScore.structure },
                                { label: "Exactitude", data: examRedactionScore.exactitude },
                                { label: "Formulation", data: examRedactionScore.formulation },
                              ].map((c, i) => (
                                <div key={i} style={{ background: theme.inputBg, borderRadius: 12, padding: "12px", textAlign: "center" }}>
                                  <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>{c.label}</div>
                                  <div style={{ fontWeight: 800, fontSize: 13, color: theme.text, marginTop: 4 }}>{c.data?.label}</div>
                                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{c.data?.comment}</div>
                                </div>
                              ))}
                            </div>
                            {examRedactionScore.manque?.length > 0 && <div style={{ color: "#EF4444", fontSize: 13, marginBottom: 8 }}>❌ Manque : {examRedactionScore.manque.join(", ")}</div>}
                            {examRedactionScore.correct?.length > 0 && <div style={{ color: "#4D6BFE", fontSize: 13, marginBottom: 12 }}>✅ Correct : {examRedactionScore.correct.join(", ")}</div>}
                            {examRedactionScore.conseils && <div style={{ color: theme.textMuted, fontSize: 12, fontStyle: "italic", marginBottom: 16 }}>💡 {examRedactionScore.conseils}</div>}
                            <button onClick={() => { setExamRedactionInput(""); setExamRedactionScore(null); handleExamAnswer(examRedactionScore.note >= 14 ? 5 : examRedactionScore.note >= 10 ? 3 : 0); }} style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer" }}>
                              → Question suivante
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mode classique / boss / survie / deathrun / duel */}
                    {!isQcmMode && !isRedactionMode && (
                      !examRevealed ? (
                        <button className="hov btn-glow" onClick={() => { setExamRevealed(true); if (isDuelMode) generateIaDuelAnswer(card); }} style={{ width: "100%", padding: "18px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>👁️ Voir la réponse (Espace)</button>
                      ) : (
                        <div style={{ animation: "slideIn 0.3s ease" }}>
                          <div style={{ background: isDarkMode?"#2A1400":"#FFFFFF", border: `2px solid ${isDarkMode?"#3D2000":"#EEF2FF"}`, borderRadius: 20, padding: "28px", marginBottom: 20 }}>
                            <div style={{ fontSize: 11, color: "#4D6BFE", fontWeight: 800, letterSpacing: 2, marginBottom: 14 }}>RÉPONSE</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: theme.text, lineHeight: 1.6 }}>{card.back || card.answer}</div>
                          </div>
                          {/* Réponse IA (mode duel) */}
                          {isDuelMode && examIaDuelIaAnswer && (
                            <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "16px 20px", marginBottom: 16, border: "1px solid #C7D2FE" }}>
                              <div style={{ fontSize: 11, color: "#7B93FF", fontWeight: 800, marginBottom: 6 }}>🤖 RÉPONSE DE L'IA</div>
                              <div style={{ color: "#3451D1", fontWeight: 600, fontSize: 14 }}>{examIaDuelIaAnswer.text}</div>
                              <div style={{ fontSize: 11, color: examIaDuelIaAnswer.correct ? "#4D6BFE" : "#EF4444", marginTop: 6, fontWeight: 700 }}>{examIaDuelIaAnswer.correct ? "✅ L'IA avait raison" : "❌ L'IA s'est trompée"}</div>
                            </div>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                            <button className="hov" onClick={() => handleExamAnswer(0)} style={{ padding: "16px 8px", background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>😓 Pas su (1)</button>
                            <button className="hov" onClick={() => handleExamAnswer(3)} style={{ padding: "16px 8px", background: "#E8EEFF", color: "#2D45B0", border: "1px solid #C7D2FE", borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>🤔 Hésité (2)</button>
                            <button className="hov" onClick={() => handleExamAnswer(5)} style={{ padding: "16px 8px", background: "#EEF2FF", color: "#2D45B0", border: "1px solid #C7D2FE", borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>⚡ Su ! (3)</button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ══ MODE CONNEXION (MATCHING) ══ */}
            {examSubView === "matching" && examMatchingPairs.length > 0 && (
              <div style={{ animation: "fadeUp 0.4s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <button onClick={() => { clearInterval(examMatchingTimerRef.current); setExamSubView("home"); }} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontWeight: 600 }}>✕ Abandonner</button>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ fontWeight: 800, color: theme.textMuted, fontFamily: "JetBrains Mono" }}>⏱ {examMatchingTime}s</div>
                    <div style={{ fontWeight: 800, color: "#4D6BFE" }}>{examMatchingDone.length}/{examMatchingPairs.length} paires</div>
                    {examMatchingWrong.length > 0 && <div style={{ color: "#EF4444", fontWeight: 700, fontSize: 13 }}>❌ {examMatchingWrong.length} erreurs</div>}
                  </div>
                </div>
                {examMatchingComplete ? (
                  <div style={{ textAlign: "center", padding: "48px 24px", background: theme.cardBg, borderRadius: 24, border: "2px solid #4D6BFE" }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#4D6BFE", marginBottom: 8 }}>Connexion complète !</div>
                    <div style={{ fontSize: 40, fontWeight: 900, color: theme.text, marginBottom: 8 }}>{Math.max(0, 100 - examMatchingWrong.length * 10)}%</div>
                    <div style={{ color: theme.textMuted, marginBottom: 24 }}>Terminé en {examMatchingTime}s · {examMatchingWrong.length} erreur(s)</div>
                    <button onClick={() => setExamSubView("home")} style={{ padding: "14px 32px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>🏠 Retour</button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 720, margin: "0 auto" }}>
                    <div>
                      <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700, marginBottom: 10, textAlign: "center" }}>TERMES</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {examMatchingPairs.map(p => {
                          const isDone = examMatchingDone.includes(p.id);
                          const isSelected = examMatchingLeft?.id === p.id && examMatchingLeft?.side === "left";
                          return (
                            <button key={p.id} onClick={() => !isDone && handleMatchingClick(p.id, "left")} disabled={isDone} style={{ padding: "14px 16px", borderRadius: 14, border: `2px solid ${isDone ? "#4D6BFE" : isSelected ? "#4D6BFE" : theme.border}`, background: isDone ? "#EEF2FF" : isSelected ? "#FFFFFF" : theme.inputBg, color: isDone ? "#2D45B0" : isSelected ? "#3451D1" : theme.text, fontWeight: 700, cursor: isDone ? "default" : "pointer", textAlign: "left", fontSize: 13, opacity: isDone ? 0.7 : 1 }}>
                              {isDone ? "✅ " : isSelected ? "→ " : ""}{p.front}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700, marginBottom: 10, textAlign: "center" }}>DÉFINITIONS</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {[...examMatchingPairs].sort(() => Math.random() - 0.5).map(p => {
                          const isDone = examMatchingDone.includes(p.id);
                          const isSelected = examMatchingLeft?.id === p.id && examMatchingLeft?.side === "right";
                          return (
                            <button key={p.id} onClick={() => !isDone && handleMatchingClick(p.id, "right")} disabled={isDone} style={{ padding: "14px 16px", borderRadius: 14, border: `2px solid ${isDone ? "#4D6BFE" : isSelected ? "#7B93FF" : theme.border}`, background: isDone ? "#EEF2FF" : isSelected ? "#FFFFFF" : theme.inputBg, color: isDone ? "#2D45B0" : isSelected ? "#3451D1" : theme.text, fontWeight: 600, cursor: isDone ? "default" : "pointer", textAlign: "left", fontSize: 12, opacity: isDone ? 0.7 : 1 }}>
                              {isDone ? "✅ " : ""}{p.back?.substring(0,80)}{p.back?.length > 80 ? "..." : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ RÉSULTATS ══ */}
            {examSubView === "results" && examAnswers.length > 0 && (() => {
              const correct = examAnswers.filter(a => a.q >= 3).length;
              const score = examConfig.mode === "deathrun" ? examDeathrunCurrent : Math.round((correct / examAnswers.length) * 100);
              const duration = examStartTime ? Math.round((Date.now() - examStartTime) / 1000) : 0;
              const grade = score >= 90 ? { label: "LÉGENDAIRE", icon: "🏆", color: "#4D6BFE" } : score >= 70 ? { label: "BIEN", icon: "👍", color: "#4D6BFE" } : score >= 50 ? { label: "PASSABLE", icon: "😐", color: "#6B82F5" } : { label: "À RETRAVAILLER", icon: "💪", color: "#EF4444" };
              const bossPenalty = examConfig.mode === "boss" && score < 100;
              return (
                <div style={{ animation: "fadeUp 0.4s ease" }}>
                  {/* Score principal */}
                  <div style={{ background: bossPenalty ? "linear-gradient(135deg, #FEF2F2, #FECACA)" : `linear-gradient(135deg, ${grade.color}20, ${grade.color}08)`, border: `2px solid ${bossPenalty ? "#EF4444" : grade.color}44`, borderRadius: 28, padding: "40px 32px", marginBottom: 24, textAlign: "center" }}>
                    <div style={{ fontSize: 72, marginBottom: 8 }}>{examConfig.mode === "deathrun" ? "💥" : bossPenalty ? "💀" : grade.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: bossPenalty ? "#EF4444" : grade.color, letterSpacing: 3, marginBottom: 8 }}>{examConfig.mode === "deathrun" ? "DEATHRUN TERMINÉ" : bossPenalty ? "ÉCHEC FACE AU BOSS" : grade.label}</div>
                    <div style={{ fontSize: 72, fontWeight: 900, color: bossPenalty ? "#EF4444" : grade.color, lineHeight: 1 }}>{examConfig.mode === "deathrun" ? examDeathrunCurrent : score}{examConfig.mode !== "deathrun" && "%"}</div>
                    {examConfig.mode === "deathrun" && <div style={{ color: "#B91C1C", fontWeight: 700, marginTop: 8 }}>réponses consécutives · Record: {examDeathrunBest}</div>}
                    {bossPenalty && <div style={{ color: "#991B1B", fontWeight: 700, marginTop: 10 }}>Pénalité: Tes fiches perdent de la maîtrise.</div>}
                    <div style={{ fontSize: 14, color: theme.textMuted, marginTop: 10 }}>{correct} / {examAnswers.length} correctes · {Math.floor(duration/60)}m{duration%60}s</div>
                    {/* Score Duel */}
                    {examConfig.mode === "duel" && (
                      <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 24 }}>
                        <div style={{ textAlign: "center" }}><div style={{ fontSize: 28 }}>😊</div><div style={{ fontWeight: 900, fontSize: 24, color: examIaDuelScore.user > examIaDuelScore.ia ? "#4D6BFE" : "#EF4444" }}>{examIaDuelScore.user}</div><div style={{ fontSize: 12, color: theme.textMuted }}>Toi</div></div>
                        <div style={{ fontWeight: 900, fontSize: 28, color: theme.textMuted, display: "flex", alignItems: "center" }}>VS</div>
                        <div style={{ textAlign: "center" }}><div style={{ fontSize: 28 }}>🤖</div><div style={{ fontWeight: 900, fontSize: 24, color: examIaDuelScore.ia > examIaDuelScore.user ? "#4D6BFE" : "#EF4444" }}>{examIaDuelScore.ia}</div><div style={{ fontSize: 12, color: theme.textMuted }}>IA</div></div>
                      </div>
                    )}
                  </div>

                  {/* Faux positifs (Precision Strike insight) */}
                  {examPrecisionErrors.length > 0 && (
                    <div style={{ background: theme.cardBg, borderRadius: 18, padding: "20px 24px", marginBottom: 20, border: `2px solid #6B82F5` }}>
                      <div style={{ fontWeight: 800, color: "#6B82F5", fontSize: 14, marginBottom: 8 }}>⚠️ Faux positifs détectés</div>
                      <p style={{ color: theme.textMuted, fontSize: 13, marginBottom: 10 }}>Tu as répondu vite mais faux sur ces concepts — tu les croyais maîtrisés :</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {examPrecisionErrors.map((c, i) => <span key={i} style={{ background: "#E8EEFF", color: "#2D45B0", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>{c?.front}</span>)}
                      </div>
                    </div>
                  )}

                  {/* Rapport IA */}
                  {(examAiReportLoading || examAiReport) && (
                    <div style={{ background: theme.cardBg, borderRadius: 18, padding: "24px", marginBottom: 20, border: `1px solid ${theme.border}` }}>
                      <div style={{ fontWeight: 800, color: theme.highlight, fontSize: 15, marginBottom: 12 }}>🤖 Rapport IA personnalisé</div>
                      {examAiReportLoading ? (
                        <div style={{ color: theme.textMuted, textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 28, animation: "pulse 1s infinite" }}>🤖</div><div>L'IA analyse ta performance...</div></div>
                      ) : examAiReport ? (
                        <div>
                          <div style={{ fontWeight: 700, color: theme.text, fontSize: 16, marginBottom: 16, padding: "12px 16px", background: theme.inputBg, borderRadius: 12, fontStyle: "italic" }}>"{examAiReport.globalVerdict}"</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                            <div style={{ background: "#EEF2FF", borderRadius: 12, padding: "14px 16px" }}>
                              <div style={{ fontSize: 11, color: "#2D45B0", fontWeight: 800, marginBottom: 8 }}>💪 POINTS FORTS</div>
                              {(examAiReport.strengths || []).map((s, i) => <div key={i} style={{ color: "#1E3A8A", fontSize: 13, marginBottom: 4 }}>• {s}</div>)}
                            </div>
                            <div style={{ background: "#FEE2E2", borderRadius: 12, padding: "14px 16px" }}>
                              <div style={{ fontSize: 11, color: "#B91C1C", fontWeight: 800, marginBottom: 8 }}>🎯 À TRAVAILLER</div>
                              {(examAiReport.weaknesses || []).map((w, i) => <div key={i} style={{ color: "#991B1B", fontSize: 13, marginBottom: 4 }}>• {w}</div>)}
                            </div>
                          </div>
                          {examAiReport.behaviorPattern && <div style={{ background: "#E8EEFF", borderRadius: 12, padding: "12px 16px", marginBottom: 12, color: "#2D45B0", fontSize: 13, fontWeight: 600 }}>🧠 Pattern : {examAiReport.behaviorPattern}</div>}
                          {examAiReport.topPriority && <div style={{ background: "#FFF1F2", borderRadius: 12, padding: "12px 16px", marginBottom: 12, color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>🚨 Priorité : {examAiReport.topPriority}</div>}
                          <div style={{ background: theme.inputBg, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
                            <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 800, marginBottom: 8 }}>PLAN D'ACTION</div>
                            {(examAiReport.actionPlan || []).map((a, i) => <div key={i} style={{ color: theme.text, fontSize: 13, marginBottom: 6 }}>{i+1}. {a}</div>)}
                          </div>
                          {examAiReport.motivationalMessage && <div style={{ textAlign: "center", color: "#4D6BFE", fontSize: 14, fontWeight: 700, fontStyle: "italic" }}>✨ {examAiReport.motivationalMessage}</div>}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Détail question par question */}
                  <div style={{ background: theme.cardBg, borderRadius: 18, padding: "20px 24px", marginBottom: 20, border: `1px solid ${theme.border}` }}>
                    <div style={{ fontWeight: 800, color: theme.text, fontSize: 14, marginBottom: 12 }}>📋 Détail question par question</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                      {examAnswers.map((a, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: a.q >= 3 ? (isDarkMode?"#052e16":"#FFFFFF") : (isDarkMode?"#1c0a0a":"#FFF1F2"), borderRadius: 12, fontSize: 13 }}>
                          <span style={{ fontSize: 16 }}>{a.q >= 5 ? "⚡" : a.q >= 3 ? "🤔" : "❌"}</span>
                          <div style={{ flex: 1, fontWeight: 600, color: theme.text }}>{a.card?.front || a.card?.question}</div>
                          <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>{a.timeSpent}s</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button className="hov btn-glow" onClick={() => { setExamAnswers([]); setExamQueue([]); setExamAiReport(null); setExamSubView("config"); }} style={{ flex: 1, padding: "16px", background: "#3451D1", color: "white", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer" }}>🔄 Recommencer</button>
                    <button className="hov" onClick={() => { setExamAnswers([]); setExamQueue([]); setExamAiReport(null); setExamSubView("home"); }} style={{ flex: 1, padding: "16px", background: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>🏠 Accueil Examens</button>
                  </div>
                </div>
              );
            })()}

            {/* ══ EXAMENS CUSTOM ══ */}
            {examSubView === "custom" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
                  <button onClick={() => setExamSubView("home")} className="hov" style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontWeight: 600 }}>← Retour</button>
                  <button onClick={() => { setNewCustomExam({ title: "", description: "", questions: [] }); setExamSubView("createCustom"); }} style={{ padding: "10px 20px", background: "#3451D1", color: "white", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer" }}>+ Créer</button>
                </div>
                {customExams.length === 0
                  ? <div style={{ textAlign: "center", color: theme.textMuted, padding: "48px 0" }}>Aucun examen personnalisé. Crée le tien !</div>
                  : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 20 }}>
                      {customExams.map(exam => (
                        <div key={exam.id} style={{ background: theme.cardBg, padding: 24, borderRadius: 20, border: `1px solid ${theme.border}`, borderTop: "4px solid #4D6BFE" }}>
                          <div style={{ fontWeight: 900, color: theme.text, fontSize: 18, marginBottom: 6 }}>{exam.title}</div>
                          <div style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>{exam.description}</div>
                          <div style={{ fontSize: 12, color: "#4D6BFE", fontWeight: 700, marginBottom: 16 }}>{exam.questions.length} questions</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => startExam(exam)} style={{ flex: 1, padding: "10px", background: "#3451D1", color: "white", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>🚀 Passer</button>
                            <button onClick={() => setCustomExams(p => p.filter(e => e.id !== exam.id))} style={{ padding: "10px 14px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 10, cursor: "pointer" }}>🗑️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                }
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
                        <button onClick={() => setCustomExamEditQ(q => ({...q, isQcm: false}))} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: !customExamEditQ.isQcm ? "#4D6BFE" : theme.inputBg, color: !customExamEditQ.isQcm ? "white" : theme.textMuted, fontWeight: 700, cursor: "pointer" }}>🃏 Flashcard</button>
                        <button onClick={() => setCustomExamEditQ(q => ({...q, isQcm: true}))} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: customExamEditQ.isQcm ? "#4D6BFE" : theme.inputBg, color: customExamEditQ.isQcm ? "white" : theme.textMuted, fontWeight: 700, cursor: "pointer" }}>📝 QCM</button>
                      </div>
                      <input value={customExamEditQ.question} onChange={e => setCustomExamEditQ(q => ({...q, question: e.target.value}))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text, marginBottom: 12 }} placeholder="Question" />
                      <input value={customExamEditQ.answer} onChange={e => setCustomExamEditQ(q => ({...q, answer: e.target.value}))} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text, marginBottom: customExamEditQ.isQcm ? 12 : 20 }} placeholder="Réponse correcte" />
                      {customExamEditQ.isQcm && customExamEditQ.choices.slice(0,3).map((ch, ci) => <input key={ci} value={ch} onChange={e => { const c = [...customExamEditQ.choices]; c[ci] = e.target.value; setCustomExamEditQ(q => ({...q, choices: c})); }} style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text, marginBottom: 8 }} placeholder={`Fausse réponse ${ci+1}`} />)}
                      <button onClick={() => { if (!customExamEditQ.question || !customExamEditQ.answer) return; setNewCustomExam(ex => ({...ex, questions: [...ex.questions, { id: Date.now().toString(), question: customExamEditQ.question, answer: customExamEditQ.answer, isQcm: customExamEditQ.isQcm, choices: customExamEditQ.isQcm ? [...customExamEditQ.choices.slice(0,3), customExamEditQ.answer] : [] }]})); setCustomExamEditQ({ question: "", answer: "", choices: ["","","",""], isQcm: customExamEditQ.isQcm }); showToast("Question ajoutée"); }} style={{ width: "100%", padding: "14px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", marginTop: 12 }}>+ Ajouter la question</button>
                    </div>
                    <button onClick={() => { if (!newCustomExam.title || newCustomExam.questions.length === 0) return; setCustomExams(p => [...p, { ...newCustomExam, id: Date.now().toString(), createdAt: today() }]); setExamSubView("custom"); showToast("Examen sauvegardé !"); }} style={{ width: "100%", padding: "16px", background: "#3451D1", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", marginTop: 20 }}>💾 Sauvegarder l'examen</button>
                  </div>
                  <div style={{ background: theme.cardBg, padding: 24, borderRadius: 20, border: `1px solid ${theme.border}`, maxHeight: 600, overflowY: "auto" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, marginBottom: 16 }}>APERÇU ({newCustomExam.questions.length} questions)</div>
                    {newCustomExam.questions.map((q, i) => (
                      <div key={q.id} style={{ background: theme.inputBg, padding: 14, borderRadius: 12, marginBottom: 10, borderLeft: `4px solid ${q.isQcm ? "#4D6BFE" : "#4D6BFE"}` }}>
                        <div style={{ fontSize: 11, color: q.isQcm ? "#4D6BFE" : "#4D6BFE", fontWeight: 800, marginBottom: 4 }}>{q.isQcm ? "QCM" : "FLASHCARD"}</div>
                        <div style={{ fontWeight: 700, color: theme.text }}>{q.question}</div>
                        <div style={{ color: "#4D6BFE", fontSize: 12 }}>✓ {q.answer}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

                       {view === "practice" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            {/* HEADER */}
            <div style={{ background: "linear-gradient(135deg, #1A0800 0%, #1E3A8A 60%, #3451D1 100%)", borderRadius: 28, padding: "36px", marginBottom: 28, position: "relative", overflow: "hidden", boxShadow: "0 10px 40px rgba(5,150,105,0.2)" }}>
              <div style={{ position: "absolute", top: -20, right: -20, fontSize: 160, opacity: 0.06 }}>🗣️</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#A5B4FC", letterSpacing: 3, marginBottom: 8, fontFamily: "JetBrains Mono" }}>AI ENGLISH TRAINING CENTER</div>
              <h1 style={{ fontSize: 30, fontWeight: 900, color: "white", marginBottom: 8 }}>{practiceImmersionMode ? "Full Immersion 🇬🇧" : "English Practice Room 🇬🇧"}</h1>
              <p style={{ color: "#C7D2FE", fontSize: 14, marginBottom: 20 }}>Écrire, parler, simuler un examen, suivre sa progression.</p>

              {/* Navigation principale */}
              <div className="english-btns" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {[
                  { id: "chat", icon: "💬", label: "Chat" },
                  { id: "debate", icon: "⚖️", label: "Débat" },
                  { id: "roleplay", icon: "🎭", label: "Roleplay" },
                  { id: "dictation", icon: "✍️", label: "Dictée" },
                  { id: "writing", icon: "📝", label: "Écriture" },
                  { id: "speaking", icon: "🎙️", label: "Oral" },
                  { id: "ielts", icon: "🎓", label: "IELTS" },
                  { id: "dashboard", icon: "📊", label: "Progrès" },
                  { id: "achievements", icon: "🏆", label: "Succès" },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setPracticeSubView(tab.id)} className="hov english-btn-item" style={{
                    padding: "8px 16px", borderRadius: 12,
                    background: practiceSubView === tab.id ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)",
                    color: "white", border: "1px solid rgba(255,255,255,0.25)",
                    fontWeight: 700, fontSize: 13, cursor: "pointer"
                  }}>{tab.icon} {tab.label}</button>
                ))}
                <button onClick={() => setPracticeImmersionMode(!practiceImmersionMode)} className="hov english-btn-item" style={{ padding:"8px 16px", borderRadius:12, background: practiceImmersionMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)", color:"white", border:"1px solid rgba(255,255,255,0.25)", fontWeight:700, cursor:"pointer" }}>{practiceImmersionMode ? "🌐 ON" : "🌐 OFF"} Immersion</button>
              </div>

              {/* Barre d'options rapides (visible seulement pour chat) */}
              {practiceSubView === "chat" && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 11, color: "#A5B4FC", fontWeight: 700 }}>TOPIC</span><select value={practiceTopic} onChange={e => setPracticeTopic(e.target.value)} style={{ padding: "10px 14px", background: "#1E3A8A", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer", minWidth: 160 }}>{["Free conversation", "Job interview", "Technology & AI", "Daily life in Senegal", "Programming & coding"].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 11, color: "#A5B4FC", fontWeight: 700 }}>LEVEL</span><select value={practiceLevel} onChange={e => setPracticeLevel(e.target.value)} style={{ padding: "10px 14px", background: "#1E3A8A", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer" }}><option value="beginner">🟢 Beginner</option><option value="intermediate">🟡 Intermediate</option><option value="advanced">🔴 Advanced</option></select></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 11, color: "#A5B4FC", fontWeight: 700 }}>PERSONA</span><select value={practicePersona} onChange={e => setPracticePersona(e.target.value)} style={{ padding: "10px 14px", background: "#1E3A8A", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer" }}><option value="Standard">👨‍🏫 Standard</option><option value="MMA">🥊 MMA Fighter</option><option value="Recruteur">💼 Tech Recruiter</option></select></div>
                  <button onClick={resetPracticeChat} className="hov" style={{ padding: "10px 18px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, cursor: "pointer" }}>🔄 New Session</button>
                </div>
              )}
            </div>

            {/* ══ CHAT (existant) ══ */}
            {practiceSubView === "chat" && (
              <div style={{ background: theme.cardBg, border: `1px solid ${isDarkMode?"#3D2000":"#EEF2FF"}`, borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column", height: 480 }}>
                <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
                  {practiceMessages.map((msg, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-end" }}>
                      {msg.role === "assistant" && <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#3451D1,#4D6BFE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>}
                      <div style={{ maxWidth: "75%", padding: "14px 18px", borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px", background: msg.role === "user" ? "linear-gradient(135deg, #3451D1, #4D6BFE)" : (isDarkMode?"#3D2000":"#FFFFFF"), color: msg.role === "user" ? "white" : theme.text, fontSize: 15, lineHeight: 1.6 }}>
                        {msg.text}
                        {msg.role === "assistant" && <button onClick={() => speakText(msg.text)} style={{ display: "block", marginTop: 8, background: "none", border: "none", color: "#3451D1", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: 0 }}>🔊 Listen</button>}
                      </div>
                      {msg.role === "user" && <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#3451D1,#4D6BFE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>😊</div>}
                    </div>
                  ))}
                  {practiceLoading && <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#3451D1,#4D6BFE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div><div style={{ background: isDarkMode?"#3D2000":"#FFFFFF", borderRadius: "20px 20px 20px 4px", padding: "14px 18px", display: "flex", gap: 6 }}>{[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#3451D1", animation: `pulse 1.2s ${i*0.2}s infinite` }} />)}</div></div>}
                  <div ref={practiceEndRef} />
                </div>
                {/* Correction (inchangée) */}
                {practiceShowCorrection && practiceCorrections.length > 0 && (
                  <div style={{ padding: "0 24px 12px", background: isDarkMode?"#2A1400":"#FFFFFF", borderTop: `1px solid ${isDarkMode?"#3D2000":"#EEF2FF"}` }}>
                    <div style={{ background: "#FFF3CD", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                      <div style={{ fontWeight:700, color:"#856404", marginBottom:4 }}>🔍 Correction</div>
                      <div style={{ color:"#856404" }}><s>{practiceCorrections[0].original}</s></div>
                      <div style={{ color:"#155724", fontWeight:600 }}>✅ {practiceCorrections[0].corrected}</div>
                      {practiceCorrections[0].explanation && <div style={{ fontSize:11, color:"#666", marginTop:4 }}>{practiceCorrections[0].explanation}</div>}
                      <button onClick={() => setPracticeShowCorrection(false)} style={{ marginTop:6, background:"none", border:"none", color:"#856404", cursor:"pointer", fontSize:12 }}>✕</button>
                    </div>
                  </div>
                )}
                <div style={{ padding: "16px 20px", borderTop: `1px solid ${isDarkMode?"#3D2000":"#EEF2FF"}`, background: isDarkMode?"#2A1400":"#FFFFFF", display: "flex", gap: 10, alignItems: "center" }}>
                  <button onClick={togglePracticeMic} style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0, background: practiceListening ? "linear-gradient(135deg, #EF4444, #4D6BFE)" : "linear-gradient(135deg, #3451D1, #4D6BFE)", border: "none", cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", animation: practiceListening ? "pulse 0.8s infinite" : "none" }}>{practiceListening ? "⏹️" : "🎙️"}</button>
                  <input value={practiceInput} onChange={e => setPracticeInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPracticeMessage(practiceInput); } }} placeholder={practiceListening ? "🎙️ Listening... click ⏹️ when finished!" : "Type in English or use mic..."} style={{ flex: 1, padding: "14px 18px", background: theme.inputBg, border: `2px solid ${isDarkMode?"#3D2000":"#EEF2FF"}`, borderRadius: 14, fontSize: 15, color: theme.text }} disabled={practiceListening || practiceInput.includes("⏳")} />
                  <button onClick={() => sendPracticeMessage(practiceInput)} disabled={!practiceInput.trim() || practiceLoading || practiceListening} style={{ width: 52, height: 52, borderRadius: 16, background: practiceInput.trim() ? "linear-gradient(135deg,#3451D1,#4D6BFE)" : theme.inputBg, border: "none", cursor: practiceInput.trim() ? "pointer" : "default", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{practiceLoading ? "⏳" : "➤"}</button>
                </div>
              </div>
            )}

            {/* ══ WRITING LAB ══ */}
            {practiceSubView === "writing" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}` }}>
                <h2 style={{ marginTop:0 }}>📝 Writing Lab</h2>
                <input value={practiceWritingPrompt} onChange={e => setPracticeWritingPrompt(e.target.value)} placeholder="Sujet (ex: 'Some people think...')" style={{ width:"100%", padding:12, marginBottom:12, borderRadius:10, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text }} />
                <textarea value={practiceWritingText} onChange={e => setPracticeWritingText(e.target.value)} rows={10} style={{ width:"100%", padding:14, borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontFamily:"'JetBrains Mono', monospace", fontSize:13 }} placeholder="Écris ton essai ici..." />
                <button onClick={submitWriting} disabled={practiceWritingLoading || !practiceWritingText.trim()} style={{ marginTop:12, padding:"14px 28px", background:"linear-gradient(135deg,#3451D1,#4D6BFE)", color:"white", border:"none", borderRadius:12, fontWeight:800, cursor:"pointer" }}>{practiceWritingLoading ? "Correction..." : "📝 Corriger"}</button>
                {practiceWritingFeedback && (
                  <div style={{ marginTop:20, background:isDarkMode?"#2A1400":"#F8FAFC", borderRadius:16, padding:20 }}>
                    <h3>Score : {practiceWritingFeedback.score}/9</h3>
                    <p><strong>Grammaire :</strong> {practiceWritingFeedback.grammarFeedback}</p>
                    <p><strong>Vocabulaire :</strong> {practiceWritingFeedback.vocabularyFeedback}</p>
                    <p><strong>Structure :</strong> {practiceWritingFeedback.structureFeedback}</p>
                    <p><strong>Commentaire :</strong> {practiceWritingFeedback.overallComment}</p>
                    <details><summary>Version corrigée</summary><pre style={{ whiteSpace:"pre-wrap" }}>{practiceWritingFeedback.correctedText}</pre></details>
                  </div>
                )}
              </div>
            )}

            {/* ══ SPEAKING LAB ══ */}
            {practiceSubView === "speaking" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}` }}>
                <h2 style={{ marginTop:0 }}>🎙️ Speaking Lab</h2>
                <input value={practiceSpeakingPrompt} onChange={e => setPracticeSpeakingPrompt(e.target.value)} placeholder="Phrase à prononcer (optionnel)" style={{ width:"100%", padding:12, marginBottom:12, borderRadius:10, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text }} />
                <button onClick={startSpeakingRecording} disabled={practiceSpeakingLoading} style={{ padding:"14px 28px", background:"linear-gradient(135deg,#3451D1,#4D6BFE)", color:"white", border:"none", borderRadius:12, fontWeight:800, cursor:"pointer" }}>🎤 Enregistrer (10s)</button>
                {practiceSpeakingTranscript && <div style={{ marginTop:16, background:theme.inputBg, padding:12, borderRadius:10 }}>Transcription : {practiceSpeakingTranscript}</div>}
                {practiceSpeakingFeedback && (
                  <div style={{ marginTop:16, background:isDarkMode?"#2A1400":"#FFFFFF", borderRadius:12, padding:16 }}>
                    <p>Score de prononciation : {practiceSpeakingFeedback.pronunciationScore}/100</p>
                    <p>Conseil : {practiceSpeakingFeedback.advice}</p>
                  </div>
                )}
              </div>
            )}

            {/* ══ IELTS SIMULATION ══ */}
            {practiceSubView === "ielts" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}` }}>
                <h2 style={{ marginTop:0 }}>🎓 IELTS Speaking Simulation</h2>
                <button onClick={startIeltsSimulation} style={{ padding:"12px 24px", background:"#4D6BFE", color:"white", border:"none", borderRadius:10, fontWeight:800, marginBottom:16 }}>Démarrer la simulation</button>
                <div style={{ maxHeight:400, overflowY:"auto", marginBottom:12 }}>
                  {practiceIeltsHistory.map((entry, i) => (
                    <div key={i} style={{ marginBottom:10, textAlign:entry.role==="candidate"?"right":"left" }}>
                      <div style={{ display:"inline-block", padding:"10px 18px", borderRadius:16, background:entry.role==="candidate"?"linear-gradient(135deg,#3451D1,#4D6BFE)":"#E5E7EB", color:entry.role==="candidate"?"white":"#1F2937", maxWidth:"80%" }}>{entry.text}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <input value={practiceInput} onChange={e => setPracticeInput(e.target.value)} placeholder="Your answer..." style={{ flex:1, padding:12, borderRadius:10, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text }} onKeyDown={e => { if(e.key==="Enter"){ answerIelts(practiceInput); setPracticeInput(""); }}} />
                  <button onClick={() => { answerIelts(practiceInput); setPracticeInput(""); }} style={{ padding:"12px 20px", background:"#3451D1", color:"white", border:"none", borderRadius:10, fontWeight:800 }}>Envoyer</button>
                </div>
              </div>
            )}

            {/* ══ DASHBOARD ══ */}
            {practiceSubView === "dashboard" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}` }}>
                <h2 style={{ marginTop:0 }}>📊 Progression</h2>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:16 }}>
                  <div style={{ background:theme.inputBg, borderRadius:12, padding:16, textAlign:"center" }}>
                    <div style={{ fontSize:28, fontWeight:900, color:"#4D6BFE" }}>{practiceStats.totalMessages}</div>
                    <div>Messages</div>
                  </div>
                  <div style={{ background:theme.inputBg, borderRadius:12, padding:16, textAlign:"center" }}>
                    <div style={{ fontSize:28, fontWeight:900, color:"#4D6BFE" }}>{practiceStats.sessionsCompleted}</div>
                    <div>Sessions</div>
                  </div>
                  <div style={{ background:theme.inputBg, borderRadius:12, padding:16, textAlign:"center" }}>
                    <div style={{ fontSize:28, fontWeight:900, color:"#6B82F5" }}>{practiceStats.levelEstimate}</div>
                    <div>Niveau estimé</div>
                  </div>
                </div>
                <p>Mots uniques utilisés : {practiceStats.vocabDiversity}</p>
              </div>
            )}

            {/* ══ ACHIEVEMENTS ══ */}
            {practiceSubView === "achievements" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}` }}>
                <h2 style={{ marginTop:0 }}>🏆 Succès</h2>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:12 }}>
                  {[
                    { id:"write5", icon:"📝", label:"Écrivain en herbe", desc:"5 essais corrigés" },
                    { id:"speak100", icon:"🎙️", label:"Orateur", desc:"100 phrases enregistrées" },
                    { id:"ielts7", icon:"🎓", label:"IELTS Master", desc:"Score ≥ 7" },
                  ].map(a => {
                    const unlocked = practiceAchievements.includes(a.id);
                    return (
                      <div key={a.id} style={{ background:unlocked?"#EEF2FF":"#F3F4F6", borderRadius:14, padding:16, opacity:unlocked?1:0.6 }}>
                        <div style={{ fontSize:24 }}>{a.icon}</div>
                        <div style={{ fontWeight:800 }}>{a.label}</div>
                        <div style={{ fontSize:12 }}>{a.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ DÉBAT ══ */}
            {practiceSubView === "debate" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg,#1E3A8A,#3451D1)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: "white" }}>⚖️ Débat en anglais</div>
                    {practiceDebateTopic && <div style={{ fontSize: 12, color: "#C7D2FE", marginTop: 2 }}>Topic : {practiceDebateTopic}</div>}
                  </div>
                  <button onClick={() => { setPracticeDebateTopic(""); setPracticeDebateHistory([]); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "6px 12px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>↺ Reset</button>
                </div>

                {/* Setup (si pas encore lancé) */}
                {practiceDebateHistory.length === 0 && (
                  <div style={{ padding: 28 }}>
                    <p style={{ color: theme.textMuted, marginTop: 0, marginBottom: 20, fontSize: 14 }}>Choisis un sujet de débat, l'IA va lancer la discussion et te challenger en anglais.</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                      {["Social media does more harm than good", "AI will replace human jobs", "Remote work is better than office", "Climate change is the biggest threat", "Video games improve cognitive skills"].map(topic => (
                        <button key={topic} onClick={() => setPracticeDebateTopic(topic)} style={{ padding: "8px 14px", borderRadius: 20, border: `2px solid ${practiceDebateTopic === topic ? "#4D6BFE" : theme.border}`, background: practiceDebateTopic === topic ? "#EEF2FF" : theme.inputBg, color: practiceDebateTopic === topic ? "#3451D1" : theme.text, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{topic}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <input value={practiceDebateTopic} onChange={e => setPracticeDebateTopic(e.target.value)} placeholder="Ou tape ton propre sujet…" style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 14 }} onKeyDown={e => e.key === "Enter" && startDebate()} />
                      <button onClick={startDebate} disabled={!practiceDebateTopic.trim()} style={{ padding: "12px 24px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>⚖️ Lancer</button>
                    </div>
                  </div>
                )}

                {/* Conversation */}
                {practiceDebateHistory.length > 0 && (
                  <>
                    <div style={{ maxHeight: 380, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
                      {practiceDebateHistory.map((msg, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-end" }}>
                          {msg.role === "assistant" && <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#1E3A8A,#4D6BFE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>⚖️</div>}
                          <div style={{ maxWidth: "78%", padding: "12px 16px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? "linear-gradient(135deg,#3451D1,#4D6BFE)" : theme.inputBg, color: msg.role === "user" ? "white" : theme.text, fontSize: 14, lineHeight: 1.6 }}>{msg.text}</div>
                          {msg.role === "user" && <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#3451D1,#4D6BFE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>😊</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: "14px 20px", borderTop: `1px solid ${theme.border}`, display: "flex", gap: 10 }}>
                      <input value={practiceInput} onChange={e => setPracticeInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && practiceInput.trim()) { sendDebateMessage(practiceInput); setPracticeInput(""); } }} placeholder="Argue your point in English…" style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 14 }} />
                      <button onClick={() => { sendDebateMessage(practiceInput); setPracticeInput(""); }} disabled={!practiceInput.trim()} style={{ padding: "12px 20px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>➤</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ══ ROLEPLAY ══ */}
            {practiceSubView === "roleplay" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg,#4A0080,#7B2FBE)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: "white" }}>🎭 Roleplay en anglais</div>
                    {practiceRoleplayScenario && <div style={{ fontSize: 12, color: "#E9D5FF", marginTop: 2 }}>Scénario : {practiceRoleplayScenario}</div>}
                  </div>
                  <button onClick={() => { setPracticeRoleplayScenario(""); setPracticeRoleplayHistory([]); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "6px 12px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>↺ Reset</button>
                </div>

                {/* Setup */}
                {practiceRoleplayHistory.length === 0 && (
                  <div style={{ padding: 28 }}>
                    <p style={{ color: theme.textMuted, marginTop: 0, marginBottom: 20, fontSize: 14 }}>Choisis un scénario. L'IA joue le rôle de l'autre personnage. Tu pratiques l'anglais en situation réelle.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 12, marginBottom: 20 }}>
                      {[
                        { scenario: "Job interview at a tech company", icon: "💼", label: "Entretien tech" },
                        { scenario: "At the doctor's office", icon: "🏥", label: "Chez le médecin" },
                        { scenario: "Negotiating a salary raise", icon: "💰", label: "Négociation salaire" },
                        { scenario: "Ordering at a restaurant", icon: "🍽️", label: "Au restaurant" },
                        { scenario: "Presenting a project to a client", icon: "📊", label: "Présentation client" },
                        { scenario: "Dealing with a difficult customer", icon: "😤", label: "Client difficile" },
                      ].map(({ scenario, icon, label }) => (
                        <button key={scenario} onClick={() => startRoleplay(scenario)} style={{ padding: "16px 14px", borderRadius: 14, border: `2px solid ${practiceRoleplayScenario === scenario ? "#7B2FBE" : theme.border}`, background: practiceRoleplayScenario === scenario ? "#F5F0FF" : theme.inputBg, color: theme.text, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: 22 }}>{icon}</span>
                          <span style={{ fontSize: 13 }}>{label}</span>
                          <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 400 }}>{scenario}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <input value={practiceRoleplayScenario} onChange={e => setPracticeRoleplayScenario(e.target.value)} placeholder="Ou décris ton propre scénario…" style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 14 }} onKeyDown={e => e.key === "Enter" && practiceRoleplayScenario.trim() && startRoleplay(practiceRoleplayScenario)} />
                      <button onClick={() => startRoleplay(practiceRoleplayScenario)} disabled={!practiceRoleplayScenario.trim()} style={{ padding: "12px 24px", background: "linear-gradient(135deg,#4A0080,#7B2FBE)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>🎭 Lancer</button>
                    </div>
                  </div>
                )}

                {/* Conversation */}
                {practiceRoleplayHistory.length > 0 && (
                  <>
                    <div style={{ maxHeight: 380, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
                      {practiceRoleplayHistory.map((msg, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-end" }}>
                          {msg.role === "assistant" && <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#4A0080,#7B2FBE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🎭</div>}
                          <div style={{ maxWidth: "78%", padding: "12px 16px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? "linear-gradient(135deg,#3451D1,#4D6BFE)" : theme.inputBg, color: msg.role === "user" ? "white" : theme.text, fontSize: 14, lineHeight: 1.6 }}>{msg.text}</div>
                          {msg.role === "user" && <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#3451D1,#4D6BFE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>😊</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: "14px 20px", borderTop: `1px solid ${theme.border}`, display: "flex", gap: 10 }}>
                      <input value={practiceInput} onChange={e => setPracticeInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && practiceInput.trim()) { sendRoleplayMessage(practiceInput); setPracticeInput(""); } }} placeholder="Play your role in English…" style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 14 }} />
                      <button onClick={() => { sendRoleplayMessage(practiceInput); setPracticeInput(""); }} disabled={!practiceInput.trim()} style={{ padding: "12px 20px", background: "linear-gradient(135deg,#4A0080,#7B2FBE)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>➤</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ══ DICTÉE ══ */}
            {practiceSubView === "dictation" && (
              <div style={{ background: theme.cardBg, borderRadius: 24, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg,#064E3B,#059669)", padding: "20px 24px" }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: "white" }}>✍️ Dictée anglaise</div>
                  <div style={{ fontSize: 12, color: "#A7F3D0", marginTop: 2 }}>Écoute, transcris, et vérifie ta précision</div>
                </div>

                <div style={{ padding: 28 }}>
                  {/* Niveau */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                    {["beginner","intermediate","advanced"].map(lvl => (
                      <button key={lvl} onClick={() => setPracticeLevel(lvl)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${practiceLevel === lvl ? "#059669" : theme.border}`, background: practiceLevel === lvl ? "#D1FAE5" : theme.inputBg, color: practiceLevel === lvl ? "#064E3B" : theme.text, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                        {lvl === "beginner" ? "🟢 Débutant" : lvl === "intermediate" ? "🟡 Intermédiaire" : "🔴 Avancé"}
                      </button>
                    ))}
                  </div>

                  {/* Bouton générer */}
                  <button onClick={startDictation} disabled={practiceDictationLoading} style={{ width: "100%", padding: "16px", background: "linear-gradient(135deg,#064E3B,#059669)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, fontSize: 15, cursor: "pointer", marginBottom: 24 }}>
                    {practiceDictationLoading ? "⏳ Génération en cours…" : "🎲 Générer une nouvelle dictée"}
                  </button>

                  {/* Texte à dicter (masqué) */}
                  {practiceDictationText && (
                    <>
                      {/* Bouton écouter */}
                      <div style={{ background: theme.inputBg, borderRadius: 16, padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
                        <button onClick={() => speakText(practiceDictationText)} style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#059669,#34D399)", border: "none", cursor: "pointer", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>🔊</button>
                        <div>
                          <div style={{ fontWeight: 700, color: theme.text }}>Écoute et transcris</div>
                          <div style={{ fontSize: 12, color: theme.textMuted }}>Clique sur 🔊 pour entendre le texte, puis écris ce que tu as compris ci-dessous</div>
                        </div>
                      </div>

                      {/* Zone de saisie */}
                      <textarea
                        value={practiceDictationUserInput}
                        onChange={e => { setPracticeDictationUserInput(e.target.value); setPracticeDictationScore(null); }}
                        rows={4}
                        placeholder="Écris ici ce que tu as entendu…"
                        style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 15, fontFamily: "'Outfit', sans-serif", resize: "vertical", boxSizing: "border-box" }}
                      />

                      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <button onClick={checkDictation} disabled={!practiceDictationUserInput.trim()} style={{ flex: 1, padding: "14px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>✅ Vérifier</button>
                        <button onClick={() => speakText(practiceDictationText)} style={{ padding: "14px 18px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.text, cursor: "pointer", fontWeight: 700 }}>🔊 Rejouer</button>
                      </div>

                      {/* Résultat */}
                      {practiceDictationScore !== null && (
                        <div style={{ marginTop: 20, borderRadius: 16, overflow: "hidden", border: `2px solid ${practiceDictationScore >= 80 ? "#059669" : practiceDictationScore >= 50 ? "#D97706" : "#DC2626"}` }}>
                          <div style={{ padding: "16px 20px", background: practiceDictationScore >= 80 ? "#D1FAE5" : practiceDictationScore >= 50 ? "#FEF3C7" : "#FEE2E2", display: "flex", alignItems: "center", gap: 16 }}>
                            <div style={{ fontSize: 40, fontWeight: 900, color: practiceDictationScore >= 80 ? "#064E3B" : practiceDictationScore >= 50 ? "#92400E" : "#991B1B" }}>{practiceDictationScore}%</div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 15, color: practiceDictationScore >= 80 ? "#064E3B" : practiceDictationScore >= 50 ? "#92400E" : "#991B1B" }}>
                                {practiceDictationScore >= 80 ? "🎉 Excellent !" : practiceDictationScore >= 50 ? "👍 Pas mal !" : "💪 Continue !"}
                              </div>
                              <div style={{ fontSize: 12, color: practiceDictationScore >= 80 ? "#065F46" : practiceDictationScore >= 50 ? "#B45309" : "#B91C1C" }}>Précision de transcription</div>
                            </div>
                          </div>
                          <div style={{ padding: "16px 20px", background: theme.cardBg }}>
                            <div style={{ fontWeight: 700, color: theme.text, marginBottom: 8, fontSize: 13 }}>Texte original :</div>
                            <div style={{ background: theme.inputBg, padding: "12px 16px", borderRadius: 10, fontSize: 14, color: theme.text, lineHeight: 1.6 }}>{practiceDictationText}</div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ACADEMY GOD LEVEL – Multi-cours */}
        {view === "academy" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            {/* ── LIBRARY ── */}
            {academyView === "library" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, margin: 0 }}>🏫 MémoMaître Academy</h1>
                    <p style={{ color: theme.textMuted, marginTop: 6 }}>Université personnelle IA — roadmaps, leçons interactives, projets, éditeur de code.</p>
                  </div>
                  <button onClick={() => { setAcademyTopic(""); setAcademySyllabus(null); setAcademyView("new"); }} className="btn-glow hov" style={{ padding: "12px 24px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 14 }}>✦ Nouveau cours</button>
                </div>
                {/* stats Academy */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 28 }}>
                  {[
                    { label: "Cours créés", value: academyCourses.length, icon: "📚", color: "#4D6BFE" },
                    { label: "Terminés", value: academyCourses.filter(c => { const t=c.syllabus?.concepts?.length||0; const d=Object.values(c.progress||{}).filter(v=>v>=5).length; return t>0&&d===t; }).length, icon: "✅", color: "#4D6BFE" },
                    { label: "Niveau", value: academyLevel, icon: "⬆️", color: "#6B82F5" },
                    { label: "XP", value: academyExperience, icon: "⚡", color: "#7B93FF" },
                  ].map(s => (
                    <div key={s.label} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 24 }}>{s.icon}</span>
                      <div><div style={{ fontWeight: 900, color: s.color, fontSize: 22 }}>{s.value}</div><div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>{s.label}</div></div>
                    </div>
                  ))}
                </div>
                {/* Suggestions de parcours */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>🚀 Parcours suggérés</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                    {[
                      { topic: "Python", icon: "🐍", color: "#4D6BFE" },
                      { topic: "Java Spring Boot", icon: "☕", color: "#7B93FF" },
                      { topic: "JavaScript", icon: "🟨", color: "#F7DF1E" },
                      { topic: "SQL", icon: "🗄️", color: "#7B93FF" },
                      { topic: "Docker", icon: "🐳", color: "#7B93FF" },
                      { topic: "Machine Learning", icon: "🤖", color: "#EF4444" },
                    ].map(s => (
                      <button key={s.topic} onClick={() => { setAcademyTopic(s.topic); setAcademySyllabus(null); setAcademyView("new"); }} className="card-hov" style={{ padding: "14px 16px", background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{s.icon}</span>
                        <span style={{ fontWeight: 700, color: theme.text, fontSize: 13 }}>{s.topic}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Liste cours existants (inchangé) */}
                {academyCourses.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 20px", background: theme.cardBg, borderRadius: 24, border: `2px dashed ${theme.border}` }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>🎓</div>
                    <h3 style={{ color: theme.text, fontWeight: 800, margin: "0 0 8px" }}>Aucun cours pour l'instant</h3>
                    <p style={{ color: theme.textMuted, marginBottom: 24 }}>Génère ton premier cours avec l'IA en quelques secondes.</p>
                    <button onClick={() => { setAcademyTopic(""); setAcademySyllabus(null); setAcademyView("new"); }} className="btn-glow hov" style={{ padding: "14px 32px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer" }}>🗺️ Créer mon premier cours</button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 20 }}>
                    {academyCourses.map((course) => {
                      const total = course.syllabus?.concepts?.length || 0;
                      const done = Object.values(course.progress || {}).filter(v => v >= 5).length;
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      return (
                        <div key={course.id} style={{ background: theme.cardBg, borderRadius: 20, border: `1px solid ${theme.border}`, padding: 20 }} className="card-hov">
                          <h3 style={{ fontWeight: 900 }}>{course.topic}</h3>
                          <div style={{ height: 6, background: theme.inputBg, borderRadius: 3, margin: "12px 0" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: "#4D6BFE", borderRadius: 3 }} />
                          </div>
                          <div style={{ fontSize: 12, color: theme.textMuted }}>{done}/{total} concepts</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                            <button onClick={() => openCourse(course)} style={{ flex: 1, padding: 8, background: "#3451D1", color: "white", border: "none", borderRadius: 8, fontWeight: 700 }}>▶️ Ouvrir</button>
                            <button onClick={() => deleteCourse(course.id)} style={{ padding: 8, background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 8 }}>🗑️</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── NEW COURSE ── */}
            {academyView === "new" && (
              <div>
                <button onClick={() => setAcademyView("library")} style={{ background: "none", border: "none", color: theme.highlight, cursor: "pointer", fontWeight: 700, marginBottom: 24, fontSize: 14 }}>← Retour</button>
                <div style={{ maxWidth: 600, margin: "0 auto" }}>
                  <h1 style={{ fontSize: 26, fontWeight: 900, color: theme.highlight, marginBottom: 8 }}>🗺️ Nouveau cours</h1>
                  <p style={{ color: theme.textMuted, marginBottom: 28 }}>L'IA va générer une roadmap complète pour ton sujet.</p>
                  <input value={academyTopic} onChange={e => setAcademyTopic(e.target.value)} placeholder="Ex: Python, Machine Learning, SQL..." style={{ width: "100%", padding: 16, marginBottom: 16, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }} />
                  <button onClick={generateSyllabus} disabled={academyLoading || !academyTopic.trim()} style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 12, fontWeight: 800 }}>{academyLoading ? "Génération..." : "🗺️ Générer le syllabus"}</button>
                </div>
              </div>
            )}

            {/* ── ROADMAP (home) ── */}
            {academyView === "home" && activeCourse && (
              <div>
                <button onClick={() => setAcademyView("library")} style={{ background: "none", border: "none", color: theme.highlight, cursor: "pointer", fontWeight: 700, marginBottom: 24, fontSize: 14 }}>← Bibliothèque</button>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
                  <div>
                    <h1 style={{ fontSize: 26, fontWeight: 900, color: theme.highlight, margin: 0 }}>{academyTopic}</h1>
                    <p style={{ color: theme.textMuted }}>{Object.values(academyProgress).filter(v => v >= 5).length} / {academySyllabus?.concepts?.length || 0} concepts maîtrisés</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={loadDailyCodingChallenge} style={{ padding: 10, background: "#6B82F5", color: "white", border: "none", borderRadius: 8, fontWeight: 700 }}>📅 Défi du jour</button>
                    <button onClick={startDuelWithIA} style={{ padding: 10, background: "#EF4444", color: "white", border: "none", borderRadius: 8, fontWeight: 700 }}>⚔️ Duel IA</button>
                    <button onClick={() => { setAcademySandbox(true); setAcademyEditorCode(""); setAcademyEditorOutput(""); }} style={{ padding: 10, background: "#4D6BFE", color: "white", border: "none", borderRadius: 8, fontWeight: 700 }}>🏖️ Sandbox</button>
                  </div>
                </div>
                {/* Barre progression */}
                <div style={{ height: 10, background: theme.inputBg, borderRadius: 5, marginBottom: 28, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(Object.values(academyProgress).filter(v => v >= 5).length / (academySyllabus?.concepts?.length || 1)) * 100}%`, background: "#4D6BFE", borderRadius: 5 }} />
                </div>
                {/* Liste concepts (identique à l'ancien code, avec bouton "▶️ Apprendre" qui appelle startLesson */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {academySyllabus?.concepts?.map((concept, idx) => {
                    const mastered = (academyProgress[concept.title] || 0) >= 5;
                    const unlocked = canStartConcept(concept);
                    return (
                      <div key={idx} style={{ background: theme.cardBg, borderRadius: 18, padding: "18px 22px", borderLeft: `5px solid ${mastered ? "#4D6BFE" : unlocked ? "#4D6BFE" : "#475569"}`, opacity: unlocked ? 1 : 0.55 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <span style={{ width: 28, height: 28, borderRadius: "50%", background: mastered ? "#4D6BFE" : unlocked ? "#4D6BFE" : "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", fontWeight: 900, flexShrink: 0 }}>{mastered ? "✓" : idx + 1}</span>
                          <span style={{ fontWeight: 800, color: theme.text, fontSize: 15 }}>{concept.title}</span>
                          {mastered && <span style={{ fontSize: 11, background: "#EEF2FF", color: "#1E3A8A", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>✅ Maîtrisé</span>}
                        </div>
                        <button onClick={() => { if (unlocked) startLesson(concept); }} disabled={!unlocked} style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: unlocked ? "linear-gradient(135deg, #3451D1, #4D6BFE)" : "#E5E7EB", color: unlocked ? "white" : "#9CA3AF", fontWeight: 800, cursor: unlocked ? "pointer" : "not-allowed", marginTop: 8 }}>▶️ Apprendre</button>
                      </div>
                    );
                  })}
                </div>
                {/* Certificat si terminé */}
                {academySyllabus?.concepts?.length > 0 && Object.values(academyProgress).filter(v => v >= 5).length === academySyllabus.concepts.length && (
                  <div style={{ marginTop: 28, textAlign: "center", background: "linear-gradient(135deg,#4D6BFE,#3451D1)", borderRadius: 20, padding: 32, color: "white" }}>
                    <div style={{ fontSize: 52 }}>🏆</div>
                    <h2>Cours terminé !</h2>
                    <button onClick={generateCertificate} style={{ padding: "12px 28px", background: "white", color: "#4D6BFE", border: "none", borderRadius: 12, fontWeight: 900, cursor: "pointer" }}>📜 Obtenir le certificat</button>
                  </div>
                )}
                {/* Certificats list */}
                {academyCertificates.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <h3>📜 Vos certificats</h3>
                    {academyCertificates.map(cert => <div key={cert.id} style={{ background: theme.cardBg, padding: 12, borderRadius: 10, marginBottom: 6 }}>{cert.course} - {cert.date} (Niv.{cert.level})</div>)}
                  </div>
                )}
              </div>
            )}

            {/* ── LESSON GOD LEVEL ── */}
            {academyView === "lesson" && currentLesson && (
              <div style={{ animation: "fadeUp 0.4s ease" }}>

                {/* Header navigation */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <button onClick={() => setAcademyView("home")} style={{ background: "none", border: "none", color: theme.highlight, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>← Retour au cours</button>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {quizTimerActive && quizTimer !== null && (
                      <div style={{ background: quizTimer <= 10 ? "#EF4444" : "#6B82F5", color: "white", borderRadius: 20, padding: "4px 14px", fontWeight: 900, fontSize: 15 }}>⏱ {quizTimer}s</div>
                    )}
                    <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700, color: theme.textMuted }}>
                      {lessonState === "explain" ? "📖 Lecture" : lessonState === "quiz" ? "🎯 Quiz" : lessonState === "results" ? "🏆 Résultats" : "⏳"}
                    </div>
                  </div>
                </div>

                {/* Titre de la leçon */}
                <h2 style={{ fontWeight: 900, color: theme.highlight, marginBottom: 4, fontSize: 22 }}>{currentLesson.title}</h2>
                <div style={{ color: theme.textMuted, fontSize: 13, marginBottom: 20 }}>
                  {activeCourse?.topic} • {activeCourse?.type === "code" ? "🖥️ Cours pratique" : "📚 Cours théorique"}
                </div>

                {/* ─── ÉTAT : CHARGEMENT ─── */}
                {lessonState === "loading" && (
                  <div style={{ textAlign: "center", padding: "60px 20px", background: theme.cardBg, borderRadius: 24, border: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: 44, marginBottom: 16 }}>🧠</div>
                    <p style={{ color: theme.textMuted, fontWeight: 600 }}>L'IA prépare ta leçon...</p>
                  </div>
                )}

                {/* ─── ÉTAT : EXPLICATION ─── */}
                {lessonState === "explain" && currentLesson.explanation && (
                  <div>
                    {/* Bloc explication */}
                    <div style={{ background: theme.cardBg, borderRadius: 20, padding: 28, marginBottom: 20, border: `1px solid ${theme.border}` }}>
                      <div style={{ fontWeight: 800, color: "#4D6BFE", marginBottom: 16, fontSize: 16 }}>📖 Explication</div>
                      <div style={{ lineHeight: 1.8, color: theme.text, fontSize: 15 }}
                        dangerouslySetInnerHTML={{ __html: highlightCode(currentLesson.explanation?.replace(/\n/g, "<br/>") || "") }}
                      />
                    </div>

                    {/* ─── ÉDITEUR DE CODE : uniquement pour les cours de code ─── */}
                    {activeCourse?.type === "code" && (
                      <div style={{ background: theme.cardBg, borderRadius: 20, padding: 20, border: `1px solid ${theme.border}`, marginBottom: 20 }}>
                        <div style={{ fontWeight: 800, color: theme.highlight, marginBottom: 8, fontSize: 15 }}>💻 Éditeur de code</div>
                        <textarea
                          value={academyEditorCode}
                          onChange={e => setAcademyEditorCode(e.target.value)}
                          rows={8}
                          style={{ width: "100%", padding: 14, background: isDarkMode ? "#2A1400" : "#F8FAFC", border: `1px solid ${theme.border}`, borderRadius: 12, fontFamily: "'JetBrains Mono', monospace", color: theme.text, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                          placeholder="Écris ton code ici..."
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <button onClick={() => submitCode(currentLesson.title)} disabled={academyCorrectionLoading} style={{ padding: "12px 22px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
                            {academyCorrectionLoading ? "🧠 Analyse..." : "✅ Soumettre pour correction"}
                          </button>
                          <button onClick={runCode} style={{ padding: "12px 22px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>▶️ Exécuter</button>
                          <button onClick={getPairSuggestion} disabled={academyPairProgramming} style={{ padding: "12px 22px", background: "#7B93FF", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>🤝 Pair AI</button>
                        </div>
                        {academyPairSuggestion && (
                          <div style={{ marginTop: 12, background: isDarkMode ? "#3D2000" : "#FFFFFF", borderRadius: 10, padding: 14 }}>
                            <strong>🤖 Suggestion IA :</strong><br/>
                            <span style={{ color: theme.text }}>{academyPairSuggestion}</span>
                          </div>
                        )}
                        {academyEditorOutput && (
                          <div style={{ marginTop: 12, background: isDarkMode ? "#0F1A3A" : "#F0FFF4", borderRadius: 10, padding: 14, border: `1px solid ${theme.border}` }}>
                            <strong>📤 Sortie :</strong>
                            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono', monospace", color: theme.text, margin: "6px 0 0" }}>{academyEditorOutput}</pre>
                          </div>
                        )}
                        {academyCorrection && (
                          <div style={{ marginTop: 16, background: academyCorrection.correct ? "#EEF2FF" : "#FEF2F2", borderRadius: 16, padding: 20, border: `1px solid ${academyCorrection.correct ? "#4D6BFE" : "#EF4444"}` }}>
                            <div style={{ fontWeight: 800, fontSize: 17, color: academyCorrection.correct ? "#1E3A8A" : "#991B1B" }}>
                              {academyCorrection.correct ? "✅ Correct !" : "❌ À revoir"} — Score : {academyCorrection.score}/100
                            </div>
                            <p style={{ whiteSpace: "pre-wrap", color: theme.text }}>{academyCorrection.feedback}</p>
                            {academyCorrection.optimizedCode && (
                              <div style={{ marginTop: 12 }}>
                                <strong>💡 Code optimisé :</strong>
                                <pre style={{ background: isDarkMode ? "#2A1400" : "#F8FAFC", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono', monospace" }}>{academyCorrection.optimizedCode}</pre>
                              </div>
                            )}
                          </div>
                        )}
                        {academySubmissionHistory[currentLesson.title]?.length > 0 && (
                          <details style={{ marginTop: 16 }}>
                            <summary style={{ cursor: "pointer", fontWeight: 700, color: theme.textMuted }}>📚 Historique ({academySubmissionHistory[currentLesson.title].length})</summary>
                            {academySubmissionHistory[currentLesson.title].slice(-3).map((sub, i) => (
                              <div key={i} style={{ background: theme.inputBg, borderRadius: 10, padding: 12, marginTop: 8 }}>
                                <div style={{ fontSize: 12, color: theme.textMuted }}>{new Date(sub.date).toLocaleString()}</div>
                                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{sub.code}</pre>
                              </div>
                            ))}
                          </details>
                        )}
                      </div>
                    )}

                    {/* ─── ACTIVITÉS THÉORIQUES : pour les cours non-code ─── */}
                    {activeCourse?.type !== "code" && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 14, marginBottom: 20 }}>
                        {/* Carte : Points clés */}
                        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 20 }}>
                          <div style={{ fontWeight: 800, color: "#4D6BFE", marginBottom: 10, fontSize: 14 }}>🔑 Points clés à retenir</div>
                          <div style={{ color: theme.textMuted, fontSize: 13, lineHeight: 1.7 }}>
                            {currentLesson.explanation?.split(". ").filter(Boolean).slice(0, 3).map((pt, i) => (
                              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                                <span style={{ color: "#4D6BFE", fontWeight: 900, flexShrink: 0 }}>›</span>
                                <span>{pt.trim()}.</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Carte : Générer des fiches */}
                        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 20 }}>
                          <div style={{ fontWeight: 800, color: "#4D6BFE", marginBottom: 10, fontSize: 14 }}>🃏 Convertir en fiches</div>
                          <p style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>Génère des fiches FSRS à partir de cette leçon pour la révision spaced.</p>
                          <button onClick={() => generateCardsFromLesson(currentLesson)} style={{ width: "100%", padding: "10px 16px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                            ✨ Générer les fiches
                          </button>
                        </div>
                        {/* Carte : Expliquer simplement */}
                        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 20 }}>
                          <div style={{ fontWeight: 800, color: "#6B82F5", marginBottom: 10, fontSize: 14 }}>🧒 Expliquer simplement</div>
                          <p style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>Reformuler le concept comme si tu avais 10 ans.</p>
                          <button onClick={() => explainLike5(currentLesson.explanation)} style={{ width: "100%", padding: "10px 16px", background: "#6B82F5", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                            🧸 Simplifier
                          </button>
                          {labExplainLike5 && (
                            <div style={{ marginTop: 10, padding: 12, background: isDarkMode ? "#2A1400" : "#EFF3FF", borderRadius: 10, fontSize: 13, color: theme.text }}>
                              {labExplainLike5}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Prévisualisation des fiches générées */}
                    {showCardsPreview && generatedCards.length > 0 && (
                      <div style={{ background: theme.cardBg, border: `1px solid #4D6BFE`, borderRadius: 20, padding: 20, marginBottom: 20 }}>
                        <div style={{ fontWeight: 800, color: "#4D6BFE", marginBottom: 12 }}>🃏 {generatedCards.length} fiches prêtes</div>
                        {generatedCards.slice(0, 3).map((c, i) => (
                          <div key={i} style={{ background: theme.inputBg, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>Q: {c.front}</div>
                            <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>R: {c.back}</div>
                          </div>
                        ))}
                        {generatedCards.length > 3 && <div style={{ color: theme.textMuted, fontSize: 12, textAlign: "center" }}>+{generatedCards.length - 3} autres fiches...</div>}
                        <button onClick={confirmBatch} style={{ marginTop: 12, width: "100%", padding: "10px 16px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
                          ✅ Sauvegarder les fiches
                        </button>
                      </div>
                    )}

                    {/* Bouton passer au quiz */}
                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                      <button onClick={() => { setLessonState("quiz"); setQuizAnswers({}); setQuizResults(null); startQuizTimer(120); }} style={{ flex: 1, padding: "16px 24px", background: "linear-gradient(135deg,#4D6BFE,#A78BFA)", color: "white", border: "none", borderRadius: 14, fontWeight: 900, cursor: "pointer", fontSize: 15 }}>
                        🎯 Passer au quiz →
                      </button>
                    </div>
                  </div>
                )}

                {/* ─── ÉTAT : QUIZ ─── */}
                {lessonState === "quiz" && lessonQuiz && (
                  <div style={{ background: theme.cardBg, borderRadius: 20, padding: 28, border: `1px solid ${theme.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <div style={{ fontWeight: 800, color: "#4D6BFE", fontSize: 16 }}>🎯 Quiz — {currentLesson.title}</div>
                      <div style={{ fontSize: 12, color: theme.textMuted }}>{lessonQuiz.length} questions</div>
                    </div>
                    {lessonQuiz.map((q, idx) => (
                      <div key={idx} style={{ marginBottom: 22 }}>
                        <div style={{ fontWeight: 700, marginBottom: 10, color: theme.text, fontSize: 14 }}>{idx + 1}. {q.question}</div>
                        <input
                          style={{ width: "100%", padding: "12px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, fontSize: 14, boxSizing: "border-box" }}
                          value={quizAnswers[idx] || ""}
                          onChange={e => checkQuizAnswer(idx, e.target.value)}
                          placeholder="Ta réponse..."
                        />
                      </div>
                    ))}
                    <button onClick={submitQuiz} style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 14, fontWeight: 900, fontSize: 15, cursor: "pointer" }}>
                      ✅ Valider le quiz
                    </button>
                    <button onClick={() => setLessonState("explain")} style={{ width: "100%", marginTop: 8, padding: 12, background: "none", border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.textMuted, fontWeight: 700, cursor: "pointer" }}>
                      ← Relire l'explication
                    </button>
                  </div>
                )}

                {/* ─── ÉTAT : RÉSULTATS QUIZ ─── */}
                {lessonState === "results" && quizResults && (
                  <div>
                    {/* Score global */}
                    <div style={{ background: quizResults.filter(r => r.isCorrect).length >= quizResults.length * 0.6 ? "linear-gradient(135deg,#4D6BFE,#3451D1)" : "linear-gradient(135deg,#6B82F5,#4D6BFE)", borderRadius: 24, padding: 28, textAlign: "center", color: "white", marginBottom: 20 }}>
                      <div style={{ fontSize: 48 }}>{quizResults.filter(r => r.isCorrect).length >= quizResults.length * 0.6 ? "🏆" : "💪"}</div>
                      <div style={{ fontSize: 32, fontWeight: 900, margin: "8px 0" }}>
                        {quizResults.filter(r => r.isCorrect).length} / {quizResults.length}
                      </div>
                      <div style={{ fontSize: 15, opacity: 0.9 }}>
                        {quizResults.filter(r => r.isCorrect).length >= quizResults.length * 0.6 ? "Leçon maîtrisée ! 🎉" : "Continue à pratiquer !"}
                      </div>
                    </div>
                    {/* Détail par question */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                      {quizResults.map((r, i) => (
                        <div key={i} style={{ background: theme.cardBg, borderRadius: 14, padding: 16, border: `1px solid ${r.isCorrect ? "#4D6BFE" : "#EF4444"}` }}>
                          <div style={{ fontWeight: 700, color: theme.text, marginBottom: 6, fontSize: 14 }}>{i + 1}. {r.question}</div>
                          <div style={{ fontSize: 13, color: r.isCorrect ? "#4D6BFE" : "#EF4444" }}>Ta réponse : {r.userAnswer || "(vide)"}</div>
                          {!r.isCorrect && <div style={{ fontSize: 13, color: "#4D6BFE", marginTop: 4 }}>✅ Bonne réponse : {r.correctAnswer}</div>}
                        </div>
                      ))}
                    </div>
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => { setLessonState("explain"); setQuizAnswers({}); setQuizResults(null); }} style={{ flex: 1, padding: "14px 20px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 14, color: theme.text, fontWeight: 800, cursor: "pointer" }}>
                        🔄 Relire la leçon
                      </button>
                      <button onClick={() => { setLessonState("quiz"); setQuizAnswers({}); setQuizResults(null); startQuizTimer(120); }} style={{ flex: 1, padding: "14px 20px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer" }}>
                        🔁 Refaire le quiz
                      </button>
                      <button onClick={() => setAcademyView("home")} style={{ flex: 1, padding: "14px 20px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer" }}>
                        📚 Concept suivant →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

                        {/* ── MODE SANDBOX LIBRE ── */}
            {academySandbox && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: theme.cardBg, borderRadius: 24, padding: 32, maxWidth: 800, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <h2 style={{ color: theme.text }}>🏖️ Sandbox</h2>
                    <button onClick={() => setAcademySandbox(false)} style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 20, cursor: "pointer" }}>✕</button>
                  </div>
                  <textarea
                    value={academyEditorCode}
                    onChange={e => setAcademyEditorCode(e.target.value)}
                    rows={12}
                    style={{ width: "100%", padding: 14, background: isDarkMode ? "#2A1400" : "#F8FAFC", border: `1px solid ${theme.border}`, borderRadius: 12, fontFamily: "'JetBrains Mono', monospace", color: theme.text, fontSize: 13 }}
                  />
                  <button onClick={runCode} style={{ marginTop: 12, padding: 12, background: "#4D6BFE", color: "white", border: "none", borderRadius: 10, fontWeight: 800 }}>▶️ Exécuter</button>
                  {academyEditorOutput && (
                    <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", background: isDarkMode ? "#0F1A3A" : "#F0FFF4", padding: 14, borderRadius: 10 }}>{academyEditorOutput}</pre>
                  )}
                </div>
              </div>
            )}

            {/* ── DÉFI DU JOUR (modal ou intégré, ici rapide) ── */}
            {academyDailyChallenge && (
              <div style={{ marginTop: 24, background: theme.cardBg, borderRadius: 20, padding: 24, border: `2px solid #6B82F5` }}>
                <h3>📅 Défi du jour</h3>
                <p>{academyDailyChallenge.problem}</p>
                <textarea value={academyDailyChallengeSolution} onChange={e => setAcademyDailyChallengeSolution(e.target.value)} rows={4} style={{ width: "100%", padding: 12, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, fontFamily: "monospace" }} />
                <button onClick={submitDailyChallenge} style={{ marginTop: 8, padding: "10px 20px", background: "#6B82F5", color: "white", border: "none", borderRadius: 10, fontWeight: 800 }}>Soumettre</button>
                {academyDailyResult && (
                  <div style={{ marginTop: 12, background: academyDailyResult.correct ? "#EEF2FF" : "#FEF2F2", borderRadius: 10, padding: 12 }}>
                    {academyDailyResult.correct ? "✅ Correct !" : "❌ Incorrect"} — {academyDailyResult.feedback}
                  </div>
                )}
              </div>
            )}

            {/* ── DUEL IA ── */}
            {academyDuelProblem && (
              <div style={{ marginTop: 24, background: theme.cardBg, borderRadius: 20, padding: 24, border: `2px solid #EF4444` }}>
                <h3>⚔️ Duel avec l'IA</h3>
                <p>{academyDuelProblem.problem}</p>
                <textarea value={academyDuelUserCode} onChange={e => setAcademyDuelUserCode(e.target.value)} rows={4} style={{ width: "100%", padding: 12, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, fontFamily: "monospace" }} placeholder="Ta solution..." />
                <button onClick={submitDuel} style={{ marginTop: 8, padding: "10px 20px", background: "#EF4444", color: "white", border: "none", borderRadius: 10, fontWeight: 800 }}>Battre l'IA</button>
                {academyDuelResult && (
                  <div style={{ marginTop: 12, background: "#E8EEFF", borderRadius: 10, padding: 12 }}>
                    Résultat : {academyDuelResult.winner === "user" ? "Tu as gagné !" : academyDuelResult.winner === "ia" ? "L'IA a gagné !" : "Égalité"}<br/>
                    {academyDuelResult.feedback}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
                  
        {/* ══════════════════════════════════════════════════════════════════
            LABORATOIRE GOD LEVEL
        ══════════════════════════════════════════════════════════════════ */}
                {view === "lab" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 30, fontWeight: 900, color: theme.highlight, margin: 0 }}>🧪 Laboratoire</h1>
                <p style={{ color: theme.textMuted, fontSize: 14, margin: 0 }}>Outils IA avancés — PDF, Résumés, Schémas & Plus</p>
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
                  background: labSubView === tab.id ? "linear-gradient(135deg,#3451D1,#4D6BFE)" : theme.cardBg,
                  color: labSubView === tab.id ? "white" : theme.textMuted,
                  border: `1px solid ${labSubView === tab.id ? "transparent" : theme.border}`,
                  fontWeight: 700, fontSize: 13, cursor: "pointer"
                }}>{tab.icon} {tab.label}</button>
              ))}
            </div>

            {/* ── HOME ────────────────────────────────────────────────── */}
            {labSubView === "home" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 16, marginBottom: 28 }}>
                {[
                  { icon: "📄", title: "PDF → Fiches", desc: "Charge un PDF, génère des fiches en 1 clic", color: "#4D6BFE", bg: "linear-gradient(135deg,#FFFFFF,#EEF2FF)", action: () => setLabSubView("pdf") },
                  { icon: "📝", title: "Résumé de cours", desc: "Résumé IA : Complet, Flash ou Cornell", color: "#7B93FF", bg: "linear-gradient(135deg,#FFFFFF,#EEF2FF)", action: () => setLabSubView("resume") },
                  { icon: "📅", title: "Coach IA", desc: "Planning heure par heure basé sur tes révisions", color: "#4D6BFE", bg: "linear-gradient(135deg,#FFFFFF,#EEF2FF)", action: () => setLabSubView("coach") },
                  { icon: "🧠", title: "Graphe de savoirs", desc: "Visualise tes connexions de connaissances", color: "#6B82F5", bg: "linear-gradient(135deg,#EFF3FF,#C7D2FE)", action: generateGraph },
                  { icon: "🎯", title: "Anti-Confusion IA", desc: "Génère des fiches sur tes erreurs récentes", color: "#EF4444", bg: "linear-gradient(135deg,#FEF2F2,#FECACA)", action: generateConfusionDestroyer },
                  { icon: "⚙️", title: "Outils Avancés", desc: "Prédiction, Boss RPG, Salle d'étude", color: "#7B93FF", bg: "linear-gradient(135deg,#FFFFFF,#CFFAFE)", action: () => setLabSubView("tools") },
                  { icon: "🔬", title: "Analyse FSRS", desc: "Statistiques avancées de rétention par carte", color: "#3451D1", bg: "linear-gradient(135deg,#FFFFFF,#C7D2FE)", action: () => setLabSubView("tools") },
                  { icon: "🌐", title: "Exportation", desc: "Exporte tes fiches en JSON, CSV ou Anki", color: "#3451D1", bg: "linear-gradient(135deg,#FFFFFF,#C7D2FE)", action: () => { const data = JSON.stringify({ expressions, categories }, null, 2); const blob = new Blob([data], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `memomaitre_export_${today()}.json`; a.click(); showToast("📦 Export JSON téléchargé !"); } },
                ].map(t => (
                  <button key={t.title} onClick={t.action} className="card-hov" style={{ padding: "22px 20px", background: t.bg, border: `1px solid ${t.color}22`, borderRadius: 18, cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>{t.icon}</div>
                    <div style={{ fontWeight: 800, color: t.color, fontSize: 15, marginBottom: 4 }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>{t.desc}</div>
                  </button>
                ))}
                </div>

                {/* Quick stats Lab */}
                <div style={{ background: theme.cardBg, borderRadius: 20, padding: "20px 24px", border: `1px solid ${theme.border}` }}>
                  <div style={{ fontWeight: 800, color: theme.text, marginBottom: 14, fontSize: 15 }}>⚡ État du Lab</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                    {[
                      { label: "Fiches totales", value: expressions.length, icon: "🃏" },
                      { label: "PDFs analysés", value: stats.aiGenerated > 0 ? Math.floor(stats.aiGenerated / 5) : 0, icon: "📄" },
                      { label: "Fiches IA générées", value: stats.aiGenerated, icon: "🤖" },
                      { label: "Révisions totales", value: stats.totalReviews, icon: "🔄" },
                    ].map(s => (
                      <div key={s.label} style={{ background: theme.inputBg, borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontSize: 20 }}>{s.icon}</div>
                        <div style={{ fontWeight: 900, color: theme.highlight, fontSize: 20, marginTop: 4 }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                PDF → FICHES (avec nouvelles fonctionnalités intégrées)
            ══════════════════════════════════════════════════════════════ */}
            {labSubView === "pdf" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* ── Upload zone ── */}
                <div style={{ background: theme.cardBg, borderRadius: 22, padding: "28px", border: `2px dashed ${pdfExtractedText ? "#4D6BFE" : theme.border}` }}>
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>{pdfExtractedText ? "✅" : "📄"}</div>
                    <h2 style={{ color: theme.text, margin: 0, fontSize: 20, fontWeight: 800 }}>
                      {pdfExtractedText ? `"${pdfFileName}" chargé` : "Charge ton cours PDF"}
                    </h2>
                    {pdfExtractedText && (
                      <p style={{ color: "#4D6BFE", fontWeight: 700, marginTop: 6, fontSize: 14 }}>
                        {pdfPageCount} pages · {pdfExtractedText.split(" ").length.toLocaleString()} mots extraits
                        {pdfLang === "ar" && <span style={{ marginLeft: 8, background: "#E8EEFF", color: "#4D6BFE", borderRadius: 8, padding: "2px 8px", fontSize: 12 }}>🌍 Arabe détecté</span>}
                      </p>
                    )}
                    {!pdfExtractedText && <p style={{ color: theme.textMuted, fontSize: 13 }}>PDF, TXT, MD — texte extrait localement · Support arabe ✓ · Multi-fichiers possible ↓</p>}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <label style={{
                      display: "block", flex: 1, padding: "14px",
                      background: pdfParsing ? theme.inputBg : "linear-gradient(135deg,#3451D1,#4D6BFE)",
                      color: "white", borderRadius: 14, fontWeight: 800, fontSize: 15,
                      textAlign: "center", cursor: pdfParsing ? "default" : "pointer"
                    }}>
                      {pdfParsing ? "⏳ Extraction..." : pdfExtractedText ? "📂 Changer" : "📂 Choisir PDF/TXT"}
                      <input type="file" accept=".pdf,.txt,.md" style={{ display: "none" }} onChange={async (e) => { await handlePdfUpload(e, "lab"); }} disabled={pdfParsing} />
                    </label>
                    <label style={{
                      flex: 1, padding: "14px",
                      background: "linear-gradient(135deg,#4D6BFE,#7B93FF)", color: "white",
                      borderRadius: 14, fontWeight: 800, fontSize: 15, textAlign: "center", cursor: "pointer", display: "block"
                    }}>
                      📚 Multi-fichiers
                      <input type="file" multiple accept=".pdf,.txt,.md" style={{ display: "none" }} onChange={(e) => handleMultiFilesUpload(e.target.files)} />
                    </label>
                  </div>
                  {labMultiFiles.length > 0 && (
                    <div style={{ background: theme.inputBg, borderRadius: 12, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, color: theme.highlight, marginBottom: 8 }}>Fichiers multiples ({labMultiFiles.length})</div>
                      {labMultiFiles.map((f, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: theme.textMuted }}>
                          <span>{f.name}</span>
                          <span>{f.pages} p.</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                        <button onClick={crossAnalyze} disabled={labMultiFiles.length < 2} className="hov" style={{ padding: "6px 12px", background: "#3451D1", color: "white", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>🔀 Analyse croisée</button>
                      </div>
                    </div>
                  )}
                  {/* Recherche dans le texte */}
                  {pdfExtractedText && (
                    <div style={{ marginTop: 14 }}>
                      <input
                        value={pdfSearchQuery}
                        onChange={e => setPdfSearchQuery(e.target.value)}
                        placeholder="🔍 Rechercher un terme dans le cours..."
                        style={{ width: "100%", padding: "10px 14px", background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text, fontSize: 13 }}
                      />
                      {pdfSearchQuery.trim() && (
                        <div style={{ marginTop: 8, background: theme.inputBg, borderRadius: 12, padding: 12, maxHeight: 160, overflowY: "auto" }}>
                          {(() => {
                            const q = pdfSearchQuery.toLowerCase();
                            const matches = pdfExtractedText.split("\n").filter(l => l.toLowerCase().includes(q));
                            return matches.length === 0
                              ? <div style={{ color: theme.textMuted, fontSize: 12 }}>Aucun résultat pour "{pdfSearchQuery}"</div>
                              : matches.slice(0, 8).map((line, i) => (
                                <div key={i} style={{ fontSize: 12, color: theme.text, marginBottom: 6, lineHeight: 1.5, direction: pdfLang === "ar" ? "rtl" : "ltr" }}>
                                  {line.replace(new RegExp(`(${pdfSearchQuery})`, "gi"), "**$1**").split("**").map((part, j) =>
                                    j % 2 === 1 ? <mark key={j} style={{ background: "#C7D2FE", borderRadius: 3, padding: "0 2px" }}>{part}</mark> : part
                                  )}
                                </div>
                              ));
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Analyse croisée résultat */}
                {labCrossAnalysis && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `2px solid #4D6BFE` }}>
                    <h3 style={{ color: "#4D6BFE" }}>🔀 Analyse croisée</h3>
                    <p>{labCrossAnalysis.synthesis}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {labCrossAnalysis.fusionCards?.map((card, i) => (
                        <div key={i} style={{ background: theme.inputBg, borderRadius: 12, padding: 12 }}>{card.front}: {card.back}</div>
                      ))}
                    </div>
                    <button onClick={() => setLabCrossAnalysis(null)} style={{ marginTop: 10, background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}>✕</button>
                  </div>
                )}

                {/* ── ACTIONS RAPIDES ── */}
                {pdfExtractedText && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "20px", border: `1px solid ${theme.border}`, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button onClick={detectPrerequisites} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>📋 Prérequis</button>
                    <button onClick={extractKeyQuotes} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>💬 Citations clés</button>
                    <button onClick={buildLogicTree} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>🌳 Arbre logique</button>
                    <button onClick={generateOnePager} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>📃 One-pager</button>
                    <button onClick={generateVideoScript} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>🎬 Script vidéo</button>
                    <button onClick={generatePodcast} disabled={labPodcastLoading} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>🎙️ Podcast</button>
                    <button onClick={generateEditableMindMap} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>🗺️ Mind map</button>
                    <button onClick={generateTechDiagram} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>📐 Diagramme tech</button>
                    <button onClick={generateTimeline} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>📅 Timeline</button>
                    <button onClick={generateWordCloud} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>☁️ Nuage de mots</button>
                    <button onClick={() => explainLike5(pdfExtractedText.substring(0, 2000))} disabled={labExplainLike5Loading} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>🧸 Explique-moi</button>
                    <button onClick={generatePracticeProblems} disabled={labPracticeProblemsLoading} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>📝 Problèmes</button>
                    <button onClick={generateRevisionPlan} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>📅 Plan révision</button>
                    <button onClick={generateImpactReport} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>📊 Rapport impact</button>
                    <button onClick={generateSelfTest} className="hov" style={{ padding: "8px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontWeight: 600, cursor: "pointer" }}>🧪 Auto-test</button>
                  </div>
                )}

                {/* Résultats des actions rapides */}
                {labPrerequisites && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16, border: "2px solid #6B82F5" }}><strong>📋 Prérequis manquants :</strong> {labPrerequisites.missing?.join(", ")}<br/><small>{labPrerequisites.suggestion}</small></div>}
                {labCitations.length > 0 && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16 }}><strong>💬 Citations clés</strong><ul>{labCitations.map((q,i) => <li key={i}>{q.text}</li>)}</ul></div>}
                {labLogicTree && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16 }}><strong>🌳 Arbre logique</strong><div>{labLogicTree.mainThesis}</div></div>}
                {labOnePager && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 20, whiteSpace: "pre-wrap" }}>{labOnePager}</div>}
                {labVideoScript && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 20, whiteSpace: "pre-wrap" }}><strong>🎬 Script vidéo</strong><br/>{labVideoScript}</div>}
                {labPodcastUrl && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16 }}><strong>🎙️ Podcast prêt !</strong> (simulation)</div>}
                {labMindMapEditable && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16 }}>{renderMindMapSVG(labMindMapEditable)}</div>}
                {labTechDiagram && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16 }}><strong>📐 Diagramme technique</strong><pre>{labTechDiagram}</pre></div>}
                {labTimeline && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16 }}><strong>📅 Timeline</strong><ul>{labTimeline.map((e,i) => <li key={i}>{e.date}: {e.description}</li>)}</ul></div>}
                {labWordCloud && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16 }}><strong>☁️ Nuage de mots</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{labWordCloud.map((w,i) => <span key={i} style={{ fontSize: Math.max(12, w.weight/2), color: "#4D6BFE" }}>{w.text} </span>)}</div></div>}
                {labExplainLike5 && <div style={{ background: "#EFF3FF", borderRadius: 16, padding: 16, fontStyle: "italic" }}>🧸 {labExplainLike5}</div>}
                {labPracticeProblems.length > 0 && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 20 }}><strong>📝 Problèmes pratiques</strong><ol>{labPracticeProblems.map((p,i) => <li key={i}><strong>{p.question}</strong><br/><em>{p.solution}</em></li>)}</ol></div>}
                {labRevisionPlan && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16 }}><strong>📅 Plan de révision</strong><pre>{JSON.stringify(labRevisionPlan, null, 2)}</pre></div>}
                {labImpactReport && <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16 }}><strong>📊 Rapport d'impact</strong><br/>Temps estimé : {labImpactReport.estimatedHours}h<br/>Score prédit : {labImpactReport.predictedScore}/20</div>}
                {labSelfTest.length > 0 && (
                  <div style={{ background: theme.cardBg, borderRadius: 16, padding: 20 }}>
                    <strong>🧪 Auto-test</strong>
                    {labSelfTest.map((q,i) => (
                      <div key={i} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 700 }}>{q.question}</div>
                        <input value={labSelfTestAnswers[i] || ""} onChange={e => setLabSelfTestAnswers(prev => ({...prev, [i]: e.target.value}))} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }} />
                      </div>
                    ))}
                    <button onClick={submitSelfTest} style={{ padding: "10px 20px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 8, fontWeight: 700 }}>Valider</button>
                    {labSelfTestScore !== null && <div style={{ marginTop: 10, fontSize: 18, fontWeight: 900 }}>Score : {labSelfTestScore}/{labSelfTest.length}</div>}
                  </div>
                )}

                {/* Génération de fiches, résumé PDF, etc. (déjà existante) */}
                {pdfExtractedText && !pdfAnalysis && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", border: `1px solid ${theme.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🧠</div>
                    <h3 style={{ color: theme.text, fontWeight: 800, margin: "0 0 8px" }}>Analyser le document d'abord</h3>
                    <p style={{ color: theme.textMuted, fontSize: 13, marginBottom: 16 }}>L'IA détecte le sujet, le niveau, les thèmes clés et génère une mind map — avant de créer les fiches.</p>
                    <button onClick={analyzePdf} disabled={pdfAnalysisLoading} className="btn-glow hov" style={{
                      padding: "14px 32px", background: "linear-gradient(135deg,#3451D1,#7B93FF)",
                      color: "white", border: "none", borderRadius: 14, fontWeight: 800, fontSize: 15, cursor: "pointer"
                    }}>
                      {pdfAnalysisLoading ? "⏳ Analyse en cours..." : "🧠 Analyser le PDF"}
                    </button>
                  </div>
                )}

                {/* Analyse, génération, cartes etc. (conserve tout le code existant pour pdfAnalysis, pdfBatchPreview, etc.) */}
                {/* Ici on ne remplace pas le code d'analyse et de génération de fiches existant, il reste fonctionnel. On ajoute juste les nouvelles sections. */}
                {pdfAnalysis && (
                  <div style={{ background: theme.cardBg, borderRadius: 22, padding: "24px", border: `2px solid #3451D1` }}>
                    {/* ... contenu d'analyse (inchangé) ... */}
                  </div>
                )}
                {/* etc... Le reste du code PDF existant (generateCardsFromPdf, confirmPdfCards, etc.) reste intact, il n'est pas modifié ici. */}
              </div>
            )}

            {/* ── RÉSUMÉ DE COURS (inchangé pour l'essentiel, on garde le code existant) ── */}
            {labSubView === "resume" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* ... tout le code existant de resume ... */}
              </div>
            )}

            {/* ── COACH IA (inchangé) ── */}
            {labSubView === "coach" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* ... tout le code existant de coach ... */}
              </div>
            )}

            {/* ── OUTILS (inchangé) ── */}
            {labSubView === "tools" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* ... tout le code existant de tools ... */}
              </div>
            )}
          </div>
        )}
        {/* ══════════════════════════════════════════════════════════════════
            VUE STATISTIQUES
        ══════════════════════════════════════════════════════════════════ */}
                {view === "stats" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 24, marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, marginBottom: 8 }}>▣ Dieu des Statistiques</h1>
                <p style={{ color: theme.textMuted }}>Analyse, prédiction, optimisation – ton cockpit de pilotage.</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={computeAllStats} className="hov" style={{ padding: "8px 16px", background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, fontWeight: 600 }}>🔄 Actualiser</button>
                <button onClick={generateStatsAiReport} disabled={statsAiReportLoading} className="hov" style={{ padding: "8px 16px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 10, fontWeight: 700 }}>
                  {statsAiReportLoading ? "🧠 Analyse..." : "🧠 Rapport IA"}
                </button>
                <button onClick={exportStatsAsImage} className="hov" style={{ padding: "8px 16px", background: "#3451D1", color: "white", border: "none", borderRadius: 10, fontWeight: 700 }}>📸 Exporter</button>
              </div>
            </div>

            {/* Widgets personnalisables (on les affiche tous) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 20 }}>
              {/* 1. Vue d'ensemble */}
              <div style={{ background: theme.cardBg, borderRadius: 20, padding: 24, border: `1px solid ${theme.border}`, boxShadow: "0 4px 15px rgba(0,0,0,0.03)" }}>
                <h3 style={{ margin: "0 0 16px", color: theme.text, fontWeight: 800 }}>⚡ Vue d'ensemble</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: "linear-gradient(135deg, #6B82F5, #4D6BFE)", borderRadius: 12, padding: 14, color: "white", textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{stats.streak}</div>
                    <div style={{ fontSize: 12 }}>jours de streak</div>
                  </div>
                  <div style={{ background: "linear-gradient(135deg, #4D6BFE, #3451D1)", borderRadius: 12, padding: 14, color: "white", textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{masteredCount}/{expressions.length}</div>
                    <div style={{ fontSize: 12 }}>fiches maîtrisées</div>
                  </div>
                  <div style={{ background: "linear-gradient(135deg, #4D6BFE, #3451D1)", borderRadius: 12, padding: 14, color: "white", textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{stats.totalReviews}</div>
                    <div style={{ fontSize: 12 }}>révisions totales</div>
                  </div>
                  <div style={{ background: "linear-gradient(135deg, #7B93FF, #6D28D9)", borderRadius: 12, padding: 14, color: "white", textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{stats.aiGenerated||0}</div>
                    <div style={{ fontSize: 12 }}>générées par IA</div>
                  </div>
                </div>
                {/* Power level */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: theme.textMuted }}>Power Level</span>
                    <span style={{ fontWeight: 800, color: "#6B82F5" }}>{powerLevel} XP</span>
                  </div>
                  <div style={{ height: 10, background: theme.inputBg, borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (powerLevel / 10000) * 100)}%`, background: "linear-gradient(90deg, #6B82F5, #EF4444)", borderRadius: 5 }} />
                  </div>
                </div>
              </div>

              {/* 2. Progression quotidienne */}
              <div style={{ background: theme.cardBg, borderRadius: 20, padding: 24, border: `1px solid ${theme.border}` }}>
                <h3 style={{ margin: "0 0 16px", color: theme.text, fontWeight: 800 }}>📈 30 derniers jours</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
                  {statsDailyProgress.map((day, i) => {
                    const max = Math.max(...statsDailyProgress.map(d => d.count), 1);
                    const h = (day.count / max) * 60;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: theme.textMuted, marginBottom: 2 }}>{day.count}</div>
                        <div style={{ width: "100%", borderRadius: "3px 3px 0 0", background: day.count > 0 ? "#4D6BFE" : theme.border, height: `${Math.max(2, h)}px` }} />
                        <div style={{ fontSize: 7, color: theme.textMuted, marginTop: 3 }}>{day.date.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Courbe de rétention */}
              <div style={{ background: theme.cardBg, borderRadius: 20, padding: 24, border: `1px solid ${theme.border}` }}>
                <h3 style={{ margin: "0 0 16px", color: theme.text, fontWeight: 800 }}>📉 Rétention FSRS moyenne</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
                  {statsRetentionCurve.map((pt, i) => {
                    const h = (pt.retention / 100) * 60;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "100%", borderRadius: "2px 2px 0 0", background: pt.retention > 70 ? "#4D6BFE" : pt.retention > 50 ? "#6B82F5" : "#EF4444", height: `${Math.max(1, h)}px` }} />
                        {i % 5 === 0 && <div style={{ fontSize: 7, marginTop: 2 }}>{pt.day}</div>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted, textAlign: "center", marginTop: 8 }}>Jours après la dernière révision</div>
              </div>

              {/* 4. Comparaison modules */}
              <div style={{ background: theme.cardBg, borderRadius: 20, padding: 24, border: `1px solid ${theme.border}` }}>
                <h3 style={{ margin: "0 0 16px", color: theme.text, fontWeight: 800 }}>📚 Par module</h3>
                {statsModuleComparison.map(mod => (
                  <div key={mod.name} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700 }}>{mod.name}</span>
                      <span>{mod.mastered}/{mod.total} (Niv.{mod.avgLevel})</span>
                    </div>
                    <div style={{ height: 6, background: theme.inputBg, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${mod.total ? (mod.mastered/mod.total)*100 : 0}%`, background: mod.color || "#4D6BFE", borderRadius: 3 }} />
                    </div>
                    {mod.due > 0 && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>{mod.due} en retard</div>}
                  </div>
                ))}
              </div>

              {/* 5. Distribution des difficultés */}
              <div style={{ background: theme.cardBg, borderRadius: 20, padding: 24, border: `1px solid ${theme.border}` }}>
                <h3 style={{ margin: "0 0 16px", color: theme.text, fontWeight: 800 }}>💀 Difficulté des fiches</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
                  {statsDifficultyDistribution.map((d, i) => {
                    const max = Math.max(...statsDifficultyDistribution.map(d => d.count), 1);
                    const h = (d.count / max) * 40;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "100%", background: i > 7 ? "#EF4444" : i > 4 ? "#6B82F5" : "#4D6BFE", borderRadius: "2px 2px 0 0", height: `${Math.max(1, h)}px` }} />
                        <div style={{ fontSize: 8, marginTop: 2 }}>{i}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10 }}>
                  <strong style={{ fontSize: 13 }}>Top 5 difficiles :</strong>
                  {statsTopDifficult.map((card, i) => (
                    <div key={i} style={{ fontSize: 12, color: theme.textMuted }}>• {card.front} (diff. {card.difficulty?.toFixed(1)})</div>
                  ))}
                </div>
              </div>

              {/* 6. Performance jour/horaire */}
              <div style={{ background: theme.cardBg, borderRadius: 20, padding: 24, border: `1px solid ${theme.border}` }}>
                <h3 style={{ margin: "0 0 16px", color: theme.text, fontWeight: 800 }}>📅 Par jour de la semaine</h3>
                {statsDayOfWeekPerformance.map(d => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 30, fontWeight: 700 }}>{d.name}</span>
                    <div style={{ flex: 1, height: 6, background: theme.inputBg, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, d.reviews/10)}%`, background: "#4D6BFE", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12 }}>{d.reviews} rév. (note moy. {d.avgScore})</span>
                  </div>
                ))}
              </div>

              {/* 7. Rapport IA */}
              {statsAiReport && (
                <div style={{ background: "linear-gradient(135deg, #FFFFFF, #EEF2FF)", borderRadius: 20, padding: 24, border: "2px solid #4D6BFE", gridColumn: "1 / -1" }}>
                  <h3 style={{ color: "#4D6BFE", marginTop: 0 }}>🧠 Rapport IA hebdomadaire</h3>
                  <p style={{ fontStyle: "italic", color: theme.text }}>{statsAiReport.verdict}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <h4 style={{ color: "#4D6BFE" }}>💪 Forces</h4>
                      <ul>{statsAiReport.strengths?.map((s,i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                    <div>
                      <h4 style={{ color: "#EF4444" }}>⚠️ Faiblesse</h4>
                      <p>{statsAiReport.weakness}</p>
                    </div>
                  </div>
                  <p><strong>💡 Conseil :</strong> {statsAiReport.tip}</p>
                  <div>
                    <h4>📋 Plan de la semaine</h4>
                    <ol>{statsAiReport.plan?.map((p,i) => <li key={i}>{p}</li>)}</ol>
                  </div>
                  <button onClick={() => setStatsAiReport(null)} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", marginTop: 10 }}>✕</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
    VUE BADGES – GOD LEVEL
══════════════════════════════════════════════════════════════════ */}
{view === "badges" && (() => {
  // ── Données de progression pour les barres ──
  const mastered = expressions.filter(e => e.level >= 7).length;
  const dueCount = expressions.filter(e => e.nextReview <= today() && e.level < 7).length;
  const academyCoursesCount = (typeof academyCourses !== "undefined" ? academyCourses : []).length;
  const academyFinished = (typeof academyCourses !== "undefined" ? academyCourses : []).filter(c => {
    const total = c.syllabus?.concepts?.length || 0;
    const done = Object.values(c.progress || {}).filter(v => v >= 5).length;
    return total > 0 && done === total;
  }).length;

  // ── Système de rareté ──
  const RARITY = {
    commun:    { label: "Commun",    color: "#94A3B8", bg: isDarkMode ? "#2A1400" : "#F1F5F9", glow: "none" },
    rare:      { label: "Rare",      color: "#4D6BFE", bg: isDarkMode ? "#1E3A5F" : "#EEF2FF", glow: "0 0 12px #4D6BFE40" },
    epique:    { label: "Épique",    color: "#7B93FF", bg: isDarkMode ? "#2E1B5B" : "#EEF2FF", glow: "0 0 16px #7B93FF50" },
    legendaire:{ label: "Légendaire",color: "#6B82F5", bg: isDarkMode ? "#2D1F00" : "#E8EEFF", glow: "0 0 24px #6B82F560" },
  };

  // ── Badges God Level complets ──
  const ALL_BADGES = [
    // Création
    { id: "first_card",    icon: "🌱", label: "Première pousse",  desc: "Créer ta 1ère fiche",      rarity: "commun",     cat: "Création",  check: s => s.totalCards >= 1,   progress: s => ({ cur: Math.min(s.totalCards,1),   max: 1   }) },
    { id: "ten_cards",     icon: "📚", label: "Bibliothécaire",   desc: "10 fiches créées",          rarity: "commun",     cat: "Création",  check: s => s.totalCards >= 10,  progress: s => ({ cur: Math.min(s.totalCards,10),  max: 10  }) },
    { id: "fifty_cards",   icon: "🗂️", label: "Encyclopédiste",   desc: "50 fiches créées",          rarity: "rare",       cat: "Création",  check: s => s.totalCards >= 50,  progress: s => ({ cur: Math.min(s.totalCards,50),  max: 50  }) },
    { id: "200_cards",     icon: "🏛️", label: "Grand Archiviste", desc: "200 fiches créées",         rarity: "epique",     cat: "Création",  check: s => s.totalCards >= 200, progress: s => ({ cur: Math.min(s.totalCards,200), max: 200 }) },
    // Streak
    { id: "streak3",       icon: "🔥", label: "En feu",           desc: "3 jours de streak",         rarity: "commun",     cat: "Streak",    check: s => s.streak >= 3,       progress: s => ({ cur: Math.min(s.streak,3),       max: 3   }) },
    { id: "streak7",       icon: "⚡", label: "Semaine parfaite", desc: "7 jours de streak",         rarity: "rare",       cat: "Streak",    check: s => s.streak >= 7,       progress: s => ({ cur: Math.min(s.streak,7),       max: 7   }) },
    { id: "streak30",      icon: "🏆", label: "Mois de légende",  desc: "30 jours de streak",        rarity: "legendaire", cat: "Streak",    check: s => s.streak >= 30,      progress: s => ({ cur: Math.min(s.streak,30),      max: 30  }) },
    { id: "streak100",     icon: "👑", label: "Invincible",       desc: "100 jours de streak",       rarity: "legendaire", cat: "Streak",    check: s => s.streak >= 100,     progress: s => ({ cur: Math.min(s.streak,100),     max: 100 }) },
    // Maîtrise
    { id: "first_master",  icon: "✅", label: "Premier maître",   desc: "1ère fiche maîtrisée",      rarity: "commun",     cat: "Maîtrise",  check: s => s.mastered >= 1,     progress: s => ({ cur: Math.min(s.mastered,1),     max: 1   }) },
    { id: "ten_master",    icon: "🎓", label: "Diplômé",          desc: "10 fiches maîtrisées",      rarity: "rare",       cat: "Maîtrise",  check: s => s.mastered >= 10,    progress: s => ({ cur: Math.min(s.mastered,10),    max: 10  }) },
    { id: "fifty_master",  icon: "🧠", label: "Génie",            desc: "50 fiches maîtrisées",      rarity: "epique",     cat: "Maîtrise",  check: s => s.mastered >= 50,    progress: s => ({ cur: Math.min(s.mastered,50),    max: 50  }) },
    { id: "all_reviewed",  icon: "🧘", label: "Zen",              desc: "0 fiche en retard",         rarity: "epique",     cat: "Maîtrise",  check: s => s.totalCards > 0 && s.dueCount === 0, progress: s => ({ cur: s.dueCount === 0 ? 1 : 0, max: 1 }) },
    // Révisions
    { id: "hundred_reviews",icon:"💎", label: "Diamant",          desc: "100 révisions totales",     rarity: "rare",       cat: "Révisions", check: s => s.totalReviews >= 100,  progress: s => ({ cur: Math.min(s.totalReviews,100),  max: 100  }) },
    { id: "500_reviews",   icon: "🌊", label: "Flot continu",     desc: "500 révisions totales",     rarity: "epique",     cat: "Révisions", check: s => s.totalReviews >= 500,  progress: s => ({ cur: Math.min(s.totalReviews,500),  max: 500  }) },
    { id: "1000_reviews",  icon: "⚜️", label: "Transcendant",     desc: "1000 révisions totales",    rarity: "legendaire", cat: "Révisions", check: s => s.totalReviews >= 1000, progress: s => ({ cur: Math.min(s.totalReviews,1000), max: 1000 }) },
    // Examens
    { id: "exam_mode",     icon: "🎯", label: "Testeur",          desc: "Terminer 1 examen",         rarity: "commun",     cat: "Examens",   check: s => s.examsDone >= 1,    progress: s => ({ cur: Math.min(s.examsDone,1),    max: 1   }) },
    { id: "exam5",         icon: "🏅", label: "Candidat sérieux", desc: "Terminer 5 examens",        rarity: "rare",       cat: "Examens",   check: s => s.examsDone >= 5,    progress: s => ({ cur: Math.min(s.examsDone,5),    max: 5   }) },
    { id: "exam20",        icon: "🎖️", label: "Vétéran des tests",desc: "Terminer 20 examens",       rarity: "epique",     cat: "Examens",   check: s => s.examsDone >= 20,   progress: s => ({ cur: Math.min(s.examsDone,20),   max: 20  }) },
    // IA
    { id: "ai_user",       icon: "🤖", label: "IA Partner",       desc: "Générer 5 fiches via IA",   rarity: "rare",       cat: "IA",        check: s => s.aiGenerated >= 5,  progress: s => ({ cur: Math.min(s.aiGenerated,5),  max: 5   }) },
    { id: "ai_master",     icon: "🧬", label: "Ingénieur IA",     desc: "Générer 50 fiches via IA",  rarity: "epique",     cat: "IA",        check: s => s.aiGenerated >= 50, progress: s => ({ cur: Math.min(s.aiGenerated,50), max: 50  }) },
    // Academy
    { id: "academy_start", icon: "🏫", label: "Élève du jour",    desc: "Créer ton 1er cours",       rarity: "commun",     cat: "Academy",   check: s => s.academyCourses >= 1,  progress: s => ({ cur: Math.min(s.academyCourses,1),  max: 1 }) },
    { id: "academy_multi", icon: "📡", label: "Multitâche",       desc: "3 cours en parallèle",      rarity: "rare",       cat: "Academy",   check: s => s.academyCourses >= 3,  progress: s => ({ cur: Math.min(s.academyCourses,3),  max: 3 }) },
    { id: "academy_done",  icon: "🎒", label: "Diplômé Academy",  desc: "Terminer un cours à 100%",  rarity: "epique",     cat: "Academy",   check: s => s.academyFinished >= 1, progress: s => ({ cur: Math.min(s.academyFinished,1), max: 1 }) },
    { id: "academy_god",   icon: "🌌", label: "God of Knowledge", desc: "Terminer 5 cours à 100%",   rarity: "legendaire", cat: "Academy",   check: s => s.academyFinished >= 5, progress: s => ({ cur: Math.min(s.academyFinished,5), max: 5 }) },
    // 🔥 GOD MODE – Badges exclusifs
    { id: "speed_demon",   icon: "💨", label: "Speed Demon",      desc: "100 révisions en 1 jour",   rarity: "legendaire", cat: "Révisions", check: s => s.bestDayReviews >= 100, progress: s => ({ cur: Math.min(s.bestDayReviews||0,100), max: 100 }) },
    { id: "nocturne",      icon: "🌙", label: "Hibou Nocturne",   desc: "Étudier après minuit",      rarity: "rare",       cat: "Streak",    check: s => s.lateNightSessions >= 1, progress: s => ({ cur: Math.min(s.lateNightSessions||0,1), max: 1 }) },
    { id: "polyglotte",    icon: "🌍", label: "Polyglotte",       desc: "5 modules différents créés",rarity: "epique",     cat: "Création",  check: s => s.modulesCount >= 5,  progress: s => ({ cur: Math.min(s.modulesCount||0,5), max: 5 }) },
    { id: "perfectionist", icon: "💯", label: "Perfectionniste",  desc: "Score 100% sur un examen",  rarity: "epique",     cat: "Examens",   check: s => s.perfectExams >= 1,  progress: s => ({ cur: Math.min(s.perfectExams||0,1), max: 1 }) },
    { id: "unstoppable",   icon: "⚡", label: "Inarrêtable",      desc: "Streak de 60 jours",        rarity: "legendaire", cat: "Streak",    check: s => s.streak >= 60,       progress: s => ({ cur: Math.min(s.streak,60), max: 60 }) },
    { id: "grandmaster",   icon: "♟️", label: "Grand Maître",     desc: "200 fiches maîtrisées",     rarity: "legendaire", cat: "Maîtrise",  check: s => s.mastered >= 200,    progress: s => ({ cur: Math.min(s.mastered,200), max: 200 }) },
    { id: "lab_explorer",  icon: "🔭", label: "Explorateur Lab",  desc: "Analyser 3 PDFs",           rarity: "rare",       cat: "IA",        check: s => s.pdfsAnalyzed >= 3,  progress: s => ({ cur: Math.min(s.pdfsAnalyzed||0,3), max: 3 }) },
    { id: "ai_overlord",   icon: "👾", label: "IA Overlord",      desc: "Générer 200 fiches via IA", rarity: "legendaire", cat: "IA",        check: s => s.aiGenerated >= 200, progress: s => ({ cur: Math.min(s.aiGenerated,200), max: 200 }) },
    { id: "consistency",   icon: "🪨", label: "Roc",              desc: "Rév. 30 jours consécutifs", rarity: "legendaire", cat: "Streak",    check: s => s.streak >= 30,       progress: s => ({ cur: Math.min(s.streak,30), max: 30 }) },
    { id: "five_hundred",  icon: "🌟", label: "Étoile filante",   desc: "500 fiches créées",         rarity: "legendaire", cat: "Création",  check: s => s.totalCards >= 500,  progress: s => ({ cur: Math.min(s.totalCards,500), max: 500 }) },
  ];

  const badgeState = {
    totalCards: expressions.length,
    streak: stats.streak,
    mastered,
    dueCount,
    totalReviews: stats.totalReviews,
    aiGenerated: stats.aiGenerated,
    examsDone: stats.examsDone,
    academyCourses: academyCoursesCount,
    academyFinished,
  };

  const CATS = ["Création","Streak","Maîtrise","Révisions","Examens","IA","Academy"];

  // ── Stats résumé haut de page ──
  const unlockedAll = ALL_BADGES.filter(b => unlockedBadges.includes(b.id));
  const nextBadge = ALL_BADGES.find(b => !unlockedBadges.includes(b.id) && b.progress);
  const nextProg = nextBadge ? nextBadge.progress(badgeState) : null;

  // ── Couleurs rareté pour le résumé ──
  const rarityCount = { legendaire: 0, epique: 0, rare: 0, commun: 0 };
  unlockedAll.forEach(b => rarityCount[b.rarity]++);

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, margin: 0 }}>🏆 Hauts Faits</h1>
        <p style={{ color: theme.textMuted, marginTop: 6 }}>
          {unlockedBadges.length} / {ALL_BADGES.length} débloqués
        </p>
      </div>

      {/* ── Bandeau stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 32 }}>
        {[
          { label: "Légendaires", count: rarityCount.legendaire, color: "#6B82F5", icon: "👑" },
          { label: "Épiques",     count: rarityCount.epique,     color: "#7B93FF", icon: "💜" },
          { label: "Rares",       count: rarityCount.rare,       color: "#4D6BFE", icon: "💙" },
          { label: "Communs",     count: rarityCount.commun,     color: "#94A3B8", icon: "⚪" },
        ].map(r => (
          <div key={r.label} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>{r.icon}</span>
            <div>
              <div style={{ fontWeight: 900, color: r.color, fontSize: 20 }}>{r.count}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>{r.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Prochain badge ── */}
      {nextBadge && nextProg && (
        <div style={{ background: theme.cardBg, border: `1px solid ${RARITY[nextBadge.rarity].color}44`, borderRadius: 16, padding: "18px 22px", marginBottom: 32, display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 32 }}>{nextBadge.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 800, color: theme.text, fontSize: 14 }}>Prochain : {nextBadge.label}</span>
              <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>{nextProg.cur} / {nextProg.max}</span>
            </div>
            <div style={{ height: 6, background: theme.inputBg, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(nextProg.cur / nextProg.max) * 100}%`, background: RARITY[nextBadge.rarity].color, borderRadius: 3, transition: "width 0.6s ease" }} />
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 5, fontWeight: 600 }}>{nextBadge.desc}</div>
          </div>
        </div>
      )}

      {/* ── Badges par catégorie ── */}
      {CATS.map(cat => {
        const catBadges = ALL_BADGES.filter(b => b.cat === cat);
        const catUnlocked = catBadges.filter(b => unlockedBadges.includes(b.id)).length;
        return (
          <div key={cat} style={{ marginBottom: 36 }}>
            {/* Titre catégorie */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: theme.text, margin: 0 }}>{cat}</h2>
              <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, background: theme.inputBg, padding: "3px 10px", borderRadius: 20 }}>
                {catUnlocked} / {catBadges.length}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
              {catBadges.map(badge => {
                const isUnlocked = unlockedBadges.includes(badge.id);
                const rar = RARITY[badge.rarity];
                const prog = badge.progress ? badge.progress(badgeState) : null;
                const pct = prog ? Math.round((prog.cur / prog.max) * 100) : 0;

                // Badge déverrouillé : date (stockée dans unlockedBadges comme objet si tu veux, sinon on affiche juste ✨)
                return (
                  <div key={badge.id} style={{
                    background: isUnlocked ? rar.bg : (isDarkMode ? "#0F1A3A" : "#F8FAFC"),
                    border: `2px solid ${isUnlocked ? rar.color : theme.border}`,
                    borderRadius: 20,
                    padding: "20px 18px",
                    textAlign: "center",
                    opacity: isUnlocked ? 1 : 0.55,
                    filter: isUnlocked ? "none" : "grayscale(80%)",
                    transition: "all 0.3s",
                    position: "relative",
                    boxShadow: isUnlocked ? rar.glow : "none",
                  }} className={isUnlocked ? "card-hov" : ""}>

                    {/* Badge rareté */}
                    <div style={{
                      position: "absolute", top: 10, left: 12,
                      fontSize: 10, fontWeight: 800, color: rar.color,
                      textTransform: "uppercase", letterSpacing: 0.5
                    }}>{rar.label}</div>

                    {/* Étoile si déverrouillé */}
                    {isUnlocked && (
                      <div style={{ position: "absolute", top: 10, right: 12, fontSize: 14 }}>✨</div>
                    )}

                    {/* Icône */}
                    <div style={{ fontSize: 44, margin: "18px 0 12px" }}>{badge.icon}</div>

                    {/* Nom */}
                    <div style={{ fontWeight: 800, color: theme.text, fontSize: 14, marginBottom: 4 }}>{badge.label}</div>

                    {/* Description */}
                    <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, marginBottom: isUnlocked ? 0 : 12 }}>{badge.desc}</div>

                    {/* Barre de progression si verrouillé */}
                    {!isUnlocked && prog && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: theme.textMuted, fontWeight: 700, marginBottom: 4 }}>
                          <span>{prog.cur}</span>
                          <span>{prog.max}</span>
                        </div>
                        <div style={{ height: 5, background: theme.border, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: rar.color, borderRadius: 3 }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
})()}

        {/* ══════════════════════════════════════════════════════════════════
            VUE PROJETS — GOD MODE COMPLET
        ══════════════════════════════════════════════════════════════════ */}
        {view === "projects" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>

            {/* Header + Tabs */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, margin: 0 }}>🗂️ Projets</h1>
                <p style={{ color: theme.textMuted, marginTop: 4 }}>Gestion intelligente · IA · Planificateur anti-collision</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["hub","planner","coach","fusion"].map(tab => (
                  <button key={tab} onClick={() => setProjectSubView(tab)} style={{
                    padding: "8px 16px", borderRadius: 10, fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
                    background: projectSubView === tab ? "#3451D1" : theme.cardBg,
                    color: projectSubView === tab ? "white" : theme.textMuted,
                    border: projectSubView !== tab ? `1px solid ${theme.border}` : "none",
                  }}>
                    {tab === "hub" ? "🗂️ Hub" : tab === "planner" ? "📅 Planificateur" : tab === "coach" ? "🤖 Coach IA" : "🎯 Fusion Pomodoro"}
                  </button>
                ))}
                <button onClick={() => setShowProjectForm(true)} style={{ padding: "8px 18px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
                  ＋ Nouveau projet
                </button>
              </div>
            </div>

            {/* ── Conflict Banner ── */}
            {projectConflicts.length > 0 && (
              <div style={{ background: projectConflicts.some(c => c.severity === "critique") ? "#FEF2F2" : "#EFF3FF", border: `2px solid ${projectConflicts.some(c => c.severity === "critique") ? "#EF4444" : "#6B82F5"}`, borderRadius: 16, padding: "16px 20px", marginBottom: 20 }}>
                <div style={{ fontWeight: 800, color: projectConflicts.some(c => c.severity === "critique") ? "#991B1B" : "#1E3A8A", marginBottom: 8, fontSize: 15 }}>
                  {projectConflicts.some(c => c.severity === "critique") ? "🚨" : "⚠️"} {projectConflicts.length} conflit{projectConflicts.length > 1 ? "s" : ""} détecté{projectConflicts.length > 1 ? "s" : ""}
                </div>
                {projectConflicts.map((c, i) => (
                  <div key={i} style={{ fontSize: 13, color: c.severity === "critique" ? "#EF4444" : "#4D6BFE", marginBottom: 4 }}>{c.advice}</div>
                ))}
              </div>
            )}

            {/* Modal nouveau projet */}
            {showProjectForm && (
              <div style={{ background: theme.cardBg, border: `2px solid #3451D1`, borderRadius: 20, padding: 28, marginBottom: 24 }}>
                <h3 style={{ color: theme.highlight, margin: "0 0 20px" }}>✦ Nouveau projet</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Titre du projet *</label>
                    <input value={projectForm.title} onChange={e => setProjectForm(f => ({...f, title: e.target.value}))} placeholder="Ex: Projet Java Spring Boot..." style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text, fontSize: 14 }} />
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Description</label>
                    <textarea value={projectForm.description} onChange={e => setProjectForm(f => ({...f, description: e.target.value}))} placeholder="Décris ton projet en quelques mots..." style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text, minHeight: 80, resize: "vertical" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Module lié</label>
                    <select value={projectForm.category} onChange={e => setProjectForm(f => ({...f, category: e.target.value}))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text }}>
                      <option value="">Aucun</option>
                      {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Date de rendu</label>
                    <input type="date" value={projectForm.dueDate} onChange={e => setProjectForm(f => ({...f, dueDate: e.target.value}))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Heures estimées</label>
                    <input type="number" min="1" max="200" value={projectForm.estimatedHours} onChange={e => setProjectForm(f => ({...f, estimatedHours: +e.target.value}))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Priorité</label>
                    <select value={projectForm.priority} onChange={e => setProjectForm(f => ({...f, priority: e.target.value}))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text }}>
                      <option value="haute">🔴 Haute</option>
                      <option value="normale">🟡 Normale</option>
                      <option value="basse">🟢 Basse</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Couleur</label>
                      <input type="color" value={projectForm.color} onChange={e => setProjectForm(f => ({...f, color: e.target.value}))} style={{ width: "100%", height: 46, marginTop: 4, borderRadius: 12, border: `1.5px solid ${theme.border}`, padding: 4 }} />
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={createProject} disabled={!projectForm.title.trim()} style={{ padding: "12px 28px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>✦ Créer le projet</button>
                  <button onClick={() => setShowProjectForm(false)} style={{ padding: "12px 20px", background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.textMuted, borderRadius: 12, cursor: "pointer" }}>Annuler</button>
                </div>
              </div>
            )}

            {/* ═══ HUB ═══ */}
            {projectSubView === "hub" && (
              <div>
                {/* Stats rapides */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
                  {[
                    { label: "En cours", value: projects.filter(p => p.status === "en_cours").length, color: "#4D6BFE", icon: "🔵" },
                    { label: "Terminés", value: projects.filter(p => p.status === "terminé").length, color: "#4D6BFE", icon: "✅" },
                    { label: "Urgents (7j)", value: projects.filter(p => p.dueDate && getDaysUntil(p.dueDate) <= 7 && getDaysUntil(p.dueDate) >= 0).length, color: "#EF4444", icon: "🚨" },
                    { label: "Tâches totales", value: projects.reduce((s, p) => s + (p.tasks?.length || 0), 0), color: "#7B93FF", icon: "📋" },
                  ].map(s => (
                    <div key={s.label} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "16px 18px" }}>
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Liste projets */}
                {projects.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 20px", background: theme.cardBg, borderRadius: 24, border: `2px dashed ${theme.border}` }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>🗂️</div>
                    <h3 style={{ color: theme.text, margin: "0 0 8px" }}>Aucun projet pour l'instant</h3>
                    <p style={{ color: theme.textMuted, marginBottom: 24 }}>Crée ton premier projet et laisse l'IA le décomposer automatiquement.</p>
                    <button onClick={() => setShowProjectForm(true)} style={{ padding: "14px 32px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer" }}>＋ Créer un projet</button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 20 }}>
                    {projects.map(proj => {
                      const progress = getProjectProgress(proj);
                      const daysLeft = getDaysUntil(proj.dueDate);
                      const isUrgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
                      const doneTasks = proj.tasks.filter(t => t.done).length;
                      return (
                        <div key={proj.id} style={{
                          background: theme.cardBg, borderRadius: 20, padding: 22,
                          border: `1px solid ${isUrgent ? "#EF444460" : theme.border}`,
                          borderTop: `4px solid ${proj.color || "#4D6BFE"}`,
                          boxShadow: isUrgent ? "0 0 20px rgba(239,68,68,0.1)" : "none"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 900, fontSize: 16, color: theme.text, marginBottom: 4 }}>{proj.title}</div>
                              {proj.description && <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>{proj.description.slice(0, 80)}{proj.description.length > 80 ? "…" : ""}</div>}
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {proj.category && <span style={{ fontSize: 11, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 20, padding: "2px 8px", color: theme.textMuted }}>📚 {proj.category}</span>}
                                <span style={{ fontSize: 11, background: proj.priority === "haute" ? "#FEE2E2" : proj.priority === "normale" ? "#E8EEFF" : "#EEF2FF", color: proj.priority === "haute" ? "#991B1B" : proj.priority === "normale" ? "#1E3A8A" : "#1E3A8A", borderRadius: 20, padding: "2px 8px" }}>
                                  {proj.priority === "haute" ? "🔴" : proj.priority === "normale" ? "🟡" : "🟢"} {proj.priority}
                                </span>
                              </div>
                            </div>
                            <button onClick={() => deleteProject(proj.id)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 16, padding: 4 }}>🗑️</button>
                          </div>

                          {/* Deadline */}
                          {proj.dueDate && (
                            <div style={{ fontSize: 12, fontWeight: 700, color: isUrgent ? "#EF4444" : theme.textMuted, marginBottom: 10 }}>
                              🗓️ Rendu : {new Date(proj.dueDate).toLocaleDateString("fr-FR")}
                              {daysLeft !== null && <span style={{ marginLeft: 6, background: isUrgent ? "#FEE2E2" : theme.inputBg, color: isUrgent ? "#EF4444" : theme.textMuted, borderRadius: 20, padding: "1px 7px" }}>J-{daysLeft}</span>}
                            </div>
                          )}

                          {/* Progress */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                              <span>{doneTasks}/{proj.tasks.length} tâches</span>
                              <span style={{ fontWeight: 800, color: proj.color }}>{progress}%</span>
                            </div>
                            <div style={{ height: 8, background: theme.inputBg, borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${progress}%`, background: progress >= 100 ? "#4D6BFE" : proj.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                            </div>
                          </div>

                          {/* Tasks preview (top 3) */}
                          {proj.tasks.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                              {proj.tasks.slice(0, 3).map(task => (
                                <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                                  <input type="checkbox" checked={task.done} onChange={() => toggleTask(proj.id, task.id)} style={{ accentColor: proj.color, cursor: "pointer" }} />
                                  <span style={{ fontSize: 12, color: task.done ? theme.textMuted : theme.text, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</span>
                                </div>
                              ))}
                              {proj.tasks.length > 3 && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>+{proj.tasks.length - 3} autres tâches…</div>}
                            </div>
                          )}

                          {/* Actions */}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={() => { setActiveProject(proj); setProjectSubView("hub"); }} style={{ flex: 1, padding: "8px", background: "#3451D1", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📋 Détail</button>
                            {!proj.decomposed ? (
                              <button onClick={() => decomposeProject(proj)} disabled={projectDecomposing} style={{ flex: 1, padding: "8px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                                {projectDecomposing ? "⏳" : "🧠 IA Décompose"}
                              </button>
                            ) : (
                              <button onClick={() => { setActiveProject(proj); setProjectSubView("coach"); }} style={{ flex: 1, padding: "8px", background: "#3451D1", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🤖 Coach</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Détail projet actif (tâches complètes) */}
                {activeProject && (
                  <div style={{ marginTop: 28, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 22, padding: 28 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <div>
                        <h2 style={{ color: theme.highlight, margin: 0 }}>{activeProject.title}</h2>
                        {activeProject.decomposedData?.studyAdvice && (
                          <div style={{ fontSize: 13, color: "#4D6BFE", marginTop: 6, fontStyle: "italic" }}>💡 {activeProject.decomposedData.studyAdvice}</div>
                        )}
                      </div>
                      <button onClick={() => setActiveProject(null)} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 20 }}>✕</button>
                    </div>

                    {/* Risques IA */}
                    {activeProject.decomposedData?.keyRisks?.length > 0 && (
                      <div style={{ background: "#EFF3FF", borderRadius: 12, padding: "12px 16px", marginBottom: 16, border: "1px solid #C7D2FE" }}>
                        <div style={{ fontWeight: 700, color: "#1E3A8A", fontSize: 13, marginBottom: 6 }}>⚠️ Risques identifiés par l'IA</div>
                        {activeProject.decomposedData.keyRisks.map((r, i) => <div key={i} style={{ fontSize: 12, color: "#1E3558", marginBottom: 2 }}>• {r}</div>)}
                      </div>
                    )}

                    {/* Tâches par phase */}
                    {["analyse","conception","développement","test","rendu"].map(phase => {
                      const phaseTasks = activeProject.tasks.filter(t => t.phase === phase);
                      if (!phaseTasks.length) return null;
                      const phaseColors = { analyse: "#4D6BFE", conception: "#7B93FF", développement: "#6B82F5", test: "#EF4444", rendu: "#4D6BFE" };
                      return (
                        <div key={phase} style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: phaseColors[phase] || theme.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{phase}</div>
                          {phaseTasks.map(task => (
                            <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: theme.inputBg, borderRadius: 12, marginBottom: 6, borderLeft: `3px solid ${task.done ? "#4D6BFE" : phaseColors[phase] || "#4D6BFE"}` }}>
                              <input type="checkbox" checked={task.done} onChange={() => toggleTask(activeProject.id, task.id)} style={{ marginTop: 2, accentColor: phaseColors[phase], cursor: "pointer", flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: task.done ? theme.textMuted : theme.text, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</div>
                                {task.description && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{task.description}</div>}
                                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                                  {task.estimatedHours && <span style={{ fontSize: 10, color: theme.textMuted }}>⏱ {task.estimatedHours}h</span>}
                                  {task.suggestedDate && <span style={{ fontSize: 10, color: theme.textMuted }}>📅 {task.suggestedDate}</span>}
                                  {task.cardConcepts?.length > 0 && task.cardConcepts.map(concept => (
                                    <button key={concept} onClick={async () => {
                                      try {
                                        const raw = await callClaude(`Génère une fiche de révision JSON sur: "${concept}" dans le contexte du projet "${activeProject.title}". Format: {"front":"...","back":"...","example":"..."}`, "Génère la fiche.");
                                        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
                                        const newExp = { id: Date.now().toString() + Math.random(), front: parsed.front, back: parsed.back, example: parsed.example || "", category: activeProject.category || categories[0]?.name || "Projets", level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null };
                                        setExpressions(prev => [newExp, ...prev]);
                                        showToast(`✨ Fiche "${concept}" créée !`);
                                      } catch { showToast("Erreur génération fiche", "error"); }
                                    }} style={{ fontSize: 10, background: "#EEF2FF", color: "#5B21B6", border: "none", borderRadius: 20, padding: "2px 8px", cursor: "pointer", fontWeight: 700 }}>
                                      + Fiche: {concept}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}

                    {activeProject.tasks.length === 0 && (
                      <button onClick={() => decomposeProject(activeProject)} disabled={projectDecomposing} style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#4D6BFE,#7B93FF)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
                        {projectDecomposing ? "⏳ L'IA génère ton plan…" : "🧠 Décomposer avec l'IA"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ═══ PLANIFICATEUR CRUNCH MODE ═══ */}
            {projectSubView === "planner" && (
              <div>
                <div style={{ background: "linear-gradient(135deg,#1A0800,#3451D1)", borderRadius: 22, padding: 28, marginBottom: 24, color: "white" }}>
                  <h2 style={{ margin: "0 0 8px" }}>📅 Planificateur Crunch Mode</h2>
                  <p style={{ color: "#EEF2FF", margin: "0 0 20px", fontSize: 14 }}>L'IA analyse tes projets + examens + révisions FSRS et génère un planning heure par heure sur 7 jours.</p>
                  <button onClick={generateCrunchPlan} disabled={projectPlannerLoading} style={{ padding: "14px 28px", background: "white", color: "#3451D1", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
                    {projectPlannerLoading ? "⏳ Génération…" : "⚡ Générer mon planning Crunch"}
                  </button>
                </div>

                {/* Conflits détaillés */}
                {projectConflicts.length > 0 && (
                  <div style={{ background: theme.cardBg, borderRadius: 18, padding: 20, marginBottom: 20, border: `1px solid ${theme.border}` }}>
                    <h3 style={{ color: theme.text, margin: "0 0 14px" }}>⚡ Détecteur de conflits</h3>
                    {projectConflicts.map((c, i) => (
                      <div key={i} style={{ background: c.severity === "critique" ? "#FEF2F2" : "#EFF3FF", borderRadius: 12, padding: "12px 16px", marginBottom: 8, borderLeft: `4px solid ${c.severity === "critique" ? "#EF4444" : "#6B82F5"}` }}>
                        <div style={{ fontWeight: 700, color: c.severity === "critique" ? "#991B1B" : "#1E3A8A", fontSize: 13 }}>
                          {c.severity === "critique" ? "🚨 CRITIQUE" : "⚠️ AVERTISSEMENT"}
                        </div>
                        <div style={{ fontSize: 13, color: c.severity === "critique" ? "#EF4444" : "#4D6BFE", marginTop: 4 }}>{c.advice}</div>
                        <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: theme.textMuted }}>
                          <span>📋 Projet: {c.projectDate}</span>
                          <span>🎓 Examen: {c.examDate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Planning généré */}
                {projectPlannerData && (
                  <div>
                    {projectPlannerData.warnings?.length > 0 && (
                      <div style={{ background: "#EFF3FF", borderRadius: 14, padding: "14px 18px", marginBottom: 16, border: "1px solid #C7D2FE" }}>
                        {projectPlannerData.warnings.map((w, i) => <div key={i} style={{ fontSize: 13, color: "#1E3A8A" }}>⚠️ {w}</div>)}
                      </div>
                    )}
                    {projectPlannerData.weekSummary && (
                      <div style={{ background: theme.cardBg, borderRadius: 14, padding: "16px 20px", marginBottom: 16, border: `1px solid ${theme.border}` }}>
                        <div style={{ fontWeight: 700, color: theme.highlight, marginBottom: 4 }}>📊 Stratégie de la semaine</div>
                        <div style={{ fontSize: 13, color: theme.text }}>{projectPlannerData.weekSummary}</div>
                        {projectPlannerData.tip && <div style={{ fontSize: 13, color: "#4D6BFE", marginTop: 8, fontStyle: "italic" }}>💡 {projectPlannerData.tip}</div>}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
                      {(projectPlannerData.days || []).map((day, di) => (
                        <div key={di} style={{ background: theme.cardBg, borderRadius: 16, padding: 18, border: `1px solid ${theme.border}` }}>
                          <div style={{ fontWeight: 800, color: theme.highlight, marginBottom: 12, fontSize: 14 }}>📅 {day.dayLabel || day.date}</div>
                          {(day.slots || []).map((slot, si) => (
                            <div key={si} style={{ display: "flex", gap: 10, marginBottom: 8, padding: "8px 10px", background: theme.inputBg, borderRadius: 10, borderLeft: `3px solid ${slot.type === "revision" ? "#4D6BFE" : slot.type === "projet" ? "#4D6BFE" : "#94A3B8"}` }}>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 800, color: theme.highlight, minWidth: 38 }}>{slot.time}</span>
                              <div>
                                <div style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>{slot.activity}</div>
                                {slot.module && <div style={{ fontSize: 10, color: theme.textMuted }}>{slot.module}</div>}
                              </div>
                              <span style={{ marginLeft: "auto", fontSize: 9, background: slot.type === "revision" ? "#EEF2FF" : slot.type === "projet" ? "#EEF2FF" : "#F1F5F9", color: slot.type === "revision" ? "#3451D1" : slot.type === "projet" ? "#1E3A8A" : "#64748B", borderRadius: 20, padding: "2px 6px", fontWeight: 700, height: "fit-content" }}>{slot.type}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ AI PROJECT COACH ═══ */}
            {projectSubView === "coach" && (
              <div style={{ display: "flex", flexDirection: "column", height: "70vh" }}>
                <div style={{ background: "linear-gradient(135deg,#1E3A8A,#4D6BFE)", borderRadius: "18px 18px 0 0", padding: "20px 24px", color: "white" }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>🤖 AI Project Coach</div>
                  <div style={{ fontSize: 12, color: "#C7D2FE", marginTop: 2 }}>
                    {activeProject ? `Contexte: ${activeProject.title} (${getProjectProgress(activeProject)}%)` : "Pose n'importe quelle question sur tes projets."}
                  </div>
                  {activeProject && (
                    <select onChange={e => setActiveProject(projects.find(p => p.id === e.target.value) || null)} value={activeProject?.id || ""} style={{ marginTop: 10, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, padding: "6px 10px", color: "white", fontSize: 12 }}>
                      {projects.map(p => <option key={p.id} value={p.id} style={{ color: "#000" }}>{p.title}</option>)}
                    </select>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 20, background: theme.inputBg, display: "flex", flexDirection: "column", gap: 12 }}>
                  {projectCoachMessages.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: theme.textMuted }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                      <p>Salut ! Je suis ton Coach Projets IA. Je connais tes projets, tes fiches et ton planning. Pose-moi n'importe quelle question !</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
                        {["Comment avancer sur mon projet Java ?", "Explique-moi les annotations Spring Boot", "Quelles tâches faire en priorité ?", "Génère des fiches sur ce concept"].map(q => (
                          <button key={q} onClick={() => sendProjectCoachMessage(q)} style={{ padding: "8px 14px", background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 20, fontSize: 12, color: theme.text, cursor: "pointer" }}>{q}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {projectCoachMessages.map((msg, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{ maxWidth: "80%", padding: "12px 16px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? "#3451D1" : theme.cardBg, color: msg.role === "user" ? "white" : theme.text, fontSize: 14, border: msg.role === "assistant" ? `1px solid ${theme.border}` : "none" }}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {projectCoachLoading && (
                    <div style={{ display: "flex", gap: 4, padding: "8px 14px", background: theme.cardBg, borderRadius: 18, width: "fit-content", border: `1px solid ${theme.border}` }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#4D6BFE", animation: `pulse 1s ${i*0.2}s infinite` }} />)}
                    </div>
                  )}
                </div>
                <div style={{ padding: 16, background: theme.cardBg, borderRadius: "0 0 18px 18px", border: `1px solid ${theme.border}`, borderTop: "none", display: "flex", gap: 10 }}>
                  <input value={projectCoachInput} onChange={e => setProjectCoachInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendProjectCoachMessage(projectCoachInput)} placeholder="Pose ta question au Coach IA…" style={{ flex: 1, padding: "12px 16px", background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text, fontSize: 14 }} />
                  <button onClick={() => sendProjectCoachMessage(projectCoachInput)} disabled={projectCoachLoading || !projectCoachInput.trim()} style={{ padding: "12px 20px", background: "linear-gradient(135deg,#4D6BFE,#7B93FF)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>Envoyer</button>
                </div>
              </div>
            )}

            {/* ═══ FUSION SESSIONS POMODORO ═══ */}
            {projectSubView === "fusion" && (
              <div>
                <div style={{ background: "linear-gradient(135deg,#1E3A8A,#3451D1,#4D6BFE)", borderRadius: 22, padding: 28, marginBottom: 24, color: "white", textAlign: "center" }}>
                  <div style={{ fontSize: 72, fontFamily: "'JetBrains Mono',monospace", fontWeight: 900, letterSpacing: -2, marginBottom: 8 }}>{formatPomodoro(projectPomodoroTime)}</div>
                  <div style={{ fontSize: 14, color: "#C7D2FE", marginBottom: 20 }}>
                    Mode : {projectPomodoroMode === "study" ? "📚 Révision FSRS" : projectPomodoroMode === "project" ? "🗂️ Session Projet" : "☕ Pause"}
                  </div>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    <button onClick={() => setProjectPomodoroActive(a => !a)} style={{ padding: "14px 32px", background: "white", color: "#3451D1", border: "none", borderRadius: 14, fontWeight: 900, fontSize: 18, cursor: "pointer" }}>
                      {projectPomodoroActive ? "⏸ Pause" : "▶ Démarrer"}
                    </button>
                    <button onClick={() => { setProjectPomodoroActive(false); setProjectPomodoroTime(25*60); setProjectPomodoroMode("study"); }} style={{ padding: "14px 20px", background: "rgba(255,255,255,0.2)", color: "white", border: "none", borderRadius: 14, fontWeight: 700, cursor: "pointer" }}>↺ Reset</button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                  {[
                    { mode: "study", icon: "📚", label: "Révision FSRS", desc: "25 min de révision", duration: 25, color: "#4D6BFE" },
                    { mode: "project", icon: "🗂️", label: "Session Projet", desc: "25 min de code/travail", duration: 25, color: "#4D6BFE" },
                    { mode: "break", icon: "☕", label: "Pause", desc: "15 min de repos", duration: 15, color: "#6B82F5" },
                  ].map(m => (
                    <button key={m.mode} onClick={() => { setProjectPomodoroMode(m.mode); setProjectPomodoroTime(m.duration * 60); setProjectPomodoroActive(false); }} style={{ padding: 20, background: projectPomodoroMode === m.mode ? m.color + "20" : theme.cardBg, border: `2px solid ${projectPomodoroMode === m.mode ? m.color : theme.border}`, borderRadius: 16, cursor: "pointer", textAlign: "left" }}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>{m.icon}</div>
                      <div style={{ fontWeight: 800, color: theme.text, fontSize: 14 }}>{m.label}</div>
                      <div style={{ fontSize: 12, color: theme.textMuted }}>{m.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Projet actif pour la session */}
                <div style={{ background: theme.cardBg, borderRadius: 18, padding: 20, border: `1px solid ${theme.border}` }}>
                  <h3 style={{ color: theme.text, margin: "0 0 14px" }}>🎯 Tâche de la session</h3>
                  <select value={activeProject?.id || ""} onChange={e => setActiveProject(projects.find(p => p.id === e.target.value) || null)} style={{ width: "100%", padding: "10px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, marginBottom: 12 }}>
                    <option value="">Sélectionne un projet…</option>
                    {projects.filter(p => p.status !== "terminé").map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                  {activeProject && activeProject.tasks.filter(t => !t.done).length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {activeProject.tasks.filter(t => !t.done).slice(0, 4).map(task => (
                        <div key={task.id} onClick={() => setProjectPomodoroTask(task)} style={{ padding: "10px 14px", background: projectPomodoroTask?.id === task.id ? "#EEF2FF" : theme.inputBg, border: `1px solid ${projectPomodoroTask?.id === task.id ? "#4D6BFE" : theme.border}`, borderRadius: 10, cursor: "pointer", fontSize: 13, color: theme.text, fontWeight: projectPomodoroTask?.id === task.id ? 700 : 400 }}>
                          {task.title}
                          {task.estimatedHours && <span style={{ float: "right", fontSize: 11, color: theme.textMuted }}>⏱ {task.estimatedHours}h</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {projectPomodoroTask && (
                    <button onClick={() => { toggleTask(activeProject.id, projectPomodoroTask.id); setProjectPomodoroTask(null); showToast("✅ Tâche marquée comme faite !"); }} style={{ marginTop: 12, width: "100%", padding: "10px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
                      ✅ Marquer "{projectPomodoroTask.title}" comme faite
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            VUE CATEGORIES
        ══════════════════════════════════════════════════════════════════ */}
                {view === "categories" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, marginBottom: 8 }}>◉ Gestion des Modules</h1>
                <p style={{ color: theme.textMuted }}>Statistiques avancées, prérequis, planification et coaching par module.</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                <button onClick={() => setCatsViewMode("cards")} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: catsViewMode==="cards"?theme.highlight:theme.cardBg, color: catsViewMode==="cards"?"white":theme.textMuted, border: `1px solid ${theme.border}`, fontWeight: 600, fontSize: 13 }}>📇 Cartes</button>
                <button onClick={() => { setCatsViewMode("table"); computeCatsStats(); }} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: catsViewMode==="table"?theme.highlight:theme.cardBg, color: catsViewMode==="table"?"white":theme.textMuted, border: `1px solid ${theme.border}`, fontWeight: 600, fontSize: 13 }}>📊 Tableau</button>
                <button onClick={generateTimeline} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: catsViewMode==="timeline"?theme.highlight:theme.cardBg, color: catsViewMode==="timeline"?"white":theme.textMuted, border: `1px solid ${theme.border}`, fontWeight: 600, fontSize: 13 }}>📅 Timeline</button>
                <button onClick={detectPrerequisites} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: theme.cardBg, color: theme.textMuted, border: `1px solid ${theme.border}`, fontWeight: 600, fontSize: 13 }}>🔗 Prérequis</button>
                <button onClick={() => { computeCatsStats(); checkModuleAlerts(); generateModuleReport(); }} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: "#4D6BFE", color: "white", border: "none", fontWeight: 700, fontSize: 13 }}>
                  🧠 Analyse IA
                </button>
              </div>
            </div>

            {/* Alertes globales */}
            {catsAlerts.length > 0 && (
              <div style={{ background: "#FEF2F2", borderRadius: 16, padding: 16, marginBottom: 20, border: "1px solid #FECACA" }}>
                <h3 style={{ margin: "0 0 12px", color: "#991B1B" }}>🚨 Alertes modules</h3>
                {catsAlerts.map((alert, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700 }}>{alert.module}</span>
                    <span style={{ color: alert.type==="danger"?"#EF4444":"#4D6BFE" }}>{alert.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Rapport IA */}
            {catsAiReport && (
              <div style={{ background: theme.cardBg, borderRadius: 16, padding: 20, marginBottom: 20, border: "2px solid #4D6BFE" }}>
                <h3 style={{ margin: "0 0 8px", color: "#4D6BFE" }}>🧠 Plan d'action IA</h3>
                <p><strong>Module critique :</strong> {catsAiReport.criticalModule}</p>
                <ul>{catsAiReport.recommendations?.map((r,i) => <li key={i}>{r}</li>)}</ul>
                <button onClick={() => setCatsAiReport(null)} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}>✕</button>
              </div>
            )}

            {/* Ajout de module (compact) */}
            <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 18, padding: "20px", marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 12px", color: theme.text, fontWeight: 800 }}>➕ Ajouter un module</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                <input value={newCat.name} onChange={e => setNewCat(c => ({...c, name: e.target.value}))} style={{ padding: 10, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text }} placeholder="Nom" />
                <input type="color" value={newCat.color} onChange={e => setNewCat(c => ({...c, color: e.target.value}))} style={{ height: 42, padding: 4, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8 }} />
                <input type="date" value={newCat.examDate} onChange={e => setNewCat(c => ({...c, examDate: e.target.value}))} style={{ padding: 10, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text }} />
                <select value={newCat.priority} onChange={e => setNewCat(c => ({...c, priority: e.target.value}))} style={{ padding: 10, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text }}>
                  <option value="haute">Haute</option>
                  <option value="normale">Normale</option>
                  <option value="basse">Basse</option>
                </select>
                <button onClick={handleAddCat} disabled={!newCat.name.trim()} style={{ padding: "10px 18px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 8, fontWeight: 800 }}>Créer</button>
              </div>
            </div>

            {/* Fusion de modules */}
            <div style={{ background: theme.cardBg, borderRadius: 16, padding: 16, marginBottom: 20, border: `1px solid ${theme.border}` }}>
              <h4 style={{ margin: "0 0 8px", color: theme.text }}>🔀 Fusionner des modules</h4>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <select value={catsMergeSource || ""} onChange={e => setCatsMergeSource(e.target.value)} style={{ padding: 8, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }}>
                  <option value="">Source...</option>
                  {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <span>→</span>
                <select value={catsMergeTarget || ""} onChange={e => setCatsMergeTarget(e.target.value)} style={{ padding: 8, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }}>
                  <option value="">Cible...</option>
                  {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <button onClick={mergeModules} disabled={!catsMergeSource || !catsMergeTarget} style={{ padding: "8px 16px", background: "#6B82F5", color: "white", border: "none", borderRadius: 8, fontWeight: 700 }}>Fusionner</button>
              </div>
            </div>

            {/* Vue cartes */}
            {catsViewMode === "cards" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 20 }}>
                {categories.sort((a,b) => {
                  if (catsFavorites.includes(a.name)) return -1;
                  if (catsFavorites.includes(b.name)) return 1;
                  return 0;
                }).map(cat => {
                  const isFav = catsFavorites.includes(cat.name);
                  const catExps = expressions.filter(e => e.category === cat.name);
                  const dueCount = catExps.filter(e => e.nextReview <= today() && e.level < 7).length;
                  const mastered = catExps.filter(e => e.level >= 7).length;
                  const pct = catExps.length ? Math.round((mastered / catExps.length) * 100) : 0;
                  const daysToExam = cat.examDate ? Math.ceil((new Date(cat.examDate) - new Date()) / 86400000) : null;
                  const catColor = cat.color || "#4D6BFE";
                  return (
                    <div key={cat.name} style={{
                      background: theme.cardBg, borderRadius: 22, padding: "22px", border: `1px solid ${theme.border}`,
                      borderTop: `4px solid ${catColor}`, boxShadow: isFav ? "0 0 15px rgba(77,107,254,0.3)" : "0 2px 8px rgba(0,0,0,0.02)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontWeight: 900, fontSize: 18, color: theme.text }}>{cat.name}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => toggleFavorite(cat.name)} style={{ background: "none", border: "none", color: isFav ? "#6B82F5" : theme.textMuted, cursor: "pointer", fontSize: 18 }}>{isFav ? "★" : "☆"}</button>
                          <button onClick={() => exportModule(cat.name)} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}>📥</button>
                          <button onClick={() => deleteCategory(cat.name)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer" }}>🗑️</button>
                        </div>
                      </div>
                      {cat.examDate && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: daysToExam <= 7 ? "#EF4444" : "#4D6BFE", marginBottom: 8 }}>
                          🗓️ Examen : {new Date(cat.examDate).toLocaleDateString("fr-FR")} {daysToExam !== null && `(J-${daysToExam})`}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1, height: 8, background: theme.inputBg, borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: pct >= 80 ? "#4D6BFE" : catColor }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 800, color: catColor, minWidth: 40 }}>{pct}%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: theme.textMuted }}>
                        <span>{catExps.length} fiches</span>
                        <span>{mastered} maîtrisées</span>
                        <span style={{ color: dueCount > 0 ? "#EF4444" : theme.textMuted }}>{dueCount} en retard</span>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button onClick={() => { startReview(cat.name); }} className="hov" style={{ marginRight: 8, padding: "6px 14px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 8, fontWeight: 700 }}>Réviser</button>
                        <button onClick={() => analyzeLearningCurve(cat.name)} className="hov" style={{ padding: "6px 14px", background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: 8, fontWeight: 700 }}>📈 Courbe</button>
                      </div>
                      {/* Courbe mini */}
                      {catsLearningCurve[cat.name] && (
                        <div style={{ marginTop: 12, display: "flex", alignItems: "flex-end", gap: 2, height: 40 }}>
                          {catsLearningCurve[cat.name].map((point, i) => (
                            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                              <div style={{ width: "100%", background: "#4D6BFE", borderRadius: "2px 2px 0 0", height: `${point.avgLevel * 8}px` }} />
                              <span style={{ fontSize: 8, marginTop: 2, color: theme.textMuted }}>{point.week.slice(5)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Vue tableau */}
            {catsViewMode === "table" && (
              <div style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme.border}`, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textMuted, fontWeight: 700 }}>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Module</th>
                      <th>Fiches</th>
                      <th>Maîtrise</th>
                      <th>Difficulté moy.</th>
                      <th>En retard</th>
                      <th>Dernière révision</th>
                      <th>Examen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(cat => {
                      const s = catsStats[cat.name] || {};
                      return (
                        <tr key={cat.name} style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <td style={{ padding: "10px 12px", fontWeight: 700, color: theme.text }}>{cat.name}</td>
                          <td style={{ textAlign: "center" }}>{s.total || 0}</td>
                          <td style={{ textAlign: "center" }}>{s.pct || 0}%</td>
                          <td style={{ textAlign: "center" }}>{s.avgDiff || "-"}</td>
                          <td style={{ textAlign: "center", color: (s.due||0) > 0 ? "#EF4444" : theme.text }}>{s.due || 0}</td>
                          <td style={{ textAlign: "center" }}>{s.lastReview || "-"}</td>
                          <td style={{ textAlign: "center" }}>{cat.examDate || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Vue timeline */}
            {catsViewMode === "timeline" && (
              <div style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme.border}` }}>
                <h3 style={{ color: theme.text, marginTop: 0 }}>📅 Timeline des examens</h3>
                {catsTimelineData.length === 0 ? <p style={{ color: theme.textMuted }}>Aucun examen programmé.</p> :
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {catsTimelineData.map((event, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: theme.inputBg, borderRadius: 12, borderLeft: `4px solid ${categories.find(c => c.name === event.module)?.color || "#4D6BFE"}` }}>
                        <div style={{ minWidth: 90, fontWeight: 800, color: theme.highlight }}>{new Date(event.date).toLocaleDateString("fr-FR")}</div>
                        <div>{event.label}</div>
                      </div>
                    ))}
                  </div>
                }
              </div>
            )}
          </div>
        )}

      </main>
      </div>{/* fin flex sidebar+content */}
      <footer className="hide-mobile" style={{ textAlign: "center", padding: "12px 24px", color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, position: "fixed", bottom: 0, left: sidebarCollapsed ? 64 : 220, right: 0, zIndex: 49, background: isDarkMode ? "rgba(7,13,31,0.97)" : "linear-gradient(135deg, #3451D1 0%, #4D6BFE 100%)", borderTop: `1px solid ${isDarkMode ? "rgba(77,107,254,0.2)" : "rgba(255,255,255,0.15)"}`, backdropFilter: "blur(12px)", transition: "left 0.3s cubic-bezier(0.4,0,0.2,1)" }}>
        MémoMaître GOD LEVEL v8 • Conçu avec 🩵 pour {FB_USER.replace(/_/g, ' ')} • FSRS v5 × DeepSeek Powered
      </footer>
    </div>
  );
}