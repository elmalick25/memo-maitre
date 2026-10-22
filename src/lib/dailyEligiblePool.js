// Sélection des fiches éligibles au plan du jour — identique sur tous les appareils.
import { splitNewAndReview } from "./newCardIntake.js";

const stableKey = (c) => String(c.createdAt || c.created_at || "") + "|" + String(c.id);
const byStableKey = (a, b) => { const x = stableKey(a), y = stableKey(b); return x < y ? -1 : x > y ? 1 : 0; };

/**
 * @param {Array} dueCards     fiches dues aujourd'hui (ordre local quelconque)
 * @param {Array} admittedIds  fiches neuves déjà admises aujourd'hui
 * @param {number} budget      nombre max de fiches neuves du jour
 * @param {Array} planIds      fiches déjà inscrites au plan du jour (autre appareil)
 */
export function buildDailyEligiblePool({ dueCards = [], admittedIds = [], budget = 0, planIds = [] } = {}) {
  const sorted = [...dueCards].sort(byStableKey);
  const { newCards, reviewCards } = splitNewAndReview(sorted);
  const admitted = new Set(admittedIds);
  const inPlan = new Set(planIds);
  const already = newCards.filter((c) => admitted.has(c.id) || inPlan.has(c.id));
  const slots = Math.max(0, budget - already.length);
  const fresh = newCards.filter((c) => !admitted.has(c.id) && !inPlan.has(c.id)).slice(0, slots);
  return [...reviewCards, ...already, ...fresh];
}
