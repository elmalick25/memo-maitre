import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const hookPath = path.resolve('src/hooks/useReviewSession.js');

test('useReviewSession — exists and exports default custom hook function', () => {
  assert.equal(fs.existsSync(hookPath), true, 'useReviewSession.js must exist in hooks/');
  const content = fs.readFileSync(hookPath, 'utf8');

  assert.equal(content.includes('export default function useReviewSession'), true, 'useReviewSession must export default hook');
  assert.equal(content.includes('getSmartQueue'), true, 'useReviewSession must implement getSmartQueue');
  assert.equal(content.includes('startReview'), true, 'useReviewSession must implement startReview');
  assert.equal(content.includes('handleEnterFlow'), true, 'useReviewSession must implement handleEnterFlow');
  assert.equal(content.includes('handleReveal'), true, 'useReviewSession must implement handleReveal');
});
