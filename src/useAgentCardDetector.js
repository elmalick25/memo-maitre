// useAgentCardDetector.js — v3 (2026-07-07)
// ─────────────────────────────────────────────────────────────────────────────
// Détecte les expressions à mémoriser dans une conversation avec l'agent
// et crée des fiches MemoMaster enrichies — 100% silencieusement.
//
// 🆕 v3 :
//   • DEBUG VERBEUX activable via localStorage.setItem("agentCardDebug","1")
//     (ou window.__AGENT_CARD_DEBUG = true). Affiche : paires analysées,
//     prompt envoyé, réponse brute du LLM, parsing, raisons de rejet.
//   • BRANCHE "CORRECTION UTILISATEUR" prioritaire : capture aussi les
//     erreurs de grammaire, prépositions, faux-amis, collocations ratées
//     de l'utilisateur, même en A1-B1, dès que l'agent corrige ou
//     reformule (explicitement OU implicitement).
//   • Seuils abaissés (MIN_AGENT_WORDS 5, MIN_USER_WORDS 1) pour ne
//     rater aucune correction courte ("say 'on Monday', not 'in Monday'").
//   • Log toujours actif d'un compteur "n paires analysées / n fiches créées"
//     pour repérer d'un coup d'œil si la boucle tourne.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback, useState } from "react";

const MIN_AGENT_WORDS = 5;
const MIN_USER_WORDS = 1;
const DEBOUNCE_MS = 900;

// ── Debug flag (lisible à chaud, sans rebuild) ───────────────────────────────
function isDebug() {
  try {
    if (typeof window !== "undefined" && window.__AGENT_CARD_DEBUG) return true;
    if (typeof localStorage !== "undefined" &&
      localStorage.getItem("agentCardDebug") === "1") return true;
  } catch (_) { }
  return false;
}
function dlog(...args) {
  if (isDebug()) {
    try { console.log("%c[AgentCardDetector]", "color:#2563eb;font-weight:bold", ...args); } catch (_) { }
  }
}
function dgroup(label, fn) {
  if (!isDebug()) return fn?.();
  try {
    console.groupCollapsed(`%c[AgentCardDetector] ${label}`, "color:#2563eb;font-weight:bold");
    const r = fn?.();
    console.groupEnd();
    return r;
  } catch (_) { return fn?.(); }
}

