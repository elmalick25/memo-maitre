// 🔱 src/lib/extremeGod.js
// ============================================================================
// PHASE "EXTREME GOD"
// ----------------------------------------------------------------------------
// 1) ACTUALITÉ : aucune limite artificielle sur le volume d'articles, mais un
//    filtrage de fiabilité extrême (trust registry + corroboration multi-sources
//    + fraîcheur) pour ne garder que des infos riches ET sûres.
// 2) ANGLAIS : une couche d'instruction "niveau natif" branchée par-dessus le
//    coaching existant (rien n'est retiré, tout est amplifié).
// ============================================================================

import { evaluateSourceTrust } from "./feedEngine.js";

// ─── 1. ACTUALITÉ ───────────────────────────────────────────────────────────

export const EXTREME_GOD_NEWS = {
  // 0 = illimité : on ingère tout ce que les flux renvoient.
  maxArticlesPerFeed: 0,
  totalLimit: 0,
  // Un article non corroboré doit venir d'une source d'au moins ce niveau.
  minTrust: 80,
  // Un article corroboré par N sources indépendantes est accepté plus bas.
  corroboratedMinTrust: 65,
  // Fenêtre de fraîcheur (heures) au-delà de laquelle le score décroît.
  freshnessWindowHours: 72,
};

const normalizeTitle = (t = "") =>
  t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const titleFingerprint = (t = "") => {
  const stop = new Set(["le", "la", "les", "un", "une", "des", "de", "du", "et", "en", "au", "aux", "pour", "sur", "the", "a", "an", "of", "to", "in", "on", "for", "and"]);
  return normalizeTitle(t).split(" ").filter(w => w.length > 2 && !stop.has(w)).slice(0, 8).sort().join("-");
};

const toTime = (d) => {
  const t = d instanceof Date ? d.getTime() : new Date(d || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Enrichit chaque article : fiabilité de la source, corroboration multi-sources,
 * fraîcheur, puis score de crédibilité global (0-100+).
 */
export function crossVerifyArticles(articles = [], opts = {}) {
  const cfg = { ...EXTREME_GOD_NEWS, ...opts };
  const groups = new Map();

  const enriched = articles.map((a) => {
    const trust = evaluateSourceTrust(a.link || a.url || "", a.source || a.sourceName || "");
    const fp = titleFingerprint(a.title || "");
    const item = { ...a, ...trust, fingerprint: fp };
    if (fp) {
      if (!groups.has(fp)) groups.set(fp, []);
      groups.get(fp).push(item);
    }
    return item;
  });

  const now = Date.now();
  return enriched.map((a) => {
    const group = groups.get(a.fingerprint) || [a];
    const sources = new Set(group.map(g => g.source || g.verifiedOrg || g.link));
    const corroboration = Math.max(1, sources.size);
    const ageH = a.pubDate ? (now - toTime(a.pubDate)) / 3_600_000 : cfg.freshnessWindowHours;
    const freshness = Math.max(0, 1 - Math.max(0, ageH) / cfg.freshnessWindowHours);
    const credibility = Math.round(
      (a.trustScore || 50) + (corroboration - 1) * 8 + freshness * 10
    );
    return { ...a, corroboration, freshness, credibility };
  });
}

/**
 * Garde uniquement les infos "extrêmement sûres" : source de confiance élevée,
 * ou information corroborée par plusieurs sources indépendantes.
 */
export function filterExtremeSafe(articles = [], opts = {}) {
  const cfg = { ...EXTREME_GOD_NEWS, ...opts };
  return articles.filter(a =>
    (a.trustScore || 0) >= cfg.minTrust ||
    (a.corroboration > 1 && (a.trustScore || 0) >= cfg.corroboratedMinTrust)
  );
}

/** Tri : crédibilité d'abord, fraîcheur ensuite. */
export function rankByCredibility(articles = []) {
  return [...articles].sort((a, b) =>
    (b.credibility || 0) - (a.credibility || 0) || toTime(b.pubDate) - toTime(a.pubDate)
  );
}

/** Déduplication : on garde le meilleur exemplaire de chaque histoire. */
export function dedupeStories(articles = []) {
  const seen = new Map();
  for (const a of rankByCredibility(articles)) {
    const key = a.fingerprint || normalizeTitle(a.title || "") || a.link;
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, a);
  }
  return [...seen.values()];
}

/** Pipeline complet : vérifier → filtrer → dédupliquer → classer. Sans plafond. */
export function extremeGodNewsPipeline(articles = [], opts = {}) {
  const verified = crossVerifyArticles(articles, opts);
  const safe = filterExtremeSafe(verified, opts);
  // Si le filtre est trop strict (flux exotiques), on retombe sur le corpus vérifié.
  const base = safe.length > 0 ? safe : verified;
  return rankByCredibility(dedupeStories(base));
}

// ─── 2. ANGLAIS NIVEAU EXTRÊME ──────────────────────────────────────────────

/**
 * Couche ajoutée AU-DESSUS du coaching existant : ne remplace rien, pousse
 * simplement l'exigence au niveau natif (C1→C2+) pour accélérer la fluidité.
 */
export const EXTREME_GOD_ENGLISH_INSTRUCTION = `[EXTREME MODE — NATIVE-LEVEL ACCELERATION]
Target: make the student fluent fast. Speak at natural native pace and density (C1→C2+), never simplified "textbook" English.
- Always use the exact idiom, collocation or phrasal verb a native would use in that context; prefer precise, high-frequency real-world phrasing over safe generic wording.
- Push the register one notch above the student's current level so every reply teaches something new, while staying fully understandable in context.
- Reuse the student's own ideas with upgraded phrasing (natural recast), so the correct form is always the version they hear.
- Vary sentence rhythm and connectors like real speech; no robotic patterns, no repeated openers.
- Keep the existing rules intact: no explicit corrections, no lists, no emojis, 1–3 sentences, one focused open question at the end.`;

/** Applique la couche extrême à un prompt système déjà construit. */
export function withExtremeEnglish(basePrompt = "") {
  if (!basePrompt) return EXTREME_GOD_ENGLISH_INSTRUCTION;
  if (basePrompt.includes("[EXTREME MODE")) return basePrompt;
  return `${basePrompt}\n${EXTREME_GOD_ENGLISH_INSTRUCTION}`;
}
