import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const reviewEngineViewPath = path.resolve('src/components/ReviewEngineView.jsx');

test('Review Mode Separation — showIntervalPreview is enabled for standard and module SRS reviews', () => {
  const content = fs.readFileSync(reviewEngineViewPath, 'utf8');

  // Do NOT disable interval preview just because reviewCategory is present!
  // In the buggy code: const showIntervalPreview = reviewMode !== "module" && reviewMode !== "free" && !reviewCategory;
  // !reviewCategory blocked intervals whenever a module was clicked from home or reviewed!
  assert.equal(
    content.includes('!reviewCategory'),
    false,
    'ReviewEngineView must NOT use !reviewCategory to hide interval preview'
  );

  // Interval preview must be enabled for any review that updates SRS (i.e. reviewMode !== "free")
  assert.equal(
    content.includes('reviewMode !== "free"'),
    true,
    'ReviewEngineView must show interval preview whenever reviewMode is not free'
  );
});

test('Review Mode Separation — ReviewEngineView displays distinct visual identity for SRS vs Free Training', () => {
  const content = fs.readFileSync(reviewEngineViewPath, 'utf8');

  // Must have dedicated visual indication for Module SRS review vs Free training
  assert.equal(
    content.includes('Révision FSRS') || content.includes('Révision SRS'),
    true,
    'ReviewEngineView must display an explicit SRS review header/badge'
  );

  assert.equal(
    content.includes('Entraînement libre') || content.includes('Entrainement libre'),
    true,
    'ReviewEngineView must display Free Training badge for reviewMode === "free"'
  );
});
