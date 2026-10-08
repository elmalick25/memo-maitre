import { ATOMIC_CARD_RULES } from "./atomicCardRules.js";
import { SPEECH_HYGIENE_PROMPT } from "../utils/speechCleanup.js";

import { ENGLISH_CARD_STRUCTURE_INSTRUCTION } from "./englishCardEngine.js";

export function getStructureInstructions({ category = "", formType = "qa" }) {
  const cat = String(category).toLowerCase();
  const isEnglish = cat.includes("anglais") || cat.includes("english") || category.includes("🇬🇧");
  const isCode =
    formType === "code" ||
    cat.includes("java") ||
    cat.includes("spring") ||
    cat.includes("javascript") ||
    cat.includes("js") ||
    cat.includes("informatique") ||
    cat.includes("code") ||
    cat.includes("python") ||
    cat.includes("lisp");
  const isConcept = formType === "concept" || cat.includes("archi") || cat.includes("système");
  const isFormula = formType === "formula" || cat.includes("math") || cat.includes("physique");
  const isTable = formType === "table";

  if (isEnglish) {
    return ENGLISH_CARD_STRUCTURE_INSTRUCTION;
  }

  if (isConcept) {
    return `
⚠️ POUR CHAQUE FICHE DE TYPE CONCEPT TECHNIQUE :
L'objectif est la rétention atomique immédiate, PAS un mini-cours.
Chaque fiche DOIT cibler UN SEUL angle parmi :
1. L'INTUITION / PROBLÈME : Quel problème concret ce concept résout-il ?
2. L'INVARIANT / MÉCANISME : Quelle est la règle ou la transition d'état clé ?
3. LE TRADE-OFF / LIMITE : Quel est son coût ou son piège majeur ?

Règles de rédaction :
- "front" : Question précise et non ambiguë (ex: "Quel problème en cascade le pattern Circuit Breaker évite-t-il ?")
- "back" : Réponse univoque et tranchée en 1 ou 2 phrases courtes (≤ 25 mots). Pas de liste à puces.
- "example" : Un cas réel ou analogie en 1 phrase.`;
  }

  if (isCode) {
    return `
⚠️ POUR CHAQUE FICHE DE CODE / DÉVELOPPEMENT :
INTERDICTION des fiches encyclopédiques (définition + usage + code + piège réunis).
Chaque fiche DOIT être atomique et tester :
- SOIT la syntaxe clé / annotation exacte (via format cloze ou question directe).
- SOIT le comportement d'un snippet court (≤ 5 lignes bien indentées).
- SOIT l'erreur classique / piège d'exécution.

Règles de rédaction :
- "front" : Une question contextuelle ou un mini-snippet à analyser (≤ 15 mots).
- "back" : La solution exacte ou l'annotation (≤ 20 mots) + court bloc code markdown si nécessaire.
- "example" : Cas d'usage minimaliste en 1 ligne.`;
  }

  if (isFormula) {
    return `
⚠️ POUR CHAQUE FICHE DE FORMULE / MATHS :
Ne demande JAMAIS de recracher une formule complète par cœur.
Teste :
- La signification d'une variable spécifique dans la formule.
- La condition de validité fondamentale.
- L'effet de la variation d'un paramètre (si X double, que devient Y ?).`;
  }

  if (isTable) {
    return `
⚠️ POUR CHAQUE FICHE DE TYPE TABLEAU, INTERDICTION d'utiliser un tableau Markdown brut (| col | col |). Organise les données en LISTE STRUCTURÉE :

📋 [Titre du tableau si pertinent]
• **[Item]** — [valeur ou définition]
• **[Item]** — [valeur ou définition]

🧭 LECTURE : [comment lire/utiliser ces données]
📌 À RETENIR : [le takeaway clé]`;
  }

  return "";
}

export function buildBatchPrompt({ count = 5, prompt = "", category = "", formType = "qa" }) {
  const structure = getStructureInstructions({ category, formType });
  const structureBlock = structure ? `\n${structure}` : "";
  const system = `Tu es un assistant pédagogique expert. Génère exactement ${count} fiches de révision atomiques (une idée par fiche) optimisées pour FSRS. Réponds UNIQUEMENT en JSON strict : {"cards":[{"front":"...","back":"...","example":"..."},...]}.${structureBlock}\n\n${ATOMIC_CARD_RULES}`;
  return {
    system,
    user: `Génère ${count} fiches sur: ${prompt}`,
  };
}

export function buildChatToCardSystemPrompt() {
  return `Tu es un Copilot expert en création de flashcards (FSRS).
L'utilisateur converse avec toi pour créer ou affiner des fiches de révision.
Réponds TOUJOURS au format JSON STRICT suivant :
{
  "message": "Ta réponse conversationnelle courte et motivante à l'utilisateur",
  "cards": [
    { "front": "Question/Concept", "back": "Explication claire", "example": "Exemple concret" }
  ]
}
Si l'utilisateur demande de modifier des cartes précédentes, renvoie la NOUVELLE liste mise à jour. S'il n'y a pas de cartes à afficher, renvoie un tableau "cards" vide.

${SPEECH_HYGIENE_PROMPT}

${ATOMIC_CARD_RULES}`;
}

export function layoutBatchCards(cards = []) {
  const list = Array.isArray(cards) ? cards : [];
  const layouted = list.map((c, i) => ({
    ...c,
    id: `batch_node_${Date.now()}_${i}`,
    x: 60 + (i % 3) * 320 + (Math.random() * 40 - 20),
    y: 80 + Math.floor(i / 3) * 220 + (Math.random() * 40 - 20),
  }));

  const links = [];
  for (let i = 1; i < layouted.length; i++) {
    links.push({ source: layouted[i - 1].id, target: layouted[i].id });
  }

  return { layouted, links };
}

