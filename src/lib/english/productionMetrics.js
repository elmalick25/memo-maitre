// src/lib/english/productionMetrics.js
// ════════════════════════════════════════════════════════════════════════════
// Mesures déterministes d'une production écrite ou orale.
// ════════════════════════════════════════════════════════════════════════════
// Ce que ce module remplace : jusqu'ici, TOUTES les mesures de niveau étaient
// demandées à un LLM ("compte les mots, estime la richesse lexicale, donne le
// taux de subordination"). Un LLM ne compte pas, il estime — et son estimation
// varie de 30 % d'un appel à l'autre pour le même texte. Sur ces bases, aucune
// progression n'est mesurable : le bruit dépasse le signal.
//
// Ici, tout ce qui est comptable est compté :
//   • longueur, débit (mots/minute), longueur moyenne d'énoncé ;
//   • richesse lexicale via les bandes de fréquence (wordFrequency.js) ;
//   • taux de subordination, densité de connecteurs, variété syntaxique ;
//   • hésitations et auto-corrections à l'oral (marqueurs de fluidité) ;
//   • calques du français détectables par motifs.
//
// Le LLM ne sert plus qu'à ce qu'il fait bien : reconnaître une erreur et la
// nommer. Voir `feedbackPrompts.js`.
// ════════════════════════════════════════════════════════════════════════════

import { lexicalProfile, tokenize, lemmatize } from "./wordFrequency.js";

/** Subordonnants et relatifs : marqueurs de complexité syntaxique. */
const SUBORDINATORS = new Set([
  "that", "which", "who", "whom", "whose", "where", "when", "while", "because",
  "since", "although", "though", "unless", "until", "if", "whether", "as",
  "before", "after", "whereas", "wherever", "whenever", "whoever", "whatever",
  "so", "once", "provided", "given", "despite", "albeit",
]);

/** Connecteurs logiques : marqueurs de structuration du discours. */
const CONNECTORS = new Set([
  "however", "therefore", "moreover", "furthermore", "nevertheless", "nonetheless",
  "consequently", "meanwhile", "otherwise", "besides", "instead", "indeed",
  "thus", "hence", "accordingly", "likewise", "conversely", "similarly",
  "firstly", "secondly", "finally", "overall", "additionally", "specifically",
  "notably", "arguably", "admittedly", "regardless", "whereas", "although",
]);

/** Atténuateurs académiques : marqueurs C1+. */
const HEDGES = new Set([
  "might", "may", "could", "arguably", "presumably", "seemingly", "apparently",
  "somewhat", "relatively", "largely", "tend", "tends", "tended", "suggest",
  "suggests", "appear", "appears", "likely", "unlikely", "possibly", "perhaps",
  "generally", "typically", "broadly", "roughly",
]);

/** Hésitations orales (telles que Whisper les transcrit habituellement). */
const FILLERS = /\b(?:uh+|um+|er+|ehm+|hmm+|mmh+|euh+|like|you know|i mean|kind of|sort of|basically|actually)\b/gi;

/** Motifs de calque français fréquents chez un francophone avancé. */
const L1_TRANSFER_PATTERNS = [
  { re: /\bi am agree\b/i, type: "l1_transfer", note: "« je suis d'accord » → I agree" },
  { re: /\bhow to say\b.*\?/i, type: "l1_transfer", note: "« comment dire » → how do you say" },
  { re: /\bpeople is\b/i, type: "l1_transfer", note: "people est pluriel" },
  { re: /\binformations\b/i, type: "l1_transfer", note: "information est indénombrable" },
  { re: /\badvices\b/i, type: "l1_transfer", note: "advice est indénombrable" },
  { re: /\bactually\b/i, type: "l1_transfer", note: "« actuellement » ≠ actually (= en fait)" },
  { re: /\bi have \d+ years?\b/i, type: "l1_transfer", note: "« j'ai X ans » → I am X years old" },
  { re: /\bsince \d+ years?\b/i, type: "l1_transfer", note: "→ for X years" },
  { re: /\bexplain me\b/i, type: "preposition", note: "→ explain to me" },
  { re: /\bdiscuss about\b/i, type: "preposition", note: "discuss ne prend pas about" },
  { re: /\bdepend of\b/i, type: "preposition", note: "→ depend on" },
  { re: /\bin the same time\b/i, type: "preposition", note: "→ at the same time" },
  { re: /\bresponsible of\b/i, type: "preposition", note: "→ responsible for" },
  { re: /\bmore \w+er\b/i, type: "word_formation", note: "double comparatif" },
  { re: /\bi didn't \w+ed\b/i, type: "tense_backshift", note: "après did, base verbale" },
  { re: /\bi am living here since\b/i, type: "perfect_aspect", note: "→ I have been living here since" },
];

/** Découpe un texte en phrases, robuste aux abréviations courantes. */
export function splitSentences(text) {
  if (!text) return [];
  return String(text)
    .replace(/\b(?:mr|mrs|dr|st|vs|etc|e\.g|i\.e)\./gi, (m) => m.replace(".", "\u0001"))
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\u0001/g, ".").trim())
    .filter((s) => s.length > 0);
}

