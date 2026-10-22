// ☁️ cloudNewsSync.js — Synchronisation transparente des actualités tech sur Firestore

const COLLECTION_NAME = "users";
const SUB_COLLECTION = "tech_intel";
const DOC_ID = "latest";

let _fbDeps = null;
export async function getFirebaseDeps() {
  if (_fbDeps) return _fbDeps;
  try {
    const firestore = await import("firebase/firestore");
    const fb = await import("./firebase.js");
    _fbDeps = {
      doc: firestore.doc,
      getDoc: firestore.getDoc,
      setDoc: firestore.setDoc,
      db: fb.db,
      getFbUser: fb.getFbUser,
      auth: fb.auth,
    };
    return _fbDeps;
  } catch {
    return null;
  }
}

/**
 * Nettoie et allège un article pour un stockage cloud ultrarapide (< 400 Ko global).
 */
export function sanitizeArticle(a) {
  if (!a || !a.id) return null;
  return {
    id: String(a.id),
    source: String(a.source || ""),
    sourceName: String(a.sourceName || a.source || ""),
    title: String(a.title || ""),
    titleFr: String(a.titleFr || a.title || ""),
    description: String(a.description || "").slice(0, 1000),
    descriptionFr: String(a.descriptionFr || a.description || "").slice(0, 1000),
    url: String(a.url || ""),
    ts: Number(a.ts) || Date.now(),
    score: Number(a.score) || 0,
    lang: String(a.lang || "fr"),
    priority: Number(a.priority) || 2,
    isWorld: Boolean(a.isWorld),
    bodyFr: a.bodyFr ? String(a.bodyFr).slice(0, 3000) : "",
    ...(a.stars ? { stars: Number(a.stars) } : {}),
    ...(a.language ? { language: String(a.language) } : {}),
  };
}

/**
 * Publie les actualités rafraîchies sur Firestore.
 */
export async function publishNewsToCloud(items, ts = Date.now(), depsOverride = null) {
  try {
    const deps = depsOverride || (await getFirebaseDeps());
    if (!deps || !deps.db) return false;
    const uid = (deps.getFbUser && deps.getFbUser()) || deps.auth?.currentUser?.uid;
    if (!uid) return false;
    if (!Array.isArray(items) || items.length === 0) return false;

    // Limiter aux 250 meilleurs articles pour rester largement sous le quota Firestore (1 Mo)
    const cleanItems = items
      .map(sanitizeArticle)
      .filter(Boolean)
      .slice(0, 250);

    const docRef = deps.doc(deps.db, COLLECTION_NAME, uid, SUB_COLLECTION, DOC_ID);
    await deps.setDoc(docRef, {
      items: cleanItems,
      ts: ts || Date.now(),
      count: cleanItems.length,
      device: typeof navigator !== "undefined" && /mobi/i.test(navigator.userAgent) ? "mobile" : "desktop",
    }, { merge: true });

    console.info(`[cloudNewsSync] ☁️ ${cleanItems.length} actus synchronisées sur Firestore (uid: ${uid})`);
    return true;
  } catch (err) {
    console.warn("[cloudNewsSync] Échec publication Firestore:", err?.message || err);
    return false;
  }
}

/**
 * Récupère le dernier flux d'actualités synchronisé depuis Firestore.
 */
export async function loadNewsFromCloud(depsOverride = null) {
  try {
    const deps = depsOverride || (await getFirebaseDeps());
    if (!deps || !deps.db) return null;
    const uid = (deps.getFbUser && deps.getFbUser()) || deps.auth?.currentUser?.uid;
    if (!uid) return null;

    const docRef = deps.doc(deps.db, COLLECTION_NAME, uid, SUB_COLLECTION, DOC_ID);
    const snap = await deps.getDoc(docRef);
    if (!snap.exists()) return null;

    const data = snap.data();
    if (!Array.isArray(data?.items) || data.items.length === 0) return null;

    return {
      items: data.items,
      ts: Number(data.ts) || 0,
      count: data.items.length,
      device: data.device || "unknown",
    };
  } catch (err) {
    console.warn("[cloudNewsSync] Échec lecture Firestore:", err?.message || err);
    return null;
  }
}

