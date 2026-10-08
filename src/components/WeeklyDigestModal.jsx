// src/components/WeeklyDigestModal.jsx
// ═══════════════════════════════════════════════════════════════════════════
// BULLETIN COGNITIF HEBDOMADAIRE — MODAL D'ANALYSE & DE CÉLÉBRATION
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect } from "react";

export default function WeeklyDigestModal({
  isOpen,
  onClose,
  onOpenStats,
  digestData,
  isDarkMode = true,
  theme = {},
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !digestData) return null;

  const surface = isDarkMode ? "#0F1629" : "#FFFFFF";
  const surfaceCard = isDarkMode ? "rgba(255, 255, 255, 0.045)" : "rgba(15, 23, 42, 0.035)";
  const border = theme.border || (isDarkMode ? "rgba(148, 163, 184, 0.18)" : "rgba(15, 23, 42, 0.1)");
  const fg = theme.text || (isDarkMode ? "#EAF2FF" : "#0F172A");
  const muted = theme.textMuted || (isDarkMode ? "#94A3B8" : "#64748B");
  const accent = "var(--mm-primary, #6366F1)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Synthèse Hebdomadaire d'Analyse"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: isDarkMode ? "rgba(2, 6, 23, 0.78)" : "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(10px)",
        animation: "mmFadeIn 0.22s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: surface,
          borderRadius: "24px",
          border: `1px solid ${border}`,
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          animation: "mmScaleUp 0.24s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* En-tête */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: `1px solid ${border}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            background: isDarkMode
              ? "linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%)"
              : "linear-gradient(180deg, rgba(99, 102, 241, 0.05) 0%, transparent 100%)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: "rgba(99, 102, 241, 0.16)",
                  color: accent,
                }}
              >
                📋 Bilan Hebdomadaire
              </span>
              <span style={{ fontSize: "12px", color: muted, fontWeight: 600 }}>
                {digestData.weekRange}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: fg }}>
              Synthèse d'Analyse Cognitive
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: surfaceCard,
              border: `1px solid ${border}`,
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: muted,
              cursor: "pointer",
              fontSize: "14px",
              transition: "color .15s, background .15s",
            }}
          >
            ✕
          </button>
        </div>

        {/* Corps défilable */}
        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Trio de Métriques */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            <div
              style={{
                background: surfaceCard,
                borderRadius: "16px",
                padding: "14px 12px",
                textAlign: "center",
                border: `1px solid ${border}`,
              }}
            >
              <div style={{ fontSize: "11px", color: muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Rétention
              </div>
              <div style={{ fontSize: "24px", fontWeight: 900, color: digestData.retentionRate >= 80 ? "#10B981" : "#F59E0B", marginTop: "4px" }}>
                {digestData.retentionRate}%
              </div>
              <div style={{ fontSize: "10px", color: muted, marginTop: "2px" }}>
                {digestData.retentionRate >= 80 ? "Excellente" : "En progrès"}
              </div>
            </div>

            <div
              style={{
                background: surfaceCard,
                borderRadius: "16px",
                padding: "14px 12px",
                textAlign: "center",
                border: `1px solid ${border}`,
              }}
            >
              <div style={{ fontSize: "11px", color: muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Révisions
              </div>
              <div style={{ fontSize: "24px", fontWeight: 900, color: fg, marginTop: "4px" }}>
                {digestData.totalReviews}
              </div>
              <div style={{ fontSize: "10px", color: muted, marginTop: "2px" }}>
                {digestData.activeDays}j / 7 actifs
              </div>
            </div>

            <div
              style={{
                background: surfaceCard,
                borderRadius: "16px",
                padding: "14px 12px",
                textAlign: "center",
                border: `1px solid ${border}`,
              }}
            >
              <div style={{ fontSize: "11px", color: muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Consolidées
              </div>
              <div style={{ fontSize: "24px", fontWeight: 900, color: accent, marginTop: "4px" }}>
                {digestData.stabilizedCount}
              </div>
              <div style={{ fontSize: "10px", color: muted, marginTop: "2px" }}>
                Cartes au palier supérieur
              </div>
            </div>
          </div>

          {/* Module Star & Victoires */}
          <div
            style={{
              background: surfaceCard,
              borderRadius: "16px",
              padding: "14px 16px",
              border: `1px solid ${border}`,
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>⭐</span>
                <span style={{ fontSize: "13px", fontWeight: 800, color: fg }}>Module Star de la semaine</span>
              </div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: accent,
                  background: "rgba(99, 102, 241, 0.12)",
                  padding: "3px 10px",
                  borderRadius: "999px",
                }}
              >
                {digestData.starCategory} ({digestData.starCategoryCount} fiches)
              </span>
            </div>

            {digestData.conqueredLeechesCount > 0 && (
              <div style={{ fontSize: "12px", color: "#10B981", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                <span>🎯</span>
                <span>
                  <strong>{digestData.conqueredLeechesCount} carte{digestData.conqueredLeechesCount > 1 ? "s" : ""} bloquante{digestData.conqueredLeechesCount > 1 ? "s" : ""}</strong> domptée{digestData.conqueredLeechesCount > 1 ? "s" : ""} avec succès cette semaine !
                </span>
              </div>
            )}

            {digestData.incubatingCount > 0 && (
              <div style={{ fontSize: "12px", color: muted, display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🇬🇧</span>
                <span>
                  <strong>{digestData.incubatingCount} expression{digestData.incubatingCount > 1 ? "s" : ""} anglaise{digestData.incubatingCount > 1 ? "s" : ""}</strong> en contact régulier d'incubation.
                </span>
              </div>
            )}
          </div>

          {/* Recommandation Métacognitive */}
          <div
            style={{
              background: isDarkMode ? "rgba(99, 102, 241, 0.08)" : "rgba(99, 102, 241, 0.04)",
              borderRadius: "16px",
              padding: "14px 16px",
              border: "1px solid rgba(99, 102, 241, 0.2)",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.6px", color: accent, marginBottom: "4px" }}>
              💡 Cap stratégique pour la semaine à venir
            </div>
            <div style={{ fontSize: "13px", color: fg, lineHeight: "1.5", fontWeight: 500 }}>
              {digestData.focusRecommendation}
            </div>
          </div>
        </div>

        {/* Pied de page / Actions */}
        <div
          style={{
            padding: "14px 24px 18px",
            borderTop: `1px solid ${border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "10px",
            background: surface,
          }}
        >
          {onOpenStats && (
            <button
              type="button"
              onClick={() => {
                onClose?.();
                onOpenStats();
              }}
              style={{
                padding: "9px 16px",
                borderRadius: "12px",
                border: `1px solid ${border}`,
                background: "transparent",
                color: fg,
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "background .15s",
              }}
            >
              Examiner les stats
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 20px",
              borderRadius: "12px",
              border: "none",
              background: accent,
              color: "#FFFFFF",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.35)",
              transition: "transform .15s, box-shadow .15s",
            }}
          >
            Cap sur la semaine ✨
          </button>
        </div>
      </div>

      <style>{`
        @keyframes mmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes mmScaleUp {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
