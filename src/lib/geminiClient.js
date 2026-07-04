// ════════════════════════════════════════════════════════════════════════════
// 🔑 geminiClient.js — Gemini générative content, protection anti-429 GOD TIER
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️  IMPORTANT — Quota partagé entre clés du même projet Google :
//     Avoir 6 clés dans le même projet NE multiplie PAS le quota.
//     Toutes les clés partagent les mêmes 5-15 RPM du tier gratuit.
//     Ce client gère donc :
//       1. Un seul file de requêtes globale (pas de parallélisme).
//       2. Un cooldown projet-niveau (bloque TOUTES les clés ensemble).
//       3. Un cache LRU (déduplique les appels identiques pendant 5 min).
//       4. Un back-off exponentiel (attente 1 min → 2 min → 4 min → 8 min max).
//       5. Un token bucket strict (≤ 5 RPM soit 1 appel / 12 s minimum).
//
// ════════════════════════════════════════════════════════════════════════════

const env = (key) =>
  typeof import.meta !== "undefined" ? import.meta.env?.[key] : undefined;

// ── Configuration ────────────────────────────────────────────────────────────
const DEFAULT_MODEL       = env("VITE_GEMINI_MODEL") || "gemini-2.0-flash-lite";
const RPM_LIMIT           = Number(env("VITE_GEMINI_RPM_LIMIT")  || 4);        // free tier ≤ 4 RPM (conservatif)
const MIN_INTERVAL_MS     = Math.ceil(60_000 / RPM_LIMIT);                     // ~15 000 ms
const RETRY_BUFFER_MS     = 2_000;                                              // tampon après Retry-After
const MAX_BACKOFF_MS      = 8 * 60_000;                                         // plafond backoff : 8 min
const CACHE_TTL_MS        = 5 * 60_000;                                         // TTL cache réponses : 5 min
const CACHE_MAX           = 50;                                                  // entrées LRU max

// ── État interne ─────────────────────────────────────────────────────────────
let queue               = Promise.resolve();   // file globale séquentielle
let lastRequestAt       = 0;                   // horodatage dernier appel réel
let projectCooldownUntil= 0;                   // cooldown niveau-projet (429 partagé)
let consecutiveFails    = 0;                   // compteur pour back-off expo
let keyIndex            = 0;                   // curseur de rotation des clés
const keyCooldown       = new Map();           // idx → timestamp cooldown individuel

// ── Cache LRU simple ────────────────────────────────────────────────────────
const _cache = new Map(); // key → { data, ts }
function _cacheKey(model, body) {
  try { return `${model}:${JSON.stringify(body)}`; } catch { return null; }
}
function _cacheGet(k) {
  if (!k || !_cache.has(k)) return null;
  const e = _cache.get(k);
  if (Date.now() - e.ts > CACHE_TTL_MS) { _cache.delete(k); return null; }
  // Rafraîchit l'ordre LRU
  _cache.delete(k); _cache.set(k, e);
  return e.data;
}
function _cacheSet(k, data) {
  if (!k) return;
  if (_cache.has(k)) _cache.delete(k);
  _cache.set(k, { data, ts: Date.now() });
  if (_cache.size > CACHE_MAX) {
    _cache.delete(_cache.keys().next().value); // supprime le plus ancien
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

function cleanKey(v) {
  return String(v || "").trim().replace(/^['""]|['""]$/g, "");
}

export function getGeminiKeys(max = 20) {
  // Les clés sont masquées côté serveur (Firebase Functions).
  // On retourne une clé fictive pour que la logique de rate-limit du client fonctionne.
  return ["proxy-key"];
}

export function getGeminiKeyCount() {
  return getGeminiKeys().length;
}

/** True si toutes les clés sont en cooldown (quota projet épuisé). */
export function isGeminiLikelyUnavailable() {
  if (Date.now() < projectCooldownUntil) return true;
  const keys = getGeminiKeys();
  if (keys.length === 0) return true;
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    if (now >= (keyCooldown.get(i) || 0)) return false;
  }
  return true;
}

/** Réinitialise manuellement le cooldown projet (pour les tests / debug). */
export function resetGeminiCooldown() {
  projectCooldownUntil = 0;
  consecutiveFails = 0;
  keyCooldown.clear();
}

/** Retourne le temps en ms avant que Gemini soit à nouveau disponible. */
export function geminiReadyInMs() {
  if (!isGeminiLikelyUnavailable()) return 0;
  const pcd = Math.max(0, projectCooldownUntil - Date.now());
  const kcd = Math.min(...getGeminiKeys().map((_, i) => Math.max(0, (keyCooldown.get(i) || 0) - Date.now())));
  return Math.min(pcd, isFinite(kcd) ? kcd : pcd);
}

function pickAvailableKey(keys) {
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const idx = (keyIndex + i) % keys.length;
    if (now >= (keyCooldown.get(idx) || 0)) {
      keyIndex = (idx + 1) % keys.length;
      return { key: keys[idx], idx };
    }
  }
  return null;
}

