// tests/dailyPlan.test.mjs — Couche 9 : plan du jour persistant
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  makeDailyPlan,
  normalizeDailyPlan,
  buildDailyPlan,
  markCardDone,
  remainingByCategory,
  remainingForCategory,
} from '../lib/dailyPlan.js';
import { isDueCard, getDueCards } from '../lib/cardStatus.js';

const TODAY = '2026-08-02';
const YESTERDAY = '2026-08-01';

const mkCards = (n, opts = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    front: `f${i}`,
    category: opts.category || (i % 2 === 0 ? 'Maths' : 'Anglais'),
    level: 2,
    interval: 3,
    repetitions: 2,
    stability: 3,
    nextReview: YESTERDAY,
    ...opts.extra,
  }));

// ── 1. Le plafond descend réellement quand on révise ───────────────────────
test('couche9 : le restant du jour décroît fiche par fiche (bug "toujours 35")', () => {
  const due = mkCards(200);
  let { plan, remainingCount, target } = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  assert.equal(target, 35, 'grosse pile ⇒ plafond 35');
  assert.equal(remainingCount, 35);

  // On révise 20 fiches ; elles sortent de la pile due (nextReview futur).
  const doneIds = plan.ids.slice(0, 20);
  for (const id of doneIds) plan = markCardDone(plan, id, TODAY);
  const stillDue = due.filter((c) => !doneIds.includes(c.id));

  const after = buildDailyPlan({ plan, dueCards: stillDue, todayISO: TODAY });
  assert.equal(after.doneCount, 20);
  assert.equal(after.remainingCount, 15, 'on doit voir 15, pas 35');
  assert.equal(after.plannedCount, 35, 'le quota du jour reste 35, il ne se recharge pas');
});

test('couche9 : une seule fiche révisée ⇒ 35 devient 34', () => {
  const due = mkCards(120);
  const first = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  const one = first.plan.ids[0];
  const plan = markCardDone(first.plan, one, TODAY);
  const after = buildDailyPlan({ plan, dueCards: due.filter((c) => c.id !== one), todayISO: TODAY });
  assert.equal(after.remainingCount, first.remainingCount - 1);
});

// ── 2. Le plan est STABLE dans la journée ──────────────────────────────────
test('couche9 : les mêmes fiches sont servies à chaque entrée dans la journée', () => {
  const due = mkCards(200);
  const a = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  const b = buildDailyPlan({ plan: a.plan, dueCards: due, todayISO: TODAY });
  assert.deepEqual(b.plan.ids, a.plan.ids);
  assert.deepEqual(b.remaining.map((c) => c.id), a.remaining.map((c) => c.id));
});

test('couche9 : le plafond ne remonte pas quand la pile fond', () => {
  const due = mkCards(200);
  const a = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  // Pile tombée sous le palier (< 50) : le plafond du jour reste scellé à 35.
  const b = buildDailyPlan({ plan: a.plan, dueCards: due.slice(0, 40), todayISO: TODAY });
  assert.equal(b.target, 35);
  assert.ok(b.plannedCount <= 35);
});

// ── 3. Nouveau jour ⇒ nouveau quota ────────────────────────────────────────
test('couche9 : changement de date ⇒ plan remis à zéro', () => {
  const due = mkCards(200);
  const a = buildDailyPlan({ plan: null, dueCards: due, todayISO: YESTERDAY });
  const plan = markCardDone(a.plan, a.plan.ids[0], YESTERDAY);
  const b = buildDailyPlan({ plan, dueCards: due, todayISO: TODAY });
  assert.equal(b.doneCount, 0);
  assert.equal(b.remainingCount, 35);
  assert.equal(b.plan.date, TODAY);
});

// ── 4. Petite pile : aucun plafond ─────────────────────────────────────────
test('couche9 : pile < 50 ⇒ aucun plafond, tout est servi', () => {
  const due = mkCards(12);
  const r = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  assert.equal(r.target, null);
  assert.equal(r.remainingCount, 12);
  assert.equal(r.capped, false);
});

test('couche9 : pile moyenne (50-150) ⇒ plafond 45', () => {
  const r = buildDailyPlan({ plan: null, dueCards: mkCards(100), todayISO: TODAY });
  assert.equal(r.target, 45);
  assert.equal(r.remainingCount, 45);
});

// ── 5. Fiche notée "Again" : toujours due mais déjà faite aujourd'hui ──────
test('couche9 : une fiche ratée (Again) reste due mais ne regonfle pas le restant du jour', () => {
  const due = mkCards(200);
  const a = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  const again = a.plan.ids[0];
  const plan = markCardDone(a.plan, again, TODAY);
  // La fiche est rééchelonnée à aujourd'hui ⇒ elle est TOUJOURS dans dueCards.
  const b = buildDailyPlan({ plan, dueCards: due, todayISO: TODAY });
  assert.equal(b.remainingCount, 34);
  assert.ok(!b.remaining.some((c) => c.id === again), 'déjà traitée aujourd\'hui');
});

// ── 6. Révision hors plan (bonus / examen) ─────────────────────────────────
test('couche9 : une révision bonus hors plan ne fait jamais remonter le restant', () => {
  const due = mkCards(200);
  const a = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  const outsider = due.find((c) => !a.plan.ids.includes(c.id));
  const plan = markCardDone(a.plan, outsider.id, TODAY);
  const b = buildDailyPlan({ plan, dueCards: due.filter((c) => c.id !== outsider.id), todayISO: TODAY });
  assert.equal(b.remainingCount, 35);
  assert.equal(b.doneCount, 1);
  assert.equal(b.plannedCount, 36);
});

