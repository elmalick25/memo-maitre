import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('TechIntel — Fraîcheur stricte 24h : NEWS_MAX_AGE_MS fixé à 24 heures exactement', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');

  // Doit être 24h (24 * 60 * 60 * 1000 = 86400000ms) et non 72h
  assert.ok(jsx.includes('const NEWS_MAX_AGE_MS = 24 * 60 * 60 * 1000;'));
  assert.ok(!jsx.includes('const NEWS_MAX_AGE_MS = 72 * 60 * 60 * 1000;'));
});

test('TechIntel — Note de pertinence visible sur chaque fiche', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');

  // ScoreChip doit être monté sur chaque carte d'actualité
  assert.ok(jsx.includes('<ScoreChip score={coverageScore(item.score ?? 5, sourceCount)} sources={sourceCount} />'));
  // ScoreChip doit afficher la note /10 et la jauge
  assert.ok(jsx.includes('className="tiv-score-chip"'));
  assert.ok(jsx.includes('<span>{normalized}/10</span>'));
});

test('TechIntel — Tri « Pertinence » : note combinée, la meilleure note en premier', async () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');
  assert.ok(jsx.includes('sortNews(res, { mode: tab === "top" ? "relevance" : sortMode, ...rankOpts })'));
  const { sortNews } = await import('../lib/newsRanking.js');
  const now = 1_800_000_000_000;
  const articles = [
    { id: '1', score: 4, ts: now },
    { id: '2', score: 9, ts: now },
    { id: '3', score: 10, ts: now },
    { id: '4', score: 0, ts: now },
  ];
  assert.deepEqual(sortNews(articles, { now }).map(a => a.id), ['3', '2', '1', '4']);
});

test('TechIntel — Sous-texte garanti complet dès le départ sans coupure ni clamp', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');

  // Vérifie la présence du résumé complet et du fallback synthétique enrichi
  assert.ok(jsx.includes('tiv-article-summary-complete'));
  assert.ok(!jsx.includes('Dépêche stratégique issue de'));
  assert.ok(!jsx.includes('Pas de résumé fourni par la source — cliquez sur « Extraire l\'article »'));
});

test('TechIntel — Pénalité anti-spam commercial et valorisation des sources tech d\'élite', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');

  // Mots-clés commerciaux pénalisés
  assert.ok(jsx.includes('"bon plan": -8'));
  assert.ok(jsx.includes('"aspirateur": -8'));
  assert.ok(jsx.includes('"code promo": -8'));

  // Bonus sources tech d'élite
  assert.ok(jsx.includes('ELITE_TECH_SOURCES'));
  assert.ok(jsx.includes('"OpenAI Blog"'));
  assert.ok(jsx.includes('"DeepMind"'));
  assert.ok(jsx.includes('"Hacker News"'));
});
