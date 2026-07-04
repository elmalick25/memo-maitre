// src/utils/dateUtils.js
//
// ⚠️ FIX God-Mode : on utilise désormais la date LOCALE de l'utilisateur,
// pas l'UTC. `new Date().toISOString()` renvoyait la date UTC, ce qui
// faisait apparaître des fiches dues "demain" comme déjà en retard pour
// les fuseaux GMT+0 et après — d'où le faux bandeau "Risque d'oubli".

/**
 * Formate une Date locale en YYYY-MM-DD (sans décalage UTC).
 */
export function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Ajoute (ou soustrait) un nombre de jours à une date donnée.
 * Le résultat est dans le fuseau local de l'utilisateur.
 */
export function addDays(date, days) {
  let d;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, day] = date.split('-');
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(date);
  }
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

/**
 * Retourne la date du jour au format YYYY-MM-DD (fuseau local).
 */
export function today() {
  return toLocalISODate(new Date());
}

/** Alias explicite pour les modules qui veulent souligner l'usage local. */
export const localToday = today;

/**
 * Formate une date pour l'affichage en français (jour/mois abrégé).
 */
export function formatDate(d) {
  if (!d) return "À réviser";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "À réviser";
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

export function normalizeDate(dateVal) {
  if (!dateVal) return "";
  if (typeof dateVal === "number") {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? "" : toLocalISODate(d);
  }
  const str = String(dateVal);
  if (str.includes("T")) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? str.split("T")[0] : toLocalISODate(d);
  }
  return str.slice(0, 10);
}

/**
 * Vérifie si une carte est due (à réviser maintenant).
 */
export function isDue(nextReview, currentDate) {
  if (!nextReview) return true;
  const rev = normalizeDate(nextReview);
  const cur = normalizeDate(currentDate);
  if (!rev) return true;
  return rev <= cur;
}

/**
 * Vrai si la fiche est strictement en retard (due STRICTEMENT avant aujourd'hui).
 */
export function isOverdue(nextReview, currentDate = today()) {
  if (!nextReview) return false;
  const rev = normalizeDate(nextReview);
  const cur = normalizeDate(currentDate);
  if (!rev) return false;
  return rev < cur;
}

