import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEnglishCategory,
  isDefectiveEnglishCard,
  buildEnglishRestructureSystemPrompt,
  buildEnglishRestructureUserPayload,
  parseEnglishRestructureResponse,
} from '../lib/englishCardEngine.js';

test('englishCardEngine — isEnglishCategory détecte correctement la catégorie', () => {
  assert.equal(isEnglishCategory('🇬🇧 Anglais'), true);
  assert.equal(isEnglishCategory('English Practice'), true);
  assert.equal(isEnglishCategory('Code / Java'), false);
});

test('englishCardEngine — isDefectiveEnglishCard repère les fiches défectueuses', () => {
  // Cas 1 : "i want you believe that"
  assert.equal(isDefectiveEnglishCard({
    front: 'i want you believe that',
    back: 'Traduction : i want you believe that\nGlissement sémantique',
  }), true);

  // Cas 2 : Faux templating avec "widely used in modern workflows"
  assert.equal(isDefectiveEnglishCard({
    front: 'get over',
    back: 'In daily practice: "get over". Widely used in modern workflows.',
  }), true);

  // Cas 3 : Incohérence "who" + "The book"
  assert.equal(isDefectiveEnglishCard({
    front: 'who',
    back: 'The book that is on the table is mine.',
  }), true);

  // Cas 4 : Fiche propre et conforme
  assert.equal(isDefectiveEnglishCard({
    front: 'I want you to believe that',
    back: '📖 **Vrai sens :** Je veux que tu y croies\n💬 **Mini-dialogue :** ...',
  }), false);
});

test('englishCardEngine — parseEnglishRestructureResponse extrait proprement les données', () => {
  const rawJSON = JSON.stringify({
    front: 'I want you to believe that',
    back: '📖 **Vrai sens :** Je veux que tu y croies.\n\n🧩 **La Règle Réflexe :** Want + someone + TO + verb.\n\n💬 **Mini-dialogue :**\n* **A :** Do you think so?\n* **B :** Yes, and I want you to believe that!\n↳ Tu le penses ? — Oui, et je veux que tu y croies !\n\n⚠️ **Attention au piège :** Ne pas oublier le to.',
    example: 'I want you to believe that!',
  });

  const parsed = parseEnglishRestructureResponse(rawJSON, { front: 'i want you believe that' });
  assert.ok(parsed);
  assert.equal(parsed.front, 'I want you to believe that');
  assert.ok(parsed.back.includes('Vrai sens'));
  assert.ok(parsed.back.includes('Mini-dialogue'));
  assert.equal(parsed.example, 'I want you to believe that!');
});