// ── 7. Cohérence par module (bug de la constellation) ──────────────────────
test('couche9 : la somme des modules est exactement le restant du jour', () => {
  const due = [
    ...mkCards(80, { category: 'Maths' }).map((c, i) => ({ ...c, id: `m${i}` })),
    ...mkCards(80, { category: 'Anglais' }).map((c, i) => ({ ...c, id: `a${i}` })),
    ...mkCards(80, { category: 'Histoire' }).map((c, i) => ({ ...c, id: `h${i}` })),
  ];
  const r = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  const byCat = remainingByCategory(r.remaining);
  const sum = [...byCat.values()].reduce((s, n) => s + n, 0);
  assert.equal(sum, r.remainingCount);
  assert.equal(sum, 35, 'aucun module ne peut afficher plus que sa part des 35');
  for (const [cat, n] of byCat) {
    assert.equal(n, remainingForCategory(r.remaining, cat));
    assert.ok(n <= 35);
  }
});

// ── 8. Robustesse ──────────────────────────────────────────────────────────
test('couche9 : plan corrompu / vide ⇒ reconstruit sans planter', () => {
  assert.deepEqual(normalizeDailyPlan(null, TODAY), makeDailyPlan(TODAY));
  assert.deepEqual(normalizeDailyPlan('nope', TODAY), makeDailyPlan(TODAY));
  assert.deepEqual(normalizeDailyPlan({ date: TODAY, ids: 'x', doneIds: null }, TODAY).ids, []);
  const r = buildDailyPlan({ plan: undefined, dueCards: null, todayISO: TODAY });
  assert.equal(r.remainingCount, 0);
  assert.equal(r.completed, false);
});

test('couche9 : fiches supprimées entre deux rendus ⇒ retirées du restant', () => {
  const due = mkCards(200);
  const a = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  const deleted = new Set(a.plan.ids.slice(0, 5));
  const b = buildDailyPlan({ plan: a.plan, dueCards: due.filter((c) => !deleted.has(c.id)), todayISO: TODAY });
  assert.equal(b.remainingCount, 35, 'les places libérées sont recomblées le même jour');
  assert.ok(b.plan.ids.every((id) => !deleted.has(id)));
});

test('couche9 : journée terminée ⇒ completed = true et restant = 0', () => {
  const due = mkCards(60);
  let r = buildDailyPlan({ plan: null, dueCards: due, todayISO: TODAY });
  let plan = r.plan;
  for (const id of plan.ids) plan = markCardDone(plan, id, TODAY);
  const done = new Set(plan.doneIds);
  r = buildDailyPlan({ plan, dueCards: due.filter((c) => !done.has(c.id)), todayISO: TODAY });
  assert.equal(r.remainingCount, 0);
  assert.equal(r.completed, true);
});

// ── 9. Filtre "due" unifié ─────────────────────────────────────────────────
test('couche9 : isDueCard exclut pause, maîtrisées et échéances futures', () => {
  assert.equal(isDueCard({ nextReview: YESTERDAY, level: 2 }, TODAY), true);
  assert.equal(isDueCard({ nextReview: TODAY, level: 2 }, TODAY), true);
  assert.equal(isDueCard({ nextReview: '2026-09-01', level: 2 }, TODAY), false);
  assert.equal(isDueCard({ nextReview: YESTERDAY, level: 7 }, TODAY), false);
  assert.equal(isDueCard({ nextReview: YESTERDAY, level: 2, paused: true }, TODAY), false);
  assert.equal(isDueCard({ nextReview: YESTERDAY, masteryStage: 'produced' }, TODAY), false);
  assert.equal(getDueCards([{ id: 1, nextReview: YESTERDAY, level: 1 }, { id: 2, level: 7 }], TODAY).length, 1);
});

// ── 10. Bug « 244 à réviser » : plan scellé sans plafond puis pile qui grossit ─
test('couche9 : un plan scellé sans plafond est re-plafonné quand la pile grossit', () => {
  // Matin : petite pile (< 50) ⇒ palier « aucun plafond » (target null).
  const small = mkCards(20);
  const a = buildDailyPlan({ plan: null, dueCards: small, todayISO: TODAY });
  assert.equal(a.remainingCount, 20);

  // Plus tard : 244 fiches dues (import, déverrouillages, échéances).
  const big = mkCards(244);
  const b = buildDailyPlan({ plan: a.plan, dueCards: big, todayISO: TODAY });
  assert.equal(b.target, 35);
  assert.equal(b.remainingCount, 35, 'le compteur ne doit jamais afficher 244');
  assert.equal(b.plan.ids.length, 35);
});

test('couche9 : un plan déjà corrompu en storage (244 ids) est réparé au chargement', () => {
  const due = mkCards(244);
  const corrupted = { date: TODAY, target: null, sealed: true, ids: due.map((c) => c.id), doneIds: [] };
  const r = buildDailyPlan({ plan: corrupted, dueCards: due, todayISO: TODAY });
  assert.equal(r.remainingCount, 35);
  const sum = [...remainingByCategory(r.remaining).values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, 35, 'somme des modules === restant du jour');
});

test('couche9 : le plafond re-borné ne supprime jamais le travail déjà fait', () => {
  const small = mkCards(20);
  let plan = buildDailyPlan({ plan: null, dueCards: small, todayISO: TODAY }).plan;
  for (const id of plan.ids.slice(0, 12)) plan = markCardDone(plan, id, TODAY);
  const big = mkCards(244);
  const r = buildDailyPlan({ plan, dueCards: big.filter((c) => !plan.doneIds.includes(c.id)), todayISO: TODAY });
  assert.equal(r.doneCount, 12);
  assert.equal(r.remainingCount, 23, '35 - 12 déjà faites');
});
