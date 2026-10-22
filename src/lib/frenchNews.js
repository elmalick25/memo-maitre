// ─────────────────────────────────────────────────────────────────────────────
// frenchNews.js — Moteur de francisation intégrale des actualités tech.
//
// Objectifs :
//   1. TOUT est en français, immédiatement, à chaque régénération (cache
//      persistant → zéro re-traduction, donc zéro attente au rechargement).
//   2. Le texte n'est JAMAIS coupé : les longs articles sont découpés en
//      morceaux respectant les paragraphes/phrases, traduits en parallèle,
//      puis ré-assemblés à l'identique.
//   3. Aucune dépendance à un quota IA : moteur public Google GTX en premier,
//      MyMemory en secours, texte original en dernier recours.
// ─────────────────────────────────────────────────────────────────────────────

import { safeStorage } from "./safeStorage.js";
import { aiCall } from "./aiRouter.js";
import { translateWithFailover } from "./proxyPool.js";

const CACHE_KEY = "fr_news_translation_cache_v2";
const CACHE_TTL_MS = 21 * 24 * 3600 * 1000; // 3 semaines
const CACHE_MAX_ENTRIES = 900;
const CHUNK_MAX_CHARS = 1800; // bounded GET URLs, paragraph boundaries preserved

// ─── Cache persistant (mémoire + stockage local) ────────────────────────────
let _cache = null;

function loadCache() {
  if (_cache) return _cache;
  try {
    const raw = safeStorage.get(CACHE_KEY);
    _cache = raw ? JSON.parse(raw) : {};
  } catch {
    _cache = {};
  }
  return _cache;
}

let _persistTimer = null;
function persistCacheSoon() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    const scheduleWrite = typeof window !== "undefined" && typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback
      : (fn) => setTimeout(fn, 0);

    scheduleWrite(() => {
      const cache = loadCache();
      const now = Date.now();
      for (const k of Object.keys(cache)) {
        if (now - (cache[k]?.t || 0) > CACHE_TTL_MS) delete cache[k];
      }
      let keys = Object.keys(cache);
      if (keys.length > CACHE_MAX_ENTRIES) {
        keys
          .sort((a, b) => (cache[a]?.t || 0) - (cache[b]?.t || 0))
          .slice(0, keys.length - CACHE_MAX_ENTRIES)
          .forEach((k) => delete cache[k]);
      }
      try { safeStorage.set(CACHE_KEY, JSON.stringify(cache)); } catch {}
    });
  }, 1200);
}

