// EnglishPractice.jsx – GOD LEVEL v12 · audit-fix v1 (autonome) — PATCHÉ
// Tous les états, refs et fonctions sont gérés ici.
// MemoMaster ne passe que les dépendances externes :
//   callClaude, getNextGroqKey,
//   storage, expressions, setExpressions, setStats, showToast,
//   theme, isDarkMode

import { safeHTML } from "./lib/htmlSanitizer";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import EnglishInTheWild from "./EnglishInTheWild";
import AgentVoiceBar, { AGENT_VOICES, useElevenLabsAgent, MODE_CONFIGS } from "./AgentVoiceBar";
import { registerAgentClientTool, setContextSnapshotBuilder } from "./lib/agentClientTools";
import { summarizeForContinuity } from "./lib/agentSessionMemory";
import { ConversationProvider } from "@elevenlabs/react";
import { useAgentCardDetector } from "./useAgentCardDetector";
import AgentCardToast from "./AgentCardToast";
import { cleanSpeechTranscript, isMeaninglessSpeech, SPEECH_HYGIENE_PROMPT } from "./utils/speechCleanup";

import { useNovaAgent } from "./lib/useNovaAgent";
import { loadSRSData, recordReview, getSRSStats, getHeatmapData, getWeeklyStatsForClaude, formatTimeUntil, SCORE_BUTTONS, defaultCardState } from "./lib/SRSEngine";
import LiveNewsModule from "./components/LiveNewsModule";
import { useXP } from "./hooks/useXP";
import { useCEFR } from "./hooks/useCEFR";
import CEFRTracker from "./components/CEFRTracker";
import CoachSpeedListening from "./components/CoachSpeedListening";
import CoachNewsAnchor from "./components/CoachNewsAnchor";
import BattleMode from "./components/BattleMode";
import AccentTraining from "./components/AccentTraining";
import SpeakItChallenge from "./components/SpeakItChallenge";

