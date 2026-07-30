import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEnglishSpeechText } from '../lib/speakUtils.js';

test('extractEnglishSpeechText — Nettoie les titres d\'expression avec drapeaux et markdown', () => {
  const input = '# 🇬🇧 pick up where we left off.';
  const result = extractEnglishSpeechText(input);
  assert.equal(result, 'pick up where we left off.');
});

test('extractEnglishSpeechText — Separe la phrase anglaise de la traduction française (->)', () => {
  const input = '`Can you hear me clearly on this Zoom link?` -> *M\'entends-tu clairement sur ce lien Zoom ?*';
  const result = extractEnglishSpeechText(input);
  assert.equal(result, 'Can you hear me clearly on this Zoom link?');
});

test('extractEnglishSpeechText — Separe la phrase anglaise de la traduction française (↳)', () => {
  const input = '`Let\'s pick up where we left off.` ↳ *Reprenons là où on s\'était arrêtés.*';
  const result = extractEnglishSpeechText(input);
  assert.equal(result, 'Let\'s pick up where we left off.');
});

test('extractEnglishSpeechText — Nettoie les prefixes de contexte', () => {
  const input = 'Tech/Workflow : `Can you hear me?` ↳ *M\'entends-tu ?*';
  const result = extractEnglishSpeechText(input);
  assert.equal(result, 'Can you hear me?');
});
