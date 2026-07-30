// src/lib/atomicCardRules.js
// Règles partagées à injecter dans TOUS les prompts qui créent ou optimisent
// des flashcards. Objectif : maximiser la rétention (viser ~100% via FSRS)
// en imposant une atomicité stricte et une charge cognitive minimale.
//
// Basé sur les principes de SuperMemo (Wozniak, "20 rules of formulating
// knowledge") et de la littérature FSRS : plus la fiche est atomique et
// dépourvue d'ambiguïté, plus la stabilité mémorielle progresse vite et
// plus l'intervalle sûr s'allonge → moins d'oublis, plus de rétention.
export const ATOMIC_CARD_RULES = `
RÈGLES D'ATOMICITÉ (obligatoires — maximiser la rétention FSRS) :
1. UN seul concept par fiche. Si la source contient N idées, produis N fiches.
2. Recto court (≤ 12 mots idéalement, jamais > 20). Une question ou un stimulus
   sans ambiguïté, avec assez de contexte pour être répondu isolément.
3. Verso ultra-concis (≤ 25 mots). Une seule réponse attendue. Pas de listes
   à puces multi-items, pas d'énumérations : découpe en plusieurs fiches.
4. Pas de double négation, pas d'acronymes non explicités, pas d'ambiguïté
   entre deux réponses plausibles.
5. Le champ "example" contient un exemple CONCRET (une phrase, un cas), pas
   une reformulation du verso.
6. Si un concept nécessite plus, applique le principe "cloze/decomposition" :
   émets plusieurs fiches liées (définition, propriété, contre-exemple).
7. Interdit : "Explique X", "Décris Y en détail", "Quels sont les 5..." → à
   scinder en fiches atomiques.

Sortie : uniquement du JSON, aucune balise markdown, aucun texte hors JSON.
`.trim();
