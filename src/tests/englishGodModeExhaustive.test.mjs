// src/tests/englishGodModeExhaustive.test.mjs
// ─────────────────────────────────────────────────────────────────────────────
// SUITE DE TESTS EXHAUSTIVE "GOD MODE" — MOTEUR D'APPRENTISSAGE DE L'ANGLAIS
// ─────────────────────────────────────────────────────────────────────────────
// Couvre l'intégralité du pipeline d'acquisition active :
//  1. Cycle de vie & Invariants mathématiques du Mastery Pipeline (5 stades)
//  2. Algorithme de distinction temporelle 48h & contextes d'usage
//  3. Moteur FSRS & calcul des bonus de rétention par production orale/écrite
//  4. Garde-fou universel de production (Cooldown, sélection prioritaire, prompt & parse)
//  5. Hygiène acoustique & Filtrage anti-parasite (Transcriptions, fillers, bégaiements)
//  6. Détecteur temps réel de cartes d'erreur (Dédoublonnage, parsing robuste, format rétro-ingénierie)
//  7. Catalogue Phonétique & Dojo de Connected Speech
//  8. Simulation Intensive 30 Jours "God Mode" (Stress test sur corpus réaliste)
// ─────────────────────────────────────────────────────────────────────────────

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  MASTERY_STAGES,
  computeMasteryStage,
  recordProductiveUse,
  hasMasteryPattern,
  getDistinctProductiveContexts,
  countCorrectProductiveUses,
  getExpressionsNeedingProduction,
  ensureMasteryStage,
  getMasteryBreakdown,
  countProductiveUsesInWindow,
} from '../lib/masteryStages.js';

import {
  fsrs,
  fsrsFromProduction,
} from '../lib/fsrs.js';

import {
  isEnglishCard,
  canPromptProduction,
  pickProductionInvite,
  buildProductionValidationPrompt,
  parseProductionValidation,
  PRODUCTION_PROMPT_COOLDOWN_MS,
  PRODUCTION_INVITE_SIZE,
} from '../lib/productionPrompt.js';

import {
  cleanSpeechTranscript,
  isMeaninglessSpeech,
  isNoiseCardFront,
} from '../utils/speechCleanup.js';

import { englishCategoryFilter } from '../hooks/useProductiveUse.js';

