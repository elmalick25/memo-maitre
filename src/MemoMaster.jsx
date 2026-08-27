// MemoMaster.jsx – GOD LEVEL v10.1 (Audit & hardening pass — div/0 guards, safer JSON parsing, SSR-safe init)
import ErrorBoundary from "./components/ErrorBoundary";
import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense, startTransition, forwardRef } from "react";
import { mirrorToWatermelon, loadInitialExpressionsFromWatermelon } from './lib/db/mirror';
import { syncWithFirebase, forceResetSync, repairSyncNow as fullDeepSyncFn } from './lib/db/sync';

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, fbStorage, getFbUser, onAuthReady, forceSyncNow, triggerAuthReady } from "./lib/firebase";
import { addDays, today, formatDate, isDue, normalizeDate } from "./utils/dateUtils";
import { repairCardDates } from "./lib/dateRepair";
import { ensureMasteryStage, recordProductiveUse, getMasteryBreakdown, computeMasteryStage } from "./lib/masteryStages";
import { isCardMastered, countMasteredCards, getDueCards } from "./lib/cardStatus";
import { DAILY_PLAN_STORAGE_KEY, buildDailyPlan, markCardDone, normalizeDailyPlan } from "./lib/dailyPlan";
import { mergeDayState, dayStatesEqual, dayStateFromLocal, dayStateToPlan, normalizeDayState } from "./lib/dayStateMerge";
import { subscribeDayState, fetchDayState, publishDayState, flushDayStateNow } from "./lib/db/dayStateSync";
import {
  pickProductionInvite,
  canPromptProduction,
  buildProductionValidationPrompt,
  parseProductionValidation,
  PRODUCTION_PROMPT_STORAGE_KEY,
} from "./lib/productionPrompt";
import {
  appendDailyLog,
  summarizeReviewLoad,
  checkCreationGuard,
  countNeverSeenCards,
  REVIEW_LOAD_LOG_KEY,
  computeDailyProgress,
  computeModuleComparison,
  computeDifficultyDistribution,
  computeDayOfWeekPerformance,
  computeTopDifficultCards,
  computeRetentionCurve,
  getWeeklyStatsForClaude,
} from "./lib/reviewStats";
import { cleanSpeechTranscript, isMeaninglessSpeech, SPEECH_HYGIENE_PROMPT } from "./utils/speechCleanup";
import { fsrs, fsrsR, fsrsFromProduction, incubationProgress } from "./lib/fsrs";
import { ATOMIC_CARD_RULES } from "./lib/atomicCardRules";
import { antiInterferenceReorder, analyzeLeech, composeWeakSpotSession, composeDailySession, pickLeeches, nextLapseCount } from "./lib/memoryLab";
import { isNewCard, isYoungCard, splitNewAndReview, splitYoungAndReview, getNewCardBudget, normalizeIntakeState, makeIntakeState, remainingIntake, consumeIntakeSlot } from "./lib/newCardIntake";
import { buildLeechRescuePrompt, buildLeechRescueUserPayload } from "./lib/memoryBoost";
import { getAudioObjectUrl } from "./lib/audioStore";
import { FOCUS_PLAYLIST, OFFLINE_TRACKS, LIVE_STATIONS, CATEGORY_LABELS, totalPlaylistBytes, formatBytes } from "./lib/musicLibrary";
import { listDownloadedIds, downloadTrack, downloadAll, deleteTrack as deleteMusicTrack, getDownloadedSize, getTrackObjectUrl, revokeObjectUrl } from "./lib/musicStore";
import { getNetworkStatus, onNetworkChange, shouldReduceData } from "./lib/networkStatus";
import useAudioFeedback from "./hooks/useAudioFeedback";
import useConfetti from "./hooks/useConfetti";
import useHighlight from "./hooks/useHighlight";
import useMermaid from "./hooks/useMermaid";
const EnglishPractice = lazy(() => import("./EnglishPractice"));
const Lab = lazy(() => import("./Lab"));
import CertificationsDashboard from "./components/CertificationsDashboard";
import OpenSourceRadar from "./components/OpenSourceRadar";
import SoundwavePlayer from "./components/SoundwavePlayer";
import BulkRestructureBar from "./components/BulkRestructureBar";
import { restructureSelectedCards } from "./lib/retroEngineeringRestructurer";


import PhantomRecruiter from "./components/PhantomRecruiter";
import TechOracle from "./components/TechOracle";
import { YearHeatmap, ResumeCarousel, getSmartSessionRecommendation, CommandPalette, useCommandPaletteShortcut, SmartPasteBox, generateCardsFromSmartPaste, findSimilarCards, Minimap, getCardHealth, useSavedViews, generateWeeklyDigest, PomodoroStudy, AskMyDocs, SocraticChat, RabbitHoleViewer, gradeSemanticVoice, generatePrerequisiteCard } from "./MemoMasterUpgrades";
import GodTierContent from "./components/GodTierContent";
import GodTierStats from "./components/GodTierStats";
// ── Helpers & composants extraits (refactor — ex-MemoMaster.jsx) ───────────
import { BADGES, getArchetype, RETIRED_BADGE_IDS } from "./constants/gamification";
// ── Refonte gamification (chantiers 1, 2, 5, 7) ───────────────────────────
import useXPLedger from "./hooks/useXPLedger";
import BadgesView from "./components/BadgesView";
import CategoriesView from "./components/CategoriesView";
import ProjectsView from "./components/ProjectsView";
import AddCardView from "./components/AddCardView";
import ReviewEngineView from "./components/ReviewEngineView";
import CardListView from "./components/CardListView";
import DashboardView from "./components/DashboardView";
import StudyView from "./components/StudyView";
import AppStatusBar from "./components/AppStatusBar";
import AppTopNav from "./components/AppTopNav";
import AppSidebar from "./components/AppSidebar";
import AppMobileNav from "./components/AppMobileNav";
import AppOverlays from "./components/AppOverlays";
import "./styles/memoMasterTheme.css";
import { advanceStreak, canRepairStreak, repairStreak, repairTimeLeft } from "./lib/streakGuard";
import { bonusFreezeTokens, bonusNewCardQuota, streakIcon as unlockedStreakIcon, holoIntensity } from "./lib/unlocks";
// ── CHANTIERS 8-13 : couche « TikTok » (récompenses variables, quêtes,
// feedback micro, hook de fin de session, timing intelligent) ──────────────
import useDailyQuests from "./hooks/useDailyQuests";
import useShortcutsAndSync from "./hooks/useShortcutsAndSync";
import useExpressionsManager from "./hooks/useExpressionsManager";
import useReviewSession from "./hooks/useReviewSession";
import ComboBar from "./components/ComboBar";
import RewardChest from "./components/RewardChest";
import DailyQuestBar from "./components/DailyQuestBar";
import SessionEndHook from "./components/SessionEndHook";
import { countPromotable, bestStudyHour } from "./lib/smartTiming";

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
import AgentPanel from "./components/AgentPanel";

import DailyRoutineTracker from "./components/DailyRoutineTracker";
import RoutineAlertCard from "./components/RoutineAlertCard";
import NotificationCenter from "./components/NotificationCenter";
import useDailyRoutine from "./hooks/useDailyRoutine";
import usePerfTier, { PERF_LITE_CSS } from "./lib/perfTier";
import { haptic } from "./lib/haptics";
import { CATEGORIES_DEFAULT, mergeDefaultCategories, reconcileCategoriesWithExpressions } from "./lib/categoryManager";
import { transcribeAudio } from "./lib/transcribe";
import AudioFichePlayer from "./components/AudioFichePlayer";
import useNavigation from "./hooks/useNavigation";
import usePomodoro from "./hooks/usePomodoro";
import useFocusRadio from "./hooks/useFocusRadio";
import { CARD_TYPES, SLASH_COMMANDS } from "./constants/cardTypes";
import { playSound } from "./utils/soundEffects";
import { buildBatchPrompt, buildChatToCardSystemPrompt, layoutBatchCards } from "./lib/aiCardPrompts";
import { buildOptimizationSystemPrompt, parseOptimizationResponse, applyOptimizationUpdates } from "./lib/cardOptimizer";

export const MOBILE_BREAKPOINT = 768;
export const MOBILE_MQ = `(max-width: ${MOBILE_BREAKPOINT - 0.02}px)`;
const TechIntelView = lazy(() => import("./components/TechIntelView"));

import { callClaude } from "./lib/callClaude";



// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
export default function MemoMaster() {
  // ── Tous les états existants ───────────────────────────────────────────
  const [sessionInProgress, setSessionInProgress] = useState(false);
  const [visibleCardsCount, setVisibleCardsCount] = useState(30);
  const loadMoreCardsRef = useRef(null);
  const [lastFailed, setLastFailed] = useState(null);
  const [lastLabDoc, setLastLabDoc] = useState(null);
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
      }).map(e => {
        const nFront = e.front || '';
        const nBack = e.back || '';
        const nCat = e.category || 'Général';
        const nType = e.type || 'qa';
        const nLevel = Number(e.level || 0);
        const nNextReview = e.nextReview ? normalizeDate(e.nextReview) : null;

        if (e.front === nFront && e.back === nBack && e.category === nCat && e.type === nType && e.level === nLevel && e.nextReview === nNextReview) {
          return e;
        }
        return {
          ...e,
          front: nFront,
          back: nBack,
          category: nCat,
          type: nType,
          level: nLevel,
          nextReview: nNextReview
        };
      });
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
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const [oneHanded, setOneHanded] = useState(false);

  const toastRef = useRef(null);
  const emitToast = useCallback((msg, type) => { toastRef.current?.(msg, type); }, []);
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => { toastRef.current = showToast; }, [showToast]);
  const {
    xpState,
    xpLoaded,
    totalXP: powerLevel,
    archetype: xpArchetype,
    combo: reviewCombo,
    sessionBestCombo,
    bestCombo: bestComboEver,
    todayMultiplier,
    lastChest,
    clearChest,
    grantChest,
    awardReview,
    awardSource,
    awardBonusXP,
    resetCombo,
    migrateOnce,
  } = useXPLedger(storage, emitToast);

  // ── CHANTIER 9 : quêtes quotidiennes & hebdo ──────────────────────────────
  const { questState, questSummary: questBoard, trackQuest } = useDailyQuests(storage, {
    showToast: emitToast,
    onReward: ({ type, xp }) => {
      const src = type === "weekly" ? "QUEST_WEEKLY" : type === "combo" ? "QUEST_COMBO" : "QUEST_DAILY";
      awardBonusXP(xp, src, null);
      haptic("quest"); // CHANTIER 17 — quête bouclée : pulse court et net
    },
  });
  // ── CHANTIERS 24-28 : la routine quotidienne, état partagé mobile/desktop ──
  // Une seule instance ici : la vue Routine ET l'alerte d'accueil (mobile comme
  // desktop) consomment le même objet, donc ne peuvent pas diverger.
  const routine = useDailyRoutine({
    awardSource: (src, opts) => awardSource(src, opts),
    awardBonusXP,
    grantChest,
    showToast: emitToast,
  });

  // ── CHANTIER 21 : budget de performance par palier d'appareil ──
  // Sur un Android d'entrée de gamme, backdrop-filter + conic-gradient animé
  // sont les effets les plus coûteux du CSS. En mode « lite » on garde la
  // couleur pleine et l'icône : la hiérarchie de rareté reste lisible.
  const perfLite = usePerfTier();

  // ── CHANTIER 17 — Montée de niveau : signature haptique dédiée. ──
  // Il n'existait aucun évènement « level up » côté UI : on le dérive du
  // niveau d'archétype, seule source de vérité du palier.
  // CHANTIER 16 — le palier cosmétique « holo » débloqué par le niveau alimente
  // enfin les cartes : plus le niveau monte, plus l'aura des cartes est riche.
  const holoLevel = useMemo(() => holoIntensity(getArchetype(powerLevel).level), [powerLevel]);

  const levelRef = useRef(null);
  useEffect(() => {
    const lvl = getArchetype(powerLevel).level;
    if (levelRef.current !== null && lvl > levelRef.current) {
      haptic("levelup");
      emitToast(`🎚️ Niveau ${lvl} atteint !`, "success");
    }
    levelRef.current = lvl;
  }, [powerLevel, emitToast]);

  const routineRef = useRef(routine);
  routineRef.current = routine;

  const xpRef = useRef(xpState);
  useEffect(() => { xpRef.current = xpState; }, [xpState]);
  // File d'attente de toasts de badges (chantier 3 : tous notifiés, pas juste le 1er)
  const [badgeQueue, setBadgeQueue] = useState([]);
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



  const { pomoTime, setPomoTime, isPomoActive, setIsPomoActive, togglePomodoro, resetPomodoro } = usePomodoro(50);

  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);

  const getNextGroqKey = useCallback(() => {
    return [
      import.meta.env.VITE_GROQ_API_KEY,
      import.meta.env.VITE_GROQ_API_KEY_5,
      import.meta.env.VITE_GROQ_API_KEY_6,
      import.meta.env.VITE_GROQ_API_KEY_7
    ].filter(Boolean);
  }, []);
  const [newBadge, setNewBadge] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCat, setFilterCat] = useState("Toutes");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterLevel, setFilterLevel] = useState("Tous");

  const filteredExps = useMemo(() => {
    return (expressions || []).filter((exp) => {
      if (!exp) return false;
      const matchesSearch =
        !searchQuery ||
        (exp.front && exp.front.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (exp.back && exp.back.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (exp.example && exp.example.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCat = filterCat === "Toutes" || exp.category === filterCat;
      const matchesLevel =
        filterLevel === "Tous" ||
        (filterLevel === "Appris" ? (exp.level || 0) >= 4 : (exp.level || 0) < 4);
      return matchesSearch && matchesCat && matchesLevel;
    });
  }, [expressions, searchQuery, filterCat, filterLevel]);

  // Étude libre
  const [studyQueue, setStudyQueue] = useState([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyModule, setStudyModule] = useState("");
  const [studyLearnedIds, setStudyLearnedIds] = useState([]);
  const studyGoPrev = useCallback(() => setStudyIndex((i) => Math.max(0, i - 1)), []);
  const studyGoNext = useCallback(() => setStudyIndex((i) => Math.min(studyQueue.length - 1, i + 1)), [studyQueue.length]);
  const markStudyCardLearned = useCallback((id) => {
    setStudyLearnedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);
  const unpauseCard = useCallback((id) => {
    setExpressions((prev) => prev.map((e) => (e.id === id ? { ...e, paused: false } : e)));
  }, [setExpressions]);

  // (États de session de révision FSRS gérés par useReviewSession)
  const [evalLoading, setEvalLoading] = useState(false);
  const [semanticLoading, setSemanticLoading] = useState(false);
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

  // ── GOD LEVEL UX: Slash Commands & Selection Menu ──
  const [slashMenu, setSlashMenu] = useState({ open: false, field: null, query: "", selectedIndex: 0 });
  const [selectionMenu, setSelectionMenu] = useState({ open: false, field: null, text: "", start: 0, end: 0 });

  // ── GOD LEVEL UX: Source & Forge Split Screen ──
  const [dragOverForge, setDragOverForge] = useState(false);
  const [dropForgeLoading, setDropForgeLoading] = useState(false);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeAllLoading, setOptimizeAllLoading] = useState(false);
  const [optimizeAllProgress, setOptimizeAllProgress] = useState({ done: 0, total: 0 });
  const [leechRescueLoading, setLeechRescueLoading] = useState(false);

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



  const [newCat, setNewCat] = useState({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#8B5CF6" });
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
  const { playCorrect, playHard, playAgain, playRating, playCombo, playChest } = useAudioFeedback();
  const fireConfetti = useConfetti();
  const highlightCode = useHighlight();
  const renderMermaid = useMermaid();

  const [sessionMode, setSessionMode] = useState("standard");
  // ── Couche 5 : invitation « production » universelle en fin de session ──
  const [productionInvite, setProductionInvite] = useState(null);   // { items: [...] }
  const [productionDraft, setProductionDraft] = useState({});       // { [cardId]: phrase }
  const [productionResult, setProductionResult] = useState({});     // { [cardId]: { correct, feedback } }
  const [productionBusy, setProductionBusy] = useState(null);       // id en cours de validation
  // ── Couche 7 : journal quotidien de charge (calibration des seuils) ─────
  const [reviewLoadLog, setReviewLoadLog] = useState(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(REVIEW_LOAD_LOG_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [sessionSummary, setSessionSummary] = useState(null);
  const sessionTimerRef = useRef(null);

  const [retentionCurvePoints, setRetentionCurvePoints] = useState([]);
  const [cardsToForget, setCardsToForget] = useState([]);
  const [weeklyLoad, setWeeklyLoad] = useState([]);

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
  const [stamina, setStamina] = useState(100);
  const [xpBurst, setXpBurst] = useState(null); // { amount: number, key: number }
  const [dashWidgets, setDashWidgets] = useState([
    "overview", "mission", "weekly", "plan", "retention", "modules", "quote", "goals"
  ]); // widgets visibles (ordre)
  // Chantier 6 : comparaison « vs toi-même » (remplace le classement simulé)
  const [dashSelfCompare, setDashSelfCompare] = useState(null);
  // ── STATS GOD LEVEL v10 — CALCULS DYNAMIQUES RÉACTIFS ──
  const statsDailyProgress = useMemo(
    () => computeDailyProgress(sessions, expressions, 30),
    [sessions, expressions]
  );
  const statsRetentionCurve = useMemo(
    () => computeRetentionCurve(expressions, 30),
    [expressions]
  );
  const statsModuleComparison = useMemo(
    () => computeModuleComparison(categories, expressions),
    [categories, expressions]
  );
  const statsDifficultyDistribution = useMemo(
    () => computeDifficultyDistribution(expressions),
    [expressions]
  );
  const statsTopDifficult = useMemo(
    () => computeTopDifficultCards(expressions, 5),
    [expressions]
  );
  const statsDayOfWeekPerformance = useMemo(
    () => computeDayOfWeekPerformance(sessions, expressions),
    [sessions, expressions]
  );
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
  const [selectionMode, setSelectionMode] = useState(false); // Active via bouton "Sélection" — clic simple = coche
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
  // Passive + rAF-throttlé + on ne setState QUE quand on franchit le seuil,
  // sinon on force un re-render de tout MemoMaster (10 000 lignes) à chaque
  // pixel scrollé → gros freeze visible à la molette / au drag mobile.
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    let ticking = false;
    let lastState = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const next = window.scrollY > 20;
        if (next !== lastState) {
          lastState = next;
          setIsScrolled(next);
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── MOBILE DETECTION ───────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileFabOpen, setMobileFabOpen] = useState(false);
  const [mobileAddSheetOpen, setMobileAddSheetOpen] = useState(false);

  const touchMainStartX = useRef(0);
  const touchMainStartY = useRef(0);
  const mainViewOrder = ["dashboard", "list", "add", "projects", "certifications", "opensource", "practice"];
  useEffect(() => {
    // Un seul et même seuil pour le JS, le matchMedia du home et le CSS.
    const mql = window.matchMedia(MOBILE_MQ);
    const handleResize = () => setIsMobile(mql.matches);
    mql.addEventListener?.("change", handleResize);
    window.addEventListener("resize", handleResize);
    return () => {
      mql.removeEventListener?.("change", handleResize);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    // ⚡ Avant : setInterval(1s) → re-render de MemoMaster (10k lignes) chaque seconde,
    // ce qui provoquait des micro-freezes visibles pendant le scroll.
    // Maintenant : tick toutes les 30s (l'horloge n'a que la précision minute,
    // et la session est affichée en minutes). ≈ 60× moins de re-renders.
    const tick = () => {
      const now = new Date();
      setSidebarClock(now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      setAppSessionTime(prev => prev + 30);
    };
    tick();
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Rafraîchit la date courante à minuit pour forcer le recalcul de todayReviews
  const [currentDate, setCurrentDate] = useState(today());
  // Rafraîchit la date courante à minuit ET dès que l'appli reprend le focus
  // (indispensable pour le PWA mobile laissé ouvert toute la nuit : setTimeout
  // n'est pas fiable en arrière-plan → PC et mobile affichaient des compteurs
  // différents parce que `currentDate` restait figée sur la veille côté mobile).
  useEffect(() => {
    const refreshIfStale = () => {
      const t = today();
      setCurrentDate((prev) => (prev !== t ? t : prev));
    };
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now + 500;
    const timer = setTimeout(refreshIfStale, msUntilMidnight);
    const onVis = () => { if (document.visibilityState === "visible") refreshIfStale(); };
    window.addEventListener("focus", refreshIfStale);
    window.addEventListener("pageshow", refreshIfStale);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refreshIfStale);
      window.removeEventListener("pageshow", refreshIfStale);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [currentDate]);

  // Couche 6 : un SEUL critère de maîtrise (cardStatus.isCardMastered) —
  // fini les `level >= 7` inline incohérents avec l'état FSRS.
  // Couche 9 : `isDueCard` est désormais LE seul filtre "due" de toute l'app.
  const todayReviews = useMemo(() => getDueCards(expressions, currentDate), [expressions, currentDate]);

  const reviewedTodayIds = useMemo(() => {
    return expressions
      .filter(e => {
        if (!e.reviewHistory || !Array.isArray(e.reviewHistory)) return false;
        return e.reviewHistory.some(h => h.date === currentDate);
      })
      .map(e => e.id);
  }, [expressions, currentDate]);
  const masteredCount = useMemo(() => countMasteredCards(expressions), [expressions]);

  // ── Couche 3 : budget d'entrée des fiches jamais vues ───────────────────
  // `todayReviews` reste le TOTAL réel de la pile (badges/stats non faussés) :
  // seule la SESSION est plafonnée (couche 2) et le débit d'entrée limité.
  const NEW_CARD_INTAKE_KEY = "memomaitre_newCardIntake_v1";
  const [newCardIntake, setNewCardIntake] = useState(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(NEW_CARD_INTAKE_KEY) : null;
      return normalizeIntakeState(raw ? JSON.parse(raw) : null, today());
    } catch { return makeIntakeState(today()); }
  });
  useEffect(() => {
    try { localStorage.setItem(NEW_CARD_INTAKE_KEY, JSON.stringify(newCardIntake)); } catch { /* quota / SSR */ }
  }, [newCardIntake]);
  useEffect(() => {
    setNewCardIntake((prev) => normalizeIntakeState(prev, currentDate));
  }, [currentDate]);

  // Taille de la pile de RÉVISION (hors fiches jamais vues) : signal commun
  // aux couches 2 et 3.
  const reviewPileSize = useMemo(() => todayReviews.filter((e) => !isNewCard(e)).length, [todayReviews]);
  const newCardBudget = useMemo(() => getNewCardBudget(reviewPileSize), [reviewPileSize]);
  const newCardsRemainingToday = remainingIntake(newCardIntake, newCardBudget);

  // ══ COUCHE 9 : PLAN DU JOUR PERSISTANT (source de vérité unique) ═════════
  // Avant : la session était recomposée à chaque rendu depuis la pile due, donc
  // le compteur restait bloqué sur 35 quoi qu'on révise, le quota se rechargeait
  // à l'infini, et chaque module comptait la pile brute (somme >> total affiché).
  // Maintenant : un plan scellé le matin (mêmes fiches, même ordre, plafond figé),
  // dont on retire les fiches faites. Persisté ⇒ survit à un refresh / une sortie.
  const [dailyPlanState, setDailyPlanState] = useState(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DAILY_PLAN_STORAGE_KEY) : null;
      return normalizeDailyPlan(raw ? JSON.parse(raw) : null, today());
    } catch { return normalizeDailyPlan(null, today()); }
  });
  useEffect(() => {
    setDailyPlanState((prev) => normalizeDailyPlan(prev, currentDate));
  }, [currentDate]);

  // Le plan respecte le budget d'entrée des fiches jamais vues (couche 3) :
  // sans ce filtre, un plan de 35 pouvait être rempli de 35 fiches neuves.
  const dailyEligiblePool = useMemo(() => {
    const { newCards, reviewCards } = splitNewAndReview(todayReviews);
    const admitted = new Set(newCardIntake?.admittedIds || []);
    const slots = Math.max(0, newCardBudget - admitted.size);
    const already = newCards.filter((c) => admitted.has(c.id));
    const fresh = newCards.filter((c) => !admitted.has(c.id)).slice(0, slots);
    return [...reviewCards, ...already, ...fresh];
  }, [todayReviews, newCardIntake, newCardBudget]);

  const dailyPlanResult = useMemo(
    () => buildDailyPlan({ plan: dailyPlanState, dueCards: dailyEligiblePool, todayISO: currentDate, reviewedTodayIds }),
    [dailyPlanState, dailyEligiblePool, currentDate, reviewedTodayIds],
  );

  // Persistance + resynchronisation du plan (sans boucle de rendu : on ne
  // réécrit le state que si le plan a réellement changé).
  useEffect(() => {
    const next = dailyPlanResult.plan;
    setDailyPlanState((prev) => {
      if (prev
        && prev.date === next.date
        && prev.target === next.target
        && prev.sealed === next.sealed
        // `sealedAt` DOIT être comparé : sinon le plan gardait `sealedAt: null`,
        // un nouvel horodatage était généré à chaque rendu, et la publication
        // vers Firestore repartait en boucle (écritures inutiles + arbitrage
        // instable entre appareils).
        && prev.sealedAt === next.sealedAt
        && prev.ids.length === next.ids.length
        && prev.doneIds.length === next.doneIds.length
        && prev.ids.every((id, i) => id === next.ids[i])
        && prev.doneIds.every((id, i) => id === next.doneIds[i])
      ) return prev;
      try { localStorage.setItem(DAILY_PLAN_STORAGE_KEY, JSON.stringify(next)); } catch { /* quota / SSR */ }
      return next;
    });
  }, [dailyPlanResult]);

  // ══════════════════════════════════════════════════════════════════════════
  // 🔗 ÉTAT DU JOUR PARTAGÉ (temps réel, mobile ⇄ PC)
  // ══════════════════════════════════════════════════════════════════════════
  // LE bug « 34 sur le PC, 31 sur le téléphone » venait d'ici : le plan du jour
  // (donc le compteur affiché) ne vivait QUE dans le localStorage de chaque
  // appareil. Aucune synchro de fiches ne pouvait le corriger.
  //
  // Désormais le plan du jour + les fiches déjà révisées aujourd'hui + le quota
  // de nouvelles fiches admises voyagent dans UN document Firestore écouté en
  // temps réel (users/{uid}/day_state/{date}) :
  //   • réviser 3 fiches sur le téléphone → le PC passe de 34 à 31 en ~1 s,
  //     sans rechargement ;
  //   • fusion par UNION → aucune révision perdue, même faite hors ligne des
  //     deux côtés ;
  //   • coût : 1 document lu par changement, écritures regroupées (800 ms).
  const dayStateSyncedRef = useRef(null);
  const dayStateReadyRef = useRef(false);

  // Applique un état distant : fusion avec l'état local, puis mise à jour du
  // plan ET du quota de fiches neuves (les deux doivent être identiques sur les
  // deux appareils, sinon les plans divergeraient à nouveau).
  const applyRemoteDayState = useCallback((remote) => {
    if (!remote) return;
    const normalized = normalizeDayState(remote, currentDate);
    if (normalized.date !== currentDate) return;

    setDailyPlanState((prev) => {
      const local = dayStateFromLocal({ plan: normalizeDailyPlan(prev, currentDate), dateISO: currentDate });
      const merged = mergeDayState(local, normalized);
      dayStateSyncedRef.current = merged;
      const nextPlan = dayStateToPlan(merged, currentDate);
      const prevPlan = normalizeDailyPlan(prev, currentDate);
      if (
        prevPlan.target === nextPlan.target
        && prevPlan.sealedAt === nextPlan.sealedAt
        && prevPlan.ids.length === nextPlan.ids.length
        && prevPlan.doneIds.length === nextPlan.doneIds.length
        && prevPlan.ids.every((id, i) => id === nextPlan.ids[i])
      ) return prev;
      try { localStorage.setItem(DAILY_PLAN_STORAGE_KEY, JSON.stringify(nextPlan)); } catch { /* quota / SSR */ }
      console.info(`[day-state] Plan du jour aligné sur les autres appareils — ${nextPlan.ids.length} fiches, ${nextPlan.doneIds.length} faites.`);
      return nextPlan;
    });

    if (normalized.admittedIds.length > 0) {
      setNewCardIntake((prev) => {
        const base = normalizeIntakeState(prev, currentDate);
        const known = new Set(base.admittedIds || []);
        const missing = normalized.admittedIds.filter((id) => !known.has(id));
        if (missing.length === 0) return prev;
        return { ...base, admittedIds: [...(base.admittedIds || []), ...missing] };
      });
    }
  }, [currentDate]);

  // ── Abonnement temps réel + rattrapage au démarrage ──────────────────────
  useEffect(() => {
    const uid = getFbUser();
    if (!uid) return;
    let cancelled = false;
    dayStateReadyRef.current = false;

    (async () => {
      const remote = await fetchDayState(uid, currentDate);
      if (cancelled) return;
      if (remote) applyRemoteDayState(remote);
      // Tant que le rattrapage initial n'est pas fait, on ne publie rien :
      // sinon un appareil en retard pourrait sceller un plan concurrent.
      dayStateReadyRef.current = true;
    })();

    const unsubscribe = subscribeDayState(uid, currentDate, (remote) => {
      if (cancelled) return;
      dayStateReadyRef.current = true;
      applyRemoteDayState(remote);
    });

    const flushOnHide = () => { if (document.visibilityState === "hidden") flushDayStateNow(); };
    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushDayStateNow);

    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("pagehide", flushDayStateNow);
      flushDayStateNow();
    };
  }, [currentDate, applyRemoteDayState]);

  // ── Publication de l'état local dès qu'il change ─────────────────────────
  useEffect(() => {
    const uid = getFbUser();
    if (!uid || !dayStateReadyRef.current) return;
    const local = dayStateFromLocal({
      plan: dailyPlanResult.plan,
      admittedIds: newCardIntake?.admittedIds || [],
      dateISO: currentDate,
    });
    if (local.ids.length === 0 && local.doneIds.length === 0) return;
    const merged = dayStateSyncedRef.current ? mergeDayState(dayStateSyncedRef.current, local) : local;
    if (dayStateSyncedRef.current && dayStatesEqual(dayStateSyncedRef.current, merged)) return;
    dayStateSyncedRef.current = merged;
    publishDayState(uid, currentDate, merged);
  }, [dailyPlanResult, newCardIntake, currentDate]);

  /** Marque une fiche comme traitée aujourd'hui (appelé à chaque notation). */
  const consumeDailyPlanCard = useCallback((cardId) => {
    setDailyPlanState((prev) => {
      const next = markCardDone(prev, cardId, today());
      try { localStorage.setItem(DAILY_PLAN_STORAGE_KEY, JSON.stringify(next)); } catch { /* quota / SSR */ }
      return next;
    });
  }, []);

  // Fiches RESTANTES du jour : l'unique nombre affiché partout (nav, sidebar,
  // dashboard, constellation, modules, agent IA).
  const dailySessionPreview = dailyPlanResult.remaining;
  const sessionRemainingCount = dailyPlanResult.remainingCount;
  const sessionDoneToday = dailyPlanResult.doneCount;
  const sessionPlannedToday = dailyPlanResult.plannedCount;
  const dailyTargetToday = dailyPlanResult.target;
  const dailyPlanCompleted = dailyPlanResult.completed;
  const duePileSize = todayReviews.length;
  // Couche 4 : leeches sévères qui ne sont PAS déjà dans la session du jour.
  const proactiveLeeches = useMemo(() => {
    const inSession = new Set(dailySessionPreview.map((c) => c.id));
    return pickLeeches(expressions, 6).filter((c) => !inSession.has(c.id)).slice(0, 3);
  }, [expressions, dailySessionPreview]);

  // ── HOOKS MÉTIER SPÉCIALISÉS (Étape 13) ──
  const {
    versionHistory,
    saveVersion,
    handleRestoreVersion,
    startEdit,
    cancelEdit,
    deleteExp,
    addCardsFromLab,
  } = useExpressionsManager({
    expressions,
    setExpressions,
    addForm,
    setAddForm,
    editingId,
    setEditingId,
    setAddAudioUrl,
    setAddReformulations,
    setAddMetaphoreText,
    setAddDoublonCheck,
    editReturnTo,
    setEditReturnTo,
    setView,
    showToast,
    callClaude,
    playSound,
    storage,
  });

  const {
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
  } = useReviewSession({
    expressions,
    setExpressions,
    categories,
    dailyPlanResult,
    dailySessionPreview,
    todayReviews,
    dailyTargetToday,
    dailyPlanCompleted,
    duePileSize,
    sessionDoneToday,
    setNewCardIntake,
    consumeIntakeSlot,
    setView,
    showToast,
    awardSource,
    haptic,
    playSound,
  });


  const {
    lofiPlaying,
    setLofiPlaying,
    lofiVolume,
    setLofiVolume,
    lofiStation,
    setLofiStation,
    showLofiPlayer,
    setShowLofiPlayer,
    audioRef,
    isOnline,
    downloadedIds,
    dlProgress,
    dlAllProgress,
    offlineSize,
    trackSrc,
    currentTrack,
    handleDownloadTrack,
    handleDeleteTrack,
    handleDownloadAll,
  } = useFocusRadio({ showToast });






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
  const [lessonCache, setLessonCache] = useState({});
  const [livingMemory, setLivingMemory] = useState(null);
  const [projectPomodoroActive, setProjectPomodoroActive] = useState(false);
  const [projectPomodoroTime, setProjectPomodoroTime] = useState(25 * 60);
  const [projectPomodoroMode, setProjectPomodoroMode] = useState("study"); // study | project | break
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
        const { repaired: expsRepairedRaw, count: dateFixCount } = repairCardDates(exps || []);
        // Phase 1 — rétro-compat : chaque fiche reçoit un masteryStage dérivé si absent.
        const expsRepaired = expsRepairedRaw.map(ensureMasteryStage);
        if (dateFixCount > 0) console.info(`[dateRepair] ${dateFixCount} fiches avec dates anormales corrigées.`);
        setExpressions(expsRepaired);
        setCategories(reconcileCategoriesWithExpressions(mergeDefaultCategories(cats), expsRepaired));
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
        const resolvedCats = mergeDefaultCategories(cats);
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
          const expsRepaired2 = repairCardDates(exps || []).repaired.map(ensureMasteryStage);
          setExpressions(expsRepaired2);
          // FIX : ne jamais passer `undefined` à setCategories — sinon les
          // composants qui appellent categories.map / .filter plantent.
          setCategories(reconcileCategoriesWithExpressions(mergeDefaultCategories(cats), expsRepaired2));
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
        setExpressions(repaired.map(ensureMasteryStage));
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

  // CHANTIER 1 — Migration douce : au 1er chargement post-mise à jour, on
  // crédite l'équivalent de l'ancien powerLevel dérivé (une seule fois).
  useEffect(() => {
    if (!loaded || !xpLoaded) return;
    migrateOnce({
      cards: expressions.length,
      streak: stats.streak || 0,
      examsDone: stats.examsDone || 0,
      badges: unlockedBadges.length,
    });
  }, [loaded, xpLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Purge des badges morts (catégorie « Héritage » supprimée — chantier 3).
  useEffect(() => {
    if (!loaded) return;
    setUnlockedBadges((prev) => {
      const cleaned = prev.filter((id) => !RETIRED_BADGE_IDS.includes(id));
      return cleaned.length === prev.length ? prev : cleaned;
    });
  }, [loaded]);

  // Défilement de la file de badges : un toast après l'autre.
  useEffect(() => {
    if (badgeQueue.length === 0) return;
    setNewBadge(badgeQueue[0]);
    // CHANTIER 17 — signature haptique du badge : le corps sait avant l'œil.
    haptic("badge", badgeQueue[0]?.rarity);
    const t = setTimeout(() => {
      setNewBadge(null);
      setBadgeQueue((q) => q.slice(1));
    }, 2600);
    return () => clearTimeout(t);
  }, [badgeQueue]);

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

  // ── CHANTIER 4 : construction de l'état des badges avec une maîtrise
  // DÉSAMBIGUÏSÉE — `plannedMastered` (FSRS / planification) vs `produced` et
  // `masteredReal` (production réelle, masteryStages.js).
  const buildBadgeState = useCallback((exps, st) => {
    const breakdown = getMasteryBreakdown(exps);
    const xp = xpRef.current || { totalXP: 0, bestCombo: 0 };
    const level = getArchetype(xp.totalXP || 0).level;
    return {
      totalCards: exps.length,
      streak: st?.streak || 0,
      longestStreak: st?.longestStreak || 0,
      // Maîtrise « planifiée » (FSRS + legacy level) — critère unique cardStatus.
      plannedMastered: countMasteredCards(exps),
      // Maîtrise « réelle » (production active, masteryStages.js)
      produced: (breakdown.produced || 0) + (breakdown.mastered || 0),
      masteredReal: breakdown.mastered || 0,
      recalledNotProduced: breakdown.recalled || 0,
      dueCount: getDueCards(exps, today()).length, // critère « dû » unique (couche 9)
      totalReviews: st?.totalReviews || 0,
      aiGenerated: st?.aiGenerated || 0,
      lateNightSessions: st?.lateNightSessions || 0,
      earlyMorningSessions: st?.earlyMorningSessions || 0,
      bestDayReviews: st?.bestDayReviews || 0,
      pomodorosDone: st?.pomodorosDone || 0,
      pdfsAnalyzed: st?.pdfsAnalyzed || 0,
      leechesRescued: st?.leechesRescued || 0,
      freezesUsed: st?.freezesUsed || 0,
      streakRepairs: st?.streakRepairs || 0,
      modulesCount: categoriesRef.current?.length || 0,
      totalXP: xp.totalXP || 0,
      bestCombo: xp.bestCombo || 0,
      // CHANTIER 26 — les badges « Discipline » lisent le streak de routine.
      routinePerfectDays: routineRef.current?.routineStats?.perfectDays || 0,
      routineStreak: routineRef.current?.routineStreak || 0,
      level,
    };
  }, []);

  // ── CHANTIER 18 — progression réelle des badges, réutilisée par le
  //    near-miss du hero mobile (« Encore 3 fiches pour le badge X »). ──
  const badgeProgressForHooks = useMemo(() => {
    try {
      const state = buildBadgeState(expressions, stats);
      const done = new Set(unlockedBadges || []);
      return BADGES
        .filter((b) => !done.has(b.id) && typeof b.progress === "function")
        .map((b) => ({ label: b.label, icon: b.icon, ...b.progress(state) }))
        .filter((b) => b.max > 0 && b.cur < b.max);
    } catch { return []; }
  }, [buildBadgeState, expressions, stats, unlockedBadges]);

  const checkBadges = useCallback((exps, st, sess, currentBadges) => {
    const state = buildBadgeState(exps, st);
    const already = new Set(currentBadges || []);
    const newlyUnlocked = BADGES.filter((b) => !already.has(b.id) && b.check(state));
    if (newlyUnlocked.length > 0) {
      setUnlockedBadges((prev) => Array.from(new Set([...prev, ...newlyUnlocked.map((b) => b.id)])));
      // Chantier 3 : TOUS les badges débloqués sont notifiés (file d'attente).
      setBadgeQueue((q) => [...q, ...newlyUnlocked]);
    }
  }, [buildBadgeState]);



  // ── Couche 7 : instrumentation (journal local, aucune dépendance externe) ──
  useEffect(() => {
    try { localStorage.setItem(REVIEW_LOAD_LOG_KEY, JSON.stringify(reviewLoadLog)); } catch { /* quota / SSR */ }
  }, [reviewLoadLog]);

  const logReviewLoad = useCallback((delta) => {
    setReviewLoadLog((prev) => appendDailyLog(prev, today(), delta));
  }, []);

  // Garde-fou création (INFORMATIF, jamais bloquant) : couvre TOUS les points
  // d'entrée de nouvelles fiches — génération IA, ajout manuel, import ET
  // fiches nées d'un sauvetage de leech « ATOMISER ».
  const notifyCardsCreated = useCallback((count) => {
    const n = Number(count) || 0;
    if (n <= 0) return;
    logReviewLoad({ newCardsCreated: n });
    awardSource("CARD_CREATED", { streak: statsRef.current?.streak || 0, qty: n, silent: true });
    trackQuest({ cardsCreated: n });
    setExpressions((prev) => {
      const guard = checkCreationGuard(prev);
      if (guard.warn) setTimeout(() => showToast(guard.message, "info"), 800);
      return prev;
    });
  }, [logReviewLoad, showToast]);

  const updateStreakAfterSession = useCallback((count) => {
    const todayStr = today();
    const hour = new Date().getHours();
    const bonusTokens = bonusFreezeTokens(getArchetype(xpRef.current?.totalXP || 0).level);
    setStats((prev) => {
      // ── CHANTIER 2 : plus de reset brutal. Les jours manqués sont d'abord
      // absorbés par les jetons de gel ; sinon le streak casse mais reste
      // réparable pendant 24h (rattrapage, 1×/mois).
      const { stats: advanced, outcome, frozenDays } = advanceStreak(prev, todayStr, bonusTokens);

      const lateNight = (hour >= 0 && hour < 5) ? (prev.lateNightSessions || 0) + 1 : (prev.lateNightSessions || 0);
      const earlyMorning = (hour >= 5 && hour < 7) ? (prev.earlyMorningSessions || 0) + 1 : (prev.earlyMorningSessions || 0);
      const todayTotal = (prev.lastSession === todayStr ? (prev.todayReviews || 0) : 0) + count;
      const bestDayReviews = Math.max(prev.bestDayReviews || 0, todayTotal);

      if (outcome === "frozen") {
        setTimeout(() => showToast(`🧊 ${frozenDays} jour${frozenDays > 1 ? "s" : ""} manqué${frozenDays > 1 ? "s" : ""} absorbé${frozenDays > 1 ? "s" : ""} — streak préservé (${Math.max(0, (advanced.freezeTokens || 0))} jeton(s) restant(s)).`, "info"), 400);
      } else if (outcome === "broken" && (prev.streak || 0) >= 3) {
        setTimeout(() => showToast("💔 Streak interrompu — tu peux le réparer dans les 24h avec une session de rattrapage.", "info"), 400);
      }

      const newStats = {
        ...advanced,
        totalReviews: (prev.totalReviews || 0) + count,
        lateNightSessions: lateNight,
        earlyMorningSessions: earlyMorning,
        todayReviews: todayTotal,
        bestDayReviews,
        freezesUsed: (prev.freezesUsed || 0) + (outcome === "frozen" ? frozenDays : 0),
      };
      statsRef.current = newStats;
      return newStats;
    });
    setSessions((prev) => {
      const existing = prev.find((s) => s.date === todayStr);
      if (existing) return prev.map((s) => s.date === todayStr ? { ...s, count: s.count + count } : s);
      return [...prev, { date: todayStr, count }];
    });
  }, [showToast]);

  // ── CHANTIER 2 : rattrapage d'un streak cassé (fenêtre 24h, 1×/mois) ────
  const attemptStreakRepair = useCallback((reviewsInSession) => {
    const st = statsRef.current || {};
    if (!canRepairStreak(st, Date.now(), today())) return false;
    if ((reviewsInSession || 0) < 10) return false;
    const { stats: repaired, restored } = repairStreak(st, today());
    const withCount = { ...repaired, streakRepairs: (st.streakRepairs || 0) + 1 };
    statsRef.current = withCount;
    setStats(withCount);
    awardSource("STREAK_REPAIRED", { streak: restored });
    showToast(`🛠️ Streak réparé — te revoilà à ${restored} jours !`, "success");
    return true;
  }, [awardSource, showToast]);

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
    // CHANTIER 10 : signature sonore DIFFÉRENCIÉE par note (Again/Hard/Good/Easy).
    playRating(q);

    // Decrease stamina
    const staminaCost = q === 0 ? 5 : q === 1 ? 3 : 1; // More cost for wrong answers
    setStamina(s => Math.max(0, s - staminaCost));

    // FIX D1 — on passe lastReviewDate dans fsrs() pour que elapsedDays soit
    // calculé depuis la date de révision réelle (pas depuis nextReview).
    // elapsedDays: null → fsrs.js sélectionne le meilleur chemin de calcul.
    const updated = fsrs({ ...exp, elapsedDays: null }, q);
    // newLevel : q=0 → retour à 0 | q=1 (Hard) → reste au niveau actuel | q=5 → +1
    const newLevel = q === 0 ? 0 : q === 1 ? Math.max(exp.level, 1) : Math.min(7, exp.level + 1);
    // FIX D5 — reviewHistoryEntry retourné par fsrs() est enrichi de newLevel
    // et mergé dans reviewHistory. Cela alimente analyzeLeech() / pickLeeches()
    // correctement (le champ q est requis par analyzeLeech).
    const histEntry = { ...updated.reviewHistoryEntry, newLevel };
    const _newLapse = nextLapseCount(exp, q);
    setExpressions(prev => prev.map(e => e.id === exp.id ? { ...e, ...updated, level: newLevel, reviewHistory: [...(e.reviewHistory || []), histEntry], lapseCount: _newLapse } : e));

    if (newLevel >= 7 && exp.level < 7) {
      fireConfetti();
      showToast("🎉 Fiche maîtrisée ! Confetti !", "success");
    }

    // ── Auto-détection du style d'apprentissage (après 10 révisions) ──

    // ── CHANTIER 1 : XP réelle par révision (difficulté + combo + streak) ──
    const gain = awardReview(q, statsRef.current?.streak || 0);
    setXpBurst({ amount: gain.amount, key: Date.now(), combo: gain.comboLabel });
    // CHANTIER 10 : son dédié au franchissement d'un palier de combo.
    if (gain.comboLabel && gain.comboCount && [3, 5, 10, 20].includes(gain.comboCount)) {
      playCombo(gain.comboCount >= 20 ? 4 : gain.comboCount >= 10 ? 3 : gain.comboCount >= 5 ? 2 : 1);
    }
    // CHANTIER 8 : événement optionnel `bonusRoll` (coffre surprise).
    if (gain.bonusRoll) playChest(gain.bonusRoll.rarity);
    // CHANTIER 9 : progression des quêtes du jour / de la semaine.
    trackQuest({
      reviews: 1,
      goodReviews: q >= 3 ? 1 : 0,
      bestCombo: gain.comboCount || 0,
      xp: gain.amount,
      chests: gain.bonusRoll ? 1 : 0,
    });
    setTimeout(() => setXpBurst(null), 2500);
    // Maîtrise réellement atteinte (critère unifié) → XP dédiée.
    if (!isCardMastered(exp) && isCardMastered({ ...exp, ...updated, level: newLevel })) {
      awardSource("CARD_MASTERED", { streak: statsRef.current?.streak || 0, silent: true });
    }

    // ── COUCHE 9 : la fiche est consommée dans le plan du jour ────────────
    // Même notée « Again » (elle reste due, mais elle a été TRAVAILLÉE
    // aujourd'hui) : c'est ce qui fait réellement descendre le compteur.
    consumeDailyPlanCard(exp.id);

    const done = reviewSessionDone + 1;
    setReviewSessionDone(done);
    updateStreakAfterSession(1);

    // ── COUCHE 9 bis : étape de RÉAPPRENTISSAGE dans la session ───────────
    // Une fiche ratée (« Again ») ne doit pas simplement disparaître jusqu'à
    // demain : on la replace quelques cartes plus loin DANS la session en
    // cours (comme les learning steps d'Anki). Elle ne recompte PAS dans le
    // plan du jour (déjà consommée), donc le compteur continue de descendre.
    if (q === 0 && !exp._relearn) {
      const nq = [...reviewQueue];
      nq.splice(Math.min(nq.length, reviewIndex + 4), 0, { ...exp, _relearn: true });
      setReviewQueue(nq);
      setReviewIndex(i => i + 1);
      setRevealed(false);
      setUserAnswer("");
      setSocraticHint("");
      setSocraticMode(false);
      setRabbitHoleOpen(false);
      setMnemonicText("");
      setMnemonicSaved(false);
      setCardStartTime(Date.now());
      return;
    }

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
      // ── COUCHE 5 : filet de sécurité « production » universel ───────────
      // Actif quelle que soit la vue (et pas seulement EnglishPractice /
      // EnglishInTheWild) : c'est la condition qui rend sûre la levée du
      // plafond FSRS pour les fiches `recalled` (couche 1).
      try {
        const rawLast = typeof localStorage !== "undefined" ? localStorage.getItem(PRODUCTION_PROMPT_STORAGE_KEY) : null;
        const lastAt = rawLast ? Number(rawLast) : null;
        if (canPromptProduction(lastAt)) {
          const invite = pickProductionInvite(expressions, sessionCards);
          if (invite.length) {
            setProductionInvite({ items: invite });
            setProductionDraft({});
            setProductionResult({});
            try { localStorage.setItem(PRODUCTION_PROMPT_STORAGE_KEY, String(Date.now())); } catch { /* SSR */ }
          }
        }
      } catch (e) { console.warn("[couche5] invitation production", e); }

      awardSource("SESSION_COMPLETED", { streak: statsRef.current?.streak || 0, silent: true });
      trackQuest({
        sessions: 1,
        earlySession: new Date().getHours() < 10 ? 1 : 0,
        lateSession: new Date().getHours() >= 21 ? 1 : 0,
      });
      attemptStreakRepair(done);
      resetCombo();
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
  }, [playRating, playCombo, playChest, trackQuest, fireConfetti, reviewIndex, reviewQueue, reviewSessionDone, sessionTimer, expressions, sessions, unlockedBadges, updateStreakAfterSession, checkBadges, showToast, consumeDailyPlanCard]);

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

  // (addCardsFromLab géré par useExpressionsManager)

  // ── Bridge Académie → FSRS ────────────────────────────────────────────────
  // Appelé quand un teach-back est validé : crée 1-3 fiches dans MemoMaster
  // pour révision automatique J+1 / J+7 / J+30.

  // ── Sauver une fiche "leech" (échoue en boucle) : reformulation IA ────────
  const handleRescueLeech = async (targetCard) => {
    const card = targetCard || reviewQueue[reviewIndex];
    if (!card) return;
    setLeechRescueLoading(true);
    playSound("whoosh");
    try {
      const stats = analyzeLeech(card);
      const raw = await callClaude(buildLeechRescuePrompt(), buildLeechRescueUserPayload(card, stats));
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      const cards = Array.isArray(parsed?.cards) ? parsed.cards : [];
      const strategy = parsed?.strategy || "reformulation";
      if (!cards.length) {
        showToast("L'IA n'a rien renvoyé d'utilisable.", "error");
        setLeechRescueLoading(false);
        return;
      }
      try { saveVersion(card.id); } catch (_) { /* saveVersion optionnel */ }

      const first = cards[0];
      const additions = [];
      const now = new Date().toISOString();
      for (let k = 1; k < cards.length; k++) {
        const c = cards[k];
        if (!c || !c.front || !c.back) continue;
        additions.push({
          id: `${card.id}-rescue-${k}-${Math.random().toString(36).slice(2, 8)}`,
          category: card.category,
          type: card.type || "qa",
          front: String(c.front).trim(),
          back: String(c.back).trim(),
          example: String(c.example || "").trim(),
          level: 0, repetitions: 0, stability: null, difficulty: null,
          easeFactor: null, interval: 1, nextReview: today(),
          createdAt: now, updatedAt: now, reviewHistory: [], lapseCount: 0,
          rescuedFrom: card.id, rescueStrategy: strategy,
        });
      }

      setExpressions(prev => {
        const updatedPrev = prev.map(e => e.id === card.id ? {
          ...e,
          front: String(first.front || "").trim() || e.front,
          back: String(first.back || "").trim() || e.back,
          example: String(first.example || "").trim(),
          // reset FSRS pour que la nouvelle formulation reparte de zéro
          level: 0, repetitions: 0, stability: null, difficulty: null,
          easeFactor: null, interval: 1, nextReview: today(),
          lapseCount: 0, // on efface l'historique de lapses pour éviter un flag "leech" persistant
          updatedAt: now,
          rescuedAt: now,
          rescueStrategy: strategy,
        } : e);
        return [...updatedPrev, ...additions];
      });

      // Refléter aussi dans la queue de révision courante (si applicable)
      setReviewQueue(prevQ => prevQ.map(c => c.id === card.id ? {
        ...c,
        front: String(first.front || "").trim() || c.front,
        back: String(first.back || "").trim() || c.back,
        example: String(first.example || "").trim(),
        lapseCount: 0,
      } : c));

      setStats((prev) => ({ ...prev, leechesRescued: (prev.leechesRescued || 0) + 1 }));
      awardSource("LEECH_RESCUED", { streak: statsRef.current?.streak || 0 });
      // Couche 7 : les fiches issues d'un sauvetage « ATOMISER » sont de
      // vraies nouvelles fiches — elles doivent être comptées comme telles.
      if (additions.length) notifyCardsCreated(additions.length);
      showToast(`🩹 Fiche sauvée (${strategy})${additions.length ? ` — +${additions.length} variantes ajoutées` : ""}`);
    } catch (e) {
      showToast("Erreur pendant la reformulation IA.", "error");
    }
    setLeechRescueLoading(false);
  };

  // ── Couche 5 : validation d'une phrase produite (mini-défi de fin de session)
  // Réutilise exactement le critère de validation de useProductiveUse
  // (productionPrompt.js) sans dépendre du composant EnglishPractice.
  const handleValidateProduction = async (card) => {
    const sentence = (productionDraft[card.id] || "").trim();
    if (sentence.length < 3) { showToast("Écris une phrase complète 🙂", "info"); return; }
    setProductionBusy(card.id);
    try {
      const { system, user } = buildProductionValidationPrompt(card, sentence);
      const raw = await callClaude(system, user);
      const parsed = parseProductionValidation(raw);
      setProductionResult((prev) => ({ ...prev, [card.id]: parsed }));
      if (parsed.correct) {
        setExpressions((prev) => prev.map((e) => {
          if (e.id !== card.id) return e;
          const updated = recordProductiveUse(e, { context: "writing", correct: true, note: sentence });
          setTimeout(() => awardSource(updated.masteryStage === "mastered" ? "CARD_MASTERED" : "CARD_PRODUCED", { streak: statsRef.current?.streak || 0 }), 0);
          const srs = fsrsFromProduction({ ...updated, elapsedDays: null });
          return {
            ...updated,
            ...srs,
            reviewHistory: [
              ...(e.reviewHistory || []),
              { date: today(), q: 5, newLevel: e.level ?? 0, interval: srs.interval, source: "production-challenge" },
            ],
          };
        }));
        showToast(`🗣️ "${card.front}" produite en contexte — intervalle allongé`, "success");
      }
    } catch (e) {
      console.warn("[handleValidateProduction]", e);
      showToast("Validation indisponible pour le moment.", "error");
    }
    setProductionBusy(null);
  };

  // ── Couche 3 : apprendre MAINTENANT une fiche jamais vue ─────────────────
  // Consomme un slot du budget du jour (ne le contourne pas). Si le budget est
  // épuisé, on informe explicitement l'utilisateur et on lui laisse un
  // override CONSCIENT plutôt qu'un blocage silencieux.
  const handleLearnNow = (card) => {
    if (!card) return;
    const todayISO = today();
    const state = normalizeIntakeState(newCardIntake, todayISO);
    const already = state.admittedIds.includes(card.id);
    const used = state.admittedIds.length;
    if (!already && remainingIntake(state, newCardBudget) <= 0) {
      const ok = typeof window !== "undefined" && window.confirm(
        `Budget du jour atteint (${used}/${newCardBudget} nouvelles fiches).\n\n` +
        `Cette fiche sera proposée demain automatiquement.\nLa forcer quand même aujourd'hui ?`
      );
      if (!ok) {
        showToast(`Budget du jour atteint (${used}/${newCardBudget}) — cette fiche revient demain.`, "info");
        return;
      }
      showToast("⚠️ Budget dépassé volontairement — attention à la charge de demain.", "info");
    }
    setNewCardIntake(consumeIntakeSlot(state, card.id, todayISO));
    setExpandedCard(null);
    startReview(null, "standard", [card]);
  };

  // ── Démarrer une session « Points faibles » (leeches + due + consolidation)
  const startWeakSpotsSession = () => {
    const target = 20;
    const queue = composeWeakSpotSession(expressions, { target, todayISO: today() });
    if (!queue.length) {
      showToast("Aucune fiche faible détectée — tu maîtrises bien ! 🎯", "info");
      return;
    }
    startReview(null, "standard", queue);
    showToast(`🎯 Session Points Faibles : ${queue.length} fiches ciblées`);
  };

  // ── Restructurer les fiches sélectionnées au format Rétro-Ingénierie Sémantique ──
  // ⚠️ `selectedCards` contient des IDS (mode God Hand), pas des objets fiche :
  // on résout donc les vraies fiches avant d'appeler le service, sinon le LLM
  // recevait des strings (front/back undefined) et rien n'était restructuré.
  const handleRestructureSelectedRetroEngineering = async () => {
    const targets = selectedCards.length > 0
      ? expressions.filter(e => selectedCards.includes(e.id))
      : (filteredExps.length ? filteredExps : expressions);
    if (!targets.length) {
      showToast("Aucune fiche sélectionnée.", "info");
      return;
    }
    setOptimizeAllLoading(true);
    setOptimizeAllProgress({ done: 0, total: targets.length });
    try {
      await restructureSelectedCards({
        selectedCards: targets,
        allCards: expressions,
        setExpressions,
        callClaude,
        showToast,
        onProgress: (cur, tot) => setOptimizeAllProgress({ done: cur, total: tot }),
      });
      setSelectedCards([]);
      setSelectionMode(false);
    } catch (e) {
      console.warn("[restructure] ", e);
      showToast("Erreur lors de la restructuration.", "error");
    } finally {
      setOptimizeAllLoading(false);
      setOptimizeAllProgress({ done: 0, total: 0 });
    }
  };


  // ── Optimiser un lot de fiches quelconque (viser ~100% rétention FSRS) ──
  const runOptimizeBatch = async (targets, confirmMsg) => {
    if (!targets.length) {
      showToast("Aucune fiche à optimiser.", "info");
      return;
    }
    if (!window.confirm(confirmMsg)) return;

    setOptimizeAllLoading(true);
    setOptimizeAllProgress({ done: 0, total: targets.length });
    playSound("whoosh");

    const BATCH = 6;
    const systemPrompt = buildOptimizationSystemPrompt();
    const updates = [];
    let ok = 0, fail = 0;

    for (let i = 0; i < targets.length; i += BATCH) {
      const slice = targets.slice(i, i + BATCH);
      const userMsg = JSON.stringify(
        slice.map((c) => ({
          id: c.id,
          front: c.front,
          back: c.back,
          example: c.example || "",
        })),
        null,
        2
      );
      try {
        const raw = await callClaude(systemPrompt, userMsg, { task: "batch-json", json: true, maxTokens: 8000, temperature: 0.3 });
        const batchUpdates = parseOptimizationResponse(raw, slice);
        updates.push(...batchUpdates);
        ok += batchUpdates.length;
        fail += Math.max(0, slice.length - batchUpdates.length);
      } catch (e) {
        console.error("[runOptimizeBatch] batch error:", e);
        fail += slice.length;
      }
      setOptimizeAllProgress({ done: Math.min(i + BATCH, targets.length), total: targets.length });
    }

    if (updates.length === 0) {
      showToast("L'IA n'a renvoyé aucune optimisation utilisable. Réessaie dans un instant.", "error");
      setOptimizeAllLoading(false);
      setOptimizeAllProgress({ done: 0, total: 0 });
      return;
    }

    try {
      updates.forEach((u) => { try { saveVersion(u.sourceId); } catch (_) { } });
    } catch (_) { }

    setExpressions((prev) => applyOptimizationUpdates(prev, updates, today()));

    setOptimizeAllLoading(false);
    setOptimizeAllProgress({ done: 0, total: 0 });
    const totalNew = updates.reduce((acc, u) => acc + u.newCards.length, 0);
    showToast(`✨ ${ok} fiche(s) optimisée(s) → ${totalNew} fiche(s) atomiques.${fail ? ` (${fail} échec(s))` : ""}`, "success");
  };

  // ── Optimiser TOUTES les fiches du module courant (viser ~100% rétention FSRS) ──
  const handleOptimizeAllInModule = () => {
    if (filterCat === "Toutes") {
      showToast("Sélectionne un module précis avant d'optimiser en masse.", "warning");
      return;
    }
    runOptimizeBatch(
      filteredExps,
      `Optimiser ${filteredExps.length} fiche(s) du module "${filterCat}" ?\nL'IA va scinder / resserrer chaque fiche pour viser 100% de rétention. Les originaux seront remplacés (versions sauvegardées).`
    );
  };

  // ── Optimiser uniquement les fiches sélectionnées (mode Sélection / God Hand) ──
  const handleOptimizeSelected = () => {
    const targets = expressions.filter(e => selectedCards.includes(e.id));
    runOptimizeBatch(
      targets,
      `Optimiser ${targets.length} fiche(s) sélectionnée(s) ?\nL'IA va scinder / resserrer chaque fiche pour viser 100% de rétention. Les originaux seront remplacés (versions sauvegardées).`
    ).then(() => {
      setSelectedCards([]);
      setSelectionMode(false);
    });
  };

  // ✨ Optimise UNE seule fiche (viser 100% rétention FSRS) — bouton par fiche
  const handleOptimizeOneCard = async (exp) => {
    if (!exp) return;
    if (!window.confirm(`Optimiser cette fiche pour viser 100% de rétention ?\nL'IA va la resserrer / scinder si besoin. L'original est sauvegardé (version).`)) return;
    playSound("whoosh");
    const systemPrompt = `Tu es un expert FSRS/SuperMemo. Pour la fiche fournie, produis 1 à N fiches ATOMIQUES optimisées pour tendre vers 100% de rétention. Scinde si nécessaire, resserre les formulations. Réponds UNIQUEMENT en JSON strict :\n{"cards":[{"front":"...","back":"...","example":"..."}]}\n\n${ATOMIC_CARD_RULES}`;
    const userMsg = JSON.stringify({ id: exp.id, front: exp.front, back: exp.back, example: exp.example || "" }, null, 2);
    try {
      const raw = await callClaude(systemPrompt, userMsg, { task: "single-json", json: true, maxTokens: 2500, temperature: 0.3 });
      const rawText = typeof raw === "string" ? raw : (raw?.text || "");
      const clean = rawText.replace(/```json|```/gi, "").trim();
      let parsed = null;
      try { parsed = safeParseJSON(clean); } catch (_) { parsed = null; }
      const cards = Array.isArray(parsed?.cards) ? parsed.cards : (Array.isArray(parsed) ? parsed : []);
      const valid = cards
        .filter(c => c && typeof c.front === "string" && typeof c.back === "string" && c.front.trim() && c.back.trim())
        .map(c => ({ front: c.front.trim(), back: c.back.trim(), example: (c.example || "").toString().trim() }));
      if (!valid.length) { showToast("L'IA n'a rien renvoyé d'utilisable.", "error"); return; }
      try { saveVersion(exp.id); } catch (_) { }
      const now = new Date().toISOString();
      setExpressions(prev => {
        const byId = new Map(prev.map(e => [e.id, e]));
        const first = valid[0];
        const src = byId.get(exp.id);
        if (src) byId.set(exp.id, { ...src, front: first.front, back: first.back, example: first.example, level: 0, repetitions: 0, stability: null, difficulty: null, easeFactor: null, interval: 1, nextReview: today(), updatedAt: now, optimizedBy: "fsrs-single" });
        const additions = [];
        for (let k = 1; k < valid.length; k++) {
          const c = valid[k];
          additions.push({ id: `${exp.id}-opt-${k}-${Math.random().toString(36).slice(2, 8)}`, category: exp.category, type: exp.type || "qa", front: c.front, back: c.back, example: c.example, level: 0, repetitions: 0, stability: null, difficulty: null, easeFactor: null, interval: 1, nextReview: today(), createdAt: now, updatedAt: now, reviewHistory: [], optimizedBy: "fsrs-single", parentId: exp.id });
        }
        return [...Array.from(byId.values()), ...additions];
      });
      showToast(`✨ Fiche optimisée → ${valid.length} fiche(s) atomiques.`, "success");
    } catch (e) {
      console.error("[handleOptimizeOneCard]", e);
      showToast("Optimisation échouée. Réessaie.", "error");
    }
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

  const handleAdd = () => {
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
      const wasEditingId = editingId;
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
            audioId: addForm.audioId,
            audioUrl: addAudioUrl || addForm.audioUrl,        // ajout audio
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

        setExpressions((prev) => { const updated = [...newExps, ...prev]; checkBadges(updated, statsRef.current, sessions, unlockedBadges); return updated; });
        notifyCardsCreated(1); // couche 7
        showToast("✅ Fiche ajoutée !");
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

      // ⏎ Après une édition (hors session de révision) : rediriger vers la fiche mise à jour dans la vue Fiches
      if (wasEditingId) {
        const editedCard = expressions.find(e => e.id === wasEditingId);
        setFilterCat(categorySnapshot || "Toutes");
        setView("list");
        if (editedCard) {
          setExpandedCard({
            ...editedCard,
            front: frontSnapshot.trim(),
            back: backSnapshot.trim(),
            example: exampleSnapshot?.trim() || "",
            category: categorySnapshot,
            type: typeSnapshot,
            imageUrl: addForm.imageUrl,
            audioUrl: addAudioUrl,
          });
        }
      }
    }, 450);
  };

  // (startEdit, cancelEdit, deleteExp extraits dans useExpressionsManager)

  // (getSmartQueue, handleEnterFlow, startReview extraits dans useReviewSession)


  // Préparer et rafraîchir toutes les stats
  const computeAllStats = useCallback(() => {
    showToast("🔄 Statistiques FSRS synchronisées et actualisées !", "success");
  }, [showToast]);

  const generateStatsAiReport = useCallback(async () => {
    if (statsAiReportLoading) return;
    setStatsAiReportLoading(true);
    try {
      const weekly = getWeeklyStatsForClaude(expressions);
      const prompt = `Tu es un neurologue et coach pédagogique expert FSRS. Analyse les métriques d'apprentissage suivantes et produis un bilan ultra-précis, motivant et structuré.
Réponds STRICTEMENT au format JSON avec ce schéma exact :
{
  "verdict": "Phrase d'évaluation percutante et personnalisée (1 phrase)",
  "strengths": ["Force 1 chiffrée", "Force 2"],
  "weakness": "Point d'attention principal à travailler",
  "tip": "Conseil méthodologique concret",
  "plan": ["Action concrète 1", "Action concrète 2", "Action concrète 3"]
}

Données utilisateur :
- Fiches totales : ${expressions.length}
- Fiches maîtrisées : ${countMasteredCards(expressions)}
- Révisions totales : ${statsRef.current?.totalReviews || stats.totalReviews || 0}
- Streak : ${statsRef.current?.streak || stats.streak || 0} jours
- Révisions cette semaine : ${weekly.totalReviews}
- Jours actifs cette semaine : ${weekly.activeDays}/7
- Difficulté moyenne : ${weekly.avgDifficulty}/10
- Fiches en retard : ${weekly.overdueCount}
- Fiches dues aujourd'hui : ${weekly.dueTodayCount}
- Usages productifs cette semaine : ${weekly.productiveUsesWeek}
- Fiches les plus dures : ${weekly.struggling.join(", ") || "Aucune fiche piégée"}
`;

      const res = await callClaude(
        "Tu es un coach pédagogique et architecte mnésique FSRS. Réponds UNIQUEMENT en JSON valide.",
        prompt
      );
      const parsed = safeParseJSON(res);
      if (parsed && (parsed.verdict || parsed.strengths || parsed.summary)) {
        setStatsAiReport(parsed);
        showToast("🧠 Rapport Oracle IA généré avec succès !", "success");
      } else {
        setStatsAiReport({
          summary: typeof res === "string" ? res.trim() : "Analyse IA terminée.",
          verdict: "Analyse FSRS terminée avec succès.",
          strengths: [`${weekly.activeDays} jours actifs cette semaine`, `${countMasteredCards(expressions)} fiches maîtrisées`],
          weakness: weekly.overdueCount > 0 ? `${weekly.overdueCount} fiches en retard` : "Continue de réviser chaque jour pour ancrer la mémoire",
          tip: "Garde un rythme quotidien stable pour maximiser la stabilité FSRS.",
          plan: ["Faire la session quotidienne", "Consolider les fiches difficiles"]
        });
        showToast("🔮 Oracle IA mis à jour", "info");
      }
    } catch (e) {
      console.error("[generateStatsAiReport] Erreur", e);
      showToast("Erreur lors de la génération du rapport IA", "error");
    } finally {
      setStatsAiReportLoading(false);
    }
  }, [statsAiReportLoading, expressions, stats, callClaude, showToast]);

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

  // ══ ASSISTANT IA ══════════════════════════════════════════════════════════
  // Contexte live injecté dans le system prompt à chaque message.
  const buildAgentContext = useCallback(() => {
    const totalCards = expressions.length;
    const dueCount = sessionRemainingCount;
    const pool = dailySessionPreview;
    const arch = getArchetype(powerLevel);
    return {
      view,
      totalCards,
      dueCount,
      masteryPct: totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0,
      formIndex: dashFormIndex,
      streak: stats?.streak || 0,
      level: arch.level,
      xp: powerLevel,
      energy: stamina,
      questsDone: questBoard?.doneCount || 0,
      questsTotal: questBoard?.total || 0,
      modules: categories
        .map((c) => ({ name: c.name, count: pool.filter((e) => e.category === c.name).length }))
        .filter((c) => c.count > 0)
        .slice(0, 8),
      isDarkMode,
      zen: zenFocusMode,
      lofi: lofiPlaying,
    };
  }, [expressions, dailySessionPreview, todayReviews, masteredCount, dashFormIndex, stats, powerLevel, stamina, questBoard, categories, view, isDarkMode, zenFocusMode, lofiPlaying]);

  // ══ CENTRE DE NOTIFICATIONS ═══════════════════════════════════════════════
  // Tout ce qui saturait l'accueil (routine, quêtes, fiches qui bloquent) est
  // agrégé ici et consultable via la cloche de la topbar.
  const notifContext = useMemo(() => {
    const t = today();
    const due = expressions.filter((e) => isDue(e.nextReview, t) && (e.level || 0) < 7 && !e.paused);
    const overdue = due.filter((e) => e.nextReview && e.nextReview < t);
    const incubating = expressions
      .map((e) => ({ card: e, prog: incubationProgress(e) }))
      .filter((x) => x.prog.active)
      .map((x) => ({ id: x.card.id, front: x.card.front, remaining: x.prog.remaining }));
    const reviewedToday = (sessions || [])
      .filter((s) => String(s.date || "").slice(0, 10) === t)
      .reduce((a, s) => a + (s.count || 0), 0);
    const newCardsToday = expressions.filter(
      (e) => String(e.createdAt || "").slice(0, 10) === t
    ).length;
    return {
      dueCount: due.length,
      overdueCount: overdue.length,
      routineSummary: routine?.summary || null,
      routineFraming: routine?.framing || null,
      questBoard,
      leeches: proactiveLeeches,
      incubating,
      streak: stats?.streak || 0,
      reviewedToday,
      newCardsToday,
      energy: { value: stamina, low: 25 },
    };
  }, [expressions, routine, questBoard, proactiveLeeches, stats, stamina, sessions]);

  // ── Raccourcis clavier & Synchronisation ──
  const {
    projectConflicts,
    detectConflicts,
    manualSyncing,
    handleManualSync,
    repairSyncNow,
  } = useShortcutsAndSync({
    view,
    setView,
    revealed,
    handleReveal,
    handleAnswer,
    examActive,
    examRevealed,
    setExamRevealed,
    handleExamAnswer: undefined,
    examConfig,
    setCmdOpen,
    setAgentSheetOpen,
    setShowAgentPanel,
    MOBILE_MQ,
    projects,
    categories,
    expressions,
    storage,
    showToast: emitToast,
    syncUserData: syncWithFirebase,
    fullDeepSync: fullDeepSyncFn,
    getFbUser,
  });

  const handleNotifAction = useCallback((action) => {
    switch (action) {
      case "review": startReview(); break;
      case "english": {
        const ids = new Set((notifContext.incubating || []).map((c) => c.id));
        const queue = expressions.filter((e) => ids.has(e.id));
        if (queue.length) startReview(null, "standard", queue);
        else startReview();
        break;
      }
      case "leeches": startReview(null, "standard", proactiveLeeches); break;
      case "routine": setView("routine"); break;
      case "quests": setView("quests"); break;
      case "sync": handleManualSync?.(); break;
      default: break;
    }
  }, [startReview, proactiveLeeches, handleManualSync, notifContext, expressions]);

  // Les commandes du CommandPalette exposées comme "tools" exécutables.
  const runAgentTool = useCallback((tool, args = {}) => {
    const closeMobile = () => setAgentSheetOpen(false);
    switch (tool) {
      case "navigate": {
        const v = String(args.view || "dashboard");
        setView(v); closeMobile();
        return `Ouverture de « ${v} »`;
      }
      case "start_review":
        startReview(args.module || null, "standard"); closeMobile();
        return args.module ? `Révision lancée : ${args.module}` : "Révision lancée";
      case "toggle_lofi":
        setLofiPlaying((p) => !p);
        return "Radio focus basculée";
      case "toggle_dark":
        setIsDarkMode((d) => !d);
        return "Thème basculé";
      case "toggle_zen":
        setZenFocusMode((z) => !z);
        return "Mode Zen basculé";
      case "start_pomodoro":
        navigate("lab/pomodoro"); closeMobile();
        return "Pomodoro 25 min ouvert";
      case "open_command_palette":
        setCmdOpen(true); closeMobile();
        return "Palette de commandes ouverte";
      default:
        return null;
    }
  }, [navigate]);

  const agentAsk = useCallback(
    (systemPrompt, userMessage) =>
      callClaude(systemPrompt, userMessage, { task: "chat", json: true, maxTokens: 900, temperature: 0.4 }),
    [],
  );

  // Mobile : la tuile "Assistant IA" de l'accueil ouvre le bottom sheet.
  // (la tuile "Discussion" séparée ouvre BetaChat, le chat avec un autre utilisateur / le propriétaire)
  useEffect(() => {
    const onOpen = () => setAgentSheetOpen(true);
    window.addEventListener("open_agent_panel", onOpen);
    return () => window.removeEventListener("open_agent_panel", onOpen);
  }, []);

  const currentCard = reviewQueue.length > 0 ? reviewQueue[reviewIndex] : null;

  const activeFacet = useMemo(() => {
    if (!currentCard || !currentCard.facets || currentCard.facets.length === 0) return null;
    // 50% chance to just show the standard front if facets exist, otherwise pick a random facet
    if (Math.random() > 0.5) return null;
    const idx = Math.floor(Math.random() * currentCard.facets.length);
    return currentCard.facets[idx];
  }, [reviewIndex, currentCard]);

  if (!loaded) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#070D1F", color: "#C084FC", fontFamily: "'Outfit', sans-serif", gap: 16 }}><div style={{ fontSize: 48, animation: "pulse 1s infinite", filter: "drop-shadow(0 0 20px rgba(249,115,22,0.8))" }}>🧠</div><h2 style={{ fontWeight: 800, letterSpacing: "-0.5px", background: "linear-gradient(135deg, #7C3AED, #C084FC)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Initialisation du Second Cerveau...</h2></div>;

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "transparent", color: theme.text, fontFamily: "'Outfit', sans-serif", transition: "background 0.3s" }}>
      {/* Topbar flottante : synchro + centre de notifications (Desktop uniquement) */}
      {!isMobile && (
        <div
          style={{
            position: "fixed", top: 10, right: 10, zIndex: 9999,
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          {getFbUser() && (
            <button
              onClick={handleManualSync}
              disabled={manualSyncing}
              title="Forcer une synchronisation avec le serveur (utile après avoir modifié tes données sur un autre appareil)"
              style={{
                width: 34, height: 34, borderRadius: "50%", border: "none",
                background: "rgba(30,30,40,0.55)", color: "#fff", fontSize: 15,
                cursor: manualSyncing ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: manualSyncing ? "pulse 0.8s ease-in-out infinite" : "none",
                backdropFilter: "blur(6px)",
              }}
            >
              🔄
            </button>
          )}
          <NotificationCenter
            context={notifContext}
            onAction={handleNotifAction}
            isDarkMode={isDarkMode}
            theme={theme}
          />
        </div>
      )}
      {/* Style additionnel pour mode allégé / dynamic perf tier */}
      <style>{`
        ${PERF_LITE_CSS}
      `}</style>
      {isDarkMode && <><div className="app-orb-1" /><div className="app-orb-2" /></>}

      {/* CHANTIER 23 — Défense en profondeur contre la « barre noire » mobile :
          la règle CSS .nav-top { display:none } ne suffit pas (elle laissait
          passer une bande fixe pendant le scroll dès que le seuil CSS et le
          seuil JS divergeaient d'1 px). On ne rend tout simplement plus la nav
          en mobile, et les trois seuils (isMobile, matchMedia du home, media
          query CSS) partagent désormais MOBILE_MQ / MOBILE_BREAKPOINT. */}
      {/* ══ BARRE SUPÉRIEURE HUD GOD LEVEL ══ */}
      <AppTopNav
        isMobile={isMobile}
        isScrolled={isScrolled}
        isDarkMode={isDarkMode}
        zenFocusMode={zenFocusMode}
        stamina={stamina}
        toast={toast}
        setCmdOpen={setCmdOpen}
        showToast={showToast}
        sessionRemainingCount={sessionRemainingCount}
        sessionPlannedToday={sessionPlannedToday}
        duePileSize={duePileSize}
        projectConflicts={projectConflicts}
      />

      {/* ── LAYOUT PRINCIPAL : Sidebar + Content ── */}
      <div style={{ height: zenFocusMode || isMobile ? 0 : 68, transition: "height 0.3s cubic-bezier(0.4,0,0.2,1)" }} />{/* spacer nav fixe */}
      <div style={{ display: "flex", minHeight: isMobile ? "100vh" : "calc(100vh - 68px)", alignItems: "flex-start" }}>

        {/* ═══ SIDEBAR VERTICALE GOD MODE (FIXED) ═══ */}
        <AppSidebar
          zenFocusMode={zenFocusMode}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          isDarkMode={isDarkMode}
          theme={theme}
          powerLevel={powerLevel}
          expressions={expressions}
          projects={projects}
          categories={categories}
          sessionRemainingCount={sessionRemainingCount}
          sessionPlannedToday={sessionPlannedToday}
          duePileSize={duePileSize}
          masteredCount={masteredCount}
          unlockedBadges={unlockedBadges}
          lastViewedBadgesCount={lastViewedBadgesCount}
          editingId={editingId}
          view={view}
          setView={setView}
          setProjectSubView={setProjectSubView}
          navigate={navigate}
          projectPomodoroTime={projectPomodoroTime}
          projectPomodoroActive={projectPomodoroActive}
          setProjectPomodoroActive={setProjectPomodoroActive}
          projectPomodoroMode={projectPomodoroMode}
          projectConflicts={projectConflicts}
          sidebarClock={sidebarClock}
        />

        {/* ═══ NAVIGATION MOBILE (SpeedDial, Drawer, AddSheet) ═══ */}
        <AppMobileNav
          isMobile={isMobile}
          view={view}
          setView={setView}
          isDarkMode={isDarkMode}
          theme={theme}
          expressions={expressions}
          sessionRemainingCount={sessionRemainingCount}
          duePileSize={duePileSize}
          masteredCount={masteredCount}
          mobileDrawerOpen={mobileDrawerOpen}
          setMobileDrawerOpen={setMobileDrawerOpen}
          setMobileFabOpen={setMobileFabOpen}
          mobileAddSheetOpen={mobileAddSheetOpen}
          setMobileAddSheetOpen={setMobileAddSheetOpen}
          navigate={navigate}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          setProjectSubView={setProjectSubView}
          unlockedBadges={unlockedBadges}
          lastViewedBadgesCount={lastViewedBadgesCount}
          projectPomodoroTime={projectPomodoroTime}
          projectPomodoroActive={projectPomodoroActive}
          setProjectPomodoroActive={setProjectPomodoroActive}
          projectPomodoroMode={projectPomodoroMode}
        />

        <main
          className="main-content"
          style={{
            flex: 1, width: 0, minWidth: 0, boxSizing: "border-box", marginTop: oneHanded ? '45vh' : 0, transition: 'margin-top 0.3s ease', padding: "32px 36px 80px", paddingBottom: isMobile ? "calc(var(--nav-h, 92px) + 24px + env(safe-area-inset-bottom, 0px))" : "106px", position: "relative", zIndex: 1,

            touchAction: 'auto',
          }}
        >
          {/* ══════════════════════════════════════════════════════════════════
            VUE TABLEAU DE BORD (Bento Hub / Mobile Home V2)
          ══════════════════════════════════════════════════════════════════ */}
          {(view === "dashboard" || view === "home") && (
            <DashboardView
              expressions={expressions}
              categories={categories}
              sessionRemainingCount={sessionRemainingCount}
              dailySessionPreview={dailySessionPreview}
              masteredCount={masteredCount}
              dashFormIndex={dashFormIndex}
              stamina={stamina}
              stats={stats}
              powerLevel={powerLevel}
              questState={questState}
              questBoard={questBoard}
              sessionBestCombo={sessionBestCombo}
              bestComboEver={bestComboEver}
              badgeProgressForHooks={badgeProgressForHooks}
              unlockedBadges={unlockedBadges}
              isEnteringFlow={isEnteringFlow}
              handleEnterFlow={handleEnterFlow}
              hour={new Date().getHours()}
              greeting={new Date().getHours() >= 18 ? "Bonsoir" : "Bonjour"}
              dashNextExam={dashNextExam}
              dashQuote={dashQuote}
              dashQuoteLoading={dashQuoteLoading}
              dashSelfCompare={dashSelfCompare}
              sessions={sessions}
              sessionInProgress={sessionInProgress}
              lastFailed={lastFailed}
              lastLabDoc={lastLabDoc}
              dashFocusMode={dashFocusMode}
              setDashFocusMode={setDashFocusMode}
              dashUrgentCards={dashUrgentCards}
              startReview={startReview}
              startWeakSpotsSession={startWeakSpotsSession}
              setView={setView}
              theme={theme}
              isDarkMode={isDarkMode}
              showToast={showToast}
              holoLevel={holoLevel}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
            VUE ÉTUDE LIBRE (Apprentissage fiches en pause)
          ══════════════════════════════════════════════════════════════════ */}
          {view === "study" && (
            <StudyView
              studyQueue={studyQueue}
              studyIndex={studyIndex}
              studyModule={studyModule}
              studyLearnedIds={studyLearnedIds}
              studyGoPrev={studyGoPrev}
              studyGoNext={studyGoNext}
              markStudyCardLearned={markStudyCardLearned}
              setView={setView}
              theme={theme}
            />
          )}
          {/* ══════════════════════════════════════════════════════════════════
            VUE RÉVISION FLASHCARD (Moteur FSRS)
          ══════════════════════════════════════════════════════════════════ */}
          {view === "review" && (
            <ReviewEngineView
              reviewQueue={reviewQueue}
              setReviewQueue={setReviewQueue}
              reviewIndex={reviewIndex}
              setReviewIndex={setReviewIndex}
              currentCard={currentCard}
              revealed={revealed}
              setRevealed={setRevealed}
              userAnswer={userAnswer}
              setUserAnswer={setUserAnswer}
              showSessionSummary={showSessionSummary}
              setShowSessionSummary={setShowSessionSummary}
              sessionSummary={sessionSummary}
              sessionTimer={sessionTimer}
              sessionTimerRef={sessionTimerRef}
              reviewCombo={reviewCombo}
              reviewSessionDone={reviewSessionDone}
              updateStreakAfterSession={updateStreakAfterSession}
              handleAnswer={handleAnswer}
              handleAnswerWithFeedback={handleAnswerWithFeedback}
              handleReveal={handleReveal}
              handleRevealAndStopVoice={handleReveal}
              voiceReviewActive={voiceReviewActive}
              socraticMode={socraticMode}
              socraticHint={socraticHint}
              setSocraticHint={setSocraticHint}
              handleSemanticEval={handleSemanticEval}
              evalLoading={evalLoading}
              generateMnemonic={generateMnemonic}
              mnemonicLoading={mnemonicLoading}
              mnemonicText={mnemonicText}
              setMnemonicText={setMnemonicText}
              saveMnemonic={saveMnemonic}
              mnemonicSaved={mnemonicSaved}
              rabbitHoleOpen={rabbitHoleOpen}
              setRabbitHoleOpen={setRabbitHoleOpen}
              handleRescueLeech={handleRescueLeech}
              leechRescueLoading={leechRescueLoading}
              startEdit={startEdit}
              setEditReturnTo={setEditReturnTo}
              deleteExp={deleteExp}
              unpauseCard={unpauseCard}
              productionInvite={productionInvite}
              setProductionInvite={setProductionInvite}
              productionDraft={productionDraft}
              setProductionDraft={setProductionDraft}
              productionResult={productionResult}
              productionBusy={productionBusy}
              handleValidateProduction={handleValidateProduction}
              powerLevel={powerLevel}
              questState={questState}
              sessionBestCombo={sessionBestCombo}
              bestComboEver={bestComboEver}
              xpState={xpState}
              sessionRemainingCount={sessionRemainingCount}
              badgeProgressForHooks={badgeProgressForHooks}
              dailySessionPreview={dailySessionPreview}
              startReview={startReview}
              setView={setView}
              theme={theme}
              isDarkMode={isDarkMode}
              isMobile={isMobile}
              callClaude={callClaude}
              showToast={showToast}
              activeFacet={activeFacet}
              setCardStartTime={setCardStartTime}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
            VUE AJOUT / FORGE DE FICHES
          ══════════════════════════════════════════════════════════════════ */}
          {view === "add" && (
            <AddCardView
              addForm={addForm}
              setAddForm={setAddForm}
              editingId={editingId}
              cancelEdit={cancelEdit}
              addSubView={addSubView}
              setAddSubView={setAddSubView}
              addZenMode={addZenMode}
              setAddZenMode={setAddZenMode}
              categories={categories}
              expressions={expressions}
              setExpressions={setExpressions}
              theme={theme}
              isDarkMode={isDarkMode}
              showToast={showToast}
              callClaude={callClaude}
              playSound={playSound}
              today={today}
              setStats={setStats}
              setMobileAddSheetOpen={setMobileAddSheetOpen}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
            VUE EXPLORATEUR DE FICHES (Second Cerveau)
          ══════════════════════════════════════════════════════════════════ */}
          {view === "list" && (
            <CardListView
              expressions={expressions}
              setExpressions={setExpressions}
              categories={categories}
              setCategories={setCategories}
              filteredExps={filteredExps}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filterCat={filterCat}
              setFilterCat={setFilterCat}
              filterLevel={filterLevel}
              setFilterLevel={setFilterLevel}
              selectionMode={selectionMode}
              setSelectionMode={setSelectionMode}
              selectedCards={selectedCards}
              setSelectedCards={setSelectedCards}
              listXRayMode={listXRayMode}
              setListXRayMode={setListXRayMode}
              masteredCount={masteredCount}
              optimizeAllLoading={optimizeAllLoading}
              optimizeAllProgress={optimizeAllProgress}
              handleOptimizeAllInModule={handleOptimizeAllInModule}
              startEdit={startEdit}
              deleteExp={deleteExp}
              theme={theme}
              isDarkMode={isDarkMode}
              isMobile={isMobile}
              showToast={showToast}
              callClaude={callClaude}
              playSound={playSound}
              today={today}
              setView={setView}
              cardsSort={cardsSort}
              setCardsSort={setCardsSort}
              cardsViewMode={cardsViewMode}
              setCardsViewMode={setCardsViewMode}
              cardsActionMode={cardsActionMode}
              setCardsActionMode={setCardsActionMode}
              cardsAudioPlaying={cardsAudioPlaying}
              setCardsAudioPlaying={setCardsAudioPlaying}
              cardsPlaylist={cardsPlaylist}
              setCardsPlaylist={setCardsPlaylist}
              cardsTags={cardsTags}
              setCardsTags={setCardsTags}
              cardsTagsLoading={cardsTagsLoading}
              setCardsTagsLoading={setCardsTagsLoading}
              listTagsDrawerOpen={listTagsDrawerOpen}
              setListTagsDrawerOpen={setListTagsDrawerOpen}
              listSelectedTag={listSelectedTag}
              setListSelectedTag={setListSelectedTag}
              listAdvancedOverlayOpen={listAdvancedOverlayOpen}
              setListAdvancedOverlayOpen={setListAdvancedOverlayOpen}
              cardsAdvancedSearch={cardsAdvancedSearch}
              setCardsAdvancedSearch={setCardsAdvancedSearch}
              setCardsSearchOpen={setCardsSearchOpen}
              listBiblioPanelOpen={listBiblioPanelOpen}
              setListBiblioPanelOpen={setListBiblioPanelOpen}
              cardsCommunity={cardsCommunity}
              cardsCommunityLoading={cardsCommunityLoading}
              cmdPaletteOpen={cmdPaletteOpen}
              setCmdPaletteOpen={setCmdPaletteOpen}
              cmdPaletteCard={cmdPaletteCard}
              setCmdPaletteCard={setCmdPaletteCard}
              cmdPaletteQuery={cmdPaletteQuery}
              setCmdPaletteQuery={setCmdPaletteQuery}
              handleSemanticSearch={handleSemanticSearch}
              semanticLoading={semanticLoading}
              cardKebabOpen={cardKebabOpen}
              setCardKebabOpen={setCardKebabOpen}
              cardAccordionOpen={cardAccordionOpen}
              setCardAccordionOpen={setCardAccordionOpen}
              cardSwipeState={cardSwipeState}
              setCardSwipeState={setCardSwipeState}
              cardsHoveredId={cardsHoveredId}
              setCardsHoveredId={setCardsHoveredId}
              cardsFortressActive={cardsFortressActive}
              handleOptimizeOneCard={handleOptimizeOneCard}
              handleOptimizeSelected={handleOptimizeSelected}
              handleRestructureSelectedRetroEngineering={handleRestructureSelectedRetroEngineering}
              expandedCard={expandedCard}
              setExpandedCard={setExpandedCard}
              cardsFakeCards={cardsFakeCards}
              setCardsFakeCards={setCardsFakeCards}
              handleLearnNow={handleLearnNow}
              isYoungCard={isYoungCard}
              newCardsRemainingToday={newCardsRemainingToday}
              newCardBudget={newCardBudget}
              visibleCardsCount={visibleCardsCount}
              loadMoreCardsRef={loadMoreCardsRef}
              handleMinimapClick={handleMinimapClick}
              cardsGraphLoading={cardsGraphLoading}
              cardsGraphData={cardsGraphData}
              graphTransform={graphTransform}
              setGraphTransform={setGraphTransform}
              graphDragRef={graphDragRef}
              cardsClusters={cardsClusters}
              cardsTimeline={cardsTimeline}
              timelineScrollRatio={timelineScrollRatio}
              setTimelineScrollRatio={setTimelineScrollRatio}
              cardsDuelActive={cardsDuelActive}
              setCardsDuelActive={setCardsDuelActive}
              cardsDuelCard={cardsDuelCard}
              cardsDuelPlayer1={cardsDuelPlayer1}
              cardsDuelPlayer2={cardsDuelPlayer2}
              cardsDuelInput1={cardsDuelInput1}
              setCardsDuelInput1={setCardsDuelInput1}
              cardsDuelInput2={cardsDuelInput2}
              setCardsDuelInput2={setCardsDuelInput2}
            />
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

          {(view === "veille" || view === "bourses") && (
            <div className="view-slide-up" style={{ padding: "0 20px" }}>
              <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: theme.textMuted }}>Chargement des actualités & bourses...</div>}>
                <ErrorBoundary scope="TechIntelView">
                  <TechIntelView
                    initialTab={view === "bourses" ? "scholarships" : undefined}
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
                        notifyCardsCreated(1); // couche 7 — combler la fuite de comptage
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
                pomodoroProps={{ theme, showToast, onPhaseChange: (phase) => { if (phase.id === "flash") setView("review"); }, onComplete: () => { setStats(prev => ({ ...prev, pomodorosDone: (prev.pomodorosDone || 0) + 1 })); awardSource("POMODORO_DONE", { streak: statsRef.current?.streak || 0 }); } }}
                askMyDocsProps={{ theme, callClaude, docs: (typeof labMultiFiles !== "undefined" ? labMultiFiles : []).map(f => ({ name: f.name, content: f.text || f.content })) }}

                showToast={showToast}
                storage={storage}
                callClaude={callClaude}
                getNextGroqKey={getNextGroqKey}
                today={today}
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
              statsSessionHistory={sessions}
              computeAllStats={computeAllStats}
              generateStatsAiReport={generateStatsAiReport}
              statsAiReportLoading={statsAiReportLoading}
              generateWeeklyDigest={generateWeeklyDigest}
              statsAiReport={statsAiReport}
              setStatsAiReport={setStatsAiReport}
              showToast={showToast}
              callClaude={callClaude}
              setExpressions={setExpressions}
              masteredCount={countMasteredCards(expressions)}
              powerLevel={powerLevel}
              statsDailyProgress={statsDailyProgress}
              statsModuleComparison={statsModuleComparison}
              statsDifficultyDistribution={statsDifficultyDistribution}
              statsTopDifficult={statsTopDifficult}
              statsDayOfWeekPerformance={statsDayOfWeekPerformance}
              statsRetentionCurve={statsRetentionCurve}
              dailyTarget={dailyPlanResult?.target ?? null}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
            VUE BADGES – GOD LEVEL
          ══════════════════════════════════════════════════════════════════ */}
          {view === "badges" && (
            <BadgesView
              badgeState={buildBadgeState(expressions, stats)}
              unlockedBadges={unlockedBadges}
              theme={theme}
              isDarkMode={isDarkMode}
              archetype={xpArchetype}
              showToast={showToast}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
            VUE PROJETS — GOD MODE COMPLET
          ══════════════════════════════════════════════════════════════════ */}
          {view === "projects" && (
            <ProjectsView
              projects={projects}
              setProjects={setProjects}
              categories={categories}
              expressions={expressions}
              setExpressions={setExpressions}
              todayReviews={todayReviews}
              theme={theme}
              isDarkMode={isDarkMode}
              showToast={showToast}
              callClaude={callClaude}
              today={today}
              projectSubView={projectSubView}
              setProjectSubView={setProjectSubView}
              projectConflicts={projectConflicts}
              projectPomodoroActive={projectPomodoroActive}
              setProjectPomodoroActive={setProjectPomodoroActive}
              projectPomodoroTime={projectPomodoroTime}
              setProjectPomodoroTime={setProjectPomodoroTime}
              projectPomodoroMode={projectPomodoroMode}
              setProjectPomodoroMode={setProjectPomodoroMode}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
            VUE CATEGORIES
          ══════════════════════════════════════════════════════════════════ */}
          {view === "categories" && (
            <CategoriesView
              categories={categories}
              setCategories={setCategories}
              expressions={expressions}
              setExpressions={setExpressions}
              theme={theme}
              isDarkMode={isDarkMode}
              showToast={showToast}
              callClaude={callClaude}
              navigate={navigate}
              setView={setView}
              startReview={startReview}
              setFilterCat={setFilterCat}
              setFilterLevel={setFilterLevel}
              setSearchQuery={setSearchQuery}
              setSelectionMode={setSelectionMode}
              setSelectedCards={setSelectedCards}
              setAddBatchQueue={setAddBatchQueue}
              setExamConfig={setExamConfig}
              examHistory={examHistory}
              today={today}
              isDue={isDue}
            />
          )}

          {view === "routine" && (
            <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 0", animation: "fadeUp 0.3s ease" }}>
              <DailyRoutineTracker
                routine={routine}
                theme={theme}
                isDarkMode={isDarkMode}
                onBack={() => setView("dashboard")}
                onAction={(actionId, duration, label, stepId) => {
                  if (stepId && routine?.checkStep) routine.checkStep(stepId);
                  if (actionId === "review") startReview(null, "standard");
                  else if (actionId === "add") setView("add");
                  else if (actionId === "practice") setView("practice");
                  else if (actionId === "veille") setView("veille");
                  else if (actionId === "lab") setView("lab");
                  else if (actionId === "stats") setView("stats");
                  else setView(actionId);
                }}
              />
            </div>
          )}

          {view === "quests" && (
            <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 0", animation: "fadeUp 0.3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setView("dashboard")}
                  style={{
                    background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(139, 92, 246,0.08)",
                    border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(139, 92, 246,0.2)"}`,
                    color: theme.text || "#0F172A",
                    fontSize: 13, fontWeight: 800,
                    padding: "7px 16px", borderRadius: 12,
                    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                >
                  ← Accueil
                </button>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: theme.text }}>🎯 Mes Quêtes</h2>
                <div style={{ width: 80 }} />
              </div>
              <DailyQuestBar summary={questBoard} theme={theme} dailyMultiplier={todayMultiplier} />
            </div>
          )}

        </main>
      </div>

      {/* ══ STATUS BAR PRO (IDE Footer) ══ */}
      <AppStatusBar
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        theme={theme}
        appSessionTime={appSessionTime}
        expressions={expressions}
        repairSyncNow={repairSyncNow}
        showToast={showToast}
        showLofiPlayer={showLofiPlayer}
        setShowLofiPlayer={setShowLofiPlayer}
        lofiPlaying={lofiPlaying}
        setLofiPlaying={setLofiPlaying}
        lofiVolume={lofiVolume}
        setLofiVolume={setLofiVolume}
        lofiStation={lofiStation}
        setLofiStation={setLofiStation}
        currentTrack={currentTrack}
        downloadedIds={downloadedIds}
        dlProgress={dlProgress}
        dlAllProgress={dlAllProgress}
        isOnline={isOnline}
        offlineSize={offlineSize}
        handleDownloadAll={handleDownloadAll}
        handleDownloadTrack={handleDownloadTrack}
        handleDeleteTrack={handleDeleteTrack}
        totalPlaylistBytes={totalPlaylistBytes}
        formatBytes={formatBytes}
        FOCUS_PLAYLIST={FOCUS_PLAYLIST}
        OFFLINE_TRACKS={OFFLINE_TRACKS}
        CATEGORY_LABELS={CATEGORY_LABELS}
        showAgentPanel={showAgentPanel}
        setShowAgentPanel={setShowAgentPanel}
        buildAgentContext={buildAgentContext}
        runAgentTool={runAgentTool}
        agentAsk={agentAsk}
        isPomoActive={isPomoActive}
        setIsPomoActive={setIsPomoActive}
        pomoTime={pomoTime}
        zenFocusMode={zenFocusMode}
        setZenFocusMode={setZenFocusMode}
      />

      {/* ══ MODALES & OVERLAYS GLOBAUX ══ */}
      <AppOverlays
        audioRef={audioRef}
        trackSrc={trackSrc}
        newBadge={newBadge}
        isDarkMode={isDarkMode}
        theme={theme}
        cmdOpen={cmdOpen}
        setCmdOpen={setCmdOpen}
        agentSheetOpen={agentSheetOpen}
        setAgentSheetOpen={setAgentSheetOpen}
        setShowAgentPanel={setShowAgentPanel}
        buildAgentContext={buildAgentContext}
        runAgentTool={runAgentTool}
        agentAsk={agentAsk}
        lastChest={lastChest}
        clearChest={clearChest}
        xpBurst={xpBurst}
        setView={setView}
        navigate={navigate}
        setIsDarkMode={setIsDarkMode}
        setLofiPlaying={setLofiPlaying}
        MOBILE_MQ={MOBILE_MQ}
      />
    </div>
  );
}
