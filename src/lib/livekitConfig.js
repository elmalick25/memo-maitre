// ============================================================================
// livekitConfig.js — Terrain préparé pour les agents vocaux LiveKit + Gemini
// ============================================================================
//
// OBJECTIF
// --------
// Remplacer les agents ElevenLabs (coûteux) par des agents LiveKit alimentés
// par Gemini. Ce fichier centralise :
//   • les variables d'environnement LiveKit attendues,
//   • la RÉSERVATION de 3 clés Gemini dédiées EXCLUSIVEMENT à LiveKit
//     (pour ne pas cannibaliser les clés utilisées par geminiClient.js).
//
// CLÉS GEMINI RÉSERVÉES POUR LIVEKIT
// ----------------------------------
// On lit dans cet ordre (pour laisser la main aux variables dédiées si elles
// existent, sinon fallback sur les slots hauts _8/_9/_10 déjà présents dans
// ton .env) :
//
//   1) VITE_GEMINI_API_KEY_LIVEKIT_1  (fallback: VITE_GEMINI_API_KEY_8)
//   2) VITE_GEMINI_API_KEY_LIVEKIT_2  (fallback: VITE_GEMINI_API_KEY_9)
//   3) VITE_GEMINI_API_KEY_LIVEKIT_3  (fallback: VITE_GEMINI_API_KEY_10)
//
// ⚠️  geminiClient.js doit à terme IGNORER ces 3 slots pour éviter les
//     collisions de quota. Voir la constante RESERVED_GEMINI_KEY_INDEXES.
//
// SÉCURITÉ
// --------
// Les clés côté client (VITE_*) sont exposées dans le bundle. En production,
// il est FORTEMENT recommandé de générer les tokens LiveKit et de proxy-er
// les appels Gemini via un backend (Firebase Function) — voir buildLiveKit
// TokenEndpoint plus bas.
// ============================================================================

const env = (key) =>
  typeof import.meta !== "undefined" ? import.meta.env?.[key] : undefined;

const clean = (v) => String(v || "").trim().replace(/^['"]|['"]$/g, "");

/**
 * Indexes de clés Gemini (1-based, cohérent avec VITE_GEMINI_API_KEY_N)
 * réservées à LiveKit. À exclure du pool de geminiClient.js.
 */
export const RESERVED_GEMINI_KEY_INDEXES = Object.freeze([8, 9, 10]);

/** Retourne les 3 clés Gemini réservées à LiveKit (peut contenir des undefined). */
export function getLiveKitGeminiKeys() {
  const pick = (dedicated, fallback) =>
    clean(env(dedicated)) || clean(env(fallback)) || null;

  return [
    pick("VITE_GEMINI_API_KEY_LIVEKIT_1", "VITE_GEMINI_API_KEY_8"),
    pick("VITE_GEMINI_API_KEY_LIVEKIT_2", "VITE_GEMINI_API_KEY_9"),
    pick("VITE_GEMINI_API_KEY_LIVEKIT_3", "VITE_GEMINI_API_KEY_10"),
  ];
}

/** True si au moins une clé Gemini réservée LiveKit est configurée. */
export function hasLiveKitGeminiKey() {
  return getLiveKitGeminiKeys().some(Boolean);
}

/**
 * Rotation ronde entre les 3 clés Gemini réservées LiveKit.
 * Utile côté agent worker (Node) ou pour signer les prompts.
 */
let _lkKeyCursor = 0;
export function nextLiveKitGeminiKey() {
  const keys = getLiveKitGeminiKeys().filter(Boolean);
  if (keys.length === 0) return null;
  const k = keys[_lkKeyCursor % keys.length];
  _lkKeyCursor = (_lkKeyCursor + 1) % keys.length;
  return k;
}

// ── Configuration LiveKit ───────────────────────────────────────────────────

export const LIVEKIT_CONFIG = Object.freeze({
  /** URL du serveur LiveKit (wss://...). Requis côté client. */
  url: clean(env("VITE_LIVEKIT_URL")) || "",
  /**
   * Endpoint HTTP côté backend qui délivre un access token LiveKit
   * signé pour l'utilisateur courant. Exemple : "/api/livekit/token".
   */
  tokenEndpoint: clean(env("VITE_LIVEKIT_TOKEN_ENDPOINT")) || "/api/livekit/token",
  /** Nom du modèle Gemini utilisé par l'agent LiveKit. */
  geminiModel: clean(env("VITE_LIVEKIT_GEMINI_MODEL")) || "gemini-2.0-flash",
});

/** True si LiveKit est configuré côté client. */
export function isLiveKitConfigured() {
  return Boolean(LIVEKIT_CONFIG.url);
}

/**
 * Demande un access token LiveKit au backend.
 * @param {{ roomName: string, identity: string, metadata?: object }} opts
 * @returns {Promise<string>} JWT LiveKit
 */
export async function fetchLiveKitToken({ roomName, identity, metadata } = {}) {
  if (!roomName || !identity) {
    throw new Error("fetchLiveKitToken: roomName et identity requis.");
  }
  const res = await fetch(LIVEKIT_CONFIG.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName, identity, metadata }),
  });
  if (!res.ok) {
    throw new Error(`LiveKit token endpoint HTTP ${res.status}`);
  }
  const { token } = await res.json();
  if (!token) throw new Error("LiveKit token manquant dans la réponse.");
  return token;
}

// ── Diagnostic (dev only) ───────────────────────────────────────────────────
if (typeof window !== "undefined" && env("DEV")) {
  const keys = getLiveKitGeminiKeys();
  const configured = keys.filter(Boolean).length;
  console.info(
    `[livekitConfig] LiveKit URL=${LIVEKIT_CONFIG.url ? "✓" : "✗"} | ` +
    `Gemini keys réservées: ${configured}/3 | ` +
    `Model: ${LIVEKIT_CONFIG.geminiModel}`
  );
}
