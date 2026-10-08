// StatsInsights.jsx — Panneau narratif "Insights" pour la vue Stats
// ─────────────────────────────────────────────────────────────────────────────
// Objectif : faire PARLER les données. Génère automatiquement 4-6 insights
// courts, actionnables, personnalisés, basés sur les données locales (aucune
// requête LLM — instantané et gratuit).
//
// Placé en haut de GodTierStats, juste après l'en-tête.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { getMasteryBreakdown, computeMasteryStage } from "../lib/masteryStages";
import { isCardMastered } from "../lib/cardStatus";

const CARD_COLORS = {
  positive: { border: "var(--mm-primary-glow)", icon: "🚀" },
  warning:  { border: "var(--mm-warning, #b3822f)", icon: "⚠️" },
  info:     { border: "var(--mm-primary)", icon: "💡" },
  goal:     { border: "var(--mm-primary)", icon: "🎯" },
  streak:   { border: "var(--mm-primary-deep)", icon: "🔥" },
};

function daysBetween(a, b) {
  const MS = 24 * 3600 * 1000;
  return Math.round((b - a) / MS);
}

function computeInsights({ expressions = [], sessionHistory = [], stats = {}, masteredCount = 0 }) {
  const now = Date.now();
  const total = expressions.length;
  const out = [];

  // ── 1. Vélocité d'apprentissage (7 vs 30 jours) ─────────────────────────
  const in7  = expressions.filter(e => {
    const t = new Date(e.createdAt || 0).getTime();
    return now - t < 7 * 24 * 3600 * 1000;
  }).length;
  const in30 = expressions.filter(e => {
    const t = new Date(e.createdAt || 0).getTime();
    return now - t < 30 * 24 * 3600 * 1000;
  }).length;
  const velocity30 = in30 / 30;
  const velocity7  = in7 / 7;
  if (in7 > 0) {
    if (velocity7 > velocity30 * 1.3 && velocity30 > 0) {
      out.push({
        kind: "positive",
        title: "Accélération nette 📈",
        body: `${in7} fiches créées cette semaine (+${Math.round((velocity7/velocity30 - 1)*100)}% vs ta moyenne 30j). Excellent élan d'enrichissement.`
      });
    } else if (velocity7 < velocity30 * 0.6 && in30 >= 5) {
      out.push({
        kind: "warning",
        title: "Rythme de création ralenti",
        body: `${in7} fiches ces 7 derniers jours (vs ~${Math.round(velocity30*7)} d'habitude). Une session express de 5 min permet de relancer la dynamique.`
      });
    } else {
      out.push({
        kind: "info",
        title: "Rythme de croisière",
        body: `Tu crées ~${velocity30.toFixed(1)} fiches / jour. À cette cadence, tu consolideras ${Math.round(velocity30*365)} notions en un an.`
      });
    }
  }

  // ── 2. Ancrage Long Terme FSRS (Stabilité >= 21 jours) ───────────────────
  const anchoredCount = expressions.filter(e => {
    const s = Number(e.fsrs?.stability || e.stability || e.fsrs_stability || 0);
    const interval = Number(e.interval || 0);
    return s >= 21 || interval >= 21 || isCardMastered(e);
  }).length;

  if (total >= 5 && anchoredCount > 0) {
    const anchorPct = Math.round((anchoredCount / total) * 100);
    out.push({
      kind: anchorPct >= 40 ? "positive" : "info",
      title: `Mémoire profonde : ${anchoredCount} fiches`,
      body: `${anchorPct}% de ton deck a franchi le cap des 3 semaines de stabilité FSRS. Ces notions sont désormais ancrées dans ta mémoire à long terme.`
    });
  }

  // ── 3. Précision de Rappel FSRS (Dernières révisions) ─────────────────────
  let recentTotal = 0;
  let recentSuccess = 0;
  expressions.forEach(e => {
    (e.reviewHistory || []).forEach(h => {
      recentTotal++;
      // Rating 3 = Good, 4 = Easy, ou rating >= 3
      const r = Number(h.rating ?? h.grade ?? (h.success ? 3 : 1));
      if (r >= 3) recentSuccess++;
    });
  });
  if (recentTotal >= 8) {
    const accuracy = Math.round((recentSuccess / recentTotal) * 100);
    if (accuracy >= 85) {
      out.push({
        kind: "positive",
        title: `Précision de rappel : ${accuracy}% 🎯`,
        body: `Calibrage idéal proche des 90% cibles de l'algorithme FSRS. Tu apprends sans sur-apprentissage inutile.`
      });
    } else {
      out.push({
        kind: "warning",
        title: `Précision de rappel : ${accuracy}% ⚡`,
        body: `Légèrement en-dessous de l'optimum FSRS (90%). Conseil : raccourcis tes sessions et espace les révisions difficiles.`
      });
    }
  }

  // ── 4. Streak & Discipline ───────────────────────────────────────────────
  const streak = stats.currentStreak ?? stats.streak ?? 0;
  if (streak >= 7) {
    out.push({
      kind: "streak",
      title: `${streak} jours consécutifs 🔥`,
      body: `Régularité exemplaire. Dans 3 jours, tu franchis le palier des ${streak+3} jours sans rupture.`
    });
  } else if (streak >= 1) {
    out.push({
      kind: "streak",
      title: `Série active : ${streak} jour${streak > 1 ? "s" : ""}`,
      body: `Encore ${7-streak} jour${7-streak > 1 ? "s" : ""} pour verrouiller le cap hebdomadaire. Même 1 seule carte maintient la flamme.`
    });
  }

  // ── 5. Prochain palier sans bug de projection ──────────────────────────
  const nextMilestone = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000].find(m => m > total);
  if (nextMilestone) {
    const missing = nextMilestone - total;
    const pace = Math.max(velocity7, velocity30, 0.5);
    const daysEst = Math.ceil(missing / pace);
    let timeStr = `${daysEst} jours`;
    if (daysEst > 60) {
      timeStr = `environ ${Math.round(daysEst / 30)} mois`;
    } else if (daysEst > 14) {
      timeStr = `environ ${Math.round(daysEst / 7)} semaines`;
    }

    out.push({
      kind: "goal",
      title: `Objectif ${nextMilestone} fiches (-${missing})`,
      body: `Au rythme actuel, cap franchi d'ici ${timeStr}. Ajoute 2 fiches de plus par jour pour diviser ce délai par deux.`
    });
  }

  // ── 6. Matière prioritaire & action ciblée ──────────────────────────────
  const perCat = {};
  expressions.forEach(e => {
    const cat = e.category || "Général";
    perCat[cat] = perCat[cat] || { total: 0, mastered: 0 };
    perCat[cat].total++;
    if (isCardMastered(e)) perCat[cat].mastered++;
  });
  const weakest = Object.entries(perCat)
    .filter(([, v]) => v.total >= 4)
    .map(([k, v]) => ({ cat: k, ratio: v.mastered / v.total, total: v.total, unmastered: v.total - v.mastered }))
    .sort((a, b) => a.ratio - b.ratio)[0];
  if (weakest && weakest.ratio < 0.5) {
    out.push({
      kind: "warning",
      title: `Focus recommandé : ${weakest.cat}`,
      body: `${weakest.unmastered} fiches sur ${weakest.total} demandent encore un renforcement. Lance 5 révisions ciblées dans cette catégorie aujourd'hui.`
    });
  }

  return out.slice(0, 6);
}

