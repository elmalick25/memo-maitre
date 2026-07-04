// ═══════════════════════════════════════════════════════════════════════════
// GAMIFICATION — Badges, niveaux d'XP, archétypes
// Extrait de MemoMaster.jsx (refactor lisibilité)
//
// 🆕 1000+ badges supplémentaires générés à partir de paliers (cards,
// streak, reviews, mastered, aiGenerated, sessions matinales/nocturnes,
// PDFs analysés). Chaque badge reste fonctionnel (check + progress) et
// dispose d'une rareté cohérente avec sa difficulté.
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// 1. Badges historiques (curaté à la main)
// ───────────────────────────────────────────────────────────────────────────
const HAND_CRAFTED = [
  // Création
  { id: "first_card", icon: "🌱", label: "Première pousse", desc: "Créer ta 1ère fiche", rarity: "commun", cat: "Création", check: s => s.totalCards >= 1, progress: s => ({ cur: Math.min(s.totalCards, 1), max: 1 }) },
  { id: "ten_cards", icon: "📚", label: "Bibliothécaire", desc: "10 fiches créées", rarity: "commun", cat: "Création", check: s => s.totalCards >= 10, progress: s => ({ cur: Math.min(s.totalCards, 10), max: 10 }) },
  { id: "fifty_cards", icon: "🗂️", label: "Encyclopédiste", desc: "50 fiches créées", rarity: "rare", cat: "Création", check: s => s.totalCards >= 50, progress: s => ({ cur: Math.min(s.totalCards, 50), max: 50 }) },
  { id: "100_cards", icon: "🎨", label: "Créateur", desc: "100 fiches créées", rarity: "rare", cat: "Création", check: s => s.totalCards >= 100, progress: s => ({ cur: Math.min(s.totalCards, 100), max: 100 }) },
  { id: "200_cards", icon: "🏛️", label: "Grand Archiviste", desc: "200 fiches créées", rarity: "epique", cat: "Création", check: s => s.totalCards >= 200, progress: s => ({ cur: Math.min(s.totalCards, 200), max: 200 }) },
  { id: "five_hundred", icon: "🌟", label: "Étoile filante", desc: "500 fiches créées", rarity: "legendaire", cat: "Création", check: s => s.totalCards >= 500, progress: s => ({ cur: Math.min(s.totalCards, 500), max: 500 }) },

  // Streak
  { id: "streak3", icon: "🔥", label: "En feu", desc: "3 jours de streak", rarity: "commun", cat: "Streak", check: s => s.streak >= 3, progress: s => ({ cur: Math.min(s.streak, 3), max: 3 }) },
  { id: "streak7", icon: "⚡", label: "Semaine parfaite", desc: "7 jours de streak", rarity: "rare", cat: "Streak", check: s => s.streak >= 7, progress: s => ({ cur: Math.min(s.streak, 7), max: 7 }) },
  { id: "streak30", icon: "🏆", label: "Mois de légende", desc: "30 jours de streak", rarity: "legendaire", cat: "Streak", check: s => s.streak >= 30, progress: s => ({ cur: Math.min(s.streak, 30), max: 30 }) },
  { id: "consistency", icon: "🪨", label: "Roc", desc: "Rév. 30 jours consécutifs", rarity: "legendaire", cat: "Streak", check: s => s.streak >= 30, progress: s => ({ cur: Math.min(s.streak, 30), max: 30 }) },
  { id: "unstoppable", icon: "⚡", label: "Inarrêtable", desc: "Streak de 60 jours", rarity: "legendaire", cat: "Streak", check: s => s.streak >= 60, progress: s => ({ cur: Math.min(s.streak, 60), max: 60 }) },
  { id: "streak100", icon: "👑", label: "Invincible", desc: "100 jours de streak", rarity: "legendaire", cat: "Streak", check: s => s.streak >= 100, progress: s => ({ cur: Math.min(s.streak, 100), max: 100 }) },
  { id: "nocturne", icon: "🌙", label: "Hibou Nocturne", desc: "Étudier après minuit", rarity: "rare", cat: "Streak", check: s => s.lateNightSessions >= 1, progress: s => ({ cur: Math.min(s.lateNightSessions || 0, 1), max: 1 }) },
  { id: "early_bird", icon: "🌅", label: "Lève-tôt", desc: "Étudier avant 7h", rarity: "rare", cat: "Streak", check: s => s.earlyMorningSessions >= 1, progress: s => ({ cur: Math.min(s.earlyMorningSessions || 0, 1), max: 1 }) },

  // Maîtrise
  { id: "first_master", icon: "✅", label: "Premier maître", desc: "1ère fiche maîtrisée", rarity: "commun", cat: "Maîtrise", check: s => s.mastered >= 1, progress: s => ({ cur: Math.min(s.mastered, 1), max: 1 }) },
  { id: "ten_master", icon: "🎓", label: "Diplômé", desc: "10 fiches maîtrisées", rarity: "rare", cat: "Maîtrise", check: s => s.mastered >= 10, progress: s => ({ cur: Math.min(s.mastered, 10), max: 10 }) },
  { id: "fifty_master", icon: "🧠", label: "Génie", desc: "50 fiches maîtrisées", rarity: "epique", cat: "Maîtrise", check: s => s.mastered >= 50, progress: s => ({ cur: Math.min(s.mastered, 50), max: 50 }) },
  { id: "grandmaster", icon: "♟️", label: "Grand Maître", desc: "200 fiches maîtrisées", rarity: "legendaire", cat: "Maîtrise", check: s => s.mastered >= 200, progress: s => ({ cur: Math.min(s.mastered, 200), max: 200 }) },
  { id: "all_reviewed", icon: "🧘", label: "Zen", desc: "0 fiche en retard", rarity: "epique", cat: "Maîtrise", check: s => s.totalCards > 0 && s.dueCount === 0, progress: s => ({ cur: s.dueCount === 0 ? 1 : 0, max: 1 }) },

  // Révisions
  { id: "hundred_reviews", icon: "💎", label: "Diamant", desc: "100 révisions totales", rarity: "rare", cat: "Révisions", check: s => s.totalReviews >= 100, progress: s => ({ cur: Math.min(s.totalReviews, 100), max: 100 }) },
  { id: "200_reviews", icon: "🏃", label: "Marathonien", desc: "200 révisions totales", rarity: "rare", cat: "Révisions", check: s => s.totalReviews >= 200, progress: s => ({ cur: Math.min(s.totalReviews, 200), max: 200 }) },
  { id: "500_reviews", icon: "🌊", label: "Flot continu", desc: "500 révisions totales", rarity: "epique", cat: "Révisions", check: s => s.totalReviews >= 500, progress: s => ({ cur: Math.min(s.totalReviews, 500), max: 500 }) },
  { id: "1000_reviews", icon: "⚜️", label: "Transcendant", desc: "1000 révisions totales", rarity: "legendaire", cat: "Révisions", check: s => s.totalReviews >= 1000, progress: s => ({ cur: Math.min(s.totalReviews, 1000), max: 1000 }) },
  { id: "speed_demon", icon: "💨", label: "Speed Demon", desc: "100 révisions en 1 jour", rarity: "legendaire", cat: "Révisions", check: s => s.bestDayReviews >= 100, progress: s => ({ cur: Math.min(s.bestDayReviews || 0, 100), max: 100 }) },

  // IA
  { id: "ai_user", icon: "🤖", label: "IA Partner", desc: "Générer 5 fiches via IA", rarity: "rare", cat: "IA", check: s => s.aiGenerated >= 5, progress: s => ({ cur: Math.min(s.aiGenerated, 5), max: 5 }) },
  { id: "ai_master", icon: "🧬", label: "Ingénieur IA", desc: "Générer 50 fiches via IA", rarity: "epique", cat: "IA", check: s => s.aiGenerated >= 50, progress: s => ({ cur: Math.min(s.aiGenerated, 50), max: 50 }) },
  { id: "ai_overlord", icon: "👾", label: "IA Overlord", desc: "Générer 200 fiches via IA", rarity: "legendaire", cat: "IA", check: s => s.aiGenerated >= 200, progress: s => ({ cur: Math.min(s.aiGenerated, 200), max: 200 }) },
  { id: "lab_explorer", icon: "🔭", label: "Explorateur Lab", desc: "Analyser 3 PDFs", rarity: "rare", cat: "IA", check: s => s.pdfsAnalyzed >= 3, progress: s => ({ cur: Math.min(s.pdfsAnalyzed || 0, 3), max: 3 }) },

  // Héritage
  { id: "exam_mode", icon: "🎯", label: "Testeur (Legacy)", desc: "Ancien mode examen", rarity: "commun", cat: "Héritage", check: () => false, progress: () => null },
  { id: "exam5", icon: "🏅", label: "Candidat sérieux (Legacy)", desc: "Ancien mode examen", rarity: "rare", cat: "Héritage", check: () => false, progress: () => null },
  { id: "exam20", icon: "🎖️", label: "Vétéran des tests (Legacy)", desc: "Ancien mode examen", rarity: "epique", cat: "Héritage", check: () => false, progress: () => null },
  { id: "perfectionist", icon: "💯", label: "Perfectionniste (Legacy)", desc: "Ancien mode examen", rarity: "epique", cat: "Héritage", check: () => false, progress: () => null },
  { id: "theory_first", icon: "📖", label: "Lecteur (Legacy)", desc: "Ancien mode théorie", rarity: "commun", cat: "Héritage", check: () => false, progress: () => null },
  { id: "theory_scholar", icon: "🎒", label: "Érudit (Legacy)", desc: "Ancien mode théorie", rarity: "rare", cat: "Héritage", check: () => false, progress: () => null },
  { id: "theory_master", icon: "🦉", label: "Sage (Legacy)", desc: "Ancien mode théorie", rarity: "epique", cat: "Héritage", check: () => false, progress: () => null },
  { id: "code_first", icon: "💻", label: "Hello World (Legacy)", desc: "Ancien mode code", rarity: "commun", cat: "Héritage", check: () => false, progress: () => null },
  { id: "code_ten", icon: "⌨️", label: "Codeur (Legacy)", desc: "Ancien mode code", rarity: "rare", cat: "Héritage", check: () => false, progress: () => null },
  { id: "code_fifty", icon: "🖥️", label: "Développeur (Legacy)", desc: "Ancien mode code", rarity: "epique", cat: "Héritage", check: () => false, progress: () => null },
  { id: "code_duel_win", icon: "⚔️", label: "Duelliste (Legacy)", desc: "Ancien mode code", rarity: "rare", cat: "Héritage", check: () => false, progress: () => null },
  { id: "code_duel_5", icon: "🗡️", label: "Gladiateur (Legacy)", desc: "Ancien mode code", rarity: "epique", cat: "Héritage", check: () => false, progress: () => null },
  { id: "quiz_first", icon: "❓", label: "Questionneur (Legacy)", desc: "Ancien mode quiz", rarity: "commun", cat: "Héritage", check: () => false, progress: () => null },
  { id: "quiz_ten", icon: "🧩", label: "Quizzeur (Legacy)", desc: "Ancien mode quiz", rarity: "rare", cat: "Héritage", check: () => false, progress: () => null },
  { id: "quiz_speed", icon: "💨", label: "Speed Quiz (Legacy)", desc: "Ancien mode quiz", rarity: "rare", cat: "Héritage", check: () => false, progress: () => null },
  { id: "quiz_perfect", icon: "💯", label: "Quiz Parfait (Legacy)", desc: "Ancien mode quiz", rarity: "epique", cat: "Héritage", check: () => false, progress: () => null },
  { id: "quiz_combo", icon: "🔢", label: "Combo Master (Legacy)", desc: "Ancien mode quiz", rarity: "legendaire", cat: "Héritage", check: () => false, progress: () => null },
];

