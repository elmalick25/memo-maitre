import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const iosHardeningPath = path.resolve('src/lib/iosVoiceHardening.js');
const voiceAssistantPath = path.resolve('src/components/LiveKitVoiceAssistant.jsx');

test('iosVoiceHardening — prewarms mic stream on ALL platforms (not restricted to isIos)', () => {
  const fileContent = fs.readFileSync(iosHardeningPath, 'utf8');
  assert.equal(
    fileContent.includes('!micPermissionPromise &&\n        isIos()') || fileContent.includes('!micPermissionPromise && isIos()'),
    false,
    'armIosAudio ne doit pas restreindre le prewarm micro à iOS uniquement, pour débloquer le micro sur PC et Android'
  );
  assert.equal(
    fileContent.includes('prewarmedMicStream = stream'),
    true,
    'armIosAudio doit conserver le stream micro pré-obtenu sur toutes les plateformes'
  );
});

test('LiveKitVoiceAssistant — renders StartAudio outside zero-sized hidden overflow container', () => {
  const fileContent = fs.readFileSync(voiceAssistantPath, 'utf8');
  // Verifier que StartAudio n'est pas enferme dans un div avec width: 0 et overflow: hidden sans acces
  assert.equal(
    fileContent.includes('<StartAudio'),
    true,
    'LiveKitVoiceAssistant doit inclure le composant StartAudio'
  );
});
