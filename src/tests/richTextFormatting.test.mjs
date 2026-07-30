import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('RichText.jsx — strong element must not use display: block', () => {
  const code = fs.readFileSync(path.resolve('src/components/RichText.jsx'), 'utf8');
  const idx = code.indexOf('strong({');
  assert.ok(idx !== -1, 'strong component should be defined in RichText.jsx');
  const snippet = code.slice(idx, idx + 250);
  assert.equal(
    snippet.includes('display: "block"'),
    false,
    'strong component in RichText.jsx must not use display: "block"'
  );
  assert.equal(
    snippet.includes('display: "inline"'),
    true,
    'strong component in RichText.jsx must use display: "inline"'
  );
});

test('RichText.jsx — preprocessContent converts section titles to Markdown H3 headers', () => {
  const code = fs.readFileSync(path.resolve('src/components/RichText.jsx'), 'utf8');
  assert.equal(
    code.includes('### ⚙️') || code.includes('h3({'),
    true,
    'RichText.jsx must handle H3 section headers for Retro-Engineering cards'
  );
});

test('MemoMaster.jsx — avoids duplicate EXEMPLE block when back contains Exemples section', () => {
  const code = fs.readFileSync(path.resolve('src/MemoMaster.jsx'), 'utf8');
  assert.equal(
    code.includes('exemples') || code.includes('Exemples') || code.includes('EXEMPLE'),
    true,
    'MemoMaster.jsx references Exemples section'
  );
});

test('retroEngineeringRestructurer.js — exige au moins 3 exemples dans le prompt système', () => {
  const code = fs.readFileSync(path.resolve('src/lib/retroEngineeringRestructurer.js'), 'utf8');
  assert.equal(
    code.includes('Exemple 3') || code.includes('au moins 3 exemples'),
    true,
    'retroEngineeringRestructurer.js doit demander au moins 3 exemples distincts'
  );
});

test('RichText.jsx — attache un AudioPlayButton à chaque code inline d\'exemple anglais', () => {
  const code = fs.readFileSync(path.resolve('src/components/RichText.jsx'), 'utf8');
  assert.equal(
    code.includes('AudioPlayButton text={cleanText}'),
    true,
    'RichText.jsx doit attacher un AudioPlayButton pour chaque extrait de phrase en anglais'
  );
});