// ───────────────────────────────────────────────────────────────────────────
// 2. Générateur — 1000+ badges supplémentaires
// ───────────────────────────────────────────────────────────────────────────
function rarityFor(percentile) {
  // percentile ∈ [0,1] : 0 = très facile, 1 = légendaire
  if (percentile < 0.2) return "commun";
  if (percentile < 0.5) return "rare";
  if (percentile < 0.85) return "epique";
  return "legendaire";
}

const ICON_POOL = {
  Création:   ["🌱","🌿","🌳","🌲","🪴","🌸","🌼","🌺","🌻","🍀","📚","📖","📒","📓","📔","📕","📗","📘","📙","🗂️","🏛️","🎨","✍️","🖋️","🖊️","✒️","📜","📃","📄","📋"],
  Streak:     ["🔥","⚡","🌟","💫","✨","☄️","🌠","🌞","🌅","🌄","🌇","🌆","🌃","🌌","🌙","🌜","🌛","🪐","☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","🪨"],
  Maîtrise:   ["✅","☑️","✔️","🎓","🧠","🧘","♟️","🏆","🥇","🥈","🥉","🏅","🎖️","🏵️","🎀","🎁","🎇","🎆","🪄","🔮","💎","💠","🔷","🔶","🟢","🟦","🟪","🟧","🟨","⚪"],
  Révisions:  ["💎","🏃","🚀","🛸","🚁","🚂","🚄","🚅","🚆","🚇","🚈","🚉","🚊","🚋","🚌","🚍","🚎","🏎️","🚓","🚔","🚑","🚒","🚐","🚚","🚛","🚜","🛵","🏍️","🛴","🦽"],
  IA:         ["🤖","🧬","👾","🛰️","🪐","🔭","🛠️","⚙️","🔧","🔩","⚗️","🧪","🧫","🧯","🔋","💡","🖥️","💻","⌨️","🖱️","💾","💿","📀","📡","🛜","📶","📊","📈","📉","🗃️"],
  Endurance:  ["🪨","🛡️","⚔️","🗡️","🏹","🪃","🪓","🪚","🔨","⛏️","🧱","🏗️","🗼","🗿","🏔️","⛰️","🌋","🗻","🏕️","⛺","🏞️","🏖️","🌅","🌠","🌌","♾️","🪜","🧗","⛹️","🤸"],
  Découverte: ["🧭","🗺️","🧳","🛎️","🎫","🎟️","🎪","🎭","🪅","🪆","🪡","🪢","🧶","🧵","🪞","🪟","🚪","🛋️","🪑","🛏️","🛌","🪠","🚿","🛁","🧴","🧷","🧺","🧻","🪣","🧼"],
  Discipline: ["🧘","🪷","☯️","🕉️","☸️","✡️","☪️","🕎","🛕","⛩️","🕌","⛪","🛐","📿","🪬","🪯","🧿","🔱","🪔","🕯️","⚱️","🏺","🪞","🪟","🧱","🏛️","🗿","🏯","🏰","🎌"],
};

