# Déploiement du Cloudflare Worker MémoMaître (100% Gratuit)

Ce Worker fournit une passerelle haute vitesse sur le réseau mondial de Cloudflare (100 000 requêtes gratuites par jour) pour récupérer les flux RSS et extraire les articles complets sans blocage CORS.

---

### Option A : Déploiement en 1 minute via le Dashboard Web (Sans rien installer)

1. Connectez-vous sur [dash.cloudflare.com](https://dash.cloudflare.com/) (compte gratuit).
2. Rendez-vous dans le menu **Workers & Pages** > Cliquez sur **Create application** > **Create Worker**.
3. Donnez un nom au Worker (ex: `memomaster-proxy`) puis cliquez sur **Deploy**.
4. Cliquez ensuite sur **Edit code**.
5. Remplacez tout le contenu de l'éditeur par le code présent dans [`proxy-worker.js`](./proxy-worker.js).
6. Cliquez sur **Deploy**.
7. Notez l'URL publique générée (ex: `https://memomaster-proxy.votre-pseudo.workers.dev`).

---

### Option B : Déploiement via le terminal (Wrangler)

Depuis le dossier du projet :
```bash
npx wrangler deploy src/cloudflare-worker/proxy-worker.js --name memomaster-proxy
```

---

### Activation dans MémoMaître

Dans votre fichier `.env` ou `.env.local` à la racine :
```env
VITE_PROXY_URL=https://memomaster-proxy.votre-pseudo.workers.dev
```
Dès que cette variable est configurée, MémoMaître l'utilise automatiquement en priorité absolue pour tous les flux RSS et extractions d'articles !
