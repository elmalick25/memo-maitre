import test from 'node:test';
import assert from 'node:assert/strict';
import { triageModule, cardRetention, pickSentinels } from '../lib/memoryTriage.js';

const T = '2026-10-19';
const fragile = { id: 'f', stability: 2, lastReviewDate: '2026-10-09' };   // 10 j / S=2
const solid = { id: 's', stability: 60, lastReviewDate: '2026-09-09' };   // 40 j / S=60
const fresh = { id: 'n' };

test('a fragile card is riskier than an older solid one', () => {
  assert.ok(cardRetention(fragile, T) < cardRetention(solid, T));
});
test('rescue lists only red-zone cards', () => {
  const t = triageModule([fragile, solid, fresh], T);
  assert.deepEqual(t.rescue.map(c => c.id), ['f']);
  assert.equal(t.fresh.length, 1);
});
test('sentinels capped at n', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: i, stability: 1, lastReviewDate: '2026-10-01' }));
  assert.equal(pickSentinels(many, 4, T).length, 4);
});
