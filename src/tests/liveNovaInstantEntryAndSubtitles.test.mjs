import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test("Live Nova — Entree instantanee sans latence de 8s (pas d'appel LLM bloquant avant connexion)", () => {
  const epPath = path.resolve('src/EnglishPractice.jsx');
  const src = fs.readFileSync(epPath, 'utf8');

  // Vérifie que handleStartLiveNova existe et appelle directement armIosAudio et agent.start
  assert.ok(src.includes('handleStartLiveNova'), 'handleStartLiveNova doit etre defini');
  assert.ok(src.includes('onClick={() => handleStartLiveNova()}'), 'Le bouton de lancement doit declencher handleStartLiveNova');
  assert.ok(src.includes('armIosAudio()'), 'armIosAudio doit etre appele synchronement au clic');
  assert.ok(src.includes('agent.start(MODE_CONFIGS.chat('), 'agent.start doit etre appele immediatement');

  // Vérifie que generateDynamicGreeting ne bloque pas sur callClaude
  assert.ok(!src.includes('await callClaude(prompt, "Génération de l\'accroche Nova God Mode")'), 'generateDynamicGreeting ne doit pas bloquer pendant 8s sur callClaude');
});

test("Live Nova — Sous-titres et bulles coach parfaitement visibles (pas de texte blanc sur blanc)", () => {
  const epPath = path.resolve('src/EnglishPractice.jsx');
  const src = fs.readFileSync(epPath, 'utf8');

  // Vérifie que les bulles coach et sous-titres n'utilisent plus var(--mm-bg-card) pour la couleur de texte
  assert.ok(
    !src.includes('color: isUser ? "var(--mm-on-primary)" : (isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-card)")'),
    'Les bulles ne doivent pas utiliser var(--mm-bg-card) comme couleur de texte'
  );

  // Vérifie la présence d une couleur de texte visible
  assert.ok(
    src.includes('isDarkMode ? "var(--mm-fg, #f8fafc)" : "#0f172a"'),
    'La couleur de texte du coach et des sous-titres doit utiliser une couleur contrastee'
  );
});

test("LiveKit Voice Assistant — Initialisation immediate du token et ecoute robuste des transcriptions", () => {
  const lkPath = path.resolve('src/components/LiveKitVoiceAssistant.jsx');
  const src = fs.readFileSync(lkPath, 'utf8');

  // Initialisation instantanée depuis le cache de prewarm
  assert.ok(
    src.includes('if (_prewarmedTokenCache.jwt && (Date.now() - _prewarmedTokenCache.timestamp < 300000))'),
    'Le token doit etre initialise immediatement avec le cache de prewarm valide'
  );

  // Écoute de RoomEvent.TranscriptionReceived et RoomEvent.DataReceived
  assert.ok(src.includes('room.on(RoomEvent.TranscriptionReceived,'), 'Doit ecouter RoomEvent.TranscriptionReceived');
  assert.ok(src.includes('room.on(RoomEvent.DataReceived,'), 'Doit ecouter RoomEvent.DataReceived');

  // Inclusion des segments distants d agent
  assert.ok(src.includes('remoteAgentSegs'), 'Doit agreger les segments distants recus pour le coach');
});

test("Live Nova — Ce que l'utilisateur dit s'affiche au complet (agrégation des fragments vocaux)", async () => {
  const { groupSpeechTurns } = await import('../lib/livekitConversation.js');

  // Cas 1 : L'élève parle en plusieurs fragments streaming successifs
  const userFragments = [
    { id: 'u1', role: 'user', text: 'I really want to', isFinal: true },
    { id: 'u2', role: 'user', text: 'improve my daily English pronunciation', isFinal: true },
    { id: 'u3', role: 'user', text: 'with coach Nova', isFinal: true },
  ];
  const turns = groupSpeechTurns(userFragments);
  assert.equal(turns.length, 1, 'Tous les fragments de l’élève doivent être regroupés en 1 seul tour');
  assert.equal(turns[0].text, 'I really want to improve my daily English pronunciation with coach Nova');

  // Cas 2 : Mises à jour progressives (interim / streaming)
  const streamingUpdates = [
    { id: 'u1', role: 'user', text: 'I like', isFinal: false },
    { id: 'u2', role: 'user', text: 'I like coffee', isFinal: true },
  ];
  const streamTurns = groupSpeechTurns(streamingUpdates);
  assert.equal(streamTurns.length, 1);
  assert.equal(streamTurns[0].text, 'I like coffee');

  // Cas 3 : Vérification dans le code UI de EnglishPractice.jsx
  const epPath = path.resolve('src/EnglishPractice.jsx');
  const epSrc = fs.readFileSync(epPath, 'utf8');
  assert.ok(
    epSrc.includes('const turns = groupSpeechTurns(liveKitTranscriptions);'),
    'Live Nova doit utiliser groupSpeechTurns pour afficher la phrase complète de l’utilisateur'
  );
  assert.ok(
    epSrc.includes('groupSpeechTurns(liveKitTranscriptions).map'),
    'Les sous-vues IELTS, Débat et Roleplay doivent aussi utiliser groupSpeechTurns'
  );
});

