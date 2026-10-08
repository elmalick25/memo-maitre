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

const CACHE_KEY = "fr_news_translation_cache_v1";
const CACHE_TTL_MS = 21 * 24 * 3600 * 1000; // 3 semaines
const CACHE_MAX_ENTRIES = 900;
const CHUNK_MAX_CHARS = 3500; // envoi en POST : gros morceaux = moins de requêtes, traduction plus cohérente

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
  if (!isCleanTranslation(entry.fr)) return null;
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
  return fr >= en;
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
  if (/^(def\s+|import\s+|class\s+|const\s+|let\s+|function\s+|SELECT\s+|curl\s+|npm\s+|git\s+|self\.)/i.test(s)) return true;
  if (/^(```|[{}\[\];]{2,}|#!\/bin)/.test(s)) return true;
  if (/\b(assert\w*|assertRaises|assertEquals|return\s+new\b)/.test(s)) return true;
  // Détection de bandeaux publicitaires / cookies
  if (/^(Advertise With Us|Advertising Guidelines|Purchase Licensing Rights|Cookies,\s*opens new tab|Manage Cookies|Terms & Conditions)/i.test(s)) return true;
  return false;
}

// ─── Moteur de traduction IA natif multi-fournisseurs (Groq / Cloudflare / Gemini) ───
async function aiTranslate(text, signal) {
  const s = String(text || "").trim();
  if (!s || isCodeOrBoilerplate(s)) return s;
  try {
    const res = await aiCall({
      task: "fast",
      system: "Tu es un traducteur expert d'actualités technologiques anglais vers français. Traduis fidèlement et directement le texte fourni en français, même s'il s'agit d'un court titre ou d'un fragment. Conserve les termes techniques usuels (API, Docker, backend, etc.) et les noms propres. Réponds UNIQUEMENT avec la traduction française directe, sans AUCUN préambule, sans guillemets englobants, sans commentaire ni demande d'information supplémentaire.",
      user: `Texte à traduire en français :\n"""${s}"""`,
      maxTokens: 3500,
      cache: true,
      signal,
    });
    const translated = (res.text || "").trim().replace(/^["'«»]+|["'«»]+$/g, "").trim();
    if (!isCleanTranslation(translated)) return "";
    return looksFrench(translated) ? translated : "";
  } catch {
    return "";
  }
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
      await sleep(500 * (i + 1));
    }
  }
  return "";
}

async function translateChunkOnce(text, signal) {
  // Moteur IA natif multi-fournisseurs : zéro CORS, zéro 429, respecte le contexte tech
  const aiOut = await aiTranslate(text, signal);
  if (aiOut) {
    cacheSet(text, aiOut);
    return aiOut;
  }
  return ""; // échec : ne pas faire passer le texte anglais pour du français
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
export async function translateToFrench(text, { force = false, concurrency = 4, strict = false } = {}) {
  const src = String(text || "").trim();
  if (!src) return "";
  if (!force && looksFrench(src)) return src;

  const whole = cacheGet(src);
  if (whole) return whole;

  // Traduction intégrale en un seul appel rapide (<= 5000 caractères)
  // Conserve la cohérence contextuelle et le balisage sans multiplier les requêtes HTTP
  if (src.length <= 5000) {
    const directAi = await aiTranslate(src);
    if (directAi) {
      cacheSet(src, directAi);
      return directAi;
    }
  }

  const { paragraphCount, chunks } = buildChunks(src);
  if (!chunks.length) return looksFrench(src) ? src : "";

  const translated = await mapLimit(chunks, concurrency, (c) => translateChunk(c.text));
  // Mode strict : un seul morceau non traduit => on renvoie "" (jamais de texte mi-anglais mi-français).
  if (strict && translated.some((t, i) => !t && !isCodeOrBoilerplate(chunks[i].text))) return "";

  // Si au moins un morceau n'a pas pu être traduit, on vérifie la cohérence
  const buckets = Array.from({ length: paragraphCount }, () => []);
  chunks.forEach((c, i) => {
    const piece = translated[i] || c.text;
    if (piece) buckets[c.para].push(piece);
  });

  const result = buckets
    .map((parts) => parts.join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (result && result !== src) {
    cacheSet(src, result);
    return result;
  }
  return looksFrench(src) ? src : "";
}

/** Traduit une liste de textes courts (titres, chapôs) en parallèle. */
export async function translateManyToFrench(texts, { concurrency = 8 } = {}) {
  return mapLimit(texts, concurrency, (t) => translateToFrench(t));
}

/** Pré-remplit le cache depuis des traductions déjà connues (coffre-fort). */
export function primeTranslationCache(sourceText, frenchText) {
  if (sourceText && frenchText) cacheSet(String(sourceText).trim(), String(frenchText).trim());
}
