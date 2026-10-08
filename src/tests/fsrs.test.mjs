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
//  9. Matrice prédictive 4-boutons ({again, hard, good, easy}).
// 10. Rétention cible dynamique et calcul d'intervalles précis.
// 11. Boîte à outils cognitive (predictRetentionAt, optimalDate, memoryHealth, simulateTrajectory).
// 12. Fuzzing d'intervalle et presets de domaines.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fsrs,
  fsrsR,
  fsrsFromProduction,
  PRE_PRODUCTION_INTERVAL_CAP_DAYS,
  ENGLISH_INTENSIVE_LADDER,
  ENGLISH_INTENSIVE_EXIT_INTERVAL,
  isEnglishIntensive,
  nextIntensiveInterval,
  isIncubationEligible,
  incubationProgress,
  ENGLISH_INCUBATION_DAYS,
  calculateCardNextStates,
  predictRetentionAt,
  calculateOptimalReviewDate,
  getMemoryHealth,
  simulateTrajectory,
  calculateNextInterval,
  applyIntervalFuzz,
  formatInterval,
  FSRS_PRESETS,
} from '../lib/fsrs.js';

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
  assert.ok(r.stability > 0, 'la stabilité initiale doit être initialisée');
  assert.ok(r.difficulty > 5, 'la difficulté initiale après un échec doit être élevée');
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
// Régime intensif anglais & incubation
// ══════════════════════════════════════════════════════════════════════════════

test('Régime intensif : sans masteryStage, délais adaptatifs (rétention 93 %) plafonnés à 14j', () => {
  let card = { ...newCard(), category: '🇬🇧 Anglais' };
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const r = fsrs(card, 5);
    seen.push(r.interval);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], 'délais croissants');
  assert.ok(seen.every((i) => i >= 1 && i <= ENGLISH_INTENSIVE_EXIT_INTERVAL));
  const plain = fsrs(newCard(), 5);
  assert.ok(seen[0] <= plain.interval, 'rétention 93 % ⇒ jamais plus long que le régime standard');
  assert.equal(card.interval, ENGLISH_INTENSIVE_EXIT_INTERVAL, 'plafonnée à 14j sans stade recalled');
});

