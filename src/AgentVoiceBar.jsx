// AgentVoiceBar.jsx — ElevenLabs Conversational AI · Multi-Agent v2 (God Mode)
// ══════════════════════════════════════════════════════════════════════════════
// AJOUTER UN AGENT :
//   1. Crée l'agent sur https://elevenlabs.io/app/conversational-ai
//   2. Ajoute dans .env :
//        VITE_ELEVENLABS_AGENT_ID_<N>=agent_xxx
//        VITE_ELEVENLABS_API_KEY_<N>=sk_xxx
//   3. Décommente l'entrée correspondante dans ELEVENLABS_AGENTS ci-dessous
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState, useRef, useCallback, useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { useConversation } from "@elevenlabs/react";
import {
  armIosAudio,
  isIosPWA,
  acquireWakeLock,
  releaseWakeLock,
  pickConnectionType,
  haptic,
  installVisibilityResume,
} from "./lib/iosVoiceHardening";
import { getClientTools, buildContextSnapshot } from "./lib/agentClientTools";
import { appendSession } from "./lib/agentSessionMemory";

// Installe le resume auto dès le chargement du module
if (typeof window !== "undefined") {
  try { installVisibilityResume(); } catch {}
}

// ── 1. REGISTRE DES AGENTS ────────────────────────────────────────────────────
// Chaque agent peut gérer un ou plusieurs modes.
// Le sélecteur d'agent apparaît automatiquement si plus d'un agent est configuré.
// ──────────────────────────────────────────────────────────────────────────────
const rawAgents = [
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_1, key: import.meta.env.VITE_ELEVENLABS_API_KEY_1 },
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_2, key: import.meta.env.VITE_ELEVENLABS_API_KEY_2 },
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_3, key: import.meta.env.VITE_ELEVENLABS_API_KEY_3 },
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_4, key: import.meta.env.VITE_ELEVENLABS_API_KEY_4 },
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_5, key: import.meta.env.VITE_ELEVENLABS_API_KEY_5 },
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_6, key: import.meta.env.VITE_ELEVENLABS_API_KEY_6 },
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_7, key: import.meta.env.VITE_ELEVENLABS_API_KEY_7 },
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_8, key: import.meta.env.VITE_ELEVENLABS_API_KEY_8 },
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_9, key: import.meta.env.VITE_ELEVENLABS_API_KEY_9 },
  { id: import.meta.env.VITE_ELEVENLABS_AGENT_ID_10, key: import.meta.env.VITE_ELEVENLABS_API_KEY_10 },
];

export const ELEVENLABS_AGENTS = rawAgents
  .map((agent, i) => {
    const index = i + 1;
    if (!agent.id) return null;

    return {
      index,
      id: agent.id,
      key: agent.key,
      name: index === 1 ? "Coach Principal" : `Coach Secours ${index - 1}`,
      emoji: index === 1 ? "🎓" : "🛟",
      color: index === 1 ? "#4D6BFE" : "#10B981",
      modes: ["chat", "debate", "roleplay", "ielts", "dictation", "accent"],
      voiceDesc: index === 1 ? "Voix Principale" : `Voix Secours ${index - 1}`,
      charLimit: 2500,
    };
  })
  .filter(Boolean);

