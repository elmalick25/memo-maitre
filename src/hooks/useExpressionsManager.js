import { useState, useCallback } from "react";
import { today } from "../utils/dateUtils";
import { safeParseJSON } from "../lib/jsonRepair";

export const ATOMIC_CARD_RULES = `Règles d'atomicité FSRS :
1. Une seule idée, question ou concept par fiche.
2. Recto court et direct (max 15 mots).
3. Verso précis et concis (max 30 mots).
4. Exemple contextuel clair si pertinent.`;

export default function useExpressionsManager({
  expressions = [],
  setExpressions = () => {},
  addForm = {},
  setAddForm = () => {},
  editingId = null,
  setEditingId = () => {},
  setAddAudioUrl = () => {},
  setAddReformulations = () => {},
  setAddMetaphoreText = () => {},
  setAddDoublonCheck = () => {},
  editReturnTo = null,
  setEditReturnTo = () => {},
  setView = () => {},
  showToast = () => {},
  callClaude = () => {},
  playSound = () => {},
  storage = null,
}) {
  const [versionHistory, setVersionHistory] = useState({});

  // ── Sauvegarde d'une version avant modification ──
  const saveVersion = useCallback((cardId) => {
    const card = expressions.find((e) => e.id === cardId);
    if (!card) return;
    const versionEntry = {
      timestamp: new Date().toISOString(),
      front: card.front,
      back: card.back,
      example: card.example || "",
      category: card.category,
      type: card.type || "qa",
    };
    setVersionHistory((prev) => ({
      ...prev,
      [cardId]: [versionEntry, ...(prev[cardId] || [])].slice(0, 10),
    }));
  }, [expressions]);

  // ── Restauration d'une version antérieure ──
  const handleRestoreVersion = useCallback((cardId, version) => {
    if (!version) return;
    saveVersion(cardId);
    setExpressions((prev) =>
      prev.map((e) =>
        e.id === cardId
          ? {
              ...e,
              front: version.front,
              back: version.back,
              example: version.example || "",
              category: version.category || e.category,
              type: version.type || e.type,
              updatedAt: new Date().toISOString(),
            }
          : e
      )
    );
    showToast("⏪ Version restaurée avec succès !", "success");
  }, [saveVersion, setExpressions, showToast]);

  // ── Édition / Annulation ──
  const startEdit = useCallback((exp) => {
    setAddForm({
      front: exp.front,
      back: exp.back,
      example: exp.example || "",
      category: exp.category,
      imageUrl: exp.imageUrl || null,
      type: exp.type || "qa",
      audioId: exp.audioId || null,
      audioUrl: exp.audioUrl || null,
    });
    setEditingId(exp.id);
    setAddAudioUrl(exp.audioUrl || null);
    setView("add");
  }, [setAddForm, setEditingId, setAddAudioUrl, setView]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setAddForm((f) => ({
      ...f,
      front: "",
      back: "",
      example: "",
      imageUrl: null,
      type: "qa",
      audioId: null,
      audioUrl: null,
    }));
    setAddReformulations({});
    setAddMetaphoreText("");
    setAddDoublonCheck(null);
    if (editReturnTo && editReturnTo.view === "review") {
      setEditReturnTo(null);
      setView("review");
    }
  }, [setEditingId, setAddForm, setAddReformulations, setAddMetaphoreText, setAddDoublonCheck, editReturnTo, setEditReturnTo, setView]);

  // ── Suppression ──
  const deleteExp = useCallback((id) => {
    setExpressions((prev) => prev.filter((e) => e.id !== id));
    showToast("Fiche supprimée.", "info");
  }, [setExpressions, showToast]);

  // ── Ajout de fiches depuis le Lab / OCR / Documents ──
  const addCardsFromLab = useCallback((cards) => {
    if (!cards || !cards.length) return;
    const now = new Date().toISOString();
    const createdCards = cards.map((c) => ({
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 7),
      front: (c.front || c.question || "").trim(),
      back: (c.back || c.answer || "").trim(),
      example: (c.example || "").trim(),
      category: c.category || "Général",
      type: c.type || "qa",
      level: 0,
      nextReview: today(),
      createdAt: now,
      updatedAt: now,
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewHistory: [],
    }));

    setExpressions((prev) => [...createdCards, ...prev]);
    showToast(`✨ ${createdCards.length} fiche(s) ajoutée(s) depuis le Lab !`, "success");
  }, [setExpressions, showToast]);

  return {
    versionHistory,
    saveVersion,
    handleRestoreVersion,
    startEdit,
    cancelEdit,
    deleteExp,
    addCardsFromLab,
  };
}
