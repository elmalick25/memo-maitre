# 🧠 MémoMaître (MemoMaster)

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![FSRS](https://img.shields.io/badge/Algorithm-FSRS%20v4-10B981)](https://github.com/open-spaced-repetition/fsrs4anki)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?logo=pwa&logoColor=white)](https://developer.mozilla.org/fr/docs/Web/Progressive_web_apps)
[![Tests](https://img.shields.io/badge/Tests-443%20passed-success)](npm%20test)
[![Firebase](https://img.shields.io/badge/Hosting-Firebase-FFCA28?logo=firebase&logoColor=black)](https://memo-maitre.web.app)

**Application Web Progressive (PWA) *offline-first* d'apprentissage accéléré, combinant les sciences cognitives (moteur FSRS), la pratique vocale temps réel avec IA (NOVA / LiveKit), la veille technologique intelligente et la gamification avancée.**

[🌐 Démo en Ligne](https://memo-maitre.web.app) • [📖 Documentation Complète (A à Z)](./docs/MemoMaster-Documentation-A-Z.md) • [🚀 Démarrage Rapide](#-démarrage-rapide)

</div>

---

## 🌟 Points Forts du Projet

MémoMaître est une plateforme complète d'apprentissage personnel et de perfectionnement conçue pour maximiser la rétention mnésique à long terme et l'aisance orale spontanée en anglais :

* **🧠 Répétition Espacée FSRS v4** : Calcul scientifique des intervalles de révision basé sur la stabilité et la difficulté cognitive (`R=0.9`), bien supérieur aux anciens algorithmes SM-2.
* **🗣️ Coach Vocal IA Temps Réel (NOVA)** : Conversation orale fluide et naturelle propulsée par **LiveKit WebRTC + Gemini / Groq**, avec détection d'activité vocale (VAD), déblocage audio transparent sans clic superflu et amorces de conversation variées sur plus de 100 thèmes réels.
* **🎯 Validation par Production Active** : Une expression n'est considérée maîtrisée que lorsqu'elle est réellement réutilisée en contexte (oral, chat, écriture), pas simplement reconnue passivement.
* **🧪 Lab IA Multimodal (Forge de fiches)** : Extraction automatique et restructuration atomique de fiches de révision depuis des PDF, fichiers audio, vidéos ou articles web.
* **📰 Tech Intel & Veille Technologique** : Agrégation de flux d'actualités tech & IA en mode *French-First* sans pollution publicitaire, analyseur de tendances et catalogue de bourses internationales officielles.
* **🎮 Neuro-Gamification** : Système de points XP, niveaux de maîtrise, combos, quêtes journalières, constellations de connaissances et plus de 1 000 badges de progression.
* **⚡ 100% Offline-First & Synchro Cloud** : Base de données locale WatermelonDB (LokiJS IndexedDB) synchronisée de manière bidirectionnelle avec Firebase Firestore dès le retour du réseau.

---

## 🏛️ Architecture Technique

```
memo-app/
├── src/
│   ├── components/            # Vues et composants modulaires de l'interface
│   │   ├── ReviewEngineView.jsx     # Moteur de révision FSRS et popup de fin de session
│   │   ├── LiveKitVoiceAssistant.jsx# Pipeline audio temps réel (WebRTC + LiveKit)
│   │   ├── TechIntelView.jsx        # Flux de veille technologique & IA
│   │   ├── AddCardView.jsx          # Création et édition de fiches mémos
│   │   └── ...
│   ├── lib/                   # Logique métier pure et moteurs algorithmiques
│   │   ├── fsrs.js                  # Implémentation du scheduler FSRS v4
│   │   ├── englishCardEngine.js     # Moteur pédagogique anglais (audio, dialogues A/B)
│   │   ├── aiRouter.js              # Routeur multi-modèles (Groq, Gemini, Claude...)
│   │   ├── iosVoiceHardening.js     # Gestion des flux audio et micro WebRTC
│   │   └── ...
│   ├── hooks/                 # Hooks React spécialisés (révision, audio, XP, navigation)
│   ├── MemoMaster.jsx         # Shell principal de l'application
│   └── main.jsx               # Point d'entrée PWA, bootstrap et sécurité
├── functions/                 # Cloud Functions (tokens sécurisés, endpoints IA)
├── docs/                      # Documentation exhaustive d'architecture
└── tests/                     # 443 tests unitaires et d'intégration
```

### 🛠️ Stack Technologique

| Domaine | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Vite 6, Framer Motion, Vanilla CSS (Maître-Design System) |
| **Persistance Locale** | WatermelonDB, LokiJS, IndexedDB (*Offline-First*) |
| **Backend & Cloud** | Firebase Hosting, Cloud Firestore, Cloud Functions |
| **Voix & Temps Réel** | LiveKit WebRTC, VAD, Web Audio API, Groq Whisper / TTS |
| **Modèles d'IA** | Routeur hybride : Google Gemini, Groq (Llama 3.3), Anthropic Claude |
| **Algorithme SRS** | FSRS v4 (*Free Spaced Repetition Scheduler*) |
| **Qualité & Tests** | Node Test Runner natif (`node:test`), 443 tests unitaires |

---

## 🚀 Démarrage Rapide

### Prérequis
* **Node.js** : v18+ (v20 recommandé)
* **npm** : v9+

### Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/elmalick25/memo-maitre.git
cd memo-maitre

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env.local
```

### Configuration des Clés API (`.env.local`)

Renseignez vos clés dans `.env.local` pour activer les services d'IA et de voix :

```env
# Firebase
VITE_FIREBASE_API_KEY=votre_cle_firebase
VITE_FIREBASE_AUTH_DOMAIN=votre_projet.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=votre_projet_id

# IA & Voix (optionnel selon les modules utilisés)
VITE_GROQ_API_KEY=gsk_...
VITE_GEMINI_API_KEY=AIza...
VITE_LIVEKIT_URL=wss://...
```

### Lancement

```bash
# Lancer le serveur de développement local
npm run dev

# Exécuter l'ensemble des 443 tests unitaires
npm test

# Compiler le bundle de production optimisé (PWA)
npm run build
```

---

## 🔬 Fonctionnalités Clés en Détail

### 1. 🧠 Moteur de Révision FSRS & Bilan Flottant
* **Planification FSRS v4** : Évaluation selon 4 grades cognitifs (`Oublié`, `Hésité`, `Bien`, `Facile`).
* **Bilan de fin de session personnalisable** : Popup modal épuré en verre liquide (*Liquid Glass*) permettant de visualiser les gains d'XP et le temps moyen, puis de choisir le module concerné et le nombre exact de fiches supplémentaires à ajouter (+5, +10, +15, +20, +25).
* **Audio intégré par réplique** : Bouton d'écoute audio instantané sur chaque réplique de dialogue (A et B) et chaque phrase d'exemple anglaise.

### 2. 🗣️ Coach Anglais NOVA & Conversation 100% Spontanée
* **Fluidité d'échange instantanée** : Connexion vocale WebRTC avec démarrage audio immédiat sans invite bloquante.
* **Variété conversationnelle** : Suppression des répétitions ; rotation automatique entre questions du quotidien, dilemmes impromptus et 100 sujets concrets de la vie réelle.
* **Capture automatique de fiches** : Sauvegarde en 1 clic de toutes les tournures idiomatiques et expressions natives employées par le coach dans la discussion.

### 3. 🧪 Lab IA & Veille Technologique
* **Forge automatique** : Transforme un cours, un document PDF ou une vidéo en cartes mémo atomiques optimisées.
* **Flux Tech Intel** : Nettoyage en amont des bandeaux de consentement et publicités pour une lecture fluide et des synthèses en français.

---

## 📖 Documentation Détaillée

Pour une analyse approfondie des choix d'ingénierie, du schéma de base de données, du modèle de synchronisation ou des mécanismes de résilience :

👉 Consultez la **[Documentation Complète de A à Z](./docs/MemoMaster-Documentation-A-Z.md)**.

---

## 📄 Licence

Ce projet est sous licence **MIT**.
