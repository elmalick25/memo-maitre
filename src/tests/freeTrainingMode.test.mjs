import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const categoriesViewPath = path.resolve('src/components/CategoriesView.jsx');
const reviewEngineViewPath = path.resolve('src/components/ReviewEngineView.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');
const useReviewSessionPath = path.resolve('src/hooks/useReviewSession.js');

test('Free Training Mode — CategoriesView provides Entraînement libre (sans impact SRS)', () => {
  const content = fs.readFileSync(categoriesViewPath, 'utf8');
  assert.equal(
    content.includes('Entraînement libre') || content.includes('Entrainement libre'),
    true,
    'CategoriesView must provide Entraînement libre button'
  );
  assert.equal(
    content.includes('"free"'),
    true,
    'CategoriesView must call startReview with mode "free"'
  );
});

test('Free Training Mode — useReviewSession supports mode "free"', () => {
  const content = fs.readFileSync(useReviewSessionPath, 'utf8');
  assert.equal(
    content.includes('mode === "free"'),
    true,
    'useReviewSession must handle mode "free"'
  );
});

test('Free Training Mode — MemoMaster protects SRS schedule and daily plan in mode "free"', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(
    content.includes('reviewMode === "free"'),
    true,
    'MemoMaster must check for reviewMode === "free" in handleAnswerWithFeedback'
  );
});

test('Free Training Mode — ReviewEngineView displays Entraînement libre indicator and handles exit', () => {
  const content = fs.readFileSync(reviewEngineViewPath, 'utf8');
  assert.equal(
    content.includes('reviewMode === "free"'),
    true,
    'ReviewEngineView must recognize reviewMode === "free"'
  );
  assert.equal(
    content.includes('Entraînement libre') || content.includes('Entrainement libre'),
    true,
    'ReviewEngineView must display Entraînement libre badge'
  );
});

test('Module and Free Review — hides interval days preview under rating buttons', () => {
  const content = fs.readFileSync(reviewEngineViewPath, 'utf8');
  assert.equal(
    content.includes('showIntervalPreview'),
    true,
    'ReviewEngineView must guard interval preview when in module or free mode'
  );
});

