import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEnglishCategory,
  isDefectiveEnglishCard,
  isHesitationCard,
  buildEnglishRestructureSystemPrompt,
  buildEnglishRestructureUserPayload,
  parseEnglishRestructureResponse,
  reformatDialogueWithPerTurnTranslation,
  sanitizeEnglishPedagogy,
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

test('englishCardEngine — isDefectiveEnglishCard repère les fausses fiches de bégaiement ou hésitation', () => {
  assert.equal(isDefectiveEnglishCard({
    front: 'I can have more doors open',
    back: '🧩 **La Règle Réflexe :** Le cerveau francophone a tendance à doubler « can ». Évitez les répétitions inutiles.',
  }), true);

  assert.equal(isDefectiveEnglishCard({
    front: 'the the book',
    back: '🧩 **La Règle Réflexe :** Évitez de doubler les mots lors d\'une hésitation orale.',
  }), true);
});

test('englishCardEngine — parseEnglishRestructureResponse dédoublonne les mots répétés dans Vous avez dit', () => {
  const fallbackCard = {
    front: '❌ "I can I can have more doors open"',
    back: 'Vous aviez dit : "I can I can have more doors open"',
    source: 'user_error',
  };

  const rawJSON = JSON.stringify({
    front: 'have doors open',
    back: '📖 **Vrai sens :** Avoir des opportunités qui s\'ouvrent.\n\n🧩 **La Règle Réflexe :**\n\n💬 **Mini-dialogue :**\n* **A :** Will this help?\n  ↳ *Est-ce que ça va aider ?*\n* **B :** It will have doors open for you.\n  ↳ *Ça va t\'ouvrir des portes.*\n\n⚠️ **Attention au piège :** Aucun piège.',
    example: 'It will have doors open for you.',
  });

  const parsed = parseEnglishRestructureResponse(rawJSON, fallbackCard);
  assert.ok(parsed);
  // Doit avoir nettoyé le bégaiement "I can I can" en "I can"
  assert.ok(parsed.back.includes('Vous avez dit : « I can have more doors open ».'));
});

test('englishCardEngine — assainit totalement la fiche de bégaiement du screenshot utilisateur', () => {
  const hesitationCard = {
    front: 'I can have more doors open',
    back: `📖 **Vrai sens :** Je peux avoir plus d'opportunités ou de choix.\n\n🧩 **La Règle Réflexe :** Vous avez dit : « I can I can have more doors open ». Cette formulation répète inutilement le modal « can », ce qui n’existe pas en anglais natif. Le cerveau francophone double souvent les auxiliaires parce qu’en français on peut dire « je peux, je peux... ». Le réflexe natif : ne gardez qu’un seul « can » et dites la phrase la plus concise, par ex. « I can have more doors open » ou mieux « I can open more doors ».\n\n💬 **Mini-dialogue :**\n* **A :** \`How will this new role help?\`\n  ↳ *Comment ce nouveau poste va-t-il t'aider ?*\n* **B :** \`I can have more doors open in tech.\`\n  ↳ *Je peux avoir plus d'opportunités dans la tech.*\n\n⚠️ **Attention au piège :** Aucun.`,
    source: 'user_error',
  };

  // 1. Détection
  assert.equal(isHesitationCard(hesitationCard), true);
  assert.equal(isDefectiveEnglishCard(hesitationCard), true);

  // 2. Payload prompt
  const payload = buildEnglishRestructureUserPayload(hesitationCard);
  assert.ok(payload.includes('HÉSITATION ORALE DÉTECTÉE'));
  assert.equal(payload.includes('Cette formulation répète inutilement'), false);
  assert.equal(payload.includes('⚠️ Fiche d\'erreur de l\'élève.'), false);

  // 3. Purge de la réponse du LLM
  const rawLLMWithBogusRule = JSON.stringify({
    front: 'have more doors open',
    back: `📖 **Vrai sens :** Avoir plus d'opportunités.\n\n🧩 **La Règle Réflexe :** Vous avez dit : « I can I can have more doors open ». Cette formulation répète inutilement le modal « can ».\n\n💬 **Mini-dialogue :**\n* **A :** Good luck!\n* **B :** Thanks!\n\n⚠️ **Attention au piège :** Aucun.`,
    example: 'I can have more doors open',
  });

  const cleaned = parseEnglishRestructureResponse(rawLLMWithBogusRule, hesitationCard);
  assert.ok(cleaned);
  // Doit avoir purgé "Vous avez dit", "Cette formulation répète" et le modal can
  assert.equal(cleaned.back.includes('Cette formulation répète'), false);
  assert.equal(cleaned.back.includes('modal « can »'), false);
  assert.equal(cleaned.back.includes('Vous avez dit'), false);
  assert.ok(cleaned.back.includes('La Règle Réflexe'));
});

