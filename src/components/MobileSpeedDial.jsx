// 📱 MobileSpeedDial — Single round floating button that reveals a radial menu
// with all navigation destinations. Replaces the 5-button bottom nav.
//
// Props:
//   - view: current active view id
//   - onNavigate(id): switch view ('dashboard' | 'list' | 'lab' etc.)
//   - onOpenAddSheet(): open the Add bottom sheet (8 options)
//   - onOpenMoreDrawer(): open the existing "Plus" drawer
//   - isDarkMode: bool
//   - badges: optional { dashboard?: number, list?: number, ... }
import { useEffect, useState } from "react";

const DESTINATIONS = [
  { id: "dashboard", icon: "⚡", label: "Accueil" },
  { id: "list",      icon: "◈", label: "Fiches" },
  { id: "add",       icon: "＋", label: "Ajouter", isAdd: true },
  { id: "practice",  icon: "🗣️", label: "English" },
  { id: "lab",       icon: "🧪", label: "Lab" },
  { id: "more",      icon: "☰", label: "Plus", isMore: true },
];

export default function MobileSpeedDial({
  view,
  onNavigate,
  onOpenAddSheet,
  onOpenMoreDrawer,
  isDarkMode = true,
  badges = {},
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close when keyboard opens (visualViewport)
  useEffect(() => {
    const handler = () => {
      if (document.body.classList.contains("keyboard-open")) setOpen(false);
    };
    window.addEventListener("astral-keyboard", handler);
    return () => window.removeEventListener("astral-keyboard", handler);
  }, []);

  const activeDest = DESTINATIONS.find(d => d.id === view);
  const active = activeDest || DESTINATIONS[0];
  const totalBadges = Object.values(badges).reduce((a, b) => a + (b || 0), 0);

  const handlePick = (dest) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(8);
    setOpen(false);
    if (dest.isAdd) { onOpenAddSheet?.(); return; }
    if (dest.isMore) { onOpenMoreDrawer?.(); return; }
    onNavigate?.(dest.id);
  };

  // Radial fan layout (open upward). 5 buttons in an arc.
  // Angles span from ~-160° to -20° (upper hemisphere).
  const radius = 110;
  const start = -160;
  const end = -20;
  const step = (end - start) / (DESTINATIONS.length - 1);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="speed-dial-backdrop"
          style={{
            position: "fixed", inset: 0, zIndex: "var(--z-modal-backdrop, 180)",
            background: "rgba(5, 8, 22, 0.55)",
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            animation: "fadeIn .18s ease",
          }}
          aria-hidden="true"
        />
      )}

      {/* Radial buttons */}
      {open && (
        <div
          className="speed-dial-fan"
          style={{
            position: "fixed",
            left: "50%",
            bottom: "calc(var(--nav-h, 92px) - 32px + env(safe-area-inset-bottom, 0px))",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            zIndex: "var(--z-modal, 200)",
            pointerEvents: "none",
          }}
        >
          {DESTINATIONS.map((d, i) => {
            const angle = (start + step * i) * Math.PI / 180;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const isCurrent = d.id === view;
            const badge = badges[d.id];
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => handlePick(d)}
                aria-label={d.label}
                style={{
                  pointerEvents: "auto",
                  position: "absolute",
                  left: 0, top: 0,
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  width: 60, height: 60, borderRadius: 30,
                  border: "none",
                  background: isCurrent
                    ? "linear-gradient(135deg, #4D6BFE, #3451D1)"
                    : (isDarkMode ? "rgba(20, 25, 50, 0.95)" : "rgba(255,255,255,0.98)"),
                  color: isCurrent ? "#fff" : (isDarkMode ? "#eaf2ff" : "#1e293b"),
                  boxShadow: isCurrent
                    ? "0 12px 30px rgba(77,107,254,0.55), 0 0 0 2px rgba(255,255,255,0.18) inset"
                    : "0 10px 24px rgba(0,0,0,0.35)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 2, cursor: "pointer",
                  animation: `speedDialPop .28s cubic-bezier(0.34,1.56,0.64,1) ${i * 35}ms both`,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>{d.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.3 }}>{d.label}</span>
                {badge ? (
                  <span style={{
                    position: "absolute", top: -4, right: -4,
                    background: "#EF4444", color: "white",
                    borderRadius: 12, padding: "2px 6px",
                    fontSize: 9, fontWeight: 900, minWidth: 18, textAlign: "center",
                    boxShadow: "0 4px 12px rgba(239,68,68,0.45)",
                  }}>{badge}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Active label (above button when closed) */}
      {!open && activeDest && (
        <div
          className="speed-dial-label"
          style={{
            position: "fixed",
            left: "50%",
            bottom: "calc(var(--nav-h, 92px) + 14px + env(safe-area-inset-bottom, 0px))",
            transform: "translateX(-50%)",
            zIndex: "var(--z-nav, 100)",
            pointerEvents: "none",
            background: isDarkMode ? "rgba(22, 26, 45, 0.65)" : "rgba(255,255,255,0.75)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: isDarkMode ? "#ffffff" : "#1e293b",
            border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.8)"}`,
            padding: "8px 22px",
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.5,
            boxShadow: isDarkMode 
              ? "0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)"
              : "0 12px 30px rgba(77,107,254,0.15), inset 0 1px 0 rgba(255,255,255,1)",
            animation: "speedDialLabelEnter 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
          }}
        >
          <span style={{ fontSize: 16, filter: isDarkMode ? "drop-shadow(0 0 6px rgba(255,255,255,0.3))" : "none" }}>{active.icon}</span> 
          <span>{active.label}</span>
        </div>
      )}

      {/* Main round button */}
      <button
        type="button"
        className="speed-dial-trigger"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu de navigation"}
        aria-expanded={open}
        onClick={() => {
          if (window.navigator?.vibrate) window.navigator.vibrate(10);
          setOpen(o => !o);
        }}
        style={{
          position: "fixed",
          left: "50%",
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          transform: `translateX(-50%) ${open ? "rotate(135deg)" : "rotate(0deg)"}`,
          width: 64, height: 64, borderRadius: 32,
          border: "none",
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          color: "white",
          fontSize: 26, fontWeight: 900,
          cursor: "pointer",
          boxShadow: open
            ? "0 18px 50px rgba(124,58,237,0.55), 0 0 0 4px rgba(124,58,237,0.18)"
            : "0 14px 36px rgba(124,58,237,0.5), 0 0 0 1px rgba(255,255,255,0.15) inset",
          zIndex: "var(--z-fab, 190)",
          transition: "transform .3s cubic-bezier(0.34,1.56,0.64,1), box-shadow .25s ease",
          display: "flex", alignItems: "center", justifyContent: "center",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span style={{ lineHeight: 1 }}>{open ? "✕" : (active.icon || "＋")}</span>
        {!open && totalBadges > 0 && (
          <span style={{
            position: "absolute", top: 4, right: 4,
            background: "#EF4444", color: "white",
            borderRadius: 12, padding: "2px 6px",
            fontSize: 10, fontWeight: 900, minWidth: 18, textAlign: "center",
            boxShadow: "0 4px 12px rgba(239,68,68,0.5)",
          }}>{totalBadges > 99 ? "99+" : totalBadges}</span>
        )}
      </button>

      <style>{`
        @keyframes speedDialPop {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          to   { opacity: 1; }
        }
        @keyframes speedDialLabelEnter {
          from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .speed-dial-fan button,
          .speed-dial-trigger,
          .speed-dial-label { animation: none !important; transition: none !important; }
        }
      `}</style>
    </>
  );
}
