import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mobileHomePath = path.resolve('src/components/MobileHomeV2.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');

test('MobileHomeV2 — no inline routine alert card or inline quest list', () => {
  const fileContent = fs.readFileSync(mobileHomePath, 'utf8');
  assert.equal(
    fileContent.includes('<RoutineAlertCard'),
    false,
    'MobileHomeV2 ne doit plus afficher le bloc RoutineAlertCard en ligne'
  );
  assert.equal(
    fileContent.includes('Quêtes de la semaine'),
    false,
    'MobileHomeV2 ne doit plus afficher la liste de Quêtes de la semaine en ligne'
  );
});

test('MobileHomeV2 — CTA button has modern structured badge, title, pills, and arrow', () => {
  const fileContent = fs.readFileSync(mobileHomePath, 'utf8');
  assert.equal(
    fileContent.includes('mhv2-cta-badge'),
    true,
    'Le CTA principal doit avoir un badge mhv2-cta-badge'
  );
  assert.equal(
    fileContent.includes('mhv2-cta-pill'),
    true,
    'Le CTA principal doit avoir des éléments mhv2-cta-pill pour les métadonnées'
  );
  assert.equal(
    fileContent.includes('mhv2-cta-arrow'),
    true,
    'Le CTA principal doit avoir une flèche d action mhv2-cta-arrow'
  );
});

test('MemoMaster — renders dedicated quests view', () => {
  const fileContent = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(
    fileContent.includes('view === "quests"'),
    true,
    'MemoMaster doit supporter la vue dédiée view === quests'
  );
});

test('DashboardView — dueModules uses sessionPool to match dueCount session quota', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/DashboardView.jsx'), 'utf8');
  assert.equal(
    fileContent.includes('sessionPool.filter'),
    true,
    'DashboardView doit décompter les modules en retard à partir de sessionPool pour être cohérent avec dueCount'
  );
});
