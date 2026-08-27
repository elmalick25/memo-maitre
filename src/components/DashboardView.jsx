import React from "react";
import HoloCard from "./HoloCard";
import MobileHomeV2 from "./MobileHomeV2";
import KnowledgeGraph from "./KnowledgeGraph";
import { getArchetype } from "../constants/gamification";
import { countPromotable, bestStudyHour } from "../lib/smartTiming";
import { streakIcon as unlockedStreakIcon } from "../lib/unlocks";
import { today } from "../utils/dateUtils";
import { YearHeatmap, ResumeCarousel, getSmartSessionRecommendation } from "../MemoMasterUpgrades";

const MOBILE_MQ = "(max-width: 768px)";

export default function DashboardView({
  expressions = [],
  categories = [],
  sessionRemainingCount = 0,
  dailySessionPreview = [],
  masteredCount = 0,
  dashFormIndex = 80,
  stamina = 100,
  stats = { streak: 0, totalReviews: 0 },
  powerLevel = 0,
  questState,
  questBoard,
  sessionBestCombo = 0,
  bestComboEver = 0,
  badgeProgressForHooks,
  unlockedBadges = [],
  isEnteringFlow = false,
  handleEnterFlow,
  hour = 12,
  greeting = "Bonjour",
  dashNextExam = null,
  dashQuote = "",
  dashQuoteLoading = false,
  loadDailyQuote,
  dashSelfCompare = null,
  sessions = [],
  sessionInProgress,
  lastFailed,
  lastLabDoc,
  lastQuiz,
  openCard,
  resumeQuiz,
  dashFocusMode = false,
  setDashFocusMode,
  dashUrgentCards = [],
  newCards = [],
  startReview,
  startWeakSpotsSession,
  setView,
  theme,
  isDarkMode = false,
  showToast,
  holoLevel = 1,
}) {
  const totalCards = expressions.length;
  const dueCount = sessionRemainingCount;
  const sessionPool = dailySessionPreview;
  const mastPct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;
  const estMinutes = Math.ceil(dueCount * 0.5);
  const formColor = dashFormIndex >= 70 ? "#4ADE80" : dashFormIndex >= 40 ? "#FACC15" : "#F87171";
  const canReview = dueCount > 0;

  // ── MOBILE : Home V2 simplifiée ──
  const isMobileHome = typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
  if (isMobileHome) {
    const dueModules = categories
      .map((c) => ({
        name: c.name,
        count: sessionPool.filter((e) => e.category === c.name).length
      }))
      .filter((c) => c.count > 0);

    return (
      <MobileHomeV2
        userName={"Mémorisateur"}
        level={getArchetype(powerLevel).level}
        xp={getArchetype(powerLevel).xp - getArchetype(powerLevel).currentLevelXp}
        xpToNext={getArchetype(powerLevel).nextLevelXp - getArchetype(powerLevel).currentLevelXp || 1}
        streak={stats?.streak || 0}
        energy={stamina}
        dueCount={dueCount}
        estMinutes={estMinutes}
        dueModules={dueModules}
        onStartSession={(moduleName = null) => startReview?.(moduleName, "standard")}
        onExploreLab={() => setView?.("lab")}
        stats={{
          forme: dashFormIndex,
          mastery: mastPct,
          nextExamDays: null,
        }}
        quests={(questBoard?.daily || []).map((q) => ({
          id: q.id,
          label: q.label,
          done: q.done,
        }))}
        questsProgress={{
          done: questBoard?.doneCount || 0,
          total: questBoard?.total || 0,
        }}
        onOpenQuests={() => setView?.("stats")}
        streakIcon={unlockedStreakIcon(getArchetype(powerLevel).level)}
        nearMissInput={{
          totalXP: powerLevel,
          questState,
          sessionBestCombo,
          bestComboEver,
          badges: badgeProgressForHooks,
        }}
        routine={null}
        onOpenRoutine={() => setView?.("routine")}
        onOpenVeille={() => setView?.("veille")}
        onOpenPractice={() => setView?.("practice")}
        shortcuts={[]}
      />
    );
  }

  return (
    <div style={{
      animation: isEnteringFlow ? "flowZoomIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "fadeUp 0.4s ease",
      display: "flex", flexDirection: "column", gap: 20,
      pointerEvents: isEnteringFlow ? "none" : "auto"
    }}>
      {/* ══ HERO HEADER BENTO ══════════════════════════════════════════════════════ */}
      <HoloCard holo={holoLevel} className="dash-hero-card" glowColor={theme?.highlight || "#8B5CF6"} style={{
        position: "relative", borderRadius: 20, overflow: "hidden",
        background: theme?.gradient || "linear-gradient(135deg, #4C1D95, #7C3AED)",
        padding: "20px 24px 18px",
        boxShadow: isDarkMode
          ? "0 16px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)"
          : "0 12px 40px rgba(76,29,149,0.35)",
      }}>
        {/* Orbes décoratifs */}
        <div style={{ position: "absolute", top: -60, right: -40, width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)", pointerEvents: "none", animation: "orb1 8s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: -80, left: 60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(192,132,252,0.15) 0%, transparent 70%)", pointerEvents: "none", animation: "orb2 10s ease-in-out infinite" }} />

        {/* Ligne supérieure : salutation + forme */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, position: "relative", zIndex: 1, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6 }}>
              {hour >= 5 && hour < 12 ? "Matin" : hour < 18 ? "Après-midi" : "Soirée"} · {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <h1 className="dash-hero-title" style={{ margin: 0, fontSize: "clamp(20px, 3.2vw, 28px)", fontWeight: 800, color: "white", letterSpacing: "-0.6px", lineHeight: 1.1 }}>
              {greeting},{" "}
              <span style={{ fontWeight: 900, background: "linear-gradient(90deg,#FFFFFF,#DDD6FE)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>El Hadji Malick</span>
            </h1>
            {(() => {
              const archetype = getArchetype(powerLevel);
              return (
                <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)' }}>
                  <span style={{ fontSize: 13, opacity: 0.9 }}>{archetype.icon}</span>
                  <span style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 700, fontSize: 11, letterSpacing: 0.3 }}>Niv. {archetype.level}</span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>·</span>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 11 }}>{archetype.title}</span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>·</span>
                  <span style={{ color: '#FCD34D', fontWeight: 700, fontSize: 11 }}>{unlockedBadges.length} badges</span>
                </div>
              );
            })()}
            <br />

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <div onClick={() => setView?.("phantom")} style={{ background: "rgba(139, 92, 246, 0.15)", border: "1px solid rgba(139, 92, 246, 0.4)", borderRadius: 10, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", backdropFilter: "blur(10px)" }}>
                <span style={{ fontSize: 13 }}>🕵️</span>
                <div>
                  <div style={{ color: "#C084FC", fontSize: 11, fontWeight: 800 }}>Recruteur Fantôme</div>
                  <div style={{ color: "white", fontSize: 10, opacity: 0.8 }}>Préparer tes dossiers</div>
                </div>
              </div>
              <div onClick={() => setView?.("oracle")} style={{ background: "rgba(139, 92, 246, 0.15)", border: "1px solid rgba(139, 92, 246, 0.4)", borderRadius: 10, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", backdropFilter: "blur(10px)" }}>
                <span style={{ fontSize: 13 }}>🔮</span>
                <div>
                  <div style={{ color: "#C4B5FD", fontSize: 11, fontWeight: 800 }}>Tech Oracle</div>
                  <div style={{ color: "white", fontSize: 10, opacity: 0.8 }}>Ta valeur en 2028</div>
                </div>
              </div>
            </div>
          </div>

          {/* Indicateurs droite */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", borderRadius: 12, padding: "8px 14px", textAlign: "center", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: formColor, lineHeight: 1 }}>{dashFormIndex}%</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>Forme</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", borderRadius: 12, padding: "8px 14px", textAlign: "center", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#FCD34D", lineHeight: 1 }}>{stats.streak}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{unlockedStreakIcon(getArchetype(powerLevel).level)} Jours</div>
            </div>
            {dashNextExam && (
              <div style={{ background: dashNextExam.daysLeft <= 7 ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", borderRadius: 12, padding: "8px 14px", textAlign: "center", border: dashNextExam.daysLeft <= 7 ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.12)" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: dashNextExam.daysLeft <= 7 ? "#F87171" : "#C084FC", lineHeight: 1 }}>J-{dashNextExam.daysLeft}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginTop: 3, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dashNextExam.name}</div>
              </div>
            )}
          </div>
        </div>

        {/* Citation */}
        <div style={{ marginTop: 10, position: "relative", zIndex: 1 }}>
          <p style={{ margin: 0, fontStyle: "italic", color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 1.5, maxWidth: 560 }}>
            « {dashQuote || "La connaissance s'acquiert par l'expérience, tout le reste n'est que de l'information."} »
          </p>
          <button onClick={loadDailyQuote} style={{ marginTop: 4, background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
            {dashQuoteLoading ? "⏳ chargement…" : "↻ nouvelle citation"}
          </button>
        </div>

        {/* Toi vs toi-même */}
        {dashSelfCompare && (
          <div style={{ marginTop: 12, position: "relative", zIndex: 1, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "10px 14px" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 1 }}>📊 Toi vs toi-même</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>{dashSelfCompare.perDay7} rév./j (7 j)</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>vs {dashSelfCompare.perDay30} (30 j)</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: dashSelfCompare.delta >= 0 ? "#34D399" : "#F87171" }}>
              {dashSelfCompare.delta >= 0 ? "▲" : "▼"} {Math.abs(dashSelfCompare.delta)}%
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>· {dashSelfCompare.xpWeek} XP cette semaine</span>
          </div>
        )}

        {/* Barres XP & Stamina */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', zIndex: 1, marginTop: 10 }}>
          {(() => {
            const archetype = getArchetype(powerLevel);
            const xpInLevel = archetype.xp - archetype.currentLevelXp;
            const xpNeeded = archetype.nextLevelXp - archetype.currentLevelXp;
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>⭐ XP — Niv. {archetype.level}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{xpNeeded > 0 ? `${xpInLevel} / ${xpNeeded}` : "MAX"}</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${archetype.progress}%`, height: '100%', background: 'linear-gradient(90deg, #FCD34D, #F59E0B)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })()}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>⚡ Énergie</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{stamina} / 100</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${stamina}%`, height: '100%', background: stamina > 20 ? 'linear-gradient(90deg, #4ADE80, #34D399)' : 'linear-gradient(90deg, #F87171, #EF4444)', borderRadius: 3, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        </div>
      </HoloCard>

      {/* Heatmap & Recommandations */}
      <YearHeatmap
        sessionHistory={sessions}
        onClickDay={(d) => showToast?.(`📅 ${d}`)}
        theme={theme}
        isDarkMode={isDarkMode}
      />
      <ResumeCarousel
        theme={theme}
        items={[
          sessionInProgress && { icon: "▶", label: "Session interrompue", sublabel: `${sessionInProgress.cardsLeft} fiches restantes`, onClick: () => setView?.("review") },
          lastFailed && { icon: "❌", label: "Dernière fiche ratée", sublabel: String(lastFailed.front || "").slice(0, 40), onClick: () => (typeof openCard === "function" ? openCard(lastFailed.id) : setView?.("list")) },
          lastLabDoc && { icon: "🧪", label: "Dernier doc Lab", sublabel: lastLabDoc.name, onClick: () => setView?.("lab") },
          lastQuiz && { icon: "❓", label: "Quiz à finir", sublabel: `${lastQuiz.done}/${lastQuiz.total}`, onClick: () => (typeof resumeQuiz === "function" ? resumeQuiz(lastQuiz.id) : setView?.("review")) },
        ].filter(Boolean)}
      />

      {/* Recommandation de session IA */}
      {(() => {
        const promotableCount = countPromotable(expressions, today());
        const reco = getSmartSessionRecommendation({
          dueCount,
          streak: stats.streak,
          hour,
          promotableCount,
          bestHour: bestStudyHour(stats).hour,
        });
        return (
          <button
            onClick={() => {
              if (reco.mode === "explore") { setView?.("lab"); return; }
              if (dueCount > 0) {
                startReview?.(null, "standard");
              } else {
                setView?.("review");
              }
            }}
            className="hov"
            style={{ padding: 16, borderRadius: 16, background: `linear-gradient(135deg, ${theme?.highlight || "#8B5CF6"}, color-mix(in srgb, ${theme?.highlight || "#8B5CF6"} 50%, transparent))`, color: "white", border: "none", textAlign: "left", cursor: "pointer" }}
          >
            <div style={{ fontSize: 20, fontWeight: 800 }}>{reco.icon} {reco.label}</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{reco.reason}</div>
          </button>
        );
      })()}

      {/* Mode Focus ou Mission du Jour */}
      {dashFocusMode ? (
        <div className="dash-widget-card" style={{ background: isDarkMode ? "rgba(124,58,237,0.12)" : "#FAF5FF", borderRadius: 24, padding: "28px 32px", border: "2px solid #7C3AED", animation: "fadeUp 0.3s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: isDarkMode ? "#C084FC" : "#581C87" }}>🎯 Mode Focus</div>
              <div style={{ fontSize: 13, color: theme?.textMuted || "#64748B", marginTop: 2 }}>Fiches urgentes uniquement</div>
            </div>
            <button onClick={() => setDashFocusMode?.(false)} style={{ background: "none", border: `1px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 10, padding: "6px 14px", color: theme?.textMuted || "#64748B", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Quitter</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {dashUrgentCards.length === 0 ? (
              <div style={{ color: theme?.textMuted || "#64748B", fontSize: 14 }}>✅ Aucune fiche urgente !</div>
            ) : (
              dashUrgentCards.map((card) => (
                <div key={card.id} style={{ display: "flex", justifyContent: "space-between", background: theme?.cardBg || "#FFFFFF", borderRadius: 12, padding: "10px 16px", border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
                  <span style={{ color: theme?.text || "#0F172A", fontWeight: 600, fontSize: 14 }}>{card.front}</span>
                  <span style={{ color: "#F87171", fontSize: 12, fontWeight: 700 }}>{card.nextReview}</span>
                </div>
              ))
            )}
          </div>
          <button onClick={() => startReview?.(null, "standard")} className="btn-glow" style={{ padding: "14px 28px", background: "linear-gradient(135deg, #7C3AED, #8B5CF6)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
            🚀 Lancer révision urgente
          </button>
        </div>
      ) : (
        <>
          {/* Mission du jour */}
          <HoloCard holo={holoLevel} theme={theme} glowColor={canReview ? "#C084FC" : "#4ADE80"} style={{
            borderRadius: 24, overflow: "hidden",
            background: isDarkMode ? "linear-gradient(135deg, #0f172a, #111827)" : "linear-gradient(135deg, #f8faff, #ffffff)",
            border: `1px solid ${theme?.border || "#E2E8F0"}`,
            boxShadow: isDarkMode ? "0 8px 32px rgba(0,0,0,0.3)" : "0 4px 24px rgba(139,92,246,0.08)",
          }}>
            {stamina < 20 && (
              <div style={{ padding: '10px 14px', background: '#FEF2F2', color: '#DC2626', borderRadius: 12, border: '1px solid #FCA5A5', fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🧠</span>
                <div>Ton énergie cognitive est basse. Une pause ou une session Lofi serait une bonne idée !</div>
              </div>
            )}
            <div style={{ height: 4, background: canReview ? "linear-gradient(90deg, #8B5CF6, #C084FC, #C084FC)" : "linear-gradient(90deg, #4ADE80, #34D399)" }} />
            <div className="dash-mission-card" style={{ padding: "28px 28px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: canReview ? "#C084FC" : "#4ADE80", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: theme?.textMuted || "#64748B", textTransform: "uppercase", letterSpacing: 1.5 }}>Mission du jour</span>
                <button onClick={() => setDashFocusMode?.(true)} style={{ marginLeft: "auto", background: isDarkMode ? "rgba(139, 92, 246,0.1)" : "#FAF5FF", border: `1px solid ${isDarkMode ? "rgba(139, 92, 246,0.3)" : "#DDD6FE"}`, borderRadius: 8, padding: "4px 12px", color: "#8B5CF6", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  🎯 Focus
                </button>
              </div>

              {/* Stats principales */}
              <div className="dash-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16, marginBottom: 24 }}>
                {[
                  { val: dueCount, label: "À réviser", sub: `~${estMinutes} min`, color: canReview ? "#C084FC" : "#4ADE80" },
                  { val: newCards.length, label: "Nouvelles", sub: "à découvrir", color: "#C084FC" },
                  { val: masteredCount, label: "Maîtrisées", sub: `${mastPct}% du total`, color: "#34D399" },
                  { val: stats.totalReviews, label: "Total", sub: "révisions vie", color: "#FBBF24" },
                ].map(({ val, label, sub, color }) => (
                  <div key={label} style={{ textAlign: "center", background: isDarkMode ? "rgba(255,255,255,0.03)" : "#F8FAFF", borderRadius: 16, padding: "18px 12px", border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
                    <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1, letterSpacing: "-1px" }}>{val}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: theme?.text || "#0F172A", marginTop: 6 }}>{label}</div>
                    <div style={{ fontSize: 11, color: theme?.textMuted || "#64748B", marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Boutons Zone & Standard */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  onClick={handleEnterFlow}
                  disabled={!canReview}
                  className="dash-flow-btn"
                  style={{
                    width: "100%", padding: "20px",
                    background: canReview ? "linear-gradient(270deg, #8B5CF6, #7C3AED, #EC4899, #8B5CF6)" : (theme?.inputBg || "#F8FAFC"),
                    backgroundSize: "300% 300%",
                    animation: canReview ? "gradientPulseFlow 4s ease infinite" : "none",
                    color: canReview ? "white" : (theme?.textMuted || "#64748B"),
                    border: "none", borderRadius: 20,
                    cursor: canReview ? "pointer" : "default",
                    opacity: canReview ? 1 : 0.45,
                    boxShadow: canReview ? "0 10px 40px rgba(124, 58, 237, 0.3)" : "none",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8
                  }}
                >
                  <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px" }}>🌀 Entrer dans la Zone</span>
                  <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>L'IA a préparé ta playlist optimale (FSRS + Interleaving)</span>
                </button>

                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button onClick={() => startReview?.(null, "standard")} disabled={!canReview} className="hov" style={{ background: "transparent", border: `1px solid ${theme?.border || "#E2E8F0"}`, color: theme?.textMuted || "#64748B", padding: "8px 16px", borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: canReview ? "pointer" : "default", opacity: canReview ? 1 : 0.45 }}>
                    📚 Standard
                  </button>
                  <button onClick={() => startReview?.(null, "vocal")} disabled={!canReview} className="hov" style={{ background: "transparent", border: `1px solid ${theme?.border || "#E2E8F0"}`, color: theme?.textMuted || "#64748B", padding: "8px 16px", borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: canReview ? "pointer" : "default", opacity: canReview ? 1 : 0.45 }}>
                    🎤 Vocal
                  </button>
                </div>
              </div>
            </div>
          </HoloCard>

          {/* Fiches urgentes */}
          {dashUrgentCards.length > 0 && (
            <HoloCard className="dash-widget-card" urgent={true} glowColor="#EF4444" style={{ borderRadius: 20, padding: "22px 24px", background: isDarkMode ? "rgba(239,68,68,0.07)" : "#FEF2F2", border: `1px solid ${isDarkMode ? "rgba(239,68,68,0.2)" : "#FCA5A5"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span style={{ fontWeight: 800, color: isDarkMode ? "#F87171" : "#DC2626", fontSize: 14 }}>Risque d'oubli — {dashUrgentCards.length} fiches</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={startWeakSpotsSession} title="Points faibles" style={{ padding: "8px 14px", background: "linear-gradient(135deg, #7C3AED, #6D28D9)", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                    🎯 Points faibles
                  </button>
                  <button onClick={() => startReview?.(null, "standard", dashUrgentCards)} style={{ padding: "8px 18px", background: "#EF4444", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                    🚀 Réviser
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {dashUrgentCards.map((card) => (
                  <div key={card.id} style={{ background: isDarkMode ? "rgba(239,68,68,0.1)" : "white", borderRadius: 10, padding: "8px 14px", border: `1px solid ${isDarkMode ? "rgba(239,68,68,0.2)" : "#FCA5A5"}`, maxWidth: 260 }}>
                    <div style={{ fontWeight: 700, color: theme?.text || "#0F172A", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.front}</div>
                    <div style={{ fontSize: 11, color: "#F87171", marginTop: 2, fontWeight: 600 }}>due : {card.nextReview}</div>
                  </div>
                ))}
              </div>
            </HoloCard>
          )}

          {/* Constellation des Connaissances */}
          {categories.length > 0 && (
            <HoloCard holo={holoLevel} className="dash-widget-card" theme={theme} style={{ background: theme?.cardBg || "#FFFFFF", borderRadius: 20, padding: "22px 24px", border: `1px solid ${theme?.border || "#E2E8F0"}` }} glowColor="#C084FC">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <span style={{ fontSize: 16 }}>⚡</span>
                <span style={{ fontWeight: 800, color: theme?.text || "#0F172A", fontSize: 15 }}>Constellation des Connaissances</span>
              </div>
              <KnowledgeGraph
                categories={categories} expressions={expressions} sessionPool={sessionPool}
                theme={theme} isDarkMode={isDarkMode}
                onNodeClick={(categoryName) => startReview?.(categoryName, "standard")}
              />
            </HoloCard>
          )}
        </>
      )}
    </div>
  );
}
