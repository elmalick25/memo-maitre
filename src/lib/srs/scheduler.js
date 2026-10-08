// src/lib/srs/scheduler.js
// ════════════════════════════════════════════════════════════════════════════
// Ordonnanceur de session — décide QUOI réviser, DANS QUEL ORDRE, COMBIEN.
// ════════════════════════════════════════════════════════════════════════════
// Un moteur FSRS correct ne suffit pas : sans ordonnanceur, une file de
// révision est soit un mur de 300 fiches, soit une liste triée par date qui
// ignore le coût réel de l'oubli. Ce module applique quatre principes :
//
//   1. URGENCE  — on révise d'abord ce qui est en train d'être perdu, mesuré
//                 par la retrievabilité réelle, pas par la date d'échéance.
//   2. VALEUR   — une fiche fragile mais stratégique (catégorie prioritaire,
//                 fiche jamais produite à l'oral) passe devant une fiche déjà
//                 solide et accessoire.
//   3. CHARGE   — la session est bornée par un budget de temps estimé, pas par
//                 un nombre de fiches arbitraire.
//   4. INTERFÉRENCE — deux fiches sémantiquement proches ne se suivent jamais
//                 (interleaving), ce qui est ce qui produit un vrai transfert.
// ════════════════════════════════════════════════════════════════════════════

import { retrievability } from "./fsrsCore.js";
import { diffDays, today as todayISO, normalizeDate } from "../../utils/dateUtils.js";

/** Coût moyen d'une fiche, en secondes, selon son état. */
const COST_SECONDS = { new: 35, relearning: 25, review: 12 };

export const LEECH_LAPSE_THRESHOLD = 6;

/** Retrievabilité actuelle d'une fiche (0–1). Une fiche neuve vaut 0. */
export function currentRetrievability(card, currentDate = todayISO()) {
  const S = Number(card?.stability) || 0;
  if (!(S > 0)) return 0;
  const last = normalizeDate(card?.lastReviewDate || card?.nextReview);
  if (!last) return 0;
  return retrievability(Math.max(0, diffDays(currentDate, last)), S);
}

/**
 * Urgence d'une fiche : perte de connaissance attendue si on ne la revoit pas
 * aujourd'hui. Maximale autour de la cible de rétention, faible si la fiche est
 * encore parfaitement sue ou déjà complètement oubliée (auquel cas le coût de
 * ré-apprentissage est le même demain).
 */
export function urgency(card, opts = {}) {
  const { currentDate = todayISO(), targetRetention = 0.9 } = opts;
  const R = currentRetrievability(card, currentDate);
  const S = Number(card?.stability) || 0;

  if (!(S > 0)) return 0.55; // fiche neuve : importante mais pas urgente
  // Distance sous la cible, pondérée par la fragilité (faible stabilité).
  const deficit = Math.max(0, targetRetention - R);
  const fragility = 1 / (1 + Math.log10(1 + S));
  const overdueBoost = R < 0.6 ? 0.15 : 0;
  return deficit * (0.6 + 0.4 * fragility) + overdueBoost;
}

/** Une fiche « sangsue » : beaucoup d'échecs pour une stabilité qui stagne. */
export function isLeech(card) {
  const lapses = Number(card?.lapses) || countLapses(card);
  return lapses >= LEECH_LAPSE_THRESHOLD && (Number(card?.stability) || 0) < 7;
}

function countLapses(card) {
  const h = Array.isArray(card?.reviewHistory) ? card.reviewHistory : [];
  return h.filter((e) => e?.grade === 1 || e?.q === 0).length;
}

/**
 * Score de priorité global d'une fiche.
 * @param {Object} card
 * @param {Object} ctx { currentDate, targetRetention, priorityCategories:Set,
 *                       needsProduction:Set }
 */
export function priorityScore(card, ctx = {}) {
  const {
    currentDate = todayISO(),
    targetRetention = 0.9,
    priorityCategories = new Set(),
    needsProduction = new Set(),
  } = ctx;

  let score = urgency(card, { currentDate, targetRetention }) * 100;
  if (priorityCategories.has(card?.category)) score *= 1.35;
  if (needsProduction.has(card?.id)) score *= 1.2;
  if (isLeech(card)) score *= 1.5; // une sangsue traitée tôt, tête reposée
  const daysLate = card?.nextReview ? Math.max(0, diffDays(currentDate, card.nextReview)) : 0;
  score += Math.min(20, daysLate * 0.8);
  return score;
}

