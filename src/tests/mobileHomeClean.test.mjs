import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mobileHomePath = path.resolve('src/components/MobileHomeV2.jsx');
const memoMasterPath = path.resolve('src/MemoMaster.jsx');
const routineTrackerPath = path.resolve('src/components/DailyRoutineTracker.jsx');

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

test('DailyRoutineTracker — renders onBack button when onBack prop is provided', () => {
  const fileContent = fs.readFileSync(routineTrackerPath, 'utf8');
  assert.equal(
    fileContent.includes('onBack'),
    true,
    'DailyRoutineTracker doit gérer la prop onBack'
  );
  assert.equal(
    fileContent.includes('← Accueil'),
    true,
    'DailyRoutineTracker doit afficher le bouton ← Accueil quand onBack est fourni'
  );
});

test('MemoMaster — renders dedicated quests view and passes onBack to routine', () => {
  const fileContent = fs.readFileSync(memoMasterPath, 'utf8');
  assert.equal(
    fileContent.includes('view === "quests"'),
    true,
    'MemoMaster doit supporter la vue dédiée view === quests'
  );
  assert.equal(
    fileContent.includes('onBack={() => setView("dashboard")}'),
    true,
    'MemoMaster doit passer onBack={() => setView("dashboard")} à DailyRoutineTracker'
  );
});

test('MemoMaster — dueModules s\'appuie sur les aperçus de session par module', () => {
  const fileContent = fs.readFileSync(memoMasterPath, 'utf8');
  assert.match(
    fileContent,
    /categorySessionPreviews\[c\.name\]\?\.servedSize/,
    'MemoMaster doit décompter les modules en retard à partir de categorySessionPreviews pour rester cohérent avec la session servie'
  );
});
