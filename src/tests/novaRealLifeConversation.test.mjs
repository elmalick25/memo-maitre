import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNovaVoicePrompt } from '../lib/english/novaVoicePrompt.js';
import { REAL_LIFE_100_TOPICS, getRandomTopic, getRandomTopicPair } from '../lib/english/novaTopicsBank.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('Nova Real-Life God Mode — La banque contient exactement 100 sujets réels variés', () => {
  assert.equal(REAL_LIFE_100_TOPICS.length, 100, 'Doit contenir exactement 100 sujets de discussion de la vraie vie');
  
  // Vérifie les catégories clés
  const categories = new Set(REAL_LIFE_100_TOPICS.map(t => t.category));
  assert.ok(categories.has('self'), 'Doit couvrir la catégorie self-discovery / se présenter');
  assert.ok(categories.has('tech'), 'Doit couvrir la catégorie projets / tech / ambitions');
  assert.ok(categories.has('daily'), 'Doit couvrir la catégorie anecdotes / quotidien');
  assert.ok(categories.has('dilemma'), 'Doit couvrir la catégorie dilemmes / débats');
  assert.ok(categories.has('world'), 'Doit couvrir la catégorie culture / voyages');

  // Tirage de paire contrastée
  const [t1, t2] = getRandomTopicPair();
  assert.ok(t1 && t2 && t1.id !== t2.id, 'Doit fournir deux sujets distincts');
});

test('Nova Real-Life God Mode — buildNovaVoicePrompt privilégie la conversation naturelle sans forcer les fiches SRS', () => {
  const prompt = buildNovaVoicePrompt({
    studentName: 'Malick',
    level: 'B2',
    goal: 'Natural conversation',
  });

  // Ne doit pas contenir d'ouverture forcée sur les fiches SRS
  assert.ok(prompt.includes('REAL-LIFE GOD MODE'));
  assert.ok(prompt.includes('WORLD-CLASS 100 REAL-LIFE TOPICS ENGINE'));
  assert.ok(prompt.includes('introduce themselves'));

  // Règle 70/30 et recast silencieux
  assert.ok(prompt.includes('70/30 ratio'));
  assert.ok(prompt.includes('SILENT CORRECTION — INVISIBLE RECAST'));
  assert.ok(prompt.includes('ACTIVE LISTENING & HUMAN RESONANCE'));
});

test('Nova Real-Life God Mode — L\'agent propose lui-même les sujets à l\'oral sans clic obligatoire', () => {
  const src = readSrc('EnglishPractice.jsx');

  // Mode libre par défaut
  assert.ok(src.includes('return "free";'));

  // Présence de l'indicateur des 100 sujets intégrés
  assert.ok(src.includes('100 sujets réels intégrés'));

  // Tirage automatique depuis la banque des 100 sujets
  assert.ok(src.includes('getRandomTopicPair()'));

  // Prompt invitant à proposer directement les 2 sujets et inviter à se présenter
  assert.ok(src.includes('Warmly invite them to introduce themselves if they want to break the ice'));
  assert.ok(src.includes('Envie d\'échanger comme dans la vraie vie ?'));
  assert.ok(src.includes('getRandomOpeningGreeting'));
});

test('Nova Real-Life God Mode — getRandomOpeningGreeting génère des amorces variées et naturelles', async () => {
  const { getRandomOpeningGreeting } = await import('../lib/english/novaTopicsBank.js');
  const [t1, t2] = getRandomTopicPair();
  const sample1 = getRandomOpeningGreeting('Malick', t1, t2);
  assert.ok(sample1.includes('Malick'), 'Doit inclure le prénom de l\'élève');
  assert.ok(sample1.length > 20, 'Doit générer une amorce substantielle');

  // En générant plusieurs amorces, on vérifie qu'elles ne sont pas toutes identiques
  const samples = new Set();
  for (let i = 0; i < 20; i++) {
    samples.add(getRandomOpeningGreeting('Malick', t1, t2));
  }
  assert.ok(samples.size > 2, 'Doit générer au moins plusieurs amorces distinctes pour varier les échanges');
});

test('LiveKitVoiceAssistant — Le bouton activer le son est masqué pour ne pas encombrer la vue', () => {
  const src = readSrc('components/LiveKitVoiceAssistant.jsx');
  assert.ok(src.includes('display: "none"'), 'Le style de StartAudio doit avoir display: none');
  assert.ok(!src.includes('label="🔊 Appuie ici pour activer le son de NOVA"'), 'Le label de bouton ne doit plus être affiché');
});


