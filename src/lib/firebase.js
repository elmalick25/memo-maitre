// src/lib/firebase.js
// Storage hybride : localStorage SYNCHRONE en premier (anti-perte de données),
// puis Firestore en arrière-plan. Sharding automatique pour les gros tableaux
// (limite Firestore = 1 MB par document).
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
// On ne stocke plus la valeur dans un export primitif figé au moment de l'import.
// Tous les accès passent par getFbUser() qui lit toujours la valeur courante.
let _fbUser = localStorage.getItem("memo_user_uid") || import.meta.env.VITE_OWNER_UID || "";
export const getFbUser = () => _fbUser;

// Compatibilité rétrograde supprimée : getFbUser() doit être utilisé exclusivement.

export const setFbUser = (uid) => {
  _fbUser = uid;
  localStorage.setItem("memo_user_uid", uid);
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

// ─── Sync Firebase en arrière-plan (sans bloquer le rendu) ────────────────────
// Appelé après avoir retourné localStorage pour mettre à jour silencieusement.
const _syncFirebaseBackground = (key, fetchFn) => {
  fetchFn().catch(() => {}); // erreurs silencieuses — l'app continue
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

// ─── Sharded GET ── localStorage-first ──────────────────────────────────────
async function shardedGet(key) {
  const uid = getFbUser();
  const local = lsGet(key);

  // 🚀 Si localStorage a déjà des données → retour immédiat, sync Firebase en background
  if (Array.isArray(local) && local.length > 0) {
    _syncFirebaseBackground(key, async () => {
      const idxSnap = await withTimeout(getDoc(doc(db, "users", uid, "data", key + "__index")));
      if (!idxSnap.exists()) return;
      
      const serverTs = idxSnap.data().updatedAt || 0;
      const localTs = lsGetTs(key);
      const isDirty = localStorage.getItem(LS_PREFIX + key + "_dirty") === "true";
      
      if (isDirty) {
        if (serverTs > localTs) {
          console.debug(`[storage] CONFLIT: Local dirty écrase un serveur plus récent pour ${key}. Backup serveur créé.`);
          const { chunkCount } = idxSnap.data();
          const chunkSnaps = await Promise.all(
            Array.from({ length: chunkCount }, (_, i) => withTimeout(getDoc(doc(db, "users", uid, "data", key + "__chunk_" + i))))
          );
          const result = chunkSnaps.flatMap((s) => (s.exists() ? s.data().value || [] : []));
          lsSet(key + "_conflict", result, serverTs);
        }
        console.info(`[storage] Modifications locales en attente pour ${key}, push vers Firebase (dirty flag)`);
        shardedSet(key, local);
      } else if (serverTs > localTs) {
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
        }
      } else if (localTs > serverTs) {
        console.info(`[storage] Local plus récent pour ${key}, push vers Firebase`);
        shardedSet(key, local);
      }
    });
    return local;
  }

  // Premier chargement (pas de localStorage) → attend Firebase
  try {
    const idxSnap = await withTimeout(getDoc(doc(db, "users", uid, "data", key + "__index")));

    if (!idxSnap.exists()) {
      // Migration ancienne donnée mono-document
      const oldSnap = await withTimeout(getDoc(doc(db, "users", uid, "data", key)));
      if (oldSnap.exists() && Array.isArray(oldSnap.data().value)) {
        const val = oldSnap.data().value;
        lsSet(key, val);
        return val;
      }
      return local;
    }

    const { chunkCount } = idxSnap.data();
    const chunkSnaps = await Promise.all(
      Array.from({ length: chunkCount }, (_, i) =>
        withTimeout(getDoc(doc(db, "users", uid, "data", key + "__chunk_" + i)))
      )
    );
    const result = chunkSnaps.flatMap((s) => (s.exists() ? s.data().value || [] : []));
    if (result.length > 0) lsSet(key, result);
    return result.length > 0 ? result : (local || []);
  } catch (err) {
    console.warn("[storage] shardedGet échoue → localStorage:", err?.message);
    logEvent("sync:fail", { context: "shardedGet", error: err?.message || "unknown" });
    return local || [];
  }
}

// ─── Sharded SET ─────────────────────────────────────────────────────────────
async function shardedSet(key, val) {
  if (!Array.isArray(val)) return simpleSet(key, val);

  const uid = getFbUser(); // ← toujours la valeur courante
  const ts = Date.now();
  lsSet(key, val, ts);
  localStorage.setItem(LS_PREFIX + key + "_dirty", "true");

  try {
    const oldIdxSnap = await getDoc(doc(db, "users", uid, "data", key + "__index"));
    const oldChunkCount = oldIdxSnap.exists() ? oldIdxSnap.data().chunkCount : 0;

    // 🔥 Nettoie les valeurs undefined qui font planter Firestore
    const cleanVal = JSON.parse(JSON.stringify(val));
    const chunks = [];
    for (let i = 0; i < cleanVal.length; i += CHUNK_SIZE) {
      chunks.push(cleanVal.slice(i, i + CHUNK_SIZE));
    }
    if (chunks.length === 0) chunks.push([]);

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

    await batch.commit();
    localStorage.removeItem(LS_PREFIX + key + "_dirty");
  } catch (err) {
    console.warn("[storage] shardedSet Firestore échoue (local OK):", err?.message);
    logEvent("sync:fail", { context: "shardedSet", error: err?.message || "unknown" });
  }
}

// ─── Simple GET ── localStorage-first ───────────────────────────────────────
async function simpleGet(key) {
  const uid = getFbUser();
  const local = lsGet(key);

  // 🚀 Si localStorage a déjà une valeur → retour immédiat, sync Firebase en background
  if (local !== null) {
    _syncFirebaseBackground(key, async () => {
      const snap = await withTimeout(getDoc(doc(db, "users", uid, "data", key)));
      if (snap.exists()) {
        const serverTs = snap.data().updatedAt || 0;
        const localTs = lsGetTs(key);
        const isDirty = localStorage.getItem(LS_PREFIX + key + "_dirty") === "true";
        
        if (isDirty) {
          if (serverTs > localTs) {
            console.debug(`[storage] CONFLIT: Local dirty écrase un serveur plus récent pour ${key}. Backup serveur créé.`);
            const val = snap.data().value !== undefined ? snap.data().value : null;
            if (val !== null) lsSet(key + "_conflict", val, serverTs);
          }
          console.info(`[storage] Local en attente pour ${key}, push vers Firebase (dirty flag)`);
          simpleSet(key, local);
        } else if (serverTs > localTs) {
          const val = snap.data().value !== undefined ? snap.data().value : null;
          if (val !== null) {
            lsSet(key, val, serverTs);
            window.dispatchEvent(new CustomEvent("firebase_sync_updated", { detail: key }));
          }
        } else if (localTs > serverTs) {
          console.info(`[storage] Local plus récent pour ${key}, push vers Firebase`);
          simpleSet(key, local);
        }
      }
    });
    return local;
  }

  // Premier chargement (pas de localStorage) → attend Firebase
  try {
    const snap = await withTimeout(getDoc(doc(db, "users", uid, "data", key)));
    if (snap.exists()) {
      const val = snap.data().value !== undefined ? snap.data().value : null;
      if (val !== null) lsSet(key, val);
      return val;
    }
    return null;
  } catch (err) {
    console.warn("[storage] simpleGet échoue → localStorage:", err?.message);
    logEvent("sync:fail", { context: "simpleGet", error: err?.message || "unknown" });
    return null;
  }
}

async function simpleSet(key, val) {
  const uid = getFbUser(); // ← toujours la valeur courante
  const ts = Date.now();
  lsSet(key, val, ts);
  localStorage.setItem(LS_PREFIX + key + "_dirty", "true");
  try {
    // 🔥 Nettoie les valeurs undefined qui font planter Firestore
    const cleanVal = JSON.parse(JSON.stringify(val));
    await setDoc(doc(db, "users", uid, "data", key), {
      value: cleanVal,
      updatedAt: ts,
    });
    localStorage.removeItem(LS_PREFIX + key + "_dirty");
  } catch (err) {
    console.warn("[storage] simpleSet Firestore échoue (local OK):", err?.message);
    logEvent("sync:fail", { context: "simpleSet", error: err?.message || "unknown" });
  }
}

// ─── API publique ────────────────────────────────────────────────────────────
export const storage = {
  async get(key) {
    return SHARDED_KEYS.has(key) ? shardedGet(key) : simpleGet(key);
  },
  async set(key, val) {
    return SHARDED_KEYS.has(key) ? shardedSet(key, val) : simpleSet(key, val);
  },
};

// ─── Synchronisation automatique au retour en ligne ──────────────────────────
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.info("[storage] Retour en ligne détecté, synchronisation des données en attente...");
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LS_PREFIX) && key.endsWith("_dirty") && localStorage.getItem(key) === "true") {
        const dataKey = key.slice(LS_PREFIX.length, -("_dirty".length));
        const localData = lsGet(dataKey);
        if (localData !== null) {
          console.info(`[storage] Push automatique de ${dataKey} suite à reconnexion`);
          storage.set(dataKey, localData);
        }
      }
    }
  });
}


// ─── Utilitaire : recharger les données après changement d'utilisateur ────────
// Appelez cette fonction depuis AuthGate après setFbUser() pour forcer
// MemoMaster à recharger depuis le bon compte Firestore.
export const authReadyCallbacks = [];
export const onAuthReady = (cb) => authReadyCallbacks.push(cb);
export const triggerAuthReady = () => authReadyCallbacks.forEach((cb) => cb());

// ==========================================
// API ANNOTATIONS PUBLIQUES (COLLABORATIF)
// ==========================================
export const publicAnnotationsAPI = {
  async getPublicAnnotations(chapKey) {
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
      console.error("Erreur getPublicAnnotations:", e);
      return [];
    }
  },

  async addPublicAnnotation(chapKey, annotationData) {
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
      console.error("Erreur addPublicAnnotation:", e);
      return null;
    }
  },

  async voteForAnnotation(annotationId) {
    try {
      const annRef = doc(db, "public_annotations", annotationId);
      await updateDoc(annRef, {
        votes: increment(1)
      });
      return true;
    } catch (e) {
      console.error("Erreur voteForAnnotation:", e);
      return false;
    }
  }
};
