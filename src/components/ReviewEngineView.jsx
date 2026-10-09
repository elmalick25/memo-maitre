import React, { useRef, useState, useEffect, useMemo } from "react";
import GodTierContent from "./GodTierContent";
import ComboBar from "./ComboBar";
import SessionEndHook from "./SessionEndHook";
import AudioFichePlayer from "./AudioFichePlayer";
import AudioPlayButton from "./AudioPlayButton";
import { isEnglishCategory } from "../lib/englishCardEngine";
import { SocraticChat, RabbitHoleViewer } from "../MemoMasterUpgrades";
import { getPreviewInterval, cognitiveTag } from "../lib/fsrs";
import { analyzeLeech } from "../lib/memoryLab";
import { colorMix } from "../lib/colorMix";

export default function ReviewEngineView({
  reviewQueue = [],
  setReviewQueue,
  reviewIndex = 0,
  setReviewIndex,
  currentCard,
  revealed = false,
  setRevealed,
  userAnswer = "",
  setUserAnswer,
  showSessionSummary = false,
  setShowSessionSummary,
  sessionSummary = null,
  sessionTimer = 0,
  sessionTimerRef,
  reviewCombo = 0,
  reviewSessionDone = 0,
  updateStreakAfterSession = () => {},
  handleAnswer,
  handleAnswerWithFeedback,
  handleReveal,
  handleRevealAndStopVoice,
  voiceReviewActive = false,
  socraticMode = false,
  socraticHint = "",
  setSocraticHint = () => {},
  handleSemanticEval,
  evalLoading = false,
  generateMnemonic,
  mnemonicLoading = false,
  mnemonicText = "",
  setMnemonicText = () => {},
  saveMnemonic,
  mnemonicSaved = false,
  rabbitHoleOpen = false,
  setRabbitHoleOpen = () => {},
  handleRescueLeech,
  leechRescueLoading = false,
  startEdit,
  setEditReturnTo,
  deleteExp,
  unpauseCard,
  productionInvite,
  setProductionInvite,
  productionDraft = {},
  setProductionDraft,
  productionResult = {},
  productionBusy,
  handleValidateProduction,
  powerLevel = 0,
  questState,
  sessionBestCombo = 0,
  bestComboEver = 0,
  xpState = {},
  sessionRemainingCount = 0,
  badgeProgressForHooks,
  dailySessionPreview = [],
  startReview,
  setView,
  theme,
  isDarkMode = false,
  isMobile = false,
  callClaude,
  showToast,
  activeFacet = null,
  setCardStartTime,
  handleOptimizeOneCard,
  reviewMode = "standard",
  reviewCategory = null,
  categories = [],
  expressions = [],
}) {
  const [optimizingCard, setOptimizingCard] = useState(false);
  // Swipe gestuel local state
  const [swipeX, setSwipeX] = useState(0);
  const [swipeY, setSwipeY] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Configuration pour poursuivre la révision (module + nombre de fiches)
  const [selectedModule, setSelectedModule] = useState(reviewCategory || "all");
  const [continueCount, setContinueCount] = useState(10);

  useEffect(() => {
    if (reviewCategory) {
      setSelectedModule(reviewCategory);
    }
  }, [reviewCategory]);

  // Nombre de fiches actives par module
  const moduleCardCounts = useMemo(() => {
    const counts = {};
    (expressions || []).forEach((c) => {
      if (!c.paused && c.category) {
        counts[c.category] = (counts[c.category] || 0) + 1;
      }
    });
    return counts;
  }, [expressions]);

  const totalActiveCards = useMemo(() => {
    return (expressions || []).filter((c) => !c.paused).length;
  }, [expressions]);

  // Liste des catégories existantes triées
  const availableCategories = useMemo(() => {
    const names = new Set();
    (categories || []).forEach((cat) => {
      if (typeof cat === "string") names.add(cat);
      else if (cat && cat.name) names.add(cat.name);
    });
    (expressions || []).forEach((c) => {
      if (c.category) names.add(c.category);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [categories, expressions]);

  const handleCloseSummary = () => {
    if (sessionTimerRef?.current) clearInterval(sessionTimerRef.current);
    setShowSessionSummary?.(false);
    setView?.((reviewMode === "module" || reviewMode === "free") ? "categories" : "dashboard");
  };

  const handleContinueSession = () => {
    let pool = (expressions || []).filter((e) => !e.paused);
    if (selectedModule && selectedModule !== "all") {
      pool = pool.filter((e) => e.category === selectedModule);
    }

    if (pool.length === 0) {
      showToast?.("Aucune fiche disponible dans ce module", "info");
      return;
    }

    // Priorisation intelligente :
    // 1. Fiches déjà préparées dans dailySessionPreview (si non encore révisées)
    // 2. Fiches échues / dues
    // 3. Fiches avec le plus faible niveau
    const previewIds = new Set((dailySessionPreview || []).map((c) => c.id));
    const fromPreview = pool.filter((c) => previewIds.has(c.id));
    const others = pool.filter((c) => !previewIds.has(c.id));

    const now = Date.now();
    others.sort((a, b) => {
      const aDue = a.nextReview ? new Date(a.nextReview).getTime() : 0;
      const bDue = b.nextReview ? new Date(b.nextReview).getTime() : 0;
      const aIsDue = aDue <= now;
      const bIsDue = bDue <= now;
      if (aIsDue && !bIsDue) return -1;
      if (!aIsDue && bIsDue) return 1;
      if (aDue !== bDue) return aDue - bDue;
      return (a.level || 0) - (b.level || 0);
    });

    const candidatePool = [...fromPreview, ...others];
    const pickedCards = candidatePool.slice(0, continueCount);

    if (pickedCards.length === 0) {
      showToast?.("Aucune fiche disponible", "info");
      return;
    }

    if (sessionTimerRef?.current) clearInterval(sessionTimerRef.current);
    setShowSessionSummary?.(false);

    startReview?.(
      selectedModule === "all" ? null : selectedModule,
      selectedModule === "all" ? "standard" : "module",
      pickedCards,
      { restart: true, bonus: true }
    );
  };

  // ── Fin de session en popup modal épuré & harmonieux ──
  if (showSessionSummary) {
    const totalCards = sessionSummary?.totalCards || reviewSessionDone || reviewQueue.length || 0;
    const avgSec = sessionSummary?.avgTime || (totalCards > 0 ? Math.round(sessionTimer / totalCards) : 0);

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-session-summary-title"
        onClick={handleCloseSummary}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: isDarkMode ? "rgba(0, 0, 0, 0.78)" : "rgba(15, 23, 42, 0.52)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          animation: "zenFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: "min(460px, 94vw)",
            background: isDarkMode ? "color-mix(in srgb, var(--mm-bg-card, #111827) 96%, transparent)" : "#ffffff",
            color: isDarkMode ? "var(--mm-fg, #f8fafc)" : "#0f172a",
            borderRadius: 24,
            border: `1.5px solid ${isDarkMode ? "color-mix(in srgb, var(--mm-primary) 32%, transparent)" : "color-mix(in srgb, var(--mm-primary) 20%, transparent)"}`,
            boxShadow: isDarkMode
              ? "0 24px 60px rgba(0, 0, 0, 0.7), 0 0 1px rgba(255, 255, 255, 0.15)"
              : "0 20px 48px color-mix(in srgb, var(--mm-primary) 14%, transparent), 0 4px 16px rgba(0,0,0,0.06)",
            padding: "24px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxHeight: "88vh",
            overflowY: "auto",
          }}
        >
          {/* Entête du modal */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 22%, transparent)" : "color-mix(in srgb, var(--mm-primary) 12%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  border: `1.5px solid color-mix(in srgb, var(--mm-primary) 30%, transparent)`,
                  boxShadow: "0 2px 10px color-mix(in srgb, var(--mm-primary) 20%, transparent)",
                }}
              >
                🏆
              </div>
              <div>
                <h3 id="review-session-summary-title" style={{ margin: 0, fontSize: 17, fontWeight: 900, color: isDarkMode ? "#f8fafc" : "#0f172a", letterSpacing: "-0.01em" }}>
                  Session terminée !
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: isDarkMode ? "#94a3b8" : "#64748b", fontWeight: 500 }}>
                  {totalCards} fiche{totalCards > 1 ? "s révisées" : " révisée"} avec succès
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseSummary}
              title="Fermer"
              aria-label="Fermer"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: isDarkMode ? "color-mix(in srgb, var(--mm-bg-elev, #334155) 60%, transparent)" : "color-mix(in srgb, var(--mm-fg) 8%, transparent)",
                color: isDarkMode ? "#f8fafc" : "#0f172a",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontWeight: 700,
                transition: "all 0.15s ease",
              }}
            >
              ✕
            </button>
          </div>

          {/* Grille des KPIs en pill-boxes compactes */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <div style={{
              background: isDarkMode ? "color-mix(in srgb, var(--mm-bg-card, #1e293b) 60%, transparent)" : "color-mix(in srgb, var(--mm-primary) 4%, #f8fafc)",
              padding: "10px 8px",
              borderRadius: 14,
              border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "color-mix(in srgb, var(--mm-primary) 12%, transparent)"}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--mm-primary)", fontFamily: "'JetBrains Mono', monospace" }}>
                {avgSec}s
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? "#94a3b8" : "#64748b", marginTop: 2 }}>
                Moyenne / carte
              </div>
            </div>

            <div style={{
              background: isDarkMode ? "color-mix(in srgb, var(--mm-bg-card, #1e293b) 60%, transparent)" : "color-mix(in srgb, var(--mm-primary) 4%, #f8fafc)",
              padding: "10px 8px",
              borderRadius: 14,
              border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "color-mix(in srgb, var(--mm-primary) 12%, transparent)"}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>
                N{sessionSummary?.avgLevelBefore || 0} → N{sessionSummary?.avgLevelAfter || 0}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? "#94a3b8" : "#64748b", marginTop: 2 }}>
                Niveau mémoire
              </div>
            </div>

            <div style={{
              background: isDarkMode ? "color-mix(in srgb, var(--mm-bg-card, #1e293b) 60%, transparent)" : "color-mix(in srgb, var(--mm-primary) 4%, #f8fafc)",
              padding: "10px 8px",
              borderRadius: 14,
              border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "color-mix(in srgb, var(--mm-primary) 12%, transparent)"}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}>
                +{totalCards * 10} XP
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? "#94a3b8" : "#64748b", marginTop: 2 }}>
                Gain estimé
              </div>
            </div>
          </div>

          {/* Configuration pour Continuer la révision */}
          <div
            style={{
              background: isDarkMode ? "rgba(255, 255, 255, 0.03)" : "rgba(15, 23, 42, 0.02)",
              borderRadius: 18,
              padding: "16px",
              border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "color-mix(in srgb, var(--mm-primary) 14%, transparent)"}`,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Choix du module */}
            <div>
              <label
                htmlFor="review-module-select"
                style={{
                  display: "block",
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: isDarkMode ? "#cbd5e1" : "#475569",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Module concerné
              </label>
              <select
                id="review-module-select"
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1.5px solid ${isDarkMode ? "rgba(255, 255, 255, 0.14)" : "color-mix(in srgb, var(--mm-primary) 22%, transparent)"}`,
                  background: isDarkMode ? "#1e293b" : "#f8fafc",
                  color: isDarkMode ? "#f8fafc" : "#0f172a",
                  fontSize: 13.5,
                  fontWeight: 600,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="all">
                  🌟 Tous les modules ({totalActiveCards} fiches)
                </option>
                {availableCategories.map((catName) => {
                  const count = moduleCardCounts[catName] || 0;
                  return (
                    <option key={catName} value={catName}>
                      📂 {catName} ({count} fiche{count > 1 ? "s" : ""})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Choix du nombre de fiches */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: isDarkMode ? "#cbd5e1" : "#475569",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Nombre de fiches à ajouter
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[5, 10, 15, 20, 25].map((cnt) => {
                  const isSelected = continueCount === cnt;
                  return (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setContinueCount(cnt)}
                      style={{
                        flex: 1,
                        padding: "9px 6px",
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 800,
                        fontFamily: "'JetBrains Mono', monospace",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        border: isSelected
                          ? "1.5px solid var(--mm-primary)"
                          : `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(15, 23, 42, 0.1)"}`,
                        background: isSelected
                          ? (isDarkMode ? "color-mix(in srgb, var(--mm-primary) 24%, transparent)" : "color-mix(in srgb, var(--mm-primary) 12%, transparent)")
                          : (isDarkMode ? "rgba(255, 255, 255, 0.04)" : "#ffffff"),
                        color: isSelected
                          ? "var(--mm-primary)"
                          : (isDarkMode ? "#94a3b8" : "#64748b"),
                        transform: isSelected ? "scale(1.03)" : "scale(1)",
                      }}
                    >
                      +{cnt}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Actions : Continuer & Terminer */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={handleContinueSession}
              className="btn-glow hov"
              style={{
                width: "100%",
                padding: "13px 20px",
                background: "linear-gradient(135deg, var(--mm-primary), color-mix(in srgb, var(--mm-primary) 80%, black))",
                color: "white",
                border: "none",
                borderRadius: 14,
                fontWeight: 800,
                fontSize: 14.5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 6px 20px color-mix(in srgb, var(--mm-primary) 35%, transparent)",
                transition: "transform 0.15s ease",
              }}
            >
              ▶ Continuer (+{continueCount} fiche{continueCount > 1 ? "s" : ""})
            </button>

            <button
              type="button"
              onClick={handleCloseSummary}
              className="hov"
              style={{
                width: "100%",
                padding: "11px 20px",
                background: "transparent",
                color: isDarkMode ? "#94a3b8" : "#64748b",
                border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.12)"}`,
                borderRadius: 14,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Terminer la session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty Queue ──
  if (reviewQueue.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#64748b", padding: 40 }}>
        <p style={{ fontSize: 20 }}>⏳</p>
        <p>Chargement des fiches...</p>
      </div>
    );
  }

  if (!currentCard) return null;

  const tag = cognitiveTag(currentCard);

  return (
    <div style={{ animation: "flowCardEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}>
      {/* Session Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 8 }}>
          <button
            onClick={() => {
              if (sessionTimerRef?.current) clearInterval(sessionTimerRef.current);
              setView?.((reviewMode === "module" || reviewMode === "free") ? "categories" : "dashboard");
              if (reviewSessionDone > 0) updateStreakAfterSession(reviewSessionDone);
            }}
            style={{
              background: theme?.cardBg || "#FFFFFF",
              border: `1px solid ${theme?.border || "#E2E8F0"}`,
              borderRadius: 10,
              padding: isMobile ? "6px 12px" : "8px 16px",
              color: theme?.highlight || "var(--mm-primary)",
              cursor: "pointer",
              fontSize: isMobile ? 12 : 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            ← {(reviewMode === "module" || reviewMode === "free") ? "Modules" : "Quitter"}
          </button>

          <div style={{ fontFamily: "'JetBrains Mono'", fontSize: isMobile ? 14 : 15, color: theme?.textMuted || "#64748B", textAlign: "center", minWidth: 60 }}>
            <span style={{ color: theme?.highlight || "var(--mm-primary)", fontWeight: 800 }}>{reviewIndex + 1}</span> / {reviewQueue.length}
          </div>

          <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 900, fontSize: isMobile ? 13 : 14, background: theme?.cardBg || "#FFFFFF", color: "var(--mm-primary)", padding: "4px 10px", borderRadius: 8, border: `1px solid ${theme?.border || "#E2E8F0"}`, flexShrink: 0 }}>
            ⏱ {Math.floor(sessionTimer / 60)}:{(sessionTimer % 60).toString().padStart(2, '0')}
          </div>
        </div>

        {/* Module Badge Row */}
        {reviewMode === "free" && (
          <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: 8,
              background: "color-mix(in srgb, #10B981 15%, transparent)",
              color: "#10B981",
              border: "1px solid color-mix(in srgb, #10B981 30%, transparent)",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              🎮 Entraînement libre {reviewCategory ? `: ${reviewCategory}` : ""} (sans impact SRS)
            </span>
          </div>
        )}
        {reviewMode === "module" && reviewCategory && (
          <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: 8,
              background: "color-mix(in srgb, var(--mm-primary) 15%, transparent)",
              color: theme?.highlight || "var(--mm-primary)",
              border: "1px solid color-mix(in srgb, var(--mm-primary) 30%, transparent)",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              🎯 Module : {reviewCategory}
            </span>
          </div>
        )}
      </div>

      {/* Combo Bar */}
      <div style={{ marginBottom: 12 }}>
        <ComboBar combo={reviewCombo} theme={theme} compact={isMobile} />
      </div>

      {/* Progress Bar */}
      <div style={{ height: 8, background: theme?.inputBg || "#F8FAFC", borderRadius: 4, marginBottom: 32, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "linear-gradient(90deg, var(--mm-primary), var(--mm-primary))", borderRadius: 4, transition: "width 0.4s ease", width: `${((reviewIndex + 1) / reviewQueue.length) * 100}%` }} />
      </div>

      {/* Card Actions Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setEditReturnTo?.({ view: "review", cardId: currentCard.id });
              startEdit?.(currentCard);
            }}
            className="hov"
            title="Modifier cette fiche puis revenir à la révision"
            style={{ background: "color-mix(in srgb, var(--mm-primary) 10%, white)", color: "var(--mm-primary)", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid color-mix(in srgb, var(--mm-primary) 19%, transparent)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            ✏️ Modifier
          </button>

          <button
            type="button"
            onClick={async () => {
              if (optimizingCard || !handleOptimizeOneCard || !currentCard) return;
              setOptimizingCard(true);
              try {
                await handleOptimizeOneCard(currentCard);
              } finally {
                setOptimizingCard(false);
              }
            }}
            disabled={optimizingCard}
            className="hov btn-glow"
            title="Optimiser cette fiche avec l'IA Coach (Vrai sens, dialogue, règle réflexe)"
            style={{
              background: optimizingCard
                ? "rgba(100, 116, 139, 0.6)"
                : "linear-gradient(135deg, #06B6D4, #2563EB)",
              color: "#FFFFFF",
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 800,
              border: "none",
              cursor: optimizingCard ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 4px 12px rgba(6, 182, 212, 0.25)",
              transition: "all 0.2s ease",
            }}
          >
            {optimizingCard ? "⏳ Optimisation..." : "✨ Optimiser"}
          </button>

          {(() => {
            const _leech = analyzeLeech(currentCard);
            if (!_leech.isLeech) return null;
            return (
              <button
                onClick={() => handleRescueLeech?.(currentCard)}
                disabled={leechRescueLoading}
                className="hov btn-glow"
                title={`Cette fiche a échoué ${_leech.totalLapses}× — l'IA va la reformuler pour la rendre mémorisable`}
                style={{ background: "linear-gradient(135deg, #F59E0B, #DC2626)", color: "white", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, border: "none", cursor: leechRescueLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(245,158,11,0.35)" }}
              >
                {leechRescueLoading ? "⏳" : "🩹"} Sauver
              </button>
            );
          })()}

          <button
            onClick={() => {
              deleteExp?.(currentCard.id);
              const newQueue = reviewQueue.filter(c => c.id !== currentCard.id);
              setReviewQueue?.(newQueue);
              setRevealed?.(false);
              setUserAnswer?.("");
              setSocraticHint?.("");
              setRabbitHoleOpen?.(false);
              setMnemonicText?.("");
              setCardStartTime?.(Date.now());
              if (reviewIndex >= newQueue.length) {
                setShowSessionSummary?.(true);
              }
            }}
            className="hov"
            title="Supprimer cette fiche définitivement"
            style={{ background: "#FEF2F2", color: "#EF4444", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid #EF444430", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            🗑️ Supprimer
          </button>

          {currentCard.paused && (
            <button
              onClick={() => unpauseCard?.(currentCard.id)}
              className="hov"
              title="Cette fiche est en pause — si tu l'as apprise, ajoute-la à la révision normale"
              style={{ background: "color-mix(in srgb, var(--mm-primary) 4%, white)", color: "var(--mm-primary)", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid color-mix(in srgb, var(--mm-primary) 19%, transparent)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              🔓 Ajouter à la révision
            </button>
          )}
        </div>
        <span style={{ background: colorMix(tag.color, 13), color: tag.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
          {tag.icon} {tag.label}
        </span>
      </div>

      {/* Main Flashcard Container */}
      <div
        className="card-hov review-session-card"
        style={{
          position: "relative",
          background: theme?.cardBg || "#FFFFFF",
          border: `1px solid ${theme?.border || "#E2E8F0"}`,
          borderRadius: 26,
          padding: "32px",
          boxShadow: "0 10px 40px color-mix(in srgb, var(--mm-primary) 5.0%, transparent)",
          maxWidth: 700,
          margin: "0 auto",
          transform: `translate(${swipeX}px, ${swipeY}px) rotate(${swipeX * 0.05}deg)`,
          transition: swipeX === 0 && swipeY === 0 ? 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none',
        }}
        onTouchStart={(e) => {
          if (!revealed) return;
          touchStartX.current = e.touches[0].clientX;
          touchStartY.current = e.touches[0].clientY;
        }}
        onTouchMove={(e) => {
          if (!revealed) return;
          const currentX = e.touches[0].clientX;
          const currentY = e.touches[0].clientY;
          const dx = currentX - touchStartX.current;
          const dy = currentY - touchStartY.current;
          if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 2.5) {
            e.preventDefault();
            setSwipeX(dx);
            setSwipeY(0);
          } else if (Math.abs(dy) > 8) {
            setSwipeX(0);
            setSwipeY(0);
          }
        }}
        onTouchEnd={(e) => {
          if (!revealed) return;
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          const dy = e.changedTouches[0].clientY - touchStartY.current;
          setSwipeX(0);
          setSwipeY(0);
          const threshold = 110;
          if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 2.5) {
            if (dx > threshold) {
              handleAnswer?.(3);
              if (window.navigator?.vibrate) window.navigator.vibrate(10);
            } else if (dx < -threshold) {
              handleAnswer?.(0);
              if (window.navigator?.vibrate) window.navigator.vibrate([30, 30, 30]);
            }
          }
        }}
      >
        {/* Card Header Badges */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ background: theme?.inputBg || "#F8FAFC", color: theme?.highlight || "var(--mm-primary)", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            {currentCard.category}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ background: "#FFFFFF", color: "var(--mm-primary)", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>
              {currentCard.difficulty !== undefined ? `Diff: ${currentCard.difficulty.toFixed(1)}/10` : `EF: ${(currentCard.easeFactor || 2.5).toFixed(1)}`}
            </span>
            <span style={{ background: "color-mix(in srgb, var(--mm-primary) 13%, transparent)", color: "var(--mm-primary)", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>
              N{currentCard.level}
            </span>
          </div>
        </div>

        {/* Recto Face */}
        <div style={{ background: isDarkMode ? "#1A0F2E" : "color-mix(in srgb, var(--mm-primary) 4%, white)", borderRadius: 20, padding: "28px", marginBottom: 20, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
          <div style={{ fontSize: 11, color: "var(--mm-primary-glow)", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>
            {activeFacet ? `QUESTION (${activeFacet.type.toUpperCase()})` : "QUESTION"}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: currentCard.imageUrl ? 20 : 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: theme?.highlight || "var(--mm-primary)", lineHeight: 1.35 }}>
              {activeFacet ? activeFacet.front : currentCard.front}
            </div>
            {isEnglishCategory(currentCard.category) && (
              <AudioPlayButton text={activeFacet ? activeFacet.front : currentCard.front} size="md" isDarkMode={isDarkMode} />
            )}
          </div>
          {(currentCard.audioUrl || currentCard.audioId) && currentCard.type !== "audio" && (
            <AudioFichePlayer card={currentCard} />
          )}
          {currentCard.imageUrl && (
            <img
              src={currentCard.imageUrl}
              alt="support visuel"
              className={!revealed ? "occlusion-img" : ""}
              style={{ width: "100%", borderRadius: 16, border: `2px solid ${theme?.border || "#E2E8F0"}` }}
              title={!revealed ? "Survole l'image pour l'apercevoir" : ""}
            />
          )}
        </div>

        {/* Hidden or Revealed State */}
        {!revealed ? (
          currentCard.type === "audio" ? (
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: theme?.textMuted || "#64748B", fontWeight: 700, marginBottom: 16 }}>
                🎧 Clique pour écouter l'audio, puis donne ton avis.
              </div>
              <button onClick={handleReveal} className="hov btn-glow" style={{ width: "100%", padding: "20px 24px", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))", color: "white", border: "none", borderRadius: 18, fontSize: 17, fontWeight: 800, cursor: "pointer", minHeight: 56 }}>
                ▶️ Écouter la réponse
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 24 }}>
              {voiceReviewActive ? (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ fontSize: 40, animation: "pulse 1s infinite", marginBottom: 16 }}>🎤</div>
                  <p style={{ fontWeight: 700, color: theme?.highlight || "var(--mm-primary)" }}>Parle ta réponse... (reconnaissance active)</p>
                  <button className="hov btn-glow" onClick={handleRevealAndStopVoice} style={{ padding: "12px 24px", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 800, marginTop: 12 }}>
                    Arrêter et voir la réponse
                  </button>
                </div>
              ) : (
                <>
                  {socraticMode ? (
                    <SocraticChat
                      card={currentCard}
                      initialUserError={userAnswer}
                      callClaude={callClaude}
                      theme={theme}
                      onResolve={() => {
                        setRevealed?.(true);
                        handleAnswerWithFeedback?.(5, currentCard);
                        showToast?.("🎓 Félicitations ! Tu as trouvé la réponse par toi-même.", "success");
                      }}
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <button
                        type="button"
                        onClick={handleReveal}
                        className="hov btn-glow"
                        style={{
                          width: "100%",
                          padding: isMobile ? "20px 24px" : "18px 24px",
                          background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))",
                          color: "white",
                          border: "none",
                          borderRadius: 18,
                          fontSize: 17,
                          fontWeight: 800,
                          cursor: "pointer",
                          minHeight: 56,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 10,
                          boxShadow: "0 6px 20px color-mix(in srgb, var(--mm-primary) 30%, transparent)",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <span>Voir la réponse</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        ) : (
          /* Revealed Face */
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ background: isDarkMode ? "#2A1400" : "#FFFFFF", border: `2px solid ${isDarkMode ? "#3D2000" : "color-mix(in srgb, var(--mm-primary) 4%, white)"}`, borderRadius: 20, padding: "28px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "var(--mm-primary)", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>
                RÉPONSE
              </div>
              {currentCard.type === "audio" ? (
                <div style={{ marginTop: 12 }}>
                  <AudioFichePlayer card={currentCard} />
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <GodTierContent text={activeFacet ? activeFacet.back : currentCard.back} theme={theme} isDarkMode={isDarkMode} showAudio={isEnglishCategory(currentCard.category)} />
                </div>
              )}
              {currentCard.example && currentCard.type !== "audio" && !/exemples?/i.test(currentCard.back || "") && (
                <div style={{ background: theme?.inputBg || "#F8FAFC", padding: "16px 20px", borderRadius: 16, marginTop: 24, fontSize: 15, color: theme?.textMuted || "#64748B", fontStyle: "italic", borderLeft: `4px solid ${theme?.highlight || "var(--mm-primary)"}`, position: "relative" }}>
                  <div style={{ position: "absolute", top: -10, left: 16, background: theme?.bg || "#FFFFFF", padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme?.highlight || "var(--mm-primary)", letterSpacing: 1 }}>
                    EXEMPLE
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <GodTierContent text={currentCard.example} theme={theme} isDarkMode={isDarkMode} showAudio={isEnglishCategory(currentCard.category)} />
                  </div>
                </div>
              )}
            </div>

            {/* Mnemonic & Deep Dive tools */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <button className="hov" onClick={generateMnemonic} disabled={mnemonicLoading} style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg, #FFFFFF, color-mix(in srgb, var(--mm-primary) 4%, white))", color: "var(--mm-primary)", border: "1px solid color-mix(in srgb, var(--mm-primary) 22%, white)", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
                {mnemonicLoading ? "⏳ Création..." : "✨ Générer Mnémonique"}
              </button>
              <button className="hov" onClick={() => setRabbitHoleOpen?.(true)} style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg, #2A1400, #3D2000)", color: "#FFA114", border: "1px solid #5C3200", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
                🕳️ Deep Dive
              </button>
            </div>

            {rabbitHoleOpen && (
              <RabbitHoleViewer
                concept={currentCard.front}
                callClaude={callClaude}
                theme={theme}
                onClose={() => setRabbitHoleOpen?.(false)}
              />
            )}

            {mnemonicText && (
              <div style={{ background: "#FFFFFF", borderLeft: "4px solid var(--mm-primary)", padding: "16px", borderRadius: 12, color: "var(--mm-primary-deep)", marginBottom: 20, fontSize: 14 }}>
                <div style={{ fontStyle: "italic", marginBottom: 12 }}>{mnemonicText}</div>
                <button
                  onClick={saveMnemonic}
                  disabled={mnemonicSaved}
                  className="hov"
                  style={{ padding: "8px 14px", background: mnemonicSaved ? "#ECFDF5" : "color-mix(in srgb, var(--mm-primary) 4%, white)", color: mnemonicSaved ? "#059669" : "var(--mm-primary)", border: `1px solid ${mnemonicSaved ? "#10B981" : "color-mix(in srgb, var(--mm-primary) 22%, white)"}`, borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: mnemonicSaved ? "default" : "pointer" }}
                >
                  {mnemonicSaved ? "✅ Ajouté à l'exemple" : "💾 Sauvegarder dans la fiche"}
                </button>
              </div>
            )}

            {isMobile && (
              <div style={{ textAlign: "center", color: theme?.textMuted || "#64748B", fontSize: 12, marginBottom: 10, opacity: 0.8 }}>
                💡 Glisse la carte : ⬆️ Facile | ⬇️ Hésité | ➡️ Bien | ⬅️ Oublié
              </div>
            )}

            {/* FSRS Grading Buttons */}
            {(() => {
              const showIntervalPreview = reviewMode !== "module" && reviewMode !== "free" && !reviewCategory;
              return (
                <div className="review-btns-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {[
                    { q: 0, emoji: "💀", label: "Oublié", sub: showIntervalPreview ? getPreviewInterval(currentCard, 0) : null, bg: isDarkMode ? "#2D0A0A" : "#FEE2E2", color: "#EF4444", border: "#EF4444" },
                    { q: 1, emoji: "😅", label: "Hésité", sub: showIntervalPreview ? getPreviewInterval(currentCard, 1) : null, bg: isDarkMode ? "#2D1A00" : "#FFFBEB", color: "#F59E0B", border: "#F59E0B" },
                    { q: 3, emoji: "👍", label: "Bien", sub: showIntervalPreview ? getPreviewInterval(currentCard, 3) : null, bg: isDarkMode ? "#1E1035" : "color-mix(in srgb, var(--mm-primary) 4%, white)", color: "var(--mm-primary)", border: "var(--mm-primary)" },
                    { q: 5, emoji: "⚡", label: "Facile", sub: showIntervalPreview ? getPreviewInterval(currentCard, 5) : null, bg: isDarkMode ? "#0A2010" : "#ECFDF5", color: "#10B981", border: "#10B981" },
                  ].map(({ q, emoji, label, sub, bg, color, border }) => (
                    <button
                      key={q}
                      className="hov review-btn"
                      onClick={() => {
                        handleAnswer?.(q);
                        if (window.navigator?.vibrate) window.navigator.vibrate(q === 0 ? [40, 20, 40] : 8);
                      }}
                      style={{
                        padding: "16px 10px",
                        background: bg,
                        color,
                        border: `1.5px solid ${border}40`,
                        borderRadius: 18,
                        fontWeight: 800,
                        fontSize: 14,
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        minHeight: 76,
                        lineHeight: 1.2,
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{emoji}</span>
                      <span>{label}</span>
                      {sub ? <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 600 }}>{sub}</span> : null}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Review History Dots */}
      {(currentCard.reviewHistory?.length || 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20, justifyContent: "center" }}>
          <span style={{ color: theme?.textMuted || "#64748B", fontSize: 12, fontFamily: "JetBrains Mono" }}>Historique: </span>
          {currentCard.reviewHistory.slice(-7).map((h, i) => (
            <span
              key={i}
              style={{ width: 10, height: 10, borderRadius: "50%", background: h.q === 0 ? "#F04040" : h.q === 1 ? "#F59E0B" : "var(--mm-primary)" }}
              title={`${h.date} — ${h.q === 0 ? "Oublié" : h.q === 1 ? "Hésité" : "Facile"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
