// ═══════════════════════════════════════════════════════════════════════════
// GAMIFICATION — Badges, niveaux d'XP, archétypes
//
// CHANTIER 3 — Refonte complète : qualité > quantité.
//   • Catégorie "Héritage" (17 badges morts) SUPPRIMÉE.
//   • Paliers ramenés à des seuils réalistes et atteignables
//     (totalCards ≤ 1000, totalReviews ≤ 10 000, bestDayReviews ≤ 150…).
//   • Plus de padding artificiel "Quête XXIII" : chaque badge a un libellé
//     et une icône qui ont du sens. Total visé ≈ 150-250.
//   • Nouvelle catégorie "Production active" branchée sur masteryStages.js.
//   • Vraie hiérarchie de rareté visuelle (gris → bleu → violet → or animé).
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// 0. Rareté — palette différenciée (chantier 3)
// ───────────────────────────────────────────────────────────────────────────
export const RARITIES = ["commun", "rare", "epique", "legendaire"];

export const RARITY_STYLES = {
  commun: {
    label: "Commun",
    color: "#94A3B8",
    bgLight: "#F1F5F9",
    bgDark: "rgba(148,163,184,0.10)",
    glow: "none",
    gradient: "linear-gradient(135deg,#CBD5E1,#94A3B8)",
    animated: false,
  },
  rare: {
    label: "Rare",
    color: "#3B82F6",
    bgLight: "#DBEAFE",
    bgDark: "rgba(59,130,246,0.14)",
    glow: "0 0 14px rgba(59,130,246,0.35)",
    gradient: "linear-gradient(135deg,#60A5FA,#2563EB)",
    animated: false,
  },
  epique: {
    label: "Épique",
    color: "#A855F7",
    bgLight: "#F3E8FF",
    bgDark: "rgba(168,85,247,0.16)",
    glow: "0 0 20px rgba(168,85,247,0.45)",
    gradient: "linear-gradient(135deg,#C084FC,#7E22CE)",
    animated: false,
  },
  legendaire: {
    label: "Légendaire",
    color: "#F59E0B",
    bgLight: "#FEF3C7",
    bgDark: "rgba(245,158,11,0.18)",
    glow: "0 0 28px rgba(245,158,11,0.55)",
    gradient: "linear-gradient(135deg,#FDE68A,#F59E0B,#B45309,#FDE68A)",
    animated: true,
  },
};

export const RARITY_ORDER = { legendaire: 0, epique: 1, rare: 2, commun: 3 };

// Catégories réellement utilisées (plus de catégorie fantôme "Examens",
// plus de catégorie morte "Héritage").
export const BADGE_CATEGORIES = [
  "Création",
  "Streak",
  "Révisions",
  "Mémoire (FSRS)",
  "Production active",
  "IA",
  "Discipline",
  "Découverte",
  "Progression",
];

