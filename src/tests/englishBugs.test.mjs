import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const epPath = path.resolve('src/EnglishPractice.jsx');
const eitwPath = path.resolve('src/EnglishInTheWild.jsx');

test('EnglishInTheWild — No undefined function or ref references in shadowing', () => {
  const code = fs.readFileSync(eitwPath, 'utf8');
  assert.strictEqual(code.includes('speakWithElevenLabs'), false, 'speakWithElevenLabs should not be referenced without import');
  assert.strictEqual(code.includes('speakWithBrowserTTS'), false, 'speakWithBrowserTTS should not be referenced without import');
  assert.strictEqual(code.includes('setShadowingRecording('), false, 'setShadowingRecording should be setShadowingPhase');
  assert.ok(code.includes('shadowTimerRef'), 'shadowTimerRef should be defined via useRef');
});

test('EnglishPractice — No undefined practiceDictationUserInput reference', () => {
  const code = fs.readFileSync(epPath, 'utf8');
  assert.strictEqual(code.includes('practiceDictationUserInput'), false, 'practiceDictationUserInput does not exist in state');
});

test('EnglishPractice — safeParseJSON is declared before usage or imported', () => {
  const code = fs.readFileSync(epPath, 'utf8');
  const importIndex = code.indexOf('safeParseJSON');
  const firstUsage = code.indexOf('safeParseJSON(');
  assert.ok(importIndex !== -1, 'safeParseJSON should be imported or declared');
  assert.ok(importIndex < firstUsage, 'safeParseJSON declaration or import should precede first usage');
});

test('EnglishPractice — LiveKit system prompt is memoized and does not access refs during render', () => {
  const code = fs.readFileSync(epPath, 'utf8');
  assert.strictEqual(code.includes('systemPrompt={buildLiveKitSystemPrompt()}'), false, 'LiveKit system prompt must not call ref-accessing function directly in render prop');
});
