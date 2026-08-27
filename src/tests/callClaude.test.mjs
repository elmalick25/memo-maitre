import test from 'node:test';
import assert from 'node:assert/strict';
import { callClaude } from '../lib/callClaude.js';

test('callClaude - retourne le texte direct pour une requête simple sans grounding', async () => {
  const mockAiCall = async ({ system, user, task }) => {
    return { text: `Reponse mockée pour ${task}` };
  };

  const result = await callClaude('System prompt', 'User question', false, null, {
    aiCall: mockAiCall,
  });
  assert.equal(result, 'Reponse mockée pour chat');
});

test('callClaude - supporte les options task, maxTokens et temperature', async () => {
  let capturedArgs = null;
  const mockAiCall = async (args) => {
    capturedArgs = args;
    return { text: '{"ok":true}' };
  };

  const result = await callClaude('Sys', 'User', { task: 'fast-json', maxTokens: 500, temperature: 0.1 }, null, {
    aiCall: mockAiCall,
  });

  assert.equal(result, '{"ok":true}');
  assert.equal(capturedArgs.task, 'fast-json');
  assert.equal(capturedArgs.maxTokens, 500);
  assert.equal(capturedArgs.temperature, 0.1);
  assert.equal(capturedArgs.json, true);
});

test('callClaude - retourne un objet avec sources et grounded quand grounding Gemini répond', async () => {
  const mockGemini = async () => ({
    candidates: [{
      content: { parts: [{ text: 'Grounded response' }] },
      groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://developer.mozilla.org/fr/', title: 'MDN' } }]
      }
    }]
  });

  const result = await callClaude('Sys', 'Query', { grounding: true }, null, {
    callGeminiGenerateContent: mockGemini,
    getGeminiKeyCount: () => 1,
    isGeminiLikelyUnavailable: () => false,
  });

  assert.equal(typeof result, 'object');
  assert.equal(result.text, 'Grounded response');
  assert.equal(result.grounded, true);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].title, 'MDN');
});

test('callClaude - fallback vers le task suivant si le premier échoue', async () => {
  const attemptedTasks = [];
  const mockAiCall = async ({ task }) => {
    attemptedTasks.push(task);
    if (task === 'vision') throw new Error('Vision service unavailable');
    return { text: 'Fallback succeeded' };
  };

  const result = await callClaude('Sys', 'User', { task: 'vision' }, null, {
    aiCall: mockAiCall,
  });

  assert.equal(result, 'Fallback succeeded');
  assert.deepEqual(attemptedTasks, ['vision', 'chat']);
});

test('callClaude - lève une erreur explicite si tous les providers échouent', async () => {
  const failingAiCall = async () => {
    throw new Error('Down');
  };

  await assert.rejects(
    async () => {
      await callClaude('Sys', 'User', false, null, { aiCall: failingAiCall });
    },
    /Tous les providers IA sont temporairement indisponibles/
  );
});
