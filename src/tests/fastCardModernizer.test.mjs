import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fastModernizeNovaCard,
  fastModernizeEnglishCard,
  fastModernizeBatch,
  cleanRetroFront
} from '../lib/fastCardModernizer.js';
import { isNovaV8Format, getUnmigratedNovaCards } from '../lib/novaCardMigrator.js';
import { isUnmodernizedEnglishCard, getUnmodernizedEnglishCards } from '../lib/retroCardMigrator.js';

test('fastCardModernizer — cleans retro front with precision', () => {
  assert.equal(cleanRetroFront('❌ "the agriculture" → comment le dire correctement ?'), 'Agriculture');
  assert.equal(cleanRetroFront('❌ "to give up" → comment le dire correctement ?'), 'to give up');
  assert.equal(cleanRetroFront('Apple'), 'Apple');
});

test('fastCardModernizer — fastModernizeNovaCard converts instantly to compliant v8 format', () => {
  const oldNova = {
    id: 'nova-legacy-1',
    front: 'Can you hear me?',
    back: `Traduction : Est-ce que tu m'entends ?\n\n📌 PIÈGE : Ne pas dire do you hear me\n\n💬 EXEMPLES :\n• Can you hear me well?\n↳ Tu m'entends bien ?`,
    _agentDetected: true
  };

  const upgraded = fastModernizeNovaCard(oldNova);
  assert.equal(upgraded.front, 'Can you hear me?');
  assert.equal(upgraded._novaV8, true);
  assert.equal(isNovaV8Format(upgraded), true);
  assert.equal(getUnmigratedNovaCards([upgraded]).length, 0);
  assert.ok(upgraded.back.includes('### 🎙️ Contexte Live Nova'));
  assert.ok(upgraded.back.includes('* 🔴 **Tu as dit :**'));
  assert.ok(upgraded.back.includes('* 🟢 **En réalité, on dit :** "Can you hear me?" ✅'));
});

test('fastCardModernizer — fastModernizeEnglishCard converts legacy cards with undefined into modern semantic cards', () => {
  const legacyCard = {
    id: 'retro-legacy-1',
    front: '❌ "the agriculture" → comment le dire correctement ?',
    back: "✅ undefined\n\n📌 Le mot 'agriculture' est un nom commun...",
    example: 'Agriculture is an important sector.',
    category: '🇬🇧 Anglais'
  };

  const upgraded = fastModernizeEnglishCard(legacyCard);
  assert.equal(upgraded.front, 'Agriculture');
  assert.equal(upgraded._retroEngineered, true);
  assert.equal(isUnmodernizedEnglishCard(upgraded), false);
  assert.equal(getUnmodernizedEnglishCards([upgraded]).length, 0);
  assert.ok(upgraded.back.includes('### ⚙️ 1. Décomposition & Transition Métaphorique'));
  assert.ok(upgraded.back.includes('### 🔍 2. Comparatif'));
  assert.ok(upgraded.back.includes('### ⚠️ 3. Anti-Pattern'));
  assert.ok(upgraded.back.includes('### 💻 4. Exemples'));
});

test('fastCardModernizer — benchmark 1000 cards in under 50ms', () => {
  const dummyCards = Array.from({ length: 1000 }, (_, i) => ({
    id: `card-${i}`,
    front: `Expression ${i}`,
    back: `Traduction : Traduction ${i}\n📌 PIÈGE : Erreur ${i}`,
    _agentDetected: true,
    category: '🇬🇧 Anglais'
  }));

  const start = performance.now();
  const modernizedNova = fastModernizeBatch(dummyCards, 'nova');
  const duration = performance.now() - start;

  assert.equal(modernizedNova.length, 1000);
  assert.ok(duration < 100, `Execution took ${duration.toFixed(2)}ms (expected < 100ms)`);
  assert.equal(getUnmigratedNovaCards(modernizedNova).length, 0);
});
