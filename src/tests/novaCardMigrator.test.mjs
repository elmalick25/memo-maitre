import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNovaCard,
  isNovaV8Format,
  getUnmigratedNovaCards,
  transformNovaCardToV8,
  migrateNovaCardsBatch
} from '../lib/novaCardMigrator.js';

test('novaCardMigrator — isNovaCard detects all Nova cards across versions', () => {
  // Direct flag
  assert.equal(isNovaCard({ id: '1', _agentDetected: true }), true);
  assert.equal(isNovaCard({ id: '2', _source: 'user_error' }), true);
  assert.equal(isNovaCard({ id: 'agent-123', front: 'test' }), true);
  assert.equal(isNovaCard({ id: 'el-456', front: 'test' }), true);
  assert.equal(isNovaCard({ id: '3', category: 'Voice Coach' }), true);

  // Old prompt signature
  const oldBack = `Traduction : Entends-tu ?\n\n✅ QUAND L'UTILISER :\nEn visio.\n\n🎬 SENS DANS CE CONTEXTE :\nTechnique.\n\n💬 EXEMPLES :\n• Do you hear me?\n  🗣 dou you hir mi\n  ↳ Tu m'entends ?\n\n📌 PIÈGE : Ne pas dire do you hear me`;
  assert.equal(isNovaCard({ id: '99', back: oldBack }), true);

  // Standard non-Nova card
  assert.equal(isNovaCard({ id: 'standard-1', front: 'Bonjour', back: 'Hello', category: 'Général' }), false);
});

test('novaCardMigrator — isNovaV8Format differentiates old from new v8 structure', () => {
  const oldCard = {
    id: 'agent-1',
    front: 'Can you hear me?',
    back: `Traduction : Entends-tu ?\n\n✅ QUAND L'UTILISER :\n...`
  };
  assert.equal(isNovaV8Format(oldCard), false);

  const v8Card = {
    id: 'agent-2',
    front: 'Can you hear me?',
    back: `### 🎙️ Contexte Live Nova\n* 🔴 **Tu as dit :** "Do you hear me?" ❌\n* 🟢 **En réalité, on dit :** "Can you hear me?" ✅\n* 📖 **Traduction :** Est-ce que tu m'entends ?`
  };
  assert.equal(isNovaV8Format(v8Card), true);

  const v8Flagged = {
    id: 'agent-3',
    _novaV8: true
  };
  assert.equal(isNovaV8Format(v8Flagged), true);
});

test('novaCardMigrator — getUnmigratedNovaCards returns only unmigrated Nova cards', () => {
  const cards = [
    { id: 'c1', _agentDetected: true, back: 'Old format back' },
    { id: 'c2', _agentDetected: true, back: '### 🎙️ Contexte Live Nova\n* 🔴 **Tu as dit :** ...\n* 🟢 **En réalité, on dit :** ...' },
    { id: 'c3', front: 'Standard', back: 'Standard' },
    { id: 'agent-4', back: "✅ QUAND L'UTILISER : ...\n🎬 SENS DANS CE CONTEXTE : ..." }
  ];

  const unmigrated = getUnmigratedNovaCards(cards);
  assert.equal(unmigrated.length, 2);
  assert.equal(unmigrated[0].id, 'c1');
  assert.equal(unmigrated[1].id, 'agent-4');

  // Once all are migrated
  const allMigrated = [
    { id: 'c1', _novaV8: true },
    { id: 'c2', _novaV8: true },
    { id: 'c3', front: 'Standard' }
  ];
  assert.deepEqual(getUnmigratedNovaCards(allMigrated), []);
});

test('novaCardMigrator — transformNovaCardToV8 converts card cleanly via LLM response', async () => {
  const mockCallClaude = async () => ({
    text: JSON.stringify({
      front: 'Can you hear me?',
      back: `### 🎙️ Contexte Live Nova\n* 🔴 **Tu as dit :** "Do you hear me?" ❌\n* 🟢 **En réalité, on dit :** "Can you hear me?" ✅\n* 📖 **Traduction :** Est-ce que tu m'entends ?\n\n### 🔍 2. Comparatif (Pourquoi A et pas B ?)\n...`
    })
  });

  const card = {
    id: 'agent-10',
    front: 'Can you hear me?',
    back: 'Ancien format'
  };

  const upgraded = await transformNovaCardToV8(card, mockCallClaude);
  assert.equal(upgraded.front, 'Can you hear me?');
  assert.equal(upgraded._novaV8, true);
  assert.equal(isNovaV8Format(upgraded), true);
});

test('novaCardMigrator — migrateNovaCardsBatch updates state and reports progress', async () => {
  let updatedState = [];
  const setExpressions = (fn) => {
    updatedState = fn(initialCards);
  };

  const initialCards = [
    { id: 'agent-1', front: 'Old 1', back: 'Old format' },
    { id: 'agent-2', front: 'Old 2', back: 'Old format' },
    { id: 'std-1', front: 'Std', back: 'Std' }
  ];

  const mockCallClaude = async (_system, user) => {
    const isFirst = user.includes('Old 1');
    return JSON.stringify({
      front: isFirst ? 'Upgraded 1' : 'Upgraded 2',
      back: `### 🎙️ Contexte Live Nova\n* 🔴 **Tu as dit :** "..." ❌\n* 🟢 **En réalité, on dit :** "..." ✅\n* 📖 **Traduction :** ...`
    });
  };

  const progressSteps = [];
  const count = await migrateNovaCardsBatch({
    cards: initialCards,
    setExpressions,
    callClaude: mockCallClaude,
    onProgress: (cur, tot) => progressSteps.push([cur, tot]),
    showToast: () => {}
  });

  assert.equal(count, 2);
  assert.equal(updatedState.length, 3);
  assert.equal(updatedState[0].front, 'Upgraded 1');
  assert.equal(updatedState[1].front, 'Upgraded 2');
  assert.equal(isNovaV8Format(updatedState[0]), true);
  assert.equal(isNovaV8Format(updatedState[1]), true);
  assert.deepEqual(progressSteps, [[1, 2], [2, 2]]);
});
