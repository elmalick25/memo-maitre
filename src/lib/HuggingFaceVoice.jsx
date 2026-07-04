import React, { useState, useEffect, useCallback, useRef } from "react";

// ── VARIABLES GLOBALES (Instance unique) ────────────────────────────────────
let currentNovaAudio = null;

const HF_TTS_URL = "https://api-inference.huggingface.co/models/hexgrad/Kokoro-82M";
const HF_STT_URL = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "";

// ── 1. PREPROCESS TEXT FOR KOKORO ───────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function prepareForKokoro(text) {
  if (!text) return "";
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[.*?\]\(.*?\)/g, "")
    .replace(/\n+/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── 4. STOP SPEAKING ────────────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function stopSpeaking() {
  if (currentNovaAudio) {
    currentNovaAudio.pause();
    currentNovaAudio.currentTime = 0;
    currentNovaAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// ── 3. SPEAK TEXT (TTS) ─────────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export async function speakText(text) {
  stopSpeaking();
  const processedText = prepareForKokoro(text);
  if (!processedText) return;

  try {
    const response = await fetch(HF_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HF_TOKEN}`
      },
      body: JSON.stringify({
        inputs: processedText,
        parameters: { voice: "af_nova" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HF TTS Error: ${response.status} - ${errorText}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      currentNovaAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (currentNovaAudio === audio) currentNovaAudio = null;
        resolve();
      };
      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        if (currentNovaAudio === audio) currentNovaAudio = null;
        reject(e);
      };
      audio.play().catch(reject);
    });
  } catch (error) {
    console.warn("HF TTS failed, falling back to window.speechSynthesis", error);
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      const u = new SpeechSynthesisUtterance(processedText);
      u.lang = "en-US";
      u.rate = 0.85;
      u.pitch = 1.1;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v =>
        v.lang.startsWith("en") &&
        (v.name.includes("Female") || v.name.includes("Samantha") || v.name.includes("Zira"))
      );
      if (preferred) u.voice = preferred;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }
}

// ── 2. TRANSCRIBE AUDIO (STT) ───────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export async function transcribeAudio(audioBlob, onStatusChange) {
  const attemptTranscription = async (retries = 3) => {
    try {
      const reader = new FileReader();
      const response = await fetch(HF_STT_URL, {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${HF_TOKEN}` 
        },
        body: audioBlob
      });

      if (response.status === 503 && retries > 0) {
        if (onStatusChange) onStatusChange("⏳ Nova se réveille... (première fois ~20s)");
        await new Promise(r => setTimeout(r, 20000));
        return attemptTranscription(retries - 1);
      }

      if (!response.ok) throw new Error(`HF STT Error: ${response.status}`);

      const data = await response.json();
      return data.text || "";
    } catch (e) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 5000));
        return attemptTranscription(retries - 1);
      }
      throw e;
    }
  };

  return attemptTranscription();
}

// ── 6. SPEAK WITH FALLBACK ──────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export async function speakWithFallback(text, options, speakWithElevenLabsOriginal, onProviderSwitch) {
  const isNovaForced = sessionStorage.getItem("nova_active") === "true";

  if (isNovaForced) {
    if (onProviderSwitch) onProviderSwitch("nova");
    return speakText(text, options);
  }

  try {
    await speakWithElevenLabsOriginal(text, options);
  } catch (error) {
    console.warn("ElevenLabs failed", error);
    sessionStorage.setItem("nova_active", "true");
    if (onProviderSwitch) onProviderSwitch("nova");
    return speakText(text, options);
  }
}

