import { useState, useMemo, useCallback, useEffect } from "react";
import { today as localToday } from "../utils/dateUtils";
import { safeParseJSON } from "../lib/jsonRepair";
import { playEnglishAudio, stopEnglishAudio } from "../lib/speakUtils";
export default function useWritingLab({ expressions, englishCategoryFilter, getNextGroqKey, storage, callClaude, showToast }) {
  const [practiceWritingText, setPracticeWritingText] = useState("");
  const [practiceWritingFeedback, setPracticeWritingFeedback] = useState(null);
  const [writingWordGoal, setWritingWordGoal] = useState(200);
  const [isReportExpanded, setIsReportExpanded] = useState(true);
  const [ieltsActiveTab, setIeltsActiveTab] = useState("overview");
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);
  const [showWritingTip, setShowWritingTip] = useState(false);
  const [showWritingHistory, setShowWritingHistory] = useState(false);
  const [writingHistory, setWritingHistory] = useState([]);
  const [practiceWritingLoading, setPracticeWritingLoading] = useState(false);
  const [practiceWritingPrompt, setPracticeWritingPrompt] = useState("");
  const [practiceWritingDrafts, setPracticeWritingDrafts] = useState([]);
  const [practiceWritingActiveId, setPracticeWritingActiveId] = useState(null);
  const [writingTabMode, setWritingTabMode] = useState("editor"); // "editor" | "history"
  const [draftSearchQuery, setDraftSearchQuery] = useState("");

  const filteredDrafts = useMemo(() => {
    if (!draftSearchQuery || !draftSearchQuery.trim()) return practiceWritingDrafts;
    const q = draftSearchQuery.toLowerCase().trim();
    return practiceWritingDrafts.filter(d =>
      (d.prompt && d.prompt.toLowerCase().includes(q)) ||
      (d.text && d.text.toLowerCase().includes(q)) ||
      (d.feedback?.overallComment && d.feedback.overallComment.toLowerCase().includes(q))
    );
  }, [practiceWritingDrafts, draftSearchQuery]);

  const getBandScoreColor = useCallback((score) => {
    const num = parseFloat(score);
    if (isNaN(num)) return "var(--mm-primary)";
    if (num >= 7) return "var(--mm-success)";
    if (num >= 5.5) return "var(--mm-warning)";
    return "var(--mm-danger)";
  }, []);

  const [copiedDraftId, setCopiedDraftId] = useState(null);
  const [generatingCorrectedId, setGeneratingCorrectedId] = useState(null);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [expandedDraftIds, setExpandedDraftIds] = useState({});
  const [expandedMistakeIdxs, setExpandedMistakeIdxs] = useState({});

  const toggleDraftExpand = useCallback((draftId) => {
    setExpandedDraftIds(prev => ({
      ...prev,
      [draftId]: !prev[draftId]
    }));
  }, []);

  const toggleMistakeExpand = useCallback((idx) => {
    setExpandedMistakeIdxs(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  }, []);

  // Expressions révisées aujourd'hui pour réutilisation active dans le Writing Lab
  const [showReviewedDrawer, setShowReviewedDrawer] = useState(false);
  const todayDateStr = localToday();

  const { todayReviewedExpressions, hasTodayReviews } = useMemo(() => {
    if (!Array.isArray(expressions)) return { todayReviewedExpressions: [], hasTodayReviews: false };

    const reviewed = expressions.filter(e => {
      if (!englishCategoryFilter(e)) return false;
      const inHistory = Array.isArray(e.reviewHistory) && e.reviewHistory.some(r => r.date === todayDateStr);
      const inLastRev = typeof e.lastReviewed === "string" && e.lastReviewed.startsWith(todayDateStr);
      const inLastRevDate = e.lastReviewDate === todayDateStr;
      return inHistory || inLastRev || inLastRevDate;
    });

    if (reviewed.length > 0) {
      return { todayReviewedExpressions: reviewed, hasTodayReviews: true };
    }

    // Fallback gracieux si aucune révision aujourd'hui : proposer 10 expressions anglaises du deck
    const fallback = expressions.filter(englishCategoryFilter).slice(0, 10);
    return { todayReviewedExpressions: fallback, hasTodayReviews: false };
  }, [expressions, todayDateStr]);

  // Extraction chirurgicale de la traduction française courte (Vrai sens) sans le surplus de la fiche
  const extractFrenchTranslation = useCallback((backText) => {
    if (!backText || typeof backText !== "string") return "";

    // 1. Détection "Vrai sens :" (avec ou sans emojis/markdown)
    const vraiSensMatch = backText.match(/(?:📖\s*)?(?:\*{0,2}Vrai sens\s*(?:\(FR\))?\s*:\*{0,2})\s*([^\n🧩💬⚠️]+)/i);
    if (vraiSensMatch && vraiSensMatch[1]) {
      let clean = vraiSensMatch[1].replace(/[`*_~]/g, "").trim();
      clean = clean.split(/[🧩💬⚠️\n]/)[0].trim();
      if (clean) return clean;
    }

    // 2. Détection flèche "↳ <traduction>"
    const arrowMatch = backText.match(/^[↳\->]+\s*([^\n🧩💬⚠️]+)/m);
    if (arrowMatch && arrowMatch[1]) {
      const clean = arrowMatch[1].replace(/[`*_~]/g, "").trim();
      if (clean) return clean;
    }

    // 3. Première ligne nettoyée (sans emojis de rubriques)
    const firstLine = backText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("🧩") && !l.startsWith("💬") && !l.startsWith("⚠️") && !l.startsWith("* **"))[0] || "";

    let cleaned = firstLine
      .replace(/^#+\s*/g, "")
      .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2}/gu, "")
      .replace(/(?:\*{0,2}Vrai sens\s*:\*{0,2})/gi, "")
      .replace(/[`*_~]/g, "")
      .trim();

    if (cleaned.length > 95) {
      cleaned = cleaned.slice(0, 92) + "...";
    }
    return cleaned;
  }, []);

  const insertExpressionIntoDraft = useCallback((phrase) => {
    if (!phrase || !phrase.trim()) return;
    setPracticeWritingText(prev => {
      const trimmed = (prev || "").trimEnd();
      const spacer = trimmed.length > 0 ? " " : "";
      return trimmed + spacer + phrase.trim() + " ";
    });
    if (showToast) showToast(`"${phrase}" inséré dans votre essai ! ✍️`, "success");
  }, [showToast]);



  const togglePlayAudio = useCallback((text, audioId) => {
    if (!text || !text.trim()) return;
    if (playingAudioId === audioId) {
      stopEnglishAudio();
      setPlayingAudioId(null);
      return;
    }
    stopEnglishAudio();
    setPlayingAudioId(audioId);
    const ok = playEnglishAudio(text, {
      raw: true,
      groqApiKey: typeof getNextGroqKey === "function" ? getNextGroqKey() : null,
      onStart: () => setPlayingAudioId(audioId),
      onEnd: () => setPlayingAudioId(prev => prev === audioId ? null : prev),
      onError: () => setPlayingAudioId(prev => prev === audioId ? null : prev)
    });
    if (!ok) {
      setPlayingAudioId(null);
      if (showToast) showToast("Audio non disponible ou non supporté", "error");
    }
  }, [playingAudioId, getNextGroqKey, showToast]);

  const handleCopyText = (text, id) => {
    if (!text) return;
    if (!navigator.clipboard?.writeText) { showToast?.("Copie indisponible dans ce navigateur.", "error"); return; }
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDraftId(id);
      if (showToast) showToast("Texte copié dans le presse-papiers ! 📋", "success");
      setTimeout(() => setCopiedDraftId(null), 2500);
    }).catch(() => {
      if (showToast) showToast("Impossible de copier le texte", "error");
    });
  };

  const generateMissingCorrectedText = async (draft) => {
    if (!draft || !draft.text || !draft.text.trim()) return;
    setGeneratingCorrectedId(draft.id);
    try {
      const raw = await callClaude(
        `Tu es un mentor d'anglais d'élite et examinateur officiel IELTS/Cambridge.
Analyse en profondeur cet essai rédigé par un étudiant francophone :
"""${draft.text}"""

Sujet : "${draft.prompt || "Présentation ou essai libre"}"

CONSIGNES STRICTES DE CLARTÉ PÉDAGOGIQUE (LIS ATTENTIVEMENT) :
1. ATOMICITÉ ABSOLUE : Isole chaque faute individuellement (un seul mot ou une courte expression de 1 à 3 mots). Ne fusionne JAMAIS plusieurs fautes distinctes dans un même bloc !
   - Mauvais exemple à PROSCRIRE : "i'm actually in my last year of degree" (ceci mélange 3 erreurs !).
   - Bon exemple OBLIGATOIRE :
     * Faute A : "i'm" ➔ "I'm" (Règle majuscule)
     * Faute B : "actually" ➔ "currently" (Faux-ami majeur)
     * Faute C : "last year of degree" ➔ "final year of my degree" (Vocabulaire académique & possessif)
     * Faute D : "go entreprise for a stage" ➔ "do an internship at a company" (Faux-ami & collocation)
     * Faute E : "about computer scientist" ➔ "in computer science" (Confusion discipline vs métier)
     * Faute F : "to create and knowing" ➔ "to create and know" (Parallélisme infinitif après 'to')
     * Faute G : "two differents domains" ➔ "two different fields" (Adjectif invariable sans 's')
     * Faute H : "AI logiciel" ➔ "AI software" (Traduction 'software' indénombrable)
     * Faute I : "make them safety" ➔ "ensure their safety / make them safe" (Nom vs adjectif)
     * Faute J : "cybersecurity and ai engeneering" ➔ "cybersecurity and AI engineering" (Orthographe & sigle)

2. CLARTÉ RADICALE DU "POURQUOI" :
   - Explique la règle en français limpide, direct et percutant, SANS JARGON FLOU ni formules abstraites.
   - Si c'est un faux-ami, donne obligatoirement le vrai sens du mot anglais et le mot qu'il fallait utiliser (ex: "'Actually' ne signifie JAMAIS 'actuellement', mais 'en fait / en réalité'. Pour dire 'actuellement / en ce moment', le seul mot anglais est 'currently'.").
   - Explique pourquoi le cerveau francophone s'est trompé (calque mot à mot, faux-ami).
   - Précise la sanction ou l'impact auprès d'un examinateur IELTS/Cambridge (ex: perte de points sur le critère Lexical Resource ou Grammatical Accuracy).

3. TEXTE CORRIGÉ INTÉGRAL : Fournis la version réécrite complète, naturelle et élégante en anglais.

Donne UNIQUEMENT un objet JSON valide (SANS TEXTE AUTOUR):
{
  "correctedText": "Version intégrale corrigée et réécrite en anglais naturel, fluide et impeccable",
  "mistakes": [
    {
      "originalText": "le mot ou segment exact de 1 à 3 mots (ex: actually)",
      "correctedText": "la correction exacte (ex: currently)",
      "category": "Faux-ami & Vocabulaire" | "Majuscules & Rigueur" | "Grammaire & Parallélisme" | "Accord d'adjectif" | "Orthographe",
      "why": "L'explication limpide du POURQUOI : sens réel du mot, règle de grammaire simple et contre-exemple clair",
      "examTrap": "Le piège pour francophones (calque/faux-ami) et ce que l'examinateur officiel IELTS sanctionne",
      "flashcard": {
        "front": "Question directe en français pour tester cette règle précise (ex: Comment dire 'actuellement' en anglais sans tomber dans le faux-ami ?)",
        "back": "Currently (attention : 'actually' signifie 'en réalité / en fait')"
      }
    }
  ]
}`
      );
      const parsed = safeParseJSON(raw);
      const cleanedText = parsed?.correctedText || (typeof raw === "string" && !raw.trim().startsWith("{") ? raw.trim() : "");
      const newMistakes = Array.isArray(parsed?.mistakes) && parsed.mistakes.length > 0 ? parsed.mistakes : null;

      if (cleanedText || newMistakes) {
        setPracticeWritingDrafts(prev => {
          const updated = prev.map(d => {
            if (d.id === draft.id) {
              return {
                ...d,
                feedback: {
                  ...(d.feedback || {}),
                  ...(cleanedText ? { correctedText: cleanedText } : {}),
                  ...(newMistakes ? { mistakes: newMistakes } : {})
                }
              };
            }
            return d;
          });
          Promise.resolve(storage?.set("nova_writing_drafts", updated)).catch(() => showToast?.("Correction affichée, mais sauvegarde échouée.", "error"));
          return updated;
        });
        if (practiceWritingActiveId === draft.id) {
          setPracticeWritingFeedback(prev => ({
            ...(prev || {}),
            ...(cleanedText ? { correctedText: cleanedText } : {}),
            ...(newMistakes ? { mistakes: newMistakes } : {})
          }));
        }
        if (showToast) showToast("Diagnostic intelligent & texte correctif générés ! ✨", "success");
      }
    } catch (e) {
      if (showToast) showToast("Erreur lors de la génération du diagnostic", "error");
    } finally {
      setGeneratingCorrectedId(null);
    }
  };

  useEffect(() => () => stopEnglishAudio(), []);
  return {
    practiceWritingText,
    setPracticeWritingText,
    practiceWritingFeedback,
    setPracticeWritingFeedback,
    writingWordGoal,
    setWritingWordGoal,
    isReportExpanded,
    setIsReportExpanded,
    ieltsActiveTab,
    setIeltsActiveTab,
    isHudCollapsed,
    setIsHudCollapsed,
    showWritingTip,
    setShowWritingTip,
    showWritingHistory,
    setShowWritingHistory,
    writingHistory,
    setWritingHistory,
    practiceWritingLoading,
    setPracticeWritingLoading,
    practiceWritingPrompt,
    setPracticeWritingPrompt,
    practiceWritingDrafts,
    setPracticeWritingDrafts,
    practiceWritingActiveId,
    setPracticeWritingActiveId,
    writingTabMode,
    setWritingTabMode,
    draftSearchQuery,
    setDraftSearchQuery,
    filteredDrafts,
    getBandScoreColor,
    copiedDraftId,
    setCopiedDraftId,
    generatingCorrectedId,
    setGeneratingCorrectedId,
    playingAudioId,
    setPlayingAudioId,
    expandedDraftIds,
    setExpandedDraftIds,
    expandedMistakeIdxs,
    setExpandedMistakeIdxs,
    toggleDraftExpand,
    toggleMistakeExpand,
    showReviewedDrawer,
    setShowReviewedDrawer,
    todayReviewedExpressions,
    hasTodayReviews,
    extractFrenchTranslation,
    insertExpressionIntoDraft,
    togglePlayAudio,
    handleCopyText,
    generateMissingCorrectedText
  };
}
