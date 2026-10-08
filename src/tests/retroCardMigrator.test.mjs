import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isUnmodernizedEnglishCard,
  getUnmodernizedEnglishCards,
  transformEnglishCardToModern,
  migrateEnglishCardsBatch
} from '../lib/retroCardMigrator.js';

test('retroCardMigrator — isUnmodernizedEnglishCard detects legacy cards like Image 1', () => {
  // Image 1: old mistake card with ❌ and undefined
  const cardImage1 = {
    id: 'exp-1',
    front: '❌ "the agriculture" → comment le dire correctement ?',
    back: "✅ undefined\n\n📌 Le mot 'agriculture' est un nom commun...",
    example: 'Agriculture is an important sector.',
    category: '🇬🇧 Anglais'
  };
  assert.equal(isUnmodernizedEnglishCard(cardImage1), true);

  // Simple old English card without modern semantic structure
  const simpleCard = {
    id: 'exp-2',
    front: 'Apple',
    back: 'Pomme',
    category: '🇬🇧 Anglais'
  };
  assert.equal(isUnmodernizedEnglishCard(simpleCard), true);

  // Fiche Nova sans format moderne d'Élite Coach : désormais prise en compte pour harmonisation
  const novaCard = {
    id: 'agent-123',
    _agentDetected: true,
    front: 'Can you hear me?',
    back: 'Contexte Live Nova',
    category: '🇬🇧 Anglais'
  };
  assert.equal(isUnmodernizedEnglishCard(novaCard), true);

  // Non-English card should NOT be picked
  const mathCard = {
    id: 'math-1',
    front: '2 + 2',
    back: '4',
    category: 'Mathématiques'
  };
  assert.equal(isUnmodernizedEnglishCard(mathCard), false);
});

test('retroCardMigrator — isUnmodernizedEnglishCard recognizes already modernized cards (Images 2-4)', () => {
  const modernCard = {
    id: 'exp-3',
    front: 'Which projects are you most proud of?',
    back: `Traduction : Quels sont les projets dont tu es le plus fier·e ?

### ⚙️ 1. Décomposition & Transition Métaphorique
* **Proud :** Sens physique : gonflement physique ➔ **Glissement sémantique :** satisfaction
* **Le Modèle Mental :** L'image mécanique

### 🔍 2. Comparatif (Pourquoi A et pas B ?)
* **Option A :** Option A
* **Option B :** Option B

### ⚠️ 3. Anti-Pattern (Le piège)
* **Erreur :** "I'm the most proud..." ➔ **Problème :** Compétition entre soi-même

### 💻 4. Exemples (Format court)
* **Tech/Workflow :** \`Which projects...\` ↳ *Trad*`,
    example: 'Which projects are you most proud of?',
    category: '🇬🇧 Anglais'
  };

  assert.equal(isUnmodernizedEnglishCard(modernCard), false);
});

test('retroCardMigrator — getUnmodernizedEnglishCards filters properly and returns empty when complete', () => {
  const list = [
    { id: '1', front: '❌ "run" → comment le dire correctement ?', category: '🇬🇧 Anglais' },
    {
      id: '2',
      front: 'Proud',
      back: 'Décomposition & Transition Métaphorique ... Anti-Pattern ... Exemples',
      category: '🇬🇧 Anglais'
    },
    { id: '3', front: 'Bonjour', back: 'Hello', category: 'Espagnol' }
  ];

  const unmodernized = getUnmodernizedEnglishCards(list);
  assert.equal(unmodernized.length, 1);
  assert.equal(unmodernized[0].id, '1');

  // When all are modernized
  assert.deepEqual(getUnmodernizedEnglishCards([list[1], list[2]]), []);
});

test('retroCardMigrator — transformEnglishCardToModern cleans front and enriches back', async () => {
  const legacyCard = {
    id: 'exp-crop',
    front: '❌ "the agriculture" → comment le dire correctement ?',
    back: "✅ undefined\n\n📌 Le mot 'agriculture' est un nom commun...",
    example: 'Agriculture is an important sector.',
    category: '🇬🇧 Anglais'
  };

  const mockCallClaude = async () => ({
    text: JSON.stringify({
      front: 'Agriculture',
      back: `Traduction : L'agriculture

### ⚙️ 1. Décomposition & Transition Métaphorique
* **Agriculture :** Sens physique : culture du champ ➔ **Glissement sémantique :** secteur agricole
* **Le Modèle Mental :** Notion abstraite non dénombrable

### 🔍 2. Comparatif (Pourquoi A et pas B ?)
* **Option A (Agriculture) :** Concept général sans 'the'
* **Option B (The agriculture) :** Calque du français

### ⚠️ 3. Anti-Pattern (Le piège)
* **Erreur :** Dire "the agriculture" ➔ **Problème :** Faux calque

### 💻 4. Exemples (Format court)
* **Tech / Workflow :** \`Agriculture uses satellite imaging.\` ↳ *L'agriculture utilise l'imagerie satellite.*`,
      example: 'Agriculture is essential for modern economy.'
    })
  });

  const updated = await transformEnglishCardToModern(legacyCard, mockCallClaude);
  assert.equal(updated.front, 'Agriculture');
  assert.equal(updated._retroEngineered, true);
  assert.equal(isUnmodernizedEnglishCard(updated), false);
});
