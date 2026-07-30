// src/lib/memoryBoost.js
//
// Prompts IA pour "sauver" une fiche difficile (leech rescue). L'objectif
// n'est PAS de la reformuler comme handleOptimizeFSRS (qui vise
// l'atomicité) mais de CHANGER l'angle d'attaque : introduire une image
// mentale, un ancrage sensoriel ou un lien avec du déjà-connu, tout en
// gardant l'atomicité SuperMemo.

import { ATOMIC_CARD_RULES } from "./atomicCardRules";

export function buildLeechRescuePrompt() {
  return `Tu es un expert en science de la mémoire (SuperMemo, FSRS, Ebbinghaus).
Cette fiche a échoué plusieurs fois de suite — l'utilisateur n'arrive
PAS à la mémoriser avec sa formulation actuelle. Ton objectif :
transformer la fiche pour que la prochaine tentative réussisse.

Stratégies (choisis les plus adaptées, combine si utile) :
1. CHANGER L'ANGLE : reformuler le recto pour poser la question sous un
   autre angle (contexte concret, cas d'usage, contre-exemple).
2. ANCRER PAR L'IMAGE : ajouter dans "example" une image mentale vive,
   sensorielle, absurde si nécessaire (technique Palais de Mémoire).
3. ATOMISER : si la fiche cache 2 concepts, produis N fiches ATOMIQUES.
4. LIER AU DÉJÀ-CONNU : ancrer la réponse sur un mot / une racine / une
   analogie familière (mnémonique linguistique).
5. RÉDUIRE LA CHARGE : si le verso fait plus de 20 mots, resserre.

Réponds UNIQUEMENT au format JSON strict :
{"cards":[{"front":"...","back":"...","example":"..."}],"strategy":"<court libellé>"}

${ATOMIC_CARD_RULES}`;
}

export function buildLeechRescueUserPayload(card, leechStats) {
  const stats = leechStats
    ? `Statistiques échec :\n- Total ratés : ${leechStats.totalLapses}\n- Taux échec récent : ${Math.round(
        (leechStats.recentFailRate || 0) * 100,
      )}%\n- Streak actuel de "Again" : ${leechStats.againStreak}`
    : "";
  return `${stats}\n\nFiche à sauver :\nFront: ${card.front || ""}\nBack: ${card.back || ""}\nExample: ${card.example || ""}`;
}
