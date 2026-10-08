import React from "react";
import { getArchetype, BADGES } from "../constants/gamification";
import { isDue } from "../lib/fsrs";
import { today } from "../utils/dateUtils";

const formatPomodoro = (secs) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

export default function AppSidebar({
  zenFocusMode = false,
  sidebarCollapsed = false,
  setSidebarCollapsed = () => {},
  isDarkMode = false,
  theme = {},
  powerLevel = 0,
  expressions = [],
  projects = [],
  categories = [],
  sessionRemainingCount = 0,
  sessionPlannedToday = 0,
  duePileSize = 0,
  masteredCount = 0,
  unlockedBadges = [],
  lastViewedBadgesCount = 0,
  editingId = null,
  view = "dashboard",
  setView = () => {},
  setProjectSubView = () => {},
  navigate = () => {},
  projectPomodoroTime = 1500,
  projectPomodoroActive = false,
  setProjectPomodoroActive = () => {},
  projectPomodoroMode = "study",
  projectConflicts = [],
  sidebarClock = "12:00",
}) {
  const archetype = getArchetype(powerLevel);
  const dueCount = expressions.filter((e) => isDue(e.nextReview, today()) && (e.level || 0) < 7 && !e.paused).length;
  const totalCards = expressions.length;
  const masteredPct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;

  const NAV_GROUPS = [
    {
      items: [
        { id: "dashboard", icon: "⚡", label: "Accueil", badge: sessionRemainingCount > 0 ? sessionRemainingCount : null, badgeColor: "#A855F7", shortcut: "1", hint: `${sessionRemainingCount} fiche(s) restante(s) sur ${sessionPlannedToday} au programme du jour` },
        { id: "add", icon: "✦", label: editingId ? "Éditer" : "Ajouter", shortcut: "2", hint: "Créer une nouvelle fiche" },
        { id: "list", icon: "◈", label: "Fiches", badge: dueCount > 0 ? dueCount : null, badgeColor: "#EF4444", shortcut: "3", hint: `${totalCards} fiches • ${dueCount} en retard` },
        { id: "categories", icon: "◉", label: "Modules", shortcut: "4", hint: `${categories.length} modules` },
        { id: "certifications", icon: "🎓", label: "Certifications", badge: "3", badgeColor: "#EF4444", shortcut: "5", hint: "Boost ton CV" },
      ],
    },
    {
      label: "Apprentissage",
      items: [
        { id: "practice", icon: "🗣️", label: "English", shortcut: "6", hint: "Pratique conversationnelle" },
        { id: "veille", icon: "📰", label: "Actualités", shortcut: "7", hint: "Veille tech & IA en temps réel" },
        { id: "opensource", icon: "🚀", label: "Radar OS", shortcut: "8", hint: "Trouve ta PR" },
      ],
    },
    {
      label: "Analyse",
      items: [
        { id: "stats", icon: "▣", label: "Stats", shortcut: "9", hint: "Statistiques FSRS détaillées" },
        { id: "badges", icon: "🏆", label: "Badges", badge: (unlockedBadges.length - lastViewedBadgesCount) > 0 ? (unlockedBadges.length - lastViewedBadgesCount) : null, badgeColor: "#EF4444", hint: `${unlockedBadges.length} débloqués` },
        { id: "lab", icon: "🧪", label: "Lab", hint: "PDF, résumés, outils IA" },
      ],
    },
  ];

  return (
    <>
      {/* Spacer pour compenser la sidebar fixe */}
      <div
        className="desktop-sidebar-spacer"
        style={{
          width: zenFocusMode ? 0 : (sidebarCollapsed ? 72 + 24 : 205 + 24),
          minWidth: zenFocusMode ? 0 : (sidebarCollapsed ? 72 + 24 : 205 + 24),
          flexShrink: 0,
          transition: "width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      />

      {/* Sidebar fixe */}
      <aside
        className="desktop-sidebar"
        style={{
          width: sidebarCollapsed ? 72 : 205,
          minWidth: sidebarCollapsed ? 72 : 205,
          background: isDarkMode ? "rgba(13, 21, 53, 0.55)" : "rgba(255, 255, 255, 0.65)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 84,
          left: 16,
          height: "calc(100vh - 100px)",
          borderRadius: 24,
          overflow: "hidden",
          transform: zenFocusMode ? "translateX(-150%)" : "translateX(0)",
          opacity: zenFocusMode ? 0 : 1,
          pointerEvents: zenFocusMode ? "none" : "auto",
          transition: "width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)",
          zIndex: 50,
          flexShrink: 0,
          border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(139, 92, 246,0.15)",
          boxShadow: isDarkMode ? "0 24px 40px rgba(0,0,0,0.4)" : "0 24px 40px rgba(124, 58, 237,0.15)",
        }}
      >
        {/* RPG Avatar (Nexus Header) */}
        <div
          style={{
            padding: sidebarCollapsed ? "20px 0 14px" : "16px 14px 14px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderBottom: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(139, 92, 246,0.1)",
            transition: "padding 0.3s",
            cursor: "pointer",
          }}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? "Développer la sidebar" : "Réduire la sidebar"}
        >
          <div style={{ position: "relative", width: sidebarCollapsed ? 40 : 46, height: sidebarCollapsed ? 40 : 46, flexShrink: 0, margin: sidebarCollapsed ? "0 auto" : "0", transition: "all 0.3s" }}>
            <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
              <circle cx="18" cy="18" r="16" fill="none" stroke={isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(139,92,246,0.15)"} strokeWidth="2.5" />
              <circle cx="18" cy="18" r="16" fill="none" stroke={theme?.highlight || "#8B5CF6"} strokeWidth="2.5" strokeDasharray={`${archetype.progress} 100`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: sidebarCollapsed ? 20 : 24, transition: "font-size 0.3s" }}>
              {archetype.icon}
            </div>
          </div>
          {!sidebarCollapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: isDarkMode ? "white" : (theme?.text || "#0F172A"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {archetype.title}
              </div>
              <div style={{ fontSize: 10.5, color: isDarkMode ? "rgba(255,255,255,0.6)" : (theme?.textMuted || "#64748B"), fontWeight: 700, marginTop: 2 }}>
                Niv. {archetype.level} <span style={{ opacity: 0.5 }}>•</span> {powerLevel} XP
              </div>
            </div>
          )}
        </div>

        {/* Nav items (Scrollable) */}
        <div className="sidebar-nav-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "visible", paddingBottom: 16, paddingRight: 6 }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 8, padding: "0 12px" }}>
              {group.label && !sidebarCollapsed && (
                <div style={{ fontSize: 10, fontWeight: 800, color: isDarkMode ? "rgba(255,255,255,0.4)" : (theme?.textMuted || "#64748B"), letterSpacing: 1.5, textTransform: "uppercase", padding: "16px 12px 6px" }}>
                  {group.label}
                </div>
              )}
              {group.label && sidebarCollapsed && <div style={{ height: 1, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(139, 92, 246,0.1)", margin: "12px auto", width: 24 }} />}
              {group.items.map((n) => {
                const isActive = view === n.id;
                let progressPct = null;
                if (n.id === "list") progressPct = masteredPct;
                if (n.id === "badges") {
                  const earnableCount = BADGES.filter((b) => b.id !== "exam_mode").length;
                  progressPct = earnableCount > 0 ? Math.round((unlockedBadges.length / earnableCount) * 100) : 0;
                }
                return (
                  <div key={n.id} style={{ position: "relative", marginBottom: 2 }} className="nexus-item-container">
                    <button
                      className={`nexus-item ${isActive ? "active" : ""}`}
                      onClick={() => {
                        setView(n.id);
                      }}
                      title={sidebarCollapsed ? `${n.label}${n.shortcut ? ` (⌘${n.shortcut})` : ""}` : undefined}
                      style={{
                        width: "100%",
                        padding: sidebarCollapsed ? "10px 0" : "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: sidebarCollapsed ? "center" : "flex-start",
                        gap: 10,
                        border: "none",
                        cursor: "pointer",
                        background: "transparent",
                        color: isActive ? (isDarkMode ? "white" : (theme?.highlight || "#8B5CF6")) : (isDarkMode ? "rgba(255,255,255,0.65)" : (theme?.textMuted || "#64748B")),
                        textAlign: "left",
                        fontWeight: isActive ? 800 : 600,
                      }}
                    >
                      <span style={{ fontSize: 18, flexShrink: 0, textAlign: "center", width: sidebarCollapsed ? "100%" : 22 }}>{n.icon}</span>
                      {!sidebarCollapsed && (
                        <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{n.label}</span>
                      )}
                      {!sidebarCollapsed && n.shortcut && (
                        <span style={{ fontSize: 10, color: isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(139,92,246,0.4)", fontFamily: "'JetBrains Mono',monospace", marginLeft: "auto", flexShrink: 0, background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(139,92,246,0.05)", padding: "2px 6px", borderRadius: 4 }}>⌘{n.shortcut}</span>
                      )}
                      {n.badge && (
                        <span className={n.badgeColor === "#EF4444" ? "nexus-badge-red" : "nexus-badge-blue"} style={{
                          position: sidebarCollapsed ? "absolute" : "static",
                          top: sidebarCollapsed ? 2 : "auto",
                          right: sidebarCollapsed ? 2 : "auto",
                          background: n.badgeColor,
                          color: "white",
                          borderRadius: 20,
                          padding: "2px 6px",
                          fontSize: 10,
                          fontWeight: 900,
                          minWidth: 18,
                          textAlign: "center",
                          lineHeight: 1.2,
                          whiteSpace: "nowrap",
                          boxShadow: sidebarCollapsed ? "0 0 0 2px var(--mm-bg, #0a0a0a)" : "none",
                          maxWidth: sidebarCollapsed ? 28 : "none",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>{n.badge}</span>
                      )}
                    </button>
                    {!sidebarCollapsed && progressPct !== null && (
                      <div style={{ margin: "-2px 14px 8px 50px", height: 3, background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(139, 92, 246,0.06)", borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${progressPct}%`, background: progressPct >= 80 ? "#22C55E" : (isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(139, 92, 246,0.3)"), borderRadius: 3, transition: "width 0.6s ease" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div style={{ padding: "10px 12px", borderTop: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(139, 92, 246,0.1)" }}>
          {projectPomodoroTime < 25 * 60 || projectPomodoroActive ? (
            <div style={{ background: "rgba(139, 92, 246,0.15)", borderRadius: 8, padding: "6px 8px", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13 }}>{projectPomodoroMode === "study" ? "📚" : projectPomodoroMode === "project" ? "🗂️" : "☕"}</span>
              {!sidebarCollapsed && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: isDarkMode ? "#DDD6FE" : (theme?.text || "#0F172A"), fontWeight: 700 }}>{formatPomodoro(projectPomodoroTime)}</span>}
              <button onClick={() => setProjectPomodoroActive((a) => !a)} style={{ marginLeft: "auto", background: "none", border: "none", color: isDarkMode ? "#DDD6FE" : (theme?.text || "#0F172A"), cursor: "pointer", fontSize: 11 }}>{projectPomodoroActive ? "⏸" : "▶"}</button>
            </div>
          ) : null}

          {!sidebarCollapsed && expressions.length > 0 && (
            <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(139, 92, 246,0.05)", borderRadius: 10, padding: "6px 9px", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: isDarkMode ? "rgba(255,255,255,0.5)" : (theme?.textMuted || "#64748B"), fontWeight: 700, letterSpacing: "0.03em" }}>MAÎTRISE GLOBALE</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: isDarkMode ? "#C4B5FD" : (theme?.highlight || "#8B5CF6") }}>
                  {expressions.length > 0 ? Math.round((masteredCount / expressions.length) * 100) : 0}%
                </span>
              </div>
              <div style={{ height: 2.5, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(139, 92, 246,0.1)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${expressions.length > 0 ? Math.round((masteredCount / expressions.length) * 100) : 0}%`, background: "linear-gradient(90deg,#C084FC,#8B5CF6)", borderRadius: 2, transition: "width 0.8s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 8.5, color: isDarkMode ? "rgba(255,255,255,0.4)" : (theme?.textMuted || "#64748B") }}>
                <span>{masteredCount} maîtrisées</span>
                <span>{duePileSize} dues au total</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between", padding: "4px 2px" }}>
            {!sidebarCollapsed ? (
              <>
                <span style={{ fontSize: 9.5, color: isDarkMode ? "rgba(255,255,255,0.3)" : (theme?.textMuted || "#64748B"), fontWeight: 600, letterSpacing: 0.4 }}>⌥1-9 navigation</span>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: isDarkMode ? "rgba(255,255,255,0.6)" : (theme?.text || "#0F172A") }}>{sidebarClock}</span>
              </>
            ) : (
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: isDarkMode ? "rgba(255,255,255,0.5)" : (theme?.textMuted || "#64748B") }}>{sidebarClock}</span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
