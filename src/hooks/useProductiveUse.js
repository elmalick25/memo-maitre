// src/hooks/useProductiveUse.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook partagé — pipeline "production active" (Phases 1-4) réutilisé par
// EnglishPractice (chat/voix) ET EnglishInTheWild (leçons vidéo).
//
// Rôle :
//  1. Analyse LLM d'une transcription de session vs. une liste d'expressions
//     cibles → enregistre les usages productifs corrects (`recordProductiveUse`)
//     + rappel FSRS bonus (`fsrsFromProduction`).
//  2. Ouvre un mini-défi de production en fin de session s'il reste des fiches
//     au stage "recalled" jamais réellement produites.
//
// Contrat :
//  - `analyzeSessionProductiveUses(...)` retourne la liste des expressions
//    RÉELLEMENT mises à jour pendant l'analyse (avec productiveUses + srs).
//    Cette liste doit être passée à `openProductionChallengeIfRelevant` pour
//    éviter que le défi lise un état React pas encore rafraîchi.
//  - `categoryFilter` : fonction booléenne (expression) => bool. Par défaut,
//    filtre "anglais". Rendre ce filtre paramétrable évite de compter les
//    autres matières (où la détection de production n'existe pas).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useState } from "react";
import {
  recordProductiveUse,
  getExpressionsNeedingProduction,
} from "../lib/masteryStages";
import { fsrsFromProduction } from "../lib/fsrs";
import { today } from "../utils/dateUtils";

export const englishCategoryFilter = (ex) => {
  const cat = ex?.category || "";
  const lc = cat.toLowerCase();
  return lc.includes("anglais") || lc.includes("english") || cat.includes("🇬🇧");
};

