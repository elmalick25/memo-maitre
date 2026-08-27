// tests/englishSubQuota.test.mjs — sous-quota anglais dans la session du jour
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  composeDailySession,
  getEnglishSubQuota,
  ENGLISH_DAILY_SUBQUOTA,
} from '../lib/memoryLab.js';
import { buildDailyPlan } from '../lib/dailyPlan.js';
import { isEnglishIntensive } from '../lib/fsrs.js';

const TODAY = '2026-08-02';

const mk = (id, category, over = {}) => ({
  id,
  front: `question ${id}`,
  back: `reponse ${id}`,
  category,
  nextReview: '2026-07-20',
  level: 2,
  interval: 3,
  repetitions: 2,
  stability: 3,
  reviewHistory: [],
  ...over,
});

const englishCards = (n, over = {}) =>
  Array.from({ length: n }, (_, i) => mk(`e${i}`, '🇬🇧 Anglais', over));
const otherCards = (n, over = {}) =>
  Array.from({ length: n }, (_, i) => mk(`m${i}`, 'Maths', over));

test('sous-quota : 8-10 slots max, jamais plus, pour une cible de 35', () => {
  assert.equal(getEnglishSubQuota(35), 10);
  assert.equal(getEnglishSubQuota(45), 10);
  assert.equal(getEnglishSubQuota(20), ENGLISH_DAILY_SUBQUOTA.min);
  assert.equal(getEnglishSubQuota(null), null, 'pas de plafond du jour ⇒ pas de sous-quota');
});

test("l'anglais intensif ne peut jamais manger plus que son sous-quota des 35", () => {
  const cards = [...englishCards(150), ...otherCards(150)];
  const session = composeDailySession(cards, { todayISO: TODAY, target: 35 });
  assert.equal(session.length, 35);
  const eng = session.filter((c) => isEnglishIntensive(c));
  assert.ok(eng.length <= 10, `anglais attendu ≤ 10, reçu ${eng.length}`);
  assert.ok(session.length - eng.length >= 25, 'les autres modules gardent au moins 25 slots');
});

test('anglais sorti du régime intensif ⇒ non concerné par le sous-quota', () => {
  const graduated = englishCards(150, { masteryStage: 'recalled', interval: 14, repetitions: 5 });
  const session = composeDailySession([...graduated, ...otherCards(150)], { todayISO: TODAY, target: 35 });
  const intensive = session.filter((c) => isEnglishIntensive(c));
  assert.equal(intensive.length, 0);
  assert.equal(session.length, 35);
});

test("le sous-quota est un plafond, pas un plancher : peu d'anglais ⇒ pas de slot gaspillé", () => {
  const session = composeDailySession([...englishCards(3), ...otherCards(150)], { todayISO: TODAY, target: 35 });
  assert.equal(session.length, 35);
  assert.equal(session.filter((c) => isEnglishIntensive(c)).length, 3);
});

test("débordement autorisé si personne d'autre ne réclame les slots", () => {
  const session = composeDailySession([...englishCards(150), ...otherCards(5)], { todayISO: TODAY, target: 35 });
  assert.equal(session.length, 35, 'aucun slot perdu');
  assert.ok(session.filter((c) => isEnglishIntensive(c)).length >= 30);
});

test('les leeches anglais restent prioritaires DANS le sous-quota', () => {
  const leech = { reviewHistory: [{ q: 0 }, { q: 0 }, { q: 0 }, { q: 0 }, { q: 0 }], lapseCount: 5 };
  const cards = [
    ...englishCards(100),
    mk('leech1', '🇬🇧 Anglais', leech),
    mk('leech2', '🇬🇧 Anglais', leech),
    ...otherCards(100),
  ];
  const ids = new Set(composeDailySession(cards, { todayISO: TODAY, target: 35 }).map((c) => c.id));
  assert.ok(ids.has('leech1') && ids.has('leech2'), 'les leeches anglais doivent passer en premier');
});

test('le plan du jour reste à 35 avec le sous-quota actif', () => {
  const due = [...englishCards(150), ...otherCards(150)];
  const r = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  assert.equal(r.target, 35);
  assert.equal(r.remainingCount, 35);
  const eng = r.remaining.filter((c) => isEnglishIntensive(c));
  assert.ok(eng.length <= 10, `anglais dans le plan ≤ 10, reçu ${eng.length}`);
});
