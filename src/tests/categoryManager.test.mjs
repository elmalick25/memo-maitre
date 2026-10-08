import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES_DEFAULT,
  CAT_PALETTE,
  mergeDefaultCategories,
  reconcileCategoriesWithExpressions,
} from '../lib/categoryManager.js';

test('mergeDefaultCategories — fusionne les catégories par défaut sans doublon', () => {
  const existing = [{ name: '🇬🇧 Anglais', examDate: '2026-09-01', targetScore: 95, priority: 'haute', color: '#000000' }];
  const merged = mergeDefaultCategories(existing);

  assert.equal(merged.length, CATEGORIES_DEFAULT.length);
  assert.equal(merged[0].targetScore, 95);
  assert.equal(merged.some(c => c.name.includes('Java')), true);
});

test('mergeDefaultCategories — tolère un input vide, null ou non-tableau', () => {
  const fromNull = mergeDefaultCategories(null);
  assert.equal(fromNull.length, CATEGORIES_DEFAULT.length);

  const fromEmpty = mergeDefaultCategories([]);
  assert.equal(fromEmpty.length, CATEGORIES_DEFAULT.length);
});

test('reconcileCategoriesWithExpressions — crée les catégories orphelines', () => {
  const categories = [{ name: '🇬🇧 Anglais', color: '#8B5CF6' }];
  const expressions = [
    { id: '1', category: '🇬🇧 Anglais' },
    { id: '2', category: '📦 Docker & K8s' },
    { id: '3', category: '📦 Docker & K8s' },
    { id: '4', category: '  ' },
    { id: '5' },
  ];

  const reconciled = reconcileCategoriesWithExpressions(categories, expressions);
  assert.equal(reconciled.length, 2);
  const dockerCat = reconciled.find(c => c.name === '📦 Docker & K8s');
  assert.ok(dockerCat);
  assert.equal(dockerCat.priority, 'normale');
  assert.equal(dockerCat.targetScore, 80);
  assert.ok(CAT_PALETTE.includes(dockerCat.color));
});

test('mergeDefaultCategories & reconcileCategoriesWithExpressions — excluent strictement les modules supprimés (deletedNames)', () => {
  const deleted = ['📊 Data Processing', '☕ Java / Spring Boot'];
  const merged = mergeDefaultCategories([], deleted);
  assert.equal(merged.some(c => c.name.includes('Data Processing')), false);
  assert.equal(merged.some(c => c.name.includes('Java')), false);
  assert.equal(merged.some(c => c.name.includes('Anglais')), true);

  const expsWithDeleted = [
    { id: '1', category: '📊 Data Processing' },
    { id: '2', category: '🐍 Python' },
  ];
  const reconciled = reconcileCategoriesWithExpressions([], expsWithDeleted, deleted);
  assert.equal(reconciled.some(c => c.name.includes('Data Processing')), false);
  assert.equal(reconciled.some(c => c.name.includes('Python')), true);
});
