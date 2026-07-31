// 💾 musicStore.js — Cache hors-ligne des pistes "Radio Focus" (IndexedDB)
// Même pattern que lib/audioStore.js, mais base/store dédiés à la musique.

const DB_NAME = "focus_music_db";
const STORE_NAME = "focus_music_blobs";

function initMusicDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponible"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function isQuotaError(err) {
  return (
    err &&
    (err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22)
  );
}

async function putBlob(id, blob) {
  const db = await initMusicDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getBlob(id) {
  try {
    const db = await initMusicDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("musicStore.getBlob:", err);
    return null;
  }
}

export async function isTrackDownloaded(id) {
  const blob = await getBlob(id);
  return !!blob;
}

export async function listDownloadedIds() {
  try {
    const db = await initMusicDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("musicStore.listDownloadedIds:", err);
    return [];
  }
}

export async function deleteTrack(id) {
  try {
    const db = await initMusicDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (err) {
    console.error("musicStore.deleteTrack:", err);
    return false;
  }
}

/** Taille totale (octets) des pistes actuellement stockées hors-ligne. */
export async function getDownloadedSize() {
  try {
    const db = await initMusicDb();
    const blobs = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return blobs.reduce((sum, b) => sum + (b?.size || 0), 0);
  } catch (err) {
    console.error("musicStore.getDownloadedSize:", err);
    return 0;
  }
}

/**
 * Télécharge une piste et la stocke en Blob dans IndexedDB.
 * @param {{id:string, fileUrl:string, live?:boolean}} track
 * @param {(ratio:number)=>void} [onProgress] progression 0→1
 * @returns {Promise<{ok:boolean, reason?:string, bytes?:number}>}
 */
export async function downloadTrack(track, onProgress) {
  if (!track || !track.fileUrl) return { ok: false, reason: "piste invalide" };
  if (track.live) return { ok: false, reason: "flux en direct non téléchargeable" };
  try {
    const res = await fetch(track.fileUrl, { cache: "reload" });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

    const total = Number(res.headers.get("content-length")) || track.approxBytes || 0;
    let blob;

    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      // Téléchargement interrompu → l'erreur remonte, rien n'est écrit en base.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (onProgress && total) onProgress(Math.min(0.99, received / total));
      }
      blob = new Blob(chunks, { type: res.headers.get("content-type") || "audio/mpeg" });
    } else {
      blob = await res.blob();
    }

    if (!blob.size) return { ok: false, reason: "fichier vide" };

    await putBlob(track.id, blob);
    onProgress?.(1);
    return { ok: true, bytes: blob.size };
  } catch (err) {
    if (isQuotaError(err)) {
      console.error("musicStore.downloadTrack: quota IndexedDB dépassé", err);
      return { ok: false, reason: "Espace de stockage insuffisant (quota atteint)" };
    }
    console.error("musicStore.downloadTrack:", err);
    return { ok: false, reason: err?.message || "téléchargement interrompu" };
  }
}

/**
 * Télécharge toute la playlist hors-ligne.
 * @param {Array} tracks
 * @param {(info:{index:number,total:number,trackId:string,ratio:number})=>void} [onProgress]
 */
export async function downloadAll(tracks, onProgress) {
  const list = (tracks || []).filter((t) => !t.live);
  const failed = [];
  let bytes = 0;
  for (let i = 0; i < list.length; i++) {
    const track = list[i];
    if (await isTrackDownloaded(track.id)) {
      onProgress?.({ index: i + 1, total: list.length, trackId: track.id, ratio: 1 });
      continue;
    }
    const res = await downloadTrack(track, (ratio) =>
      onProgress?.({ index: i + 1, total: list.length, trackId: track.id, ratio })
    );
    if (res.ok) bytes += res.bytes || 0;
    else {
      failed.push({ id: track.id, reason: res.reason });
      // Quota plein : inutile de continuer.
      if (String(res.reason || "").includes("quota")) break;
    }
  }
  return { ok: failed.length === 0, failed, bytes };
}

/**
 * Renvoie une URL jouable pour une piste :
 * blob local en priorité (évite de re-télécharger), sinon URL réseau.
 * L'object URL renvoyé doit être révoqué par l'appelant (revokeObjectUrl).
 * @returns {Promise<{url:string|null, offline:boolean}>}
 */
export async function getTrackObjectUrl(track) {
  if (!track) return { url: null, offline: false };
  if (!track.live) {
    const blob = await getBlob(track.id);
    if (blob) return { url: URL.createObjectURL(blob), offline: true };
  }
  return { url: track.fileUrl || null, offline: false };
}

export function revokeObjectUrl(url) {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    }
  }
}
