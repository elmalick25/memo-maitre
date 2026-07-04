// useAgentCardDetector.js — v2 (2026-07-03)
// ─────────────────────────────────────────────────────────────────────────────
// Détecte les expressions à mémoriser dans une conversation avec l'agent
// ElevenLabs et crée des fiches MemoMaster enrichies.
//
// 🆕 v2 : CRÉATION 100% SILENCIEUSE
//   • Plus de toast pendant la conversation — les fiches sont ajoutées
//     directement à MemoMaster.
//   • L'utilisateur les découvre en sortant de la session, dans "Fiches".
//   • Un compteur `sessionCreatedCards` est exposé pour afficher un petit
//     récap "N fiches créées pendant la session" APRES la conversation.
//
// 🆕 v2 : format de fiche aligné à 100% sur le template du chat IA
//   (Traduction / ✅ QUAND L'UTILISER / 🎬 SENS / 💬 EXEMPLES avec
//    phonétique française / 🔄 ALTERNATIVES / 📌 PIÈGE).
//
// USAGE (inchangé côté appelant) :
//   const {
//     pendingCards,           // toujours [] — conservé pour compat API
//     confirmCard,            // no-op — conservé pour compat API
//     dismissCard,            // no-op — conservé pour compat API
//     clearPending,           // reset du compteur session
//     sessionCreatedCards,    // 🆕 fiches créées silencieusement pendant la session
//   } = useAgentCardDetector({ ... });
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback, useState } from "react";

const MIN_AGENT_WORDS = 8;
const MIN_USER_WORDS = 1;
const DEBOUNCE_MS = 900;

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
// Prompt système — template EXACT (aligné sur la capture d'écran fournie) :
//   Traduction : ...
//   ✅ QUAND L'UTILISER :
//   🎬 SENS DANS CE CONTEXTE :
//   💬 EXEMPLES :   (3 phrases EN → phonétique FR → traduction)
//   🔄 ALTERNATIVES / SYNONYMES :
//   📌 PIÈGE :      (facultatif — seulement si pertinent)
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un extracteur pédagogique d'anglais expert (niveau "god mode").
Tu analyses UNE paire de messages (utilisateur + agent) d'une conversation en anglais.
Tu dois détecter si l'agent a introduit, utilisé ou corrigé une expression qui mérite d'être mémorisée.

CRITÈRES DE SÉLECTION (sévères — mieux vaut rien retourner que du bruit) :
- Phrasal verb en contexte ("bring up", "figure out", "for the very first time"...)
- Expression idiomatique / collocation ("it's a no-brainer", "on the fence")
- Correction grammaticale ou lexicale explicite
- Vocabulaire B2-C1 employé pédagogiquement
- Structure grammaticale remarquable expliquée ou démontrée

EXCLURE :
- Small talk ("That's great!", "How are you?")
- Vocabulaire A1-B1 trivial
- Répétitions du message user
- Si rien ne vaut la peine → {"cards": []}

RÉPONSE : UNIQUEMENT JSON valide, sans texte autour, sans markdown.
INTERDIT : sauts de ligne réels dans une valeur JSON. Utiliser "\\n".

Schéma :
{
  "cards": [
    {
      "front": "for the very first time",
      "type": "idiom" | "phrasal_verb" | "vocabulary" | "grammar" | "correction",
      "difficulty": "B1" | "B2" | "C1" | "C2",
      "back": "Traduction : pour la toute première fois\\n\\n✅ QUAND L'UTILISER :\\nUtilise cette expression pour insister fortement sur le fait qu'une action ou un événement se produit pour l'absolue première fois de ta vie ou de l'histoire.\\n\\n🎬 SENS DANS CE CONTEXTE :\\nL'ajout de \\"very\\" renforce l'importance, l'émotion ou le caractère exceptionnel de cette première expérience.\\n\\n💬 EXEMPLES :\\n• I saw the ocean for the very first time.\\n  🗣 aï so zi ochane for ze véry feurst taïm\\n  ↳ J'ai vu l'océan pour la toute première fois.\\n\\n• She is traveling abroad for the very first time.\\n  🗣 chi iz travline abrode for ze véry feurst taïm\\n  ↳ Elle voyage à l'étranger pour la toute première fois.\\n\\n• They met each other for the very first time.\\n  🗣 zé mète itch ozeur for ze véry feurst taïm\\n  ↳ Ils se sont rencontrés pour la toute première fois.\\n\\n🔄 ALTERNATIVES / SYNONYMES :\\nfor the first time, initially",
      "example": "I saw the ocean for the very first time."
    }
  ]
}

