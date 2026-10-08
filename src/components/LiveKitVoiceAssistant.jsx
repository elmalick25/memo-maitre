import { resolveKey } from "../lib/security/apiKeys.js";
import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useVoiceAssistant,
  useTranscriptions,
  useRoomContext,
  useLocalParticipant,
} from '@livekit/components-react';
import { RoomEvent, MediaDeviceFailure, Track, LocalAudioTrack } from 'livekit-client';
import '@livekit/components-styles';
import { SignJWT } from 'jose';
import { armIosAudio, whenMicPermissionReady, forcePlayAndRecordSession, consumePrewarmedMicStream } from '../lib/iosVoiceHardening';
import {
  LIVEKIT_TOKEN_TTL_SECONDS,
  getTokenEndpoint,
  isClientSigningAllowed,
  buildRoomName,
  buildParticipantIdentity,
  sanitizeStudentName,
  sanitizeInstructions,
  buildVideoGrant,
  scrubError,
} from '../lib/security/livekitTokenGuard';
import { aggregateTurns, conversationStats, buildTranscriptText } from '../lib/livekitConversation';
import { buildNovaVoicePrompt } from '../lib/english/novaVoicePrompt';
import { appendSession } from '../lib/agentSessionMemory';

const LIVEKIT_AGENT_NAME = import.meta.env.VITE_LIVEKIT_AGENT_NAME || "assistant-53a";
const EMPTY_TARGET_EXPRESSIONS = Object.freeze([]);

// ── Bus global pour commander l'agent LiveKit depuis n'importe quelle vue ────
class LiveKitVoiceController {
  constructor() {
    this.listeners = new Set();
    this.state = {
      isConnected: false,
      isSpeaking: false,
      isListening: false,
      agentState: "idle",
      lastTranscription: "",
      transcriptions: [],
    };
    this._room = null;
    this._localParticipant = null;
    this._sayHandler = null;
    this._interruptHandler = null;
  }

  setBridge({ room, localParticipant, sayHandler, interruptHandler }) {
    this._room = room;
    this._localParticipant = localParticipant;
    this._sayHandler = sayHandler;
    this._interruptHandler = interruptHandler;
  }

  clearBridge() {
    this._room = null;
    this._localParticipant = null;
    this._sayHandler = null;
    this._interruptHandler = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(fn => {
      try { fn(this.state); } catch (e) { console.error("[LiveKitVoiceController] listener error:", e); }
    });
  }

  async say(text) {
    if (!text?.trim()) return;
    if (this._sayHandler) {
      return await this._sayHandler(text);
    }
    if (this._room && this._room.state === "connected") {
      try {
        const payload = new TextEncoder().encode(JSON.stringify({ type: "say", text }));
        await this._room.localParticipant.publishData(payload, { reliable: true });
      } catch (err) {
        console.warn("[LiveKitVoiceController] Echec say via room:", err);
      }
    }
  }

  interrupt() {
    if (this._interruptHandler) {
      this._interruptHandler();
    }
    if (this._room && this._room.state === "connected") {
      try {
        const payload = new TextEncoder().encode(JSON.stringify({ type: "interrupt" }));
        this._room.localParticipant.publishData(payload, { reliable: true });
      } catch (err) {
        console.warn("[LiveKitVoiceController] Echec interrupt:", err);
      }
    }
    this.notify({ isSpeaking: false });
  }
}

export const liveKitVoiceBus = new LiveKitVoiceController();
export const LiveKitVoiceContext = createContext(liveKitVoiceBus);

export function useLiveKitVoice() {
  const [voiceState, setVoiceState] = useState(liveKitVoiceBus.state);
  useEffect(() => {
    return liveKitVoiceBus.subscribe(setVoiceState);
  }, []);

  return {
    ...voiceState,
    say: useCallback((text) => liveKitVoiceBus.say(text), []),
    interrupt: useCallback(() => liveKitVoiceBus.interrupt(), []),
    controller: liveKitVoiceBus,
  };
}

// Cache de token pré-calculé pour éliminer les 400ms au clic
let _prewarmedTokenCache = {
  jwt: "",
  key: "",
  timestamp: 0,
};

