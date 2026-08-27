import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStructureInstructions,
  buildBatchPrompt,
  layoutBatchCards,
} from '../lib/aiCardPrompts.js';

test('getStructureInstructions — détecte les fiches anglais', () => {
  const instructions = getStructureInstructions({ category: '🇬🇧 Anglais' });
  assert.ok(instructions.includes('RÉTRO-INGÉNIERIE SÉMANTIQUE'));
  assert.ok(instructions.includes('Décomposition & Transition Métaphorique'));
});

test('getStructureInstructions — détecte les fiches code', () => {
  const instructions = getStructureInstructions({ category: '☕ Java / Spring Boot' });
  assert.ok(instructions.includes('DÉFINITION :'));
  assert.ok(instructions.includes('EXEMPLE :'));
});

test('getStructureInstructions — détecte le type tableau', () => {
  const instructions = getStructureInstructions({ category: 'Général', formType: 'table' });
  assert.ok(instructions.includes('LISTE STRUCTURÉE'));
});

test('buildBatchPrompt — intègre le nombre demandé et les règles atomiques', () => {
  const prompt = buildBatchPrompt({ count: 5, prompt: 'Docker', category: 'Dev' });
  assert.ok(prompt.system.includes('5 fiches'));
  assert.ok(prompt.system.includes('JSON strict'));
  assert.equal(prompt.user, 'Génère 5 fiches sur: Docker');
});

test('layoutBatchCards — assigne des coordonnées spatiales et des liens', () => {
  const cards = [
    { front: 'Q1', back: 'A1' },
    { front: 'Q2', back: 'A2' },
  ];
  const { layouted, links } = layoutBatchCards(cards);
  assert.equal(layouted.length, 2);
  assert.ok(layouted[0].id.startsWith('batch_node_'));
  assert.ok(typeof layouted[0].x === 'number');
  assert.ok(typeof layouted[0].y === 'number');
  assert.equal(links.length, 1);
  assert.equal(links[0].source, layouted[0].id);
  assert.equal(links[0].target, layouted[1].id);
});
