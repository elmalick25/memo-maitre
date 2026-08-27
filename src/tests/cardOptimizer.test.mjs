import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOptimizationResponse,
  applyOptimizationUpdates,
} from '../lib/cardOptimizer.js';

test('parseOptimizationResponse — parse standard results JSON format', () => {
  const slice = [{ id: 'card-1' }, { id: 'card-2' }];
  const raw = JSON.stringify({
    results: [
      {
        id: 'card-1',
        cards: [
          { front: 'Q1', back: 'A1', example: 'Ex1' },
          { front: 'Q2', back: 'A2', example: 'Ex2' },
        ],
      },
    ],
  });

  const updates = parseOptimizationResponse(raw, slice);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].sourceId, 'card-1');
  assert.equal(updates[0].newCards.length, 2);
  assert.equal(updates[0].newCards[0].front, 'Q1');
});

test('parseOptimizationResponse — gère les formats avec markdown fences et fallback', () => {
  const slice = [{ id: 'card-1' }];
  const raw = '```json\n{"cards":[{"front":"QF","back":"AF"}]}\n```';
  const updates = parseOptimizationResponse(raw, slice);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].sourceId, 'card-1');
  assert.equal(updates[0].newCards[0].front, 'QF');
});

test('applyOptimizationUpdates — remplace la source et ajoute les scissions supplémentaires', () => {
  const prev = [
    { id: 'card-1', front: 'Old Q1', back: 'Old A1', category: 'Dev', level: 3, interval: 10 },
    { id: 'card-2', front: 'Q2', back: 'A2', category: 'Dev' },
  ];

  const updates = [
    {
      sourceId: 'card-1',
      newCards: [
        { front: 'New Q1', back: 'New A1', example: 'E1' },
        { front: 'New Q1-part2', back: 'New A1-part2', example: 'E2' },
      ],
    },
  ];

  const next = applyOptimizationUpdates(prev, updates, '2026-08-27');
  assert.equal(next.length, 3);
  const updated1 = next.find(c => c.id === 'card-1');
  assert.equal(updated1.front, 'New Q1');
  assert.equal(updated1.level, 0); // FSRS reset for new phrasing
  assert.equal(updated1.interval, 1);
  assert.equal(updated1.nextReview, '2026-08-27');

  const child = next.find(c => c.parentId === 'card-1');
  assert.ok(child);
  assert.equal(child.front, 'New Q1-part2');
  assert.equal(child.category, 'Dev');
});
