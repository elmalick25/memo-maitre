import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectsViewPath = path.resolve('src/components/ProjectsView.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('ProjectsView — exists and exports default component with tabs: hub, detail, planner, coach, fusion', () => {
  assert.equal(fs.existsSync(projectsViewPath), true, 'ProjectsView.jsx must exist in components/');
  const content = fs.readFileSync(projectsViewPath, 'utf8');

  assert.equal(content.includes('export default function ProjectsView'), true, 'ProjectsView must export default component');
  assert.equal(content.includes('projectSubView === "hub"'), true, 'ProjectsView must support hub subview');
  assert.equal(content.includes('projectSubView === "detail"'), true, 'ProjectsView must support detail subview');
  assert.equal(content.includes('projectSubView === "planner"'), true, 'ProjectsView must support planner subview');
  assert.equal(content.includes('projectSubView === "coach"'), true, 'ProjectsView must support coach subview');
  assert.equal(content.includes('projectSubView === "fusion"'), true, 'ProjectsView must support fusion subview');
});

test('ProjectsView — implements core actions: createProject, deleteProject, toggleTask, decomposeProject, generateCrunchPlan', () => {
  const content = fs.readFileSync(projectsViewPath, 'utf8');
  assert.equal(content.includes('createProject'), true, 'ProjectsView must implement createProject');
  assert.equal(content.includes('deleteProject'), true, 'ProjectsView must implement deleteProject');
  assert.equal(content.includes('toggleTask'), true, 'ProjectsView must implement toggleTask');
  assert.equal(content.includes('decomposeProject'), true, 'ProjectsView must implement decomposeProject');
  assert.equal(content.includes('generateCrunchPlan'), true, 'ProjectsView must implement generateCrunchPlan');
});

test('MemoMaster — imports and renders ProjectsView for projects view', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import ProjectsView from "./components/ProjectsView";'), true, 'MemoMaster must import ProjectsView');
  assert.equal(content.includes('<ProjectsView'), true, 'MemoMaster must render ProjectsView');
});
