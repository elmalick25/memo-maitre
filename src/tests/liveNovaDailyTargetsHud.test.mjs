import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('Live Nova HUD : Présence du HUD Radar Lexical dans EnglishPractice.jsx', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.match(src, /className="ev-nova-daily-hud"/, "EnglishPractice doit contenir le conteneur .ev-nova-daily-hud");
  assert.match(src, /className=\{`ev-nova-hud-toggle-btn \$\{novaDailyTargetMode === "daily"/, "Doit supporter le bouton toggle de mode de focus");
  assert.match(src, /className=\{`ev-nova-target-chip \$\{isSpoken \? "is-spoken" : ""\}`\}/, "Doit afficher les puces cibles avec statut is-spoken réactif");
  assert.match(src, /getDailyOralTargets\(expressions/, "Doit appeler getDailyOralTargets pour extraire les fiches du jour");
});

test('Live Nova HUD : Styles Maître-Design dans english-views.css', () => {
  const css = readSrc('styles/english-views.css');
  assert.match(css, /\.ev-nova-daily-hud\b/, "Doit inclure les styles de .ev-nova-daily-hud");
  assert.match(css, /\.ev-nova-target-chip\.is-spoken\b/, "Doit inclure l'illumination émeraude .is-spoken");
  assert.match(css, /evCheckBounce/, "Doit inclure l'animation de coche GPU 60fps");
});