function pickIcon(cat, seed) {
  const pool = ICON_POOL[cat] || ICON_POOL.Création;
  return pool[seed % pool.length];
}

// Liste de paliers : on génère un badge par palier.
// Catégorie → { metric, statKey, label(tier), desc(tier), tiers: [..], unit }
const PROGRESSIONS = [
  { cat: "Création", key: "totalCards", noun: "fiche", tiers: [1,3,5,10,15,20,25,30,40,50,60,75,90,100,125,150,175,200,250,300,350,400,500,600,750,1000,1250,1500,2000,2500,3000,4000,5000,7500,10000], titles: ["Pionnier","Bâtisseur","Architecte","Maître d'œuvre","Légende"] },
  { cat: "Streak",   key: "streak",     noun: "jour", tiers: [1,2,3,4,5,6,7,10,14,21,30,45,60,75,90,100,120,150,180,210,250,300,365,500,750,1000], titles: ["Étincelle","Flamme","Brasier","Inferno","Phénix"] },
  { cat: "Maîtrise", key: "mastered",   noun: "maîtrise", tiers: [1,3,5,10,15,20,25,30,40,50,75,100,150,200,250,300,400,500,750,1000,1500,2000,3000,5000], titles: ["Apprenti","Compagnon","Maître","Grand Maître","Sage"] },
  { cat: "Révisions",key: "totalReviews", noun: "révision", tiers: [10,25,50,75,100,150,200,300,400,500,750,1000,1500,2000,2500,3000,4000,5000,7500,10000,15000,20000,30000,50000,75000,100000], titles: ["Diligent","Assidu","Marathonien","Endurant","Mythique"] },
  { cat: "IA",       key: "aiGenerated", noun: "fiche IA", tiers: [1,3,5,10,20,30,50,75,100,150,200,300,500,750,1000,1500,2000,3000,5000], titles: ["Curieux","Connecté","Augmenté","Symbiote","Singularité"] },
  { cat: "Endurance",key: "bestDayReviews", noun: "rev/jour", tiers: [10,20,30,50,75,100,150,200,300,500,750,1000], titles: ["Sprint","Acharné","Bourreau de travail","Forge","Titan"] },
  { cat: "Discipline", key: "earlyMorningSessions", noun: "matin", tiers: [1,3,5,7,10,15,20,30,50,75,100,150,200,300,500], titles: ["Aurore","Lève-tôt","Coq","Aube","Soleil levant"] },
  { cat: "Discipline", key: "lateNightSessions", noun: "nuit", tiers: [1,3,5,7,10,15,20,30,50,75,100,150,200,300,500], titles: ["Veilleur","Hibou","Strige","Sentinelle","Insomniaque"] },
  { cat: "Découverte", key: "pdfsAnalyzed", noun: "PDF", tiers: [1,2,3,5,7,10,15,20,30,50,75,100,150,200,300], titles: ["Explorateur","Cartographe","Chercheur","Investigateur","Oracle"] },
];