RÈGLES DE FORMAT du champ "back" (impératif — respecte l'ordre et les emojis) :
1. Première ligne : "Traduction : <traduction française littérale>"
2. Ligne vide
3. "✅ QUAND L'UTILISER :" + explication en 1-2 phrases françaises
4. "🎬 SENS DANS CE CONTEXTE :" + nuance/registre en 1 phrase française
5. "💬 EXEMPLES :" + EXACTEMENT 3 exemples au format :
     • <phrase EN>
       🗣 <phonétique française "maison" — jamais d'IPA — que des sons FR>
       ↳ <traduction française>
6. "🔄 ALTERNATIVES / SYNONYMES :" + liste plate séparée par des virgules
7. (Facultatif) "📌 PIÈGE :" + 1 phrase française sur l'erreur classique à éviter

La phonétique doit être LISIBLE par un francophone qui ne connaît PAS l'IPA.
Exemples : "the" → "ze", "think" → "sinke", "very" → "véry", "first" → "feurst".`;

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
    if (isAnalyzingRef.current) return;
    if (!callClaude) return;

    const agentWords = agentMsg.trim().split(/\s+/).length;
    const userWords = userMsg.trim().split(/\s+/).length;
    if (agentWords < MIN_AGENT_WORDS || userWords < MIN_USER_WORDS) return;

    isAnalyzingRef.current = true;
    try {
      const userPrompt = `UTILISATEUR: "${userMsg}"\n\nAGENT: "${agentMsg}"`;
      const raw = await callClaude(SYSTEM_PROMPT, userPrompt, {
        maxTokens: 900,
        grounding: false,
      });

      const rawText = typeof raw === "string" ? raw : (raw?.text || "");
      let parsed = null;
      if (safeParseJSON) {
        try { parsed = safeParseJSON(rawText); } catch (_) {}
      }
      if (!parsed) parsed = robustJsonParse(rawText);
      if (!parsed?.cards?.length) return;

      // Dédoublonnage contre l'existant
      const existingFronts = new Set(
        expressions.map(e => (e.front || "").toLowerCase().trim()).filter(Boolean)
      );
      const newCards = parsed.cards.filter(c => {
        const f = (c.front || "").toLowerCase().trim();
        if (!f) return false;
        if (existingFronts.has(f)) return false;
        // Fuzzy : rejette si une fiche existante inclut/est incluse
        for (const ex of existingFronts) {
          if (ex.length > 3 && (ex.includes(f) || f.includes(ex))) return false;
        }
        return true;
      });
      if (!newCards.length) return;

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
        _pairIndex: pairIndex,
      }));

      // 🆕 AUTO-SAVE SILENCIEUX — pas de toast, pas de confirmation.
      setExpressions(prev => {
        const seen = new Set(prev.map(e => (e.front || "").toLowerCase().trim()));
        const toAdd = enriched.filter(c => !seen.has(c.front.toLowerCase().trim()));
        if (!toAdd.length) return prev;
        // Log léger côté console pour debug
        try { console.info(`[AgentCardDetector] +${toAdd.length} fiche(s) silencieuse(s)`); } catch {}
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
  }, []);

  return {
    pendingCards,
    confirmCard,
    dismissCard,
    clearPending,
    sessionCreatedCards,
  };
}
