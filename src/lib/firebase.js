// src/lib/firebase.js
// Storage hybride : localStorage SYNCHRONE en premier (anti-perte de données).
// Firestore = backup asynchrone uniquement :
//   - LECTURE : une seule fois par session (bootstrap au login), jamais en arrière-plan
//   - ÉCRITURE : batchée, au plus 1×/60s (au lieu d'un write immédiat par set())
//   - CIRCUIT BREAKER : si quota Firestore dépassé (resource-exhausted), on coupe
//     Firestore pendant 24h et l'app continue avec localStorage seul (zéro perte,
//     juste une sync multi-appareils différée).
import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, getDoc, writeBatch, collection, addDoc, getDocs, query, where, updateDoc, increment, orderBy } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { logEvent } from "./telemetry";
// ─── Config Firebase ─────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// ─── FB_USER : getter dynamique (FIX clé — évite la capture statique) ────────
let _fbUser = localStorage.getItem("memo_user_uid") || "";
export const getFbUser = () => _fbUser;

export const setFbUser = (uid) => {
  const previousUid = localStorage.getItem("memo_user_uid");
  if (previousUid && previousUid !== uid) {
    console.warn(`[storage] Changement d'utilisateur détecté (${previousUid} -> ${uid}). Nettoyage des données locales.`);
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("memomaitre_")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem("memo_db_needs_reset", "true");
  }
  _fbUser = uid;
  localStorage.setItem("memo_user_uid", uid);
  // Nouveau login → on ré-autorise un bootstrap Firestore pour ce nouvel utilisateur.
  _bootstrappedKeys.clear();
  console.info("[firebase] FB_USER →", uid);
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);

// ─── Firestore avec Persistance Hors Ligne Activée ───────────────────────────
const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

export const db = initializeFirestore(firebaseApp, {
  localCache: isLocalhost
    ? undefined // évite les blocages IndexedDB en local avec Vite HMR
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const fbStorage = getStorage(firebaseApp);
export const auth = getAuth(firebaseApp);
export const provider = new GoogleAuthProvider();

// ─── Clés volumineuses → sharding activé ─────────────────────────────────────
const SHARDED_KEYS = new Set(["sessions_v3"]);
const CHUNK_SIZE = 100;
const LS_PREFIX = "memomaitre_";

const withTimeout = (promise, ms = 8000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase Timeout")), ms))
  ]);
};

// ══════════════════════════════════════════════════════════════════════════
// ─── CIRCUIT BREAKER ── coupe Firestore 24h si quota dépassé ────────────────
// ══════════════════════════════════════════════════════════════════════════
const CIRCUIT_KEY = "memo_circuit_breaker_until";
const CIRCUIT_BREAKER_DURATION_MS = 24 * 60 * 60 * 1000;

export const isCircuitOpen = () => {
  try {
    const until = parseInt(localStorage.getItem(CIRCUIT_KEY) || "0", 10);
    return Date.now() < until;
  } catch {
    return false;
  }
};

// Referme manuellement le disjoncteur (utilisé par la réparation de synchro :
// l'utilisateur demande explicitement une reconnexion à Firestore).
export const closeCircuitBreaker = () => {
  try {
    localStorage.removeItem(CIRCUIT_KEY);
    console.info('[circuit-breaker] Réarmé manuellement — Firestore réactivé.');
  } catch { /* ignore */ }
};

const tripCircuitBreaker = (reason) => {
  try {
    const until = Date.now() + CIRCUIT_BREAKER_DURATION_MS;
    localStorage.setItem(CIRCUIT_KEY, until.toString());
    console.warn(`[circuit-breaker] Firestore désactivé pour 24h (raison: ${reason}). L'app continue en localStorage seul.`);
    logEvent("circuit_breaker:tripped", { reason: String(reason).slice(0, 200) });
  } catch { /* ignore */ }
};

const isQuotaError = (err) => {
  const s = String(err?.code || err?.message || "");
  return s.includes("resource-exhausted") || s.includes("RESOURCE_EXHAUSTED") || s.includes("Quota exceeded");
};

