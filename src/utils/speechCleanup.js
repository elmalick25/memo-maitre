// ─────────────────────────────────────────────────────────────────────────────
// speechCleanup.js — Nettoyage des transcriptions vocales avant envoi à l'IA
// Supprime les hésitations / disfluences FR + EN ("euh", "hum", "huh", "uh", …)
// et les répétitions de mots, sans altérer le sens.
// ─────────────────────────────────────────────────────────────────────────────

// Mots de remplissage isolés (entourés d'espaces / ponctuation / début / fin)
const FILLER_WORDS = [
  // Français
  "euh", "euhh", "euheu", "heu", "heuu", "hein", "ben", "bah", "baah",
  "hum", "humm", "mmh", "mmmh", "mh", "mhm",
  // Anglais
  "uh", "uhh", "uhm", "um", "umm", "umh",
  "huh", "huhh", "hmm", "hmmm", "mm", "mmm",
  "er", "err", "errr", "ah", "ahh", "eh", "ehh",
  "like", // utilisé comme filler ("you know, like, ...") — on garde si entre virgules seulement
];

// Marqueurs discursifs / faux-départs typiques (FR)
const DISCOURSE_MARKERS_FR = [
  "tu vois", "tu sais", "voilà quoi", "bon ben", "enfin bref",
  "comment dire", "j'sais pas", "j'sais plus",
];

// Marqueurs discursifs (EN) — uniquement quand isolés par virgules
const DISCOURSE_MARKERS_EN = [
  "you know", "i mean", "you see", "kind of", "sort of",
];

/**
 * Nettoie une transcription vocale en supprimant fillers et répétitions.
 * @param {string} raw  Transcription brute
 * @param {object} [opts]
 * @param {boolean} [opts.stripDiscourse=true]  Supprimer aussi les marqueurs discursifs
 * @returns {string} Transcription nettoyée
 */
export function cleanSpeechTranscript(raw, opts = {}) {
  if (!raw || typeof raw !== "string") return "";
  const { stripDiscourse = true } = opts;

  let s = raw;

  // 1) Marqueurs discursifs (avant la suppression des fillers pour matcher les multi-mots)
  if (stripDiscourse) {
    for (const m of [...DISCOURSE_MARKERS_FR, ...DISCOURSE_MARKERS_EN]) {
      const re = new RegExp(`(^|[\\s,;.!?])${escapeRegex(m)}(?=[\\s,;.!?]|$)`, "gi");
      s = s.replace(re, "$1");
    }
  }

  // 2) Mots de remplissage isolés
  for (const w of FILLER_WORDS) {
    const re = new RegExp(`(^|[\\s,;.!?])${escapeRegex(w)}(?=[\\s,;.!?]|$)`, "gi");
    s = s.replace(re, "$1");
  }

  // 3) Répétitions immédiates ("le le chat", "the the cat")
  s = s.replace(/\b(\p{L}+)(\s+\1\b)+/giu, "$1");

  // 4) Faux-départs avec tiret/ellipse ("je— je pense", "I... I think", "can pro- can have")
  s = s.replace(/\b(\p{L}+)[\s]*[—–-…]{1,3}[\s]*\1\b/giu, "$1");
  // 4 bis) Mot tronqué suivi du mot complet ("pro- produce", "déve- développe")
  s = s.replace(/\b(\p{L}{2,})[—–-]\s+(\p{L}*\1\p{L}*|\1\p{L}+)\b/giu, "$2");

  // 4 ter) Répétitions de groupes de mots séparés par des virgules / espaces
  //        ("how to, how to, how to sell" → "how to sell", "I think, I think" → "I think")
  s = s.replace(/\b((?:\p{L}+)(?:[\s]+\p{L}+){0,3})\b(?:\s*[,;]?\s+\1\b)+/giu, "$1");

  // 5) Ponctuation orpheline / espaces multiples
  s = s.replace(/\s+([,;.!?])/g, "$1");
  s = s.replace(/([,;])\s*([,;.!?])/g, "$2");
  s = s.replace(/\s{2,}/g, " ").trim();

  // 6) Virgules en début / doubles ponctuations
  s = s.replace(/^[\s,;.]+/, "").replace(/[\s,;]+$/, "");

  return s;
}

/**
 * Retourne true si la transcription nettoyée est probablement du bruit
 * (trop courte, que des fillers, etc.) → l'IA ne doit PAS générer de fiche.
 */
export function isMeaninglessSpeech(raw) {
  const cleaned = cleanSpeechTranscript(raw);
  if (cleaned.length < 4) return true;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2) return true;
  return false;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Set des fillers/onomatopées pour détection rapide d'un "front" parasite
const FILLER_SET = new Set([...FILLER_WORDS, "in", "ok", "okay", "yeah", "yep", "nope", "oui", "non", "ya", "na"]);

/**
 * Retourne true si le "front" d'une carte ressemble à du bruit
 * (trop court, vide après nettoyage, ou uniquement des fillers/répétitions).
 * Utilisé comme garde-fou CÔTÉ CLIENT avant de sauvegarder une fiche générée par l'IA.
 * @param {string} front  Recto de la carte
 * @returns {boolean}
 */
export function isNoiseCardFront(front) {
  if (!front || typeof front !== "string") return true;
  const raw = front.trim();
  if (raw.length < 3) return true;

  // Nettoyage des fillers/répétitions/faux-départs
  const cleaned = cleanSpeechTranscript(raw, { stripDiscourse: true });
  if (cleaned.replace(/[^\p{L}\p{N}]/gu, "").length < 3) return true;

  // Tokens utiles (lettres/chiffres uniquement)
  const tokens = cleaned
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (tokens.length === 0) return true;

  // Si tous les tokens sont des fillers → bruit
  const meaningful = tokens.filter((t) => !FILLER_SET.has(t));
  if (meaningful.length === 0) return true;

  // Si le front n'est qu'un seul mot répété ("in in in", "huh huh") → bruit
  const unique = new Set(tokens);
  if (unique.size === 1 && tokens.length > 1 && FILLER_SET.has(tokens[0])) return true;

  return false;
}

// Bloc d'instruction réutilisable à insérer dans les prompts AI de génération
// de fiches depuis du contenu vocal/dicté.
export const SPEECH_HYGIENE_PROMPT = `
RÈGLES DE QUALITÉ (contenu issu de dictée vocale) :
- Ignore les hésitations, onomatopées et fillers ("euh", "hum", "huh", "uh", "um", "hmm", "ben", "bah", "tu vois", "you know", "I mean", …).
- Ignore les répétitions ("le le", "the the") et les faux-départs.
- Ne fabrique JAMAIS une fiche à partir d'un fragment vide de sens : si une phrase n'apporte aucune connaissance concrète, saute-la.
- Si l'ensemble du contenu est trop vague ou ne contient aucune information mémorisable, renvoie un tableau "cards" vide (et explique-le brièvement dans "message" si applicable).
- Conserve uniquement les concepts, mots, règles ou exemples réellement formulés.
`.trim();
