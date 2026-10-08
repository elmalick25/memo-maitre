// src/tests/checkModels.mjs
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
    env[key] = val;
  }
}

async function check() {
  console.log("--- 1. Groq Models ---");
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${env.VITE_GROQ_API_KEY}` }
    });
    const data = await res.json();
    console.log("Groq models:", data.data?.map(m => m.id).slice(0, 10));
  } catch (e) {
    console.log("Groq err:", e.message);
  }

  console.log("\n--- 2. Cerebras Models ---");
  try {
    const res = await fetch("https://api.cerebras.ai/v1/models", {
      headers: { "Authorization": `Bearer ${env.VITE_CEREBRAS_API_KEY}` }
    });
    const data = await res.json();
    console.log("Cerebras models:", data.data?.map(m => m.id));
  } catch (e) {
    console.log("Cerebras err:", e.message);
  }

  console.log("\n--- 3. Gemini Models ---");
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.VITE_GEMINI_API_KEY_1}`);
    const data = await res.json();
    const flashModels = data.models?.filter(m => m.name.includes("flash")).map(m => m.name);
    console.log("Gemini flash models:", flashModels);
  } catch (e) {
    console.log("Gemini err:", e.message);
  }

  console.log("\n--- 4. Fireworks Models ---");
  try {
    const res = await fetch("https://api.fireworks.ai/inference/v1/models", {
      headers: { "Authorization": `Bearer ${env.VITE_FIREWORKS_API_KEY}` }
    });
    const data = await res.json();
    console.log("Fireworks models:", data.data?.map(m => m.id).slice(0, 8));
  } catch (e) {
    console.log("Fireworks err:", e.message);
  }
}

check();
