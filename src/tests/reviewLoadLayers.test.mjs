// Couches 5, 6, 7 — tests unitaires (fonctions pures uniquement)
import test from 'node:test';
import assert from 'node:assert/strict';

import { isCardMastered, isCardActive, isConsolidationCandidate } from '../lib/cardStatus.js';
import {
  canPromptProduction,
  pickProductionInvite,
  parseProductionValidation,
  PRODUCTION_PROMPT_COOLDOWN_MS,
} from '../lib/productionPrompt.js';
import {
  appendDailyLog,
  summarizeReviewLoad,
  checkCreationGuard,
  countNeverSeenCards,
  CREATION_GUARD_NEW_CARDS_THRESHOLD,
} from '../lib/reviewStats.js';

// ── Couche 6 ──────────────────────────────────────────────────────────────
test('couche6 : level 7 OU stade productif OU intervalle très long ⇒ maîtrisée', () => {
  assert.equal(isCardMastered({ level: 7 }), true);
  assert.equal(isCardMastered({ level: 2, masteryStage: 'produced' }), true);
  assert.equal(isCardMastered({ level: 1, interval: 200, repetitions: 5 }), true);
  assert.equal(isCardMastered({ level: 3, masteryStage: 'recalled', interval: 10 }), false);
  assert.equal(isCardActive({ level: 3 }), true);
});

test('couche6 : une fiche maîtrisée n\'est jamais candidate à la consolidation', () => {
  assert.equal(isConsolidationCandidate({ level: 7 }), false);
  assert.equal(isConsolidationCandidate({ level: 5 }), true);
  assert.equal(isConsolidationCandidate({ level: 1, interval: 30 }), true);
  assert.equal(isConsolidationCandidate({ level: 1, interval: 2 }), false);
});

// ── Couche 5 ──────────────────────────────────────────────────────────────
test('couche5 : cooldown respecté entre deux invitations', () => {
  const now = 1_000_000_000_000;
  assert.equal(canPromptProduction(null, now), true);
  assert.equal(canPromptProduction(now - 1000, now), false);
  assert.equal(canPromptProduction(now - PRODUCTION_PROMPT_COOLDOWN_MS - 1, now), true);
});

test('couche5 : priorise les fiches anglaises recalled vues dans la session', () => {
  const mk = (id, extra = {}) => ({
    id, front: `f${id}`, back: 'b', category: 'Anglais 🇬🇧',
    masteryStage: 'recalled', productiveUses: [], ...extra,
  });
  const all = [mk('a'), mk('b'), mk('c'), { id: 'd', category: 'Maths', masteryStage: 'recalled' }];
  const picked = pickProductionInvite(all, [mk('c')], { limit: 2 });
  assert.equal(picked.length, 2);
  assert.equal(picked[0].id, 'c');            // vue en session ⇒ en tête
  assert.ok(picked.every((c) => c.id !== 'd')); // pas d'anglais ⇒ exclue
});

test('couche5 : parse tolérant de la réponse du validateur', () => {
  assert.deepEqual(parseProductionValidation('bla {"correct": true, "feedback": "ok"} bla'), { correct: true, feedback: 'ok' });
  assert.deepEqual(parseProductionValidation('pas du json'), { correct: false, feedback: 'Analyse indisponible.' });
});

// ── Couche 7 ──────────────────────────────────────────────────────────────
test('couche7 : le journal additionne les compteurs et remplace les instantanés', () => {
  let log = appendDailyLog([], '2026-01-01', { served: 20, pileSize: 180, newCardsCreated: 5 });
  log = appendDailyLog(log, '2026-01-01', { served: 10, pileSize: 150, newCardsCreated: 3 });
  assert.equal(log.length, 1);
  assert.equal(log[0].served, 30);            // additionné
  assert.equal(log[0].pileSize, 150);         // instantané remplacé
  assert.equal(log[0].newCardsCreated, 8);
});

test('couche7 : résumé sur N jours', () => {
  const log = [
    { date: '2026-01-01', pileSize: 200, served: 40, newCardsCreated: 10 },
    { date: '2026-01-02', pileSize: 100, served: 20, newCardsCreated: 0 },
  ];
  const sum = summarizeReviewLoad(log, 14);
  assert.equal(sum.days, 2);
  assert.equal(sum.avgPile, 150);
  assert.equal(sum.avgServed, 30);
  assert.equal(sum.maxPile, 200);
});

test('couche7 : garde-fou création informatif, jamais bloquant', () => {
  const many = Array.from({ length: CREATION_GUARD_NEW_CARDS_THRESHOLD }, (_, i) => ({ id: i, repetitions: 0 }));
  assert.equal(countNeverSeenCards(many), CREATION_GUARD_NEW_CARDS_THRESHOLD);
  const guard = checkCreationGuard(many);
  assert.equal(guard.warn, true);
  assert.ok(guard.message.includes(String(CREATION_GUARD_NEW_CARDS_THRESHOLD)));
  assert.equal(checkCreationGuard([{ id: 1, repetitions: 3 }]).warn, false);
});
