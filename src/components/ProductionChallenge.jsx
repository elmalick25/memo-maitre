// src/components/ProductionChallenge.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — Mini-défi de production active en fin de session.
// Cible : fiches au stage "recalled" jamais réellement produites en contexte
// (issues de getExpressionsNeedingProduction, Phase 2).
//
// Non bloquant (bouton "Passer"), mais visible par défaut à la fin d'une
// session de conversation ou d'une lecture EnglishInTheWild.
//
// Un succès enregistre un usage productif "writing" (guidé) via le validator
// LLM fourni par le parent. Pas de "mastered" avec un seul défi — la règle
// des 2 contextes distincts espacés d'au moins 48h vit dans masteryStages.js.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";

export default function ProductionChallenge({
  items,
  topic,
  onValidate,         // async ({ expression, sentence }) => { correct, feedback }
  onClose,
  isDarkMode = false,
  theme = {},
}) {
  const [idx, setIdx] = useState(0);
  const [sentence, setSentence] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (!items || !items.length) return null;
  const current = items[idx];
  const isLast = idx >= items.length - 1;

  const submit = async () => {
    if (!sentence.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const r = await onValidate({ expression: current, sentence: sentence.trim() });
      setFeedback(r || { correct: false, feedback: "Analyse indisponible" });
    } catch (e) {
      setFeedback({ correct: false, feedback: "Erreur d'analyse. Réessaie." });
    } finally {
      setLoading(false);
    }
  };

  const next = () => {
    setSentence("");
    setFeedback(null);
    if (isLast) onClose?.();
    else setIdx(i => i + 1);
  };

  const bg = isDarkMode ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.98)";
  const fg = theme?.text || (isDarkMode ? "#F1F5F9" : "#0F172A");
  const muted = theme?.textMuted || (isDarkMode ? "#94A3B8" : "#64748B");
  const border = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100000,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        maxWidth: 520, width: "100%", background: bg, color: fg,
        borderRadius: 24, border: `1px solid ${border}`,
        padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: "#10B981", textTransform: "uppercase" }}>
            🎯 Défi de production · {idx + 1}/{items.length}
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", color: muted, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
            Passer
          </button>
        </div>

        <h3 style={{ margin: "6px 0 4px", fontSize: 20, fontWeight: 900, lineHeight: 1.25 }}>
          Utilise <span style={{ color: "#10B981" }}>« {current.front} »</span> dans une phrase
        </h3>
        <div style={{ color: muted, fontSize: 13, marginBottom: 16 }}>
          Sujet : <em>{topic}</em> · Sens : {current.back}
        </div>

        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          disabled={loading || (feedback && feedback.correct)}
          rows={3}
          placeholder="Écris ta phrase ici…"
          style={{
            width: "100%", padding: 12, borderRadius: 12,
            border: `1px solid ${border}`,
            background: isDarkMode ? "rgba(30,41,59,0.6)" : "#F8FAFC",
            color: fg, fontSize: 15, resize: "vertical", outline: "none",
          }}
        />

        {feedback && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 12,
            background: feedback.correct ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
            borderLeft: `4px solid ${feedback.correct ? "#10B981" : "#F59E0B"}`,
            fontSize: 14,
          }}>
            <strong>{feedback.correct ? "✅ Bien joué !" : "💡 À retravailler"}</strong>
            <div style={{ marginTop: 4, opacity: 0.9 }}>{feedback.feedback}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          {(!feedback || !feedback.correct) && (
            <button onClick={submit} disabled={loading || !sentence.trim()}
              style={{
                padding: "10px 20px", borderRadius: 12, border: "none", cursor: loading ? "wait" : "pointer",
                background: "#10B981", color: "white", fontWeight: 800, fontSize: 14, opacity: loading ? 0.6 : 1,
              }}>
              {loading ? "Analyse…" : "Valider"}
            </button>
          )}
          {feedback && (
            <button onClick={next}
              style={{
                padding: "10px 20px", borderRadius: 12, border: `1px solid ${border}`, cursor: "pointer",
                background: "transparent", color: fg, fontWeight: 700, fontSize: 14,
              }}>
              {isLast ? "Terminer" : "Suivant"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
