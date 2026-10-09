// src/lib/englishCardEngine.js — Moteur Universel d'Élite pour Fiches d'Anglais (Format WhatsApp / BBC / SLA)
// Remplace définitivement le faux templating abstrait par une pédagogie active (Vrai sens + Règle réflexe + Mini-dialogue A/B + Piège).

import { safeParseJSON } from "./jsonRepair.js";

/**
 * Règle de structure pour les fiches d'anglais générées par l'IA
 */
export const ENGLISH_CARD_STRUCTURE_INSTRUCTION = `
⚠️ STRUCTURE D'ÉLITE POUR TOUTE FICHE D'ANGLAIS (Format Direct & Vivant) :
Le champ "front" DOIT être une expression ou phrase anglaise 100% CORRECTE et naturelle.
Le champ "back" DOIT suivre STRICTEMENT cette structure claire (sans jargon abstrait) :

📖 **Vrai sens :** [Traduction française naturelle et idiomatique. INTERDICTION ABSOLUE de recopier l'anglais.]

🧩 **La Règle Réflexe / Structure :** [1 à 2 phrases simples expliquant le fonctionnement en anglais ou l'image littérale si c'est un idiome. Zéro jargon type 'glissement sémantique' ou 'modèle mental'.]

💬 **Mini-dialogue :**
* **A :** \`[Phrase A naturelle en anglais]\`  
  ↳ *[Traduction française de la réplique A]*
* **B :** \`[Phrase B naturelle en anglais]\`  
  ↳ *[Traduction française de la réplique B]*

⚠️ **Attention au piège :** [Calque mot-à-mot du français à éviter ou précision sur le registre (familier vs formel/pro).]
`;

/**
 * Détecte si une carte appartient à la catégorie Anglais
 */
export function isEnglishCategory(category = "") {
  const cat = String(category || "").toLowerCase();
  return cat.includes("anglais") || cat.includes("english") || category.includes("🇬🇧");
}

/**
 * Détecte si une fiche d'anglais comporte des incohérences ou du texte robotique pré-rempli
 */
export function isDefectiveEnglishCard(card) {
  if (!card) return false;
  const front = String(card.front || "").trim();
  const back = String(card.back || "").trim();

  // 1. Détection de phrases d'anglais cassé connues ou tronquées
  if (/^i want you believe that$/i.test(front)) return true;
  if (front.includes("I got the, I have the")) return true;

  // 2. Détection du faux templating mécanique ("fastCardModernizer")
  if (back.includes("widely used in modern workflows")) return true;
  if (back.includes("In daily practice:")) return true;
  if (back.includes("Glissement sémantique : structure essentielle")) return true;
  if (back.includes("Transition Métaphorique") && back.includes("Sens physique / conceptuel")) return true;

  // 3. Traduction vide ou recopie bête du front en anglais
  const tradMatch = back.match(/Traduction\s*:\s*([^\n]+)/i);
  if (tradMatch && tradMatch[1]) {
    const tradVal = tradMatch[1].trim().toLowerCase();
    if (tradVal === front.toLowerCase()) return true;
  }

  // 4. Exemple incohérent (ex: "The book that is on the table is mine" pour la fiche "who")
  if (front.toLowerCase() === "who" && back.includes("The book")) return true;

  return false;
}

/**
 * Construit le prompt système pour restructurer chirurgicalement une fiche d'anglais avec l'IA
 */
export function buildEnglishRestructureSystemPrompt() {
  return `Tu es un Coach d'anglais d'élite et expert en sciences cognitives (SLA).
Ton rôle est de métamorphoser une fiche d'anglais défectueuse, confuse ou issue d'un template robotique, en une fiche de révision FSRS PARFAITE, ultra-vivante et mémorisable en 5 secondes.

RÈGLES D'OR ABSOLUES :
1. CORRECTION GRAMMATICALE DU RECTO :
   - Si le front contient une faute d'anglais (ex: "i want you believe that"), CORRIGE-LE immédiatement dans le champ "front" (ex: "I want you to believe that").
   - Si le front est un mélange tronqué (ex: "I got the, I have the"), transforme-le en un titre clair et cerné (ex: "I have vs I've got").
   - Si le front est un mot isolé comme "who", garde "who" et enseigne l'usage correct pour les humains (vs which/that).

2. VERSO ("back") VIVANT ET SANS JARGON :
   Le verso doit comporter EXACTEMENT 4 sections :
   📖 **Vrai sens :** <traduction naturelle en français courant, JAMAIS d'anglais ici>
   
   🧩 **La Règle Réflexe :** <explication limpide en 1 ou 2 phrases du réflexe anglophone. Si c'est une image idiomatique, donner la traduction littérale imagée. Zéro blabla universitaire.>
   
   💬 **Mini-dialogue :**
   * **A :** \`<réplique A en anglais, vivante et spontanée>\`  
     ↳ *<traduction en français de la réplique A>*
   * **B :** \`<réplique B en anglais>\`  
     ↳ *<traduction en français de la réplique B>*
   
   ⚠️ **Attention au piège :** <le calque du français à bannir ou précision de registre (familier vs formel)>.

3. CHAMP "example" :
   Extrait la phrase clé du dialogue en anglais pour la synthèse vocale (TTS).

Réponds STRICTEMENT en JSON pur (aucun markdown autour, aucun backtick) :
{
  "front": "Expression anglaise corrigée",
  "back": "Contenu formaté en Markdown exact avec les 4 sections",
  "example": "Phrase anglaise clé du dialogue"
}`;
}

