// 🔄 UpdatePrompt.jsx — toast quand une nouvelle version du SW est dispo
import React, { useEffect, useState } from "react";

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Écoute l'événement dispatché par main.jsx en mode 'prompt'
    const handler = () => setReady(true);
    window.addEventListener("sw-update-available", handler);

    let swReg = null;
    let installingWorkers = [];
    
    const onUpdateFound = () => {
      if (!swReg) return;
      const nw = swReg.installing;
      if (!nw) return;
      
      const onStateChange = () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          setReady(true);
        }
      };
      nw.addEventListener("statechange", onStateChange);
      installingWorkers.push({ worker: nw, listener: onStateChange });
    };

    // Fallback : ancienne méthode via ServiceWorker API directe
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        swReg = reg;
        reg.addEventListener("updatefound", onUpdateFound);
        // Vérifie si un SW en attente existe déjà
        if (reg.waiting && navigator.serviceWorker.controller) {
          setReady(true);
        }
      });
    }

    return () => {
      window.removeEventListener("sw-update-available", handler);
      if (swReg) {
        swReg.removeEventListener("updatefound", onUpdateFound);
      }
      installingWorkers.forEach(({ worker, listener }) => {
        worker.removeEventListener("statechange", listener);
      });
    };
  }, []);

  const handleUpdate = () => {
    // Utilise la méthode propre de vite-plugin-pwa si dispo
    if (window.__SW_UPDATE__?.updateSW) {
      window.__SW_UPDATE__.updateSW();
    }
    // Force le reload après un court délai pour laisser le SW s'activer
    setTimeout(() => location.reload(), 300);
  };

  if (!ready) return null;
  return (
    <div style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 99999,
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      color: "#fff", padding: "14px 18px",
      borderRadius: 14,
      boxShadow: "0 10px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(99,102,241,.3)",
      display: "flex", gap: 12, alignItems: "center", fontSize: 13,
      animation: "slideIn 0.3s ease"
    }}>
      <span style={{ fontSize: 20 }}>🚀</span>
      <span>Nouvelle version disponible !</span>
      <button onClick={handleUpdate} style={{
        background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
        border: 0, color: "#fff", padding: "7px 14px",
        borderRadius: 8, cursor: "pointer", fontWeight: 700,
        fontSize: 12, letterSpacing: 0.5,
        transition: "opacity 0.2s"
      }}
        onMouseOver={e => e.target.style.opacity = "0.85"}
        onMouseOut={e => e.target.style.opacity = "1"}
      >
        Mettre à jour
      </button>
      <button onClick={() => setReady(false)} style={{
        background: "transparent", border: "1px solid rgba(255,255,255,.15)",
        color: "#94a3b8", padding: "5px 10px",
        borderRadius: 6, cursor: "pointer", fontSize: 11
      }}>
        Plus tard
      </button>
    </div>
  );
}
