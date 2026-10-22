// newsFirstSeen.js — Date STABLE d'une actu d'un rafraîchissement à l'autre.
//
// Bug corrigé : quand un flux ne donne pas de date lisible (ou une date
// « updated » qui bouge), l'actu recevait l'heure du rafraîchissement
// (Date.now()). Une actu vue il y a plusieurs jours revenait donc en tête
// avec « il y a 0 min ». On retient la PLUS ANCIENNE date jamais observée
// pour chaque article (clé = URL normalisée) et on interdit les dates futures.

export const FIRST_SEEN_STORAGE_KEY = "tech_intel_first_seen_v1";
const MAX_ENTRIES = 4000;
const MAX_AGE_MS = 30 * 86400 * 1000;

export function newsKey(item) {
  return String(item?.url || item?.id || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase().trim();
}

/** Pure : renvoie { items, map } avec des ts stabilisés. */
export function stabilizeNewsTimestamps(items, map = {}, now = Date.now()) {
  const next = { ...map };
  const out = (items || []).map((it) => {
    if (!it) return it;
    const key = newsKey(it);
    let ts = Number(it.ts);
    if (!Number.isFinite(ts) || ts <= 0 || ts > now) ts = now;
    if (!key) return ts === it.ts ? it : { ...it, ts };
    const known = Number(next[key]);
    if (Number.isFinite(known) && known > 0 && known < ts) ts = known;
    next[key] = ts;
    return ts === it.ts ? it : { ...it, ts };
  });
  // Élagage : on oublie les très vieilles entrées et on borne la taille.
  const entries = Object.entries(next).filter(([, v]) => now - v < MAX_AGE_MS);
  entries.sort((a, b) => b[1] - a[1]);
  return { items: out, map: Object.fromEntries(entries.slice(0, MAX_ENTRIES)) };
}

export function loadFirstSeen(storage) {
  try { return JSON.parse(storage?.get?.(FIRST_SEEN_STORAGE_KEY) || "{}") || {}; } catch { return {}; }
}
export function saveFirstSeen(storage, map) {
  try { storage?.set?.(FIRST_SEEN_STORAGE_KEY, JSON.stringify(map)); } catch { /* quota */ }
}
