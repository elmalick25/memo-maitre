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
    await this.init();
    const arrayBuffer = await blob.arrayBuffer();
    try {
      const buffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.queue.push(buffer);
      if (!this.isPlaying) this._playNext();
    } catch (e) {
      console.warn("[AudioPlayer] decode error:", e?.message || e);
      this.onSpeakingChange?.(false);
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
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

let _player = new AudioPlayer();

export async function speakWithGroq(text, opts = {}) {
  const { apiKey, voice = "hannah", onStart, onEnd, onError, timeoutMs = 20_000 } = opts;
  if (!text?.trim()) return;
  if (!apiKey) { onError?.(new Error("Clé Groq manquante")); return; }

  stopCurrent();
  _player = new AudioPlayer();
  _player.onSpeakingChange = (speaking) => {
    if (speaking) onStart?.();
    else onEnd?.();
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(GROQ_TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: GROQ_TTS_MODEL, input: text.slice(0, 4000), voice, response_format: "wav" }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Groq TTS ${res.status}: ${err.slice(0, 200)}`);
    }
    const blob = await res.blob();
    await _player.playBlob(blob);
  } catch (e) {
    console.warn("[groqTTS] erreur:", e?.message || e);
    _player.stop();
    onError?.(e);
  } finally {
    clearTimeout(t);
  }
}

export function stopCurrent() {
  try { _player?.stop(); } catch {}
}

export function isMobileWebView() {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
