// src/tests/crossDeviceSync.test.mjs
//
// Vérifie le cœur du fix « compteur de fiches identique sur mobile et PC » :
//   1. la règle de conflit unique (une révision distante gagne toujours)
//   2. la signature d'état (détecte les révisions, pas seulement les ajouts)

import assert from 'node:assert/strict'
import { resolveConflict, historyLength } from '../lib/db/conflictResolution.js'
import { computeSignature, signaturesMatch } from '../lib/db/syncSignature.js'

let passed = 0
const test = (name, fn) => {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

console.log('\ncrossDeviceSync')

test('historyLength accepte un tableau ou du JSON', () => {
  assert.equal(historyLength([1, 2, 3]), 3)
  assert.equal(historyLength('[1,2]'), 2)
  assert.equal(historyLength(null), 0)
  assert.equal(historyLength('pas du json'), 0)
})

test('la fiche révisée ailleurs gagne (scénario 34 → 31)', () => {
  const remote = { reviewHistory: [1, 2, 3, 4], repetitions: 4, nextReview: '2026-08-10', updatedAt: 1000 }
  // Le PC a une horloge en avance : sans la règle « historique le plus long »,
  // son état périmé gagnerait et le compteur resterait bloqué à 34.
  const local = { reviewHistory: [1, 2, 3], repetitions: 3, nextReview: '2026-08-02', updatedAt: 999999 }
  assert.equal(resolveConflict(remote, local), 'remote')
})

test('la révision locale non encore poussée gagne', () => {
  const remote = { reviewHistory: [1], repetitions: 1, nextReview: '2026-08-02', updatedAt: 5000 }
  const local = { reviewHistory: [1, 2], repetitions: 2, nextReview: '2026-08-09', updatedAt: 1 }
  assert.equal(resolveConflict(remote, local), 'local')
})

test('états identiques → aucune écriture inutile', () => {
  const card = { reviewHistory: [1, 2], repetitions: 2, nextReview: '2026-08-09', updatedAt: 4242 }
  assert.equal(resolveConflict({ ...card }, { ...card }), 'equal')
})

test('la signature bouge quand on révise (le simple compteur, non)', () => {
  const avant = [
    { repetitions: 1, reviewHistory: [1], nextReview: '2026-08-02' },
    { repetitions: 0, reviewHistory: [], nextReview: '2026-08-02' },
    { repetitions: 5, reviewHistory: [1, 2, 3, 4, 5], nextReview: '2026-09-01' },
  ]
  const apres = [
    { repetitions: 2, reviewHistory: [1, 2], nextReview: '2026-08-05' },
    { repetitions: 0, reviewHistory: [], nextReview: '2026-08-02' },
    { repetitions: 5, reviewHistory: [1, 2, 3, 4, 5], nextReview: '2026-09-01' },
  ]
  const sigAvant = computeSignature(avant, '2026-08-02')
  const sigApres = computeSignature(apres, '2026-08-02')
  assert.equal(sigAvant.count, sigApres.count, 'le nombre de fiches ne change pas — d’où l’ancien angle mort')
  assert.equal(signaturesMatch(sigAvant, sigApres), false, 'la signature, elle, détecte la révision')
})

test('le comptage des fiches dues ignore les fiches en pause', () => {
  const cards = [
    { nextReview: '2026-08-01' },
    { nextReview: '2026-08-02' },
    { nextReview: '2026-08-03' },
    { nextReview: '2026-08-01', paused: true },
  ]
  assert.equal(computeSignature(cards, '2026-08-02').due, 2)
})

test('le fuseau horaire ne déclenche pas de fausse divergence', () => {
  const cards = [{ repetitions: 1, reviewHistory: [1], nextReview: '2026-08-02' }]
  const mobile = computeSignature(cards, '2026-08-02') // due = 1
  const pc = computeSignature(cards, '2026-08-01')     // due = 0
  assert.notEqual(mobile.due, pc.due)
  assert.equal(signaturesMatch(mobile, pc), true)
})

console.log(`\n${passed} tests OK\n`)
