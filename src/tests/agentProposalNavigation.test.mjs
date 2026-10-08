import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildAgentSystemPrompt } from '../lib/appKnowledge.js';

test('Agent Knowledge — Strict rules for navigate & proposal format', () => {
  const prompt = buildAgentSystemPrompt({ view: 'dashboard' });

  // 1. Doit interdire la redirection automatique sur les questions explicatives
  assert.equal(
    prompt.includes('Interdiction formelle sur les questions explicatives'),
    true,
    'Doit contenir la règle interdisant la redirection sur question de compréhension'
  );

  // 2. Doit autoriser navigate uniquement sur ordre explicite
  assert.equal(
    prompt.includes('Uniquement sur ordre explicite'),
    true,
    'Doit contenir la règle réservant navigate aux ordres explicites'
  );

  // 3. Doit documenter le champ proposal
  assert.equal(
    prompt.includes('"proposal"'),
    true,
    'Doit documenter le champ proposal dans le format de réponse OBLIGATOIRE'
  );
});

test('AgentPanel — Proposal handling and interactive button', () => {
  const agentPanelCode = fs.readFileSync(path.resolve('src/components/AgentPanel.jsx'), 'utf-8');

  // Doit extraire proposalData
  assert.equal(
    agentPanelCode.includes('proposalData'),
    true,
    'AgentPanel doit extraire proposalData'
  );

  // Doit contenir le gestionnaire de clic handleExecuteProposal
  assert.equal(
    agentPanelCode.includes('handleExecuteProposal'),
    true,
    'AgentPanel doit contenir handleExecuteProposal'
  );

  // Doit rendre le bouton interactif m.proposal
  assert.equal(
    agentPanelCode.includes('m.proposal'),
    true,
    'AgentPanel doit afficher le bouton m.proposal'
  );
});

test('Agent Knowledge — Contextual device detection (Mobile vs PC)', () => {
  const mobilePrompt = buildAgentSystemPrompt({ isMobile: true });
  assert.equal(
    mobilePrompt.includes('Appareil actuel de l\'utilisateur : MOBILE'),
    true,
    'Doit identifier le mode mobile'
  );
  assert.equal(
    mobilePrompt.includes('tiroir « Plus ⋯ »'),
    true,
    'Doit contenir les directives de navigation mobile'
  );

  const desktopPrompt = buildAgentSystemPrompt({ isMobile: false });
  assert.equal(
    desktopPrompt.includes('Appareil actuel de l\'utilisateur : PC / ORDINATEUR'),
    true,
    'Doit identifier le mode PC/Desktop'
  );
  assert.equal(
    desktopPrompt.includes('Barre latérale gauche'),
    true,
    'Doit contenir les directives de navigation PC'
  );
});

