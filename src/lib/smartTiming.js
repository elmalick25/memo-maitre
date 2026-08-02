// src/lib/smartTiming.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 13 — Retour intelligent : du bon timing, pas de la culpabilisation.
//
// Constat après inspection : le projet n'embarque AUCUN service worker de push
// (pas de `push`/`showNotification` enregistré). On ne peut donc pas envoyer de
// notification serveur. Ce module fournit :
//   • le créneau horaire historiquement le plus productif de l'utilisateur ;
//   • un rappel LOCAL optionnel (Notification API), désactivé par défaut et
//     calé sur ce créneau plutôt que sur un horaire fixe.
//
// Règle de ton : on formule toujours en OPPORTUNITÉ (« 3 cartes passent en
// Easy si tu les révises maintenant »), jamais en dette (« tu es en retard »).
// Les fonctions de calcul sont PURES.
// ═══════════════════════════════════════════════════════════════════════════

export const REMINDER_STORAGE_KEY = "smart_reminder_v1";

/**
 * Créneau optimal déduit de l'historique déjà tracké par l'app.
 * @param {object} stats  { earlyMorningSessions, lateNightSessions, sessionHours? }
 * @returns {{ hour:number, label:string, confidence:"faible"|"moyenne"|"forte" }}
 */
export function bestStudyHour(stats = {}) {
  const hours = Array.isArray(stats.sessionHours) ? stats.sessionHours.filter((h) => Number.isFinite(h)) : [];
  if (hours.length >= 5) {
    const buckets = new Array(24).fill(0);
    hours.forEach((h) => { buckets[((h % 24) + 24) % 24] += 1; });
    let best = 0;
    buckets.forEach((n, h) => { if (n > buckets[best]) best = h; });
    return {
      hour: best,
      label: `${String(best).padStart(2, "0")}h`,
      confidence: hours.length >= 20 ? "forte" : "moyenne",
    };
  }
  const early = Number(stats.earlyMorningSessions) || 0;
  const late = Number(stats.lateNightSessions) || 0;
  if (early > late && early > 0) return { hour: 7, label: "07h", confidence: "faible" };
  if (late > early && late > 0) return { hour: 22, label: "22h", confidence: "faible" };
  return { hour: 19, label: "19h", confidence: "faible" };
}

/**
 * Cadrage POSITIF de la charge du jour.
 * @param {object} input { dueCount, promotableCount, newCount, streak }
 * @returns {{ tone:"opportunity"|"neutral", text:string }}
 */
export function positiveFraming({ dueCount = 0, promotableCount = 0, newCount = 0, streak = 0 } = {}) {
  if (promotableCount > 0) {
    return { tone: "opportunity", text: `${promotableCount} carte${promotableCount > 1 ? "s" : ""} passe${promotableCount > 1 ? "nt" : ""} en intervalle long si tu les révises maintenant.` };
  }
  if (dueCount > 0 && newCount > 0) {
    return { tone: "opportunity", text: `${dueCount} révisions prêtes + ${newCount} nouveauté${newCount > 1 ? "s" : ""} à découvrir.` };
  }
  if (dueCount > 0) {
    return { tone: "opportunity", text: `${dueCount} carte${dueCount > 1 ? "s" : ""} arrivée${dueCount > 1 ? "s" : ""} à maturité — c'est le meilleur moment pour les ancrer.` };
  }
  if (streak > 0) {
    return { tone: "neutral", text: `Rien d'obligatoire aujourd'hui : ta mémoire travaille toute seule (streak ${streak}).` };
  }
  return { tone: "neutral", text: "Rien de dû — parfait pour créer ou explorer." };
}

/** Combien de cartes gagneraient un intervalle long si révisées maintenant ? */
export function countPromotable(cards = [], todayISO = new Date().toISOString().slice(0, 10)) {
  return cards.filter((c) => {
    if (!c || c.paused) return false;
    const due = String(c.nextReview || "").slice(0, 10);
    if (!due || due > todayISO) return false;
    return (c.level || 0) >= 3 && (c.interval || 0) >= 7;
  }).length;
}

/** Le moment est-il opportun pour un rappel local (± 1 h du créneau) ? */
export function isGoodReminderMoment(nowHour, stats) {
  const best = bestStudyHour(stats).hour;
  const diff = Math.abs(((nowHour - best + 36) % 24) - 12);
  return Math.abs(12 - diff) <= 1;
}

/**
 * Rappel LOCAL, opt-in, calé sur le créneau optimal. Ne fait rien si
 * l'utilisateur n'a pas donné sa permission : aucune insistance, aucun
 * message anxiogène.
 */
export function scheduleLocalReminder({ stats = {}, dueCount = 0, promotableCount = 0, enabled = false } = {}) {
  if (!enabled || typeof window === "undefined" || !("Notification" in window)) return null;
  if (Notification.permission !== "granted") return null;

  const best = bestStudyHour(stats);
  const now = new Date();
  const target = new Date(now);
  target.setHours(best.hour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target - now;
  if (delay > 6 * 3600000) return null; // on ne programme pas à plus de 6 h

  const body = positiveFraming({ dueCount, promotableCount }).text;
  const id = setTimeout(() => {
    try { new Notification("Un bon moment pour réviser", { body, silent: true }); } catch { /* refusé */ }
  }, delay);
  return () => clearTimeout(id);
}