// Rapporte une erreur Firestore : log + déclenche le disjoncteur si c'est un
// dépassement de quota (mais PAS pour un simple timeout réseau ponctuel).
export const reportFirestoreError = (err, context = "") => {
  console.warn(`[storage] Firestore erreur${context ? " (" + context + ")" : ""}:`, err?.message || err);
  logEvent("sync:fail", { context, error: err?.message || "unknown" });
  if (isQuotaError(err)) tripCircuitBreaker(err?.message || "resource-exhausted");
};

// ─── Helpers localStorage (source de vérité immédiate) ───────────────────────
const lsGet = (key) => {
  try {
    const r = localStorage.getItem(LS_PREFIX + key);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
};
const lsGetTs = (key) => {
  try {
    return parseInt(localStorage.getItem(LS_PREFIX + key + "_ts") || "0", 10);
  } catch {
    return 0;
  }
};
const lsSet = (key, val, ts = Date.now()) => {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(val));
    localStorage.setItem(LS_PREFIX + key + "_ts", ts.toString());
  } catch (e) {
    console.warn("[storage] localStorage plein ou indisponible:", e?.message);
  }
};

// ══════════════════════════════════════════════════════════════════════════
// ─── BOOTSTRAP-ONLY READS ── 1 lecture Firestore / clé / session max ────────
// ══════════════════════════════════════════════════════════════════════════
// Avant : chaque storage.get() re-vérifiait Firestore en arrière-plan (throttle
// 5 min/clé) → beaucoup de lectures cumulées sur toute l'app. Maintenant : on
// ne tente Firestore qu'une fois par clé par session (au bootstrap / login).
// Ensuite, storage.get() ne lit plus QUE localStorage (0 appel réseau).
const _bootstrappedKeys = new Set();

// Permet de forcer un re-pull manuel (ex: bouton "Synchroniser" dans l'UI).
export const forceSyncNow = () => {
  _bootstrappedKeys.clear();
  console.info("[storage] Prochain storage.get() re-vérifiera Firestore (sync manuelle demandée).");
};

// ─── Sharded GET ── 1 pull Firestore / session, sinon localStorage seul ─────
async function shardedGet(key) {
  const uid = getFbUser();
  if (!uid) return lsGet(key);

  const local = lsGet(key);

  if (isCircuitOpen()) return local;
  if (_bootstrappedKeys.has(key)) return local; // déjà tenté cette session → local uniquement
  _bootstrappedKeys.add(key);

  try {
    const idxSnap = await withTimeout(getDoc(doc(db, "users", uid, "data", key + "__index")));

    if (!idxSnap.exists()) {
      const oldSnap = await withTimeout(getDoc(doc(db, "users", uid, "data", key)));
      if (oldSnap.exists() && Array.isArray(oldSnap.data().value)) {
        const val = oldSnap.data().value;
        lsSet(key, val);
        return val;
      }
      return local;
    }

    const serverTs = idxSnap.data().updatedAt || 0;
    const localTs = lsGetTs(key);
    const isDirty = localStorage.getItem(LS_PREFIX + key + "_dirty") === "true";

    // Des modifs locales non-encore-envoyées priment toujours sur le serveur.
    if (isDirty || localTs >= serverTs) return local;

    const { chunkCount } = idxSnap.data();
    const chunkSnaps = await Promise.all(
      Array.from({ length: chunkCount }, (_, i) =>
        withTimeout(getDoc(doc(db, "users", uid, "data", key + "__chunk_" + i)))
      )
    );
    const result = chunkSnaps.flatMap((s) => (s.exists() ? s.data().value || [] : []));
    if (result.length > 0) {
      lsSet(key, result, serverTs);
      window.dispatchEvent(new CustomEvent("firebase_sync_updated", { detail: key }));
      return result;
    }
    return local;
  } catch (err) {
    reportFirestoreError(err, "shardedGet:" + key);
    return local;
  }
}

