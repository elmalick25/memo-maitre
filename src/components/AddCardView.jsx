import React, { useState, useRef, useEffect, useCallback } from "react";
import RichText from "./RichText";
import HoloCard from "./HoloCard";
import GodTierContent from "./GodTierContent";
import { SmartPasteBox, generateCardsFromSmartPaste, findSimilarCards } from "../MemoMasterUpgrades";
import { CARD_TYPES } from "../constants/cardTypes";
import { safeParseJSON } from "../lib/textUtils";
import { buildBatchPrompt, layoutBatchCards } from "../lib/aiCardPrompts";
import { ATOMIC_CARD_RULES } from "../lib/atomicCardRules";
import { colorMix } from "../lib/colorMix";

export default function AddCardView({
  addForm,
  setAddForm,
  editingId,
  cancelEdit,
  addSubView = "single",
  setAddSubView,
  addZenMode = false,
  setAddZenMode,
  categories = [],
  expressions = [],
  setExpressions,
  theme,
  isDarkMode,
  showToast,
  callClaude,
  playSound = () => {},
  today = () => new Date().toISOString().slice(0, 10),
  setStats = () => {},
  onCardCreated,
  setMobileAddSheetOpen,
}) {
  const catNames = categories.map(c => c.name);

  // Local States
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiBatchCount, setAiBatchCount] = useState(5);
  const [showBatchPreview, setShowBatchPreview] = useState(false);
  const [batchPreview, setBatchPreview] = useState([]);
  const [batchCanvasTransform, setBatchCanvasTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [batchMousePos, setBatchMousePos] = useState({ x: 0, y: 0 });
  const [batchLinks, setBatchLinks] = useState([]);
  const batchDragRef = useRef({ isPanning: false, draggingIdx: null, linkFrom: null, offsetX: 0, offsetY: 0, startX: 0, startY: 0 });

  const [addBatchQueue, setAddBatchQueue] = useState([]);
  const [addBatchRunning, setAddBatchRunning] = useState(false);

  // Chat Copilot state
  const [chatToCardMessages, setChatToCardMessages] = useState([
    { role: "assistant", text: "Salut ! Dis-moi ce que tu veux apprendre, réviser ou transformer en fiches.", cards: [] }
  ]);
  const [chatToCardInput, setChatToCardInput] = useState("");
  const [chatToCardLoading, setChatToCardLoading] = useState(false);
  const chatToCardEndRef = useRef(null);

  // From text state
  const [aiFromText, setAiFromText] = useState("");
  const [aiFromTextLoading, setAiFromTextLoading] = useState(false);
  const [dragOverForge, setDragOverForge] = useState(false);
  const [dropForgeLoading, setDropForgeLoading] = useState(false);

  // Vision Scan state
  const [visionScanCards, setVisionScanCards] = useState([]);
  const [visionScanLoading, setVisionScanLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Multimedia state
  const [addImageGallery, setAddImageGallery] = useState(false);
  const [addImageSearch, setAddImageSearch] = useState("");
  const [addImageSearchLoading, setAddImageSearchLoading] = useState(false);
  const [addImageResults, setAddImageResults] = useState([]);
  const [addDiagramMode, setAddDiagramMode] = useState(false);
  const [addDiagramCode, setAddDiagramCode] = useState("");
  const [addDiagramSvg, setAddDiagramSvg] = useState(null);
  const [addAudioRecording, setAddAudioRecording] = useState(false);
  const [addAudioUrl, setAddAudioUrl] = useState(null);

  // Type de fiche collapsible menu state
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef(null);

  useEffect(() => {
    if (!typeMenuOpen) return;
    const handleClickOutside = (e) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target)) {
        setTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [typeMenuOpen]);

  // Templates
  const [addTemplate, setAddTemplate] = useState("standard");
  const addTemplatePresets = [
    { id: "standard", label: "Standard (Q/R)" },
    { id: "cloze", label: "Texte à trou" },
    { id: "code", label: "Snippet Code" },
    { id: "contrast", label: "Comparatif / Nuance" },
    { id: "process", label: "Algorithme / Process" },
  ];

  // Voice & Helpers
  const [listening, setListening] = useState(null);
  const [addDoublonCheck, setAddDoublonCheck] = useState(null);
  const [addReformulations, setAddReformulations] = useState({});
  const [addReformLoading, setAddReformLoading] = useState(false);
  const [addLayeredMode, setAddLayeredMode] = useState(false);
  const [addLayers, setAddLayers] = useState([{ back: "" }]);
  const [addMetaphoreLoading, setAddMetaphoreLoading] = useState(false);
  const [addMetaphoreText, setAddMetaphoreText] = useState(null);
  const [memScore, setMemScore] = useState(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [forgeAnim, setForgeAnim] = useState(false);

  // CSV Import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  // Textareas refs
  const backTextareaRef = useRef(null);
  const exampleTextareaRef = useRef(null);

  // Selection overlay
  const [selectionMenu, setSelectionMenu] = useState({ open: false, field: null, text: "", start: 0, end: 0 });

  // ── Duplicate checker ──────────────────────────────────────────────────────
  const checkDoublon = (concept) => {
    if (!concept || concept.length < 3) {
      setAddDoublonCheck(null);
      return;
    }
    const matches = findSimilarCards(concept, expressions, 0.75);
    if (matches && matches.length > 0) {
      setAddDoublonCheck({
        duplicate: true,
        existingConcept: matches[0].card.front,
        conseil: `Similarité ${Math.round(matches[0].similarity * 100)}% avec une fiche existante.`
      });
    } else {
      setAddDoublonCheck(null);
    }
  };

  // ── Memorability Score calculation ─────────────────────────────────────────
  useEffect(() => {
    if (!addForm.front || !addForm.back) {
      setMemScore(null);
      return;
    }
    let score = 100;
    const feedback = [];
    if (addForm.front.length > 80) {
      score -= 20;
      feedback.push("Le recto est un peu trop long (vise < 80 caractères).");
    }
    if (addForm.back.length > 600) {
      score -= 25;
      feedback.push("Le verso est trop verbeux pour une révision rapide.");
    }
    if (!addForm.example && !addForm.back.includes("```")) {
      score -= 10;
      feedback.push("Ajouter un exemple concret ou du code renforce l'ancrage.");
    }
    const color = score >= 80 ? "#22C55E" : score >= 60 ? "#F59E0B" : "#EF4444";
    const label = score >= 80 ? "Excellente" : score >= 60 ? "Moyenne" : "À améliorer";
    setMemScore({ score: Math.max(20, score), color, label, feedback });
  }, [addForm.front, addForm.back, addForm.example]);

  // ── Markdown Toolbar Insertion ─────────────────────────────────────────────
  const insertMarkdown = (field, prefix, suffix, placeholder = "") => {
    const textarea = field === "back" ? backTextareaRef.current : exampleTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const val = addForm[field] || "";
    const selected = val.substring(start, end) || placeholder;
    const replacement = `${prefix}${selected}${suffix}`;
    const newVal = val.substring(0, start) + replacement + val.substring(end);
    setAddForm(f => ({ ...f, [field]: newVal }));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  // ── Single AI Generator ────────────────────────────────────────────────────
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    playSound("whoosh");
    setAiLoading(true);
    try {
      const catName = addForm.category || "Général";
      const formType = addForm.type || "qa";
      const isEnglish = catName.toLowerCase().includes("anglais") || catName.toLowerCase().includes("english");
      const isCode = formType === "code" || catName.toLowerCase().includes("java") || catName.toLowerCase().includes("spring") || catName.toLowerCase().includes("javascript") || catName.toLowerCase().includes("js") || catName.toLowerCase().includes("informatique") || catName.toLowerCase().includes("code") || catName.toLowerCase().includes("python");
      const isTable = formType === "table";

      let structureInstructions = "";
      if (isEnglish) {
        structureInstructions = `
⚠️ RÉTRO-INGÉNIERIE SÉMANTIQUE pour "back" (anglais) :
Traduction : [Traduction courte et naturelle]
### ⚙️ 1. Décomposition & Transition Métaphorique
* **[Mot 1] :** Sens physique : *[Sens brut]* ➔ **Glissement sémantique :** [Explication]
* **Le Modèle Mental :** [Image mécanique globale]
### 🔍 2. Comparatif (Pourquoi A et pas B ?)
* **Option A ([Expression]) :** [Ce que le native visualise]
* **Option B ([Alternative faux-ami]) :** [Pourquoi le sens dévie]
### ⚠️ 3. Anti-Pattern
* **Erreur :** [Ce qu'on dit en FR] ➔ **Problème :** [Sens perçu]
### 💻 4. Exemples
* **Tech/Workflow :** \`[Phrase courte en anglais]\` ↳ *[Traduction française]*
* **Quotidien :** \`[Phrase courte en anglais]\` ↳ *[Traduction française]*`;
      } else if (isCode) {
        structureInstructions = `
⚠️ FICHE DE CODE — ATOMIQUE (une seule cible, verso ≤ 25 mots) :
Choisis UN SEUL angle parmi :
1. Syntaxe / annotation exacte (question directe ou trou à compléter).
2. Comportement d'un snippet court (≤ 5 lignes, dans le recto) : « Que produit ce code ? ».
3. Piège d'exécution classique : « Pourquoi ce code échoue-t-il ? ».
Le verso donne UNIQUEMENT la réponse. Pas de sections Définition/Usage/Exemple/Attention.
Un éventuel exemple complémentaire va dans "example".`;
      }

      const systemPrompt = `Tu es un assistant pédagogique expert pour un étudiant en Licence Informatique à Dakar, Sénégal. Génère UNE fiche de révision en JSON UNIQUEMENT (strictement sans markdown ni backticks autour du json).
Format strict: {"front":"...","back":"...","example":"..."}
${structureInstructions}
${ATOMIC_CARD_RULES}`;

      const raw = await callClaude(systemPrompt, `Génère une fiche sur: ${aiPrompt}`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      setAddForm(f => ({ ...f, front: parsed.front || "", back: parsed.back || "", example: parsed.example || "" }));
      showToast?.("✨ Fiche générée par l'IA !");
      setStats(prev => ({ ...prev, aiGenerated: (prev.aiGenerated || 0) + 1 }));
      setAiPrompt("");
    } catch (error) {
      const msg = error.message?.includes("QUOTA") || error.message?.includes("429") ? "⏳ Quota IA atteint — attends 1 minute !" : "Erreur IA. Réessaie.";
      showToast?.(msg, "error");
    } finally {
      setAiLoading(false);
    }
  };

  // ── Micro AI Helpers ───────────────────────────────────────────────────────
  const handleMicroAI = async (field) => {
    if (!addForm.front.trim()) {
      showToast?.("Saisis d'abord le Recto !", "error");
      return;
    }
    playSound("whoosh");
    setAiLoading(true);
    try {
      const isEnglish = addForm.category.toLowerCase().includes("anglais");
      let prompt = "";
      if (field === "back") prompt = `Explique brièvement (max 3 lignes) ce concept : "${addForm.front}". ${isEnglish ? "Donne la traduction et le contexte." : "Sois pédagogique."} Ne renvoie QUE l'explication.`;
      else if (field === "example") prompt = `Donne un exemple concret pour : "${addForm.front}". ${isEnglish ? "Phrase complète en anglais." : "Code ou mise en situation pratique."} Ne renvoie QUE l'exemple.`;
      const raw = await callClaude("Tu es un assistant pédagogique direct.", prompt);
      setAddForm(f => ({ ...f, [field]: raw.trim() }));
      showToast?.(`✨ ${field === "back" ? "Explication" : "Exemple"} généré !`);
      setStats(prev => ({ ...prev, aiGenerated: (prev.aiGenerated || 0) + 1 }));
    } catch (error) {
      showToast?.("Erreur génération.", "error");
    }
    setAiLoading(false);
  };

  // ── Batch AI Generator ─────────────────────────────────────────────────────
  const handleAIBatchGenerate = async () => {
    if (!aiPrompt.trim()) return;
    playSound("whoosh");
    setAiBatchLoading(true);
    try {
      const { system: systemPrompt, user: userPrompt } = buildBatchPrompt({
        count: aiBatchCount,
        prompt: aiPrompt,
        category: addForm.category,
        formType: addForm.type || "qa",
      });

      const raw = await callClaude(systemPrompt, userPrompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      const cards = parsed.cards || parsed;

      const { layouted, links } = layoutBatchCards(Array.isArray(cards) ? cards : []);
      setBatchLinks(links);
      setBatchCanvasTransform({ x: 0, y: 0, scale: 1 });
      setBatchPreview(layouted);
      setShowBatchPreview(true);
      showToast?.(`✨ ${layouted.length} fiches générées !`, "info");
    } catch (err) {
      showToast?.("Erreur batch.", "error");
    }
    setAiBatchLoading(false);
  };

  const confirmBatch = () => {
    if (batchPreview.length === 0) return;
    const newExps = batchPreview.map(card => ({
      id: card.id || (Date.now().toString() + Math.random()),
      front: card.front || "Concept",
      back: card.back || "",
      example: card.example || "",
      category: addForm.category || categories[0]?.name || "Général",
      level: 0,
      nextReview: today(),
      createdAt: today(),
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewHistory: [],
      imageUrl: null,
    }));
    setExpressions(prev => [...newExps, ...prev]);
    showToast?.(`✨ ${newExps.length} fiches forgées et sauvegardées !`);
    setBatchPreview([]);
    setShowBatchPreview(false);
    setBatchLinks([]);
  };

  const removeBatchCard = (idx) => {
    setBatchPreview(prev => prev.filter((_, i) => i !== idx));
  };

  const addToBatchQueue = (concept) => {
    if (!concept?.trim()) return;
    setAddBatchQueue(q => [...q, concept.trim()]);
    showToast?.(`➕ "${concept.trim()}" ajouté à la file.`);
  };

  const processBatchQueue = async () => {
    if (addBatchQueue.length === 0 || addBatchRunning) return;
    setAddBatchRunning(true);
    try {
      const concepts = [...addBatchQueue];
      const raw = await callClaude(
        `Tu es un assistant de révision. Génère une fiche par concept pour ces ${concepts.length} éléments en JSON: {"cards":[{"front":"...","back":"...","example":"..."}]}`,
        concepts.join(", ")
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      const cards = parsed.cards || [];
      const newExps = cards.map(c => ({
        id: Date.now().toString() + Math.random(),
        front: c.front,
        back: c.back,
        example: c.example || "",
        category: addForm.category || categories[0]?.name || "Général",
        level: 0,
        nextReview: today(),
        createdAt: today(),
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0,
        reviewHistory: [],
      }));
      setExpressions(prev => [...newExps, ...prev]);
      setAddBatchQueue([]);
      showToast?.(`✨ ${newExps.length} fiches de la file forgées !`);
    } catch {
      showToast?.("Erreur traitement de la file", "error");
    }
    setAddBatchRunning(false);
  };

  // ── Chat To Card Copilot ───────────────────────────────────────────────────
  const handleSendChatToCard = async () => {
    if (!chatToCardInput.trim() || chatToCardLoading) return;
    const userMsg = { role: "user", text: chatToCardInput.trim(), cards: [] };
    setChatToCardMessages(prev => [...prev, userMsg]);
    setChatToCardInput("");
    setChatToCardLoading(true);

    try {
      const systemPrompt = `Tu es le Copilot de Fiches MémoMaître. L'étudiant discute avec toi pour comprendre des concepts ou te demander des fiches.
Si la demande s'y prête, génère 1 à 3 fiches en JSON dans ton message sous la balise \`\`\`json {"cards":[{"front":"...","back":"...","example":"..."}]} \`\`\`. Sois concis, chaleureux et précis.`;
      const reply = await callClaude(systemPrompt, userMsg.text);
      let cards = [];
      const jsonMatch = reply.match(/```json([\s\S]*?)```/);
      if (jsonMatch) {
        const parsed = safeParseJSON(jsonMatch[1].trim());
        cards = parsed.cards || [];
      }
      const textOnly = reply.replace(/```json[\s\S]*?```/g, "").trim();
      setChatToCardMessages(prev => [...prev, { role: "assistant", text: textOnly || "Voici tes fiches générées :", cards }]);
    } catch {
      setChatToCardMessages(prev => [...prev, { role: "assistant", text: "Désolé, une erreur est survenue.", cards: [] }]);
    }
    setChatToCardLoading(false);
  };

  const saveChatCard = (card) => {
    const newExp = {
      id: Date.now().toString() + Math.random(),
      front: card.front,
      back: card.back,
      example: card.example || "",
      category: addForm.category || categories[0]?.name || "Général",
      level: 0,
      nextReview: today(),
      createdAt: today(),
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewHistory: [],
    };
    setExpressions(prev => [newExp, ...prev]);
    showToast?.(`💾 Fiche "${card.front}" sauvegardée !`);
  };

  const saveAllChatCards = (cards) => {
    if (!cards?.length) return;
    cards.forEach(c => saveChatCard(c));
    showToast?.(`💾 ${cards.length} fiches sauvegardées !`);
  };

  // ── Analyze Text & Drop to Forge ───────────────────────────────────────────
  const handleAIFromText = async () => {
    if (!aiFromText.trim() || aiFromTextLoading) return;
    setAiFromTextLoading(true);
    try {
      const raw = await callClaude(
        `Extraire les concepts clés de ce texte sous forme de fiches flashcards au format JSON strict: {"cards":[{"front":"...","back":"...","example":"..."}]}`,
        aiFromText
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      setBatchPreview(parsed.cards || []);
      showToast?.(`✨ ${parsed.cards?.length || 0} fiches extraites !`);
    } catch {
      showToast?.("Erreur analyse texte", "error");
    }
    setAiFromTextLoading(false);
  };

  const handleDropToForge = async (e) => {
    e.preventDefault();
    setDragOverForge(false);
    const text = e.dataTransfer.getData("text");
    if (!text?.trim()) return;
    setDropForgeLoading(true);
    try {
      const raw = await callClaude(
        `Transforme cet extrait en une fiche de révision claire en JSON: {"front":"...","back":"...","example":"..."}`,
        text
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      setBatchPreview(p => [...p, { id: `drop_${Date.now()}`, front: parsed.front, back: parsed.back, example: parsed.example || "" }]);
      showToast?.(`✨ Concept "${parsed.front}" forgé !`);
    } catch {
      showToast?.("Erreur forgeage", "error");
    }
    setDropForgeLoading(false);
  };

  // ── Vision / OCR Scan ──────────────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setAddForm(f => ({ ...f, imageUrl: reader.result }));
      setUploadLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleVisionAI = async () => {
    if (!addForm.imageUrl) return;
    setVisionScanLoading(true);
    try {
      const raw = await callClaude(
        `Tu es un OCR intelligent. Analyse l'image fournie et extrais le contenu sous forme de fiches JSON: {"cards":[{"front":"...","back":"..."}]}`,
        `Image data: ${addForm.imageUrl.slice(0, 100)}...`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      setVisionScanCards(parsed.cards || []);
      showToast?.(`📸 ${parsed.cards?.length || 0} fiches détectées !`);
    } catch {
      showToast?.("Erreur analyse OCR", "error");
    }
    setVisionScanLoading(false);
  };

  const confirmVisionScanCards = () => {
    if (!visionScanCards.length) return;
    const newExps = visionScanCards.map(c => ({
      id: Date.now().toString() + Math.random(),
      front: c.front,
      back: c.back,
      example: "",
      category: addForm.category || categories[0]?.name || "Général",
      level: 0,
      nextReview: today(),
      createdAt: today(),
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewHistory: [],
      imageUrl: addForm.imageUrl,
    }));
    setExpressions(prev => [...newExps, ...prev]);
    showToast?.(`💾 ${newExps.length} fiches scan sauvegardées !`);
    setVisionScanCards([]);
    setAddForm(f => ({ ...f, imageUrl: null }));
  };

  // ── Voice Recording & Multimedia ───────────────────────────────────────────
  const startVoice = (field) => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      showToast?.("Reconnaissance vocale non supportée sur ce navigateur", "error");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setAddForm(f => ({ ...f, [field]: (f[field] ? f[field] + " " : "") + transcript }));
      setListening(null);
    };
    recognition.onerror = () => setListening(null);
    recognition.onend = () => setListening(null);
    setListening(field);
    recognition.start();
  };

  const stopVoice = () => setListening(null);

  const generateMetaphore = async () => {
    if (!addForm.front) return;
    setAddMetaphoreLoading(true);
    try {
      const reply = await callClaude("Donne une métaphore parlante en 2 phrases pour expliquer :", addForm.front);
      setAddMetaphoreText(reply);
    } catch {
      showToast?.("Erreur métaphore", "error");
    }
    setAddMetaphoreLoading(false);
  };

  const handleOptimizeFSRS = async () => {
    if (!addForm.front || !addForm.back) return;
    setOptimizeLoading(true);
    try {
      const raw = await callClaude(
        `Optimise cette fiche pour une rétention FSRS maximale (atomicité, clarté, zéro ambiguïté). Format JSON: {"front":"...","back":"...","example":"..."}`,
        `Recto: ${addForm.front}\nVerso: ${addForm.back}\nExemple: ${addForm.example || ""}`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      setAddForm(f => ({ ...f, front: parsed.front || f.front, back: parsed.back || f.back, example: parsed.example || f.example }));
      showToast?.("✨ Fiche optimisée pour FSRS !");
    } catch {
      showToast?.("Erreur optimisation", "error");
    }
    setOptimizeLoading(false);
  };

  // ── Add or Update handler ──────────────────────────────────────────────────
  const handleAdd = () => {
    if (!addForm.front.trim() || !addForm.back.trim()) {
      showToast?.("Le recto et le verso sont obligatoires.", "error");
      return;
    }
    setForgeAnim(true);
    setTimeout(() => setForgeAnim(false), 500);

    if (editingId) {
      setExpressions(prev => prev.map(e => e.id === editingId ? {
        ...e,
        front: addForm.front.trim(),
        back: addForm.back.trim(),
        example: addForm.example?.trim() || "",
        category: addForm.category || e.category,
        type: addForm.type || e.type || "qa",
        imageUrl: addForm.imageUrl || e.imageUrl || null,
      } : e));
      showToast?.("💾 Fiche mise à jour !");
      cancelEdit?.();
    } else {
      const newCard = {
        id: Date.now().toString() + Math.random(),
        front: addForm.front.trim(),
        back: addForm.back.trim(),
        example: addForm.example?.trim() || "",
        category: addForm.category || categories[0]?.name || "Général",
        type: addForm.type || "qa",
        level: 0,
        nextReview: today(),
        createdAt: today(),
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0,
        reviewHistory: [],
        imageUrl: addForm.imageUrl || null,
      };
      setExpressions(prev => [newCard, ...prev]);
      showToast?.("⚡ Fiche forgée avec succès !");
      onCardCreated?.(newCard);
      setAddForm(f => ({ ...f, front: "", back: "", example: "", imageUrl: null }));
    }
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    try {
      const lines = importText.trim().split("\n");
      const imported = lines.map(line => {
        const parts = line.split(",");
        return {
          id: Date.now().toString() + Math.random(),
          front: parts[0]?.trim() || "Concept",
          back: parts[1]?.trim() || "",
          category: parts[2]?.trim() || addForm.category || "Général",
          example: parts[3]?.trim() || "",
          level: 0,
          nextReview: today(),
          createdAt: today(),
          easeFactor: 2.5,
          interval: 1,
          repetitions: 0,
          reviewHistory: [],
        };
      });
      setExpressions(prev => [...imported, ...prev]);
      showToast?.(`📥 ${imported.length} fiches importées !`);
      setImportText("");
      setShowImport(false);
    } catch {
      showToast?.("Erreur format CSV", "error");
    }
  };

  return (
    <div>
      {/* ── MODE ZEN ── */}
      {addZenMode ? (
        <div style={{ animation: "zenFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1)", position: "fixed", inset: 0, zIndex: 99999, background: isDarkMode ? "rgba(7, 13, 31, 0.95)" : "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", padding: "40px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 700, width: "100%", background: "transparent", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h1 style={{ fontWeight: 900, color: theme?.text, margin: 0, fontSize: 40, fontFamily: "'Instrument Serif', Georgia, serif" }}>Deep Focus.</h1>
              <button onClick={() => setAddZenMode(false)} className="hov" style={{ background: isDarkMode ? "rgba(255,255,255,0.1)" : "color-mix(in srgb, var(--mm-primary) 5.0%, transparent)", border: "none", borderRadius: 999, padding: "10px 20px", color: theme?.text, cursor: "pointer", fontWeight: 700 }}>✕ Quitter</button>
            </div>
            <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ width: "100%", padding: "16px 20px", background: "transparent", border: `1px solid ${theme?.border}`, borderRadius: 16, color: theme?.textMuted, fontWeight: 700, fontSize: 16 }}>
              {catNames.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input autoFocus value={addForm.front} onChange={e => { setAddForm(f => ({ ...f, front: e.target.value })); if (e.target.value.length > 3) checkDoublon(e.target.value); }} style={{ width: "100%", padding: "24px", background: isDarkMode ? "#0A0F24" : "#FFFFFF", border: `2px solid ${colorMix(theme?.highlight || "var(--mm-primary)", 25)}`, borderRadius: 20, color: theme?.highlight || "var(--mm-primary)", fontSize: 28, fontWeight: 900, outline: "none" }} placeholder="Concept à maîtriser..." />
            {addDoublonCheck?.duplicate && <div style={{ background: "color-mix(in srgb, var(--mm-primary) 10%, white)", padding: 8, borderRadius: 8, marginBottom: 12, color: "var(--mm-primary-deep)" }}>⚠️ Semble être un doublon de : <strong>{addDoublonCheck.existingConcept}</strong>. {addDoublonCheck.conseil}</div>}
            <textarea value={addForm.back} onChange={e => setAddForm(f => ({ ...f, back: e.target.value }))} style={{ width: "100%", padding: "24px", background: isDarkMode ? "#0A0F24" : "#FFFFFF", border: `1px solid ${theme?.border}`, borderRadius: 20, color: theme?.text, minHeight: 160, fontSize: 18, lineHeight: 1.6, resize: "vertical", outline: "none" }} placeholder="L'explication claire et détaillée..." />
            <input value={addForm.example} onChange={e => setAddForm(f => ({ ...f, example: e.target.value }))} style={{ width: "100%", padding: "20px 24px", background: isDarkMode ? "#0A0F24" : "#FFFFFF", border: `1px solid ${theme?.border}`, borderRadius: 20, color: theme?.textMuted, fontSize: 16, fontStyle: "italic", outline: "none" }} placeholder="Mise en contexte ou exemple de code..." />
            <button onClick={() => { handleAdd(); setAddZenMode(false); }} className="btn-glow hov" disabled={!addForm.front || !addForm.back} style={{ width: "100%", padding: "20px", background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", color: "white", border: "none", borderRadius: 20, fontWeight: 900, fontSize: 18, cursor: "pointer", opacity: addForm.front && addForm.back ? 1 : 0.5, marginTop: 10 }}>⚡ Forger la fiche</button>
          </div>
        </div>
      ) : (
        /* ── VUE NORMALE ── */
        <div style={{ animation: "fadeUp 0.4s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: theme?.highlight || "var(--mm-primary)", letterSpacing: "-1px" }}>{editingId ? "✏️ Mode Édition" : "⚡ Forge à Fiches"}</h1>
              <p style={{ color: theme?.textMuted, fontSize: 14, marginTop: 6 }}>{editingId ? "Ajuste ta fiche." : "Crée, génère en rafale, importe ou analyse une image."}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setAddZenMode(true)} className="hov" style={{ padding: "10px 20px", background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 12, color: theme?.text, fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><span>🧘</span> Mode Zen</button>
              {editingId && <button onClick={cancelEdit} className="hov" style={{ background: "#FEF2F2", color: "#EF4444", border: "1px solid #FECACA", borderRadius: 12, padding: "10px 20px", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>✕ Annuler</button>}
            </div>
          </div>

          {/* Tabs de sous-vue */}
          {!editingId && (
            <div className="add-tabs-cluster" style={{ display: "flex", gap: 8, marginBottom: 32, background: isDarkMode ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", padding: 8, borderRadius: 24, border: `1px solid ${theme?.border}`, boxShadow: "0 10px 30px color-mix(in srgb, var(--mm-primary) 5.0%, transparent)", overflowX: "auto" }}>
              {[
                { id: "single", icon: "✦", label: "Fiche unique" },
                { id: "chat", icon: "💬", label: "Copilot IA" },
                { id: "batch", icon: "🚀", label: "Batch IA" },
                { id: "text", icon: "📄", label: "Depuis un texte" },
                { id: "file", icon: "📸", label: "Scan OCR" },
                { id: "quickadd", icon: "⚡", label: "Quick Add" },
              ].map(t => (
                <button key={t.id} onClick={() => { setAddSubView?.(t.id); setShowBatchPreview(false); }} className="hov" style={{ flex: 1, minWidth: 120, padding: "12px 16px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800, background: addSubView === t.id ? "white" : "transparent", color: addSubView === t.id ? "var(--mm-primary)" : theme?.textMuted }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          )}

          {/* ========= BATCH QUEUE ========= */}
          {addBatchQueue.length > 0 && (
            <div style={{ background: theme?.cardBg, borderRadius: 16, padding: "14px 20px", marginBottom: 20, border: `1px solid ${theme?.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><span style={{ fontWeight: 800, color: theme?.text }}>{addBatchQueue.length} concepts en file</span> <span style={{ color: theme?.textMuted }}>{addBatchQueue.slice(0, 3).join(', ')}{addBatchQueue.length > 3 ? '...' : ''}</span></div>
              <button onClick={processBatchQueue} disabled={addBatchRunning} className="hov btn-glow" style={{ background: "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))", color: "white", border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 800, cursor: "pointer" }}>{addBatchRunning ? "⏳" : "▶️ Traiter"}</button>
            </div>
          )}

          {/* ========= SINGLE / EDITION ========= */}
          {(addSubView === "single" || editingId) && (
            <div style={{ background: "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary) 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32, boxShadow: "0 15px 35px rgba(123,95,245,0.2)" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>✨</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Auto-Génération IA</div><div style={{ color: "color-mix(in srgb, var(--mm-primary) 4%, white)", fontSize: 13 }}>L'IA s'adapte automatiquement au module sélectionné.</div></div></div>
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !aiLoading && handleAIGenerate()} style={{ flex: 1, padding: "16px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white" }} placeholder='Ex: "Interface vs Classe abstraite"...' />
                <button className="hov btn-glow" onClick={handleAIGenerate} disabled={aiLoading} style={{ padding: "16px 28px", background: "white", color: "var(--mm-primary)", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer" }}>{aiLoading ? "⏳" : "Générer"}</button>
              </div>
            </div>
          )}

          {/* ========= CHAT COPILOT ========= */}
          {addSubView === "chat" && !editingId && (
            <div style={{ display: "flex", flexDirection: "column", height: "65vh", minHeight: 500, background: theme?.cardBg, borderRadius: 24, border: `1px solid ${theme?.border}`, overflow: "hidden", marginBottom: 32 }}>
              <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, var(--mm-primary-deep) 0%, var(--mm-primary) 100%)", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>💬 Copilot de Fiches</div>
                  <div style={{ fontSize: 13, color: "color-mix(in srgb, var(--mm-primary) 4%, white)" }}>Discute pour forger ou ajuster tes fiches</div>
                </div>
                <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12, color: "white", fontWeight: 700, outline: "none" }}>
                  {catNames.map(c => <option key={c} value={c} style={{ color: "#000" }}>{c}</option>)}
                </select>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
                {chatToCardMessages.map((msg, idx) => (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 8 }}>
                    <div style={{ maxWidth: "80%", padding: "14px 18px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))" : theme?.inputBg, color: msg.role === "user" ? "white" : theme?.text, fontSize: 14, lineHeight: 1.5, border: msg.role === "user" ? "none" : `1px solid ${theme?.border}` }}>
                      {msg.text}
                    </div>

                    {msg.cards && msg.cards.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: "90%", marginTop: 4 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                          {msg.cards.map((card, cidx) => (
                            <div key={cidx} style={{ background: theme?.cardBg, borderRadius: 16, padding: "16px", border: `1px solid ${theme?.border}`, position: "relative" }}>
                              <div style={{ fontSize: 10, color: theme?.highlight, fontWeight: 900, marginBottom: 4, letterSpacing: 1 }}>RECTO</div>
                              <div style={{ fontWeight: 800, color: theme?.text, marginBottom: 12 }}>{card.front}</div>
                              <div style={{ fontSize: 10, color: theme?.highlight, fontWeight: 900, marginBottom: 4, letterSpacing: 1 }}>VERSO</div>
                              <div style={{ marginTop: 8, marginBottom: card.example ? 12 : 0 }}>
                                <GodTierContent text={card.back} theme={theme} isDarkMode={isDarkMode} />
                              </div>
                              {card.example && <div style={{ padding: "8px 12px", background: theme?.inputBg, borderRadius: 8, fontSize: 12, color: theme?.text, fontStyle: "italic", borderLeft: `3px solid ${theme?.highlight}`, marginTop: 12 }}>{card.example}</div>}
                              <button onClick={() => saveChatCard(card)} className="hov" style={{ marginTop: 12, width: "100%", padding: "8px", background: theme?.inputBg, color: theme?.highlight, border: `1px solid ${colorMix(theme?.highlight, 25)}`, borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>💾 Sauver</button>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => saveAllChatCards(msg.cards)} className="hov btn-glow" style={{ alignSelf: "flex-start", padding: "10px 20px", background: "linear-gradient(135deg, #22C55E, #16A34A)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>💾 Sauver cette génération ({msg.cards.length})</button>
                      </div>
                    )}
                  </div>
                ))}
                {chatToCardLoading && <div style={{ alignSelf: "flex-start", display: "flex", gap: 6, padding: "14px 18px", background: theme?.inputBg, borderRadius: "18px 18px 18px 4px", border: `1px solid ${theme?.border}` }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: theme?.highlight, animation: `pulse 1.2s ${i * 0.2}s infinite` }} />)}</div>}
                <div ref={chatToCardEndRef} />
              </div>

              <div style={{ padding: "16px 24px", background: theme?.cardBg, borderTop: `1px solid ${theme?.border}`, display: "flex", gap: 12 }}>
                <input value={chatToCardInput} onChange={e => setChatToCardInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendChatToCard()} placeholder="Demande tes fiches à l'IA..." style={{ flex: 1, padding: "14px 20px", background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 16, color: theme?.text, fontSize: 15, outline: "none" }} />
                <button onClick={handleSendChatToCard} disabled={chatToCardLoading || !chatToCardInput.trim()} className="btn-glow hov" style={{ padding: "14px 24px", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))", color: "white", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer", opacity: chatToCardLoading || !chatToCardInput.trim() ? 0.5 : 1 }}>{chatToCardLoading ? "⏳" : "Envoyer"}</button>
              </div>
            </div>
          )}

          {/* ========= BATCH CANVAS ========= */}
          {addSubView === "batch" && !editingId && (
            <div style={{ background: "linear-gradient(135deg, #1A0800 0%, var(--mm-primary-deep) 50%, var(--mm-primary) 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ fontSize: 32 }}>🚀</span><div><div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Génération en Rafale</div><div style={{ color: "color-mix(in srgb, var(--mm-primary) 4%, white)", fontSize: 13 }}>L'IA génère plusieurs fiches d'un coup.</div></div></div>
              <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ padding: "14px 16px", background: "var(--mm-primary-deep)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, color: "white", fontWeight: 700 }}>
                  {catNames.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} style={{ flex: 1, minWidth: 200, padding: "16px 20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white" }} placeholder='Ex: "Annotations Spring Boot"...' />
                <select value={aiBatchCount} onChange={e => setAiBatchCount(+e.target.value)} style={{ padding: "14px 16px", background: "var(--mm-primary-deep)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, color: "white", fontWeight: 700 }}>{[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} fiches</option>)}</select>
                <button className="hov btn-glow" onClick={handleAIBatchGenerate} disabled={aiBatchLoading || !aiPrompt.trim()} style={{ padding: "16px 28px", background: "white", color: "var(--mm-primary)", border: "none", borderRadius: 16, fontWeight: 800, cursor: "pointer" }}>{aiBatchLoading ? "⏳" : `🚀 ×${aiBatchCount}`}</button>
              </div>

              {showBatchPreview && batchPreview.length > 0 && (
                <div style={{ marginTop: 24, padding: 20, background: isDarkMode ? "#0A0F24" : "var(--mm-bg-elev)", borderRadius: 20, border: `1px solid ${theme?.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, color: theme?.text }}>Constellation générée ({batchPreview.length} fiches)</div>
                    <button onClick={confirmBatch} style={{ padding: "10px 20px", background: "linear-gradient(135deg,#22C55E,#16A34A)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>💾 Tout Forger</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                    {batchPreview.map((card, idx) => (
                      <div key={idx} style={{ background: theme?.cardBg, padding: 16, borderRadius: 14, border: `1px solid ${theme?.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: theme?.highlight }}>#{idx + 1}</span>
                          <button onClick={() => removeBatchCard(idx)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer" }}>✕</button>
                        </div>
                        <input value={card.front} onChange={e => setBatchPreview(p => p.map((c, i) => i === idx ? { ...c, front: e.target.value } : c))} style={{ width: "100%", fontWeight: 700, color: theme?.text, background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 8, padding: 8, marginBottom: 8 }} />
                        <textarea value={card.back} onChange={e => setBatchPreview(p => p.map((c, i) => i === idx ? { ...c, back: e.target.value } : c))} style={{ width: "100%", fontSize: 13, color: theme?.text, background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 8, padding: 8, minHeight: 60 }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========= FROM TEXT ========= */}
          {addSubView === "text" && !editingId && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 20, marginBottom: 32 }}>
              <div style={{ background: "linear-gradient(135deg, var(--mm-primary-deep) 0%, var(--mm-primary-deep) 50%, var(--mm-primary) 100%)", borderRadius: 24, padding: "28px 32px", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 32 }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Source & Forge</div>
                    <div style={{ color: "color-mix(in srgb, var(--mm-primary) 4%, white)", fontSize: 13 }}>Colle un texte ou cours complet</div>
                  </div>
                </div>
                <textarea value={aiFromText} onChange={e => setAiFromText(e.target.value)} style={{ width: "100%", padding: "16px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, fontSize: 15, color: "white", minHeight: 200, resize: "vertical" }} placeholder="Colle ton cours complet ici..." />
                <button onClick={handleAIFromText} disabled={aiFromTextLoading || !aiFromText.trim()} style={{ marginTop: 12, padding: "12px 20px", background: "white", color: "var(--mm-primary-deep)", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>{aiFromTextLoading ? "⏳" : "Tout analyser"}</button>
              </div>

              <div onDragOver={(e) => { e.preventDefault(); setDragOverForge(true); }} onDragLeave={() => setDragOverForge(false)} onDrop={handleDropToForge} style={{ background: dragOverForge ? `${colorMix(theme?.highlight, 13)}` : theme?.cardBg, border: `2px dashed ${theme?.border}`, borderRadius: 24, padding: "28px 32px", display: "flex", flexDirection: "column", minHeight: 280 }}>
                <div style={{ fontWeight: 900, color: theme?.text, fontSize: 18, marginBottom: 8 }}>⚒️ La Forge</div>
                <p style={{ color: theme?.textMuted, fontSize: 13 }}>Glisse un extrait de texte ici pour créer une fiche instantanément.</p>
                {dropForgeLoading && <div style={{ color: theme?.highlight, fontWeight: 700 }}>⏳ Forgeage en cours...</div>}
              </div>
            </div>
          )}

          {/* ========= OCR SCAN ========= */}
          {addSubView === "file" && !editingId && (
            <div style={{ background: "linear-gradient(135deg, var(--mm-primary-deep) 0%, var(--mm-primary) 50%, var(--mm-primary) 100%)", borderRadius: 24, padding: "28px 32px", marginBottom: 32 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 32 }}>📸</span>
                <div>
                  <div style={{ fontWeight: 800, color: "white", fontSize: 16 }}>Scan → Fiches</div>
                  <div style={{ color: "color-mix(in srgb, var(--mm-primary) 4%, white)", fontSize: 13 }}>Prends en photo tes notes de cours</div>
                </div>
              </div>
              {!addForm.imageUrl ? (
                <div style={{ border: "2px dashed rgba(255,255,255,0.4)", borderRadius: 16, padding: "40px 20px", textAlign: "center" }}>
                  <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} id="file-upload-ocr" />
                  <label htmlFor="file-upload-ocr" style={{ cursor: "pointer", color: "white", fontWeight: 800, fontSize: 16 }}>📤 Choisir une photo</label>
                </div>
              ) : (
                <div>
                  <img src={addForm.imageUrl} alt="aperçu" style={{ maxHeight: 200, borderRadius: 12, marginBottom: 12 }} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={handleVisionAI} disabled={visionScanLoading} style={{ padding: "12px 24px", background: "white", color: "var(--mm-primary-deep)", border: "none", borderRadius: 12, fontWeight: 900, cursor: "pointer" }}>{visionScanLoading ? "⏳ Extraction..." : "📸 Extraire les fiches"}</button>
                    <button onClick={() => setAddForm(f => ({ ...f, imageUrl: null }))} style={{ padding: "12px 20px", background: "rgba(255,255,255,0.2)", color: "white", border: "none", borderRadius: 12 }}>Changer</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========= QUICK ADD ========= */}
          {addSubView === "quickadd" && !editingId && (
            <div style={{ marginBottom: 32 }}>
              <SmartPasteBox
                theme={theme}
                isDarkMode={isDarkMode}
                callClaude={callClaude}
                onGenerate={async ({ raw, kind, style }) => {
                  const cards = await generateCardsFromSmartPaste({
                    raw, kind, style, callClaude,
                    category: addForm.category || "Quick Add",
                  });
                  if (!cards.length) { showToast?.("L'IA n'a rien retourné.", "error"); return; }
                  setBatchPreview(cards);
                  setShowBatchPreview(true);
                  showToast?.(`✨ ${cards.length} fiches générées`, "success");
                }}
              />
            </div>
          )}

          {/* FORMULAIRE PRINCIPAL */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 20, alignItems: "start" }} className="add-form-grid">
            {/* Colonne gauche : Éditeur */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <select value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} style={{ padding: "10px 16px", background: (theme?.highlight || "var(--mm-primary)") + "15", border: `1px solid ${colorMix((theme?.highlight || "var(--mm-primary)"), 25)}`, borderRadius: 12, fontSize: 13, fontWeight: 800, color: theme?.highlight || "var(--mm-primary)", cursor: "pointer", outline: "none" }}>{catNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </div>

              <div style={{ position: "relative" }}>
                <label style={{ position: "absolute", top: -10, left: 16, background: theme?.bg, padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme?.highlight || "var(--mm-primary)", letterSpacing: 1, zIndex: 2 }}>RECTO <span style={{ color: "#EF4444" }}>*</span></label>
                <input autoFocus value={addForm.front} onChange={(e) => { setAddForm((f) => ({ ...f, front: e.target.value })); if (e.target.value.length > 3 && !editingId) checkDoublon(e.target.value); }} style={{ width: "100%", padding: "18px 54px 18px 20px", background: theme?.cardBg, border: `2px solid ${theme?.border}`, borderRadius: 16, fontSize: 16, color: theme?.text, fontWeight: 700, outline: "none" }} placeholder="Le concept à mémoriser..." />
                <button onClick={() => listening === "front" ? stopVoice() : startVoice("front")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: theme?.inputBg, border: `1px solid ${theme?.border}`, cursor: "pointer", fontSize: 18, padding: 8, borderRadius: 10, color: listening === "front" ? "#EF4444" : theme?.textMuted }}>🎙️</button>
                {addDoublonCheck?.duplicate && <div style={{ marginTop: 8, background: "color-mix(in srgb, var(--mm-primary) 10%, white)", padding: 8, borderRadius: 8, color: "var(--mm-primary-deep)", fontSize: 13 }}>⚠️ Doublon possible : <strong>{addDoublonCheck.existingConcept}</strong>. {addDoublonCheck.conseil}</div>}
              </div>

              {/* Type de fiche avec sélecteur compact déroulant et refermeture automatique */}
              {(() => {
                const currentType = CARD_TYPES.find(t => t.id === (addForm.type || "qa")) || CARD_TYPES[0];
                return (
                  <div ref={typeMenuRef} style={{ background: theme?.cardBg, padding: "10px 14px", borderRadius: 14, border: `1px solid ${typeMenuOpen ? (theme?.highlight || "var(--mm-primary)") : (theme?.border || "rgba(255,255,255,0.1)")}`, position: "relative", transition: "all 0.2s ease" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: theme?.textMuted, letterSpacing: 1.2 }}>TYPE DE FICHE</div>
                      {typeMenuOpen && (
                        <span style={{ fontSize: 10, color: theme?.highlight || "var(--mm-primary)", fontWeight: 800 }}>
                          Sélectionnez pour fermer
                        </span>
                      )}
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => setTypeMenuOpen(prev => !prev)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: `1px solid ${typeMenuOpen ? (theme?.highlight || "var(--mm-primary)") : (isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)")}`,
                        background: typeMenuOpen
                          ? (isDarkMode ? "rgba(37,99,235,0.18)" : "rgba(37,99,235,0.08)")
                          : (isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"),
                        color: theme?.text,
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 13,
                        transition: "all 0.15s ease"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 16 }}>{currentType.icon}</span>
                        <span style={{ color: theme?.highlight || "var(--mm-primary)", fontWeight: 900 }}>{currentType.label}</span>
                        <span style={{ fontSize: 11, color: theme?.textMuted, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          — {currentType.desc}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: theme?.textMuted, transition: "transform 0.2s ease", transform: typeMenuOpen ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0, marginLeft: 8 }}>
                        ▼
                      </span>
                    </button>

                    {typeMenuOpen && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          right: 0,
                          zIndex: 60,
                          background: isDarkMode ? "rgba(15, 23, 42, 0.97)" : "rgba(255, 255, 255, 0.98)",
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                          borderRadius: 14,
                          padding: "10px",
                          border: `1px solid ${theme?.highlight || "var(--mm-primary)"}`,
                          boxShadow: isDarkMode ? "0 16px 36px rgba(0,0,0,0.6)" : "0 12px 30px rgba(37,99,235,0.18)",
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                          gap: 6,
                          animation: "fadeUp 0.18s ease-out forwards"
                        }}
                      >
                        {CARD_TYPES.map(t => {
                          const isSelected = (addForm.type || "qa") === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setAddForm(f => ({ ...f, type: t.id }));
                                setTypeMenuOpen(false); // ⚡ Refermeture automatique instantanée !
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: `1px solid ${isSelected ? (theme?.highlight || "var(--mm-primary)") : "transparent"}`,
                                background: isSelected
                                  ? (isDarkMode ? "rgba(37,99,235,0.28)" : "rgba(37,99,235,0.12)")
                                  : (isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
                                color: isSelected ? (theme?.highlight || "var(--mm-primary)") : theme?.text,
                                fontSize: 12,
                                fontWeight: isSelected ? 900 : 700,
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 0.15s ease"
                              }}
                            >
                              <span style={{ fontSize: 14 }}>{t.icon}</span>
                              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={{ position: "relative" }}>
                <label style={{ position: "absolute", top: -10, left: 16, background: theme?.bg, padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme?.highlight || "var(--mm-primary)", letterSpacing: 1, zIndex: 2 }}>VERSO <span style={{ color: "#EF4444" }}>*</span></label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8, padding: "6px 8px", background: theme?.inputBg, borderRadius: 10, border: `1px solid ${theme?.border}` }}>
                  {[
                    { label: "Titre", icon: "H", insert: () => insertMarkdown("back", "## ", "", "Titre") },
                    { label: "Gras", icon: "B", insert: () => insertMarkdown("back", "**", "**", "gras") },
                    { label: "Italique", icon: "I", insert: () => insertMarkdown("back", "*", "*", "italique") },
                    { label: "Code", icon: "</>", insert: () => insertMarkdown("back", "\n```js\n", "\n```\n", "// code") },
                  ].map((b, i) => (
                    <button key={i} type="button" onClick={b.insert} style={{ minWidth: 32, height: 28, padding: "0 8px", borderRadius: 8, border: `1px solid ${theme?.border}`, background: theme?.cardBg, color: theme?.text, cursor: "pointer", fontSize: 12, fontWeight: 800 }}>
                      {b.icon}
                    </button>
                  ))}
                </div>
                <textarea ref={backTextareaRef} value={addForm.back} onChange={(e) => setAddForm((f) => ({ ...f, back: e.target.value }))} style={{ width: "100%", padding: "20px", background: theme?.cardBg, border: `2px solid ${theme?.border}`, borderRadius: 16, fontSize: 15, color: theme?.text, minHeight: 160, resize: "vertical", outline: "none" }} placeholder="L'explication claire..." />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => handleMicroAI("back")} disabled={aiLoading} style={{ background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 15.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 10%, white)", color: "var(--mm-primary)", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>🤖 Expliquer avec l'IA</button>
                  <button onClick={generateMetaphore} disabled={addMetaphoreLoading} style={{ background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 15.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 10%, white)", color: "var(--mm-primary)", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>🌱 Métaphore</button>
                </div>
                {addMetaphoreText && <div style={{ marginTop: 8, padding: 10, background: "color-mix(in srgb, var(--mm-primary) 4%, white)", borderRadius: 8, fontSize: 13, fontStyle: "italic", color: "var(--mm-primary-deep)" }}>{addMetaphoreText}</div>}
              </div>

              <div style={{ position: "relative" }}>
                <label style={{ position: "absolute", top: -10, left: 16, background: theme?.bg, padding: "0 8px", fontSize: 11, fontWeight: 900, color: theme?.highlight || "var(--mm-primary)", letterSpacing: 1, zIndex: 2 }}>EXEMPLE</label>
                <textarea ref={exampleTextareaRef} value={addForm.example} onChange={(e) => setAddForm((f) => ({ ...f, example: e.target.value }))} style={{ width: "100%", padding: "16px", background: theme?.cardBg, border: `2px solid ${theme?.border}`, borderRadius: 16, fontSize: 14, color: theme?.text, outline: "none", minHeight: 70, resize: "vertical" }} placeholder="Exemple pratique ou code..." />
              </div>

              {/* Jauge FSRS */}
              {memScore && (
                <div style={{ background: theme?.cardBg, padding: "16px 20px", borderRadius: 16, border: `1px solid ${theme?.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: theme?.text }}>🧠 Mémorabilité FSRS</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: memScore.color }}>{memScore.label} ({memScore.score}%)</span>
                  </div>
                  <div style={{ height: 6, background: theme?.inputBg, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: `${memScore.score}%`, background: memScore.color }} />
                  </div>
                  {memScore.score < 80 && (
                    <button onClick={handleOptimizeFSRS} disabled={optimizeLoading} style={{ width: "100%", padding: "8px", background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer", fontSize: 12 }}>
                      {optimizeLoading ? "⏳ Optimisation..." : "✨ Optimiser pour FSRS"}
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={handleAdd} disabled={!addForm.front.trim() || !addForm.back.trim()} style={{ flex: 1, padding: "18px 24px", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 900, cursor: "pointer", boxShadow: "0 10px 30px color-mix(in srgb, var(--mm-primary) 30.0%, transparent)" }}>{editingId ? "💾 Mettre à jour" : "⚡ Forger la fiche"}</button>
                {!editingId && <button onClick={() => setAddForm(f => ({ ...f, front: "", back: "", example: "", imageUrl: null }))} style={{ padding: "18px 24px", background: theme?.cardBg, color: theme?.textMuted, border: `1px solid ${theme?.border}`, borderRadius: 16, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Effacer</button>}
              </div>
            </div>

            {/* Colonne droite : Live Preview */}
            <div style={{ position: "sticky", top: 100, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: theme?.textMuted, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace", paddingLeft: 12 }}>LIVE PREVIEW</div>
              <HoloCard theme={theme} glowColor={theme?.highlight} style={{ background: theme?.cardBg, border: `1px solid ${theme?.border}`, borderRadius: 32, padding: "36px", boxShadow: "0 30px 60px color-mix(in srgb, var(--mm-primary) 5.0%, transparent)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 8, flexWrap: "wrap" }}>
                  <span style={{ background: (theme?.highlight || "var(--mm-primary)") + "15", color: theme?.highlight, padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 800, border: `1px solid ${colorMix((theme?.highlight || "var(--mm-primary)"), 25)}` }}>{addForm.category || "Catégorie"}</span>
                  <span style={{ background: "color-mix(in srgb, var(--mm-primary) 15.0%, transparent)", color: "var(--mm-primary)", padding: "6px 14px", borderRadius: 10, fontSize: 11, fontWeight: 800 }}>Niveau 0</span>
                </div>

                <div style={{ fontSize: 28, fontWeight: 900, color: addForm.front ? theme?.text : theme?.textMuted, marginBottom: 20 }}>{addForm.front || "Le concept apparaîtra ici..."}</div>
                {addForm.imageUrl && <img src={addForm.imageUrl} alt="media" style={{ width: "100%", borderRadius: 16, marginBottom: 16, border: `1px solid ${theme?.border}` }} />}

                <div style={{ background: isDarkMode ? "rgba(255,255,255,0.03)" : "color-mix(in srgb, var(--mm-primary) 4%, white)", border: `1px solid ${theme?.border}`, borderRadius: 24, padding: "24px" }}>
                  <div style={{ color: theme?.text, lineHeight: 1.6, fontSize: 14 }}>
                    <RichText content={addForm.back || "*Le verso apparaîtra ici…*"} style={{ color: theme?.text }} />
                  </div>
                  {addForm.example && (
                    <div style={{ marginTop: 16, padding: "14px 18px", background: theme?.cardBg, borderRadius: 14, fontSize: 13, color: theme?.textMuted, borderLeft: `4px solid ${theme?.highlight}` }}>
                      <RichText content={addForm.example} style={{ color: theme?.textMuted }} />
                    </div>
                  )}
                </div>
              </HoloCard>

              {/* Import CSV */}
              <div style={{ background: theme?.cardBg, border: `1px solid ${theme?.border}`, borderRadius: 16, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: theme?.textMuted }}>📤 Import en masse (CSV)</span><button onClick={() => setShowImport(!showImport)} style={{ background: theme?.inputBg, color: theme?.highlight, border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{showImport ? "Fermer" : "Ouvrir"}</button></div>
                {showImport && <div style={{ marginTop: 12 }}><textarea value={importText} onChange={(e) => setImportText(e.target.value)} style={{ width: "100%", padding: "12px", background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 12, fontSize: 12, color: theme?.text, minHeight: 80 }} placeholder="front,back,category,example..." /><button onClick={handleImport} style={{ width: "100%", padding: "10px", background: "var(--mm-primary)", color: "white", border: "none", borderRadius: 10, fontWeight: 700, marginTop: 8, cursor: "pointer" }}>Importer</button></div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
