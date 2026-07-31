// src/hooks/useAudioFeedback.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 10 — Feedback sensoriel DIFFÉRENCIÉ par note.
// Avant : 3 sons génériques (correct / hard / again) pour 4 notes.
// Maintenant : une signature sonore distincte par note (Again / Hard / Good /
// Easy), plus des sons dédiés au combo et à l'ouverture d'un coffre.
// L'API historique (playCorrect / playHard / playAgain) est conservée.
// ═══════════════════════════════════════════════════════════════════════════
import { useRef, useCallback } from "react";

// ── CHANTIER 22 — respect du mode silencieux (iOS en particulier) ──────────
// Une PWA qui sonne alors que l'interrupteur physique est sur « silencieux »
// est une mauvaise pratique. WebAudio ignore ce switch par défaut : on force
// donc la catégorie audio « ambient » (WebKit ≥ 16.4), la seule qui se tait
// quand le téléphone est en silencieux. On expose aussi une préférence locale.
export const SOUND_PREF_KEY = "mm_sound_enabled";

export function soundEnabled() {
  try { return window.localStorage.getItem(SOUND_PREF_KEY) !== "off"; } catch { return true; }
}

export function setSoundEnabled(on) {
  try { window.localStorage.setItem(SOUND_PREF_KEY, on ? "on" : "off"); } catch { /* noop */ }
}

function applyAmbientAudioSession() {
  try {
    if (typeof navigator !== "undefined" && navigator.audioSession) {
      // "ambient" = mixe avec les autres sons ET obéit au mode silencieux iOS.
      navigator.audioSession.type = "ambient";
    }
  } catch { /* API absente */ }
}

export default function useAudioFeedback() {
  const audioCtxRef = useRef(null);

  const getCtx = () => {
    if (typeof window === "undefined") return null;
    if (!soundEnabled()) return null;
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      applyAmbientAudioSession();
      audioCtxRef.current = new Ctx({ latencyHint: "interactive" });
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume?.();
    return audioCtxRef.current;
  };

  /** Une note : fréquence, timbre, durée, départ différé, volume, glissando. */
  const tone = useCallback((freq, type = "sine", duration = 0.15, delay = 0, gain = 0.1, toFreq = null) => {
    const ctx = getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }, []);

  const playTone = useCallback((freq, type, duration) => tone(freq, type, duration), [tone]);

  // ── Signatures par note ──────────────────────────────────────────────────
  // Again : descente sourde, courte, jamais punitive (volume bas).
  const playAgain   = useCallback(() => { tone(220, "sawtooth", 0.22, 0, 0.07, 150); }, [tone]);
  // Hard : note unique tenue, légèrement tendue.
  const playHard    = useCallback(() => { tone(392, "triangle", 0.2, 0, 0.09); }, [tone]);
  // Good : petite tierce montante, nette et satisfaisante.
  const playGood    = useCallback(() => { tone(660, "sine", 0.11, 0, 0.1); tone(880, "sine", 0.14, 0.07, 0.09); }, [tone]);
  // Easy : arpège ascendant clair — la récompense la plus « brillante ».
  const playEasy    = useCallback(() => { tone(784, "sine", 0.1, 0, 0.09); tone(988, "sine", 0.1, 0.06, 0.09); tone(1319, "sine", 0.16, 0.12, 0.08); }, [tone]);
  const playCorrect = playGood;

  /** Feedback direct à partir de la note FSRS (0 / 1 / 3 / 5). */
  const playRating = useCallback((q) => {
    if (q === 0) return playAgain();
    if (q === 1) return playHard();
    if (q >= 5) return playEasy();
    return playGood();
  }, [playAgain, playHard, playEasy, playGood]);

  /** Palier de combo franchi : montée plus longue, hauteur croissante. */
  const playCombo = useCallback((step = 1) => {
    const base = 520 + Math.min(4, step) * 90;
    tone(base, "square", 0.08, 0, 0.06);
    tone(base * 1.5, "square", 0.12, 0.07, 0.06);
  }, [tone]);

  /** Ouverture de coffre : petit motif « lootbox » (chantier 8). */
  const playChest = useCallback((rarity = "commun") => {
    const map = { commun: [523, 659], rare: [587, 784], epique: [659, 880, 1047], legendaire: [784, 988, 1319, 1568] };
    (map[rarity] || map.commun).forEach((f, i) => tone(f, "triangle", 0.18, i * 0.08, 0.09));
  }, [tone]);

  const setEnabled = useCallback((on) => {
    setSoundEnabled(on);
    if (!on) { try { audioCtxRef.current?.suspend?.(); } catch { /* noop */ } }
  }, []);

  return { setSoundEnabled: setEnabled, isSoundEnabled: soundEnabled, playTone, playCorrect, playGood, playEasy, playHard, playAgain, playRating, playCombo, playChest };
}
