import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const detectorPath = path.resolve('src/useAgentCardDetector.js');
const fileContent = fs.readFileSync(detectorPath, 'utf8');

test('useAgentCardDetector — SYSTEM_PROMPT targets exclusively user errors and corrections', () => {
  // Verifie que la branche B (vocabulaire pedagogique agent sans erreur user) a ete supprimee
  assert.equal(
    fileContent.includes('BRANCHE B — VOCABULAIRE PÉDAGOGIQUE DE L\'AGENT'),
    false,
    'La branche B ne doit plus figurer dans le prompt'
  );

  // Verifie que le prompt exige explicitement l'extraction uniquement sur erreur utilisateur
  assert.equal(
    fileContent.includes('CORRECTION UTILISATEUR EXCLUSIVE'),
    true,
    'Le prompt doit indiquer que la correction des erreurs utilisateur est le seul critere'
  );

  // Verifie que la transition metaphorique et la decomposition sont demandes
  assert.equal(
    fileContent.includes('Transition Métaphorique'),
    true,
    'Le prompt doit inclure la section Transition Métaphorique'
  );

  // Verifie la presence de la consigne d'erreur zero -> cards: []
  assert.equal(
    fileContent.includes('Si l\'utilisateur n\'a fait AUCUNE erreur'),
    true,
    'Le prompt doit explicitement rejeter la creation si l\'utilisateur n\'a pas fait d\'erreur'
  );
});

test('useAgentCardDetector — client-side filter rejects cards not sourced from user_error', () => {
  // Verifie que la garde client-side filtre source !== "user_error"
  assert.equal(
    fileContent.includes('source !== "user_error"'),
    true,
    'Le filtre client-side doit garantir qu\'aucune carte sans source="user_error" n\'est sauvegardee'
  );
});
