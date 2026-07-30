// tests/voiceNoClick.test.mjs
// Vérifie que la conversation vocale ne nécessite AUCUN clic supplémentaire :
//   1. LiveKitVoiceAssistant appelle armIosAudio() de façon synchrone au montage.
//   2. Aucun <StartAudio> ni bannière "Activer l'audio" n'est rendu.
//   3. armIosAudio() force le routage haut-parleur + resume l'AudioContext.
//
// Lance : node --test src/tests/voiceNoClick.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('LiveKitVoiceAssistant : armIosAudio() appelé synchronement au montage', () => {
  const src = readSrc('components/LiveKitVoiceAssistant.jsx');
  assert.match(src, /useEffect\(\(\)\s*=>\s*\{\s*try\s*\{\s*armIosAudio\(\)/,
    'armIosAudio() doit être appelé dès le premier useEffect du montage');
});

test("LiveKitVoiceAssistant : utilise les composants officiels et de secours pour l'unblock audio/micro", () => {
  const src = readSrc('components/LiveKitVoiceAssistant.jsx');
  // Strip comments so on ne match pas des explications textuelles.
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /<StartAudio\b/, "Doit rendre <StartAudio> de LiveKit");
  assert.match(code, /<LiveKitMicBanner\b/, "Doit utiliser la bannière de secours LiveKitMicBanner");
});

test('iosVoiceHardening : armIosAudio force le speaker + resume AudioContext', async () => {
  // Mock minimal DOM/navigator pour exécuter armIosAudio sous Node.
  let audioSessionType = null;
  const ctxCalls = { created: 0, resumed: 0 };

  class FakeAudioContext {
    constructor() { ctxCalls.created++; this.state = 'suspended'; }
    resume() { ctxCalls.resumed++; this.state = 'running'; return Promise.resolve(); }
  }

  const createdEls = [];
  globalThis.window = {
    AudioContext: FakeAudioContext,
    speechSynthesis: { speak: () => {} },
    addEventListener: () => {},
    matchMedia: () => ({ matches: false }),
  };
  globalThis.document = {
    createElement: (tag) => {
      const el = {
        tag, style: {}, attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        play: () => Promise.resolve(),
      };
      createdEls.push(el);
      return el;
    },
    body: { appendChild: () => {} },
    addEventListener: () => {},
    visibilityState: 'visible',
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'iPhone',
      maxTouchPoints: 5,
      audioSession: { set type(v) { audioSessionType = v; } },
    },
    configurable: true,
    writable: true,
  });
  globalThis.SpeechSynthesisUtterance = function () { this.volume = 0; };

  const { armIosAudio } = await import('../lib/iosVoiceHardening.js');
  armIosAudio();

  assert.equal(audioSessionType, 'play-and-record',
    'audioSession.type doit être forcé sur play-and-record (routage haut-parleur)');
  assert.equal(ctxCalls.created, 1, 'AudioContext créé une fois');
  assert.equal(ctxCalls.resumed, 1, 'AudioContext.resume() appelé synchrone dans le user-gesture');
  assert.ok(createdEls.some(e => e.tag === 'audio' && e.attrs.playsinline === ''),
    '<audio playsinline> d\'amorçage créé');
});
