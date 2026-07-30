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
  } catch (_) {}
  return false;
}
function dlog(...args) {
  if (isDebug()) {
    try { console.log("%c[AgentCardDetector]", "color:#7c3aed;font-weight:bold", ...args); } catch (_) {}
  }
}
function dgroup(label, fn) {
  if (!isDebug()) return fn?.();
  try {
    console.groupCollapsed(`%c[AgentCardDetector] ${label}`, "color:#7c3aed;font-weight:bold");
    const r = fn?.();
    console.groupEnd();
    return r;
  } catch (_) { return fn?.(); }
}

function robustJsonParse(raw) {
  if (!raw) return null;
  let text = String(raw).replace(/```json|```/gi, "").trim();
  try { return JSON.parse(text); } catch (_) {}
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
// PROMPT v7 — RÉTRO-INGÉNIERIE SÉMANTIQUE & TRANSITION MÉTAPHORTIQUE :
//   Fiches ultra-concises (~30-40 lignes) basées UNIQUEMENT sur les erreurs
//   de l'UTILISATEUR (ex: "do you hear me" → "Can you hear me?").
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un ingénieur linguistique. Ton objectif est de générer des fiches d'anglais ultra-concises basées sur la RÉTRO-INGÉNIERIE SÉMANTIQUE. Pas de blabla, longueur maximale : ~30-40 lignes.

RÈGLE OBLIGATOIRE DE TRANSITION SÉMANTIQUE :
Dans la section Décomposition, tu dois TOUJOURS expliquer le GLISSEMENT MÉTAPHORIQUE : pourquoi un mot physique (ex: "pick up" = ramasser) prend un sens abstrait dans ce contexte précis, et comment la particule transforme l'action physique en concept d'état ou de workflow.

CONDITION STRICTE DE GÉNÉRATION (CORRECTION UTILISATEUR EXCLUSIVE) :
- L'utilisateur a fait une erreur ou une formulation imparfaite (grammaire, préposition, article, temps, collocation, faux-ami, structure, ordre des mots, choix lexical comme "do you hear me" au lieu de "can you hear me?").
- L'agent la corrige EXPLICITEMENT ("we say X, not Y") ou IMPLICITEMENT (l'agent réutilise la même idée en reformulant correctement).
- → Crée une fiche avec front = la forme CORRECTE (ex: "Can you hear me?").
- Met impérativement "source": "user_error".

EXCLUSION STRICTE :
- Si l'utilisateur n'a fait AUCUNE erreur et que l'agent produit simplement du vocabulaire enrichi, du small talk ou des explications générales → RENVOIE STRICTEMENT {"cards": []}.
- Ne crée JAMAIS de fiche si le message utilisateur était 100% correct.

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
      "back": "Traduction : Est-ce que tu m'entends ?\\n\\n### ⚙️ 1. Décomposition & Transition Métaphorique\\n* **Can :** Sens physique : *Tester la capacité active en temps réel* ➔ **Glissement sémantique :** Utilisé pour vérifier si le canal audio/signal passe.\\n* **Hear :** Sens physique : *Réception auditive passive dans l'oreille* ➔ **Glissement sémantique :** Perception du flux vocal sans effort d'écoute actif.\\n* **Le Modèle Mental :** L'anglais vérifie l'état technique de la connexion (capacité physique), pas l'attention de l'interlocuteur.\\n\\n### 🔍 2. Comparatif (Pourquoi A et pas B ?)\\n* **Option A (Can you hear me?) :** Teste la disponibilité du canal audio en temps réel.\\n* **Option B (Do you hear me?) :** Exige l'obéissance ou interroge une habitude ('Tu m'écoutes quand je te parle ?').\\n\\n### ⚠️ 3. Anti-Pattern (Le piège)\\n* **Erreur :** Traduire du français 'Est-ce que tu m'entends ?' par 'Do you hear me?' ➔ **Problème :** Perçu comme agressif ou autoritaire au lieu de tester le micro.\\n\\n### 💻 4. Exemples (Format court)\\n* **Tech/Workflow :** \`Can you hear me clearly on this Zoom link?\` ↳ *M'entends-tu clairement sur ce lien Zoom ?*\\n* **Quotidien :** \`Hey, I just plugged in my headphones, can you hear me?\` ↳ *Hé, je viens de brancher mes écouteurs, tu m'entends ?*",
      "example": "Can you hear me clearly on this Zoom call?"
    }
  ]
}

