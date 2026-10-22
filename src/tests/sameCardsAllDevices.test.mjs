// Règle : le PC et le mobile doivent voir EXACTEMENT les mêmes fiches du jour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyEligiblePool } from '../lib/dailyEligiblePool.js';
import { buildDailyPlan } from '../lib/dailyPlan.js';

const TODAY = '2026-10-17';
const newCard = (i) => ({ id: `n${i}`, createdAt: `2026-09-${String(10 + i).padStart(2, '0')}`, nextReview: TODAY, reps: 0, reviewHistory: [] });
const shuffle = (arr) => [...arr].reverse().sort((a, b) => (a.id.length % 2) - (b.id.length % 2));

test('PC et mobile choisissent les mêmes fiches neuves malgré un ordre local différent', () => {
  const cards = Array.from({ length: 10 }, (_, i) => newCard(i));
  const pc = buildDailyEligiblePool({ dueCards: cards, budget: 3 }).map((c) => c.id);
  const mobile = buildDailyEligiblePool({ dueCards: shuffle(cards), budget: 3 }).map((c) => c.id);
  assert.deepEqual(mobile, pc);
});

test('le mobile garde les 45 fiches du plan scellé par le PC (aucune perdue)', () => {
  const cards = Array.from({ length: 60 }, (_, i) => newCard(i));
  const pcPool = buildDailyEligiblePool({ dueCards: cards, budget: 45 });
  const pcPlan = buildDailyPlan({ plan: null, dueCards: pcPool, todayISO: TODAY }).plan;
  const mobilePool = buildDailyEligiblePool({ dueCards: shuffle(cards), budget: 45, planIds: pcPlan.ids });
  const mobile = buildDailyPlan({ plan: pcPlan, dueCards: mobilePool, todayISO: TODAY });
  const pc = buildDailyPlan({ plan: pcPlan, dueCards: pcPool, todayISO: TODAY });
  assert.equal(mobile.remainingCount, pc.remainingCount);
  assert.deepEqual(mobile.remaining.map((c) => c.id).sort(), pc.remaining.map((c) => c.id).sort());
});
