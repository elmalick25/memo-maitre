// 🧪 tests/readerModeAndFeeds.test.mjs
// Tests automatisés de la lecture bionique, de l'OPML et du clustering sémantique
// Lancer avec : node --test src/tests/readerModeAndFeeds.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBionicReading,
  estimateReadingTime,
  generateOpml,
  parseOpml,
  clusterSimilarArticles,
} from '../lib/readerUtils.js';

test('ReaderUtils — applyBionicReading met en valeur les points de fixation initiaux', () => {
  const input = "Intelligence Artificielle et Modèles de Langage";
  const bionic = applyBionicReading(input);

  assert.ok(bionic.includes("<strong>Intell</strong>igence"));
  assert.ok(bionic.includes("<strong>Artifi</strong>cielle"));
  assert.ok(bionic.includes("<strong>Modè</strong>les"));
  assert.ok(bionic.includes("<strong>Lang</strong>age"));
});

test('ReaderUtils — estimateReadingTime calcule le temps en minutes', () => {
  const shortText = "Ceci est un court texte de test.";
  assert.equal(estimateReadingTime(shortText), 1);

  const longText = Array(450).fill("mot").join(" ");
  assert.equal(estimateReadingTime(longText), 3); // 450 / 200 = 2.25 -> 3 minutes
});

test('ReaderUtils — generateOpml et parseOpml effectuent un aller-retour complet sans perte', () => {
  const sampleFeeds = [
    { name: "Campus France Actualités", url: "https://www.campusfrance.org/fr/feed.xml", category: "Bourses" },
    { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "Tech" },
  ];

  const opmlString = generateOpml(sampleFeeds, "Mes Flux Favoris");
  assert.ok(opmlString.includes("<opml version=\"2.0\">"));
  assert.ok(opmlString.includes("xmlUrl=\"https://www.campusfrance.org/fr/feed.xml\""));

  const parsed = parseOpml(opmlString);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, "Campus France Actualités");
  assert.equal(parsed[0].url, "https://www.campusfrance.org/fr/feed.xml");
  assert.equal(parsed[0].category, "Bourses");
  assert.equal(parsed[1].name, "TechCrunch AI");
});

test('ReaderUtils — clusterSimilarArticles regroupe les dépêches traitant du même événement', () => {
  const articles = [
    { id: "art_1", title: "OpenAI annonce le lancement officiel de GPT-5" },
    { id: "art_2", title: "Lancement officiel de GPT-5 par OpenAI : ce qui change" },
    { id: "art_3", title: "Ouverture des bourses d'excellence Eiffel Master 2027" },
  ];

  const clusters = clusterSimilarArticles(articles);
  assert.equal(clusters.length, 2);
  // Le cluster 1 doit regrouper art_1 et art_2
  assert.equal(clusters[0].mainArticle.id, "art_1");
  assert.equal(clusters[0].relatedArticles.length, 1);
  assert.equal(clusters[0].relatedArticles[0].id, "art_2");

  // Le cluster 2 est isolé sur la bourse Eiffel
  assert.equal(clusters[1].mainArticle.id, "art_3");
  assert.equal(clusters[1].relatedArticles.length, 0);
});
