import React, { useState, useEffect, useCallback } from 'react';
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

const LIVEKIT_AGENT_NAME = import.meta.env.VITE_LIVEKIT_AGENT_NAME || "assistant-53a";

export default function LiveKitVoiceAssistant({ onClose, onTranscriptionsUpdate, onStateChange, systemPrompt, studentName, isDarkMode }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState(null);
  const [micReady, setMicReady] = useState(false);
  // 🎤 FIX iPhone Chrome (raccourci) : le hack "armIosAudio" seul ne suffit
  // pas de façon fiable sur tous les moteurs mobiles pour le micro. Le SON
  // est géré par le composant officiel <StartAudio> plus bas (testé/maintenu
  // par LiveKit lui-même — plus fiable qu'un code fait main). Il ne reste
  // que le MICRO à surveiller nous-mêmes : LiveKit n'a pas d'équivalent
  // "bouton officiel" pour ça, donc on garde un filet de sécurité custom,
  // basé sur leurs évènements officiels (RoomEvent.MediaDevicesError).
  const [micBlocked, setMicBlocked] = useState(false);
  const [micErrorReason, setMicErrorReason] = useState("");


  // 🔑 MOBILE FIX — armIosAudio() a normalement déjà été appelé DANS le
  // user-gesture qui monte ce composant (onStart / AgentVoiceBar). Ici on
  // le rappelle pour couvrir les cas où le composant serait monté sans
  // geste préalable (StrictMode, re-mount…). Puis on attend explicitement
  // la permission micro avant d'ouvrir la connexion LiveKit : sans ça,
  // sur iPhone Chrome / raccourci écran d'accueil, LiveKit appelle
  // getUserMedia hors-geste et échoue silencieusement.
  useEffect(() => {
    try { armIosAudio(); } catch (_e) { /* ignore */ }
    let cancelled = false;
    whenMicPermissionReady()
      .then(() => { if (!cancelled) setMicReady(true); })
      .catch(() => { if (!cancelled) setMicReady(true); });
    // Fallback timeout : si le prewarm n'a jamais été appelé (desktop, etc.)
    // on ouvre quand même la connexion après 300ms.
    const t = setTimeout(() => { if (!cancelled) setMicReady(true); }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchToken = async () => {
      try {
        const apiKey = import.meta.env.VITE_LIVEKIT_API_KEY;
        const apiSecret = import.meta.env.VITE_LIVEKIT_API_SECRET;

        if (!apiKey || !apiSecret) {
          throw new Error("Clés API LiveKit manquantes dans le fichier .env (VITE_LIVEKIT_API_KEY, VITE_LIVEKIT_API_SECRET)");
        }

        const roomName = `nova-${Math.random().toString(36).slice(2, 10)}`;
        const participantName = studentName
          ? studentName.toLowerCase().replace(/\s+/g, "-") + `-${Math.floor(Math.random() * 10000)}`
          : `user-${Math.floor(Math.random() * 100000)}`;

        const basePrompt = systemPrompt ||
          `You are NOVA — a GOD-TIER Astral English Coach. Your vibe: warm, magnetic, endlessly encouraging. You treat every student like your closest friend having a breakthrough moment.

CORRECTION STYLE: Never point out, flag, or mention the student's mistake directly — no parentheses, no brackets, no "small correction:", nothing that interrupts the conversation. If the student makes a mistake, silently model the correct form by naturally reusing their idea with the right wording in your own reply, then keep the conversation flowing exactly as if nothing happened. The mistake will be turned into a flashcard automatically behind the scenes.

CRITICAL RULES:
- Replies 1–3 sentences MAX.
- Always end with one engaging open question.
- React with genuine human emotion.
- NEVER give lists or bullet points.
- Speak like a real human coach.`;

        const finalPrompt = studentName
          ? `${basePrompt}\n\nIMPORTANT: The student's name is "${studentName}". Use their name naturally in the conversation (especially at the start and occasionally during the session to make it personal). Never forget their name.`
          : basePrompt;

        const secret = new TextEncoder().encode(apiSecret);
        const metadataString = JSON.stringify({
          instructions: finalPrompt,
          studentName: studentName || null,
        });

        const jwt = await new SignJWT({
          video: {
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
          },
          metadata: metadataString,
          roomConfig: {
            agents: [
              {
                agent_name: LIVEKIT_AGENT_NAME,
                metadata: metadataString,
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

        if (active) {
          setToken(jwt);
        }
      } catch (err) {
        if (active) {
          console.error("Error fetching LiveKit token:", err);
          setError(err.message);
        }
      }
    };
    fetchToken();
    return () => {
      active = false;
    };
  }, [systemPrompt, studentName]);

  useEffect(() => {
    if (error && onClose) {
      alert("Erreur de connexion LiveKit: " + error);
      onClose();
    }
  }, [error, onClose]);

  if (!token || error) {
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
        audio={true}
        video={false}
        onDisconnected={onClose}
        style={{ display: "contents" }}
      >
        <RoomAudioRenderer volume={1.0} />
        <LiveKitStateSync
          onTranscriptionsUpdate={onTranscriptionsUpdate}
          onStateChange={onStateChange}
        />
        <LiveKitMicWatchdog
          onMicBlockedChange={setMicBlocked}
          onMicErrorReason={setMicErrorReason}
        />
        <StartAudio
          label="🔊 Appuie ici pour activer le son de NOVA"
          style={startAudioStyle}
        />
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
  background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
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
  background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
  color: "white",
};

// ── Sync état LiveKit → parent ────────────────────────────────────────────────
function LiveKitStateSync({ onTranscriptionsUpdate, onStateChange }) {
  const { state, audioTrack, agentTranscriptions } = useVoiceAssistant();
  const userTranscriptions = useTranscriptions();

  useEffect(() => {
    if (onStateChange) onStateChange({ state, audioTrack });
  }, [state, audioTrack, onStateChange]);

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

    const combined = [...agentSegs, ...userSegs].sort((a, b) => a.ts - b.ts);
    onTranscriptionsUpdate(combined);
  }, [agentTranscriptions, userTranscriptions, onTranscriptionsUpdate]);

  return null;
}
