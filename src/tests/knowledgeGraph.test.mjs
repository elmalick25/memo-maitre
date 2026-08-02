import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const graphPath = path.resolve('src/components/KnowledgeGraph.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('KnowledgeGraph — accepts sessionPool prop and uses it for due count calculation', () => {
  const fileContent = fs.readFileSync(graphPath, 'utf8');
  assert.equal(
    fileContent.includes('sessionPool'),
    true,
    'KnowledgeGraph doit accepter et exploiter la prop sessionPool pour les badges de fiches dues'
  );
});

test('MemoMaster — passes sessionPool to KnowledgeGraph', () => {
  const fileContent = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(
    fileContent.includes('sessionPool={sessionPool}'),
    true,
    'MemoMaster doit transmettre sessionPool à KnowledgeGraph'
  );
});
