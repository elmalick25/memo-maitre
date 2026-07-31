// src/lib/unlocks.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 5 — Unlocks concrets : un palier franchi change quelque chose de
// visible (cosmétique) ou d'utile (fonctionnel léger).
// PURE : aucune écriture, aucun state.
// ═══════════════════════════════════════════════════════════════════════════

export const UNLOCKS = [
  { level: 1,  type: "cosmetic",   id: "theme_azur",       label: "Thème Azur",             icon: "🔵", desc: "Palette bleu profond pour l'interface." },
  { level: 2,  type: "cosmetic",   id: "streak_icon_flame", label: "Icône streak : Flamme", icon: "🔥", desc: "Ton streak s'affiche en flamme." },
  { level: 3,  type: "functional", id: "freeze_plus_1",    label: "+1 jeton de gel / mois", icon: "🧊", desc: "Un jour manqué de plus est absorbé chaque mois." },
  { level: 4,  type: "cosmetic",   id: "holo_soft",        label: "Halo de carte doux",     icon: "✨", desc: "Effet holographique léger sur les fiches." },
  { level: 5,  type: "functional", id: "intake_plus_5",    label: "+5 nouvelles fiches/jour", icon: "📈", desc: "Quota d'entrée quotidien augmenté." },
  { level: 6,  type: "cosmetic",   id: "theme_ember",      label: "Thème Braise",           icon: "🟠", desc: "Palette chaude ambre/braise." },
  { level: 7,  type: "cosmetic",   id: "streak_icon_bolt", label: "Icône streak : Éclair",  icon: "⚡", desc: "Streak affiché en éclair." },
  { level: 8,  type: "functional", id: "freeze_plus_2",    label: "+2 jetons de gel / mois", icon: "🧊", desc: "Filet de sécurité renforcé." },
  { level: 9,  type: "cosmetic",   id: "holo_intense",     label: "Halo holographique intense", icon: "🌈", desc: "Effet prismatique complet sur les fiches." },
  { level: 10, type: "functional", id: "beta_features",    label: "Accès anticipé Labo",    icon: "🧪", desc: "Fonctionnalités expérimentales déverrouillées." },
  { level: 12, type: "functional", id: "intake_plus_10",   label: "+10 nouvelles fiches/jour", icon: "🚀", desc: "Quota d'entrée quotidien fortement augmenté." },
  { level: 15, type: "cosmetic",   id: "theme_aurora",     label: "Thème Aurore",           icon: "🌌", desc: "Dégradé animé légendaire." },
  { level: 20, type: "cosmetic",   id: "streak_icon_crown", label: "Icône streak : Couronne", icon: "👑", desc: "Le streak des légendes." },

  // ── CHANTIER 12 — « long tail » : des paliers jusqu'au niveau 100 ────────
  // Avant, plus rien ne se débloquait après le niveau 20 : la progression
  // devenait un chiffre qui monte sans conséquence. Chaque palier ci-dessous
  // change quelque chose (cosmétique visible ou effet fonctionnel léger).
  { level: 24, type: "functional", id: "queue_priority",    label: "Tri de file avancé",        icon: "🧭", desc: "Choisir l'ordre de la session (leech, retard, module)." },
  { level: 28, type: "cosmetic",   id: "theme_obsidian",    label: "Thème Obsidienne",          icon: "⚫", desc: "Palette noire mate à liseré cyan." },
  { level: 32, type: "functional", id: "freeze_plus_3",     label: "+3 jetons de gel / mois",   icon: "🧊", desc: "Filet de sécurité étendu." },
  { level: 36, type: "cosmetic",   id: "card_frame_gold",   label: "Cadre doré des fiches",     icon: "🖼️", desc: "Bordure dorée sur les fiches maîtrisées." },
  { level: 40, type: "functional", id: "intake_plus_15",    label: "+15 nouvelles fiches/jour", icon: "📦", desc: "Quota d'entrée quotidien élargi." },
  { level: 45, type: "cosmetic",   id: "streak_icon_comet", label: "Icône streak : Comète",     icon: "☄️", desc: "Streak affiché en comète." },
  { level: 50, type: "functional", id: "chest_luck_1",      label: "Coffres plus généreux",     icon: "🎁", desc: "Les coffres surprise tombent un peu plus souvent." },
  { level: 55, type: "cosmetic",   id: "theme_nebula",      label: "Thème Nébuleuse",           icon: "🌫️", desc: "Dégradé cosmique animé." },
  { level: 60, type: "functional", id: "quest_reroll",      label: "Relance de quête",          icon: "🎲", desc: "Remplacer une quête du jour par jour." },
  { level: 65, type: "cosmetic",   id: "holo_prismatic",    label: "Halo prismatique",          icon: "🔷", desc: "Effet holographique de rang supérieur." },
  { level: 70, type: "functional", id: "freeze_plus_4",     label: "+4 jetons de gel / mois",   icon: "🧊", desc: "Presque intouchable." },
  { level: 75, type: "cosmetic",   id: "theme_solaris",     label: "Thème Solaris",             icon: "🌞", desc: "Palette solaire haute intensité." },
  { level: 80, type: "functional", id: "intake_plus_25",    label: "+25 nouvelles fiches/jour", icon: "🚀", desc: "Débit d'apprentissage maximal." },
  { level: 85, type: "cosmetic",   id: "streak_icon_halo",  label: "Icône streak : Halo",       icon: "🪬", desc: "Un streak auréolé." },
  { level: 90, type: "functional", id: "chest_luck_2",      label: "Chance de coffre ++",       icon: "💎", desc: "Tirages de coffre nettement plus favorables." },
  { level: 95, type: "cosmetic",   id: "theme_singularity", label: "Thème Singularité",         icon: "🕳️", desc: "Interface noir absolu, accents iridescents." },
  { level: 100, type: "functional", id: "prestige_unlocked", label: "Prestige débloqué",        icon: "♾️", desc: "Renaître au niveau 1 avec un titre exclusif et un bonus XP permanent." },
];

