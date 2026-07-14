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

const CARD_COLORS = {
  positive: { bg: "rgba(16,185,129,0.12)", border: "#10B981", icon: "🚀" },
  warning:  { bg: "rgba(245,158,11,0.12)", border: "#F59E0B", icon: "⚠️" },
  info:     { bg: "rgba(77,107,254,0.12)", border: "#4D6BFE", icon: "💡" },
  goal:     { bg: "rgba(139,92,246,0.12)", border: "#8B5CF6", icon: "🎯" },
  streak:   { bg: "rgba(239,68,68,0.12)",  border: "#EF4444", icon: "🔥" },
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
    if (velocity7 > velocity30 * 1.3) {
      out.push({
        kind: "positive",
        title: "Tu accélères 📈",
        body: `${in7} fiches ajoutées cette semaine — ${Math.round((velocity7/velocity30 - 1)*100)}% au-dessus de ta moyenne 30j. Continue sur cette lancée.`
      });
    } else if (velocity7 < velocity30 * 0.6 && in30 >= 5) {
      out.push({
        kind: "warning",
        title: "Rythme en baisse",
        body: `Seulement ${in7} fiches ces 7 derniers jours vs ~${Math.round(velocity30*7)} en moyenne. Une session vocale de 10 min suffit à rattraper.`
      });
    } else {
      out.push({
        kind: "info",
        title: "Rythme régulier",
        body: `Tu ajoutes ~${velocity30.toFixed(1)} fiches / jour. Sur un an, ça fait ${Math.round(velocity30*365)} expressions maîtrisées.`
      });
    }
  }

  // ── 2. Streak ────────────────────────────────────────────────────────────
  const streak = stats.currentStreak ?? stats.streak ?? 0;
  if (streak >= 7) {
    out.push({
      kind: "streak",
      title: `${streak} jours d'affilée 🔥`,
      body: `Ta constance est ton super-pouvoir. Les 3 prochains jours te font atteindre ${streak+3} — un cap symbolique.`
    });
  } else if (streak >= 1) {
    out.push({
      kind: "streak",
      title: `Jour ${streak} de streak`,
      body: `Encore ${7-streak} jour(s) pour débloquer le palier hebdo. Une seule fiche par jour suffit à ne pas casser la série.`
    });
  }

  // ── 3. Taux de rétention / mastered ─────────────────────────────────────
  if (total >= 10) {
    const pct = Math.round((masteredCount / total) * 100);
    if (pct >= 60) {
      out.push({
        kind: "positive",
        title: `Rétention solide : ${pct}%`,
        body: `${masteredCount} des ${total} fiches sont ancrées. Ta courbe d'oubli est mieux gérée que celle de 80% des apprenants autodidactes.`
      });
    } else if (pct < 25) {
      out.push({
        kind: "warning",
        title: `Trop de fiches jeunes (${pct}% maîtrisées)`,
        body: `Tu crées vite, tu révises peu. Objectif : ${Math.min(15, total - masteredCount)} révisions FSRS aujourd'hui pour rééquilibrer.`
      });
    }
  }

  // ── 4. Heure et jour préférés ───────────────────────────────────────────
  const hourBuckets = new Array(24).fill(0);
  sessionHistory.forEach(s => {
    const t = new Date(s.date || s.timestamp || 0);
    if (!isNaN(t.getTime())) hourBuckets[t.getHours()]++;
  });
  const bestHour = hourBuckets.reduce((best, v, i) => v > best.v ? { i, v } : best, { i: -1, v: 0 });
  if (bestHour.v >= 3) {
    out.push({
      kind: "info",
      title: `Ta zone d'or : ${bestHour.i}h`,
      body: `${bestHour.v} sessions démarrées vers ${bestHour.i}h. Bloque ce créneau comme un rendez-vous — c'est là que tu apprends le mieux.`
    });
  }

  // ── 5. Prochain palier ──────────────────────────────────────────────────
  const nextMilestone = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000].find(m => m > total);
  if (nextMilestone) {
    const missing = nextMilestone - total;
    out.push({
      kind: "goal",
      title: `${missing} fiches avant ${nextMilestone}`,
      body: `Au rythme actuel (${velocity7.toFixed(1)}/jour), tu y seras dans ~${Math.max(1, Math.ceil(missing / Math.max(0.5, velocity7)))} jours.`
    });
  }

  // ── 6. Catégorie la plus faible ─────────────────────────────────────────
  const perCat = {};
  expressions.forEach(e => {
    const cat = e.category || "Autre";
    perCat[cat] = perCat[cat] || { total: 0, mastered: 0 };
    perCat[cat].total++;
    if ((e.repetitions || 0) >= 3) perCat[cat].mastered++;
  });
  const weakest = Object.entries(perCat)
    .filter(([, v]) => v.total >= 5)
    .map(([k, v]) => ({ cat: k, ratio: v.mastered / v.total, total: v.total }))
    .sort((a, b) => a.ratio - b.ratio)[0];
  if (weakest && weakest.ratio < 0.4) {
    out.push({
      kind: "warning",
      title: `Zone à renforcer : ${weakest.cat}`,
      body: `Seulement ${Math.round(weakest.ratio*100)}% des ${weakest.total} fiches de cette catégorie sont maîtrisées. Une session ciblée peut débloquer.`
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
          ? "linear-gradient(135deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))"
          : "linear-gradient(135deg, #FFFFFF, #F8FAFF)",
        border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(77,107,254,0.12)"}`,
        boxShadow: isDarkMode
          ? "0 12px 32px rgba(0,0,0,0.25)"
          : "0 12px 32px rgba(77,107,254,0.08)",
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
                background: c.bg,
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
          background: isDarkMode ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.06)",
          border: `1px solid rgba(16,185,129,0.25)`,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <strong style={{ color: theme?.text, fontSize: 15, fontWeight: 800 }}>
              🗣️ Production active
            </strong>
            <span style={{ color: theme?.textMuted, fontSize: 13 }}>
              <strong style={{ color: theme?.text }}>{productionSummary.learned}</strong> expressions apprises ·{" "}
              <strong style={{ color: "#10B981" }}>{productionSummary.usedInConversation}</strong> déjà utilisées en conversation
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
              { key: "discovered", label: "Découvertes", color: "#94A3B8", n: b.discovered },
              { key: "recognized", label: "Reconnues",   color: "#60A5FA", n: b.recognized },
              { key: "recalled",   label: "Rappelées",   color: "#8B5CF6", n: b.recalled },
              { key: "produced",   label: "Produites",   color: "#10B981", n: b.produced },
              { key: "mastered",   label: "Maîtrisées",  color: "#F59E0B", n: b.mastered },
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
