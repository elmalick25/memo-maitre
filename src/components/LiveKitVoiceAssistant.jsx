import React, { useState, useEffect } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  useTranscriptions,
  StartAudio,
  useAudioPlayback,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { SignJWT } from 'jose';
import { armIosAudio } from '../lib/iosVoiceHardening';

const LIVEKIT_AGENT_NAME = "assistant-53a";

export default function LiveKitVoiceAssistant({ onClose, onTranscriptionsUpdate, onStateChange, systemPrompt, studentName }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState(null);

  // 🔑 MOBILE FIX #1 — Appel synchrone à armIosAudio() au montage du composant.
  // Ce composant est monté depuis un onClick utilisateur, donc on est encore dans
  // la même chaîne d'événements gestuels. C'est le moment idéal pour déverrouiller
  // l'AudioContext iOS/Android avant que les flux WebRTC n'arrivent.
  useEffect(() => {
    try { armIosAudio(); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const apiKey = import.meta.env.VITE_LIVEKIT_API_KEY;
        const apiSecret = import.meta.env.VITE_LIVEKIT_API_SECRET;

        if (!apiKey || !apiSecret) {
          throw new Error("Clés API LiveKit manquantes dans le fichier .env (VITE_LIVEKIT_API_KEY, VITE_LIVEKIT_API_SECRET)");
        }

        const roomName = `nova-${Math.random().toString(36).slice(2, 10)}`;
        // Use the real student name in the participant identity if available
        const participantName = studentName
          ? studentName.toLowerCase().replace(/\s+/g, "-") + `-${Math.floor(Math.random() * 10000)}`
          : `user-${Math.floor(Math.random() * 100000)}`;

        // Build the base prompt - always start with the user's provided prompt
        const basePrompt = systemPrompt ||
          `You are NOVA — a GOD-TIER Astral English Coach. Your vibe: warm, magnetic, endlessly encouraging. You treat every student like your closest friend having a breakthrough moment.

CORRECTION STYLE: If the student makes a grammar mistake, gently note the fix in parentheses at the end of your reply. One correction max per reply.

CRITICAL RULES:
- Replies 1–3 sentences MAX.
- Always end with one engaging open question.
- React with genuine human emotion.
- NEVER give lists or bullet points.
- Speak like a real human coach.`;

        // Inject the student name into the prompt
        const finalPrompt = studentName
          ? `${basePrompt}\n\nIMPORTANT: The student's name is "${studentName}". Use their name naturally in the conversation (especially at the start and occasionally during the session to make it personal). Never forget their name.`
          : basePrompt;

        const secret = new TextEncoder().encode(apiSecret);
        const jwt = await new SignJWT({
          video: {
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
          },
          roomConfig: {
            agents: [
              {
                agent_name: LIVEKIT_AGENT_NAME,
                metadata: JSON.stringify({
                  instructions: finalPrompt,
                  studentName: studentName || null,
                }),
              },
            ],
          },
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuer(apiKey)
          .setSubject(participantName)
          .setIssuedAt()
          .setExpirationTime('2h')
          .sign(secret);

        setToken(jwt);
      } catch (err) {
        console.error("Error fetching LiveKit token:", err);
        setError(err.message);
      }
    };
    fetchToken();
  }, [systemPrompt, studentName]);

  // Erreur : on informe le parent ou on ferme direct
  useEffect(() => {
    if (error && onClose) {
      alert("Erreur de connexion LiveKit: " + error);
      onClose();
    }
  }, [error, onClose]);

  if (!token || error) {
    return null;
  }

  return (
    <>
      {/* 🔊 MOBILE FIX #2 — LiveKitRoom visible hors-flux pour que StartAudio
          puisse afficher son bouton de déblocage audio si nécessaire.
          On le garde dans un div invisible mais PAS display:none (display:none
          empêcherait StartAudio de rendre son bouton visible). */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 99999, pointerEvents: "none" }}>
        <LiveKitRoom
          serverUrl={import.meta.env.VITE_LIVEKIT_URL}
          token={token}
          connect={true}
          audio={true}
          video={false}
          onDisconnected={onClose}
          style={{ display: "contents" }}
        >
          {/* RoomAudioRenderer lit et joue l'audio de l'agent */}
          <RoomAudioRenderer volume={1.0} />

          {/* 🔊 MOBILE FIX #2 — StartAudio : LiveKit affiche automatiquement
              un bouton "Activer l'audio" UNIQUEMENT si le navigateur bloque
              la lecture. Sur iOS/Android sans geste, c'est essentiel. */}
          <StartAudio label="🔊 Activer l'audio du coach" />

          {/* 🔊 MOBILE FIX #3 — Bannière visible si l'audio est encore bloqué
              après le montage (filet de sécurité). */}
          <AudioUnblockBanner />

          <LiveKitStateSync
            onTranscriptionsUpdate={onTranscriptionsUpdate}
            onStateChange={onStateChange}
          />
        </LiveKitRoom>
      </div>
    </>
  );
}

