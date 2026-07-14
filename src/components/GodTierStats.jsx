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
import { englishCategoryFilter } from "../hooks/useProductiveUse";

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler, ArcElement, RadialLinearScale,
  Title, Tooltip, Legend
);


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
  statsRetentionCurve
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

  // Couleurs basées sur le thème de l'app (et non un neon cyberpunk)
  const primaryColor = "#4D6BFE";
  const primaryLight = "#6B82F5";
  const dangerColor = "#EF4444";
  const successColor = "#10B981";
  
  // Styles Glassmorphism Premium
  const glassCardStyle = {
    background: isDarkMode ? "rgba(15, 23, 42, 0.6)" : "rgba(255, 255, 255, 0.7)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderRadius: 24,
    padding: 24,
    border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"}`,
    boxShadow: isDarkMode ? "0 8px 32px rgba(0,0,0,0.2)" : "0 8px 32px rgba(77,107,254,0.08)",
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
      style={{ paddingBottom: 40 }}
    >
      {/* ─── EN-TÊTE ORACLE ─── */}
      <motion.div variants={itemVars} style={{ 
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24, 
        marginBottom: 32, 
        background: isDarkMode ? `linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.95))` : `linear-gradient(135deg, #F8FAFF, #EEF2FF)`, 
        padding: "36px", borderRadius: 32, 
        border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.15)"}`,
        boxShadow: isDarkMode ? "0 20px 50px rgba(0,0,0,0.4)" : "0 20px 50px rgba(77,107,254,0.15)", 
        position: "relative", overflow: "hidden" 
      }}>
        <div style={{ position: "absolute", top: "-50%", right: "-20%", width: "100%", height: "200%", background: `radial-gradient(circle, ${primaryColor}15 0%, transparent 60%)`, pointerEvents: "none" }} />
        
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: theme.text, marginBottom: 8, letterSpacing: "-1px" }}>
            🧠 L'Intelligence
          </h1>
          <p style={{ color: theme.textMuted, fontSize: 16, margin: 0, fontWeight: 500 }}>
            Analyse de ton évolution et de ta rétention FSRS.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
          <button 
            onClick={computeAllStats} 
            style={{ padding: "12px 20px", background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 100, color: theme.text, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.background = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            🔄 Sync
          </button>
          
          <button 
            onClick={generateStatsAiReport} 
            disabled={statsAiReportLoading} 
            style={{ padding: "12px 24px", background: `linear-gradient(135deg, ${primaryLight}, ${primaryColor})`, color: "white", border: "none", borderRadius: 100, fontWeight: 800, cursor: "pointer", boxShadow: `0 8px 20px ${primaryColor}40` }}
          >
            {statsAiReportLoading ? "⏳ Scrying..." : "🔮 Oracle IA"}
          </button>
          
          <button 
            onClick={async () => {
              try {
                const text = await generateWeeklyDigest({ expressions, sessionHistory: statsSessionHistory, stats, callClaude });
                setStatsAiReport(typeof text === "string" ? { summary: text } : text);
                showToast("🎁 Éphéméride gravée", "success");
              } catch (e) { showToast("Erreur oracle", "error"); }
            }} 
            style={{ padding: "12px 20px", background: isDarkMode ? "#334155" : "#E2E8F0", color: theme.text, border: "none", borderRadius: 100, fontWeight: 800, cursor: "pointer" }}
          >
            📜 Éphéméride
          </button>
        </div>
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
          background: isDarkMode ? "linear-gradient(135deg, rgba(77,107,254,0.1), rgba(15,23,42,0.8))" : "linear-gradient(135deg, #FFFFFF, #EEF2FF)", 
          borderRadius: 24, padding: 32, 
          border: `2px solid ${primaryColor}`, 
          marginBottom: 32, position: "relative" 
        }}>
          <h3 style={{ color: primaryColor, marginTop: 0, fontSize: 20, fontWeight: 900 }}>🧠 Rapport IA hebdomadaire</h3>
          <p style={{ fontStyle: "italic", color: theme.text, fontSize: 16, lineHeight: 1.5, marginBottom: 24 }}>{statsAiReport.verdict}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 24 }}>
            <div style={{ background: isDarkMode ? "rgba(16, 185, 129, 0.1)" : "#ECFDF5", padding: 20, borderRadius: 16 }}>
              <h4 style={{ color: successColor, margin: "0 0 12px 0" }}>💪 Forces</h4>
              <ul style={{ margin: 0, paddingLeft: 20, color: theme.text }}>
                {statsAiReport.strengths?.map((s, i) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}
              </ul>
            </div>
            <div style={{ background: isDarkMode ? "rgba(239, 68, 68, 0.1)" : "#FEF2F2", padding: 20, borderRadius: 16 }}>
              <h4 style={{ color: dangerColor, margin: "0 0 12px 0" }}>⚠️ Points d'attention</h4>
              <p style={{ margin: 0, color: theme.text }}>{statsAiReport.weakness}</p>
            </div>
          </div>
          <div style={{ marginTop: 24, padding: 20, background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: 16 }}>
            <p style={{ margin: "0 0 16px 0", color: theme.text }}><strong>💡 Conseil :</strong> {statsAiReport.tip}</p>
            <h4 style={{ margin: "0 0 12px 0", color: theme.text }}>📋 Plan de la semaine</h4>
            <ol style={{ margin: 0, paddingLeft: 20, color: theme.text }}>
              {statsAiReport.plan?.map((p, i) => <li key={i} style={{ marginBottom: 6 }}>{p}</li>)}
            </ol>
          </div>
          <button onClick={() => setStatsAiReport(null)} style={{ position: "absolute", top: 24, right: 24, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)", border: "none", color: theme.text, cursor: "pointer", width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>✕</button>
        </motion.div>
      )}

      {/* ─── VUE D'ENSEMBLE (BENTO GRID) ─── */}
      <motion.div variants={itemVars} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
        
        {/* KPI Principaux */}
        <div style={{ ...glassCardStyle, gridColumn: "1 / -1", display: "flex", flexDirection: "column" }}>
          <h3 style={{ margin: "0 0 20px", color: theme.text, fontWeight: 800, fontSize: 18 }}>⚡ Métriques Globales</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, flex: 1 }}>
            
            <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "#F8FAFF", borderRadius: 16, padding: 20, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.1)"}` }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: primaryColor }}>{stats.streak}</div>
              <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>Jours de streak</div>
            </div>

            <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "#F8FAFF", borderRadius: 16, padding: 20, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.1)"}` }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: theme.text }}>{masteredCount}</div>
              <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>Maîtrisées ({expressions.length})</div>
            </div>

            <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "#F8FAFF", borderRadius: 16, padding: 20, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.1)"}` }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: theme.text }}>{stats.totalReviews}</div>
              <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>Révisions totales</div>
            </div>

            <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "#F8FAFF", borderRadius: 16, padding: 20, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.1)"}` }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#8B5CF6" }}>{stats.aiGenerated || 0}</div>
              <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>Générées par IA</div>
            </div>

          </div>
          
          {/* Power Level Bar */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: theme.textMuted, fontSize: 14 }}>POWER LEVEL</span>
              <span style={{ fontWeight: 900, color: primaryColor, fontSize: 16 }}>{powerLevel} XP</span>
            </div>
            <div style={{ height: 12, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)", borderRadius: 6, overflow: "hidden" }}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (powerLevel / 10000) * 100)}%` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                style={{ height: "100%", background: `linear-gradient(90deg, ${primaryColor}, #8B5CF6)`, borderRadius: 6 }} 
              />
            </div>
          </div>
        </div>

        {/* 30 Jours Progress — Line chart "présidentiel" avec gradient */}
        <div style={{ ...glassCardStyle, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: theme.text, fontWeight: 800, fontSize: 18 }}>📈 Activité (30 jours)</h3>
            <div style={{ display: "flex", gap: 12, fontSize: 12, fontWeight: 700, color: theme.textMuted }}>
              <span>Total : <strong style={{ color: primaryColor }}>{statsDailyProgress.reduce((a, d) => a + d.count, 0)}</strong></span>
              <span>Moy. : <strong style={{ color: primaryColor }}>{Math.round(statsDailyProgress.reduce((a, d) => a + d.count, 0) / Math.max(1, statsDailyProgress.length))}</strong>/j</span>
            </div>
          </div>
          <div style={{ height: 200, width: "100%" }}>
            <Line
              data={{
                labels: statsDailyProgress.map(d => d.date.slice(5)),
                datasets: [{
                  label: 'Révisions',
                  data: statsDailyProgress.map(d => d.count),
                  borderColor: primaryColor,
                  borderWidth: 2.5,
                  pointRadius: 0,
                  pointHoverRadius: 5,
                  pointHoverBackgroundColor: primaryColor,
                  pointHoverBorderColor: "#fff",
                  pointHoverBorderWidth: 2,
                  tension: 0.4,
                  fill: true,
                  backgroundColor: (ctx) => {
                    const { chart } = ctx;
                    const { ctx: c, chartArea } = chart;
                    if (!chartArea) return primaryColor + "33";
                    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    g.addColorStop(0, primaryColor + "66");
                    g.addColorStop(1, primaryColor + "00");
                    return g;
                  },
                }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: chartTooltipBg, titleColor: chartTextColor, bodyColor: chartTextColor,
                    borderColor: chartBorderColor, borderWidth: 1, padding: 12, displayColors: false,
                    callbacks: { label: (ctx) => `${ctx.raw} révisions` }
                  }
                },
                scales: {
                  x: { grid: { display: false }, ticks: { color: chartTextMuted, maxTicksLimit: 8, font: { weight: 'bold', size: 11 } } },
                  y: { grid: { color: chartBorderColor, drawBorder: false }, ticks: { color: chartTextMuted, font: { size: 11 }, maxTicksLimit: 4 }, beginAtZero: true }
                }
              }}
            />
          </div>
        </div>
      </motion.div>

      
            {/* ─── MAÎTRISE PAR MODULE ─── */}
      <motion.div variants={itemVars} style={{ ...glassCardStyle, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 20px", color: theme.text, fontWeight: 800, fontSize: 18 }}>📚 Maîtrise par module</h3>
        <div style={{ height: 350, width: "100%", display: "flex", justifyContent: "center" }}>
          <Radar 
            data={{
              labels: statsModuleComparison.map(mod => mod.name),
              datasets: [{
                label: 'Maîtrisées',
                data: statsModuleComparison.map(mod => mod.total > 0 ? (mod.mastered / mod.total) * 100 : 0),
                backgroundColor: primaryColor + "55",
                borderColor: primaryColor,
                pointBackgroundColor: primaryLight,
                pointBorderColor: "#fff",
                pointHoverBackgroundColor: "#fff",
                pointHoverBorderColor: primaryColor,
                borderWidth: 2,
              }]
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: chartTooltipBg, titleColor: chartTextColor, bodyColor: chartTextColor,
                  borderColor: chartBorderColor, borderWidth: 1, padding: 12,
                  callbacks: { label: (ctx) => `Maîtrise: ${ctx.raw.toFixed(1)}%` }
                }
              },
              scales: {
                r: {
                  angleLines: { color: chartBorderColor },
                  grid: { color: chartBorderColor },
                  pointLabels: { color: chartTextMuted, font: { weight: 'bold', size: 12 } },
                  ticks: { display: false, min: 0, max: 100, stepSize: 20 }
                }
              }
            }}
          />
        </div>
      </motion.div>

