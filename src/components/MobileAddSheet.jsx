// 📱 MobileAddSheet — Bottom sheet 2×4 grid for the 8 Ajouter sub-views.
// Opens from the Speed Dial "Ajouter" tap. Picking a tile switches
// view to "add" + sets the addSubView accordingly.
import { useEffect } from "react";

const TILES = [
  { id: "single",     icon: "✦", label: "Fiche unique",   color: "linear-gradient(135deg,#3451D1,#4D6BFE)" },
  { id: "chat",       icon: "💬", label: "Copilot IA",    color: "linear-gradient(135deg,#7c3aed,#a78bfa)" },
  { id: "batch",      icon: "🚀", label: "Batch IA",      color: "linear-gradient(135deg,#0ea5e9,#38bdf8)" },
  { id: "text",       icon: "📄", label: "Depuis texte",  color: "linear-gradient(135deg,#f59e0b,#fbbf24)" },
  { id: "file",       icon: "📎", label: "Vision IA",     color: "linear-gradient(135deg,#10b981,#34d399)" },
  { id: "multimedia", icon: "🎨", label: "Multimédia",    color: "linear-gradient(135deg,#ef4444,#f87171)" },
  { id: "templates",  icon: "📋", label: "Templates",     color: "linear-gradient(135deg,#6366f1,#818cf8)" },
  { id: "quickadd",   icon: "⚡", label: "Quick Add",     color: "linear-gradient(135deg,#ec4899,#f472b6)" },
];

export default function MobileAddSheet({
  open,
  onClose,
  onPick,            // (subViewId) => void
  isDarkMode = true,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          zIndex: "var(--z-modal-backdrop, 180)",
          background: "rgba(5,8,22,0.55)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          animation: "fadeIn .2s ease",
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Ajouter une fiche"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          zIndex: "var(--z-modal, 200)",
          background: isDarkMode ? "#0B1120" : "#FFFFFF",
          borderRadius: "28px 28px 0 0",
          padding: "16px 18px calc(28px + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -16px 50px rgba(0,0,0,0.45)",
          animation: "drawerUp .32s cubic-bezier(0.34,1.56,0.64,1)",
          maxHeight: "82vh", overflowY: "auto",
        }}
      >
        <div style={{
          width: 44, height: 5,
          background: isDarkMode ? "rgba(255,255,255,0.18)" : "rgba(77,107,254,0.18)",
          borderRadius: 3, margin: "4px auto 18px",
        }} />

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 18,
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: isDarkMode ? "#eaf2ff" : "#1e293b" }}>
              ＋ Ajouter
            </div>
            <div style={{ fontSize: 12, color: isDarkMode ? "#a5b4fc" : "#64748b", marginTop: 2 }}>
              Choisis comment créer ta fiche
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 36, height: 36, borderRadius: 18,
              border: "none",
              background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
              color: isDarkMode ? "#eaf2ff" : "#1e293b",
              fontSize: 16, fontWeight: 700, cursor: "pointer",
            }}
          >✕</button>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}>
          {TILES.map((t) => (
            <button
              key={t.id}
              onClick={() => { onPick?.(t.id); onClose?.(); }}
              style={{
                background: t.color,
                color: "white",
                border: "none",
                borderRadius: 20,
                padding: "20px 16px",
                cursor: "pointer",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 8,
                minHeight: 100,
                fontWeight: 800,
                boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
              }}
            >
              <span style={{ fontSize: 30, lineHeight: 1 }}>{t.icon}</span>
              <span style={{ fontSize: 13, letterSpacing: 0.2 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
