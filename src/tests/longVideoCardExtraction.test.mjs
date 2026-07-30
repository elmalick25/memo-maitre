import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const fileContent = fs.readFileSync(path.resolve('src/EnglishInTheWild.jsx'), 'utf8');

test('EnglishInTheWild.jsx — analyzeText ne doit plus tronquer le texte à 6000 caractères', () => {
  assert.equal(
    fileContent.includes('transcript.slice(0, 6000)'),
    false,
    'analyzeText ne doit pas tronquer les textes/transcriptions longues à 6000 chars'
  );
});

test('EnglishInTheWild.jsx — Propose un bouton "Tout ajouter à MemoMaster"', () => {
  assert.equal(
    fileContent.includes('saveAllExpressions') || fileContent.includes('Tout ajouter'),
    true,
    'EnglishInTheWild.jsx doit proposer une méthode/bouton pour tout importer en 1 clic'
  );
});

test('EnglishInTheWild.jsx — Prompt d\'extraction exige l\'exhaustivité intégrale avec Rétro-Ingénierie Sémantique', () => {
  assert.equal(
    fileContent.includes('decomposition'),
    true,
    'Le prompt d\'extraction vidéo doit réclamer le champ decomposition pour la rétro-ingénierie sémantique'
  );
});
