// src/components/RadialDuelChart.jsx
// ═══════════════════════════════════════════════════════════════════════════
// RADIAL DUEL — jauge circulaire à double arc concentrique (SVG pur).
//
// Remplace le doughnut « Toi vs il y a 30 jours » : au lieu de deux parts d'un
// même camembert (illisible dès qu'une période écrase l'autre), on superpose
// deux arcs sur la même échelle. L'arc extérieur = 30 derniers jours, l'arc
// intérieur = période précédente. Le plus long gagne, visuellement, tout de
// suite. Le delta est affiché au centre, avec l'aiguille de tendance.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";
import { colorMix } from "../lib/colorMix";

const TAU = Math.PI * 2;
// Arc ouvert en bas (style "gauge") : 270° utiles.
const SWEEP = 0.75;
const START = 0.5 * Math.PI + (1 - SWEEP) * Math.PI;

function arcPath(cx, cy, r, fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0) return "";
  const a0 = START;
  const a1 = START + f * SWEEP * TAU;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = f * SWEEP > 0.5 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export default function RadialDuelChart({
  recent = 0,
  previous = 0,
  delta = 0,
  isDarkMode = true,
  height = 260,
  recentColor = "var(--mm-primary-glow)",
  previousColor,
  labelRecent = "30 derniers jours",
  labelPrevious = "Période précédente",
}) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 900);
      setT(1 - Math.pow(1 - p, 3)); // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [recent, previous]);

  const prevColor = previousColor || (isDarkMode ? "#64748b" : "#cbd5e1");
  const track = isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.07)";
  const muted = isDarkMode ? "#94a3b8" : "#64748b";
  const fg = isDarkMode ? "#eaf2ff" : "#0f172a";

  const max = Math.max(recent, previous, 1);
  const isEmpty = recent === 0 && previous === 0;
  const fRecent = isEmpty ? 0 : (recent / max) * t;
  const fPrev = isEmpty ? 0 : (previous / max) * t;

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 88;
  const rInner = 64;
  const trendColor = delta > 0 ? "#10B981" : delta < 0 ? "#EF4444" : muted;

  return (
    <div style={{ height, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: "100%", maxWidth: size, height: "auto", flex: "0 1 auto", overflow: "visible" }}
        role="img"
        aria-label={`${recent} révisions sur 30 jours contre ${previous} sur la période précédente`}
      >
        <defs>
          <linearGradient id="rdc-recent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={recentColor} />
            <stop offset="100%" stopColor="var(--mm-primary)" />
          </linearGradient>
        </defs>

        {/* Rails */}
        <path d={arcPath(cx, cy, rOuter, 1)} stroke={track} strokeWidth={16} fill="none" strokeLinecap="round" />
        <path d={arcPath(cx, cy, rInner, 1)} stroke={track} strokeWidth={12} fill="none" strokeLinecap="round" />

        {/* Période précédente (arc intérieur) */}
        {fPrev > 0 && (
          <path d={arcPath(cx, cy, rInner, fPrev)} stroke={prevColor} strokeWidth={12} fill="none" strokeLinecap="round" />
        )}
        {/* 30 derniers jours (arc extérieur) */}
        {fRecent > 0 && (
          <path
            d={arcPath(cx, cy, rOuter, fRecent)}
            stroke="url(#rdc-recent)"
            strokeWidth={16}
            fill="none"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${colorMix(recentColor, 40)})` }}
          />
        )}

        {/* Centre */}
        <text x={cx} y={cy - 10} textAnchor="middle" style={{ fontSize: 40, fontWeight: 900, fill: isEmpty ? muted : recentColor }}>
          {recent}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" style={{ fontSize: 10, fontWeight: 800, fill: muted, letterSpacing: 1 }}>
          RÉVISIONS
        </text>
        <text x={cx} y={cy + 32} textAnchor="middle" style={{ fontSize: 13, fontWeight: 900, fill: trendColor }}>
          {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "= "}
          {delta}%
        </text>
      </svg>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 4 }}>
        <Legend color={recentColor} label={labelRecent} value={recent} fg={fg} muted={muted} />
        <Legend color={prevColor} label={labelPrevious} value={previous} fg={fg} muted={muted} />
      </div>
    </div>
  );
}

function Legend({ color, label, value, fg, muted }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, color: muted }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
      {label} · <strong style={{ color: fg }}>{value}</strong>
    </span>
  );
}
