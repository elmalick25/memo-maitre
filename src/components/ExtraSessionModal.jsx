import React, { useState, useEffect, useMemo } from "react";
import { pickExtraSessionCards, getAvailableCardsByModule } from "../lib/extraSessionEngine.js";
import { haptic } from "../lib/haptics.js";

/**
 * ExtraSessionModal
 * Modale universelle & responsive (Mobile Sheet / Web Centered)
 * Permet de lancer une session de révision extra ou de reprise ciblée.
 */
export default function ExtraSessionModal({
  isOpen,
  onClose,
  expressions = [],
  categories = [],
  dailySessionPreview = [],
  isDarkMode = false,
  onStartExtraSession,
}) {
  const [selectedModule, setSelectedModule] = useState("all");
  const [selectedCount, setSelectedCount] = useState(10);
  const [sessionMode, setSessionMode] = useState("standard"); // "standard" (FSRS) | "free" (Libre)

  // Fermeture par touche Échap
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Décompte des cartes par module
  const moduleCounts = useMemo(() => {
    return getAvailableCardsByModule(expressions);
  }, [expressions]);

  // Liste ordonnée des modules disponibles
  const availableModules = useMemo(() => {
    const fromCategories = (categories || []).map((c) => c?.name || c).filter(Boolean);
    const fromCards = Object.keys(moduleCounts);
    const set = new Set([...fromCategories, ...fromCards]);
    return Array.from(set).sort();
  }, [categories, moduleCounts]);

  // Total de cartes disponibles pour la sélection en cours
  const availableCountForSelection = useMemo(() => {
    if (selectedModule === "all") {
      return Object.values(moduleCounts).reduce((acc, v) => acc + v, 0);
    }
    return moduleCounts[selectedModule] || 0;
  }, [selectedModule, moduleCounts]);

  // Préparation du lot de cartes
  const previewCards = useMemo(() => {
    if (!isOpen) return [];
    return pickExtraSessionCards({
      expressions,
      dailySessionPreview,
      selectedModule,
      count: selectedCount,
    });
  }, [isOpen, expressions, dailySessionPreview, selectedModule, selectedCount]);

  if (!isOpen) return null;

  const handleLaunch = () => {
    if (previewCards.length === 0) return;
    try { haptic("pop"); } catch {}
    onStartExtraSession?.({
      pickedCards: previewCards,
      mode: sessionMode,
      moduleName: selectedModule === "all" ? null : selectedModule,
      count: previewCards.length,
    });
    onClose?.();
  };

  const bgModal = isDarkMode
    ? "color-mix(in srgb, var(--mm-bg-card, #111827) 96%, transparent)"
    : "#ffffff";
  const fgTitle = isDarkMode ? "var(--mm-fg, #f8fafc)" : "#0f172a";
  const fgMuted = isDarkMode ? "#94a3b8" : "#64748b";
  const borderColor = isDarkMode
    ? "color-mix(in srgb, var(--mm-primary) 32%, transparent)"
    : "color-mix(in srgb, var(--mm-primary) 20%, transparent)";
  const sectionBg = isDarkMode
    ? "rgba(255, 255, 255, 0.03)"
    : "rgba(15, 23, 42, 0.025)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extra-session-modal-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: isDarkMode ? "rgba(0, 0, 0, 0.76)" : "rgba(15, 23, 42, 0.52)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        animation: "extraFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "min(490px, 95vw)",
          background: bgModal,
          color: fgTitle,
          borderRadius: 24,
          border: `1.5px solid ${borderColor}`,
          boxShadow: isDarkMode
            ? "0 24px 60px rgba(0, 0, 0, 0.75), 0 0 1px rgba(255, 255, 255, 0.15)"
            : "0 20px 48px color-mix(in srgb, var(--mm-primary) 14%, transparent), 0 4px 16px rgba(0,0,0,0.06)",
          padding: "24px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Poignée mobile */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: -8,
            marginBottom: 2,
          }}
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.15)",
            }}
          />
        </div>

        {/* Entête */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: isDarkMode
                  ? "color-mix(in srgb, var(--mm-primary) 22%, transparent)"
                  : "color-mix(in srgb, var(--mm-primary) 12%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                border: `1.5px solid color-mix(in srgb, var(--mm-primary) 32%, transparent)`,
                boxShadow: "0 2px 10px color-mix(in srgb, var(--mm-primary) 20%, transparent)",
              }}
            >
              ⚡
            </div>
            <div>
              <h2
                id="extra-session-modal-title"
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: "-0.01em",
                }}
              >
                Session Extra
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: fgMuted, fontWeight: 500 }}>
                {availableCountForSelection} fiche{availableCountForSelection > 1 ? "s" : ""} disponible{availableCountForSelection > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "none",
              background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
              color: fgTitle,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              transition: "transform 0.15s ease",
            }}
          >
            ✕
          </button>
        </div>

        {/* Section 1 : Choix du module */}
        <div
          style={{
            background: sectionBg,
            borderRadius: 16,
            padding: "14px 16px",
            border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.06)"}`,
          }}
        >
          <label
            htmlFor="extra-module-select"
            style={{
              display: "block",
              fontSize: 11.5,
              fontWeight: 800,
              color: fgMuted,
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Périmètre de révision
          </label>
          <select
            id="extra-module-select"
            value={selectedModule}
            onChange={(e) => {
              setSelectedModule(e.target.value);
              try { haptic("tap"); } catch {}
            }}
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: 12,
              border: `1.5px solid ${isDarkMode ? "rgba(255, 255, 255, 0.15)" : "color-mix(in srgb, var(--mm-primary) 22%, transparent)"}`,
              background: isDarkMode ? "#1e293b" : "#f8fafc",
              color: fgTitle,
              fontSize: 14,
              fontWeight: 600,
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="all">
              🌟 Tous les modules ({Object.values(moduleCounts).reduce((a, b) => a + b, 0)} fiches)
            </option>
            {availableModules.map((modName) => {
              const count = moduleCounts[modName] || 0;
              return (
                <option key={modName} value={modName}>
                  📂 {modName} ({count} fiche{count > 1 ? "s" : ""})
                </option>
              );
            })}
          </select>
        </div>

        {/* Section 2 : Nombre de fiches */}
        <div
          style={{
            background: sectionBg,
            borderRadius: 16,
            padding: "14px 16px",
            border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.06)"}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                color: fgMuted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Volume de fiches
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: "var(--mm-primary)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {Math.min(selectedCount, availableCountForSelection)} prête{Math.min(selectedCount, availableCountForSelection) > 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {[5, 10, 15, 20, 25].map((cnt) => {
              const isSelected = selectedCount === cnt;
              return (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    setSelectedCount(cnt);
                    try { haptic("tap"); } catch {}
                  }}
                  style={{
                    padding: "10px 4px",
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
                    color: isSelected ? "var(--mm-primary)" : fgTitle,
                    transform: isSelected ? "scale(1.03)" : "none",
                  }}
                >
                  {cnt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3 : Mode de révision */}
        <div
          style={{
            background: sectionBg,
            borderRadius: 16,
            padding: "12px 14px",
            border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.06)"}`,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setSessionMode("standard");
              try { haptic("tap"); } catch {}
            }}
            style={{
              padding: "10px 8px",
              borderRadius: 12,
              border: sessionMode === "standard"
                ? "1.5px solid var(--mm-primary)"
                : `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)"}`,
              background: sessionMode === "standard"
                ? (isDarkMode ? "color-mix(in srgb, var(--mm-primary) 22%, transparent)" : "color-mix(in srgb, var(--mm-primary) 10%, transparent)")
                : "transparent",
              color: sessionMode === "standard" ? "var(--mm-primary)" : fgMuted,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 800,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span>🎯 Mode FSRS</span>
            <span style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.85 }}>Met à jour la mémoire</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSessionMode("free");
              try { haptic("tap"); } catch {}
            }}
            style={{
              padding: "10px 8px",
              borderRadius: 12,
              border: sessionMode === "free"
                ? "1.5px solid #10b981"
                : `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)"}`,
              background: sessionMode === "free"
                ? (isDarkMode ? "rgba(16, 185, 129, 0.18)" : "rgba(16, 185, 129, 0.1)")
                : "transparent",
              color: sessionMode === "free" ? "#10b981" : fgMuted,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 800,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span>🎮 Entraînement libre</span>
            <span style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.85 }}>Sans impact FSRS</span>
          </button>
        </div>

        {/* Bouton d'action principal */}
        <button
          type="button"
          disabled={previewCards.length === 0}
          onClick={handleLaunch}
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: 16,
            border: "none",
            background: previewCards.length > 0
              ? (sessionMode === "free"
                  ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                  : "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary-deep, var(--mm-primary)) 100%)")
              : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.1)"),
            color: previewCards.length > 0 ? "#ffffff" : fgMuted,
            fontSize: 15,
            fontWeight: 800,
            cursor: previewCards.length > 0 ? "pointer" : "not-allowed",
            boxShadow: previewCards.length > 0
              ? (sessionMode === "free"
                  ? "0 8px 24px rgba(16, 185, 129, 0.3)"
                  : "0 8px 24px color-mix(in srgb, var(--mm-primary) 32%, transparent)")
              : "none",
            transition: "all 0.18s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <span>🚀</span>
          <span>Lancer la session ({previewCards.length} fiche{previewCards.length > 1 ? "s" : ""})</span>
        </button>
      </div>
    </div>
  );
}