// ─── Sharded SET ── écrit en localStorage immédiatement, marque "dirty" ─────
// Le vrai envoi Firestore est fait par le flush batché périodique (60s), pas ici.
async function shardedSet(key, val) {
  if (!Array.isArray(val)) return simpleSet(key, val);

  const uid = getFbUser();
  const ts = Date.now();
  lsSet(key, val, ts);
  if (!uid) return;
  localStorage.setItem(LS_PREFIX + key + "_dirty", "true");
  scheduleFlush();
}

// Effectue réellement l'écriture chunkée en Firestore pour une clé shardée.
// Appelé uniquement par flushDirtyKeys() (écriture batchée périodique).
async function commitSharded(key, val, uid) {
  const oldIdxSnap = await getDoc(doc(db, "users", uid, "data", key + "__index"));
  const oldChunkCount = oldIdxSnap.exists() ? oldIdxSnap.data().chunkCount : 0;

  const cleanVal = JSON.parse(JSON.stringify(val));
  const chunks = [];
  for (let i = 0; i < cleanVal.length; i += CHUNK_SIZE) {
    chunks.push(cleanVal.slice(i, i + CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push([]);

  const ts = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid, "data", key + "__index"), {
    chunkCount: chunks.length,
    total: cleanVal.length,
    updatedAt: ts,
  });
  chunks.forEach((chunk, i) => {
    batch.set(doc(db, "users", uid, "data", key + "__chunk_" + i), {
      value: chunk,
      updatedAt: ts,
    });
  });
  for (let i = chunks.length; i < oldChunkCount; i++) {
    batch.delete(doc(db, "users", uid, "data", key + "__chunk_" + i));
  }
  await withTimeout(batch.commit(), 15000);
}

// ─── Simple GET ── 1 pull Firestore / session, sinon localStorage seul ─────
async function simpleGet(key) {
  const uid = getFbUser();
  if (!uid) return lsGet(key);

  const local = lsGet(key);

  if (isCircuitOpen()) return local;
  if (_bootstrappedKeys.has(key)) return local;
  _bootstrappedKeys.add(key);

  try {
    const snap = await withTimeout(getDoc(doc(db, "users", uid, "data", key)));
    if (!snap.exists()) return local;

    const serverTs = snap.data().updatedAt || 0;
    const localTs = lsGetTs(key);
    const isDirty = localStorage.getItem(LS_PREFIX + key + "_dirty") === "true";
    if (isDirty || localTs >= serverTs) return local;

    const val = snap.data().value !== undefined ? snap.data().value : null;
    if (val !== null) {
      lsSet(key, val, serverTs);
      window.dispatchEvent(new CustomEvent("firebase_sync_updated", { detail: key }));
      return val;
    }
    return local;
  } catch (err) {
    reportFirestoreError(err, "simpleGet:" + key);
    return local;
  }
}

// ─── Simple SET ── écrit en localStorage immédiatement, marque "dirty" ─────
async function simpleSet(key, val) {
  const uid = getFbUser();
  const ts = Date.now();
  lsSet(key, val, ts);
  if (!uid) return;
  localStorage.setItem(LS_PREFIX + key + "_dirty", "true");
  scheduleFlush();
}

// ══════════════════════════════════════════════════════════════════════════
// ─── ÉCRITURES BATCHÉES ── au plus 1 vague de writes Firestore / 60s ────────
// ══════════════════════════════════════════════════════════════════════════
const WRITE_FLUSH_INTERVAL_MS = 60 * 1000;
let _flushTimer = null;
let _flushInFlight = false;

function scheduleFlush() {
  if (_flushTimer || _flushInFlight) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flushDirtyKeys().catch(() => {});
  }, WRITE_FLUSH_INTERVAL_MS);
}

