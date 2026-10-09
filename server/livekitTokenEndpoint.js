// ============================================================================
// livekitTokenEndpoint.js — Délivrance SERVEUR des tokens LiveKit (à déployer)
// ============================================================================
// À exécuter côté serveur uniquement (Firebase Functions, Cloud Run, Express…).
// Le client appelle cet endpoint via VITE_LIVEKIT_TOKEN_ENDPOINT.
//
// Variables d'environnement SERVEUR (jamais préfixées VITE_) :
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_AGENT_NAME
//
// Ce que fait ce fichier, et que le navigateur ne peut pas faire :
//   • garde la clé secrète LiveKit hors du bundle,
//   • authentifie l'utilisateur avant de délivrer un token,
//   • limite le débit (anti-abus / anti-explosion de facture),
//   • borne la durée de vie du token et les droits accordés,
//   • nettoie les consignes envoyées à l'agent (anti prompt-injection).
//
// Dépendance : `npm i livekit-server-sdk`
// ============================================================================

import { AccessToken, RoomConfiguration, RoomAgentDispatch } from "livekit-server-sdk";

const TTL_SECONDS = 15 * 60;
const MAX_INSTRUCTIONS_CHARS = 6000;
const RATE_LIMIT = { windowMs: 60_000, maxPerUser: 6 };

const buckets = new Map();

function rateLimited(userId) {
  const now = Date.now();
  const entry = buckets.get(userId) || { count: 0, reset: now + RATE_LIMIT.windowMs };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + RATE_LIMIT.windowMs;
  }
  entry.count += 1;
  buckets.set(userId, entry);
  return entry.count > RATE_LIMIT.maxPerUser;
}

function sanitizeInstructions(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/ignore (all|any|the) (previous|prior|above) (instructions|prompts?)/gi, "[filtered]")
    .replace(/<\/?(system|assistant|user)>/gi, "[filtered]")
    .trim()
    .slice(0, MAX_INSTRUCTIONS_CHARS);
}

/**
 * @param {{ userId: string, roomName?: string, identity?: string, metadata?: string }} input
 * @returns {Promise<{ token: string, roomName: string, expiresIn: number }>}
 */
export async function issueLiveKitToken({ userId, roomName, identity, metadata }) {
  if (!userId) throw Object.assign(new Error("Utilisateur non authentifié"), { status: 401 });
  if (rateLimited(userId)) throw Object.assign(new Error("Trop de sessions demandées"), { status: 429 });

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) throw Object.assign(new Error("LiveKit non configuré"), { status: 500 });

  // Le serveur décide de la room et de l'identité : le client ne peut pas
  // rejoindre la session d'un autre utilisateur en devinant un nom de room.
  const safeRoom = `nova-${userId}-${Date.now().toString(36)}`;
  const safeIdentity = String(identity || userId).replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 48) || userId;

  let parsed = {};
  try { parsed = JSON.parse(metadata || "{}"); } catch { parsed = {}; }
  const safeMetadata = JSON.stringify({
    instructions: sanitizeInstructions(parsed.instructions),
    studentName: String(parsed.studentName || "").slice(0, 32) || null,
    level: String(parsed.level || "").slice(0, 8) || null,
    userId,
  });

  const at = new AccessToken(apiKey, apiSecret, {
    identity: safeIdentity,
    ttl: TTL_SECONDS,
    metadata: safeMetadata,
  });
  at.addGrant({
    roomJoin: true,
    room: roomName ? safeRoom : safeRoom,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
    roomCreate: true,
    roomAdmin: false,
    roomList: false,
    roomRecord: false,
  });
  // Dispatch EXPLICITE de l'agent : le worker est enregistré avec un
  // agent_name, donc LiveKit ne l'envoie PAS automatiquement dans la room.
  // On utilise les classes officielles du SDK (et pas un objet brut) pour
  // que le claim soit sérialisé exactement comme le serveur l'attend.
  at.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: process.env.LIVEKIT_AGENT_NAME || "assistant-53a",
        metadata: safeMetadata,
      }),
    ],
  });

  return { token: await at.toJwt(), roomName: safeRoom, expiresIn: TTL_SECONDS };
}

/** Handler Express/Firebase : POST /api/livekit/token */
export function livekitTokenHandler(getUserId) {
  return async (req, res) => {
    try {
      const userId = await getUserId(req); // ex. vérifier le Firebase ID token
      const out = await issueLiveKitToken({ userId, ...(req.body || {}) });
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(out);
    } catch (err) {
      res.status(err?.status || 500).json({ error: err?.message || "Erreur serveur" });
    }
  };
}
