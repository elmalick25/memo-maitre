import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNovaVoicePrompt } from '../lib/english/novaVoicePrompt.js';
import { pickRecurringMistakes } from '../lib/english/novaNaturalCorrection.js';

test('Nova bannit les formules robotiques et n\'impose plus le recast silencieux', () => {
  const p = buildNovaVoicePrompt({ level: 'B2' });
  assert.ok(p.includes('NATURAL HUMAN CORRECTION — ANTI-TEMPLATE'));
  assert.ok(p.includes('earlier you said'));          // listée comme interdite
  assert.ok(!p.includes('SILENT CORRECTION'));
  assert.ok(p.includes('never interrupt for language'));
});

test('Les fautes récurrentes sont transmises à Nova, la plus répétée en premier', () => {
  const m = pickRecurringMistakes([
    { front: 'make a decision', userMistake: 'take a decision', _source: 'user_error', lapses: 0 },
    { front: 'for two years', userMistake: 'since two years', _source: 'user_error', lapses: 3 },
    { front: 'hello', _source: 'coach_input' },
  ]);
  assert.equal(m.length, 2);
  assert.equal(m[0].right, 'for two years');
  const p = buildNovaVoicePrompt({ recurringMistakes: m });
  assert.ok(p.includes('"since two years" -> "for two years"'));
});
