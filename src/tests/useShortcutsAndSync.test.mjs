import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const hookPath = path.resolve('src/hooks/useShortcutsAndSync.js');

test('useShortcutsAndSync — exists and exports default custom hook function', () => {
  assert.equal(fs.existsSync(hookPath), true, 'useShortcutsAndSync.js must exist in hooks/');
  const content = fs.readFileSync(hookPath, 'utf8');

  assert.equal(content.includes('export default function useShortcutsAndSync'), true, 'useShortcutsAndSync must export default hook');
  assert.equal(content.includes('handleManualSync'), true, 'useShortcutsAndSync must implement manual sync');
  assert.equal(content.includes('repairSyncNow'), true, 'useShortcutsAndSync must implement sync repair');
});
