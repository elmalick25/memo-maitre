import React, { useRef, useState } from "react";
import GodTierContent from "./GodTierContent";
import ComboBar from "./ComboBar";
import SessionEndHook from "./SessionEndHook";
import AudioFichePlayer from "./AudioFichePlayer";
import { SocraticChat, RabbitHoleViewer } from "../MemoMasterUpgrades";
import { getPreviewInterval, cognitiveTag } from "../lib/fsrs";
import { analyzeLeech } from "../lib/memoryLab";

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
}) {
  // Swipe gestuel local state
  const [swipeX, setSwipeX] = useState(0);
  const [swipeY, setSwipeY] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ── Session Summary Screen ──
  if (showSessionSummary) {
    return (
      <div style={{ animation: "fadeUp 0.4s ease", background: theme?.cardBg || "#FFFFFF", borderRadius: 26, padding: 32, maxWidth: 700, margin: "0 auto", textAlign: "center", border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
        <h1 style={{ fontWeight: 900, color: theme?.highlight || "#8B5CF6" }}>Session terminée ! 🎉</h1>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
          <div style={{ background: theme?.inputBg || "#F8FAFC", padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: theme?.highlight || "#8B5CF6" }}>{sessionSummary?.totalCards || 0}</div>
            <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B" }}>Cartes révisées</div>
          </div>
          <div style={{ background: theme?.inputBg || "#F8FAFC", padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: theme?.highlight || "#8B5CF6" }}>{sessionSummary?.avgTime || 0}s</div>
            <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B" }}>Temps moyen / carte</div>
          </div>
          <div style={{ background: theme?.inputBg || "#F8FAFC", padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: theme?.highlight || "#8B5CF6" }}>N{sessionSummary?.avgLevelBefore || 0}</div>
            <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B" }}>Niveau moy. avant</div>
          </div>
          <div style={{ background: theme?.inputBg || "#F8FAFC", padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#8B5CF6" }}>N{sessionSummary?.avgLevelAfter || 0}</div>
            <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B" }}>Niveau moy. estimé après</div>
          </div>
        </div>

        {/* Mini-défi de production */}
        {productionInvite?.items?.length > 0 && (
          <div style={{ marginTop: 24, textAlign: "left", background: theme?.inputBg || "#F8FAFC", borderRadius: 18, padding: 18, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
            <div style={{ fontWeight: 900, color: theme?.text || "#0F172A", fontSize: 15 }}>🗣️ Défi production ({productionInvite.items.length})</div>
            <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B", marginTop: 4, marginBottom: 14 }}>
              Ces expressions sont reconnues mais jamais produites. Écris une phrase réelle avec chacune : c'est ce qui autorise des intervalles longs.
            </div>
            {productionInvite.items.map((card) => {
              const res = productionResult[card.id];
              return (
                <div key={card.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${theme?.border || "#E2E8F0"}` }}>
                  <div style={{ fontWeight: 800, color: theme?.highlight || "#8B5CF6", fontSize: 14 }}>{card.front}</div>
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

        {/* Gamification Session End Hook */}
        <SessionEndHook
          totalXP={powerLevel}
          questState={questState}
          sessionBestCombo={sessionBestCombo}
          bestComboEver={bestComboEver}
          avgXPPerReview={sessionSummary?.totalCards ? Math.max(3, Math.round(((xpState?.daily?.slice(-1)[0]?.xp || 0) / Math.max(1, sessionSummary.totalCards)))) : 10}
          remainingCards={sessionRemainingCount}
          theme={theme}
          compact={isMobile}
          badges={badgeProgressForHooks}
          onContinue={(n) => {
            setShowSessionSummary?.(false);
            startReview?.(null, "standard", dailySessionPreview.length > 0 ? dailySessionPreview.slice(0, n) : null, { bonus: dailySessionPreview.length === 0 });
          }}
        />

        <button onClick={() => { setView?.("dashboard"); setShowSessionSummary?.(false); }} className="btn-glow hov" style={{ marginTop: 24, padding: "14px 28px", background: "#7C3AED", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
          Retour au tableau de bord
        </button>
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
            setView?.("dashboard");
            if (reviewSessionDone > 0) updateStreakAfterSession(reviewSessionDone);
          }}
          style={{ background: theme?.cardBg || "#FFFFFF", border: `1px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 10, padding: "8px 16px", color: theme?.highlight || "#8B5CF6", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          ← Quitter
        </button>
        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 15, color: theme?.textMuted || "#64748B" }}>
          <span style={{ color: theme?.highlight || "#8B5CF6", fontWeight: 800 }}>{reviewIndex + 1}</span> / {reviewQueue.length}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 900, fontSize: 14, background: "#FFFFFF", color: "#7C3AED", padding: "4px 12px", borderRadius: 8 }}>
          ⏱ {Math.floor(sessionTimer / 60)}:{(sessionTimer % 60).toString().padStart(2, '0')}
        </div>
      </div>

      {/* Combo Bar */}
      <div style={{ marginBottom: 12 }}>
        <ComboBar combo={reviewCombo} theme={theme} compact={isMobile} />
      </div>

      {/* Progress Bar */}
      <div style={{ height: 8, background: theme?.inputBg || "#F8FAFC", borderRadius: 4, marginBottom: 32, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "linear-gradient(90deg, #7C3AED, #8B5CF6)", borderRadius: 4, transition: "width 0.4s ease", width: `${((reviewIndex + 1) / reviewQueue.length) * 100}%` }} />
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
            style={{ background: "#F3E8FF", color: "#8B5CF6", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid #8B5CF630", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            ✏️ Modifier
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
              style={{ background: "#F5F3FF", color: "#8B5CF6", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid #8B5CF630", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              🔓 Ajouter à la révision
            </button>
          )}
        </div>
        <span style={{ background: tag.color + "22", color: tag.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
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
          boxShadow: "0 10px 40px rgba(139, 92, 246,0.05)",
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
          <span style={{ background: theme?.inputBg || "#F8FAFC", color: theme?.highlight || "#8B5CF6", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            {currentCard.category}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ background: "#FFFFFF", color: "#7C3AED", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>
              {currentCard.difficulty !== undefined ? `Diff: ${currentCard.difficulty.toFixed(1)}/10` : `EF: ${(currentCard.easeFactor || 2.5).toFixed(1)}`}
            </span>
            <span style={{ background: "#8B5CF622", color: "#8B5CF6", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>
              N{currentCard.level}
            </span>
          </div>
        </div>

        {/* Recto Face */}
        <div style={{ background: isDarkMode ? "#1A0F2E" : "#FAF5FF", borderRadius: 20, padding: "28px", marginBottom: 20, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
          <div style={{ fontSize: 11, color: "#C084FC", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>
            {activeFacet ? `QUESTION (${activeFacet.type.toUpperCase()})` : "QUESTION"}
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: theme?.highlight || "#8B5CF6", lineHeight: 1.35, marginBottom: currentCard.imageUrl ? 20 : 0 }}>
            {activeFacet ? activeFacet.front : currentCard.front}
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
              <button onClick={handleReveal} className="hov btn-glow" style={{ width: "100%", padding: "20px 24px", background: "linear-gradient(135deg, #7C3AED, #8B5CF6)", color: "white", border: "none", borderRadius: 18, fontSize: 17, fontWeight: 800, cursor: "pointer", minHeight: 56 }}>
                ▶️ Écouter la réponse
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 24 }}>
              {voiceReviewActive ? (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ fontSize: 40, animation: "pulse 1s infinite", marginBottom: 16 }}>🎤</div>
                  <p style={{ fontWeight: 700, color: theme?.highlight || "#8B5CF6" }}>Parle ta réponse... (reconnaissance active)</p>
                  <button className="hov btn-glow" onClick={handleRevealAndStopVoice} style={{ padding: "12px 24px", background: "linear-gradient(135deg, #7C3AED, #8B5CF6)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 800, marginTop: 12 }}>
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
                    <>
                      <textarea
                        style={{ width: "100%", padding: "16px", background: theme?.inputBg || "#F8FAFC", border: `2px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 16, fontSize: 15, color: theme?.text || "#0F172A", minHeight: 80, marginBottom: 12 }}
                        placeholder="Tape ta réponse..."
                        value={userAnswer}
                        onChange={(e) => setUserAnswer?.(e.target.value)}
                      />
                      {socraticHint && (
                        <div style={{ background: "#FAF5FF", borderLeft: "4px solid #A855F7", padding: 12, borderRadius: 4, marginBottom: 16, color: "#4C1D95", fontSize: 14 }}>
                          <strong style={{ display: "block", marginBottom: 4 }}>🧙‍♂️ Tuteur IA :</strong> {socraticHint}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <button
                          onClick={handleSemanticEval}
                          disabled={evalLoading || !userAnswer.trim()}
                          style={{ flex: 1, padding: "18px", background: "linear-gradient(135deg, #7C3AED, #8B5CF6)", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
                        >
                          {evalLoading ? "🧠 Analyse..." : "🧠 IA Socratique"}
                        </button>
                        <button
                          onClick={handleReveal}
                          className="hov"
                          style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", padding: "20px 24px", background: isMobile ? "linear-gradient(135deg, #7C3AED, #8B5CF6)" : "transparent", color: isMobile ? "white" : (theme?.textMuted || "#64748B"), border: isMobile ? "none" : `2px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 18, fontSize: isMobile ? 17 : 16, fontWeight: 800, cursor: "pointer", minHeight: 56 }}
                        >
                          {isMobile ? "Voir la réponse →" : "Passer / Voir"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )
        ) : (
          /* Revealed Face */
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ background: isDarkMode ? "#2A1400" : "#FFFFFF", border: `2px solid ${isDarkMode ? "#3D2000" : "#FAF5FF"}`, borderRadius: 20, padding: "28px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "#8B5CF6", fontWeight: 800, letterSpacing: 2, marginBottom: 14, fontFamily: "'JetBrains Mono'" }}>
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
                <div style={{ background: theme?.inputBg || "#F8FAFC", padding: "16px 20px", borderRadius: 16, marginTop: 24, fontSize: 15, color: theme?.textMuted || "#64748B", fontStyle: "italic", borderLeft: `4px solid ${theme?.highlight || "#8B5CF6"}`, position: "relative" }}>
                  <div style={{ position: "absolute", top: -10, left: 16, background: theme?.bg || "#FFFFFF", padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme?.highlight || "#8B5CF6", letterSpacing: 1 }}>
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
              <button className="hov" onClick={generateMnemonic} disabled={mnemonicLoading} style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg, #FFFFFF, #FAF5FF)", color: "#8B5CF6", border: "1px solid #DDD6FE", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
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
              <div style={{ background: "#FFFFFF", borderLeft: "4px solid #8B5CF6", padding: "16px", borderRadius: 12, color: "#4C1D95", marginBottom: 20, fontSize: 14 }}>
                <div style={{ fontStyle: "italic", marginBottom: 12 }}>{mnemonicText}</div>
                <button
                  onClick={saveMnemonic}
                  disabled={mnemonicSaved}
                  className="hov"
                  style={{ padding: "8px 14px", background: mnemonicSaved ? "#ECFDF5" : "#FAF5FF", color: mnemonicSaved ? "#059669" : "#8B5CF6", border: `1px solid ${mnemonicSaved ? "#10B981" : "#DDD6FE"}`, borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: mnemonicSaved ? "default" : "pointer" }}
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
                { q: 3, emoji: "👍", label: "Bien", sub: getPreviewInterval(currentCard, 3), bg: isDarkMode ? "#1E1035" : "#FAF5FF", color: "#8B5CF6", border: "#8B5CF6" },
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
              style={{ width: 10, height: 10, borderRadius: "50%", background: h.q === 0 ? "#F04040" : h.q === 1 ? "#F59E0B" : "#8B5CF6" }}
              title={`${h.date} — ${h.q === 0 ? "Oublié" : h.q === 1 ? "Hésité" : "Facile"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
