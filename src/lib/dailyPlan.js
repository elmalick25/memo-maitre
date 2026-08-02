// ═══════════════════════════════════════════════════════════════════════════
// dailyPlan.js — Couche 9 : le PLAN DU JOUR persistant (source de vérité unique)
// ═══════════════════════════════════════════════════════════════════════════
//
// PROBLÈME CORRIGÉ (diagnostic complet)
// -------------------------------------
// Avant ce module, la « session du jour » (couche 2, memoryLab.composeDailySession)
// était recalculée À CHAQUE RENDU à partir de la pile due restante :
//
//   pile = 200 dues  →  composeDailySession → 35 fiches servies
//   l'utilisateur en révise 20 → pile = 180 dues
//   il ressort, il rentre       →  composeDailySession → 35 fiches À NOUVEAU
//
// Conséquences observées (toutes causées par cette absence d'état) :
//   1. Le compteur « 35 à réviser » ne descendait JAMAIS pendant la journée.
//   2. Le quota quotidien était contournable à l'infini (35, puis 35, puis 35…)
//      → l'objectif pédagogique du plafond (35 max/jour) n'était pas tenu.
//   3. Les compteurs par module (constellation, cartes de modules) comptaient la
//      pile BRUTE due, pas la part du module DANS les 35 → on pouvait voir un
//      module afficher « 60 dus » alors que le total du jour était 35, et la
//      somme des modules dépassait largement le total affiché.
//   4. La composition changeait à chaque entrée (leech/backlog/consolidation
//      recalculés) : ce n'étaient pas les mêmes 35 fiches d'une entrée à l'autre.
//   5. Une fiche notée « Again » (q=0 → interval 0 → nextReview = aujourd'hui)
//      restait due, donc recomptée, donc la pile ne descendait pas non plus.
//
// SOLUTION
// --------
// Un PLAN quotidien persistant, scellé au premier calcul de la journée :
//
//   { date, target, sealed, ids: [...], doneIds: [...] }
//
//   • `target`  : plafond du jour, figé le matin selon la taille de la pile
//                 (DAILY_SESSION_TIERS). Il ne bouge plus de la journée, même
//                 si la pile diminue au fur et à mesure des révisions.
//   • `ids`     : LES fiches du jour, dans l'ordre décidé une seule fois.
//   • `doneIds` : fiches déjà traitées aujourd'hui (même notées « Again »).
//
//   restant du jour = ids − doneIds (et encore dues)
//   servi du jour   = ids  (≤ target)
//
// Le compteur descend donc réellement (35 → 34 → …), les modules affichent leur
// part exacte des 35 (somme des modules === total affiché), et le plafond est
// tenu : une fois les 35 faites, la journée est terminée (un mode « bonus »
// explicite reste possible, mais il est choisi, pas subi).
//
// Aucune fiche n'est perdue : celles hors plan restent dues et reviennent
// demain, en tête de priorité (retard le plus ancien).
//
// Toutes les fonctions de ce module sont PURES.

import { composeDailySession, getDailySessionTarget } from "./memoryLab.js";

export const DAILY_PLAN_STORAGE_KEY = "memomaitre_dailyPlan_v1";

/** Plan vide pour une date donnée. */
export function makeDailyPlan(dateISO) {
  // `sealedAt` : horodatage du scellement. Il sert d'ARBITRE entre appareils —
  // le plan scellé le plus tôt impose son ordre et son plafond aux autres
  // (voir lib/dayStateMerge.js). Sans lui, chaque appareil gardait son propre
  // plan et donc son propre compteur (34 ici, 31 là).
  return { date: dateISO, target: null, sealed: false, sealedAt: null, ids: [], doneIds: [], bonusIds: [] };
}

const uniq = (arr) => Array.from(new Set(arr));

/**
 * Normalise un plan chargé depuis localStorage / une autre session.
 * Repart de zéro si la date a changé (nouveau jour → nouveau quota).
 */
