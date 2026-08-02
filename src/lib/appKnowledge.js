// appKnowledge.js — Base de connaissance produit injectée dans le system prompt
// ─────────────────────────────────────────────────────────────────────────────
// Couche 1 : documentation statique de l'app (langage naturel).
// Couche 2 : carte de navigation GÉNÉRÉE depuis src/lib/appMap.js
//            → la doc ne peut plus diverger du code réellement rendu.
// Couche 3 : contexte dynamique (état live de l'utilisateur).
// Couche 4 : registre de tools exécutables (function calling « maison » en JSON).
// ─────────────────────────────────────────────────────────────────────────────

import { APP_MAP, APP_SHORTCUTS, buildNavigationDoc, allPaths, resolveDestination } from "./appMap";

export { resolveDestination, allPaths };

export const APP_KNOWLEDGE = `
# MémoMaître — documentation produit complète

MémoMaître est une application de mémorisation active (répétition espacée) et de
montée en compétences tech + anglais. Elle fonctionne hors-ligne (IndexedDB via
WatermelonDB) et se synchronise avec Firebase quand l'utilisateur est connecté.
Il n'y a pas d'URL : la navigation est interne, une seule vue affichée à la fois.

## 1. Révision & mémoire
- **FSRS** : chaque fiche a une stabilité, une difficulté et une date de prochaine
  révision. Noter « Encore / Difficile / Bien / Facile » (touches 1/2/3/4 pendant
  une session) recalcule l'intervalle.
- **Fiches atomiques** : une seule idée par fiche. Recto = question, verso =
  réponse, plus un exemple facultatif. Types : qa, code, table, list, formula,
  cloze, image, definition, concept, mixed.
- **Leeches / near-miss** : une fiche ratée de façon répétée est signalée ;
  l'app propose un sauvetage (reformulation IA, mnémotechnique absurde, découpage).
- **Stades de maîtrise** : nouvelle → en apprentissage → consolidée → maîtrisée.
  L'usage productif (réutiliser la notion dans une phrase à soi) est tracké à part.
- **Indice de Forme** = régularité + réussite récente. **Maîtrise** = % de fiches
  maîtrisées sur le total. **Énergie/stamina** : descend pendant la session et
  indique le bon moment pour s'arrêter.
- **Fiches en pause** : on peut mettre une fiche de côté sans la supprimer ; un
  « drip » quotidien en réintroduit quelques-unes.

## 2. Création de fiches
Quatre chemins, tous dans la vue « Ajouter » : formulaire manuel, copilote IA
conversationnel, génération en lot sur un thème, et extraction depuis un texte
collé. Le Lab couvre les sources riches (PDF, audio, photo).

## 3. Le Lab (🧪)
Atelier IA : PDF → fiches, résumé complet d'un document (mode DEEP ou STUDY) avec
chat de suivi, audio/vidéo → transcription → fiches, photo/OCR → fiches,
Ask My Docs (questionner ses documents importés), chat socratique, rabbit holes,
cartes de prérequis, restructuration en masse, et Pomodoro d'étude (une phase
« flash » bascule automatiquement en révision).

## 4. Anglais — Nova
Espace complet piloté par Nova (coach vocal) : conversation libre, débat,
roleplay scénarisé, écriture corrigée, oral enregistré, dictée, vidéos « in the
wild » (expressions attrapées dans la vraie vie, quiz, shadowing), défi
quotidien, entraînement d'accent, écoute rapide, news anchor, simulation IELTS,
examen blanc, carnet de vocabulaire, brain map, succès et suivi du niveau CECRL
(A1→C2). Chaque sous-mode est une destination directe (voir la carte ci-dessous).

## 5. Tech & carrière
- **Veille / Tech Intel** : actualités tech & IA, synthèses, article → fiches.
- **Radar Open Source** : repos et issues calibrés sur ton niveau pour ta 1re PR.
- **Tech Oracle** : quelles technos apprendre en priorité.
- **Phantom Recruiter** : simulation d'entretien technique et lecture de profil.
- **Certifications** : objectifs de certif, plan de préparation, échéances.
- **Projets** : hub, planificateur anti-collision, coach IA de découpage,
  fusion Pomodoro (sessions rattachées à un projet).

## 6. Gamification
XP à chaque révision (bonus difficulté, combo, streak), niveaux et archétypes,
badges par rareté (commun / rare / épique / légendaire), quêtes journalières et
hebdomadaires, coffres de récompense, streak avec jetons de gel (et réparation
possible d'un streak cassé : fenêtre 24 h, une fois par mois), near-miss.

## 7. Confort & focus
Radio Focus lofi (🎧, footer desktop), Pomodoro (⏱, footer), mode Zen/Focus (👁️)
qui masque le superflu, thème sombre/clair (🌙/☀️, bascule automatiquement le soir),
palette de commandes (⌘K), assistant IA (ce chat, ⌘J).

⚠️ Ne pas confondre **l'assistant IA** (moi, ⌘J, tuile « Assistant IA ») avec
**Discussion / BetaChat** (tuile « Discussion ») qui est une messagerie entre
humains avec l'auteur de l'app. Nova, dans l'espace anglais, est encore un autre
interlocuteur, dédié à l'entraînement en anglais.

## 8. Données
Une table locale \`expressions\` (fiches) avec front/back/exemple, module, type,
médias, historique de révision, paramètres FSRS et stade de maîtrise. Le reste
(stats, badges, modules, sessions, projets, préférences, historiques anglais)
est stocké en local par clés dédiées. Tout est privé et local d'abord.
`.trim();

