// iosVoiceHardening.js — Rend la conversation vocale robuste sur iOS
// ══════════════════════════════════════════════════════════════════════════════
// Le SDK LiveKit ouvre son AudioContext + attache la piste WebRTC distante
// APRÈS des `fetch()` async (signed URL / JWT). Sur iOS Safari, iOS Chrome
// (WKWebView) et les raccourcis d'écran d'accueil, ce moment est HORS du
// user-gesture initial : iOS mute alors silencieusement la sortie audio ET
// n'affiche PAS le prompt de permission micro → l'agent ne parle pas et le
// micro ne capte rien.
//
// La solution : dans le onClick, on doit SYNCHRONEMENT :
//   1. Créer + resume l'AudioContext.
//   2. Priming d'un <audio playsinline> avec .play().
//   3. **Appeler navigator.mediaDevices.getUserMedia({audio:true})**  ← clé
//      → iOS montre le prompt micro et grante la permission pendant le geste.
//      Le stream est stoppé aussitôt : LiveKit rappellera getUserMedia
//      quelques centaines de ms plus tard, mais la permission est déjà
//      acquise donc l'appel réussit sans nouveau geste.
//   4. (Safari 17.4+) navigator.audioSession.type = 'play-and-record' pour
//      forcer le routage vers le haut-parleur principal (pas l'écouteur).
// ══════════════════════════════════════════════════════════════════════════════

