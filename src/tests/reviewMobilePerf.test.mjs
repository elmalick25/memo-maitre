import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('Révision mobile — le chrono ne re-rend plus toute l\'app chaque seconde', () => {
  const memo = read('../MemoMaster.jsx');
  assert.equal(/setInterval\(\(\)\s*=>\s*\{\s*setSessionTimer\(t\s*=>\s*t\s*\+\s*1\)/.test(memo), false);
  const review = read('../components/ReviewEngineView.jsx');
  assert.equal(review.includes('function SessionClock'), true);
});

test('Révision mobile — le glissement de carte ne passe plus par un état React', () => {
  const review = read('../components/ReviewEngineView.jsx');
  assert.equal(review.includes('setSwipeX'), false);
  assert.equal(review.includes('ref={cardRef}'), true);
});

test('Pomodoro — le décompte ne vit plus dans l\'état de MemoMaster', () => {
  const hook = read('../hooks/usePomodoro.js');
  assert.equal(hook.includes('useSyncExternalStore'), true);
  assert.equal(hook.includes('setPomoTime((t) => t - 1)'), false);
});