/**
 * Construit le payload utilisateur pour une carte spécifique
 */
export function buildEnglishRestructureUserPayload(card) {
  return `MÉTAMORPHOSE CETTE FICHE :
Front actuel: "${card.front || ""}"
Back actuel:
"""
${card.back || ""}
"""
Exemple actuel: "${card.example || ""}"`;
}

/**
 * Parse et valide la réponse JSON de restructuration d'une fiche
 */
export function parseEnglishRestructureResponse(raw, fallbackCard = {}) {
  if (!raw) return null;
  let parsed = null;

  if (typeof raw === "object" && raw !== null && (raw.front || raw.back)) {
    parsed = raw;
  } else {
    const text = typeof raw === "string" ? raw : String(raw.text || raw.content || "");
    const cleaned = text.replace(/```json|```/gi, "").trim();
    try {
      parsed = safeParseJSON(cleaned);
    } catch (_) {
      parsed = null;
    }
  }

  if (!parsed || !parsed.back) return null;

  const newFront = String(parsed.front || fallbackCard.front || "").trim();
  let newBack = String(parsed.back || "").trim();
  const newExample = String(parsed.example || fallbackCard.example || "").trim();

  // Sécurité anti-retour vide
  if (newBack.length < 20) return null;

  return {
    front: newFront,
    back: newBack,
    example: newExample,
  };
}

/**
 * Découpe une traduction combinée d'un mini-dialogue en deux traductions distinctes (pour A et pour B).
 */
export function splitDialogueTranslation(tradCombined) {
  if (!tradCombined) return null;
  let cleanTrad = String(tradCombined).replace(/^[↳\->\s*]+/, "").trim();

  // Pattern 1 : avec guillemets français ou anglais : « Trad A » [-—] « Trad B » ou "Trad A" - "Trad B"
  const quotedMatch = cleanTrad.match(/^([«“"][^»”"]+[»”"])\s*[-—–]\s*([«“"][^»”"]+[»”"])$/);
  if (quotedMatch) {
    return [quotedMatch[1].trim(), quotedMatch[2].trim()];
  }

  // Pattern 2 : avec guillemets partiels ou imbriqués
  const partialQuotedMatch = cleanTrad.match(/^([«“"][^»”"]+[»”"])\s*[-—–]\s*(.+)$/);
  if (partialQuotedMatch) {
    return [partialQuotedMatch[1].trim(), partialQuotedMatch[2].trim()];
  }

  // Pattern 3 : séparé par tiret cadratin ou tiret entouré d'espaces : Trad A — Trad B ou Trad A - Trad B
  const parts = cleanTrad.split(/\s*(?:—|–|\s-\s)\s*/);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return [parts[0].trim(), parts[1].trim()];
  }

  return null;
}

/**
 * Reformatte un dialogue contenant une traduction globale en fin de dialogue
 * pour placer chaque traduction directement sous sa réplique respective.
 */
export function reformatDialogueWithPerTurnTranslation(text) {
  if (!text || typeof text !== "string") return text;

  // Cas 1 : Réplique B avec traduction combinée attachée à la fin :
  // • B : "..." ↳ Trad A - Trad B
  // ou * **B :** `...` ↳ Trad A - Trad B
  const inlineBRegex = /^([\s*•\-\–]*\*{0,2}B\*{0,2}\s*:\s*[^\n↳]+)\s*(?:↳|->)\s*(.+)$/m;
  const matchB = text.match(inlineBRegex);
  if (matchB) {
    const bPart = matchB[1].trim();
    const tradCombined = matchB[2].trim();
    const splits = splitDialogueTranslation(tradCombined);
    if (splits) {
      const lineARegex = /^([\s*•\-\–]*\*{0,2}A\*{0,2}\s*:\s*[^\n]+)$/m;
      const matchA = text.match(lineARegex);
      if (matchA && text.indexOf(matchA[0]) < text.indexOf(matchB[0])) {
        const lineA = matchA[1].trim();
        const cleanTradA = splits[0].replace(/^\*+|\*+$/g, "");
        const cleanTradB = splits[1].replace(/^\*+|\*+$/g, "");

        const newA = `${lineA}  \n  ↳ *${cleanTradA}*`;
        const newB = `${bPart}  \n  ↳ *${cleanTradB}*`;

        text = text.replace(matchA[0], newA);
        text = text.replace(matchB[0], newB);
        return text;
      }
    }
  }

  // Cas 2 : Réplique A, puis B, puis ligne suivante ↳ Trad A - Trad B
  const separateTradRegex = /^([\s*•\-\–]*\*{0,2}A\*{0,2}\s*:\s*[^\n]+)\n([\s*•\-\–]*\*{0,2}B\*{0,2}\s*:\s*[^\n]+)\n\s*(?:↳|->)\s*(.+)$/m;
  const matchSep = text.match(separateTradRegex);
  if (matchSep) {
    const lineA = matchSep[1].trim();
    const lineB = matchSep[2].trim();
    const tradCombined = matchSep[3].trim();
    const splits = splitDialogueTranslation(tradCombined);
    if (splits) {
      const cleanTradA = splits[0].replace(/^\*+|\*+$/g, "");
      const cleanTradB = splits[1].replace(/^\*+|\*+$/g, "");
      const replacement = `${lineA}  \n  ↳ *${cleanTradA}*\n${lineB}  \n  ↳ *${cleanTradB}*`;
      return text.replace(matchSep[0], replacement);
    }
  }

  return text;
}
