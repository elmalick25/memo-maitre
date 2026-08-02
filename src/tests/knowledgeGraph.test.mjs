import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const graphPath = path.resolve('src/components/KnowledgeGraph.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('KnowledgeGraph — exploite les aperçus de session pour les badges de fiches dues', () => {
  const fileContent = fs.readFileSync(graphPath, 'utf8');
  assert.equal(
    fileContent.includes('categoryPreviews'),
    true,
    'KnowledgeGraph doit exploiter la prop categoryPreviews (aperçu par module) pour les badges de fiches dues'
  );
  assert.match(
    fileContent,
    /preview\s*\?\s*preview\.servedSize/,
    'Le badge doit afficher servedSize : exactement ce que le clic va lancer'
  );
});

test('MemoMaster — transmet categorySessionPreviews à KnowledgeGraph', () => {
  const fileContent = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(
    fileContent.includes('categoryPreviews={categorySessionPreviews}'),
    true,
    'MemoMaster doit transmettre categorySessionPreviews à KnowledgeGraph'
  );
});
