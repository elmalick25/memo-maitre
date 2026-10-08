// src/lib/english/pronunciationScoring.js
// ════════════════════════════════════════════════════════════════════════════
// Notation de prononciation alignée MOT À MOT — sans IPA inventée.
// ════════════════════════════════════════════════════════════════════════════
// Le problème de l'ancienne version : on demandait à un LLM de produire, pour
// chaque mot, une "IPA attendue" et une "IPA détectée", à partir d'une simple
// transcription Whisper. Or Whisper NORMALISE : il restitue le mot que le
// modèle de langue juge le plus probable, pas les sons réellement produits.
// Le LLM hallucinait donc une phonétique à partir d'un texte déjà corrigé —
// le feedback était joliment présenté, mais sans rapport avec ce qui a été dit.
//
// Ce module part de ce qui est réellement observable :
//
//   1. ALIGNEMENT  — quel mot attendu correspond à quel mot entendu
//                    (Needleman-Wunsch avec coût phonétique, pas caractère).
//   2. SUBSTITUTION — si Whisper a entendu "dis" pour "this", c'est une PREUVE :
//                     le signal acoustique n'était pas celui de /ð/.
//   3. CONFUSIONS L1 — la substitution est comparée à une table de confusions
//                     typiques des francophones ; on nomme le phonème en cause
//                     uniquement quand la substitution le démontre.
//   4. TIMING      — si l'API fournit les horodatages par mot (Whisper
//                     verbose_json), on mesure débit, pauses et allongements :
//                     c'est la seule mesure de prosodie réellement fiable.
//   5. HONNÊTETÉ   — un mot correctement transcrit n'est PAS "parfait" : il est
//                    "non contredit". Le score porte une confiance explicite.
// ════════════════════════════════════════════════════════════════════════════

const OP = { MATCH: "match", SUB: "substitution", DEL: "omission", INS: "insertion" };

/** Confusions phonétiques typiques d'un francophone (source → cible entendue). */
const L1_CONFUSIONS = [
  {
    id: "th_sound",
    label: "Sons /θ/ et /ð/",
    test: (exp, heard) => /^th/i.test(exp) && /^[dzstf]/i.test(heard) && rest(exp, 2) === rest(heard, 1),
    tip: "Langue entre les dents, souffle continu — pas de /d/ ni de /z/.",
  },
  {
    id: "th_sound",
    label: "Sons /θ/ et /ð/ en milieu de mot",
    test: (exp, heard) => exp.includes("th") && !heard.includes("th") && near(exp.replace(/th/g, ""), heard.replace(/[dzsf]/g, "")),
    tip: "Le /θ/ intérieur (nothing, method) disparaît souvent : ralentis et exagère-le.",
  },
  {
    id: "vowel_length",
    label: "Voyelle longue / brève",
    test: (exp, heard) => vowelPairMiss(exp, heard),
    tip: "sheep /iː/ vs ship /ɪ/ : ce n'est pas la même longueur ni le même timbre.",
  },
  {
    id: "word_stress",
    label: "Accent tonique",
    test: (exp, heard) => exp !== heard && sameSkeleton(exp, heard) && syllables(exp) === syllables(heard) && syllables(exp) >= 2,
    tip: "Même squelette consonantique, mot différent : l'accent tonique est déplacé.",
  },
  {
    id: "connected_speech",
    label: "Liaison / élision",
    test: (exp, heard) => heard.length > exp.length && heard.includes(exp) && heard.length - exp.length <= 3,
    tip: "Le mot a été soudé au suivant — marque la frontière de mot.",
  },
  {
    id: "th_sound",
    label: "H aspiré",
    test: (exp, heard) => /^h/i.test(exp) && exp.slice(1) === heard,
    tip: "Le H anglais s'entend (house, behind) — il n'est pas muet comme en français.",
  },
];

const VOWEL_PAIRS = [
  ["ee", "i"], ["ea", "e"], ["oo", "u"], ["ou", "o"], ["ai", "e"], ["ie", "i"],
  ["a", "e"], ["i", "e"], ["u", "a"], ["o", "a"],
];

const rest = (w, n) => w.slice(n);
const near = (a, b) => a.length > 1 && b.length > 1 && (a.startsWith(b.slice(0, 2)) || b.startsWith(a.slice(0, 2)));

