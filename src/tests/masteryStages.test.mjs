// tests/masteryStages.test.mjs
// Vérifie le pipeline "discovered → recognized → recalled → produced → mastered"
// et la fonction recordProductiveUse (pure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMasteryStage,
  recordProductiveUse,
  getDistinctProductiveContexts,
  getExpressionsNeedingProduction,
  ensureMasteryStage,
} from '../lib/masteryStages.js';

test('discovered : fiche neuve sans révision', () => {
  assert.equal(computeMasteryStage({ repetitions: 0, interval: 0 }), 'discovered');
});

test('recognized : au moins une révision', () => {
  assert.equal(computeMasteryStage({ repetitions: 1, interval: 1 }), 'recognized');
});

test('recalled : repetitions>=2 et interval>=5, aucun usage productif', () => {
  assert.equal(computeMasteryStage({ repetitions: 3, interval: 7 }), 'recalled');
});

test('produced : un usage productif correct suffit', () => {
  const e = recordProductiveUse({ repetitions: 3, interval: 7 }, { context: 'voice', correct: true });
  assert.equal(e.masteryStage, 'produced');
  assert.equal(e.productiveUses.length, 1);
});

test('un usage productif INCORRECT ne fait pas progresser vers produced', () => {
  const e = recordProductiveUse({ repetitions: 3, interval: 7 }, { context: 'voice', correct: false });
  assert.equal(e.masteryStage, 'recalled');
});

test('mastered : 2 usages corrects, 2 contextes distincts, > 48h d\'écart', () => {
  const base = { repetitions: 5, interval: 20 };
  const t0 = new Date('2026-01-01T10:00:00Z').toISOString();
  const t1 = new Date('2026-01-04T10:00:00Z').toISOString(); // +3j
  let e = recordProductiveUse(base, { context: 'voice', correct: true, date: t0 });
  e = recordProductiveUse(e, { context: 'writing', correct: true, date: t1 });
  assert.equal(e.masteryStage, 'mastered');
});

test('PAS mastered si contexte identique répété', () => {
  const base = { repetitions: 5, interval: 20 };
  const t0 = new Date('2026-01-01T10:00:00Z').toISOString();
  const t1 = new Date('2026-01-04T10:00:00Z').toISOString();
  let e = recordProductiveUse(base, { context: 'voice', correct: true, date: t0 });
  e = recordProductiveUse(e, { context: 'voice', correct: true, date: t1 });
  assert.equal(e.masteryStage, 'produced');
});

test('PAS mastered si contextes distincts mais < 48h', () => {
  const base = { repetitions: 5, interval: 20 };
  const t0 = new Date('2026-01-01T10:00:00Z').toISOString();
  const t1 = new Date('2026-01-02T00:00:00Z').toISOString(); // +14h
  let e = recordProductiveUse(base, { context: 'voice', correct: true, date: t0 });
  e = recordProductiveUse(e, { context: 'writing', correct: true, date: t1 });
  assert.equal(e.masteryStage, 'produced');
});

test('getDistinctProductiveContexts ignore les usages incorrects', () => {
  const e = {
    productiveUses: [
      { context: 'voice', correct: true, date: 'x' },
      { context: 'chat',  correct: false, date: 'y' },
      { context: 'voice', correct: true, date: 'z' },
    ],
  };
  assert.deepEqual(getDistinctProductiveContexts(e).sort(), ['voice']);
});

test('getExpressionsNeedingProduction ne renvoie QUE des "recalled"', () => {
  const list = [
    { id: 'a', repetitions: 0 },                                          // discovered
    { id: 'b', repetitions: 1, interval: 1 },                             // recognized
    { id: 'c', repetitions: 3, interval: 7 },                             // recalled
    { id: 'd', repetitions: 5, interval: 20, productiveUses: [{ context: 'voice', correct: true, date: 'x' }] }, // produced
  ];
  const out = getExpressionsNeedingProduction(list);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'c');
});

test('ensureMasteryStage : préserve un stage existant, sinon calcule', () => {
  assert.equal(ensureMasteryStage({ repetitions: 3, interval: 7 }).masteryStage, 'recalled');
  assert.equal(ensureMasteryStage({ repetitions: 0, masteryStage: 'produced' }).masteryStage, 'produced');
});
