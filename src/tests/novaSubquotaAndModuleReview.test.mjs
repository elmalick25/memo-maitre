// tests/novaSubquotaAndModuleReview.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeDailySession, isNovaCard, isNovaMistakeCard, getDailySessionTarget } from '../lib/memoryLab.js';
import { buildDailyPlan, markCardDone } from '../lib/dailyPlan.js';

const TODAY = '2026-10-15';

test('isNovaCard — identifie correctement toutes les variantes de fiches Nova', () => {
  assert.equal(isNovaCard({ _agentDetected: true }), true);
  assert.equal(isNovaCard({ _novaV8: true }), true);
  assert.equal(isNovaCard({ source: 'user_error' }), true);
  assert.equal(isNovaCard({ _source: 'coach_input' }), true);
  assert.equal(isNovaCard({ _source: 'comprehension_request' }), true);
  assert.equal(isNovaCard({ front: 'Hello', category: '🇬🇧 Anglais' }), false);
  assert.equal(isNovaCard(null), false);
});

test('isNovaMistakeCard — discrimine strictement les vraies erreurs commises vs le simple vocabulaire', () => {
  // 1. Simples fiches de vocabulaire / expressions (ex: "mindset", coach inputs, idioms) -> FALSE
  assert.equal(isNovaMistakeCard({ front: 'mindset', back: 'État d’esprit', category: '🇬🇧 Anglais', _agentDetected: true }), false);
  assert.equal(isNovaMistakeCard({ front: 'buddies', back: 'Potes', category: '🇬🇧 Anglais', source: 'coach_input' }), false);
  assert.equal(isNovaMistakeCard({ front: 'in good faith', back: 'De bonne foi\n\n📌 Contexte Live Nova', category: 'Voice Coach' }), false);
  assert.equal(isNovaMistakeCard({ front: 'how to use it', back: 'Découvert avec Coach Nova', _type: 'idiom' }), false);
  assert.equal(isNovaMistakeCard(null), false);

  // 2. Fiches nées d'une vraie faute commise par l'utilisateur -> TRUE
  assert.equal(isNovaMistakeCard({ source: 'user_error', front: 'test' }), true);
  assert.equal(isNovaMistakeCard({ _source: 'user_error', front: 'test' }), true);
  assert.equal(isNovaMistakeCard({ userMistake: 'I have 20 years' }), true);
  assert.equal(isNovaMistakeCard({ front: '❌ I have 20 years → comment le dire correctement ?' }), true);
  assert.equal(isNovaMistakeCard({ back: '🔴 **Tu as dit :** I have 20 years\n✅ **En réalité, on dit :** I am 20 years old' }), true);
  assert.equal(isNovaMistakeCard({ back: '🔴 **Vous avez dit :** I have 20 years\n✅ **En réalité, on dit :** I am 20 years old' }), true);
  assert.equal(isNovaMistakeCard({ back: '🧩 **La Règle Réflexe :** Vous avez dit : « I have 20 years ». En anglais...' }), true);
  assert.equal(isNovaMistakeCard({ back: 'Phrase fautive : I make a mistake' }), true);
});

test('composeDailySession — réserve jusqu\'à 10 slots aux fiches Nova et 35 aux autres modules', () => {
  // 30 fiches Nova + 60 fiches diverses
  const novaCards = Array.from({ length: 30 }, (_, i) => ({
    id: `nova-${i}`,
    front: `nova card ${i}`,
    category: '🇬🇧 Anglais',
    _agentDetected: true,
    source: 'user_error',
    nextReview: TODAY,
  }));
  const otherCards = Array.from({ length: 60 }, (_, i) => ({
    id: `other-${i}`,
    front: `other card ${i}`,
    category: i % 2 === 0 ? 'Informatique' : '🇬🇧 Anglais',
    nextReview: TODAY,
  }));

  const session = composeDailySession([...novaCards, ...otherCards], { todayISO: TODAY });
  assert.equal(session.length, 45, 'Le quota total doit être de 45 fiches');

  const novaInSession = session.filter(isNovaMistakeCard);
  const othersInSession = session.filter((c) => !isNovaMistakeCard(c));

  assert.equal(novaInSession.length, 10, 'Exactement 10 fiches Nova prioritaires admises');
  assert.equal(othersInSession.length, 35, 'Exactement 35 fiches pour les autres modules');
});

test('markCardDone — countInPlan: true intègre les révisions de module dans le plan et décrémente le restant FSRS', () => {
  const due = Array.from({ length: 100 }, (_, i) => ({
    id: `c-${i}`,
    front: `card ${i}`,
    category: 'Informatique',
    nextReview: TODAY,
  }));

  const initial = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  assert.equal(initial.remainingCount, 45);

  // L'utilisateur révise une fiche de module dans CategoriesView
  const outsiderCard = due[70]; // pas forcément dans les 45 initiales
  const updatedPlan = markCardDone(initial.plan, outsiderCard.id, TODAY, { countInPlan: true });

  const after = buildDailyPlan({
    plan: updatedPlan,
    dueCards: due.filter((c) => c.id !== outsiderCard.id),
    todayISO: TODAY,
  });

  // La révision a bien décrémenté le plan du jour !
  assert.equal(after.doneCount, 1);
  assert.equal(after.remainingCount, 44, 'Le restant doit passer de 45 à 44');
});
