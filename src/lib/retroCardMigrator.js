import { isNovaCard } from "./novaCardMigrator.js";
import { safeParseJSON } from "./jsonRepair.js";
import { runCardMigration } from "./migrationRunner.js";
import { fastModernizeEnglishCard } from "./fastCardModernizer.js";
import { isDefectiveEnglishCard } from "./englishCardEngine.js";

function toText(raw) {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") return String(raw.text || raw.content || "");
  return "";
}

function parseJSONSafely(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/```json|```/gi, "").trim();
  try { return JSON.parse(cleaned); } catch { }
  if (safeParseJSON) {
    try { return safeParseJSON(cleaned); } catch { }
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { }
  }
  return null;
}

/**
 * Détecte si une fiche d'anglais (y compris issue de Live Nova) nécessite d'être modernisée
 * vers le format d'élite English Coach.
 */
export function isUnmodernizedEnglishCard(card) {
  if (!card) return false;

  // Doit appartenir à la catégorie Anglais ou provenir d'une session Live Nova
  const cat = String(card.category || "");
  const isEnglish = cat.includes("Anglais") || cat.includes("English") || cat.includes("🇬🇧") || isNovaCard(card);
  if (!isEnglish) return false;

  // Cas 1 : Fiche comportant des incohérences ou du faux templating mécanique
  if (isDefectiveEnglishCard(card)) {
    return true;
  }

  const front = typeof card.front === "string" ? card.front : "";
  const back = typeof card.back === "string" ? card.back : "";

  // Cas 2 : Fiche avec question brute "❌ ... → comment le dire correctement ?" ou "undefined"
  if (front.includes("comment le dire correctement") || front.includes("❌") || back.includes("undefined")) {
    return true;
  }

  // Cas 3 : Fiche déjà au format moderne complet
  const isModern = (
    back.includes("Vrai sens") ||
    back.includes("Décomposition & Transition Métaphorique") ||
    back.includes("Modèle Mental")
  ) && (back.includes("Anti-Pattern") || back.includes("Attention au piège") || back.includes("Le piège"))
    && (back.includes("Exemples") || back.includes("Mini-dialogue"));

  return !isModern;
}

/**
 * Retourne la liste des anciennes fiches d'anglais à moderniser.
 * Si la liste est vide, le filtre et le bouton d'action doivent disparaître.
 */
export function getUnmodernizedEnglishCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.filter(isUnmodernizedEnglishCard);
}

import {
  buildEnglishRestructureSystemPrompt,
  buildEnglishRestructureUserPayload,
  parseEnglishRestructureResponse,
} from "./englishCardEngine.js";
import { upgradeCardToRetroEngineering } from "./retroEngineeringRestructurer.js";

/**
 * Transforme une ancienne fiche d'anglais vers le format d'élite English Coach
 * (Partage 100% du moteur d'excellence avec l'optimisation unitaire)
 */
export async function transformEnglishCardToModern(card, callClaude) {
  return upgradeCardToRetroEngineering(card, callClaude);
}

/**
 * Migre une sélection d'anciennes fiches par lot.
 * Par défaut (instant = true), applique la restructuration sémantique instantanée
 * (< 30ms pour 1000 fiches) en mémoire avec mise à jour immédiate de l'interface.
 */
export async function migrateEnglishCardsBatch({
  cards = [],
  setExpressions,
  callClaude,
  onProgress,
  showToast,
  concurrency = 3,
  instant = false,
}) {
  const source = Array.isArray(cards) ? cards : [];
  const targets = source.filter(isUnmodernizedEnglishCard);

  if (!targets.length) {
    showToast?.("Toutes les fiches d'anglais sont déjà au format moderne !", "info");
    return 0;
  }

  // Mode instantané haute performance (zéro latence réseau)
  if (instant || !callClaude) {
    onProgress?.(0, targets.length);

    const upgradedMap = new Map();
    for (const card of targets) {
      if (card && card.id) {
        upgradedMap.set(card.id, fastModernizeEnglishCard(card));
      }
    }

    if (setExpressions) {
      setExpressions((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((c) => (c && upgradedMap.has(c.id) ? upgradedMap.get(c.id) : c));
      });
    }

    onProgress?.(targets.length, targets.length);
    showToast?.(`⚡ ${targets.length} ancienne(s) fiche(s) modernisée(s) instantanément !`, "success");
    return targets.length;
  }

  // Fallback classique si instant=false explicitement demandé
  const { migrated } = await runCardMigration({
    cards,
    selectCard: isUnmodernizedEnglishCard,
    transformCard: (c) => transformEnglishCardToModern(c, callClaude),
    isMigrated: (c) => !isUnmodernizedEnglishCard(c),
    setExpressions,
    onProgress,
    showToast,
    concurrency,
    labels: {
      nothingToDo: "Toutes les fiches d'anglais sont déjà au format moderne !",
      success: (n) => `⚡ ${n} ancienne(s) fiche(s) modernisée(s) avec succès !`,
      partial: (ok, ko) =>
        `⚡ ${ok} ancienne(s) fiche(s) modernisée(s) · ⚠️ ${ko} ont échoué. Relance la rénovation pour les fiches restantes.`,
      allFailed: (n) =>
        `❌ La modernisation des ${n} ancienne(s) fiche(s) a échoué. Vérifie ta connexion internet puis réessaie.`,
      skippedOnly: (n) => `⚠️ ${n} ancienne(s) fiche(s) sont vides : rien à moderniser.`,
    },
  });

  return migrated;
}

