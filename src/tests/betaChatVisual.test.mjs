import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const betaChatPath = path.resolve('src/components/BetaChat.jsx');
const responsiveCssPath = path.resolve('src/styles/responsive.css');

test('BetaChat — FAB keeps fixed size (52x52) and uses eye-catching icon animation', () => {
  const betaChatContent = fs.readFileSync(betaChatPath, 'utf8');
  const responsiveCssContent = fs.readFileSync(responsiveCssPath, 'utf8');

  // Verify fixed dimensions preserved
  assert.equal(
    betaChatContent.includes('width: 52'),
    true,
    'Le bouton du chatbot doit conserver sa largeur de 52px'
  );
  assert.equal(
    betaChatContent.includes('height: 52'),
    true,
    'Le bouton du chatbot doit conserver sa hauteur de 52px'
  );

  // Verify inner icon element with visual animation class
  assert.equal(
    betaChatContent.includes('beta-chat-icon'),
    true,
    'L icon du chatbot doit utiliser la classe beta-chat-icon pour l effet visuel'
  );

  // Verify animation keyframes in CSS
  assert.equal(
    responsiveCssContent.includes('@keyframes betaChatIconPulse'),
    true,
    'Les keyframes d animation betaChatIconPulse doivent exister'
  );
  assert.equal(
    responsiveCssContent.includes('beta-chat-fab'),
    true,
    'Le bouton beta-chat-fab doit avoir des styles d animation dans responsive.css'
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
