import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityScore, isVisibleByAge, sortNews, dedupeWithCoverage, HOUR_MS } from '../lib/newsRanking.js';

const now = 1_800_000_000_000;
const DAY = 24 * HOUR_MS;

test('un article très populaire passe devant un article récent sans intérêt', () => {
  const hot = { id: 'a', score: 6, votes: 800, ts: now - 10 * HOUR_MS };
  const meh = { id: 'b', score: 6, ts: now - 1 * HOUR_MS };
  assert.equal(sortNews([meh, hot], { now })[0].id, 'a');
});

test('un sujet repris par 3 sources monte au-dessus du même sujet en une seule source', () => {
  const a = { id: 'a', score: 5, ts: now - 2 * HOUR_MS, sourceCount: 3 };
  const b = { id: 'b', score: 5, ts: now - 2 * HOUR_MS, sourceCount: 1 };
  assert.ok(qualityScore(a, now) > qualityScore(b, now));
});

test('excellent article non lu de 48 h reste visible, mais pas au-delà de 72 h', () => {
  const great = { score: 9, votes: 500, ts: now - 48 * HOUR_MS };
  assert.equal(isVisibleByAge(great, { ageLimit: DAY, now }), true);
  assert.equal(isVisibleByAge({ ...great, ts: now - 73 * HOUR_MS }, { ageLimit: DAY, now }), false);
  assert.equal(isVisibleByAge(great, { ageLimit: DAY, now, read: true }), false);
});

test('article moyen de plus de 24 h reste masqué', () => {
  assert.equal(isVisibleByAge({ score: 2, ts: now - 30 * HOUR_MS }, { ageLimit: DAY, now }), false);
});

test('la déduplication compte les sources distinctes', () => {
  const out = dedupeWithCoverage([
    { id: '1', url: 'https://x.com/a', title: 'OpenAI lance un nouveau modèle', source: 'HN' },
    { id: '2', url: 'https://y.com/b', title: 'OpenAI lance un nouveau modèle', source: 'Verge' },
    { id: '3', url: 'https://z.com/c', title: 'OpenAI lance un nouveau modèle', source: 'Wired' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].sourceCount, 3);
});

import { recordTaste, emptyTaste, tasteBoost, mustNotMiss } from '../lib/newsRanking.js';
import { parseAiScores, pickUnscored } from '../lib/newsAiScore.js';

test('goûts : une source souvent sauvegardée remonte, une source jetée descend', () => {
  let t = emptyTaste();
  t = recordTaste(t, { source: 'Wired' }, 'save', 'ia');
  t = recordTaste(t, { source: 'Wired' }, 'read', 'ia');
  t = recordTaste(t, { source: 'Spam' }, 'dismiss', 'deals');
  assert.equal(t.sources.Wired, 4);
  assert.equal(t.sources.Spam, -2);
  const a = { id: 'a', score: 5, ts: now, source: 'Wired', themeId: 'ia' };
  const b = { id: 'b', score: 5, ts: now, source: 'Spam', themeId: 'deals' };
  assert.equal(sortNews([b, a], { now, taste: t })[0].id, 'a');
});

test('goûts : le bonus est plafonné à ±4 points', () => {
  let t = emptyTaste();
  for (let k = 0; k < 50; k++) t = recordTaste(t, { source: 'X' }, 'save', 'ia');
  assert.equal(tasteBoost({ source: 'X', themeId: 'ia' }, t), 4);
});

test('note IA : un titre racoleur mal noté par l\'IA passe derrière', () => {
  const bait = { id: 'a', score: 9, aiScore: 1, ts: now };
  const real = { id: 'b', score: 4, aiScore: 9, ts: now };
  assert.equal(sortNews([bait, real], { now })[0].id, 'b');
  assert.deepEqual(parseAiScores('ok {"scores":{"a":7,"b":"12"}}'), { a: 7, b: 10 });
  assert.deepEqual(pickUnscored([{ id: 'a' }, { id: 'b' }], { a: 5 }).map(i => i.id), ['b']);
});

test('à ne pas rater : seulement les articles non lus à très haute note', () => {
  const top = { id: 'top', score: 10, votes: 1000, sourceCount: 3, ts: now };
  const avg = { id: 'avg', score: 4, ts: now };
  assert.deepEqual(mustNotMiss([avg, top], { now }).map(i => i.id), ['top']);
  assert.deepEqual(mustNotMiss([top], { now, readIds: new Set(['top']) }), []);
});

test('tri par note : une note de 8 est TOUJOURS au-dessus d une note de 4, même si le 4 a des votes et est plus récent', () => {
  // Article B : note 4/10 mais très récent (1h) et très populaire (200 votes)
  const b = { id: 'b_note4', score: 4, votes: 200, ts: now - 1 * HOUR_MS, sourceCount: 1 };
  // Article A : note 8/10 mais plus ancien (18h) et 0 votes
  const a = { id: 'a_note8', score: 8, votes: 0, ts: now - 18 * HOUR_MS, sourceCount: 1 };
  const sorted = sortNews([b, a], { now });
  assert.equal(sorted[0].id, 'a_note8', 'L article noté 8 doit être en haut');
  assert.equal(sorted[1].id, 'b_note4', 'L article noté 4 doit être en bas');
});


test('un favori reste visible jusqu\'à 72 h puis disparaît', () => {
  const opts = { ageLimit: DAY, now, saved: true, read: true };
  assert.equal(isVisibleByAge({ id: 'f', ts: now - 71 * HOUR_MS }, opts), true);
  assert.equal(isVisibleByAge({ id: 'f', ts: now - 73 * HOUR_MS }, opts), false);
});

import { isBreaking } from '../lib/newsRanking.js';
import { getArticleTheme } from '../lib/techIntelThemes.js';
test('un titre BREAKING récent passe devant un article ordinaire', () => {
  const b = { id: 'b', score: 5, title: 'BREAKING: major ceasefire signed', ts: now - 2 * HOUR_MS };
  const o = { id: 'o', score: 7, title: 'Nouveau smartphone', ts: now - 1 * HOUR_MS };
  assert.equal(isBreaking(b), true);
  assert.equal(sortNews([o, b], { now, mode: 'popular' }).length, 2);
  assert.ok(qualityScore(b, now) > qualityScore(o, now));
});
test('une actu géopolitique d\'une source mondiale est classée Monde', () => {
  assert.equal(getArticleTheme({ source: 'BBCWorld', title: 'Summit talks resume in Geneva' }).id, 'world');
});
