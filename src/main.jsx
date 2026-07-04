import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/design-system.css'
import './styles/responsive.css'
import './styles/mobile-ux-fix.css'
import './styles/mobile-redesign.css'
import App from './App.jsx'

// 🛡️ Hardening v2 — bootstrap des modules transverses
import { installTelemetry } from './lib/telemetry'
import { installPerfMonitor } from './lib/perfMonitor'
import { installMemoryGuard } from './lib/memoryGuard'
import { installDiagnostics } from './lib/diagnostics'
import { installCSPReporter } from './lib/csp'
import { installAudioUnlock } from './lib/english/audioUnlock'
import { installConsoleScrubber } from './lib/secretsScrubber'
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
}

// ── Hardening bootstrap (sans réseau, no-op si non supporté) ──────────────
try { installTelemetry(); } catch {}
try { installPerfMonitor(); } catch {}
try { installMemoryGuard(); } catch {}
try { installDiagnostics(); } catch {}
try { installCSPReporter(); } catch {}
try { installAudioUnlock(); } catch {}
if (import.meta.env.PROD) {
  try { installConsoleScrubber(); } catch {}
}

// ── Virtual-keyboard detection (iOS Safari + Android Chrome) ──────────────
if (typeof window !== "undefined" && window.visualViewport) {
  let lastOpen = false
  const sync = () => {
    const vv = window.visualViewport
    if (!vv) return
    const open = vv.height < window.innerHeight * 0.75
    if (open !== lastOpen) {
      lastOpen = open
      document.body.classList.toggle("keyboard-open", open)
      window.dispatchEvent(new CustomEvent("astral-keyboard", { detail: { open } }))
    }
  }
  window.visualViewport.addEventListener("resize", sync)
  window.visualViewport.addEventListener("scroll", sync)
}

import { registerSW } from 'virtual:pwa-register'

// ── Service Worker (offline shell + cache assets via Vite PWA) ─────────────
// Stratégie : auto-update silencieux + rechargement contrôlé pour ne JAMAIS
// rester bloqué sur une ancienne version après un deploy Firebase.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  let refreshing = false;
  // Quand le nouveau SW prend le contrôle, on recharge une seule fois.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
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
        try { r.update(); } catch {}
        // Re-check toutes les 60s quand la page est visible
        setInterval(async () => {
          try {
            if (document.visibilityState !== "visible") return;
            if (!navigator.onLine) return;
            await r.update();
          } catch {}
        }, 60 * 1000);
        // Re-check à chaque retour de focus / visibilité (post-deploy)
        const recheck = () => { try { r.update(); } catch {} };
        window.addEventListener("focus", recheck);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") recheck();
        });
      }
    },
  });
  // Expose globalement pour qu'UpdatePrompt puisse aussi déclencher la mise à jour manuellement
  window.__SW_UPDATE__ = { updateSW: () => updateSW(true) };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