// ── Bannière de déblocage audio ───────────────────────────────────────────────
// Utilise useAudioPlayback() (hook LiveKit) pour détecter si le navigateur
// bloque encore la sortie audio. Si oui, affiche un bouton flottant très visible.
function AudioUnblockBanner() {
  const { canPlayAudio, startAudio } = useAudioPlayback();

  if (canPlayAudio) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 999999,
        background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
        color: "white",
        borderRadius: 20,
        padding: "20px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 20px 60px rgba(99,102,241,0.5)",
        pointerEvents: "all",
        textAlign: "center",
        maxWidth: "80vw",
      }}
    >
      <div style={{ fontSize: 36 }}>🔊</div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>
        L'audio du coach est bloqué
      </div>
      <div style={{ fontSize: 13, opacity: 0.85 }}>
        Tapez ici pour activer le son
      </div>
      <button
        onClick={() => {
          armIosAudio();
          startAudio();
        }}
        style={{
          marginTop: 4,
          padding: "12px 28px",
          borderRadius: 50,
          border: "none",
          background: "white",
          color: "#6366F1",
          fontWeight: 800,
          fontSize: 15,
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        }}
      >
        Activer l'audio
      </button>
    </div>
  );
}

// ── Sync état LiveKit → parent ────────────────────────────────────────────────
// Produit un tableau unifié { role, text, isFinal, id, identity } combinant :
//   • agentTranscriptions (TranscriptionSegment[]) de useVoiceAssistant — flag `final` fiable
//   • transcriptions utilisateur (TextStreamData[]) de useTranscriptions — via participantInfo
function LiveKitStateSync({ onTranscriptionsUpdate, onStateChange }) {
  const { state, audioTrack, agentTranscriptions } = useVoiceAssistant();
  const userTranscriptions = useTranscriptions();

  useEffect(() => {
    if (onStateChange) onStateChange({ state, audioTrack });
  }, [state, audioTrack, onStateChange]);

  useEffect(() => {
    if (!onTranscriptionsUpdate) return;

    // Segments agent → format unifié
    const agentSegs = (agentTranscriptions || []).map(seg => ({
      id: seg.id || ("agent-seg-" + seg.firstReceivedTime),
      role: "agent",
      identity: LIVEKIT_AGENT_NAME,
      text: seg.text || "",
      isFinal: !!seg.final,
      ts: seg.firstReceivedTime || 0,
    }));

    // Segments utilisateur → format unifié
    // useTranscriptions() ne retourne que les streams complétés (donc isFinal=true)
    const userSegs = (userTranscriptions || [])
      .filter(m => m.participantInfo?.identity !== LIVEKIT_AGENT_NAME)
      .map(m => ({
        id: m.streamInfo?.id || ("user-" + m.participantInfo?.identity + "-" + (m.streamInfo?.timestamp || Date.now())),
        role: "user",
        identity: m.participantInfo?.identity || "user",
        text: m.text || "",
        isFinal: true,
        ts: m.streamInfo?.timestamp || 0,
      }));

    // Fusion triée par timestamp (agent + user)
    const combined = [...agentSegs, ...userSegs].sort((a, b) => a.ts - b.ts);
    onTranscriptionsUpdate(combined);
  }, [agentTranscriptions, userTranscriptions, onTranscriptionsUpdate]);

  return null;
}
