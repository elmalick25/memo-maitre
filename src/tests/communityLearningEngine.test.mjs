import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeQuestion,
  detectQuestionTopic,
  recordCommunityQuestion,
  getCommunityLearningStats,
  describeCommunityInsightsForPrompt,
  COMMUNITY_TOPICS,
} from '../lib/communityLearningEngine.js';
import { buildAgentSystemPrompt } from '../lib/appKnowledge.js';

test('Community Learning — Anonymisation (Sanitization)', () => {
  const dirty = "Mon email est test@example.com et mon tel 0601020304 avec https://malick.dev";
  const clean = sanitizeQuestion(dirty);
  assert.equal(clean.includes('test@example.com'), false, 'Email doit être masqué');
  assert.equal(clean.includes('0601020304'), false, 'Téléphone doit être masqué');
  assert.equal(clean.includes('https://malick.dev'), false, 'URL doit être masquée');
  assert.equal(clean.includes('[email]'), true, 'Doit remplacer par [email]');
  assert.equal(clean.includes('[téléphone]'), true, 'Doit remplacer par [téléphone]');
});

test('Community Learning — Topic Detection', () => {
  assert.equal(detectQuestionTopic("Comment utiliser la vue anglais ?"), "english_practice");
  assert.equal(detectQuestionTopic("C'est quoi l'intervalle et la stabilité dans le fsrs ?"), "fsrs_algorithm");
  assert.equal(detectQuestionTopic("Comment écrire une bonne fiche atomique recto verso ?"), "atomic_cards");
  assert.equal(detectQuestionTopic("Comment importer un cours en PDF dans le lab ?"), "lab_pdf_ai");
  assert.equal(detectQuestionTopic("Comment naviguer et aller sur les vues sur mobile ?"), "navigation_app");
  assert.equal(detectQuestionTopic("Comment garder mon streak et faire ma routine ?"), "streak_routine");
});

test('Community Learning — Stats and Ranking', () => {
  const stats = getCommunityLearningStats();
  assert.ok(stats.totalQuestions > 0, 'Total questions doit être supérieur à 0');
  assert.ok(Array.isArray(stats.topQuestions), 'topQuestions doit être un tableau');
  assert.equal(stats.mostAsked.id, 'english_practice', 'Top 1 doit être la pratique de l\'anglais');
  assert.ok(stats.mostAsked.count > 0, 'Le nombre de questions doit être positif');
});

test('Community Learning — Recording increments stats', () => {
  const before = getCommunityLearningStats();
  const initialEnglishCount = before.topQuestions.find(t => t.id === 'english_practice').count;

  recordCommunityQuestion("Je veux m'entraîner en anglais et travailler ma prononciation");

  const after = getCommunityLearningStats();
  const updatedEnglishCount = after.topQuestions.find(t => t.id === 'english_practice').count;

  assert.equal(updatedEnglishCount, initialEnglishCount + 1, 'Le compteur du topic doit être incrémenté de 1');
  assert.equal(after.totalQuestions, before.totalQuestions + 1, 'Le total de questions doit être incrémenté de 1');
});

test('Community Learning — Injection in Agent System Prompt', () => {
  const prompt = buildAgentSystemPrompt({ isMobile: true });
  assert.equal(
    prompt.includes('Mémoire Collective & Intelligence Communautaire'),
    true,
    'Le prompt de l\'IA doit contenir la section de mémoire collective'
  );
  assert.equal(
    prompt.includes('TOP 1 (Question la plus posée)'),
    true,
    'Le prompt doit identifier le TOP 1'
  );
  assert.equal(
    prompt.includes('Comment utiliser la vue Anglais et progresser en conversation ?'),
    true,
    'Le prompt doit mentionner explicitement la question la plus posée'
  );
});
