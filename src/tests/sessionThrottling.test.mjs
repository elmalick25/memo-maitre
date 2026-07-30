// tests/sessionThrottling.test.mjs — couches 2 & 3 (session plafonnée + budget d'entrée)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeDailySession, getDailySessionTarget } from '../lib/memoryLab.js';
import { getNewCardBudget, isNewCard, splitNewAndReview, selectNewCardsForToday, makeIntakeState } from '../lib/newCardIntake.js';

const mkCard = (i, over = {}) => ({
  id: `c${i}`, front: `question numero ${i}`, back: `reponse ${i}`,
  category: i % 3 === 0 ? 'Anglais' : 'Divers',
  nextReview: `2026-07-${String(1 + (i % 28)).padStart(2, '0')}`,
  level: i % 6, repetitions: 3, reviewHistory: [], ...over,
});

test('Couche 2 — petite pile (<50) : aucun plafond', () => {
  const cards = Array.from({ length: 30 }, (_, i) => mkCard(i));
  assert.equal(getDailySessionTarget(30), null);
  assert.equal(composeDailySession(cards, { todayISO: '2026-07-30' }).length, 30);
});

test('Couche 2 — grosse pile (>150) : session ~30-40 fiches', () => {
  const cards = Array.from({ length: 200 }, (_, i) => mkCard(i));
  const s = composeDailySession(cards, { todayISO: '2026-07-30' });
  assert.ok(s.length >= 30 && s.length <= 40, `session attendue 30-40, reçue ${s.length}`);
  assert.equal(new Set(s.map(c => c.id)).size, s.length, 'pas de doublon');
});

test('Couche 2 — les leeches sévères sont prioritaires', () => {
  const cards = Array.from({ length: 200 }, (_, i) =>
    mkCard(i, i % 50 === 0 ? { reviewHistory: [{ q: 0 }, { q: 0 }, { q: 0 }, { q: 0 }, { q: 0 }] } : {}));
  const ids = new Set(composeDailySession(cards, { todayISO: '2026-07-30' }).map(c => c.id));
  for (const i of [0, 50, 100, 150]) assert.ok(ids.has(`c${i}`), `leech c${i} doit être dans la session`);
});

test('Couche 3 — budget inversement proportionnel à la pile', () => {
  assert.equal(getNewCardBudget(10), 15);
  assert.equal(getNewCardBudget(200), 5);
  const mid = getNewCardBudget(100);
  assert.ok(mid > 5 && mid < 15, `budget intermédiaire attendu, reçu ${mid}`);
});

test('Couche 3 — seules les fiches jamais vues sont gatées', () => {
  const fresh = mkCard(1, { repetitions: 0, reviewHistory: [] });
  const failing = mkCard(2, { repetitions: 0, reviewHistory: [{ q: 0 }, { q: 0 }] });
  assert.equal(isNewCard(fresh), true);
  assert.equal(isNewCard(failing), false, 'une fiche déjà en apprentissage ne doit pas être gatée');
  const { newCards, reviewCards } = splitNewAndReview([fresh, failing, mkCard(3)]);
  assert.equal(newCards.length, 1);
  assert.equal(reviewCards.length, 2);
});

test('Couche 3 — pile > 150 : seulement 5 nouvelles fiches admises', () => {
  const news = Array.from({ length: 40 }, (_, i) => mkCard(1000 + i, { repetitions: 0 }));
  const r = selectNewCardsForToday(news, { todayISO: '2026-07-30', pileSize: 200, state: makeIntakeState('2026-07-30') });
  assert.equal(r.budget, 5);
  assert.equal(r.admitted.length, 5);
  assert.equal(r.deferred.length, 35);
  // Le budget est consommé : un second appel n'en laisse plus passer.
  const r2 = selectNewCardsForToday(news, { todayISO: '2026-07-30', pileSize: 200, state: r.state });
  assert.equal(r2.admitted.length, 5, 'les fiches déjà admises restent admises');
  assert.equal(r2.remaining, 0);
});