// ───────────────────────────────────────────────────────────────────────────
// 1. Badges curatés à la main
// ───────────────────────────────────────────────────────────────────────────
const HAND_CRAFTED = [
  // ── Création ──
  { id: "first_card", icon: "🌱", label: "Première pousse", desc: "Créer ta 1ère fiche", rarity: "commun", cat: "Création", check: s => s.totalCards >= 1, progress: s => ({ cur: Math.min(s.totalCards, 1), max: 1 }) },
  { id: "ten_cards", icon: "📚", label: "Bibliothécaire", desc: "10 fiches créées", rarity: "commun", cat: "Création", check: s => s.totalCards >= 10, progress: s => ({ cur: Math.min(s.totalCards, 10), max: 10 }) },
  { id: "fifty_cards", icon: "🗂️", label: "Encyclopédiste", desc: "50 fiches", rarity: "rare", cat: "Création", check: s => s.totalCards >= 50, progress: s => ({ cur: Math.min(s.totalCards, 50), max: 50 }) },
  { id: "100_cards", icon: "🎨", label: "Créateur", desc: "100 fiches", rarity: "rare", cat: "Création", check: s => s.totalCards >= 100, progress: s => ({ cur: Math.min(s.totalCards, 100), max: 100 }) },
  { id: "200_cards", icon: "🏛️", label: "Grand Archiviste", desc: "200 fiches", rarity: "epique", cat: "Création", check: s => s.totalCards >= 200, progress: s => ({ cur: Math.min(s.totalCards, 200), max: 200 }) },
  { id: "five_hundred", icon: "🌟", label: "Étoile filante", desc: "500 fiches", rarity: "legendaire", cat: "Création", check: s => s.totalCards >= 500, progress: s => ({ cur: Math.min(s.totalCards, 500), max: 500 }) },
  { id: "modular", icon: "🧩", label: "Modulaire", desc: "5 modules actifs", rarity: "rare", cat: "Création", check: s => (s.modulesCount || 0) >= 5, progress: s => ({ cur: Math.min(s.modulesCount || 0, 5), max: 5 }) },

  // ── Streak ──
  { id: "streak3", icon: "🔥", label: "En feu", desc: "3 jours d'affilée", rarity: "commun", cat: "Streak", check: s => s.streak >= 3, progress: s => ({ cur: Math.min(s.streak, 3), max: 3 }) },
  { id: "streak7", icon: "⚡", label: "Semaine parfaite", desc: "7 jours d'affilée", rarity: "rare", cat: "Streak", check: s => s.streak >= 7, progress: s => ({ cur: Math.min(s.streak, 7), max: 7 }) },
  { id: "streak30", icon: "🏆", label: "Mois de légende", desc: "30 jours d'affilée", rarity: "epique", cat: "Streak", check: s => s.streak >= 30, progress: s => ({ cur: Math.min(s.streak, 30), max: 30 }) },
  { id: "unstoppable", icon: "🚂", label: "Inarrêtable", desc: "60 jours d'affilée", rarity: "legendaire", cat: "Streak", check: s => s.streak >= 60, progress: s => ({ cur: Math.min(s.streak, 60), max: 60 }) },
  { id: "streak100", icon: "👑", label: "Invincible", desc: "100 jours d'affilée", rarity: "legendaire", cat: "Streak", check: s => s.streak >= 100, progress: s => ({ cur: Math.min(s.streak, 100), max: 100 }) },
  { id: "streak_saved", icon: "🧊", label: "Sauvé par le gel", desc: "Un jeton de gel a préservé ton streak", rarity: "rare", cat: "Streak", check: s => (s.freezesUsed || 0) >= 1, progress: s => ({ cur: Math.min(s.freezesUsed || 0, 1), max: 1 }) },
  { id: "streak_repaired", icon: "🛠️", label: "Réparateur", desc: "Rattraper un streak cassé", rarity: "epique", cat: "Streak", check: s => (s.streakRepairs || 0) >= 1, progress: s => ({ cur: Math.min(s.streakRepairs || 0, 1), max: 1 }) },

  // ── Mémoire (FSRS) — planification, pas production ──
  { id: "first_planned", icon: "✅", label: "Première consolidée", desc: "1 fiche planifiée long terme (FSRS)", rarity: "commun", cat: "Mémoire (FSRS)", check: s => s.plannedMastered >= 1, progress: s => ({ cur: Math.min(s.plannedMastered, 1), max: 1 }) },
  { id: "ten_planned", icon: "🎓", label: "Diplômé", desc: "10 fiches consolidées (FSRS)", rarity: "rare", cat: "Mémoire (FSRS)", check: s => s.plannedMastered >= 10, progress: s => ({ cur: Math.min(s.plannedMastered, 10), max: 10 }) },
  { id: "fifty_planned", icon: "🧠", label: "Mémoire longue", desc: "50 fiches consolidées (FSRS)", rarity: "epique", cat: "Mémoire (FSRS)", check: s => s.plannedMastered >= 50, progress: s => ({ cur: Math.min(s.plannedMastered, 50), max: 50 }) },
  { id: "grand_planned", icon: "♟️", label: "Grand Maître FSRS", desc: "200 fiches consolidées", rarity: "legendaire", cat: "Mémoire (FSRS)", check: s => s.plannedMastered >= 200, progress: s => ({ cur: Math.min(s.plannedMastered, 200), max: 200 }) },
  { id: "all_reviewed", icon: "🧘", label: "Zen", desc: "0 fiche en retard", rarity: "epique", cat: "Mémoire (FSRS)", check: s => s.totalCards > 0 && s.dueCount === 0, progress: s => ({ cur: s.dueCount === 0 ? 1 : 0, max: 1 }) },

  // ── Production active (masteryStages.js) ──
  { id: "first_produced", icon: "🗣️", label: "Première production", desc: "Utiliser 1 expression en contexte réel", rarity: "commun", cat: "Production active", check: s => s.produced >= 1, progress: s => ({ cur: Math.min(s.produced, 1), max: 1 }) },
  { id: "produced_10", icon: "💬", label: "Voix qui porte", desc: "10 expressions produites", rarity: "rare", cat: "Production active", check: s => s.produced >= 10, progress: s => ({ cur: Math.min(s.produced, 10), max: 10 }) },
  { id: "produced_50", icon: "🎙️", label: "Orateur", desc: "50 expressions produites", rarity: "epique", cat: "Production active", check: s => s.produced >= 50, progress: s => ({ cur: Math.min(s.produced, 50), max: 50 }) },
  { id: "mastered_real_1", icon: "🥇", label: "Vraie maîtrise", desc: "1 expression maîtrisée (2 contextes, 48h)", rarity: "rare", cat: "Production active", check: s => s.masteredReal >= 1, progress: s => ({ cur: Math.min(s.masteredReal, 1), max: 1 }) },
  { id: "mastered_real_25", icon: "🏅", label: "Répertoire actif", desc: "25 expressions réellement maîtrisées", rarity: "epique", cat: "Production active", check: s => s.masteredReal >= 25, progress: s => ({ cur: Math.min(s.masteredReal, 25), max: 25 }) },
  { id: "mastered_real_100", icon: "🔱", label: "Locuteur accompli", desc: "100 expressions réellement maîtrisées", rarity: "legendaire", cat: "Production active", check: s => s.masteredReal >= 100, progress: s => ({ cur: Math.min(s.masteredReal, 100), max: 100 }) },
  { id: "no_ghost", icon: "👻", label: "Chasseur de fantômes", desc: "Moins de 20 fiches « recalled » jamais produites", rarity: "epique", cat: "Production active", check: s => s.totalCards >= 50 && (s.recalledNotProduced || 0) <= 20, progress: s => ({ cur: Math.max(0, 100 - Math.min(100, s.recalledNotProduced || 0)), max: 100 }) },

  // ── Révisions ──
  { id: "hundred_reviews", icon: "💎", label: "Diamant", desc: "100 révisions", rarity: "commun", cat: "Révisions", check: s => s.totalReviews >= 100, progress: s => ({ cur: Math.min(s.totalReviews, 100), max: 100 }) },
  { id: "500_reviews", icon: "🌊", label: "Flot continu", desc: "500 révisions", rarity: "rare", cat: "Révisions", check: s => s.totalReviews >= 500, progress: s => ({ cur: Math.min(s.totalReviews, 500), max: 500 }) },
  { id: "1000_reviews", icon: "⚜️", label: "Transcendant", desc: "1 000 révisions", rarity: "epique", cat: "Révisions", check: s => s.totalReviews >= 1000, progress: s => ({ cur: Math.min(s.totalReviews, 1000), max: 1000 }) },
  { id: "10000_reviews", icon: "🌠", label: "Mythique", desc: "10 000 révisions", rarity: "legendaire", cat: "Révisions", check: s => s.totalReviews >= 10000, progress: s => ({ cur: Math.min(s.totalReviews, 10000), max: 10000 }) },
  { id: "speed_demon", icon: "💨", label: "Speed Demon", desc: "100 révisions en une journée", rarity: "legendaire", cat: "Révisions", check: s => s.bestDayReviews >= 100, progress: s => ({ cur: Math.min(s.bestDayReviews || 0, 100), max: 100 }) },
  { id: "combo_10", icon: "🎯", label: "Combo ×10", desc: "10 bonnes réponses d'affilée", rarity: "rare", cat: "Révisions", check: s => (s.bestCombo || 0) >= 10, progress: s => ({ cur: Math.min(s.bestCombo || 0, 10), max: 10 }) },
  { id: "combo_25", icon: "🌀", label: "Combo ×25", desc: "25 bonnes réponses d'affilée", rarity: "epique", cat: "Révisions", check: s => (s.bestCombo || 0) >= 25, progress: s => ({ cur: Math.min(s.bestCombo || 0, 25), max: 25 }) },
  { id: "leech_slayer", icon: "🩹", label: "Sauveteur de leech", desc: "Sauver 5 fiches récalcitrantes", rarity: "epique", cat: "Révisions", check: s => (s.leechesRescued || 0) >= 5, progress: s => ({ cur: Math.min(s.leechesRescued || 0, 5), max: 5 }) },

  // ── IA & découverte ──
  { id: "ai_user", icon: "🤖", label: "IA Partner", desc: "5 fiches générées par IA", rarity: "commun", cat: "IA", check: s => s.aiGenerated >= 5, progress: s => ({ cur: Math.min(s.aiGenerated, 5), max: 5 }) },
  { id: "ai_master", icon: "🧬", label: "Ingénieur IA", desc: "50 fiches générées par IA", rarity: "rare", cat: "IA", check: s => s.aiGenerated >= 50, progress: s => ({ cur: Math.min(s.aiGenerated, 50), max: 50 }) },
  { id: "ai_overlord", icon: "👾", label: "IA Overlord", desc: "300 fiches générées par IA", rarity: "legendaire", cat: "IA", check: s => s.aiGenerated >= 300, progress: s => ({ cur: Math.min(s.aiGenerated, 300), max: 300 }) },
  { id: "lab_explorer", icon: "🔭", label: "Explorateur Lab", desc: "3 documents analysés", rarity: "commun", cat: "Découverte", check: s => s.pdfsAnalyzed >= 3, progress: s => ({ cur: Math.min(s.pdfsAnalyzed || 0, 3), max: 3 }) },
  { id: "pomodoro_first", icon: "🍅", label: "Premier Pomodoro", desc: "Terminer 1 session Pomodoro", rarity: "commun", cat: "Discipline", check: s => (s.pomodorosDone || 0) >= 1, progress: s => ({ cur: Math.min(s.pomodorosDone || 0, 1), max: 1 }) },
  { id: "pomodoro_25", icon: "⏱️", label: "Machine à focus", desc: "25 sessions Pomodoro", rarity: "epique", cat: "Discipline", check: s => (s.pomodorosDone || 0) >= 25, progress: s => ({ cur: Math.min(s.pomodorosDone || 0, 25), max: 25 }) },
  { id: "nocturne", icon: "🌙", label: "Hibou Nocturne", desc: "Étudier après minuit", rarity: "commun", cat: "Discipline", check: s => s.lateNightSessions >= 1, progress: s => ({ cur: Math.min(s.lateNightSessions || 0, 1), max: 1 }) },
  // ── CHANTIER 25/26 — Discipline : la routine quotidienne ──
  { id: "routine_first_perfect", icon: "🌟", label: "Journée Parfaite", desc: "Compléter 100 % de ta routine sur une journée", rarity: "commun", cat: "Discipline", check: s => (s.routinePerfectDays || 0) >= 1, progress: s => ({ cur: Math.min(s.routinePerfectDays || 0, 1), max: 1 }) },
  { id: "routine_perfect_7", icon: "🗓️", label: "Semaine réglée", desc: "7 journées de routine à 100 %", rarity: "rare", cat: "Discipline", check: s => (s.routinePerfectDays || 0) >= 7, progress: s => ({ cur: Math.min(s.routinePerfectDays || 0, 7), max: 7 }) },
  { id: "routine_perfect_30", icon: "🧭", label: "Discipline d'acier", desc: "30 journées de routine à 100 %", rarity: "epique", cat: "Discipline", check: s => (s.routinePerfectDays || 0) >= 30, progress: s => ({ cur: Math.min(s.routinePerfectDays || 0, 30), max: 30 }) },
  { id: "routine_perfect_100", icon: "🕊️", label: "Rituel inébranlable", desc: "100 journées de routine à 100 %", rarity: "legendaire", cat: "Discipline", check: s => (s.routinePerfectDays || 0) >= 100, progress: s => ({ cur: Math.min(s.routinePerfectDays || 0, 100), max: 100 }) },
  { id: "routine_streak_5", icon: "🌿", label: "Routine en série", desc: "5 jours consécutifs de routine complète", rarity: "rare", cat: "Discipline", check: s => (s.routineStreak || 0) >= 5, progress: s => ({ cur: Math.min(s.routineStreak || 0, 5), max: 5 }) },
  { id: "routine_streak_21", icon: "🌳", label: "Habitude ancrée", desc: "21 jours consécutifs de routine complète", rarity: "legendaire", cat: "Discipline", check: s => (s.routineStreak || 0) >= 21, progress: s => ({ cur: Math.min(s.routineStreak || 0, 21), max: 21 }) },
  { id: "early_bird", icon: "🌅", label: "Lève-tôt", desc: "Étudier avant 7h", rarity: "commun", cat: "Discipline", check: s => s.earlyMorningSessions >= 1, progress: s => ({ cur: Math.min(s.earlyMorningSessions || 0, 1), max: 1 }) },

  // ── Progression XP ──
  { id: "xp_level_5", icon: "⭐", label: "Niveau 5", desc: "Atteindre le niveau 5", rarity: "rare", cat: "Progression", check: s => (s.level || 0) >= 5, progress: s => ({ cur: Math.min(s.level || 0, 5), max: 5 }) },
  { id: "xp_level_10", icon: "💫", label: "Niveau 10", desc: "Atteindre le niveau 10", rarity: "epique", cat: "Progression", check: s => (s.level || 0) >= 10, progress: s => ({ cur: Math.min(s.level || 0, 10), max: 10 }) },
  { id: "xp_level_20", icon: "🌞", label: "Niveau 20", desc: "Atteindre le niveau 20", rarity: "legendaire", cat: "Progression", check: s => (s.level || 0) >= 20, progress: s => ({ cur: Math.min(s.level || 0, 20), max: 20 }) },
  { id: "xp_10k", icon: "🔋", label: "10 000 XP", desc: "Cumuler 10 000 XP", rarity: "epique", cat: "Progression", check: s => (s.totalXP || 0) >= 10000, progress: s => ({ cur: Math.min(s.totalXP || 0, 10000), max: 10000 }) },
];

