// src/tests/testAiRouterE2E.mjs
import fs from "fs";
import path from "path";

// Charger le .env dans process.env avant l'import
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
  const { aiCall } = await import("../lib/aiRouter.js");
  console.log("=== Test End-to-End aiRouter v2 (Modèles 100% Gratuits) ===");

  // 1. Test chat
  try {
    console.log("\n[1/3] Test Tâche 'chat'...");
    const res = await aiCall({
      task: "chat",
      messages: [{ role: "user", content: "Réponds 'OK' en un seul mot." }],
      maxTokens: 10,
      cache: false,
    });
    console.log("✅ Chat Response:", res.text?.trim(), `(Fournisseur: ${res.provider}, Modèle: ${res.model})`);
  } catch (err) {
    console.error("❌ Chat Error:", err.message);
  }

  // 2. Test reasoning (DeepSeek R1 via Cloudflare ou Nemotron)
  try {
    console.log("\n[2/3] Test Tâche 'reasoning' (DeepSeek-R1 gratuit)...");
    const res = await aiCall({
      task: "reasoning",
      messages: [{ role: "user", content: "2+2=? Réponds uniquement avec le chiffre." }],
      maxTokens: 50,
      cache: false,
    });
    console.log("✅ Reasoning Response:", res.text?.trim()?.slice(0, 100), `(Fournisseur: ${res.provider}, Modèle: ${res.model})`);
  } catch (err) {
    console.error("❌ Reasoning Error:", err.message);
  }

  // 3. Test fast-json
  try {
    console.log("\n[3/3] Test Tâche 'fast-json'...");
    const res = await aiCall({
      task: "fast-json",
      messages: [{ role: "user", content: "Génère un objet JSON: {\"status\": \"success\"}" }],
      maxTokens: 30,
      json: true,
      cache: false,
    });
    console.log("✅ Fast-JSON Response:", res.text?.trim(), `(Fournisseur: ${res.provider}, Modèle: ${res.model})`);
  } catch (err) {
    console.error("❌ Fast-JSON Error:", err.message);
  }

  console.log("\n=== Fin des Tests End-to-End ===");
}

run();
