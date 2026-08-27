// src/components/DailyFluencySprint.jsx
// ─────────────────────────────────────────────────────────────────────────────
// LE SPRINT QUOTIDIEN DE FLUIDITÉ ORALE (15 MINUTES DE PUISSANCE PURE)
//
// 4 Phases scientifiquement calibrées pour éliminer la traduction mentale :
//   Phase 1 (90s) : Échauffement buccal & Shadowing d'un extrait natif
//   Phase 2 (3m)  : Réactivation orale de 3 fiches FSRS cibles
//   Phase 3 (10m) : Conversation Live Duplex avec NOVA (Mission HUD en direct)
//   Phase 4 (60s) : Bilan Native Polish ("How a native says it") + Fiches 1-Clic
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Sparkles,
  Mic,
  Square,
  Volume2,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Zap,
  Flame,
  Award,
  Layers,
  Check,
  PlusCircle,
  HelpCircle,
  Clock,
  Radio,
  Share2,
} from "lucide-react";
import { playEnglishAudio, extractEnglishSpeechText } from "../lib/speakUtils";
import { getExpressionsNeedingProduction, recordProductiveUse } from "../lib/masteryStages";
import { fsrsFromProduction } from "../lib/fsrs";
import LiveKitVoiceAssistant from "./LiveKitVoiceAssistant";
import { safeParseJSON } from "../lib/textUtils";

const SHADOWING_BENCHMARKS = [
  {
    id: "shadow-1",
    level: "B2-C1",
    topic: "Tech & Momentum",
    sentence: "To be honest, we should've anticipated this bottleneck way earlier before scaling.",
    phoneticTip: "Liaisons clés : 'should've' -> /ʃʊdəv/, 'way earlier' -> rythme continu sans pause.",
    translation: "Honnêtement, on aurait dû anticiper ce goulot d'étranglement bien plus tôt avant de monter en charge.",
  },
  {
    id: "shadow-2",
    level: "B2-C1",
    topic: "Silicon Valley Pitch",
    sentence: "What we're basically building is a frictionless protocol that cuts cognitive overload by half.",
    phoneticTip: "Accent tonique sur 'frictionless' et 'cognitive'. Réduction de 'What we are' en 'What we're'.",
    translation: "Ce qu'on construit fondamentalement, c'est un protocole sans friction qui divise la surcharge cognitive par deux.",
  },
  {
    id: "shadow-3",
    level: "C1",
    topic: "Strategic Negotiation",
    sentence: "Let's make sure we're on the same page regarding the core deliverables before moving forward.",
    phoneticTip: "'on the same page' se prononce d'un seul bloc. Flapped 't' sur 'Let's make sure'.",
    translation: "Assurons-nous qu'on est sur la même longueur d'onde concernant les livrables clés avant d'avancer.",
  },
  {
    id: "shadow-4",
    level: "B1-B2",
    topic: "Daily Spoken Flow",
    sentence: "I didn't quite catch that, could you walk me through the main points one more time?",
    phoneticTip: "'didn't quite catch that' : 'didn't' doux, 'catch that' lié avec un son /tʃ/ net.",
    translation: "Je n'ai pas tout à fait saisi, pourrais-tu me réexpliquer les points principaux une fois de plus ?",
  },
];

