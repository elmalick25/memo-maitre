import test from 'node:test';
import assert from 'node:assert/strict';
import { isMajorEvent, matchWatchKeywords, MUST_NOT_MISS_FEEDS } from '../lib/mustNotMiss.js';
import { repairMojibake, repairDamagedWords } from '../lib/textRepair.js';
import { decodeAllHtmlEntities } from '../lib/newsTextPresentation.js';

test('Tesla Roadster est capté comme événement majeur', () => {
  assert.equal(isMajorEvent({ title: 'Elon Musk unveils the new Tesla Roadster' }), true);
});
test('Lancement de Gemini sur le web est capté', () => {
  assert.equal(isMajorEvent({ title: 'Google lance Gemini sur l’interface web' }), true);
});
test('Une actu sans mot-clé ni couverture n’est pas majeure', () => {
  assert.equal(isMajorEvent({ title: 'Recette de gâteau au chocolat' }), false);
});
test('Les mots-clés ne matchent pas à l’intérieur d’un autre mot', () => {
  assert.deepEqual(matchWatchKeywords({ title: 'Metadata cleanup' }), []);
});
test('Les sources incontournables incluent Google News et Electrek', () => {
  const names = MUST_NOT_MISS_FEEDS.map(f => f.name).join(' ');
  assert.match(names, /Google News/); assert.match(names, /Electrek/);
});
test('Accents mal décodés réparés', () => {
  assert.equal(repairMojibake('dÃ©jÃ  lÃ  â€™'), 'déjà là ’');
  assert.equal(repairMojibake('déjà là'), 'déjà là');
});
test('Mots abîmés réparés', () => {
  assert.equal(repairDamagedWords('une bo\uFFFDte à outils d\uFFFDdi\uFFFDe'), 'une boîte à outils dédiée');
});
test('Entités encodées deux fois décodées', () => {
  assert.equal(decodeAllHtmlEntities('Tom &amp;amp; Jerry &amp;#39;ok&amp;#39;'), "Tom & Jerry 'ok'");
});
