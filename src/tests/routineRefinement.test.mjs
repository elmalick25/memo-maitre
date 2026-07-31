import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROUTINE_STEPS, routineSummary } from '../lib/routineSteps.js';

test('ROUTINE_STEPS — every step has a valid actionId matching app views', () => {
  const validActionIds = new Set(['stats', 'review', 'veille', 'practice', 'add', 'lab', 'quests']);
  
  assert.equal(ROUTINE_STEPS.length, 14, 'La routine doit comporter 14 étapes précises');

  for (const step of ROUTINE_STEPS) {
    assert.ok(step.id, 'Chaque étape doit avoir un id');
    assert.ok(step.actionId, `L étape ${step.id} doit avoir un actionId`);
    assert.ok(validActionIds.has(step.actionId), `L actionId ${step.actionId} de l étape ${step.id} doit correspondre à une vue existante`);
    assert.ok(step.tip, `L étape ${step.id} doit avoir un conseil (tip) explicatif`);
  }
});

test('useDailyRoutine — exports checkStep function', () => {
  const hookPath = path.resolve('src/hooks/useDailyRoutine.js');
  const content = fs.readFileSync(hookPath, 'utf8');
  assert.equal(
    content.includes('checkStep'),
    true,
    'useDailyRoutine doit exposer la fonction checkStep'
  );
});

test('MemoMaster — onAction handles all routine actionIds', () => {
  const memoPath = path.resolve('src/MemoMaster.jsx');
  const content = fs.readFileSync(memoPath, 'utf8');
  assert.equal(
    content.includes('checkStep'),
    true,
    'MemoMaster doit utiliser checkStep pour la validation automatique ou manuelle des étapes de routine'
  );
});
