// Vérifie que la COUCHE 9 (plan du jour persistant) est bien câblée dans l'UI :
// ces régressions étaient exactement la cause des compteurs incohérents.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const memo = readFileSync(new URL("../MemoMaster.jsx", import.meta.url), "utf8");
const graph = readFileSync(new URL("../components/KnowledgeGraph.jsx", import.meta.url), "utf8");
const reviewHook = readFileSync(new URL("../hooks/useReviewSession.js", import.meta.url), "utf8");
test("MemoMaster branche le plan du jour persistant", () => {
  assert.match(memo, /buildDailyPlan\(\{\s*plan: dailyPlanState/);
  assert.match(memo, /DAILY_PLAN_STORAGE_KEY/);
  assert.match(memo, /const dailySessionPreview = dailyPlanResult\.remaining;/);
});

test("chaque notation réussie consomme une fiche du plan", () => {
  assert.match(memo, /consumeDailyPlanCard\(exp\.id\)/);
});

test("plus aucun repli sur la pile brute dans les compteurs", () => {
  assert.ok(!memo.includes("dailySessionPreview.length || todayReviews.length"),
    "le repli `|| todayReviews.length` réaffichait la pile entière une fois le plan terminé");
  assert.ok(!memo.includes("dailySessionPreview.length > 0 ? dailySessionPreview : todayReviews"),
    "même repli, version ternaire");
});

test("la session sert le plan au lieu de le recomposer", () => {
  const combined = memo + "\n" + reviewHook;
  assert.match(combined, /const planRemaining = catFilter/);
  assert.ok(!/composeDailySession\(queue, \{ todayISO: today\(\) \}\)/.test(combined),
    "la file ne doit plus être recomposée à chaque entrée en révision");
});

test("une fiche réussie consomme le plan, une fiche oubliée reste due pour après la session", () => {
  assert.match(memo, /if \(q > 0\) \{\s*consumeDailyPlanCard\(exp\.id\);/);
});

test("la constellation utilise le plan et n'a plus de dépendance manquante", () => {
  assert.match(graph, /isDueCard/);
  assert.match(graph, /\}, \[categories, expressions, sessionPool\]\)/);
  assert.ok(!graph.includes("(e.level || 0) >= 7"), "critère de maîtrise dupliqué");
});
