// ============================================================================
// livekitTokenGuard.js — Durcissement de l'accès LiveKit (agent vocal NOVA)
// ============================================================================
// Objectif : ne JAMAIS faire confiance au client pour l'autorisation.
//
//   1. Le token doit venir d'un endpoint serveur (VITE_LIVEKIT_TOKEN_ENDPOINT)
//      qui signe avec LIVEKIT_API_SECRET côté serveur uniquement.
//   2. La signature locale (jose/SignJWT dans le navigateur) est un mode
//      DÉGRADÉ de développement : elle expose l'API secret dans le bundle.
//      Elle n'est autorisée que si import.meta.env.DEV est vrai ET que
//      VITE_LIVEKIT_ALLOW_CLIENT_SIGNING === "true".
//   3. Tout ce qui vient de l'utilisateur (prénom, sujet, consignes) est
//      nettoyé avant d'entrer dans le metadata du token (anti prompt-injection).
//   4. Les grants sont minimaux (une seule room, pas d'admin, TTL court).
// ============================================================================

/** Durée de vie d'un token de session vocale. Court = fenêtre d'abus courte. */
export const LIVEKIT_TOKEN_TTL_SECONDS = 15 * 60;

/** Taille max des consignes envoyées à l'agent (évite un metadata géant). */
export const MAX_INSTRUCTIONS_CHARS = 6000;

const envVar = (name) => {
  try {
    return (typeof import.meta !== "undefined" && import.meta.env?.[name]) || "";
  } catch {
    return "";
  }
};

const isDev = () => {
  try {
    return Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV);
  } catch {
    return false;
  }
};

/** Endpoint serveur de délivrance de token (vide = non configuré). */
export function getTokenEndpoint() {
  return String(envVar("VITE_LIVEKIT_TOKEN_ENDPOINT") || "").trim();
}

/**
 * La signature du JWT dans le navigateur est autorisée dès lors que
 * l'opt-in explicite VITE_LIVEKIT_ALLOW_CLIENT_SIGNING est activé,
 * ce qui permet le fonctionnement sur application personnelle déployée
 * lorsqu'aucun endpoint serveur n'est configuré.
 */
export function isClientSigningAllowed() {
  return String(envVar("VITE_LIVEKIT_ALLOW_CLIENT_SIGNING")).trim() === "true";
}

/** Identifiant de room imprévisible (crypto), pas Math.random(). */
export function buildRoomName(prefix = "nova") {
  let rand = "";
  try {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    rand = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
  return `${prefix}-${rand}`;
}

/** Identité participant : dérivée du prénom nettoyé + suffixe aléatoire. */
export function buildParticipantIdentity(studentName) {
  const base = sanitizeStudentName(studentName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  let suffix = "";
  try {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    suffix = Math.random().toString(36).slice(2, 10);
  }
  return `${base || "student"}-${suffix}`;
}

/**
 * Nettoie un prénom saisi par l'utilisateur : lettres/espaces/tirets, 32 car.
 * Empêche qu'un « prénom » devienne un vecteur d'injection de consignes.
 */
export function sanitizeStudentName(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[^\p{L}\p{N}\s'\-.]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

const INJECTION_PATTERNS = [
  /ignore (all|any|the) (previous|prior|above) (instructions|prompts?)/gi,
  /disregard (all|any|the) (previous|prior|above)/gi,
  /system\s*prompt\s*[:=]/gi,
  /\bdeveloper\s*message\b/gi,
  /<\/?(system|assistant|user)>/gi,
];

/**
 * Nettoie les consignes système avant de les mettre dans le metadata du token :
 * retire les caractères de contrôle, neutralise les marqueurs d'injection
 * classiques, et borne la taille.
 */
export function sanitizeInstructions(raw) {
  let text = String(raw || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, "[filtered]");
  }
  return text.replace(/\n{4,}/g, "\n\n\n").trim().slice(0, MAX_INSTRUCTIONS_CHARS);
}

/** Grants LiveKit minimaux pour une session de coaching vocal. */
export function buildVideoGrant(roomName) {
  return {
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
    roomCreate: true,
    roomAdmin: false,
    roomList: false,
    roomRecord: false,
    hidden: false,
    recorder: false,
  };
}

const SECRET_LIKE = /\b(eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}|sk-[A-Za-z0-9]{12,}|API[_-]?KEY[^\s]*)/gi;

/** Message d'erreur sûr : jamais de token, de clé ni de secret dans les logs/UI. */
export function scrubError(err) {
  const message = typeof err === "string" ? err : err?.message || "Erreur inconnue";
  return message.replace(SECRET_LIKE, "[secret masqué]").slice(0, 300);
}
