// src/tests/dailyFluencySprint.test.mjs — Tests d'intégrité du Sprint Quotidien de Fluidité
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getExpressionsNeedingProduction, recordProductiveUse, computeMasteryStage } from '../lib/masteryStages.js';
import { fsrsFromProduction } from '../lib/fsrs.js';

test('DailyFluencySprint — Fichier composant existe et possède les 4 phases maîtresses', () => {
  const filePath = path.resolve('src/components/DailyFluencySprint.jsx');
  assert.ok(fs.existsSync(filePath), 'DailyFluencySprint.jsx doit exister dans src/components/');
  const content = fs.readFileSync(filePath, 'utf8');

  // Vérification des 4 phases
  assert.ok(content.includes('SHADOWING_BENCHMARKS'), 'Doit contenir les benchmarks de Shadowing');
  assert.ok(content.includes('Phase 1'), 'Doit inclure la Phase 1 (Shadowing)');
  assert.ok(content.includes('Phase 2'), 'Doit inclure la Phase 2 (FSRS Spoken Recall)');
  assert.ok(content.includes('Phase 3'), 'Doit inclure la Phase 3 (Live Nova Duplex)');
  assert.ok(content.includes('Phase 4'), 'Doit inclure la Phase 4 (Native Polish)');
  assert.ok(content.includes('LiveKitVoiceAssistant'), 'Doit intégrer LiveKitVoiceAssistant pour la voix live');
});

test('DailyFluencySprint — Tirage des 3 expressions FSRS nécessitant de la production orale', () => {
  const cards = [
    { id: '1', front: 'bottleneck', category: '🇬🇧 Anglais', repetitions: 3, interval: 7, masteryStage: 'recalled' },
    { id: '2', front: 'frictionless', category: '🇬🇧 Anglais', repetitions: 4, interval: 10, masteryStage: 'recalled' },
    { id: '3', front: 'deliverables', category: '🇬🇧 Anglais', repetitions: 2, interval: 5, masteryStage: 'recalled' },
    { id: '4', front: 'overload', category: '🇬🇧 Anglais', repetitions: 1, interval: 1, masteryStage: 'recognized' },
  ];

  const targets = getExpressionsNeedingProduction(cards, 3);
  assert.equal(targets.length, 3, 'Doit sélectionner exactement 3 fiches recalled');
  assert.ok(targets.every(t => t.masteryStage === 'recalled'), 'Toutes les cibles doivent être au stade recalled');
});

test('DailyFluencySprint — Validation de la production orale met à jour le stage vers produced puis mastered', () => {
  const card = {
    id: 'exp-1',
    front: 'on the same page',
    category: '🇬🇧 Anglais',
    repetitions: 3,
    interval: 8,
    masteryStage: 'recalled',
    productiveUses: [],
  };

  // 1ère production orale réussie
  const produced = recordProductiveUse(card, {
    context: 'voice',
    correct: true,
    note: 'Sprint oral test',
    date: new Date().toISOString(),
  });

  assert.equal(produced.masteryStage, 'produced', 'Une production correcte doit promouvoir la fiche en "produced"');
  assert.equal(produced.productiveUses.length, 1);

  // FSRS à partir de la production
  const fsrsUpdated = fsrsFromProduction(produced, true);
  assert.ok(fsrsUpdated.interval >= produced.interval, 'Intervalle FSRS doit être incrémenté');
});

test('EnglishPractice.jsx — Affiche par défaut le DailyFluencySprint et les 4 Piliers', () => {
  const epPath = path.resolve('src/EnglishPractice.jsx');
  const src = fs.readFileSync(epPath, 'utf8');

  assert.ok(src.includes('import DailyFluencySprint'), 'EnglishPractice doit importer DailyFluencySprint');
  assert.ok(src.includes('practiceSubView === "sprint"'), 'EnglishPractice doit gérer le mode sprint');
  assert.ok(src.includes('DailyFluencySprint'), 'EnglishPractice doit rendre le composant DailyFluencySprint');
  assert.ok(src.includes('Piliers'), 'La barre de navigation doit afficher les Piliers majeurs');
});

test('AccentTraining.jsx — Intègre le Dojo Phonétique avec connected speech et scoring', () => {
  const atPath = path.resolve('src/components/AccentTraining.jsx');
  const src = fs.readFileSync(atPath, 'utf8');

  assert.ok(src.includes('PROBLEMATIC_SOUNDS'), 'Doit définir les sons problématiques');
  assert.ok(src.includes('connected_speech'), 'Doit inclure le Connected Speech et Contractions');
  assert.ok(src.includes('discrimination'), 'Doit proposer l\'exercice de discrimination auditive');
  assert.ok(src.includes('pronunciation'), 'Doit proposer l\'exercice de prononciation ciblée');
  assert.ok(src.includes('phrases'), 'Doit proposer les phrases en contexte');
});
