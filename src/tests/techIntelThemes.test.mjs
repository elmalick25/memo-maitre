import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_FILTERS, getArticleTheme } from '../lib/techIntelThemes.js';

test('THEME_FILTERS — Contient IA & LLM en tête de liste prioritaire après Tout', () => {
  assert.equal(THEME_FILTERS[0].id, 'all');
  assert.equal(THEME_FILTERS[1].id, 'ai');
  assert.equal(THEME_FILTERS[1].label.includes('IA'), true);
  assert.equal(THEME_FILTERS[2].id, 'cyber');
});

test('getArticleTheme — Catégorise correctement les articles d\'IA générative et LLM', () => {
  const articleClaude = {
    title: 'Anthropic dévoile Claude 3.7 Sonnet avec Hybrid Reasoning',
    description: 'Une avancée majeure pour les agents et le code autonome.',
  };
  assert.equal(getArticleTheme(articleClaude).id, 'ai');

  const articleDeepSeek = {
    title: 'DeepSeek-R1 révolutionne les coûts d\'inférence des modèles',
    description: 'Architecture open-weights et distillation.',
  };
  assert.equal(getArticleTheme(articleDeepSeek).id, 'ai');

  const articleOpenAI = {
    title: 'OpenAI annonce une nouvelle mise à jour de ChatGPT',
    description: 'Amélioration de la synthèse vocale et du prompt understanding.',
  };
  assert.equal(getArticleTheme(articleOpenAI).id, 'ai');
});

test('getArticleTheme — Catégorise correctement les failles et alertes Cyber', () => {
  const articleCVE = {
    title: 'Nouvelle vulnérabilité zero-day critique dans le noyau Linux (CVE-2026-1337)',
    description: 'Un exploit permet l\'élévation de privilèges à distance.',
  };
  assert.equal(getArticleTheme(articleCVE).id, 'cyber');

  const articleRansomware = {
    title: 'Attaque par ransomware visant les infrastructures de santé',
    description: 'Un malware chiffre les bases de données et demande une rançon.',
  };
  assert.equal(getArticleTheme(articleRansomware).id, 'cyber');
});

test('getArticleTheme — Catégorise le développement et frameworks', () => {
  const articleReact = {
    title: 'React 19 et React Compiler : guide de migration complet',
    description: 'Comment optimiser le re-rendering sans useMemo.',
  };
  assert.equal(getArticleTheme(articleReact).id, 'dev');
});

test('getArticleTheme — Catégorise le Cloud et l\'infrastructure', () => {
  const articleCloud = {
    title: 'Déployer un cluster Kubernetes sur AWS EKS avec Terraform',
    description: 'Gestion de l\'infrastructure as code et conteneurs Docker.',
  };
  assert.equal(getArticleTheme(articleCloud).id, 'cloud');
});
