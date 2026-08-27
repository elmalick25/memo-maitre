import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES, SLASH_COMMANDS } from '../constants/cardTypes.js';
import { playSound } from '../utils/soundEffects.js';

test('CARD_TYPES — contient les types obligatoires avec id, label, icon', () => {
  assert.ok(Array.isArray(CARD_TYPES));
  assert.ok(CARD_TYPES.length >= 10);
  const ids = new Set(CARD_TYPES.map(c => c.id));
  assert.ok(ids.has('qa'));
  assert.ok(ids.has('code'));
  assert.ok(ids.has('definition'));
  assert.ok(ids.has('concept'));
  assert.ok(ids.has('cloze'));
});

test('SLASH_COMMANDS — contient les commandes d\'aide à la rédaction', () => {
  assert.ok(Array.isArray(SLASH_COMMANDS));
  const ids = new Set(SLASH_COMMANDS.map(c => c.id));
  assert.ok(ids.has('reformuler'));
  assert.ok(ids.has('expliquer'));
  assert.ok(ids.has('analogie'));
  assert.ok(ids.has('mermaid'));
});

test('playSound — ne lève aucune exception dans un environnement sans WebAudio', () => {
  assert.doesNotThrow(() => {
    playSound('whoosh');
    playSound('clack');
    playSound('unknown');
  });
});
