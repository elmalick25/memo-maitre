import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const hookPath = path.resolve('src/hooks/useExpressionsManager.js');

test('useExpressionsManager — exists and exports default custom hook function', () => {
  assert.equal(fs.existsSync(hookPath), true, 'useExpressionsManager.js must exist in hooks/');
  const content = fs.readFileSync(hookPath, 'utf8');

  assert.equal(content.includes('export default function useExpressionsManager'), true, 'useExpressionsManager must export default hook');
  assert.equal(content.includes('saveVersion'), true, 'useExpressionsManager must implement saveVersion');
  assert.equal(content.includes('handleRestoreVersion'), true, 'useExpressionsManager must implement handleRestoreVersion');
  assert.equal(content.includes('startEdit'), true, 'useExpressionsManager must implement startEdit');
  assert.equal(content.includes('deleteExp'), true, 'useExpressionsManager must implement deleteExp');
  assert.equal(content.includes('addCardsFromLab'), true, 'useExpressionsManager must implement addCardsFromLab');
});
