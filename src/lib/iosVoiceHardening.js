// iosVoiceHardening.js — Rend la conversation vocale robuste sur PWA iOS
// ══════════════════════════════════════════════════════════════════════════════
// Le SDK @elevenlabs/react / LiveKit ouvre son AudioContext + attache la piste
// WebRTC distante APRÈS des `fetch()` async (signed URL). En PWA iOS (raccourci
// "Ajouter à l'écran d'accueil"), ce moment est HORS du user-gesture initial,
// donc iOS mute silencieusement la sortie audio et coupe la session.
//
// ⚠️ PROBLÈME CRITIQUE iOS Safari / PWA (juillet 2026) :
//   Dès qu'un getUserMedia({audio:true}) est actif (LiveKit ouvre le micro),
//   iOS bascule la session audio en catégorie "PlayAndRecord" et route par
//   défaut la sortie vers l'ÉCOUTEUR (le petit haut-parleur du haut, celui
//   des appels), PAS vers le haut-parleur principal. Résultat : la voix de
//   l'agent est audible seulement si on colle l'oreille à l'écran, et le
//   volume max n'y change rien (le volume "sonnerie" ≠ volume "média").
//
//   Fix officiel (WebKit) : `navigator.audioSession.type = 'play-and-record'`
//   force le routage vers le haut-parleur principal en Safari 17.4+.
//   Doit être appelé DANS le user-gesture, AVANT getUserMedia.
// ══════════════════════════════════════════════════════════════════════════════

let sharedCtx = null;
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
 * AVANT tout `await`. Débloque définitivement la sortie audio iOS ET force
 * le routage vers le haut-parleur principal (pas l'écouteur).
 */
export function armIosAudio() {
  try {
    // 0) 🔊 FIX PRINCIPAL — Force la sortie sur le haut-parleur principal.
    //    Sans ça, iOS 17+ route l'audio WebRTC vers l'écouteur (voice-chat)
    //    et la voix de l'agent est quasi inaudible même au volume max.
    //    Doit être défini AVANT getUserMedia + AVANT de créer l'AudioContext.
    try {
      if (typeof navigator !== "undefined" && navigator.audioSession) {
        // 'play-and-record' + routing par défaut vers le haut-parleur (loud).
        navigator.audioSession.type = "play-and-record";
      }
    } catch {}

    // 1) AudioContext partagé + resume synchrone
    //    ⚠️ On NE crée PLUS d'oscillateur "keep-alive" : sur iOS, une source
    //    Web Audio active en continu maintient la session audio en état
    //    "voice-chat / earpiece" et casse le routage haut-parleur.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!sharedCtx || sharedCtx.state === "closed") {
        sharedCtx = new AudioCtx({ latencyHint: "interactive" });
      }
      if (sharedCtx.state === "suspended") {
        sharedCtx.resume().catch(() => {});
      }
    }

    // 2) <audio playsinline autoplay> primé — iOS n'autorise l'audio HTML
    //    distant que si l'élément a été "touché" par un user-gesture.
    if (!unlockAudioEl) {
      unlockAudioEl = document.createElement("audio");
      unlockAudioEl.setAttribute("playsinline", "");
      unlockAudioEl.setAttribute("webkit-playsinline", "");
      unlockAudioEl.autoplay = true;
      unlockAudioEl.muted = false;
      unlockAudioEl.volume = 1.0;
      unlockAudioEl.style.display = "none";
      // WAV mono 8kHz d'1 sample silencieux (base64)
      unlockAudioEl.src =
        "data:audio/wav;base64,UklGRhwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
      document.body.appendChild(unlockAudioEl);
    }
    const p = unlockAudioEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {});

    // 3) speechSynthesis ping — débloque la file TTS iOS au cas où
    try {
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch {}

    // 4) Installer le resume auto sur visibilitychange (une seule fois)
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
    // Ré-affirme le routage haut-parleur au retour foreground
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = "play-and-record";
      }
    } catch {}
    if (sharedCtx && sharedCtx.state === "suspended") {
      sharedCtx.resume().catch(() => {});
    }
    if (wakeLock === "wanted") acquireWakeLock().catch(() => {});
  });
  window.addEventListener?.("pageshow", () => {
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = "play-and-record";
      }
    } catch {}
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

export function haptic(pattern = 15) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {}
}
