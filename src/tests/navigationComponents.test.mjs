import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const topNavPath = path.resolve('src/components/AppTopNav.jsx');
const sidebarPath = path.resolve('src/components/AppSidebar.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('AppTopNav — exists and exports default component supporting stamina HUD, logo, and Omni-Bar', () => {
  assert.equal(fs.existsSync(topNavPath), true, 'AppTopNav.jsx must exist in components/');
  const content = fs.readFileSync(topNavPath, 'utf8');

  assert.equal(content.includes('export default function AppTopNav'), true, 'AppTopNav must export default component');
  assert.equal(content.includes('stamina'), true, 'AppTopNav must render stamina bar');
  assert.equal(content.includes('search-bar-mobile'), true, 'AppTopNav must render Omni-Bar');
});

test('AppSidebar — exists and exports default component supporting RPG avatar, navigation groups, and Pomodoro', () => {
  assert.equal(fs.existsSync(sidebarPath), true, 'AppSidebar.jsx must exist in components/');
  const content = fs.readFileSync(sidebarPath, 'utf8');

  assert.equal(content.includes('export default function AppSidebar'), true, 'AppSidebar must export default component');
  assert.equal(content.includes('getArchetype'), true, 'AppSidebar must render RPG Archetype avatar');
  assert.equal(content.includes('desktop-sidebar'), true, 'AppSidebar must render desktop sidebar');
});

test('MemoMaster — imports and renders AppTopNav and AppSidebar', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import AppTopNav from "./components/AppTopNav";'), true, 'MemoMaster must import AppTopNav');
  assert.equal(content.includes('import AppSidebar from "./components/AppSidebar";'), true, 'MemoMaster must import AppSidebar');
  assert.equal(content.includes('<AppTopNav'), true, 'MemoMaster must render AppTopNav');
  assert.equal(content.includes('<AppSidebar'), true, 'MemoMaster must render AppSidebar');
});
