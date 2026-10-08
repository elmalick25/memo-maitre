// src/tests/investigateFree.mjs
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
const env = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx > 0) {
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    env[k] = v;
  }
}

async function check() {
  // 1. OpenRouter free models
  console.log("--- 1. OpenRouter Free Models ---");
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    const d = await res.json();
    const freeModels = d.data?.filter(m => m.id.endsWith(":free") || (m.pricing && m.pricing.prompt === "0" && m.pricing.completion === "0")).map(m => m.id);
    console.log("OpenRouter free models count:", freeModels?.length);
    console.log("OpenRouter free models (top 15):", freeModels?.slice(0, 15));
  } catch(e) {
    console.log("OR error:", e.message);
  }

  // 2. Cloudflare AI models
  console.log("\n--- 2. Cloudflare AI Models ---");
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.VITE_CLOUDFLARE_ACCOUNT_ID}/ai/models/search?task=Text%20Generation`, {
      headers: { "Authorization": `Bearer ${env.VITE_CLOUDFLARE_API_TOKEN}` }
    });
    const d = await res.json();
    console.log("Cloudflare models:", d.result?.map(m => m.name).slice(0, 10));
  } catch(e) {
    console.log("CF error:", e.message);
  }

  // 3. GitHub Detailed Error
  console.log("\n--- 3. GitHub Error Inspection ---");
  try {
    const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.VITE_GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5
      })
    });
    console.log("GitHub res:", res.status);
    console.log("GitHub body:", await res.text());
  } catch(e) {
    console.log("GitHub cause:", e.cause || e);
  }

  // 4. HuggingFace Detailed Error
  console.log("\n--- 4. HuggingFace Error Inspection ---");
  try {
    const res = await fetch("https://router.huggingface.co/hf-inference/models/meta-llama/Llama-3.2-3B-Instruct/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.VITE_HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/Llama-3.2-3B-Instruct",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5
      })
    });
    console.log("HF res:", res.status);
    console.log("HF body:", await res.text());
  } catch(e) {
    console.log("HF cause:", e.cause || e);
  }
}

check();
