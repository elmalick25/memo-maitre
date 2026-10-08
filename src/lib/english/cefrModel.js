// src/lib/english/cefrModel.js
// ════════════════════════════════════════════════════════════════════════════
// Modèle CECRL déterministe — B1 → C2 sur preuves, pas sur impressions.
// ════════════════════════════════════════════════════════════════════════════
// Le problème du niveau précédent : le niveau était demandé à un LLM à partir
// de 30 productions brutes. Un LLM interrogé ainsi est optimiste, instable
// d'une semaine à l'autre, et ne dit jamais CE QU'IL FAUT FAIRE ENSUITE.
//
// Ici, le niveau est calculé. Le LLM ne sert plus qu'à ce qu'il fait bien :
// annoter une production (erreurs, richesse lexicale, structures employées).
// Ces annotations deviennent des PREUVES, et les preuves alimentent six
// compétences suivies séparément, avec inertie, décote temporelle et
// intervalle de confiance.
//
// Critères de passage inspirés des descripteurs officiels du CECRL
// (Volume complémentaire 2020) et des seuils lexicaux empiriques :
//   B1  ≈ 2 500 familles de mots   · fluence ~90 mots/min · erreurs 8/100 mots
//   B2  ≈ 4 000 familles           · ~120 mots/min        · erreurs 5/100 mots
//   C1  ≈ 8 000 familles           · ~150 mots/min        · erreurs 2,5/100
//   C2  ≈ 16 000 familles          · ~170 mots/min        · erreurs 1/100
// ════════════════════════════════════════════════════════════════════════════

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Échelle continue : 0 = A1.0, 1 = A2.0 … 5 = C2.0. On travaille en décimal. */
export const levelToScale = (level) => Math.max(0, LEVELS.indexOf(String(level).toUpperCase()));
export function scaleToLevel(scale) {
  const s = Math.max(0, Math.min(5.99, Number(scale) || 0));
  const idx = Math.floor(s);
  const frac = s - idx;
  const sub = frac < 0.34 ? "faible" : frac < 0.67 ? "solide" : "avancé";
  return { level: LEVELS[idx], sub, scale: +s.toFixed(2), label: `${LEVELS[idx]} ${sub}` };
}

/** Les six compétences suivies séparément. */
export const SKILLS = Object.freeze({
  vocabulary: "Lexique",
  grammar: "Grammaire",
  fluency: "Fluidité",
  pronunciation: "Prononciation",
  listening: "Compréhension orale",
  discourse: "Structuration du discours",
});
export const SKILL_KEYS = Object.keys(SKILLS);

/** Seuils de référence par niveau (les preuves sont converties vers cette échelle). */
export const THRESHOLDS = Object.freeze({
  vocabFamilies: { B1: 2500, B2: 4000, C1: 8000, C2: 16000 },
  wordsPerMinute: { B1: 90, B2: 120, C1: 150, C2: 170 },
  errorsPer100Words: { B1: 8, B2: 5, C1: 2.5, C2: 1 },
  meanUtteranceLength: { B1: 9, B2: 14, C1: 19, C2: 24 },
  subordinationRatio: { B1: 0.18, B2: 0.3, C1: 0.42, C2: 0.5 },
});

/**
 * Taxonomie d'erreurs : chaque famille est associée au niveau où elle devrait
 * avoir disparu et à un exercice ciblé. C'est ce qui transforme un diagnostic
 * en plan d'action.
 */
