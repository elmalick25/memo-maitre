import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnglishRestructureSystemPrompt,
  parseEnglishRestructureResponse,
  isDefectiveEnglishCard,
} from '../lib/englishCardEngine.js';
import { upgradeCardToRetroEngineering } from '../lib/retroEngineeringRestructurer.js';
import { isNovaMistakeCard } from '../lib/memoryLab.js';

const standardCard = { id: 's1', front: 'Which projects are you most proud of?', back: 'Quels projets...', category: '🇬🇧 Anglais' };
const novaCard = {
  id: 'n1', front: '❌ "I live here since two years" → comment le dire correctement ?',
  back: '🔴 **Tu as dit :** I live here since two years', userMistake: 'I live here since two years',
  category: '🇬🇧 Anglais', source: 'user_error',
};

const standardJSON = {
  card_type: 'standard',
  recto_prompt_fr: 'Quels sont les projets dont tu es le plus fier ?',
  recto_hint: 'proud + ?',
  expression_en: 'Which projects are you most proud of?',
  reflex: ['On dit toujours proud of.', 'La préposition se place à la fin.', 'troisième puce en trop'],
  trap: { wrong_en: 'Which projects are you the most proud?', right_en: 'Which projects are you most proud of?', why_fr: 'Le « dont » cache la préposition.' },
  nuance_fr: '',
  dialogue: [
    { speaker: 'A', en: 'Which projects are you most proud of at work?', fr: 'De quels projets es-tu le plus fier au travail ?' },
    { speaker: 'B', en: 'Definitely the AI assistant we launched last quarter.', fr: "Sans hésiter, l'assistant IA lancé le trimestre dernier." },
  ],
};

const novaJSON = {
  card_type: 'nova_mistake',
  what_you_said: 'I live here since two years',
  native_fix: "I've been living here for two years.",
  native_alt: "I've lived here for two years.",
  why_fr: "En français on garde le présent ; l'anglais exige le present perfect.",
  contrast: [{ fr: 'Je vis (présent)', en: "I've been living" }, { fr: 'depuis + durée', en: 'FOR' }],
  punchline: 'Durée = FOR. Point de départ = SINCE.',
  dialogue: [
    { speaker: 'A', en: 'How long have you been in the city?', fr: 'Depuis combien de temps es-tu en ville ?' },
    { speaker: 'B', en: "I've been living here for two years now!", fr: "J'habite ici depuis deux ans maintenant !" },
  ],
};

test('prompt contient les deux schémas et les exemples modèles', () => {
  const p = buildEnglishRestructureSystemPrompt();
  assert.ok(p.includes('"card_type": "standard"'));
  assert.ok(p.includes('"card_type": "nova_mistake"'));
  assert.ok(p.includes('proud + ?'));
  assert.ok(p.includes('I live here since two years'));
});

test('fiche standard : recto actif en français, verso compact, dialogue bilingue', () => {
  const r = parseEnglishRestructureResponse(JSON.stringify(standardJSON), standardCard);
  assert.ok(r.front.includes('« Quels sont les projets dont tu es le plus fier ? »'));
  assert.ok(r.front.includes('💡 Indice : proud + ?'));
  assert.ok(r.back.startsWith('🔊 `Which projects are you most proud of?`'));
  assert.ok(r.back.includes('↳ *De quels projets es-tu le plus fier au travail ?*'));
  assert.ok(r.back.includes("↳ *Sans hésiter, l'assistant IA lancé le trimestre dernier.*"));
  assert.ok(r.back.includes('- ❌ `Which projects are you the most proud?`'));
  assert.equal(r.back.includes('troisième puce'), false, 'max 2 puces de réflexe');
  assert.equal(r.back.includes('Vous avez dit'), false);
  assert.equal(r.example, 'Which projects are you most proud of?');
  assert.equal(isDefectiveEnglishCard(r), false);
});

test('fiche Erreur Nova : faute au recto, réflexe + tableau + formule + dialogue bilingue', () => {
  const r = parseEnglishRestructureResponse(JSON.stringify(novaJSON), novaCard);
  assert.ok(r.front.includes('❌ « I live here since two years »'));
  assert.ok(r.back.includes("✅ **Le réflexe natif :** `I've been living here for two years.`"));
  assert.ok(r.back.includes('Vous avez dit : « I live here since two years ».'));
  assert.ok(r.back.includes('| En français | En anglais |'));
  assert.ok(r.back.includes('| depuis + durée | ➔ FOR |'));
  assert.ok(r.back.includes('🧠 **La formule :** Durée = FOR. Point de départ = SINCE.'));
  assert.ok(r.back.includes("↳ *J'habite ici depuis deux ans maintenant !*"));
  assert.equal(isDefectiveEnglishCard(r), false);
});

test("l'IA ne peut pas transformer une fiche standard en Erreur Nova", async () => {
  const upgraded = await upgradeCardToRetroEngineering(standardCard, async () => JSON.stringify(novaJSON));
  assert.equal(isNovaMistakeCard(upgraded), false);
  assert.equal(upgraded.back.includes('Vous avez dit'), false);
  assert.equal(upgraded.back.includes('❌ «'), false);
});

test('une vraie Erreur Nova reste une Erreur Nova après optimisation', async () => {
  const upgraded = await upgradeCardToRetroEngineering(novaCard, async () => JSON.stringify(novaJSON));
  assert.equal(isNovaMistakeCard(upgraded), true);
  assert.ok(upgraded.back.includes('Vous avez dit : « I live here since two years »'));
});

test('markdown parasite et "Vous avez dit" inventé sont nettoyés', () => {
  const dirty = { ...standardJSON, reflex: ['**Vous avez dit : « proud about ». On dit proud of.**'], trap: { why_fr: '`Le dont` *cache* la préposition.' } };
  const r = parseEnglishRestructureResponse(dirty, standardCard);
  assert.equal(r.back.includes('Vous avez dit'), false);
  assert.ok(r.back.includes('⚠️ **Le piège :** Le dont cache la préposition.'));
});

test('dialogue sans traduction ou JSON incomplet reste sûr', () => {
  const r = parseEnglishRestructureResponse({ ...standardJSON, dialogue: [{ en: 'Hi there.' }, { en: 'Hello!' }] }, standardCard);
  assert.ok(r.back.includes('* **A :** `Hi there.`'));
  assert.ok(r.back.includes('* **B :** `Hello!`'));
  assert.equal(parseEnglishRestructureResponse('{"card_type":"nova_mistake"}', novaCard), null);
});

test("ancien format markdown : l'étoile orpheline est corrigée", () => {
  const r = parseEnglishRestructureResponse({
    front: 'get rid of',
    back: "📖 **Vrai sens :** Se débarrasser de.\n\n⚠️ **Attention au piège & Exception :**\n* **Le piège :* Oublier « of ».",
  }, { front: 'get rid of', category: '🇬🇧 Anglais' });
  assert.ok(r.back.includes('**Le piège :** Oublier'));
});