// ───────────────────────────────────────────────────────────────────────────
// 2. Paliers générés — seuils RÉALISTES, libellés porteurs de sens
// ───────────────────────────────────────────────────────────────────────────
const PROGRESSIONS = [
  {
    cat: "Création", key: "totalCards", noun: "fiche",
    tiers: [5, 25, 75, 150, 250, 300, 400, 500, 650, 800, 900, 1000],
    names: ["Semeur", "Copiste", "Compilateur", "Bâtisseur", "Éditeur", "Architecte", "Curateur", "Conservateur", "Maître d'œuvre", "Cartographe du savoir", "Bibliothèque vivante", "Légende du corpus"],
    icons: ["🌿", "🖊️", "📒", "🧱", "📔", "📐", "🗃️", "🏺", "🏗️", "🗺️", "📚", "🏆"],
  },
  {
    cat: "Streak", key: "streak", noun: "jour d'affilée",
    tiers: [5, 10, 14, 21, 45, 75, 150, 200, 365],
    names: ["Étincelle", "Braise", "Deux semaines", "Trois semaines", "Flamme durable", "Brasier", "Inferno", "Phénix", "Une année entière"],
    icons: ["✨", "🪵", "🔥", "🕯️", "🔆", "🌋", "☄️", "🦅", "🎆"],
  },
  {
    cat: "Révisions", key: "totalReviews", noun: "révision",
    tiers: [25, 50, 150, 250, 400, 750, 1200, 1500, 2500, 3200, 4000, 5000, 6000, 8000],
    names: ["Premiers pas", "Régulier", "Constant", "Diligent", "Appliqué", "Assidu", "Coureur de fond", "Marathonien", "Endurant", "Increvable", "Infatigable", "Artisan", "Forgeron", "Colosse"],
    icons: ["👣", "📆", "🧷", "📖", "🧮", "🧭", "🥾", "🏃", "🛡️", "🫀", "⛰️", "🪚", "🔨", "🗿"],
  },
  {
    cat: "Mémoire (FSRS)", key: "plannedMastered", noun: "fiche consolidée",
    tiers: [5, 25, 40, 75, 125, 200, 300, 400, 500, 600, 800],
    names: ["Ancrage", "Sédiment", "Strate", "Fondation", "Socle", "Contrefort", "Pilier", "Voûte", "Nef", "Cathédrale", "Panthéon"],
    icons: ["📌", "🧊", "🪨", "🧱", "🏔️", "🗼", "🏛️", "⛩️", "🕌", "🕍", "🌐"],
  },
  {
    cat: "Production active", key: "produced", noun: "expression produite",
    tiers: [3, 10, 25, 50, 75, 110, 150, 200, 250, 320, 400],
    names: ["Premiers mots", "Phrases", "Conversation", "Échange", "Aisance", "Spontanéité", "Fluidité", "Nuance", "Éloquence", "Verve", "Seconde nature"],
    icons: ["💬", "🗯️", "🗨️", "🔁", "🎤", "🌱", "🌊", "🎨", "🎭", "📣", "🧿"],
  },
  {
    cat: "Production active", key: "masteredReal", noun: "expression maîtrisée",
    tiers: [5, 50, 150, 300],
    names: ["Répertoire naissant", "Répertoire solide", "Répertoire riche", "Répertoire d'expert"],
    icons: ["🎒", "📦", "🏺", "💠"],
  },
  {
    cat: "IA", key: "aiGenerated", noun: "fiche IA",
    tiers: [1, 15, 100, 150, 500, 750],
    names: ["Curieux", "Connecté", "Augmenté", "Co-pilote", "Symbiote", "Singularité"],
    icons: ["🔌", "📡", "🦾", "🛰️", "🧿", "🌌"],
  },
  {
    cat: "Révisions", key: "bestDayReviews", noun: "révision en un jour",
    tiers: [15, 30, 50, 75, 120, 150],
    names: ["Sprint", "Cadence", "Acharné", "Bourreau de travail", "Forge", "Titan"],
    icons: ["🏁", "🎽", "💪", "⚒️", "🔥", "🦾"],
  },
  {
    cat: "Discipline", key: "earlyMorningSessions", noun: "session matinale",
    tiers: [3, 10, 25, 50, 100],
    names: ["Aurore", "Coq", "Première lueur", "Rituel du matin", "Soleil levant"],
    icons: ["🌄", "🐓", "🌤️", "🍵", "🌞"],
  },
  {
    cat: "Discipline", key: "lateNightSessions", noun: "session nocturne",
    tiers: [3, 10, 25, 50, 100],
    names: ["Veilleur", "Hibou", "Sentinelle", "Gardien de nuit", "Insomniaque"],
    icons: ["🌃", "🦉", "🛡️", "🌘", "☕"],
  },
  {
    cat: "Discipline", key: "pomodorosDone", noun: "Pomodoro",
    tiers: [5, 50, 100, 250],
    names: ["Rythme", "Cadence de fer", "Horloger", "Maître du temps"],
    icons: ["🍅", "⏲️", "🕰️", "⌛"],
  },
  {
    cat: "Découverte", key: "pdfsAnalyzed", noun: "document analysé",
    tiers: [1, 10, 25, 50, 100],
    names: ["Éclaireur", "Cartographe", "Chercheur", "Investigateur", "Oracle"],
    icons: ["🔍", "🗺️", "🧪", "🕵️", "🔮"],
  },
  {
    cat: "Progression", key: "totalXP", noun: "XP",
    tiers: [500, 2500, 25000, 50000, 100000],
    names: ["Étincelle d'XP", "Réservoir", "Réacteur", "Étoile", "Supernova"],
    icons: ["⚡", "🔋", "☢️", "⭐", "💥"],
  },
];

