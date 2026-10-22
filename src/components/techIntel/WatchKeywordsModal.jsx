import React, { useState, useEffect } from "react";
import { DEFAULT_WATCH_KEYWORDS } from "../../lib/mustNotMiss.js";

/**
 * WatchKeywordsModal
 * Permet de gérer la liste des mots-clés surveillés pour la section « À ne pas rater ».
 */
export default function WatchKeywordsModal({
  isOpen,
  onClose,
  keywords = [],
  onSaveKeywords,
  isDarkMode = false,
}) {
  const [list, setList] = useState(keywords);
  const [newKeyword, setNewKeyword] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (isOpen) {
      setList(keywords && keywords.length ? keywords : DEFAULT_WATCH_KEYWORDS);
      setNewKeyword("");
      setFeedback("");
    }
  }, [isOpen, keywords]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAdd = (e) => {
    e?.preventDefault?.();
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    const exists = list.some((k) => k.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setFeedback("Ce sujet est déjà dans la liste.");
      return;
    }
    const updated = [...list, trimmed];
    setList(updated);
    setNewKeyword("");
    setFeedback("");
    onSaveKeywords?.(updated);
  };

  const handleRemove = (keywordToRemove) => {
    const updated = list.filter((k) => k !== keywordToRemove);
    setList(updated);
    setFeedback("");
    onSaveKeywords?.(updated);
  };

  const handleResetDefaults = () => {
    setList(DEFAULT_WATCH_KEYWORDS);
    setFeedback("Liste réinitialisée aux sujets par défaut.");
    onSaveKeywords?.(DEFAULT_WATCH_KEYWORDS);
  };

  const bgModal = isDarkMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.98)";
  const textColor = isDarkMode ? "#F8FAFC" : "#0F172A";
  const subTextColor = isDarkMode ? "#94A3B8" : "#64748B";
  const borderColor = isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)";
  const tagBg = isDarkMode ? "rgba(245, 158, 11, 0.18)" : "rgba(245, 158, 11, 0.12)";
  const tagBorder = isDarkMode ? "rgba(245, 158, 11, 0.35)" : "rgba(245, 158, 11, 0.30)";
  const tagColor = isDarkMode ? "#FBBF24" : "#B45309";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="watch-keywords-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(8px)",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: bgModal,
          color: textColor,
          borderRadius: "18px",
          boxShadow: isDarkMode
            ? "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)"
            : "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        {/* En-tête */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 id="watch-keywords-title" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🔥</span> Sujets prioritaires à surveiller
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: subTextColor, lineHeight: 1.4 }}>
              Les actus contenant ces termes ou verbes de lancement sont épinglées dans <strong>« À ne pas rater »</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
              border: 0,
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              color: textColor,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
            }}
          >
            ×
          </button>
        </div>

        {/* Formulaire d'ajout */}
        <form onSubmit={handleAdd} style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="Ex: DeepSeek, Mistral, Grok, Apple..."
            aria-label="Nouveau sujet à surveiller"
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "10px",
              border: `1px solid ${borderColor}`,
              background: isDarkMode ? "rgba(255,255,255,0.05)" : "#F8FAFC",
              color: textColor,
              fontSize: "0.9rem",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!newKeyword.trim()}
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              border: 0,
              background: newKeyword.trim() ? "#f59e0b" : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"),
              color: newKeyword.trim() ? "#0F172A" : subTextColor,
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: newKeyword.trim() ? "pointer" : "not-allowed",
              transition: "all 0.15s ease",
            }}
          >
            Ajouter
          </button>
        </form>

        {feedback && (
          <div style={{ fontSize: "0.82rem", color: feedback.includes("réinitialisée") ? "#10B981" : "#EF4444" }}>
            {feedback}
          </div>
        )}

        {/* Liste des tags */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: subTextColor, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Sujets actifs ({list.length})
            </span>
            <button
              type="button"
              onClick={handleResetDefaults}
              style={{
                background: "none",
                border: 0,
                color: "#f59e0b",
                fontSize: "0.82rem",
                cursor: "pointer",
                padding: "2px 6px",
                textDecoration: "underline",
              }}
            >
              Rétablir la liste par défaut
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              maxHeight: "260px",
              overflowY: "auto",
              padding: "4px 2px",
            }}
          >
            {list.map((kw) => (
              <span
                key={kw}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 10px",
                  borderRadius: "8px",
                  background: tagBg,
                  border: `1px solid ${tagBorder}`,
                  color: tagColor,
                  fontSize: "0.86rem",
                  fontWeight: 500,
                }}
              >
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(kw)}
                  aria-label={`Supprimer ${kw}`}
                  style={{
                    background: "none",
                    border: 0,
                    color: "inherit",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "14px",
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                    opacity: 0.7,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Pied de modal */}
        <div style={{ display: "flex", justifyContent: "flex-end", borderTop: `1px solid ${borderColor}`, paddingTop: "14px", marginTop: "4px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 20px",
              borderRadius: "10px",
              border: 0,
              background: "#f59e0b",
              color: "#0F172A",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            Terminer
          </button>
        </div>
      </div>
    </div>
  );
}