function vowelPairMiss(exp, heard) {
  if (exp === heard || Math.abs(exp.length - heard.length) > 2) return false;
  const skelE = exp.replace(/[aeiouy]/g, "");
  const skelH = heard.replace(/[aeiouy]/g, "");
  if (skelE !== skelH || skelE.length < 2) return false;
  const ve = exp.replace(/[^aeiouy]/g, "");
  const vh = heard.replace(/[^aeiouy]/g, "");
  if (ve === vh) return false;
  return VOWEL_PAIRS.some(([a, b]) => (ve.includes(a) && vh.includes(b)) || (ve.includes(b) && vh.includes(a))) || true;
}

function sameSkeleton(a, b) {
  return a.replace(/[aeiouy]/g, "") === b.replace(/[aeiouy]/g, "");
}

export function syllables(word) {
  const w = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Clé phonétique anglaise simplifiée : ce qui S'ENTEND, pas ce qui s'écrit. */
export function phoneticKey(word) {
  let w = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  w = w
    .replace(/^kn/, "n").replace(/^wr/, "r").replace(/^gn/, "n").replace(/^ps/, "s")
    .replace(/mb$/, "m").replace(/ough/g, "o").replace(/augh/g, "af")
    .replace(/tion/g, "shn").replace(/sion/g, "shn").replace(/cious/g, "shs")
    .replace(/ph/g, "f").replace(/gh/g, "").replace(/ck/g, "k").replace(/qu/g, "kw")
    .replace(/sh/g, "S").replace(/ch/g, "C").replace(/th/g, "T")
    .replace(/c(?=[ei y])/g, "s").replace(/c/g, "k")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/e$/, "");
  return w;
}

/** Distance d'édition sur les clés phonétiques, normalisée 0–1 (0 = identique). */
export function phoneticDistance(a, b) {
  const ka = phoneticKey(a);
  const kb = phoneticKey(b);
  if (!ka && !kb) return 0;
  if (!ka || !kb) return 1;
  if (ka === kb) return 0;
  const d = editDistance(ka, kb);
  return Math.min(1, d / Math.max(ka.length, kb.length));
}

function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function normalizeWords(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Alignement global (Needleman-Wunsch) entre deux séquences de mots, avec un
 * coût de substitution PHONÉTIQUE : substituer "this" par "dis" coûte peu
 * (même mot mal prononcé), le substituer par "table" coûte cher (autre mot).
 *
 * @returns {Array<{op:string, expected:string|null, heard:string|null, distance:number}>}
 */
export function alignWords(expectedWords, heardWords) {
  const n = expectedWords.length;
  const m = heardWords.length;
  const GAP = 1;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const bt = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(""));

  for (let i = 1; i <= n; i++) { dp[i][0] = i * GAP; bt[i][0] = "up"; }
  for (let j = 1; j <= m; j++) { dp[0][j] = j * GAP; bt[0][j] = "left"; }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const subCost = phoneticDistance(expectedWords[i - 1], heardWords[j - 1]);
      const diag = dp[i - 1][j - 1] + subCost;
      const up = dp[i - 1][j] + GAP;
      const left = dp[i][j - 1] + GAP;
      const best = Math.min(diag, up, left);
      dp[i][j] = best;
      bt[i][j] = best === diag ? "diag" : best === up ? "up" : "left";
    }
  }

  const out = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const move = i === 0 ? "left" : j === 0 ? "up" : bt[i][j];
    if (move === "diag") {
      const e = expectedWords[i - 1];
      const h = heardWords[j - 1];
      const d = phoneticDistance(e, h);
      out.push({ op: e === h ? OP.MATCH : d < 0.6 ? OP.SUB : OP.SUB, expected: e, heard: h, distance: +d.toFixed(3) });
      i--; j--;
    } else if (move === "up") {
      out.push({ op: OP.DEL, expected: expectedWords[i - 1], heard: null, distance: 1 });
      i--;
    } else {
      out.push({ op: OP.INS, expected: null, heard: heardWords[j - 1], distance: 1 });
      j--;
    }
  }
  return out.reverse();
}

/** Identifie le phonème en cause à partir d'une substitution observée. */
export function diagnoseSubstitution(expected, heard) {
  const e = String(expected || "").toLowerCase();
  const h = String(heard || "").toLowerCase();
  if (!e || !h || e === h) return null;
  for (const rule of L1_CONFUSIONS) {
    try {
      if (rule.test(e, h)) return { type: rule.id, label: rule.label, tip: rule.tip };
    } catch {
      /* une règle ne doit jamais casser la notation */
    }
  }
  const d = phoneticDistance(e, h);
  if (d >= 0.6) {
    return {
      type: "l1_transfer",
      label: "Mot non reconnu",
      tip: `Le mot entendu ("${h}") est trop éloigné de "${e}" : reprends-le isolément avant de refaire la phrase.`,
    };
  }
  return {
    type: "sentence_rhythm",
    label: "Articulation imprécise",
    tip: `"${e}" a été entendu "${h}" : articule les consonnes finales.`,
  };
}

