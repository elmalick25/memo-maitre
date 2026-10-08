import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNearMiss } from '../lib/nearMiss.js';

test('Near-miss — Badges à 0% doivent être EXCLUS (règle de véridicité)', () => {
  const result = computeNearMiss({
    badges: [
      { id: "mastered_real_1", label: "Vraie maîtrise", icon: "🥇", cur: 0, max: 1 },
      { id: "mastered_real_25", label: "Répertoire actif", icon: "🏅", cur: 0, max: 25 },
    ],
  });

  const badgeHook = result.find((h) => h.id.startsWith("badge:"));
  assert.equal(badgeHook, undefined, 'Aucun badge non commencé (cur === 0) ne doit être affiché en near-miss');
});

test('Near-miss — Badge entamé avec 1 restant doit afficher une formulation valorisante', () => {
  const result = computeNearMiss({
    badges: [
      { id: "streak_7", label: "Guerrier", icon: "🔥", cur: 6, max: 7 },
    ],
  });

  const badgeHook = result.find((h) => h.id === "badge:streak_7");
  assert.ok(badgeHook, 'Le badge entamé doit être affiché');
  assert.equal(badgeHook.text, 'Badge « Guerrier » : plus qu\'une validation !');
});

test('Near-miss — Quête du jour à 0/1 ne doit pas être redondante', () => {
  const result = computeNearMiss({
    totalXP: 50000,
    questState: {
      date: "2026-09-29",
      counters: { cardsCreated: 0 },
      daily: [
        { id: "create_1", target: 1, counter: "cardsCreated", icon: "📝", label: "1 fiche créée", xp: 35 },
      ],
      weekly: null,
    },
  });

  const questHook = result.find((h) => h.id === "quest:create_1");
  assert.ok(questHook, 'La quête doit être affichée');
  assert.equal(questHook.text, 'Quête : « 1 fiche créée » (+35 XP)', 'Ne doit pas dire "Plus que 1 pour boucler 1 fiche"');
});

test('Near-miss — Quête en cours avec 1 étape restante', () => {
  const result = computeNearMiss({
    totalXP: 50000,
    questState: {
      date: "2026-09-29",
      counters: { cardsCreated: 2 },
      daily: [
        { id: "create_3", target: 3, counter: "cardsCreated", icon: "🧠", label: "3 fiches créées", xp: 60 },
      ],
      weekly: null,
    },
  });

  const questHook = result.find((h) => h.id === "quest:create_3");
  assert.ok(questHook, 'La quête doit être affichée');
  assert.equal(questHook.text, 'Plus qu\'une étape pour valider « 3 fiches créées » (+60 XP)');
});

test('Near-miss — Tri déterministe et stable', () => {
  const input = {
    totalXP: 50000, // XP élevée pour éviter que le hook 'level' ne passe devant
    badges: [
      { id: "b_badge", label: "B", cur: 4, max: 5 },
      { id: "a_badge", label: "A", cur: 4, max: 5 },
    ],
  };

  const res1 = computeNearMiss(input);
  const res2 = computeNearMiss(input);

  assert.equal(res1[0].id, res2[0].id, 'Le tri doit être déterministe et reproductible');
  assert.equal(res1[0].id, 'badge:a_badge', 'Le tie-breaker alphabétique par ID doit classer A avant B');
});
