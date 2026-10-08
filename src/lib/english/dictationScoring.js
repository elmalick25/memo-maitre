// src/lib/english/dictationScoring.js
// ════════════════════════════════════════════════════════════════════════════
// Notation de dictée au MOT, avec typage des erreurs.
// ════════════════════════════════════════════════════════════════════════════
// L'ancienne version calculait une distance de Levenshtein CARACTÈRE par
// CARACTÈRE sur le texte entier. Trois conséquences graves :
//
//   • Un mot oublié au début décale tout le reste : la distance explose et le
//     score s'effondre alors qu'une seule erreur a été commise.
//   • Deux erreurs très différentes — "their/there" (homophone, erreur
//     d'écoute grammaticale) et "recieve/receive" (erreur d'orthographe pure) —
//     coûtent exactement pareil, alors qu'elles ne se travaillent pas du tout
//     de la même façon.
//   • Le score n'apprend rien : impossible de savoir quel type d'écoute est
//     défaillant.
//
// Ici, on aligne les mots, puis on TYPE chaque erreur :
//   homophone · orthographe · contraction · morphologie · mot manqué ·
//   mot inventé · ordre des mots · nombre/chiffre.
// Chaque type est relié à la taxonomie CECRL (cefrModel.ERROR_TAXONOMY) pour
// alimenter directement le plan de travail.
// ════════════════════════════════════════════════════════════════════════════

import { alignWords, normalizeWords, phoneticDistance, phoneticKey, PRONUNCIATION_OPS as OP } from "./pronunciationScoring.js";

/** Homophones et quasi-homophones les plus coûteux en dictée. */
const HOMOPHONE_GROUPS = [
  ["their", "there", "they're"],
  ["your", "you're"],
  ["its", "it's"],
  ["to", "too", "two"],
  ["then", "than"],
  ["affect", "effect"],
  ["accept", "except"],
  ["lose", "loose"],
  ["weather", "whether"],
  ["principal", "principle"],
  ["complement", "compliment"],
  ["stationary", "stationery"],
  ["advice", "advise"],
  ["practice", "practise"],
  ["desert", "dessert"],
  ["quiet", "quite"],
  ["through", "threw"],
  ["write", "right", "rite"],
  ["hear", "here"],
  ["knew", "new"],
  ["know", "no"],
  ["one", "won"],
  ["peace", "piece"],
  ["where", "wear", "were"],
  ["whose", "who's"],
  ["by", "buy", "bye"],
  ["site", "sight", "cite"],
  ["allowed", "aloud"],
  ["breath", "breathe"],
  ["board", "bored"],
];

const HOMOPHONE_INDEX = new Map();
for (const group of HOMOPHONE_GROUPS) {
  for (const w of group) HOMOPHONE_INDEX.set(w, group);
}

const CONTRACTIONS = new Map(
  Object.entries({
    "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is",
    "it's": "it is", "we're": "we are", "they're": "they are",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not",
    "weren't": "were not", "don't": "do not", "doesn't": "does not",
    "didn't": "did not", "can't": "cannot", "couldn't": "could not",
    "won't": "will not", "wouldn't": "would not", "shouldn't": "should not",
    "haven't": "have not", "hasn't": "has not", "hadn't": "had not",
    "i've": "i have", "you've": "you have", "we've": "we have",
    "they've": "they have", "i'll": "i will", "you'll": "you will",
    "he'll": "he will", "she'll": "she will", "we'll": "we will",
    "they'll": "they will", "i'd": "i would", "let's": "let us",
    "that's": "that is", "there's": "there is", "what's": "what is",
    "who's": "who is", "here's": "here is",
  }),
);

