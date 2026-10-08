// tests/englishEngine.test.mjs
// Tests des moteurs déterministes : fréquence lexicale, mesures de production,
// prononciation alignée, dictée typée, et raccordement au modèle CECRL.
import test from "node:test";
import assert from "node:assert/strict";

import { lexicalProfile, frequencyBand, lemmatize, tokenize } from "../lib/english/wordFrequency.js";
import { measureProduction, metricsToEvidence, splitSentences } from "../lib/english/productionMetrics.js";
import {
  scorePronunciation,
  alignWords,
  phoneticDistance,
  normalizeWords,
  recurringPhonemeIssues,
} from "../lib/english/pronunciationScoring.js";
import { scoreDictation, classifyDictationError, recurringDictationWords } from "../lib/english/dictationScoring.js";
import { computeProfile, gateToNextLevel, weeklyPlan, errorPriorities } from "../lib/english/cefrModel.js";
import { buildPronunciationCoachPrompt, buildTargetedDrillPrompt } from "../lib/english/feedbackPrompts.js";
import { buildSession, priorityScore, forecastLoad } from "../lib/srs/scheduler.js";

// ─── Fréquence lexicale ────────────────────────────────────────────────────
test("lemmatisation des formes irrégulières et régulières", () => {
  assert.equal(lemmatize("went"), "go");
  assert.equal(lemmatize("children"), "child");
  assert.equal(lemmatize("running"), "run");
  assert.equal(lemmatize("studies"), "study");
});

test("les bandes de fréquence distinguent courant et rare", () => {
  assert.ok(frequencyBand("the") <= 1);
  assert.ok(frequencyBand("ubiquitous") >= 3, "vocabulaire avancé");
  assert.equal(frequencyBand("photosynthesis"), 4, "hors des bandes courantes");
});

test("un texte riche obtient un Guiraud supérieur à un texte pauvre", () => {
  const pauvre = lexicalProfile("I like it. I like it a lot. I like it very much. I like this thing.");
  const riche = lexicalProfile(
    "The unprecedented decline in biodiversity threatens agricultural resilience, compelling policymakers to reconsider entrenched subsidies.",
  );
  assert.ok(riche.guiraud > pauvre.guiraud, `${riche.guiraud} doit dépasser ${pauvre.guiraud}`);
  assert.ok(riche.rareWordRatio > pauvre.rareWordRatio);
});

// ─── Mesures de production ─────────────────────────────────────────────────
test("découpage en phrases robuste aux abréviations", () => {
  const s = splitSentences("I met Dr. Smith today. He was late. Was he?");
  assert.equal(s.length, 3);
});

test("la subordination est détectée", () => {
  const simple = measureProduction("I go to work. I eat lunch. I come home.");
  const complexe = measureProduction(
    "Although I go to work early, I usually eat lunch late, which means that I come home exhausted.",
  );
  assert.ok(complexe.subordinationRatio > simple.subordinationRatio);
});

test("le débit n'est calculé que si la durée est fournie", () => {
  const sansDuree = measureProduction("This is a spoken sample of text.", { activity: "speaking" });
  assert.ok(!sansDuree.wordsPerMinute);
  const avecDuree = measureProduction("This is a spoken sample of text.", { activity: "speaking", durationSec: 12 });
  assert.ok(avecDuree.wordsPerMinute > 0);
});

test("les mesures se convertissent en preuve exploitable par le modèle CECRL", () => {
  const m = measureProduction(
    "Even though the proposal seemed reasonable at first, the committee eventually rejected it because the underlying assumptions were never verified.",
    { activity: "writing" },
  );
  const ev = metricsToEvidence(m, { activity: "writing" });
  assert.ok(ev);
  assert.equal(typeof ev.words, "number");
  const profile = computeProfile([ev]);
  assert.ok(profile.skills);
});

// ─── Prononciation ─────────────────────────────────────────────────────────
test("l'alignement retrouve un mot manqué sans décaler le reste", () => {
  const steps = alignWords(normalizeWords("I want to go home now"), normalizeWords("I want go home now"));
  const deletions = steps.filter((s) => s.op === "omission");
  assert.equal(deletions.length, 1);
  assert.equal(deletions[0].expected, "to");
  assert.equal(steps.filter((s) => s.op === "match").length, 5);
});

