// ════════════════════════════════════════════════════════════════════════════
// 💾 safeStorage — localStorage robuste (quota, JSON, mode privé, SSR)
// ────────────────────────────────────────────────────────────────────────────
// - try/catch partout (Safari mode privé throw)
// - JSON sérialisation/désérialisation safe
// - éviction LRU automatique si QuotaExceededError
// - namespacing optionnel via prefix
// ════════════════════════════════════════════════════════════════════════════

const HAS_LS = (() => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const k = "__sx_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch { return false; }
})();

// Fallback in-memory si localStorage indisponible (mode privé Safari)
const memoryStore = new Map();

function rawGet(key) {
  if (HAS_LS) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

function rawSet(key, value) {
  if (HAS_LS) {
    try { window.localStorage.setItem(key, value); return true; }
    catch (e) {
      // Quota → on tente une éviction des plus anciennes clés "cache_*" ou "tmp_*"
      if (e?.name === "QuotaExceededError" || /quota/i.test(String(e?.message))) {
        evictCache();
        try { window.localStorage.setItem(key, value); return true; } catch { return false; }
      }
      return false;
    }
  }
  memoryStore.set(key, value);
  return true;
}

function rawRemove(key) {
  if (HAS_LS) {
    try { window.localStorage.removeItem(key); } catch {}
  }
  memoryStore.delete(key);
}

function evictCache() {
  if (!HAS_LS) return;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && /^(cache_|tmp_|news_cache|ai_cache)/i.test(k)) keys.push(k);
    }
    // supprime les premiers (FIFO approx)
    keys.slice(0, Math.max(1, Math.floor(keys.length / 2))).forEach(rawRemove);
  } catch {}
}

export const safeStorage = {
  get(key, fallback = null) {
    const v = rawGet(key);
    return v == null ? fallback : v;
  },
  set(key, value) {
    return rawSet(key, String(value ?? ""));
  },
  remove: rawRemove,
  getJSON(key, fallback = null) {
    const raw = rawGet(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  },
  setJSON(key, value) {
    try { return rawSet(key, JSON.stringify(value)); }
    catch (e) { console.warn("[safeStorage] setJSON failed", key, e); return false; }
  },
  has(key) { return rawGet(key) != null; },
  // Pour cache TTL
  setWithTTL(key, value, ttlMs) {
    return this.setJSON(key, { v: value, e: Date.now() + ttlMs });
  },
  getWithTTL(key, fallback = null) {
    const obj = this.getJSON(key);
    if (!obj || typeof obj !== "object" || !("e" in obj)) return fallback;
    if (Date.now() > obj.e) { rawRemove(key); return fallback; }
    return obj.v;
  },
};

export default safeStorage;
