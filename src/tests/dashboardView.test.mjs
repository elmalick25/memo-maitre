import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dashboardViewPath = path.resolve('src/components/DashboardView.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('DashboardView — exists and exports default component supporting Hero Bento, MobileHomeV2, and KnowledgeGraph', () => {
  assert.equal(fs.existsSync(dashboardViewPath), true, 'DashboardView.jsx must exist in components/');
  const content = fs.readFileSync(dashboardViewPath, 'utf8');

  assert.equal(content.includes('export default function DashboardView'), true, 'DashboardView must export default component');
  assert.equal(content.includes('MobileHomeV2'), true, 'DashboardView must render MobileHomeV2 on mobile viewports');
  assert.equal(content.includes('KnowledgeGraph'), true, 'DashboardView must render KnowledgeGraph');
  assert.equal(content.includes('HoloCard'), true, 'DashboardView must use HoloCard');
  assert.equal(content.includes('YearHeatmap'), true, 'DashboardView must render YearHeatmap');
});

test('MemoMaster — imports and renders DashboardView for dashboard view', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import DashboardView from "./components/DashboardView";'), true, 'MemoMaster must import DashboardView');
  assert.equal(content.includes('<DashboardView'), true, 'MemoMaster must render DashboardView');
});
