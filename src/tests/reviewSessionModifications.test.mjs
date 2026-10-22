import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("reviewSessionModifications — useReviewSession synchronizes existingSession with active expressions", () => {
  const content = fs.readFileSync(path.resolve("src/hooks/useReviewSession.js"), "utf8");
  assert.equal(content.includes("expMap.has(c.id) && !expMap.get(c.id).paused"), true,
    "useReviewSession must drop deleted or paused cards when resuming a module session");
  assert.equal(content.includes("setModuleSessions"), true,
    "useReviewSession must export setModuleSessions");
});

test("reviewSessionModifications — deleteExp cleans dailyPlanState and moduleSessions", () => {
  const content = fs.readFileSync(path.resolve("src/hooks/useExpressionsManager.js"), "utf8");
  assert.equal(content.includes("setDailyPlanState"), true,
    "useExpressionsManager must receive and use setDailyPlanState");
  assert.equal(content.includes("setReviewQueue"), true,
    "useExpressionsManager must receive and use setReviewQueue");
  assert.equal(content.includes("mm_interrupted_module_sessions_v1"), true,
    "useExpressionsManager must clean interrupted module sessions in localStorage");
});

test("reviewSessionModifications — AddCardView invokes onCardUpdated to update the active review queue", () => {
  const content = fs.readFileSync(path.resolve("src/components/AddCardView.jsx"), "utf8");
  assert.equal(content.includes("onCardUpdated?.(updatedCard)"), true,
    "AddCardView must trigger onCardUpdated when editing a card");
});

test("reviewSessionModifications — MemoMaster binds onCardUpdated and registers module reviews in daily plan", () => {
  const content = fs.readFileSync(path.resolve("src/MemoMaster.jsx"), "utf8");
  assert.equal(content.includes("handleCardUpdated"), true,
    "MemoMaster must define handleCardUpdated");
  assert.equal(content.includes("onCardUpdated={handleCardUpdated}"), true,
    "MemoMaster must pass onCardUpdated to AddCardView");
  assert.equal(content.includes("if (reviewModeRef.current === \"free\") return;"), true,
    "consumeDailyPlanCard must consume cards reviewed in module mode");
});