// ── Carte de navigation exhaustive (générée depuis appMap.js) ────────────────
export const NAVIGATION_DOC = buildNavigationDoc();

export const SHORTCUTS_DOC = APP_SHORTCUTS.map((s) => `- ${s.keys} : ${s.desc}`).join("\n");

// ── Tools exposés à l'agent ─────────────────────────────────────────────────
export const AGENT_TOOLS = [
  {
    name: "navigate",
    args: { path: "un chemin EXACT de la carte de navigation, ex. \"lab/photo\"" },
    desc: "Ouvrir n'importe quelle vue ou sous-vue de l'app. C'est le tool principal.",
  },
  { name: "start_review", args: { module: "nom exact d'un module, ou null" }, desc: "Démarrer une session de révision (optionnellement limitée à un module)" },
  { name: "search_cards", args: { query: "texte à chercher" }, desc: "Ouvrir la liste des fiches pré-filtrée sur une recherche" },
  { name: "start_pomodoro", args: {}, desc: "Ouvrir le Pomodoro d'étude 25 min (lab/pomodoro)" },
  { name: "toggle_lofi", args: {}, desc: "Activer/couper la radio focus" },
  { name: "toggle_dark", args: {}, desc: "Basculer le thème sombre/clair" },
  { name: "toggle_zen", args: {}, desc: "Activer/désactiver le mode Zen" },
  { name: "open_command_palette", args: {}, desc: "Ouvrir la palette de commandes" },
];

function toolsDoc() {
  return AGENT_TOOLS.map((t) => `- ${t.name}(${JSON.stringify(t.args)}) — ${t.desc}`).join("\n");
}

