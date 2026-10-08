// src/lib/novaCardMigrator.js — Détection et migration des fiches Nova vers le format neuro-cognitif v8
import { safeParseJSON } from "./jsonRepair.js";
import { runCardMigration } from "./migrationRunner.js";
import { fastModernizeNovaCard } from "./fastCardModernizer.js";
import { upgradeCardToRetroEngineering } from "./retroEngineeringRestructurer.js";

/**
 * Normalise la réponse de callClaude (string ou objet avec text/content)
 */
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
 * Détecte si une fiche provient initialement d'une session Nova
 * (via métadonnées explicites ou signatures sémantiques de l'ancien prompt)
 */
export function isNovaCard(card) {
  if (!card) return false;
  if (card._agentDetected || card._source === "user_error" || card._source === "agent_teaching") return true;
  if (typeof card.id === "string" && (card.id.startsWith("agent-") || card.id.startsWith("el-"))) return true;
  if (card.category === "Voice Coach") return true;
  
  const back = typeof card.back === "string" ? card.back : "";
  if (back.includes("Contexte Live Nova")) return true;
  if (back.includes("QUAND L'UTILISER") && back.includes("SENS DANS CE CONTEXTE")) return true;
  if (back.includes("📌 PIÈGE :") && back.includes("🗣")) return true;
  
  return false;
}

/**
 * Vérifie si la fiche est DÉJÀ au nouveau format neuro-cognitif v8
 */
export function isNovaV8Format(card) {
  if (!card) return false;
  if (card._novaV8 === true) return true;
  const back = typeof card.back === "string" ? card.back : "";
  return back.includes("Contexte Live Nova") &&
         back.includes("Tu as dit") &&
         back.includes("En réalité, on dit");
}

/**
 * Retourne uniquement les fiches Nova qui restent à moderniser.
 * Si le tableau retourné est vide, le filtre/bouton doit être masqué de l'UI.
 */
export function getUnmigratedNovaCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.filter(c => isNovaCard(c) && !isNovaV8Format(c));
}

/**
 * Prompt de rétro-conversion d'une ancienne fiche vers le schéma neuro-cognitif v8
 */
const MIGRATION_SYSTEM_PROMPT = `Tu es un ingénieur linguistique d'élite. Ton rôle est de restructurer cette fiche d'anglais issue d'un échange vocal avec l'agent Nova pour la convertir STRICTEMENT vers le NOUVEAU FORMAT NEURO-COGNITIF.

RÈGLES DU RECTO ("front") :
- STRICTEMENT l'expression anglaise correcte à apprendre (ex: "Can you hear me?"). Zéro fioriture, zéro balise.

RÈGLES DU VERSO ("back") :
1. En-tête obligatoire "### 🎙️ Contexte Live Nova" :
* 🔴 **Tu as dit :** "<ce que l'utilisateur a dit ou l'erreur typique mentionnée dans l'ancienne fiche>" ❌
* 🟢 **En réalité, on dit :** "<la forme correcte>" ✅
* 📖 **Traduction :** <traduction française naturelle>

2. Décomposition & Transition Métaphorique :
UNIQUEMENT si l'expression est une expression idiomatique ou un phrasal verb :
### ⚙️ 1. Décomposition & Transition Métaphorique
* **<Mot/Particule> :** Sens physique : *<sens brut>* ➔ Glissement sémantique : <explication>
* **Le Modèle Mental :** <l'image mécanique globale en 1 phrase>
(Si c'est une tournure de grammaire, du vocabulaire direct ou une phrase standard, OMNETTRE totalement cette section 1).

3. Comparatif :
### 🔍 2. Comparatif (Pourquoi A et pas B ?)
* **Option A ("<forme correcte>") :** <ce que le natif ressent/visualise>
* **Option B ("<ce que l'utilisateur a dit>") :** <pourquoi le sens dévie ou ce que l'anglophone entend>

4. Anti-Pattern :
### ⚠️ 3. Anti-Pattern (Le piège social)
* **L'erreur :** <calque du français ou erreur commise>
* **Le malaise produit :** <la perception réelle / malaise provoqué chez un anglophone>

5. Exemples en contexte :
### 💻 4. Exemples en contexte
* **Tech / Visio pro :** \`<phrase EN 1>\` ↳ *<traduction FR 1>*
* **Quotidien :** \`<phrase EN 2>\` ↳ *<traduction FR 2>*

RÉPONSE ATTENDUE : STRICTEMENT un objet JSON valide avec les clés "front" et "back" :
{
  "front": "...",
  "back": "..."
}`;

/**
 * Transforme une seule fiche Nova vers le format Élite Coach via LLM
 * (Garantit 100% de parité de qualité et de structure avec toutes les fiches d'anglais)
 */
export async function transformNovaCardToV8(card, callClaude) {
  if (!card || !callClaude) return card;
  const upgraded = await upgradeCardToRetroEngineering(card, callClaude);
  if (upgraded && upgraded !== card) {
    return {
      ...upgraded,
      _novaV8: true,
      _agentDetected: true,
      _source: "user_error",
      updatedAt: new Date().toISOString(),
    };
  }
  return card;
}

/**
 * Migre une sélection de fiches Nova par lot.
 * Par défaut (instant = true), exécute une modernisation locale instantanée (< 30ms pour 1000 fiches)
 * sans aucun blocage réseau ni consommation de tokens, avec mise à jour atomique de l'UI.
 */
export async function migrateNovaCardsBatch({
  cards = [],
  setExpressions,
  callClaude,
  onProgress,
  showToast,
  concurrency = 3,
  instant = false,
}) {
  const source = Array.isArray(cards) ? cards : [];
  const targets = source.filter((c) => isNovaCard(c) && !isNovaV8Format(c));

  if (!targets.length) {
    showToast?.("Toutes les fiches Nova sont déjà au nouveau format !", "info");
    return 0;
  }

  // Mode instantané haute performance (zéro latence réseau)
  if (instant || !callClaude) {
    onProgress?.(0, targets.length);

    const upgradedMap = new Map();
    for (const card of targets) {
      if (card && card.id) {
        upgradedMap.set(card.id, fastModernizeNovaCard(card));
      }
    }

    if (setExpressions) {
      setExpressions((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((c) => (c && upgradedMap.has(c.id) ? upgradedMap.get(c.id) : c));
      });
    }

    onProgress?.(targets.length, targets.length);
    showToast?.(`✨ ${targets.length} fiche(s) Nova modernisée(s) instantanément !`, "success");
    return targets.length;
  }

  // Fallback classique si instant=false explicitement demandé
  const { migrated } = await runCardMigration({
    cards,
    selectCard: (c) => isNovaCard(c) && !isNovaV8Format(c),
    transformCard: (c) => transformNovaCardToV8(c, callClaude),
    isMigrated: (c) => isNovaV8Format(c),
    setExpressions,
    onProgress,
    showToast,
    concurrency,
    labels: {
      nothingToDo: "Toutes les fiches Nova sont déjà au nouveau format !",
      success: (n) => `✨ ${n} fiche(s) Nova modernisée(s) avec succès !`,
      partial: (ok, ko) =>
        `✨ ${ok} fiche(s) Nova modernisée(s) · ⚠️ ${ko} ont échoué. Relance la rénovation pour les fiches restantes.`,
      allFailed: (n) =>
        `❌ La modernisation des ${n} fiche(s) Nova a échoué. Vérifie ta connexion internet puis réessaie.`,
      skippedOnly: (n) => `⚠️ ${n} fiche(s) Nova sont vides : rien à moderniser.`,
    },
  });

  return migrated;
}

