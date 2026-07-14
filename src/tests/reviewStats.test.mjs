// tests/reviewStats.test.mjs — vérifie que reviewStats.js lit correctement
// les expressions directement (plus de store séparé srs_data_v1).
// Lance : node --test src/tests/reviewStats.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSRSStats,
  getHeatmapData,
  getWeeklyStatsForClaude,
  formatTimeUntil,
  SCORE_BUTTONS,
} from '../lib/reviewStats.js';

const day = 24 * 60 * 60 * 1000;
const todayIso = () => new Date().toISOString().slice(0, 10);
const isoNDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

test('getSRSStats — comptage overdue / dueToday', () => {
  const now = Date.now();
  const exprs = [
    { id: 'a', front: 'a', nextReview: now - 2 * day, reviewHistory: [] },  // overdue
    { id: 'b', front: 'b', nextReview: now + 1 * 60 * 1000, reviewHistory: [] }, // today
    { id: 'c', front: 'c', nextReview: now + 10 * day, reviewHistory: [] },  // futur
  ];
  const s = getSRSStats(exprs);
  assert.equal(s.overdueCount, 1);
  assert.equal(s.dueTodayCount, 1);
  assert.equal(s.urgentCards[0].id, 'a');
  assert.ok(s.nextReviewMs > now);
});

test('getSRSStats — accepte nextReview au format ISO string', () => {
  const s = getSRSStats([
    { id: 'x', front: 'x', nextReview: isoNDaysAgo(3), reviewHistory: [] }
  ]);
  assert.equal(s.overdueCount, 1);
});

test('getSRSStats — tolère expressions vides / nulles', () => {
  const s = getSRSStats([null, undefined, {}, { id: 'ok' }]);
  assert.equal(s.allSorted.length, 1);
});

test('getHeatmapData — agrège reviewHistory par jour sur N jours', () => {
  const exprs = [
    { id: 'a', reviewHistory: [
      { date: todayIso(), q: 5 },
      { date: todayIso(), q: 3 },
      { date: isoNDaysAgo(2), q: 0 },
    ]},
    { id: 'b', reviewHistory: [
      { date: todayIso(), q: 1 },
    ]},
  ];
  const h = getHeatmapData(exprs, 7);
  assert.equal(h.length, 7);
  const today = h[h.length - 1];
  assert.equal(today.count, 3);
  assert.ok(Math.abs(today.avgScore - (5 + 3 + 1) / 3) < 1e-9);
  const d2 = h[h.length - 3];
  assert.equal(d2.count, 1);
  assert.equal(d2.avgScore, 0);
});

test('getHeatmapData — fallback sur `score` si `q` absent (compat rétro)', () => {
  const h = getHeatmapData(
    [{ id: 'a', reviewHistory: [{ date: todayIso(), score: 4 }] }],
    3
  );
  assert.equal(h[h.length - 1].count, 1);
  assert.equal(h[h.length - 1].avgScore, 4);
});

test('getWeeklyStatsForClaude — struggling trié par difficulty DESC (inverse SM-2)', () => {
  const exprs = [
    { id: '1', front: 'easy',   difficulty: 2, reviewHistory: [{ date: todayIso(), q: 5 }] },
    { id: '2', front: 'medium', difficulty: 5, reviewHistory: [{ date: todayIso(), q: 3 }] },
    { id: '3', front: 'hard',   difficulty: 9, reviewHistory: [{ date: todayIso(), q: 0 }] },
  ];
  const w = getWeeklyStatsForClaude(exprs);
  assert.equal(w.totalReviews, 3);
  assert.equal(w.activeDays, 1);
  // La fiche "hard" (difficulty haute) doit être en tête des struggling.
  assert.ok(w.struggling[0].includes('hard'));
  assert.ok(w.struggling[w.struggling.length - 1].includes('easy'));
  assert.equal(w.avgDifficulty, +((2 + 5 + 9) / 3).toFixed(2));
});

test('formatTimeUntil — cas limites', () => {
  assert.equal(formatTimeUntil(null), null);
  assert.equal(formatTimeUntil(Date.now() - 1000), 'maintenant');
  assert.match(formatTimeUntil(Date.now() + 30 * 60 * 1000), /min$/);
  assert.match(formatTimeUntil(Date.now() + 5 * 3600 * 1000), /h$/);
  assert.match(formatTimeUntil(Date.now() + 3 * day), /j$/);
});

test('SCORE_BUTTONS — 4 boutons avec q ∈ {0,1,3,5}', () => {
  assert.equal(SCORE_BUTTONS.length, 4);
  assert.deepEqual(SCORE_BUTTONS.map(b => b.score), [0, 1, 3, 5]);
});
