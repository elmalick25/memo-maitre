// src/lib/security/secureVault.js
// ════════════════════════════════════════════════════════════════════════════
// Coffre-fort chiffré côté navigateur pour les clés d'API.
// ════════════════════════════════════════════════════════════════════════════
// Problème résolu : jusqu'ici les clés vivaient dans `import.meta.env`, donc en
// clair dans le bundle JavaScript — n'importe qui ouvrant les outils de
// développement (ou récupérant le site publié) pouvait les lire et les
// consommer.
//
// Ici, les clés sont chiffrées avec AES-GCM 256 bits. Deux modes :
//
//  1. PASSPHRASE — la clé de chiffrement est dérivée d'une phrase secrète par
//     PBKDF2-SHA-256 (600 000 itérations, sel aléatoire de 16 octets). Rien de
//     déchiffrable n'est stocké : sans la phrase, le contenu est inexploitable.
//
//  2. APPAREIL — la clé AES est générée dans le navigateur en mode NON
//     EXTRACTIBLE et conservée dans IndexedDB. Le navigateur accepte de
//     chiffrer/déchiffrer avec, mais refuse d'en exporter la valeur : copier
//     le localStorage ne suffit plus, et aucun script tiers ne peut exfiltrer
//     la clé elle-même.
//
// Limite honnête, à connaître : dans une application 100 % navigateur, une clé
// utilisable par l'app est utilisable par du code exécuté dans la page. Le
// coffre supprime l'exposition passive (bundle, sauvegardes, capture d'écran
// du localStorage) et impose un déverrouillage explicite ; il ne remplace pas
// un relais serveur si les clés deviennent critiques.
// ════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "mm_secure_vault_v1";
const DB_NAME = "mm-secure-vault";
const DB_STORE = "keys";
const DEVICE_KEY_ID = "device-master-key";
const PBKDF2_ITERATIONS = 600_000;

const subtle = () => globalThis.crypto?.subtle;
export const isVaultSupported = () => Boolean(subtle() && globalThis.indexedDB);

// ── Utilitaires binaires ───────────────────────────────────────────────────
const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ── IndexedDB minimal (clé d'appareil non extractible) ─────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** Récupère (ou crée) la clé AES d'appareil, non extractible. */
export async function getDeviceKey({ create = true } = {}) {
  const existing = await idbGet(DEVICE_KEY_ID);
  if (existing) return existing;
  if (!create) return null;
  const key = await subtle().generateKey({ name: "AES-GCM", length: 256 }, /* extractable */ false, [
    "encrypt",
    "decrypt",
  ]);
  await idbSet(DEVICE_KEY_ID, key);
  return key;
}

// ── Dérivation depuis une phrase secrète ───────────────────────────────────
export async function deriveKeyFromPassphrase(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await subtle().importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Chiffrement / déchiffrement ────────────────────────────────────────────
async function encryptJSON(key, data) {
  const iv = randomBytes(12);
  const cipher = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  return { iv: toBase64(iv), payload: toBase64(cipher) };
}

async function decryptJSON(key, { iv, payload }) {
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(payload));
  return JSON.parse(dec.decode(plain));
}

// ── État du coffre ─────────────────────────────────────────────────────────
function readEnvelope() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeEnvelope(envelope) {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

/** Le coffre existe-t-il déjà sur cet appareil ? */
export function vaultExists() {
  return Boolean(readEnvelope());
}

/** Mode du coffre existant : 'passphrase' | 'device' | null. */
export function vaultMode() {
  return readEnvelope()?.mode || null;
}

// Les secrets déchiffrés ne vivent qu'en mémoire, jamais sur disque.
let unlockedSecrets = null;
let unlockedKey = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn(getVaultStatus());
    } catch {
      /* un abonné défaillant ne doit pas casser les autres */
    }
  }
}

export function onVaultChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getVaultStatus() {
  return {
    supported: isVaultSupported(),
    exists: vaultExists(),
    mode: vaultMode(),
    unlocked: unlockedSecrets !== null,
    keyCount: unlockedSecrets ? Object.keys(unlockedSecrets).length : 0,
  };
}

/**
 * Crée le coffre.
 * @param {Object} secrets    { VITE_GROQ_API_KEY: "...", ... }
 * @param {Object} opts       { mode: 'device'|'passphrase', passphrase }
 */