let sharedCtx = null;
let unlockAudioEl = null;
let wakeLock = null;
let visibilityHandlerInstalled = false;
let micPermissionPromise = null;
// 🎤 On garde la MediaStream réellement obtenue dans le user-gesture pour
// pouvoir la publier TELLE QUELLE via LiveKit (publishTrack) au lieu de
// laisser LiveKit rappeler getUserMedia() une 2e fois — c'est cette 2e
// acquisition qui, sur Chrome desktop / Android / iOS, renvoie parfois un
// track "vivant mais silencieux" (device stale, driver endormi, course
// entre le stop() du prewarm et la ré-acquisition).
let prewarmedMicStream = null;

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
 * Force la catégorie de session audio native sur "play-and-record" (API
 * WebKit `navigator.audioSession`, Safari 17.4+). Sans ça, iOS peut garder
 * la session dans une catégorie "lecture seule" même après l'activation du
 * micro : le track WebRTC local existe et LiveKit le considère "actif",
 * mais le hardware ne capte jamais vraiment le son (symptôme "micro actif
 * mais silencieux"). Cette API n'est pas garantie disponible dans TOUS les
 * navigateurs WebKit tiers sur iOS (ex. Chrome iOS peut ne pas l'exposer
 * selon les versions) — d'où l'intérêt de la rappeler à plusieurs moments
 * clés (arm initial, ET juste après l'activation réelle du micro) plutôt
 * qu'une seule fois, pour maximiser les chances qu'elle "prenne".
 */
export function forcePlayAndRecordSession() {
  try {
    if (typeof navigator !== "undefined" && navigator.audioSession) {
      navigator.audioSession.type = "play-and-record";
    }
  } catch {}
}

/**
 * DOIT être appelé de façon 100% synchrone dans un user-gesture (onClick)
 * AVANT tout `await`. Déverrouille définitivement la sortie audio iOS,
 * force le routage vers le haut-parleur principal, ET pré-obtient la
 * permission micro (indispensable sur iPhone Chrome / raccourci écran
 * d'accueil, où LiveKit ne pourrait sinon pas ouvrir getUserMedia).
 */
export function armIosAudio() {
  try {
    // 0) 🔊 Force la sortie sur le haut-parleur principal (Safari 17.4+).
    forcePlayAndRecordSession();

    // 1) AudioContext partagé + resume synchrone.
    const AudioCtx =
      typeof window !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext);
    if (AudioCtx) {
      if (!sharedCtx || sharedCtx.state === "closed") {
        sharedCtx = new AudioCtx({ latencyHint: "interactive" });
      }
      if (sharedCtx.state === "suspended") {
        sharedCtx.resume().catch(() => {});
      }
      // 🔑 Chrome iOS : jouer une bufferSource silencieuse SYNCHRONE
      // débloque le rendu audio distant WebRTC ultérieur.
      try {
        const buf = sharedCtx.createBuffer(1, 1, 22050);
        const src = sharedCtx.createBufferSource();
        src.buffer = buf;
        src.connect(sharedCtx.destination);
        src.start(0);
      } catch {}
    }

    // 2) <audio playsinline autoplay> primé
    if (typeof document !== "undefined" && !unlockAudioEl) {
      unlockAudioEl = document.createElement("audio");
      unlockAudioEl.setAttribute("playsinline", "");
      unlockAudioEl.setAttribute("webkit-playsinline", "");
      unlockAudioEl.autoplay = true;
      unlockAudioEl.muted = false;
      unlockAudioEl.volume = 1.0;
      unlockAudioEl.style.display = "none";
      unlockAudioEl.src =
        "data:audio/wav;base64,UklGRhwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
      document.body.appendChild(unlockAudioEl);
    }
    if (unlockAudioEl) {
      const p = unlockAudioEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }

    // 3) 🎤 Pré-obtenir la permission micro DANS le geste.
    //    C'est le fix critique pour iPhone Chrome / raccourci écran d'accueil :
    //    sans ça, LiveKit fait getUserMedia hors-geste et le prompt n'apparaît
    //    jamais → aucun capture track, et iOS coupe aussi la sortie audio.
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function" &&
        !micPermissionPromise &&
        isIos()
      ) {
        micPermissionPromise = navigator.mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          })
          .then((stream) => {
            // 🔑 On NE stoppe PLUS le stream : on le conserve pour que
            // LiveKit puisse le publier directement (publishTrack avec un
            // LocalAudioTrack construit à partir de ce MediaStreamTrack).
            // Ça élimine la 2e getUserMedia() de LiveKit et sa fenêtre de
            // course qui produisait des tracks silencieux.
            prewarmedMicStream = stream;
            return true;
          })
          .catch((e) => {
            console.warn("[iosVoiceHardening] mic prewarm denied:", e?.message);
            micPermissionPromise = null; // permet un nouvel essai
            return false;
          });
      }
    } catch (e) {
      console.warn("[iosVoiceHardening] mic prewarm failed:", e);
    }

    // 4) speechSynthesis ping (débloque la file TTS iOS au cas où)
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
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
    forcePlayAndRecordSession();
    if (sharedCtx && sharedCtx.state === "suspended") {
      sharedCtx.resume().catch(() => {});
    }
    if (wakeLock === "wanted") acquireWakeLock().catch(() => {});
  });
  window.addEventListener?.("pageshow", () => {
    forcePlayAndRecordSession();
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
 * Retourne la promesse du prewarm micro (ou null si jamais appelé).
 * Utile pour attendre que la permission soit accordée avant d'ouvrir
 * la session LiveKit.
 */
export function whenMicPermissionReady() {
  return micPermissionPromise || Promise.resolve(false);
}

/**
 * Retourne la MediaStream micro pré-obtenue dans le user-gesture (ou null).
 * Le premier appelant doit la consommer : elle est effacée du cache pour
 * éviter tout double-usage. Si le track a été fermé entre-temps
 * (revenue d'iOS après un long fond), on renvoie null → fallback classique.
 */
export function consumePrewarmedMicStream() {
  const s = prewarmedMicStream;
  prewarmedMicStream = null;
  if (!s) return null;
  const tracks = s.getAudioTracks?.() || [];
  const alive = tracks.some((t) => t.readyState === "live" && !t.muted);
  if (!alive) {
    try { tracks.forEach((t) => t.stop()); } catch {}
    return null;
  }
  return s;
}

/** Peek sans consommer — utile pour savoir si on a un stream utilisable. */
export function hasPrewarmedMicStream() {
  const tracks = prewarmedMicStream?.getAudioTracks?.() || [];
  return tracks.some((t) => t.readyState === "live");
}

/**
 * Choisit le type de connexion optimal selon batterie / réseau.
 */
export async function pickConnectionType() {
  try {
    const conn =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
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
