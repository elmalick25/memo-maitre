import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildDailyPlan,
  normalizeDailyPlan,
} from '../lib/dailyPlan.js';

const TODAY = '2026-08-02';

const mkCards = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    front: `f${i}`,
    category: 'Maths',
    level: 2,
    nextReview: '2026-08-01',
  }));

test('Daily Plan Mount Safety — transient empty dueCards does NOT wipe sealed plan ids', () => {
  const due = mkCards(200);
  const initial = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  assert.equal(initial.plan.ids.length, 45, 'initial plan has 45 cards');

  // Simulate mount race condition: expressions is temporarily [] before DB finishes loading
  const duringTransient = buildDailyPlan({
    plan: initial.plan,
    dueCards: [], // empty during initial React render
    todayISO: TODAY,
    reviewedTodayIds: [],
  });

  // The plan must NOT lose its sealed ids!
  assert.equal(
    duringTransient.plan.ids.length,
    45,
    'Plan ids must NOT be wiped out during transient empty dueCards'
  );

  // When cards finish loading:
  const afterLoad = buildDailyPlan({
    plan: duringTransient.plan,
    dueCards: due,
    todayISO: TODAY,
    reviewedTodayIds: [],
  });
  assert.equal(afterLoad.remainingCount, 45, 'All 45 cards remain due after cards load');
});

test('Daily Plan Mount Safety — auto-recovers if a plan was sealed with 0 cards while cards are due', () => {
  const due = mkCards(60);
  // Corrupted plan previously saved with empty ids:
  const corruptedPlan = {
    date: TODAY,
    target: 35,
    sealed: true,
    sealedAt: Date.now() - 3600000,
    ids: [],
    doneIds: [],
    bonusIds: [],
  };

  const recovered = buildDailyPlan({
    plan: corruptedPlan,
    dueCards: due,
    todayISO: TODAY,
    reviewedTodayIds: [], // 0 cards reviewed today
  });

  assert.equal(
    recovered.remainingCount > 0,
    true,
    'Must replenish cards when user has not reviewed cards today and due cards exist'
  );
  assert.equal(recovered.remainingCount, 35);
});

test('MemoMaster — guards dailyPlan persistence and dayState sync on loaded state', () => {
  const memoMasterPath = path.resolve('src/MemoMaster.jsx');
  const content = fs.readFileSync(memoMasterPath, 'utf8');

  // Verify loaded guard exists before dailyPlan state persistence
  const hasLoadedGuardInPlanEffect = /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(!loaded\)\s*return;[\s\S]*?setDailyPlanState/.test(content);
  assert.equal(
    hasLoadedGuardInPlanEffect,
    true,
    'MemoMaster must check if (!loaded) return before setting or persisting dailyPlanState'
  );

  // Verify loaded guard exists before Firestore dayState publication
  const hasLoadedGuardInPublish = /if\s*\(!uid\s*\|\|\s*!dayStateReadyRef\.current\s*\|\|\s*!loaded\)/.test(content);
  assert.equal(
    hasLoadedGuardInPublish,
    true,
    'MemoMaster must check !loaded before publishDayState'
  );
});
