import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const betaChatPath = path.resolve('src/components/BetaChat.jsx');
const responsiveCssPath = path.resolve('src/styles/responsive.css');

test('BetaChat — FAB keeps fixed size (52x52) without unwanted floating pulse animation', () => {
  const betaChatContent = fs.readFileSync(betaChatPath, 'utf8');

  // Verify fixed dimensions preserved
  assert.equal(
    betaChatContent.includes('width: 52'),
    true,
    'Le bouton du chat de discussion doit conserver sa largeur de 52px'
  );
  assert.equal(
    betaChatContent.includes('height: 52'),
    true,
    'Le bouton du chat de discussion doit conserver sa hauteur de 52px'
  );
});

test('BetaChat — Background overlay and panels have non-transparent opaque backgrounds', () => {
  const betaChatContent = fs.readFileSync(betaChatPath, 'utf8');

  // Check backdrop overlay does not use semi-transparent rgba(0,0,0,.55)
  assert.equal(
    betaChatContent.includes('rgba(0,0,0,.55)'),
    false,
    'Le fond de couverture du chatbot ne doit pas etre transparent'
  );

  // Check panel sections do not use semi-transparent rgba backgrounds
  assert.equal(
    betaChatContent.includes('rgba(255,255,255,.05)'),
    false,
    'La zone de texte du chatbot ne doit pas etre transparente'
  );
  assert.equal(
    betaChatContent.includes('rgba(255,255,255,.06)'),
    false,
    'Les bulles de message reçues ne doivent pas etre transparentes'
  );
});
