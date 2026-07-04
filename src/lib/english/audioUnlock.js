// 🔓 audioUnlock.js — iOS Safari refuse l'audio sans interaction. Débloque au 1er tap.
let unlocked = false;
let listeners = [];

export function isAudioUnlocked() { return unlocked; }
export function onAudioUnlocked(cb) { if (unlocked) cb(); else listeners.push(cb); }

export function installAudioUnlock() {
  if (typeof window === "undefined" || unlocked) return;
  const unlock = async () => {
    if (unlocked) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination); src.start(0);
        await ctx.resume?.();
      }
      // ping speechSynthesis
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0; window.speechSynthesis?.speak(u);
      } catch {}
      unlocked = true;
      listeners.forEach(c => { try { c(); } catch {} });
      listeners = [];
    } catch {}
  };
  ["touchstart", "click", "keydown"].forEach(ev =>
    window.addEventListener(ev, unlock, { once: true, passive: true })
  );
}
