// src/hooks/useCEFR.js
// ════════════════════════════════════════════════════════════════════════════
// Suivi de niveau CECRL — branché sur le moteur déterministe.
// ════════════════════════════════════════════════════════════════════════════
// Version précédente : on empilait 30 productions brutes, on les envoyait à un
// LLM avec « tu es examinateur Cambridge, donne un niveau », et on affichait sa
// réponse. Trois défauts rédhibitoires :
//   • le niveau changeait d'un appel à l'autre pour les mêmes données ;
//   • aucune mesure n'était réellement calculée (le modèle estimait) ;
//   • le résultat n'indiquait pas quoi faire, ni combien de temps.
//
// Désormais :
//   • chaque production est MESURÉE localement (productionMetrics.js) ;
//   • les mesures deviennent des preuves datées, pondérées et décotées ;
//   • le niveau est CALCULÉ par cefrModel.computeProfile ;
//   • le LLM n'intervient que pour annoter les erreurs (feedbackPrompts.js) ;
//   • le hook expose en plus le plan hebdomadaire et les priorités d'erreurs.
//
// L'API publique reste compatible avec l'existant :
//   { cefrState, isLoaded, isAnalyzing, addProduction, incrementSession, triggerAnalysis }
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  computeProfile,
  gateToNextLevel,
  weeklyPlan,
  errorPriorities,
  annotationToEvidence,
  ERROR_TAXONOMY,
} from "../lib/english/cefrModel.js";
import { measureProduction, metricsToEvidence } from "../lib/english/productionMetrics.js";
import { buildProductionFeedbackPrompt } from "../lib/english/feedbackPrompts.js";

const STORAGE_KEY = "cefr_tracker_v2";
const LEGACY_KEY = "cefr_tracker_v1";
const MAX_EVIDENCE = 200;
const MAX_PRODUCTIONS = 60;

const DEFAULT_STATE = {
  version: 2,
  productions: [],
  evidence: [],
  analyses: [],
  sessionsSinceLastAnalysis: 0,
};

/** Rattache un libellé d'activité de l'app à une activité du modèle CECRL. */
export function contextToActivity(context = "") {
  const c = String(context).toLowerCase();
  if (c.includes("dict")) return "listening";
  if (c.includes("writ") || c.includes("essay") || c.includes("écrit")) return "writing";
  if (c.includes("shadow") || c.includes("pronun") || c.includes("prononc")) return "shadowing";
  if (c.includes("listen") || c.includes("écoute")) return "listening";
  return "speaking";
}

/** Reprend l'ancien format v1 (texte brut sans mesures) et le mesure enfin. */
function migrateLegacy(legacy) {
  if (!legacy || !Array.isArray(legacy.productions)) return null;
  const productions = legacy.productions.slice(-MAX_PRODUCTIONS);
  const evidence = [];
  for (const p of productions) {
    if (!p?.text || p.text.length < 15) continue;
    const activity = contextToActivity(p.context);
    const metrics = measureProduction(p.text, { activity });
    const ev = metricsToEvidence(metrics, { date: p.date, activity });
    if (ev) evidence.push(ev);
  }
  return {
    ...DEFAULT_STATE,
    productions,
    evidence: evidence.slice(-MAX_EVIDENCE),
    analyses: Array.isArray(legacy.analyses) ? legacy.analyses : [],
    sessionsSinceLastAnalysis: legacy.sessionsSinceLastAnalysis || 0,
  };
}

