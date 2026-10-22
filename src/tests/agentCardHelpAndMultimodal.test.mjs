import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describeLiveContext, buildAgentSystemPrompt } from '../lib/appKnowledge.js';
import { callClaude } from '../lib/callClaude.js';

test('Agent Knowledge — Live Context injects active card during review session', () => {
  const sampleCard = {
    id: "card-lisp-1",
    front: '(format t "~a + ~a = ~a" x y s) et (format nil "~a + ~a = ~a" x y s)',
    back: 'Destination: t envoie sur stdout, nil renvoie une chaîne formatée',
    example: 't = print, nil = return string',
    category: 'Common Lisp',
    lapses: 2,
  };

  const contextWithCard = describeLiveContext({
    view: 'review',
    currentCard: sampleCard,
    currentCardRevealed: true,
  });

  assert.equal(contextWithCard.includes('RÉVISION EN COURS - FICHE ACTIVE'), true, 'Doit identifier la fiche active');
  assert.equal(contextWithCard.includes('(format t'), true, 'Doit inclure le recto');
  assert.equal(contextWithCard.includes('Destination: t envoie'), true, 'Doit inclure le verso');
  assert.equal(contextWithCard.includes('t = print, nil = return string'), true, 'Doit inclure les exemples');
  assert.equal(contextWithCard.includes('Common Lisp'), true, 'Doit inclure la catégorie');
  assert.equal(contextWithCard.includes('Verso révélé'), true, 'Doit mentionner si la réponse est révélée');
  assert.equal(contextWithCard.includes('Échecs passés sur cette fiche : 2'), true, 'Doit mentionner les échecs passés');
});

test('Agent Knowledge — System prompt contains card pedagogy and multimodal image rules', () => {
  const prompt = buildAgentSystemPrompt({ view: 'review' });
  assert.equal(prompt.includes('Explication & Pédagogie sur les Fiches'), true, 'Doit contenir la règle pédagogique');
  assert.equal(prompt.includes('je bloque sur cette fiche'), true, 'Doit prendre en charge le blocage sur fiche');
  assert.equal(prompt.includes('colle une IMAGE'), true, 'Doit spécifier l analyse des images');
});

test('AgentPanel — Source code contains image upload, paste, preview, and ask image integration', () => {
  const code = fs.readFileSync(path.resolve('src/components/AgentPanel.jsx'), 'utf-8');
  assert.equal(code.includes('handleImageFile'), true, 'Doit contenir handleImageFile');
  assert.equal(code.includes('handlePaste'), true, 'Doit supporter le collage d image');
  assert.equal(code.includes('imageAttachment'), true, 'Doit gérer imageAttachment');
  assert.equal(code.includes('fileInputRef'), true, 'Doit contenir fileInputRef');
  assert.equal(code.includes('ask(system, payload, imgToSend?.dataUrl || null)'), true, 'Doit passer l image à ask()');
  assert.equal(code.includes('Fiche en cours de révision'), true, 'Doit afficher la fiche active dans l écran d accueil');
});

test('callClaude — Vision mode is triggered when imageUrl is provided in options or parameter', async () => {
  let geminiCalled = false;
  let receivedImage = null;

  const mockDeps = {
    getGeminiKeyCount: () => 1,
    isGeminiLikelyUnavailable: () => false,
    callGeminiGenerateContent: async ({ body }) => {
      geminiCalled = true;
      const parts = body?.contents?.[0]?.parts || [];
      receivedImage = parts.find((p) => p.inlineData);
      return {
        candidates: [{ content: { parts: [{ text: 'Explication multimodale réussie' }] } }]
      };
    },
    aiCall: async () => ({ text: 'mock' })
  };

  const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  const res = await callClaude('System', 'Analyse cette image', { task: 'chat', json: true }, sampleDataUrl, mockDeps);

  assert.equal(geminiCalled, true, 'Gemini Vision doit être appelé');
  assert.equal(receivedImage !== null, true, 'Gemini doit recevoir l image en inlineData');
  assert.equal(res, 'Explication multimodale réussie', 'Doit renvoyer le texte généré');
});

test('Agent Knowledge — System prompt contains Mode Interrogation & Quiz Actif', () => {
  const prompt = buildAgentSystemPrompt({ view: 'review' });
  assert.equal(prompt.includes('Mode Interrogation & Quiz Actif'), true, 'Doit contenir la règle de quiz actif');
  assert.equal(prompt.includes('PÉDAGOGIE ACTIVE (Active Recall)'), true, 'Doit spécifier la pédagogie active');
  assert.equal(prompt.includes('INTERDICTION FORMELLE DE DONNER UN COURS MAGISTRAL'), true, 'Ne doit pas donner de cours passif');
});

test('Agent Knowledge — suggestionsForView returns card questions when card is active', async () => {
  const { suggestionsForView } = await import('../lib/appKnowledge.js');
  const card = { front: "When I'm at the top of the mountain" };
  const suggestions = suggestionsForView('review', card);
  assert.equal(suggestions.some(s => s.includes('Pose-moi une question piège')), true, 'Doit proposer une question piège sur la fiche');
  assert.equal(suggestions.some(s => s.includes('nuance clé')), true, 'Doit proposer la nuance');
});

test('AgentPanel — Contains Interroge-moi sur cette fiche button', () => {
  const code = fs.readFileSync(path.resolve('src/components/AgentPanel.jsx'), 'utf-8');
  assert.equal(code.includes('Interroge-moi sur cette fiche (Quiz actif)'), true, 'Doit contenir le bouton de quiz actif');
  assert.equal(code.includes('Nuance & Vrai sens'), true, 'Doit contenir le bouton Nuance & Vrai sens');
  assert.equal(code.includes('Pièges à éviter'), true, 'Doit contenir le bouton Pièges à éviter');
  assert.equal(code.includes('Questions sur cette fiche'), true, 'Doit afficher le libellé Questions sur cette fiche');
});

