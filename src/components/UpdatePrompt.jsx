// 🔄 UpdatePrompt.jsx — toast quand une nouvelle version du SW est dispo
import React, { useEffect, useState } from "react";

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
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

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        swReg = reg;
        reg.addEventListener("updatefound", onUpdateFound);
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
    if (updating) return;
    setUpdating(true);

    let reloaded = false;
    const doReload = () => {
      if (reloaded) return;
      reloaded = true;
      setReady(false);
      window.location.reload();
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", doReload, { once: true });
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      }).catch(() => {});
    }

    if (window.__SW_UPDATE__?.updateSW) {
      try { window.__SW_UPDATE__.updateSW(true); } catch {}
    }

    setTimeout(doReload, 1000);
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
      <span>{updating ? "Mise à jour en cours..." : "Nouvelle version disponible !"}</span>
      <button onClick={handleUpdate} disabled={updating} style={{
        background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
        border: 0, color: "#fff", padding: "7px 14px",
        borderRadius: 8, cursor: updating ? "wait" : "pointer", fontWeight: 700,
        fontSize: 12, letterSpacing: 0.5,
        opacity: updating ? 0.7 : 1,
        transition: "opacity 0.2s"
      }}
        onMouseOver={e => { if (!updating) e.target.style.opacity = "0.85"; }}
        onMouseOut={e => { if (!updating) e.target.style.opacity = "1"; }}
      >
        {updating ? "Patientez..." : "Mettre à jour"}
      </button>
      {!updating && (
        <button onClick={() => setReady(false)} style={{
          background: "transparent", border: "1px solid rgba(255,255,255,.15)",
          color: "#94a3b8", padding: "5px 10px",
          borderRadius: 6, cursor: "pointer", fontSize: 11
        }}>
          Plus tard
        </button>
      )}
    </div>
  );
}
