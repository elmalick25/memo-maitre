import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

test('LiveKit : le token vient du serveur, la signature navigateur est un mode dev opt-in', () => {
  const src = read('src/components/LiveKitVoiceAssistant.jsx');
  assert.match(src, /getTokenEndpoint\(\)/, 'Doit tenter le endpoint serveur en premier');
  assert.match(src, /isClientSigningAllowed\(\)/, 'La signature locale doit être conditionnée');
  assert.doesNotMatch(src, /setExpirationTime\('2h'\)/, 'Le TTL de 2h doit être remplacé par un TTL court');
  assert.match(src, /LIVEKIT_TOKEN_TTL_SECONDS/, 'Doit utiliser le TTL court partagé');
  assert.doesNotMatch(src, /alert\(/, 'Plus d\'alert() natif pour les erreurs LiveKit');
});

test('livekitTokenGuard : nettoyage des entrées utilisateur et grants minimaux', async () => {
  const guard = read('src/lib/security/livekitTokenGuard.js');
  assert.match(guard, /sanitizeStudentName/);
  assert.match(guard, /sanitizeInstructions/);
  assert.match(guard, /roomAdmin: false/);
  assert.match(guard, /scrubError/);
});

test('livekitConversation : agrégation des fragments en tours de parole', async () => {
  const { aggregateTurns, conversationStats } = await import('../lib/livekitConversation.js');
  const turns = aggregateTurns([
    { role: 'user', text: 'I go', ts: 1000, isFinal: false },
    { role: 'user', text: 'to the office yesterday', ts: 2000, isFinal: true },
    { role: 'agent', text: 'Nice, you went to the office yesterday. What did you work on?', ts: 4000, isFinal: true },
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].text, 'I go to the office yesterday');
  const stats = conversationStats(turns);
  assert.equal(stats.userTurns, 1);
  assert.ok(stats.studentTalkRatio > 0);
});

test('novaVoicePrompt : règles orales, calibrage CEFR et mémoire', async () => {
  const { buildNovaVoicePrompt } = await import('../lib/english/novaVoicePrompt.js');
  const prompt = buildNovaVoicePrompt({
    basePrompt: 'BASE',
    studentName: 'Mama',
    level: 'B1',
    goal: 'job interview',
    targets: [{ front: 'to look forward to', back: 'avoir hâte de' }],
    continuity: 'last session: startups',
  });
  assert.match(prompt, /BASE/);
  assert.match(prompt, /VOICE CONVERSATION PROTOCOL/);
  assert.match(prompt, /LEVEL CALIBRATION — B1/);
  assert.match(prompt, /TARGET LANGUAGE/);
  assert.match(prompt, /FIRST SPOKEN TURN — MANDATORY OPENING HOOK/);
  assert.match(prompt, /CONTINUITY MEMORY/);
  assert.match(prompt, /Mama/);
});
