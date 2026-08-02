// Vérifie que la COUCHE 9 (plan du jour persistant) est bien câblée dans l'UI :
// ces régressions étaient exactement la cause des compteurs incohérents.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const memo = readFileSync("src/MemoMaster.jsx", "utf8");
const graph = readFileSync("src/components/KnowledgeGraph.jsx", "utf8");

test("MemoMaster branche le plan du jour persistant", () => {
  assert.match(memo, /buildDailyPlan\(\{\s*plan: dailyPlanState/);
  assert.match(memo, /DAILY_PLAN_STORAGE_KEY/);
  assert.match(memo, /const dailySessionPreview = dailyPlanResult\.remaining;/);
});

test("chaque notation consomme une fiche du plan (le compteur descend)", () => {
  assert.match(memo, /consumeDailyPlanCard\(exp\.id\)/);
});

test("plus aucun repli sur la pile brute dans les compteurs", () => {
  assert.ok(!memo.includes("dailySessionPreview.length || todayReviews.length"),
    "le repli `|| todayReviews.length` réaffichait la pile entière une fois le plan terminé");
  assert.ok(!memo.includes("dailySessionPreview.length > 0 ? dailySessionPreview : todayReviews"),
    "même repli, version ternaire");
});

test("la session sert le plan au lieu de le recomposer", () => {
  assert.match(memo, /const planRemaining = catFilter/);
  assert.ok(!/composeDailySession\(queue, \{ todayISO: today\(\) \}\)/.test(memo),
    "la file ne doit plus être recomposée à chaque entrée en révision");
});

test("une fiche ratée est reproposée dans la session (réapprentissage)", () => {
  assert.match(memo, /q === 0 && !exp\._relearn/);
});

test("la constellation utilise le plan et n'a plus de dépendance manquante", () => {
  assert.match(graph, /isDueCard/);
  assert.match(graph, /\}, \[categories, expressions, sessionPool\]\)/);
  assert.ok(!graph.includes("(e.level || 0) >= 7"), "critère de maîtrise dupliqué");
});
