// 🧪 tests/scholarshipVerifier.test.mjs
// Suite de tests automatisés de Garantie de Vérité & Conformité Réglementaire
// Lancer avec : node --test src/tests/scholarshipVerifier.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASTER_SCHOLARSHIPS_DATABASE } from '../lib/scholarshipCatalog.js';
import {
  verifyScholarshipTruth,
  auditDatabaseTruth,
  isAuthoritativeDomain,
  AUTHORITATIVE_GOVERNMENT_DOMAINS,
} from '../lib/scholarshipVerifier.js';

test('ScholarshipVerifier — Whitelist des domaines gouvernementaux et d’autorité étatique', () => {
  assert.ok(AUTHORITATIVE_GOVERNMENT_DOMAINS.length >= 20, 'La whitelist doit couvrir tous les gouvernements officiels');
  
  // Domaines étatiques valides
  assert.ok(isAuthoritativeDomain('https://mesr.gouv.sn/direction-des-bourses/'));
  assert.ok(isAuthoritativeDomain('https://ensae.ansd.sn/'));
  assert.ok(isAuthoritativeDomain('https://sn.ambafrance.org/'));
  assert.ok(isAuthoritativeDomain('https://www.campusfrance.org/fr/eiffel'));
  assert.ok(isAuthoritativeDomain('https://www.chevening.org/'));
  assert.ok(isAuthoritativeDomain('https://www.daad.de/en/'));
  assert.ok(isAuthoritativeDomain('https://sn.usembassy.gov/'));
  assert.ok(isAuthoritativeDomain('https://www.mext.go.jp/'));
  assert.ok(isAuthoritativeDomain('https://mastercardfdn.org/'));
  assert.ok(isAuthoritativeDomain('https://www.worldbank.org/'));

  // Domaines tiers / agrégateurs / blogs non officiels (DOIVENT ÊTRE REJETÉS)
  assert.equal(isAuthoritativeDomain('https://fake-scholarship-blog.com'), false);
  assert.equal(isAuthoritativeDomain('https://boursedetude-gratuit.xyz'), false);
  assert.equal(isAuthoritativeDomain('https://opportunity-desk-unofficial.net'), false);
});

test('ScholarshipVerifier — Audit de conformité de 100% du catalogue de bourses', () => {
  const auditResult = auditDatabaseTruth(MASTER_SCHOLARSHIPS_DATABASE);

  assert.ok(auditResult.total >= 25, 'Le catalogue complet doit être audité');
  assert.equal(
    auditResult.complianceRate,
    100,
    `Le taux de conformité doit être de 100% (actuel: ${auditResult.complianceRate}%)`
  );
  assert.equal(
    auditResult.averageTrustScore,
    100,
    `Le score moyen de confiance doit être de 100% (actuel: ${auditResult.averageTrustScore}%)`
  );

  // Vérification détaillée de chaque rapport individuel
  MASTER_SCHOLARSHIPS_DATABASE.forEach((item) => {
    const report = verifyScholarshipTruth(item);
    assert.equal(report.isValid, true, `La bourse ${item.id} a échoué à l'audit de vérité`);
    assert.equal(report.trustScore, 100, `Score insuffisant pour ${item.id}`);
    assert.ok(report.legalReference.length > 10, `Référence juridique manquante pour ${item.id}`);
    assert.ok(report.verifiedDomain.length > 3, `Domaine vérifié manquant pour ${item.id}`);
  });
});

test('ScholarshipVerifier — Détection et blocage immédiat d’une entrée corrompue ou trompeuse', () => {
  const fakeScholarship = {
    id: "fake_scholarship_unofficial",
    title: "Bourse Douteuse Non Officielle",
    officialUrl: "https://random-scam-site.org/scholarship",
    verifiedOrg: "Organisme inconnu",
    eligibility: {
      academicLevel: "Non spécifié",
    },
    requiredDocuments: [],
  };

  const report = verifyScholarshipTruth(fakeScholarship);
  assert.equal(report.isValid, false);
  assert.ok(report.trustScore < 50);
  assert.equal(report.seal, "⚠️ NON CERTIFIÉ");
});
