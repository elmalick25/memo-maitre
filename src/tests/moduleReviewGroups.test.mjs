import test from 'node:test';
import assert from 'node:assert/strict';
import { getModuleReviewGroups, remainingToday } from '../lib/moduleReviewGroups.js';

const T = '2026-10-17';
const cards = [
  { id: 'a', front: 'x', reviewHistory: [{ date: T }] },
  { id: 'b', front: 'y', reviewHistory: [{ date: '2026-10-16' }] },
  { id: 'c', front: 'z', paused: true },
  { id: 'm1', source: 'user_error', front: 'e' },
  { id: 'm2', source: 'user_error', front: 'e2', reviewHistory: [{ date: T }] },
];

test('cards reviewed today drop out of the count', () => {
  assert.deepEqual(remainingToday(cards, T).map(c => c.id), ['b', 'm1']);
});

test('English module shows mistakes group with today-remaining count', () => {
  const g = getModuleReviewGroups(cards, { isEnglish: true, today: T });
  const m = g.find(x => x.key === 'mistakes');
  assert.equal(m.cards.length, 2);
  assert.equal(m.remaining.length, 1);
});