test('Plafond levé pour "recalled" (fiche déjà stable, pression de production déléguée aux missions)', () => {
  let card = { ...newCard(), category: '🇬🇧 Anglais', masteryStage: 'recalled' };
  for (let i = 0; i < 6; i++) {
    const r = fsrs({ ...card, category: '🇬🇧 Anglais', masteryStage: 'recalled' }, 5);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  assert.ok(card.interval > PRE_PRODUCTION_INTERVAL_CAP_DAYS,
    `"recalled" ne doit plus être capé : interval attendu > ${PRE_PRODUCTION_INTERVAL_CAP_DAYS}, reçu ${card.interval}`);
});

test('Régime intensif maintenu pour "recognized" : plafonné au dernier palier (14j)', () => {
  let card = { ...newCard(), category: '🇬🇧 Anglais', masteryStage: 'recognized' };
  for (let i = 0; i < 8; i++) {
    const r = fsrs({ ...card, category: '🇬🇧 Anglais', masteryStage: 'recognized' }, 5);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  assert.equal(card.interval, ENGLISH_INTENSIVE_EXIT_INTERVAL,
    `"recognized" reste sur l'échelle : interval attendu ${ENGLISH_INTENSIVE_EXIT_INTERVAL}, reçu ${card.interval}`);
  assert.equal(isEnglishIntensive({ ...card, category: '🇬🇧 Anglais', masteryStage: 'recognized' }), true);
});

test('Double condition de sortie : stade recalled SEUL ne suffit pas si le dernier palier n\'est pas atteint', () => {
  const young = { category: '🇬🇧 Anglais', masteryStage: 'recalled', interval: 3, repetitions: 2 };
  assert.equal(isEnglishIntensive(young), true, 'recalled mais palier 3j ⇒ encore intensif');

  const graduated = { category: '🇬🇧 Anglais', masteryStage: 'recalled', interval: ENGLISH_INTENSIVE_EXIT_INTERVAL, repetitions: 4 };
  assert.equal(isEnglishIntensive(graduated), false, 'recalled + dernier palier ⇒ sortie du régime');

  const stuck = { category: '🇬🇧 Anglais', masteryStage: 'discovered', interval: ENGLISH_INTENSIVE_EXIT_INTERVAL, repetitions: 4 };
  assert.equal(isEnglishIntensive(stuck), true, 'dernier palier SEUL ne suffit pas non plus');
});

test('Régime intensif : un échec ramène la fiche à 1j', () => {
  let card = { ...newCard(), category: '🇬🇧 Anglais' };
  for (let i = 0; i < 3; i++) {
    const r = fsrs(card, 5);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  assert.ok(card.interval > 1);
  const failed = fsrs(card, 0);
  assert.equal(failed.interval, 0, 'échec ⇒ à revoir aujourd\'hui');
  const back = fsrs({ ...card, ...failed }, 5);
  assert.equal(back.interval, 1, 'après un échec, retour le lendemain');
});

test('Temps de réponse : Correct lent ⇒ Difficile, seuil selon le type', () => {
  const slowQa = fsrs({ ...newCard(), type: 'qa' }, 3, { responseMs: 20000 });
  assert.equal(slowQa.reviewHistoryEntry.q, 1);
  assert.equal(slowQa.reviewHistoryEntry.latencyAdjusted, true);
  assert.equal(slowQa.reviewHistoryEntry.responseMs, 20000);
  const slowCode = fsrs({ ...newCard(), type: 'code' }, 3, { responseMs: 20000 });
  assert.equal(slowCode.reviewHistoryEntry.q, 3, '20s reste correct pour du code');
  const easy = fsrs({ ...newCard(), type: 'qa' }, 5, { responseMs: 60000 });
  assert.equal(easy.reviewHistoryEntry.q, 5, 'jamais modifié hors Correct');
});

test('nextIntensiveInterval : ne dépasse jamais l\'intervalle FSRS proposé', () => {
  assert.equal(nextIntensiveInterval(0, 40), 1);
  assert.equal(nextIntensiveInterval(1, 40), 3);
  assert.equal(nextIntensiveInterval(3, 40), 7);
  assert.equal(nextIntensiveInterval(7, 40), 14);
  assert.equal(nextIntensiveInterval(14, 40), 14);
  assert.equal(nextIntensiveInterval(3, 5), 5, 'FSRS propose moins que le palier ⇒ on garde FSRS');
});

test('Hors anglais : jamais de régime intensif, quel que soit le stade', () => {
  assert.equal(isEnglishIntensive({ category: '💻 Dev', interval: 1 }), false);
  assert.equal(PRE_PRODUCTION_INTERVAL_CAP_DAYS, 3, 'constante historique conservée pour compat');
});

test('Plafond levé quand masteryStage = "produced"', () => {
  let card = { ...newCard(), category: '🇬🇧 Anglais', masteryStage: 'produced' };
  for (let i = 0; i < 6; i++) {
    const r = fsrs({ ...card, category: '🇬🇧 Anglais', masteryStage: 'produced' }, 5);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  assert.ok(card.interval > PRE_PRODUCTION_INTERVAL_CAP_DAYS,
    `sans plafond, interval doit dépasser ${PRE_PRODUCTION_INTERVAL_CAP_DAYS}, reçu ${card.interval}`);
});

test('Stability/difficulty NE sont PAS altérés par le plafond', () => {
  const capped = fsrs({ ...newCard() }, 5);
  const uncapped = fsrs({ ...newCard(), masteryStage: 'produced' }, 5);
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

test('Hors anglais : aucun plafond pré-production', () => {
  let card = { ...newCard(), category: '💻 Dev' };
  for (let i = 0; i < 6; i++) {
    const r = fsrs({ ...card, category: '💻 Dev' }, 5);
    card = { ...card, ...r, elapsedDays: r.interval };
  }
  assert.ok(card.interval > PRE_PRODUCTION_INTERVAL_CAP_DAYS,
    `une fiche non-anglaise ne doit pas être capée, reçu ${card.interval}`);
});

test('Incubation — éligibilité et progression', () => {
  const card = { category: '🇬🇧 Anglais', incubation: true };
  assert.equal(isIncubationEligible(card), true);
  assert.deepEqual(incubationProgress(card), {
    active: true,
    days: 0,
    total: ENGLISH_INCUBATION_DAYS,
    remaining: 7,
  });

  const recalledCard = { category: '🇬🇧 Anglais', incubation: true, masteryStage: 'recalled' };
  assert.equal(isIncubationEligible(recalledCard), false);

  const doneCard = { category: '🇬🇧 Anglais', incubation: true, incubationDone: true };
  assert.equal(isIncubationEligible(doneCard), false);
});

test('Incubation — révisions quotidiennes maintiennent interval à 1 jusqu\'à terminaison', () => {
  let card = { ...newCard(), category: '🇬🇧 Anglais', incubation: true };
  const r1 = fsrs(card, 3);
  assert.equal(r1.interval, 1);
  assert.equal(r1.incubationDays, 1);
  assert.equal(r1.incubationDone, false);

  card = { ...card, ...r1, incubationDays: 6, incubationLastDay: '2026-08-26' };
  const rFinal = fsrs(card, 3);
  assert.equal(rFinal.incubationDays, 7);
  assert.equal(rFinal.incubationDone, true);
  assert.ok(rFinal.interval <= 3);
});

// ══════════════════════════════════════════════════════════════════════════════
// Nouvelles capacités FSRS-5 & Boîte à Outils Cognitive (De 1 à 100)
// ══════════════════════════════════════════════════════════════════════════════

test('FSRS v5 — calculateNextInterval avec rétention cible personnalisée', () => {
  const S = 30; // 30 jours de stabilité
  const int85 = calculateNextInterval(S, 0.85);
  const int90 = calculateNextInterval(S, 0.90);
  const int95 = calculateNextInterval(S, 0.95);

  assert.ok(int85 > int90, 'Une rétention plus basse donne un intervalle plus long');
  assert.ok(int90 > int95, 'Une rétention plus haute resserre les révisions');
});

test('FSRS v5 — calculateCardNextStates génère la matrice 4 boutons', () => {
  const card = { stability: 12, difficulty: 4.5, interval: 10, repetitions: 3, category: '💻 Dev' };
  const matrix = calculateCardNextStates(card);

  assert.ok(matrix.again && matrix.hard && matrix.good && matrix.easy);
  assert.equal(matrix.again.interval, 0);
  assert.ok(matrix.easy.interval >= matrix.good.interval);
  assert.ok(matrix.good.interval >= matrix.hard.interval);
  assert.match(matrix.good.intervalLabel, /\d+[jma]/);
});

test('FSRS v5 — predictRetentionAt calcule la décroissance temporelle', () => {
  const card = { stability: 20, lastReviewDate: '2026-08-01' };
  const rDay1 = predictRetentionAt(card, '2026-08-02');
  const rDay20 = predictRetentionAt(card, '2026-08-21');
  const rDay60 = predictRetentionAt(card, '2026-09-30');

  assert.ok(rDay1 > 0.98);
  assert.ok(rDay20 < rDay1);
  assert.ok(rDay60 < rDay20);
});

test('FSRS v5 — calculateOptimalReviewDate identifie la date cible', () => {
  const card = { stability: 10, lastReviewDate: '2026-08-01' };
  const optimalDate = calculateOptimalReviewDate(card, 0.90);
  assert.match(optimalDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(optimalDate > '2026-08-01');
});

test('FSRS v5 — getMemoryHealth détecte les cartes maîtrisées et les sangsues', () => {
  const leechCard = { stability: 1.2, difficulty: 8.5, lapseCount: 4, repetitions: 5 };
  const leechHealth = getMemoryHealth(leechCard);
  assert.equal(leechHealth.status, 'leech');

  const masteredCard = { stability: 120, difficulty: 2.5, repetitions: 8, interval: 100 };
  const masteredHealth = getMemoryHealth(masteredCard);
  assert.equal(masteredHealth.status, 'mastered');
});

test('FSRS v5 — simulateTrajectory projette plusieurs révisions consécutives', () => {
  const initial = newCard();
  const trajectory = simulateTrajectory(initial, [3, 3, 5, 3]);
  assert.equal(trajectory.length, 4);
  assert.ok(trajectory[3].stability > trajectory[0].stability);
  assert.ok(trajectory[3].interval > trajectory[0].interval);
});

test('FSRS v5 — applyIntervalFuzz étale les longs intervalles', () => {
  const fuzzed10 = applyIntervalFuzz(10, { seed: 0.9 });
  assert.ok(fuzzed10 >= 8 && fuzzed10 <= 12);
  const fuzzedShort = applyIntervalFuzz(2);
  assert.equal(fuzzedShort, 2, 'Pas de fuzzing sur les petits intervalles (< 3)');
});

test('FSRS v5 — Presets spécialisés (STEM vs Language)', () => {
  const card = newCard();
  const langResult = fsrs(card, 3, { weights: FSRS_PRESETS.LANGUAGE });
  const stemResult = fsrs(card, 3, { weights: FSRS_PRESETS.STEM });

  assert.ok(langResult.stability > 0);
  assert.ok(stemResult.stability > 0);
  assert.notEqual(langResult.difficulty, stemResult.difficulty);
});

test('FSRS v5 — formatInterval affiche les abréviations appropriées', () => {
  assert.equal(formatInterval(0), '< 1j');
  assert.equal(formatInterval(5), '5j');
  assert.equal(formatInterval(60), '2m');
  assert.equal(formatInterval(400), '1.1a');
});
