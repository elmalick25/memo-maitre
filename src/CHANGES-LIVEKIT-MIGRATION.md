# Migration ElevenLabs → LiveKit + Gemini

## Ce qui a changé

- **`src/AgentVoiceBar.jsx`** — remplacé par un STUB compatible.
  - Ne charge plus `@elevenlabs/react`.
  - Ne fait plus aucun appel à `api.elevenlabs.io`.
  - Conserve la surface d'API (`AGENT_VOICES`, `MODE_CONFIGS`,
    `useElevenLabsAgent`, `AgentSelector`, composant par défaut) pour que
    `EnglishPractice.jsx` continue de compiler sans refonte.
  - L'original est archivé dans `AgentVoiceBar.elevenlabs.bak.jsx`.
- **`src/lib/livekitConfig.js`** — nouveau, centralise la config LiveKit et
  la **réservation des 3 clés Gemini** dédiées à l'agent vocal.
- **`src/components/LiveKitAgentBar.jsx`** — placeholder du futur composant
  d'agent vocal LiveKit + Gemini.
- **`.env.livekit.example`** — variables à ajouter au `.env` existant.

## Ce qui N'A PAS changé (volontairement)

- Les clés `VITE_ELEVENLABS_API_KEY_*` et `VITE_ELEVENLABS_AGENT_ID_*`
  restent dans ton `.env`. Elles ne sont simplement plus lues.
- `EnglishPractice.jsx` importe toujours `ConversationProvider` depuis
  `@elevenlabs/react` — c'est un simple provider React inoffensif tant que
  `.startSession()` n'est jamais appelé (ce que le stub garantit).
- `useNovaAgent`, `HuggingFaceVoice`, Groq TTS, etc. sont conservés
  (TTS de fallback, non impactés par la migration LiveKit).

## Clés Gemini réservées à LiveKit

3 slots réservés (voir `src/lib/livekitConfig.js`) :

| Slot LiveKit                       | Fallback existant             |
| ---------------------------------- | ----------------------------- |
| `VITE_GEMINI_API_KEY_LIVEKIT_1`    | `VITE_GEMINI_API_KEY_8`       |
| `VITE_GEMINI_API_KEY_LIVEKIT_2`    | `VITE_GEMINI_API_KEY_9`       |
| `VITE_GEMINI_API_KEY_LIVEKIT_3`    | `VITE_GEMINI_API_KEY_10`      |

⚠️ Pense à faire ignorer ces 3 slots par `geminiClient.js` (constante
`RESERVED_GEMINI_KEY_INDEXES` déjà exportée depuis `livekitConfig.js`).

## Prochaines étapes

1. `bun add @livekit/components-react livekit-client`
2. Backend Firebase Function `/api/livekit/token` (signe le JWT avec
   `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`).
3. Déployer un worker "voice agent" Node/Python qui rejoint la room
   LiveKit et pilote Gemini avec `nextLiveKitGeminiKey()`.
4. Remplacer les `<AgentVoiceBar />` dans `EnglishPractice.jsx` par
   `<LiveKitAgentBar />` une fois l'agent worker en production.
