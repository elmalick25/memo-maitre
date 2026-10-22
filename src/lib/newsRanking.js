// Classement des actualités : une seule note qui combine pertinence (mots-clés),
// popularité (votes, étoiles, commentaires), couverture (nb de sources) et fraîcheur.

export const HOUR_MS = 3600000;
// Un article très bien noté et non lu reste visible jusqu'à 72 h.
export const HIGH_QUALITY_GRACE_MS = 72 * HOUR_MS;
export const HIGH_QUALITY_THRESHOLD = 12;

export function popularityOf(item = {}) {
  return (item.votes || 0) + (item.stars || 0) * 2 + (item.comments || 0) * 0.5;
}

export function qualityScore(item = {}, now = Date.now(), taste = null, themeOf = null) {
  const kw = Math.max(0, Math.min(10, item.score || 0)); // 0–10 (mots-clés)
  // Note IA (0–10) si disponible : elle pèse plus que les mots-clés, plus difficile à tromper.
  const relevance = typeof item.aiScore === "number"
    ? 0.35 * kw + 0.65 * Math.max(0, Math.min(10, item.aiScore))
    : kw;
  const pop = popularityOf(item);
  const popPts = Math.min(8, Math.log10(1 + pop) * 3); // 10 votes ≈ 3, 1000 ≈ 8 (plafond)
  const sources = Math.max(1, item.sourceCount || 1);
  const coveragePts = Math.min(6, (sources - 1) * 2); // sujet repris par plusieurs médias
  const ageHours = Math.max(0, (now - (item.ts || 0)) / HOUR_MS);
  const freshPts = 6 * Math.exp(-ageHours / 18);
  return relevance + popPts + coveragePts + freshPts + breakingBoost(item, now) + tasteBoost(item, taste, themeOf);
}

// 🚨 Alerte « BREAKING / URGENT / FLASH » : priorité maximale pendant 12 h.
const BREAKING_RX = /^\s*(?:[🔴🚨⚡]\s*)?(breaking|urgent|flash|alerte|live|en direct|just in|exclusive|exclusif)\b/i;
export function isBreaking(item = {}) {
  return BREAKING_RX.test(item.title || "") || BREAKING_RX.test(item.titleFr || "");
}
function breakingBoost(item, now) {
  if (!isBreaking(item)) return 0;
  const ageHours = Math.max(0, (now - (item.ts || 0)) / HOUR_MS);
  return ageHours <= 12 ? 8 : 0;
}

// ─── Goûts de l'utilisateur ─────────────────────────────────────────────────
// Lire = +1, sauvegarder = +3, jeter = -2, par source et par thème.
export const TASTE_WEIGHTS = { read: 1, save: 3, dismiss: -2 };
const TASTE_CAP = 20;

export function emptyTaste() { return { sources: {}, themes: {} }; }

export function recordTaste(taste, item, action, themeId = null) {
  const w = TASTE_WEIGHTS[action];
  if (!w || !item) return taste || emptyTaste();
  const t = { sources: { ...(taste?.sources || {}) }, themes: { ...(taste?.themes || {}) } };
  const bump = (map, key) => {
    if (!key) return;
    map[key] = Math.max(-TASTE_CAP, Math.min(TASTE_CAP, (map[key] || 0) + w));
  };
  bump(t.sources, item.source);
  bump(t.themes, themeId);
  return t;
}

// Bonus entre -4 et +4 points selon ce que l'utilisateur lit / jette.
export function tasteBoost(item, taste, themeOf = null) {
  if (!taste || !item) return 0;
  const s = taste.sources?.[item.source] || 0;
  const themeId = themeOf ? themeOf(item) : item.themeId;
  const th = themeId ? (taste.themes?.[themeId] || 0) : 0;
  return Math.max(-4, Math.min(4, (s + th) / 3));
}

