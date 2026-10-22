// 🚀 src/lib/newsExecutiveBrief.js
// ============================================================================
// MOTEUR D'EXECUTIVE INTELLIGENCE BRIEFING (SYNTHÈSE HAUTE DENSITÉ)
// ============================================================================
// Transforme les descriptions RSS paresseuses en synthèses chirurgicales denses.
// Donne au lecteur l'intégralité des faits, du fonctionnement technique et de l'impact
// sans qu'il ait besoin d'ouvrir l'article complet.
// Exploite le pool de rotation multi-clés Groq & Gemini.
// ============================================================================

import { stripMarkdownAndAsterisks } from "./newsTextPresentation.js";

export const EXECUTIVE_BRIEF_STORAGE_KEY = "tech_intel_ai_summaries_v2";

const SYSTEM_BRIEF_PROMPT = `Tu es le Rédacteur en Chef d'un service de renseignement technologique et d'actualités de pointe (style Bloomberg Technology / MIT Technology Review).
Ta mission : Produire un "Executive Brief" (synthèse essentielle haute densité) pour chaque actualité, afin qu'un lecteur exigeant comprenne TOUT l'essentiel en 15 secondes sans avoir besoin de lire l'article complet.

RÈGLES D'OR CHIRURGICALES :
1. DENSITÉ & STRUCTURE EN 2 À 3 PHRASES COMPLÈTES (environ 35 à 75 mots au total) :
   - Phrase 1 (Le fait précis) : Qui a fait quoi concrètement ? (noms d'entreprises, outils, versions, acteurs exacts).
   - Phrase 2 (Le mécanisme / les coulisses) : Comment cela fonctionne techniquement ou stratégiquement ? (méthode, architecture, failles, code, contournement).
   - Phrase 3 (L'impact concret) : Pourquoi c'est capital et ce que cela change pour les développeurs, la sécurité ou l'industrie ?
2. INTERDICTIONS STRICTES :
   - INTERDIT de répéter ou paraphraser le titre.
   - INTERDIT de commencer par des clichés ("Cet article explique...", "Dans un monde...", "L'IA devient si puissante...", "Il a été rapporté que...").
   - Va DIRECTEMENT aux faits dès le premier mot.
3. TON & LANGUE : Français journalistique irréprochable, précis, dense et élégant.
4. FORMAT DE RETOUR : Réponds STRICTEMENT en JSON :
{"briefs": {"ART_1": "Texte de la synthèse haute densité...", "ART_2": "..."}}`;

/**
 * Extrait le meilleur contexte textuel disponible pour un article (corps scrapé > paragraphes > description)
 */
export function getArticleContextSnippet(item, maxChars = 1200) {
  if (!item) return "";
  const parts = [];

  const title = (item.titleFr || item.title || "").trim();
  if (title) parts.push(`TITRE: ${title}`);

  const source = (item.source || item.sourceName || "").trim();
  if (source) parts.push(`SOURCE: ${source}`);

  // Priorité 1 : corps complet traduit ou extrait
  let body = (item.bodyFr || item.articleText || "").trim();
  if (!body && Array.isArray(item.paragraphs) && item.paragraphs.length > 0) {
    body = item.paragraphs.slice(0, 5).join(" ").trim();
  }

  // Priorité 2 : description éditoriale
  const desc = (item.descriptionFr || item.description || "").trim();

  if (body && body.length > 100) {
    parts.push(`EXTRAIT DU CORPS:\n${body.slice(0, maxChars)}`);
  } else if (desc) {
    parts.push(`DESCRIPTION RSS:\n${desc.slice(0, 800)}`);
  }

  return parts.join("\n\n");
}

/**
 * Nettoie une chaîne de synthèse
 */
