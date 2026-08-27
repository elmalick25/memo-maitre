import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const categoriesViewPath = path.resolve('src/components/CategoriesView.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('CategoriesView — exists, exports default component with cards, table, timeline, and prep modes', () => {
  assert.equal(fs.existsSync(categoriesViewPath), true, 'CategoriesView.jsx must exist in components/');
  const content = fs.readFileSync(categoriesViewPath, 'utf8');

  assert.equal(content.includes('export default function CategoriesView'), true, 'CategoriesView must export default component function');
  assert.equal(content.includes('catsViewMode === "cards"'), true, 'CategoriesView must support cards view mode');
  assert.equal(content.includes('catsViewMode === "table"'), true, 'CategoriesView must support table view mode');
  assert.equal(content.includes('catsViewMode === "timeline"'), true, 'CategoriesView must support timeline view mode');
  assert.equal(content.includes('catsViewMode === "prep"'), true, 'CategoriesView must support prep view mode');
});

test('CategoriesView — handles module actions: handleAddCat, toggleFavorite, mergeModules, pause/release', () => {
  const content = fs.readFileSync(categoriesViewPath, 'utf8');
  assert.equal(content.includes('handleAddCat'), true, 'CategoriesView must implement handleAddCat');
  assert.equal(content.includes('toggleFavorite'), true, 'CategoriesView must implement toggleFavorite');
  assert.equal(content.includes('mergeModules'), true, 'CategoriesView must implement mergeModules');
  assert.equal(content.includes('pauseNewCards'), true, 'CategoriesView must support pauseNewCards');
  assert.equal(content.includes('releaseAllPaused'), true, 'CategoriesView must support releaseAllPaused');
});

test('MemoMaster — imports and renders CategoriesView for categories view', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import CategoriesView from "./components/CategoriesView";'), true, 'MemoMaster must import CategoriesView');
  assert.equal(content.includes('<CategoriesView'), true, 'MemoMaster must render CategoriesView');
});
