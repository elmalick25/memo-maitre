# Déploiement du Cloudflare Worker MémoMaître (100% Gratuit)

Ce Worker fournit une passerelle haute vitesse sur le réseau mondial de Cloudflare (100 000 requêtes gratuites par jour) pour :
1. Récupérer les flux RSS et extraire les articles complets sans blocage CORS (`?url=...`).
2. Pré-calculer les actualités prêtes à l'emploi en < 1s (`GET /news-ready.json` & Cron Trigger toutes les 15 min).
3. Relayer de façon sécurisée les requêtes vers les LLM sans exposer aucune clé d'API dans le navigateur (`POST /ai/...`).
4. Relayer la transcription vocale Groq Whisper (`POST /ai/transcribe`).
5. Délivrer et signer les jetons LiveKit Cloud de manière sécurisée (`POST /livekit/token`).
6. Récupérer les sous-titres YouTube horodatés pour la vue RealLife / English in the Wild (`GET /yt/transcript?v=ID`).

---

### Déploiement via le terminal (Wrangler)

Depuis le dossier du projet :
```bash
npx wrangler deploy src/cloudflare-worker/proxy-worker.js --name memomaster-proxy
```

> ⚠️ **Après chaque modification de `proxy-worker.js`, il faut redéployer** : le site utilise la
> version en ligne du Worker, pas le fichier local. Pour le Worker actuel
> (`memomasterproxy.elmalick25formcybersecu.workers.dev`) :
> ```bash
> npx wrangler deploy src/cloudflare-worker/proxy-worker.js --name memomasterproxy
> ```
> Vérification : ouvrir `https://memomasterproxy.elmalick25formcybersecu.workers.dev/yt/transcript?v=tichqoNg4p4`
> doit afficher un JSON contenant `"segments":[...]` (et non « Missing url query parameter »).

---

### Configuration des secrets du Worker

Pour activer le relais IA et LiveKit sécurisé côté Worker :
```bash
# Relais IA Chat / Completions (clés séparées par des virgules si rotation)
npx wrangler secret put GROQ_KEYS
npx wrangler secret put CEREBRAS_KEYS
npx wrangler secret put MISTRAL_KEYS
npx wrangler secret put OPENROUTER_KEYS
npx wrangler secret put FIREWORKS_KEYS
npx wrangler secret put COHERE_KEYS
npx wrangler secret put SAMBANOVA_KEYS
npx wrangler secret put AIMLAPI_KEYS
npx wrangler secret put DEEPSEEK_KEYS

# Relais Gemini & Whisper
npx wrangler secret put GEMINI_KEYS

# Délivrance sécurisée LiveKit
npx wrangler secret put LIVEKIT_API_KEY
npx wrangler secret put LIVEKIT_API_SECRET

# Domaines autorisés (séparés par des virgules)
npx wrangler secret put ALLOWED_ORIGINS
# Exemple : https://memo-maitre.web.app,https://memo-maitre.firebaseapp.com,http://localhost:5173
```

---

### Activation dans MémoMaître

Dans votre fichier `.env` ou `.env.local` à la racine :
```env
# Proxy CORS pour les flux RSS & articles
VITE_PROXY_URL=https://memomaster-proxy.votre-pseudo.workers.dev

# Relais IA & Token Guard
VITE_AI_PROXY_URL=https://memomaster-proxy.votre-pseudo.workers.dev
```

Dès que ces variables sont configurées, MémoMaître les utilise automatiquement en priorité absolue, avec repli transparent sur les clés locales en cas d'indisponibilité.

## 📰 Extraction d'articles : `GET /article?url=...`
Répare le lien (Google News, suivi), récupère la page comme un navigateur, essaie JSON-LD / densité / type Readability, puis AMP, Jina Reader et archive.org. Cache 24 h.
Optionnel : `npx wrangler secret put JINA_API_KEY --name memomasterproxy` (clé gratuite sur jina.ai) pour plus de quota.
