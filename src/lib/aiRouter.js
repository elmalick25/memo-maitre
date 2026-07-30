// ════════════════════════════════════════════════════════════════════════════
// 🧠 AI ROUTER v2 — Multi-provider routing optimisé par tâche
// ════════════════════════════════════════════════════════════════════════════
// Providers : cerebras · groq · mistral · openrouter · fireworks · cohere
//
// Tasks (plan d'attribution définitif) :
//   chat / coach          → cerebras gpt-oss-120b    (fallback groq, or)
//   fast-json             → groq llama-3.1-8b-instant (fallback mistral-small)
//   batch-json            → cerebras gpt-oss-120b    (fallback groq 70b, mistral)
//   vision                → openrouter llama-4-scout (Gemini est appelé directement)
//   creative              → mistral-large (temp 1.1)
//   semantic-grade        → mistral-small (fallback cerebras gpt-oss-120b)
//   lexical               → cohere command-r-plus    (via lib/cohere.js)
//   fast-summary          → groq 8b (fallback mistral-small)
//   pedagogy              → mistral-large
//   strict-json           → fireworks llama-v3p3-70b (json_schema)
//   reasoning             → openrouter deepseek-r1   (fallback sambanova)
//   code                  → openrouter qwen-coder-32b (fallback mistral codestral)
//
// Backward-compat tasks (anciens call-sites) : fast, json restent fonctionnels.
// ════════════════════════════════════════════════════════════════════════════

const env = (k) => (typeof import.meta !== "undefined" ? import.meta.env?.[k] : "") || "";

const KEYS = {
  cerebras:  [env("VITE_CEREBRAS_API_KEY"), env("VITE_CEREBRAS_API_KEY_1"), env("VITE_CEREBRAS_API_KEY_2"), env("VITE_CEREBRAS_API_KEY_3"), env("VITE_CEREBRAS_API_KEY_4"), env("VITE_CEREBRAS_API_KEY_5"), env("VITE_CEREBRAS_API_KEY_6"), env("VITE_CEREBRAS_API_KEY_7")],
  groq:      [env("VITE_GROQ_API_KEY_5"), env("VITE_GROQ_API_KEY_6"), env("VITE_GROQ_API_KEY_7"), env("VITE_GROQ_API_KEY"), env("VITE_GROQ_API_KEY_2")],
  mistral:   [env("VITE_MISTRAL_API_KEY_1"), env("VITE_MISTRAL_API_KEY_2"), env("VITE_MISTRAL_API_KEY_3"), env("VITE_MISTRAL_API_KEY_4"), env("VITE_MISTRAL_API_KEY_5"), env("VITE_MISTRAL_API_KEY_6"), env("VITE_MISTRAL_API_KEY_7")],
  or:        [env("VITE_OPENROUTER_API_KEY"), env("VITE_OPENROUTER_API_KEY_2"), env("VITE_OPENROUTER_API_KEY_3")],
  fireworks: [env("VITE_FIREWORKS_API_KEY")],
  cohere:    [env("VITE_COHERE_API_KEY")],
  sambanova: [env("VITE_SAMBANOVA_API_KEY")],
  aimlapi:   [env("VITE_AIML_API_KEY")],
  deepseek:  [env("VITE_DEEPSEEK_API_KEY")],
};

// ─── Cooldown par clé ── une clé qui vient de recevoir un 429 est mise en
// pause quelques secondes plutôt que d'être re-choisie au hasard tout de suite.
const _keyCooldowns = new Map(); // `${provider}:${key}` -> timestamp (ms) de fin de pause

function keyId(provider, key) { return `${provider}:${key}`; }

function isKeyCoolingDown(provider, key) {
  const until = _keyCooldowns.get(keyId(provider, key));
  return typeof until === "number" && Date.now() < until;
}

function markKeyCooldown(provider, key, ms = 20_000) {
  if (!key) return;
  _keyCooldowns.set(keyId(provider, key), Date.now() + ms);
}

