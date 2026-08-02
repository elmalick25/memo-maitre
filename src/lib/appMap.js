// appMap.js — CARTE COMPLÈTE DE L'APPLICATION (source de vérité unique)
// ═══════════════════════════════════════════════════════════════════════════════
// Ce fichier décrit CHAQUE destination réellement rendue par l'app :
//   • les vues de premier niveau (MemoMaster → navState.view)
//   • les sous-vues réellement branchées (add / lab / practice / projects)
//
// Il sert à 3 choses :
//   1. Construire la documentation injectée dans le system prompt de l'assistant
//      (impossible que la doc dérive du code : elle EST le code).
//   2. Valider/résoudre une destination demandée par l'assistant AVANT de naviguer
//      → plus jamais d'écran blanc sur une vue inexistante ("exam", "wild"…).
//   3. Alimenter la palette de commandes / les suggestions.
//
// ⚠️ RÈGLE : n'ajouter ici QUE des destinations qui rendent vraiment quelque
//    chose. Une entrée fantôme = un bug de navigation pour l'assistant.
// ═══════════════════════════════════════════════════════════════════════════════

/** @typedef {{ id:string, label:string, icon?:string, desc:string, keywords?:string[] }} SubDest */
/** @typedef {{ id:string, label:string, icon?:string, desc:string, keywords?:string[], subKey?:string, subs?:SubDest[] }} Dest */

