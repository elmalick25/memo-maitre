// 📦 offlineArticles.js — Cache IndexedDB pour lecture des articles hors ligne
// Stocke : la liste RSS la plus récente, et pour chaque article son contenu
// extrait + l'analyse IA. Permet une lecture intégrale sans réseau.

const DB_NAME = "mm-offline-articles";
const DB_VERSION = 1;
const STORE_ARTICLES = "articles"; // keyPath=link
const STORE_META = "meta";         // key/value libre

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ARTICLES)) {
        db.createObjectStore(STORE_ARTICLES, { keyPath: "link" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(name, mode, fn) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const store = tx.objectStore(name);
      let result;
      Promise.resolve(fn(store)).then(r => { result = r; }).catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[offlineArticles] IDB error:", e);
    return null;
  }
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Liste RSS ────────────────────────────────────────────────────────────────
export async function saveArticleList(articles) {
  // articles[].pubDate peut être Date → sérialiser proprement
  const safe = (articles || []).map(a => ({
    ...a,
    pubDate: a?.pubDate instanceof Date ? a.pubDate.toISOString() : a?.pubDate,
  }));
  return withStore(STORE_META, "readwrite", store => {
    store.put(safe, "lastList");
    store.put(Date.now(), "lastListAt");
  });
}

export async function loadArticleList() {
  const list = await withStore(STORE_META, "readonly", store => reqToPromise(store.get("lastList")));
  if (!Array.isArray(list)) return [];
  // Re-hydrate Date pour rester compatible avec le composant existant
  return list.map(a => ({
    ...a,
    pubDate: a?.pubDate ? new Date(a.pubDate) : new Date(),
  }));
}

export async function loadArticleListMeta() {
  const meta = await withStore(STORE_META, "readonly", store => {
    const r1 = reqToPromise(store.get("lastList"));
    const r2 = reqToPromise(store.get("lastListAt"));
    return Promise.all([r1, r2]);
  });
  const [rawList, ts] = Array.isArray(meta) ? meta : [[], 0];
  const list = Array.isArray(rawList) ? rawList.map(a => ({
    ...a,
    pubDate: a?.pubDate ? new Date(a.pubDate) : new Date(),
  })) : [];
  return {
    items: list,
    lastListAt: typeof ts === "number" ? ts : 0,
  };
}

// ── Cache par article ────────────────────────────────────────────────────────
// payload : { article, content, analysis }
export async function saveArticleCache(link, payload) {
  if (!link) return;
  const record = {
    link,
    article: payload?.article || null,
    content: payload?.content || "",
    analysis: payload?.analysis || null,
    cachedAt: Date.now(),
  };
  // Normaliser la date dans l'article embarqué
  if (record.article?.pubDate instanceof Date) {
    record.article = { ...record.article, pubDate: record.article.pubDate.toISOString() };
  }
  return withStore(STORE_ARTICLES, "readwrite", store => store.put(record));
}

export async function loadArticleCache(link) {
  if (!link) return null;
  const rec = await withStore(STORE_ARTICLES, "readonly", store => reqToPromise(store.get(link)));
  if (!rec) return null;
  if (rec.article?.pubDate && typeof rec.article.pubDate === "string") {
    rec.article = { ...rec.article, pubDate: new Date(rec.article.pubDate) };
  }
  return rec;
}

export async function listCachedArticles() {
  return (await withStore(STORE_ARTICLES, "readonly", store => reqToPromise(store.getAll()))) || [];
}

export async function pruneOldArticles(maxAgeDays = 30) {
  const all = await listCachedArticles();
  const cutoff = Date.now() - maxAgeDays * 86400000;
  await withStore(STORE_ARTICLES, "readwrite", store => {
    for (const r of all) {
      if ((r.cachedAt || 0) < cutoff) store.delete(r.link);
    }
  });
}

export async function cacheStats() {
  const all = await listCachedArticles();
  return {
    count: all.length,
    withAnalysis: all.filter(r => r.analysis).length,
    lastListAt: await withStore(STORE_META, "readonly", store => reqToPromise(store.get("lastListAt"))),
  };
}

// ── Corps complets des articles pour consultation hors-ligne intégrale ────
export async function saveArticleBodies(bodiesMap) {
  if (!bodiesMap || typeof bodiesMap !== "object") return;
  return withStore(STORE_META, "readwrite", store => {
    store.put(bodiesMap, "allArticleBodies");
    store.put(Date.now(), "allArticleBodiesAt");
  });
}

export async function loadArticleBodies() {
  const bodies = await withStore(STORE_META, "readonly", store => reqToPromise(store.get("allArticleBodies")));
  return (bodies && typeof bodies === "object") ? bodies : {};
}

