// src/lib/dateRepair.js
// Sanitise les dates "nextReview" anormales des fiches MemoMaster.
//
// Causes possibles d'une date cassée :
//   • Migration depuis l'ancien format (timestamp ms vs YYYY-MM-DD)
//   • Bug FSRS ayant calculé un interval gigantesque (> 50 ans)
//   • Champ sérialisé en string "Invalid Date" / "null"
//   • Date strictement antérieure à createdAt (corruption)
//
// On clamp :
//   - Si invalide ou absente → today()
//   - Si > today + MAX_FUTURE_DAYS (par défaut 5 ans) → today + 90j (revue d'ici 3 mois)
//   - Si < createdAt → today()

import { today, normalizeDate, addDays } from "../utils/dateUtils";

const MAX_FUTURE_DAYS = 365 * 5;          // 5 ans
const FALLBACK_FUTURE_DAYS = 90;          // 3 mois
const MIN_YEAR = 2015;                    // l'app n'existait pas avant

function looksAbnormal(dateStr, createdAt) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  const year = d.getFullYear();
  if (year < MIN_YEAR || year > new Date().getFullYear() + 10) return true;
  if (createdAt) {
    const c = new Date(createdAt);
    if (!isNaN(c.getTime()) && d.getTime() < c.getTime() - 86400000) return true;
  }
  const now = Date.now();
  if (d.getTime() - now > MAX_FUTURE_DAYS * 86400000) return true;
  return false;
}

export function repairCardDates(expressions = []) {
  if (!Array.isArray(expressions)) return { repaired: [], count: 0 };
  let count = 0;
  const repaired = expressions.map(e => {
    if (!e || typeof e !== "object") return e;
    const nr = e.nextReview;
    const created = e.createdAt;
    if (!looksAbnormal(nr, created)) return e;
    count++;
    // Stratégie : si date dans un futur trop lointain → revue dans 3 mois.
    //             si invalide / passé corrompu → due maintenant.
    let fixed = today();
    if (nr) {
      const d = new Date(nr);
      if (!isNaN(d.getTime()) && d.getTime() - Date.now() > MAX_FUTURE_DAYS * 86400000) {
        fixed = addDays(today(), FALLBACK_FUTURE_DAYS);
      }
    }
    return { ...e, nextReview: normalizeDate(fixed) };
  });
  return { repaired, count };
}

export default repairCardDates;