async function generateTokenInternal({
  systemPrompt,
  studentName,
  level = "",
  sessionGoal = "",
  targetExpressions = EMPTY_TARGET_EXPRESSIONS,
  continuityMemory = "",
}) {
  const safeName = sanitizeStudentName(studentName);
  const basePrompt = systemPrompt ||
    `You are NOVA — a warm, precise, human English coach for an ambitious adult learner. You sound like a top-tier private tutor: composed, encouraging, high signal, never robotic.`;

  const instructions = sanitizeInstructions(
    buildNovaVoicePrompt({
      basePrompt,
      studentName: safeName,
      level,
      goal: sessionGoal,
      targets: targetExpressions,
      continuity: continuityMemory,
      openingHookMode: (sessionGoal && sessionGoal.toLowerCase().includes("free conversation")) ? "free" : "daily_targets",
    })
  );

  const roomName = buildRoomName("nova");
  const identity = buildParticipantIdentity(studentName);
  const metadataString = JSON.stringify({
    instructions,
    studentName: safeName || null,
    level: level || null,
  });

  // 1) Chemin sécurisé : le serveur signe et décide des droits.
  const endpoint = getTokenEndpoint();
  if (endpoint) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roomName, identity, metadata: metadataString, agentName: LIVEKIT_AGENT_NAME }),
    });
    if (!res.ok) throw new Error(`Token endpoint HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (!data?.token) throw new Error("Réponse du serveur sans token LiveKit.");
    return data.token;
  }

  // 2) Mode dégradé, développement uniquement.
  if (!isClientSigningAllowed()) {
    throw new Error(
      "Aucun endpoint de token LiveKit configuré (VITE_LIVEKIT_TOKEN_ENDPOINT). " +
      "La signature du token dans le navigateur est désactivée : elle exposerait la clé secrète LiveKit."
    );
  }

  const apiKey = resolveKey("VITE_LIVEKIT_API_KEY");
  const apiSecret = resolveKey("VITE_LIVEKIT_API_SECRET");
  if (!apiKey || !apiSecret) {
    throw new Error("Clés LiveKit de développement manquantes (VITE_LIVEKIT_API_KEY / VITE_LIVEKIT_API_SECRET).");
  }

  const secret = new TextEncoder().encode(apiSecret);
  return await new SignJWT({
    video: buildVideoGrant(roomName),
    metadata: metadataString,
    roomConfig: {
      agents: [
        {
          ...(LIVEKIT_AGENT_NAME && LIVEKIT_AGENT_NAME !== "auto"
            ? { agentName: LIVEKIT_AGENT_NAME }
            : {}),
          metadata: metadataString,
        },
      ],
    },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(apiKey)
    .setSubject(identity)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + LIVEKIT_TOKEN_TTL_SECONDS)
    .sign(secret);
}

export async function prewarmNovaToken({
  systemPrompt = "",
  studentName = "",
  level = "",
  sessionGoal = "",
  targetExpressions = EMPTY_TARGET_EXPRESSIONS,
  continuityMemory = "",
} = {}) {
  try {
    const safeTargetsKey = Array.isArray(targetExpressions)
      ? targetExpressions.map(t => (typeof t === "string" ? t : t?.expression || t?.front || t?.id || "")).join("|")
      : "";
    const key = JSON.stringify({
      systemPrompt,
      studentName: sanitizeStudentName(studentName),
      level,
      sessionGoal,
      targetsKey: safeTargetsKey,
      continuity: continuityMemory,
    });

    if (_prewarmedTokenCache.jwt && _prewarmedTokenCache.key === key && (Date.now() - _prewarmedTokenCache.timestamp < 300000)) {
      return _prewarmedTokenCache.jwt;
    }

    const jwt = await generateTokenInternal({
      systemPrompt,
      studentName,
      level,
      sessionGoal,
      targetExpressions,
      continuityMemory,
    });
    if (jwt) {
      _prewarmedTokenCache = { jwt, key, timestamp: Date.now() };
    }
    return jwt;
  } catch (e) {
    console.warn("[LiveKit] Prewarm token anticipé ignoré :", e?.message);
    return null;
  }
}

export default function LiveKitVoiceAssistant({
  onClose,
  onTranscriptionsUpdate,
  onStateChange,
  onControllerReady,
  systemPrompt,
  studentName,
  isDarkMode,
  level = "",
  sessionGoal = "",
  targetExpressions = EMPTY_TARGET_EXPRESSIONS,
  continuityMemory = "",
  onSessionSummary,
}) {
  const targetExpressionsKey = useMemo(() => {
    if (!Array.isArray(targetExpressions) || !targetExpressions.length) return "";
    return targetExpressions
      .map(t => (typeof t === "string" ? t : t?.expression || t?.front || t?.id || ""))
      .join("|");
  }, [targetExpressions]);

  const currentParamsKey = useMemo(() => JSON.stringify({
    systemPrompt,
    studentName: sanitizeStudentName(studentName),
    level,
    sessionGoal,
    targetsKey: targetExpressionsKey,
    continuity: continuityMemory,
  }), [systemPrompt, studentName, level, sessionGoal, targetExpressionsKey, continuityMemory]);

  // Initialisation instantanée depuis le cache de prewarm si disponible
  const [token, setToken] = useState(() => {
    if (_prewarmedTokenCache.jwt && _prewarmedTokenCache.key === currentParamsKey && (Date.now() - _prewarmedTokenCache.timestamp < 300000)) {
      return _prewarmedTokenCache.jwt;
    }
    return "";
  });
  const [error, setError] = useState(null);
  const [micReady, setMicReady] = useState(true);
  const [micBlocked, setMicBlocked] = useState(false);
  const [micErrorReason, setMicErrorReason] = useState("");
  const [agentMissing, setAgentMissing] = useState(false);

  // 🔑 MOBILE FIX — armIosAudio() a normalement déjà été appelé DANS le
  // user-gesture qui monte ce composant (onStart / AgentVoiceBar).
  useEffect(() => {
    try { armIosAudio(); } catch (_e) { /* ignore */ }
    setMicReady(true);
    whenMicPermissionReady().catch(() => {});
  }, []);

  // ── Récupération / Synchronisation du token ────────────────────────────────
  const lastFetchParamsRef = useRef("");
  useEffect(() => {
    let active = true;

    // Guard anti-boucle : si le token est déjà prêt pour ces mêmes paramètres, on ne relance pas
    if (token && lastFetchParamsRef.current === currentParamsKey) {
      return;
    }

    // Si on a déjà un token chaud valide en cache pour cette clé, l'adopter immédiatement
    if (_prewarmedTokenCache.jwt && _prewarmedTokenCache.key === currentParamsKey && (Date.now() - _prewarmedTokenCache.timestamp < 300000)) {
      setToken(_prewarmedTokenCache.jwt);
      lastFetchParamsRef.current = currentParamsKey;
      return;
    }

    const fetchToken = async () => {
      const jwt = await generateTokenInternal({
        systemPrompt,
        studentName,
        level,
        sessionGoal,
        targetExpressions,
        continuityMemory,
      });
      _prewarmedTokenCache = { jwt, key: currentParamsKey, timestamp: Date.now() };
      return jwt;
    };

    lastFetchParamsRef.current = currentParamsKey;
    fetchToken()
      .then((jwt) => {
        if (active) {
          setToken(jwt);
        }
      })
      .catch((err) => {
        if (!active) return;
        const safe = scrubError(err);
        console.error("[LiveKit] token indisponible :", safe);
        setError(safe);
      });

    return () => {
      active = false;
    };
  }, [systemPrompt, studentName, level, sessionGoal, targetExpressions, targetExpressionsKey, continuityMemory, token, currentParamsKey]);

  // ── Journal de session : tours agrégés + sauvegarde à la fermeture ───────
  const turnsRef = useRef([]);
  const handleTranscriptions = useCallback((segments) => {
    const turns = aggregateTurns(segments);
    turnsRef.current = turns;
    onTranscriptionsUpdate?.(segments, turns);
  }, [onTranscriptionsUpdate]);

  const handleDisconnected = useCallback(() => {
    try {
      liveKitVoiceBus.clearBridge();
      liveKitVoiceBus.notify({ isConnected: false, isSpeaking: false, isListening: false, agentState: "idle" });
    } catch {}
    const turns = turnsRef.current || [];
    if (turns.length) {
      const stats = conversationStats(turns);
      try {
        appendSession({
          transcript: turns.map((t) => ({ role: t.role, text: t.text })),
          agent: { name: LIVEKIT_AGENT_NAME },
          mode: "livekit-voice",
          meta: stats,
        });
      } catch (e) { console.warn("[LiveKit] journal de session non sauvegardé :", e?.message); }
      onSessionSummary?.({ turns, stats, transcriptText: buildTranscriptText(turns) });
    }
    onClose?.();
  }, [onClose, onSessionSummary]);

  // Nettoyage strict au démontage du composant
  useEffect(() => {
    return () => {
      try {
        liveKitVoiceBus.clearBridge();
        liveKitVoiceBus.notify({ isConnected: false, isSpeaking: false, isListening: false, agentState: "idle" });
      } catch {}
    };
  }, []);

  // Erreur : bannière explicite et non bloquante. Aucune boîte de dialogue
  // native : elle gèle l'UI mobile et peut exposer des détails techniques.
  if (error) {
    return (
      <div style={errorOverlayStyle} role="alert">
        <div style={{ ...errorCardStyle, background: isDarkMode ? "#1F2937" : "#111827" }}>
          <strong style={{ fontSize: 15 }}>La conversation vocale n'a pas pu démarrer</strong>
          <span style={{ fontSize: 13, opacity: 0.85 }}>{error}</span>
          <button type="button" onClick={() => onClose?.()} style={unlockButtonStyle}>Fermer</button>
        </div>
      </div>
    );
  }

  if (!token) {
    return null;
  }

  // ℹ️ SON : on utilise <StartAudio>, le composant OFFICIEL LiveKit — il ne
  // s'affiche QUE si le navigateur bloque la lecture, et se cache tout seul
  // dès que ça marche. C'est exactement leur solution pour ce problème,
  // testée sur tous les navigateurs (iOS Safari ET Chrome inclus) — plus
  // fiable que n'importe quel hack maison. On le sort du conteneur caché
  // (position:fixed + pointerEvents:"auto") pour qu'il soit réellement
  // tapable, sinon il resterait piégé derrière pointerEvents:"none".
  //
  // MICRO : on n'utilise PLUS le prop `audio={true}` de <LiveKitRoom>, qui
  // active le micro de façon implicite/asynchrone et peut échouer en silence
  // (course avec la connexion WebRTC, perte de l'activation utilisateur sur
  // Safari/Firefox après plusieurs sauts async). À la place, `audio={false}`
  // et LiveKitMicWatchdog appelle lui-même `setMicrophoneEnabled(true)` dès
  // la connexion, avec plusieurs tentatives automatiques (retries) avant de
  // proposer le bouton manuel — la permission a déjà été acquise dans le
  // geste initial (armIosAudio), donc ces tentatives n'ont pas besoin d'un
  // nouveau geste utilisateur pour réussir.
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 99999 }}>
      <LiveKitRoom
        serverUrl={import.meta.env.VITE_LIVEKIT_URL}
        token={token}
        connect={micReady}
        audio={false}
        video={false}
        options={{
          expWebAudioMix: false,
          adaptiveStream: false,
          dynacast: false,
        }}
        onDisconnected={handleDisconnected}
        style={{ display: "contents" }}
      >
        <RoomAudioRenderer volume={1.0} />
        <LiveKitStateSync
          onTranscriptionsUpdate={handleTranscriptions}
          onStateChange={onStateChange}
          onControllerReady={onControllerReady}
        />
        <LiveKitAgentWatchdog onMissing={setAgentMissing} />
        <LiveKitMicWatchdog
          onMicBlockedChange={setMicBlocked}
          onMicErrorReason={setMicErrorReason}
        />
        <StartAudio
          label="🔊 Appuie ici pour activer le son de NOVA"
          style={startAudioStyle}
        />
        {agentMissing && !micBlocked && (
          <div style={{ ...errorCardStyle, position: "fixed", left: "50%", bottom: "max(76px, calc(env(safe-area-inset-bottom) + 52px))", transform: "translateX(-50%)", zIndex: 9999, background: isDarkMode ? "#111827" : "#0f172a", border: "1.5px solid rgba(180, 85, 45, 0.35)", maxWidth: "min(420px, 92vw)" }} role="alert">
            <strong style={{ fontSize: 14, color: "#f87171" }}>⚠️ NOVA n'a pas rejoint la conversation</strong>
            <span style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.5, textAlign: "left" }}>
              Le worker de l'agent « {LIVEKIT_AGENT_NAME || "auto"} » ne répond pas.<br />
              • <strong>Console Cloud</strong> : vérifiez que l'agent est <em>Actif</em> (et non <em>En cours</em> ou <em>Dormir</em>).<br />
              • <strong>Nom Builder</strong> : vérifiez que le nom correspond exactement à <code>{LIVEKIT_AGENT_NAME}</code>.<br />
              • <strong>Worker Local</strong> : vous pouvez aussi lancer <code>python agent.py dev</code> dans un terminal.
            </span>
            <button
              type="button"
              onClick={() => setAgentMissing(false)}
              style={{ ...unlockButtonStyle, marginTop: 4, padding: "7px 14px", fontSize: 12 }}
            >
              Compris / Fermer
            </button>
          </div>
        )}
        {micBlocked && (
          <LiveKitMicBanner
            reason={micErrorReason}
            isDarkMode={isDarkMode}
            onRetry={() => {
              setMicBlocked(false);
            }}
          />
        )}
      </LiveKitRoom>
    </div>
  );
}

const errorOverlayStyle = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "0 16px max(24px, env(safe-area-inset-bottom))",
  pointerEvents: "none",
  zIndex: 99999,
};

const errorCardStyle = {
  pointerEvents: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  borderRadius: 16,
  maxWidth: "min(360px, 92vw)",
  color: "white",
  textAlign: "center",
  fontFamily: "system-ui, sans-serif",
  boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
};

const startAudioStyle = {
  position: "fixed",
  left: "50%",
  bottom: "max(24px, env(safe-area-inset-bottom))",
  transform: "translateX(-50%)",
  zIndex: 9999,
  pointerEvents: "auto",
  border: "none",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))",
  color: "white",
  fontFamily: "system-ui, sans-serif",
  boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
};

// ── LiveKitMicRefresh ────────────────────────────────────────────────────
// SUPPRIMÉ intentionnellement. L'ancien cycle off→on 600ms après connexion
// cassait l'abonnement du track côté agent (l'agent gardait le SID de
// l'ancien track unpublié → plus aucun audio ne lui parvenait) sur
// Chrome/Android/desktop, et créait aussi une course avec le prewarm iOS.
// La nouvelle stratégie : on publie DIRECTEMENT le MediaStreamTrack déjà
// obtenu dans le user-gesture (voir LiveKitMicWatchdog + consumePrewarmedMicStream)
// — plus besoin de re-cycler quoi que ce soit.



// ── LiveKitMicWatchdog ───────────────────────────────────────────────────
// 1) Surveille les erreurs OFFICIELLES LiveKit (RoomEvent.MediaDevicesError +
//    MediaDeviceFailure.getFailure()) : permission refusée, device absent,
//    device pris par une autre appli. Ces cas-là, on ne peut rien retenter
//    automatiquement — il faut l'utilisateur (bannière).
// 2) NOUVEAU — active le micro NOUS-MÊMES dès la connexion, avec plusieurs
//    tentatives automatiques (au lieu de compter sur le prop implicite
//    `audio={true}` de <LiveKitRoom>, source du bug "le micro ne s'est pas
//    activé automatiquement"). La permission ayant déjà été acquise dans le
//    geste utilisateur initial (armIosAudio → getUserMedia), ces tentatives
//    n'ont pas besoin d'un nouveau geste pour réussir : la plupart des échecs
//    silencieux se résolvent dès le 2e ou 3e essai, sans jamais déranger
//    l'utilisateur. La bannière manuelle ne s'affiche qu'en tout dernier
//    recours, si les 4 tentatives échouent.
function LiveKitMicWatchdog({ onMicBlockedChange, onMicErrorReason }) {
  const room = useRoomContext();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!room) return;
    const onMediaError = (error) => {
      const failure = MediaDeviceFailure.getFailure(error);
      const reason =
        failure === MediaDeviceFailure.PermissionDenied
          ? "Le micro a été refusé. Autorise-le dans les réglages de Chrome (ou du site) puis réessaie."
          : failure === MediaDeviceFailure.NotFound
            ? "Aucun micro détecté sur cet appareil."
            : failure === MediaDeviceFailure.DeviceInUse
              ? "Le micro est utilisé par une autre application."
              : "Le micro n'a pas pu démarrer.";
      onMicErrorReason(reason);
      onMicBlockedChange(true);
    };
    room.on(RoomEvent.MediaDevicesError, onMediaError);
    return () => room.off(RoomEvent.MediaDevicesError, onMediaError);
  }, [room, onMicBlockedChange, onMicErrorReason]);

  // Activation explicite + retries automatiques dès que la room est connectée.
  useEffect(() => {
    if (!room || !localParticipant) return;
    let cancelled = false;

    // Délais CUMULÉS entre tentatives (ms) — laisse le temps à WebRTC de
    // se stabiliser sans pour autant faire attendre l'utilisateur longtemps :
    // essai immédiat, puis +500ms, +1200ms, +2200ms (≈ 4 tentatives en 2.2s).
    const CUMULATIVE_DELAYS_MS = [0, 500, 1200, 2200];

    const ensureMicOn = async () => {
      // 🎤 CHEMIN PRINCIPAL — on publie DIRECTEMENT le MediaStreamTrack
      // pré-obtenu dans le user-gesture (armIosAudio). Zéro nouvelle
      // getUserMedia → zéro course, zéro track "vivant mais silencieux".
      // C'est le fix qui règle le cas "je parle mais ça passe pas".
      const prewarmed = consumePrewarmedMicStream();
      if (prewarmed) {
        try {
          const mst = prewarmed.getAudioTracks()[0];
          if (mst && mst.readyState === "live") {
            // ⚠️ userProvidedTrack: TRUE — crucial. Sinon LiveKit s'approprie
            // le MediaStreamTrack et peut le restart/re-getUserMedia en interne,
            // ce qui casse la piste sur iOS Chrome (raccourci) et perturbe la
            // négociation WebRTC → même l'audio ENTRANT de l'agent devient muet.
            const localTrack = new LocalAudioTrack(mst, undefined, true);
            await localParticipant.publishTrack(localTrack, {
              source: Track.Source.Microphone,
            });
            forcePlayAndRecordSession();
            onMicBlockedChange(false);
            return;
          }
        } catch (e) {
          console.warn("[LiveKitMicWatchdog] publishTrack (prewarm) échoué, fallback setMicrophoneEnabled :", e?.message);
          try { prewarmed.getTracks().forEach((t) => t.stop()); } catch (_e) { /* ignore */ }
        }
      }

      // FALLBACK — pas de stream pré-obtenu (desktop sans user-gesture qui
      // aurait pré-armé, ou prewarm refusé). On garde la stratégie de
      // retries via setMicrophoneEnabled, comme avant.
      for (let i = 0; i < CUMULATIVE_DELAYS_MS.length; i++) {
        if (cancelled) return;
        if (i > 0) {
          await new Promise((r) => setTimeout(r, CUMULATIVE_DELAYS_MS[i] - CUMULATIVE_DELAYS_MS[i - 1]));
        }
        if (cancelled) return;
        if (localParticipant.isMicrophoneEnabled) {
          forcePlayAndRecordSession();
          onMicBlockedChange(false);
          return;
        }
        try {
          await localParticipant.setMicrophoneEnabled(true);
        } catch (e) {
          console.warn(`[LiveKitMicWatchdog] setMicrophoneEnabled tentative ${i + 1} échouée :`, e?.message);
        }
        if (!cancelled && localParticipant.isMicrophoneEnabled) {
          // 🔊 Re-forcer la catégorie "play-and-record" PILE au moment où le
          // micro devient réellement actif : c'est ce moment précis (pas le
          // clic initial) qui a le plus de chances de faire "tenir" la bonne
          // catégorie de session audio côté OS sur iOS.
          forcePlayAndRecordSession();
          onMicBlockedChange(false);
          return;
        }
      }
      // 4 tentatives automatiques épuisées : seulement là, on sollicite l'utilisateur.
      if (!cancelled && !localParticipant.isMicrophoneEnabled) {
        onMicErrorReason("Le micro n'a pas pu s'activer automatiquement (plusieurs tentatives ont échoué).");
        onMicBlockedChange(true);
      }
    };

    const onConnected = () => { ensureMicOn(); };
    const onStateChanged = (state) => {
      if (state === "connected" || room.state === "connected") {
        ensureMicOn();
      }
    };
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.StateChanged, onStateChanged);
    if (room.state === "connected") onConnected();

    return () => {
      cancelled = true;
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.StateChanged, onStateChanged);
    };
  }, [room, localParticipant, onMicBlockedChange, onMicErrorReason]);

  // Dès que le micro redevient actif, on efface l'alerte.
  useEffect(() => {
    if (isMicrophoneEnabled) onMicBlockedChange(false);
  }, [isMicrophoneEnabled, onMicBlockedChange]);

  return null;
}

// ── republishMicWithFreshStream ─────────────────────────────────────────
// Stratégie robuste anti "micro actif mais silencieux" :
//  1) Unpublish + stop du track courant (device stale).
//  2) Fresh getUserMedia (nouveau handle OS → nouveau routage device).
//  3) Publish via new LocalAudioTrack(..., userProvidedTrack:true) — LiveKit
//     ne touche pas au cycle de vie du track, pas de restart interne, pas
//     de course avec WebRTC.
// Utilisé à la fois par l'auto-récupération (silence détecté) et le bouton
// manuel "Réessayer".
async function republishMicWithFreshStream(room) {
  const lp = room?.localParticipant;
  if (!lp) return false;
  try {
    // 1) Retirer proprement l'ancienne piste micro.
    const oldPub = lp.getTrackPublication?.(Track.Source.Microphone);
    if (oldPub?.track) {
      try { await lp.unpublishTrack(oldPub.track, true /* stopOnUnpublish */); } catch (_e) { /* ignore */ }
    }
    // 2) Nouveau getUserMedia — fenêtre courte pour ne pas bloquer indéfiniment.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const mst = stream.getAudioTracks()[0];
    if (!mst || mst.readyState !== "live") {
      try { stream.getTracks().forEach((t) => t.stop()); } catch (_e) { /* ignore */ }
      return false;
    }
    // 3) Publier avec userProvidedTrack: true — LiveKit ne restart pas la piste.
    const localTrack = new LocalAudioTrack(mst, undefined, true);
    await lp.publishTrack(localTrack, { source: Track.Source.Microphone });
    forcePlayAndRecordSession();
    return true;
  } catch (e) {
    console.warn("[republishMicWithFreshStream] failed:", e?.message);
    return false;
  }
}


// ── LiveKitMicBanner ────────────────────────────────────────────────────
// Bannière visible ET cliquable pour réessayer le micro. Le retry utilise
// le même chemin robuste que l'auto-récupération (fresh gUM + publishTrack
// avec userProvidedTrack:true), garanti hors du geste utilisateur mais
// suffisant car la permission a été acquise plus tôt.
function LiveKitMicBanner({ reason, isDarkMode, onRetry }) {
  const room = useRoomContext();

  const handleRetry = useCallback(async () => {
    armIosAudio();
    try {
      await republishMicWithFreshStream(room);
      forcePlayAndRecordSession();
    } catch (e) {
      console.warn("[LiveKit] retry micro failed:", e);
    } finally {
      onRetry?.();
    }
  }, [room, onRetry]);

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "max(76px, calc(env(safe-area-inset-bottom) + 52px))",
        transform: "translateX(-50%)",
        zIndex: 9999,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 12,
        borderRadius: 16,
        maxWidth: "min(340px, 90vw)",
        background: isDarkMode ? "#1F2937" : "#111827",
        color: "white",
        boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      {reason && <span style={{ fontSize: 12, opacity: 0.85 }}>{reason}</span>}
      <button type="button" onClick={handleRetry} style={unlockButtonStyle}>
        🎤 Appuie ici pour réactiver le micro
      </button>
    </div>
  );
}

const unlockButtonStyle = {
  border: "none",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))",
  color: "white",
};

// ── Sync état LiveKit → parent ────────────────────────────────────────────────
function LiveKitStateSync({ onTranscriptionsUpdate, onStateChange, onControllerReady }) {
  const room = useRoomContext();
  const { state, audioTrack, agentTranscriptions } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const userTranscriptions = useTranscriptions();

  // Enregistrer le pont avec le bus global pour toutes les vues
  useEffect(() => {
    if (!room || !localParticipant) return;
    const sayHandler = async (text) => {
      try {
        const payload = new TextEncoder().encode(JSON.stringify({ type: "say", text }));
        await localParticipant.publishData(payload, { reliable: true });
      } catch (err) {
        console.warn("[LiveKit] sayHandler échoué:", err);
      }
    };
    const interruptHandler = () => {
      try {
        const payload = new TextEncoder().encode(JSON.stringify({ type: "interrupt" }));
        localParticipant.publishData(payload, { reliable: true });
      } catch (err) {
        console.warn("[LiveKit] interruptHandler échoué:", err);
      }
    };

    liveKitVoiceBus.setBridge({ room, localParticipant, sayHandler, interruptHandler });
    liveKitVoiceBus.notify({
      isConnected: true,
      agentState: state,
      isSpeaking: state === "speaking",
      isListening: state === "listening",
    });

    onControllerReady?.(liveKitVoiceBus);

    return () => {
      liveKitVoiceBus.clearBridge();
      liveKitVoiceBus.notify({
        isConnected: false,
        agentState: "idle",
        isSpeaking: false,
        isListening: false,
      });
    };
  }, [room, localParticipant, state, onControllerReady]);

  // Synchroniser les changements d'état speaking/listening
  useEffect(() => {
    liveKitVoiceBus.notify({
      agentState: state,
      isSpeaking: state === "speaking",
      isListening: state === "listening",
    });
  }, [state]);

  const prevStateRef = useRef(null);
  useEffect(() => {
    if (!onStateChange) return;
    const prev = prevStateRef.current;
    if (prev && prev.state === state && prev.audioTrack === audioTrack) return;
    prevStateRef.current = { state, audioTrack };
    onStateChange({ state, audioTrack });
  }, [state, audioTrack, onStateChange]);

  const lastTranscriptionsKeyRef = useRef("");
  useEffect(() => {
    if (!onTranscriptionsUpdate) return;

    const agentSegs = (agentTranscriptions || []).map(seg => ({
      id: seg.id || ("agent-seg-" + seg.firstReceivedTime),
      role: "agent",
      identity: LIVEKIT_AGENT_NAME,
      text: seg.text || "",
      isFinal: !!seg.final,
      ts: seg.firstReceivedTime || 0,
    }));

    const localId = localParticipant?.identity;
    const agentTexts = new Set(agentSegs.map(s => s.text?.trim().toLowerCase()).filter(Boolean));

    const userSegs = (userTranscriptions || [])
      .filter(m => {
        const id = m.participantInfo?.identity;
        if (localId) return id === localId;
        return id && id !== LIVEKIT_AGENT_NAME && !id.startsWith("agent-");
      })
      .filter(m => {
        const text = m.text?.trim().toLowerCase();
        return text && !agentTexts.has(text);
      })
      .map(m => ({
        id: m.streamInfo?.id || ("user-" + m.participantInfo?.identity + "-" + (m.streamInfo?.timestamp || Date.now())),
        role: "user",
        identity: m.participantInfo?.identity || "user",
        text: m.text || "",
        isFinal: true,
        ts: m.streamInfo?.timestamp || 0,
      }));

    const combined = [...agentSegs, ...userSegs].sort((a, b) => a.ts - b.ts);
    const key = combined.map(c => `${c.id}:${c.text}:${c.isFinal}`).join("|");
    if (key === lastTranscriptionsKeyRef.current) return;
    lastTranscriptionsKeyRef.current = key;
    onTranscriptionsUpdate(combined);
  }, [agentTranscriptions, userTranscriptions, localParticipant, onTranscriptionsUpdate]);

  return null;
}


// ── LiveKitAgentWatchdog ────────────────────────────────────────────────
// Le symptôme « je me connecte, le micro s'active, mais l'agent ne parle
// jamais » vient presque toujours du DISPATCH : la room est bien créée,
// mais aucun worker d'agent n'y est envoyé. Côté navigateur, ça ne produit
// aucune erreur — d'où ce guetteur : si aucun participant distant n'a
// rejoint la room au bout de 8 secondes, on le dit explicitement.
function LiveKitAgentWatchdog({ onMissing }) {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;
    let timer = null;

    const hasRemote = () => (room.remoteParticipants?.size || 0) > 0;

    if (hasRemote()) {
      onMissing?.(false);
      return;
    }

    const check = () => {
      if (hasRemote()) {
        onMissing?.(false);
      } else {
        console.warn("[LiveKit] Aucun agent n'a rejoint la room après 12s — dispatch en attente ou KO.");
        onMissing?.(true);
      }
    };

    const onParticipant = (p) => {
      console.info("[LiveKit] participant distant connecté :", p?.identity);
      onMissing?.(false);
      if (timer) { clearTimeout(timer); timer = null; }
    };

    room.on(RoomEvent.ParticipantConnected, onParticipant);
    timer = setTimeout(check, 12000);

    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipant);
      if (timer) clearTimeout(timer);
    };
  }, [room, onMissing]);

  return null;
}