function getValidKey(provider, { avoidCooldown = true } = {}) {
  const k = KEYS[provider] || [];
  const valid = k.filter(Boolean);
  if (!valid.length && provider === "mistral" && typeof localStorage !== "undefined") {
    return localStorage.getItem("MISTRAL_API_KEY") || "";
  }
  if (!valid.length) return "";

  const usable = avoidCooldown ? valid.filter(k2 => !isKeyCoolingDown(provider, k2)) : valid;
  const pool = usable.length ? usable : valid; // si TOUTES en pause, on tente quand même plutôt que d'échouer
  return pool[Math.floor(Math.random() * pool.length)];
}

function filterChain(chain) {
  return chain.filter(m => getValidKey(m.p));
}

const URLS = {
  cerebras:  "https://api.cerebras.ai/v1/chat/completions",
  groq:      "https://api.groq.com/openai/v1/chat/completions",
  mistral:   "https://api.mistral.ai/v1/chat/completions",
  or:        "https://openrouter.ai/api/v1/chat/completions",
  fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
  cohere:    "https://api.cohere.com/v2/chat",
  sambanova: "https://api.sambanova.ai/v1/chat/completions",
  aimlapi:   "https://api.aimlapi.com/v1/chat/completions",
  deepseek:  "https://api.deepseek.com/chat/completions",
};

// Setter rétro-compat
export function setGroqKey(k) {
  if (typeof localStorage !== "undefined") localStorage.setItem("MISTRAL_API_KEY", k || "");
}

