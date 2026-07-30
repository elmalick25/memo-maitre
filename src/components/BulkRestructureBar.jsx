// src/components/BulkRestructureBar.jsx — Barre d'action de restructuration globale des fiches sélectionnées
import React, { useState } from "react";
import { Sparkles, CheckSquare, Square, RefreshCw, Layers } from "lucide-react";
import { restructureSelectedCards } from "../lib/retroEngineeringRestructurer";

export default function BulkRestructureBar({
  selectedCards = [],
  allCards = [],
  setSelectedCardIds,
  setExpressions,
  callClaude,
  showToast,
  theme,
  isDarkMode = true,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const selectedCount = selectedCards.length;
  const allCount = allCards.length;
  const isAllSelected = allCount > 0 && selectedCount === allCount;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedCardIds?.([]);
    } else {
      setSelectedCardIds?.(allCards.map(c => c.id));
    }
  };

  const handleRestructure = async () => {
    if (!selectedCards.length || isProcessing) return;
    setIsProcessing(true);
    setProgress({ current: 0, total: selectedCards.length });

    try {
      await restructureSelectedCards({
        selectedCards,
        allCards,
        setExpressions,
        callClaude,
        showToast,
        onProgress: (cur, tot) => setProgress({ current: cur, total: tot }),
      });
      setSelectedCardIds?.([]);
    } catch (e) {
      showToast?.("Erreur lors de la restructuration des fiches.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="bulk-restructure-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "14px 20px",
        borderRadius: 16,
        background: isDarkMode
          ? "linear-gradient(135deg, rgba(77,107,254,0.18) 0%, rgba(139,92,246,0.12) 100%)"
          : "linear-gradient(135deg, rgba(77,107,254,0.10) 0%, rgba(139,92,246,0.06) 100%)",
        border: `1.5px solid ${isDarkMode ? "rgba(77,107,254,0.35)" : "rgba(77,107,254,0.25)"}`,
        boxShadow: "0 6px 20px rgba(77,107,254,0.12)",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={handleToggleSelectAll}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            color: isDarkMode ? "#B9C8FF" : "#4D6BFE",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          <span>{isAllSelected ? "Tout désélectionner" : "Tout sélectionner"}</span>
        </button>

        <div style={{ fontSize: 13, fontWeight: 800, color: isDarkMode ? "#E6EDFF" : "#0F172A" }}>
          {selectedCount > 0 ? (
            <span style={{ color: "#10B981" }}>☑️ {selectedCount} / {allCount} fiche(s) sélectionnée(s)</span>
          ) : (
            <span style={{ opacity: 0.7 }}>Sélectionne des fiches à restructurer</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {isProcessing ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: "#4D6BFE" }}>
            <RefreshCw size={15} className="animate-spin" />
            <span>Restructuration Rétro-Ingénierie… ({progress.current}/{progress.total})</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleRestructure}
            disabled={!selectedCount}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 18px",
              borderRadius: 12,
              border: "none",
              background: !selectedCount
                ? (isDarkMode ? "#1F1F2E" : "#E5E7EB")
                : "linear-gradient(135deg, #4D6BFE 0%, #7B93FF 100%)",
              color: !selectedCount ? "#6B7280" : "#FFFFFF",
              fontWeight: 800,
              fontSize: 13,
              cursor: !selectedCount ? "not-allowed" : "pointer",
              boxShadow: !selectedCount ? "none" : "0 4px 14px rgba(77,107,254,0.35)",
              transition: "all 0.2s cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          >
            <Sparkles size={16} />
            <span>⚡ Régler & Restructurer les fiches ({selectedCount})</span>
          </button>
        )}
      </div>
    </div>
  );
}
