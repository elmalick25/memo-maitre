# Compteur identique sur mobile et PC — ce qui a été corrigé

## Le vrai coupable
Le nombre « 34 fiches à réviser » ne venait **pas** des fiches, mais du **plan
du jour**, stocké uniquement dans le `localStorage` de chaque appareil
(`memomaitre_dailyPlan_v1`). Le téléphone notait ses 3 révisions dans SON plan,
le PC gardait le sien intact → 31 ici, 34 là, et aucun rechargement ne pouvait
le corriger.

## Les 4 correctifs

1. **Plan du jour partagé en temps réel**
   `users/{uid}/day_state/{AAAA-MM-JJ}` : un seul petit document, écouté en
   direct. Réviser 3 fiches sur le téléphone → le PC affiche 31 en ~1 s, sans
   rechargement. Fusion par **union** : aucune révision perdue, même si les
   deux appareils travaillent hors ligne. Arbitrage par `sealedAt` : le plan
   scellé le plus tôt impose son ordre, donc les deux appareils convergent vers
   exactement le même nombre.

2. **Bug `hasPendingWrites`** (perte de données silencieuse)
   Les écoutes rejetaient l'instantané **entier** dès que l'appareil avait une
   écriture en attente — or Firestore y inclut les modifications de l'AUTRE
   appareil. Elles étaient donc ignorées **définitivement** (plus jamais
   représentées dans `docChanges()`). Le filtrage se fait maintenant document
   par document.

3. **Reconnexion automatique du temps réel**
   Une simple coupure réseau tuait l'écoute pour toute la session. Elle se
   relance désormais avec un délai croissant, et au réveil du PC / retour
   d'onglet / retour du réseau.

4. **Disjoncteur quota assoupli**
   24 h → 2 h, et il ne coupe plus les écoutes temps réel (1 document, ou
   seulement les fiches réellement modifiées). Il ne bloque que les
   réconciliations complètes, réellement coûteuses.

## Coût Firestore
- Lecture : 1 document par changement (≈ 40 lectures pour 40 révisions), au
  lieu de plusieurs centaines pour une réconciliation complète.
- Écriture : regroupée sur 800 ms → une salve de révisions = 1 écriture.

## ⚠️ Une action de ta part : les règles Firestore
Ajoute la nouvelle sous-collection dans `firestore.rules`, sinon les écritures
seront refusées :

```
match /users/{uid}/day_state/{dateISO} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```
