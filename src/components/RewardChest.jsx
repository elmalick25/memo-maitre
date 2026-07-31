// src/components/RewardChest.jsx
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 8 — Révélation du coffre surprise.
// Overlay court, non bloquant, auto-fermé : le but est la micro-surprise,
// pas d'interrompre la session.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect } from "react";
import { RARITY_STYLES } from "../constants/gamification";
import { haptic } from "../lib/haptics";
import { isLiteMode } from "../lib/perfTier";

export default function RewardChest({ chest, onClose, theme = {}, duration = 2600 }) {
  // ── CHANTIER 17 — motif haptique différencié par rareté ──
  useEffect(() => {
    if (!chest) return;
    haptic("chest", chest.rarity);
  }, [chest]);

  useEffect(() => {
    if (!chest) return undefined;
    const t = setTimeout(() => onClose?.(), duration);
    return () => clearTimeout(t);
  }, [chest, onClose, duration]);

  if (!chest) return null;
  const baseStyle = RARITY_STYLES[chest.rarity] || RARITY_STYLES.commun;
  // ── CHANTIER 21 — sur appareil modeste : couleur pleine + icône, sans halo
  //    animé ni blur plein écran (les deux effets les plus coûteux). ──
  const lite = isLiteMode();
  const style = lite ? { ...baseStyle, glow: "none" } : baseStyle;

  return (
    <div
      onClick={() => onClose?.()}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: lite ? "rgba(2,6,23,0.72)" : "rgba(2,6,23,0.45)",
        backdropFilter: lite ? "none" : "blur(3px)",
        WebkitBackdropFilter: lite ? "none" : "blur(3px)",
        animation: lite ? "none" : "chestFade .25s ease",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          background: theme.cardBg || "#0F172A",
          border: `2px solid ${style.color}`,
          boxShadow: style.glow,
          borderRadius: 24,
          padding: "28px 34px",
          textAlign: "center",
          animation: lite ? "none" : "chestPop .5s cubic-bezier(0.34,1.56,0.64,1)",
          maxWidth: 320,
        }}
      >
        <div style={{ fontSize: 52, animation: lite ? "none" : "chestShake .6s ease" }}>{chest.icon}</div>
        <div style={{ fontWeight: 900, fontSize: 18, color: style.color, marginTop: 8 }}>{chest.label}</div>
        <div style={{ fontSize: 12, color: theme.textMuted || "#94A3B8", marginTop: 4 }}>{style.label}</div>
        {chest.bonusXP > 0 && (
          <div style={{ marginTop: 12, fontWeight: 900, fontSize: 22, color: theme.text || "#F8FAFC" }}>
            +{chest.bonusXP} XP <span style={{ fontSize: 13, opacity: 0.7 }}>(×{chest.xpMult})</span>
          </div>
        )}
        {chest.freezeToken > 0 && (
          <div style={{ marginTop: 12, fontWeight: 800, fontSize: 15, color: "#38BDF8" }}>
            🧊 +{chest.freezeToken} jeton de gel
          </div>
        )}
        {chest.empty && (
          <div style={{ marginTop: 12, fontSize: 13, color: theme.textMuted || "#94A3B8" }}>
            Rien cette fois — le prochain sera peut-être le bon.
          </div>
        )}
      </div>

      <style>{`
        @keyframes chestFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes chestPop  { 0% { transform: scale(0.7); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes chestShake { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-12deg); } 60% { transform: rotate(10deg); } }
      `}</style>
    </div>
  );
}