// Parcourt toutes les clés "_dirty" en localStorage et les envoie à Firestore
// en une vague. S'arrête au premier échec (ex: quota) et réessaiera au
// prochain cycle — rien n'est perdu, tout reste disponible en localStorage.
export async function flushDirtyKeys() {
  if (_flushInFlight) return;
  if (isCircuitOpen()) return;
  const uid = getFbUser();
  if (!uid) return;

  const dirtyKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LS_PREFIX) && k.endsWith("_dirty") && localStorage.getItem(k) === "true") {
      dirtyKeys.push(k.slice(LS_PREFIX.length, -("_dirty".length)));
    }
  }
  if (!dirtyKeys.length) return;

  _flushInFlight = true;
  try {
    for (const key of dirtyKeys) {
      const val = lsGet(key);
      if (val === null) {
        localStorage.removeItem(LS_PREFIX + key + "_dirty");
        continue;
      }
      try {
        if (SHARDED_KEYS.has(key)) {
          await commitSharded(key, val, uid);
        } else {
          const cleanVal = JSON.parse(JSON.stringify(val));
          await withTimeout(setDoc(doc(db, "users", uid, "data", key), {
            value: cleanVal,
            updatedAt: Date.now(),
          }));
        }
        localStorage.removeItem(LS_PREFIX + key + "_dirty");
      } catch (err) {
        reportFirestoreError(err, "flush:" + key);
        break; // on retente au prochain cycle plutôt que d'insister maintenant
      }
    }
  } finally {
    _flushInFlight = false;
  }
}

// ─── API publique (inchangée pour les composants) ───────────────────────────
export const storage = {
  async get(key) {
    return SHARDED_KEYS.has(key) ? shardedGet(key) : simpleGet(key);
  },
  async set(key, val) {
    return SHARDED_KEYS.has(key) ? shardedSet(key, val) : simpleSet(key, val);
  },
};

// ─── Flush périodique + sur reconnexion + sur mise en arrière-plan ──────────
if (typeof window !== "undefined") {
  setInterval(() => { flushDirtyKeys().catch(() => {}); }, WRITE_FLUSH_INTERVAL_MS);

  window.addEventListener("online", () => {
    console.info("[storage] Retour en ligne détecté, flush des données en attente...");
    flushDirtyKeys().catch(() => {});
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // Best-effort : peut ne pas se terminer si l'onglet est vraiment fermé,
      // mais localStorage (source de vérité) est déjà à jour de toute façon.
      flushDirtyKeys().catch(() => {});
    }
  });
}

// ─── Utilitaire : recharger les données après changement d'utilisateur ────────
export const authReadyCallbacks = [];
export const onAuthReady = (cb) => authReadyCallbacks.push(cb);
export const triggerAuthReady = () => authReadyCallbacks.forEach((cb) => cb());

// ==========================================
// API ANNOTATIONS PUBLIQUES (COLLABORATIF)
// ==========================================
export const publicAnnotationsAPI = {
  async getPublicAnnotations(chapKey) {
    if (isCircuitOpen()) return [];
    try {
      const q = query(
        collection(db, "public_annotations"),
        where("chapterId", "==", chapKey),
        orderBy("votes", "desc")
      );
      const querySnapshot = await getDocs(q);
      const annotations = [];
      querySnapshot.forEach((docSnap) => {
        annotations.push({ id: docSnap.id, ...docSnap.data() });
      });
      return annotations;
    } catch (e) {
      reportFirestoreError(e, "getPublicAnnotations");
      return [];
    }
  },

  async addPublicAnnotation(chapKey, annotationData) {
    if (isCircuitOpen()) return null;
    try {
      const docRef = await addDoc(collection(db, "public_annotations"), {
        ...annotationData,
        chapterId: chapKey,
        userId: getFbUser(),
        votes: 1,
        createdAt: Date.now()
      });
      return docRef.id;
    } catch (e) {
      reportFirestoreError(e, "addPublicAnnotation");
      return null;
    }
  },

  async voteForAnnotation(annotationId) {
    if (isCircuitOpen()) return false;
    try {
      const annRef = doc(db, "public_annotations", annotationId);
      await updateDoc(annRef, {
        votes: increment(1)
      });
      return true;
    } catch (e) {
      reportFirestoreError(e, "voteForAnnotation");
      return false;
    }
  }
};