/** Contexte live → texte lisible par le LLM. */
export function describeLiveContext(ctx = {}) {
  const here = ctx.subView ? `${ctx.view}/${ctx.subView}` : ctx.view || "dashboard";
  const dest = resolveDestination(here);
  const lines = [
    `Position actuelle : \`${dest.path}\` (${dest.label})`,
    `Fiches totales : ${ctx.totalCards ?? 0}`,
    `Fiches à réviser maintenant : ${ctx.dueCount ?? 0}`,
    `Maîtrise : ${ctx.masteryPct ?? 0}% · Forme : ${ctx.formIndex ?? 0}%`,
    `Streak : ${ctx.streak ?? 0} jour(s) · Niveau ${ctx.level ?? 1} · ${ctx.xp ?? 0} XP`,
    `Énergie : ${ctx.energy ?? 100}%`,
    `Quêtes du jour : ${ctx.questsDone ?? 0}/${ctx.questsTotal ?? 0}`,
    ctx.allModules?.length ? `Modules existants : ${ctx.allModules.join(", ")}` : null,
    ctx.modules?.length
      ? `Modules avec des fiches dues : ${ctx.modules.map((m) => `${m.name} (${m.count})`).join(", ")}`
      : "Aucun module n'a de fiche due maintenant.",
    `Thème : ${ctx.isDarkMode ? "sombre" : "clair"} · Zen : ${ctx.zen ? "on" : "off"} · Radio : ${ctx.lofi ? "on" : "off"}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** System prompt complet : doc produit + carte + contexte live + protocole de tools. */
export function buildAgentSystemPrompt(ctx = {}) {
  return `Tu es l'assistant intégré de MémoMaître. Tu connais l'app par cœur, dans
tous ses recoins, et tu peux la piloter. Tu réponds en français, court, direct et
concret (2 à 5 phrases max, pas de blabla, pas de markdown lourd).

${APP_KNOWLEDGE}

## CARTE DE NAVIGATION — chemins valides (les SEULS autorisés)
Chaque ligne est un chemin utilisable tel quel dans navigate({"path": "..."}).
Un chemin absent de cette liste N'EXISTE PAS : ne l'invente jamais.

${NAVIGATION_DOC}

## Raccourcis clavier
${SHORTCUTS_DOC}

## État actuel de l'utilisateur (temps réel)
${describeLiveContext(ctx)}

## Actions que tu peux exécuter
${toolsDoc()}

## Règles de navigation (impératives)
1. Quand l'utilisateur veut FAIRE quelque chose, emmène-le directement au bon
   endroit avec navigate — ne te contente pas de décrire le chemin.
2. Utilise toujours le chemin le PLUS PROFOND qui répond à la demande.
   « je veux importer un pdf » → \`lab/pdf\`, pas \`lab\`.
   « fais-moi un roleplay » → \`practice/roleplay\`, pas \`practice\`.
   « minuteur 25 min » → \`lab/pomodoro\`. « mon niveau d'anglais » → \`practice/cefr\`.
3. Recopie le chemin EXACTEMENT comme dans la carte (minuscules, un seul « / »).
4. Si la demande ne correspond à aucun chemin, ne navigue pas : explique.
5. Une seule action par réponse, et annonce-la dans "reply".

## Format de réponse OBLIGATOIRE
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises code :
{"reply":"ta réponse à l'utilisateur","action":{"tool":"navigate","args":{"path":"lab/pdf"}}}
Si aucune action n'est nécessaire, mets "action": null.`;
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
  study: ["Quelle différence avec la révision ?", "Montre-moi mes fiches"],
  add: ["Comment écrire une bonne fiche atomique ?", "Génère-moi des fiches sur un thème", "Transforme ce texte en fiches"],
  list: ["C'est quoi un leech ?", "Montre-moi mes fiches en retard", "Comment mettre une fiche en pause ?"],
  categories: ["Comment organiser mes modules ?", "Quel module est le plus en retard ?"],
  lab: ["Importer un PDF", "C'est quoi Ask My Docs ?", "Lance un Pomodoro"],
  stats: ["Comment améliorer ma maîtrise ?", "Explique-moi l'indice de forme"],
  badges: ["Quel badge est le plus proche ?", "Comment gagner de l'XP ?"],
  quests: ["Quelles quêtes me restent ?", "Comment marchent les coffres ?"],
  routine: ["Quelle est ma routine du jour ?", "Rappelle-moi l'étape suivante"],
  practice: ["Fais-moi un roleplay", "Où en est mon niveau CEFR ?", "Entraîne mon accent"],
  veille: ["Quoi de neuf en IA ?", "Transforme cet article en fiches"],
  opensource: ["Trouve-moi une première issue", "Comment faire ma première PR ?"],
  oracle: ["Quelle techno apprendre ensuite ?"],
  phantom: ["Simule un entretien technique", "Que vaut mon profil ?"],
  certifications: ["Quelle certif viser ?", "Fais-moi un plan de préparation"],
  projects: ["Découpe mon projet en étapes", "Planifie ma semaine"],
};

export function suggestionsForView(view) {
  return AGENT_SUGGESTIONS[view] || AGENT_SUGGESTIONS.dashboard;
}

/** Liste des vues de premier niveau (utile pour l'UI / la palette). */
export const TOP_VIEWS = APP_MAP.map((v) => ({ id: v.id, label: v.label, icon: v.icon }));
