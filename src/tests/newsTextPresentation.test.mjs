import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNewsPreview,
  isNewsSubheading,
  splitIntoSentences,
  limitToMaxSentences,
  sanitizeNewsTitle,
  stripBreadcrumbsAndHeaderJunk,
} from '../lib/newsTextPresentation.js';

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

test('Actu — le sous-texte ne dépasse jamais 10 phrases avant ouverture de l analyse', () => {
  // Texte avec 15 phrases distinctes
  const sentences15 = Array.from({ length: 15 }, (_, i) => `Phrase numéro ${i + 1} de l'actualité tech.`).join(' ');
  const split = splitIntoSentences(sentences15);
  assert.equal(split.length, 15);

  const limited = limitToMaxSentences(sentences15, 10);
  const limitedSplit = splitIntoSentences(limited.replace(' […]', ''));
  assert.equal(limitedSplit.length, 10);
  assert.ok(limited.endsWith(' […]'));
  assert.ok(limited.includes("Phrase numéro 10"));
  assert.ok(!limited.includes("Phrase numéro 11"));

  // Texte avec 5 phrases : conservé intégralement sans troncature ni ellipse
  const sentences5 = Array.from({ length: 5 }, (_, i) => `Phrase courte ${i + 1}.`).join(' ');
  assert.equal(limitToMaxSentences(sentences5, 10), sentences5);
});

test('Actu — stripBreadcrumbsAndHeaderJunk ne détruit JAMAIS un vrai titre avec tiret', () => {
  assert.equal(
    stripBreadcrumbsAndHeaderJunk("HUB 404 - Le grand retour d'Hacking Social"),
    "HUB 404 - Le grand retour d'Hacking Social"
  );
  assert.equal(
    stripBreadcrumbsAndHeaderJunk("GitLab - Encore une faille CVSS 10 #FautPatcher"),
    "GitLab - Encore une faille CVSS 10 #FautPatcher"
  );
  assert.equal(
    stripBreadcrumbsAndHeaderJunk("Broadcom - Une faille Wi-Fi agée de 16 ans toujours sans CVE"),
    "Broadcom - Une faille Wi-Fi agée de 16 ans toujours sans CVE"
  );
});

test('Actu — stripBreadcrumbsAndHeaderJunk retire les vrais fils d Ariane à chevrons', () => {
  const textWithBreadcrumb = "Accueil > Actualités > Sécurité\n\nGitLab a corrigé une faille critique.";
  assert.equal(
    stripBreadcrumbsAndHeaderJunk(textWithBreadcrumb),
    "GitLab a corrigé une faille critique."
  );
});

test('Actu — sanitizeNewsTitle élimine les slugs pollués par des UTM et extensions .html', () => {
  // Cas exact de la capture : faux titre issu d'un slug et UTM
  const polluted1 = "Hacking social hub404.html ?utmsource=rss&utmmedium=feed&utm_campaign=flux principal";
  assert.equal(
    sanitizeNewsTitle(polluted1, "https://korben.info/hacking-social-hub404.html?utm_source=rss&utm_medium=feed&utm_campaign=flux-principal"),
    "Hacking social hub404"
  );

  const polluted2 = "Gitlab faille critique regex ci cd.html ?utmsource=rss&utmmedium=feed&utm_campaign=flux principal";
  assert.equal(
    sanitizeNewsTitle(polluted2, "https://korben.info/gitlab-faille-critique-regex-ci-cd.html?utm_source=rss&utm_medium=feed&utm_campaign=flux-principal"),
    "Gitlab faille critique regex ci cd"
  );

  // Vrai titre propre avec tiret : préservé fidèlement
  assert.equal(
    sanitizeNewsTitle("HUB 404 - Le grand retour d'Hacking Social"),
    "HUB 404 - Le grand retour d'Hacking Social"
  );
  assert.equal(
    sanitizeNewsTitle("GitLab - Encore une faille CVSS 10 #FautPatcher"),
    "GitLab - Encore une faille CVSS 10 #FautPatcher"
  );

  // Titre absent avec URL : extraction propre sans paramètre de tracking
  assert.equal(
    sanitizeNewsTitle("", "https://korben.info/hacking-social-hub404.html?utm_source=rss&utm_medium=feed&utm_campaign=flux-principal"),
    "Hacking social hub404"
  );
});