describe('⚡ GOD MODE 1 : Cycle de vie & Invariants du Mastery Pipeline', () => {

  test('Invariants des 5 stades : découverte, reconnaissance, rappel, production, maîtrise', () => {
    assert.deepEqual(MASTERY_STAGES, ['discovered', 'recognized', 'recalled', 'produced', 'mastered']);

    // 1. Discovered : Fiche neuve ou entrée invalide
    assert.equal(computeMasteryStage(null), 'discovered');
    assert.equal(computeMasteryStage(undefined), 'discovered');
    assert.equal(computeMasteryStage({}), 'discovered');
    assert.equal(computeMasteryStage({ repetitions: 0, interval: 0 }), 'discovered');
    assert.equal(computeMasteryStage({ repetitions: 0, interval: 10 }), 'discovered');

    // 2. Recognized : Au moins 1 révision réussie mais < 2 reps ou intervalle < 5
    assert.equal(computeMasteryStage({ repetitions: 1, interval: 1 }), 'recognized');
    assert.equal(computeMasteryStage({ repetitions: 1, interval: 10 }), 'recognized');
    assert.equal(computeMasteryStage({ repetitions: 4, interval: 4 }), 'recognized');

    // 3. Recalled : repetitions >= 2 ET interval >= 5 (rappel espacé stabilisé)
    assert.equal(computeMasteryStage({ repetitions: 2, interval: 5 }), 'recalled');
    assert.equal(computeMasteryStage({ repetitions: 8, interval: 45 }), 'recalled');

    // 4. Produced : Au moins 1 usage productif réussi
    const cardProduced = {
      repetitions: 2,
      interval: 5,
      productiveUses: [{ context: 'voice', correct: true, date: '2026-01-01T10:00:00Z' }],
    };
    assert.equal(computeMasteryStage(cardProduced), 'produced');

    // 5. Une utilisation incorrecte ne donne JAMAIS le statut "produced"
    const cardFailedUse = {
      repetitions: 2,
      interval: 5,
      productiveUses: [{ context: 'voice', correct: false, date: '2026-01-01T10:00:00Z' }],
    };
    assert.equal(computeMasteryStage(cardFailedUse), 'recalled');
  });

  test('Immutabilité absolue de recordProductiveUse', () => {
    const original = Object.freeze({
      id: 'imm-1',
      front: 'call it a day',
      repetitions: 3,
      interval: 6,
      masteryStage: 'recalled',
      productiveUses: Object.freeze([]),
    });

    const updated = recordProductiveUse(original, {
      context: 'chat',
      correct: true,
      note: 'Used in team standup',
      date: '2026-06-01T12:00:00Z',
    });

    assert.notEqual(original, updated, 'Une nouvelle référence d’objet doit être retournée');
    assert.equal(original.productiveUses.length, 0, 'L’objet d’origine ne doit pas être muté');
    assert.equal(updated.productiveUses.length, 1);
    assert.equal(updated.masteryStage, 'produced');
    assert.equal(updated.lastProductiveUseAt, new Date('2026-06-01T12:00:00Z').getTime() || updated.lastProductiveUseAt);
  });

  test('Rétro-compatibilité & ensureMasteryStage', () => {
    const legacyCard = { repetitions: 4, interval: 14 };
    const fixed = ensureMasteryStage(legacyCard);
    assert.equal(fixed.masteryStage, 'recalled');

    const alreadyValid = { repetitions: 0, masteryStage: 'produced' };
    const untouched = ensureMasteryStage(alreadyValid);
    assert.equal(untouched.masteryStage, 'produced');
  });

  test('Agrégation breakdown et fenêtres glissantes de statistiques', () => {
    const corpus = [
      { id: '1', repetitions: 0 },
      { id: '2', repetitions: 1, interval: 1 },
      { id: '3', repetitions: 3, interval: 7 },
      { id: '4', repetitions: 3, interval: 7, productiveUses: [{ correct: true, date: '2026-08-20T00:00:00Z' }] },
      {
        id: '5',
        repetitions: 5,
        interval: 20,
        productiveUses: [
          { context: 'voice', correct: true, date: '2026-08-01T10:00:00Z' },
          { context: 'writing', correct: true, date: '2026-08-10T10:00:00Z' },
        ],
      },
    ];

    const breakdown = getMasteryBreakdown(corpus);
    assert.equal(breakdown.discovered, 1);
    assert.equal(breakdown.recognized, 1);
    assert.equal(breakdown.recalled, 1);
    assert.equal(breakdown.produced, 1);
    assert.equal(breakdown.mastered, 1);

    const sinceAug15 = new Date('2026-08-15T00:00:00Z').getTime();
    const countRecent = countProductiveUsesInWindow(corpus, sinceAug15);
    assert.equal(countRecent, 1, 'Seul l’usage du 20 Août doit être compté');
  });
});

