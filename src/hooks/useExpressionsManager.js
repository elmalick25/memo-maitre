import { useState, useCallback } from "react";
import { today } from "../utils/dateUtils";
import { safeParseJSON } from "../lib/jsonRepair";
import { findSimilarCards } from "../lib/textUtils";

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

  // ── Ajout de fiches depuis le Lab / OCR / Documents (Hermétique Anti-Doublons) ──
  const addCardsFromLab = useCallback((cards) => {
    if (!cards || !cards.length) return { added: 0, skipped: 0 };
    const now = new Date().toISOString();

    const norm = (s) =>
      (s || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .trim();

    const existingFronts = new Set(expressions.map((e) => norm(e?.front)).filter(Boolean));

    const newUnique = [];
    let skipped = 0;

    for (const c of cards) {
      const target = norm(c.front || c.question);
      if (!target) continue;

      // Détection double : exacte ou sémantique (> 78% similarité)
      if (existingFronts.has(target) || findSimilarCards(target, expressions, 0.78).length > 0) {
        skipped++;
        continue;
      }

      existingFronts.add(target);
      newUnique.push({
        id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 7),
        front: (c.front || c.question || "").trim(),
        back: (c.back || c.answer || "").trim(),
        example: (c.example || "").trim(),
        category: c.category || "Général",
        type: c.type || "qa",
        bloomLevel: c.bloomLevel || "Understand",
        keyword: (c.keyword || "").trim(),
        level: 0,
        nextReview: today(),
        createdAt: now,
        updatedAt: now,
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0,
        reviewHistory: [],
      });
    }

    if (newUnique.length > 0) {
      setExpressions((prev) => [...newUnique, ...prev]);
    }

    if (skipped > 0) {
      showToast(`✨ ${newUnique.length} fiche(s) ajoutée(s) (${skipped} doublon(s) déjà présent(s) ignoré(s))`, "success");
    } else if (newUnique.length > 0) {
      showToast(`✨ ${newUnique.length} fiche(s) ajoutée(s) depuis le Lab !`, "success");
    } else {
      showToast(`ℹ️ Toutes les fiches sélectionnées (${skipped}) existent déjà dans ton deck.`, "info");
    }

    return { added: newUnique.length, skipped };
  }, [expressions, setExpressions, showToast]);

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
