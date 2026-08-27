import { ATOMIC_CARD_RULES } from "./atomicCardRules.js";
import { SPEECH_HYGIENE_PROMPT } from "../utils/speechCleanup.js";

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
  const isTable = formType === "table";

  if (isEnglish) {
    return `
⚠️ POUR CHAQUE FICHE D'ANGLAIS, "back" DOIT suivre EXACTEMENT la RÉTRO-INGÉNIERIE SÉMANTIQUE (mêmes titres Markdown, même ordre, concis ~30-40 lignes max) :

Traduction : [Traduction courte et naturelle]

### ⚙️ 1. Décomposition & Transition Métaphorique
* **[Mot 1] :** Sens physique : *[Sens brut]* ➔ **Glissement sémantique :** [Pourquoi cela signifie ce sens figuré]
* **[Mot 2] :** Sens physique : *[Sens brut]* ➔ **Glissement sémantique :** [Pourquoi cela signifie ce sens figuré]
* **Le Modèle Mental :** [En 1 phrase : l'image mécanique globale]

### 🔍 2. Comparatif (Pourquoi A et pas B ?)
* **Option A ([Expression]) :** [Ce que le native visualise]
* **Option B ([Alternative faux-ami]) :** [Pourquoi le sens dévie ou casse la logique]

### ⚠️ 3. Anti-Pattern (Le piège)
* **Erreur :** [Ce qu'on dit en traduisant du FR] ➔ **Problème :** [Le vrai sens perçu par un anglophone]

### 💻 4. Exemples (Format court)
* **Tech/Workflow :** \`[Phrase courte en anglais]\` ↳ *[Traduction française]*
* **Quotidien :** \`[Phrase courte en anglais]\` ↳ *[Traduction française]*`;
  }

  if (isCode) {
    return `
⚠️ POUR CHAQUE FICHE DE CODE, "back" DOIT suivre EXACTEMENT cette structure :

⚙️ DÉFINITION :
[Définition technique précise, 1-2 phrases]

💡 USAGE :
[Quand utiliser ce concept dans un projet réel, 1-2 phrases]

💻 EXEMPLE :
\`\`\`<langage>
<code BIEN INDENTÉ, syntaxiquement correct, copiable-collable. Toujours ouvrir/fermer la fence sur sa propre ligne.>
\`\`\`

⚠️ ATTENTION :
[Piège ou erreur fréquente, 1-2 phrases]

🔁 ÉQUIVALENT / ALTERNATIVE : [autre façon ou concept connexe]

RÈGLES STRICTES : le bloc de code DOIT être encadré par \`\`\`<langage> / \`\`\` sur leurs propres lignes, parfaitement indenté (jamais sur une seule ligne).`;
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
