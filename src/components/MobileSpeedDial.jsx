// 📱 MobileSpeedDial — Single round floating button that reveals a radial menu
// with all navigation destinations. Replaces the 5-button bottom nav.
import { useEffect, useRef, useState } from "react";

const SUBVIEW_INFO = {
  veille: { icon: "📰", label: "Veille Tech" },
  bourses: { icon: "🎓", label: "Bourses" },
  oracle: { icon: "🔮", label: "Tech Oracle" },
  quests: { icon: "⚔️", label: "Quêtes" },
  stats: { icon: "▣", label: "Statistiques" },
  categories: { icon: "◉", label: "Modules" },
  badges: { icon: "🏆", label: "Badges" },
  certifications: { icon: "🎓", label: "Certifications" },
  opensource: { icon: "🚀", label: "Radar Open Source" },
};

const DESTINATIONS = [
  { id: "dashboard", icon: "⚡", label: "Accueil" },
  { id: "list",      icon: "🗂️", label: "Fiches" },
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
  const [tappedId, setTappedId] = useState(null);

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

  const activeDest = DESTINATIONS.find(d => d.id === view) || SUBVIEW_INFO[view];
  const active = activeDest || DESTINATIONS[0];
  const totalBadges = Object.values(badges).reduce((a, b) => a + (b || 0), 0);

  const lastPickRef = useRef({ id: null, at: 0 });

  const handlePick = (dest) => {
    // Garde anti double-déclenchement : sur mobile, onTouchEnd et onClick
    // peuvent tous deux se déclencher pour un seul tap.
    const now = Date.now();
    if (lastPickRef.current.id === dest.id && now - lastPickRef.current.at < 500) return;
    lastPickRef.current = { id: dest.id, at: now };
    if (window.navigator?.vibrate) {
      try { window.navigator.vibrate(15); } catch (_) {}
    }
    setOpen(false);
    if (dest.isAdd) { onOpenAddSheet?.(); return; }
    if (dest.isMore) { onOpenMoreDrawer?.(); return; }
    onNavigate?.(dest.id);
  };

  // Radial fan layout (open upward).
  const radius = 126;
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
            position: "fixed",
            inset: 0,
            zIndex: 190,
            background: isDarkMode ? "rgba(5, 8, 22, 0.65)" : "rgba(15, 23, 42, 0.35)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            animation: "fadeIn .18s ease",
          }}
          aria-hidden="true"
        />
      )}

      {/* Radial buttons orbiting around central button */}
      {open && (
        <>
          {/* Anneau orbital subtil marquant la géométrie circulaire */}
          <svg
            style={{
              position: "fixed",
              left: "50%",
              bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
              transform: "translate(-50%, 50%)",
              width: radius * 2 + 10,
              height: radius * 2 + 10,
              pointerEvents: "none",
              zIndex: 205,
            }}
            viewBox={`0 0 ${radius * 2 + 10} ${radius * 2 + 10}`}
            pointerEvents="none"
          >
            <circle
              cx={radius + 5}
              cy={radius + 5}
              r={radius}
              fill="none"
              stroke={isDarkMode ? "rgba(56, 189, 248, 0.18)" : "rgba(37, 99, 235, 0.16)"}
              strokeWidth="1.5"
              strokeDasharray="4 5"
              pointerEvents="none"
              style={{ pointerEvents: "none" }}
            />
          </svg>

          {DESTINATIONS.map((dest, i) => {
            const angleDeg = start + step * i;
            const angleRad = (angleDeg * Math.PI) / 180;
            const x = Math.round(Math.cos(angleRad) * radius);
            const y = Math.round(Math.sin(angleRad) * radius);
            const isCurrent = dest.id === view;
            const isTapped = tappedId === dest.id;
            const destBadge = badges[dest.id];

            return (
              <button
                key={dest.id}
                type="button"
                className="speed-dial-dest-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePick(dest);
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handlePick(dest);
                }}
                aria-label={dest.label}
                title={dest.label}
                style={{
                  position: "fixed",
                  left: `calc(50% + ${x}px)`,
                  bottom: `calc(60px + env(safe-area-inset-bottom, 0px) + ${-y}px)`,
                  transform: isTapped ? "translate(-50%, 50%) scale(0.88)" : "translate(-50%, 50%) scale(1)",
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  border: isTapped
                    ? "2.5px solid #38BDF8"
                    : (isCurrent
                      ? "2px solid #38BDF8"
                      : `1.5px solid ${isDarkMode ? "rgba(255,255,255,0.18)" : "rgba(37, 99, 235, 0.22)"}`),
                  background: isTapped
                    ? "linear-gradient(135deg, #38BDF8, #0284C7)"
                    : (isDarkMode
                      ? (isCurrent ? "linear-gradient(135deg, #0284C7, #0369A1)" : "rgba(22, 30, 49, 0.92)")
                      : (isCurrent ? "linear-gradient(135deg, var(--mm-primary, #2563eb), var(--mm-primary-deep, #1d4ed8))" : "rgba(255, 255, 255, 0.98)")),
                  color: (isTapped || isCurrent) ? "#ffffff" : (isDarkMode ? "#E2E8F0" : "#0F172A"),
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  boxShadow: isTapped
                    ? "0 0 24px rgba(56, 189, 248, 0.8), inset 0 0 12px rgba(255,255,255,0.9)"
                    : (isDarkMode
                      ? "0 10px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)"
                      : (isCurrent
                        ? "0 10px 24px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255,255,255,0.4)"
                        : "0 8px 20px rgba(37, 99, 235, 0.18), inset 0 1px 0 rgba(255,255,255,0.95)")),
                  cursor: "pointer",
                  pointerEvents: "auto",
                  zIndex: 215,
                  animation: `speedDialPop 0.24s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 18}ms both`,
                  transition: "transform 0.1s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.1s ease, border 0.1s ease",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{dest.icon}</span>
                <span
                  style={{
                    fontSize: 7.5,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.2px",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "clip",
                    maxWidth: 46,
                    textAlign: "center",
                    opacity: isCurrent ? 1 : 0.88,
                  }}
                >
                  {dest.label}
                </span>

                {destBadge > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -3,
                      right: 1,
                      background: "linear-gradient(135deg, #EF4444, #DC2626)",
                      color: "white",
                      borderRadius: 10,
                      padding: "1px 5px",
                      fontSize: 9,
                      fontWeight: 900,
                      minWidth: 16,
                      textAlign: "center",
                      boxShadow: "0 2px 6px rgba(239,68,68,0.4)",
                      pointerEvents: "none",
                    }}
                  >
                    {destBadge > 99 ? "99+" : destBadge}
                  </span>
                )}
              </button>
            );
          })}
        </>
      )}

      {/* Conteneur d'ancrage plein écran : garantit un centrage mathématique absolu au pixel près sur iPhone */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          width: "100%",
          bottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 220,
        }}
      >
        {/* Bouton principal rond (Liquid Glass FAB) */}
        <button
          type="button"
          className="speed-dial-trigger"
          aria-label={open ? "Fermer le menu des vues" : "Ouvrir le menu des vues"}
          aria-expanded={open}
          onClick={() => {
            if (window.navigator?.vibrate) window.navigator.vibrate(10);
            setOpen((o) => !o);
          }}
          style={{
            pointerEvents: "auto",
            position: "relative",
            width: 56,
            height: 56,
            borderRadius: 28,
            border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.85)"}`,
            background: "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary-deep, #1D4ED8) 100%)",
            color: "white",
            fontSize: 24,
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: open
              ? "0 16px 40px rgba(37, 99, 235, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)"
              : "0 10px 28px rgba(37, 99, 235, 0.38), inset 0 1px 0 rgba(255,255,255,0.25)",
            transition: "transform .3s cubic-bezier(0.34,1.56,0.64,1), box-shadow .25s ease",
            transform: open ? "rotate(135deg)" : "rotate(0deg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span style={{ lineHeight: 1 }}>{open ? "✕" : (active.icon || "＋")}</span>
          {!open && totalBadges > 0 && (
            <span
              style={{
                position: "absolute",
                top: -3,
                right: -3,
                background: "linear-gradient(135deg, #EF4444, #DC2626)",
                color: "white",
                borderRadius: 10,
                padding: "2px 6px",
                fontSize: 10,
                fontWeight: 800,
                minWidth: 18,
                textAlign: "center",
                boxShadow: `0 2px 8px rgba(239,68,68,0.4), 0 0 0 2px ${isDarkMode ? "#0B1120" : "#FFFFFF"}`,
                fontVariantNumeric: "tabular-nums",
                pointerEvents: "none",
              }}
            >
              {totalBadges > 99 ? "99+" : totalBadges}
            </span>
          )}
        </button>

        {/* Micro-label sous le bouton indiquant qu'il permet de voir les autres vues */}
        <span
          onClick={() => setOpen((o) => !o)}
          style={{
            pointerEvents: "auto",
            marginTop: 4,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: isDarkMode ? "rgba(255,255,255,0.85)" : "#334155",
            background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "rgba(255, 255, 255, 0.9)",
            padding: "2px 10px",
            borderRadius: 999,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(203,213,225,0.8)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          {open ? "Fermer" : "Vues"}
        </span>
      </div>

      <style>{`
        @keyframes speedDialPop {
          from { opacity: 0; transform: translate(-50%, 50%) scale(0.2); }
          to   { opacity: 1; transform: translate(-50%, 50%) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .speed-dial-fan button,
          .speed-dial-trigger { animation: none !important; transition: none !important; }
        }
      `}</style>
    </>
  );
}
