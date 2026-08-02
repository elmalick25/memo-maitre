// src/lib/dayStateMerge.js
//
// ═══════════════════════════════════════════════════════════════════════════
// ÉTAT DU JOUR PARTAGÉ — fusion pure, sans Firestore (donc testable)
// ═══════════════════════════════════════════════════════════════════════════
//
// LE VRAI BUG (diagnostic) :
// Le nombre affiché « 34 fiches à réviser » ne vient PAS directement des
// fiches : il vient du PLAN DU JOUR (lib/dailyPlan.js), qui était stocké
// UNIQUEMENT dans le localStorage de chaque appareil
// (clé `memomaitre_dailyPlan_v1`).
//
//   • Téléphone : plan { ids: [34 fiches], doneIds: [3] }  → affiche 31
//   • PC        : plan { ids: [34 fiches], doneIds: [] }   → affiche 34
//
// Aucune synchronisation de fiches ne pouvait corriger ça : même avec des
// fiches parfaitement synchronisées, les deux appareils scellent leur PROPRE
// plan (ordre différent, plafond différent, quota de nouvelles fiches
// différent) et comptent leurs PROPRES révisions du jour. D'où « j'ai beau
// actualiser le PC, je vois toujours 34 ».
//
// SOLUTION : un seul petit document Firestore par jour,
// `users/{uid}/day_state/{YYYY-MM-DD}`, écouté en temps réel.
//   • Coût lecture  : 1 document (pas N fiches) par changement → négligeable.
//   • Coût écriture : les écritures sont regroupées (debounce) → ~1 écriture
//                     par salve de révisions.
//   • Le premier appareil qui scelle le plan impose l'ordre et le plafond ;
//     les autres l'adoptent. Les révisions sont fusionnées par UNION, donc
//     jamais perdues, même si les deux appareils révisent hors ligne.
//
// Toutes les fonctions de ce fichier sont PURES et commutatives : fusionner
// A avec B donne le même résultat que fusionner B avec A (aux réordonnements
// d'ids près, arbitrés par `sealedAt`). C'est ce qui garantit la convergence
// des deux appareils vers EXACTEMENT le même nombre.

/** Champs « ensemble » du jour : fusionnés par union, jamais écrasés. */
export const DAY_STATE_SET_FIELDS = ['doneIds', 'bonusIds', 'admittedIds'];

const uniq = (arr) => Array.from(new Set(arr));

const cleanIds = (value) =>
  uniq((Array.isArray(value) ? value : []).filter((id) => id !== undefined && id !== null && id !== ''));

const finiteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** État du jour vide. */
export function makeDayState(dateISO) {
  return {
    date: dateISO,
    sealedAt: null,
    target: null,
    ids: [],
    doneIds: [],
    bonusIds: [],
    admittedIds: [],
  };
}

/**
 * Normalise un état du jour venant du localStorage ou de Firestore.
 * Repart de zéro si la date ne correspond pas (nouveau jour = nouveau quota).
 */
export function normalizeDayState(raw, dateISO) {
  if (!raw || typeof raw !== 'object' || raw.date !== dateISO) return makeDayState(dateISO);
  return {
    date: dateISO,
    sealedAt: finiteOrNull(raw.sealedAt),
    target: finiteOrNull(raw.target),
    ids: cleanIds(raw.ids),
    doneIds: cleanIds(raw.doneIds),
    bonusIds: cleanIds(raw.bonusIds),
    admittedIds: cleanIds(raw.admittedIds),
  };
}

/**
 * Qui impose l'ordre des fiches du jour ?
 * Le plan scellé le PLUS TÔT (horodatage stable, publié dans le document) ;
 * à égalité, le plus long ; à égalité encore, `a`. Ce critère est le même sur
 * les deux appareils, donc ils choisissent forcément le même gagnant.
 */
function pickIdsOwner(a, b) {
  if (a.ids.length === 0) return b;
  if (b.ids.length === 0) return a;
  const aSealed = a.sealedAt;
  const bSealed = b.sealedAt;
  if (aSealed !== null && bSealed !== null && aSealed !== bSealed) return aSealed < bSealed ? a : b;
  if (aSealed !== null && bSealed === null) return a;
  if (bSealed !== null && aSealed === null) return b;
  if (a.ids.length !== b.ids.length) return a.ids.length > b.ids.length ? a : b;
  return a;
}

