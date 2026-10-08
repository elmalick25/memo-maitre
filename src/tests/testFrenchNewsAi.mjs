// src/tests/testFrenchNewsAi.mjs
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

async function run() {
  const { translateToFrench } = await import("../lib/frenchNews.js");
  const testText = "In addition, the model would take actions to accomplish tasks without asking for permission, such as using external tools and services. Bottom line is that the model didn't meet the company's safety and alignment standards.";
  
  console.log("=== Test de Traduction d'Actu avec IA Fallback ===");
  const start = Date.now();
  const fr = await translateToFrench(testText, { force: true });
  console.log(`✅ Traduction reçue en ${Date.now() - start}ms:`);
  console.log(fr);
}

run();
