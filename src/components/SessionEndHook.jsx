// src/components/SessionEndHook.jsx
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 11 — La fin de session qui donne envie de « encore une ».
//
// Deux règles éthiques tenues ici :
//   1. Le near-miss affiché est TOUJOURS vrai (calculé par lib/nearMiss.js sur
//      l'état réel). Si rien n'est proche, on n'affiche rien.
//   2. Le gain du bouton « Encore N cartes » est annoncé AVANT le clic
//      (fourchette transparente). L'incertitude porte sur le coffre surprise,
//      jamais sur le prix affiché.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useMemo } from "react";
import { computeNearMiss, estimateNextCards } from "../lib/nearMiss";

export default function SessionEndHook({
  totalXP = 0,
  questState = null,
  sessionBestCombo = 0,
  bestComboEver = 0,
  badges = [],
  avgXPPerReview = 10,
  remainingCards = 0,
  onContinue,
  theme = {},
  accent = "#4D6BFE",
  extraCards = 5,
  compact = false, // CHANTIER 20 — mode mobile : CTA en zone du pouce
}) {
  const hooks = useMemo(
    () => computeNearMiss({ totalXP, questState, sessionBestCombo, bestComboEver, badges, avgXPPerReview }),
    [totalXP, questState, sessionBestCombo, bestComboEver, badges, avgXPPerReview]
  );

  const count = Math.min(extraCards, Math.max(0, remainingCards));
  const est = useMemo(() => estimateNextCards(count || extraCards, { avgXPPerReview }), [count, extraCards, avgXPPerReview]);
  const top = hooks[0];
  const rest = hooks.slice(1, 3);

  if (!top && count === 0) return null;

  return (
    <div
      style={{
        marginTop: 22,
        textAlign: "left",
        background: theme.inputBg || "rgba(148,163,184,0.08)",
        border: `1px solid ${accent}44`,
        borderRadius: 20,
        padding: compact ? 14 : 18,
        // CHANTIER 20 — sur mobile on réserve la hauteur du CTA collant afin
        // que le contenu ne soit jamais masqué par la barre système.
        paddingBottom: compact ? 92 : 18,
        position: "relative",
      }}
    >
      {top && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 26 }}>{top.icon}</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15, color: theme.text || "#0F172A" }}>{top.text}</div>
              {top.hint && (
                <div style={{ fontSize: 12, color: theme.textMuted || "#94A3B8", marginTop: 2 }}>{top.hint}</div>
              )}
            </div>
          </div>
          {rest.length > 0 && (
            <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
              {rest.map((h) => (
                <li key={h.id} style={{ fontSize: 12.5, color: theme.textMuted || "#94A3B8", padding: "3px 0" }}>
                  {h.icon} {h.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {count > 0 && (
        <div
          style={
            compact
              ? {
                  // Épinglé bas d'écran : atteignable au pouce d'une seule main,
                  // au-dessus de la barre de navigation système (safe-area).
                  position: "fixed", left: 12, right: 12,
                  bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
                  zIndex: 60,
                }
              : { marginTop: 16 }
          }
        >
          <button
            onClick={() => onContinue?.(count)}
            className="btn-glow hov"
            style={{
              width: "100%", padding: compact ? "18px 20px" : "14px 20px",
              minHeight: compact ? 58 : undefined,
              boxShadow: compact ? "0 12px 30px rgba(52,81,209,0.45)" : undefined,
              border: "none", borderRadius: 14,
              background: `linear-gradient(135deg, ${accent}, #3451D1)`, color: "white",
              fontWeight: 900, fontSize: 15, cursor: "pointer",
            }}
          >
            ▶ Encore {count} carte{count > 1 ? "s" : ""} · {est.label}
          </button>
          <div style={{ fontSize: 11, color: theme.textMuted || "#94A3B8", marginTop: 6, textAlign: "center" }}>
            Estimation honnête, calculée sur ta session : {est.low}-{est.high} XP selon tes réponses.
            {" "}Un coffre surprise peut s'ajouter — ça, c'est la part de hasard.
          </div>
        </div>
      )}
    </div>
  );
}
