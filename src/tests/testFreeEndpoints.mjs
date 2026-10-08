// src/tests/testFreeEndpoints.mjs
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

async function t() {
  console.log("=== Test des Endpoints Gratuits Réels ===");

  // 1. Cloudflare Workers AI - DeepSeek R1
  try {
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.VITE_CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`;
    const cfRes = await fetch(cfUrl, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.VITE_CLOUDFLARE_API_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10
      })
    });
    const d = await cfRes.json();
    console.log("1. Cloudflare R1:", cfRes.status, d.choices ? "✅ 200 OK: " + d.choices[0]?.message?.content : d);
  } catch(e) {
    console.log("1. Cloudflare error:", e.message);
  }

  // 2. Cloudflare Workers AI - Llama 3.1 8B FP8
  try {
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.VITE_CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`;
    const cfRes = await fetch(cfUrl, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.VITE_CLOUDFLARE_API_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "@cf/meta/llama-3.1-8b-instruct-fp8",
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10
      })
    });
    const d = await cfRes.json();
    console.log("2. Cloudflare Llama:", cfRes.status, d.choices ? "✅ 200 OK: " + d.choices[0]?.message?.content : d);
  } catch(e) {
    console.log("2. Cloudflare Llama error:", e.message);
  }

  // 2b. Cloudflare Workers AI - GPT-OSS 120B
  try {
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.VITE_CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`;
    const cfRes = await fetch(cfUrl, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.VITE_CLOUDFLARE_API_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10
      })
    });
    const d = await cfRes.json();
    console.log("2b. Cloudflare gpt-oss-120b:", cfRes.status, d.choices ? "✅ 200 OK: " + d.choices[0]?.message?.content : d);
  } catch(e) {
    console.log("2b. Cloudflare gpt-oss-120b error:", e.message);
  }

  // 3. OpenRouter Free - Qwen 3.8 27B
  try {
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.VITE_OPENROUTER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b:free",
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10
      })
    });
    const d = await orRes.json();
    console.log("3. OpenRouter Qwen Free:", orRes.status, d.choices ? "✅ 200 OK: " + d.choices[0]?.message?.content : d);
  } catch(e) {
    console.log("3. OpenRouter error:", e.message);
  }

  // 4. OpenRouter Free - Nemotron Reasoning
  try {
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.VITE_OPENROUTER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10
      })
    });
    const d = await orRes.json();
    console.log("4. OpenRouter Reasoning Free:", orRes.status, d.choices ? "✅ 200 OK: " + d.choices[0]?.message?.content : d);
  } catch(e) {
    console.log("4. OpenRouter Reasoning error:", e.message);
  }

  // 5. Pollinations.AI (100% gratuit sans clé)
  try {
    const pRes = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai",
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10
      })
    });
    const d = await pRes.json();
    console.log("5. Pollinations AI:", pRes.status, d.choices ? "✅ 200 OK: " + d.choices[0]?.message?.content : d);
  } catch(e) {
    console.log("5. Pollinations error:", e.message);
  }
}

t();
