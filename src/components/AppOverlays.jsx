import React from "react";
import { CommandPalette } from "../MemoMasterUpgrades";
import AgentPanel from "./AgentPanel";
import RewardChest from "./RewardChest";

export default function AppOverlays({
  audioRef = null,
  trackSrc = "",
  newBadge = null,
  isDarkMode = false,
  theme = {},
  cmdOpen = false,
  setCmdOpen = () => {},
  agentSheetOpen = false,
  setAgentSheetOpen = () => {},
  setShowAgentPanel = () => {},
  buildAgentContext = () => ({}),
  runAgentTool = () => {},
  agentAsk = () => {},
  lastChest = null,
  clearChest = () => {},
  xpBurst = null,
  setView = () => {},
  navigate = () => {},
  setIsDarkMode = () => {},
  setLofiPlaying = () => {},
  MOBILE_MQ = "(max-width: 767.98px)",
}) {
  const commands = [
    { icon: "▶", label: "Lancer une review", shortcut: "R", action: () => setView("review") },
    { icon: "➕", label: "Ajouter une fiche", shortcut: "A", action: () => setView("add") },
    { icon: "🔍", label: "Rechercher dans les fiches", shortcut: "F", action: () => setView("list") },
    { icon: "📊", label: "Ouvrir les stats", action: () => setView("stats") },
    { icon: "🧪", label: "Ouvrir le Lab", action: () => setView("lab") },
    { icon: "📥", label: "Importer un PDF", action: () => navigate("lab/import") },
    { icon: "🌙", label: "Basculer thème sombre/clair", action: () => setIsDarkMode((d) => !d) },
    { icon: "🎧", label: "Activer/Désactiver Lofi", action: () => setLofiPlaying((p) => !p) },
    { icon: "🍅", label: "Lancer une session 25 min", action: () => navigate("lab/pomodoro") },
    {
      icon: "🤖",
      label: "Ouvrir l'assistant IA",
      shortcut: "J",
      action: () => {
        const isMobile = typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
        if (isMobile) setAgentSheetOpen(true);
        else setShowAgentPanel(true);
      },
    },
  ];

  return (
    <>
      {/* Lecteur Audio natif */}
      <audio
        ref={audioRef}
        src={trackSrc || undefined}
        loop
        preload="none"
        style={{ display: "none" }}
      />

      {/* Notification Toast de déblocage de Badge */}
      {newBadge && (
        <div
          style={{
            position: "fixed",
            top: 88,
            right: 20,
            zIndex: 9998,
            display: "flex",
            gap: 16,
            alignItems: "center",
            background: isDarkMode ? "rgba(24,16,40,0.97)" : "white",
            border: "2px solid #8B5CF6",
            borderRadius: 18,
            padding: "18px 24px",
            boxShadow: "0 12px 40px rgba(139,92,246,0.25)",
            animation: "slideIn 0.4s ease",
          }}
        >
          <span style={{ fontSize: 32 }}>{newBadge.icon}</span>
          <div>
            <div style={{ fontWeight: 800, color: theme?.text || "#0F172A", fontSize: 15 }}>
              Badge débloqué !
            </div>
            <div style={{ color: "#8B5CF6", fontWeight: 700 }}>{newBadge.label}</div>
            <div style={{ color: theme?.textMuted || "#64748B", fontSize: 12 }}>{newBadge.desc}</div>
          </div>
        </div>
      )}

      {/* Palette de commandes ⌘K */}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        theme={theme}
        commands={commands}
      />

      {/* ASSISTANT IA — bottom sheet plein écran (mobile) */}
      <AgentPanel
        open={agentSheetOpen}
        onClose={() => setAgentSheetOpen(false)}
        variant="sheet"
        theme={theme}
        isDarkMode={isDarkMode}
        getContext={buildAgentContext}
        runTool={runAgentTool}
        ask={agentAsk}
      />

      {/* Coffre de récompense surprise */}
      <RewardChest chest={lastChest} onClose={clearChest} theme={theme} />

      {/* Explosion XP (XpBurst) */}
      {xpBurst && (
        <div
          key={xpBurst.key}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            animation: "xp-burst-fade-out 3s ease-out forwards",
          }}
        >
          <div
            style={{
              fontSize: "clamp(4rem, 10vw, 8rem)",
              fontWeight: 900,
              color: "#FACC15",
              textShadow:
                "0 0 10px #FBBF24, 0 0 20px #F59E0B, 0 0 40px #D97706, 0 4px 10px rgba(0,0,0,0.5)",
              animation: "xp-burst-float-up 3s cubic-bezier(0.1, 0.9, 0.2, 1) forwards",
            }}
          >
            +{xpBurst.amount} XP
          </div>
        </div>
      )}
    </>
  );
}
