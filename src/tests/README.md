# Tests

## FSRS — `fsrs.test.mjs`

Vérifie que l'algorithme FSRS (`src/lib/fsrs.js`) fonctionne correctement.

### Lancer

```bash
node --test src/tests/fsrs.test.mjs
```

Aucune dépendance externe : utilise le test runner natif de Node ≥ 18
(`node:test` + `node:assert/strict`).

### Couverture (9 tests)

1. Fiche neuve, première note "Good" — valeurs initiales cohérentes.
2. Fiche neuve ratée — interval=0, repetitions=0.
3. Hiérarchie Easy > Good > Hard en intervalle.
4. Stability strictement croissante sur 5 "Good" consécutifs.
5. Un fail après progrès réinitialise l'intervalle.
6. Migration des anciennes fiches SM-2 (repetitions>0, pas de stability).
7. Difficulty bornée 1..10 même sous bombardement.
8. fsrsR(t,S) ∈ ]0,1] et décroît avec t.
9. `nextReview` est dans le futur quand interval ≥ 1.

✅ **Statut : 9/9 PASS** (dernière vérification automatisée).
