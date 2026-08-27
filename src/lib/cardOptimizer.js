import { ATOMIC_CARD_RULES } from "./atomicCardRules.js";
import { safeParseJSON } from "./textUtils.js";

export function buildOptimizationSystemPrompt() {
  return `Tu es un expert FSRS/SuperMemo. Pour CHAQUE fiche fournie (identifiée par son "id"), produis 1 à N fiches ATOMIQUES optimisées de sorte que la rétention FSRS prédite tende vers 100%. Scinde agressivement si nécessaire, resserre les formulations, élimine toute ambiguïté. Conserve l'"id" source dans chaque sortie pour tracer l'origine.

Réponds UNIQUEMENT en JSON strict :
{"results":[{"id":"<source-id>","cards":[{"front":"...","back":"...","example":"..."}]}]}

${ATOMIC_CARD_RULES}`;
}

export function parseOptimizationResponse(rawResponse, slice = []) {
  const rawText = typeof rawResponse === "string" ? rawResponse : (rawResponse?.text || "");
  const clean = rawText.replace(/```json|```/gi, "").trim();
  let parsed = null;
  try {
    parsed = safeParseJSON(clean);
  } catch (_) {
    parsed = null;
  }

  let results = Array.isArray(parsed?.results) ? parsed.results : [];
  if (!results.length && Array.isArray(parsed?.cards)) {
    results = parsed.cards.map((c, idx) => ({ id: slice[idx]?.id, cards: [c] }));
  }
  if (!results.length && Array.isArray(parsed)) {
    results = parsed.map((r, idx) => ({
      id: r?.id || slice[idx]?.id,
      cards: Array.isArray(r?.cards) ? r.cards : (r?.front && r?.back ? [r] : []),
    }));
  }

  const updates = [];
  for (let ri = 0; ri < results.length; ri++) {
    const r = results[ri];
    if (!r || !Array.isArray(r.cards) || r.cards.length === 0) continue;
    const sourceId = r.id && slice.some((s) => s.id === r.id) ? r.id : slice[ri]?.id;
    if (!sourceId) continue;

    const valid = r.cards
      .filter((c) => c && typeof c.front === "string" && typeof c.back === "string" && c.front.trim() && c.back.trim())
      .map((c) => ({
        front: c.front.trim(),
        back: c.back.trim(),
        example: (c.example || "").toString().trim(),
      }));

    if (valid.length > 0) {
      updates.push({ sourceId, newCards: valid });
    }
  }

  return updates;
}

export function applyOptimizationUpdates(existingExpressions = [], updates = [], todayISO = "") {
  const byId = new Map(existingExpressions.map((e) => [e.id, e]));
  const now = new Date().toISOString();
  const additions = [];

  updates.forEach(({ sourceId, newCards }) => {
    const src = byId.get(sourceId);
    if (!src) return;
    const first = newCards[0];
    byId.set(sourceId, {
      ...src,
      front: first.front,
      back: first.back,
      example: first.example,
      level: 0,
      repetitions: 0,
      stability: null,
      difficulty: null,
      easeFactor: null,
      interval: 1,
      nextReview: todayISO,
      updatedAt: now,
      optimizedBy: "fsrs-batch",
    });

    for (let k = 1; k < newCards.length; k++) {
      const c = newCards[k];
      additions.push({
        id: `${sourceId}-opt-${k}-${Math.random().toString(36).slice(2, 8)}`,
        category: src.category,
        type: src.type || "qa",
        front: c.front,
        back: c.back,
        example: c.example,
        level: 0,
        repetitions: 0,
        stability: null,
        difficulty: null,
        easeFactor: null,
        interval: 1,
        nextReview: todayISO,
        createdAt: now,
        updatedAt: now,
        reviewHistory: [],
        optimizedBy: "fsrs-batch",
        parentId: sourceId,
      });
    }
  });

  return [...Array.from(byId.values()), ...additions];
}
