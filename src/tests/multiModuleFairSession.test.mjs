import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDailySession } from '../lib/memoryLab.js';

const TODAY = '2026-10-09';
const YESTERDAY = '2026-10-08';
const LAST_WEEK = '2026-10-01';

const mkCard = (id, category, nextReview, over = {}) => ({
  id,
  front: `Question ${id}`,
  back: `Reponse ${id}`,
  category,
  nextReview,
  level: 2,
  repetitions: 3,
  interval: 5,
  reviewHistory: [],
  ...over,
});

test('Multi-module — les 35 fiches journalières incluent tous les modules ayant des fiches dues', () => {
  // 4 modules différents avec des fiches dues
  const cards = [
    // Module A (très en retard, 80 fiches)
    ...Array.from({ length: 80 }, (_, i) => mkCard(`a_${i}`, 'Informatique', LAST_WEEK)),
    // Module B (en retard, 20 fiches)
    ...Array.from({ length: 20 }, (_, i) => mkCard(`b_${i}`, 'Droit', YESTERDAY)),
    // Module C (dues aujourd\'hui, 15 fiches)
    ...Array.from({ length: 15 }, (_, i) => mkCard(`c_${i}`, 'Maths', TODAY)),
    // Module D (dues aujourd\'hui, 5 fiches)
    ...Array.from({ length: 5 }, (_, i) => mkCard(`d_${i}`, 'Histoire', TODAY)),
  ];

  const session = composeDailySession(cards, { target: 35, todayISO: TODAY });
  assert.equal(session.length, 35, 'la session fait 35 fiches');

  // Vérifier que CHAQUE module est représenté dans la session du jour
  const categoriesInSession = new Set(session.map((c) => c.category));
  assert.ok(categoriesInSession.has('Informatique'), 'Informatique doit être inclus');
  assert.ok(categoriesInSession.has('Droit'), 'Droit doit être inclus');
  assert.ok(categoriesInSession.has('Maths'), 'Maths doit être inclus');
  assert.ok(categoriesInSession.has('Histoire'), 'Histoire doit être inclus');

  // Vérifier qu\'un seul module n\'a pas confisqué 100% de la session
  const infoCount = session.filter((c) => c.category === 'Informatique').length;
  assert.ok(
    infoCount < 30,
    `Informatique ne doit pas monopoliser toute la session (actuellement ${infoCount}/35)`
  );
  const droitCount = session.filter((c) => c.category === 'Droit').length;
  const mathsCount = session.filter((c) => c.category === 'Maths').length;
  const histCount = session.filter((c) => c.category === 'Histoire').length;

  assert.ok(droitCount >= 1, 'Droit a au moins 1 fiche');
  assert.ok(mathsCount >= 1, 'Maths a au moins 1 fiche');
  assert.ok(histCount >= 1, 'Histoire a au moins 1 fiche');
});

test('Multi-module — répartition équitable round-robin quand la pile est volumineuse', () => {
  // 5 modules avec 40 fiches chacun
  const cats = ['Module_1', 'Module_2', 'Module_3', 'Module_4', 'Module_5'];
  const cards = [];
  for (const cat of cats) {
    for (let i = 0; i < 40; i++) {
      cards.push(mkCard(`${cat}_${i}`, cat, YESTERDAY));
    }
  }

  const session = composeDailySession(cards, { target: 35, todayISO: TODAY });
  assert.equal(session.length, 35);

  // Chacun des 5 modules doit avoir environ 7 fiches (35 / 5 = 7)
  for (const cat of cats) {
    const count = session.filter((c) => c.category === cat).length;
    assert.ok(
      count >= 5 && count <= 9,
      `${cat} doit recevoir une part équilibrée (~7), reçu ${count}`
    );
  }
});
