import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractEnglishSpeechText } from '../lib/speakUtils.js';
import { isEnglishCategory } from '../lib/englishCardEngine.js';

test('englishCardSingleOptimizeAndAudio — extractEnglishSpeechText élimine tout le français', () => {
  // Phrases françaises pures -> Doit retourner une chaîne vide
  assert.equal(extractEnglishSpeechText("💡 Vrai sens : Ne sous-estime pas"), "");
  assert.equal(extractEnglishSpeechText("⚠️ Attention au piège : Ne traduis pas mot à mot"), "");
  assert.equal(extractEnglishSpeechText("La règle réflexe : On utilise toujours l'infinitif"), "");
  assert.equal(extractEnglishSpeechText("↳ Pouvons-nous aller dehors ?"), "");
  assert.equal(extractEnglishSpeechText("-> C'est une erreur classique"), "");

  // Expressions anglaises réelles avec ou sans préfixe
  assert.equal(extractEnglishSpeechText("I want you to believe that"), "I want you to believe that");
  assert.equal(extractEnglishSpeechText("* A: Can we play outside? ↳ Pouvons-nous jouer ?"), "Can we play outside?");
  assert.equal(extractEnglishSpeechText("`Don't let me down`"), "Don't let me down");
  assert.equal(extractEnglishSpeechText('En réalité, on dit : "I want you to believe that"'), "I want you to believe that");
});

test('englishCardSingleOptimizeAndAudio — MemoMaster.jsx utilise upgradeCardToRetroEngineering pour les fiches anglais', () => {
  const code = fs.readFileSync(path.resolve('src/MemoMaster.jsx'), 'utf8');
  assert.equal(
    code.includes('upgradeCardToRetroEngineering(exp, callClaude)'),
    true,
    'handleOptimizeOneCard doit appeler upgradeCardToRetroEngineering pour les fiches anglais'
  );
  assert.equal(
    code.includes('isEnglishCategory(exp.category)'),
    true,
    'handleOptimizeOneCard doit tester isEnglishCategory'
  );
});

test('englishCardSingleOptimizeAndAudio — AudioPlayButton n\'affiche rien si aucun mot d\'anglais', () => {
  const code = fs.readFileSync(path.resolve('src/components/AudioPlayButton.jsx'), 'utf8');
  assert.equal(
    code.includes('extractEnglishSpeechText(text)'),
    true,
    'AudioPlayButton doit filtrer avec extractEnglishSpeechText'
  );
  assert.equal(
    code.includes('if (!speechText) return null;'),
    true,
    'AudioPlayButton doit renvoyer null si le texte est français ou sans anglais'
  );
});

test('englishCardSingleOptimizeAndAudio — RichText et ReviewEngineView intègrent les boutons audio recto/verso', () => {
  const richTextCode = fs.readFileSync(path.resolve('src/components/RichText.jsx'), 'utf8');
  assert.equal(richTextCode.includes('extractEnglishSpeechText'), true);
  assert.equal(richTextCode.includes('<AudioPlayButton text={englishSpeech}'), true);
  assert.equal(richTextCode.includes('reformatDialogueWithPerTurnTranslation'), true);

  const godTierCode = fs.readFileSync(path.resolve('src/components/GodTierContent.jsx'), 'utf8');
  assert.equal(godTierCode.includes('effectiveShowAudio'), true);

  const reviewCode = fs.readFileSync(path.resolve('src/components/ReviewEngineView.jsx'), 'utf8');
  assert.equal(reviewCode.includes('isEnglishCategory(currentCard.category)'), true);
  assert.equal(reviewCode.includes('<AudioPlayButton text={activeFacet ? activeFacet.front : currentCard.front}'), true);
  assert.equal(reviewCode.includes('showAudio={isEnglishCategory(currentCard.category)}'), true);

  const listCode = fs.readFileSync(path.resolve('src/components/CardListView.jsx'), 'utf8');
  assert.equal(listCode.includes('isEnglishCategory(exp.category)'), true);
  assert.equal(listCode.includes('<AudioPlayButton text={exp.front}'), true);
  assert.equal(listCode.includes('showAudio={isEnglishCategory(exp.category)}'), true);
});

test('englishCardSingleOptimizeAndAudio — reformatDialogueWithPerTurnTranslation sépare la traduction A et B', async () => {
  const { reformatDialogueWithPerTurnTranslation } = await import('../lib/englishCardEngine.js');

  const inputWithCombinedAtB = `💭 Mini-dialogue :
• A : "Who called you last night?"
• B : "My sister did." ↳ « Qui t'a appelé hier soir ? » - « Ma sœur l'a fait. »`;

  const output = reformatDialogueWithPerTurnTranslation(inputWithCombinedAtB);
  assert.ok(output.includes('• A : "Who called you last night?"  \n  ↳ *« Qui t\'a appelé hier soir ? »*'));
  assert.ok(output.includes('• B : "My sister did."  \n  ↳ *« Ma sœur l\'a fait. »*'));

  // Phrases anglaises nettoyées sans fuite de français
  assert.equal(extractEnglishSpeechText('A : "Who called you last night?"\n↳ « Qui t\'a appelé hier soir ? »'), 'Who called you last night?');
  assert.equal(extractEnglishSpeechText('B : "My sister did."\n↳ « Ma sœur l\'a fait. »'), 'My sister did.');
});

