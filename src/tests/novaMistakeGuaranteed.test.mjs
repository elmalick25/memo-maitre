import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDailySession, isNovaMistakeCard } from '../lib/memoryLab.js';
const TODAY = '2026-10-16';
const mk = (id, extra = {}) => ({ id, front: `Q ${id}`, back: 'A', category: 'Général', dueDate: '2026-10-01', nextReview: '2026-10-01', ...extra });
const mistakes = (n) => Array.from({ length: n }, (_, i) => mk(`err-${i}`, { source: 'user_error', category: 'Anglais' }));
const novaVocab = (n) => Array.from({ length: n }, (_, i) => mk(`nova-vocab-${i}`, { _agentDetected: true, category: 'Anglais' }));
const others = (n) => Array.from({ length: n }, (_, i) => mk(`o-${i}`, { category: `Cat${i % 4}` }));

test('les 10 fiches Erreur Nova figurent toujours parmi les 45', () => {
  const s = composeDailySession([...others(200), ...novaVocab(60), ...mistakes(30)], { todayISO: TODAY, target: 45 });
  assert.equal(s.length, 45);
  assert.equal(s.filter(isNovaMistakeCard).length, 10);
});

test('le vocabulaire Nova ne vole pas les places des erreurs', () => {
  const s = composeDailySession([...novaVocab(100), ...mistakes(12)], { todayISO: TODAY, target: 45 });
  assert.ok(s.filter(isNovaMistakeCard).length >= 10);
});

test('moins de 10 erreurs dues : toutes sont incluses', () => {
  const s = composeDailySession([...others(200), ...mistakes(4)], { todayISO: TODAY, target: 45 });
  assert.equal(s.length, 45);
  assert.equal(s.filter(isNovaMistakeCard).length, 4);
});
