import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mobileNavPath = path.resolve('src/components/AppMobileNav.jsx');
const themeCssPath = path.resolve('src/styles/memoMasterTheme.css');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('AppMobileNav — exists and exports default component supporting MobileSpeedDial, MobileAddSheet, and MobileDrawer', () => {
  assert.equal(fs.existsSync(mobileNavPath), true, 'AppMobileNav.jsx must exist in components/');
  const content = fs.readFileSync(mobileNavPath, 'utf8');

  assert.equal(content.includes('export default function AppMobileNav'), true, 'AppMobileNav must export default component');
  assert.equal(content.includes('MobileSpeedDial'), true, 'AppMobileNav must render MobileSpeedDial');
  assert.equal(content.includes('MobileAddSheet'), true, 'AppMobileNav must render MobileAddSheet');
  assert.equal(content.includes('mobile-drawer-overlay'), true, 'AppMobileNav must render MobileDrawer overlay');
});

test('memoMasterTheme.css — exists and contains core design system, animations, and responsive media queries', () => {
  assert.equal(fs.existsSync(themeCssPath), true, 'memoMasterTheme.css must exist in styles/');
  const content = fs.readFileSync(themeCssPath, 'utf8');

  assert.equal(content.includes('@keyframes fadeUp'), true, 'memoMasterTheme.css must contain animations');
  assert.equal(content.includes('.nexus-badge-red'), true, 'memoMasterTheme.css must contain nexus badges styles');
  assert.equal(content.includes('@media (max-width: 767.98px)'), true, 'memoMasterTheme.css must contain mobile responsive queries');
});

test('MemoMaster — imports and renders AppMobileNav and imports memoMasterTheme.css', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import AppMobileNav from "./components/AppMobileNav";'), true, 'MemoMaster must import AppMobileNav');
  assert.equal(content.includes('import "./styles/memoMasterTheme.css";'), true, 'MemoMaster must import memoMasterTheme.css');
  assert.equal(content.includes('<AppMobileNav'), true, 'MemoMaster must render AppMobileNav');
});
