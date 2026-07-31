// tests/focusMusicOffline.test.mjs
// Test runner natif Node (≥ 18) — aucune dépendance externe.
// Lance : node --test src/tests/focusMusicOffline.test.mjs
//
// Vérifie la playlist "Radio Focus" hors-ligne :
//  1. Catalogue : ≥ 10 pistes téléchargeables, licence renseignée, IDs uniques.
//  2. Les flux live sont bien marqués et exclus du hors-ligne.
//  3. downloadTrack stocke un blob et isTrackDownloaded le retrouve (lecture offline).
//  4. Téléchargement interrompu → rien n'est écrit en base.
//  5. Quota IndexedDB plein → erreur gérée proprement (pas de throw).
//  6. deleteTrack libère la place, getDownloadedSize reflète l'état.
//  7. getTrackObjectUrl privilégie le blob local, sinon retombe sur l'URL réseau.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Faux IndexedDB minimal (suffisant pour musicStore) ─────────────────────
function makeFakeIndexedDB() {
  const data = new Map();
  let quota = Infinity;
  const store = {
    put(blob, key) {
      const used = [...data.values()].reduce((s, b) => s + b.size, 0);
      if (used + blob.size > quota) {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      data.set(key, blob);
    },
    get(key) { return req(data.get(key) || undefined); },
    delete(key) { data.delete(key); },
    getAll() { return req([...data.values()]); },
    getAllKeys() { return req([...data.keys()]); },
  };
  function req(result) {
    const r = { result };
    queueMicrotask(() => r.onsuccess?.());
    return r;
  }
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = { objectStore: () => wrapped, oncomplete: null, onerror: null, onabort: null, error: null };
      const wrapped = {
        put(blob, key) {
          try { store.put(blob, key); queueMicrotask(() => tx.oncomplete?.()); }
          catch (e) { tx.error = e; queueMicrotask(() => tx.onerror?.()); }
        },
        get: store.get,
        delete(key) { store.delete(key); queueMicrotask(() => tx.oncomplete?.()); },
        getAll: store.getAll,
        getAllKeys: store.getAllKeys,
      };
      return tx;
    },
  };
  return {
    open() {
      const r = {};
      queueMicrotask(() => { r.result = db; r.onsuccess?.({ target: { result: db } }); });
      return r;
    },
    __data: data,
    __setQuota(v) { quota = v; },
  };
}

const fakeIdb = makeFakeIndexedDB();
globalThis.indexedDB = fakeIdb;
globalThis.Blob = globalThis.Blob || class { constructor(parts) { this.size = parts.reduce((s, p) => s + p.length, 0); } };
globalThis.URL.createObjectURL = () => 'blob:fake-url';
globalThis.URL.revokeObjectURL = () => {};

const {
  FOCUS_TRACKS, LIVE_STATIONS, OFFLINE_TRACKS, FOCUS_PLAYLIST, totalPlaylistBytes, formatBytes,
} = await import('../lib/musicLibrary.js');
const {
  downloadTrack, isTrackDownloaded, deleteTrack, getDownloadedSize, getTrackObjectUrl, listDownloadedIds, downloadAll,
} = await import('../lib/musicStore.js');

function mockFetch(bytes, { fail = false, abortAt = null } = {}) {
  globalThis.fetch = async () => {
    if (fail) throw new Error('network down');
    const chunk = new Uint8Array(bytes);
    let sent = false;
    return {
      ok: true,
      headers: { get: (h) => (h === 'content-length' ? String(bytes) : 'audio/mpeg') },
      body: {
        getReader: () => ({
          read: async () => {
            if (abortAt !== null) throw new Error('téléchargement interrompu');
            if (sent) return { done: true };
            sent = true;
            return { done: false, value: chunk };
          },
        }),
      },
      blob: async () => new Blob([chunk]),
    };
  };
}

beforeEach(() => { fakeIdb.__data.clear(); fakeIdb.__setQuota(Infinity); });

test('1. catalogue : ≥10 pistes hors-ligne, licences et IDs valides', () => {
  assert.ok(OFFLINE_TRACKS.length >= 10, `attendu ≥10 pistes, reçu ${OFFLINE_TRACKS.length}`);
  const ids = FOCUS_PLAYLIST.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'IDs dupliqués');
  for (const t of FOCUS_PLAYLIST) {
    assert.ok(t.license && t.license.length > 3, `licence manquante pour ${t.id}`);
    assert.ok(t.title && t.fileUrl && t.category, `champs manquants pour ${t.id}`);
  }
  for (const t of FOCUS_TRACKS) {
    assert.match(t.fileUrl, /^\/audio\/focus\/.+\.mp3$/);
  }
  assert.ok(totalPlaylistBytes() > 0);
  assert.match(formatBytes(2 * 1024 * 1024), /2\.0 Mo/);
});

test('2. flux live : marqués live et exclus du hors-ligne', async () => {
  assert.ok(LIVE_STATIONS.length >= 1);
  for (const s of LIVE_STATIONS) assert.equal(s.live, true);
  assert.ok(OFFLINE_TRACKS.every((t) => !t.live));
  const res = await downloadTrack(LIVE_STATIONS[0]);
  assert.equal(res.ok, false);
  assert.match(res.reason, /direct/);
});

test('3. téléchargement puis lecture hors-ligne', async () => {
  mockFetch(1000);
  const track = FOCUS_TRACKS[0];
  const seen = [];
  const res = await downloadTrack(track, (r) => seen.push(r));
  assert.equal(res.ok, true);
  assert.equal(await isTrackDownloaded(track.id), true);
  assert.ok(seen.at(-1) === 1, 'progression finale à 100%');
  const { url, offline } = await getTrackObjectUrl(track);
  assert.equal(offline, true);
  assert.equal(url, 'blob:fake-url');
  assert.equal(await getDownloadedSize(), 1000);
});

test('4. téléchargement interrompu → rien en base', async () => {
  mockFetch(1000, { abortAt: 0 });
  const track = FOCUS_TRACKS[1];
  const res = await downloadTrack(track);
  assert.equal(res.ok, false);
  assert.equal(await isTrackDownloaded(track.id), false);
});

test('5. quota IndexedDB plein → erreur propre', async () => {
  mockFetch(5000);
  fakeIdb.__setQuota(100);
  const res = await downloadTrack(FOCUS_TRACKS[2]);
  assert.equal(res.ok, false);
  assert.match(res.reason, /quota/i);
});

test('6. suppression et taille utilisée', async () => {
  mockFetch(400);
  await downloadTrack(FOCUS_TRACKS[0]);
  await downloadTrack(FOCUS_TRACKS[1]);
  assert.equal((await listDownloadedIds()).length, 2);
  assert.equal(await getDownloadedSize(), 800);
  await deleteTrack(FOCUS_TRACKS[0].id);
  assert.equal(await isTrackDownloaded(FOCUS_TRACKS[0].id), false);
  assert.equal(await getDownloadedSize(), 400);
});

test('7. fallback réseau quand la piste n\'est pas téléchargée', async () => {
  const { url, offline } = await getTrackObjectUrl(FOCUS_TRACKS[3]);
  assert.equal(offline, false);
  assert.equal(url, FOCUS_TRACKS[3].fileUrl);
});

test('8. downloadAll télécharge toute la playlist', async () => {
  mockFetch(200);
  const res = await downloadAll(OFFLINE_TRACKS);
  assert.equal(res.ok, true, JSON.stringify(res.failed));
  assert.equal((await listDownloadedIds()).length, OFFLINE_TRACKS.length);
});
