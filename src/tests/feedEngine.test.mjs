// 🧪 tests/feedEngine.test.mjs
// Tests automatisés du Moteur Universel d'Agrégation & Trust Registry
// Lancer avec : node --test src/tests/feedEngine.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSourceTrust,
  discoverFeedsFromHtml,
  resolveUrl,
  parseUnifiedFeed,
  TRUST_CATEGORIES,
} from '../lib/feedEngine.js';

test('FeedEngine — Trust Registry attribue les badges officiels et scores de confiance élevés', () => {
  // Test source Bourses Officielles
  const campusFranceTrust = evaluateSourceTrust('https://www.campusfrance.org/fr/bourses-excellence-eiffel', 'Campus France');
  assert.equal(campusFranceTrust.trustCategory, 'official_gov');
  assert.equal(campusFranceTrust.trustScore, 100);
  assert.equal(campusFranceTrust.isVerified, true);
  assert.equal(campusFranceTrust.badgeEmoji, '🏛️');

  // Test source DAAD Allemagne
  const daadTrust = evaluateSourceTrust('https://www.daad.de/en/study-and-research-in-germany/scholarships/', 'DAAD');
  assert.equal(daadTrust.trustCategory, 'official_gov');
  assert.equal(daadTrust.trustScore, 100);
  assert.equal(daadTrust.isVerified, true);

  // Test source Union Européenne Erasmus+
  const euTrust = evaluateSourceTrust('https://erasmus-plus.ec.europa.eu/news', 'Erasmus Mundus');
  assert.equal(euTrust.trustCategory, 'intl_org');
  assert.equal(euTrust.trustScore, 100);

  // Test presse de référence
  const leMondeTrust = evaluateSourceTrust('https://www.lemonde.fr/rss/une.xml', 'Le Monde');
  assert.equal(leMondeTrust.trustCategory, 'top_press');
  assert.equal(leMondeTrust.isVerified, true);

  // Test domaine inconnu / non listé
  const unknownTrust = evaluateSourceTrust('https://my-custom-blog-123.com/feed', 'Random Blog');
  assert.equal(unknownTrust.trustCategory, 'community');
  assert.equal(unknownTrust.isVerified, false);
});

test('FeedEngine — Auto-Discovery extrait les balises RSS et Atom depuis du HTML', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Portail Bourses d'Études Master</title>
        <link rel="alternate" type="application/rss+xml" title="Flux Bourses 2026-2027" href="/actualites/bourses.xml" />
        <link rel="alternate" type="application/atom+xml" title="Flux Atom Général" href="https://example.org/atom.xml" />
      </head>
      <body>
        <h1>Bienvenue</h1>
      </body>
    </html>
  `;

  const feeds = discoverFeedsFromHtml(html, 'https://example.org');
  assert.equal(feeds.length, 2);
  assert.equal(feeds[0].url, 'https://example.org/actualites/bourses.xml');
  assert.equal(feeds[0].title, 'Flux Bourses 2026-2027');
  assert.equal(feeds[0].type, 'rss');
  assert.equal(feeds[1].url, 'https://example.org/atom.xml');
  assert.equal(feeds[1].type, 'atom');
});

test('FeedEngine — resolveUrl résout correctement les chemins relatifs et absolus', () => {
  assert.equal(resolveUrl('/feed.xml', 'https://univ-paris.fr/master'), 'https://univ-paris.fr/feed.xml');
  assert.equal(resolveUrl('https://other.org/feed', 'https://univ-paris.fr'), 'https://other.org/feed');
  assert.equal(resolveUrl('rss', 'https://univ-paris.fr/news/'), 'https://univ-paris.fr/news/rss');
});

test('FeedEngine — Parseur unifié normalise un flux RSS standard avec métadonnées de bourses/actus', () => {
  const sampleRss = `
    <?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel>
        <title>Campus France - Bourses</title>
        <link>https://www.campusfrance.org</link>
        <item>
          <title><![CDATA[Appel à candidatures Bourses Eiffel Master 2026]]></title>
          <link>https://www.campusfrance.org/fr/programme-eiffel-master</link>
          <description><![CDATA[Le programme de bourses Eiffel permet aux meilleurs étudiants étrangers de financer leur Master en France.]]></description>
          <content:encoded><![CDATA[<p>Allocation mensuelle de 1 181 € + billets d'avion + couverture santé.</p>]]></content:encoded>
          <pubDate>Mon, 27 Aug 2026 12:00:00 GMT</pubDate>
          <category>Bourse</category>
          <category>Master</category>
        </item>
      </channel>
    </rss>
  `;

  const articles = parseUnifiedFeed(sampleRss, {
    feedUrl: 'https://www.campusfrance.org/fr/feed.xml',
    defaultSource: 'Campus France',
    defaultColor: '#1E3A8A',
    defaultEmoji: '🎓',
  });

  assert.equal(articles.length, 1);
  const item = articles[0];
  assert.equal(item.title, 'Appel à candidatures Bourses Eiffel Master 2026');
  assert.equal(item.link, 'https://www.campusfrance.org/fr/programme-eiffel-master');
  assert.ok(item.description.includes('programme de bourses Eiffel'));
  assert.ok(item.fullContent.includes('1 181 €'));
  assert.equal(item.source, 'Campus France');
  assert.equal(item.trust.trustCategory, 'official_gov');
  assert.equal(item.trust.isVerified, true);
});

test('FeedEngine — Parseur unifié supporte JSON Feed 1.1', () => {
  const jsonFeed = JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: "Opportunités Internationales",
    items: [
      {
        id: "grant_123",
        title: "Bourses DAAD Master All Disciplines",
        url: "https://www.daad.de/scholarship/123",
        summary: "Bourses complètes pour étudier en Allemagne en Master 2026/2027.",
        date_published: "2026-08-25T10:00:00Z"
      }
    ]
  });

  const articles = parseUnifiedFeed(jsonFeed, {
    feedUrl: 'https://www.daad.de/feed.json',
    defaultSource: 'DAAD',
  });

  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, 'Bourses DAAD Master All Disciplines');
  assert.equal(articles[0].link, 'https://www.daad.de/scholarship/123');
  assert.equal(articles[0].trust.isVerified, true);
});
