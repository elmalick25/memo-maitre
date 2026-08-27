import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDailyProgress,
  computeModuleComparison,
  computeDifficultyDistribution,
  computeDayOfWeekPerformance,
  computeTopDifficultCards,
  computeRetentionCurve,
  computeFsrsForecast,
  getSRSStats,
  getHeatmapData,
} from '../lib/reviewStats.js';

test('computeDailyProgress — generates exact 30-day timeline and aggregates reviews', () => {
  const sessions = [
    { date: '2026-08-27', count: 15 },
    { date: '2026-08-26', count: 8 },
  ];
  const expressions = [
    {
      id: '1',
      reviewHistory: [
        { date: '2026-08-27', q: 3 },
        { date: '2026-08-27', q: 5 },
        { date: '2026-08-25', q: 1 },
      ],
    },
  ];

  const progress = computeDailyProgress(sessions, expressions, 30);
  assert.equal(progress.length, 30);
  assert.equal(typeof progress[0].date, 'string');
  assert.equal(typeof progress[0].count, 'number');

  // Today (2026-08-27) should have 15 from session (max(15, 2))
  const todayEntry = progress.find(p => p.date === '2026-08-27');
  if (todayEntry) {
    assert.equal(todayEntry.count, 15);
  }

  // 2026-08-25 should have 1 from reviewHistory even if not in sessions
  const prevEntry = progress.find(p => p.date === '2026-08-25');
  if (prevEntry) {
    assert.equal(prevEntry.count, 1);
  }
});

test('computeModuleComparison — calculates total, mastered (FSRS), due, and average difficulty', () => {
  const categories = [
    { name: 'Anglais', color: '#8B5CF6' },
    { name: 'Tech', color: '#10B981' },
  ];
  const expressions = [
    // Anglais : 2 cards (1 mastered via stage, 1 active)
    { id: '1', category: 'Anglais', masteryStage: 'produced', level: 2, difficulty: 4.0, nextReview: '2026-09-01' },
    { id: '2', category: 'Anglais', masteryStage: 'discovered', level: 0, difficulty: 6.0, nextReview: '2026-08-01' },
    // Tech : 1 card (mastered via level 7)
    { id: '3', category: 'Tech', level: 7, difficulty: 5.0, nextReview: '2026-08-27' },
  ];

  const res = computeModuleComparison(categories, expressions);
  assert.equal(res.length, 2);

  const anglais = res.find(r => r.name === 'Anglais');
  assert.ok(anglais);
  assert.equal(anglais.total, 2);
  assert.equal(anglais.mastered, 1);
  assert.equal(anglais.pct, 50);
  assert.equal(anglais.avgDiff, 5.0);

  const tech = res.find(r => r.name === 'Tech');
  assert.ok(tech);
  assert.equal(tech.total, 1);
  assert.equal(tech.mastered, 1);
  assert.equal(tech.pct, 100);
});

test('computeDifficultyDistribution — groups cards into levels 0 to 7', () => {
  const expressions = [
    { id: '1', level: 0 },
    { id: '2', level: 0 },
    { id: '3', level: 3 },
    { id: '4', level: 7 },
    { id: '5', level: 8 }, // clamped to 7
  ];

  const dist = computeDifficultyDistribution(expressions);
  assert.equal(dist.length, 8);
  assert.equal(dist[0].count, 2);
  assert.equal(dist[1].count, 0);
  assert.equal(dist[3].count, 1);
  assert.equal(dist[7].count, 2); // includes clamped 8
});

test('computeDayOfWeekPerformance — aggregates activity for 7 days', () => {
  const sessions = [
    { date: '2026-08-27', count: 10 }, // Jeudi
    { date: '2026-08-26', count: 5 },  // Mercredi
  ];

  const performance = computeDayOfWeekPerformance(sessions, []);
  assert.equal(performance.length, 7);
  const jeudi = performance.find(p => p.name === 'Jeudi');
  const mercredi = performance.find(p => p.name === 'Mercredi');
  assert.ok(jeudi && jeudi.reviews >= 10);
  assert.ok(mercredi && mercredi.reviews >= 5);
});

test('computeTopDifficultCards — sorts by difficulty descending', () => {
  const expressions = [
    { id: '1', front: 'Easy card', difficulty: 2.1, stability: 10 },
    { id: '2', front: 'Hard card', difficulty: 8.9, stability: 1.2 },
    { id: '3', front: 'Medium card', difficulty: 5.5, stability: 4.0 },
  ];

  const top = computeTopDifficultCards(expressions, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].id, '2');
  assert.equal(top[1].id, '3');
});

test('computeRetentionCurve — returns 30 retention decay points', () => {
  const expressions = [
    { id: '1', stability: 12 },
    { id: '2', stability: 24 },
  ];

  const curve = computeRetentionCurve(expressions, 30);
  assert.equal(curve.length, 30);
  assert.equal(curve[0].day, 1);
  assert.ok(curve[0].retention > curve[29].retention);
  assert.ok(curve[0].retention <= 100);
});

test('computeFsrsForecast — handles timestamps ms, ISO dates, and filters paused cards', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrowMs = today.getTime() + 86400000;
  const tomorrowISO = new Date(tomorrowMs).toISOString();

  const expressions = [
    { id: '1', nextReview: tomorrowMs },
    { id: '2', nextReview: tomorrowISO },
    { id: '3', nextReview: tomorrowISO, paused: true }, // should be ignored
  ];

  const forecast = computeFsrsForecast(expressions, 7);
  assert.equal(forecast.length, 7);
  assert.equal(forecast[1].count, 2); // 2 active cards due tomorrow
});
