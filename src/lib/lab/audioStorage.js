const DB_NAME = "lab_audio_db";
const STORE_NAME = "audio_blobs";
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact(mode, operation) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error("Enregistrement audio interrompu."));
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export const saveAudioBlob = (id, blob) => transact("readwrite", store => store.put(blob, id));
export const getAudioBlob = id => transact("readonly", store => store.get(id));
export const deleteAudioBlob = id => transact("readwrite", store => store.delete(id));
