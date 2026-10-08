import React, { useRef } from "react";
import MobileSpeedDial from "./MobileSpeedDial";
import MobileAddSheet from "./MobileAddSheet";
import { isDue } from "../lib/fsrs";
import { today } from "../utils/dateUtils";

const formatPomodoro = (secs) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

export default function AppMobileNav({
  isMobile = false,
  view = "dashboard",
  setView = () => {},
  isDarkMode = false,
  theme = {},
  expressions = [],
  sessionRemainingCount = 0,
  duePileSize = 0,
  masteredCount = 0,
  mobileDrawerOpen = false,
  setMobileDrawerOpen = () => {},
  setMobileFabOpen = () => {},
  mobileAddSheetOpen = false,
  setMobileAddSheetOpen = () => {},
  navigate = () => {},
  searchQuery = "",
  setSearchQuery = () => {},
  unlockedBadges = [],
  lastViewedBadgesCount = 0,
  projectPomodoroTime = 50 * 60,
  projectPomodoroTotal = 50 * 60,
  projectPomodoroActive = false,
  setProjectPomodoroActive = () => {},
  projectPomodoroMode = "study",
}) {
  const touchStartY = useRef(0);

  if (!isMobile) return null;

  const dueCount = expressions.filter(
    (e) => isDue(e.nextReview, today()) && (e.level || 0) < 7 && !e.paused
  ).length;

  return (
    <>
      <MobileSpeedDial
        view={view}
        isDarkMode={isDarkMode}
        badges={{
          dashboard: sessionRemainingCount,
          list: dueCount > 0 ? dueCount : 0,
        }}
        onNavigate={(id) => {
          setMobileDrawerOpen(false);
          setMobileFabOpen(false);
          setView(id);
          navigate?.(id);
          if (id === "dashboard" || id === "home") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
        onOpenAddSheet={() => {
          setMobileDrawerOpen(false);
          setMobileFabOpen(false);
          if (typeof setMobileAddSheetOpen === "function") {
            setMobileAddSheetOpen(true);
          } else {
            setView("add");
          }
        }}
        onOpenMoreDrawer={() => {
          setMobileFabOpen(false);
          setMobileDrawerOpen(true);
        }}
      />

      <MobileAddSheet
        open={mobileAddSheetOpen}
        isDarkMode={isDarkMode}
        onClose={() => setMobileAddSheetOpen(false)}
        onPick={(subId) => {
          navigate(`add/${subId}`);
        }}
      />

      {mobileDrawerOpen && (
        <>
          <div
            className="mobile-drawer-overlay"
            onClick={() => setMobileDrawerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 198,
              backdropFilter: "blur(4px)",
            }}
          />
          <div
            className="mobile-drawer-overlay"
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 199,
              background: isDarkMode ? "#0B1120" : "#FFFFFF",
              borderRadius: "32px 32px 0 0",
              padding: "24px 20px 40px",
              animation: "drawerUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 -10px 40px color-mix(in srgb, var(--mm-primary) 20.0%, transparent)",
            }}
            onTouchStart={(e) => {
              touchStartY.current = e.touches[0].clientY;
            }}
            onTouchEnd={(e) => {
              const dy = e.changedTouches[0].clientY - touchStartY.current;
              if (dy > 50) {
                setMobileDrawerOpen(false);
              }
            }}
          >
            {/* Handle */}
            <div
              style={{
                width: 48,
                height: 5,
                background: isDarkMode ? "rgba(255,255,255,0.2)" : "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)",
                borderRadius: 3,
                margin: "0 auto 24px",
              }}
            />

            {/* Recherche rapide depuis le drawer */}
            <div style={{ marginBottom: 16, position: "relative" }}>
              <input
                type="text"
                placeholder="🔍 Recherche rapide..."
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: isDarkMode ? "rgba(255,255,255,0.05)" : "color-mix(in srgb, var(--mm-primary) 5.0%, transparent)",
                  border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)"}`,
                  borderRadius: 16,
                  color: theme?.text || "#0F172A",
                  fontSize: 15,
                  outline: "none",
                }}
                value={searchQuery}
                onChange={(e) => {
                  // Ne ferme plus le drawer à chaque frappe : on laisse
                  // l'utilisateur taper sa recherche complète.
                  setSearchQuery(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setView("list");
                    setMobileDrawerOpen(false);
                  }
                }}
              />
              {searchQuery && (
                <span
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    color: theme?.text || "#0F172A",
                    cursor: "pointer",
                    fontSize: 16,
                  }}
                >
                  ✕
                </span>
              )}
            </div>

            {/* Section Apprentissage */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: theme?.textMuted || "#64748B",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 12,
                paddingLeft: 4,
              }}
            >
              Apprentissage
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { id: "practice", icon: "🗣️", label: "English" },
                { id: "veille", icon: "📰", label: "Actualités" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    setMobileDrawerOpen(false);
                  }}
                  style={{
                    background:
                      view === item.id
                        ? (isDarkMode ? "rgba(255,255,255,0.1)" : "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)")
                        : (isDarkMode ? "rgba(255,255,255,0.03)" : "color-mix(in srgb, var(--mm-primary) 5.0%, transparent)"),
                    border: `1px solid ${
                      view === item.id
                        ? (theme?.highlight || "var(--mm-primary)")
                        : (isDarkMode ? "rgba(255,255,255,0.05)" : "color-mix(in srgb, var(--mm-primary) 5.0%, transparent)")
                    }`,
                    borderRadius: 18,
                    color: view === item.id ? (theme?.highlight || "var(--mm-primary)") : (theme?.text || "#0F172A"),
                    padding: "16px 8px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <span style={{ fontSize: 26 }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>

            {/* Section Analyse & Intelligence */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: theme?.textMuted || "#64748B",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 12,
                paddingLeft: 4,
              }}
            >
              Analyse & IA
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { id: "categories", icon: "◉", label: "Modules" },
                { id: "stats", icon: "▣", label: "Stats" },
                {
                  id: "badges",
                  icon: "🏆",
                  label: "Badges",
                  badge: unlockedBadges.length - lastViewedBadgesCount > 0 ? unlockedBadges.length - lastViewedBadgesCount : null,
                },
                { id: "certifications", icon: "🎓", label: "Certifs", badge: 3 },
                { id: "opensource", icon: "🚀", label: "Radar OS" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    setMobileDrawerOpen(false);
                  }}
                  style={{
                    background:
                      view === item.id
                        ? (isDarkMode ? "rgba(255,255,255,0.1)" : "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)")
                        : (isDarkMode ? "rgba(255,255,255,0.03)" : "color-mix(in srgb, var(--mm-primary) 5.0%, transparent)"),
                    border: `1px solid ${
                      view === item.id
                        ? (theme?.highlight || "var(--mm-primary)")
                        : (isDarkMode ? "rgba(255,255,255,0.05)" : "color-mix(in srgb, var(--mm-primary) 5.0%, transparent)")
                    }`,
                    borderRadius: 18,
                    color: view === item.id ? (theme?.highlight || "var(--mm-primary)") : (theme?.text || "#0F172A"),
                    padding: "16px 8px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    position: "relative",
                  }}
                >
                  <span style={{ fontSize: 26 }}>{item.icon}</span>
                  {item.label}
                  {item.badge > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "#EF4444",
                        color: "white",
                        borderRadius: 20,
                        padding: "2px 6px",
                        fontSize: 10,
                        fontWeight: 900,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Maîtrise globale mini */}
            {expressions.length > 0 && (
              <div
                style={{
                  background: isDarkMode ? "rgba(255,255,255,0.05)" : "color-mix(in srgb, var(--mm-primary) 5.0%, transparent)",
                  borderRadius: 18,
                  padding: "16px 20px",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: theme?.textMuted || "#64748B", fontWeight: 700 }}>MAÎTRISE GLOBALE</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: theme?.highlight || "var(--mm-primary)" }}>
                    {expressions.length > 0 ? Math.round((masteredCount / expressions.length) * 100) : 0}%
                  </span>
                </div>
                <div style={{ height: 6, background: isDarkMode ? "rgba(255,255,255,0.1)" : "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)", borderRadius: 3 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${expressions.length > 0 ? Math.round((masteredCount / expressions.length) * 100) : 0}%`,
                      background: "linear-gradient(90deg,var(--mm-primary-glow),var(--mm-primary))",
                      borderRadius: 3,
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: theme?.textMuted || "#64748B", fontWeight: 600 }}>
                  <span>{masteredCount} maîtrisées</span>
                  <span>{duePileSize} dues au total</span>
                </div>
              </div>
            )}

            {/* Pomodoro dans drawer si actif */}
            {(projectPomodoroTime < projectPomodoroTotal || projectPomodoroActive) && (
              <div
                style={{
                  background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 15.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)",
                  borderRadius: 18,
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  border: `1px solid ${isDarkMode ? "color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 15.0%, transparent)"}`,
                }}
              >
                <span style={{ fontSize: 20 }}>{projectPomodoroMode === "study" ? "📚" : projectPomodoroMode === "project" ? "🗂️" : "☕"}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, color: theme?.highlight || "var(--mm-primary)", fontWeight: 800, flex: 1 }}>
                  {formatPomodoro(projectPomodoroTime)}
                </span>
                <button
                  onClick={() => setProjectPomodoroActive((a) => !a)}
                  style={{ background: "none", border: "none", color: theme?.highlight || "var(--mm-primary)", cursor: "pointer", fontSize: 24 }}
                >
                  {projectPomodoroActive ? "⏸" : "▶"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
