// BacklogRetentionCard.jsx — Rétention RÉELLE du backlog (Couche 8, enfin visible)
// ─────────────────────────────────────────────────────────────────────────────
// La question « est-ce que je suis vraiment à 90 % ? » avait déjà sa réponse
// dans le code (estimateBacklogRetention, formule FSRS exacte) — mais elle
// n'était affichée nulle part. Ce panneau la sort du silence :
//
//   • R moyen mesuré sur les fiches EN RETARD (vs la cible théorique de 90 %)
//   • retard moyen en jours, et pire cas de la pile
//   • un verdict lisible, pas un chiffre brut
//   • l'état du régime intensif anglais (échelle 1→3→7→14 + sous-quota du jour)
//
// Aucun calcul dupliqué : tout vient de lib/reviewStats.js et lib/fsrs.js.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { estimateBacklogRetention } from "../lib/reviewStats";
import { isEnglishIntensive, englishLadderStep, ENGLISH_INTENSIVE_LADDER } from "../lib/fsrs";
import { getEnglishSubQuota } from "../lib/memoryLab";
import { today, isOverdue } from "../utils/dateUtils";

const TARGET_R = 0.9;

function toneFor(r) {
  if (r === null) return { color: "#10B981", label: "Aucun retard", emoji: "✨" };
  if (r >= 0.85) return { color: "#10B981", label: "Sous contrôle", emoji: "🟢" };
  if (r >= 0.7) return { color: "#F59E0B", label: "Ça glisse un peu", emoji: "🟡" };
  if (r >= 0.5) return { color: "#F97316", label: "Érosion nette", emoji: "🟠" };
  return { color: "#EF4444", label: "Oubli en cours", emoji: "🔴" };
}

function pct(x) {
  return `${Math.round((x ?? 0) * 100)}%`;
}

