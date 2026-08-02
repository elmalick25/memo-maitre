import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('EnglishPractice : buildLiveKitSystemPrompt prend en compte les vues debate, roleplay et ielts', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.match(src, /practiceSubView\s*===\s*"debate"/, "System prompt doit gérer le mode debate");
  assert.match(src, /practiceSubView\s*===\s*"roleplay"/, "System prompt doit gérer le mode roleplay");
  assert.match(src, /practiceSubView\s*===\s*"ielts"/, "System prompt doit gérer le mode ielts");
});

test('EnglishPractice : Les vues debate, roleplay et ielts ne se masquent pas entièrement quand LiveKit est connecté', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.doesNotMatch(src, /practiceSubView\s*===\s*"debate"[\s\S]*?className="ep-glass-panel"[\s\S]*?\{!customAgent\.isConnected\s*&&\s*\(/, "Le conteneur racine debate ne doit pas être enveloppé dans !customAgent.isConnected");
  assert.doesNotMatch(src, /practiceSubView\s*===\s*"roleplay"[\s\S]*?className="ep-glass-panel"[\s\S]*?\{customAgent\.isConnected\s*\?\s*null/, "Le conteneur racine roleplay ne doit pas être enveloppé dans customAgent.isConnected ? null");
  assert.doesNotMatch(src, /practiceSubView\s*===\s*"ielts"[\s\S]*?\{customAgent\.isConnected\s*\?\s*null/, "Le conteneur racine ielts ne doit pas être enveloppé dans customAgent.isConnected ? null");
});

test('EnglishPractice : startDebate lance directement la session agent LiveKit avec le sujet passé', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.match(src, /const startDebate\s*=\s*async\s*\(\s*\w*Topic/, "startDebate doit accepter un argument de sujet override");
  assert.match(src, /onClick=\{\(\)\s*=>\s*startDebate\(\s*topic\s*\)\}/, "Les boutons de sujet doivent transmettre topic à startDebate");
});

test('EnglishPractice : beginRoleplayScenario lance directement la session agent LiveKit', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.match(src, /beginRoleplayScenario[\s\S]*?agent\.start\s*\(\s*MODE_CONFIGS\.roleplay/, "beginRoleplayScenario doit démarrer agent.start(MODE_CONFIGS.roleplay...)");
});

test('LiveKitVoiceAssistant : Transmet metadata au niveau racine du JWT', () => {
  const src = readSrc('components/LiveKitVoiceAssistant.jsx');
  assert.match(src, /metadata:\s*(?:metadataString|JSON\.stringify)/, "LiveKitVoiceAssistant doit transmettre metadata dans le token JWT");
});

test('agent.py : Ne surcharge pas le greeting on_enter avec un texte générique hors-sujet', (t) => {
  const agentPyPath = path.resolve(__dirname, '../../agent.py');
  // agent.py vit hors du dossier src : sur un checkout src-only le test est
  // sans objet plutôt qu'en échec (avant ce correctif : crash ENOENT).
  if (!fs.existsSync(agentPyPath)) return t.skip('agent.py absent de ce checkout');
  const agentPy = fs.readFileSync(agentPyPath, 'utf8');
  assert.doesNotMatch(agentPy, /instructions="""Greet the user and offer your assistance\."""/, "on_enter ne doit pas surcharger le prompt avec une salutation générique");
  assert.match(agentPy, /extract_instructions/, "agent.py doit utiliser la fonction d'extraction d'instructions multi-sources");
});

test('LiveKitVoiceAssistant : Supporte l\'override de l\'agent name et nettoie le fetch token', () => {
  const src = readSrc('components/LiveKitVoiceAssistant.jsx');
  assert.match(src, /VITE_LIVEKIT_AGENT_NAME/, "Doit utiliser VITE_LIVEKIT_AGENT_NAME de l'environnement");
  assert.match(src, /let active = true;[\s\S]*?if\s*\(active\)\s*\{\s*setToken/, "Doit utiliser un drapeau active pour éviter de mettre à jour l'état si démonté");
});

