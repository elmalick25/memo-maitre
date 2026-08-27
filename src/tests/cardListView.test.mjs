import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const cardListViewPath = path.resolve('src/components/CardListView.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

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
});