/** Familles d'erreurs de dictée → compétence et clé de taxonomie CECRL. */
export const DICTATION_ERROR_TYPES = Object.freeze({
  homophone: {
    label: "Homophone",
    cefrType: "detail_miss",
    why: "Le son a été bien perçu, mais le mot choisi n'est pas celui que la grammaire imposait.",
    drill: "Relis la phrase entière : c'est le contexte, pas le son, qui tranche.",
  },
  spelling: {
    label: "Orthographe",
    cefrType: "word_formation",
    why: "Le bon mot a été reconnu ; c'est son écriture qui est fautive.",
    drill: "Réécris le mot trois fois en découpant les syllabes.",
  },
  contraction: {
    label: "Contraction",
    cefrType: "connected_speech",
    why: "La forme contractée et la forme pleine n'ont pas été distinguées à l'oreille.",
    drill: "Entraîne-toi sur les formes faibles : /wɪl/ vs /l/, /hæv/ vs /əv/.",
  },
  morphology: {
    label: "Terminaison",
    cefrType: "tense_backshift",
    why: "La marque grammaticale finale (-s, -ed, -ing) a sauté.",
    drill: "Les finales portent le temps et le nombre : écoute la dernière consonne.",
  },
  missed: {
    label: "Mot manqué",
    cefrType: "gist_miss",
    why: "Un mot du texte n'a pas été écrit du tout.",
    drill: "Les mots avalés sont presque toujours des mots grammaticaux non accentués.",
  },
  invented: {
    label: "Mot ajouté",
    cefrType: "detail_miss",
    why: "Un mot absent du texte a été ajouté — le cerveau a comblé un trou.",
    drill: "Écris ce que tu entends, pas ce que tu attends.",
  },
  misheard: {
    label: "Mot mal entendu",
    cefrType: "detail_miss",
    why: "Le mot écrit est phonétiquement éloigné de l'original.",
    drill: "Réécoute uniquement ce segment, à vitesse réduite.",
  },
  number: {
    label: "Chiffre ou nombre",
    cefrType: "detail_miss",
    why: "Les nombres sont la première source de perte d'information en écoute.",
    drill: "Entraîne-toi spécifiquement sur les dizaines : thirteen vs thirty.",
  },
});

const isNumberLike = (w) =>
  /^\d/.test(w) ||
  /^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thir|four|fif|six|seven|eigh|nine)(?:teen|ty)?$/.test(w) ||
  /^(?:hundred|thousand|million|billion|first|second|third|half|quarter)$/.test(w);