/**
 * Note la prononciation d'une phrase lue à voix haute.
 *
 * @param {Object} input
 * @param {string} input.expected      la phrase que l'apprenant devait lire
 * @param {string} input.transcript    la transcription obtenue (Whisper)
 * @param {number} [input.durationSec] durée de l'enregistrement
 * @param {Array}  [input.wordTimings] [{word,start,end}] si l'API les fournit
 * @returns {Object} score, mots alignés, problèmes typés, confiance
 */
export function scorePronunciation(input = {}) {
  const expectedWords = normalizeWords(input.expected);
  const heardWords = normalizeWords(input.transcript);

  if (expectedWords.length === 0) {
    return freeSpeechScore(heardWords, input);
  }
  if (heardWords.length === 0) {
    return {
      mode: "read-aloud",
      score: 0,
      confidence: 0.2,
      words: expectedWords.map((w) => ({ word: w, status: OP.DEL, score: 0 })),
      issues: [],
      errorTypes: [],
      reliability: "Aucune parole détectée dans l'enregistrement.",
    };
  }

  const alignment = alignWords(expectedWords, heardWords);
  const words = [];
  const issueCounts = new Map();

  for (const step of alignment) {
    if (step.op === OP.MATCH) {
      words.push({
        word: step.expected,
        heard: step.heard,
        status: OP.MATCH,
        // Un mot correctement transcrit n'est pas "parfait" : il est non contredit.
        score: 92,
        note: null,
      });
      continue;
    }
    if (step.op === OP.DEL) {
      words.push({ word: step.expected, heard: null, status: OP.DEL, score: 0, note: "Mot non prononcé ou inaudible." });
      bump(issueCounts, "connected_speech");
      continue;
    }
    if (step.op === OP.INS) {
      words.push({ word: null, heard: step.heard, status: OP.INS, score: null, note: "Mot ajouté (hésitation ou reprise)." });
      bump(issueCounts, "self_repair");
      continue;
    }
    const diag = diagnoseSubstitution(step.expected, step.heard);
    // Une erreur SYSTÉMATIQUE identifiée (th→s, longueur vocalique, H aspiré…)
    // n'est pas un quasi-succès : « sink » pour « think » reste phonétiquement
    // proche, mais c'est précisément l'erreur qui rend un accent francophone
    // reconnaissable. On plafonne donc le score de ces mots, sinon le
    // diagnostic est juste et la note, elle, reste flatteuse.
    const SYSTEMATIC_CAP = 45;
    const raw = Math.round(Math.max(0, 100 - step.distance * 100));
    const isSystematic = diag && diag.type !== "sentence_rhythm";
    const score = isSystematic ? Math.min(raw, SYSTEMATIC_CAP) : raw;
    words.push({
      word: step.expected,
      heard: step.heard,
      status: OP.SUB,
      score,
      issueType: diag?.type || null,
      issueLabel: diag?.label || null,
      note: diag?.tip || null,
    });
    if (diag) bump(issueCounts, diag.type);
  }

  const scorable = words.filter((w) => w.score !== null);
  const rawScore = scorable.length
    ? scorable.reduce((a, w) => a + w.score, 0) / scorable.length
    : 0;

  const timing = analyzeTiming(input, heardWords.length);
  // La prosodie module le score, elle ne le remplace pas : au maximum ±8 points.
  const score = Math.max(0, Math.min(100, Math.round(rawScore + timing.adjustment)));

  const issues = [...issueCounts.entries()]
    .map(([type, count]) => ({
      type,
      count,
      label: L1_CONFUSIONS.find((c) => c.id === type)?.label || type,
      tip: L1_CONFUSIONS.find((c) => c.id === type)?.tip || null,
    }))
    .sort((a, b) => b.count - a.count);

  // Confiance : un enregistrement court ou une phrase de 3 mots ne prouve rien.
  const confidence = +Math.min(1, expectedWords.length / 12).toFixed(2);

  return {
    mode: "read-aloud",
    score,
    rawScore: Math.round(rawScore),
    confidence,
    words,
    issues,
    errorTypes: issues.map((i) => i.type),
    timing,
    coverage: +(words.filter((w) => w.status === OP.MATCH).length / expectedWords.length).toFixed(2),
    reliability:
      confidence < 0.5
        ? "Phrase trop courte pour un diagnostic fiable — vise 12 mots minimum."
        : "Diagnostic établi sur l'alignement mot à mot de ta lecture, pas sur une estimation.",
  };
}

