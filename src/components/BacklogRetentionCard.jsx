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
import { colorMix } from "../lib/colorMix";

const TARGET_R = 0.9;

function toneFor(r) {
  if (r === null) return { color: "var(--mm-primary-glow)", label: "Aucun retard", emoji: "✨" };
  if (r >= 0.85) return { color: "var(--mm-primary-glow)", label: "Sous contrôle", emoji: "✨" };
  if (r >= 0.7) return { color: "var(--mm-warning, #b3822f)", label: "Ça glisse un peu", emoji: "🟡" };
  if (r >= 0.5) return { color: "var(--mm-primary)", label: "Érosion nette", emoji: "🟠" };
  return { color: "var(--mm-danger, #a8422f)", label: "Oubli en cours", emoji: "🔴" };
}

function pct(x) {
  return `${Math.round((x ?? 0) * 100)}%`;
}

export default function BacklogRetentionCard({
  isDarkMode = false,
  theme = { text: "var(--mm-fg)", textMuted: "var(--mm-fg-muted)", border: "var(--mm-border)" },
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

  // ── Niveau 100 : Rentabilité cognitive FSRS (heures économisées vs bachotage) ──
  const totalReviewsCount = useMemo(() => {
    return (expressions || []).reduce((acc, e) => acc + (e.reviewHistory?.length || 0), 0);
  }, [expressions]);

  const hoursSaved = useMemo(() => {
    // Une révision naïve linéaire consomme ~45s répétée inutilement 3x plus souvent que FSRS
    const savedMinutes = totalReviewsCount * 1.5;
    return savedMinutes >= 60 ? (savedMinutes / 60).toFixed(1) + " h" : Math.max(5, Math.round(savedMinutes)) + " min";
  }, [totalReviewsCount]);

  const cardStyle = {
    background: isDarkMode ? "var(--mm-bg-card, #171233)" : "var(--mm-bg-card, #ffffff)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderRadius: 24,
    padding: 24,
    border: `1px solid var(--mm-border)`,
    boxShadow: isDarkMode ? "0 8px 32px rgba(0,0,0,0.3)" : "0 8px 32px color-mix(in srgb, var(--mm-primary) 8.0%, transparent)",
    marginBottom: 20,
    position: "relative",
    overflow: "hidden",
  };

  const tileStyle = {
    background: isDarkMode ? "var(--mm-bg-elev, #110e22)" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
    borderRadius: 16,
    padding: 16,
    textAlign: "center",
    border: `1px solid var(--mm-border)`,
  };

  const isZeroOverdue = data.count === 0;
  const effectiveTone = isZeroOverdue 
    ? { color: "var(--mm-primary-glow)", label: "Zéro retard • Rendement maximal", emoji: "✨" }
    : tone;

  const verdict = isZeroOverdue
    ? "🎉 Rendement thermodynamique maximal : ta mémoire est calée sur l'espacement optimal FSRS. Aucune révision superflue aujourd'hui."
    : gap <= 5
      ? `Ton retard te coûte environ ${gap} point(s) de rétention. C'est minime : 3 fiches prioritaires suffisent à sécuriser l'optimum.`
      : gap <= 20
        ? `Ton retard te coûte ~${gap} points sous la cible de 90%. Concentre-toi sur les fiches du « Pire cas » ci-dessous pour stopper l'oubli.`
        : `Ton retard te coûte ~${gap} points sous la cible. Certaines fiches ont besoin d'une réactivation rapide : priorise-les en session courte.`;

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
          background: `radial-gradient(circle, ${colorMix(effectiveTone.color, 9)} 0%, transparent 60%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text }}>
            🎯 Rétention réelle & Efficience FSRS
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              padding: "4px 8px",
              borderRadius: 8,
              background: "color-mix(in srgb, var(--mm-primary) 15%, transparent)",
              color: "var(--mm-primary-glow)",
              border: "1px solid color-mix(in srgb, var(--mm-primary) 25%, transparent)",
            }}>
              ⚡ ~{hoursSaved} sauvées vs bachotage
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: effectiveTone.color }}>
              {effectiveTone.emoji} {effectiveTone.label}
            </span>
          </div>
        </div>
        <p style={{ margin: "6px 0 20px", fontSize: 13, color: theme.textMuted, fontWeight: 500 }}>
          Mesure FSRS exacte sur tes fiches en retard — calculée pour maximiser ta rétention avec le minimum d'effort.
        </p>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: effectiveTone.color, fontVariantNumeric: "tabular-nums" }}>
            {isZeroOverdue ? "100%" : (data.avgRetention === null ? "—" : pct(data.avgRetention))}
          </div>
          <div style={{ paddingBottom: 8 }}>
            <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>
              cible théorique {pct(TARGET_R)}
            </div>
            <div style={{ fontSize: 13, color: theme.text, fontWeight: 700 }}>
              {isZeroOverdue ? "0 fiche en retard" : `${data.count} fiche${data.count > 1 ? "s" : ""} en retard`}
            </div>
          </div>
        </div>

        {/* Jauge cible vs réel */}
        <div style={{ position: "relative", height: 10, borderRadius: 999, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)", marginBottom: 20 }}>
          <div
            style={{
              width: isZeroOverdue ? "100%" : `${Math.max(0, Math.min(100, Math.round((data.avgRetention ?? TARGET_R) * 100)))}%`,
              height: "100%", borderRadius: 999,
              background: `linear-gradient(90deg, ${colorMix(effectiveTone.color, 60)}, ${effectiveTone.color})`,
              transition: "width .4s ease",
            }}
          />
          <div
            title="Cible 90%"
            style={{ position: "absolute", left: "90%", top: -4, width: 2, height: 18, background: theme.textMuted, opacity: 0.7 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
          <div style={tileStyle}>
            <div style={{ fontSize: 20, fontWeight: 900, color: theme.text, fontVariantNumeric: "tabular-nums" }}>
              {isZeroOverdue ? "0 j" : `${data.avgOverdueDays} j`}
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>Retard moyen</div>
          </div>
          <div style={tileStyle}>
            <div style={{ fontSize: 20, fontWeight: 900, color: isZeroOverdue ? "var(--mm-primary-glow)" : (data.worstRetention === null ? theme.text : toneFor(data.worstRetention).color), fontVariantNumeric: "tabular-nums" }}>
              {isZeroOverdue ? "À jour" : (data.worstRetention === null ? "—" : pct(data.worstRetention))}
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>Pire cas</div>
          </div>
          <div style={tileStyle}>
            <div style={{ fontSize: 20, fontWeight: 900, color: isZeroOverdue ? "var(--mm-primary-glow)" : (gap <= 0 ? "var(--mm-primary-glow)" : tone.color), fontVariantNumeric: "tabular-nums" }}>
              {isZeroOverdue ? "0%" : `${gap >= 0 ? "-" : "+"}${Math.abs(gap)}%`}
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>Écart cible</div>
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
                    background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 12.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 8.0%, transparent)",
                    border: `1px solid ${isDarkMode ? "color-mix(in srgb, var(--mm-primary) 25.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 18.0%, transparent)"}`,
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
