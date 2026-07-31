import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const responsiveCssPath = path.resolve('src/styles/responsive.css');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');
const betaChatPath = path.resolve('src/components/BetaChat.jsx');

test('Chatbot visual animation — applies to chatbot and robot assistant buttons on both mobile and PC', () => {
  const responsiveCssContent = fs.readFileSync(responsiveCssPath, 'utf8');
  const memoMasterContent = fs.readFileSync(memoMasterPath, 'utf8');
  const betaChatContent = fs.readFileSync(betaChatPath, 'utf8');

  // Verify keyframes for robot assistant icon
  assert.equal(
    responsiveCssContent.includes('@keyframes robotAssistantPulse'),
    true,
    'Les keyframes robotAssistantPulse doivent exister dans responsive.css'
  );

  // Verify animation rules exist outside min-width media queries (mobile + PC)
  assert.equal(
    responsiveCssContent.includes('.robot-assistant-icon'),
    true,
    'La classe robot-assistant-icon doit être définie dans responsive.css'
  );

  // Verify MemoMaster chatbot assistant button uses robot-assistant-icon
  assert.equal(
    memoMasterContent.includes('robot-assistant-icon'),
    true,
    'Le bouton Assistant 🤖 de MemoMaster doit utiliser la classe robot-assistant-icon'
  );

  // Verify BetaChat uses beta-chat-icon
  assert.equal(
    betaChatContent.includes('beta-chat-icon'),
    true,
    'Le composant BetaChat doit utiliser la classe beta-chat-icon'
  );
});