function parseRetryDelayMs(response, data) {
  // Retry-After header (secondes)
  const ra = Number(response.headers?.get?.("retry-after"));
  if (Number.isFinite(ra) && ra > 0) return ra * 1000;

  // Champ retryDelay dans le corps d'erreur
  const retryInfo = data?.error?.details?.find((d) => d?.retryDelay);
  if (retryInfo?.retryDelay) {
    const s = Number(String(retryInfo.retryDelay).replace(/s$/, ""));
    if (Number.isFinite(s) && s > 0) return s * 1000;
  }

  // Message texte "retry in Xs"
  const msg = data?.error?.message || "";
  const m = msg.match(/retry in\s+([0-9.]+)s/i);
  if (m) {
    const s = Number(m[1]);
    if (Number.isFinite(s) && s > 0) return s * 1000;
  }

  return 60_000; // défaut 1 min si rien trouvé
}

function geminiErrorMessage(status, data) {
  if (status === 429)
    return "Quota Gemini atteint. Les clés d'un même projet Google partagent le quota : patiente un instant ou active la facturation côté Google.";
  if (status === 400) return "Requête Gemini invalide. Vérifie le modèle et le format envoyé.";
  if (status === 403) return "Clé Gemini refusée. Vérifie que l'API Generative Language est activée.";
  if (status === 401) return "Clé Gemini invalide ou expirée.";
  return data?.error?.message || `Erreur Gemini HTTP ${status}`;
}

// ── Cœur de l'appel (SANS queue) ────────────────────────────────────────────
async function runGeminiRequest({ model = DEFAULT_MODEL, body, signal }) {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error("Aucune clé Gemini trouvée. Ajoute VITE_GEMINI_API_KEY_1 dans ton fichier .env.");
  }

  // ── Vérification cooldown projet ─────────────────────────────────────────
  const now0 = Date.now();
  if (now0 < projectCooldownUntil) {
    const wait0 = projectCooldownUntil - now0;
    console.info(`[Gemini] Cooldown projet actif — attente ${Math.ceil(wait0 / 1000)}s`);
    await wait(wait0);
  }

  // ── Throttle RPM (token bucket simple) ───────────────────────────────────
  const sinceLastReq = Date.now() - lastRequestAt;
  if (sinceLastReq < MIN_INTERVAL_MS) {
    await wait(MIN_INTERVAL_MS - sinceLastReq);
  }

  // ── Tentative avec chaque clé disponible ─────────────────────────────────
  // NB : puisque toutes les clés partagent le quota, on ne fait QU'UNE tentative
  //      réelle par cycle de queue. Si la clé choisie retourne 429, on met en
  //      cooldown le projet entier (back-off expo) et on relance via la queue.
  const entry = pickAvailableKey(keys);
  if (!entry) {
    const backoff = Math.min(MAX_BACKOFF_MS, 60_000 * Math.pow(2, consecutiveFails));
    projectCooldownUntil = Date.now() + backoff;
    consecutiveFails = Math.min(consecutiveFails + 1, 6);
    throw new Error(`Toutes les clés Gemini sont en cooldown. Prochain essai dans ${Math.ceil(backoff / 1000)}s.`);
  }

  lastRequestAt = Date.now();
  let response, text, data;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${entry.key}`;
    response = await fetch(url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body }),
        signal,
      }
    );
  } catch (err) {
    keyCooldown.set(entry.idx, Date.now() + 5_000);
    throw err;
  }

  text = await response.text().catch(() => "");
  try {
    // eslint-disable-next-line no-control-regex
    data = text ? JSON.parse(text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")) : null;
  } catch {
    data = { raw: text };
  }

  if (response.status === 429) {
    const retryMs  = parseRetryDelayMs(response, data) + RETRY_BUFFER_MS;
    const backoff  = Math.min(MAX_BACKOFF_MS, Math.max(retryMs, 60_000 * Math.pow(2, consecutiveFails)));
    consecutiveFails = Math.min(consecutiveFails + 1, 6);

    // ⚠️ Cooldown PROJET (pas seulement la clé — elles partagent le quota)
    projectCooldownUntil = Date.now() + backoff;
    keyCooldown.set(entry.idx, Date.now() + backoff);

    console.warn(`[Gemini] 429 reçu — backoff projet ${Math.ceil(backoff / 1000)}s (tentative #${consecutiveFails})`);
    throw new Error(geminiErrorMessage(response.status, data));
  }

  if (response.status === 401 || response.status === 403) {
    keyCooldown.set(entry.idx, Date.now() + 10 * 60_000);
    throw new Error(geminiErrorMessage(response.status, data));
  }

  if (!response.ok) {
    keyCooldown.set(entry.idx, Date.now() + 30_000);
    throw new Error(geminiErrorMessage(response.status, data));
  }

  // Succès → réinitialise le compteur de back-off
  consecutiveFails = 0;
  return data;
}

// ── API publique — file séquentielle avec cache ──────────────────────────────
/**
 * Enfile un appel Gemini de manière séquentielle (1 seul en vol à la fois).
 * Les appels identiques (même model + body) sont servis depuis le cache (5 min TTL).
 *
 * @param {{ model?: string, body: object, signal?: AbortSignal }} options
 * @returns {Promise<object>}
 */
export function callGeminiGenerateContent(options) {
  const ck = _cacheKey(options.model ?? DEFAULT_MODEL, options.body);
  const cached = _cacheGet(ck);
  if (cached) return Promise.resolve(cached);

  // Chaque appel est chaîné à la fin de la file globale.
  const next = queue.then(
    () => runGeminiRequest(options),
    () => runGeminiRequest(options)
  ).then((data) => {
    _cacheSet(ck, data);
    return data;
  });

  // La file avance indépendamment de la réussite de cet appel.
  queue = next.catch(() => {});
  return next;
}