test("une lecture identique n'est pas notée 100 sur 100", () => {
  const r = scorePronunciation({
    expected: "The weather in November is often colder than people expect",
    transcript: "The weather in November is often colder than people expect",
  });
  // Une transcription correcte ne PROUVE pas une prononciation parfaite :
  // Whisper normalise. Le moteur doit rester prudent.
  assert.ok(r.score <= 95, `score=${r.score}`);
  assert.ok(r.reliability.length > 0);
});

test("une lecture dégradée est notée nettement plus bas", () => {
  const bonne = scorePronunciation({
    expected: "I think the third thing is really important for them",
    transcript: "I think the third thing is really important for them",
  });
  const mauvaise = scorePronunciation({
    expected: "I think the third thing is really important for them",
    transcript: "I sink de sird sing is really important for dem",
  });
  assert.ok(mauvaise.score < bonne.score - 20, `${mauvaise.score} vs ${bonne.score}`);
  assert.ok(mauvaise.issues.length > 0);
});

test("une phrase trop courte est signalée comme peu fiable", () => {
  const r = scorePronunciation({ expected: "Hello there", transcript: "Hello there" });
  assert.ok(r.confidence < 0.5);
  assert.match(r.reliability, /courte/i);
});

test("sans phrase de référence, aucun score de prononciation n'est inventé", () => {
  const r = scorePronunciation({ expected: "", transcript: "I went to the market yesterday", durationSec: 10 });
  assert.equal(r.score, null);
  assert.equal(r.mode, "free-speech");
});

test("les difficultés phonétiques récurrentes remontent", () => {
  const attempts = [
    scorePronunciation({ expected: "think about this thing", transcript: "sink about dis sing" }),
    scorePronunciation({ expected: "three things there", transcript: "sree sings dere" }),
  ];
  const issues = recurringPhonemeIssues(attempts);
  assert.ok(issues.length > 0);
});

test("la distance phonétique est cohérente", () => {
  assert.ok(phoneticDistance("their", "there") < phoneticDistance("their", "banana"));
});

// ─── Dictée ────────────────────────────────────────────────────────────────
test("un mot oublié en début de dictée ne détruit plus le score", () => {
  const expected = "The manager said that the meeting would start at nine in the morning";
  const written = "manager said that the meeting would start at nine in the morning";
  const r = scoreDictation(expected, written);
  // 13 mots sur 14 corrects : le score doit rester élevé, pas s'effondrer.
  assert.ok(r.score >= 85, `score=${r.score}`);
  assert.equal(r.errors[0].type, "missed");
});

test("les types d'erreurs sont distingués", () => {
  assert.equal(classifyDictationError("their", "there"), "homophone");
  assert.equal(classifyDictationError("receive", "recieve"), "spelling");
  assert.equal(classifyDictationError("walked", "walk"), "morphology");
  assert.equal(classifyDictationError("thirteen", "thirty"), "number");
});

test("une orthographe fautive coûte moins cher qu'un mot totalement raté", () => {
  const base = "I would like to receive the document before tomorrow morning please";
  const ortho = scoreDictation(base, "I would like to recieve the document before tomorrow morning please");
  const rate = scoreDictation(base, "I would like to elephant the document before tomorrow morning please");
  assert.ok(ortho.score > rate.score, `${ortho.score} doit dépasser ${rate.score}`);
});

test("une dictée parfaite vaut 100", () => {
  const t = "She has been working here since two thousand and nineteen without a single complaint";
  assert.equal(scoreDictation(t, t).score, 100);
});

test("une réponse vide ne plante pas", () => {
  const r = scoreDictation("Hello world", "");
  assert.equal(r.score, 0);
  assert.equal(r.diff.length, 2);
});

test("les mots ratés de façon répétée sont identifiés", () => {
  const a = scoreDictation("their house is there", "there house is there");
  const b = scoreDictation("their car is old", "there car is old");
  const rec = recurringDictationWords([a, b]);
  assert.ok(rec.some((w) => w.word === "their"));
});

// ─── Raccordement CECRL ────────────────────────────────────────────────────
test("le niveau est stable : mêmes preuves, même résultat", () => {
  const ev = [
    metricsToEvidence(measureProduction("Although the report was thorough, it failed to address the underlying cause, which frustrated the entire committee.", { activity: "writing" }), { activity: "writing" }),
    metricsToEvidence(measureProduction("I would rather postpone the launch than release something that nobody has tested properly.", { activity: "writing" }), { activity: "writing" }),
    metricsToEvidence(measureProduction("We discussed the proposal for a long time before we finally agreed on a compromise.", { activity: "speaking", durationSec: 20 }), { activity: "speaking", durationSec: 20 }),
  ].filter(Boolean);
  const a = computeProfile(ev);
  const b = computeProfile(ev);
  assert.deepEqual(a.skills, b.skills);
  assert.equal(a.overallScale, b.overallScale);
});