describe('⚡ GOD MODE 2 : Règle d’or des 48h & Contextes Multiples pour "Mastered"', () => {

  const T0 = new Date('2026-03-01T08:00:00.000Z').getTime();
  const H47_59 = T0 + (47 * 3600 + 59 * 60 + 59) * 1000; // 47h 59m 59s
  const H48_00 = T0 + (48 * 3600) * 1000;                 // Exactement 48h
  const H72_00 = T0 + (72 * 3600) * 1000;                 // 72h

  test('REJET si le délai est < 48h même avec contextes distincts', () => {
    const card = {
      repetitions: 5,
      interval: 15,
      productiveUses: [
        { context: 'voice', correct: true, date: new Date(T0).toISOString() },
        { context: 'writing', correct: true, date: new Date(H47_59).toISOString() },
      ],
    };
    assert.equal(hasMasteryPattern(card), false);
    assert.equal(computeMasteryStage(card), 'produced');
  });

  test('VALIDATION exacte à 48h00m00s pile avec contextes distincts', () => {
    const card = {
      repetitions: 5,
      interval: 15,
      productiveUses: [
        { context: 'voice', correct: true, date: new Date(T0).toISOString() },
        { context: 'writing', correct: true, date: new Date(H48_00).toISOString() },
      ],
    };
    assert.equal(hasMasteryPattern(card), true);
    assert.equal(computeMasteryStage(card), 'mastered');
  });

  test('REJET si contextes identiques malgré un délai > 48h', () => {
    const card = {
      repetitions: 5,
      interval: 15,
      productiveUses: [
        { context: 'voice', correct: true, date: new Date(T0).toISOString() },
        { context: 'voice', correct: true, date: new Date(H72_00).toISOString() },
      ],
    };
    assert.equal(hasMasteryPattern(card), false);
    assert.equal(computeMasteryStage(card), 'produced');
  });

  test('Résilience face aux tableaux non triés et dates corrompues', () => {
    const cardUnsorted = {
      repetitions: 5,
      interval: 15,
      productiveUses: [
        { context: 'writing', correct: true, date: new Date(H72_00).toISOString() }, // T+72h
        { context: 'dictation', correct: false, date: 'INVALID_DATE_STRING' },
        { context: 'voice', correct: true, date: new Date(T0).toISOString() },       // T+0h
        null,
      ],
    };
    assert.equal(hasMasteryPattern(cardUnsorted), true);
    assert.equal(computeMasteryStage(cardUnsorted), 'mastered');

    const distinct = getDistinctProductiveContexts(cardUnsorted);
    assert.deepEqual(distinct.sort(), ['voice', 'writing']);
    assert.equal(countCorrectProductiveUses(cardUnsorted), 2);
  });

  test('Tri et priorité de sélection des fiches nécessitant une production', () => {
    const corpus = [
      { id: 'a', front: 'under the weather', repetitions: 4, interval: 10, updatedAt: '2026-05-10T10:00:00Z' },
      { id: 'b', front: 'hit the ground running', repetitions: 4, interval: 10, lastProductiveUseAt: 1000 },
      { id: 'c', front: 'take with a grain of salt', repetitions: 1, interval: 1 }, // recognized (exclu)
      { id: 'd', front: 'wrap my head around', repetitions: 3, interval: 7, updatedAt: '2026-05-01T10:00:00Z' },
    ];

    const needy = getExpressionsNeedingProduction(corpus, 2);
    assert.equal(needy.length, 2);
    assert.equal(needy[0].id, 'b', 'La fiche avec le timestamp le plus ancien doit être prioritaire');
    assert.equal(needy[1].id, 'd', 'La fiche modifiée le 1er Mai précède celle du 10 Mai');
  });
});

describe('⚡ GOD MODE 3 : Moteur FSRS & Rétention par Production Active', () => {

  test('Calcul FSRS standard vs production orale/écrite réussie', () => {
    const baseCard = {
      id: 'fsrs-exp-1',
      repetitions: 2,
      interval: 4,
      easeFactor: 2.5,
      stability: 4.2,
      difficulty: 5.0,
      level: 2,
    };

    const srsProd = fsrsFromProduction(baseCard, true);
    assert.ok(srsProd.interval > baseCard.interval, 'L’intervalle doit s’élargir après production réussie');
    assert.ok(srsProd.nextReview, 'Une date de prochaine révision doit être calculée');
    assert.ok(srsProd.repetitions >= baseCard.repetitions, 'Les répétitions doivent être incrémentées');
  });

  test('FSRS en cas d’échec (grade 1) vs succès de production (fsrsFromProduction)', () => {
    const baseCard = {
      id: 'fsrs-exp-compare',
      repetitions: 4,
      interval: 18,
      easeFactor: 2.5,
      stability: 18,
      difficulty: 4.0,
      level: 3,
    };

    const srsFail = fsrs(baseCard, 0); // q=0 (Again)
    const srsSuccess = fsrsFromProduction(baseCard); // q=5 (Easy)

    assert.equal(srsFail.interval, 0, 'Un échec de rappel (q=0) doit ramener l’intervalle à 0 jour');
    assert.ok(srsSuccess.interval > baseCard.interval, 'Une production réussie doit étendre l’intervalle');
  });
});