/** Classe une substitution en type d'erreur exploitable. */
export function classifyDictationError(expected, written) {
  const e = String(expected || "").toLowerCase();
  const w = String(written || "").toLowerCase();
  if (!e) return "invented";
  if (!w) return "missed";
  if (e === w) return null;

  if (isNumberLike(e) || isNumberLike(w)) return "number";

  const group = HOMOPHONE_INDEX.get(e);
  if (group && group.includes(w)) return "homophone";

  if (CONTRACTIONS.has(e) || CONTRACTIONS.has(w)) {
    const expanded = CONTRACTIONS.get(e) || e;
    const writtenExpanded = CONTRACTIONS.get(w) || w;
    if (expanded === writtenExpanded || expanded.startsWith(w) || writtenExpanded.startsWith(e)) {
      return "contraction";
    }
  }

  // Différence limitée à une terminaison grammaticale.
  const strip = (x) => x.replace(/(?:s|es|ed|ing|'s)$/, "");
  if (strip(e) === strip(w) && strip(e).length >= 3) return "morphology";

  const dist = phoneticDistance(e, w);
  // Même prononciation, écriture différente → orthographe pure.
  if (phoneticKey(e) === phoneticKey(w)) return "spelling";
  if (dist <= 0.34) return "spelling";
  return "misheard";
}

/**
 * Note une dictée.
 *
 * @param {string} expectedText  le texte dicté
 * @param {string} writtenText   ce que l'apprenant a écrit
 * @param {Object} [opts]        { punctuationCounts:boolean }
 * @returns {Object} score, diff mot à mot, erreurs typées, priorités
 */
export function scoreDictation(expectedText, writtenText, opts = {}) {
  const expected = normalizeWords(expectedText);
  const written = normalizeWords(writtenText);

  if (expected.length === 0) {
    return emptyResult("Aucun texte de référence.");
  }
  if (written.length === 0) {
    return {
      ...emptyResult("Aucune réponse saisie."),
      total: expected.length,
      diff: expected.map((w) => ({ status: OP.DEL, expected: w, written: null, errorType: "missed" })),
      errors: [{ type: "missed", count: expected.length, ...DICTATION_ERROR_TYPES.missed }],
    };
  }

  const alignment = alignWords(expected, written);
  const diff = [];
  const counts = new Map();
  const examples = new Map();
  let correct = 0;
  let weightedPenalty = 0;

  // Toutes les erreurs ne se valent pas : une faute d'orthographe pure sur un
  // mot correctement entendu coûte moins qu'un mot totalement manqué.
  const PENALTY = {
    homophone: 1, spelling: 0.6, contraction: 0.8, morphology: 0.9,
    missed: 1, invented: 0.7, misheard: 1, number: 1.2,
  };

  for (const step of alignment) {
    if (step.op === OP.MATCH) {
      correct++;
      diff.push({ status: "ok", expected: step.expected, written: step.heard, errorType: null });
      continue;
    }
    const type =
      step.op === OP.DEL ? "missed"
      : step.op === OP.INS ? "invented"
      : classifyDictationError(step.expected, step.heard);

    weightedPenalty += PENALTY[type] ?? 1;
    counts.set(type, (counts.get(type) || 0) + 1);
    const ex = examples.get(type) || [];
    if (ex.length < 5) ex.push({ expected: step.expected, written: step.heard });
    examples.set(type, ex);

    diff.push({
      status: step.op === OP.DEL ? OP.DEL : step.op === OP.INS ? OP.INS : OP.SUB,
      expected: step.expected,
      written: step.heard,
      errorType: type,
      hint: DICTATION_ERROR_TYPES[type]?.why || null,
    });
  }

  const score = Math.max(0, Math.round(100 - (weightedPenalty / expected.length) * 100));
  // Précision brute (WER inversé) : la mesure standard, affichée en parallèle.
  const wordAccuracy = +(correct / expected.length).toFixed(3);

  const errors = [...counts.entries()]
    .map(([type, count]) => ({
      type,
      count,
      ...DICTATION_ERROR_TYPES[type],
      examples: examples.get(type) || [],
    }))
    .sort((a, b) => b.count - a.count);

  return {
    score,
    wordAccuracy,
    correct,
    total: expected.length,
    diff,
    errors,
    // Clés de cefrModel.ERROR_TAXONOMY : la dictée alimente le profil CECRL.
    cefrErrorTypes: [...new Set(errors.map((e) => DICTATION_ERROR_TYPES[e.type]?.cefrType).filter(Boolean))],
    // Ce qui doit être travaillé en priorité, formulé pour l'apprenant.
    priority: errors[0]
      ? `${errors[0].label} (${errors[0].count}) — ${errors[0].drill}`
      : "Dictée sans erreur : passe à un audio plus rapide ou à un accent différent.",
    listeningAccuracy: wordAccuracy,
    reliability:
      expected.length < 25
        ? "Texte court : le score est indicatif, vise 40 mots minimum pour un diagnostic."
        : "Score calculé sur l'alignement mot à mot, pondéré par le type d'erreur.",
  };
}

function emptyResult(reason) {
  return {
    score: 0, wordAccuracy: 0, correct: 0, total: 0, diff: [], errors: [],
    cefrErrorTypes: [], priority: reason, listeningAccuracy: 0, reliability: reason,
  };
}

/**
 * Mots qui reviennent en erreur sur plusieurs dictées : la vraie liste de
 * travail. Un mot raté une fois est un accident, raté trois fois c'est un trou.
 */
export function recurringDictationWords(results = [], opts = {}) {
  const { minOccurrences = 2, limit = 15 } = opts;
  const map = new Map();
  for (const r of results) {
    for (const d of r?.diff || []) {
      if (!d.errorType || !d.expected) continue;
      const key = d.expected.toLowerCase();
      const entry = map.get(key) || { word: key, count: 0, types: new Set(), written: new Set() };
      entry.count++;
      entry.types.add(d.errorType);
      if (d.written) entry.written.add(d.written);
      map.set(key, entry);
    }
  }
  return [...map.values()]
    .filter((e) => e.count >= minOccurrences)
    .map((e) => ({
      word: e.word,
      count: e.count,
      types: [...e.types],
      mistakes: [...e.written].slice(0, 3),
      drill: DICTATION_ERROR_TYPES[[...e.types][0]]?.drill || null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