/**
 * Mesure complète d'une production. Aucun appel réseau, aucune IA.
 *
 * @param {string} text                le texte produit (ou la transcription)
 * @param {Object} opts
 * @param {number} [opts.durationSec]  durée de production (oral)
 * @param {'speaking'|'writing'|'shadowing'|'dictation'} [opts.activity]
 * @returns {Object} mesures + `evidence` prêt pour cefrModel.computeProfile
 */
export function measureProduction(text, opts = {}) {
  const { durationSec = 0, activity = "writing" } = opts;
  const raw = String(text || "");
  const lexical = lexicalProfile(raw);
  const sentences = splitSentences(raw);
  const tokens = tokenize(raw);
  const words = tokens.length;

  // ── Complexité syntaxique ───────────────────────────────────────────────
  let subordinateClauses = 0;
  let connectorCount = 0;
  let hedgeCount = 0;
  const lemmas = tokens.map(lemmatize);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (SUBORDINATORS.has(tok) && i > 0) subordinateClauses++;
    if (CONNECTORS.has(tok)) connectorCount++;
    if (HEDGES.has(tok) || HEDGES.has(lemmas[i])) hedgeCount++;
  }
  // Une phrase contient au moins une proposition principale.
  const totalClauses = Math.max(sentences.length, 1) + subordinateClauses;
  const subordinationRatio = +(subordinateClauses / totalClauses).toFixed(3);
  const meanUtteranceLength = sentences.length
    ? +(words / sentences.length).toFixed(1)
    : words;

  // Variété syntaxique : écart-type des longueurs de phrase (un texte de
  // phrases toutes identiques est monotone, même s'il est long).
  const lengths = sentences.map((s) => tokenize(s).length);
  const meanLen = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length
    ? lengths.reduce((a, b) => a + Math.pow(b - meanLen, 2), 0) / lengths.length
    : 0;
  const sentenceVariety = +Math.sqrt(variance).toFixed(2);

  // ── Fluidité orale ──────────────────────────────────────────────────────
  const fillerMatches = raw.match(FILLERS) || [];
  const fillerRatio = words ? +(fillerMatches.length / words).toFixed(3) : 0;
  // Auto-correction : répétition immédiate d'un même mot, ou reprise "I— I".
  let selfRepairs = 0;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === tokens[i - 1] && tokens[i].length > 1) selfRepairs++;
  }
  const wordsPerMinute = durationSec > 0 ? +((words / durationSec) * 60).toFixed(1) : null;

  // Débit net : les hésitations ne comptent pas comme de la parole utile.
  const effectiveWordsPerMinute =
    wordsPerMinute === null ? null : +(wordsPerMinute * (1 - Math.min(0.4, fillerRatio * 2))).toFixed(1);

  // ── Motifs d'erreurs détectables sans IA ────────────────────────────────
  const detected = [];
  for (const p of L1_TRANSFER_PATTERNS) {
    const m = raw.match(p.re);
    if (m) detected.push({ type: p.type, match: m[0], note: p.note });
  }
  if (fillerRatio > 0.06) {
    detected.push({ type: "filler", match: `${fillerMatches.length} hésitations`, note: "Débit haché" });
  }
  if (selfRepairs >= 3) {
    detected.push({ type: "self_repair", match: `${selfRepairs} reprises`, note: "Reprises trop fréquentes" });
  }
  if (words >= 60 && connectorCount === 0) {
    detected.push({ type: "connector", match: "aucun connecteur", note: "Idées juxtaposées sans liaison" });
  }

  return {
    activity,
    words,
    sentences: sentences.length,
    durationSec,
    wordsPerMinute,
    effectiveWordsPerMinute,
    meanUtteranceLength,
    subordinationRatio,
    subordinateClauses,
    sentenceVariety,
    connectorCount,
    connectorDensity: words ? +((connectorCount / words) * 100).toFixed(2) : 0,
    hedgeCount,
    hedgeDensity: words ? +((hedgeCount / words) * 100).toFixed(2) : 0,
    fillerCount: fillerMatches.length,
    fillerRatio,
    selfRepairs,
    ...lexical,
    detectedIssues: detected,
    detectedErrorTypes: [...new Set(detected.map((d) => d.type))],
  };
}

