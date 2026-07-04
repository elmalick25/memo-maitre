# Mise à jour MemoMaster

## ✅ Correctifs livrés dans ce zip

1. **Force Sync supprimé** — l'entrée "🔄 Force Sync" a été retirée du drawer
   desktop (section *Apprentissage*) et de la grille mobile (*Analyse & IA*)
   dans `MemoMaster.jsx`.

2. **Bouton "Réveil express / Review express / Consolidation / Touche finale"
   ne faisait rien** — le `onClick` faisait `setView("review")` sans
   alimenter la queue, donc la vue review s'affichait vide. Maintenant il
   appelle `startReview(null, "standard")` qui construit la queue smart
   correctement. (Mode `explore` continue d'aller vers le Lab.)

3. **Bouton "Modifier" dans la vue review** — à côté de "🗑️ Supprimer", un
   nouveau bouton "✏️ Modifier" :
   - mémorise la fiche en cours (`editReturnTo`),
   - ouvre la vue Ajouter en mode édition,
   - à la sauvegarde ("Mise à jour"), retour automatique sur la vue review,
     sur la même fiche, avec la queue rafraîchie (front/back/example/category
     mis à jour à la volée). Annuler renvoie aussi à la review.

4. **Fiches mélangées entre modules** — la comparaison de catégorie est
   maintenant **normalisée (trim + lowercase)** dans `filteredExps`. Une
   fiche enregistrée comme `"anglais "` ou `"Anglais"` n'apparaîtra plus
   dans le module `"Python"` à cause d'un simple écart de casse / d'espace.
   Si tu vois encore du mélange, vérifie dans Modules que tu n'as pas deux
   modules portant un nom quasi-identique (espaces invisibles).

5. **Service Worker — plus jamais coincé sur une ancienne version après un
   deploy Firebase** :
   - `controllerchange` → reload unique automatique dès que le nouveau SW
     prend le contrôle.
   - `onNeedRefresh` applique immédiatement `updateSW(true)` (skipWaiting).
   - `r.update()` est forcé à l'enregistrement, au focus de la fenêtre, et
     au retour de visibilité, en plus du polling 60s.
   - Résultat : après un deploy, la page suivante (ou un simple changement
     d'onglet) recharge silencieusement la nouvelle version.

## 🟡 À traiter dans une prochaine itération

- **Vue Actu** (`LiveNewsModule.jsx`, `TechIntelView.jsx`, `CoachNewsAnchor.jsx`)
  — audit des sources et filtrage strict "monde de l'informatique". Demande
  un passage dédié pour reconfigurer les flux RSS et l'algorithme de
  ranking (et éventuellement brancher un agent de priorisation pour ne rien
  rater d'important).

- **Vue English** (`EnglishPractice.jsx`, `EnglishInTheWild.jsx`) — 8 500
  lignes au total. Un audit ciblé bug-par-bug est nécessaire : indique-moi
  les comportements précis que tu observes (onglet, action, attendu vs
  obtenu) et je corrige.

## 🚀 God Mode V3 — Conversation vocale (livré)

### 1. Fix iOS PWA (le vrai)
`src/lib/iosVoiceHardening.js` : `armIosAudio()` synchrone dans l'onClick
(AudioContext partagé + oscillateur sub-audible pour empêcher iOS de
re-suspendre + `<audio playsinline>` primé pour la piste WebRTC distante +
speechSynthesis ping). `visibilitychange` resume auto. Screen Wake Lock
pendant la session. Auto-reconnect (2 tentatives, backoff 400/800 ms) si
la WebRTC coupe involontairement. Choix transport WebRTC/WebSocket selon
batterie & réseau (`navigator.getBattery` + `navigator.connection`).
Haptique `navigator.vibrate` sur start/stop/connect.

### 2. Live Link avec l'app (God Mode)
`src/lib/agentClientTools.js` — registre global de tools que l'agent
ElevenLabs peut appeler EN PLEINE CONVERSATION.

Dans `EnglishPractice.jsx`, 4 tools sont enregistrés :
- **`save_expression({front, back, example?, category?})`** — l'agent crée
  une fiche SRS à la volée quand tu lui dis « ajoute cette expression ».
  +15 XP automatique + toast.
- **`mark_correction({original, corrected, note?})`** — enregistre les
  corrections dans `mm_agent_corrections_v1` (revisitables plus tard).
- **`award_xp({amount, reason})`** — l'agent peut te récompenser un effort.
- **`end_session_summary({...})`** — recap structuré sauvé en fin de session.

⚠️ Pour que le LLM appelle ces tools, il faut aussi les déclarer côté
ElevenLabs (Dashboard → Agent → Tools → Client tool) avec le même nom et
schéma. Les handlers côté client sont prêts.

### 3. Contexte élève envoyé à l'agent au connect
`sendContextualUpdate` push un snapshot JSON compact **à chaque connexion** :
niveau XP, streak, CEFR, fiches en retard (top 3 urgent), expressions
ciblées de la session, profil psycholinguistique, résumé des 2 dernières
sessions vocales. L'agent NOVA connaît maintenant ta situation réelle
avant même de dire bonjour.

### 4. Mémoire de sessions
`src/lib/agentSessionMemory.js` — chaque conversation vocale est archivée
(30 dernières, 40 tours max) dans `mm_agent_diary_v1`. Utilisée pour
alimenter le [CONTINUITY MEMORY] du prompt système à la session suivante.

### Fichiers touchés
- `src/lib/iosVoiceHardening.js` (nouveau)
- `src/lib/agentClientTools.js` (nouveau)
- `src/lib/agentSessionMemory.js` (nouveau)
- `src/AgentVoiceBar.jsx` (patch)
- `src/EnglishPractice.jsx` (patch : ~1 useEffect qui enregistre tools + snapshot builder)

## 🩹 Patch English v2 — Fiches auto + fallback Nova illimité

### 1. Le détecteur de fiches fonctionne TOUT LE TEMPS
`src/useAgentCardDetector.js` :
- Parseur JSON de secours embarqué : quand le LLM renvoie du texte avec des
  fences ```json ou du bavardage autour, le détecteur récupère quand même
  la fiche au lieu de la jeter silencieusement.
- `MIN_USER_WORDS` passé de 2 → 1, debounce 1200 → 900 ms : la détection
  s'accroche même sur les répliques courtes.

`src/EnglishPractice.jsx` :
- `enabled: true` en dur pour `useAgentCardDetector` (avant : uniquement quand
  ElevenLabs était connecté ou dans le tab "chat"). Résultat : les fiches se
  créent aussi pendant une session Nova, en Roleplay, en Debate, en IELTS,
  bref partout où il y a un échange user ↔ agent.
- Le dédoublonnage et le filtre "qualité > quantité" du prompt existant
  évitent le bruit.

### 2. Fallback Nova (gratuit & illimité) quand ElevenLabs est à sec
- Rien à installer, rien à configurer : `NovaMicButton` (micro vert) était
  déjà rendu à côté du bouton ElevenLabs.
- Nouveau : une bannière verte apparaît sous la barre de saisie dès que le
  quota ElevenLabs mensuel est épuisé (tous les agents `exhausted`), pour
  expliquer clairement à l'utilisateur qu'il continue en mode Nova.
- Nova utilise le pipeline STT Groq → LLM multi-provider (Cerebras / Groq /
  Mistral / OpenRouter, cf. `src/lib/aiRouter.js`) → TTS Groq Orpheus. Aucun
  quota bloquant côté ElevenLabs, et les fiches sont créées de la même
  façon (transcript Nova déjà routé vers `agentTranscript`).

### Fichiers touchés (v2)
- `src/useAgentCardDetector.js` (patch)
- `src/EnglishPractice.jsx` (patch)