{/* ─── DISTRIBUTION DES NIVEAUX ─── */}
      <motion.div variants={itemVars} style={{ ...glassCardStyle, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 20px", color: theme.text, fontWeight: 800, fontSize: 18 }}>💀 Distribution des niveaux</h3>
        <div style={{ height: 250, width: "100%" }}>
          <Bar 
            data={{
              labels: statsDifficultyDistribution.map((_, i) => i.toString()),
              datasets: [{
                label: 'Cartes',
                data: statsDifficultyDistribution.map(d => d.count),
                backgroundColor: statsDifficultyDistribution.map((_, i) => i > 7 ? dangerColor : i > 4 ? primaryLight : primaryColor),
                borderRadius: 6,
                borderSkipped: false,
              }]
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: chartTooltipBg,
                  titleColor: chartTextColor,
                  bodyColor: chartTextColor,
                  borderColor: chartBorderColor,
                  borderWidth: 1, padding: 12, displayColors: false,
                  callbacks: { title: (ctx) => `Niveau ${ctx[0].label}`, label: (ctx) => `${ctx.raw} cartes` }
                }
              },
              scales: {
                x: { grid: { display: false }, ticks: { color: chartTextMuted, font: { weight: 'bold' } } },
                y: { grid: { color: chartBorderColor }, ticks: { color: chartTextMuted }, beginAtZero: true }
              }
            }}
          />
        </div>
      </motion.div>

            {/* ─── ROUTINE HEBDOMADAIRE ─── */}
      <motion.div variants={itemVars} style={{ ...glassCardStyle, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 20px", color: theme.text, fontWeight: 800, fontSize: 18 }}>📅 Routine Hebdomadaire</h3>
        <div style={{ height: 350, width: "100%", display: "flex", justifyContent: "center" }}>
          <PolarArea 
            data={{
              labels: statsDayOfWeekPerformance.map(d => d.name),
              datasets: [{
                label: 'Révisions',
                data: statsDayOfWeekPerformance.map(d => d.reviews),
                backgroundColor: [
                  "#3B82F6AA", "#8B5CF6AA", "#EC4899AA", "#F43F5EAA", 
                  "#F59E0BAA", "#10B981AA", "#14B8A6AA"
                ],
                borderWidth: 1,
                borderColor: isDarkMode ? "#1e293b" : "#ffffff",
              }]
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { position: 'right', labels: { color: chartTextMuted, font: { weight: 'bold' } } },
                tooltip: {
                  backgroundColor: chartTooltipBg, titleColor: chartTextColor, bodyColor: chartTextColor,
                  borderColor: chartBorderColor, borderWidth: 1, padding: 12, displayColors: false,
                }
              },
              scales: {
                r: {
                  grid: { color: chartBorderColor },
                  ticks: { display: false },
                  angleLines: { display: false }
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
