// src/lib/db/syncSignature.js
//
// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE D'ÉTAT — détection de divergence à coût ZÉRO lecture
// ═══════════════════════════════════════════════════════════════════════════
//
// Problème résolu : la détection de divergence ne comparait QUE le nombre de
// fiches (`getCountFromServer`). Réviser 3 fiches sur le téléphone ne change
// pas ce nombre → le PC ne détectait aucune divergence et restait bloqué sur
// « 34 fiches à réviser » alors que le téléphone en affichait 31.
//
// La signature ajoute deux compteurs monotones qui, eux, bougent à chaque
// révision : le total de répétitions et la longueur cumulée des historiques.
// Elle est publiée dans le document `sync_signal/latest` déjà écouté en temps
// réel → comparaison gratuite, aucune lecture Firestore supplémentaire.

import { isDue } from '../../utils/dateUtils.js'
import { historyLength } from './conflictResolution.js'

/**
 * Calcule la signature d'un ensemble de fiches. Fonction PURE.
 *
 * @param {Array} cards  fiches (forme WatermelonDB ou objet applicatif)
 * @param {string} [todayISO] date du jour (YYYY-MM-DD) pour le comptage « dues »
 * @returns {{count:number, reps:number, hist:number, due:number}}
 */
export function computeSignature(cards, todayISO) {
  const list = Array.isArray(cards) ? cards : []
  const day = todayISO || new Date().toISOString().slice(0, 10)
  let reps = 0
  let hist = 0
  let due = 0
  for (const card of list) {
    if (!card) continue
    const r = Number(card.repetitions)
    if (Number.isFinite(r)) reps += r
    hist += historyLength(card.reviewHistory)
    if (!card.paused && isDue(card.nextReview, day)) due += 1
  }
  return { count: list.length, reps, hist, due }
}

/**
 * Deux signatures décrivent-elles le même état de révision ?
 * `due` est volontairement EXCLU : il dépend du fuseau horaire de l'appareil,
 * pas des données. Le comparer déclencherait des réconciliations inutiles.
 */
export function signaturesMatch(a, b) {
  if (!a || !b) return false
  return a.count === b.count && a.reps === b.reps && a.hist === b.hist
}

/** Lit la signature locale depuis WatermelonDB (aucune lecture réseau). */
export async function localSignature(database) {
  const records = await database.collections.get('expressions').query().fetch()
  return computeSignature(records)
}
