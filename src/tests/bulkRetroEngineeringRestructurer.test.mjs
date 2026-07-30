import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeCardToRetroEngineering, restructureSelectedCards } from '../lib/retroEngineeringRestructurer.js';

test('upgradeCardToRetroEngineering — Restructure le back d\'une fiche quand l\'IA renvoie du Markdown brut', async () => {
  const fakeCard = {
    id: 'c1',
    front: 'do you hear me',
    back: 'Ancienne explication vague',
    category: '🇬🇧 Anglais',
  };

  const mockCallClaudeMarkdown = async (system, user) => {
    return `Traduction : Est-ce que tu m'entends ?\n\n### ⚙️ 1. Décomposition & Transition Métaphorique\n* **Can :** Sens physique : *Capacité active* ➔ **Glissement sémantique :** Flux audio.\n* **Le Modèle Mental :** Test de ligne.\n\n### 🔍 2. Comparatif (Pourquoi A et pas B ?)\n* **Option A (Can you hear me?) :** Test de signal.\n* **Option B (Do you hear me?) :** Ordre autoritaire.\n\n### ⚠️ 3. Anti-Pattern (Le piège)\n* **Erreur :** Do you hear me? ➔ **Problème :** Inapproprié visio.\n\n### 💻 4. Exemples (Format court)\n* **Tech/Workflow :** \`Can you hear me?\` ↳ *M'entends-tu ?*`;
  };

  const updatedCard = await upgradeCardToRetroEngineering(fakeCard, mockCallClaudeMarkdown);

  assert.equal(updatedCard.id, 'c1');
  assert.equal(updatedCard.front, 'do you hear me');
  assert.equal(updatedCard.back.includes('Décomposition & Transition Métaphorique'), true);
  assert.equal(updatedCard.back.includes('Anti-Pattern'), true);
});

test('upgradeCardToRetroEngineering — Restructure le back quand l\'IA renvoie du JSON', async () => {
  const fakeCard = {
    id: 'c2',
    front: 'pick up where we left off',
    back: 'old back',
    category: '🇬🇧 Anglais',
  };

  const mockCallClaudeJSON = async (system, user) => {
    return JSON.stringify({
      back: `Traduction : Reprendre là où on s'est arrêté\n\n### ⚙️ 1. Décomposition & Transition Métaphorique\n* **Pick up :** Sens physique`
    });
  };

  const updatedCard = await upgradeCardToRetroEngineering(fakeCard, mockCallClaudeJSON);

  assert.equal(updatedCard.id, 'c2');
  assert.equal(updatedCard.back.includes('Décomposition & Transition Métaphorique'), true);
});

test('restructureSelectedCards — Ne compte que les cartes réellement modifiées', async () => {
  const cards = [
    { id: 'c1', front: 'pick up', back: 'old1', category: '🇬🇧 Anglais' },
    { id: 'c2', front: 'leave off', back: 'old2', category: '🇬🇧 Anglais' },
  ];

  let stateStore = [...cards];
  const mockSetExpressions = (updater) => {
    stateStore = typeof updater === 'function' ? updater(stateStore) : updater;
  };

  const mockCallClaude = async (sys, user) => {
    return `Traduction : Court\n\n### ⚙️ 1. Décomposition & Transition Métaphorique\n* **Test :** Sens physique ➔ Glissement sémantique`;
  };

  const count = await restructureSelectedCards({
    selectedCards: cards,
    setExpressions: mockSetExpressions,
    callClaude: mockCallClaude,
  });

  assert.equal(count, 2);
  assert.equal(stateStore[0].back.includes('Décomposition & Transition Métaphorique'), true);
  assert.equal(stateStore[1].back.includes('Décomposition & Transition Métaphorique'), true);
});

// Régression : MemoMaster stocke selectedCards sous forme d'IDs (strings).
// Avant le fix, ces IDs étaient passés tels quels comme "cartes" → l'IA
// recevait du vide et le bouton "Restructurer" semblait ne rien faire.
test('restructureSelectedCards accepte des IDs et résout les cartes', async () => {
  const allCards = [
    { id: 'a', front: 'break the ice', back: 'vieux back' },
    { id: 'b', front: 'hit the road', back: 'vieux back' },
  ];
  let state = allCards;
  const callClaude = async (_sys, user) => {
    assert.ok(user.includes('break the ice') || user.includes('hit the road'));
    return JSON.stringify({ back: 'NOUVEAU BACK RESTRUCTURÉ ' + Date.now() });
  };
  const count = await restructureSelectedCards({
    selectedCards: ['a', 'b'],
    allCards,
    setExpressions: (fn) => { state = fn(state); },
    callClaude,
  });
  assert.equal(count, 2);
  assert.ok(state.every(c => c.back.startsWith('NOUVEAU BACK')));
});

test('restructureSelectedCards gère une réponse objet {text}', async () => {
  const allCards = [{ id: 'a', front: 'x', back: 'old' }];
  let state = allCards;
  const callClaude = async () => ({ text: JSON.stringify({ back: 'from object' }), sources: [] });
  const count = await restructureSelectedCards({
    selectedCards: ['a'],
    allCards,
    setExpressions: (fn) => { state = fn(state); },
    callClaude,
  });
  assert.equal(count, 1);
  assert.equal(state[0].back, 'from object');
});