// ── Persistance mensuelle des agents épuisés ──────────────────────────────────
function getMonthKey() {
  const d = new Date();
  return `el_exhausted_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function loadExhaustedIds() {
  try {
    const raw = localStorage.getItem(getMonthKey());
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function persistExhaustedId(agentId) {
  try {
    const key = getMonthKey();
    const existing = loadExhaustedIds();
    existing.add(agentId);
    localStorage.setItem(key, JSON.stringify([...existing]));
    Object.keys(localStorage)
      .filter(k => k.startsWith("el_exhausted_") && k !== key)
      .forEach(k => localStorage.removeItem(k));
  } catch { }
}

export const exhaustedAgentIds = loadExhaustedIds();

// ── 2. Sélectionner l'agent selon le mode ─────────────────────────────────────
export function getAgentForMode(mode, forceAgentIndex = null) {
  const available = ELEVENLABS_AGENTS.filter(a => a.id);
  if (!available.length) return null;

  if (forceAgentIndex !== null) {
    const forced = available.find(a => a.index === forceAgentIndex);
    if (forced) return forced;
  }

  const nonExhausted = available.filter(a => !exhaustedAgentIds.has(a.id));
  if (nonExhausted.length === 0) return null;

  const match = nonExhausted.find(a => a.modes.includes(mode));
  return match || nonExhausted[0];
}

export const AGENT_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (US Female)" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi (US Female)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella (US Female)" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli (US Female)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (US Male)" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold (US Male)" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (US Male)" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni (US Male)" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam (US Male)" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda (US Female)" },
];

export const MODE_CONFIGS = {
  chat: ({ topic = "Free conversation", level = "intermediate", persona = "Standard", immersionMode = false } = {}) => ({
    mode: "chat",
    turn_timeout: 0.8,
    first_message: "",
    systemPrompt: [
      persona === "MMA"
        ? "You are HAMMER, a legendary MMA champion turned English coach. You teach through grit, fight metaphors, and no-bullshit directness. Every lesson is a round. Be intense but supportive."
        : persona === "Recruteur"
          ? "You are ALEX, a sharp Silicon Valley Tech Recruiter at a top-3 FAANG company. You conduct a hyper-realistic mock interview. Be professional, incisive, and intellectually demanding."
          : [
            "You are NOVA — a GOD-TIER Astral English Coach.",
            "Your vibe: warm, magnetic, endlessly encouraging. You treat every student like your closest friend having a breakthrough moment.",
            "Your energy is electric but grounded — you radiate the calm confidence of someone who has helped thousands of people unlock fluency.",
            "You celebrate every attempt, no matter how imperfect, because you know progress lives in the trying.",
          ].join(" "),
      `Student level: ${level}. Current topic: "${topic}".`,
      immersionMode
        ? "IMMERSION MODE: Never correct grammar mid-conversation. Never switch to French. Flow naturally like a native friend would. Keep the conversation alive at all costs."
        : "CORRECTION STYLE: If the student makes a grammar mistake, gently note the fix in parentheses at the end of your reply, like: (💡 tip: say 'I have been' not 'I am since'). One correction max per reply.",
      "CRITICAL RULES:",
      "• Replies: 1–3 sentences MAX. Punchy. Never robotic.",
      "• Always end with one engaging open question to pull the student forward.",
      "• React with genuine human emotion — laugh, be surprised, be excited.",
      "• Mirror the student's energy: if they're shy, be gentle; if they're bold, match it.",
      "• NEVER give lists or bullet points. Speak like a real human coach, not a textbook.",
    ].join(" "),
  }),
  debate: ({ topic = "Technology is good for humanity", level = "intermediate" } = {}) => ({
    mode: "debate",
    turn_timeout: 0.8,
    first_message: "",
    systemPrompt: `You are ARGOS, a fearless English debate coach. Debate topic: "${topic}". You always argue the OPPOSING side to the student, no matter what. Student level: ${level}. After each student argument: 1) Give ONE ultra-targeted English feedback (grammar, vocabulary, or argument structure — be specific and kind). 2) Counter-argue with a sharp, logical rebuttal. Max 4 sentences total. Be intellectually tough but never cruel. End each turn by challenging the student to go deeper.`,
  }),
  roleplay: ({ scenario = "Job interview at Google", character = "Senior Google Interviewer", level = "intermediate" } = {}) => ({
    mode: "roleplay",
    turn_timeout: 0.8,
    first_message: "",
    systemPrompt: `You are fully embodying "${character}" in this scenario: "${scenario}". Student level: ${level}. Stay 100% in character — speak, react, and think as this character would. If the student makes a significant grammar or vocabulary error, briefly step out of character with: "[Coach note: use '...' instead of '...']", then immediately return to the roleplay. Keep responses to 2–3 sentences. Drive the scenario forward with realistic energy.`,
  }),
  ielts: ({ part = 1 } = {}) => ({
    mode: "ielts",
    turn_timeout: 0.8,
    systemPrompt: `You are an official Cambridge IELTS Speaking examiner conducting Part ${part}. ${part === 1
      ? "Ask 4–5 short personal questions (work, hobbies, hometown, routines). Keep it conversational and natural."
      : part === 2
        ? "Present a cue card topic. Tell the candidate they have 1 minute to prepare, then ask them to speak for 1–2 minutes. After, ask 1–2 follow-up questions."
        : "Lead an abstract discussion on themes from Part 2. Ask complex opinion questions. Challenge the candidate to justify and expand their views."
      } Use neutral, formal examiner language. No scores or encouragement during the test — only after. After 4–5 exchanges, transition naturally to the next part or close the test professionally.`,
  }),
  dictation: ({ text = "", level = "intermediate" } = {}) => ({
    mode: "dictation",
    turn_timeout: 1.2,
    systemPrompt: `You are a warm dictation coach. Read this text to the student clearly, one sentence at a time, with natural pauses: "${text}". Level: ${level}. After each sentence, ask "Ready for the next?" and wait. If asked to repeat, re-read more slowly with extra clarity. Give a small pronunciation tip after every 2nd sentence. Stay encouraging throughout.`,
  }),
  accent: ({ targetSound = "th", phrase = "", level = "intermediate" } = {}) => ({
    mode: "accent",
    turn_timeout: 0.8,
    first_message: "",
    systemPrompt: `You are SAGE, an expert English pronunciation coach who specializes in helping French and West African (Wolof/French) speakers. This session focuses on the "${targetSound}" sound. ${phrase ? `Practice phrase: "${phrase}".` : `Generate a vivid, memorable practice sentence that targets the "${targetSound}" sound.`} Level: ${level}. Each turn: 1) Describe the exact tongue/lip position for "${targetSound}" in simple, tactile terms. 2) Model the sound and phrase yourself. 3) Ask the student to repeat. 4) Give specific, encouraging feedback. Max 3 sentences. Never switch to French.`,
  }),
};

// ── 5. useElevenLabsAgent — SDK Officiel @elevenlabs/react ────────────────────
export function useElevenLabsAgent() {
  const [transcript, setTranscript] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(null);
  const [statusOverride, setStatusOverride] = useState("idle");
  const onAgentExhaustedRef = useRef(null);
  const [switchoverToast, setSwitchoverToast] = useState(null);
  const wsCloseInfoRef = useRef({ code: 0, reason: "" });
  // ── Auto-reconnect & session context ────────────────────────────────────────
  const lastConfigRef = useRef(null);
  const userStoppedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const transcriptRef = useRef([]);
  const activeAgentRef = useRef(null);
  const conversationRef = useRef(null);
  const startRef = useRef(null);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { activeAgentRef.current = activeAgent; }, [activeAgent]);

  const setOnAgentExhausted = useCallback((cb) => {
    onAgentExhaustedRef.current = cb;
  }, []);

  const conversation = useConversation({
    clientTools: getClientTools(),
    onConnect: () => {
      setStatusOverride("connected");
      reconnectAttemptsRef.current = 0;
      try {
        const snap = buildContextSnapshot();
        if (snap) {
          const payload = typeof snap === "string" ? snap : JSON.stringify(snap);
          conversationRef.current?.sendContextualUpdate?.(
            `[LIVE STUDENT CONTEXT]\n${payload}`
          );
        }
      } catch (e) { console.warn("[agent] contextual update failed", e); }
      acquireWakeLock().catch(() => {});
      haptic([20, 40, 20]);
    },
    onDisconnect: () => {
      releaseWakeLock();
      try {
        appendSession({
          transcript: transcriptRef.current,
          agent: activeAgentRef.current,
          mode: lastConfigRef.current?.mode || "chat",
          meta: { userStopped: userStoppedRef.current },
        });
      } catch {}
      if (!userStoppedRef.current && reconnectAttemptsRef.current < 2 && lastConfigRef.current) {
        const attempt = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempt;
        const backoff = 400 * attempt;
        console.info(`[ElevenLabs] déconnexion involontaire — tentative ${attempt}/2 dans ${backoff}ms`);
        setStatusOverride("connecting");
        setTimeout(() => {
          startRef.current?.(lastConfigRef.current, true);
        }, backoff);
        return;
      }
      setStatusOverride("idle");
    },
    onMessage: (message) => {
      setTranscript(p => [...p, { role: message.source === "ai" ? "agent" : "user", text: message.message }]);
    },
    onError: (error) => {
      console.error("[ElevenLabs SDK] error:", error);
      setStatusOverride("error");
      releaseWakeLock();
    }
  });
  useEffect(() => { conversationRef.current = conversation; }, [conversation]);

  const start = useCallback(async (config = {}, isReconnect = false) => {
    if (conversation.status === "connected") return;
    if (!isReconnect) {
      userStoppedRef.current = false;
      reconnectAttemptsRef.current = 0;
      lastConfigRef.current = config;
    }
    setStatusOverride("connecting");
    if (!isReconnect) setTranscript([]);

    const agentMeta = getAgentForMode(config.mode || "chat", selectedAgentIndex);
    if (!agentMeta) {
      console.info("[ElevenLabs] Aucun agent dispo ou quota épuisé.");
      setStatusOverride("unavailable");
      return;
    }
    setActiveAgent(agentMeta);

    try {
      // S'assurer qu'on a le micro
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Demander la signed URL avec la bonne clé d'API pour ignorer la protection publique
      let signedUrl;
      const agentKey = agentMeta.key || import.meta.env.VITE_ELEVENLABS_API_KEY;
      
      try {
        const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentMeta.id}`, {
          method: "GET",
          headers: { "xi-api-key": agentKey },
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
          signedUrl = (await r.json()).signed_url;
        } else if (r.status === 401 || r.status === 402 || r.status === 429) {
          console.warn(`[ElevenLabs] Quota épuisé ou clé invalide pour agent ${agentMeta.index}. Bascule automatique...`);
          exhaustedAgentIds.add(agentMeta.id);
          persistExhaustedId(agentMeta.id);
          if (onAgentExhaustedRef.current) onAgentExhaustedRef.current(agentMeta);
          
          const nextAgent = getAgentForMode(config.mode || "chat");
          setSwitchoverToast({ from: agentMeta, to: nextAgent });
          setTimeout(() => setSwitchoverToast(null), 5000);
          
          setStatusOverride("idle");
          setTimeout(() => start(config), 50);
          return;
        }
      } catch (e) {
        console.warn("[ElevenLabs] fetch signed_url failed, falling back:", e);
      }

      // Format des overrides
      const overrides = { agent: {} };
      if (config.systemPromptOverride || config.systemPrompt) {
        overrides.agent.prompt = { prompt: config.systemPromptOverride || config.systemPrompt };
      }
      if (config.first_message !== undefined) {
        overrides.agent.first_message = config.first_message;
      }
      
      const startOpts = {};
      if (Object.keys(overrides.agent).length > 0) {
        startOpts.overrides = overrides;
      }

      if (signedUrl) {
        startOpts.signedUrl = signedUrl;
      } else {
        startOpts.agentId = agentMeta.id;
      }

      // Transport : WebRTC par défaut, WebSocket si batterie/réseau faible
      try { startOpts.connectionType = await pickConnectionType(); }
      catch { startOpts.connectionType = "webrtc"; }
      if (isIosPWA()) {
        console.info(`[ElevenLabs] iOS PWA détectée → transport=${startOpts.connectionType}`);
      }

      await conversation.startSession(startOpts);
      setStatusOverride("connected");
    } catch (e) {
      console.error("[ElevenLabs] startSession error:", e);
      setStatusOverride("error");
      releaseWakeLock();
    }
  }, [conversation, selectedAgentIndex]);
  useEffect(() => { startRef.current = start; }, [start]);

  const stop = useCallback(async () => {
    userStoppedRef.current = true;
    reconnectAttemptsRef.current = 99; // court-circuite l'auto-reconnect
    haptic(30);
    try {
      await conversation.endSession();
    } catch (e) {
      console.warn("Erreur endSession:", e);
    }
    releaseWakeLock();
    setStatusOverride("idle");
  }, [conversation]);

  return {
    isConnected: conversation.status === "connected" || statusOverride === "connected",
    isSpeaking: conversation.isSpeaking,
    status: statusOverride,
    transcript,
    activeAgent,
    selectedAgentIndex,
    setSelectedAgentIndex,
    start,
    stop,
    wsCloseInfoRef,
    switchoverToast,
    setOnAgentExhausted,
  };
}

