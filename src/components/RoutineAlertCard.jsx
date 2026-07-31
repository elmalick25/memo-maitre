// src/components/RoutineAlertCard.jsx
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIERS 27-28 — L'alerte de routine, cadrage POSITIF, mobile ET desktop.
//
// Avant : un bloc inline du dashboard (donc jamais rendu sur mobile), avec sa
// propre copie des 14 étapes et un cadrage « ⚠ En retard » culpabilisant.
// Maintenant : un composant unique, alimenté par useDailyRoutine, affiché des
// deux côtés — « 3 étapes du soir t'attendent — 20 min pour boucler ta
// journée » plutôt qu'une dette.
// ═══════════════════════════════════════════════════════════════════════════
import React from "react";

const TONE_COLORS = {
  celebration: "#10B981",
  nearmiss: "#F59E0B",
  opportunity: "#4D6BFE",
  neutral: "#64748B",
};

export default function RoutineAlertCard({
  summary,
  framing,
  routineStreak = 0,
  theme = {},
  compact = false,
  onOpen,
}) {
  if (!summary || !framing) return null;
  const accent = framing.tone === "opportunity"
    ? (summary.periodMeta?.color || TONE_COLORS.opportunity)
    : TONE_COLORS[framing.tone];

  return (
    <div
      className="routine-alert-card"
      style={{
        background: theme.cardBg || "var(--mm-bg-card, #fff)",
        border: `1px solid ${theme.border || "rgba(148,163,184,0.25)"}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: compact ? 18 : 16,
        padding: compact ? "14px 16px" : "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }} aria-hidden="true">{framing.icon}</span>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase",
          color: theme.textMuted || "#94A3B8", flex: 1,
        }}>
          Ma routine · {summary.doneCount}/{summary.total}
        </span>
        {/* CHANTIER 26 — streak de ROUTINE, visuellement distinct du 🔥 révision */}
        <span
          title={`Série de routine : ${routineStreak} jour(s) à 100 %`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 9px", borderRadius: 999,
            background: "rgba(16,185,129,0.12)", color: "#10B981",
            fontSize: 11, fontWeight: 900,
          }}
        >
          🌱 {routineStreak}
        </span>
      </div>

      <div style={{ fontSize: compact ? 14 : 14.5, fontWeight: 700, color: theme.text || "#0F172A", lineHeight: 1.4 }}>
        {framing.text}
      </div>

      <div style={{
        height: 6, borderRadius: 4, overflow: "hidden",
        background: theme.inputBg || "rgba(148,163,184,0.2)",
      }}>
        <div style={{
          height: "100%", width: `${summary.pct}%`, borderRadius: 4,
          background: `linear-gradient(90deg, ${accent}, ${accent}99)`,
          transition: "width .4s ease",
        }} />
      </div>

      {summary.pending.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {summary.pending.slice(0, compact ? 3 : 6).map((s) => (
            <span key={s.id} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 9px", borderRadius: 10,
              background: theme.inputBg || "rgba(148,163,184,0.12)",
              border: `1px solid ${theme.border || "rgba(148,163,184,0.25)"}`,
              fontSize: 12, fontWeight: 600, color: theme.text || "#0F172A",
            }}>
              <span aria-hidden="true">{s.icon}</span>{s.label}
              <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 500 }}>· {s.duration}min</span>
            </span>
          ))}
          {summary.pending.length > (compact ? 3 : 6) && (
            <span style={{ fontSize: 11, color: theme.textMuted || "#94A3B8", alignSelf: "center" }}>
              +{summary.pending.length - (compact ? 3 : 6)} autres
            </span>
          )}
        </div>
      )}

      {/* CTA en bas de carte : atteignable au pouce sur mobile (chantier 20) */}
      <button
        type="button"
        onClick={onOpen}
        style={{
          alignSelf: "stretch",
          minHeight: 44,
          borderRadius: 12,
          border: "none",
          background: accent,
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        {framing.cta} →
      </button>
    </div>
  );
}
