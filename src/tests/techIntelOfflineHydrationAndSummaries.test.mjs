import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { saveAiSummariesMap, loadAiSummariesMap, saveArticleBodies, loadArticleBodies } from '../lib/offlineArticles.js';

test('offlineArticles — saveAiSummariesMap et loadAiSummariesMap sont exportées et fonctionnelles', () => {
  assert.equal(typeof saveAiSummariesMap, 'function');
  assert.equal(typeof loadAiSummariesMap, 'function');
  assert.equal(typeof saveArticleBodies, 'function');
  assert.equal(typeof loadArticleBodies, 'function');
});

test('TechIntelView — Le chargement du bouton Actualiser attend que tout soit 100% prêt', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');

  // Vérifie que batchGenerateClearExplanations et batchHydrateOfflineBodies sont déclarées
  assert.ok(jsx.includes('async function batchGenerateClearExplanations'));
  assert.ok(jsx.includes('async function batchHydrateOfflineBodies'));

  // Vérifie que partialFlush ne coupe plus prématurément le spinner avec setLoading(false)
  assert.equal(jsx.includes('if (!firstFlushDone) { firstFlushDone = true; setLoading(false); }'), false);

  // Vérifie que batchHydrateOfflineBodies est invoqué dans fetchAll avant setLoading(false)
  const hydrIdx = jsx.indexOf('await batchHydrateOfflineBodies');
  const endLoadingIdx = jsx.indexOf('// 🎯 5. Tout est 100% prêt : résumés IA + corps complets en IndexedDB');
  assert.ok(hydrIdx > 0, 'batchHydrateOfflineBodies doit être exécuté dans fetchAll');
  assert.ok(endLoadingIdx > hydrIdx, 'setLoading(false) doit intervenir APRES l\'hydratation des corps complets');

  // Vérifie la persistance IndexedDB des résumés IA et corps complets
  assert.ok(jsx.includes('saveAiSummariesMap'));
  assert.ok(jsx.includes('loadAiSummariesMap'));
  assert.ok(jsx.includes('saveArticleBodies'));
});

test('TechIntelView — Les boutons Réduire sont strictement préservés sans altération', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');
  assert.ok(jsx.includes('className="tiv-btn-collapse tiv-btn-collapse-bottom"'));
  assert.ok(jsx.includes('<span>Réduire</span>'));
});

test('frenchNews — Google Translate en priorité avec relais IA immédiat sur 429', () => {
  const code = fs.readFileSync('src/lib/frenchNews.js', 'utf8');
  const googleIdx = code.indexOf('cloudflareProxyTranslate');
  const aiIdx = code.indexOf('aiTranslate');

  assert.ok(googleIdx > 0 && aiIdx > 0);
  // Dans translateChunkOnce, Google Translate doit être tenté en premier et l'IA en relais
  const chunkFn = code.slice(code.indexOf('async function translateChunkOnce'));
  const firstGoogleInChunk = chunkFn.indexOf('cloudflareProxyTranslate');
  const firstAiInChunk = chunkFn.indexOf('aiTranslate');
  assert.ok(firstGoogleInChunk < firstAiInChunk, 'Google Translate doit être testé avant l\'IA dans translateChunkOnce');
});

test('TechIntelView — Tout article de moins de 350 caractères est un teaser, et aucun texte générique de remplissage', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');
  assert.ok(jsx.includes('if (trimmed.length < 350) return true;'));
  assert.ok(jsx.includes('frenchFull.length >= 350'));
  assert.ok(!jsx.includes('buildDeterministicFrenchStory(item)'));
  assert.ok(!jsx.includes('franchit une nouvelle étape stratégique avec'));
  assert.equal(jsx.includes('Chargement de l\'article complet...'), false, 'Le spinner bloquant ne doit plus jamais exister');
});

test('TechIntelView — Aucun bouton secondaire superflu n\'est présent dans la carte', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');
  assert.equal(jsx.includes('Rédiger l\'article complet'), false, 'Le bouton secondaire doit être totalement absent');
});

