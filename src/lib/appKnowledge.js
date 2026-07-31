// appKnowledge.js — Base de connaissance produit injectée dans le system prompt
// ─────────────────────────────────────────────────────────────────────────────
// Couche 1 : documentation statique de l'app (langage naturel).
// Couche 2 : contexte dynamique (état live de l'utilisateur) — buildAgentSystemPrompt.
// Couche 3 : registre de tools exécutables (function calling « maison » en JSON).
// ─────────────────────────────────────────────────────────────────────────────

export const APP_KNOWLEDGE = `
# MémoMaître — documentation produit

MémoMaître est une application de mémorisation active (spaced repetition) et de
montée en compétences tech/anglais. Elle fonctionne hors-ligne (IndexedDB) et se
synchronise avec Firebase.

## Révision & mémoire
- Algorithme FSRS : chaque fiche possède une stabilité, une difficulté et une date
  de prochaine révision. Noter "Encore / Difficile / Bien / Facile" recalcule l'intervalle.
- Fiches atomiques : une idée par fiche (recto = question, verso = réponse, + exemple).
- Les fiches ratées de façon répétée deviennent des "leeches" : l'app propose un
  sauvetage (reformulation IA, mnémotechnique absurde, découpage).
- Stades de maîtrise : nouvelle → en apprentissage → consolidée → maîtrisée.
- L'indice de "Forme" mesure la régularité + la réussite récente ; la "Maîtrise"
  est le pourcentage de fiches maîtrisées sur le total.

## Le Lab (🧪)
Atelier IA : génération de fiches depuis un texte ou un PDF, import de documents,
Ask My Docs (questionner ses cours), chat socratique, rabbit holes, cartes
de prérequis, restructuration en masse, Pomodoro d'étude.

## Gamification
- XP gagnée à chaque révision (bonus difficulté, combo, streak), niveaux et archétypes.
- Streak journalier avec jetons de gel pour absorber les jours manqués, et
  réparation possible d'un streak cassé (fenêtre 24 h, 1×/mois).
- Badges, quêtes journalières, coffres de récompense, near-miss ("plus qu'une fiche…").
- Énergie/stamina : baisse au fil de la session, indique quand s'arrêter.

## Anglais & veille
- English Practice : entraînement à l'accent, écoute rapide, speak-it challenges,
  suivi CEFR, expressions attrapées "in the wild".
- Tech Intel / Veille : actus, radar open-source, oracle tech, challenges de production.

## Confort & focus
- Radio Focus (🎧) : stations lofi/ambient dans le footer desktop.
- Pomodoro (⏱) : minuteur de session dans le footer.
- Mode Zen/Focus (👁️) : masque le superflu pendant la révision.
- Mode sombre/clair (🌙/☀️).
- Palette de commandes (⌘K / Ctrl+K) : lancer une review, ouvrir le Lab, etc.
- Assistant (🤖) : ce chat. Raccourci ⌘J / Ctrl+J sur desktop, tuile "Discussion" sur mobile.

## Vues principales
dashboard (accueil), review (révision), add (ajouter une fiche), list (toutes les fiches),
stats (statistiques), lab (atelier IA), practice (anglais), veille (tech intel),
routine (routine du jour), quests (quêtes), badges.
`.trim();

// ── Tools exposés à l'agent (miroir des commandes du CommandPalette) ─────────
export const AGENT_TOOLS = [
  { name: "navigate", args: { view: "dashboard|review|add|list|stats|lab|practice|veille|routine|quests|badges" }, desc: "Ouvrir une vue de l'app" },
  { name: "start_review", args: { module: "nom du module ou null" }, desc: "Démarrer une session de révision" },
  { name: "toggle_lofi", args: {}, desc: "Activer/couper la radio focus" },
  { name: "toggle_dark", args: {}, desc: "Basculer le thème sombre/clair" },
  { name: "toggle_zen", args: {}, desc: "Activer/désactiver le mode Zen" },
  { name: "start_pomodoro", args: {}, desc: "Lancer une session Pomodoro de 25 minutes" },
  { name: "open_command_palette", args: {}, desc: "Ouvrir la palette de commandes" },
];

function toolsDoc() {
  return AGENT_TOOLS
    .map((t) => `- ${t.name}(${JSON.stringify(t.args)}) — ${t.desc}`)
    .join("\n");
}

/** Contexte live → texte lisible par le LLM. */
export function describeLiveContext(ctx = {}) {
  const lines = [
    `Vue actuelle : ${ctx.view || "dashboard"}`,
    `Fiches totales : ${ctx.totalCards ?? 0}`,
    `Fiches à réviser maintenant : ${ctx.dueCount ?? 0}`,
    `Maîtrise : ${ctx.masteryPct ?? 0}% · Forme : ${ctx.formIndex ?? 0}%`,
    `Streak : ${ctx.streak ?? 0} jour(s) · Niveau ${ctx.level ?? 1} · ${ctx.xp ?? 0} XP`,
    `Énergie : ${ctx.energy ?? 100}%`,
    `Quêtes du jour : ${ctx.questsDone ?? 0}/${ctx.questsTotal ?? 0}`,
    ctx.modules?.length ? `Modules en retard : ${ctx.modules.map((m) => `${m.name} (${m.count})`).join(", ")}` : null,
    `Thème : ${ctx.isDarkMode ? "sombre" : "clair"} · Zen : ${ctx.zen ? "on" : "off"} · Radio : ${ctx.lofi ? "on" : "off"}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** System prompt complet : doc produit + contexte live + protocole de tools. */
export function buildAgentSystemPrompt(ctx = {}) {
  return `Tu es l'assistant intégré de MémoMaître. Tu connais l'app par cœur et tu
peux la piloter. Tu réponds en français, de façon courte, directe et concrète
(2 à 5 phrases max, pas de blabla, pas de markdown lourd).

${APP_KNOWLEDGE}

## État actuel de l'utilisateur (temps réel)
${describeLiveContext(ctx)}

## Actions que tu peux exécuter
${toolsDoc()}

## Format de réponse OBLIGATOIRE
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises code :
{"reply":"ta réponse à l'utilisateur","action":{"tool":"navigate","args":{"view":"stats"}}}
Si aucune action n'est nécessaire, mets "action": null.
N'exécute une action que si l'utilisateur le demande clairement ou que c'est
manifestement utile. Annonce toujours dans "reply" ce que tu fais.`;
}

/** Sérialise l'historique de conversation en un seul message utilisateur. */
export function buildConversationPayload(messages, latest) {
  const history = messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Assistant"} : ${m.content}`)
    .join("\n");
  return history ? `${history}\nUtilisateur : ${latest}` : `Utilisateur : ${latest}`;
}

export const AGENT_SUGGESTIONS = {
  dashboard: ["Par quoi je commence aujourd'hui ?", "Montre-moi mes stats", "Lance une session de 25 min"],
  review: ["Comment fonctionne le FSRS ?", "Je bloque sur cette fiche", "Active le mode zen"],
  lab: ["Comment générer des fiches depuis un PDF ?", "C'est quoi Ask My Docs ?"],
  stats: ["Comment améliorer ma maîtrise ?", "Explique-moi l'indice de forme"],
  list: ["Comment écrire une bonne fiche atomique ?", "C'est quoi un leech ?"],
  practice: ["Comment progresser en anglais ici ?", "C'est quoi le suivi CEFR ?"],
};

export function suggestionsForView(view) {
  return AGENT_SUGGESTIONS[view] || AGENT_SUGGESTIONS.dashboard;
}