import { speakWithGroq } from "./lib/groqTTS";
import LiveKitVoiceAssistant from "./components/LiveKitVoiceAssistant";
// ══════════════════════════════════════════════════════════════════════════════
// 🎙️ GOD MODE : Voice Mirror (Interface Vocale Plein Écran)
// ══════════════════════════════════════════════════════════════════════════════
export function VoiceMirror({ agent, transcript, onStop, onTerminateSession, theme, isDarkMode, targetExpressions = [] }) {
  const isSpeaking = agent?.isSpeaking;
  const isConnected = agent?.status === "connected" || agent?.isNova;
  const isNova = agent?.isNova;
  const isNovaRecording = agent?.novaIsRecording;
  const isNovaLoading = agent?.novaIsLoading;

  const reversedTranscript = [...(transcript || [])].reverse();
  const lastUserMsg = reversedTranscript.find(m => m.role === "user");
  const lastAgentMsg = reversedTranscript.find(m => m.role === "agent");

  // Remove emotion tags like [laughs], *smiles*, (happy), etc.
  const cleanText = (text) => {
    if (!text) return "";
    return text.replace(/\[.*?\]|\*.*?\*|\(.*?\)/g, "").trim();
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: isDarkMode ? "radial-gradient(circle at center, var(--mm-bg-elev), var(--mm-bg))" : "radial-gradient(circle at center, var(--mm-bg-elev), var(--mm-border))",
      zIndex: 99999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      overflow: "hidden"
    }}>
      {/* Active Recall HUD */}
      {targetExpressions && targetExpressions.length > 0 && (
        <div style={{
          position: "absolute", top: 30, left: 30, zIndex: 20,
          background: isDarkMode ? "rgba(30, 41, 59, 0.7)" : "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(12px)", borderRadius: 16, padding: "20px",
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)", width: 280
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "#10B981", marginBottom: 12 }}>
            🎯 Missions de session
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {targetExpressions.map(ex => {
              // Check if the user used the expression
              const isUsed = reversedTranscript.some(m => m.role === "user" && m.text.toLowerCase().includes(ex.front.toLowerCase()));
              return (
                <div key={ex.id || ex.front} style={{ display: "flex", alignItems: "flex-start", gap: 10, transition: "all 0.3s" }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                    background: isUsed ? "#10B981" : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontSize: 12, transition: "all 0.5s",
                    boxShadow: isUsed ? "0 0 10px rgba(16,185,129,0.5)" : "none"
                  }}>
                    {isUsed ? "✓" : ""}
                  </div>
                  <div style={{ opacity: isUsed ? 0.5 : 1, textDecoration: isUsed ? "line-through" : "none", transition: "all 0.3s" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: isDarkMode ? "#FFF" : "#000" }}>{ex.front}</div>
                    <div style={{ fontSize: 12, color: isDarkMode ? "#94A3B8" : "#64748B", marginTop: 2 }}>{ex.back}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Animated Astral Background */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "150vw", height: "150vw",
        background: isSpeaking ? "conic-gradient(from 0deg, rgba(16,185,129,0.15), rgba(77, 107, 254,0.25), rgba(16,185,129,0.15))" : "conic-gradient(from 0deg, rgba(77, 107, 254,0.05), rgba(77, 107, 254,0.15), rgba(77, 107, 254,0.05))",
        animation: "spin 20s linear infinite",
        filter: "blur(60px)",
        opacity: isConnected ? 1 : 0,
        transition: "all 1s ease"
      }} />

      {/* Main Orb / Visualizer */}
      <div style={{
        position: "relative", width: 180, height: 180, borderRadius: "50%",
        background: isSpeaking ? "linear-gradient(135deg, #10B981, #34D399)" : "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))",
        boxShadow: isSpeaking ? "0 0 80px rgba(16,185,129,0.6), inset 0 0 40px rgba(255,255,255,0.4)" : "0 0 60px rgba(77, 107, 254,0.4), inset 0 0 30px rgba(255,255,255,0.2)",
        animation: isSpeaking ? "pulse 0.8s infinite alternate" : "pulse 2.5s infinite alternate",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10, transition: "all 0.5s ease"
      }}>
        <div style={{ fontSize: 60, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))" }}>
          {isSpeaking ? "🗣️" : "✨"}
        </div>
      </div>

      {/* Status Text */}
      <div style={{
        marginTop: 50, fontSize: 16, fontWeight: 800, textTransform: "uppercase", letterSpacing: 4,
        color: isSpeaking ? "#10B981" : (isDarkMode ? "var(--mm-fg-muted)" : "#64748B"),
        zIndex: 10, animation: "fadeUp 0.5s ease"
      }}>
        {isSpeaking ? "Coach is speaking..." : "Listening to you..."}
      </div>

      {/* Subtitles Area */}
      <div className="timeline-scrollbar" style={{
        marginTop: 60, width: "85%", maxWidth: 900, textAlign: "center", zIndex: 10,
        display: "flex", flexDirection: "column", gap: 24, minHeight: 160,
        maxHeight: "40vh", overflowY: "auto", paddingBottom: "100px"
      }}>
        {lastUserMsg && (
          <div style={{ fontSize: 22, color: isDarkMode ? "var(--mm-border-strong)" : "var(--mm-fg)", opacity: 0.8, fontStyle: "italic", animation: "fadeUp 0.4s ease" }}>
            "{cleanText(lastUserMsg.text)}"
          </div>
        )}
        {lastAgentMsg && (
          <div style={{ fontSize: 32, fontWeight: 700, color: isDarkMode ? "#FFFFFF" : "#000000", lineHeight: 1.4, animation: "fadeUp 0.4s ease" }}>
            {cleanText(lastAgentMsg.text)}
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div style={{ position: "absolute", bottom: 60, zIndex: 10, display: "flex", gap: 20 }}>
        {isNova && (
          <button
            onClick={async () => {
              if (isNovaRecording) {
                const blob = await agent.novaStopRecording();
                if (blob) {
                  try {
                    const text = await agent.novaTranscribe(blob);
                    if (text && agent.onNovaTranscript) agent.onNovaTranscript(text);
                  } catch (e) { console.error(e); }
                }
              } else {
                await agent.novaStartRecording();
              }
            }}
            disabled={isNovaLoading && !isNovaRecording}
            style={{
              padding: "16px 36px", borderRadius: 100, border: `2px solid ${isNovaRecording ? "#EF4444" : "#10B981"}`, cursor: (isNovaLoading && !isNovaRecording) ? "wait" : "pointer",
              background: isNovaRecording ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)", color: isNovaRecording ? "#EF4444" : "#10B981", fontWeight: 800, fontSize: 16,
              backdropFilter: "blur(10px)", display: "flex", alignItems: "center", gap: 10,
              boxShadow: `0 10px 30px ${isNovaRecording ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)"}`, transition: "all 0.3s"
            }}
          >
            <span style={{ fontSize: 22, animation: isNovaRecording ? "pulse 1.5s infinite" : (isNovaLoading ? "spin 2s linear infinite" : "none") }}>
              {isNovaRecording ? "🔴" : (isNovaLoading ? "⏳" : "🎙️")}
            </span>
            {isNovaRecording ? "Terminer" : (isNovaLoading ? "Transcription..." : "Parler à Nova")}
          </button>
        )}
        <button
          onClick={() => {
            if (onTerminateSession) onTerminateSession();
            onStop();
          }}
          style={{
            padding: "16px 36px", borderRadius: 100, border: `2px solid ${isDarkMode ? "rgba(148, 163, 184, 0.3)" : "rgba(100, 116, 139, 0.3)"}`, cursor: "pointer",
            background: isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)", color: isDarkMode ? "var(--mm-border)" : "var(--mm-fg)", fontWeight: 800, fontSize: 16,
            backdropFilter: "blur(10px)", display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 10px 30px rgba(77,107,254,0.1)", transition: "all 0.3s"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = isDarkMode ? "rgba(71, 85, 105, 0.6)" : "rgba(203, 213, 225, 0.6)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)"; }}
        >
          <span style={{ fontSize: 22 }}>📝</span> Mode Texte
        </button>
        <button
          onClick={() => {
            if (onTerminateSession) onTerminateSession();
            onStop();
          }}
          style={{
            padding: "16px 36px", borderRadius: 100, border: "2px solid rgba(239, 68, 68, 0.3)", cursor: "pointer",
            background: "rgba(239, 68, 68, 0.15)", color: "#EF4444", fontWeight: 800, fontSize: 16,
            backdropFilter: "blur(10px)", display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 10px 30px rgba(239, 68, 68, 0.2)", transition: "all 0.3s"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#EF4444"; e.currentTarget.style.color = "white"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)"; e.currentTarget.style.color = "#EF4444"; }}
        >
          <span style={{ fontSize: 22 }}>⏹️</span> Terminer l'Ascension
        </button>
      </div>

      <style>{`
        @keyframes spin { 100% { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes pulse { 0% { transform: scale(1); } 100% { transform: scale(1.08); } }
        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CoachAnalyzeListener — Pont entre SpeechRecognition.onend (closure figée)
// et le state React via un CustomEvent + useEffect.
// ══════════════════════════════════════════════════════════════════════════════
function CoachAnalyzeListener({ coachPhrase, coachTranscript, analyzeWithClaude }) {
  React.useEffect(() => {
    const handler = () => {
      if (coachPhrase && coachTranscript) {
        analyzeWithClaude(coachPhrase.text, coachTranscript);
      }
    };
    window.addEventListener("coach-analyze", handler);
    return () => window.removeEventListener("coach-analyze", handler);
  }, [coachPhrase, coachTranscript, analyzeWithClaude]);
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// 🎙️ NovaMicButton — Bouton click-to-toggle (appuie pour démarrer, réappuie pour arrêter)
// FIX: anciennement push-to-talk (hold), ce qui causait une fermeture immédiate sur mobile
// car touchstart + touchend se déclenchaient trop vite pour la Promise getUserMedia async.
// ══════════════════════════════════════════════════════════════════════════════
function NovaMicButton({ novaVoice, disabled, isDarkMode }) {
  const isRecording = novaVoice.isRecording;
  const isLoading = novaVoice.isLoading;
  const isSpeaking = novaVoice.isSpeaking;
  const hasError = !!novaVoice.error;

  const stateLabel = isRecording
    ? "Clique pour arrêter"
    : isLoading
      ? "Traitement…"
      : isSpeaking
        ? "Nova parle…"
        : "Clique pour parler";

  const orbColor = isRecording
    ? "#EF4444"
    : isLoading
      ? "#F59E0B"
      : isSpeaking
        ? "#10B981"
        : "var(--mm-primary)";

  const orbGlow = isRecording
    ? "0 0 0 8px rgba(239,68,68,0.15), 0 0 0 16px rgba(239,68,68,0.07)"
    : isLoading
      ? "0 0 0 8px rgba(245,158,11,0.15)"
      : isSpeaking
        ? "0 0 0 8px rgba(16,185,129,0.2), 0 0 0 18px rgba(16,185,129,0.08)"
        : isDarkMode
          ? "0 0 0 6px rgba(77,107,254,0.12)"
          : "0 0 0 4px rgba(77,107,254,0.08)";

  // Toggle : un clic démarre l'enregistrement, un 2e clic l'arrête.
  // Compatible iOS Safari (getUserMedia dans le handler synchrone du click).
  const handleToggle = (e) => {
    e.preventDefault();
    if (disabled || isLoading) return;

    if (isRecording) {
      // Arrêter l'enregistrement
      novaVoice.stopPTT();
    } else {
      // Démarrer : lancer getUserMedia de façon synchrone dans le handler (iOS)
      const streamPromise = navigator.mediaDevices?.getUserMedia({ audio: true }).catch(() => null);
      novaVoice.startPTT(streamPromise);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, userSelect: "none" }}>
      <button
        onClick={handleToggle}
        disabled={disabled}
        title={stateLabel}
        style={{
          position: "relative",
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: `2px solid ${orbColor}`,
          background: isRecording
            ? "radial-gradient(circle at 40% 35%, #FF6B6B, #EF4444)"
            : isLoading
              ? "radial-gradient(circle at 40% 35%, #FCD34D, #F59E0B)"
              : isSpeaking
                ? "radial-gradient(circle at 40% 35%, #34D399, #10B981)"
                : isDarkMode
                  ? "radial-gradient(circle at 40% 35%, rgba(129,140,248,0.25), rgba(77,107,254,0.12))"
                  : "radial-gradient(circle at 40% 35%, rgba(129,140,248,0.18), rgba(77,107,254,0.06))",
          boxShadow: orbGlow,
          cursor: disabled ? "not-allowed" : isLoading ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          transform: isRecording ? "scale(1.15)" : "scale(1)",
          flexShrink: 0,
          outline: "none",
          WebkitTapHighlightColor: "transparent",
          animation: isRecording
            ? "nova-ptt-ring 1s ease-in-out infinite"
            : isSpeaking
              ? "nova-ptt-speak 1.6s ease-in-out infinite"
              : "none",
        }}
      >
        <span style={{
          fontSize: isRecording ? 20 : 18,
          lineHeight: 1,
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))",
          transition: "font-size 0.2s",
          pointerEvents: "none",
        }}>
          {isLoading ? "⏳" : isRecording ? "🔴" : isSpeaking ? "🔊" : "🎤"}
        </span>
        {isRecording && (
          <span style={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            border: "2px solid rgba(239,68,68,0.4)",
            animation: "nova-wave-out 1s ease-out infinite",
            pointerEvents: "none",
          }} />
        )}
      </button>
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.5,
        color: isRecording ? "#EF4444" : isLoading ? "#F59E0B" : isSpeaking ? "#10B981" : isDarkMode ? "var(--mm-fg-muted)" : "#94A3B8",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        textAlign: "center",
        transition: "color 0.3s",
        lineHeight: 1.2,
      }}>
        {isRecording ? "● REC" : isLoading ? "◌ AI..." : isSpeaking ? "▶ NOVA" : "⬤ TAP"}
      </span>
      {hasError && (
        <span title={novaVoice.error} style={{ fontSize: 10, color: "#EF4444", cursor: "help" }}>⚠️</span>
      )}
      <style>{`
        @keyframes nova-ptt-ring {
          0%,100% { box-shadow: 0 0 0 6px rgba(239,68,68,0.2), 0 0 0 14px rgba(239,68,68,0.06); }
          50%      { box-shadow: 0 0 0 10px rgba(239,68,68,0.3), 0 0 0 22px rgba(239,68,68,0.10); }
        }
        @keyframes nova-ptt-speak {
          0%,100% { box-shadow: 0 0 0 6px rgba(16,185,129,0.2), 0 0 0 14px rgba(16,185,129,0.06); }
          50%      { box-shadow: 0 0 0 12px rgba(16,185,129,0.3), 0 0 0 24px rgba(16,185,129,0.10); }
        }
        @keyframes nova-wave-out {
          0%   { transform: scale(1); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

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
  const targetExpressions = React.useMemo(() => {
    if (!expressions || !Array.isArray(expressions)) return [];
    const now = new Date();
    return expressions
      .filter(ex => {
        if (!ex.category) return false;
        const cat = ex.category.toLowerCase();
        if (!cat.includes("anglais") && !cat.includes("english") && !ex.category.includes("🇬🇧")) return false;
        
        const isDue = ex.next_review && new Date(ex.next_review) <= now;
        const isLearning = ex.repetitions > 0 && ex.interval < 5;
        return isDue || isLearning;
      })
      .sort((a, b) => new Date(a.next_review || 0).getTime() - new Date(b.next_review || 0).getTime())
      .slice(0, 3);
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
    } catch {}
    return !isMobile; // muted by default on desktop, unmuted on mobile
  });
  useEffect(() => {
    try { localStorage.setItem("nova_chat_tts_muted", chatTtsMuted ? "1" : "0"); } catch {}
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
  const [practiceVocabFSRS, setPracticeVocabFSRS] = useState(true);
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
  const [practiceWritingLoading, setPracticeWritingLoading] = useState(false);
  const [practiceWritingPrompt, setPracticeWritingPrompt] = useState("");
  const [practiceWritingDrafts, setPracticeWritingDrafts] = useState([]);
  const [practiceWritingActiveId, setPracticeWritingActiveId] = useState(null);
  const [showDraftsModal, setShowDraftsModal] = useState(false);

  const [practiceSpeakingAudioBlob, setPracticeSpeakingAudioBlob] = useState(null);
  const [practiceSpeakingTranscript, setPracticeSpeakingTranscript] = useState("");
  const [practiceSpeakingFeedback, setPracticeSpeakingFeedback] = useState(null);
  const [practiceSpeakingLoading, setPracticeSpeakingLoading] = useState(false);
  const [practiceSpeakingPrompt, setPracticeSpeakingPrompt] = useState("");
  const [practiceSpeakingIsRecording, setPracticeSpeakingIsRecording] = useState(false);
  const [practiceSpeakingCountdown, setPracticeSpeakingCountdown] = useState(10);
  const [practiceWaveformBars, setPracticeWaveformBars] = useState([]);
  const [practicePhonemeData, setPracticePhonemeData] = useState(null);

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

  // ── SRS (Spaced Repetition System) ──────────────────────────────────────────────────
  const [srsData, setSrsData] = useState({});        // { [id]: CardState }
  const [srsLoaded, setSrsLoaded] = useState(false);
  const [srsReviewing, setSrsReviewing] = useState(null);      // expression being reviewed
  const [srsNarrative, setSrsNarrative] = useState("");         // Claude weekly analysis
  const [srsNarrLoading, setSrsNarrLoading] = useState(false);
  const [srsShowBack, setSrsShowBack] = useState(false);     // flip card
  const [srsFilter, setSrsFilter] = useState("overdue"); // "overdue" | "today" | "all"
  const srsDataRef = useRef({});  // always current srsData for async callbacks

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
            storage.set("nova_practice_messages", initialMsgs).catch(() => {});
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
    }).catch(() => {});

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
    }).catch(() => {});

    // Load Coach Pronunciation
    storage.get("nova_coach").then(saved => {
      if (saved) {
        setCoachPhrase(saved.phrase || null);
        setCoachFeedback(saved.feedback || null);
        setCoachTranscript(saved.transcript || "");
        if (saved.difficulty !== undefined) setCoachDifficulty(saved.difficulty);
      }
    }).catch(() => {});

    // Load Exam
    storage.get("nova_exam").then(saved => {
      if (saved) {
        setPracticeExamQuestions(saved.questions || []);
        setPracticeExamAnswers(saved.answers || []);
        setPracticeExamScore(saved.score !== undefined ? saved.score : null);
        setPracticeExamSection(saved.section || "reading");
      }
    }).catch(() => {});

    // Load Writing Drafts
    storage.get("nova_writing_drafts").then(saved => {
      if (saved && Array.isArray(saved)) {
        setPracticeWritingDrafts(saved);
        if (saved.length > 0) {
          const lastDraft = saved[0];
          setPracticeWritingActiveId(lastDraft.id);
          setPracticeWritingText(lastDraft.text || "");
          setPracticeWritingPrompt(lastDraft.prompt || "");
          setPracticeWritingFeedback(lastDraft.feedback || null);
        }
      }
    }).catch(() => {});

    // Unmount hook for saving Memory
    return () => {
      if (practiceMsgRef.current && practiceMsgRef.current.length > 3) {
        generateSessionMemoryPayload(practiceMsgRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save chat messages
  useEffect(() => {
    if (practiceMessages.length > 0 && !(practiceMessages.length === 1 && practiceMessages[0].text === "...")) {
      storage.set("nova_practice_messages", practiceMessages).catch(() => {});
    }
  }, [practiceMessages]);

  // Auto-save daily challenge
  useEffect(() => {
    if (practiceDailyChallenge) {
      storage.set("nova_daily_challenge", {
        challenge: practiceDailyChallenge,
        answer: practiceDailyAnswer,
        result: practiceDailyResult
      }).catch(() => {});
    } else {
      storage.set("nova_daily_challenge", null).catch(() => {});
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
      }).catch(() => {});
    } else {
      storage.set("nova_dictation", null).catch(() => {});
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
        storage.set("nova_writing_drafts", next).catch(() => {});
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
      }).catch(() => {});
    } else {
      storage.set("nova_coach", null).catch(() => {});
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
      }).catch(() => {});
    } else {
      storage.set("nova_exam", null).catch(() => {});
    }
  }, [practiceExamQuestions, practiceExamAnswers, practiceExamScore, practiceExamSection]);

  // ── Sync transcript Nova PTT → bulles du chat ────────────────────────────
  // novaVoice.transcript accumule { role, text }. On injecte chaque nouveau
  // message dans practiceMessages pour qu'il apparaisse dans l'UI du chat.
  const lastNovaTxLenRef = useRef(0);
  useEffect(() => {
    const tx = novaVoice.transcript;
    if (!tx || tx.length <= lastNovaTxLenRef.current) return;
    const newMessages = tx.slice(lastNovaTxLenRef.current);
    lastNovaTxLenRef.current = tx.length;
    newMessages.forEach(({ role, text }) => {
      if (role === "user") {
        // Ajouter la bulle utilisateur sans re-déclencher sendPracticeMessage
        // (la réponse IA est déjà gérée par le pipeline Nova TTS)
        setPracticeMessages(prev => [...prev, { role: "user", text }]);
        setAgentTranscript(prev => [...prev, { role: "user", text }]);
      } else if (role === "agent") {
        // Ajouter la bulle coach avec le texte de Nova
        setPracticeMessages(prev => [...prev, { role: "assistant", text }]);
        setAgentTranscript(prev => [...prev, { role: "agent", text }]);
      }
    });
  }, [novaVoice.transcript]);

  // ── Wrapper Nova Agent pour VoiceMirror ──────────────────────────────────────
  const novaAgent = useMemo(() => ({
    isConnected: true,
    isSpeaking: novaVoice.isSpeaking,
    status: novaVoice.isRecording ? "recording" : (novaVoice.isLoading ? "loading" : "connected"),
    isNova: true,
    novaStartRecording: novaVoice.start,
    novaStopRecording: novaVoice.stop,
    novaTranscribe: () => { }, // Handled automatically by the hook now
    novaIsRecording: novaVoice.isRecording,
    novaIsLoading: novaVoice.isLoading,
    stop: () => {
      novaVoice.stop();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setIsVoiceChatActive(false);
    },
    // Le onNovaTranscript sera attaché dynamiquement
  }), [novaVoice.isSpeaking, novaVoice.isRecording, novaVoice.isLoading, novaVoice.start, novaVoice.stop]);

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
      setAgentError(`⚠️ Session vocale interrompue par ElevenLabs. ${hint} — Ouvre F12 → Console pour le détail.`);
    } else {
      setAgentError("");
    }
  }, [agent.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice Chat (VoiceMirror) ─────────────────────────────────────────────
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [voiceChatMode, setVoiceChatMode] = useState(null); // { mode, config }

  novaAgent.onNovaTranscript = (text) => {
    // FIX: voice-initiated messages must force vocal reply
    sendPracticeMessage(text, true, true);
  };

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
        const srsStats = getSRSStats(expressions, srsData);
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
      setExpressions(prev => [
        ...prev,
        { id, front: String(front).trim(), back: String(back).trim(),
          example: example ? String(example) : "",
          category: category ? String(category) : (practiceTopic || "Voice Coach"),
          createdAt: now, updatedAt: now },
      ]);
      try { awardXP(15, 3, `🎙️ Nouvelle expression via coach vocal : ${front}`); } catch {}
      try { showToast?.(`✨ Ajoutée : ${front}`); } catch {}
      return { ok: true, id };
    }));
    // mark_correction : logge une correction dans la mémoire de coach
    unreg.push(registerAgentClientTool("mark_correction", ({ original, corrected, note } = {}) => {
      try {
        const key = "mm_agent_corrections_v1";
        let list = [];
        try {
          list = JSON.parse(localStorage.getItem(key) || "[]");
        } catch(e) {
          list = [];
        }
        list.push({ ts: Date.now(), original, corrected, note });
        localStorage.setItem(key, JSON.stringify(list.slice(-100)));
      } catch {}
      return { ok: true };
    }));
    // award_xp : l'agent récompense un effort
    unreg.push(registerAgentClientTool("award_xp", ({ amount, reason } = {}) => {
      const n = Math.max(1, Math.min(50, Number(amount) || 10));
      try { awardXP(n, Math.round(n / 3), reason || "🎙️ Effort vocal"); } catch {}
      return { ok: true, amount: n };
    }));
    // end_session_summary : recap structuré à la fin
    unreg.push(registerAgentClientTool("end_session_summary", (payload = {}) => {
      try {
        const key = "mm_agent_last_summary_v1";
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), ...payload }));
      } catch {}
      return { ok: true };
    }));

    return () => { unreg.forEach(u => u()); };
  }, [expressions, srsData, targetExpressions, xpState, cefrState, practiceTopic, setExpressions, awardXP, showToast]);

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
  }, [clearPending, sessionCreatedCards, showToast]);

  // ── Construit le system prompt ElevenLabs enrichi avec la mémoire de session ─
  // Même logique que sendPracticeMessage mais formaté pour l'agent vocal.
  const buildElevenLabsSystemPrompt = useCallback(({ topic, level, persona, immersionMode } = {}) => {
    const personaInst = persona === "MMA"
      ? "Act like an aggressive MMA Fighter."
      : persona === "Recruteur"
        ? "Act like a strict Tech Recruiter."
        : "You are NOVA — a GOD-TIER Astral English Coach. Your vibe: warm, magnetic, endlessly encouraging. You treat every student like your closest friend having a breakthrough moment.";

    const immersionInst = immersionMode
      ? "IMMERSION MODE: Never correct grammar mid-conversation. Never switch to French. Flow naturally like a native friend."
      : "CORRECTION STYLE: If the student makes a grammar mistake, gently note the fix in parentheses at the end of your reply. One correction max per reply.";

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
      "CRITICAL RULES: Replies 1–3 sentences MAX. Always end with one engaging open question. React with genuine human emotion. NEVER give lists or bullet points. Speak like a real human coach.",
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
    if (targetExpressions && targetExpressions.length > 0) {
      const expList = targetExpressions.map(ex =>
        `"${ex.front}" (meaning: ${ex.back})${ex.example ? ` - Example: "${ex.example}"` : ''}`
      ).join(" | ");
      activeRecallInst = `[ACTIVE RECALL MISSION] The student is currently learning these expressions: ${expList}. Subtly steer the conversation to create natural opportunities for the student to use them. If they use one correctly, acknowledge it enthusiastically.`;
    }

    return [
      `You are NOVA — a GOD-TIER Astral English Coach. Your vibe: warm, magnetic, endlessly encouraging. You treat every student like your closest friend having a breakthrough moment.`,
      nameInst,
      "CORRECTION STYLE: If the student makes a grammar mistake, gently note the fix in parentheses at the end of your reply. One correction max per reply.",
      profileInst,
      continuityInst,
      relationshipInst,
      activeRecallInst,
      "CRITICAL RULES: Replies 1–3 sentences MAX. Always end with one engaging open question. React with genuine human emotion. NEVER give lists or bullet points. Speak like a real human coach.",
    ].filter(Boolean).join("\n");
  }, [targetExpressions, studentName]);

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
  const isShadowingRef = useRef(false);      // verrou pour startShadowing / analyzeShadowing
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

  // ── Sync LiveKit transcriptions → agentTranscript (pour détection auto de fiches) ──
  const lastLkSyncedIdRef = useRef(null);
  useEffect(() => {
    if (!liveKitTranscriptions?.length) return;
    // On ne traite que les messages finaux non encore synchronisés
    const finalMsgs = liveKitTranscriptions.filter(m => m.isFinal);
    if (!finalMsgs.length) return;
    const lastMsg = finalMsgs[finalMsgs.length - 1];
    if (lastMsg.id === lastLkSyncedIdRef.current) return;

    // Cherche la paire : dernier message agent + dernier message user avant lui
    const lastAgentMsg = [...finalMsgs].reverse().find(m => m.name === "assistant-53a");
    if (!lastAgentMsg) return;
    if (lastAgentMsg.id === lastLkSyncedIdRef.current) return;

    const agentMsgIdx = finalMsgs.indexOf(lastAgentMsg);
    const lastUserMsg = finalMsgs.slice(0, agentMsgIdx).reverse().find(m => m.name !== "assistant-53a");

    // Injecte la paire dans agentTranscript pour que le détecteur de fiches l'analyse
    setAgentTranscript(prev => {
      const existingTexts = new Set(prev.map(m => m.text?.trim()));
      const toAdd = [];
      if (lastUserMsg && !existingTexts.has(lastUserMsg.text?.trim())) {
        toAdd.push({ role: "user", text: lastUserMsg.text || "" });
      }
      if (!existingTexts.has(lastAgentMsg.text?.trim())) {
        toAdd.push({ role: "agent", text: lastAgentMsg.text || "" });
      }
      if (!toAdd.length) return prev;
      return [...prev, ...toAdd];
    });
    lastLkSyncedIdRef.current = lastAgentMsg.id;
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

  // Load SRS data from storage
  useEffect(() => {
    if (srsLoaded) return;
    loadSRSData(storage).then(data => {
      setSrsData(data);
      srsDataRef.current = data;
      setSrsLoaded(true);
    });
  }, [srsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep ref in sync
  useEffect(() => { srsDataRef.current = srsData; }, [srsData]);

  // Restore last active sub-view so navigating away and back keeps context
  useEffect(() => {
    const VALID_VIEWS = ["chat", "daily", "debate", "roleplay", "dictation", "writing", "speaking", "ielts", "dashboard", "achievements", "brainmap", "accent", "exam", "notebook", "wild", "coach", "srs", "news", "cefr"];
    storage.get("english_subview").then(saved => {
      if (saved && VALID_VIEWS.includes(saved)) setPracticeSubView(saved);
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

    // Détecte mobile (Chrome Android/iOS) — speechSynthesis y est peu fiable
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // Sur mobile : Groq TTS en priorité (mobile-safe, pas de restriction autoplay)
    if (isMobile) {
      const groqKeyObj = getNextGroqKey?.();
      if (groqKeyObj?.key) {
        setPracticeSpeaking(true);
        speakWithGroq(text, {
          apiKey: groqKeyObj.key,
          lang: "en-US",
          voice: "tara",
          onStart: () => setPracticeSpeaking(true),
          onEnd: () => setPracticeSpeaking(false),
          onError: (e) => {
            console.warn("[TTS mobile] Groq échoue, fallback Web Speech:", e);
            setPracticeSpeaking(false);
            // Fallback Web Speech sur mobile en dernier recours
            if (window.speechSynthesis) {
              const u = new SpeechSynthesisUtterance(text);
              u.lang = "en-US"; u.rate = ttsRate;
              u.onend = () => setPracticeSpeaking(false);
              window.speechSynthesis.speak(u);
            }
          },
        }).catch(() => setPracticeSpeaking(false));
        return true;
      }
    }

    // Desktop : Web Speech API (fiable ici)
    if (!window.speechSynthesis) { showToast("🔇 Synthèse vocale non supportée.", "warning"); return false; }
    try { window.speechSynthesis.cancel(); } catch { }
    const voices = window.speechSynthesis.getVoices();

    const pickVoice = (vList) => {
      if (!vList.length) return null;
      return vList.find(v => v.name === ttsVoice)
        || vList.find(v => v.lang.startsWith("en") && !MALE_MARKERS.test(v.name))
        || vList.find(v => v.lang.startsWith("en"))
        || vList[0];
    };

    const buildAndSpeak = (vList) => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US"; utter.rate = ttsRate;
      const voice = pickVoice(vList);
      if (voice) utter.voice = voice;
      utter.onstart = () => setPracticeSpeaking(true);
      utter.onend = () => setPracticeSpeaking(false);
      utter.onerror = () => setPracticeSpeaking(false);
      try { window.speechSynthesis.speak(utter); } catch (e) { console.warn("TTS speak failed", e); }
    };

    if (!voices.length) {
      try { window.speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch { }
      setTimeout(() => buildAndSpeak(window.speechSynthesis.getVoices()), 250);
      return true;
    }

    buildAndSpeak(voices);
    return true;
  };

  // Marquer l'interaction utilisateur — débloque l'autoplay TTS pour la session
  const markInteracted = () => { userHasInteractedRef.current = true; };

  // Couper la voix de l'IA immédiatement (appelé dès que l'utilisateur prend la parole)
  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setPracticeSpeaking(false);
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // SAFE JSON PARSER
  // Strips markdown fences, attempts to repair truncated JSON by closing open
  // structures, then parses. Throws a descriptive error if all attempts fail.
  // ══════════════════════════════════════════════════════════════════════════════
  const safeParseJSON = (raw) => {
    // 1. Strip markdown code fences and leading/trailing whitespace
    let text = raw.replace(/```json|```/gi, "").trim();

    // 2. First attempt — raw text may already be valid
    try { return JSON.parse(text); } catch (_) { /* fall through */ }

    // 3. Extract the first JSON object or array with a balanced brace/bracket scan
    const firstChar = text.indexOf("{") !== -1
      ? (text.indexOf("[") !== -1 ? (text.indexOf("{") < text.indexOf("[") ? "{" : "[") : "{")
      : "[";
    const start = text.indexOf(firstChar);
    if (start !== -1) {
      const open = firstChar === "{" ? "{" : "[";
      const close = firstChar === "{" ? "}" : "]";
      let depth = 0, end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === open) depth++;
        if (text[i] === close) { depth--; if (depth === 0) { end = i; break; } }
      }
      // Balanced slice found
      if (end !== -1) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch (_) { /* fall through */ }
      }
      // Truncated — try to close open structures
      const fragment = end !== -1 ? text.slice(start, end + 1) : text.slice(start);
      const repaired = fragment
        .replace(/,\s*$/, "")           // trailing comma before close
        .replace(/"[^"]*$/, '"...')     // unclosed string
        + (open === "{" ? "}" : "]");   // close the root structure
      try { return JSON.parse(repaired); } catch (_) { /* fall through */ }
    }

    // 4. Nothing worked — throw with a useful excerpt for debugging
    throw new Error(`JSON invalide (${text.slice(0, 80).replace(/\n/g, " ")}…)`);
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
- React with genuine human emotion ("Oh wow!", "No way!", "I totally agree!").
- ALWAYS end every single turn with one engaging, open-ended question.
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
      const prompt = `Tu es Nova, un coach d'anglais ultra-charismatique et amical. Le sujet de conversation choisi par l'étudiant est "${topic}" et son niveau estimé est ${level}.
Génère une phrase d'accroche chaleureuse et courte (2 phrases max) pour commencer la conversation, qui se termine par une vraie question ouverte pertinente sur ce sujet.
Varie ton style à chaque fois comme un vrai humain qui entame la discussion. Ne mets pas de guillemets autour de ta réponse. Parle uniquement en anglais.`;
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
    storage.set("nova_practice_messages", null).catch(() => {});
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
  const startDebate = async () => {
    if (!practiceDebateTopic.trim()) return;
    switchSubView("debate");
    startVoiceConversation({
      mode: 'debate', config: { topic: practiceDebateTopic, level: practiceLevel }
    });
  };

  const sendDebateVoiceMessage = async () => {
    stopSpeaking();
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
      color: "#4285F4",
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

  // Speak with Web speechSynthesis (no API cost)
  const rpSpeak = (text, onEnd) => {
    if (!window.speechSynthesis) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.95;
    utter.pitch = 1;
    // Prefer a good US voice if available
    const voices = window.speechSynthesis.getVoices();
    const usVoice = voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("google"))
      || voices.find(v => v.lang === "en-US")
      || voices.find(v => v.lang.startsWith("en"));
    if (usVoice) utter.voice = usVoice;
    utter.onend = () => { rpSpeakingRef.current = false; onEnd?.(); };
    utter.onerror = () => { rpSpeakingRef.current = false; onEnd?.(); };
    rpSpeakingRef.current = true;
    window.speechSynthesis.speak(utter);
  };

  // Start SpeechRecognition to capture user reply
  const rpListen = (onResult, onError) => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { onError?.("SpeechRecognition not supported"); return null; }
    const recog = new SpeechRec();
    recog.lang = "en-US";
    recog.continuous = false;
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e) => { onResult(e.results[0][0].transcript); };
    recog.onerror = (e) => {
      if (e.error !== "no-speech") onError?.(e.error);
      else onResult(""); // no-speech → empty turn
    };
    recog.onend = () => { }; // handled via onresult
    rpRecogRef.current = recog;
    try { recog.start(); } catch (e) { onError?.(e.message); }
    return recog;
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
    window.speechSynthesis?.cancel();
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
    window.speechSynthesis?.cancel();
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
    } catch(e) {}
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

  // Shadowing
  const startShadowing = async () => {
    if (isShadowingRef.current) return;
    isShadowingRef.current = true;
    try {
      const raw = await callClaude(
        `Génère une courte phrase en anglais (max 15 mots) pour un exercice de prononciation. Niveau ${practiceLevel}.`,
        "Shadowing"
      );
      setPracticeShadowingPhrase(raw.trim());
      setPracticeShadowingMode(true);
      markInteracted(); speakText(raw.trim());
    } catch (e) { showToast("Erreur shadowing", "error"); }
    finally { isShadowingRef.current = false; }
  };

  const analyzeShadowing = async (audioBlob) => {
    if (isShadowingRef.current) return;
    isShadowingRef.current = true;
    showToast("Analyse de prononciation en cours...");
    setPracticeShadowingUserAudio(URL.createObjectURL(audioBlob));
    setPracticeShadowingScore(null);
    try {
      // Transcription via Groq Whisper
      const transcript = await transcribeWithGroq(audioBlob);

      // Analyse via callClaude
      const raw = await callClaude(
        `Tu es un coach de prononciation anglaise. L'étudiant devait lire à voix haute la phrase suivante : "${practiceShadowingPhrase}". La transcription de son audio est : "${transcript}". Évalue sa prononciation. Réponds UNIQUEMENT en JSON : {"transcript":"${transcript}","score":85,"feedback":"commentaire court sur la prononciation"}. Le score est sur 100.`,
        "Analyse shadowing"
      );
      const parsed = safeParseJSON(raw);
      const finalScore = Math.min(100, Math.max(0, Math.round(parsed.score)));
      setPracticeShadowingScore(finalScore);
      if (parsed.feedback) showToast(`💬 ${parsed.feedback}`, "info");
      if (finalScore >= 90) awardXP(40, 12, "Shadowing excellent 🎤");
      else if (finalScore >= 70) awardXP(20, 5, "Bon shadowing");
      else awardXP(10, 2, "Shadowing complété");
    } catch (e) {
      console.error("Shadowing analysis error:", e);
      showToast("Erreur analyse prononciation", "error");
      setPracticeShadowingScore(null);
    } finally {
      isShadowingRef.current = false;
    }
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
  const submitWriting = async () => {
    if (!practiceWritingText.trim()) return;
    setPracticeWritingLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un correcteur expert en anglais. Analyse l'essai fourni.
Donne UNIQUEMENT un objet JSON avec cette structure exacte (SANS BLA BLA, UNIQUEMENT LE JSON VALIDE):
{
  "score": 6.5,
  "grammarFeedback": "...",
  "vocabularyFeedback": "...",
  "structureFeedback": "...",
  "overallComment": "...",
  "mistakes": [
    {
      "originalText": "le mot ou bout de phrase erroné EXACT dans le texte original",
      "correctedText": "la correction suggérée",
      "rule": "L'explication courte de l'erreur en français",
      "flashcard": {
        "front": "La question directe en français pour tester cette erreur (ex: Comment dire 'faire un stage' en anglais ?)",
        "back": "la correction en anglais (ex: to apply for an internship)"
      }
    }
  ]
}

Texte: """${practiceWritingText}"""`,
        practiceWritingPrompt || "Sujet libre"
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
    } catch (e) { showToast("Erreur correction écrit", "error"); }
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
    }
  };

  const importFlashcards = (mistakes, sourceTheme = "writing-lab", sourceName = "Writing Lab") => {
    if (!mistakes || mistakes.length === 0) return;
    const cards = mistakes.filter(m => m.flashcard && m.flashcard.front && m.flashcard.back).map(m => ({
      id: sourceTheme + "_" + crypto.randomUUID(),
      front: m.flashcard.front,
      back: m.flashcard.back,
      category: englishCategory,
      notes: `Extrait de ${sourceName} : ` + m.rule,
      createdAt: new Date().toISOString(),
      theme: sourceTheme
    }));
    if (cards.length > 0) {
      setExpressions(prev => [...prev, ...cards]);
      showToast(`${cards.length} fiches ajoutées au MemoMaster !`, "success");
    }
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
      if (!txt || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = "fr-FR";
      const voices = window.speechSynthesis.getVoices();
      const frVoice = voices.find(v => v.lang.startsWith("fr"));
      if (frVoice) u.voice = frVoice;
      window.speechSynthesis.speak(u);
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
        <div style={{fontSize: 12, fontWeight: "bold", color: "var(--mm-fg-muted)", marginBottom: 8}}>TON TEXTE CORRIGÉ :</div>
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
            ctx.fillStyle = isDarkMode ? "rgba(77, 107, 254, 0.25)" : "rgba(77, 107, 254, 0.2)";
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
                ctx.shadowColor = "#7B93FF";
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
      practiceDictationUserInput,
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
    "Business": { bg: "#1E3A8A", glow: "#3B82F6", text: "#BFDBFE" },
    "Academic": { bg: "#064E3B", glow: "#10B981", text: "#A7F3D0" },
    "Daily Life": { bg: "#7C2D12", glow: "#F97316", text: "#FED7AA" },
    "Technology": { bg: "#312E81", glow: "var(--mm-primary)", text: "#BFCBFF" },
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
      color: "#3B82F6",
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
    <div style={{ animation: "fadeUp 0.4s ease" }}>

      {/* ── 🔥 XP DASHBOARD ── */}
      <div style={{
        background: isDarkMode ? "var(--mm-bg-card)" : "white",
        border: `1px solid ${isDarkMode ? "var(--mm-border)" : "var(--mm-border)"}`,
        borderRadius: 16, padding: "16px 20px", marginBottom: 16,
        display: "flex", flexDirection: "column", gap: 12
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShowXPDashboard(!showXPDashboard)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>{getStats().level.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: theme.primary, textTransform: "uppercase" }}>{getStats().level.name}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: theme.text }}>{getStats().totalXP.toLocaleString()} XP</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(245,158,11,0.1)", padding: "6px 12px", borderRadius: 100 }}>
              <span style={{ fontSize: 18, animation: "srsBandeauPulse 2s infinite" }}>🔥</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#F59E0B" }}>{getStats().currentStreak} jours {getStats().multiplier > 1 && `(x${getStats().multiplier})`}</span>
            </div>
            <span style={{ transform: showXPDashboard ? "rotate(180deg)" : "none", transition: "0.2s" }}>▼</span>
          </div>
        </div>

        {showXPDashboard && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${isDarkMode ? "var(--mm-border)" : "var(--mm-border)"}`, display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp 0.2s ease" }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>Prochain Niveau</div>
                <div style={{ background: "rgba(77,107,254,0.05)", height: 12, borderRadius: 100, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, height: "100%",
                    width: `${Math.min(100, (getStats().totalXP / getStats().level.max) * 100)}%`,
                    background: "linear-gradient(90deg, #F59E0B, #EF4444)",
                    transition: "width 0.5s ease"
                  }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>Badges ({getStats().badges.length})</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {getStats().badges.slice(-3).map((b, i) => (
                    <span key={i} style={{ fontSize: 11, background: "rgba(77, 107, 254,0.1)", color: theme.primary, padding: "2px 8px", borderRadius: 100, fontWeight: 800 }}>{b}</span>
                  ))}
                  {getStats().badges.length > 3 && <span style={{ fontSize: 11, color: theme.textMuted }}>+{getStats().badges.length - 3}</span>}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, alignItems: "flex-end", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: theme.textMuted, whiteSpace: "pre", background: "rgba(77,107,254,0.05)", padding: 8, borderRadius: 8 }}>
                {getStats().asciiChart}
              </div>
              <button
                onClick={async () => {
                  showToast("Génération du rapport...", "info");
                  try {
                    const r = await generateReport();
                    alert(r);
                  } catch (e) { showToast("Erreur", "error"); }
                }}
                style={{
                  background: theme.primary, color: "white", border: "none", padding: "8px 16px", borderRadius: 8, fontWeight: 700, cursor: "pointer"
                }}
              >
                📊 Mon rapport
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 🔴 URGENT SRS BANDEAU — s'affiche quand des cartes sont en retard ── */}
      {(() => {
        const srsStats = getSRSStats(expressions, srsData);
        if (srsStats.overdueCount === 0) return null;
        return (
          <div style={{
            background: "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(220,38,38,0.08))",
            border: "1.5px solid rgba(239,68,68,0.4)",
            borderRadius: 18, padding: "14px 20px",
            marginBottom: 16, display: "flex", alignItems: "center",
            gap: 14, flexWrap: "wrap",
            animation: "srsBandeauPulse 3s ease-in-out infinite"
          }}>
            <style>{`@keyframes srsBandeauPulse{0%,100%{border-color:rgba(239,68,68,0.4)}50%{border-color:rgba(239,68,68,0.8)}}`}</style>
            <div style={{ fontSize: 24, flexShrink: 0 }}>🔴</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: "#EF4444", marginBottom: 4 }}>
                {srsStats.overdueCount} expression{srsStats.overdueCount > 1 ? "s" : ""} à revoir MAINTENANT
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {srsStats.urgentCards.slice(0, 5).map((c, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 700,
                    background: "rgba(239,68,68,0.12)", color: "#EF4444",
                    borderRadius: 8, padding: "2px 8px",
                    border: "1px solid rgba(239,68,68,0.25)"
                  }}>
                    {c.front.slice(0, 22)}{c.front.length > 22 ? "…" : ""}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => switchSubView("srs")}
              style={{
                padding: "10px 20px", background: "linear-gradient(135deg,#EF4444,#DC2626)",
                color: "white", border: "none", borderRadius: 12,
                fontWeight: 900, fontSize: 13, cursor: "pointer", flexShrink: 0,
                boxShadow: "0 4px 12px rgba(239,68,68,0.4)"
              }}
            >
              🚀 Réviser maintenant
            </button>
          </div>
        );
      })()}
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
      {/* ══ HEADER ══ */}
      <div style={{
        background: isDarkMode ? "radial-gradient(ellipse at top right, var(--mm-bg-elev), var(--mm-bg) 80%)" : "radial-gradient(ellipse at top right, var(--mm-primary), var(--mm-primary) 80%)",
        borderRadius: 32, padding: "36px", marginBottom: 32, position: "relative", overflow: "hidden",
        boxShadow: isDarkMode ? "0 20px 50px rgba(0,0,0,0.5), 0 0 80px rgba(77, 107, 254,0.15)" : "0 20px 50px rgba(77,107,254,0.3), 0 0 80px rgba(77, 107, 254,0.15)",
        border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.3)" : "rgba(77, 107, 254,0.4)"}`,
        animation: "realityDistortHeader 8s ease-in-out infinite"
      }} className="section-header academy-header">

        {/* Effet lumineux de fond Astral */}
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, background: "radial-gradient(circle, rgba(77, 107, 254,0.25) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none", animation: "pulseAstral 4s infinite" }} />
        <div style={{ position: "absolute", top: -20, left: -20, fontSize: 160, opacity: 0.03, pointerEvents: "none" }}>🌌</div>

        {/* ── LIGNE DU HAUT : Titre & HUD RPG ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 24, marginBottom: 32, position: "relative", zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#7B93FF", letterSpacing: 3, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>AI ENGLISH TRAINING CENTER</div>
            <h1 style={{ fontSize: 36, fontWeight: 900, color: "white", margin: 0, textShadow: "0 0 30px rgba(77,107,254,0.4)" }} className="academy-header">
              {practiceImmersionMode ? "Full Immersion 🇬🇧" : "Practice Room 🇬🇧"}
            </h1>
          </div>

          {/* PLAYER STATUS BAR (HUD) */}
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

            return (
              <div style={{
                background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 24, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12,
                backdropFilter: "blur(12px)", minWidth: 280, boxShadow: "0 10px 30px rgba(77,107,254,0.2)"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ background: "linear-gradient(135deg, #F59E0B, #EF4444)", padding: "4px 10px", borderRadius: 10, fontWeight: 900, fontSize: 12, color: "white", boxShadow: "0 0 10px rgba(245, 158, 11, 0.4)" }}>
                      Lv.{lvl} {getLbl(lvl)}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--mm-border)", fontWeight: 700 }}>{xp.toLocaleString()} XP</div>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div title="Streak" style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 8px" }}>
                      <span style={{ fontSize: 14, animation: streak > 0 ? "pulse 1.5s infinite" : "none" }}>🔥</span>
                      <span style={{ fontWeight: 900, color: streak > 0 ? "#FCD34D" : "var(--mm-fg-muted)", fontSize: 13 }}>{streak}j</span>
                    </div>
                    <div title="Coins" style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 8px" }}>
                      <span style={{ fontSize: 14 }}>🪙</span>
                      <span style={{ fontWeight: 900, color: "#FCD34D", fontSize: 13 }}>{coins.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--mm-fg-muted)", fontWeight: 800, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                    <span>Progression Niveau {lvl + 1}</span>
                    <span>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #FCD34D, #F59E0B, #EF4444)", borderRadius: 3, transition: "width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
                  </div>
                </div>
                {/* XP popup toast intra-HUD */}
                {practiceXpPopup && (
                  <div style={{ position: "absolute", top: -14, right: 0, background: "linear-gradient(135deg,#059669,#10B981)", color: "white", borderRadius: 10, padding: "4px 12px", fontWeight: 900, fontSize: 12, animation: "fadeUp 0.3s ease forwards", pointerEvents: "none", zIndex: 100, boxShadow: "0 4px 10px rgba(16,185,129,0.3)" }}>
                    +{practiceXpPopup.xp} XP {practiceXpPopup.coins > 0 ? `• +${practiceXpPopup.coins} 🪙` : ""} {practiceXpPopup.label && `· ${practiceXpPopup.label}`}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── COMMAND DOCK : BARRE UNIQUE STICKY (toutes les vues) ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(10, 17, 40, 0.85)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          marginLeft: -36, marginRight: -36, paddingLeft: 36, paddingRight: 36,
          paddingTop: 12, paddingBottom: 12,
        }}>
          <button
            type="button"
            className="english-tabs-toggle"
            onClick={() => document.body.classList.toggle("english-tabs-expanded")}
            aria-label="Afficher / cacher les modes"
            style={{
              display: "none",
              width: "100%", padding: "12px 16px", marginBottom: 10,
              borderRadius: 14, border: "1px solid rgba(96,165,250,0.4)",
              background: "linear-gradient(135deg, rgba(77,107,254,0.35), rgba(52,81,209,0.45))",
              color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer",
            }}
          >
            ☰ Modes & outils
          </button>
          <div className="tabs-scroll english-tabs-cluster" style={{ display: "flex", gap: 6, overflowX: "auto", alignItems: "center", scrollbarWidth: "none" }}>
            <button
              onClick={() => setSpeakItOpen(true)}
              style={{
                padding: "9px 16px", borderRadius: 12, cursor: "pointer", flexShrink: 0,
                background: "linear-gradient(135deg, #10B981, #059669)",
                border: "none", color: "#FFFFFF", fontWeight: 800, fontSize: 13,
                display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
                boxShadow: "0 4px 16px rgba(16, 185, 129, 0.4)",
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
              }}>
              <span style={{ fontSize: 15 }}>🎤</span>Défi du jour
            </button>
            {[
              { id: "chat", icon: "💬", label: "Chat", group: "practice" },
              { id: "debate", icon: "⚖️", label: "Débat", group: "practice" },
              { id: "roleplay", icon: "🎭", label: "Roleplay", group: "practice" },
              { id: "ielts", icon: "🎓", label: "IELTS", group: "practice" },
              { id: "daily", icon: "⭐", label: "Défi", group: "practice" },
              { id: "writing", icon: "📝", label: "Écriture", group: "practice" },
              { id: "speaking", icon: "🎙️", label: "Oral", group: "practice" },
              { id: "dictation", icon: "✍️", label: "Dictée", group: "practice" },
              { id: "accent", icon: "🎯", label: "Accent", group: "practice" },
              { id: "coach", icon: "🎙️", label: "Coach", group: "practice" },
              { id: "battle", icon: "⚔️", label: "Battle", group: "practice" },
              { id: "notebook", icon: "📓", label: "Carnet", group: "practice" },
            ].map(tab => {
              const isActive = practiceSubView === tab.id;
              return (
                <button key={tab.id} onClick={() => switchSubView(tab.id)} className="hov" style={{
                  padding: "9px 16px", borderRadius: 12, cursor: "pointer", flexShrink: 0,
                  background: isActive ? "linear-gradient(135deg, rgba(77,107,254,0.35), rgba(52,81,209,0.45))" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isActive ? "rgba(96,165,250,0.6)" : "rgba(255,255,255,0.08)"}`,
                  color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.55)",
                  fontWeight: isActive ? 800 : 600, fontSize: 13,
                  display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
                  boxShadow: isActive ? "0 4px 16px rgba(77,107,254,0.3)" : "none",
                  transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
                }}>
                  <span style={{ fontSize: 15 }}>{tab.icon}</span>{tab.label}
                </button>
              );
            })}

            {/* Séparateur */}
            <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.12)", margin: "0 6px", flexShrink: 0 }} />

            {[
              { id: "srs", icon: "🔄", label: "SRS" },
              { id: "brainmap", icon: "🧠", label: "Brain Map" },
              { id: "dashboard", icon: "📊", label: "Progrès" },
              { id: "achievements", icon: "🏆", label: "Succès" },
              { id: "wild", icon: "📺", label: "Vidéos" },
              { id: "news", icon: "📰", label: "News" },
            ].map(tab => {
              const isActive = practiceSubView === tab.id;
              return (
                <button key={tab.id} onClick={() => switchSubView(tab.id)} className="hov" style={{
                  padding: "9px 14px", borderRadius: 12, cursor: "pointer", flexShrink: 0,
                  background: isActive ? "rgba(77, 107, 254,0.28)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isActive ? "rgba(77, 107, 254,0.55)" : "rgba(255,255,255,0.07)"}`,
                  color: isActive ? "#DCE3FF" : "rgba(255,255,255,0.5)",
                  fontWeight: isActive ? 700 : 500, fontSize: 13,
                  display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                  transition: "all 0.25s"
                }}>
                  {tab.icon} {tab.label}
                </button>
              );
            })}

            {/* Séparateur */}
            <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.12)", margin: "0 6px", flexShrink: 0 }} />

            {/* Toggle Immersion */}
            <button
              onClick={() => setPracticeImmersionMode(!practiceImmersionMode)}
              style={{
                padding: "9px 15px", borderRadius: 12, cursor: "pointer", flexShrink: 0,
                background: practiceImmersionMode ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${practiceImmersionMode ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.08)"}`,
                color: practiceImmersionMode ? "#FCA5A5" : "rgba(255,255,255,0.45)",
                fontWeight: 800, fontSize: 13,
                display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
                boxShadow: practiceImmersionMode ? "0 0 14px rgba(239,68,68,0.25)" : "none",
                transition: "all 0.25s"
              }}
            >
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: practiceImmersionMode ? "#EF4444" : "var(--mm-fg)", boxShadow: practiceImmersionMode ? "0 0 7px #EF4444" : "none", transition: "all 0.3s", flexShrink: 0 }} />
              {practiceImmersionMode ? "IMMERSION: ON" : "IMMERSION: OFF"}
            </button>
          </div>
        </div>

        {/* ── COCKPIT DE CONFIGURATION (Uniquement pour le Chat) ── */}
        {practiceSubView === "chat" && (
          <>
            <button
              type="button"
              className="chat-cockpit-toggle"
              onClick={() => document.body.classList.toggle("chat-cockpit-expanded")}
              aria-label="Afficher / cacher la configuration"
              style={{
                display: "none",
                width: "100%", padding: "12px 16px", marginTop: 16,
                borderRadius: 14, border: "1px solid rgba(96,165,250,0.4)",
                background: "rgba(77,107,254,0.15)", color: "white",
                fontWeight: 800, fontSize: 14, cursor: "pointer",
              }}
            >
              ⚙️ Configuration chat
            </button>
            <div style={{
              background: "rgba(77,107,254,0.2)", border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 20, padding: "20px", marginTop: 24, position: "relative", zIndex: 10,
              display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", backdropFilter: "blur(12px)"
            }} className="tabs-scroll chat-cockpit-cluster">

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 150 }}>
                <span style={{ fontSize: 10, color: "var(--mm-fg-muted)", fontWeight: 800, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>TOPIC</span>
                <select value={practiceTopic} onChange={e => setPracticeTopic(e.target.value)} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "white", fontWeight: 600, outline: "none", cursor: "pointer" }}>
                  {["Free conversation", "Job interview", "Technology & AI", "Daily life in Senegal", "Programming & coding"].map(t => <option key={t} value={t} style={{ color: "black" }}>{t}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 140 }}>
                <span style={{ fontSize: 10, color: "var(--mm-fg-muted)", fontWeight: 800, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>LEVEL</span>
                <select value={practiceLevel} onChange={e => setPracticeLevel(e.target.value)} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "white", fontWeight: 600, outline: "none", cursor: "pointer" }}>
                  <option value="beginner" style={{ color: "black" }}>🟢 Beginner</option>
                  <option value="intermediate" style={{ color: "black" }}>🟡 Intermediate</option>
                  <option value="advanced" style={{ color: "black" }}>🔴 Advanced</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 140 }}>
                <span style={{ fontSize: 10, color: "var(--mm-fg-muted)", fontWeight: 800, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>PERSONA</span>
                <select value={practicePersona} onChange={e => setPracticePersona(e.target.value)} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "white", fontWeight: 600, outline: "none", cursor: "pointer" }}>
                  <option value="Standard" style={{ color: "black" }}>👨‍🏫 Standard</option>
                  <option value="MMA" style={{ color: "black" }}>🥊 MMA Fighter</option>
                  <option value="Recruteur" style={{ color: "black" }}>💼 Tech Recruiter</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
                <span style={{ fontSize: 10, color: "var(--mm-fg-muted)", fontWeight: 800, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>VOICE</span>
                {availableFemaleVoices.length > 0 ? (
                  <select value={ttsVoice} onChange={e => setTtsVoice(e.target.value)} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "white", fontWeight: 600, outline: "none", cursor: "pointer", textOverflow: "ellipsis" }}>
                    {availableFemaleVoices.map(v => (
                      <option key={v.name} value={v.name} style={{ color: "black" }}>
                        👩 {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "var(--mm-fg-muted)", fontSize: 14 }}>
                    ⏳ Chargement…
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 120 }}>
                <span style={{ fontSize: 10, color: "var(--mm-fg-muted)", fontWeight: 800, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace", display: "flex", justifyContent: "space-between" }}>
                  <span>SPEED</span> <span style={{ color: "white" }}>{ttsRate.toFixed(2)}x</span>
                </span>
                <input type="range" min="0.7" max="1.3" step="0.05" value={ttsRate} onChange={e => setTtsRate(parseFloat(e.target.value))} style={{ width: "100%", height: 38, accentColor: "#60A5FA", cursor: "pointer" }} />
              </div>

              <button
                onClick={() => setChatTtsMuted(m => !m)}
                className="hov"
                title={chatTtsMuted ? "Voix coupée — clique pour activer le TTS" : "Voix active — clique pour couper"}
                style={{
                  padding: "12px 16px",
                  background: chatTtsMuted ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #10B981, #059669)",
                  border: `1px solid ${chatTtsMuted ? "rgba(255,255,255,0.15)" : "#34D399"}`,
                  borderRadius: 12, color: "white",
                  fontWeight: 900, fontSize: 14, cursor: "pointer", height: 42,
                  display: "flex", alignItems: "center", gap: 8
                }}
              >
                <span>{chatTtsMuted ? "🔇" : "🔊"}</span> {chatTtsMuted ? "Voix off" : "Voix on"}
              </button>
              <button onClick={resetPracticeChat} className="hov" style={{
                padding: "12px 24px", background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                border: "1px solid #60A5FA", borderRadius: 12, color: "white",
                fontWeight: 900, fontSize: 14, cursor: "pointer", height: 42,
                boxShadow: "0 0 20px rgba(37,99,235,0.4)", display: "flex", alignItems: "center", gap: 8
              }}>
                <span>🔄</span> New Session
              </button>
            </div>
          </>
        )}
      </div>

      {/* ══ CHAT ══ */}
      {practiceSubView === "chat" && (
        <div
          onClick={markInteracted}
          onKeyDown={markInteracted}
          style={{ position: "relative", background: "var(--mm-bg-card)", border: "1px solid var(--mm-border)", borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column", height: "clamp(320px, 60vh, 480px)", boxShadow: "var(--mm-shadow-glow)" }}
        >
          <button onClick={() => setChatShowHistory(p => !p)} style={{ position: "absolute", top: 12, left: 12, zIndex: 10, background: chatShowHistory ? "rgba(77,107,254,0.4)" : "rgba(255,255,255,0.1)", border: "none", color: "white", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>Historique</button>
          {/* Student name input – top right of chat card */}
          <div style={{ position: "absolute", top: 10, right: 12, zIndex: 10, display: "flex", alignItems: "center", gap: 6 }}>
            {studentName ? (
              <button
                title="Changer de nom"
                onClick={() => {
                  const n = window.prompt("Quel est ton prénom ?", studentName);
                  if (n !== null) {
                    const trimmed = n.trim();
                    setStudentName(trimmed);
                    try { localStorage.setItem("nova_student_name", trimmed); } catch {}
                  }
                }}
                style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.8), rgba(168,85,247,0.8))", border: "none", color: "white", padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: "bold", boxShadow: "0 2px 8px rgba(139,92,246,0.4)" }}
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
                    try { localStorage.setItem("nova_student_name", trimmed); } catch {}
                  }
                }}
                style={{ background: "rgba(255,255,255,0.12)", border: "1px dashed rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.7)", padding: "5px 10px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}
              >
                + Ton prénom
              </button>
            )}
          </div>
          {/* ── Messages list ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {practiceMessages.length === 0 && !practiceLoading && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
                <h3 style={{ margin: "0 0 8px 0", color: theme.text }}>Prêt à pratiquer ?</h3>
                <p style={{ margin: "0 0 24px 0", color: theme.textMuted, fontSize: 14, textAlign: "center", maxWidth: 300 }}>
                  Commencez une conversation libre avec Nova, votre coach vocal IA.
                </p>
                <button
                  onClick={() => generateDynamicGreeting()}
                  style={{
                    background: "linear-gradient(135deg, var(--mm-primary), var(--mm-accent))",
                    color: "white", border: "none", padding: "14px 28px", borderRadius: 999, fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 16px rgba(77,107,254,0.3)"
                  }}
                >
                  Commencer la conversation
                </button>
              </div>
            )}
            {(() => {
              if (customAgent.isConnected) return null;
              const lastUser = [...practiceMessages].reverse().find(msg => msg.role === 'user');
              const lastAgent = [...practiceMessages].reverse().find(msg => msg.role !== 'user');
              const displayMessages = chatShowHistory 
                ? practiceMessages 
                : practiceMessages.filter(m => m === lastUser || m === lastAgent);
              return displayMessages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div data-chat-bubble style={{
                  maxWidth: "80%", padding: "12px 16px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  wordBreak: "break-word",
                  background: msg.role === "user"
                    ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))"
                    : (isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(77,107,254,0.05)"),
                  color: msg.role === "user" ? "white" : theme.text,
                  fontSize: 15, lineHeight: 1.6, fontWeight: 500,
                  boxShadow: msg.role === "user" ? "0 4px 12px rgba(77,107,254,0.3)" : "none",
                  border: msg.role !== "user" ? `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)"}` : "none"
                }}>
                  {msg.text}
                  {msg.needsPlay && (
                    <button
                      onClick={() => { markInteracted(); speakText(msg.text, true); }}
                      style={{ display: "block", marginTop: 8, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "white" }}
                    >
                      🔊 Écouter
                    </button>
                  )}
                </div>
              </div>
            ));
          })()}

          {customAgent.isConnected && (() => {
            const lastLkUser = [...liveKitTranscriptions].reverse().find(msg => msg.name !== "assistant-53a");
            const lastLkAgent = [...liveKitTranscriptions].reverse().find(msg => msg.name === "assistant-53a");
            const displayLkMsgs = liveKitTranscriptions.filter(m => m === lastLkUser || m === lastLkAgent);
            
            return displayLkMsgs.map((msg, i) => {
              const isUser = msg.name !== "assistant-53a";
              return (
                <div key={msg.id || `lk-${i}`} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginTop: 8 }}>
                  <div data-chat-bubble style={{
                    maxWidth: "80%", padding: "12px 16px", borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    wordBreak: "break-word",
                    background: isUser
                      ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))"
                      : (isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(77,107,254,0.05)"),
                    color: isUser ? "white" : theme.text,
                    fontSize: 15, lineHeight: 1.6, fontWeight: 500,
                    boxShadow: isUser ? "0 4px 12px rgba(77,107,254,0.3)" : "none",
                    border: !isUser ? `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)"}` : "none",
                    opacity: msg.isFinal ? 1 : 0.6,
                    fontStyle: msg.isFinal ? "normal" : "italic"
                  }}>
                    {msg.text}
                    {!msg.isFinal && <span style={{display: "inline-block", marginLeft: 4, animation: "pulse 1.5s infinite"}}>...</span>}
                  </div>
                </div>
              );
            });
          })()}
            {practiceLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "12px 20px", borderRadius: "18px 18px 18px 4px", background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(77,107,254,0.05)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)"}`, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.primary, animation: "pulse 0.8s infinite" }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.primary, animation: "pulse 0.8s 0.2s infinite" }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.primary, animation: "pulse 0.8s 0.4s infinite" }} />
                </div>
              </div>
            )}
            <div ref={practiceEndRef} />
          </div>

          <div style={{ padding: "16px 20px", borderTop: "1px solid var(--mm-border-strong)", background: "var(--mm-bg-overlay)", backdropFilter: "var(--mm-blur)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {/* Conteneur unifié pour l'input et la barre vocale */}
              <div style={{
                flex: 1, display: "flex", alignItems: "center", gap: 8,
                background: customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.05)" : "#F0FDF4") : "var(--mm-bg-elev)",
                border: `2px solid ${customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.3)" : "#86EFAC") : "var(--mm-border-strong)"}`,
                borderRadius: 18, padding: "6px 8px 6px 18px", transition: "all 0.3s"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: customAgent.isConnected ? "#10B981" : "var(--mm-primary)",
                    boxShadow: customAgent.isConnected ? "0 0 10px #10B981" : "0 0 10px var(--mm-primary-glow)",
                    animation: customAgent.isConnected ? "mm-pulse 1.5s infinite" : "none"
                  }} />
                  {customAgent.isConnected && (
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#10B981", whiteSpace: "nowrap" }} className="hide-mobile">
                      {customAgent.isSpeaking ? "🗣️ Coach parle" : "👂 T'écoute"}
                    </span>
                  )}
                </div>

                <input
                  value={customAgent.isConnected ? "" : practiceInput}
                  onChange={e => { if (customAgent.isConnected) return; markInteracted(); setPracticeInput(e.target.value); }}
                  onKeyDown={e => { if (customAgent.isConnected) return; markInteracted(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); stopSpeaking(); sendPracticeMessage(practiceInput, true); } }}
                  placeholder={customAgent.isConnected 
                    ? (liveKitState?.state === "speaking" ? "Coach NOVA parle..." 
                       : liveKitState?.state === "listening" ? "Je vous écoute..." 
                       : liveKitState?.state === "thinking" ? "Je réfléchis..." 
                       : "Connexion en cours...")
                    : "Tape ton message en anglais..."}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: theme.text, fontSize: 15, fontWeight: 500, minWidth: 0, fontStyle: customAgent.isConnected ? "italic" : "normal" }}
                  disabled={practiceLoading || customAgent.isConnected}
                />

                {/* ── Boutons micro : Nova PTT + ElevenLabs ──────────────── */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

                  {/* ── Nova Push-To-Talk button (ElevenLabs-style orb) ──── */}
                  <NovaMicButton
                    novaVoice={novaVoice}
                    disabled={practiceLoading}
                    isDarkMode={isDarkMode}
                  />

                  {/* ── LiveKit Voice Agent Button ── */}
                  <AgentVoiceBar
                    agent={agent}
                    variant="minimal"
                    onStart={() => {
                      setAgentTranscript([]);
                      setAgentError("");
                      agent.start(MODE_CONFIGS.chat({ topic: practiceTopic || "Free conversation", level: practiceLevel }));
                    }}
                  />
                </div>
              </div>

              {/* ── Bannière "Nova = fallback illimité" quand ElevenLabs KO ── */}
              {agent.status === "unavailable" && (
                <div style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  background: isDarkMode ? "rgba(16,185,129,0.08)" : "#ECFDF5",
                  color: isDarkMode ? "#6EE7B7" : "#065F46",
                  border: `1px solid ${isDarkMode ? "rgba(16,185,129,0.25)" : "#A7F3D0"}`,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 18 }}>🟢</span>
                  <span>
                    Quota des coachs vocaux ElevenLabs épuisé ce mois-ci.
                    <b> Nova (gratuit & illimité)</b> prend le relais — appuie sur le
                    micro vert pour continuer à parler comme d'habitude. Les fiches
                    sont toujours créées automatiquement à la volée.
                  </span>
                </div>
              )}

              {/* Send Button */}
              <button
                onClick={() => { if (customAgent.isConnected) return; markInteracted(); stopSpeaking(); sendPracticeMessage(practiceInput, true); }}
                disabled={!practiceInput.trim() || practiceLoading || customAgent.isConnected}
                className="chat-send-btn"
                style={{
                  width: 50, height: 50, borderRadius: 16,
                  background: (practiceInput.trim() && !customAgent.isConnected) ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : theme.inputBg,
                  border: `1px solid ${practiceInput.trim() && !customAgent.isConnected ? "transparent" : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)")}`,
                  cursor: (practiceInput.trim() && !customAgent.isConnected) ? "pointer" : "default",
                  fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  opacity: customAgent.isConnected ? 0.3 : 1, transition: "all 0.3s",
                  boxShadow: (practiceInput.trim() && !customAgent.isConnected) ? "0 8px 20px rgba(77,107,254,0.4)" : "none",
                  color: (practiceInput.trim() && !customAgent.isConnected) ? "white" : theme.textMuted
                }}
              >
                {practiceLoading ? "⏳" : "➤"}
              </button>
            </div>

            {/* Messages d'erreur du micro / agent */}
            {agentError && (
              <div style={{ marginTop: 12, padding: "8px 14px", background: "#FEF2F2", color: "#EF4444", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                {agentError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ WRITING LAB ══ */}
      {
        practiceSubView === "writing" && (
          <div style={{ background: "var(--mm-bg-card)", borderRadius: 24, padding: 24, border: "1px solid var(--mm-border)", boxShadow: "var(--mm-shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>📝 Writing Lab</h2>
              <div style={{ display: "flex", gap: 10 }}>
                {practiceWritingDrafts.length > 0 && (
                  <button 
                    onClick={() => setShowDraftsModal(true)}
                    style={{ padding: "8px 14px", background: "var(--mm-bg-elev)", border: "1px solid var(--mm-border)", borderRadius: 8, color: "var(--mm-fg)", cursor: "pointer", fontWeight: "bold" }}
                  >
                    📜 Historique ({practiceWritingDrafts.length})
                  </button>
                )}
                <button onClick={createNewDraft} style={{ padding: "8px 14px", background: "var(--mm-bg-elev)", border: "1px solid var(--mm-border)", borderRadius: 8, color: "var(--mm-fg)", cursor: "pointer", fontWeight: "bold" }}>
                  + Nouveau
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <input value={practiceWritingPrompt} onChange={e => setPracticeWritingPrompt(e.target.value)} placeholder="Sujet libre (ou décris ce dont tu veux parler)" style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid var(--mm-border)", background: "var(--mm-bg-elev)", color: "var(--mm-fg)", boxSizing: "border-box" }} />
              <button 
                onClick={() => {
                  const topics = [
                    "Some people believe that university education should be free for everyone. To what extent do you agree or disagree?",
                    "In many countries, the proportion of older people is steadily increasing. Does this trend have more positive or negative effects on society?",
                    "Nowadays, many families have both parents working. What are the advantages and disadvantages of this?",
                    "The development of artificial intelligence will change our lives for the better. Discuss both views and give your opinion.",
                    "Many people prefer to rent a house rather than buying one. Describe the advantages and disadvantages of renting.",
                    "Describe a memorable journey you have made. Why was it so special?",
                    "Write an email to a friend inviting them to visit your hometown. Mention what you can do together.",
                    "Do you think it is better to work in a large corporation or a small company? Explain your reasons."
                  ];
                  setPracticeWritingPrompt(topics[Math.floor(Math.random() * topics.length)]);
                }}
                style={{ padding: "0 16px", background: "var(--mm-bg-elev)", border: "1px solid var(--mm-border)", borderRadius: 10, color: "var(--mm-primary)", cursor: "pointer", fontWeight: "bold", whiteSpace: "nowrap" }}
                title="Générer un sujet aléatoire"
              >
                🎲 Sujet Aléatoire
              </button>
            </div>
            
            <div style={{ position: "relative" }}>
              <textarea value={practiceWritingText} onChange={e => setPracticeWritingText(e.target.value)} rows={10} style={{ width: "100%", padding: 14, borderRadius: 12, border: "1px solid var(--mm-border)", background: "var(--mm-bg-elev)", color: "var(--mm-fg)", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, boxSizing: "border-box" }} placeholder="Écris ton essai ici... (sauvegarde automatique en cours de frappe)" />
              <div style={{ position: "absolute", bottom: 12, right: 12, fontSize: 11, color: "var(--mm-fg-muted)", fontWeight: "bold", background: "var(--mm-bg-elev)", padding: "2px 6px", borderRadius: 4 }}>
                {practiceWritingText.trim() ? practiceWritingText.trim().split(/\s+/).length : 0} mots
              </div>
            </div>

            <button onClick={submitWriting} disabled={practiceWritingLoading || !practiceWritingText.trim()} style={{ marginTop: 12, padding: "14px 28px", background: "var(--mm-grad-aurora)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 0 15px rgba(52, 81, 209,0.3)" }}>
              {practiceWritingLoading ? "Correction..." : "📝 Corriger"}
            </button>
            {practiceWritingFeedback && (
              <div style={{ marginTop: 24, background: isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)", borderRadius: 20, padding: 24, border: `1px solid ${theme.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                  <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg, ${practiceWritingFeedback.score >= 7 ? "#10B981" : practiceWritingFeedback.score >= 5.5 ? "#F59E0B" : "#EF4444"}, var(--mm-primary))`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 28, fontWeight: 900, boxShadow: "0 10px 30px rgba(77,107,254,0.1)" }}>
                    {practiceWritingFeedback.score}
                  </div>
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: 20, color: theme.text }}>Évaluation IELTS</h3>
                    <div style={{ fontSize: 14, color: theme.textMuted }}>{practiceWritingFeedback.overallComment}</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
                  <div style={{ padding: 16, background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--mm-primary)", marginBottom: 6 }}>📐 GRAMMAIRE</div>
                    <div style={{ fontSize: 13, color: theme.text }}>{practiceWritingFeedback.grammarFeedback}</div>
                  </div>
                  <div style={{ padding: 16, background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--mm-primary)", marginBottom: 6 }}>📚 VOCABULAIRE</div>
                    <div style={{ fontSize: 13, color: theme.text }}>{practiceWritingFeedback.vocabularyFeedback}</div>
                  </div>
                  <div style={{ padding: 16, background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#10B981", marginBottom: 6 }}>🏗️ STRUCTURE</div>
                    <div style={{ fontSize: 13, color: theme.text }}>{practiceWritingFeedback.structureFeedback}</div>
                  </div>
                </div>

                <div style={{ padding: 24, background: theme.cardBg, borderRadius: 16, border: `1px solid ${theme.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#EF4444", letterSpacing: 2 }}>✍️ CORRECTIONS INTERACTIVES</div>
                    {practiceWritingFeedback.mistakes && practiceWritingFeedback.mistakes.length > 0 && (
                      <button onClick={() => importFlashcards(practiceWritingFeedback.mistakes)} style={{ background: "#10B981", color: "white", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: "bold", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
                        <span>🃏</span> Créer fiches depuis les erreurs
                      </button>
                    )}
                  </div>
                  <div style={{ background: "var(--mm-bg)", padding: 20, borderRadius: 12, border: `1px solid ${theme.border}` }}>
                    {renderInlineTextWithMistakes()}
                  </div>
                  {/* Fallback old-style magic ink in case LLM failed to return array */}
                  {(!practiceWritingFeedback.mistakes || practiceWritingFeedback.mistakes.length === 0) && (practiceWritingFeedback.magicInkText || practiceWritingFeedback.correctedText) && (
                    <div
                      className="liquid-morph-text"
                      style={{ marginTop: 20 }}
                      dangerouslySetInnerHTML={safeHTML((practiceWritingFeedback.magicInkText || practiceWritingFeedback.correctedText || "").replace(/\n/g, "<br/>"))}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )
      }

      {/* ══ SPEAKING LAB ══ */}
      {
        practiceSubView === "speaking" && (
          <div style={{ background: "var(--mm-bg-card)", borderRadius: 24, border: "1px solid var(--mm-border)", overflow: "hidden", boxShadow: "var(--mm-shadow)" }}>

            {/* Header */}
            <div style={{ background: "linear-gradient(135deg,#0F0C29,#302b63,#24243e)", padding: "22px 26px" }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: "white" }}>🎙️ Live Phonetics Visualizer</div>
              <div style={{ fontSize: 12, color: "#A5B4FC", marginTop: 3 }}>Analyse ta prononciation • Ghost Waveform Sync • Phonèmes • Accent détecté</div>
            </div>

            <div style={{ padding: 24 }}>

              {/* Phrase de référence */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, letterSpacing: 2, marginBottom: 6 }}>PHRASE À PRONONCER (laisse vide pour analyse libre)</div>
                <input
                  value={practiceSpeakingPrompt}
                  onChange={e => setPracticeSpeakingPrompt(e.target.value)}
                  placeholder='ex: "The weather in September is quite unpredictable"'
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>

              {/* Zone enregistrement */}
              <div style={{ background: isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)", borderRadius: 20, padding: "24px 20px", marginBottom: 24, position: "relative", overflow: "hidden" }}>

                {/* Canvas live */}
                <canvas
                  ref={speakingCanvasRef}
                  width={600} height={70}
                  style={{ width: "100%", height: 70, borderRadius: 12, marginBottom: 16, display: practiceSpeakingIsRecording ? "block" : "none" }}
                />

                {/* Waveform statique colorée après enregistrement */}
                {!practiceSpeakingIsRecording && practiceWaveformBars.length > 0 && (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 70, marginBottom: 16, padding: "0 4px" }}>
                    {practiceWaveformBars.map((amp, i) => {
                      const barHeight = Math.max(4, amp * 120);
                      // Coloration par région phonémique si data disponible
                      let barColor = "var(--mm-primary)";
                      if (practicePhonemeData?.words?.length) {
                        const wordIdx = Math.floor(i / practiceWaveformBars.length * practicePhonemeData.words.length);
                        const w = practicePhonemeData.words[wordIdx];
                        if (w) barColor = w.score >= 80 ? "#22C55E" : w.score >= 50 ? "#F59E0B" : "#EF4444";
                      }
                      return (
                        <div key={i} style={{ flex: 1, height: barHeight, borderRadius: 2, background: barColor, transition: "background 0.8s ease, height 0.4s ease", opacity: 0.85 }} />
                      );
                    })}
                  </div>
                )}

                {/* Placeholder si rien */}
                {!practiceSpeakingIsRecording && practiceWaveformBars.length === 0 && (
                  <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: theme.textMuted, textAlign: "center" }}>
                      🎵 La waveform de ta voix apparaîtra ici en temps réel
                    </div>
                  </div>
                )}

                {/* Countdown + REC */}
                {practiceSpeakingIsRecording && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#EF4444", animation: "pulse 0.8s infinite" }} />
                      <span style={{ fontWeight: 800, color: "#EF4444", fontSize: 13, letterSpacing: 1 }}>REC</span>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 36, color: "white", fontFamily: "monospace", textShadow: "0 0 20px rgba(79,107,254,0.8)" }}>
                      {practiceSpeakingCountdown}s
                    </div>
                  </div>
                )}

                {/* Bouton principal */}
                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={startSpeakingRecording}
                    disabled={practiceSpeakingLoading || practiceSpeakingIsRecording}
                    style={{
                      padding: "16px 40px", borderRadius: 16, border: "none", cursor: "pointer",
                      background: practiceSpeakingIsRecording
                        ? "linear-gradient(135deg,#7F1D1D,#EF4444)"
                        : practiceSpeakingLoading
                          ? theme.inputBg
                          : "linear-gradient(135deg,#302b63,var(--mm-primary))",
                      color: "white", fontWeight: 800, fontSize: 15,
                      boxShadow: practiceSpeakingIsRecording ? "0 0 30px rgba(239,68,68,0.5)" : "0 4px 24px rgba(77,107,254,0.4)",
                      transition: "all 0.3s"
                    }}
                  >
                    {practiceSpeakingLoading ? "⏳ Analyse en cours…" : practiceSpeakingIsRecording ? "⏺ Enregistrement…" : "🎤 Analyser ma prononciation (10s)"}
                  </button>
                </div>
              </div>

              {/* Transcription */}
              {practiceSpeakingTranscript && (
                <div style={{ background: theme.inputBg, borderRadius: 14, padding: "14px 20px", marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 20 }}>📝</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, letterSpacing: 2, marginBottom: 4 }}>TRANSCRIPTION WHISPER</div>
                    <div style={{ fontSize: 15, color: theme.text, fontStyle: "italic", lineHeight: 1.5 }}>"{practiceSpeakingTranscript}"</div>
                  </div>
                </div>
              )}

              {/* ══ ANALYSE PHONÉTIQUE ══ */}
              {practicePhonemeData && (() => {
                const sc = practicePhonemeData.overallScore ?? 0;
                const scoreColor = sc >= 80 ? "#22C55E" : sc >= 50 ? "#F59E0B" : "#EF4444";
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
                    <div style={{ background: isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)", borderRadius: 20, padding: "20px 24px", marginBottom: 20, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", border: `1px solid ${scoreColor}30` }}>

                      {/* Score ring */}
                      <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
                        <svg viewBox="0 0 36 36" style={{ width: 110, height: 110, transform: "rotate(-90deg)" }}>
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke={isDarkMode ? "#2A2A4A" : "#E5E7EB"} strokeWidth="3.4" />
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor} strokeWidth="3.4"
                            strokeDasharray={`${sc} 100`} strokeLinecap="round"
                            style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)", filter: `drop-shadow(0 0 6px ${scoreColor}80)` }} />
                        </svg>
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{sc}</div>
                          <div style={{ fontSize: 10, color: theme.textMuted }}>/100</div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: scoreColor, marginTop: 2 }}>{scoreLabel}</div>
                        </div>
                      </div>

                      {/* Accent + stats column */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 180 }}>
                        <div style={{ background: isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)", borderRadius: 12, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 22 }}>🌍</span>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#7B93FF", letterSpacing: 1.5 }}>ACCENT DÉTECTÉ</div>
                            <div style={{ fontWeight: 800, color: theme.text, fontSize: 13 }}>{practicePhonemeData.accentProfile}</div>
                          </div>
                        </div>

                        {/* Word score pills */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {words.map((w, i) => {
                            const c = (w.score ?? 100) >= 80 ? "#22C55E" : (w.score ?? 100) >= 50 ? "#F59E0B" : "#EF4444";
                            return (
                              <div key={i} title={`${w.word} — ${w.score}/100`} style={{ background: `${c}20`, border: `1px solid ${c}60`, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 800, color: c, cursor: "default" }}>
                                {w.word}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Stats column */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 120 }}>
                        {[
                          { label: "Bons mots", val: words.filter(w => (w.score ?? 100) >= 80).length, color: "#22C55E" },
                          { label: "À améliorer", val: words.filter(w => (w.score ?? 100) < 80 && (w.score ?? 100) >= 50).length, color: "#F59E0B" },
                          { label: "Erreurs", val: words.filter(w => (w.score ?? 100) < 50).length, color: "#EF4444" },
                        ].map(s => (
                          <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: `${s.color}15`, borderRadius: 10, padding: "6px 12px" }}>
                            <span style={{ fontSize: 11, color: theme.textMuted }}>{s.label}</span>
                            <span style={{ fontWeight: 900, fontSize: 16, color: s.color }}>{s.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ─── Recurrent error patterns radar ─── */}
                    {topErrors.length > 0 && (
                      <div style={{ background: isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)", borderRadius: 16, padding: "16px 20px", marginBottom: 20, border: "1px solid #EF444430" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#EF4444", letterSpacing: 2, marginBottom: 12 }}>🔁 PATTERNS D'ERREURS RÉCURRENTS</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {topErrors.map(([issue, count]) => (
                            <div key={issue} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", minWidth: 160 }}>{issue}</div>
                              <div style={{ flex: 1, height: 8, background: isDarkMode ? "#2d0a0a" : "#FEE2E2", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(count / words.length * 100 * 2, 100)}%`, background: "linear-gradient(90deg,#EF4444,#F87171)", borderRadius: 4, transition: "width 1s ease" }} />
                              </div>
                              <div style={{ fontSize: 11, color: theme.textMuted, minWidth: 40 }}>{count}×</div>
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
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, letterSpacing: 2, flex: 1 }}>ANALYSE MOT PAR MOT</div>
                      {[["#22C55E", "Bon (80+)"], ["#F59E0B", "Moyen (50–79)"], ["#EF4444", "Problème (<50)"]].map(([c, l]) => (
                        <span key={l} style={{ fontSize: 11, fontWeight: 700, color: c }}>● {l}</span>
                      ))}
                    </div>

                    {/* ─── Phoneme cards ─── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {words.map((w, i) => {
                        const score = w.score ?? 100;
                        const ac = score >= 80 ? "#22C55E" : score >= 50 ? "#F59E0B" : "#EF4444";
                        const cardBg = score >= 80
                          ? (isDarkMode ? "#052e16" : "#F0FDF4")
                          : score >= 50 ? (isDarkMode ? "#2d1a00" : "#FFFBEB")
                            : (isDarkMode ? "#2d0a0a" : "#FEF2F2");
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
                          <div key={i} style={{ background: cardBg, borderRadius: 18, padding: "18px 20px", border: `1.5px solid ${ac}35`, transition: "all 0.3s" }}>

                            {/* Row 1: word + mini-waveform + score */}
                            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                              <div style={{ fontWeight: 900, fontSize: 20, color: theme.text, minWidth: 90 }}>{w.word}</div>

                              {/* Mini waveform per word */}
                              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32, flex: 1 }}>
                                {miniBars.map((amp, bi) => (
                                  <div key={bi} style={{ flex: 1, borderRadius: 2, background: `${ac}${Math.round(55 + amp * 150).toString(16).padStart(2, "0")}`, height: `${Math.round(amp * 100)}%`, transition: "height 0.6s ease", minHeight: 4 }} />
                                ))}
                              </div>

                              <div style={{ fontWeight: 900, fontSize: 20, color: ac, textAlign: "right", minWidth: 52 }}>
                                {score}<span style={{ fontSize: 10, fontWeight: 400, color: theme.textMuted }}>/100</span>
                              </div>
                            </div>

                            {/* Row 2: IPA expected vs detected with char-level diff */}
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: hasIssue ? 10 : 0, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, background: isDarkMode ? "#052e16" : "#DCFCE7", borderRadius: 8, padding: "4px 10px" }}>
                                <span style={{ fontSize: 10, fontWeight: 800, color: "#22C55E", letterSpacing: 1 }}>CIBLE</span>
                                <span style={{ fontFamily: "monospace", fontSize: 13, color: "#22C55E", letterSpacing: 1 }}>{w.expectedIpa}</span>
                              </div>
                              {ipaChars && (
                                <>
                                  <span style={{ color: theme.textMuted, fontSize: 14 }}>→</span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: isDarkMode ? "#2d0a0a" : "#FEE2E2", borderRadius: 8, padding: "4px 10px" }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: ac, letterSpacing: 1 }}>TOI</span>
                                    <span style={{ fontFamily: "monospace", fontSize: 13, letterSpacing: 1 }}>
                                      {ipaChars.map((c, ci) => (
                                        <span key={ci} style={{ color: c.isDiff ? "#EF4444" : "#86efac", fontWeight: c.isDiff ? 900 : 400, textDecoration: c.isDiff ? "underline" : "none" }}>{c.ch}</span>
                                      ))}
                                    </span>
                                  </div>
                                </>
                              )}
                              {/* Score bar inline */}
                              <div style={{ flex: 1, minWidth: 60, height: 6, background: isDarkMode ? "#ffffff10" : "#0000000a", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ width: `${score}%`, height: "100%", background: `linear-gradient(90deg,${ac}80,${ac})`, borderRadius: 3, transition: "width 1.2s ease" }} />
                              </div>
                            </div>

                            {/* Row 3: issue + tip */}
                            {hasIssue && (
                              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5, paddingTop: 6, borderTop: `1px solid ${ac}20` }}>
                                <span style={{ color: ac, fontWeight: 800, whiteSpace: "nowrap" }}>⚠ {w.issue}</span>
                                {w.tip && w.tip !== "null" && <span style={{ color: theme.textMuted }}>— {w.tip}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* ─── Strong points + global advice ─── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
                      {practicePhonemeData.strongPoints && (
                        <div style={{ background: isDarkMode ? "#052e16" : "#F0FDF4", borderRadius: 14, padding: "12px 18px", fontSize: 13, color: isDarkMode ? "#86efac" : "#166534", lineHeight: 1.6 }}>
                          ✅ <strong>Points forts :</strong> {practicePhonemeData.strongPoints}
                        </div>
                      )}
                      <div style={{ background: isDarkMode ? "#1c1917" : "#FAFAF9", borderRadius: 14, padding: "12px 18px", fontSize: 13, color: theme.textMuted, lineHeight: 1.6, border: `1px solid ${theme.border}` }}>
                        💡 <strong>Conseil :</strong> {practicePhonemeData.globalAdvice}
                      </div>
                    </div>

                    {/* Rejouer */}
                    <button onClick={startSpeakingRecording} style={{ marginTop: 20, width: "100%", padding: "14px", background: "linear-gradient(135deg,#302b63,var(--mm-primary))", color: "white", border: "none", borderRadius: 14, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                      🔁 Réessayer
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
            {customAgent.isConnected ? null : (
              <>
                <h2 style={{ marginTop: 0 }}>🎓 IELTS Speaking Simulation</h2>
                <button onClick={startIeltsSimulation} style={{ padding: "12px 24px", background: "var(--mm-grad-aurora)", color: "white", border: "none", borderRadius: 10, fontWeight: 800, marginBottom: 16 }}>Démarrer la simulation</button>
                <div style={{ maxHeight: 400, overflowY: "auto", marginBottom: 12 }}>
                  {practiceIeltsHistory.map((entry, i) => (
                    <div key={i} style={{ marginBottom: 10, textAlign: entry.role === "candidate" ? "right" : "left" }}>
                      <div style={{ display: "inline-block", padding: "10px 18px", borderRadius: 16, background: entry.role === "candidate" ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : "#E5E7EB", color: entry.role === "candidate" ? "white" : "#1F2937", maxWidth: "80%" }}>
                        {entry.text}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "16px 20px", borderTop: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)"}`, background: isDarkMode ? "rgba(10,15,30,0.6)" : "rgba(255,255,255,0.6)", backdropFilter: "blur(20px)", margin: "16px -24px -24px" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8,
                      background: customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.05)" : "#F0FDF4") : theme.inputBg,
                      border: `2px solid ${customAgent.isConnected ? (isDarkMode ? "rgba(16,185,129,0.3)" : "#86EFAC") : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)")}`,
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
                          setPracticeIeltsHistory([]);
                          setAgentTranscript([]);
                          setAgentError("");
                          agent.start(MODE_CONFIGS.ielts({ part: practiceIeltsPart }));
                        }}
                        theme={theme}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                    <button onClick={() => { if (customAgent.isConnected) return; answerIelts(practiceInput); setPracticeInput(""); }} disabled={customAgent.isConnected || !practiceInput.trim()} style={{ width: 50, height: 50, borderRadius: 16, background: (!customAgent.isConnected && practiceInput.trim()) ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : theme.inputBg, border: `1px solid ${!customAgent.isConnected && practiceInput.trim() ? "transparent" : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)")}`, cursor: (!customAgent.isConnected && practiceInput.trim()) ? "pointer" : "default", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: customAgent.isConnected ? 0.3 : 1, transition: "all 0.3s", boxShadow: (!customAgent.isConnected && practiceInput.trim()) ? "0 8px 20px rgba(77,107,254,0.4)" : "none", color: (!customAgent.isConnected && practiceInput.trim()) ? "white" : theme.textMuted }}>➤</button>
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
                <button onClick={loadDailyChallenge} disabled={practiceDailyLoading} style={{ padding: "14px 32px", background: "var(--mm-grad-aurora)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: "0 0 15px rgba(52, 81, 209,0.3)" }}>
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
                  { icon: "🏅", val: `Lv.${lvl}`, label: getLbl(lvl), color: "#7B93FF" },
                  { icon: "💬", val: practiceStats.totalMessages, label: "Messages", color: "var(--mm-primary)" },
                  { icon: "🎓", val: practiceStats.sessionsCompleted, label: "Sessions", color: "#6B82F5" },
                  { icon: "📖", val: practiceStats.levelEstimate, label: "Niveau estimé", color: "#6B82F5" },
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
          <div style={{
            position: "relative", borderRadius: 24, border: `1px solid ${theme.border}`, overflow: "hidden",
            background: `linear-gradient(to top right, rgba(2, 132, 199, 0.15) 0%, rgba(2, 132, 199, 0.5) calc(${debateBalance}% - 25%), rgba(225, 29, 72, 0.5) calc(${debateBalance}% + 25%), rgba(225, 29, 72, 0.15) 100%)`,
            transition: "background 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
            animation: debateShatter > 0 && Date.now() - debateShatter < 1000 ? "shake-ring 0.4s" : "none"
          }}>
            {/* Diagonal Line */}
            <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", background: `linear-gradient(to top right, transparent calc(${debateBalance}% - 1.5px), rgba(255,255,255,0.7) calc(${debateBalance}%), transparent calc(${debateBalance}% + 1.5px))`, transition: "background 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />

            {/* Shatter Overlay */}
            {debateShatter > 0 && (
              <div key={debateShatter} style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none", animation: "shatter-flash 1s forwards" }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M0,0 L50,50 L100,0 M0,100 L50,50 L100,100 M20,0 L50,50 L80,100 M0,30 L50,50 L100,70 M30,100 L50,50 L70,0" stroke="rgba(255,255,255,0.9)" strokeWidth="0.5" fill="none" style={{ animation: "shatter-cracks 0.3s forwards" }} />
                </svg>
              </div>
            )}

            {/* LiveKitVoiceAssistant moved to root */}
            {!customAgent.isConnected && (
              <>
                <div style={{ position: "relative", zIndex: 1, background: "linear-gradient(135deg, rgba(2, 132, 199, 0.7), rgba(225, 29, 72, 0.7))", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "var(--mm-blur)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 18, color: "white", textShadow: "0 0 15px rgba(255, 255, 255, 0.5)" }}>🌌 Cosmic Arena Debate</div>
                    {practiceDebateTopic && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", marginTop: 2, fontWeight: 600 }}>Topic : {practiceDebateTopic}</div>}
                  </div>
                  <button onClick={() => { setPracticeDebateTopic(""); setPracticeDebateHistory([]); setDebateBalance(50); }} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: "6px 12px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>↺ Reset</button>
                </div>
                {practiceDebateHistory.length === 0 && (
                  <div style={{ padding: 28, position: "relative", zIndex: 1 }}>
                    <p style={{ color: "var(--mm-fg)", marginTop: 0, marginBottom: 20, fontSize: 14, fontWeight: 700 }}>Choisis un sujet de débat. L'IA va te challenger en anglais. Chaque argument fort fait reculer ton adversaire !</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                      {["Social media does more harm than good", "AI will replace human jobs", "Remote work is better than office", "Climate change is the biggest threat", "Video games improve cognitive skills"].map(topic => (
                        <button key={topic} onClick={() => setPracticeDebateTopic(topic)} style={{ padding: "8px 14px", borderRadius: 20, border: `2px solid ${practiceDebateTopic === topic ? "#E11D48" : "var(--mm-border)"}`, background: practiceDebateTopic === topic ? "#E11D48" : "var(--mm-bg-card)", color: practiceDebateTopic === topic ? "white" : "var(--mm-fg)", fontWeight: 600, cursor: "pointer", fontSize: 13, transition: "all 0.2s", boxShadow: practiceDebateTopic === topic ? "0 4px 15px rgba(225, 29, 72, 0.4)" : "none" }}>{topic}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <input value={practiceDebateTopic} onChange={e => setPracticeDebateTopic(e.target.value)} placeholder="Ou tape ton propre sujet…" style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `2px solid var(--mm-border)`, background: "var(--mm-bg-elev)", color: "var(--mm-fg)", fontSize: 14, outline: "none" }} onKeyDown={e => e.key === "Enter" && startDebate()} onFocus={e => e.target.style.borderColor = "var(--mm-primary)"} onBlur={e => e.target.style.borderColor = "var(--mm-border)"} />
                      <button onClick={startDebate} disabled={!practiceDebateTopic.trim()} style={{ padding: "12px 24px", background: "linear-gradient(135deg,var(--mm-primary),#E11D48)", color: "white", border: "none", borderRadius: 12, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 15px rgba(225, 29, 72, 0.4)" }}>⚔️ Engage!</button>
                    </div>
                  </div>
                )}
                {practiceDebateHistory.length > 0 && (
                  <>
                    <div style={{ maxHeight: 380, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, position: "relative", zIndex: 1 }}>
                      {practiceDebateHistory.map((msg, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-end" }}>
                          {msg.role === "assistant" && <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#BE123C,#E11D48)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, boxShadow: "0 4px 10px rgba(225, 29, 72, 0.4)" }}>🤖</div>}
                          <div style={{ maxWidth: "78%", padding: "14px 18px", borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px", background: msg.role === "user" ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : "linear-gradient(135deg,#BE123C,#E11D48)", color: "white", fontSize: 15, lineHeight: 1.6, boxShadow: msg.role === "user" ? "0 4px 15px rgba(2, 132, 199, 0.4)" : "0 4px 15px rgba(225, 29, 72, 0.4)" }}>
                            {msg.role === "assistant" ? renderDraggableWord(msg.text) : msg.text}
                          </div>
                          {msg.role === "user" && <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, boxShadow: "0 4px 10px rgba(2, 132, 199, 0.4)" }}>🥊</div>}
                        </div>
                      ))}
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
                                {customAgent.isSpeaking ? "🗣️ Parle" : "👂 T'écoute"}
                              </span>
                            )}
                          </div>
                          <input value={customAgent.isConnected ? "" : practiceInput} onChange={e => { if (customAgent.isConnected) return; setPracticeInput(e.target.value); }} onKeyDown={e => { if (customAgent.isConnected || e.key !== "Enter" || !practiceInput.trim()) return; stopSpeaking(); sendDebateMessage(practiceInput); setPracticeInput(""); }} placeholder={customAgent.isConnected ? "Parle directement dans le micro..." : "Tape ton argument en anglais..."} disabled={customAgent.isConnected} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: theme.text, fontSize: 15, fontWeight: 600, minWidth: 0 }} />
                          <AgentVoiceBar
                            agent={agent}
                            variant="minimal"
                            onStart={() => {
                              setAgentTranscript([]);
                              setAgentError("");
                              agent.start(MODE_CONFIGS.debate({ topic: practiceDebateTopic, level: practiceLevel }));
                            }}
                            theme={theme}
                            isDarkMode={isDarkMode}
                          />
                        </div>
                        <button onClick={() => { if (customAgent.isConnected) return; stopSpeaking(); sendDebateMessage(practiceInput); setPracticeInput(""); }} disabled={!practiceInput.trim() || customAgent.isConnected} style={{ width: 50, height: 50, borderRadius: 16, background: (practiceInput.trim() && !customAgent.isConnected) ? "linear-gradient(135deg,var(--mm-primary),#E11D48)" : theme.inputBg, border: `1px solid ${practiceInput.trim() && !customAgent.isConnected ? "transparent" : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)")}`, cursor: (practiceInput.trim() && !customAgent.isConnected) ? "pointer" : "default", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: customAgent.isConnected ? 0.3 : 1, transition: "all 0.3s", boxShadow: (practiceInput.trim() && !customAgent.isConnected) ? "0 8px 20px rgba(225, 29, 72, 0.4)" : "none", color: (practiceInput.trim() && !customAgent.isConnected) ? "white" : theme.textMuted }}>➤</button>
                      </div>
                      {agentError && (
                        <div style={{ marginTop: 12, padding: "8px 14px", background: "#FEF2F2", color: "#EF4444", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                          {agentError}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )
      }

      {/* ══ ROLEPLAY ══ */}
      {
        practiceSubView === "roleplay" && (
          <div style={{ position: "relative", background: "var(--mm-bg-card)", borderRadius: 24, border: "1px solid var(--mm-border)", overflow: "hidden", boxShadow: "var(--mm-shadow)" }}>
            {customAgent.isConnected ? null : (
              <>
                <div style={{ background: "var(--mm-grad-aurora)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: "white" }}>🎭 Roleplay en anglais</div>
                    {practiceRoleplayScenario && <div style={{ fontSize: 12, color: "#DCE3FF", marginTop: 2 }}>Scénario : {practiceRoleplayScenario}</div>}
                  </div>
                  <button onClick={() => { setPracticeRoleplayScenario(""); setPracticeRoleplayHistory([]); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "6px 12px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>↺ Reset</button>
                </div>
                {practiceRoleplayHistory.length === 0 && (
                  <div style={{ padding: 28 }}>
                    <p style={{ color: "var(--mm-fg-muted)", marginTop: 0, marginBottom: 20, fontSize: 14 }}>Choisis un scénario. L'IA joue le rôle de l'autre personnage. Tu pratiques l'anglais en situation réelle.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 12, marginBottom: 20 }}>
                      {[
                        { scenario: "Job interview at a tech company", icon: "💼", label: "Entretien tech" },
                        { scenario: "At the doctor's office", icon: "🏥", label: "Chez le médecin" },
                        { scenario: "Negotiating a salary raise", icon: "💰", label: "Négociation salaire" },
                        { scenario: "Ordering at a restaurant", icon: "🍽️", label: "Au restaurant" },
                        { scenario: "Presenting a project to a client", icon: "📊", label: "Présentation client" },
                        { scenario: "Dealing with a difficult customer", icon: "😤", label: "Client difficile" },
                      ].map(({ scenario, icon, label }) => (
                        <button key={scenario} onClick={() => startRoleplay(scenario)} style={{ padding: "16px 14px", borderRadius: 14, border: `2px solid ${practiceRoleplayScenario === scenario ? "var(--mm-primary)" : "var(--mm-border)"}`, background: practiceRoleplayScenario === scenario ? "rgba(52, 81, 209, 0.1)" : "var(--mm-bg-elev)", color: "var(--mm-fg)", fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 6, transition: "all 0.2s" }}>
                          <span style={{ fontSize: 22 }}>{icon}</span>
                          <span style={{ fontSize: 13 }}>{label}</span>
                          <span style={{ fontSize: 11, color: "var(--mm-fg-muted)", fontWeight: 400 }}>{scenario}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <input value={practiceRoleplayScenario} onChange={e => setPracticeRoleplayScenario(e.target.value)} placeholder="Ou décris ton propre scénario…" style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "1.5px solid var(--mm-border)", background: "var(--mm-bg-elev)", color: "var(--mm-fg)", fontSize: 14 }} onKeyDown={e => e.key === "Enter" && practiceRoleplayScenario.trim() && startRoleplay(practiceRoleplayScenario)} />
                      <button onClick={() => startRoleplay(practiceRoleplayScenario)} disabled={!practiceRoleplayScenario.trim()} style={{ padding: "12px 24px", background: "var(--mm-grad-aurora)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 0 15px rgba(52, 81, 209, 0.3)" }}>🎭 Lancer</button>
                    </div>
                  </div>
                )}
                {practiceRoleplayHistory.length > 0 && (
                  <>
                    <div style={{ maxHeight: 380, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
                      {practiceRoleplayHistory.map((msg, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-end" }}>
                          {msg.role === "assistant" && <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🎭</div>}
                          <div style={{ maxWidth: "78%", padding: "12px 16px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : theme.inputBg, color: msg.role === "user" ? "white" : theme.text, fontSize: 14, lineHeight: 1.6 }}>{msg.text}</div>
                          {msg.role === "user" && <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>😊</div>}
                        </div>
                      ))}
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
                              setAgentTranscript([]);
                              setAgentError("");
                              agent.start(MODE_CONFIGS.roleplay({
                                scenario: practiceRoleplayScenario,
                                character: practiceRoleplayCharacter || "the other person in the scenario",
                                level: practiceLevel,
                              }));
                            }}
                            theme={theme}
                            isDarkMode={isDarkMode}
                          />
                        </div>
                        <button onClick={() => { if (customAgent.isConnected) return; stopSpeaking(); sendRoleplayMessage(practiceInput); setPracticeInput(""); }} disabled={!practiceInput.trim() || customAgent.isConnected} style={{ width: 50, height: 50, borderRadius: 16, background: (practiceInput.trim() && !customAgent.isConnected) ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : theme.inputBg, border: `1px solid ${practiceInput.trim() && !customAgent.isConnected ? "transparent" : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.1)")}`, cursor: (practiceInput.trim() && !customAgent.isConnected) ? "pointer" : "default", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: customAgent.isConnected ? 0.3 : 1, transition: "all 0.3s", boxShadow: (practiceInput.trim() && !customAgent.isConnected) ? "0 8px 20px rgba(123,47,190,0.4)" : "none", color: (practiceInput.trim() && !customAgent.isConnected) ? "white" : theme.textMuted }}>➤</button>
                      </div>
                      {agentError && (
                        <div style={{ marginTop: 12, padding: "8px 14px", background: "#FEF2F2", color: "#EF4444", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                          {agentError}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )
      }

      {/* ══ DICTÉE ══ */}
      {
        practiceSubView === "dictation" && (
          <div style={{ background: "var(--mm-bg-card)", borderRadius: 24, border: "1px solid var(--mm-border)", boxShadow: "var(--mm-shadow)" }}>
            <div style={{ background: "var(--mm-grad-aurora)", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.1)", borderRadius: "23px 23px 0 0" }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "white" }}>✍️ Dictée anglaise</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>Écoute, transcris, et vérifie ta précision</div>
            </div>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                {["beginner", "intermediate", "advanced"].map(lvl => (
                  <button key={lvl} onClick={() => setPracticeLevel(lvl)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${practiceLevel === lvl ? "var(--mm-primary)" : "var(--mm-border)"}`, background: practiceLevel === lvl ? "rgba(52, 81, 209, 0.1)" : "var(--mm-bg-elev)", color: practiceLevel === lvl ? "var(--mm-primary)" : "var(--mm-fg)", fontWeight: 700, cursor: "pointer", fontSize: 12, transition: "all 0.2s" }}>
                    {lvl === "beginner" ? "🟢 Débutant" : lvl === "intermediate" ? "🟡 Intermédiaire" : "🔴 Avancé"}
                  </button>
                ))}
              </div>
              <button onClick={startDictation} disabled={practiceDictationLoading} style={{ width: "100%", padding: "16px", background: "var(--mm-grad-aurora)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, fontSize: 15, cursor: "pointer", marginBottom: 24, boxShadow: "0 4px 20px rgba(52, 81, 209,0.3)" }}>
                {practiceDictationLoading ? "⏳ Génération en cours…" : "🎲 Générer une nouvelle dictée"}
              </button>
              {practiceDictationSentences && practiceDictationSentences.length > 0 && practiceDictationScore === null && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontWeight: "bold", color: "var(--mm-primary)" }}>Phrase {practiceDictationCurrentIndex + 1} sur {practiceDictationSentences.length}</div>
                    <div style={{ background: "var(--mm-bg-elev)", padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: "bold", border: `1px solid ${theme.border}` }}>
                      {Math.round((practiceDictationCurrentIndex / practiceDictationSentences.length) * 100)}% complété
                    </div>
                  </div>
                  
                  <div style={{ background: "var(--mm-bg-elev)", borderRadius: 16, padding: "20px", marginBottom: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, border: `1px solid ${theme.border}` }}>
                    <button 
                      onClick={() => speakText(practiceDictationSentences[practiceDictationCurrentIndex])} 
                      style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--mm-grad-aurora)", border: "none", cursor: "pointer", fontSize: 36, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 25px rgba(52, 81, 209,0.4)", transition: "transform 0.2s" }}
                      onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                      onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                    >
                      🔊
                    </button>
                    <div style={{ fontSize: 14, color: "var(--mm-fg-muted)", textAlign: "center", fontWeight: "500" }}>Clique pour écouter la phrase.<br/>Tu peux répéter autant de fois que nécessaire sans pénalité.</div>
                  </div>
                  
                  {practiceDictationCurrentIndex > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: "bold", color: "var(--mm-fg-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Ton texte jusqu'à présent :</div>
                      <div style={{ padding: "14px 16px", borderRadius: 12, background: "var(--mm-bg-elev)", border: `1px dashed ${theme.border}`, color: "var(--mm-fg)", fontSize: 15, lineHeight: 1.6, opacity: 0.8, whiteSpace: "pre-wrap" }}>
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
                    placeholder="Écris uniquement la phrase entendue ici..." 
                    style={{ width: "100%", padding: "16px", borderRadius: 12, border: "2px solid var(--mm-border)", background: "var(--mm-bg-elev)", color: "var(--mm-fg)", fontSize: 16, fontFamily: "'Outfit', sans-serif", resize: "none", boxSizing: "border-box", outline: "none", transition: "border-color 0.2s" }} 
                    onFocus={e => e.target.style.borderColor = "var(--mm-primary)"}
                    onBlur={e => e.target.style.borderColor = "var(--mm-border)"}
                  />
                  
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    {practiceDictationCurrentIndex < practiceDictationSentences.length - 1 ? (
                      <button 
                        onClick={() => {
                          setPracticeDictationCurrentIndex(prev => prev + 1);
                          setTimeout(() => speakText(practiceDictationSentences[practiceDictationCurrentIndex + 1]), 300);
                        }} 
                        disabled={!(practiceDictationInputs[practiceDictationCurrentIndex] || "").trim()} 
                        style={{ flex: 1, padding: "16px", background: "var(--mm-grad-aurora)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(52, 81, 209,0.3)" }}
                      >
                        Passer à la phrase suivante ➡️
                      </button>
                    ) : (
                      <button 
                        onClick={checkDictation} 
                        disabled={!(practiceDictationInputs[practiceDictationCurrentIndex] || "").trim()} 
                        style={{ flex: 1, padding: "16px", background: "#10B981", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(16, 185, 129,0.3)" }}
                      >
                        ✅ Terminer & Vérifier la Dictée
                      </button>
                    )}
                  </div>
                </>
              )}
              
              {practiceDictationScore !== null && (
                <div style={{ marginTop: 20, borderRadius: 16, border: `2px solid ${practiceDictationScore >= 80 ? "#059669" : practiceDictationScore >= 50 ? "#D97706" : "#DC2626"}` }}>
                  <div style={{ padding: "16px 20px", borderRadius: "14px 14px 0 0", background: practiceDictationScore >= 80 ? "#D1FAE5" : practiceDictationScore >= 50 ? "#FEF3C7" : "#FEE2E2", display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ fontSize: 40, fontWeight: 900, color: practiceDictationScore >= 80 ? "#064E3B" : practiceDictationScore >= 50 ? "#92400E" : "#991B1B" }}>{practiceDictationScore}%</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: practiceDictationScore >= 80 ? "#064E3B" : practiceDictationScore >= 50 ? "#92400E" : "#991B1B" }}>
                        {practiceDictationScore >= 80 ? "🎉 Excellent !" : practiceDictationScore >= 50 ? "👍 Pas mal !" : "💪 Continue !"}
                      </div>
                      <div style={{ fontSize: 12, color: practiceDictationScore >= 80 ? "#065F46" : practiceDictationScore >= 50 ? "#B45309" : "#B91C1C" }}>Précision de transcription globale</div>
                    </div>
                  </div>
                  <div style={{ padding: "20px", borderRadius: "0 0 14px 14px", background: theme.cardBg }}>
                    {renderDictationMistakes()}
                    
                    {practiceDictationFeedback?.mistakes && practiceDictationFeedback.mistakes.length > 0 && (
                      <button onClick={() => importFlashcards(practiceDictationFeedback.mistakes, "dictation", "la Dictée")} style={{ background: "#10B981", color: "white", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: "bold", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(16,185,129,0.3)", marginTop: 16 }}>
                        ➕ Créer des fiches de révision pour ces erreurs
                      </button>
                    )}
                    
                    <div style={{ marginTop: 24 }}>
                      <div style={{ fontWeight: 700, color: theme.text, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>Texte original complet :</div>
                      <div style={{ background: theme.inputBg, padding: "16px", borderRadius: 12, fontSize: 15, color: theme.text, lineHeight: 1.8, border: `1px solid ${theme.border}` }}>
                        {practiceDictationText}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
            "Business": { glow: "#3B82F6", node: "#1E3A8A", text: "#BFDBFE" },
            "Academic": { glow: "#10B981", node: "#064E3B", text: "#A7F3D0" },
            "Daily Life": { glow: "#F97316", node: "#7C2D12", text: "#FED7AA" },
            "Technology": { glow: "var(--mm-primary)", node: "#312E81", text: "#BFCBFF" },
            "Nature": { glow: "#22C55E", node: "#14532D", text: "#BBF7D0" },
            "Social": { glow: "#EC4899", node: "#831843", text: "#FBCFE8" },
            "Other": { glow: "#A8A29E", node: "#1C1917", text: "#D6D3D1" },
          };
          const getColors = (theme) => THEME_COLORS[theme] || THEME_COLORS["Other"];
          const rarityGlow = (r) => r === 3 ? "0 0 18px 6px rgba(250,204,21,0.7), 0 0 40px rgba(250,204,21,0.3)" : r === 2 ? "0 0 10px 3px rgba(77, 107, 254,0.5)" : "none";
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
                    style={{ padding: "10px 22px", background: brainMapLoading ? "var(--mm-bg-elev)" : "var(--mm-grad-aurora)", color: brainMapLoading ? "var(--mm-fg-muted)" : "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: brainMapLoading ? "default" : "pointer", fontSize: 13, boxShadow: brainMapLoading ? "none" : "0 0 15px rgba(52, 81, 209,0.3)" }}
                  >
                    {brainMapLoading ? "⏳ Analyse en cours…" : "✨ Générer / Rafraîchir"}
                  </button>
                  {themes.length > 0 && (
                    <>
                      <button onClick={() => setBrainMapFilter("all")} style={{ padding: "8px 14px", borderRadius: 10, border: `2px solid ${brainMapFilter === "all" ? "var(--mm-primary)" : "var(--mm-border)"}`, background: brainMapFilter === "all" ? "rgba(52, 81, 209,0.1)" : "var(--mm-bg-elev)", color: brainMapFilter === "all" ? "var(--mm-primary)" : "var(--mm-fg)", fontWeight: 700, cursor: "pointer", fontSize: 12, transition: "all 0.2s" }}>Tous</button>
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
                    {[["🟡 Or pulsant", "Mot rare (C1/C2)", "#FACC15"], ["🔵 Halo violet", "Intermédiaire (B1/B2)", "#7B93FF"], ["⚪ Standard", "Commun (A1/A2)", "var(--mm-fg-muted)"]].map(([label, desc, col]) => (
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
                      style={{ flex: 1, minWidth: 0, position: "relative", borderRadius: 18, overflow: "hidden", background: "var(--mm-bg-elev)", border: "1px solid var(--mm-border)", boxShadow: "inset 0 0 40px rgba(77,107,254,0.2)" }}
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
                                  {w.rarity === 2 && <circle r={fs * 1.4} fill="rgba(77, 107, 254,0.12)" />}
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
                            border: `1px solid ${getColors(hw.theme).glow}60`,
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
                      <div style={{ width: 240, flexShrink: 0, background: "var(--mm-bg-elev)", borderRadius: 18, border: `1.5px solid ${getColors(brainMapSelected.theme).glow}40`, overflow: "hidden", boxShadow: "var(--mm-shadow)" }}>
                        {/* Panel header */}
                        <div style={{ background: getColors(brainMapSelected.theme).node, padding: "14px 18px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ fontWeight: 900, fontSize: 20, color: "white", letterSpacing: -0.5 }}>{brainMapSelected.word}</div>
                            <button onClick={() => setBrainMapSelected(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, color: "white", cursor: "pointer", fontSize: 16, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(255,255,255,0.15)", color: "white", padding: "3px 8px", borderRadius: 20 }}>{brainMapSelected.theme}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, background: brainMapSelected.rarity === 3 ? "#FACC15" : brainMapSelected.rarity === 2 ? "#7B93FF" : "rgba(255,255,255,0.1)", color: brainMapSelected.rarity === 3 ? "#1C1917" : "white", padding: "3px 8px", borderRadius: 20 }}>
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
                                <div style={{ background: isDarkMode ? "#1E1040" : "#EDE9FE", borderRadius: 12, padding: "10px 14px" }}>
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

      {/* ══ AI ACCENT COACH ══ */}
      {
        practiceSubView === "accent" && (
          <AccentTraining
            callClaude={callClaude}
            storage={storage}
            theme={theme}
            isDarkMode={isDarkMode}
            showToast={showToast}
          />
        )
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
                  boxShadow: notebookLoading || !notebookText.trim() ? "none" : "0 4px 20px rgba(77,107,254,0.4)"
                }}
              >
                {notebookLoading ? "⏳ L'IA génère tes fiches…" : "✨ Générer mes fiches de révision"}
              </button>
            </div>

            {/* ── Preview des fiches générées ── */}
            {notebookCards.length > 0 && (
              <div style={{ background: theme.cardBg, borderRadius: 24, padding: 24, border: `2px solid var(--mm-primary)40` }}>
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
                      const colors = { vocab: "#3B82F6", grammar: "var(--mm-primary)", idiom: "#F59E0B", phrase: "#10B981" };
                      const labels = { vocab: "Vocab", grammar: "Gram.", idiom: "Idiome", phrase: "Phrase" };
                      return (
                        <span key={tag} style={{ fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 8, background: `${colors[tag]}20`, color: colors[tag] }}>
                          {labels[tag]} ×{count}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Cards list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  {notebookCards.map((card, i) => {
                    const tagColors = { vocab: "#3B82F6", grammar: "var(--mm-primary)", idiom: "#F59E0B", phrase: "#10B981" };
                    const tc = tagColors[card.tag] || "var(--mm-fg)";
                    return (
                      <div key={i} style={{ background: isDarkMode ? "#0F0F0F" : "#F9FAFB", borderRadius: 16, padding: "16px 20px", border: `1.5px solid ${tc}30`, position: "relative" }}>
                        <div style={{ position: "absolute", top: 12, right: 14, fontSize: 10, fontWeight: 800, color: tc, background: `${tc}15`, padding: "3px 8px", borderRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                          {card.tag || "vocab"}
                        </div>
                        <div style={{ fontWeight: 900, fontSize: 16, color: theme.text, marginBottom: 6, paddingRight: 60 }}>{card.front}</div>
                        <div style={{ fontSize: 14, color: isDarkMode ? "#A5B4FC" : "#4338CA", fontWeight: 700, marginBottom: card.example ? 8 : 0 }}>{card.back}</div>
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
                      background: coachMode === t.id ? theme.primary : isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)",
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
              @keyframes coachListen { 0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(77, 107, 254,0.7)} 70%{transform:scale(1.05);box-shadow:0 0 0 18px rgba(77, 107, 254,0)} }
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
                      boxShadow: "0 20px 60px rgba(52, 81, 209,0.4)",
                      position: "relative", overflow: "hidden"
                    }}>
                      <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, background: "radial-gradient(circle,rgba(123, 147, 255,0.3),transparent)", borderRadius: "50%", pointerEvents: "none" }} />
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#A5B4FC", letterSpacing: 3, marginBottom: 8, textTransform: "uppercase" }}>PRONUNCIATION COACH</div>
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
                      border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.25)" : "rgba(77, 107, 254,0.2)"}`,
                      boxShadow: isDarkMode ? "0 10px 40px rgba(0,0,0,0.4)" : "0 10px 40px rgba(77, 107, 254,0.08)"
                    }}>
                      {/* Phrase display */}
                      {!coachPhrase && !coachGenerating && (
                        <div style={{ textAlign: "center", padding: "32px 0" }}>
                          <div style={{ fontSize: 52, marginBottom: 16 }}>🎯</div>
                          <div style={{ fontSize: 16, color: theme.textMuted, marginBottom: 24 }}>Génère une phrase pour commencer</div>
                          <button onClick={generatePhrase} style={{
                            padding: "14px 36px", background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))",
                            color: "white", border: "none", borderRadius: 16, fontWeight: 900, fontSize: 16,
                            cursor: "pointer", boxShadow: "0 8px 24px rgba(52, 81, 209,0.4)"
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
                            <span style={{ fontSize: 11, fontWeight: 900, padding: "4px 12px", borderRadius: 20, background: "rgba(52, 81, 209,0.12)", color: "var(--mm-primary)", letterSpacing: 1, textTransform: "uppercase" }}>
                              {coachPhrase.cefrLevel}
                            </span>
                            <button onClick={generatePhrase} disabled={coachListening || coachLoading} style={{
                              fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, cursor: "pointer",
                              background: "transparent", border: `1px solid ${theme.border}`, color: theme.textMuted
                            }}>🔀 Nouvelle phrase</button>
                          </div>

                          {/* Target phrase — colored when feedback available */}
                          <div style={{
                            background: isDarkMode ? "rgba(77, 107, 254,0.08)" : "var(--mm-bg-elev)",
                            borderRadius: 16, padding: "20px 24px",
                            border: `2px solid ${isDarkMode ? "rgba(77, 107, 254,0.25)" : "rgba(77, 107, 254,0.2)"}`
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
                                        boxShadow: isSelected ? `0 4px 16px ${color}40` : "none"
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
                              border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.4)" : "rgba(77, 107, 254,0.3)"}`,
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
                                <div style={{ fontSize: 13, color: isDarkMode ? "#A5B4FC" : "#4338CA", lineHeight: 1.5 }}>💡 {coachWordTip.tip}</div>
                              )}
                            </div>
                          )}

                          {/* TTS button */}
                          <button
                            onClick={() => { markInteracted(); speakText(coachPhrase.text, true); }}
                            style={{
                              alignSelf: "flex-start", padding: "10px 20px",
                              background: isDarkMode ? "rgba(77, 107, 254,0.12)" : "rgba(77, 107, 254,0.08)",
                              border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.3)" : "rgba(77, 107, 254,0.25)"}`,
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
                                  boxShadow: coachListening ? "0 0 0 0 rgba(239,68,68,0.5)" : "0 8px 24px rgba(52, 81, 209,0.5)",
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
                                  background: isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(77,107,254,0.05)",
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
                        border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)"}`,
                        boxShadow: isDarkMode ? "0 16px 48px rgba(0,0,0,0.5)" : "0 16px 48px rgba(77,107,254,0.05)"
                      }}>
                        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>

                          {/* Score ring */}
                          <div style={{ position: "relative", width: 100, height: 100, flexShrink: 0 }}>
                            <svg width="100" height="100" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="45" fill="none" stroke={isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(77,107,254,0.05)"} strokeWidth="8" />
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
                                    <div style={{ fontSize: 13, color: isDarkMode ? "#A5B4FC" : "#4338CA", lineHeight: 1.5 }}>💡 {w.tip}</div>
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
                            background: isDarkMode ? "rgba(77, 107, 254,0.1)" : "rgba(77, 107, 254,0.06)",
                            borderRadius: 14, border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.3)" : "rgba(77, 107, 254,0.2)"}`,
                            fontSize: 13, color: isDarkMode ? "#A5B4FC" : "#4338CA", lineHeight: 1.5
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
                              background: isDarkMode ? "rgba(77, 107, 254,0.15)" : "rgba(77, 107, 254,0.08)",
                              border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.3)" : "rgba(77, 107, 254,0.2)"}`,
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
                              boxShadow: "0 6px 20px rgba(52, 81, 209,0.4)"
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

      {/* ── TAB : Role-Play Vocal ────────────────────────────────────────── */}
      {
        practiceSubView === "roleplay" && (() => {
          const isActive = rpState !== "idle" && rpState !== "picking";
          const turnPct = Math.round((rpTurnRef.current / MAX_RP_TURNS) * 100);
          const stateLabel = {
            running: { label: "🔊 Claude parle…", color: "var(--mm-primary)", pulse: true },
            listening: { label: "🎤 À toi de parler…", color: "#22C55E", pulse: true },
            thinking: { label: "⏳ Claude réfléchit…", color: "#F59E0B", pulse: false },
            scoring: { label: "📊 Scoring final…", color: "#7B93FF", pulse: false },
            done: { label: "✅ Session terminée", color: "#22C55E", pulse: false },
          }[rpState] || null;

          // Score gauge helper
          const ScoreRing = ({ value, label, color }) => {
            const r = 36, c = 2 * Math.PI * r;
            const pct = typeof value === "number" ? value : 0;
            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <svg width={90} height={90} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={45} cy={45} r={r} fill="none" stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)"} strokeWidth={8} />
                  <circle cx={45} cy={45} r={r} fill="none" stroke={color} strokeWidth={8}
                    strokeDasharray={`${(pct / 100) * c} ${c}`} strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 1s ease" }} />
                </svg>
                <div style={{ marginTop: -68, fontWeight: 900, fontSize: 24, color, textAlign: "center" }}>
                  {typeof value === "number" ? value : "?"}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
              </div>
            );
          };

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <style>{`
              @keyframes rpPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
              @keyframes rpBubbleIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
              .rp-bubble { animation: rpBubbleIn 0.35s ease; }
              .rp-scenario-card:hover { transform:translateY(-4px) scale(1.02) !important; }
            `}</style>

              {/* ─── Header ─── */}
              <div style={{
                background: isDarkMode ? "linear-gradient(135deg,var(--mm-bg-elev),var(--mm-bg))" : "linear-gradient(135deg,var(--mm-bg-elev),#fff)",
                borderRadius: 24, padding: "24px 28px",
                border: `1.5px solid ${isDarkMode ? "rgba(77, 107, 254,0.35)" : "rgba(77, 107, 254,0.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#7B93FF", letterSpacing: 3, marginBottom: 4, textTransform: "uppercase" }}>
                    Web Speech API · Zéro coût vocal
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 22, color: theme.text }}>
                    🎭 Role-Play Vocal
                  </div>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
                    {isActive && rpScenario
                      ? `📍 ${rpScenario.emoji} ${rpScenario.title} · Tour ${rpTurnRef.current}/${MAX_RP_TURNS}`
                      : "Choisis un scénario et parle anglais avec Claude en temps réel"}
                  </div>
                </div>
                {isActive && (
                  <button onClick={rpStopSession} style={{
                    padding: "10px 20px", borderRadius: 14,
                    background: "rgba(239,68,68,0.12)", border: "1.5px solid rgba(239,68,68,0.4)",
                    color: "#EF4444", fontWeight: 800, fontSize: 13, cursor: "pointer"
                  }}>⏹️ Arrêter la session</button>
                )}
              </div>

              {/* ─── State badge ─── */}
              {stateLabel && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 20px",
                  background: isDarkMode ? `${stateLabel.color}18` : `${stateLabel.color}0f`,
                  border: `1.5px solid ${stateLabel.color}50`, borderRadius: 16
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%", background: stateLabel.color, flexShrink: 0,
                    animation: stateLabel.pulse ? "rpPulse 1.2s ease-in-out infinite" : "none"
                  }} />
                  <span style={{ fontWeight: 800, fontSize: 14, color: stateLabel.color }}>{stateLabel.label}</span>
                  {rpState === "listening" && (
                    <span style={{ fontSize: 12, color: theme.textMuted, marginLeft: "auto" }}>
                      Parle clairement en anglais · Chrome recommandé
                    </span>
                  )}
                </div>
              )}

              {/* ─── Progress bar (during session) ─── */}
              {isActive && rpState !== "done" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: theme.textMuted, marginBottom: 6, fontWeight: 700 }}>
                    <span>Progression de la session</span>
                    <span>{rpTurnRef.current}/{MAX_RP_TURNS} échanges</span>
                  </div>
                  <div style={{ height: 6, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${turnPct}%`, background: "linear-gradient(90deg,var(--mm-primary),#7B93FF)", borderRadius: 3, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              )}

              {/* ─── Scenario picker ─── */}
              {!isActive && rpState !== "done" && (
                <div style={{
                  background: isDarkMode ? "var(--mm-bg-elev)" : "white",
                  borderRadius: 24, padding: 24,
                  border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(77,107,254,0.05)"}`
                }}>
                  <div style={{ fontWeight: 900, fontSize: 17, color: theme.text, marginBottom: 6 }}>🎬 Choisir un scénario</div>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}>
                    Claude joue le personnage. La boucle est automatique : il parle → tu réponds → il corrige.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
                    {RP_SCENARIOS.map(sc => (
                      <button
                        key={sc.id}
                        className="rp-scenario-card"
                        onClick={() => startRoleplay(sc)}
                        style={{
                          background: isDarkMode ? `${sc.color}12` : `${sc.color}09`,
                          border: `2px solid ${sc.color}40`,
                          borderRadius: 20, padding: "20px 18px", cursor: "pointer", textAlign: "left",
                          transition: "transform 0.25s, box-shadow 0.25s",
                          boxShadow: `0 4px 16px ${sc.color}20`
                        }}
                      >
                        <div style={{ fontSize: 32, marginBottom: 10 }}>{sc.emoji}</div>
                        <div style={{ fontWeight: 900, fontSize: 15, color: sc.color, marginBottom: 4 }}>{sc.title}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>{sc.subtitle}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted, fontStyle: "italic", lineHeight: 1.4 }}>
                          💡 {sc.tip}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Live Transcript ─── */}
              {(isActive || rpState === "done") && rpHistory.length > 0 && (
                <div style={{
                  background: isDarkMode ? "var(--mm-bg-elev)" : "white",
                  borderRadius: 24, padding: 24,
                  border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(77,107,254,0.05)"}`,
                  maxHeight: 440, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14
                }}>
                  <div style={{ fontWeight: 900, fontSize: 15, color: theme.text, marginBottom: 4 }}>
                    📜 Conversation {rpScenario ? `· ${rpScenario.emoji} ${rpScenario.title}` : ""}
                  </div>
                  {rpHistory.map((msg, i) => {
                    const isUser = msg.role === "user";
                    const sc = rpScenario;
                    const bubbleColor = isUser
                      ? (isDarkMode ? "rgba(77, 107, 254,0.18)" : "rgba(77, 107, 254,0.1)")
                      : (isDarkMode ? `${sc?.color || "var(--mm-primary)"}18` : `${sc?.color || "var(--mm-primary)"}0d`);
                    const borderColor = isUser
                      ? "rgba(77, 107, 254,0.3)"
                      : `${sc?.color || "var(--mm-primary)"}40`;
                    return (
                      <div key={i} className="rp-bubble" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: isUser ? "flex-end" : "flex-start" }}>
                        {/* Label */}
                        <div style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>
                          {isUser ? "🧑 Toi" : `${sc?.emoji || "🎭"} ${sc?.title || "Personnage"}`}
                        </div>
                        {/* Bubble */}
                        <div style={{
                          background: bubbleColor, border: `1.5px solid ${borderColor}`,
                          borderRadius: isUser ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                          padding: "12px 18px", maxWidth: "80%",
                          fontSize: 14, color: theme.text, lineHeight: 1.6
                        }}>
                          {msg.text}
                        </div>
                        {/* Inline feedback chip */}
                        {isUser && msg.feedback && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: msg.feedback.toLowerCase().includes("perfect")
                              ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                            border: `1px solid ${msg.feedback.toLowerCase().includes("perfect") ? "rgba(34,197,94,0.35)" : "rgba(245,158,11,0.35)"}`,
                            borderRadius: 10, padding: "5px 12px", maxWidth: "80%"
                          }}>
                            <span style={{ fontSize: 14 }}>
                              {msg.feedback.toLowerCase().includes("perfect") ? "✅" : "✏️"}
                            </span>
                            <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>
                              {msg.feedback}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Listening indicator at bottom */}
                  {rpState === "listening" && (
                    <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "8px 0" }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: 8, height: 8, borderRadius: "50%", background: "#22C55E",
                          animation: `rpPulse 1.2s ease ${i * 0.2}s infinite`
                        }} />
                      ))}
                      <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 700, marginLeft: 8 }}>
                        En écoute…
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Fallback Manual Mic Button ─── */}
              {rpState === "listening" && (
                <div style={{ textAlign: "center", padding: "8px 0" }}>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>
                    Pas de détection ? Clique pour forcer l'écoute
                  </div>
                  <button
                    onClick={() => {
                      rpRecogRef.current?.stop?.();
                      setTimeout(() => rpListen(
                        t => rpOnUserSpeech(t),
                        e => { setRpError(e); setRpState("running"); }
                      ), 300);
                    }}
                    style={{
                      padding: "12px 28px", borderRadius: 16,
                      background: "linear-gradient(135deg,#22C55E,#16A34A)",
                      color: "white", border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer",
                      boxShadow: "0 6px 20px rgba(34,197,94,0.3)"
                    }}
                  >🎤 Parler maintenant</button>
                </div>
              )}

              {/* ─── Error display ─── */}
              {rpError && (
                <div style={{
                  background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.3)",
                  borderRadius: 14, padding: "12px 18px", fontSize: 13, color: "#EF4444", fontWeight: 700
                }}>
                  ⚠️ {rpError}
                </div>
              )}

              {/* ─── Final Score Dashboard ─── */}
              {rpState === "done" && rpScore && (
                <div style={{
                  background: isDarkMode ? "linear-gradient(135deg,var(--mm-bg-elev),var(--mm-bg))" : "linear-gradient(135deg,var(--mm-bg-elev),#fff)",
                  borderRadius: 24, padding: 28,
                  border: `2px solid ${isDarkMode ? "rgba(77, 107, 254,0.4)" : "rgba(77, 107, 254,0.2)"}`,
                  boxShadow: "0 20px 60px rgba(77, 107, 254,0.12)"
                }}>
                  {/* Header */}
                  <div style={{ fontWeight: 900, fontSize: 20, color: theme.text, marginBottom: 4 }}>🏆 Résultats de la session</div>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 24 }}>
                    {rpScenario?.emoji} {rpScenario?.title} · {rpTurnRef.current} échanges
                  </div>

                  {/* Score rings */}
                  <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
                    <ScoreRing value={rpScore.fluencyScore} label="Fluidité" color="var(--mm-primary)" />
                    <ScoreRing value={rpScore.grammarScore} label="Grammaire" color="#22C55E" />
                    <ScoreRing value={rpScore.vocabularyScore} label="Vocabulaire" color="#F59E0B" />
                  </div>

                  {/* Level badge + feedback */}
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
                    <div style={{
                      background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))",
                      color: "white", borderRadius: 12, padding: "6px 18px",
                      fontWeight: 900, fontSize: 14, boxShadow: "0 4px 14px rgba(52, 81, 209,0.4)"
                    }}>
                      📊 Niveau estimé : {rpScore.level || "?"}
                    </div>
                  </div>
                  <div style={{
                    background: isDarkMode ? "rgba(77, 107, 254,0.1)" : "rgba(77, 107, 254,0.06)",
                    borderRadius: 16, padding: "16px 20px",
                    border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.25)" : "rgba(77, 107, 254,0.15)"}`,
                    fontSize: 14, color: theme.text, lineHeight: 1.8, marginBottom: 20
                  }}>
                    {rpScore.overallFeedback || "Bonne session !"}
                  </div>

                  {/* Native words used */}
                  {Array.isArray(rpScore.nativeWordsUsed) && rpScore.nativeWordsUsed.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: theme.text, marginBottom: 10 }}>
                        ✨ Expressions natives utilisées naturellement
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {rpScore.nativeWordsUsed.map((w, i) => (
                          <span key={i} style={{
                            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
                            color: "#22C55E", borderRadius: 10, padding: "4px 12px",
                            fontSize: 13, fontWeight: 700
                          }}>{w}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Errors table */}
                  {Array.isArray(rpScore.errorsFound) && rpScore.errorsFound.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: theme.text, marginBottom: 10 }}>
                        ✏️ Corrections principales
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {rpScore.errorsFound.map((err, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 12,
                            background: isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(77,107,254,0.05)",
                            borderRadius: 12, padding: "10px 16px",
                            border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(77,107,254,0.05)"}`
                          }}>
                            <span style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", borderRadius: 8, padding: "3px 10px", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                              ❌ {err.said}
                            </span>
                            <span style={{ color: theme.textMuted, fontWeight: 700 }}>→</span>
                            <span style={{ background: "rgba(34,197,94,0.12)", color: "#22C55E", borderRadius: 8, padding: "3px 10px", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                              ✅ {err.correct}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Play again */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={() => { setRpState("picking"); setRpHistory([]); setRpScore(null); setRpError(""); }}
                      style={{
                        flex: 1, padding: "14px", borderRadius: 16,
                        background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))",
                        color: "white", border: "none", fontWeight: 900, fontSize: 14, cursor: "pointer",
                        boxShadow: "0 6px 20px rgba(77, 107, 254,0.35)"
                      }}
                    >🎭 Nouveau scénario</button>
                    {rpScenario && (
                      <button
                        onClick={() => startRoleplay(rpScenario)}
                        style={{
                          flex: 1, padding: "14px", borderRadius: 16,
                          background: "rgba(77, 107, 254,0.12)", border: "1.5px solid rgba(77, 107, 254,0.4)",
                          color: "#7B93FF", fontWeight: 800, fontSize: 14, cursor: "pointer"
                        }}
                      >🔁 Rejouer {rpScenario.title}</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      }

      {/* ── TAB : SRS Spaced Repetition Dashboard ─────────────────────────── */}
      {
        practiceSubView === "srs" && (() => {
          const stats = getSRSStats(expressions, srsData);
          const heatmap = getHeatmapData(srsData, 7);
          const totalReviewed = heatmap.reduce((s, d) => s + d.count, 0);

          // Queue to review based on filter
          const reviewQueue = srsFilter === "overdue"
            ? stats.overdueCards
            : srsFilter === "today"
              ? stats.dueTodayCards
              : stats.allSorted.filter(c => c.isOverdue || c.isDueToday);

          // Handle scoring a card
          const handleScore = async (expr, score) => {
            const { newData } = await recordReview(storage, expr.id, score, srsDataRef.current);
            setSrsData(newData);
            srsDataRef.current = newData;
            // Next card or close reviewer
            setSrsReviewing(null);
            setSrsShowBack(false);
            awardXP(8, 2, "Révision SRS");
          };

          // Generate Claude narrative
          const generateNarrative = async () => {
            setSrsNarrLoading(true);
            try {
              const weekStats = getWeeklyStatsForClaude(expressions, srsData);
              const raw = await callClaude(
                `Tu es un coach en apprentissage expert en mémorisation espacée. Analyse ces statistiques SRS d'un étudiant en anglais et génère un paragraphe motivant (5-7 phrases) avec des insights précis et des conseils personnalisés. Utilise des emojis judicieusement. Réponds en français.`,
                `Statistiques de la semaine :
- Révisions totales : ${weekStats.totalReviews}
- Jours actifs : ${weekStats.activeDays}/7
- Expressions en retard : ${weekStats.overdueCount}
- Dues aujourd'hui : ${weekStats.dueTodayCount}
- Facteur d'aisance moyen : ${weekStats.avgEF}
- Heatmap : ${weekStats.heatmap}
- Mots les plus difficiles : ${weekStats.struggling.join(", ")}

Génère une analyse narrative motivante et personnalisée.`
              );
              setSrsNarrative(raw.trim());
            } catch (e) {
              showToast("Erreur analyse IA", "error");
            }
            setSrsNarrLoading(false);
          };

          const heatEmoji = (count, avg) => {
            if (count === 0) return { ch: "⬜", color: isDarkMode ? "#374151" : "#E5E7EB" };
            if (avg >= 4) return { ch: "🟢", color: "#22C55E" };
            if (avg >= 2.5) return { ch: "🟡", color: "#F59E0B" };
            return { ch: "🔴", color: "#EF4444" };
          };

          const dayLabels = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];
          const today7 = heatmap.map(h => {
            const d = new Date(h.date + "T12:00:00");
            return { ...h, dayLabel: dayLabels[d.getDay()] };
          });

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <style>{`
              @keyframes srsFlip { from{transform:rotateY(90deg);opacity:0} to{transform:rotateY(0);opacity:1} }
              @keyframes srsPulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)} 70%{box-shadow:0 0 0 12px rgba(239,68,68,0)} }
              .srs-score-btn:hover { transform:scale(1.06) !important; }
              .srs-queue-item:hover { background:${isDarkMode ? "rgba(77, 107, 254,0.15)" : "rgba(77, 107, 254,0.07)"} !important; cursor:pointer; }
            `}</style>

              {/* ─── Stats Banner ─── */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14
              }}>
                {[
                  {
                    icon: "🔴", label: "En retard", value: stats.overdueCount,
                    sub: "expressions", color: "#EF4444",
                    bg: isDarkMode ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.07)",
                    border: "rgba(239,68,68,0.3)", urgent: stats.overdueCount > 0,
                  },
                  {
                    icon: "🟡", label: "Dues aujourd'hui", value: stats.dueTodayCount,
                    sub: "expressions", color: "#F59E0B",
                    bg: isDarkMode ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.07)",
                    border: "rgba(245,158,11,0.3)", urgent: false,
                  },
                  {
                    icon: "🟢", label: "Prochaine révision",
                    value: formatTimeUntil(stats.nextReviewMs) || "–",
                    sub: stats.nextReviewMs ? "" : "Toutes à jour !",
                    color: "#22C55E",
                    bg: isDarkMode ? "rgba(34,197,94,0.12)" : "rgba(34,197,94,0.07)",
                    border: "rgba(34,197,94,0.3)", urgent: false,
                  },
                  {
                    icon: "📚", label: "Révisées ce sem.", value: totalReviewed,
                    sub: "révisions", color: "var(--mm-primary)",
                    bg: isDarkMode ? "rgba(77, 107, 254,0.12)" : "rgba(77, 107, 254,0.07)",
                    border: "rgba(77, 107, 254,0.3)", urgent: false,
                  },
                ].map(s => (
                  <div key={s.label} style={{
                    borderRadius: 20, padding: "18px 22px",
                    background: s.bg, border: `1.5px solid ${s.border}`,
                    animation: s.urgent ? "srsPulse 2s infinite" : "none",
                    position: "relative", overflow: "hidden"
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, marginTop: 4 }}>{s.label}</div>
                    {s.sub && <div style={{ fontSize: 11, color: theme.textMuted }}>{s.sub}</div>}
                  </div>
                ))}
              </div>

              {/* ─── Card Reviewer ─── */}
              {srsReviewing ? (
                <div style={{
                  background: isDarkMode ? "var(--mm-bg-elev)" : "white",
                  borderRadius: 24, padding: 32,
                  border: `2px solid ${isDarkMode ? "rgba(77, 107, 254,0.4)" : "rgba(77, 107, 254,0.2)"}`,
                  boxShadow: "0 20px 60px rgba(77, 107, 254,0.15)"
                }}>
                  {/* Progress indicator */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, marginBottom: 20, textTransform: "uppercase", letterSpacing: 1 }}>
                    📖 Révision · {srsReviewing.category || "Anglais"}
                  </div>

                  {/* Flip card */}
                  <div style={{
                    background: isDarkMode ? "rgba(77, 107, 254,0.08)" : "var(--mm-bg-elev)",
                    borderRadius: 20, padding: "28px 32px",
                    border: `2px solid ${isDarkMode ? "rgba(77, 107, 254,0.25)" : "rgba(77, 107, 254,0.2)"}`,
                    marginBottom: 20, minHeight: 120,
                    animation: "srsFlip 0.3s ease"
                  }}>
                    {/* Front always visible */}
                    <div style={{ fontSize: 20, fontWeight: 800, color: theme.text, lineHeight: 1.5, marginBottom: srsShowBack ? 16 : 0 }}>
                      {srsReviewing.front}
                    </div>
                    {/* Back revealed on click */}
                    {srsShowBack && (
                      <div style={{ borderTop: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.05)"}`, paddingTop: 16, animation: "srsFlip 0.25s ease" }}>
                        <div style={{ fontSize: 16, color: isDarkMode ? "#A5B4FC" : "#4338CA", fontWeight: 700, marginBottom: 8 }}>
                          {srsReviewing.back}
                        </div>
                        {srsReviewing.example && (
                          <div style={{ fontSize: 13, color: theme.textMuted, fontStyle: "italic" }}>
                            💡 {srsReviewing.example}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {!srsShowBack ? (
                    <button onClick={() => setSrsShowBack(true)} style={{
                      width: "100%", padding: "16px",
                      background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))",
                      color: "white", border: "none", borderRadius: 16,
                      fontWeight: 900, fontSize: 16, cursor: "pointer",
                      boxShadow: "0 8px 24px rgba(52, 81, 209,0.4)"
                    }}>👁️ Révéler la réponse</button>
                  ) : (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, textAlign: "center", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                        Comment tu t'en es sorti ?
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {SCORE_BUTTONS.map(btn => (
                          <button
                            key={btn.score}
                            className="srs-score-btn"
                            onClick={() => handleScore(srsReviewing, btn.score)}
                            style={{
                              flex: 1, minWidth: 80, padding: "14px 8px",
                              background: btn.bg, border: `2px solid ${btn.color}30`,
                              borderRadius: 16, cursor: "pointer",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                              transition: "transform 0.15s, box-shadow 0.15s"
                            }}
                          >
                            <span style={{ fontSize: 24 }}>{btn.emoji}</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: btn.color }}>{btn.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => { setSrsReviewing(null); setSrsShowBack(false); }}
                    style={{
                      marginTop: 16, width: "100%", padding: "10px", background: "transparent",
                      border: `1px solid ${theme.border}`, borderRadius: 12,
                      color: theme.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer"
                    }}>
                    ← Retour au dashboard
                  </button>
                </div>
              ) : (
                <>
                  {/* ─── Review Queue ─── */}
                  <div style={{
                    background: isDarkMode ? "var(--mm-bg-elev)" : "white",
                    borderRadius: 24, padding: 24,
                    border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)"}`,
                    boxShadow: "0 8px 32px rgba(77,107,254,0.05)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
                      <div style={{ fontWeight: 900, fontSize: 17, color: theme.text }}>📋 File de révision</div>
                      {/* Filter buttons */}
                      <div style={{ display: "flex", gap: 6 }}>
                        {[{ k: "overdue", l: "En retard", c: "#EF4444" }, { k: "today", l: "Aujourd'hui", c: "#F59E0B" }, { k: "all", l: "Tout", c: "var(--mm-primary)" }].map(f => (
                          <button key={f.k} onClick={() => setSrsFilter(f.k)} style={{
                            padding: "6px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700,
                            background: srsFilter === f.k ? f.c : "transparent",
                            color: srsFilter === f.k ? "white" : theme.textMuted,
                            border: `1.5px solid ${srsFilter === f.k ? f.c : theme.border}`,
                            transition: "all 0.2s"
                          }}>{f.l}</button>
                        ))}
                      </div>
                    </div>

                    {reviewQueue.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "32px 0" }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: "#22C55E", marginBottom: 6 }}>Tout est à jour !</div>
                        <div style={{ fontSize: 14, color: theme.textMuted }}>
                          Prochaine révision {formatTimeUntil(stats.nextReviewMs) ? `dans ${formatTimeUntil(stats.nextReviewMs)}` : "bientôt"}.
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Quick Start button */}
                        <button
                          onClick={() => { setSrsReviewing(expressions.find(e => e.id === reviewQueue[0].id) || null); setSrsShowBack(false); }}
                          style={{
                            width: "100%", marginBottom: 16, padding: "14px",
                            background: "linear-gradient(135deg,#EF4444,#DC2626)",
                            color: "white", border: "none", borderRadius: 16,
                            fontWeight: 900, fontSize: 15, cursor: "pointer",
                            boxShadow: "0 6px 20px rgba(239,68,68,0.35)"
                          }}
                        >
                          🚀 Commencer les révisions ({reviewQueue.length} cartes)
                        </button>

                        {/* Queue list */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
                          {reviewQueue.slice(0, 20).map((item, i) => {
                            const delay = item.nextReview < Date.now() ? formatTimeUntil(item.nextReview) : null;
                            const cardSRS = srsData[item.id] || defaultCardState();
                            const ef = (cardSRS.easeFactor || 2.5).toFixed(1);
                            const efColor = cardSRS.easeFactor >= 2.5 ? "#22C55E" : cardSRS.easeFactor >= 1.8 ? "#F59E0B" : "#EF4444";
                            return (
                              <div
                                key={item.id}
                                className="srs-queue-item"
                                onClick={() => { setSrsReviewing(expressions.find(e => e.id === item.id)); setSrsShowBack(false); }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                                  background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(77,107,254,0.05)",
                                  borderRadius: 14, border: `1px solid ${theme.border}`, transition: "background 0.2s"
                                }}
                              >
                                <div style={{
                                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                                  background: item.isOverdue ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 16
                                }}>{item.isOverdue ? "🔴" : "🟡"}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {item.front}
                                  </div>
                                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{item.category}</div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: item.isOverdue ? "#EF4444" : "#F59E0B" }}>
                                    {item.isOverdue ? "EN RETARD" : "AUJOURD'HUI"}
                                  </span>
                                  <span style={{ fontSize: 10, color: efColor, fontWeight: 700 }}>EF {ef}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* ─── 7-day Heatmap ─── */}
                  <div style={{
                    background: isDarkMode ? "var(--mm-bg-elev)" : "white",
                    borderRadius: 24, padding: 24,
                    border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.05)"}`
                  }}>
                    <div style={{ fontWeight: 900, fontSize: 16, color: theme.text, marginBottom: 4 }}>📅 Activité des 7 derniers jours</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 18 }}>🟢 Bon (moy≥4) · 🟡 Correct (moy≥2.5) · 🔴 Difficile · ⬜ Inactif</div>

                    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                      {today7.map((d, i) => {
                        const { ch, color } = heatEmoji(d.count, d.avgScore);
                        const maxCount = Math.max(...today7.map(x => x.count), 1);
                        const barH = d.count === 0 ? 4 : Math.max(8, (d.count / maxCount) * 72);
                        return (
                          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1, minWidth: 36 }}>
                            {/* Bar */}
                            <div style={{
                              width: "100%", borderRadius: 6, overflow: "hidden",
                              background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)",
                              height: 72, display: "flex", alignItems: "flex-end"
                            }}>
                              <div style={{
                                width: "100%", borderRadius: 6,
                                background: d.count === 0 ? "transparent" : color,
                                height: barH, transition: "height 0.6s ease",
                                opacity: 0.85
                              }} />
                            </div>
                            {/* Emoji */}
                            <span style={{ fontSize: 16 }}>{ch}</span>
                            {/* Count */}
                            <span style={{ fontSize: 11, fontWeight: 800, color: d.count > 0 ? color : theme.textMuted }}>{d.count}</span>
                            {/* Day label */}
                            <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 600 }}>{d.dayLabel}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary row */}
                    <div style={{ display: "flex", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: theme.textMuted }}>
                        📊 <strong style={{ color: theme.text }}>{totalReviewed}</strong> révisions cette semaine
                      </span>
                      <span style={{ fontSize: 13, color: theme.textMuted }}>
                        📆 <strong style={{ color: theme.text }}>{heatmap.filter(d => d.count > 0).length}</strong>/7 jours actifs
                      </span>
                      <span style={{ fontSize: 13, color: theme.textMuted }}>
                        🎯 <strong style={{ color: theme.text }}>{heatmap.length > 0 ? ((heatmap.reduce((s, d) => s + d.avgScore, 0) / heatmap.filter(d => d.count > 0).length) || 0).toFixed(1) : "0"}</strong>/5 score moy.
                      </span>
                    </div>
                  </div>

                  {/* ─── Claude Narrative ─── */}
                  <div style={{
                    background: isDarkMode ? "linear-gradient(135deg,var(--mm-bg-elev),var(--mm-bg-elev))" : "linear-gradient(135deg,var(--mm-bg-elev),#fff)",
                    borderRadius: 24, padding: 24,
                    border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.3)" : "rgba(77, 107, 254,0.2)"}`
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 16, color: theme.text }}>🤖 Analyse IA de la semaine</div>
                        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>Claude analyse tes stats et génère des conseils personnalisés</div>
                      </div>
                      <button
                        onClick={generateNarrative}
                        disabled={srsNarrLoading}
                        style={{
                          padding: "10px 20px", borderRadius: 14, cursor: srsNarrLoading ? "not-allowed" : "pointer",
                          background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", color: "white",
                          border: "none", fontWeight: 800, fontSize: 13,
                          boxShadow: "0 4px 16px rgba(52, 81, 209,0.3)", opacity: srsNarrLoading ? 0.7 : 1
                        }}
                      >{srsNarrLoading ? "⏳ Analyse…" : "✨ Générer l'analyse"}</button>
                    </div>

                    {srsNarrative ? (
                      <div style={{
                        background: isDarkMode ? "rgba(77, 107, 254,0.1)" : "rgba(77, 107, 254,0.06)",
                        borderRadius: 16, padding: "18px 22px",
                        border: `1px solid ${isDarkMode ? "rgba(77, 107, 254,0.25)" : "rgba(77, 107, 254,0.15)"}`,
                        fontSize: 14, color: theme.text, lineHeight: 1.8
                      }}>
                        {srsNarrative}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "20px 0", color: theme.textMuted, fontSize: 14 }}>
                        Clique sur "Générer l'analyse" pour recevoir un rapport personnalisé de Claude.
                      </div>
                    )}
                  </div>
                </>
              )}
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
                        ? "linear-gradient(135deg, var(--mm-primary), #6366f1)"
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
                            ? "rgba(77,107,254,0.15)"
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
                    padding: "14px 28px", background: "linear-gradient(135deg, var(--mm-primary), #6366f1)",
                    color: "white", border: "none", borderRadius: 14,
                    fontWeight: 800, fontSize: 15, cursor: "pointer",
                    opacity: practiceExamAnswers.filter(Boolean).length < practiceExamQuestions.length ? 0.5 : 1,
                    boxShadow: "0 8px 20px rgba(77,107,254,0.3)", transition: "all 0.2s",
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
                    padding: "12px 24px", background: "linear-gradient(135deg, var(--mm-primary), #6366f1)",
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

      {/* ── TAB : English in the Wild (Vidéos YouTube) ────────────────────── */}
      {
        practiceSubView === "wild" && (
          <EnglishInTheWild
            callClaude={callClaude}
            storage={storage}
            expressions={expressions}
            setExpressions={setExpressions}
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

      {/* ── TAB : CEFR Tracker ────────────────────────────────────────────── */}
      {
        practiceSubView === "cefr" && (
          <CEFRTracker
            cefrState={cefrState}
            isAnalyzing={isAnalyzing}
            triggerAnalysis={triggerAnalysis}
            callClaude={callClaude}
            theme={theme}
            isDarkMode={isDarkMode}
          />
        )
      }
      {/* ── Fiches détectées par l'agent ElevenLabs ─────────────────────── */}
      

      {/* ── MODAL : Historique des Brouillons ─────────────────────────────────── */}
      {showDraftsModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: 20
        }} onClick={() => setShowDraftsModal(false)}>
          <div style={{
            background: "var(--mm-bg-card)", borderRadius: 24, padding: 24,
            width: "100%", maxWidth: 600, maxHeight: "80vh", overflowY: "auto",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", border: `1px solid ${theme.border}`
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 22, color: theme.text }}>📜 Historique des brouillons</h3>
              <button onClick={() => setShowDraftsModal(false)} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: theme.textMuted }}>×</button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {practiceWritingDrafts.map(d => (
                <div 
                  key={d.id} 
                  onClick={() => {
                    loadDraft(d.id);
                    setShowDraftsModal(false);
                  }}
                  style={{
                    padding: 16, borderRadius: 16, background: "var(--mm-bg-elev)",
                    border: practiceWritingActiveId === d.id ? `2px solid var(--mm-primary)` : `1px solid ${theme.border}`,
                    cursor: "pointer", transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.02)"}
                  onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: "bold", color: "var(--mm-primary)" }}>{new Date(d.date).toLocaleString()}</span>
                    {d.feedback && <span style={{ fontSize: 12, background: d.feedback.score >= 7 ? "#10B981" : d.feedback.score >= 5.5 ? "#F59E0B" : "#EF4444", color: "white", padding: "2px 8px", borderRadius: 12, fontWeight: "bold" }}>Score: {d.feedback.score}</span>}
                  </div>
                  <div style={{ fontSize: 15, color: theme.text, fontWeight: "bold", marginBottom: 4 }}>{d.prompt || "Sujet libre"}</div>
                  <div style={{ fontSize: 13, color: theme.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.text || "Aucun texte..."}
                  </div>
                </div>
              ))}
              {practiceWritingDrafts.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: theme.textMuted }}>Aucun brouillon sauvegardé.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LIVEKIT VOICE ASSISTANT (GLOBAL OVERLAY) */}
      {customAgent.isConnected && (
        <LiveKitVoiceAssistant 
          onClose={() => agent.stop()} 
          isDarkMode={isDarkMode}
          onTranscriptionsUpdate={setLiveKitTranscriptions}
          onStateChange={setLiveKitState}
          systemPrompt={buildLiveKitSystemPrompt()}
          studentName={studentName}
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
    <ConversationProvider>
      <EnglishPracticeInner {...props} />
    </ConversationProvider>
  );
}

