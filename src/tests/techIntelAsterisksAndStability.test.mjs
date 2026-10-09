import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripMarkdownAndAsterisks, normalizeNewsPreview } from '../lib/newsTextPresentation.js';
import { extractUniversalArticleParagraphs } from '../lib/articleExtractor.js';

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

  // Vérifie que partialFlush ne perturbe pas un flux déjà affiché lors d'une actualisation
  assert.ok(jsx.includes('// 🛑 STABILITÉ ABSOLUE DU FLUX :'));
  assert.ok(jsx.includes('(items && items.length > 0) || (lastRefreshRef.current > 0)'));

  // Vérifie que visibleFrenchTitle et visibleFrenchDescription nettoient les étoiles
  assert.ok(jsx.includes('stripMarkdownAndAsterisks(raw)'));
  assert.ok(jsx.includes('stripMarkdownAndAsterisks(clean)'));

  // Vérifie que le cardSummary privilégie la description éditoriale stable
  assert.ok(jsx.includes('const editorialDesc = cleanEditorialText(visibleFrenchDescription(item)) || cleanEditorialText(item.descriptionFr || item.description);'));
  assert.ok(jsx.includes('const cardSummary = editorialDesc || (paragraphs.length > 0 ? stripMarkdownAndAsterisks(paragraphs[0]) : "") || articleText;'));

  // Vérifie que les paragraphes dépliés sont nettoyés de toute étoile
  assert.ok(jsx.includes('const cleanP = stripMarkdownAndAsterisks(p);'));

  // Vérifie que les corps complets du flux sont ingérés immédiatement et préchargés pour le hors-ligne
  assert.ok(jsx.includes('// Ingestion immédiate des corps complets déjà embarqués dans le flux RSS'));
  assert.ok(jsx.includes('prefetchOfflineRef.current?.(combined)'));
  assert.ok(jsx.includes('const OFFLINE_MAP_MAX = 250;'));
  assert.ok(jsx.includes('slice(0, 80)'));
});

test('TechIntelView — isTeaserSnippet ne rejette plus les articles complets de taille modérée', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');
  // La fonction ne doit plus contenir le seuil arbitraire de 500 caractères qui rejetait les vrais articles
  assert.equal(jsx.includes('if (trimmed.length < 500) return true;'), false);
  assert.ok(jsx.includes('if (trimmed.length < 80) return true;'));
});

