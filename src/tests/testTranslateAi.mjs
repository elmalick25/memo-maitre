// src/tests/testTranslateAi.mjs
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx > 0) {
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[k] = v;
  }
}

async function testTranslate() {
  const { aiCall } = await import("../lib/aiRouter.js");
  const start = Date.now();
  const text = "You want to try Qwen-Image 2.1 on your own PC, with your prompts and reference images processed locally. You also want a normal image interface once the model files are in place.";
  const res = await aiCall({
    task: "fast",
    system: "Tu es un traducteur technique anglais vers français. Traduis fidèlement le texte en français, sans aucun commentaire ni introduction.",
    user: text,
    maxTokens: 200,
    cache: false
  });
  console.log(`✅ Fournisseur: ${res.provider}, Modèle: ${res.model}`);
  console.log("Raw response:", JSON.stringify(res.raw, null, 2));
}

testTranslate();
