// src/lib/english/feedbackPrompts.js
// ════════════════════════════════════════════════════════════════════════════
// Consignes IA ciblées : le LLM annote, il n'évalue plus.
// ════════════════════════════════════════════════════════════════════════════
// Règle unique de ce fichier : ON NE DEMANDE JAMAIS AU MODÈLE CE QU'IL NE PEUT
// PAS SAVOIR.
//
// Un LLM qui reçoit une transcription texte ne peut pas connaître les sons
// réellement produits : lui demander une "IPA détectée" produit une invention
// crédible. Il ne peut pas non plus compter des mots de façon fiable, ni
// estimer un taux de subordination — c'est le rôle de productionMetrics.js.
//
// Ce qu'il fait très bien, en revanche :
//   • repérer une erreur et la NOMMER dans une taxonomie fermée ;
//   • proposer la formulation qu'un natif emploierait ;
//   • expliquer une règle en une ligne, en français ;
//   • fabriquer un exercice ciblé sur une erreur précise.
//
// Chaque prompt reçoit donc les MESURES DÉJÀ CALCULÉES et se contente
// d'annoter et d'expliquer, dans un JSON strict.
// ════════════════════════════════════════════════════════════════════════════

import { ERROR_TAXONOMY } from "./cefrModel.js";

const TYPE_KEYS = Object.keys(ERROR_TAXONOMY);
const TYPE_LIST = TYPE_KEYS.join(" | ");

/** Rappel de la taxonomie, avec le niveau où chaque erreur devrait être réglée. */
function taxonomyBrief(filterSkill = null) {
  return Object.entries(ERROR_TAXONOMY)
    .filter(([, v]) => !filterSkill || v.skill === filterSkill)
    .map(([k, v]) => `- ${k}: ${v.label} (attendu réglé au niveau ${v.clearedBy})`)
    .join("\n");
}

const JSON_ONLY =
  "Réponds UNIQUEMENT par le JSON demandé. Pas de markdown, pas de backticks, pas de phrase avant ou après.";

/**
 * Annotation d'une production écrite ou orale.
 * Les mesures sont FOURNIES : le modèle ne les recalcule pas, il les commente.
 */
export function buildProductionFeedbackPrompt({ text, metrics, activity = "writing", level = "B1", focusTypes = [] }) {
  const focus = focusTypes.length
    ? `\nERREURS DÉJÀ RÉCURRENTES CHEZ CET APPRENANT (à vérifier en priorité) : ${focusTypes.join(", ")}.`
    : "";
  return `Tu es linguiste de corpus. Tu annotes une production d'apprenant francophone en anglais. Tu n'attribues AUCUN niveau CECRL : il est déjà calculé ailleurs.

MESURES DÉJÀ CALCULÉES (ne les recalcule pas, ne les conteste pas) :
- mots : ${metrics?.words ?? "?"}
- phrases : ${metrics?.sentences ?? "?"}
- longueur moyenne de phrase : ${metrics?.meanUtteranceLength ?? "?"}
- richesse lexicale (Guiraud) : ${metrics?.guiraud ?? "?"}
- mots hors des 2 000 plus fréquents : ${Math.round((metrics?.rareWordRatio || 0) * 100)} %
- taux de subordination : ${Math.round((metrics?.subordinationRatio || 0) * 100)} %
- connecteurs logiques : ${metrics?.connectorCount ?? 0}
${metrics?.wordsPerMinute ? `- débit : ${metrics.wordsPerMinute} mots/min` : ""}

TAXONOMIE D'ERREURS FERMÉE — n'utilise aucune autre clé :
${taxonomyBrief()}
${focus}

Ta tâche :
1. Relever CHAQUE erreur réelle (pas les préférences de style) et la typer.
2. Pour 3 passages maximum, montrer la formulation d'un natif de niveau supérieur.
3. Ne rien inventer sur la prononciation : tu ne disposes que du texte.

${JSON_ONLY}
{
  "errors": <entier, nombre total d'erreurs relevées>,
  "errorTypes": [<clés parmi : ${TYPE_LIST}>],
  "corrections": [
    { "original": "<extrait exact>", "corrected": "<version correcte>", "type": "<clé de taxonomie>", "why": "<une ligne en français>" }
  ],
  "upgrades": [
    { "learner": "<extrait exact>", "native": "<formulation native>", "why": "<une ligne en français>" }
  ],
  "strongestMove": "<la meilleure chose faite dans ce texte, une ligne en français>",
  "nextDrill": { "type": "<clé de taxonomie>", "instruction": "<exercice précis de 5 minutes, en français>" }
}

Activité : ${activity}. Niveau de référence actuel : ${level}.

PRODUCTION :
"""${text}"""`;
}