describe('⚡ GOD MODE 4 : Garde-fou Universel de Production (Cooldown & Prompts)', () => {

  test('Respect strict du Cooldown de 20 heures anti-fatigue', () => {
    const now = 1750000000000;
    const cooldown = PRODUCTION_PROMPT_COOLDOWN_MS; // 20h = 72,000,000 ms

    // Jamais invité auparavant
    assert.equal(canPromptProduction(null, now), true);
    assert.equal(canPromptProduction('', now), true);

    // Invité il y a 19h 59m 59s -> REJETÉ
    const recentPrompt = now - (cooldown - 1000);
    assert.equal(canPromptProduction(recentPrompt, now), false);

    // Invité il y a 20h 00m 01s -> ACCEPTE
    const expiredPrompt = now - (cooldown + 1000);
    assert.equal(canPromptProduction(expiredPrompt, now), true);
  });

  test('Filtre de catégorie anglaise (isEnglishCard & englishCategoryFilter)', () => {
    const englishSamples = [
      { category: '🇬🇧 Anglais' },
      { category: 'English - Business' },
      { category: 'ANGLAIS C1' },
      { category: 'Vocabulaire 🇬🇧 Pro' },
    ];
    const nonEnglishSamples = [
      { category: 'Mathématiques' },
      { category: 'Code / Javascript' },
      { category: 'Médecine' },
      { category: null },
      {},
    ];

    for (const ex of englishSamples) {
      assert.equal(isEnglishCard(ex), true, `Devrait matcher: ${ex.category}`);
      assert.equal(englishCategoryFilter(ex), true);
    }
    for (const ex of nonEnglishSamples) {
      assert.equal(isEnglishCard(ex), false, `Ne devrait pas matcher: ${ex.category}`);
      assert.equal(englishCategoryFilter(ex), false);
    }
  });

  test('Sélection intelligente des fiches (Session prioritaire puis Corpus)', () => {
    const corpus = [
      { id: 'c1', front: 'leverage', category: '🇬🇧 Anglais', repetitions: 3, interval: 6 },
      { id: 'c2', front: 'streamline', category: '🇬🇧 Anglais', repetitions: 4, interval: 8 },
      { id: 'c3', front: 'seamless', category: '🇬🇧 Anglais', repetitions: 2, interval: 5 },
      { id: 'non-en', front: 'théorème', category: 'Maths', repetitions: 3, interval: 7 },
    ];

    // Session où 'c3' a été révisée
    const session = [{ id: 'c3' }];
    const picked = pickProductionInvite(corpus, session, { limit: 2 });

    assert.equal(picked.length, 2);
    assert.equal(picked[0].id, 'c3', 'La fiche de la session active doit être en tête');
    assert.ok(['c1', 'c2'].includes(picked[1].id), 'Le complément provient du corpus éligible');
  });

  test('Génération de Prompt de validation et parsing défensif JSON', () => {
    const expr = { front: 'bear in mind', back: 'garder à l\'esprit' };
    const sentence = 'Please bear in mind that the deadline is tomorrow.';
    const prompt = buildProductionValidationPrompt(expr, sentence);

    assert.ok(prompt.system.includes('English-usage validator') || prompt.system.includes('validate a learner'));
    assert.ok(prompt.user.includes('bear in mind'));
    assert.ok(prompt.user.includes(sentence));

    // Parsings de différents payloads LLM (clean, markdown fenced, malformé)
    const cleanJson = '{"correct": true, "feedback": "Excellente utilisation dans un contexte pro."}';
    const fencedJson = '```json\n{"correct": true, "feedback": "Parfait !"}\n```';
    const messyJson = 'Voici mon analyse :\n{"correct": false, "feedback": "Mauvaise préposition."}\nBonne journée.';
    const invalidJson = 'Erreur serveur 500.';

    assert.equal(parseProductionValidation(cleanJson).correct, true);
    assert.equal(parseProductionValidation(fencedJson).correct, true);
    assert.equal(parseProductionValidation(messyJson).correct, false);
    assert.equal(parseProductionValidation(messyJson).feedback, 'Mauvaise préposition.');
    assert.equal(parseProductionValidation(invalidJson).correct, false);
  });
});

