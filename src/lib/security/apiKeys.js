// src/lib/security/apiKeys.js
// ════════════════════════════════════════════════════════════════════════════
// Résolution centralisée des clés d'API.
// ════════════════════════════════════════════════════════════════════════════
// Un seul point d'entrée pour tout le code qui a besoin d'une clé, avec cet
// ordre de priorité :
//
//   1. le coffre chiffré (déverrouillé)          → source recommandée
//   2. import.meta.env                            → héritage, développement
//   3. localStorage en clair                      → héritage, déconseillé
//
// Aucun module métier ne doit lire `import.meta.env` directement : en passant
// par ici, migrer vers un relais serveur plus tard ne touchera qu'un fichier.

import { getSecret, getVaultStatus } from "./secureVault.js";

const envValue = (name) => {
  try {
    return (
      (typeof import.meta !== "undefined" && import.meta.env?.[name]) ||
      (typeof process !== "undefined" && process.env?.[name]) ||
      ""
    );
  } catch {
    return "";
  }
};

const legacyLocal = (name) => {
  try {
    return globalThis.localStorage?.getItem(name) || "";
  } catch {
    return "";
  }
};

/** Récupère une clé par son nom (ex. "VITE_GROQ_API_KEY"). */
export function resolveKey(name) {
  if (!name) return "";
  const fromVault = getSecret(name);
  if (fromVault) return fromVault;
  const fromEnv = envValue(name);
  if (fromEnv) return fromEnv;
  return legacyLocal(name) || legacyLocal(name.replace(/^VITE_/, ""));
}

/** Première clé non vide parmi plusieurs noms. */
export function resolveFirst(names = []) {
  for (const name of names) {
    const value = resolveKey(name);
    if (value) return value;
  }
  return "";
}

/** Toutes les clés non vides pour une liste de noms (rotation multi-clés). */
export function resolveAll(names = []) {
  return names.map(resolveKey).filter(Boolean);
}

/**
 * Diagnostic pour l'interface : quels fournisseurs sont utilisables, et par
 * quelle voie. Ne renvoie jamais la valeur d'une clé.
 */
export function keyDiagnostics(providers = {}) {
  const vault = getVaultStatus();
  const rows = Object.entries(providers).map(([provider, names]) => {
    const vaultCount = names.filter((n) => getSecret(n)).length;
    const envCount = names.filter((n) => !getSecret(n) && envValue(n)).length;
    return {
      provider,
      available: vaultCount + envCount,
      inVault: vaultCount,
      inBundle: envCount,
      exposed: envCount > 0,
    };
  });
  return {
    vault,
    providers: rows,
    exposedProviders: rows.filter((r) => r.exposed).map((r) => r.provider),
  };
}

/** Noms de clés reconnus, pour l'écran de configuration du coffre. */
export const KNOWN_KEY_NAMES = Object.freeze({
  cerebras: ["VITE_CEREBRAS_API_KEY", "VITE_CEREBRAS_API_KEY_1", "VITE_CEREBRAS_API_KEY_2", "VITE_CEREBRAS_API_KEY_3", "VITE_CEREBRAS_API_KEY_4", "VITE_CEREBRAS_API_KEY_5", "VITE_CEREBRAS_API_KEY_6", "VITE_CEREBRAS_API_KEY_7", "VITE_CEREBRAS_API_KEY_8"],
  groq: ["VITE_GROQ_API_KEY", "VITE_GROQ_API_KEY_2", "VITE_GROQ_API_KEY_5", "VITE_GROQ_API_KEY_6", "VITE_GROQ_API_KEY_7"],
  mistral: ["VITE_MISTRAL_API_KEY_1", "VITE_MISTRAL_API_KEY_2", "VITE_MISTRAL_API_KEY_3", "VITE_MISTRAL_API_KEY_4", "VITE_MISTRAL_API_KEY_5", "VITE_MISTRAL_API_KEY_6", "VITE_MISTRAL_API_KEY_7"],
  openrouter: ["VITE_OPENROUTER_API_KEY", "VITE_OPENROUTER_API_KEY_1", "VITE_OPENROUTER_API_KEY_2", "VITE_OPENROUTER_API_KEY_3", "VITE_OPENROUTER_API_KEY_4", "VITE_OPENROUTER_API_KEY_5", "VITE_OPENROUTER_API_KEY_6", "VITE_OPENROUTER_API_KEY_7"],
  fireworks: ["VITE_FIREWORKS_API_KEY"],
  cohere: ["VITE_COHERE_API_KEY", "VITE_COHERE_API_KEY_1", "VITE_COHERE_API_KEY_2", "VITE_COHERE_API_KEY_3", "VITE_COHERE_API_KEY_4", "VITE_COHERE_API_KEY_5", "VITE_COHERE_API_KEY_6"],
  sambanova: ["VITE_SAMBANOVA_API_KEY", "VITE_SAMBANOVA_API_KEY_1", "VITE_SAMBANOVA_API_KEY_2", "VITE_SAMBANOVA_API_KEY_3", "VITE_SAMBANOVA_API_KEY_4", "VITE_SAMBANOVA_API_KEY_5"],
  aimlapi: ["VITE_AIML_API_KEY", "VITE_AIMLAPI_API_KEY"],
  deepseek: ["VITE_DEEPSEEK_API_KEY"],
  cloudflare: ["VITE_CLOUDFLARE_API_TOKEN"],
  gemini: ["VITE_GEMINI_API_KEY", "VITE_GEMINI_API_KEY_1", "VITE_GEMINI_API_KEY_2", "VITE_GEMINI_API_KEY_3", "VITE_GEMINI_API_KEY_4", "VITE_GEMINI_API_KEY_5", "VITE_GEMINI_API_KEY_6"],
  elevenlabs: ["VITE_ELEVENLABS_API_KEY", "VITE_ELEVENLABS_API_KEY_1", "VITE_ELEVENLABS_API_KEY_2", "VITE_ELEVENLABS_API_KEY_3", "VITE_ELEVENLABS_API_KEY_4"],
});
