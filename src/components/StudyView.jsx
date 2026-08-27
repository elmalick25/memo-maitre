import React from "react";

export default function StudyView({
  studyQueue = [],
  studyIndex = 0,
  studyModule = "",
  studyLearnedIds = [],
  studyGoPrev = () => {},
  studyGoNext = () => {},
  markStudyCardLearned = () => {},
  setView = () => {},
  theme = {},
}) {
  if (studyQueue.length === 0) {
    return (
      <div style={{ textAlign: "center", color: theme?.textMuted || "#64748B", padding: 40 }}>
        <p style={{ fontSize: 20 }}>⏳</p>
        <p>Chargement des fiches...</p>
      </div>
    );
  }

  const card = studyQueue[studyIndex];
  if (!card) return null;

  const isLearned = studyLearnedIds.includes(card.id);

  return (
    <div style={{ animation: "flowCardEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={() => setView("categories")}
          style={{
            background: theme?.cardBg || "#FFFFFF",
            border: `1px solid ${theme?.border || "#E2E8F0"}`,
            borderRadius: 10,
            padding: "8px 16px",
            color: theme?.highlight || "#8B5CF6",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600
          }}
        >
          ← Quitter
        </button>
        <div style={{ fontWeight: 800, color: theme?.text || "#0F172A", fontSize: 14 }}>
          📖 Étude libre — {studyModule}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 15, color: theme?.textMuted || "#64748B" }}>
          <span style={{ color: theme?.highlight || "#8B5CF6", fontWeight: 800 }}>{studyIndex + 1}</span> / {studyQueue.length}
        </div>
      </div>

      <div style={{ height: 8, background: theme?.inputBg || "#F8FAFC", borderRadius: 4, marginBottom: 24, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            background: "linear-gradient(90deg, #8B5CF6, #A78BFA)",
            borderRadius: 4,
            transition: "width 0.4s ease",
            width: `${((studyIndex + 1) / studyQueue.length) * 100}%`
          }}
        />
      </div>

      <p style={{ textAlign: "center", color: theme?.textMuted || "#64748B", fontSize: 12, marginBottom: 16 }}>
        Pas de notation ici — lis, relis, et clique « J'ai appris » quand c'est acquis pour l'envoyer en révision.
      </p>

      <div style={{ background: theme?.cardBg || "#FFFFFF", border: `1px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 22, padding: 32, boxShadow: "0 8px 24px rgba(139,92,246,0.08)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#8B5CF6", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Recto
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: theme?.text || "#0F172A", marginBottom: 20 }}>
          {card.front}
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#8B5CF6", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Verso
        </div>
        <div style={{ fontSize: 17, color: theme?.text || "#0F172A", marginBottom: card.example ? 16 : 0 }}>
          {card.back}
        </div>
        {card.example && (
          <div style={{ fontSize: 13, color: theme?.textMuted || "#64748B", fontStyle: "italic", background: theme?.inputBg || "#F8FAFC", padding: 12, borderRadius: 10 }}>
            💬 {card.example}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={studyGoPrev}
          disabled={studyIndex === 0}
          className="hov"
          style={{
            padding: "10px 18px",
            background: "none",
            border: `1px solid ${theme?.border || "#E2E8F0"}`,
            borderRadius: 12,
            color: studyIndex === 0 ? (theme?.textMuted || "#64748B") : (theme?.text || "#0F172A"),
            fontWeight: 700,
            cursor: studyIndex === 0 ? "default" : "pointer",
            opacity: studyIndex === 0 ? 0.5 : 1
          }}
        >
          ← Précédent
        </button>
        <button
          onClick={() => markStudyCardLearned(card.id)}
          disabled={isLearned}
          className="hov btn-glow"
          style={{
            padding: "12px 24px",
            background: isLearned ? "#10B98155" : "linear-gradient(135deg, #10B981, #059669)",
            color: "white",
            border: "none",
            borderRadius: 14,
            fontWeight: 800,
            cursor: isLearned ? "default" : "pointer",
            fontSize: 14
          }}
        >
          {isLearned ? "✅ Déjà envoyée en révision" : "✅ J'ai appris → en révision"}
        </button>
        <button
          onClick={studyGoNext}
          className="hov"
          style={{
            padding: "10px 18px",
            background: "none",
            border: `1px solid ${theme?.border || "#E2E8F0"}`,
            borderRadius: 12,
            color: theme?.text || "#0F172A",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          {studyIndex === studyQueue.length - 1 ? "Terminer →" : "Suivant →"}
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: theme?.textMuted || "#64748B" }}>
        {studyLearnedIds.length} / {studyQueue.length} envoyée(s) en révision durant cette session
      </div>
    </div>
  );
}
