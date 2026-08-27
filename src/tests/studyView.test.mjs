import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const studyViewPath = path.resolve('src/components/StudyView.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('StudyView — exists and exports default component supporting study queue and learned action', () => {
  assert.equal(fs.existsSync(studyViewPath), true, 'StudyView.jsx must exist in components/');
  const content = fs.readFileSync(studyViewPath, 'utf8');

  assert.equal(content.includes('export default function StudyView'), true, 'StudyView must export default component');
  assert.equal(content.includes('markStudyCardLearned'), true, 'StudyView must support marking card learned');
  assert.equal(content.includes('studyQueue'), true, 'StudyView must accept studyQueue');
});

test('MemoMaster — imports and renders StudyView for study view', () => {
  const content = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(content.includes('import StudyView from "./components/StudyView";'), true, 'MemoMaster must import StudyView');
  assert.equal(content.includes('<StudyView'), true, 'MemoMaster must render StudyView');
});