// ── Catalogue de modèles par tâche ───────────────────────────────────────────
const MODELS = {
  // ─── Coach conversationnel ultra-rapide (Nova / EnglishPractice) ─────────
  chat: [
    { p: "cerebras", m: "gpt-oss-120b",                                 max: 4096 },
    { p: "groq",     m: "llama-3.3-70b-versatile",                      max: 4096 },
    { p: "mistral",  m: "mistral-small-latest",                         max: 4096 },
    { p: "aimlapi",  m: "google/gemini-2.0-flash",                      max: 4096 },
    { p: "or",       m: "meta-llama/llama-3.3-70b-instruct:free",       max: 4096 },
    { p: "deepseek", m: "deepseek-chat",                                max: 4096 }, // last resort – 402 si pas de crédits
  ],
  coach: [
    { p: "cerebras", m: "gpt-oss-120b",                                 max: 4096 },
    { p: "groq",     m: "llama-3.3-70b-versatile",                      max: 4096 },
    { p: "mistral",  m: "mistral-small-latest",                         max: 4096 },
    { p: "aimlapi",  m: "google/gemini-2.0-flash",                      max: 4096 },
    { p: "deepseek", m: "deepseek-chat",                                max: 4096 }, // last resort
  ],
  // ─── 1 fiche flashcard simple ────────────────────────────────────────────
  "fast-json": [
    { p: "groq",     m: "llama-3.1-8b-instant",                         max: 2048, json: true },
    { p: "mistral",  m: "mistral-small-latest",                         max: 2048, json: true },
    { p: "deepseek", m: "deepseek-chat",                                max: 2048, json: true }, // last resort
  ],
  fast: [
    { p: "groq",     m: "llama-3.1-8b-instant",                         max: 2048 },
    { p: "mistral",  m: "mistral-small-latest",                         max: 2048 },
    { p: "deepseek", m: "deepseek-chat",                                max: 2048 }, // last resort
  ],
  // ─── Batch 5-7 fiches : cohérence > vitesse ──────────────────────────────
  "batch-json": [
    { p: "cerebras", m: "gpt-oss-120b",                                 max: 8192, json: true },
    { p: "groq",     m: "llama-3.3-70b-versatile",                      max: 8192, json: true },
    { p: "mistral",  m: "mistral-medium-latest",                        max: 8192, json: true },
    { p: "deepseek", m: "deepseek-chat",                                max: 8192, json: true }, // last resort
  ],
  // ─── Vision (Gemini direct dans Lab/geminiClient ; fallbacks ici) ────────
  vision: [
    { p: "mistral", m: "pixtral-12b-2409",                              max: 4096, vision: true },
    { p: "or",      m: "google/gemini-2.0-flash-001",                    max: 4096, vision: true },
    { p: "or",      m: "qwen/qwen2.5-vl-32b-instruct:free",             max: 4096, vision: true },
    { p: "or",      m: "meta-llama/llama-4-maverick:free",              max: 4096, vision: true },
    { p: "aimlapi", m: "google/gemini-2.0-flash",                       max: 4096, vision: true },
    { p: "aimlapi", m: "alibaba/qwen2.5-vl-72b-instruct",              max: 4096, vision: true },
  ],
  // ─── Créativité / mnémo absurde (FR/EN) ──────────────────────────────────
  creative: [
    { p: "deepseek", m: "deepseek-chat",                                max: 4096, temp: 1.1 },
    { p: "mistral",  m: "mistral-large-latest",                         max: 4096, temp: 1.1 },
    { p: "or",       m: "meta-llama/llama-3.3-70b-instruct:free",       max: 4096, temp: 1.1 },
  ],
  // ─── Correction sémantique vocale (rapide & fin FR/EN) ───────────────────
  "semantic-grade": [
    { p: "mistral",  m: "mistral-small-latest",                         max: 1024 },
    { p: "cerebras", m: "gpt-oss-120b",                                 max: 1024 },
  ],
  // ─── Vocab / définitions lexicales (Cohere Command R+) ───────────────────
  lexical: [
    { p: "cohere",   m: "command-r-plus-08-2024",                       max: 4096 },
    { p: "mistral",  m: "mistral-large-latest",                         max: 4096 },
  ],
  // ─── Résumé articles tech (8B suffit, débit max) ─────────────────────────
  "fast-summary": [
    { p: "groq",     m: "llama-3.1-8b-instant",                         max: 1024 },
    { p: "mistral",  m: "mistral-small-latest",                         max: 1024 },
  ],
  // ─── Pédagogie / génération d'exercices ──────────────────────────────────
  pedagogy: [
    { p: "mistral",  m: "mistral-large-latest",                         max: 4096 },
    { p: "groq",     m: "llama-3.3-70b-versatile",                      max: 4096 },
  ],
  // ─── JSON strict (grammar-constrained decoding sur Fireworks) ────────────
  "strict-json": [
    { p: "fireworks", m: "accounts/fireworks/models/llama-v3p3-70b-instruct", max: 4096, json: true },
    { p: "groq",      m: "llama-3.3-70b-versatile",                           max: 4096, json: true },
  ],
  json: [
    { p: "fireworks", m: "accounts/fireworks/models/llama-v3p3-70b-instruct", max: 4096, json: true },
    { p: "groq",      m: "llama-3.1-8b-instant",                              max: 4096, json: true },
    { p: "mistral",   m: "mistral-small-latest",                              max: 4096, json: true },
  ],
  // ─── Raisonnement profond (rare) ─────────────────────────────────────────
  reasoning: [
    { p: "deepseek",  m: "deepseek-reasoner",                           max: 8192, reason: true },
    { p: "or",        m: "deepseek/deepseek-r1:free",                   max: 8192, reason: true },
    { p: "sambanova", m: "DeepSeek-R1",                                 max: 8192, reason: true },
    { p: "mistral",   m: "mistral-large-latest",                        max: 8192 },
  ],
  // ─── Code generation ─────────────────────────────────────────────────────
  code: [
    { p: "deepseek", m: "deepseek-chat",                                max: 8192 },
    { p: "or",       m: "qwen/qwen-2.5-coder-32b-instruct:free",        max: 8192 },
    { p: "mistral",  m: "codestral-latest",                             max: 8192 },
    { p: "or",       m: "deepseek/deepseek-chat-v3:free",               max: 8192 },
  ],
};

// ─── File d'attente globale ── espace les requêtes sortantes (anti-429 en rafale) ──
// Toutes les requêtes passent par ce goulot : au plus 1 requête toutes les
// MIN_GAP_MS, exécutées dans l'ordre d'arrivée. Simple mais suffisant pour
// éviter les rafales parallèles (ex: génération de fiches en lot) qui
// grillent les clés d'un provider en quelques centaines de ms.
const QUEUE_MIN_GAP_MS = 1500;
let _queueTail = Promise.resolve();

