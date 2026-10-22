// memoryTriage.js — Triage mnésique par RISQUE RÉEL D'OUBLI (FSRS).
// Une fiche solide en retard de 10 j peut encore être retenue à 80 %, alors
// qu'une fiche fragile en retard de 3 j est déjà sous 30 %. On trie donc par
// rétention estimée R(t, S), pas par date.
// Fonctions PURES.
import { fsrsR, diffDays, today } from "./fsrs.js";

export const RED_THRESHOLD = 0.7;   // < 70 % : oubli imminent (même seuil que « Rappel critique ») → sauvetage
export const AMBER_THRESHOLD = 0.85; // 70–85 % : à revoir bientôt (cible FSRS = 90 %)
export const SECONDS_PER_RESCUE_CARD = 13;

/** Rétention estimée aujourd'hui (0..1), ou null pour une fiche jamais révisée. */
export function cardRetention(card, todayISO = today()) {
  if (!card) return null;
  const s = Number(card.stability);
  if (!(s > 0) || !card.lastReviewDate) return null;
  const elapsed = Math.max(0, diffDays(todayISO, card.lastReviewDate));
  const r = fsrsR(elapsed, s);
  return Number.isFinite(r) ? r : null;
}

/** Zone d'une fiche : "red" | "amber" | "green" | "new". */
export function retentionZone(r) {
  if (r === null || r === undefined) return "new";
  if (r < RED_THRESHOLD) return "red";
  if (r < AMBER_THRESHOLD) return "amber";
  return "green";
}

/** Trie par rétention croissante (les plus en danger d'abord). Fiches neuves à la fin. */
export function sortByForgettingRisk(cards, todayISO = today()) {
  return (cards || [])
    .map((c) => ({ c, r: cardRetention(c, todayISO) }))
    .sort((a, b) => (a.r ?? 2) - (b.r ?? 2))
    .map((x) => x.c);
}

/**
 * Triage d'un module. Les fiches en pause et déjà révisées aujourd'hui sont exclues
 * de la file de sauvetage (rescue), qui est triée par danger décroissant.
 */
export function triageModule(cards, todayISO = today()) {
  const out = { red: [], amber: [], green: [], fresh: [], rescue: [], minutes: 0 };
  for (const c of cards || []) {
    if (!c || c.paused) continue;
    const r = cardRetention(c, todayISO);
    const z = retentionZone(r);
    (z === "new" ? out.fresh : out[z]).push(c);
  }
  out.rescue = sortByForgettingRisk(
    out.red.filter((c) => c.lastReviewDate !== todayISO),
    todayISO,
  );
  out.minutes = Math.max(out.rescue.length ? 1 : 0, Math.round((out.rescue.length * SECONDS_PER_RESCUE_CARD) / 60));
  return out;
}

/**
 * Sentinelles : les `n` fiches dues les plus fragiles (zone rouge), tous modules
 * confondus, réservées dans le quota quotidien pour qu'aucun fond de module ne meure.
 */
export function pickSentinels(dueCards, n, todayISO = today()) {
  if (!(n > 0)) return [];
  return sortByForgettingRisk(
    (dueCards || []).filter((c) => retentionZone(cardRetention(c, todayISO)) === "red"),
    todayISO,
  ).slice(0, n);
}