/** Plafond commun : le plus contraignant des deux (null = aucun plafond). */
function mergeTarget(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/**
 * Fusionne deux états du jour (local ⇄ distant).
 *
 * • révisions (`doneIds`), bonus et fiches neuves admises : UNION — une
 *   révision faite sur un appareil ne peut jamais être « oubliée » par l'autre.
 * • ordre des fiches (`ids`) : celui du plan scellé le plus tôt, complété par
 *   les fiches que l'autre appareil a réellement traitées (sinon une révision
 *   faite hors de ce plan ne serait pas comptée).
 * • plafond (`target`) : le plus contraignant.
 */
export function mergeDayState(rawA, rawB) {
  const date = rawA?.date || rawB?.date;
  const a = normalizeDayState(rawA, date);
  const b = normalizeDayState(rawB, date);

  const doneIds = uniq([...a.doneIds, ...b.doneIds]);
  const bonusIds = uniq([...a.bonusIds, ...b.bonusIds]);
  const admittedIds = uniq([...a.admittedIds, ...b.admittedIds]);

  const owner = pickIdsOwner(a, b);
  const other = owner === a ? b : a;
  const doneSet = new Set(doneIds);
  const ownerSet = new Set(owner.ids);
  // Les fiches traitées ailleurs mais absentes du plan gagnant doivent
  // apparaître : sinon leur révision ne serait pas comptabilisée.
  const extras = other.ids.filter((id) => !ownerSet.has(id) && doneSet.has(id));
  const ids = [...owner.ids, ...extras];

  const sealedAtCandidates = [a.sealedAt, b.sealedAt].filter((v) => v !== null);

  return {
    date,
    sealedAt: sealedAtCandidates.length ? Math.min(...sealedAtCandidates) : null,
    target: mergeTarget(a.target, b.target),
    ids,
    doneIds: doneIds.filter((id) => ids.includes(id)),
    bonusIds: bonusIds.filter((id) => ids.includes(id)),
    admittedIds,
  };
}

/** Vrai si deux états du jour sont identiques (évite les écritures inutiles). */
export function dayStatesEqual(a, b) {
  const x = normalizeDayState(a, a?.date);
  const y = normalizeDayState(b, a?.date);
  if (x.date !== y.date) return false;
  if (x.target !== y.target) return false;
  if (x.sealedAt !== y.sealedAt) return false;
  for (const key of ['ids', 'doneIds', 'bonusIds', 'admittedIds']) {
    if (x[key].length !== y[key].length) return false;
    if (key === 'ids') {
      if (!x.ids.every((id, i) => id === y.ids[i])) return false;
    } else {
      const set = new Set(y[key]);
      if (!x[key].every((id) => set.has(id))) return false;
    }
  }
  return true;
}

/**
 * État du jour dérivé du plan local (lib/dailyPlan.js) + du quota de fiches
 * neuves, prêt à être publié.
 */
export function dayStateFromLocal({ plan, admittedIds = [], dateISO, sealedAt = null } = {}) {
  const base = normalizeDayState(
    {
      date: dateISO,
      sealedAt: plan?.sealedAt ?? sealedAt,
      target: plan?.target ?? null,
      ids: plan?.ids,
      doneIds: plan?.doneIds,
      bonusIds: plan?.bonusIds,
      admittedIds,
    },
    dateISO,
  );
  if (base.sealedAt === null && base.ids.length > 0) base.sealedAt = sealedAt ?? Date.now();
  return base;
}

/** État du jour fusionné → plan local (forme attendue par lib/dailyPlan.js). */
export function dayStateToPlan(state, dateISO) {
  const s = normalizeDayState(state, dateISO);
  return {
    date: s.date,
    target: s.target,
    sealed: s.ids.length > 0 || s.doneIds.length > 0,
    sealedAt: s.sealedAt,
    ids: s.ids,
    doneIds: s.doneIds,
    bonusIds: s.bonusIds,
  };
}