function enqueueCall(fn) {
  const run = _queueTail.then(async () => {
    await sleep(QUEUE_MIN_GAP_MS);
    return fn();
  });
  // On avale les erreurs sur la chaîne interne pour ne jamais bloquer la file,
  // l'erreur réelle est toujours propagée à l'appelant via `run`.
  _queueTail = run.then(() => {}, () => {});
  return run;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Timeout helper ───────────────────────────────────────────────────────────
const TIMEOUT_MS_DEFAULT = 30_000;
function withTimeout(signal, ms = TIMEOUT_MS_DEFAULT) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("TIMEOUT")), ms);
  signal?.addEventListener?.("abort", () => ac.abort(signal.reason), { once: true });
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}

function buildMessages({ system, user, messages, imageUrl }) {
  if (Array.isArray(messages) && messages.length) return messages;
  const m = [];
  if (system) m.push({ role: "system", content: system });
  if (imageUrl) {
    m.push({
      role: "user",
      content: [
        { type: "text", text: user || "Describe this image." },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    });
  } else if (user) {
    m.push({ role: "user", content: user });
  }
  return m;
}

// ── Cohere a un format différent (v2/chat) ───────────────────────────────────
function buildCohereBody({ model, messages, maxTokens, temperature }) {
  // OpenAI-style → Cohere v2: messages avec role user/assistant/system identiques
  return {
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content.map(c => c.text || "").join("\n"),
    })),
    max_tokens: maxTokens,
    temperature,
  };
}

function extractCohereText(data) {
  // v2: { message: { content: [{ type: "text", text: "..." }] } }
  const parts = data?.message?.content;
  if (Array.isArray(parts)) return parts.map(p => p.text || "").join("");
  return data?.text || "";
}

