import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const statusBarPath = path.resolve('src/components/AppStatusBar.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('AppStatusBar — exists and exports default component supporting Lofi, Agent, Sync, and Pomodoro', () => {
  assert.equal(fs.existsSync(statusBarPath), true, 'AppStatusBar.jsx must exist in components/');
  const content = fs.readFileSync(statusBarPath, 'utf8');

  assert.equal(content.includes('export default function AppStatusBar'), true, 'AppStatusBar must export default component');
  assert.equal(content.includes('repairSyncNow'), true, 'AppStatusBar must support repairSyncNow');
  assert.equal(content.includes('showLofiPlayer'), true, 'AppStatusBar must support Lofi player popup');
  assert.equal(content.includes('AgentPanel'), true, 'AppStatusBar must render AgentPanel');
});

test('MemoMaster — imports and renders AppStatusBar', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import AppStatusBar from "./components/AppStatusBar";'), true, 'MemoMaster must import AppStatusBar');
  assert.equal(content.includes('<AppStatusBar'), true, 'MemoMaster must render AppStatusBar');
});
