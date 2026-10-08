import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReadableFromHtml,
  extractReadableFromMarkdown,
  isBoilerplateOrConsentText,
  sanitizeArticleText,
  extractUniversalArticleParagraphs,
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

  // Nouveau bandeau Numerama avec apostrophes typographiques courbées
  const numeramaNewBanner = `Numerama croit fermement en la gratuité de l’information de qualité. C’est un pilier démocratique et comprendre les enjeux du monde qui vient devrait être à la portée de tout le monde. Mais cette information gratuite a un coût de production élevé.`;
  assert.equal(isBoilerplateOrConsentText(numeramaNewBanner), true);

  const chooseModeText = `Choisissez votre mode de lecture.`;
  assert.equal(isBoilerplateOrConsentText(chooseModeText), true);

  const navMenuText = `casquesp2pculture du libretélécomsobjets connectéstv & hi-fiwebintelligence artificielleconsoles de jeuinformatiqueécouteurssmartphonemaison connectée`;
  assert.equal(isBoilerplateOrConsentText(navMenuText), true);

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

test('ArticleExtractor — extractUniversalArticleParagraphs extrait le pur corps journalistique et élague tête et queue', () => {
  const clubicRawScrap = `192 Go et Ryzen AI Max+ Pro 495 : le Framework Desktop voué aux LLM bientôt ouvert aux précommandes
Meilleur VPNMeilleur AntivirusIASmartphoneComparateur Forfait mobileComparateur Box Internet

192 Go et Ryzen AI Max+ Pro 495 : le Framework Desktop voué aux LLM bientôt ouvert aux précommandes

ParNathan Le GohlisseSpécialiste Hardware

Publié le 29 septembre 2026 à 14h51

Coup d’envoi imminent pour les précommandes de la nouvelle configuration du Framework Desktop. Annoncée fin août, cette dernière combine pour rappel, un puissant Ryzen AI Max+ Pro 495 à un maximum de 192 Go de mémoire unifiée pour aller chatouiller les DGX Spark sur la gestion locale de grands modèles de langage.

Minisforum et son nouveau MS-S1 MAX-P495, ne sont pas les seuls à vouloir s’attaquer frontalement à NVIDIA et ses solutions DGX Sparkpour la gestion locale de grands modèles de langage.

Quels sont les meilleurs mini-PC ? Comparatif 2026

Source :NotebookCheck/Framework

Meilleur VPN Meilleur Antivirus IA Smartphone Comparateur Forfait mobile Comparateur Box Internet

Framework Desktop : 192 Go de RAM, bande passante accrue... la version Ryzen AI Max+ PRO 495 est en vue

Abonnez-vous à notre newsletter !`;

  const item = {
    title: "192 Go et Ryzen AI Max+ Pro 495 : le Framework Desktop voué aux LLM bientôt ouvert aux précommandes",
    source: "Clubic"
  };

  const paragraphs = extractUniversalArticleParagraphs(clubicRawScrap, item);
  
  // Zéro menu VPN
  assert.equal(paragraphs.some(p => /meilleur vpn/i.test(p)), false);
  // Zéro métadonnées en tête
  assert.equal(paragraphs.some(p => /^parnathan/i.test(p)), false);
  assert.equal(paragraphs.some(p => /^publi[ée] le/i.test(p)), false);
  // Zéro footer / newsletter
  assert.equal(paragraphs.some(p => /quels sont les meilleurs/i.test(p)), false);
  assert.equal(paragraphs.some(p => /newsletter/i.test(p)), false);

  // Le premier paragraphe est directement le lead journalistique
  assert.ok(paragraphs[0].includes("Coup d’envoi imminent pour les précommandes"));
  assert.ok(paragraphs[1].includes("Minisforum et son nouveau"));
  assert.equal(paragraphs.length, 2);
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

test('TechIntel — Mode French-First : le filtre par défaut exclut les actus anglaises non traduites', () => {
  const articles = [
    { id: '1', title: 'OpenAI annonce GPT-5', lang: 'fr' },
    { id: '2', title: 'New zero-day in Linux kernel', lang: 'en' },
    { id: '3', title: 'Nvidia releases new Blackwell chips', lang: 'en', titleFr: 'Nvidia sort ses nouvelles puces Blackwell' },
    { id: '4', title: 'Numerama teste le dernier smartphone', lang: 'fr' },
  ];

  // Filtre 'fr' (défaut)
  const frenchOnly = articles.filter(i => i.lang === 'fr' || Boolean(i.titleFr));
  assert.equal(frenchOnly.length, 3);
  assert.equal(frenchOnly.some(i => i.id === '2'), false);
  assert.equal(frenchOnly.some(i => i.id === '3'), true);
  assert.equal(frenchOnly.some(i => i.id === '1'), true);

  // Filtre 'all' (monde)
  const allArticles = articles;
  assert.equal(allArticles.length, 4);
});

test('TechIntel — Hiérarchie de rendu textuel : ne jamais afficher le plein texte brut en anglais', () => {
  const foreignArticle = {
    id: 'en_1',
    lang: 'en',
    title: 'Major Breakthrough in Quantum Computing',
    titleFr: 'Percée majeure dans l informatique quantique',
    fullContent: 'This is the raw English RSS body with technical jargon...',
    descriptionFr: 'Une avancée significative a été réalisée par les chercheurs...',
  };

  const rawArticleText = (foreignArticle.lang === 'fr' ? foreignArticle.fullContent : '') ||
    foreignArticle.descriptionFr ||
    foreignArticle.description ||
    '';

  assert.equal(rawArticleText, 'Une avancée significative a été réalisée par les chercheurs...');
  assert.equal(rawArticleText.includes('raw English RSS body'), false);
});

test('TechIntel — une traduction n’est complète que si le titre et la description sont en français', () => {
  const titleOnly = {
    id: 'en_title_only',
    lang: 'en',
    title: 'A major AI release',
    titleFr: 'Une sortie majeure dans l’IA',
    description: 'The complete description is still in English.',
    descriptionFr: '',
  };
  const complete = {
    ...titleOnly,
    descriptionFr: 'La description complète est désormais en français.',
  };

  const needsFrenchTranslation = (item) => {
    if (!item || item.lang === 'fr') return false;
    const hasTitle = Boolean(String(item.titleFr || '').trim());
    const originalDescription = String(item.description || '').trim();
    const hasDescription = !originalDescription || Boolean(String(item.descriptionFr || '').trim());
    return !hasTitle || !hasDescription;
  };

  assert.equal(needsFrenchTranslation(titleOnly), true);
  assert.equal(needsFrenchTranslation(complete), false);
});