export default function useProductiveUse({
  callClaude,
  expressions,
  setExpressions,
  awardXP,
  showToast,
  categoryFilter = englishCategoryFilter,
}) {
  const [postSessionChallenge, setPostSessionChallenge] = useState(null);

  const analyzeSessionProductiveUses = useCallback(
    async ({ transcriptText, targets, sessionContext = "voice" }) => {
      const updatedExprs = [];
      try {
        const items = Array.isArray(targets) ? targets : [];
        if (!items.length) return updatedExprs;
        if (!transcriptText || String(transcriptText).trim().length < 20) return updatedExprs;

        const systemPrompt = [
          "You are a strict English-usage validator.",
          "Given a session transcript from a learner and a list of TARGET expressions,",
          "decide for each target whether the learner ACTUALLY used it correctly, in context,",
          "considering conjugation, synonyms, paraphrases and reformulations (not exact match only).",
          "Return ONLY a JSON array with the shape:",
          `[{ "expressionId": "<id>", "used": true|false, "correct": true|false, "evidence": "learner sentence (short quote)", "feedback": "short French coaching note" }]`,
          "No prose, no code fences, JSON only.",
        ].join("\n");

        const targetsBlock = items
          .map((ex) => `- id=${ex.id} | "${ex.front}" — ${ex.back}`)
          .join("\n");
        const userTurn = `TARGETS:\n${targetsBlock}\n\nTRANSCRIPT:\n${String(
          transcriptText
        ).slice(0, 8000)}`;

        const raw = await callClaude(systemPrompt, userTurn);
        let arr;
        try {
          const match = String(raw || "").match(/\[[\s\S]*\]/);
          arr = JSON.parse(match ? match[0] : raw);
        } catch (e) {
          console.warn("[analyzeSessionProductiveUses] JSON parse failed", e, raw);
          return updatedExprs;
        }
        if (!Array.isArray(arr)) return updatedExprs;

        arr.forEach((entry) => {
          if (!entry || !entry.expressionId) return;
          const targetExp = items.find((x) => x.id === entry.expressionId);
          if (!targetExp) return;

          if (entry.used && entry.correct) {
            // Calcule la version mise à jour synchrone (pour la retourner
            // immédiatement à openProductionChallengeIfRelevant).
            const updated = recordProductiveUse(targetExp, {
              context: sessionContext,
              correct: true,
              note: entry.evidence || undefined,
            });
            const srs = fsrsFromProduction({ ...updated, elapsedDays: null });
            const merged = {
              ...updated,
              ...srs,
              reviewHistory: [
                ...(targetExp.reviewHistory || []),
                {
                  date: today(),
                  q: 5,
                  newLevel: targetExp.level ?? 0,
                  interval: srs.interval,
                  source: "production",
                },
              ],
            };
            updatedExprs.push(merged);

            // Persiste dans le state global — merge sur la version live pour
            // ne pas écraser un autre champ modifié entre-temps.
            setExpressions((prev) =>
              prev.map((e) => {
                if (e.id !== targetExp.id) return e;
                const liveUpdated = recordProductiveUse(e, {
                  context: sessionContext,
                  correct: true,
                  note: entry.evidence || undefined,
                });
                const liveSrs = fsrsFromProduction({
                  ...liveUpdated,
                  elapsedDays: null,
                });
                return {
                  ...liveUpdated,
                  ...liveSrs,
                  reviewHistory: [
                    ...(e.reviewHistory || []),
                    {
                      date: today(),
                      q: 5,
                      newLevel: e.level ?? 0,
                      interval: liveSrs.interval,
                      source: "production",
                    },
                  ],
                };
              })
            );
            try {
              awardXP?.(20, 5, `🗣️ Utilisé "${targetExp.front}" en conversation`);
            } catch {}
            try {
              showToast?.(
                `🗣️ Bravo — "${targetExp.front}" utilisé en contexte`,
                "success"
              );
            } catch {}
          } else if (entry.used && entry.correct === false) {
            try {
              showToast?.(
                `💡 "${targetExp.front}" : ${entry.feedback || "à retravailler"}`,
                "info"
              );
            } catch {}
          }
        });
      } catch (e) {
        console.warn("[analyzeSessionProductiveUses] failed", e);
      }
      return updatedExprs;
    },
    [callClaude, setExpressions, awardXP, showToast]
  );

  const openProductionChallengeIfRelevant = useCallback(
    (topicHint, recentlyUpdated = []) => {
      try {
        const overrideMap = new Map(
          (recentlyUpdated || []).filter(Boolean).map((e) => [e.id, e])
        );
        const list = (expressions || []).map((e) => overrideMap.get(e.id) || e);
        const filtered = list.filter(categoryFilter);
        const needy = getExpressionsNeedingProduction(filtered, 2);
        if (needy.length) {
          setPostSessionChallenge({
            items: needy,
            topic: topicHint || "cette session",
          });
        }
      } catch (e) {
        console.warn("[openProductionChallengeIfRelevant]", e);
      }
    },
    [expressions, categoryFilter]
  );

  // ── Validator LLM du mini-défi (partagé entre EnglishPractice & EnglishInTheWild).
  // Persiste un usage "writing" correct sur la fiche cible + FSRS bonus + XP.
  const validateProductionSentence = useCallback(
    async ({ expression, sentence }) => {
      const sys = [
        "You validate a learner's written sentence against a target English expression.",
        'Return ONLY JSON: { "correct": true|false, "feedback": "short French coaching note" }.',
        "correct=true only if the target expression (or a clear reformulation with same meaning) is used naturally and grammatically in the sentence.",
      ].join("\n");
      const user = `TARGET: "${expression.front}" — meaning: ${expression.back}\nSENTENCE: ${sentence}`;
      let parsed = { correct: false, feedback: "Analyse indisponible." };
      try {
        const raw = await callClaude(sys, user);
        const m = String(raw || "").match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : raw);
      } catch (e) {
        console.warn("[validateProductionSentence]", e);
      }
      if (parsed?.correct) {
        setExpressions((prev) =>
          prev.map((e) => {
            if (e.id !== expression.id) return e;
            const updated = recordProductiveUse(e, {
              context: "writing",
              correct: true,
              note: sentence,
            });
            const srs = fsrsFromProduction({ ...updated, elapsedDays: null });
            return {
              ...updated,
              ...srs,
              reviewHistory: [
                ...(e.reviewHistory || []),
                {
                  date: today(),
                  q: 5,
                  newLevel: e.level ?? 0,
                  interval: srs.interval,
                  source: "production-challenge",
                },
              ],
            };
          })
        );
        try {
          awardXP?.(15, 3, `✍️ Défi réussi : "${expression.front}"`);
        } catch {}
      }
      return parsed;
    },
    [callClaude, setExpressions, awardXP]
  );

  return {
    analyzeSessionProductiveUses,
    openProductionChallengeIfRelevant,
    validateProductionSentence,
    postSessionChallenge,
    setPostSessionChallenge,
  };
}