// ─── « À ne pas rater » ─────────────────────────────────────────────────────
export const MUST_NOT_MISS_THRESHOLD = 20;
export function mustNotMiss(list, { now = Date.now(), readIds = new Set(), max = 3, threshold = MUST_NOT_MISS_THRESHOLD } = {}) {
  return list
    .filter((i) => !readIds.has(i.id) && now - (i.ts || 0) <= HIGH_QUALITY_GRACE_MS)
    .map((i) => ({ i, q: qualityScore(i, now) }))
    .filter((x) => x.q >= threshold)
    .sort((a, b) => b.q - a.q)
    .slice(0, max)
    .map((x) => x.i);
}

// Visible si : sauvegardé, dans la limite normale, ou excellent + non lu + < 72 h.
export function isVisibleByAge(item, { ageLimit, now = Date.now(), saved = false, read = false }) {
  if (saved) return isSavedStillValid(item, now);
  const age = now - (item.ts || 0);
  if (age <= ageLimit) return true;
  return !read && age <= HIGH_QUALITY_GRACE_MS && qualityScore(item, now) >= HIGH_QUALITY_THRESHOLD;
}

// Un favori reste consultable 72 h après publication, même s'il a été « passé » dans le flux.
export const SAVED_RETENTION_MS = 72 * HOUR_MS;
export function isSavedStillValid(item = {}, now = Date.now()) {
  return now - (item.ts || now) <= SAVED_RETENTION_MS;
}

// Note effective affichée sur la carte (0–10) : note de base (+ bonus éventuel de couverture multi-sources)
export function displayScoreOf(item = {}) {
  const kw = Math.max(0, Math.min(10, item.score ?? 5));
  const base = typeof item.aiScore === "number"
    ? Math.round(0.35 * kw + 0.65 * Math.max(0, Math.min(10, item.aiScore)))
    : kw;
  const extra = Math.max(0, (item.sourceCount || 1) - 1) * 2;
  return Math.min(10, Math.max(0, base + extra));
}

export function sortNews(list, { mode = "relevance", tab = "all", now = Date.now(), taste = null, themeOf = null } = {}) {
  const arr = [...list];
  if (mode === "recent") return arr.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (mode === "popular") {
    const p = (i) => popularityOf(i) + (Math.max(1, i.sourceCount || 1) - 1) * 20;
    return arr.sort((a, b) => (p(b) - p(a)) || ((b.ts || 0) - (a.ts || 0)));
  }
  // "relevance" et onglet "top" : la note affichée (/10) prime strictement (10 en haut, 0 en bas),
  // puis départage par qualité globale (popularité, fraîcheur, affinité) et enfin horodatage.
  void tab;
  const s = new Map(arr.map((i) => [i, displayScoreOf(i)]));
  const q = new Map(arr.map((i) => [i, qualityScore(i, now, taste, themeOf)]));
  return arr.sort((a, b) => (s.get(b) - s.get(a)) || (q.get(b) - q.get(a)) || ((b.ts || 0) - (a.ts || 0)));
}

// Déduplication qui compte combien de sources couvrent le même sujet.
export function dedupeWithCoverage(list) {
  const byUrl = new Map();
  const byTitle = new Map();
  const out = [];
  for (const it of list) {
    const uKey = (it.url || it.id || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase().trim();
    const tKey = (it.title || "").toLowerCase().replace(/[^a-z0-9]/gi, "").slice(0, 45);
    const useT = tKey && tKey.length >= 10;
    const kept = (uKey && byUrl.get(uKey)) || (useT && byTitle.get(tKey));
    if (kept) {
      if (it.source && it.source !== kept.source && !(kept._sources || []).includes(it.source)) {
        kept._sources = [...(kept._sources || [kept.source]), it.source];
        kept.sourceCount = kept._sources.length;
      }
      continue;
    }
    const copy = { ...it, _sources: it._sources || (it.source ? [it.source] : []) };
    copy.sourceCount = Math.max(it.sourceCount || 1, copy._sources.length || 1);
    if (uKey) byUrl.set(uKey, copy);
    if (useT) byTitle.set(tKey, copy);
    out.push(copy);
  }
  return out;
}
