// src/lib/retroEngineeringRestructurer.js — Service de restructuration en Rétro-Ingénierie Sémantique pour fiches sélectionnées

import { safeParseJSON } from "./jsonRepair.js";
import { runCardMigration } from "./migrationRunner.js";

function safeJSONParse(raw) {
  if (!raw) return null;
  try { return safeParseJSON(raw); } catch { return null; }
}

// callClaude peut renvoyer une string OU un objet { text, sources } (mode grounding).
// Sans cette normalisation, String(objet) = "[object Object]" et la fiche n'était
// jamais mise à jour → le bouton "Restructurer" semblait ne rien faire.
function toText(raw) {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") return String(raw.text || raw.content || "");
  return "";
}

// Exigence pédagogique : au moins 3 exemples ou mini-dialogues immersifs
import {
  buildEnglishRestructureSystemPrompt,
  buildEnglishRestructureUserPayload,
  parseEnglishRestructureResponse,
  isEnglishCategory,
} from "./englishCardEngine.js";

/**
 * Restructure une seule fiche au format d'élite English Coach via LLM
 */
export async function upgradeCardToRetroEngineering(card, callClaude) {
  if (!card || !callClaude) return card;

  const systemPrompt = buildEnglishRestructureSystemPrompt();
  const userPayload = buildEnglishRestructureUserPayload(card);

  try {
    const raw = await callClaude(systemPrompt, userPayload, {
      task: "pedagogy",
      maxTokens: 2000,
      temperature: 0.3,
    });

    const rawText = toText(raw);
    const parsed = parseEnglishRestructureResponse(raw, card);

    if (parsed && (parsed.back !== card.back || (parsed.front && parsed.front !== card.front))) {
      return {
        ...card,
        front: parsed.front || card.front,
        back: parsed.back,
        example: parsed.example || card.example,
        _retroEngineered: true,
        _englishCoachTransformed: true,
        updatedAt: new Date().toISOString(),
      };
    }

    // Fallback: extraction markdown brute si l'IA renvoie du texte ou un objet non-standard
    let newBack = "";
    const parsedSimple = safeJSONParse(rawText);
    if (parsedSimple && parsedSimple.back) {
      newBack = String(parsedSimple.back).trim();
    } else if (rawText.trim().length > 20) {
      newBack = rawText.replace(/```markdown|```/gi, "").trim();
    }

    if (newBack && newBack !== card.back) {
      return {
        ...card,
        back: newBack,
        _retroEngineered: true,
        updatedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn(`[upgradeCardToRetroEngineering] Error upgrading card ${card?.id}:`, e);
  }
  return card;
}

// Accepte indifféremment une liste d'objets fiche OU une liste d'ids (le mode
// "God Hand" de MemoMaster stocke des ids). Sans cette résolution, on envoyait
// des strings au LLM (front/back undefined) → aucune fiche restructurée.
function resolveCards(selected, allCards) {
  const list = Array.isArray(selected) ? selected : [];
  if (!list.length) return [];
  if (typeof list[0] !== "string" && typeof list[0] !== "number") {
    return list.filter(c => c && c.id);
  }
  const byId = new Map((allCards || []).map(c => [c.id, c]));
  return list.map(id => byId.get(id)).filter(Boolean);
}

/**
 * Restructure une liste de fiches sélectionnées en masse avec parallélisation et gestion de taux
 */
export async function restructureSelectedCards({
  selectedCards = [],
  allCards = [],
  setExpressions,
  callClaude,
  onProgress,
  showToast,
  concurrency = 3,
}) {
  const cards = resolveCards(selectedCards, allCards);

  if (!cards.length) {
    showToast?.("Aucune fiche valide à restructurer.", "info");
    return 0;
  }
  if (!setExpressions || !callClaude) {
    showToast?.("Restructuration indisponible : assistant IA injoignable.", "error");
    return 0;
  }

  // Même moteur que les deux autres rénovations : réessai automatique,
  // aucune fiche perdue, aucun écrasement croisé, message clair à la fin.
  const { migrated } = await runCardMigration({
    cards,
    selectCard: () => true,
    transformCard: (c) => upgradeCardToRetroEngineering(c, callClaude),
    isMigrated: (c) => Boolean(c && c._retroEngineered),
    setExpressions,
    onProgress,
    showToast,
    concurrency,
    labels: {
      nothingToDo: "Aucune fiche valide à restructurer.",
      success: (n) => `⚡ ${n} fiche(s) restructurée(s) en Rétro-Ingénierie Sémantique !`,
      partial: (ok, ko) =>
        `⚡ ${ok} fiche(s) restructurée(s) · ⚠️ ${ko} n'ont pas pu l'être. Relance sur les fiches restantes.`,
      allFailed: (n) =>
        `❌ La restructuration a échoué pour ${n} fiche(s). Vérifie ta connexion internet puis réessaie.`,
      skippedOnly: (n) => `⚠️ ${n} fiche(s) sont vides : rien à restructurer dedans.`,
    },
  });

  return migrated;
}

/**
 * Restructure TOUTES les fiches d'anglais du deck avec parallélisation haute performance
 */
export async function restructureAllEnglishCards({
  allCards = [],
  setExpressions,
  callClaude,
  onProgress,
  showToast,
  concurrency = 4,
}) {
  const englishCards = (allCards || []).filter(c => isEnglishCategory(c?.category));
  if (!englishCards.length) {
    showToast?.("Aucune fiche d'anglais trouvée dans la collection.", "info");
    return 0;
  }

  showToast?.(`⚡ Lancement de la métamorphose de ${englishCards.length} fiches d'anglais...`, "info");

  return restructureSelectedCards({
    selectedCards: englishCards,
    allCards,
    setExpressions,
    callClaude,
    onProgress,
    showToast,
    concurrency,
  });
}
