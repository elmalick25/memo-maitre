import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const addCardViewPath = path.resolve('src/components/AddCardView.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('AddCardView — exists and exports default component supporting single, chat, batch, text, file, and zen modes', () => {
  assert.equal(fs.existsSync(addCardViewPath), true, 'AddCardView.jsx must exist in components/');
  const content = fs.readFileSync(addCardViewPath, 'utf8');

  assert.equal(content.includes('export default function AddCardView'), true, 'AddCardView must export default component');
  assert.equal(content.includes('addZenMode'), true, 'AddCardView must support Zen mode');
  assert.equal(content.includes('addSubView === "single"'), true, 'AddCardView must support single view');
  assert.equal(content.includes('addSubView === "chat"'), true, 'AddCardView must support chat copilot view');
  assert.equal(content.includes('addSubView === "batch"'), true, 'AddCardView must support batch view');
  assert.equal(content.includes('addSubView === "text"'), true, 'AddCardView must support text extraction view');
  assert.equal(content.includes('addSubView === "file"'), true, 'AddCardView must support OCR scan view');
});

test('AddCardView — implements core forge actions: handleAdd, handleAIGenerate, handleAIBatchGenerate, handleAIFromText, handleOptimizeFSRS', () => {
  const content = fs.readFileSync(addCardViewPath, 'utf8');
  assert.equal(content.includes('handleAdd'), true, 'AddCardView must implement handleAdd');
  assert.equal(content.includes('handleAIGenerate'), true, 'AddCardView must implement handleAIGenerate');
  assert.equal(content.includes('handleAIBatchGenerate'), true, 'AddCardView must implement handleAIBatchGenerate');
  assert.equal(content.includes('handleAIFromText'), true, 'AddCardView must implement handleAIFromText');
  assert.equal(content.includes('handleOptimizeFSRS'), true, 'AddCardView must implement handleOptimizeFSRS');
});

test('MemoMaster — imports and renders AddCardView for add view', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import AddCardView from "./components/AddCardView";'), true, 'MemoMaster must import AddCardView');
  assert.equal(content.includes('<AddCardView'), true, 'MemoMaster must render AddCardView');
});