/** @type {Dest[]} */
export const APP_MAP = [
  {
    id: "dashboard",
    label: "Accueil",
    icon: "⚡",
    desc: "Tableau de bord : session du jour, indice de Forme, maîtrise, streak, énergie, quêtes, raccourcis vers tous les modules.",
    keywords: ["accueil", "home", "dashboard", "tableau de bord", "début", "commencer", "programme du jour"],
  },
  {
    id: "review",
    label: "Révision",
    icon: "▶",
    desc: "Session de révision FSRS. On note chaque fiche Encore / Difficile / Bien / Facile, ce qui recalcule stabilité, difficulté et date de prochaine révision.",
    keywords: ["review", "révision", "reviser", "réviser", "session", "cartes du jour", "fiches à réviser", "study session"],
  },
  {
    id: "study",
    label: "Mode Étude",
    icon: "📖",
    desc: "Mode étude/lecture : parcourir les fiches sans impacter la planification FSRS.",
    keywords: ["étude", "study", "lecture", "relecture", "sans noter"],
  },
  {
    id: "add",
    label: "Ajouter une fiche",
    icon: "✦",
    desc: "Création de fiches : à la main, avec le copilote IA, en lot, ou depuis un texte collé.",
    keywords: ["ajouter", "créer", "nouvelle fiche", "add", "créer une carte", "saisir"],
    subKey: "addSubView",
    subs: [
      { id: "single", label: "Fiche unique", icon: "✦", desc: "Formulaire recto / verso / exemple, module, type.", keywords: ["manuel", "une fiche", "formulaire"] },
      { id: "chat", label: "Copilot IA", icon: "💬", desc: "Discussion avec l'IA qui transforme la conversation en fiches atomiques.", keywords: ["copilote", "chat", "assistant de création", "dialogue"] },
      { id: "batch", label: "Batch IA", icon: "🚀", desc: "Génération en masse de fiches sur un thème, avec prévisualisation avant import.", keywords: ["lot", "masse", "batch", "plusieurs fiches", "en série"] },
      { id: "text", label: "Depuis un texte", icon: "📄", desc: "Coller un texte : l'IA en extrait des fiches atomiques.", keywords: ["texte", "coller", "paste", "extraire", "cours"] },
    ],
  },
  {
    id: "list",
    label: "Mes fiches",
    icon: "◈",
    desc: "Toutes les fiches : recherche, filtres (module, statut, en retard, leeches, en pause), édition, suppression, restructuration en masse.",
    keywords: ["fiches", "liste", "cartes", "toutes mes fiches", "chercher une fiche", "rechercher", "éditer", "supprimer"],
  },
  {
    id: "categories",
    label: "Modules",
    icon: "◉",
    desc: "Gestion des modules (catégories) : créer, renommer, fusionner, voir la charge et l'avancement de chaque module.",
    keywords: ["modules", "catégories", "categories", "thèmes", "matières", "dossiers"],
  },
  {
    id: "routine",
    label: "Routine du jour",
    icon: "🌟",
    desc: "Routine quotidienne guidée : étapes ordonnées de la journée d'apprentissage, minuteurs et suivi de complétion.",
    keywords: ["routine", "rituel", "journée", "habitudes", "planning du jour", "daily"],
  },
  {
    id: "quests",
    label: "Quêtes",
    icon: "🎯",
    desc: "Quêtes journalières : objectifs du jour, progression, récompenses XP et coffres.",
    keywords: ["quêtes", "quests", "objectifs", "missions", "défis du jour"],
  },
  {
    id: "badges",
    label: "Badges",
    icon: "🏆",
    desc: "Collection de badges débloqués et verrouillés, avec les conditions d'obtention.",
    keywords: ["badges", "trophées", "succès", "achievements", "récompenses"],
  },
  {
    id: "stats",
    label: "Statistiques",
    icon: "▣",
    desc: "Statistiques FSRS détaillées : heatmap annuelle, rétention, charge à venir, maîtrise, indice de Forme, insights.",
    keywords: ["stats", "statistiques", "progression", "courbes", "analyse", "rapport", "heatmap", "rétention"],
  },
  {
    id: "lab",
    label: "Lab IA",
    icon: "🧪",
    desc: "Atelier IA : transformer n'importe quelle source (PDF, audio, photo, texte) en fiches, résumer, et travailler en Pomodoro ou en questionnant ses documents.",
    keywords: ["lab", "atelier", "ia", "outils", "import", "générer des fiches"],
    subKey: "labSubView",
    subs: [
      { id: "pdf", label: "PDF → Fiches", icon: "📄", desc: "Importer un PDF, l'extraire et générer des fiches atomiques module par module.", keywords: ["pdf", "importer", "import", "fichier", "cours pdf"] },
      { id: "resume", label: "Résumé complet", icon: "📝", desc: "Résumé structuré d'un document (mode DEEP ou STUDY) + chat de suivi sur le résumé.", keywords: ["résumé", "resume", "resumer", "résumer", "synthèse", "summary", "document", "deep", "study"] },
      { id: "audio", label: "Audio → Fiche", icon: "🎵", desc: "Transcrire un audio/une vidéo et en tirer des fiches (fiches audio jouables en révision).", keywords: ["audio", "son", "podcast", "vidéo", "transcription", "mp3"] },
      { id: "photo", label: "Photo → Fiche", icon: "📸", desc: "OCR d'une photo (tableau, page de livre, notes manuscrites) puis génération de fiches.", keywords: ["photo", "image", "ocr", "scan", "capture", "tableau"] },
      { id: "pomodoro", label: "Pomodoro d'étude", icon: "🍅", desc: "Minuteur d'étude 25/5 avec phases, dont une phase flash qui bascule en révision.", keywords: ["pomodoro", "minuteur", "timer", "25 minutes", "session 25", "focus timer", "concentration"] },
      { id: "docs", label: "Ask My Docs", icon: "🔎", desc: "Poser des questions en langage naturel à ses documents importés dans le Lab.", keywords: ["ask my docs", "questionner", "mes documents", "docs", "interroger mes cours", "rag"] },
    ],
  },
  {
    id: "practice",
    label: "English (pratique)",
    icon: "🗣️",
    desc: "Espace anglais complet avec Nova : conversation, débat, roleplay, écriture, oral, dictée, vidéos, accent, examens, suivi CEFR.",
    keywords: ["anglais", "english", "practice", "nova", "parler anglais", "langue"],
    subKey: "practiceSubView",
    subs: [
      { id: "chat", label: "Chat", icon: "💬", desc: "Conversation libre en anglais avec Nova, corrections en temps réel.", keywords: ["chat", "conversation", "discuter", "parler", "libre"] },
      { id: "debate", label: "Débat", icon: "⚖️", desc: "Débat argumenté sur un sujet imposé ou choisi, avec contre-arguments.", keywords: ["débat", "debate", "argumenter", "contradiction"] },
      { id: "roleplay", label: "Roleplay", icon: "🎭", desc: "Jeux de rôle scénarisés (entretien, restaurant, réunion…) avec un personnage.", keywords: ["roleplay", "jeu de rôle", "scénario", "mise en situation", "entretien"] },
      { id: "writing", label: "Écriture", icon: "📝", desc: "Exercices d'écriture avec correction détaillée et réécriture niveau natif.", keywords: ["écriture", "writing", "rédaction", "écrire", "texte anglais"] },
      { id: "speaking", label: "Oral", icon: "🎙️", desc: "Prise de parole enregistrée, transcription et évaluation de la fluidité.", keywords: ["oral", "speaking", "parler", "micro", "prononciation", "voix"] },
      { id: "dictation", label: "Dictée", icon: "✍️", desc: "Dictée audio à retranscrire, scorée mot à mot.", keywords: ["dictée", "dictation", "écoute", "transcrire"] },
      { id: "wild", label: "Vidéos (in the wild)", icon: "📺", desc: "Anglais réel : vidéos/extraits, expressions attrapées « in the wild » transformées en fiches.", keywords: ["vidéos", "wild", "youtube", "in the wild", "expressions", "séries"] },
      { id: "daily", label: "Défi du jour", icon: "📅", desc: "Challenge d'anglais quotidien.", keywords: ["daily", "défi", "challenge du jour", "quotidien"] },
      { id: "accent", label: "Entraînement d'accent", icon: "🔊", desc: "Répétition de phrases modèles et scoring de l'accent.", keywords: ["accent", "prononciation", "phonétique", "shadowing"] },
      { id: "coach", label: "Coach", icon: "🧑‍🏫", desc: "Coach personnel : news anchor, écoute rapide, plan de progression.", keywords: ["coach", "entraîneur", "plan", "news anchor", "écoute rapide"] },
      { id: "news", label: "News", icon: "📰", desc: "Actualités en anglais exploitées comme support d'apprentissage.", keywords: ["news anglais", "actualité anglaise", "journal"] },
      { id: "ielts", label: "IELTS", icon: "🎓", desc: "Simulation IELTS Speaking (parties 1/2/3) avec notation par critères.", keywords: ["ielts", "toefl", "certification anglais", "examen anglais"] },
      { id: "exam", label: "Examen d'anglais", icon: "📋", desc: "Mode examen blanc d'anglais chronométré.", keywords: ["examen anglais", "test anglais", "exam"] },
      { id: "cefr", label: "Suivi CEFR", icon: "📈", desc: "Estimation et suivi du niveau CECRL (A1→C2) au fil des sessions.", keywords: ["cefr", "cecrl", "niveau", "a1", "b2", "c1", "évaluation niveau"] },
      { id: "notebook", label: "Carnet", icon: "📓", desc: "Carnet de vocabulaire et de corrections accumulées.", keywords: ["carnet", "notebook", "vocabulaire", "corrections"] },
      { id: "brainmap", label: "Brain Map", icon: "🧠", desc: "Carte mentale du vocabulaire anglais maîtrisé.", keywords: ["brainmap", "carte mentale", "mindmap anglais"] },
      { id: "achievements", label: "Succès anglais", icon: "🏅", desc: "Succès et paliers spécifiques à l'anglais.", keywords: ["succès anglais", "achievements", "trophées anglais"] },
      { id: "dashboard", label: "Tableau de bord anglais", icon: "📊", desc: "Statistiques et XP de l'espace anglais.", keywords: ["stats anglais", "dashboard anglais", "progression anglais"] },
    ],
  },
  {
    id: "veille",
    label: "Actualités / Veille tech",
    icon: "📰",
    desc: "Veille tech & IA en temps réel : articles, synthèses IA, transformation d'un article en fiches.",
    keywords: ["veille", "actualités", "news", "tech", "articles", "intel", "info"],
  },
  {
    id: "opensource",
    label: "Radar Open Source",
    icon: "🚀",
    desc: "Radar open-source : repos et issues adaptés à ton niveau pour faire ta première PR.",
    keywords: ["open source", "opensource", "github", "radar", "pr", "contribuer", "issues"],
  },
  {
    id: "oracle",
    label: "Tech Oracle",
    icon: "🔮",
    desc: "Oracle tech : prédictions et analyses sur les technologies à apprendre en priorité.",
    keywords: ["oracle", "prédictions", "tendances", "quoi apprendre", "techno"],
  },
  {
    id: "phantom",
    label: "Phantom Recruiter",
    icon: "🕵️",
    desc: "Recruteur fantôme : simulation d'entretien technique et évaluation de ton profil.",
    keywords: ["recruteur", "phantom", "entretien", "interview", "job", "cv", "embauche"],
  },
  {
    id: "certifications",
    label: "Certifications",
    icon: "🎓",
    desc: "Suivi des certifications visées : plan de préparation, échéances, fiches liées.",
    keywords: ["certifications", "certif", "diplôme", "aws", "examen", "certification"],
  },
  {
    id: "projects",
    label: "Projets",
    icon: "🗂️",
    desc: "Gestion de projets : hub, planificateur anti-collision, coach IA, fusion Pomodoro.",
    keywords: ["projets", "projects", "chantiers", "roadmap", "planifier"],
    subKey: "projectSubView",
    subs: [
      { id: "hub", label: "Hub", icon: "🗂️", desc: "Vue d'ensemble des projets et de leur statut.", keywords: ["hub", "liste projets", "vue d'ensemble"] },
      { id: "planner", label: "Planificateur", icon: "📅", desc: "Planification anti-collision des créneaux de travail.", keywords: ["planificateur", "planner", "agenda", "créneaux", "calendrier"] },
      { id: "coach", label: "Coach IA", icon: "🤖", desc: "Coach IA qui découpe un projet en étapes actionnables.", keywords: ["coach projet", "découper", "étapes"] },
      { id: "fusion", label: "Fusion Pomodoro", icon: "🎯", desc: "Sessions Pomodoro rattachées à un projet précis.", keywords: ["fusion", "pomodoro projet", "focus projet"] },
    ],
  },
];

