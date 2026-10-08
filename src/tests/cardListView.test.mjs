import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const cardListViewPath = new URL('../components/CardListView.jsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const memoMasterPath = new URL('../MemoMaster.jsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('CardListView — exists and exports default component supporting grid, filters, and HoloCard deep dive', () => {
  assert.equal(fs.existsSync(cardListViewPath), true, 'CardListView.jsx must exist in components/');
  const content = fs.readFileSync(cardListViewPath, 'utf8');

  assert.equal(content.includes('export default function CardListView'), true, 'CardListView must export default component');
  assert.equal(content.includes('filteredExps'), true, 'CardListView must support filtered expressions');
  assert.equal(content.includes('handleOptimizeAllInModule'), true, 'CardListView must support module optimization');
  assert.equal(content.includes('handleSemanticSearch'), true, 'CardListView must support semantic search');
  assert.equal(content.includes('HoloCard'), true, 'CardListView must support holographic modal');
  assert.equal(content.includes('BulkRestructureBar'), true, 'CardListView must support bulk actions');
});

test('MemoMaster — imports and renders CardListView for list view', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import CardListView from "./components/CardListView";'), true, 'MemoMaster must import CardListView');
  assert.equal(content.includes('<CardListView'), true, 'MemoMaster must render CardListView');
  assert.equal(content.includes('isNovaCard'), true, 'MemoMaster must support isNovaCard filtering');
  assert.equal(content.includes('isUnmodernizedEnglishCard'), true, 'MemoMaster must support isUnmodernizedEnglishCard filtering');
});

test('CardListView — integrates Nova modernization banner and conditional filter removal', () => {
  const content = fs.readFileSync(cardListViewPath, 'utf8');
  assert.equal(content.includes('getUnmigratedNovaCards'), true, 'CardListView must compute unmigrated Nova cards');
  assert.equal(content.includes('migrateNovaCardsBatch'), true, 'CardListView must support batch migration');
  assert.equal(content.includes('availableCatFilters'), true, 'CardListView must use dynamic category filters');
  assert.equal(content.includes('unmigratedNovaCards.length > 0'), true, 'Filter and banner must disappear when count is 0');
});

test('CardListView — integrates Legacy English cards modernization banner and conditional filter removal', () => {
  const content = fs.readFileSync(cardListViewPath, 'utf8');
  assert.equal(content.includes('getUnmodernizedEnglishCards'), true, 'CardListView must compute unmodernized English cards');
  assert.equal(content.includes('migrateEnglishCardsBatch'), true, 'CardListView must support English batch migration');
  assert.equal(content.includes('unmodernizedEnglishCards.length > 0'), true, 'Banner must disappear when unmodernized cards count is 0');
});