export const ERROR_TAXONOMY = Object.freeze({
  article: { skill: "grammar", clearedBy: "B1", drill: "gap-fill", label: "Articles (a/an/the/∅)" },
  tense_backshift: { skill: "grammar", clearedBy: "B2", drill: "transform", label: "Concordance des temps / discours rapporté" },
  perfect_aspect: { skill: "grammar", clearedBy: "B2", drill: "contrast", label: "Present perfect vs prétérit" },
  conditional: { skill: "grammar", clearedBy: "B2", drill: "transform", label: "Conditionnels (0–3, mixtes)" },
  modality: { skill: "grammar", clearedBy: "C1", drill: "nuance", label: "Modaux de nuance (might have, ought to)" },
  inversion: { skill: "grammar", clearedBy: "C1", drill: "transform", label: "Inversions emphatiques (Never have I…)" },
  cleft: { skill: "discourse", clearedBy: "C1", drill: "transform", label: "Phrases clivées (It is X that…)" },
  preposition: { skill: "grammar", clearedBy: "B2", drill: "collocation", label: "Prépositions dépendantes" },
  collocation: { skill: "vocabulary", clearedBy: "B2", drill: "collocation", label: "Collocations naturelles" },
  register: { skill: "vocabulary", clearedBy: "C1", drill: "register-shift", label: "Registre (familier / neutre / soutenu)" },
  idiom: { skill: "vocabulary", clearedBy: "C1", drill: "paraphrase", label: "Expressions idiomatiques" },
  word_formation: { skill: "vocabulary", clearedBy: "C1", drill: "derivation", label: "Dérivation lexicale" },
  connector: { skill: "discourse", clearedBy: "B2", drill: "cohesion", label: "Connecteurs logiques" },
  paragraphing: { skill: "discourse", clearedBy: "C1", drill: "outline", label: "Organisation du propos" },
  hedging: { skill: "discourse", clearedBy: "C1", drill: "nuance", label: "Atténuation / prudence académique" },
  vowel_length: { skill: "pronunciation", clearedBy: "B2", drill: "minimal-pair", label: "Voyelles longues/brèves (ship/sheep)" },
  th_sound: { skill: "pronunciation", clearedBy: "B1", drill: "minimal-pair", label: "Sons /θ/ et /ð/" },
  word_stress: { skill: "pronunciation", clearedBy: "B2", drill: "stress-map", label: "Accent tonique" },
  sentence_rhythm: { skill: "pronunciation", clearedBy: "C1", drill: "shadowing", label: "Rythme et accentuation de phrase" },
  connected_speech: { skill: "pronunciation", clearedBy: "C1", drill: "shadowing", label: "Liaisons et élisions" },
  filler: { skill: "fluency", clearedBy: "B2", drill: "timed-speech", label: "Hésitations et remplissages" },
  self_repair: { skill: "fluency", clearedBy: "C1", drill: "timed-speech", label: "Auto-corrections excessives" },
  l1_transfer: { skill: "fluency", clearedBy: "C1", drill: "paraphrase", label: "Calques du français" },
  gist_miss: { skill: "listening", clearedBy: "B2", drill: "dictation", label: "Idée générale manquée" },
  detail_miss: { skill: "listening", clearedBy: "C1", drill: "dictation", label: "Détail ou chiffre manqué" },
  accent_miss: { skill: "listening", clearedBy: "C1", drill: "accent-exposure", label: "Accent non standard mal compris" },
  implicit_miss: { skill: "listening", clearedBy: "C2", drill: "inference", label: "Sous-entendu / ironie manqués" },
});

// ── Conversion des mesures brutes en position sur l'échelle CECRL ──────────

/** Interpole une mesure croissante (plus c'est haut, meilleur c'est). */
function scaleFromAscending(value, table) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const points = [
    [0, 1.0],
    [table.B1 * 0.45, 1.8],
    [table.B1, 2.0],
    [table.B2, 3.0],
    [table.C1, 4.0],
    [table.C2, 5.0],
  ];
  return interpolate(v, points);
}

/** Interpole une mesure décroissante (plus c'est bas, meilleur c'est). */
function scaleFromDescending(value, table) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const points = [
    [table.B1 * 2.2, 1.0],
    [table.B1, 2.0],
    [table.B2, 3.0],
    [table.C1, 4.0],
    [table.C2, 5.0],
    [0, 5.5],
  ].sort((a, b) => a[0] - b[0]);
  return interpolate(v, points);
}

