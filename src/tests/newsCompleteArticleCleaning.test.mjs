import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFrenchTypography, stripMarkdownAndAsterisks, isNewsSubheading } from '../lib/newsTextPresentation.js';
import { extractUniversalArticleParagraphs, isBoilerplateOrConsentText } from '../lib/articleExtractor.js';

test('cleanFrenchTypography — Supprime les espaces avant . , ) ] … et formate : ; ! ? « »', () => {
  const input = "L'intelligence artificielle avance toute seule . Ses données personnelles . Une super intelligence , disent-ils ! Qu'en pensez-vous ? C'est ( très ) prometteur : « formidable » .";
  const output = cleanFrenchTypography(input);

  assert.equal(output.includes("toute seule ."), false);
  assert.ok(output.includes("toute seule."));
  assert.equal(output.includes("personnelles ."), false);
  assert.ok(output.includes("personnelles."));
  assert.equal(output.includes("super intelligence ,"), false);
  assert.ok(output.includes("super intelligence,"));
  assert.ok(output.includes("(très)"));
  assert.ok(output.includes("« formidable »"));
  assert.ok(output.includes("prometteur :"));
});

test('isBoilerplateOrConsentText — Détecte et élimine les blocs newsletter et inscriptions', () => {
  const sample1 = "📩 L'actu digitale évolue vite ! Recevez notre newsletter quotidienne pour ne rien manquer.";
  const sample2 = "En vous inscrivant vous acceptez notre politique de protection des données personnelles.";
  const sample3 = "Restez à jour en vous abonnant à la newsletter.";
  const editorial = "Anthropic vient de publier une mise à jour majeure de son modèle Claude 3.5 Sonnet.";

  assert.equal(isBoilerplateOrConsentText(sample1), true);
  assert.equal(isBoilerplateOrConsentText(sample2), true);
  assert.equal(isBoilerplateOrConsentText(sample3), true);
  assert.equal(isBoilerplateOrConsentText(editorial), false);
});

test('extractUniversalArticleParagraphs — Élimine le bloc newsletter au milieu de l\'article et isole les intertitres', () => {
  const rawAnthropicArticle = `Anthropic, le créateur de Claude, vient d'annoncer une avancée majeure dans la sécurité des modèles d'intelligence artificielle.

Une loi pour bloquer les dérives

Les régulateurs américains et européens examinent actuellement des projets de lois stricts pour encadrer l'IA générative toute seule . Plusieurs personnalités politiques soutiennent cette initiative.

📩 L'actu digitale évolue vite… Recevez la newsletter chaque matin. En vous inscrivant vous acceptez notre politique de protection des données.

Donald Trump refuse les nouvelles restrictions

L'ancien président a critiqué ces démarches en estimant qu'elles allaient brider l'innovation américaine face à la Chine. Les entreprises de la Silicon Valley restent attentives à ces débats.`;

  const item = { title: "Anthropic, le créateur de Claude" };
  const paragraphs = extractUniversalArticleParagraphs(rawAnthropicArticle, item);

  // 1. Aucun bloc newsletter
  for (const p of paragraphs) {
    assert.equal(p.includes("📩"), false);
    assert.equal(/recevez la newsletter/i.test(p), false);
    assert.equal(/en vous inscrivant/i.test(p), false);
  }

  // 2. Pas d'espace orphelin avant la ponctuation
  const fullText = paragraphs.join("\n\n");
  assert.equal(fullText.includes("toute seule ."), false);
  assert.ok(fullText.includes("toute seule."));

  // 3. Les intertitres sont isolés en paragraphes autonomes
  const headings = paragraphs.filter((p, idx) => isNewsSubheading(p, idx));
  assert.ok(headings.length >= 2, "Au moins 2 intertitres doivent être reconnus");
  assert.ok(headings.some(h => h.includes("Une loi pour bloquer")));
  assert.ok(headings.some(h => h.includes("Donald Trump refuse")));
});
