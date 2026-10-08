// ═══════════════════════════════════════════════════════════════════════════
// 🎮 Double Buffer des actus (Hot-Swap 0 ms)
// Buffer A = ce qui est affiché (géré par TechIntelView).
// Buffer B = Hot Standby : lot complet déjà dédoublé, trié et traduit,
// gardé en mémoire vive ET dans IndexedDB (survit au redémarrage / hors-ligne).
// ═══════════════════════════════════════════════════════════════════════════

const DB_NAME = "memomaitre_news_buffer";
const STORE = "kv";
const KEY = "standby";
let memStandby = null; // { items, ts }

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no idb"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value) {
  const db = await openDb();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

async function idbGet() {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(KEY);
    r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
  });
}

/** Lecture du Hot Standby (mémoire → IndexedDB). */
export async function loadStandby() {
  if (memStandby?.items?.length) return memStandby;
  try {
    const v = await idbGet();
    if (v?.items?.length) memStandby = v;
  } catch {}
  return memStandby;
}

/** Remplit le Hot Standby avec un lot prêt à afficher. */
export async function saveStandby(items) {
  if (!Array.isArray(items) || !items.length) return;
  memStandby = { items, ts: Date.now() };
  try { await idbSet(memStandby); } catch {}
}

/** Consomme le Hot Standby (permutation B → A). Retourne null si vide. */
export async function takeStandby() {
  const s = await loadStandby();
  if (!s?.items?.length) return null;
  memStandby = null;
  try { await idbSet(null); } catch {}
  return s;
}

export function hasStandbySync() {
  return Boolean(memStandby?.items?.length);
}

/** Cède la main au navigateur : le travail lourd ne gèle jamais l'affichage. */
export function yieldToUI() {
  return new Promise((r) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => r(), { timeout: 50 });
    else setTimeout(r, 0);
  });
}
