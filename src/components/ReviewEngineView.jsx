import React, { useRef, useState, useEffect, useMemo } from "react";
import GodTierContent from "./GodTierContent";
import ComboBar from "./ComboBar";
import SessionEndHook from "./SessionEndHook";
import AudioFichePlayer from "./AudioFichePlayer";
import AudioPlayButton from "./AudioPlayButton";
import { isEnglishCategory } from "../lib/englishCardEngine";
import { SocraticChat, RabbitHoleViewer } from "../MemoMasterUpgrades";
import { getPreviewInterval, cognitiveTag } from "../lib/fsrs";
import { analyzeLeech, isNovaCard, isNovaMistakeCard } from "../lib/memoryLab";
import { colorMix } from "../lib/colorMix";
import { pickExtraSessionCards } from "../lib/extraSessionEngine.js";

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
  saveModuleSession = () => {},
  clearModuleSession = () => {},
  setShowAgentPanel = () => {},
  sessionStartedAt = 0,
}) {
  const [optimizingCard, setOptimizingCard] = useState(false);
  // Swipe gestuel : piloté par refs (aucun re-rendu pendant le geste)
  const cardRef = useRef(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeTrackingRef = useRef(false);
  const swipeActiveRef = useRef(false);
  const applyCardOffset = (dx) => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = `translate3d(${dx}px, 0, 0) rotate(${dx * 0.05}deg)`;
  };
  const resetCardOffset = () => {
    const el = cardRef.current;
    if (!el || !el.style.transform) return;
    el.style.transition = "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    el.style.transform = "";
  };

  // Configuration pour poursuivre la révision (module + nombre de fiches)
  const [selectedModule, setSelectedModule] = useState(reviewCategory || "all");
  const [continueCount, setContinueCount] = useState(10);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.classList.add("in-review-session");
      return () => {
        document.body.classList.remove("in-review-session");
      };
    }
  }, []);

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
    const pickedCards = pickExtraSessionCards({
      expressions,
      dailySessionPreview,
      selectedModule,
      count: continueCount,
    });

    if (pickedCards.length === 0) {
      showToast?.("Aucune fiche disponible dans ce module", "info");
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
    <div className="mm-view-enter" style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", paddingBottom: isMobile ? "calc(110px + env(safe-area-inset-bottom, 16px))" : 40 }}>
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
            ← {(reviewMode === "module" || reviewMode === "free") ? "Modules" : "Accueil"}
          </button>

          <div style={{ fontFamily: "'JetBrains Mono'", fontSize: isMobile ? 14 : 15, color: theme?.textMuted || "#64748B", textAlign: "center", minWidth: 60 }}>
            <span style={{ color: theme?.highlight || "var(--mm-primary)", fontWeight: 800 }}>{reviewIndex + 1}</span> / {reviewQueue.length}
          </div>

          <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 900, fontSize: isMobile ? 13 : 14, background: theme?.cardBg || "#FFFFFF", color: "var(--mm-primary)", padding: "4px 10px", borderRadius: 8, border: `1px solid ${theme?.border || "#E2E8F0"}`, flexShrink: 0 }}>
            ⏱ <SessionClock startedAt={sessionStartedAt} fallbackSeconds={sessionTimer} />
          </div>
        </div>

        {/* Mode & Category Context Banner */}
        <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
          {reviewMode === "free" ? (
            <span style={{
              fontSize: 11.5,
              fontWeight: 800,
              padding: "4px 12px",
              borderRadius: 10,
              background: "color-mix(in srgb, #10B981 12%, transparent)",
              color: "#10B981",
              border: "1px solid color-mix(in srgb, #10B981 30%, transparent)",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <span>🎮</span>
              <span>Entraînement libre {reviewCategory ? `· ${reviewCategory}` : ""} (sans impact SRS)</span>
            </span>
          ) : reviewCategory ? (
            <span style={{
              fontSize: 11.5,
              fontWeight: 800,
              padding: "4px 12px",
              borderRadius: 10,
              background: "color-mix(in srgb, var(--mm-primary) 12%, transparent)",
              color: theme?.highlight || "var(--mm-primary)",
              border: "1px solid color-mix(in srgb, var(--mm-primary) 30%, transparent)",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <span>🎯</span>
              <span>Révision FSRS · Module {reviewCategory}</span>
            </span>
          ) : (
            <span style={{
              fontSize: 11.5,
              fontWeight: 800,
              padding: "4px 12px",
              borderRadius: 10,
              background: "color-mix(in srgb, var(--mm-primary) 8%, transparent)",
              color: theme?.highlight || "var(--mm-primary)",
              border: "1px solid color-mix(in srgb, var(--mm-primary) 22%, transparent)",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <span>🧠</span>
              <span>Révision FSRS Quotidienne</span>
            </span>
          )}
        </div>
      </div>

      {/* Combo Bar */}
      <div style={{ marginBottom: 12 }}>
        <ComboBar combo={reviewCombo} theme={theme} compact={isMobile} />
      </div>

      {/* Progress Bar */}
      <div style={{ height: 8, background: theme?.inputBg || "#F8FAFC", borderRadius: 4, marginBottom: isMobile ? 18 : 32, overflow: "hidden" }}>
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

          <button
            onClick={() => {
              deleteExp?.(currentCard.id);
              const newQueue = reviewQueue.filter(c => c.id !== currentCard.id);
              setReviewQueue?.(newQueue);
              if (reviewCategory && typeof saveModuleSession === "function") {
                if (newQueue.length === 0) {
                  clearModuleSession?.(reviewCategory);
                } else {
                  saveModuleSession(reviewCategory, newQueue, Math.min(reviewIndex, Math.max(0, newQueue.length - 1)));
                }
              }
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              setShowAgentPanel?.(true);
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("memomaster:agent-card-focus", {
                    detail: { card: currentCard, revealed: Boolean(revealed) },
                  })
                );
              }
            }}
            className="hov btn-glow"
            title="Poser une question à l'IA Maodo sur cette fiche"
            style={{
              background: isDarkMode
                ? "linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(168, 85, 247, 0.22))"
                : "linear-gradient(135deg, #EEF2FF, #FAF5FF)",
              color: isDarkMode ? "#C084FC" : "#7E22CE",
              border: isDarkMode
                ? "1px solid rgba(168, 85, 247, 0.4)"
                : "1px solid rgba(168, 85, 247, 0.3)",
              padding: isMobile ? "4px 10px" : "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: isDarkMode
                ? "0 2px 10px rgba(168, 85, 247, 0.2)"
                : "0 2px 8px rgba(168, 85, 247, 0.12)",
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ fontSize: 13 }}>🤖</span>
            <span>{isMobile ? "IA" : "Demander à l'IA"}</span>
          </button>
          <span style={{ background: colorMix(tag.color, 13), color: tag.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            {tag.icon} {tag.label}
          </span>
        </div>
      </div>

      {/* Main Flashcard Container */}
      {/* ⚡ PERF/SCROLL : le glissement de carte est appliqué directement sur
          l'élément (ref) au lieu de passer par un état React. Avant, chaque
          mouvement du doigt pouvait re-rendre toute la fiche (markdown,
          tableaux…) et faire « caler » le défilement vertical sur mobile. */}
      <div
        ref={cardRef}
        className="card-hov review-session-card"
        style={{
          position: "relative",
          background: theme?.cardBg || "#FFFFFF",
          border: `1px solid ${theme?.border || "#E2E8F0"}`,
          borderRadius: isMobile ? 20 : 26,
          padding: isMobile ? "16px 14px" : "32px",
          boxShadow: "0 10px 40px color-mix(in srgb, var(--mm-primary) 5.0%, transparent)",
          maxWidth: 700,
          width: "100%",
          boxSizing: "border-box",
          touchAction: "pan-y",
          margin: "0 auto",
        }}
        onTouchStart={(e) => {
          swipeActiveRef.current = false;
          if (!revealed) return;
          touchStartX.current = e.touches[0].clientX;
          touchStartY.current = e.touches[0].clientY;
          swipeTrackingRef.current = true;
        }}
        onTouchMove={(e) => {
          if (!revealed || !swipeTrackingRef.current) return;
          const dx = e.touches[0].clientX - touchStartX.current;
          const dy = e.touches[0].clientY - touchStartY.current;
          if (!swipeActiveRef.current) {
            // Le doigt part surtout à la verticale → c'est un scroll : on
            // arrête de suivre le geste pour laisser le navigateur défiler.
            if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
              swipeTrackingRef.current = false;
              return;
            }
            if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy) * 2.5) {
              swipeActiveRef.current = true;
            } else {
              return;
            }
          }
          applyCardOffset(dx);
        }}
        onTouchEnd={(e) => {
          const wasSwiping = swipeActiveRef.current;
          swipeTrackingRef.current = false;
          swipeActiveRef.current = false;
          resetCardOffset();
          if (!revealed || !wasSwiping) return;
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          const dy = e.changedTouches[0].clientY - touchStartY.current;
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
        onTouchCancel={() => {
          swipeTrackingRef.current = false;
          swipeActiveRef.current = false;
          resetCardOffset();
        }}
      >
        {/* Card Header Badges */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: theme?.inputBg || "#F8FAFC", color: theme?.highlight || "var(--mm-primary)", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              {currentCard.category}
            </span>
            {isNovaMistakeCard(currentCard) && (
              <span style={{
                background: "color-mix(in srgb, #3b82f6 14%, transparent)",
                color: "#2563eb",
                border: "1px solid color-mix(in srgb, #3b82f6 28%, transparent)",
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                gap: 5
              }}>
                🎙️ Erreur Nova
              </span>
            )}
          </div>
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
        <div style={{ background: isDarkMode ? "#1A0F2E" : "color-mix(in srgb, var(--mm-primary) 4%, white)", borderRadius: 20, padding: isMobile ? "20px 16px" : "28px", marginBottom: 20, border: `1px solid ${theme?.border || "#E2E8F0"}`, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
          <div style={{ fontSize: 11, color: "var(--mm-primary-glow)", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>
            {activeFacet ? `QUESTION (${activeFacet.type.toUpperCase()})` : "QUESTION"}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: currentCard.imageUrl ? 20 : 0 }}>
            <div style={{ fontSize: isMobile ? 21 : 26, fontWeight: 800, color: theme?.highlight || "var(--mm-primary)", lineHeight: 1.35, wordBreak: "break-word", overflowWrap: "break-word", minWidth: 0, flex: 1 }}>
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
          <div style={{ animation: "slideIn 0.3s ease", width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
            <div style={{ background: isDarkMode ? "#2A1400" : "#FFFFFF", border: `2px solid ${isDarkMode ? "#3D2000" : "color-mix(in srgb, var(--mm-primary) 4%, white)"}`, borderRadius: 20, padding: isMobile ? "20px 16px" : "28px", marginBottom: 20, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
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
              {currentCard.example && currentCard.type !== "audio" && !/exemples?/i.test(currentCard.back || "") && !String(currentCard.back || "").toLowerCase().includes(String(currentCard.example).trim().toLowerCase()) && (
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
              const showIntervalPreview = reviewMode !== "free";
              const grades = [
                { q: 0, emoji: "💀", label: "Oublié", sub: showIntervalPreview ? getPreviewInterval(currentCard, 0) : null, bg: isDarkMode ? "#2D0A0A" : "#FEE2E2", color: "#EF4444", border: "#EF4444" },
                { q: 1, emoji: "😅", label: "Hésité", sub: showIntervalPreview ? getPreviewInterval(currentCard, 1) : null, bg: isDarkMode ? "#2D1A00" : "#FFFBEB", color: "#F59E0B", border: "#F59E0B" },
                { q: 3, emoji: "👍", label: "Bien", sub: showIntervalPreview ? getPreviewInterval(currentCard, 3) : null, bg: isDarkMode ? "#1E1035" : "color-mix(in srgb, var(--mm-primary) 4%, white)", color: "var(--mm-primary)", border: "var(--mm-primary)" },
                { q: 5, emoji: "⚡", label: "Facile", sub: showIntervalPreview ? getPreviewInterval(currentCard, 5) : null, bg: isDarkMode ? "#0A2010" : "#ECFDF5", color: "#10B981", border: "#10B981" },
              ];

              return (
                <div
                  className="review-btns-dock"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: isMobile ? 6 : 10,
                    width: "100%",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    marginTop: isMobile ? 16 : 20,
                  }}
                >
                  {grades.map(({ q, emoji, label, sub, bg, color, border }) => (
                    <button
                      key={q}
                      type="button"
                      className="hov review-btn"
                      onClick={() => {
                        handleAnswer?.(q);
                        if (window.navigator?.vibrate) window.navigator.vibrate(q === 0 ? [40, 20, 40] : 8);
                      }}
                      style={{
                        padding: isMobile ? "10px 4px" : "16px 10px",
                        background: bg,
                        color,
                        border: `1.5px solid ${border}40`,
                        borderRadius: 14,
                        fontWeight: 800,
                        fontSize: isMobile ? 12 : 14,
                        minWidth: 0,
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                        minHeight: isMobile ? 54 : 76,
                        lineHeight: 1.2,
                        touchAction: "manipulation",
                      }}
                    >
                      <span style={{ fontSize: isMobile ? 18 : 22 }}>{emoji}</span>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{label}</span>
                      {sub ? <span style={{ fontSize: isMobile ? 9.5 : 10, opacity: 0.75, fontWeight: 600 }}>{sub}</span> : null}
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

// ⏱ Chrono de session isolé : seul ce petit composant se met à jour chaque
// seconde (au lieu de toute l'application).
function SessionClock({ startedAt = 0, fallbackSeconds = 0 }) {
  const compute = () => (startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : fallbackSeconds || 0);
  const [seconds, setSeconds] = useState(compute);
  useEffect(() => {
    setSeconds(compute());
    if (!startedAt) return undefined;
    const id = setInterval(() => setSeconds(compute()), 1000);
    return () => clearInterval(id);
  }, [startedAt, fallbackSeconds]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, "0")}
    </>
  );
}
