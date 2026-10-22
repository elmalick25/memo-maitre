// Note de pertinence donnée par l'IA (0–10), une seule fois par article, mise en cache.
export const AI_SCORE_KEY = "tech_intel_ai_scores_v1";
export const AI_SCORE_BATCH = 40;

const SYSTEM = "Tu évalues l'intérêt d'actualités tech pour un lecteur francophone curieux et exigeant. " +
  "Note chaque titre de 0 à 10 : 9-10 = événement majeur ou analyse de fond rare ; 5-6 = utile ; 0-2 = promo, bon plan, clickbait, sans substance. " +
  "Ignore le ton racoleur. Réponds UNIQUEMENT en JSON : {\"scores\":{\"<id>\":<note>}}.";

export function parseAiScores(text) {
  if (!text) return {};
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    const obj = JSON.parse(m[0]);
    const raw = obj.scores && typeof obj.scores === "object" ? obj.scores : obj;
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.max(0, Math.min(10, n));
    }
    return out;
  } catch { return {}; }
}

export function pickUnscored(items, cache, max = AI_SCORE_BATCH) {
  return items.filter((i) => i?.id && typeof cache[i.id] !== "number").slice(0, max);
}

// aiCallFn : (opts) => Promise<{ text }>
export async function scoreBatchWithAi(items, aiCallFn, signal) {
  if (!items.length) return {};
  const lines = items.map((i) => `${i.id} | ${i.source || ""} | ${(i.titleFr || i.title || "").slice(0, 160)}`).join("\n");
  const res = await aiCallFn({
    task: "fast-json", json: true, system: SYSTEM, user: lines, maxTokens: 600, temperature: 0, cache: true, signal,
  });
  const scores = parseAiScores(res?.text);
  const ids = new Set(items.map((i) => i.id));
  return Object.fromEntries(Object.entries(scores).filter(([k]) => ids.has(k)));
}