function rarityForIndex(idx, total) {
  const pct = total <= 1 ? 1 : idx / (total - 1);
  if (pct >= 0.85) return "legendaire";
  if (pct >= 0.6) return "epique";
  if (pct >= 0.3) return "rare";
  return "commun";
}

function generateProgressionBadges() {
  const out = [];
  for (const p of PROGRESSIONS) {
    p.tiers.forEach((threshold, idx) => {
      out.push({
        id: `gen_${p.key}_${threshold}`,
        icon: p.icons[idx] || "🎖️",
        label: p.names[idx] || `${p.cat} ${idx + 1}`,
        desc: `${threshold.toLocaleString("fr-FR")} ${p.noun}${threshold > 1 ? "s" : ""}`,
        rarity: rarityForIndex(idx, p.tiers.length),
        cat: p.cat,
        check: (s) => (s[p.key] || 0) >= threshold,
        progress: (s) => ({ cur: Math.min(s[p.key] || 0, threshold), max: threshold }),
      });
    });
  }
  return out;
}

// Badges combinés — objectifs à deux dimensions, seuils atteignables.
function generateComboBadges() {
  const combos = [
    { a: "streak", b: "totalReviews", aT: [7, 21, 60], bT: [200, 800, 3000], cat: "Révisions", title: "Forge mentale", icons: ["🔩", "⚙️", "🏭"], aLabel: "jours", bLabel: "révisions" },
    { a: "masteredReal", b: "totalCards", aT: [10, 50, 150], bT: [100, 300, 700], cat: "Production active", title: "Architecte du savoir", icons: ["🧭", "🗼", "🏙️"], aLabel: "maîtrisées", bLabel: "fiches" },
    { a: "aiGenerated", b: "produced", aT: [20, 80, 200], bT: [10, 50, 120], cat: "IA", title: "Symbiose IA", icons: ["🤝", "🧠", "🌐"], aLabel: "fiches IA", bLabel: "produites" },
    { a: "streak", b: "pomodorosDone", aT: [14, 45, 100], bT: [10, 40, 100], cat: "Discipline", title: "Voie du moine", icons: ["🧘", "⛰️", "🕊️"], aLabel: "jours", bLabel: "pomodoros" },
  ];
  const out = [];
  for (const c of combos) {
    c.aT.forEach((aThr, i) => {
      const bThr = c.bT[i];
      out.push({
        id: `combo_${c.a}_${c.b}_${aThr}_${bThr}`,
        icon: c.icons[i],
        label: `${c.title} ${["I", "II", "III"][i]}`,
        desc: `${aThr} ${c.aLabel} + ${bThr} ${c.bLabel}`,
        rarity: ["rare", "epique", "legendaire"][i],
        cat: c.cat,
        check: (s) => (s[c.a] || 0) >= aThr && (s[c.b] || 0) >= bThr,
        progress: (s) => {
          const av = Math.min(s[c.a] || 0, aThr) / aThr;
          const bv = Math.min(s[c.b] || 0, bThr) / bThr;
          return { cur: Math.round(((av + bv) / 2) * 100), max: 100 };
        },
      });
    });
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Export combiné (sans doublons d'id) — plus aucun padding artificiel
// ───────────────────────────────────────────────────────────────────────────
const _seen = new Set();
export const BADGES = [...HAND_CRAFTED, ...generateProgressionBadges(), ...generateComboBadges()].filter(b => {
  if (_seen.has(b.id)) return false;
  _seen.add(b.id);
  return true;
});

/** Ids morts (catégorie "Héritage" supprimée) — purgés au chargement. */
export const RETIRED_BADGE_IDS = [
  "exam_mode", "exam5", "exam20", "perfectionist",
  "theory_first", "theory_scholar", "theory_master",
  "code_first", "code_ten", "code_fifty", "code_duel_win", "code_duel_5",
  "consistency", "ten_master", "fifty_master", "grandmaster", "first_master",
  "200_cards_legacy", "200_reviews",
];

export function isBadgeId(id) {
  return BADGES.some(b => b.id === id);
}

// ───────────────────────────────────────────────────────────────────────────
// 4. Niveaux d'XP & archétypes
// ───────────────────────────────────────────────────────────────────────────
export const XP_LEVELS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500, 10000];

export const ARCHETYPES = [
  { level: 0, title: "Apprenti", icon: "🌱" },
  { level: 1, title: "Initié", icon: "📚" },
  { level: 2, title: "Scribe", icon: "✍️" },
  { level: 3, title: "Érudit", icon: "🎓" },
  { level: 4, title: "Sorcier du Code", icon: "🧙" },
  { level: 5, title: "Maître des Runes", icon: "📜" },
  { level: 6, title: "Archimage", icon: "🔮" },
  { level: 7, title: "Sage", icon: "🦉" },
  { level: 8, title: "Oracle", icon: "✨" },
  { level: 9, title: "Transcendant", icon: "🌟" },
  { level: 10, title: "Dieu du Savoir", icon: "👑" },
  { level: 11, title: "Entité Cosmique", icon: "🌌" },
];

// ── CHANTIER 12 — vrais paliers de titres au-delà du niveau 12 ────────────
// Avant : tous les niveaux 12→1000 partageaient 4 titres avec un suffixe
// artificiel « (T990) ». Maintenant : un titre DISTINCT tous les 25-50
// niveaux, avec sa propre icône. Le rang romain n'apparaît qu'à l'intérieur
// d'un palier, et seulement s'il y a réellement plusieurs crans.
export const ARCHETYPE_TIERS = [
  { from: 12,  title: "Entité Cosmique",          icon: "🌌" },
  { from: 25,  title: "Veilleur des Constellations", icon: "🔭" },
  { from: 40,  title: "Tisseur de Mémoire",       icon: "🕸️" },
  { from: 50,  title: "Dieu Multiversel",         icon: "🪐" },
  { from: 65,  title: "Gardien des Cycles",       icon: "🌗" },
  { from: 80,  title: "Forgeron de Synapses",     icon: "🧬" },
  { from: 100, title: "Maître de l'Espace-Temps", icon: "⏳" },
  { from: 150, title: "Voix du Silence",          icon: "🜁" },
  { from: 200, title: "Souverain des Savoirs",    icon: "📖" },
  { from: 300, title: "Sculpteur de Réalités",    icon: "🗿" },
  { from: 400, title: "Écho Primordial",          icon: "🌊" },
  { from: 500, title: "Créateur d'Univers",       icon: "🌠" },
  { from: 700, title: "Origine",                  icon: "🕳️" },
  { from: 900, title: "Au-delà du Nom",           icon: "🕊️" },
];

export function archetypeTierFor(level) {
  let tier = ARCHETYPE_TIERS[0];
  for (const t of ARCHETYPE_TIERS) { if (level >= t.from) tier = t; }
  return tier;
}

// Progression longue (jusqu'au niveau 1000)
for (let i = 12; i <= 1000; i++) {
  const lastXp = XP_LEVELS[i - 1];
  const diff = 2500 + (i * 250);
  XP_LEVELS.push(lastXp + diff);

  const tier = archetypeTierFor(i);
  const rank = i - tier.from + 1;
  ARCHETYPES.push({
    level: i,
    title: rank > 1 ? `${tier.title} ${rank}` : tier.title,
    icon: tier.icon,
  });
}

export const getArchetype = (xp) => {
  const safeXp = Math.max(0, Number(xp) || 0);
  let currentLevel = 0;
  for (let i = 0; i < XP_LEVELS.length; i++) { if (safeXp >= XP_LEVELS[i]) { currentLevel = i; } else { break; } }
  const archetype = ARCHETYPES.find(a => a.level === currentLevel) || ARCHETYPES[ARCHETYPES.length - 1];
  const nextLevelXp = XP_LEVELS[Math.min(currentLevel + 1, XP_LEVELS.length - 1)];
  const currentLevelXp = XP_LEVELS[currentLevel];
  const progress = nextLevelXp > currentLevelXp ? Math.round(((safeXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100) : 100;
  return { ...archetype, level: currentLevel, xp: safeXp, currentLevelXp, nextLevelXp, progress };
};
