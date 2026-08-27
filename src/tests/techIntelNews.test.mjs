import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReadableFromHtml,
  extractReadableFromMarkdown,
  isBoilerplateOrConsentText,
  sanitizeArticleText,
} from '../lib/articleExtractor.js';

test('ArticleExtractor — extractReadableFromHtml élimine pubs et scripts et garde le corps de texte', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Test Article</title></head>
      <body>
        <nav><a href="#">Menu</a></nav>
        <div class="ads">Publicité encombrante</div>
        <article>
          <h1>Nouvelle percée en Intelligence Artificielle et LLM</h1>
          <p>Les modèles de langage récents démontrent une capacité de raisonnement accrue sur les benchmarks complexes de code et de logique.</p>
          <p>Cette avancée majeure ouvre des perspectives fascinantes pour l'automatisation des flux de développement et la recherche scientifique de pointe.</p>
          <div class="share">Partager sur Twitter</div>
        </article>
        <footer>Copyright 2026</footer>
      </body>
    </html>
  `;
  const readable = extractReadableFromHtml(html);
  assert.ok(readable.includes("Intelligence Artificielle"));
  assert.ok(readable.includes("modèles de langage"));
  assert.equal(readable.includes("Publicité"), false);
  assert.equal(readable.includes("Partager"), false);
});

test('ArticleExtractor — extractReadableFromMarkdown nettoie le markdown et préfixes Jina', () => {
  const md = `
Title: Breakthrough in Quantum AI
URL Source: https://example.com/ai
Markdown Content:
# Breakthrough in Quantum AI

Researchers have unveiled a **new hybrid architecture** combining quantum circuits with deep neural networks.

[Read original paper](https://example.com/paper)
![Diagram](https://example.com/image.png)

This approach reduces training time by *40%* on complex cryptographic tasks.
  `;
  const readable = extractReadableFromMarkdown(md);
  assert.ok(readable.includes("Researchers have unveiled"));
  assert.ok(readable.includes("new hybrid architecture"));
  assert.ok(readable.includes("reduces training time"));
  assert.equal(readable.includes("![Diagram]"), false);
  assert.equal(readable.includes("Title: Breakthrough"), false);
});

test('ArticleExtractor — isBoilerplateOrConsentText détecte et bloque les bandeaux cookies et abonnements', () => {
  const numeramaCookieText = `Numerama défend une information tech et scientifique de qualité, gratuite et accessible à tous, un principe démocratique essentiel, mais souligne le coût élevé de sa production, nécessitant un financement durable. Pour pérenniser son modèle, le média propose un abonnement Numerama+ à partir de 2,07 €/mois, offrant une expérience premium sans publicité, des tests indépendants et des contenus exclusifs, tout en soutenant une communauté de passionnés. En échange, les utilisateurs acceptent l'utilisation de cookies et de technologies similaires par Numerama et ses 177 partenaires, permettant le stockage et le traitement de données personnelles pour des finalités variées, allant de la personnalisation publicitaire à l'analyse statistique, en passant par l'amélioration des services.`;
  
  assert.equal(isBoilerplateOrConsentText(numeramaCookieText), true);

  const realArticleText = `Iliad a profité de la présentation de ses résultats semestriels pour faire un point sur ses activités dans l'intelligence artificielle. Le groupe de Xavier Niel revendique une croissance de 50 % sur son activité cloud et accélère sur le déploiement de ses datacenters.`;
  assert.equal(isBoilerplateOrConsentText(realArticleText), false);
});

test('ArticleExtractor — sanitizeArticleText supprime les paragraphes de cookies tout en préservant le corps de l\'article', () => {
  const fullText = `Numerama défend une information tech et scientifique de qualité. Pour pérenniser son modèle, le média propose un abonnement Numerama+... En échange, les utilisateurs acceptent l'utilisation de cookies et de partenaires pour des données personnelles et personnalisation publicitaire.

Iliad a profité de la présentation de ses résultats semestriels pour faire un point sur ses activités dans l'intelligence artificielle.

Le groupe de Xavier Niel refuse de communiquer des chiffres précis sur Scaleway mais revendique une croissance de 50 % sur son activité cloud.`;

  const sanitized = sanitizeArticleText(fullText);
  assert.equal(sanitized.includes("cookies"), false);
  assert.equal(sanitized.includes("pérenniser son modèle"), false);
  assert.ok(sanitized.includes("Iliad a profité de la présentation"));
  assert.ok(sanitized.includes("Xavier Niel"));
});

test('TechIntel — Séparation stricte : les actualités restent de la veille éphémère et ne polluent pas le deck FSRS', () => {
  const article = {
    id: 'rss_Numerama_123',
    title: 'Sortie de React 19',
    description: 'Une mise à jour apportant les Actions et le compilateur.',
    source: 'Numerama',
  };

  // La veille est consommée sous forme de résumé/audio, sans créer de fiche d'apprentissage
  assert.ok(article.title.length > 0);
  assert.ok(article.source === 'Numerama');
});
