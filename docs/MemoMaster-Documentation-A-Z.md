# MemoMaster — Documentation complète (de A à Z)

> Application : **MemoMaster – El Malick**
> Type : PWA React (Vite) de mémorisation active + coaching anglais assisté par IA
> Base de code documentée : archive `src-sync-fix.zip` (130 fichiers, ~44 000 lignes de JS/JSX)
> Dernière mise à jour : correctif de synchronisation multi-appareils (198 vs 204 fiches)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique](#2-architecture-technique)
3. [Démarrage de l'application (boot sequence)](#3-démarrage-de-lapplication-boot-sequence)
4. [Authentification et contrôle d'accès](#4-authentification-et-contrôle-daccès)
5. [Modèle de données](#5-modèle-de-données)
6. [Persistance locale (WatermelonDB / IndexedDB)](#6-persistance-locale-watermelondb--indexeddb)
7. [Synchronisation Firestore](#7-synchronisation-firestore)
8. [Moteur de révision FSRS](#8-moteur-de-révision-fsrs)
9. [Pipeline « production active » (mastery stages)](#9-pipeline-production-active-mastery-stages)
10. [Couche IA (AI Router, Gemini, TTS, voix)](#10-couche-ia-ai-router-gemini-tts-voix)
11. [Cartographie des écrans](#11-cartographie-des-écrans)
12. [Modules fonctionnels détaillés](#12-modules-fonctionnels-détaillés)
13. [Gamification](#13-gamification)
14. [Design system et UI mobile](#14-design-system-et-ui-mobile)
15. [Hardening, sécurité, observabilité](#15-hardening-sécurité-observabilité)
16. [PWA, offline et mises à jour](#16-pwa-offline-et-mises-à-jour)
17. [Variables d'environnement](#17-variables-denvironnement)
18. [Tests](#18-tests)
19. [Arborescence complète des fichiers](#19-arborescence-complète-des-fichiers)
20. [Exploitation : dépannage et FAQ](#20-exploitation--dépannage-et-faq)
21. [Glossaire](#21-glossaire)

---

## 1. Vue d'ensemble

MemoMaster est une application web personnelle (mono-utilisateur + bêta-testeurs invités) qui combine :

| Pilier | Ce que ça fait |
| --- | --- |
| **Fiches / flashcards** | Création, édition, catégorisation, révision espacée de fiches (« expressions ») |
| **FSRS** | Algorithme de répétition espacée moderne (Free Spaced Repetition Scheduler) pour planifier chaque révision |
| **Production active** | Une fiche n'est « maîtrisée » que si elle a été *utilisée* (voix, chat, dictée, écriture), pas seulement reconnue |
| **Coach anglais IA** | Conversation vocale temps réel (LiveKit + Gemini), débats, entretiens simulés, entraînement d'accent, shadowing |
| **Lab IA** | Transformation de PDF, audio, photos et articles en fiches automatiquement |
| **Veille tech** | Agrégation d'actualités tech/IA, radar open-source, oracle de tendances, recruteur fantôme |
| **Gamification** | XP, niveaux, streaks, 1000+ badges, archétypes, quêtes quotidiennes |
| **Multi-appareils** | Fonctionne hors ligne, se synchronise avec Firestore par utilisateur (`users/{uid}`) |

> [!IMPORTANT]
> **Prouesses d'Ingénierie & Métriques Clés :**
> - **44 000+ Lignes de Code (130+ fichiers)** : Progressive Web App React 18 / Vite 100% *Offline-First*.
> - **Moteur FSRS v4 + Production Active** : Rétention cible `R=0.9` combinée à une validation de maîtrise exigeant 2 réutilisations réelles (voix/écrit) dans 2 contextes distincts espacés de 48h.
> - **Routeur IA Multi-Providers (`aiRouter.js`)** : Routage par tâche avec pools de clés API & fallbacks en cascade (Cerebras, Groq, Mistral, OpenRouter, DeepSeek, Gemini).
> - **Assistant Vocal Temps Réel WebRTC** : Intégration LiveKit + Gemini VAD + déblocage audio synchrone iOS (`armIosAudio`).
> - **Persistance & Sync Incrémentale** : WatermelonDB (LokiJS IndexedDB) + Synchronisation Firestore autoritaire bidirectionnelle avec circuit-breaker.
> - **Assurance Qualité** : 75 suites de tests unitaires natifs (`npm test`).

Public visé : un utilisateur unique propriétaire (`VITE_OWNER_UID`) plus une liste blanche d'e-mails bêta, chacun disposant de ses propres données isolées.

---

## 2. Architecture technique

### 2.1 Pile

| Couche | Technologie |
| --- | --- |
| UI | React 18 (`main.jsx` → `App.jsx` → `MemoMaster.jsx`), JSX + styles inline + CSS design-system |
| Build | Vite (variables `import.meta.env.VITE_*`) |
| Base locale | WatermelonDB avec adaptateur **LokiJS** (IndexedDB incrémental) |
| Backend | Firebase : Auth (Google) + Firestore (aucun serveur applicatif propre) |
| Temps réel voix | LiveKit (WebRTC) + agent Gemini |
| IA texte | Routeur multi-providers : Cerebras, Groq, Mistral, OpenRouter, Fireworks, Cohere, SambaNova, DeepSeek, Gemini |
| PWA | Service worker + `manifest.webmanifest` + prompt de mise à jour |

### 2.2 Découpage en couches

```
main.jsx                     bootstrap : CSS, hardening, filets d'erreur globaux, clavier virtuel
 └── App.jsx                 auth Google, garde d'accès, DatabaseProvider, migrations, sync
      └── MemoMaster.jsx     shell applicatif : navigation, état global, la majorité des vues
           ├── EnglishPractice.jsx     coach anglais (le plus gros module métier)
           ├── EnglishInTheWild.jsx    apprentissage depuis vidéos YouTube
           ├── Lab.jsx                 PDF / audio / photo / résumé → fiches
           ├── MemoMasterUpgrades.jsx  add-ons non destructifs (widgets avancés)
           └── components/*            vues et widgets spécialisés
      lib/*                  moteurs purs : db, fsrs, ia, audio, sécurité, utilitaires
      hooks/*                logique React réutilisable (XP, CEFR, confettis, audio…)
```

**Principe structurant :** `lib/` ne contient que des modules *purs et testables* (aucun accès direct au DOM applicatif) ; les composants persistent eux-mêmes les résultats.

---

## 3. Démarrage de l'application (boot sequence)

`src/main.jsx`, dans l'ordre exact :

1. Import des feuilles de style : `index.css`, `design-system.css`, `responsive.css`, `mobile-ux-fix.css`, `mobile-redesign.css`, `practice-tabs.css`.
2. Titre du document : `MemoMaster - El Malick`.
3. **Filets de sécurité globaux** : `window.error` et `unhandledrejection` sont interceptés, loggés en `console.warn` et neutralisés (`preventDefault`) — l'app ne « plante » jamais en blanc à cause d'une promesse rejetée.
4. **Bootstrap hardening** (chaque appel est enveloppé dans un `try/catch`, no-op si non supporté) :
   - `installTelemetry()` — journal d'événements local
   - `installPerfMonitor()` — mesures de performance
   - `installMemoryGuard()` — surveillance mémoire, protection anti-fuite
   - `installDiagnostics()` — expose `window.__diag()`
   - `installCSPReporter()` — remontée des violations CSP
   - `installAudioUnlock()` — déblocage audio iOS au premier tap
   - `installConsoleScrubber()` — **en production uniquement**, masque les secrets dans la console
5. **Détection du clavier virtuel** via `visualViewport` : ajoute/retire la classe `keyboard-open` sur `<body>` et émet l'événement `astral-keyboard`.
6. Rendu de `<App />` dans `#root` sous `StrictMode`.

Puis `App.jsx` :

1. Écoute `onAuthStateChanged` (Firebase Auth).
2. Vérifie l'autorisation (`isAuthorizedUser`).
3. Monte `DatabaseProvider` (WatermelonDB).
4. Exécute `migrateFromLocalStorage()` et `migrateOrphanSRSData()`.
5. Lance une **réconciliation autoritaire** avec Firestore, puis `listenToSyncSignal()`.
6. Charge `MemoMaster` en `lazy()` sous `<Suspense>` et `<ErrorBoundary>`, avec `OfflineBanner`, `UpdatePrompt` et `BetaChat` en overlay.

---

## 4. Authentification et contrôle d'accès

- **Fournisseur** : Google (Firebase Auth).
- **Choix popup / redirect** (`shouldUseRedirect()`) :
  - iOS (Safari, Chrome, PWA) → **popup** toujours, car `signInWithRedirect` est silencieusement bloqué par l'ITP d'Apple ; le popup ouvre une WebView native fiable.
  - PWA installée sur autre OS (`display-mode: standalone`) → **redirect**.
  - Navigateur classique → popup.
- **Autorisation** (`isAuthorizedUser`) :
  - `user.uid === VITE_OWNER_UID` → propriétaire, toujours autorisé.
  - `user.email` présent dans `VITE_ALLOWED_EMAILS` (liste séparée par virgules) → bêta-testeur autorisé.
  - Sinon → accès refusé.
- **Isolation des données** : chaque compte écrit sous `users/{uid}/expressions`. Aucun bêta-testeur ne voit les fiches d'un autre.
- **BetaChat** : canal privé propriétaire ↔ testeur, stocké dans `chats/{testerUid}` avec compteurs `unreadForOwner` / `unreadForTester`.

---

## 5. Modèle de données

### 5.1 Table `expressions` (schéma WatermelonDB v4)

| Colonne | Type | Rôle |
| --- | --- | --- |
| `front` | string | Recto de la fiche |
| `back` | string | Verso / réponse |
| `example` | string? | Exemple d'usage |
| `category` | string? | Catégorie (ex. « Anglais », « Dev »…) |
| `type` | string? | Type de fiche (`qa`, etc.) |
| `paused` | boolean? | Fiche mise en pause (exclue des révisions) |
| `image_url` | string? | Illustration |
| `audio_url` / `audio_id` | string? | Audio attaché (blob en IndexedDB via `audioStore`) |
| `layers` | string? (JSON) | Couches de contenu enrichi |
| `level` | number? | Niveau de progression |
| `next_review` | string? | Date de prochaine révision (`YYYY-MM-DD`) |
| `created_at` / `updated_at` | number | Timestamps **numériques en ms** (clé de la sync) |
| `ease_factor`, `interval`, `repetitions` | number? | État SRS |
| `review_history` | string? (JSON) | Historique des révisions |
| `mastery_stage` | string? | Étape du pipeline de production active |
| `productive_uses` | string? (JSON) | Usages productifs enregistrés |
| `last_productive_use_at` | number? | Dernier usage productif |

### 5.2 Migrations

`lib/db/migrations.js` — **strictement additives**, aucune donnée détruite :

- v1 → v2 : colonnes de production active (`mastery_stage`, `productive_uses`, `last_productive_use_at`)
- versions suivantes : ajouts optionnels (dont `paused`, corrigeant un bug où une fiche mise en pause redevenait active au reload)

`lib/db/migration.js` gère en plus la **reprise de l'ancien stockage** : `migrateFromLocalStorage()` (données historiques) et `migrateOrphanSRSData()` (état SRS orphelin).

### 5.3 Stockages annexes

| Stockage | Contenu |
| --- | --- |
| `localStorage` (via `safeStorage`) | préférences, streaks, stats, quêtes, journaux de session, flags |
| IndexedDB (`audioStore`) | blobs audio des fiches et enregistrements |
| IndexedDB (`offlineArticles`) | articles de veille mis en cache pour lecture hors ligne |
| `agentSessionMemory` | transcripts des sessions vocales, pour la continuité entre sessions |

---

## 6. Persistance locale (WatermelonDB / IndexedDB)

`lib/db/index.js` :

```js
new LokiJSAdapter({
  schema, migrations,
  useWebWorker: false,             // volontaire : voir note ci-dessous
  useIncrementalIndexedDB: true,
  onIndexedDBVersionChange: () => { /* propose un reload */ }
})
```

- `useIncrementalIndexedDB` évite de réécrire toute la base à chaque commit.
- `useWebWorker` est **désactivé** : le commentaire du code documente que le worker avait été activé pour éviter les gels du thread principal (« 'success' handler took 11632ms »), mais l'état livré tourne sur le thread principal. C'est le point à surveiller si des freezes réapparaissent au chargement de gros volumes.
- `onIndexedDBVersionChange` : si un autre onglet migre la base, l'utilisateur est invité à recharger.
- `lib/db/mirror.js` maintient un miroir mémoire/localStorage pour les lectures synchrones rapides.

---

## 7. Synchronisation Firestore

C'est le cœur du correctif livré. Fichier : `lib/db/sync.js` (+ `lib/firebase.js`).

### 7.1 Modèle

- Chemin distant : `users/{uid}/expressions`
- Moteur : `synchronize()` de WatermelonDB (pull incrémental + push des changements locaux)
- Signal temps réel : `listenToSyncSignal()` (`onSnapshot`) déclenche une sync quand un autre appareil écrit

### 7.2 Garde-fous

| Mécanisme | Valeur | But |
| --- | --- | --- |
| Verrou `isSyncing` + `rerunRequested` | — | jamais deux cycles en parallèle ; une demande arrivée pendant un cycle est rejouée après |
| Throttle de cycle | `SYNC_MIN_GAP_MS = 5 s` | limite les allers-retours |
| Vérification de divergence | `COUNT_CHECK_MIN_GAP_MS = 60 s` | `getCountFromServer()` : 1 lecture Firestore par tranche de 1000 fiches |
| Marqueur | `memo_last_full_sync_ms` (localStorage) | date de la dernière réconciliation complète |
| Circuit breaker | `isCircuitOpen()` / `closeCircuitBreaker()` | coupe Firestore en cas de `resource-exhausted` (quota), réarmable manuellement |

### 7.3 Normalisation temporelle

`toMs(value)` convertit en millisecondes numériques : `number`, `Date`, `Timestamp` Firestore (`toMillis()`), chaîne ISO. Tous les `updatedAt` sont stockés en **nombre** ; `updatedAtServer` conserve le `serverTimestamp` pour l'audit. Sans cela, le filtre incrémental comparait un nombre à un objet Timestamp — cause historique de pulls incomplets.

### 7.4 Règle anti-résurrection

Lors d'une réconciliation, une fiche présente localement mais absente de Firestore est traitée ainsi :

- `_status === 'created'` (jamais synchronisée) → **poussée** vers le serveur ;
- sinon (déjà synchronisée un jour) → **supprimée localement**, car son absence distante signifie une suppression faite sur un autre appareil.

C'est ce qui corrige l'écart 198 (PC) vs 204 (iPhone) : les 6 fiches supprimées ailleurs ressuscitaient sur le téléphone.

### 7.5 Auto-guérison

Toutes les minutes au plus, un comptage distant bon marché est comparé au comptage local. En cas de divergence → réconciliation autoritaire immédiate.

### 7.6 Réparation manuelle

Bouton **« 🩺 Réparer la synchro »** dans le pied de page de `MemoMaster` :
ferme le circuit breaker, ignore tous les throttles et le cache de session, et force un alignement complet sur l'état serveur.

---

## 8. Moteur de révision FSRS

Fichier : `lib/fsrs.js`.

- Implémentation FSRS avec **19 paramètres** de poids, `DECAY = -0.5`, `FACTOR = 19/81`, **rétention cible `TARGET_R = 0.9`**.
- `fsrsR(t, S)` = probabilité de rappel après `t` jours pour une stabilité `S` : `(1 + FACTOR·t/S)^DECAY`.
- Calcule `stability`, `difficulty`, `interval` et `nextReview` à partir de la note donnée à la révision.

### Plafond pré-production (Phase 2)

- Constante `PRE_PRODUCTION_INTERVAL_CAP_DAYS = 3`.
- **Uniquement pour les fiches de catégorie contenant « anglais »**.
- Tant que la fiche n'a pas atteint le stage `produced` ou `mastered`, l'`interval` affiché est plafonné à 3 jours, même si le calcul suggérerait des mois.
- `stability` et `difficulty` restent intactes : seul l'intervalle (donc `nextReview`) est plafonné.
- Objectif : empêcher une expression « connue par cœur mais jamais utilisée » de disparaître des révisions.

Utilitaires associés : `utils/dateUtils.js` (`addDays`, `today`, `diffDays`, `normalizeDate`) et `lib/dateRepair.js` qui assainit les `nextReview` aberrantes (formats mixtes ms/`YYYY-MM-DD`, intervalles > 50 ans).

---

## 9. Pipeline « production active » (mastery stages)

Fichier : `lib/masteryStages.js` — **fonctions pures**, la persistance est à la charge de l'appelant.

```
discovered  → aucune révision (repetitions = 0)
recognized  → repetitions > 0
recalled    → repetitions ≥ 2 ET interval ≥ 5 jours
produced    → ≥ 1 usage productif correct (voice / chat / writing / dictation)
mastered    → ≥ 2 usages productifs corrects, dans ≥ 2 contextes DISTINCTS,
              espacés d'au moins 48 h
```

- `getDistinctProductiveContexts(expression)` dérive les contextes distincts (jamais stocké → point de vérité unique).
- Le hook `hooks/useProductiveUse.js` est le pipeline partagé : il enregistre un usage productif depuis `EnglishPractice` (chat/voix) **et** `EnglishInTheWild` (leçons vidéo), met à jour `productive_uses`, `last_productive_use_at` et recalcule le stage.
- Conséquence produit : le SRS mesure la mémoire, le pipeline mesure l'**usage réel**. Les deux sont indépendants et complémentaires.

---

## 10. Couche IA (AI Router, Gemini, TTS, voix)

### 10.1 AI Router (`lib/aiRouter.js`)

Routage multi-providers par **tâche**, avec pools de clés et fallback en cascade :

| Tâche | Provider principal | Fallbacks |
| --- | --- | --- |
| `chat` / `coach` | Cerebras `gpt-oss-120b` | Groq, OpenRouter |
| `fast-json` | Groq `llama-3.1-8b-instant` | Mistral Small |
| `batch-json` | Cerebras `gpt-oss-120b` | Groq 70b, Mistral |
| `vision` | OpenRouter `llama-4-scout` | (Gemini appelé directement) |
| `creative` | Mistral Large (temp 1.1) | — |
| `semantic-grade` | Mistral Small | Cerebras |
| `lexical` | Cohere `command-r-plus` | — |
| `fast-summary` | Groq 8b | Mistral Small |
| `pedagogy` | Mistral Large | — |
| `strict-json` | Fireworks `llama-v3p3-70b` (json_schema) | — |
| `reasoning` | OpenRouter `deepseek-r1` | SambaNova |
| `code` | OpenRouter `qwen-coder-32b` | Mistral Codestral |

Les tâches héritées `fast` et `json` restent supportées pour les anciens call-sites. Chaque provider dispose d'un **tableau de clés** (rotation en cas de 429/quota).

### 10.2 Gemini (`lib/geminiClient.js`)

Protection anti-429 « god tier » : rotation de clés, limitation `VITE_GEMINI_RPM_LIMIT`, modèle configurable `VITE_GEMINI_MODEL`. Avertissement documenté dans le code : **plusieurs clés du même projet Google partagent le même quota** — la multiplication de clés ne multiplie pas le débit.

### 10.3 Voix et audio

| Module | Rôle |
| --- | --- |
| `components/LiveKitVoiceAssistant.jsx` | session vocale temps réel complète (JWT, dispatch de l'agent, WebRTC) |
| `AgentVoiceBar.jsx` | shim conservant l'API historique ElevenLabs ; `start()`/`stop()` pilotent le montage du LiveKit assistant |
| `MODE_CONFIGS` | personas & modes : `chat` (NOVA, coach chaleureux ; personas MMA « HAMMER », Recruteur « ALEX »), `debate` (ARGOS), mode immersion vs corrections inline |
| `lib/iosVoiceHardening.js` | `armIosAudio()` : arme l'AudioContext dans le geste utilisateur, sinon iOS coupe silencieusement la sortie WebRTC |
| `lib/english/audioUnlock.js` | déblocage audio global au premier tap |
| `lib/groqTTS.js` | synthèse vocale via Groq + AudioContext, timeout + retry, échec silencieux côté UI |
| `lib/HuggingFaceVoice.jsx` | instance unique de voix HF |
| `lib/mediaTranscribe.js` | transcription audio/vidéo |
| `lib/agentClientTools.js` | registre global des « tools » que l'agent vocal peut appeler depuis n'importe quelle vue |
| `lib/agentSessionMemory.js` | journal persistant des conversations pour la continuité inter-sessions |
| `lib/speakUtils.js`, `utils/speechCleanup.js` | nettoyage du texte avant TTS, découpage, ponctuation |

### 10.4 Qualité des fiches générées

`lib/atomicCardRules.js` injecte dans **tous** les prompts de création/optimisation de fiches un jeu de règles d'atomicité inspiré des « 20 rules » de SuperMemo (Wozniak) : une idée par fiche, charge cognitive minimale, formulation active. `lib/retroEngineeringRestructurer.js` applique ces règles en masse à des fiches existantes (barre d'action `BulkRestructureBar`). `lib/jsonRepair.js` répare les JSON malformés renvoyés par les LLM.

---

## 11. Cartographie des écrans

Vue courante pilotée par l'état `view` dans `MemoMaster.jsx` (+ `subView` pour les écrans à onglets).

| `view` | Écran | Contenu |
| --- | --- | --- |
| `dashboard` | Accueil | hero, quêtes du jour, raccourcis (routine, veille, stats, fiches), reprise de session, recommandation |
| `list` | Mes fiches | recherche, filtres (Aujourd'hui / Demain / …), sélection multiple, restructuration en masse, palette de commandes |
| `add` | Ajouter | formulaire fiche (recto/verso/exemple/catégorie/image/audio), mode Zen, 8 sous-vues d'ajout |
| `review` | Révision | session FSRS, minuteur, révélation, notation, résumé de session |
| `study` | Étude | parcours par catégorie, fiches en pause |
| `categories` | Catégories | navigation par thème |
| `practice` | English | `EnglishPractice.jsx` — coach, chat, voix, débat, accent, shadowing |
| `lab` | Lab | `Lab.jsx` — onglets `pdf`, `resume`, `audio`, `photo` |
| `stats` | Stats | `GodTierStats`, `StatsInsights`, heatmap, `KnowledgeGraph` |
| `badges` | Badges | collection, raretés, progression |
| `routine` | Routine | `DailyRoutineTracker` — planning quotidien avec reset automatique |
| `veille` | Veille tech | `TechIntelView` — magazine d'actualités tech/IA |
| `oracle` | Oracle | `TechOracle` — lecture de tendances |
| `phantom` | Recruteur fantôme | `PhantomRecruiter` — simulation d'opportunités/entretiens |
| `opensource` | Radar open source | `OpenSourceRadar` |
| `certifications` | Certifications | `CertificationsDashboard` + `lib/certCatalog.js` |
| `projects` | Projets | sous-vues `hub`, … |
| `exam` | Examen | mode examen chronométré (sous-vue `home`) |

**Navigation mobile** (`MobileSpeedDial`) : bouton flottant radial à 6 entrées — Accueil ⚡, Fiches ◈, Ajouter ＋, English 🗣️, Lab 🧪, Plus ☰. `MobileAddSheet` présente les 8 sous-vues d'ajout en grille 2×4. `MobileHomeV2` propose une home mobile « une page = une action dominante ».

---

## 12. Modules fonctionnels détaillés

### 12.1 `MemoMaster.jsx` (~10 400 lignes)
Shell applicatif : état global (fiches, stats, thème, XP, streak, quêtes), navigation, la majorité des vues, toasts, dédoublonnage à l'insertion (comparaison front/back/catégorie/type/level/nextReview), gardes anti-division par zéro, parsing JSON défensif, initialisation SSR-safe.

### 12.2 `EnglishPractice.jsx` (~6 700 lignes)
Module le plus riche. Autonome : reçoit seulement `callClaude`, `getNextGroqKey`, `storage`, `expressions`, `setExpressions`, `setStats`, `showToast`, `theme`, `isDarkMode`. Contient chat écrit, session vocale, entraînement de phonèmes (`th`, `v/w`, …), corrections inline, détection automatique de fiches à créer pendant la conversation (`useAgentCardDetector.js`), enregistrement des usages productifs.

### 12.3 `EnglishInTheWild.jsx` (~1 860 lignes)
Apprentissage depuis de vraies vidéos YouTube : extraction de sous-titres, sélection de 10 expressions clés, dictée, compréhension, shadowing. Alimente aussi le pipeline de production active.

### 12.4 `Lab.jsx` (~2 900 lignes)
Laboratoire IA, 4 onglets : **PDF → fiches**, **Résumé complet**, **Audio → fiche** (transcription), **Photo → fiche** (vision). Communique avec le parent par le callback `onAddCards`.

### 12.5 `MemoMasterUpgrades.jsx` (~1 400 lignes)
Pack d'add-ons 100 % additif : composants et fonctions autonomes recevant leurs dépendances en props, importables sans modification destructive du shell.

### 12.6 `components/TechIntelView.jsx` (~2 000 lignes)
Agrégateur d'actualités tech, design magazine premium (hero card, glassmorphism), extraction d'articles via `lib/articleExtractor.js` (Readability allégé + chaîne de proxies CORS résilients avec détection des erreurs Jina 401 / AllOrigins vide / HTML d'erreur), cache hors ligne via `lib/offlineArticles.js`, création de fiches depuis un article.

### 12.7 `components/CertificationsDashboard.jsx` (~1 350 lignes)
Recherche de certifications réelles avec `lib/certCatalog.js` : catalogue local massif d'URLs officielles vérifiées, matching bilingue FR/EN (synonymes + fuzzy), et **minimum garanti** de résultats — la recherche n'est jamais vide.

### 12.8 Autres composants notables

| Composant | Rôle |
| --- | --- |
| `BattleMode` | duels de révision chronométrés |
| `SpeakItChallenge` | défi quotidien de 90 s : 3 expressions récentes à réutiliser à l'oral |
| `AccentTraining` | travail de prononciation |
| `CoachNewsAnchor` / `CoachSpeedListening` | présentateur JT et écoute accélérée |
| `CEFRTracker` + `hooks/useCEFR` | estimation du niveau CECRL (A1→C2 converti en 1→6) |
| `KnowledgeGraph` | constellation SVG des catégories en orbites animées |
| `GodTierStats` / `StatsInsights` | statistiques + 4-6 insights narratifs générés **localement**, sans appel LLM |
| `HoloCard` | carte bento 3D glassmorphism avec parallaxe souris |
| `RichText` / `GodTierContent` | rendu Markdown avancé : vrais `<table>` stylisés (header sticky, lignes alternées, scroll horizontal), code coloré et auto-indenté (JS, Java, Lisp, Scheme, Clojure) |
| `SoundwavePlayer` / `AudioPlayButton` | lecture audio des fiches |
| `RoutineTimerOverlay` | minuteur d'étape de routine |
| `ErrorBoundary` | isole les plantages d'un widget, compteur de re-essais anti-boucle, `CustomEvent("app:error")`, reset via `resetKeys` |
| `OfflineBanner` / `UpdatePrompt` | état réseau et nouvelle version disponible |
| `AgentCardToast` / `ProductionChallenge` | **neutralisés** (rendent `null`), conservés pour ne pas casser les imports |

### 12.9 Hooks

`useXP` (XP/niveaux), `useCEFR`, `useProductiveUse`, `useConfetti`, `useAudioFeedback`, `useHighlight` (coloration syntaxique), `useMermaid` (diagrammes), `use-mobile`.

---

## 13. Gamification

`src/constants/gamification.js` (extrait de `MemoMaster.jsx` pour la lisibilité) :

- **Badges** : catalogue de base + **1000 badges générés** à partir de paliers — nombre de fiches, streak, révisions, fiches `mastered`, fiches générées par IA, sessions matinales/nocturnes, PDF analysés. Chaque badge expose une fonction `check` et une `progress`, avec une **rareté cohérente avec sa difficulté**.
- **Niveaux d'XP** : paliers avec titres.
- **Archétypes** : profil d'apprenant dérivé du comportement.
- `lib/XPSystem.js` + `hooks/useXP.js` : attribution d'XP par action.
- Quêtes quotidiennes, streak journalier (mis à jour en fin de session de révision), confettis à chaque déblocage, écran `badges` signalant les nouveaux badges depuis la dernière visite.

---

## 14. Design system et UI mobile

| Fichier | Rôle |
| --- | --- |
| `styles/design-system.css` | tokens : couleurs, rayons, ombres, glassmorphism |
| `styles/responsive.css` | points de rupture généraux |
| `styles/mobile-ux-fix.css` | correctifs tactiles (zones de touche, safe-areas iOS) |
| `styles/mobile-redesign.css` | refonte mobile (speed dial, bottom sheets, home V2) |
| `styles/practice-tabs.css` | onglets du module English |
| `index.css` / `App.css` | base globale |

- Thème clair/sombre via l'objet `theme` propagé en props (`theme.text`, `theme.cardBg`, `theme.border`, `theme.highlight`) et le booléen `isDarkMode`.
- Beaucoup de styles sont **inline** dans les composants (choix historique assumé) ; le CSS gère la structure, l'animation et le responsive.
- `lib/colorUtils.js` : conversions et manipulations hex/rgb pour les dégradés dynamiques.
- Classe `keyboard-open` sur `<body>` pour adapter la mise en page à l'apparition du clavier virtuel.

---

## 15. Hardening, sécurité, observabilité

| Module | Fonction |
| --- | --- |
| `lib/telemetry.js` | `logEvent()` + journal d'événements local (utilisé par la sync) |
| `lib/perfMonitor.js` | mesure des temps longs, détection des tâches bloquantes |
| `lib/memoryGuard.js` | surveillance de la consommation mémoire |
| `lib/memoryBoost.js` | optimisations de rétention en mémoire |
| `lib/diagnostics.js` | `window.__diag()` → dump complet de l'état pour debug rapide |
| `lib/csp.js` | helpers Content-Security-Policy (policy stricte à poser en `<meta http-equiv>` faute d'accès aux headers) |
| `lib/htmlSanitizer.js` | sanitisation HTML par **allow-list** (anti-XSS) avant tout `dangerouslySetInnerHTML` |
| `lib/secretsScrubber.js` | `installConsoleScrubber()` — masque les clés API dans la console en production |
| `lib/safeStorage.js` | accès `localStorage` tolérant aux quotas et au mode privé |
| `lib/networkStatus.js` | état en ligne/hors ligne |
| `lib/featureFlags.js` | activation à chaud ; priorité **URL `?ff_xxx=1` > localStorage > défaut** |
| `lib/jsonRepair.js` | réparation des JSON LLM malformés |
| `lib/dateRepair.js` | assainissement des dates SRS aberrantes |
| `components/ErrorBoundary.jsx` | confinement des plantages UI |

**Points d'attention sécurité assumés par l'architecture actuelle :** toutes les clés IA sont des variables `VITE_*`, donc **exposées dans le bundle client**. L'app est privée (liste blanche d'e-mails) et repose sur des quotas + rotation de clés + circuit breaker. Pour une ouverture publique, il faudrait déplacer les appels IA derrière un proxy serveur.

---

## 16. PWA, offline et mises à jour

- `public/manifest.webmanifest` + icônes (`icon-192`, `icon-512`, `apple-touch-icon`, favicons 16/32).
- Fonctionnement hors ligne : WatermelonDB local + `offlineArticles` + `audioStore`. La sync reprend automatiquement au retour du réseau.
- `OfflineBanner` : toast éphémère à la perte **et** au retour de connexion.
- `UpdatePrompt` : écoute l'événement dispatché par `main.jsx` en mode `prompt` quand un nouveau service worker est disponible, et propose le rechargement.
- Installation en raccourci écran d'accueil iOS supportée (avec les contournements auth/audio décrits plus haut).

---

## 17. Variables d'environnement

Toutes préfixées `VITE_` (injectées au build par Vite).

**Accès & Firebase**
`VITE_OWNER_UID`, `VITE_ALLOWED_EMAILS`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`

**LLM texte**
`VITE_CEREBRAS_API_KEY` + `_1`…`_7` · `VITE_GROQ_API_KEY`, `_2`, `_5`, `_6`, `_7` · `VITE_MISTRAL_API_KEY_1`…`_7` · `VITE_OPENROUTER_API_KEY`, `_2`, `_3` · `VITE_FIREWORKS_API_KEY` · `VITE_COHERE_API_KEY` · `VITE_SAMBANOVA_API_KEY` · `VITE_DEEPSEEK_API_KEY` · `VITE_AIML_API_KEY`

**Gemini**
`VITE_GEMINI_API_KEY_1`, `_8`, `_9`, `_10`, `VITE_GEMINI_API_KEY_N`, `VITE_GEMINI_MODEL`, `VITE_GEMINI_RPM_LIMIT`, `VITE_GEMINI_API_KEY_LIVEKIT_1..3`

**Voix / temps réel**
`VITE_LIVEKIT_URL`, `VITE_LIVEKIT_API_KEY`, `VITE_LIVEKIT_API_SECRET`, `VITE_LIVEKIT_TOKEN_ENDPOINT`, `VITE_LIVEKIT_AGENT_NAME`, `VITE_LIVEKIT_GEMINI_MODEL`, `VITE_HF_TOKEN`

**Contenus externes**
`VITE_YOUTUBE_API_KEY`, `VITE_TRANSCRIPT_WORKER_URL`, `VITE_UNSPLASH_API_KEY`, `VITE_GITHUB_TOKEN`

---

## 18. Tests

Tests Node natifs (`.test.mjs`) dans `src/tests/` :

| Fichier | Couvre |
| --- | --- |
| `fsrs.test.mjs` | planification FSRS et plafond pré-production |
| `masteryStages.test.mjs` | pipeline discovered → mastered |
| `reviewStats.test.mjs` | agrégats de révision |
| `jsonRepair.test.mjs` | réparation JSON LLM |
| `speakUtils.test.mjs` | préparation du texte pour TTS |
| `richTextFormatting.test.mjs` | rendu Markdown / tableaux / code |
| `englishBugs.test.mjs`, `englishCardGenerationStructure.test.mjs` | régressions du module anglais |
| `agentCardDetectorErrorOnly.test.mjs` | détection de fiches pendant la conversation |
| `bulkRetroEngineeringRestructurer.test.mjs` | restructuration en masse |
| `longVideoCardExtraction.test.mjs` | extraction depuis longues vidéos |
| `livekitDebateIntegration.test.mjs` | intégration débat LiveKit |
| `voiceNoClick.test.mjs` | démarrage voix sans clic supplémentaire (iOS) |

Exécution : `node --test src/tests/` (ou le script npm équivalent du projet).

---

## 19. Arborescence complète des fichiers

```
src/
├── main.jsx                     bootstrap
├── App.jsx                      auth + providers + sync
├── MemoMaster.jsx               shell applicatif (10 413 l.)
├── MemoMasterUpgrades.jsx       add-ons (1 400 l.)
├── EnglishPractice.jsx          coach anglais (6 733 l.)
├── EnglishInTheWild.jsx         YouTube → leçons (1 858 l.)
├── Lab.jsx                      PDF/audio/photo → fiches (2 878 l.)
├── AgentVoiceBar.jsx            shim voix
├── AgentCardToast.jsx           neutralisé
├── useAgentCardDetector.js      détection de fiches en conversation
├── index.css · App.css
├── assets/                      hero.png, react.svg, vite.svg
├── public/                      manifest.webmanifest + icônes
├── styles/                      design-system · responsive · mobile-ux-fix
│                                mobile-redesign · practice-tabs
├── constants/gamification.js    badges, XP, archétypes
├── hooks/                       useXP · useCEFR · useProductiveUse · useConfetti
│                                useAudioFeedback · useHighlight · useMermaid
├── utils/                       dateUtils.js · speechCleanup.js
├── components/                  40 composants (voir §12)
├── lib/
│   ├── db/                      index · schema · migrations · migration
│   │                            sync · mirror · models/Expression.ts
│   ├── firebase.js              auth, Firestore, circuit breaker
│   ├── fsrs.js · masteryStages.js · reviewStats.js · dateRepair.js
│   ├── aiRouter.js · geminiClient.js · jsonRepair.js · atomicCardRules.js
│   │                            retroEngineeringRestructurer.js
│   ├── groqTTS.js · HuggingFaceVoice.jsx · mediaTranscribe.js
│   │                            speakUtils.js · audioStore.js
│   │                            iosVoiceHardening.js · english/audioUnlock.js
│   ├── livekitConfig.js · useNovaAgent.js · agentClientTools.js
│   │                            agentSessionMemory.js
│   ├── articleExtractor.js · offlineArticles.js · richContent.js
│   ├── certCatalog.js · memoryLab.js · memoryBoost.js · XPSystem.js
│   ├── telemetry.js · perfMonitor.js · memoryGuard.js · diagnostics.js
│   ├── csp.js · htmlSanitizer.js · secretsScrubber.js · safeStorage.js
│   └── networkStatus.js · featureFlags.js · colorUtils.js
│                            dataHelpers.js · textUtils.js
└── tests/                       13 suites .test.mjs
```

---

## 20. Exploitation : dépannage et FAQ

**Le nombre de fiches diffère entre PC et téléphone**
→ Ouvrir l'app, attendre la vérification de divergence (≤ 60 s). Si l'écart persiste : pied de page → **🩺 Réparer la synchro**. Le serveur fait autorité ; les fiches locales déjà synchronisées et absentes du serveur sont supprimées.

**Rien ne se synchronise du tout**
→ Le circuit breaker est probablement ouvert (quota Firestore `resource-exhausted`). Le bouton de réparation le referme (`closeCircuitBreaker`). Vérifier ensuite les quotas Firestore.

**Connexion Google impossible sur iPhone**
→ Comportement attendu : iOS utilise le popup, jamais le redirect (ITP). Vérifier que le domaine est dans les domaines autorisés Firebase Auth et que l'e-mail est dans `VITE_ALLOWED_EMAILS`.

**Pas de son pendant la session vocale sur iOS**
→ La session doit démarrer dans un geste utilisateur : `armIosAudio()` doit être appelé au tap. Éviter tout `await` avant le démarrage audio.

**Une fiche mise en pause redevient active**
→ Corrigé : la colonne `paused` est désormais persistée en base et synchronisée.

**Une fiche « connue » ne revient plus en révision**
→ Comportement voulu si elle a atteint `produced`/`mastered`. Sinon, pour l'anglais, l'intervalle est plafonné à 3 jours.

**Erreurs 429 sur l'IA**
→ Rotation automatique des clés + fallback provider. Rappel : plusieurs clés Gemini du même projet Google partagent le même quota.

**Debug rapide**
→ Console : `window.__diag()` pour un dump complet de l'état.

**Activer/désactiver une feature**
→ Ajouter `?ff_<nom>=1` à l'URL (priorité maximale) ou poser la valeur dans localStorage.

---

## 21. Glossaire

| Terme | Définition |
| --- | --- |
| **Expression** | Une fiche (flashcard) — nom de la table et du modèle |
| **FSRS** | Free Spaced Repetition Scheduler : algorithme de répétition espacée fondé sur stabilité/difficulté |
| **Stability (S)** | Durée pendant laquelle un souvenir reste rappelable |
| **Retention cible** | 0,9 — probabilité de rappel visée au moment de la révision |
| **Mastery stage** | Étape du pipeline d'usage réel (`discovered` → `mastered`) |
| **Usage productif** | Réemploi correct d'une expression en voix, chat, écriture ou dictée |
| **Réconciliation** | Comparaison complète local ↔ Firestore, le serveur faisant autorité |
| **Circuit breaker** | Coupure automatique des appels Firestore en cas de dépassement de quota |
| **Shim** | Module conservant une ancienne API pour ne pas casser les imports (ex. `AgentVoiceBar`) |
| **Feature flag** | Interrupteur d'activation à chaud d'une fonctionnalité |
