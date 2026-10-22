import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnglishRestructureSystemPrompt,
  buildEnglishRestructureUserPayload,
  parseEnglishRestructureResponse
} from '../lib/englishCardEngine.js';
import { upgradeCardToRetroEngineering } from '../lib/retroEngineeringRestructurer.js';
import { isNovaMistakeCard } from '../lib/memoryLab.js';

test('englishCardVsNovaMistakeOptimization — Standard English card optimization does NOT produce or trigger Erreur Nova', async () => {
  const standardCard = {
    id: 'std-card-42',
    front: 'keep an eye on',
    back: 'Surveiller de près',
    example: 'Keep an eye on the oven.',
    category: '🇬🇧 Anglais',
  };

  // 1. User payload verification: standard card must NOT say "Fiche d'erreur de l'élève" or demand "Vous avez dit"
  const payload = buildEnglishRestructureUserPayload(standardCard);
  assert.equal(
    payload.includes("Fiche d'erreur de l'élève"),
    false,
    "Standard card payload should NOT declare that it is a student mistake"
  );
  assert.equal(
    payload.includes("DOIT débuter par : Vous avez dit"),
    false,
    "Standard card payload should NOT instruct the AI to start with 'Vous avez dit'"
  );
  assert.equal(
    payload.includes("Vous avez dit : «"),
    false,
    "Standard card payload should NOT include any student error quote"
  );

  // 2. Simulated LLM response that doesn't have "Vous avez dit"
  const mockCallClaude = async (system, user) => {
    // Assert system prompt guides both standard and error cards appropriately
    assert.equal(system.includes("Vous avez dit"), true);
    return JSON.stringify({
      front: 'Keep an eye on',
      back: `📖 **Vrai sens :** Surveiller attentivement ou garder un œil sur quelque chose.\n\n🧩 **La Règle Réflexe :** « Keep an eye on » s'utilise quand on exerce une vigilance continue et bienveillante, comme surveiller un plat sur le feu ou veiller sur quelqu'un.\n\n💬 **Mini-dialogue :**\n* **A :** \`Can you keep an eye on my bag while I grab a coffee?\`  \n  ↳ *Peux-tu garder un œil sur mon sac pendant que je prends un café ?*\n* **B :** \`Sure, no problem at all.\`  \n  ↳ *Bien sûr, aucun problème.*\n\n⚠️ **Attention au piège & Exception :**\n* 🚫 **Le piège :** Ne pas traduire mot à mot par « garder un œil sur » dans le sens physique d'avoir un globe oculaire.\n* ⚡ **L'exception / Nuance native :** Pour une surveillance plus formelle ou policière, les natifs emploient plutôt « monitor » ou « keep tabs on ».`,
      example: 'Can you keep an eye on my bag while I grab a coffee?'
    });
  };

  const upgraded = await upgradeCardToRetroEngineering(standardCard, mockCallClaude);

  // Must NOT be detected as Nova mistake card
  assert.equal(
    isNovaMistakeCard(upgraded),
    false,
    "Upgraded standard card must NOT be tagged or detected as an Erreur Nova card"
  );
  assert.equal(
    upgraded.back.includes("Vous avez dit"),
    false,
    "Standard card back must NOT contain 'Vous avez dit'"
  );
  assert.notEqual(upgraded._source, 'user_error');
  assert.notEqual(upgraded.source, 'user_error');
});

test('englishCardVsNovaMistakeOptimization — True Nova mistake card retains error correction flow and tag', async () => {
  const mistakeCard = {
    id: 'mistake-card-99',
    front: '❌ "I have 20 years" → comment le dire correctement ?',
    back: '🔴 **Tu as dit :** I have 20 years\n✅ **En réalité, on dit :** I am 20 years old',
    userMistake: 'I have 20 years',
    category: '🇬🇧 Anglais',
    source: 'user_error'
  };

  const payload = buildEnglishRestructureUserPayload(mistakeCard);
  assert.equal(
    payload.includes("Fiche d'erreur de l'élève"),
    true,
    "Mistake card payload MUST indicate student error"
  );
  assert.equal(
    payload.includes("I have 20 years"),
    true,
    "Mistake card payload MUST include the exact mistake"
  );

  const mockCallClaude = async (system, user) => {
    return JSON.stringify({
      front: 'I am 20 years old',
      back: `📖 **Vrai sens :** J'ai 20 ans.\n\n🧩 **La Règle Réflexe :** Vous avez dit : « I have 20 years ». En anglais, l'âge n'est pas une possession (« have ») mais un état d'être (« be »).\n\n💬 **Mini-dialogue :**\n* **A :** \`How old are you now?\`  \n  ↳ *Quel âge as-tu maintenant ?*\n* **B :** \`I am 20 years old today!\`  \n  ↳ *J'ai 20 ans aujourd'hui !*\n\n⚠️ **Attention au piège & Exception :**\n* 🚫 **Le piège :** Utiliser l'auxiliaire « have » par calque immédiat du français.\n* ⚡ **L'exception / Nuance native :** On peut dire simplement « I am 20 », mais jamais « I am 20 years » sans le mot « old ».`,
      example: 'I am 20 years old today!'
    });
  };

  const upgraded = await upgradeCardToRetroEngineering(mistakeCard, mockCallClaude);

  assert.equal(
    isNovaMistakeCard(upgraded),
    true,
    "Upgraded mistake card must stay marked as an Erreur Nova card"
  );
  assert.equal(
    upgraded.back.includes("Vous avez dit : « I have 20 years »"),
    true,
    "Mistake card back must preserve 'Vous avez dit : « I have 20 years »'"
  );
});

test('englishCardVsNovaMistakeOptimization — Accidental hallucinated "Vous avez dit" on a standard card is purged during parsing', () => {
  const standardCard = {
    id: 'std-2',
    front: 'get rid of',
    back: 'Se débarrasser de',
    category: '🇬🇧 Anglais',
  };

  // LLM mistakenly outputs "Vous avez dit : « to get rid of »" even though user never made an error
  const rawLlmResponse = {
    front: 'get rid of',
    back: `📖 **Vrai sens :** Se débarrasser de quelque chose.\n\n🧩 **La Règle Réflexe :** Vous avez dit : « to remove ». En anglais, « get rid of » est l'expression orale la plus naturelle.\n\n💬 **Mini-dialogue :**\n* **A :** \`I need to get rid of this old sofa.\`  \n  ↳ *Je dois me débarrasser de ce vieux canapé.*\n* **B :** \`Let's sell it online.\`  \n  ↳ *Vendons-le en ligne.*\n\n⚠️ **Attention au piège & Exception :**\n* 🚫 **Le piège :** Oublier la préposition « of ».\n* ⚡ **L'exception / Nuance native :** Familier : « chuck it » ou « bin it » en UK.`,
    example: 'I need to get rid of this old sofa.'
  };

  const parsed = parseEnglishRestructureResponse(rawLlmResponse, standardCard);

  assert.equal(
    parsed.back.includes("Vous avez dit"),
    false,
    "parseEnglishRestructureResponse must purge hallucinated 'Vous avez dit' for standard non-mistake cards"
  );
});
