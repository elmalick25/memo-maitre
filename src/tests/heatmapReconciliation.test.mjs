import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeDailyProgress } from '../lib/reviewStats.js';

test('heatmapReconciliation — computeDailyProgress réconcilie les fiches et sessions sur 365 jours', () => {
  const sessions = [
    { date: '2026-08-01', count: 10 },
    { date: '2026-08-02', count: 5 }
  ];

  // Simule des cartes avec 46 jours distincts de reviewHistory
  const expressions = [];
  const baseDate = new Date();
  for (let i = 10; i < 56; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    expressions.push({
      id: `card_${i}`,
      reviewHistory: [
        { date: dateStr, q: 3 },
        { date: dateStr, q: 5 }
      ]
    });
  }

  const result = computeDailyProgress(sessions, expressions, 365);
  const activeDays = result.filter(r => r.count > 0);
  const totalReviews = result.reduce((sum, r) => sum + r.count, 0);

  // Vérifie que les 46 jours de reviewHistory sont tous présents
  assert.ok(activeDays.length >= 46, `Doit contenir au moins 46 jours actifs (reçu: ${activeDays.length})`);
  assert.ok(totalReviews >= 46, `Doit contenir les reviews cumulées (reçu: ${totalReviews})`);
});

test('heatmapReconciliation — DashboardView et MemoMasterUpgrades sont câblés pour réconcilier sessions et expressions', () => {
  const dashboardPath = path.resolve('src/components/DashboardView.jsx');
  const dashContent = fs.readFileSync(dashboardPath, 'utf8');
  assert.equal(dashContent.includes('computeDailyProgress(sessions, expressions, 365)'), true, 'DashboardView doit calculer heatmapHistory via computeDailyProgress sur 365 jours');

  const upgradesPath = path.resolve('src/MemoMasterUpgrades.jsx');
  const upgradesContent = fs.readFileSync(upgradesPath, 'utf8');
  assert.equal(upgradesContent.includes('totalReviews'), true, 'YearHeatmap doit afficher totalReviews');

  const memoMasterPath = path.resolve('src/MemoMaster.jsx');
  const memoContent = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(memoContent.includes('reconciledSess = computeDailyProgress(sess || [], expsRepaired, 365)'), true, 'MemoMaster doit réconcilier sessions et expressions au chargement');
});
