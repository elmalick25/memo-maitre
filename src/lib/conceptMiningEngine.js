// src/lib/conceptMiningEngine.js
// Moteur d'Extraction Forensique & Audit de Couverture Documentaire (Niveau 10)
// Garantit qu'AUCUNE notion capitale, fonction, syntaxe ou piège ne soit omis lors de la conversion PDF -> Fiches.

export const CONCEPT_MINING_SYSTEM_PROMPT = `Tu es un inspecteur pédagogique académique d'élite (Audit d'Examen Niveau 10).
Ton unique mission est d'extraire l'INVENTAIRE FORENSIQUE EXHAUSTIF de TOUTES les notions, fonctions, syntaxes, règles clés et pièges d'examen présents dans ce texte de cours.

RÈGLE D'OR : ZÉRO OMISSION.
Si le cours aborde 15 concepts distincts (ex: 'if strict', 'if alternative', 'when/unless', 'cond', 'case', 'loop for', 'loop repeat', 'dotimes', 'dolist', 'loop while', 'loop until', 'return', 'saut d\\'itération'), tu dois TOUS les lister individuellement dans l'inventaire. Ne regroupe pas les notions distinctes sous un terme générique.

Pour chaque notion identifiée, fournis :
1. "name" : Nom précis et sans ambiguïté du concept (ex: "dotimes avec &optional valFinale").
2. "coreSyntaxOrRule" : La syntaxe, signature ou règle exacte tirée du document.
3. "trapOrDetail" : Le piège d'examen, cas limite ou comportement spécifique (ex: "indice commence à 0, renvoie valFinale ou nil").
4. "bloomLevel" : "Remember" | "Understand" | "Apply" | "Analyze" | "Evaluate".
5. "type" : "code" | "trap" | "qa" | "cloze".

Réponds UNIQUEMENT en JSON valide, sans texte d'introduction ni backticks markdown :
{
  "concepts": [
    {
      "name": "Nom du concept",
      "coreSyntaxOrRule": "Syntaxe ou règle clé",
      "trapOrDetail": "Piège d'examen ou cas limite",
      "bloomLevel": "Apply",
      "type": "code"
    }
  ]
}`;

/**
 * Normalise une chaîne pour la comparaison sémantique
 */
function cleanForComparison(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Audite la couverture des concepts inventoriés dans la liste des fiches produites.
 * @param {Array<{name: string, coreSyntaxOrRule?: string, trapOrDetail?: string}>} concepts 
 * @param {Array<{front: string, back: string, keyword?: string}>} cards 
 * @returns {{ coveragePercent: number, total: number, coveredCount: number, covered: Array, missed: Array }}
 */
export function auditDocumentCoverage(concepts = [], cards = []) {
  if (!Array.isArray(concepts) || concepts.length === 0) {
    return {
      coveragePercent: 100,
      total: 0,
      coveredCount: 0,
      covered: [],
      missed: [],
    };
  }

  const normalizedCards = cards.map(c => ({
    front: cleanForComparison(c.front),
    back: cleanForComparison(c.back),
    keyword: cleanForComparison(c.keyword),
    full: cleanForComparison(`${c.front || ""} ${c.back || ""} ${c.keyword || ""}`),
  }));

  const covered = [];
  const missed = [];

  for (const concept of concepts) {
    const conceptName = String(concept.name || "").trim();
    if (!conceptName) continue;

    const cleanName = cleanForComparison(conceptName);
    const tokens = cleanName.split(" ").filter(t => t.length > 2);

    let isCovered = false;

    for (const card of normalizedCards) {
      // 1. Correspondance exacte du nom ou du mot-clé
      if (card.keyword && (card.keyword.includes(cleanName) || cleanName.includes(card.keyword))) {
        isCovered = true;
        break;
      }

      // 2. Inclusion de la chaîne complète
      if (card.full.includes(cleanName)) {
        isCovered = true;
        break;
      }

      // 3. Présence d'au moins 75% des jetons clés significatifs dans la fiche
      if (tokens.length > 0) {
        const matchingTokens = tokens.filter(t => card.full.includes(t));
        if (matchingTokens.length >= Math.ceil(tokens.length * 0.75)) {
          isCovered = true;
          break;
        }
      }
    }

    if (isCovered) {
      covered.push(concept);
    } else {
      missed.push(concept);
    }
  }

  const total = covered.length + missed.length;
  const coveragePercent = total > 0 ? Math.round((covered.length / total) * 100) : 100;

  return {
    coveragePercent,
    total,
    coveredCount: covered.length,
    covered,
    missed,
  };
}

/**
 * Construit un prompt de génération ciblée 1:1 pour une grappe de concepts inventoriés.
 */
export function buildTargetedGenerationPrompt(concepts = [], activeProfileDirective = "", pedagogyRule = "") {
  const conceptsList = concepts
    .map((c, i) => `${i + 1}. NOTION : ${c.name} | SYNTAXE/RÈGLE : ${c.coreSyntaxOrRule || "N/A"} | PIÈGE : ${c.trapOrDetail || "N/A"} | TYPE ATTENDU : ${c.type || "qa"}`)
    .join("\n");

  return `Tu es le meilleur concepteur mondial de flashcards universitaires d'élite (FSRS & Active Recall Niveau 10).
${pedagogyRule}
${activeProfileDirective}

INSTRUCTION CAPITALE DE COUVERTURE 1:1 (ZERO-DROP GUARANTEE) :
Voici la liste des ${concepts.length} notions clés extraites de cette section.
Tu dois générer EXACTEMENT UNE FICHE DÉDIÉE par notion listée ci-dessous. ZÉRO OMISSION.
Chaque fiche doit cibler spécifiquement la notion correspondante, son application ou son piège d'examen.

LISTE DES NOTIONS À COUVRIR OBLIGATOIREMENT :
${conceptsList}

Réponds UNIQUEMENT en JSON valide :
{"cards":[{"front":"Question précise ou code à tracer","back":"**Réponse directe en gras**\\nExplication claire","type":"qa|code|trap|cloze","bloomLevel":"Remember|Understand|Apply|Analyze|Evaluate","keyword":"mot-clé","hint":"astuce courte optionnelle"}]}`;
}
