// MemoMaster.jsx – GOD LEVEL v10.1 (Audit & hardening pass — div/0 guards, safer JSON parsing, SSR-safe init)
import ErrorBoundary from "./components/ErrorBoundary";
import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense, startTransition, forwardRef } from "react";
import { mirrorToWatermelon, loadInitialExpressionsFromWatermelon } from './lib/db/mirror';
import { syncWithFirebase, forceResetSync } from './lib/db/sync';

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, fbStorage, getFbUser, onAuthReady } from "./lib/firebase";
import { addDays, today, formatDate, isDue, normalizeDate } from "./utils/dateUtils";
import { repairCardDates } from "./lib/dateRepair";
import { cleanSpeechTranscript, isMeaninglessSpeech, SPEECH_HYGIENE_PROMPT } from "./utils/speechCleanup";
import { fsrs, fsrsR } from "./lib/fsrs";
import useAudioFeedback from "./hooks/useAudioFeedback";
import useConfetti from "./hooks/useConfetti";
import useHighlight from "./hooks/useHighlight";
import useMermaid from "./hooks/useMermaid";
const EnglishPractice = lazy(() => import("./EnglishPractice"));
const Lab = lazy(() => import("./Lab"));
import CertificationsDashboard from "./components/CertificationsDashboard";
import OpenSourceRadar from "./components/OpenSourceRadar";


import PhantomRecruiter from "./components/PhantomRecruiter";
import TechOracle from "./components/TechOracle";
import { YearHeatmap, ResumeCarousel, getSmartSessionRecommendation, CommandPalette, useCommandPaletteShortcut, SmartPasteBox, generateCardsFromSmartPaste, findSimilarCards, Minimap, getCardHealth, useSavedViews, generateWeeklyDigest, PomodoroStudy, AskMyDocs, SocraticChat, RabbitHoleViewer, gradeSemanticVoice, generatePrerequisiteCard } from "./MemoMasterUpgrades";
import GodTierContent from "./components/GodTierContent";
import GodTierStats from "./components/GodTierStats";
// ── Helpers & composants extraits (refactor — ex-MemoMaster.jsx) ───────────
import { BADGES, getArchetype } from "./constants/gamification";

import { sanitizeInput, safeParseJSON } from "./lib/textUtils";
import { safeHTML } from "./lib/htmlSanitizer";
import { callGeminiGenerateContent, getGeminiKeyCount, isGeminiLikelyUnavailable } from "./lib/geminiClient";
import { aiCall } from "./lib/aiRouter.js";
import { buildHeatmap, getLast12Weeks, parseImport } from "./lib/dataHelpers";
import KnowledgeGraph from "./components/KnowledgeGraph";
import HoloCard from "./components/HoloCard";
import RichText from "./components/RichText";
import MobileSpeedDial from "./components/MobileSpeedDial";
import MobileAddSheet from "./components/MobileAddSheet";
import MobileHomeV2 from "./components/MobileHomeV2";
import DailyRoutineTracker from "./components/DailyRoutineTracker";
const TechIntelView = lazy(() => import("./components/TechIntelView"));

const CATEGORIES_DEFAULT = [
  { name: "🇬🇧 Anglais", examDate: "", targetScore: 90, priority: "haute", color: "#4D6BFE" },
  { name: "☕ Java / Spring Boot", examDate: "", targetScore: 85, priority: "haute", color: "#7B93FF" },
  { name: "🖥️ Informatique Générale", examDate: "", targetScore: 80, priority: "normale", color: "#4D6BFE" },
];

// ══════════════════════════════════════════════════════════════════════════════
// API KEYS — Masquées via Cloud Functions (aiProxy)
// ══════════════════════════════════════════════════════════════════════════════
// Les clés sont configurées dans les variables d'environnement de Firebase Functions.

const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash"; // grounding web Gemini

// ── callClaude : délègue à aiRouter.js (Groq→Cerebras→Fireworks→Cohere→Mistral→OpenRouter)
// Signature 100% rétrocompatible. Le Gemini grounding reste géré ici directement.
async function callClaude(systemPrompt, userMessage, isVisionOrOptions = false, imageUrl = null) {
  const isVision = isVisionOrOptions === true;
  const opts = (isVisionOrOptions && typeof isVisionOrOptions === "object") ? isVisionOrOptions : {};
  const maxTokens = opts.maxTokens || 4096;
  const wantsGrounding = !!opts.grounding;
  const temperature = opts.temperature !== undefined ? opts.temperature : 0.7;
  const task = opts.task || (isVision ? "vision" : "chat");

  const safeUser = sanitizeInput(userMessage);
  const userContent = isVision && imageUrl
    ? `[Image URL: ${imageUrl}]\n${safeUser}`
    : safeUser;

  // ── 0. Gemini (priorité absolue si Grounding/Google Search est demandé) ─────
  if (wantsGrounding && getGeminiKeyCount() > 0 && !isGeminiLikelyUnavailable()) {
    try {
      const data = await callGeminiGenerateContent({
        model: GEMINI_MODEL,
        body: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: maxTokens, temperature }
        }
      });
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (text) {
        const chunks = candidate?.groundingMetadata?.groundingChunks || [];
        const sources = chunks.map(c => {
          const uri = c.web?.uri;
          if (!uri) return null;
          let domain = uri;
          try { domain = new URL(uri).hostname.replace("www.", ""); } catch (e) { }
          return { link: uri, title: c.web.title || domain, source: domain, viaGemini: true };
        }).filter(Boolean);
        return { text, sources, grounded: sources.length > 0 };
      }
    } catch (err) {
      console.warn("Gemini Grounding error:", err?.message || err);
    }
  } else if (wantsGrounding && isGeminiLikelyUnavailable()) {
    console.info("[callClaude] Gemini en cooldown — grounding ignoré, fallback aiRouter.");
  }

  const wrapReturn = (text, sources = []) =>
    wantsGrounding ? { text, sources, grounded: false } : text;

  // ── 1–N. Tous les providers via aiRouter avec fallbacks de tâches ───────────
  const taskChain = [...new Set([task, "chat", "fast-json", "pedagogy"].filter(Boolean))];
  for (const t of taskChain) {
    try {
      const { text } = await aiCall({
        task: t,
        system: systemPrompt,
        user: userContent,
        imageUrl: isVision ? imageUrl : undefined,
        maxTokens,
        temperature,
        json: opts.json || t === "fast-json",
      });
      return wrapReturn(text, []);
    } catch (err) {
      console.warn(`aiRouter task '${t}' failed:`, err?.message || err);
    }
  }

  throw new Error("Tous les providers IA sont temporairement indisponibles. Réessaie dans 1-2 minutes.");
}

// Transcription vocale – via proxy Cloud Functions
async function transcribeAudio(audioBlob, language = "fr") {
  const keys = [
    import.meta.env.VITE_GROQ_API_KEY,
    import.meta.env.VITE_GROQ_API_KEY_5,
    import.meta.env.VITE_GROQ_API_KEY_6,
    import.meta.env.VITE_GROQ_API_KEY_7
  ].filter(Boolean);
  
  if (keys.length === 0) throw new Error("Clé Groq manquante");

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-large-v3-turbo");
  if (language) formData.append("language", language);

  let lastErr = null;
  for (const apiKey of keys) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Erreur API ${res.status}`);
      }

      const data = await res.json();
      return data.text?.trim() || "";
    } catch (err) {
      lastErr = err;
      // On tente la clé suivante
    }
  }
  throw lastErr || new Error("Le service de transcription est temporairement indisponible.");
}

// ══════════════════════════════════════════════════════════════════════════════
// ── HOOK DE NAVIGATION CENTRALISÉ ──────────────────────────────────────────────
const useNavigation = (initialView = "dashboard") => {
  const [navState, setNavState] = useState({
    view: initialView,
    subView: null,
    params: {}
  });

  const navigate = useCallback((path, params = {}) => {
    const [view, subView = null] = path.split("/");
    setNavState({ view, subView, params });
  }, []);

  return { navState, navigate };
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
export default function MemoMaster() {
  // ── Tous les états existants ───────────────────────────────────────────
  const [sessionInProgress, setSessionInProgress] = useState(false);
  const [visibleCardsCount, setVisibleCardsCount] = useState(30);
  const [visibleBadgesCount, setVisibleBadgesCount] = useState(30);
  const [visibleLockedBadgesCount, setVisibleLockedBadgesCount] = useState(20);
  const loadMoreCardsRef = useRef(null);
  const [lastFailed, setLastFailed] = useState(null);
  const [lastLabDoc, setLastLabDoc] = useState(null);
  const [lastQuiz, setLastQuiz] = useState(null);
  const startMatchingMode = () => { };
  const generateQcmChoices = async () => ["A", "B", "C", "D"];
  const openCard = () => { };
  const resumeQuiz = () => { };
  const { navState, navigate } = useNavigation("dashboard");
  const view = navState.view;
  const setView = (v) => navigate(v);
  const addSubView = view === "add" && navState.subView ? navState.subView : "single";
  const setAddSubView = (sv) => navigate(`add/${sv}`);
  const labSubView = view === "lab" && navState.subView ? navState.subView : "home";
  const setLabSubView = (sv) => navigate(`lab/${sv}`);
  const projectSubView = view === "projects" && navState.subView ? navState.subView : "hub";
  const setProjectSubView = (sv) => navigate(`projects/${sv}`);
  const examSubView = view === "exam" && navState.subView ? navState.subView : "home";
  const setExamSubView = (sv) => navigate(`exam/${sv}`);

  const [expressions, setExpressionsState] = useState([]);
  const setExpressions = useCallback((action) => {
    setExpressionsState(prev => {
      const rawNext = typeof action === "function" ? action(prev) : action;
      const next = Array.isArray(rawNext) ? rawNext.filter(Boolean) : [];
      const seen = new Set();
      const normalizedNext = next.filter(e => {
        if (!e?.id || seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      }).map(e => ({
        ...e,
        front: e.front || '',
        back: e.back || '',
        category: e.category || 'Général',
        type: e.type || 'qa',
        level: Number(e.level || 0),
        nextReview: e.nextReview ? normalizeDate(e.nextReview) : null
      }));
      const persistCards = () => mirrorToWatermelon(normalizedNext).then(() => syncWithFirebase()).catch(console.warn);
      if (typeof window !== "undefined" && window.requestIdleCallback) {
        window.requestIdleCallback(persistCards);
      } else {
        setTimeout(persistCards, 100);
      }
      return normalizedNext;
    });
  }, []);
  const [categories, setCategories] = useState(CATEGORIES_DEFAULT);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ streak: 0, lastSession: null, totalReviews: 0, aiGenerated: 0, examsDone: 0 });
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [lastViewedBadgesCount, setLastViewedBadgesCount] = useState(0);
  const [videos, setVideos] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [oneHanded, setOneHanded] = useState(false);

  const [powerLevel, setPowerLevel] = useState(0);
  const [devLogs, setDevLogs] = useState([]);
  const [roadmap, setRoadmap] = useState([
    { id: 2, task: "Vision IA (Analyse de schémas)", done: true },
    { id: 3, task: "Biométrie Cognitive", done: true },
    { id: 4, task: "Mnémoniques Absurdes IA", done: true },
    { id: 5, task: "Lancer la v4 sur Vercel", done: false },
  ]); const [isDarkMode, setIsDarkMode] = useState(new Date().getHours() >= 19 || new Date().getHours() <= 6);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  const [lofiPlaying, setLofiPlaying] = useState(false);
  // POMODORO TIMER
  const [pomoTime, setPomoTime] = useState(50 * 60);
  const [isPomoActive, setIsPomoActive] = useState(false);
  const [cardStartTime, setCardStartTime] = useState(null);

  const getNextGroqKey = useCallback(() => {
    return [
      import.meta.env.VITE_GROQ_API_KEY,
      import.meta.env.VITE_GROQ_API_KEY_5,
      import.meta.env.VITE_GROQ_API_KEY_6,
      import.meta.env.VITE_GROQ_API_KEY_7
    ].filter(Boolean);
  }, []);

  useEffect(() => {
    let interval = null;
    if (isPomoActive && pomoTime > 0) {
      interval = setInterval(() => setPomoTime(t => t - 1), 1000);
    } else if (pomoTime === 0) {
      setIsPomoActive(false);
      setPomoTime(50 * 60);
      try {
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
        // FIX : play() retourne une Promise — sans .catch, un rejet
        // (autoplay bloqué par le navigateur) devient un "unhandled rejection".
        const p = audio.play();
        if (p && typeof p.catch === "function") p.catch(() => { });
      } catch (e) { }
    }
    return () => clearInterval(interval);
  }, [isPomoActive, pomoTime]);

  // ── LECTEUR AUDIO GOD MODE ──────────────────────────────────────────────────
  const [lofiVolume, setLofiVolume] = useState(0.4);
  const [lofiStation, setLofiStation] = useState(0);
  const [showLofiPlayer, setShowLofiPlayer] = useState(false);
  const audioRef = useRef(null);

  const RADIO_STATIONS = [
    { name: "Lofi Study (Deep Work)", url: "https://streams.ilovemusic.de/iloveradio17.mp3", emoji: "📚" },
    { name: "Piano Focus (Classique)", url: "https://live.radioart.com/fSolo_piano.mp3", emoji: "🎹" },
    { name: "Alpha Waves & Ambient", url: "https://ice1.somafm.com/deepspaceone-128-mp3", emoji: "🌌" },
    { name: "Flow State (Minimalist)", url: "https://ice1.somafm.com/groovesalad-128-mp3", emoji: "🌊" },
    { name: "RDR2 - Stand Unshaken", url: "/audio/unshaken.mp3", emoji: "🤠" },
    { name: "RDR2 - See The Fire", url: "/audio/seethefire.mp3", emoji: "🔥" },
    { name: "Train - Conor & Jay", url: "/audio/train.mp3", emoji: "🚂" },
  ];

  // Gestion native du lecteur audio (plus robuste pour les flux de webradio)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = lofiVolume;
      if (lofiPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.error("Audio Player Play Error:", err);
            if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
              setLofiPlaying(false);
            }
          });
        }
      } else {
        audioRef.current.pause();
      }
    }
  }, [lofiPlaying, lofiStation, lofiVolume]);

  const [toast, setToast] = useState(null);
  const [newBadge, setNewBadge] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCat, setFilterCat] = useState("Toutes");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterLevel, setFilterLevel] = useState("Tous");

  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewSessionDone, setReviewSessionDone] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [socraticHint, setSocraticHint] = useState("");
  const [socraticMode, setSocraticMode] = useState(false);
  const [rabbitHoleOpen, setRabbitHoleOpen] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [mnemonicText, setMnemonicText] = useState("");
  const [mnemonicLoading, setMnemonicLoading] = useState(false);
  const [mnemonicSaved, setMnemonicSaved] = useState(false);

  // Examens
  const [examConfig, setExamConfig] = useState({ category: "Toutes", count: 10, timePerCard: 30, mode: "standard", difficulty: "adaptative" });
  const [examActive, setExamActive] = useState(false);
  const [examQueue, setExamQueue] = useState([]);
  const [examIndex, setExamIndex] = useState(0);
  const [examAnswers, setExamAnswers] = useState([]);
  const [examTimer, setExamTimer] = useState(0);
  const [examRevealed, setExamRevealed] = useState(false);
  const examTimerRef = useRef(null);
  const [swipeX, setSwipeX] = useState(0); // position horizontale du swipe
  const [swipeY, setSwipeY] = useState(0); // position verticale du swipe
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [qcmChoices, setQcmChoices] = useState([]);
  const [qcmSelected, setQcmSelected] = useState(null);
  const [qcmLoading, setQcmLoading] = useState(false);
  const [customExams, setCustomExams] = useState([]);

  const [selectedCustomExam, setSelectedCustomExam] = useState(null);
  const [newCustomExam, setNewCustomExam] = useState({ title: "", description: "", questions: [] });
  const [customExamEditQ, setCustomExamEditQ] = useState({ question: "", answer: "", choices: ["", "", "", ""], isQcm: false });
  const [examStreak, setExamStreak] = useState(0);
  const [examStartTime, setExamStartTime] = useState(null);

  // Fiches Add/Edit
  const [addForm, setAddForm] = useState({ front: "", back: "", example: "", category: "", imageUrl: null, type: "qa" });
  // Refs sur les textareas pour l'insertion intelligente de markdown
  const backTextareaRef = useRef(null);
  const exampleTextareaRef = useRef(null);
  // Types de fiches god-tier
  const CARD_TYPES = [
    { id: "qa", label: "Q/A", icon: "❓", desc: "Question / Réponse classique" },
    { id: "definition", label: "Définition", icon: "📖", desc: "Terme + définition exacte" },
    { id: "concept", label: "Concept", icon: "💡", desc: "Idée à comprendre en profondeur" },
    { id: "code", label: "Code", icon: "💻", desc: "Extrait, fonction, examen de code" },
    { id: "table", label: "Tableau", icon: "📊", desc: "Données comparatives, grille" },
    { id: "list", label: "Liste", icon: "📋", desc: "Étapes, items, checklist" },
    { id: "formula", label: "Formule", icon: "🧮", desc: "Maths / physique (LaTeX dans $...$)" },
    { id: "cloze", label: "Texte à trous", icon: "🧩", desc: "Phrase avec {{c1::mot}} masqué" },
    { id: "image", label: "Image", icon: "🖼️", desc: "Carte visuelle (image en façade)" },
    { id: "mixed", label: "Mixte", icon: "✨", desc: "Texte + code + tableau" },
  ];
  // Insertion intelligente de markdown dans un textarea/input
  const insertMarkdown = (field, before, after = "", placeholder = "") => {
    const ref = field === "back" ? backTextareaRef : exampleTextareaRef;
    const el = ref.current;
    setAddForm(f => {
      const txt = f[field] || "";
      const start = el?.selectionStart ?? txt.length;
      const end = el?.selectionEnd ?? txt.length;
      const sel = txt.slice(start, end) || placeholder;
      const next = txt.slice(0, start) + before + sel + after + txt.slice(end);
      // Replacer le curseur après insertion
      requestAnimationFrame(() => {
        if (!el) return;
        const cursor = start + before.length + sel.length;
        el.focus();
        try { el.setSelectionRange(cursor, cursor); } catch { }
      });
      return { ...f, [field]: next };
    });
  };
  const [editingId, setEditingId] = useState(null);
  const [editReturnTo, setEditReturnTo] = useState(null); // { view: 'review', cardId } pour retourner après édition
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiBatchCount, setAiBatchCount] = useState(5);
  const [aiFromText, setAiFromText] = useState("");
  const [aiFromTextLoading, setAiFromTextLoading] = useState(false);
  const [batchPreview, setBatchPreview] = useState([]);
  const [showBatchPreview, setShowBatchPreview] = useState(false);

  const [uploadLoading, setUploadLoading] = useState(false);
  const [visionScanCards, setVisionScanCards] = useState([]); // fiches extraites depuis image
  const [visionScanLoading, setVisionScanLoading] = useState(false);
  const [listening, setListening] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const practiceRecognitionRef = useRef(null);

  // ── GOD LEVEL ADD v9 — Nouveaux états ──────────────────────────────────
  const [addMarkdownPreview, setAddMarkdownPreview] = useState(false);
  const [addTemplate, setAddTemplate] = useState("standard"); // standard | code | qa | definition
  const [addTemplatePresets] = useState([
    { id: "standard", label: "Standard", fields: ["front", "back", "example"] },
    { id: "code", label: "Code Review", fields: ["front", "back", "example", "codeSnippet"] },
    { id: "qa", label: "Q&A", fields: ["front", "back"] },
    { id: "definition", label: "Définition", fields: ["front", "back", "analogy"] },
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

  // ── GOD LEVEL UX: Slash Commands & Selection Menu ──
  const [slashMenu, setSlashMenu] = useState({ open: false, field: null, query: "", selectedIndex: 0 });
  const [selectionMenu, setSelectionMenu] = useState({ open: false, field: null, text: "", start: 0, end: 0 });

  // ── GOD LEVEL UX: Source & Forge Split Screen ──
  const [dragOverForge, setDragOverForge] = useState(false);
  const [dropForgeLoading, setDropForgeLoading] = useState(false);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  // ── GOD LEVEL UX: Table de Craft Visuelle (Batch Canvas) ──
  const [batchCanvasTransform, setBatchCanvasTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [batchLinks, setBatchLinks] = useState([]); // { source: id, target: id }
  const [batchMousePos, setBatchMousePos] = useState({ x: 0, y: 0 });
  const batchDragRef = useRef({ isPanning: false, draggingIdx: null, startX: 0, startY: 0, linkFrom: null, offsetX: 0, offsetY: 0 });

  const [forgeAnim, setForgeAnim] = useState(false);

  // ── GOD LEVEL UX: Chat-to-Card Copilot ──
  const [chatToCardMessages, setChatToCardMessages] = useState([{ role: "assistant", text: "Salut ! Dis-moi ce que tu dois retenir. Je vais te forger des fiches sur-mesure, et tu pourras me demander de les ajuster (ex: \"Rends l'exemple plus drôle\", \"Scinde la 2ème en deux fiches\").", cards: [] }]);
  const [chatToCardInput, setChatToCardInput] = useState("");
  const [chatToCardLoading, setChatToCardLoading] = useState(false);
  const chatToCardEndRef = useRef(null);

  const SLASH_COMMANDS = [
    { id: "reformuler", icon: "✨", label: "Reformuler", desc: "Proposer des alternatives" },
    { id: "expliquer", icon: "🤖", label: "Expliquer", desc: "Explication pédagogique" },
    { id: "analogie", icon: "🌱", label: "Analogie", desc: "Métaphore pour un enfant" },
    { id: "mermaid", icon: "📐", label: "Diagramme", desc: "Ouvrir l'éditeur Mermaid" },
    { id: "image", icon: "🖼️", label: "Image", desc: "Rechercher une image" },
  ];

  // ── GOD LEVEL UX: Sound Design ──
  const playSound = useCallback((type) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "whoosh") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.1);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === "clack") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) { }
  }, []);

  const handleFieldChange = (e, field) => {
    const val = e.target.value;
    setAddForm(f => ({ ...f, [field]: val }));

    const caretPos = e.target.selectionStart;
    const textBeforeCaret = val.substring(0, caretPos);
    const match = textBeforeCaret.match(/(?:^|\n|\s)\/([a-zA-Z]*)$/);

    if (match) {
      setSlashMenu({
        open: true,
        field,
        query: match[1].toLowerCase(),
        selectedIndex: 0,
      });
    } else {
      setSlashMenu(prev => prev.open ? { ...prev, open: false } : prev);
    }
  };

  const executeSlashCommand = async (cmdId) => {
    const field = slashMenu.field;
    if (!field) return;

    const val = addForm[field];
    const lastIndex = val.lastIndexOf("/" + slashMenu.query);
    let newText = val;
    if (lastIndex !== -1) {
      newText = val.substring(0, lastIndex) + val.substring(lastIndex + 1 + slashMenu.query.length);
    }

    setAddForm(f => ({ ...f, [field]: newText }));
    setSlashMenu({ open: false, field: null, query: "", selectedIndex: 0 });

    if (cmdId === "reformuler") { generateReformulations(field); }
    else if (cmdId === "expliquer") { handleMicroAI(field); }
    else if (cmdId === "analogie") { generateMetaphore(); }
    else if (cmdId === "mermaid") { setAddDiagramMode(true); }
    else if (cmdId === "image") { setAddImageGallery(true); }
  };

  const handleFieldKeyDown = (e, field) => {
    if (slashMenu.open && slashMenu.field === field) {
      const filtered = SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(slashMenu.query) || c.id.includes(slashMenu.query));
      if (filtered.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setSlashMenu(prev => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % filtered.length })); return; }
        else if (e.key === "ArrowUp") { e.preventDefault(); setSlashMenu(prev => ({ ...prev, selectedIndex: (prev.selectedIndex - 1 + filtered.length) % filtered.length })); return; }
        else if (e.key === "Enter") { e.preventDefault(); executeSlashCommand(filtered[slashMenu.selectedIndex].id); return; }
        else if (e.key === "Escape") { e.preventDefault(); setSlashMenu(prev => ({ ...prev, open: false })); return; }
      }
    }
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); handleAdd(); }
  };

  const handleFieldSelect = (e, field) => {
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    if (start !== undefined && end !== undefined && start !== end) {
      const selectedText = e.target.value.substring(start, end);
      if (selectedText.trim().length > 0) {
        setSelectionMenu({ open: true, field, text: selectedText, start, end });
        return;
      }
    }
    setSelectionMenu({ open: false, field: null, text: "", start: 0, end: 0 });
  };

  const handleSelectionAction = async (action) => {
    const { field, text, start, end } = selectionMenu;
    setSelectionMenu({ open: false, field: null, text: "", start: 0, end: 0 });
    if (!field || !text) return;
    setAiLoading(true);
    try {
      let prompt = "";
      if (action === "raccourcir") prompt = `Raccourcis ce texte de manière très concise en gardant l'essence. Réponds UNIQUEMENT le nouveau texte sans guillemets :\n"${text}"`;
      if (action === "detailler") prompt = `Développe ce texte de manière détaillée et pédagogique. Réponds UNIQUEMENT le nouveau texte sans guillemets :\n"${text}"`;
      const raw = await callClaude("Tu es un assistant éditorial expert.", prompt);
      const newText = raw.trim();
      const fullText = addForm[field];
      const updatedText = fullText.substring(0, start) + newText + fullText.substring(end);
      setAddForm(f => ({ ...f, [field]: updatedText }));
      showToast("✨ Texte mis à jour !");
    } catch (e) { showToast("Erreur lors de l'action IA", "error"); }
    setAiLoading(false);
  };

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

  const [labDiagrams, setLabDiagrams] = useState([]);
  const [godModeLoading, setGodModeLoading] = useState(false);
  const [godModeResult, setGodModeResult] = useState(null);
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
  const [prepLoading, setPrepLoading] = useState({});

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
  const [isEnteringFlow, setIsEnteringFlow] = useState(false);
  const [stamina, setStamina] = useState(100);
  const [xpBurst, setXpBurst] = useState(null); // { amount: number, key: number }
  const [dashWidgets, setDashWidgets] = useState([
    "overview", "mission", "weekly", "plan", "retention", "modules", "quote", "goals"
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
  // ── GOD UPGRADES : Command Palette ⌘K ──────────────────────────────────────
  const [cmdOpen, setCmdOpen] = useState(false);
  useCommandPaletteShortcut(setCmdOpen);
  // ── GOD UPGRADES : vues filtrées sauvegardables ────────────────────────────
  const savedViewsApi = useSavedViews({ storage });

  const [statsExportLoading, setStatsExportLoading] = useState(false);
  const [statsSessionHistory, setStatsSessionHistory] = useState([]);
  const [statsWordCloud, setStatsWordCloud] = useState([]);
  const [statsForgettingCurve, setStatsForgettingCurve] = useState([]);
  const [statsFatigueAnalysis, setStatsFatigueAnalysis] = useState(null);
  const [statsCognitiveHeatmap, setStatsCognitiveHeatmap] = useState([]); // [{diff, retention}]
  const [statsWidgets, setStatsWidgets] = useState([
    "overview", "modules", "daily", "heatmap", "difficulty", "retention", "badges", "ai"
  ]); // widgets visibles
  const [wrongAnswersForConfusion, setWrongAnswersForConfusion] = useState([]);

  // ── GOD LEVEL UX v11 — 5 concepts d'actions sur les fiches ──────────────────
  const [cardKebabOpen, setCardKebabOpen] = useState(null);        // id de la carte dont le kebab est ouvert
  const [cardAccordionOpen, setCardAccordionOpen] = useState(null); // id de la carte accordéon ouverte
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);      // command palette ⌘K visible
  const [cmdPaletteCard, setCmdPaletteCard] = useState(null);       // carte ciblée par la palette
  const [cmdPaletteQuery, setCmdPaletteQuery] = useState("");        // texte de recherche
  const [cardSwipeState, setCardSwipeState] = useState({});         // { [id]: { x: 0, revealed: false } }
  const [cardsActionMode, setCardsActionMode] = useState("contextual"); // contextual | kebab | swipe | accordion | cmdpalette
  const [cardsSort, setCardsSort] = useState("date"); // date | level | alpha | due
  const [cardsHoveredId, setCardsHoveredId] = useState(null); // Pour le Neural Hover
  const [expandedCard, setExpandedCard] = useState(null); // Deep Dive Holographique
  const [selectedCards, setSelectedCards] = useState([]); // God Hand - Mass Selection
  const [timelineScrollRatio, setTimelineScrollRatio] = useState(0); // Timeline view scroll
  const [graphTransform, setGraphTransform] = useState({ x: 0, y: 0, scale: 1 }); // Graph view pan/zoom
  const graphDragRef = useRef({ isDragging: false, startX: 0, startY: 0 });

  // ── GOD LEVEL UI (Control Center) ───────────────────────────────────────────
  const [listTagsDrawerOpen, setListTagsDrawerOpen] = useState(false);
  const [listSelectedTag, setListSelectedTag] = useState(null);
  const [listSortLevel, setListSortLevel] = useState(null);
  const [listAdvancedOverlayOpen, setListAdvancedOverlayOpen] = useState(false);
  const [listXRayMode, setListXRayMode] = useState(false);
  const [listBiblioPanelOpen, setListBiblioPanelOpen] = useState(false);
  const [listRippleEffect, setListRippleEffect] = useState(false);
  const [listHoveredBtn, setListHoveredBtn] = useState(null);
  const [cardsCommunityLoading, setCardsCommunityLoading] = useState(false);

  // ── SIDEBAR GOD LEVEL ──────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarClock, setSidebarClock] = useState("");
  const [sidebarHoveredItem, setSidebarHoveredItem] = useState(null);
  const [sidebarRipple, setSidebarRipple] = useState(null);
  const [appSessionTime, setAppSessionTime] = useState(0);
  const [zenFocusMode, setZenFocusMode] = useState(false);

  // ── AUTO-COLLAPSE INTELLIGENT ─────────────────────────────────────────────
  useEffect(() => {
    if (view !== "dashboard") {
      setSidebarCollapsed(true);
    } else {
      setSidebarCollapsed(false);
    }
  }, [view]);

  // ── SCROLL DETECTION (HUD) ────────────────────────────────────────────────
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── MOBILE DETECTION ───────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileFabOpen, setMobileFabOpen] = useState(false);
  const [mobileAddSheetOpen, setMobileAddSheetOpen] = useState(false);

  const touchMainStartX = useRef(0);
  const touchMainStartY = useRef(0);
  const mainViewOrder = ["dashboard", "list", "add", "projects", "certifications", "opensource", "practice"];
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setSidebarClock(now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      setAppSessionTime(prev => prev + 1);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Rafraîchit la date courante à minuit pour forcer le recalcul de todayReviews
  const [currentDate, setCurrentDate] = useState(today());
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
    const timer = setTimeout(() => {
      setCurrentDate(today());
    }, msUntilMidnight);
    return () => clearTimeout(timer);
  }, [currentDate]);

  const todayReviews = useMemo(() => expressions.filter((e) => isDue(e.nextReview, currentDate) && (e.level || 0) < 7), [expressions, currentDate]);
  const masteredCount = useMemo(() => expressions.filter((e) => e.level >= 7).length, [expressions]);

  // ── Scroll-to-top à chaque changement de vue ──
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      const main = document.querySelector("main, [data-app-scroll], .app-scroll");
      if (main) main.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } catch { window.scrollTo(0, 0); }
  }, [view, navState.subView]);

  // Stamina regeneration
  useEffect(() => {
    if (view !== 'review' && view !== 'exam') {
      const timer = setInterval(() => {
        setStamina(s => Math.min(100, s + 1));
      }, 4000); // Regenerate 1 stamina every 4 seconds
      return () => clearInterval(timer);
    }
  }, [view]);

  // Keyboard shortcuts 1-9 pour naviguer dans la sidebar
  useEffect(() => {
    const NAV_IDS = ["dashboard", "projects", "certifications", "opensource", "add", "list", "categories", "practice", "stats", "badges", "lab"];
    const handleKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.altKey && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (NAV_IDS[idx]) {
          setView(NAV_IDS[idx]);
          e.preventDefault();
        }
      }
      // ⌘K / Ctrl+K — ouvre la command palette sur la dernière carte
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (view === "list" && cardsActionMode === "cmdpalette") {
          setCmdPaletteOpen(p => !p);
          setCmdPaletteQuery("");
        }
      }
      // Escape — ferme palette ou kebab
      if (e.key === "Escape") {
        setCmdPaletteOpen(false);
        setCardKebabOpen(null);
        setExpandedCard(null);
        setSelectedCards([]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [view, cardsActionMode]);

  // ── PROJECTS GOD MODE ─────────────────────────────────────────────────────
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [lessonCache, setLessonCache] = useState({});
  const [livingMemory, setLivingMemory] = useState(null);

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

  useEffect(() => {
    (async () => {
      try {
        // ⚡ PARALLELISATION : toutes les lectures Firebase/localStorage en même temps
        // Avant : 12 await séquentiels = jusqu'à 36s. Après : max 8s (en pratique 0ms avec localStorage-first)
        const [
          exps,
          cats,
          sess,
          st,
          badges,
          storedVids,
          storedCustomExams,
          storedLogs,
          storedRoadmap,
          storedLessonCache,
          storedProjects,
          storedLivingMemory,
          viewedBadges,
        ] = await Promise.all([
          loadInitialExpressionsFromWatermelon(),
          storage.get("categories_v3"),
          storage.get("sessions_v3"),
          storage.get("stats_v3"),
          storage.get("badges_v3"),
          storage.get("videos_v3"),
          storage.get("customExams_v1"),
          storage.get("devLogs_v1"),
          storage.get("roadmap_v1"),
          storage.get("lessonCache_v1"),
          storage.get("projects_v1"),
          storage.get("livingMemory_v1"),
          storage.get("badges_viewed_count"),
        ]);

        // ✅ Toutes les données sont récupérées AVANT de toucher aux états
        const { repaired: expsRepaired, count: dateFixCount } = repairCardDates(exps || []);
        if (dateFixCount > 0) console.info(`[dateRepair] ${dateFixCount} fiches avec dates anormales corrigées.`);
        setExpressions(expsRepaired);
        setCategories(cats || CATEGORIES_DEFAULT);
        setSessions(sess || []);
        setStats(st || { streak: 0, lastSession: null, totalReviews: 0, aiGenerated: 0, examsDone: 0 });
        setUnlockedBadges(badges || []);
        setVideos(storedVids || []);
        setCustomExams(storedCustomExams || []);
        setDevLogs(storedLogs || []);
        setRoadmap(storedRoadmap || roadmap);
        setLessonCache(storedLessonCache || {});
        setProjects(storedProjects || []);
        setProjectsLoaded(true);
        if (storedLivingMemory) setLivingMemory(storedLivingMemory);
        const resolvedCats = cats || CATEGORIES_DEFAULT;
        setAddForm((f) => ({ ...f, category: resolvedCats[0]?.name || "" }));
        setDocCategory(resolvedCats[0]?.name || "");
        // New Badges Notification Logic
        setLastViewedBadgesCount(viewedBadges || 0);

        // ✅ Un tick React complet avant d'activer la sauvegarde
        setTimeout(() => setLoaded(true), 100);
      } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
        setTimeout(() => {
          setLoaded(true);
          setToast({ msg: `⚠️ Erreur chargement Firebase — vos données peuvent être incomplètes. (${error?.message || error})`, type: "error" });
          setTimeout(() => setToast(null), 6000);
        }, 100);
      }
    })();
  }, []);

  // ─── Recharge les données si l'utilisateur change (ex: connexion Google) ───
  useEffect(() => {
    onAuthReady(() => {
      setLoaded(false);
      setExpressions([]);
      (async () => {
        try {
          // ⚡ Rechargement après changement d'utilisateur — aussi en parallèle
          const [exps, cats, sess, st, badges, storedProjects, viewedBadges] = await Promise.all([
            loadInitialExpressionsFromWatermelon(),
            storage.get("categories_v3"),
            storage.get("sessions_v3"),
            storage.get("stats_v3"),
            storage.get("badges_v3"),
            storage.get("projects_v1"),
            storage.get("badges_viewed_count"),
          ]);
          setExpressions(repairCardDates(exps || []).repaired);
          // FIX : ne jamais passer `undefined` à setCategories — sinon les
          // composants qui appellent categories.map / .filter plantent.
          setCategories((cats || []).length ? cats : CATEGORIES_DEFAULT);
          setSessions(sess || []);
          setStats(st || { streak: 0, lastSession: null, totalReviews: 0, aiGenerated: 0, examsDone: 0 });
          setUnlockedBadges(badges || []);
          setLastViewedBadgesCount(viewedBadges || 0);
          setProjects(storedProjects || []);
          setTimeout(() => setLoaded(true), 100);
        } catch (e) {
          console.error("[onAuthReady] Rechargement échoué:", e);
          setTimeout(() => setLoaded(true), 100);
        }
      })();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 🔄 iOS/Cross-device : recharge les fiches quand la sync Firebase pull du nouveau ───
  useEffect(() => {
    const onCardsSynced = async () => {
      try {
        const exps = await loadInitialExpressionsFromWatermelon();
        const { repaired } = repairCardDates(exps || []);
        setExpressions(repaired);
        console.info('[sync] Fiches rechargées après sync Firebase →', repaired.length);
      } catch (e) {
        console.warn('[sync] reload après cards_synced KO:', e);
      }
    };
    window.addEventListener('cards_synced', onCardsSynced);
    return () => window.removeEventListener('cards_synced', onCardsSynced);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMinimapClick = (index) => {
    if (filteredExps[index]) {
      const cardId = filteredExps[index].id;
      const element = document.getElementById(`card-${cardId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  // ── Effacer la notification de badges au survol de la vue ──
  useEffect(() => {
    if (view === "badges" && unlockedBadges.length > lastViewedBadgesCount) {
      setLastViewedBadgesCount(unlockedBadges.length);
      storage.set("badges_viewed_count", unlockedBadges.length);
    }
  }, [view, unlockedBadges.length, lastViewedBadgesCount]);

  useEffect(() => {
    const calcPower = expressions.length * 10 + stats.streak * 50 + stats.examsDone * 100 + unlockedBadges.length * 200;
    setPowerLevel(calcPower);
  }, [expressions, stats, unlockedBadges]);

  // ✅ Debounce : on attend 500ms de stabilité avant d'écrire dans Firebase
  // (réduit de 1500ms à 500ms pour limiter les pertes en cas d'actualisation rapide)
  const saveTimerRef = useRef({});
  const categoriesRef = useRef(categories);
  const sessionsRef = useRef(sessions);
  const badgesRef = useRef(unlockedBadges);
  const projectsRef = useRef(projects);

  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { badgesRef.current = unlockedBadges; }, [unlockedBadges]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  // ✅ Sauvegarde immédiate avant que l'utilisateur quitte / actualise la page
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!loaded) return;
      storage.set("categories_v3", categoriesRef.current);
      storage.set("sessions_v3", sessionsRef.current);
      storage.set("stats_v3", statsRef.current);
      storage.set("badges_v3", badgesRef.current);
      storage.set("projects_v1", projectsRef.current);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [loaded]);

  // Sauvegarde anti-crash : écriture synchrone sur localStorage + debounce pour Firebase
  const debouncedSave = useCallback((key, val, delay = 500) => {
    try {
      const newValStr = JSON.stringify(val);
      const existingStr = localStorage.getItem("memomaitre_" + key);
      if (newValStr === existingStr) return; // Évite les boucles de sauvegarde au chargement
      localStorage.setItem("memomaitre_" + key, newValStr);
      localStorage.setItem("memomaitre_" + key + "_ts", Date.now().toString());
    } catch { }

    if (saveTimerRef.current[key]) clearTimeout(saveTimerRef.current[key]);
    // On stocke la fonction de flush pour la déclencher au visibilitychange
    saveTimerRef.current[key + "_flush"] = () => storage.set(key, val);
    saveTimerRef.current[key] = setTimeout(() => {
      saveTimerRef.current[key + "_flush"]();
      delete saveTimerRef.current[key + "_flush"];
    }, delay);
  }, []);

  // Flush forcé au background (fermeture/changement d'onglet sur mobile)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        Object.keys(saveTimerRef.current).forEach(k => {
          if (k.endsWith("_flush") && typeof saveTimerRef.current[k] === "function") {
            saveTimerRef.current[k]();
          }
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => { if (loaded) debouncedSave("categories_v3", categories); }, [categories, loaded]);
  useEffect(() => { if (loaded) debouncedSave("sessions_v3", sessions); }, [sessions, loaded]);
  useEffect(() => { if (loaded) debouncedSave("stats_v3", stats); }, [stats, loaded]);
  useEffect(() => { if (loaded) debouncedSave("badges_v3", unlockedBadges); }, [unlockedBadges, loaded]);
  useEffect(() => { if (loaded) debouncedSave("customExams_v1", customExams); }, [customExams, loaded]);
  useEffect(() => { if (loaded) debouncedSave("devLogs_v1", devLogs); }, [devLogs, loaded]);
  useEffect(() => { if (loaded) debouncedSave("roadmap_v1", roadmap); }, [roadmap, loaded]);
  useEffect(() => { if (projectsLoaded) debouncedSave("projects_v1", projects); }, [projects, projectsLoaded]);
  useEffect(() => { if (loaded) debouncedSave("videos_v3", videos); }, [videos, loaded]);

  const checkBadges = useCallback((exps, st, sess, currentBadges) => {
    const mastered = exps.filter((e) => e.level >= 7).length;
    const dueCount = exps.filter((e) => isDue(e.nextReview, today()) && (e.level || 0) < 7).length;
    const state = {
      totalCards: exps.length,
      streak: st.streak,
      mastered,
      dueCount,
      totalReviews: st.totalReviews,
      aiGenerated: st.aiGenerated,
      examsDone: st.examsDone,
      lateNightSessions: st.lateNightSessions || 0,
      earlyMorningSessions: st.earlyMorningSessions || 0,
      bestDayReviews: st.bestDayReviews || 0,
      modulesCount: categories?.length || 0,
      pdfsAnalyzed: st.pdfsAnalyzed || 0,
    };
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
    const hour = new Date().getHours();
    setStats((prev) => {
      const yesterday = addDays(todayStr, -1);
      let ns = prev.streak;
      if (prev.lastSession === yesterday) ns = prev.streak + 1;
      else if (prev.lastSession !== todayStr) ns = 1;

      // 📊 Compteurs additionnels pour les badges (étaient checkés mais jamais incrémentés)
      const lateNight = (hour >= 0 && hour < 5) ? (prev.lateNightSessions || 0) + 1 : (prev.lateNightSessions || 0);
      const earlyMorning = (hour >= 5 && hour < 7) ? (prev.earlyMorningSessions || 0) + 1 : (prev.earlyMorningSessions || 0);
      // bestDayReviews = max sur une seule journée
      const todayTotal = (prev.lastSession === todayStr ? (prev.todayReviews || 0) : 0) + count;
      const bestDayReviews = Math.max(prev.bestDayReviews || 0, todayTotal);

      const newStats = {
        ...prev,
        streak: ns,
        lastSession: todayStr,
        totalReviews: prev.totalReviews + count,
        lateNightSessions: lateNight,
        earlyMorningSessions: earlyMorning,
        todayReviews: todayTotal,
        bestDayReviews,
      };
      statsRef.current = newStats;
      return newStats;
    });
    setSessions((prev) => {
      const existing = prev.find((s) => s.date === todayStr);
      if (existing) return prev.map((s) => s.date === todayStr ? { ...s, count: s.count + count } : s);
      return [...prev, { date: todayStr, count }];
    });
    // Trigger XP Burst animation
    const xpGain = count * 10; // Example: 10 XP per card
    setXpBurst({ amount: xpGain, key: Date.now() });
    setTimeout(() => setXpBurst(null), 3000); // Animation duration
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
  const [cardsDuelInput1, setCardsDuelInput1] = useState("");
  const [cardsDuelInput2, setCardsDuelInput2] = useState("");

  // ── GOD LEVEL – Effets dashboard prédictif ─────────────────────────────
  useEffect(() => {
    if (expressions.length === 0) return;
    const hardest = [...expressions].sort((a, b) => (b.difficulty || 9) - (a.difficulty || 9))[0];
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
      const daysUntilReview = Math.max(0, (new Date(e.nextReview) - new Date(today())) / 86400000);
      const retention = e.stability ? fsrsR(daysUntilReview, e.stability) : 1;
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
    if (q === 0) {
      playAgain();
    }
    else if (q === 1) playHard();
    else playCorrect();

    // Decrease stamina
    const staminaCost = q === 0 ? 5 : q === 1 ? 3 : 1; // More cost for wrong answers
    setStamina(s => Math.max(0, s - staminaCost));

    // elapsedDays: null → fsrs.js le calcule automatiquement depuis nextReview
    const updated = fsrs({ ...exp, elapsedDays: null }, q);
    // newLevel : q=0 → retour à 0 | q=1 (Hard) → reste au niveau actuel | q=5 → +1
    const newLevel = q === 0 ? 0 : q === 1 ? Math.max(exp.level, 1) : Math.min(7, exp.level + 1);
    const histEntry = { date: today(), q, newLevel, interval: updated.interval };
    setExpressions(prev => prev.map(e => e.id === exp.id ? { ...e, ...updated, level: newLevel, reviewHistory: [...(e.reviewHistory || []), histEntry] } : e));

    if (newLevel >= 7 && exp.level < 7) {
      fireConfetti();
      showToast("🎉 Fiche maîtrisée ! Confetti !", "success");
    }

    // ── Auto-détection du style d'apprentissage (après 10 révisions) ──

    const done = reviewSessionDone + 1;
    setReviewSessionDone(done);
    updateStreakAfterSession(1);

    if (reviewIndex + 1 >= reviewQueue.length) {
      setExpressions(prevExps => {
        // Utiliser statsRef.current mis à jour dans updateStreakAfterSession
        // + fusion avec les stats locales pour le count
        const updatedStats = { ...statsRef.current, totalReviews: (statsRef.current.totalReviews || 0) };
        checkBadges(prevExps, updatedStats, sessions, unlockedBadges);
        return prevExps;
      });
      const sessionCards = reviewQueue;
      const avgTime = sessionCards.length > 0 ? sessionTimer / sessionCards.length : 0;
      const avgBefore = (sessionCards.reduce((s, c) => s + (c.level || 0), 0) / sessionCards.length).toFixed(1);
      // avgLevelAfter : niveau estimé après la session (q=0 → 0, q=1 → max(level,1), q=5 → min(7, level+1))
      const avgAfter = (sessionCards.reduce((s, c) => {
        const ans = c._answer;
        if (ans === undefined) return s + (c.level || 0);
        if (ans === 0) return s + 0;
        if (ans === 1) return s + Math.max(c.level, 1);
        return s + Math.min(7, (c.level || 0) + 1);
      }, 0) / sessionCards.length).toFixed(1);

      setSessionSummary({
        totalCards: sessionCards.length,
        avgTime: Math.round(avgTime),
        avgLevelBefore: avgBefore,
        avgLevelAfter: avgAfter,
      });
      setShowSessionSummary(true);
      setView("review");
    } else {
      setReviewIndex(i => i + 1);
      setRevealed(false);
      setUserAnswer("");
      setSocraticHint("");
      setSocraticMode(false);
      setRabbitHoleOpen(false);
      setMnemonicText("");
      setMnemonicSaved(false);
      setCardStartTime(Date.now());
    }
  }, [playCorrect, playHard, playAgain, fireConfetti, reviewIndex, reviewQueue, reviewSessionDone, sessionTimer, expressions, sessions, unlockedBadges, updateStreakAfterSession, checkBadges, showToast]);

  const handleAnswer = useCallback((q) => {
    const exp = reviewQueue[reviewIndex];
    if (!exp) {
      setShowSessionSummary(true);
      return;
    }
    // Pas de mutation directe du state — on enregistre la réponse via setReviewQueue
    setReviewQueue(prev => prev.map((card, idx) => idx === reviewIndex ? { ...card, _answer: q } : card));
    handleAnswerWithFeedback(q, exp);
  }, [reviewQueue, reviewIndex, handleAnswerWithFeedback]);

  // Calcul dynamique des intervalles FSRS pour les boutons "Juicy"
  const getPreviewInterval = useCallback((card, q) => {
    if (!card) return "";
    try {
      const simulated = fsrs({ ...card, elapsedDays: null }, q);
      if (simulated.interval < 1) return "< 1j";
      if (simulated.interval < 30) return `${Math.round(simulated.interval)}j`;
      if (simulated.interval < 365) return `${Math.round(simulated.interval / 30)}m`;
      return `${(simulated.interval / 365).toFixed(1)}a`;
    } catch (e) { return "?"; }
  }, []);

  // Upload Storage & Vision IA
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Vérification du type
    if (!file.type.startsWith("image/")) {
      showToast("Veuillez sélectionner une image.", "error");
      return;
    }

    setUploadLoading(true);
    try {
      // 4.4 — Redimensionnement/compression des images côté client
      const compressedBlob = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height = Math.round((height *= MAX_WIDTH / width));
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width = Math.round((width *= MAX_HEIGHT / height));
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Compression failed"));
              },
              "image/jpeg",
              0.8 // qualité 80%
            );
          };
          img.onerror = reject;
          img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const fileName = `${Date.now()}_${file.name.replace(/\.[^/.]+$/, ".jpg")}`;
      const storageRef = ref(fbStorage, `users/${getFbUser()}/images/${fileName}`);
      await uploadBytes(storageRef, compressedBlob);
      const url = await getDownloadURL(storageRef);
      setAddForm(f => ({ ...f, imageUrl: url }));
      showToast("📸 Image sauvegardée et attachée !");
    } catch (error) {
      console.error("Erreur Upload:", error);
      showToast("Erreur lors de l'upload.", "error");
    }
    setUploadLoading(false);
  };

  const handleSemanticEval = async (overrideAnswer) => {
    const answerToEval = typeof overrideAnswer === 'string' ? overrideAnswer : userAnswer;
    if (!answerToEval.trim()) return;
    setEvalLoading(true);
    try {
      const card = reviewQueue[reviewIndex];
      const res = await gradeSemanticVoice(answerToEval, card.back, card.front, callClaude);

      if (res.score === 5) {
        setRevealed(true);
        handleAnswerWithFeedback(5, card); // Update la carte direct
        showToast("✅ Validé sémantiquement : " + res.feedback, "success");
      } else {
        // Déclencher le SocraticChat
        setSocraticMode(true);
        showToast("❌ Pas tout à fait : " + res.feedback, "warning");
      }
    } catch (err) {
      console.error("Erreur Socratique:", err);
      showToast("Erreur d'analyse. Affiche la réponse manuellement pour cette fois.", "error");
    } finally {
      setEvalLoading(false);
    }
  };

  const handleVisionAI = async () => {
    if (!addForm.imageUrl) return;
    setVisionScanLoading(true);
    setVisionScanCards([]);
    try {
      const prompt = `Tu es un outil d'extraction de texte et de création de flashcards.

RÈGLE ABSOLUE : Recopie EXACTEMENT ce qui est écrit dans l'image, mot pour mot, sans rien modifier, résumer, corriger ou reformuler. Si un mot est abrégé, recopie l'abréviation. Si une phrase est incomplète, recopie-la telle quelle.

Ta tâche :
1. Lis tout le texte visible dans l'image.
2. Identifie les paires recto/verso naturelles dans ce contenu (ex : terme → définition, question → réponse, mot → traduction, concept → explication).
3. Si le contenu n'est pas déjà structuré en paires, découpe-le logiquement en blocs : chaque bloc distinct devient une flashcard, avec le titre/thème en recto et le contenu en verso.
4. Chaque flashcard doit contenir UNIQUEMENT du texte extrait tel quel de l'image. Aucune invention, aucun ajout.

Réponds UNIQUEMENT en JSON valide, tableau de fiches :
[{"front":"texte recto exactement comme dans l'image","back":"texte verso exactement comme dans l'image"},...]

Si tu ne vois aucun texte lisible dans l'image, renvoie : []`;
      const raw = await callClaude(prompt, "Extrais le texte de cette image.", true, addForm.imageUrl);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        showToast("Aucun texte lisible détecté dans l'image.", "error");
      } else {
        setVisionScanCards(parsed.map((c, i) => ({ ...c, id: Date.now().toString() + i })));
        showToast(`📸 ${parsed.length} fiche(s) extraite(s) du texte de l'image !`, "success");
      }
    } catch (err) {
      showToast("Erreur lors de l'extraction. Vérifiez que l'image contient du texte lisible.", "error");
    }
    setVisionScanLoading(false);
  };

  const confirmVisionScanCards = () => {
    if (visionScanCards.length === 0) return;
    const newExps = visionScanCards
      .filter(c => (c.front || "").trim() && (c.back || "").trim())
      .map(c => ({
        id: crypto.randomUUID(),
        front: c.front.trim(),
        back: c.back.trim(),
        example: "",
        category: addForm.category,
        level: 0, nextReview: today(), createdAt: today(),
        easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
      }));
    if (newExps.length === 0) { showToast("Aucune fiche valide à sauvegarder.", "error"); return; }
    setExpressions(prev => { const updated = [...newExps, ...prev]; checkBadges(updated, statsRef.current, sessions, unlockedBadges); return updated; });
    setStats(prev => ({ ...prev, aiGenerated: prev.aiGenerated + newExps.length }));
    showToast(`🎉 ${newExps.length} fiche(s) sauvegardée(s) !`, "success");
    setVisionScanCards([]);
    setAddForm(f => ({ ...f, imageUrl: null }));
  };

  const handleSemanticSearch = async () => {
    if (!searchQuery.trim()) return;
    setSemanticLoading(true);
    try {
      const conceptsList = expressions.map(e => e.front).join(", ");
      const raw = await callClaude(
        `Tu es le moteur de recherche sémantique interne de l'application. L'utilisateur cherche : "${searchQuery}". Parmi les concepts suivants disponibles dans la base de données de l'utilisateur : [${conceptsList}]. Trouve les concepts qui se rapprochent le plus DU SENS de sa recherche (pas besoin que ce soit le mot exact). Renvoie UNIQUEMENT les concepts trouvés séparés par des virgules, tels qu'ils apparaissent exactement dans la liste. Si rien ne correspond, renvoie "Aucun résultat".`,
        "Quels sont les concepts liés ?"
      );
      const trimmed = raw.trim();
      if (trimmed === "Aucun résultat" || trimmed.toLowerCase().includes("aucun résultat sémantique")) {
        showToast("🧠 Aucun résultat sémantique trouvé.", "info");
      } else {
        // Construire un regex qui matche n'importe lequel des concepts retournés
        const concepts = trimmed.split(",").map(c => c.trim()).filter(Boolean);
        // On met la recherche sur le premier concept (le plus pertinent) pour l'affichage
        setSearchQuery(concepts[0] || searchQuery);
        showToast(`🧠 ${concepts.length} concept(s) trouvé(s) : ${concepts.slice(0, 3).join(", ")}${concepts.length > 3 ? "…" : ""}`);
      }
    } catch (err) {
      showToast("Erreur lors de la recherche neurale.", "error");
    }
    setSemanticLoading(false);
  };

  const generateMnemonic = async () => {
    const card = reviewQueue[reviewIndex];
    if (!card) return;
    setMnemonicLoading(true);
    setMnemonicSaved(false);
    try {
      const raw = await callClaude(`Génère un moyen mnémotechnique ABSURDE, une histoire drôle ou une image mentale (Palais de mémoire) très marquante pour mémoriser ce concept technique. Concept: ${card.front} Explication: ${card.back} Sois extrêmement court et percutant (max 3 phrases). Ne renvoie que l'histoire, sans fioriture.`, "Aide-moi à mémoriser ça.");
      setMnemonicText(raw.trim());
    } catch (err) {
      showToast("Erreur lors de la génération du mnémonique.", "error");
    }
    setMnemonicLoading(false);
  };

  const saveMnemonic = () => {
    const card = reviewQueue[reviewIndex];
    if (!card || !mnemonicText) return;
    const updatedExample = card.example
      ? `${card.example}\n\n💡 Mnémonique :\n${mnemonicText}`
      : `💡 Mnémonique :\n${mnemonicText}`;
    setExpressions(prev => prev.map(e => e.id === card.id ? { ...e, example: updatedExample } : e));
    setReviewQueue(prev => prev.map((c, i) => i === reviewIndex ? { ...c, example: updatedExample } : c));
    setMnemonicSaved(true);
    showToast("💾 Mnémonique sauvegardé dans la fiche !");
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    playSound("whoosh");
    setAiLoading(true);
    try {
      const catName = addForm.category;
      const formType = addForm.type || "qa";
      const isEnglish = catName.toLowerCase().includes("anglais") || catName.toLowerCase().includes("english");
      const isCode = formType === "code" || catName.toLowerCase().includes("java") || catName.toLowerCase().includes("spring") || catName.toLowerCase().includes("javascript") || catName.toLowerCase().includes("js") || catName.toLowerCase().includes("informatique") || catName.toLowerCase().includes("code") || catName.toLowerCase().includes("python") || catName.toLowerCase().includes("lisp");
      const isTable = formType === "table";

      let structureInstructions = "";
      if (isEnglish) {
        structureInstructions = `
⚠️ FICHE D'ANGLAIS — STRUCTURE OBLIGATOIRE pour "back" (respecter EXACTEMENT cet ordre, ces emojis, et ces sections) :

✅ QUAND L'UTILISER :
[Une phrase claire qui explique dans QUEL contexte / pour QUEL besoin on utilise cette expression. Maximum 2 phrases.]

🎬 SENS DANS CE CONTEXTE :
[Une phrase d'exemple concrète et vivante (style YouTuber/coach) qui montre l'expression en situation. En français.]

💬 EXEMPLES :
• [Phrase 1 en anglais]
  🗣 [Phonétique "maison" 100% basée sur les sons du français — pas d'API ni d'IPA. Ex: "I am the best" → "aï am ze beste"]
  ↳ [Traduction française]

• [Phrase 2 en anglais]
  🗣 [Phonétique maison FR]
  ↳ [Traduction française]

• [Phrase 3 en anglais — un peu plus avancée]
  🗣 [Phonétique maison FR]
  ↳ [Traduction française]

🔄 ALTERNATIVES / SYNONYMES : [3 à 5 alternatives anglaises, séparées par des virgules]

📌 PIÈGE / NUANCE : [Une nuance d'usage, un faux-ami, ou une erreur classique que font les francophones avec cette expression. UNE phrase.]

RÈGLES STRICTES POUR LA PHONÉTIQUE MAISON :
- 100% basée sur les sons du français (le lecteur ne connaît PAS l'API/IPA).
- Sons typiques : "the" → "ze" ou "ze" ; "th" sourd → "s" ; "h" aspiré → "h" (rendre l'aspiration) ; "r" anglais → "r" doux ; "i" court → "i" ; "ee" long → "i:" ou "iii" ; "oo" → "ou" ; "u" → "eu" ou "a" selon le mot.
- Une phonétique par phrase complète, pas mot par mot isolé.
- Toujours en minuscules, sans guillemets internes.
- Doit pouvoir être LUE À VOIX HAUTE par un francophone sans entraînement et sonner anglais.`;
      } else if (isCode) {
        structureInstructions = `
⚠️ FICHE DE CODE — STRUCTURE OBLIGATOIRE pour "back" (respecter EXACTEMENT) :

⚙️ DÉFINITION :
[Définition technique précise, 1-2 phrases.]

💡 USAGE :
[Quand utiliser ce concept, dans quel contexte réel. 1-2 phrases.]

💻 EXEMPLE :
\`\`\`<langage>
<bloc de code BIEN INDENTÉ, syntaxiquement correct, prêt à exécuter. Toujours commencer par la fence \`\`\`<langage> puis aller à la ligne. NE JAMAIS mettre le code sur une seule ligne.>
\`\`\`

⚠️ ATTENTION :
[Piège fréquent, erreur commune, ou point critique. 1-2 phrases.]

🔁 ÉQUIVALENT / ALTERNATIVE : [autre façon d'écrire la même chose, ou concept connexe]

RÈGLES STRICTES POUR LE BLOC DE CODE :
- TOUJOURS encadré par \`\`\`<langage> et \`\`\` sur leurs propres lignes.
- TOUJOURS indenté proprement (2 ou 4 espaces selon le langage).
- Pas de pseudo-code : code réel, exécutable, copiable-collable.`;
      } else if (isTable) {
        structureInstructions = `
⚠️ FICHE DE TYPE TABLEAU — INTERDICTION d'utiliser un tableau Markdown brut (| col | col |). 
À la place, organise les données en LISTE STRUCTURÉE lisible :

📋 [Titre du tableau si pertinent]

• **[Item 1]** — [valeur ou définition]
• **[Item 2]** — [valeur ou définition]
• **[Item 3]** — [valeur ou définition]

🧭 LECTURE : [une phrase qui explique comment lire/utiliser ces données]

📌 À RETENIR : [le takeaway clé]`;
      }

      const systemPrompt = `Tu es un assistant pédagogique expert pour un étudiant en Licence Informatique à Dakar, Sénégal. Génère UNE fiche de révision en JSON UNIQUEMENT (pas de markdown autour, pas de backticks autour du JSON, pas de texte avant/après).

Format strict: {"front":"...","back":"...","example":"..."}
- front : le concept/mot/expression à mémoriser (concis, max 10 mots)
- back  : explication RICHE et STRUCTURÉE — voir instructions ci-dessous
- example : un exemple concret et pratique (peut être vide si déjà inclus dans back)
${structureInstructions}

QUALITÉ ATTENDUE : niveau "god mode". Chaque fiche doit être aussi riche et utile que la meilleure fiche Anki premium. Pas de remplissage générique.`;
      const raw = await callClaude(systemPrompt, `Génère une fiche sur: ${aiPrompt}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      setAddForm((f) => ({ ...f, front: parsed.front || "", back: parsed.back || "", example: parsed.example || "" }));
      showToast("✨ Fiche générée par l'IA !");
      setStats((prev) => ({ ...prev, aiGenerated: prev.aiGenerated + 1 }));
      setAiPrompt("");
    } catch (error) {
      const msg = error.message?.includes("QUOTA") || error.message?.includes("429") ? "⏳ Quota IA atteint — attends 1 minute !" : "Erreur IA. Réessaie.";
      showToast(msg, "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleMicroAI = async (field) => {
    if (!addForm.front.trim()) { showToast("Saisis d'abord le Recto !", "error"); return; }
    playSound("whoosh");
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
    playSound("whoosh");
    setAiBatchLoading(true);
    try {
      const catName = addForm.category;
      const formType = addForm.type || "qa";
      const isEnglish = catName.toLowerCase().includes("anglais") || catName.toLowerCase().includes("english");
      const isCode = formType === "code" || catName.toLowerCase().includes("java") || catName.toLowerCase().includes("spring") || catName.toLowerCase().includes("javascript") || catName.toLowerCase().includes("js") || catName.toLowerCase().includes("informatique") || catName.toLowerCase().includes("code") || catName.toLowerCase().includes("python") || catName.toLowerCase().includes("lisp");
      const isTable = formType === "table";

      let structureInstructions = "";
      if (isEnglish) {
        structureInstructions = `
⚠️ POUR CHAQUE FICHE D'ANGLAIS, "back" DOIT suivre EXACTEMENT cette structure (mêmes emojis, même ordre) :

✅ QUAND L'UTILISER :
[Contexte d'usage en 1-2 phrases françaises]

🎬 SENS DANS CE CONTEXTE :
[Une phrase exemple vivante en français qui montre l'expression en situation]

💬 EXEMPLES :
• [Phrase 1 en anglais]
  🗣 [Phonétique "maison" 100% basée sur les sons du français — pas d'IPA. Ex: "I am the best" → "aï am ze beste"]
  ↳ [Traduction française]

• [Phrase 2 en anglais]
  🗣 [Phonétique maison FR]
  ↳ [Traduction française]

• [Phrase 3 en anglais]
  🗣 [Phonétique maison FR]
  ↳ [Traduction française]

🔄 ALTERNATIVES / SYNONYMES : [3 à 5 alternatives anglaises séparées par des virgules]

📌 PIÈGE / NUANCE : [Une nuance ou erreur classique de francophone]

RÈGLES STRICTES DE LA PHONÉTIQUE MAISON : 100% basée sur les sons français, lisible sans entraînement par un francophone ("the"→"ze", "th" sourd→"s", "h" aspiré→"h", "ee" long→"i:", "oo"→"ou"). Une phonétique par phrase, en minuscules, sans guillemets internes.`;
      } else if (isCode) {
        structureInstructions = `
⚠️ POUR CHAQUE FICHE DE CODE, "back" DOIT suivre EXACTEMENT cette structure :

⚙️ DÉFINITION :
[Définition technique précise, 1-2 phrases]

💡 USAGE :
[Quand utiliser ce concept dans un projet réel, 1-2 phrases]

💻 EXEMPLE :
\`\`\`<langage>
<code BIEN INDENTÉ, syntaxiquement correct, copiable-collable. Toujours ouvrir/fermer la fence sur sa propre ligne.>
\`\`\`

⚠️ ATTENTION :
[Piège ou erreur fréquente, 1-2 phrases]

🔁 ÉQUIVALENT / ALTERNATIVE : [autre façon ou concept connexe]

RÈGLES STRICTES : le bloc de code DOIT être encadré par \`\`\`<langage> / \`\`\` sur leurs propres lignes, parfaitement indenté (jamais sur une seule ligne).`;
      } else if (isTable) {
        structureInstructions = `
⚠️ POUR CHAQUE FICHE DE TYPE TABLEAU, INTERDICTION d'utiliser un tableau Markdown brut (| col | col |). Organise les données en LISTE STRUCTURÉE :

📋 [Titre du tableau si pertinent]
• **[Item]** — [valeur ou définition]
• **[Item]** — [valeur ou définition]

🧭 LECTURE : [comment lire/utiliser ces données]
📌 À RETENIR : [le takeaway clé]`;
      }

      const systemPrompt = `Tu es un assistant pédagogique expert (niveau "god mode"). Génère exactement ${aiBatchCount} fiches de révision RICHES, variées et de qualité premium. Réponds UNIQUEMENT en JSON strict (pas de markdown autour, pas de texte avant/après) : {"cards":[{"front":"...","back":"...","example":"..."},...]}.${structureInstructions ? "\n" + structureInstructions : ""}`;
      const raw = await callClaude(systemPrompt, `Génère ${aiBatchCount} fiches sur: ${aiPrompt}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      const cards = parsed.cards || parsed;

      // ── Assignation des positions pour la Constellation (Canvas) ──
      const layoutedCards = (Array.isArray(cards) ? cards : []).map((c, i) => ({
        ...c,
        id: `batch_node_${Date.now()}_${i}`,
        x: 60 + (i % 3) * 320 + (Math.random() * 40 - 20),
        y: 80 + Math.floor(i / 3) * 220 + (Math.random() * 40 - 20),
      }));

      const initialLinks = [];
      for (let i = 1; i < layoutedCards.length; i++) {
        initialLinks.push({ source: layoutedCards[i - 1].id, target: layoutedCards[i].id });
      }
      setBatchLinks(initialLinks);
      setBatchCanvasTransform({ x: 0, y: 0, scale: 1 });
      setBatchPreview(layoutedCards);
      setShowBatchPreview(true);
      showToast(`✨ ${cards.length} fiches générées !`, "info");
    } catch (err) { showToast("Erreur batch.", "error"); }
    setAiBatchLoading(false);
  };

  const confirmBatch = () => {
    if (batchPreview.length === 0) return;
    const newExps = batchPreview.map(card => ({
      id: crypto.randomUUID(),
      front: (card.front || "").trim(), back: (card.back || "").trim(), example: (card.example || "").trim(), category: addForm.category,
      level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
    })).filter(e => e.front && e.back);
    setExpressions(prev => { const updated = [...newExps, ...prev]; checkBadges(updated, statsRef.current, sessions, unlockedBadges); return updated; });
    setStats(prev => ({ ...prev, aiGenerated: prev.aiGenerated + newExps.length }));
    showToast(`🎉 ${newExps.length} fiches sauvegardées !`);
    setBatchPreview([]); setShowBatchPreview(false); setAiPrompt("");
    setBatchLinks([]);
  };
  const removeBatchCard = (idx) => {
    setBatchPreview(prev => {
      const nodeToRemove = prev[idx];
      if (nodeToRemove) setBatchLinks(links => links.filter(l => l.source !== nodeToRemove.id && l.target !== nodeToRemove.id));
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── GOD LEVEL UX: Chat-to-Card Logic ──
  useEffect(() => {
    if (addSubView === "chat") chatToCardEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatToCardMessages, chatToCardLoading, addSubView]);

  const handleSendChatToCard = async () => {
    if (!chatToCardInput.trim() || chatToCardLoading) return;
    // Nettoyage de la dictée vocale : fillers, répétitions, faux-départs
    const userText = cleanSpeechTranscript(chatToCardInput.trim()) || chatToCardInput.trim();
    const newHistory = [...chatToCardMessages, { role: "user", text: userText }];
    setChatToCardMessages(newHistory);
    setChatToCardInput("");
    setChatToCardLoading(true);

    try {
      const sysPrompt = `Tu es un Copilot expert en création de flashcards (FSRS).
L'utilisateur converse avec toi pour créer ou affiner des fiches de révision.
Réponds TOUJOURS au format JSON STRICT suivant :
{
  "message": "Ta réponse conversationnelle courte et motivante à l'utilisateur",
  "cards": [
    { "front": "Question/Concept", "back": "Explication claire", "example": "Exemple concret" }
  ]
}
Si l'utilisateur demande de modifier des cartes précédentes, renvoie la NOUVELLE liste mise à jour. S'il n'y a pas de cartes à afficher, renvoie un tableau "cards" vide.

${SPEECH_HYGIENE_PROMPT}`;

      const conversation = newHistory.map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.text} ${m.cards?.length ? JSON.stringify(m.cards) : ''}`).join("\n\n");
      const raw = await callClaude(sysPrompt, conversation);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);

      setChatToCardMessages([...newHistory, { role: "assistant", text: parsed.message || "Voici ce que j'ai préparé :", cards: Array.isArray(parsed.cards) ? parsed.cards : [] }]);
    } catch (e) {
      showToast("Erreur Copilot : " + e.message, "error");
      setChatToCardMessages([...newHistory, { role: "assistant", text: "Désolé, j'ai eu un bug de communication. Peux-tu reformuler ?", cards: [] }]);
    }
    setChatToCardLoading(false);
  };

  const saveChatCard = (card) => {
    const newExp = { id: crypto.randomUUID(), front: card.front || "", back: card.back || "", example: card.example || "", category: addForm.category, level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null };
    setExpressions(prev => { const updated = [newExp, ...prev]; checkBadges(updated, statsRef.current, sessions, unlockedBadges); return updated; });
    setStats(prev => ({ ...prev, aiGenerated: prev.aiGenerated + 1 }));
    showToast("✅ Fiche sauvegardée !");
  };
  const saveAllChatCards = (cards) => {
    if (!cards || cards.length === 0) return;
    const newExps = cards.map((c, i) => ({ id: crypto.randomUUID(), front: c.front || "", back: c.back || "", example: c.example || "", category: addForm.category, level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null }));
    setExpressions(prev => { const updated = [...newExps, ...prev]; checkBadges(updated, statsRef.current, sessions, unlockedBadges); return updated; });
    setStats(prev => ({ ...prev, aiGenerated: prev.aiGenerated + newExps.length }));
    showToast(`✅ ${newExps.length} fiches sauvegardées d'un coup !`);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACK POUR LAB (ajout de fiches depuis le Lab autonome)
  // ═══════════════════════════════════════════════════════════════════════════
  const addCardsFromLab = (cards, meta = {}) => {
    const todayStr = today(); // utilise l'import depuis ./utils/dateUtils
    
    const uniqueCards = [];
    let skippedCount = 0;
    
    for (const c of cards) {
      const front = c.front || "";
      const similarInExisting = findSimilarCards(front, expressions, 0.75);
      const similarInNew = findSimilarCards(front, uniqueCards, 0.75);
      
      if (similarInExisting.length > 0 || similarInNew.length > 0) {
        skippedCount++;
      } else {
        uniqueCards.push(c);
      }
    }

    if (uniqueCards.length === 0 && cards.length > 0) {
      showToast(`⚠️ Toutes les fiches (${cards.length}) sont des doublons et ont été ignorées.`);
      return;
    }

    const newExps = uniqueCards.map((c, i) => ({
      id: crypto.randomUUID(),
      front: c.front || "",
      back: c.back || "",
      example: c.example || "",
      category: c.category || "Lab",
      type: c.type || "qa",
      level: 0,
      nextReview: todayStr,
      createdAt: todayStr,
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewHistory: [],
      imageUrl: null
    }));
    
    setExpressions(prev => [...newExps, ...prev]);
    setStats(prev => ({
      ...prev,
      aiGenerated: prev.aiGenerated + newExps.length,
      pdfsAnalyzed: (prev.pdfsAnalyzed || 0) + (meta.source === 'pdf' ? 1 : 0),
    }));
    
    if (skippedCount > 0) {
      showToast(`🎉 ${newExps.length} fiches ajoutées (${skippedCount} doublon(s) ignoré(s)) !`);
    } else {
      showToast(`🎉 ${newExps.length} fiches ajoutées depuis le Lab !`);
    }
  };

  // ── Bridge Académie → FSRS ────────────────────────────────────────────────
  // Appelé quand un teach-back est validé : crée 1-3 fiches dans MemoMaster
  // pour révision automatique J+1 / J+7 / J+30.

  const handleAIFromText = async () => {
    if (!aiFromText.trim()) return;
    playSound("whoosh");
    setAiFromTextLoading(true);
    try {
      const raw = await callClaude(`À partir du texte fourni, extrais les 5 à 7 concepts clés en fiches de révision JSON. Format strict: {"cards":[{"front":"...","back":"...","example":"..."},...]}`, `Module: ${addForm.category}\n\nTexte:\n${aiFromText.slice(0, 3000)}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      setBatchPreview(Array.isArray(parsed.cards || parsed) ? (parsed.cards || parsed) : []);
      setShowBatchPreview(true);
    } catch (err) { showToast("Erreur analyse texte.", "error"); }
    setAiFromTextLoading(false);
  };

  const handleDropToForge = async (e) => {
    e.preventDefault();
    setDragOverForge(false);
    const droppedText = e.dataTransfer.getData("text/plain");
    if (!droppedText || droppedText.trim().length < 5) {
      showToast("Texte trop court ou invalide.", "error");
      return;
    }
    setDropForgeLoading(true);
    playSound("whoosh");
    try {
      const raw = await callClaude(
        `Tu es un assistant pédagogique. L'utilisateur a surligné un passage d'un cours pour en faire une fiche de révision. Génère UNE SEULE fiche pertinente à partir de ce texte. Format strict JSON: {"cards":[{"front":"...","back":"...","example":"..."}]}`,
        `Texte surligné :\n"${droppedText}"`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      const newCards = Array.isArray(parsed.cards) ? parsed.cards : (Array.isArray(parsed) ? parsed : [parsed]);

      setBatchPreview(prev => [...newCards, ...prev]);
      setShowBatchPreview(true);
      showToast("✨ Pépite extraite et forgée !");
    } catch (err) {
      showToast("Erreur lors de l'extraction de la fiche.", "error");
    }
    setDropForgeLoading(false);
  };

  // ── GOD LEVEL UX: Jauge de Mémorabilité & Optimisation FSRS ──
  const memScore = useMemo(() => {
    if (!addForm.front && !addForm.back) return null;
    let score = 100;
    let feedback = [];

    const frontWords = addForm.front.trim().split(/\s+/).filter(Boolean).length;
    const backWords = addForm.back.trim().split(/\s+/).filter(Boolean).length;

    if (frontWords > 12) { score -= 20; feedback.push("Recto trop long (vise < 12 mots)"); }
    else if (frontWords > 0 && frontWords < 2) { score -= 5; }

    if (backWords > 40) { score -= 25; feedback.push("Verso trop chargé (surcharge cognitive)"); }
    else if (backWords > 0 && backWords < 3) { score -= 10; feedback.push("Verso très court (manque de contexte ?)"); }

    if (!addForm.example.trim()) { score -= 15; feedback.push("Manque d'exemple concret"); }

    const nonAtomicRegex = / et | ou |,|;/g;
    const frontNonAtomic = (addForm.front.match(nonAtomicRegex) || []).length;
    if (frontNonAtomic > 1) { score -= 15; feedback.push("Plusieurs concepts détectés (manque d'atomicité)"); }

    score = Math.max(10, Math.min(100, score));

    let color = "#22C55E";
    let label = "Parfaitement atomique 🟢";
    if (score < 50) { color = "#EF4444"; label = "Surcharge cognitive 🔴"; }
    else if (score < 80) { color = "#F59E0B"; label = "Améliorable 🟡"; }

    return { score, color, label, feedback };
  }, [addForm.front, addForm.back, addForm.example]);

  const handleOptimizeFSRS = async () => {
    setOptimizeLoading(true);
    playSound("whoosh");
    try {
      const prompt = `Tu es un expert FSRS (Free Spaced Repetition Scheduler). Cette flashcard est trop chargée ou mal formulée, ce qui nuit à la mémorisation à long terme. Objectif: Scinde-la en plusieurs cartes plus petites et "atomiques" (un seul concept par carte), ou reformule-la pour qu'elle soit plus directe. Réponds UNIQUEMENT au format JSON: {"cards":[{"front":"...","back":"...","example":"..."}]}`;
      const input = `Front: ${addForm.front}\nBack: ${addForm.back}\nExample: ${addForm.example}`;
      const raw = await callClaude(prompt, input);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      const cards = Array.isArray(parsed?.cards) ? parsed.cards : [];

      if (cards.length === 1) {
        setAddForm(f => ({ ...f, front: cards[0].front || "", back: cards[0].back || "", example: cards[0].example || "" }));
        showToast("✨ Carte optimisée et reformulée !");
      } else if (cards.length > 1) {
        setBatchPreview(cards);
        setShowBatchPreview(true);
        setAddSubView("batch");
        showToast(`✨ Carte scindée en ${cards.length} cartes atomiques !`);
        setAddForm(f => ({ ...f, front: "", back: "", example: "" })); // On vide pour éviter le doublon
      } else {
        showToast("Aucune amélioration trouvée.", "info");
      }
    } catch (e) { showToast("Erreur lors de l'optimisation IA", "error"); }
    setOptimizeLoading(false);
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
        const raw = event.results[0][0].transcript.trim();
        const transcript = cleanSpeechTranscript(raw);
        if (transcript && !isMeaninglessSpeech(raw)) {
          setAddForm((f) => ({ ...f, [field]: (f[field] ? f[field] + " " : "") + transcript }));
          showToast("🎙️ Transcription réussie !");
        } else if (raw) {
          showToast("🤔 Trop d'hésitations détectées, réessaie plus clairement.", "warning");
        }
        setListening(null);
      };
      recognition.onerror = () => { showToast("Échec transcription.", "error"); setListening(null); };
      recognition.onend = () => setListening(null);
      recognition.start();
    } catch (err) { showToast("Micro refusé.", "error"); setListening(null); }
  };
  const stopVoice = () => { setListening(null); };

  const handleAdd = (inverted = false) => {
    if (!addForm.front.trim() || !addForm.back.trim()) { showToast("Recto et verso obligatoires !", "error"); return; }

    // Capturer les valeurs avant le reset
    const frontSnapshot = addForm.front;
    const backSnapshot = addForm.back;
    const exampleSnapshot = addForm.example;
    const categorySnapshot = addForm.category;
    const typeSnapshot = addForm.type || "qa";

    // ── GOD UPGRADES : détection doublons sémantiques ──────────────────────
    try {
      const similars = findSimilarCards(frontSnapshot, expressions, 0.8);
      if (similars.length) {
        const top = similars[0];
        if (!window.confirm(`⚠️ Une fiche similaire existe :\n"${top.card.front}"\n(similarité ${Math.round(top.similarity * 100)}%)\n\nAjouter quand même ?`)) return;
      }
    } catch (e) { /* upgrades indisponibles : on continue */ }

    // Jouer l'effet sonore et animer
    playSound("clack");
    setForgeAnim(true);

    setTimeout(() => {
      if (editingId) {
        // Sauvegarder l'ancienne version
        saveVersion(editingId);
        setExpressions((prev) => prev.map((e) => e.id === editingId
          ? {
            ...e,
            front: frontSnapshot.trim(),
            back: backSnapshot.trim(),
            example: exampleSnapshot?.trim() || "",
            category: categorySnapshot,
            type: typeSnapshot,
            imageUrl: addForm.imageUrl,
            audioUrl: addAudioUrl,        // ajout audio
            layers: addLayers.length > 1 ? addLayers : undefined, // couches
          }
          : e
        ));
        setEditingId(null); showToast("✏️ Fiche mise à jour !");

        // ⏎ Retour automatique à la session de révision si on était en train de réviser
        if (editReturnTo && editReturnTo.view === "review") {
          const targetId = editReturnTo.cardId;
          setEditReturnTo(null);
          // Rafraîchir la queue avec les données à jour et se repositionner sur la même fiche
          setReviewQueue(prevQueue => {
            const updatedQueue = prevQueue.map(c => {
              if (c.id !== targetId) return c;
              return {
                ...c,
                front: frontSnapshot.trim(),
                back: backSnapshot.trim(),
                example: exampleSnapshot?.trim() || "",
                category: categorySnapshot,
                type: typeSnapshot,
              };
            });
            const idx = updatedQueue.findIndex(c => c.id === targetId);
            if (idx >= 0) setReviewIndex(idx);
            return updatedQueue;
          });
          setRevealed(false);
          setUserAnswer("");
          setCardStartTime(Date.now());
          // Reset du formulaire avant navigation
          setAddForm((f) => ({ ...f, front: "", back: "", example: "", imageUrl: null, type: "qa" }));
          setAddAudioUrl(null); setAddAudioBlob(null);
          setAddLayers([{ back: "" }]); setAddDiagramMode(false);
          setAddDiagramSvg(null);
          setAddDoublonCheck(null);
          setAddReformulations({});
          setAddMetaphoreText("");
          setForgeAnim(false);
          setView("review");
          return;
        }
      } else {
        const newExp = {
          id: Date.now().toString(),
          front: frontSnapshot.trim(),
          back: backSnapshot.trim(),
          example: exampleSnapshot?.trim() || "",
          category: categorySnapshot,
          type: typeSnapshot,
          imageUrl: addForm.imageUrl,
          audioUrl: addAudioUrl,          // enregistrement audio
          layers: addLayers.length > 1 ? addLayers.map(l => l.back.trim()).filter(Boolean) : undefined,
          level: 0, nextReview: today(), createdAt: today(),
          easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: []
        };
        const newExps = [newExp];

        if (inverted && addAutoInverted) {
          const invertedExp = {
            id: Date.now().toString() + '_inv',
            front: backSnapshot.trim(),
            back: frontSnapshot.trim(),
            example: exampleSnapshot.trim() ? `(inversée) ${exampleSnapshot.trim()}` : "",
            category: categorySnapshot,
            type: typeSnapshot,
            level: 0, nextReview: today(), createdAt: today(),
            easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
          };
          newExps.push(invertedExp);
        }

        setExpressions((prev) => { const updated = [...newExps, ...prev]; checkBadges(updated, statsRef.current, sessions, unlockedBadges); return updated; });
        showToast(inverted && addAutoInverted ? "✅ Fiche + Inversée ajoutées !" : "✅ Fiche ajoutée !");
      }

      // Reset
      setAddForm((f) => ({ ...f, front: "", back: "", example: "", imageUrl: null, type: "qa" }));
      setAddAudioUrl(null); setAddAudioBlob(null);
      setAddLayers([{ back: "" }]); setAddDiagramMode(false);
      setAddDiagramSvg(null);
      setAddDoublonCheck(null);
      setAddReformulations({});
      setAddMetaphoreText("");
      setForgeAnim(false);
    }, 450);
  };

  const handleAddWithInverted = () => handleAdd(true);

  const startEdit = (exp) => { setAddForm({ front: exp.front, back: exp.back, example: exp.example || "", category: exp.category, imageUrl: exp.imageUrl || null, type: exp.type || "qa" }); setEditingId(exp.id); setView("add"); };
  const cancelEdit = () => {
    setEditingId(null);
    setAddForm((f) => ({ ...f, front: "", back: "", example: "", imageUrl: null, type: "qa" }));
    setAddReformulations({}); setAddMetaphoreText(""); setAddDoublonCheck(null);
    if (editReturnTo && editReturnTo.view === "review") {
      setEditReturnTo(null);
      setView("review");
    }
  };
  const deleteExp = (id) => {
    setExpressions(prev => prev.filter(e => e.id !== id));
    showToast("Fiche supprimée.", "info");
  };

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

  const handleEnterFlow = () => {
    setIsEnteringFlow(true);
    if (window.navigator?.vibrate) window.navigator.vibrate([30, 50, 30]);
    setTimeout(() => {
      setIsEnteringFlow(false);
      startReview(null, "flow");
    }, 550);
  };

  const startReview = (catFilter = null, mode = "standard", fixedQueue = null) => {
    let queue;
    if (fixedQueue && fixedQueue.length > 0) {
      // Session ciblée : on utilise exactement les fiches fournies (ex: fiches urgentes)
      queue = getSmartQueue([...fixedQueue]);
    } else {
      queue = catFilter ? todayReviews.filter((e) => e.category === catFilter) : [...todayReviews];
      if (mode === "interleaving" || mode === "flow") {
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
    }

    if (queue.length === 0) { showToast("Aucune fiche à réviser !", "info"); return; }
    setReviewQueue(queue); setReviewIndex(0); setRevealed(false); setUserAnswer(""); setSocraticHint(""); setSocraticMode(false); setRabbitHoleOpen(false); setMnemonicText(""); setReviewSessionDone(0);
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
      // Seuil à 30s : hésiter plus de 30 secondes sur une carte bien maîtrisée (level >= 4) suggère une fatigue réelle
      if (timeTaken > 30000 && card.level >= 4) showToast("🧠 Fatigue cognitive détectée (> 30s). Prends ton temps ou fais une pause !", "info");
    }
    setRevealed(true);
  };

  const startVoiceReview = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mediaRecorder;
      const mimeType = (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("audio/webm")) ? "audio/webm" : "audio/mp4";
      try { mediaRecorder = new MediaRecorder(stream, { mimeType }); }
      catch { mediaRecorder = new MediaRecorder(stream); }

      voiceRecognitionRef.current = mediaRecorder;
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || mimeType });
        showToast("⏳ Transcription en cours...", "info");
        try {
          const transcript = await transcribeAudio(blob, "fr");
          if (transcript) {
            setUserAnswer(transcript);
            handleSemanticEval(transcript);
          } else {
            showToast("🤷 Aucune parole détectée.", "warning");
          }
        } catch (err) {
          showToast("Erreur transcription: " + err.message, "error");
        }
      };
      mediaRecorder.start();
      showToast("🎙️ Parle maintenant... (Max 10s)");

      setTimeout(() => {
        if (voiceRecognitionRef.current && voiceRecognitionRef.current.state === "recording") {
          voiceRecognitionRef.current.stop();
        }
      }, 10000);
    } catch (err) {
      showToast("🎤 Micro refusé ou indisponible.", "error");
    }
  };

  const handleRevealAndStopVoice = () => {
    if (voiceRecognitionRef.current && voiceRecognitionRef.current.state === "recording") {
      voiceRecognitionRef.current.stop();
    }
    handleReveal();
  };

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement.tagName;
      const isInField = tag === "INPUT" || tag === "TEXTAREA" || document.activeElement.isContentEditable;
      if (view === "review") {
        if (e.code === "Space" && !revealed && !isInField) { e.preventDefault(); handleReveal(); }
        if (revealed && !isInField) { if (e.key === "1") handleAnswer(0); if (e.key === "2") handleAnswer(1); if (e.key === "3") handleAnswer(3); if (e.key === "4") handleAnswer(5); }
      }
      if (view === "exam" && examActive) {
        if (e.code === "Space" && !examRevealed && !isInField && examConfig.mode !== "qcm") { e.preventDefault(); setExamRevealed(true); }
        if (examRevealed && !isInField && examConfig.mode !== "qcm") { if (e.key === "1") handleExamAnswer(0); if (e.key === "2") handleExamAnswer(3); if (e.key === "3") handleExamAnswer(5); }
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

    let pool = examConfig.category === "Toutes" ? expressions : expressions.filter((e) => (e.category || "").trim().toLowerCase() === (examConfig.category || "").trim().toLowerCase());
    pool = getDifficultyPool(pool, examConfig.difficulty);
    if (pool.length === 0) pool = examConfig.category === "Toutes" ? expressions : expressions.filter((e) => (e.category || "").trim().toLowerCase() === (examConfig.category || "").trim().toLowerCase());
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

  // ── CHARGEMENT HISTORIQUE EXAMENS ─────────────────────────────────────
  useEffect(() => {
    storage.get("exam_history").then(h => {
      if (h) setExamHistory(h);
      setExamHistoryLoaded(true);
    }).catch(() => { });
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
      const avgTime = answers.length > 0 ? Math.round(answers.reduce((s, a) => s + a.timeSpent, 0) / answers.length) : 0;
      const raw = await callClaude(
        `Tu es un coach pédagogique expert. Analyse les résultats de cet examen et génère un rapport personnalisé UNIQUEMENT en JSON valide sans markdown:
{"globalVerdict":"Une phrase de verdict percutant","strengths":["Point fort 1","Point fort 2"],"weaknesses":["Faiblesse 1","Faiblesse 2"],"behaviorPattern":"Analyse du comportement (ex: répond trop vite, hésite sur certains modules...)","topPriority":"La chose la plus urgente à travailler","actionPlan":["Action concrète 1","Action concrète 2","Action concrète 3"],"motivationalMessage":"Message motivant et personnalisé"}`,
        `Score: ${score}%\nQuestions ratées: ${wrongs.join(", ") || "Aucune"}\nRéponses rapides (<3s): ${fast}\nRéponses lentes (>20s): ${slow}\nTemps moyen: ${avgTime}s\nModule: ${examConfig.category}\nMode: ${examConfig.mode}`
      );
      setExamAiReport(safeParseJSON(raw));
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
      const topTraps = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const raw = await callClaude(
        `Tu es un expert en analyse pédagogique. Analyse ces erreurs récurrentes et génère UNIQUEMENT du JSON: {"traps":[{"concept":"...","frequency":3,"confusionWith":"Ce que l'étudiant confond probablement","remedy":"Conseil spécifique pour retenir ce concept"}],"globalPattern":"Pattern global détecté","urgentCards":["concept1","concept2"]}`,
        `Erreurs récurrentes (concept: nb fois raté):\n${topTraps.map(([f, n]) => `"${f}": ${n}x`).join("\n")}`
      );
      setExamRecurringTraps(safeParseJSON(raw));
    } catch (e) { showToast("Erreur analyse : " + e.message, "error"); }
    setExamRecurringLoading(false);
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
    // Paire correcte : même carte (même id), côtés opposés (front ↔ back)
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
      setExamMatchingWrong(prev => [...prev, `${examMatchingLeft.id}-${id}`]);
      setExamMatchingLeft(null);
      showToast("❌ Mauvaise connexion !", "error");
    }
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
      const parsed = safeParseJSON(clean);
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
      const parsed = safeParseJSON(clean);
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
        const parsed = safeParseJSON(clean);
        (parsed.tags || []).forEach(item => { newTags[item.id] = item.tags; });
      }
      setCardsTags(newTags);
      showToast("🏷️ Tags sémantiques générés !");
    } catch (err) {
      showToast("Erreur tags : " + err.message, "error");
    }
    setCardsTagsLoading(false);
  };

  // Gestion de la playlist audio (TTS) — détection de langue phrase par phrase
  const playCardAudio = (card) => {
    if (!('speechSynthesis' in window)) return showToast("TTS non supporté.", "error");
    window.speechSynthesis.cancel();

    const isEnglishCard = card.category?.toLowerCase().includes('anglais');

    const detectLang = (text) => {
      if (!text) return isEnglishCard ? 'en-US' : 'fr-FR';
      const enWords = /\b(the|is|are|was|were|have|has|it|this|that|with|for|and|or|not|you|your|they|their|we|our|be|been|being|do|does|did|will|would|can|could|should|may|might|a|an|of|in|on|at|to|by|up|as|so|if|but|yet|than|then|when|where|how|what|who|why)\b/gi;
      const frWords = /\b(le|la|les|un|une|des|du|de|et|en|au|aux|que|qui|quoi|où|quand|comment|pourquoi|ce|cet|cette|ces|je|tu|il|elle|nous|vous|ils|elles|est|sont|être|avoir|faire|dans|sur|pour|avec|par|mais|ou|donc|or|ni|car|ne|pas|plus|très|bien|tout|même|aussi|comme|si|y|dont|qu)\b/gi;
      const enCount = (text.match(enWords) || []).length;
      const frCount = (text.match(frWords) || []).length;
      if (enCount === 0 && frCount === 0) return isEnglishCard ? 'en-US' : 'fr-FR';
      return enCount > frCount ? 'en-US' : 'fr-FR';
    };

    const buildSegments = (text) => {
      if (!text) return [];
      const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
      const segments = [];
      for (const sentence of sentences) {
        const lang = detectLang(sentence);
        if (segments.length > 0 && segments[segments.length - 1].lang === lang) {
          segments[segments.length - 1].text += ' ' + sentence.trim();
        } else {
          segments.push({ lang, text: sentence.trim() });
        }
      }
      return segments.filter(s => s.text);
    };

    const allSegments = [
      ...buildSegments(card.front),
      ...buildSegments(card.back),
    ];

    if (allSegments.length === 0) return;

    let idx = 0;
    const speakNext = () => {
      if (idx >= allSegments.length) {
        setCardsAudioPlaying(false);
        setCardsPlaylist(prev => {
          if (prev.length <= 1) return [];
          const next = prev.slice(1);
          if (next.length > 0) playCardAudio(next[0]);
          return next;
        });
        return;
      }
      const seg = allSegments[idx++];
      const utterance = new SpeechSynthesisUtterance(seg.text);
      utterance.lang = seg.lang;
      utterance.rate = 0.9;
      utterance.onend = speakNext;
      utterance.onerror = speakNext;
      window.speechSynthesis.speak(utterance);
    };

    speakNext();
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
      filtered = filtered.filter(e => (e.difficulty || (5 - (e.easeFactor || 2.5)) * 2) >= cardsAdvancedSearch.minDifficulty);
    if (cardsAdvancedSearch.maxDifficulty < 10)
      filtered = filtered.filter(e => (e.difficulty || (5 - (e.easeFactor || 2.5)) * 2) <= cardsAdvancedSearch.maxDifficulty);
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
      const parsed = safeParseJSON(clean);
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
      const parsed = safeParseJSON(clean);
      setCardsVariants(prev => ({ ...prev, [card.id]: parsed.variants || [] }));
      showToast("⚗️ 5 variantes générées !");
    } catch (err) {
      showToast("Erreur variantes : " + err.message, "error");
    }
    setCardsVariantsLoading(prev => ({ ...prev, [card.id]: false }));
  };

  // Bibliothèque communautaire (simulée)
  const loadCommunityCards = () => {
    setCardsCommunityLoading(true);
    setTimeout(() => {
      setCardsCommunity([
        { id: "com1", front: "What is a REST API?", back: "Representational State Transfer - an architectural style for designing networked applications.", example: "GET /users", category: "🇬🇧 Anglais", level: 0, nextReview: today(), easeFactor: 2.5, interval: 1 },
        { id: "com2", front: "Polymorphisme", back: "Capacité d'un objet à prendre plusieurs formes. En Java, via l'héritage et les interfaces.", example: "List<String> list = new ArrayList<>();", category: "☕ Java / Spring Boot", level: 0, nextReview: today(), easeFactor: 2.5, interval: 1 },
        { id: "com3", front: "Closures in JS", back: "A closure is the combination of a function bundled together with references to its surrounding state.", example: "function init() { var name = 'Mozilla'; function displayName() { alert(name); } return displayName; }", category: "Javascript", level: 0, nextReview: today(), easeFactor: 2.5, interval: 1 }
      ]);
      setCardsCommunityLoaded(true);
      setCardsCommunityLoading(false);
    }, 600);
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
    setCardsDuelInput1("");
    setCardsDuelInput2("");
    setCardsDuelActive(true);
  };

  const handleDuelAnswer = (player, answer) => {
    const normalized = (s) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");
    if (player === 1) setCardsDuelPlayer1(answer);
    else setCardsDuelPlayer2(answer);
    const p1ans = player === 1 ? answer : cardsDuelPlayer1;
    const p2ans = player === 2 ? answer : cardsDuelPlayer2;
    if (p1ans !== null && p2ans !== null) {
      const correct = normalized(cardsDuelCard.back);
      const p1correct = correct.includes(normalized(p1ans)) || normalized(p1ans).includes(correct.substring(0, Math.floor(correct.length * 0.6)));
      const p2correct = correct.includes(normalized(p2ans)) || normalized(p2ans).includes(correct.substring(0, Math.floor(correct.length * 0.6)));
      let msg = "";
      if (p1correct && !p2correct) msg = "🏆 Joueur 1 gagne !";
      else if (!p1correct && p2correct) msg = "🏆 Joueur 2 gagne !";
      else if (p1correct && p2correct) msg = "🤝 Égalité ! Les deux ont juste.";
      else msg = "😅 Personne n'a trouvé !";
      showToast(msg);
      setTimeout(() => setCardsDuelActive(false), 3000);
    }
  };

  // ── GOD HAND ACTIONS ──
  const godHandGenerateStory = async () => {
    if (selectedCards.length < 2) return showToast("Sélectionne au moins 2 cartes pour une histoire.", "error");
    const cards = expressions.filter(e => selectedCards.includes(e.id));
    const concepts = cards.map(c => c.front).join(", ");
    showToast("🧬 Génération de l'histoire en cours...", "info");
    try {
      const raw = await callClaude(`Tu es un conteur. Invente une histoire courte, mémorable et absurde qui relie ces concepts techniques pour aider à les mémoriser. Retourne l'histoire en format JSON: {"story":"..."}.`, `Concepts: ${concepts}`);
      const parsed = safeParseJSON(raw);
      if (parsed?.story) {
        setExpandedCard({ id: "story", front: "📖 Histoire Mnémonique", back: parsed.story, category: "God Hand", level: 0, reviewHistory: [] });
        setSelectedCards([]);
      }
    } catch (e) { showToast("Erreur lors de la génération.", "error"); }
  };

  const godHandCreateMCQ = async () => {
    if (selectedCards.length < 2) return showToast("Sélectionne au moins 2 cartes pour un QCM.", "error");
    const cards = expressions.filter(e => selectedCards.includes(e.id));
    const content = cards.map(c => `${c.front}: ${c.back}`).join(" | ");
    showToast("⚔️ Création du QCM...", "info");
    try {
      const raw = await callClaude(`Génère un QCM à choix unique (4 options) qui teste la compréhension globale de ces concepts croisés. JSON: {"question":"...","options":["A","B","C","D"],"answer":"A","explanation":"..."}`, `Concepts: ${content}`);
      const parsed = safeParseJSON(raw);
      if (parsed?.question) {
        setExpandedCard({ id: "mcq", front: "⚔️ QCM Croisé", back: `**${parsed.question}**<br><br>${parsed.options.join("<br>")}<br><br><details><summary>Réponse</summary>${parsed.answer} - ${parsed.explanation}</details>`, category: "God Hand", level: 0, reviewHistory: [] });
        setSelectedCards([]);
      }
    } catch (e) { showToast("Erreur lors de la génération.", "error"); }
  };

  const godHandMerge = () => {
    if (selectedCards.length < 2) return showToast("Sélectionne au moins 2 cartes à fusionner.", "error");
    const cards = expressions.filter(e => selectedCards.includes(e.id));
    const fronts = cards.map(c => c.front).join(" + ");
    const backs = cards.map(c => `• **${c.front}**: ${c.back}`).join("<br><br>");
    const newCard = {
      id: Date.now().toString(),
      front: fronts,
      back: backs,
      category: cards[0].category,
      level: 0, nextReview: today(), createdAt: today(),
      easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
    };
    setExpressions(prev => {
      const updated = [newCard, ...prev.filter(c => !selectedCards.includes(c.id))];
      checkBadges(updated, statsRef.current, sessions, unlockedBadges);
      return updated;
    });
    setSelectedCards([]);
    showToast("🔀 Cartes fusionnées !");
  };

  const godHandDelete = () => {
    if (window.confirm(`Es-tu sûr de vouloir incinérer (supprimer) ces ${selectedCards.length} cartes ?`)) {
      setExpressions(prev => prev.filter(c => !selectedCards.includes(c.id)));
      setSelectedCards([]);
      showToast(`🗑️ ${selectedCards.length} cartes incinérées.`, "info");
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // FONCTIONS GOD LEVEL – VUE AJOUTER
  // ══════════════════════════════════════════════════════════════════

  // Détection de doublons avant création
  const checkDoublon = (frontText) => {
    if (!frontText.trim() || expressions.length === 0) {
      setAddDoublonCheck(null);
      return;
    }
    const similars = findSimilarCards(frontText, expressions, 0.75);
    if (similars.length > 0) {
      const topMatch = similars[0].card;
      setAddDoublonCheck({
        duplicate: true,
        existingConcept: topMatch.front,
        conseil: `Ce concept existe déjà dans le module "${topMatch.category}".`
      });
    } else {
      setAddDoublonCheck(null);
    }
  };

  // Reformulation multiple
  const generateReformulations = async (field) => {
    const text = addForm[field];
    if (!text || !text.trim()) return;
    playSound("whoosh");
    setAddReformLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un rédacteur pédagogique expert. Propose 3 reformulations du texte suivant : plus claire, plus concise, plus pédagogique. Format JSON STRICT: {"reformulations":["version 1","version 2","version 3"]}`,
        `Texte à reformuler: "${text}"`
      );
      const clean = raw.replace(/```json|```/g, '').trim();
      const data = safeParseJSON(clean);
      setAddReformulations(prev => ({ ...prev, [field]: data.reformulations || [] }));
      showToast("✨ 3 reformulations proposées !");
    } catch (e) { showToast("Erreur reformulation", "error"); }
    setAddReformLoading(false);
  };

  // Génération de métaphore
  const generateMetaphore = async () => {
    if (!addForm.front.trim()) return;
    playSound("whoosh");
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
      const unsplashKey = import.meta.env.VITE_UNSPLASH_API_KEY;
      try {
        if (unsplashKey) {
          const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=8&client_id=${unsplashKey}`);
          if (res.ok) {
            const data = await res.json();
            setAddImageResults((data.results || []).map(img => ({
              url: img.urls?.small,
              alt: img.alt_description || query,
              photographer: img.user?.name
            })));
            setAddImageSearchLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn("Unsplash error", e);
      }
      // Fallback : images génériques Picsum (toujours disponible, gratuit)
      const seeds = [10, 20, 30, 40, 50, 60, 70, 80];
      setAddImageResults(seeds.map(seed => ({
        url: `https://picsum.photos/seed/${encodeURIComponent(query)}_${seed}/300/200`,
        alt: query,
        photographer: "Picsum Photos"
      })));
    } catch (e) {
      setAddImageResults([{ url: `https://picsum.photos/seed/${encodeURIComponent(addImageSearch)}/300/200`, alt: addImageSearch, photographer: "Picsum" }]);
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
      const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(addDiagramSvg);
      setAddForm(f => ({ ...f, imageUrl: svgDataUrl }));
      setAddDiagramMode(false);
      showToast("📐 Diagramme inséré !");
    }
  };

  // Enregistrement audio
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("audio/webm")) ? "audio/webm" : "audio/mp4";
      let mediaRecorder;
      try { mediaRecorder = new MediaRecorder(stream, { mimeType }); }
      catch { mediaRecorder = new MediaRecorder(stream); }
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || mimeType });
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
    const totalConcepts = addBatchQueue.length;
    for (let i = 0; i < addBatchQueue.length; i++) {
      const concept = addBatchQueue[i];
      try {
        const raw = await callClaude(
          `Génère UNE fiche de révision en JSON strict: {"front":"...","back":"...","example":"..."}. Sois concis et pédagogique.`,
          `Concept: ${concept}`
        );
        const clean = raw.replace(/```json|```/g, '').trim();
        const parsed = safeParseJSON(clean);
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
    showToast(`✅ ${totalConcepts} fiches générées !`);
  };

  // Détection automatique module → adaptation prompt
  const getAdaptedPrompt = (basePrompt) => {
    const cat = addForm.category.toLowerCase();
    if (cat.includes('anglais')) return `${basePrompt} (Rédige en anglais, avec traduction française entre parenthèses)`;
    if (cat.includes('java') || cat.includes('spring')) return `${basePrompt} (Ajoute un exemple de code Java, syntaxe Spring si pertinent)`;
    if (cat.includes('informatique')) return `${basePrompt} (Ajoute un schéma ou un exemple technique concret)`;
    return basePrompt;
  };

  // ══════════════════════════════════════════════════════════════════
  // FONCTIONS GOD LEVEL – ENGLISH PRACTICE
  // ══════════════════════════════════════════════════════════════════

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
      setLabCrossAnalysis(safeParseJSON(raw));
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
      setLabCitations(safeParseJSON(raw).quotes || []);
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
      setLabLogicTree(safeParseJSON(raw));
    } catch (e) { showToast("Erreur arbre logique", "error"); }
  };

  // Générer un diaporama (simulation)
  const generateSlides = async () => {
    if (!pdfExtractedText.trim()) return;
    showToast("Création du diaporama...");
    // On génère un objet avec les slides
    const slides = pdfExtractedText.split(/---\s*Page\s*\d+\s*---/).filter(s => s.trim().length > 100).slice(0, 5).map((s, i) => ({
      title: `Slide ${i + 1}`,
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
      const parsed = safeParseJSON(raw);
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
      const parsed = safeParseJSON(raw);
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
      setLabWordCloud(safeParseJSON(raw).words || []);
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
      setLabPracticeProblems(safeParseJSON(raw).problems || []);
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
      setLabRevisionPlan(safeParseJSON(raw));
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
      setLabSelfTest(safeParseJSON(raw).questions || []);
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
      setLabImpactReport(safeParseJSON(raw));
    } catch (e) { showToast("Erreur rapport", "error"); }
  };

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
    // Stabilité par défaut (4 jours) quand aucune fiche n'a encore de stabilité FSRS calculée
    const DEFAULT_STABILITY = 4;
    const stabilities = expressions.filter(e => e.stability && e.stability > 0).map(e => e.stability);
    const avgStability = stabilities.length > 0
      ? stabilities.reduce((a, b) => a + b, 0) / stabilities.length
      : DEFAULT_STABILITY;
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
      const avgLevel = total ? (catExps.reduce((s, e) => s + e.level, 0) / total).toFixed(1) : 0;
      const due = catExps.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7).length;
      return { name: cat.name, total, mastered, avgLevel, due, color: cat.color };
    });
    setStatsModuleComparison(comp);
  };

  // Distribution des difficultés
  const computeDifficultyDistribution = () => {
    const dist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 0-10
    expressions.forEach(e => {
      const d = Math.floor(e.difficulty || (5 - (e.easeFactor || 2.5)) * 2);
      const idx = Math.min(10, Math.max(0, d));
      dist[idx]++;
    });
    setStatsDifficultyDistribution(dist.map((count, diff) => ({ diff, count })));
    // Top 5 difficiles
    const sorted = [...expressions].sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0)).slice(0, 5);
    setStatsTopDifficult(sorted);
  };

  // Performance par jour de la semaine
  const computeDayOfWeekPerformance = () => {
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
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
    const avg = counts.map((c, i) => c ? (totals[i] / c).toFixed(1) : 0);
    setStatsDayOfWeekPerformance(days.map((name, i) => ({ name, reviews: counts[i], avgScore: avg[i] })));
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
        hardestModule: [...statsModuleComparison].sort((a, b) => a.avgLevel - b.avgLevel)[0]?.name,
        lastWeekReviews: sessions.filter(s => s.date >= addDays(today(), -7)).reduce((a, s) => a + s.count, 0),
      };
      const raw = await callClaude(
        `Tu es un coach pédagogique. Analyse ces statistiques et rédige un rapport ultra‑personnalisé avec : un verdict global, deux forces, une faiblesse, un conseil choc, et un plan pour la semaine. Format JSON: {"verdict":"...","strengths":["..."],"weakness":"...","tip":"...","plan":["..."]}`,
        JSON.stringify(summary)
      );
      setStatsAiReport(safeParseJSON(raw));
    } catch (e) { showToast("Erreur rapport IA", "error"); }
    setStatsAiReportLoading(false);
  };

  // Heatmap cognitive
  const computeCognitiveHeatmap = () => {
    const data = expressions.filter(e => e.stability).map(e => ({
      diff: e.difficulty || (5 - (e.easeFactor || 2.5)) * 2,
      retention: Math.round(fsrsR(1, e.stability) * 100)
    }));
    setStatsCognitiveHeatmap(data);
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
    const data = hourCounts.map((c, i) => ({
      hour: i,
      reviews: c,
      avgScore: c ? (hourScores[i] / c).toFixed(1) : 0
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
    computeRetentionCurve(); // désormais toujours appelé (fallback intégré)
    computeModuleComparison();
    computeDifficultyDistribution();
    computeDayOfWeekPerformance();
    computeFatigue();
    computeCognitiveHeatmap();
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
      const plan = safeParseJSON(raw).plan || [];
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

  // Liste des fiches RÉELLEMENT en retard pour le bandeau "Risque d'oubli".
  // Règle stricte : on n'affiche le bandeau QUE pour les fiches dont la
  // nextReview est strictement < aujourd'hui (local). Les fiches dues
  // aujourd'hui apparaissent dans la file de révision standard, pas dans
  // l'alerte rouge — sinon le bandeau serait quasi permanent et perdrait
  // tout son sens d'urgence.
  const computeUrgentCards = () => {
    const todayStr = today();
    const critical = expressions
      .filter(e =>
        (e.level || 0) < 7 &&
        e.nextReview &&
        String(e.nextReview) < String(todayStr)
      )
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
      if (!dashQuote) loadDailyQuote();
    }
  }, [view, expressions, stats]);

  // ══════════════════════════════════════════════════════════════════
  // CATEGORIES GOD LEVEL v10 – Fonctions
  // ══════════════════════════════════════════════════════════════════

  // Calculer les statistiques avancées par module
  const computeCatsStats = () => {
    const catsStatsMap = {};
    categories.forEach(cat => {
      const catExps = expressions.filter(e => e.category === cat.name);
      const mastered = catExps.filter(e => e.level >= 7).length;
      const total = catExps.length;
      const avgDiff = total ? (catExps.reduce((s, e) => s + (e.difficulty || (5 - (e.easeFactor || 2.5)) * 2), 0) / total).toFixed(1) : 0;
      const due = catExps.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7).length;
      const lastReview = catExps.reduce((latest, e) => {
        const last = (e.reviewHistory || []).slice(-1)[0]?.date;
        return last > latest ? last : latest;
      }, "");
      catsStatsMap[cat.name] = { mastered, total, avgDiff, due, lastReview, pct: total ? Math.round((mastered / total) * 100) : 0 };
    });
    setCatsStats(catsStatsMap);
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
      const parsed = safeParseJSON(raw);
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
    })).sort((a, b) => new Date(a.date) - new Date(b.date));
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
        const week = h.date.slice(0, 7); // YYYY-MM
        if (!weeks[week]) weeks[week] = { total: 0, count: 0 };
        weeks[week].total += card.level;
        weeks[week].count++;
      });
    });
    const curve = Object.entries(weeks).map(([week, data]) => ({
      week,
      avgLevel: +(data.total / data.count).toFixed(1)
    })).sort((a, b) => a.week.localeCompare(b.week));
    setCatsLearningCurve(prev => ({ ...prev, [catName]: curve }));
  };

  // Alerter sur les retards
  const checkModuleAlerts = () => {
    const alerts = [];
    categories.forEach(cat => {
      const catExps = expressions.filter(e => e.category === cat.name);
      const due = catExps.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7).length;
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
        return `${cat.name}: ${s.pct || 0}% maîtrise, ${s.due || 0} en retard, difficulté moy. ${s.avgDiff || 0}`;
      }).join("\n");
      const raw = await callClaude(
        "Analyse ces modules et propose un plan d'action pour l'étudiant. Format JSON: {\"criticalModule\":\"nom du module le plus urgent\",\"recommendations\":[\"conseil1\",\"conseil2\"]}",
        summary
      );
      const parsed = safeParseJSON(raw);
      setCatsAiReport(parsed);
    } catch (e) { showToast("Erreur rapport IA", "error"); }
    setCatsAiReportLoading(false);
  };

  // Audit IA spécifique à un module
  const auditModule = async (catName) => {
    setCatsAiReportLoading(true);
    setCatsFocus(catName);
    try {
      const catExps = expressions.filter(e => e.category === catName);
      const concepts = catExps.map(e => e.front).join(", ");
      const raw = await callClaude(
        `Tu es un Architecte Pédagogique. Voici les concepts étudiés dans "${catName}": [${concepts.slice(0, 3000)}]. Identifie 3 à 5 concepts fondamentaux ou avancés qui MANQUENT pour une vraie maîtrise du sujet. Format JSON: {"criticalModule":"${catName}", "recommendations":["concept1","concept2"], "advice":"..."}`,
        "Analyse de complétude"
      );
      setCatsAiReport(safeParseJSON(raw));
    } catch (e) { showToast("Erreur d'audit", "error"); }
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
    setExpressions(prev => { const ex = new Set(prev.map(e => e.front + e.category)); return [...prev, ...result.expressions.filter(e => !ex.has(e.front + e.category))]; });
    if (result.categories.length > 0) setCategories(prev => { const ex = new Set(prev.map(c => c.name)); return [...prev, ...result.categories.filter(c => !ex.has(c.name))]; });
    setImportText(""); setShowImport(false); showToast("Import réussi !");
  };

  const heatmap = useMemo(() => buildHeatmap(sessions), [sessions]);
  const weeks = useMemo(() => getLast12Weeks(), []);
  const catNames = useMemo(() => categories.map((c) => c.name), [categories]);

  const filteredExps = useMemo(() => {
    // Comparaison défensive : on normalise (trim + lowercase) pour éviter qu'une fiche d'un module se retrouve dans un autre à cause d'une casse ou d'espaces parasites.
    const _normCat = (s) => (s || "").toString().trim().toLowerCase();
    let list = filterCat === "Toutes" ? expressions : expressions.filter((e) => _normCat(e.category) === _normCat(filterCat));
    if (filterLevel !== "Tous") {
      if (filterLevel === "Maîtrisées") list = list.filter((e) => e.level >= 7);
      else if (filterLevel === "En retard") list = list.filter((e) => isDue(e.nextReview, today()) && (e.level || 0) < 7);
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

    if (listSortLevel !== null) {
      list = list.filter((e) => (e.level || 0) === listSortLevel);
    }

    // Tri
    if (cardsSort === "alpha") list = [...list].sort((a, b) => a.front.localeCompare(b.front));
    else if (cardsSort === "level") list = [...list].sort((a, b) => b.level - a.level);
    else if (cardsSort === "due") list = [...list].sort((a, b) => (a.nextReview || "").localeCompare(b.nextReview || ""));
    else /* date */                 list = [...list].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return list;
  }, [expressions, filterCat, filterLevel, searchQuery, cardsSearchOpen, cardsAdvancedSearch, cardsSort, listSortLevel]);

  useEffect(() => {
    setVisibleCardsCount(30);
  }, [filteredExps]);

  useEffect(() => {
    if (!loadMoreCardsRef.current || view !== "list") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCardsCount(prev => prev + 30);
      }
    }, { rootMargin: "400px" });
    observer.observe(loadMoreCardsRef.current);
    return () => observer.disconnect();
  }, [view, filteredExps, visibleCardsCount]);

  const hasActiveFilters = filterCat !== "Toutes" || filterLevel !== "Tous" || searchQuery.trim() !== "" || listSelectedTag !== null || listSortLevel !== null || listXRayMode || cardsSort !== "date";

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

  // ══════════════════════════════════════════════════════════════════════════
  // FONCTIONS GOD LEVEL (Lab Outils)
  // ══════════════════════════════════════════════════════════════════════════
  const generateGraph = () => {
    showToast("🧠 Génération du graphe de connaissances...", "info");
    const nodes = categories.map((cat, i) => ({ id: cat.name, label: cat.name, color: cat.color, x: Math.random() * 400, y: Math.random() * 300 }));
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
      const prompt = `Agis en tant que coach IA. L'étudiant a ${expressions.length} fiches, les révisions dues aujourd'hui : ${todayReviews.length}. Son streak actuel : ${stats.streak} jours. Les examens à venir : ${categories.filter(c => c.examDate).map(c => `${c.name} le ${c.examDate}`).join(", ")}. Propose un planning de révision heure par heure pour les 24 prochaines heures en tenant compte de la courbe de l'oubli. Format JSON : {"plan": [{"time": "08:00", "activity": "..."}]}`;
      const raw = await callClaude("Tu es un coach pédagogique expert.", prompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      const data = safeParseJSON(clean);
      setCoachPlan(data.plan);
      showToast("📋 Planning généré !");
    } catch (e) { showToast("Erreur planification", "error"); }
    setCoachLoading(false);
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
        const parsed = safeParseJSON(clean);
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
      const parsed = safeParseJSON(clean);
      setPdfAnalysis(parsed);
      if (parsed.mindmap) setPdfMindMap(parsed.mindmap);
      if (parsed.diagrams) setLabDiagrams(parsed.diagrams);
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
      const parsed = safeParseJSON(clean);
      const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
      setPdfBatchPreview(cards);
      // Score de couverture
      if (pdfAnalysis?.themes?.length) {
        const covRaw = await callClaude(
          `Tu es un expert pédagogique. On a généré des fiches de révision. Analyse si elles couvrent bien les thèmes du cours. Réponds UNIQUEMENT en JSON: {"score":85,"covered":["thème1"],"missing":["thème2"],"suggestion":"Génère 3 fiches sur [thème manquant]"}`,
          `Thèmes du cours: ${pdfAnalysis.themes.join(", ")}\n\nFiches générées: ${cards.map(c => c.front).join(" | ")}`
        );
        try { setPdfCoverageScore(JSON.parse(covRaw.replace(/```json|```/g, "").trim())); } catch (e) { console.error("Error parsing coverage score", e); }
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
          callClaude(`Résume ce passage de cours en 2-3 phrases clés. Sois concis et direct. Réponds en français.`, `Passage ${i + 1}:\n${s.substring(0, 2000)}`)
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
      id: crypto.randomUUID(),
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
      content = `${resumeResult.intro || ""}\n\n${(resumeResult.keyPoints || []).map((p, i) => `${i + 1}. ${p.title}\n${p.content}`).join("\n\n")}\n\nCONCLUSION:\n${resumeResult.conclusion || ""}\n\nGLOSSAIRE:\n${(resumeResult.glossary || []).map(g => `• ${g.term} : ${g.def}`).join("\n")}`;
    }
    if (format === "txt") {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "resume_cours.txt"; a.click();
    } else if (format === "md") {
      let md = "";
      if (resumeStyle === "complet" && resumeResult.intro) {
        md = `# Résumé de cours\n\n## Introduction\n${resumeResult.intro}\n\n## Points clés\n${(resumeResult.keyPoints || []).map(p => `### ${p.title}\n${p.content}`).join("\n\n")}\n\n## Conclusion\n${resumeResult.conclusion || ""}\n\n## Glossaire\n${(resumeResult.glossary || []).map(g => `- **${g.term}** : ${g.def}`).join("\n")}`;
      } else { md = content; }
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "resume_cours.md"; a.click();
    } else if (format === "anki") {
      const rows = resumeStyle === "cornell"
        ? (resumeResult.rows || []).map(r => `"${r.question.replace(/"/g, '""')}","${r.answer.replace(/"/g, '""')}"`)
        : (resumeResult.keyPoints || []).map(p => `"${p.title.replace(/"/g, '""')}","${p.content.replace(/"/g, '""')}"`);
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
    const W = 700, H = 420, cx = W / 2, cy = H / 2;
    const nodeCount = mm.nodes?.length || 0;
    const nodes = (mm.nodes || []).map((n, i) => {
      const angle = (2 * Math.PI * i) / nodeCount - Math.PI / 2;
      const r = 140;
      return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", borderRadius: 16 }}>
        <defs>
          <radialGradient id="mgc" cx="50%" cy="50%"><stop offset="0%" stopColor="#4D6BFE" /><stop offset="100%" stopColor="#3451D1" /></radialGradient>
          <radialGradient id="mnc" cx="50%" cy="50%"><stop offset="0%" stopColor="#7B93FF" /><stop offset="100%" stopColor="#3451D1" /></radialGradient>
        </defs>
        {nodes.map((n, i) => (
          <line key={`l${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="#4D6BFE" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="4,3" />
        ))}
        {nodes.map((n, i) => (
          <g key={`n${i}`}>
            {(n.children || []).map((child, j) => {
              const cr = 60, ca = (2 * Math.PI * j) / (n.children.length || 1);
              const chx = n.x + cr * Math.cos(ca), chy = n.y + cr * Math.sin(ca);
              return <g key={`c${j}`}>
                <line x1={n.x} y1={n.y} x2={chx} y2={chy} stroke="#7B93FF" strokeWidth="1" strokeOpacity="0.35" />
                <ellipse cx={chx} cy={chy} rx={36} ry={14} fill="#7B93FF" fillOpacity="0.15" stroke="#7B93FF" strokeWidth="1" />
                <text x={chx} y={chy} textAnchor="middle" dominantBaseline="middle" fill="#7B93FF" fontSize="9" fontWeight="600">{child.label?.substring(0, 14)}</text>
              </g>;
            })}
            <ellipse cx={n.x} cy={n.y} rx={52} ry={20} fill="url(#mnc)" opacity="0.9" />
            <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="700">{n.label?.substring(0, 16)}</text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r={44} fill="url(#mgc)" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="12" fontWeight="800">{mm.center?.substring(0, 14)}</text>
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
      const parsed = safeParseJSON(clean);
      setResumeResult(parsed);
      showToast("📝 Résumé prêt !");
    } catch (err) {
      showToast("Erreur : " + err.message, "error");
    }
    setResumeLoading(false);
  };

  const generateGodMode = async () => {
    if (!resumeText.trim()) { showToast("Colle ou charge un cours d'abord.", "error"); return; }
    setGodModeLoading(true);
    setLabSubView("godmode");
    setGodModeResult(null);
    try {
      const textSlice = resumeText.substring(0, 10000);
      const hasArabic = /[\u0600-\u06FF]/.test(textSlice);
      const langNote = hasArabic ? "Génère tout en arabe, avec les termes techniques en français entre parenthèses." : "Génère tout en français.";

      // Appels parallèles pour plus de rapidité
      const [resume, mindmap, diagrams, flashcards, quiz] = await Promise.all([
        callClaude(
          `Résume ce cours de façon ultra‑complète en JSON : {"intro":"...","sections":[{"title":"...","content":"..."}],"conclusion":"..."}. ${langNote} Réponds UNIQUEMENT en JSON valide.`,
          textSlice
        ),
        callClaude(
          `Génère une carte mentale au format JSON : {"center":"Sujet","nodes":[{"id":"n1","label":"Sous‑thème","children":[]}]}. ${langNote} Réponds UNIQUEMENT en JSON valide.`,
          textSlice
        ),
        callClaude(
          `Génère 2 diagrammes Mermaid (format code) qui expliquent visuellement les concepts clés de ce cours. Format JSON : {"diagrams":["graph TD; ...","sequenceDiagram; ..."]}. ${langNote} Réponds UNIQUEMENT en JSON valide.`,
          textSlice
        ),
        callClaude(
          `Génère 10 fiches de révision (front/back/example) depuis ce cours. Format JSON : {"cards":[{"front":"...","back":"...","example":"..."}]}. ${langNote} Réponds UNIQUEMENT en JSON valide.`,
          textSlice
        ),
        callClaude(
          `Génère un quiz de 8 questions (QCM) avec 4 options. Format JSON : {"quiz":[{"question":"...","options":["A","B","C","D"],"correct":"A"}]}. ${langNote} Réponds UNIQUEMENT en JSON valide.`,
          textSlice
        )
      ]);

      // Nettoie chaque réponse JSON
      const cleanJSON = (str) => {
        try {
          const match = str.replace(/```json|```/g, '').trim();
          return JSON.parse(match);
        } catch { return null; }
      };

      setGodModeResult({
        resume: cleanJSON(resume) || { intro: "Erreur de génération", sections: [], conclusion: "" },
        mindmap: cleanJSON(mindmap),
        diagrams: cleanJSON(diagrams)?.diagrams || [],
        flashcards: (cleanJSON(flashcards)?.cards || []).slice(0, 10),
        quiz: (cleanJSON(quiz)?.quiz || []).slice(0, 8),
      });
      showToast("🧬 Résumé God Mode prêt !");
    } catch (err) {
      showToast("Erreur God Mode : " + err.message, "error");
    }
    setGodModeLoading(false);
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
  useEffect(() => { if (view === "review" && revealed) setStressLevel(Math.floor(Math.random() * 40) + 60); }, [revealed, view]);

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
      ? { ...p, tasks: (p.tasks || []).map(t => t.id === taskId ? { ...t, ...updates } : t) }
      : p
    ));
    setActiveProject(prev => prev?.id === projectId
      ? { ...prev, tasks: (prev.tasks || []).map(t => t.id === taskId ? { ...t, ...updates } : t) }
      : prev
    );
  };

  const toggleTask = (projectId, taskId) => {
    const project = projects.find(p => p.id === projectId);
    const task = project?.tasks?.find(t => t.id === taskId);
    if (!task) return;
    updateTask(projectId, taskId, { done: !task.done, completedAt: !task.done ? today() : null });
  };

  const getProjectProgress = (project) => {
    const tasks = project?.tasks || [];
    if (!tasks.length) return 0;
    return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
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
      const parsed = safeParseJSON(clean);
      const tasks = (parsed.tasks || []).map(t => ({
        ...t,
        id: crypto.randomUUID(),
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
        const tasks = p.tasks || [];
        const progress = getProjectProgress(p);
        const remaining = tasks.filter(t => !t.done).length;
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
      setProjectPlannerData(safeParseJSON(clean) || { days: [], warnings: ["Planning illisible, réessaie la génération."] });
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
Tâches restantes: ${(activeProject.tasks || []).filter(t => !t.done).map(t => t.title).join(", ") || "aucune"}`
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
    ? { bg: "var(--mm-bg)", text: "var(--mm-fg)", textMuted: "var(--mm-fg-muted)", cardBg: "var(--mm-bg-card)", border: "var(--mm-border)", inputBg: "var(--mm-bg-elev)", highlight: "var(--mm-primary)", nav: "var(--mm-bg-overlay)", gradient: "var(--mm-grad-primary)" }
    : { bg: "var(--mm-bg)", text: "var(--mm-fg)", textMuted: "var(--mm-fg-muted)", cardBg: "var(--mm-bg-card)", border: "var(--mm-border)", inputBg: "var(--mm-bg-elev)", highlight: "var(--mm-primary)", nav: "var(--mm-grad-primary)", gradient: "var(--mm-grad-primary)" };

  const currentCard = reviewQueue.length > 0 ? reviewQueue[reviewIndex] : null;

  const activeFacet = useMemo(() => {
    if (!currentCard || !currentCard.facets || currentCard.facets.length === 0) return null;
    // 50% chance to just show the standard front if facets exist, otherwise pick a random facet
    if (Math.random() > 0.5) return null;
    const idx = Math.floor(Math.random() * currentCard.facets.length);
    return currentCard.facets[idx];
  }, [reviewIndex, currentCard]);

  if (!loaded) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#070D1F", color: "#7B93FF", fontFamily: "'Outfit', sans-serif", gap: 16 }}><div style={{ fontSize: 48, animation: "pulse 1s infinite", filter: "drop-shadow(0 0 20px rgba(249,115,22,0.8))" }}>🧠</div><h2 style={{ fontWeight: 800, letterSpacing: "-0.5px", background: "linear-gradient(135deg, #3451D1, #7B93FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Initialisation du Second Cerveau...</h2></div>;

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "transparent", color: theme.text, fontFamily: "'Outfit', sans-serif", transition: "background 0.3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Fira+Code:wght@400;500;600&display=swap');
       html { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; overflow-x: hidden !important; overflow-y: auto !important; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }
       body { margin: 0 !important; padding: 0 !important; width: 100% !important; min-height: 100% !important; overflow-x: hidden !important; overflow-y: visible !important; position: relative; }
       #root { margin: 0 !important; padding: 0 !important; width: 100% !important; min-height: 100% !important; overflow: visible !important; }
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
        @keyframes pulseUrgent { 0% { box-shadow: 0 0 0px rgba(239, 68, 68, 0.4); border-color: rgba(239, 68, 68, 0.5); } 50% { box-shadow: 0 0 25px rgba(239, 68, 68, 0.9); border-color: rgba(239, 68, 68, 1); } 100% { box-shadow: 0 0 0px rgba(239, 68, 68, 0.4); border-color: rgba(239, 68, 68, 0.5); } }
        @keyframes flowZoomIn { 0% { transform: scale(1) translateZ(0); opacity: 1; filter: blur(0px); } 100% { transform: scale(1.15) translateZ(50px); opacity: 0; filter: blur(10px); } }
        @keyframes flowCardEnter { 0% { transform: scale(0.85) translateY(40px); opacity: 0; } 100% { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes gradientPulseFlow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes xp-burst-float-up { 0% { opacity: 0; transform: translateY(80px) scale(0.5); } 15% { opacity: 1; transform: translateY(0px) scale(1.3); } 30% { transform: translateY(-15px) scale(1); } 80% { opacity: 1; transform: translateY(-40px) scale(1); } 100% { opacity: 0; transform: translateY(-150px) scale(1.5); filter: blur(10px); } }
        @keyframes xp-burst-fade-out { 0% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes orb-breath { 0%, 100% { transform: scale(1); box-shadow: 0 0 24px #4D6BFE60; } 50% { transform: scale(1.08); box-shadow: 0 0 36px #4D6BFE90; } }
        @keyframes whisper-pop-in { from { opacity: 0; transform: scale(0.8) translateX(10px); } to { opacity: 1; transform: scale(1) translateX(0); } }
        
        @keyframes listRipple {
          0% { transform: scale(0.95); opacity: 0; filter: brightness(2); }
          50% { transform: scale(1.02); opacity: 1; filter: brightness(1.5); }
          100% { transform: scale(1); opacity: 1; filter: brightness(1); }
        }
        .ripple-anim { animation: listRipple 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        /* ── NEXUS CENTRAL ANIMATIONS ── */
        @keyframes nexusPulseRed { 0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); } }
        @keyframes nexusPulseBlue { 0%, 100% { box-shadow: 0 0 0 0 rgba(107, 130, 245, 0.7); } 50% { box-shadow: 0 0 0 6px rgba(107, 130, 245, 0); } }
        .nexus-badge-red { animation: nexusPulseRed 2s infinite cubic-bezier(0.16, 1, 0.3, 1); }
        .nexus-badge-blue { animation: nexusPulseBlue 2s infinite cubic-bezier(0.16, 1, 0.3, 1); }
        .nexus-item { position: relative; border-radius: 12px; transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1); z-index: 1; overflow: visible !important; }
        .nexus-item::before { content: ""; position: absolute; inset: 0; border-radius: 12px; opacity: 0; transform: scale(0.95); transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1); z-index: -1; }
        .nexus-item:hover::before { opacity: 1; transform: scale(1); }
        .nexus-item.active::before { opacity: 1; transform: scale(1); }
        .sidebar-nav-scroll::-webkit-scrollbar { display: none; }
        .sidebar-nav-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        
        @keyframes node-shine {
          0%, 100% { filter: drop-shadow(0 0 4px #4ade80); stroke-width: 2.5px; stroke: #86efac; }
          50% { filter: drop-shadow(0 0 14px #4ade80); stroke-width: 3.5px; stroke: #bbf7d0; }
        }
        @keyframes node-pulse-review { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
        .node-mastered circle { animation: node-shine 3s ease-in-out infinite; }
        .node-needs-review { animation: node-pulse-review 1.8s ease-in-out infinite; }
        .hov:hover { transform: translateY(-2px); transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        .card-hov:hover { transform: translateY(-5px); box-shadow: 0 20px 50px rgba(249,115,22,0.1) !important; transition: all 0.28s cubic-bezier(0.34,1.56,0.64,1); }
        .btn-glow:hover { animation: glow 1.5s infinite; transition: all 0.3s; }
        .occlusion-img { filter: blur(12px); transition: filter 0.3s; cursor: pointer; } .occlusion-img:hover { filter: blur(0px); }
        input, select, textarea { font-family: 'Outfit', sans-serif !important; color: ${theme.text} !important; outline: none; transition: border 0.2s, box-shadow 0.2s; }
        input:focus, textarea:focus, select:focus { border-color: #4D6BFE !important; box-shadow: 0 0 0 3px rgba(77,107,254,0.15) !important; }
        .tab-active { background: rgba(255,255,255,0.22) !important; font-weight: 700 !important; color: white !important; }
        .code-block { background: ${isDarkMode ? "#060B18" : "#EEF2FF"}; border: 1px solid ${theme.border}; border-radius: 12px; padding: 14px; font-family: 'Fira Code', monospace; white-space: pre-wrap; }
        /* ══ MOBILE RESPONSIVE — SYSTÈME COMPLET ══ */
        @media (max-width: 767px) {
          /* ── Layout ── */
          .desktop-sidebar { display: none !important; }
          .desktop-sidebar-spacer { display: none !important; }
          .main-content { padding: 12px 12px 110px !important; touch-action: auto !important; }
          .nav-top { padding: 0 12px !important; min-height: 54px !important; }
          .nav-title-sub { display: none !important; }
          .nav-logo-text { font-size: 15px !important; }
          .hide-mobile { display: none !important; }

          /* ── Grilles ── */
          .card-grid-auto { grid-template-columns: 1fr !important; }
          .card-grid-2col { grid-template-columns: repeat(2, 1fr) !important; }
          .grid-collapse { grid-template-columns: 1fr !important; }
          .grid-2-mobile { grid-template-columns: repeat(2, 1fr) !important; }

          /* ── Scroll horizontal pour tableaux ── */
          .table-overflow { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }

          /* ── English Practice — boutons navigation ── */
          .english-btns { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
          .english-btn-item { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 3px !important; padding: 10px 4px !important; min-height: 58px !important; font-size: 11px !important; border-radius: 10px !important; }

          /* ── Cartes de révision ── */
          .review-session-card { max-height: none !important; overflow-y: visible !important; touch-action: pan-y !important; }
          .review-card-face { padding: 24px 16px !important; font-size: 18px !important; min-height: 180px !important; }
          .review-btns-row { gap: 8px !important; }
          .review-btn { min-height: 76px !important; font-size: 14px !important; border-radius: 18px !important; }

          /* ── God Tier mobile : taps instantanés, feedback presse ── */
          button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; }
          .hov:hover { transform: none !important; }
          .hov:active { transform: scale(0.95) !important; opacity: 0.88; }
          .btn-glow:hover { animation: none !important; }
          .btn-glow:active { transform: scale(0.96) !important; }

          /* ── Dashboard header ── */
          .dash-header { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; padding: 16px !important; }
          .dash-header h1 { font-size: 18px !important; }
          .dash-stats-row { flex-wrap: wrap !important; gap: 8px !important; }
          .dash-stat-item { min-width: 0 !important; flex: 1 1 40% !important; }

          /* ── Dashboard God Mode Mobile ── */
          .dash-hero-card { padding: 24px 20px !important; }
          .dash-hero-title { font-size: 26px !important; line-height: 1.2 !important; }
          .dash-hero-stats { gap: 8px !important; width: 100% !important; }
          .dash-hero-stats > div { flex: 1 1 28% !important; padding: 10px !important; }
          .dash-hero-stats > div > div:first-child { font-size: 20px !important; }
          .dash-hero-stats > div > div:last-child { font-size: 9px !important; }
          
          .dash-mission-card { padding: 20px 16px !important; }
          .dash-stat-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .dash-stat-grid > div { padding: 14px 10px !important; }
          .dash-stat-grid > div > div:first-child { font-size: 26px !important; }
          .dash-flow-btn { padding: 16px !important; }
          .dash-flow-btn span:first-child { font-size: 18px !important; }
          
          .dash-widget-card { padding: 20px 16px !important; }
          .lesson-content { padding: 16px !important; font-size: 14px !important; }
          .lesson-content pre { font-size: 12px !important; overflow-x: auto; }
          .concept-grid { grid-template-columns: 1fr !important; }
          .roadmap-grid { grid-template-columns: 1fr 1fr !important; }
          .quiz-option { padding: 12px !important; font-size: 13px !important; }

          /* ── Lab ── */
          .lab-header { padding: 16px !important; }
          .lab-grid { grid-template-columns: 1fr !important; }
          .lab-chat-input { font-size: 14px !important; padding: 12px !important; }

          /* ── English In The Wild ── */
          .wild-header { padding: 16px !important; }
          .wild-card { padding: 16px !important; }
          .wild-actions { flex-direction: column !important; gap: 8px !important; }

          /* ── Formulaire ajout fiche ── */
          .add-form-grid { grid-template-columns: 1fr !important; }
          .add-form-actions { flex-direction: column !important; }

          /* ── Chat IA ── */
          .chat-bubble { max-width: 90% !important; font-size: 14px !important; }
          .chat-input-row { gap: 8px !important; }
          .chat-input-row input { font-size: 14px !important; }
          .chat-send-btn { width: 44px !important; height: 44px !important; font-size: 18px !important; }
          .chat-mic-btn { width: 44px !important; height: 44px !important; font-size: 18px !important; }

          /* ── Sections avec trop de padding ── */
          .section-card { padding: 16px !important; border-radius: 16px !important; }
          .section-header { padding: 16px !important; }
          .section-header h1, .section-header h2 { font-size: 18px !important; }
          .section-header p { font-size: 13px !important; }

          /* ── Boutons principaux ── */
          .btn-primary-lg { padding: 12px 20px !important; font-size: 14px !important; }
          .btn-row { flex-wrap: wrap !important; gap: 8px !important; }
          .search-bar-mobile { width: 100% !important; min-width: 0 !important; }

          /* ── Inputs ── */
          input[type="text"], input[type="email"], input[type="password"], textarea, select {
            font-size: 16px !important; /* évite le zoom auto iOS */
          }

          /* ── Modales / overlays ── */
          .modal-box { width: 94vw !important; max-height: 85vh !important; padding: 16px !important; border-radius: 18px !important; }

          /* ── Speaking Lab ── */
          .phoneme-cards { gap: 8px !important; }
          .phoneme-card { padding: 12px !important; }
          .waveform-canvas { height: 50px !important; }

          /* ── Brain Map ── */
          .brainmap-container { flex-direction: column !important; }
          .brainmap-detail { width: 100% !important; }

          /* ── Stats / Dashboard widgets ── */
          .stat-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .stat-card { padding: 12px !important; }
          .stat-card .stat-val { font-size: 20px !important; }

          /* ── Toasts / notifications ── */
          .toast-fixed { top: auto !important; bottom: 76px !important; right: 12px !important; left: 12px !important; font-size: 13px !important; }
        .show-mobile-only { display: inline !important; }

          /* ── XP bar ── */
          .xp-bar-row { flex-direction: column !important; gap: 6px !important; }

          /* ── Tabs horizontaux ── */
          .tabs-scroll, [style*="overflow-x: auto"], [style*="overflow-x:auto"] { overflow-x: auto !important; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; scroll-snap-type: x proximity; touch-action: pan-x pan-y pinch-zoom; flex-wrap: nowrap !important; padding-bottom: 4px; }
          .tab-pill { white-space: nowrap !important; font-size: 12px !important; padding: 7px 12px !important; }
          .card-item-mobile { padding: 16px !important; }

          /* ── Supprime les hover effects au touch ── */
          .hov:hover { transform: none !important; }
          .card-hov:hover { transform: none !important; box-shadow: none !important; }
        }

        @media (min-width: 768px) {
          .mobile-drawer-overlay { display: none !important; }
        }

        /* Safe area for iPhone with notch — main content reserve via --nav-h */
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          @media (max-width: 767px) {
            .main-content { padding-bottom: calc(var(--nav-h, 92px) + env(safe-area-inset-bottom, 0px)) !important; }
          }
        }
        ${isDarkMode ? `
          .app-orb-1 { position: fixed; top: -180px; left: -120px; width: 580px; height: 580px; background: radial-gradient(circle, rgba(77,107,254,0.08) 0%, transparent 65%); border-radius: 50%; pointer-events: none; z-index: 0; animation: orb1 12s ease-in-out infinite; }
          .app-orb-2 { position: fixed; bottom: -160px; right: -100px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(77,107,254,0.06) 0%, transparent 65%); border-radius: 50%; pointer-events: none; z-index: 0; animation: orb2 15s ease-in-out infinite; }
        ` : `
          .app-orb-1 { display: none; } .app-orb-2 { display: none; }
        `}
        /* Hide heavy decorative orbs on mobile (perf + overflow) */
        @media (max-width: 767px) {
          .app-orb-1, .app-orb-2 { display: none !important; }
        }
        .show-mobile-only { display: none; }

        
        ${isDarkMode ? `
          .nexus-item::before { background: rgba(255,255,255,0.06); }
          .nexus-item.active::before { background: rgba(255,255,255,0.12); }
        ` : `
          .nexus-item::before { background: rgba(77,107,254,0.06); }
          .nexus-item.active::before { background: rgba(77,107,254,0.12); }
        `}
        
        /* ── IA Orb & Dock God Mode Mobile ── */
        .ai-orb-container { position: fixed; bottom: 32px; right: 32px; z-index: 1000; display: flex; align-items: center; gap: 12px; pointer-events: none; }
        .ai-orb-bubble { pointer-events: auto; transform-origin: right center; max-width: 240px; }
        .ai-orb-btn { pointer-events: auto; width: 56px; height: 56px; }
        @media (max-width: 767px) {
          .ai-orb-container { bottom: calc(var(--nav-h, 92px) + 12px + env(safe-area-inset-bottom, 0px)) !important; right: 16px !important; flex-direction: column !important; align-items: flex-end !important; gap: 8px !important; }
          .ai-orb-bubble { max-width: 220px !important; font-size: 12px !important; padding: 10px 14px !important; transform-origin: bottom right !important; }
          .ai-orb-btn { width: 44px !important; height: 44px !important; font-size: 20px !important; }

        }
      `}</style>
      {isDarkMode && <><div className="app-orb-1" /><div className="app-orb-2" /></>}

      {/* Lecteur Audio natif */}
      <audio
        ref={audioRef}
        src={RADIO_STATIONS[lofiStation].url}
        loop
        preload="none"
        style={{ display: "none" }}
      />

      {/* Le Toast est désormais intégré dans le HUD (Dynamic Island) */}

      {newBadge && (
        <div style={{ position: "fixed", top: 88, right: 20, zIndex: 9998, display: "flex", gap: 16, alignItems: "center", background: isDarkMode ? "rgba(13,21,53,0.97)" : "white", border: "2px solid #4D6BFE", borderRadius: 18, padding: "18px 24px", boxShadow: "0 12px 40px rgba(77,107,254,0.25)", animation: "slideIn 0.4s ease" }}>
          <span style={{ fontSize: 32 }}>{newBadge.icon}</span>
          <div><div style={{ fontWeight: 800, color: theme.text, fontSize: 15 }}>Badge débloqué !</div><div style={{ color: "#4D6BFE", fontWeight: 700 }}>{newBadge.label}</div><div style={{ color: theme.textMuted, fontSize: 12 }}>{newBadge.desc}</div></div>
        </div>
      )}

      <nav className="nav-top" style={{
        background: isScrolled
          ? (isDarkMode ? "rgba(7,13,31,0.85)" : "rgba(52,81,209,0.85)")
          : (isDarkMode ? "rgba(7,13,31,0.97)" : "#4D6BFE"),
        backdropFilter: isScrolled ? "blur(32px)" : "blur(24px)",
        WebkitBackdropFilter: isScrolled ? "blur(32px)" : "blur(24px)",
        padding: isScrolled ? "0 20px" : "0 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        minHeight: isScrolled ? 54 : 68,
        borderBottom: `1px solid ${isDarkMode ? "rgba(77,107,254,0.2)" : "rgba(255,255,255,0.15)"}`,
        transform: zenFocusMode ? "translateY(-100%)" : "translateY(0)",
        opacity: zenFocusMode ? 0 : 1,
        pointerEvents: zenFocusMode ? "none" : "auto",
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}>
        {/* Ligne d'Énergie (Stamina) invisible */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2, width: `${stamina}%`,
          background: stamina > 50 ? "#4ADE80" : stamina > 20 ? "#FACC15" : "#EF4444",
          boxShadow: `0 0 12px ${stamina > 50 ? "#4ADE80" : stamina > 20 ? "#FACC15" : "#EF4444"}`,
          transition: "background 1s ease, box-shadow 1s ease, width 1s ease",
          zIndex: 101,
        }} />

        {/* Gauche : Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, width: "30%" }}>
          <div style={{
            width: isScrolled ? 32 : 40, height: isScrolled ? 32 : 40,
            background: "rgba(255,255,255,0.22)", borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: isScrolled ? 14 : 17, fontWeight: 900, color: "white",
            fontFamily: "'Fira Code', monospace", boxShadow: "0 2px 12px rgba(77,107,254,0.2)",
            transition: "all 0.3s",
          }}>M²</div>
          <div className="nav-text-container" style={{ opacity: isScrolled ? 0 : 1, width: isScrolled ? 0 : "auto", overflow: "hidden", transition: "all 0.3s" }}>
            <div className="nav-logo-text" style={{ fontSize: 19, fontWeight: 800, color: "white", letterSpacing: "-0.5px", whiteSpace: "nowrap" }}>MémoMaître</div>
            <div className="nav-title-sub" style={{ fontSize: 10, color: "rgba(199,210,254,0.85)", fontFamily: "'Fira Code', monospace", letterSpacing: 1.2, whiteSpace: "nowrap" }}>GOD LEVEL HUD</div>
          </div>
        </div>

        {/* Centre : Dynamic Island / Omni-Bar */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", zIndex: 102 }}>
          <div
            onClick={() => { if (!toast) setCmdOpen(true); }}
            className="search-bar-mobile"
            style={{
              display: (isMobile && !toast) ? "none" : "flex", alignItems: "center", gap: 12,
              background: toast
                ? (toast.type === "error" ? "rgba(239,68,68,0.95)" : "rgba(77,107,254,0.95)")
                : (isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.2)"),
              border: toast
                ? "1px solid transparent"
                : (isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.3)"),
              padding: toast ? "12px 24px" : (isScrolled ? "6px 16px" : "8px 20px"),
              borderRadius: 24, cursor: toast ? "default" : "pointer",
              width: toast ? "auto" : (isScrolled ? 280 : 380),
              maxWidth: 600,
              transform: toast ? "translateY(8px)" : "translateY(0)",
              boxShadow: toast ? "0 14px 32px rgba(0,0,0,0.3)" : "none",
              transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            {toast ? (
              <>
                <span style={{ fontSize: 18 }}>{toast.type === "error" ? "🚨" : "✨"}</span>
                <span style={{ color: "white", fontWeight: 700, fontSize: 14 }}>{toast.msg}</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14 }}>🔍</span>
                <span className="hide-mobile" style={{ flex: 1, fontSize: 13, color: isDarkMode ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Chercher un concept, demander à l'IA...
                </span>
                <span className="show-mobile-only" style={{ flex: 1, fontSize: 13, color: isDarkMode ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.8)" }}>Rechercher...</span>
                <kbd style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", background: "rgba(77,107,254,0.2)", padding: "3px 6px", borderRadius: 6, color: "white", fontWeight: 800 }}>⌘K</kbd>
              </>
            )}
          </div>
        </div>

        {/* Droite : Badges de statuts HUD */}
        <div style={{ width: "30%", display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", transition: "opacity 0.3s", opacity: isScrolled ? 0.6 : 1 }}>
          {todayReviews.length > 0 && <span style={{ background: "rgba(255,255,255,0.25)", color: "white", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 900, backdropFilter: "blur(4px)" }}>⚡ {todayReviews.length}</span>}
          {projectConflicts.filter(c => c.severity === "critique").length > 0 && <span style={{ background: "#EF4444", color: "white", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 900, boxShadow: "0 0 12px rgba(239,68,68,0.5)" }}>🚨</span>}
        </div>
      </nav>

      {/* ── LAYOUT PRINCIPAL : Sidebar + Content ── */}
      <div style={{ height: zenFocusMode ? 0 : 68, transition: "height 0.3s cubic-bezier(0.4,0,0.2,1)" }} />{/* spacer nav fixe */}
      <div style={{ display: "flex", minHeight: "calc(100vh - 68px)", alignItems: "flex-start" }}>

        {/* Spacer pour compenser la sidebar fixe */}
        <div className="desktop-sidebar-spacer" style={{ width: zenFocusMode ? 0 : (sidebarCollapsed ? 72 + 24 : 240 + 24), minWidth: zenFocusMode ? 0 : (sidebarCollapsed ? 72 + 24 : 240 + 24), flexShrink: 0, transition: "width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)" }} />

        {/* ═══ SIDEBAR VERTICALE GOD MODE (FIXED) – desktop only ═══ */}
        <aside className="desktop-sidebar" style={{
          width: sidebarCollapsed ? 72 : 240,
          minWidth: sidebarCollapsed ? 72 : 240,
          background: isDarkMode ? "rgba(13, 21, 53, 0.55)" : "rgba(255, 255, 255, 0.65)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          display: "flex", flexDirection: "column",
          position: "fixed", top: 84, left: 16, height: "calc(100vh - 100px)",
          borderRadius: 24,
          overflow: "hidden", /* Conteneur fixe, le scroll se fait à l'intérieur */
          transform: zenFocusMode ? "translateX(-150%)" : "translateX(0)",
          opacity: zenFocusMode ? 0 : 1,
          pointerEvents: zenFocusMode ? "none" : "auto",
          transition: "width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)",
          zIndex: 50, flexShrink: 0,
          border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(77,107,254,0.15)",
          boxShadow: isDarkMode ? "0 24px 40px rgba(0,0,0,0.4)" : "0 24px 40px rgba(52,81,209,0.15)",
        }}>

          {/* ── RPG Avatar (Nexus Header) ── */}
          {(() => {
            const archetype = getArchetype(powerLevel);
            return (
              <div style={{
                padding: sidebarCollapsed ? "24px 0 16px" : "24px 20px 20px",
                display: "flex", alignItems: "center", gap: 14,
                borderBottom: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(77,107,254,0.1)",
                transition: "padding 0.3s",
                cursor: "pointer",
              }} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? "Développer la sidebar" : "Réduire la sidebar"}>
                <div style={{ position: "relative", width: sidebarCollapsed ? 44 : 52, height: sidebarCollapsed ? 44 : 52, flexShrink: 0, margin: sidebarCollapsed ? "0 auto" : "0", transition: "all 0.3s" }}>
                  <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
                    <circle cx="18" cy="18" r="16" fill="none" stroke={isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.15)"} strokeWidth="2.5" />
                    <circle cx="18" cy="18" r="16" fill="none" stroke={theme.highlight} strokeWidth="2.5" strokeDasharray={`${archetype.progress} 100`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: sidebarCollapsed ? 20 : 24, transition: "font-size 0.3s" }}>
                    {archetype.icon}
                  </div>
                </div>
                {!sidebarCollapsed && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: isDarkMode ? "white" : theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {archetype.title}
                    </div>
                    <div style={{ fontSize: 11, color: isDarkMode ? "rgba(255,255,255,0.6)" : theme.textMuted, fontWeight: 700, marginTop: 2 }}>
                      Niv. {archetype.level} <span style={{ opacity: 0.5 }}>•</span> {powerLevel} XP
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Nav items (Scrollable) */}
          <div className="sidebar-nav-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "visible", paddingBottom: 16, paddingRight: 6 }}>
            {(() => {
              const dueCount = expressions.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7).length;
              const masteredCount = expressions.filter(e => e.level >= 7).length;
              const totalCards = expressions.length;
              const masteredPct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;
              const NAV_GROUPS = [
                {
                  items: [
                    { id: "dashboard", icon: "⚡", label: "Accueil", badge: todayReviews.length > 0 ? todayReviews.length : null, badgeColor: "#6B82F5", shortcut: "1", hint: `${todayReviews.length} fiches à réviser` },
                    { id: "routine", icon: "🌟", label: "Routine", shortcut: "R", hint: "Ma routine du jour" },
                    { id: "projects", icon: "🗂️", label: "Projets", badge: projects.filter(p => p.status !== "terminé").length || null, badgeColor: "#4D6BFE", shortcut: "2", hint: `${projects.filter(p => p.status !== "terminé").length} projets actifs` },
                    { id: "add", icon: "✦", label: editingId ? "Éditer" : "Ajouter", shortcut: "3", hint: "Créer une nouvelle fiche" },
                    { id: "list", icon: "◈", label: "Fiches", badge: dueCount > 0 ? dueCount : null, badgeColor: "#EF4444", shortcut: "4", hint: `${totalCards} fiches • ${dueCount} en retard` },
                    { id: "categories", icon: "◉", label: "Modules", shortcut: "5", hint: `${categories.length} modules` },
                    { id: "certifications", icon: "🎓", label: "Certifications", badge: "3", badgeColor: "#EF4444", hint: "Boost ton CV" },
                  ]
                },
                {
                  label: "Apprentissage",
                  items: [
                    { id: "veille", icon: "📰", label: "Actualités", shortcut: "7", hint: "Veille tech & IA en temps réel" },
                    { id: "opensource", icon: "🚀", label: "Radar OS", shortcut: "8", hint: "Trouve ta PR" },
                    { id: "practice", icon: "🗣️", label: "English", shortcut: "6", hint: "Pratique conversationnelle" },
                    { id: "portfolio", icon: "📁", label: "Portfolio", shortcut: "P", hint: "Mes Mini-Projets" },
                  ]
                },
                {
                  label: "Analyse",
                  items: [
                    { id: "stats", icon: "▣", label: "Stats", shortcut: "9", hint: "Statistiques FSRS détaillées" },
                    { id: "badges", icon: "🏆", label: "Badges", badge: (unlockedBadges.length - lastViewedBadgesCount) > 0 ? (unlockedBadges.length - lastViewedBadgesCount) : null, badgeColor: "#EF4444", hint: `${unlockedBadges.length} débloqués` },
                    { id: "lab", icon: "🧪", label: "Lab", hint: "PDF, résumés, outils IA" },
                  ]
                }
              ];
              return NAV_GROUPS.map((group, gi) => (
                <div key={gi} style={{ marginBottom: 8, padding: "0 12px" }}>
                  {group.label && !sidebarCollapsed && (
                    <div style={{ fontSize: 10, fontWeight: 800, color: isDarkMode ? "rgba(255,255,255,0.4)" : theme.textMuted, letterSpacing: 1.5, textTransform: "uppercase", padding: "16px 12px 6px" }}>
                      {group.label}
                    </div>
                  )}
                  {group.label && sidebarCollapsed && <div style={{ height: 1, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.1)", margin: "12px auto", width: 24 }} />}
                  {group.items.map((n, ni) => {
                    const isActive = view === n.id;
                    // Calcul progression par item
                    let progressPct = null;
                    if (n.id === "list") progressPct = masteredPct;
                    if (n.id === "badges") {
                      const earnableCount = BADGES.filter(b => b.id !== "exam_mode").length;
                      progressPct = earnableCount > 0 ? Math.round((unlockedBadges.length / earnableCount) * 100) : 0;
                    }
                    return (
                      <div key={n.id} style={{ position: "relative", marginBottom: 2 }} className="nexus-item-container">
                        <button
                          className={`nexus-item ${isActive ? "active" : ""}`}
                          onClick={() => {
                            setView(n.id);
                            if (n.id === "projects") setProjectSubView("hub");
                          }}
                          title={sidebarCollapsed ? `${n.label}${n.shortcut ? ` (⌘${n.shortcut})` : ""}` : undefined}
                          style={{
                            width: "100%", padding: sidebarCollapsed ? "12px 0" : "12px 14px",
                            display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: 12, border: "none",
                            cursor: "pointer",
                            background: "transparent",
                            color: isActive ? (isDarkMode ? "white" : theme.highlight) : (isDarkMode ? "rgba(255,255,255,0.65)" : theme.textMuted),
                            textAlign: "left", fontWeight: isActive ? 800 : 600,
                          }}
                        >
                          <span style={{ fontSize: 20, flexShrink: 0, textAlign: "center", width: sidebarCollapsed ? "100%" : 24 }}>{n.icon}</span>
                          {!sidebarCollapsed && (
                            <span style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{n.label}</span>
                          )}
                          {!sidebarCollapsed && n.shortcut && (
                            <span style={{ fontSize: 10, color: isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(77,107,254,0.4)", fontFamily: "'JetBrains Mono',monospace", marginLeft: "auto", flexShrink: 0, background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)", padding: "2px 6px", borderRadius: 4 }}>⌘{n.shortcut}</span>
                          )}
                          {n.badge && (
                            <span className={n.badgeColor === "#EF4444" ? "nexus-badge-red" : "nexus-badge-blue"} style={{
                              position: sidebarCollapsed ? "absolute" : "static",
                              top: sidebarCollapsed ? 2 : "auto", right: sidebarCollapsed ? 2 : "auto",
                              background: n.badgeColor, color: "white", borderRadius: 20,
                              padding: "2px 6px", fontSize: 10, fontWeight: 900, minWidth: 18, textAlign: "center",
                              lineHeight: 1.2, whiteSpace: "nowrap", boxShadow: sidebarCollapsed ? "0 0 0 2px var(--mm-bg, #0a0a0a)" : "none",
                              maxWidth: sidebarCollapsed ? 28 : "none", overflow: "hidden", textOverflow: "ellipsis",
                            }}>{n.badge}</span>
                          )}
                        </button>
                        {/* Mini barre de progression sous l'item (non réduite) */}
                        {!sidebarCollapsed && progressPct !== null && (
                          <div style={{ margin: "-2px 14px 8px 50px", height: 3, background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(77,107,254,0.06)", borderRadius: 3 }}>
                            <div style={{ height: "100%", width: `${progressPct}%`, background: progressPct >= 80 ? "#22C55E" : (isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(77,107,254,0.3)"), borderRadius: 3, transition: "width 0.6s ease" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>

          {/* Spacer + bottom actions */}
          <div style={{ padding: "16px", borderTop: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(77,107,254,0.1)" }}>
            {/* Pomodoro mini widget */}
            {projectPomodoroTime < 25 * 60 || projectPomodoroActive ? (
              <div style={{ background: "rgba(77,107,254,0.15)", borderRadius: 10, padding: "8px 10px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>{projectPomodoroMode === "study" ? "📚" : projectPomodoroMode === "project" ? "🗂️" : "☕"}</span>
                {!sidebarCollapsed && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: isDarkMode ? "#C7D2FE" : theme.text, fontWeight: 700 }}>{formatPomodoro(projectPomodoroTime)}</span>}
                <button onClick={() => setProjectPomodoroActive(a => !a)} style={{ marginLeft: "auto", background: "none", border: "none", color: isDarkMode ? "#C7D2FE" : theme.text, cursor: "pointer", fontSize: 12 }}>{projectPomodoroActive ? "⏸" : "▶"}</button>
              </div>
            ) : null}
            {/* Alerte conflit mini */}
            {projectConflicts.length > 0 && !sidebarCollapsed && (
              <div onClick={() => navigate("projects/planner")} style={{ background: "rgba(239,68,68,0.15)", borderRadius: 10, padding: "8px 10px", marginBottom: 8, cursor: "pointer" }}>
                <div style={{ fontSize: 10, color: "#A5B4FC", fontWeight: 700 }}>🚨 {projectConflicts.length} conflit{projectConflicts.length > 1 ? "s" : ""} détecté{projectConflicts.length > 1 ? "s" : ""}</div>
              </div>
            )}
            {/* GOD MODE: Score maîtrise global */}
            {!sidebarCollapsed && expressions.length > 0 && (
              <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)", borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: isDarkMode ? "rgba(255,255,255,0.5)" : theme.textMuted, fontWeight: 600 }}>MAÎTRISE GLOBALE</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: isDarkMode ? "#93A8FF" : theme.highlight }}>
                    {expressions.length > 0 ? (expressions.length > 0 ? Math.round((expressions.filter(e => e.level >= 7).length / expressions.length) * 100) : 0) : 0}%
                  </span>
                </div>
                <div style={{ height: 3, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${expressions.length > 0 ? (expressions.length > 0 ? Math.round((expressions.filter(e => e.level >= 7).length / expressions.length) * 100) : 0) : 0}%`, background: "linear-gradient(90deg,#7B93FF,#4D6BFE)", borderRadius: 2, transition: "width 0.8s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, color: isDarkMode ? "rgba(255,255,255,0.35)" : theme.textMuted }}>
                  <span>{expressions.filter(e => e.level >= 7).length} maîtrisées</span>
                  <span>{expressions.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7).length} en retard</span>
                </div>
              </div>
            )}
            {/* GOD MODE: Horloge live */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between", padding: "6px 4px" }}>
              {!sidebarCollapsed ? (
                <>
                  <span style={{ fontSize: 10, color: isDarkMode ? "rgba(255,255,255,0.3)" : theme.textMuted, fontWeight: 600, letterSpacing: 0.5 }}>⌥1-9 navigation</span>
                  <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: isDarkMode ? "rgba(255,255,255,0.6)" : theme.text }}>{sidebarClock}</span>
                </>
              ) : (
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: isDarkMode ? "rgba(255,255,255,0.5)" : theme.textMuted }}>{sidebarClock}</span>
              )}
            </div>
          </div>
        </aside>

        {/* ═══ MOBILE SPEED DIAL (replaces 5-button bottom nav) ═══ */}
        {isMobile && (() => {
          const dueCount = expressions.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7).length;

          return (
            <>
              <MobileSpeedDial
                view={view}
                isDarkMode={isDarkMode}
                badges={{
                  dashboard: todayReviews.length > 0 ? todayReviews.length : 0,
                  list: dueCount > 0 ? dueCount : 0,
                }}
                onNavigate={(id) => {
                  setMobileDrawerOpen(false);
                  setMobileFabOpen(false);
                  setView(id);
                }}
                onOpenAddSheet={() => {
                  setMobileDrawerOpen(false);
                  setMobileFabOpen(false);
                  setView("add");
                }}
                onOpenMoreDrawer={() => {
                  setMobileFabOpen(false);
                  setMobileDrawerOpen(true);
                }}
              />
              <MobileAddSheet
                open={mobileAddSheetOpen}
                isDarkMode={isDarkMode}
                onClose={() => setMobileAddSheetOpen(false)}
                onPick={(subId) => {
                  navigate(`add/${subId}`);
                }}
              />
            </>
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
                position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 199,
                background: isDarkMode ? "#0B1120" : "#FFFFFF",
                borderRadius: "32px 32px 0 0", padding: "24px 20px 40px",
                animation: "drawerUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                maxHeight: "85vh", overflowY: "auto",
                boxShadow: "0 -10px 40px rgba(77,107,254,0.2)",
              }}
              onTouchStart={(e) => { touchMainStartY.current = e.touches[0].clientY; }}
              onTouchEnd={(e) => {
                const dy = e.changedTouches[0].clientY - touchMainStartY.current;
                if (dy > 50) {
                  setMobileDrawerOpen(false);
                }
              }}
            >
              {/* Handle */}
              <div style={{ width: 48, height: 5, background: isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(77,107,254,0.1)", borderRadius: 3, margin: "0 auto 24px" }} />

              {/* Section Apprentissage */}
              {/* Recherche rapide depuis le drawer */}
              <div style={{ marginBottom: 16, position: "relative" }}>
                <input
                  type="text"
                  placeholder="🔍 Recherche rapide..."
                  style={{
                    width: "100%", padding: "12px 16px", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)"}`, borderRadius: 16, color: theme.text, fontSize: 15, outline: "none",
                  }}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setView("list"); setMobileDrawerOpen(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { setView("list"); setMobileDrawerOpen(false); } }}
                />
                {searchQuery && (
                  <span onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 12, top: 12, color: theme.text, cursor: "pointer", fontSize: 16 }}>✕</span>
                )}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, paddingLeft: 4 }}>Apprentissage</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { id: "routine", icon: "🌟", label: "Routine" },
                  { id: "practice", icon: "🗣️", label: "English" },
                  { id: "projects", icon: "🗂️", label: "Projets" },
                  { id: "portfolio", icon: "📁", label: "Portfolio" },
                  { id: "veille", icon: "📰", label: "Actualités" },
                ].map(item => (
                  <button key={item.id} onClick={() => { setView(item.id); setMobileDrawerOpen(false); if (item.id === "projects") setProjectSubView("hub"); }} style={{
                    background: view === item.id ? (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)") : (isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(77,107,254,0.05)"),
                    border: `1px solid ${view === item.id ? theme.highlight : (isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)")}`, borderRadius: 18,
                    color: view === item.id ? theme.highlight : theme.text, padding: "16px 8px", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    fontSize: 14, fontWeight: 700,
                  }}>
                    <span style={{ fontSize: 26 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Section Analyse & Intelligence */}
              <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, paddingLeft: 4 }}>Analyse & IA</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { id: "categories", icon: "◉", label: "Modules" },
                  { id: "stats", icon: "▣", label: "Stats" },
                  { id: "badges", icon: "🏆", label: "Badges", badge: (unlockedBadges.length - lastViewedBadgesCount) > 0 ? (unlockedBadges.length - lastViewedBadgesCount) : null },
                  { id: "certifications", icon: "🎓", label: "Certifs", badge: 3 },
                  { id: "opensource", icon: "🚀", label: "Radar OS" },
                ].map(item => (
                  <button key={item.id} onClick={() => { if (item.onClick) item.onClick(); else setView(item.id); setMobileDrawerOpen(false); }} style={{
                    background: view === item.id ? (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)") : (isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(77,107,254,0.05)"),
                    border: `1px solid ${view === item.id ? theme.highlight : (isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)")}`, borderRadius: 18,
                    color: view === item.id ? theme.highlight : theme.text, padding: "16px 8px", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    fontSize: 14, fontWeight: 700, position: "relative",
                  }}>
                    <span style={{ fontSize: 26 }}>{item.icon}</span>
                    {item.label}
                    {item.badge > 0 && <span style={{ position: "absolute", top: 8, right: 8, background: "#EF4444", color: "white", borderRadius: 20, padding: "2px 6px", fontSize: 10, fontWeight: 900 }}>{item.badge}</span>}
                  </button>
                ))}
              </div>

              {/* Maîtrise globale mini */}
              {expressions.length > 0 && (
                <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)", borderRadius: 18, padding: "16px 20px", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>MAÎTRISE GLOBALE</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: theme.highlight }}>
                      {(expressions.length > 0 ? Math.round((expressions.filter(e => e.level >= 7).length / expressions.length) * 100) : 0)}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${(expressions.length > 0 ? Math.round((expressions.filter(e => e.level >= 7).length / expressions.length) * 100) : 0)}%`, background: "linear-gradient(90deg,#7B93FF,#4D6BFE)", borderRadius: 3 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>
                    <span>{expressions.filter(e => e.level >= 7).length} maîtrisées</span>
                    <span>{expressions.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7).length} en retard</span>
                  </div>
                </div>
              )}

              {/* Pomodoro dans drawer si actif */}
              {(projectPomodoroTime < 25 * 60 || projectPomodoroActive) && (
                <div style={{ background: isDarkMode ? "rgba(77,107,254,0.15)" : "rgba(77,107,254,0.1)", borderRadius: 18, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, border: `1px solid ${isDarkMode ? "rgba(77,107,254,0.2)" : "rgba(77,107,254,0.15)"}` }}>
                  <span style={{ fontSize: 20 }}>{projectPomodoroMode === "study" ? "📚" : projectPomodoroMode === "project" ? "🗂️" : "☕"}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, color: theme.highlight, fontWeight: 800, flex: 1 }}>{formatPomodoro(projectPomodoroTime)}</span>
                  <button onClick={() => setProjectPomodoroActive(a => !a)} style={{ background: "none", border: "none", color: theme.highlight, cursor: "pointer", fontSize: 24 }}>{projectPomodoroActive ? "⏸" : "▶"}</button>
                </div>
              )}
            </div>
          </>
        )}

        <main
          className="main-content"
          style={{
            flex: 1, width: 0, minWidth: 0, boxSizing: "border-box", marginTop: oneHanded ? '45vh' : 0, transition: 'margin-top 0.3s ease', padding: "32px 36px 80px", paddingBottom: isMobile ? "calc(var(--nav-h, 92px) + 24px + env(safe-area-inset-bottom, 0px))" : "106px", position: "relative", zIndex: 1,

            touchAction: 'auto',
          }}
        >
          {view === "dashboard" && (() => {
            // ── Données locales dashboard ──────────────────────────────────────────
            const totalCards = expressions.length;
            const dueCount = todayReviews.length;
            const mastPct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;
            const estMinutes = Math.ceil(dueCount * 0.5);
            const formColor = dashFormIndex >= 70 ? "#4ADE80" : dashFormIndex >= 40 ? "#FACC15" : "#F87171";
            const canReview = dueCount > 0;

            // ── MOBILE : Home V2 simplifiée (la version desktop reste intacte ci-dessous) ──
            const isMobileHome = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
            if (isMobileHome) {
              const dueModules = categories
                .map(c => ({
                  name: c.name,
                  count: expressions.filter(e => e.category === c.name && isDue(e.nextReview, today()) && (e.level || 0) < 7).length
                }))
                .filter(c => c.count > 0);

              return (
                <MobileHomeV2
                  userName={"Mémorisateur"}
                  level={getArchetype(powerLevel).level}
                  xp={getArchetype(powerLevel).xp - getArchetype(powerLevel).currentLevelXp}
                  xpToNext={getArchetype(powerLevel).nextLevelXp - getArchetype(powerLevel).currentLevelXp || 1}
                  streak={stats?.streak || 0}
                  energy={stamina}
                  dueCount={dueCount}
                  estMinutes={estMinutes}
                  dueModules={dueModules}
                  onStartSession={(moduleName = null) => startReview(moduleName, "standard")}
                  onExploreLab={() => setView("lab")}
                  stats={{
                    forme: dashFormIndex,
                    mastery: mastPct,
                    nextExamDays: null,
                  }}
                  shortcuts={[
                    { id: "routine", icon: "🌟", label: "Routine", sub: "Du Jour", onClick: () => setView("routine") },
                    { id: "veille", icon: "📰", label: "Veille tech", sub: "News & IA", onClick: () => setView("veille") },
                    { id: "stats", icon: "📊", label: "Rapport", sub: "Cette semaine", onClick: () => setView("stats") },
                    { id: "list", icon: "🗂️", label: "Mes fiches", sub: `${totalCards} cartes`, onClick: () => setView("list") },
                  ]}
                />
              );
            }

            return (
              <div style={{
                animation: isEnteringFlow ? "flowZoomIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "fadeUp 0.4s ease",
                display: "flex", flexDirection: "column", gap: 20,
                pointerEvents: isEnteringFlow ? "none" : "auto"
              }}>
                {/* ── COUCHE 1 : Intelligence de Veille Continue ── */}

                {/* ══ HERO HEADER ══════════════════════════════════════════════════════ */}

                <HoloCard className="dash-hero-card" glowColor={theme.highlight} style={{
                  position: "relative", borderRadius: 20, overflow: "hidden",
                  background: theme.gradient,
                  padding: "20px 24px 18px",
                  boxShadow: isDarkMode
                    ? "0 16px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)"
                    : "0 12px 40px rgba(26,35,126,0.35)",
                }}>
                  {/* Orbes décoratifs */}
                  <div style={{ position: "absolute", top: -60, right: -40, width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(77,107,254,0.25) 0%, transparent 70%)", pointerEvents: "none", animation: "orb1 8s ease-in-out infinite" }} />
                  <div style={{ position: "absolute", bottom: -80, left: 60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(123,147,255,0.15) 0%, transparent 70%)", pointerEvents: "none", animation: "orb2 10s ease-in-out infinite" }} />

                  {/* Ligne supérieure : salutation + forme */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, position: "relative", zIndex: 1, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
                        {hour >= 5 && hour < 12 ? "🌅 Matin" : hour < 18 ? "☀️ Après-midi" : "🌙 Soirée"}
                      </div>
                      <h1 className="dash-hero-title" style={{ margin: 0, fontSize: "clamp(16px, 3vw, 22px)", fontWeight: 900, color: "white", letterSpacing: "-0.5px", lineHeight: 1.15 }}>
                        {greeting},
                        <span style={{ background: "linear-gradient(90deg, #7B93FF, #A5B4FC)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>El Hadji Malick</span>
                      </h1>
                      {(() => {
                        const archetype = getArchetype(powerLevel);
                        return (
                          <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)' }}>
                            <span style={{ fontSize: 14 }}>{archetype.icon}</span>
                            <span style={{ color: 'white', fontWeight: 700, fontSize: 11 }}>{archetype.title} (Niv. {archetype.level})</span>
                            <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.3)", marginLeft: 2, marginRight: 2 }} />
                            <span style={{ color: '#FCD34D', fontWeight: 800, fontSize: 11 }}>🏆 {unlockedBadges.length} Badges</span>
                          </div>
                        );
                      })()}
                      <br />

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        <div onClick={() => setView("phantom")} style={{ background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.4)", borderRadius: 10, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", backdropFilter: "blur(10px)" }}>
                          <span style={{ fontSize: 13 }}>🕵️</span>
                          <div>
                            <div style={{ color: "#93C5FD", fontSize: 11, fontWeight: 800 }}>Recruteur Fantôme</div>
                            <div style={{ color: "white", fontSize: 10, opacity: 0.8 }}>Préparer tes dossiers</div>
                          </div>
                        </div>
                        <div onClick={() => setView("oracle")} style={{ background: "rgba(77, 107, 254, 0.15)", border: "1px solid rgba(77, 107, 254, 0.4)", borderRadius: 10, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", backdropFilter: "blur(10px)" }}>
                          <span style={{ fontSize: 13 }}>🔮</span>
                          <div>
                            <div style={{ color: "#C4B5FD", fontSize: 11, fontWeight: 800 }}>Tech Oracle</div>
                            <div style={{ color: "white", fontSize: 10, opacity: 0.8 }}>Ta valeur en 2028</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Indicateurs droite */}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {/* Forme */}
                      <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", borderRadius: 12, padding: "8px 14px", textAlign: "center", border: "1px solid rgba(255,255,255,0.12)" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: formColor, lineHeight: 1 }}>{dashFormIndex}%</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>Forme</div>
                      </div>
                      {/* Streak */}
                      <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", borderRadius: 12, padding: "8px 14px", textAlign: "center", border: "1px solid rgba(255,255,255,0.12)" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#FCD34D", lineHeight: 1 }}>{stats.streak}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>🔥 Jours</div>
                      </div>
                      {/* Examen */}
                      {dashNextExam && (
                        <div style={{ background: dashNextExam.daysLeft <= 7 ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", borderRadius: 12, padding: "8px 14px", textAlign: "center", border: dashNextExam.daysLeft <= 7 ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.12)" }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: dashNextExam.daysLeft <= 7 ? "#F87171" : "#60A5FA", lineHeight: 1 }}>J-{dashNextExam.daysLeft}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginTop: 3, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dashNextExam.name}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Citation */}
                  <div style={{ marginTop: 10, position: "relative", zIndex: 1 }}>
                    <p style={{ margin: 0, fontStyle: "italic", color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 1.5, maxWidth: 560 }}>
                      « {dashQuote || "La connaissance s'acquiert par l'expérience, tout le reste n'est que de l'information."} »
                    </p>
                    <button onClick={loadDailyQuote} style={{ marginTop: 4, background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                      {dashQuoteLoading ? "⏳ chargement…" : "↻ nouvelle citation"}
                    </button>
                  </div>

                  {/* Barres RPG : XP & Stamina */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', zIndex: 1, marginTop: 10 }}>
                    {/* XP Bar */}
                    {(() => {
                      const archetype = getArchetype(powerLevel);
                      const xpInLevel = archetype.xp - archetype.currentLevelXp;
                      const xpNeeded = archetype.nextLevelXp - archetype.currentLevelXp;
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>⭐ XP — Niv. {archetype.level}</span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{xpNeeded > 0 ? `${xpInLevel} / ${xpNeeded}` : "MAX"}</span>
                          </div>
                          <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${archetype.progress}%`, height: '100%', background: 'linear-gradient(90deg, #FCD34D, #F59E0B)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      );
                    })()}
                    {/* Stamina Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>⚡ Énergie</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{stamina} / 100</span>
                      </div>
                      <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${stamina}%`, height: '100%', background: stamina > 20 ? 'linear-gradient(90deg, #4ADE80, #34D399)' : 'linear-gradient(90deg, #F87171, #EF4444)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  </div>
                </HoloCard>

                {/* ══ GOD UPGRADES — Heatmap + Resume + Smart Reco ════════════════ */}
                <YearHeatmap
                  sessionHistory={sessions}
                  onClickDay={(d) => showToast(`📅 ${d}`)}
                  theme={theme}
                  isDarkMode={isDarkMode}
                />
                <ResumeCarousel
                  theme={theme}
                  items={[
                    (typeof sessionInProgress !== "undefined" && sessionInProgress) && { icon: "▶", label: "Session interrompue", sublabel: `${sessionInProgress.cardsLeft} fiches restantes`, onClick: () => setView("review") },
                    (typeof lastFailed !== "undefined" && lastFailed) && { icon: "❌", label: "Dernière fiche ratée", sublabel: String(lastFailed.front || "").slice(0, 40), onClick: () => (typeof openCard === "function" ? openCard(lastFailed.id) : setView("list")) },
                    (typeof lastLabDoc !== "undefined" && lastLabDoc) && { icon: "🧪", label: "Dernier doc Lab", sublabel: lastLabDoc.name, onClick: () => setView("lab") },
                    (typeof lastQuiz !== "undefined" && lastQuiz) && { icon: "❓", label: "Quiz à finir", sublabel: `${lastQuiz.done}/${lastQuiz.total}`, onClick: () => (typeof resumeQuiz === "function" ? resumeQuiz(lastQuiz.id) : setView("review")) },
                  ].filter(Boolean)}
                />
                {(() => {
                  const reco = getSmartSessionRecommendation({ dueCount, streak: stats.streak, hour });
                  return (
                    <button onClick={() => {
                      if (reco.mode === "explore") { setView("lab"); return; }
                      // Wakeup/Express/Deep/Light : on lance directement la révision
                      if (dueCount > 0) {
                        startReview(null, "standard");
                      } else {
                        setView("review");
                      }
                    }}
                      className="hov" style={{ padding: 16, borderRadius: 16, background: `linear-gradient(135deg, ${theme.highlight}, color-mix(in srgb, ${theme.highlight} 50%, transparent))`, color: "white", border: "none", textAlign: "left", cursor: "pointer" }}>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{reco.icon} {reco.label}</div>
                      <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{reco.reason}</div>
                    </button>
                  );
                })()}
                {/* ════════════════════════════════════════════════════════════════ */}

                {/* ══ MODE FOCUS (si actif) ════════════════════════════════════════════ */}
                {dashFocusMode ? (
                  <div className="dash-widget-card" style={{ background: isDarkMode ? "rgba(67,56,202,0.12)" : "#EEF2FF", borderRadius: 24, padding: "28px 32px", border: "2px solid #4338CA", animation: "fadeUp 0.3s ease" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: isDarkMode ? "#7B93FF" : "#3730A3" }}>🎯 Mode Focus</div>
                        <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>Fiches urgentes uniquement</div>
                      </div>
                      <button onClick={() => setDashFocusMode(false)} style={{ background: "none", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "6px 14px", color: theme.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Quitter</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                      {dashUrgentCards.length === 0
                        ? <div style={{ color: theme.textMuted, fontSize: 14 }}>✅ Aucune fiche urgente !</div>
                        : dashUrgentCards.map(card => (
                          <div key={card.id} style={{ display: "flex", justifyContent: "space-between", background: theme.cardBg, borderRadius: 12, padding: "10px 16px", border: `1px solid ${theme.border}` }}>
                            <span style={{ color: theme.text, fontWeight: 600, fontSize: 14 }}>{card.front}</span>
                            <span style={{ color: "#F87171", fontSize: 12, fontWeight: 700 }}>{card.nextReview}</span>
                          </div>
                        ))
                      }
                    </div>
                    <button onClick={() => startReview(null, "standard")} className="btn-glow" style={{ padding: "14px 28px", background: "linear-gradient(135deg, #4338CA, #4D6BFE)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
                      🚀 Lancer révision urgente
                    </button>
                  </div>
                ) : (
                  <>
                    {/* ══ BLOC MISSION DU JOUR ════════════════════════════════════════ */}
                    <HoloCard theme={theme} glowColor={canReview ? "#7B93FF" : "#4ADE80"} style={{
                      borderRadius: 24, overflow: "hidden",
                      background: isDarkMode ? "linear-gradient(135deg, #0f172a, #111827)" : "linear-gradient(135deg, #f8faff, #ffffff)",
                      border: `1px solid ${theme.border}`,
                      boxShadow: isDarkMode ? "0 8px 32px rgba(0,0,0,0.3)" : "0 4px 24px rgba(77,107,254,0.08)",
                    }}>
                      {/* Stamina Warning */}
                      {stamina < 20 && (
                        <div style={{ padding: '10px 14px', background: '#FEF2F2', color: '#DC2626', borderRadius: 12, border: '1px solid #FCA5A5', fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>🧠</span>
                          <div>
                            Ton énergie cognitive est basse. Une pause ou une session Lofi serait une bonne idée !
                          </div>
                        </div>
                      )}
                      {/* Bandeau coloré */}
                      <div style={{ height: 4, background: canReview ? "linear-gradient(90deg, #4D6BFE, #7B93FF, #7B93FF)" : "linear-gradient(90deg, #4ADE80, #34D399)" }} />
                      <div className="dash-mission-card" style={{ padding: "28px 28px 24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: canReview ? "#7B93FF" : "#4ADE80", animation: "pulse 2s infinite" }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1.5 }}>Mission du jour</span>
                          <button onClick={() => setDashFocusMode(true)} style={{ marginLeft: "auto", background: isDarkMode ? "rgba(77, 107, 254,0.1)" : "#EEF2FF", border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.3)" : "#C7D2FE"}`, borderRadius: 8, padding: "4px 12px", color: "#4D6BFE", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            🎯 Focus
                          </button>
                        </div>

                        {/* Stats principales */}
                        <div className="dash-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16, marginBottom: 24 }}>
                          {[
                            { val: dueCount, label: "À réviser", sub: `~${estMinutes} min`, color: canReview ? "#7B93FF" : "#4ADE80" },
                            { val: newCards.length, label: "Nouvelles", sub: "à découvrir", color: "#60A5FA" },
                            { val: masteredCount, label: "Maîtrisées", sub: `${mastPct}% du total`, color: "#34D399" },
                            { val: stats.totalReviews, label: "Total", sub: "révisions vie", color: "#FBBF24" },
                          ].map(({ val, label, sub, color }) => (
                            <div key={label} style={{ textAlign: "center", background: isDarkMode ? "rgba(255,255,255,0.03)" : "#F8FAFF", borderRadius: 16, padding: "18px 12px", border: `1px solid ${theme.border}` }}>
                              <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1, letterSpacing: "-1px" }}>{val}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginTop: 6 }}>{label}</div>
                              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{sub}</div>
                            </div>
                          ))}
                        </div>

                        {/* Boutons révision (Flow State) */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <button
                            onClick={handleEnterFlow}
                            disabled={!canReview}
                            className="dash-flow-btn"
                            style={{
                              width: "100%", padding: "20px",
                              background: canReview ? "linear-gradient(270deg, #4D6BFE, #3451D1, #EC4899, #4D6BFE)" : theme.inputBg,
                              backgroundSize: "300% 300%",
                              animation: canReview ? "gradientPulseFlow 4s ease infinite" : "none",
                              color: canReview ? "white" : theme.textMuted,
                              border: "none", borderRadius: 20,
                              cursor: canReview ? "pointer" : "default",
                              opacity: canReview ? 1 : 0.45,
                              boxShadow: canReview ? "0 10px 40px rgba(52, 81, 209,0.3)" : "none",
                              transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 8
                            }}
                            onMouseEnter={e => canReview && (e.currentTarget.style.transform = "scale(1.02)")}
                            onMouseLeave={e => canReview && (e.currentTarget.style.transform = "scale(1)")}
                          >
                            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px" }}>🌀 Entrer dans la Zone</span>
                            <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>L'IA a préparé ta playlist optimale (FSRS + Interleaving)</span>
                          </button>

                          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                            <button onClick={() => startReview(null, "standard")} disabled={!canReview} className="hov" style={{ background: "transparent", border: `1px solid ${theme.border}`, color: theme.textMuted, padding: "8px 16px", borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: canReview ? "pointer" : "default", opacity: canReview ? 1 : 0.45 }}>
                              📚 Standard
                            </button>
                            <button onClick={() => startReview(null, "vocal")} disabled={!canReview} className="hov" style={{ background: "transparent", border: `1px solid ${theme.border}`, color: theme.textMuted, padding: "8px 16px", borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: canReview ? "pointer" : "default", opacity: canReview ? 1 : 0.45 }}>
                              🎤 Vocal
                            </button>
                          </div>
                        </div>
                      </div>
                    </HoloCard>

                    {/* ══ GRILLE SECONDAIRE ═══════════════════════════════════════════ */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px,100%),1fr))", gap: 16 }}>

                      {/* 1. Plan du jour IA - Timeline Interactive */}
                      <HoloCard className="dash-widget-card" theme={theme} glowColor="#4D6BFE" style={{ background: theme.cardBg, borderRadius: 24, padding: "24px", border: `1px solid ${theme.border}`, display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ padding: "8px", background: isDarkMode ? "rgba(77,107,254,0.15)" : "#EEF2FF", borderRadius: 12, color: "#4D6BFE" }}>
                              <span style={{ fontSize: 20 }}>⏱️</span>
                            </div>
                            <div>
                              <div style={{ fontWeight: 900, color: theme.text, fontSize: 16 }}>Plan d'Attaque</div>
                              <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>Généré par l'IA</div>
                            </div>
                          </div>
                          <button onClick={loadDailyPlan} className="hov" style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.highlight, cursor: "pointer", fontSize: 12, padding: "6px 12px", borderRadius: 10, fontWeight: 700 }} title="Régénérer">↻ Sync</button>
                        </div>
                        {dashDailyPlanLoading
                          ? <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: "20px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <div style={{ animation: "pulse 1.5s infinite", fontSize: 32, marginBottom: 12 }}>🧠</div>
                            Analyse de ta charge cognitive...
                          </div>
                          : dashDailyPlan.length === 0
                            ? <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                              <button onClick={loadDailyPlan} className="btn-glow" style={{ width: "100%", padding: "16px", background: "linear-gradient(135deg, #4D6BFE, #1E3A8A)", border: "none", borderRadius: 16, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, boxShadow: "0 8px 20px rgba(77,107,254,0.3)" }}>
                                ✨ Générer mon plan optimal
                              </button>
                            </div>
                            : <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative", marginTop: 8 }}>
                              <div style={{ position: "absolute", left: 21, top: 10, bottom: 10, width: 2, background: theme.border, borderRadius: 2 }} />
                              {dashDailyPlan.map((slot, i) => {
                                const currentHourNum = new Date().getHours();
                                const slotHourMatch = slot.time.match(/(\d+)/);
                                const slotHour = slotHourMatch ? parseInt(slotHourMatch[1], 10) : -1;
                                const isPast = slotHour !== -1 && currentHourNum > slotHour;
                                const isCurrent = slotHour !== -1 && currentHourNum === slotHour;

                                return (
                                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", position: "relative", zIndex: 1, opacity: isPast ? 0.6 : 1 }}>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 900, color: isCurrent ? theme.highlight : theme.textMuted, fontSize: 11, width: 40, textAlign: "right" }}>{slot.time}</div>
                                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: isCurrent ? theme.highlight : theme.cardBg, border: `2px solid ${isCurrent ? theme.highlight : theme.border}`, boxShadow: isCurrent ? `0 0 12px ${theme.highlight}` : "none", zIndex: 2, marginLeft: -1 }} />
                                    <div style={{ flex: 1, background: isCurrent ? (isDarkMode ? "rgba(77,107,254,0.15)" : "#EEF2FF") : theme.inputBg, borderRadius: 12, padding: "12px 14px", border: `1px solid ${isCurrent ? "#4D6BFE50" : theme.border}` }}>
                                      <span style={{ color: isCurrent ? theme.highlight : theme.text, fontSize: 13, fontWeight: isCurrent ? 700 : 500, lineHeight: 1.4 }}>{slot.activity}</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                        }
                      </HoloCard>

                      {/* 2. Objectifs de la semaine - Quêtes RPG */}
                      <HoloCard className="dash-widget-card" theme={theme} glowColor="#10B981" style={{ background: theme.cardBg, borderRadius: 24, padding: "24px", border: `1px solid ${theme.border}`, display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                          <div style={{ padding: "8px", background: isDarkMode ? "rgba(16,185,129,0.15)" : "#F0FDF4", borderRadius: 12, color: "#10B981" }}>
                            <span style={{ fontSize: 20 }}>📜</span>
                          </div>
                          <div>
                            <div style={{ fontWeight: 900, color: theme.text, fontSize: 16 }}>Quêtes de la Semaine</div>
                            <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>Objectifs à accomplir</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, flex: 1, overflowY: "auto" }}>
                          {dashWeeklyGoals.length === 0
                            ? <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>Aucune quête en cours. Ajoutes-en une !</div>
                            : dashWeeklyGoals.map((goal, i) => (
                              <div key={i} className="hov" style={{ display: "flex", alignItems: "center", gap: 12, background: theme.inputBg, borderRadius: 14, padding: "12px 16px", border: `1px solid ${theme.border}`, transition: "all 0.2s" }}>
                                <button onClick={() => removeWeeklyGoal(i)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${theme.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }} title="Accomplir (Supprimer)">
                                  <span style={{ opacity: 0, transition: "opacity 0.2s", color: "#10B981", fontWeight: 900, fontSize: 14 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>✓</span>
                                </button>
                                <span style={{ color: theme.text, fontSize: 13, flex: 1, lineHeight: 1.4, fontWeight: 600 }}>{goal}</span>
                              </div>
                            ))
                          }
                        </div>

                        <div style={{ display: "flex", gap: 8, background: theme.inputBg, padding: 6, borderRadius: 16, border: `1px solid ${theme.border}` }}>
                          <input
                            value={dashWeeklyGoalsInput}
                            onChange={e => setDashWeeklyGoalsInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addWeeklyGoal()}
                            placeholder="Nouvelle quête..."
                            style={{ flex: 1, padding: "8px 12px", background: "transparent", border: "none", color: theme.text, fontSize: 13, outline: "none" }}
                          />
                          <button onClick={addWeeklyGoal} disabled={!dashWeeklyGoalsInput.trim()} style={{ padding: "8px 16px", background: dashWeeklyGoalsInput.trim() ? "#10B981" : theme.border, color: "white", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: dashWeeklyGoalsInput.trim() ? "pointer" : "default", transition: "background 0.3s" }}>+</button>
                        </div>
                      </HoloCard>

                      {/* 3. Rétro semaine - Rapport IA */}
                      <HoloCard className="dash-widget-card" theme={theme} glowColor="#4D6BFE" style={{ background: theme.cardBg, borderRadius: 24, padding: "24px", border: `1px solid ${theme.border}`, display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ padding: "8px", background: isDarkMode ? "rgba(77, 107, 254,0.15)" : "#F5F3FF", borderRadius: 12, color: "#4D6BFE" }}>
                              <span style={{ fontSize: 20 }}>📡</span>
                            </div>
                            <div>
                              <div style={{ fontWeight: 900, color: theme.text, fontSize: 16 }}>Rapport IA</div>
                              <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>Synthèse de la semaine</div>
                            </div>
                          </div>
                          <button onClick={loadWeeklyRetro} className="hov" style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: "#4D6BFE", cursor: "pointer", fontSize: 12, padding: "6px 12px", borderRadius: 10, fontWeight: 700 }} title="Actualiser">↻ Sync</button>
                        </div>

                        {dashWeeklyRetroLoading
                          ? <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: "20px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <div style={{ animation: "spin 2s linear infinite", fontSize: 32, marginBottom: 12, display: "inline-block" }}>⚙️</div>
                            Compilation des données...
                          </div>
                          : dashWeeklyRetro
                            ? <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
                                <div style={{ fontSize: 42, fontWeight: 900, color: "#4D6BFE", letterSpacing: "-2px", lineHeight: 1 }}>{dashWeeklyRetro.totalReviews}</div>
                                <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>révisions</div>
                              </div>
                              <div style={{ flex: 1, padding: "16px", background: isDarkMode ? "rgba(77, 107, 254,0.08)" : "#F5F3FF", borderRadius: 16, border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.2)" : "#EDE9FE"}` }}>
                                <div style={{ fontSize: 10, fontWeight: 900, color: "#4D6BFE", marginBottom: 8, letterSpacing: 1 }}>DEBRIEFING</div>
                                <p style={{ color: theme.text, fontSize: 14, margin: 0, lineHeight: 1.6, fontWeight: 500 }}>{dashWeeklyRetro.summary}</p>
                              </div>
                            </div>
                            : <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                              <button onClick={loadWeeklyRetro} className="btn-glow" style={{ width: "100%", padding: "16px", background: "linear-gradient(135deg, #4D6BFE, #4C1D95)", border: "none", borderRadius: 16, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, boxShadow: "0 8px 20px rgba(77, 107, 254,0.3)" }}>
                                📡 Analyser ma semaine
                              </button>
                            </div>
                        }
                      </HoloCard>
                    </div>

                    {/* ══ FICHES URGENTES ═════════════════════════════════════════════ */}
                    {dashUrgentCards.length > 0 && (
                      <HoloCard className="dash-widget-card" urgent={true} glowColor="#EF4444" style={{ borderRadius: 20, padding: "22px 24px", background: isDarkMode ? "rgba(239,68,68,0.07)" : "#FEF2F2", border: `1px solid ${isDarkMode ? "rgba(239,68,68,0.2)" : "#FCA5A5"}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16 }}>⚠️</span>
                            <span style={{ fontWeight: 800, color: isDarkMode ? "#F87171" : "#DC2626", fontSize: 14 }}>Risque d'oubli — {dashUrgentCards.length} fiches</span>
                          </div>
                          <button onClick={() => startReview(null, "standard", dashUrgentCards)} style={{ padding: "8px 18px", background: "#EF4444", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                            🚀 Réviser
                          </button>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {dashUrgentCards.map(card => (
                            <div key={card.id} style={{ background: isDarkMode ? "rgba(239,68,68,0.1)" : "white", borderRadius: 10, padding: "8px 14px", border: `1px solid ${isDarkMode ? "rgba(239,68,68,0.2)" : "#FCA5A5"}`, maxWidth: 260 }}>
                              <div style={{ fontWeight: 700, color: theme.text, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.front}</div>
                              <div style={{ fontSize: 11, color: "#F87171", marginTop: 2, fontWeight: 600 }}>due : {card.nextReview}</div>
                            </div>
                          ))}
                        </div>
                      </HoloCard>
                    )}

                    {/* ══ MODULES ═════════════════════════════════════════════════════ */}
                    {categories.length > 0 && (
                      <HoloCard className="dash-widget-card" theme={theme} style={{ background: theme.cardBg, borderRadius: 20, padding: "22px 24px", border: `1px solid ${theme.border}` }} glowColor="#7B93FF">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                          <span style={{ fontSize: 16 }}>⚡</span>
                          <span style={{ fontWeight: 800, color: theme.text, fontSize: 15 }}>Constellation des Connaissances</span>
                        </div>
                        <KnowledgeGraph
                          categories={categories} expressions={expressions}
                          theme={theme} isDarkMode={isDarkMode}
                          onNodeClick={(categoryName) => startReview(categoryName, "standard")}
                        />
                      </HoloCard>
                    )}

                  </>
                )}
              </div>
            );
          })()}
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
          ) : reviewQueue.length === 0 ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 40 }}>
              <p style={{ fontSize: 20 }}>⏳</p>
              <p>Chargement des fiches...</p>
            </div>
          ) : currentCard && (
            <div style={{ animation: "flowCardEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <button onClick={() => { clearInterval(sessionTimerRef.current); setView("dashboard"); if (reviewSessionDone > 0) updateStreakAfterSession(reviewSessionDone); }} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 16px", color: theme.highlight, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Quitter</button>
                <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 15, color: theme.textMuted }}><span style={{ color: theme.highlight, fontWeight: 800 }}>{reviewIndex + 1}</span> / {reviewQueue.length}</div>
                <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 900, fontSize: 14, background: "#FFFFFF", color: "#3451D1", padding: "4px 12px", borderRadius: 8 }}>⏱ {Math.floor(sessionTimer / 60)}:{(sessionTimer % 60).toString().padStart(2, '0')}</div>
              </div>
              <div style={{ height: 8, background: theme.inputBg, borderRadius: 4, marginBottom: 32, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "linear-gradient(90deg, #3451D1, #4D6BFE)", borderRadius: 4, transition: "width 0.4s ease", width: `${((reviewIndex + 1) / reviewQueue.length) * 100}%` }} />
              </div>
              {currentCard && (() => {
                const tag = cognitiveTag(currentCard);
                return (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => {
                          // Mémoriser qu'on doit revenir à la review sur la même fiche
                          setEditReturnTo({ view: "review", cardId: currentCard.id });
                          startEdit(currentCard);
                        }} className="hov" title="Modifier cette fiche puis revenir à la révision" style={{ background: "#EEF2FF", color: "#4D6BFE", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid #4D6BFE30", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>✏️ Modifier</button>
                        <button onClick={() => {
                          deleteExp(currentCard.id);
                          const newQueue = reviewQueue.filter(c => c.id !== currentCard.id);
                          setReviewQueue(newQueue);
                          setRevealed(false);
                          setUserAnswer("");
                          setSocraticHint("");
                          setRabbitHoleOpen(false);
                          setMnemonicText("");
                          setCardStartTime(Date.now());
                          if (reviewIndex >= newQueue.length) {
                            setShowSessionSummary(true);
                          }
                        }} className="hov" title="Supprimer cette fiche définitivement" style={{ background: "#FEF2F2", color: "#EF4444", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid #EF444430", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>🗑️ Supprimer</button>
                      </div>
                      <span style={{ background: tag.color + "22", color: tag.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{tag.icon} {tag.label}</span>
                    </div>

                    <div
                      className="card-hov review-session-card"
                      style={{
                        position: "relative",
                        background: theme.cardBg,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 26,
                        padding: "32px",
                        boxShadow: "0 10px 40px rgba(77,107,254,0.05)",
                        maxWidth: 700,
                        margin: "0 auto",
                        transform: `translate(${swipeX}px, ${swipeY}px) rotate(${swipeX * 0.05}deg)`,
                        transition: swipeX === 0 && swipeY === 0 ? 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none',
                      }}
                      onTouchStart={(e) => {
                        if (!revealed) return; // seulement quand la réponse est visible
                        touchStartX.current = e.touches[0].clientX;
                        touchStartY.current = e.touches[0].clientY;
                      }}
                      onTouchMove={(e) => {
                        if (!revealed) return;
                        const currentX = e.touches[0].clientX;
                        const currentY = e.touches[0].clientY;
                        const dx = currentX - touchStartX.current;
                        const dy = currentY - touchStartY.current;
                        // Ratio strict + seuil de démarrage plus haut → fini les déclenchements accidentels en scroll diagonal
                        if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 2.5) {
                          e.preventDefault();
                          setSwipeX(dx);
                          setSwipeY(0);
                        } else if (Math.abs(dy) > 8) {
                          // Le geste est clairement vertical : on relâche le swipe pour laisser le scroll natif faire son boulot
                          setSwipeX(0);
                          setSwipeY(0);
                        }
                      }}
                      onTouchEnd={(e) => {
                        if (!revealed) return;
                        const dx = e.changedTouches[0].clientX - touchStartX.current;
                        const dy = e.changedTouches[0].clientY - touchStartY.current;
                        setSwipeX(0);
                        setSwipeY(0);
                        const threshold = 110; // pixels — il faut un swipe franchement intentionnel
                        if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 2.5) {
                          if (dx > threshold) {
                            handleAnswer(3); // Bien
                            if (window.navigator?.vibrate) window.navigator.vibrate(10);
                          } else if (dx < -threshold) {
                            handleAnswer(0); // Oublié
                            if (window.navigator?.vibrate) window.navigator.vibrate([30, 30, 30]);
                          }
                        }
                      }}
                    >
                      {/* Contenu de la carte (inchangé) */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <span style={{ background: theme.inputBg, color: theme.highlight, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{currentCard.category}</span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ background: "#FFFFFF", color: "#3451D1", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>{currentCard.difficulty !== undefined ? `Diff: ${currentCard.difficulty.toFixed(1)}/10` : `EF: ${(currentCard.easeFactor || 2.5).toFixed(1)}`}</span>
                          <span style={{ background: "#4D6BFE22", color: "#4D6BFE", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>N{currentCard.level}</span>
                        </div>
                      </div>

                      <div style={{ background: isDarkMode ? "#0F1A3A" : "#F8FAFF", borderRadius: 20, padding: "28px", marginBottom: 20, border: `1px solid ${theme.border}` }}>
                        <div style={{ fontSize: 11, color: "#60A5FA", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>{activeFacet ? `QUESTION (${activeFacet.type.toUpperCase()})` : "QUESTION"}</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: theme.highlight, lineHeight: 1.35, marginBottom: currentCard.imageUrl ? 20 : 0 }}>{activeFacet ? activeFacet.front : currentCard.front}</div>
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
                              {socraticMode ? (
                                <SocraticChat
                                  card={currentCard}
                                  initialUserError={userAnswer}
                                  callClaude={callClaude}
                                  theme={theme}
                                  onResolve={() => {
                                    setRevealed(true);
                                    handleAnswerWithFeedback(5, currentCard);
                                    showToast("🎓 Félicitations ! Tu as trouvé la réponse par toi-même.", "success");
                                  }}
                                />
                              ) : (
                                <>
                                  <textarea style={{ width: "100%", padding: "16px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text, minHeight: 80, marginBottom: 12 }} placeholder="Tape ta réponse..." value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} />
                                  {socraticHint && <div style={{ background: "#EFF3FF", borderLeft: "4px solid #6B82F5", padding: 12, borderRadius: 4, marginBottom: 16, color: "#1E3A8A", fontSize: 14 }}><strong style={{ display: "block", marginBottom: 4 }}>🧙‍♂️ Tuteur IA :</strong> {socraticHint}</div>}
                                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    <button onClick={handleSemanticEval} disabled={evalLoading || !userAnswer.trim()} style={{ flex: 1, padding: "18px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>{evalLoading ? "🧠 Analyse..." : "🧠 IA Socratique"}</button>
                                    <button onClick={handleReveal} className="hov" style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", padding: "20px 24px", background: isMobile ? "linear-gradient(135deg, #3451D1, #4D6BFE)" : "transparent", color: isMobile ? "white" : theme.textMuted, border: isMobile ? "none" : `2px solid ${theme.border}`, borderRadius: 18, fontSize: isMobile ? 17 : 16, fontWeight: 800, cursor: "pointer", boxShadow: isMobile ? "0 8px 24px rgba(77,107,254,0.35)" : "none", WebkitTapHighlightColor: "transparent", touchAction: "manipulation", minHeight: 56 }}>{isMobile ? "Voir la réponse →" : "Passer / Voir"}</button>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <div style={{ animation: "slideIn 0.3s ease" }}>
                          <div style={{ background: isDarkMode ? "#2A1400" : "#FFFFFF", border: `2px solid ${isDarkMode ? "#3D2000" : "#EEF2FF"}`, borderRadius: 20, padding: "28px", marginBottom: 20 }}>
                            <div style={{ fontSize: 11, color: "#4D6BFE", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>RÉPONSE</div>
                            <div style={{ marginTop: 12 }}>
                              <GodTierContent text={activeFacet ? activeFacet.back : currentCard.back} theme={theme} isDarkMode={isDarkMode} />
                            </div>
                            {currentCard.example && (
                              <div style={{ background: theme.inputBg, padding: "16px 20px", borderRadius: 16, marginTop: 24, fontSize: 15, color: theme.textMuted, fontStyle: "italic", borderLeft: `4px solid ${theme.highlight}`, position: "relative" }}>
                                <div style={{ position: "absolute", top: -10, left: 16, background: theme.bg, padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme.highlight, letterSpacing: 1 }}>EXEMPLE</div>
                                <div style={{ marginTop: 8 }}>
                                  <GodTierContent text={currentCard.example} theme={theme} isDarkMode={isDarkMode} />
                                </div>
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                            <button className="hov" onClick={generateMnemonic} disabled={mnemonicLoading} style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg, #FFFFFF, #EEF2FF)", color: "#4D6BFE", border: "1px solid #C7D2FE", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
                              {mnemonicLoading ? "⏳ Création..." : "✨ Générer Mnémonique"}
                            </button>
                            <button className="hov" onClick={() => setRabbitHoleOpen(true)} style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg, #2A1400, #3D2000)", color: "#FFA114", border: "1px solid #5C3200", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
                              🕳️ Deep Dive
                            </button>
                          </div>

                          {rabbitHoleOpen && (
                            <RabbitHoleViewer
                              concept={currentCard.front}
                              callClaude={callClaude}
                              theme={theme}
                              onClose={() => setRabbitHoleOpen(false)}
                            />
                          )}
                          {mnemonicText && (
                            <div style={{ background: "#FFFFFF", borderLeft: "4px solid #4D6BFE", padding: "16px", borderRadius: 12, color: "#4C1D95", marginBottom: 20, fontSize: 14 }}>
                              <div style={{ fontStyle: "italic", marginBottom: 12 }}>{mnemonicText}</div>
                              <button
                                onClick={saveMnemonic}
                                disabled={mnemonicSaved}
                                className="hov"
                                style={{ padding: "8px 14px", background: mnemonicSaved ? "#ECFDF5" : "#EEF2FF", color: mnemonicSaved ? "#059669" : "#4D6BFE", border: `1px solid ${mnemonicSaved ? "#10B981" : "#C7D2FE"}`, borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: mnemonicSaved ? "default" : "pointer", transition: "all 0.2s" }}
                              >
                                {mnemonicSaved ? "✅ Ajouté à l'exemple" : "💾 Sauvegarder dans la fiche"}
                              </button>
                            </div>
                          )}
                          {/* Boutons classiques toujours présents en fallback, mais on ajoute une instruction de swipe */}
                          {isMobile && (
                            <div style={{ textAlign: "center", color: theme.textMuted, fontSize: 12, marginBottom: 10, opacity: 0.8 }}>
                              💡 Glisse la carte : ⬆️ Facile | ⬇️ Hésité | ➡️ Bien | ⬅️ Oublié
                            </div>
                          )}
                          <div className="review-btns-row">
                            {[
                              { q: 0, emoji: "💀", label: "Oublié", sub: getPreviewInterval(currentCard, 0), bg: isDarkMode ? "#2D0A0A" : "#FEE2E2", color: "#EF4444", border: "#EF4444", key: "1" },
                              { q: 1, emoji: "😅", label: "Hésité", sub: getPreviewInterval(currentCard, 1), bg: isDarkMode ? "#2D1A00" : "#FFFBEB", color: "#F59E0B", border: "#F59E0B", key: "2" },
                              { q: 3, emoji: "👍", label: "Bien", sub: getPreviewInterval(currentCard, 3), bg: isDarkMode ? "#0A1628" : "#EFF6FF", color: "#3B82F6", border: "#3B82F6", key: "3" },
                              { q: 5, emoji: "⚡", label: "Facile", sub: getPreviewInterval(currentCard, 5), bg: isDarkMode ? "#0A2010" : "#ECFDF5", color: "#10B981", border: "#10B981", key: "4" },
                            ].map(({ q, emoji, label, sub, bg, color, border, key }) => (
                              <button
                                key={q}
                                className="hov review-btn"
                                onClick={() => {
                                  handleAnswer(q);
                                  if (window.navigator?.vibrate) window.navigator.vibrate(q === 0 ? [40, 20, 40] : 8);
                                }}
                                style={{
                                  padding: "16px 10px",
                                  background: bg,
                                  color,
                                  border: `1.5px solid ${border}40`,
                                  borderRadius: 18,
                                  fontWeight: 800,
                                  fontSize: 14,
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 4,
                                  minHeight: 76,
                                  lineHeight: 1.2,
                                  WebkitTapHighlightColor: "transparent",
                                  touchAction: "manipulation",
                                  userSelect: "none",
                                  transition: "transform 0.1s ease, opacity 0.1s ease",
                                }}
                              >
                                <span style={{ fontSize: 22 }}>{emoji}</span>
                                <span>{label}</span>
                                <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 600 }}>{sub}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {(currentCard.reviewHistory?.length || 0) > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20, justifyContent: "center" }}>
                        <span style={{ color: theme.textMuted, fontSize: 12, fontFamily: "JetBrains Mono" }}>Historique: </span>
                        {currentCard.reviewHistory.slice(-7).map((h, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: h.q === 0 ? "#F04040" : h.q === 1 ? "#F59E0B" : h.q === 3 || h.q === 5 ? "#4D6BFE" : "#4D6BFE" }} title={`${h.date} — ${h.q === 0 ? "Oublié" : h.q === 1 ? "Hésité" : "Facile"}`} />)}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ))}

          {view === "add" && (addZenMode ? (
            /* ── MODE ZEN ── */
            <div style={{ animation: "zenFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1)", position: "fixed", inset: 0, zIndex: 99999, background: isDarkMode ? "rgba(7, 13, 31, 0.95)" : "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", padding: "40px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ maxWidth: 700, width: "100%", background: "transparent", display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h1 style={{ fontWeight: 900, color: theme.text, margin: 0, fontSize: 40, fontFamily: "'Instrument Serif', Georgia, serif" }}>Deep Focus.</h1>
                  <button onClick={() => setAddZenMode(false)} className="hov" style={{ background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.05)", border: "none", borderRadius: 999, padding: "10px 20px", color: theme.text, cursor: "pointer", fontWeight: 700 }}>✕ Quitter</button>
                </div>
                <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ width: "100%", padding: "16px 20px", background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 16, color: theme.textMuted, fontWeight: 700, fontSize: 16 }}>
                  {catNames.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input autoFocus value={addForm.front} onChange={e => { setAddForm(f => ({ ...f, front: e.target.value })); if (e.target.value.length > 3) checkDoublon(e.target.value); }} style={{ width: "100%", padding: "24px", background: isDarkMode ? "#0A0F24" : "#FFFFFF", border: `2px solid ${theme.highlight}40`, borderRadius: 20, color: theme.highlight, fontSize: 28, fontWeight: 900, boxShadow: `0 10px 40px ${theme.highlight}15`, outline: "none" }} placeholder="Concept à maîtriser..." />
                {addDoublonCheck?.duplicate && <div style={{ background: "#E8EEFF", padding: 8, borderRadius: 8, marginBottom: 12, color: "#1E3A8A" }}>⚠️ Semble être un doublon de : <strong>{addDoublonCheck.existingConcept}</strong>. {addDoublonCheck.conseil}</div>}
                <textarea value={addForm.back} onChange={e => setAddForm(f => ({ ...f, back: e.target.value }))} style={{ width: "100%", padding: "24px", background: isDarkMode ? "#0A0F24" : "#FFFFFF", border: `1px solid ${theme.border}`, borderRadius: 20, color: theme.text, minHeight: 160, fontSize: 18, lineHeight: 1.6, resize: "vertical", outline: "none" }} placeholder="L'explication claire et détaillée..." />
                <input value={addForm.example} onChange={e => setAddForm(f => ({ ...f, example: e.target.value }))} style={{ width: "100%", padding: "20px 24px", background: isDarkMode ? "#0A0F24" : "#FFFFFF", border: `1px solid ${theme.border}`, borderRadius: 20, color: theme.textMuted, fontSize: 16, fontStyle: "italic", outline: "none" }} placeholder="Mise en contexte ou exemple de code..." />
                <button onClick={() => { handleAddWithInverted(); setAddZenMode(false); }} className="btn-glow hov" disabled={!addForm.front || !addForm.back} style={{ width: "100%", padding: "20px", background: "linear-gradient(135deg,#3451D1,#4D6BFE)", color: "white", border: "none", borderRadius: 20, fontWeight: 900, fontSize: 18, cursor: "pointer", opacity: addForm.front && addForm.back ? 1 : 0.5, marginTop: 10, boxShadow: "0 10px 30px rgba(77,107,254,0.4)" }}>⚡ Forger la fiche</button>
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setAddZenMode(true)} className="hov" style={{ padding: "10px 20px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.text, fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><span>🧘</span> Mode Zen</button>
                  {editingId && <button onClick={cancelEdit} className="hov" style={{ background: "#FEF2F2", color: "#EF4444", border: "1px solid #FECACA", borderRadius: 12, padding: "10px 20px", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>✕ Annuler</button>}
                </div>
              </div>
              {/* Tabs de sous-vue */}
              {!editingId && (
                <>
                  <button
                    type="button"
                    className="add-tabs-toggle"
                    onClick={() => setMobileAddSheetOpen(true)}
                    aria-label="Ouvrir le sélecteur de mode d'ajout"
                    style={{
                      display: "none",
                      padding: "12px 16px",
                      borderRadius: 14,
                      border: `1px solid ${theme.highlight}`,
                      background: `linear-gradient(135deg, ${theme.highlight}, #3451D1)`,
                      color: "white",
                      fontWeight: 800, fontSize: 14, cursor: "pointer",
                      marginBottom: 12, width: "100%",
                      boxShadow: "0 4px 15px rgba(77,107,254,0.3)",
                    }}
                  >
                    ＋ Choisir un mode ({[
                      { id: "single", label: "Fiche unique" },
                      { id: "chat", label: "Copilot IA" },
                      { id: "batch", label: "Batch IA" },
                      { id: "text", label: "Depuis un texte" },
                      { id: "file", label: "Image & Vision IA" },
                      { id: "multimedia", label: "Multimédia" },
                      { id: "templates", label: "Templates" },
                      { id: "quickadd", label: "Quick Add" },
                    ].find(t => t.id === addSubView)?.label || "Choisir"})
                  </button>
                  <div className="add-tabs-cluster" style={{ display: "flex", gap: 8, marginBottom: 32, background: isDarkMode ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", padding: 8, borderRadius: 24, border: `1px solid ${theme.border}`, boxShadow: "0 10px 30px rgba(77,107,254,0.05)", overflowX: "auto", scrollbarWidth: "none" }}>
                    {[
                      { id: "single", icon: "✦", label: "Fiche unique" },
                      { id: "chat", icon: "💬", label: "Copilot IA" },
                      { id: "batch", icon: "🚀", label: "Batch IA" },
                      { id: "text", icon: "📄", label: "Depuis un texte" },
                      { id: "file", icon: "📎", label: "Image & Vision IA" },
                      { id: "multimedia", icon: "🎨", label: "Multimédia" },
                      { id: "templates", icon: "📋", label: "Templates" },
                      { id: "quickadd", icon: "⚡", label: "Quick Add" },
                    ].map(t => (
                      <button key={t.id} onClick={() => { setAddSubView(t.id); setShowBatchPreview(false); document.body.classList.remove("add-tabs-expanded"); }} className="hov" style={{ flex: 1, minWidth: 140, padding: "12px 16px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800, transition: "all 0.2s", background: addSubView === t.id ? "white" : "transparent", color: addSubView === t.id ? "#3451D1" : theme.textMuted, boxShadow: addSubView === t.id ? "0 4px 15px rgba(77,107,254,0.05)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ========= BATCH QUEUE (visible dans toute la vue) ========= */}
              {addBatchQueue.length > 0 && (
                <div style={{ background: theme.cardBg, borderRadius: 16, padding: "14px 20px", marginBottom: 20, border: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><span style={{ fontWeight: 800, color: theme.text }}>{addBatchQueue.length} concepts en file</span> <span style={{ color: theme.textMuted }}>{addBatchQueue.slice(0, 3).join(', ')}{addBatchQueue.length > 3 ? '...' : ''}</span></div>
                  <button onClick={processBatchQueue} disabled={addBatchRunning} className="hov btn-glow" style={{ background: "linear-gradient(135deg,#4D6BFE,#3451D1)", color: "white", border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 800, cursor: "pointer" }}>{addBatchRunning ? "⏳" : "▶️ Traiter"}</button>
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

              {/* ========= CHAT COPILOT ========= */}
              {addSubView === "chat" && !editingId && (
                <div style={{ display: "flex", flexDirection: "column", height: "65vh", minHeight: 500, background: theme.cardBg, borderRadius: 24, border: `1px solid ${theme.border}`, overflow: "hidden", marginBottom: 32, boxShadow: "0 10px 40px rgba(77,107,254,0.05)" }}>
                  <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, #1E3A8A 0%, #4D6BFE 100%)", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>💬 Copilot de Fiches</div>
                      <div style={{ fontSize: 13, color: "#EEF2FF" }}>Discute pour forger ou ajuster tes fiches</div>
                    </div>
                    <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, outline: "none" }}>
                      {catNames.map(c => <option key={c} value={c} style={{ color: "#000" }}>{c}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
                    {chatToCardMessages.map((msg, idx) => (
                      <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 8 }}>
                        <div style={{ maxWidth: "80%", padding: "14px 18px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? "linear-gradient(135deg, #3451D1, #4D6BFE)" : theme.inputBg, color: msg.role === "user" ? "white" : theme.text, fontSize: 14, lineHeight: 1.5, border: msg.role === "user" ? "none" : `1px solid ${theme.border}` }}>
                          {msg.text}
                        </div>

                        {msg.cards && msg.cards.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: "90%", marginTop: 4 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                              {msg.cards.map((card, cidx) => (
                                <div key={cidx} style={{ background: theme.cardBg, borderRadius: 16, padding: "16px", border: `1px solid ${theme.border}`, position: "relative", boxShadow: "0 4px 15px rgba(77,107,254,0.05)" }}>
                                  <div style={{ fontSize: 10, color: theme.highlight, fontWeight: 900, marginBottom: 4, letterSpacing: 1 }}>RECTO</div>
                                  <div style={{ fontWeight: 800, color: theme.text, marginBottom: 12 }}>{card.front}</div>
                                  <div style={{ fontSize: 10, color: theme.highlight, fontWeight: 900, marginBottom: 4, letterSpacing: 1 }}>VERSO</div>
                                  <div style={{ marginTop: 8, marginBottom: card.example ? 12 : 0 }}>
                                    <GodTierContent text={card.back} theme={theme} isDarkMode={isDarkMode} />
                                  </div>
                                  {card.example && <div style={{ padding: "8px 12px", background: theme.inputBg, borderRadius: 8, fontSize: 12, color: theme.text, fontStyle: "italic", borderLeft: `3px solid ${theme.highlight}`, marginTop: 12 }}>{card.example}</div>}
                                  <button onClick={() => saveChatCard(card)} className="hov" style={{ marginTop: 12, width: "100%", padding: "8px", background: theme.inputBg, color: theme.highlight, border: `1px solid ${theme.highlight}40`, borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>💾 Sauver</button>
                                </div>
                              ))}
                            </div>
                            <button onClick={() => saveAllChatCards(msg.cards)} className="hov btn-glow" style={{ alignSelf: "flex-start", padding: "10px 20px", background: "linear-gradient(135deg, #22C55E, #16A34A)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>💾 Sauver cette génération ({msg.cards.length})</button>
                          </div>
                        )}
                      </div>
                    ))}
                    {chatToCardLoading && <div style={{ alignSelf: "flex-start", display: "flex", gap: 6, padding: "14px 18px", background: theme.inputBg, borderRadius: "18px 18px 18px 4px", border: `1px solid ${theme.border}` }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: theme.highlight, animation: `pulse 1.2s ${i * 0.2}s infinite` }} />)}</div>}
                    <div ref={chatToCardEndRef} />
                  </div>

                  <div style={{ padding: "16px 24px", background: theme.cardBg, borderTop: `1px solid ${theme.border}`, display: "flex", gap: 12 }}>
                    <input value={chatToCardInput} onChange={e => setChatToCardInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendChatToCard()} placeholder="Demande tes fiches à l'IA..." style={{ flex: 1, padding: "14px 20px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 16, color: theme.text, fontSize: 15, outline: "none" }} />
                    <button onClick={handleSendChatToCard} disabled={chatToCardLoading || !chatToCardInput.trim()} className="btn-glow hov" style={{ padding: "14px 24px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer", opacity: chatToCardLoading || !chatToCardInput.trim() ? 0.5 : 1 }}>{chatToCardLoading ? "⏳" : "Envoyer"}</button>
                  </div>
                </div>
              )}

              {addSubView === "batch" && !editingId && (
                <div style={{ background: "linear-gradient(135deg, #1A0800 0%, #3451D1 50%, #3451D1 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>🚀</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Génération en Rafale</div><div style={{ color: "#EEF2FF", fontSize: 13 }}>L'IA génère plusieurs fiches d'un coup.</div></div></div>
                  <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                    <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "14px 16px", background: "#1e3a8a", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, color: "white", fontWeight: 700 }}>
                      {catNames.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} style={{ flex: 1, minWidth: 200, padding: "16px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white" }} placeholder='Ex: "Annotations Spring Boot"...' />
                    <select value={aiBatchCount} onChange={e => setAiBatchCount(+e.target.value)} style={{ padding: "14px 16px", background: "#1e3a8a", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, color: "white", fontWeight: 700 }}>{[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} fiches</option>)}</select>
                    <button className="hov btn-glow" onClick={handleAIBatchGenerate} disabled={aiBatchLoading || !aiPrompt.trim()} style={{ padding: "16px 28px", background: "white", color: "#3451D1", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer" }}>{aiBatchLoading ? "⏳" : `🚀 ×${aiBatchCount}`}</button>
                  </div>
                  {showBatchPreview && batchPreview.length > 0 && (
                    <div
                      style={{ marginTop: 24, position: "relative", height: "65vh", minHeight: 500, background: isDarkMode ? "#0A0F24" : "var(--mm-bg-elev)", borderRadius: 24, overflow: "hidden", border: `2px solid ${theme.border}`, cursor: batchDragRef.current.isPanning ? "grabbing" : "grab", touchAction: "none", boxShadow: "inset 0 0 40px rgba(77,107,254,0.2)" }}
                      onPointerDown={(e) => {
                        if (e.target.closest('.batch-node')) return; // handled by node
                        batchDragRef.current = { ...batchDragRef.current, isPanning: true, startX: e.clientX - batchCanvasTransform.x, startY: e.clientY - batchCanvasTransform.y };
                      }}
                      onPointerMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const mouseX = (e.clientX - rect.left - batchCanvasTransform.x) / batchCanvasTransform.scale;
                        const mouseY = (e.clientY - rect.top - batchCanvasTransform.y) / batchCanvasTransform.scale;
                        setBatchMousePos({ x: mouseX, y: mouseY });

                        if (batchDragRef.current.isPanning) {
                          setBatchCanvasTransform(p => ({ ...p, x: e.clientX - batchDragRef.current.startX, y: e.clientY - batchDragRef.current.startY }));
                        } else if (batchDragRef.current.draggingIdx !== null) {
                          const idx = batchDragRef.current.draggingIdx;
                          setBatchPreview(prev => prev.map((c, i) => i === idx ? { ...c, x: mouseX - batchDragRef.current.offsetX, y: mouseY - batchDragRef.current.offsetY } : c));
                        }
                      }}
                      onPointerUp={(e) => {
                        if (batchDragRef.current.linkFrom !== null) {
                          const targetNode = e.target.closest('.batch-node');
                          if (targetNode) {
                            const targetId = targetNode.dataset.id;
                            if (targetId && targetId !== batchDragRef.current.linkFrom) {
                              setBatchLinks(p => {
                                if (p.some(l => l.source === batchDragRef.current.linkFrom && l.target === targetId)) return p;
                                return [...p, { source: batchDragRef.current.linkFrom, target: targetId }];
                              });
                            }
                          }
                        }
                        batchDragRef.current.isPanning = false;
                        batchDragRef.current.draggingIdx = null;
                        batchDragRef.current.linkFrom = null;
                      }}
                      onPointerLeave={() => {
                        batchDragRef.current.isPanning = false;
                        batchDragRef.current.draggingIdx = null;
                        batchDragRef.current.linkFrom = null;
                      }}
                      onWheel={(e) => {
                        const zoomSensitivity = 0.002;
                        setBatchCanvasTransform(p => ({ ...p, scale: Math.max(0.2, Math.min(3, p.scale - e.deltaY * zoomSensitivity)) }));
                      }}
                      onDoubleClick={(e) => {
                        if (e.target.closest('.batch-node')) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = (e.clientX - rect.left - batchCanvasTransform.x) / batchCanvasTransform.scale;
                        const y = (e.clientY - rect.top - batchCanvasTransform.y) / batchCanvasTransform.scale;
                        setBatchPreview(p => [...p, { id: `batch_node_${Date.now()}`, front: "", back: "", example: "", x, y }]);
                      }}
                    >
                      {/* Background Grid Pattern */}
                      <div style={{ position: "absolute", inset: 0, backgroundSize: `${40 * batchCanvasTransform.scale}px ${40 * batchCanvasTransform.scale}px`, backgroundImage: `radial-gradient(circle at 1px 1px, ${theme.border} 2px, transparent 0)`, backgroundPosition: `${batchCanvasTransform.x}px ${batchCanvasTransform.y}px`, opacity: 0.5 }} />

                      {/* Toolbar */}
                      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, display: "flex", gap: 12, background: isDarkMode ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.85)", padding: 12, borderRadius: 16, backdropFilter: "blur(12px)", border: `1px solid ${theme.border}`, boxShadow: "0 10px 30px rgba(77,107,254,0.1)" }}>
                        <div style={{ color: theme.text, fontWeight: 900, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                          <span>✨</span> Table de Craft ({batchPreview.length})
                        </div>
                        <div style={{ width: 1, background: theme.border }} />
                        <button onClick={() => { setBatchPreview([]); setShowBatchPreview(false); setBatchLinks([]); }} className="hov" style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.textMuted, borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Annuler</button>
                        <button className="hov btn-glow" onClick={confirmBatch} style={{ background: "linear-gradient(135deg, #22C55E, #16A34A)", border: "none", color: "white", borderRadius: 10, padding: "8px 18px", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>💾 Forger cette Constellation</button>
                      </div>

                      {/* Instructions */}
                      <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10, color: theme.textMuted, fontSize: 12, pointerEvents: "none", background: theme.cardBg, padding: "8px 20px", borderRadius: 20, border: `1px solid ${theme.border}`, fontWeight: 600, boxShadow: "0 4px 12px rgba(77,107,254,0.05)" }}>
                        🖱️ Double-clic pour ajouter • Glisser pour déplacer • Molette pour zoomer • Tirer le point rouge pour lier
                      </div>

                      {/* Transform Container */}
                      <div style={{ position: "absolute", inset: 0, transform: `translate(${batchCanvasTransform.x}px, ${batchCanvasTransform.y}px) scale(${batchCanvasTransform.scale})`, transformOrigin: "0 0" }}>

                        {/* SVG Links */}
                        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
                          {batchLinks.map((link, i) => {
                            const src = batchPreview.find(c => c.id === link.source);
                            const tgt = batchPreview.find(c => c.id === link.target);
                            if (!src || !tgt) return null;
                            return <path key={i} d={`M ${src.x + 288} ${src.y + 42} C ${src.x + 350} ${src.y + 42}, ${tgt.x - 50} ${tgt.y + 42}, ${tgt.x} ${tgt.y + 42}`} fill="none" stroke={theme.highlight} strokeWidth="3" opacity="0.4" />;
                          })}
                          {/* Active link line */}
                          {batchDragRef.current.linkFrom !== null && (() => {
                            const src = batchPreview.find(c => c.id === batchDragRef.current.linkFrom);
                            if (!src) return null;
                            return <path d={`M ${src.x + 288} ${src.y + 42} C ${src.x + 350} ${src.y + 42}, ${batchMousePos.x - 50} ${batchMousePos.y}, ${batchMousePos.x} ${batchMousePos.y}`} fill="none" stroke={theme.highlight} strokeWidth="3" opacity="0.8" strokeDasharray="6 6" />;
                          })()}
                        </svg>

                        {/* Nodes */}
                        {batchPreview.map((card, idx) => (
                          <div key={card.id} className="batch-node" data-id={card.id} style={{
                            position: "absolute", left: card.x, top: card.y, width: 280,
                            background: theme.cardBg,
                            borderRadius: 16, border: `2px solid ${theme.border}`,
                            boxShadow: batchDragRef.current.draggingIdx === idx ? `0 20px 40px ${theme.highlight}40` : "0 10px 30px rgba(77,107,254,0.05)",
                            padding: 16, cursor: "grab", transition: batchDragRef.current.draggingIdx === idx ? "none" : "box-shadow 0.2s"
                          }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              batchDragRef.current = { ...batchDragRef.current, draggingIdx: idx, offsetX: (e.clientX - rect.left) / batchCanvasTransform.scale, offsetY: (e.clientY - rect.top) / batchCanvasTransform.scale };
                            }}>

                            {/* Delete Button */}
                            <button onClick={(e) => { e.stopPropagation(); removeBatchCard(idx); }} style={{ position: "absolute", top: -10, right: -10, background: "#EF4444", color: "white", border: "2px solid white", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontWeight: 900, boxShadow: "0 4px 10px rgba(239,68,68,0.4)", zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>

                            {/* Link Anchor */}
                            <div onPointerDown={(e) => { e.stopPropagation(); batchDragRef.current.linkFrom = card.id; }} style={{ position: "absolute", top: 34, right: -8, width: 16, height: 16, background: theme.highlight, border: `2px solid ${theme.cardBg}`, borderRadius: "50%", cursor: "crosshair", boxShadow: `0 0 10px ${theme.highlight}`, zIndex: 5 }} title="Tirer pour lier" />

                            {/* Node Header */}
                            <div style={{ fontSize: 10, fontWeight: 800, color: theme.highlight, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Concept {idx + 1}</div>

                            {/* Inputs */}
                            <input value={card.front} onChange={e => setBatchPreview(p => p.map((c, i) => i === idx ? { ...c, front: e.target.value } : c))} style={{ width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${theme.border}`, fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 12, paddingBottom: 6, outline: "none" }} placeholder="Nom du concept" onPointerDown={e => e.stopPropagation()} />
                            <textarea value={card.back} onChange={e => setBatchPreview(p => p.map((c, i) => i === idx ? { ...c, back: e.target.value } : c))} style={{ width: "100%", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 10, fontSize: 13, color: theme.text, minHeight: 80, resize: "vertical", outline: "none", lineHeight: 1.5 }} placeholder="Explication détaillée" onPointerDown={e => e.stopPropagation()} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* File d'attente batch */}
                  <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                    <input placeholder="Ajouter un concept à la file..." style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.1)", color: "white" }} onKeyDown={e => { if (e.key === 'Enter') { addToBatchQueue(e.target.value); e.target.value = ''; } }} />
                    <button onClick={() => showToast("Tape un concept et appuie sur Entrée pour l'ajouter à la file.")} style={{ background: "white", color: "#3451D1", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 800 }}>+</button>
                  </div>
                </div>
              )}

              {addSubView === "text" && !editingId && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 20, marginBottom: 32 }}>
                  {/* SOURCE (Gauche) */}
                  <div style={{ background: "linear-gradient(135deg, #1E3A8A 0%, #4338CA 50%, #4D6BFE 100%)", borderRadius: 24, padding: "28px 32px", display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                      <span style={{ fontSize: 32 }}>📄</span>
                      <div>
                        <div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Source & Forge</div>
                        <div style={{ color: "#EEF2FF", fontSize: 13 }}>Surligne un passage et glisse-le vers la droite 👉</div>
                      </div>
                    </div>
                    <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "12px 16px", background: "#1E3A8A", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "white", fontWeight: 700, width: "100%", marginBottom: 12 }}>{catNames.map(c => <option key={c} value={c}>{c}</option>)}</select>
                    <textarea value={aiFromText} onChange={e => setAiFromText(e.target.value)} style={{ width: "100%", padding: "16px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white", minHeight: 240, flex: 1, resize: "vertical" }} placeholder="Colle ton cours complet ici..." />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{aiFromText.length}/10000</span>
                      <button className="hov btn-glow" onClick={handleAIFromText} disabled={aiFromTextLoading || !aiFromText.trim()} style={{ padding: "12px 20px", background: "white", color: "#1E3A8A", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>{aiFromTextLoading ? "⏳" : "Tout analyser"}</button>
                    </div>
                  </div>

                  {/* FORGE (Droite) - Drop Zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOverForge(true); }}
                    onDragLeave={() => setDragOverForge(false)}
                    onDrop={handleDropToForge}
                    style={{
                      background: dragOverForge ? theme.highlight + "20" : theme.cardBg,
                      border: dragOverForge ? `3px dashed ${theme.highlight}` : `1px solid ${theme.border}`,
                      borderRadius: 24, padding: "28px 32px", display: "flex", flexDirection: "column",
                      transition: "all 0.3s ease", position: "relative", minHeight: 380
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontWeight: 900, color: theme.text, fontSize: 18 }}>⚒️ La Forge</div>
                        <div style={{ color: theme.textMuted, fontSize: 13 }}>Dépose du texte ici pour extraire</div>
                      </div>
                      {batchPreview.length > 0 && (
                        <button className="hov btn-glow" onClick={confirmBatch} style={{ padding: "8px 16px", background: "linear-gradient(135deg, #22C55E, #16A34A)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>💾 Sauver ({batchPreview.length})</button>
                      )}
                    </div>

                    {dropForgeLoading ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: theme.highlight }}>
                        <div style={{ fontSize: 40, animation: "pulse 1s infinite" }}>⚒️</div>
                        <div style={{ fontWeight: 800, marginTop: 16 }}>Forgeage de la pépite...</div>
                      </div>
                    ) : batchPreview.length === 0 ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: theme.textMuted, opacity: 0.6, border: `2px dashed ${theme.border}`, borderRadius: 16, pointerEvents: "none" }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>📥</div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>Glisse du texte surligné ici</div>
                        <div style={{ fontSize: 12, marginTop: 8, maxWidth: 200, textAlign: "center" }}>L'IA le transformera instantanément en fiche.</div>
                      </div>
                    ) : (
                      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
                        {batchPreview.map((card, idx) => (
                          <div key={idx} style={{ background: theme.inputBg, borderRadius: 16, padding: "16px", border: `1px solid ${theme.border}`, position: "relative" }}>
                            <button onClick={() => removeBatchCard(idx)} style={{ position: "absolute", top: 12, right: 12, background: "#FEF2F2", color: "#EF4444", border: "1px solid #FECACA", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontWeight: 800, fontSize: 11 }}>✕</button>
                            <div style={{ fontSize: 10, color: theme.highlight, fontWeight: 900, marginBottom: 4, letterSpacing: 1 }}>RECTO</div>
                            <div style={{ fontWeight: 800, color: theme.text, marginBottom: 12, paddingRight: 24 }}>{card.front}</div>
                            <div style={{ fontSize: 10, color: theme.highlight, fontWeight: 900, marginBottom: 4, letterSpacing: 1 }}>VERSO</div>
                            <div style={{ color: theme.textMuted, fontSize: 13, lineHeight: 1.5 }}>{card.back}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {addSubView === "file" && !editingId && (
                <div style={{ background: "linear-gradient(135deg, #1E3A8A 0%, #3451D1 50%, #4D6BFE 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                    <span style={{ fontSize: 32 }}>📸</span>
                    <div>
                      <div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Scan → Fiches</div>
                      <div style={{ color: "#EEF2FF", fontSize: 13 }}>Prends en photo tes notes : l'IA extrait le texte tel quel et crée les flashcards.</div>
                    </div>
                  </div>
                  <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "12px 16px", background: "#1E3A8A", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "white", fontWeight: 700, width: "100%", marginBottom: 16 }}>{catNames.map(c => <option key={c} value={c}>{c}</option>)}</select>

                  {/* Zone upload */}
                  {!addForm.imageUrl && (
                    <div style={{ border: "2px dashed rgba(255,255,255,0.4)", borderRadius: 16, padding: "40px 20px", textAlign: "center", background: "rgba(77,107,254,0.1)" }}>
                      {uploadLoading ? <div style={{ color: "white", fontWeight: 700 }}>⏳ Upload en cours...</div> : (
                        <>
                          <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} id="file-upload-vision" />
                          <label htmlFor="file-upload-vision" className="hov" style={{ cursor: "pointer", color: "white", fontWeight: 800, fontSize: 16 }}>
                            <div style={{ fontSize: 40, marginBottom: 8 }}>📤</div>
                            Clique pour prendre une photo ou choisir une image
                          </label>
                          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 10 }}>Le texte sera extrait exactement tel qu'il est écrit — rien ne sera modifié.</div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Aperçu image + bouton extraction */}
                  {addForm.imageUrl && visionScanCards.length === 0 && (
                    <div style={{ textAlign: "center" }}>
                      <img src={addForm.imageUrl} alt="aperçu" style={{ maxHeight: 220, borderRadius: 12, marginBottom: 16, border: "2px solid rgba(255,255,255,0.4)", maxWidth: "100%" }} />
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={() => setAddForm(f => ({ ...f, imageUrl: null }))} className="hov" style={{ flex: 1, padding: "12px", background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>🔄 Changer</button>
                        <button onClick={handleVisionAI} disabled={visionScanLoading} className="btn-glow hov" style={{ flex: 2, padding: "14px", background: "white", color: "#1E3A8A", border: "none", borderRadius: 12, fontWeight: 900, cursor: "pointer", fontSize: 15 }}>
                          {visionScanLoading ? "🔍 Extraction en cours..." : "📸 Créer les fiches depuis cette image"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Prévisualisation des fiches extraites */}
                  {visionScanCards.length > 0 && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div style={{ color: "white", fontWeight: 800, fontSize: 15 }}>✅ {visionScanCards.length} fiche(s) extraite(s)</div>
                        <button onClick={() => { setVisionScanCards([]); setAddForm(f => ({ ...f, imageUrl: null })); }} className="hov" style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>↩ Recommencer</button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
                        {visionScanCards.map((card, idx) => (
                          <div key={card.id} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.2)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 900, letterSpacing: 1, marginBottom: 4 }}>RECTO</div>
                                <input
                                  value={card.front}
                                  onChange={e => setVisionScanCards(prev => prev.map((c, i) => i === idx ? { ...c, front: e.target.value } : c))}
                                  style={{ width: "100%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 10px", color: "white", fontWeight: 700, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                                />
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 900, letterSpacing: 1, marginTop: 10, marginBottom: 4 }}>VERSO</div>
                                <textarea
                                  value={card.back}
                                  onChange={e => setVisionScanCards(prev => prev.map((c, i) => i === idx ? { ...c, back: e.target.value } : c))}
                                  style={{ width: "100%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 10px", color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 1.5, outline: "none", resize: "vertical", minHeight: 60, boxSizing: "border-box" }}
                                />
                              </div>
                              <button onClick={() => setVisionScanCards(prev => prev.filter((_, i) => i !== idx))} style={{ background: "rgba(239,68,68,0.3)", color: "white", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button onClick={confirmVisionScanCards} className="btn-glow hov" style={{ marginTop: 16, width: "100%", padding: "16px", background: "white", color: "#1E3A8A", border: "none", borderRadius: 14, fontWeight: 900, cursor: "pointer", fontSize: 16 }}>
                        💾 Sauvegarder {visionScanCards.length} fiche(s)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {addSubView === "multimedia" && !editingId && (
                <div style={{ background: theme.cardBg, borderRadius: 24, padding: "28px", marginBottom: 32, border: `1px solid ${theme.border}` }}>
                  <h2 style={{ fontWeight: 800, marginBottom: 16 }}>🎨 Multimédia</h2>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8, display: "block" }}>Module de destination</label>
                    <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ width: "100%", padding: "12px 16px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.text, fontWeight: 700 }}>
                      {catNames.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {/* Galerie d'images */}
                  <div style={{ marginBottom: 20 }}>
                    <button onClick={() => setAddImageGallery(!addImageGallery)} className="hov" style={{ padding: "10px 20px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, fontWeight: 700, cursor: "pointer" }}>🖼️ Galerie d'images</button>
                    {addImageGallery && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                          <input value={addImageSearch} onChange={e => setAddImageSearch(e.target.value)} placeholder="Rechercher..." style={{ flex: 1, padding: "8px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text }} />
                          <button onClick={searchImages} disabled={addImageSearchLoading} className="hov" style={{ background: "#4D6BFE", color: "white", border: "none", borderRadius: 8, padding: "8px 16px" }}>🔍</button>
                        </div>
                        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                          {addImageResults.map((img, i) => (
                            <img key={i} src={img.url} alt={img.alt} onClick={() => selectImage(img.url)} style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, cursor: "pointer", border: `2px solid ${theme.border}` }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Diagramme */}
                  <div style={{ marginBottom: 20 }}>
                    <button onClick={() => setAddDiagramMode(!addDiagramMode)} className="hov" style={{ padding: "10px 20px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, fontWeight: 700, cursor: "pointer" }}>📐 Diagramme (Mermaid)</button>
                    {addDiagramMode && (
                      <div style={{ marginTop: 12 }}>
                        <textarea rows={6} value={addDiagramCode} onChange={e => setAddDiagramCode(e.target.value)} style={{ width: "100%", padding: "10px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text }} placeholder="graph TD; A-->B;..." />
                        <button onClick={renderDiagram} className="hov" style={{ marginTop: 8, padding: "8px 16px", background: "#7B93FF", color: "white", border: "none", borderRadius: 8 }}>Générer</button>
                        {addDiagramSvg && <div style={{ marginTop: 12, background: "white", padding: 12, borderRadius: 8 }} dangerouslySetInnerHTML={safeHTML(addDiagramSvg)} />}
                        {addDiagramSvg && <button onClick={insertDiagram} className="hov" style={{ marginTop: 8, background: "#4D6BFE", color: "white", border: "none", borderRadius: 8, padding: "8px 16px" }}>Insérer dans la fiche</button>}
                      </div>
                    )}
                  </div>
                  {/* Audio */}
                  <div>
                    <button onClick={addAudioRecording ? stopAudioRecording : startAudioRecording} className="hov" style={{ padding: "10px 20px", background: addAudioRecording ? "#EF4444" : theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: addAudioRecording ? "white" : theme.text, fontWeight: 700, cursor: "pointer" }}>{addAudioRecording ? "⏹️ Stop" : "🎙️ Enregistrer audio"}</button>
                    {addAudioUrl && <audio controls src={addAudioUrl} style={{ marginTop: 8, width: "100%" }} />}
                  </div>
                </div>
              )}

              {addSubView === "quickadd" && !editingId && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ marginBottom: 16, background: theme.cardBg, padding: 20, borderRadius: 20, border: `1px solid ${theme.border}` }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 8, display: "block" }}>Module cible</label>
                    <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ width: "100%", padding: "12px 16px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.text, fontWeight: 700 }}>
                      {catNames.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <SmartPasteBox
                    theme={theme} isDarkMode={isDarkMode} callClaude={callClaude}
                    onGenerate={async ({ raw, kind, style }) => {
                      const cards = await generateCardsFromSmartPaste({
                        raw, kind, style, callClaude,
                        category: addForm.category || "Quick Add",
                      });
                      if (!cards.length) { showToast("L'IA n'a rien retourné.", "error"); return; }
                      const flagged = cards.map(c => ({
                        ...c,
                        similar: findSimilarCards(c.front, expressions, 0.78),
                      }));
                      setBatchPreview(flagged);
                      setShowBatchPreview(true);
                      showToast(`✨ ${cards.length} fiches générées (style: ${style})`, "success");
                    }}
                  />
                </div>
              )}

              {addSubView === "templates" && !editingId && (
                <div style={{ background: theme.cardBg, borderRadius: 24, padding: "28px", marginBottom: 32, border: `1px solid ${theme.border}` }}>
                  <h2 style={{ fontWeight: 800, marginBottom: 16 }}>📋 Templates de fiches</h2>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {addTemplatePresets.map(t => (
                      <button key={t.id} onClick={() => setAddTemplate(t.id)} className="hov" style={{ padding: "12px 20px", background: addTemplate === t.id ? theme.highlight : theme.inputBg, color: addTemplate === t.id ? "white" : theme.text, border: `1px solid ${theme.border}`, borderRadius: 12, fontWeight: 700, cursor: "pointer" }}>{t.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* FORMULAIRE PRINCIPAL */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 20, alignItems: "start" }} className="add-form-grid">

                {/* COLONNE GAUCHE : L'ÉDITEUR */}
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ position: "relative", zIndex: 2 }}>
                      <select value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} style={{ padding: "10px 16px", background: theme.highlight + "15", border: `1px solid ${theme.highlight}40`, borderRadius: 12, fontSize: 13, fontWeight: 800, color: theme.highlight, cursor: "pointer", outline: "none" }}>{catNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                    </div>
                  </div>

                  <div style={{ position: "relative" }}>
                    <label style={{ position: "absolute", top: -10, left: 16, background: theme.bg, padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme.highlight, letterSpacing: 1, zIndex: 2 }}>RECTO <span style={{ color: "#EF4444" }}>*</span></label>
                    <input autoFocus value={addForm.front} onChange={(e) => { setAddForm((f) => ({ ...f, front: e.target.value })); if (e.target.value.length > 3 && !editingId) checkDoublon(e.target.value); }} style={{ width: "100%", padding: "18px 54px 18px 20px", background: theme.cardBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 16, color: theme.text, fontWeight: 700, outline: "none", transition: "border-color 0.3s, box-shadow 0.3s", boxShadow: "0 8px 20px rgba(77,107,254,0.05)" }} placeholder="Le concept à mémoriser..." onFocus={e => { e.target.style.borderColor = theme.highlight; e.target.style.boxShadow = `0 0 0 3px ${theme.highlight}20` }} onBlur={e => { e.target.style.borderColor = theme.border; e.target.style.boxShadow = "0 8px 20px rgba(77,107,254,0.05)" }} />
                    <button onClick={() => listening === "front" ? stopVoice() : startVoice("front")} className={listening === "front" ? "mic-pulse" : "hov"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: theme.inputBg, border: `1px solid ${theme.border}`, cursor: "pointer", fontSize: 18, padding: 8, borderRadius: 10, color: listening === "front" ? "#EF4444" : theme.textMuted }}>🎙️</button>
                    {/* Doublon */}
                    {addDoublonCheck?.duplicate && <div style={{ marginTop: 8, background: "#E8EEFF", padding: 8, borderRadius: 8, color: "#1E3A8A", fontSize: 13 }}>⚠️ Doublon possible : <strong>{addDoublonCheck.existingConcept}</strong>. {addDoublonCheck.conseil}</div>}
                    {addReformulations['front'] && (
                      <div style={{ marginTop: 6 }}>
                        {addReformulations['front'].map((r, i) => <div key={i} onClick={() => setAddForm(f => ({ ...f, front: r }))} style={{ cursor: "pointer", padding: "4px 8px", background: theme.inputBg, borderRadius: 6, marginBottom: 4, fontSize: 12 }}>{r}</div>)}
                      </div>
                    )}
                  </div>

                  {/* ── TYPE DE FICHE (god-tier) ───────────────────────────── */}
                  <div style={{ background: theme.cardBg, padding: "10px 14px", borderRadius: 14, border: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: theme.textMuted, letterSpacing: 1.2, marginBottom: 8 }}>TYPE DE FICHE</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {CARD_TYPES.map(t => (
                        <button key={t.id} type="button" onClick={() => setAddForm(f => ({ ...f, type: t.id }))} title={t.desc} className="hov"
                          style={{
                            padding: "6px 12px", borderRadius: 999,
                            border: `1px solid ${addForm.type === t.id ? theme.highlight : theme.border}`,
                            background: addForm.type === t.id ? `${theme.highlight}18` : "transparent",
                            color: addForm.type === t.id ? theme.highlight : theme.textMuted,
                            fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                          }}>
                          <span style={{ fontSize: 13 }}>{t.icon}</span> {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ position: "relative" }}>
                    <label style={{ position: "absolute", top: -10, left: 16, background: theme.bg, padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme.highlight, letterSpacing: 1, zIndex: 2 }}>VERSO <span style={{ color: "#EF4444" }}>*</span></label>
                    {/* ── BARRE D'OUTILS MARKDOWN (insertion intelligente) ── */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8, padding: "6px 8px", background: theme.inputBg, borderRadius: 10, border: `1px solid ${theme.border}` }}>
                      {[
                        { label: "Titre", icon: "H", insert: () => insertMarkdown("back", "## ", "", "Titre") },
                        { label: "Gras", icon: <strong>B</strong>, insert: () => insertMarkdown("back", "**", "**", "gras") },
                        { label: "Italique", icon: <em>I</em>, insert: () => insertMarkdown("back", "*", "*", "italique") },
                        { label: "Liste", icon: "•", insert: () => insertMarkdown("back", "\n- ", "", "élément") },
                        { label: "Code inline", icon: "`", insert: () => insertMarkdown("back", "`", "`", "code") },
                        { label: "Bloc de code", icon: "</>", insert: () => insertMarkdown("back", "\n```js\n", "\n```\n", "// ton code ici") },
                        { label: "Tableau", icon: "▦", insert: () => insertMarkdown("back", "\n\n| Colonne A | Colonne B |\n|-----------|-----------|\n| ", " | valeur |\n", "valeur") },
                        { label: "Citation", icon: "❝", insert: () => insertMarkdown("back", "\n> ", "", "citation") },
                      ].map((b, i) => (
                        <button key={i} type="button" onClick={b.insert} title={b.label} className="hov"
                          style={{ minWidth: 32, height: 28, padding: "0 8px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.cardBg, color: theme.text, cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          {b.icon}
                        </button>
                      ))}
                      <button type="button" onClick={async () => {
                        try {
                          const t = await navigator.clipboard.readText();
                          if (!t) { showToast("Presse-papier vide.", "info"); return; }
                          insertMarkdown("back", "\n```\n", "\n```\n", t);
                        } catch { showToast("Accès au presse-papier refusé.", "error"); }
                      }} title="Coller comme bloc de code" className="hov"
                        style={{ marginLeft: "auto", height: 28, padding: "0 10px", borderRadius: 8, border: `1px solid ${theme.highlight}40`, background: `${theme.highlight}10`, color: theme.highlight, cursor: "pointer", fontSize: 11, fontWeight: 800 }}>
                        📋 Coller en code
                      </button>
                    </div>
                    <textarea ref={backTextareaRef} value={addForm.back} onChange={(e) => setAddForm((f) => ({ ...f, back: e.target.value }))} onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); handleAdd(); } }} style={{ width: "100%", padding: "20px 20px 54px 20px", background: theme.cardBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text, minHeight: 160, resize: "vertical", outline: "none", transition: "border-color 0.3s, box-shadow 0.3s", boxShadow: "0 8px 20px rgba(77,107,254,0.05)", lineHeight: 1.6, fontFamily: (addForm.type === 'code' || addForm.type === 'table' || addForm.type === 'mixed' || addForm.type === 'formula') ? "'JetBrains Mono', monospace" : "inherit" }} placeholder={(() => { const t = addForm.type || 'qa'; if (t === 'code') return "```js\nfunction hello() { return 'world'; }\n```"; if (t === 'table') return "| Colonne A | Colonne B |\n|-----------|-----------|\n| val 1     | val 2     |"; if (t === 'list') return "- Premier élément\n- Deuxième élément\n- Troisième élément"; if (t === 'formula') return "$$E = mc^2$$\n\nExplication :\n- E : énergie (J)\n- m : masse (kg)\n- c : célérité de la lumière (m/s)"; if (t === 'cloze') return "La capitale de la France est {{c1::Paris}}.\nElle est traversée par la {{c2::Seine}}."; if (t === 'image') return "Description de l'image, légendes, contexte… (l'URL de l'image va dans le champ imageUrl)"; if (t === 'definition') return "**Terme** : définition exacte, courte, mémorisable."; if (t === 'concept') return "Idée principale.\n\nPourquoi ça marche.\nExemple concret.\nLimite/contre-exemple."; if (t === 'mixed') return "Texte libre.\n\n```js\n// code\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |"; return "L'explication claire et pédagogique... (markdown supporté : **gras**, `code`, ```bloc```, tables, listes)"; })()} onFocus={e => { e.target.style.borderColor = theme.highlight; e.target.style.boxShadow = `0 0 0 3px ${theme.highlight}20` }} onBlur={e => { e.target.style.borderColor = theme.border; e.target.style.boxShadow = "0 8px 20px rgba(77,107,254,0.05)" }} />
                    <div style={{ position: "absolute", bottom: 12, right: 12, display: "flex", gap: 8 }}>
                      <button onClick={() => generateReformulations('back')} disabled={addReformLoading} className="hov" style={{ background: isDarkMode ? "rgba(77,107,254,0.15)" : "#EEF2FF", color: "#4D6BFE", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", backdropFilter: "blur(8px)" }}>✨ Reformuler</button>
                      <button onClick={() => handleMicroAI("back")} disabled={aiLoading} className="hov" style={{ background: isDarkMode ? "rgba(77,107,254,0.15)" : "#EEF2FF", color: "#4D6BFE", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", backdropFilter: "blur(8px)" }}>🤖 Expliquer</button>
                    </div>
                    {addReformulations['back'] && (
                      <div style={{ marginTop: 6, position: "absolute", bottom: -30, left: 0, right: 0, zIndex: 10 }}>
                        {addReformulations['back'].map((r, i) => <div key={i} onClick={() => setAddForm(f => ({ ...f, back: r }))} style={{ cursor: "pointer", padding: "4px 8px", background: theme.inputBg, borderRadius: 6, marginBottom: 4, fontSize: 12 }}>{r}</div>)}
                      </div>
                    )}
                    {addForm.back && (/```/.test(addForm.back) || /\n\s*\|.+\|\s*\n\s*\|[\s\-:|]+\|/.test(addForm.back)) && (
                      <div style={{ marginTop: 16, padding: 20, background: theme.cardBg, borderRadius: 16, border: `1px solid ${theme.highlight}50`, boxShadow: `0 10px 30px ${theme.highlight}20` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 900, color: theme.highlight, marginBottom: 12, letterSpacing: 1 }}>
                          <span>✨</span> PREVIEW ASTRALE
                        </div>
                        <div style={{ marginTop: 12, padding: "12px", background: theme.cardBg, borderRadius: 12, border: `1px solid ${theme.highlight}50` }}>
                          <RichText content={addForm.back} style={{ color: theme.text }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Couches */}
                  {addLayeredMode && (
                    <div style={{ marginTop: 0, background: theme.cardBg, padding: 16, borderRadius: 16, border: `1px solid ${theme.border}` }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Couches de complexité</div>
                      {addLayers.map((layer, idx) => (
                        <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          <input value={layer.back} onChange={e => updateLayer(idx, e.target.value)} style={{ flex: 1, padding: "8px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text }} placeholder={`Niveau ${idx + 1}`} />
                          {idx > 0 && <button onClick={() => removeLayer(idx)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer" }}>✕</button>}
                        </div>
                      ))}
                      <button onClick={addLayer} style={{ background: "none", border: "none", color: theme.highlight, cursor: "pointer", fontSize: 12 }}>+ Ajouter un niveau</button>
                    </div>
                  )}

                  <div style={{ position: "relative" }}>
                    <label style={{ position: "absolute", top: -10, left: 16, background: theme.bg, padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme.highlight, letterSpacing: 1, zIndex: 2 }}>EXEMPLE</label>
                    <textarea ref={exampleTextareaRef} value={addForm.example} onChange={(e) => setAddForm((f) => ({ ...f, example: e.target.value }))} style={{ width: "100%", padding: "16px 110px 16px 20px", background: theme.cardBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 14, color: theme.text, outline: "none", transition: "border-color 0.3s, box-shadow 0.3s", fontStyle: addForm.example?.includes('```') ? "normal" : "italic", minHeight: 70, resize: "vertical", lineHeight: 1.5, fontFamily: addForm.example?.includes('```') ? "'JetBrains Mono', monospace" : "inherit" }} placeholder="Mise en situation, exemple multi-ligne ou ```code```..." onFocus={e => { e.target.style.borderColor = theme.highlight; e.target.style.boxShadow = `0 0 0 3px ${theme.highlight}20` }} onBlur={e => { e.target.style.borderColor = theme.border; e.target.style.boxShadow = "none" }} />
                    <div style={{ position: "absolute", right: 8, top: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                      <button onClick={() => handleMicroAI("example")} disabled={aiLoading} className="hov" style={{ background: isDarkMode ? "rgba(77,107,254,0.15)" : "#EEF2FF", color: "#4D6BFE", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", backdropFilter: "blur(8px)" }}>💡 IA</button>
                      <button onClick={() => insertMarkdown("example", "\n```\n", "\n```\n", "// code")} className="hov" title="Insérer un bloc de code" style={{ background: theme.cardBg, color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{"</>"}</button>
                    </div>
                  </div>
                  {/* Métaphore */}
                  <div style={{ marginBottom: 20 }}>
                    <button onClick={generateMetaphore} disabled={addMetaphoreLoading} style={{ background: "#FFFFFF", color: "#4D6BFE", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>🌱 Générer une métaphore</button>
                    {addMetaphoreText && <div style={{ marginTop: 8, padding: 10, background: "#EFF3FF", borderRadius: 8, fontSize: 13, fontStyle: "italic" }}>{addMetaphoreText}</div>}
                  </div>
                  {/* Options */}
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", background: theme.cardBg, padding: "12px 16px", borderRadius: 16, border: `1px solid ${theme.border}` }}>

                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, fontWeight: 600, cursor: "pointer" }}>
                      <input type="checkbox" checked={addLayeredMode} onChange={e => setAddLayeredMode(e.target.checked)} /> Couches de complexité
                    </label>
                    <button onClick={startCollaboration} className="hov" style={{ marginLeft: "auto", fontSize: 12, background: "none", border: `1px solid ${theme.border}`, borderRadius: 8, padding: "4px 10px", color: theme.textMuted, cursor: "pointer" }}>👥 Collab</button>
                  </div>

                  {/* ── JAUGE DE MÉMORABILITÉ (FSRS Prédictif) ── */}
                  {memScore && (
                    <div style={{ background: theme.cardBg, padding: "16px 20px", borderRadius: 16, border: `1px solid ${theme.border}`, animation: "fadeUp 0.3s ease" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: theme.text }}>🧠 Score de Mémorabilité</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: memScore.color }}>{memScore.label} ({memScore.score}%)</span>
                      </div>
                      <div style={{ height: 6, background: theme.inputBg, borderRadius: 3, overflow: "hidden", marginBottom: memScore.feedback.length > 0 ? 12 : 0 }}>
                        <div style={{ height: "100%", width: `${memScore.score}%`, background: memScore.color, transition: "width 0.4s ease, background-color 0.4s ease" }} />
                      </div>
                      {memScore.feedback.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: theme.textMuted, marginBottom: memScore.score < 80 ? 16 : 0, lineHeight: 1.5 }}>{memScore.feedback.map((f, i) => <li key={i}>{f}</li>)}</ul>}
                      {memScore.score < 80 && (
                        <button onClick={handleOptimizeFSRS} disabled={optimizeLoading} className="hov btn-glow" style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: optimizeLoading ? "not-allowed" : "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          {optimizeLoading ? "⏳" : "✨"} {optimizeLoading ? "Optimisation IA en cours..." : "Optimiser pour FSRS"}
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 12 }}>
                    <button className="hov btn-glow" onClick={handleAddWithInverted} disabled={!addForm.front.trim() || !addForm.back.trim()} style={{ flex: 1, padding: "18px 24px", background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 900, cursor: "pointer", boxShadow: "0 10px 30px rgba(77,107,254,0.3)" }}>{editingId ? "💾 Mettre à jour" : "⚡ Forger la fiche"}</button>
                    {!editingId && <button className="hov" onClick={() => setAddForm((f) => ({ ...f, front: "", back: "", example: "", imageUrl: null }))} style={{ padding: "18px 24px", background: theme.cardBg, color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 16, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Effacer</button>}
                  </div>
                </div>

                {/* ── SELECTION MENU OVERLAY ── */}
                {selectionMenu.open && (
                  <div style={{
                    position: "fixed", zIndex: 110,
                    bottom: 100, left: "50%", transform: "translateX(-50%)",
                    background: isDarkMode ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.95)",
                    backdropFilter: "blur(12px)", border: `1px solid ${theme.highlight}`, borderRadius: 999,
                    padding: "8px 16px", boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
                    display: "flex", alignItems: "center", gap: 8, animation: "fadeUp 0.2s ease"
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: theme.highlight, paddingRight: 8, borderRight: `1px solid ${theme.border}` }}>✨ MAGIE</span>
                    <button onClick={() => handleSelectionAction("raccourcir")} className="hov" style={{ background: "transparent", border: "none", color: theme.text, cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 16 }}>✂️</span> Raccourcir</button>
                    <button onClick={() => handleSelectionAction("detailler")} className="hov" style={{ background: "transparent", border: "none", color: theme.text, cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 16 }}>📖</span> Détailler</button>
                    <button onClick={() => setSelectionMenu({ open: false, field: null, text: "", start: 0, end: 0 })} style={{ background: theme.inputBg, border: "none", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted, cursor: "pointer", marginLeft: 8 }}>✕</button>
                  </div>
                )}

                {/* COLONNE DROITE : PREVIEW HOLOGRAPHIQUE */}
                <div className="right-panel" style={{ position: "sticky", top: 100, display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: theme.textMuted, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace", paddingLeft: 12 }}>LIVE PREVIEW</div>
                  <HoloCard theme={theme} glowColor={theme.highlight} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 32, padding: "36px", boxShadow: "0 30px 60px rgba(77,107,254,0.05)", animation: forgeAnim ? "forgeFly 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ background: theme.highlight + "15", color: theme.highlight, padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 800, border: `1px solid ${theme.highlight}40` }}>{addForm.category || "Catégorie"}</span>
                        {(() => { const t = CARD_TYPES.find(x => x.id === (addForm.type || "qa")); return t ? <span style={{ background: theme.inputBg, color: theme.text, padding: "6px 12px", borderRadius: 10, fontSize: 11, fontWeight: 800, border: `1px solid ${theme.border}`, display: "inline-flex", alignItems: "center", gap: 6 }}>{t.icon} {t.label}</span> : null; })()}
                      </div>
                      <span style={{ background: "rgba(107,130,245,0.15)", color: "#6B82F5", padding: "6px 14px", borderRadius: 10, fontSize: 11, fontWeight: 800 }}>Niveau 0</span>
                    </div>

                    <div style={{ fontSize: 32, fontWeight: 900, color: addForm.front ? theme.text : theme.textMuted, marginBottom: 24, lineHeight: 1.2 }}>{addForm.front || "Le concept apparaîtra ici..."}</div>

                    {addForm.imageUrl && <img src={addForm.imageUrl} className="occlusion-img" alt="media" style={{ width: "100%", borderRadius: 16, marginBottom: 20, border: `1px solid ${theme.border}` }} />}
                    {addAudioUrl && <audio controls src={addAudioUrl} style={{ width: "100%", marginBottom: 16 }} />}
                    {addDiagramSvg && <div style={{ marginBottom: 16 }} dangerouslySetInnerHTML={safeHTML(addDiagramSvg)} />}

                    <div style={{ background: isDarkMode ? "rgba(255,255,255,0.03)" : "#F8FAFF", border: `1px solid ${theme.border}`, borderRadius: 24, padding: "28px" }}>
                      <div style={{ marginTop: 8, color: theme.text, lineHeight: 1.6, fontSize: 14 }}>
                        <RichText content={addForm.back || "*Le verso apparaîtra ici…*"} style={{ color: theme.text }} />
                      </div>

                      {(addForm.example || editingId) && (
                        <div style={{ marginTop: 20, padding: "16px 20px", background: theme.cardBg, borderRadius: 16, fontSize: 13, color: theme.textMuted, borderLeft: `4px solid ${theme.highlight}` }}>
                          <RichText content={addForm.example} style={{ color: theme.textMuted }} />
                        </div>
                      )}

                      {addLayers.length > 1 && addLayers.slice(1).map((l, i) => <div key={i} style={{ marginTop: 16, padding: "16px", background: theme.inputBg, borderRadius: 12, borderLeft: `3px solid ${theme.highlight}80` }}><div style={{ fontSize: 11, color: theme.highlight, fontWeight: 800, marginBottom: 4 }}>NIVEAU {i + 2}</div><div style={{ fontSize: 14, color: theme.text }}>{l.back}</div></div>)}
                    </div>
                  </HoloCard>

                  <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 16, padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted }}>📤 Import en masse (CSV)</span><button className="hov" onClick={() => setShowImport(!showImport)} style={{ background: theme.inputBg, color: theme.highlight, border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{showImport ? "Fermer" : "Ouvrir"}</button></div>
                    {showImport && <div style={{ marginTop: 12, animation: "fadeUp 0.3s ease" }}><textarea value={importText} onChange={(e) => setImportText(e.target.value)} style={{ width: "100%", padding: "16px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 16, fontSize: 12, color: theme.text, minHeight: 80, fontFamily: "JetBrains Mono" }} placeholder="front,back,category,example..." /><button className="hov" onClick={handleImport} style={{ width: "100%", padding: "10px", background: "#3451D1", color: "white", border: "none", borderRadius: 12, fontWeight: 700, marginTop: 8, cursor: "pointer" }}>Importer</button></div>}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {view === "list" && (
            <div style={{ animation: "fadeUp 0.4s ease", background: listXRayMode ? "#020617" : "transparent", padding: listXRayMode ? "20px" : 0, borderRadius: listXRayMode ? 32 : 0, transition: "all 0.5s" }}>
              {/* HEADER */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }} className="dash-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 style={{ fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 900, color: theme.highlight }}>◈ Le Second Cerveau</h1>
                  <p style={{ color: theme.textMuted, margin: 0 }}>Explore, visualise et forge tes connaissances.</p>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ background: theme.cardBg, padding: "10px 16px", borderRadius: 14, border: `1px solid ${theme.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: theme.highlight }}>{filteredExps.length}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Fiches</div>
                  </div>
                  <div style={{ background: theme.cardBg, padding: "10px 16px", borderRadius: 14, border: `1px solid ${theme.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#4D6BFE" }}>{masteredCount}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Maîtrisées</div>
                  </div>
                </div>
              </div>

              {/* OMNIBAR FLOTTANTE */}
              <div className="fiches-omnibar" style={{
                background: listXRayMode ? "rgba(0,0,0,0.85)" : (isDarkMode ? "rgba(15,23,42,0.75)" : "rgba(255,255,255,0.75)"),
                backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
                padding: "12px 20px", borderRadius: 999, border: `1px solid ${theme.highlight}40`,
                marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
                boxShadow: "0 12px 40px rgba(77,107,254,0.1)", position: "sticky", top: 80, zIndex: 40,
                transition: "all 0.4s ease"
              }}>
                {/* Vue par défaut et boutons de basculement */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
                  {[
                    { mode: "grid", icon: "▦", label: "Grille" },
                    { mode: "graph", icon: "🔮", label: "Graphe" },
                    { mode: "clusters", icon: "🧬", label: "Clusters" },
                    { mode: "timeline", icon: "📅", label: "Timeline" }
                  ].map(m => (
                    <button key={m.mode} onClick={() => {
                      if (m.mode === "graph") generateCardsGraph();
                      else if (m.mode === "clusters") generateClusters();
                      else if (m.mode === "timeline") generateTimeline();
                      else setCardsViewMode(m.mode);
                    }} className="hov"
                      style={{
                        padding: "8px 14px", borderRadius: 12, border: `1px solid ${cardsViewMode === m.mode ? theme.highlight : theme.border}`,
                        background: cardsViewMode === m.mode ? theme.highlight + "18" : "transparent",
                        color: cardsViewMode === m.mode ? theme.highlight : theme.textMuted,
                        fontWeight: 700, fontSize: 12, cursor: "pointer"
                      }}>{m.icon} {m.label}</button>
                  ))}
                </div>
                {/* Toggle mobile — affiche / cache toute la zone "Actions rapides" */}
                <button
                  type="button"
                  className="fiches-actions-toggle"
                  onClick={() => document.body.classList.toggle("fiches-actions-expanded")}
                  aria-label="Afficher / cacher les actions de vue"
                  style={{
                    display: "none",
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: theme.cardBg,
                    color: theme.text,
                    fontWeight: 800, fontSize: 13, cursor: "pointer"
                  }}
                >
                  ⚙ Vue
                </button>
                {/* Actions rapides */}
                <div className="fiches-actions-cluster" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>

                  {/* ── GOD HAND SELECTOR (Curseurs magiques) ── */}
                  <div style={{ position: "relative", display: "flex", gap: 4, background: isDarkMode ? "rgba(0,0,0,0.3)" : "rgba(77,107,254,0.05)", borderRadius: 16, padding: 4, border: `1px solid ${theme.border}`, boxShadow: "inset 0 2px 4px rgba(77,107,254,0.1)" }}>
                    {/* Sliding background */}
                    <div style={{
                      position: "absolute",
                      top: 4, bottom: 4,
                      left: 4 + ["contextual", "kebab", "swipe", "accordion"].indexOf(cardsActionMode) * (36 + 4),
                      width: 36,
                      background: "linear-gradient(135deg, #4D6BFE, #3451D1)",
                      borderRadius: 12,
                      transition: "left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      boxShadow: "0 4px 12px rgba(77,107,254,0.4)",
                      zIndex: 0
                    }} />
                    {[
                      { mode: "contextual", icon: "⚡", title: "Magic Wand (Actions rapides)" },
                      { mode: "kebab", icon: "⋮", title: "Deep Dive (Focus Menu)" },
                      { mode: "swipe", icon: "↔", title: "Tinder (Swipe Pile)" },
                      { mode: "accordion", icon: "=", title: "Zen (Liste compacte)" },
                    ].map(m => (
                      <button key={m.mode} onClick={() => { setCardsActionMode(m.mode); setCardKebabOpen(null); setCardAccordionOpen(null); }} title={m.title}
                        style={{ position: "relative", zIndex: 1, width: 36, height: 36, borderRadius: 12, border: "none", cursor: "pointer", fontSize: 18, fontWeight: 800, background: "transparent", color: cardsActionMode === m.mode ? "white" : theme.textMuted, transition: "color 0.3s ease", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {m.icon}
                      </button>
                    ))}
                  </div>

                  {/* 🏷️ Tags */}
                  <button
                    onMouseEnter={() => setListHoveredBtn("tags")} onMouseLeave={() => setListHoveredBtn(null)}
                    onClick={() => { setListTagsDrawerOpen(!listTagsDrawerOpen); if (!listTagsDrawerOpen && Object.keys(cardsTags).length === 0) generateSemanticTags(); }}
                    style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "tags" ? 6 : 0, padding: "8px 12px", borderRadius: 12, background: (listTagsDrawerOpen || listSelectedTag) ? theme.highlight : "transparent", border: `1px solid ${(listTagsDrawerOpen || listSelectedTag) ? theme.highlight : theme.border}`, color: (listTagsDrawerOpen || listSelectedTag) ? "white" : theme.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 16 }}>🏷️</span><span style={{ maxWidth: listHoveredBtn === "tags" || listSelectedTag ? 60 : 0, opacity: listHoveredBtn === "tags" || listSelectedTag ? 1 : 0, transition: "all 0.3s ease" }}>Tags</span>
                  </button>

                  {/* 🕐 Récentes (Slider de Niveau) */}
                  <div
                    onMouseEnter={() => setListHoveredBtn("level")} onMouseLeave={() => setListHoveredBtn(null)}
                    style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "level" ? 6 : 0, padding: "0 12px", borderRadius: 12, background: listSortLevel !== null ? theme.highlight + "20" : "transparent", border: `1px solid ${listSortLevel !== null ? theme.highlight : theme.border}`, height: 38, transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}
                    title="Glisser pour trier par niveau. Double-cliquer pour réinitialiser."
                    onDoubleClick={() => setListSortLevel(null)}
                  >
                    <span style={{ fontSize: 16, cursor: "pointer" }}>{listSortLevel !== null ? `N${listSortLevel}` : "📊"}</span>
                    <div style={{ maxWidth: listHoveredBtn === "level" || listSortLevel !== null ? 100 : 0, opacity: listHoveredBtn === "level" || listSortLevel !== null ? 1 : 0, transition: "all 0.3s ease", display: "flex", alignItems: "center" }}>
                      <input type="range" min="0" max="7" value={listSortLevel !== null ? listSortLevel : 7} onChange={e => setListSortLevel(+e.target.value)} style={{ width: 60, accentColor: theme.highlight, cursor: "ew-resize" }} />
                    </div>
                  </div>

                  {/* ── SÉLECTEUR DE TRI ── */}
                  <select value={cardsSort} onChange={e => setCardsSort(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: 10, background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.textMuted, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                    <option value="date">🕐 Récentes</option>
                    <option value="due">📅 À réviser</option>
                    <option value="level">⭐ Niveau</option>
                    <option value="alpha">🔤 A-Z</option>
                  </select>

                  {/* 🔍 Avancé */}
                  <button
                    onMouseEnter={() => setListHoveredBtn("advanced")} onMouseLeave={() => setListHoveredBtn(null)}
                    onClick={() => setListAdvancedOverlayOpen(true)}
                    style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "advanced" ? 6 : 0, padding: "8px 12px", borderRadius: 12, background: "transparent", border: `1px solid ${theme.border}`, color: theme.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 16 }}>🔍</span><span style={{ maxWidth: listHoveredBtn === "advanced" ? 60 : 0, opacity: listHoveredBtn === "advanced" ? 1 : 0, transition: "all 0.3s ease" }}>Avancé</span>
                  </button>

                  {/* 🖊️ Pièges (Rayon-X) */}
                  <button
                    onMouseEnter={() => setListHoveredBtn("xray")} onMouseLeave={() => setListHoveredBtn(null)}
                    onClick={() => { setListXRayMode(!listXRayMode); if (!listXRayMode) showToast("🕶️ Mode Rayon-X activé : Seuls les pièges s'illuminent."); }}
                    style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "xray" ? 6 : 0, padding: "8px 12px", borderRadius: 12, background: listXRayMode ? "#39FF1420" : "transparent", border: `1px solid ${listXRayMode ? "#39FF14" : theme.border}`, color: listXRayMode ? "#39FF14" : theme.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 16 }}>🖊️</span><span style={{ maxWidth: listHoveredBtn === "xray" || listXRayMode ? 60 : 0, opacity: listHoveredBtn === "xray" || listXRayMode ? 1 : 0, transition: "all 0.3s ease" }}>Pièges</span>
                  </button>

                  {/* 🏛️ Biblio */}
                  <button
                    onMouseEnter={() => setListHoveredBtn("biblio")} onMouseLeave={() => setListHoveredBtn(null)}
                    onClick={() => { setListBiblioPanelOpen(true); loadCommunityCards(); }}
                    style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "biblio" ? 6 : 0, padding: "8px 12px", borderRadius: 12, background: "transparent", border: `1px solid ${theme.border}`, color: theme.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 16 }}>🏛️</span><span style={{ maxWidth: listHoveredBtn === "biblio" ? 60 : 0, opacity: listHoveredBtn === "biblio" ? 1 : 0, transition: "all 0.3s ease" }}>Biblio</span>
                  </button>

                  {/* ▶️ Playlist */}
                  <button
                    onMouseEnter={() => setListHoveredBtn("playlist")} onMouseLeave={() => setListHoveredBtn(null)}
                    onClick={() => {
                      if (cardsAudioPlaying) {
                        window.speechSynthesis.pause();
                        setCardsAudioPlaying(false);
                      } else if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                        setCardsAudioPlaying(true);
                      } else {
                        startPlaylist();
                      }
                    }}
                    disabled={cardsPlaylist.length === 0}
                    style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "playlist" ? 6 : 0, padding: "8px 12px", borderRadius: 12, background: cardsAudioPlaying ? theme.highlight : "transparent", border: `1px solid ${cardsAudioPlaying ? theme.highlight : theme.border}`, color: cardsAudioPlaying ? "white" : theme.textMuted, fontWeight: 600, fontSize: 13, cursor: cardsPlaylist.length === 0 ? "not-allowed" : "pointer", opacity: cardsPlaylist.length === 0 ? 0.5 : 1, transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 16 }}>{cardsAudioPlaying ? "⏸️" : "▶️"}</span>
                    <span style={{ maxWidth: listHoveredBtn === "playlist" || cardsAudioPlaying ? 80 : 0, opacity: listHoveredBtn === "playlist" || cardsAudioPlaying ? 1 : 0, transition: "all 0.3s ease", display: "flex", alignItems: "center", gap: 4 }}>
                      Playlist
                      {cardsAudioPlaying && (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 10, marginLeft: 2 }}>
                          <div style={{ width: 2, height: "40%", background: "white", animation: "pulse 0.5s infinite alternate" }} />
                          <div style={{ width: 2, height: "100%", background: "white", animation: "pulse 0.7s infinite alternate 0.2s" }} />
                          <div style={{ width: 2, height: "60%", background: "white", animation: "pulse 0.6s infinite alternate 0.4s" }} />
                        </div>
                      )}
                    </span>
                  </button>
                  {cardsPlaylist.length > 0 && (
                    <button onClick={clearPlaylist} style={{ padding: "8px", borderRadius: "50%", background: "#FEF2F2", border: "1px solid #A5B4FC", color: "#EF4444", fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  )}

                  {/* ✕ (Reset) */}
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        setFilterCat("Toutes");
                        setFilterLevel("Tous");
                        setSearchQuery("");
                        setListSelectedTag(null);
                        setListSortLevel(null);
                        setListXRayMode(false);
                        setCardsSort("date");
                        setListRippleEffect(true);
                        setTimeout(() => setListRippleEffect(false), 600);
                      }}
                      style={{
                        padding: "8px", borderRadius: "50%", background: "#EF4444", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        animation: "pulse 2s infinite"
                      }}
                    >✕</button>
                  )}
                </div>
              </div>

              {/* TIROIR TAGS 🏷️ */}
              {listTagsDrawerOpen && (
                <div style={{ background: theme.cardBg, borderRadius: 18, padding: "16px", marginBottom: 16, border: `1px solid ${theme.border}`, display: "flex", flexWrap: "wrap", gap: 8, animation: "fadeUp 0.3s ease" }}>
                  <div style={{ width: "100%", fontSize: 11, fontWeight: 800, color: theme.textMuted, marginBottom: 8 }}>NUAGE DE MOTS-CLÉS (Sémantique IA)</div>
                  {cardsTagsLoading ? <span style={{ color: theme.textMuted, fontSize: 13 }}>⏳ Génération par l'IA...</span> : (() => {
                    const allTags = Object.values(cardsTags).flat();
                    const tagCounts = allTags.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});
                    const uniqueTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]).slice(0, 30);
                    if (uniqueTags.length === 0) return <span style={{ color: theme.textMuted, fontSize: 13 }}>Aucun tag généré. Clique sur le bouton Tags.</span>;
                    return uniqueTags.map(tag => (
                      <button key={tag} onClick={() => setListSelectedTag(listSelectedTag === tag ? null : tag)} style={{
                        padding: "6px 12px", borderRadius: 12, border: `1px solid ${listSelectedTag === tag ? theme.highlight : theme.border}`,
                        background: listSelectedTag === tag ? theme.highlight : theme.inputBg,
                        color: listSelectedTag === tag ? "white" : theme.text,
                        fontSize: 12 + Math.min(6, tagCounts[tag]), fontWeight: listSelectedTag === tag ? 800 : 600, cursor: "pointer", transition: "all 0.2s"
                      }}>
                        {tag} <span style={{ opacity: 0.5, fontSize: 10 }}>({tagCounts[tag]})</span>
                      </button>
                    ));
                  })()}
                </div>
              )}

              {/* OVERLAY MINORITY REPORT 🔍 */}
              {listAdvancedOverlayOpen && (
                <div onClick={() => setListAdvancedOverlayOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                  <div onClick={e => e.stopPropagation()} style={{ background: isDarkMode ? "rgba(10,15,30,0.8)" : "rgba(255,255,255,0.8)", border: `1px solid ${theme.highlight}50`, borderRadius: 24, padding: 32, width: "100%", maxWidth: 600, boxShadow: `0 30px 80px rgba(77,107,254,0.3)`, position: "relative", animation: "flowZoomIn 0.4s reverse" }}>
                    <button onClick={() => setListAdvancedOverlayOpen(false)} style={{ position: "absolute", top: 20, right: 20, background: "none", border: "none", color: theme.textMuted, fontSize: 24, cursor: "pointer" }}>✕</button>
                    <h3 style={{ color: theme.text, marginTop: 0, display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 24 }}>🔍</span> Minority Report Filter</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 16, marginTop: 24 }}>
                      <div style={{ background: theme.inputBg, padding: 16, borderRadius: 16, border: `1px solid ${theme.border}` }}>
                        <label style={{ fontSize: 11, fontWeight: 800, color: theme.highlight, display: "block", marginBottom: 8, textTransform: "uppercase" }}>Requête Boléenne (AND/OR/NOT)</label>
                        <input value={cardsAdvancedSearch.boolQuery} onChange={e => { setCardsAdvancedSearch(prev => ({ ...prev, boolQuery: e.target.value })); setCardsSearchOpen(true); }}
                          style={{ width: "100%", padding: "10px 14px", background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, fontSize: 14 }}
                          placeholder="ex: java NOT spring" />
                      </div>
                      <div style={{ background: theme.inputBg, padding: 16, borderRadius: 16, border: `1px solid ${theme.border}` }}>
                        <label style={{ fontSize: 11, fontWeight: 800, color: theme.highlight, display: "block", marginBottom: 8, textTransform: "uppercase" }}>Poids Cognitif (Difficulté)</label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="number" min={0} max={10} value={cardsAdvancedSearch.minDifficulty} onChange={e => { setCardsAdvancedSearch(prev => ({ ...prev, minDifficulty: +e.target.value })); setCardsSearchOpen(true); }}
                            style={{ flex: 1, padding: "8px", background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, textAlign: "center" }} />
                          <span style={{ color: theme.textMuted }}>→</span>
                          <input type="number" min={0} max={10} value={cardsAdvancedSearch.maxDifficulty} onChange={e => { setCardsAdvancedSearch(prev => ({ ...prev, maxDifficulty: +e.target.value })); setCardsSearchOpen(true); }}
                            style={{ flex: 1, padding: "8px", background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, textAlign: "center" }} />
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 24, textAlign: "right" }}>
                      <button onClick={() => { setCardsAdvancedSearch({ boolQuery: "", minDifficulty: 0, maxDifficulty: 10, minLevel: 0, maxLevel: 7, dateFrom: "", dateTo: "" }); setCardsSearchOpen(false); }} style={{ padding: "10px 20px", background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontWeight: 700 }}>Réinitialiser</button>
                      <button onClick={() => setListAdvancedOverlayOpen(false)} style={{ padding: "10px 24px", background: theme.highlight, color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", marginLeft: 12 }}>Appliquer les filtres</button>
                    </div>
                  </div>
                </div>
              )}

              {/* MARKETPLACE BIBLIO 🏛️ */}
              <div style={{
                position: "fixed", top: 0, right: 0, bottom: 0, width: "min(400px, 90vw)",
                background: isDarkMode ? "rgba(10,15,30,0.85)" : "rgba(255,255,255,0.9)",
                backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)",
                borderLeft: `1px solid ${theme.border}`, boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
                transform: listBiblioPanelOpen ? "translateX(0)" : "translateX(100%)",
                transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                zIndex: 100, display: "flex", flexDirection: "column"
              }}>
                <div style={{ padding: "24px", borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: theme.text, display: "flex", alignItems: "center", gap: 10 }}>🏛️ Marketplace</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>Importe des fiches communautaires.</div>
                  </div>
                  <button onClick={() => setListBiblioPanelOpen(false)} style={{ background: theme.inputBg, border: "none", color: theme.text, width: 32, height: 32, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>✕</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  {cardsCommunityLoading ? <div style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>⏳ Chargement de la bibliothèque...</div> : (
                    Array.isArray(cardsCommunity) && cardsCommunity.map(card => (
                      <div key={card.id} style={{ background: theme.cardBg, borderRadius: 16, padding: "16px", border: `1px solid ${theme.border}`, boxShadow: "0 4px 12px rgba(77,107,254,0.05)" }}>
                        <div style={{ fontSize: 10, color: theme.highlight, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>{card.category}</div>
                        <div style={{ fontWeight: 800, color: theme.text, fontSize: 15, marginBottom: 6 }}>{card.front}</div>
                        <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>{card.back}</div>
                        <button onClick={() => importCommunityCard(card)} className="hov" style={{ marginTop: 12, width: "100%", padding: "8px", background: theme.highlight + "20", color: theme.highlight, border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>📥 Importer</button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* CONTROL CENTER & SPOTLIGHT SEARCH */}
              <div style={{ position: "relative", zIndex: 50, background: isDarkMode ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.4)", padding: "12px 16px", borderRadius: 24, border: `1px solid ${theme.border}`, marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", boxShadow: "0 4px 20px rgba(77,107,254,0.05)", backdropFilter: "blur(12px)" }}>
                {/* CENTRAL SPOTLIGHT SEARCH */}
                <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: searchQuery ? 600 : 400, transition: "max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
                  <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: theme.textMuted }}>🔍</span>
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={(e) => e.target.parentElement.style.maxWidth = "600px"}
                    onBlur={(e) => e.target.parentElement.style.maxWidth = searchQuery ? "600px" : "400px"}
                    style={{ width: "100%", padding: "14px 50px 14px 44px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 16, fontSize: 15, color: theme.text, outline: "none", transition: "all 0.3s", boxShadow: "inset 0 2px 4px rgba(77,107,254,0.05)", fontWeight: 600 }}
                    placeholder="Chercher un concept ou taper une commande..."
                  />
                  {searchQuery ? (
                    <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.textMuted, cursor: "pointer", fontSize: 12, padding: "6px 10px", fontWeight: 800 }}>✕</button>
                  ) : (
                    <button onClick={() => { setCmdPaletteOpen(true); setCmdPaletteQuery(""); }} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMuted, cursor: "pointer", fontSize: 12, padding: "6px 10px", borderRadius: 10, fontWeight: 800, fontFamily: "'JetBrains Mono'" }}>⌘K</button>
                  )}
                </div>

                <button onClick={handleSemanticSearch} disabled={semanticLoading} className="btn-glow hov" style={{ background: "linear-gradient(135deg, #4D6BFE, #1E3A8A)", color: "white", border: "none", padding: "14px 20px", borderRadius: 16, fontWeight: 800, cursor: "pointer", fontSize: 14, boxShadow: "0 4px 15px rgba(77,107,254,0.3)" }}>
                  {semanticLoading ? "🧠 Analyse..." : "🧠 Sémantique"}
                </button>
                <div style={{ position: "relative", width: isMobile ? "100%" : "auto" }}>
                  <button onClick={() => setFilterSheetOpen(v => !v)} className="hov" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 18px", borderRadius: 20, background: (filterCat !== "Toutes" || filterLevel !== "Tous") ? theme.highlight : theme.cardBg, border: `1px solid ${(filterCat !== "Toutes" || filterLevel !== "Tous") ? theme.highlight : theme.border}`, color: (filterCat !== "Toutes" || filterLevel !== "Tous") ? "white" : theme.text, fontWeight: 700, fontSize: 14, width: "100%" }}>
                    <span>🎯 Filtrer{(filterCat !== "Toutes" || filterLevel !== "Tous") ? " (Actif)" : ""}</span>
                    <span style={{ fontSize: 10 }}>▼</span>
                  </button>
                  {!isMobile && filterSheetOpen && (
                    <>
                      <div onClick={() => setFilterSheetOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 900 }} />
                      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 8, background: isDarkMode ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.85)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", padding: 16, borderRadius: 16, border: `1px solid ${theme.border}`, boxShadow: "0 20px 50px rgba(0,0,0,0.2)", zIndex: 9999, width: 340, maxHeight: "60vh", overflowY: "auto" }}>
                        <div style={{ fontWeight: 800, marginBottom: 12, color: theme.text, fontSize: 14 }}>Filtrer par catégorie</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                          {["Toutes", ...catNames].map((c) => (
                            <button key={c} onClick={() => startTransition(() => setFilterCat(c))} style={{ padding: "8px 14px", borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: "pointer", background: filterCat === c ? theme.highlight : theme.inputBg, color: filterCat === c ? "white" : theme.text, border: `1px solid ${filterCat === c ? theme.highlight : theme.border}`, whiteSpace: "nowrap" }}>{c}</button>
                          ))}
                        </div>
                        <div style={{ fontWeight: 800, marginBottom: 12, color: theme.text, fontSize: 14 }}>Filtrer par niveau</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {["Tous", "Nouvelles", "En retard", "Maîtrisées"].map((l) => (
                            <button key={l} onClick={() => startTransition(() => setFilterLevel(l))} style={{ padding: "8px 14px", borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: "pointer", background: filterLevel === l ? theme.highlight : theme.inputBg, color: filterLevel === l ? "white" : theme.text, border: `1px solid ${filterLevel === l ? theme.highlight : theme.border}`, whiteSpace: "nowrap" }}>{l}</button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {isMobile && filterSheetOpen && (
                  <div onClick={() => setFilterSheetOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: theme.cardBg, borderRadius: "20px 20px 0 0", padding: "20px 16px calc(40px + env(safe-area-inset-bottom, 0px))", zIndex: 1001, maxHeight: "75vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(0,0,0,0.3)" }}>
                      <div style={{ fontWeight: 800, marginBottom: 12, color: theme.text, fontSize: 16 }}>Filtrer par catégorie</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                        {["Toutes", ...catNames].map((c) => (
                          <button key={c} onClick={() => startTransition(() => setFilterCat(c))} style={{ padding: "10px 16px", borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: "pointer", background: filterCat === c ? theme.highlight : theme.inputBg, color: filterCat === c ? "white" : theme.text, border: `1px solid ${filterCat === c ? theme.highlight : theme.border}` }}>{c}</button>
                        ))}
                      </div>
                      <div style={{ fontWeight: 800, marginBottom: 12, color: theme.text, fontSize: 16 }}>Filtrer par niveau</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                        {["Tous", "Nouvelles", "En retard", "Maîtrisées"].map((l) => (
                          <button key={l} onClick={() => startTransition(() => setFilterLevel(l))} style={{ padding: "10px 16px", borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: "pointer", background: filterLevel === l ? theme.highlight : theme.inputBg, color: filterLevel === l ? "white" : theme.text, border: `1px solid ${filterLevel === l ? theme.highlight : theme.border}` }}>{l}</button>
                        ))}
                      </div>
                      <button onClick={() => setFilterSheetOpen(false)} style={{ width: "100%", padding: "12px", borderRadius: 12, background: theme.highlight, color: "white", border: "none", fontWeight: 800, cursor: "pointer", fontSize: 14 }}>Appliquer</button>
                    </div>
                  </div>
                )}
              </div>

              {/* MINIMAP */}
              {cardsViewMode === "grid" && filteredExps.length > 50 && (
                <Minimap cards={filteredExps} onPixelClick={handleMinimapClick} theme={theme} isDarkMode={isDarkMode} />
              )}

              {/* AFFICHAGE PRINCIPAL SELON LE MODE */}
              {cardsViewMode === "graph" && (
                <div
                  onWheel={(e) => { e.preventDefault(); setGraphTransform(p => ({ ...p, scale: Math.max(0.3, Math.min(4, p.scale - e.deltaY * 0.005)) })); }}
                  onPointerDown={(e) => { graphDragRef.current = { isDragging: true, startX: e.clientX - graphTransform.x, startY: e.clientY - graphTransform.y }; }}
                  onPointerMove={(e) => { if (graphDragRef.current.isDragging) { setGraphTransform(p => ({ ...p, x: e.clientX - graphDragRef.current.startX, y: e.clientY - graphDragRef.current.startY })); } }}
                  onPointerUp={() => { graphDragRef.current.isDragging = false; }}
                  onPointerLeave={() => { graphDragRef.current.isDragging = false; }}
                  style={{
                    background: "radial-gradient(circle at 50% 50%, #1e1b4b 0%, #020617 100%)",
                    borderRadius: 32, padding: "20px", marginBottom: 24, border: `1px solid ${theme.border}`, minHeight: 600,
                    boxShadow: "inset 0 0 100px rgba(0,0,0,0.8)", overflow: "hidden", position: "relative", cursor: graphDragRef.current.isDragging ? "grabbing" : "grab", touchAction: "none"
                  }}
                >
                  <div style={{ position: "absolute", top: 24, left: 24, right: 24, display: "flex", justifyContent: "space-between", zIndex: 10 }}>
                    <h3 style={{ fontWeight: 900, color: "#A5B4FC", margin: 0, fontSize: 24, textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>🔮 Constellation</h3>
                    <div style={{ display: "flex", gap: 12 }}>
                      <button onClick={() => setGraphTransform({ x: 0, y: 0, scale: 1 })} className="hov" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", cursor: "pointer", padding: "8px 16px", borderRadius: 12, fontWeight: 700, backdropFilter: "blur(8px)" }}>Centrer</button>
                      <button onClick={() => setCardsViewMode("grid")} className="hov" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", cursor: "pointer", padding: "8px 16px", borderRadius: 12, fontWeight: 700, backdropFilter: "blur(8px)" }}>← Retour Grille</button>
                    </div>
                  </div>
                  {cardsGraphLoading ? <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 20 }}>Tissage de la constellation... 🌌</div> :
                    <div style={{ position: "absolute", inset: 0, transform: `translate(${graphTransform.x}px, ${graphTransform.y}px) scale(${graphTransform.scale})`, transformOrigin: "0 0", transition: graphDragRef.current.isDragging ? "none" : "transform 0.1s ease-out" }}>
                      <svg width="200%" height="200%" style={{ overflow: "visible" }}>
                        <defs>
                          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="6" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                          </filter>
                        </defs>
                        {cardsGraphData.links.map((link, i) => {
                          const sourceNode = cardsGraphData.nodes.find(n => n.id === link.source);
                          const targetNode = cardsGraphData.nodes.find(n => n.id === link.target);
                          if (!sourceNode || !targetNode) return null;
                          const sx = 300 + ((cardsGraphData.nodes.indexOf(sourceNode) * 37) % 6) * 150 + (((cardsGraphData.nodes.indexOf(sourceNode) * 13) % 40) - 20);
                          const sy = 250 + Math.floor(cardsGraphData.nodes.indexOf(sourceNode) / 6) * 120 + (((cardsGraphData.nodes.indexOf(sourceNode) * 17) % 40) - 20);
                          const tx = 300 + ((cardsGraphData.nodes.indexOf(targetNode) * 37) % 6) * 150 + (((cardsGraphData.nodes.indexOf(targetNode) * 13) % 40) - 20);
                          const ty = 250 + Math.floor(cardsGraphData.nodes.indexOf(targetNode) / 6) * 120 + (((cardsGraphData.nodes.indexOf(targetNode) * 17) % 40) - 20);
                          return <line key={i} x1={sx} y1={sy} x2={tx} y2={ty} stroke="rgba(123, 147, 255, 0.4)" strokeWidth={2} strokeDasharray="4 4" />;
                        })}
                        {cardsGraphData.nodes.map((node, i) => {
                          const x = 300 + ((i * 37) % 6) * 150 + (((i * 13) % 40) - 20);
                          const y = 250 + Math.floor(i / 6) * 120 + (((i * 17) % 40) - 20);
                          const color = categories.find(c => c.name === node.category)?.color || "#4D6BFE";
                          return (
                            <g key={node.id} onClick={() => setExpandedCard(expressions.find(e => e.id === node.id))} style={{ cursor: "pointer", transition: "transform 0.2s" }} className="hover-scale">
                              <circle cx={x} cy={y} r={18} fill={color} filter="url(#nodeGlow)" opacity={0.9} />
                              <circle cx={x} cy={y} r={8} fill="#ffffff" />
                              <text x={x} y={y + 32} textAnchor="middle" fill="var(--mm-border)" fontSize={12} fontWeight="800" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}>{node.label.substring(0, 15)}</text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  }
                </div>
              )}

              {cardsViewMode === "clusters" && (
                <div style={{ background: isDarkMode ? "radial-gradient(circle at 50% 0%, #2e1065 0%, #020617 100%)" : "radial-gradient(circle at 50% 0%, #e0e7ff 0%, var(--mm-bg-elev) 100%)", borderRadius: 32, padding: "40px", marginBottom: 24, border: `1px solid ${theme.border}`, minHeight: 600, overflow: "hidden", position: "relative" }}>
                  <style>{`
                  @keyframes float-island {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-15px) rotate(2deg); }
                  }
                `}</style>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32, position: "relative", zIndex: 10 }}>
                    <h3 style={{ fontWeight: 900, color: theme.highlight, margin: 0, fontSize: 24 }}>🧬 Nébuleuse Sémantique</h3>
                    <button onClick={() => setCardsViewMode("grid")} className="hov" style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", color: theme.text, cursor: "pointer", padding: "8px 16px", borderRadius: 12, fontWeight: 700, backdropFilter: "blur(8px)" }}>← Retour Grille</button>
                  </div>
                  {cardsClusters.length === 0 ? <div style={{ textAlign: "center", padding: 80, color: theme.textMuted, fontSize: 20 }}>L'IA rassemble les étoiles de ton savoir... 🌌</div> :
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "center", alignItems: "center" }}>
                      {cardsClusters.map((cluster, i) => (
                        <div key={i} style={{
                          animation: `float-island ${5 + (i % 3)}s ease-in-out infinite alternate`,
                          background: isDarkMode ? "rgba(15,23,42,0.5)" : "rgba(255,255,255,0.6)",
                          backdropFilter: "blur(16px)",
                          borderRadius: i % 2 === 0 ? "40% 60% 70% 30% / 40% 50% 60% 50%" : "60% 40% 30% 70% / 60% 30% 70% 40%",
                          padding: "40px",
                          border: `2px solid ${theme.highlight}40`,
                          boxShadow: `0 20px 50px ${theme.highlight}20`,
                          maxWidth: 450, minWidth: 300,
                          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center"
                        }}>
                          <div style={{ background: theme.highlight, color: "white", padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, marginBottom: 20, boxShadow: `0 4px 15px ${theme.highlight}60` }}>
                            {cluster.name}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                            {cluster.cards.map(cardId => {
                              const card = expressions.find(e => e.id === cardId);
                              return card ? <span key={cardId} className="hov" style={{ background: theme.cardBg, borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 700, color: theme.text, border: `1px solid ${theme.border}`, boxShadow: "0 4px 10px rgba(77,107,254,0.1)", cursor: "pointer" }} onClick={() => setExpandedCard(card)}>{card.front}</span> : null;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                </div>
              )}

              {cardsViewMode === "timeline" && (
                <div style={{ position: "relative", marginBottom: 24 }}>
                  <div style={{ position: "absolute", top: 24, left: 24, right: 24, display: "flex", justifyContent: "space-between", zIndex: 10 }}>
                    <h3 style={{ fontWeight: 900, color: "white", margin: 0, fontSize: 24, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>📅 Voyage dans le Temps</h3>
                    <button onClick={() => setCardsViewMode("grid")} className="hov" style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", color: "white", cursor: "pointer", padding: "8px 16px", borderRadius: 12, fontWeight: 700, backdropFilter: "blur(8px)" }}>← Retour Grille</button>
                  </div>
                  <div
                    onScroll={(e) => {
                      const { scrollLeft, scrollWidth, clientWidth } = e.target;
                      setTimelineScrollRatio(scrollLeft / Math.max(1, scrollWidth - clientWidth));
                    }}
                    style={{
                      display: "flex", gap: 32, overflowX: "auto", scrollSnapType: "x mandatory",
                      padding: "100px 40px 60px 40px", borderRadius: 32,
                      background: `linear-gradient(90deg, #1e1b4b, #312e81, #0f172a, #064e3b, #022c22)`,
                      backgroundSize: "400% 100%",
                      backgroundPosition: `${timelineScrollRatio * 100}% 50%`,
                      transition: "background-position 0.1s ease",
                      alignItems: "center", minHeight: 400
                    }}
                  >
                    {cardsTimeline.map((card, i) => (
                      <div key={i} className="hov" onClick={() => setExpandedCard(card)} style={{
                        flex: "0 0 320px", scrollSnapAlign: "center",
                        background: theme.cardBg, borderRadius: 24, padding: 32,
                        boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
                        borderTop: `6px solid ${card.level >= 7 ? "#10B981" : theme.highlight}`,
                        cursor: "pointer", position: "relative"
                      }}>
                        <div style={{ position: "absolute", top: -16, left: 32, background: theme.inputBg, color: theme.textMuted, padding: "4px 12px", borderRadius: 12, fontSize: 11, fontWeight: 900, border: `1px solid ${theme.border}` }}>
                          {card.createdAt || "Création"}
                        </div>
                        <div style={{ fontWeight: 900, fontSize: 20, color: theme.text, marginBottom: 12, marginTop: 10 }}>{card.front}</div>
                        <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5, marginBottom: 20, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.back}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: card.level >= 7 ? "#10B981" : theme.highlight }}>Niv. {card.level}</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {(card.history || card.reviewHistory || []).slice(-8).map((h, j) => (
                              <span key={j} title={h.date} style={{ width: 10, height: 10, borderRadius: "50%", background: h.q === 0 ? "#EF4444" : h.q === 3 ? "#6B82F5" : "#4D6BFE", display: "inline-block" }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                    {cardsTimeline.length === 0 && (
                      <div style={{ width: "100%", textAlign: "center", color: "white", fontSize: 18, fontWeight: 700 }}>
                        Le temps est un fleuve sans fin... 🕰️
                      </div>
                    )}
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
                  ) : (() => {
                    const hoveredCardObj = cardsHoveredId ? filteredExps.find(e => e.id === cardsHoveredId) : null;
                    const isRelated = (exp) => {
                      if (!hoveredCardObj) return true;
                      if (exp.id === cardsHoveredId) return true;
                      if (exp.category === hoveredCardObj.category) return true;
                      const myTags = cardsTags[exp.id] || [];
                      const hovTags = cardsTags[hoveredCardObj.id] || [];
                      return myTags.some(t => hovTags.includes(t));
                    };

                    const hasHeavyContent = (e) => {
                      const b = String(e?.back || "");
                      const ex = String(e?.example || "");
                      // Code (```), tableaux Markdown (|...|), ou tableaux HTML
                      return /```|<table|^\s*\|.+\|\s*$/m.test(b) || /```|<table|^\s*\|.+\|\s*$/m.test(ex);
                    };
                    const isBigCard = (e) => {
                      if (hasHeavyContent(e)) return true;
                      const b = String(e?.back || "");
                      const f = String(e?.front || "");
                      // Considère "grande" toute fiche avec code, tableau,
                      // longue réponse, ou un long intitulé.
                      return b.length > 260 || f.length > 110;
                    };
                    const renderCard = (exp) => {
                      const big = isBigCard(exp);
                      const lvl = exp.level || 0;
                      const lvlColor = lvl >= 7 ? "#4D6BFE" : lvl >= 5 ? "#4D6BFE" : lvl >= 3 ? "#7B93FF" : lvl >= 1 ? "#6B82F5" : "#9CA3AF";
                      const catColor = categories.find((c) => c.name === exp.category)?.color || "#4D6BFE";
                      const tag = cognitiveTag(exp);
                      const isFortress = cardsFortressActive[exp.id];
                      const related = isRelated(exp);
                      const isActiveHover = cardsHoveredId === exp.id;
                      const isSelected = selectedCards.includes(exp.id);
                      const isAccordionMode = cardsActionMode === "accordion";
                      const isAccordionOpen = cardAccordionOpen === exp.id;

                      // --- NOUVEAU: X-Ray & Tags opacity ---
                      const isTrap = exp.difficulty >= 7 || exp.easeFactor <= 1.8;
                      const hasSelectedTag = listSelectedTag ? (cardsTags[exp.id] || []).includes(listSelectedTag) : true;

                      let cardOpacity = 1;
                      let cardFilter = "none";
                      let cardBoxShadow = cardKebabOpen === exp.id ? `0 30px 80px rgba(0,0,0,0.5)` : (isSelected ? `0 20px 50px ${theme.highlight}50` : "0 8px 30px rgba(77,107,254,0.05)");
                      let cardBorder = isSelected ? `2px solid ${theme.highlight}` : `1px solid ${theme.border}`;
                      let bgCol = theme.cardBg;

                      if (listSelectedTag && !hasSelectedTag) {
                        cardOpacity = 0.1;
                        cardFilter = "grayscale(100%)";
                      }

                      if (listXRayMode) {
                        bgCol = "#000000";
                        if (isTrap) {
                          cardBorder = `2px solid #39FF14`;
                          cardBoxShadow = `0 0 25px rgba(57, 255, 20, 0.4), inset 0 0 10px rgba(57, 255, 20, 0.2)`;
                          cardOpacity = 1;
                          cardFilter = "none";
                        } else {
                          cardOpacity = 0.05;
                          cardBorder = `1px solid #111`;
                        }
                      }

                      return (
                        <div
                          key={exp.id}
                          id={`card-${exp.id}`}
                          className={(cardsSort === "level" || cardsSort === "due" ? "card-hov" : "smart-card card-hov") + " " + (hasHeavyContent(exp) ? "smart-full" : (big ? "smart-big" : "smart-small")) + (listRippleEffect ? " ripple-anim" : "")}
                          onMouseEnter={() => setCardsHoveredId(exp.id)}
                          onMouseLeave={() => setCardsHoveredId(null)}
                          style={{
                            background: bgCol,
                            border: cardBorder,
                            borderRadius: 20, overflow: "hidden",
                            boxShadow: cardBoxShadow,
                            opacity: cardOpacity,
                            filter: cardFilter,
                            transform: isSelected ? "scale(1.05) translateY(-8px)" : "scale(1) translateY(0)",
                            zIndex: isSelected ? 20 : (cardKebabOpen === exp.id ? 55 : (isActiveHover ? 10 : (related ? 5 : 1))),
                            position: "relative",
                            animation: "fadeIn 0.4s ease-out",
                            transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
                          }}
                        >
                          <div style={{ padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, background: catColor + "22", color: catColor }}>{exp.category}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ background: tag.color + "22", color: tag.color, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{tag.icon} {tag.label}</span>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: lvlColor }} /><span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono'" }}>N{lvl}</span>
                            </div>
                          </div>
                          <div style={{ padding: "0 24px", flex: 1, cursor: "pointer" }} onClick={(e) => {
                            if (isAccordionMode && !isAccordionOpen) {
                              setCardAccordionOpen(exp.id);
                            } else if (e.shiftKey || selectedCards.length > 0) {
                              e.stopPropagation();
                              setSelectedCards(prev => prev.includes(exp.id) ? prev.filter(id => id !== exp.id) : [...prev, exp.id]);
                            }
                          }} title={selectedCards.length > 0 ? "Sélectionner / Désélectionner" : "Maj+Clic pour sélectionner"}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: theme.highlight, marginBottom: (isAccordionMode && !isAccordionOpen) ? 0 : 12, lineHeight: 1.3 }}>{exp.front}</div>
                            {(!isAccordionMode || isAccordionOpen) && (
                              <>
                                {exp.imageUrl && <div style={{ fontSize: 11, background: "#4D6BFE22", color: "#4D6BFE", padding: "4px 8px", borderRadius: 8, display: "inline-block", marginBottom: 12, fontWeight: 700 }}>🖼️ Image attachée</div>}
                                <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.6, marginBottom: 16 }}>
                                  <GodTierContent text={exp.back} theme={theme} isDarkMode={isDarkMode} />
                                </div>
                                {exp.example && (
                                  <div style={{ background: theme.inputBg, padding: "12px", borderRadius: 12, fontSize: 13, color: theme.textMuted, fontStyle: "italic", borderLeft: "3px solid #4D6BFE", marginBottom: 16 }}>
                                    <span style={{ color: "#4D6BFE", fontSize: 10 }}>// exemple</span><br />
                                    <div style={{ marginTop: 8 }}>
                                      <GodTierContent text={exp.example} theme={theme} isDarkMode={isDarkMode} />
                                    </div>
                                  </div>
                                )}
                                {/* Tags sémantiques */}
                                {cardsTags[exp.id] && cardsTags[exp.id].length > 0 && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                                    {cardsTags[exp.id].map((t, i) => (
                                      <span key={i} style={{ background: isDarkMode ? "#3D2000" : "#E0E7FF", color: isDarkMode ? "#C7D2FE" : "#4338CA", borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{t}</span>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          {/* ═══ BARRE D'ACTIONS — GOD LEVEL UX v11 ═══ */}
                          {(() => {
                            const isKebabOpen = cardKebabOpen === exp.id;
                            const isSwipeMode = cardsActionMode === "swipe";
                            const swipeDx = cardSwipeState[exp.id]?.x || 0;

                            /* ── Concept 1 : Barre contextuelle (défaut) ── */
                            if (cardsActionMode === "contextual") return (
                              <div style={{ padding: "10px 16px", background: theme.inputBg, borderTop: `1px solid ${theme.border}`, display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono'", flex: 1 }}>
                                  {lvl >= 7 ? "✅ Maîtrisée" : `📅 ${formatDate(exp.nextReview)}`}
                                </span>
                                {/* Primaires : label visible */}
                                <button onClick={() => startEdit(exp)} className="hov" style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.cardBg, color: theme.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✏️ Éditer</button>
                                <button onClick={() => { startEdit(exp); setAiPrompt(exp.front); }} className="hov" style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.cardBg, color: "#7B93FF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✨ IA</button>
                                {/* Danger */}
                                <button onClick={() => deleteExp(exp.id)} className="hov" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#FEF2F2", color: "#EF4444", fontSize: 13, cursor: "pointer" }} title="Supprimer">🗑️</button>
                                {/* Secondaires dans kebab */}
                                <div style={{ position: "relative" }}>
                                  <button onClick={() => setCardKebabOpen(isKebabOpen ? null : exp.id)} className="hov" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${theme.border}`, background: isKebabOpen ? theme.highlight : theme.cardBg, color: isKebabOpen ? "white" : theme.textMuted, fontSize: 16, cursor: "pointer", fontWeight: 900 }} title="Plus d'actions">•••</button>
                                  {isKebabOpen && (
                                    <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, background: isDarkMode ? "#0D1535" : "#FFFFFF", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 6, zIndex: 50, minWidth: 190, boxShadow: "0 8px 32px rgba(77,107,254,0.1)" }}>
                                      <div style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, padding: "4px 10px 2px", letterSpacing: 1 }}>ACTIONS IA</div>
                                      {[
                                        { icon: "⚗️", label: "Générer variantes", fn: () => generateVariants(exp) },
                                        { icon: "🔊", label: "Écouter", fn: () => addToPlaylist(exp) },
                                      ].map(a => (
                                        <button key={a.label} onClick={() => { a.fn(); setCardKebabOpen(null); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", background: "none", border: "none", borderRadius: 8, color: theme.text, fontSize: 13, cursor: "pointer", textAlign: "left" }} onMouseEnter={e => e.currentTarget.style.background = theme.inputBg} onMouseLeave={e => e.currentTarget.style.background = "none"}>{a.icon} {a.label}</button>
                                      ))}
                                      <div style={{ height: 1, background: theme.border, margin: "4px 0" }} />
                                      <div style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, padding: "4px 10px 2px", letterSpacing: 1 }}>GESTION</div>
                                      {[
                                        { icon: isFortress ? "🛡️" : "🔓", label: isFortress ? "Protégée" : "Protéger", fn: () => toggleFortress(exp.id) },
                                        { icon: "⚔️", label: "Lancer un Duel", fn: () => startDuel(exp) },
                                      ].map(a => (
                                        <button key={a.label} onClick={() => { a.fn(); setCardKebabOpen(null); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", background: "none", border: "none", borderRadius: 8, color: theme.text, fontSize: 13, cursor: "pointer", textAlign: "left" }} onMouseEnter={e => e.currentTarget.style.background = theme.inputBg} onMouseLeave={e => e.currentTarget.style.background = "none"}>{a.icon} {a.label}</button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );

                            /* ── Concept 2 : Kebab pur ── */
                            if (cardsActionMode === "kebab") return (
                              <div style={{ padding: "10px 16px", background: theme.inputBg, borderTop: `1px solid ${theme.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono'", flex: 1 }}>
                                  {lvl >= 7 ? "✅ Maîtrisée" : `📅 ${formatDate(exp.nextReview)}`}
                                </span>
                                <div style={{ position: "relative" }}>
                                  <button onClick={() => setCardKebabOpen(isKebabOpen ? null : exp.id)} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${theme.border}`, background: isKebabOpen ? "#4D6BFE" : theme.cardBg, color: isKebabOpen ? "white" : theme.textMuted, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "-1px" }} title="Actions">⋮</button>
                                  {isKebabOpen && (
                                    <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, background: isDarkMode ? "#0D1535" : "#FFFFFF", border: `1px solid ${theme.border}`, borderRadius: 16, padding: 6, zIndex: 50, minWidth: 200, boxShadow: "0 8px 40px rgba(77,107,254,0.2)" }}>
                                      {[
                                        { icon: "✨", label: "Améliorer avec l'IA", fn: () => { startEdit(exp); setAiPrompt(exp.front); }, color: "#7B93FF" },
                                        { icon: "⚗️", label: "Générer variantes", fn: () => generateVariants(exp), color: "#4D6BFE" },
                                        { icon: "⚔️", label: "Lancer un Duel", fn: () => startDuel(exp), color: "#4D6BFE" },
                                      ].map(a => (
                                        <button key={a.label} onClick={() => { a.fn(); setCardKebabOpen(null); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", background: "none", border: "none", borderRadius: 10, color: a.color || theme.text, fontSize: 13, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = theme.inputBg} onMouseLeave={e => e.currentTarget.style.background = "none"}><span style={{ fontSize: 15 }}>{a.icon}</span> {a.label}</button>
                                      ))}
                                      <div style={{ height: 1, background: theme.border, margin: "4px 0" }} />
                                      {[
                                        { icon: "✏️", label: "Éditer", fn: () => startEdit(exp), color: theme.text },
                                        { icon: "🔊", label: "Écouter", fn: () => addToPlaylist(exp), color: theme.text },
                                        { icon: isFortress ? "🛡️" : "🔓", label: isFortress ? "Protégée" : "Protéger", fn: () => toggleFortress(exp.id), color: theme.text },
                                      ].map(a => (
                                        <button key={a.label} onClick={() => { a.fn(); setCardKebabOpen(null); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", background: "none", border: "none", borderRadius: 10, color: a.color, fontSize: 13, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = theme.inputBg} onMouseLeave={e => e.currentTarget.style.background = "none"}><span style={{ fontSize: 15 }}>{a.icon}</span> {a.label}</button>
                                      ))}
                                      <div style={{ height: 1, background: theme.border, margin: "4px 0" }} />
                                      <button onClick={() => { deleteExp(exp.id); setCardKebabOpen(null); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", background: "none", border: "none", borderRadius: 10, color: "#EF4444", fontSize: 13, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = "#FEF2F2"} onMouseLeave={e => e.currentTarget.style.background = "none"}><span>🗑️</span> Supprimer</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );

                            /* ── Concept 3 : Swipe actions ── */
                            if (cardsActionMode === "swipe") return (
                              <div style={{ borderTop: `1px solid ${theme.border}`, overflow: "hidden", position: "relative", userSelect: "none", background: theme.cardBg }}
                                onTouchStart={e => { setCardSwipeState(s => ({ ...s, [exp.id]: { ...s[exp.id], startX: e.touches[0].clientX, x: 0 } })); }}
                                onMouseDown={e => { setCardSwipeState(s => ({ ...s, [exp.id]: { ...s[exp.id], startX: e.clientX, x: 0, isDragging: true } })); }}
                                onTouchMove={e => {
                                  const dx = e.touches[0].clientX - (cardSwipeState[exp.id]?.startX || 0);
                                  setCardSwipeState(s => ({ ...s, [exp.id]: { ...s[exp.id], x: Math.max(-90, Math.min(90, dx)) } }));
                                }}
                                onMouseMove={e => {
                                  if (!cardSwipeState[exp.id]?.isDragging) return;
                                  const dx = e.clientX - (cardSwipeState[exp.id]?.startX || 0);
                                  setCardSwipeState(s => ({ ...s, [exp.id]: { ...s[exp.id], x: Math.max(-90, Math.min(90, dx)) } }));
                                }}
                                onMouseUp={() => {
                                  if (!cardSwipeState[exp.id]?.isDragging) return;
                                  const dx = cardSwipeState[exp.id]?.x || 0;
                                  if (dx < -60) deleteExp(exp.id);
                                  else if (dx > 60) { /* marquer révisée */ }
                                  setCardSwipeState(s => ({ ...s, [exp.id]: { ...s[exp.id], x: 0, isDragging: false } }));
                                }}
                                onMouseLeave={() => {
                                  if (!cardSwipeState[exp.id]?.isDragging) return;
                                  setCardSwipeState(s => ({ ...s, [exp.id]: { ...s[exp.id], x: 0, isDragging: false } }));
                                }}
                                onTouchEnd={() => {
                                  const dx = cardSwipeState[exp.id]?.x || 0;
                                  if (dx < -60) deleteExp(exp.id);
                                  else if (dx > 60) { /* marquer révisée */ }
                                  setCardSwipeState(s => ({ ...s, [exp.id]: { ...s[exp.id], x: 0 } }));
                                }}
                              >
                                {/* Fond rouge / bleu */}
                                <div style={{ position: "absolute", inset: 0, display: "flex" }}>
                                  <div style={{ width: 90, background: "#B91C1C", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>🗑️ Suppr.</div>
                                  <div style={{ flex: 1 }} />
                                  <div style={{ width: 90, background: "#185FA5", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✅ OK</div>
                                </div>
                                {/* Contenu glissant */}
                                <div style={{ padding: "10px 16px", background: theme.inputBg, display: "flex", alignItems: "center", gap: 8, transform: `translateX(${swipeDx}px)`, transition: swipeDx === 0 ? "transform 0.3s ease" : "none", position: "relative" }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono'", flex: 1 }}>{lvl >= 7 ? "✅ Maîtrisée" : `📅 ${formatDate(exp.nextReview)}`}</span>
                                  <button onClick={() => startEdit(exp)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.cardBg, color: theme.textMuted, fontSize: 11, cursor: "pointer" }}>✏️ Éditer</button>
                                  <button onClick={() => { setCmdPaletteCard(exp); setCmdPaletteOpen(true); setCmdPaletteQuery(""); }} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.cardBg, color: theme.textMuted, fontSize: 11, cursor: "pointer" }}>⌘ Plus</button>
                                  <span style={{ fontSize: 10, color: theme.textMuted, opacity: 0.6 }}>← glisser →</span>
                                </div>
                              </div>
                            );

                            /* ── Concept 4 : Accordéon (géré dans le parent, ici panneau actions) ── */
                            if (cardsActionMode === "accordion" && isAccordionOpen) return (
                              <div style={{ borderTop: `1px solid ${theme.border}` }}>
                                <button onClick={() => setCardAccordionOpen(null)} style={{ width: "100%", padding: "10px 16px", background: theme.inputBg, border: "none", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: theme.textMuted, fontSize: 12, fontWeight: 600 }}>
                                  <span style={{ flex: 1, textAlign: "left" }}>{lvl >= 7 ? "✅ Maîtrisée" : `📅 ${formatDate(exp.nextReview)}`}</span>
                                  <span style={{ transition: "transform 0.2s", transform: "rotate(180deg)" }}>▾</span>
                                </button>
                                <div style={{ padding: "12px 16px 14px", background: theme.inputBg, borderTop: `1px solid ${theme.border}`, animation: "fadeUp 0.18s ease" }}>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                                    {[
                                      { icon: "✏️", label: "Éditer", fn: () => startEdit(exp) },
                                      { icon: "✨", label: "IA", fn: () => { startEdit(exp); setAiPrompt(exp.front); } },
                                      { icon: "🔊", label: "Son", fn: () => addToPlaylist(exp) },
                                      { icon: "⚔️", label: "Duel", fn: () => startDuel(exp) },
                                      { icon: "⚗️", label: "Variantes", fn: () => generateVariants(exp) },
                                      { icon: isFortress ? "🛡️" : "🔓", label: isFortress ? "Protégée" : "Protéger", fn: () => toggleFortress(exp.id) },
                                      { icon: "⌘", label: "Palette", fn: () => { setCmdPaletteCard(exp); setCmdPaletteOpen(true); setCmdPaletteQuery(""); } },
                                      { icon: "🗑️", label: "Suppr.", fn: () => deleteExp(exp.id), danger: true },
                                    ].map(a => (
                                      <button key={a.label} onClick={a.fn} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 4px", borderRadius: 8, border: `1px solid ${a.danger ? "#FECACA" : theme.border}`, background: a.danger ? "#FEF2F2" : theme.cardBg, color: a.danger ? "#EF4444" : theme.textMuted, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                        <span style={{ fontSize: 17 }}>{a.icon}</span>{a.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );

                            return null;
                          })()}
                        </div>
                      );
                    };

                    if (cardsSort === "level") {
                      const levels = [
                        { lvl: 0, label: "Niveau 0 (Nouveau)" },
                        { lvl: 1, label: "Niveau 1" },
                        { lvl: 2, label: "Niveau 2" },
                        { lvl: 3, label: "Niveau 3" },
                        { lvl: 4, label: "Niveau 4" },
                        { lvl: 5, label: "Niveau 5" },
                        { lvl: 6, label: "Niveau 6" },
                        { lvl: 7, label: "Maîtrisé (Niv. 7+)" },
                      ];

                      return (
                        <div className="kanban-swimlanes" style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 24, alignItems: "flex-start", scrollSnapType: "x mandatory", width: "100%" }}>
                          {levels.map((l, i) => {
                            const colCards = filteredExps.filter(e => {
                              if (l.lvl === 7) return (e.level || 0) >= 7;
                              return (e.level || 0) === l.lvl;
                            });
                            if (colCards.length === 0) return null;
                            return (
                              <div key={l.lvl} style={{ flex: "0 0 340px", scrollSnapAlign: "start", background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(77,107,254,0.05)", borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 12, border: `1px solid ${theme.border}`, animation: `fadeUp 0.4s ease forwards`, animationDelay: `${i * 0.05}s`, opacity: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
                                  <div style={{ fontSize: 13, fontWeight: 800, color: l.lvl >= 7 ? "#22C55E" : theme.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>{l.label}</div>
                                  <div style={{ background: l.lvl >= 7 ? "#22C55E22" : theme.highlight + "22", color: l.lvl >= 7 ? "#22C55E" : theme.highlight, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 800 }}>{colCards.length}</div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                  {colCards.map(exp => renderCard(exp))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    if (cardsSort === "due") {
                      const tdy = today();
                      const tmrw = addDays(tdy, 1);
                      const in7days = addDays(tdy, 7);

                      const swimlanes = [
                        { id: "late", label: "🔴 En retard", filter: e => e.nextReview < tdy && (e.level || 0) < 7 },
                        { id: "today", label: "⚡ Aujourd'hui", filter: e => e.nextReview === tdy && (e.level || 0) < 7 },
                        { id: "tomorrow", label: "📅 Demain", filter: e => e.nextReview === tmrw && (e.level || 0) < 7 },
                        { id: "week", label: "📆 Cette semaine", filter: e => e.nextReview > tmrw && e.nextReview <= in7days && (e.level || 0) < 7 },
                        { id: "later", label: "🧘 Plus tard", filter: e => e.nextReview > in7days && (e.level || 0) < 7 },
                        { id: "mastered", label: "✅ Maîtrisé", filter: e => (e.level || 0) >= 7 },
                      ];

                      return (
                        <div className="kanban-swimlanes" style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 24, alignItems: "flex-start", scrollSnapType: "x mandatory", width: "100%" }}>
                          {swimlanes.map((l, i) => {
                            const colCards = filteredExps.filter(l.filter);
                            if (colCards.length === 0) return null;
                            return (
                              <div key={l.id} style={{ flex: "0 0 340px", scrollSnapAlign: "start", background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(77,107,254,0.05)", borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 12, border: `1px solid ${theme.border}`, animation: `fadeUp 0.4s ease forwards`, animationDelay: `${i * 0.05}s`, opacity: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
                                  <div style={{ fontSize: 13, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>{l.label}</div>
                                  <div style={{ background: theme.highlight + "22", color: theme.highlight, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 800 }}>{colCards.length}</div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                  {colCards.map(exp => renderCard(exp))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    if (cardsActionMode === "swipe") {
                      return (
                        <div style={{ display: "flex", justifyContent: "center", position: "relative", minHeight: 460, marginTop: 40, width: "100%", overflow: "hidden", paddingBottom: 60 }}>
                          {filteredExps.map((exp, i) => {
                            if (i > 4) return null; // Show only top 5 cards
                            const isTop = i === 0;
                            return (
                              <div key={exp.id} style={{
                                position: isTop ? "relative" : "absolute",
                                top: isTop ? 0 : i * 14,
                                zIndex: 10 - i,
                                transform: `scale(${1 - i * 0.04})`,
                                opacity: i < 4 ? 1 : 0,
                                pointerEvents: isTop ? "auto" : "none",
                                width: "100%", maxWidth: 440,
                                transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
                              }}>
                                {renderCard(exp)}
                              </div>
                            );
                          }).reverse()}
                        </div>
                      );
                    }

                    return (
                      <div style={{ position: "relative" }}>
                        <style>{`
                        .smart-grid {
                          display: grid;
                          grid-template-columns: 1fr;
                          gap: 40px 16px;
                          width: 100%;
                          align-items: start;
                        }
                        .smart-full { grid-column: 1 / -1 !important; }
                        @media (min-width: 640px) {
                          .smart-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
                          .smart-big { grid-column: span 6; }
                          .smart-small { grid-column: span 3; }
                        }
                        @media (min-width: 1024px) {
                          .smart-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
                          /* Grandes fiches : 2 par ligne (span 3 sur 6) */
                          .smart-big { grid-column: span 3; }
                          /* Petites fiches : 3 par ligne (span 2 sur 6) */
                          .smart-small { grid-column: span 2; }
                        }
                        @media (min-width: 1536px) {
                          .smart-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); }
                          /* Grandes : 2/ligne (span 6) — Petites : 3/ligne (span 4) */
                          .smart-big { grid-column: span 6; }
                          .smart-small { grid-column: span 4; }
                        }
                        .smart-card { min-width: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; }
                        /* Empêche le débordement du contenu (code/tableaux) */
                        .smart-card pre, .smart-card table { max-width: 100%; }
                      `}</style>
                        <div className="smart-grid">
                          {filteredExps.slice(0, visibleCardsCount).map(exp => renderCard(exp))}
                        </div>
                        {filteredExps.length > visibleCardsCount && (
                          <div ref={loadMoreCardsRef} style={{ height: "20px", marginTop: "20px" }} />
                        )}
                      </div>
                    );
                  })()}

                  {/* Fiches pièges affichées en bas */}
                  {Array.isArray(cardsFakeCards) && cardsFakeCards.length > 0 && (
                    <div style={{ marginTop: 32, background: isDarkMode ? "rgba(255,255,255,0.05)" : "#FFF7ED", borderRadius: 20, padding: "20px 24px", border: `2px solid ${theme.highlight}` }}>
                      <h3 style={{ color: theme.highlight, marginTop: 0 }}>🧪 Fiches pièges — Trouve les erreurs !</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
                        {cardsFakeCards.map((fc, i) => (
                          <div key={fc.id || i} style={{ background: theme.cardBg, borderRadius: 14, padding: "16px", border: `1px solid ${theme.border}` }}>
                            <div style={{ fontWeight: 800, color: theme.text }}>{fc.front}</div>
                            <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 6 }}>{fc.back}</div>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setCardsFakeCards([])} style={{ marginTop: 12, background: "none", border: "none", color: theme.highlight, cursor: "pointer" }}>✕ Fermer</button>
                    </div>
                  )}

                  {/* ══ EXPANSION HOLOGRAPHIQUE (DEEP DIVE) ══ */}
                  {expandedCard && (() => {
                    const lvl = expandedCard.level || 0;
                    const catColor = categories.find((c) => c.name === expandedCard.category)?.color || "#4D6BFE";
                    const health = getCardHealth(expandedCard);
                    const history = expandedCard.reviewHistory || [];

                    return (
                      <div
                        onClick={() => setExpandedCard(null)}
                        style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.3s ease", padding: 20 }}
                      >
                        <div onClick={e => e.stopPropagation()} style={{ animation: "flowCardEnter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both", width: "100%", maxWidth: 640 }}>
                          <HoloCard theme={theme} glowColor={catColor} style={{ background: isDarkMode ? "rgba(15,23,42,0.8)" : "rgba(255,255,255,0.9)", border: `1px solid ${catColor}50`, borderRadius: 32, padding: "36px", boxShadow: `0 30px 80px rgba(0,0,0,0.4), 0 0 40px ${catColor}30` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                              <span style={{ padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 800, background: catColor + "22", color: catColor, textTransform: "uppercase", letterSpacing: 1 }}>{expandedCard.category}</span>
                              <button onClick={() => setExpandedCard(null)} style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 24, cursor: "pointer" }}>✕</button>
                            </div>

                            <div style={{ fontSize: 32, fontWeight: 900, color: theme.text, marginBottom: 16, lineHeight: 1.2 }}>{expandedCard.front}</div>

                            <div style={{ background: isDarkMode ? "rgba(77,107,254,0.2)" : "rgba(255,255,255,0.5)", padding: 20, borderRadius: 20, marginBottom: 24, border: `1px solid ${theme.border}` }}>
                              <div style={{ fontSize: 16, color: theme.text, lineHeight: 1.6 }}>
                                <GodTierContent text={expandedCard.back} theme={theme} isDarkMode={isDarkMode} />
                              </div>
                              {expandedCard.example && (
                                <div style={{ marginTop: 16, padding: "12px 16px", background: theme.cardBg, borderRadius: 12, fontSize: 14, color: theme.textMuted, fontStyle: "italic", borderLeft: `3px solid ${catColor}` }}>
                                  <GodTierContent text={expandedCard.example} theme={theme} isDarkMode={isDarkMode} />
                                </div>
                              )}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                              <div style={{ background: theme.inputBg, padding: 16, borderRadius: 16, border: `1px solid ${theme.border}` }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, marginBottom: 8, letterSpacing: 1 }}>SANTÉ FSRS</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ fontSize: 24 }}>{health.status === "healthy" ? "💚" : health.status === "shaky" ? "💛" : health.status === "trap" ? "💔" : "🤍"}</div>
                                  <div>
                                    <div style={{ fontWeight: 800, color: health.color, fontSize: 14 }}>{health.label}</div>
                                    <div style={{ fontSize: 12, color: theme.textMuted }}>Niveau {lvl} · EF: {(expandedCard.easeFactor || 2.5).toFixed(1)}</div>
                                  </div>
                                </div>
                              </div>

                              <div style={{ background: theme.inputBg, padding: 16, borderRadius: 16, border: `1px solid ${theme.border}` }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, marginBottom: 8, letterSpacing: 1 }}>TIMELINE APPRENTISSAGE</div>
                                {history.length === 0 ? (
                                  <div style={{ fontSize: 12, color: theme.textMuted }}>Aucune révision</div>
                                ) : (
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", height: "100%", alignContent: "center" }}>
                                    {history.slice(-14).map((h, i) => (
                                      <div key={i} title={`${h.date} - Note: ${h.q}`} style={{
                                        width: 14, height: 14, borderRadius: "50%",
                                        background: h.q === 0 ? "#EF4444" : h.q === 1 ? "#F59E0B" : "#10B981",
                                        boxShadow: `0 0 8px ${h.q === 0 ? "#EF4444" : h.q === 1 ? "#F59E0B" : "#10B981"}80`
                                      }} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 12 }}>
                              <button onClick={() => { startDuel(expandedCard); setExpandedCard(null); }} className="btn-glow hov" style={{ flex: 1, padding: "16px", background: "linear-gradient(135deg, #4D6BFE, #1E3A8A)", color: "white", border: "none", borderRadius: 16, fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                <span style={{ fontSize: 20 }}>⚔️</span> Duel IA Instantané
                              </button>
                              <button onClick={() => { startEdit(expandedCard); setExpandedCard(null); }} className="hov" style={{ padding: "16px", background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>
                                ✏️ Éditer
                              </button>
                            </div>
                          </HoloCard>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ══ DYNAMIC ISLAND : GOD HAND ══ */}
                  {selectedCards.length > 0 && (
                    <div style={{
                      position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
                      zIndex: 100000, display: "flex", alignItems: "center", gap: 12,
                      background: isDarkMode ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.95)",
                      backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
                      padding: "12px 24px", borderRadius: 999, border: `1px solid ${theme.highlight}50`,
                      boxShadow: `0 30px 60px rgba(0,0,0,0.4), 0 0 0 2px ${theme.highlight}20 inset`,
                      animation: "fadeUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 16, borderRight: `1px solid ${theme.border}` }}>
                        <span style={{ fontSize: 24 }}>🖐️</span>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: 13, fontWeight: 900, color: theme.text }}>God Hand</span>
                          <span style={{ fontSize: 11, color: theme.highlight, fontWeight: 700 }}>{selectedCards.length} sél.</span>
                        </div>
                      </div>
                      <button onClick={godHandGenerateStory} className="hov" style={{ background: "transparent", border: "none", color: theme.text, cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 16 }}>🧬</span> <span className="hide-mobile">Histoire</span>
                      </button>
                      <button onClick={godHandCreateMCQ} className="hov" style={{ background: "transparent", border: "none", color: theme.text, cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 16 }}>⚔️</span> <span className="hide-mobile">QCM</span>
                      </button>
                      <button onClick={godHandMerge} className="hov" style={{ background: "transparent", border: "none", color: theme.text, cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 16 }}>🔀</span> <span className="hide-mobile">Fusionner</span>
                      </button>
                      <button onClick={godHandDelete} className="hov" style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 16 }}>🗑️</span> <span className="hide-mobile">Incinérer</span>
                      </button>
                      <button onClick={() => setSelectedCards([])} style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted, cursor: "pointer", marginLeft: 8 }}>✕</button>
                    </div>
                  )}
                </>
              )}

              {/* MODE DUEL EN OVERLAY */}
              {cardsDuelActive && cardsDuelCard && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                  <div style={{ background: theme.cardBg, borderRadius: 24, padding: "32px", maxWidth: 520, width: "100%", textAlign: "center" }}>
                    <h2 style={{ color: theme.text, marginBottom: 4 }}>⚔️ Duel</h2>
                    <div style={{ fontSize: 15, fontWeight: 700, color: theme.highlight, marginBottom: 4 }}>{cardsDuelCard.front}</div>
                    <p style={{ color: theme.textMuted, fontSize: 13, marginBottom: 20 }}>Chaque joueur tape sa réponse puis valide. Les réponses sont cachées jusqu'à la fin.</p>
                    <div style={{ display: "flex", gap: 16 }}>
                      {/* Joueur 1 */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#4D6BFE", marginBottom: 6 }}>JOUEUR 1</div>
                        {cardsDuelPlayer1 === null ? (
                          <>
                            <input
                              value={cardsDuelInput1}
                              onChange={e => setCardsDuelInput1(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && cardsDuelInput1.trim()) handleDuelAnswer(1, cardsDuelInput1.trim()); }}
                              placeholder="Ta réponse..."
                              style={{ width: "100%", padding: "10px 12px", background: theme.inputBg, border: `2px solid #4D6BFE`, borderRadius: 10, fontSize: 13, color: theme.text, marginBottom: 8, boxSizing: "border-box" }}
                            />
                            <button onClick={() => { if (cardsDuelInput1.trim()) handleDuelAnswer(1, cardsDuelInput1.trim()); }}
                              style={{ width: "100%", padding: "10px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
                              ✅ Valider
                            </button>
                          </>
                        ) : (
                          <div style={{ padding: "10px 14px", background: "#4D6BFE22", borderRadius: 10, fontWeight: 700, color: "#4D6BFE" }}>✅ Réponse envoyée</div>
                        )}
                      </div>
                      {/* Joueur 2 */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#EF4444", marginBottom: 6 }}>JOUEUR 2</div>
                        {cardsDuelPlayer2 === null ? (
                          <>
                            <input
                              value={cardsDuelInput2}
                              onChange={e => setCardsDuelInput2(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && cardsDuelInput2.trim()) handleDuelAnswer(2, cardsDuelInput2.trim()); }}
                              placeholder="Ta réponse..."
                              style={{ width: "100%", padding: "10px 12px", background: theme.inputBg, border: `2px solid #EF4444`, borderRadius: 10, fontSize: 13, color: theme.text, marginBottom: 8, boxSizing: "border-box" }}
                            />
                            <button onClick={() => { if (cardsDuelInput2.trim()) handleDuelAnswer(2, cardsDuelInput2.trim()); }}
                              style={{ width: "100%", padding: "10px", background: "#EF4444", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
                              ✅ Valider
                            </button>
                          </>
                        ) : (
                          <div style={{ padding: "10px 14px", background: "#EF444422", borderRadius: 10, fontWeight: 700, color: "#EF4444" }}>✅ Réponse envoyée</div>
                        )}
                      </div>
                    </div>
                    {/* Révéler la bonne réponse une fois les deux joueurs ont répondu */}
                    {cardsDuelPlayer1 !== null && cardsDuelPlayer2 !== null && (
                      <div style={{ marginTop: 20, padding: "14px 16px", background: theme.inputBg, borderRadius: 14, textAlign: "left" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, marginBottom: 6 }}>RÉPONSE CORRECTE</div>
                        <div style={{ fontSize: 14, color: theme.text, fontWeight: 600 }}>{cardsDuelCard.back}</div>
                        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                          <div style={{ flex: 1, textAlign: "center", fontSize: 13, color: "#4D6BFE" }}>J1 : {cardsDuelPlayer1}</div>
                          <div style={{ flex: 1, textAlign: "center", fontSize: 13, color: "#EF4444" }}>J2 : {cardsDuelPlayer2}</div>
                        </div>
                      </div>
                    )}
                    <button onClick={() => setCardsDuelActive(false)} style={{ marginTop: 20, background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 13 }}>✕ Annuler</button>
                  </div>
                </div>
              )}

              {/* ══ COMMAND PALETTE OVERLAY (⌘K) ══ */}
              {cmdPaletteOpen && cmdPaletteCard && (
                <div onClick={() => setCmdPaletteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}>
                  <div onClick={e => e.stopPropagation()} style={{ background: isDarkMode ? "#0D1535" : "#FFFFFF", border: `1px solid ${theme.border}`, borderRadius: 20, overflow: "hidden", width: "100%", maxWidth: 480, boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}>
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: 18, color: theme.textMuted }}>⌘</span>
                      <input
                        autoFocus
                        value={cmdPaletteQuery}
                        onChange={e => setCmdPaletteQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === "Escape") setCmdPaletteOpen(false); }}
                        placeholder="Chercher une action..."
                        style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, color: theme.text, fontFamily: "'JetBrains Mono', monospace" }}
                      />
                      <kbd style={{ fontSize: 10, color: theme.textMuted, padding: "2px 6px", border: `1px solid ${theme.border}`, borderRadius: 4, fontFamily: "'JetBrains Mono'" }}>Esc</kbd>
                    </div>
                    {/* Fiche ciblée */}
                    <div style={{ padding: "8px 16px", background: theme.inputBg, borderBottom: `1px solid ${theme.border}` }}>
                      <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>FICHE SÉLECTIONNÉE</div>
                      <div style={{ fontSize: 13, color: theme.text, fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cmdPaletteCard.front}</div>
                    </div>
                    {/* Actions filtrées */}
                    {(() => {
                      const allActions = [
                        { group: "Actions IA", icon: "✨", label: "Améliorer avec l'IA", fn: () => { startEdit(cmdPaletteCard); setAiPrompt(cmdPaletteCard.front); } },
                        { group: "Actions IA", icon: "⚗️", label: "Générer des variantes", fn: () => generateVariants(cmdPaletteCard) },
                        { group: "Actions IA", icon: "🔊", label: "Écouter la fiche", fn: () => addToPlaylist(cmdPaletteCard) },
                        { group: "Gestion", icon: "✏️", label: "Éditer", fn: () => startEdit(cmdPaletteCard) },
                        { group: "Gestion", icon: "⚔️", label: "Lancer un Duel", fn: () => startDuel(cmdPaletteCard) },
                        { group: "Gestion", icon: "🛡️", label: "Protéger / Fortress", fn: () => toggleFortress(cmdPaletteCard.id) },
                        { group: "Danger", icon: "🗑️", label: "Supprimer", fn: () => deleteExp(cmdPaletteCard.id), danger: true },
                      ];
                      const filtered = cmdPaletteQuery.trim()
                        ? allActions.filter(a => a.label.toLowerCase().includes(cmdPaletteQuery.toLowerCase()) || a.group.toLowerCase().includes(cmdPaletteQuery.toLowerCase()))
                        : allActions;
                      const groups = [...new Set(filtered.map(a => a.group))];
                      return (
                        <div style={{ maxHeight: 320, overflowY: "auto" }}>
                          {groups.map(g => (
                            <div key={g}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, padding: "8px 16px 2px", letterSpacing: 1 }}>{g.toUpperCase()}</div>
                              {filtered.filter(a => a.group === g).map(a => (
                                <button key={a.label} onClick={() => { a.fn(); setCmdPaletteOpen(false); setCmdPaletteCard(null); }}
                                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 16px", background: "none", border: "none", color: a.danger ? "#EF4444" : theme.text, fontSize: 14, cursor: "pointer", textAlign: "left" }}
                                  onMouseEnter={e => e.currentTarget.style.background = theme.inputBg}
                                  onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                  <span style={{ fontSize: 17, width: 24, textAlign: "center" }}>{a.icon}</span>
                                  <span style={{ flex: 1 }}>{a.label}</span>
                                </button>
                              ))}
                              {g !== groups[groups.length - 1] && <div style={{ height: 1, background: theme.border, margin: "2px 0" }} />}
                            </div>
                          ))}
                          {filtered.length === 0 && (
                            <div style={{ padding: "24px 16px", textAlign: "center", color: theme.textMuted, fontSize: 13 }}>Aucune action trouvée pour « {cmdPaletteQuery} »</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Fermeture kebab au clic extérieur avec Blur ("Deep Dive") */}
              {cardKebabOpen && (
                <div onClick={() => setCardKebabOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", animation: "fadeIn 0.3s ease" }} />
              )}
            </div>
          )}

          {view === "practice" && (
            <ErrorBoundary scope="EnglishPractice">
              <EnglishPractice
                callClaude={callClaude}
                getNextGroqKey={getNextGroqKey}
                storage={storage}
                expressions={expressions}
                setExpressions={setExpressions}
                setStats={setStats}
                showToast={showToast}
                today={today}
                categories={categories}
                theme={theme}
                isDarkMode={isDarkMode}
              />
            </ErrorBoundary>
          )}

          {view === "certifications" && (
            <ErrorBoundary scope="CertificationsDashboard">
              <CertificationsDashboard
                callClaude={callClaude}
                onPrepareCertif={(certName) => {
                  localStorage.setItem('astrale_certif_intent', certName);
                  setView("practice");
                  showToast("Sujet de certification injecté dans l'Académie !");
                }}
                isMobile={isMobile}
              />
            </ErrorBoundary>
          )}

          {view === "opensource" && (
            <OpenSourceRadar
              callClaude={callClaude}
              onPreparePR={(repoName) => {
                localStorage.setItem('astrale_opensource_intent', repoName);
                setView("practice");
                showToast(`Préparation PR pour ${repoName} injectée !`);
              }}
              isMobile={isMobile}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
            LABORATOIRE GOD LEVEL (Autonome)
        ══════════════════════════════════════════════════════════════════ */}
          {view === "phantom" && (
            <div className="view-slide-up" style={{ padding: "0 20px" }}>
              <PhantomRecruiter
                callClaude={callClaude}
                theme={theme}
                isDarkMode={isDarkMode}
                onBack={() => setView("dashboard")}
              />
            </div>
          )}

          {view === "oracle" && (
            <div className="view-slide-up" style={{ padding: "0 20px" }}>
              <TechOracle
                callClaude={callClaude}
                theme={theme}
                isDarkMode={isDarkMode}
                onBack={() => setView("dashboard")}
                setView={setView}
              />
            </div>
          )}

          {view === "veille" && (
            <div className="view-slide-up" style={{ padding: "0 20px" }}>
              <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: theme.textMuted }}>Chargement de la veille tech...</div>}>
                <ErrorBoundary scope="TechIntelView">
                  <TechIntelView
                    callClaude={callClaude}
                    isDarkMode={isDarkMode}
                    theme={theme}
                    onPickArticle={(item) => {
                      if (item?.url && typeof window !== "undefined") {
                        window.open(item.url, "_blank", "noopener,noreferrer");
                      }
                    }}
                    onCreateCard={(item) => {
                      try {
                        const card = {
                          id: `veille_${Date.now()}`,
                          front: item.title,
                          back: item.summary || item.title,
                          example: item.url || "",
                          category: "📰 Veille tech",
                          level: 0,
                          nextReview: today(),
                          easeFactor: 2.5,
                          interval: 1,
                          _source: item.source,
                          _url: item.url,
                        };
                        setExpressions(prev => [card, ...prev]);
                        showToast?.("Fiche créée depuis la veille", "success");
                      } catch (e) {
                        showToast?.("Erreur création fiche", "error");
                      }
                    }}
                  />
                </ErrorBoundary>
              </Suspense>
            </div>
          )}

          {view === "lab" && (
            <ErrorBoundary scope="Lab">
              <Lab
                theme={theme}
                isDarkMode={isDarkMode}
                stats={stats}
                expressions={expressions}
                setExpressions={setExpressions}
                setStats={setStats}
                categories={categories}
                onAddCards={addCardsFromLab}
                onShowToast={showToast}
                PomodoroStudy={PomodoroStudy}
                AskMyDocs={AskMyDocs}
                pomodoroProps={{ theme, showToast, onPhaseChange: (phase) => { if (phase.id === "flash") setView("review"); } }}
                askMyDocsProps={{ theme, callClaude, docs: (typeof labMultiFiles !== "undefined" ? labMultiFiles : []).map(f => ({ name: f.name, content: f.text || f.content })) }}

                showToast={showToast}
                storage={storage}
                callClaude={callClaude}
                getNextGroqKey={getNextGroqKey}
                today={today}
                generateGraph={generateGraph}
                generateConfusionDestroyer={generateConfusionDestroyer}
                detectPrerequisites={detectPrerequisites}
                generateTimeline={generateTimeline}
              />
            </ErrorBoundary>
          )}
          {/* ══════════════════════════════════════════════════════════════════
            VUE STATISTIQUES
        ══════════════════════════════════════════════════════════════════ */}
          {view === "stats" && (
            <GodTierStats
              isDarkMode={isDarkMode}
              theme={theme}
              stats={stats}
              expressions={expressions}
              statsSessionHistory={statsSessionHistory}
              computeAllStats={computeAllStats}
              generateStatsAiReport={generateStatsAiReport}
              statsAiReportLoading={statsAiReportLoading}
              generateWeeklyDigest={generateWeeklyDigest}
              statsAiReport={statsAiReport}
              setStatsAiReport={setStatsAiReport}
              showToast={showToast}
              callClaude={callClaude}
              setExpressions={setExpressions}
              masteredCount={expressions.filter(e => e.level >= 7).length}
              powerLevel={powerLevel}
              statsDailyProgress={statsDailyProgress}
              statsModuleComparison={statsModuleComparison}
              statsDifficultyDistribution={statsDifficultyDistribution}
              statsTopDifficult={statsTopDifficult}
              statsDayOfWeekPerformance={statsDayOfWeekPerformance}
              statsRetentionCurve={statsRetentionCurve}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
    VUE BADGES – GOD LEVEL
══════════════════════════════════════════════════════════════════ */}
          {view === "badges" && (() => {
            // ── Données de progression pour les barres ──
            const mastered = expressions.filter(e => e.level >= 7).length;
            const dueCount = expressions.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7).length;

            // ── Système de rareté ──
            const RARITY = {
              commun: { label: "Commun", color: "var(--mm-fg-muted)", bg: isDarkMode ? "#2A1400" : "var(--mm-bg-elev)", glow: "none" },
              rare: { label: "Rare", color: "#4D6BFE", bg: isDarkMode ? "#1E3A5F" : "#EEF2FF", glow: "0 0 12px #4D6BFE40" },
              epique: { label: "Épique", color: "#7B93FF", bg: isDarkMode ? "#2E1B5B" : "#EEF2FF", glow: "0 0 16px #7B93FF50" },
              legendaire: { label: "Légendaire", color: "#6B82F5", bg: isDarkMode ? "#2D1F00" : "#E8EEFF", glow: "0 0 24px #6B82F560" },
            };

            // ── Badges définis dans gamification.js ──

            const badgeState = {
              totalCards: expressions.length,
              streak: stats.streak,
              mastered,
              dueCount,
              totalReviews: stats.totalReviews,
              aiGenerated: stats.aiGenerated,
              examsDone: stats.examsDone,
              lateNightSessions: stats.lateNightSessions || 0,
              earlyMorningSessions: stats.earlyMorningSessions || 0,
              bestDayReviews: stats.bestDayReviews || 0,
              modulesCount: categories?.length || 0,
              pdfsAnalyzed: stats.pdfsAnalyzed || 0,
            };

            const CATS = ["Création", "Streak", "Maîtrise", "Révisions", "Examens", "IA", "Héritage"];

            // ── Stats résumé haut de page ──
            const earnableBadges = BADGES.filter(b => b.cat !== "Héritage" || unlockedBadges.includes(b.id));
            const unlockedAll = earnableBadges.filter(b => unlockedBadges.includes(b.id));
            const nextBadge = earnableBadges.find(b => !unlockedBadges.includes(b.id) && b.progress);
            const nextProg = nextBadge ? nextBadge.progress(badgeState) : null;

            // ── Couleurs rareté pour le résumé ──
            const rarityCount = { legendaire: 0, epique: 0, rare: 0, commun: 0 };
            unlockedAll.forEach(b => rarityCount[b.rarity]++);

            return (
              <div style={{ animation: "fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}>

                {/* ── Header Astral ── */}
                <div style={{ marginBottom: 40, position: "relative", padding: "40px 30px", borderRadius: 32, overflow: "hidden", background: isDarkMode ? "linear-gradient(135deg, rgba(15,23,42,0.9), rgba(2,6,23,0.95))" : "linear-gradient(135deg, #1E3A8A, #312E81)", boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
                  {/* Effets Astraux */}
                  <div style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", background: "conic-gradient(from 0deg, transparent, rgba(77, 107, 254,0.15), transparent)", animation: "spin 20s linear infinite", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 300, height: 300, background: "radial-gradient(circle, rgba(77, 107, 254,0.4) 0%, transparent 70%)", filter: "blur(50px)", pointerEvents: "none" }} />

                  <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
                    <div>
                      <h1 style={{ fontSize: 36, fontWeight: 900, color: "white", margin: 0, textShadow: "0 4px 20px rgba(77, 107, 254,0.6)", letterSpacing: "-1px" }}>✨ Constellation des Hauts Faits</h1>
                      <p style={{ color: "rgba(255,255,255,0.7)", marginTop: 8, fontSize: 16 }}>
                        {unlockedAll.length} / {earnableBadges.length} étoiles éveillées dans ton cosmos personnel.
                      </p>
                    </div>
                    <div style={{ fontSize: 48, animation: "float 4s ease-in-out infinite", filter: "drop-shadow(0 0 20px rgba(77, 107, 254,0.8))" }}>🏆</div>
                  </div>
                </div>

                {/* ── Bandeau stats ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 40 }}>
                  {[
                    { label: "Légendaires", count: rarityCount.legendaire, color: "#4D6BFE", icon: "👑", bg: isDarkMode ? "rgba(77, 107, 254,0.1)" : "#F3E8FF" },
                    { label: "Épiques", count: rarityCount.epique, color: "#4D6BFE", icon: "💜", bg: isDarkMode ? "rgba(77, 107, 254,0.1)" : "#E0E7FF" },
                    { label: "Rares", count: rarityCount.rare, color: "#3B82F6", icon: "💙", bg: isDarkMode ? "rgba(59,130,246,0.1)" : "#DBEAFE" },
                    { label: "Communs", count: rarityCount.commun, color: "var(--mm-fg-muted)", icon: "⚪", bg: isDarkMode ? "rgba(148,163,184,0.1)" : "var(--mm-bg-elev)" },
                  ].map(r => (
                    <div key={r.label} style={{ background: r.bg, border: `1px solid ${r.color}40`, borderRadius: 20, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, boxShadow: `0 4px 15px ${r.color}15`, transition: "transform 0.3s", cursor: "default" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-4px)"} onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
                      <span style={{ fontSize: 28 }}>{r.icon}</span>
                      <div>
                        <div style={{ fontWeight: 900, color: r.color, fontSize: 24, lineHeight: 1 }}>{r.count}</div>
                        <div style={{ fontSize: 13, color: isDarkMode ? "var(--mm-border-strong)" : "var(--mm-fg)", fontWeight: 700, marginTop: 4 }}>{r.label}</div>
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

                {/* ── Badges organisés en DEUX SECTIONS : Gagnés / À débloquer ── */}
                {(() => {
                  // Helper de rendu d'une carte badge (réutilisé dans les 2 sections)
                  const renderBadgeCard = (badge, index) => {
                    const isUnlocked = unlockedBadges.includes(badge.id);
                    const rar = RARITY[badge.rarity];
                    const prog = badge.progress ? badge.progress(badgeState) : null;
                    const pct = prog ? Math.round((prog.cur / prog.max) * 100) : 0;
                    const isHighTier = isUnlocked && (badge.rarity === "epique" || badge.rarity === "legendaire");
                    return (
                      <div key={badge.id} style={{
                        background: isUnlocked ? rar.bg : (isDarkMode ? "#0F1A3A" : "var(--mm-bg-elev)"),
                        border: `2px solid ${isUnlocked ? rar.color : theme.border}`,
                        borderRadius: 20,
                        padding: "20px 18px",
                        textAlign: "center",
                        filter: isUnlocked ? "none" : "grayscale(80%)",
                        transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        position: "relative",
                        boxShadow: isUnlocked ? rar.glow : "none",
                        overflow: "hidden",
                        animation: `fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                        animationDelay: `${index * 0.04}s`,
                        opacity: 0,
                      }} className={isUnlocked ? "card-hov" : ""}>
                        {isHighTier && (
                          <>
                            <div style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", background: `conic-gradient(from 0deg, transparent, ${rar.color}30, transparent)`, animation: "spin 10s linear infinite", pointerEvents: "none" }} />
                            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 50%, ${rar.color}20, transparent)`, pointerEvents: "none" }} />
                          </>
                        )}
                        <div style={{ position: "relative", zIndex: 1, opacity: isUnlocked ? 1 : 0.6 }}>
                          <div style={{ position: "absolute", top: -5, left: -6, fontSize: 10, fontWeight: 800, color: rar.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{rar.label}</div>
                          {isUnlocked && (<div style={{ position: "absolute", top: -5, right: -6, fontSize: 14 }}>✨</div>)}
                          <div style={{ fontSize: 44, margin: "18px 0 12px" }}>{badge.icon}</div>
                          <div style={{ fontWeight: 800, color: theme.text, fontSize: 14, marginBottom: 4 }}>{badge.label}</div>
                          <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, marginBottom: isUnlocked ? 0 : 12 }}>{badge.desc}</div>
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
                      </div>
                    );
                  };

                  // Partition de TOUS les badges visibles (Héritage = uniquement si déjà unlocked)
                  const allVisible = BADGES.filter(b => b.cat !== "Héritage" || unlockedBadges.includes(b.id));
                  const earned = allVisible.filter(b => unlockedBadges.includes(b.id));
                  const locked = allVisible.filter(b => !unlockedBadges.includes(b.id));

                  // Tri à l'intérieur des sections : par rareté décroissante puis par catégorie
                  const RARITY_ORDER = { legendaire: 0, epique: 1, rare: 2, commun: 3 };
                  const sortFn = (a, b) => {
                    const ra = RARITY_ORDER[a.rarity] ?? 99;
                    const rb = RARITY_ORDER[b.rarity] ?? 99;
                    if (ra !== rb) return ra - rb;
                    return (a.cat || "").localeCompare(b.cat || "");
                  };
                  earned.sort(sortFn);
                  locked.sort((a, b) => {
                    // Verrouillés : ceux dont la progression est la plus avancée en premier
                    const pa = a.progress ? a.progress(badgeState) : null;
                    const pb = b.progress ? b.progress(badgeState) : null;
                    const pctA = pa ? pa.cur / pa.max : 0;
                    const pctB = pb ? pb.cur / pb.max : 0;
                    if (pctB !== pctA) return pctB - pctA;
                    return sortFn(a, b);
                  });

                  const SectionHeader = ({ icon, title, count, total, accent }) => (
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, paddingBottom: 14, borderBottom: `2px solid ${accent}33` }}>
                      <div style={{ fontSize: 28 }}>{icon}</div>
                      <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: 22, fontWeight: 900, color: theme.text, margin: 0, letterSpacing: "-0.5px" }}>{title}</h2>
                        <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600, marginTop: 2 }}>{count} {total != null ? `/ ${total}` : ""} badge{count > 1 ? "s" : ""}</div>
                      </div>
                      <div style={{ background: `${accent}22`, color: accent, fontWeight: 900, fontSize: 16, padding: "8px 16px", borderRadius: 999, border: `1.5px solid ${accent}55` }}>
                        {total != null ? `${Math.round((count / Math.max(1, total)) * 100)}%` : count}
                      </div>
                    </div>
                  );

                  return (
                    <>
                      {/* ╔════════════ SECTION 1 : GAGNÉS ════════════╗ */}
                      <div style={{ marginBottom: 48 }}>
                        <SectionHeader icon="🏅" title="Badges gagnés" count={earned.length} total={allVisible.length} accent="#10B981" />
                        {earned.length === 0 ? (
                          <div style={{ padding: "40px 20px", textAlign: "center", background: theme.cardBg, borderRadius: 20, border: `1.5px dashed ${theme.border}`, color: theme.textMuted, fontSize: 14, fontWeight: 600 }}>
                            Aucun badge encore débloqué — continue à réviser, le premier va bientôt tomber ✨
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                              {earned.slice(0, visibleBadgesCount).map((b, i) => renderBadgeCard(b, i))}
                            </div>
                            {earned.length > visibleBadgesCount && (
                              <div style={{ textAlign: "center", marginTop: 24 }}>
                                <button onClick={() => setVisibleBadgesCount(v => v + 30)} style={{ background: isDarkMode ? "#1E293B" : "#F1F5F9", color: theme.text, border: "none", padding: "12px 24px", borderRadius: 999, fontWeight: 800, cursor: "pointer" }}>
                                  Voir plus de badges gagnés ({earned.length - visibleBadgesCount} restants)
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* ╔════════════ SECTION 2 : À DÉBLOQUER ════════════╗ */}
                      <div style={{ marginBottom: 36 }}>
                        <SectionHeader icon="🔒" title="À débloquer" count={locked.length} accent="#6B82F5" />
                        {locked.length === 0 ? (
                          <div style={{ padding: "40px 20px", textAlign: "center", background: theme.cardBg, borderRadius: 20, border: `1.5px dashed ${theme.border}`, color: theme.textMuted, fontSize: 14, fontWeight: 600 }}>
                            🎉 Tu as débloqué tous les badges disponibles. Légende absolue.
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                              {locked.slice(0, visibleLockedBadgesCount).map((b, i) => renderBadgeCard(b, i))}
                            </div>
                            {locked.length > visibleLockedBadgesCount && (
                              <div style={{ textAlign: "center", marginTop: 24 }}>
                                <button onClick={() => setVisibleLockedBadgesCount(v => v + 20)} style={{ background: isDarkMode ? "#1E293B" : "#F1F5F9", color: theme.text, border: "none", padding: "12px 24px", borderRadius: 999, fontWeight: 800, cursor: "pointer" }}>
                                  Voir plus à débloquer ({locked.length - visibleLockedBadgesCount} restants)
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
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
                  {["hub", "planner", "coach", "fusion"].map(tab => (
                    <button key={tab} onClick={() => setProjectSubView(tab)} style={{
                      padding: "8px 16px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer",
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
                      <input value={projectForm.title} onChange={e => setProjectForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Projet Java Spring Boot..." style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text, fontSize: 14 }} />
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Description</label>
                      <textarea value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} placeholder="Décris ton projet en quelques mots..." style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text, minHeight: 80, resize: "vertical" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Module lié</label>
                      <select value={projectForm.category} onChange={e => setProjectForm(f => ({ ...f, category: e.target.value }))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text }}>
                        <option value="">Aucun</option>
                        {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Date de rendu</label>
                      <input type="date" value={projectForm.dueDate} onChange={e => setProjectForm(f => ({ ...f, dueDate: e.target.value }))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Heures estimées</label>
                      <input type="number" min="1" max="200" value={projectForm.estimatedHours} onChange={e => setProjectForm(f => ({ ...f, estimatedHours: +e.target.value }))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Priorité</label>
                      <select value={projectForm.priority} onChange={e => setProjectForm(f => ({ ...f, priority: e.target.value }))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme.inputBg, border: `1.5px solid ${theme.border}`, borderRadius: 12, color: theme.text }}>
                        <option value="haute">🔴 Haute</option>
                        <option value="normale">🟡 Normale</option>
                        <option value="basse">🟢 Basse</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Couleur</label>
                        <input type="color" value={projectForm.color} onChange={e => setProjectForm(f => ({ ...f, color: e.target.value }))} style={{ width: "100%", height: 46, marginTop: 4, borderRadius: 12, border: `1.5px solid ${theme.border}`, padding: 4 }} />
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
                    <div style={{ textAlign: "center", padding: "80px 20px", background: isDarkMode ? "linear-gradient(135deg, rgba(15,23,42,0.8), rgba(2,6,23,0.9))" : "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(248,250,255,1))", borderRadius: 32, border: `1px solid ${isDarkMode ? "rgba(77,107,254,0.3)" : "rgba(77,107,254,0.2)"}`, position: "relative", overflow: "hidden", boxShadow: "0 20px 50px rgba(77,107,254,0.1)" }}>
                      {/* Astral background effects */}
                      <div style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", background: "conic-gradient(from 0deg, transparent, rgba(77,107,254,0.1), transparent)", animation: "spin 15s linear infinite", pointerEvents: "none" }} />
                      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 250, height: 250, background: "radial-gradient(circle, rgba(77,107,254,0.3) 0%, transparent 70%)", filter: "blur(40px)", pointerEvents: "none" }} />

                      <div style={{ fontSize: 70, marginBottom: 20, position: "relative", zIndex: 1, animation: "float 4s ease-in-out infinite", filter: "drop-shadow(0 10px 20px rgba(77,107,254,0.5))" }}>🚀</div>
                      <h3 style={{ color: theme.text, fontSize: 32, margin: "0 0 12px", fontWeight: 900, position: "relative", zIndex: 1, letterSpacing: "-0.5px" }}>L'Étincelle de Création</h3>
                      <p style={{ color: theme.textMuted, fontSize: 16, marginBottom: 32, maxWidth: 450, margin: "0 auto 32px", position: "relative", zIndex: 1, lineHeight: 1.6 }}>Il n'y a pas encore de projets dans cette dimension. Invoque ton premier projet et laisse l'IA orchestrer sa genèse tâche par tâche.</p>
                      <button onClick={() => setShowProjectForm(true)} style={{ padding: "16px 40px", background: "linear-gradient(135deg, #4D6BFE, #4D6BFE)", color: "white", border: "none", borderRadius: 100, fontWeight: 900, fontSize: 16, cursor: "pointer", position: "relative", zIndex: 1, boxShadow: "0 10px 30px rgba(77,107,254,0.4)", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" }} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05) translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1) translateY(0)"}>
                        ✨ Créer mon premier Projet
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 20 }}>
                      {projects.map(proj => {
                        const projectTasks = proj.tasks || [];
                        const progress = getProjectProgress(proj);
                        const daysLeft = getDaysUntil(proj.dueDate);
                        const isUrgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
                        const doneTasks = projectTasks.filter(t => t.done).length;
                        return (
                          <HoloCard key={proj.id} theme={theme} glowColor={isUrgent ? "#EF4444" : (proj.color || "#4D6BFE")} style={{
                            background: isDarkMode ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.95)",
                            borderRadius: 24, padding: 24,
                            border: `1px solid ${isUrgent ? "rgba(239,68,68,0.5)" : theme.border}`,
                            borderTop: `4px solid ${proj.color || "#4D6BFE"}`,
                            boxShadow: isUrgent ? "0 0 30px rgba(239,68,68,0.2)" : (isDarkMode ? "0 20px 40px rgba(0,0,0,0.4)" : "0 15px 35px rgba(77,107,254,0.08)"),
                            backdropFilter: "blur(20px)", transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
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
                                <span>{doneTasks}/{projectTasks.length} tâches</span>
                                <span style={{ fontWeight: 800, color: proj.color }}>{progress}%</span>
                              </div>
                              <div style={{ height: 8, background: theme.inputBg, borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${progress}%`, background: progress >= 100 ? "#4D6BFE" : proj.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                              </div>
                            </div>

                            {/* Tasks preview (top 3) */}
                            {projectTasks.length > 0 && (
                              <div style={{ marginBottom: 12 }}>
                                {projectTasks.slice(0, 3).map(task => (
                                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                                    <input type="checkbox" checked={task.done} onChange={() => toggleTask(proj.id, task.id)} style={{ accentColor: proj.color, cursor: "pointer" }} />
                                    <span style={{ fontSize: 12, color: task.done ? theme.textMuted : theme.text, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</span>
                                  </div>
                                ))}
                                {projectTasks.length > 3 && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>+{projectTasks.length - 3} autres tâches…</div>}
                              </div>
                            )}

                            {/* Actions */}
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button onClick={() => { setActiveProject(proj); setProjectSubView("detail"); }} style={{ flex: 1, padding: "8px", background: "#3451D1", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📋 Détail</button>
                              {!proj.decomposed ? (
                                <button onClick={() => decomposeProject(proj)} disabled={projectDecomposing} style={{ flex: 1, padding: "8px", background: "#4D6BFE", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                                  {projectDecomposing ? "⏳" : "🧠 IA Décompose"}
                                </button>
                              ) : (
                                <button onClick={() => { setActiveProject(proj); setProjectSubView("coach"); }} style={{ flex: 1, padding: "8px", background: "#3451D1", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🤖 Coach</button>
                              )}
                            </div>
                          </HoloCard>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}

              {/* ═══ DÉTAIL PROJET — Sous-vue propre ═══ */}
              {projectSubView === "detail" && activeProject && (
                <div>
                  <button onClick={() => { setProjectSubView("hub"); setActiveProject(null); }} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 20, padding: "6px 0" }}>
                    ← Retour aux projets
                  </button>
                  <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 22, padding: 28 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <div>
                        <h2 style={{ color: theme.highlight, margin: 0 }}>{activeProject.title}</h2>
                        {activeProject.decomposedData?.studyAdvice && (
                          <div style={{ fontSize: 13, color: "#4D6BFE", marginTop: 6, fontStyle: "italic" }}>💡 {activeProject.decomposedData.studyAdvice}</div>
                        )}
                      </div>
                      <button onClick={() => { setProjectSubView("hub"); setActiveProject(null); }} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 20 }}>✕</button>
                    </div>
                    {activeProject.decomposedData?.keyRisks?.length > 0 && (
                      <div style={{ background: "#EFF3FF", borderRadius: 12, padding: "12px 16px", marginBottom: 16, border: "1px solid #C7D2FE" }}>
                        <div style={{ fontWeight: 700, color: "#1E3A8A", fontSize: 13, marginBottom: 6 }}>⚠️ Risques identifiés par l'IA</div>
                        {activeProject.decomposedData.keyRisks.map((r, i) => <div key={i} style={{ fontSize: 12, color: "#1E3558", marginBottom: 2 }}>• {r}</div>)}
                      </div>
                    )}
                    {["analyse", "conception", "développement", "test", "rendu"].map(phase => {
                      const phaseTasks = (activeProject.tasks || []).filter(t => t.phase === phase);
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
                                        const parsed = safeParseJSON(raw);
                                        const newExp = { id: Date.now().toString() + Math.random(), front: parsed.front, back: parsed.back, example: parsed.example || "", category: activeProject.category || categories[0]?.name || "Projets", level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null };
                                        setExpressions(prev => [newExp, ...prev]);
                                        showToast(`✨ Fiche "${concept}" créée !`);
                                      } catch { showToast("Erreur génération fiche", "error"); }
                                    }} style={{ fontSize: 10, background: "#EEF2FF", color: "#1E3A8A", border: "none", borderRadius: 20, padding: "2px 8px", cursor: "pointer", fontWeight: 700 }}>
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
                    {(activeProject.tasks || []).length === 0 && (
                      <button onClick={() => decomposeProject(activeProject)} disabled={projectDecomposing} style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#4D6BFE,#7B93FF)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
                        {projectDecomposing ? "⏳ L'IA génère ton plan…" : "🧠 Décomposer avec l'IA"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ═══ PLANIFICATEUR CRUNCH MODE ═══ */}
              {projectSubView === "planner" && (
                <div>
                  <button onClick={() => setProjectSubView("hub")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 20, padding: "6px 0" }}>← Retour au Hub</button>
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
                              <div key={si} style={{ display: "flex", gap: 10, marginBottom: 8, padding: "8px 10px", background: theme.inputBg, borderRadius: 10, borderLeft: `3px solid ${slot.type === "revision" ? "#4D6BFE" : slot.type === "projet" ? "#4D6BFE" : "var(--mm-fg-muted)"}` }}>
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 800, color: theme.highlight, minWidth: 38 }}>{slot.time}</span>
                                <div>
                                  <div style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>{slot.activity}</div>
                                  {slot.module && <div style={{ fontSize: 10, color: theme.textMuted }}>{slot.module}</div>}
                                </div>
                                <span style={{ marginLeft: "auto", fontSize: 9, background: slot.type === "revision" ? "#EEF2FF" : slot.type === "projet" ? "#EEF2FF" : "var(--mm-bg-elev)", color: slot.type === "revision" ? "#3451D1" : slot.type === "projet" ? "#1E3A8A" : "#64748B", borderRadius: 20, padding: "2px 6px", fontWeight: 700, height: "fit-content" }}>{slot.type}</span>
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
                <div style={{ display: "flex", flexDirection: "column", minHeight: "60vh" }}>
                  <button onClick={() => setProjectSubView("hub")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 12, padding: "6px 0" }}>← Retour au Hub</button>
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
                        {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#4D6BFE", animation: `pulse 1s ${i * 0.2}s infinite` }} />)}
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
                  <button onClick={() => setProjectSubView("hub")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 20, padding: "6px 0" }}>← Retour au Hub</button>
                  <div style={{ background: "linear-gradient(135deg,#1E3A8A,#3451D1,#4D6BFE)", borderRadius: 22, padding: 28, marginBottom: 24, color: "white", textAlign: "center" }}>
                    <div style={{ fontSize: 72, fontFamily: "'JetBrains Mono',monospace", fontWeight: 900, letterSpacing: -2, marginBottom: 8 }}>{formatPomodoro(projectPomodoroTime)}</div>
                    <div style={{ fontSize: 14, color: "#C7D2FE", marginBottom: 20 }}>
                      Mode : {projectPomodoroMode === "study" ? "📚 Révision FSRS" : projectPomodoroMode === "project" ? "🗂️ Session Projet" : "☕ Pause"}
                    </div>
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                      <button onClick={() => setProjectPomodoroActive(a => !a)} style={{ padding: "14px 32px", background: "white", color: "#3451D1", border: "none", borderRadius: 14, fontWeight: 900, fontSize: 18, cursor: "pointer" }}>
                        {projectPomodoroActive ? "⏸ Pause" : "▶ Démarrer"}
                      </button>
                      <button onClick={() => { setProjectPomodoroActive(false); setProjectPomodoroTime(25 * 60); setProjectPomodoroMode("study"); }} style={{ padding: "14px 20px", background: "rgba(255,255,255,0.2)", color: "white", border: "none", borderRadius: 14, fontWeight: 700, cursor: "pointer" }}>↺ Reset</button>
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
                    {activeProject && (activeProject.tasks || []).filter(t => !t.done).length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(activeProject.tasks || []).filter(t => !t.done).slice(0, 4).map(task => (
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
            VUE PORTFOLIO ASTRAL
        ══════════════════════════════════════════════════════════════════ */}
          {view === "portfolio" && (
            <div style={{ animation: "fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h1 style={{ fontSize: 32, fontWeight: 900, background: "linear-gradient(135deg, #4D6BFE, #7B93FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0, letterSpacing: "-1px" }}>🌌 Portfolio Astral</h1>
                  <p style={{ color: theme.textMuted, marginTop: 6, fontSize: 15 }}>La galerie holographique de tes accomplissements et codes sources.</p>
                </div>
              </div>
              {projects.filter(p => p.status === "terminé").length === 0 ? (
                <div style={{ textAlign: "center", padding: "100px 20px", background: isDarkMode ? "radial-gradient(circle at center, rgba(77, 107, 254,0.15) 0%, transparent 70%)" : "radial-gradient(circle at center, rgba(77, 107, 254,0.1) 0%, transparent 70%)", borderRadius: 40, border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.2)" : "rgba(77, 107, 254,0.1)"}`, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: "50%", left: "50%", width: 300, height: 300, marginTop: -150, marginLeft: -150, background: "conic-gradient(from 0deg, transparent 0%, rgba(77, 107, 254,0.3) 50%, transparent 100%)", borderRadius: "50%", animation: "spin 4s linear infinite", pointerEvents: "none", filter: "blur(20px)" }} />
                  <div style={{ fontSize: 80, animation: "float 4s ease-in-out infinite", marginBottom: 24, position: "relative", zIndex: 1, filter: "drop-shadow(0 0 20px rgba(77, 107, 254,0.8))" }}>🌌</div>
                  <h3 style={{ color: theme.text, fontSize: 32, margin: "0 0 16px", fontWeight: 900, position: "relative", zIndex: 1, textShadow: "0 0 30px rgba(77, 107, 254,0.5)" }}>Le Néant Astral...</h3>
                  <p style={{ color: theme.textMuted, fontSize: 16, maxWidth: 500, margin: "0 auto", position: "relative", zIndex: 1, lineHeight: 1.6 }}>Termine tes premiers projets pour les faire transcender et briller dans cette constellation d'accomplissements.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 24 }}>
                  {projects.filter(p => p.status === "terminé").map((proj, idx) => (
                    <HoloCard key={proj.id} theme={theme} glowColor={proj.color || "#4D6BFE"} style={{
                      background: isDarkMode ? "linear-gradient(145deg, rgba(15,23,42,0.9), rgba(15,23,42,0.6))" : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(248,250,255,0.9))",
                      borderRadius: 24, padding: 28, border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77, 107, 254,0.1)"}`,
                      boxShadow: "0 20px 40px rgba(77,107,254,0.1)", backdropFilter: "blur(20px)",
                      transform: "translateZ(0)", animation: `fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s both`,
                      position: "relative", overflow: "hidden"
                    }}>
                      <div style={{ position: "absolute", top: -50, right: -50, width: 150, height: 150, background: `radial-gradient(circle, ${proj.color || "#4D6BFE"}40 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: theme.text, zIndex: 1, textShadow: isDarkMode ? "0 2px 10px rgba(0,0,0,0.5)" : "none" }}>{proj.title}</h3>
                        <span style={{ background: "rgba(77, 107, 254,0.1)", color: "#4D6BFE", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, border: "1px solid rgba(77, 107, 254,0.2)" }}>Niveau Astral</span>
                      </div>
                      {proj.description && <p style={{ color: theme.textMuted, fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>{proj.description}</p>}
                      <div style={{ background: theme.inputBg, borderRadius: 16, padding: "16px", border: `1px solid ${theme.border}`, position: "relative" }}>
                        <div style={{ fontSize: 10, fontWeight: 900, color: theme.highlight, letterSpacing: 1, marginBottom: 8 }}>STATISTIQUES</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div><div style={{ fontSize: 18, fontWeight: 900, color: theme.text }}>{proj.tasks?.length || 0}</div><div style={{ fontSize: 11, color: theme.textMuted }}>Tâches accomplies</div></div>
                          <div><div style={{ fontSize: 18, fontWeight: 900, color: "#22C55E" }}>100%</div><div style={{ fontSize: 11, color: theme.textMuted }}>Taux de réussite</div></div>
                        </div>
                      </div>
                    </HoloCard>
                  ))}
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
                  <button onClick={() => setCatsViewMode("cards")} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: catsViewMode === "cards" ? theme.highlight : theme.cardBg, color: catsViewMode === "cards" ? "white" : theme.textMuted, border: `1px solid ${theme.border}`, fontWeight: 600, fontSize: 13 }}>📇 Cartes</button>
                  <button onClick={() => { setCatsViewMode("table"); computeCatsStats(); }} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: catsViewMode === "table" ? theme.highlight : theme.cardBg, color: catsViewMode === "table" ? "white" : theme.textMuted, border: `1px solid ${theme.border}`, fontWeight: 600, fontSize: 13 }}>📊 Tableau</button>
                  <button onClick={generateTimeline} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: catsViewMode === "timeline" ? theme.highlight : theme.cardBg, color: catsViewMode === "timeline" ? "white" : theme.textMuted, border: `1px solid ${theme.border}`, fontWeight: 600, fontSize: 13 }}>📅 Timeline</button>
                  <button onClick={detectPrerequisites} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: theme.cardBg, color: theme.textMuted, border: `1px solid ${theme.border}`, fontWeight: 600, fontSize: 13 }}>🔗 Prérequis</button>
                  <button onClick={() => setCatsViewMode("prep")} className="hov" style={{ padding: "8px 14px", borderRadius: 10, background: catsViewMode === "prep" ? theme.highlight : theme.cardBg, color: catsViewMode === "prep" ? "white" : theme.textMuted, border: `1px solid ${theme.border}`, fontWeight: 600, fontSize: 13 }}>🎯 Prep-Mode</button>
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
                      <span style={{ color: alert.type === "danger" ? "#EF4444" : "#4D6BFE" }}>{alert.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Rapport IA */}
              {catsAiReport && (
                <div style={{ background: theme.cardBg, borderRadius: 16, padding: 20, marginBottom: 20, border: "2px solid #4D6BFE" }}>
                  <h3 style={{ margin: "0 0 8px", color: "#4D6BFE" }}>🧠 Plan d'action IA</h3>
                  <p><strong>Module critique :</strong> {catsAiReport.criticalModule}</p>
                  <ul>{catsAiReport.recommendations?.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  <button onClick={() => setCatsAiReport(null)} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}>✕</button>
                </div>
              )}

              {/* Ajout de module (compact) */}
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 18, padding: "20px", marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 12px", color: theme.text, fontWeight: 800 }}>➕ Ajouter un module</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  <input value={newCat.name} onChange={e => setNewCat(c => ({ ...c, name: e.target.value }))} style={{ padding: 10, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text }} placeholder="Nom" />
                  <input type="color" value={newCat.color} onChange={e => setNewCat(c => ({ ...c, color: e.target.value }))} style={{ height: 42, padding: 4, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8 }} />
                  <input type="date" value={newCat.examDate} onChange={e => setNewCat(c => ({ ...c, examDate: e.target.value }))} style={{ padding: 10, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text }} />
                  <select value={newCat.priority} onChange={e => setNewCat(c => ({ ...c, priority: e.target.value }))} style={{ padding: 10, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text }}>
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
                  {categories.sort((a, b) => {
                    if (catsFavorites.includes(a.name)) return -1;
                    if (catsFavorites.includes(b.name)) return 1;
                    return 0;
                  }).map(cat => {
                    const isFav = catsFavorites.includes(cat.name);
                    const catExps = expressions.filter(e => e.category === cat.name);
                    const dueCount = catExps.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7).length;
                    const mastered = catExps.filter(e => e.level >= 7).length;
                    const pct = catExps.length ? Math.round((mastered / catExps.length) * 100) : 0;
                    const daysToExam = cat.examDate ? Math.ceil((new Date(cat.examDate) - new Date()) / 86400000) : null;
                    const catColor = cat.color || "#4D6BFE";
                    return (
                      <div key={cat.name} style={{
                        background: theme.cardBg, borderRadius: 22, padding: "22px", border: `1px solid ${theme.border}`,
                        borderTop: `4px solid ${catColor}`, boxShadow: isFav ? "0 0 15px rgba(77,107,254,0.3)" : "0 2px 8px rgba(77,107,254,0.05)"
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
                            <td style={{ textAlign: "center", color: (s.due || 0) > 0 ? "#EF4444" : theme.text }}>{s.due || 0}</td>
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

              {/* ══ GOD LEVEL : PREP-MODE CERTIFICATIONS ══ */}
              {catsViewMode === "prep" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24, animation: "fadeUp 0.4s ease" }}>
                  {categories.map(cat => {
                    const catExps = expressions.filter(e => e.category === cat.name);
                    const mastered = catExps.filter(e => e.level >= 7).length;
                    const fsrsScore = catExps.length > 0 ? Math.round((mastered / catExps.length) * 100) : 0;

                    const catExams = examHistory.filter(h => h.category === cat.name);
                    const recentExams = catExams.slice(0, 3);
                    const mockScore = recentExams.length > 0 ? Math.round(recentExams.reduce((s, x) => s + x.score, 0) / recentExams.length) : 0;

                    // Pondération : 60% FSRS, 40% Exams blancs
                    const readiness = Math.round((fsrsScore * 0.6) + (mockScore * 0.4));
                    const isReady = readiness >= 95;

                    return (
                      <HoloCard key={cat.name} theme={theme} glowColor={isReady ? "#10B981" : "#4D6BFE"} style={{ background: theme.cardBg, borderRadius: 24, padding: "28px", border: `2px solid ${isReady ? "#10B98150" : theme.border}`, display: "flex", flexDirection: "column" }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: isReady ? "#10B981" : theme.highlight, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>PREP-MODE CERTIFICATION</div>
                        <h3 style={{ margin: "0 0 16px", color: theme.text, fontSize: 20, fontWeight: 900 }}>{cat.name}</h3>

                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
                          <div style={{ position: "relative", width: 160, height: 160 }}>
                            <svg viewBox="0 0 36 36" style={{ width: 160, height: 160, transform: "rotate(-90deg)" }}>
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke={theme.inputBg} strokeWidth="3" />
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke={isReady ? "#10B981" : "#4D6BFE"} strokeWidth="4" strokeDasharray={`${readiness} 100`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1.5s cubic-bezier(0.16, 1, 0.3, 1)", filter: isReady ? "drop-shadow(0 0 12px rgba(16,185,129,0.5))" : "drop-shadow(0 0 12px rgba(77,107,254,0.3))" }} />
                            </svg>
                            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 36, fontWeight: 900, color: isReady ? "#10B981" : theme.text, lineHeight: 1 }}>{readiness}%</span>
                              <span style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>Readiness</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                          <div style={{ flex: 1, background: theme.inputBg, borderRadius: 12, padding: "12px", border: `1px solid ${theme.border}`, textAlign: "center" }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: theme.text }}>{fsrsScore}%</div>
                            <div style={{ fontSize: 10, color: theme.textMuted, fontWeight: 700, marginTop: 2 }}>Maîtrise FSRS</div>
                          </div>
                          <div style={{ flex: 1, background: theme.inputBg, borderRadius: 12, padding: "12px", border: `1px solid ${theme.border}`, textAlign: "center" }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: theme.text }}>{mockScore}%</div>
                            <div style={{ fontSize: 10, color: theme.textMuted, fontWeight: 700, marginTop: 2 }}>Exams Blancs</div>
                          </div>
                        </div>

                        {isReady ? (
                          <div style={{ marginTop: "auto", textAlign: "center", animation: "fadeUp 0.5s ease" }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#10B981", marginBottom: 12 }}>🎉 Tu es prêt à passer l'examen officiel !</div>
                            <button onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(cat.name + " certification official exam registration")}`, "_blank")} className="btn-glow hov" style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #10B981, #059669)", color: "white", border: "none", borderRadius: 14, fontWeight: 900, fontSize: 14, cursor: "pointer", boxShadow: "0 8px 20px rgba(16,185,129,0.4)" }}>
                              Passer l'examen ↗
                            </button>
                          </div>
                        ) : (
                          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                            <button onClick={() => { setExamConfig(p => ({ ...p, category: cat.name, mode: "standard" })); setView("exam"); }} className="hov" style={{ padding: "12px", background: "linear-gradient(135deg, #4D6BFE, #3451D1)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                              📝 Lancer un examen blanc
                            </button>
                            <button onClick={async () => {
                              setPrepLoading(p => ({ ...p, [cat.name]: true }));
                              try {
                                const raw = await callClaude(
                                  "Tu es un expert en certifications informatiques. Génère les concepts clés du syllabus officiel pour cette certification.",
                                  `Syllabus pour "${cat.name}"\nJSON: {"conceptsCles":["concept 1","concept 2"]}`
                                );
                                const parsed = safeParseJSON(raw);
                                if (parsed?.conceptsCles) {
                                  parsed.conceptsCles.forEach(c => setAddBatchQueue(prev => [...prev, `${cat.name}: ${c}`]));
                                  showToast(`➕ ${parsed.conceptsCles.length} concepts ajoutés à la file d'attente (Batch) !`, "success");
                                  navigate("add/batch");
                                }
                              } catch (e) {
                                showToast("Erreur d'import du syllabus.", "error");
                              }
                              setPrepLoading(p => ({ ...p, [cat.name]: false }));
                            }} disabled={prepLoading[cat.name]} className="hov" style={{ padding: "12px", background: "transparent", color: theme.highlight, border: `1px solid ${theme.border}`, borderRadius: 12, fontWeight: 800, cursor: prepLoading[cat.name] ? "not-allowed" : "pointer", fontSize: 13, opacity: prepLoading[cat.name] ? 0.5 : 1 }}>
                              {prepLoading[cat.name] ? "⏳ Importation..." : "📥 Importer syllabus (IA)"}
                            </button>
                          </div>
                        )}
                      </HoloCard>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {view === "routine" && (
            <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 0", animation: "fadeUp 0.3s ease" }}>
              <DailyRoutineTracker
                theme={theme}
                isDarkMode={isDarkMode}
                onAction={(actionId) => {
                  if (actionId === "review") startReview(null, "standard");
                  else if (actionId === "add") { setView("add"); }
                  else if (actionId === "practice") setView("practice");
                  else setView(actionId);
                }}
              />
            </div>
          )}

        </main>
      </div>

      {/* ══ STATUS BAR PRO (IDE Footer) ══ */}
      <footer className="hide-mobile" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, height: 26, zIndex: 9999,
        background: isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)",
        borderTop: `1px solid ${isDarkMode ? "var(--mm-border-strong)" : "var(--mm-border)"}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        color: isDarkMode ? "var(--mm-fg-muted)" : "var(--mm-fg)", userSelect: "none"
      }}>
        <div style={{ display: "flex", gap: 20, alignItems: "center", height: "100%" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10 }}>{typeof navigator !== "undefined" && navigator.onLine ? "🟢" : "🟡"}</span> Firebase: {typeof navigator !== "undefined" && navigator.onLine ? "Sync" : "Offline"}
          </span>
          <span className="hov" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => showToast("Sélecteur de modèle LLM à venir", "info")} title="Changer le modèle d'IA">
            <span style={{ fontSize: 12 }}>🧠</span> LLM: Groq (Llama-3.3)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12 }}>⏱️</span> Session: {Math.floor(appSessionTime / 60)}m {appSessionTime % 60}s
          </span>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", height: "100%" }}>
          <span style={{ opacity: 0.6 }}>MémoMaître God Mode • {expressions.length} fiches</span>
          <div style={{ width: 1, height: 12, background: isDarkMode ? "#30363D" : "var(--mm-border)" }} />
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>

            {/* BOUTON ET POPUP LECTEUR AUDIO */}
            <div style={{ position: "relative" }}>
              {showLofiPlayer && (
                <div style={{
                  position: "absolute", bottom: "calc(100% + 16px)", right: -40,
                  width: 260, background: isDarkMode ? "rgba(13,21,53,0.95)" : "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
                  border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(77,107,254,0.15)"}`,
                  borderRadius: 20, padding: 18, boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
                  display: "flex", flexDirection: "column", gap: 14, zIndex: 10000,
                  animation: "fadeUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: theme.text, letterSpacing: 1, textTransform: "uppercase" }}>RADIO FOCUS</span>
                    <button onClick={() => setShowLofiPlayer(false)} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 16 }}>✕</button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={() => setLofiPlaying(!lofiPlaying)} style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg, #3451D1, #4D6BFE)", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "0 4px 12px rgba(77,107,254,0.4)" }}>
                      {lofiPlaying ? "⏸" : "▶"}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{RADIO_STATIONS[lofiStation].name}</div>
                      <div style={{ fontSize: 11, color: lofiPlaying ? "#22C55E" : theme.textMuted, fontWeight: 600, marginTop: 2 }}>{lofiPlaying ? "En direct..." : "En pause"}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)", padding: "8px 12px", borderRadius: 10 }}>
                    <span style={{ fontSize: 13 }}>🔉</span>
                    <input type="range" min="0" max="1" step="0.05" value={lofiVolume} onChange={e => setLofiVolume(parseFloat(e.target.value))} style={{ flex: 1, accentColor: theme.highlight, cursor: "pointer" }} />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {RADIO_STATIONS.map((station, idx) => (
                      <button key={idx} onClick={() => { setLofiStation(idx); setLofiPlaying(true); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: lofiStation === idx ? (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)") : "transparent", border: "none", color: theme.text, cursor: "pointer", textAlign: "left", fontSize: 12, fontWeight: 700, transition: "background 0.2s" }} onMouseEnter={e => { if (lofiStation !== idx) e.currentTarget.style.background = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)" }} onMouseLeave={e => { if (lofiStation !== idx) e.currentTarget.style.background = "transparent" }}>
                        <span style={{ fontSize: 16 }}>{station.emoji}</span> {station.name}
                        {lofiStation === idx && lofiPlaying && <span style={{ marginLeft: "auto", color: theme.highlight, fontSize: 12 }}>♪</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setShowLofiPlayer(p => !p)} className="hov" style={{ background: "none", border: "none", color: lofiPlaying ? theme.highlight : "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }} title="Lecteur Audio">
                🎧 {lofiPlaying && <span style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 10, opacity: 0.8 }}><span style={{ width: 2, height: "60%", background: theme.highlight, animation: "pulse 0.8s infinite alternate" }} /><span style={{ width: 2, height: "100%", background: theme.highlight, animation: "pulse 0.8s infinite alternate 0.2s" }} /><span style={{ width: 2, height: "40%", background: theme.highlight, animation: "pulse 0.8s infinite alternate 0.4s" }} /></span>}
              </button>
            </div>

            <button onClick={() => setIsPomoActive(!isPomoActive)} style={{ background: "none", border: "none", color: isPomoActive ? theme.highlight : "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: "bold" }}>
              ⏱ {Math.floor(pomoTime / 60)}:{String(pomoTime % 60).padStart(2, "0")}
            </button>

            <button onClick={() => setIsDarkMode(d => !d)} className="hov" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", fontSize: 13 }} title="Mode Sombre/Clair">{isDarkMode ? "🌙" : "☀️"}</button>
            <button onClick={() => setZenFocusMode(z => !z)} className="hov" style={{ background: "none", border: "none", color: zenFocusMode ? theme.highlight : "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", fontSize: 13 }} title="Mode Zen/Focus">👁️</button>
          </div>
        </div>
      </footer>

      <CommandPalette
        open={cmdOpen} onClose={() => setCmdOpen(false)} theme={theme}
        commands={[
          { icon: "▶", label: "Lancer une review", shortcut: "R", action: () => setView("review") },
          { icon: "➕", label: "Ajouter une fiche", shortcut: "A", action: () => setView("add") },
          { icon: "🔍", label: "Rechercher dans les fiches", shortcut: "F", action: () => setView("list") },
          { icon: "📊", label: "Ouvrir les stats", action: () => setView("stats") },
          { icon: "🧪", label: "Ouvrir le Lab", action: () => setView("lab") },
          { icon: "📥", label: "Importer un PDF", action: () => navigate("lab/import") },
          { icon: "🌙", label: "Basculer thème sombre/clair", action: () => setIsDarkMode(d => !d) },
          { icon: "🎧", label: "Activer/Désactiver Lofi", action: () => setLofiPlaying(p => !p) },
          { icon: "🍅", label: "Lancer une session 25 min", action: () => navigate("lab/pomodoro") },
        ]}
      />

      {xpBurst && (
        <div key={xpBurst.key} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
          animation: 'xp-burst-fade-out 3s ease-out forwards'
        }}>
          <div style={{
            fontSize: 'clamp(4rem, 10vw, 8rem)',
            fontWeight: 900,
            color: '#FACC15',
            textShadow: '0 0 10px #FBBF24, 0 0 20px #F59E0B, 0 0 40px #D97706, 0 4px 10px rgba(0,0,0,0.5)',
            animation: 'xp-burst-float-up 3s cubic-bezier(0.1, 0.9, 0.2, 1) forwards'
          }}>
            +{xpBurst.amount} XP
          </div>
        </div>
      )}
    </div>
  );
}