RÈGLES DE FORMAT du champ "back" (impératif) :
1. "Traduction : <traduction française littérale>"
2. Ligne vide
3. "✅ QUAND L'UTILISER :" + explication en 1-2 phrases FR
4. "🎬 SENS DANS CE CONTEXTE :" + nuance/registre en 1 phrase FR
5. "💬 EXEMPLES :" + EXACTEMENT 3 exemples :
     • <phrase EN>
       🗣 <phonétique française "maison" — JAMAIS d'IPA — que des sons FR>
       ↳ <traduction FR>
6. "🔄 ALTERNATIVES / SYNONYMES :" + liste plate séparée par des virgules
7. "📌 PIÈGE :" — OBLIGATOIRE si source="user_error" (dit l'erreur typique
   que l'utilisateur vient de faire), facultatif sinon.

Phonétique : LISIBLE par un francophone qui ne connaît PAS l'IPA
("the" → "ze", "think" → "sinke", "very" → "véry", "first" → "feurst").`;

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
        try { console.log("[AgentCardDetector] Réponse brute:\n" + rawText); } catch (_) {}
      }

      let parsed = null;
      if (safeParseJSON) {
        try { parsed = safeParseJSON(rawText); } catch (_) {}
      }
      if (!parsed) parsed = robustJsonParse(rawText);

      if (!parsed) { dlog("rejet: JSON illisible"); return; }
      if (!parsed?.cards?.length) { dlog("rejet: LLM a renvoyé 0 carte (cards=[])"); return; }
      dlog(`LLM a proposé ${parsed.cards.length} carte(s) brute(s):`, parsed.cards.map(c => c.front));

      // Dédoublonnage contre l'existant
      const existingFronts = new Set(
        expressions.map(e => (e.front || "").toLowerCase().trim()).filter(Boolean)
      );
      const rejected = [];
      const newCards = parsed.cards.filter(c => {
        const f = (c.front || "").toLowerCase().trim();
        if (!f) { rejected.push([c.front, "front vide"]); return false; }
        if (c.source && c.source !== "user_error") { rejected.push([c.front, "source non user_error"]); return false; }
        if (existingFronts.has(f)) { rejected.push([c.front, "déjà en base (exact)"]); return false; }
        for (const ex of existingFronts) {
          if (ex.length > 3 && (ex.includes(f) || f.includes(ex))) {
            rejected.push([c.front, `chevauche "${ex}"`]);
            return false;
          }
        }
        return true;
      });
      if (rejected.length) dlog("Cartes rejetées:", rejected);
      if (!newCards.length) { dlog("rejet: toutes les cartes dédoublonnées ou invalides"); return; }

      const enriched = newCards.map(c => ({
        id: (typeof crypto !== "undefined" && crypto.randomUUID)
          ? crypto.randomUUID()
          : "agent-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        front: (c.front || "").trim(),
        back: (c.back || "").trim(),
        example: (c.example || "").trim(),
        ipa: c.ipa?.trim() || null,
        category: englishCategory || "🇬🇧 Anglais",
        level: 0,
        nextReview: localToday(),
        createdAt: localToday(),
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0,
        reviewHistory: [],
        imageUrl: null,
        _agentDetected: true,
        _type: c.type || "correction",
        _difficulty: c.difficulty || "B1",
        _source: "user_error",
        _pairIndex: pairIndex,
      }));

      // AUTO-SAVE SILENCIEUX
      setExpressions(prev => {
        const seen = new Set(prev.map(e => (e.front || "").toLowerCase().trim()));
        const toAdd = enriched.filter(c => !seen.has(c.front.toLowerCase().trim()));
        if (!toAdd.length) { dlog("rejet final: race — déjà ajoutées"); return prev; }
        __createdCount += toAdd.length;
        try {
          console.info(
            `%c[AgentCardDetector] +${toAdd.length} fiche(s) créée(s) — total session: ${__createdCount}`,
            "color:#16a34a;font-weight:bold"
          );
          toAdd.forEach(c => console.info(
            `  • ${c._source === "user_error" ? "🩹" : "📘"} ${c.front}  (${c._difficulty}, ${c._type})`
          ));
        } catch (_) {}
        return [...toAdd, ...prev];
      });

      setSessionCreatedCards(prev => [...prev, ...enriched]);
    } catch (e) {
      console.warn("[AgentCardDetector] Erreur analyse:", e);
    } finally {
      isAnalyzingRef.current = false;
    }
  }, [callClaude, safeParseJSON, expressions, englishCategory, localToday, setExpressions]);

  // Sérialise les analyses : chaque paire est traitée à son tour, aucune n'est perdue.
  const analyzePair = useCallback((userMsg, agentMsg, pairIndex) => {
    queueRef.current = queueRef.current
      .catch(() => {})
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
  const confirmCard = useCallback(() => {}, []);
  const dismissCard = useCallback(() => {}, []);
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
