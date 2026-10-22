import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('EnglishPractice : Coach Nova intègre les modes Débat et Roleplay directement dans son prompt système', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.match(src, /\[DYNAMIC ROLEPLAY & DEBATE MODES EMBEDDED\]/, "System prompt doit intégrer nativement les modes Débat et Roleplay");
  assert.match(src, /DEBATE/, "System prompt doit instruire Nova sur la tenue des débats");
  assert.match(src, /ROLEPLAY/, "System prompt doit instruire Nova sur l'incarnation de personnages en roleplay");
  assert.match(src, /practiceSubView\s*===\s*"ielts"/, "System prompt doit gérer le mode ielts");
});

test('novaTopicsBank : La banque de 100 sujets intègre nativement Débats et Roleplays avec leurs getters', async () => {
  const { REAL_LIFE_100_TOPICS, getDebateTopics, getRoleplayTopics, buildTopicsPromptContext } = await import('../lib/english/novaTopicsBank.js');
  assert.equal(REAL_LIFE_100_TOPICS.length, 100, "La banque doit contenir exactement 100 sujets");

  const debates = getDebateTopics();
  assert.ok(debates.length >= 10, "Il doit y avoir au moins 10 sujets de débat");
  assert.ok(debates.some(t => t.id === "debate-66"), "Doit inclure le débat sur l'IA et l'emploi");

  const roleplays = getRoleplayTopics();
  assert.ok(roleplays.length >= 8, "Il doit y avoir au moins 8 scénarios de roleplay");
  assert.ok(roleplays.some(t => t.id === "roleplay-56"), "Doit inclure le roleplay tech job interview");

  const promptContext = buildTopicsPromptContext();
  assert.match(promptContext, /DEBATES & ROLEPLAYS/i, "Le prompt context des 100 sujets doit mentionner débats et roleplays");
});

test('novaVoicePrompt : buildNovaVoicePrompt prend en charge les modes débat et roleplay à la demande', async () => {
  const { buildNovaVoicePrompt } = await import('../lib/english/novaVoicePrompt.js');

  const debatePrompt = buildNovaVoicePrompt({
    topic: { id: "debate-66", title: "AI vs Human Jobs", type: "debate", opposingView: "AI creates new leverage" }
  });
  assert.match(debatePrompt, /LIVE DEBATE MODE ACTIVATED/i, "buildNovaVoicePrompt doit activer le mode débat pour un sujet de débat");

  const roleplayPrompt = buildNovaVoicePrompt({
    topic: { id: "roleplay-56", title: "Job Interview", type: "roleplay", character: "Alex Google Recruiter" }
  });
  assert.match(roleplayPrompt, /LIVE ROLEPLAY MODE ACTIVATED/i, "buildNovaVoicePrompt doit activer le mode roleplay pour un scénario de roleplay");
});

test('LiveKitVoiceAssistant : Transmet metadata au niveau racine du JWT', () => {
  const src = readSrc('components/LiveKitVoiceAssistant.jsx');
  assert.match(src, /metadata:\s*(?:metadataString|JSON\.stringify)/, "LiveKitVoiceAssistant doit transmettre metadata dans le token JWT");
});

const AGENT_PY_PATH = path.resolve(__dirname, '../../agent.py');
test('agent.py : Ne surcharge pas le greeting on_enter avec un texte générique hors-sujet', { skip: !fs.existsSync(AGENT_PY_PATH) && "agent.py (serveur vocal) absent de ce dossier" }, () => {
  const agentPyPath = AGENT_PY_PATH;
  const agentPy = fs.readFileSync(agentPyPath, 'utf8');
  assert.doesNotMatch(agentPy, /instructions="""Greet the user and offer your assistance\."""/, "on_enter ne doit pas surcharger le prompt avec une salutation générique");
  assert.match(agentPy, /extract_instructions/, "agent.py doit utiliser la fonction d'extraction d'instructions multi-sources");
});

test('LiveKitVoiceAssistant : Supporte l\'override de l\'agent name et nettoie le fetch token', () => {
  const src = readSrc('components/LiveKitVoiceAssistant.jsx');
  assert.match(src, /VITE_LIVEKIT_AGENT_NAME/, "Doit utiliser VITE_LIVEKIT_AGENT_NAME de l'environnement");
  assert.match(src, /let active = true;[\s\S]*?if\s*\(active\)\s*\{\s*setToken/, "Doit utiliser un drapeau active pour éviter de mettre à jour l'état si démonté");
});