export function normalizeDailyPlan(raw, todayISO) {
  if (!raw || typeof raw !== "object" || raw.date !== todayISO) {
    return makeDailyPlan(todayISO);
  }
  const ids = Array.isArray(raw.ids) ? uniq(raw.ids.filter((id) => id !== undefined && id !== null)) : [];
  const doneIds = Array.isArray(raw.doneIds) ? uniq(raw.doneIds.filter((id) => id !== undefined && id !== null)) : [];
  const target = raw.target === null || raw.target === undefined ? null : Number(raw.target);
  const sealedAt = Number(raw.sealedAt);
  return {
    date: todayISO,
    target: Number.isFinite(target) ? target : null,
    sealed: raw.sealed === true,
    sealedAt: Number.isFinite(sealedAt) && sealedAt > 0 ? sealedAt : null,
    ids,
    doneIds,
    // Révisions volontaires hors plan : comptées comme faites, mais elles ne
    // consomment pas le quota du jour.
    bonusIds: Array.isArray(raw.bonusIds) ? uniq(raw.bonusIds.filter((id) => id !== undefined && id !== null)) : [],
  };
}

/**
 * Construit / met à jour le plan du jour.
 *
 * @param {object}   opts
 * @param {object}   opts.plan      plan persistant courant (peut être null)
 * @param {Array}    opts.dueCards  fiches RÉELLEMENT dues maintenant
 * @param {string}   opts.todayISO  date du jour
 * @param {function} [opts.compose] injectable pour les tests
 * @returns {{plan: object, remaining: Array, remainingCount: number,
 *            doneCount: number, plannedCount: number, target: number|null,
 *            pileSize: number, capped: boolean, completed: boolean}}
 */
export function buildDailyPlan({ plan, dueCards, todayISO, reviewedTodayIds = [], compose = composeDailySession, now = Date.now } = {}) {
  const cards = Array.isArray(dueCards) ? dueCards : [];
  let base = normalizeDailyPlan(plan, todayISO);

  // Auto-intégration des fiches révisées aujourd'hui (même si faites sur un autre appareil)
  if (Array.isArray(reviewedTodayIds) && reviewedTodayIds.length > 0) {
    for (const id of reviewedTodayIds) {
      if (!base.doneIds.includes(id)) {
        base.doneIds.push(id);
        if (!base.ids.includes(id)) {
          // On l'ajoute au plan officiel (pas en bonus) pour qu'elle consomme le quota.
          base.ids.push(id);
        }
      }
    }
  }

  const byId = new Map();
  for (const c of cards) if (c && c.id !== undefined) byId.set(c.id, c);

  const doneSet = new Set(base.doneIds);

  // Taille RÉELLE de la pile du jour = ce qui reste dû + ce qui a déjà été
  // traité aujourd'hui et n'est plus dû (sinon le plafond remonterait après
  // chaque fiche révisée).
  const doneAndGone = base.doneIds.filter((id) => !byId.has(id)).length;
  const pileSize = cards.length + doneAndGone;

  // Le plafond est FIGÉ pour la journée (scellé au premier calcul), MAIS il
  // reste borné par le palier correspondant à la pile RÉELLE du jour.
  // Sans cette borne, un plan scellé le matin sur une petite pile (palier
  // « aucun plafond » → target null) absorbait ensuite TOUTE la pile si celle-ci
  // grossissait dans la journée (import, déverrouillage, fiches arrivant à
  // échéance) : c'est exactement le bug « 244 à réviser » alors que le plafond
  // du jour est 35.
  const tierTarget = getDailySessionTarget(pileSize);
  const sealedTarget = base.sealed ? base.target : tierTarget;
  let target;
  if (sealedTarget === null || sealedTarget === undefined) target = tierTarget;
  else if (tierTarget === null || tierTarget === undefined) target = sealedTarget;
  else target = Math.min(sealedTarget, tierTarget);

  // Fiches du plan encore valides : toujours dues, ou déjà faites aujourd'hui.
  const bonusSet = new Set(base.bonusIds);
  const keptAll = base.ids.filter((id) => byId.has(id) || doneSet.has(id));

  // Les révisions BONUS (hors plan, choisies explicitement) ne consomment pas
  // le quota du jour : elles s'ajoutent au plan sans en réduire le contenu.
  const bonusKept = keptAll.filter((id) => bonusSet.has(id));
  const planKept = keptAll.filter((id) => !bonusSet.has(id));
  const doneInPlan = planKept.filter((id) => doneSet.has(id));
  const pendingKept = planKept.filter((id) => !doneSet.has(id));

  // Le plafond porte sur (déjà fait du plan + restant du plan) : le compteur
  // ne peut donc que descendre, et jamais dépasser la cible du jour.
  const capacity = target === null || target === undefined ? Infinity : Math.max(0, target);
  const room = capacity === Infinity ? Infinity : Math.max(0, capacity - doneInPlan.length);
  const allowedPending = room === Infinity ? pendingKept : pendingKept.slice(0, room);
  const allowedSet = new Set([...doneInPlan, ...allowedPending, ...bonusKept]);
  // On tronque le plan au plafond : les fiches en trop restent dues et
  // reviennent demain, en tête de priorité (retard le plus ancien).
  const kept = keptAll.filter((id) => allowedSet.has(id));

  // Complément : si le plan n'atteint pas la cible (premier calcul du jour,
  // fiches ajoutées/déverrouillées en cours de journée), on comble les places
  // libres avec la même priorisation (leech > retard > dues > consolidation).
  const keptSet = new Set(kept);
  const freeSlots = room === Infinity ? Infinity : room - allowedPending.length;
  let ids = kept;
  if (freeSlots > 0) {
    const candidates = cards.filter((c) => !keptSet.has(c.id) && !doneSet.has(c.id));
    if (candidates.length > 0) {
      const composed = compose(candidates, {
        todayISO,
        target: Number.isFinite(freeSlots) ? freeSlots : null,
      });
      ids = kept.concat(composed.slice(0, Number.isFinite(freeSlots) ? freeSlots : composed.length).map((c) => c.id));
    }
  }

  // Restant : dans l'ORDRE du plan, non fait, et encore dû.
  const remaining = ids.filter((id) => !doneSet.has(id) && byId.has(id)).map((id) => byId.get(id));

  // On ne garde en `doneIds` que ce qui appartient au plan du jour (les
  // révisions « bonus » hors plan sont intégrées via markCardDone).
  const nextPlan = {
    date: todayISO,
    target: target === undefined ? null : target,
    sealed: true,
    // Le scellement n'est horodaté qu'une fois, à la création du plan : il ne
    // doit plus jamais bouger, sinon l'arbitrage entre appareils oscillerait.
    sealedAt: base.sealedAt ?? (ids.length > 0 ? now() : null),
    ids,
    doneIds: base.doneIds.filter((id) => ids.includes(id)),
    bonusIds: base.bonusIds.filter((id) => ids.includes(id)),
  };

  const doneCount = nextPlan.doneIds.length;
  return {
    plan: nextPlan,
    remaining,
    remainingCount: remaining.length,
    doneCount,
    plannedCount: ids.length,
    target: nextPlan.target,
    pileSize,
    capped: target !== null && pileSize > target,
    completed: ids.length > 0 && remaining.length === 0,
  };
}