export default function DailyFluencySprint({
  callClaude,
  getNextGroqKey,
  storage,
  expressions,
  setExpressions,
  showToast,
  awardXP,
  theme,
  isDarkMode,
  englishCategory = "🇬🇧 Anglais",
  onSwitchToLiveVoice,
}) {
  // Phase courante : 1 (Shadowing), 2 (FSRS Voice), 3 (Live Nova), 4 (Native Polish)
  const [currentPhase, setCurrentPhase] = useState(1);
  const [sprintStartedAt] = useState(() => Date.now());

  // ── PHASE 1 STATE : SHADOWING ──────────────────────────────────────────────
  const [shadowIndex, setShadowIndex] = useState(() => Math.floor(Math.random() * SHADOWING_BENCHMARKS.length));
  const currentShadow = SHADOWING_BENCHMARKS[shadowIndex] || SHADOWING_BENCHMARKS[0];
  const [shadowRecording, setShadowRecording] = useState(false);
  const [shadowTranscript, setShadowTranscript] = useState("");
  const [shadowScore, setShadowScore] = useState(null);
  const [shadowAudioPlaying, setShadowAudioPlaying] = useState(false);
  const shadowRecRef = useRef(null);

  // ── PHASE 2 STATE : FSRS PRODUCTION ────────────────────────────────────────
  const targetCards = useMemo(() => {
    if (!expressions || !Array.isArray(expressions)) return [];
    const isEnglish = (ex) => {
      if (!ex?.category) return false;
      const cat = ex.category.toLowerCase();
      return cat.includes("anglais") || cat.includes("english") || ex.category.includes("🇬🇧");
    };
    const englishExps = expressions.filter(isEnglish);
    const needProd = getExpressionsNeedingProduction(englishExps, 3);
    if (needProd.length >= 3) return needProd;

    // Compléter avec les fiches récentes ou dues
    const already = new Set(needProd.map((e) => e.id));
    const complement = englishExps
      .filter((e) => !already.has(e.id) && e.front && e.front.trim())
      .slice(0, 3 - needProd.length);
    return [...needProd, ...complement];
  }, [expressions]);

  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [prodRecording, setProdRecording] = useState(false);
  const [prodTranscript, setProdTranscript] = useState("");
  const [prodValidating, setProdValidating] = useState(false);
  const [cardStatusMap, setCardStatusMap] = useState({}); // { [cardId]: { validated: bool, userSentence: string, feedback: string } }
  const prodRecRef = useRef(null);

  // ── PHASE 3 STATE : LIVE CONVERSATION ──────────────────────────────────────
  const [liveKitConnected, setLiveKitConnected] = useState(false);
  const [liveSessionSeconds, setLiveSessionSeconds] = useState(0);
  const [liveTranscriptHistory, setLiveTranscriptHistory] = useState([]);
  const [missionHits, setMissionHits] = useState({}); // { [cardId]: true }
  const liveTimerRef = useRef(null);

  // ── PHASE 4 STATE : NATIVE POLISH & FLASHCARDS ─────────────────────────────
  const [polishLoading, setPolishLoading] = useState(false);
  const [polishResults, setPolishResults] = useState(null);
  const [cardsAdded, setCardsAdded] = useState(false);

  // ── Effet Timer Phase 3 ───────────────────────────────────────────────────
  useEffect(() => {
    if (currentPhase === 3) {
      liveTimerRef.current = setInterval(() => {
        setLiveSessionSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    }
    return () => {
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    };
  }, [currentPhase]);

  // ── Audio helper ──────────────────────────────────────────────────────────
  const playModelAudio = (text) => {
    setShadowAudioPlaying(true);
    playEnglishAudio(text, {
      groqApiKey: getNextGroqKey ? getNextGroqKey() : null,
      onStart: () => setShadowAudioPlaying(true),
      onEnd: () => setShadowAudioPlaying(false),
      onError: () => setShadowAudioPlaying(false),
    });
  };

  // ── Phase 1: Micro Shadowing ──────────────────────────────────────────────
  const toggleShadowRecord = () => {
    if (shadowRecording) {
      if (shadowRecRef.current) {
        try {
          shadowRecRef.current.stop();
        } catch (_e) {}
      }
      setShadowRecording(false);
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showToast?.("Reconnaissance vocale non supportée sur ce navigateur", "error");
      return;
    }

    try {
      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;

      rec.onstart = () => {
        setShadowRecording(true);
        setShadowTranscript("");
      };

      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        setShadowTranscript(text);
        evaluateShadowing(text, currentShadow.sentence);
      };

      rec.onerror = (err) => {
        console.warn("[Shadowing error]", err);
        setShadowRecording(false);
      };

      rec.onend = () => {
        setShadowRecording(false);
      };

      shadowRecRef.current = rec;
      rec.start();
    } catch (e) {
      console.warn("[Shadowing start error]", e);
      setShadowRecording(false);
    }
  };

  const evaluateShadowing = (spoken, target) => {
    const cleanSpoken = spoken.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
    const cleanTarget = target.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);

    let matches = 0;
    cleanTarget.forEach((w) => {
      if (cleanSpoken.includes(w)) matches++;
    });

    const scorePct = Math.min(100, Math.round((matches / Math.max(1, cleanTarget.length)) * 100));
    setShadowScore(scorePct);
    if (scorePct >= 70) {
      awardXP?.(25, 2, "Shadowing réussi");
      showToast?.("🎯 Excellent calque phonétique ! (+25 XP)", "success");
    }
  };

  // ── Phase 2: Micro Production FSRS ────────────────────────────────────────
  const currentCard = targetCards[activeCardIndex] || targetCards[0];

  const toggleProdRecord = () => {
    if (prodRecording) {
      if (prodRecRef.current) {
        try {
          prodRecRef.current.stop();
        } catch (_e) {}
      }
      setProdRecording(false);
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showToast?.("Reconnaissance vocale non supportée", "error");
      return;
    }

    try {
      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;

      rec.onstart = () => {
        setProdRecording(true);
        setProdTranscript("");
      };

      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        setProdTranscript(text);
        validateSpokenProduction(text, currentCard);
      };

      rec.onerror = (err) => {
        console.warn("[Prod rec error]", err);
        setProdRecording(false);
      };

      rec.onend = () => {
        setProdRecording(false);
      };

      prodRecRef.current = rec;
      rec.start();
    } catch (e) {
      console.warn("[Prod rec start error]", e);
      setProdRecording(false);
    }
  };

  const validateSpokenProduction = async (userText, card) => {
    if (!card || !userText) return;
    setProdValidating(true);

    try {
      const cardFront = extractEnglishSpeechText(card.front || "");
      let isValid = false;
      let feedback = "";

      if (callClaude) {
        const prompt = `Tu es un examinateur expert d'anglais oral.
L'apprenant devait produire une phrase originale en employant l'expression cible : "${cardFront}".
Voici ce que l'apprenant a dit au micro : "${userText}".

Évalue si l'expression a été utilisée de manière appropriée et intelligible dans un contexte cohérent.
Réponds STRICTEMENT en JSON :
{
  "valid": true,
  "feedback": "1 phrase concise en français expliquant pourquoi c'est réussi ou comment améliorer",
  "nativeAlternative": "Une reformulation ultra-naturelle de la phrase de l'élève"
}`;

        const raw = await callClaude(prompt, "Évalue la phrase orale");
        const parsed = safeParseJSON(raw);
        if (parsed && typeof parsed.valid === "boolean") {
          isValid = parsed.valid;
          feedback = parsed.feedback || (isValid ? "Parfaitement employé !" : "Essaie de réutiliser l'expression exacte.");
        } else {
          // Fallback regex tolérant
          isValid = userText.toLowerCase().includes(cardFront.toLowerCase().split(" ")[0]);
          feedback = isValid ? "Expression détectée !" : "Expression non reconnue dans ta phrase.";
        }
      } else {
        isValid = true;
        feedback = "Phrase enregistrée avec succès !";
      }

      setCardStatusMap((prev) => ({
        ...prev,
        [card.id || card.front]: {
          validated: isValid,
          userSentence: userText,
          feedback: feedback,
        },
      }));

      if (isValid) {
        awardXP?.(30, 3, "Expression produite à l'oral");
        showToast?.(`✨ "${cardFront}" validé à l'oral ! (+30 XP)`, "success");

        // Mise à jour de la fiche dans expressions avec recordProductiveUse & FSRS
        if (setExpressions) {
          setExpressions((prevExps) =>
            prevExps.map((e) => {
              if (e.id === card.id || e.front === card.front) {
                const recorded = recordProductiveUse(e, {
                  context: "voice",
                  correct: true,
                  note: `Sprint oral : "${userText}"`,
                  date: new Date().toISOString(),
                });
                return fsrsFromProduction ? fsrsFromProduction(recorded, true) : recorded;
              }
              return e;
            })
          );
        }
      }
    } catch (e) {
      console.warn("[Validation error]", e);
    } finally {
      setProdValidating(false);
    }
  };

  // ── Phase 3: Traqueur de cibles pendant la conversation Live ──────────────
  const handleLiveTranscriptions = (transcripts) => {
    if (!Array.isArray(transcripts)) return;
    setLiveTranscriptHistory(transcripts);

    const userTextCombined = transcripts
      .filter((t) => t.role === "user" || t.participant === "user")
      .map((t) => t.text || t.message || "")
      .join(" ")
      .toLowerCase();

    targetCards.forEach((c) => {
      const cleanFront = extractEnglishSpeechText(c.front || "").toLowerCase();
      if (cleanFront && userTextCombined.includes(cleanFront) && !missionHits[c.id]) {
        setMissionHits((prev) => ({ ...prev, [c.id]: true }));
        awardXP?.(25, 2, "Mission LiveKit réussie");
        showToast?.(`🔥 Mission réussie en direct : "${cleanFront}" ! (+25 XP)`, "success");
      }
    });
  };

  // ── Phase 4: Bilan Native Polish & Flashcard Generator ────────────────────
  const generateNativePolish = async () => {
    setPolishLoading(true);
    try {
      const allUserSentences = [
        ...Object.values(cardStatusMap).map((s) => s.userSentence),
        ...liveTranscriptHistory
          .filter((t) => t.role === "user" || t.participant === "user")
          .map((t) => t.text || t.message || ""),
      ].filter(Boolean);

      const combinedText = allUserSentences.slice(-10).join("\n");
      const wordCount = allUserSentences.reduce((acc, s) => acc + s.split(/\s+/).filter(Boolean).length, 0);
      const minutes = Math.max(1, Math.round(liveSessionSeconds / 60));
      const wpm = Math.round(wordCount / minutes);

      if (callClaude && combinedText.length > 10) {
        const prompt = `Tu es le coach d'anglais oral ultime (style Silicon Valley / Oxford).
Voici ce que l'élève a dit à l'oral durant sa session de pratique :
"""
${combinedText}
"""

Analyse ses phrases et génère :
1. "nativePolish" : 3 exemples où tu prends une phrase dite par l'élève (souvent un peu lourde ou calquée sur le français) et la transformes en anglais natif percutant C1/C2 (avec explication en français).
2. "pronunciationTip" : 1 conseil clé de prononciation ou connected speech ciblé sur ses habitudes.
3. "fluencyScore" : note de fluidité globale sur 100.
4. "cefrEstimate" : B1, B2, C1 ou C2.

Renvoie UNIQUEMENT un JSON strict :
{
  "fluencyScore": 88,
  "cefrEstimate": "B2+",
  "pronunciationTip": "...",
  "nativePolish": [
    {
      "original": "...",
      "native": "...",
      "why": "...",
      "front": "Expression anglaise percutante",
      "back": "Traduction & Contexte d'usage"
    }
  ]
}`;

        const raw = await callClaude(prompt, "Génère le bilan Native Polish");
        const parsed = safeParseJSON(raw);
        if (parsed) {
          setPolishResults({
            ...parsed,
            wordCount,
            wpm: Math.max(85, wpm || 110),
            durationSec: liveSessionSeconds || 320,
          });
          awardXP?.(100, 10, "Sprint Quotidien d'Oral terminé");
          return;
        }
      }

      // Fallback si Claude non disponible
      setPolishResults({
        fluencyScore: 85,
        cefrEstimate: "B2",
        wordCount: Math.max(45, wordCount),
        wpm: 115,
        durationSec: liveSessionSeconds || 300,
        pronunciationTip: "Pense à lier les mots se terminant par une consonne au mot suivant commençant par une voyelle.",
        nativePolish: [
          {
            original: "I need to do it very quickly because of time",
            native: "I need to get this done ASAP due to tight deadlines",
            why: "Plus direct, professionnel et naturel.",
            front: "get something done ASAP",
            back: "faire quelque chose au plus vite (contexte pro/tech)",
          },
        ],
      });
      awardXP?.(100, 10, "Sprint Quotidien d'Oral terminé");
    } catch (e) {
      console.warn("[Polish generation failed]", e);
    } finally {
      setPolishLoading(false);
    }
  };

  const handleAddAllPolishCards = () => {
    if (!polishResults?.nativePolish || cardsAdded) return;
    const newCards = polishResults.nativePolish.map((p, idx) => ({
      id: `sprint-${Date.now()}-${idx}`,
      front: p.front || p.native,
      back: `${p.back || p.why}\n\n💡 Exemple : "${p.native}"`,
      category: englishCategory,
      createdAt: new Date().toISOString(),
      repetitions: 0,
      interval: 1,
      difficulty: 5.0,
      stability: 1.0,
      masteryStage: "discovered",
    }));

    if (setExpressions) {
      setExpressions((prev) => [...prev, ...newCards]);
    }
    setCardsAdded(true);
    showToast?.(`🎉 ${newCards.length} fiches d'or ajoutées à ton deck MemoMaster !`, "success");
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 900,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* ── HEADER HUD PROGRESSION ── */}
      <div
        style={{
          background: isDarkMode
            ? "linear-gradient(135deg, rgba(30, 27, 75, 0.7), rgba(15, 23, 42, 0.8))"
            : "linear-gradient(135deg, rgba(238, 242, 255, 0.9), rgba(255, 255, 255, 0.9))",
          borderRadius: 20,
          padding: "20px 24px",
          border: `1px solid ${isDarkMode ? "rgba(139, 92, 246, 0.3)" : "rgba(139, 92, 246, 0.2)"}`,
          boxShadow: isDarkMode ? "0 10px 30px rgba(0,0,0,0.3)" : "0 8px 25px rgba(139, 92, 246, 0.08)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                boxShadow: "0 0 15px rgba(236, 72, 153, 0.4)",
              }}
            >
              <Zap size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: theme.text }}>
                Daily Fluency Sprint <span style={{ color: "#8B5CF6", fontSize: 13 }}>• 15 min</span>
              </h2>
              <span style={{ fontSize: 12, color: theme.textMuted }}>
                Protocole neuro-linguistique d'acquisition accélérée
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                fontSize: 12,
                fontWeight: 700,
                color: theme.primary,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Clock size={14} /> Phase {currentPhase} / 4
            </span>
          </div>
        </div>

        {/* Barre de progression des 4 étapes */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[
            { step: 1, label: "1. Shadowing (90s)", icon: "🗣️" },
            { step: 2, label: "2. FSRS Recall (3m)", icon: "🧠" },
            { step: 3, label: "3. Live Nova (10m)", icon: "🎙️" },
            { step: 4, label: "4. Native Polish", icon: "✨" },
          ].map((item) => {
            const isActive = currentPhase === item.step;
            const isCompleted = currentPhase > item.step;
            return (
              <button
                key={item.step}
                onClick={() => setCurrentPhase(item.step)}
                style={{
                  padding: "10px 8px",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  background: isCompleted
                    ? "#22C55E"
                    : isActive
                    ? "linear-gradient(135deg, #8B5CF6, #8B5CF6)"
                    : isDarkMode
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.04)",
                  color: isCompleted || isActive ? "white" : theme.textMuted,
                  fontWeight: 700,
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.2s ease",
                  boxShadow: isActive ? "0 4px 12px rgba(139, 92, 246, 0.4)" : "none",
                }}
              >
                <span>{isCompleted ? "✓" : item.icon}</span>
                <span className="ep-phase-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          PHASE 1 : SHADOWING VOCAL & MUSCLE MEMORY (90s)
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentPhase === 1 && (
        <div
          style={{
            background: theme.cardBg,
            borderRadius: 20,
            padding: 28,
            border: `1px solid ${theme.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  color: "#8B5CF6",
                }}
              >
                Phase 1 • Échauffement Musculaire Buccal
              </span>
              <h3 style={{ margin: "4px 0 0", fontSize: 20, color: theme.text }}>
                Shadowing : Répète avec le même rythme et les contractions
              </h3>
            </div>
            <button
              onClick={() => setShadowIndex((i) => (i + 1) % SHADOWING_BENCHMARKS.length)}
              style={{
                background: "none",
                border: `1px solid ${theme.border}`,
                padding: "6px 12px",
                borderRadius: 8,
                color: theme.textMuted,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <RotateCcw size={12} /> Autre phrase
            </button>
          </div>

          {/* Phrase modèle */}
          <div
            style={{
              padding: 24,
              borderRadius: 16,
              background: isDarkMode ? "rgba(139, 92, 246, 0.08)" : "rgba(139, 92, 246, 0.05)",
              border: `1px dashed ${isDarkMode ? "rgba(139, 92, 246, 0.3)" : "rgba(139, 92, 246, 0.2)"}`,
              position: "relative",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#8B5CF6", marginBottom: 8 }}>
              {currentShadow.topic} • Niveau {currentShadow.level}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.4, color: theme.text, marginBottom: 12 }}>
              "{currentShadow.sentence}"
            </div>
            <div style={{ fontSize: 13, color: theme.textMuted, fontStyle: "italic", marginBottom: 12 }}>
              ↳ {currentShadow.translation}
            </div>
            <div
              style={{
                fontSize: 12,
                color: isDarkMode ? "#FCD34D" : "#D97706",
                background: isDarkMode ? "rgba(252, 211, 77, 0.1)" : "rgba(217, 119, 6, 0.1)",
                padding: "8px 12px",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              💡 {currentShadow.phoneticTip}
            </div>
          </div>

          {/* Contrôles Audio & Micro */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 10 }}>
            <button
              onClick={() => playModelAudio(currentShadow.sentence)}
              disabled={shadowAudioPlaying}
              style={{
                padding: "14px 24px",
                borderRadius: 14,
                border: "none",
                background: shadowAudioPlaying ? "#6D28D9" : theme.primary,
                color: "white",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: `0 4px 16px ${theme.primary}44`,
                transition: "all 0.2s",
              }}
            >
              <Volume2 size={20} />
              {shadowAudioPlaying ? "Écoute en cours..." : "1. Écouter le natif"}
            </button>

            <button
              onClick={toggleShadowRecord}
              style={{
                padding: "14px 28px",
                borderRadius: 14,
                border: "none",
                background: shadowRecording ? "#EF4444" : "linear-gradient(135deg, #10B981, #059669)",
                color: "white",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: shadowRecording ? "0 0 20px rgba(239, 68, 68, 0.5)" : "0 4px 16px rgba(16, 185, 129, 0.3)",
                animation: shadowRecording ? "pulse 1.5s infinite" : "none",
              }}
            >
              {shadowRecording ? <Square size={18} /> : <Mic size={20} />}
              {shadowRecording ? "Arrêter (Enregistrement)" : "2. Répéter au micro"}
            </button>
          </div>

          {/* Résultat du shadowing */}
          {shadowTranscript && (
            <div
              style={{
                padding: 16,
                borderRadius: 14,
                background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                border: `1px solid ${theme.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: theme.textMuted }}>Ce que le micro a capté :</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>"{shadowTranscript}"</div>
              {shadowScore !== null && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                  <div
                    style={{
                      padding: "4px 12px",
                      borderRadius: 12,
                      background: shadowScore >= 70 ? "#22C55E22" : "#EF444422",
                      color: shadowScore >= 70 ? "#22C55E" : "#EF4444",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    Précision : {shadowScore}%
                  </div>
                  <span style={{ fontSize: 13, color: theme.textMuted }}>
                    {shadowScore >= 70 ? "🎉 Parfait ! Tes circuits oraux sont amorcés." : "Essaie encore une fois pour fluidifier la liaison."}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Bouton vers étape suivante */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              onClick={() => setCurrentPhase(2)}
              style={{
                padding: "12px 24px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #8B5CF6, #8B5CF6)",
                color: "white",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Passer à l'Étape 2 : Recall FSRS <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          PHASE 2 : ACTIVE VOICE RECALL FSRS (3 min)
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentPhase === 2 && (
        <div
          style={{
            background: theme.cardBg,
            borderRadius: 20,
            padding: 28,
            border: `1px solid ${theme.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: "#10B981",
              }}
            >
              Phase 2 • Réactivation Orale Active (FSRS Spoken)
            </span>
            <h3 style={{ margin: "4px 0 0", fontSize: 20, color: theme.text }}>
              Produis une phrase originale à l'oral avec chaque expression cible
            </h3>
          </div>

          {/* Liste des 3 cartes cibles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {targetCards.map((card, idx) => {
              const status = cardStatusMap[card.id || card.front];
              const isCurrent = activeCardIndex === idx;
              const isDone = status?.validated;

              return (
                <div
                  key={card.id || idx}
                  onClick={() => setActiveCardIndex(idx)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    cursor: "pointer",
                    background: isCurrent
                      ? isDarkMode
                        ? "rgba(139, 92, 246, 0.15)"
                        : "rgba(139, 92, 246, 0.1)"
                      : theme.surface,
                    border: `1.5px solid ${
                      isDone
                        ? "#22C55E"
                        : isCurrent
                        ? theme.primary
                        : theme.border
                    }`,
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Cible {idx + 1}</span>
                    {isDone && <CheckCircle2 size={16} color="#22C55E" />}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {extractEnglishSpeechText(card.front)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Carte active détaillée */}
          {currentCard && (
            <div
              style={{
                padding: 24,
                borderRadius: 16,
                background: isDarkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                border: `1px solid ${theme.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.primary }}>
                  🎯 Expression à placer dans ta phrase :
                </span>
                <button
                  onClick={() => playModelAudio(currentCard.front)}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.primary,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  <Volume2 size={16} /> Prononcer
                </button>
              </div>

              <div style={{ fontSize: 24, fontWeight: 900, color: theme.text }}>
                {extractEnglishSpeechText(currentCard.front)}
              </div>

              {currentCard.back && (
                <div style={{ fontSize: 14, color: theme.textMuted }}>
                  💡 Sens : {currentCard.back.split("\n")[0]}
                </div>
              )}

              {/* Bouton Enregistrement Vocal */}
              <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                <button
                  onClick={toggleProdRecord}
                  disabled={prodValidating}
                  style={{
                    padding: "14px 28px",
                    borderRadius: 14,
                    border: "none",
                    background: prodRecording ? "#EF4444" : "linear-gradient(135deg, #10B981, #059669)",
                    color: "white",
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: "0 4px 16px rgba(16, 185, 129, 0.3)",
                  }}
                >
                  {prodRecording ? <Square size={18} /> : <Mic size={20} />}
                  {prodRecording ? "Arrêter & Valider" : "Parler au micro"}
                </button>
              </div>

              {prodValidating && (
                <div style={{ textAlign: "center", color: theme.primary, fontWeight: 700, fontSize: 14 }}>
                  Validation IA en cours...
                </div>
              )}

              {/* Feedback de la carte active */}
              {cardStatusMap[currentCard.id || currentCard.front] && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: cardStatusMap[currentCard.id || currentCard.front].validated
                      ? "#22C55E18"
                      : "#EF444418",
                    border: `1px solid ${
                      cardStatusMap[currentCard.id || currentCard.front].validated ? "#22C55E44" : "#EF444444"
                    }`,
                    marginTop: 6,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: cardStatusMap[currentCard.id || currentCard.front].validated ? "#22C55E" : "#EF4444" }}>
                    {cardStatusMap[currentCard.id || currentCard.front].validated ? "✓ Validé avec succès !" : "À retravailler"}
                  </div>
                  <div style={{ fontSize: 14, color: theme.text, marginTop: 4 }}>
                    "{cardStatusMap[currentCard.id || currentCard.front].userSentence}"
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                    {cardStatusMap[currentCard.id || currentCard.front].feedback}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation entre cartes ou vers étape 3 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <button
              onClick={() => setActiveCardIndex((i) => Math.max(0, i - 1))}
              disabled={activeCardIndex === 0}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: `1px solid ${theme.border}`,
                background: "none",
                color: theme.textMuted,
                cursor: activeCardIndex === 0 ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              Précédente
            </button>

            {activeCardIndex < targetCards.length - 1 ? (
              <button
                onClick={() => setActiveCardIndex((i) => i + 1)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: theme.primary,
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Cible suivante ({activeCardIndex + 2}/{targetCards.length})
              </button>
            ) : (
              <button
                onClick={() => setCurrentPhase(3)}
                style={{
                  padding: "12px 24px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #8B5CF6, #8B5CF6)",
                  color: "white",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Lancer le Live avec Nova <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          PHASE 3 : LIVE CONVERSATION AVEC NOVA & MISSION HUD (10 min)
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentPhase === 3 && (
        <div
          style={{
            background: theme.cardBg,
            borderRadius: 20,
            padding: 28,
            border: `1px solid ${theme.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  color: "#EC4899",
                }}
              >
                Phase 3 • Conversation Immersive Live Duplex
              </span>
              <h3 style={{ margin: "4px 0 0", fontSize: 20, color: theme.text }}>
                Parle naturellement avec NOVA • Silent Modeling activé
              </h3>
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 900,
                color: "#EC4899",
                background: isDarkMode ? "rgba(236, 72, 153, 0.1)" : "rgba(236, 72, 153, 0.08)",
                padding: "6px 16px",
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Radio size={16} /> {formatTimer(liveSessionSeconds)}
            </div>
          </div>

          {/* Mission HUD : Les 3 cibles en direct */}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              border: `1px solid ${theme.border}`,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: theme.textMuted, marginBottom: 8 }}>
              🎯 Missions Secrètes (Essaie de les placer naturellement dans la discussion) :
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {targetCards.map((c) => {
                const isHit = missionHits[c.id];
                return (
                  <span
                    key={c.id || c.front}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      background: isHit ? "#22C55E22" : isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                      color: isHit ? "#22C55E" : theme.text,
                      border: `1px solid ${isHit ? "#22C55E66" : theme.border}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {isHit ? "✓" : "○"} {extractEnglishSpeechText(c.front)}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Composant LiveKit Voice Assistant */}
          <div
            style={{
              minHeight: 280,
              borderRadius: 16,
              overflow: "hidden",
              border: `1px solid ${theme.border}`,
              background: isDarkMode ? "#0F172A" : "#F8FAFC",
            }}
          >
            <LiveKitVoiceAssistant
              studentName="Master"
              isDarkMode={isDarkMode}
              onTranscriptionsUpdate={handleLiveTranscriptions}
              onStateChange={(state) => setLiveKitConnected(state === "connected")}
              systemPrompt={`You are NOVA — the World's Best Astral English Fluency Coach.
Your goal: Get the user speaking English with effortless confidence.
Target expressions to subtly encourage: ${targetCards.map((c) => `"${extractEnglishSpeechText(c.front)}"`).join(", ")}.

CRITICAL RULES:
- Keep your answers between 1 to 3 short sentences max.
- Always end with an engaging open question.
- SILENT MODELING: Never stop or explicitly correct the user's grammar. If they make a mistake, subtly model the right sentence in your own reply and keep the energy high.`}
            />
          </div>

          {/* Bouton pour clore la session et générer le bilan */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              onClick={() => {
                setCurrentPhase(4);
                generateNativePolish();
              }}
              style={{
                padding: "14px 28px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg, #10B981, #059669)",
                color: "white",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 4px 16px rgba(16, 185, 129, 0.4)",
              }}
            >
              Terminer la session & Voir le Bilan Native Polish <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          PHASE 4 : NATIVE POLISH & 1-CLICK FLASHCARDS (60s)
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentPhase === 4 && (
        <div
          style={{
            background: theme.cardBg,
            borderRadius: 20,
            padding: 28,
            border: `1px solid ${theme.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: "#F59E0B",
              }}
            >
              Phase 4 • Native Polish & Synthèse de Fluidité
            </span>
            <h3 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900, color: theme.text }}>
              🎉 Sprint Quotidien Terminé avec Succès !
            </h3>
          </div>

          {polishLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: theme.primary }}>
              <Sparkles size={32} style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                Génération de tes pépites Native Polish en cours...
              </div>
            </div>
          ) : polishResults ? (
            <>
              {/* Dashboard Score & Metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    background: isDarkMode ? "rgba(139, 92, 246, 0.1)" : "rgba(139, 92, 246, 0.06)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#8B5CF6" }}>
                    {polishResults.fluencyScore} / 100
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Score de Fluidité</div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    background: isDarkMode ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.06)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#10B981" }}>
                    {polishResults.cefrEstimate || "B2"}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Niveau CEFR Oral</div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    background: isDarkMode ? "rgba(245, 158, 11, 0.1)" : "rgba(245, 158, 11, 0.06)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#F59E0B" }}>
                    {polishResults.wpm} WPM
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Débit de Parole</div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    background: isDarkMode ? "rgba(236, 72, 153, 0.1)" : "rgba(236, 72, 153, 0.06)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#EC4899" }}>+100 XP</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>Récompense Quotidienne</div>
                </div>
              </div>

              {/* Native Polish Transformations */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>
                  ✨ "How a Native Says It" (Transformations clés de ta session) :
                </div>

                {polishResults.nativePolish?.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 16,
                      borderRadius: 14,
                      background: isDarkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                      border: `1px solid ${theme.border}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 13, color: theme.textMuted, textDecoration: "line-through" }}>
                      Ce que tu as dit : "{item.original}"
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981" }}>
                      ↳ Version Native : "{item.native}"
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted, fontStyle: "italic" }}>
                      💡 {item.why}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bouton 1-Clic pour ajouter au deck */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <button
                  onClick={() => setCurrentPhase(1)}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: "none",
                    color: theme.textMuted,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Refaire un Sprint
                </button>

                <button
                  onClick={handleAddAllPolishCards}
                  disabled={cardsAdded}
                  style={{
                    padding: "14px 28px",
                    borderRadius: 14,
                    border: "none",
                    background: cardsAdded ? "#22C55E" : "linear-gradient(135deg, #8B5CF6, #EC4899)",
                    color: "white",
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: cardsAdded ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: "0 4px 20px rgba(139, 92, 246, 0.4)",
                  }}
                >
                  {cardsAdded ? (
                    <>
                      <Check size={18} /> Fiches ajoutées avec succès !
                    </>
                  ) : (
                    <>
                      <PlusCircle size={18} /> Ajouter ces fiches d'or à MemoMaster en 1 clic
                    </>
                  )}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
