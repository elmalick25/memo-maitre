// AgentVoiceBar.jsx — SHIM LiveKit
// ============================================================================
// Ce fichier remplace l'ancien AgentVoiceBar ElevenLabs. Il conserve la SURFACE
// d'API attendue par EnglishPractice.jsx (AGENT_VOICES, MODE_CONFIGS,
// useElevenLabsAgent, AgentSelector, default AgentVoiceBar) mais l'action
// concrète (démarrer une session vocale) est désormais déléguée à
// <LiveKitVoiceAssistant /> via le flag `isConnected` :
//
//   - agent.start(...)  → passe isConnected à true → EnglishPractice.jsx monte
//                         <LiveKitVoiceAssistant /> qui gère TOUTE la session
//                         LiveKit (JWT + dispatch de l'agent "assistant-53a").
//   - agent.stop()      → passe isConnected à false → l'overlay se démonte.
//
// L'implémentation ElevenLabs originale est archivée dans
// AgentVoiceBar.elevenlabs.bak.jsx.
// ============================================================================


import { useCallback, useMemo, useState } from "react";
import { armIosAudio } from "./lib/iosVoiceHardening";

// ── Compat: prompts et voix (utilisés ailleurs pour LiveKit à venir) ─────────
export const ELEVENLABS_AGENTS = [];
export const exhaustedAgentIds = new Set();

export function getAgentForMode() {
  return null;
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

// Les prompts restent utiles : ils seront réutilisés côté agent LiveKit/Gemini.
export const MODE_CONFIGS = {
  chat: ({ topic = "Free conversation", level = "intermediate", persona = "Standard", immersionMode = false } = {}) => ({
    mode: "chat",
    turn_timeout: 0.8,
    first_message: "",
    systemPrompt: [
      persona === "MMA"
        ? "You are HAMMER, a legendary MMA champion turned English coach."
        : persona === "Recruteur"
          ? "You are ALEX, a sharp Silicon Valley Tech Recruiter conducting a hyper-realistic mock interview."
          : "You are NOVA — a warm, magnetic English coach.",
      `Student level: ${level}. Current topic: "${topic}".`,
      immersionMode ? "IMMERSION MODE." : "CORRECTION STYLE: gentle inline tips.",
    ].join(" "),
  }),
  debate: ({ topic = "Technology is good for humanity", level = "intermediate" } = {}) => ({
    mode: "debate", turn_timeout: 0.8, first_message: "",
    systemPrompt: `You are ARGOS, a debate coach. Topic: "${topic}". Level: ${level}.`,
  }),
  roleplay: ({ scenario = "Job interview at Google", character = "Interviewer", level = "intermediate" } = {}) => ({
    mode: "roleplay", turn_timeout: 0.8, first_message: "",
    systemPrompt: `You embody "${character}" in scenario: "${scenario}". Level: ${level}.`,
  }),
  ielts: ({ part = 1 } = {}) => ({
    mode: "ielts", turn_timeout: 0.8,
    systemPrompt: `You are an IELTS Speaking examiner conducting Part ${part}.`,
  }),
  dictation: ({ text = "", level = "intermediate" } = {}) => ({
    mode: "dictation", turn_timeout: 1.2,
    systemPrompt: `You are a dictation coach. Text: "${text}". Level: ${level}.`,
  }),
  accent: ({ targetSound = "th", phrase = "", level = "intermediate" } = {}) => ({
    mode: "accent", turn_timeout: 0.8, first_message: "",
    systemPrompt: `You are SAGE, pronunciation coach on "${targetSound}". ${phrase ? `Phrase: "${phrase}".` : ""} Level: ${level}.`,
  }),
};

// ── Hook LiveKit shim ────────────────────────────────────────────────────────
// On garde le nom `useElevenLabsAgent` (utilisé partout dans EnglishPractice.jsx)
// mais l'implémentation ne parle plus à ElevenLabs : elle sert de commutateur
// pour ouvrir/fermer le composant <LiveKitVoiceAssistant />.
export function useElevenLabsAgent() {
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const start = useCallback(async (_config) => {
    // La config (MODE_CONFIGS.chat / debate / roleplay / ielts / ...) n'est plus
    // utilisée : c'est l'agent LiveKit `assistant-53a` (worker Python) qui porte
    // le prompt et le comportement. On se contente d'ouvrir la session.
    setIsConnected(true);
  }, []);

  const stop = useCallback(async () => {
    setIsConnected(false);
  }, []);

  const setOnAgentExhausted = useCallback(() => {}, []);

  return useMemo(() => ({
    isConnected,
    isSpeaking: false,
    status: isConnected ? "connected" : "idle",
    transcript: [],
    activeAgent: null,
    selectedAgentIndex,
    setSelectedAgentIndex,
    start,
    stop,
    wsCloseInfoRef: { current: { code: 0, reason: "" } },
    switchoverToast: null,
    setOnAgentExhausted,
  }), [isConnected, selectedAgentIndex, start, stop, setOnAgentExhausted]);
}

// ── AgentSelector : n'affiche plus rien ─────────────────────────────────────
export function AgentSelector() {
  return null;
}

// ── AgentVoiceBar : bouton micro qui lance la session LiveKit ───────────────
// Utilisé dans EnglishPractice.jsx avec les props { agent, variant, onStart, ... }.
// onStart() est appelé AVANT agent.start(config) — on préserve ce contrat.
export default function AgentVoiceBar({ agent, onStart, variant = "default" } = {}) {
  const isConnected = agent?.isConnected;

  const handleClick = useCallback(() => {
    if (!agent) return;
    if (isConnected) {
      agent.stop?.();
      return;
    }
    // 🔑 MOBILE FIX: débloque l'AudioContext iOS/Android de façon SYNCHRONE
    // avant tout await. Doit être la 1ère instruction dans le handler onClick.
    armIosAudio();
    try { onStart?.(); } catch (e) { console.warn("[AgentVoiceBar] onStart threw", e); }
    // Si onStart n'a pas déclenché start() lui-même (certains callers le font),
    // on le fait ici pour être sûr d'ouvrir la session LiveKit.
    if (!agent.isConnected) {
      agent.start?.();
    }
  }, [agent, isConnected, onStart]);

  const size = variant === "minimal" ? 44 : 56;
  const label = isConnected ? "Arrêter" : "Parler à NOVA";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      style={{
        width: size, height: size, borderRadius: "50%",
        border: "none", cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: isConnected
          ? "linear-gradient(135deg, #10B981, #059669)"
          : "linear-gradient(135deg, #6366F1, #8B5CF6)",
        color: "white",
        fontSize: variant === "minimal" ? 18 : 22,
        boxShadow: isConnected
          ? "0 0 0 4px rgba(16,185,129,0.25), 0 8px 20px rgba(16,185,129,0.35)"
          : "0 8px 20px rgba(99,102,241,0.35)",
        transition: "all 0.2s",
        flexShrink: 0,
      }}
    >
      {isConnected ? "⏹" : "🎙️"}
    </button>
  );
}