test('englishCardEngine — reformatDialogueWithPerTurnTranslation sépare la traduction collée sur la même ligne', () => {
  const cardWithInlineTrad = {
    front: 'Have the possibility',
    back: `💬 Mini-dialogue :
• A : I wish I could travel to the Alps, but I don't have the possibility to see big mountains here. ↳ J'aimerais pouvoir voyager aux Alpes, mais je n'ai pas la possibilité de voir de grandes montagnes ici.
• B : Maybe next summer you'll get the chance. ↳ Peut-être l'été prochain tu auras l'occasion.`,
  };

  // 1. isDefectiveEnglishCard doit détecter ce défaut d'affichage
  assert.equal(isDefectiveEnglishCard(cardWithInlineTrad), true);

  // 2. reformatDialogueWithPerTurnTranslation doit renvoyer la traduction à la ligne suivante avec indentation
  const reformatted = reformatDialogueWithPerTurnTranslation(cardWithInlineTrad.back);
  assert.ok(reformatted.includes("* **A :** `I wish I could travel to the Alps, but I don't have the possibility to see big mountains here.`  \n  ↳ *J'aimerais pouvoir voyager aux Alpes, mais je n'ai pas la possibilité de voir de grandes montagnes ici.*"));
  assert.ok(reformatted.includes("* **B :** `Maybe next summer you'll get the chance.`  \n  ↳ *Peut-être l'été prochain tu auras l'occasion.*"));

  // 3. Après reformatage, la fiche n'est plus défectueuse sur ce critère
  assert.equal(isDefectiveEnglishCard({ front: 'Have the possibility', back: reformatted }), false);
});

test('englishCardEngine — buildEnglishRestructureSystemPrompt intègre le piège et la nuance native', () => {
  const prompt = buildEnglishRestructureSystemPrompt();
  assert.ok(prompt.includes('"trap"'));
  assert.ok(prompt.includes('"nuance_fr"'));
  assert.ok(prompt.includes('aucun article n\'est utilisé avec more'));
});

test('englishCardEngine — reformatDialogueWithPerTurnTranslation élimine les résidus d\'astérisques et lignes orphelines', () => {
  const dirtyDialogue = `💬 Mini-dialogue :
• A : ** "What's more important, health or money?" ↳ Quel est le plus important, la santé ou l'argent ?
• B : \`**\` ** "I think health is more important." ↳ Je pense que la santé est plus importante.

⚠️ **Attention au piège & Exception :**
**
• 🚫 Le piège : « What's the more important »
• ⚡ L'exception / Nuance native : Aucun article avec more dans les comparatifs.`;

  // Vérification de détection
  assert.equal(isDefectiveEnglishCard({ front: "What's more important", back: dirtyDialogue }), true);

  // Reformatage et nettoyage
  const cleaned = reformatDialogueWithPerTurnTranslation(dirtyDialogue);

  // Aucun artefact `**` ou ** parasite dans les répliques A et B
  assert.ok(cleaned.includes("* **A :** `What's more important, health or money?`  \n  ↳ *Quel est le plus important, la santé ou l'argent ?*"));
  assert.ok(cleaned.includes("* **B :** `I think health is more important.`  \n  ↳ *Je pense que la santé est plus importante.*"));
  assert.equal(cleaned.includes("`**`"), false, "Ne doit pas contenir de bloc de code d'astérisques `**`");
  assert.equal(/\n\s*\*{2,}\s*\n/.test(cleaned), false, "Ne doit contenir aucune ligne orpheline avec **");
});

test('englishCardEngine — sanitizeEnglishPedagogy éradique les fausses règles sur more et injecte les vraies exceptions', () => {
  const cardWithFalseRule = {
    front: "What's more important",
    back: `📖 **Vrai sens :** Qu'est-ce qui est plus important
🧩 **La Règle Réflexe :** On ne met pas the devant more
💬 **Mini-dialogue :**
* **A :** \`What's more important?\`  \n  ↳ *Qu'est-ce qui est le plus important ?*
* **B :** \`Health is.\`  \n  ↳ *La santé l'est.*
⚠️ **Attention au piège & Exception :**
* 🚫 **Le piège :** « What's the more important »
* ⚡ **L'exception / Nuance native :** Aucun article n'est utilisé avec more dans les comparatifs.`,
  };

  // 1. Détecte la fiche comme défectueuse
  assert.equal(isDefectiveEnglishCard(cardWithFalseRule), true);

  // 2. Corrige l'erreur factuelle avec les vraies exceptions Oxford/Cambridge
  const sanitized = sanitizeEnglishPedagogy(cardWithFalseRule.back, cardWithFalseRule.front);
  assert.equal(sanitized.includes("Aucun article n'est utilisé avec more"), false);
  assert.ok(sanitized.includes("The more you learn, the more you grow"));
  assert.ok(sanitized.includes("Health is the more important of the two"));
});

