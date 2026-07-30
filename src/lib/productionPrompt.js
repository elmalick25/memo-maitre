// src/lib/productionPrompt.js
//
// Couche 5 — Filet de sécurité « production » UNIVERSEL.
//
// La couche 1 lève le plafond d'intervalle FSRS pour les fiches `recalled`.
// Ce pari n'est sûr que si la pression de PRODUCTION (écrire/dire la fiche en
// contexte réel) s'exerce quelle que soit la vue utilisée. Or elle n'existait
// que dans EnglishPractice.jsx et EnglishInTheWild.jsx (via useProductiveUse),
// pas dans le flux de révision classique de MemoMaster.jsx — pourtant le plus
// utilisé, tous sujets confondus.
//
// Ce module fournit les briques PURES nécessaires à MemoMaster pour proposer
// un mini-défi de production en fin de session, sans dépendre du composant
// complet EnglishPractice.

import { getExpressionsNeedingProduction } from './masteryStages.js';

// ── Seuils configurables ──────────────────────────────────────────────────
/** Nombre de fiches proposées par invitation. */
export const PRODUCTION_INVITE_SIZE = 2;
/** Cooldown entre deux invitations (anti-fatigue de notification). */
export const PRODUCTION_PROMPT_COOLDOWN_MS = 20 * 60 * 60 * 1000; // ~1x/jour
/** Clé de persistance du dernier prompt (localStorage, géré par l'appelant). */
export const PRODUCTION_PROMPT_STORAGE_KEY = 'memomaitre_lastProductionPromptAt_v1';

/** Filtre « anglais » (même règle que hooks/useProductiveUse.js). */
export const isEnglishCard = (ex) => {
  const cat = ex?.category || '';
  const lc = cat.toLowerCase();
  return lc.includes('anglais') || lc.includes('english') || cat.includes('🇬🇧');
};

/**
 * Cooldown : renvoie true si une invitation peut être affichée maintenant.
 * @param {number|string|null} lastPromptAt - timestamp ms (ou ISO) persisté.
 */
export function canPromptProduction(lastPromptAt, nowMs = Date.now(), cooldownMs = PRODUCTION_PROMPT_COOLDOWN_MS) {
  if (lastPromptAt == null || lastPromptAt === '') return true;
  const t = typeof lastPromptAt === 'number' ? lastPromptAt : Date.parse(lastPromptAt);
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= cooldownMs;
}

/**
 * Sélectionne les fiches anglaises `recalled` jamais produites à proposer en
 * fin de session. On privilégie celles VUES pendant la session (contexte frais),
 * puis on complète avec le reste du corpus.
 *
 * @param {Array} allExpressions - toutes les fiches connues.
 * @param {Array} sessionCards - fiches de la session qui vient de se terminer.
 * @param {Object} opts - { limit }
 * @returns {Array} fiches à proposer (peut être vide).
 */
export function pickProductionInvite(allExpressions, sessionCards = [], opts = {}) {
  const limit = opts.limit ?? PRODUCTION_INVITE_SIZE;
  const all = (Array.isArray(allExpressions) ? allExpressions : []).filter(isEnglishCard);
  const needy = getExpressionsNeedingProduction(all, Math.max(limit * 5, limit));
  if (!needy.length) return [];

  const sessionIds = new Set((Array.isArray(sessionCards) ? sessionCards : []).map((c) => c?.id));
  const fromSession = needy.filter((c) => sessionIds.has(c.id));
  const rest = needy.filter((c) => !sessionIds.has(c.id));
  return [...fromSession, ...rest].slice(0, limit);
}

/**
 * Prompt de validation d'une phrase produite par l'apprenant.
 * Repris tel quel de useProductiveUse.validateProductionSentence pour garder
 * UN seul critère de validation dans toute l'application.
 */
export function buildProductionValidationPrompt(expression, sentence) {
  const system = [
    "You validate a learner's written sentence against a target English expression.",
    'Return ONLY JSON: { "correct": true|false, "feedback": "short French coaching note" }.',
    'correct=true only if the target expression (or a clear reformulation with same meaning) is used naturally and grammatically in the sentence.',
  ].join('\n');
  const user = `TARGET: "${expression?.front ?? ''}" — meaning: ${expression?.back ?? ''}\nSENTENCE: ${sentence ?? ''}`;
  return { system, user };
}

/** Parse tolérant de la réponse LLM du validateur. */
export function parseProductionValidation(raw) {
  try {
    const m = String(raw || '').match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    return { correct: !!parsed?.correct, feedback: parsed?.feedback || '' };
  } catch {
    return { correct: false, feedback: 'Analyse indisponible.' };
  }
}
