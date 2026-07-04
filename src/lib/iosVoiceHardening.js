// iosVoiceHardening.js — Rend la conversation vocale robuste sur PWA iOS
// ══════════════════════════════════════════════════════════════════════════════
// Le SDK @elevenlabs/react ouvre son AudioContext + attache la piste WebRTC
// distante APRÈS des `fetch()` async (signed URL). En PWA iOS (raccourci "Ajouter
// à l'écran d'accueil"), ce moment est HORS du user-gesture initial, donc iOS
// mute silencieusement la sortie audio et coupe la session.
//
// Ce module fournit :
//   • armIosAudio() — SYNCHRONE, à appeler dans l'onClick avant tout await.
//     Crée un AudioContext partagé, lance un oscillateur inaudible pour
//     l'empêcher de re-suspendre, prépare une <audio playsinline> qui va
//     accueillir la piste WebRTC distante, ping speechSynthesis, unlock.
//   • acquireWakeLock() / releaseWakeLock() — empêche l'écran de s'éteindre.
//   • installVisibilityResume() — resume l'AudioContext au retour foreground.
//   • isIosPWA() — helper de détection.
// ══════════════════════════════════════════════════════════════════════════════

let sharedCtx = null;
let keepAliveOsc = null;
let unlockAudioEl = null;
let wakeLock = null;
let visibilityHandlerInstalled = false;

export function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOSUA = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS = ua.includes("Mac") && navigator.maxTouchPoints > 1;
  return isIOSUA || isIPadOS;
}

export function isIosPWA() {
  if (typeof window === "undefined") return false;
  const standalone =
    window.navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches;
  return isIos() && !!standalone;
}

/**
 * DOIT être appelé de façon 100% synchrone dans un user-gesture (onClick)
 * AVANT tout `await`. Débloque définitivement la sortie audio iOS.
 */
export function armIosAudio() {
  try {
    // 1) AudioContext partagé + resume synchrone
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!sharedCtx || sharedCtx.state === "closed") {
        sharedCtx = new AudioCtx({ latencyHint: "interactive" });
      }
      if (sharedCtx.state === "suspended") {
        // Ne pas await — on est dans un handler synchrone
        sharedCtx.resume().catch(() => {});
      }

      // 2) Oscillateur sub-audible : empêche iOS de re-suspendre le contexte
      //    dès qu'il n'y a plus de source active
      if (!keepAliveOsc) {
        try {
          const osc = sharedCtx.createOscillator();
          const gain = sharedCtx.createGain();
          gain.gain.value = 0.0001; // inaudible
          osc.frequency.value = 20;  // sub-bass
          osc.connect(gain).connect(sharedCtx.destination);
          osc.start();
          keepAliveOsc = osc;
        } catch {}
      }
    }

    // 3) <audio playsinline autoplay> primé — iOS n'autorise l'audio HTML
    //    distant que si l'élément a été "touché" par un user-gesture. On
    //    lance un play() sur un blob silencieux pour poser le flag.
    if (!unlockAudioEl) {
      unlockAudioEl = document.createElement("audio");
      unlockAudioEl.setAttribute("playsinline", "");
      unlockAudioEl.setAttribute("webkit-playsinline", "");
      unlockAudioEl.autoplay = true;
      unlockAudioEl.muted = false;
      unlockAudioEl.style.display = "none";
      // WAV mono 8kHz d'1 sample silencieux (base64)
      unlockAudioEl.src =
        "data:audio/wav;base64,UklGRhwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
      document.body.appendChild(unlockAudioEl);
    }
    const p = unlockAudioEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {});

    // 4) speechSynthesis ping — débloque la file TTS iOS au cas où
    try {
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch {}

    // 5) Installer le resume auto sur visibilitychange (une seule fois)
    installVisibilityResume();
  } catch (e) {
    console.warn("[iosVoiceHardening] armIosAudio failed:", e);
  }
}

export function installVisibilityResume() {
  if (visibilityHandlerInstalled || typeof document === "undefined") return;
  visibilityHandlerInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (sharedCtx && sharedCtx.state === "suspended") {
      sharedCtx.resume().catch(() => {});
    }
    // Ré-acquérir le wake lock (iOS le libère au blur)
    if (wakeLock === "wanted") acquireWakeLock().catch(() => {});
  });
  window.addEventListener?.("pageshow", () => {
    if (sharedCtx && sharedCtx.state === "suspended") {
      sharedCtx.resume().catch(() => {});
    }
  });
}

export async function acquireWakeLock() {
  try {
    if (!("wakeLock" in navigator)) {
      wakeLock = "wanted";
      return null;
    }
    const sentinel = await navigator.wakeLock.request("screen");
    wakeLock = sentinel;
    sentinel.addEventListener?.("release", () => {
      // iOS libère au blur — on remarquera l'état "wanted" pour le reprendre
      if (wakeLock === sentinel) wakeLock = "wanted";
    });
    return sentinel;
  } catch (e) {
    console.info("[iosVoiceHardening] wakeLock unavailable:", e?.message);
    return null;
  }
}

export function releaseWakeLock() {
  try {
    if (wakeLock && typeof wakeLock === "object" && wakeLock.release) {
      wakeLock.release().catch(() => {});
    }
  } finally {
    wakeLock = null;
  }
}

export function getSharedAudioContext() {
  return sharedCtx;
}

/**
 * Choisit le type de connexion optimal selon batterie / réseau.
 * WebRTC = latence basse mais coûteux. WebSocket = plus robuste sur mauvais réseau.
 */
export async function pickConnectionType() {
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      const et = conn.effectiveType || "";
      if (et === "2g" || et === "slow-2g") return "websocket";
      if (conn.saveData) return "websocket";
    }
    if (navigator.getBattery) {
      const bat = await navigator.getBattery();
      if (!bat.charging && bat.level < 0.15) return "websocket";
    }
  } catch {}
  return "webrtc";
}

/**
 * Feedback haptique (silencieux si non supporté).
 */
export function haptic(pattern = 15) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {}
}
