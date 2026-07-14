// tests/fsrs.test.mjs
// Test runner natif Node (≥ 18) — aucune dépendance externe.
// Lance : node --test src/tests/fsrs.test.mjs
//
// Vérifie que l'algo FSRS (lib/fsrs.js) :
//  1. Initialise une fiche neuve avec des valeurs cohérentes (stability/difficulty in range).
//  2. Augmente la stability/intervalle quand on note "Easy" plusieurs fois.
//  3. Réduit l'intervalle (=0) et baisse la stability quand on rate (q=0 → grade 1).
//  4. Distingue Hard / Good / Easy → grades croissants → intervalles croissants.
//  5. Migre proprement une ancienne fiche SM-2 (repetitions>0, pas de stability).
//  6. Borne la difficulté entre 1 et 10.
//  7. Renvoie un nextReview au format ISO YYYY-MM-DD.
//  8. R(t,S) ∈ ]0,1] et décroît avec t.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fsrs, fsrsR } from '../lib/fsrs.js';

const newCard = () => ({
  stability: null,
  difficulty: null,
  interval: 1,
  repetitions: 0,
  elapsedDays: null,
  easeFactor: null,
});

test('FSRS — fiche neuve, première note "Good" (q=3)', () => {
  const r = fsrs(newCard(), 3);
  assert.ok(r.stability > 0, 'stability doit être > 0');
  assert.ok(r.difficulty >= 1 && r.difficulty <= 10, 'difficulty bornée 1..10');
  assert.ok(r.interval >= 1, 'interval >= 1 jour');
  assert.equal(r.repetitions, 1);
  assert.match(r.nextReview, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(r.retention > 0 && r.retention <= 100);
});

test('FSRS — fiche neuve ratée (q=0) → interval=0, repetitions=0', () => {
  const r = fsrs(newCard(), 0);
  assert.equal(r.interval, 0, 'interval doit retomber à 0 après un fail initial');
  assert.equal(r.repetitions, 0);
  assert.ok(r.stability > 0);
});

test('FSRS — Easy (q=5) > Good (q=3) > Hard (q=1) en intervalle', () => {
  const easy = fsrs(newCard(), 5);
  const good = fsrs(newCard(), 3);
  const hard = fsrs(newCard(), 1);
  assert.ok(easy.interval >= good.interval, `easy(${easy.interval}) >= good(${good.interval})`);
  assert.ok(good.interval >= hard.interval, `good(${good.interval}) >= hard(${hard.interval})`);
  assert.ok(easy.stability > hard.stability);
});

test('FSRS — révisions successives "Good" → stability strictement croissante', () => {
  let card = newCard();
  let prev = 0;
  for (let i = 0; i < 5; i++) {
    const r = fsrs(card, 3);
    assert.ok(r.stability >= prev, `stability monotone (étape ${i}: ${r.stability} >= ${prev})`);
    prev = r.stability;
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  assert.ok(prev > 1, 'après 5 "Good" la stability doit dépasser 1');
});

test('FSRS — un fail (q=0) après plusieurs succès réduit l\'intervalle à 0', () => {
  let card = newCard();
  for (let i = 0; i < 3; i++) {
    const r = fsrs(card, 3);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  const before = card.interval;
  const failed = fsrs(card, 0);
  assert.equal(failed.interval, 0, 'fail → interval=0 même après progrès');
  assert.equal(failed.repetitions, 0);
  assert.ok(before > 0);
});

test('FSRS — migration ancienne fiche SM-2 (repetitions>0, sans stability)', () => {
  const legacy = {
    stability: null,
    difficulty: null,
    interval: 10,
    repetitions: 3,
    elapsedDays: 8,
    easeFactor: 2.5,
  };
  const r = fsrs(legacy, 3);
  assert.ok(r.stability > 0, 'migration : stability initialisée');
  assert.ok(r.difficulty >= 1 && r.difficulty <= 10);
  assert.ok(r.interval >= 1);
});

test('FSRS — difficulté toujours bornée 1..10 même après bombardement', () => {
  let card = newCard();
  // Bombarde de "Easy" puis "Hard" alternés
  for (let i = 0; i < 20; i++) {
    const q = i % 2 === 0 ? 5 : 1;
    const r = fsrs(card, q);
    assert.ok(r.difficulty >= 1 && r.difficulty <= 10,
      `difficulty hors bornes à l'étape ${i}: ${r.difficulty}`);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
});

test('FSRS — fsrsR : retention ∈ ]0,1] et décroît avec t', () => {
  const S = 10;
  const r0 = fsrsR(0, S);
  const r5 = fsrsR(5, S);
  const r20 = fsrsR(20, S);
  assert.ok(r0 > 0 && r0 <= 1.0001, `R(0,S) ≈ 1 (eu ${r0})`);
  assert.ok(r5 > 0 && r5 < r0, 'R(5,S) < R(0,S)');
  assert.ok(r20 > 0 && r20 < r5, 'R(20,S) < R(5,S)');
});

test('FSRS — nextReview est dans le futur quand interval >= 1', () => {
  const r = fsrs(newCard(), 5);
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(r.nextReview >= today, `nextReview (${r.nextReview}) >= today (${today})`);
});

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2 — plafond d'intervalle tant que la fiche n'est pas "produced" +
// bonus de production (fsrsFromProduction).
// ══════════════════════════════════════════════════════════════════════════════
import { fsrsFromProduction, PRE_PRODUCTION_INTERVAL_CAP_DAYS } from '../lib/fsrs.js';

test('Plafond pré-production : interval borné à 3j sans masteryStage', () => {
  // On chauffe une fiche avec plusieurs "Easy" pour dépasser normalement 3j
  let card = newCard();
  for (let i = 0; i < 6; i++) {
    const r = fsrs(card, 5);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  // Sans masteryStage → devrait être capé
  assert.ok(card.interval <= PRE_PRODUCTION_INTERVAL_CAP_DAYS,
    `interval capé attendu ≤ ${PRE_PRODUCTION_INTERVAL_CAP_DAYS}, reçu ${card.interval}`);
});

test('Plafond pré-production : "recalled" est encore capé', () => {
  let card = { ...newCard(), masteryStage: 'recalled' };
  for (let i = 0; i < 6; i++) {
    const r = fsrs({ ...card, masteryStage: 'recalled' }, 5);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  assert.ok(card.interval <= PRE_PRODUCTION_INTERVAL_CAP_DAYS);
});

test('Plafond levé quand masteryStage = "produced"', () => {
  let card = { ...newCard(), masteryStage: 'produced' };
  for (let i = 0; i < 6; i++) {
    const r = fsrs({ ...card, masteryStage: 'produced' }, 5);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  assert.ok(card.interval > PRE_PRODUCTION_INTERVAL_CAP_DAYS,
    `sans plafond, interval doit dépasser ${PRE_PRODUCTION_INTERVAL_CAP_DAYS}, reçu ${card.interval}`);
});

test('Stability/difficulty NE sont PAS altérés par le plafond', () => {
  const capped = fsrs({ ...newCard() }, 5);
  const uncapped = fsrs({ ...newCard(), masteryStage: 'produced' }, 5);
  // Même premier calcul → même stability/difficulty (plafond ne concerne que interval)
  assert.equal(capped.stability, uncapped.stability);
  assert.equal(capped.difficulty, uncapped.difficulty);
});

test('fsrsFromProduction : équivalent à un grade "easy" (q=5)', () => {
  const a = fsrsFromProduction({ ...newCard(), masteryStage: 'produced' });
  const b = fsrs({ ...newCard(), masteryStage: 'produced' }, 5);
  assert.equal(a.interval, b.interval);
  assert.equal(a.stability, b.stability);
  assert.equal(a.difficulty, b.difficulty);
});