/**
 * Explication d'un diagnostic de prononciation DÉJÀ ÉTABLI par alignement.
 * Le modèle ne note pas, ne devine pas d'IPA : il explique et fait travailler.
 */
export function buildPronunciationCoachPrompt({ expected, transcript, scoring }) {
  const observed = (scoring?.words || [])
    .filter((w) => w.status !== "match")
    .slice(0, 12)
    .map((w) =>
      w.status === "omission"
        ? `- "${w.word}" : non prononcé / inaudible`
        : w.status === "insertion"
        ? `- mot ajouté : "${w.heard}"`
        : `- attendu "${w.word}" → entendu "${w.heard}" (diagnostic : ${w.issueLabel || "articulation"})`,
    )
    .join("\n") || "- aucune divergence relevée";

  const issues = (scoring?.issues || []).map((i) => `${i.type} ×${i.count}`).join(", ") || "aucun motif récurrent";

  return `Tu es coach de prononciation anglaise pour francophones.

IMPORTANT : le diagnostic est DÉJÀ FAIT par alignement automatique entre la phrase cible et ce que le moteur de reconnaissance vocale a réellement entendu. Tu ne dois RIEN réévaluer, RIEN noter, et surtout NE JAMAIS inventer de transcription phonétique de ce que l'apprenant aurait prononcé : tu ne disposes pas du signal audio.

Phrase cible : "${expected}"
Transcription obtenue : "${transcript}"
Score calculé : ${scoring?.score ?? "?"} / 100 (fiabilité : ${scoring?.confidence ?? "?"})
Motifs récurrents détectés : ${issues}

DIVERGENCES OBSERVÉES :
${observed}

Ta tâche : expliquer ces divergences et donner un entraînement immédiat.
Pour chaque divergence, tu peux donner l'IPA de RÉFÉRENCE du mot cible (c'est un fait de dictionnaire, c'est autorisé), mais jamais une IPA "détectée".

${JSON_ONLY}
{
  "diagnosis": "<2 phrases maximum, en français : ce qui bloque vraiment>",
  "words": [
    { "word": "<mot cible>", "referenceIpa": "<IPA du dictionnaire>", "articulation": "<comment placer langue/lèvres, une ligne en français>" }
  ],
  "minimalPairs": [ { "a": "<mot>", "b": "<mot contrastant>", "focus": "<son travaillé>" } ],
  "drill": "<exercice de 3 minutes, très concret, en français>",
  "nextSentence": "<une phrase anglaise de 10 à 15 mots qui recharge exactement les sons ratés>"
}`;
}

/** Explication d'une dictée déjà corrigée mot à mot. */
export function buildDictationFeedbackPrompt({ expected, written, scoring }) {
  const errors = (scoring?.errors || [])
    .map((e) => `- ${e.label} ×${e.count} : ${e.examples.map((x) => `"${x.expected}"→"${x.written || "∅"}"`).join(", ")}`)
    .join("\n") || "- aucune erreur";

  return `Tu es professeur d'anglais. La dictée est DÉJÀ corrigée mot à mot par un algorithme d'alignement : le score et le typage des erreurs sont établis, ne les recalcule pas.

Texte dicté : "${expected}"
Texte écrit : "${written}"
Score : ${scoring?.score ?? "?"} / 100 — ${scoring?.correct ?? 0} mots exacts sur ${scoring?.total ?? 0}

ERREURS TYPÉES :
${errors}

Ta tâche : expliquer POURQUOI l'oreille a fauté (pas seulement quoi corriger), et transformer chaque erreur récurrente en fiche de révision.

${JSON_ONLY}
{
  "listeningDiagnosis": "<2 phrases en français : ce qui échappe à l'oreille, pas à l'orthographe>",
  "mistakes": [
    {
      "originalText": "<mot ou groupe écrit par l'apprenant>",
      "correctedText": "<version correcte>",
      "rule": "<explication brève en français>",
      "oralFeedback": "<phrase courte en français à écouter>",
      "flashcard": { "front": "<question directe en français>", "back": "<réponse en anglais>" }
    }
  ],
  "nextAudioAdvice": "<une ligne : accent, vitesse ou type d'audio à travailler ensuite>"
}`;
}

