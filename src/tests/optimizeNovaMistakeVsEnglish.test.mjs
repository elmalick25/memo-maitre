import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeCardToRetroEngineering } from '../lib/retroEngineeringRestructurer.js';
import { buildEnglishRestructureUserPayload } from '../lib/englishCardEngine.js';
import { isNovaMistakeCard } from '../lib/memoryLab.js';

const aiReply = (back) => async () => JSON.stringify({ front: 'I am looking forward to it', back, example: 'I am looking forward to it.' });
const BACK = `🧩 **La Règle Réflexe :** Vous avez dit : « I look forward it ». Après forward, on met toujours "to" puis -ing.\n💬 **Dialogue :** A: See you! B: I'm looking forward to it.\n⚠️ **Piège :** forward to.`;

const mistake = { id: 'm1', category: '🇬🇧 Anglais', source: 'user_error', userMistake: 'I look forward it', front: 'I look forward it', back: 'old' };
const vocab = { id: 'v1', category: '🇬🇧 Anglais', source: 'vocabulary', front: 'mindset', back: 'old' };

test('optimiser : la fiche Erreur Nova reçoit la consigne « faute de l\'élève »', () => {
  assert.match(buildEnglishRestructureUserPayload(mistake), /Fiche d'erreur de l'élève/);
  assert.match(buildEnglishRestructureUserPayload(vocab), /PAS UNE ERREUR/);
});

test('optimiser : une fiche Erreur Nova garde sa faute et son étiquette', async () => {
  const out = await upgradeCardToRetroEngineering(mistake, aiReply(BACK));
  assert.match(out.back, /Vous avez dit/);
  assert.equal(out.userMistake, 'I look forward it');
  assert.ok(isNovaMistakeCard(out));
});

test('optimiser : une fiche anglais normale ne devient jamais une Erreur Nova', async () => {
  const out = await upgradeCardToRetroEngineering(vocab, aiReply(BACK));
  assert.doesNotMatch(out.back, /Vous avez dit/);
  assert.equal(out.userMistake, undefined);
  assert.equal(isNovaMistakeCard(out), false);
});