async function callOne({ provider, model, messages, maxTokens, json, stream, temperature, signal }) {
  const url = URLS[provider];
  if (!url) throw new Error(`Unknown provider: ${provider}`);
  
  const key = getValidKey(provider);
  if (!key) throw new Error(`Missing key for ${provider}`);
  
  const isCohere = provider === "cohere";

  const body = isCohere
    ? buildCohereBody({ model, messages, maxTokens, temperature: temperature ?? 0.7 })
    : { model, messages, max_tokens: maxTokens, temperature: temperature ?? 0.7, stream: !!stream };

  if (json && !isCohere) body.response_format = { type: "json_object" };

  const headers = { 
    "Content-Type": "application/json",
    "Authorization": `Bearer ${key}`
  };
  
  if (provider === "or") {
    headers["HTTP-Referer"] = "https://memomaster.app";
    headers["X-Title"] = "MemoMaster";
  }

  const _t = withTimeout(signal);
  let res;
  try {
    res = await enqueueCall(() => fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: _t.signal }));
  } finally { 
    _t.clear(); 
  }
  
  if (!res.ok) {
    if (res.status === 429) markKeyCooldown(provider, key);
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP_${res.status}_${provider}_${t.slice(0, 120)}`);
  }
  
  return { res, isCohere };
}

// ─── Cache de réponses ── évite de re-payer un appel IA pour une requête
// strictement identique (ex: régénération de la même fiche, même prompt Lab).
// TTL par défaut 1h ; désactivable via opts.cache = false ; forcé à off pour
// temperature élevée (>0.5) car le but est alors d'avoir de la variété.
const CACHE_PREFIX = "airc_";
const CACHE_INDEX_KEY = "airc_index";
const CACHE_MAX_ENTRIES = 200;
const CACHE_DEFAULT_TTL_MS = 60 * 60 * 1000;

function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function buildCacheKey({ task, system, user, messages, imageUrl, json }) {
  const payload = JSON.stringify({ task, system, user, messages, imageUrl, json });
  return CACHE_PREFIX + hashString(payload);
}

function getCached(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() > entry.exp) { localStorage.removeItem(cacheKey); return null; }
    return entry;
  } catch { return null; }
}

function setCached(cacheKey, value, ttlMs) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ...value, exp: Date.now() + ttlMs }));
    const idxRaw = localStorage.getItem(CACHE_INDEX_KEY);
    const idx = idxRaw ? JSON.parse(idxRaw) : [];
    const next = idx.filter(k => k !== cacheKey);
    next.push(cacheKey);
    while (next.length > CACHE_MAX_ENTRIES) {
      const evicted = next.shift();
      localStorage.removeItem(evicted);
    }
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(next));
  } catch { /* cache best-effort — jamais bloquant */ }
}

// ── Public : appel non-streaming ─────────────────────────────────────────────
export async function aiCall(opts) {
  const { task = "chat", system, user, messages, imageUrl, maxTokens, json = false, temperature, signal, cache = true } = opts;

  const useCache = cache && (temperature === undefined || temperature <= 0.5);
  const cacheKey = useCache ? buildCacheKey({ task, system, user, messages, imageUrl, json }) : null;
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit) return { text: hit.text, model: hit.model, provider: hit.provider, raw: hit.raw, cached: true };
  }

  const chain = filterChain(MODELS[task] || MODELS.chat);
  if (!chain.length) throw new Error(`NO_KEYS_FOR_TASK_${task}`);
  const msgs = buildMessages({ system, user, messages, imageUrl });
  let lastErr;
  for (const m of chain) {
    // Sur 429, on retente une fois avec une autre clé du même provider après
    // un court backoff, avant de passer au provider suivant de la chaîne.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { res, isCohere } = await callOne({
          provider: m.p, model: m.m, messages: msgs,
          maxTokens: maxTokens || m.max,
          json: json || m.json,
          temperature: temperature ?? m.temp,
          signal,
        });
        const data = await res.json();
        const text = isCohere ? extractCohereText(data) : (data?.choices?.[0]?.message?.content ?? "");
        const result = { text, model: m.m, provider: m.p, raw: data };
        if (cacheKey) setCached(cacheKey, result, CACHE_DEFAULT_TTL_MS);
        return result;
      } catch (e) {
        lastErr = e;
        const is429 = /HTTP_429/.test(e?.message || "");
        if (is429 && attempt === 0 && getValidKey(m.p)) {
          await sleep(2000); // backoff avant de retenter sur une autre clé du même provider
          continue;
        }
        break;
      }
    }
  }
  throw new Error(`All providers failed for task '${task}': ${lastErr?.message || "unknown"}`);
}

// ── Public : streaming token-par-token (skip cohere car format différent) ────
export async function* aiStream(opts) {
  const { task = "chat", system, user, messages, imageUrl, maxTokens, signal } = opts;
  const chain = filterChain((MODELS[task] || MODELS.chat).filter(m => m.p !== "cohere"));
  if (!chain.length) throw new Error(`NO_KEYS_FOR_TASK_${task}`);
  const msgs = buildMessages({ system, user, messages, imageUrl });
  let lastErr;
  for (const m of chain) {
    try {
      const { res } = await callOne({
        provider: m.p, model: m.m, messages: msgs,
        maxTokens: maxTokens || m.max, stream: true, signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl).replace(/\r$/, "");
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try {
            const j = JSON.parse(data);
            const tok = j?.choices?.[0]?.delta?.content;
            if (tok) yield tok;
          } catch { /* partial */ }
        }
      }
      return;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`All stream providers failed for task '${task}': ${lastErr?.message || "unknown"}`);
}

// ── Public : JSON structuré garanti ──────────────────────────────────────────
export async function aiJSON(opts) {
  const { text, model, provider } = await aiCall({ ...opts, task: opts.task || "strict-json", json: true });
  let parsed;
  try { parsed = JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) throw new Error("No JSON found in response");
    parsed = JSON.parse(m[0]);
  }
  return { data: parsed, model, provider };
}

// ── Health / debug ───────────────────────────────────────────────────────────
export function aiStatus() {
  return {
    groqKeys: 1,
    orKeys: 1,
    providers: {},
  };
}