export async function createVault(secrets, { mode = "device", passphrase = "" } = {}) {
  if (!isVaultSupported()) throw new Error("Chiffrement indisponible sur ce navigateur.");

  let key;
  let envelope = { version: 1, mode, createdAt: new Date().toISOString() };

  if (mode === "passphrase") {
    if (!passphrase || passphrase.length < 8) throw new Error("Phrase secrète trop courte (8 caractères minimum).");
    const salt = randomBytes(16);
    key = await deriveKeyFromPassphrase(passphrase, salt);
    envelope.salt = toBase64(salt);
    envelope.iterations = PBKDF2_ITERATIONS;
  } else {
    key = await getDeviceKey();
  }

  const sealed = await encryptJSON(key, secrets);
  envelope = { ...envelope, ...sealed };
  writeEnvelope(envelope);

  unlockedKey = key;
  unlockedSecrets = { ...secrets };
  notify();
  return getVaultStatus();
}

/** Déverrouille le coffre. Renvoie true si les secrets sont disponibles. */
export async function unlockVault({ passphrase = "" } = {}) {
  const envelope = readEnvelope();
  if (!envelope) return false;

  let key;
  if (envelope.mode === "passphrase") {
    if (!passphrase) return false;
    key = await deriveKeyFromPassphrase(passphrase, fromBase64(envelope.salt), envelope.iterations || PBKDF2_ITERATIONS);
  } else {
    key = await getDeviceKey({ create: false });
    if (!key) return false;
  }

  try {
    unlockedSecrets = await decryptJSON(key, envelope);
    unlockedKey = key;
    notify();
    return true;
  } catch {
    // AES-GCM échoue à l'authentification : mauvaise phrase ou données altérées.
    unlockedSecrets = null;
    unlockedKey = null;
    notify();
    return false;
  }
}

/** Oublie les secrets en mémoire (le coffre chiffré reste sur l'appareil). */
export function lockVault() {
  unlockedSecrets = null;
  unlockedKey = null;
  notify();
}

/** Ajoute ou remplace des clés dans un coffre déverrouillé. */
export async function updateSecrets(patch) {
  if (unlockedSecrets === null || !unlockedKey) throw new Error("Coffre verrouillé.");
  const next = { ...unlockedSecrets };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") delete next[k];
    else next[k] = String(v);
  }
  const envelope = readEnvelope() || {};
  const sealed = await encryptJSON(unlockedKey, next);
  writeEnvelope({ ...envelope, ...sealed, updatedAt: new Date().toISOString() });
  unlockedSecrets = next;
  notify();
  return getVaultStatus();
}

/** Lecture d'un secret déverrouillé. Renvoie "" si absent ou verrouillé. */
export function getSecret(name) {
  if (!unlockedSecrets) return "";
  return unlockedSecrets[name] || "";
}

/** Noms des secrets présents (jamais les valeurs). */
export function listSecretNames() {
  return unlockedSecrets ? Object.keys(unlockedSecrets).sort() : [];
}

/** Détruit complètement le coffre et la clé d'appareil. */
export async function destroyVault() {
  lockVault();
  globalThis.localStorage?.removeItem(STORAGE_KEY);
  try {
    await idbDelete(DEVICE_KEY_ID);
  } catch {
    /* rien à supprimer */
  }
  notify();
  return getVaultStatus();
}

/** Change le mode ou la phrase secrète sans perdre les clés. */
export async function rekeyVault({ mode, passphrase = "" }) {
  if (unlockedSecrets === null) throw new Error("Déverrouillez le coffre avant de le re-chiffrer.");
  const secrets = { ...unlockedSecrets };
  await destroyVault();
  return createVault(secrets, { mode, passphrase });
}

/** Export chiffré (sauvegarde). Le fichier produit est inutilisable sans la phrase. */
export function exportEncryptedBackup() {
  const envelope = readEnvelope();
  if (!envelope) throw new Error("Aucun coffre à exporter.");
  if (envelope.mode !== "passphrase") {
    throw new Error("Seul le mode phrase secrète peut être exporté : la clé d'appareil ne quitte pas ce navigateur.");
  }
  return JSON.stringify(envelope, null, 2);
}

/** Import d'une sauvegarde chiffrée produite par exportEncryptedBackup(). */
export async function importEncryptedBackup(json, passphrase) {
  const envelope = typeof json === "string" ? JSON.parse(json) : json;
  if (!envelope?.payload || !envelope?.iv || envelope.mode !== "passphrase") {
    throw new Error("Sauvegarde invalide.");
  }
  writeEnvelope(envelope);
  const ok = await unlockVault({ passphrase });
  if (!ok) {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
    throw new Error("Phrase secrète incorrecte : sauvegarde non importée.");
  }
  return getVaultStatus();
}
