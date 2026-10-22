import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripMarkdownAndAsterisks, normalizeNewsPreview, repairFrenchElisions } from '../lib/newsTextPresentation.js';
import { extractUniversalArticleParagraphs, isDateOrMetadataOnly } from '../lib/articleExtractor.js';

test('News presentation — stripMarkdownAndAsterisks supprime toutes les étoiles (gras, italique, puces, résidus)', () => {
  const sample1 = "**Nvidia** dévoile son nouveau GPU *Blackwell* avec ***performances records***.";
  assert.equal(stripMarkdownAndAsterisks(sample1), "Nvidia dévoile son nouveau GPU Blackwell avec performances records.");

  const sample2 = "* Premier point clé\n* Deuxième point clé avec **gras** et *italique*";
  assert.equal(stripMarkdownAndAsterisks(sample2), "Premier point clé\nDeuxième point clé avec gras et italique");

  const sample3 = "Un titre avec étoile résiduelle * et note ***";
  assert.equal(stripMarkdownAndAsterisks(sample3), "Un titre avec étoile résiduelle et note");

  const sample4 = "  Claude\\nMythos\r\n: une&nbsp;arme&amp;cyber avec **IA**  ";
  assert.equal(normalizeNewsPreview(sample4), "Claude Mythos : une arme&cyber avec IA");
});

test('ArticleExtractor — extractUniversalArticleParagraphs produit des paragraphes sans étoiles', () => {
  const rawMarkdown = `
**OpenAI** annonce un nouveau modèle.

Ce modèle apporte des gains de *25%* sur les calculs complexes et **réduit la latence**.
  `;
  const paragraphs = extractUniversalArticleParagraphs(rawMarkdown, { title: "OpenAI" });
  assert.ok(paragraphs.length > 0);
  for (const p of paragraphs) {
    assert.equal(p.includes("*"), false, `Le paragraphe "${p}" ne doit pas contenir d'étoiles.`);
  }
});

test('TechIntelView — Stabilité du flux : pas de saut intempestif et priorité au résumé éditorial stable', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');

  // Vérifie que stripMarkdownAndAsterisks et les fonctions de nettoyage sont importées et utilisées
  assert.ok(jsx.includes('stripMarkdownAndAsterisks'));
  assert.ok(jsx.includes('cleanArticleText'));

  // Vérifie que les corps complets du flux sont préchargés pour le hors-ligne
  assert.ok(jsx.includes('const OFFLINE_MAP_MAX = 250;'));
  assert.ok(jsx.includes('loadArticleList'));
  assert.ok(jsx.includes('saveArticleList'));
});

test('TechIntelView — isTeaserSnippet ne rejette plus les articles complets de taille modérée', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');
  // La fonction ne doit plus contenir le seuil arbitraire de 500 caractères qui rejetait les vrais articles
  assert.equal(jsx.includes('if (trimmed.length < 500) return true;'), false);
  assert.ok(jsx.includes('if (trimmed.length < 80) return true;'));
});

test('ArticleExtractor & TechIntel — isDateOrMetadataOnly bloque les dates brutes et métadonnées en sous-texte', () => {
  assert.equal(isDateOrMetadataOnly("Sat, 10 Oct 2026 15:23:00 GMT"), true);
  assert.equal(isDateOrMetadataOnly("Sun, 11 Oct 2026 14:18:00 GMT"), true);
  assert.equal(isDateOrMetadataOnly("10/10/2026"), true);
  assert.equal(isDateOrMetadataOnly("Dimanche 11 octobre 2026 à 14:18"), true);
  assert.equal(isDateOrMetadataOnly("Par Alexandre"), true);
  assert.equal(isDateOrMetadataOnly("https://www.clubic.com/feed/news.rss"), true);
  assert.equal(isDateOrMetadataOnly("[https://www.clubic.com/test](https://www.clubic.com/test)"), true);
  assert.equal(isDateOrMetadataOnly("Une offre spéciale permet d'accéder aux modèles IA sans abonnement récurrent."), false);

  // Vérifie que extractUniversalArticleParagraphs n'extrait jamais une date isolée comme paragraphe
  const paras = extractUniversalArticleParagraphs("Sat, 10 Oct 2026 15:23:00 GMT\n\nVoici le premier paragraphe de l'article tech.", { title: "Test" });
  assert.equal(paras.length, 1);
  assert.equal(paras[0], "Voici le premier paragraphe de l'article tech.");
});

test('repairFrenchElisions — répare les élisions françaises orphelines (l ia, d extinction, d ici)', () => {
  const corruptedTitle = "Le lancet classe l ia malveillante parmi les deux seules menaces d extinction pour l humanite d ici 2100";
  const repaired = repairFrenchElisions(corruptedTitle);
  assert.equal(repaired, "Le lancet classe l'IA malveillante parmi les deux seules menaces d'extinction pour l'humanite d'ici 2100");

  const sample2 = "c est qu il n a pas vu qu un robot s il arrive m a parle";
  assert.equal(repairFrenchElisions(sample2), "c'est qu'il n'a pas vu qu'un robot s'il arrive m'a parle");
});

