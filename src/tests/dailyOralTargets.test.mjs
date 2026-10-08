import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDailyOralTargets,
  generateOralVariants,
  isTargetSpoken,
  extractShortMeaning,
  getTodayDateString,
} from '../lib/english/dailyOralTargets.js';

test('dailyOralTargets : extrait correctement le sens court en français', () => {
  const back1 = `📖 **Vrai sens :** refuser poliment une offre\n\n💬 Exemple : He turned down the job.`;
  assert.equal(extractShortMeaning(back1), 'refuser poliment une offre');

  const back2 = `↳ annuler au dernier moment\n⚠️ Attention piège`;
  assert.equal(extractShortMeaning(back2), 'annuler au dernier moment');
});

test('dailyOralTargets : génère des variantes morphologiques orales souples', () => {
  const variants = generateOralVariants('cut corners');
  assert.ok(variants.includes('cut corners'));
  assert.ok(variants.includes('cutting corners'));
  assert.ok(variants.includes('cuts corners'));
});

test('dailyOralTargets : détecte si une cible est prononcée avec tolérance de forme', () => {
  const target = {
    front: 'cut corners',
    variants: generateOralVariants('cut corners')
  };

  assert.equal(isTargetSpoken(target, "I think startups are always cutting corners to beat deadlines"), true);
  assert.equal(isTargetSpoken(target, "We should never cut corners on quality"), true);
  assert.equal(isTargetSpoken(target, "I had coffee this morning"), false);
});

test('dailyOralTargets : priorise les fiches révisées aujourd\'hui avec difficulté', () => {
  const todayStr = '2026-10-02';
  const mockCards = [
    {
      id: 'c1',
      category: 'Anglais 🇬🇧',
      front: 'call off',
      back: '📖 **Vrai sens :** annuler un événement',
      lastReviewed: `${todayStr}T10:00:00.000Z`,
      interval: 10,
    },
    {
      id: 'c2',
      category: 'Anglais 🇬🇧',
      front: 'cut corners',
      back: '📖 **Vrai sens :** faire au rabais',
      reviewHistory: [{ date: todayStr, rating: 1 }], // Difficulté 'again'
      interval: 1,
    },
    {
      id: 'c3',
      category: 'Anglais 🇬🇧',
      front: 'turn down',
      back: '📖 **Vrai sens :** refuser',
      reviewHistory: [{ date: todayStr, rating: 2 }], // Difficulté 'hard'
      interval: 2,
    },
    {
      id: 'c4',
      category: 'Maths',
      front: 'Pythagore',
      back: 'a² + b² = c²',
      lastReviewed: todayStr,
    }
  ];

  const result = getDailyOralTargets(mockCards, { limit: 2, todayDateStr: todayStr });
  assert.equal(result.totalReviewedToday, 3);
  assert.equal(result.source, 'today_reviews');
  assert.equal(result.targets.length, 2);
  // Doit prioriser c2 et c3 (rating 1 et 2)
  const ids = result.targets.map(t => t.id);
  assert.ok(ids.includes('c2'));
  assert.ok(ids.includes('c3'));
});

test('dailyOralTargets : repli gracieux sur les fiches dues si aucune révision aujourd\'hui', () => {
  const pastDate = new Date(Date.now() - 86400000).toISOString();
  const mockCards = [
    {
      id: 'due1',
      category: 'Anglais',
      front: 'bring up',
      back: 'mentionner un sujet',
      nextReview: pastDate,
    },
    {
      id: 'due2',
      category: 'Anglais',
      front: 'hang out',
      back: 'passer du temps ensemble',
      nextReview: pastDate,
    }
  ];

  const result = getDailyOralTargets(mockCards, { limit: 2, todayDateStr: '2026-10-02' });
  assert.equal(result.totalReviewedToday, 0);
  assert.equal(result.source, 'due_fallback');
  assert.equal(result.targets.length, 2);
  assert.equal(result.targets[0].front, 'bring up');
});
