# Fix LiveKit agent dispatch — 2026-07-06

## Le problème

Ton worker Python (`entrypoint.py`) est décoré avec :

```python
@server.rtc_session(agent_name="assistant-53a")
```

Dès qu'un worker LiveKit est enregistré avec un `agent_name`, LiveKit passe en
**mode dispatch EXPLICITE** : l'agent ne rejoint plus les rooms tout seul, il
faut le demander dans le token JWT via `roomConfig.agents`.

Ton `src/components/LiveKitVoiceAssistant.jsx` signait un JWT sans ce champ →
la room se créait, tu la rejoignais bien... mais **personne ne parlait** parce
que l'agent n'était jamais dispatché. C'est exactement ce que tu vois sur ta
capture "Preview your agent — Start a live test call".

## Ce qui a été corrigé

### 1. `src/components/LiveKitVoiceAssistant.jsx`
- Ajout du champ `roomConfig.agents = [{ agent_name: "assistant-53a" }]` dans
  le JWT signé côté navigateur → l'agent est maintenant dispatché à la
  connexion.
- Room name unique par session (`nova-<random>`) pour éviter les collisions.
- Ajout de `audio={true} video={false} onDisconnected={onClose}` sur
  `<LiveKitRoom>`.

### 2. `src/AgentVoiceBar.jsx`
- Le stub ElevenLabs était un vrai no-op : `agent.start()` ne faisait rien,
  donc `agent.isConnected` restait à `false`, donc `<LiveKitVoiceAssistant>`
  n'était jamais monté dans `EnglishPractice.jsx`.
- Nouveau shim : `agent.start()` passe `isConnected` à `true` (ce qui monte
  l'overlay `<LiveKitVoiceAssistant>` — qui à son tour se connecte à LiveKit
  et déclenche le dispatch de `assistant-53a`).
- Le composant `AgentVoiceBar` par défaut est maintenant un vrai bouton
  micro (🎙️ / ⏹) qui appelle `onStart` puis `agent.start()`.

## À vérifier côté LiveKit / .env

Ton `.env` doit contenir (comme sur ta capture) :

```
VITE_LIVEKIT_API_KEY=API...
VITE_LIVEKIT_API_SECRET=...
VITE_LIVEKIT_URL=wss://<ton-projet>.livekit.cloud
```

⚠️ Signer le JWT dans le navigateur expose `VITE_LIVEKIT_API_SECRET` à
n'importe qui ouvre le devtools. C'est OK en dev / démo perso, mais pour la
prod il faut absolument déplacer la signature côté serveur (Firebase Function,
Cloudflare Worker, etc.). L'endpoint est déjà prévu dans
`src/lib/livekitConfig.js` (`VITE_LIVEKIT_TOKEN_ENDPOINT`).

## Ce qui n'a pas été touché

- `useNovaAgent`, Groq TTS, `HuggingFaceVoice`, `geminiClient` — tous les
  fallbacks vocaux non-LiveKit restent inchangés.
- Les clés `VITE_ELEVENLABS_*` restent dans le `.env` (ignorées).
- `AgentVoiceBar.elevenlabs.bak.jsx` conservé comme archive.
- `EnglishPractice.jsx` : aucun changement — le contrat d'API (`agent`,
  `MODE_CONFIGS`, `customAgent.isConnected`, `<LiveKitVoiceAssistant />`)
  est identique.
