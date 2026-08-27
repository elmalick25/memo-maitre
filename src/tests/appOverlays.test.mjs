import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const overlaysPath = path.resolve('src/components/AppOverlays.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('AppOverlays — exists and exports default component supporting CommandPalette, AgentPanel, RewardChest, and XpBurst', () => {
  assert.equal(fs.existsSync(overlaysPath), true, 'AppOverlays.jsx must exist in components/');
  const content = fs.readFileSync(overlaysPath, 'utf8');

  assert.equal(content.includes('export default function AppOverlays'), true, 'AppOverlays must export default component');
  assert.equal(content.includes('CommandPalette'), true, 'AppOverlays must render CommandPalette');
  assert.equal(content.includes('AgentPanel'), true, 'AppOverlays must render AgentPanel');
  assert.equal(content.includes('RewardChest'), true, 'AppOverlays must render RewardChest');
  assert.equal(content.includes('xp-burst-float-up'), true, 'AppOverlays must render XP burst animation');
  assert.equal(content.includes('<audio'), true, 'AppOverlays must render hidden audio tag');
});

test('MemoMaster — imports and renders AppOverlays', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import AppOverlays from "./components/AppOverlays";'), true, 'MemoMaster must import AppOverlays');
  assert.equal(content.includes('<AppOverlays'), true, 'MemoMaster must render AppOverlays');
});
