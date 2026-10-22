import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const detectorPath = new URL('../useAgentCardDetector.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const fileContent = fs.readFileSync(detectorPath, 'utf8');

test('useAgentCardDetector — SYSTEM_PROMPT prend en charge les erreurs et les expressions du coach', () => {
  // Vérifie la présence des 2 branches de génération
  assert.equal(
    fileContent.includes('BRANCHE 1 — CORRECTION D\'ERREUR UTILISATEUR'),
    true,
    'Le prompt doit supporter les corrections d\'erreurs'
  );

  assert.equal(
    fileContent.includes('BRANCHE 2 — EXPRESSION DU COACH OU INCOMPRÉHENSION'),
    true,
    'Le prompt doit supporter les expressions du coach et incompréhensions'
  );

  // Vérifie que la transition métaphorique et la logique native sont demandées
  assert.equal(
    fileContent.includes('Transition Métaphorique'),
    true,
    'Le prompt doit inclure la section Transition Métaphorique'
  );

  // Vérifie le format de verso dédié pour les découvertes coach
  assert.equal(
    fileContent.includes('Découvert avec Coach Nova'),
    true,
    'Le prompt doit inclure la structure de verso Découvert avec Coach Nova'
  );
});

test('useAgentCardDetector — filtre client-side valide les sources autorisées', () => {
  // Vérifie que la garde client-side autorise user_error, coach_input et comprehension_request
  assert.equal(
    fileContent.includes('validSources = new Set(["user_error", "coach_input", "comprehension_request"])'),
    true,
    'Le filtre client-side doit autoriser user_error, coach_input et comprehension_request'
  );
});

test('useAgentCardDetector — interdiction stricte des fiches d\'hésitation orale et bégaiement', () => {
  // Vérifie l'exclusion dans SYSTEM_PROMPT
  assert.equal(
    fileContent.includes('DISFLUENCES ET HÉSITATIONS ORALES INTERDITES'),
    true,
    'Le SYSTEM_PROMPT doit interdire formellement les fiches sur les hésitations orales'
  );

  // Vérifie le rejet client-side
  assert.equal(
    fileContent.includes('rejet: fausse erreur (bégaiement/hésitation orale humaine)'),
    true,
    'Le filtre client-side doit rejeter toute carte basée sur une hésitation ou bégaiement'
  );

  // Vérifie le nettoyage amont du message utilisateur
  assert.equal(
    fileContent.includes('cleanUserMsg = userMsg.replace(/\\b(\\w+)\\s+\\1\\b/gi, "$1")'),
    true,
    'Les bégaiements oraux doivent être nettoyés avant envoi au LLM'
  );
});