export default function BacklogRetentionCard({
  isDarkMode = false,
  theme = { text: "#0F172A", textMuted: "#64748b", border: "rgba(0,0,0,0.08)" },
  expressions = [],
  dailyTarget = null,
}) {
  const todayISO = today();

  const data = useMemo(
    () => estimateBacklogRetention(expressions, todayISO),
    [expressions, todayISO],
  );

  const english = useMemo(() => {
    const list = (expressions || []).filter((e) => e && isEnglishIntensive(e));
    const due = list.filter((e) => !e.nextReview || e.nextReview <= todayISO || isOverdue(e.nextReview, todayISO));
    const steps = ENGLISH_INTENSIVE_LADDER.map(() => 0);
    for (const e of list) {
      const { step } = englishLadderStep(e);
      const idx = Math.max(0, Math.min(steps.length - 1, step - 1));
      steps[idx] += 1;
    }
    return { total: list.length, due: due.length, steps };
  }, [expressions, todayISO]);

  const quota = getEnglishSubQuota(dailyTarget);
  const tone = toneFor(data.avgRetention);
  const gap = data.avgRetention === null ? 0 : Math.round((TARGET_R - data.avgRetention) * 100);

  const cardStyle = {
    background: isDarkMode ? "rgba(15, 23, 42, 0.6)" : "rgba(255, 255, 255, 0.75)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderRadius: 24,
    padding: 24,
    border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"}`,
    boxShadow: isDarkMode ? "0 8px 32px rgba(0,0,0,0.2)" : "0 8px 32px rgba(139, 92, 246,0.08)",
    marginBottom: 20,
    position: "relative",
    overflow: "hidden",
  };

  const tileStyle = {
    background: isDarkMode ? "rgba(255,255,255,0.05)" : "#F8FAFF",
    borderRadius: 16,
    padding: 16,
    textAlign: "center",
    border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(139, 92, 246,0.1)"}`,
  };

  const verdict = data.count === 0
    ? "Aucune fiche en retard : ta rétention réelle colle à la cible. Le plafond du jour fait son travail."
    : gap <= 5
      ? `Ton retard te coûte environ ${gap} point(s) de rétention. C'est du bruit, pas une fuite.`
      : gap <= 20
        ? `Ton retard te coûte ~${gap} points sous la cible de 90 %. Les fiches en tête de plan sont exactement celles-là.`
        : `Ton retard te coûte ~${gap} points sous la cible. Les plus anciennes sont passées en mode ré-apprentissage : normal, elles remontent vite.`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      style={cardStyle}
    >
      <div
        style={{
          position: "absolute", top: "-60%", right: "-15%", width: "70%", height: "220%",
          background: `radial-gradient(circle, ${tone.color}18 0%, transparent 60%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text }}>
            🎯 Rétention réelle du retard
          </h3>
          <span style={{ fontSize: 13, fontWeight: 700, color: tone.color }}>
            {tone.emoji} {tone.label}
          </span>
        </div>
        <p style={{ margin: "6px 0 20px", fontSize: 13, color: theme.textMuted, fontWeight: 500 }}>
          Mesure FSRS exacte sur tes fiches en retard — pas une estimation d'humeur.
        </p>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: tone.color }}>
            {data.avgRetention === null ? "—" : pct(data.avgRetention)}
          </div>
          <div style={{ paddingBottom: 8 }}>
            <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>
              cible théorique {pct(TARGET_R)}
            </div>
            <div style={{ fontSize: 13, color: theme.text, fontWeight: 700 }}>
              {data.count === 0 ? "0 fiche en retard" : `${data.count} fiche${data.count > 1 ? "s" : ""} en retard`}
            </div>
          </div>
        </div>

        {/* Jauge cible vs réel */}
        <div style={{ position: "relative", height: 10, borderRadius: 999, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)", marginBottom: 20 }}>
          <div
            style={{
              width: `${Math.max(0, Math.min(100, Math.round((data.avgRetention ?? TARGET_R) * 100)))}%`,
              height: "100%", borderRadius: 999,
              background: `linear-gradient(90deg, ${tone.color}99, ${tone.color})`,
              transition: "width .4s ease",
            }}
          />
          <div
            title="Cible 90%"
            style={{ position: "absolute", left: "90%", top: -4, width: 2, height: 18, background: theme.textMuted, opacity: 0.7 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          <div style={tileStyle}>
            <div style={{ fontSize: 24, fontWeight: 900, color: theme.text }}>
              {data.count === 0 ? "—" : `${data.avgOverdueDays} j`}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>Retard moyen</div>
          </div>
          <div style={tileStyle}>
            <div style={{ fontSize: 24, fontWeight: 900, color: data.worstRetention === null ? theme.text : toneFor(data.worstRetention).color }}>
              {data.worstRetention === null ? "—" : pct(data.worstRetention)}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>Pire fiche</div>
          </div>
          <div style={tileStyle}>
            <div style={{ fontSize: 24, fontWeight: 900, color: theme.text }}>
              {data.avgRetention === null ? "—" : `${gap >= 0 ? "-" : "+"}${Math.abs(gap)} pts`}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>Écart à la cible</div>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: theme.text, fontWeight: 500 }}>
          {verdict}
        </p>

        {/* ── Régime intensif anglais ─────────────────────────────────────── */}
        {english.total > 0 && (
          <div
            style={{
              marginTop: 20, paddingTop: 18,
              borderTop: `1px dashed ${isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)"}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: theme.text }}>
                🇬🇧 Régime intensif anglais
              </h4>
              <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>
                {quota ? `${Math.min(english.due, quota)}/${quota} slots du jour` : "aucun plafond aujourd'hui"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {ENGLISH_INTENSIVE_LADDER.map((d, i) => (
                <div
                  key={d}
                  style={{
                    flex: "1 1 60px", minWidth: 60, textAlign: "center", padding: "10px 6px", borderRadius: 12,
                    background: isDarkMode ? "rgba(139, 92, 246,0.12)" : "rgba(139, 92, 246,0.08)",
                    border: `1px solid ${isDarkMode ? "rgba(139, 92, 246,0.25)" : "rgba(139, 92, 246,0.18)"}`,
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 900, color: theme.text }}>{english.steps[i]}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>palier {d} j</div>
                </div>
              ))}
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.5, color: theme.textMuted, fontWeight: 500 }}>
              {english.total} fiche{english.total > 1 ? "s" : ""} encore sur l'échelle 1 → 3 → 7 → 14 j.
              Sortie uniquement si la fiche est <strong>recalled</strong> ET a atteint le palier 14 j.
              {quota ? ` Elles ne peuvent jamais occuper plus de ${quota} des slots du jour.` : ""}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
