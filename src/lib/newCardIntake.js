// src/lib/newCardIntake.js
//
// Couche 3 — Budget d'entrée pour les fiches JAMAIS VUES (repetitions === 0).
//
// Objectif : empêcher la pile de révision de se reconstituer « par le haut ».
// Chaque nouvelle fiche introduite aujourd'hui devient une charge récurrente
// pour les jours suivants : on limite donc le débit d'entrée en fonction de
// la taille de la pile de révision actuelle (même signal que la couche 2).
//
// ⚠️ Ce budget ne concerne QUE les fiches jamais vues. Les fiches déjà en
// apprentissage — même en échec répété — ne sont JAMAIS gatées ici (cf. la
// détection de leech, couche 4, qui traite ce cas autrement).
//
// Toutes les fonctions sont PURES : la persistance (localStorage) est gérée
// par l'appelant React.

// ── Seuils configurables ──────────────────────────────────────────────────
export const NEW_CARD_BUDGET_TIERS = [
  { maxPile: 50, budget: 15 },
  { maxPile: 150, budget: 10 },
  { maxPile: Infinity, budget: 5 },
];
// Interpolation continue (évite l'effet « cliff-edge » entre deux paliers).
export const NEW_CARD_BUDGET_SMOOTH = true;
export const NEW_CARD_BUDGET_MAX = 15;
export const NEW_CARD_BUDGET_MIN = 5;
export const NEW_CARD_SMOOTH_FROM = 50;   // pile en dessous → budget max
export const NEW_CARD_SMOOTH_TO = 150;    // pile au dessus → budget min

/**
 * Budget quotidien de fiches jamais vues, inversement proportionnel à la
 * taille de la pile de révision.
 */
export function getNewCardBudget(pileSize, opts = {}) {
  const n = Math.max(0, Number(pileSize) || 0);
  const smooth = opts.smooth ?? NEW_CARD_BUDGET_SMOOTH;
  if (!smooth) {
    for (const tier of NEW_CARD_BUDGET_TIERS) {
      if (n < tier.maxPile) return tier.budget;
    }
    return NEW_CARD_BUDGET_MIN;
  }
  if (n <= NEW_CARD_SMOOTH_FROM) return NEW_CARD_BUDGET_MAX;
  if (n >= NEW_CARD_SMOOTH_TO) return NEW_CARD_BUDGET_MIN;
  const ratio = (n - NEW_CARD_SMOOTH_FROM) / (NEW_CARD_SMOOTH_TO - NEW_CARD_SMOOTH_FROM);
  return Math.round(NEW_CARD_BUDGET_MAX - ratio * (NEW_CARD_BUDGET_MAX - NEW_CARD_BUDGET_MIN));
}

/** Une fiche « jamais vue » : aucune répétition enregistrée. */
export function isNewCard(card) {
  return (card?.repetitions || 0) === 0 && !(Array.isArray(card?.reviewHistory) && card.reviewHistory.length > 0);
}

/** Sépare une liste en { newCards, reviewCards }. */
export function splitNewAndReview(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const newCards = [];
  const reviewCards = [];
  for (const c of list) (isNewCard(c) ? newCards : reviewCards).push(c);
  return { newCards, reviewCards };
}

// ── État d'admission du jour (persisté par l'appelant) ────────────────────
/** État vierge pour un jour donné. */
export function makeIntakeState(todayISO) {
  return { date: todayISO, admittedIds: [] };
}

/** Réinitialise l'état s'il date d'un autre jour. */
export function normalizeIntakeState(state, todayISO) {
  if (!state || state.date !== todayISO || !Array.isArray(state.admittedIds)) {
    return makeIntakeState(todayISO);
  }
  return state;
}

/** Nombre de slots restants aujourd'hui (peut être 0). */
export function remainingIntake(state, budget) {
  const used = Array.isArray(state?.admittedIds) ? state.admittedIds.length : 0;
  return Math.max(0, budget - used);
}

/** Consomme un slot pour `cardId` (idempotent). Renvoie un NOUVEL état. */
export function consumeIntakeSlot(state, cardId, todayISO) {
  const s = normalizeIntakeState(state, todayISO);
  if (s.admittedIds.includes(cardId)) return s;
  return { ...s, admittedIds: [...s.admittedIds, cardId] };
}

/**
 * Sélectionne les fiches jamais vues admissibles aujourd'hui.
 * Les fiches déjà admises aujourd'hui restent admises (stabilité de session).
 *
 * @returns {{ admitted: Array, deferred: Array, budget: number, remaining: number, state: Object }}
 */
export function selectNewCardsForToday(newCards, opts = {}) {
  const { todayISO, pileSize = 0, state = null } = opts;
  const budget = opts.budget ?? getNewCardBudget(pileSize);
  const st = normalizeIntakeState(state, todayISO);
  const list = Array.isArray(newCards) ? newCards : [];

  const already = list.filter((c) => st.admittedIds.includes(c.id));
  const rest = list.filter((c) => !st.admittedIds.includes(c.id));
  const slots = Math.max(0, budget - st.admittedIds.length);

  const fresh = rest.slice(0, slots);
  const admitted = [...already, ...fresh];
  const deferred = rest.slice(slots);
  const nextState = fresh.length
    ? { ...st, admittedIds: [...st.admittedIds, ...fresh.map((c) => c.id)] }
    : st;

  return {
    admitted,
    deferred,
    budget,
    remaining: Math.max(0, budget - nextState.admittedIds.length),
    state: nextState,
  };
}
