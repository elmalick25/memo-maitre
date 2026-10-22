import test from 'node:test';
import assert from 'node:assert/strict';
import { stabilizeNewsTimestamps } from '../lib/newsFirstSeen.js';
const DAY = 86400000, now = 10 * DAY;
test('an article seen days ago keeps its original date on refresh', () => {
  const first = stabilizeNewsTimestamps([{ url: 'https://x.com/a', ts: now - 3 * DAY }], {}, now - 3 * DAY);
  const again = stabilizeNewsTimestamps([{ url: 'https://x.com/a?utm=1', ts: now }], first.map, now);
  assert.equal(again.items[0].ts, now - 3 * DAY);
});
test('future dates are clamped to now', () => {
  assert.equal(stabilizeNewsTimestamps([{ url: 'u', ts: now + DAY }], {}, now).items[0].ts, now);
});
