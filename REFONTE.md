# Mémo — version révisée

## Changements
- Modules : création et fusion repliées, suppression des priorités, actions lisibles et compteurs cohérents.
- English et Lab : couleurs centrales, focus clavier, ajustements mobiles ; extraction du Writing Lab et du moteur de résumé.
- PDF : format unique, citations contrôlées dans le texte extrait, aperçu des sources et sauvegarde confirmée.
- Photo et audio : références conservées ; stockage audio local confirmé avant ajout.
- Régressions : 416 tests réussis ; compilation Vite/PWA réussie.

## Vérifications restantes
Les générations réelles, appels voix et synchronisation Firebase n’ont pas été vérifiés avec vos comptes. Les blobs audio restent locaux à l’appareil, conformément à l’architecture initiale. La présence d’une citation ne garantit pas à elle seule la fidélité complète de la réponse générée.
Les fichiers principaux restent volumineux malgré les extractions ; Vite signale des bundles dépassant 500 ko. L’archive n’inclut ni dépendances, ni compilation, ni secrets.

## Démarrage
Conserver votre configuration locale privée, installer les dépendances puis utiliser les scripts existants `npm run dev`, `npm run build` et `node --test src/tests/*.test.mjs`.
