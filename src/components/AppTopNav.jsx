import React from "react";

export default function AppTopNav({
  isMobile = false,
  isScrolled = false,
  isDarkMode = false,
  zenFocusMode = false,
  stamina = 100,
  toast = null,
  setCmdOpen = () => {},
  showToast = () => {},
  sessionRemainingCount = 0,
  sessionPlannedToday = 0,
  duePileSize = 0,
}) {
  if (isMobile) return null;

  return (
    <nav
      className="nav-top"
      style={{
        background: isDarkMode ? "#070D1F" : "var(--mm-primary)",
        backdropFilter: isScrolled ? "blur(32px)" : "blur(24px)",
        WebkitBackdropFilter: isScrolled ? "blur(32px)" : "blur(24px)",
        padding: isScrolled ? "0 20px" : "0 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        minHeight: isScrolled ? 54 : 68,
        borderBottom: `1px solid ${isDarkMode ? "color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "rgba(255,255,255,0.15)"}`,
        transform: zenFocusMode ? "translateY(-100%)" : "translateY(0)",
        opacity: zenFocusMode ? 0 : 1,
        pointerEvents: zenFocusMode ? "none" : "auto",
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Ligne d'Énergie (Stamina) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          width: `${stamina}%`,
          background: stamina > 50 ? "#4ADE80" : stamina > 20 ? "#FACC15" : "#EF4444",
          boxShadow: `0 0 12px ${stamina > 50 ? "#4ADE80" : stamina > 20 ? "#FACC15" : "#EF4444"}`,
          transition: "background 1s ease, box-shadow 1s ease, width 1s ease",
          zIndex: 101,
        }}
      />

      {/* Gauche : Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, width: "30%" }}>
        <div
          style={{
            width: isScrolled ? 32 : 40,
            height: isScrolled ? 32 : 40,
            background: "rgba(255,255,255,0.22)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: isScrolled ? 14 : 17,
            fontWeight: 900,
            color: "white",
            fontFamily: "'Fira Code', monospace",
            boxShadow: "0 2px 12px color-mix(in srgb, var(--mm-primary) 20.0%, transparent)",
            transition: "all 0.3s",
          }}
        >
          M²
        </div>
        <div className="nav-text-container" style={{ opacity: isScrolled ? 0 : 1, width: isScrolled ? 0 : "auto", overflow: "hidden", transition: "all 0.3s" }}>
          <div className="nav-logo-text" style={{ fontSize: 19, fontWeight: 800, color: "white", letterSpacing: "-0.5px", whiteSpace: "nowrap" }}>
            MémoMaître
          </div>
          <div className="nav-title-sub" style={{ fontSize: 10, color: "rgba(199,210,254,0.85)", fontFamily: "'Fira Code', monospace", letterSpacing: 1.2, whiteSpace: "nowrap" }}>
            GOD LEVEL HUD
          </div>
        </div>
      </div>

      {/* Centre : Dynamic Island / Omni-Bar */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", zIndex: 102 }}>
        <div
          onClick={() => {
            if (!toast) setCmdOpen(true);
          }}
          className="search-bar-mobile"
          style={{
            display: (isMobile && !toast) ? "none" : "flex",
            alignItems: "center",
            gap: 12,
            background: toast
              ? (toast.type === "error" ? "rgba(239,68,68,0.95)" : "color-mix(in srgb, var(--mm-primary) 95.0%, transparent)")
              : (isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.2)"),
            border: toast
              ? "1px solid transparent"
              : (isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.3)"),
            padding: toast ? "12px 24px" : (isScrolled ? "6px 16px" : "8px 20px"),
            borderRadius: 24,
            cursor: toast ? "default" : "pointer",
            width: toast ? "auto" : (isScrolled ? 280 : 380),
            maxWidth: 600,
            transform: toast ? "translateY(8px)" : "translateY(0)",
            boxShadow: toast ? "0 14px 32px rgba(0,0,0,0.3)" : "none",
            transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          {toast ? (
            <>
              <span style={{ fontSize: 18 }}>{toast.type === "error" ? "🚨" : "✨"}</span>
              <span style={{ color: "white", fontWeight: 700, fontSize: 14 }}>{toast.msg}</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 14 }}>🔍</span>
              <span className="hide-mobile" style={{ flex: 1, fontSize: 13, color: isDarkMode ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Chercher un concept, demander à l'IA...
              </span>
              <span className="show-mobile-only" style={{ flex: 1, fontSize: 13, color: isDarkMode ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.8)" }}>Rechercher...</span>
              <kbd style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", background: "color-mix(in srgb, var(--mm-primary) 20.0%, transparent)", padding: "3px 6px", borderRadius: 6, color: "white", fontWeight: 800 }}>⌘K</kbd>
            </>
          )}
        </div>
      </div>

      {/* Droite : Badges de statuts HUD */}
      <div style={{ width: "30%", display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", transition: "opacity 0.3s", opacity: isScrolled ? 0.6 : 1 }}>
        {sessionRemainingCount > 0 && (
          <span
            style={{
              background: "rgba(255,255,255,0.25)",
              color: "white",
              borderRadius: 20,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 900,
              backdropFilter: "blur(4px)",
            }}
            title={`Plan du jour : ${sessionRemainingCount} fiche(s) restante(s) sur ${sessionPlannedToday} prévues — ${duePileSize} dues au total`}
          >
            ⚡ {sessionRemainingCount}
          </span>
        )}
      </div>
    </nav>
  );
}