const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX","XXI","XXII","XXIII","XXIV","XXV","XXVI","XXVII","XXVIII","XXIX","XXX","XXXI","XXXII","XXXIII","XXXIV","XXXV","XXXVI","XXXVII","XXXVIII","XXXIX","XL"];

function generateProgressionBadges() {
  const out = [];
  for (const p of PROGRESSIONS) {
    p.tiers.forEach((threshold, idx) => {
      const pct = idx / Math.max(1, p.tiers.length - 1);
      const rarity = rarityFor(pct);
      const titleSlot = Math.min(p.titles.length - 1, Math.floor(pct * p.titles.length));
      const baseTitle = p.titles[titleSlot];
      const tierLabel = ROMAN[idx] || `T${idx + 1}`;
      out.push({
        id: `gen_${p.key}_${threshold}`,
        icon: pickIcon(p.cat, idx + threshold),
        label: `${baseTitle} ${tierLabel}`,
        desc: `${threshold} ${p.noun}${threshold > 1 ? "s" : ""}`,
        rarity,
        cat: p.cat,
        check: (s) => (s[p.key] || 0) >= threshold,
        progress: (s) => ({ cur: Math.min(s[p.key] || 0, threshold), max: threshold }),
      });
    });
  }
  return out;
}

// Badges combinés : streak + reviews, mastered + cards, etc.
function generateComboBadges() {
  const combos = [
    { a: "streak", b: "totalReviews", aT: [7,14,30,60,100], bT: [100,500,1000,2500,5000], cat: "Endurance", title: "Forge mentale" },
    { a: "mastered", b: "totalCards", aT: [10,50,100,250,500], bT: [50,100,300,750,1500], cat: "Maîtrise", title: "Architecte du savoir" },
    { a: "aiGenerated", b: "mastered", aT: [10,50,100,250,500], bT: [10,50,100,250,500], cat: "IA", title: "Symbiose IA" },
    { a: "streak", b: "mastered", aT: [7,30,60,100,180], bT: [10,50,100,250,500], cat: "Discipline", title: "Voie du moine" },
  ];
  const out = [];
  combos.forEach((c, ci) => {
    c.aT.forEach((aThr, i) => {
      const bThr = c.bT[i];
      const pct = i / (c.aT.length - 1);
      out.push({
        id: `combo_${c.a}_${c.b}_${aThr}_${bThr}`,
        icon: pickIcon(c.cat, ci * 7 + i * 3),
        label: `${c.title} ${ROMAN[i]}`,
        desc: `${aThr} ${c.a} + ${bThr} ${c.b}`,
        rarity: rarityFor(pct + 0.1),
        cat: c.cat,
        check: (s) => (s[c.a] || 0) >= aThr && (s[c.b] || 0) >= bThr,
        progress: (s) => {
          const av = Math.min(s[c.a] || 0, aThr) / aThr;
          const bv = Math.min(s[c.b] || 0, bThr) / bThr;
          const cur = Math.round(((av + bv) / 2) * 100);
          return { cur, max: 100 };
        },
      });
    });
  });
  return out;
}