/** Mode libre : sans phrase de référence, on ne note que le débit et la fluidité. */
function freeSpeechScore(heardWords, input) {
  const timing = analyzeTiming(input, heardWords.length);
  return {
    mode: "free-speech",
    score: null,
    confidence: 0.4,
    words: [],
    issues: [],
    errorTypes: timing.pauses > heardWords.length / 8 ? ["filler"] : [],
    timing,
    reliability:
      "Sans phrase de référence, la prononciation ne peut pas être notée : seuls le débit et le rythme sont mesurés. Choisis une phrase à lire pour obtenir un score.",
  };
}

/**
 * Prosodie mesurée sur les horodatages réels (Whisper verbose_json).
 * Sans horodatage, on se rabat sur le débit global — et on le dit.
 */
export function analyzeTiming(input = {}, wordCount = 0) {
  const durationSec = Number(input.durationSec) || 0;
  const timings = Array.isArray(input.wordTimings) ? input.wordTimings : [];

  if (timings.length >= 3) {
    const gaps = [];
    for (let i = 1; i < timings.length; i++) {
      const gap = Number(timings[i].start) - Number(timings[i - 1].end);
      if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
    }
    const longPauses = gaps.filter((g) => g > 0.6).length;
    const span = Number(timings[timings.length - 1].end) - Number(timings[0].start);
    const wpm = span > 0 ? (timings.length / span) * 60 : null;
    const durations = timings
      .map((t) => Number(t.end) - Number(t.start))
      .filter((d) => Number.isFinite(d) && d > 0);
    const meanDur = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    // Un mot qui dure 2,5× la moyenne est traîné : accent mal placé ou blocage.
    const dragged = timings
      .filter((t, i) => durations[i] > meanDur * 2.5)
      .map((t) => t.word);

    let adjustment = 0;
    if (wpm !== null) {
      if (wpm < 80) adjustment -= 6;
      else if (wpm < 100) adjustment -= 3;
      else if (wpm > 130 && longPauses <= 1) adjustment += 4;
    }
    if (longPauses > timings.length / 6) adjustment -= 5;

    return {
      source: "word-timings",
      wordsPerMinute: wpm === null ? null : Math.round(wpm),
      pauses: longPauses,
      draggedWords: dragged.slice(0, 5),
      adjustment: Math.max(-8, Math.min(8, adjustment)),
      note: longPauses > 2 ? `${longPauses} pauses longues : le rythme est haché.` : "Rythme continu.",
    };
  }

  const wpm = durationSec > 0 ? Math.round((wordCount / durationSec) * 60) : null;
  return {
    source: durationSec > 0 ? "duration-only" : "none",
    wordsPerMinute: wpm,
    pauses: null,
    draggedWords: [],
    adjustment: wpm !== null && wpm < 80 ? -4 : 0,
    note:
      wpm === null
        ? "Durée inconnue : le rythme n'a pas pu être mesuré."
        : "Rythme estimé sur la durée totale ; active les horodatages Whisper pour une mesure par mot.",
  };
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

/**
 * Agrège plusieurs tentatives pour trouver les phonèmes réellement récurrents.
 * Un /θ/ raté une fois est un accident ; raté six fois sur dix mots, c'est le
 * chantier prioritaire.
 */
export function recurringPhonemeIssues(attempts = [], opts = {}) {
  const { minOccurrences = 3 } = opts;
  const counts = new Map();
  const examples = new Map();
  for (const attempt of attempts) {
    for (const w of attempt?.words || []) {
      if (!w.issueType) continue;
      counts.set(w.issueType, (counts.get(w.issueType) || 0) + 1);
      const list = examples.get(w.issueType) || [];
      if (list.length < 4 && w.word) list.push({ expected: w.word, heard: w.heard });
      examples.set(w.issueType, list);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= minOccurrences)
    .map(([type, count]) => ({
      type,
      count,
      label: L1_CONFUSIONS.find((c) => c.id === type)?.label || type,
      tip: L1_CONFUSIONS.find((c) => c.id === type)?.tip || null,
      examples: examples.get(type) || [],
    }))
    .sort((a, b) => b.count - a.count);
}

export const PRONUNCIATION_OPS = OP;
