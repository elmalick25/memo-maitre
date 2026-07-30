// src/lib/retroEngineeringRestructurer.js — Service de restructuration en Rétro-Ingénierie Sémantique pour fiches sélectionnées

import { safeParseJSON } from "./jsonRepair.js";

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

/**
 * Restructure une seule fiche au format Rétro-Ingénierie Sémantique via LLM
 */
export async function upgradeCardToRetroEngineering(card, callClaude) {
  if (!card || !callClaude) return card;

  const systemPrompt = `Tu es un ingénieur en rétro-ingénierie linguistique. Ton rôle est de restructurer cette fiche d'anglais au format RÉTRO-INGÉNIERIE SÉMANTIQUE.
Pas de blabla. Longueur maximale : ~30-40 lignes.

RÈGLE DE STRUCTURE STRICTE DU CHAMP "back" :

Traduction : <traduction courte et naturelle>

### ⚙️ 1. Décomposition & Transition Métaphorique
* **<Mot 1> :** Sens physique : *<sens brut>* ➔ **Glissement sémantique :** <explication du sens figuré>
* **Le Modèle Mental :** <l'image mécanique globale en 1 phrase>

### 🔍 2. Comparatif (Pourquoi A et pas B ?)
* **Option A (<front>) :** <ce que le native visualise>
* **Option B (<Alternative faux-ami>) :** <pourquoi le sens dévie>

### ⚠️ 3. Anti-Pattern (Le piège)
* **Erreur :** <erreur commise> ➔ **Problème :** <sens perçu par un anglophone>

### 💻 4. Exemples (Format court)
* **Exemple 1 (Quotidien) :** \`<phrase EN 1>\` ↳ *<traduction 1>*
* **Exemple 2 (Tech/Workflow) :** \`<phrase EN 2>\` ↳ *<traduction 2>*
* **Exemple 3 (Professionnel/Nuance) :** \`<phrase EN 3>\` ↳ *<traduction 3>*

EXIGENCE STRICTE : Fournis OBLIGATOIREMENT au moins 3 exemples de phrases anglaises naturelles (chacune en backticks \`...\`) accompagnés de leur traduction. Réponds UNIQUEMENT avec le contenu du champ "back" au format Markdown exact ci-dessus. Pas de blabla, aucun texte superflu.`;

  const userPayload = `FICHE À RESTRUCTURER :
Front: "${card.front || ""}"
Back actuel: "${card.back || ""}"
Exemple actuel: "${card.example || ""}"`;

  try {
    const raw = await callClaude(systemPrompt, userPayload, {
      task: "pedagogy",
      maxTokens: 2000,
      temperature: 0.4,
    });
    const rawText = toText(raw);
    let newBack = "";

    const parsed = safeJSONParse(rawText);
    if (parsed && parsed.back) {
      newBack = String(parsed.back).trim();
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
}) {
  const cards = resolveCards(selectedCards, allCards);

  if (!cards.length || !setExpressions || !callClaude) {
    if (!cards.length) showToast?.("Aucune fiche valide à restructurer.", "info");
    return 0;
  }

  let completed = 0;
  const total = cards.length;
  const updatedMap = new Map();

  const processCard = async (card) => {
    const upgraded = await upgradeCardToRetroEngineering(card, callClaude);
    if (upgraded && upgraded.back && upgraded.back !== card.back) {
      updatedMap.set(card.id, upgraded);
    }
    completed++;
    onProgress?.(completed, total);
  };

  const CONCURRENCY = 3;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (cursor < total) {
      const idx = cursor++;
      await processCard(cards[idx]);
    }
  });

  await Promise.all(workers);

  if (updatedMap.size > 0) {
    setExpressions(prev =>
      prev.map(c => (updatedMap.has(c.id) ? updatedMap.get(c.id) : c))
    );
    showToast?.(`⚡ ${updatedMap.size} fiche(s) restructurée(s) en Rétro-Ingénierie Sémantique !`, "success");
  } else {
    showToast?.("Aucune fiche n'a pu être restructurée (IA indisponible ou fiches déjà au bon format).", "info");
  }

  return updatedMap.size;
}
