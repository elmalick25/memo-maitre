# 🎧 Radio Focus — musique de concentration & mode hors-ligne

## Ce qui a été livré

| Étape | Statut | Fichier |
| --- | --- | --- |
| 1. 12 nouvelles pistes libres de droits | ✅ | `public/audio/focus/*.mp3` (déplacés depuis `src/public/`) (≈10,7 Mo) |
| 2. Catalogue déclaratif | ✅ | `src/lib/musicLibrary.js` |
| 3. Cache IndexedDB dédié | ✅ | `src/lib/musicStore.js` |
| 4. Runtime caching Service Worker | ⚠️ à coller dans `vite.config.js` (absent du zip fourni) | voir ci-dessous |
| 5. `RADIO_STATIONS` → `FOCUS_PLAYLIST` | ✅ | `src/MemoMaster.jsx` |
| 6. UI (⬇️/✅, progression, « tout télécharger », badge EN DIRECT) | ✅ | `src/MemoMaster.jsx` |
| 7. Fallback hors-ligne (flux live grisés) | ✅ | via `src/lib/networkStatus.js` |
| 8. Tests | ✅ | `src/tests/focusMusicOffline.test.mjs` (8/8 verts) |
| 9. Avertissement taille / 4G avant téléchargement massif | ✅ | `src/MemoMaster.jsx` |

## Licences

- Les 12 nouvelles pistes sont **des créations originales** (synthèse sonore générée pour
  MémoMaître) : **CC0 / domaine public**, aucun risque de droits d'auteur.
- Les 3 pistes historiques (RDR2 ×2, Train) sont **désactivées par défaut** :
  `INCLUDE_LEGACY_TRACKS = false` dans `src/lib/musicLibrary.js`. Elles restent
  déclarées avec la mention « licence non vérifiée » — à supprimer ou à
  documenter avant toute redistribution.
- Les 4 flux radio en direct sont conservés, marqués `live: true` et
  **explicitement « en ligne uniquement »** dans l'UI.

## Emplacement des fichiers audio

Les MP3 sont dans `public/audio/focus/` (déplacés hors de `src/` pour être servis par Vite). Si votre
`public/` est à la racine du projet, déplacez le dossier :

```bash
mv src/public/audio/focus public/audio/focus
```

Les URL restent `/audio/focus/<id>.mp3`.

## Étape 4 — Runtime caching à ajouter dans `vite.config.js`

Dans les options de `VitePWA({ workbox: { ... } })` :

```js
VitePWA({
  registerType: "autoUpdate",
  workbox: {
    // ⚠️ ne pas précacher les MP3 (limite de taille du precache)
    globIgnores: ["**/audio/focus/*.mp3"],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.startsWith("/audio/focus/"),
        handler: "CacheFirst",
        options: {
          cacheName: "focus-music-v1",
          expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
          rangeRequests: true, // indispensable pour le seek audio
        },
      },
    ],
  },
});
```

Le Service Worker sert de filet de sécurité réseau ; IndexedDB
(`musicStore.js`) reste le mécanisme **explicite et visible** de
« télécharger pour hors-ligne » contrôlé par l'utilisateur.

## Tests

```bash
node --test src/tests/focusMusicOffline.test.mjs
```

Couvre : catalogue ≥ 10 pistes + licences, exclusion des flux live,
téléchargement + lecture hors-ligne, téléchargement interrompu,
`QuotaExceededError`, suppression / taille utilisée, fallback réseau,
`downloadAll`.
