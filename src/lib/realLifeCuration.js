// realLifeCuration.js — Orpaillage et curation éditoriale IA des expressions extraites
import { safeParseJSON } from "./textUtils.js";

/**
 * Analyse une liste d'expressions brutes extraites d'une vidéo et ne conserve
 * que les meilleures tournures natives (B2-C2, idiomes, phrasal verbs, collocations)
 */
export async function curateExpressions(callClaude, rawExpressions, videoTitle = "") {
  if (!Array.isArray(rawExpressions) || rawExpressions.length <= 6 || !callClaude) {
    return rawExpressions || [];
  }

  const payload = rawExpressions.map((e, idx) => ({
    id: idx,
    expr: e?.expr || "",
    meaning: e?.meaning || "",
  }));

  const prompt = `Tu es un linguiste expert en acquisition d'anglais natif (CEFR B2-C2).
Voici les expressions candidates extraites de la vidéo "${videoTitle || "English Practice"}".
Effectue un ORPAILLAGE ÉDITORIAL STRICT :
1. ÉLIMINE les banalités, formules de politesse, verbes basiques A1-B1 (ex: "you know", "thank you", "let's see", "good morning", "as well", "look at").
2. ÉLIMINE les doublons ou expressions quasi-identiques.
3. CONSERVE UNIQUEMENT les expressions à forte valeur ajoutée : idiomes percutants, phrasal verbs natifs, collocations sophistiquées, tournures orales B2-C2 indispensables à mémoriser.
4. Sélectionne entre 6 et 20 pépites maximum par ordre d'intérêt décroissant.

CANDIDATS :
${JSON.stringify(payload)}

Réponds STRICTEMENT avec du JSON au format :
{"selectedIds": [0, 4, 7, ...]}`;

  try {
    const raw = await callClaude(
      "Tu es un conservateur linguistique d'élite. Réponds UNIQUEMENT en JSON valide.",
      prompt,
      { maxTokens: 1200, temperature: 0.1, json: true, task: "fast-json" }
    );
    const text = typeof raw === "string" ? raw : (raw?.text || raw?.content || "");
    const parsed = safeParseJSON(text);
    const ids = Array.isArray(parsed?.selectedIds) ? parsed.selectedIds : null;
    if (ids && ids.length) {
      const curated = ids.map(id => rawExpressions[id]).filter(Boolean);
      if (curated.length >= 3) return curated;
    }
  } catch (err) {
    console.warn("curateExpressions fallback", err);
  }
  return rawExpressions;
}
