import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('MemoMaster.jsx — Contient la structure de Rétro-Ingénierie Sémantique pour les fiches Anglais', () => {
  const fileContent = fs.readFileSync(path.resolve('src/MemoMaster.jsx'), 'utf8');
  assert.equal(
    fileContent.includes('Décomposition & Transition Métaphorique'),
    true,
    'MemoMaster.jsx doit utiliser Décomposition & Transition Métaphorique pour l\'anglais'
  );
  assert.equal(
    fileContent.includes('Comparatif (Pourquoi A et pas B ?)'),
    true,
    'MemoMaster.jsx doit inclure la section Comparatif'
  );
});

test('EnglishInTheWild.jsx — Formatage de fiches avec Décomposition & Transition Métaphorique', () => {
  const fileContent = fs.readFileSync(path.resolve('src/EnglishInTheWild.jsx'), 'utf8');
  assert.equal(
    fileContent.includes('Décomposition & Transition Métaphorique'),
    true,
    'EnglishInTheWild.jsx doit formater les fiches avec Décomposition & Transition Métaphorique'
  );
});