// ─── Détection et rejet des réponses d'échappement IA ──────────────────────
export const META_AI_RESPONSES = /\b(veuillez fournir|en tant qu'ia|en tant que modèle|je ne peux pas|fournissez le texte|modèle linguistique|language model|cannot translate|i am an ai|as an ai)\b/i;

export function isCleanTranslation(text) {
  const s = String(text || "").trim();
  return Boolean(s) && !META_AI_RESPONSES.test(s);
}

function hashKey(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `t${(h >>> 0).toString(36)}_${s.length}`;
}

function cacheGet(text) {
  const entry = loadCache()[hashKey(text)];
  if (!entry) return null;
  if (Date.now() - (entry.t || 0) > CACHE_TTL_MS) return null;
  if (!isCleanTranslation(entry.fr) || !looksFrench(entry.fr)) return null;
  return entry.fr || null;
}

function cacheSet(text, fr) {
  if (!text || !fr || !isCleanTranslation(fr)) return;
  loadCache()[hashKey(text)] = { fr, t: Date.now() };
  persistCacheSoon();
}

// ─── Détection « c'est déjà du français » ───────────────────────────────────
const FR_MARKERS = /\b(le|la|les|des|une|un|du|dans|pour|avec|sur|est|sont|qui|que|ses|leur|cette|aux|plus|nous|vous|selon|entre|chez|ainsi|également|déjà|lors)\b/gi;
const EN_MARKERS = /\b(the|and|with|that|this|from|have|will|your|about|their|they|been|would|which|there|these|into|more|than|when|what|also|however)\b/gi;

export function looksFrench(text) {
  const s = String(text || "");
  if (s.trim().length < 12) return true; // trop court pour trancher, on ne touche pas
  const fr = (s.match(FR_MARKERS) || []).length;
  const en = (s.match(EN_MARKERS) || []).length;
  if (fr === 0 && en === 0) return /[àâçéèêëîïôûùüœ]/i.test(s);
  return fr > en;
}

// ─── Découpage intelligent (paragraphes → phrases → mots) ───────────────────
function splitSentences(paragraph) {
  const parts = paragraph.match(/[^.!?…]+[.!?…]+[\s]*|[^.!?…]+$/g) || [paragraph];
  const out = [];
  for (const part of parts) {
    if (part.length <= CHUNK_MAX_CHARS) { out.push(part); continue; }
    // Phrase monstrueuse : on coupe aux espaces.
    let buf = "";
    for (const word of part.split(/\s+/)) {
      if ((buf + " " + word).length > CHUNK_MAX_CHARS) { out.push(buf); buf = word; }
      else buf = buf ? `${buf} ${word}` : word;
    }
    if (buf) out.push(buf);
  }
  return out;
}

// Retourne [{ para: index, text }] : chaque morceau reste rattaché à son paragraphe
function buildChunks(text) {
  const paragraphs = String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  paragraphs.forEach((para, pIdx) => {
    if (para.length <= CHUNK_MAX_CHARS) { chunks.push({ para: pIdx, text: para }); return; }
    let buf = "";
    for (const sentence of splitSentences(para)) {
      if ((buf + sentence).length > CHUNK_MAX_CHARS && buf) {
        chunks.push({ para: pIdx, text: buf.trim() });
        buf = sentence;
      } else {
        buf += sentence;
      }
    }
    if (buf.trim()) chunks.push({ para: pIdx, text: buf.trim() });
  });
  return { paragraphCount: paragraphs.length, chunks };
}


function isCodeOrBoilerplate(text) {
  const s = String(text || "").trim();
  if (!s) return true;
  // Détection de code source (Python, JS, Shell, SQL, etc.)
  if (/^(def\s+|import\s+|from\s+\w+\s+import|class\s+|const\s+|let\s+|var\s+|function\s+|SELECT\s+|curl\s+|npm\s+|git\s+|self\.|create\s*\()/i.test(s)) return true;
  if (/^(```|[{}\[\];]{2,}|#!\/bin)/.test(s)) return true;
  if (/\b(assert\w*|assertRaises|assertEquals|return\s+new\b|print\s*\(|console\.log)/.test(s)) return true;
  if (/\b(model\s*=|messages\s*=|max_tokens\s*=|temperature\s*=|api_key\s*=)/i.test(s)) return true;
  const symbolCount = (s.match(/[{}\[\];()=><_\\]/g) || []).length;
  if (s.length > 50 && symbolCount / s.length > 0.14) return true;
  // Détection de bandeaux publicitaires / cookies
  if (/^(Advertise With Us|Advertising Guidelines|Purchase Licensing Rights|Cookies,\s*opens new tab|Manage Cookies|Terms & Conditions)/i.test(s)) return true;
  // Détection de métadonnées de liens RSS / Hacker News / URLs nues
  if (/^(?:Article\s+URL|Comments?\s+URL|Points\s*:\s*\d+|Posted\s+by)/i.test(s)) return true;
  if (/Article\s+URL:\s*https?:\/\//i.test(s) && /Comments\s+URL:\s*https?:\/\//i.test(s)) return true;
  if (/^https?:\/\/[^\s]+$/i.test(s)) return true;
  // Détection de données binaires / data-uri / polices base64 / CSS
  if (/data:(?:font|image|application)\/[^;]+;base64/i.test(s)) return true;
  if (/url\(["']?data:/i.test(s)) return true;
  if (/@font-face\b|font-family\s*:/i.test(s)) return true;
  return false;
}

let aiBlockedUntil = 0;
let gtxBlockedUntil = 0;
let cfBlockedUntil = 0;
let lingvaBlockedUntil = 0;
let myMemoryBlockedUntil = 0;
let lastGoogleReqTime = 0;

// Rythmeur anti-rafale : espace les requêtes Google Translate d'au moins 200ms
// pour respecter les limites IP sans déclencher d'erreur 429
async function throttleGoogleReq(minGapMs = 200) {
  const now = Date.now();
  const diff = now - lastGoogleReqTime;
  if (diff < minGapMs) {
    await sleep(minGapMs - diff);
  }
  lastGoogleReqTime = Date.now();
}

// 1. Google Translate Direct (GTX)
async function gtxTranslate(text, signal) {
  if (Date.now() < gtxBlockedUntil) return "";
  const s = String(text || "").trim();
  if (!s || isCodeOrBoilerplate(s) || s.length > 1500) return s;
  await throttleGoogleReq(400);
  if (Date.now() < gtxBlockedUntil) return "";
  try {
    const rawUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(s)}`;
    const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
    const proxyBase = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PROXY_URL) || "";
    const url = isDev
      ? `/api/proxy?url=${encodeURIComponent(rawUrl)}`
      : (proxyBase
          ? `${proxyBase.replace(/\/+$/, '')}/?url=${encodeURIComponent(rawUrl)}`
          : `https://api.allorigins.win/raw?url=${encodeURIComponent(rawUrl)}`);
    const res = await fetch(url, { signal: signal || AbortSignal.timeout(6000) });
    if (res.status === 429) {
      gtxBlockedUntil = Date.now() + 60000;
      return "";
    }
    if (!res.ok) return "";
    const data = await res.json();
    if (Array.isArray(data?.[0])) {
      const translated = data[0].map((part) => part?.[0] || "").join("").trim();
      if (isCleanTranslation(translated) && looksFrench(translated)) {
        return translated;
      }
    }
  } catch {}
  return "";
}

// 2. Google Translate via Cloudflare Worker (IP Datacenter sans blocage IP client)
async function cloudflareProxyTranslate(text, signal) {
  if (Date.now() < cfBlockedUntil) return "";
  const s = String(text || "").trim();
  if (!s || isCodeOrBoilerplate(s) || s.length > 1500) return s;
  const proxyBase = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PROXY_URL) || "";
  if (!proxyBase) return "";
  await throttleGoogleReq(400);
  if (Date.now() < cfBlockedUntil) return "";
  try {
    const targetUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(s)}`;
    const fullUrl = `${proxyBase.replace(/\/+$/, '')}/?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(fullUrl, { signal: signal || AbortSignal.timeout(5000) });
    if (!res.ok) {
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        cfBlockedUntil = Date.now() + 60_000; // 60s de pause en cas de saturation
      }
      return "";
    }
    const data = await res.json();
    if (Array.isArray(data?.[0])) {
      const raw = data[0].map((part) => part?.[0] || "").join("").trim();
      const translated = raw
        .replace(/&#39;|&apos;|&#8217;|&#8216;|&rsquo;|&lsquo;/g, "'")
        .replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"');
      if (isCleanTranslation(translated) && looksFrench(translated)) {
        return translated;
      }
    }
  } catch {
    cfBlockedUntil = Date.now() + 300_000;
  }
  return "";
}