function cleanBriefText(text) {
  if (typeof text !== "string") return "";
  let clean = stripMarkdownAndAsterisks(text.trim());
  // Élimine les éventuels guillemets superflus entourant tout le texte
  clean = clean.replace(/^["'«](.*)["'»]$/s, "$1").trim();
  // S'assurer qu'il y a une ponctuation terminale
  if (clean && !/[.!?][»"']?$/.test(clean)) {
    clean += ".";
  }
  return clean;
}

/**
 * Parse la réponse JSON retournée par l'IA et mappe via les alias vers les IDs réels
 */
export function parseBriefsResponse(rawText, aliasMap = new Map()) {
  if (!rawText) return {};
  const cleaned = String(rawText).trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return {};

  try {
    const parsed = JSON.parse(match[0]);
    const rawBriefs = parsed.briefs && typeof parsed.briefs === "object" ? parsed.briefs : parsed;
    const cleanBriefs = {};

    for (const [rawKey, text] of Object.entries(rawBriefs)) {
      if (typeof text !== "string" || text.trim().length < 25) continue;
      const clean = cleanBriefText(text);
      const key = String(rawKey).trim();

      // Résolution intelligente de l'item cible
      let targetItem = aliasMap.get(key) || aliasMap.get(key.toUpperCase());

      // 1. Support des variantes numériques : "1", "Article 1", "ARTICLE_1", "art-1", "#1"
      if (!targetItem) {
        const numMatch = key.match(/(?:ART(?:ICLE)?[\s_#-]*|^#?)\s*(\d+)\b/i);
        if (numMatch) {
          const alias = `ART_${numMatch[1]}`;
          targetItem = aliasMap.get(alias);
        }
      }

      // 2. Support de la clé comme titre ou extrait de titre / URL / ID
      if (!targetItem && aliasMap.size > 0) {
        const keyLower = key.toLowerCase();
        for (const [, it] of aliasMap) {
          if (!it) continue;
          if (it.id && it.id.toLowerCase() === keyLower) { targetItem = it; break; }
          if (it.url && it.url.toLowerCase() === keyLower) { targetItem = it; break; }
          if (it.title && (it.title.toLowerCase() === keyLower || (keyLower.length > 15 && it.title.toLowerCase().includes(keyLower)) || (keyLower.length > 15 && keyLower.includes(it.title.toLowerCase().slice(0, 30))))) {
            targetItem = it;
            break;
          }
          if (it.titleFr && (it.titleFr.toLowerCase() === keyLower || (keyLower.length > 15 && it.titleFr.toLowerCase().includes(keyLower)) || (keyLower.length > 15 && keyLower.includes(it.titleFr.toLowerCase().slice(0, 30))))) {
            targetItem = it;
            break;
          }
        }
      }

      if (targetItem) {
        if (targetItem.id) cleanBriefs[targetItem.id] = clean;
        if (targetItem.url) cleanBriefs[targetItem.url] = clean;
        if (targetItem.title) cleanBriefs[targetItem.title] = clean;
        if (targetItem.titleFr) cleanBriefs[targetItem.titleFr] = clean;
        targetItem.aiSummary = clean;
        continue;
      }

      // Cas repli : La clé est directement un ID ou une URL
      cleanBriefs[key] = clean;
    }
    return cleanBriefs;
  } catch (err) {
    console.debug("[newsExecutiveBrief] Échec parsing JSON:", err);
    return {};
  }
}

/**
 * Sélectionne les articles qui n'ont pas encore de synthèse IA
 */
export function pickUnbriefed(items = [], existingBriefs = {}, max = 6) {
  if (!Array.isArray(items)) return [];
  const briefs = existingBriefs || {};

  const filtered = items.filter(i => {
    if (!i) return false;
    if (i.aiSummary && typeof i.aiSummary === "string" && i.aiSummary.trim().length >= 35) {
      return false;
    }
    const hasId = i.id && briefs[i.id] && briefs[i.id].length >= 35;
    const hasUrl = i.url && briefs[i.url] && briefs[i.url].length >= 35;
    const hasTitle = i.title && briefs[i.title] && briefs[i.title].length >= 35;
    const hasTitleFr = i.titleFr && briefs[i.titleFr] && briefs[i.titleFr].length >= 35;
    return !(hasId || hasUrl || hasTitle || hasTitleFr);
  });

  return (typeof max === "number" && max > 0) ? filtered.slice(0, max) : filtered;
}

/**
 * Génère un lot de synthèses haute densité en parallèle via aiCall (rotation Groq / Gemini)
 * Utilise des identifiants stables ART_1..ART_N pour garantir un parsing 100% infaillible.
 */
export async function generateBatchExecutiveBriefs(items = [], aiCallFn, signal, fallbackClaudeFn) {
  if (!items.length) return {};

  const aliasMap = new Map();
  const userPayload = items.map((it, idx) => {
    const alias = `ART_${idx + 1}`;
    aliasMap.set(alias, it);
    const snippet = getArticleContextSnippet(it, 1000);
    return `=== ARTICLE [${alias}] ===\n${snippet}`;
  }).join("\n\n-------------------------\n\n");

  const promptUser = `Génère l'Executive Brief haute densité pour chacun de ces articles :\n\n${userPayload}`;
  let rawText = "";

  // 1. Essai primaire via aiCallFn (Groq / Mistral)
  if (typeof aiCallFn === "function") {
    try {
      const res = await aiCallFn({
        task: "fast-json",
        json: false,
        system: SYSTEM_BRIEF_PROMPT,
        user: promptUser,
        maxTokens: 3500,
        temperature: 0.2,
        cache: true,
        signal,
      });
      rawText = res?.text || "";
    } catch (err) {
      console.debug("[newsExecutiveBrief] aiCall indisponible ou 429, bascule vers Gemini:", err?.message);
    }
  }

  // 2. Bascule transparente vers Gemini via fallbackClaudeFn si aiCall a échoué ou subi un 429
  if (!rawText && typeof fallbackClaudeFn === "function") {
    try {
      const claudeRes = await fallbackClaudeFn(SYSTEM_BRIEF_PROMPT, promptUser, { directGemini: true, json: false, maxTokens: 4000 });
      rawText = typeof claudeRes === "string" ? claudeRes : (claudeRes?.text || "");
    } catch (gErr) {
      console.warn("[newsExecutiveBrief] Échec fallback Gemini:", gErr?.message);
    }
  }

  if (rawText) {
    return parseBriefsResponse(rawText, aliasMap);
  }
  return {};
}

/**
 * Génère la synthèse haute densité pour un seul article (sur demande ou clic)
 */
export async function generateSingleExecutiveBrief(item, aiCallFn, signal, fallbackClaudeFn) {
  if (!item?.id) return null;

  const aliasMap = new Map([["ART_1", item]]);
  const snippet = getArticleContextSnippet(item, 1500);
  const prompt = `Génère l'Executive Brief haute densité pour cet article :\n\n=== ARTICLE [ART_1] ===\n${snippet}`;
  let rawText = "";

  if (typeof aiCallFn === "function") {
    try {
      const res = await aiCallFn({
        task: "fast-json",
        json: true,
        system: SYSTEM_BRIEF_PROMPT,
        user: prompt,
        maxTokens: 450,
        temperature: 0.2,
        cache: true,
        signal,
      });
      rawText = res?.text || "";
    } catch (err) {
      console.debug("[newsExecutiveBrief] Single aiCall indisponible, bascule Gemini:", err?.message);
    }
  }

  if (!rawText && typeof fallbackClaudeFn === "function") {
    try {
      const claudeRes = await fallbackClaudeFn(SYSTEM_BRIEF_PROMPT, prompt, { directGemini: true, json: true, maxTokens: 500 });
      rawText = typeof claudeRes === "string" ? claudeRes : (claudeRes?.text || "");
    } catch (gErr) {
      console.warn("[newsExecutiveBrief] Single fallback Gemini error:", gErr?.message);
    }
  }

  if (rawText) {
    const parsed = parseBriefsResponse(rawText, aliasMap);
    return parsed[item.id] || parsed[item.url] || Object.values(parsed)[0] || null;
  }
  return null;
}
