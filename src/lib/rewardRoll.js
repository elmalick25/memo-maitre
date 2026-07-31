// src/lib/rewardRoll.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 8 — Récompenses variables (le cœur du réacteur).
//
// Principe : l'incertitude est plus motivante que la certitude. On ajoute donc
// une couche de récompense IMPRÉVISIBLE par-dessus le gain XP normal, sans
// jamais changer l'API de awardReview/awardSource : ces fonctions émettent
// juste un événement optionnel `bonusRoll` en plus du gain habituel.
//
// Garde-fous assumés :
//   • Aucun achat, aucune monnaie réelle : c'est une lootbox 100 % locale.
//   • Le gain de base n'est JAMAIS diminué : le coffre ne peut qu'ajouter.
//   • Déterministe à seed égale → testable, reproductible, non manipulable
//     en rechargeant la page (la seed dépend de la date + du compteur global).
//
// PURE : aucune écriture, aucun accès au storage, aucun Math.random().
// ═══════════════════════════════════════════════════════════════════════════

/** Hash 32 bits stable (FNV-1a) d'une chaîne quelconque. */
export function hashSeed(input) {
  const str = String(input ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG déterministe (mulberry32) — renvoie une fonction () => [0,1). */
export function makeRng(seed) {
  let a = (typeof seed === "number" ? seed : hashSeed(seed)) >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tirage pondéré déterministe dans une table [{ weight, ... }]. */
export function weightedPick(table, roll) {
  const total = table.reduce((s, t) => s + (t.weight || 0), 0);
  if (total <= 0) return table[0] || null;
  let x = roll * total;
  for (const entry of table) {
    x -= entry.weight || 0;
    if (x <= 0) return entry;
  }
  return table[table.length - 1];
}

// ── Multiplicateur du jour ─────────────────────────────────────────────────
// Révélé au premier lancement de la journée. Change chaque jour selon une
// seed basée sur la DATE : une raison de revenir aujourd'hui précisément.

export const DAILY_MULTIPLIERS = [
  { id: "review_x15", weight: 22, mult: 1.5, scope: "review",  label: "×1.5 sur chaque révision",       icon: "⚡" },
  { id: "review_x12", weight: 26, mult: 1.2, scope: "review",  label: "×1.2 sur chaque révision",       icon: "🔁" },
  { id: "create_x2",  weight: 16, mult: 2.0, scope: "create",  label: "×2 sur les fiches créées",       icon: "🧠" },
  { id: "create_x15", weight: 14, mult: 1.5, scope: "create",  label: "×1.5 sur les fiches créées",     icon: "📝" },
  { id: "all_x13",    weight: 12, mult: 1.3, scope: "all",     label: "×1.3 sur TOUT ce que tu gagnes", icon: "🌟" },
  { id: "chest_x2",   weight: 10, mult: 1.0, scope: "chest",   label: "Coffres deux fois plus fréquents", icon: "🎁" },
];

/**
 * Multiplicateur du jour (déterministe par date).
 * @param {string} dateISO  "YYYY-MM-DD"
 * @param {string} salt     sel optionnel (profil) pour éviter des journées
 *                          identiques entre deux profils.
 */
export function dailyMultiplier(dateISO, salt = "") {
  const date = String(dateISO || "").slice(0, 10);
  const rng = makeRng(hashSeed(`daily:${date}:${salt}`));
  const picked = weightedPick(DAILY_MULTIPLIERS, rng());
  return { date, ...picked };
}

/** Le multiplicateur du jour s'applique-t-il à cette source d'XP ? */
export function dailyMultiplierFor(daily, source) {
  if (!daily || !source) return 1;
  if (daily.scope === "all") return daily.mult;
  if (daily.scope === "review" && String(source).startsWith("REVIEW_")) return daily.mult;
  if (daily.scope === "create" && (source === "CARD_CREATED" || source === "PDF_ANALYZED")) return daily.mult;
  return 1;
}

// ── Coffres surprise ───────────────────────────────────────────────────────
// Fenêtre : jamais avant 8 révisions depuis le dernier coffre, garanti à 18.
// Entre les deux, probabilité croissante → moyenne ≈ 1 coffre / 12-18.

export const CHEST_MIN_GAP = 8;
export const CHEST_MAX_GAP = 18;

export const CHEST_TABLE = [
  { id: "xp_small",  weight: 34, rarity: "commun",     icon: "🎁", label: "Petit coffre",    xpMult: 1.2 },
  { id: "xp_medium", weight: 24, rarity: "rare",       icon: "📦", label: "Coffre renforcé", xpMult: 1.6 },
  { id: "xp_big",    weight: 12, rarity: "epique",     icon: "💎", label: "Coffre épique",   xpMult: 2.2 },
  { id: "xp_huge",   weight: 5,  rarity: "legendaire", icon: "🏆", label: "Coffre légendaire", xpMult: 3.0 },
  { id: "freeze",    weight: 10, rarity: "rare",       icon: "🧊", label: "Jeton de gel",    xpMult: 1.0, freezeToken: 1 },
  { id: "nothing",   weight: 15, rarity: "commun",     icon: "🌫️", label: "Coffre vide",     xpMult: 1.0, empty: true },
];

/**
 * Tire (ou non) une récompense variable après une révision.
 * 100 % PURE et déterministe : mêmes entrées → même sortie.
 *
 * @param {string|number} seed  seed stable (ex. `${date}:${totalReviews}`)
 * @param {object} context
 *   @param {number} context.reviewsSinceChest  révisions depuis le dernier coffre
 *   @param {number} [context.baseXP]           XP de base du gain en cours
 *   @param {number} [context.rating]           note FSRS (0/1/3/5)
 *   @param {number} [context.chestBoost]       1 = normal, 2 = jour "coffres ×2"
 * @returns {null | { id, label, icon, rarity, xpMult, bonusXP, freezeToken, empty }}
 */
export function rollReward(seed, context = {}) {
  const since = Math.max(0, Number(context.reviewsSinceChest) || 0);
  const baseXP = Math.max(0, Number(context.baseXP) || 0);
  const boost = Number(context.chestBoost) > 0 ? Number(context.chestBoost) : 1;
  // Un « Again » ne déclenche pas de coffre : on ne récompense pas l'échec
  // par de l'aléatoire, sinon la boucle perd son sens pédagogique.
  if (context.rating === 0) return null;
  if (since < CHEST_MIN_GAP) return null;

  const rng = makeRng(hashSeed(`chest:${seed}`));
  const guaranteed = since >= CHEST_MAX_GAP;
  // Probabilité croissante entre MIN et MAX (0 → 1).
  const p = Math.min(1, ((since - CHEST_MIN_GAP + 1) / (CHEST_MAX_GAP - CHEST_MIN_GAP + 1)) * boost);
  if (!guaranteed && rng() > p) return null;

  const picked = weightedPick(CHEST_TABLE, rng());
  const bonusXP = picked.empty ? 0 : Math.round(baseXP * (picked.xpMult - 1));
  return {
    id: picked.id,
    label: picked.label,
    icon: picked.icon,
    rarity: picked.rarity,
    xpMult: picked.xpMult,
    bonusXP: Math.max(picked.empty ? 0 : 1, bonusXP),
    freezeToken: picked.freezeToken || 0,
    empty: !!picked.empty,
  };
}

export default rollReward;
