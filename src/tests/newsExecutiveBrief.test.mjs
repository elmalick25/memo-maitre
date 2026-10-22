import assert from "assert";
import { getArticleContextSnippet, parseBriefsResponse, pickUnbriefed } from "../lib/newsExecutiveBrief.js";

console.log("🧪 Test de newsExecutiveBrief.js...");

// 1. Test getArticleContextSnippet
const mockItem = {
  id: "item-1",
  title: "Devs block ads on smart TVs with Claude Code",
  titleFr: "Les devs bloquent la pub sur TV avec Claude Code",
  source: "Developpez",
  description: "L'IA devient puissante. On a cloné Adobe.",
  descriptionFr: "L'IA devient puissante. On a cloné Adobe.",
  bodyFr: "En utilisant des scripts générés par Claude Code, des bidouilleurs injectent des filtres DNS locaux.",
};

const snippet = getArticleContextSnippet(mockItem);
assert(snippet.includes("Les devs bloquent la pub"), "Doit contenir le titre français");
assert(snippet.includes("Claude Code"), "Doit contenir le corps");
console.log("✅ getArticleContextSnippet OK");

// 2. Test parseBriefsResponse avec aliasMap (pour les URLs longues de Developpez.com)
const itemTarget = {
  id: "https://www.developpez.com/actu/368541/Les-developpeurs-utilisent-Claude-Code-ou-DeepSeek-AI-pour-supprimer-les-publicites",
  url: "https://www.developpez.com/actu/368541/Les-developpeurs-utilisent-Claude-Code-ou-DeepSeek-AI-pour-supprimer-les-publicites",
  title: "Les développeurs utilisent Claude Code",
  titleFr: "Les développeurs utilisent Claude Code pour virer les pubs",
};
const aliasMap = new Map([["ART_1", itemTarget]]);

const mockAiResponse = JSON.stringify({
  briefs: {
    "ART_1": "Des développeurs exploitent Claude Code pour générer des filtres DNS automatisés bloquant les serveurs publicitaires des Smart TV. Cette méthode contourne les verrous constructeurs sans perturber le streaming.",
  }
});

const parsed = parseBriefsResponse(mockAiResponse, aliasMap);
assert(parsed["https://www.developpez.com/actu/368541/Les-developpeurs-utilisent-Claude-Code-ou-DeepSeek-AI-pour-supprimer-les-publicites"], "L'URL longue doit être résolue");
assert(parsed["Les développeurs utilisent Claude Code"], "Le titre doit être résolu");
assert(parsed["Les développeurs utilisent Claude Code pour virer les pubs"], "Le titre français doit être résolu");
assert.strictEqual(itemTarget.aiSummary, parsed[itemTarget.id], "L'item cible doit avoir aiSummary assigné");
assert(parsed["ART_1"] === undefined, "L'alias ne doit plus être la clé");
console.log("✅ parseBriefsResponse avec mapping d'alias OK");

// 2.bis Test parseBriefsResponse avec clé numérique "1" ou "Article 1"
const itemReddit = {
  id: "rd_gitlab_cve",
  url: "https://reddit.com/r/cybersecurity/gitlab_cve",
  title: "Critical GitLab Vulnerability CVSS 10.0",
  titleFr: "Vulnérabilité critique de GitLab (CVSS 10,0) permettant une exécution de code",
};
const redditAliasMap = new Map([["ART_1", itemReddit]]);
const parsedNumeric = parseBriefsResponse(JSON.stringify({
  briefs: {
    "1": "GitLab a publié un correctif d'urgence pour neutraliser une vulnérabilité d'exécution de code à distance sans authentification.",
  }
}), redditAliasMap);
assert(parsedNumeric["rd_gitlab_cve"], "La clé '1' doit être résolue vers l'ID Reddit");
assert(parsedNumeric["Vulnérabilité critique de GitLab (CVSS 10,0) permettant une exécution de code"], "Le titre français Reddit doit être indexé");
assert.strictEqual(itemReddit.aiSummary, parsedNumeric["rd_gitlab_cve"]);
console.log("✅ parseBriefsResponse avec clé numérique '1' OK");

// 3. Test pickUnbriefed
const items = [
  { id: "item-1", url: "https://example.com/1" },
  { id: "item-2", url: "https://example.com/2", titleFr: "Titre FR déjà briefé" },
  { id: "item-3", url: "https://example.com/3" },
];
const existing = {
  "item-1": "Synthèse déjà existante et assez longue pour être conservée.",
  "Titre FR déjà briefé": "Synthèse trouvée via le titre français de l'article.",
};
const unbriefed = pickUnbriefed(items, existing, 5);
assert.strictEqual(unbriefed.length, 1, "Doit retenir uniquement item-3 car item-1 et item-2 ont déjà une synthèse");
assert.strictEqual(unbriefed[0].id, "item-3");

// Test avec max = 0 (tous les articles sans limite)
const unbriefedAll = pickUnbriefed(items, existing, 0);
assert.strictEqual(unbriefedAll.length, 1, "Avec max=0, doit renvoyer tous les articles non briefés");
console.log("✅ pickUnbriefed OK (avec support max=0 et titleFr)");

console.log("🎉 Tous les tests unitaires de newsExecutiveBrief ont réussi !");