export function getUnlocks(level) {
  const lv = Number(level) || 0;
  return UNLOCKS.filter((u) => u.level <= lv);
}

export function getNextUnlock(level) {
  const lv = Number(level) || 0;
  return UNLOCKS.find((u) => u.level > lv) || null;
}

export function hasUnlock(level, id) {
  return getUnlocks(level).some((u) => u.id === id);
}

/** Jetons de gel bonus accordés par le niveau. */
export function bonusFreezeTokens(level) {
  let n = 0;
  if (hasUnlock(level, "freeze_plus_1")) n += 1;
  if (hasUnlock(level, "freeze_plus_2")) n += 2;
  if (hasUnlock(level, "freeze_plus_3")) n += 3;
  if (hasUnlock(level, "freeze_plus_4")) n += 4;
  return n;
}

/** Bonus de quota de nouvelles fiches par jour. */
export function bonusNewCardQuota(level) {
  let n = 0;
  if (hasUnlock(level, "intake_plus_5")) n += 5;
  if (hasUnlock(level, "intake_plus_10")) n += 10;
  if (hasUnlock(level, "intake_plus_15")) n += 15;
  if (hasUnlock(level, "intake_plus_25")) n += 25;
  return n;
}

/** Icône de streak débloquée (la plus haute atteinte). */
export function streakIcon(level) {
  if (hasUnlock(level, "streak_icon_halo")) return "🪬";
  if (hasUnlock(level, "streak_icon_comet")) return "☄️";
  if (hasUnlock(level, "streak_icon_crown")) return "👑";
  if (hasUnlock(level, "streak_icon_bolt")) return "⚡";
  if (hasUnlock(level, "streak_icon_flame")) return "🔥";
  return "🌱";
}

/** Intensité du halo HoloCard : 0 = off, 1 = doux, 2 = intense. */
export function holoIntensity(level) {
  if (hasUnlock(level, "holo_prismatic")) return 3;
  if (hasUnlock(level, "holo_intense")) return 2;
  if (hasUnlock(level, "holo_soft")) return 1;
  return 0;
}

export function unlockedThemes(level) {
  return ["default", ...getUnlocks(level).filter((u) => u.id.startsWith("theme_")).map((u) => u.id)];
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 12 — Prestige : au-delà du niveau 100.
// Mécanique classique de rétention long terme : on « renaît » au niveau 1 en
// conservant un titre exclusif et un multiplicateur XP permanent modeste
// (+5 % par prestige, plafonné à +50 % pour ne pas casser l'économie).
// PURE : le hook appelant décide de persister.
// ═══════════════════════════════════════════════════════════════════════════

export const PRESTIGE_LEVEL = 100;
export const PRESTIGE_XP_BONUS = 0.05;
export const PRESTIGE_MAX_BONUS = 0.5;

export const PRESTIGE_TITLES = [
  { rank: 1, title: "Renaissant",   icon: "♾️" },
  { rank: 2, title: "Éternel",      icon: "🜂" },
  { rank: 3, title: "Architecte",   icon: "🏗️" },
  { rank: 4, title: "Démiurge",     icon: "🌀" },
  { rank: 5, title: "Sans Limite",  icon: "🕊️" },
];

/** Le prestige est-il disponible à ce niveau ? */
export function canPrestige(level) {
  return (Number(level) || 0) >= PRESTIGE_LEVEL;
}

/** Multiplicateur XP permanent accordé par les prestiges déjà effectués. */
export function prestigeMultiplier(prestigeCount) {
  const n = Math.max(0, Number(prestigeCount) || 0);
  return 1 + Math.min(PRESTIGE_MAX_BONUS, n * PRESTIGE_XP_BONUS);
}

/** Titre/icône de prestige (null si aucun). */
export function prestigeTitle(prestigeCount) {
  const n = Math.max(0, Number(prestigeCount) || 0);
  if (n === 0) return null;
  const found = PRESTIGE_TITLES.filter((p) => p.rank <= n).pop();
  return found ? { ...found, rank: n } : null;
}

/** Bonus de chance sur les coffres surprise (chantier 8) accordé par le niveau. */
export function chestLuck(level) {
  if (hasUnlock(level, "chest_luck_2")) return 1.6;
  if (hasUnlock(level, "chest_luck_1")) return 1.25;
  return 1;
}
