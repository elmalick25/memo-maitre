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

test('CategoriesView — Autres actions menu has centered buttons, Nova option for English, and restart on active cards review', () => {
  const content = fs.readFileSync(categoriesViewPath, 'utf8');
  const cssContent = fs.readFileSync(path.resolve('src/styles/modules.css'), 'utf8');

  // Dynamic open/closed label
  assert.equal(content.includes('module-menu-label-closed') && content.includes('module-menu-label-open'), true, 'Summary must toggle between Autres actions and Déplier');
  assert.equal(content.includes('Autres actions'), true, 'Must have closed label Autres actions');
  assert.equal(content.includes('Déplier'), true, 'Must have open label Déplier');

  // Nova cards review button conditional on English
  assert.equal(content.includes('isEnglish') && content.includes('Réviser fiches du coach Nova'), true, 'Must offer Nova review for English modules');

  // Active cards review restarts session cleanly
  assert.equal(content.includes('startReview?.(cat.name, "module", activeLeftToday, { restart: true })'), true, 'Active cards review must pass { restart: true }');

  // Deleted buttons check inside module-menu-list
  const listStart = content.indexOf('className="module-menu-list"');
  const listEnd = content.indexOf('Supprimer le module', listStart);
  const menuListSnippet = content.substring(listStart, listEnd);
  assert.equal(menuListSnippet.includes('Entraînement libre'), false, 'Entraînement libre must be removed from Autres actions');
  assert.equal(menuListSnippet.includes('handlePauseNewCards'), false, 'Mettre les nouvelles fiches en pause must be removed from Autres actions');
  assert.equal(menuListSnippet.includes('handleExportModule'), false, 'Exporter les fiches must be removed from Autres actions');

  // Centering in CSS
  assert.equal(cssContent.includes('.module-button') && cssContent.includes('justify-content: center; text-align: center;'), true, 'Module buttons must be centered');
  assert.equal(cssContent.includes('.module-menu-list .module-button') && cssContent.includes('justify-content: center;'), true, 'Menu list buttons must be centered');

  // Distinction between mistake cards and vocabulary/idioms
  assert.equal(content.includes('Réviser mes erreurs en direct'), true, 'Must offer dedicated review for live mistake cards');
  assert.equal(content.includes('Réviser vocabulaire & idiomes'), true, 'Must offer dedicated review for vocabulary and idioms');
});