/** Coût estimé d'une fiche en secondes. */
export function estimatedCost(card) {
  if (!(Number(card?.stability) > 0) || !(Number(card?.repetitions) > 0)) return COST_SECONDS.new;
  if (card?.state === "relearning" || currentRetrievabilityIsLow(card)) return COST_SECONDS.relearning;
  return COST_SECONDS.review;
}

function currentRetrievabilityIsLow(card) {
  return (Number(card?.difficulty) || 5) >= 7.5;
}

/**
 * Évite que deux fiches proches (même catégorie, ou libellés très similaires)
 * se suivent : l'interférence rétroactive est la première cause d'oubli des
 * paires de vocabulaire proches.
 */
export function interleave(cards) {
  const remaining = [...cards];
  const out = [];
  let lastCategory = null;
  while (remaining.length) {
    let idx = remaining.findIndex((c) => c.category !== lastCategory);
    if (idx === -1) idx = 0;
    const [picked] = remaining.splice(idx, 1);
    out.push(picked);
    lastCategory = picked.category;
  }
  return out;
}

/**
 * Construit la session du jour.
 *
 * @param {Array} cards         toutes les fiches candidates (déjà dues + neuves)
 * @param {Object} opts         { budgetMinutes, maxCards, targetRetention,
 *                                priorityCategories, needsProduction, currentDate,
 *                                newCardRatio }
 * @returns {{queue:Array, skipped:Array, stats:Object}}
 */
export function buildSession(cards = [], opts = {}) {
  const {
    budgetMinutes = 20,
    maxCards = 120,
    targetRetention = 0.9,
    priorityCategories = [],
    needsProduction = [],
    currentDate = todayISO(),
    newCardRatio = 0.25,
  } = opts;

  const ctx = {
    currentDate,
    targetRetention,
    priorityCategories: new Set(priorityCategories),
    needsProduction: new Set(needsProduction),
  };

  const scored = cards
    .map((card) => ({ card, score: priorityScore(card, ctx), cost: estimatedCost(card) }))
    .sort((a, b) => b.score - a.score);

  const isNew = (c) => !(Number(c?.repetitions) > 0);
  const budgetSeconds = Math.max(60, budgetMinutes * 60);
  const newBudget = Math.floor(maxCards * newCardRatio);

  const picked = [];
  const skipped = [];
  let spent = 0;
  let newCount = 0;

  for (const entry of scored) {
    const overTime = spent + entry.cost > budgetSeconds;
    const overCount = picked.length >= maxCards;
    const overNew = isNew(entry.card) && newCount >= newBudget;
    if (overTime || overCount || overNew) {
      skipped.push(entry.card);
      continue;
    }
    picked.push(entry.card);
    spent += entry.cost;
    if (isNew(entry.card)) newCount++;
  }

  return {
    queue: interleave(picked),
    skipped,
    stats: {
      selected: picked.length,
      skipped: skipped.length,
      newCards: newCount,
      estimatedMinutes: Math.round(spent / 60),
      leeches: picked.filter(isLeech).length,
    },
  };
}

/**
 * Prévision de charge : combien de fiches par jour sur les N prochains jours.
 * Sert à détecter une vague avant qu'elle n'arrive et à lisser les intervalles.
 */
export function forecastLoad(cards = [], days = 30, currentDate = todayISO()) {
  const buckets = new Array(days).fill(0);
  for (const card of cards) {
    if (!card?.nextReview) continue;
    const d = diffDays(card.nextReview, currentDate);
    if (d >= 0 && d < days) buckets[d]++;
    else if (d < 0) buckets[0]++;
  }
  const total = buckets.reduce((a, b) => a + b, 0);
  const mean = total / days;
  const peak = Math.max(...buckets, 0);
  return {
    buckets,
    total,
    mean: +mean.toFixed(1),
    peak,
    peakDay: buckets.indexOf(peak),
    overloaded: peak > mean * 2.5 && peak > 40,
  };
}
