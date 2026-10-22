import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProviderAllowedForContext, filterChainForContext } from '../lib/aiRouter.js';

test('OpenRouter — est strictement interdit hors des contextes add_card et review_optimize', () => {
  // Interdit dans tous les contextes généraux
  assert.equal(isProviderAllowedForContext('or', undefined), false);
  assert.equal(isProviderAllowedForContext('or', 'chat'), false);
  assert.equal(isProviderAllowedForContext('or', 'nova_chat'), false);
  assert.equal(isProviderAllowedForContext('or', 'tech_intel'), false);
  assert.equal(isProviderAllowedForContext('or', 'general'), false);

  // Autorisé EXCLUSIVEMENT pour la vue Ajouter et le bouton Optimiser de Review
  assert.equal(isProviderAllowedForContext('or', 'add_card'), true);
  assert.equal(isProviderAllowedForContext('or', 'review_optimize'), true);

  // Les autres providers (groq, mistral, cohere, cerebras) restent autorisés partout
  assert.equal(isProviderAllowedForContext('groq', 'nova_chat'), true);
  assert.equal(isProviderAllowedForContext('mistral', 'tech_intel'), true);
  assert.equal(isProviderAllowedForContext('cohere', 'add_card'), true);
});

test('OpenRouter — filterChainForContext retire OpenRouter des chaînes non autorisées et le priorise pour add_card et review_optimize', () => {
  const chain = [
    { p: 'groq', m: 'qwen' },
    { p: 'or', m: 'llama-70b' },
    { p: 'mistral', m: 'mistral-small' },
  ];

  // Hors contexte autorisé : "or" est filtré
  const filteredGeneral = filterChainForContext(chain, 'general', { checkKeys: false });
  assert.equal(filteredGeneral.some(m => m.p === 'or'), false);
  assert.equal(filteredGeneral.length, 2);

  // En contexte add_card : "or" est conservé et placé en tête de chaîne pour garantir la haute qualité
  const filteredAdd = filterChainForContext(chain, 'add_card', { checkKeys: false });
  assert.equal(filteredAdd[0].p, 'or');
  assert.equal(filteredAdd.length, 3);

  // En contexte review_optimize : "or" est conservé et placé en tête
  const filteredReview = filterChainForContext(chain, 'review_optimize', { checkKeys: false });
  assert.equal(filteredReview[0].p, 'or');
  assert.equal(filteredReview.length, 3);
});

test('OpenRouter — les points d\'appel cibles (AddCardView, retroEngineering, MemoMaster) transmettent le callerContext adéquat', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const addCardContent = fs.readFileSync(path.resolve('src/components/AddCardView.jsx'), 'utf8');
  assert.equal(addCardContent.includes('callerContext: "add_card"'), true, 'AddCardView doit injecter callerContext: "add_card"');

  const retroContent = fs.readFileSync(path.resolve('src/lib/retroEngineeringRestructurer.js'), 'utf8');
  assert.equal(retroContent.includes('callerContext: "review_optimize"'), true, 'retroEngineeringRestructurer doit passer callerContext: "review_optimize"');

  const memoMasterContent = fs.readFileSync(path.resolve('src/MemoMaster.jsx'), 'utf8');
  assert.equal(memoMasterContent.includes('callerContext: "review_optimize"'), true, 'MemoMaster handleOptimizeOneCard doit passer callerContext: "review_optimize"');
});

