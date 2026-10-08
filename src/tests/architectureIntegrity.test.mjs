import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── 1. VÉRIFICATION DES DELEGATIONS MODULAIRES DANS MEMOMASTER ──
test("Architecture Integrity — MemoMaster.jsx délègue à tous les composants extraits", () => {
  const memo = fs.readFileSync(path.resolve("src/MemoMaster.jsx"), "utf8");

  const requiredComponents = [
    "BadgesView",
    "CategoriesView",
    "AddCardView",
    "ReviewEngineView",
    "CardListView",
    "DashboardView",
    "StudyView",
    "AppStatusBar",
    "AppTopNav",
    "AppSidebar",
    "AppMobileNav",
    "AppOverlays",
  ];

  for (const comp of requiredComponents) {
    assert.ok(
      memo.includes(`import ${comp} from "./components/${comp}"`) ||
      memo.includes(`import ${comp} from "./components/${comp}.jsx"`) ||
      memo.includes(`import("./components/${comp}")`) ||
      memo.includes(`import("./components/${comp}.jsx")`),
      `MemoMaster.jsx doit importer ${comp} depuis src/components/`
    );
    assert.ok(
      memo.includes(`<${comp}`) || memo.includes(`<${comp} `),
      `MemoMaster.jsx doit instancier le composant <${comp} />`
    );
  }
});

// ── 2. VÉRIFICATION D'ABSENCE DE CODE DUPLIQUÉ OU DE FONCTIONS MORTES DANS MEMOMASTER ──
test("Anti-Duplication — MemoMaster.jsx ne contient plus de blocs inline hérités/dupliqués", () => {
  const memo = fs.readFileSync(path.resolve("src/MemoMaster.jsx"), "utf8");

  // Fonctions de l'ancien monolithe qui étaient dupliquées
  const forbiddenDeadFunctions = [
    "startMatchingMode",
    "handleMatchingClick",
    "generateCardsGraph",
    "generateClusters",
    "generateSemanticTags",
    "godHandGenerateStory",
    "godHandCreateMCQ",
    "godHandMerge",
    "generateLabQuiz",
    "generateVideoScript",
    "generatePodcast",
    "generateEditableMindMap",
    "generateTechDiagram",
    "generateWordCloud",
    "explainLike5",
    "generatePracticeProblems",
    "generateRevisionPlan",
    "generateSelfTest",
  ];

  for (const fn of forbiddenDeadFunctions) {
    assert.ok(
      !memo.includes(`const ${fn} =`) && !memo.includes(`function ${fn}(`),
      `MemoMaster.jsx ne doit plus définir la fonction orpheline/dupliquée '${fn}'`
    );
  }

  // La taille de MemoMaster doit rester sous un seuil strict (< 4 000 lignes)
  const lineCount = memo.split("\n").length;
  assert.ok(
    lineCount < 4000,
    `MemoMaster.jsx compte ${lineCount} lignes, il doit rester sous la barre des 4000 lignes.`
  );
});

// ── 3. VÉRIFICATION D'INTÉGRITÉ DES COMPOSANTS ET EXPORTS ──
test("Components Integrity — Tous les composants extraits exportent par défaut une fonction React", async () => {
  const componentsToTest = [
    "BadgesView.jsx",
    "CategoriesView.jsx",
    "AddCardView.jsx",
    "ReviewEngineView.jsx",
    "CardListView.jsx",
    "DashboardView.jsx",
    "StudyView.jsx",
    "AppStatusBar.jsx",
    "AppTopNav.jsx",
    "AppSidebar.jsx",
    "AppMobileNav.jsx",
    "AppOverlays.jsx",
  ];

  for (const compFile of componentsToTest) {
    const filePath = path.resolve(`src/components/${compFile}`);
    assert.ok(fs.existsSync(filePath), `Le composant ${compFile} doit exister dans src/components/`);
    const content = fs.readFileSync(filePath, "utf8");
    assert.ok(
      content.includes("export default function") || content.includes("export default"),
      `${compFile} doit avoir un export par défaut`
    );
  }
});

// ── 4. VÉRIFICATION D'INTÉGRITÉ DES CUSTOM HOOKS ──
test("Hooks Integrity — Tous les custom hooks métier sont correctement exportés et modulaires", async () => {
  const hooks = [
    "useReviewSession.js",
    "useExpressionsManager.js",
    "useShortcutsAndSync.js",
    "useFocusRadio.js",
  ];

  for (const hookFile of hooks) {
    const filePath = path.resolve(`src/hooks/${hookFile}`);
    assert.ok(fs.existsSync(filePath), `Le hook ${hookFile} doit exister dans src/hooks/`);
    const content = fs.readFileSync(filePath, "utf8");
    assert.ok(
      content.includes("export default function") || content.includes("export default"),
      `${hookFile} doit exporter par défaut sa fonction hook`
    );
  }
});

// ── 5. VÉRIFICATION DES CONTRACTS LIB & EXPORTS ESSENTIELS ──
test("Libraries Integrity — Les modules dans src/lib/ exposent leurs contrats attendus", async () => {
  const { fsrs, isDue, getPreviewInterval, cognitiveTag } = await import("../lib/fsrs.js");
  assert.equal(typeof fsrs, "function", "fsrs doit être une fonction");
  assert.equal(typeof isDue, "function", "isDue doit être une fonction");
  assert.equal(typeof getPreviewInterval, "function", "getPreviewInterval doit être une fonction");
  assert.equal(typeof cognitiveTag, "function", "cognitiveTag doit être une fonction");

  const { safeParseJSON } = await import("../lib/jsonRepair.js");
  assert.equal(typeof safeParseJSON, "function", "safeParseJSON doit être une fonction");

  const { antiInterferenceReorder, composeDailySession } = await import("../lib/memoryLab.js");
  assert.equal(typeof antiInterferenceReorder, "function", "antiInterferenceReorder doit être une fonction");
  assert.equal(typeof composeDailySession, "function", "composeDailySession doit être une fonction");
});
