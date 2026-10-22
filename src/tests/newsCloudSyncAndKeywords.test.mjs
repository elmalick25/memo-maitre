import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WATCH_KEYWORDS,
  loadWatchKeywords,
  saveWatchKeywords,
  matchWatchKeywords,
  isMajorEvent
} from '../lib/mustNotMiss.js';
import {
  sanitizeArticle,
  publishNewsToCloud,
  loadNewsFromCloud
} from '../lib/cloudNewsSync.js';

test('Watch keywords — charges les défauts si aucun mot-clé enregistré', () => {
  const dummyStorage = { get: () => null, set: () => {} };
  const loaded = loadWatchKeywords(dummyStorage);
  assert.deepEqual(loaded, DEFAULT_WATCH_KEYWORDS);
});

test('Watch keywords — sauvegarde et restaure une liste personnalisée de mots-clés', () => {
  let savedData = null;
  const dummyStorage = {
    get: () => savedData,
    set: (k, v) => { savedData = v; }
  };

  const custom = ['Claude 3.7', 'DeepSeek-R1', 'Sora', 'Tesla'];
  saveWatchKeywords(dummyStorage, custom);
  assert.ok(savedData, 'Les données doivent être persistées dans le stockage');

  const restored = loadWatchKeywords(dummyStorage);
  assert.deepEqual(restored, custom);
});

test('Watch keywords — détection dynamique avec liste personnalisée', () => {
  const custom = ['DeepSeek', 'Mistral'];
  const item = { title: 'Sortie du modèle DeepSeek V3', description: 'Une avancée majeure' };
  const matches = matchWatchKeywords(item, custom);
  assert.deepEqual(matches, ['DeepSeek']);
  assert.equal(isMajorEvent(item, custom), true);
});

test('cloudNewsSync — sanitizeArticle préserve bodyFr et allège la structure', () => {
  const article = {
    id: 'art-1',
    title: 'Découverte IA',
    titleFr: 'Découverte IA',
    description: 'Courte description',
    descriptionFr: 'Courte description',
    bodyFr: 'Texte intégral complet et structuré de plusieurs paragraphes.',
    score: 9.5,
    ts: 1700000000000,
    url: 'https://example.com/art-1'
  };

  const clean = sanitizeArticle(article);
  assert.equal(clean.id, 'art-1');
  assert.equal(clean.titleFr, 'Découverte IA');
  assert.equal(clean.bodyFr, 'Texte intégral complet et structuré de plusieurs paragraphes.');
  assert.equal(clean.score, 9.5);
});

test('cloudNewsSync — publishNewsToCloud et loadNewsFromCloud fonctionnent avec les mocks', async () => {
  let writtenData = null;
  const mockDeps = {
    db: {},
    getFbUser: () => 'user-test-123',
    auth: { currentUser: { uid: 'user-test-123' } },
    doc: (db, col, uid, sub, docId) => `${col}/${uid}/${sub}/${docId}`,
    setDoc: async (docRef, data) => {
      writtenData = data;
      return true;
    },
    getDoc: async () => ({
      exists: () => Boolean(writtenData),
      data: () => writtenData
    })
  };

  const items = [
    { id: '1', title: 'Titre 1', bodyFr: 'Contenu 1' },
    { id: '2', title: 'Titre 2', bodyFr: 'Contenu 2' }
  ];

  const publishOk = await publishNewsToCloud(items, 1700000000000, mockDeps);
  assert.equal(publishOk, true);
  assert.equal(writtenData.items.length, 2);
  assert.equal(writtenData.items[0].bodyFr, 'Contenu 1');

  const loaded = await loadNewsFromCloud(mockDeps);
  assert.ok(loaded);
  assert.equal(loaded.count, 2);
  assert.equal(loaded.items[1].id, '2');
});