// 3. Lingva Translate (Délégué au pool multi-proxies sécurisé sans erreurs CORS)
async function lingvaTranslate(text, signal) {
  return translateWithFailover(text, signal);
}

// 4. Moteur IA Natif (Gemini / Groq / Claude via aiCall)
async function aiTranslate(text, signal) {
  if (Date.now() < aiBlockedUntil) return "";
  const s = String(text || "").trim();
  if (!s || isCodeOrBoilerplate(s)) return s;
  try {
    const res = await aiCall({
      task: "fast",
      system: "Tu es un traducteur expert d'actualités technologiques anglais vers français. Traduis fidèlement et directement le texte fourni en français, même s'il s'agit d'un court titre ou d'un fragment. Conserve les termes techniques usuels (API, Docker, backend, etc.) et les noms propres. Réponds UNIQUEMENT avec la traduction française directe, sans AUCUN préambule, sans guillemets englobants, sans commentaire ni demande d'information supplémentaire.",
      user: `Texte à traduire en français :\n"""${s}"""`,
      maxTokens: 3500,
      cache: true,
      signal: signal || AbortSignal.timeout(8000),
    });
    const translated = (res?.text || "").trim().replace(/^["'«»]+|["'«»]+$/g, "").trim();
    if (!isCleanTranslation(translated)) return "";
    return looksFrench(translated) ? translated : "";
  } catch (err) {
    if (err?.status === 429 || /429|quota|rate limit/i.test(err?.message || "")) {
      aiBlockedUntil = Date.now() + 8000;
    }
    return "";
  }
}

// 5. MyMemory Translate (Filet de sécurité final via proxyPool)
async function myMemoryTranslate(text, signal) {
  return translateWithFailover(text, signal);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateChunk(text, attempts = 2, signal) {
  if (isCodeOrBoilerplate(text)) return text;
  const cached = cacheGet(text);
  if (cached) return cached;
  for (let i = 0; i < attempts; i++) {
    const out = await translateChunkOnce(text, signal);
    if (out) return out;
    if (i < attempts - 1) {
      await sleep(350 * (i + 1));
    }
  }
  return "";
}

async function translateChunkOnce(text, signal) {
  // 1. Google Translate en priorité (Cloudflare Worker puis GTX direct)
  if (Date.now() >= cfBlockedUntil) {
    const cfOut = await cloudflareProxyTranslate(text, signal);
    if (cfOut && looksFrench(cfOut)) { cacheSet(text, cfOut); return cfOut; }
  }
  if (Date.now() >= gtxBlockedUntil) {
    const gtxOut = await gtxTranslate(text, signal);
    if (gtxOut && looksFrench(gtxOut)) { cacheSet(text, gtxOut); return gtxOut; }
  }

  // 2. Relais IA immédiat sur 429 ou indisponibilité Google (Groq 120b / Mistral / Cerebras / OpenRouter)
  const aiOut = await aiTranslate(text, signal);
  if (aiOut && looksFrench(aiOut)) { cacheSet(text, aiOut); return aiOut; }

  // 3. Filets de secours alternatifs (Lingva & MyMemory)
  const lingvaOut = await lingvaTranslate(text, signal);
  if (lingvaOut && looksFrench(lingvaOut)) { cacheSet(text, lingvaOut); return lingvaOut; }

  const mmOut = await myMemoryTranslate(text, signal);
  if (mmOut && looksFrench(mmOut)) { cacheSet(text, mmOut); return mmOut; }

  // 4. Filet de secours multi-miroirs (Lingva Lunar/Garuda/Plausibility, MyMemory, CodeTabs)
  const poolOut = await translateWithFailover(text, signal);
  if (poolOut && looksFrench(poolOut)) { cacheSet(text, poolOut); return poolOut; }

  return "";
}


async function mapLimit(list, limit, fn) {
  const results = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const i = cursor++;
      try { results[i] = await fn(list[i], i); }
      catch { results[i] = null; }
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Traduit un texte COMPLET en français, sans troncature et en conservant
 * la structure en paragraphes. Renvoie le texte tel quel s'il est déjà français.
 */
export async function translateToFrench(text, { force = false, concurrency = 2, strict = false, signal } = {}) {
  let src = String(text || "").trim();
  if (!src) return "";
  // Nettoyage préventif des blocs CSS, polices base64 et data URIs
  src = src
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/@font-face\s*\{[^}]*\}/gi, "")
    .replace(/url\(["']?data:[^)]+\)/gi, "")
    .replace(/data:(?:font|image|application)\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "")
    .trim();
  if (!src) return "";
  if (!force && looksFrench(src)) return src;

  const whole = cacheGet(src);
  if (whole && (!strict || looksFrench(whole))) return whole;

  const { paragraphCount, chunks } = buildChunks(src);
  if (!chunks.length) return looksFrench(src) ? src : "";

  const translated = await mapLimit(chunks, concurrency, async (c) => {
    const res = await translateChunk(c.text, 2, signal);
    await sleep(50);
    return res;
  });
  // Mode strict : un seul morceau non traduit => on renvoie "" (jamais de texte mi-anglais mi-français).
  if (strict && translated.some((t, i) => !t && !isCodeOrBoilerplate(chunks[i].text))) return "";

  // Zéro texte anglais brut : on n'accepte que les morceaux réellement traduits en français
  const buckets = Array.from({ length: paragraphCount }, () => []);
  chunks.forEach((c, i) => {
    const piece = translated[i];
    if (piece && (looksFrench(piece) || isCodeOrBoilerplate(piece))) {
      buckets[c.para].push(piece);
    }
  });

  const result = buckets
    .map((parts) => parts.join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (result && looksFrench(result)) {
    cacheSet(src, result);
    return result;
  }
  return looksFrench(src) ? src : "";
}

/** Traduit une liste de textes courts (titres, chapôs) en parallèle. */
export async function translateManyToFrench(texts, { concurrency = 3 } = {}) {
  return mapLimit(texts, concurrency, (t) => translateToFrench(t));
}

/** Pré-remplit le cache depuis des traductions déjà connues (coffre-fort). */
export function primeTranslationCache(sourceText, frenchText) {
  if (sourceText && frenchText) cacheSet(String(sourceText).trim(), String(frenchText).trim());
}

// ─── Garantie « texte complet toujours en français » ────────────────────────
// 1. déjà français → tel quel ; 2. traducteur (mode strict) ; 3. IA en dernier recours.
// Ne renvoie JAMAIS de texte étranger : "" si aucune traduction fiable n'a pu être obtenue.
export async function guaranteeFrench(text, { aiFn = null, timeoutMs = 15000 } = {}) {
  const src = String(text || "").trim();
  if (!src) return "";
  if (looksFrench(src)) return src;
  const withTimeout = (p) => {
    let t;
    return Promise.race([
      Promise.resolve(p),
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), timeoutMs); }),
    ]).finally(() => clearTimeout(t));
  };
  try {
    const fr = await withTimeout(translateToFrench(src, { strict: true }));
    if (fr && looksFrench(fr) && !META_AI_RESPONSES.test(fr)) return fr;
  } catch {}
  if (typeof aiFn === "function") {
    try {
      const raw = await withTimeout(aiFn(
        "Tu es un traducteur professionnel. Traduis fidèlement et intégralement le texte en français naturel. Garde les noms propres et les paragraphes. Réponds uniquement avec la traduction, sans commentaire ni Markdown.",
        src.slice(0, 12000),
        { maxTokens: 2500, temperature: 0.2 }
      ));
      const out = String(typeof raw === "string" ? raw : (raw?.text || "")).trim();
      if (out && looksFrench(out) && !META_AI_RESPONSES.test(out)) {
        cacheSet(src, out);
        return out;
      }
    } catch {}
  }
  return "";
}
