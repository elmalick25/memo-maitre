import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("ExtraSessionModal — component file exists and exports default React component", async () => {
  const filePath = path.resolve("src/components/ExtraSessionModal.jsx");
  assert.equal(fs.existsSync(filePath), true, "ExtraSessionModal.jsx must exist");

  const content = fs.readFileSync(filePath, "utf-8");
  assert.equal(content.includes("export default function ExtraSessionModal"), true);
  assert.equal(content.includes("pickExtraSessionCards"), true, "Must import and use pickExtraSessionCards");
  assert.equal(content.includes("onStartExtraSession"), true, "Must invoke onStartExtraSession callback");
  assert.equal(content.includes("isDarkMode"), true, "Must adapt to dark mode");
});
