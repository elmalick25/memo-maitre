// 🧪 tests/scholarshipCatalog.test.mjs
// Tests automatisés du Catalogue et Moteur de Bourses Master Internationales & Sénégalaises — Édition God Tier
// Lancer avec : node --test src/tests/scholarshipCatalog.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTER_SCHOLARSHIPS_DATABASE,
  SCHOLARSHIP_CATEGORIES,
  computeScholarshipDeadlineInfo,
  filterScholarships,
  getScholarshipStats,
} from '../lib/scholarshipCatalog.js';

test('ScholarshipCatalog — Intégrité de la base de données officielle des bourses de Master (God Tier)', () => {
  assert.ok(MASTER_SCHOLARSHIPS_DATABASE.length >= 25, 'Le catalogue doit contenir au moins 25 grandes bourses officielles');

  MASTER_SCHOLARSHIPS_DATABASE.forEach((item) => {
    assert.ok(item.id, `ID manquant pour ${item.title}`);
    assert.ok(item.title, `Titre manquant pour ${item.id}`);
    assert.ok(item.categoryGroup, `categoryGroup manquant pour ${item.id}`);
    assert.ok(item.provider, `Organisme fournisseur manquant pour ${item.id}`);
    assert.ok(item.country, `Pays manquant pour ${item.id}`);
    assert.ok(item.countryCode, `Code pays manquant pour ${item.id}`);
    assert.ok(item.monthlyStipend, `Allocation mensuelle manquante pour ${item.id}`);
    assert.ok(item.officialUrl.startsWith('https://'), `Lien officiel invalide pour ${item.id}`);
    assert.ok(Array.isArray(item.benefits) && item.benefits.length > 0, `Avantages manquants pour ${item.id}`);

    // 🎯 Vérification des critères d'éligibilité approfondis
    assert.ok(item.eligibility, `Objet eligibility manquant pour ${item.id}`);
    assert.ok(item.eligibility.academicLevel, `academicLevel manquant pour ${item.id}`);
    assert.ok(item.eligibility.maxAge, `maxAge manquant pour ${item.id}`);
    assert.ok(item.eligibility.nationality, `nationality manquante pour ${item.id}`);
    assert.ok(item.eligibility.languageReq, `languageReq manquant pour ${item.id}`);
    assert.ok(item.eligibility.nominationMode, `nominationMode manquant pour ${item.id}`);

    // 📁 Vérification de la checklist des documents
    assert.ok(Array.isArray(item.requiredDocuments) && item.requiredDocuments.length >= 2, `Documents requis insuffisants pour ${item.id}`);
    item.requiredDocuments.forEach((doc) => {
      assert.ok(doc.id, `ID de document manquant dans ${item.id}`);
      assert.ok(doc.name, `Nom de document manquant dans ${item.id}`);
      assert.ok(doc.category, `Catégorie de document manquante dans ${item.id}`);
      assert.ok(doc.categoryLabel, `Label de catégorie manquant dans ${item.id}`);
      assert.ok(doc.description, `Description de document manquante dans ${item.id}`);
      assert.ok(doc.specifications, `Spécifications de document manquantes dans ${item.id}`);
      assert.ok(doc.godTip, `Conseil Pro manquant pour ${doc.name} dans ${item.id}`);
    });

    // 🗺️ Roadmap & Calendrier
    assert.ok(Array.isArray(item.applicationSteps) && item.applicationSteps.length >= 3, `Étapes de candidature manquantes pour ${item.id}`);

    // 🧠 Critères de sélection & Secrets du jury
    assert.ok(Array.isArray(item.selectionCriteria) && item.selectionCriteria.length >= 2, `Critères de sélection manquants pour ${item.id}`);
    assert.ok(Array.isArray(item.juryInsights) && item.juryInsights.length >= 2, `Conseils de jury manquants pour ${item.id}`);
  });
});

test('ScholarshipCatalog — Présence des programmes stratégiques sénégalais et multilatéraux', () => {
  const ids = new Set(MASTER_SCHOLARSHIPS_DATABASE.map((s) => s.id));
  
  // Bourses sénégalaises et coopération
  assert.ok(ids.has('bourse_excellence_president_senegal'), 'Bourse Présidence du Sénégal manquante');
  assert.ok(ids.has('bourse_dbs_etranger_senegal'), 'Bourse DBS Étranger manquante');
  assert.ok(ids.has('bourse_coop_senegal_maroc_amci'), 'Bourse Coopération Maroc AMCI manquante');
  assert.ok(ids.has('bourse_bgf_france_senegal'), 'Bourse BGF Ambassade de France manquante');
  assert.ok(ids.has('bourse_coop_senegal_chine_csc'), 'Bourse Coopération Chine CSC manquante');
  assert.ok(ids.has('bourse_ansd_ensae_dakar'), 'Bourse ANSD / ENSAE Dakar manquante');
  assert.ok(ids.has('bourse_cea_mitic_senegal'), 'Bourse CEA-MITIC UGB manquante');

  // Multilatéral & Grandes Fondations
  assert.ok(ids.has('bourse_mastercard_foundation'), 'Mastercard Foundation Scholars manquante');
  assert.ok(ids.has('bourse_banque_mondiale_jjwbgsp'), 'Bourse Banque Mondiale JJ/WBGSP manquante');
  assert.ok(ids.has('bourse_bad_afdb_japan'), 'Bourse Banque Africaine de Développement manquante');
  assert.ok(ids.has('bourse_isdb_master'), 'Bourse Banque Islamique de Développement manquante');
  assert.ok(ids.has('bourse_union_africaine_pau'), 'Bourse Université Panafricaine manquante');
  assert.ok(ids.has('bourse_cedeao_master'), 'Bourse CEDEAO manquante');
  assert.ok(ids.has('bourse_auf_francophonie'), 'Bourse AUF Francophonie manquante');

  // Europe & Monde
  assert.ok(ids.has('bourse_erasmus_mundus_ue'), 'Erasmus Mundus manquante');
  assert.ok(ids.has('bourse_eiffel_france'), 'Bourse Eiffel manquante');
  assert.ok(ids.has('bourse_chevening_uk'), 'Bourse Chevening manquante');
  assert.ok(ids.has('bourse_daad_epos_germany'), 'Bourse DAAD EPOS manquante');
  assert.ok(ids.has('bourse_fulbright_usa'), 'Bourse Fulbright USA manquante');
  assert.ok(ids.has('bourse_mext_japan'), 'Bourse MEXT Japon manquante');
  assert.ok(ids.has('bourse_gks_korea'), 'Bourse GKS Corée manquante');
  assert.ok(ids.has('bourse_turkiye_burslari'), 'Bourse Türkiye Bursları manquante');
  assert.ok(ids.has('bourse_australia_awards'), 'Bourse Australia Awards manquante');
});

