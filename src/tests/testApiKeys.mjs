// src/tests/testApiKeys.mjs
// Test unitaire réel de chaque clé API présente dans .env
import fs from "fs";
import path from "path";

// Lecture manuelle du .env à la racine
const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error("Fichier .env introuvable à :", envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    val = val.replace(/^['"]|['"]$/g, "");
    env[key] = val;
  }
}

console.log("════════════════════════════════════════════════════════════════");
console.log("🧪 DIAGNOSTIC & TEST RÉSEAU DES CLÉS API (.env)");
console.log("════════════════════════════════════════════════════════════════\n");

const results = [];

async function testFetch(provider, name, url, options, validator) {
  const start = Date.now();
  try {
    const res = await fetch(url, options);
    const duration = Date.now() - start;
    let text = "";
    try { text = await res.text(); } catch {}
    let json = null;
    try { json = JSON.parse(text); } catch {}

    const verdict = validator(res.status, json, text);
    results.push({ provider, name, status: res.status, ok: verdict.ok, msg: verdict.msg, ms: duration });
    const icon = verdict.ok ? "✅" : (verdict.warn ? "⚠️ " : "❌");
    console.log(`${icon} [${provider}] ${name} (${duration}ms) : ${verdict.msg}`);
  } catch (err) {
    results.push({ provider, name, status: 0, ok: false, msg: err.message, ms: Date.now() - start });
    console.log(`❌ [${provider}] ${name} : Erreur réseau / fetch - ${err.message}`);
  }
}

async function run() {
  // ── 1. GEMINI ──
  const geminiModel = env.VITE_GEMINI_MODEL || "gemini-3.5-flash-lite";
  const geminiKeys = Object.keys(env).filter(k => k.startsWith("VITE_GEMINI_API_KEY"));
  for (const k of geminiKeys) {
    const key = env[k];
    if (!key) continue;
    await testFetch("Gemini", k, 
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
      },
      (status, json, text) => {
        if (status === 200 && json?.candidates?.length) return { ok: true, msg: `Modèle ${geminiModel} OK` };
        if (status === 429) return { ok: true, warn: true, msg: "Clé valide mais Quota 429 atteint" };
        return { ok: false, msg: `HTTP ${status}: ${json?.error?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 2. GROQ ──
  const groqKeys = ["VITE_GROQ_API_KEY", "VITE_GROQ_API_KEY_5", "VITE_GROQ_API_KEY_6", "VITE_GROQ_API_KEY_7"];
  const testedGroq = new Set();
  for (const k of groqKeys) {
    const key = env[k];
    if (!key || testedGroq.has(key)) continue;
    testedGroq.add(key);
    await testFetch("Groq", k,
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      },
      (status, json, text) => {
        if (status === 200) return { ok: true, msg: "Modèle openai/gpt-oss-120b OK" };
        if (status === 429) return { ok: true, warn: true, msg: "Clé valide mais Rate Limit 429" };
        return { ok: false, msg: `HTTP ${status}: ${json?.error?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 3. OPENROUTER ──
  const orKeys = Object.keys(env).filter(k => k.startsWith("VITE_OPENROUTER_API_KEY"));
  const testedOr = new Set();
  for (const k of orKeys) {
    const key = env[k];
    if (!key || testedOr.has(key)) continue;
    testedOr.add(key);
    await testFetch("OpenRouter", k,
      "https://openrouter.ai/api/v1/auth/key",
      {
        method: "GET",
        headers: { "Authorization": `Bearer ${key}` }
      },
      (status, json) => {
        if (status === 200 && json?.data) {
          const usage = json.data.usage != null ? json.data.usage : 0;
          return { ok: true, msg: `Clé valide (Label: ${json.data.label || "default"}, Usage: $${usage})` };
        }
        return { ok: false, msg: `HTTP ${status}: ${json?.error?.message || "Erreur auth"}` };
      }
    );
  }

  // ── 4. MISTRAL ──
  const mistralKeys = Object.keys(env).filter(k => k.startsWith("VITE_MISTRAL_API_KEY"));
  for (const k of mistralKeys) {
    const key = env[k];
    if (!key) continue;
    await testFetch("Mistral", k,
      "https://api.mistral.ai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "mistral-small-latest", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      },
      (status, json, text) => {
        if (status === 200) return { ok: true, msg: "Réponse OK" };
        if (status === 429) return { ok: true, warn: true, msg: "Clé valide mais 429" };
        return { ok: false, msg: `HTTP ${status}: ${json?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 5. CEREBRAS ──
  const cerebrasKeys = Object.keys(env).filter(k => k.startsWith("VITE_CEREBRAS_API_KEY"));
  const testedCerebras = new Set();
  for (const k of cerebrasKeys) {
    const key = env[k];
    if (!key || testedCerebras.has(key)) continue;
    testedCerebras.add(key);
    await testFetch("Cerebras", k,
      "https://api.cerebras.ai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-oss-120b", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      },
      (status, json, text) => {
        if (status === 200) return { ok: true, msg: "Modèle gpt-oss-120b OK" };
        if (status === 429) return { ok: true, warn: true, msg: "Clé valide mais 429" };
        return { ok: false, msg: `HTTP ${status}: ${json?.error?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 6. COHERE ──
  const cohereKeys = Object.keys(env).filter(k => k.startsWith("VITE_COHERE_API_KEY"));
  const testedCohere = new Set();
  for (const k of cohereKeys) {
    const key = env[k];
    if (!key || testedCohere.has(key)) continue;
    testedCohere.add(key);
    await testFetch("Cohere", k,
      "https://api.cohere.com/v2/chat",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "command-r-plus-08-2024", messages: [{ role: "user", content: "ping" }] })
      },
      (status, json, text) => {
        if (status === 200) return { ok: true, msg: "Réponse OK" };
        if (status === 429) return { ok: true, warn: true, msg: "Clé valide mais 429" };
        return { ok: false, msg: `HTTP ${status}: ${json?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 7. SAMBANOVA ──
  const sambanovaKeys = Object.keys(env).filter(k => k.startsWith("VITE_SAMBANOVA_API_KEY"));
  const testedSamba = new Set();
  for (const k of sambanovaKeys) {
    const key = env[k];
    if (!key || testedSamba.has(key)) continue;
    testedSamba.add(key);
    await testFetch("SambaNova", k,
      "https://api.sambanova.ai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "Meta-Llama-3.1-8B-Instruct", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      },
      (status, json, text) => {
        if (status === 200) return { ok: true, msg: "Réponse OK" };
        if (status === 429) return { ok: true, warn: true, msg: "Clé valide mais 429" };
        return { ok: false, msg: `HTTP ${status}: ${json?.error?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 8. FIREWORKS ──
  if (env.VITE_FIREWORKS_API_KEY) {
    await testFetch("Fireworks", "VITE_FIREWORKS_API_KEY",
      "https://api.fireworks.ai/inference/v1/chat/completions",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.VITE_FIREWORKS_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "accounts/fireworks/models/gpt-oss-120b", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      },
      (status, json, text) => {
        if (status === 200) return { ok: true, msg: "Modèle gpt-oss-120b OK" };
        if (status === 429) return { ok: true, warn: true, msg: "Clé valide mais 429" };
        return { ok: false, msg: `HTTP ${status}: ${json?.error?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 9. AIMLAPI ──
  const aimlKey = env.VITE_AIML_API_KEY || env.VITE_AIMLAPI_API_KEY;
  if (aimlKey) {
    await testFetch("AIMLAPI", "VITE_AIML_API_KEY",
      "https://api.aimlapi.com/v1/chat/completions",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${aimlKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      },
      (status, json, text) => {
        if (status === 200) return { ok: true, msg: "Réponse OK" };
        if (status === 429) return { ok: true, warn: true, msg: "Clé valide mais 429" };
        return { ok: false, msg: `HTTP ${status}: ${json?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 10. DEEPSEEK ──
  if (env.VITE_DEEPSEEK_API_KEY) {
    await testFetch("DeepSeek", "VITE_DEEPSEEK_API_KEY",
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.VITE_DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      },
      (status, json, text) => {
        if (status === 200) return { ok: true, msg: "Réponse OK" };
        if (status === 402) return { ok: true, warn: true, msg: "Clé valide mais solde épuisé (402 Payment Required)" };
        return { ok: false, msg: `HTTP ${status}: ${json?.error?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 11. ELEVENLABS ──
  const elKeys = Object.keys(env).filter(k => k.startsWith("VITE_ELEVENLABS_API_KEY"));
  const testedEl = new Set();
  for (const k of elKeys) {
    const key = env[k];
    if (!key || testedEl.has(key)) continue;
    testedEl.add(key);
    await testFetch("ElevenLabs", k,
      "https://api.elevenlabs.io/v1/user",
      {
        method: "GET",
        headers: { "xi-api-key": key }
      },
      (status, json, text) => {
        if (status === 200 && json?.subscription) {
          const sub = json.subscription;
          return { ok: true, msg: `Valide ! Tier: ${sub.tier}, Caractères: ${sub.character_count}/${sub.character_limit}` };
        }
        return { ok: false, msg: `HTTP ${status}: ${json?.detail?.message || text.slice(0, 100)}` };
      }
    );
  }

  // ── 12. HUGGING FACE ──
  if (env.VITE_HF_TOKEN) {
    await testFetch("HuggingFace", "VITE_HF_TOKEN",
      "https://huggingface.co/api/whoami-v2",
      {
        method: "GET",
        headers: { "Authorization": `Bearer ${env.VITE_HF_TOKEN}` }
      },
      (status, json) => {
        if (status === 200 && json?.name) return { ok: true, msg: `Token valide (User: ${json.name})` };
        return { ok: false, msg: `HTTP ${status}: Invalide` };
      }
    );
  }

  // ── 13. GITHUB ──
  if (env.VITE_GITHUB_TOKEN) {
    await testFetch("GitHub", "VITE_GITHUB_TOKEN",
      "https://api.github.com/rate_limit",
      {
        method: "GET",
        headers: { "Authorization": `token ${env.VITE_GITHUB_TOKEN}`, "User-Agent": "MemoMaster-App" }
      },
      (status, json) => {
        if (status === 200 && json?.rate) {
          return { ok: true, msg: `Token valide (Limite: ${json.rate.limit} req/h, Restant: ${json.rate.remaining})` };
        }
        return { ok: false, msg: `HTTP ${status}` };
      }
    );
  }

  // ── 14. YOUTUBE ──
  if (env.VITE_YOUTUBE_API_KEY) {
    await testFetch("YouTube", "VITE_YOUTUBE_API_KEY",
      `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${env.VITE_YOUTUBE_API_KEY}`,
      { method: "GET" },
      (status, json, text) => {
        if (status === 200 && json?.items) return { ok: true, msg: "Clé YouTube Data v3 valide" };
        return { ok: false, msg: `HTTP ${status}: ${json?.error?.message || text.slice(0, 100)}` };
      }
    );
  }

  // Résumé
  console.log("\n════════════════════════════════════════════════════════════════");
  const total = results.length;
  const okCount = results.filter(r => r.ok).length;
  console.log(`📊 BILAN GLOBAL : ${okCount} / ${total} clés testées avec succès.`);
  console.log("════════════════════════════════════════════════════════════════\n");
}

run();
