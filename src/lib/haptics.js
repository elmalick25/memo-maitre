// src/lib/haptics.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 17 — Haptique sur TOUS les moments de récompense.
//
// Avant : `navigator.vibrate` n'existait que sur la notation d'une carte.
// Maintenant : chaque moment god-mode (palier de combo, coffre, badge, quête,
// niveau, routine, rituel d'ouverture) a sa signature haptique.
//
// Règles :
//   • Tous les motifs cumulent < 200 ms — jamais gênant.
//   • L'intensité monte avec l'enjeu, exactement comme le son.
//   • Respecte `prefers-reduced-motion` et une préférence utilisateur locale.
// PURE côté calcul : `hapticPattern()` ne touche à rien.
// ═══════════════════════════════════════════════════════════════════════════

export const HAPTICS_PREF_KEY = "mm_haptics_enabled";

/** Motifs par évènement. Clés composées : "combo:10", "chest:legendaire"… */
export const HAPTIC_PATTERNS = {
  // ── Paliers de combo (l'intensité monte avec le tier) ──
  "combo:3": [15],
  "combo:5": [15, 10, 15],
  "combo:10": [18, 10, 18, 10],
  "combo:20": [20, 10, 20, 10, 30],

  // ── Coffres : discret en commun, syncopé en légendaire ──
  "chest:commun": [12],
  "chest:rare": [14, 12, 14],
  "chest:epique": [18, 10, 14, 10, 22],
  "chest:legendaire": [10, 8, 10, 8, 24, 12, 40],

  // ── Autres récompenses ──
  badge: [25, 15, 45],
  quest: [12, 10, 28],
  levelup: [30, 12, 30, 12, 50],
  routine_step: [10],
  routine_perfect: [20, 12, 20, 12, 45],
  ritual: [18, 40, 26],
  rating_again: [40, 20, 40],
  rating_ok: [8],
};

/** Motif d'un palier de combo (retombe sur le tier inférieur atteint). */
export function comboHapticPattern(combo) {
  const c = Number(combo) || 0;
  if (c >= 20) return HAPTIC_PATTERNS["combo:20"];
  if (c >= 10) return HAPTIC_PATTERNS["combo:10"];
  if (c >= 5) return HAPTIC_PATTERNS["combo:5"];
  if (c >= 3) return HAPTIC_PATTERNS["combo:3"];
  return null;
}

/** Motif d'un évènement nommé (retourne null si inconnu). */
export function hapticPattern(name, arg) {
  if (name === "combo") return comboHapticPattern(arg);
  if (name === "chest") return HAPTIC_PATTERNS[`chest:${arg || "commun"}`] || HAPTIC_PATTERNS["chest:commun"];
  return HAPTIC_PATTERNS[name] || null;
}

export function hapticsEnabled() {
  if (typeof window === "undefined" || !window.navigator?.vibrate) return false;
  try {
    if (window.localStorage.getItem(HAPTICS_PREF_KEY) === "off") return false;
  } catch { /* storage bloqué */ }
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  } catch { /* pas de matchMedia */ }
  return true;
}

export function setHapticsEnabled(on) {
  try { window.localStorage.setItem(HAPTICS_PREF_KEY, on ? "on" : "off"); } catch { /* noop */ }
}

/**
 * Déclenche l'haptique d'un évènement.
 * @example haptic("combo", 10) · haptic("chest", "legendaire") · haptic("badge")
 */
export function haptic(name, arg) {
  const pattern = hapticPattern(name, arg);
  if (!pattern || !hapticsEnabled()) return false;
  try { return window.navigator.vibrate(pattern); } catch { return false; }
}

export default haptic;
