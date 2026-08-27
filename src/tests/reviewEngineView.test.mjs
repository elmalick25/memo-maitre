import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const reviewEngineViewPath = path.resolve('src/components/ReviewEngineView.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('ReviewEngineView — exists and exports default component supporting review session, reveal, ratings, and summary', () => {
  assert.equal(fs.existsSync(reviewEngineViewPath), true, 'ReviewEngineView.jsx must exist in components/');
  const content = fs.readFileSync(reviewEngineViewPath, 'utf8');

  assert.equal(content.includes('export default function ReviewEngineView'), true, 'ReviewEngineView must export default component');
  assert.equal(content.includes('showSessionSummary'), true, 'ReviewEngineView must support session summary');
  assert.equal(content.includes('handleAnswer'), true, 'ReviewEngineView must support rating answers');
  assert.equal(content.includes('handleReveal'), true, 'ReviewEngineView must support card reveal');
  assert.equal(content.includes('generateMnemonic'), true, 'ReviewEngineView must support mnemonic generation');
  assert.equal(content.includes('RabbitHoleViewer'), true, 'ReviewEngineView must support Deep Dive RabbitHole');
  assert.equal(content.includes('AudioFichePlayer'), true, 'ReviewEngineView must support audio players');
});

test('ReviewEngineView — implements FSRS score buttons {0, 1, 3, 5}', () => {
  const content = fs.readFileSync(reviewEngineViewPath, 'utf8');
  assert.equal(content.includes('q: 0'), true, 'Must have grade 0 (Oublié)');
  assert.equal(content.includes('q: 1'), true, 'Must have grade 1 (Hésité)');
  assert.equal(content.includes('q: 3'), true, 'Must have grade 3 (Bien)');
  assert.equal(content.includes('q: 5'), true, 'Must have grade 5 (Facile)');
});

test('MemoMaster — imports and renders ReviewEngineView for review view', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import ReviewEngineView from "./components/ReviewEngineView";'), true, 'MemoMaster must import ReviewEngineView');
  assert.equal(content.includes('<ReviewEngineView'), true, 'MemoMaster must render ReviewEngineView');
});
