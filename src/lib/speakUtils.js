// src/lib/speakUtils.js — Helper TTS pour prononciation d'expressions et d'exemples
import { speakWithGroq, stopCurrent } from "./groqTTS.js";

/**
 * Nettoie un texte pour ne garder que l'expression / phrase en anglais.
 * Supprime les emojis, le markdown, et tronque la traduction française qui suit -> ou ↳
 */
export function extractEnglishSpeechText(text) {
  if (!text || typeof text !== "string") return "";

  let clean = text
    .replace(/^#+\s*/g, "") // Supprime # ## ###
    .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2}/gu, "") // Supprime TOUS les emojis et drapeaux régionaux (🇬🇧, 🇫🇷, etc.)
    .replace(/[`*_~]/g, "") // Supprime markdown formatting (*, _, `)
    .trim();

  // 1. REJET STRICT : Si la ligne est une section explicative en français
  if (/(?:mini[- ]dialogue|dialogue|vrai\s+sens|traduction|attention(?:\s+au\s+piège)?|le\s+piège|la\s+règle(?:\s+réflexe)?|anti-pattern|comparatif|option\s+[ab]|erreur|problème)\s*:/i.test(clean)) {
    return "";
  }

  // 2. Si la ligne commence par une flèche de traduction française isolée (↳ ou ->)
  if (/^[↳\->]+\s*/.test(clean)) {
    return "";
  }

  // 3. Isole l'anglais dans un dialogue type "* A : Can we play? ↳ Pouvons-nous..." ou "- **A** : ..."
  clean = clean.replace(/^(?:[\*\-\•\–\—]\s*)?(?:[A-Za-z]\s*:\s*)/i, "").trim();

  // 4. Si la ligne est "En réalité, on dit :" ou "Tu as dit :"
  const realityMatch = clean.match(/(?:En réalité, on dit|Tu as dit)\s*:\s*["«']?([^"»\n]+)["»']?/i);
  if (realityMatch && realityMatch[1]) {
    clean = realityMatch[1].trim();
  }

  // 5. Supprime toute traduction française qui suit ↳, -> ou --
  const splitIdx = clean.search(/\s*(?:->|↳|--)\s*/);
  if (splitIdx !== -1) {
    clean = clean.slice(0, splitIdx).trim();
  }

  // 6. Supprime les préfixes de contexte (Tech/Workflow, Quotidien, etc.)
  clean = clean.replace(/^(?:Contexte\s+[^:]+:|Tech\/Workflow\s*:|Quotidien\s*:|Usage\s*:|Exemple\s*\d*\s*:)/i, "").trim();

  // 7. Nettoyage des guillemets résiduels
  clean = clean.replace(/^["'«“]\s*/, "").replace(/\s*["'»”]$/, "").trim();

  // 8. Garde-fou anti-bruit : longueur min et présence de lettres
  if (clean.length < 2 || !/[a-zA-Z]/.test(clean)) return "";

  // 9. Rejet strict si le texte est du français
  if (detectLanguage(clean) === "fr-FR") return "";

  // 10. Rejet strict si le texte ressemble à du code informatique ou un opérateur
  if (/[()\[\]{};$=><+\/*_]/.test(clean) || /^(cond|nil|t|car|cdr|cons|defun|setq|setf|let|lambda|if|when|unless|return|def|var|val|function|expr|test)$/i.test(clean)) {
    return "";
  }

  return clean;
}

// Cache des voix pour les navigateurs à chargement asynchrone (Chrome / Safari / Webview)
let cachedVoices = [];
if (typeof window !== "undefined" && window.speechSynthesis) {
  try {
    cachedVoices = window.speechSynthesis.getVoices() || [];
    window.speechSynthesis.onvoiceschanged = () => {
      try {
        cachedVoices = window.speechSynthesis.getVoices() || [];
      } catch {}
    };
  } catch {}
}

// Référence persistante anti-garbage-collector (bug Chromium / WebKit où l'utterance est détruite avant onend)
let activeUtterance = null;

/**
 * Détecte si un texte est en français ou en anglais pour attribuer le bon accent/moteur vocal
 */
export function detectLanguage(text) {
  if (!text || typeof text !== "string") return "en-US";
  const str = text.toLowerCase();
  
  // Accents et caractères exclusifs au français
  if (/[éèêëàâôûùïîçœæ]/.test(str)) return "fr-FR";

  // Mots grammaticaux français à haute fréquence
  const frenchWords = /\b(le|la|les|un|une|des|du|de|d'|l'|dans|avec|pour|par|sur|est|sont|c'est|qui|que|quoi|ce|cette|ces|mais|ou|et|donc|or|ni|car|ne|pas|plus|sans|très|vrai|sens|règle|piège|attention|erreur|vouloir|savoir|résout|syntaxe|forme|chaque|toutes|tous|clause|clauses|renvoie|renvoyé|retourne|retournée|valeur|valeurs|dès|lorsque|lorsqu'|agit|comme|astuce|symbole|toujours|vraie|vrai|faux|paire|paires|séquentiellement)\b/i;
  
  // Mots grammaticaux anglais à haute fréquence
  const englishWords = /\b(the|a|an|and|or|but|if|in|on|at|to|for|with|from|by|about|as|into|like|through|after|over|between|out|against|during|without|before|under|around|among|this|that|these|those|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|shall|should|may|might|must|can|could)\b/i;

  const frenchMatches = (str.match(new RegExp(frenchWords, "gi")) || []).length;
  const englishMatches = (str.match(new RegExp(englishWords, "gi")) || []).length;

  if (frenchMatches > englishMatches) return "fr-FR";
  if (englishMatches > frenchMatches) return "en-US";

  return "en-US";
}

/**
 * Sélectionne la meilleure voix disponible.
 * En mode hors ligne, privilégie STRICTEMENT localService: true (voix locales de l'OS)
 * pour éviter les erreurs d'événements réseau ("network") de Chromium.
 */
export function getBestVoice(voices, lang = "en-US", isOffline = false) {
  if (!voices || voices.length === 0) return null;
  const langPrefix = lang.toLowerCase().slice(0, 2);

  const exactLangVoices = voices.filter(v => v.lang && v.lang.toLowerCase().replace("_", "-") === lang.toLowerCase());
  const prefixVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
  const candidateVoices = exactLangVoices.length > 0 ? exactLangVoices : prefixVoices;

  if (isOffline) {
    // Hors ligne : impératif de prendre une voix présente localement sur l'appareil
    const localInLang = candidateVoices.find(v => v.localService === true);
    if (localInLang) return localInLang;

    const anyLocal = voices.find(v => v.localService === true);
    if (anyLocal) return anyLocal;
  } else {
    const naturalInLang = candidateVoices.find(v => !/male/i.test(v.name) && (v.name.includes("Natural") || v.name.includes("Neural") || v.name.includes("Google") || v.localService));
    if (naturalInLang) return naturalInLang;
  }

  const bestCandidate = candidateVoices.find(v => !/male/i.test(v.name)) || candidateVoices[0];
  if (bestCandidate) return bestCandidate;

  return voices.find(v => v.default) || voices[0] || null;
}

/**
 * Lance la synthèse vocale pour le texte donné (navigateur ou Groq TTS)
 * Compatible 100% hors ligne : bypass Groq immédiat et sélection de voix locale
 */
export function playEnglishAudio(rawText, options = {}) {
  if (typeof window === "undefined") return false;
  const englishText = options.raw ? rawText.trim() : extractEnglishSpeechText(rawText);
  if (!englishText) return false;

  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  // Groq TTS uniquement si l'utilisateur est EN LIGNE et a configuré une clé
  const groqKey = options.groqApiKey || (typeof localStorage !== "undefined" ? localStorage.getItem("groq_api_key") : null);
  if (groqKey && !isOffline) {
    speakWithGroq(englishText, {
      apiKey: groqKey,
      lang: options.lang || detectLanguage(englishText),
      voice: "tara",
      onStart: options.onStart,
      onEnd: options.onEnd,
      onError: () => fallbackWebSpeech(englishText, options),
    }).catch(() => fallbackWebSpeech(englishText, options));
    return true;
  }

  // En mode hors ligne ou sans clé Groq : Web Speech local immédiat
  return fallbackWebSpeech(englishText, options);
}

export function stopEnglishAudio() {
  activeUtterance = null;
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch {}
  }
  try {
    stopCurrent();
  } catch {}
}

function fallbackWebSpeech(text, options = {}) {
  if (!window.speechSynthesis) return false;
  try {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

    // Débloque la synthèse vocale si le navigateur est figé en pause
    if (window.speechSynthesis.paused) {
      try { window.speechSynthesis.resume(); } catch {}
    }
    try { window.speechSynthesis.cancel(); } catch {}

    const utter = new SpeechSynthesisUtterance(text);
    
    // Détection ou respect de la langue cible
    const targetLang = options.lang || detectLanguage(text);
    utter.lang = targetLang;
    utter.rate = targetLang.startsWith("fr") ? 0.98 : 0.92;

    // Récupération des voix fraîches ou en cache
    let voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) {
      voices = cachedVoices;
    } else {
      cachedVoices = voices;
    }

    const bestVoice = getBestVoice(voices, targetLang, isOffline);
    if (bestVoice) {
      utter.voice = bestVoice;
    }

    const cleanup = () => {
      activeUtterance = null;
    };

    utter.onstart = () => {
      options.onStart?.();
    };

    utter.onend = () => {
      cleanup();
      options.onEnd?.();
    };

    utter.onerror = (e) => {
      cleanup();
      // Si une erreur réseau survient (ex: voix Google non utilisable hors-ligne),
      // retenter immédiatement avec une voix locale pure
      if (e?.error === "network" && voices.length > 0) {
        const localVoice = voices.find(v => v.localService === true);
        if (localVoice && utter.voice !== localVoice) {
          try {
            const retryUtter = new SpeechSynthesisUtterance(text);
            retryUtter.lang = targetLang;
            retryUtter.voice = localVoice;
            retryUtter.rate = utter.rate;
            retryUtter.onstart = options.onStart;
            retryUtter.onend = options.onEnd;
            retryUtter.onerror = options.onError;
            activeUtterance = retryUtter;
            window.speechSynthesis.speak(retryUtter);
            return;
          } catch {}
        }
      }
      console.warn("[playEnglishAudio] WebSpeech utterance error:", e);
      options.onError?.(e);
    };

    activeUtterance = utter;
    window.speechSynthesis.speak(utter);
    return true;
  } catch (e) {
    console.warn("[playEnglishAudio] WebSpeech fallback failed:", e);
    return false;
  }
}
