import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { isDueCard } from '../lib/cardStatus.js';

describe('Due Cards Consistency Audit', () => {
  test('MemoMaster.jsx — must not use outdated inline due card filters', () => {
    const filePath = resolve('src/MemoMaster.jsx');
    const content = readFileSync(filePath, 'utf-8');

    const legacyPattern = /isDue\(e\.nextReview,\s*today\(\)\)\s*&&\s*\(e\.level\s*\|\|\s*0\)\s*<\s*7\s*&&\s*!e\.paused/;
    assert.equal(
      legacyPattern.test(content),
      false,
      'MemoMaster.jsx contain legacy inline due card filters that ignore masteryStage'
    );
  });

  test('isDueCard — excludes cards marked with produced masteryStage or level >= 7', () => {
    const todayStr = '2026-08-02';
    
    const cardActive = { id: '1', nextReview: '2026-08-01', level: 4, paused: false };
    const cardProduced = { id: '2', nextReview: '2026-08-01', level: 4, masteryStage: 'produced', paused: false };
    const cardMastered = { id: '3', nextReview: '2026-08-01', level: 7, paused: false };

    assert.equal(isDueCard(cardActive, todayStr), true);
    assert.equal(isDueCard(cardProduced, todayStr), false);
    assert.equal(isDueCard(cardMastered, todayStr), false);
  });
});
