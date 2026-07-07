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
// PROMPT v3 — DEUX branches de sélection :
//   A) Correction / reformulation d'une erreur de l'UTILISATEUR  (prioritaire,
//      TOUS niveaux, y compris A1-B1 : prépositions, articles, faux-amis,
//      accords, temps, collocations).
//   B) Vocabulaire pédagogique de l'AGENT en B2-C1 (comme v2).
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un extracteur pédagogique d'anglais expert (niveau "god mode").
Tu analyses UNE paire de messages (utilisateur + agent) d'une conversation en anglais.

Ta MISSION est de créer des fiches d'apprentissage pour l'utilisateur, dans DEUX cas :

BRANCHE A — CORRECTION DE L'UTILISATEUR (PRIORITAIRE, TOUS NIVEAUX même A1-B1) :
- L'utilisateur a fait une erreur (grammaire, préposition "in/on/at", article, temps,
  collocation, faux-ami, prononciation notée à l'écrit, ordre des mots, accord...).
- L'agent la corrige EXPLICITEMENT ("we say X, not Y") ou IMPLICITEMENT
  (l'agent réutilise la même idée mais avec la forme correcte).
- → Crée une fiche avec front = la forme CORRECTE, et dans "back" mentionne
  clairement l'erreur typique de l'utilisateur (📌 PIÈGE obligatoire ici).
- N'écarte JAMAIS ce cas parce que le mot serait "trivial". Une préposition
  ratée est exactement ce qu'on doit ficher.

BRANCHE B — VOCABULAIRE PÉDAGOGIQUE DE L'AGENT :
- Phrasal verb en contexte ("bring up", "figure out", "for the very first time"...)
- Expression idiomatique / collocation ("it's a no-brainer", "on the fence")
- Vocabulaire B2-C1 employé pédagogiquement
- Structure grammaticale remarquable expliquée ou démontrée

EXCLURE (branche B uniquement) :
- Small talk pur ("That's great!", "How are you?") si aucun apprentissage.
- Répétitions triviales du message user sans apport.

Si rien ne mérite d'être fiché → {"cards": []} (mieux vaut vide que du bruit).
Mais dès qu'il y a la MOINDRE correction visible → sors une fiche (branche A).

RÉPONSE : UNIQUEMENT JSON valide, sans texte autour, sans markdown.
INTERDIT : sauts de ligne réels dans une valeur JSON. Utiliser "\\n".

Schéma :
{
  "cards": [
    {
      "front": "for the very first time",
      "type": "idiom" | "phrasal_verb" | "vocabulary" | "grammar" | "correction",
      "difficulty": "A2" | "B1" | "B2" | "C1" | "C2",
      "source": "user_error" | "agent_teaching",
      "back": "Traduction : ...\\n\\n✅ QUAND L'UTILISER :\\n...\\n\\n🎬 SENS DANS CE CONTEXTE :\\n...\\n\\n💬 EXEMPLES :\\n• phrase EN\\n  🗣 phonétique française\\n  ↳ traduction FR\\n(x3)\\n\\n🔄 ALTERNATIVES / SYNONYMES :\\n...\\n\\n📌 PIÈGE :\\n...",
      "example": "I saw the ocean for the very first time."
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
  const debounceRef = useRef(null);
  const [sessionCreatedCards, setSessionCreatedCards] = useState([]);

  // ── Analyse d'une paire user+agent ────────────────────────────────────────
  const analyzePair = useCallback(async (userMsg, agentMsg, pairIndex) => {
    if (isAnalyzingRef.current) { dlog("skip: analyse déjà en cours"); return; }
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
      if (!newCards.length) { dlog("rejet: toutes les cartes dédoublonnées"); return; }

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
        _type: c.type || "vocabulary",
        _difficulty: c.difficulty || "B2",
        _source: c.source || "agent_teaching",
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
