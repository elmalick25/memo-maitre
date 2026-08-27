import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mobileHomePath = path.resolve('src/components/MobileHomeV2.jsx');
const dashboardViewPath = path.resolve('src/components/DashboardView.jsx');
const redesignCssPath = path.resolve('src/styles/mobile-redesign.css');

test('MobileHomeV2 — renders Veille tech and English shortcuts in RACCOURCIS grid below the 4 tiles', () => {
  const fileContent = fs.readFileSync(mobileHomePath, 'utf8');

  assert.equal(
    fileContent.includes('mhv2-section-title'),
    true,
    'MobileHomeV2 doit contenir le titre de section RACCOURCIS'
  );
  assert.equal(
    fileContent.includes('mhv2-shortcuts'),
    true,
    'MobileHomeV2 doit contenir la grille mhv2-shortcuts'
  );
  assert.equal(
    fileContent.includes('Veille tech'),
    true,
    'MobileHomeV2 doit afficher le label Veille tech'
  );
  assert.equal(
    fileContent.includes('English'),
    true,
    'MobileHomeV2 doit afficher le label English'
  );
  assert.equal(
    fileContent.includes('onOpenVeille?.()'),
    true,
    'Le bouton Veille tech doit appeler onOpenVeille'
  );
  assert.equal(
    fileContent.includes('onOpenPractice?.()'),
    true,
    'Le bouton English doit appeler onOpenPractice'
  );
});

test('DashboardView — passes onOpenVeille and onOpenPractice handlers to MobileHomeV2', () => {
  const fileContent = fs.readFileSync(dashboardViewPath, 'utf8');

  assert.equal(
    fileContent.includes('onOpenVeille={() => setView?.("veille")}'),
    true,
    'DashboardView doit passer onOpenVeille vers la vue veille'
  );
  assert.equal(
    fileContent.includes('onOpenPractice={() => setView?.("practice")}'),
    true,
    'DashboardView doit passer onOpenPractice vers la vue practice'
  );
});

test('mobile-redesign.css — contains styling for mhv2-shortcuts and mhv2-shortcut', () => {
  const cssContent = fs.readFileSync(redesignCssPath, 'utf8');

  assert.equal(
    cssContent.includes('.mhv2-shortcuts'),
    true,
    'Le CSS doit déclarer .mhv2-shortcuts'
  );
  assert.equal(
    cssContent.includes('.mhv2-shortcut'),
    true,
    'Le CSS doit déclarer .mhv2-shortcut'
  );
  assert.equal(
    cssContent.includes('.mhv2-shortcut-icon'),
    true,
    'Le CSS doit déclarer .mhv2-shortcut-icon'
  );
});
