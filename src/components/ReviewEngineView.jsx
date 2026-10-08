import React, { useRef, useState } from "react";
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
}) {
  const [optimizingCard, setOptimizingCard] = useState(false);
  // Swipe gestuel local state
  const [swipeX, setSwipeX] = useState(0);
  const [swipeY, setSwipeY] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ── Fin de session intégrée nativement dans la vue de révision (Maître-Design) ──
  if (showSessionSummary) {
    const totalCards = sessionSummary?.totalCards || reviewSessionDone || reviewQueue.length || 0;
    const avgSec = sessionSummary?.avgTime || (totalCards > 0 ? Math.round(sessionTimer / totalCards) : 0);
    const hasRemaining = sessionRemainingCount > 0;
    const continueCount = Math.min(5, hasRemaining ? sessionRemainingCount : 5);

    return (
      <div style={{ animation: "flowCardEnter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both", maxWidth: 700, margin: "0 auto" }}>
        {/* En-tête de session préservé */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button
            onClick={() => {
              if (sessionTimerRef?.current) clearInterval(sessionTimerRef.current);
              setShowSessionSummary?.(false);
              setView?.(reviewMode === "module" ? "categories" : "dashboard");
            }}
            style={{
              background: theme?.cardBg || "#FFFFFF",
              border: `1px solid ${theme?.border || "#E2E8F0"}`,
              borderRadius: 10,
              padding: "8px 16px",
              color: theme?.highlight || "var(--mm-primary)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ← {reviewMode === "module" ? "Modules" : "Tableau de bord"}
          </button>
          <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#10B981", fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
            <span>✅</span> Session complétée
          </div>
          <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 900, fontSize: 14, background: theme?.cardBg || "#FFFFFF", color: "var(--mm-primary)", padding: "4px 12px", borderRadius: 8, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
            ⏱ {Math.floor(sessionTimer / 60)}:{(sessionTimer % 60).toString().padStart(2, '0')}
          </div>
        </div>

        {/* Barre de progression pleine 100% */}
        <div style={{ height: 8, background: theme?.inputBg || "#F8FAFC", borderRadius: 4, marginBottom: 24, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "linear-gradient(90deg, #10B981, var(--mm-primary))", borderRadius: 4, width: "100%" }} />
        </div>

        {/* Carte bilan reprenant exactement le gabarit de la carte de révision */}
        <div
          className="card-hov review-session-card"
          style={{
            position: "relative",
            background: theme?.cardBg || "#FFFFFF",
            border: `1px solid ${theme?.border || "#E2E8F0"}`,
            borderRadius: 26,
            padding: isMobile ? "24px 20px" : "36px 32px",
            boxShadow: "0 10px 40px color-mix(in srgb, var(--mm-primary) 8.0%, transparent)",
            textAlign: "center",
          }}
        >
          {/* Badges haut de carte */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <span style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10B981", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 800 }}>
              🎉 Objectif atteint
            </span>
            <span style={{ background: "color-mix(in srgb, var(--mm-primary) 12%, transparent)", color: "var(--mm-primary)", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono'" }}>
              ⚡ Combo max : {sessionBestCombo || 0}
            </span>
          </div>

          <div style={{ fontSize: 44, marginBottom: 8 }}>🏆</div>
          <h2 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 900, color: theme?.text || "#0F172A", margin: "0 0 6px" }}>
            Session terminée !
          </h2>
          <p style={{ fontSize: 14, color: theme?.textMuted || "#64748B", margin: "0 0 24px" }}>
            {totalCards} fiche{totalCards > 1 ? "s" : ""} révisée{totalCards > 1 ? "s" : ""} avec succès.
          </p>

          {/* Grille des KPIs en pill-boxes harmonieuses */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
            <div style={{ background: theme?.inputBg || "#F8FAFC", padding: "14px 10px", borderRadius: 16, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: "var(--mm-primary)", fontFamily: "'JetBrains Mono'" }}>
                {avgSec}s
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme?.textMuted || "#64748B", marginTop: 2 }}>
                Moyenne / carte
              </div>
            </div>

            <div style={{ background: theme?.inputBg || "#F8FAFC", padding: "14px 10px", borderRadius: 16, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: "#10B981", fontFamily: "'JetBrains Mono'" }}>
                N{sessionSummary?.avgLevelBefore || 0} → N{sessionSummary?.avgLevelAfter || 0}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme?.textMuted || "#64748B", marginTop: 2 }}>
                Niveau mémoire
              </div>
            </div>

            <div style={{ background: theme?.inputBg || "#F8FAFC", padding: "14px 10px", borderRadius: 16, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: "#F59E0B", fontFamily: "'JetBrains Mono'" }}>
                +{totalCards * 10} XP
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme?.textMuted || "#64748B", marginTop: 2 }}>
                Gain estimé
              </div>
            </div>
          </div>

          {/* Encart Continuer / Action principale */}
          <div
            style={{
              background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 12%, rgba(15,23,42,0.6))" : "color-mix(in srgb, var(--mm-primary) 6%, white)",
              border: "1px solid color-mix(in srgb, var(--mm-primary) 22%, transparent)",
              borderRadius: 18,
              padding: "18px 20px",
              marginBottom: 24,
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: theme?.text || "#0F172A", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{hasRemaining ? "⚡ Continuer l'apprentissage" : "✨ Programme du jour terminé"}</span>
                </div>
                <div style={{ fontSize: 12.5, color: theme?.textMuted || "#64748B", marginTop: 4 }}>
                  {hasRemaining
                    ? `Il te reste ${sessionRemainingCount} fiche${sessionRemainingCount > 1 ? "s" : ""} disponible${sessionRemainingCount > 1 ? "s" : ""} aujourd'hui (incluant les fiches à consolider).`
                    : "Toutes les fiches prévues sont maîtrisées ! Tu peux poursuivre en session bonus."}
                </div>
              </div>

              <button
                onClick={() => {
                  setShowSessionSummary?.(false);
                  startReview?.(
                    null,
                    "standard",
                    dailySessionPreview.length > 0 ? dailySessionPreview.slice(0, continueCount) : null,
                    { bonus: dailySessionPreview.length === 0 }
                  );
                }}
                className="btn-glow hov"
                style={{
                  padding: "12px 24px",
                  background: "linear-gradient(135deg, var(--mm-primary), color-mix(in srgb, var(--mm-primary) 80%, black))",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 16px color-mix(in srgb, var(--mm-primary) 35%, transparent)",
                }}
              >
                ▶ {hasRemaining ? `Continuer (${continueCount} fiche${continueCount > 1 ? "s" : ""})` : "Session bonus (+5)"}
              </button>
            </div>
          </div>

          {/* Mini-défi de production (si applicable) */}
          {productionInvite?.items?.length > 0 && (
            <div style={{ marginBottom: 24, textAlign: "left", background: theme?.inputBg || "#F8FAFC", borderRadius: 18, padding: 18, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
              <div style={{ fontWeight: 900, color: theme?.text || "#0F172A", fontSize: 15 }}>🗣️ Défi production ({productionInvite.items.length})</div>
              <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B", marginTop: 4, marginBottom: 14 }}>
                Ces expressions sont reconnues mais jamais produites. Écris une phrase réelle avec chacune :
              </div>
              {productionInvite.items.map((card) => {
                const res = productionResult[card.id];
                return (
                  <div key={card.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${theme?.border || "#E2E8F0"}` }}>
                    <div style={{ fontWeight: 800, color: theme?.highlight || "var(--mm-primary)", fontSize: 14 }}>{card.front}</div>
                    <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B", marginBottom: 8 }}>{card.back}</div>
                    <textarea
                      value={productionDraft[card.id] || ""}
                      onChange={(e) => setProductionDraft?.((prev) => ({ ...prev, [card.id]: e.target.value }))}
                      placeholder="Ta phrase en anglais…"
                      rows={2}
                      style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${theme?.border || "#E2E8F0"}`, background: theme?.cardBg || "#FFFFFF", color: theme?.text || "#0F172A", fontSize: 13, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <button
                        onClick={() => handleValidateProduction?.(card)}
                        disabled={productionBusy === card.id || res?.correct}
                        className="hov"
                        style={{ padding: "8px 16px", background: res?.correct ? "#10B98133" : "#10B981", color: res?.correct ? "#10B981" : "white", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 12, cursor: res?.correct ? "default" : "pointer" }}
                      >
                        {res?.correct ? "✅ Validée" : productionBusy === card.id ? "Analyse…" : "Valider"}
                      </button>
                      {res?.feedback && (
                        <span style={{ fontSize: 12, color: res.correct ? "#10B981" : (theme?.textMuted || "#64748B") }}>{res.feedback}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => setProductionInvite?.(null)}
                className="hov"
                style={{ padding: "6px 12px", background: "none", border: `1px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 10, color: theme?.textMuted || "#64748B", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Plus tard
              </button>
            </div>
          )}

          {/* Action secondaire : retour dashboard */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => {
                setShowSessionSummary?.(false);
                setView?.(reviewMode === "module" ? "categories" : "dashboard");
              }}
              className="hov"
              style={{
                padding: "10px 24px",
                background: "transparent",
                color: theme?.textMuted || "#64748B",
                border: `1px solid ${theme?.border || "#E2E8F0"}`,
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Terminer & Revenir {reviewMode === "module" ? "aux modules" : "au tableau de bord"}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={() => {
            if (sessionTimerRef?.current) clearInterval(sessionTimerRef.current);
            setView?.(reviewMode === "module" ? "categories" : "dashboard");
            if (reviewSessionDone > 0) updateStreakAfterSession(reviewSessionDone);
          }}
          style={{ background: theme?.cardBg || "#FFFFFF", border: `1px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 10, padding: "8px 16px", color: theme?.highlight || "var(--mm-primary)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          ← {reviewMode === "module" ? "Modules" : "Quitter"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {reviewMode === "module" && reviewCategory && (
            <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 8, background: "color-mix(in srgb, var(--mm-primary) 15%, transparent)", color: theme?.highlight || "var(--mm-primary)", border: "1px solid color-mix(in srgb, var(--mm-primary) 30%, transparent)" }}>
              🎯 Module : {reviewCategory}
            </span>
          )}
          <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 15, color: theme?.textMuted || "#64748B" }}>
            <span style={{ color: theme?.highlight || "var(--mm-primary)", fontWeight: 800 }}>{reviewIndex + 1}</span> / {reviewQueue.length}
          </div>
        </div>
        <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 900, fontSize: 14, background: "#FFFFFF", color: "var(--mm-primary)", padding: "4px 12px", borderRadius: 8 }}>
          ⏱ {Math.floor(sessionTimer / 60)}:{(sessionTimer % 60).toString().padStart(2, '0')}
        </div>
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
                  <GodTierContent text={activeFacet ? activeFacet.back : currentCard.back} theme={theme} isDarkMode={isDarkMode} />
                </div>
              )}
              {currentCard.example && currentCard.type !== "audio" && !/exemples?/i.test(currentCard.back || "") && (
                <div style={{ background: theme?.inputBg || "#F8FAFC", padding: "16px 20px", borderRadius: 16, marginTop: 24, fontSize: 15, color: theme?.textMuted || "#64748B", fontStyle: "italic", borderLeft: `4px solid ${theme?.highlight || "var(--mm-primary)"}`, position: "relative" }}>
                  <div style={{ position: "absolute", top: -10, left: 16, background: theme?.bg || "#FFFFFF", padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme?.highlight || "var(--mm-primary)", letterSpacing: 1 }}>
                    EXEMPLE
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <GodTierContent text={currentCard.example} theme={theme} isDarkMode={isDarkMode} />
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
            <div className="review-btns-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { q: 0, emoji: "💀", label: "Oublié", sub: getPreviewInterval(currentCard, 0), bg: isDarkMode ? "#2D0A0A" : "#FEE2E2", color: "#EF4444", border: "#EF4444" },
                { q: 1, emoji: "😅", label: "Hésité", sub: getPreviewInterval(currentCard, 1), bg: isDarkMode ? "#2D1A00" : "#FFFBEB", color: "#F59E0B", border: "#F59E0B" },
                { q: 3, emoji: "👍", label: "Bien", sub: getPreviewInterval(currentCard, 3), bg: isDarkMode ? "#1E1035" : "color-mix(in srgb, var(--mm-primary) 4%, white)", color: "var(--mm-primary)", border: "var(--mm-primary)" },
                { q: 5, emoji: "⚡", label: "Facile", sub: getPreviewInterval(currentCard, 5), bg: isDarkMode ? "#0A2010" : "#ECFDF5", color: "#10B981", border: "#10B981" },
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
                  <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 600 }}>{sub}</span>
                </button>
              ))}
            </div>
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
