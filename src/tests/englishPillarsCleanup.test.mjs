import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('EnglishPractice — Les 6 seuls Piliers autorisés sont présents dans la barre et le code', () => {
  const epPath = path.resolve('src/EnglishPractice.jsx');
  const src = fs.readFileSync(epPath, 'utf8');

  // Composants et fichiers obsolètes supprimés
  assert.ok(!fs.existsSync(path.resolve('src/components/DailyFluencySprint.jsx')), 'DailyFluencySprint.jsx doit être supprimé');
  assert.ok(!fs.existsSync(path.resolve('src/components/AccentTraining.jsx')), 'AccentTraining.jsx doit être supprimé');
  assert.ok(!fs.existsSync(path.resolve('src/components/CEFRTracker.jsx')), 'CEFRTracker.jsx doit être supprimé');
  assert.ok(!fs.existsSync(path.resolve('src/components/ShadowingLab.jsx')), 'ShadowingLab.jsx doit être supprimé');
  assert.ok(!fs.existsSync(path.resolve('src/utils/shadowingUtils.js')), 'shadowingUtils.js doit être supprimé');
  assert.ok(!fs.existsSync(path.resolve('src/tests/shadowingLab.test.mjs')), 'shadowingLab.test.mjs doit être supprimé');
  assert.ok(!fs.existsSync(path.resolve('src/tests/dailyFluencySprint.test.mjs')), 'dailyFluencySprint.test.mjs doit être supprimé');

  // Aucun import résiduel
  assert.ok(!src.includes('import DailyFluencySprint'), 'DailyFluencySprint ne doit plus être importé');
  assert.ok(!src.includes('import AccentTraining'), 'AccentTraining ne doit plus être importé');
  assert.ok(!src.includes('import CEFRTracker'), 'CEFRTracker ne doit plus être importé');
  assert.ok(!src.includes('import ShadowingLab'), 'ShadowingLab ne doit plus être importé');

  // Vérification de l'état par défaut (Live Nova)
  assert.ok(src.includes('useState("chat")'), 'La sous-vue par défaut doit être Live Nova ("chat")');

  // Vérification de la liste des piliers autorisés
  const expectedPillars = [
    { id: 'chat', label: 'Live Nova' },
    { id: 'reallife', label: 'RealLife' },
    { id: 'wild', label: 'In The Wild' },
    { id: 'debate', label: 'Débat' },
    { id: 'roleplay', label: 'Roleplay' },
    { id: 'writing', label: 'Écriture' },
    { id: 'dictation', label: 'Dictée' },
  ];

  for (const pillar of expectedPillars) {
    assert.ok(src.includes(`id: "${pillar.id}"`), `Pilier ${pillar.id} doit exister`);
    assert.ok(src.includes(`label: "${pillar.label}"`), `Pilier label "${pillar.label}" doit exister`);
  }

  // Vérification que les anciens piliers supprimés sont bien absents
  assert.ok(!src.includes('id: "shadowing"'), 'Shadowing ne doit plus être dans les onglets');
  assert.ok(!src.includes('id: "sprint"'), 'Sprint ne doit plus être dans les onglets');
  assert.ok(!src.includes('id: "accent"'), 'Dojo Phonétique ne doit plus être dans les onglets');
  assert.ok(!src.includes('id: "cefr"'), 'CEFR ne doit plus être dans les onglets');

  // VALID_VIEWS contient les piliers autorisés
  assert.ok(
    src.includes('const VALID_VIEWS = ["chat", "wild", "debate", "roleplay", "writing", "dictation"];'),
    'VALID_VIEWS doit contenir exactement les piliers autorisés'
  );
});

test('Live Nova — LiveKit est le seul agent vocal et ConversationProvider / ElevenLabs est purgé', () => {
  const epPath = path.resolve('src/EnglishPractice.jsx');
  const src = fs.readFileSync(epPath, 'utf8');

  // ConversationProvider d'@elevenlabs/react n'est plus importé ni utilisé
  assert.ok(!src.includes('import { ConversationProvider }'), 'ConversationProvider ne doit plus être importé');
  assert.ok(!src.includes('<ConversationProvider>'), 'ConversationProvider ne doit plus envelopper EnglishPractice');

  // Bannière d'alerte ElevenLabs purgée
  assert.ok(!src.includes('Quota des coachs vocaux ElevenLabs épuisé'), 'La bannière quota ElevenLabs doit être supprimée');
  assert.ok(!src.includes('Session vocale interrompue par ElevenLabs'), 'Les erreurs WebSocket ElevenLabs doivent être supprimées');

  // LiveKitVoiceAssistant est bien le moteur vocal
  assert.ok(src.includes('import LiveKitVoiceAssistant from "./components/LiveKitVoiceAssistant";'), 'LiveKitVoiceAssistant doit être importé');
  assert.ok(src.includes('<LiveKitVoiceAssistant'), 'LiveKitVoiceAssistant doit être rendu');
});
