import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('LiveKit Voice — Filtrage strict du participant local et élimination des doublons coach/user', () => {
  const lkPath = path.resolve('src/components/LiveKitVoiceAssistant.jsx');
  const src = fs.readFileSync(lkPath, 'utf8');

  // Vérifie l'utilisation de useLocalParticipant pour isoler l'identité de l'élève
  assert.ok(src.includes('const { localParticipant } = useLocalParticipant();'), 'Doit inspecter localParticipant');
  assert.ok(src.includes('if (localId) return id === localId;'), 'Le filtrage user doit être positif et cibler localId');
  assert.ok(src.includes('agentTexts.has(text)'), 'Doit filtrer tout écho coach qui réapparaîtrait dans les streams user');
});

test('Live Nova — Agrégation continue des fragments oraux par tour de parole', () => {
  const epPath = path.resolve('src/EnglishPractice.jsx');
  const src = fs.readFileSync(epPath, 'utf8');

  // Vérifie l'algorithme d'agrégation de tour de parole
  assert.ok(src.includes('groupedTurns'), 'Doit regrouper les segments LiveKit par tour de parole');
  assert.ok(src.includes('prev.text = `${prev.text} ${text}`'), 'Doit concaténer les fragments oraux consécutifs');
  assert.ok(src.includes('lastUserTurn'), 'Doit cibler le tour utilisateur agrégé complet');
  assert.ok(src.includes('lastAgentTurn'), 'Doit cibler le tour coach');
});
