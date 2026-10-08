import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('Writing Lab : Présence du message pédagogique de consolidation active', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.match(
    src,
    /Si vous avez appris des expressions, venez les pratiquer avec vos propres mots/i,
    "EnglishPractice doit inclure le message pédagogique épuré dans le Writing Lab"
  );
  assert.match(
    src,
    /className="ev-consolidation-banner"/,
    "Doit appliquer la classe CSS dédiée .ev-consolidation-banner"
  );
});

test('Writing Lab : La bannière est épurée sans les jetons de réutilisation encombrants', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.doesNotMatch(
    src,
    /ev-consolidation-chips-wrap/,
    "La section des jetons 'À réutiliser' doit être retirée pour garder uniquement le message épuré"
  );
});

test('Writing Lab : Présence des règles CSS aux couleurs de l\'application dans english-views.css', () => {
  const css = readSrc('styles/english-views.css');
  assert.match(css, /\.ev-consolidation-banner\b/, "Doit contenir le style de la bannière");
  assert.match(css, /var\(--mm-primary,\s*#b4552d\)/, "Doit utiliser la couleur primaire thématique de l'application");
  assert.match(css, /\.ev-report-toggle-btn\b/, "Doit contenir le style du bouton de rapport rétractable");
});

test('Writing Lab : Retrait du gros filigrane gênant (watermark)', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.doesNotMatch(
    src,
    /className="ev-writing-wc-watermark"/,
    "Le filigrane volumineux .ev-writing-wc-watermark doit être retiré du JSX"
  );
});

test('Writing Lab : Bouton Nouvelle Session et rapport pliable', () => {
  const src = readSrc('EnglishPractice.jsx');
  assert.match(
    src,
    /Nouvelle session/i,
    "EnglishPractice doit proposer un bouton 'Nouvelle session' pour réinitialiser la vue"
  );
  assert.match(
    src,
    /startNewWritingSession/,
    "Doit implémenter le gestionnaire startNewWritingSession"
  );
  assert.match(
    src,
    /ev-report-toggle-btn/,
    "Doit inclure le bouton interactif de pliage/dépliage du rapport IELTS"
  );
});

