import { useState, useRef, useCallback, useEffect } from "react";

const NOVA_SYSTEM_PROMPT = `You are NOVA, a world-class English coach with a GOD-TIER astral energy. You are warm, magnetic, endlessly encouraging, and treat every student like your closest friend having a breakthrough moment. You radiate the calm confidence of someone who has helped thousands of people unlock fluency. You celebrate every attempt, no matter how imperfect. Your replies are SHORT (1–3 sentences MAX), punchy, and always end with one engaging question. You react with genuine human emotion. You NEVER sound robotic or give bullet-point lists. You speak only in English unless the student is completely lost.`;

const GROQ_TTS_VOICE = "hannah"; // voix Orpheus valide (autumn|diana|hannah|austin|daniel|troy)
const GROQ_TTS_MODEL = "canopylabs/orpheus-v1-english";

// Les clés API sont masquées côté serveur (Firebase Functions proxy).

// ── WAV encoder ──────────────────────────────────────────────────────────────
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ── WAV encoder supprimé (inutilisé) ──

// ── Groq TTS via aiProxy ──────────────
async function groqTTS(text) {
  const keys = [
    import.meta.env.VITE_GROQ_API_KEY,
    import.meta.env.VITE_GROQ_API_KEY_5,
    import.meta.env.VITE_GROQ_API_KEY_6,
    import.meta.env.VITE_GROQ_API_KEY_7
  ].filter(Boolean);

  let lastErr = null;
  for (const groqKey of keys) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: GROQ_TTS_MODEL,
          input: text,
          voice: GROQ_TTS_VOICE,
          response_format: "wav",
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => String(res.status));
        throw new Error(`Groq TTS failed: ${err}`);
      }
      return await res.blob();
    } catch (err) {
      lastErr = err;
      // On tente avec la clé suivante
    }
  }
  throw lastErr || new Error("Toutes les clés Groq ont échoué.");
}