export default function StatsInsights({
  isDarkMode,
  theme,
  expressions = [],
  sessionHistory = [],
  stats = {},
  masteredCount = 0,
  // ── Phase 5 — Le breakdown "Production active" ne concerne que les matières
  // où la détection de production existe (anglais aujourd'hui). Sans filtre,
  // le ratio serait faussé pour les autres matières. Filtre paramétrable pour
  // ne pas casser un usage générique éventuel.
  productionCategoryFilter,
}) {
  const insights = useMemo(
    () => computeInsights({ expressions, sessionHistory, stats, masteredCount }),
    [expressions, sessionHistory, stats, masteredCount]
  );

  // ── Phase 5 — Production active : bar chart honnête X apprises / Y utilisées
  const productionSummary = useMemo(() => {
    const source = expressions || [];
    const list = typeof productionCategoryFilter === "function"
      ? source.filter(productionCategoryFilter)
      : source;
    // Enrichit à la volée pour rester juste même sans persistance de masteryStage
    const enriched = list.map(e => ({ ...e, masteryStage: e.masteryStage || computeMasteryStage(e) }));
    const breakdown = getMasteryBreakdown(enriched);
    const learned = enriched.filter(e => e.masteryStage !== "discovered").length;
    const usedInConversation = enriched.filter(e => e.masteryStage === "produced" || e.masteryStage === "mastered").length;
    return { breakdown, learned, usedInConversation, total: list.length };
  }, [expressions, productionCategoryFilter]);

  if (!insights.length && productionSummary.total === 0) return null;


  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        marginBottom: 24,
        padding: 24,
        borderRadius: 24,
        background: isDarkMode
          ? "var(--mm-bg-card, #171233)"
          : "var(--mm-bg-card, #ffffff)",
        border: `1px solid var(--mm-border)`,
        boxShadow: isDarkMode
          ? "0 12px 32px rgba(0,0,0,0.3)"
          : "0 12px 32px color-mix(in srgb, var(--mm-primary) 8.0%, transparent)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h3 style={{ margin: 0, color: theme?.text, fontSize: 20, fontWeight: 900, letterSpacing: "-0.3px" }}>
          ✨ Ce que tes données te disent
        </h3>
        <span style={{ fontSize: 12, color: theme?.textMuted, fontWeight: 600 }}>
          Généré à l'instant · 100% local
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 14,
      }}>
        {insights.map((it, i) => {
          const c = CARD_COLORS[it.kind] || CARD_COLORS.info;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                padding: 16,
                borderRadius: 16,
                background: isDarkMode ? "var(--mm-bg-elev, #110e22)" : "color-mix(in srgb, var(--mm-primary) 3%, white)",
                border: "1px solid var(--mm-border)",
                borderLeft: `4px solid ${c.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{c.icon}</span>
                <strong style={{ color: theme?.text, fontSize: 14, fontWeight: 800 }}>{it.title}</strong>
              </div>
              <p style={{ margin: 0, color: theme?.text, fontSize: 13, lineHeight: 1.5, opacity: 0.9 }}>
                {it.body}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Phase 5 — Production active : indicateur honnête */}
      {productionSummary.total > 0 && (
        <div style={{
          marginTop: 18, padding: 16, borderRadius: 16,
          background: isDarkMode ? "var(--mm-bg-elev, #110e22)" : "color-mix(in srgb, var(--mm-primary) 3%, white)",
          border: `1px solid var(--mm-border)`,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <strong style={{ color: theme?.text, fontSize: 15, fontWeight: 800 }}>
              🗣️ Production active
            </strong>
            <span style={{ color: theme?.textMuted, fontSize: 13 }}>
              <strong style={{ color: theme?.text }}>{productionSummary.learned}</strong> expressions apprises ·{" "}
              <strong style={{ color: "var(--mm-primary-glow)" }}>{productionSummary.usedInConversation}</strong> déjà utilisées en conversation
              {productionSummary.learned > 0 && (
                <> ({productionSummary.usedInConversation}/{productionSummary.learned})</>
              )}
            </span>
          </div>
          {/* Bar chart empilé simple */}
          {(() => {
            const b = productionSummary.breakdown;
            const total = Math.max(1, productionSummary.total);
            const segs = [
              { key: "discovered", label: "Découvertes", color: "var(--mm-fg-faint, #8b7fb5)", n: b.discovered },
              { key: "recognized", label: "Reconnues",   color: "var(--mm-primary-glow)", n: b.recognized },
              { key: "recalled",   label: "Rappelées",   color: "var(--mm-primary)", n: b.recalled },
              { key: "produced",   label: "Produites",   color: "var(--mm-accent, #4a7c74)", n: b.produced },
              { key: "mastered",   label: "Maîtrisées",  color: "var(--mm-warning, #b3822f)", n: b.mastered },
            ];
            return (
              <>
                <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }}>
                  {segs.map(s => s.n > 0 && (
                    <div key={s.key} title={`${s.label}: ${s.n}`}
                      style={{ width: `${(s.n / total) * 100}%`, background: s.color }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10, fontSize: 12, color: theme?.textMuted }}>
                  {segs.map(s => (
                    <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} />
                      {s.label} <strong style={{ color: theme?.text }}>{s.n}</strong>
                    </span>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </motion.div>
  );
}