/**
 * Marque une fiche comme traitée aujourd'hui.
 * Une fiche révisée hors plan (mode examen / bonus) est ajoutée au plan pour
 * que le compteur « fait aujourd'hui » reste exact sans jamais faire remonter
 * le restant.
 */
export function markCardDone(plan, cardId, todayISO) {
  const base = normalizeDailyPlan(plan, todayISO);
  if (cardId === undefined || cardId === null) return base;
  const isOutsidePlan = !base.ids.includes(cardId);
  const ids = isOutsidePlan ? [...base.ids, cardId] : base.ids;
  const doneIds = base.doneIds.includes(cardId) ? base.doneIds : [...base.doneIds, cardId];
  const bonusIds = isOutsidePlan && !base.bonusIds.includes(cardId)
    ? [...base.bonusIds, cardId]
    : base.bonusIds;
  return { ...base, sealed: true, ids, doneIds, bonusIds };
}

/** Répartition du restant par module (somme === restant total, garanti). */
export function remainingByCategory(remaining) {
  const out = new Map();
  for (const c of Array.isArray(remaining) ? remaining : []) {
    const key = c?.category || "Sans module";
    out.set(key, (out.get(key) || 0) + 1);
  }
  return out;
}

/** Nombre de fiches restantes du jour pour un module donné. */
export function remainingForCategory(remaining, categoryName) {
  return (Array.isArray(remaining) ? remaining : []).filter((c) => c?.category === categoryName).length;
}