/**
 * Convertit une mesure en `Evidence` consommable par cefrModel.computeProfile.
 * Les champs mesurés localement remplacent ceux que le LLM devinait.
 *
 * @param {Object} metrics  sortie de measureProduction()
 * @param {Object} extra    { errors, errorTypes, pronunciationScore, listeningAccuracy, ... }
 */
export function metricsToEvidence(metrics, extra = {}) {
  if (!metrics || !(metrics.words > 0)) return null;
  const errorTypes = [
    ...new Set([...(metrics.detectedErrorTypes || []), ...(extra.errorTypes || [])]),
  ];
  return {
    date: extra.date || new Date().toISOString(),
    activity: extra.activity || metrics.activity || "writing",
    words: metrics.words,
    durationSec: metrics.durationSec || extra.durationSec || 0,
    errors: Number.isFinite(extra.errors) ? extra.errors : metrics.detectedIssues.length,
    errorTypes,
    distinctLemmas: metrics.distinctLemmas,
    rareWordRatio: metrics.rareWordRatio,
    meanUtteranceLength: metrics.meanUtteranceLength,
    subordinationRatio: metrics.subordinationRatio,
    ...(Number.isFinite(extra.pronunciationScore) ? { pronunciationScore: extra.pronunciationScore } : {}),
    ...(Number.isFinite(extra.listeningAccuracy) ? { listeningAccuracy: extra.listeningAccuracy } : {}),
    ...(Number.isFinite(extra.listeningSpeed) ? { listeningSpeed: extra.listeningSpeed } : {}),
    corrections: extra.corrections || [],
    upgrades: extra.upgrades || [],
    metrics,
  };
}

/**
 * Résumé lisible d'une production, à afficher directement à l'utilisateur.
 * Chaque ligne est une mesure, pas une opinion.
 */
export function summarizeMetrics(metrics) {
  if (!metrics) return [];
  const out = [
    { label: "Mots produits", value: metrics.words },
    { label: "Longueur moyenne de phrase", value: `${metrics.meanUtteranceLength} mots`, target: "B2 ≥ 14 · C1 ≥ 19" },
    { label: "Richesse lexicale (Guiraud)", value: metrics.guiraud, target: "B2 ≥ 6,5 · C1 ≥ 8" },
    { label: "Mots hors des 2 000 fréquents", value: `${Math.round(metrics.rareWordRatio * 100)} %`, target: "B2 ≥ 11 % · C1 ≥ 18 %" },
    { label: "Taux de subordination", value: `${Math.round(metrics.subordinationRatio * 100)} %`, target: "B2 ≥ 30 % · C1 ≥ 42 %" },
    { label: "Connecteurs logiques", value: metrics.connectorCount },
  ];
  if (metrics.wordsPerMinute !== null && metrics.wordsPerMinute !== undefined) {
    out.push({ label: "Débit", value: `${metrics.wordsPerMinute} mots/min`, target: "B2 ≥ 120 · C1 ≥ 150" });
    out.push({ label: "Débit net (hors hésitations)", value: `${metrics.effectiveWordsPerMinute} mots/min` });
  }
  if (metrics.fillerCount > 0) out.push({ label: "Hésitations", value: metrics.fillerCount });
  return out;
}
