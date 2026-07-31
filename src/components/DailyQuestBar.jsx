// src/components/DailyQuestBar.jsx
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 9 — Quêtes du jour (boucle courte) + jauge hebdo (boucle longue),
// toujours visibles sur le dashboard.
// ═══════════════════════════════════════════════════════════════════════════
import React from "react";

function Row({ quest, theme, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      <span style={{ fontSize: 18, opacity: quest.done ? 1 : 0.85 }}>{quest.done ? "✅" : quest.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: quest.done ? (theme.textMuted || "#94A3B8") : (theme.text || "#0F172A"),
            textDecoration: quest.done ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{quest.label}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: accent, fontFamily: "'JetBrains Mono', monospace" }}>
            {quest.cur}/{quest.max}
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: theme.inputBg || "rgba(148,163,184,0.2)", marginTop: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${quest.pct}%`, background: quest.done ? "#10B981" : accent, borderRadius: 3, transition: "width .4s ease" }} />
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted || "#94A3B8" }}>+{quest.xp}</span>
    </div>
  );
}

export default function DailyQuestBar({ summary, theme = {}, dailyMultiplier = null, accent = "#4D6BFE" }) {
  if (!summary || !summary.daily?.length) return null;
  const { daily, weekly, doneCount, total, allDone } = summary;

  return (
    <div
      className="dash-widget-card"
      style={{
        background: theme.cardBg || "#fff",
        border: `1px solid ${allDone ? "#10B98166" : theme.border || "rgba(148,163,184,0.25)"}`,
        borderRadius: 20,
        padding: "16px 18px",
        boxShadow: allDone ? "0 0 18px rgba(16,185,129,0.25)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: theme.text || "#0F172A" }}>
          🎯 Quêtes du jour <span style={{ color: accent }}>{doneCount}/{total}</span>
        </div>
        {dailyMultiplier && (
          <div style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: `${accent}18`, color: accent }}>
            {dailyMultiplier.icon} {dailyMultiplier.label}
          </div>
        )}
      </div>

      {daily.map((q) => <Row key={q.id} quest={q} theme={theme} accent={accent} />)}

      {allDone && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#10B981" }}>
          🎊 Combo du jour complété — bonus XP versé.
        </div>
      )}

      {weekly && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.border || "rgba(148,163,184,0.25)"}` }}>
          <div style={{ fontWeight: 900, fontSize: 13, color: theme.text || "#0F172A", marginBottom: 2 }}>
            🏔️ Quête de la semaine
          </div>
          <Row quest={weekly} theme={theme} accent="#A855F7" />
        </div>
      )}
    </div>
  );
}
