// 🧪 tests/scholarshipCatalog.test.mjs
// Tests automatisés du Catalogue et Moteur de Bourses Master Internationales
// Lancer avec : node --test src/tests/scholarshipCatalog.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTER_SCHOLARSHIPS_DATABASE,
  computeScholarshipDeadlineInfo,
  filterScholarships,
  getScholarshipStats,
} from '../lib/scholarshipCatalog.js';

test('ScholarshipCatalog — Intégrité de la base de données officielle des bourses de Master', () => {
  assert.ok(MASTER_SCHOLARSHIPS_DATABASE.length >= 8, 'Le catalogue doit contenir au moins 8 grandes bourses mondiales');

  MASTER_SCHOLARSHIPS_DATABASE.forEach((item) => {
    assert.ok(item.id, `ID manquant pour ${item.title}`);
    assert.ok(item.title, `Titre manquant pour ${item.id}`);
    assert.ok(item.provider, `Organisme fournisseur manquant pour ${item.id}`);
    assert.ok(item.country, `Pays manquant pour ${item.id}`);
    assert.ok(item.countryCode, `Code pays manquant pour ${item.id}`);
    assert.ok(item.monthlyStipend, `Allocation mensuelle manquante pour ${item.id}`);
    assert.ok(item.officialUrl.startsWith('https://'), `Lien officiel invalide pour ${item.id}`);
    assert.ok(item.trustScore >= 95, `Indice de confiance officiel insuffisant pour ${item.id}`);
    assert.ok(Array.isArray(item.benefits) && item.benefits.length > 0, `Avantages manquants pour ${item.id}`);
  });
});

test('ScholarshipCatalog — Calculateur de compte à rebours et statuts de date limite', () => {
  // Test date future lointaine (> 45 jours)
  const farFuture = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const farInfo = computeScholarshipDeadlineInfo(farFuture);
  assert.equal(farInfo.status, 'open');
  assert.equal(farInfo.isUrgent, false);
  assert.ok(farInfo.daysLeft >= 59);

  // Test date urgente (< 15 jours)
  const urgentFuture = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const urgentInfo = computeScholarshipDeadlineInfo(urgentFuture);
  assert.equal(urgentInfo.status, 'urgent');
  assert.equal(urgentInfo.isUrgent, true);
  assert.ok(urgentInfo.label.includes('J-10'));

  // Test date passée
  const pastInfo = computeScholarshipDeadlineInfo('2020-01-01');
  assert.equal(pastInfo.status, 'closed');
  assert.equal(pastInfo.isUrgent, false);
});

test('ScholarshipCatalog — Filtrage multicritères (Pays, 100% financé, recherche plein texte)', () => {
  // Filtre par pays 🇫🇷 France
  const franceScholarships = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { country: 'FR' });
  assert.ok(franceScholarships.length >= 2);
  franceScholarships.forEach((s) => assert.equal(s.countryCode, 'FR'));

  // Filtre par financement 100% Tout Compris
  const fullRideScholarships = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { fundingType: 'full_ride' });
  assert.ok(fullRideScholarships.length > 0);
  fullRideScholarships.forEach((s) => assert.equal(s.fundingType, 'full_ride'));

  // Recherche par mot clé "Eiffel"
  const eiffelSearch = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { searchQuery: 'Eiffel' });
  assert.equal(eiffelSearch.length, 1);
  assert.equal(eiffelSearch[0].id, 'bourse_eiffel_france');

  // Recherche par mot clé "DAAD"
  const daadSearch = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { searchQuery: 'DAAD' });
  assert.equal(daadSearch.length, 1);
  assert.equal(daadSearch[0].countryCode, 'DE');
});

test('ScholarshipCatalog — Calcul des statistiques globales', () => {
  const stats = getScholarshipStats(MASTER_SCHOLARSHIPS_DATABASE);
  assert.ok(stats.total >= 8);
  assert.ok(stats.fullRideCount >= 5);
  assert.ok(stats.countriesCount >= 5);
});