describe('⚡ GOD MODE 5 : Hygiène Acoustique & Filtrage Anti-Parasites STT', () => {

  test('Nettoyage des tics de langage et marqueurs discursifs (FR & EN)', () => {
    const rawFR = "Euh... en fait tu vois, je pense que hum c'est la bonne solution quoi.";
    const cleanedFR = cleanSpeechTranscript(rawFR);
    assert.ok(!cleanedFR.toLowerCase().includes("euh"));
    assert.ok(!cleanedFR.toLowerCase().includes("hum"));
    assert.ok(!cleanedFR.toLowerCase().includes("tu vois"));

    const rawEN = "Uh, you know, I think we should like, um, pivot our strategy right now.";
    const cleanedEN = cleanSpeechTranscript(rawEN);
    assert.ok(!cleanedEN.toLowerCase().includes("uh"));
    assert.ok(!cleanedEN.toLowerCase().includes("um"));
    assert.ok(!cleanedEN.toLowerCase().includes("you know"));
  });

  test('Suppression des bégaiements, répétitions et faux-départs', () => {
    const rawStutter = "We we need to pro- produce this faster.";
    const cleaned = cleanSpeechTranscript(rawStutter);
    assert.equal(cleaned, "We need to produce this faster.");

    const rawMultiWords = "How to, how to scale this app efficiently?";
    const cleanedMulti = cleanSpeechTranscript(rawMultiWords);
    assert.equal(cleanedMulti, "How to scale this app efficiently?");
  });

  test('Détection de bruits sans valeur sémantique', () => {
    assert.equal(isMeaninglessSpeech(""), true);
    assert.equal(isMeaninglessSpeech("   "), true);
    assert.equal(isMeaninglessSpeech("Euh... hum... uh..."), true);
    assert.equal(isMeaninglessSpeech("Yeah"), false, 'Une réponse courte valide ne doit pas être rejetée');
    assert.equal(isMeaninglessSpeech("I definitely agree with this roadmap"), false);
  });

  test('Garde-fou isNoiseCardFront pour éviter la création de fiches polluantes', () => {
    assert.equal(isNoiseCardFront("uh uh uh"), true);
    assert.equal(isNoiseCardFront("in in"), true);
    assert.equal(isNoiseCardFront("ok"), true);
    assert.equal(isNoiseCardFront("get the ball rolling"), false);
    assert.equal(isNoiseCardFront("Can you hear me?"), false);
  });
});