export function useCEFR(storage) {
  const [cefrState, setCefrState] = useState(DEFAULT_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const stateRef = useRef(DEFAULT_STATE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await storage?.get?.(STORAGE_KEY);
        if (data && Array.isArray(data.evidence)) {
          if (!cancelled) {
            stateRef.current = data;
            setCefrState(data);
          }
        } else {
          // Migration silencieuse depuis v1 : on ne perd aucune production.
          const legacy = await storage?.get?.(LEGACY_KEY);
          const migrated = migrateLegacy(legacy) || DEFAULT_STATE;
          if (!cancelled) {
            stateRef.current = migrated;
            setCefrState(migrated);
            if (legacy) storage?.set?.(STORAGE_KEY, migrated);
          }
        }
      } catch (e) {
        console.warn("[useCEFR] chargement impossible", e);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = useCallback(
    (updater) => {
      setCefrState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        stateRef.current = next;
        try {
          storage?.set?.(STORAGE_KEY, next);
        } catch (e) {
          console.warn("[useCEFR] sauvegarde impossible", e);
        }
        return next;
      });
    },
    [storage],
  );

  /**
   * Enregistre une production ET la mesure immédiatement.
   * `meta` accepte : durationSec, pronunciationScore, listeningAccuracy,
   * listeningSpeed, errorTypes (issus d'un scoring déterministe).
   */
  const addProduction = useCallback(
    (text, context, score = null, meta = {}) => {
      const clean = String(text || "").trim();
      if (clean.length < 5) return null;

      const activity = meta.activity || contextToActivity(context);
      const metrics = measureProduction(clean, {
        activity,
        durationSec: Number(meta.durationSec) || 0,
      });
      const evidence = metricsToEvidence(metrics, { ...meta, activity });

      const production = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        date: new Date().toISOString(),
        text: clean,
        context,
        score,
        annotated: false,
        metrics,
      };

      commit((prev) => ({
        ...prev,
        productions: [...prev.productions, production].slice(-MAX_PRODUCTIONS),
        evidence: evidence ? [...prev.evidence, evidence].slice(-MAX_EVIDENCE) : prev.evidence,
      }));

      return { production, metrics, evidence };
    },
    [commit],
  );

  /** Ajoute une preuve directement (dictée, prononciation) sans texte produit. */
  const addEvidence = useCallback(
    (evidence) => {
      if (!evidence) return;
      commit((prev) => ({ ...prev, evidence: [...prev.evidence, evidence].slice(-MAX_EVIDENCE) }));
    },
    [commit],
  );

  const incrementSession = useCallback(() => {
    commit((prev) => ({ ...prev, sessionsSinceLastAnalysis: (prev.sessionsSinceLastAnalysis || 0) + 1 }));
  }, [commit]);

  // ── Le niveau est CALCULÉ, pas demandé ──────────────────────────────────
  const profile = useMemo(() => computeProfile(cefrState.evidence || []), [cefrState.evidence]);
  const gate = useMemo(() => gateToNextLevel(profile), [profile]);
  const priorities = useMemo(() => errorPriorities(cefrState.evidence || []), [cefrState.evidence]);
  const plan = useMemo(
    () => weeklyPlan(profile, cefrState.evidence || []),
    [profile, cefrState.evidence],
  );

  /**
   * Le LLM annote les productions non encore annotées : il nomme les erreurs
   * dans la taxonomie fermée. Ces annotations enrichissent les preuves
   * existantes — elles ne produisent jamais le niveau.
   */
  const triggerAnalysis = useCallback(
    async (callClaude, force = false) => {
      if (isAnalyzing) return null;
      const state = stateRef.current;
      const pending = (state.productions || []).filter((p) => !p.annotated && p.text.length >= 40);

      if (!force) {
        if (pending.length < 3) {
          return { error: "Pas assez de nouvelles productions à annoter (3 minimum)." };
        }
      }
      if (pending.length === 0) {
        return { error: "Aucune production à annoter pour l'instant." };
      }

      setIsAnalyzing(true);
      try {
        const focusTypes = priorities.slice(0, 3).map((p) => p.type);
        const batch = pending.slice(-5);
        const annotatedIds = [];
        const newEvidence = [];
        const allCorrections = [];

        for (const production of batch) {
          const prompt = buildProductionFeedbackPrompt({
            text: production.text,
            metrics: production.metrics,
            activity: production.metrics?.activity || contextToActivity(production.context),
            level: profile?.overall?.level || "B1",
            focusTypes,
          });
          let parsed = null;
          try {
            const raw = await callClaude(prompt, "Annotation de production");
            parsed = JSON.parse(String(raw).replace(/```json|```/gi, "").trim());
          } catch (e) {
            console.warn("[useCEFR] annotation illisible", e);
            continue;
          }
          if (!parsed) continue;

          // On garde les mesures locales et on n'accepte du LLM que ce qu'il
          // sait faire : le typage d'erreurs et les corrections.
          const merged = annotationToEvidence(
            {
              ...parsed,
              words: production.metrics?.words || 0,
              distinctLemmas: production.metrics?.distinctLemmas || 0,
              rareWordRatio: production.metrics?.rareWordRatio || 0,
              meanUtteranceLength: production.metrics?.meanUtteranceLength || 0,
              subordinationRatio: production.metrics?.subordinationRatio || 0,
            },
            {
              date: production.date,
              activity: production.metrics?.activity || contextToActivity(production.context),
              durationSec: production.metrics?.durationSec || 0,
            },
          );
          if (merged) {
            newEvidence.push(merged);
            allCorrections.push(...(parsed.corrections || []));
          }
          annotatedIds.push(production.id);
        }

        if (newEvidence.length === 0) {
          return { error: "L'annotation n'a rien renvoyé d'exploitable. Réessaie dans un moment." };
        }

        // Les preuves annotées remplacent les preuves brutes de mêmes dates :
        // même production, mesure identique, mais erreurs désormais typées.
        const replacedDates = new Set(newEvidence.map((e) => e.date));
        const nextEvidence = [
          ...(state.evidence || []).filter((e) => !replacedDates.has(e.date)),
          ...newEvidence,
        ].slice(-MAX_EVIDENCE);

        const nextProfile = computeProfile(nextEvidence);
        const nextGate = gateToNextLevel(nextProfile);
        const nextPriorities = errorPriorities(nextEvidence);

        const analysis = {
          date: new Date().toISOString(),
          // Champs conservés pour la compatibilité de l'affichage existant.
          overall: nextProfile.overall?.level || null,
          overallLabel: nextProfile.overall?.label || null,
          vocabulary: nextProfile.skills.vocabulary.level,
          grammar: nextProfile.skills.grammar.level,
          speaking: nextProfile.skills.fluency.level,
          listening: nextProfile.skills.listening.level,
          pronunciation: nextProfile.skills.pronunciation.level,
          discourse: nextProfile.skills.discourse.level,
          confidence: nextProfile.confidence,
          justification: buildJustification(nextProfile, nextGate),
          gaps: nextPriorities.map((p) => ({
            area: ERROR_TAXONOMY[p.type]?.skill || "grammar",
            issue: p.label,
            example:
              allCorrections.find((c) => c.type === p.type)
                ? `Tu as écrit « ${allCorrections.find((c) => c.type === p.type).original} » → « ${allCorrections.find((c) => c.type === p.type).corrected} »`
                : "",
            exercise: `Exercice ${p.drill} — attendu réglé au niveau ${p.clearedBy}`,
          })),
          strengths: buildStrengths(nextProfile),
          nextMilestone: nextGate.blocking.length
            ? `Pour viser ${nextGate.target} : ${nextGate.blocking
                .slice(0, 2)
                .map((b) => `${b.label} (+${b.gap.toFixed(1)})`)
                .join(", ")}`
            : `Tous les critères de ${nextGate.target} sont atteints — consolide avant de viser plus haut.`,
          corrections: allCorrections.slice(0, 12),
        };

        commit((prev) => ({
          ...prev,
          evidence: nextEvidence,
          productions: prev.productions.map((p) =>
            annotatedIds.includes(p.id) ? { ...p, annotated: true } : p,
          ),
          analyses: [...prev.analyses, analysis].slice(-20),
          sessionsSinceLastAnalysis: 0,
        }));

        return { success: true, analysis, profile: nextProfile };
      } catch (e) {
        console.error("[useCEFR] analyse échouée", e);
        return { error: "L'annotation a échoué. Tes mesures locales restent intactes." };
      } finally {
        setIsAnalyzing(false);
      }
    },
    [isAnalyzing, commit, priorities, profile],
  );

  // Vue compatible avec l'existant + tout le nouveau diagnostic.
  const publicState = useMemo(
    () => ({
      ...cefrState,
      level: profile?.overall?.level || null,
      currentLevel: profile?.overall?.level || null,
      levelLabel: profile?.overall?.label || null,
      scale: profile?.overallScale ?? null,
      confidence: profile?.confidence ?? 0,
      bottleneck: profile?.bottleneck || null,
      skills: profile?.skills || {},
      lastAnalysis: cefrState.analyses?.[cefrState.analyses.length - 1] || null,
    }),
    [cefrState, profile],
  );

  return {
    cefrState: publicState,
    isLoaded,
    isAnalyzing,
    addProduction,
    addEvidence,
    incrementSession,
    triggerAnalysis,
    // Nouveau : le diagnostic complet, disponible sans aucun appel réseau.
    profile,
    gate,
    plan,
    priorities,
  };
}

function buildJustification(profile, gate) {
  if (!profile?.overall) {
    return "Pas encore assez de productions mesurées pour établir un niveau fiable. Continue : le niveau apparaîtra tout seul.";
  }
  const weak = profile.bottleneck;
  const parts = [`Niveau global calculé : ${profile.overall.label} (confiance ${Math.round(profile.confidence * 100)} %).`];
  if (weak) parts.push(`Le maillon faible est « ${weak.label} » à ${weak.label2 || weak.level}.`);
  if (gate?.blocking?.length) {
    parts.push(`Ce qui bloque ${gate.target} : ${gate.blocking.slice(0, 2).map((b) => b.label).join(" et ")}.`);
  }
  return parts.join(" ");
}

function buildStrengths(profile) {
  return Object.values(profile?.skills || {})
    .filter((s) => s.scale !== null && s.confidence >= 0.3)
    .sort((a, b) => b.scale - a.scale)
    .slice(0, 2)
    .map((s) => `${s.label} : ${s.label2 || s.level}`);
}

export default useCEFR;
