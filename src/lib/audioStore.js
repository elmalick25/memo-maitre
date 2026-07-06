// audioStore.js — persistance partagée des Blobs audio (IndexedDB)
// Utilisé par Lab.jsx (import audio → fiche) ET MemoMaster.jsx (lecture en révision)
const DB_NAME = "lab_audio_db";
const STORE_NAME = "audio_blobs";

function initAudioDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponible"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function saveAudioBlob(id, blob) {
  try {
    const db = await initAudioDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("saveAudioBlob:", err);
  }
}

export async function getAudioBlob(id) {
  try {
    const db = await initAudioDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("getAudioBlob:", err);
    return null;
  }
}

export async function deleteAudioBlob(id) {
  try {
    const db = await initAudioDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("deleteAudioBlob:", err);
  }
}

// Résout une URL jouable depuis un audioId (IndexedDB) — object URL à révoquer par l'appelant.
export async function getAudioObjectUrl(id) {
  const blob = await getAudioBlob(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
