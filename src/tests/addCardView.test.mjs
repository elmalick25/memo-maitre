import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const addCardViewPath = path.resolve('src/components/AddCardView.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('AddCardView — exists and exports default component supporting single, chat, file, and zen modes', () => {
  assert.equal(fs.existsSync(addCardViewPath), true, 'AddCardView.jsx must exist in components/');
  const content = fs.readFileSync(addCardViewPath, 'utf8');

  assert.equal(content.includes('export default function AddCardView'), true, 'AddCardView must export default component');
  assert.equal(content.includes('addZenMode'), true, 'AddCardView must support Zen mode');
  assert.equal(content.includes('addSubView === "single"'), true, 'AddCardView must support single view');
  assert.equal(content.includes('addSubView === "chat"'), true, 'AddCardView must support chat copilot view');
  assert.equal(content.includes('addSubView === "file"'), true, 'AddCardView must support OCR scan view');
  assert.equal(content.includes('addSubView === "batch"'), false, 'AddCardView must no longer include batch view');
  assert.equal(content.includes('addSubView === "text"'), false, 'AddCardView must no longer include text extraction view');
  assert.equal(content.includes('addSubView === "quickadd"'), false, 'AddCardView must no longer include quickadd view');
});

test('AddCardView — implements core forge actions: handleAdd, handleAIGenerate, handleOptimizeFSRS', () => {
  const content = fs.readFileSync(addCardViewPath, 'utf8');
  assert.equal(content.includes('handleAdd'), true, 'AddCardView must implement handleAdd');
  assert.equal(content.includes('handleAIGenerate'), true, 'AddCardView must implement handleAIGenerate');
  assert.equal(content.includes('handleOptimizeFSRS'), true, 'AddCardView must implement handleOptimizeFSRS');
});

test('AddCardView — enforces duplicate prevention across single, chat copilot, and OCR scan modes', () => {
  const content = fs.readFileSync(addCardViewPath, 'utf8');
  assert.equal(content.includes('checkIsDuplicate'), true, 'AddCardView must implement checkIsDuplicate');
  assert.equal(content.includes('Doublon détecté : la fiche'), true, 'handleAdd must block duplicate creation');
  assert.equal(content.includes('saveChatCard') && content.includes('Doublon : La fiche'), true, 'saveChatCard must reject duplicates');
  assert.equal(content.includes('saveVisionCard') && content.includes('Doublon : La fiche'), true, 'saveVisionCard must reject duplicates');
  assert.equal(content.includes('Doublon existant'), true, 'Card previews must display duplicate warning badge');
});