function interpolate(v, points) {
  if (v <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (v >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (v <= x1) {
      const t = x1 === x0 ? 0 : (v - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

/**
 * Une preuve = une mesure objective issue d'une activité réelle.
 *
 * @typedef {Object} Evidence
 * @property {string} date          ISO
 * @property {string} activity      'speaking' | 'writing' | 'listening' | 'shadowing' | 'review'
 * @property {number} [words]       nombre de mots produits
 * @property {number} [durationSec] durée de production
 * @property {number} [errors]      nombre d'erreurs relevées
 * @property {string[]} [errorTypes] clés de ERROR_TAXONOMY
 * @property {number} [distinctLemmas]
 * @property {number} [rareWordRatio]  part de mots hors des 2 000 plus fréquents
 * @property {number} [subordinationRatio]
 * @property {number} [meanUtteranceLength]
 * @property {number} [listeningAccuracy] 0–1
 * @property {number} [listeningSpeed]    vitesse du document, mots/min
 * @property {number} [pronunciationScore] 0–1
 */

/** Convertit une preuve en scores partiels par compétence (échelle 0–5). */
export function evidenceToSkillScores(ev) {
  const out = {};
  const words = Number(ev?.words) || 0;
  const minutes = (Number(ev?.durationSec) || 0) / 60;

  if (words >= 20) {
    // Lexique : diversité + rareté. La richesse brute est corrigée de la longueur
    // (indice de Guiraud) sinon les textes longs paraissent toujours plus riches.
    const distinct = Number(ev.distinctLemmas) || 0;
    if (distinct > 0) {
      const guiraud = distinct / Math.sqrt(words); // ~5 (B1) → ~9 (C2)
      const rarity = Number(ev.rareWordRatio) || 0; // 0,05 (B1) → 0,25 (C2)
      out.vocabulary = clamp05(
        0.6 * interpolate(guiraud, [[3.5, 1.5], [5, 2], [6.5, 3], [8, 4], [9.5, 5]]) +
          0.4 * interpolate(rarity, [[0.02, 1.5], [0.05, 2], [0.11, 3], [0.18, 4], [0.26, 5]]),
      );
    }

    if (Number.isFinite(ev.errors)) {
      out.grammar = clamp05(scaleFromDescending((ev.errors / words) * 100, THRESHOLDS.errorsPer100Words));
    }

    const mlu = Number(ev.meanUtteranceLength);
    const sub = Number(ev.subordinationRatio);
    if (Number.isFinite(mlu) || Number.isFinite(sub)) {
      const parts = [];
      if (Number.isFinite(mlu)) parts.push(scaleFromAscending(mlu, THRESHOLDS.meanUtteranceLength));
      if (Number.isFinite(sub)) parts.push(scaleFromAscending(sub, THRESHOLDS.subordinationRatio));
      out.discourse = clamp05(avg(parts));
    }

    if (minutes >= 0.3 && (ev.activity === "speaking" || ev.activity === "shadowing")) {
      out.fluency = clamp05(scaleFromAscending(words / minutes, THRESHOLDS.wordsPerMinute));
    }
  }

  if (Number.isFinite(ev?.pronunciationScore)) {
    out.pronunciation = clamp05(
      interpolate(ev.pronunciationScore, [[0.4, 1.5], [0.6, 2], [0.75, 3], [0.87, 4], [0.95, 5]]),
    );
  }

  if (Number.isFinite(ev?.listeningAccuracy)) {
    // Comprendre à 95 % un document lent n'est pas C1 : on pondère par la vitesse.
    const speedFactor = interpolate(Number(ev.listeningSpeed) || 130, [[100, -0.5], [130, 0], [160, 0.4], [190, 0.8]]);
    out.listening = clamp05(
      interpolate(ev.listeningAccuracy, [[0.4, 1.2], [0.6, 2], [0.75, 3], [0.88, 4], [0.96, 5]]) + speedFactor,
    );
  }

  return out;
}

const clamp05 = (v) => Math.max(0, Math.min(5.5, Number(v) || 0));
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/**
 * Agrège toutes les preuves en un profil CECRL.
 *
 * Principes :
 *  • décote temporelle (demi-vie 45 jours) — une performance d'il y a 6 mois
 *    ne prouve pas le niveau d'aujourd'hui ;
 *  • pondération par la taille de l'échantillon (un texte de 400 mots pèse
 *    davantage qu'une phrase de 12 mots) ;
 *  • confiance explicite : sans preuves suffisantes, on ne prétend pas savoir ;
 *  • le niveau global est tiré vers le bas par la compétence la plus faible
 *    (règle CECRL : on ne certifie pas un niveau si un pilier ne suit pas).
 */
export function computeProfile(evidence = [], opts = {}) {
  const { now = Date.now(), halfLifeDays = 45 } = opts;
  const acc = {};
  for (const key of SKILL_KEYS) acc[key] = { sum: 0, weight: 0, samples: 0 };

  for (const ev of evidence) {
    const ageDays = Math.max(0, (now - new Date(ev?.date || now).getTime()) / 86400000);
    const recency = Math.pow(0.5, ageDays / halfLifeDays);
    const size = Math.min(2, Math.sqrt(Math.max(20, Number(ev?.words) || 60) / 60));
    const weight = recency * size;
    if (weight < 0.02) continue;

    const scores = evidenceToSkillScores(ev);
    for (const [skill, value] of Object.entries(scores)) {
      acc[skill].sum += value * weight;
      acc[skill].weight += weight;
      acc[skill].samples += 1;
    }
  }

  const skills = {};
  for (const key of SKILL_KEYS) {
    const a = acc[key];
    const scale = a.weight > 0 ? a.sum / a.weight : null;
    // Confiance : saturation à ~12 échantillons récents.
    const confidence = Math.min(1, a.weight / 8);
    skills[key] = {
      key,
      label: SKILLS[key],
      scale: scale === null ? null : +scale.toFixed(2),
      ...(scale === null ? { level: null, label2: null } : scaleToLevel(scale)),
      confidence: +confidence.toFixed(2),
      samples: a.samples,
    };
  }

  const known = SKILL_KEYS.map((k) => skills[k]).filter((s) => s.scale !== null && s.confidence >= 0.25);
  let overallScale = null;
  if (known.length >= 3) {
    const mean = avg(known.map((s) => s.scale));
    const weakest = Math.min(...known.map((s) => s.scale));
    // 70 % moyenne, 30 % maillon faible : un profil déséquilibré ne « passe » pas.
    overallScale = 0.7 * mean + 0.3 * weakest;
  }

  const coverage = known.length / SKILL_KEYS.length;
  const overall = overallScale === null ? null : scaleToLevel(overallScale);

  return {
    overall,
    overallScale: overallScale === null ? null : +overallScale.toFixed(2),
    skills,
    coverage: +coverage.toFixed(2),
    confidence: +(coverage * avg(known.map((s) => s.confidence) || [0])).toFixed(2),
    evidenceCount: evidence.length,
    bottleneck: known.length ? known.slice().sort((a, b) => a.scale - b.scale)[0] : null,
  };
}

/**
 * Critères de passage au niveau suivant : ce qu'il reste concrètement à faire.
 * @returns {{target:string, criteria:Array<{skill:string,label:string,current:number|null,required:number,met:boolean,gap:number}>, readiness:number}}
 */
export function gateToNextLevel(profile) {
  const currentScale = profile?.overallScale ?? 2; // par défaut B1
  const targetIndex = Math.min(5, Math.floor(currentScale) + 1);
  const target = LEVELS[targetIndex];
  // Pour valider un niveau, chaque compétence doit atteindre au moins le
  // plancher du niveau visé, et aucune ne doit rester plus d'un demi-niveau
  // en dessous.
  const required = targetIndex;

  const criteria = SKILL_KEYS.map((key) => {
    const s = profile?.skills?.[key];
    const current = s?.scale ?? null;
    return {
      skill: key,
      label: SKILLS[key],
      current,
      required,
      met: current !== null && current >= required,
      gap: current === null ? required : Math.max(0, +(required - current).toFixed(2)),
      confidence: s?.confidence ?? 0,
    };
  });

  const met = criteria.filter((c) => c.met).length;
  return {
    target,
    criteria,
    readiness: +(met / criteria.length).toFixed(2),
    blocking: criteria.filter((c) => !c.met).sort((a, b) => b.gap - a.gap),
  };
}

/** Agrège les erreurs récentes en priorités de travail. */
export function errorPriorities(evidence = [], opts = {}) {
  const { now = Date.now(), halfLifeDays = 30, limit = 6 } = opts;
  const counts = new Map();

  for (const ev of evidence) {
    const ageDays = Math.max(0, (now - new Date(ev?.date || now).getTime()) / 86400000);
    const recency = Math.pow(0.5, ageDays / halfLifeDays);
    for (const type of ev?.errorTypes || []) {
      if (!ERROR_TAXONOMY[type]) continue;
      counts.set(type, (counts.get(type) || 0) + recency);
    }
  }

  const profileScale = 2;
  return [...counts.entries()]
    .map(([type, weight]) => {
      const meta = ERROR_TAXONOMY[type];
      const overdue = Math.max(0, profileScale - levelToScale(meta.clearedBy) + 1);
      return {
        type,
        ...meta,
        frequency: +weight.toFixed(2),
        // Une erreur qui devait avoir disparu il y a deux niveaux coûte plus cher.
        priority: +(weight * (1 + 0.5 * overdue)).toFixed(2),
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

/**
 * Plan de travail hebdomadaire : convertit le diagnostic en séances.
 * Répartit le temps disponible entre les compétences qui bloquent le passage
 * au niveau suivant, sans jamais abandonner totalement les autres.
 */
export function weeklyPlan(profile, evidence = [], opts = {}) {
  const { minutesPerWeek = 300 } = opts;
  const gate = gateToNextLevel(profile);
  const errors = errorPriorities(evidence);

  const weights = {};
  let total = 0;
  for (const c of gate.criteria) {
    // Base 1 pour l'entretien, + l'écart au niveau visé (au carré, pour
    // concentrer l'effort là où ça bloque vraiment).
    const w = 1 + Math.pow(c.gap, 2) * 3;
    weights[c.skill] = w;
    total += w;
  }

  const sessions = gate.criteria
    .map((c) => {
      const minutes = Math.round((weights[c.skill] / total) * minutesPerWeek);
      return {
        skill: c.skill,
        label: SKILLS[c.skill],
        minutes,
        blocking: !c.met,
        focus: errors.filter((e) => e.skill === c.skill).slice(0, 2),
        activities: ACTIVITY_LIBRARY[c.skill].filter((a) => a.from <= (profile?.overallScale ?? 2) + 1),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return { target: gate.target, readiness: gate.readiness, minutesPerWeek, sessions, errors };
}

/** Activités par compétence, avec le niveau à partir duquel elles sont utiles. */
export const ACTIVITY_LIBRARY = Object.freeze({
  vocabulary: [
    { id: "collocation-mining", from: 2, label: "Extraction de collocations depuis un article lu", minutes: 15 },
    { id: "word-family", from: 2.5, label: "Familles de mots et dérivation (analyse → analytical → analytically)", minutes: 10 },
    { id: "register-shift", from: 3, label: "Réécrire un paragraphe en registre soutenu puis familier", minutes: 20 },
    { id: "academic-list", from: 3, label: "Bloc Academic Word List en contexte", minutes: 15 },
    { id: "idiom-in-use", from: 3.5, label: "Idiomes en situation, jamais en liste", minutes: 15 },
  ],
  grammar: [
    { id: "gap-fill", from: 2, label: "Textes à trous ciblés sur vos erreurs récurrentes", minutes: 10 },
    { id: "transform", from: 2.5, label: "Transformation de phrases (style examen Cambridge)", minutes: 15 },
    { id: "contrast", from: 2.5, label: "Paires minimales grammaticales avec justification", minutes: 10 },
    { id: "error-hunt", from: 3, label: "Corriger vos propres productions de la semaine passée", minutes: 20 },
  ],
  fluency: [
    { id: "timed-speech", from: 2, label: "Monologue chronométré 2 min sans pause", minutes: 10 },
    { id: "4-3-2", from: 2, label: "Technique 4/3/2 : même récit en 4, 3 puis 2 minutes", minutes: 15 },
    { id: "paraphrase", from: 3, label: "Paraphrase immédiate d'un paragraphe entendu", minutes: 15 },
    { id: "debate", from: 3.5, label: "Débat contradictoire : défendre l'avis inverse", minutes: 25 },
  ],
  pronunciation: [
    { id: "minimal-pair", from: 2, label: "Paires minimales enregistrées et comparées", minutes: 10 },
    { id: "stress-map", from: 2.5, label: "Cartographie de l'accent tonique sur vos mots fréquents", minutes: 10 },
    { id: "shadowing", from: 2.5, label: "Shadowing sur 90 secondes, trois passages", minutes: 15 },
    { id: "prosody", from: 3.5, label: "Imitation d'intonation sur discours natif", minutes: 15 },
  ],
  listening: [
    { id: "dictation", from: 2, label: "Dictée partielle sur 60 secondes d'audio natif", minutes: 15 },
    { id: "accent-exposure", from: 3, label: "Même sujet, trois accents différents", minutes: 20 },
    { id: "speed-ladder", from: 3, label: "Écoute progressive 1× → 1,25× → 1,5×", minutes: 15 },
    { id: "inference", from: 4, label: "Repérage d'ironie, sous-entendus et implicites", minutes: 20 },
  ],
  discourse: [
    { id: "cohesion", from: 2.5, label: "Relier trois idées avec des connecteurs variés", minutes: 10 },
    { id: "outline", from: 3, label: "Plan en 3 points avant de parler, puis exécution", minutes: 15 },
    { id: "nuance", from: 3.5, label: "Nuancer une affirmation (hedging académique)", minutes: 15 },
    { id: "essay", from: 4, label: "Essai argumenté 250 mots, contre-argument obligatoire", minutes: 35 },
  ],
});

/**
 * Prompt d'annotation : le LLM ne devine plus un niveau, il annote des faits.
 * Sortie strictement chiffrable, directement convertible en preuve.
 */
export function buildAnnotationPrompt(production, context = {}) {
  const types = Object.keys(ERROR_TAXONOMY).join(", ");
  return `You are a corpus linguist annotating a learner's English production. You do NOT assign a CEFR level — you only measure observable facts.

Return ONLY this JSON, no prose:
{
  "words": <integer, tokens produced>,
  "distinctLemmas": <integer>,
  "rareWordRatio": <0-1, share of tokens outside the 2000 most frequent English words>,
  "errors": <integer, total errors>,
  "errorTypes": [<zero or more of: ${types}>],
  "meanUtteranceLength": <average words per sentence>,
  "subordinationRatio": <0-1, share of clauses that are subordinate>,
  "corrections": [{ "original": "...", "corrected": "...", "type": "<error type key>", "why": "<one short line, in French>" }],
  "upgrades": [{ "learner": "...", "native": "...", "why": "<one short line, in French>" }]
}

Rules:
- Count only real errors, not stylistic preferences.
- "upgrades" show how a proficient native would phrase the same idea; maximum 3.
- Be strict: at C1/C2 level, awkward-but-grammatical counts as a collocation or register error.

Context: ${context.activity || "speaking"}${context.topic ? ` about ${context.topic}` : ""}.

Production:
"""${production}"""`;
}

/** Convertit la réponse annotée du LLM en preuve exploitable. */
export function annotationToEvidence(annotation, meta = {}) {
  if (!annotation || typeof annotation !== "object") return null;
  const words = Number(annotation.words) || 0;
  if (words < 5) return null;
  return {
    date: meta.date || new Date().toISOString(),
    activity: meta.activity || "speaking",
    words,
    durationSec: Number(meta.durationSec) || 0,
    errors: Number(annotation.errors) || 0,
    errorTypes: (annotation.errorTypes || []).filter((t) => ERROR_TAXONOMY[t]),
    distinctLemmas: Number(annotation.distinctLemmas) || 0,
    rareWordRatio: Number(annotation.rareWordRatio) || 0,
    meanUtteranceLength: Number(annotation.meanUtteranceLength) || 0,
    subordinationRatio: Number(annotation.subordinationRatio) || 0,
    pronunciationScore: Number.isFinite(meta.pronunciationScore) ? meta.pronunciationScore : undefined,
    listeningAccuracy: Number.isFinite(meta.listeningAccuracy) ? meta.listeningAccuracy : undefined,
    listeningSpeed: Number.isFinite(meta.listeningSpeed) ? meta.listeningSpeed : undefined,
    corrections: annotation.corrections || [],
    upgrades: annotation.upgrades || [],
  };
}
