// ══════════════════════════════════════════════════════════════════════════════
// sessionSelector.js — SOURCE DE VÉRITÉ UNIQUE de « qu'est-ce qui est à réviser »
//
// Problème corrigé (diagnostic god-mode) :
//   Avant ce module, il existait au moins QUATRE définitions concurrentes de
//   « fiche à réviser » dans l'application :
//     1. todayReviews          → isDue && isCardActive && !paused
//     2. dueCount (inline)     → isDue && (level||0) < 7 && !paused   (≠ 1)
//     3. KnowledgeGraph        → nextReview <= today && level < 7 && !(paused && level===0)
//     4. la file RÉELLE servie → 1 + budget d'entrée + plafond de session
//   Résultat visible : l'UI annonçait 35 fiches, la session en servait 20, et
//   après la session le compteur affichait toujours 35 (car 35 était en réalité
//   la CIBLE de plafonnement, recalculée à l'identique tant que la pile restait
//   grosse). Idem par module : le nœud de la constellation montrait la part du
//   module dans la session globale, tandis que le clic lançait une session
//   calculée sur toute la pile du module (voire, pour le bouton « Réviser » des
//   modules, sur TOUTES les fiches du module, dues ou non).
//
// Règle désormais appliquée partout : un compteur affiché DOIT être produit par
// ce module, et une session lancée DOIT être produite par `buildSession` avec
// les mêmes arguments que l'aperçu. Deux nombres, deux sens :
//   • `pileSize` → la dette réelle (total dû aujourd'hui)
//   • `queue.length` → ce que la session va réellement servir
// Aucune vue ne doit inventer un troisième nombre.
//
// Toutes les fonctions sont PURES.
// ══════════════════════════════════════════════════════════════════════════════
import { isDue, today as localToday, normalizeDate } from "../utils/dateUtils.js";
import { isCardActive } from "./cardStatus.js";
import {
  splitNewAndReview,
  selectNewCardsForToday,
  getNewCardBudget,
  isNewCard,
} from "./newCardIntake.js";
import { composeDailySession } from "./memoryLab.js";

/**
 * Prédicat UNIQUE « cette fiche est à réviser aujourd'hui ».
 *
 * - `paused` : mise de côté explicite par l'utilisateur → jamais due.
 * - `isCardActive` : critère de maîtrise unifié (cardStatus.js), pas `level < 7`.
 * - `lastReviewedOn === today` : une fiche notée « Oublié » repart avec
 *   interval 0 → nextReview = aujourd'hui. Elle a pourtant BIEN été servie :
 *   la compter encore comme due faisait stagner tous les compteurs pendant la
 *   session (« je révise 20 fiches et il en reste toujours 35 »). Elle
 *   redeviendra due demain, sans perte de données.
 */
export function isCardDue(card, todayISO = localToday()) {
  if (!card || typeof card !== "object") return false;
  if (card.paused) return false;
  if (!isCardActive(card)) return false;
  if (!isDue(card.nextReview, todayISO)) return false;
  if (card.lastReviewedOn && normalizeDate(card.lastReviewedOn) === normalizeDate(todayISO)) {
    return false;
  }
  return true;
}

/** Pile due réelle (optionnellement restreinte à un module). */
export function getDuePile(expressions, todayISO = localToday(), category = null) {
  const list = Array.isArray(expressions) ? expressions : [];
  return list.filter(
    (e) => (!category || e.category === category) && isCardDue(e, todayISO),
  );
}

/** Taille de la pile de RÉVISION (hors fiches jamais vues) — signal de débit. */
export function getReviewPileSize(duePile) {
  return (Array.isArray(duePile) ? duePile : []).filter((e) => !isNewCard(e)).length;
}

/**
 * Construit la session du jour. Fonction PURE : rien n'est persisté, l'état
 * d'admission mis à jour est RENVOYÉ (`intakeState`), à l'appelant de le
 * committer uniquement quand la session est réellement lancée.
 *
 * Le même appel sert à l'APERÇU (compteurs, badges, constellation) et au
 * LANCEMENT : c'est la garantie que le nombre affiché est le nombre servi.
 *
 * @param {Array}  expressions   toutes les fiches
 * @param {Object} opts
 *   - todayISO {string}
 *   - category {string|null}   module ciblé (null = global)
 *   - intakeState {Object}     état d'admission des fiches jamais vues
 *   - budget {number}          budget d'entrée du jour (calculé globalement)
 *   - target {number|null}     plafond de session forcé (sinon auto)
 *   - includeNewCards {boolean} false = session de pure révision
 * @returns {{ queue: Array, pile: Array, pileSize: number, servedSize: number,
 *             capped: boolean, deferredNew: Array, intakeState: Object }}
 */
export function buildSession(expressions, opts = {}) {
  const todayISO = opts.todayISO || localToday();
  const category = opts.category ?? null;
  const pile = getDuePile(expressions, todayISO, category);

  const { newCards, reviewCards } = splitNewAndReview(pile);

  let admitted = [];
  let deferredNew = newCards;
  let intakeState = opts.intakeState;

  if (opts.includeNewCards !== false && newCards.length > 0) {
    const budget =
      opts.budget !== undefined && opts.budget !== null
        ? opts.budget
        : getNewCardBudget(getReviewPileSize(pile));
    const intake = selectNewCardsForToday(newCards, {
      todayISO,
      pileSize: reviewCards.length,
      state: opts.intakeState,
      budget,
    });
    admitted = intake.admitted;
    deferredNew = intake.deferred;
    intakeState = intake.state;
  }

  const candidates = [...reviewCards, ...admitted];
  const target = opts.target !== undefined ? opts.target : undefined;
  const queue = composeDailySession(
    candidates,
    target !== undefined ? { todayISO, target } : { todayISO },
  );

  return {
    queue,
    pile,
    pileSize: pile.length,
    servedSize: queue.length,
    capped: queue.length < pile.length,
    deferredNew,
    intakeState: intakeState ?? opts.intakeState,
  };
}

/**
 * Aperçu par module, calculé EXACTEMENT comme le sera la session lancée en
 * cliquant sur ce module (même fonction, mêmes arguments). Empêche l'écart
 * historique entre le badge de la constellation et la file réelle.
 *
 * @returns {Object} { [categoryName]: { pileSize, servedSize, capped } }
 */
export function buildCategoryPreviews(expressions, categories, opts = {}) {
  const out = {};
  for (const cat of Array.isArray(categories) ? categories : []) {
    const name = typeof cat === "string" ? cat : cat?.name;
    if (!name) continue;
    const s = buildSession(expressions, { ...opts, category: name });
    out[name] = { pileSize: s.pileSize, servedSize: s.servedSize, capped: s.capped };
  }
  return out;
}