test('ScholarshipCatalog — Exactitude et robustesse des URLs officielles de candidature', () => {
  MASTER_SCHOLARSHIPS_DATABASE.forEach((item) => {
    assert.ok(item.officialUrl.startsWith('https://'), `L'URL de ${item.id} doit débuter par https://`);
    assert.ok(!item.officialUrl.includes('undefined'), `L'URL ne doit pas contenir undefined pour ${item.id}`);
    assert.ok(item.officialUrl.length > 12, `L'URL doit être complète pour ${item.id}`);
  });

  // Contrôles ciblés sur les portails vérifiés
  const boutmy = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_emile_boutmy_sciencespo');
  assert.equal(boutmy.officialUrl, 'https://www.sciencespo.fr/students/fr/financer/bourses-aides-financieres/bourse-emile-boutmy/');

  const bgf = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_bgf_france_senegal');
  assert.equal(bgf.officialUrl, 'https://bourses.franceausenegal.com/register');

  const suiss = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_confederation_suisse');
  assert.equal(suiss.officialUrl, 'https://www.sbfi.admin.ch/sbfi/en/home/education/scholarships-and-grants/swiss-government-excellence-scholarships.html');

  const fulbright = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_fulbright_usa');
  assert.equal(fulbright.officialUrl, 'https://foreign.fulbrightonline.org/about/foreign-student-program');

  const mext = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_mext_japan');
  assert.equal(mext.officialUrl, 'https://www.studyinjapan.go.jp/en/planning/scholarship/');
});

test('ScholarshipCatalog — Calculateur de compte à rebours et statuts de date limite', () => {
  // Test date future lointaine (> 45 jours)
  const farFuture = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const farInfo = computeScholarshipDeadlineInfo(farFuture);
  assert.equal(farInfo.status, 'open');
  assert.ok(farInfo.label.includes('J-'));

  // Test date urgente (< 15 jours)
  const urgentFuture = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const urgentInfo = computeScholarshipDeadlineInfo(urgentFuture);
  assert.equal(urgentInfo.status, 'urgent');
  assert.ok(urgentInfo.label.includes('Clôture dans 10 jours'));

  // Test date passée
  const pastInfo = computeScholarshipDeadlineInfo('2020-01-01');
  assert.equal(pastInfo.status, 'closed');
});

test('ScholarshipCatalog — Filtrage multicritères (Catégorie, Pays, 100% financé, recherche)', () => {
  // Filtre par catégorie 🇸🇳 Sénégal
  const senegalScholarships = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { categoryGroup: 'senegal' });
  assert.ok(senegalScholarships.length >= 7);
  senegalScholarships.forEach((s) => assert.equal(s.categoryGroup, 'senegal'));

  // Filtre par catégorie 🌍 Multilatéral
  const multiScholarships = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { categoryGroup: 'multilateral' });
  assert.ok(multiScholarships.length >= 7);
  multiScholarships.forEach((s) => assert.equal(s.categoryGroup, 'multilateral'));

  // Filtre par pays 🇫🇷 France
  const franceScholarships = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { country: 'FR' });
  assert.ok(franceScholarships.length >= 2);
  franceScholarships.forEach((s) => assert.equal(s.countryCode, 'FR'));

  // Filtre par financement 100% Tout Compris
  const fullRideScholarships = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { fundingType: 'full_ride' });
  assert.ok(fullRideScholarships.length >= 20);
  fullRideScholarships.forEach((s) => assert.equal(s.fundingType, 'full_ride'));

  // Recherche par mot clé "Sénégal"
  const snSearch = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { searchQuery: 'Sénégal' });
  assert.ok(snSearch.length >= 7);

  // Recherche par mot clé "Mastercard"
  const mcfSearch = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { searchQuery: 'Mastercard' });
  assert.equal(mcfSearch.length, 1);
  assert.equal(mcfSearch[0].id, 'bourse_mastercard_foundation');

  // Recherche par mot clé "Banque Mondiale"
  const wbSearch = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { searchQuery: 'Banque Mondiale' });
  assert.ok(wbSearch.length >= 1);
});

test('ScholarshipCatalog — Calcul des statistiques globales', () => {
  const stats = getScholarshipStats(MASTER_SCHOLARSHIPS_DATABASE);
  assert.ok(stats.total >= 25);
  assert.ok(stats.senegalCount >= 7);
  assert.ok(stats.multilateralCount >= 7);
  assert.ok(stats.europeCount >= 8);
  assert.ok(stats.americasAsiaCount >= 6);
  assert.ok(stats.fullRideCount >= 20);
  assert.ok(stats.countriesCount >= 10);
});
