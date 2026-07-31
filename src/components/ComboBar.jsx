// src/components/ComboBar.jsx
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 10 — Barre de combo visible en permanence pendant la session.
// La donnée existait déjà (useXPLedger + comboLabel) mais n'était affichée
// nulle part : c'est le levier le plus rentable du plan.
// Le compteur pulse et change de couleur aux paliers 3 / 5 / 10 / 20.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from "react";
import { COMBO_STEPS, comboMultiplier, comboLabel } from "../lib/xpEngine";
import { haptic } from "../lib/haptics";
import { isLiteMode } from "../lib/perfTier";

const TIER_COLORS = [
  { min: 20, color: "#F59E0B", glow: "0 0 22px rgba(245,158,11,0.55)", tag: "EN FUSION" },
  { min: 10, color: "#A855F7", glow: "0 0 18px rgba(168,85,247,0.5)",  tag: "EN FEU" },
  { min: 5,  color: "#4D6BFE", glow: "0 0 14px rgba(77,107,254,0.45)", tag: "LANCÉ" },
  { min: 3,  color: "#10B981", glow: "0 0 10px rgba(16,185,129,0.4)",  tag: "SÉRIE" },
];

export function comboTier(combo) {
  return TIER_COLORS.find((t) => (combo || 0) >= t.min) || null;
}

export default function ComboBar({ combo = 0, theme = {}, compact = false, haptics = true }) {
  const [pulse, setPulse] = useState(0);
  const prev = useRef(combo);
  const prevTier = useRef(null);
  const lite = isLiteMode();

  useEffect(() => {
    if (combo > prev.current) setPulse((p) => p + 1);
    prev.current = combo;
  }, [combo]);

  // ── CHANTIER 17 — un pulse haptique distinct à CHAQUE palier franchi ──
  // L'intensité monte avec le tier (×3 discret → ×20 syncopé), exactement
  // comme la signature sonore : sur mobile, le corps ressent la récompense.
  useEffect(() => {
    const t = comboTier(combo);
    const tierMin = t ? t.min : 0;
    if (haptics && tierMin > (prevTier.current || 0)) haptic("combo", tierMin);
    prevTier.current = tierMin;
  }, [combo, haptics]);

  const tier = comboTier(combo);
  const color = tier ? tier.color : theme.textMuted || "#94A3B8";
  const nextStep = [...COMBO_STEPS].reverse().find((s) => s.min > combo);
  const target = nextStep ? nextStep.min : COMBO_STEPS[0].min;
  const pct = Math.min(100, Math.round((combo / target) * 100));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: compact ? "6px 10px" : "8px 14px",
        borderRadius: 14,
        background: theme.cardBg || "rgba(148,163,184,0.08)",
        border: `1px solid ${tier ? color + "55" : theme.border || "rgba(148,163,184,0.25)"}`,
        boxShadow: tier && !lite ? tier.glow : "none",
        transition: "box-shadow .3s ease, border-color .3s ease",
      }}
      aria-label={`Combo ${combo}`}
    >
      <span
        key={pulse}
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 900,
          fontSize: compact ? 14 : 16,
          color,
          animation: combo > 0 ? "comboPulse 0.45s cubic-bezier(0.34,1.56,0.64,1)" : "none",
          minWidth: 34,
          textAlign: "center",
        }}
      >
        ×{combo}
      </span>

      <div style={{ flex: 1, minWidth: 60 }}>
        <div style={{ height: 6, borderRadius: 3, background: theme.inputBg || "rgba(148,163,184,0.2)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${color}, ${color}99)`,
              transition: "width .35s ease, background .3s ease",
            }}
          />
        </div>
        {!compact && (
          <div style={{ fontSize: 10, marginTop: 3, color: theme.textMuted || "#94A3B8", fontWeight: 700, letterSpacing: 0.4 }}>
            {tier ? `${tier.tag} · ${comboLabel(combo)} · XP ×${comboMultiplier(combo)}` : `${target - combo} bonne(s) réponse(s) → bonus XP`}
          </div>
        )}
      </div>

      <style>{`
        @keyframes comboPulse {
          0%   { transform: scale(1); }
          45%  { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
