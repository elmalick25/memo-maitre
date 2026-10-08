import React from "react";
import { motion } from "framer-motion";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler, ArcElement, RadialLinearScale,
  Title, Tooltip, Legend
} from 'chart.js';
import { Bar, Line, Doughnut, PolarArea, Radar } from 'react-chartjs-2';
import { FsrsForecastChart, ComparisonVs30Days } from "../MemoMasterUpgrades";
import StatsInsights from "./StatsInsights";
import BacklogRetentionCard from "./BacklogRetentionCard";
import { englishCategoryFilter } from "../hooks/useProductiveUse";
import { colorMix } from "../lib/colorMix";

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler, ArcElement, RadialLinearScale,
  Title, Tooltip, Legend
);


// Couleurs Canvas-safe (HTML5 Canvas addColorStop et fillStyle ne supportent pas les variables CSS ni color-mix)
function colorWithAlpha(colorStr, alpha = 1) {
  if (!colorStr) return `rgba(139, 92, 246, ${alpha})`;
  if (colorStr.startsWith("#")) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  if (colorStr.startsWith("rgb(")) {
    return colorStr.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }
  if (colorStr.startsWith("rgba(")) {
    return colorStr.replace(/[\d.]+\)$/, `${alpha})`);
  }
  return colorStr;
}

