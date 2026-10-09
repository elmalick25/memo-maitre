import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNewsPreview, isNewsSubheading } from '../lib/newsTextPresentation.js';

test('Actu — le résumé ne coupe pas une phrase sur les retours de la source', () => {
  assert.equal(normalizeNewsPreview('avec son\n\nconfrère le japonais Kenso Soai...'), 'avec son confrère le japonais Kenso Soai...');
  assert.equal(normalizeNewsPreview('servir à les\n\nexploiter. En ouvrant ainsi ses vannes,'), 'servir à les exploiter. En ouvrant ainsi ses vannes,');
});
test('Actu — normalise espaces et retours échappés sans modifier les mots', () => {
  assert.equal(normalizeNewsPreview('  Claude\\nMythos\r\n: une\u00a0arme\tcyber  '), 'Claude Mythos : une arme cyber');
  assert.equal(normalizeNewsPreview(null), '');
});
test('Actu — reconnaît le sous-titre long de la capture mais pas une phrase terminée', () => {
  assert.equal(isNewsSubheading('Claude Mythos : une arme cyber à double tranchant désormais confiée au grand public', 1), true);
  for (const text of ['Une phrase complète.', 'Est-ce une question ?', 'Un résultat !', 'Un extrait…']) {
    assert.equal(isNewsSubheading(text, 1), false);
  }
  assert.equal(isNewsSubheading('Un premier paragraphe', 0), false);
});

test('Actu — le sous-texte affiche 4 lignes maximum avec bouton Continuer', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync('src/styles/design-system.css', 'utf8');
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');

  // Doit contenir la classe de clamp à 4 lignes
  assert.ok(css.includes('-webkit-line-clamp: 4 !important'));
  assert.ok(css.includes('.tiv-article-summary-clamped'));

  // Le composant TechIntelView doit appliquer le clamp à 4 lignes et le bouton continuer
  assert.ok(jsx.includes('tiv-article-summary-clamped'));
  assert.ok(jsx.includes('WebkitLineClamp: 4'));
  assert.ok(jsx.includes('tiv-continuer-btn'));
});