// ── UTILITAIRES AUDIO ────────────────────────────────────────────────────────
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function float32ToWavBlob(float32Array, sampleRate = 16000) {
  const numChannels = 1;
  const numFrames = float32Array.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// ── VAD NATIF — remplace @ricky0123/vad-react ────────────────────────────────
// Détection de voix via Web Audio API + analyse RMS, sans dépendance externe.
function useNativeVAD({
  startOnLoad = false,
  onSpeechStart,
  onSpeechEnd,
  positiveSpeechThreshold = 0.015,
  negativeSpeechThreshold = 0.008,
  minSpeechFrames = 5,
  redemptionFrames = 8,
} = {}) {
  const [userSpeaking, setUserSpeaking] = useState(false);
  const stateRef = useRef({
    stream: null,
    audioCtx: null,
    analyser: null,
    mediaRecorder: null,
    chunks: [],
    speaking: false,
    silenceCount: 0,
    speechCount: 0,
    active: false,
    animFrame: null,
  });

  const stop = useCallback(() => {
    const s = stateRef.current;
    s.active = false;
    cancelAnimationFrame(s.animFrame);
    if (s.mediaRecorder && s.mediaRecorder.state !== "inactive") s.mediaRecorder.stop();
    if (s.stream) s.stream.getTracks().forEach(t => t.stop());
    if (s.audioCtx) s.audioCtx.close();
    s.stream = null; s.audioCtx = null; s.analyser = null;
    s.mediaRecorder = null; s.chunks = []; s.speaking = false;
    setUserSpeaking(false);
  }, []);

  const start = useCallback(async () => {
    const s = stateRef.current;
    if (s.active) return;

    try {
      s.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.audioCtx = new AudioContext();
      s.analyser = s.audioCtx.createAnalyser();
      s.analyser.fftSize = 512;
      s.audioCtx.createMediaStreamSource(s.stream).connect(s.analyser);

      s.mediaRecorder = new MediaRecorder(s.stream);
      s.chunks = [];
      s.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) s.chunks.push(e.data); };
      s.mediaRecorder.onstop = () => {
        const blob = new Blob(s.chunks, { type: "audio/webm" });
        s.chunks = [];
        if (onSpeechEnd) onSpeechEnd(blob);
      };

      s.active = true;
      const buf = new Float32Array(s.analyser.fftSize);

      const tick = () => {
        if (!s.active) return;
        s.analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((acc, v) => acc + v * v, 0) / buf.length);

        if (!s.speaking) {
          if (rms > positiveSpeechThreshold) {
            s.speechCount++;
            if (s.speechCount >= minSpeechFrames) {
              s.speaking = true;
              s.silenceCount = 0;
              setUserSpeaking(true);
              if (onSpeechStart) onSpeechStart();
              s.mediaRecorder.start();
            }
          } else {
            s.speechCount = 0;
          }
        } else {
          if (rms < negativeSpeechThreshold) {
            s.silenceCount++;
            if (s.silenceCount >= redemptionFrames) {
              s.speaking = false;
              s.speechCount = 0;
              setUserSpeaking(false);
              if (s.mediaRecorder.state === "recording") s.mediaRecorder.stop();
            }
          } else {
            s.silenceCount = 0;
          }
        }

        s.animFrame = requestAnimationFrame(tick);
      };
      tick();

      if (startOnLoad) { /* already started */ }
    } catch (e) {
      console.error("VAD mic error:", e);
    }
  }, [onSpeechStart, onSpeechEnd, positiveSpeechThreshold, negativeSpeechThreshold, minSpeechFrames, redemptionFrames, startOnLoad]);

  const pause = useCallback(() => stop(), [stop]);

  useEffect(() => {
    if (startOnLoad) start();
    return () => stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { start, pause, stop, userSpeaking };
}

// ── 5. HOOK useNovaVoice ────────────────────────────────────────────────────
export function useNovaVoice({ customTranscriber, onRecordingStart } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const onTranscriptRef = useRef(null);

  useEffect(() => {
    const checkAudio = setInterval(() => {
      setIsSpeaking(!!currentNovaAudio || window.speechSynthesis?.speaking);
    }, 200);
    return () => clearInterval(checkAudio);
  }, []);

  const vad = useNativeVAD({
    startOnLoad: false,
    onSpeechStart: () => {
      stopSpeaking();
      if (onRecordingStart) onRecordingStart();
    },
    onSpeechEnd: async (audioBlob) => {
      setIsLoading(true);
      try {
        const text = customTranscriber
          ? await customTranscriber(audioBlob)
          : await transcribeAudio(audioBlob);
        if (text && text.trim().length > 2) {
          if (onTranscriptRef.current) onTranscriptRef.current(text);
        }
      } catch (e) {
        setError("Transcription échouée");
      } finally {
        setIsLoading(false);
      }
    },
    positiveSpeechThreshold: 0.015,
    negativeSpeechThreshold: 0.008,
    minSpeechFrames: 5,
    redemptionFrames: 8,
  });

  // Expose onTranscript setter compatible avec l'ancienne API vad.onTranscript = fn
  const vadProxy = {
    ...vad,
    get onTranscript() { return onTranscriptRef.current; },
    set onTranscript(fn) { onTranscriptRef.current = fn; },
  };

  const startListening = useCallback(() => {
    setError(null);
    setIsListening(true);
    vad.start();
  }, [vad]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    vad.pause();
  }, [vad]);

  const warmUp = useCallback(() => {
    fetch(HF_STT_URL, { method: "POST", headers: { "Authorization": `Bearer ${HF_TOKEN}` }, body: new Blob(["dummy"], { type: 'audio/webm' }) }).catch(() => { });
    fetch(HF_TTS_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${HF_TOKEN}` }, body: JSON.stringify({ inputs: "Hello", parameters: { speaker_embeddings: "Matthijs/cmu-arctic-xvectors", speaker_id: 6799 } }) }).catch(() => { });
  }, []);

  const isNovaActive = sessionStorage.getItem("nova_active") === "true";

  return {
    startListening,
    stopListening,
    isListening,
    isLoading,
    isSpeaking,
    error,
    vad: vadProxy,
    warmUp,
    isNovaActive
  };
}

// ── 7. COMPOSANT <NovaVoiceButton /> ────────────────────────────────────────
export function NovaVoiceButton({ onTranscript, disabled = false, isDarkMode, customTranscriber }) {
  const { startListening, stopListening, isListening, isLoading, isSpeaking, error, vad } = useNovaVoice({ customTranscriber });

  useEffect(() => {
    vad.onTranscript = onTranscript;
  }, [vad, onTranscript]);

  const handleClick = () => {
    if (disabled) return;
    if (isListening) stopListening();
    else startListening();
  };

  const getStatusText = () => {
    if (error) return "😔 Nova n'a pas bien entendu, réessaie ?";
    if (isLoading) return "💭 Nova réfléchit...";
    if (isSpeaking) return "🗣️ Nova parle...";
    if (vad.userSpeaking) return "🔴 Je t'écoute...";
    if (isListening) return "👂 J'attends que tu parles...";
    return "🎙️ Parler à Nova";
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || (isLoading && !vad.userSpeaking)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 20px",
        borderRadius: 14,
        border: "none",
        cursor: (disabled || (isLoading && !vad.userSpeaking)) ? "not-allowed" : "pointer",
        background: vad.userSpeaking
          ? "linear-gradient(135deg, #EF4444, #B91C1C)"
          : isListening
            ? "linear-gradient(135deg, #3B82F6, #2563EB)"
            : (isDarkMode ? "#1F1F1F" : "#E5E7EB"),
        color: (vad.userSpeaking || isListening) ? "white" : (isDarkMode ? "var(--mm-border)" : "#1E293B"),
        fontWeight: 800,
        fontSize: 14,
        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        boxShadow: vad.userSpeaking
          ? "0 4px 15px rgba(239, 68, 68, 0.4)"
          : isListening ? "0 4px 15px rgba(59, 130, 246, 0.4)" : "none",
        opacity: (disabled || (isLoading && !vad.userSpeaking)) ? 0.7 : 1
      }}
    >
      <span style={{
        fontSize: 18,
        animation: vad.userSpeaking ? "pulseGlow 1.5s infinite" : (isLoading ? "bounce 1s infinite" : "none")
      }}>
        {vad.userSpeaking ? "🔴" : (isLoading ? "⏳" : "🎙️")}
      </span>
      <span>{getStatusText()}</span>
      <style>{`
        @keyframes pulseGlow {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </button>
  );
}

// ── 8. COMPOSANT <NovaBadge /> ──────────────────────────────────────────────
export function NovaBadge({ isDarkMode }) {
  const [isActive, setIsActive] = useState(sessionStorage.getItem("nova_active") === "true");

  useEffect(() => {
    const interval = setInterval(() => {
      setIsActive(sessionStorage.getItem("nova_active") === "true");
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!isActive) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 12px",
      borderRadius: 20,
      background: isDarkMode ? "rgba(77, 107, 254, 0.15)" : "rgba(77, 107, 254, 0.1)",
      border: `1px solid ${isDarkMode ? "rgba(77, 107, 254, 0.3)" : "rgba(77, 107, 254, 0.2)"}`,
      color: isDarkMode ? "#C4B5FD" : "#4D6BFE",
      fontSize: 12,
      fontWeight: 600,
      boxShadow: "0 2px 8px rgba(77, 107, 254, 0.1)",
      transition: "all 0.3s"
    }}>
      <span style={{ animation: "pulseNova 2s infinite" }}>🌙</span>
      <span>Mode Nova actif</span>
      <button
        onClick={() => {
          sessionStorage.removeItem("nova_active");
          setIsActive(false);
        }}
        title="Retenter ElevenLabs"
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "2px 6px", borderRadius: 4,
          fontSize: 11, color: isDarkMode ? "#BFCBFF" : "#3451D1",
          display: "flex", alignItems: "center", gap: 4,
          marginLeft: 4, transition: "background 0.2s"
        }}
        onMouseOver={e => e.currentTarget.style.background = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.05)"}
        onMouseOut={e => e.currentTarget.style.background = "none"}
      >
        🔄
      </button>
      <style>{`
        @keyframes pulseNova {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
}