// Pad pour atteindre au moins 1000 badges générés en plus des hand-crafted.
function padToAtLeast(arr, target) {
  if (arr.length >= target) return arr;
  const padded = [...arr];
  const baseMetrics = ["totalCards", "totalReviews", "mastered", "streak"];
  let i = 0;
  while (padded.length < target) {
    const metric = baseMetrics[i % baseMetrics.length];
    const tier = padded.length + 1;
    // Paliers fins pour ne pas trop empiéter sur les paliers ronds.
    const threshold = 7 + i * 11;
    const cat = metric === "streak" ? "Streak" : metric === "mastered" ? "Maîtrise" : metric === "totalReviews" ? "Révisions" : "Création";
    const pct = (i % 100) / 100;
    padded.push({
      id: `aux_${metric}_${threshold}_${i}`,
      icon: pickIcon(cat, i * 13),
      label: `Quête ${ROMAN[i % ROMAN.length] || `#${i+1}`}`,
      desc: `${threshold} ${metric}`,
      rarity: rarityFor(pct),
      cat,
      check: (s) => (s[metric] || 0) >= threshold,
      progress: (s) => ({ cur: Math.min(s[metric] || 0, threshold), max: threshold }),
    });
    i++;
  }
  return padded;
}

const GENERATED = padToAtLeast(
  [...generateProgressionBadges(), ...generateComboBadges()],
  1000
);

