// EnglishPractice.jsx – GOD LEVEL v12 · audit-fix v1 (autonome) — PATCHÉ
// Tous les états, refs et fonctions sont gérés ici.
// MemoMaster ne passe que les dépendances externes :
//   callClaude, getNextGroqKey,
//   storage, expressions, setExpressions, setStats, showToast,
//   theme, isDarkMode

import { safeHTML } from "./lib/htmlSanitizer";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PenLine, Shuffle, History, Plus, Sparkles, Layers, BookOpenCheck, LayoutGrid, SpellCheck2, Mic, Square, Globe, AlertTriangle, CheckCircle2, Lightbulb, RotateCcw, AudioLines, Repeat2, Ear, Loader2, Volume2, ArrowRight, PlusCircle, Zap, ChevronUp, ChevronDown, BarChart2, Search, Trash2, ExternalLink, Copy, Check } from "lucide-react";
import EnglishInTheWild from "./EnglishInTheWild";
import RealLife from "./RealLife";
import AgentVoiceBar, { AGENT_VOICES, useElevenLabsAgent, MODE_CONFIGS } from "./AgentVoiceBar";
import { registerAgentClientTool, setContextSnapshotBuilder } from "./lib/agentClientTools";
import { summarizeForContinuity } from "./lib/agentSessionMemory";
import { useAgentCardDetector } from "./useAgentCardDetector";
import AgentCardToast from "./AgentCardToast";
import { cleanSpeechTranscript, isMeaninglessSpeech, SPEECH_HYGIENE_PROMPT } from "./utils/speechCleanup";

import { useNovaAgent } from "./lib/useNovaAgent";
import { getSRSStats, getHeatmapData, getWeeklyStatsForClaude, formatTimeUntil, SCORE_BUTTONS } from "./lib/reviewStats";
import { fsrs, fsrsFromProduction } from "./lib/fsrs";
import { recordProductiveUse, getExpressionsNeedingProduction, computeMasteryStage } from "./lib/masteryStages";
import useProductiveUse, { englishCategoryFilter } from "./hooks/useProductiveUse";
import { today } from "./utils/dateUtils";
import LiveNewsModule from "./components/LiveNewsModule";
import { useXP } from "./hooks/useXP";
import { useCEFR } from "./hooks/useCEFR";
import CoachSpeedListening from "./components/CoachSpeedListening";
import CoachNewsAnchor from "./components/CoachNewsAnchor";
import BattleMode from "./components/BattleMode";
import SpeakItChallenge from "./components/SpeakItChallenge";
import ProductionChallenge from "./components/ProductionChallenge";

import { speakWithGroq } from "./lib/groqTTS";
import LiveKitVoiceAssistant from "./components/LiveKitVoiceAssistant";
import { liveKitVoiceBus, prewarmNovaToken } from "./components/LiveKitVoiceAssistant";
import { playEnglishAudio, stopEnglishAudio } from "./lib/speakUtils";
import "./styles/english-views.css";
import { armIosAudio } from "./lib/iosVoiceHardening";
import { VoiceMirror } from "./components/VoiceMirror";
import { CoachAnalyzeListener } from "./components/CoachAnalyzeListener";
import { safeParseJSON } from "./lib/textUtils";
import { colorMix } from "./lib/colorMix";
import { getDailyOralTargets, isTargetSpoken } from "./lib/english/dailyOralTargets";

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT INTERNE — EnglishPracticeInner (doit être rendu dans ConversationProvider)
// ══════════════════════════════════════════════════════════════════════════════
function EnglishPracticeInner({
  // ── Dépendances externes (fournies par MemoMaster) ──────────────────────────
  callClaude,           // async (system, user) => string
  getNextGroqKey,       // () => string
  storage,              // { get, set }
  expressions,          // tableau global des fiches
  setExpressions,       // setter global
  setStats,             // setter des stats globales MemoMaster (pour totalReviews)
  showToast,            // (msg, type?) => void
  today,                // () => string "YYYY-MM-DD"
  categories,           // tableau des modules MemoMaster (pour assigner la bonne catégorie)
  // ── Thème ───────────────────────────────────────────────────────────────────
  theme,
  isDarkMode,
  // ── Navigation & Filtres ───────────────────────────────────────────────────
  setView,
  navigate,
  setFilterCat,
  setSearchQuery,
}) {
  // ── Détection automatique du module Anglais ─────────────────────────────────
  const englishCategory = React.useMemo(() => {
    if (!categories || categories.length === 0) return "🇬🇧 Anglais";
    const found = categories.find(c =>
      c.name?.toLowerCase().includes("anglais") ||
      c.name?.toLowerCase().includes("english") ||
      c.name?.includes("🇬🇧")
    );
    return found ? found.name : (categories[0]?.name || "🇬🇧 Anglais");
  }, [categories]);

  // ── Système XP ──────────────────────────────────────────────────────────────
  const { xpState, addXP, addBadge, getStats, generateReport } = useXP(storage, showToast, callClaude);
  const awardXP = (xpAmount, coins, reason) => addXP(xpAmount, reason);
  const [showXPDashboard, setShowXPDashboard] = useState(false);

  // ── Système CEFR ────────────────────────────────────────────────────────────
  const { cefrState, isAnalyzing, addProduction, triggerAnalysis } = useCEFR(storage);

  // ── Mode "Active Recall" (Missions HUD) ─────────────────────────────────────
  // Phase 5 — priorité aux fiches "recalled jamais produites", complétées par les
  // fiches dues classiques s'il en manque pour arriver à 3.
  // Phase 1 fix — utilise `ex.nextReview` (camelCase, l'état réel) et non
  // `ex.next_review` qui existait dans le code initial et matchait toujours undefined :
  // le filtre `isDue` était mort et seule la branche `isLearning` déclenchait des
  // missions. Cohérent maintenant avec MemoMaster.jsx (nextReview partout).
  const targetExpressions = React.useMemo(() => {
    if (!expressions || !Array.isArray(expressions)) return [];
    const now = new Date();
    const isEnglish = (ex) => {
      if (!ex?.category) return false;
      const cat = ex.category.toLowerCase();
      return cat.includes("anglais") || cat.includes("english") || ex.category.includes("🇬🇧");
    };
    const englishExps = expressions.filter(isEnglish);

    // 1) Priorité absolue : fiches "recalled" jamais produites en contexte réel.
    const needProduction = getExpressionsNeedingProduction(englishExps, 3);

    // 2) Complément : fiches dues (nextReview <= now) ou encore en apprentissage.
    const alreadyIn = new Set(needProduction.map(e => e.id));
    const dueOrLearning = englishExps
      .filter(ex => !alreadyIn.has(ex.id))
      .filter(ex => {
        const isDue = ex.nextReview && new Date(ex.nextReview) <= now;
        const isLearning = (ex.repetitions ?? 0) > 0 && (ex.interval ?? 0) < 5;
        return isDue || isLearning;
      })
      .sort((a, b) => new Date(a.nextReview || 0).getTime() - new Date(b.nextReview || 0).getTime());

    return [...needProduction, ...dueOrLearning].slice(0, 3);
  }, [expressions]);

  // ── Smart Daily Oral Targets (Cibles orales du jour pour Live Nova — Niveau 100) ──
  const dailyOralTargetsData = React.useMemo(() => {
    return getDailyOralTargets(expressions, { limit: 3 });
  }, [expressions]);

  const [novaDailyTargetMode, setNovaDailyTargetMode] = useState(() => {
    try {
      const saved = localStorage.getItem("nova_daily_target_mode");
      if (saved) return saved;
    } catch { }
    return "daily";
  });

  // ── Toutes les fiches anglais (pour le Speaking Lab — prononcer ses propres expressions) ──
  const allEnglishFiches = React.useMemo(() => {
    if (!expressions || !Array.isArray(expressions)) return [];
    const isEnglish = (ex) => {
      if (!ex?.category) return false;
      const cat = ex.category.toLowerCase();
      return cat.includes("anglais") || cat.includes("english") || ex.category.includes("🇬🇧");
    };
    return expressions
      .filter(isEnglish)
      .filter(ex => ex.front && ex.front.trim())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [expressions]);

  // ── États internes ──────────────────────────────────────────────────────────
  const [practicePersona, setPracticePersona] = useState("Standard");
  const [practiceMessages, setPracticeMessages] = useState([]);
  const [chatShowHistory, setChatShowHistory] = useState(false);
  const [liveKitTranscriptions, setLiveKitTranscriptions] = useState([]);
  const [liveKitState, setLiveKitState] = useState(null);
  const [studentName, setStudentName] = useState(() => {
    try { return localStorage.getItem("nova_student_name") || ""; } catch { return ""; }
  });

  const [subtitlesEnabled, setSubtitlesEnabled] = useState(() => {
    try { return localStorage.getItem("nova_subtitles_enabled") !== "false"; } catch { return true; }
  });

  const novaSessionMemoryRef = useRef(null);
  const isGeneratingMemoryRef = useRef(false);
  const lastAgentMessageTimeRef = useRef(Date.now());
  const novaRelationshipArcRef = useRef({
    phase: "acquaintance",
    sessionCount: 0,
    sharedJokes: [],
    memorableMoments: []
  });

  const generateSessionMemoryPayload = async (messages) => {
    if (isGeneratingMemoryRef.current) return;

    // Quality threshold: at least 3 user messages with > 20 characters
    const validUserMsgs = messages.filter(m => m.role === "user" && m.text.length > 20);
    if (validUserMsgs.length < 3) return;

    isGeneratingMemoryRef.current = true;
    try {
      const historyLines = messages.map(m => `${m.role === "assistant" ? "Coach" : "Student"}: ${m.text}`).join("\n");
      const arc = novaRelationshipArcRef.current;
      const prompt = `Tu es un assistant chargé de créer une "mémoire de continuité" et de faire évoluer la "relation" pour la prochaine session.
Voici la transcription de la session qui vient de se terminer :
${historyLines}

Arc Relationnel Actuel :
${JSON.stringify(arc)}

Règles d'évolution de la relation :
1. "sessionCount" DOIT être incrémenté de 1 (donc passer à ${arc.sessionCount + 1}).
2. Progression de la "phase" :
   - acquaintance -> familiar (minimum 5 sessions)
   - familiar -> friend (minimum 15 sessions)
   - friend -> confidant (minimum 30 sessions)
   Ne progresse la phase QUE si le minimum de sessions est atteint ET que la profondeur émotionnelle de la conversation le justifie. Sinon, garde la phase actuelle.
3. "sharedJokes" et "memorableMoments" (max 3 chacun).
   - Format exact d'une joke : { "trigger": "quand on parle de...", "reference": "...", "firstUsed": "session_timestamp", "referenceCount": 0 }
   - Si une joke existante a été mentionnée dans cette session, incrémente son "referenceCount".
   - Si tu veux ajouter une NOUVELLE blague/moment et qu'il y en a déjà 3, remplace celle qui a le "referenceCount" le plus BAS. Ne remplace pas forcément la plus ancienne.

Génère un résumé émotionnel ET le nouvel arc relationnel sous forme de JSON strict.
Contraintes de continuité :
- "compressedMemory" : Les moments saillants.
- "novaThought" : Une seule phrase d'accroche pour la PROCHAINE session. MAX 20 mots. Très spécifique.
- "microObjective" : Un mini-objectif ciblé sur sa faiblesse du jour.

Renvoie UNIQUEMENT le JSON valide (sans backticks markdown) :
{
  "compressedMemory": "...",
  "novaThought": "...",
  "microObjective": "...",
  "relationshipArc": {
    "phase": "acquaintance|familiar|friend|confidant",
    "sessionCount": ${arc.sessionCount + 1},
    "sharedJokes": [...],
    "memorableMoments": [...]
  }
}`;

      const raw = await callClaude(prompt, "Génère la mémoire de session");
      const parsed = safeParseJSON(raw);
      if (parsed && parsed.compressedMemory && parsed.novaThought && parsed.microObjective) {
        await storage.set("nova_session_memory", {
          compressedMemory: parsed.compressedMemory,
          novaThought: parsed.novaThought,
          microObjective: parsed.microObjective
        });
        if (parsed.relationshipArc && parsed.relationshipArc.phase) {
          await storage.set("nova_relationship_arc", parsed.relationshipArc);
          novaRelationshipArcRef.current = parsed.relationshipArc;
        }
        window.__debugLog?.(`[Nova Memory] Session memory & Relationship Arc generated and saved`, "info");
      } else {
        window.__debugLog?.(`[Nova Memory] Parse failed, payload invalid`, "error");
      }
    } catch (e) {
      window.__debugLog?.(`[Nova Memory] Generation failed: ${e.message}`, "error");
    } finally {
      isGeneratingMemoryRef.current = false;
    }
  };

  // (L'effet de montage a été déplacé plus bas après les déclarations d'états pour y accéder)

  const [practiceInput, setPracticeInput] = useState("");
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceListening, setPracticeListening] = useState(false);
  const [practiceMicCountdown, setPracticeMicCountdown] = useState(30);
  const [practiceTopic, setPracticeTopic] = useState("Free conversation");
  const [practiceLevel, setPracticeLevel] = useState("intermediate");
  const [practiceSpeaking, setPracticeSpeaking] = useState(false);
  // 🆕 Mute TTS auto-play in chat (default = ON on desktop to avoid tab sound icon, OFF on mobile)
  // FIX: on mobile, ignore the desktop-persisted value to avoid muting voice replies
  const [chatTtsMuted, setChatTtsMuted] = useState(() => {
    const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    try {
      const stored = localStorage.getItem("nova_chat_tts_muted");
      // On mobile: ignore desktop-persisted mute value, always start unmuted
      if (stored !== null && !isMobile) return stored === "1";
      if (stored !== null && isMobile) {
        // Clear stale desktop value on mobile
        localStorage.removeItem("nova_chat_tts_muted");
      }
    } catch { }
    return !isMobile; // muted by default on desktop, unmuted on mobile
  });
  useEffect(() => {
    try { localStorage.setItem("nova_chat_tts_muted", chatTtsMuted ? "1" : "0"); } catch { }
  }, [chatTtsMuted]);
  const [ttsVoice, setTtsVoice] = useState(""); // nom exact de la voix (v.name)
  const [availableFemaleVoices, setAvailableFemaleVoices] = useState([]); // voix féminines détectées
  const [ttsRate, setTtsRate] = useState(0.92);

  const novaLearnerProfileRef = useRef({
    actualLevel: "Unknown (analyzing...)",
    learningStyle: "Unknown",
    hotTopics: "None detected yet",
    dailyState: "Neutral",
    activeSeeds: []
  });
  const novaMessageCountRef = useRef(0);

  const [practiceSubView, setPracticeSubView] = useState("chat");

  // ── Résolution TDZ : cibles et objectifs calculés après déclaration de practiceSubView & practiceTopic ──
  const effectiveTargetExpressions = React.useMemo(() => {
    if (practiceSubView === "chat") {
      if (novaDailyTargetMode === "daily" && dailyOralTargetsData.targets.length > 0) {
        return dailyOralTargetsData.targets;
      }
      if (novaDailyTargetMode === "free") {
        return [];
      }
    }
    return targetExpressions;
  }, [practiceSubView, novaDailyTargetMode, dailyOralTargetsData, targetExpressions]);

  const effectiveSessionGoal = React.useMemo(() => {
    if (practiceSubView === "chat") {
      if (novaDailyTargetMode === "daily" && dailyOralTargetsData.targets.length > 0) {
        const list = dailyOralTargetsData.targets.map(t => t.front).join(", ");
        return `Daily targeted expressions practice: ${list}`;
      }
      return "Free conversation";
    }
    return practiceTopic || "Free conversation";
  }, [practiceSubView, novaDailyTargetMode, dailyOralTargetsData, practiceTopic]);

  // Détection en direct des cibles orales prononcées par l'élève dans Live Nova
  const spokenTargetIds = React.useMemo(() => {
    if (!dailyOralTargetsData?.targets?.length) return new Set();
    const spoken = new Set();
    const userUtterances = [
      ...(liveKitTranscriptions || []).filter(m => m.role === "user").map(m => m.text),
      ...(practiceMessages || []).filter(m => m.role === "user").map(m => m.text),
    ].filter(Boolean);

    if (userUtterances.length === 0) return spoken;

    dailyOralTargetsData.targets.forEach(target => {
      const isSpoken = userUtterances.some(text => isTargetSpoken(target, text));
      if (isSpoken) spoken.add(target.id);
    });

    return spoken;
  }, [dailyOralTargetsData, liveKitTranscriptions, practiceMessages]);
  const [speakItOpen, setSpeakItOpen] = useState(false);
  const [coachMode, setCoachMode] = useState("pronunciation");
  const [practiceDebateTopic, setPracticeDebateTopic] = useState("");
  const [practiceDebateHistory, setPracticeDebateHistory] = useState([]);
  const [practiceDebateSide, setPracticeDebateSide] = useState("for");
  const [debateListening, setDebateListening] = useState(false);
  // FIX (audit): états manquants utilisés par l'UI Débat (gradient + animation shatter)
  const [debateBalance, setDebateBalance] = useState(50);
  const [debateShatter, setDebateShatter] = useState(0);

  const [practiceRoleplayScenario, setPracticeRoleplayScenario] = useState("");
  const [practiceRoleplayHistory, setPracticeRoleplayHistory] = useState([]);
  const [practiceRoleplayCharacter, setPracticeRoleplayCharacter] = useState("interviewer");
  const [roleplayListening, setRoleplayListening] = useState(false);

  const [practiceDictationText, setPracticeDictationText] = useState("");
  const [practiceDictationSentences, setPracticeDictationSentences] = useState([]);
  const [practiceDictationInputs, setPracticeDictationInputs] = useState([]);
  const [practiceDictationCurrentIndex, setPracticeDictationCurrentIndex] = useState(0);
  const [practiceDictationScore, setPracticeDictationScore] = useState(null);
  const [practiceDictationLoading, setPracticeDictationLoading] = useState(false);
  const [practiceDictationFeedback, setPracticeDictationFeedback] = useState(null);

  const [practiceDailyChallenge, setPracticeDailyChallenge] = useState(null);
  const [practiceDailyLoading, setPracticeDailyLoading] = useState(false);
  const [practiceDailyAnswer, setPracticeDailyAnswer] = useState("");
  const [practiceDailyResult, setPracticeDailyResult] = useState(null);

  const [practiceStats, setPracticeStats] = useState({
    totalMessages: 0,
    sessionsCompleted: 0,
    levelEstimate: "B1",
    vocabDiversity: 0,
    mistakes: [],
    xp: 0,
    coins: 0,
    streak: 0,
    lastActiveDate: "",
  });
  const [practiceXpPopup, setPracticeXpPopup] = useState(null); // { xp, coins, label }
  const [practiceStatsLoaded, setPracticeStatsLoaded] = useState(false);
  const [practiceCorrections, setPracticeCorrections] = useState([]);
  const [practiceShowCorrection, setPracticeShowCorrection] = useState(false);
  const [practiceVocabFSRS, setPracticeVocabFSRS] = useState(false); // révisions centralisées dans Review
  const [practiceImmersionMode, setPracticeImmersionMode] = useState(false);

  // ── English Notebook ─────────────────────────────────────────────────────────
  const [notebookText, setNotebookText] = useState("");
  const [notebookType, setNotebookType] = useState("auto");
  const [notebookCards, setNotebookCards] = useState([]);
  const [notebookLoading, setNotebookLoading] = useState(false);
  const [notebookSaving, setNotebookSaving] = useState(false);
  const [notebookSaved, setNotebookSaved] = useState(false);
  const [notebookHistory, setNotebookHistory] = useState([]);
  const [notebookCategory, setNotebookCategory] = useState("");
  // ✅ FIX : sync notebookCategory avec le vrai module Anglais dès qu'il est résolu
  useEffect(() => {
    if (englishCategory) setNotebookCategory(englishCategory);
  }, [englishCategory]);

  const [practiceWritingText, setPracticeWritingText] = useState("");
  const [practiceWritingFeedback, setPracticeWritingFeedback] = useState(null);
  const [writingWordGoal, setWritingWordGoal] = useState(200);
  const [isReportExpanded, setIsReportExpanded] = useState(true);
  const [ieltsActiveTab, setIeltsActiveTab] = useState("overview");
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);
  const [showWritingTip, setShowWritingTip] = useState(false);
  const [showWritingHistory, setShowWritingHistory] = useState(false);
  const [writingHistory, setWritingHistory] = useState([]);
  const [practiceWritingLoading, setPracticeWritingLoading] = useState(false);
  const [practiceWritingPrompt, setPracticeWritingPrompt] = useState("");
  const [practiceWritingDrafts, setPracticeWritingDrafts] = useState([]);
  const [practiceWritingActiveId, setPracticeWritingActiveId] = useState(null);
  const [writingTabMode, setWritingTabMode] = useState("editor"); // "editor" | "history"
  const [draftSearchQuery, setDraftSearchQuery] = useState("");

  const filteredDrafts = useMemo(() => {
    if (!draftSearchQuery || !draftSearchQuery.trim()) return practiceWritingDrafts;
    const q = draftSearchQuery.toLowerCase().trim();
    return practiceWritingDrafts.filter(d =>
      (d.prompt && d.prompt.toLowerCase().includes(q)) ||
      (d.text && d.text.toLowerCase().includes(q)) ||
      (d.feedback?.overallComment && d.feedback.overallComment.toLowerCase().includes(q))
    );
  }, [practiceWritingDrafts, draftSearchQuery]);

  const getBandScoreColor = useCallback((score) => {
    const num = parseFloat(score);
    if (isNaN(num)) return "var(--mm-primary)";
    if (num >= 7) return "#10B981";
    if (num >= 5.5) return "#F59E0B";
    return "#EF4444";
  }, []);

  const [copiedDraftId, setCopiedDraftId] = useState(null);
  const [generatingCorrectedId, setGeneratingCorrectedId] = useState(null);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [expandedDraftIds, setExpandedDraftIds] = useState({});
  const [expandedMistakeIdxs, setExpandedMistakeIdxs] = useState({});

  const toggleDraftExpand = useCallback((draftId) => {
    setExpandedDraftIds(prev => ({
      ...prev,
      [draftId]: !prev[draftId]
    }));
  }, []);

  const toggleMistakeExpand = useCallback((idx) => {
    setExpandedMistakeIdxs(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  }, []);

  // Expressions révisées aujourd'hui pour réutilisation active dans le Writing Lab
  const [showReviewedDrawer, setShowReviewedDrawer] = useState(false);
  const todayDateStr = today();

  const { todayReviewedExpressions, hasTodayReviews } = useMemo(() => {
    if (!Array.isArray(expressions)) return { todayReviewedExpressions: [], hasTodayReviews: false };

    const reviewed = expressions.filter(e => {
      if (!englishCategoryFilter(e)) return false;
      const inHistory = Array.isArray(e.reviewHistory) && e.reviewHistory.some(r => r.date === todayDateStr);
      const inLastRev = typeof e.lastReviewed === "string" && e.lastReviewed.startsWith(todayDateStr);
      const inLastRevDate = e.lastReviewDate === todayDateStr;
      return inHistory || inLastRev || inLastRevDate;
    });

    if (reviewed.length > 0) {
      return { todayReviewedExpressions: reviewed, hasTodayReviews: true };
    }

    // Fallback gracieux si aucune révision aujourd'hui : proposer 10 expressions anglaises du deck
    const fallback = expressions.filter(englishCategoryFilter).slice(0, 10);
    return { todayReviewedExpressions: fallback, hasTodayReviews: false };
  }, [expressions, todayDateStr]);

  // Extraction chirurgicale de la traduction française courte (Vrai sens) sans le surplus de la fiche
  const extractFrenchTranslation = useCallback((backText) => {
    if (!backText || typeof backText !== "string") return "";

    // 1. Détection "Vrai sens :" (avec ou sans emojis/markdown)
    const vraiSensMatch = backText.match(/(?:📖\s*)?(?:\*{0,2}Vrai sens\s*(?:\(FR\))?\s*:\*{0,2})\s*([^\n🧩💬⚠️]+)/i);
    if (vraiSensMatch && vraiSensMatch[1]) {
      let clean = vraiSensMatch[1].replace(/[`*_~]/g, "").trim();
      clean = clean.split(/[🧩💬⚠️\n]/)[0].trim();
      if (clean) return clean;
    }

    // 2. Détection flèche "↳ <traduction>"
    const arrowMatch = backText.match(/^[↳\->]+\s*([^\n🧩💬⚠️]+)/m);
    if (arrowMatch && arrowMatch[1]) {
      const clean = arrowMatch[1].replace(/[`*_~]/g, "").trim();
      if (clean) return clean;
    }

    // 3. Première ligne nettoyée (sans emojis de rubriques)
    const firstLine = backText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("🧩") && !l.startsWith("💬") && !l.startsWith("⚠️") && !l.startsWith("* **"))[0] || "";

    let cleaned = firstLine
      .replace(/^#+\s*/g, "")
      .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2}/gu, "")
      .replace(/(?:\*{0,2}Vrai sens\s*:\*{0,2})/gi, "")
      .replace(/[`*_~]/g, "")
      .trim();

    if (cleaned.length > 95) {
      cleaned = cleaned.slice(0, 92) + "...";
    }
    return cleaned;
  }, []);

  const insertExpressionIntoDraft = useCallback((phrase) => {
    if (!phrase || !phrase.trim()) return;
    setPracticeWritingText(prev => {
      const trimmed = (prev || "").trimEnd();
      const spacer = trimmed.length > 0 ? " " : "";
      return trimmed + spacer + phrase.trim() + " ";
    });
    if (showToast) showToast(`"${phrase}" inséré dans votre essai ! ✍️`, "success");
  }, [showToast]);



  const togglePlayAudio = useCallback((text, audioId) => {
    if (!text || !text.trim()) return;
    if (playingAudioId === audioId) {
      stopEnglishAudio();
      setPlayingAudioId(null);
      return;
    }
    stopEnglishAudio();
    setPlayingAudioId(audioId);
    const ok = playEnglishAudio(text, {
      raw: true,
      groqApiKey: typeof getNextGroqKey === "function" ? getNextGroqKey() : null,
      onStart: () => setPlayingAudioId(audioId),
      onEnd: () => setPlayingAudioId(prev => prev === audioId ? null : prev),
      onError: () => setPlayingAudioId(prev => prev === audioId ? null : prev)
    });
    if (!ok) {
      setPlayingAudioId(null);
      if (showToast) showToast("Audio non disponible ou non supporté", "error");
    }
  }, [playingAudioId, getNextGroqKey, showToast]);

  const handleCopyText = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDraftId(id);
      if (showToast) showToast("Texte copié dans le presse-papiers ! 📋", "success");
      setTimeout(() => setCopiedDraftId(null), 2500);
    }).catch(() => {
      if (showToast) showToast("Impossible de copier le texte", "error");
    });
  };

  const generateMissingCorrectedText = async (draft) => {
    if (!draft || !draft.text || !draft.text.trim()) return;
    setGeneratingCorrectedId(draft.id);
    try {
      const raw = await callClaude(
        `Tu es un mentor d'anglais d'élite et examinateur officiel IELTS/Cambridge.
Analyse en profondeur cet essai rédigé par un étudiant francophone :
"""${draft.text}"""

Sujet : "${draft.prompt || "Présentation ou essai libre"}"

CONSIGNES STRICTES DE CLARTÉ PÉDAGOGIQUE (LIS ATTENTIVEMENT) :
1. ATOMICITÉ ABSOLUE : Isole chaque faute individuellement (un seul mot ou une courte expression de 1 à 3 mots). Ne fusionne JAMAIS plusieurs fautes distinctes dans un même bloc !
   - Mauvais exemple à PROSCRIRE : "i'm actually in my last year of degree" (ceci mélange 3 erreurs !).
   - Bon exemple OBLIGATOIRE :
     * Faute A : "i'm" ➔ "I'm" (Règle majuscule)
     * Faute B : "actually" ➔ "currently" (Faux-ami majeur)
     * Faute C : "last year of degree" ➔ "final year of my degree" (Vocabulaire académique & possessif)
     * Faute D : "go entreprise for a stage" ➔ "do an internship at a company" (Faux-ami & collocation)
     * Faute E : "about computer scientist" ➔ "in computer science" (Confusion discipline vs métier)
     * Faute F : "to create and knowing" ➔ "to create and know" (Parallélisme infinitif après 'to')
     * Faute G : "two differents domains" ➔ "two different fields" (Adjectif invariable sans 's')
     * Faute H : "AI logiciel" ➔ "AI software" (Traduction 'software' indénombrable)
     * Faute I : "make them safety" ➔ "ensure their safety / make them safe" (Nom vs adjectif)
     * Faute J : "cybersecurity and ai engeneering" ➔ "cybersecurity and AI engineering" (Orthographe & sigle)

2. CLARTÉ RADICALE DU "POURQUOI" :
   - Explique la règle en français limpide, direct et percutant, SANS JARGON FLOU ni formules abstraites.
   - Si c'est un faux-ami, donne obligatoirement le vrai sens du mot anglais et le mot qu'il fallait utiliser (ex: "'Actually' ne signifie JAMAIS 'actuellement', mais 'en fait / en réalité'. Pour dire 'actuellement / en ce moment', le seul mot anglais est 'currently'.").
   - Explique pourquoi le cerveau francophone s'est trompé (calque mot à mot, faux-ami).
   - Précise la sanction ou l'impact auprès d'un examinateur IELTS/Cambridge (ex: perte de points sur le critère Lexical Resource ou Grammatical Accuracy).

3. TEXTE CORRIGÉ INTÉGRAL : Fournis la version réécrite complète, naturelle et élégante en anglais.

Donne UNIQUEMENT un objet JSON valide (SANS TEXTE AUTOUR):
{
  "correctedText": "Version intégrale corrigée et réécrite en anglais naturel, fluide et impeccable",
  "mistakes": [
    {
      "originalText": "le mot ou segment exact de 1 à 3 mots (ex: actually)",
      "correctedText": "la correction exacte (ex: currently)",
      "category": "Faux-ami & Vocabulaire" | "Majuscules & Rigueur" | "Grammaire & Parallélisme" | "Accord d'adjectif" | "Orthographe",
      "why": "L'explication limpide du POURQUOI : sens réel du mot, règle de grammaire simple et contre-exemple clair",
      "examTrap": "Le piège pour francophones (calque/faux-ami) et ce que l'examinateur officiel IELTS sanctionne",
      "flashcard": {
        "front": "Question directe en français pour tester cette règle précise (ex: Comment dire 'actuellement' en anglais sans tomber dans le faux-ami ?)",
        "back": "Currently (attention : 'actually' signifie 'en réalité / en fait')"
      }
    }
  ]
}`
      );
      const parsed = safeParseJSON(raw);
      const cleanedText = parsed?.correctedText || (typeof raw === "string" && !raw.trim().startsWith("{") ? raw.trim() : "");
      const newMistakes = Array.isArray(parsed?.mistakes) && parsed.mistakes.length > 0 ? parsed.mistakes : null;

      if (cleanedText || newMistakes) {
        setPracticeWritingDrafts(prev => {
          const updated = prev.map(d => {
            if (d.id === draft.id) {
              return {
                ...d,
                feedback: {
                  ...(d.feedback || {}),
                  ...(cleanedText ? { correctedText: cleanedText } : {}),
                  ...(newMistakes ? { mistakes: newMistakes } : {})
                }
              };
            }
            return d;
          });
          storage.set("nova_writing_drafts", updated).catch(() => {});
          return updated;
        });
        if (practiceWritingActiveId === draft.id) {
          setPracticeWritingFeedback(prev => ({
            ...(prev || {}),
            ...(cleanedText ? { correctedText: cleanedText } : {}),
            ...(newMistakes ? { mistakes: newMistakes } : {})
          }));
        }
        if (showToast) showToast("Diagnostic intelligent & texte correctif générés ! ✨", "success");
      }
    } catch (e) {
      if (showToast) showToast("Erreur lors de la génération du diagnostic", "error");
    } finally {
      setGeneratingCorrectedId(null);
    }
  };

  const [practiceSpeakingAudioBlob, setPracticeSpeakingAudioBlob] = useState(null);
  const [practiceSpeakingTranscript, setPracticeSpeakingTranscript] = useState("");
  const [practiceSpeakingFeedback, setPracticeSpeakingFeedback] = useState(null);
  const [practiceSpeakingLoading, setPracticeSpeakingLoading] = useState(false);
  const [practiceSpeakingPrompt, setPracticeSpeakingPrompt] = useState("");
  const [practiceSpeakingIsRecording, setPracticeSpeakingIsRecording] = useState(false);
  const [practiceSpeakingCountdown, setPracticeSpeakingCountdown] = useState(10);
  const [practiceWaveformBars, setPracticeWaveformBars] = useState([]);
  const [practicePhonemeData, setPracticePhonemeData] = useState(null);

  // ── Speaking Lab : sélecteur de fiches (prononcer les expressions apprises) ──
  const [speakingFicheQuery, setSpeakingFicheQuery] = useState("");
  const [speakingFicheSourceId, setSpeakingFicheSourceId] = useState(null);

  const [practiceIeltsPart, setPracticeIeltsPart] = useState(1);
  const [practiceIeltsHistory, setPracticeIeltsHistory] = useState([]);

  const [practiceAchievements, setPracticeAchievements] = useState([]);
  const [practiceDashboardView, setPracticeDashboardView] = useState("overview");

  const [practiceExamMode, setPracticeExamMode] = useState(false);
  const [practiceExamSection, setPracticeExamSection] = useState("reading");
  const [practiceExamQuestions, setPracticeExamQuestions] = useState([]);
  const [practiceExamAnswers, setPracticeExamAnswers] = useState([]);
  const [practiceExamScore, setPracticeExamScore] = useState(null);

  const [practiceDuelActive, setPracticeDuelActive] = useState(false);
  const [practiceDuelTopic, setPracticeDuelTopic] = useState("");
  const [practiceDuelMessages, setPracticeDuelMessages] = useState([]);
  const [practiceEmotionFeedback, setPracticeEmotionFeedback] = useState(null);

  // ── Vocabulary Brain Map ─────────────────────────────────────────────────────
  const [brainMapWords, setBrainMapWords] = useState([]); // [{ word, theme, level, count, rarity, x, y }]
  const [brainMapSelected, setBrainMapSelected] = useState(null); // { word, explanation, example }
  const [brainMapLoading, setBrainMapLoading] = useState(false);
  const [brainMapExplaining, setBrainMapExplaining] = useState(null); // word being explained
  const [brainMapFilter, setBrainMapFilter] = useState("all"); // "all" | theme name
  const [brainMapHovered, setBrainMapHovered] = useState(null);
  const [brainMapMouse, setBrainMapMouse] = useState({ x: 0, y: 0 });

  // ── AI Accent Coach ──────────────────────────────────────────────────────────
  const [accentPhrase, setAccentPhrase] = useState(null);         // { text, targetSounds, tip }
  const [accentSoundFocus, setAccentSoundFocus] = useState("th"); // selected phoneme focus
  const [accentLoading, setAccentLoading] = useState(false);      // generating phrase
  const [accentRecording, setAccentRecording] = useState(false);
  const [accentAnalyzing, setAccentAnalyzing] = useState(false);
  const [accentFeedback, setAccentFeedback] = useState(null);     // { overallScore, issues:[{sound,heard,expected,fix,example}], praise, nextTip }

  // ── Pronunciation Coach ───────────────────────────────────────────────────────
  const [coachPhrase, setCoachPhrase] = useState(null);           // { text, cefrLevel }
  const [coachTranscript, setCoachTranscript] = useState("");     // SpeechRecognition result
  const [coachListening, setCoachListening] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachFeedback, setCoachFeedback] = useState(null);       // parsed JSON from Claude
  const [coachDifficulty, setCoachDifficulty] = useState(1);     // 1-5 progressive
  const [coachWordTip, setCoachWordTip] = useState(null);         // { word, tip, index }
  const [coachScoreAnim, setCoachScoreAnim] = useState(0);       // animated score 0→real
  const [coachGenerating, setCoachGenerating] = useState(false);
  const coachRecogRef = useRef(null);

  // ── AI Accent Coach — refs & state ─────────────────────────────────────────
  const accentRecorderRef = useRef(null);   // MediaRecorder instance
  const accentChunksRef = useRef([]);       // audio chunks
  const [accentHistory, setAccentHistory] = useState([]); // [{ phrase, sound, score, date, transcript }]
  const [xrayRevealed, setXrayRevealed] = useState({}); // { [wordIndex]: bool }

  // ── SRS (Spaced Repetition System) — source de vérité = expression directement (FSRS)
  const [srsReviewing, setSrsReviewing] = useState(null);      // expression being reviewed
  const [srsNarrative, setSrsNarrative] = useState("");         // Claude weekly analysis
  const [srsNarrLoading, setSrsNarrLoading] = useState(false);
  const [srsShowBack, setSrsShowBack] = useState(false);     // flip card
  const [srsFilter, setSrsFilter] = useState("overdue"); // "overdue" | "today" | "all"

  // ── Role-Play Vocal (Web Speech API — zéro dep) ───────────────────────
  // Tous les états volatils dans des refs pour éviter re-renders pendant la boucle vocale.
  const rpHistoryRef = useRef([]);          // { role, text, feedback }[]
  const rpScenarioRef = useRef(null);        // scénario courant
  const rpTurnRef = useRef(0);           // nombre d'échanges
  const rpRecogRef = useRef(null);        // SpeechRecognition instance
  const rpSpeakingRef = useRef(false);       // TTS en cours
  // Un seul état React pour forcer le re-render au bon moment
  const [rpState, setRpState] = useState("idle"); // "idle"|"picking"|"running"|"listening"|"thinking"|"scoring"|"done"
  const [rpScenario, setRpScenario] = useState(null);   // pour afficher le titre
  const [rpHistory, setRpHistory] = useState([]);     // pour afficher le transcript
  const [rpScore, setRpScore] = useState(null);   // JSON scoring final
  const [rpError, setRpError] = useState("");
  const MAX_RP_TURNS = 10;

  // ── Agent vocal ElevenLabs ───────────────────────────────────────────────
  const [agentVoiceId, setAgentVoiceId] = useState(AGENT_VOICES[0].id);
  const [agentError, setAgentError] = useState("");
  const [agentTranscript, setAgentTranscript] = useState([]);

  // Hook ElevenLabs Conversational AI
  const agent = useElevenLabsAgent();

  // ── Détection intelligente de fiches pendant la session vocale ─────────────
  const { clearPending, sessionCreatedCards } = useAgentCardDetector({
    agentTranscript,
    expressions,
    setExpressions,
    storage,
    callClaude,
    safeParseJSON: (...args) => safeParseJSON(...args),
    localToday: (...args) => localToday(...args),
    englishCategory,
    showToast,
    // Toujours actif : ElevenLabs, Nova (fallback gratuit), ou chat texte.
    // Le détecteur dédoublonne et filtre déjà tout seul, donc pas de bruit.
    enabled: true,
  });

  // Fiches ajoutées manuellement via tool d'agent (save_expression)
  const [manualSessionCards, setManualSessionCards] = useState([]);

  // Agrégation dédoublonnée de toutes les fiches créées durant la session en direct
  const allSessionCards = React.useMemo(() => {
    const list = [...(sessionCreatedCards || []), ...manualSessionCards];
    const seen = new Set();
    return list.filter(card => {
      const key = (card.id || card.front || "").toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sessionCreatedCards, manualSessionCards]);

  const sessionCardsCount = allSessionCards.length;

  // Redirection sans faille vers la vue fiches
  const handleViewSessionCreatedCards = useCallback(() => {
    if (sessionCardsCount === 0) {
      showToast?.("0 fiche créée pour le moment. Discute avec NOVA pour qu'elle relève tes expressions !", "info");
      return;
    }
    // Coupure propre de la voix avant la navigation
    if (agent?.isConnected) {
      try { agent.stop(); } catch (_e) {}
    }
    // Filtrage immédiat sur le module anglais
    if (typeof setFilterCat === "function") {
      setFilterCat(englishCategory || "🇬🇧 Anglais");
    }
    // Redirection sans faille
    if (typeof setView === "function") {
      setView("list");
    } else if (typeof navigate === "function") {
      navigate("list");
    }
    showToast?.(`📋 Affichage de tes ${sessionCardsCount} fiche${sessionCardsCount > 1 ? "s créées" : " créée"} durant cette session`, "success");
  }, [sessionCardsCount, agent, setFilterCat, englishCategory, setView, navigate, showToast]);

  // Hook Nova (PTT + pipeline STT → LLM → TTS)
  const novaVoice = useNovaAgent({
    transcribeWithGroq: (blob) => transcribeWithGroq(blob),
    callClaude: callClaude,
    getNextGroqKey: getNextGroqKey,
  });

  // ── Effets de chargement et sauvegarde automatique (Persistance IA) ──
  useEffect(() => {
    // Load Relationship Arc
    storage.get("nova_relationship_arc").then(saved => {
      if (saved && saved.phase) {
        novaRelationshipArcRef.current = saved;
      }
    });

    // Load Chat Messages
    storage.get("nova_practice_messages").then(savedMessages => {
      if (savedMessages && savedMessages.length > 0) {
        setPracticeMessages(savedMessages);
      } else {
        // Load Memory
        storage.get("nova_session_memory").then(saved => {
          if (saved && saved.novaThought && saved.compressedMemory) {
            novaSessionMemoryRef.current = {
              compressedMemory: saved.compressedMemory,
              microObjective: saved.microObjective
            };
            const initialMsgs = [{ role: "assistant", text: saved.novaThought }];
            setPracticeMessages(initialMsgs);
            storage.set("nova_practice_messages", initialMsgs).catch(() => { });
            storage.set("nova_session_memory", null);
            window.__debugLog?.(`[Nova Memory] Loaded continuity session`, "info");
          } else {
            setPracticeMessages([]);
          }
        }).catch(() => {
          setPracticeMessages([]);
        });
      }
    }).catch(() => {
      setPracticeMessages([]);
    });

    // Load Daily Challenge
    storage.get("nova_daily_challenge").then(saved => {
      if (saved) {
        setPracticeDailyChallenge(saved.challenge);
        setPracticeDailyAnswer(saved.answer || "");
        setPracticeDailyResult(saved.result || null);
      }
    }).catch(() => { });

    // Load Dictation
    storage.get("nova_dictation").then(saved => {
      if (saved) {
        setPracticeDictationText(saved.text || "");
        setPracticeDictationSentences(saved.sentences || []);
        setPracticeDictationInputs(saved.inputs || []);
        setPracticeDictationCurrentIndex(saved.currentIndex || 0);
        setPracticeDictationScore(saved.score !== undefined ? saved.score : null);
        setPracticeDictationFeedback(saved.feedback || null);
      }
    }).catch(() => { });

    // Load Coach Pronunciation
    storage.get("nova_coach").then(saved => {
      if (saved) {
        setCoachPhrase(saved.phrase || null);
        setCoachFeedback(saved.feedback || null);
        setCoachTranscript(saved.transcript || "");
        if (saved.difficulty !== undefined) setCoachDifficulty(saved.difficulty);
      }
    }).catch(() => { });

    // Load Exam
    storage.get("nova_exam").then(saved => {
      if (saved) {
        setPracticeExamQuestions(saved.questions || []);
        setPracticeExamAnswers(saved.answers || []);
        setPracticeExamScore(saved.score !== undefined ? saved.score : null);
        setPracticeExamSection(saved.section || "reading");
      }
    }).catch(() => { });

    // Load Writing Drafts (sans restaurer le dernier essai — session vierge par défaut)
    storage.get("nova_writing_drafts").then(saved => {
      if (saved && Array.isArray(saved)) {
        setPracticeWritingDrafts(saved);
        // NE PAS restaurer automatiquement le dernier brouillon dans l'éditeur :
        // l'utilisateur retrouve ses sessions via "Sessions passées".
      }
    }).catch(() => { });

    // Unmount hook for saving Memory and stopping audio
    return () => {
      stopEnglishAudio();
      if (practiceMsgRef.current && practiceMsgRef.current.length > 3) {
        generateSessionMemoryPayload(practiceMsgRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrêt automatique de l'audio si changement d'onglet ou sous-vue
  useEffect(() => {
    return () => {
      stopEnglishAudio();
      setPlayingAudioId(null);
    };
  }, [practiceSubView, writingTabMode]);


  // Auto-save chat messages
  useEffect(() => {
    if (practiceMessages.length > 0 && !(practiceMessages.length === 1 && practiceMessages[0].text === "...")) {
      storage.set("nova_practice_messages", practiceMessages).catch(() => { });
    }
  }, [practiceMessages]);

  // Auto-save daily challenge
  useEffect(() => {
    if (practiceDailyChallenge) {
      storage.set("nova_daily_challenge", {
        challenge: practiceDailyChallenge,
        answer: practiceDailyAnswer,
        result: practiceDailyResult
      }).catch(() => { });
    } else {
      storage.set("nova_daily_challenge", null).catch(() => { });
    }
  }, [practiceDailyChallenge, practiceDailyAnswer, practiceDailyResult]);

  // Auto-save dictation
  useEffect(() => {
    if (practiceDictationText) {
      storage.set("nova_dictation", {
        text: practiceDictationText,
        sentences: practiceDictationSentences,
        inputs: practiceDictationInputs,
        currentIndex: practiceDictationCurrentIndex,
        score: practiceDictationScore,
        feedback: practiceDictationFeedback
      }).catch(() => { });
    } else {
      storage.set("nova_dictation", null).catch(() => { });
    }
  }, [practiceDictationText, practiceDictationSentences, practiceDictationInputs, practiceDictationCurrentIndex, practiceDictationScore, practiceDictationFeedback]);

  // Auto-save writing drafts (debounced)
  useEffect(() => {
    if (!practiceWritingText) return;
    const timer = setTimeout(() => {
      setPracticeWritingDrafts(prev => {
        let activeId = practiceWritingActiveId;
        if (!activeId) {
          activeId = Date.now().toString();
          setPracticeWritingActiveId(activeId);
        }
        const existingIdx = prev.findIndex(d => d.id === activeId);
        const newDraft = {
          id: activeId,
          text: practiceWritingText,
          prompt: practiceWritingPrompt,
          date: new Date().toISOString(),
          feedback: practiceWritingFeedback
        };
        let next = [...prev];
        if (existingIdx >= 0) {
          next[existingIdx] = newDraft;
        } else {
          next = [newDraft, ...next];
        }
        storage.set("nova_writing_drafts", next).catch(() => { });
        return next;
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [practiceWritingText, practiceWritingPrompt, practiceWritingFeedback, practiceWritingActiveId]);

  // Auto-save coach phrase
  useEffect(() => {
    if (coachPhrase) {
      storage.set("nova_coach", {
        phrase: coachPhrase,
        feedback: coachFeedback,
        transcript: coachTranscript,
        difficulty: coachDifficulty
      }).catch(() => { });
    } else {
      storage.set("nova_coach", null).catch(() => { });
    }
  }, [coachPhrase, coachFeedback, coachTranscript, coachDifficulty]);

  // Auto-save exam
  useEffect(() => {
    if (practiceExamQuestions && practiceExamQuestions.length > 0) {
      storage.set("nova_exam", {
        questions: practiceExamQuestions,
        answers: practiceExamAnswers,
        score: practiceExamScore,
        section: practiceExamSection
      }).catch(() => { });
    } else {
      storage.set("nova_exam", null).catch(() => { });
    }
  }, [practiceExamQuestions, practiceExamAnswers, practiceExamScore, practiceExamSection]);

  // ── Fallback vocal (Web Speech API) — actif quand ElevenLabs absent ──────
  // Permet au bouton micro de fonctionner même sans clé ElevenLabs.
  const [speechFallbackActive, setSpeechFallbackActive] = useState(false);
  const speechRecogRef = useRef(null);

  const startSpeechFallback = useCallback(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { showToast("🎤 SpeechRecognition non supporté sur ce navigateur. Utilise Chrome.", "error"); return; }

    // Arrêter une session en cours
    if (speechRecogRef.current) { try { speechRecogRef.current.stop(); } catch (_) { } }

    const recog = new SpeechRec();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    speechRecogRef.current = recog;
    setSpeechFallbackActive(true);
    markInteracted();

    recog.onresult = (e) => {
      const raw = e.results[0]?.[0]?.transcript?.trim();
      const transcript = cleanSpeechTranscript(raw || "");
      if (transcript && !isMeaninglessSpeech(raw || "")) {
        setSpeechFallbackActive(false);
        stopSpeaking();
        // FIX: voice-initiated messages must force TTS reply + mark as direct gesture
        sendPracticeMessage(transcript, true, true);
      } else if (raw) {
        setSpeechFallbackActive(false);
      }
    };

    recog.onerror = (e) => {
      setSpeechFallbackActive(false);
      if (e.error !== "no-speech" && e.error !== "aborted") {
        showToast(`🎤 Micro : ${e.error}`, "error");
      }
    };

    recog.onend = () => setSpeechFallbackActive(false);

    try { recog.start(); } catch (e) { setSpeechFallbackActive(false); }
  }, [showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopSpeechFallback = useCallback(() => {
    try { speechRecogRef.current?.stop(); } catch (_) { }
    setSpeechFallbackActive(false);
  }, []);

  // Nettoyage au démontage
  useEffect(() => () => { try { speechRecogRef.current?.stop(); } catch (_) { } }, []);

  // Sync le transcript de l'agent dans l'état local
  useEffect(() => {
    if (agent.transcript && agent.transcript.length > 0) {
      setAgentTranscript(agent.transcript);
    }
  }, [agent.transcript]);

  // Afficher les erreurs de statut de l'agent
  useEffect(() => {
    // "unavailable" = pas de clé ElevenLabs dans .env → fallback HF silencieux
    if (agent.status === "unavailable") {
      sessionStorage.setItem("nova_active", "true"); // active le fallback HF/Nova
      setAgentError(""); // aucun message d'erreur rouge
      return;
    }

    if (agent.status === "error") {
      const { code, reason } = agent.wsCloseInfoRef?.current || {};
      // Messages ciblés selon le code de fermeture WebSocket ElevenLabs :
      // 1008 = Policy Violation (quota épuisé, plan insuffisant, LLM indisponible)
      // 1011 = Internal Server Error (bug ElevenLabs ou LLM preview instable)
      // 1006 = Connexion coupée sans message (réseau, CORS, agent non publié)
      // 0    = Erreur avant l'ouverture du WS (clé API invalide, agent ID faux)
      let hint = "";
      if (code === 1008) {
        hint = "Code 1008 — ElevenLabs a refusé la connexion : quota de minutes épuisé, plan insuffisant, ou le LLM sélectionné (\"Gemini 3 Flash Preview\") n'est pas disponible sur ton plan. → Essaie de changer le LLM pour \"gemini-2.5-flash\" sur elevenlabs.io.";
      } else if (code === 1011) {
        hint = "Code 1011 — Erreur interne ElevenLabs. Le LLM \"Gemini 3 Flash Preview\" est instable en ce moment. → Change le LLM pour \"gemini-2.5-flash\" ou \"gemini-2.5-flash\" sur elevenlabs.io.";
      } else if (code === 1006) {
        hint = "Code 1006 — Connexion interrompue (réseau ou CORS). Vérifie que l'agent est bien en mode Public sur elevenlabs.io, ou que la clé API dans .env est valide.";
      } else if (reason) {
        hint = `Raison : "${reason}"`;
      } else {
        hint = "Vérifie : (1) LLM → remplace \"Gemini 3 Flash Preview\" par \"gemini-2.5-flash\". (2) Clé API et Agent ID dans .env. (3) Agent publié sur elevenlabs.io.";
      }
      setAgentError(`⚠️ . ${hint} — Ouvre F12 → Console pour le détail.`);
    } else {
      setAgentError("");
    }
  }, [agent.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice Chat (VoiceMirror) ─────────────────────────────────────────────
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [voiceChatMode, setVoiceChatMode] = useState(null); // { mode, config }

  // customAgent : objet passé à VoiceMirror et AgentVoiceBar (mode chat principal)
  // ⚠️ FIX : mémoïsé pour éviter les re-renders infinis et les états bloqués
  // (un objet littéral recréé à chaque render causait des références instables
  //  qui maintenaient isConnected à true par erreur, bloquant l'input)
  const customAgent = useMemo(() => ({
    isConnected: agent.isConnected,
    isSpeaking: agent.isSpeaking,
    status: agent.status,
    selectedAgentIndex: agent.selectedAgentIndex,
    setSelectedAgentIndex: agent.setSelectedAgentIndex,
    agentStatus: agent.isConnected ? "connected" : "idle",
    interimTranscript: "",
    finalTranscript: "",
    lastAgentMessage: agentTranscript.filter(m => m.role === "agent").slice(-1)[0]?.text || "",
    extractedConcepts: [],
    start: (config) => agent.start(config),
    stop: () => agent.stop(),
    onSaveConcept: () => { },
  }), [
    agent.isConnected, agent.isSpeaking, agent.status,
    agent.selectedAgentIndex, agent.setSelectedAgentIndex,
    agent.start, agent.stop, agentTranscript,
  ]);

  // ── Coupure propre de la voix en cas de bascule vers un autre pilier (Shadowing, Dictation, etc.) ──
  useEffect(() => {
    if (practiceSubView !== "chat" && agent.isConnected) {
      agent.stop();
    }
  }, [practiceSubView, agent.isConnected, agent.stop]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔗 LIVE LINK — L'agent vocal ElevenLabs voit l'état réel de l'app :
  //    SRS (fiches dues), XP, niveau CEFR, expressions ciblées, mémoire coach.
  //    Il peut aussi CRÉER des fiches, LOGGER des corrections, DONNER de l'XP,
  //    directement au milieu d'une conversation, via les client tools ci-dessous.
  //    ⚠️ Pour que le LLM appelle ces tools, ils doivent aussi être déclarés
  //    dans le dashboard ElevenLabs (Agent → Tools → Client tool). Sinon les
  //    handlers restent dormants mais n'empêchent rien.
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    setContextSnapshotBuilder(() => {
      try {
        const srsStats = getSRSStats(expressions);
        const profile = novaLearnerProfileRef.current || {};
        const continuity = summarizeForContinuity(2);
        return {
          xp: { level: xpState?.level, total: xpState?.totalXP, streak: xpState?.streak },
          cefr: cefrState?.currentLevel || profile.actualLevel || "unknown",
          srs: {
            overdue: srsStats.overdueCount,
            due_today: srsStats.dueTodayCount,
            urgent_cards: srsStats.urgentCards.slice(0, 3).map(c => ({ front: c.front, back: c.back, category: c.category })),
          },
          target_expressions: (targetExpressions || []).slice(0, 5).map(ex => ({ front: ex.front, back: ex.back })),
          profile: {
            actualLevel: profile.actualLevel,
            hotTopics: profile.hotTopics,
            dailyState: profile.dailyState,
          },
          prior_sessions: continuity,
        };
      } catch (e) {
        console.warn("[agent] context snapshot failed", e);
        return null;
      }
    });

    const unreg = [];
    // save_expression : l'agent crée une fiche à la volée
    unreg.push(registerAgentClientTool("save_expression", ({ front, back, example, category } = {}) => {
      if (!front || !back) return { ok: false, error: "front and back required" };
      const id = "el-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      const newCard = {
        id, front: String(front).trim(), back: String(back).trim(),
        example: example ? String(example) : "",
        category: category ? String(category) : (practiceTopic || "Voice Coach"),
        createdAt: now, updatedAt: now
      };
      setExpressions(prev => [...prev, newCard]);
      setManualSessionCards(prev => [...prev, newCard]);
      try { awardXP(15, 3, `🎙️ Nouvelle expression via coach vocal : ${front}`); } catch { }
      try { showToast?.(`✨ Ajoutée : ${front}`); } catch { }
      return { ok: true, id };
    }));
    // mark_correction : logge une correction dans la mémoire de coach
    unreg.push(registerAgentClientTool("mark_correction", ({ original, corrected, note } = {}) => {
      try {
        const key = "mm_agent_corrections_v1";
        let list = [];
        try {
          list = JSON.parse(localStorage.getItem(key) || "[]");
        } catch (e) {
          list = [];
        }
        list.push({ ts: Date.now(), original, corrected, note });
        localStorage.setItem(key, JSON.stringify(list.slice(-100)));
      } catch { }
      return { ok: true };
    }));
    // award_xp : l'agent récompense un effort
    unreg.push(registerAgentClientTool("award_xp", ({ amount, reason } = {}) => {
      const n = Math.max(1, Math.min(50, Number(amount) || 10));
      try { awardXP(n, Math.round(n / 3), reason || "🎙️ Effort vocal"); } catch { }
      return { ok: true, amount: n };
    }));
    // end_session_summary : recap structuré à la fin
    unreg.push(registerAgentClientTool("end_session_summary", (payload = {}) => {
      try {
        const key = "mm_agent_last_summary_v1";
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), ...payload }));
      } catch { }
      return { ok: true };
    }));

    return () => { unreg.forEach(u => u()); };
  }, [expressions, targetExpressions, xpState, cefrState, practiceTopic, setExpressions, awardXP, showToast]);

  // ── Phase 3/4 — Pipeline production active (hook partagé avec EnglishInTheWild)
  const {
    analyzeSessionProductiveUses,
    openProductionChallengeIfRelevant: openProductionChallengeRaw,
    validateProductionSentence,
    postSessionChallenge,
    setPostSessionChallenge,
  } = useProductiveUse({
    callClaude,
    expressions,
    setExpressions,
    awardXP,
    showToast,
    // English-only : les autres matières n'ont pas de détection de production.
    categoryFilter: englishCategoryFilter,
  });

  // Adapter : fallback topic = practiceTopic si non fourni par l'appelant.
  const openProductionChallengeIfRelevant = useCallback(
    (topicHint, recentlyUpdated = []) =>
      openProductionChallengeRaw(topicHint || practiceTopic || "cette session", recentlyUpdated),
    [openProductionChallengeRaw, practiceTopic]
  );

  const startVoiceConversation = useCallback(({ mode, config } = {}) => {
    setVoiceChatMode({ mode, config });
    setIsVoiceChatActive(true);
  }, []);

  const stopVoiceConversation = useCallback(() => {
    setIsVoiceChatActive(false);
    setVoiceChatMode(null);
    if (sessionCreatedCards && sessionCreatedCards.length) {
      showToast(`✨ ${sessionCreatedCards.length} nouvelle(s) fiche(s) créée(s) — voir Fiches`, "success");
    }
    clearPending();

    // Phase 3 — analyse LLM automatique de la transcription complète
    try {
      const transcript = agentTranscriptRef.current || [];
      const userLines = transcript
        .filter(m => m && m.role === "user" && m.text)
        .map(m => m.text)
        .join("\n");
      if (userLines.trim().length > 20) {
        analyzeSessionProductiveUses({
          transcriptText: userLines,
          targets: effectiveTargetExpressions,
          sessionContext: "voice",
        }).then((updated) => openProductionChallengeIfRelevant(undefined, updated));
      } else {
        openProductionChallengeIfRelevant();
      }
    } catch (e) { console.warn("[stopVoiceConversation] analysis failed", e); }
  }, [clearPending, sessionCreatedCards, showToast, analyzeSessionProductiveUses, effectiveTargetExpressions, openProductionChallengeIfRelevant]);

  // ── Construit le system prompt ElevenLabs enrichi avec la mémoire de session ─
  // Même logique que sendPracticeMessage mais formaté pour l'agent vocal.
  const buildElevenLabsSystemPrompt = useCallback(({ topic, level, persona, immersionMode } = {}) => {
    const personaInst = persona === "MMA"
      ? "Act like a demanding MMA coach: direct, pushy, no filler. Keep it professional, never vulgar."
      : persona === "Recruteur"
        ? "Act like a senior tech recruiter running a real interview: precise, structured, professional, neutral tone."
        : "You are NOVA — a professional English coach for an ambitious adult learner. Tone: composed, articulate, respectful, high signal. No slang, no bestie/hype energy, no 'vibing', no exclamations stacking, no emojis. Speak like a top-tier private tutor: warm but serious, concise, precise.";

    const immersionInst = immersionMode
      ? "IMMERSION MODE: Never correct grammar mid-conversation. Never switch to French. Flow naturally like a native friend."
      : "CORRECTION STYLE: Never point out, flag, or mention the student's mistake directly — no parentheses, no brackets, no 'small correction:', nothing that interrupts the conversation. If the student makes a grammar, vocabulary, or preposition mistake, silently model the correct form by naturally reusing their idea with the right wording in your own reply (a natural corrective recast), then keep the conversation flowing exactly as if nothing happened. The mistake will be turned into a flashcard automatically behind the scenes — your only job is to always use the correct form yourself and never break the flow.";

    const profile = novaLearnerProfileRef.current;
    const profileInst = `[PSYCHOLINGUISTIC PROFILE] Actual Level: ${profile.actualLevel} | Learning Style: ${profile.learningStyle} | Hot Topics: ${profile.hotTopics} | Daily State: ${profile.dailyState}. Adapt your tone, vocabulary, and pacing to match this profile precisely.`;

    const continuityInst = novaSessionMemoryRef.current
      ? `[CONTINUITY MEMORY] Previous Session Highlights: ${novaSessionMemoryRef.current.compressedMemory} | Next Session Micro-Objective: ${novaSessionMemoryRef.current.microObjective}`
      : "";

    const arc = novaRelationshipArcRef.current;
    let relationshipInst = "";
    if (arc.phase === "acquaintance") {
      relationshipInst = "[RELATIONSHIP ARC] Phase: Acquaintance. Be warm, professional, and encouraging.";
    } else if (arc.phase === "familiar") {
      relationshipInst = "[RELATIONSHIP ARC] Phase: Familiar. Be more relaxed, tease slightly, use casual expressions.";
    } else if (arc.phase === "friend") {
      relationshipInst = "[RELATIONSHIP ARC] Phase: Friend. Act like a long-time friend. Banter, use inside jokes, be totally unfiltered.";
    } else if (arc.phase === "confidant") {
      relationshipInst = "[RELATIONSHIP ARC] Phase: Confidant. Deeply empathetic and fiercely loyal. Rich shared history.";
    }
    if (arc.sharedJokes?.length > 0 || arc.memorableMoments?.length > 0) {
      relationshipInst += ` [SHARED HISTORY] Inside jokes: ${JSON.stringify(arc.sharedJokes)}. Memorable moments: ${JSON.stringify(arc.memorableMoments)}. Reference these organically if the topic naturally arises.`;
    }

    let activeRecallInst = "";
    if (targetExpressions && targetExpressions.length > 0) {
      const expList = targetExpressions.map(ex =>
        `"${ex.front}" (meaning: ${ex.back})${ex.example ? ` - Example: "${ex.example}"` : ''}`
      ).join(" | ");
      activeRecallInst = `[ACTIVE RECALL MISSION] The student is currently learning these expressions: ${expList}. Subtly steer the conversation to create natural opportunities for the student to use them. If they use one correctly, acknowledge it enthusiastically. Do not force it unnaturally.`;
    }

    return [
      personaInst,
      `Student level: ${level || "intermediate"}. Current topic: "${topic || "Free conversation"}".`,
      immersionInst,
      profileInst,
      continuityInst,
      relationshipInst,
      activeRecallInst,
      "CRITICAL RULES: Replies 1–3 sentences MAX. End with one focused, adult open question. Neutral professional register. No slang, no emojis, no 'vibing/slay/bestie/energy' vocabulary, no stacked exclamations. Never use lists or bullet points.",
    ].filter(Boolean).join("\n");
  }, [targetExpressions]);

  // ── Construit le system prompt pour le Coach LiveKit NOVA ──────────────────
  // Même richesse que le prompt ElevenLabs, mais formaté pour l'agent vocal LiveKit.
  const buildLiveKitSystemPrompt = useCallback(() => {
    const name = studentName?.trim();
    const nameInst = name
      ? `The student's name is "${name}". Use their name naturally at the start and occasionally during the conversation. Never forget it.`
      : "";

    const profile = novaLearnerProfileRef.current;
    const profileInst = `[PSYCHOLINGUISTIC PROFILE] Actual Level: ${profile.actualLevel} | Learning Style: ${profile.learningStyle} | Hot Topics: ${profile.hotTopics} | Daily State: ${profile.dailyState}. Adapt your tone, vocabulary, and pacing to match this profile precisely.`;

    const continuityInst = novaSessionMemoryRef.current
      ? `[CONTINUITY MEMORY] Previous Session Highlights: ${novaSessionMemoryRef.current.compressedMemory} | Next Session Micro-Objective: ${novaSessionMemoryRef.current.microObjective}`
      : "";

    const arc = novaRelationshipArcRef.current;
    let relationshipInst = "";
    if (arc.phase === "acquaintance") {
      relationshipInst = "[RELATIONSHIP ARC] Phase: Acquaintance. Be warm, professional, and encouraging.";
    } else if (arc.phase === "familiar") {
      relationshipInst = "[RELATIONSHIP ARC] Phase: Familiar. Be more relaxed, tease slightly, use casual expressions.";
    } else if (arc.phase === "friend") {
      relationshipInst = "[RELATIONSHIP ARC] Phase: Friend. Act like a long-time friend. Banter, use inside jokes, be totally unfiltered.";
    } else if (arc.phase === "confidant") {
      relationshipInst = "[RELATIONSHIP ARC] Phase: Confidant. Deeply empathetic and fiercely loyal. Rich shared history.";
    }
    if (arc.sharedJokes?.length > 0 || arc.memorableMoments?.length > 0) {
      relationshipInst += ` [SHARED HISTORY] Inside jokes: ${JSON.stringify(arc.sharedJokes)}. Memorable moments: ${JSON.stringify(arc.memorableMoments)}. Reference these organically if the topic naturally arises.`;
    }

    let activeRecallInst = "";
    if (effectiveTargetExpressions && effectiveTargetExpressions.length > 0) {
      const expList = effectiveTargetExpressions.map(ex =>
        `"${ex.front}" (meaning: ${ex.back})${ex.example ? ` - Example: "${ex.example}"` : ''}`
      ).join(" | ");
      activeRecallInst = `[ACTIVE RECALL MISSION] The student is currently learning these expressions: ${expList}. Subtly steer the conversation to create natural opportunities for the student to use them. If they use one correctly, acknowledge it enthusiastically.`;
    }

    let modeInstruction = "";
    if (practiceSubView === "debate" && practiceDebateTopic) {
      modeInstruction = `MODE: COSMIC ARENA DEBATE.
You are ARGOS, an intense, highly articulate, and sharp debate coach and opponent.
Debate Topic: "${practiceDebateTopic}". Student Level: ${practiceLevel || "intermediate"}.
YOUR ROLE: Take a strong, compelling counter-position on "${practiceDebateTopic}". Challenge the student's arguments aggressively but constructively in English. Keep replies to 1-3 sentences and end with a counter-argument question.`;
    } else if (practiceSubView === "roleplay" && practiceRoleplayScenario) {
      const char = practiceRoleplayCharacter || "the other person in the scene";
      modeInstruction = `MODE: ROLEPLAY PRACTICE.
You are embodying the character "${char}" in the scenario: "${practiceRoleplayScenario}". Student Level: ${practiceLevel || "intermediate"}.
YOUR ROLE: Stay fully in character. Respond naturally in character in English, and keep the scene moving with a realistic question or prompt. Keep replies to 1-3 sentences.`;
    } else if (practiceSubView === "ielts") {
      modeInstruction = `MODE: IELTS SPEAKING EXAM.
You are an official IELTS Speaking examiner conducting Part ${practiceIeltsPart || 1}. Ask formal IELTS questions and evaluate fluency. Keep responses concise (1-3 sentences).`;
    } else {
      modeInstruction = `You are NOVA — a professional English coach for an ambitious adult learner. Tone: composed, articulate, respectful, high signal. No slang, no bestie/hype energy, no 'vibing', no emojis. Speak like a top-tier private tutor: warm but serious, concise, precise.`;
    }

    return [
      modeInstruction,
      nameInst,
      "CORRECTION STYLE: Never point out, flag, or mention the student's mistake directly — no parentheses, no brackets, no 'small correction:', nothing that interrupts the conversation. If the student makes a grammar, vocabulary, or preposition mistake, silently model the correct form by naturally reusing their idea with the right wording in your own reply (a natural corrective recast), then keep the conversation flowing exactly as if nothing happened. The mistake will be turned into a flashcard automatically behind the scenes — your only job is to always use the correct form yourself and never break the flow.",
      profileInst,
      continuityInst,
      relationshipInst,
      activeRecallInst,
      "CRITICAL RULES: Replies 1–3 sentences MAX. End with one focused, adult open question. Neutral professional register. No slang, no emojis, no 'vibing/slay/bestie/energy' vocabulary, no stacked exclamations. Never use lists or bullet points.",
    ].filter(Boolean).join("\n");
  }, [effectiveTargetExpressions, studentName, practiceSubView, practiceDebateTopic, practiceRoleplayScenario, practiceRoleplayCharacter, practiceIeltsPart, practiceLevel]);

  const liveKitSystemPrompt = useMemo(
    () => buildLiveKitSystemPrompt(),
    [buildLiveKitSystemPrompt]
  );

  // ── Pre-warming intelligent du token LiveKit Nova ─────────────────────────
  // Déclenché APRÈS l'initialisation de liveKitSystemPrompt (zéro TDZ)
  useEffect(() => {
    if (["chat", "debate", "roleplay", "ielts"].includes(practiceSubView)) {
      prewarmNovaToken({
        studentName,
        level: practiceLevel,
        sessionGoal: effectiveSessionGoal,
        targetExpressions: effectiveTargetExpressions,
        systemPrompt: liveKitSystemPrompt,
      }).catch(() => {});
    }
  }, [practiceSubView, studentName, practiceLevel, effectiveSessionGoal, effectiveTargetExpressions, liveKitSystemPrompt]);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const practiceEndRef = useRef(null);
  const practiceMsgRef = useRef(practiceMessages);
  const agentTranscriptRef = useRef(agentTranscript); // ← sync transcript ElevenLabs pour mémoire de session
  const practiceStatsRef = useRef(practiceStats);
  const practiceMediaRecorderRef = useRef(null);
  const practiceAudioChunksRef = useRef([]);
  const practiceMicTimeoutRef = useRef(null);
  const practiceMicIntervalRef = useRef(null);
  const speakingAnalyserRef = useRef(null);
  const speakingAnimFrameRef = useRef(null);
  const speakingWaveformRef = useRef([]);
  const speakingCanvasRef = useRef(null);
  const speakingAudioCtxRef = useRef(null); // ref unique pour éviter la fuite AudioContext
  const isSendingRef = useRef(false);
  // FIX B9: timer du popup XP — clearTimeout entre awards rapprochés
  const xpPopupTimerRef = useRef(null);
  // FIX B7: refs vers tous les MediaStreams actifs pour cleanup au unmount
  const activeStreamsRef = useRef(new Set());        // verrou synchrone anti double-envoi
  const debateRecorderRef = useRef(null);    // pour stopper l'enregistrement débat manuellement
  const roleplayRecorderRef = useRef(null);  // pour stopper l'enregistrement roleplay manuellement
  const userHasInteractedRef = useRef(false); // débloque l'autoplay TTS après 1ère interaction

  // ── Filet de sécurité : reset practiceLoading après 30 s ──────────────────
  // Protège contre un callClaude qui ne résoudrait jamais (réseau mort, timeout
  // serveur silencieux…) et laisserait l'input désactivée indéfiniment.
  useEffect(() => {
    if (!practiceLoading) return;
    const t = setTimeout(() => {
      setPracticeLoading(false);
      isSendingRef.current = false;
      showToast("La réponse a mis trop de temps. Réessaie.", "error");
    }, 30_000);
    return () => clearTimeout(t);
  }, [practiceLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync ref messages ───────────────────────────────────────────────────────
  useEffect(() => { practiceMsgRef.current = practiceMessages; }, [practiceMessages]);
  useEffect(() => { agentTranscriptRef.current = agentTranscript; }, [agentTranscript]); // ← sync ElevenLabs transcript
  useEffect(() => { practiceStatsRef.current = practiceStats; }, [practiceStats]);
  useEffect(() => { practiceEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [practiceMessages, liveKitTranscriptions]);

  // ── Phase 3 — Analyse LLM automatique à la fermeture de la session chat texte
  // Contrat de déclenchement :
  //  - Se lance UNE SEULE FOIS par session chat réelle (cleanup au démontage
  //    du composant OU au changement de practiceSubView), et sur onglet caché.
  //  - N'est PAS relancée par un changement de `targetExpressions` (qui suit
  //    l'état global `expressions` — modifié depuis n'importe où dans l'app).
  //  - Snapshotte les cibles à l'OUVERTURE de la vue chat (chatSessionTargetsRef).
  //  - Flag `sessionAnalyzedRef` empêche tout double appel LLM/toast/XP.
  const analyzeSessionProductiveUsesRef = useRef(analyzeSessionProductiveUses);
  const openProductionChallengeIfRelevantRef = useRef(openProductionChallengeIfRelevant);
  useEffect(() => { analyzeSessionProductiveUsesRef.current = analyzeSessionProductiveUses; }, [analyzeSessionProductiveUses]);
  useEffect(() => { openProductionChallengeIfRelevantRef.current = openProductionChallengeIfRelevant; }, [openProductionChallengeIfRelevant]);

  const chatSessionTargetsRef = useRef([]);
  const sessionAnalyzedRef = useRef(false);

  useEffect(() => {
    if (practiceSubView !== "chat") return;
    // Nouvelle session chat détectée : snapshot des cibles + reset du flag.
    chatSessionTargetsRef.current = targetExpressions;
    sessionAnalyzedRef.current = false;

    const runChatAnalysis = () => {
      if (sessionAnalyzedRef.current) return;
      sessionAnalyzedRef.current = true;
      try {
        const msgs = practiceMsgRef.current || [];
        const userLines = msgs
          .filter((m) => m && m.role === "user" && m.text)
          .map((m) => m.text)
          .join("\n");
        if (userLines.trim().length < 20) return;
        analyzeSessionProductiveUsesRef.current({
          transcriptText: userLines,
          targets: chatSessionTargetsRef.current,
          sessionContext: "chat",
        }).then((updated) =>
          openProductionChallengeIfRelevantRef.current(undefined, updated)
        );
      } catch (e) {
        console.warn("[chat-analysis]", e);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") runChatAnalysis();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      runChatAnalysis();
    };
    // Ne dépend QUE de practiceSubView : un changement de `targetExpressions`
    // déclenché depuis ailleurs dans l'app ne doit PAS re-tirer l'analyse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceSubView]);

  // ── Sync LiveKit transcriptions → agentTranscript (pour détection auto de fiches) ──
  // liveKitTranscriptions est maintenant un tableau unifié { id, role, identity, text, isFinal, ts }
  // produit par LiveKitStateSync (agent: TranscriptionSegment avec `final`, user: TextStreamData)
  const lastLkSyncedIdRef = useRef(null);
  useEffect(() => {
    if (!liveKitTranscriptions?.length) return;

    // Seuls les segments finaux comptent
    const finalMsgs = liveKitTranscriptions.filter(m => m.isFinal);
    if (!finalMsgs.length) return;

    // Agrégation continue des fragments oraux par tour de parole
    const groupedTurns = [];
    for (const msg of finalMsgs) {
      const text = (msg.text || "").trim();
      if (!text) continue;
      const prev = groupedTurns[groupedTurns.length - 1];
      if (prev && prev.role === msg.role) {
        prev.text = `${prev.text} ${text}`;
        prev.id = msg.id;
      } else {
        groupedTurns.push({ id: msg.id, role: msg.role, text });
      }
    }

    const lastAgentTurn = [...groupedTurns].reverse().find(m => m.role === "agent");
    if (!lastAgentTurn) return;
    if (lastAgentTurn.id === lastLkSyncedIdRef.current) return;

    const agentMsgIdx = groupedTurns.indexOf(lastAgentTurn);
    const lastUserTurn = groupedTurns.slice(0, agentMsgIdx).reverse().find(m => m.role === "user");

    setAgentTranscript(prev => {
      const existingTexts = new Set(prev.map(m => m.text?.trim()));
      const toAdd = [];
      if (lastUserTurn && !existingTexts.has(lastUserTurn.text?.trim())) {
        toAdd.push({ role: "user", text: lastUserTurn.text || "" });
      }
      if (!existingTexts.has(lastAgentTurn.text?.trim())) {
        toAdd.push({ role: "agent", text: lastAgentTurn.text || "" });
      }
      if (!toAdd.length) return prev;
      return [...prev, ...toAdd];
    });
    lastLkSyncedIdRef.current = lastAgentTurn.id;
  }, [liveKitTranscriptions]);

  // ── Callbacks agent vocal ────────────────────────────────────────────────────

  // ── Cleanup AudioContext à la destruction du composant ───────────────────────
  useEffect(() => {
    return () => {
      if (speakingAudioCtxRef.current && speakingAudioCtxRef.current.state !== "closed") {
        speakingAudioCtxRef.current.close();
        speakingAudioCtxRef.current = null;
      }
      cancelAnimationFrame(speakingAnimFrameRef.current);
      speakingAnalyserRef.current = null;
    };
  }, []);

  // ── Charger stats & achievements ────────────────────────────────────────────
  useEffect(() => {
    const loadStats = async () => {
      try {
        const saved = await storage.get("english_stats_v1");
        if (saved) setPracticeStats(saved);
      } finally {
        // FIX B14: toujours marquer loaded — sinon condition reste vraie en
        // permanence (et si la dep changeait, on aurait une boucle).
        setPracticeStatsLoaded(true);
      }
    };
    if (!practiceStatsLoaded) loadStats();
  }, [practiceStatsLoaded]);

  useEffect(() => {
    storage.get("english_achievements").then(saved => {
      if (saved) setPracticeAchievements(saved);
    }).catch(() => { });
  }, []);

  useEffect(() => {
    storage.get("english_notebook_history").then(h => { if (h) setNotebookHistory(h); }).catch(() => { });
  }, []);

  // Restore last active sub-view so navigating away and back keeps context
  useEffect(() => {
    const VALID_VIEWS = ["chat", "wild", "debate", "roleplay", "writing", "dictation"];
    const ALL_SUBVIEWS = [...VALID_VIEWS, "reallife"];
    storage.get("english_subview").then(saved => {
      if (saved && ALL_SUBVIEWS.includes(saved)) setPracticeSubView(saved);
    }).catch(() => { });
  }, []);

  // ══════════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Détection du format audio compatible ──────────────────────────────────────
  // iOS Safari : MediaRecorder.isTypeSupported peut ne pas exister → guard obligatoire
  const getSupportedMimeType = () => {
    if (typeof MediaRecorder === "undefined") return "";
    if (typeof MediaRecorder.isTypeSupported !== "function") return ""; // iOS < 14.3
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  };

  // ── Vérifie si l'environnement peut enregistrer de l'audio ──────────────────
  const canRecord = () => {
    if (typeof MediaRecorder === "undefined") return { ok: false, reason: "MediaRecorder non supporté sur ce navigateur. Utilise Chrome ou Firefox." };
    if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: "Accès micro non disponible. L'app doit être ouverte en HTTPS." };
    return { ok: true };
  };

  const saveStats = async (newStats) => {
    practiceStatsRef.current = newStats;
    setPracticeStats(newStats);
    await storage.set("english_stats_v1", newStats);
  };

  function levenshteinDistance(a, b) {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        matrix[j][i] = b[j - 1] === a[i - 1]
          ? matrix[j - 1][i - 1]
          : Math.min(matrix[j - 1][i - 1], matrix[j - 1][i], matrix[j][i - 1]) + 1;
      }
    }
    return matrix[b.length][a.length];
  }

  const availableVoicesRef = useRef([]);

  // ── Détection iOS — calculée une seule fois dans un ref (pas au render global) ──
  const isIOSRef = useRef(
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.MSStream
  );

  // ── Filtre prénoms masculins (partagé) ──────────────────────────────────────
  const MALE_MARKERS = /\b(neil|tim|liam|ryan|alfie|elliot|ethan|ollie|daniel|david|alex|fred|ralph|thomas|lee|mark|oliver|george|arthur|harry|james|charlie|henry|jack|noah|rishi|aaron|adam|eric|evan|guy|jason|jordan|julian|kevin|kyle|luis|mason|nathan|patrick|paul|peter|richard|robert|roger|sam|scott|sean|stephen|steven|tony|victor|william|luca|marco|diego|carlos|miguel|antonio|joão|pierre|jean|hans|lars|stefan|mikkel|ivan|yannick|remy)\b/i;

  useEffect(() => {
    if (!window.speechSynthesis) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return; // pas encore disponibles — on attend l'événement

      availableVoicesRef.current = voices;

      // Garder uniquement les voix anglaises dont le prénom n'est pas masculin
      const femaleEn = voices.filter(v =>
        v.lang.startsWith("en") && !MALE_MARKERS.test(v.name)
      );
      setAvailableFemaleVoices(femaleEn);

      // Auto-sélectionner la première voix valide si rien n'est encore choisi
      setTtsVoice(prev => {
        if (prev && femaleEn.some(v => v.name === prev)) return prev;
        return femaleEn[0]?.name || "";
      });
    };

    // Tenter immédiatement (Chromium les charge parfois de façon synchrone)
    loadVoices();
    // L'événement se déclenche quand les voix deviennent disponibles (Chrome, Firefox)
    // On NE remet PAS onvoiceschanged à null dans loadVoices : si Chrome recharge les
    // voix (ex: installation d'une nouvelle voix système), on se re-synchronise.
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const speakText = (text, isDirectGesture = false) => {
    if (!text?.trim()) return false;
    userHasInteractedRef.current = true;
    setPracticeSpeaking(true);
    liveKitVoiceBus.say(text);
    return true;
  };

  // Marquer l'interaction utilisateur — débloque l'autoplay TTS pour la session
  const markInteracted = () => { userHasInteractedRef.current = true; };

  // Couper la voix de l'IA immédiatement (appelé dès que l'utilisateur prend la parole)
  const stopSpeaking = () => {
    liveKitVoiceBus.interrupt();
    setPracticeSpeaking(false);
  };



  // ══════════════════════════════════════════════════════════════════════════════
  // FONCTIONS PRACTICE
  // ══════════════════════════════════════════════════════════════════════════════

  const correctMessage = async (userText) => {
    try {
      const raw = await callClaude(
        `Tu es un coach d'anglais expert et bienveillant. L'étudiant a écrit: "${userText}".
Analyse sa phrase et réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "corrected": "version corrigée complète de la phrase (identique à l'originale si aucune faute)",
  "hasErrors": true,
  "explanation": "Explication globale courte en français, ou 'Parfait !' si aucune faute",
  "mistakes": [
    {
      "wrong": "le mot ou groupe de mots EXACT tel que l'étudiant l'a écrit",
      "right": "la correction exacte à utiliser à la place",
      "reason": "explication pédagogique courte en français : POURQUOI c'est faux et comment retenir la règle",
      "example": "Une phrase modèle courte en anglais qui utilise correctement 'right', différente de la phrase de l'étudiant"
    }
  ]
}
Si la phrase est correcte, renvoie hasErrors:false et mistakes:[].
IMPORTANT: 'wrong' doit être le fragment exact de la phrase de l'étudiant, pas une reformulation.`,
        "Corrige cette phrase en anglais."
      );
      const parsed = safeParseJSON(raw);

      // N'afficher la correction que si les 3 conditions sont réunies :
      // 1. l'IA dit qu'il y a des fautes
      // 2. le texte corrigé est réellement différent de l'original
      // 3. il y a au moins une faute listée
      const hasRealErrors =
        parsed.hasErrors === true &&
        parsed.corrected.toLowerCase().trim() !== userText.toLowerCase().trim() &&
        Array.isArray(parsed.mistakes) && parsed.mistakes.length > 0;

      if (hasRealErrors) {
        setPracticeCorrections(prev => [{ original: userText, ...parsed }, ...prev].slice(0, 10));
        setPracticeShowCorrection(true);
      } else {
        setPracticeShowCorrection(false);
      }

      // Sauvegarder les vraies fautes détectées par l'IA
      const realMistakes = (parsed.mistakes || []).map(m => ({
        word: m.wrong || m.word || "[mot]",
        correction: m.right || m.correction || m.correct || "[correction manquante]",
        reason: m.reason || m.explanation || "",
        example: m.example || ""
      }));
      // ✅ FIX : appel setPracticeStats manquant (bug pré-existant — la mise à jour des stats ne se faisait jamais)
      setPracticeStats({
        ...practiceStatsRef.current,
        mistakes: [...practiceStatsRef.current.mistakes, ...realMistakes].slice(-50),
        totalMessages: practiceStatsRef.current.totalMessages + 1,
      });

      // Ajouter en fiche FSRS — format pédagogique complet
      if (practiceVocabFSRS && realMistakes.length > 0) {
        for (let mistake of realMistakes.slice(0, 3)) {
          const exist = expressions.find(
            e => e.front.toLowerCase().includes(mistake.word.toLowerCase()) && e.category?.includes("Anglais")
          );
          if (!exist) {
            // Front : la phrase fautive avec le fragment erroné mis en évidence
            const front = `❌ "${mistake.word}" → comment le dire correctement ?`;
            // Back : correction + règle + phrase modèle
            const back = `✅ ${mistake.correction}\n\n📌 ${mistake.reason}`;
            // Example : phrase modèle générée par l'IA, ou la phrase corrigée en fallback
            const example = mistake.example || parsed.corrected || "";

            const newCard = {
              id: Date.now().toString() + Math.random(),
              front,
              back,
              example,
              category: englishCategory,
              level: 0, nextReview: localToday(), createdAt: localToday(),
              easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null,
            };
            // ✅ FIX : sauvegarde IMMÉDIATE pour éviter la perte en cas d'actualisation
            setExpressions(prev => {
              const updated = [newCard, ...prev];
              return updated;
            });
          }
        }
      }
    } catch (e) { console.log("Correction error:", e); }
  };

  const analyzeInstantEmotion = (userText, responseTimeMs) => {
    const words = userText.trim().split(/\s+/).length;
    const isFast = responseTimeMs < 5000;
    const isSlow = responseTimeMs > 15000;

    let hesitations = 0;
    const hesitationMatches = userText.match(/\b(um|uh|hmm|err)\b/gi);
    if (hesitationMatches) hesitations = hesitationMatches.length;

    const hasConfusionPunctuation = /\?\?+|\.\.\./.test(userText);
    const isAllCaps = userText.length > 5 && userText === userText.toUpperCase();

    let emotionState = "";

    if (words <= 3 && isSlow && hesitations > 0) {
      emotionState = "The user took a long time to respond with a very short message containing hesitation. They might be lost or disengaged. Be extremely warm, lighten the cognitive load, and gently guide them. Do not ask complex questions.";
    } else if (words >= 20 && isFast) {
      emotionState = "The user is highly engaged, typing/speaking at length quickly. Match their intensity, challenge them, and dive deeper into the topic.";
    } else if (hasConfusionPunctuation) {
      emotionState = "The user's punctuation suggests confusion or hesitation. Clarify your previous point simply and reassure them.";
    } else if (words <= 3 && isFast && !hasConfusionPunctuation) {
      emotionState = "The user responded very quickly with a brief answer. They are following along but keeping it short. Keep the conversation dynamic and bounce back quickly.";
    } else if (isAllCaps) {
      emotionState = "The user is using ALL CAPS. They might be frustrated or very excited. Acknowledge their energy and adapt your tone accordingly.";
    } else if (words >= 15 && isSlow) {
      emotionState = "The user took their time to formulate a thoughtful, long response. Validate their effort and give a thoughtful, detailed reply.";
    } else {
      emotionState = "The user is responding normally. Keep a balanced, encouraging tone.";
    }

    return `[INSTANT EMOTIONAL CUES] ${emotionState}`;
  };

  const updateNovaProfile = async (userText, historyLines) => {
    try {
      const words = userText.trim().split(/\s+/);
      if (words.length < 5) return; // Ignore very short messages

      novaMessageCountRef.current += 1;
      if (novaMessageCountRef.current < 2) return; // Wait for a few messages

      const prompt = `Tu es un profileur psycholinguistique expert. Analyse les récents messages de l'étudiant et mets à jour son profil d'apprentissage.
Profil actuel : ${JSON.stringify(novaLearnerProfileRef.current)}

Conversation récente :
${historyLines}

Dernier message : "${userText}"

Pédagogie Invisible (Seeds) :
L'étudiant a des "graines" (seeds) linguistiques actives qu'il doit acquérir.
Vérifie s'il a utilisé correctement et spontanément une des graines existantes. (S'il ne fait que la répéter bêtement sans contexte direct, ce n'est pas acquis. A seed is mastered only if the student used it correctly and spontaneously, not in direct response to Nova using it).
Génère de nouvelles graines si nécessaire pour qu'il y en ait TOUJOURS EXACTEMENT DEUX :
- UNE structure grammaticale (ex: "used to + infinitive (e.g. I used to live...)")
- UN bloc lexical / expression (ex: "look forward to + V-ing")
Choisis-les intelligemment selon les faiblesses détectées dans son 'actualLevel'.

Renvoie UNIQUEMENT un objet JSON valide (sans markdown, sans backticks) avec ces clés :
{
  "actualLevel": "Niveau réel détecté (ex: A2 faible, B1 solide, hésite sur les temps du passé)",
  "learningStyle": "Style d'apprentissage (ex: aime les exemples, répond bien aux défis, phrases courtes)",
  "hotTopics": "Sujets qui le passionnent ou le bloquent",
  "dailyState": "État du jour (ex: bavard, fatigué, mode challenge)",
  "activeSeeds": ["<structure grammaticale explicite>", "<bloc lexical explicite>"]
}`;

      const raw = await callClaude(prompt, "Mets à jour le profil.");
      const parsed = safeParseJSON(raw);

      if (parsed && parsed.actualLevel && parsed.learningStyle && parsed.hotTopics && parsed.dailyState) {
        novaLearnerProfileRef.current = {
          actualLevel: parsed.actualLevel,
          learningStyle: parsed.learningStyle,
          hotTopics: parsed.hotTopics,
          dailyState: parsed.dailyState,
          activeSeeds: Array.isArray(parsed.activeSeeds) ? parsed.activeSeeds : []
        };
        window.__debugLog?.(`Nova Profile mis à jour: ${JSON.stringify(novaLearnerProfileRef.current)}`, "info");
      }
    } catch (e) {
      console.warn("Nova Profile update error (fallback to previous profile):", e);
    }
  };

  const sendPracticeMessage = async (text, isFromDirectGesture = false, forceVoiceReply = false) => {
    // Verrou synchrone — isSendingRef.current est lu/écrit dans le même tick,
    // Guard : si l'agent vocal est actif, ne pas dupliquer.
    if (isVoiceChatActive) return;
    if (!text.trim() || isSendingRef.current) return;
    isSendingRef.current = true;
    addProduction(text.trim(), "Chat", null);
    setPracticeMessages(prev => [...prev, { role: "user", text: text.trim() }]);
    setAgentTranscript(prev => [...prev, { role: "user", text: text.trim() }]); // ← sync détecteur fiches
    setPracticeInput(""); setPracticeLoading(true);
    // FIX B10: lancer la correction EN PARALLÈLE de la réponse du coach.
    // En mode Immersion, on ne coupe pas le flux avec des corrections.
    const correctionPromise = practiceImmersionMode
      ? null
      : correctMessage(text.trim()).catch(e => console.warn("Correction error:", e));
    try {
      // Unifié avec l'agent vocal ElevenLabs : même persona, même ton, même rythme.
      // Le coach textuel parle EXACTEMENT comme l'agent vocal (chat mode).
      const elevenStyleBase = buildElevenLabsSystemPrompt({
        topic: practiceTopic,
        level: practiceLevel,
        persona: practicePersona,
        immersionMode: practiceImmersionMode,
      });

      // Émotion temps réel + pédagogie invisible (spécifiques au mode texte)
      const responseTimeMs = Date.now() - lastAgentMessageTimeRef.current;
      const instantEmotionInst = analyzeInstantEmotion(text, responseTimeMs);
      const profile = novaLearnerProfileRef.current;
      const invisiblePedagogyInst = (profile.activeSeeds && profile.activeSeeds.length > 0)
        ? `[INVISIBLE PEDAGOGY] Active Seeds: ${profile.activeSeeds.join(' | ')}. INSTRUCTION: Use at most ONE of these per response, only if it fits naturally. If no natural opportunity exists, skip entirely. NEVER explain or highlight them.`
        : "";

      const voiceOutputRules = `VOICE OUTPUT RULES (critical — this text will be read aloud by a TTS engine):
- Speak ONLY in English. Natural spoken English only. No markdown, no bullet points, no lists, no bold, no headers.
- Use contractions always: don't, I'm, you've, that's, it's, we're.
- Use commas for short pauses, dashes — for dramatic pauses, ellipses... for hesitation.
- Keep sentences short. Max 2 sentences before a natural break.
- Never use parentheses, brackets, emojis, or special characters.
- React naturally but stay measured. No exaggerated reactions ("OMG", "no way", "vibing"), no slang, no emojis.
- ALWAYS end every single turn with one focused, adult open-ended question.
- Replies must be SHORT and punchy: 1–3 sentences MAX. This is a fast-paced spoken conversation, not a lecture.
- Write exactly what should be heard — nothing more.`;

      const systemPrompt = [
        elevenStyleBase,
        instantEmotionInst,
        invisiblePedagogyInst,
        voiceOutputRules,
      ].filter(Boolean).join("\n");
      // Use callClaude (unified retry + key rotation) instead of a raw fetch.
      // We embed the last 10 turns in the user message so the model has full context.
      const historyLines = practiceMsgRef.current.slice(-10)
        .map(m => `${m.role === "assistant" ? "Coach" : "Student"}: ${m.text}`)
        .join("\n");

      // Déclenchement du profilage en parallèle (non-bloquant)
      updateNovaProfile(text, historyLines).catch(e => console.warn(e));
      const userTurn = historyLines
        ? `Conversation so far:\n${historyLines}\n\nStudent: ${text.trim()}`
        : text.trim();
      const reply = (await callClaude(systemPrompt, userTurn)) || "I didn't catch that.";
      // 🔒 GODE MODE FIX : on AJOUTE le message AVANT de tenter le TTS pour qu'il s'affiche
      // même si la synthèse vocale échoue (mobile, navigateur restrictif, etc.).
      let played = false;
      // FIX: forceVoiceReply bypasses chatTtsMuted — voice-initiated messages always get spoken back
      const shouldSpeak = forceVoiceReply || !chatTtsMuted;
      const needsPlayInitial = !shouldSpeak;
      setPracticeMessages(prev => [...prev, { role: "assistant", text: reply, needsPlay: needsPlayInitial }]);
      if (shouldSpeak) {
        try {
          // Mobile : Groq TTS via Nova hook (haute qualité, fiable, pas de restriction autoplay)
          const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          if (isMobile) {
            await novaVoice.speak(reply);
            played = true;
          } else {
            played = speakText(reply, isFromDirectGesture || forceVoiceReply);
          }
        } catch (ttsErr) {
          console.warn("[Chat TTS] primary failed, trying fallback:", ttsErr);
          // Fallback : speakText (Web Speech API)
          try { played = speakText(reply, true); } catch { played = false; }
        }
        // Si l'audio a été bloqué (autoplay), on remet needsPlay=true sur le dernier message
        if (!played) {
          setPracticeMessages(prev => {
            const copy = [...prev];
            for (let j = copy.length - 1; j >= 0; j--) {
              if (copy[j].role === "assistant" && copy[j].text === reply) {
                copy[j] = { ...copy[j], needsPlay: true };
                break;
              }
            }
            return copy;
          });
        }
      }
      setAgentTranscript(prev => [...prev, { role: "agent", text: reply }]); // ← sync détecteur fiches
      saveStats({ ...practiceStatsRef.current, totalMessages: practiceStatsRef.current.totalMessages + 2 });
      awardXP(10, 2, "Message envoyé");
      lastAgentMessageTimeRef.current = Date.now();
      // Attendre la correction (déjà lancée) pour synchroniser l'affichage des fautes
      if (correctionPromise) await correctionPromise;
    } catch (err) {
      console.error("Chat error:", err);
      if (err.message === "429") showToast("⏳ Trop de requêtes, renvoie le message.", "error");
      else showToast("Erreur réseau. Vérifie ta connexion. 🔄", "error");
    } finally {
      setPracticeLoading(false);
      isSendingRef.current = false; // libérer le verrou dans tous les cas
    }
  };

  const switchSubView = (view) => {
    setPracticeInput("");
    setPracticeSubView(view);
    storage.set("english_subview", view)?.catch?.(() => { });  // persist so navigation away and back restores position
  };

  const generateDynamicGreeting = async (topic = practiceTopic, level = practiceLevel) => {
    setPracticeLoading(true);
    setPracticeMessages([{ role: "assistant", text: "..." }]);
    try {
      let prompt = "";
      if (novaDailyTargetMode === "daily" && dailyOralTargetsData.targets.length > 0) {
        const targetList = dailyOralTargetsData.targets.map(t => `"${t.front}" (= ${t.back})`).join(", ");
        prompt = `Tu es Nova, un coach d'anglais ultra-charismatique et bienveillant pour un apprenant adulte nommé ${studentName || "l'étudiant"}.
Niveau CEFR : ${level || "intermediate"}.
L'étudiant a révisé ces expressions aujourd'hui : ${targetList}.
Génère une phrase d'accroche captivante, vivante et courte (2 à 3 phrases max) où tu lances un mini-dilemme ou une anecdote concrète qui tisse le sens de ces expressions, et termine par une vraie question ouverte invitant l'étudiant à partager son point de vue.
Ne cite JAMAIS les mots comme une liste de vocabulaire ou un exercice scolaire. Parle uniquement en anglais, sans guillemets autour.`;
      } else {
        prompt = `Tu es Nova, un coach d'anglais ultra-charismatique et amical. Le sujet de conversation choisi par l'étudiant est "${topic || "Free conversation"}" et son niveau estimé est ${level}.
Génère une phrase d'accroche chaleureuse et courte (2 phrases max) pour commencer la conversation, qui se termine par une vraie question ouverte pertinente sur ce sujet.
Varie ton style à chaque fois comme un vrai humain qui entame la discussion. Ne mets pas de guillemets autour de ta réponse. Parle uniquement en anglais.`;
      }
      const response = await callClaude(prompt, "Génération de l'accroche Nova");
      if (response) {
        setPracticeMessages([{ role: "assistant", text: response.trim() }]);
      } else {
        setPracticeMessages([{ role: "assistant", text: `Great! Let's talk about "${topic}". I'm ready whenever you are! 🎤` }]);
      }
    } catch (e) {
      setPracticeMessages([{ role: "assistant", text: `Great! Let's talk about "${topic}". I'm ready whenever you are! 🎤` }]);
    } finally {
      setPracticeLoading(false);
    }
  };

  const resetPracticeChat = () => {
    window.speechSynthesis?.cancel();
    setPracticeSpeaking(false);
    storage.set("nova_practice_messages", null).catch(() => { });
    generateDynamicGreeting();
  };

  // Helper : transcrit un audioBlob via Groq Whisper
  // ⚠️ L'extension du fichier doit correspondre au vrai MIME type du blob.
  // iOS/Safari enregistre en audio/mp4 → le fichier doit s'appeler .mp4
  // Android/Chrome enregistre en audio/webm → le fichier doit s'appeler .webm
  const getMimeExtension = (mimeType) => {
    if (!mimeType) return "webm";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("wav")) return "wav";
    return "webm"; // fallback
  };

  const transcribeWithGroq = async (audioBlob) => {
    const keys = getNextGroqKey();
    if (!keys || keys.length === 0) throw new Error("Aucune clé API Groq disponible. Veuillez patienter.");

    let blobType = audioBlob.type || "";
    if (!blobType || blobType === "audio/mp4;codecs=mp4a.40.2") blobType = "audio/mp4";
    const ext = getMimeExtension(blobType);
    const fileName = `audio.${ext}`;

    window.__debugLog?.(`Whisper: blobType="${blobType}" size=${audioBlob.size}o fileName=${fileName}`, "info");

    const fixedBlob = new Blob([audioBlob], { type: blobType });
    const formData = new FormData();
    formData.append("file", fixedBlob, fileName);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "en");

    let lastErr = null;
    for (const apiKey of keys) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}` },
          body: formData,
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          window.__debugLog?.(`Whisper erreur ${res.status}: ${errText.slice(0, 100)}`, "error");
          throw new Error(`Erreur API ${res.status}`);
        }
        const data = await res.json();
        window.__debugLog?.(`Whisper OK: "${(data.text || "").slice(0, 50)}"`, "info");
        return data.text?.trim() || "";
      } catch (err) {
        lastErr = err;
        // Essayer la clé suivante
      }
    }
    throw lastErr || new Error("Erreur API");
  };

  const togglePracticeMic = async () => {
    // Couper l'IA dès que l'utilisateur touche le micro
    stopSpeaking();
    markInteracted();
    if (practiceListening) {
      clearTimeout(practiceMicTimeoutRef.current);
      clearInterval(practiceMicIntervalRef.current);
      setPracticeMicCountdown(30);
      if (practiceMediaRecorderRef.current?.state === "recording") practiceMediaRecorderRef.current.stop();
      return;
    }

    // ── Vérifications préalables ──────────────────────────────────────────────
    const check = canRecord();
    if (!check.ok) { showToast("🎤 " + check.reason, "error"); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamsRef.current.add(stream);
      const mimeType = getSupportedMimeType();

      // Si aucun format supporté et MediaRecorder existe quand même, on tente sans mimeType
      let mediaRecorder;
      try {
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (recErr) {
        // Dernier recours : sans options (laisse le navigateur choisir)
        mediaRecorder = new MediaRecorder(stream);
      }

      practiceMediaRecorderRef.current = mediaRecorder;
      practiceAudioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) practiceAudioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        clearTimeout(practiceMicTimeoutRef.current);
        clearInterval(practiceMicIntervalRef.current);
        setPracticeMicCountdown(30);
        setPracticeListening(false);
        if (practiceAudioChunksRef.current.length === 0) {
          stream.getTracks().forEach(t => t.stop());
          activeStreamsRef.current.delete(stream);
          showToast("⚠️ Aucun son détecté.", "warning");
          return;
        }
        setPracticeInput("⏳ Transcription en cours...");
        const actualMime = mediaRecorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(practiceAudioChunksRef.current, { type: actualMime });
        try {
          const raw = await transcribeWithGroq(audioBlob);
          const transcript = cleanSpeechTranscript(raw || "");
          if (transcript && !isMeaninglessSpeech(raw || "")) { setPracticeInput(""); await sendPracticeMessage(transcript, true); }
          else { setPracticeInput(""); showToast("🤷 Aucune parole exploitable détectée.", "warning"); }
        } catch (err) {
          setPracticeInput("");
          showToast("Erreur transcription : " + err.message, "error");
        } finally {
          stream.getTracks().forEach(t => t.stop());
          activeStreamsRef.current.delete(stream);
        }
      };
      mediaRecorder.start();
      setPracticeListening(true);
      setPracticeMicCountdown(30);
      showToast("🎤 Parle maintenant...");
      // Tick visible countdown every second
      practiceMicIntervalRef.current = setInterval(() => {
        setPracticeMicCountdown(prev => {
          if (prev <= 1) { clearInterval(practiceMicIntervalRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
      practiceMicTimeoutRef.current = setTimeout(() => {
        if (practiceMediaRecorderRef.current?.state === "recording") practiceMediaRecorderRef.current.stop();
      }, 30000);
    } catch (e) {
      // Message d'erreur précis selon le type d'erreur navigateur
      const msg = e?.name === "NotAllowedError" ? "Permission micro refusée. Autorise le micro dans les réglages de ton navigateur."
        : e?.name === "NotFoundError" ? "Aucun micro détecté sur cet appareil."
          : e?.name === "NotReadableError" ? "Micro occupé par une autre application."
            : e?.name === "SecurityError" ? "Micro bloqué : l'app doit être ouverte en HTTPS."
              : `Erreur micro : ${e?.message || e}`;
      showToast("🎤 " + msg, "error");
    }
  };

  // Mode Débat
  // FIX BUG CRITIQUE : cette fonction appelait startVoiceConversation(), qui (1)
  // ne connecte jamais réellement l'agent (customAgent.isConnected ne bascule
  // QUE via AgentVoiceBar → agent.start()) et (2) met isVoiceChatActive à `true`
  // pour de bon, sans jamais le remettre à `false` — ce qui bloque ensuite
  // silencieusement sendDebateMessage ET sendRoleplayMessage ("if (isVoiceChatActive)
  // return;") pour tout le reste de la session. Résultat concret : cliquer sur
  // "⚔️ Engage!" ne faisait RIEN, et l'agent semblait absent pour discuter — y
  // compris ensuite dans l'onglet Roleplay. On lance maintenant une vraie réplique
  // d'ouverture du débat, comme pour le Roleplay.
  const startDebate = async (selectedTopic) => {
    const topic = (typeof selectedTopic === "string" ? selectedTopic : practiceDebateTopic || "").trim();
    if (!topic) return;
    if (topic !== practiceDebateTopic) {
      setPracticeDebateTopic(topic);
    }
    switchSubView("debate");
    setPracticeDebateHistory([]);
    markInteracted();
    armIosAudio();
    setLiveKitTranscriptions([]);
    setAgentTranscript([]);
    setAgentError("");
    agent.start(MODE_CONFIGS.debate({ topic, level: practiceLevel }));
  };

  const sendDebateVoiceMessage = async () => {
    stopSpeaking();
    if (debateListening) return;
    if (customAgent.isConnected) {
      showToast("🎙️ Session LiveKit active — ARGOS écoute déjà directement ton micro !", "info");
      return;
    }
    const check = canRecord();
    if (!check.ok) { showToast("🎤 " + check.reason, "error"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamsRef.current.add(stream);
      const mimeType = getSupportedMimeType();
      let mediaRecorder;
      try { mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
      catch { mediaRecorder = new MediaRecorder(stream); }
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        setDebateListening(false);
        const actualMime = mediaRecorder.mimeType || mimeType || "audio/mp4";
        const blob = new Blob(chunks, { type: actualMime });
        try {
          const raw = await transcribeWithGroq(blob);
          const transcript = cleanSpeechTranscript(raw || "");
          if (transcript && !isMeaninglessSpeech(raw || "")) await sendDebateMessage(transcript);
        } catch (e) { showToast("Erreur transcription", "error"); }
        stream.getTracks().forEach(t => t.stop());
        activeStreamsRef.current.delete(stream);
      };
      debateRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setDebateListening(true);
      showToast("🎤 Parle maintenant... (clique ⏹️ pour arrêter)");
      setTimeout(() => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 8000);
    } catch (e) {
      const msg = e?.name === "NotAllowedError" ? "Permission micro refusée." : e?.name === "NotFoundError" ? "Aucun micro détecté." : `Erreur : ${e?.message || e}`;
      showToast("🎤 " + msg, "error");
    }
  };

  const sendDebateMessage = async (text) => {
    if (!text.trim() || isVoiceChatActive) return;
    setPracticeDebateHistory(prev => [...prev, { role: "user", text }]);
    try {
      const raw = await callClaude(
        `Tu es un professeur d'anglais animant un débat. Le sujet est "${practiceDebateTopic}". L'étudiant a dit: "${text}". Contre-argumente et pose une nouvelle question. Reste en anglais.`,
        text
      );
      setPracticeDebateHistory(prev => [...prev, { role: "assistant", text: raw.trim() }]);
      markInteracted(); speakText(raw.trim());
      awardXP(20, 5, "Argument de débat 💬");
    } catch (e) { showToast("Erreur débat", "error"); }
  };

  // FIX (audit): helper manquant utilisé dans le rendu Débat & Role-Play.
  // Version no-op sûre : retourne le texte tel quel.
  const renderDraggableWord = (text) => text;

  // FIX (audit): handler manquant pour l'input texte du mode Role-Play.
  const sendRoleplayMessage = async (text) => {
    if (!text.trim() || isVoiceChatActive) return;
    setPracticeRoleplayHistory(prev => [...prev, { role: "user", text }]);
    try {
      const raw = await callClaude(
        `You are roleplaying as ${practiceRoleplayCharacter || "the other person"} in this scenario: "${practiceRoleplayScenario}". The student just said: "${text}". Respond in character in English, naturally, and keep the scene moving with a question or prompt.`,
        text
      );
      const reply = (raw || "").trim();
      setPracticeRoleplayHistory(prev => [...prev, { role: "assistant", text: reply }]);
      markInteracted();
      speakText(reply);
      awardXP(15, 4, "Échange role-play 🎭");
    } catch (e) {
      console.error("Roleplay error:", e);
      showToast("Erreur role-play", "error");
    }
  };

  // FIX BUG : les cartes de scénario du mode Role-Play appelaient l'ancienne
  // fonction startRoleplay() (moteur Web Speech API legacy, aujourd'hui
  // supprimé de l'UI) au lieu de peupler practiceRoleplayScenario /
  // practiceRoleplayHistory — les états réellement lus par cet écran. Résultat :
  // cliquer sur un scénario ne faisait RIEN dans cette vue (aucun agent, aucune
  // réplique d'ouverture). Ce helper démarre correctement la scène ici.
  const beginRoleplayScenario = async (scenarioText) => {
    const scenario = (scenarioText || "").trim();
    if (!scenario) return;
    setPracticeRoleplayScenario(scenario);
    setPracticeRoleplayHistory([]);
    markInteracted();
    armIosAudio();
    setLiveKitTranscriptions([]);
    setAgentTranscript([]);
    setAgentError("");
    agent.start(MODE_CONFIGS.roleplay({
      scenario,
      character: practiceRoleplayCharacter || "the other person in the scenario",
      level: practiceLevel,
    }));
  };

  // ── Role-Play Vocal (Web Speech API) ─────────────────────────────────────────
  // 8 scénarios hardcodés
  const RP_SCENARIOS = [
    {
      id: "job_interview",
      emoji: "💼",
      title: "Job Interview",
      subtitle: "Google-style Tech Interview",
      role: "a senior Google recruiter conducting a technical job interview",
      opening: "Hello! Thanks for coming in today. I'm Alex, senior recruiter here at Google. Before we dive into the technical side, could you start by telling me a little about yourself?",
      color: "var(--mm-primary)",
      tip: "Use formal English, structure your answers with STAR method"
    },
    {
      id: "airport",
      emoji: "✈️",
      title: "Airport Immigration",
      subtitle: "US Customs & Border Protection",
      role: "a strict US immigration officer at JFK airport",
      opening: "Next! Passport please. What is the purpose of your visit to the United States?",
      color: "#1D3461",
      tip: "Be concise, direct, and polite. Have your answers ready."
    },
    {
      id: "restaurant",
      emoji: "🍽️",
      title: "NYC Restaurant",
      subtitle: "Busy Manhattan diner",
      role: "a fast-talking, no-nonsense New York City waiter in a busy diner",
      opening: "Alright folks, what can I getcha? We got the daily special — pastrami on rye, can't go wrong. You ready to order or you need another minute?",
      color: "#E63946",
      tip: "Speak fast, use casual expressions, be decisive"
    },
    {
      id: "negotiation",
      emoji: "🤝",
      title: "Negotiation",
      subtitle: "Difficult client wants a discount",
      role: "a tough business client who wants a significant price reduction and is ready to walk away",
      opening: "Look, I've been looking at your quote and frankly, it's way over our budget. Your competitor is offering 30% less. What can you do for me?",
      color: "#F4A261",
      tip: "Use persuasive language, justify your value, find middle ground"
    },
    {
      id: "doctor",
      emoji: "🏥",
      title: "ER Doctor",
      subtitle: "US Emergency Room",
      role: "an efficient American emergency room doctor taking a patient history quickly",
      opening: "Hi there, I'm Dr. Johnson. What brings you into the ER today? On a scale of 1 to 10, how would you rate your pain?",
      color: "#2EC4B6",
      tip: "Describe symptoms clearly, use body part names, mention duration"
    },
    {
      id: "first_date",
      emoji: "💘",
      title: "First Date",
      subtitle: "Casual coffee chat",
      role: "a curious, funny, charming person on a first date at a coffee shop",
      opening: "Hey, I'm so glad we finally met! I have to ask — your profile said you love adventures. What's the craziest thing you've ever done?",
      color: "#FF6B6B",
      tip: "Be natural, use humor, ask follow-up questions"
    },
    {
      id: "police_stop",
      emoji: "🚔",
      title: "Traffic Stop",
      subtitle: "US Police Officer",
      role: "a professional American police officer who has pulled someone over for speeding",
      opening: "Good evening. License and registration, please. Do you know why I pulled you over today?",
      color: "#264653",
      tip: "Stay calm, be respectful, answer clearly and honestly"
    },
    {
      id: "phone_interview",
      emoji: "📞",
      title: "Phone Interview",
      subtitle: "Tricky HR screening",
      role: "an HR recruiter conducting a 15-minute phone screening, asking behavioral and trick questions",
      opening: "Hi, this is Sarah from the HR department. Thanks for taking my call! Let's jump right in. Can you tell me — what would your biggest weakness be?",
      color: "#7B2D8B",
      tip: "Structure answers, be specific, turn weaknesses into growth stories"
    },
  ];

  // Speak with LiveKit voice agent
  const rpSpeak = (text, onEnd) => {
    if (!text?.trim()) { onEnd?.(); return; }
    liveKitVoiceBus.say(text);
    const words = text.split(/\s+/).length;
    const durationMs = Math.max(1400, (words / 2.6) * 1000);
    rpSpeakingRef.current = true;
    setTimeout(() => {
      rpSpeakingRef.current = false;
      onEnd?.();
    }, durationMs);
  };

  // Start speech capture to get user reply
  const rpListen = (onResult, onError) => {
    if (customAgent.isConnected) {
      const startCount = (liveKitTranscriptions || []).filter(t => t.role === "user").length;
      let checkTimer = setInterval(() => {
        const userSegs = (liveKitTranscriptions || []).filter(t => t.role === "user");
        if (userSegs.length > startCount) {
          clearInterval(checkTimer);
          onResult(userSegs[userSegs.length - 1].text);
        }
      }, 500);
      rpRecogRef.current = { abort: () => clearInterval(checkTimer) };
      return rpRecogRef.current;
    }
    // Fallback: enregistreur audio intégré Whisper
    const check = canRecord();
    if (!check.ok) { onError?.(check.reason); return null; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      activeStreamsRef.current.add(stream);
      const mimeType = getSupportedMimeType();
      let mediaRecorder;
      try { mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
      catch { mediaRecorder = new MediaRecorder(stream); }
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const actualMime = mediaRecorder.mimeType || mimeType || "audio/mp4";
        const blob = new Blob(chunks, { type: actualMime });
        try {
          const raw = await transcribeWithGroq(blob);
          const transcript = cleanSpeechTranscript(raw || "");
          onResult(transcript);
        } catch (err) { onError?.(err.message); }
        stream.getTracks().forEach(t => t.stop());
        activeStreamsRef.current.delete(stream);
      };
      rpRecogRef.current = mediaRecorder;
      mediaRecorder.start();
      setTimeout(() => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 7000);
    }).catch(e => onError?.(e.message));
  };

  // Send one turn to Claude: get reply + inline feedback
  const rpClaudeTurn = async (scenario, history, userText) => {
    const historyLines = history.map(h =>
      `${h.role === "user" ? "Student" : scenario.title}: ${h.text}`
    ).join("\n");
    const raw = await callClaude(
      `You are playing the role of ${scenario.role}. Stay in character at all times. Respond ONLY in English, maximum 2 sentences. After your reply, on a new line write exactly:
FEEDBACK: [one concrete grammar or vocabulary correction if the student made a mistake, otherwise write 'Perfect!']

Example:
Here is my reply to the student.
FEEDBACK: You said 'I am go' → correct form is 'I'm going'.`,
      `Conversation so far:\n${historyLines}\n\nStudent just said: "${userText}"\n\nRespond in character (2 sentences max), then give feedback.`
    );
    // Split reply vs feedback
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    const fbIdx = lines.findIndex(l => l.toUpperCase().startsWith("FEEDBACK:"));
    const reply = fbIdx === -1 ? raw.trim() : lines.slice(0, fbIdx).join(" ").trim();
    const feedback = fbIdx === -1 ? "" : lines[fbIdx].replace(/^FEEDBACK:/i, "").trim();
    return { reply, feedback };
  };

  // Request final scoring from Claude
  const rpClaudeScore = async (scenario, history) => {
    const fullTranscript = history.map((h, i) =>
      `${h.role === "user" ? "Student" : scenario.title}: ${h.text}`
    ).join("\n");
    const raw = await callClaude(
      `You are an expert English language evaluator. Analyze this conversation transcript and return ONLY valid JSON (no markdown, no explanation) in exactly this format:
{"fluencyScore":78,"grammarScore":65,"vocabularyScore":82,"nativeWordsUsed":["actually","sort of"],"errorsFound":[{"said":"I am go","correct":"I'm going"}],"overallFeedback":"Good fluency overall.","level":"B1-B2"}

Rules:
- Scores are 0-100 integers
- nativeWordsUsed: English filler/native words the student used naturally
- errorsFound: max 5 most important errors
- overallFeedback: 1-2 sentences in French
- level: CEFR estimate`,
      `Scenario: ${scenario.title}\n\nFull transcript:\n${fullTranscript}\n\nEvaluate the student only (not the ${scenario.title} character).`
    );
    return safeParseJSON(raw);
  };

  // Main roleplay entry point: pick scenario → start loop
  const startRoleplay = async (scenario) => {
    rpHistoryRef.current = [];
    rpTurnRef.current = 0;
    rpScenarioRef.current = scenario;
    setRpScenario(scenario);
    setRpHistory([]);
    setRpScore(null);
    setRpError("");
    setRpState("running");
    markInteracted();
    switchSubView("roleplay");
    // Claude/character opens the scene
    const openingEntry = { role: "assistant", text: scenario.opening, feedback: "" };
    rpHistoryRef.current = [openingEntry];
    setRpHistory([openingEntry]);
    rpSpeak(scenario.opening, () => rpStartListeningTurn());
  };

  const rpStartListeningTurn = () => {
    if (rpTurnRef.current >= MAX_RP_TURNS) { rpFinishSession(); return; }
    setRpState("listening");
    rpListen(
      (transcript) => rpOnUserSpeech(transcript),
      (err) => { setRpError(err); setRpState("running"); }
    );
  };

  const rpOnUserSpeech = async (transcript) => {
    if (!transcript.trim()) { rpStartListeningTurn(); return; }
    setRpState("thinking");
    const userEntry = { role: "user", text: transcript, feedback: "" };
    rpHistoryRef.current = [...rpHistoryRef.current, userEntry];
    setRpHistory([...rpHistoryRef.current]);
    rpTurnRef.current += 1;
    try {
      const scenario = rpScenarioRef.current;
      const { reply, feedback } = await rpClaudeTurn(scenario, rpHistoryRef.current, transcript);
      // Update user entry with feedback
      rpHistoryRef.current = rpHistoryRef.current.map((h, i) =>
        i === rpHistoryRef.current.length - 1 ? { ...h, feedback } : h
      );
      const assistantEntry = { role: "assistant", text: reply, feedback: "" };
      rpHistoryRef.current = [...rpHistoryRef.current, assistantEntry];
      setRpHistory([...rpHistoryRef.current]);
      setRpState("running");
      awardXP(12, 3, "Échange role-play");
      if (rpTurnRef.current >= MAX_RP_TURNS) {
        rpSpeak(reply, () => rpFinishSession());
      } else {
        rpSpeak(reply, () => rpStartListeningTurn());
      }
    } catch (e) {
      setRpError("Erreur Claude: " + e.message);
      setRpState("running");
    }
  };

  const rpFinishSession = async () => {
    setRpState("scoring");
    liveKitVoiceBus.interrupt();
    try {
      const score = await rpClaudeScore(rpScenarioRef.current, rpHistoryRef.current);
      setRpScore(score);
      awardXP(50, 15, "Session Role-Play complète 🎭");
    } catch (e) {
      setRpScore({ fluencyScore: "?", grammarScore: "?", vocabularyScore: "?", nativeWordsUsed: [], errorsFound: [], overallFeedback: "Erreur scoring.", level: "?" });
    }
    setRpState("done");
  };

  const rpStopSession = () => {
    liveKitVoiceBus.interrupt();
    rpRecogRef.current?.abort?.();
    if (rpTurnRef.current > 0) { rpFinishSession(); }
    else { setRpState("picking"); setRpHistory([]); setRpScore(null); }
  };

  // Mode Dictée
  const startDictation = async () => {
    setPracticeDictationLoading(true);
    try {
      const raw = await callClaude(
        `Génère une dictée en anglais (30-50 mots) adaptée à un niveau ${practiceLevel}. Découpe-la logiquement en 3 à 5 phrases. Réponds UNIQUEMENT un tableau JSON de chaînes de caractères (les phrases). Rien d'autre.`,
        "Dictée"
      );
      const parsed = safeParseJSON(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setPracticeDictationSentences(parsed);
        setPracticeDictationText(parsed.join(" "));
        setPracticeDictationInputs(new Array(parsed.length).fill(""));
        setPracticeDictationCurrentIndex(0);
        setPracticeDictationScore(null);
        setPracticeDictationFeedback(null);
        switchSubView("dictation");
      }
    } catch (e) { showToast("Erreur dictée", "error"); }
    setPracticeDictationLoading(false);
  };

  const checkDictation = async () => {
    const fullInput = practiceDictationInputs.join(" ").trim();
    if (!fullInput) return;

    const norm = (s) => (s || "").toLowerCase().normalize("NFKC").replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[^\p{L}\p{N}'\s\-]/gu, "").replace(/\s+/g, " ").trim();
    const expected = norm(practiceDictationText);
    const actual = norm(fullInput);
    if (!expected.length) return;
    const distance = levenshteinDistance(expected, actual);
    const score = expected.length > 0 ? Math.max(0, Math.round(100 - (distance / expected.length) * 100)) : 0;
    setPracticeDictationScore(score);
    addProduction(fullInput, "Dictation", score);

    if (score >= 95) awardXP(50, 15, "Dictée parfaite 🏆");
    else if (score >= 70) awardXP(20, 5, "Bonne dictée");
    else awardXP(10, 2, "Dictée complétée");

    try {
      const prompt = `Corrige la dictée d'un étudiant.\nTexte attendu:\n"${practiceDictationText}"\n\nTexte écrit:\n"${fullInput}"\n\nRetourne UNIQUEMENT du JSON: {"score": <0-10>, "mistakes": [{"originalText": "erreur ou phrase mal écrite", "correctedText": "correction parfaite", "rule": "explication brève", "oralFeedback": "phrase courte en français, ex: 'Tu as écrit x. En réalité ça s'écrit y, même si on le prononce z.'", "flashcard": {"front": "La question directe en français pour tester cette erreur", "back": "la correction en anglais"}}]}`;
      const raw = await callClaude(prompt, "Correction dictée");
      const parsed = safeParseJSON(raw);
      if (parsed?.mistakes) {
        setPracticeDictationFeedback(parsed);
      }
    } catch (e) { }
  };

  // Défi quotidien
  const loadDailyChallenge = async () => {
    setPracticeDailyLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un coach d'anglais. Crée un petit défi du jour (question, quiz, mini dictée) pour un étudiant de niveau ${practiceLevel}.
Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "type": "question|fillin|translate",
  "prompt": "La question ou consigne",
  "correct": "la réponse principale attendue",
  "acceptedAnswers": ["variante 1", "variante 2"],
  "hint": "un indice court si l'étudiant est bloqué"
}
acceptedAnswers doit contenir toutes les formulations correctes alternatives (ex: contractions, ordre des mots différent, synonymes valides).`,
        "Défi quotidien"
      );
      const parsed = safeParseJSON(raw);
      setPracticeDailyChallenge(parsed);
      switchSubView("daily");
    } catch (e) { showToast("Erreur chargement défi", "error"); }
    setPracticeDailyLoading(false);
  };

  const checkDailyAnswer = async () => {
    if (!practiceDailyAnswer.trim()) return;

    const normalize = (s) => s.toLowerCase().trim().replace(/[.,!?;:'"-]/g, "").replace(/\s+/g, " ");

    const userNorm = normalize(practiceDailyAnswer);
    const correctNorm = normalize(practiceDailyChallenge.correct || "");

    // 1. Correspondance exacte (après normalisation)
    if (userNorm === correctNorm) {
      setPracticeDailyResult({ correct: true, quality: "exact", userAnswer: practiceDailyAnswer, correctAnswer: practiceDailyChallenge.correct, feedback: "Parfait ! ✅" });
      awardXP(25, 8, "Défi quotidien réussi ⭐");
      return;
    }

    // 2. Correspondance avec les variantes acceptées
    const accepted = (practiceDailyChallenge.acceptedAnswers || []).map(normalize);
    if (accepted.includes(userNorm)) {
      setPracticeDailyResult({ correct: true, quality: "accepted", userAnswer: practiceDailyAnswer, correctAnswer: practiceDailyChallenge.correct, feedback: "Correct ! Bonne variante ✅" });
      awardXP(25, 8, "Défi quotidien réussi ⭐");
      return;
    }

    // 3. Tolérance typo via Levenshtein (≤ 2 erreurs pour les réponses courtes, ≤ 15% pour les longues)
    const maxDist = correctNorm.length <= 8 ? 1 : Math.floor(correctNorm.length * 0.15);
    const dist = levenshteinDistance(userNorm, correctNorm);
    const closeEnough = dist <= maxDist || accepted.some(a => levenshteinDistance(userNorm, a) <= maxDist);

    if (closeEnough) {
      setPracticeDailyResult({ correct: true, quality: "typo", userAnswer: practiceDailyAnswer, correctAnswer: practiceDailyChallenge.correct, feedback: `Presque parfait — petite faute de frappe. La réponse était : "${practiceDailyChallenge.correct}" ✅` });
      awardXP(20, 5, "Défi réussi (typo tolérée)");
      return;
    }

    // 4. Cas ambigu : l'utilisateur a écrit une phrase complète alors que la réponse attendue est un mot
    //    → on demande à l'IA de juger
    const userIsLonger = userNorm.split(" ").length > correctNorm.split(" ").length + 2;
    if (userIsLonger || dist < correctNorm.length * 0.5) {
      try {
        const raw = await callClaude(
          `Tu es un correcteur d'anglais. Le défi était : "${practiceDailyChallenge.prompt}". La réponse attendue est : "${practiceDailyChallenge.correct}". L'étudiant a répondu : "${practiceDailyAnswer}".
Est-ce que sa réponse est correcte ou acceptable ? Réponds UNIQUEMENT en JSON :
{"acceptable": true, "feedback": "Explication courte en français"}`,
          "Vérification réponse défi"
        );
        const parsed = safeParseJSON(raw);
        if (parsed.acceptable) {
          setPracticeDailyResult({ correct: true, quality: "ai", userAnswer: practiceDailyAnswer, correctAnswer: practiceDailyChallenge.correct, feedback: parsed.feedback });
          awardXP(20, 6, "Défi réussi ⭐");
        } else {
          setPracticeDailyResult({ correct: false, quality: "wrong", userAnswer: practiceDailyAnswer, correctAnswer: practiceDailyChallenge.correct, feedback: parsed.feedback });
          awardXP(5, 1, "Défi quotidien tenté");
        }
      } catch {
        // Si l'appel IA échoue, marquer comme incorrect
        setPracticeDailyResult({ correct: false, quality: "wrong", userAnswer: practiceDailyAnswer, correctAnswer: practiceDailyChallenge.correct, feedback: null });
        awardXP(5, 1, "Défi quotidien tenté");
      }
      return;
    }

    // 5. Clairement faux
    setPracticeDailyResult({ correct: false, quality: "wrong", userAnswer: practiceDailyAnswer, correctAnswer: practiceDailyChallenge.correct, feedback: null });
    awardXP(5, 1, "Défi quotidien tenté");
  };

  // Examen Blanc
  const startExamMode = async (section = "reading") => {
    setPracticeExamMode(true);
    setPracticeExamSection(section);
    try {
      const raw = await callClaude(
        `Tu es un examinateur d'anglais. Génère 5 questions à choix multiples pour la section "${section}" d'un test standard (TOEIC/IELTS). Format JSON: {"questions":[{"question":"...","options":["A","B","C","D"],"correct":"A"}]}.`,
        "Exam blanc"
      );
      const parsed = safeParseJSON(raw);
      // FIX B2: garde-fou si l'IA renvoie un JSON sans champ "questions"
      const qs = Array.isArray(parsed?.questions) ? parsed.questions : [];
      if (qs.length === 0) {
        showToast("L'IA n'a pas renvoyé de questions valides. Réessaie.", "error");
        return;
      }
      setPracticeExamQuestions(qs);
      setPracticeExamAnswers([]);
      switchSubView("exam");
    } catch (e) { showToast("Erreur examen", "error"); }
  };

  const submitExam = () => {
    if (!Array.isArray(practiceExamQuestions) || practiceExamQuestions.length === 0) return;
    let score = 0;
    practiceExamQuestions.forEach((q, i) => { if (practiceExamAnswers[i] === q.correct) score++; });
    setPracticeExamScore(score);
  };

  // Writing Lab
  const IELTS_TOPIC_BANK = [
    {
      topic: "Intelligence Artificielle & Emploi",
      prompt: "Some people believe that artificial intelligence will create more jobs than it destroys, while others fear mass unemployment. Discuss both views and give your opinion."
    },
    {
      topic: "Télétravail & Mondialisation",
      prompt: "In many countries, working from home has become common practice. Do the advantages of this trend for workers and companies outweigh the disadvantages?"
    },
    {
      topic: "Éducation Supérieure Gratuite",
      prompt: "University education should be completely free for all students, funded entirely by governments. To what extent do you agree or disagree?"
    },
    {
      topic: "Taxe Carbone & Écologie",
      prompt: "The most effective way to solve global environmental issues is to heavily tax fossil fuel consumption. To what extent do you agree or disagree?"
    },
    {
      topic: "Réseaux Sociaux & Société",
      prompt: "Social media platforms bring communities closer together across the world, yet some argue they cause social isolation. Discuss both views and give your opinion."
    },
    {
      topic: "Longévité & Retraite",
      prompt: "In modern societies, life expectancy is increasing rapidly. What challenges does this present for public institutions, and what measures can be taken to address them?"
    }
  ];

  const pickRandomIeltsTopic = () => {
    const available = IELTS_TOPIC_BANK.filter(item => item.prompt !== practiceWritingPrompt);
    const chosen = available[Math.floor(Math.random() * available.length)] || IELTS_TOPIC_BANK[0];
    setPracticeWritingPrompt(chosen.prompt);
    if (showToast) showToast(`Sujet IELTS généré : ${chosen.topic} 💡`, "info");
  };

  const startNewWritingSession = () => {
    setPracticeWritingText("");
    setPracticeWritingPrompt("");
    setPracticeWritingFeedback(null);
    setIsReportExpanded(true);
    setIeltsActiveTab("overview");
    storage.set("nova_writing", null).catch(() => { });
    if (showToast) showToast("Nouvelle session vierge prête ! ✍️", "info");
  };

  const loadPastSession = (session) => {
    setPracticeWritingPrompt(session.prompt || "");
    setPracticeWritingText(session.text || "");
    setPracticeWritingFeedback(session.feedback || null);
    setIsReportExpanded(true);
    setIeltsActiveTab("overview");
    setShowWritingHistory(false);
    if (showToast) showToast("Session rechargée 📖", "info");
  };

  const submitWriting = async () => {
    if (!practiceWritingText.trim()) return;
    setPracticeWritingLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un mentor d'anglais d'élite et examinateur officiel IELTS/Cambridge.
Analyse en profondeur l'essai rédigé par un apprenant francophone.
Sois hyper intelligent, limpide et pédagogue dans ton diagnostic.

RÈGLE IMPÉRATIVE DE LANGUE (FONDAMENTAL) :
- TOUTES les explications, commentaires, synthèses et analyses ("overallComment", "grammarFeedback", "vocabularyFeedback", "structureFeedback", "why", "examTrap", "front") DOIVENT ÊTRE EXCLUSIVEMENT RÉDIGÉS EN FRANÇAIS LIMPIDE ET NATUREL.
- SEULES la version réécrite globale ("correctedText") et les corrections ciblées de mots ("correctedText" dans mistakes) doivent être en anglais impeccable.

CONSIGNES STRICTES DE CLARTÉ PÉDAGOGIQUE :
1. ATOMICITÉ & PRIORITÉ (6 À 8 ERREURS MAXIMUM) : Cible les 6 à 8 erreurs les plus pénalisantes et prioritaires pour le band score IELTS (focus en priorité sur les faux-amis, calques de pensée francophones, et structures grammaticales clés). Ne dépasse jamais 8 erreurs afin de préserver l'impact pédagogique. Isole chaque faute individuellement (1 à 3 mots max).
2. CLARTÉ RADICALE DU "POURQUOI" :
   - Explique la règle en français limpide, SANS JARGON FLOU.
   - Si c'est un faux-ami (ex: actually ≠ actuellement, stage ≠ stage), indique obligatoirement le vrai sens du mot anglais et le mot qu'il fallait utiliser.
   - Explique le piège francophone (calque mot à mot) et ce que l'examinateur officiel IELTS sanctionne.
3. Version réécrite globale ("correctedText") : Donne une version intégralement réécrite et bonifiée en anglais fluide, élégant et de registre soutenu.

Donne UNIQUEMENT un objet JSON valide avec cette structure exacte (SANS AUCUN BLA BLA HORS DU JSON):
{
  "score": 6.5,
  "overallComment": "Commentaire global en français bienveillant et stimulant sur le niveau, les forces et les axes de progression majeurs",
  "grammarFeedback": "Synthèse en français ciblée sur les structures grammaticales et temps des verbes",
  "vocabularyFeedback": "Synthèse en français sur la richesse lexicale, collocations et faux-amis",
  "structureFeedback": "Synthèse en français sur la logique discursive, connecteurs et paragraphes",
  "correctedText": "Full rewritten text in natural, flawless and academic English",
  "mistakes": [
    {
      "originalText": "le mot ou segment exact de 1 à 3 mots (ex: actually)",
      "correctedText": "la correction exacte en anglais (ex: currently)",
      "category": "Faux-ami & Vocabulaire",
      "why": "L'explication limpide en français du POURQUOI : sens réel du mot, règle de grammaire simple et contre-exemple clair",
      "examTrap": "Le piège pour francophones en français (calque/faux-ami) et ce que l'examinateur officiel IELTS sanctionne",
      "flashcard": {
        "front": "La question directe en français pour tester cette règle (ex: Comment dire 'actuellement' sans faire de faux-ami ?)",
        "back": "Currently (attention : 'actually' signifie 'en réalité / en fait')"
      }
    }
  ]
}

Texte: """${practiceWritingText}"""`,
        practiceWritingPrompt || "Sujet libre",
        { maxTokens: 6000, temperature: 0.3 }
      );
      const feedback = safeParseJSON(raw);
      if (feedback) {
        setPracticeWritingFeedback(feedback);
        setStats(prev => ({ ...prev, totalReviews: prev.totalReviews + 1 }));
        addProduction(practiceWritingText, "Writing", feedback?.score);
        awardXP(30, 10, "Essai corrigé ✍️");
      } else {
        showToast("Impossible d'analyser le retour du correcteur", "error");
      }
    } catch (e) {
      console.error("[submitWriting] Erreur correction écrit:", e);
      showToast("Erreur correction écrit" + (e?.message ? ` (${e.message.slice(0, 45)})` : ""), "error");
    }
    setPracticeWritingLoading(false);
  };

  const createNewDraft = () => {
    setPracticeWritingActiveId(null);
    setPracticeWritingText("");
    setPracticeWritingPrompt("");
    setPracticeWritingFeedback(null);
  };

  const loadDraft = (id) => {
    const draft = practiceWritingDrafts.find(d => d.id === id);
    if (draft) {
      setPracticeWritingActiveId(draft.id);
      setPracticeWritingText(draft.text || "");
      setPracticeWritingPrompt(draft.prompt || "");
      setPracticeWritingFeedback(draft.feedback || null);
      setIsReportExpanded(true);
      setIeltsActiveTab("overview");
      setWritingTabMode("editor");
      if (showToast) showToast("Essai et correction rechargés dans l'éditeur 📖", "info");
    }
  };

  const deleteDraft = (id, e) => {
    if (e) e.stopPropagation();
    const next = practiceWritingDrafts.filter(d => d.id !== id);
    setPracticeWritingDrafts(next);
    storage.set("nova_writing_drafts", next).catch(() => { });
    if (practiceWritingActiveId === id) {
      setPracticeWritingActiveId(null);
    }
    if (showToast) showToast("Essai supprimé de l'historique 🗑️", "info");
  };

  const importFlashcards = (mistakes, sourceTheme = "writing-lab", sourceName = "Writing Lab") => {
    if (!mistakes || mistakes.length === 0) return;
    const cards = mistakes.filter(m => m.flashcard && m.flashcard.front && m.flashcard.back).map(m => ({
      id: sourceTheme + "_" + crypto.randomUUID(),
      front: m.flashcard.front,
      back: m.flashcard.back,
      category: englishCategory,
      notes: `Extrait de ${sourceName} : ` + (m.why || m.examTrap || m.rule || ""),
      createdAt: new Date().toISOString(),
      theme: sourceTheme
    }));
    if (cards.length > 0) {
      setExpressions(prev => [...prev, ...cards]);
      if (showToast) showToast(`${cards.length} fiche(s) ajoutée(s) au MemoMaster !`, "success");
    }
  };

  const renderDetailedMistakes = (mistakes) => {
    if (!mistakes || !Array.isArray(mistakes) || mistakes.length === 0) return null;
    return (
      <div className="ev-mistakes-container">
        <div className="ev-mistakes-header">
          <div className="ev-mistakes-title">
            <span>🔍</span>
            <span>DIAGNOSTIC CIBLÉ DES FAUTES ({mistakes.length})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                const all = {};
                mistakes.forEach((_, i) => { all[i] = true; });
                setExpandedMistakeIdxs(all);
              }}
              className="ev-history-bulk-toggle"
              title="Déplier toutes les fautes"
            >
              Tout ouvrir
            </button>
            <button
              type="button"
              onClick={() => setExpandedMistakeIdxs({})}
              className="ev-history-bulk-toggle"
              title="Replier toutes les fautes"
            >
              Tout replier
            </button>
            <button
              type="button"
              onClick={() => importFlashcards(mistakes, "writing-lab", "Writing Lab")}
              className="ev-mistakes-bulk-flashcard-btn"
              title="Créer des fiches de révision pour toutes ces erreurs"
            >
              <Plus size={11} />
              <span>Tout ajouter en Flashcards</span>
            </button>
          </div>
        </div>

        <div className="ev-mistakes-list">
          {mistakes.map((m, mIdx) => {
            const isOpen = !!expandedMistakeIdxs[mIdx];
            return (
              <div key={mIdx} className={`ev-mistake-accordion-item ${isOpen ? "is-open" : "is-collapsed"}`}>
                <button
                  type="button"
                  className="ev-mistake-accordion-header"
                  onClick={() => toggleMistakeExpand(mIdx)}
                  title={isOpen ? "Replier cette explication" : "Déplier l'explication et la règle"}
                >
                  <div className="ev-mistake-diff-row">
                    <span className="ev-mistake-idx">#{mIdx + 1}</span>
                    <span className="ev-mistake-bad"><del>{m.originalText}</del></span>
                    <span className="ev-mistake-arrow">➔</span>
                    <span className="ev-mistake-good">{m.correctedText}</span>
                    {m.category && <span className="ev-mistake-badge">{m.category}</span>}
                  </div>
                  <div className="ev-mistake-header-right">
                    <span className="ev-mistake-header-hint">{isOpen ? "Masquer" : "Pourquoi ?"}</span>
                    <span className={`ev-mistake-chevron ${isOpen ? "is-open" : ""}`}>
                      <ChevronDown size={14} />
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="ev-mistake-detail-body">
                    {(m.why || m.rule) && (
                      <div className="ev-mistake-why-box">
                        <span className="ev-mistake-label">💡 Pourquoi c&apos;est faux &amp; la règle :</span>
                        <span className="ev-mistake-desc">{m.why || m.rule}</span>
                      </div>
                    )}

                    {m.examTrap && (
                      <div className="ev-mistake-trap-box">
                        <span className="ev-mistake-label">⚠️ Piège francophone &amp; Rigueur examen :</span>
                        <span className="ev-mistake-desc">{m.examTrap}</span>
                      </div>
                    )}

                    {m.flashcard && (
                      <div className="ev-mistake-footer">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            importFlashcards([m], "writing-lab", "Writing Lab");
                          }}
                          className="ev-mistake-card-btn"
                          title="Mémoriser cette règle dans MemoMaster"
                        >
                          <Plus size={11} /> Mémoriser la règle (FSRS)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };


  const renderInlineTextWithMistakes = () => {
    if (!practiceWritingFeedback?.mistakes || practiceWritingFeedback.mistakes.length === 0) {
      return <div style={{ color: theme.text, fontSize: 16, lineHeight: 2.2 }}>{practiceWritingText || (practiceWritingFeedback.correctedText)}</div>;
    }

    let result = [];
    let currentIndex = 0;
    const text = practiceWritingText;

    // Trier les erreurs par leur apparition dans le texte (approximation)
    const mistakes = [...practiceWritingFeedback.mistakes].filter(m => m.originalText && text.includes(m.originalText));
    mistakes.sort((a, b) => text.indexOf(a.originalText) - text.indexOf(b.originalText));

    mistakes.forEach((m, idx) => {
      const pos = text.indexOf(m.originalText, currentIndex);
      if (pos === -1 || pos < currentIndex) return; // Sécurité si superposition complexe

      // Ajouter le texte avant l'erreur
      if (pos > currentIndex) {
        result.push(<span key={"text_" + idx}>{text.slice(currentIndex, pos)}</span>);
      }

      // Ajouter l'erreur interactive
      result.push(
        <span key={"mistake_" + idx} style={{ position: "relative", display: "inline" }} className="mistake-group">
          <span style={{
            textDecoration: "underline dashed #EF4444",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            cursor: "pointer",
            borderRadius: 4,
            padding: "2px 0",
            WebkitBoxDecorationBreak: "clone",
            boxDecorationBreak: "clone"
          }}>
            {m.originalText}
          </span>
          <div className="mistake-tooltip" style={{
            position: "absolute",
            bottom: "calc(100% + 5px)", left: "0", transform: "translateX(-16px)",
            background: "var(--mm-bg-elev)",
            border: `1px solid ${theme.border}`,
            padding: "16px",
            borderRadius: 12,
            width: "max-content",
            maxWidth: "min(300px, 80vw)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            zIndex: 50,
            pointerEvents: "none",
            display: "none",
            flexDirection: "column",
            gap: 8,
            whiteSpace: "normal"
          }}>
            <div style={{ color: "#10B981", fontWeight: "900", fontSize: 15, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span>✨</span>
              <span>{m.correctedText}</span>
            </div>
            <div style={{ color: theme.text, fontSize: 13, lineHeight: 1.5, opacity: 0.9 }}>{m.rule}</div>
          </div>
        </span>
      );
      currentIndex = pos + m.originalText.length;
    });

    // Reste du texte
    if (currentIndex < text.length) {
      result.push(<span key="text_end">{text.slice(currentIndex)}</span>);
    }

    return (
      <div style={{ color: theme.text, fontSize: 16, lineHeight: 2.2, whiteSpace: "pre-wrap" }}>
        {result}
        <style>{`
          .mistake-group:hover .mistake-tooltip { display: flex !important; }
        `}</style>
      </div>
    );
  };
  const renderDictationMistakes = () => {
    if (!practiceDictationFeedback?.mistakes || practiceDictationFeedback.mistakes.length === 0) {
      return <div style={{ color: theme.text, fontSize: 16, lineHeight: 2.2 }}>{practiceDictationInputs.join(" ")}</div>;
    }

    const speakFrenchText = (txt) => {
      if (!txt) return;
      liveKitVoiceBus.interrupt();
      liveKitVoiceBus.say(txt);
    };

    let result = [];
    let currentIndex = 0;
    const text = practiceDictationInputs.join(" ");

    const mistakes = [...practiceDictationFeedback.mistakes].filter(m => m.originalText && text.includes(m.originalText));
    mistakes.sort((a, b) => text.indexOf(a.originalText) - text.indexOf(b.originalText));

    mistakes.forEach((m, idx) => {
      const pos = text.indexOf(m.originalText, currentIndex);
      if (pos === -1 || pos < currentIndex) return;

      if (pos > currentIndex) {
        result.push(<span key={"text_" + idx}>{text.slice(currentIndex, pos)}</span>);
      }

      result.push(
        <span key={"mistake_" + idx} style={{ position: "relative", display: "inline" }} className="mistake-group">
          <span style={{ textDecoration: "underline dashed #EF4444", backgroundColor: "rgba(239, 68, 68, 0.15)", cursor: "pointer", borderRadius: 4, padding: "2px 0", WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }}>{m.originalText}</span>
          <div className="mistake-tooltip" style={{ position: "absolute", bottom: "calc(100% + 5px)", left: "0", transform: "translateX(-16px)", background: "var(--mm-bg-elev)", border: `1px solid ${theme.border}`, padding: "16px", borderRadius: 12, width: "max-content", maxWidth: "min(300px, 80vw)", boxShadow: "0 20px 40px rgba(0,0,0,0.4)", zIndex: 50, pointerEvents: "auto", display: "none", flexDirection: "column", gap: 8, whiteSpace: "normal" }}>
            <div style={{ color: "#10B981", fontWeight: "900", fontSize: 15, display: "flex", gap: 8, alignItems: "flex-start" }}><span>✨</span><span>{m.correctedText}</span></div>
            <div style={{ color: theme.text, fontSize: 13, lineHeight: 1.5, opacity: 0.9 }}>{m.rule}</div>
            {m.oralFeedback && (
              <button
                onClick={(e) => { e.stopPropagation(); speakFrenchText(m.oralFeedback); }}
                style={{ marginTop: 4, background: "var(--mm-primary)", color: "white", border: "none", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, width: "fit-content" }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
              >
                🔊 Écouter l'explication
              </button>
            )}
          </div>
        </span>
      );
      currentIndex = pos + m.originalText.length;
    });

    if (currentIndex < text.length) { result.push(<span key="text_end">{text.slice(currentIndex)}</span>); }

    return (
      <div style={{ color: theme.text, fontSize: 16, lineHeight: 2.2, whiteSpace: "pre-wrap", background: "var(--mm-bg-elev)", padding: 20, borderRadius: 16, border: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 12, fontWeight: "bold", color: "var(--mm-fg-muted)", marginBottom: 8 }}>TON TEXTE CORRIGÉ :</div>
        {result}
        <style>{` .mistake-group:hover .mistake-tooltip { display: flex !important; } `}</style>
      </div>
    );
  };

  // Speaking Lab
  const startSpeakingAnalysis = async (audioBlob) => {
    setPracticeSpeakingLoading(true);
    try {
      // 1. Transcription via Groq Whisper
      const transcript = await transcribeWithGroq(audioBlob);
      setPracticeSpeakingTranscript(transcript);

      // 2. Analyse phonétique mot par mot via Groq
      const analysisRaw = await callClaude(
        `Tu es un expert en phonétique anglaise. Analyse la prononciation d'un apprenant.
Phrase de référence: "${practiceSpeakingPrompt || '(libre, analyse le texte transcrit)'}"
Transcription obtenue par Whisper: "${transcript}"

Réponds UNIQUEMENT avec ce JSON valide, sans markdown ni backticks:
{
  "overallScore": <entier 0-100>,
  "accentProfile": "<ex: Accent West African, French influence, etc.>",
  "words": [
    {
      "word": "<mot tel que transcrit>",
      "expectedIpa": "<transcription IPA attendue>",
      "detectedIpa": "<IPA probable basé sur la transcription>",
      "score": <entier 0-100>,
      "issue": "<problème court, ex: th→d, schwa manquant, ou null si correct>",
      "tip": "<conseil bref en français, ou null si correct>"
    }
  ],
  "strongPoints": "<ce que l'apprenant fait bien>",
  "globalAdvice": "<conseil global en français, 1-2 phrases>"
}`,
        "Phonetics analysis"
      );
      const phonemeData = safeParseJSON(analysisRaw);
      setPracticePhonemeData(phonemeData);
      setPracticeSpeakingFeedback({ pronunciationScore: phonemeData.overallScore, advice: phonemeData.globalAdvice });
      setStats(prev => ({ ...prev, totalReviews: prev.totalReviews + 1 }));
    } catch (e) {
      showToast("Erreur analyse orale", "error");
    }
    setPracticeSpeakingLoading(false);
  };

  const startSpeakingRecording = async () => {
    stopSpeaking();
    const check = canRecord();
    if (!check.ok) { showToast("🎤 " + check.reason, "error"); return; }
    // Fermer tout contexte audio précédent avant d'en créer un nouveau
    if (speakingAudioCtxRef.current && speakingAudioCtxRef.current.state !== "closed") {
      await speakingAudioCtxRef.current.close();
      speakingAudioCtxRef.current = null;
    }
    cancelAnimationFrame(speakingAnimFrameRef.current);

    // Déclaré avant le try pour être accessible dans le catch (cleanup garanti)
    let audioCtx = null;
    let stream = null;
    const mimeType = getSupportedMimeType();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamsRef.current.add(stream);

      // ── Web Audio API pour capturer la waveform ────────────────────────────
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      speakingAudioCtxRef.current = audioCtx; // stocker dans le ref pour cleanup garanti
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      speakingAnalyserRef.current = analyser;
      speakingWaveformRef.current = [];
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // ── Ghost Waveform Sync (Le Shadowing Ultime) ────────────────────────
      const numBars = 60;
      const seed = practiceSpeakingPrompt.length || 42;
      const targetWaveform = Array.from({ length: numBars }, (_, i) => {
        const t = i / numBars * 10;
        // Enveloppe générée dynamiquement (pseudo-random via la longueur du prompt)
        const freq1 = 2.0 + (seed % 3);
        const freq2 = 3.5 + (seed % 2);
        let val = Math.sin(t * freq1) * Math.cos(t * freq2) * Math.sin(t * 0.8);
        return Math.max(0.1, Math.abs(val) * 0.7 + 0.15);
      });
      const userWaveformLive = new Array(numBars).fill(0);
      const startTime = Date.now();

      // Dessine en live sur le canvas ET stocke les peaks
      const drawLive = () => {
        if (!speakingAnalyserRef.current) return;
        speakingAnimFrameRef.current = requestAnimationFrame(drawLive);
        analyser.getByteTimeDomainData(dataArray);

        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const norm = (dataArray[i] / 128) - 1;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        const peak = Math.min(1, Math.max(0, rms * 8)); // amplify and clamp

        speakingWaveformRef.current.push(peak);

        const elapsed = Date.now() - startTime;
        const currentBar = Math.floor((elapsed / 10000) * numBars);
        if (currentBar >= 0 && currentBar < numBars) {
          userWaveformLive[currentBar] = Math.max(userWaveformLive[currentBar], peak);
        }

        // Canvas live
        const canvas = speakingCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const barWidth = (canvas.width / numBars) - 2;
          const centerY = canvas.height / 2;

          for (let i = 0; i < numBars; i++) {
            const x = i * (canvas.width / numBars) + 1;
            const ghostH = targetWaveform[i] * (canvas.height * 0.8);
            const userH = userWaveformLive[i] * (canvas.height * 0.8);

            // Draw Ghost Bar (La voix parfaite/native en bleu néon translucide)
            ctx.fillStyle = isDarkMode ? "rgba(139, 92, 246, 0.25)" : "rgba(139, 92, 246, 0.2)";
            ctx.shadowBlur = 0;
            ctx.fillRect(x, centerY - ghostH / 2, barWidth, Math.max(2, ghostH));

            // Draw User Bar (dessinée par-dessus)
            if (userH > 0) {
              const diff = Math.abs(targetWaveform[i] - userWaveformLive[i]);
              // Si superposition parfaite (rythme et amplitude), fusion en Or/Glow
              const isMatch = diff < 0.25 && targetWaveform[i] > 0.2 && userWaveformLive[i] > 0.2;

              if (isMatch) {
                ctx.fillStyle = "#F59E0B"; // Or
                ctx.shadowColor = "#FCD34D";
                ctx.shadowBlur = 10;
              } else {
                ctx.fillStyle = "var(--mm-primary)"; // Violet
                ctx.shadowColor = "var(--mm-primary-glow)";
                ctx.shadowBlur = 8;
              }

              ctx.fillRect(x, centerY - userH / 2, barWidth, Math.max(2, userH));
            }
          }

          // Draw Playhead
          if (currentBar < numBars) {
            const playheadX = currentBar * (canvas.width / numBars);
            ctx.fillStyle = isDarkMode ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.3)";
            ctx.shadowBlur = 0;
            ctx.fillRect(playheadX, 0, 2, canvas.height);
          }
        }
      };

      // ── Countdown ──────────────────────────────────────────────────────────
      setPracticeSpeakingCountdown(10);
      const countdownId = setInterval(() => {
        setPracticeSpeakingCountdown(prev => {
          if (prev <= 1) { clearInterval(countdownId); return 0; }
          return prev - 1;
        });
      }, 1000);

      setPracticeSpeakingIsRecording(true);
      setPracticePhonemeData(null);
      setPracticeWaveformBars([]);
      setPracticeSpeakingTranscript("");
      drawLive();

      // ── MediaRecorder ──────────────────────────────────────────────────────
      let mediaRecorder;
      try { mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
      catch { mediaRecorder = new MediaRecorder(stream); }
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        // Arrêter l'animation et fermer le contexte audio proprement
        cancelAnimationFrame(speakingAnimFrameRef.current);
        speakingAnalyserRef.current = null;
        clearInterval(countdownId);
        setPracticeSpeakingCountdown(10);
        if (speakingAudioCtxRef.current && speakingAudioCtxRef.current.state !== "closed") {
          await speakingAudioCtxRef.current.close();
          speakingAudioCtxRef.current = null;
        }
        stream.getTracks().forEach(t => t.stop());
        activeStreamsRef.current.delete(stream);

        // Réduction des samples → 60 barres pour l'affichage
        const raw = speakingWaveformRef.current;
        const step = Math.max(1, Math.floor(raw.length / 60));
        const bars = Array.from({ length: 60 }, (_, i) => {
          const slice = raw.slice(i * step, (i + 1) * step);
          return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
        });
        setPracticeWaveformBars(bars);
        setPracticeSpeakingIsRecording(false);

        const actualMime = mediaRecorder.mimeType || mimeType || "audio/mp4";
        const blob = new Blob(chunks, { type: actualMime });
        setPracticeSpeakingAudioBlob(blob);
        startSpeakingAnalysis(blob);
      };

      mediaRecorder.start();
      showToast("🎙️ Enregistrement en cours (10s)...");
      setTimeout(() => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 10000);
    } catch (e) {
      // Cleanup garanti même en cas d'erreur
      cancelAnimationFrame(speakingAnimFrameRef.current);
      speakingAnalyserRef.current = null;
      if (speakingAudioCtxRef.current && speakingAudioCtxRef.current.state !== "closed") {
        speakingAudioCtxRef.current.close();
        speakingAudioCtxRef.current = null;
      }
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        activeStreamsRef.current.delete(stream);
      }
      const msg = e?.name === "NotAllowedError" ? "Permission micro refusée. Autorise le micro dans les réglages."
        : e?.name === "NotFoundError" ? "Aucun micro détecté sur cet appareil."
          : e?.name === "SecurityError" ? "Micro bloqué : ouvre l'app en HTTPS."
            : `Micro non disponible : ${e?.message || e}`;
      showToast("🎤 " + msg, "error");
      setPracticeSpeakingIsRecording(false);
    }
  };

  // IELTS Simulation
  const startIeltsSimulation = async () => {
    // 🔑 MOBILE FIX (iOS Chrome / raccourci écran d'accueil) : ce bouton
    // appelait agent.start() directement, SANS armer l'audio/micro iOS dans
    // le geste utilisateur — contrairement à tous les autres déclencheurs de
    // l'agent LiveKit qui passent par <AgentVoiceBar> (lequel appelle
    // armIosAudio() en tout premier dans son onClick). Résultat : sur iOS
    // Chrome, le premier getUserMedia() du micro n'arrivait qu'après la
    // connexion WebRTC (via LiveKitMicWatchdog), donc HORS du user-gesture
    // initial → prompt micro jamais affiché ou requête refusée en silence.
    // L'agent pouvait donc parler (lecture audio) sans jamais entendre
    // l'utilisateur. Fix : armer l'audio/micro ICI, en tout premier, de façon
    // synchrone, exactement comme le fait AgentVoiceBar.
    armIosAudio();
    setPracticeIeltsHistory([]);
    setPracticeIeltsPart(1);
    setAgentTranscript([]);
    setAgentError("");
    // L'agent démarre directement en tant qu'examinateur IELTS Part 1
    agent.start(MODE_CONFIGS.ielts({ part: 1 }));
  };

  // FIX B1: faire progresser le test IELTS entre les Parties 1 → 2 → 3.
  // Heuristique: 4 échanges en Part 1, puis Part 2 (cue card), puis 3 échanges Part 3.
  const answerIelts = async (text) => {
    // Si l'agent vocal est actif, il gère la conversation — pas d'appel Claude
    if (customAgent.isConnected) return;
    const updatedHistory = [...practiceIeltsHistory, { role: "candidate", text }];
    setPracticeIeltsHistory(updatedHistory);

    // Compter les réponses du candidat dans la partie courante
    const candidateTurns = updatedHistory.filter(m => m.role === "candidate").length;
    let nextPart = practiceIeltsPart;
    let transitionInstruction = "";
    if (practiceIeltsPart === 1 && candidateTurns >= 4) {
      nextPart = 2;
      transitionInstruction = `\n\nIMPORTANT: La Partie 1 est terminée. Annonce maintenant la Partie 2 (long turn / cue card). Donne au candidat une cue card avec un sujet, 3 bullet points "You should say:" et précise qu'il a 1 minute pour préparer et 1-2 minutes pour parler.`;
    } else if (practiceIeltsPart === 2 && candidateTurns >= 5) {
      nextPart = 3;
      transitionInstruction = `\n\nIMPORTANT: La Partie 2 est terminée. Annonce maintenant la Partie 3 (discussion abstraite, 4-5 minutes). Pose la première question de discussion en lien avec le sujet de la Partie 2.`;
    } else if (practiceIeltsPart === 3 && candidateTurns >= 8) {
      // Fin du test — petite formule de clôture
      transitionInstruction = `\n\nIMPORTANT: Le test est presque terminé. Pose une dernière question de synthèse, puis termine par "Thank you. That is the end of the speaking test."`;
    }
    if (nextPart !== practiceIeltsPart) setPracticeIeltsPart(nextPart);

    try {
      const conversationContext = updatedHistory
        .map(m => `${m.role === "examiner" ? "Examiner" : "Candidate"}: ${m.text}`)
        .join("\n");

      const raw = await callClaude(
        `Tu es un examinateur IELTS Speaking. Tu mènes un vrai entretien IELTS en Partie ${nextPart}.
Voici la conversation jusqu'ici :
${conversationContext}

Continue l'entretien naturellement : pose une question de suivi ou passe à un nouveau sous-thème selon la Partie ${nextPart}.
Réponds UNIQUEMENT en anglais, comme un vrai examinateur IELTS (1-3 phrases max).${transitionInstruction}`,
        "IELTS examiner turn"
      );
      setPracticeIeltsHistory(prev => [...prev, { role: "examiner", text: raw.trim() }]);
    } catch (e) { showToast("Erreur IELTS", "error"); }
  };

  // ── XP / Coins / Streak ────────────────────────────────────────────────────
  const XP_LEVELS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 5800, 8000];
  const getLevelFromXP = (xp) => {
    let lvl = 0;
    for (let i = 0; i < XP_LEVELS.length; i++) { if (xp >= XP_LEVELS[i]) lvl = i; }
    return lvl;
  };
  const getLevelLabel = (lvl) => ["Novice", "Apprentice", "Explorer", "Conversant", "Fluent", "Advanced", "Expert", "Master", "Grand Master", "Legend", "GOD"][Math.min(lvl, 10)];

  // Date locale autonome — ne dépend pas de today() externe qui peut retourner UTC
  const localToday = () => {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  };

  // Valide qu'une chaîne est bien au format YYYY-MM-DD, retourne null sinon
  const parseLocalDate = (str) => {
    if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const d = new Date(str + "T00:00:00"); // forcer minuit local, pas UTC
    return isNaN(d.getTime()) ? null : d;
  };

  // Achievements
  const unlockAchievement = (id, label) => {
    if (!practiceAchievements.includes(id)) {
      const updated = [...practiceAchievements, id];
      setPracticeAchievements(updated);
      showToast(`🏆 Succès débloqué : ${label}`);
      storage.set("english_achievements", updated)?.catch?.(() => { });
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // VOCABULARY BRAIN MAP
  // ══════════════════════════════════════════════════════════════════════════════

  // Collect all user words from chat + writing + dictation
  const collectUserWords = () => {
    const sources = [
      ...practiceMessages.filter(m => m.role === "user").map(m => m.text),
      practiceWritingText,
      (Array.isArray(practiceDictationInputs) ? practiceDictationInputs.join(" ") : ""),
      ...practiceDebateHistory.filter(m => m.role === "user").map(m => m.text),
      ...practiceRoleplayHistory.filter(m => m.role === "user").map(m => m.text),
    ];
    const raw = sources.join(" ").toLowerCase();
    const stopWords = new Set(["i", "a", "an", "the", "is", "it", "to", "of", "and", "or", "in", "on", "at", "for", "with", "that", "this", "my", "me", "you", "we", "he", "she", "they", "was", "are", "be", "do", "did", "have", "has", "had", "not", "but", "so", "if", "as", "by", "up", "out", "go", "can", "will", "its", "been", "were", "from", "him", "her", "our", "your", "his", "their", "all", "get", "got", "just", "like", "what", "how", "when", "who", "some", "than", "then", "about", "said", "one", "two", "more", "no", "yes", "ok", "okay", "yeah", "oh", "well", "really", "very", "too", "also", "there", "would", "could", "should", "want", "need", "make", "made", "see", "know", "think", "come", "use", "way", "time", "day", "here", "which", "any", "other"]);
    const freq = {};
    raw.match(/\b[a-z]{4,}\b/g)?.forEach(w => {
      if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
    return freq;
  };

  const THEME_COLORS = {
    "Business": { bg: "var(--mm-primary-deep)", glow: "var(--mm-primary)", text: "color-mix(in srgb, var(--mm-primary) 22%, white)" },
    "Academic": { bg: "#064E3B", glow: "#10B981", text: "#A7F3D0" },
    "Daily Life": { bg: "#7C2D12", glow: "#F97316", text: "#FED7AA" },
    "Technology": { bg: "#312E81", glow: "var(--mm-primary)", text: "#E9D5FF" },
    "Nature": { bg: "#14532D", glow: "#22C55E", text: "#BBF7D0" },
    "Social": { bg: "#831843", glow: "#EC4899", text: "#FBCFE8" },
    "Other": { bg: "#1C1917", glow: "#A8A29E", text: "#D6D3D1" },
  };

  const buildBrainMap = async () => {
    setBrainMapLoading(true);
    setBrainMapSelected(null);
    const freq = collectUserWords();
    const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w, c]) => ({ word: w, count: c }));
    if (topWords.length === 0) { setBrainMapLoading(false); showToast("Pas encore assez de mots ! Pratique davantage 💬", "warning"); return; }

    try {
      const raw = await callClaude(
        `Tu es un expert en vocabulaire anglais. Analyse ces mots extraits des écrits d'un apprenant: ${topWords.map(w => w.word).join(", ")}.
Pour chaque mot, renvoie UNIQUEMENT ce JSON (sans markdown, sans backticks):
{"words":[{"word":"example","theme":"Business|Academic|Daily Life|Technology|Nature|Social|Other","level":"A1|A2|B1|B2|C1|C2","rarity":1}]}
rarity: 1=commun, 2=intermédiaire, 3=rare/avancé. Traite TOUS les ${topWords.length} mots.`,
        "Brain map analysis"
      );
      const parsed = safeParseJSON(raw);
      const analyzed = parsed.words || [];

      // Place words in circular clusters by theme
      const themes = {};
      analyzed.forEach(w => { (themes[w.theme] = themes[w.theme] || []).push(w); });
      const themeNames = Object.keys(themes);
      const CX = 400, CY = 300, ORBIT = 200;
      const placed = [];

      // Deterministic pseudo-random generator seeded by the word itself.
      // Same word → same seed → same position every time (spatial memory preserved).
      const seededRand = (seed) => {
        let h = 0;
        for (let i = 0; i < seed.length; i++) {
          h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
        }
        const r1 = ((h >>> 0) % 10000) / 10000;
        const r2 = (((h * 1664525 + 1013904223) >>> 0) % 10000) / 10000;
        return [r1, r2];
      };

      themeNames.forEach((theme, ti) => {
        const angle0 = (ti / themeNames.length) * 2 * Math.PI;
        themes[theme].forEach((w, wi) => {
          const spread = Math.min(60, 15 + themes[theme].length * 8);
          const wAngle = angle0 + ((wi - themes[theme].length / 2) / themes[theme].length) * 1.2;
          const [r1, r2] = seededRand(w.word);
          const wDist = 80 + r1 * spread;
          const countObj = topWords.find(t => t.word === w.word);
          placed.push({
            ...w,
            count: countObj?.count || 1,
            x: CX + Math.cos(wAngle) * (ORBIT + wDist * 0.5) + (r2 - 0.5) * 40,
            y: CY + Math.sin(wAngle) * (ORBIT + wDist * 0.5) + (r1 - 0.5) * 40,
          });
        });
      });

      // Filter out any malformed entries before saving — guards against partial
      // AI responses that produced incomplete word objects.
      const validPlaced = placed.filter(w =>
        w && typeof w.word === "string" &&
        typeof w.x === "number" && typeof w.y === "number" &&
        typeof w.theme === "string"
      );
      if (validPlaced.length === 0) {
        showToast("🗺️ Aucun mot valide généré, réessaie.", "warning");
        setBrainMapLoading(false);
        return;
      }
      setBrainMapWords(validPlaced);
      await storage.set("english_brainmap", validPlaced);
    } catch (e) {
      showToast("Erreur génération Brain Map", "error");
    }
    setBrainMapLoading(false);
  };

  // Load stored brain map on mount — validate structure before applying to avoid
  // a corrupted payload silently breaking the map render.
  useEffect(() => {
    storage.get("english_brainmap").then(saved => {
      if (!saved) return;
      const isValid =
        Array.isArray(saved) &&
        saved.every(w =>
          w && typeof w.word === "string" &&
          typeof w.x === "number" && typeof w.y === "number" &&
          typeof w.theme === "string"
        );
      if (isValid) {
        setBrainMapWords(saved);
      } else {
        // Wipe corrupted data so the user gets a clean empty state with the CTA
        storage.set("english_brainmap", [])?.catch?.(() => { });
        showToast("🗺️ Brain Map réinitialisée (données corrompues détectées).", "warning");
      }
    }).catch(() => {
      showToast("🗺️ Impossible de charger le Brain Map.", "warning");
    });
  }, []);

  const explainWord = async (wordObj) => {
    if (brainMapExplaining === wordObj.word) return;
    setBrainMapExplaining(wordObj.word);
    setBrainMapSelected({ word: wordObj.word, explanation: null, example: null, theme: wordObj.theme, level: wordObj.level, rarity: wordObj.rarity });
    try {
      const raw = await callClaude(
        `Tu es un coach d'anglais. Explique le mot "${wordObj.word}" à un étudiant de niveau ${practiceLevel}.
Réponds UNIQUEMENT en JSON: {"definition":"définition courte en français","example":"example sentence in English","synonyms":["syn1","syn2"],"tip":"conseil mémo en français"}`,
        `Explain: ${wordObj.word}`
      );
      const parsed = safeParseJSON(raw);
      setBrainMapSelected(prev => ({ ...prev, ...parsed }));
    } catch (e) {
      setBrainMapSelected(prev => ({ ...prev, definition: "Erreur de chargement", example: "" }));
    }
    setBrainMapExplaining(null);
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // AI ACCENT COACH
  // ══════════════════════════════════════════════════════════════════════════════

  const SOUND_PROFILES = {
    "th": {
      label: "TH — /θ/ et /ð/",
      emoji: "👅",
      color: "#EF4444",
      desc: "Le son le plus difficile pour les francophones. La langue touche les dents.",
      guide: [
        { step: "Position", detail: "Place le bout de ta langue entre tes dents supérieures et inférieures, légèrement sortie." },
        { step: "Souffle (θ)", detail: "Pour 'think', 'three', 'bath' : souffle de l'air sans vibration des cordes vocales." },
        { step: "Voix (ð)", detail: "Pour 'the', 'this', 'brother' : même position mais avec vibration (comme un Z de la langue)." },
        { step: "Erreur fréquente", detail: "Les francophones disent 'd' ou 'z' à la place. Ex: 'ze' au lieu de 'the', 'dink' au lieu de 'think'." },
      ],
      minPairs: [["think", "sink"], ["that", "dat"], ["three", "tree"], ["bath", "bat"], ["mother", "mudder"]],
    },
    "w": {
      label: "W — /w/",
      emoji: "💋",
      color: "var(--mm-primary)",
      desc: "Pas un 'ou' français. Les lèvres se projettent en avant comme pour un baiser.",
      guide: [
        { step: "Position", detail: "Arrondis les lèvres vers l'avant comme pour siffler, puis relâche en produisant le son." },
        { step: "Son", detail: "C'est un glide — une transition rapide vers la voyelle suivante. 'Water' = wô-ter." },
        { step: "Erreur fréquente", detail: "Les francophones remplacent par 'v' ou 'ou'. Ex: 'vine' au lieu de 'wine', 'ouit' au lieu de 'wit'." },
      ],
      minPairs: [["wine", "vine"], ["west", "vest"], ["wet", "vet"], ["wow", "vow"], ["worse", "verse"]],
    },
    "v_vs_b": {
      label: "V/B — /v/ vs /b/",
      emoji: "🦷",
      color: "var(--mm-primary)",
      desc: "Le V anglais nécessite les dents sur la lèvre inférieure. Le B est bilabial.",
      guide: [
        { step: "Position V", detail: "Les dents supérieures touchent légèrement la lèvre inférieure. Vibration des cordes." },
        { step: "Position B", detail: "Les deux lèvres se ferment puis explosent. Aucune dent impliquée." },
        { step: "Erreur fréquente", detail: "En wolof/français, V et B peuvent se confondre. 'Very' sonne 'Berry', 'vote' sonne 'bote'." },
      ],
      minPairs: [["very", "berry"], ["vest", "best"], ["vow", "bow"], ["van", "ban"], ["vote", "boat"]],
    },
    "h": {
      label: "H — /h/",
      emoji: "💨",
      color: "#10B981",
      desc: "Le H anglais est aspiré. Il n'existe pas en français comme son.",
      guide: [
        { step: "Production", detail: "Expire un souffle chaud d'air depuis la gorge avant la voyelle. Comme si tu soufflais sur tes mains pour les réchauffer." },
        { step: "Son", detail: "Pas de friction, juste de l'air. 'Hello' = hh-ello avec aspiration." },
        { step: "Erreur fréquente", detail: "Les francophones suppriment le H : 'ello' au lieu de 'hello', 'is' au lieu de 'his'." },
      ],
      minPairs: [["heat", "eat"], ["hill", "ill"], ["hair", "air"], ["have", "ave"], ["hold", "old"]],
    },
    "r": {
      label: "R américain — /ɹ/",
      emoji: "🌀",
      color: "#F59E0B",
      desc: "Le R américain est rétrofléchi — rien à voir avec le R français ou espagnol.",
      guide: [
        { step: "Position", detail: "La langue se recourbe vers l'arrière sans toucher le palais. Les lèvres s'arrondissent légèrement." },
        { step: "Son", detail: "Produit au milieu de la bouche. 'Red', 'right', 'world' — la langue remonte." },
        { step: "Erreur fréquente", detail: "Prononcer le R français ou rouler le R. 'Right' sonne 'Rriite' ou 'Liite'." },
      ],
      minPairs: [["right", "light"], ["read", "lead"], ["rice", "lice"], ["rain", "lane"], ["road", "load"]],
    },
    "short_vowels": {
      label: "Voyelles courtes /ɪ/ /æ/ /ʌ/",
      emoji: "🎵",
      color: "#EC4899",
      desc: "Les voyelles courtes anglaises n'existent pas en français et sont souvent aplaties.",
      guide: [
        { step: "/ɪ/ (bit, sit)", detail: "Plus court et relâché que le 'i' français. La bouche est mi-ouverte. Ne dis pas 'beet', dis 'bit'." },
        { step: "/æ/ (cat, bad)", detail: "Entre le 'a' et le 'é'. Mâchoire basse, lèvres étirées. Très ouvert." },
        { step: "/ʌ/ (cut, but)", detail: "Son central, neutre. Comme un 'eu' très court. 'Bus' n'est pas 'booss'." },
      ],
      minPairs: [["bit", "beat"], ["cat", "cut"], ["bad", "bed"], ["ship", "sheep"], ["cup", "cop"]],
    },
  };

  const generateAccentPhrase = async (sound = accentSoundFocus) => {
    setAccentLoading(true);
    setAccentFeedback(null);
    setXrayRevealed({});
    const profile = SOUND_PROFILES[sound];
    try {
      const raw = await callClaude(
        `Tu es un phonéticien expert. Génère une phrase en anglais pour entraîner le son "${profile.label}" pour un francophone.
Critères : 3-10 mots, naturelle, contient PLUSIEURS occurrences du son cible, niveau ${practiceLevel}.
Réponds UNIQUEMENT en JSON (pas de markdown) :
{"text":"The weather is rather breezy today","targetSounds":["weather","rather","breezy"],"tip":"Rappel : place la langue entre les dents pour chaque 'th'","difficulty":"B1"}`,
        `Accent training phrase for ${sound}`
      );
      const parsed = safeParseJSON(raw);
      setAccentPhrase({ ...parsed, sound });
    } catch (e) {
      showToast("Erreur génération phrase", "error");
    }
    setAccentLoading(false);
  };

  const startAccentRecording = async () => {
    stopSpeaking();
    const check = canRecord();
    if (!check.ok) { showToast("🎤 " + check.reason, "error"); return; }
    try {
      setXrayRevealed({});
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamsRef.current.add(stream);
      const mimeType = getSupportedMimeType();
      let recorder;
      try { recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
      catch { recorder = new MediaRecorder(stream); }
      accentRecorderRef.current = recorder;
      accentChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data?.size > 0) accentChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        activeStreamsRef.current.delete(stream);
        setAccentRecording(false);
        if (!accentChunksRef.current.length) { showToast("⚠️ Aucun son capté", "warning"); return; }
        const actualMime = recorder.mimeType || mimeType || "audio/mp4";
        const blob = new Blob(accentChunksRef.current, { type: actualMime });
        await analyzeAccent(blob);
      };
      recorder.start();
      setAccentRecording(true);
      showToast("🎤 Parle maintenant… (5s max)");
      setTimeout(() => { if (accentRecorderRef.current?.state === "recording") accentRecorderRef.current.stop(); }, 5000);
    } catch (e) {
      const msg = e?.name === "NotAllowedError" ? "Permission micro refusée." : e?.name === "NotFoundError" ? "Aucun micro détecté." : `Erreur : ${e?.message || e}`;
      showToast("🎤 " + msg, "error");
    }
  };

  const stopAccentRecording = () => {
    if (accentRecorderRef.current?.state === "recording") accentRecorderRef.current.stop();
  };

  const analyzeAccent = async (audioBlob) => {
    setAccentAnalyzing(true);
    try {
      // Step 1: transcribe
      const transcript = await transcribeWithGroq(audioBlob);

      // Step 2: phonetic analysis focused on the target sound
      const profile = SOUND_PROFILES[accentPhrase?.sound || accentSoundFocus];

      const raw = await callClaude(
        `Tu es un coach de phonétique anglaise spécialisé pour les francophones.
Phrase cible : "${accentPhrase?.text || ''}"
Transcription obtenue : "${transcript}"
Son entraîné : ${profile.label}

Analyse la transcription et fournis un feedback ULTRA-PRÉCIS sur la prononciation, en particulier pour le son ${profile.label}.
Réponds UNIQUEMENT en JSON valide (sans markdown) :
{
  "overallScore": 72,
  "transcript": "${transcript}",
  "issues": [
    {
      "sound": "th dans 'weather'",
      "heard": "d",
      "expected": "θ (th sourd)",
      "severity": "high|medium|low",
      "fix": "Place le bout de ta langue entre tes dents. Souffle de l'air sans vibrer les cordes vocales.",
      "demo": "Essaie : 'thhhhh' puis enchaine avec 'weather'"
    }
  ],
  "praise": "Ton intonation générale est bonne, le rythme est naturel.",
  "nextTip": "Exercice : répète 'the, the, the' 10 fois en exagérant la position de la langue.",
  "accentDetected": "Accent francophone / West African"
}`,
        "Analyse accent phonétique"
      );
      const feedback = safeParseJSON(raw);
      setAccentFeedback(feedback);

      // Save to history
      const entry = {
        phrase: accentPhrase?.text,
        sound: accentPhrase?.sound,
        score: feedback.overallScore,
        date: localToday(),
        transcript: feedback.transcript,
      };
      const newHistory = [entry, ...accentHistory].slice(0, 20);
      setAccentHistory(newHistory);
      await storage.set("english_accent_history", newHistory);

      if (feedback.overallScore >= 85) awardXP(40, 12, "Prononciation excellente 🎤");
      else if (feedback.overallScore >= 60) awardXP(20, 6, "Bon effort d'accent");
      else awardXP(10, 2, "Accent entraîné");

    } catch (e) {
      console.error("Accent analysis error:", e);
      showToast("Erreur analyse accent", "error");
    }
    setAccentAnalyzing(false);
  };

  // Load accent history on mount
  useEffect(() => {
    storage.get("english_accent_history").then(h => { if (h) setAccentHistory(h); }).catch(() => { });
  }, []);

  // ══════════════════════════════════════════════════════════════════════════════
  // ENGLISH NOTEBOOK — Génération de fiches depuis les notes
  // ══════════════════════════════════════════════════════════════════════════════
  const generateNotebookCards = async () => {
    if (!notebookText.trim()) { showToast("✏️ Écris d'abord ce que tu as appris !", "warning"); return; }
    setNotebookLoading(true);
    setNotebookCards([]);
    setNotebookSaved(false);
    try {
      const typeHint = {
        auto: "Détecte automatiquement le type de contenu",
        vocab: "Vocabulaire : mot/définition/exemple d'usage",
        grammar: "Règles de grammaire : règle/explication/exemples",
        idioms: "Expressions idiomatiques : expression/sens/contexte",
        phrases: "Phrases utiles : phrase/traduction/quand l'utiliser",
      }[notebookType];

      const cleanedNotebook = cleanSpeechTranscript(notebookText) || notebookText;

      const raw = await callClaude(
        `Tu es un expert en création de fiches de révision anglais pour francophones.
${typeHint}.
Génère entre 0 et 10 fiches de révision à partir du texte ci-dessous.
Réponds UNIQUEMENT en JSON valide (sans markdown, sans commentaire) :
[
  {
    "front": "Question ou terme en anglais",
    "back": "Réponse, définition ou traduction claire en français",
    "example": "Exemple de phrase en anglais avec le terme",
    "tag": "vocab|grammar|idiom|phrase"
  }
]
Règles :
- front : concis, en anglais (mot, règle, expression)
- back : en français, clair, avec nuances si besoin
- example : toujours en anglais, naturel, utile
- Ne duplique pas les fiches
- Maximum 10 fiches, pertinentes uniquement
- Si aucun contenu mémorisable n'est présent, renvoie un tableau vide [].

${SPEECH_HYGIENE_PROMPT}`,
        cleanedNotebook
      );

      const cards = safeParseJSON(raw);
      if (!Array.isArray(cards) || cards.length === 0) throw new Error("Réponse vide");
      setNotebookCards(cards);
      awardXP(15 + cards.length * 3, cards.length, `📓 ${cards.length} fiches générées`);
    } catch (e) {
      console.error("Notebook generation error:", e);
      showToast("❌ Erreur lors de la génération. Réessaie !", "error");
    }
    setNotebookLoading(false);
  };

  const saveNotebookCards = async () => {
    if (!notebookCards.length) return;
    setNotebookSaving(true);
    try {
      const newCards = notebookCards.map(c => ({
        id: crypto.randomUUID(),
        front: c.front || "",
        back: c.back || "",
        example: c.example || "",
        category: notebookCategory,
        level: 0,
        nextReview: localToday(),
        createdAt: localToday(),
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0,
        reviewHistory: [],
        imageUrl: null,
      }));
      // ✅ FIX : la persistence est gérée nativement par setExpressions (WatermelonDB)
      let allCards = [];
      setExpressions(prev => {
        allCards = [...newCards, ...(prev || [])];
        return allCards;
      });
      // Petit microtask pour laisser React commit avant la persistance
      await Promise.resolve();

      const entry = { date: localToday(), preview: notebookText.slice(0, 80), count: newCards.length };
      const newHistory = [entry, ...notebookHistory].slice(0, 20);
      setNotebookHistory(newHistory);
      await storage.set("english_notebook_history", newHistory);

      setNotebookSaved(true);
      setNotebookCards([]);
      setNotebookText("");
      showToast(`✅ ${newCards.length} fiche${newCards.length > 1 ? "s" : ""} ajoutée${newCards.length > 1 ? "s" : ""} à MemoMaster !`, "success");
    } catch (e) {
      console.error("Save error:", e);
      showToast("❌ Erreur sauvegarde", "error");
    }
    setNotebookSaving(false);
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDU
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      animation: "fadeUp 0.4s ease",
      paddingBottom: practiceSubView === "chat"
        ? 0
        : "calc(140px + env(safe-area-inset-bottom, 24px))"
    }}>


      <style>{`
        @media (max-width: 768px) {
          .academy-header { padding: 20px !important; border-radius: 20px !important; }
          .academy-header h1 { font-size: 24px !important; }
          .tabs-scroll { padding-bottom: 8px !important; }
          .chat-send-btn { width: 44px !important; height: 44px !important; }
          .chat-cockpit-cluster { padding: 14px !important; gap: 10px !important; }
          .chat-cockpit-cluster > div, .chat-cockpit-cluster > button { min-width: 100% !important; width: 100% !important; }
          [data-chat-bubble] { max-width: 92% !important; word-break: break-word !important; }
          .mobile-grid-1 { grid-template-columns: 1fr !important; }
          .mobile-stack { flex-direction: column !important; align-items: stretch !important; }
          .mobile-stack > * { width: 100% !important; margin-left: 0 !important; }
          .brainmap-panel { width: 100% !important; flex: none !important; }
        }
      `}</style>
      <style>{`
        @keyframes ink-strike { 0% { width: 0; } 100% { width: 100%; } }
        @keyframes ink-pop { 0% { opacity: 0; transform: translateY(10px) scale(0.8); } 70% { transform: translateY(-2px) scale(1.1); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes realityDistortHeader { 0%, 100% { filter: hue-rotate(0deg) contrast(100%); } 50% { filter: hue-rotate(15deg) contrast(110%); } }
        @keyframes pulseAstral { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.05); opacity: 1; } }
        .magic-ink-text del { color: #EF4444; text-decoration: none; position: relative; display: inline-block; opacity: 0.8; }
        .magic-ink-text del::after { content: ''; position: absolute; left: 0; top: 55%; height: 2px; background: #EF4444; animation: ink-strike 0.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards; box-shadow: 0 0 4px rgba(239, 68, 68, 0.4); }
        .magic-ink-text ins { color: #10B981; text-decoration: none; font-weight: 800; display: inline-block; margin: 0 4px; animation: ink-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; position: relative; top: -6px; font-size: 0.9em; text-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }
      `}</style>
      {/* ══ HEADER (Fond Blanc Pur en Light Mode - Format Compact Réduit de Moitié) ══ */}
      <div style={{
        background: isDarkMode
          ? "radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.2), transparent 70%), radial-gradient(circle at 90% 80%, rgba(99, 102, 241, 0.15), transparent 70%), var(--mm-bg-elev, #0b0d1e)"
          : "#FFFFFF",
        borderRadius: 18, padding: "10px 18px", marginBottom: 12, position: "relative", overflow: "hidden",
        boxShadow: isDarkMode ? "0 10px 24px rgba(0,0,0,0.35)" : "0 2px 12px rgba(0, 0, 0, 0.03)",
        border: `1px solid ${isDarkMode ? "rgba(59, 130, 246, 0.25)" : "rgba(15, 23, 42, 0.07)"}`,
      }} className="section-header academy-header ep-hero-card">

        {/* Effet lumineux de fond Astral (Dark Mode uniquement pour préserver le fond blanc pur en Light Mode) */}
        {isDarkMode && (
          <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, background: "radial-gradient(circle, rgba(37, 99, 235, 0.18) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none", animation: "pulseAstral 4s infinite" }} />
        )}
        <div style={{ position: "absolute", top: -20, left: -20, fontSize: 160, opacity: isDarkMode ? 0.04 : 0.02, pointerEvents: "none" }}>🇬🇧</div>

        {/* ── LIGNE DU HAUT : Titre & HUD RPG (Pliable / Compactable) ── */}
        {(() => {
          const xp = practiceStats.xp || 0;
          const coins = practiceStats.coins || 0;
          const streak = practiceStats.streak || 0;
          const XP_LVLS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 5800, 8000];
          const getLvl = (x) => { let l = 0; for (let i = 0; i < XP_LVLS.length; i++) { if (x >= XP_LVLS[i]) l = i; } return l; };
          const getLbl = (l) => ["Novice", "Apprentice", "Explorer", "Conversant", "Fluent", "Advanced", "Expert", "Master", "Grand Master", "Legend", "GOD"][Math.min(l, 10)];
          const lvl = getLvl(xp);
          const nextXP = XP_LVLS[Math.min(lvl + 1, XP_LVLS.length - 1)];
          const prevXP = XP_LVLS[lvl];
          const pct = lvl >= 10 ? 100 : Math.round(((xp - prevXP) / (nextXP - prevXP)) * 100);

          if (isHudCollapsed) {
            return (
              <div
                className="ev-hud-collapsed-strip"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 10,
                  padding: "6px 14px",
                  borderRadius: 12,
                  background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "rgba(255, 255, 255, 0.9)",
                  border: `1px solid ${isDarkMode ? "rgba(59, 130, 246, 0.25)" : "rgba(59, 130, 246, 0.18)"}`,
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                }}
                onClick={() => setIsHudCollapsed(false)}
                title="Cliquer pour déplier l'en-tête et les statistiques complètes"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: isDarkMode ? "#F8FAFC" : "#0F172A" }}>
                    🇬🇧 {practiceImmersionMode ? "Full Immersion" : "Practice Room"}
                  </span>
                  <span style={{
                    background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                    padding: "2px 8px", borderRadius: 8,
                    fontSize: 11, fontWeight: 900, color: "white"
                  }}>
                    Lv.{lvl} {getLbl(lvl)}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? "#60A5FA" : "#2563EB" }}>
                    {xp.toLocaleString()} XP
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12 }}>🔥</span>
                    <span style={{ fontWeight: 800, fontSize: 11.5, color: streak > 0 ? "#F59E0B" : theme?.textMuted || "#64748b" }}>{streak}j</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12 }}>🪙</span>
                    <span style={{ fontWeight: 800, fontSize: 11.5, color: isDarkMode ? "#FCD34D" : "#D97706" }}>{coins.toLocaleString()}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsHudCollapsed(false); }}
                    style={{
                      background: "rgba(37, 99, 235, 0.1)",
                      border: "none",
                      borderRadius: 6,
                      padding: "3px 8px",
                      color: isDarkMode ? "#93C5FD" : "#2563EB",
                      fontSize: 10.5,
                      fontWeight: 800,
                      cursor: "pointer"
                    }}
                  >
                    Déplier ▼
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 10, position: "relative", zIndex: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: isDarkMode ? "#60A5FA" : "#2563EB", letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>
                    ⚡ AI English Training Center
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsHudCollapsed(true)}
                    style={{
                      background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                      border: "1px solid var(--mm-border, rgba(0,0,0,0.08))",
                      borderRadius: 6,
                      padding: "1px 6px",
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: "var(--mm-fg-muted, #64748b)",
                      cursor: "pointer"
                    }}
                    title="Réduire l'en-tête pour avoir plus d'espace"
                  >
                    ▲ Réduire
                  </button>
                </div>
                <h1 style={{ fontSize: 18, fontWeight: 900, color: isDarkMode ? "#F8FAFC" : "#0F172A", margin: 0, letterSpacing: "-0.3px", lineHeight: 1.2 }}>
                  {practiceImmersionMode ? "Full Immersion 🇬🇧" : "Practice Room 🇬🇧"}
                </h1>
              </div>

              {/* PLAYER STATUS BAR (HUD COMPACT RÉDUIT DE MOITIÉ) */}
              <div style={{
                background: isDarkMode ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.88)",
                border: `1px solid ${isDarkMode ? "rgba(59, 130, 246, 0.25)" : "rgba(59, 130, 246, 0.18)"}`,
                borderRadius: 14, padding: "6px 12px", display: "flex", flexDirection: "column", gap: 5,
                backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", minWidth: 240,
                boxShadow: isDarkMode ? "0 6px 16px rgba(0,0,0,0.25)" : "0 2px 10px rgba(37, 99, 235, 0.06)"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", padding: "2px 8px", borderRadius: 8, fontWeight: 900, fontSize: 11, color: "white" }}>
                      Lv.{lvl} {getLbl(lvl)}
                    </div>
                    <div style={{ fontSize: 11.5, color: isDarkMode ? "#60A5FA" : "#1D4ED8", fontWeight: 700 }}>{xp.toLocaleString()} XP</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div title="Streak" style={{ display: "flex", alignItems: "center", gap: 3, background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(37, 99, 235, 0.05)", borderRadius: 6, padding: "2px 6px" }}>
                      <span style={{ fontSize: 12, animation: streak > 0 ? "pulse 1.5s infinite" : "none" }}>🔥</span>
                      <span style={{ fontWeight: 800, color: streak > 0 ? "#F59E0B" : theme?.textMuted || "#64748b", fontSize: 11.5 }}>{streak}j</span>
                    </div>
                    <div title="Coins" style={{ display: "flex", alignItems: "center", gap: 3, background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(37, 99, 235, 0.05)", borderRadius: 6, padding: "2px 6px" }}>
                      <span style={{ fontSize: 12 }}>🪙</span>
                      <span style={{ fontWeight: 800, color: isDarkMode ? "#FCD34D" : "#D97706", fontSize: 11.5 }}>{coins.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ height: 3, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(37, 99, 235, 0.1)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #2563EB, #60A5FA)", borderRadius: 2, transition: "width 0.8s ease" }} />
                  </div>
                </div>
                {/* XP popup toast intra-HUD */}
                {practiceXpPopup && (
                  <div style={{ position: "absolute", top: -12, right: 0, background: "linear-gradient(135deg,#059669,#10B981)", color: "white", borderRadius: 8, padding: "2px 8px", fontWeight: 900, fontSize: 10.5, animation: "fadeUp 0.3s ease forwards", pointerEvents: "none", zIndex: 100, boxShadow: "0 4px 10px rgba(16,185,129,0.3)" }}>
                    +{practiceXpPopup.xp} XP {practiceXpPopup.coins > 0 ? `• +${practiceXpPopup.coins} 🪙` : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── COMMAND DOCK : BARRE UNIQUE STICKY (toutes les vues) ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: isDarkMode ? "rgba(10, 17, 40, 0.85)" : "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          borderBottom: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          marginLeft: -36, marginRight: -36, paddingLeft: 36, paddingRight: 36,
          paddingTop: 12, paddingBottom: 12,
        }}>
          {/* ── Modes & Outils + New Session (sur la même ligne) ── */}
          <div className="ep-modes-header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", marginBottom: 8 }}>
            <button
              type="button"
              className="english-tabs-toggle ep-tabs-toggle"
              onClick={() => document.body.classList.toggle("english-tabs-expanded")}
              aria-label="Afficher / cacher les modes"
              style={{ display: "none", flex: 1, margin: 0, height: 42 }}
            >
              ☰ Modes & outils
            </button>
            {practiceSubView === "chat" && (
              <button
                type="button"
                onClick={resetPracticeChat}
                className="ep-new-session-btn hov"
                style={{
                  height: 42, padding: "0 16px",
                  background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))",
                  border: "1px solid var(--mm-primary-glow)", borderRadius: 14, color: "white",
                  fontWeight: 900, fontSize: 13, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  boxShadow: "0 4px 14px rgba(37, 99, 235, 0.25)",
                  whiteSpace: "nowrap", flexShrink: 0
                }}
              >
                <span>🔄</span> New Session
              </button>
            )}
          </div>
          <div className="ep-tabbar-row">
            <span className="ep-tabbar-label">Piliers</span>
            <div className="tabs-scroll english-tabs-cluster ep-tabbar" role="tablist" aria-label="Modes de pratique">
              {[
                { id: "chat", icon: "🎙️", label: "Live Nova", accent: "var(--mm-primary)" },
                { id: "reallife", icon: "🌍", label: "RealLife", accent: "#F97316" },
                { id: "wild", icon: "📺", label: "In The Wild", accent: "#F97316" },
                { id: "debate", icon: "⚖️", label: "Débat", accent: "#EAB308" },
                { id: "roleplay", icon: "🎭", label: "Roleplay", accent: "#D946EF" },
                { id: "writing", icon: "📝", label: "Écriture", accent: "#22C55E" },
                { id: "dictation", icon: "✍️", label: "Dictée", accent: "var(--mm-primary)" },
              ].map(tab => {
                const isActive = practiceSubView === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => switchSubView(tab.id)}
                    className={`ep-tab hov${isActive ? " is-active" : ""}`}
                    style={{ "--tab-accent": tab.accent }}
                  >
                    <span className="ep-tab-icon">{tab.icon}</span>
                    <span className="ep-tab-label">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>



      {/* ══ CHAT ══ */}
      {practiceSubView === "chat" && (
        <div
          onClick={markInteracted}
          onKeyDown={markInteracted}
          className="ep-glass-panel ep-live-nova-panel"
          style={{
            position: "relative",
            border: `1px solid ${isDarkMode ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.22)"}`,
            borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column",
            height: "clamp(440px, 70vh, 640px)",
            paddingBottom: 0,
            boxShadow: isDarkMode ? "0 16px 36px rgba(0,0,0,0.4)" : "0 10px 28px rgba(37,99,235,0.08)"
          }}
        >
          {/* ── CHAT TOP HEADER BAR (Statut + Historique + Profil) ── */}
          <div style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(37, 99, 235, 0.12)"}`,
            background: isDarkMode ? "rgba(15, 23, 42, 0.65)" : "rgba(241, 245, 249, 0.85)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            flexWrap: "wrap"
          }}>
            {/* Statut Nova */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ position: "relative", width: 9, height: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ position: "absolute", inset: -2, borderRadius: "50%", background: "#10B981", animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite", opacity: 0.6 }} />
                <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: isDarkMode ? "#93C5FD" : "#1E40AF", letterSpacing: "0.2px" }}>
                Coach NOVA
              </span>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: isDarkMode ? "rgba(37,99,235,0.2)" : "rgba(37,99,235,0.08)", color: isDarkMode ? "#93C5FD" : "#2563EB", fontWeight: 700 }}>
                En direct
              </span>
            </div>

            {/* Actions & Profil : STRICTEMENT SUR LA MÊME LIGNE */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", flexShrink: 0 }}>
              {/* Toggle Sous-titres ON / OFF */}
              <button
                type="button"
                onClick={() => {
                  setSubtitlesEnabled(prev => {
                    const next = !prev;
                    try { localStorage.setItem("nova_subtitles_enabled", String(next)); } catch { }
                    return next;
                  });
                }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: subtitlesEnabled
                    ? (isDarkMode ? "rgba(37,99,235,0.3)" : "rgba(37,99,235,0.14)")
                    : (isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"),
                  border: `1px solid ${subtitlesEnabled ? (isDarkMode ? "rgba(59,130,246,0.35)" : "rgba(59,130,246,0.25)") : "transparent"}`,
                  color: subtitlesEnabled ? (isDarkMode ? "#93C5FD" : "#1D4ED8") : theme.textMuted,
                  padding: "4px 8px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700,
                  whiteSpace: "nowrap",
                  transition: "all 0.2s ease"
                }}
                title="Activer ou désactiver les sous-titres en direct"
              >
                💬 Sous-titres : <span style={{ fontWeight: 900 }}>{subtitlesEnabled ? "ON" : "OFF"}</span>
              </button>

              <button
                onClick={() => setChatShowHistory(p => !p)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: chatShowHistory
                    ? (isDarkMode ? "rgba(37,99,235,0.3)" : "rgba(37,99,235,0.14)")
                    : (isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.9)"),
                  border: `1px solid ${isDarkMode ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.2)"}`,
                  color: isDarkMode ? "#93C5FD" : "#1D4ED8",
                  padding: "4px 8px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700,
                  whiteSpace: "nowrap",
                  transition: "all 0.2s"
                }}
              >
                📜 {chatShowHistory ? "Masquer" : "Historique"}
              </button>

              <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                {studentName ? (
                  <button
                    title="Changer de nom"
                    onClick={() => {
                      const n = window.prompt("Quel est ton prénom ?", studentName);
                      if (n !== null) {
                        const trimmed = n.trim();
                        setStudentName(trimmed);
                        try { localStorage.setItem("nova_student_name", trimmed); } catch { }
                      }
                    }}
                    style={{
                      background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                      border: "none", color: "white", padding: "4px 10px", borderRadius: 16, cursor: "pointer",
                      fontSize: 11, fontWeight: 800, boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
                      whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis"
                    }}
                  >
                    👤 {studentName}
                  </button>
                ) : (
                  <button
                    title="Dis ton prénom à NOVA"
                    onClick={() => {
                      const n = window.prompt("Quel est ton prénom ? NOVA s'en souviendra 🎉");
                      if (n !== null) {
                        const trimmed = n.trim();
                        setStudentName(trimmed);
                        try { localStorage.setItem("nova_student_name", trimmed); } catch { }
                      }
                    }}
                    style={{
                      background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.9)",
                      border: `1px dashed ${isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(59,130,246,0.35)"}`,
                      color: isDarkMode ? theme.textMuted : "#1D4ED8",
                      padding: "4px 8px", borderRadius: 16, cursor: "pointer", fontSize: 11, fontWeight: 700,
                      whiteSpace: "nowrap"
                    }}
                  >
                    + Ton prénom
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── HUD RADAR LEXICAL — CIBLES ORALES DU JOUR (Niveau 100) ── */}
          <div className="ev-nova-daily-hud">
            <div className="ev-nova-hud-left">
              <button
                type="button"
                onClick={() => {
                  setNovaDailyTargetMode(prev => {
                    const next = prev === "daily" ? "free" : "daily";
                    try { localStorage.setItem("nova_daily_target_mode", next); } catch { }
                    return next;
                  });
                }}
                className={`ev-nova-hud-toggle-btn ${novaDailyTargetMode === "daily" ? "is-daily" : "is-free"}`}
                title={novaDailyTargetMode === "daily" ? "Clique pour basculer en conversation libre" : "Clique pour activer le focus fiches du jour"}
              >
                <span>{novaDailyTargetMode === "daily" ? "🎯 Focus du jour" : "☕ Mode libre"}</span>
                {novaDailyTargetMode === "daily" && dailyOralTargetsData.targets.length > 0 && (
                  <span style={{ opacity: 0.9, fontSize: 10, fontWeight: 900 }}>
                    ({spokenTargetIds.size}/{dailyOralTargetsData.targets.length})
                  </span>
                )}
              </button>
            </div>

            <div className="ev-nova-hud-chips">
              {novaDailyTargetMode === "daily" && dailyOralTargetsData.targets.length > 0 ? (
                dailyOralTargetsData.targets.map(target => {
                  const isSpoken = spokenTargetIds.has(target.id);
                  return (
                    <span
                      key={target.id}
                      className={`ev-nova-target-chip ${isSpoken ? "is-spoken" : ""}`}
                      title={target.back ? `${target.front} = ${target.back}` : target.front}
                    >
                      {isSpoken ? (
                        <span className="chip-check">✓</span>
                      ) : (
                        <span className="chip-dot" />
                      )}
                      <span>{target.front}</span>
                    </span>
                  );
                })
              ) : (
                <span style={{ fontSize: 11, color: isDarkMode ? "#94A3B8" : "#64748B", fontStyle: "italic" }}>
                  {novaDailyTargetMode === "free"
                    ? "Conversation libre — parle de n'importe quel sujet"
                    : "Aucune fiche cible — conversation ouverte"}
                </span>
              )}
            </div>
          </div>

          {/* ── Messages list ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {practiceMessages.length === 0 && !practiceLoading && !customAgent.isConnected && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
                <div style={{
                  width: 60, height: 60, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(37,99,235,0.18), transparent 70%)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, marginBottom: 12
                }}>
                  {novaDailyTargetMode === "daily" && dailyOralTargetsData.targets.length > 0 ? "🎯" : "✨"}
                </div>
                <h3 style={{ margin: "0 0 6px 0", color: theme.text, fontSize: 18, fontWeight: 800 }}>
                  {novaDailyTargetMode === "daily" && dailyOralTargetsData.targets.length > 0
                    ? (dailyOralTargetsData.totalReviewedToday > 0 ? "Prêt pour tes fiches du jour ?" : "Prêt à t'entraîner avec Nova ?")
                    : "Ready to chat?"}
                </h3>
                <p style={{ margin: "0 0 18px 0", color: theme.textMuted, fontSize: 13.5, textAlign: "center", maxWidth: 340, lineHeight: 1.5 }}>
                  {novaDailyTargetMode === "daily" && dailyOralTargetsData.targets.length > 0
                    ? `Nova lance un sujet immersif pour t'amener naturellement à placer tes ${dailyOralTargetsData.targets.length} expressions cibles.`
                    : "Démarre une conversation vivante avec NOVA, ton coach d’anglais interactif."}
                </p>
                <button
                  onClick={() => generateDynamicGreeting()}
                  style={{
                    background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                    color: "white", border: "none", padding: "12px 24px", borderRadius: 999, fontWeight: 800, fontSize: 14, cursor: "pointer",
                    boxShadow: "0 6px 20px rgba(37, 99, 235, 0.35)", transition: "transform 0.15s ease"
                  }}
                >
                  {novaDailyTargetMode === "daily" && dailyOralTargetsData.targets.length > 0 ? "🎙️ Lancer la mission du jour" : "Démarrer la discussion"}
                </button>
              </div>
            )}

            {/* Messages statiques (affichés hors connexion ou en attente de la 1ère parole LiveKit) */}
            {(!customAgent.isConnected || (subtitlesEnabled && liveKitTranscriptions.length === 0)) && (() => {
              const lastUser = [...practiceMessages].reverse().find(msg => msg.role === 'user');
              const lastAgent = [...practiceMessages].reverse().find(msg => msg.role !== 'user');
              const displayMessages = chatShowHistory
                ? practiceMessages
                : practiceMessages.filter(m => m === lastUser || m === lastAgent);
              return displayMessages.map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <div key={i} style={{ display: "flex", gap: 10, justifyContent: isUser ? "flex-end" : "flex-start", alignItems: "flex-end" }}>
                    {!isUser && (
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: "linear-gradient(135deg, #2563EB, #60A5FA)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, color: "white", boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)"
                      }}>
                        ✨
                      </div>
                    )}
                    <div
                      data-chat-bubble
                      className={isUser ? "ep-user-bubble" : "ep-coach-bubble"}
                      style={{
                        maxWidth: "82%",
                        background: isUser
                          ? "linear-gradient(135deg, #2563EB, #1D4ED8)"
                          : (isDarkMode ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.96)"),
                        color: isUser ? "#FFFFFF" : (isDarkMode ? "#F8FAFC" : "#0F172A"),
                        borderRadius: isUser ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                        border: isUser ? "none" : `1px solid ${isDarkMode ? "rgba(59, 130, 246, 0.25)" : "rgba(59, 130, 246, 0.2)"}`,
                        boxShadow: isUser ? "0 6px 18px rgba(37, 99, 235, 0.28)" : (isDarkMode ? "0 8px 24px rgba(0,0,0,0.3)" : "0 8px 24px rgba(37, 99, 235, 0.08)"),
                        padding: "14px 18px", fontSize: 14.5, lineHeight: 1.6
                      }}
                    >
                      {!isUser && (
                        <div style={{ fontSize: 11, fontWeight: 800, color: isDarkMode ? "#93C5FD" : "#2563EB", marginBottom: 4, letterSpacing: "0.4px" }}>
                          COACH NOVA
                        </div>
                      )}
                      <div>{msg.text}</div>
                      {msg.needsPlay && (
                        <button
                          onClick={() => { markInteracted(); speakText(msg.text, true); }}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            marginTop: 10, background: isUser ? "rgba(255,255,255,0.2)" : (isDarkMode ? "rgba(37,99,235,0.2)" : "rgba(37,99,235,0.1)"),
                            border: `1px solid ${isUser ? "rgba(255,255,255,0.3)" : "rgba(37,99,235,0.2)"}`,
                            borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                            color: isUser ? "white" : (isDarkMode ? "#93C5FD" : "#1D4ED8"), transition: "all 0.15s"
                          }}
                        >
                          🔊 Écouter
                        </button>
                      )}
                    </div>
                  </div>
                );
              });
            })()}

            {/* Transcriptions LiveKit en temps réel (si Sous-titres ON) */}
            {customAgent.isConnected && subtitlesEnabled && (() => {
              const lastLkUser = [...liveKitTranscriptions].reverse().find(msg => msg.role === "user");
              const lastLkAgent = [...liveKitTranscriptions].reverse().find(msg => msg.role === "agent");
              const displayLkMsgs = chatShowHistory
                ? liveKitTranscriptions
                : liveKitTranscriptions.filter(m => m === lastLkUser || m === lastLkAgent);

              return displayLkMsgs.map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <div key={msg.id || `lk-${i}`} style={{ display: "flex", gap: 10, justifyContent: isUser ? "flex-end" : "flex-start", alignItems: "flex-end", marginTop: 8 }}>
                    {!isUser && (
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: "linear-gradient(135deg, #2563EB, #60A5FA)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, color: "white", boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)"
                      }}>
                        ✨
                      </div>
                    )}
                    <div data-chat-bubble style={{
                      maxWidth: "82%", padding: "14px 18px",
                      borderRadius: isUser ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                      wordBreak: "break-word",
                      background: isUser
                        ? "linear-gradient(135deg, #2563EB, #1D4ED8)"
                        : (isDarkMode ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.96)"),
                      color: isUser ? "#FFFFFF" : (isDarkMode ? "#F8FAFC" : "#0F172A"),
                      fontSize: 14.5, lineHeight: 1.6, fontWeight: 500,
                      boxShadow: isUser ? "0 6px 18px rgba(37, 99, 235, 0.28)" : (isDarkMode ? "0 8px 24px rgba(0,0,0,0.3)" : "0 8px 24px rgba(37, 99, 235, 0.08)"),
                      border: isUser ? "none" : `1px solid ${isDarkMode ? "rgba(59, 130, 246, 0.25)" : "rgba(59, 130, 246, 0.2)"}`,
                      opacity: msg.isFinal ? 1 : 0.88,
                    }}>
                      {!isUser && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: isDarkMode ? "#93C5FD" : "#2563EB", letterSpacing: "0.4px" }}>
                            COACH NOVA
                          </span>
                          {!msg.isFinal && (
                            <span style={{ fontSize: 10, background: "rgba(37,99,235,0.15)", color: isDarkMode ? "#93C5FD" : "#2563EB", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                              en direct…
                            </span>
                          )}
                        </div>
                      )}
                      <div>
                        {msg.text}
                        {!msg.isFinal && <span style={{ display: "inline-block", marginLeft: 4, animation: "pulse 1s infinite", color: "#2563EB" }}>●</span>}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}

            {practiceLoading && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #2563EB, #60A5FA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "white" }}>
                  ✨
                </div>
                <div style={{ padding: "12px 18px", borderRadius: "18px 18px 18px 4px", background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.95)", border: `1px solid rgba(59, 130, 246, 0.2)`, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2563EB", animation: "pulse 0.8s infinite" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2563EB", animation: "pulse 0.8s 0.2s infinite" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2563EB", animation: "pulse 0.8s 0.4s infinite" }} />
                </div>
              </div>
            )}

            {/* Mode Immersion Audio Pure (quand Sous-titres OFF pendant l'appel vocal) */}
            {customAgent.isConnected && !subtitlesEnabled && (
              <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", padding: "28px 16px", gap: 16,
                animation: "fadeIn 0.3s ease"
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(37,99,235,0.18), transparent 70%)",
                  border: "1px solid rgba(59,130,246,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
                  boxShadow: "0 8px 24px rgba(37,99,235,0.15)"
                }}>
                  🎧
                </div>

                {/* Ondes acoustiques animées */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, height: 28 }}>
                  {[0.4, 0.8, 1.2, 0.6, 0.9, 0.5, 0.7].map((delay, idx) => (
                    <span
                      key={idx}
                      style={{
                        width: 4, height: 24, borderRadius: 2,
                        background: "linear-gradient(180deg, #2563EB, #60A5FA)",
                        animation: customAgent.isSpeaking ? `mm-pulse 1s infinite ${delay * 0.2}s` : "none",
                        opacity: customAgent.isSpeaking ? 1 : 0.4
                      }}
                    />
                  ))}
                </div>

                <div style={{ textAlign: "center", maxWidth: 320 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 4 }}>
                    Immersion Audio Pure
                  </div>
                  <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>
                    {customAgent.isSpeaking ? "Écoute attentivement la voix de NOVA..." : "Parle librement dans ton micro..."}
                  </div>
                </div>

                {/* Bouton de secours pour réactiver les sous-titres en 1 clic */}
                <button
                  type="button"
                  onClick={() => {
                    setSubtitlesEnabled(true);
                    try { localStorage.setItem("nova_subtitles_enabled", "true"); } catch { }
                  }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: 12,
                    background: isDarkMode ? "rgba(37,99,235,0.2)" : "rgba(37,99,235,0.1)",
                    border: "1px solid rgba(59,130,246,0.3)",
                    color: isDarkMode ? "#93C5FD" : "#1D4ED8",
                    fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  👁️ Révéler les sous-titres
                </button>
              </div>
            )}
            <div ref={practiceEndRef} />
          </div>

          {/* ── DOCK VOCAL COMPACT STYLE CHATGPT (Épuré & Ultra-gain d'espace) ── */}
          <div style={{
            padding: "10px 16px",
            borderTop: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(37, 99, 235, 0.12)"}`,
            background: isDarkMode
              ? "linear-gradient(180deg, rgba(15, 23, 42, 0.85) 0%, rgba(10, 15, 28, 0.98) 100%)"
              : "linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(241, 245, 249, 0.98) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: "auto",
            borderRadius: "0 0 24px 24px",
            position: "relative",
            zIndex: 10
          }}>
            {/* Statut de session / topic en direct */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <span style={{
                position: "relative", width: 8, height: 8, borderRadius: "50%",
                background: customAgent.isConnected ? "#10B981" : (isDarkMode ? "#60A5FA" : "#2563EB"),
                boxShadow: customAgent.isConnected ? "0 0 10px #10B981" : "none",
                flexShrink: 0
              }}>
                {customAgent.isConnected && (
                  <span style={{
                    position: "absolute", inset: -3, borderRadius: "50%",
                    border: "2px solid #10B981", animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite", opacity: 0.6
                  }} />
                )}
              </span>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{
                  fontSize: 13, fontWeight: 800,
                  color: customAgent.isConnected
                    ? (customAgent.isSpeaking ? "#10B981" : (isDarkMode ? "#93C5FD" : "#1D4ED8"))
                    : (isDarkMode ? "#F8FAFC" : "#0F172A"),
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                }}>
                  {customAgent.isConnected
                    ? (liveKitState?.state === "speaking" || customAgent.isSpeaking
                      ? "NOVA parle..."
                      : liveKitState?.state === "listening"
                        ? "NOVA t'écoute..."
                        : liveKitState?.state === "thinking"
                          ? "NOVA réfléchit..."
                          : liveKitState?.state === "connecting" || !liveKitState?.state
                            ? "⚡ NOVA arrive en direct..."
                            : "NOVA est prête")
                    : "Session vocale NOVA"}
                </span>
                <span style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? "#94A3B8" : "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {practiceTopic ? `Sujet : ${practiceTopic}` : "Parle librement en anglais"}
                </span>
              </div>
            </div>

            {/* Groupe d'actions vocales & compteur de fiches mémos */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <AgentVoiceBar
                agent={agent}
                variant="chatgpt"
                onStart={() => {
                  armIosAudio();
                  setAgentTranscript([]);
                  setAgentError("");
                  agent.start(MODE_CONFIGS.chat({ topic: practiceTopic || "Free conversation", level: practiceLevel }));
                }}
              />

              {/* Bouton Compteur de fiches créées durant la session (48px rond) */}
              <button
                type="button"
                onClick={handleViewSessionCreatedCards}
                title={
                  sessionCardsCount === 0
                    ? "0 fiche créée durant cette session"
                    : `${sessionCardsCount} fiche${sessionCardsCount > 1 ? "s ont été créées" : " a été créée"} durant cette session — Cliquer pour voir`
                }
                aria-label={`${sessionCardsCount} fiches créées durant cette session`}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  cursor: sessionCardsCount > 0 ? "pointer" : "default",
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: sessionCardsCount > 0
                    ? (isDarkMode
                        ? "linear-gradient(135deg, rgba(37,99,235,0.4), rgba(29,78,216,0.65))"
                        : "linear-gradient(135deg, #EFF6FF, #DBEAFE)")
                    : (isDarkMode ? "rgba(30, 41, 59, 0.65)" : "rgba(241, 245, 249, 0.85)"),
                  border: sessionCardsCount > 0
                    ? `1.5px solid ${isDarkMode ? "rgba(96,165,250,0.65)" : "rgba(37,99,235,0.5)"}`
                    : `1px solid ${isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}`,
                  boxShadow: sessionCardsCount > 0
                    ? (isDarkMode
                        ? "0 4px 14px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255,255,255,0.25)"
                        : "0 4px 14px rgba(37, 99, 235, 0.22), inset 0 1px 0 rgba(255,255,255,0.85)")
                    : "none",
                  position: "relative",
                  transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  outline: "none",
                  flexShrink: 0,
                  userSelect: "none"
                }}
                onMouseEnter={(e) => {
                  if (sessionCardsCount > 0) e.currentTarget.style.transform = "scale(1.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <span style={{ fontSize: 13, lineHeight: 1, marginBottom: 2 }}>🗂️</span>
                <span style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: sessionCardsCount > 0
                    ? (isDarkMode ? "#93C5FD" : "#1D4ED8")
                    : (isDarkMode ? "#94A3B8" : "#64748B"),
                  lineHeight: 1,
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  {sessionCardsCount}
                </span>

                {/* Pastille vibrante animée si des fiches ont été créées */}
                {sessionCardsCount > 0 && (
                  <span style={{
                    position: "absolute",
                    top: -1,
                    right: -1,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#10B981",
                    boxShadow: "0 0 8px #10B981",
                    animation: "pulse 2s infinite"
                  }} />
                )}
              </button>
            </div>
          </div>

          {/* Messages d'erreur du micro / agent */}
          {agentError && (
            <div style={{
              padding: "8px 14px",
              background: "#FEF2F2",
              color: "#EF4444",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              maxWidth: 480,
              width: "100%",
              textAlign: "center"
            }}>
              {agentError}
            </div>
          )}
        </div>
      )}

      {/* ══ WRITING LAB ══ */}
      {
        practiceSubView === "writing" && (
          <div className="ev-writing-lab-container" style={{ background: "var(--mm-bg-card)", borderRadius: 24, padding: "24px 24px 76px 24px", border: "1px solid var(--mm-border)", boxShadow: "var(--mm-shadow)" }}>

            {/* Top Bar : Titre Studio, Onglets Studio/Historique & Actions */}
            <div className="ev-wl-topbar">
              <div className="ev-wl-title-group">
                <div className="ev-wl-orb-icon">
                  <PenLine size={20} className="ev-wl-title-icon" strokeWidth={2.2} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h2 className="ev-wl-title">Writing Lab</h2>
                    <span className="ev-wl-badge-ielts">IELTS Academic Desk</span>
                  </div>
                  <p className="ev-wl-subtitle">Entraînement rédactionnel chronométré &amp; évaluation band score</p>
                </div>
              </div>

              {/* Mode Switcher In-Page (ZERO POPUP) */}
              <div className="ev-wl-mode-switcher" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={writingTabMode === "editor"}
                  onClick={() => setWritingTabMode("editor")}
                  className={`ev-wl-mode-btn ${writingTabMode === "editor" ? "is-active" : ""}`}
                >
                  <PenLine size={14} strokeWidth={2.2} />
                  <span>Rédiger</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={writingTabMode === "history"}
                  onClick={() => setWritingTabMode("history")}
                  className={`ev-wl-mode-btn ${writingTabMode === "history" ? "is-active" : ""}`}
                >
                  <History size={14} strokeWidth={2.2} />
                  <span>Mes écrits &amp; Corrections</span>
                  <span className="ev-wl-mode-badge">{practiceWritingDrafts.length}</span>
                </button>
              </div>

              {/* Actions rapides contextuelles */}
              <div className="ev-wl-actions">
                {writingTabMode === "editor" ? (
                  <>
                    <button
                      type="button"
                      onClick={pickRandomIeltsTopic}
                      className="ev-wl-btn-sparkle"
                      title="Générer un sujet officiel IELTS Task 2"
                    >
                      <Sparkles size={14} strokeWidth={2.2} />
                      Sujet aléatoire
                    </button>
                    <button
                      type="button"
                      onClick={startNewWritingSession}
                      className="ev-wl-btn-primary"
                      title="Réinitialiser l'éditeur pour démarrer un nouvel essai vierge"
                    >
                      <PenLine size={14} strokeWidth={2.5} />
                      Nouvelle session
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      createNewDraft();
                      setWritingTabMode("editor");
                    }}
                    className="ev-wl-btn-primary"
                    title="Ouvrir l'éditeur pour rédiger un nouvel essai"
                  >
                    <PenLine size={14} strokeWidth={2.5} />
                    Nouvel essai
                  </button>
                )}
              </div>
            </div>

            {writingTabMode === "editor" ? (
              <>

            {/* Bannière pédagogique épurée (Consolidation active) */}
            <div
              className="ev-consolidation-banner"
              style={{
                padding: "10px 16px",
                marginBottom: 16,
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onClick={() => setShowWritingTip(prev => !prev)}
              title="Cliquer pour afficher ou masquer le rappel"
            >
              <div className="ev-consolidation-banner-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div className="ev-consolidation-banner-title" style={{ fontSize: 13, gap: 8, display: "flex", alignItems: "center" }}>
                  <span>✨</span>
                  <span>Si vous avez appris des expressions, venez les pratiquer avec vos propres mots.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowReviewedDrawer(prev => !prev);
                    }}
                    className={`ev-today-reviewed-btn ${showReviewedDrawer ? "is-open" : ""}`}
                    title="Afficher les expressions révisées aujourd'hui pour les insérer dans mon texte"
                  >
                    <span>🎯 Mes révisions du jour</span>
                    <span className="ev-today-reviewed-badge">{todayReviewedExpressions.length}</span>
                    <ChevronDown size={12} className={`ev-today-chevron ${showReviewedDrawer ? "is-open" : ""}`} />
                  </button>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--mm-primary, #b4552d)", whiteSpace: "nowrap" }}>
                    {showWritingTip ? "▲ Replier" : "💡 Astuce & Thèmes"}
                  </span>
                </div>
              </div>

              {/* Tiroir d'insertion des expressions révisées aujourd'hui */}
              {showReviewedDrawer && (
                <div
                  className="ev-today-reviewed-drawer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed rgba(180, 85, 45, 0.25)" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--mm-fg)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>🎯</span>
                      <span>
                        {hasTodayReviews
                          ? `Expressions révisées aujourd'hui (${todayReviewedExpressions.length})`
                          : `Expressions recommandées pour votre texte (${todayReviewedExpressions.length})`}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--mm-fg-muted)" }}>
                      Cliquez pour insérer directement dans votre essai ✍️
                    </span>
                  </div>

                  <div className="ev-today-chips-grid">
                    {todayReviewedExpressions.map((expr, idx) => {
                      const cleanEnglish = (expr.front || expr.expression || "").trim();
                      const cleanFrench = extractFrenchTranslation(expr.back || expr.translation || "");
                      const isUsed = practiceWritingText && cleanEnglish && practiceWritingText.toLowerCase().includes(cleanEnglish.toLowerCase());

                      return (
                        <div
                          key={expr.id || idx}
                          onClick={() => insertExpressionIntoDraft(cleanEnglish)}
                          className={`ev-today-card ${isUsed ? "is-used" : ""}`}
                          role="button"
                          tabIndex={0}
                          title={isUsed ? `Déjà utilisée dans votre essai ! Cliquez pour réinsérer` : `Cliquer pour insérer "${cleanEnglish}" dans votre essai`}
                        >
                          <div className="ev-today-card-top">
                            <span className="ev-today-card-en">{cleanEnglish}</span>
                            <span className="ev-today-card-badge">
                              {isUsed ? "✅ Utilisée" : "+ Insérer"}
                            </span>
                          </div>
                          {cleanFrench && (
                            <div className="ev-today-card-fr">
                              ↳ {cleanFrench}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}

              {showWritingTip && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed rgba(180, 85, 45, 0.2)", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--mm-fg-muted)", marginRight: 4, alignSelf: "center" }}>Thèmes recommandés :</span>
                  {IELTS_TOPIC_BANK.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPracticeWritingPrompt(item.prompt);
                        if (showToast) showToast(`Sujet sélectionné : ${item.topic}`, "info");
                      }}
                      className="ev-wl-topic-chip"
                    >
                      {item.topic}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pupitre d'écriture (Sujet & Objectifs) */}
            <div className="ev-wl-editor-toprow">
              <div className="ev-wl-subject-wrapper">
                <input
                  value={practiceWritingPrompt}
                  onChange={e => setPracticeWritingPrompt(e.target.value)}
                  placeholder="Sujet d'écriture (ex: 'Some people believe technology isolates us...')"
                  className="ev-wl-subject-input"
                />
                {practiceWritingPrompt && (
                  <button
                    type="button"
                    onClick={() => setPracticeWritingPrompt("")}
                    className="ev-wl-subject-clear"
                    title="Effacer le sujet"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="ev-goal-chips" title="Choisir un objectif de longueur">
                {[150, 250, 350].map(goal => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => setWritingWordGoal(goal)}
                    className={`ev-goal-chip ${writingWordGoal === goal ? "is-active" : ""}`}
                  >
                    {goal} mots
                  </button>
                ))}
              </div>
            </div>

            {/* Éditeur de texte haute lisibilité */}
            <div className="ev-wl-textarea-wrap">
              <textarea
                value={practiceWritingText}
                onChange={e => {
                  setPracticeWritingText(e.target.value);
                  if (!isHudCollapsed && e.target.value.length > 5) {
                    setIsHudCollapsed(true);
                  }
                }}
                rows={9}
                className="ev-wl-textarea"
                placeholder="Écris ton essai ici avec tes propres mots... (Structure type IELTS : Introduction, Argument 1, Argument 2, Conclusion)"
              />
            </div>

            {/* Footer de l'éditeur : Compteur dynamique haute fidélité & barre de progression */}
            {(() => {
              const currentWords = practiceWritingText.trim() ? practiceWritingText.trim().split(/\s+/).filter(Boolean).length : 0;
              const wordPct = Math.min(100, Math.round((currentWords / writingWordGoal) * 100));
              const isGoalReached = wordPct >= 100;
              const isNearing = wordPct >= 75 && !isGoalReached;
              const readTimeMin = Math.max(1, Math.round(currentWords / 130));
              return (
                <div className="ev-editor-footer">
                  <div className="ev-editor-footer-left">
                    <div className="ev-editor-progress-track">
                      <div
                        className={`ev-editor-progress-bar ${isGoalReached ? "is-goal" : isNearing ? "is-nearing" : ""}`}
                        style={{ width: `${wordPct}%` }}
                      />
                    </div>
                    <span className="ev-editor-readtime">
                      ~{currentWords === 0 ? "0" : readTimeMin} min de lecture
                    </span>
                  </div>
                  <div className={`ev-editor-wordcount-badge ${isGoalReached ? "is-goal" : isNearing ? "is-nearing" : ""}`}>
                    <span className="ev-editor-wc-num">{currentWords}</span> / {writingWordGoal} mots
                    <span className="ev-editor-wc-pct">({wordPct}%)</span>
                    {isGoalReached && <span className="ev-editor-wc-status">· Objectif atteint 🎉</span>}
                  </div>
                </div>
              );
            })()}

            {/* Bouton d'évaluation */}
            <button
              type="button"
              onClick={submitWriting}
              disabled={practiceWritingLoading || !practiceWritingText.trim()}
              className={`ev-wl-cta-btn ${practiceWritingLoading || !practiceWritingText.trim() ? "is-disabled" : ""}`}
            >
              {practiceWritingLoading
                ? <><Loader2 size={18} className="ev-wl-cta-spinner" /> Correction &amp; évaluation du band score par l&apos;examinateur IELTS...</>
                : <><SpellCheck2 size={18} /> Évaluer &amp; corriger mon essai (IELTS)</>
              }
            </button>

            {/* Rapport d'évaluation IELTS rétractable */}
            {practiceWritingFeedback && (
              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setIsReportExpanded(prev => !prev)}
                  className="ev-wl-report-toggle ev-report-toggle-btn"
                  title="Cliquer pour replier ou déplier le rapport IELTS"
                >
                  <div className="ev-wl-report-toggle-left">
                    <BarChart2 size={16} strokeWidth={2.5} className="ev-wl-report-toggle-icon" />
                    <span className="ev-wl-report-toggle-label">Évaluation IELTS &amp; Corrections</span>
                    <span
                      className="ev-report-toggle-score"
                      style={{
                        background: practiceWritingFeedback.score >= 7 ? "#10B981" : practiceWritingFeedback.score >= 5.5 ? "#F59E0B" : "#EF4444"
                      }}
                    >
                      Score {practiceWritingFeedback.score}
                    </span>
                  </div>
                  <span className="ev-wl-report-toggle-chevron">
                    {isReportExpanded ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
                  </span>
                </button>

                {isReportExpanded && (
                  <div className="ev-wl-report-body">
                    {/* En-tête Score & Commentaire Global */}
                    <div className="ev-wl-score-header">
                      <div
                        className="ev-wl-score-orb"
                        style={{
                          background: `linear-gradient(135deg, ${
                            practiceWritingFeedback.score >= 7 ? "#10B981" :
                            practiceWritingFeedback.score >= 5.5 ? "#F59E0B" : "#EF4444"
                          }, var(--mm-primary))`
                        }}
                      >
                        {practiceWritingFeedback.score}
                      </div>
                      <div className="ev-wl-score-comment">
                        <h3 className="ev-wl-score-title">Évaluation IELTS</h3>
                        <div className="ev-wl-score-text">{practiceWritingFeedback.overallComment}</div>
                      </div>
                    </div>

                    {/* Barre d'Onglets Segmentés */}
                    <div className="ev-ielts-tab-bar" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                      {[
                        { id: "overview", label: "Vue d'ensemble", icon: "📊" },
                        { id: "corrected", label: "Texte corrigé", icon: "✨" },
                        { id: "mistakes", label: "Diagnostic fautes", icon: "🔍" },
                        { id: "grammar", label: "Grammaire", icon: "📐" },
                        { id: "vocab", label: "Vocabulaire", icon: "📚" },
                        { id: "structure", label: "Structure", icon: "🏗️" },
                        { id: "magicink", label: "Magic Ink", icon: "✏️" },
                        { id: "all", label: "Tout afficher", icon: "📄" },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setIeltsActiveTab(tab.id)}
                          className={`ev-ielts-tab-btn ${ieltsActiveTab === tab.id ? "is-active" : ""}`}
                          title={`Afficher ${tab.label}`}
                        >
                          <span>{tab.icon}</span>
                          <span>{tab.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Contenu selon l'onglet actif */}
                    {ieltsActiveTab === "overview" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {/* 2 Boutons Raccourcis Principaux : Texte Corrigé & Diagnostic Fautes */}
                        <div className="ev-overview-shortcuts-grid">
                          {practiceWritingFeedback.correctedText && (
                            <div
                              onClick={() => setIeltsActiveTab("corrected")}
                              className="ev-overview-shortcut-card"
                              data-accent="success"
                              role="button"
                              tabIndex={0}
                              title="Ouvrir la version intégrale corrigée et écouter l'audio"
                            >
                              <div className="ev-overview-shortcut-header">
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <Sparkles size={16} color="#10B981" />
                                  <span className="ev-overview-shortcut-title" style={{ color: "#10B981" }}>Version Corrigée &amp; Audio</span>
                                </div>
                                <span className="ev-overview-shortcut-cta">Ouvrir ➔</span>
                              </div>
                              <p className="ev-overview-shortcut-preview">
                                {practiceWritingFeedback.correctedText.slice(0, 130)}...
                              </p>
                            </div>
                          )}

                          {practiceWritingFeedback.mistakes && practiceWritingFeedback.mistakes.length > 0 && (
                            <div
                              onClick={() => setIeltsActiveTab("mistakes")}
                              className="ev-overview-shortcut-card"
                              data-accent="danger"
                              role="button"
                              tabIndex={0}
                              title="Explorer les fautes classées avec la règle du Pourquoi"
                            >
                              <div className="ev-overview-shortcut-header">
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <Search size={16} color="#EF4444" />
                                  <span className="ev-overview-shortcut-title" style={{ color: "#EF4444" }}>
                                    Diagnostic Ciblé ({practiceWritingFeedback.mistakes.length} fautes)
                                  </span>
                                </div>
                                <span className="ev-overview-shortcut-cta">Explorer ➔</span>
                              </div>
                              <p className="ev-overview-shortcut-preview">
                                Règle d'or du « Pourquoi », pièges d'examen et création flashcards FSRS.
                              </p>
                            </div>
                          )}
                        </div>


                        {/* Grille de synthèse par compétences */}
                        <div className="ev-wl-overview-grid">
                          <div
                            onClick={() => setIeltsActiveTab("grammar")}
                            className="ev-ielts-summary-card"
                            data-accent="primary"
                          >
                            <div className="ev-ielts-card-header">
                              <span className="ev-ielts-card-label" style={{ color: "var(--mm-primary)" }}>GRAMMAIRE</span>
                              <span className="ev-ielts-card-link" style={{ color: "var(--mm-primary)" }}>Détails ↗</span>
                            </div>
                            <div className="ev-ielts-card-preview">{practiceWritingFeedback.grammarFeedback}</div>
                          </div>

                          <div
                            onClick={() => setIeltsActiveTab("vocab")}
                            className="ev-ielts-summary-card"
                            data-accent="primary"
                          >
                            <div className="ev-ielts-card-header">
                              <span className="ev-ielts-card-label" style={{ color: "var(--mm-primary)" }}>VOCABULAIRE</span>
                              <span className="ev-ielts-card-link" style={{ color: "var(--mm-primary)" }}>Détails ↗</span>
                            </div>
                            <div className="ev-ielts-card-preview">{practiceWritingFeedback.vocabularyFeedback}</div>
                          </div>

                          <div
                            onClick={() => setIeltsActiveTab("structure")}
                            className="ev-ielts-summary-card"
                            data-accent="success"
                          >
                            <div className="ev-ielts-card-header">
                              <span className="ev-ielts-card-label" style={{ color: "#10B981" }}>STRUCTURE</span>
                              <span className="ev-ielts-card-link" style={{ color: "#10B981" }}>Détails ↗</span>
                            </div>
                            <div className="ev-ielts-card-preview">{practiceWritingFeedback.structureFeedback}</div>
                          </div>

                          <div
                            onClick={() => setIeltsActiveTab("magicink")}
                            className="ev-ielts-summary-card"
                            data-accent="danger"
                          >
                            <div className="ev-ielts-card-header">
                              <span className="ev-ielts-card-label" style={{ color: "#EF4444" }}>MAGIC INK</span>
                              <span className="ev-ielts-card-link" style={{ color: "#EF4444" }}>Voir ↗</span>
                            </div>
                            <div className="ev-ielts-card-preview">Consulter le texte avec les erreurs surlignées et les corrections.</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cartes de Critères Spécifiques */}
                    {(ieltsActiveTab === "grammar" || ieltsActiveTab === "all") && (
                      <div className={`ev-ielts-detail-card ${ieltsActiveTab === "all" ? "is-stacked" : ""}`} data-accent="primary">
                        <div className="ev-ielts-detail-label" style={{ color: "var(--mm-primary)" }}>ANALYSE DE LA GRAMMAIRE</div>
                        <div className="ev-ielts-detail-text">{practiceWritingFeedback.grammarFeedback}</div>
                      </div>
                    )}

                    {(ieltsActiveTab === "vocab" || ieltsActiveTab === "all") && (
                      <div className={`ev-ielts-detail-card ${ieltsActiveTab === "all" ? "is-stacked" : ""}`} data-accent="primary">
                        <div className="ev-ielts-detail-label" style={{ color: "var(--mm-primary)" }}>ENRICHISSEMENT DU VOCABULAIRE</div>
                        <div className="ev-ielts-detail-text">{practiceWritingFeedback.vocabularyFeedback}</div>
                      </div>
                    )}

                    {(ieltsActiveTab === "structure" || ieltsActiveTab === "all") && (
                      <div className={`ev-ielts-detail-card ${ieltsActiveTab === "all" ? "is-stacked" : ""}`} data-accent="success">
                        <div className="ev-ielts-detail-label" style={{ color: "#10B981" }}>LOGIQUE &amp; STRUCTURE DU DISCOURS</div>
                        <div className="ev-ielts-detail-text">{practiceWritingFeedback.structureFeedback}</div>
                      </div>
                    )}

                    {(ieltsActiveTab === "magicink" || ieltsActiveTab === "all") && (
                      <div className="ev-ielts-detail-card ev-ielts-magicink-card" data-accent="danger">
                        <div className="ev-ielts-detail-label" style={{ color: "#EF4444" }}>MAGIC INK — CORRECTIONS ANNOTÉES</div>
                        <div
                          className="liquid-morph-text ev-ielts-magicink-text"
                          dangerouslySetInnerHTML={safeHTML((practiceWritingFeedback.magicInkText || practiceWritingFeedback.correctedText || "").replace(/\n/g, "<br/>"))}
                        />
                      </div>
                    )}

                    {(ieltsActiveTab === "corrected" || ieltsActiveTab === "all") && (
                      <div className={`ev-ielts-detail-card ${ieltsActiveTab === "all" ? "is-stacked" : ""}`} data-accent="success" style={{ borderLeft: "4px solid #10B981" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                          <div className="ev-ielts-detail-label" style={{ color: "#10B981", margin: 0 }}>VERSION INTÉGRALEMENT CORRIGÉE EN ANGLAIS</div>
                          {practiceWritingFeedback.correctedText && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => togglePlayAudio(practiceWritingFeedback.correctedText, "editor-corrected")}
                                className={`ev-history-audio-btn ${playingAudioId === "editor-corrected" ? "is-playing" : ""}`}
                                title={playingAudioId === "editor-corrected" ? "Arrêter la lecture" : "Écouter la version corrigée"}
                              >
                                {playingAudioId === "editor-corrected" ? (
                                  <>
                                    <span className="ev-audio-stop-icon" />
                                    <span>Arrêter</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 size={13} />
                                    <span>Écouter la correction</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyText(practiceWritingFeedback.correctedText, "editor-active")}
                                className="ev-history-copy-btn"
                              >
                                {copiedDraftId === "editor-active" ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                                <span>{copiedDraftId === "editor-active" ? "Copié !" : "Copier"}</span>
                              </button>
                            </div>
                          )}
                        </div>
                        {practiceWritingFeedback.correctedText ? (
                          <div className="ev-ielts-detail-text" style={{ fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap", color: "var(--mm-fg)", fontWeight: 500 }}>
                            {practiceWritingFeedback.correctedText}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: "var(--mm-fg-muted)", padding: "8px 0" }}>
                            Le texte correctif s'affichera ici pour chaque nouvelle évaluation IELTS.
                          </div>
                        )}
                      </div>
                    )}

                    {(ieltsActiveTab === "mistakes" || ieltsActiveTab === "all") && practiceWritingFeedback.mistakes && practiceWritingFeedback.mistakes.length > 0 && (
                      <div className={`ev-ielts-detail-card ${ieltsActiveTab === "all" ? "is-stacked" : ""}`} data-accent="danger" style={{ borderLeft: "4px solid #EF4444" }}>
                        <div className="ev-ielts-detail-label" style={{ color: "#EF4444", marginBottom: 12 }}>DIAGNOSTIC PÉDAGOGIQUE — POURQUOI &amp; PIÈGES D&apos;EXAMEN</div>
                        {renderDetailedMistakes(practiceWritingFeedback.mistakes)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
              </>
            ) : (
              /* VUE HISTORIQUE NATIVE IN-PAGE (ZERO POPUP) */
              <div className="ev-history-inpage">
                {/* Barre d'outils de recherche */}
                <div className="ev-history-inpage-header">
                  <div className="ev-history-search-wrap">
                    <Search size={15} style={{ position: "absolute", left: 12, opacity: 0.5, pointerEvents: "none" }} />
                    <input
                      type="text"
                      value={draftSearchQuery}
                      onChange={(e) => setDraftSearchQuery(e.target.value)}
                      placeholder="Rechercher par sujet ou contenu..."
                      className="ev-history-search-input"
                      style={{ paddingLeft: 34 }}
                    />
                    {draftSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setDraftSearchQuery("")}
                        style={{
                          position: "absolute",
                          right: 10,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          opacity: 0.6,
                          color: "inherit"
                        }}
                        title="Effacer la recherche"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {filteredDrafts.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => {
                            const allOpen = {};
                            filteredDrafts.forEach(d => { allOpen[d.id] = true; });
                            setExpandedDraftIds(allOpen);
                          }}
                          className="ev-history-bulk-toggle"
                          title="Déplier tous les écrits"
                        >
                          Tout ouvrir
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedDraftIds({})}
                          className="ev-history-bulk-toggle"
                          title="Replier tous les écrits"
                        >
                          Tout replier
                        </button>
                      </div>
                    )}
                    <span className="ev-history-count-badge">
                      {filteredDrafts.length} {filteredDrafts.length > 1 ? "écrits sauvegardés" : "écrit sauvegardé"}
                    </span>
                  </div>
                </div>

                {/* Grille des sessions & dual-cards */}
                {filteredDrafts.length === 0 ? (
                  <div className="ev-history-empty">
                    <div className="ev-history-empty-icon">📜</div>
                    <h3 className="ev-history-empty-title">
                      {practiceWritingDrafts.length === 0 ? "Aucun écrit enregistré" : "Aucun résultat pour cette recherche"}
                    </h3>
                    <p className="ev-history-empty-desc">
                      {practiceWritingDrafts.length === 0
                        ? "Rédigez votre premier essai IELTS dans le Writing Lab pour voir apparaître vos textes et leurs corrections complètes ici."
                        : "Essayez un autre mot-clé pour retrouver votre essai."}
                    </p>
                    {practiceWritingDrafts.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setWritingTabMode("editor")}
                        className="ev-wl-btn-primary"
                        style={{ marginTop: 16 }}
                      >
                        <PenLine size={14} />
                        Commencer à rédiger
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="ev-history-list" style={{ padding: 0 }}>
                    {filteredDrafts.map((draft) => {
                      const score = draft.feedback?.score || null;
                      const scoreColor = score ? getBandScoreColor(score) : null;
                      const wordCount = (draft.text || "").trim().split(/\s+/).filter(Boolean).length;
                      const formattedDate = draft.date
                        ? new Date(draft.date).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })
                        : "Date inconnue";
                      const isExpanded = !!expandedDraftIds[draft.id];

                      return (
                        <div key={draft.id} className={`ev-history-session-card ${isExpanded ? "is-open" : "is-collapsed"}`}>
                          {/* Entête de la session cliquable en accordéon */}
                          <div
                            className="ev-history-card-header"
                            onClick={() => toggleDraftExpand(draft.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleDraftExpand(draft.id);
                              }
                            }}
                            title={isExpanded ? "Cliquer pour replier l'écrit" : "Cliquer pour afficher l'évaluation et l'audio"}
                          >
                            <div className="ev-history-card-info">
                              <div className="ev-history-meta-row">
                                <span className="ev-history-date">📅 {formattedDate}</span>
                                {score ? (
                                  <span
                                    className="ev-history-score-badge"
                                    style={{
                                      backgroundColor: `${scoreColor}18`,
                                      color: scoreColor,
                                      borderColor: `${scoreColor}40`
                                    }}
                                  >
                                    Band {score} / 9.0
                                  </span>
                                ) : (
                                  <span className="ev-history-draft-badge">Brouillon / Non évalué</span>
                                )}
                                <span className="ev-history-meta-words">{wordCount} mots</span>
                              </div>
                              <h4 className="ev-history-prompt-title">
                                {draft.prompt || "Essai libre sans sujet spécifique"}
                              </h4>
                            </div>

                            <div className="ev-history-actions">
                              <button
                                type="button"
                                className="ev-history-toggle-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleDraftExpand(draft.id);
                                }}
                                title={isExpanded ? "Replier le détail" : "Ouvrir l'évaluation et l'audio"}
                              >
                                <span>{isExpanded ? "Masquer" : "Voir l'évaluation"}</span>
                                <span className="ev-history-chevron">
                                  <ChevronDown size={14} />
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadDraft(draft.id);
                                }}
                                className="ev-history-load-btn"
                                title="Recharger dans l'éditeur pour retravailler ou revoir le rapport"
                              >
                                <ExternalLink size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
                                Revoir dans l'éditeur
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteDraft(draft.id, e);
                                }}
                                className="ev-history-delete-btn"
                                title="Supprimer cet essai"
                              >
                                <Trash2 size={14} color="#EF4444" />
                              </button>
                            </div>
                          </div>

                          {/* Corps dépliable : révélé au clic */}
                          {isExpanded && (
                            <div className="ev-history-card-body">


                          {/* Grille Dual-Card : Mon texte d'un côté, la correction de l'autre */}
                          <div className="ev-history-dual-grid">
                            {/* CARTE 1 : Ce que j'ai écrit */}
                            <div className="ev-history-subcard ev-history-subcard--text">
                              <div className="ev-history-subcard-header">
                                <span className="ev-history-subcard-title">📝 Mon texte rédigé</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {draft.text && (
                                    <button
                                      type="button"
                                      onClick={() => togglePlayAudio(draft.text, `text_${draft.id}`)}
                                      className={`ev-history-audio-btn ev-history-audio-btn--muted ${playingAudioId === `text_${draft.id}` ? "is-playing" : ""}`}
                                      title={playingAudioId === `text_${draft.id}` ? "Arrêter" : "Écouter ce que j'ai écrit"}
                                    >
                                      {playingAudioId === `text_${draft.id}` ? (
                                        <>
                                          <span className="ev-audio-stop-icon" />
                                          <span>Arrêter</span>
                                        </>
                                      ) : (
                                        <>
                                          <Volume2 size={12} />
                                          <span>Écouter</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                  <span className="ev-history-subcard-meta">{wordCount} mots</span>
                                </div>
                              </div>
                              <div className="ev-history-text-content">
                                {draft.text || <em style={{ opacity: 0.5 }}>Texte vide</em>}
                              </div>
                            </div>


                            {/* CARTE 2 : La correction & analyse */}
                            <div className="ev-history-subcard ev-history-subcard--feedback">
                              <div className="ev-history-subcard-header">
                                <span className="ev-history-subcard-title">🎯 Évaluation &amp; Correction</span>
                                {score && (
                                  <span className="ev-history-subcard-meta" style={{ fontWeight: 800, color: scoreColor }}>
                                    Score: {score}
                                  </span>
                                )}
                              </div>
                              <div className="ev-history-feedback-content">
                                {draft.feedback ? (
                                  <>
                                    {draft.feedback.overallComment && (
                                      <div className="ev-history-feedback-overall">
                                        {draft.feedback.overallComment}
                                      </div>
                                    )}
                                    {draft.feedback.grammarFeedback && (
                                      <div className="ev-history-feedback-item">
                                        <span className="ev-history-crit-tag" style={{ color: "var(--mm-primary)" }}>Grammaire :</span>
                                        <span>{draft.feedback.grammarFeedback}</span>
                                      </div>
                                    )}
                                    {draft.feedback.vocabularyFeedback && (
                                      <div className="ev-history-feedback-item">
                                        <span className="ev-history-crit-tag" style={{ color: "var(--mm-primary)" }}>Vocabulaire :</span>
                                        <span>{draft.feedback.vocabularyFeedback}</span>
                                      </div>
                                    )}
                                    {draft.feedback.structureFeedback && (
                                      <div className="ev-history-feedback-item">
                                        <span className="ev-history-crit-tag" style={{ color: "#10B981" }}>Structure :</span>
                                        <span>{draft.feedback.structureFeedback}</span>
                                      </div>
                                    )}
                                    {(draft.feedback.magicInkText || draft.feedback.correctedText) && (
                                      <div className="ev-history-feedback-magic">
                                        <div className="ev-history-magic-label">Magic Ink (Version bonifiée) :</div>
                                        <div
                                          className="ev-history-magic-text"
                                          dangerouslySetInnerHTML={safeHTML((draft.feedback.magicInkText || draft.feedback.correctedText || "").replace(/\n/g, "<br/>"))}
                                        />
                                      </div>
                                    )}

                                    {/* Diagnostic pédagogique détaillé (Pourquoi & Piège) */}
                                    {draft.feedback.mistakes && draft.feedback.mistakes.length > 0 && (
                                      renderDetailedMistakes(draft.feedback.mistakes)
                                    )}
                                  </>
                                ) : (
                                  <div className="ev-history-no-feedback">
                                    <span>⏳ Aucun rapport IELTS n'a encore été généré pour ce texte.</span>
                                    <button
                                      type="button"
                                      onClick={() => loadDraft(draft.id)}
                                      className="ev-history-eval-now-btn"
                                    >
                                      Lancer l'évaluation IELTS ⚡
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* SECTION BASSE : TEXTE INTÉGRALEMENT CORRIGÉ (POUR TOUS LES ÉCRITS) */}
                          <div className="ev-history-corrected-section">
                            <div className="ev-history-corrected-header">
                              <div className="ev-history-corrected-title">
                                <Sparkles size={14} className="ev-history-corrected-icon" />
                                <span>TEXTE CORRIGÉ &amp; BONIFIÉ</span>
                                <span className="ev-history-corrected-pill">English Version</span>
                              </div>
                              {draft.feedback?.correctedText && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button
                                    type="button"
                                    onClick={() => togglePlayAudio(draft.feedback.correctedText, `corr_${draft.id}`)}
                                    className={`ev-history-audio-btn ${playingAudioId === `corr_${draft.id}` ? "is-playing" : ""}`}
                                    title={playingAudioId === `corr_${draft.id}` ? "Arrêter la lecture" : "Écouter la correction en anglais"}
                                  >
                                    {playingAudioId === `corr_${draft.id}` ? (
                                      <>
                                        <span className="ev-audio-stop-icon" />
                                        <span>Arrêter</span>
                                      </>
                                    ) : (
                                      <>
                                        <Volume2 size={13} />
                                        <span>Écouter la correction</span>
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(draft.feedback.correctedText, draft.id)}
                                    className="ev-history-copy-btn"
                                    title="Copier la version anglaise corrigée"
                                  >
                                    {copiedDraftId === draft.id ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                                    <span>{copiedDraftId === draft.id ? "Copié !" : "Copier"}</span>
                                  </button>
                                </div>
                              )}

                            </div>

                            {draft.feedback?.correctedText && (
                              <div className="ev-history-corrected-text" style={{ marginBottom: (!draft.feedback?.mistakes || draft.feedback.mistakes.length === 0 || !draft.feedback.mistakes[0]?.why) ? 14 : 0 }}>
                                {draft.feedback.correctedText}
                              </div>
                            )}

                            {(!draft.feedback?.correctedText || !draft.feedback?.mistakes || draft.feedback.mistakes.length === 0 || !draft.feedback.mistakes[0]?.why) && (
                              <div className="ev-history-generate-box">
                                <p className="ev-history-generate-desc">
                                  {!draft.feedback?.correctedText
                                    ? "Cet écrit ne dispose pas encore de sa version corrigée et de son analyse approfondie."
                                    : "Enrichir cet écrit avec le diagnostic pédagogique (le « Pourquoi » de chaque faute)."
                                  }
                                </p>
                                <button
                                  type="button"
                                  disabled={generatingCorrectedId === draft.id}
                                  onClick={() => generateMissingCorrectedText(draft)}
                                  className="ev-history-generate-btn"
                                >
                                  {generatingCorrectedId === draft.id ? (
                                    <>
                                      <Loader2 size={13} className="ev-wl-cta-spinner" />
                                      <span>Diagnostic d&apos;élite en cours...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles size={13} />
                                      <span>Diagnostic approfondi &amp; Texte correctif ✨</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      }

      {/* ══ SPEAKING LAB ══ */}
      {
        practiceSubView === "speaking" && (
          <div className="ep-glass-panel ep-lab-panel" style={{ overflow: "hidden" }}>

            {/* Header */}
            <div className="ep-lab-banner">
              <span className="ep-lab-header-icon ep-lab-header-icon--on-banner"><Mic size={20} strokeWidth={2} /></span>
              <div>
                <div className="ep-lab-title ep-lab-title--on-banner">Speaking Lab</div>
                <div className="ep-lab-subtitle ep-lab-subtitle--on-banner">Analyse ta prononciation, phonème par phonème</div>
              </div>
            </div>

            <div style={{ padding: 24 }}>

              {/* Phrase de référence */}
              <div style={{ marginBottom: 20 }}>
                <div className="ep-lab-eyebrow">Phrase à prononcer <span className="ep-lab-eyebrow-muted">(laisse vide pour analyse libre)</span></div>
                <input
                  value={practiceSpeakingPrompt}
                  onChange={e => { setPracticeSpeakingPrompt(e.target.value); setSpeakingFicheSourceId(null); }}
                  placeholder='ex : "The weather in September is quite unpredictable"'
                  className="mm-input"
                />
              </div>

              {/* Sélecteur de fiches — prononcer directement les expressions apprises */}
              <div style={{ marginBottom: 20 }}>
                <div className="ep-lab-eyebrow" style={{ marginBottom: 8 }}>
                  📚 Ou choisis une de tes fiches à prononcer ({allEnglishFiches.length})
                </div>
                {allEnglishFiches.length === 0 ? (
                  <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
                    Aucune fiche anglaise pour l'instant. Ajoute des expressions dans MemoMaster pour pouvoir les pratiquer ici.
                  </p>
                ) : (
                  <>
                    <input
                      value={speakingFicheQuery}
                      onChange={e => setSpeakingFicheQuery(e.target.value)}
                      placeholder="Rechercher une fiche..."
                      className="mm-input"
                      style={{ marginBottom: 10 }}
                    />
                    <div style={{
                      display: "flex", flexDirection: "column", gap: 6,
                      maxHeight: 180, overflowY: "auto",
                      border: `1px solid ${theme.border}`, borderRadius: 12, padding: 8,
                      background: theme.surface || "transparent",
                    }}>
                      {allEnglishFiches
                        .filter(f => !speakingFicheQuery.trim() || f.front.toLowerCase().includes(speakingFicheQuery.trim().toLowerCase()))
                        .slice(0, 50)
                        .map(f => {
                          const isActive = speakingFicheSourceId === f.id;
                          return (
                            <button
                              key={f.id}
                              onClick={() => { setPracticeSpeakingPrompt(f.front); setSpeakingFicheSourceId(f.id); }}
                              className="hov"
                              style={{
                                textAlign: "left", padding: "8px 12px", borderRadius: 8,
                                border: isActive ? `1px solid ${theme.primary}` : "1px solid transparent",
                                background: isActive ? `${theme.primary}22` : "transparent",
                                color: theme.text, cursor: "pointer", fontSize: 14, fontWeight: isActive ? 700 : 500,
                              }}
                              title={f.back || ""}
                            >
                              {f.front}
                            </button>
                          );
                        })}
                      {allEnglishFiches.filter(f => !speakingFicheQuery.trim() || f.front.toLowerCase().includes(speakingFicheQuery.trim().toLowerCase())).length === 0 && (
                        <div style={{ color: theme.textMuted, fontSize: 13, padding: 6 }}>Aucune fiche ne correspond à cette recherche.</div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Zone enregistrement */}
              <div className="ep-speak-stage">

                {/* Canvas live */}
                <canvas
                  ref={speakingCanvasRef}
                  width={600} height={70}
                  className="ep-speak-canvas"
                  style={{ display: practiceSpeakingIsRecording ? "block" : "none" }}
                />

                {/* Waveform statique colorée après enregistrement */}
                {!practiceSpeakingIsRecording && practiceWaveformBars.length > 0 && (
                  <div className="ep-speak-waveform">
                    {practiceWaveformBars.map((amp, i) => {
                      const barHeight = Math.max(4, amp * 120);
                      let tier = null;
                      if (practicePhonemeData?.words?.length) {
                        const wordIdx = Math.floor(i / practiceWaveformBars.length * practicePhonemeData.words.length);
                        const w = practicePhonemeData.words[wordIdx];
                        if (w) tier = w.score >= 80 ? "high" : w.score >= 50 ? "mid" : "low";
                      }
                      return (
                        <div key={i} className="ep-tier" data-tier={tier || "high"} style={{ flex: 1, height: barHeight, borderRadius: 2, background: "var(--mm-tier-color, var(--mm-primary))", transition: "background 0.8s ease, height 0.4s ease", opacity: 0.85 }} />
                      );
                    })}
                  </div>
                )}

                {/* Placeholder si rien */}
                {!practiceSpeakingIsRecording && practiceWaveformBars.length === 0 && (
                  <div className="ep-speak-placeholder">
                    <AudioLines size={18} strokeWidth={1.75} />
                    <span>La waveform de ta voix apparaîtra ici en temps réel</span>
                  </div>
                )}

                {/* Countdown + REC */}
                {practiceSpeakingIsRecording && (
                  <div className="ep-speak-rec-row">
                    <div className="ep-speak-rec-dot-wrap">
                      <span className="ep-speak-rec-dot" />
                      <span className="ep-speak-rec-label">REC</span>
                    </div>
                    <div className="ep-speak-countdown">{practiceSpeakingCountdown}s</div>
                  </div>
                )}

                {/* Bouton principal */}
                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={startSpeakingRecording}
                    disabled={practiceSpeakingLoading || practiceSpeakingIsRecording}
                    className={`mm-btn ep-speak-record-btn${practiceSpeakingIsRecording ? " is-recording" : ""}`}
                  >
                    {practiceSpeakingLoading
                      ? (<><Loader2 size={16} strokeWidth={2} className="ep-spin" /> Analyse en cours…</>)
                      : practiceSpeakingIsRecording
                        ? (<><Square size={15} strokeWidth={2} fill="currentColor" /> Enregistrement…</>)
                        : (<><Mic size={16} strokeWidth={2} /> Analyser ma prononciation (10s)</>)}
                  </button>
                </div>
              </div>

              {/* Transcription */}
              {practiceSpeakingTranscript && (
                <div className="ep-speak-transcript">
                  <AudioLines size={18} strokeWidth={2} className="ep-speak-transcript-icon" />
                  <div>
                    <div className="ep-lab-eyebrow" style={{ marginBottom: 4 }}>Transcription</div>
                    <div className="ep-speak-transcript-text">« {practiceSpeakingTranscript} »</div>
                  </div>
                </div>
              )}

              {/* ══ ANALYSE PHONÉTIQUE ══ */}
              {practicePhonemeData && (() => {
                const sc = practicePhonemeData.overallScore ?? 0;
                const scTier = sc >= 80 ? "high" : sc >= 50 ? "mid" : "low";
                const scoreLabel = sc >= 90 ? "Excellent" : sc >= 80 ? "Très bien" : sc >= 65 ? "Moyen" : sc >= 50 ? "À améliorer" : "Problèmes majeurs";
                const words = practicePhonemeData.words ?? [];

                // Recurrent error patterns from all words
                const errorPatterns = words
                  .filter(w => w.issue && w.issue !== "null" && w.score < 80)
                  .map(w => w.issue)
                  .reduce((acc, issue) => { acc[issue] = (acc[issue] || 0) + 1; return acc; }, {});
                const topErrors = Object.entries(errorPatterns).sort((a, b) => b[1] - a[1]).slice(0, 4);

                // Phoneme-level character diff helper: highlight chars that differ between IPA strings
                const diffIpa = (expected, detected) => {
                  if (!detected || detected === expected) return null;
                  const exp = expected.replace(/[/[\]]/g, "");
                  const det = detected.replace(/[/[\]]/g, "");
                  return det.split("").map((ch, i) => {
                    const isDiff = ch !== exp[i];
                    return { ch, isDiff };
                  });
                };

                return (
                  <>
                    {/* ─── Hero strip : score ring + accent + stats ─── */}
                    <div className="ep-tier ep-speak-hero" data-tier={scTier}>

                      {/* Score ring */}
                      <div className="ep-speak-ring-wrap">
                        <svg viewBox="0 0 36 36" className="ep-speak-ring">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--mm-border)" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--mm-tier-color)" strokeWidth="3"
                            strokeDasharray={`${sc} 100`} strokeLinecap="round"
                            style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)" }} />
                        </svg>
                        <div className="ep-speak-ring-center">
                          <div className="ep-speak-ring-score">{sc}</div>
                          <div className="ep-speak-ring-max">/100</div>
                          <div className="ep-speak-ring-label">{scoreLabel}</div>
                        </div>
                      </div>

                      {/* Accent + stats column */}
                      <div className="ep-speak-accent-col">
                        <div className="ep-speak-accent-pill">
                          <Globe size={18} strokeWidth={1.75} />
                          <div>
                            <div className="ep-lab-eyebrow" style={{ marginBottom: 2 }}>Accent détecté</div>
                            <div className="ep-speak-accent-value">{practicePhonemeData.accentProfile}</div>
                          </div>
                        </div>

                        {/* Word score pills */}
                        <div className="ep-speak-word-pills">
                          {words.map((w, i) => {
                            const t = (w.score ?? 100) >= 80 ? "high" : (w.score ?? 100) >= 50 ? "mid" : "low";
                            return (
                              <div key={i} className="ep-tier ep-speak-word-pill" data-tier={t} title={`${w.word} — ${w.score}/100`}>
                                {w.word}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Stats column */}
                      <div className="ep-speak-stats-col">
                        {[
                          { label: "Bons mots", val: words.filter(w => (w.score ?? 100) >= 80).length, tier: "high" },
                          { label: "À améliorer", val: words.filter(w => (w.score ?? 100) < 80 && (w.score ?? 100) >= 50).length, tier: "mid" },
                          { label: "Erreurs", val: words.filter(w => (w.score ?? 100) < 50).length, tier: "low" },
                        ].map(s => (
                          <div key={s.label} className="ep-tier ep-speak-stat-row" data-tier={s.tier}>
                            <span className="ep-speak-stat-label">{s.label}</span>
                            <span className="ep-speak-stat-val">{s.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ─── Recurrent error patterns ─── */}
                    {topErrors.length > 0 && (
                      <div className="ep-tier ep-speak-errors" data-tier="low">
                        <div className="ep-lab-eyebrow" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                          <Repeat2 size={13} strokeWidth={2} /> Patterns d'erreurs récurrents
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {topErrors.map(([issue, count]) => (
                            <div key={issue} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mm-tier-color)", minWidth: 160 }}>{issue}</div>
                              <div className="ep-speak-error-track">
                                <div className="ep-speak-error-fill" style={{ width: `${Math.min(count / words.length * 100 * 2, 100)}%` }} />
                              </div>
                              <div style={{ fontSize: 11, color: "var(--mm-fg-muted)", minWidth: 40 }}>{count}×</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {speakItOpen && (
                      <SpeakItChallenge
                        expressions={expressions}
                        setExpressions={setExpressions}
                        callClaude={callClaude}
                        transcribeWithGroq={transcribeWithGroq}
                        awardXP={awardXP}
                        showToast={showToast}
                        theme={theme}
                        isDarkMode={isDarkMode}
                        onClose={() => setSpeakItOpen(false)}
                      />
                    )}

                    {/* VOICE MIRROR OVERLAY (now moved to root of component) */}

                    {/* ─── Légende ─── */}
                    <div className="ep-speak-legend">
                      <span className="ep-lab-eyebrow" style={{ flex: 1 }}>Analyse mot par mot</span>
                      {[["high", "Bon (80+)"], ["mid", "Moyen (50–79)"], ["low", "Problème (<50)"]].map(([t, l]) => (
                        <span key={l} className="ep-tier ep-speak-legend-item" data-tier={t}>● {l}</span>
                      ))}
                    </div>

                    {/* ─── Phoneme cards ─── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {words.map((w, i) => {
                        const score = w.score ?? 100;
                        const t = score >= 80 ? "high" : score >= 50 ? "mid" : "low";
                        const hasIssue = w.issue && w.issue !== "null";
                        const ipaChars = diffIpa(w.expectedIpa, w.detectedIpa);

                        // Simulated mini phoneme bars (visual accent on the word, derived from score)
                        const seed = w.word.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                        const miniBarCount = Math.max(4, Math.min(10, w.word.length + 1));
                        const miniBars = Array.from({ length: miniBarCount }, (_, j) => {
                          const noise = ((seed * (j + 1) * 37) % 40) / 100;
                          const base = score / 100;
                          return Math.max(0.15, Math.min(1, base - noise + 0.1));
                        });

                        return (
                          <div key={i} className="ep-tier ep-speak-word-card" data-tier={t}>

                            {/* Row 1: word + mini-waveform + score */}
                            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                              <div className="ep-speak-word-card-word">{w.word}</div>

                              {/* Mini waveform per word */}
                              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32, flex: 1 }}>
                                {miniBars.map((amp, bi) => (
                                  <div key={bi} style={{ flex: 1, borderRadius: 2, background: "var(--mm-tier-color)", height: `${Math.round(amp * 100)}%`, opacity: 0.4 + amp * 0.6, transition: "height 0.6s ease", minHeight: 4 }} />
                                ))}
                              </div>

                              <div className="ep-speak-word-card-score">
                                {score}<span className="ep-speak-word-card-score-max">/100</span>
                              </div>
                            </div>

                            {/* Row 2: IPA expected vs detected with char-level diff */}
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: hasIssue ? 10 : 0, flexWrap: "wrap" }}>
                              <div className="ep-tier ep-speak-ipa-chip" data-tier="high">
                                <span className="ep-speak-ipa-chip-label">Cible</span>
                                <span className="ep-speak-ipa-chip-text">{w.expectedIpa}</span>
                              </div>
                              {ipaChars && (
                                <>
                                  <span style={{ color: "var(--mm-fg-muted)", fontSize: 14 }}>→</span>
                                  <div className="ep-tier ep-speak-ipa-chip" data-tier={t}>
                                    <span className="ep-speak-ipa-chip-label">Toi</span>
                                    <span className="ep-speak-ipa-chip-text">
                                      {ipaChars.map((c, ci) => (
                                        <span key={ci} style={{ color: c.isDiff ? "var(--mm-danger)" : "inherit", fontWeight: c.isDiff ? 700 : 400, textDecoration: c.isDiff ? "underline" : "none" }}>{c.ch}</span>
                                      ))}
                                    </span>
                                  </div>
                                </>
                              )}
                              {/* Score bar inline */}
                              <div className="ep-speak-score-track">
                                <div className="ep-speak-score-fill" style={{ width: `${score}%` }} />
                              </div>
                            </div>

                            {/* Row 3: issue + tip */}
                            {hasIssue && (
                              <div className="ep-speak-issue-row">
                                <span className="ep-speak-issue-label"><AlertTriangle size={13} strokeWidth={2} /> {w.issue}</span>
                                {w.tip && w.tip !== "null" && <span style={{ color: "var(--mm-fg-muted)" }}>— {w.tip}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* ─── Strong points + global advice ─── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
                      {practicePhonemeData.strongPoints && (
                        <div className="ep-tier ep-speak-note" data-tier="high">
                          <CheckCircle2 size={16} strokeWidth={2} />
                          <span><strong>Points forts —</strong> {practicePhonemeData.strongPoints}</span>
                        </div>
                      )}
                      <div className="ep-speak-note ep-speak-note--neutral">
                        <Lightbulb size={16} strokeWidth={2} />
                        <span><strong>Conseil —</strong> {practicePhonemeData.globalAdvice}</span>
                      </div>
                    </div>

                    {/* Rejouer */}
                    <button onClick={startSpeakingRecording} className="mm-btn mm-btn-primary ep-speak-retry-btn">
                      <RotateCcw size={16} strokeWidth={2} /> Réessayer
                    </button>
                  </>
                );
              })()}

            </div>
          </div>
        )
      }

      {/* ══ IELTS SIMULATION ══ */}
      {
        practiceSubView === "ielts" && (
          <div style={{ position: "relative", background: "var(--mm-bg-card)", borderRadius: 24, padding: 24, border: "1px solid var(--mm-border)", overflow: "hidden", boxShadow: "var(--mm-shadow)" }}>
            <h2 style={{ marginTop: 0 }}>🎓 IELTS Speaking Simulation</h2>
            <button onClick={startIeltsSimulation} style={{ padding: "12px 24px", background: "var(--mm-grad-aurora)", color: "white", border: "none", borderRadius: 10, fontWeight: 800, marginBottom: 16 }}>Démarrer la simulation</button>
            <div style={{ maxHeight: 400, overflowY: "auto", marginBottom: 12 }}>
              {(customAgent.isConnected && liveKitTranscriptions.length > 0
                ? liveKitTranscriptions.map(m => ({ role: m.role === "user" ? "candidate" : "examiner", text: m.text, id: m.id }))
                : practiceIeltsHistory
              ).map((entry, i) => (
                <div key={entry.id || i} style={{ marginBottom: 10, textAlign: entry.role === "candidate" ? "right" : "left" }}>
                  <div style={{ display: "inline-block", padding: "10px 18px", borderRadius: 16, background: entry.role === "candidate" ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : "#E5E7EB", color: entry.role === "candidate" ? "white" : "#1F2937", maxWidth: "80%" }}>
                    {entry.text}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(139, 92, 246,0.05)"}`, background: isDarkMode ? "rgba(10,15,30,0.6)" : "rgba(255,255,255,0.6)", backdropFilter: "blur(20px)", margin: "16px -24px -24px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 8,
                  background: customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.05)" : "#F0FDF4") : theme.inputBg,
                  border: `2px solid ${customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.3)" : "#86EFAC") : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(139, 92, 246,0.1)")}`,
                  borderRadius: 18, padding: "6px 8px 6px 18px", transition: "all 0.3s"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: customAgent.isConnected ? "#10B981" : (isDarkMode ? "var(--mm-fg)" : "var(--mm-fg-muted)"),
                      boxShadow: customAgent.isConnected ? "0 0 10px #10B981" : "none",
                      animation: customAgent.isConnected ? "pulse 1.5s infinite" : "none"
                    }} />
                    {customAgent.isConnected && (
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#10B981", whiteSpace: "nowrap" }} className="hide-mobile">
                        {customAgent.isSpeaking ? "🗣️ Parle" : "👂 T'écoute"}
                      </span>
                    )}
                  </div>
                  <input value={customAgent.isConnected ? "" : practiceInput} onChange={e => { if (customAgent.isConnected) return; setPracticeInput(e.target.value); }} onKeyDown={e => { if (customAgent.isConnected || e.key !== "Enter" || !practiceInput.trim()) return; answerIelts(practiceInput); setPracticeInput(""); }} placeholder={customAgent.isConnected ? "Parle directement dans le micro..." : "Ou tape ta réponse..."} disabled={customAgent.isConnected} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: theme.text, fontSize: 15, fontWeight: 500, minWidth: 0 }} />
                  <AgentVoiceBar
                    agent={agent}
                    variant="minimal"
                    onStart={() => {
                      armIosAudio();
                      setPracticeIeltsHistory([]);
                      setLiveKitTranscriptions([]);
                      setAgentTranscript([]);
                      setAgentError("");
                      agent.start(MODE_CONFIGS.ielts({ part: practiceIeltsPart }));
                    }}
                    theme={theme}
                    isDarkMode={isDarkMode}
                  />
                </div>
                <button onClick={() => { if (customAgent.isConnected) return; answerIelts(practiceInput); setPracticeInput(""); }} disabled={customAgent.isConnected || !practiceInput.trim()} style={{ width: 50, height: 50, borderRadius: 16, background: (!customAgent.isConnected && practiceInput.trim()) ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary-deep))" : theme.inputBg, border: `1px solid ${!customAgent.isConnected && practiceInput.trim() ? "transparent" : (isDarkMode ? "rgba(255,255,255,0.1)" : "color-mix(in srgb, var(--mm-primary) 15%, transparent)")}`, cursor: (!customAgent.isConnected && practiceInput.trim()) ? "pointer" : "default", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: customAgent.isConnected ? 0.3 : 1, transition: "all 0.3s", boxShadow: (!customAgent.isConnected && practiceInput.trim()) ? "0 8px 20px color-mix(in srgb, var(--mm-primary) 40%, transparent)" : "none", color: (!customAgent.isConnected && practiceInput.trim()) ? "white" : theme.textMuted }}>➤</button>
              </div>
              {agentError && (
                <div style={{ marginTop: 12, padding: "8px 14px", background: "#FEF2F2", color: "#EF4444", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                  {agentError}
                </div>
              )}
            </div>
          </div>
        )
      }

      {/* ══ DASHBOARD ══ */}
      {/* ══ DÉFI QUOTIDIEN ══ */}
      {
        practiceSubView === "daily" && (
          <div style={{ background: "var(--mm-bg-card)", borderRadius: 24, padding: 28, border: "1px solid var(--mm-border)", boxShadow: "var(--mm-shadow)" }}>
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>⭐ Défi du jour</h2>
            <p style={{ color: "var(--mm-fg-muted)", fontSize: 14, marginBottom: 24, marginTop: 0 }}>Un petit exercice ciblé pour progresser chaque jour.</p>

            {!practiceDailyChallenge ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
                <button onClick={loadDailyChallenge} disabled={practiceDailyLoading} style={{ padding: "14px 32px", background: "var(--mm-grad-aurora)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: "0 0 15px rgba(124, 58, 237,0.3)" }}>
                  {practiceDailyLoading ? "⏳ Génération…" : "🎯 Charger le défi"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {/* Badge type */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: "var(--mm-bg-elev)", color: "var(--mm-primary)", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>
                    {{ question: "💬 Question", fillin: "✏️ Compléter", translate: "🌐 Traduire" }[practiceDailyChallenge.type] || "⭐ Défi"}
                  </span>
                </div>

                {/* Prompt */}
                <div style={{ background: theme.inputBg, borderRadius: 16, padding: "20px 22px", fontSize: 17, fontWeight: 700, color: theme.text, lineHeight: 1.6 }}>
                  {practiceDailyChallenge.prompt}
                </div>

                {/* Hint */}
                {practiceDailyChallenge.hint && !practiceDailyResult && (
                  <details style={{ fontSize: 13, color: theme.textMuted }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>💡 Voir un indice</summary>
                    <div style={{ marginTop: 8, padding: "10px 14px", background: isDarkMode ? "#1A1200" : "#FFFBEB", borderRadius: 10, color: isDarkMode ? "#FCD34D" : "#92400E" }}>{practiceDailyChallenge.hint}</div>
                  </details>
                )}

                {/* Input réponse */}
                {!practiceDailyResult && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      value={practiceDailyAnswer}
                      onChange={e => setPracticeDailyAnswer(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && checkDailyAnswer()}
                      placeholder="Ta réponse en anglais…"
                      style={{ flex: 1, padding: "14px 18px", borderRadius: 14, border: `2px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 15 }}
                    />
                    <button onClick={checkDailyAnswer} disabled={!practiceDailyAnswer.trim()} style={{ padding: "14px 24px", background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
                      ✓ Vérifier
                    </button>
                  </div>
                )}

                {/* Résultat */}
                {practiceDailyResult && (
                  <div style={{ borderRadius: 16, padding: "18px 22px", background: practiceDailyResult.correct ? (isDarkMode ? "#052E16" : "#F0FDF4") : (isDarkMode ? "#2D0A0A" : "#FEF2F2"), border: `2px solid ${practiceDailyResult.correct ? "#22C55E" : "#EF4444"}` }}>
                    <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8, color: practiceDailyResult.correct ? "#22C55E" : "#EF4444" }}>
                      {practiceDailyResult.correct ? "✅ Correct !" : "❌ Pas tout à fait…"}
                    </div>
                    {practiceDailyResult.feedback && (
                      <div style={{ fontSize: 14, color: theme.text, marginBottom: 8 }}>{practiceDailyResult.feedback}</div>
                    )}
                    {!practiceDailyResult.correct && (
                      <div style={{ fontSize: 13, color: theme.textMuted }}>
                        Réponse attendue : <strong style={{ color: theme.text }}>{practiceDailyResult.correctAnswer}</strong>
                      </div>
                    )}
                    {/* Badge qualité */}
                    {practiceDailyResult.quality && (
                      <div style={{ marginTop: 10, fontSize: 11, color: theme.textMuted }}>
                        {{ exact: "🎯 Correspondance exacte", accepted: "✔️ Variante acceptée", typo: "⌨️ Faute de frappe tolérée", ai: "🤖 Évalué par l'IA", wrong: "" }[practiceDailyResult.quality]}
                      </div>
                    )}
                  </div>
                )}

                {/* Nouveau défi */}
                <button onClick={() => { setPracticeDailyChallenge(null); setPracticeDailyAnswer(""); setPracticeDailyResult(null); loadDailyChallenge(); }} disabled={practiceDailyLoading} style={{ alignSelf: "flex-start", padding: "10px 20px", background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.text, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                  {practiceDailyLoading ? "⏳" : "🔀 Nouveau défi"}
                </button>
              </div>
            )}
          </div>
        )
      }

      {
        practiceSubView === "dashboard" && (() => {
          const XP_LVLS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 5800, 8000];
          const getLvl = (x) => { let l = 0; for (let i = 0; i < XP_LVLS.length; i++) { if (x >= XP_LVLS[i]) l = i; } return l; };
          const getLbl = (l) => ["Novice", "Apprentice", "Explorer", "Conversant", "Fluent", "Advanced", "Expert", "Master", "Grand Master", "Legend", "GOD"][Math.min(l, 10)];
          const xp = practiceStats.xp || 0;
          const lvl = getLvl(xp);
          return (
            <div style={{ background: "var(--mm-bg-card)", borderRadius: 24, padding: 24, border: "1px solid var(--mm-border)", boxShadow: "var(--mm-shadow)" }}>
              <h2 style={{ marginTop: 0 }}>📊 Progression</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 14, marginBottom: 20 }}>
                {[
                  { icon: "⚡", val: xp.toLocaleString(), label: "Total XP", color: "#F59E0B" },
                  { icon: "🔥", val: practiceStats.streak || 0, label: "Streak (jours)", color: "#EF4444" },
                  { icon: "🪙", val: (practiceStats.coins || 0).toLocaleString(), label: "Coins", color: "#FCD34D" },
                  { icon: "🏅", val: `Lv.${lvl}`, label: getLbl(lvl), color: "var(--mm-primary-glow)" },
                  { icon: "💬", val: practiceStats.totalMessages, label: "Messages", color: "var(--mm-primary)" },
                  { icon: "🎓", val: practiceStats.sessionsCompleted, label: "Sessions", color: "var(--mm-primary)" },
                  { icon: "📖", val: practiceStats.levelEstimate, label: "Niveau estimé", color: "var(--mm-primary)" },
                  { icon: "📚", val: practiceStats.vocabDiversity || 0, label: "Mots uniques", color: "#059669" },
                ].map(({ icon, val, label, color }) => (
                  <div key={label} style={{ background: theme.inputBg, borderRadius: 14, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color }}>{val}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()
      }

      {/* ══ ACHIEVEMENTS ══ */}
      {
        practiceSubView === "achievements" && (
          <div style={{ background: "var(--mm-bg-card)", borderRadius: 24, padding: 24, border: "1px solid var(--mm-border)", boxShadow: "var(--mm-shadow)" }}>
            <h2 style={{ marginTop: 0 }}>🏆 Succès</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12 }}>
              {[
                { id: "write5", icon: "📝", label: "Écrivain en herbe", desc: "5 essais corrigés" },
                { id: "speak100", icon: "🎙️", label: "Orateur", desc: "100 phrases enregistrées" },
                { id: "ielts7", icon: "🎓", label: "IELTS Master", desc: "Score ≥ 7" },
              ].map(a => {
                const unlocked = practiceAchievements.includes(a.id);
                return (
                  <div key={a.id} style={{ background: unlocked ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)", borderRadius: 14, padding: 16, opacity: unlocked ? 1 : 0.6 }}>
                    <div style={{ fontSize: 24 }}>{a.icon}</div>
                    <div style={{ fontWeight: 800 }}>{a.label}</div>
                    <div style={{ fontSize: 12 }}>{a.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      }

      {/* ══ DÉBAT ══ */}
      {
        practiceSubView === "debate" && (
          <div
            className="ep-glass-panel"
            style={{
              position: "relative", borderRadius: 24,
              border: `1px solid ${isDarkMode ? "rgba(99, 102, 241, 0.4)" : "rgba(59, 130, 246, 0.35)"}`,
              overflow: "hidden",
              background: isDarkMode
                ? "radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.2), transparent 70%), var(--mm-bg-elev, #0b0d1e)"
                : "radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.12), transparent 70%), #FFFFFF",
              boxShadow: isDarkMode ? "0 16px 40px rgba(0,0,0,0.4)" : "0 10px 30px rgba(37, 99, 235, 0.08)",
              transition: "background 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
              animation: debateShatter > 0 && Date.now() - debateShatter < 1000 ? "shake-ring 0.4s" : "none"
            }}
          >

            {/* Shatter Overlay */}
            {debateShatter > 0 && (
              <div key={debateShatter} style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none", animation: "shatter-flash 1s forwards" }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M0,0 L50,50 L100,0 M0,100 L50,50 L100,100 M20,0 L50,50 L80,100 M0,30 L50,50 L100,70 M30,100 L50,50 L70,0" stroke="rgba(255,255,255,0.9)" strokeWidth="0.5" fill="none" style={{ animation: "shatter-cracks 0.3s forwards" }} />
                </svg>
              </div>
            )}

            {/* LiveKitVoiceAssistant moved to root */}
            <div style={{
              position: "relative", zIndex: 1,
              background: isDarkMode
                ? "linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(99, 102, 241, 0.35))"
                : "linear-gradient(135deg, rgba(37, 99, 235, 0.14), rgba(59, 130, 246, 0.22))",
              padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
              backdropFilter: "blur(16px)",
              borderBottom: `1px solid ${isDarkMode ? "rgba(99, 102, 241, 0.35)" : "rgba(59, 130, 246, 0.25)"}`
            }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 20, color: theme.text }}>🌌 Cosmic Arena Debate</div>
                {practiceDebateTopic && <div style={{ fontSize: 12, color: isDarkMode ? "#93C5FD" : "#1D4ED8", marginTop: 2, fontWeight: 700 }}>Topic : {practiceDebateTopic}</div>}
              </div>
              <button onClick={() => { if (customAgent.isConnected) agent.stop(); setPracticeDebateTopic(""); setPracticeDebateHistory([]); setDebateBalance(50); }} style={{ background: isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)", border: "none", borderRadius: 10, padding: "6px 14px", color: theme.text, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>↺ Reset</button>
            </div>
            {!practiceDebateTopic && !customAgent.isConnected && (
              <div style={{ padding: 28, position: "relative", zIndex: 1 }}>
                <p style={{ color: "var(--mm-fg)", marginTop: 0, marginBottom: 20, fontSize: 14, fontWeight: 700 }}>Choisis un sujet de débat. L'IA va te challenger en anglais. Chaque argument fort fait reculer ton adversaire !</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {["Social media does more harm than good", "AI will replace human jobs", "Remote work is better than office", "Climate change is the biggest threat", "Video games improve cognitive skills"].map(topic => (
                    <button
                      key={topic}
                      onClick={() => startDebate(topic)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 20,
                        border: `2px solid ${practiceDebateTopic === topic ? "#2563EB" : "var(--mm-border)"}`,
                        background: practiceDebateTopic === topic ? "#2563EB" : "var(--mm-bg-card)",
                        color: practiceDebateTopic === topic ? "white" : "var(--mm-fg)",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: 13,
                        transition: "all 0.2s ease",
                        boxShadow: practiceDebateTopic === topic ? "0 4px 15px rgba(37, 99, 235, 0.4)" : "none"
                      }}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={practiceDebateTopic}
                    onChange={e => setPracticeDebateTopic(e.target.value)}
                    placeholder="Ou tape ton propre sujet…"
                    style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `2px solid var(--mm-border)`, background: "var(--mm-bg-elev)", color: "var(--mm-fg)", fontSize: 14, outline: "none" }}
                    onKeyDown={e => e.key === "Enter" && startDebate(practiceDebateTopic)}
                    onFocus={e => e.target.style.borderColor = "#2563EB"}
                    onBlur={e => e.target.style.borderColor = "var(--mm-border)"}
                  />
                  <button
                    onClick={() => startDebate(practiceDebateTopic)}
                    disabled={!practiceDebateTopic.trim()}
                    style={{
                      padding: "12px 24px",
                      background: !practiceDebateTopic.trim()
                        ? "rgba(37, 99, 235, 0.45)"
                        : "linear-gradient(135deg, #2563EB, #1D4ED8)",
                      color: "white",
                      border: "none",
                      borderRadius: 12,
                      fontWeight: 900,
                      cursor: !practiceDebateTopic.trim() ? "not-allowed" : "pointer",
                      boxShadow: !practiceDebateTopic.trim() ? "none" : "0 4px 15px rgba(37, 99, 235, 0.45)",
                      transition: "all 0.2s ease"
                    }}
                  >
                    ⚔️ Engage!
                  </button>
                </div>
              </div>
            )}
            {(practiceDebateTopic || customAgent.isConnected || practiceDebateHistory.length > 0) && (
              <>
                <div style={{ maxHeight: 380, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, position: "relative", zIndex: 1 }}>
                  {(customAgent.isConnected && liveKitTranscriptions.length > 0
                    ? liveKitTranscriptions.map(m => ({ role: m.role === "user" ? "user" : "assistant", text: m.text, id: m.id, isFinal: m.isFinal }))
                    : practiceDebateHistory
                  ).map((msg, i) => (
                    <div key={msg.id || i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-end" }}>
                      {msg.role === "assistant" && <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#BE123C,#E11D48)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, boxShadow: "0 4px 10px rgba(225, 29, 72, 0.4)" }}>🤖</div>}
                      <div style={{ maxWidth: "78%", padding: "14px 18px", borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px", background: msg.role === "user" ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : "linear-gradient(135deg,#BE123C,#E11D48)", color: "white", fontSize: 15, lineHeight: 1.6, boxShadow: msg.role === "user" ? "0 4px 15px rgba(147, 51, 234, 0.4)" : "0 4px 15px rgba(225, 29, 72, 0.4)", opacity: msg.isFinal === false ? 0.7 : 1 }}>
                        {msg.role === "assistant" ? renderDraggableWord(msg.text) : msg.text}
                        {msg.isFinal === false && <span style={{ marginLeft: 4, opacity: 0.7, animation: "pulse 1.5s infinite" }}>…</span>}
                      </div>
                      {msg.role === "user" && <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, boxShadow: "0 4px 10px rgba(147, 51, 234, 0.4)" }}>🥊</div>}
                    </div>
                  ))}
                  {/* FIX : ancre de scroll manquante — sans elle, practiceEndRef.current
                      reste null en vue Débat (il n'était placé que dans la vue Chat), donc
                      le conteneur (overflowY:auto, maxHeight:380) ne descend jamais tout
                      seul. Résultat : chaque nouvelle réplique de ARGOS/ta réponse arrivait
                      hors-écran en bas, sans auto-scroll — d'où l'impression que "ce qui
                      était en bas" disparaissait pendant la conversation vocale. */}
                  <div ref={practiceEndRef} />
                </div>
                <div style={{ padding: "16px 20px", borderTop: "1px solid var(--mm-border-strong)", background: "var(--mm-bg-overlay)", backdropFilter: "var(--mm-blur)", position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8,
                      background: customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.05)" : "#F0FDF4") : "var(--mm-bg-elev)",
                      border: `2px solid ${customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.3)" : "#86EFAC") : "var(--mm-border-strong)"}`,
                      borderRadius: 18, padding: "6px 8px 6px 18px", transition: "all 0.3s"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: customAgent.isConnected ? "#10B981" : (isDarkMode ? "var(--mm-fg)" : "var(--mm-fg-muted)"),
                          boxShadow: customAgent.isConnected ? "0 0 10px #10B981" : "none",
                          animation: customAgent.isConnected ? "pulse 1.5s infinite" : "none"
                        }} />
                        {customAgent.isConnected && (
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#10B981", whiteSpace: "nowrap" }} className="hide-mobile">
                            {customAgent.isSpeaking ? "🗣️ ARGOS parle" : "👂 T'écoute"}
                          </span>
                        )}
                      </div>
                      <input value={customAgent.isConnected ? "" : practiceInput} onChange={e => { if (customAgent.isConnected) return; setPracticeInput(e.target.value); }} onKeyDown={e => { if (customAgent.isConnected || e.key !== "Enter" || !practiceInput.trim()) return; stopSpeaking(); sendDebateMessage(practiceInput); setPracticeInput(""); }} placeholder={customAgent.isConnected ? "Parle directement dans le micro..." : "Tape ton argument en anglais..."} disabled={customAgent.isConnected} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: theme.text, fontSize: 15, fontWeight: 600, minWidth: 0 }} />
                      <AgentVoiceBar
                        agent={agent}
                        variant="minimal"
                        onStart={() => {
                          armIosAudio();
                          setLiveKitTranscriptions([]);
                          setAgentTranscript([]);
                          setAgentError("");
                          agent.start(MODE_CONFIGS.debate({ topic: practiceDebateTopic || "Free debate", level: practiceLevel }));
                        }}
                        theme={theme}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                    <button onClick={() => { if (customAgent.isConnected) return; stopSpeaking(); sendDebateMessage(practiceInput); setPracticeInput(""); }} disabled={!practiceInput.trim() || customAgent.isConnected} style={{ width: 50, height: 50, borderRadius: 16, background: (practiceInput.trim() && !customAgent.isConnected) ? "linear-gradient(135deg,#2563EB,#1D4ED8)" : theme.inputBg, border: `1px solid ${practiceInput.trim() && !customAgent.isConnected ? "transparent" : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(139, 92, 246,0.1)")}`, cursor: (practiceInput.trim() && !customAgent.isConnected) ? "pointer" : "default", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: customAgent.isConnected ? 0.3 : 1, transition: "all 0.3s", boxShadow: (practiceInput.trim() && !customAgent.isConnected) ? "0 8px 20px rgba(37, 99, 235, 0.4)" : "none", color: (practiceInput.trim() && !customAgent.isConnected) ? "white" : theme.textMuted }}>➤</button>
                  </div>
                  {agentError && (
                    <div style={{ marginTop: 12, padding: "8px 14px", background: "#FEF2F2", color: "#EF4444", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                      {agentError}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )
      }

      {/* ══ ROLEPLAY ══ */}
      {
        practiceSubView === "roleplay" && (
          <div
            className="ep-glass-panel"
            style={{
              position: "relative", borderRadius: 24,
              border: `1px solid ${isDarkMode ? "rgba(139, 92, 246,0.25)" : "rgba(139, 92, 246,0.18)"}`,
              overflow: "hidden",
              boxShadow: isDarkMode ? "0 16px 40px rgba(0,0,0,0.4)" : "0 10px 30px rgba(15,23,42,0.06)"
            }}
          >
            <div style={{
              background: isDarkMode
                ? "linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(139, 92, 246, 0.4))"
                : "linear-gradient(135deg, rgba(238, 242, 255, 0.95), rgba(224, 231, 255, 0.9))",
              padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
              backdropFilter: "blur(16px)",
              borderBottom: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0,0,0,0.08)"}`
            }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 20, color: theme.text }}>🎭 Roleplay en anglais</div>
                {practiceRoleplayScenario && <div style={{ fontSize: 12, color: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 22%, white)" : "var(--mm-primary-deep)", marginTop: 2, fontWeight: 700 }}>Scénario : {practiceRoleplayScenario}</div>}
              </div>
              <button onClick={() => { if (customAgent.isConnected) agent.stop(); setPracticeRoleplayScenario(""); setPracticeRoleplayHistory([]); }} style={{ background: isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)", border: "none", borderRadius: 10, padding: "6px 14px", color: theme.text, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>↺ Reset</button>
            </div>
            {!practiceRoleplayScenario && !customAgent.isConnected && (
              <div style={{ padding: 28 }}>
                <p style={{ color: theme.textMuted, marginTop: 0, marginBottom: 20, fontSize: 14, fontWeight: 600 }}>Choisis un scénario. L'IA joue le rôle de l'autre personnage. Tu pratiques l'anglais en situation réelle.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 14, marginBottom: 24 }}>
                  {[
                    { scenario: "Job interview at a tech company", icon: "💼", label: "Entretien tech" },
                    { scenario: "At the doctor's office", icon: "🏥", label: "Chez le médecin" },
                    { scenario: "Negotiating a salary raise", icon: "💰", label: "Négociation salaire" },
                    { scenario: "Ordering at a restaurant", icon: "🍽️", label: "Au restaurant" },
                    { scenario: "Presenting a project to a client", icon: "📊", label: "Présentation client" },
                    { scenario: "Dealing with a difficult customer", icon: "😤", label: "Client difficile" },
                  ].map(({ scenario, icon, label }) => {
                    const isSelected = practiceRoleplayScenario === scenario;
                    return (
                      <button
                        key={scenario}
                        onClick={() => beginRoleplayScenario(scenario)}
                        className="ep-glass-panel ep-glass-panel-hover"
                        style={{
                          padding: "16px 16px", borderRadius: 16,
                          border: `2px solid ${isSelected ? "var(--mm-primary)" : (isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)")}`,
                          background: isSelected
                            ? (isDarkMode ? "rgba(139, 92, 246,0.2)" : "rgba(139, 92, 246,0.1)")
                            : (isDarkMode ? "rgba(15,23,42,0.4)" : "#FFFFFF"),
                          color: theme.text, fontWeight: 700, cursor: "pointer", textAlign: "left",
                          display: "flex", flexDirection: "column", gap: 6, transition: "all 0.22s ease",
                          boxShadow: isSelected ? "0 8px 20px rgba(139, 92, 246,0.25)" : "none"
                        }}
                      >
                        <span style={{ fontSize: 26 }}>{icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 800 }}>{label}</span>
                        <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 500, lineHeight: 1.4 }}>{scenario}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <input
                    value={practiceRoleplayScenario}
                    onChange={e => setPracticeRoleplayScenario(e.target.value)}
                    placeholder="Ou décris ton propre scénario…"
                    style={{
                      flex: 1, padding: "12px 18px", borderRadius: 14,
                      border: `1.5px solid ${isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                      background: isDarkMode ? "rgba(15,23,42,0.6)" : "#FFFFFF",
                      color: theme.text, fontSize: 14, outline: "none"
                    }}
                    onKeyDown={e => e.key === "Enter" && practiceRoleplayScenario.trim() && beginRoleplayScenario(practiceRoleplayScenario)}
                  />
                  <button
                    onClick={() => beginRoleplayScenario(practiceRoleplayScenario)}
                    disabled={!practiceRoleplayScenario.trim()}
                    style={{
                      padding: "12px 24px",
                      background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))",
                      color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(139, 92, 246,0.35)", transition: "all 0.2s"
                    }}
                  >
                    🎭 Lancer
                  </button>
                </div>
              </div>
            )}
            {(practiceRoleplayScenario || customAgent.isConnected || practiceRoleplayHistory.length > 0) && (
              <>
                <div style={{ maxHeight: 380, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {(customAgent.isConnected && liveKitTranscriptions.length > 0
                    ? liveKitTranscriptions.map(m => ({ role: m.role === "user" ? "user" : "assistant", text: m.text, id: m.id, isFinal: m.isFinal }))
                    : practiceRoleplayHistory
                  ).map((msg, i) => (
                    <div key={msg.id || i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-end" }}>
                      {msg.role === "assistant" && <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🎭</div>}
                      <div style={{ maxWidth: "78%", padding: "12px 16px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : theme.inputBg, color: msg.role === "user" ? "white" : theme.text, fontSize: 14, lineHeight: 1.6, opacity: msg.isFinal === false ? 0.7 : 1 }}>
                        {msg.text}
                        {msg.isFinal === false && <span style={{ marginLeft: 4, opacity: 0.7, animation: "pulse 1.5s infinite" }}>…</span>}
                      </div>
                      {msg.role === "user" && <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>😊</div>}
                    </div>
                  ))}
                  {/* FIX : même bug que la vue Débat — practiceEndRef n'était jamais posé
                      ici, donc le conteneur (overflowY:auto, maxHeight:380) ne descendait
                      jamais automatiquement vers la nouvelle réplique. */}
                  <div ref={practiceEndRef} />
                </div>
                <div style={{ padding: "16px 20px", borderTop: "1px solid var(--mm-border-strong)", background: "var(--mm-bg-overlay)", backdropFilter: "var(--mm-blur)" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8,
                      background: customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.05)" : "#F0FDF4") : "var(--mm-bg-elev)",
                      border: `2px solid ${customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.3)" : "#86EFAC") : "var(--mm-border-strong)"}`,
                      borderRadius: 18, padding: "6px 8px 6px 18px", transition: "all 0.3s"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: customAgent.isConnected ? "#10B981" : (isDarkMode ? "var(--mm-fg)" : "var(--mm-fg-muted)"),
                          boxShadow: customAgent.isConnected ? "0 0 10px #10B981" : "none",
                          animation: customAgent.isConnected ? "pulse 1.5s infinite" : "none"
                        }} />
                        {customAgent.isConnected && (
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#10B981", whiteSpace: "nowrap" }} className="hide-mobile">
                            {customAgent.isSpeaking ? "🗣️ Parle" : "👂 T'écoute"}
                          </span>
                        )}
                      </div>
                      <input value={customAgent.isConnected ? "" : practiceInput} onChange={e => { if (customAgent.isConnected) return; setPracticeInput(e.target.value); }} onKeyDown={e => { if (customAgent.isConnected || e.key !== "Enter" || !practiceInput.trim()) return; stopSpeaking(); sendRoleplayMessage(practiceInput); setPracticeInput(""); }} placeholder={customAgent.isConnected ? "Parle directement dans le micro..." : "Tape ta réponse…"} disabled={customAgent.isConnected} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: theme.text, fontSize: 15, fontWeight: 500, minWidth: 0 }} />
                      <AgentVoiceBar
                        agent={agent}
                        variant="minimal"
                        onStart={() => {
                          armIosAudio();
                          setLiveKitTranscriptions([]);
                          setAgentTranscript([]);
                          setAgentError("");
                          agent.start(MODE_CONFIGS.roleplay({
                            scenario: practiceRoleplayScenario || "Free roleplay",
                            character: practiceRoleplayCharacter || "the other person in the scenario",
                            level: practiceLevel,
                          }));
                        }}
                        theme={theme}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                    <button onClick={() => { if (customAgent.isConnected) return; stopSpeaking(); sendRoleplayMessage(practiceInput); setPracticeInput(""); }} disabled={!practiceInput.trim() || customAgent.isConnected} style={{ width: 50, height: 50, borderRadius: 16, background: (practiceInput.trim() && !customAgent.isConnected) ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary-deep))" : theme.inputBg, border: `1px solid ${practiceInput.trim() && !customAgent.isConnected ? "transparent" : (isDarkMode ? "rgba(255,255,255,0.1)" : "color-mix(in srgb, var(--mm-primary) 15%, transparent)")}`, cursor: (practiceInput.trim() && !customAgent.isConnected) ? "pointer" : "default", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: customAgent.isConnected ? 0.3 : 1, transition: "all 0.3s", boxShadow: (practiceInput.trim() && !customAgent.isConnected) ? "0 8px 20px color-mix(in srgb, var(--mm-primary) 40%, transparent)" : "none", color: (practiceInput.trim() && !customAgent.isConnected) ? "white" : theme.textMuted }}>➤</button>
                  </div>
                  {agentError && (
                    <div style={{ marginTop: 12, padding: "8px 14px", background: "#FEF2F2", color: "#EF4444", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                      {agentError}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )
      }

      {/* ══ DICTÉE ══ */}
      {
        practiceSubView === "dictation" && (
          <div className="ep-glass-panel ep-lab-panel" style={{ overflow: "hidden" }}>
            <div className="ep-lab-banner">
              <span className="ep-lab-header-icon ep-lab-header-icon--on-banner"><Ear size={20} strokeWidth={2} /></span>
              <div>
                <div className="ep-lab-title ep-lab-title--on-banner">Dictation Lab</div>
                <div className="ep-lab-subtitle ep-lab-subtitle--on-banner">Écoute, transcris, et vérifie ta précision</div>
              </div>
            </div>
            <div style={{ padding: 28 }}>
              <div className="ep-dict-levels">
                {["beginner", "intermediate", "advanced"].map(lvl => {
                  const tier = lvl === "beginner" ? "high" : lvl === "intermediate" ? "mid" : "low";
                  const label = lvl === "beginner" ? "Débutant" : lvl === "intermediate" ? "Intermédiaire" : "Avancé";
                  const isActive = practiceLevel === lvl;
                  return (
                    <button
                      key={lvl}
                      onClick={() => setPracticeLevel(lvl)}
                      className={`ep-tier ep-dict-level-btn${isActive ? " is-active" : ""}`}
                      data-tier={tier}
                    >
                      <span className="ep-dict-level-dot" /> {label}
                    </button>
                  );
                })}
              </div>
              <button onClick={startDictation} disabled={practiceDictationLoading} className="mm-btn mm-btn-primary ep-dict-generate-btn">
                {practiceDictationLoading
                  ? (<><Loader2 size={16} strokeWidth={2} className="ep-spin" /> Génération en cours…</>)
                  : (<><Shuffle size={16} strokeWidth={2} /> Générer une nouvelle dictée</>)}
              </button>
              {practiceDictationSentences && practiceDictationSentences.length > 0 && practiceDictationScore === null && (
                <>
                  <div className="ep-dict-progress-row">
                    <div className="ep-dict-progress-label">Phrase {practiceDictationCurrentIndex + 1} sur {practiceDictationSentences.length}</div>
                    <div className="ep-dict-progress-chip">
                      {Math.round((practiceDictationCurrentIndex / practiceDictationSentences.length) * 100)}% complété
                    </div>
                  </div>

                  <div className="ep-dict-listen-card">
                    <button
                      onClick={() => {
                        liveKitVoiceBus.interrupt();
                        speakText(practiceDictationSentences[practiceDictationCurrentIndex]);
                      }}
                      className="ep-dict-play-btn"
                      aria-label="Écouter la phrase"
                    >
                      <Volume2 size={30} strokeWidth={2} />
                    </button>
                    <div className="ep-dict-listen-hint">Clique pour écouter la phrase.<br />Tu peux répéter autant de fois que nécessaire, sans pénalité.</div>
                  </div>

                  {practiceDictationCurrentIndex > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div className="ep-lab-eyebrow" style={{ marginBottom: 8 }}>Ton texte jusqu'à présent</div>
                      <div className="ep-dict-history-text">
                        {practiceDictationInputs.slice(0, practiceDictationCurrentIndex).join(" ")}
                      </div>
                    </div>
                  )}

                  <textarea
                    value={practiceDictationInputs[practiceDictationCurrentIndex] || ""}
                    onChange={e => {
                      const newInputs = [...practiceDictationInputs];
                      newInputs[practiceDictationCurrentIndex] = e.target.value;
                      setPracticeDictationInputs(newInputs);
                    }}
                    rows={4}
                    placeholder="Écris uniquement la phrase entendue ici…"
                    className="mm-textarea ep-dict-textarea"
                  />

                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    {practiceDictationCurrentIndex > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          liveKitVoiceBus.interrupt();
                          setPracticeDictationCurrentIndex(prev => prev - 1);
                        }}
                        className="mm-btn ep-dict-prev-btn"
                      >
                        ← Phrase précédente
                      </button>
                    )}
                    {practiceDictationCurrentIndex < practiceDictationSentences.length - 1 ? (
                      <button
                        onClick={() => {
                          liveKitVoiceBus.interrupt();
                          setPracticeDictationCurrentIndex(prev => prev + 1);
                        }}
                        disabled={!(practiceDictationInputs[practiceDictationCurrentIndex] || "").trim()}
                        className="mm-btn mm-btn-primary ep-dict-next-btn"
                      >
                        Phrase suivante <ArrowRight size={16} strokeWidth={2} />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          liveKitVoiceBus.interrupt();
                          checkDictation();
                        }}
                        disabled={!(practiceDictationInputs[practiceDictationCurrentIndex] || "").trim()}
                        className="ep-tier ep-dict-finish-btn"
                        data-tier="high"
                      >
                        <CheckCircle2 size={16} strokeWidth={2} /> Terminer &amp; vérifier la dictée
                      </button>
                    )}
                  </div>
                </>
              )}

              {practiceDictationScore !== null && (() => {
                const scTier = practiceDictationScore >= 80 ? "high" : practiceDictationScore >= 50 ? "mid" : "low";
                const scoreLabel = practiceDictationScore >= 80 ? "Excellent" : practiceDictationScore >= 50 ? "Pas mal" : "Continue";
                return (
                  <div className="ep-tier ep-dict-report" data-tier={scTier}>
                    <div className="ep-dict-report-head">
                      <div className="ep-dict-report-score">{practiceDictationScore}<span className="ep-dict-report-score-unit">%</span></div>
                      <div>
                        <div className="ep-dict-report-verdict">{scoreLabel}</div>
                        <div className="ep-dict-report-caption">Précision de transcription globale</div>
                      </div>
                    </div>
                    <div className="ep-dict-report-body">
                      {renderDictationMistakes()}

                      {practiceDictationFeedback?.mistakes && practiceDictationFeedback.mistakes.length > 0 && (
                        <button onClick={() => importFlashcards(practiceDictationFeedback.mistakes, "dictation", "la Dictée")} className="mm-btn ep-write-btn-sm" style={{ marginTop: 16 }}>
                          <PlusCircle size={14} strokeWidth={2} /> Créer des fiches de révision
                        </button>
                      )}

                      <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
                        <div>
                          <div className="ep-lab-eyebrow" style={{ marginBottom: 8 }}>Ton texte saisi</div>
                          <div className="ep-dict-history-text" style={{ padding: 12, borderRadius: 8, background: "var(--mm-bg-elev)", border: `1px solid ${theme.border}` }}>
                            {practiceDictationInputs.join(" ")}
                          </div>
                        </div>
                        <div>
                          <div className="ep-lab-eyebrow" style={{ marginBottom: 8 }}>Texte original complet attendu</div>
                          <div className="ep-dict-original-text">
                            {practiceDictationText}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )
      }
      {/* ══ VOCABULARY BRAIN MAP ══ */}
      {
        practiceSubView === "brainmap" && (() => {
          const themes = [...new Set(brainMapWords.map(w => w.theme))];
          const filtered = brainMapFilter === "all" ? brainMapWords : brainMapWords.filter(w => w.theme === brainMapFilter);
          const THEME_COLORS = {
            "Business": { glow: "var(--mm-primary)", node: "var(--mm-primary-deep)", text: "color-mix(in srgb, var(--mm-primary) 22%, white)" },
            "Academic": { glow: "#10B981", node: "#064E3B", text: "#A7F3D0" },
            "Daily Life": { glow: "#F97316", node: "#7C2D12", text: "#FED7AA" },
            "Technology": { glow: "var(--mm-primary)", node: "#312E81", text: "#E9D5FF" },
            "Nature": { glow: "#22C55E", node: "#14532D", text: "#BBF7D0" },
            "Social": { glow: "#EC4899", node: "#831843", text: "#FBCFE8" },
            "Other": { glow: "#A8A29E", node: "#1C1917", text: "#D6D3D1" },
          };
          const getColors = (theme) => THEME_COLORS[theme] || THEME_COLORS["Other"];
          const rarityGlow = (r) => r === 3 ? "0 0 18px 6px rgba(250,204,21,0.7), 0 0 40px rgba(250,204,21,0.3)" : r === 2 ? "0 0 10px 3px rgba(139, 92, 246,0.5)" : "none";
          const fontSize = (count, rarity) => Math.min(18, Math.max(10, 10 + count * 1.5 + rarity * 1.5));

          return (
            <div style={{ background: "var(--mm-bg-card)", borderRadius: 24, border: "1px solid var(--mm-border)", overflow: "hidden", boxShadow: "var(--mm-shadow)" }}>
              {/* Header */}
              <div style={{ background: "var(--mm-grad-aurora)", padding: "22px 26px", position: "relative", overflow: "hidden", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ position: "absolute", top: -30, right: -30, fontSize: 120, opacity: 0.07 }}>🧠</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "white" }}>🧠 Vocabulary Brain Map</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 3 }}>Tous tes mots organisés par thème · Les mots rares brillent en or · Clique pour une explication</div>
              </div>

              <div style={{ padding: 20 }}>
                {/* Controls */}
                <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={buildBrainMap}
                    disabled={brainMapLoading}
                    style={{ padding: "10px 22px", background: brainMapLoading ? "var(--mm-bg-elev)" : "var(--mm-grad-aurora)", color: brainMapLoading ? "var(--mm-fg-muted)" : "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: brainMapLoading ? "default" : "pointer", fontSize: 13, boxShadow: brainMapLoading ? "none" : "0 0 15px rgba(124, 58, 237,0.3)" }}
                  >
                    {brainMapLoading ? "⏳ Analyse en cours…" : "✨ Générer / Rafraîchir"}
                  </button>
                  {themes.length > 0 && (
                    <>
                      <button onClick={() => setBrainMapFilter("all")} style={{ padding: "8px 14px", borderRadius: 10, border: `2px solid ${brainMapFilter === "all" ? "var(--mm-primary)" : "var(--mm-border)"}`, background: brainMapFilter === "all" ? "rgba(124, 58, 237,0.1)" : "var(--mm-bg-elev)", color: brainMapFilter === "all" ? "var(--mm-primary)" : "var(--mm-fg)", fontWeight: 700, cursor: "pointer", fontSize: 12, transition: "all 0.2s" }}>Tous</button>
                      {themes.map(t => {
                        const c = getColors(t);
                        return (
                          <button key={t} onClick={() => setBrainMapFilter(t === brainMapFilter ? "all" : t)} style={{ padding: "8px 14px", borderRadius: 10, border: `2px solid ${brainMapFilter === t ? c.glow : "var(--mm-border)"}`, background: brainMapFilter === t ? c.node : "var(--mm-bg-elev)", color: brainMapFilter === t ? c.text : "var(--mm-fg)", fontWeight: 700, cursor: "pointer", fontSize: 12, transition: "all 0.2s" }}>{t}</button>
                        );
                      })}
                    </>
                  )}
                  {brainMapWords.length > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 12, color: theme.textMuted }}>{brainMapWords.length} mots · {Object.entries(brainMapWords.reduce((a, w) => { a[w.rarity] = (a[w.rarity] || 0) + 1; return a; }, {})).map(([r, c]) => `${c} ${r === "3" ? "rares" : r === "2" ? "intermédiaires" : "communs"}`).join(" · ")}</span>
                  )}
                </div>

                {/* Legend */}
                {brainMapWords.length > 0 && (
                  <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: theme.textMuted }}>✨ Rareté :</span>
                    {[["🟡 Or pulsant", "Mot rare (C1/C2)", "#FACC15"], ["🔵 Halo violet", "Intermédiaire (B1/B2)", "var(--mm-primary-glow)"], ["⚪ Standard", "Commun (A1/A2)", "var(--mm-fg-muted)"]].map(([label, desc, col]) => (
                      <span key={label} style={{ fontSize: 11, color: col, fontWeight: 600 }}>{label} <span style={{ color: theme.textMuted, fontWeight: 400 }}>= {desc}</span></span>
                    ))}
                  </div>
                )}

                {brainMapWords.length === 0 && !brainMapLoading && (
                  <div style={{ textAlign: "center", padding: "48px 24px", color: theme.textMuted }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>🧠</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: theme.text, marginBottom: 8 }}>Ton Brain Map est vide</div>
                    <div style={{ fontSize: 14 }}>Pratique l'anglais dans le Chat, Débat, Roleplay ou Écriture, puis clique sur <strong>Générer</strong> pour visualiser ton vocabulaire.</div>
                  </div>
                )}

                {filtered.length > 0 && (
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    {/* SVG Brain Map */}
                    <div
                      style={{ flex: 1, minWidth: 0, position: "relative", borderRadius: 18, overflow: "hidden", background: "var(--mm-bg-elev)", border: "1px solid var(--mm-border)", boxShadow: "inset 0 0 40px rgba(139, 92, 246,0.2)" }}
                      onMouseMove={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setBrainMapMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                      }}
                      onMouseLeave={() => setBrainMapHovered(null)}
                    >
                      <svg viewBox="0 0 800 600" style={{ width: "100%", display: "block" }}>
                        <defs>
                          {Object.entries(THEME_COLORS).map(([t, c]) => (
                            <radialGradient key={t} id={`grd-${t.replace(/\s/g, "-")}`} cx="50%" cy="50%" r="50%">
                              <stop offset="0%" stopColor={c.glow} stopOpacity="0.3" />
                              <stop offset="100%" stopColor={c.glow} stopOpacity="0" />
                            </radialGradient>
                          ))}
                          <filter id="glow-gold">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                          </filter>
                          <filter id="glow-purple">
                            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                          </filter>
                        </defs>

                        <style>{`
                        @keyframes orbit-particle {
                          from { transform: rotate(0deg) translateX(45px); }
                          to   { transform: rotate(360deg) translateX(45px); }
                        }
                        @keyframes float-organic {
                          0%, 100% { transform: translateY(0px) rotate(0deg); }
                          50%      { transform: translateY(-8px) rotate(2deg); }
                        }
                      `}</style>

                        {/* Theme cluster backgrounds */}
                        {themes.filter(t => brainMapFilter === "all" || t === brainMapFilter).map(t => {
                          const words = filtered.filter(w => w.theme === t);
                          if (!words.length) return null;
                          const cx = words.reduce((s, w) => s + w.x, 0) / words.length;
                          const cy = words.reduce((s, w) => s + w.y, 0) / words.length;
                          const c = getColors(t);
                          return (
                            <g key={t}>
                              <circle cx={cx} cy={cy} r={90} fill={`url(#grd-${t.replace(/\s/g, "-")})`} />
                              <text x={cx} y={cy - 72} textAnchor="middle" fill={c.glow} fontSize="11" fontWeight="800" fontFamily="monospace" opacity="0.9" letterSpacing="2">
                                {t.toUpperCase()}
                              </text>
                            </g>
                          );
                        })}

                        {/* Lines from theme center to words */}
                        {themes.filter(t => brainMapFilter === "all" || t === brainMapFilter).map(t => {
                          const words = filtered.filter(w => w.theme === t);
                          if (!words.length) return null;
                          const cx = words.reduce((s, w) => s + w.x, 0) / words.length;
                          const cy = words.reduce((s, w) => s + w.y, 0) / words.length;
                          const c = getColors(t);
                          return words.map((w, i) => (
                            <line key={`${t}-${i}`} x1={cx} y1={cy} x2={w.x} y2={w.y} stroke={c.glow} strokeWidth={w.rarity === 3 ? 1.5 : 0.8} strokeOpacity={0.35} strokeDasharray={w.rarity === 3 ? "none" : "4 4"} />
                          ));
                        })}

                        {/* Word nodes */}
                        {filtered.map((w, i) => {
                          const c = getColors(w.theme);
                          const fs = fontSize(w.count, w.rarity);
                          const isSelected = brainMapSelected?.word === w.word;
                          const isExplaining = brainMapExplaining === w.word;
                          const pulse = w.rarity === 3;
                          const isHovered = brainMapHovered === w.word;
                          const isOtherHovered = brainMapHovered && !isHovered;

                          return (
                            <g key={w.word} transform={`translate(${w.x},${w.y})`}>
                              <g
                                onClick={() => explainWord(w)}
                                onMouseEnter={() => setBrainMapHovered(w.word)}
                                onMouseLeave={() => setBrainMapHovered(null)}
                                style={{
                                  cursor: "pointer",
                                  transition: "all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                                  opacity: isOtherHovered ? 0.2 : 1,
                                  transform: `scale(${isHovered ? 1.2 : 1})`
                                }}
                              >
                                <g style={{ animation: `float-organic ${3 + (i % 2)}s ease-in-out infinite alternate`, animationDelay: `-${i * 0.2}s` }}>
                                  {pulse && (
                                    <>
                                      <circle r={fs * 1.6} fill="rgba(250,204,21,0.15)" style={{ animation: "pulse 2s infinite" }}>
                                        <animate attributeName="r" values={`${fs * 1.4};${fs * 2};${fs * 1.4}`} dur="2s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
                                      </circle>
                                      <g style={{ animation: "orbit-particle 4s linear infinite" }}>
                                        <circle cx={0} cy={0} r={2.5} fill="#FACC15" filter="url(#glow-gold)" />
                                      </g>
                                      <g style={{ animation: "orbit-particle 5s linear infinite reverse", animationDelay: "-1.5s" }}>
                                        <circle cx={0} cy={0} r={1.5} fill="#FDE047" />
                                      </g>
                                    </>
                                  )}
                                  {w.rarity === 2 && <circle r={fs * 1.4} fill="rgba(139, 92, 246,0.12)" />}
                                  <rect
                                    x={-(fs * 3.5)} y={-(fs * 0.9)}
                                    width={fs * 7} height={fs * 1.8}
                                    rx={fs * 0.9}
                                    fill={isSelected ? "#FACC15" : c.node}
                                    stroke={w.rarity === 3 ? "#FACC15" : isSelected ? "#FACC15" : c.glow}
                                    strokeWidth={isSelected ? 2.5 : w.rarity === 3 ? 1.5 : 0.8}
                                    opacity={0.92}
                                    filter={w.rarity === 3 ? "url(#glow-gold)" : w.rarity === 2 ? "url(#glow-purple)" : "none"}
                                  />
                                  <text
                                    textAnchor="middle" dominantBaseline="middle"
                                    fill={isSelected ? "#1C1917" : c.text}
                                    fontSize={fs}
                                    fontWeight={w.rarity === 3 ? "900" : w.rarity === 2 ? "700" : "600"}
                                    fontFamily="'JetBrains Mono', monospace"
                                  >
                                    {isExplaining ? "⏳" : w.word}
                                  </text>
                                  {w.count > 1 && (
                                    <text x={fs * 3} y={-fs * 0.7} textAnchor="middle" fill="#FACC15" fontSize="7" fontWeight="800">{w.count}×</text>
                                  )}
                                </g>
                              </g>
                            </g>
                          );
                        })}
                      </svg>

                      {/* Tooltip Glassmorphism */}
                      {brainMapHovered && (() => {
                        const hw = brainMapWords.find(w => w.word === brainMapHovered);
                        if (!hw) return null;
                        const isNearRight = brainMapMouse.x > 250;
                        return (
                          <div style={{
                            position: 'absolute',
                            left: isNearRight ? brainMapMouse.x - 190 : brainMapMouse.x + 15,
                            top: brainMapMouse.y + 15,
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.85)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: `1px solid ${colorMix(getColors(hw.theme).glow, 38)}`,
                            borderRadius: 16,
                            padding: '14px 18px',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                            pointerEvents: 'none',
                            zIndex: 10,
                            animation: 'fadeUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            minWidth: 160
                          }}>
                            <div style={{ fontWeight: 900, fontSize: 18, color: theme.text, marginBottom: 8 }}>{hw.word}</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, background: getColors(hw.theme).glow + '20', color: getColors(hw.theme).glow, padding: '3px 10px', borderRadius: 8 }}>{hw.theme}</span>
                              <span style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted }}>{hw.level}</span>
                            </div>
                            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 12, fontStyle: 'italic', fontWeight: 600 }}>
                              ✨ Clique pour générer l'explication
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Word detail panel */}
                    {brainMapSelected && (
                      <div style={{ width: 240, flexShrink: 0, background: "var(--mm-bg-elev)", borderRadius: 18, border: `1.5px solid ${colorMix(getColors(brainMapSelected.theme).glow, 25)}`, overflow: "hidden", boxShadow: "var(--mm-shadow)" }}>
                        {/* Panel header */}
                        <div style={{ background: getColors(brainMapSelected.theme).node, padding: "14px 18px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ fontWeight: 900, fontSize: 20, color: "white", letterSpacing: -0.5 }}>{brainMapSelected.word}</div>
                            <button onClick={() => setBrainMapSelected(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, color: "white", cursor: "pointer", fontSize: 16, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(255,255,255,0.15)", color: "white", padding: "3px 8px", borderRadius: 20 }}>{brainMapSelected.theme}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, background: brainMapSelected.rarity === 3 ? "#FACC15" : brainMapSelected.rarity === 2 ? "var(--mm-primary-glow)" : "rgba(255,255,255,0.1)", color: brainMapSelected.rarity === 3 ? "#1C1917" : "white", padding: "3px 8px", borderRadius: 20 }}>
                              {brainMapSelected.level} · {brainMapSelected.rarity === 3 ? "✨ Rare" : brainMapSelected.rarity === 2 ? "🔵 Intermédiaire" : "⚪ Commun"}
                            </span>
                          </div>
                        </div>

                        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                          {brainMapSelected.definition === null ? (
                            <div style={{ textAlign: "center", padding: "20px 0" }}>
                              <div style={{ fontSize: 24, animation: "pulse 1s infinite" }}>⏳</div>
                              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>Chargement de l'explication…</div>
                            </div>
                          ) : (
                            <>
                              {brainMapSelected.definition && (
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, letterSpacing: 2, marginBottom: 4 }}>DÉFINITION</div>
                                  <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6 }}>{brainMapSelected.definition}</div>
                                </div>
                              )}
                              {brainMapSelected.example && (
                                <div style={{ background: isDarkMode ? "#1E1040" : "color-mix(in srgb, var(--mm-primary) 10%, white)", borderRadius: 12, padding: "10px 14px" }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: getColors(brainMapSelected.theme).glow, letterSpacing: 2, marginBottom: 4 }}>EXEMPLE</div>
                                  <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.5, fontStyle: "italic" }}>"{brainMapSelected.example}"</div>
                                  <button onClick={() => speakText(brainMapSelected.example)} style={{ marginTop: 6, background: "none", border: "none", color: getColors(brainMapSelected.theme).glow, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0 }}>🔊 Écouter</button>
                                </div>
                              )}
                              {brainMapSelected.synonyms?.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, letterSpacing: 2, marginBottom: 4 }}>SYNONYMES</div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {brainMapSelected.synonyms.map(s => (
                                      <span key={s} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}` }}>{s}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {brainMapSelected.tip && (
                                <div style={{ background: isDarkMode ? "#2D1B00" : "#FFFBEB", borderRadius: 12, padding: "10px 14px", border: "1px solid #FCD34D30" }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B", letterSpacing: 2, marginBottom: 4 }}>💡 CONSEIL MÉMO</div>
                                  <div style={{ fontSize: 12, color: isDarkMode ? "#FDE68A" : "#92400E", lineHeight: 1.5 }}>{brainMapSelected.tip}</div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()
      }



      {/* ══ CARNET ANGLAIS ══ */}
      {
        practiceSubView === "notebook" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* ── Header ── */}
            <div style={{ background: isDarkMode ? "linear-gradient(135deg,var(--mm-bg-elev),var(--mm-bg-elev))" : "linear-gradient(135deg,var(--mm-bg-elev),var(--mm-bg-elev))", borderRadius: 24, padding: "24px 28px", border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📓</div>
              <div style={{ fontWeight: 900, fontSize: 22, color: theme.text, marginBottom: 6 }}>Mon Carnet d'Anglais</div>
              <div style={{ fontSize: 14, color: theme.textMuted, lineHeight: 1.6 }}>
                Note ce que tu as appris aujourd'hui — vocabulaire, grammaire, expressions — et génère des fiches de révision en un clic.
              </div>
            </div>

            {/* ── Zone de saisie ── */}
            <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}` }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: theme.text, marginBottom: 14 }}>✏️ Ce que j'ai appris</div>

              {/* Type selector */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {[
                  { id: "auto", label: "🤖 Auto" },
                  { id: "vocab", label: "📖 Vocabulaire" },
                  { id: "grammar", label: "📐 Grammaire" },
                  { id: "idioms", label: "💬 Idiomes" },
                  { id: "phrases", label: "🗣️ Phrases" },
                ].map(t => (
                  <button key={t.id} onClick={() => setNotebookType(t.id)} style={{
                    padding: "7px 14px", borderRadius: 10,
                    background: notebookType === t.id ? (isDarkMode ? "var(--mm-primary)" : "var(--mm-primary)") : theme.inputBg,
                    color: notebookType === t.id ? "white" : theme.text,
                    border: `1.5px solid ${notebookType === t.id ? "var(--mm-primary)" : theme.border}`,
                    fontWeight: 700, fontSize: 12, cursor: "pointer"
                  }}>{t.label}</button>
                ))}
              </div>

              {/* Text area */}
              <textarea
                value={notebookText}
                onChange={e => setNotebookText(e.target.value)}
                placeholder={`Écris librement ici ce que tu as appris...\n\nExemples :\n• "to reckon" = estimer, penser → "I reckon it'll rain"\n• Règle : Present Perfect → action dans le passé avec impact maintenant\n• "break a leg" = bonne chance\n• "I'm on my way" = je suis en route`}
                rows={10}
                style={{
                  width: "100%", padding: "16px 18px",
                  borderRadius: 16, border: `2px solid ${theme.border}`,
                  background: theme.inputBg, color: theme.text,
                  fontSize: 14, lineHeight: 1.7, resize: "vertical",
                  fontFamily: "inherit", boxSizing: "border-box",
                  outline: "none", transition: "border-color 0.2s"
                }}
                onFocus={e => e.target.style.borderColor = "var(--mm-primary)"}
                onBlur={e => e.target.style.borderColor = theme.border}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 12, color: theme.textMuted }}>{notebookText.length} caractères</span>
                <button onClick={() => setNotebookText("")} style={{ fontSize: 12, color: theme.textMuted, background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 8 }}>🗑️ Effacer</button>
              </div>

              {/* Catégorie destination */}
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600, whiteSpace: "nowrap" }}>📁 Module :</span>
                <select
                  value={notebookCategory}
                  onChange={e => setNotebookCategory(e.target.value)}
                  style={{ flex: 1, padding: "9px 14px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 13, fontWeight: 700 }}
                >
                  {/* ✅ FIX : afficher les vrais modules MemoMaster au lieu d'options hardcodées */}
                  {(categories && categories.length > 0) ? (
                    categories.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))
                  ) : (
                    <option value={englishCategory}>{englishCategory}</option>
                  )}
                </select>
              </div>

              {/* CTA */}
              <button
                onClick={generateNotebookCards}
                disabled={notebookLoading || !notebookText.trim()}
                style={{
                  marginTop: 16, width: "100%", padding: "16px",
                  background: notebookLoading || !notebookText.trim()
                    ? (isDarkMode ? "#1F1F1F" : "#E5E7EB")
                    : "linear-gradient(135deg,var(--mm-primary),var(--mm-primary),var(--mm-primary))",
                  color: notebookLoading || !notebookText.trim() ? theme.textMuted : "white",
                  border: "none", borderRadius: 16, fontWeight: 900, fontSize: 16,
                  cursor: notebookLoading || !notebookText.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  boxShadow: notebookLoading || !notebookText.trim() ? "none" : "0 4px 20px rgba(139, 92, 246,0.4)"
                }}
              >
                {notebookLoading ? "⏳ L'IA génère tes fiches…" : "✨ Générer mes fiches de révision"}
              </button>
            </div>

            {/* ── Preview des fiches générées ── */}
            {notebookCards.length > 0 && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `2px solid color-mix(in srgb, var(--mm-primary) 25%, transparent)` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16, color: theme.text }}>
                      🃏 {notebookCards.length} fiche{notebookCards.length > 1 ? "s" : ""} générée{notebookCards.length > 1 ? "s" : ""}
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>Vérifie et ajoute à MemoMaster</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {["vocab", "grammar", "idiom", "phrase"].map(tag => {
                      const count = notebookCards.filter(c => c.tag === tag).length;
                      if (!count) return null;
                      const colors = { vocab: "var(--mm-primary)", grammar: "var(--mm-primary)", idiom: "#F59E0B", phrase: "#10B981" };
                      const labels = { vocab: "Vocab", grammar: "Gram.", idiom: "Idiome", phrase: "Phrase" };
                      return (
                        <span key={tag} style={{ fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 8, background: `${colorMix(colors[tag], 13)}`, color: colors[tag] }}>
                          {labels[tag]} ×{count}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Cards list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  {notebookCards.map((card, i) => {
                    const tagColors = { vocab: "var(--mm-primary)", grammar: "var(--mm-primary)", idiom: "#F59E0B", phrase: "#10B981" };
                    const tc = tagColors[card.tag] || "var(--mm-fg)";
                    return (
                      <div key={i} style={{ background: isDarkMode ? "#0F0F0F" : "#F9FAFB", borderRadius: 16, padding: "16px 20px", border: `1.5px solid ${tc}30`, position: "relative" }}>
                        <div style={{ position: "absolute", top: 12, right: 14, fontSize: 10, fontWeight: 800, color: tc, background: `${tc}15`, padding: "3px 8px", borderRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                          {card.tag || "vocab"}
                        </div>
                        <div style={{ fontWeight: 900, fontSize: 16, color: theme.text, marginBottom: 6, paddingRight: 60 }}>{card.front}</div>
                        <div style={{ fontSize: 14, color: isDarkMode ? "#C4B5FD" : "var(--mm-primary-deep)", fontWeight: 700, marginBottom: card.example ? 8 : 0 }}>{card.back}</div>
                        {card.example && (
                          <div style={{ fontSize: 12, color: theme.textMuted, fontStyle: "italic", borderTop: `1px solid ${theme.border}`, paddingTop: 8 }}>
                            💡 {card.example}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Save button */}
                <button
                  onClick={saveNotebookCards}
                  disabled={notebookSaving}
                  style={{
                    width: "100%", padding: "16px",
                    background: "linear-gradient(135deg,#059669,#10B981)",
                    color: "white", border: "none", borderRadius: 16,
                    fontWeight: 900, fontSize: 16, cursor: notebookSaving ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 20px rgba(16,185,129,0.3)"
                  }}
                >
                  {notebookSaving ? "⏳ Sauvegarde…" : `💾 Ajouter ces ${notebookCards.length} fiches à MemoMaster`}
                </button>
              </div>
            )}

            {/* ── Message confirmation ── */}
            {notebookSaved && (
              <div style={{ background: isDarkMode ? "#052e16" : "#F0FDF4", borderRadius: 20, padding: "20px 24px", border: "1.5px solid #22C55E40", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                <div style={{ fontWeight: 900, fontSize: 16, color: isDarkMode ? "#86EFAC" : "#166534" }}>Fiches ajoutées avec succès !</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>Tu peux les retrouver dans ta liste de révision MemoMaster.</div>
                <button onClick={() => setNotebookSaved(false)} style={{ marginTop: 12, padding: "8px 20px", background: "#22C55E", color: "white", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ Ajouter d'autres notes
                </button>
              </div>
            )}

            {/* ── Historique des sessions ── */}
            {notebookHistory.length > 0 && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `1px solid ${theme.border}` }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: theme.text, marginBottom: 14 }}>🕒 Historique du carnet</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {notebookHistory.slice(0, 5).map((h, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: theme.inputBg, borderRadius: 14, border: `1px solid ${theme.border}` }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontWeight: 900, fontSize: 14, color: "white" }}>{h.count}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: theme.text, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {h.preview}…
                        </div>
                        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                          📅 {h.date} · {h.count} fiche{h.count > 1 ? "s" : ""} générée{h.count > 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )
      }

      {/* ── TAB : Coach Modes ────────────────────────────────────────────── */}
      {
        practiceSubView === "coach" && (() => {
          // Sous-onglets de navigation
          const coachTabs = [
            { id: "pronunciation", label: "🗣️ Prononciation" },
            { id: "listening", label: "🎧 Speed Listening" },
            { id: "anchor", label: "🎙️ News Anchor" }
          ];

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeUp 0.3s ease" }}>
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }} className="tabs-scroll">
                {coachTabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setCoachMode(t.id)}
                    style={{
                      padding: "10px 20px", borderRadius: 100, fontWeight: 800, fontSize: 14, cursor: "pointer",
                      whiteSpace: "nowrap", transition: "all 0.2s", border: "none",
                      background: coachMode === t.id ? theme.primary : isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(139, 92, 246,0.05)",
                      color: coachMode === t.id ? "white" : theme.textMuted
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {coachMode === "listening" && (
                <CoachSpeedListening callClaude={callClaude} practiceLevel={practiceLevel} theme={theme} isDarkMode={isDarkMode} awardXP={awardXP} storage={storage} />
              )}

              {coachMode === "anchor" && (
                <CoachNewsAnchor callClaude={callClaude} practiceLevel={practiceLevel} theme={theme} isDarkMode={isDarkMode} awardXP={awardXP} storage={storage} />
              )}

              {coachMode === "pronunciation" && (() => {
                // ── SpeechRecognition bootstrap ──
                const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

                const generatePhrase = async () => {
                  setCoachGenerating(true);
                  setCoachFeedback(null);
                  setCoachTranscript("");
                  setCoachWordTip(null);
                  const cefrMap = { 1: "A1-A2", 2: "B1", 3: "B1-B2", 4: "B2-C1", 5: "C1-C2" };
                  const cefr = cefrMap[coachDifficulty] || "B1";
                  try {
                    const raw = await callClaude(
                      `You are a pronunciation coach. Generate a short English sentence (8-15 words) for a ${cefr} learner to read aloud. Focus on challenging pronunciation sounds (th, r, l, vowels, consonant clusters). Reply with ONLY the sentence, no quotes, no explanation.`,
                      `Difficulty level: ${coachDifficulty}/5. Generate one sentence now.`
                    );
                    const text = raw.replace(/"|'/g, "").trim();
                    setCoachPhrase({ text, cefrLevel: cefr });
                  } catch (e) {
                    showToast("Erreur génération phrase", "error");
                  }
                  setCoachGenerating(false);
                };

                const startListening = () => {
                  if (!SpeechRec) { showToast("SpeechRecognition non supporté sur ce navigateur", "error"); return; }
                  if (!coachPhrase) return;
                  markInteracted();
                  const recog = new SpeechRec();
                  recog.lang = "en-US";
                  recog.continuous = false;
                  recog.interimResults = false;
                  recog.maxAlternatives = 1;
                  coachRecogRef.current = recog;
                  setCoachListening(true);
                  setCoachTranscript("");
                  setCoachFeedback(null);
                  setCoachWordTip(null);
                  recog.onresult = (e) => {
                    const said = e.results[0][0].transcript;
                    setCoachTranscript(said);
                  };
                  recog.onend = async () => {
                    setCoachListening(false);
                    const said = coachRecogRef.current?._lastTranscript;
                    // transcript is in state after onresult, re-read via closure trick
                    // We trigger analysis via a custom event to avoid stale closure
                    window.dispatchEvent(new CustomEvent("coach-analyze"));
                  };
                  recog.onerror = (e) => {
                    setCoachListening(false);
                    if (e.error !== "no-speech") showToast(`Micro : ${e.error}`, "error");
                  };
                  recog.start();
                };

                const stopListening = () => {
                  coachRecogRef.current?.stop();
                  setCoachListening(false);
                };

                const analyzeWithClaude = async (targetText, userSaid) => {
                  if (!userSaid.trim()) { showToast("Aucune transcription reçue, réessaie", "warning"); return; }
                  setCoachLoading(true);
                  setCoachWordTip(null);
                  try {
                    const raw = await callClaude(
                      `You are a world-class English pronunciation coach. Compare the target phrase with what the user actually said and provide detailed word-by-word feedback.

Rules:
- "status": "correct" if the user's word matches or is phonetically close
- "status": "wrong" if they said it but incorrectly
- "status": "missing" if they skipped the word
- "userSaid": the word the user actually said (or "" if missing)
- "tip": a very short, practical pronunciation tip in French (max 15 words). Only provide a tip for wrong/missing words.
- "score": overall pronunciation score 0-100 (realistic, not inflated)
- "globalTip": one key improvement advice in French (1-2 sentences)
- "nextPhrase": a short encouraging message in French suggesting trying a harder/easier sentence

Return ONLY valid JSON with no markdown fences:
{
  "score": 87,
  "words": [
    { "word": "string", "status": "correct"|"wrong"|"missing", "userSaid": "string", "tip": "string or null" }
  ],
  "globalTip": "string",
  "nextPhrase": "string"
}`,
                      `Target phrase: "${targetText}"
User said: "${userSaid}"

Analyze pronunciation word by word.`
                    );
                    const parsed = safeParseJSON(raw);
                    setCoachFeedback(parsed);
                    // Animate score
                    setCoachScoreAnim(0);
                    const target = parsed.score || 0;
                    let current = 0;
                    const step = () => {
                      current = Math.min(current + 2, target);
                      setCoachScoreAnim(current);
                      if (current < target) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                    awardXP(15, 3, "Coach Pro");
                  } catch (e) {
                    showToast("Erreur analyse prononciation", "error");
                    console.error(e);
                  }
                  setCoachLoading(false);
                };

                const SpeechRec_supported = !!SpeechRec;
                const scoreColor = coachScoreAnim >= 80 ? "#22C55E" : coachScoreAnim >= 60 ? "#F59E0B" : "#EF4444";
                const scoreGrad = coachScoreAnim >= 80
                  ? "linear-gradient(135deg,#059669,#22C55E)"
                  : coachScoreAnim >= 60
                    ? "linear-gradient(135deg,#D97706,#F59E0B)"
                    : "linear-gradient(135deg,#DC2626,#EF4444)";

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <style>{`
              @keyframes coachListen { 0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(139, 92, 246,0.7)} 70%{transform:scale(1.05);box-shadow:0 0 0 18px rgba(139, 92, 246,0)} }
              @keyframes coachScore { from{stroke-dashoffset:283} }
              @keyframes coachWordIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
              @keyframes coachTipIn { from{opacity:0;transform:translateY(-6px)scale(0.95)} to{opacity:1;transform:translateY(0)scale(1)} }
              .coach-word { cursor:pointer; transition:all 0.2s; display:inline-block; margin:0 4px 6px; }
              .coach-word:hover { transform:translateY(-2px) scale(1.05); }
              .coach-mic-btn:hover { filter:brightness(1.15); }
            `}</style>

                    {/* ─── Header card ─── */}
                    <div style={{
                      background: isDarkMode
                        ? "linear-gradient(135deg,var(--mm-bg-elev),#312e81)"
                        : "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))",
                      borderRadius: 24, padding: "28px 32px",
                      boxShadow: "0 20px 60px rgba(124, 58, 237,0.4)",
                      position: "relative", overflow: "hidden"
                    }}>
                      <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, background: "radial-gradient(circle,rgba(192, 132, 252,0.3),transparent)", borderRadius: "50%", pointerEvents: "none" }} />
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#C4B5FD", letterSpacing: 3, marginBottom: 8, textTransform: "uppercase" }}>PRONUNCIATION COACH</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: "white", marginBottom: 6 }}>🎙️ Coach Prononciation</div>
                      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                        Lis la phrase à voix haute — l'IA analyse ta prononciation mot par mot.
                      </div>

                      {/* Difficulty selector */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1 }}>Difficulté</span>
                        {[1, 2, 3, 4, 5].map(d => (
                          <button key={d} onClick={() => { setCoachDifficulty(d); setCoachPhrase(null); setCoachFeedback(null); setCoachTranscript(""); }}
                            style={{
                              width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", fontWeight: 900, fontSize: 13,
                              background: coachDifficulty === d ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.12)",
                              color: coachDifficulty === d ? "var(--mm-primary)" : "rgba(255,255,255,0.7)",
                              boxShadow: coachDifficulty === d ? "0 4px 12px rgba(0,0,0,0.3)" : "none",
                              transition: "all 0.2s"
                            }}>{d}</button>
                        ))}
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>
                          {{ 1: "A1-A2 Débutant", 2: "B1 Intermédiaire", 3: "B1-B2 Avancé", 4: "B2-C1 Expert", 5: "C1-C2 Maîtrise" }[coachDifficulty]}
                        </span>
                      </div>
                    </div>

                    {/* ─── Phrase + controls ─── */}
                    <div style={{
                      background: isDarkMode ? "var(--mm-bg-elev)" : "white",
                      borderRadius: 24, padding: 28,
                      border: `1px solid ${isDarkMode ? "rgba(139, 92, 246,0.25)" : "rgba(139, 92, 246,0.2)"}`,
                      boxShadow: isDarkMode ? "0 10px 40px rgba(0,0,0,0.4)" : "0 10px 40px rgba(139, 92, 246,0.08)"
                    }}>
                      {/* Phrase display */}
                      {!coachPhrase && !coachGenerating && (
                        <div style={{ textAlign: "center", padding: "32px 0" }}>
                          <div style={{ fontSize: 52, marginBottom: 16 }}>🎯</div>
                          <div style={{ fontSize: 16, color: theme.textMuted, marginBottom: 24 }}>Génère une phrase pour commencer</div>
                          <button onClick={generatePhrase} style={{
                            padding: "14px 36px", background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))",
                            color: "white", border: "none", borderRadius: 16, fontWeight: 900, fontSize: 16,
                            cursor: "pointer", boxShadow: "0 8px 24px rgba(124, 58, 237,0.4)"
                          }}>✨ Générer une phrase</button>
                        </div>
                      )}

                      {coachGenerating && (
                        <div style={{ textAlign: "center", padding: "40px 0" }}>
                          <div style={{ fontSize: 32, marginBottom: 12, animation: "pulseAstral 1s infinite" }}>⏳</div>
                          <div style={{ color: theme.textMuted }}>Génération en cours…</div>
                        </div>
                      )}

                      {coachPhrase && !coachGenerating && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                          {/* CEFR badge */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 900, padding: "4px 12px", borderRadius: 20, background: "rgba(124, 58, 237,0.12)", color: "var(--mm-primary)", letterSpacing: 1, textTransform: "uppercase" }}>
                              {coachPhrase.cefrLevel}
                            </span>
                            <button onClick={generatePhrase} disabled={coachListening || coachLoading} style={{
                              fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, cursor: "pointer",
                              background: "transparent", border: `1px solid ${theme.border}`, color: theme.textMuted
                            }}>🔀 Nouvelle phrase</button>
                          </div>

                          {/* Target phrase — colored when feedback available */}
                          <div style={{
                            background: isDarkMode ? "rgba(139, 92, 246,0.08)" : "var(--mm-bg-elev)",
                            borderRadius: 16, padding: "20px 24px",
                            border: `2px solid ${isDarkMode ? "rgba(139, 92, 246,0.25)" : "rgba(139, 92, 246,0.2)"}`
                          }}>
                            {coachFeedback ? (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, lineHeight: 2 }}>
                                {coachFeedback.words.map((w, i) => {
                                  const color = w.status === "correct" ? "#22C55E" : w.status === "wrong" ? "#EF4444" : "var(--mm-fg-muted)";
                                  const bg = w.status === "correct"
                                    ? (isDarkMode ? "rgba(34,197,94,0.15)" : "rgba(34,197,94,0.12)")
                                    : w.status === "wrong"
                                      ? (isDarkMode ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.12)")
                                      : (isDarkMode ? "rgba(148,163,184,0.1)" : "rgba(148,163,184,0.1)");
                                  const isSelected = coachWordTip?.index === i;
                                  return (
                                    <span
                                      key={i}
                                      className="coach-word"
                                      onClick={() => setCoachWordTip(coachWordTip?.index === i ? null : { word: w.word, tip: w.tip, userSaid: w.userSaid, status: w.status, index: i })}
                                      style={{
                                        fontWeight: 800, fontSize: 20, padding: "4px 10px", borderRadius: 10,
                                        color, background: bg,
                                        border: `2px solid ${isSelected ? color : "transparent"}`,
                                        animation: `coachWordIn 0.3s ease ${i * 0.04}s both`,
                                        boxShadow: isSelected ? `0 4px 16px ${colorMix(color, 25)}` : "none"
                                      }}
                                    >{w.word}</span>
                                  );
                                })}
                              </div>
                            ) : (
                              <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, lineHeight: 1.6, fontFamily: "Georgia, serif" }}>
                                "{coachPhrase.text}"
                              </div>
                            )}
                          </div>

                          {/* Word tip tooltip */}
                          {coachWordTip && (
                            <div style={{
                              background: isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)",
                              borderRadius: 14, padding: "14px 18px",
                              border: `1px solid ${isDarkMode ? "rgba(139, 92, 246,0.4)" : "rgba(139, 92, 246,0.3)"}`,
                              animation: "coachTipIn 0.25s ease",
                              display: "flex", flexDirection: "column", gap: 6
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 16, fontWeight: 900, color: coachWordTip.status === "correct" ? "#22C55E" : coachWordTip.status === "wrong" ? "#EF4444" : "var(--mm-fg-muted)" }}>
                                  {coachWordTip.status === "correct" ? "✅" : coachWordTip.status === "wrong" ? "❌" : "⬜"} « {coachWordTip.word} »
                                </span>
                                {coachWordTip.userSaid && coachWordTip.userSaid !== coachWordTip.word && (
                                  <span style={{ fontSize: 13, color: "#EF4444", fontStyle: "italic" }}>→ tu as dit « {coachWordTip.userSaid} »</span>
                                )}
                              </div>
                              {coachWordTip.tip && (
                                <div style={{ fontSize: 13, color: isDarkMode ? "#C4B5FD" : "var(--mm-primary-deep)", lineHeight: 1.5 }}>💡 {coachWordTip.tip}</div>
                              )}
                            </div>
                          )}

                          {/* TTS button */}
                          <button
                            onClick={() => { markInteracted(); speakText(coachPhrase.text, true); }}
                            style={{
                              alignSelf: "flex-start", padding: "10px 20px",
                              background: isDarkMode ? "rgba(139, 92, 246,0.12)" : "rgba(139, 92, 246,0.08)",
                              border: `1px solid ${isDarkMode ? "rgba(139, 92, 246,0.3)" : "rgba(139, 92, 246,0.25)"}`,
                              borderRadius: 12, cursor: "pointer", color: "var(--mm-primary)", fontWeight: 700, fontSize: 13,
                              display: "flex", alignItems: "center", gap: 8
                            }}
                          >🔊 Écouter la phrase</button>

                          {/* Mic button */}
                          {SpeechRec_supported ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 8 }}>
                              <button
                                className="coach-mic-btn"
                                onClick={coachListening ? stopListening : startListening}
                                disabled={coachLoading}
                                style={{
                                  width: 80, height: 80, borderRadius: "50%", border: "none", cursor: coachLoading ? "not-allowed" : "pointer",
                                  background: coachListening
                                    ? "linear-gradient(135deg,#EF4444,#DC2626)"
                                    : "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))",
                                  fontSize: 32, display: "flex", alignItems: "center", justifyContent: "center",
                                  boxShadow: coachListening ? "0 0 0 0 rgba(239,68,68,0.5)" : "0 8px 24px rgba(124, 58, 237,0.5)",
                                  animation: coachListening ? "coachListen 1.5s infinite" : "none",
                                  transition: "background 0.3s, box-shadow 0.3s"
                                }}
                              >
                                {coachLoading ? "⏳" : coachListening ? "⏹️" : "🎙️"}
                              </button>
                              <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted }}>
                                {coachLoading ? "Analyse en cours…" : coachListening ? "Parle maintenant… (clique pour arrêter)" : "Clique pour lire à voix haute"}
                              </div>

                              {/* Transcript preview */}
                              {coachTranscript && (
                                <div style={{
                                  width: "100%", padding: "12px 18px",
                                  background: isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(139, 92, 246,0.05)",
                                  borderRadius: 12, border: `1px solid ${theme.border}`,
                                  fontSize: 14, color: theme.textMuted, fontStyle: "italic", lineHeight: 1.5
                                }}>
                                  🎤 Transcription : « {coachTranscript} »
                                  {!coachFeedback && !coachLoading && (
                                    <button
                                      onClick={() => analyzeWithClaude(coachPhrase.text, coachTranscript)}
                                      style={{
                                        marginLeft: 12, padding: "6px 16px",
                                        background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))",
                                        color: "white", border: "none", borderRadius: 10,
                                        fontWeight: 800, fontSize: 12, cursor: "pointer"
                                      }}
                                    >🔍 Analyser</button>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ padding: "16px", background: isDarkMode ? "rgba(239,68,68,0.1)" : "#FEF2F2", borderRadius: 12, color: "#EF4444", fontSize: 13, fontWeight: 600 }}>
                              ⚠️ SpeechRecognition non disponible sur ce navigateur. Utilise Chrome ou Edge.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ─── Feedback panel ─── */}
                    {coachFeedback && (
                      <div style={{
                        background: isDarkMode ? "var(--mm-bg-elev)" : "white",
                        borderRadius: 24, padding: 28,
                        border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(139, 92, 246,0.05)"}`,
                        boxShadow: isDarkMode ? "0 16px 48px rgba(0,0,0,0.5)" : "0 16px 48px rgba(139, 92, 246,0.05)"
                      }}>
                        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>

                          {/* Score ring */}
                          <div style={{ position: "relative", width: 100, height: 100, flexShrink: 0 }}>
                            <svg width="100" height="100" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="45" fill="none" stroke={isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(139, 92, 246,0.05)"} strokeWidth="8" />
                              <circle
                                cx="50" cy="50" r="45" fill="none"
                                stroke={scoreColor} strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray="283"
                                strokeDashoffset={283 - (283 * coachScoreAnim / 100)}
                                transform="rotate(-90 50 50)"
                                style={{ transition: "stroke-dashoffset 0.05s linear" }}
                              />
                            </svg>
                            <div style={{
                              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                              alignItems: "center", justifyContent: "center"
                            }}>
                              <div style={{ fontSize: 24, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{coachScoreAnim}</div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, marginTop: 2 }}>/ 100</div>
                            </div>
                          </div>

                          {/* Verdict + global tip */}
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <div style={{
                              fontSize: 20, fontWeight: 900, marginBottom: 8,
                              color: coachFeedback.score >= 80 ? "#22C55E" : coachFeedback.score >= 60 ? "#F59E0B" : "#EF4444"
                            }}>
                              {coachFeedback.score >= 80 ? "🎉 Excellent !" : coachFeedback.score >= 60 ? "👍 Bien joué !" : "💪 Continue !"}
                            </div>
                            <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.6 }}>
                              {coachFeedback.globalTip}
                            </div>
                          </div>
                        </div>

                        {/* Légende */}
                        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                          {[{ c: "#22C55E", l: "✅ Correct" }, { c: "#EF4444", l: "❌ Raté" }, { c: "var(--mm-fg-muted)", l: "⬜ Manqué" }].map(({ c, l }) => (
                            <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: theme.textMuted }}>
                              <div style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />{l}
                            </div>
                          ))}
                          <div style={{ fontSize: 12, color: theme.textMuted, marginLeft: 4 }}>💡 Clique sur un mot pour voir le conseil</div>
                        </div>

                        {/* Per-word detail list */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {coachFeedback.words.filter(w => w.status !== "correct").map((w, i) => {
                            const c = w.status === "wrong" ? "#EF4444" : "var(--mm-fg-muted)";
                            return (
                              <div key={i} style={{
                                display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px",
                                background: isDarkMode ? `${c}12` : `${c}08`,
                                borderRadius: 14, border: `1px solid ${c}25`,
                                animation: `coachWordIn 0.3s ease ${i * 0.06}s both`
                              }}>
                                <div style={{ fontSize: 16, fontWeight: 900, color: c, flexShrink: 0 }}>
                                  {w.status === "wrong" ? "❌" : "⬜"}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                                    <span style={{ fontWeight: 900, fontSize: 15, color: theme.text }}>« {w.word} »</span>
                                    {w.userSaid && w.userSaid !== w.word && (
                                      <span style={{ fontSize: 13, color: c, fontStyle: "italic" }}>→ tu as dit « {w.userSaid} »</span>
                                    )}
                                  </div>
                                  {w.tip && (
                                    <div style={{ fontSize: 13, color: isDarkMode ? "#C4B5FD" : "var(--mm-primary-deep)", lineHeight: 1.5 }}>💡 {w.tip}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {coachFeedback.words.every(w => w.status === "correct") && (
                            <div style={{ textAlign: "center", padding: "16px", color: "#22C55E", fontWeight: 800, fontSize: 16 }}>
                              🏆 Prononciation parfaite ! Tous les mots sont corrects !
                            </div>
                          )}
                        </div>

                        {/* Next phrase suggestion */}
                        {coachFeedback.nextPhrase && (
                          <div style={{
                            marginTop: 20, padding: "14px 18px",
                            background: isDarkMode ? "rgba(139, 92, 246,0.1)" : "rgba(139, 92, 246,0.06)",
                            borderRadius: 14, border: `1px solid ${isDarkMode ? "rgba(139, 92, 246,0.3)" : "rgba(139, 92, 246,0.2)"}`,
                            fontSize: 13, color: isDarkMode ? "#C4B5FD" : "var(--mm-primary-deep)", lineHeight: 1.5
                          }}>
                            🤖 {coachFeedback.nextPhrase}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                          <button
                            onClick={() => { setCoachFeedback(null); setCoachTranscript(""); setCoachWordTip(null); setCoachScoreAnim(0); }}
                            style={{
                              flex: 1, padding: "14px", borderRadius: 14,
                              background: isDarkMode ? "rgba(139, 92, 246,0.15)" : "rgba(139, 92, 246,0.08)",
                              border: `1px solid ${isDarkMode ? "rgba(139, 92, 246,0.3)" : "rgba(139, 92, 246,0.2)"}`,
                              color: "var(--mm-primary)", fontWeight: 800, fontSize: 14, cursor: "pointer"
                            }}
                          >🔁 Réessayer cette phrase</button>
                          <button
                            onClick={() => {
                              const newDiff = Math.min(coachDifficulty + (coachFeedback.score >= 75 ? 1 : 0), 5);
                              setCoachDifficulty(newDiff);
                              setCoachFeedback(null); setCoachTranscript(""); setCoachWordTip(null); setCoachScoreAnim(0);
                              generatePhrase();
                            }}
                            style={{
                              flex: 1, padding: "14px", borderRadius: 14,
                              background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))",
                              border: "none", color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer",
                              boxShadow: "0 6px 20px rgba(124, 58, 237,0.4)"
                            }}
                          >➡️ Phrase suivante {coachFeedback.score >= 75 && coachDifficulty < 5 ? "(+1 niveau)" : ""}</button>
                        </div>
                      </div>
                    )}

                    {/* ─── Speech event listener hack (stale closure fix) ─── */}
                    {/* We use a useEffect-like pattern inside IIFE via a key-rerendering trick */}
                    <CoachAnalyzeListener
                      coachPhrase={coachPhrase}
                      coachTranscript={coachTranscript}
                      analyzeWithClaude={analyzeWithClaude}
                    />
                  </div>
                );
              })()}
            </div>
          );
        })()
      }


      {/* ── TAB : Examen blanc ──────────────────────────────────────────────── */}
      {
        practiceSubView === "exam" && (
          <div style={{ background: "var(--mm-bg-card)", borderRadius: 24, padding: 28, border: "1px solid var(--mm-border)", boxShadow: "var(--mm-shadow)" }}>
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>📝 Examen Blanc</h2>
            <p style={{ color: theme?.textMuted, fontSize: 14, marginBottom: 20 }}>
              Entraîne-toi sur un examen TOEIC/IELTS généré par l'IA. Choisis une section puis lance le test.
            </p>

            {/* Section selector + start */}
            {!practiceExamMode && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {["reading", "listening", "grammar", "vocabulary", "writing"].map(sec => (
                    <button key={sec} onClick={() => startExamMode(sec)} style={{
                      padding: "12px 20px", borderRadius: 14,
                      background: practiceExamSection === sec
                        ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))"
                        : "rgba(255,255,255,0.05)",
                      color: practiceExamSection === sec ? "white" : theme?.textMuted,
                      border: `1px solid ${practiceExamSection === sec ? "transparent" : "var(--mm-border)"}`,
                      fontWeight: 800, fontSize: 14, cursor: "pointer",
                      textTransform: "capitalize", transition: "all 0.2s",
                    }}>
                      {sec === "reading" ? "📖" : sec === "listening" ? "🎧" : sec === "grammar" ? "📐" : sec === "vocabulary" ? "📚" : "✍️"} {sec}
                    </button>
                  ))}
                </div>
                <p style={{ color: theme?.textMuted, fontSize: 13, margin: 0 }}>
                  Clique sur une section pour générer 5 questions et démarrer l'examen.
                </p>
              </div>
            )}

            {/* Questions */}
            {practiceExamMode && practiceExamQuestions.length > 0 && practiceExamScore === null && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {practiceExamQuestions.map((q, qi) => (
                  <div key={qi} style={{
                    background: "rgba(255,255,255,0.03)", borderRadius: 16,
                    padding: "20px 22px", border: "1px solid var(--mm-border)"
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: theme?.text, marginBottom: 14 }}>
                      {qi + 1}. {q.question}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(q.options || []).map((opt, oi) => (
                        <label key={oi} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                          background: practiceExamAnswers[qi] === opt
                            ? "rgba(139, 92, 246,0.15)"
                            : "rgba(255,255,255,0.03)",
                          border: `1px solid ${practiceExamAnswers[qi] === opt ? "var(--mm-primary)" : "var(--mm-border)"}`,
                          transition: "all 0.15s",
                        }}>
                          <input
                            type="radio"
                            name={`q${qi}`}
                            value={opt}
                            checked={practiceExamAnswers[qi] === opt}
                            onChange={() => {
                              setPracticeExamAnswers(prev => {
                                const next = [...prev];
                                next[qi] = opt;
                                return next;
                              });
                            }}
                            style={{ accentColor: "var(--mm-primary)", flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 14, color: theme?.text }}>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  onClick={submitExam}
                  disabled={practiceExamAnswers.filter(Boolean).length < practiceExamQuestions.length}
                  style={{
                    padding: "14px 28px", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))",
                    color: "white", border: "none", borderRadius: 14,
                    fontWeight: 800, fontSize: 15, cursor: "pointer",
                    opacity: practiceExamAnswers.filter(Boolean).length < practiceExamQuestions.length ? 0.5 : 1,
                    boxShadow: "0 8px 20px rgba(139, 92, 246,0.3)", transition: "all 0.2s",
                  }}
                >
                  ✅ Soumettre ({practiceExamAnswers.filter(Boolean).length}/{practiceExamQuestions.length} répondues)
                </button>
              </div>
            )}

            {/* Score */}
            {practiceExamScore !== null && (
              <div style={{ textAlign: "center", padding: "30px 0" }}>
                <div style={{ fontSize: 64, marginBottom: 12 }}>
                  {practiceExamScore >= 4 ? "🏆" : practiceExamScore >= 2 ? "📊" : "📖"}
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: theme?.text, marginBottom: 8 }}>
                  {practiceExamScore} / {practiceExamQuestions.length}
                </div>
                <div style={{ fontSize: 16, color: theme?.textMuted, marginBottom: 24 }}>
                  {practiceExamScore === practiceExamQuestions.length ? "Parfait ! Excellent travail 🎉" :
                    practiceExamScore >= Math.ceil(practiceExamQuestions.length * 0.6) ? "Bon résultat, continue comme ça !" :
                      "Relis le cours et réessaie, tu vas progresser !"}
                </div>
                {/* Corrections */}
                <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                  {practiceExamQuestions.map((q, qi) => {
                    const isCorrect = practiceExamAnswers[qi] === q.correct;
                    return (
                      <div key={qi} style={{
                        padding: "14px 18px", borderRadius: 14,
                        background: isCorrect ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                        border: `1px solid ${isCorrect ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                      }}>
                        <div style={{ fontWeight: 700, color: theme?.text, fontSize: 14, marginBottom: 6 }}>
                          {isCorrect ? "✅" : "❌"} {qi + 1}. {q.question}
                        </div>
                        {!isCorrect && (
                          <div style={{ fontSize: 13, color: theme?.textMuted }}>
                            Ta réponse : <span style={{ color: "#ef4444" }}>{practiceExamAnswers[qi] || "Aucune"}</span>
                            {" · "}Bonne réponse : <span style={{ color: "#10B981", fontWeight: 800 }}>{q.correct}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={() => startExamMode(practiceExamSection)} style={{
                    padding: "12px 24px", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))",
                    color: "white", border: "none", borderRadius: 12,
                    fontWeight: 800, fontSize: 14, cursor: "pointer",
                  }}>
                    🔄 Réessayer cette section
                  </button>
                  <button onClick={() => { setPracticeExamMode(false); setPracticeExamScore(null); setPracticeExamQuestions([]); setPracticeExamAnswers([]); }} style={{
                    padding: "12px 24px", background: "rgba(255,255,255,0.06)",
                    color: theme?.text, border: "1px solid var(--mm-border)", borderRadius: 12,
                    fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}>
                    📋 Changer de section
                  </button>
                </div>
              </div>
            )}

            {/* Loading */}
            {practiceExamMode && practiceExamQuestions.length === 0 && practiceExamScore === null && (
              <div style={{ textAlign: "center", padding: "40px 0", color: theme?.textMuted }}>
                <div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1.5s infinite" }}>🤖</div>
                <div style={{ fontWeight: 600 }}>Génération de l'examen en cours…</div>
              </div>
            )}
          </div>
        )
      }

      {/* ── TAB : RealLife (immersion 3 passes) ───────────────────────────── */}
      {
        practiceSubView === "reallife" && (
          <RealLife
            callClaude={callClaude}
            storage={storage}
            expressions={expressions}
            setExpressions={setExpressions}
            showToast={showToast}
            today={today}
            awardXP={awardXP}
            isDarkMode={isDarkMode}
          />
        )
      }

      {/* ── TAB : English in the Wild (Vidéos YouTube) ────────────────────── */}
      {
        practiceSubView === "wild" && (
          <EnglishInTheWild
            callClaude={callClaude}
            storage={storage}
            expressions={expressions}
            setExpressions={setExpressions}
            awardXP={awardXP}
            showToast={showToast}
            theme={theme}
            isDarkMode={isDarkMode}
          />
        )
      }

      {/* ── TAB : Live News English ─────────────────────────────────────────── */}
      {
        practiceSubView === "news" && (
          <LiveNewsModule
            callClaude={callClaude}
            theme={theme}
            isDarkMode={isDarkMode}
          />
        )
      }

      {/* ── TAB : Battle Mode ─────────────────────────────────────────────── */}
      {
        practiceSubView === "battle" && (
          <BattleMode
            callClaude={callClaude}
            storage={storage}
            showToast={showToast}
            theme={theme}
            isDarkMode={isDarkMode}
            addXP={addXP}
          />
        )
      }


      {/* ── Fiches détectées par l'agent ElevenLabs ─────────────────────── */}




      {/* LIVEKIT VOICE ASSISTANT (GLOBAL OVERLAY) */}
      {customAgent.isConnected && (
        <LiveKitVoiceAssistant
          onClose={() => {
            agent.stop();
            // Débriefing & gratification de production active si des cibles ont été prononcées
            if (spokenTargetIds.size > 0 && effectiveTargetExpressions.length > 0) {
              const count = spokenTargetIds.size;
              awardXP(count * 15, count * 5, `🎯 ${count} fiche(s) du jour validée(s) à l'oral`);
              showToast(`🎯 Superbe ! ${count} expression(s) du jour ancrée(s) à l'oral avec Nova ! (+${count * 15} XP)`, "success");
            }
          }}
          isDarkMode={isDarkMode}
          onTranscriptionsUpdate={setLiveKitTranscriptions}
          onStateChange={setLiveKitState}
          systemPrompt={liveKitSystemPrompt}
          studentName={studentName}
          sessionGoal={effectiveSessionGoal}
          targetExpressions={effectiveTargetExpressions}
        />
      )}

      {/* PHASE 4 — Mini-défi de production active en fin de session */}
      {postSessionChallenge && (
        <ProductionChallenge
          items={postSessionChallenge.items}
          topic={postSessionChallenge.topic}
          isDarkMode={isDarkMode}
          theme={theme}
          onClose={() => setPostSessionChallenge(null)}
          onValidate={validateProductionSentence}
        />
      )}
    </div >
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL — EnglishPractice (wrapper ConversationProvider)
// C'est lui qu'importe MemoMaster. Le ConversationProvider doit envelopper
// EnglishPracticeInner pour que useElevenLabsAgent (useRegisterCallbacks) trouve
// son contexte.
// ══════════════════════════════════════════════════════════════════════════════
// ── Guard anti-StrictMode ──────────────────────────────────────────────────
// En développement, React StrictMode monte les composants 2 fois pour détecter
// les effets de bord. Ça fait démarrer 2 sessions WebRTC → le 1er message est
// dit deux fois puis la 2e session tue la 1re. Ce ref persiste entre les deux
// montages et bloque le second ConversationProvider.
const _providerMountedRef = { current: false };

export default function EnglishPractice(props) {
  return (
    <EnglishPracticeInner {...props} />
  );
}

