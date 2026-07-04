// 📡 OfflineBanner.jsx — toast éphémère (offline ET online)
import React, { useEffect, useRef, useState } from "react";
import { getNetworkStatus, onNetworkChange } from "../lib/networkStatus";

const OFFLINE_VISIBLE_MS = 4000;
const ONLINE_VISIBLE_MS = 2500;

export default function OfflineBanner() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState("offline"); // "offline" | "online"
  const lastOnlineRef = useRef(getNetworkStatus().online);
  const timerRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
    const showFor = (ms) => {
      clearTimer();
      setVisible(true);
      timerRef.current = setTimeout(() => setVisible(false), ms);
    };

    const unsubscribe = onNetworkChange((status) => {
      const wasOnline = lastOnlineRef.current;
      if (!status.online && wasOnline) {
        setMode("offline");
        showFor(OFFLINE_VISIBLE_MS);
      } else if (status.online && !wasOnline) {
        setMode("online");
        showFor(ONLINE_VISIBLE_MS);
      }
      lastOnlineRef.current = status.online;
    });

    // Au montage : si déjà hors-ligne, on affiche brièvement le bandeau hors-ligne.
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (!getNetworkStatus().online) {
        setMode("offline");
        showFor(OFFLINE_VISIBLE_MS);
      }
    }

    return () => { clearTimer(); unsubscribe && unsubscribe(); };
  }, []);

  if (!visible) return null;

  const isOffline = mode === "offline";
  const bg = isOffline ? "rgba(185, 28, 28, 0.92)" : "rgba(22, 163, 74, 0.92)";
  const border = isOffline ? "rgba(255, 168, 168, 0.35)" : "rgba(187, 247, 208, 0.4)";
  const label = isOffline
    ? "📡 Hors-ligne — révisions disponibles, sync auto au retour"
    : "✅ Connexion rétablie — synchronisation en cours";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "clamp(80px, env(safe-area-inset-bottom) + 80px, 100px)",
        zIndex: 99998,
        padding: "12px 20px",
        textAlign: "center",
        width: "max-content",
        maxWidth: "90%",
        background: bg,
        backdropFilter: "blur(12px)",
        color: "#fff",
        borderRadius: 100,
        border: `1px solid ${border}`,
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
        animation: "offlineToastIn 0.25s ease-out",
      }}
    >
      <style>{`@keyframes offlineToastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
      {label}
    </div>
  );
}
