import test from 'node:test';
import assert from 'node:assert/strict';
import { findRelatedCoverage, coverageScore } from '../lib/newsCoverage.js';

test('Couverture — une actu reprise par 3 autres sites atteint 10/10 avec une base de 4', () => {
  assert.equal(coverageScore(4, 4), 10);
  assert.equal(coverageScore(4, 1), 4);
});

test('Couverture — retrouve les autres sites qui parlent du même sujet', () => {
  const items = [
    { id: 'a', source: 'hn', title: 'OpenAI releases GPT-6 model with reasoning' },
    { id: 'b', source: 'verge', title: 'GPT-6 model released by OpenAI today' },
    { id: 'c', source: 'hn', title: 'OpenAI GPT-6 model thread' },
    { id: 'd', source: 'wired', title: 'Rust 2.0 ships new borrow checker' },
  ];
  assert.deepEqual(findRelatedCoverage(items[0], items).map(i => i.id), ['b']);
});