test('englishCardEngine — assainit la fiche du screenshot avec section piège collée sur la réplique B', () => {
  const gluedCardBack = `💬 Mini-dialogue :
* **A :** \`What's more important, health or money?\`  
  ↳ Quel est le plus important, la santé ou l'argent ?
* **B :** \`I think health is more important.\`  
  ↳ Je pense que la santé est plus importante. ⚠️ Attention au piège & Exception : 🚫 Le piège : « What's the more important » – l'article the est superflu.
• ⚡ L'exception / Nuance native : Aucun article n'est utilisé avec more dans les comparatifs ; on dit « What's more important », « What's more interesting », etc.`;

  // Vérifier qu'elle est détectée
  assert.equal(isDefectiveEnglishCard({ front: "What's more important", back: gluedCardBack }), true);

  // Assainir et reformater
  let cleaned = sanitizeEnglishPedagogy(gluedCardBack, "What's more important");
  cleaned = reformatDialogueWithPerTurnTranslation(cleaned);

  // Vérifier que ⚠️ Attention au piège n'est plus collé à la réplique B
  assert.equal(/Je pense que la santé est plus importante\.\s*⚠️/.test(cleaned), false, "Ne doit pas être collé sur la même ligne");
  assert.ok(cleaned.includes("↳ *Je pense que la santé est plus importante.*"));
  assert.ok(cleaned.includes("⚠️ Attention au piège & Exception :"));
  assert.ok(cleaned.includes("- 🚫 Le piège : « What's the more important »"));
  assert.ok(cleaned.includes("The more you learn, the more you grow"));
});

test('englishCardEngine — Garde-Fou 1 (Pré-Prompt) : buildEnglishRestructureUserPayload assainit le prompt amont', () => {
  const contaminatedCard = {
    front: "What's more important, health or money?",
    back: `💬 Mini-dialogue :
* **A :** \`What's more important, health or money?\`  
  ↳ *Quel est le plus important, la santé ou l'argent ?*
* **B :** \`I think health is more important.\`  
  ↳ *Je pense que la santé est plus importante.*

⚠️ Attention au piège & Exception :
- 🚫 Le piège : dire « What's the more important »
- ⚡ L'exception / Nuance native : Aucun article n'est utilisé avec more dans les comparatifs. On dit « What's more important », « What's more interesting », etc. (Pas d'exception ; la forme reste toujours sans article.)`,
    example: "What's more important, health or money?",
  };

  const payload = buildEnglishRestructureUserPayload(contaminatedCard);
  // Vérifie que le prompt envoyé au LLM ne contient AUCUNE fausse règle
  assert.equal(payload.includes("Aucun article n'est utilisé avec more"), false, "Le prompt ne doit pas ancrer l'IA sur l'hallucination");
  assert.equal(payload.includes("Pas d'exception ; la forme reste toujours sans article"), false, "L'absolutisme doit être purgé du prompt");
  assert.ok(payload.includes("The more you learn, the more you grow"), "Le prompt doit contenir la vraie règle de référence");
});

test('englishCardEngine — Garde-Fou 2 & 3 : sanitizeEnglishPedagogy éradique la formule exacte vue par l\'utilisateur', () => {
  const userScreenshotBack = `⚠️ Attention au piège & Exception :
• 🚫 Le piège : dire « What's the more important »
• ⚡ L'exception / Nuance native : Aucun article n'est utilisé avec more dans les comparatifs. On dit « What's more important », « What's more interesting », etc. (Pas d'exception ; la forme reste toujours sans article.)`;

  const cleaned = sanitizeEnglishPedagogy(userScreenshotBack, "What's more important, health or money?");
  assert.equal(cleaned.includes("Aucun article n'est utilisé avec more"), false);
  assert.equal(cleaned.includes("Pas d'exception ; la forme reste toujours sans article"), false);
  assert.ok(cleaned.includes("The more you learn, the more you grow"));
  assert.ok(cleaned.includes("Health is the more important of the two"));
});



