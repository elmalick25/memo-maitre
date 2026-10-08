import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTER_SCHOLARSHIPS_DATABASE,
  isEligibleForSenegalL3CS,
  filterScholarships,
  getScholarshipStats,
  SENEGAL_L3_CS_APPLICATION_GUIDE,
} from '../lib/scholarshipCatalog.js';

test('isEligibleForSenegalL3CS : identifie correctement les bourses adaptées à un L3 Info au Sénégal', () => {
  const eiffel = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_eiffel_france');
  assert.ok(eiffel, 'Eiffel doit exister');
  assert.equal(isEligibleForSenegalL3CS(eiffel), true, 'Eiffel doit être éligible pour un L3 informatique sénégalais');

  const erasmus = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_erasmus_mundus_ue');
  assert.ok(erasmus, 'Erasmus Mundus doit exister');
  assert.equal(isEligibleForSenegalL3CS(erasmus), true, 'Erasmus Mundus doit être éligible pour un L3 informatique sénégalais');

  const mcf = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_mastercard_foundation');
  assert.ok(mcf, 'Mastercard Foundation doit exister');
  assert.equal(isEligibleForSenegalL3CS(mcf), true, 'Mastercard Foundation doit être éligible pour un L3 informatique sénégalais');

  const chevening = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_chevening_uk');
  assert.ok(chevening, 'Chevening doit exister');
  assert.equal(isEligibleForSenegalL3CS(chevening), false, 'Chevening exige 2 800h d’expérience et doit être exclu pour un étudiant direct L3');

  const bgf = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_bgf_france_senegal');
  assert.ok(bgf, 'BGF doit exister');
  assert.equal(isEligibleForSenegalL3CS(bgf), false, 'BGF exige un Master 1 validé et ne s’adresse qu’au Master 2 / thèse : exclu pour un L3');

  const worldBank = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_banque_mondiale_jjwbgsp');
  assert.ok(worldBank, 'Banque Mondiale doit exister');
  assert.equal(isEligibleForSenegalL3CS(worldBank), false, 'Banque Mondiale exige 3 ans d’expérience post-diplôme : exclu pour un L3');

  const australia = MASTER_SCHOLARSHIPS_DATABASE.find(s => s.id === 'bourse_australia_awards');
  assert.ok(australia, 'Australia Awards doit exister');
  assert.equal(isEligibleForSenegalL3CS(australia), false, 'Australia Awards exige 2 à 3 ans d’expérience pro : exclu pour un L3');
});

test('filterScholarships : le filtre forMeOnly restreint la sélection aux opportunités accessibles', () => {
  const allList = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { status: 'include_closed' });
  const forMeList = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, { status: 'include_closed', forMeOnly: true });

  assert.ok(forMeList.length > 0, 'Il doit y avoir des bourses éligibles');
  assert.ok(forMeList.length <= allList.length, 'La liste filtrée doit être un sous-ensemble');
  forMeList.forEach(s => {
    assert.equal(isEligibleForSenegalL3CS(s), true, `Chaque bourse retenue doit être éligible: ${s.title}`);
  });
});

test('getScholarshipStats : calcule le décompte forMeCount', () => {
  const stats = getScholarshipStats(MASTER_SCHOLARSHIPS_DATABASE);
  assert.ok(typeof stats.forMeCount === 'number');
  assert.ok(stats.forMeCount > 0);
});

test('SENEGAL_L3_CS_APPLICATION_GUIDE : contient les 5 sections stratégiques et des conseils concrets', () => {
  assert.ok(SENEGAL_L3_CS_APPLICATION_GUIDE.title);
  assert.ok(SENEGAL_L3_CS_APPLICATION_GUIDE.sections.length >= 5);
  const sectionIds = SENEGAL_L3_CS_APPLICATION_GUIDE.sections.map(s => s.id);
  assert.ok(sectionIds.includes('l3_status'), 'Doit contenir la section L3 sans diplôme physique');
  assert.ok(sectionIds.includes('cs_portfolio'), 'Doit contenir la section portfolio tech');
  assert.ok(sectionIds.includes('dakar_admin'), 'Doit contenir le circuit de légalisation à Dakar');
});
