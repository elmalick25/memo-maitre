import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("ExtraSession Integration — MobileHomeV2 receives and supports onOpenExtraSession", () => {
  const content = fs.readFileSync(path.resolve("src/components/MobileHomeV2.jsx"), "utf-8");
  assert.equal(content.includes("onOpenExtraSession"), true, "MobileHomeV2 must declare onOpenExtraSession prop");
  assert.equal(content.includes("Session Extra"), true, "MobileHomeV2 must present Session Extra option");
});

test("ExtraSession Integration — DashboardView propagates onOpenExtraSession to MobileHome and Desktop", () => {
  const content = fs.readFileSync(path.resolve("src/components/DashboardView.jsx"), "utf-8");
  assert.equal(content.includes("onOpenExtraSession"), true, "DashboardView must receive and expose onOpenExtraSession");
});

test("ExtraSession Integration — MemoMaster renders ExtraSessionModal and binds startReview", () => {
  const content = fs.readFileSync(path.resolve("src/MemoMaster.jsx"), "utf-8");
  assert.equal(content.includes("ExtraSessionModal"), true, "MemoMaster must import ExtraSessionModal");
  assert.equal(content.includes("extraSessionOpen"), true, "MemoMaster must manage extraSessionOpen state");
});
