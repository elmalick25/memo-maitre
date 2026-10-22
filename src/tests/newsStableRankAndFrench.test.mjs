import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRankSnapshot, saveRankSnapshot } from '../lib/newsRankSnapshot.js';
import { sortNews, HOUR_MS } from '../lib/newsRanking.js';
import { guaranteeFrench } from '../lib/frenchNews.js';

const mem = () => { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v) }; };

test('le classement figé reste identique à la réouverture, même des heures plus tard', () => {
  const store = mem();
  const t0 = 1_800_000_000_000;
  const items = [
    { id: 'old-hot', score: 8, ts: t0 - 20 * HOUR_MS },
    { id: 'new-meh', score: 5, ts: t0 - 1 * HOUR_MS },
  ];
  saveRankSnapshot(store, { now: t0, taste: null, aiScores: {} });
  const first = sortNews(items, { now: loadRankSnapshot(store).now }).map(i => i.id);
  const later = sortNews(items, { now: loadRankSnapshot(store).now }).map(i => i.id);
  assert.deepEqual(later, first);
});

test('un texte anglais sans traduction possible n est jamais renvoyé', async () => {
  const en = 'The company said that this new feature will be available for all users from next week and they have been working on it.';
  const out = await guaranteeFrench(en, { aiFn: async () => 'Sorry, as an AI I cannot translate', timeoutMs: 50 });
  assert.equal(out, '');
});

test('l IA traduit en français quand le traducteur échoue', async () => {
  const en = 'The company said that this new feature will be available for all users from next week and they have been working on it.';
  const fr = "L'entreprise a indiqué que cette nouvelle fonction sera disponible pour tous les utilisateurs dès la semaine prochaine.";
  const out = await guaranteeFrench(en, { aiFn: async () => fr, timeoutMs: 50 });
  assert.equal(out, fr);
});
