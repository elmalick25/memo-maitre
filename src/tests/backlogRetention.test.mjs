// tests/backlogRetention.test.mjs — Couche 8 (impact réel du plafond sur la rétention)
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateBacklogRetention } from '../lib/reviewStats.js';
import { fsrsR } from '../lib/fsrs.js';

test('couche8 : fiche pile à l\'heure (0j de retard) ⇒ R ≈ cible (0.9), non comptée si pas overdue', () => {
  // nextReview === today ⇒ overdueDays = 0 ⇒ exclue (pas en retard)
  const cards = [{ id: 'a', stability: 10, interval: 10, nextReview: '2026-07-30' }];
  const res = estimateBacklogRetention(cards, '2026-07-30');
  assert.equal(res.count, 0, 'une fiche non en retard ne doit pas compter dans le backlog');
});

test('couche8 : fiche en retard de plusieurs jours ⇒ R mesuré < 0.9 (cible)', () => {
  const cards = [{ id: 'b', stability: 10, interval: 10, nextReview: '2026-07-20' }]; // 10j de retard
  const res = estimateBacklogRetention(cards, '2026-07-30');
  assert.equal(res.count, 1);
  assert.equal(res.avgOverdueDays, 10);
  const expected = fsrsR(20, 10); // interval(10) + retard(10)
  assert.equal(res.avgRetention, +expected.toFixed(3));
  assert.ok(res.avgRetention < 0.9, 'la rétention réelle doit être sous la cible théorique de 90%');
});

test('couche8 : agrège plusieurs fiches et calcule le pire cas', () => {
  const cards = [
    { id: 'c', stability: 20, interval: 20, nextReview: '2026-07-29' }, // 1j retard, R proche de 0.9
    { id: 'd', stability: 5, interval: 5, nextReview: '2026-07-01' },   // 29j retard, R très bas
  ];
  const res = estimateBacklogRetention(cards, '2026-07-30');
  assert.equal(res.count, 2);
  assert.ok(res.worstRetention < res.avgRetention, 'le pire cas doit être inférieur à la moyenne');
});

test('couche8 : ignore les fiches sans stability connue (legacy)', () => {
  const cards = [{ id: 'e', interval: 5, nextReview: '2026-07-01' }];
  const res = estimateBacklogRetention(cards, '2026-07-30');
  assert.equal(res.count, 0);
  assert.equal(res.avgRetention, null);
});
