// src/lib/speakUtils.js — Helper TTS pour prononciation d'expressions et d'exemples
import { speakWithGroq } from "./groqTTS.js";

/**
 * Nettoie un texte pour ne garder que l'expression / phrase en anglais.
 * Supprime les emojis, le markdown, et tronque la traduction française qui suit -> ou ↳
 */
export function extractEnglishSpeechText(text) {
  if (!text || typeof text !== "string") return "";
  
  let clean = text
    .replace(/^#+\s*/g, "") // Supprime # ## ###
    .replace(/[🇬🇧⚠️⚙️🔍🧠💻📌❌✅]/g, "") // Supprime emojis d'en-tête
    .replace(/[`*_~]/g, "") // Supprime markdown formatting (*, _, `)
    .trim();

  // Si la ligne contient une séparation avec traduction française (ex: "sentence -> translation" ou "sentence ↳ translation")
  const splitIdx = clean.search(/\s*(?:->|↳|--)\s*/);
  if (splitIdx !== -1) {
    clean = clean.slice(0, splitIdx).trim();
  }

  // Supprime l'éventuelle mention "Contexte Tech/Workflow :" ou "Quotidien :" au début
  clean = clean.replace(/^(?:Contexte\s+[^:]+:|Tech\/Workflow\s*:|Quotidien\s*:)/i, "").trim();

  return clean;
}

/**
 * Lance la synthèse vocale pour le texte donné (navigateur ou Groq TTS)
 */
export function playEnglishAudio(rawText, options = {}) {
  if (typeof window === "undefined") return false;
  const englishText = extractEnglishSpeechText(rawText);
  if (!englishText) return false;

  // Groq TTS si clé disponible (ou sur mobile)
  const groqKey = options.groqApiKey || (typeof localStorage !== "undefined" ? localStorage.getItem("groq_api_key") : null);
  if (groqKey) {
    speakWithGroq(englishText, {
      apiKey: groqKey,
      lang: "en-US",
      voice: "tara",
      onStart: options.onStart,
      onEnd: options.onEnd,
      onError: () => fallbackWebSpeech(englishText, options),
    }).catch(() => fallbackWebSpeech(englishText, options));
    return true;
  }

  return fallbackWebSpeech(englishText, options);
}

function fallbackWebSpeech(text, options = {}) {
  if (!window.speechSynthesis) return false;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.92;
    
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith("en") && !/male/i.test(v.name)) 
                 || voices.find(v => v.lang.startsWith("en"));
    if (enVoice) utter.voice = enVoice;

    if (options.onStart) utter.onstart = options.onStart;
    if (options.onEnd) utter.onend = options.onEnd;
    if (options.onError) utter.onerror = options.onError;

    window.speechSynthesis.speak(utter);
    return true;
  } catch (e) {
    console.warn("[playEnglishAudio] WebSpeech fallback failed:", e);
    return false;
  }
}
