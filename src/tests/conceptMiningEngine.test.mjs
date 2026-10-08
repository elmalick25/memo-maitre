import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDocumentCoverage, buildTargetedGenerationPrompt, CONCEPT_MINING_SYSTEM_PROMPT } from '../lib/conceptMiningEngine.js';

test('conceptMiningEngine — CONCEPT_MINING_SYSTEM_PROMPT contient les directives d\'exhaustivité', () => {
  assert.equal(CONCEPT_MINING_SYSTEM_PROMPT.includes('INVENTAIRE FORENSIQUE EXHAUSTIF'), true);
  assert.equal(CONCEPT_MINING_SYSTEM_PROMPT.includes('ZÉRO OMISSION'), true);
});

test('conceptMiningEngine — auditDocumentCoverage identifie les concepts couverts et manquants', () => {
  const concepts = [
    { name: 'if conditionnelle stricte', coreSyntaxOrRule: '(if cond trait)' },
    { name: 'dotimes avec optional valFinale', coreSyntaxOrRule: '(dotimes (x 7 val) ...)' },
    { name: 'interruption return', coreSyntaxOrRule: '(return t)' }
  ];

  const cards = [
    { front: 'Quelle est la syntaxe d\'une conditionnelle stricte if ?', back: '**(if cond trait)**', keyword: 'if strict' },
    { front: 'Comment fonctionne l\'interruption return dans loop ?', back: '**(return t)** arrête la boucle', keyword: 'return' }
  ];

  const audit = auditDocumentCoverage(concepts, cards);
  assert.equal(audit.total, 3);
  assert.equal(audit.coveredCount, 2);
  assert.equal(audit.coveragePercent, 67);
  assert.equal(audit.missed.length, 1);
  assert.equal(audit.missed[0].name.includes('dotimes'), true);
});

test('conceptMiningEngine — buildTargetedGenerationPrompt injecte toutes les notions dans la consigne', () => {
  const concepts = [
    { name: 'dolist', coreSyntaxOrRule: '(dolist (x liste) ...)', trapOrDetail: 'parcourt chaque élément', type: 'code' },
    { name: 'case otherwise', coreSyntaxOrRule: '(case n ...)', trapOrDetail: 'capture défaut', type: 'qa' }
  ];

  const prompt = buildTargetedGenerationPrompt(concepts, 'DIRECTIVE_TEST', 'REGLE_PEDAGOGIQUE');
  assert.equal(prompt.includes('ZERO-DROP GUARANTEE'), true);
  assert.equal(prompt.includes('dolist'), true);
  assert.equal(prompt.includes('case otherwise'), true);
});