// ───────────────────────────────────────────────────────────────────────────
// 3. Export combiné (sans doublons d'id)
// ───────────────────────────────────────────────────────────────────────────
const _seen = new Set();
export const BADGES = [...HAND_CRAFTED, ...GENERATED].filter(b => {
  if (_seen.has(b.id)) return false;
  _seen.add(b.id);
  return true;
});

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

// NOUVEAU : Progression infinie (génère jusqu'au niveau 1000)
for (let i = 12; i <= 1000; i++) {
  const lastXp = XP_LEVELS[i - 1];
  const diff = 2500 + (i * 250); // XP nécessaire augmente avec le niveau
  XP_LEVELS.push(lastXp + diff);
  
  let title = "Entité Cosmique";
  let icon = "🌌";
  if (i >= 50) { title = "Dieu Multiversel"; icon = "🪐"; }
  if (i >= 100) { title = "Maître de l'Espace-Temps"; icon = "⏳"; }
  if (i >= 500) { title = "Créateur d'Univers"; icon = "🌠"; }
  
  ARCHETYPES.push({ level: i, title: `${title} (T${i - 10})`, icon });
}

export const getArchetype = (xp) => {
  let currentLevel = 0;
  for (let i = 0; i < XP_LEVELS.length; i++) { if (xp >= XP_LEVELS[i]) { currentLevel = i; } else { break; } }
  const archetype = ARCHETYPES.find(a => a.level === currentLevel) || ARCHETYPES[ARCHETYPES.length - 1];
  const nextLevelXp = XP_LEVELS[Math.min(currentLevel + 1, XP_LEVELS.length - 1)];
  const currentLevelXp = XP_LEVELS[currentLevel];
  const progress = nextLevelXp > currentLevelXp ? Math.round(((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100) : 100;
  return { ...archetype, level: currentLevel, xp, currentLevelXp, nextLevelXp, progress };
};