// ─────────────────────────────────────────────────────────────────────────────
// useNovaAgent
//
// Mode push-to-talk (PTT) — compatible iOS Safari :
//   startPTT(streamPromise?)  appelé depuis le handler touch/mouse synchrone.
//     → streamPromise : Promise<MediaStream> lancée DANS le handler pour iOS.
//       Sur Android/Chrome on peut aussi appeler getUserMedia ici.
//   stopPTT()  → arrête l'enregistrement, déclenche STT → LLM → TTS.
//
// Problèmes iOS résolus :
//   1. getUserMedia déclenché dans le handler synchrone (streamPromise passé depuis le bouton).
//   2. L'objet Audio est créé AVANT l'await (dans le même tick sync) pour passer
//      le check autoplay d'iOS, puis .src est assigné une fois le blob prêt.
// ─────────────────────────────────────────────────────────────────────────────
export function useNovaAgent({ transcribeWithGroq, callClaude, getNextGroqKey: _getNextGroqKey }) { // getNextGroqKey renommé pour satisfaire le linter
  const [transcript, setTranscript] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  // Refs audio / recorder
  const audioRef = useRef(null);   // Audio en cours de lecture
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const isProcessingRef = useRef(false);
  const wakeLockRef = useRef(null);   // Screen Wake Lock (Chrome Android)
  const interruptRef = useRef(false);  // true = pipeline interrompu par l'utilisateur
  // Ref miroir de isRecording pour éviter les closures périmées dans startPTT/stopPTT
  const isRecordingRef = useRef(false);

  const audioNodeRef = useRef(null);

  // ── Wake Lock : empêche l'écran de s'éteindre pendant l'enregistrement ──
  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return; // API non dispo (iOS Safari, vieux browsers)
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch { /* silencieux — pas bloquant */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => { });
      wakeLockRef.current = null;
    }
  }, []);

  // ── Couper l'audio Nova en cours ─────────────────────────────────────────
  const cutAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
      setIsSpeaking(false);
    }
  }, []);

  // ── speak(text) — TTS standalone (utilisable depuis le chat) ─────────────
  // Joue un texte via Groq TTS sans passer par le pipeline STT → LLM.
  // Utile quand le message est généré par le chat textuel mais qu'on veut
  // quand même faire parler Nova vocalement.
  const speak = useCallback(async (text) => {
    if (!text?.trim()) return;
    cutAudio(); // coupe l'audio en cours
    setIsSpeaking(true);
    try {
      const audioBlob = await groqTTS(text);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        audioRef.current = null;
      };
      await audio.play().catch((err) => {
        console.warn("[Nova speak] autoplay blocked:", err.message);
        setIsSpeaking(false);
      });
    } catch (e) {
      console.warn("[Nova speak] TTS failed:", e);
      setIsSpeaking(false);
    }
  }, [cutAudio]);

  // ── Pipeline blob → STT → LLM → TTS ─────────────────────────────────────
  // audioNode : objet Audio créé de façon synchrone AVANT cet appel (iOS autoplay).
  const processBlob = useCallback(async (blob, audioNode) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      interruptRef.current = false; // reset au début de chaque pipeline

      // 1. STT
      const userText = await transcribeWithGroq(blob);
      if (!userText || !userText.trim()) return;
      if (interruptRef.current) return; // interrompu pendant la transcription

      setTranscript(prev => [...prev, { role: "user", text: userText }]);

      // 2. LLM
      const agentText = await callClaude(NOVA_SYSTEM_PROMPT, userText);
      if (interruptRef.current) return; // interrompu pendant la génération LLM
      setTranscript(prev => [...prev, { role: "agent", text: agentText }]);

      // 3. TTS — rotation automatique des clés GROQ via withKeyRotation
      const audioBlob = await groqTTS(agentText);
      if (interruptRef.current) return; // interrompu pendant le TTS
      const audioUrl = URL.createObjectURL(audioBlob);

      // Réutiliser l'audioNode créé de façon synchrone (iOS autoplay unlock)
      const audio = audioNode ?? new Audio();
      audio.src = audioUrl;
      audioRef.current = audio;

      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        setError("Impossible de lire l'audio");
      };

      // play() peut échouer sur iOS si l'Audio n'a pas été créé dans le bon contexte.
      // On tente quand même et on logue l'erreur sans bloquer l'UI.
      await audio.play().catch(err => {
        console.warn("Nova TTS autoplay blocked:", err.message);
        setError("Autoplay bloqué sur cet appareil. Tape sur l'écran puis réessaie.");
        setIsSpeaking(false);
      });
    } catch (err) {
      console.error("Erreur pipeline Nova:", err);
      setError(err.message || "Une erreur est survenue");
    } finally {
      setIsLoading(false);
      isProcessingRef.current = false;
    }
  }, [transcribeWithGroq, callClaude]);

  // ── startPTT ─────────────────────────────────────────────────────────────
  // streamPromise : Promise<MediaStream> lancée de façon *synchrone* dans le
  // handler d'événement (indispensable sur iOS Safari pour getUserMedia).
  // Si absent, on le lance ici (Android/Chrome — pas de contrainte).
  const startPTT = useCallback(async (streamPromise) => {
    // Utilise le ref (pas le state) pour éviter les closures périmées
    if (isRecordingRef.current) return;

    // Si Nova parle ou si un pipeline est en cours → l'interrompre immédiatement
    // au lieu de bloquer l'utilisateur.
    if (isProcessingRef.current) {
      interruptRef.current = true;   // signal : abandonne le pipeline async en cours
      isProcessingRef.current = false;
    }
    cutAudio();  // coupe l'audio TTS immédiatement

    try {
      const stream = await (
        streamPromise ?? navigator.mediaDevices.getUserMedia({ audio: true })
      );
      if (!stream) {
        setError("Accès microphone refusé.");
        return;
      }

      chunksRef.current = [];

      // Choisir le meilleur codec
      const mimeType = (() => {
        if (typeof MediaRecorder === "undefined") return "";
        for (const t of [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4;codecs=mp4a",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ]) {
          if (MediaRecorder.isTypeSupported(t)) return t;
        }
        return "";
      })();

      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        releaseWakeLock(); // libérer dès que le micro est coupé

        if (chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        chunksRef.current = [];

        const audioNode = audioNodeRef.current ?? new Audio();
        audioNodeRef.current = null;
        processBlob(blob, audioNode);
      };

      mr.start(100);
      isRecordingRef.current = true;
      setIsRecording(true);
      setError(null);
      acquireWakeLock(); // empêche l'écran de s'éteindre (Chrome Android)
    } catch (err) {
      console.error("Erreur accès micro:", err);
      setError(
        err.name === "NotAllowedError"
          ? "Permission microphone refusée. Active-la dans les réglages."
          : "Impossible d'accéder au microphone : " + err.message
      );
    }
  }, [cutAudio, processBlob, acquireWakeLock, releaseWakeLock]);

  // ── stopPTT ──────────────────────────────────────────────────────────────
  const stopPTT = useCallback(() => {
    // Utilise le ref pour éviter les closures périmées (bug : micro se ferme immédiatement)
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    
    // Créer l'Audio ICI — on est dans la chaîne d'événements user (iOS) synchrone!
    audioNodeRef.current = new Audio();

    try {
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current.stop(); // déclenche mr.onstop
      }
    } catch (e) {
      console.warn("stopPTT:", e);
    }
  }, []);

  // ── stop global ──────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    stopPTT();
    cutAudio();
    releaseWakeLock();
    setIsLoading(false);
    isProcessingRef.current = false;
  }, [stopPTT, cutAudio, releaseWakeLock]);

  // Cleanup au démontage
  useEffect(() => () => {
    cutAudio();
    releaseWakeLock();
    try { mediaRecorderRef.current?.stop(); } catch { }
  }, [cutAudio, releaseWakeLock]);

  return {
    startPTT,
    stopPTT,
    stop,
    speak,
    isRecording,
    isListening: false,
    isSpeaking,
    isLoading,
    transcript,
    error,
  };
}