/**
 * Exercice généré pour une erreur précise de la taxonomie.
 * C'est ce qui transforme le diagnostic en travail : on ne dit plus
 * « travaille ta grammaire », on donne l'exercice exact.
 */
export function buildTargetedDrillPrompt({ errorType, level = "B1", examples = [], minutes = 10 }) {
  const meta = ERROR_TAXONOMY[errorType];
  if (!meta) return null;
  const sample = examples.length
    ? `\nERREURS RÉELLES DE CET APPRENANT (réutilise-les telles quelles) :\n${examples
        .map((e) => `- "${e.original || e.expected}" → "${e.corrected || e.written || "?"}"`)
        .join("\n")}`
    : "";

  return `Tu es concepteur d'exercices d'anglais. Génère UN exercice de ${minutes} minutes sur un point unique.

Point travaillé : ${meta.label} (clé : ${errorType})
Format d'exercice attendu : ${meta.drill}
Compétence : ${meta.skill}
Niveau de l'apprenant : ${level}
L'apprenant est francophone.${sample}

Contraintes :
- Un seul point travaillé. Aucune digression.
- Les items doivent être des phrases réalistes, jamais des phrases d'école.
- La correction explique la règle en une ligne, en français.

${JSON_ONLY}
{
  "title": "<titre court en français>",
  "rule": "<la règle en 2 lignes maximum, en français>",
  "items": [
    { "prompt": "<consigne ou phrase à transformer, en anglais>", "answer": "<réponse attendue>", "why": "<une ligne en français>" }
  ],
  "commonTrap": "<le piège typique du francophone sur ce point, une ligne>"
}
Génère entre 6 et 10 items.`;
}

/**
 * Consigne de séance hebdomadaire : convertit le plan calculé en un briefing
 * lisible. Le plan (minutes, compétences) est déjà décidé par cefrModel.
 */
export function buildWeeklyBriefingPrompt({ profile, plan }) {
  const sessions = (plan?.sessions || [])
    .map((s) => `- ${s.label} : ${s.minutes} min${s.blocking ? " (BLOQUANT)" : ""}${s.focus?.length ? ` — priorités : ${s.focus.map((f) => f.label).join(", ")}` : ""}`)
    .join("\n");

  return `Tu es coach d'anglais. Le diagnostic et la répartition du temps sont DÉJÀ CALCULÉS — ne les modifie pas, ne recalcule aucun niveau.

Niveau global mesuré : ${profile?.overall?.label || "non établi"} (confiance ${profile?.confidence ?? 0})
Maillon faible : ${profile?.bottleneck?.label || "non établi"}
Objectif : ${plan?.target || "?"} — état de préparation : ${Math.round((plan?.readiness || 0) * 100)} %

RÉPARTITION DÉCIDÉE :
${sessions}

${JSON_ONLY}
{
  "headline": "<une phrase en français : l'enjeu de la semaine>",
  "days": [
    { "day": "<Lundi…Dimanche>", "focus": "<compétence>", "task": "<tâche concrète et faisable>", "minutes": <entier> }
  ],
  "successCriteria": "<comment savoir, dimanche soir, que la semaine a été utile>",
  "trap": "<l'erreur de méthode à éviter cette semaine, une ligne>"
}`;
}

export const _taxonomy = { TYPE_KEYS, taxonomyBrief };