export default function GodTierStats({
  isDarkMode,
  theme,
  stats,
  expressions,
  statsSessionHistory,
  computeAllStats,
  generateStatsAiReport,
  statsAiReportLoading,
  generateWeeklyDigest,
  statsAiReport,
  setStatsAiReport,
  showToast,
  callClaude,
  setExpressions,
  masteredCount,
  powerLevel,
  statsDailyProgress,
  statsModuleComparison,
  statsDifficultyDistribution,
  statsTopDifficult,
  statsDayOfWeekPerformance,
  statsRetentionCurve,
  dailyTarget = null,
  onOpenWeeklyDigest = null,
}) {
  // Container pour l'animation stagger
  const containerVars = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 }
    }
  };

  const itemVars = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  // Couleurs DOM basées sur le thème
  const primaryColor = "var(--mm-primary)";
  const primaryLight = "var(--mm-primary-glow)";
  const dangerColor = "var(--mm-danger, #a8422f)";
  const successColor = "var(--mm-primary-glow)";

  // Couleurs résolues pour les graphiques Canvas (Chart.js)
  const chartPrimary = React.useMemo(() => {
    if (typeof window !== "undefined") {
      const computed = getComputedStyle(document.documentElement).getPropertyValue("--mm-primary").trim();
      if (computed && !computed.startsWith("var(")) return computed;
    }
    return isDarkMode ? "#8b5cf6" : "#2563eb";
  }, [isDarkMode]);

  const chartPrimaryLight = React.useMemo(() => {
    if (typeof window !== "undefined") {
      const computed = getComputedStyle(document.documentElement).getPropertyValue("--mm-primary-glow").trim();
      if (computed && !computed.startsWith("var(")) return computed;
    }
    return isDarkMode ? "#a78bfa" : "#3b82f6";
  }, [isDarkMode]);

  // État et calculs pour la Matrice de Maîtrise des modules
  const [moduleViewMode, setModuleViewMode] = React.useState("list"); // 'list' | 'radar'
  const [showAllModules, setShowAllModules] = React.useState(false);

  const sortedModules = React.useMemo(() => {
    return [...statsModuleComparison].sort((a, b) => {
      const pctA = a.total > 0 ? (a.mastered / a.total) : 0;
      const pctB = b.total > 0 ? (b.mastered / b.total) : 0;
      return pctB - pctA || b.total - a.total;
    });
  }, [statsModuleComparison]);

  const top6Modules = React.useMemo(() => {
    return [...statsModuleComparison].sort((a, b) => b.total - a.total).slice(0, 6);
  }, [statsModuleComparison]);

  // Métriques mémoïsées pour l'activité et la difficulté
  const total30dReviews = React.useMemo(() => {
    return statsDailyProgress.reduce((a, d) => a + d.count, 0);
  }, [statsDailyProgress]);

  const active30dDays = React.useMemo(() => {
    return statsDailyProgress.filter(d => d.count > 0).length;
  }, [statsDailyProgress]);

  const difficultySpectrumColors = [
    "#38BDF8", // 0: Découverte
    "#60A5FA", // 1: Reconnaissance
    "#818CF8", // 2: Ancrage léger
    chartPrimary, // 3: Ancrage solide
    chartPrimaryLight, // 4: Maîtrise
    "#F59E0B", // 5: Effort soutenu
    "#F97316", // 6: Difficile
    dangerColor // 7: Leeches / Critique
  ];

  // ── Niveau 100 : Indicateurs de révision à haute valeur cognitive ──
  const cognitiveMetrics = React.useMemo(() => {
    let anchoredCards = 0;
    (expressions || []).forEach(e => {
      const s = Number(e.fsrs?.stability || e.stability || e.fsrs_stability || 0);
      const interval = Number(e.interval || 0);
      if (s >= 21 || interval >= 21) {
        anchoredCards++;
      }
    });

    const totalDeck = Math.max(1, (expressions || []).length);
    const aiSharePct = Math.round(((stats?.aiGenerated || 0) / totalDeck) * 100);
    const todayReviews = (statsDailyProgress && statsDailyProgress.length > 0)
      ? (statsDailyProgress[statsDailyProgress.length - 1]?.count || 0)
      : 0;

    return {
      anchoredCards,
      aiSharePct,
      todayReviews
    };
  }, [expressions, stats?.aiGenerated, statsDailyProgress]);
  
  // Styles Glassmorphism Premium
  const glassCardStyle = {
    background: isDarkMode ? "var(--mm-bg-card, #171233)" : "var(--mm-bg-card, #ffffff)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderRadius: 24,
    padding: 24,
    border: `1px solid var(--mm-border)`,
    boxShadow: isDarkMode ? "0 8px 32px rgba(0,0,0,0.3)" : "0 8px 32px color-mix(in srgb, var(--mm-primary) 8.0%, transparent)",
    position: "relative",
    overflow: "hidden"
  };

  const chartTextColor = isDarkMode ? "#F8FAFF" : "#0F172A";
  const chartTextMuted = isDarkMode ? "#94a3b8" : "#64748b";
  const chartTooltipBg = isDarkMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const chartBorderColor = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

  return (
    <motion.div 
      variants={containerVars}
      initial="hidden"
      animate="show"
      style={{ 
        paddingBottom: "calc(140px + env(safe-area-inset-bottom, 24px))",
        maxWidth: 1200,
        margin: "0 auto",
        paddingLeft: 12,
        paddingRight: 12
      }}
    >
      {/* ─── EN-TÊTE COCKPIT HAUTE PRÉCISION ─── */}
      <motion.div variants={itemVars} style={{ 
        display: "flex", 
        flexDirection: "column",
        gap: 20, 
        marginBottom: 24, 
        background: isDarkMode 
          ? "linear-gradient(135deg, var(--mm-bg-card, #171233) 0%, var(--mm-bg-elev, #110e22) 100%)" 
          : "linear-gradient(135deg, #FFFFFF 0%, color-mix(in srgb, var(--mm-primary) 6%, white) 100%)", 
        padding: "24px 20px", 
        borderRadius: 28, 
        border: `1px solid var(--mm-border)`,
        boxShadow: isDarkMode 
          ? "0 20px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)" 
          : "0 20px 45px color-mix(in srgb, var(--mm-primary) 10%, transparent), inset 0 1px 0 rgba(255,255,255,0.8)", 
        position: "relative", 
        overflow: "hidden" 
      }}>
        <div style={{ 
          position: "absolute", 
          top: "-40%", 
          right: "-10%", 
          width: 260, 
          height: 260, 
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colorWithAlpha(chartPrimary, isDarkMode ? 0.2 : 0.12)} 0%, transparent 70%)`, 
          pointerEvents: "none",
          filter: "blur(20px)"
        }} />
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: colorWithAlpha(chartPrimary, isDarkMode ? 0.2 : 0.1), border: `1px solid ${colorWithAlpha(chartPrimary, 0.25)}`, marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--mm-primary-glow)", boxShadow: "0 0 8px var(--mm-primary-glow)" }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: chartPrimary, letterSpacing: 0.5, textTransform: "uppercase" }}>FSRS Engine v5</span>
            </div>
            <h1 style={{ fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 900, color: theme.text, margin: 0, letterSpacing: "-0.5px" }}>
              L'Intelligence
            </h1>
            <p style={{ color: theme.textMuted, fontSize: 14, margin: "4px 0 0", fontWeight: 500 }}>
              Analyse de ton évolution et de ta rétention cognitive.
            </p>
          </div>

          {/* Barre d'outils fluide */}
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: "100%", flexWrap: "wrap" }}>
            <button 
              onClick={computeAllStats} 
              style={{ flex: "1 1 auto", minHeight: 44, padding: "10px 16px", background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${theme.border}`, borderRadius: 14, color: theme.text, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "transform 0.15s, background 0.2s" }}
            >
              <span>🔄</span> <span>Sync</span>
            </button>

            <button 
              onClick={generateStatsAiReport} 
              disabled={statsAiReportLoading} 
              style={{ flex: "2 1 140px", minHeight: 44, padding: "10px 18px", background: `linear-gradient(135deg, ${chartPrimaryLight}, ${chartPrimary})`, color: "#fff", border: "none", borderRadius: 14, fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: `0 8px 20px ${colorWithAlpha(chartPrimary, 0.35)}`, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <span>{statsAiReportLoading ? "⏳" : "🔮"}</span>
              <span>{statsAiReportLoading ? "Analyse..." : "Oracle IA"}</span>
            </button>
            
            <button 
              onClick={async () => {
                try {
                  const text = await generateWeeklyDigest({ expressions, sessionHistory: statsSessionHistory, stats, callClaude });
                  setStatsAiReport(typeof text === "string" ? { summary: text } : text);
                  showToast("🎁 Éphéméride gravée", "success");
                } catch (e) { showToast("Erreur oracle", "error"); }
              }} 
              style={{ flex: "1 1 auto", minHeight: 44, padding: "10px 16px", background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${theme.border}`, borderRadius: 14, color: theme.text, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <span>📜</span> <span>Éphéméride</span>
            </button>

            {onOpenWeeklyDigest && (
              <button 
                onClick={onOpenWeeklyDigest}
                style={{
                  flex: "1 1 auto",
                  minHeight: 44,
                  padding: "10px 16px",
                  background: isDarkMode ? "rgba(99, 102, 241, 0.16)" : "rgba(99, 102, 241, 0.08)",
                  border: `1px solid ${isDarkMode ? "rgba(99, 102, 241, 0.35)" : "rgba(99, 102, 241, 0.2)"}`,
                  borderRadius: 14,
                  color: isDarkMode ? "#C7D2FE" : "#4338CA",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "transform 0.15s, background 0.2s"
                }}
              >
                <span>📋</span> <span>Bilan Hebdo</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ─── RÉTENTION RÉELLE DU BACKLOG (Couche 8) ─── */}
      <motion.div variants={itemVars}>
        <BacklogRetentionCard
          isDarkMode={isDarkMode}
          theme={theme}
          expressions={expressions}
          dailyTarget={dailyTarget}
        />
      </motion.div>

      {/* ─── INSIGHTS NARRATIFS + PRODUCTION ACTIVE (Phase 5) ─── */}
      <motion.div variants={itemVars}>
        <StatsInsights
          isDarkMode={isDarkMode}
          theme={theme}
          expressions={expressions}
          sessionHistory={statsSessionHistory}
          stats={stats}
          masteredCount={masteredCount}
          productionCategoryFilter={englishCategoryFilter}
        />
      </motion.div>

      {/* ─── REPORT IA (SI ACTIF) ─── */}
      {statsAiReport && (
        <motion.div variants={itemVars} style={{ 
          background: isDarkMode ? "linear-gradient(135deg, color-mix(in srgb, var(--mm-primary) 10.0%, transparent), var(--mm-bg-card, #171233))" : "linear-gradient(135deg, #FFFFFF, color-mix(in srgb, var(--mm-primary) 4%, white))", 
          borderRadius: 24, padding: 32, 
          border: `1px solid var(--mm-border)`, 
          marginBottom: 32, position: "relative" 
        }}>
          <h3 style={{ color: primaryColor, marginTop: 0, fontSize: 20, fontWeight: 900 }}>🧠 Rapport IA & Diagnostic</h3>
          
          {statsAiReport.summary && (
            <div style={{ color: theme.text, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-line", marginBottom: statsAiReport.verdict ? 20 : 0 }}>
              {statsAiReport.summary}
            </div>
          )}

          {statsAiReport.verdict && (
            <p style={{ fontStyle: "italic", color: theme.text, fontSize: 16, lineHeight: 1.5, marginBottom: 24 }}>{statsAiReport.verdict}</p>
          )}

          {(statsAiReport.strengths || statsAiReport.weakness) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 24 }}>
              {statsAiReport.strengths && (
                <div style={{ background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 12%, transparent)" : "color-mix(in srgb, var(--mm-primary) 6%, white)", padding: 20, borderRadius: 16, border: `1px solid var(--mm-border)` }}>
                  <h4 style={{ color: "var(--mm-primary-glow)", margin: "0 0 12px 0" }}>💪 Forces</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, color: theme.text }}>
                    {statsAiReport.strengths.map((s, i) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}
                  </ul>
                </div>
              )}
              {statsAiReport.weakness && (
                <div style={{ background: isDarkMode ? "color-mix(in srgb, var(--mm-danger, #a8422f) 12%, transparent)" : "color-mix(in srgb, var(--mm-danger, #a8422f) 6%, white)", padding: 20, borderRadius: 16, border: `1px solid var(--mm-border)` }}>
                  <h4 style={{ color: dangerColor, margin: "0 0 12px 0" }}>⚠️ Points d'attention</h4>
                  <p style={{ margin: 0, color: theme.text }}>{statsAiReport.weakness}</p>
                </div>
              )}
            </div>
          )}

          {(statsAiReport.tip || (statsAiReport.plan && statsAiReport.plan.length > 0)) && (
            <div style={{ marginTop: 24, padding: 20, background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: 16, border: `1px solid var(--mm-border)` }}>
              {statsAiReport.tip && <p style={{ margin: "0 0 16px 0", color: theme.text }}><strong>💡 Conseil :</strong> {statsAiReport.tip}</p>}
              {statsAiReport.plan && statsAiReport.plan.length > 0 && (
                <>
                  <h4 style={{ margin: "0 0 12px 0", color: theme.text }}>📋 Plan d'action recommandé</h4>
                  <ol style={{ margin: 0, paddingLeft: 20, color: theme.text }}>
                    {statsAiReport.plan.map((p, i) => <li key={i} style={{ marginBottom: 6 }}>{p}</li>)}
                  </ol>
                </>
              )}
            </div>
          )}
          <button onClick={() => setStatsAiReport(null)} style={{ position: "absolute", top: 24, right: 24, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)", border: "none", color: theme.text, cursor: "pointer", width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>✕</button>
        </motion.div>
      )}

      {/* ─── VUE D'ENSEMBLE (BENTO GRID) ─── */}
      <motion.div variants={itemVars} style={{ ...glassCardStyle, marginBottom: 24, padding: "20px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: theme.text, fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span>⚡</span> Métriques Clés
          </h3>
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", padding: "3px 8px", borderRadius: 8 }}>
            Temps réel
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {/* KPI 1 : Streak */}
          <div style={{ background: isDarkMode ? "var(--mm-bg-elev, #110e22)" : "color-mix(in srgb, var(--mm-primary) 3%, white)", borderRadius: 18, padding: "14px 12px", border: `1px solid var(--mm-border)`, position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Streak</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: chartPrimary, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {stats.streak}<span style={{ fontSize: 14, fontWeight: 700, marginLeft: 2 }}>j</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mm-primary-glow)", marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}>
              <span>🔥</span> Discipline FSRS
            </div>
          </div>

          {/* KPI 2 : Maîtrisées & Mémoire Profonde */}
          <div style={{ background: isDarkMode ? "var(--mm-bg-elev, #110e22)" : "color-mix(in srgb, var(--mm-primary) 3%, white)", borderRadius: 18, padding: "14px 12px", border: `1px solid var(--mm-border)` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Maîtrisées</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: theme.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {masteredCount}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, marginTop: 4 }}>
              {cognitiveMetrics.anchoredCards > 0 ? `${cognitiveMetrics.anchoredCards} ancrées (S ≥ 21j)` : `sur ${expressions.length} notions`}
            </div>
          </div>

          {/* KPI 3 : Révisions & Activité Récente */}
          <div style={{ background: isDarkMode ? "var(--mm-bg-elev, #110e22)" : "color-mix(in srgb, var(--mm-primary) 3%, white)", borderRadius: 18, padding: "14px 12px", border: `1px solid var(--mm-border)` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Révisions</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: theme.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {stats.totalReviews}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: cognitiveMetrics.todayReviews > 0 ? "var(--mm-primary-glow)" : theme.textMuted, marginTop: 4 }}>
              {cognitiveMetrics.todayReviews > 0 ? `+${cognitiveMetrics.todayReviews} aujourd'hui` : "Volume optimisé"}
            </div>
          </div>

          {/* KPI 4 : Cartes IA & Part Deck */}
          <div style={{ background: isDarkMode ? "var(--mm-bg-elev, #110e22)" : "color-mix(in srgb, var(--mm-primary) 3%, white)", borderRadius: 18, padding: "14px 12px", border: `1px solid var(--mm-border)` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Générées IA</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: chartPrimary, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {stats.aiGenerated || 0}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, marginTop: 4 }}>
              {cognitiveMetrics.aiSharePct > 0 ? `${cognitiveMetrics.aiSharePct}% du deck actif` : "Second Cerveau"}
            </div>
          </div>
        </div>
        
        {/* Power Level Bar Sublimée */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: chartPrimary, background: colorWithAlpha(chartPrimary, 0.15), padding: "2px 8px", borderRadius: 6 }}>
                Niv. {Math.floor(powerLevel / 1000) + 1}
              </span>
              <span style={{ fontWeight: 700, color: theme.textMuted, fontSize: 12 }}>POWER LEVEL</span>
            </div>
            <span style={{ fontWeight: 900, color: theme.text, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
              {powerLevel} <span style={{ fontSize: 11, color: theme.textMuted }}>XP</span>
            </span>
          </div>
          <div style={{ height: 8, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", borderRadius: 999, overflow: "hidden", position: "relative" }}>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, ((powerLevel % 1000) / 1000) * 100)}%` }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ height: "100%", background: `linear-gradient(90deg, ${chartPrimary}, ${chartPrimaryLight})`, borderRadius: 999, boxShadow: `0 0 10px ${colorWithAlpha(chartPrimary, 0.6)}` }} 
            />
          </div>
        </div>
      </motion.div>

        {/* ─── ACTIVITÉ (30 JOURS) AVEC RÉGULARITÉ FSRS ─── */}
        <motion.div variants={itemVars} style={{ ...glassCardStyle, gridColumn: "1 / -1", marginBottom: 24, padding: "22px 18px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, color: theme.text, fontWeight: 900, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📈</span> Activité & Régularité (30 jours)
              </h3>
              <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>
                Volume de répétition et constance FSRS
              </span>
            </div>

            {/* Badges de performance */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", padding: "4px 10px", borderRadius: 10, border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)"}` }}>
                <span style={{ fontSize: 11, color: theme.textMuted }}>Total : </span>
                <strong style={{ fontSize: 12, color: chartPrimary, fontVariantNumeric: "tabular-nums" }}>{total30dReviews}</strong>
              </div>
              <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", padding: "4px 10px", borderRadius: 10, border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)"}` }}>
                <span style={{ fontSize: 11, color: theme.textMuted }}>Régularité : </span>
                <strong style={{ fontSize: 12, color: "var(--mm-primary-glow)", fontVariantNumeric: "tabular-nums" }}>{active30dDays}/30 j</strong>
              </div>
              <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", padding: "4px 10px", borderRadius: 10, border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)"}` }}>
                <span style={{ fontSize: 11, color: theme.textMuted }}>Moy. : </span>
                <strong style={{ fontSize: 12, color: theme.text, fontVariantNumeric: "tabular-nums" }}>
                  {(total30dReviews / Math.max(1, statsDailyProgress.length)).toFixed(1)}/j
                </strong>
              </div>
            </div>
          </div>

          <div style={{ height: 210, width: "100%" }}>
            <Line
              data={{
                labels: statsDailyProgress.map(d => d.date.slice(5)),
                datasets: [{
                  label: 'Révisions',
                  data: statsDailyProgress.map(d => d.count),
                  borderColor: chartPrimary,
                  borderWidth: 2.5,
                  pointRadius: 1,
                  pointHoverRadius: 6,
                  pointHoverBackgroundColor: chartPrimary,
                  pointHoverBorderColor: "#ffffff",
                  pointHoverBorderWidth: 2,
                  tension: 0.38,
                  fill: true,
                  backgroundColor: (ctx) => {
                    const { chart } = ctx;
                    const { ctx: c, chartArea } = chart;
                    if (!chartArea) return colorWithAlpha(chartPrimary, 0.15);
                    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    g.addColorStop(0, colorWithAlpha(chartPrimary, 0.45));
                    g.addColorStop(0.8, colorWithAlpha(chartPrimary, 0.04));
                    g.addColorStop(1, colorWithAlpha(chartPrimary, 0));
                    return g;
                  },
                }]
              }}
              options={{
                responsive: true, 
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: chartTooltipBg, 
                    titleColor: chartTextColor, 
                    bodyColor: chartTextColor,
                    borderColor: chartBorderColor, 
                    borderWidth: 1, 
                    padding: 12, 
                    displayColors: false,
                    cornerRadius: 12,
                    callbacks: { label: (ctx) => `⚡ ${ctx.raw} révisions ce jour` }
                  }
                },
                scales: {
                  x: { 
                    grid: { display: false }, 
                    ticks: { color: chartTextMuted, maxTicksLimit: 7, font: { weight: 'bold', size: 10 } } 
                  },
                  y: { 
                    grid: { color: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", drawBorder: false }, 
                    ticks: { color: chartTextMuted, font: { size: 10 }, maxTicksLimit: 4 }, 
                    beginAtZero: true 
                  }
                }
              }}
            />
          </div>
        </motion.div>

      
      {/* ─── MATRICE DE MAÎTRISE PAR MODULE (FSRS Matrix) ─── */}
      <motion.div variants={itemVars} style={{ ...glassCardStyle, marginBottom: 24, padding: "22px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, color: theme.text, fontWeight: 900, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
              <span>📚</span> Maîtrise par Module
            </h3>
            <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>
              {statsModuleComparison.length} modules suivis en temps réel
            </span>
          </div>

          {/* Toggle d'affichage */}
          <div style={{ display: "inline-flex", background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderRadius: 12, padding: 3, border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"}` }}>
            <button
              onClick={() => setModuleViewMode("list")}
              style={{ padding: "6px 12px", borderRadius: 9, border: "none", background: moduleViewMode === "list" ? chartPrimary : "transparent", color: moduleViewMode === "list" ? "#fff" : theme.textMuted, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
            >
              📊 Liste
            </button>
            <button
              onClick={() => setModuleViewMode("radar")}
              style={{ padding: "6px 12px", borderRadius: 9, border: "none", background: moduleViewMode === "radar" ? chartPrimary : "transparent", color: moduleViewMode === "radar" ? "#fff" : theme.textMuted, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
            >
              🕸️ Radar (Top 6)
            </button>
          </div>
        </div>

        {moduleViewMode === "list" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(showAllModules ? sortedModules : sortedModules.slice(0, 5)).map(mod => {
              const pct = mod.total > 0 ? Math.round((mod.mastered / mod.total) * 100) : 0;
              const color = pct >= 80 ? "var(--mm-primary-glow)" : pct >= 50 ? chartPrimary : "var(--mm-warning, #b3822f)";
              const statusLabel = pct >= 80 ? "Maîtrisé" : pct >= 50 ? "En cours" : "À consolider";

              return (
                <div 
                  key={mod.name} 
                  style={{ 
                    background: isDarkMode ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.7)", 
                    borderRadius: 16, 
                    padding: "12px 14px", 
                    border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
                    transition: "transform 0.15s ease"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, color: theme.text, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      {mod.name}
                      {mod.due > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#EF4444", background: "rgba(239, 68, 68, 0.12)", padding: "1px 6px", borderRadius: 6 }}>
                          {mod.due} due{mod.due > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color, background: colorWithAlpha(color, 0.12), padding: "2px 8px", borderRadius: 6 }}>
                        {statusLabel}
                      </span>
                      <span style={{ fontWeight: 900, fontSize: 13, color: theme.text, fontVariantNumeric: "tabular-nums" }}>
                        {pct}%
                      </span>
                    </div>
                  </div>

                  {/* Jauge FSRS fluide */}
                  <div style={{ height: 6, width: "100%", background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", borderRadius: 999, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999, transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>
                    <span>{mod.mastered} sur {mod.total} fiches</span>
                    {mod.avgDiff && <span>Diff. moy. : {Number(mod.avgDiff).toFixed(1)}/10</span>}
                  </div>
                </div>
              );
            })}

            {sortedModules.length > 5 && (
              <button
                onClick={() => setShowAllModules(!showAllModules)}
                style={{ marginTop: 6, padding: "10px", background: "transparent", border: `1px dashed ${isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, borderRadius: 12, color: chartPrimary, fontWeight: 800, fontSize: 12, cursor: "pointer" }}
              >
                {showAllModules ? "▲ Réduire l'affichage" : `▼ Afficher tous les modules (${sortedModules.length})`}
              </button>
            )}
          </div>
        ) : (
          <div style={{ height: 300, width: "100%", display: "flex", justifyContent: "center" }}>
            <Radar 
              data={{
                labels: top6Modules.map(mod => mod.name),
                datasets: [{
                  label: 'Maîtrisées',
                  data: top6Modules.map(mod => mod.total > 0 ? (mod.mastered / mod.total) * 100 : 0),
                  backgroundColor: colorWithAlpha(chartPrimary, 0.33),
                  borderColor: chartPrimary,
                  pointBackgroundColor: chartPrimaryLight,
                  pointBorderColor: "#fff",
                  borderWidth: 2,
                }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  r: {
                    angleLines: { color: chartBorderColor },
                    grid: { color: chartBorderColor },
                    pointLabels: { color: chartTextMuted, font: { weight: 'bold', size: 11 } },
                    ticks: { display: false, min: 0, max: 100, stepSize: 25 }
                  }
                }
              }}
            />
          </div>
        )}
      </motion.div>

      {/* ─── SPECTRE DE DIFFICULTÉ DES NIVEAUX (0-7) ─── */}
      <motion.div variants={itemVars} style={{ ...glassCardStyle, marginBottom: 24, padding: "22px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, color: theme.text, fontWeight: 900, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
              <span>💀</span> Spectre de Difficulté (Niveaux 0-7)
            </h3>
            <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>
              Répartition de la charge mentale par palier de rétention
            </span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--mm-primary-glow)", background: colorWithAlpha(chartPrimary, 0.15), padding: "3px 8px", borderRadius: 8 }}>
            Stabilisation continue
          </div>
        </div>

        <div style={{ height: 230, width: "100%" }}>
          <Bar 
            data={{
              labels: statsDifficultyDistribution.map((_, i) => `Niv ${i}`),
              datasets: [{
                label: 'Cartes',
                data: statsDifficultyDistribution.map(d => d.count),
                backgroundColor: statsDifficultyDistribution.map((_, i) => difficultySpectrumColors[i] || chartPrimary),
                borderRadius: 8,
                borderSkipped: false,
              }]
            }}
            options={{
              responsive: true, 
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: chartTooltipBg, 
                  titleColor: chartTextColor, 
                  bodyColor: chartTextColor,
                  borderColor: chartBorderColor, 
                  borderWidth: 1, 
                  padding: 12, 
                  displayColors: false,
                  cornerRadius: 12,
                  callbacks: { 
                    title: (ctx) => `Palier ${ctx[0].label}`, 
                    label: (ctx) => `${ctx.raw} cartes (${expressions.length > 0 ? Math.round((ctx.raw / expressions.length) * 100) : 0}%)` 
                  }
                }
              },
              scales: {
                x: { 
                  grid: { display: false }, 
                  ticks: { color: chartTextMuted, font: { weight: 'bold', size: 11 } } 
                },
                y: { 
                  grid: { color: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" }, 
                  ticks: { color: chartTextMuted, font: { size: 10 } }, 
                  beginAtZero: true 
                }
              }
            }}
          />
        </div>
      </motion.div>

      {/* ─── RYTHME HEBDOMADAIRE (POLAR AREA) ─── */}
      <motion.div variants={itemVars} style={{ ...glassCardStyle, marginBottom: 24, padding: "22px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: theme.text, fontWeight: 900, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📅</span> Rythme Hebdomadaire
          </h3>
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>
            Répartition par jour
          </span>
        </div>
        <div style={{ height: 320, width: "100%", display: "flex", justifyContent: "center" }}>
          <PolarArea 
            data={{
              labels: statsDayOfWeekPerformance.map(d => d.name),
              datasets: [{
                label: 'Révisions',
                data: statsDayOfWeekPerformance.map(d => d.reviews),
                backgroundColor: [
                  colorWithAlpha(chartPrimary, 0.75), 
                  colorWithAlpha(chartPrimaryLight, 0.75), 
                  "#EC4899CC", 
                  "#F43F5ECC", 
                  "#F59E0BCC", 
                  colorWithAlpha(chartPrimary, 0.55), 
                  "#14B8A6CC"
                ],
                borderWidth: 1.5,
                borderColor: isDarkMode ? "var(--mm-bg, #07060f)" : "#FFFFFF",
              }]
            }}
            options={{
              responsive: true, 
              maintainAspectRatio: false,
              plugins: {
                legend: { 
                  position: 'bottom', 
                  labels: { 
                    color: chartTextMuted, 
                    font: { weight: 'bold', size: 11 }, 
                    boxWidth: 12, 
                    padding: 10 
                  } 
                },
                tooltip: {
                  backgroundColor: chartTooltipBg, 
                  titleColor: chartTextColor, 
                  bodyColor: chartTextColor,
                  borderColor: chartBorderColor, 
                  borderWidth: 1, 
                  padding: 12, 
                  displayColors: false,
                  cornerRadius: 12,
                  callbacks: { label: (ctx) => `📅 ${ctx.raw} révisions ce jour` }
                }
              },
              scales: {
                r: {
                  grid: { color: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" },
                  ticks: { display: false },
                  angleLines: { color: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }
                }
              }
            }}
          />
        </div>
      </motion.div>

{/* ─── CHARTS EXPERTS ─── */}
      <motion.div variants={itemVars} style={{ marginBottom: 20 }}>
        <FsrsForecastChart expressions={expressions} theme={theme} isDarkMode={isDarkMode} />
      </motion.div>
      <motion.div variants={itemVars} style={{ marginBottom: 20 }}>
        <ComparisonVs30Days sessionHistory={statsSessionHistory} expressions={expressions} theme={theme} isDarkMode={isDarkMode} />
      </motion.div>

        
    </motion.div>
  );
}