test("le plan hebdomadaire donne plus de temps à la compétence qui bloque", () => {
  const profile = computeProfile([
    { date: new Date().toISOString(), activity: "writing", words: 200, distinctLemmas: 120, rareWordRatio: 0.2, meanUtteranceLength: 18, subordinationRatio: 0.5, errors: 1, errorTypes: [] },
    { date: new Date().toISOString(), activity: "listening", words: 100, listeningAccuracy: 0.4, errors: 8, errorTypes: ["detail_miss"] },
    { date: new Date().toISOString(), activity: "shadowing", words: 90, pronunciationScore: 45, errors: 5, errorTypes: ["th_sound"] },
  ]);
  const plan = weeklyPlan(profile, []);
  assert.ok(plan.sessions.length > 0);
  const total = plan.sessions.reduce((a, s) => a + s.minutes, 0);
  assert.ok(Math.abs(total - plan.minutesPerWeek) <= 10);
  assert.ok(plan.sessions[0].minutes >= plan.sessions[plan.sessions.length - 1].minutes);
});

test("les critères de passage au niveau suivant sont explicites", () => {
  const gate = gateToNextLevel(computeProfile([]));
  assert.ok(gate.target);
  assert.equal(gate.criteria.length, 6);
});

test("les erreurs anciennes pèsent moins que les récentes", () => {
  const vieux = new Date(Date.now() - 120 * 86400000).toISOString();
  const recent = new Date().toISOString();
  const p = errorPriorities([
    { date: vieux, errorTypes: ["article", "article", "article"] },
    { date: recent, errorTypes: ["th_sound"] },
  ]);
  assert.equal(p[0].type, "th_sound");
});

// ─── Ordonnanceur de révisions ─────────────────────────────────────────────
const card = (over, extra = {}) => ({
  id: `c${over}_${Math.random()}`,
  nextReview: new Date(Date.now() - over * 86400000).toISOString().slice(0, 10),
  stability: 5,
  difficulty: 5,
  repetitions: 3,
  lapses: 0,
  category: "Général",
  ...extra,
});

test("une fiche très en retard passe avant une fiche juste due", () => {
  const enRetard = card(20);
  const justeDue = card(0);
  assert.ok(priorityScore(enRetard) > priorityScore(justeDue));
});

test("la session respecte le budget de temps", () => {
  const cards = Array.from({ length: 200 }, (_, i) => card(i % 15));
  const { queue, stats } = buildSession(cards, { budgetMinutes: 10, maxCards: 200 });
  assert.ok(queue.length < cards.length);
  assert.ok(stats.estimatedMinutes <= 11, `estimé=${stats.estimatedMinutes}`);
});

test("la file entrelace les catégories pour limiter l'interférence", () => {
  const cards = [
    ...Array.from({ length: 6 }, () => card(3, { category: "A" })),
    ...Array.from({ length: 6 }, () => card(3, { category: "B" })),
  ];
  const { queue } = buildSession(cards, { budgetMinutes: 60, maxCards: 12 });
  let switches = 0;
  for (let i = 1; i < queue.length; i++) if (queue[i].category !== queue[i - 1].category) switches++;
  assert.ok(switches >= 4, `alternances=${switches}`);
});

test("la prévision de charge détecte une vague", () => {
  const cards = Array.from({ length: 80 }, () => card(-5));
  const f = forecastLoad(cards, 30);
  assert.equal(f.total, 80);
  assert.ok(f.peak >= 80);
});

// ─── Consignes IA ──────────────────────────────────────────────────────────
test("le prompt de prononciation interdit explicitement l'IPA inventée", () => {
  const scoring = scorePronunciation({ expected: "I think this", transcript: "I sink dis" });
  const prompt = buildPronunciationCoachPrompt({ expected: "I think this", transcript: "I sink dis", scoring });
  assert.match(prompt, /JAMAIS inventer/i);
  assert.ok(!/detectedIpa/.test(prompt));
});

test("un exercice ciblé n'est généré que pour un type d'erreur connu", () => {
  assert.equal(buildTargetedDrillPrompt({ errorType: "inexistant" }), null);
  const p = buildTargetedDrillPrompt({ errorType: "th_sound", examples: [{ original: "sink", corrected: "think" }] });
  assert.match(p, /sink/);
});