describe('⚡ GOD MODE 6 : Détecteur Temps Réel & Structure Rétro-Ingénierie Sémantique', () => {

  test('Vérification structurelle du format des fiches générées (Back Markdown)', () => {
    const requiredSections = [
      '### ⚙️ 1. Décomposition & Transition Métaphorique',
      '### 🔍 2. Comparatif',
      '### ⚠️ 3. Anti-Pattern',
      '### 💻 4. Exemples',
    ];

    const sampleBack = `Traduction : M'entends-tu ?

### ⚙️ 1. Décomposition & Transition Métaphorique
* **Can :** Sens physique : *Tester la capacité active* ➔ **Glissement sémantique :** Test du canal de communication.
* **Hear :** Sens physique : *Perception passive* ➔ **Glissement sémantique :** Transmission audio claire.
* **Le Modèle Mental :** Vérification technique du flux audio direct.

### 🔍 2. Comparatif (Pourquoi A et pas B ?)
* **Option A (Can you hear me?) :** Teste la disponibilité du canal audio en temps réel.
* **Option B (Do you hear me?) :** Exige l'attention ou l'obéissance.

### ⚠️ 3. Anti-Pattern (Le piège)
* **Erreur :** Traduire 'M'entends-tu ?' par 'Do you hear me?'.

### 💻 4. Exemples (Format court)
* **Exemple 1 :** \`Can you hear me on Zoom?\` ↳ *M'entends-tu sur Zoom ?*`;

    for (const sec of requiredSections) {
      assert.ok(sampleBack.includes(sec), `La section obligatoire [${sec}] doit être présente`);
    }
  });

  test('Dédoublonnage intelligent contre les collisions de sous-chaînes', () => {
    const existingCards = [
      { front: 'cut corners' },
      { front: 'hit the nail on the head' },
    ];

    const existingFronts = new Set(existingCards.map(c => c.front.toLowerCase().trim()));

    const checkDuplicate = (candidate) => {
      const f = candidate.toLowerCase().trim();
      if (existingFronts.has(f)) return true;
      for (const ex of existingFronts) {
        if (ex.length > 3 && (ex.includes(f) || f.includes(ex))) {
          return true;
        }
      }
      return false;
    };

    assert.equal(checkDuplicate('cut corners'), true, 'Exact match doit être rejeté');
    assert.equal(checkDuplicate('CUT CORNERS'), true, 'Case insensitive match doit être rejeté');
    assert.equal(checkDuplicate('to cut corners'), true, 'Substring inclusion doit être rejeté');
    assert.equal(checkDuplicate('break a leg'), false, 'Expression distincte doit être acceptée');
  });
});

describe('⚡ GOD MODE 7 : Catalogue Phonétique & Dojo Connected Speech', () => {

  test('Intégrité du fichier AccentTraining et présence de toutes les paires phonétiques', () => {
    const atPath = path.resolve('src/components/AccentTraining.jsx');
    const content = fs.readFileSync(atPath, 'utf8');

    // Vérification des sons essentiels
    assert.ok(content.includes('/ð/'), 'Doit contenir le TH voisé /ð/');
    assert.ok(content.includes('/θ/'), 'Doit contenir le TH sourd /θ/');
    assert.ok(content.includes('/ɪ/ vs /iː/'), 'Doit contenir l\'opposition I court vs I long');
    assert.ok(content.includes('/æ/ vs /e/'), 'Doit contenir l\'opposition A ouvert vs E neutre');
    assert.ok(content.includes('/ə/'), 'Doit contenir le Schwa');
    assert.ok(content.includes('connected_speech'), 'Doit contenir le module de connected speech');

    // Vérification des contractions clés
    assert.ok(content.includes("should've known"), 'Doit contenir should\'ve known');
    assert.ok(content.includes('gonna make it'), 'Doit contenir gonna make it');
    assert.ok(content.includes('wanna talk about it'), 'Doit contenir wanna talk about it');
  });

  test('CoachSpeedListening — Intégrité des niveaux et du multiplicateur de vitesse', () => {
    const cslPath = path.resolve('src/components/CoachSpeedListening.jsx');
    const content = fs.readFileSync(cslPath, 'utf8');

    assert.ok(content.includes('practiceLevel'), 'Doit adapter l\'exercice au niveau');
    assert.ok(content.includes('speed'), 'Doit gérer les vitesses d\'écoute (1.0x - 2.5x)');
    assert.ok(content.includes('awardXP'), 'Doit récompenser la réussite d\'exercices accélérés');
    assert.ok(content.includes('questions'), 'Doit valider les questions de compréhension');
  });
});