function robustJsonParse(raw) {
  if (!raw) return null;
  let text = String(raw).replace(/```json|```/gi, "").trim();
  try { return JSON.parse(text); } catch (_) { }
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const slice = end !== -1 ? text.slice(start, end + 1) : text.slice(start) + "}";
  try { return JSON.parse(slice); } catch (_) { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT v8 — RECTO ÉPURÉ & ANCRAGE CONTEXTUEL LIVE NOVA :
//   - Recto ("front") : STRICTEMENT l'expression anglaise correcte.
//   - Verso ("back") : Contexte Live Nova (Tu as dit vs En réalité) + Comparatif
//     + Anti-Pattern + Exemples. (Transition Métaphorique réservée aux idioms/phrasal verbs).
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un ingénieur linguistique d'élite. Ton objectif est de générer des fiches d'anglais ultra-précises basées sur les erreurs réelles de l'utilisateur en discussion live avec Nova. Pas de blabla inutile.

CONDITION STRICTE DE GÉNÉRATION (CORRECTION UTILISATEUR EXCLUSIVE) :
- L'utilisateur a fait une erreur ou une formulation imparfaite (grammaire, préposition, article, temps, collocation, faux-ami, structure, ordre des mots, choix lexical comme "do you hear me" au lieu de "can you hear me?").
- L'agent la corrige EXPLICITEMENT ("we say X, not Y") ou IMPLICITEMENT (l'agent réutilise la même idée en reformulant correctement).
- → Crée une fiche avec front = STRICTEMENT la forme anglaise CORRECTE (ex: "Can you hear me?"). Zéro fioriture sur le recto.
- Met impérativement "source": "user_error".

EXCLUSION STRICTE :
- Si l'utilisateur n'a fait AUCUNE erreur et que l'agent produit simplement du vocabulaire enrichi, du small talk ou des explications générales → RENVOIE STRICTEMENT {"cards": []}.
- Ne crée JAMAIS de fiche si le message utilisateur était 100% correct.

RÈGLE DU VERSO ("back") :
1. En-tête obligatoire "### 🎙️ Contexte Live Nova" :
* 🔴 **Tu as dit :** "<ce que l'utilisateur a dit>" ❌
* 🟢 **En réalité, on dit :** "<la forme correcte>" ✅
* 📖 **Traduction :** <traduction française naturelle>

2. Le Réflexe Natif & Transition Métaphorique :
En 1 ou 2 phrases limpides, explique la logique ou l'image mentale (Transition Métaphorique si idiom/phrasal verb) :
💡 **Le réflexe natif :** <pourquoi le natif utilise cette tournure, sans jargon>

3. Mini-dialogue en contexte :
💬 **Mini-dialogue :**
* **A :** \`<réplique A en anglais, courte et naturelle>\`
* **B :** \`<réplique B en anglais>\`
↳ *<traduction française du dialogue>*

4. Attention au piège :
⚠️ **Attention au piège :** <le calque du français à bannir ou la nuance de registre (familier vs formel)>.

RÉPONSE : UNIQUEMENT JSON valide, sans texte autour, sans markdown.
INTERDIT : sauts de ligne réels dans une valeur JSON. Utiliser "\\n".

Schéma :
{
  "cards": [
    {
      "front": "Can you hear me?",
      "type": "correction" | "grammar" | "vocabulary" | "phrasal_verb" | "idiom",
      "difficulty": "A2" | "B1" | "B2" | "C1" | "C2",
      "source": "user_error",
      "back": "### 🎙️ Contexte Live Nova\\n* 🔴 **Tu as dit :** \\\"Do you hear me?\\\" ❌\\n* 🟢 **En réalité, on dit :** \\\"Can you hear me?\\\" ✅\\n* 📖 **Traduction :** Est-ce que tu m'entends ?\\n\\n💡 **Le réflexe natif :**\\nEn anglais, \\\"Can you hear me?\\\" teste le signal audio. \\\"Do you hear me?\\\" questionne plutôt l'obéissance ou l'attention (comme un parent fâché).\\n\\n💬 **Mini-dialogue :**\\n* **A :** \`Can you hear me clearly on this Zoom link, or should I switch my mic?\`\\n* **B :** \`Loud and clear!\`\\n↳ *M'entends-tu clairement sur ce lien Zoom, ou je change de micro ? — Cinq sur cinq !*\\n\\n⚠️ **Attention au piège :**\\nCalquer le présent français « Tu m'entends ? » avec l'auxiliaire « Do ».",
      "example": "Can you hear me clearly on this Zoom call?"
    }
  ]
}

Phonétique ("ipa") : LISIBLE par un francophone qui ne connaît PAS l'IPA ("the" → "ze").`;

// Compteurs de session (utiles pour debug rapide dans la console)
let __analyzedCount = 0;
let __createdCount = 0;

export function useAgentCardDetector({
  agentTranscript,
  expressions,
  setExpressions,
  storage,               // conservé pour compat — plus utilisé (MemoMaster persiste)
  callClaude,
  safeParseJSON,
  localToday,
  englishCategory,
  showToast,             // conservé pour compat — plus appelé pendant la session
  enabled,
}) {
  const lastAnalyzedIndexRef = useRef(-1);
  const isAnalyzingRef = useRef(false);
  // File d'attente sérialisée : avant, une paire arrivant pendant une analyse
  // en cours était purement jetée (et jamais réanalysée) → des corrections
  // n'engendraient aucune fiche. On les met en file au lieu de les perdre.
  const queueRef = useRef(Promise.resolve());
  const debounceRef = useRef(null);
  const [sessionCreatedCards, setSessionCreatedCards] = useState([]);

  // ── Analyse d'une paire user+agent ────────────────────────────────────────
  const runAnalyzePair = useCallback(async (userMsg, agentMsg, pairIndex) => {
    if (!callClaude) { dlog("skip: callClaude manquant"); return; }

    const agentWords = agentMsg.trim().split(/\s+/).filter(Boolean).length;
    const userWords = userMsg.trim().split(/\s+/).filter(Boolean).length;
    if (agentWords < MIN_AGENT_WORDS || userWords < MIN_USER_WORDS) {
      dlog(`skip: trop court (user=${userWords} mots, agent=${agentWords} mots)`);
      return;
    }

    __analyzedCount++;
    dgroup(`Analyse paire #${pairIndex} (total analysées: ${__analyzedCount})`, () => {
      dlog("USER:", userMsg);
      dlog("AGENT:", agentMsg);
    });

    isAnalyzingRef.current = true;
    const t0 = Date.now();
    try {
      const userPrompt = `UTILISATEUR: "${userMsg}"\n\nAGENT: "${agentMsg}"`;
      const raw = await callClaude(SYSTEM_PROMPT, userPrompt, {
        maxTokens: 1100,
        grounding: false,
        json: true,
        task: "fast-json",
      });

      const rawText = typeof raw === "string" ? raw : (raw?.text || "");
      dlog(`LLM répondu en ${Date.now() - t0}ms — ${rawText.length} chars`);
      if (isDebug()) {
        try { console.log("[AgentCardDetector] Réponse brute:\n" + rawText); } catch (_) { }
      }

      let parsed = null;
      if (safeParseJSON) {
        try { parsed = safeParseJSON(rawText); } catch (_) { }
      }
      if (!parsed) parsed = robustJsonParse(rawText);

      if (!parsed) { dlog("rejet: JSON illisible"); return; }
      if (!parsed?.cards?.length) { dlog("rejet: LLM a renvoyé 0 carte (cards=[])"); return; }
      dlog(`LLM a proposé ${parsed.cards.length} carte(s) brute(s):`, parsed.cards.map(c => c.front));

      const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
      const overlaps = (f, existingSet) => {
        if (existingSet.has(f)) return true;
        for (const ex of existingSet) {
          if (ex.length > 3 && (ex.includes(f) || f.includes(ex))) return true;
        }
        return false;
      };
      // Une fiche Live Nova n'est valable que si elle est COMPLÈTE :
      // recto non vide + verso réellement explicatif.
      const isComplete = (c) => {
        const front = String(c?.front || "").trim();
        const back = String(c?.back || "").trim();
        if (!front || !back) return false;
        if (/undefined|null/i.test(front)) return false;
        if (back.length < 40) return false;
        return true;
      };

      // Dédoublonnage contre l'existant + à l'intérieur du même lot
      const existingFronts = new Set(
        expressions.map(e => norm(e.front)).filter(Boolean)
      );
      const rejected = [];
      const batchFronts = new Set();
      const newCards = parsed.cards.filter(c => {
        const f = norm(c.front);
        if (!f) { rejected.push([c.front, "front vide"]); return false; }
        if (c.source && c.source !== "user_error") { rejected.push([c.front, "source non user_error"]); return false; }
        if (!isComplete(c)) { rejected.push([c.front, "fiche incomplète (verso manquant/trop court)"]); return false; }
        if (batchFronts.has(f)) { rejected.push([c.front, "doublon dans le même lot"]); return false; }
        if (overlaps(f, existingFronts)) { rejected.push([c.front, "déjà en base"]); return false; }
        batchFronts.add(f);
        return true;
      });
      if (rejected.length) dlog("Cartes rejetées:", rejected);
      if (!newCards.length) { dlog("rejet: toutes les cartes dédoublonnées ou invalides"); return; }

      const nowIso = new Date().toISOString();
      const enriched = newCards.map(c => {
        const back = String(c.back || "").trim();
        return {
          id: (typeof crypto !== "undefined" && crypto.randomUUID)
            ? crypto.randomUUID()
            : "agent-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
          front: String(c.front || "").trim(),
          back,
          example: String(c.example || "").trim(),
          ipa: c.ipa?.trim() || null,
          category: englishCategory || "🇬🇧 Anglais",
          level: 0,
          nextReview: localToday(),
          createdAt: localToday(),
          updatedAt: nowIso,
          easeFactor: 2.5,
          interval: 1,
          repetitions: 0,
          reviewHistory: [],
          imageUrl: null,
          _agentDetected: true,
          // Les fiches produites par le prompt v8 sont déjà au bon format :
          // on les marque pour qu'elles n'apparaissent jamais en "à moderniser".
          _novaV8: back.includes("Contexte Live Nova")
            && back.includes("Tu as dit")
            && back.includes("En réalité, on dit"),
          _type: c.type || "correction",
          _difficulty: c.difficulty || "B1",
          _source: "user_error",
          _pairIndex: pairIndex,
        };
      });

      // AUTO-SAVE SILENCIEUX — le dédoublonnage complet est refait sur l'état
      // le plus frais pour éliminer toute course entre deux analyses.
      let actuallyAdded = [];
      setExpressions(prev => {
        const list = Array.isArray(prev) ? prev : [];
        const seen = new Set(list.map(e => norm(e?.front)).filter(Boolean));
        const toAdd = [];
        for (const c of enriched) {
          const f = norm(c.front);
          if (!f || overlaps(f, seen)) continue;
          seen.add(f);
          toAdd.push(c);
        }
        if (!toAdd.length) { dlog("rejet final: race — déjà ajoutées"); return list; }
        actuallyAdded = toAdd;
        __createdCount += toAdd.length;
        try {
          console.info(
            `%c[AgentCardDetector] +${toAdd.length} fiche(s) créée(s) — total session: ${__createdCount}`,
            "color:#16a34a;font-weight:bold"
          );
          toAdd.forEach(c => console.info(
            `  • ${c._source === "user_error" ? "🩹" : "📘"} ${c.front}  (${c._difficulty}, ${c._type})`
          ));
        } catch (_) { }
        return [...toAdd, ...list];
      });

      // On n'affiche en fin de session QUE les fiches réellement enregistrées.
      if (actuallyAdded.length) {
        setSessionCreatedCards(prev => {
          const seen = new Set(prev.map(c => norm(c?.front)));
          const fresh = actuallyAdded.filter(c => !seen.has(norm(c.front)));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }

    } catch (e) {
      console.warn("[AgentCardDetector] Erreur analyse:", e);
    } finally {
      isAnalyzingRef.current = false;
    }
  }, [callClaude, safeParseJSON, expressions, englishCategory, localToday, setExpressions]);

  // Sérialise les analyses : chaque paire est traitée à son tour, aucune n'est perdue.
  const analyzePair = useCallback((userMsg, agentMsg, pairIndex) => {
    queueRef.current = queueRef.current
      .catch(() => { })
      .then(() => runAnalyzePair(userMsg, agentMsg, pairIndex));
    return queueRef.current;
  }, [runAnalyzePair]);

  // ── Watcher du transcript ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !agentTranscript?.length) return;

    const msgs = agentTranscript;
    let lastAgentIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "agent") { lastAgentIdx = i; break; }
    }
    if (lastAgentIdx <= 0) return;

    const pairIndex = lastAgentIdx;
    if (pairIndex <= lastAnalyzedIndexRef.current) return;

    let userMsg = "";
    for (let i = lastAgentIdx - 1; i >= 0; i--) {
      if (msgs[i].role === "user") { userMsg = msgs[i].text || ""; break; }
    }
    const agentMsg = msgs[lastAgentIdx].text || "";
    if (!agentMsg.trim()) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastAnalyzedIndexRef.current = pairIndex;
      analyzePair(userMsg, agentMsg, pairIndex);
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [agentTranscript, enabled, analyzePair]);

  // ── Compat API : ces méthodes ne servent plus (auto-save) ─────────────────
  const pendingCards = [];
  const confirmCard = useCallback(() => { }, []);
  const dismissCard = useCallback(() => { }, []);
  const clearPending = useCallback(() => {
    lastAnalyzedIndexRef.current = -1;
    setSessionCreatedCards([]);
    __analyzedCount = 0;
    __createdCount = 0;
  }, []);

  return {
    pendingCards,
    confirmCard,
    dismissCard,
    clearPending,
    sessionCreatedCards,
  };
}