// ── Actions globales (pas des destinations, mais pilotables par l'assistant) ──
export const APP_ACTIONS = [
  { id: "toggle_dark", label: "Thème sombre / clair", icon: "🌙", keywords: ["thème", "sombre", "clair", "dark", "light", "nuit", "jour"] },
  { id: "toggle_lofi", label: "Radio Focus (lofi)", icon: "🎧", keywords: ["radio", "musique", "lofi", "focus", "ambiance", "son"] },
  { id: "toggle_zen", label: "Mode Zen / Focus", icon: "👁️", keywords: ["zen", "focus", "épuré", "concentration", "distraction"] },
  { id: "open_command_palette", label: "Palette de commandes (⌘K)", icon: "⌘", keywords: ["palette", "commandes", "cmd k", "raccourcis"] },
  { id: "start_review", label: "Lancer une session de révision", icon: "▶", keywords: ["réviser", "session", "lancer", "commencer"] },
  { id: "start_pomodoro", label: "Lancer un Pomodoro 25 min", icon: "🍅", keywords: ["pomodoro", "25 minutes", "minuteur", "timer"] },
  { id: "search_cards", label: "Rechercher dans les fiches", icon: "🔍", keywords: ["chercher", "rechercher", "trouver une fiche", "search"] },
];

// ── Raccourcis clavier réels ─────────────────────────────────────────────────
export const APP_SHORTCUTS = [
  { keys: "⌘K / Ctrl+K", desc: "Ouvrir la palette de commandes" },
  { keys: "⌘J / Ctrl+J", desc: "Ouvrir / fermer l'assistant IA (ce chat)" },
  { keys: "1", desc: "Accueil" },
  { keys: "2", desc: "Projets" },
  { keys: "3", desc: "Ajouter une fiche" },
  { keys: "4", desc: "Mes fiches" },
  { keys: "5", desc: "Modules" },
  { keys: "6", desc: "English" },
  { keys: "7", desc: "Actualités / veille" },
  { keys: "8", desc: "Radar Open Source" },
  { keys: "9", desc: "Stats" },
  { keys: "R", desc: "Routine / lancer une review depuis la palette" },
  { keys: "Échap", desc: "Fermer l'assistant, la palette ou une modale" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// RÉSOLUTION DE DESTINATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Alias historiques / erreurs fréquentes du LLM → chemin canonique. */
const PATH_ALIASES = {
  home: "dashboard",
  accueil: "dashboard",
  main: "dashboard",
  cards: "list",
  fiches: "list",
  cartes: "list",
  modules: "categories",
  category: "categories",
  revision: "review",
  réviser: "review",
  reviser: "review",
  session: "review",
  english: "practice",
  anglais: "practice",
  wild: "practice/wild",
  "english/wild": "practice/wild",
  cefr: "practice/cefr",
  ielts: "practice/ielts",
  accent: "practice/accent",
  news: "veille",
  actualites: "veille",
  "tech-intel": "veille",
  techintel: "veille",
  intel: "veille",
  pomodoro: "lab/pomodoro",
  timer: "lab/pomodoro",
  import: "lab/pdf",
  "lab/import": "lab/pdf",
  "lab/home": "lab/pdf",
  "lab/godmode": "lab/pdf",
  pdf: "lab/pdf",
  askmydocs: "lab/docs",
  "ask-my-docs": "lab/docs",
  docs: "lab/docs",
  quetes: "quests",
  quest: "quests",
  badge: "badges",
  trophies: "badges",
  statistiques: "stats",
  settings: "dashboard",
  parametres: "dashboard",
  profile: "dashboard",
  // vues supprimées / jamais rendues → repli sûr, jamais d'écran blanc
  exam: "practice/exam",
  examen: "practice/exam",
  battle: "dashboard",
  graph: "stats",
  knowledge: "stats",
  memory: "stats",
};

const STOPWORDS = new Set([
  "les", "des", "une", "mon", "mes", "ton", "tes", "son", "ses", "the", "pour",
  "avec", "dans", "sur", "vers", "moi", "toi", "que", "qui", "quoi", "est",
  "aller", "ouvre", "ouvrir", "montre", "montrer", "affiche", "afficher", "voir",
  "lance", "lancer", "veux", "peux", "faire", "fait", "aux", "etre", "vais",
  "emmene", "amene", "passe", "passer", "bascule", "clique",
]);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Liste plate de toutes les destinations valides : [{ path, view, sub, label, desc, keywords }] */
export function listDestinations() {
  const out = [];
  for (const v of APP_MAP) {
    out.push({
      path: v.id,
      view: v.id,
      sub: null,
      label: v.label,
      icon: v.icon || "",
      desc: v.desc,
      keywords: v.keywords || [],
    });
    for (const s of v.subs || []) {
      out.push({
        path: `${v.id}/${s.id}`,
        view: v.id,
        sub: s.id,
        label: `${v.label} › ${s.label}`,
        icon: s.icon || v.icon || "",
        desc: s.desc,
        keywords: [...(s.keywords || []), ...(v.keywords || [])],
      });
    }
  }
  return out;
}

const ALL_DESTS = listDestinations();
const BY_PATH = new Map(ALL_DESTS.map((d) => [d.path, d]));

export function isValidPath(path) {
  return BY_PATH.has(String(path || "").replace(/^\/+|\/+$/g, ""));
}

export function getDestination(path) {
  return BY_PATH.get(String(path || "").replace(/^\/+|\/+$/g, "")) || null;
}

/**
 * Résout n'importe quelle demande ("le pomodoro", "lab/import", "wild", "stats")
 * vers une destination RÉELLE. Ne renvoie jamais une vue inexistante.
 * @returns {{path:string, view:string, sub:string|null, label:string, desc:string, exact:boolean}}
 */
export function resolveDestination(query, fallback = "dashboard") {
  const raw = String(query || "").trim().replace(/^\/+|\/+$/g, "");
  if (!raw) return { ...getDestination(fallback), exact: false };

  // 1. chemin exact
  if (BY_PATH.has(raw)) return { ...BY_PATH.get(raw), exact: true };

  // 2. alias direct (brut puis normalisé)
  const aliasKeys = [raw, raw.toLowerCase(), norm(raw).replace(/ /g, "-"), norm(raw).replace(/ /g, "")];
  for (const k of aliasKeys) {
    const target = PATH_ALIASES[k];
    if (target && BY_PATH.has(target)) return { ...BY_PATH.get(target), exact: true };
  }

  // 3. "view/sub" dont la vue existe mais pas la sous-vue → on résout la sous-vue,
  //    sinon on retombe sur la vue (jamais d'écran blanc).
  if (raw.includes("/")) {
    const [v, s] = raw.split("/");
    const parent = APP_MAP.find((x) => x.id === v) || (PATH_ALIASES[v] ? APP_MAP.find((x) => x.id === PATH_ALIASES[v].split("/")[0]) : null);
    if (parent) {
      const nq = norm(s);
      const sub = (parent.subs || []).find(
        (x) => norm(x.id) === nq || norm(x.label) === nq || (x.keywords || []).some((k) => norm(k) === nq),
      );
      if (sub) return { ...BY_PATH.get(`${parent.id}/${sub.id}`), exact: true };
      return { ...BY_PATH.get(parent.id), exact: false };
    }
  }

  // 4. score textuel sur label / id / mots-clés
  const nq = norm(raw);
  if (!nq) return { ...getDestination(fallback), exact: false };
  const tokens = nq.split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t));
  let best = null;
  let bestScore = 0;
  for (const d of ALL_DESTS) {
    const keys = (d.keywords || []).map(norm);
    const hay = norm([d.path, d.label].join(" ")) + " " + keys.join(" ");
    let score = 0;
    if (norm(d.path) === nq || norm(d.label) === nq) score += 100;
    if (keys.includes(nq)) score += 80;
    if (hay.includes(nq)) score += 40;
    for (const t of tokens) {
      // un mot-clé entier retrouvé dans la phrase = signal fort
      if (keys.includes(t) || norm(d.path).split(" ").includes(t)) score += 40;
      else if (keys.some((k) => k.split(" ").includes(t))) score += 25;
      else if (hay.includes(t)) score += 8;
    }
    // à score égal, on préfère une vue de premier niveau
    if (!d.sub) score += 2;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  if (best && bestScore >= 25) return { ...best, exact: false };
  return { ...getDestination(fallback), exact: false };
}

/** Documentation Markdown générée depuis la carte (injectée dans le system prompt). */
export function buildNavigationDoc() {
  const lines = [];
  for (const v of APP_MAP) {
    lines.push(`- \`${v.id}\` — ${v.icon || ""} ${v.label} : ${v.desc}`);
    for (const s of v.subs || []) {
      lines.push(`    - \`${v.id}/${s.id}\` — ${s.icon || ""} ${s.label} : ${s.desc}`);
    }
  }
  return lines.join("\n");
}

/** Tous les chemins valides, en une ligne (pour contraindre le LLM). */
export function allPaths() {
  return ALL_DESTS.map((d) => d.path);
}
