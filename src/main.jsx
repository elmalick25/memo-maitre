import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/design-system.css'
import './styles/responsive.css'
import './styles/mobile-ux-fix.css'
import './styles/mobile-redesign.css'
import './styles/practice-tabs.css'
import App from './App.jsx'
import './styles/sober-refit.css'

// 🛡️ Hardening v2 — bootstrap des modules transverses
import { installTelemetry } from './lib/telemetry'
import { installPerfMonitor } from './lib/perfMonitor'
import { installMemoryGuard } from './lib/memoryGuard'
import { installDiagnostics } from './lib/diagnostics'
import { installCSPReporter } from './lib/csp'
import { installAudioUnlock } from './lib/english/audioUnlock'
import { installConsoleScrubber } from './lib/secretsScrubber'
// 🧠 Poids FSRS personnels : le modèle de mémoire de CET utilisateur
// ────────────────────────────────────────────────────────────────────────
// L'optimiseur (lib/srs/optimizer.js) apprend les paramètres de mémoire à
// partir de l'historique réel de révisions, mais le résultat n'était jamais
// activé : l'app calculait toujours ses intervalles avec les poids par défaut.
// On les charge et on les active dès le démarrage, avant tout calcul de
// planning. Échec silencieux : on retombe sur les poids par défaut.
import { loadAndActivateWeights } from './lib/srs/weightsStore'
import { storage as appStorage } from './lib/firebase'
// 🧹 Libération immédiate du quota localStorage (purge résidus multi-tab Firestore orphelins sur iOS WebKit)
if (typeof window !== "undefined" && window.localStorage) {
  try {
    const keysToPurge = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("firestore_") || k.startsWith("firestore-"))) {
        keysToPurge.push(k);
      }
    }
    keysToPurge.forEach((k) => localStorage.removeItem(k));
  } catch { /* mode privé / strict */ }
}

// Titre d'onglet par défaut
if (typeof document !== "undefined") {
  document.title = "MemoMaster - El Malick"
}

// ── Filets de sécurité globaux : on log au lieu de planter ────────────────
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    try { console.warn("[window.error]", e?.message || e); } catch {}
  });
  window.addEventListener("unhandledrejection", (e) => {
    try { console.warn("[unhandledrejection]", e?.reason?.message || e?.reason || e); } catch {}
    e.preventDefault?.();
  });
  // 🛡️ Interception des erreurs de préchargement Vite (CSS ou chunks dynamiques hors-ligne)
  window.addEventListener("vite:preloadError", (event) => {
    const msg = String(event?.payload?.message || "");
    if (msg.includes("preload CSS") || (typeof navigator !== "undefined" && !navigator.onLine)) {
      event.preventDefault(); // Empêche le throw/rejet fatal dans React
      console.warn("[Vite] Préchargement intercepté hors-ligne :", msg);
    }
  });
}

// ── Hardening bootstrap (sans réseau, no-op si non supporté) ──────────────
try { installTelemetry(); } catch {}
try { installPerfMonitor(); } catch {}
try { installMemoryGuard(); } catch {}
try { installDiagnostics(); } catch {}
try { installCSPReporter(); } catch {}
try { installAudioUnlock(); } catch {}
loadAndActivateWeights(appStorage)
  .then((p) => {
    if (p?.optimizedAt) {
      console.info(`[FSRS] Poids personnels activés (optimisés le ${new Date(p.optimizedAt).toLocaleDateString('fr-FR')}, rétention cible ${p.targetRetention}).`)
    }
  })
  .catch(() => {})
if (import.meta.env.PROD) {
  try { installConsoleScrubber(); } catch {}
}

// ── Virtual-keyboard detection (iOS Safari + Android Chrome) ──────────────
if (typeof window !== "undefined" && window.visualViewport) {
  let lastOpen = false
  let lastKeyboardHeight = -1
  let rafId = null

  const sync = () => {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      const vv = window.visualViewport
      if (!vv) return
      const heightDiff = window.innerHeight - vv.height
      const open = heightDiff > 70
      const keyboardHeight = open ? Math.max(0, Math.round(heightDiff - (vv.offsetTop || 0))) : 0

      if (keyboardHeight !== lastKeyboardHeight) {
        lastKeyboardHeight = keyboardHeight
        if (document.documentElement) {
          document.documentElement.style.setProperty("--keyboard-offset", `${keyboardHeight}px`)
        }
      }

      if (open !== lastOpen) {
        lastOpen = open
        document.body.classList.toggle("keyboard-open", open)
        window.dispatchEvent(new CustomEvent("astral-keyboard", { detail: { open, keyboardHeight } }))
      }
    })
  }
  window.visualViewport.addEventListener("resize", sync, { passive: true })
  window.visualViewport.addEventListener("scroll", sync, { passive: true })
}

import { registerSW } from 'virtual:pwa-register'

// ── Service Worker (offline shell + cache assets via Vite PWA) ─────────────
// Stratégie : auto-update silencieux en PRODUCTION uniquement.
// En mode DEV, on désenregistre les Service Workers résiduels pour garantir que Vite HMR
// ne soit jamais intercepté ni ralenti par un ancien cache.
if (import.meta.env.PROD && typeof window !== "undefined" && "serviceWorker" in navigator) {
  let refreshing = false;
  // Au tout premier lancement il n'y a pas encore de SW : sa prise de contrôle
  // initiale ne doit PAS recharger la page (rechargement surprise au 1er usage).
  const hadController = Boolean(navigator.serviceWorker.controller);
  // Quand le nouveau SW prend le contrôle, on recharge une seule fois.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    try { location.reload(); } catch {}
  });

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Auto-apply : on active immédiatement le nouveau SW (skipWaiting).
      // controllerchange ci-dessus rechargera la page proprement.
      try { updateSW(true); } catch {}
      // Notifie quand même pour UI éventuelle
      window.dispatchEvent(new CustomEvent("sw-update-available", { detail: { updateSW } }));
    },
    onOfflineReady() {
      console.info("[SW] App prête pour usage hors-ligne.");
    },
    onRegisteredSW(swUrl, r) {
      // Force un check au chargement (utile après un deploy Firebase)
      if (r) {
        // r.update() renvoie une promesse qui rejette hors-ligne : on la neutralise.
        const safeUpdate = () => {
          if (!navigator.onLine) return;
          try { r.update()?.catch?.(() => {}); } catch {}
        };
        safeUpdate();
        // Re-check toutes les 60s quand la page est visible
        setInterval(async () => {
          try {
            if (document.visibilityState !== "visible") return;
            safeUpdate();
          } catch {}
        }, 60 * 1000);
        // Re-check à chaque retour de focus / visibilité (post-deploy)
        const recheck = safeUpdate;
        window.addEventListener("focus", recheck);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") recheck();
        });
      }
    },
  });
  // Expose globalement pour qu'UpdatePrompt puisse aussi déclencher la mise à jour manuellement
  window.__SW_UPDATE__ = { updateSW: () => updateSW(true) };
} else if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  // Mode DEV : nettoyage actif de tout ancien SW parasitant localhost
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().catch(() => {});
    }
  }).catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