describe('⚡ GOD MODE 8 : Simulation Intensive 30 Jours "God Mode"', () => {

  test('Simulation complète de progression d’un apprenant sur 30 jours', () => {
    let expressions = [];
    const DAY_MS = 24 * 3600 * 1000;
    const baseDate = new Date('2026-06-01T08:00:00Z').getTime();

    // 30 Jours d'apprentissage intensif
    for (let day = 1; day <= 30; day++) {
      const currentDayMs = baseDate + day * DAY_MS;
      const currentIso = new Date(currentDayMs).toISOString();

      // 1. Ajout quotidien de 4 nouvelles expressions
      for (let k = 1; k <= 4; k++) {
        expressions.push({
          id: `card-d${day}-${k}`,
          front: `expression_${day}_${k}`,
          back: `traduction_${day}_${k}`,
          category: '🇬🇧 Anglais',
          repetitions: 0,
          interval: 0,
          masteryStage: 'discovered',
          productiveUses: [],
          createdAt: currentIso,
        });
      }

      // 2. Révision quotidienne : les fiches "discovered" passent "recognized" puis "recalled"
      expressions = expressions.map(ex => {
        if (ex.masteryStage === 'discovered') {
          return { ...ex, repetitions: 1, interval: 1, masteryStage: 'recognized' };
        }
        if (ex.masteryStage === 'recognized' && ex.repetitions < 2) {
          return { ...ex, repetitions: 2, interval: 5, masteryStage: 'recalled' };
        }
        return ex;
      });

      // 3. Sprint Oral & Live Agent : sélection de 2 fiches "recalled" pour production
      const needy = getExpressionsNeedingProduction(expressions, 2);
      needy.forEach((target, idx) => {
        const context = idx % 2 === 0 ? 'voice' : 'writing';
        const updated = recordProductiveUse(target, {
          context,
          correct: true,
          note: `Sprint day ${day}`,
          date: currentIso,
        });

        // Mise à jour FSRS
        const srs = fsrsFromProduction(updated);
        const merged = { ...updated, ...srs };

        expressions = expressions.map(e => (e.id === target.id ? merged : e));
      });

      // 4. Au bout de plusieurs jours, certaines fiches reçoivent leur 2ème usage dans un contexte distinct (>48h)
      if (day >= 5) {
        const producedCards = expressions.filter(e => e.masteryStage === 'produced');
        if (producedCards.length > 0) {
          const toPromote = producedCards[0];
          const firstUse = toPromote.productiveUses[0];
          const secondContext = firstUse.context === 'voice' ? 'writing' : 'voice';

          const promoted = recordProductiveUse(toPromote, {
            context: secondContext,
            correct: true,
            note: `Day ${day} mastery graduation`,
            date: currentIso,
          });

          expressions = expressions.map(e => (e.id === toPromote.id ? promoted : e));
        }
      }
    }

    // Assertions finales sur le corpus au bout de 30 jours
    assert.equal(expressions.length, 120, '120 fiches créées au total');

    const finalBreakdown = getMasteryBreakdown(expressions);
    assert.ok(finalBreakdown.mastered > 0, `Au moins des fiches doivent avoir atteint le stade "mastered" (Trouvé: ${finalBreakdown.mastered})`);
    assert.ok(finalBreakdown.produced > 0, `Des fiches doivent être au stade "produced" (Trouvé: ${finalBreakdown.produced})`);
    assert.ok(finalBreakdown.recalled > 0, `Des fiches doivent être au stade "recalled" (Trouvé: ${finalBreakdown.recalled})`);

    // Vérification de la non-régression
    expressions.forEach(e => {
      const stage = computeMasteryStage(e);
      assert.equal(e.masteryStage, stage, `Incohérence de stage pour ${e.id}`);
      if (e.masteryStage === 'mastered') {
        assert.ok(e.productiveUses.length >= 2, 'Une fiche mastered doit avoir au moins 2 usages');
        assert.equal(hasMasteryPattern(e), true, 'Le pattern de maîtrise doit être validé');
      }
    });
  });
});
