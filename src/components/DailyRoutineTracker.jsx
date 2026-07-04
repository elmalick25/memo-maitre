// 📅 DailyRoutineTracker.jsx
// Planificateur de Routine Quotidienne — El Hadji Malick
// Affiche le planning personnalisé, permet de cocher chaque étape,
// se réinitialise automatiquement à chaque nouveau jour.
//
// Props :
//   theme        : { text, textMuted, cardBg, border, inputBg, highlight }
//   isDarkMode   : bool
//   onAction     : (actionId) => void  → pour déclencher les actions app (startReview, setView, etc.)

import { useState, useEffect, useCallback } from "react";
import { today as todayStr } from "../utils/dateUtils";

// ─── Définition du planning personnalisé ────────────────────────────────────
// Chaque étape a : id, periode, label, sub, icon, duration (min), actionId
const ROUTINE_STEPS = [
  // ─── MATIN ───────────────────────────────────────────────────────────────
  {
    id: "matin_stats",
    period: "matin",
    periodLabel: "☀️ Matin",
    periodColor: "#F59E0B",
    icon: "📊",
    label: "Stats du jour",
    sub: "Voir les fiches dues, la progression, le streak",
    duration: 2,
    actionId: "stats",
    tip: "Commence par savoir combien de fiches tu as à réviser aujourd'hui",
  },
  {
    id: "matin_revision",
    period: "matin",
    periodLabel: "☀️ Matin",
    periodColor: "#F59E0B",
    icon: "🧠",
    label: "Révision FSRS",
    sub: "Réviser TOUTES les fiches dues (Flow State recommandé)",
    duration: 20,
    actionId: "review",
    tip: "La révision du matin = mémoire fraîche. C'est le meilleur moment scientifiquement.",
  },
  {
    id: "matin_actu",
    period: "matin",
    periodLabel: "☀️ Matin",
    periodColor: "#F59E0B",
    icon: "📰",
    label: "Actualités Tech",
    sub: "Veille technologique + créer des fiches sur les news importantes",
    duration: 10,
    actionId: "veille",
    tip: "1 news = au moins 1 fiche. Crée des fiches sur ce qui t'intéresse ou t'est utile.",
  },

  // ─── PAUSE MIDI ────────────────────────────────────────────────────────────
  {
    id: "pause_revision",
    period: "midi",
    periodLabel: "⚡ Pauses",
    periodColor: "#4D6BFE",
    icon: "⚡",
    label: "Révision en pause",
    sub: "5-10 min de révision pendant les pauses de la journée",
    duration: 10,
    actionId: "review",
    tip: "Les micro-sessions en pause consolident la mémoire à long terme.",
  },

  // ─── SOIR 18h ─────────────────────────────────────────────────────────────
  {
    id: "soir_video_en",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "🎬",
    label: "Vidéo Anglais",
    sub: "Regarder 1 vidéo en anglais (podcast, YouTube, news)",
    duration: 10,
    actionId: "practice",
    tip: "Utilise CoachNewsAnchor pour les actualités en anglais ou Live News Module.",
  },
  {
    id: "soir_ajout_expressions",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "✍️",
    label: "Ajouter expressions apprises",
    sub: "Créer des fiches sur les expressions entendues dans la vidéo",
    duration: 5,
    actionId: "add",
    tip: "Tape les expressions dans la section Ajouter → Chat Copilot IA pour les enrichir automatiquement.",
  },
  {
    id: "soir_ecrit",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "📝",
    label: "Écriture en anglais",
    sub: "Rédiger quelques phrases ou un court paragraphe en anglais",
    duration: 5,
    actionId: "practice",
    tip: "Dans EnglishPractice → Mode Écriture. Génère une évaluation IA de ta rédaction.",
  },
  {
    id: "soir_dictee",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "🎧",
    label: "Dictée anglaise",
    sub: "Écouter et retranscrire un passage en anglais",
    duration: 5,
    actionId: "practice",
    tip: "CoachSpeedListening avec vitesse réduite au départ, puis augmenter progressivement.",
  },
  {
    id: "soir_parler",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "🗣️",
    label: "Parler anglais",
    sub: "Conversation orale avec Nova AI ou en mode VoiceMirror",
    duration: 5,
    actionId: "practice",
    tip: "Ouvre EnglishPractice → Nova Voice. Parle de ta journée ou d'un sujet de ton choix.",
  },
  {
    id: "soir_revision_nouvelles",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "🔄",
    label: "Révision fiches fraîches",
    sub: "Réviser les fiches créées le soir (1ère révision à chaud)",
    duration: 10,
    actionId: "review",
    tip: "Crée tes fiches d'abord, puis révise-les immédiatement. Le premier rappel est crucial.",
  },

  // ─── APRÈS LE SOIR ─────────────────────────────────────────────────────────
  {
    id: "apres_fiches_cours",
    period: "nuit_debut",
    periodLabel: "📚 Après (cours)",
    periodColor: "#0891B2",
    icon: "📚",
    label: "Fiches des cours du jour",
    sub: "Créer les fiches sur les matières étudiées aujourd'hui",
    duration: 20,
    actionId: "add",
    tip: "Utilise Batch IA ou le Lab (si tu as un PDF de cours) pour générer vite.",
  },
  {
    id: "apres_revision_cours",
    period: "nuit_debut",
    periodLabel: "📚 Après (cours)",
    periodColor: "#0891B2",
    icon: "🎯",
    label: "Révision des fiches de cours",
    sub: "Réviser immédiatement les fiches créées depuis les cours du jour",
    duration: 15,
    actionId: "review",
    tip: "La révision immédiate après création = taux de mémorisation x2.",
  },

  // ─── NUIT ──────────────────────────────────────────────────────────────────
  {
    id: "nuit_review_finale",
    period: "nuit",
    periodLabel: "🌙 Nuit",
    periodColor: "#6D28D9",
    icon: "🌙",
    label: "Review finale",
    sub: "Terminer les fiches dues restantes si session pas complète",
    duration: 20,
    actionId: "review",
    tip: "Révision avant le sommeil = consolidation pendant la nuit. Très puissant scientifiquement.",
  },
  {
    id: "nuit_expressions_soir",
    period: "nuit",
    periodLabel: "🌙 Nuit",
    periodColor: "#6D28D9",
    icon: "💡",
    label: "Expressions de la nuit",
    sub: "Ajouter les expressions ou mots appris avant de dormir",
    duration: 5,
    actionId: "add",
    tip: "Les 5 dernières minutes avant de dormir = or pur pour la mémorisation.",
  },
];

