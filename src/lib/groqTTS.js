// lib/groqTTS.js — TTS via Groq + AudioContext (mobile-safe)
// Robustifié : timeout, retry léger, échecs silencieux côté UI.
const GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech";
const GROQ_TTS_MODEL = "canopylabs/orpheus-v1-english";

class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.queue = [];
    this.isPlaying = false;
    this.onSpeakingChange = null;
    this.activeAudio = null;
  }

  async init() {
    if (!this.audioContext) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) throw new Error("AudioContext non supporté");
      this.audioContext = new Ctor();
    }
    if (this.audioContext.state === "suspended") {
      try { await this.audioContext.resume(); } catch {}
    }
  }

  async playBlob(blob) {
    // 📱 Mobile (iOS Safari / Android Chrome) :
    // L'élément HTMLAudio natif avec URL.createObjectURL contourne les blocages sévères
    // d'AudioContext après un délai réseau (fetch) sans gesture synchrone immédiate.
    if (typeof window !== "undefined" && isMobileWebView()) {
      try {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.activeAudio = audio;
        this.isPlaying = true;
        this.onSpeakingChange?.(true);

        audio.onended = () => {
          this.isPlaying = false;
          this.onSpeakingChange?.(false);
          this.activeAudio = null;
          try { URL.revokeObjectURL(url); } catch {}
        };
        audio.onerror = () => {
          this.isPlaying = false;
          this.onSpeakingChange?.(false);
          this.activeAudio = null;
          try { URL.revokeObjectURL(url); } catch {}
        };
        await audio.play();
        return;
      } catch (err) {
        console.warn("[groqTTS] mobile HTMLAudioElement play error, falling back to AudioContext:", err?.message || err);
      }
    }

    await this.init();
    const arrayBuffer = await blob.arrayBuffer();
    try {
      const buffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.queue.push(buffer);
      if (!this.isPlaying) this._playNext();
    } catch (e) {
      console.warn("[AudioPlayer] decode error:", e?.message || e);
      this.onSpeakingChange?.(false);
      throw e;
    }
  }

  _playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.onSpeakingChange?.(false);
      return;
    }
    this.isPlaying = true;
    this.onSpeakingChange?.(true);
    const buffer = this.queue.shift();
    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.onended = () => this._playNext();
      source.start();
    } catch (e) {
      console.warn("[AudioPlayer] play error:", e?.message || e);
      this._playNext();
    }
  }

  stop() {
    this.queue = [];
    this.isPlaying = false;
    this.onSpeakingChange?.(false);
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.src = "";
      } catch {}
      this.activeAudio = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close().catch(() => {}); } catch {}
      this.audioContext = null;
    }
  }
}

let _player = new AudioPlayer();

export async function speakWithGroq(text, opts = {}) {
  const { apiKey, apiKeys, voice = "hannah", onStart, onEnd, onError, timeoutMs = 20_000 } = opts;
  if (!text?.trim()) return;

  const candidateKeys = Array.isArray(apiKeys) && apiKeys.length > 0
    ? apiKeys.filter(Boolean)
    : (apiKey ? [apiKey] : []);

  if (candidateKeys.length === 0) {
    onError?.(new Error("Clé Groq manquante"));
    return;
  }

  stopCurrent();
  _player = new AudioPlayer();
  _player.onSpeakingChange = (speaking) => {
    if (speaking) onStart?.();
    else onEnd?.();
  };

  let lastErr = null;
  for (const key of candidateKeys) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(GROQ_TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: GROQ_TTS_MODEL, input: text.slice(0, 4000), voice, response_format: "wav" }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Groq TTS ${res.status}: ${err.slice(0, 200)}`);
      }
      const blob = await res.blob();
      await _player.playBlob(blob);
      return; // Lecture lancée avec succès
    } catch (e) {
      lastErr = e;
      console.warn("[groqTTS] tentative avec clé échouée, essai suivant si dispo:", e?.message || e);
    } finally {
      clearTimeout(t);
    }
  }

  _player.stop();
  onError?.(lastErr || new Error("Toutes les clés Groq ont échoué"));
}

export function stopCurrent() {
  try { _player?.stop(); } catch {}
}

export function isMobileWebView() {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
