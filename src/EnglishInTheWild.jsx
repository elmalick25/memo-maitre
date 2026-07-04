// EnglishInTheWild.jsx — Apprendre l'anglais depuis de vraies vidéos YouTube
// Intègre : extraction de sous-titres, 10 expressions clés, dictée, compréhension, shadowing
// Props : callClaude, storage, expressions, setExpressions, showToast, theme, isDarkMode

import React, { useState, useRef, useEffect } from "react";
import { speakWithFallback, NovaBadge } from "./lib/HuggingFaceVoice";
// ── Utilitaire : extraire l'ID YouTube ──────────────────────────────────────
function extractYouTubeId(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const s = u.pathname.match(/\/shorts\/([^/?]+)/);
      if (s) return s[1];
    }
  } catch {
  }
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}

// ── Fetch transcript via Cloudflare Worker ─────────
async function fetchTranscript(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const WORKER_URL = import.meta.env.VITE_TRANSCRIPT_WORKER_URL;
  let officialTitle = "";
  try {
    const ytKey = import.meta.env.VITE_YOUTUBE_API_KEY;
    if (ytKey) {
      const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${ytKey}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        const snippet = detailsData?.items?.[0]?.snippet;
        if (snippet) {
          officialTitle = snippet.title || "";
        }
      }
    }
  } catch (e) {
    console.warn("Failed to retrieve YouTube video details:", e);
  }

  // Liste de tentatives — on essaie le worker maison puis des proxies publics multiples.
  // Plus on a de fallbacks, plus on garantit que ÇA MARCHE peu importe la durée de la vidéo.
  const attempts = [];
  if (WORKER_URL) attempts.push(`${WORKER_URL}?url=${encodeURIComponent(videoUrl)}`);
  // Fallbacks publics (sans clé) — multi-providers pour résilience maximale.
  attempts.push(`https://yt.lemnoslife.com/videos?part=transcript&id=${videoId}`);
  attempts.push(`https://youtubetranscript.com/?server_vid2=${videoId}`);
  attempts.push(`https://youtubetranscript.com/?server_vid=${videoId}`);
  // Piped API (open-source YouTube frontend) — souvent disponible
  attempts.push(`https://pipedapi.kavin.rocks/streams/${videoId}`);
  attempts.push(`https://pipedapi.adminforge.de/streams/${videoId}`);
  // Invidious — autre frontend open-source
  attempts.push(`https://invidious.privacydev.net/api/v1/captions/${videoId}`);
  attempts.push(`https://inv.nadeko.net/api/v1/captions/${videoId}`);

  let lastErr = null;
  for (const url of attempts) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue; }
      const ct = r.headers.get("content-type") || "";
      let text = "";
      let title = officialTitle || "";
      if (ct.includes("application/json")) {
        const data = await r.json();
        if (data.error) { lastErr = new Error(data.error); continue; }
        // Piped : data.subtitles[] + data.title
        if (Array.isArray(data.subtitles) && data.subtitles.length) {
          // récupère le 1er sous-titre dispo (souvent anglais auto-généré)
          const subUrl = data.subtitles.find(s => /^en/i.test(s.code))?.url || data.subtitles[0].url;
          try {
            const subRes = await fetch(subUrl, { signal: AbortSignal.timeout(15000) });
            const subRaw = await subRes.text();
            const matches = [...subRaw.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
            if (matches.length) {
              text = matches.map(m => m[1]
                .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
                .join(" ");
            } else text = subRaw;
          } catch {}
          if (!title) title = data.title || "";
        }
        // Invidious : data.captions[]
        if (!text && Array.isArray(data.captions) && data.captions.length) {
          const cap = data.captions.find(c => /^en/i.test(c.languageCode || c.label)) || data.captions[0];
          if (cap?.url) {
            try {
              const capRes = await fetch(cap.url, { signal: AbortSignal.timeout(15000) });
              const capRaw = await capRes.text();
              const matches = [...capRaw.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
              if (matches.length) {
                text = matches.map(m => m[1]
                  .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
                  .join(" ");
              } else text = capRaw;
            } catch {}
          }
        }
        if (!text) {
          text = data.transcript || data.text
            || (Array.isArray(data.items) && data.items[0]?.transcript?.map?.(s => s.text).join(" "))
            || "";
        }
        if (!title) title = data.title || "";
      } else {
        const raw = await r.text();
        const matches = [...raw.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
        if (matches.length) {
          text = matches.map(m => m[1]
            .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
            .join(" ");
        } else {
          text = raw;
        }
      }
      if (text && text.length >= 100) return { text, title };
      lastErr = new Error("Transcript trop court ou vide.");
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error("Impossible de récupérer les sous-titres automatiquement après " + attempts.length + " tentatives. Colle le texte de la transcription dans le champ « Coller manuellement » et clique sur Analyser. (" + (lastErr?.message || 'erreur inconnue') + ")");
}

// ── safeParseJSON ─────────────────────────────────────────────────────────────
function safeParseJSON(str) {
  let s = str.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { }
  // Tentative de réparation : fermer les structures ouvertes (objet ou tableau)
  const trimmed = s.replace(/,\s*$/, "");
  const opensWithArray = trimmed.trimStart().startsWith("[");
  const repaired = opensWithArray
    ? trimmed.replace(/([^\]])\s*$/, "$1]")
    : trimmed.replace(/([^}])\s*$/, "$1}");
  try { return JSON.parse(repaired); } catch { }
  throw new Error("JSON invalide : " + s.slice(0, 200));
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function EnglishInTheWild({
  callClaude,
  storage,
  setExpressions,
  showToast,
  theme,
  isDarkMode,
}) {
  // ── États principaux ──────────────────────────────────────────────────────
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [step, setStep] = useState("input"); // input | loading | results
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");

  // ── Résultats ─────────────────────────────────────────────────────────────
  const [expressions10, setExpressions10] = useState([]); // [{expr, ipa, meaning, example, tip}]
  const [dictation, setDictation] = useState(null);       // {passage, blankedPassage, blanks:[{index,word}]}
  const [questions, setQuestions] = useState([]);          // [{q, options:[A,B,C,D], answer, explanation}]
  const [shadowing, setShadowing] = useState(null);        // {phrase, phonetics, tips:[]}

  // ── UI tabs ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("expressions");

  // ── Dictée : interaction ──────────────────────────────────────────────────
  const [dictationInputs, setDictationInputs] = useState({});
  const [dictationRevealed, setDictationRevealed] = useState(false);
  const [dictationScore, setDictationScore] = useState(null);

  // ── Quiz : interaction ────────────────────────────────────────────────────
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(null);

  // ── Shadowing : TTS + micro ───────────────────────────────────────────────
  const [shadowingPlaying, setShadowingPlaying] = useState(false);
  const [shadowingUserText, setShadowingUserText] = useState("");
  const [shadowingFeedback, setShadowingFeedback] = useState(null);
  const [shadowingPhase, setShadowingPhase] = useState("idle"); // idle|listen|record|feedback
  const shadowRecorderRef = useRef(null);
  const shadowChunksRef = useRef([]);

  // ── Sauvegarde ────────────────────────────────────────────────────────────
  const [savedToMemo, setSavedToMemo] = useState([]);   // indices des expressions sauvegardées
  const [history, setHistory] = useState([]);           // sessions passées

  // ── Charger historique ────────────────────────────────────────────────────
  useEffect(() => {
    if (storage?.get) {
      storage.get("wild_history_v1").then(h => { if (h) setHistory(h); }).catch(() => { });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Vocab in Context Mining States ────────────────────────────────────────────
  const [miningState, setMiningState] = useState({ isOpen: false, loading: false, word: "", context: "", data: null, tab: "formal", testMode: false });

  const triggerMining = async (word, context) => {
    if (!word) return;
    setMiningState({ isOpen: true, loading: true, word, context, data: null, tab: "formal", testMode: false });

    try {
      const prompt = `Pour le mot anglais '${word}' trouvé dans ce contexte : '${context}',
retourne UNIQUEMENT ce JSON :
{
  "word": "${word}",
  "ipa": "/ˌserənˈdɪpɪti/",
  "partOfSpeech": "noun",
  "ceferLevel": "C1",
  "definition": "...",
  "contexts": {
    "formal": "...",
    "casual": "...",
    "academic": "...",
    "business": "...",
    "slang": "..."
  },
  "collocations": ["pure serendipity", "by serendipity"],
  "confusedWith": [{ "word": "coincidence", "difference": "..." }],
  "mnemonic": "...",
  "frequency": "rare",
  "register": "formal/literary",
  "antonyms": ["design", "intention"],
  "synonyms": ["chance", "fortuitousness"]
}`;
      const raw = await callClaude(prompt, "Vocab Mining");
      const parsed = safeParseJSON(raw);
      setMiningState(prev => ({ ...prev, loading: false, data: parsed }));
    } catch (e) {
      showToast?.(`Erreur de mining pour "${word}"`, "error");
      setMiningState(prev => ({ ...prev, loading: false }));
    }
  };

  const addMiningToSRS = () => {
    if (!miningState.data || !setExpressions) return;
    const d = miningState.data;
    // eslint-disable-next-line react-hooks/purity
    const id = Date.now().toString() + Math.random();
    const newCard = {
      id,
      front: d.word,
      back: `${d.definition}\n\n[${d.partOfSpeech} | ${d.ceferLevel}]\nEx: ${d.contexts?.formal || ""}`,
      example: miningState.context,
      // IPA pour la prononciation
      ipa: d.ipa || "",
      category: "🇬🇧 Anglais",
      // Champs FSRS complets
      level: 0,
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewHistory: [],
      nextReview: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString().slice(0, 10),
      imageUrl: null,
    };
    setExpressions(prev => {
      const updated = [newCard, ...prev];
      // Persistence native gérée par MemoMaster
      return updated;
    });
    showToast?.(`✨ "${d.word}" ajouté au SRS !`, "success");
  };

  const renderDraggableWord = (text, fullContext = "") => {
    if (!text) return null;
    const fallbackContext = fullContext || text;
    return text.split(/(\s+)/).map((word, idx) => {
      if (/\s+/.test(word)) return <span key={idx}>{word}</span>;
      const cleanWord = word.replace(/[.,!?;:"]/g, '');
      return (
        <span
          key={idx}
          draggable
          onClick={() => triggerMining(cleanWord, fallbackContext)}
          onDragStart={(e) => { e.dataTransfer.setData("text/plain", cleanWord); }}
          className="word-catcher"
          style={{ cursor: "pointer", display: "inline-block", transition: "transform 0.2s, color 0.2s" }}
        >
          {word}
        </span>
      );
    });
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ANALYSE PRINCIPALE
  // ════════════════════════════════════════════════════════════════════════════
  const analyze = async () => {
    const id = extractYouTubeId(url.trim());
    if (!id) { setError("URL YouTube invalide."); return; }

    setError("");
    setVideoId(id);
    setStep("loading");
    setExpressions10([]);
    setDictation(null);
    setQuestions([]);
    setShadowing(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
    setDictationInputs({});
    setDictationRevealed(false);
    setDictationScore(null);
    setSavedToMemo([]);
    setShadowingFeedback(null);
    setShadowingPhase("idle");

    // 1. Transcription
    setLoadingMsg("📡 Récupération des sous-titres YouTube…");
    let rawTranscript = "";
    try {
      const result = await fetchTranscript(id);
      rawTranscript = result.text;
      if (result.title) setVideoTitle(result.title);
      if (!rawTranscript || rawTranscript.length < 100) {
        throw new Error("Transcript trop court ou vide.");
      }
    } catch (e) {
      setError("❌ " + e.message + "\n\nAstuce : colle directement le texte de la transcription dans le champ ci-dessous et clique sur « Analyser le texte ».");
      setStep("input");
      return;
    }

    // Garder le transcript complet, chunker pour l'IA
    setTranscript(rawTranscript);

    // 2. Extraction complète — chunks de 4000 chars avec overlap
    // 🚀 PARALLÉLISATION : on traite 3 chunks à la fois pour des vidéos longues (2h+)
    //    sans saturer l'API. Une vidéo de 60min ≈ ~25 chunks → ~9 vagues (au lieu de 25 séquentielles).
    const CHUNK_SIZE = 4000;
    const OVERLAP = 400;
    const chunks = [];
    for (let i = 0; i < rawTranscript.length; i += CHUNK_SIZE - OVERLAP) {
      chunks.push(rawTranscript.slice(i, i + CHUNK_SIZE));
      if (i + CHUNK_SIZE >= rawTranscript.length) break;
    }

    setLoadingMsg(`🧠 Extraction des expressions… (0/${chunks.length} parties)`);
    let exprData = [];
    const seenExprs = new Set();
    let processedCount = 0;

    // Normalisation forte pour dédup : minuscules + suppression ponctuation + espaces compressés
    const normKey = (s) => (s || "").toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, "")
      .replace(/\s+/g, " ")
      .trim();

    const extractChunk = async (chunkText, ci) => {
      try {
        const exprRaw = await callClaude(
          `Tu es un expert en pédagogie et en enseignement de l'anglais. Je construis des fiches de révision pour mémoriser des expressions anglaises que j'extrais de la chaîne YouTube "Learn English avec TV Series". Analyse ce passage de transcription YouTube et extrais ABSOLUMENT TOUTES les expressions idiomatiques, phrasal verbs, collocations, slang, tournures utiles, mots avancés (B2-C2). Sois EXHAUSTIF : vise 15 à 30 expressions par passage si possible. Ne limite JAMAIS le nombre. Réponds UNIQUEMENT en JSON valide, aucun texte autour, aucune balise markdown.`,
          `PASSAGE:\n${chunkText}\n\nRéponds avec ce format JSON exact :
{"expressions":[
  {
    "expr": "L'expression extraite",
    "ipa": "Prononciation figurée (phonétique francisée) très simple à lire pour un francophone (ex: 'What are you doing' -> 'wat-ar you douwing', 'brain' -> 'breyn'). Évite l'API.",
    "meaning": "Traduction principale en français",
    "usage": "C'est la partie LA PLUS IMPORTANTE. Tu DOIS toujours commencer ton explication par 'Utilise cette expression pour...' ou 'S'utilise quand...'. Sois très clair sur le contexte et le registre (familier, formel...).",
    "avoid": "À ne pas confondre / Éviter (s'il y a des pièges, sinon laisse vide)",
    "nuanceInContext": "Explique la nuance exacte de l'expression dans ce cas précis",
    "examples": [
      {"en": "Phrase exemple 1", "fr": "Traduction obligatoire en français"},
      {"en": "Phrase exemple 2", "fr": "Traduction obligatoire en français"},
      {"en": "Phrase exemple 3", "fr": "Traduction obligatoire en français"}
    ],
    "synonyms": ["synonyme 1 obligatoire", "synonyme 2 obligatoire"]
  }
]}`
        );
        const parsed = safeParseJSON(exprRaw);
        const newExprs = (parsed.expressions || []).filter(e => {
          const key = normKey(e.expr);
          if (!key || seenExprs.has(key)) return false;
          seenExprs.add(key);
          return true;
        });
        exprData = [...exprData, ...newExprs];
        setExpressions10([...exprData]);
      } catch (e) {
        console.warn(`Expressions chunk ${ci} parse error`, e);
      } finally {
        processedCount++;
        setLoadingMsg(`🧠 Extraction des expressions… (${processedCount}/${chunks.length} parties · ${exprData.length} expressions trouvées)`);
      }
    };

    // Pool de concurrence à 3
    const CONCURRENCY = 3;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
      while (cursor < chunks.length) {
        const ci = cursor++;
        await extractChunk(chunks[ci], ci);
      }
    });
    await Promise.all(workers);
    setExpressions10(exprData);

    // Extrait limité pour dictée / quiz / shadowing (pas besoin du transcript entier)
    const excerpt = rawTranscript.slice(0, 6000);

    // 3. Dictée
    setLoadingMsg("✍️ Génération de la dictée…");
    let dictData = null;
    try {
      const dictRaw = await callClaude(
        `Tu es un professeur d'anglais. À partir de la transcription, extrais un passage naturel de 3-4 phrases (40-70 mots) adapté pour une dictée. Réponds UNIQUEMENT en JSON valide.`,
        `TRANSCRIPTION:\n${excerpt}\n\nFormat JSON exact :\n{"passage":"...","blankedPassage":"...","blanks":[{"index":0,"word":"..."}]}\n\nLe "blankedPassage" est le passage avec 5-7 mots remplacés par "___". Le tableau "blanks" liste les mots manquants dans l'ordre d'apparition. "index" est la position (0-based) du blanc dans l'ordre d'apparition.`
      );
      dictData = safeParseJSON(dictRaw);
    } catch (e) {
      console.warn("Dictation parse error", e);
    }
    setDictation(dictData);

    // 4. Questions de compréhension
    setLoadingMsg("❓ Génération des questions de compréhension…");
    let qData = [];
    try {
      const qRaw = await callClaude(
        `Tu es un professeur d'anglais. Génère 4 questions de compréhension à choix multiples basées sur la transcription. Réponds UNIQUEMENT en JSON valide.`,
        `TRANSCRIPTION:\n${excerpt}\n\nFormat JSON :\n{"questions":[{"q":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A","explanation":"..."}]}`
      );
      const parsed = safeParseJSON(qRaw);
      qData = parsed.questions || [];
    } catch (e) {
      console.warn("Questions parse error", e);
    }
    setQuestions(qData);

    // 5. Phrase de shadowing
    setLoadingMsg("🎙️ Sélection de la phrase de shadowing…");
    let shadowData = null;
    try {
      const shadowRaw = await callClaude(
        `Tu es un coach de prononciation anglaise. Choisis la phrase la plus intéressante phonétiquement de la transcription pour un exercice de shadowing (15-25 mots, bonne intonation naturelle). Réponds UNIQUEMENT en JSON valide.`,
        `TRANSCRIPTION:\n${excerpt}\n\nFormat JSON :\n{"phrase":"...","phonetics":"...","tips":["conseil 1","conseil 2","conseil 3"]}`
      );
      shadowData = safeParseJSON(shadowRaw);
    } catch (e) {
      console.warn("Shadowing parse error", e);
    }
    setShadowing(shadowData);

    // 6. Sauvegarder en historique
    const newEntry = { videoId: id, url: url.trim(), date: new Date().toISOString().slice(0, 10), expressionCount: exprData.length };
    const newHistory = [newEntry, ...history].slice(0, 10);
    setHistory(newHistory);
    if (storage?.set) storage.set("wild_history_v1", newHistory)?.catch?.(() => { });

    setStep("results");
    setActiveTab("expressions");
    showToast?.(`🎬 ${exprData.length} expressions extraites !`, "success");
  };

  // ── Analyser texte collé manuellement ─────────────────────────────────────
  const analyzeText = async () => {
    if (!transcript.trim() || transcript.trim().length < 100) {
      setError("Le texte est trop court (minimum 100 caractères).");
      return;
    }
    setError("");
    setStep("loading");
    setVideoId("");
    setExpressions10([]);
    setDictation(null);
    setQuestions([]);
    setShadowing(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
    setDictationInputs({});
    setDictationRevealed(false);
    setDictationScore(null);
    setSavedToMemo([]);
    setShadowingFeedback(null);
    setShadowingPhase("idle");
    setShadowingUserText("");

    const excerpt = transcript.slice(0, 6000);

    setLoadingMsg("🧠 Extraction des 10 expressions clés…");
    let exprData = [];
    try {
      const exprRaw = await callClaude(
        `Tu es un expert en pédagogie et en enseignement de l'anglais. Je construis des fiches de révision pour mémoriser des expressions anglaises. Analyse ce texte et extrais les 10 expressions les plus utiles pour un apprenant avancé (B2-C1). Réponds UNIQUEMENT en JSON valide, aucun texte autour, aucune balise markdown.`,
        `TEXTE:\n${excerpt}\n\nRéponds avec ce format JSON exact :
{"expressions":[
  {
    "expr": "L'expression extraite",
    "ipa": "Prononciation figurée (phonétique francisée) très simple à lire pour un francophone (ex: 'What are you doing' -> 'wat-ar you douwing', 'brain' -> 'breyn'). Évite l'API.",
    "meaning": "Traduction principale en français",
    "usage": "C'est la partie LA PLUS IMPORTANTE. Tu DOIS toujours commencer ton explication par 'Utilise cette expression pour...' ou 'S'utilise quand...'. Sois très clair sur le contexte et le registre (familier, formel...).",
    "avoid": "À ne pas confondre / Éviter (s'il y a des pièges, sinon laisse vide)",
    "nuanceInContext": "Explique la nuance exacte de l'expression dans ce cas précis",
    "examples": [
      {"en": "Phrase exemple 1", "fr": "Traduction obligatoire en français"},
      {"en": "Phrase exemple 2", "fr": "Traduction obligatoire en français"},
      {"en": "Phrase exemple 3", "fr": "Traduction obligatoire en français"}
    ],
    "synonyms": ["synonyme 1 obligatoire", "synonyme 2 obligatoire"]
  }
]}`
      );
      exprData = safeParseJSON(exprRaw).expressions || [];
    } catch { }
    setExpressions10(exprData);

    setLoadingMsg("✍️ Génération de la dictée…");
    let dictData = null;
    try {
      const dictRaw = await callClaude(
        `Génère une dictée à partir du texte. Réponds UNIQUEMENT en JSON valide.`,
        `TEXTE:\n${excerpt}\n\n{"passage":"...","blankedPassage":"...","blanks":[{"index":0,"word":"..."}]}`
      );
      dictData = safeParseJSON(dictRaw);
    } catch { }
    setDictation(dictData);

    setLoadingMsg("❓ Questions de compréhension…");
    let qData = [];
    try {
      const qRaw = await callClaude(
        `Génère 4 questions QCM de compréhension. Réponds UNIQUEMENT en JSON valide.`,
        `TEXTE:\n${excerpt}\n\n{"questions":[{"q":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A","explanation":"..."}]}`
      );
      qData = safeParseJSON(qRaw).questions || [];
    } catch { }
    setQuestions(qData);

    setLoadingMsg("🎙️ Phrase de shadowing…");
    let shadowData = null;
    try {
      const shadowRaw = await callClaude(
        `Choisis une phrase pour le shadowing. Réponds UNIQUEMENT en JSON valide.`,
        `TEXTE:\n${excerpt}\n\n{"phrase":"...","phonetics":"...","tips":["...","...","..."]}`
      );
      shadowData = safeParseJSON(shadowRaw);
    } catch { }
    setShadowing(shadowData);

    setStep("results");
    setActiveTab("expressions");
    showToast?.("✅ Texte analysé !", "success");
  };

  // ── Sauvegarder une expression dans MemoMaster ────────────────────────────
  const saveExpression = (expr, i) => {
    if (!setExpressions) return;
    // eslint-disable-next-line react-hooks/purity
    const id = ``;
    
    // Format the back of the card beautifully for MemoMaster
    let backContent = expr.meaning;
    
    if (expr.usage) {
      backContent += `\n\n✅ QUAND L'UTILISER :\n${expr.usage}`;
    }
    if (expr.avoid) {
      backContent += `\n\n🚫 À NE PAS CONFONDRE / ÉVITER :\n${expr.avoid}`;
    }
    if (expr.nuanceInContext) {
      backContent += `\n\n🎬 SENS DANS CE CONTEXTE :\n${expr.nuanceInContext}`;
    }
    if (expr.examples?.length > 0) {
      backContent += `\n\n💬 EXEMPLES :\n` + expr.examples.map(e => `• ${e.en || e}${e.fr ? `\n  ↳ ${e.fr}` : ""}`).join("\n\n");
    }
    if (expr.synonyms?.length > 0) {
      backContent += `\n\n🔄 ALTERNATIVES / SYNONYMES : ${expr.synonyms.join(", ")}`;
    }

    const newCard = {
      id,
      front: expr.expr,
      back: backContent,
      // Champ IPA pour l'affichage de la prononciation dans CardItem
      ipa: expr.ipa || "",
      tag: "idiom",
      category: "🇬🇧 Anglais",
      source: "English in the Wild",
      // Champs FSRS complets (fix bug SRS : sans level, la carte n'apparaît pas en révision)
      level: 0,
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewHistory: [],
      nextReview: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      imageUrl: null,
    };
    setExpressions(prev => [newCard, ...prev]);
    setSavedToMemo(prev => [...prev, i]);
    showToast?.(`💾 "${expr.expr}" ajouté à MemoMaster !`, "success");
  };

  // ── TTS pour shadowing (ElevenLabs voix humaine + fallback) ──────────────
  const speakShadowing = async () => {
    if (!shadowing?.phrase) return;
    try {
      setShadowingPlaying(true);
      await speakWithFallback(
        shadowing.phrase,
        { voiceId: "EXAVITQu4vr4xnSDxMaL", rate: 0.85 },
        speakWithElevenLabs
      );
    } catch {
      await speakWithBrowserTTS(shadowing.phrase, "en-US", 0.85);
    } finally {
      setShadowingPlaying(false);
    }
  };

  // ── Enregistrement shadowing ──────────────────────────────────────────────
  const startShadowingRecord = async () => {
    if (!shadowing?.phrase) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      shadowChunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = e => { if (e.data.size > 0) shadowChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setShadowingPhase("feedback");
        // Feedback IA basé sur le texte (sans Whisper, on demande à l'utilisateur de taper)
        showToast?.("🎙️ Enregistrement terminé. Tape ce que tu as dit pour recevoir ton feedback.", "info");
      };
      rec.start();
      shadowRecorderRef.current = rec;
      setShadowingRecording(true);
      setShadowingPhase("record");
      // Auto-stop après 15s
      shadowTimerRef.current = setTimeout(() => stopShadowingRecord(), 15000);
    } catch (e) {
      showToast?.("🎤 Accès micro refusé : " + e.message, "error");
    }
  };

  const stopShadowingRecord = () => {
    clearTimeout(shadowTimerRef.current);
    if (shadowRecorderRef.current?.state === "recording") shadowRecorderRef.current.stop();
    setShadowingRecording(false);
    // Mise à jour directe de la phase (Bug 4) : ne pas dépendre uniquement du
    // callback onstop qui peut être retardé ou ne pas se déclencher.
    setShadowingPhase("feedback");
  };

  const analyzeShadowingText = async () => {
    if (!shadowingUserText.trim() || !shadowing?.phrase) return;
    // Ne pas changer la phase ici : on reste dans la phase courante pendant l'analyse
    // pour ne pas masquer le textarea (Bug 1)
    try {
      const raw = await callClaude(
        `Tu es un coach de prononciation anglaise. Compare ce que l'utilisateur a dit (transcription manuelle) avec la phrase cible. Donne un feedback détaillé et encourageant. Réponds UNIQUEMENT en JSON valide.`,
        `PHRASE CIBLE: "${shadowing.phrase}"\nCE QUE L'UTILISATEUR A DIT: "${shadowingUserText}"\n\n{"score":85,"praise":"...","improvements":["...","..."],"rhythm":"...","nextStep":"..."}`
      );
      const fb = safeParseJSON(raw);
      setShadowingFeedback(fb);
    } catch {
      // FIX B15: on garde la phase courante pour que le textarea reste accessible
      showToast?.("Erreur lors de l'analyse. Réessaie.", "error");
    }
  };

  // ── Score dictée ──────────────────────────────────────────────────────────
  const checkDictation = () => {
    if (!dictation?.blanks) return;
    let correct = 0;
    // FIX B11: garder lettres Unicode + chiffres, normaliser apostrophes typographiques
    const norm = (s) => (s || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[^\p{L}\p{N}'\-]/gu, "");
    dictation.blanks.forEach((b, i) => {
      const userWord = norm(dictationInputs[i]);
      const targetWord = norm(b.word);
      if (userWord === targetWord) correct++;
    });
    const score = dictation.blanks.length > 0 ? Math.round((correct / dictation.blanks.length) * 100) : 0;
    setDictationScore({ correct, total: dictation.blanks.length, percent: score });
    setDictationRevealed(true);
  };

  // ── Score quiz ────────────────────────────────────────────────────────────
  const submitQuiz = () => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (quizAnswers[i] === q.answer) correct++;
    });
    setQuizScore({ correct, total: questions.length });
    setQuizSubmitted(true);
  };

  // ════════════════════════════════════════════════════════════════════════════
  // STYLES (cohérents avec MemoMaster)
  // ════════════════════════════════════════════════════════════════════════════
  const card = {
    background: theme.cardBg,
    borderRadius: 20,
    padding: 24,
    border: `1px solid ${theme.border}`,
    marginBottom: 16,
  };

  const btn = (color = "#4D6BFE", disabled = false) => ({
    padding: "12px 20px",
    background: disabled ? (isDarkMode ? "#1F1F1F" : "#E5E7EB") : color,
    color: disabled ? theme.textMuted : "white",
    border: "none",
    borderRadius: 14,
    fontWeight: 800,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s",
  });

  const tabStyle = (active) => ({
    padding: "10px 18px",
    borderRadius: 12,
    fontWeight: 800,
    fontSize: 13,
    border: "none",
    cursor: "pointer",
    background: active ? "#4D6BFE" : "transparent",
    color: active ? "white" : theme.textMuted,
    transition: "all 0.2s",
  });

  // ════════════════════════════════════════════════════════════════════════════
  // RENDU
  // ════════════════════════════════════════════════════════════════════════════

  // ── Loading ───────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 20 }}>
        <div style={{ fontSize: 48 }}>🎬</div>
        <div style={{ fontWeight: 900, fontSize: 18, color: theme.text, textAlign: "center" }}>English in the Wild</div>
        <div style={{
          padding: "14px 28px",
          background: isDarkMode ? "#0A0A1A" : "#EEF0FF",
          borderRadius: 16,
          border: "1.5px solid #4D6BFE40",
          color: "#4D6BFE",
          fontWeight: 700,
          fontSize: 14,
          textAlign: "center",
          maxWidth: 380,
        }}>
          {loadingMsg}
        </div>
        {expressions10.length > 0 && (
          <div style={{ fontSize: 13, color: "#10B981", fontWeight: 700, textAlign: "center" }}>
            {expressions10.length} expression{expressions10.length > 1 ? "s" : ""} trouvée{expressions10.length > 1 ? "s" : ""} jusqu'ici…
          </div>
        )}
        {/* Loader animé */}
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: "50%", background: "#4D6BFE",
              animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
        <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0.7);opacity:0.5}40%{transform:scale(1.2);opacity:1}}`}</style>
      </div>
    );
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  if (step === "input") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div style={{ ...card, background: isDarkMode ? "#06061A" : "#F0F1FF", border: "2px solid #4D6BFE30", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📺</div>
          <div style={{ fontWeight: 900, fontSize: 22, color: theme.text, marginBottom: 6 }}>English in the Wild</div>
          <div style={{ fontSize: 14, color: theme.textMuted, lineHeight: 1.6 }}>
            Colle une URL YouTube (interview, TED talk, podcast…) et apprends l'anglais authentique : expressions, dictée, compréhension, shadowing.
          </div>
        </div>

        {/* URL Input */}
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 15, color: theme.text, marginBottom: 12 }}>🔗 URL YouTube</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }} className="wild-actions">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") analyze(); }}
              placeholder="https://youtube.com/watch?v=... ou https://youtu.be/..."
              style={{
                flex: 1, minWidth: 0, padding: "14px 18px", borderRadius: 14,
                border: `1.5px solid ${theme.border}`,
                background: theme.inputBg, color: theme.text,
                fontSize: 14, fontWeight: 500, outline: "none",
              }}
            />
            <button onClick={analyze} disabled={!url.trim()} style={{ ...btn("#4D6BFE", !url.trim()), padding: "14px 22px", fontSize: 15 }}>
              🚀 Analyser
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 14, padding: "14px 18px", background: isDarkMode ? "#1A0A0A" : "#FEF2F2", borderRadius: 12, border: "1.5px solid #EF444430", color: "#EF4444", fontSize: 13, whiteSpace: "pre-line" }}>
              {error}
            </div>
          )}
        </div>

        {/* Fallback : texte manuel */}
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 15, color: theme.text, marginBottom: 4 }}>✏️ Ou colle directement la transcription</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>Si YouTube bloque l'accès aux sous-titres, copie le texte manuellement depuis YouTube Studio ou Rev.ai.</div>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Colle ici le texte de la transcription (minimum 100 caractères)…"
            rows={5}
            style={{
              width: "100%", padding: "14px 18px", borderRadius: 14,
              border: `1.5px solid ${theme.border}`,
              background: theme.inputBg, color: theme.text,
              fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box",
            }}
          />
          <button
            onClick={analyzeText}
            disabled={!transcript.trim() || transcript.trim().length < 100}
            style={{ ...btn("#3451D1", !transcript.trim() || transcript.trim().length < 100), marginTop: 12, width: "100%" }}
          >
            ✨ Analyser ce texte
          </button>
        </div>

        {/* Exemples */}
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 14, color: theme.text, marginBottom: 12 }}>💡 Idées de vidéos</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { label: "🎤 TED Talk", url: "https://youtu.be/8S0FDjFBj8o" },
              { label: "📰 BBC News", url: "https://youtu.be/DfGs2Y5WJ14" },
              { label: "🎙️ Podcast CNN", url: "https://youtu.be/YQHsXMglC9A" },
            ].map((ex, i) => (
              <button
                key={i}
                onClick={() => setUrl(ex.url)}
                style={{ padding: "8px 14px", background: isDarkMode ? "#1A1A2E" : "#EEF0FF", border: "1.5px solid #4D6BFE30", borderRadius: 10, color: "#4D6BFE", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Historique */}
        {history.length > 0 && (
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 14, color: theme.text, marginBottom: 12 }}>🕒 Sessions récentes</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.slice(0, 5).map((h, i) => (
                <div
                  key={i}
                  onClick={() => setUrl(h.url)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: theme.inputBg, borderRadius: 12, border: `1px solid ${theme.border}`, cursor: "pointer" }}
                >
                  <span style={{ fontSize: 18 }}>🎬</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: theme.text, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.url}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>📅 {h.date} · {h.expressionCount} expressions extraites</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  const tabs = [
    { id: "expressions", label: "💬 Expressions", count: expressions10.length },
    { id: "dictation", label: "✍️ Dictée" },
    { id: "quiz", label: "❓ Compréhension", count: questions.length },
    { id: "shadowing", label: "🎙️ Shadowing" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        .word-catcher:hover { color: #4D6BFE; transform: scale(1.1) translateY(-2px); font-weight: 800; text-shadow: 0 0 8px rgba(77,107,254,0.4); }
      `}</style>
      {/* Header résultats */}
      <div style={{ ...card, background: isDarkMode ? "#06061A" : "#F0F1FF", border: "2px solid #4D6BFE40" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {videoId && (
            <img
              src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
              alt="thumbnail"
              style={{ width: 80, height: 54, objectFit: "cover", borderRadius: 10, flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontWeight: 900, fontSize: 16, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>
              {videoTitle ? videoTitle : "English in the Wild"}
            </h1>
            <NovaBadge isDarkMode={theme === "dark"} />
            {videoId && (
              <a
                href={`https://youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#4D6BFE", fontWeight: 600 }}
              >
                ▶️ Voir sur YouTube
              </a>
            )}
          </div>
          <button
            onClick={() => { setStep("input"); setVideoId(""); }}
            style={{ ...btn(isDarkMode ? "#1F1F1F" : "#E5E7EB"), color: theme.text, fontSize: 13 }}
          >
            🔄 Nouvelle vidéo
          </button>
        </div>
      </div>

      {/* Tabs (mobile : groupées derrière un bouton "Vue") */}
      <button
        type="button"
        className="english-tabs-toggle"
        onClick={() => document.body.classList.toggle("english-tabs-expanded")}
        style={{
          display: "none",
          padding: "10px 14px",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          background: theme.cardBg,
          color: theme.text,
          fontWeight: 800, fontSize: 14, cursor: "pointer",
          marginBottom: 8, width: "100%"
        }}
      >
        ☰ Sections ({tabs.find(t => t.id === activeTab)?.label || "Choisir"})
      </button>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }} className="tabs-scroll academy-tabs english-tabs-cluster">

        {tabs.map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); document.body.classList.remove("english-tabs-expanded"); }} style={tabStyle(activeTab === t.id)} className="tab-pill academy-tab-btn">
            {t.label}{typeof t.count === "number" ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* ── TAB : Expressions ───────────────────────────────────────────── */}
      {activeTab === "expressions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {expressions10.length === 0 ? (
            <div style={{ ...card, textAlign: "center", color: theme.textMuted }}>Aucune expression extraite.</div>
          ) : expressions10.map((ex, i) => (
            <div key={ex.expr || `expr-${i}`} style={{ ...card, border: savedToMemo.includes(i) ? "2px solid #10B981" : `1px solid ${theme.border}` }}>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,#3730A3,#4D6BFE)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 900, fontSize: 13, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Titre + IPA */}
                  <div style={{ fontWeight: 900, fontSize: 18, color: theme.text, textAlign: "center" }}>{ex.expr}</div>
                  {ex.ipa && <div style={{ fontSize: 13, color: "#4D6BFE", fontWeight: 600, fontFamily: "monospace", marginTop: 4, textAlign: "center" }}>{ex.ipa}</div>}

                  {/* Signification */}
                  <div style={{ fontSize: 15, color: "#4D6BFE", marginTop: 8, textAlign: "center" }}>{ex.meaning}</div>

                  {/* Quand utiliser (Usage) */}
                  {ex.usage && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#10B981", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span style={{background: "#10B981", color: "white", padding: "2px 4px", borderRadius: 4}}>✅</span> QUAND L'UTILISER
                      </div>
                      <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.55, padding: "10px 16px", background: isDarkMode ? "rgba(16,185,129,0.07)" : "rgba(16,185,129,0.06)", borderRadius: 10, borderLeft: "3px solid #10B981", borderRight: "3px solid #10B981", textAlign: "center" }}>
                        {ex.usage}
                      </div>
                    </div>
                  )}

                  {/* À éviter */}
                  {ex.avoid && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#EF4444", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span style={{color: "#EF4444", fontSize: 14}}>🚫</span> À NE PAS CONFONDRE / ÉVITER
                      </div>
                      <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.55, padding: "10px 16px", background: isDarkMode ? "rgba(239,68,68,0.07)" : "rgba(239,68,68,0.05)", borderRadius: 10, borderLeft: "3px solid #EF4444", borderRight: "3px solid #EF4444", textAlign: "center" }}>
                        {ex.avoid}
                      </div>
                    </div>
                  )}
                  
                  {/* Nuance In Context */}
                  {ex.nuanceInContext && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span style={{color: "#8B5CF6", fontSize: 14}}>🎬</span> SENS DANS LE CONTEXTE
                      </div>
                      <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.55, padding: "10px 16px", background: isDarkMode ? "rgba(139,92,246,0.07)" : "rgba(139,92,246,0.05)", borderRadius: 10, borderLeft: "3px solid #8B5CF6", borderRight: "3px solid #8B5CF6", textAlign: "center" }}>
                        {ex.nuanceInContext}
                      </div>
                    </div>
                  )}

                  {/* Exemples multiples */}
                  {ex.examples?.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#4D6BFE", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span style={{color: "#4D6BFE", fontSize: 14}}>💬</span> EXEMPLES
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ex.examples.map((eg, ei) => (
                          <div key={ei} style={{ padding: "12px 16px", background: isDarkMode ? "#0A0A1A" : "#EEF0FF", borderRadius: 10, color: theme.text, borderLeft: "3px solid #4D6BFE", borderRight: "3px solid #4D6BFE", textAlign: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "#4D6BFE" }}>{renderDraggableWord(eg.en || eg)}</div>
                            {eg.fr && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>{eg.fr}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Synonymes */}
                  {ex.synonyms?.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span style={{color: "#F59E0B", fontSize: 14}}>🔄</span> ALTERNATIVES / SYNONYMES
                      </div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                        {ex.synonyms.map((syn, si) => (
                          <span key={si} style={{ fontSize: 13, fontWeight: 600, color: "#F59E0B", background: isDarkMode ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.1)", padding: "6px 12px", borderRadius: 12 }}>
                            {syn}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => saveExpression(ex, i)}
                  disabled={savedToMemo.includes(i)}
                  style={{ ...btn(savedToMemo.includes(i) ? "#10B981" : "#4D6BFE", savedToMemo.includes(i)), padding: "8px 12px", fontSize: 12, flexShrink: 0 }}
                >
                  {savedToMemo.includes(i) ? "✅ Ajouté" : "💾 Mémoriser"}
                </button>
              </div>
            </div>
          ))}
          {expressions10.length > 0 && (
            <button
              onClick={() => expressions10.forEach((ex, i) => { if (!savedToMemo.includes(i)) saveExpression(ex, i); })}
              disabled={savedToMemo.length >= expressions10.length}
              style={{
                ...btn("#059669", savedToMemo.length >= expressions10.length),
                background: savedToMemo.length >= expressions10.length
                  ? (isDarkMode ? "#1F1F1F" : "#E5E7EB")
                  : "linear-gradient(135deg,#059669,#10B981)",
                width: "100%", padding: 16,
              }}
            >
              {savedToMemo.length >= expressions10.length
                ? "✅ Toutes les expressions ont été ajoutées"
                : `💾 Tout ajouter à MemoMaster (${expressions10.length - savedToMemo.length} restant${expressions10.length - savedToMemo.length > 1 ? "s" : ""})`}
            </button>
          )}
        </div>
      )}

      {/* ── TAB : Dictée ─────────────────────────────────────────────────── */}
      {activeTab === "dictation" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!dictation ? (
            <div style={{ ...card, textAlign: "center", color: theme.textMuted }}>Dictée non disponible.</div>
          ) : (
            <>
              <div style={card}>
                <div style={{ fontWeight: 800, fontSize: 15, color: theme.text, marginBottom: 4 }}>✍️ Dictée authentique</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>Écoute la vidéo et complète les mots manquants. Les blancs (___) représentent des mots à trouver.</div>

                {/* Passage avec blancs */}
                <div style={{ fontSize: 15, lineHeight: 2.2, color: theme.text, marginBottom: 20 }}>
                  {(() => {
                    if (!dictation.blankedPassage) return dictation.passage;
                    const parts = dictation.blankedPassage.split("___");
                    return parts.map((part, i) => (
                      <span key={i}>
                        {part}
                        {i < parts.length - 1 && (
                          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", margin: "0 4px" }}>
                            <input
                              value={dictationInputs[i] || ""}
                              onChange={e => setDictationInputs(prev => ({ ...prev, [i]: e.target.value }))}
                              disabled={dictationRevealed}
                              placeholder="…"
                              style={{
                                width: 100, padding: "4px 8px",
                                borderRadius: 8,
                                border: dictationRevealed
                                  ? (dictationInputs[i]?.trim().toLowerCase().replace(/[^a-z']/g, "") === dictation.blanks[i]?.word.toLowerCase().replace(/[^a-z']/g, "") ? "2px solid #10B981" : "2px solid #EF4444")
                                  : `1.5px solid ${theme.border}`,
                                background: dictationRevealed
                                  ? (dictationInputs[i]?.trim().toLowerCase().replace(/[^a-z']/g, "") === dictation.blanks[i]?.word.toLowerCase().replace(/[^a-z']/g, "") ? (isDarkMode ? "#052e16" : "#F0FDF4") : (isDarkMode ? "#1A0A0A" : "#FEF2F2"))
                                  : theme.inputBg,
                                color: theme.text,
                                fontSize: 14,
                                fontWeight: 700,
                                outline: "none",
                                textAlign: "center",
                              }}
                            />
                            {dictationRevealed && dictationInputs[i]?.trim().toLowerCase().replace(/[^a-z']/g, "") !== dictation.blanks[i]?.word.toLowerCase().replace(/[^a-z']/g, "") && (
                              <span style={{ marginLeft: 4, fontSize: 12, color: "#10B981", fontWeight: 700 }}>
                                → {dictation.blanks[i]?.word}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    ));
                  })()}
                </div>

                {dictationScore && (
                  <div style={{ padding: "14px 18px", background: dictationScore.percent >= 80 ? (isDarkMode ? "#052e16" : "#F0FDF4") : (isDarkMode ? "#1A0A0A" : "#FEF2F2"), borderRadius: 14, border: `1.5px solid ${dictationScore.percent >= 80 ? "#10B981" : "#EF4444"}40`, marginBottom: 16, textAlign: "center" }}>
                    <div style={{ fontWeight: 900, fontSize: 22, color: dictationScore.percent >= 80 ? "#10B981" : "#EF4444" }}>
                      {dictationScore.percent}%
                    </div>
                    <div style={{ fontSize: 13, color: theme.textMuted }}>
                      {dictationScore.correct}/{dictationScore.total} mots corrects · {dictationScore.percent >= 80 ? "🌟 Excellent !" : dictationScore.percent >= 60 ? "💪 Bien essayé !" : "📖 Continue à t'entraîner !"}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  {!dictationRevealed ? (
                    <button onClick={checkDictation} style={{ ...btn("#4D6BFE"), flex: 1 }}>✅ Vérifier mes réponses</button>
                  ) : (
                    <button onClick={() => { setDictationInputs({}); setDictationRevealed(false); setDictationScore(null); }} style={{ ...btn("#3451D1"), flex: 1 }}>🔄 Recommencer</button>
                  )}
                </div>
              </div>

              {/* Passage original */}
              {dictationRevealed && dictation.passage && (
                <div style={card}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: theme.text, marginBottom: 10 }}>📄 Passage original</div>
                  <div style={{ fontSize: 14, lineHeight: 1.8, color: theme.textMuted, fontStyle: "italic" }}>
                    "{renderDraggableWord(dictation.passage)}"
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB : Compréhension ──────────────────────────────────────────── */}
      {activeTab === "quiz" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {questions.length === 0 ? (
            <div style={{ ...card, textAlign: "center", color: theme.textMuted }}>Questions non disponibles.</div>
          ) : (
            <>
              {questions.map((q, qi) => (
                <div key={qi} style={{ ...card, border: quizSubmitted ? (quizAnswers[qi] === q.answer ? "2px solid #10B981" : "2px solid #EF4444") : `1px solid ${theme.border}` }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: theme.text, marginBottom: 14 }}>
                    Q{qi + 1}. {q.q}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(q.options || []).map((opt, oi) => {
                      const letter = opt.charAt(0);
                      const isSelected = quizAnswers[qi] === letter;
                      const isCorrect = letter === q.answer;
                      return (
                        <button
                          key={oi}
                          onClick={() => { if (!quizSubmitted) setQuizAnswers(prev => ({ ...prev, [qi]: letter })); }}
                          style={{
                            padding: "12px 16px", borderRadius: 12, textAlign: "left",
                            border: quizSubmitted
                              ? (isCorrect ? "2px solid #10B981" : isSelected ? "2px solid #EF4444" : `1px solid ${theme.border}`)
                              : (isSelected ? "2px solid #4D6BFE" : `1px solid ${theme.border}`),
                            background: quizSubmitted
                              ? (isCorrect ? (isDarkMode ? "#052e16" : "#F0FDF4") : isSelected ? (isDarkMode ? "#1A0A0A" : "#FEF2F2") : theme.inputBg)
                              : (isSelected ? (isDarkMode ? "#0A0A1A" : "#EEF0FF") : theme.inputBg),
                            color: theme.text, fontSize: 14, fontWeight: isSelected ? 700 : 500,
                            cursor: quizSubmitted ? "default" : "pointer",
                          }}
                        >
                          {opt} {quizSubmitted && isCorrect && " ✅"} {quizSubmitted && isSelected && !isCorrect && " ❌"}
                        </button>
                      );
                    })}
                  </div>
                  {quizSubmitted && q.explanation && (
                    <div style={{ marginTop: 12, padding: "10px 14px", background: isDarkMode ? "#0A0A1A" : "#EEF0FF", borderRadius: 10, fontSize: 13, color: "#4D6BFE", fontWeight: 600 }}>
                      💡 {q.explanation}
                    </div>
                  )}
                </div>
              ))}

              {quizScore ? (
                <div style={{ ...card, textAlign: "center", background: quizScore.correct === quizScore.total ? (isDarkMode ? "#052e16" : "#F0FDF4") : theme.cardBg }}>
                  <div style={{ fontWeight: 900, fontSize: 28, color: quizScore.correct === quizScore.total ? "#10B981" : "#F59E0B" }}>
                    {quizScore.correct}/{quizScore.total}
                  </div>
                  <div style={{ fontSize: 14, color: theme.textMuted, marginTop: 4 }}>
                    {quizScore.correct === quizScore.total ? "🌟 Score parfait !" : "📚 Relis le passage pour améliorer ta compréhension."}
                  </div>
                  <button onClick={() => { setQuizAnswers({}); setQuizSubmitted(false); setQuizScore(null); }} style={{ ...btn("#3451D1"), marginTop: 14 }}>🔄 Recommencer</button>
                </div>
              ) : (
                <button
                  onClick={submitQuiz}
                  disabled={Object.keys(quizAnswers).length < questions.length}
                  style={{ ...btn("#4D6BFE", Object.keys(quizAnswers).length < questions.length), width: "100%", padding: 16, fontSize: 15 }}
                >
                  ✅ Soumettre mes réponses ({Object.keys(quizAnswers).length}/{questions.length})
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB : Shadowing ──────────────────────────────────────────────── */}
      {activeTab === "shadowing" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!shadowing ? (
            <div style={{ ...card, textAlign: "center", color: theme.textMuted }}>Shadowing non disponible.</div>
          ) : (
            <>
              {/* Phrase cible */}
              <div style={{ ...card, border: "2px solid #4D6BFE40" }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: theme.text, marginBottom: 12 }}>🎙️ Phrase de shadowing</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, lineHeight: 1.7, marginBottom: 10 }}>
                  "{renderDraggableWord(shadowing.phrase)}"
                </div>
                {shadowing.phonetics && (
                  <div style={{ fontSize: 13, color: "#4D6BFE", fontFamily: "monospace", fontWeight: 600, marginBottom: 14 }}>
                    {shadowing.phonetics}
                  </div>
                )}

                {/* Conseils */}
                {shadowing.tips?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    {shadowing.tips.map((tip, i) => (
                      <div key={i} style={{ fontSize: 13, color: theme.textMuted, marginBottom: 6 }}>
                        <span style={{ color: "#F59E0B", fontWeight: 700 }}>💡</span> {tip}
                      </div>
                    ))}
                  </div>
                )}

                {/* Bouton écouter */}
                <button
                  onClick={speakShadowing}
                  style={{ ...btn(shadowingPlaying ? "#3451D1" : "#4D6BFE"), width: "100%", marginBottom: 10 }}
                >
                  {shadowingPlaying ? "🔊 Lecture en cours…" : "▶️ Écouter la phrase (TTS)"}
                </button>

                <div style={{ fontSize: 11, color: theme.textMuted, textAlign: "center", marginBottom: 16 }}>
                  💡 Écoute 2-3 fois, puis essaie de répéter en même temps. C'est le shadowing !
                </div>
              </div>

              {/* Pratique shadowing */}
              <div style={card}>
                <div style={{ fontWeight: 800, fontSize: 15, color: theme.text, marginBottom: 12 }}>🎤 Ta pratique</div>

                {shadowingPhase === "idle" && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }} className="wild-actions">
                    <button onClick={startShadowingRecord} style={{ ...btn("#EF4444"), flex: 1, minWidth: 160 }}>
                      🔴 Enregistrer ma répétition
                    </button>
                  </div>
                )}

                {shadowingPhase === "record" && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 8, animation: "pulse 1s infinite" }}>🔴</div>
                    <div style={{ fontWeight: 700, color: "#EF4444", marginBottom: 12 }}>Enregistrement en cours… (max 15s)</div>
                    <button onClick={stopShadowingRecord} style={{ ...btn("var(--mm-fg)") }}>⏹️ Arrêter</button>
                    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
                  </div>
                )}

                {shadowingPhase === "feedback" && !shadowingFeedback && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 8 }}>
                      Tape ce que tu as dit (de mémoire) pour recevoir un feedback :
                    </div>
                    <textarea
                      value={shadowingUserText}
                      onChange={e => setShadowingUserText(e.target.value)}
                      placeholder="Tape ici ce que tu as dit…"
                      rows={3}
                      style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }}
                    />
                    <button onClick={analyzeShadowingText} disabled={!shadowingUserText.trim()} style={{ ...btn("#4D6BFE", !shadowingUserText.trim()), width: "100%" }}>
                      🧠 Analyser mon shadowing
                    </button>
                  </div>
                )}

                {shadowingFeedback && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Score */}
                    <div style={{ textAlign: "center", padding: "16px", background: isDarkMode ? "#0A0A1A" : "#EEF0FF", borderRadius: 16 }}>
                      <div style={{ fontWeight: 900, fontSize: 36, color: shadowingFeedback.score >= 80 ? "#10B981" : shadowingFeedback.score >= 60 ? "#F59E0B" : "#EF4444" }}>
                        {shadowingFeedback.score}%
                      </div>
                      <div style={{ fontSize: 14, color: theme.text, fontWeight: 700, marginTop: 4 }}>{shadowingFeedback.praise}</div>
                    </div>
                    {shadowingFeedback.rhythm && (
                      <div style={{ padding: "10px 14px", background: isDarkMode ? "#1A1A0A" : "#FFFBEB", borderRadius: 12, fontSize: 13, color: "#92400E" }}>
                        🎵 Rythme : {shadowingFeedback.rhythm}
                      </div>
                    )}
                    {shadowingFeedback.improvements?.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: theme.text, marginBottom: 8 }}>📝 À améliorer :</div>
                        {shadowingFeedback.improvements.map((imp, i) => (
                          <div key={i} style={{ fontSize: 13, color: theme.textMuted, marginBottom: 6, paddingLeft: 12, borderLeft: "3px solid #F59E0B" }}>
                            {imp}
                          </div>
                        ))}
                      </div>
                    )}
                    {shadowingFeedback.nextStep && (
                      <div style={{ padding: "10px 14px", background: isDarkMode ? "#052e16" : "#F0FDF4", borderRadius: 12, fontSize: 13, color: "#10B981", fontWeight: 600 }}>
                        🚀 Prochaine étape : {shadowingFeedback.nextStep}
                      </div>
                    )}
                    <button
                      onClick={() => { setShadowingFeedback(null); setShadowingUserText(""); setShadowingPhase("idle"); }}
                      style={{ ...btn("#3451D1"), width: "100%" }}
                    >
                      🔄 Réessayer
                    </button>
                  </div>
                )}

                {/* Mode shadowing sans enregistrement */}
                {shadowingPhase === "idle" && !shadowingFeedback && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: theme.textMuted, textAlign: "center" }}>
                      — ou —
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, color: theme.textMuted, marginBottom: 8 }}>
                      Pas de micro ? Tape ce que tu mémorises de la phrase :
                    </div>
                    <textarea
                      value={shadowingUserText}
                      onChange={e => setShadowingUserText(e.target.value)}
                      placeholder="Tape la phrase de mémoire…"
                      rows={2}
                      style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 10 }}
                    />
                    <button onClick={analyzeShadowingText} disabled={!shadowingUserText.trim()} style={{ ...btn("#4D6BFE", !shadowingUserText.trim()), width: "100%" }}>
                      🧠 Obtenir mon feedback
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 💎 Vocab in Context Mining Panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "100%", maxWidth: 450,
          background: isDarkMode ? "#0F172A" : "#FFFFFF",
          boxShadow: "-10px 0 40px rgba(77,107,254,0.2)", zIndex: 10000,
          transform: miningState.isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          display: "flex", flexDirection: "column", overflowY: "auto"
        }}
      >
        {miningState.isOpen && (
          <>
            <div style={{ padding: "24px 24px 16px", borderBottom: `1px solid ${theme.border}`, position: "sticky", top: 0, background: isDarkMode ? "#0F172A" : "#FFFFFF", zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: 32, fontWeight: 900, margin: "0 0 8px", color: theme.text }}>{miningState.word}</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={() => speakWithBrowserTTS(miningState.word)} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(77,107,254,0.1)", color: "#4D6BFE", cursor: "pointer", fontSize: 18 }}>🔊</button>
                  {miningState.data?.ipa && <span style={{ fontSize: 16, fontFamily: "monospace", color: theme.textMuted }}>{miningState.data.ipa}</span>}
                  {miningState.data?.ceferLevel && <span style={{ padding: "4px 8px", background: "rgba(16,185,129,0.1)", color: "#10B981", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>{miningState.data.ceferLevel}</span>}
                  {miningState.data?.partOfSpeech && <span style={{ padding: "4px 8px", background: "rgba(245,158,11,0.1)", color: "#D97706", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>{miningState.data.partOfSpeech}</span>}
                </div>
              </div>
              <button onClick={() => setMiningState(prev => ({ ...prev, isOpen: false }))} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: theme.textMuted }}>✕</button>
            </div>

            <div style={{ padding: 24, flex: 1 }}>
              {miningState.loading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
                  <div style={{ fontSize: 40, animation: "bounce 1s infinite" }}>⛏️</div>
                  <div style={{ color: theme.text, fontWeight: 700 }}>Extraction du vocabulaire...</div>
                  <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center" }}>Analyse des contextes, prononciation et collocations.</div>
                </div>
              ) : miningState.data ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                  {/* Definition */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Définition</div>
                    <div style={{ fontSize: 16, color: theme.text, lineHeight: 1.5 }}>{miningState.data.definition}</div>
                  </div>

                  {/* Contexts Tabs */}
                  {miningState.data.contexts && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Contextes d'utilisation</div>
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
                        {Object.keys(miningState.data.contexts).map(ctx => (
                          <button key={ctx} onClick={() => setMiningState(prev => ({ ...prev, tab: ctx }))} style={{ padding: "6px 12px", borderRadius: 100, border: "none", background: miningState.tab === ctx ? "#4D6BFE" : isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)", color: miningState.tab === ctx ? "white" : theme.textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>
                            {ctx}
                          </button>
                        ))}
                      </div>
                      <div style={{ padding: 16, background: isDarkMode ? "rgba(255,255,255,0.03)" : "var(--mm-bg-elev)", borderRadius: 16, border: `1px solid ${theme.border}`, fontSize: 15, color: theme.text, fontStyle: "italic", lineHeight: 1.5 }}>
                        "{miningState.data.contexts[miningState.tab]}"
                      </div>
                    </div>
                  )}

                  {/* Pills section */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {miningState.data.collocations?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Collocations (mots associés)</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {miningState.data.collocations.map(c => <span key={c} style={{ padding: "6px 12px", background: "rgba(77, 107, 254,0.1)", color: "#4D6BFE", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>{c}</span>)}
                        </div>
                      </div>
                    )}

                    {miningState.data.synonyms?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Synonymes</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {miningState.data.synonyms.map(c => <span key={c} style={{ padding: "6px 12px", background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.05)", color: theme.text, borderRadius: 8, fontSize: 13, fontWeight: 600 }}>{c}</span>)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confused With */}
                  {miningState.data.confusedWith?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", marginBottom: 8 }}>À ne pas confondre</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {miningState.data.confusedWith.map((c, i) => (
                          <div key={i} style={{ padding: 12, background: "rgba(239,68,68,0.05)", borderLeft: "3px solid #EF4444", borderRadius: "0 8px 8px 0" }}>
                            <div style={{ fontWeight: 800, color: "#EF4444", marginBottom: 4 }}>{c.word}</div>
                            <div style={{ fontSize: 13, color: theme.text }}>{c.difference}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mnemonic */}
                  {miningState.data.mnemonic && (
                    <div style={{ padding: 16, background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.05))", borderRadius: 16, border: "1px solid rgba(245,158,11,0.3)" }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#D97706", textTransform: "uppercase", marginBottom: 6 }}>💡 Mnémonique</div>
                      <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.5 }}>{miningState.data.mnemonic}</div>
                    </div>
                  )}

                  {/* Test Mode */}
                  {miningState.testMode ? (
                    <div style={{ padding: 16, background: isDarkMode ? "rgba(77,107,254,0.1)" : "#EEF0FF", borderRadius: 16, border: "1px solid #4D6BFE40" }}>
                      <div style={{ fontWeight: 800, color: "#4D6BFE", marginBottom: 12 }}>Test de rétention</div>
                      <div style={{ fontSize: 14, color: theme.text, marginBottom: 12 }}>
                        Complète la phrase : <br /><br />
                        <i>"{(miningState.data.contexts?.casual || miningState.data.contexts?.formal || "").replace(new RegExp(miningState.word, "gi"), "_____")}"</i>
                      </div>
                      <input
                        type="text"
                        value={miningTestAnswers.q1 || ""}
                        onChange={e => setMiningTestAnswers({ q1: e.target.value })}
                        placeholder="Tape le mot..."
                        style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, marginBottom: 12, outline: "none", boxSizing: "border-box" }}
                      />
                      {miningTestAnswers.q1 && (
                        <div style={{ fontWeight: 800, color: miningTestAnswers.q1.toLowerCase() === miningState.word.toLowerCase() ? "#10B981" : "#EF4444" }}>
                          {miningTestAnswers.q1.toLowerCase() === miningState.word.toLowerCase() ? "✅ Parfait !" : "❌ Oups, réessaie."}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                      <button onClick={addMiningToSRS} style={{ flex: 1, padding: 16, background: "#4D6BFE", color: "white", borderRadius: 14, border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 14px rgba(77,107,254,0.3)" }}>
                        ➕ Ajouter au SRS
                      </button>
                      <button onClick={() => setMiningState(prev => ({ ...prev, testMode: true }))} style={{ flex: 1, padding: 16, background: "transparent", color: "#4D6BFE", borderRadius: 14, border: "2px solid #4D6BFE", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                        📝 Tester
                      </button>
                    </div>
                  )}

                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