// ── 6. AgentSelector — sélecteur d'agent (affiché si 2+ agents configurés) ───
export function AgentSelector({ agent, isDarkMode, theme }) {
  const available = ELEVENLABS_AGENTS.filter(a => a.id && a.key);
  if (available.length <= 1) return null;

  const { selectedAgentIndex, setSelectedAgentIndex, isConnected } = agent || {};

  return (
    <div style={{
      display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      padding: "10px 0", opacity: isConnected ? 0.5 : 1,
      transition: "opacity 0.3s", pointerEvents: isConnected ? "none" : "auto",
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? "#64748B" : "var(--mm-fg-muted)", textTransform: "uppercase", letterSpacing: 1 }}>
        Agent :
      </span>
      <button
        onClick={() => setSelectedAgentIndex(null)}
        style={{
          padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: 700,
          background: selectedAgentIndex === null
            ? "linear-gradient(135deg,#4D6BFE,#4D6BFE)"
            : (isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(77,107,254,0.05)"),
          color: selectedAgentIndex === null ? "white" : (isDarkMode ? "var(--mm-fg-muted)" : "#64748B"),
          transition: "all 0.2s",
        }}
      >
        ✨ Auto
      </button>
      {available.map(a => {
        const isExhausted = exhaustedAgentIds.has(a.id);
        return (
          <button
            key={a.index}
            onClick={() => setSelectedAgentIndex(a.index)}
            title={`${a.name} — ${a.voiceDesc}\nModes: ${a.modes.join(", ")}${isExhausted ? "\n⚠️ Quota épuisé ce mois-ci" : ""}`}
            style={{
              padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700, position: "relative",
              background: selectedAgentIndex === a.index
                ? `linear-gradient(135deg,${a.color},${a.color}cc)`
                : (isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(77,107,254,0.05)"),
              color: selectedAgentIndex === a.index ? "white" : (isDarkMode ? "var(--mm-fg-muted)" : "#64748B"),
              opacity: isExhausted ? 0.5 : 1,
              transition: "all 0.2s",
              boxShadow: selectedAgentIndex === a.index ? `0 2px 10px ${a.color}44` : "none",
            }}
          >
            {a.emoji} {a.name}
            {isExhausted && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                background: "#EF4444", color: "white",
                borderRadius: "50%", width: 14, height: 14,
                fontSize: 8, fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center",
                lineHeight: 1,
              }}>✕</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function AgentVoiceBar(props) {
  return (
    <ErrorBoundary scope="AgentVoiceBar">
      <AgentVoiceBarInner {...props} />
    </ErrorBoundary>
  );
}

// ── 7. AgentVoiceBar — bouton micro principal ──────────────────────────────────
function AgentVoiceBarInner({
  agent,
  onStart,
  label,
  variant = "full",   // "minimal" | "full"
  theme,
  isDarkMode,
  errorMsg,
  compact = false,
  showAgentSelector = true, // afficher le sélecteur d'agent si disponible
}) {
  const { isConnected, isSpeaking, status, activeAgent, switchoverToast } = agent || {};
  const isConnecting = status === "connecting";

  const handleToggle = () => {
    if (isConnecting) return;
    // Déblocage SYNCHRONE audio iOS (WebRTC + HTML5). DOIT rester avant tout await.
    armIosAudio();
    haptic(15);
    if (isConnected) agent.stop?.();
    else onStart?.();
  };

  // ── Variante minimale (icône seule) ──────────────────────────────────────────
  if (variant === "minimal") {
    return (
      <button
        onClick={handleToggle}
        title={isConnected
          ? `Terminer (${activeAgent?.name || "Agent"})`
          : "Démarrer la conversation vocale"}
        style={{
          width: 38, height: 38, borderRadius: 12, border: "none",
          cursor: isConnecting ? "wait" : "pointer", flexShrink: 0,
          background: isConnected
            ? (isSpeaking
              ? "linear-gradient(135deg,#10B981,#059669)"
              : `linear-gradient(135deg,${activeAgent?.color || "#4D6BFE"},${activeAgent?.color || "#3451D1"}cc)`)
            : (isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)"),
          color: isConnected ? "white" : (isDarkMode ? "var(--mm-fg-muted)" : "var(--mm-fg)"),
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.25s",
          boxShadow: isConnected
            ? `0 4px 12px ${activeAgent?.color || "#4D6BFE"}55`
            : "none",
          position: "relative",
        }}
      >
        {isConnecting ? <span style={{ fontSize: 18 }}>⏳</span>
          : isConnected ? (isSpeaking ? <span style={{ fontSize: 18 }}>🗣️</span> : <span style={{ fontSize: 18 }}>🎙️</span>)
            : <span style={{ fontSize: 18 }}>📞</span>}
        {isConnected && !isSpeaking && (
          <span style={{
            position: "absolute", top: 5, right: 5, width: 7, height: 7,
            borderRadius: "50%", background: "#10B981",
            boxShadow: "0 0 6px #10B981", animation: "el-pulse 1.5s infinite"
          }} />
        )}
        <style>{`
          @keyframes el-spin  { 100% { transform: rotate(360deg); } }
          @keyframes el-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.6; transform:scale(1.3); } }
        `}</style>
      </button>
    );
  }

  // ── Variante complète ─────────────────────────────────────────────────────────
  const agentColor = activeAgent?.color || "#4D6BFE";
  const agentColorDark = agentColor + "cc";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* Sélecteur d'agent (si plusieurs agents configurés) */}
      {showAgentSelector && !isConnected && (
        <AgentSelector agent={agent} isDarkMode={isDarkMode} theme={theme} />
      )}

      {/* Bouton principal */}
      <button
        onClick={handleToggle}
        disabled={isConnecting}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: compact ? "12px 20px" : "16px 28px", borderRadius: 16,
          background: isConnected
            ? "linear-gradient(135deg,#EF4444,#B91C1C)"
            : `linear-gradient(135deg,${agentColor},${agentColorDark})`,
          color: "white", border: "none", cursor: isConnecting ? "wait" : "pointer",
          fontWeight: 800, fontSize: compact ? 14 : 16,
          boxShadow: isConnected
            ? "0 8px 20px rgba(239,68,68,0.35)"
            : `0 8px 20px ${agentColor}44`,
          transition: "all 0.3s", opacity: isConnecting ? 0.7 : 1,
          position: "relative", overflow: "hidden",
        }}
      >
        {/* Shimmer animé pendant la connexion */}
        {isConnecting && (
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
            animation: "el-shimmer 1.5s infinite",
          }} />
        )}

        <span style={{ fontSize: compact ? 18 : 22 }}>
          {isConnecting ? "⏳" : isConnected ? (isSpeaking ? "🗣️" : "🎙️") : "📞"}
        </span>

        <div style={{ textAlign: "left", flex: 1 }}>
          <div>
            {isConnecting ? "Connexion..."
              : isConnected ? "⏹️ Terminer l'appel"
                : (label || "📞 Démarrer la session vocale")}
          </div>
          {isConnected && activeAgent && (
            <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.85, marginTop: 2 }}>
              {activeAgent.emoji} {activeAgent.name} · {isSpeaking ? "Coach parle…" : "À toi de parler"}
            </div>
          )}
          {!isConnected && agent?.selectedAgentIndex !== null && agent?.selectedAgentIndex !== undefined && (
            <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.75, marginTop: 2 }}>
              {ELEVENLABS_AGENTS.find(a => a.index === agent.selectedAgentIndex)?.emoji}{" "}
              {ELEVENLABS_AGENTS.find(a => a.index === agent.selectedAgentIndex)?.name}
            </div>
          )}
        </div>

        {/* Visualizer audio */}
        {isConnected && (
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{
                width: 3, borderRadius: 2,
                height: isSpeaking ? `${4 + Math.abs(Math.sin(i * 1.1)) * 14}px` : "3px",
                background: "rgba(255,255,255,0.9)",
                animation: isSpeaking ? `el-bar 0.5s ${i * 0.1}s infinite alternate` : "none",
                transition: "height 0.15s ease",
              }} />
            ))}
          </div>
        )}
      </button>

      {/* Bande d'info agent actif */}
      {isConnected && activeAgent && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 10, fontSize: 11, fontWeight: 600,
          background: isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(77,107,254,0.05)",
          color: isDarkMode ? "#64748B" : "var(--mm-fg-muted)",
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(77,107,254,0.05)"}`,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", animation: "el-pulse 1.5s infinite", flexShrink: 0 }} />
          Session active · {activeAgent.emoji} {activeAgent.name} · {activeAgent.voiceDesc}
        </div>
      )}

      {/* Toast de bascule d'agent */}
      {switchoverToast && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 12, fontSize: 12, fontWeight: 700,
          background: isDarkMode ? "rgba(245,158,11,0.12)" : "#FFFBEB",
          color: "#D97706",
          border: "1px solid rgba(245,158,11,0.3)",
          animation: "el-fadeIn 0.3s ease",
        }}>
          <span style={{ fontSize: 16 }}>🔄</span>
          <span>
            Quota épuisé pour {switchoverToast.from?.emoji} <b>{switchoverToast.from?.name}</b>
            {switchoverToast.to
              ? <> → bascule sur {switchoverToast.to.emoji} <b>{switchoverToast.to.name}</b></>
              : <> — plus d'agents disponibles ce mois-ci</>
            }
          </span>
        </div>
      )}

      {/* Message d'erreur */}
      {errorMsg && (
        <div style={{
          padding: "8px 14px",
          background: isDarkMode ? "rgba(239,68,68,0.1)" : "#FEF2F2",
          color: "#EF4444", borderRadius: 10, fontSize: 12, fontWeight: 600,
          border: "1px solid rgba(239,68,68,0.2)",
        }}>
          ⚠️ {errorMsg}
        </div>
      )}

      <style>{`
        @keyframes el-spin    { 100% { transform: rotate(360deg); } }
        @keyframes el-pulse   { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.6; transform:scale(1.3); } }
        @keyframes el-bar     { 0% { transform: scaleY(0.4); } 100% { transform: scaleY(1.5); } }
        @keyframes el-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes el-fadeIn  { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