// Grouper les étapes par période
const PERIODS_ORDER = ["matin", "midi", "soir", "nuit_debut", "nuit"];

function getPeriodMeta(period) {
  const map = {
    matin: { label: "☀️ Matin", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
    midi: { label: "⚡ Pauses journée", color: "#4D6BFE", bg: "rgba(77,107,254,0.08)" },
    soir: { label: "🌆 Soir — 18h (Anglais)", color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
    nuit_debut: { label: "📚 Fiches des cours du jour", color: "#0891B2", bg: "rgba(8,145,178,0.08)" },
    nuit: { label: "🌙 Nuit — Avant de dormir", color: "#6D28D9", bg: "rgba(109,40,217,0.08)" },
  };
  return map[period] || { label: period, color: "#888", bg: "rgba(0,0,0,0.05)" };
}

// ─── Storage key ─────────────────────────────────────────────────────────────
const STORAGE_KEY = "memomaitre_daily_routine_v2";

function loadRoutineState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveRoutineState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// todayStr is imported from dateUtils

// ─── Composant principal ──────────────────────────────────────────────────────
export default function DailyRoutineTracker({ theme, isDarkMode, onAction }) {
  const [checked, setChecked] = useState({});
  const [collapsed, setCollapsed] = useState(false);
  const [expandedPeriod, setExpandedPeriod] = useState(null);

  // Charger depuis localStorage
  useEffect(() => {
    const saved = loadRoutineState();
    const today = todayStr();
    if (saved && saved.date === today) {
      setChecked(saved.checked || {});
    } else {
      // Nouveau jour → reset
      setChecked({});
      saveRoutineState({ date: today, checked: {} });
    }
  }, []);

  const toggleStep = useCallback((id) => {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveRoutineState({ date: todayStr(), checked: next });
      return next;
    });
  }, []);

  const doneCount = ROUTINE_STEPS.filter(s => checked[s.id]).length;
  const totalCount = ROUTINE_STEPS.length;
  const pct = Math.round((doneCount / totalCount) * 100);

  const totalMinutes = ROUTINE_STEPS.reduce((sum, s) => sum + s.duration, 0);
  const doneMinutes = ROUTINE_STEPS.filter(s => checked[s.id]).reduce((sum, s) => sum + s.duration, 0);

  // Trouver l'étape courante (première non cochée)
  const currentStep = ROUTINE_STEPS.find(s => !checked[s.id]);

  // Grouper par période
  const grouped = PERIODS_ORDER.map(period => ({
    period,
    meta: getPeriodMeta(period),
    steps: ROUTINE_STEPS.filter(s => s.period === period),
    donePeriod: ROUTINE_STEPS.filter(s => s.period === period).every(s => checked[s.id]),
  }));

  const isComplete = doneCount === totalCount;

  return (
    <div style={{
      background: isDarkMode
        ? "linear-gradient(160deg, #0B1121 0%, #171E32 100%)"
        : "linear-gradient(160deg, #FFFFFF 0%, #F8FAFC 100%)",
      borderRadius: 32,
      border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(77,107,254,0.15)"}`,
      overflow: "hidden",
      boxShadow: isDarkMode 
        ? "0 32px 64px -12px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.05)"
        : "0 32px 64px -12px rgba(77,107,254,0.12), inset 0 1px 1px rgba(255,255,255,1)",
      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      position: "relative",
    }}>
      {/* ── Premium Top Glow ── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 6,
        background: isComplete
          ? "linear-gradient(90deg, #10B981, #34D399, #10B981)"
          : `linear-gradient(90deg, #4D6BFE, #7C3AED, #F43F5E, #4D6BFE)`,
        backgroundSize: "300% 100%",
        animation: isComplete ? "none" : "gradientPulseFlow 4s linear infinite",
        boxShadow: isComplete ? "0 0 12px rgba(16,185,129,0.6)" : "0 0 16px rgba(124,58,237,0.5)",
      }} />

      {/* ── Header ── */}
      <div style={{ padding: "32px 28px 20px", cursor: "pointer", userSelect: "none" }} onClick={() => setCollapsed(c => !c)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 54, height: 54, borderRadius: 18,
              background: isComplete ? "linear-gradient(135deg, #10B981, #059669)" : "linear-gradient(135deg, #4D6BFE, #7C3AED)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, flexShrink: 0,
              boxShadow: isComplete ? "0 12px 24px rgba(16,185,129,0.3)" : "0 12px 24px rgba(77,107,254,0.3)",
              color: "white"
            }}>
              {isComplete ? "🎉" : "🗓️"}
            </div>
            <div>
              <h3 style={{ margin: 0, fontWeight: 900, color: theme.text, fontSize: 20, letterSpacing: -0.5 }}>
                Ma Routine
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>
                {isComplete
                  ? "Journée terminée en beauté !"
                  : currentStep
                    ? <span style={{color: isDarkMode ? "#E2E8F0" : "#475569"}}>Prochaine : <strong style={{color: theme.highlight}}>{currentStep.label}</strong></span>
                    : "Planificateur quotidien"}
              </p>
            </div>
          </div>
          
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 32, fontWeight: 900,
              background: isComplete ? "linear-gradient(135deg, #10B981, #059669)" : "linear-gradient(135deg, #4D6BFE, #7C3AED)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              lineHeight: 1, letterSpacing: -1
            }}>{pct}%</div>
            <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 800, marginTop: 4, opacity: 0.6 }}>
              {doneCount} SUR {totalCount}
            </div>
          </div>
        </div>

        {/* Premium Progress Bar */}
        <div style={{
          marginTop: 24, height: 10,
          background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(77,107,254,0.06)",
          borderRadius: 12, overflow: "hidden", position: "relative"
        }}>
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
            background: isComplete
              ? "linear-gradient(90deg, #10B981, #34D399)"
              : "linear-gradient(90deg, #4D6BFE, #7C3AED)",
            borderRadius: 12,
            transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
            boxShadow: "0 0 10px rgba(124,58,237,0.5)"
          }} />
        </div>

        {/* Stats résumé */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, padding: "0 4px" }}>
          <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>
            ⏱ <span style={{color: theme.text, fontWeight: 800}}>{doneMinutes}</span> / {totalMinutes} min
          </span>
          <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700, opacity: doneCount > 0 ? 1 : 0.5 }}>
            ✓ {doneCount} fait{doneCount > 1 ? "s" : ""}
          </span>
          <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>
            🔥 {totalCount - doneCount} restant{totalCount - doneCount > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Corps (pliable) ── */}
      <div style={{ 
        maxHeight: collapsed ? 0 : 3000, 
        opacity: collapsed ? 0 : 1, 
        transition: "max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease",
        overflow: "hidden" 
      }}>
        <div style={{ padding: "0 20px 24px" }}>
          {grouped.map(({ period, meta, steps, donePeriod }) => {
            const isExpanded = expandedPeriod === null || expandedPeriod === period;
            const periodDone = steps.filter(s => checked[s.id]).length;

            return (
              <div key={period} style={{ marginBottom: 16 }}>
                {/* En-tête de période */}
                <div
                  onClick={() => setExpandedPeriod(prev => prev === period ? null : period)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", cursor: "pointer",
                    borderRadius: 16,
                    background: isExpanded 
                      ? (isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)") 
                      : "transparent",
                    transition: "all 0.3s",
                  }}
                >
                  <div style={{
                    padding: "4px 12px", borderRadius: 20,
                    background: donePeriod ? "rgba(16,185,129,0.15)" : meta.bg,
                    color: donePeriod ? "#10B981" : meta.color,
                    fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1,
                    display: "flex", alignItems: "center", gap: 8
                  }}>
                    <span style={{ fontSize: 14 }}>{meta.label.split(" ")[0]}</span>
                    {meta.label.split(" ").slice(1).join(" ")}
                  </div>
                  <div style={{ flex: 1, height: 1, background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }} />
                  <span style={{
                    fontSize: 12, fontWeight: 800,
                    color: donePeriod ? "#10B981" : theme.textMuted,
                  }}>
                    {periodDone}/{steps.length}
                  </span>
                  <span style={{
                    fontSize: 10, color: theme.textMuted,
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.3s",
                  }}>▼</span>
                </div>

                {/* Étapes de la période */}
                <div style={{ 
                  maxHeight: isExpanded ? 2000 : 0, 
                  opacity: isExpanded ? 1 : 0, 
                  overflow: "hidden", 
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  paddingLeft: 4, paddingRight: 4,
                }}>
                  <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                    {steps.map((step, idx) => {
                      const isDone = !!checked[step.id];
                      const isCurrent = currentStep?.id === step.id;

                      return (
                        <div
                          key={step.id}
                          style={{
                            display: "flex", gap: 16,
                            padding: "16px",
                            borderRadius: 20,
                            background: isDone 
                              ? (isDarkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)")
                              : (isDarkMode ? "rgba(255,255,255,0.04)" : "#FFFFFF"),
                            border: `1px solid ${isCurrent && !isDone 
                                ? meta.color 
                                : (isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)")}`,
                            boxShadow: isCurrent && !isDone 
                                ? `0 8px 24px ${meta.bg}` 
                                : (isDarkMode ? "none" : "0 4px 12px rgba(0,0,0,0.02)"),
                            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                            transform: isCurrent && !isDone ? "scale(1.01)" : "scale(1)",
                            position: "relative", overflow: "hidden"
                          }}
                        >
                          {isCurrent && !isDone && (
                            <div style={{
                               position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
                               background: meta.color,
                               boxShadow: `0 0 10px ${meta.color}`
                            }} />
                          )}

                          {/* Checkbox custom premium */}
                          <button
                            onClick={() => toggleStep(step.id)}
                            style={{
                              width: 26, height: 26,
                              minWidth: 26, minHeight: 26,
                              borderRadius: "50%",
                              border: `2px solid ${isDone ? "#10B981" : isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`,
                              background: isDone
                                ? "linear-gradient(135deg, #10B981, #059669)"
                                : "transparent",
                              cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 14, flexShrink: 0, marginTop: 4,
                              transition: "all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                              color: isDone ? "white" : "transparent",
                              boxShadow: isDone ? "0 4px 12px rgba(16,185,129,0.4)" : "none",
                              outline: "none",
                            }}
                          >
                            ✓
                          </button>

                          {/* Contenu */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                              <span style={{ fontSize: 18, filter: isDone ? "grayscale(1) opacity(0.5)" : "none" }}>{step.icon}</span>
                              <span style={{
                                fontSize: 15, fontWeight: 800,
                                color: isDone ? theme.textMuted : theme.text,
                                textDecoration: isDone ? "line-through" : "none",
                                transition: "all 0.2s",
                              }}>
                                {step.label}
                              </span>
                              <span style={{
                                fontSize: 11, fontWeight: 800,
                                color: isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
                                background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                                borderRadius: 12, padding: "2px 8px",
                              }}>
                                {step.duration} min
                              </span>
                              {isCurrent && !isDone && (
                                <span style={{
                                  fontSize: 10, fontWeight: 900, color: "white",
                                  background: meta.color,
                                  borderRadius: 12, padding: "2px 8px",
                                  boxShadow: `0 0 10px ${meta.color}80`,
                                  animation: "pulse 2s infinite",
                                  textTransform: "uppercase", letterSpacing: 0.5
                                }}>
                                  Maintenant
                                </span>
                              )}
                            </div>
                            
                            <div style={{
                              fontSize: 13, color: theme.textMuted,
                              lineHeight: 1.5, opacity: isDone ? 0.6 : 1,
                              fontWeight: 500
                            }}>
                              {step.sub}
                            </div>

                            {/* Tip et bouton action */}
                            {!isDone && isCurrent && (
                              <div style={{
                                marginTop: 12, display: "flex",
                                alignItems: "flex-start", gap: 10, flexWrap: "wrap",
                              }}>
                                {step.tip && (
                                  <div style={{
                                    fontSize: 11, color: meta.color,
                                    background: meta.bg,
                                    borderRadius: 10, padding: "8px 12px",
                                    lineHeight: 1.4, flex: 1, minWidth: 150,
                                    fontWeight: 600,
                                    border: `1px solid ${meta.color}20`,
                                  }}>
                                    💡 {step.tip}
                                  </div>
                                )}
                                {step.actionId && onAction && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAction(step.actionId, step.duration, step.label);
                                    }}
                                    className="btn-glow"
                                    style={{
                                      padding: "8px 16px",
                                      background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
                                      color: "white",
                                      border: "none",
                                      borderRadius: 10,
                                      fontSize: 12, fontWeight: 800,
                                      cursor: "pointer",
                                      boxShadow: `0 4px 12px ${meta.color}40`,
                                      transition: "all 0.2s",
                                      flexShrink: 0,
                                      display: "flex", alignItems: "center", gap: 6,
                                      marginTop: step.tip ? 0 : 4
                                    }}
                                  >
                                    Ouvrir <span style={{ fontSize: 14 }}>→</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Message de félicitation ── */}
          {isComplete && (
            <div style={{
              margin: "24px 0 8px",
              background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(52,211,153,0.05))",
              border: "1px solid rgba(16,185,129,0.4)",
              borderRadius: 24, padding: "24px",
              textAlign: "center",
              animation: "fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
              boxShadow: "0 12px 32px rgba(16,185,129,0.15)"
            }}>
              <div style={{ fontSize: 40, marginBottom: 12, filter: "drop-shadow(0 4px 12px rgba(16,185,129,0.4))" }}>🏆</div>
              <div style={{ fontWeight: 900, color: "#10B981", fontSize: 20, letterSpacing: -0.5 }}>
                Journée Parfaite !
              </div>
              <div style={{ fontSize: 14, color: "#34D399", marginTop: 6, fontWeight: 600 }}>
                Tu as complété 100% de ta routine. Exceptionnel, El Hadji Malick !
              </div>
            </div>
          )}

          {/* ── Bouton reset (nouveau jour) ── */}
          {doneCount > 0 && (
            <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
              <button
                onClick={() => {
                  if (window.confirm("Réinitialiser toutes les étapes pour recommencer ?")) {
                    setChecked({});
                    saveRoutineState({ date: todayStr(), checked: {} });
                  }
                }}
                style={{
                  background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", 
                  border: "none",
                  borderRadius: 16, padding: "8px 16px",
                  color: theme.textMuted, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", transition: "background 0.2s"
                }}
              >
                ↺ Réinitialiser la routine
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
