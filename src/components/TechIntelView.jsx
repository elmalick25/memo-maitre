import { resolveKey } from "../lib/security/apiKeys.js";
// ⚡ TechIntelView.jsx — Agrégateur d'actualités tech — Version Magazine Premium
// Design: French-first, hero card, glassmorphism, animations fluides.
// Props : { callClaude, theme, isDarkMode, expressions, setExpressions, storage, showToast, localToday, onCreateCard, onPickArticle }

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { safeStorage } from '../lib/safeStorage';
import { saveArticleList, loadArticleList, loadArticleListMeta, saveArticleBodies, loadArticleBodies } from "../lib/offlineArticles";
import { isGeminiLikelyUnavailable } from "../lib/geminiClient";
import { isBoilerplateOrConsentText, sanitizeArticleText, fetchReadableArticle, filterRelevantParagraphs, scoreTopicalRelevance, extractUniversalArticleParagraphs } from "../lib/articleExtractor";
import ScholarshipHubView from "./ScholarshipHubView";
import ReaderModeModal from "./ReaderModeModal";
import CustomFeedManagerModal from "./CustomFeedManagerModal";
import { colorMix } from "../lib/colorMix";
import { translateToFrench } from "../lib/frenchNews";
import { THEME_FILTERS, getArticleTheme } from "../lib/techIntelThemes";
import { getNetworkStatus, onNetworkChange, shouldReduceData } from "../lib/networkStatus";

// Garde au plus N entrées (les plus récentes) pour ne jamais saturer le stockage local
// — un quota plein faisait échouer silencieusement la sauvegarde hors-ligne.
const OFFLINE_MAP_MAX = 80;
function capMap(obj, max = OFFLINE_MAP_MAX) {
  const keys = Object.keys(obj);
  if (keys.length <= max) return obj;
  const next = {};
  for (const k of keys.slice(keys.length - max)) next[k] = obj[k];
  return next;
}
const OFFLINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const CACHE_KEY = "tech_intel_cache_v4";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure : les actus restent valides sans rechargement intempestif
const DIGEST_KEY_PREFIX = "tech_intel_digest_v2_";

// CACHE EN MÉMOIRE POUR ZÉRO-LATENCE (ANTI-FLICKER)
let memoryCache_techIntel = null;

// ─── CORS / Proxy ────────────────────────────────────────────────────────────
const IS_DEV = typeof import.meta !== "undefined" && import.meta.env?.DEV;

// Petit helper : fetch avec timeout (AbortController) pour ne jamais bloquer
// la régénération sur un proxy lent/HS.
async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  // Support d'un signal externe (pour annuler les losers d'une course).
  const ctrl = new AbortController();
  const external = options.signal;
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── Cache déduplicateur des appels proxy ────────────────────────────────
// Si plusieurs sources (ou une régénération rapide) demandent la même URL
// dans une courte fenêtre, on partage la promesse au lieu de retaper les
// proxies — divise par N les 429/rate-limit et accélère les re-fetch.
const _proxyMemo = new Map();
const PROXY_MEMO_TTL_MS = 60_000;

/**
 * Fetch d'un flux RSS/Atom via une COURSE PARALLÈLE de proxies gratuits.
 *
 * Stratégie (max robustesse, min latence) :
 *   • On fire TOUS les proxies en parallèle (Promise.any) — le premier qui
 *     renvoie du XML valide gagne, les autres sont abort()-és immédiatement.
 *   • Timeout individuel court (7 s) pour qu'un proxy zombie ne fasse
 *     jamais attendre la course.
 *   • Mémoisation 60 s par URL : un second appel à la même URL réutilise
 *     la même promesse (dédup natif → moins de rate-limits).
 *
 * État vérifié fin 2026 des proxies gratuits/publics :
 *   ✅ rss2json          — RSS-only, très rapide, 10k req/j gratuits
 *   ✅ codetabs          — CORS proxy générique, stable depuis 2019
 *   ⚠️ allorigins        — souvent lent mais peut sauver la mise
 *   ✅ proxy.cors.sh     — fallback gratuit
 *   ❌ corsproxy.io      — payant depuis 2024 (403 sans API key)
 *   ❌ thingproxy        — DNS mort
 */
// ─── Coupe-circuit (Circuit Breaker) global pour proxies distants ──────────
const _proxyCooldowns = new Map(); // proxyName -> timestamp ms (fin de quarantaine)

function isProxyCoolingDown(name) {
  const until = _proxyCooldowns.get(name);
  return typeof until === "number" && Date.now() < until;
}

function markProxyCooldown(name, ms = 25_000) {
  _proxyCooldowns.set(name, Date.now() + ms);
}

async function fetchViaProxy(url) {
  const memo = _proxyMemo.get(url);
  if (memo && (Date.now() - memo.ts) < PROXY_MEMO_TTL_MS) return memo.promise;

  const customProxy = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PROXY_URL) || "";
  const proxies = [
    // 0. Cloudflare Worker personnalisé (si configuré en production ou dev)
    ...(customProxy ? [{
      name: "CloudflareWorkerProxy",
      build: (u) => `${customProxy.replace(/\/+$/, "")}?url=${encodeURIComponent(u)}`,
      parse: async (r) => r.text(),
      timeoutMs: 5000
    }] : []),
    // 1. Proxy local Vite (uniquement en DEV)
    ...(import.meta.env.DEV ? [{
      name: "LocalViteProxy",
      build: (u) => `/api/rss-proxy?url=${encodeURIComponent(u)}`,
      parse: async (r) => r.text(),
      timeoutMs: 12000
    }] : []),
    // 2. AllOrigins JSON (mode encapsulé, fiable pour les flux RSS distants)
    {
      name: "AllOriginsJson",
      build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
      parse: async (r) => {
        const j = await r.json();
        return j?.contents || "";
      },
      timeoutMs: 8000
    },
    // 3. AllOrigins Raw
    {
      name: "AllOriginsRaw",
      build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      parse: async (r) => r.text(),
      timeoutMs: 8000
    },
    // 4. rss2json en dernier recours
    {
      name: "rss2json",
      build: (u) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}`,
      parse: async (r) => {
        const j = await r.json();
        if (j.status !== "ok") throw new Error("rss2json error");
        const isYT = j.feed?.url?.includes("youtube.com");
        const itemTag = isYT ? "entry" : "item";
        const itemsXml = (j.items || []).map(it => `
          <${itemTag}>
            <title><![CDATA[${it.title || ""}]]></title>
            <link href="${it.link || ""}"><![CDATA[${it.link || ""}]]></link>
            <description><![CDATA[${it.description || it.content || ""}]]></description>
            <pubDate>${it.pubDate || ""}</pubDate>
            <published>${it.pubDate || ""}</published>
          </${itemTag}>
        `).join("");
        return `<rss><channel>${itemsXml}</channel></rss>`;
      },
      timeoutMs: 6000
    },
    // 5. CodeTabs (ultime fallback)
    {
      name: "CodeTabs",
      build: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
      parse: async (r) => r.text(),
      timeoutMs: 5000
    }
  ];

  // Exécution séquentielle avec coupe-circuit adaptatif et garantie zéro blocage total
  const executeSequential = async () => {
    let lastErr = null;
    const usable = proxies.filter(p => !isProxyCoolingDown(p.name));
    const pool = usable.length > 0 ? usable : proxies;
    for (const p of pool.slice(0, 4)) {
      try {
        const res = await fetchWithTimeout(
          p.build(url),
          { headers: { Accept: "text/xml, application/xml, application/json, */*" } },
          p.timeoutMs || 4500
        );
        if (!res.ok) {
          if (res.status === 429 || res.status === 503) {
            markProxyCooldown(p.name, 25_000); // 25s temporaires sur rate-limit
          }
          continue;
        }
        const text = await p.parse(res);
        if (text && text.length > 20 && /<(rss|feed|channel|item|entry)\b/i.test(text)) {
          return text;
        }
      } catch (err) {
        lastErr = err;
        if (/429|quota|rate/i.test(err?.message || "")) {
          markProxyCooldown(p.name, 25_000);
        }
      }
    }
    _proxyMemo.delete(url);
    throw new Error(`All proxies failed: ${lastErr?.message || 'timeout'}`);
  };

  const promise = executeSequential();
  _proxyMemo.set(url, { ts: Date.now(), promise });
  return promise;
}


// ─── Scoring ────────────────────────────────────────────────────────────────
const WEIGHTS = {
  // ⚡ Tech, IA & Cyber
  "LLM": 5, "GPT": 5, "Claude": 5, "Gemini": 5, "Llama": 5, "zero-day": 5, "CVE": 5,
  "open source": 4, "AI": 4, "intelligence artificielle": 4, "IA": 4, "kubernetes": 4,
  "vulnérabilité": 4, "exploit": 4, "machine learning": 4,
  "release": 3, "framework": 3, "AWS": 3, "Azure": 3, "financement": 3, "acquisition": 3,
  "Python": 2, "JavaScript": 2, "TypeScript": 2, "Rust": 2, "Docker": 2, "API": 2,
  "développeur": 1, "startup": 1, "cloud": 1, "sécurité": 1, "données": 1,

  // 🌍 Grands Enjeux Mondiaux & Géopolitique
  "présidentielle": 5, "élection": 4, "guerre": 5, "conflit": 4, "diplomatie": 4,
  "traité": 4, "sommet": 4, "ONU": 4, "OTAN": 4, "BRICS": 4, "Union européenne": 4,
  "inflation": 4, "banque centrale": 4, "BCE": 4, "Fed": 4, "récession": 4,
  "climat": 4, "COP": 4, "accord historique": 5, "crise": 4, "sanctions": 4,
  "prix Nobel": 5, "découverte": 4, "santé mondiale": 4, "OMS": 4,
  "international": 3, "mondial": 3, "géopolitique": 4, "gouvernement": 3, "ministre": 2,
};

// ─── Sources ─────────────────────────────────────────────────────────────────
const SOURCE_META = {
  Numerama:       { color: "#E63946", emoji: "🔴" },
  JournalDuGeek:  { color: "#2196F3", emoji: "🎮" },
  Clubic:         { color: "#FF6B35", emoji: "🖥️" },
  LesNumeriques:  { color: "#4CAF50", emoji: "📱" },
  NextINpact:     { color: "#9C27B0", emoji: "📡" },
  Developpez:     { color: "#00BCD4", emoji: "💻" },
  LinuxFr:        { color: "#FFC107", emoji: "🐧" },
  ZestDeSavoir:   { color: "#FF5722", emoji: "🧠" },
  HN:             { color: "#FF6600", emoji: "🟠" },
  Reddit:         { color: "#FF4500", emoji: "👾" },
  TechCrunch:     { color: "#0a9e01", emoji: "🚀" },
  Verge:          { color: "#5200ff", emoji: "⚡" },
  DevTo:          { color: "#3b49df", emoji: "👨‍💻" },
  GitHubBlog:     { color: "#24292e", emoji: "🐙" },
  GoogleAI:       { color: "#4285f4", emoji: "🤖" },
  HuggingFace:    { color: "#ffcc4d", emoji: "🤗" },
  MIT:            { color: "#a31f34", emoji: "🎓" },
  ArsTechnica:    { color: "#ff4e00", emoji: "⚗️" },
  GitHub:         { color: "#24292e", emoji: "⭐" },
  YouTube:        { color: "#ff0000", emoji: "▶️" },
  Lobsters:       { color: "#ac130d", emoji: "🦞" },
};

const RSS_FEEDS = [
  // 🇫🇷 Sources Tech Francophones — prioritaires
  { name: "Numerama",        source: "Numerama",       url: "https://www.numerama.com/feed/",                          lang: "fr", priority: 1 },
  { name: "Journal du Geek", source: "JournalDuGeek",  url: "https://www.journaldugeek.com/feed/",                    lang: "fr", priority: 1 },
  { name: "Clubic",          source: "Clubic",          url: "https://www.clubic.com/feed/news.rss",                   lang: "fr", priority: 1 },
  { name: "Les Numériques",  source: "LesNumeriques",   url: "https://www.lesnumeriques.com/rss.xml",                  lang: "fr", priority: 1 },
  { name: "Next.ink",        source: "NextINpact",      url: "https://next.ink/feed/",                                 lang: "fr", priority: 1 },
  { name: "Developpez.com",  source: "Developpez",      url: "https://www.developpez.com/index/rss",                   lang: "fr", priority: 2 },
  { name: "LinuxFr",         source: "LinuxFr",         url: "https://linuxfr.org/news.atom",                          lang: "fr", priority: 2 },

  // 🌐 Sources Tech Anglophones
  { name: "TechCrunch",      source: "TechCrunch",      url: "https://techcrunch.com/feed/",                           lang: "en", priority: 2 },
  { name: "The Verge",       source: "Verge",           url: "https://www.theverge.com/rss/index.xml",                 lang: "en", priority: 2 },
  { name: "Dev.to",          source: "DevTo",           url: "https://dev.to/feed",                                    lang: "en", priority: 3 },
  { name: "GitHub Blog",     source: "GitHubBlog",      url: "https://github.blog/feed/",                              lang: "en", priority: 2 },
  { name: "Google AI",       source: "GoogleAI",        url: "https://blog.google/technology/ai/rss/",                 lang: "en", priority: 2 },
  { name: "Hugging Face",    source: "HuggingFace",     url: "https://huggingface.co/blog/feed.xml",                   lang: "en", priority: 2 },
  { name: "MIT Tech Review", source: "MIT",             url: "https://www.technologyreview.com/feed/",                 lang: "en", priority: 3 },
  { name: "Ars Technica",    source: "ArsTechnica",     url: "https://feeds.arstechnica.com/arstechnica/technology-lab", lang: "en", priority: 3 },
  { name: "Lobsters",        source: "Lobsters",        url: "https://lobste.rs/rss",                                  lang: "en", priority: 3 },
  // 🇺🇸 Top actus américaines supplémentaires (traduites automatiquement en FR)
  { name: "Wired",           source: "TechCrunch",     url: "https://www.wired.com/feed/rss",                          lang: "en", priority: 1 },
  { name: "Hacker News",     source: "GitHub",         url: "https://hnrss.org/frontpage",                             lang: "en", priority: 1 },
  { name: "Engadget",        source: "Verge",          url: "https://www.engadget.com/rss.xml",                        lang: "en", priority: 1 },
  { name: "The Register",    source: "ArsTechnica",    url: "https://www.theregister.com/headlines.atom",              lang: "en", priority: 2 },
  { name: "AI News",         source: "GoogleAI",       url: "https://www.artificialintelligence-news.com/feed/",        lang: "en", priority: 1 },
  { name: "MIT News",        source: "MIT",            url: "https://news.mit.edu/rss/topic/artificial-intelligence2", lang: "en", priority: 1 },
  { name: "OpenAI Blog",     source: "GoogleAI",       url: "https://openai.com/blog/rss.xml",                         lang: "en", priority: 1 },
  { name: "DeepMind",        source: "GoogleAI",       url: "https://deepmind.google/blog/rss.xml",                    lang: "en", priority: 1 },
  { name: "Simon Willison AI", source: "GoogleAI",     url: "https://simonwillison.net/tags/ai.atom",                 lang: "en", priority: 1 },
  // 🛰️ Couverture maximale — rien ne doit échapper
  { name: "01net",           source: "Clubic",         url: "https://www.01net.com/actualites/feed/",                  lang: "fr", priority: 1 },
  { name: "Frandroid",       source: "LesNumeriques",  url: "https://www.frandroid.com/feed",                          lang: "fr", priority: 1 },
  { name: "Siècle Digital",  source: "Numerama",       url: "https://siecledigital.fr/feed/",                          lang: "fr", priority: 1 },
  { name: "Le Monde Informatique", source: "NextINpact", url: "https://www.lemondeinformatique.fr/flux-rss/thematique/toutes-les-actualites/rss.xml", lang: "fr", priority: 1 },
  { name: "ZDNet FR",        source: "NextINpact",     url: "https://www.zdnet.fr/feeds/rss/actualites/",              lang: "fr", priority: 1 },
  { name: "Korben",          source: "LinuxFr",        url: "https://korben.info/feed",                                lang: "fr", priority: 2 },
  { name: "Presse-citron",   source: "JournalDuGeek",  url: "https://www.presse-citron.net/feed/",                     lang: "fr", priority: 2 },
  { name: "BFM Tech",        source: "Clubic",         url: "https://www.bfmtv.com/rss/tech/",                         lang: "fr", priority: 1 },
  { name: "Bleeping Computer", source: "ArsTechnica",  url: "https://www.bleepingcomputer.com/feed/",                   lang: "en", priority: 1 },
  { name: "The Hacker News", source: "ArsTechnica",    url: "https://feeds.feedburner.com/TheHackersNews",             lang: "en", priority: 1 },
  { name: "Krebs on Security", source: "ArsTechnica",  url: "https://krebsonsecurity.com/feed/",                       lang: "en", priority: 2 },
  { name: "InfoQ",           source: "DevTo",          url: "https://feed.infoq.com/",                                 lang: "en", priority: 2 },
  { name: "Microsoft AI",    source: "GoogleAI",       url: "https://blogs.microsoft.com/ai/feed/",                    lang: "en", priority: 1 },
  { name: "NVIDIA Blog",     source: "GoogleAI",       url: "https://blogs.nvidia.com/feed/",                          lang: "en", priority: 1 },
  { name: "AWS News",        source: "DevTo",          url: "https://aws.amazon.com/blogs/aws/feed/",                  lang: "en", priority: 2 },
  { name: "Cloudflare Blog", source: "DevTo",          url: "https://blog.cloudflare.com/rss/",                        lang: "en", priority: 2 },
  { name: "9to5Mac",         source: "Verge",          url: "https://9to5mac.com/feed/",                               lang: "en", priority: 2 },
  { name: "9to5Google",      source: "Verge",          url: "https://9to5google.com/feed/",                            lang: "en", priority: 2 },
  { name: "ZDNet",           source: "TechCrunch",     url: "https://www.zdnet.com/news/rss.xml",                      lang: "en", priority: 2 },
];

const YOUTUBE_CHANNELS = [
  { name: "Underscore_",    id: "UCWedHS9qKebauVIK2J7383g", lang: "fr" },
  { name: "Grafikart",      id: "UCj_iGliGCkLcHSZ8eqVNPDQ", lang: "fr" },
  { name: "Fireship",       id: "UCsBjURrPoezykLs9EqgamOA", lang: "en" },
  { name: "Theo",           id: "UCbRP3c757lWg9M-U7TyEkXA", lang: "en" },
  { name: "Two Minute Papers", id: "UCbfYPyITQ-7l4upoX8nvctg", lang: "en" },
];

const TABS = [
  { id: "fr",           label: "📰 Actus Tech",         desc: "Toute l'actu tech des dernières 72h, en français" },
  { id: "saved",        label: "🔖 Favoris",           desc: "Vos articles enregistrés pour lecture ultérieure" },
  { id: "digest",       label: "⚡ Briefing IA",        desc: "Revue de presse quotidienne et synthèse d'actualité par l'IA" },
  { id: "scholarships", label: "🎓 Bourses Master",     desc: "Opportunités mondiales vérifiées (Eiffel, Erasmus, DAAD...)" },
];
const NEWS_MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 heures : couvre le week-end et les flux espacés
const PAGE_SIZE = 100;

const FILTERS = {
  ai:    THEME_FILTERS.find(t => t.id === 'ai')?.rx,
  dev:   THEME_FILTERS.find(t => t.id === 'dev')?.rx,
  cyber: THEME_FILTERS.find(t => t.id === 'cyber')?.rx,
};

// ─── Utils ──────────────────────────────────────────────────────────────────
function scoreArticle(text, isWorld = false) {
  if (!text) return isWorld ? 3 : 0;
  let score = isWorld ? 3 : 0;
  for (const [kw, w] of Object.entries(WEIGHTS)) {
    if (new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text)) score += w;
  }
  return Math.min(Math.max(Math.round(score), 0), 10);
}

// ─── Score de tendance réel (décroissance temporelle exponentielle) ──────────
function trendScore(item) {
  const ageHours = Math.max(0, (Date.now() - (item.ts || 0)) / 3600000);
  const decayFactor = Math.exp(-ageHours / 24); // décroît sur 24h
  const popularity = (item.votes || 0) + (item.stars || 0) * 2 + (item.comments || 0) * 0.5;
  return item.score * 2 + popularity * 0.1 + decayFactor * 5;
}

// ─── ID stable déterministe basé sur l'URL ──────────────────────────────────
function stableId(prefix, url) {
  // Hash djb2 : même URL → même ID à chaque fetch
  const s = (url || '').replace(/[?#].*$/, '').toLowerCase().trim();
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
  return `${prefix}_${Math.abs(hash >>> 0).toString(36)}`;
}

// ─── Bionic Reading ─────────────────────────────────────────────────────────
function BionicText({ text }) {
  if (!text) return null;
  const words = text.split(/([\s\n]+)/);
  return (
    <>
      {words.map((word, i) => {
        if (!word.trim() || word.length === 1) return <span key={i}>{word}</span>;
        const half = Math.ceil(word.length / 2);
        return (
          <span key={i}>
            <b style={{ fontWeight: 800 }}>{word.slice(0, half)}</b>
            <span style={{ opacity: 0.85 }}>{word.slice(half)}</span>
          </span>
        );
      })}
    </>
  );
}

// ─── Parsing JSON robuste (remplace .match(/{...}/)?.[0]) ───────────────────
function safeParseJsonBlock(text, fallback = {}) {
  if (!text || typeof text !== 'string') return fallback;
  // Cherche le bloc JSON le plus long (évite les faux positifs courts)
  let best = null, bestLen = 0;
  const re = /\{[\s\S]*?\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[0]);
      if (m[0].length > bestLen) { best = parsed; bestLen = m[0].length; }
    } catch {}
  }
  if (best) return best;
  // Fallback : tableau JSON
  try { const arr = text.match(/\[[\s\S]*\]/); if (arr) return JSON.parse(arr[0]); } catch {}
  return fallback;
}

// ─── Nettoyage du texte Jina AI ─────────────────────────────────────────────
function cleanJinaText(text) {
  if (!text) return "";
  let cleaned = text;
  
  const mdMarker = "Markdown Content:";
  const mdIdx = cleaned.indexOf(mdMarker);
  if (mdIdx !== -1) {
    cleaned = cleaned.substring(mdIdx + mdMarker.length);
  }
  
  // Enlever les balises Markdown pour images et vidéos
  cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, ''); 
  cleaned = cleaned.replace(/\[Video.*?\]\(.*?\)/g, ''); 

  const cutoffMarkers = [
    "Et vous ?",
    "Voir aussi",
    "Vous avez lu gratuitement",
    "Soutenez le club",
    "Soutenez Numerama",
    "Source :",
    "Source:",
    "Sur le même sujet",
    "À lire aussi",
    "Pour aller plus loin",
  ];
  
  let cutoffIndex = cleaned.length;
  for (const marker of cutoffMarkers) {
    const idx = cleaned.indexOf(marker);
    if (idx !== -1 && idx < cutoffIndex) {
      cutoffIndex = idx;
    }
  }
  
  cleaned = cleaned.substring(0, cutoffIndex);
  return sanitizeArticleText(cleaned);
}

// ─── Nettoyage sémantique des miettes de pain (breadcrumbs RSS parasites) ────
function stripBreadcrumbsAndHeaderJunk(text) {
  if (!text || typeof text !== "string") return "";
  const lines = text.split(/\r?\n/);
  let startIdx = 0;
  const navKeywords = /^(accueil|home|actualit[ée]s?|news|high-tech|tech|informatique|logiciels?(\s*&\s*services)?|intelligence artificielle|ia|smartphones?|s[ée]curit[ée]|jeux vid[ée]o|web|hardware|tests?|tutoriels?|guides?|dossiers?|rubrique|cat[ée]gorie)\b/i;

  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const l = lines[i].trim();
    if (!l) {
      startIdx = i + 1;
      continue;
    }
    // Ligne courte avec mots-clés de navigation ou contenant des chevrons de fil d'Ariane
    if (l.length < 55 && (navKeywords.test(l) || l.includes('>') || l.includes('»') || l.includes('›') || l.includes(' - '))) {
      startIdx = i + 1;
    } else {
      break;
    }
  }
  return lines.slice(startIdx).join("\n").trim();
}

// ─── Nettoyage typographique rigoureux (zéro étoiles, zéro anti-slash n, zéro artefacts) ─
function cleanArticleText(raw) {
  if (!raw || typeof raw !== "string") return "";

  let s = raw;

  // 1. Dé-échapper les littéraux \n, \r, \t
  s = s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\t/g, " ");

  // 2. Décoder les entités HTML courantes
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&hellip;/g, "…")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // 3. Supprimer les balises HTML restantes
  s = s.replace(/<[^>]+>/g, " ");

  // 4. Supprimer les artefacts Markdown (étoiles, dièses, puces, liens)
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  s = s.replace(/_{1,3}([^_]+)_{1,3}/g, "$1");
  s = s.replace(/`{1,3}([^`]+)`{1,3}/g, "$1");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*>\s+/gm, "");

  // 5. Supprimer toutes les étoiles résiduelles
  s = s.replace(/\*/g, "");

  // 6. Normaliser les espaces et sauts de ligne
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n\s*\n\s*\n+/g, "\n\n");

  // 7. Nettoyage intelligent des miettes de pain au début du texte
  s = stripBreadcrumbsAndHeaderJunk(s);

  // 8. Lisibilité : retire liens d'images vides, légendes « // Source : … »,
  //    URLs nues, et paragraphes répétés (chapô souvent dupliqué par les flux).
  s = s.replace(/\[\s*\]\([^)]*\)/g, "");
  s = dedupeParagraphs(s);

  return s.trim();
}

// Supprime légendes, lignes parasites et paragraphes en double / quasi-doubles.
function dedupeParagraphs(text) {
  if (!text) return "";
  const norm = (p) => p.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const kept = [];
  const seen = [];
  for (let p of text.split(/\n{2,}|\n(?=[A-ZÀ-Ý«“])/)) {
    p = p.replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (/^\/\/\s*source\s*:/i.test(p) || /\/\/\s*Source\s*:\s*@?\S+$/i.test(p) && p.length < 160) continue;
    if (/^https?:\/\/\S+$/.test(p)) continue;
    if (/^(crédit|credit|photo|image|illustration)\s*:/i.test(p) && p.length < 160) continue;
    const n = norm(p);
    if (!n) continue;
    // doublon exact ou inclus dans un paragraphe déjà gardé (ou l'inverse)
    const dupIdx = seen.findIndex((x) => x === n || (n.length > 60 && x.includes(n)) || (x.length > 60 && n.includes(x)));
    if (dupIdx !== -1) {
      if (n.length > seen[dupIdx].length) { seen[dupIdx] = n; kept[dupIdx] = p; }
      continue;
    }
    seen.push(n); kept.push(p);
  }
  return kept.join("\n\n");
}

function normalizeForComparison(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D«»]/g, '"')
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripRepeatedTitle(text, title) {
  if (!text || !title) return text || "";
  let s = String(text).trim();
  const t = String(title).trim();

  // 1. Concordance directe
  if (s.toLowerCase().startsWith(t.toLowerCase())) {
    return s.slice(t.length).replace(/^[\s:—–\-]+/, "").trim();
  }

  // 2. Concordance tolérante (points de suspension …, guillemets «»'\", espaces, tirets)
  const normT = normalizeForComparison(t);
  const normS = normalizeForComparison(s);

  if (normT && normS.startsWith(normT)) {
    const tTokens = normT.split(" ").filter(Boolean);
    const lastToken = tTokens[tTokens.length - 1];
    if (lastToken) {
      const minPos = Math.max(0, Math.floor(t.length * 0.7));
      const searchRegion = s.toLowerCase().slice(minPos, t.length + 50);
      const idx = searchRegion.indexOf(lastToken.toLowerCase());
      if (idx !== -1) {
        const cut = minPos + idx + lastToken.length;
        const remainder = s.slice(cut).replace(/^[\s:—–\-]+/, "").trim();
        if (remainder.length > 0) return remainder;
      }
    }
    return s.slice(t.length).replace(/^[\s:—–\-]+/, "").trim();
  }

  // 3. Détection de préambule répété long (≥ 35 caractères)
  if (t.length > 35) {
    const headNorm = normalizeForComparison(t.slice(0, 35));
    if (normS.startsWith(headNorm)) {
      const tTokens = normalizeForComparison(t).split(" ").filter(Boolean);
      for (let i = tTokens.length - 1; i >= Math.max(0, tTokens.length - 4); i--) {
        const token = tTokens[i];
        if (token.length >= 3) {
          const pos = s.toLowerCase().indexOf(token.toLowerCase(), Math.floor(t.length * 0.5));
          if (pos !== -1 && pos < t.length + 60) {
            const cut = pos + token.length;
            const remainder = s.slice(cut).replace(/^[\s:—–\-]+/, "").trim();
            if (remainder.length > 10) return remainder;
          }
        }
      }
    }
  }

  return s;
}

function isTeaserSnippet(text, item = {}) {
  if (!text || typeof text !== "string") return true;
  const trimmed = text.trim();
  if (trimmed.length < 500) return true;
  if (trimmed.endsWith("...") || trimmed.endsWith("…") || trimmed.endsWith("[Lire la suite]") || trimmed.endsWith("[+]")) return true;
  const rawDesc = cleanEditorialText(item?.description || item?.descriptionFr || "").trim();
  if (rawDesc && trimmed.length <= rawDesc.length + 50) return true;
  return false;
}

// ─── Nettoyeur Éditorial Haute Couture (anti-scories forum & liens bruts) ─────
function cleanEditorialText(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = cleanArticleText(raw);
  // Supprimer les balises Markdown vides type [](url) ou []()
  s = s.replace(/\[\s*\]\([^)]+\)/g, "");
  // Supprimer les apartés de forum Hacker News / Reddit (Edit :, ahah, etc.)
  s = s.replace(/^(Edit|Édit)\s*:[^\n]*$/gmi, "");
  s = s.replace(/\b(ahah|ah ah|haha|lol|mdr)\b/gi, "");
  s = s.replace(/^\d+h\d+,\s*narration.*$/gmi, "");
  // Nettoyer les URLs nues résiduelles
  s = s.replace(/https?:\/\/[^\s)]+/g, "");
  // Supprimer les césures parasites dans les mots (ex: "lan- gage" ou "ba- layage")
  s = s.replace(/(\b\w{2,})-\s+(\w{2,}\b)/g, "$1$2");
  return s.replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

// ─── Élagage des préambules et disclaimers parasites au profit du lead d'actu ─
function sanitizeLeadParagraphs(paragraphs) {
  if (!paragraphs || !paragraphs.length) return [];
  let list = paragraphs.filter(p => p && !isBoilerplateOrConsentText(p));
  if (list.length <= 1) return list;

  while (list.length > 1) {
    const first = list[0];
    const second = list[1];

    const isGenericDisclaimer =
      /^(bien que|malgré|les risques|dans un contexte|alors que|face [àa]|de nos jours|il est de plus en plus|à l'heure où|si ces|si les|avec l'essor|à mesure que|face aux)\b/i.test(first) ||
      /\b(comportements imprévisibles|risques en matière de sécurité|menaces réelles pour la vie privée|manque de transparence)\b/i.test(first);

    const isPreambleNoise = /^(en bref|résumé|édito|chapeau|mise en garde|avertissement)\s*:/i.test(first) || isBoilerplateOrConsentText(first);

    const hasFactualLead =
      /(\d{1,4}%?|\b(anthropic|openai|google|microsoft|apple|meta|linux|github|nvidia|amazon|l'année|selon|a annoncé|vient de|rapporte|dévoile|publie)\b)/i.test(second);

    if ((isGenericDisclaimer && hasFactualLead) || isPreambleNoise) {
      list.shift();
    } else {
      break;
    }
  }

  return list;
}

// ─── Extraction intégrale du texte d'un article ─────────────────────────────
// 🎯 Chaque candidat est audité : parasites supprimés, puis vérification que le
// texte parle BIEN du sujet du titre. Un mur de cookies ou un encart
// d'abonnement n'atteint jamais l'interface : on passe à la source suivante.
const MIN_TOPIC_RELEVANCE = 0.18;

function refineArticleCandidate(raw, item) {
  const base = cleanArticleText(raw || "");
  if (!base) return { text: "", relevance: 0 };
  const title = `${item?.titleFr || ""} ${item?.title || ""}`.trim();
  const focused = filterRelevantParagraphs(base, title) || "";
  const sanitized = sanitizeArticleText(base);
  const text = focused.length >= 120 ? focused : (sanitized.length >= 120 ? sanitized : "");
  return { text, relevance: text ? scoreTopicalRelevance(text, title) : 0 };
}

async function extractFullArticleText(item) {
  const candidates = [];

  const consider = (raw) => {
    const { text, relevance } = refineArticleCandidate(raw, item);
    if (text && text.length > 200) candidates.push({ text, relevance });
    return text && text.length > 400 && (relevance >= 0.10 || text.length > 1500);
  };

  // 1. Contenu déjà embarqué dans le flux
  if (item.fullContent && item.fullContent.length > 200) {
    if (consider(item.fullContent)) return candidates[candidates.length - 1].text;
  }

  // 2. Lecture via la course multi-proxys
  try {
    const { text } = await fetchReadableArticle(item.url, { timeoutMs: 9000 });
    if (text && text.length > 200 && consider(text)) return candidates[candidates.length - 1].text;
  } catch {}

  // 3. Dernier recours : lecteur Jina
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(`https://r.jina.ai/${item.url}`, {
      headers: { Accept: "text/plain" },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const pageContent = await res.text();
      if (consider(cleanJinaText(pageContent))) return candidates[candidates.length - 1].text;
    }
  } catch {}

  // 4. Meilleur candidat restant (pertinence d'abord, longueur ensuite)
  if (candidates.length) {
    candidates.sort((a, b) => (b.relevance - a.relevance) || (b.text.length - a.text.length));
    if (candidates[0].text.length > 300) return candidates[0].text;
  }

  // 5. Repli strictement fiable : le résumé fourni par la source elle-même
  const summary = cleanArticleText(item.descriptionFr || item.description || "");
  if (summary && !isBoilerplateOrConsentText(summary)) return summary;
  return candidates.length ? candidates[0].text : "";
}

// ─── Génération d'un compte-rendu exhaustif (In-app Complete Story) ──────────
async function generateCompleteStory(item, callClaude) {
  const contentStr = await extractFullArticleText(item);
  let paragraphs = [];
  
  if (callClaude && (contentStr.length > 180 || item.description)) {
    try {
      const prompt = `Voici une actualité tech intitulée : "${item.titleFr || item.title}".
Rédige en FRANÇAIS impeccable un compte-rendu complet, limpide et captivant (3 à 4 paragraphes).
Le lecteur doit TOUT comprendre sans aller sur le site d'origine :
- 1er paragraphe : l'essentiel en 2-3 phrases (qui, quoi, quand, résultat).
- Ensuite : comment ça s'est passé, les chiffres et faits précis, le contexte.
- Dernier paragraphe : pourquoi c'est important / ce que ça change.
Règles strictes : phrases courtes et claires, explique tout terme technique en quelques mots, ne répète JAMAIS une même idée, n'invente aucun fait absent du contenu, traduis tout en français (garde seulement les noms propres).
Format : uniquement des paragraphes séparés par une ligne vide. Pas de puces, pas de titre, pas de Markdown, pas de pub, pas de mentions d'images ou de crédits photo.

Contenu brut de l'article :
${contentStr.substring(0, 15000)}`;

      const raw = await callClaude("Tu es un journaliste tech d'élite.", prompt, { maxTokens: 1000 });
      const rawText = typeof raw === 'string' ? raw : (raw?.text || '');
      const aiTitle = item.titleFr || item.title;
      if (rawText.trim() && !isBoilerplateOrConsentText(rawText) && scoreTopicalRelevance(rawText, aiTitle) >= 0.15) {
        paragraphs = dedupeParagraphs(cleanArticleText(rawText))
          .split(/\n\n+/)
          .map(p => p.trim())
          .filter(p => p && !isBoilerplateOrConsentText(p));
      }
    } catch (e) {
      console.warn("AI complete story failed", e);
    }
  }

  if (!paragraphs.length) {
    // Un article étranger ne doit jamais réinjecter son corps brut dans l'interface.
    // Et un article français ne garde que les paragraphes réellement liés au titre.
    paragraphs = item.lang === "fr"
      ? dedupeParagraphs(cleanArticleText(filterRelevantParagraphs(contentStr, item.titleFr || item.title)))
          .split(/\n\n+/)
          .filter(p => p.trim().length > 40 && !isBoilerplateOrConsentText(p))
          .slice(0, 3)
      : [];
  }
  if (!paragraphs.length) {
    const fallback = item.lang === "fr"
      ? (item.descriptionFr || item.description)
      : item.descriptionFr;
    paragraphs = [fallback || "La traduction française de cet article est momentanément indisponible."].filter(Boolean);
  }

  return {
    headline: item.titleFr || item.title,
    paragraphs,
    key_takeaways: [],
    why_it_matters: "",
    level: "",
    read_time: Math.max(1, Math.ceil(paragraphs.join(" ").split(/\s+/).length / 200)),
  };
}

// ─── Cache LRU pour les résumés (max 80 entrées, TTL 7 jours) ───────────────
const SUMMARY_LS_KEY = 'tech_intel_summaries_v3';
const ANALYSIS_LS_KEY = 'tech_intel_analysis_v1';
const SUMMARY_MAX = 80;
const SUMMARY_TTL_MS = 7 * 24 * 3600 * 1000;

function setSummaryEntry(cache, id, data) {
  cache[id] = { ...data, _savedAt: Date.now() };
  const now = Date.now();
  // Purge TTL
  for (const k of Object.keys(cache)) {
    if (now - (cache[k]._savedAt || 0) > SUMMARY_TTL_MS) delete cache[k];
  }
  // Purge LRU si > max
  let keys = Object.keys(cache);
  if (keys.length > SUMMARY_MAX) {
    const sorted = keys.sort((a, b) => (cache[a]._savedAt || 0) - (cache[b]._savedAt || 0));
    sorted.slice(0, keys.length - SUMMARY_MAX).forEach(k => delete cache[k]);
  }
  // Purge taille > 1.5Mo
  try {
    const size = new Blob([JSON.stringify(cache)]).size;
    if (size > 1.5 * 1024 * 1024) {
      keys = Object.keys(cache);
      const sorted = keys.sort((a, b) => (cache[a]._savedAt || 0) - (cache[b]._savedAt || 0));
      const toDelete = Math.floor(keys.length / 2);
      sorted.slice(0, toDelete).forEach(k => delete cache[k]);
    }
  } catch {}
}

function persistCache(key, cache) {
  try { safeStorage.set(key, JSON.stringify(cache)); } catch {}
}

function timeAgo(ts, now = Date.now()) {
  if (!ts) return "";
  const diff = Math.max(0, (now - ts) / 1000);
  if (diff < 45)     return "à l'instant";
  if (diff < 3600)   return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400)  return `il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)}j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function stripHtml(s) {
  if (!s) return "";
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isBreaking(ts) {
  return ts && (Date.now() - ts) < 2 * 3600 * 1000;
}

// ─── Recherche (accent-insensitive, multi-tokens) ─────────────────────────────
function normalizeText(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function articleHaystack(item) {
  return normalizeText(
    [
      item.title, item.titleFr, item.description, item.descriptionFr,
      item.source, item.sourceName, item.language, item.subreddit, item.channelName,
    ].filter(Boolean).join(" ")
  );
}

function matchesQuery(item, tokens) {
  if (!tokens.length) return true;
  const hay = articleHaystack(item);
  // Tous les mots de la requête doivent être présents → résultats strictement pertinents
  return tokens.every((t) => hay.includes(t));
}

// ─── Fetchers ────────────────────────────────────────────────────────────────
async function fetchHN() {
  const r = await fetchWithTimeout("https://hacker-news.firebaseio.com/v0/topstories.json", {}, 6000);
  if (!r.ok) throw new Error(`HN HTTP ${r.status}`);
  // 50 articles majeurs chargés en 2 vagues de 25 en parallèle (réponse en ~2s)
  const ids = (await r.json()).slice(0, 50);
  const items = [];
  for (let i = 0; i < ids.length; i += 25) {
    const batch = await Promise.all(
      ids.slice(i, i + 25).map(id =>
        fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 4000)
          .then(r => (r.ok ? r.json() : null)).catch(() => null))
    );
    items.push(...batch);
  }
  return items.filter(Boolean).map(it => {
    const url = it.url || `https://news.ycombinator.com/item?id=${it.id}`;
    return {
      // ✅ ID stable basé sur l'URL — les favoris survivent aux rafraîchissements
      id: stableId('hn', url), source: "HN",
      title: it.title, url,
      description: "", ts: (it.time || 0) * 1000, score: scoreArticle(it.title),
      votes: it.score, comments: it.descendants, author: it.by,
      extraUrl: `https://news.ycombinator.com/item?id=${it.id}`, lang: "en",
    };
  });
}

function parseMarkdownFeed(text, feed) {
  if (!text) return [];
  const itemRegex = /###\s+\[(.*?)\]\((https?:\/\/[^\s\)]+)\)([\s\S]*?)(?=(?:###\s+\[|$))/g;
  const items = [];
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    let title = cleanEditorialText(stripHtml(match[1]?.trim() || ""));
    const url = match[2]?.trim() || "";
    if (!title && url) {
      const slug = url.split("/").pop().replace(/\.html?$/i, "").replace(/^[a-z]+-\d+-/i, "").replace(/-/g, " ");
      if (slug.length > 5) title = slug.charAt(0).toUpperCase() + slug.slice(1);
    }
    const rawDesc = cleanEditorialText(stripHtml((match[3] || "").trim().split("\n\n")[0] || "")).slice(0, 500);
    if (!title || !url) continue;
    items.push({
      id: stableId(`rss_${feed.source}`, url || title),
      source: feed.source,
      sourceName: feed.name,
      title,
      url,
      description: rawDesc,
      fullContent: rawDesc,
      ts: Date.now(),
      score: scoreArticle(`${title} ${rawDesc}`, Boolean(feed.isWorld)),
      lang: feed.lang || "fr",
      priority: feed.priority || 2,
      isWorld: Boolean(feed.isWorld),
    });
    if (items.length >= 60) break;
  }
  return items;
}

async function fetchReddit() {
  const REDDIT_RSS = "https://www.reddit.com/r/programming+artificial+MachineLearning+cybersecurity+webdev+devops+golang+rust/.rss?limit=50";
  try {
    const xmlText = await fetchViaProxy(REDDIT_RSS);
    if (xmlText && /<(rss|feed|channel|item|entry)\b/i.test(xmlText)) {
      const xml = new DOMParser().parseFromString(xmlText, "text/xml");
      if (!xml.querySelector("parsererror")) {
        const entries = [...xml.querySelectorAll("item, entry")].slice(0, 200);
        return entries.map((it) => {
          const title = stripHtml(it.querySelector("title")?.textContent || "");
          const links = [...it.querySelectorAll("link")];
          let url = "";
          for (const l of links) {
            const href = l.getAttribute("href");
            const text = l.textContent?.trim();
            if (href && (l.getAttribute("rel") === "alternate" || !url)) url = href;
            else if (text && !url) url = text;
          }
          const desc = stripHtml(it.querySelector("description, summary, content")?.textContent || "").slice(0, 1500);
          const pub = it.querySelector("pubDate, published, updated")?.textContent;
          const parsedTs = pub ? new Date(pub).getTime() : Date.now();
          const ts = Number.isFinite(parsedTs) ? parsedTs : Date.now();
          const subMatch = url.match(/reddit\.com\/r\/([^/]+)/i);
          const subreddit = subMatch ? subMatch[1] : "";
          return {
            id: stableId('rd', url || title),
            source: "Reddit",
            title,
            url: url || "https://reddit.com",
            description: desc,
            ts,
            score: scoreArticle(`${title} ${desc}`),
            subreddit,
            extraUrl: url,
            lang: "en",
          };
        }).filter(x => x.title);
      }
    }
  } catch (e) {
    console.debug("Reddit RSS temporairement indisponible:", e?.message);
  }
  return [];
}

async function fetchRSS(feed) {
  // 1. Essai prioritaire : récupération XML via les proxys RSS
  try {
    const xmlText = await fetchViaProxy(feed.url);
    if (xmlText && /<(rss|feed|channel|item|entry)\b/i.test(xmlText)) {
      const xml = new DOMParser().parseFromString(xmlText, "text/xml");
      if (!xml.querySelector("parsererror")) {
        const items = [...xml.querySelectorAll("item, entry")].slice(0, 80);
        const parsed = items.map((it) => {
          const title = stripHtml(it.querySelector("title")?.textContent || "");
          const links = [...it.querySelectorAll("link")];
          let url = "";
          for (const l of links) {
            const href = l.getAttribute("href");
            const text = l.textContent?.trim();
            if (href && (l.getAttribute("rel") === "alternate" || !url)) url = href;
            else if (text && !url) url = text;
          }
          const rawDesc = stripHtml(it.querySelector("description, summary, content")?.textContent || "");
          const desc = stripRepeatedTitle(rawDesc, title);
          const encodedRaw = it.getElementsByTagName("content:encoded")[0]?.textContent ||
            it.getElementsByTagNameNS("http://purl.org/rss/1.0/modules/content/", "encoded")[0]?.textContent || "";
          const fullContent = encodedRaw ? sanitizeArticleText(stripHtml(encodedRaw)) : "";
          const pub = it.querySelector("pubDate, published, updated")?.textContent;
          const parsedTs = pub ? new Date(pub).getTime() : Date.now();
          const ts = Number.isFinite(parsedTs) ? parsedTs : Date.now();
          return {
            id: stableId(`rss_${feed.source}`, url || title),
            source: feed.source, sourceName: feed.name,
            title, url, description: desc, fullContent, ts,
            score: scoreArticle(`${title} ${desc}`, Boolean(feed.isWorld)),
            lang: feed.lang || "fr",
            priority: feed.priority || 2,
            isWorld: Boolean(feed.isWorld),
          };
        }).filter(x => x.title);
        if (parsed.length > 0) return parsed;
      }
    }
  } catch (e) {
    // Si échec XML, repli automatique vers Jina Reader ci-dessous
  }

  // 2. Repli universel Jina Reader (contourne 100% des erreurs CORS / 500 des proxys XML)
  try {
    const res = await fetchWithTimeout(`https://r.jina.ai/${feed.url}`, { headers: { Accept: "text/plain" } }, 2500);
    if (res.ok) {
      const md = await res.text();
      const items = parseMarkdownFeed(md, feed);
      if (items.length > 0) return items;
    }
  } catch {}

  return [];
}

async function fetchGitHubTrending() {
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const ghToken = resolveKey("VITE_GITHUB_TOKEN");
  const headers = { Accept: "application/vnd.github+json" };
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
  const r = await fetchWithTimeout(
    `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=25`,
    { headers },
    8000
  );
  if (!r.ok) throw new Error(`GitHub API HTTP ${r.status}`);
  const j = await r.json();
  return (j.items || []).map((repo) => ({
    id: stableId('gh', repo.html_url),
    source: "GitHub", kind: "github",
    title: repo.full_name, url: repo.html_url,
    description: repo.description || "", ts: Number.isFinite(new Date(repo.created_at).getTime()) ? new Date(repo.created_at).getTime() : Date.now(),
    score: Math.min(10, scoreArticle(`${repo.name} ${repo.description || ""}`) + 2),
    language: repo.language, stars: repo.stargazers_count, lang: "en",
  }));
}

async function fetchYouTube(channel) {
  const ytUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
  let xmlText;

  try {
    xmlText = await fetchViaProxy(ytUrl);
  } catch (e) {
    return [];
  }

  const xml = new DOMParser().parseFromString(xmlText, "text/xml");
  if (xml.querySelector("parsererror")) return [];
  return [...xml.querySelectorAll("entry")].slice(0, 40).map((e) => {
    const title = stripHtml(e.querySelector("title")?.textContent || "");
    const linkEl = [...e.querySelectorAll("link")].find(l => l.getAttribute("rel") === "alternate") || e.querySelector("link");
    const link = linkEl?.getAttribute("href") || "";
    const pub = e.querySelector("published, updated")?.textContent;
    const parsedTs = pub ? new Date(pub).getTime() : Date.now();
    const ts = Number.isFinite(parsedTs) ? parsedTs : Date.now();
    const videoId =
      e.getElementsByTagNameNS("http://www.youtube.com/xml/schemas/2015", "videoId")[0]?.textContent ||
      (link.match(/[?&]v=([^&]+)/)?.[1] || "");
    return {
      id: stableId(`yt_${channel.id}`, link),
      source: "YouTube", kind: "youtube",
      title, url: link, description: channel.name,
      ts,
      score: scoreArticle(title),
      thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null,
      channelName: channel.name, lang: channel.lang || "fr",
    };
  }).filter(x => x.title);
}


// ─── Sub-components ──────────────────────────────────────────────────────────
function SourceBadge({ source, lang, size = "sm" }) {
  const meta = SOURCE_META[source] || { color: "var(--mm-primary)", emoji: "📰" };
  const fs = size === "lg" ? 10.5 : 9;
  const pad = size === "lg" ? "2.5px 8px" : "2px 6.5px";
  return (
    <span
      className="tiv-badge-source"
      style={{
        background: colorMix(meta.color, 12),
        color: meta.color,
        fontSize: fs,
        fontWeight: 750,
        padding: pad,
        borderRadius: 6,
        border: `1px solid ${colorMix(meta.color, 24)}`,
        letterSpacing: 0.25,
        textTransform: "uppercase",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <span style={{ fontSize: fs + 1 }}>{meta.emoji}</span>
      <span>{source}</span>
    </span>
  );
}

function LangBadge({ lang }) {
  const isFr = lang === "fr";
  return (
    <span
      className="tiv-badge-lang"
      style={{
        background: isFr ? "rgba(34, 197, 94, 0.12)" : "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)",
        color: isFr ? "#16A34A" : "var(--mm-primary-glow)",
        fontSize: 9,
        fontWeight: 750,
        padding: "2px 6px",
        borderRadius: 6,
        border: `1px solid ${isFr ? "rgba(34, 197, 94, 0.28)" : "color-mix(in srgb, var(--mm-primary) 25.0%, transparent)"}`,
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      {isFr ? "FR" : "🌐"}
    </span>
  );
}

function WorldBadge({ isDark }) {
  return (
    <span style={{
      background: isDark ? "rgba(16, 185, 129, 0.18)" : "rgba(16, 185, 129, 0.12)",
      color: isDark ? "#34D399" : "#059669",
      fontSize: 9,
      fontWeight: 900,
      padding: "2px 7px",
      borderRadius: 6,
      border: isDark ? "1px solid rgba(52, 211, 153, 0.35)" : "1px solid rgba(16, 185, 129, 0.3)",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      flexShrink: 0,
    }}>
      🌍 MONDE
    </span>
  );
}

function BreakingBadge() {
  return (
    <span style={{
      background: "#ef4444", color: "#fff",
      fontSize: 9, fontWeight: 900, padding: "2px 6px", borderRadius: 6,
      letterSpacing: 0.8, textTransform: "uppercase", flexShrink: 0,
      animation: "tiv-pulse 2s infinite",
    }}>
      DIRECT
    </span>
  );
}

function ScoreChip({ score = 0 }) {
  const pct = Math.round((Math.min(10, Math.max(0, score)) / 10) * 100);
  const color = score >= 7 ? "#22c55e" : score >= 4 ? "#f59e0b" : "var(--mm-primary)";
  return (
    <span title={`Pertinence ${score}/10`} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: color + "15", border: `1px solid ${colorMix(color, 19)}`,
      borderRadius: 6, padding: "2px 7px", fontSize: 10, color, fontWeight: 700,
    }}>
      <span style={{
        display: "inline-block", width: 28, height: 4, borderRadius: 2,
        background: "rgba(255,255,255,0.1)", overflow: "hidden", flexShrink: 0,
      }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
      </span>
      {score}/10
    </span>
  );
}
function InlineSummary({ cachedSummary, isLoadingThis, item, isDarkMode, bionicReading }) {
  if (isLoadingThis) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
        <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", border: "2px solid color-mix(in srgb, var(--mm-primary) 30.0%, transparent)", borderTopColor: "var(--mm-primary)", animation: "tiv-spin .7s linear infinite" }} />
        <span style={{ fontSize: 13, color: isDarkMode ? "#94a3b8" : "#64748b" }}>Analyse de l'article avec l'IA…</span>
      </div>
    );
  }
  if (!cachedSummary) {
    return <p style={{ fontSize: 13, color: isDarkMode ? "#64748b" : "#94a3b8", margin: 0 }}>Résumé non disponible.</p>;
  }
  return (
    <>
      {cachedSummary.headline && (
        <div style={{
          borderLeft: "3px solid var(--mm-primary)", paddingLeft: 14, marginBottom: 14,
          fontSize: 15, fontWeight: 700, color: isDarkMode ? "#f1f5f9" : "#0f172a", lineHeight: 1.5,
          background: "color-mix(in srgb, var(--mm-primary) 6.0%, transparent)", borderRadius: "0 8px 8px 0", padding: "10px 14px",
        }}>{bionicReading ? <BionicText text={cachedSummary.headline} /> : cachedSummary.headline}</div>
      )}
      {cachedSummary.lede && (
        <p style={{ fontSize: 14.5, fontWeight: 600, color: isDarkMode ? "#cbd5e1" : "#334155", lineHeight: 1.65, margin: "0 0 14px" }}>
          {bionicReading ? <BionicText text={cachedSummary.lede} /> : cachedSummary.lede}
        </p>
      )}
      {cachedSummary.paragraphs?.map((p, i) => (
        <p key={i} style={{ fontSize: 14, color: isDarkMode ? "#94a3b8" : "#475569", lineHeight: 1.7, margin: "0 0 10px" }}>
          {bionicReading ? <BionicText text={p} /> : p}
        </p>
      ))}
      {cachedSummary.why_it_matters && (
        <div style={{ marginTop: 12, background: "color-mix(in srgb, var(--mm-primary) 7.0%, transparent)", border: "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--mm-primary-glow)", marginBottom: 6 }}>Pourquoi c'est important</div>
          <p style={{ fontSize: 13, color: isDarkMode ? "#cbd5e1" : "#334155", lineHeight: 1.6, margin: 0 }}>{cachedSummary.why_it_matters}</p>
        </div>
      )}
      {cachedSummary.key_takeaways?.length > 0 && (
        <div style={{ marginTop: 12, background: isDarkMode ? "rgba(255,255,255,0.03)" : "color-mix(in srgb, var(--mm-primary) 4.0%, transparent)", borderRadius: 12, padding: "12px 14px", border: "1px solid color-mix(in srgb, var(--mm-primary) 15.0%, transparent)" }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--mm-primary-glow)", marginBottom: 8 }}>Points clés</div>
          {cachedSummary.key_takeaways.map((k, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 13, color: isDarkMode ? "#e2e8f0" : "#334155", alignItems: "flex-start", lineHeight: 1.5 }}>
              <span style={{ color: "var(--mm-primary)", fontWeight: 900, flexShrink: 0, marginTop: 1 }}>›</span>{k}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", fontSize: 11 }}>
        {cachedSummary.level && <span style={{ background: "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)", color: "var(--mm-primary-glow)", padding: "3px 9px", borderRadius: 6, fontWeight: 650, border: "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" }}>🎯 {cachedSummary.level}</span>}
        {cachedSummary.read_time && <span style={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}>⏱ ~{cachedSummary.read_time} min</span>}
        <a href={item.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12, color: "var(--mm-primary)", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
          Lire la source ↗
        </a>
      </div>
    </>
  );
}


// ─── GitHub Card ─────────────────────────────────────────────────────────────
function GitHubCard({ item, isDarkMode }) {
  const langColor = { JavaScript: "#f7df1e", TypeScript: "#3178c6", Python: "#3776ab", Rust: "#dea584", Go: "#00add8" };
  const lc = langColor[item.language] || "var(--mm-primary)";
  return (
    <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "block" }}>
      <div className="tiv-article" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>🐙</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: isDarkMode ? "#e2e8f0" : "#0f172a", fontSize: 14, fontFamily: "var(--mm-font-display)", marginBottom: 4 }}>
              {item.titleFr || (item.lang === "fr" ? item.title : "Traduction française en cours…")}
            </div>
            {(item.descriptionFr || item.description) && (
              <div style={{ fontSize: 13, color: isDarkMode ? "#cbd5e1" : "#475569", lineHeight: 1.6, marginBottom: 8 }}>
                {item.descriptionFr || (item.lang === "fr" ? item.description : "Traduction française en cours…")}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {item.language && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: isDarkMode ? "#94a3b8" : "#64748b" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: lc, flexShrink: 0 }} />
                  {item.language}
                </span>
              )}
              <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>★ {item.stars?.toLocaleString("fr-FR")}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: isDarkMode ? "#475569" : "#94a3b8" }}>↗</span>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}

// ─── Coffre-fort persistant de traduction & Moteur Turbo ────────────────────
const TRANSLATION_VAULT_KEY = "tech_intel_translations_v3";
const META_AI_BLOCKED = /\b(veuillez fournir|en tant qu'ia|en tant que modèle|je ne peux pas|fournissez le texte|language model|cannot translate|as an ai)\b/i;

function isCleanTranslation(text) {
  const s = String(text || "").trim();
  return Boolean(s) && !META_AI_BLOCKED.test(s);
}

function loadTranslationVault() {
  try {
    const raw = safeStorage.get(TRANSLATION_VAULT_KEY);
    const data = raw ? JSON.parse(raw) : {};
    let dirty = false;
    // Auto-nettoyage du vault contre les réponses parasites d'IA
    for (const k of Object.keys(data)) {
      if (data[k]?.titleFr && !isCleanTranslation(data[k].titleFr)) {
        delete data[k];
        dirty = true;
      }
    }
    if (dirty) saveTranslationVault(data);
    return data;
  } catch {
    return {};
  }
}

function saveTranslationVault(vault) {
  try {
    safeStorage.set(TRANSLATION_VAULT_KEY, JSON.stringify(vault));
  } catch {}
}

function enrichWithVault(itemList) {
  if (!Array.isArray(itemList)) return [];
  const vault = loadTranslationVault();
  return itemList.map((it) => {
    if (!it) return it;
    const cached = vault[it.id] || (it.url && vault[it.url]) || vault[it.title];
    if (cached && isCleanTranslation(cached.titleFr)) {
      // Ignorer tout écho en anglais enregistré par erreur
      const isEnglishEcho = cached.titleFr && it.title && cached.titleFr.trim() === it.title.trim();
      if (isEnglishEcho) return it;
      return {
        ...it,
        titleFr: cached.titleFr || it.titleFr,
        descriptionFr: isCleanTranslation(cached.descriptionFr) ? cached.descriptionFr : it.descriptionFr,
      };
    }
    if (it.titleFr && !isCleanTranslation(it.titleFr)) {
      return { ...it, titleFr: "" };
    }
    return it;
  });
}

function needsFrenchTranslation(item) {
  if (!item || item.lang === "fr") return false;
  const hasValidTitle = Boolean(String(item.titleFr || "").trim()) &&
    isCleanTranslation(item.titleFr) &&
    item.titleFr.trim() !== (item.title || "").trim();
  const originalDescription = String(item.description || "").trim();
  const hasValidDescription = !originalDescription || (
    Boolean(String(item.descriptionFr || "").trim()) &&
    isCleanTranslation(item.descriptionFr) &&
    item.descriptionFr.trim() !== originalDescription
  );
  return !hasValidTitle || !hasValidDescription;
}

function visibleFrenchTitle(item) {
  if (!item) return "";
  if (item.lang === "fr") return item.title || item.titleFr || "";
  if (item.titleFr && isCleanTranslation(item.titleFr) && item.title && item.titleFr.trim() !== item.title.trim()) {
    return item.titleFr;
  }
  // En cours de traduction : afficher le titre original plutôt qu'un texte générique bloqué
  return item.title || "";
}

function visibleFrenchDescription(item) {
  if (!item) return "";
  const desc = String(item.description || "").trim();
  const title = item.titleFr || item.title || "";
  let res = "";
  if (!desc) {
    res = (item.descriptionFr && isCleanTranslation(item.descriptionFr)) ? item.descriptionFr : "";
  } else if (item.lang === "fr") {
    res = item.descriptionFr || desc;
  } else if (item.descriptionFr && isCleanTranslation(item.descriptionFr) && item.descriptionFr.trim() !== desc) {
    res = item.descriptionFr;
  } else {
    res = desc;
  }
  return stripRepeatedTitle(res, title);
}

// La traduction est désormais entièrement gérée par le moteur dédié
// ../lib/frenchNews.js (cache persistant, découpage intelligent, zéro quota).

// ─── Main Component ──────────────────────────────────────────────────────────
export default function TechIntelView({
  onBack,
  callClaude, theme = {}, isDarkMode, setExpressions, showToast, onCreateCard, onPickArticle, localToday, initialTab = "fr",
}) {
  const isDark = Boolean(
    isDarkMode ||
    (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark") ||
    theme?.isDark
  );

  const [tab, setTab] = useState(() => initialTab || "fr");
  const [isOnline, setIsOnline] = useState(() => getNetworkStatus().online);
  const isOnlineRef = useRef(isOnline);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  // Hors-ligne : on garde visibles les actus en cache (jusqu'à 30 j) au lieu de tout masquer après 24 h.
  const ageLimit = isOnline ? NEWS_MAX_AGE_MS : OFFLINE_MAX_AGE_MS;

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  const [autoTranslate, setAutoTranslate] = useState(true); // Toujours actif — l'utilisateur ne voit jamais d'actus en anglais
  const [items, setItems] = useState(() => {
    const raw = memoryCache_techIntel?.items || [];
    return enrichWithVault(raw);
  });
  const attemptedTranslationIdsRef = useRef(new Set());
  // 🛰️ Radar des bourses : exposé par ScholarshipHubView pour le bouton "Régénérer"
  const scholarshipScanRef = useRef(null);
  const [scholarshipScanning, setScholarshipScanning] = useState(false);
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(() => !memoryCache_techIntel);
  const [progress, setProgress] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(() => memoryCache_techIntel?.ts || 0);
  const lastRefreshRef = useRef(memoryCache_techIntel?.ts || 0);
  const updateLastRefresh = useCallback((ts) => {
    lastRefreshRef.current = ts;
    setLastRefresh(ts);
  }, []);
  const [errors, setErrors] = useState([]);
  const [selected, setSelected] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [readerArticle, setReaderArticle] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [translating, setTranslating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [readSummary, setReadSummary] = useState(null);
  const [reading, setReading] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [ttsProgress, setTtsProgress] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [dismissingIds, setDismissingIds] = useState(() => new Set());
  const [undoArticle, setUndoArticle] = useState(null);
  const undoTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);
  const prefetchAttemptedRef = useRef(false);
  const [inlineLoadingId, setInlineLoadingId] = useState(null);
  const [fullArticleMap, setFullArticleMap] = useState(() => {
    try {
      const data = JSON.parse(safeStorage.get('tech_intel_full_articles_v2') || '{}');
      let changed = false;
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string' && (
          /choisissez votre mode de lecture/i.test(v) ||
          isBoilerplateOrConsentText(v.slice(0, 400)) ||
          (v.length < 500 && (v.endsWith("...") || v.endsWith("…")))
        )) {
          delete data[k];
          changed = true;
        }
      }
      if (changed) {
        try { safeStorage.set('tech_intel_full_articles_v2', JSON.stringify(data)); } catch {}
      }
      return data;
    } catch { return {}; }
  });
  const fullArticleMapRef = useRef(fullArticleMap);
  useEffect(() => { fullArticleMapRef.current = fullArticleMap; }, [fullArticleMap]);

  const saveFullArticle = useCallback((id, text) => {
    if (!id || !text) return;
    setFullArticleMap(prev => {
      const { [id]: _old, ...rest } = prev;
      const next = capMap({ ...rest, [id]: text }, 200);
      try { safeStorage.set('tech_intel_full_articles_v2', JSON.stringify(next)); } catch {}
      saveArticleBodies(next).catch(() => {});
      return next;
    });
  }, []);

  // ─── Corps d'article francisé et COMPLET (persistant entre les sessions) ───
  const [bodyFrMap, setBodyFrMap] = useState(() => {
    try {
      const data = JSON.parse(safeStorage.get('tech_intel_body_fr_v1') || '{}');
      let changed = false;
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string' && (
          /choisissez votre mode de lecture/i.test(v) ||
          isBoilerplateOrConsentText(v.slice(0, 400)) ||
          (v.length < 500 && (v.endsWith("...") || v.endsWith("…")))
        )) {
          delete data[k];
          changed = true;
        }
      }
      if (changed) {
        try { safeStorage.set('tech_intel_body_fr_v1', JSON.stringify(data)); } catch {}
      }
      return data;
    } catch { return {}; }
  });
  const bodyFrMapRef = useRef(bodyFrMap);
  useEffect(() => { bodyFrMapRef.current = bodyFrMap; }, [bodyFrMap]);

  const saveFrenchBody = useCallback((id, text) => {
    if (!id || !text) return;
    setBodyFrMap(prev => {
      if (prev[id] === text) return prev;
      const { [id]: _old, ...rest } = prev;
      const next = capMap({ ...rest, [id]: text }, 200);
      try { safeStorage.set('tech_intel_body_fr_v1', JSON.stringify(next)); } catch {}
      saveArticleBodies(next).catch(() => {});
      return next;
    });
  }, []);
  const [readIds, setReadIds] = useState(() => {
    try { return new Set(JSON.parse(safeStorage.get('tech_intel_read_ids_v1') || '[]')); }
    catch { return new Set(); }
  });
  const [deletedIds, setDeletedIds] = useState(() => {
    try { return new Set(JSON.parse(safeStorage.get('tech_intel_deleted_ids_v1') || '[]')); }
    catch { return new Set(); }
  });
  const deletedIdsRef = useRef(deletedIds);
  useEffect(() => { deletedIdsRef.current = deletedIds; }, [deletedIds]);
  const [savedIds, setSavedIds] = useState(() => {
    try { return new Set(JSON.parse(safeStorage.get('tech_intel_saved_ids_v1') || '[]')); }
    catch { return new Set(); }
  });
  const [prefetchRunning, setPrefetchRunning] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState(null);
  const [query, setQuery] = useState("");
  const [isTabsOpen, setIsTabsOpen] = useState(false);
  const [sortMode, setSortMode] = useState('relevance'); // 'relevance' | 'recent' | 'popular'
  const [dateFilter, setDateFilter] = useState('all');   // 'all' | 'today' | 'week'
  const [feedFilter, setFeedFilter] = useState(() => {
    try {
      const saved = safeStorage.get('tech_intel_feed_filter_v2');
      return saved === 'popular' ? 'popular' : 'all';
    } catch { return 'all'; }
  });
  const [selectedTheme, setSelectedTheme] = useState(() => {
    try {
      const saved = safeStorage.get('tech_intel_selected_theme_v1');
      if (saved && THEME_FILTERS.some(t => t.id === saved)) {
        return saved;
      }
      return 'all';
    } catch {
      return 'all';
    }
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef(null);
  useEffect(() => {
    if (!isThemeMenuOpen) return;
    const handleClickOutside = (e) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target)) {
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isThemeMenuOpen]);

  const tabsMenuRef = useRef(null);
  useEffect(() => {
    if (!isTabsOpen) return;
    const handleClickOutside = (e) => {
      if (tabsMenuRef.current && !tabsMenuRef.current.contains(e.target)) {
        setIsTabsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isTabsOpen]);

  const [summaryVersion, setSummaryVersion] = useState(0);
  const [bionicReading, setBionicReading] = useState(false);
  const [podcastMode, setPodcastMode] = useState(false);
  const podcastModeRef = useRef(podcastMode);
  useEffect(() => { podcastModeRef.current = podcastMode; }, [podcastMode]);
  const [showSortMenu, setShowSortMenu] = useState(false);
  // Phase 2.1 — Virtualisation infinite scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  // Phase 3.1 — Sources configurables
  const [enabledSources, setEnabledSources] = useState(() => {
    try {
      const saved = safeStorage.get('tech_intel_sources_v1');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(RSS_FEEDS.map(f => f.name));
  });
  const [showSourcesModal, setShowSourcesModal] = useState(false);
  const [customFeedUrl, setCustomFeedUrl] = useState("");
  const [customFeeds, setCustomFeeds] = useState(() => {
    try {
      const v2 = safeStorage.get("tech_intel_custom_feeds_v2");
      if (v2) return JSON.parse(v2);
      const v1 = safeStorage.get("tech_intel_custom_feeds_v1");
      if (v1) return JSON.parse(v1);
      return [];
    } catch { return []; }
  });

  const refreshTimer = useRef(null);
  const prefetchOfflineRef = useRef(null);
  const tickTimer = useRef(null);
  const seenIds = useRef(new Set());
  // ✅ Phase 1.2+1.3 — Deux caches séparés avec LRU
  const summaryCache = useRef(null);
  if (!summaryCache.current) {
    try {
      const raw = JSON.parse(safeStorage.get(SUMMARY_LS_KEY) || '{}');
      const cleanCache = {};
      for (const [k, v] of Object.entries(raw)) {
        const fullText = [v?.headline, ...(v?.paragraphs || []), v?.why_it_matters].filter(Boolean).join(" ");
        if (!isBoilerplateOrConsentText(fullText)) {
          cleanCache[k] = v;
        }
      }
      summaryCache.current = cleanCache;
    }
    catch { summaryCache.current = {}; }
  }
  const analysisCache = useRef(null);
  if (!analysisCache.current) {
    try { analysisCache.current = JSON.parse(safeStorage.get(ANALYSIS_LS_KEY) || '{}'); }
    catch { analysisCache.current = {}; }
  }

  // ─ Cache persistant (IndexedDB ultra-robuste, zéro dépassement de quota 5Mo) ─
  const loadCache = useCallback(async () => {
    try {
      const list = await loadArticleList();
      if (Array.isArray(list) && list.length > 0) {
        return { items: list, ts: Date.now() };
      }
    } catch {}
    try {
      const c = safeStorage.getJSON(CACHE_KEY);
      return c || null;
    } catch { return null; }
  }, []);

  // ─ Traduction Turbo (moteur public instantané) & Coffre-Fort Persistant ─
  // Stratégie : moteur public d'abord (aucun quota, réponse en ~200 ms, cache
  // persistant), l'IA ne sert plus de goulot d'étranglement au rechargement.
  const translateItems = useCallback(async (rawItems) => {
    if (!rawItems || !rawItems.length) return rawItems;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return enrichWithVault(rawItems);
    const toTranslate = rawItems.filter(
      (i) => needsFrenchTranslation(i) && i.title && !attemptedTranslationIdsRef.current.has(i.id)
    );
    if (!toTranslate.length) return enrichWithVault(rawItems);
    // Marqué AVANT la tentative : un échec ne relance plus la traduction en boucle
    toTranslate.forEach((i) => attemptedTranslationIdsRef.current.add(i.id));

    const vault = loadTranslationVault();
    let updatedVault = false;

    const commit = (entries) => {
      if (!entries.length) return;
      setItems((prev) => prev.map((p) => {
        const match = entries.find((s) => s.id === p.id);
        return match ? { ...p, titleFr: match.titleFr, descriptionFr: match.descriptionFr } : p;
      }));
    };

    const processBatch = async (batch) => {
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          // Traduction intégrale : le titre ET la description entière
          // (plus aucune coupure à 450 caractères).
          const [titleFr, descriptionFr] = await Promise.all([
            translateToFrench(item.title || ""),
            item.description ? translateToFrench(item.description) : Promise.resolve(""),
          ]);
          // Ne conserver que si le titre a réellement été traduit (non vide et distinct du titre original)
          if (!titleFr || (item.title && titleFr.trim() === item.title.trim())) return null;
          const entry = { titleFr, descriptionFr };
          vault[item.id] = entry;
          if (item.url) vault[item.url] = entry;
          vault[item.title] = entry;
          updatedVault = true;
          attemptedTranslationIdsRef.current.add(item.id);
          return { id: item.id, ...entry };
        })
      );

      const successful = results
        .filter((r) => r.status === "fulfilled" && r.value)
        .map((r) => r.value);

      commit(successful);
      if (updatedVault) saveTranslationVault(vault);
    };

    const concurrency = 6;
    setTranslating(true);
    try {
      const priorityItems = toTranslate.slice(0, 30);
      const remainingItems = toTranslate.slice(30);

      for (let i = 0; i < priorityItems.length; i += concurrency) {
        await processBatch(priorityItems.slice(i, i + concurrency));
        await new Promise((r) => setTimeout(r, 50));
      }

      (async () => {
        for (let i = 0; i < remainingItems.length; i += concurrency) {
          await processBatch(remainingItems.slice(i, i + concurrency));
          await new Promise((r) => setTimeout(r, 80));
        }
        if (updatedVault) saveTranslationVault(vault);
      })();
    } finally {
      setTranslating(false);
    }

    return enrichWithVault(rawItems);
  }, []);

  const translateSingle = useCallback(async (item) => {
    if (translating || !needsFrenchTranslation(item)) return;
    setTranslating(true);
    try {
      const [titleFr, descriptionFr] = await Promise.all([
        translateToFrench(item.title || ""),
        item.description ? translateToFrench(item.description) : Promise.resolve("")
      ]);
      if (titleFr) {
        const vault = loadTranslationVault();
        const entry = { titleFr, descriptionFr };
        vault[item.id] = entry;
        if (item.url) vault[item.url] = entry;
        vault[item.title] = entry;
        saveTranslationVault(vault);

        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...entry } : i)));
        showToast?.("Traduction réussie ✨", "success");
      }
    } catch {
      showToast?.("Erreur de traduction", "error");
    } finally {
      setTranslating(false);
    }
  }, [translating, showToast]);

  const translateVisible = useCallback(async () => {
    if (loading || translating) return;
    const visibleEnItems = items.filter(
      (i) => needsFrenchTranslation(i) && (Date.now() - (i.ts || 0)) <= ageLimit
    );
    if (visibleEnItems.length === 0) return;
    await translateItems(visibleEnItems);
  }, [items, loading, translating, translateItems, ageLimit]);

  // ─ Fetching ─
  const fetchAll = useCallback(async (silent = false) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setLoading(false);
      if (!silent) showToast?.("Hors ligne : affichage des actus enregistrées", "info");
      return;
    }
    if (!silent) setLoading(true);
    setProgress(0);
    setVisibleCount(PAGE_SIZE);

    const activeFeeds = [
      ...RSS_FEEDS.filter(f => enabledSources.has(f.name)),
      ...customFeeds.filter(f => f.enabled !== false && (enabledSources.has(f.name) || !enabledSources.has("__disabled__" + (f.id || f.name))))
    ];

    const tasks = [
      { name: "HN", run: () => fetchHN() },
      { name: "Reddit", run: () => fetchReddit() },
      { name: "GitHub", run: () => fetchGitHubTrending() },
      ...activeFeeds.map(f => ({ name: f.name, run: () => fetchRSS(f) })),
      ...YOUTUBE_CHANNELS.map(c => ({ name: `YT ${c.name}`, run: () => fetchYouTube(c) })),
    ];
    const total = tasks.length;
    let done = 0;
    const failed = [];
    const all = [];

    // Pool haute performance à 8 sources en parallèle avec coupe-circuit adaptatif
    const concurrency = 8;
    let cursor = 0;
    const runTaskWithTimeout = async (task) => {
      let tId;
      const timeoutP = new Promise((_, reject) => {
        tId = setTimeout(() => reject(new Error('Feed timeout')), 9500);
      });
      try {
        return await Promise.race([task.run(), timeoutP]);
      } finally {
        clearTimeout(tId);
      }
    };
    const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
      while (cursor < tasks.length) {
        const task = tasks[cursor++];
        if (!task) break;
        try {
          const res = await runTaskWithTimeout(task);
          if (Array.isArray(res) && res.length) { all.push(...res); }
        } catch (e) {
          failed.push(task.name);
          console.debug(`RSS [${task.name}]:`, e?.message);
        } finally {
          done++;
          setProgress(Math.round((done / total) * 100));
        }
      }
    });
    await Promise.all(workers);

    // ✅ Phase 1.1 — Déduplication par URL canonique (évite les doublons cross-sources)
    const seenUrls = new Set();
    const deduped = all.filter(item => {
      const key = (item.url || item.id).replace(/[?#].*$/, '').toLowerCase().trim();
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });
    const cutoff = Date.now() - NEWS_MAX_AGE_MS;
    let fresh = deduped.filter(i => (i.ts || 0) >= cutoff && !deletedIdsRef.current.has(i.id));

    // ✅ Filtrage strict : seules les actus de nature tech correspondant aux catégories du sélecteur sont admises
    const validThemes = new Set(["ai", "cyber", "cloud", "dev", "world"]);
    fresh = fresh.filter(i => {
      const theme = getArticleTheme(i);
      return theme && validThemes.has(theme.id);
    });

    fresh.sort((a, b) => (b.ts - a.ts) || (b.score - a.score));

    // ✅ Application IMMÉDIATE à 0ms du coffre-fort de traductions (persiste à chaque actualisation)
    fresh = enrichWithVault(fresh);

    // ✅ Fusion intelligente : NE JAMAIS écraser brutalement la bibliothèque d'actus existantes
    // Les nouveaux articles écrasent/enrichissent les anciens et sont mis en tête
    const mergedMap = new Map();
    (items || []).forEach(it => {
      if (it?.id && !deletedIdsRef.current.has(it.id) && (it.ts || 0) >= cutoff) {
        const theme = getArticleTheme(it);
        if (theme && validThemes.has(theme.id)) {
          mergedMap.set(it.id, it);
        }
      }
    });
    fresh.forEach(it => {
      mergedMap.set(it.id, it);
    });

    let combined = Array.from(mergedMap.values());
    combined.sort((a, b) => (b.ts - a.ts) || (b.score - a.score));

    // Aucune source n'a répondu et aucun article en cache : on informe sans vider
    if (combined.length === 0) {
      setErrors(failed);
      setLoading(false);
      return;
    }

    // ✅ Pré-traduction ultra-rapide des 3 premiers articles prioritaires sans bloquer l'affichage
    const priorityEn = combined
      .filter(i => needsFrenchTranslation(i) && (i.score >= 1))
      .slice(0, 3);

    if (priorityEn.length > 0) {
      try {
        const vault = loadTranslationVault();
        let updatedVault = false;
        const translateFast = async () => {
          await Promise.allSettled(
            priorityEn.map(async (item) => {
              const [titleFr, descriptionFr] = await Promise.all([
                translateToFrench(item.title || ""),
                item.description ? translateToFrench(item.description) : Promise.resolve("")
              ]);
              if (titleFr && (!item.title || titleFr.trim() !== item.title.trim())) {
                item.titleFr = titleFr;
                item.descriptionFr = descriptionFr;
                const entry = { titleFr, descriptionFr };
                vault[item.id] = entry;
                if (item.url) vault[item.url] = entry;
                vault[item.title] = entry;
                updatedVault = true;
              }
            })
          );
        };
        let tId;
        await Promise.race([
          translateFast(),
          new Promise((resolve) => { tId = setTimeout(resolve, 2000); })
        ]).finally(() => clearTimeout(tId));
        if (updatedVault) saveTranslationVault(vault);
      } catch (err) {
        console.debug("Pre-translation fast pass:", err);
      }
    }

    // Affichage atomique : la liste fusionnée est mise à jour en un seul bloc stable
    setItems(combined);
    setLoading(false);

    const deduped2 = combined;
    const now = Date.now();
    updateLastRefresh(now);
    const c = { items: deduped2, ts: now };
    memoryCache_techIntel = c;
    try {
      await saveArticleList(combined);
      try {
        localStorage.removeItem("memomaitre_" + CACHE_KEY);
        localStorage.removeItem("memomaitre_" + CACHE_KEY + "_ts");
        localStorage.removeItem("memomaitre_" + CACHE_KEY + "_dirty");
      } catch {}
    } catch (e) {
      console.warn("Cache IndexedDB KO:", e);
      // Fallback sessionStorage (survie à la session)
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
    }
    setErrors(failed);
    // 📥 Préparation hors-ligne : télécharge en arrière-plan le texte complet des premières actus
    prefetchOfflineRef.current?.(fresh);
    setLoading(false);
  }, [callClaude, customFeeds, enabledSources, translateItems, showToast]);

  const fetchDigest = useCallback(async (currentItems = []) => {
    const today = localToday || new Date().toISOString().slice(0, 10);
    const key = DIGEST_KEY_PREFIX + today;
    try {
      const cached = safeStorage.getJSON(key);
      if (cached) { setDigest(cached); return; }
    } catch { }

    if (!callClaude || !navigator.onLine) {
      const topItems = (currentItems || [])
        .filter(i => (i.score || 0) >= 1)
        .sort((a, b) => (trendScore(b) || 0) - (trendScore(a) || 0))
        .slice(0, 6);
      if (topItems.length > 0) {
        const localDigest = {
          headline: "Synthèse des faits marquants du jour",
          items: topItems.map(it => ({
            category: it.kind === "github" ? "Dev" : it.isWorld ? "Monde" : "Tech",
            title: visibleFrenchTitle(it),
            summary: visibleFrenchDescription(it) || "Consultez l'article pour les détails complets.",
            importance: (it.score || 0) >= 100 ? 5 : (it.score || 0) >= 30 ? 4 : 3,
            emoji: it.kind === "github" ? "⭐" : "💡",
          })),
          stat: `${currentItems.length} actualités analysées`,
        };
        setDigest(localDigest);
        try { safeStorage.setJSON(key, localDigest); } catch { }
      }
      return;
    }

    try {
      // ✅ Phase 3.2 — Ancrer le digest aux vrais articles chargés
      const top20 = currentItems
        .filter(i => i.score >= 1)
        .sort((a, b) => trendScore(b) - trendScore(a))
        .slice(0, 20)
        .map(i => `- [${i.source}] ${i.titleFr || i.title}: ${(i.descriptionFr || i.description || '').slice(0, 200)}`);
      const articlesCtx = top20.length
        ? `\n\nBasé sur ces articles du flux actuel :\n${top20.join('\n')}`
        : '';
      const sys = `Tu es un expert tech & IA qui rédige une revue de presse quotidienne pour des développeurs francophones.
Couvre obligatoirement : IA/LLM, Cloud/DevOps, Cybersécurité, Open Source, Outils dev.
Rédige TOUJOURS en FRANÇAIS. Retourne UNIQUEMENT ce JSON :
{"headline":"...","items":[{"category":"IA|Cloud|Cybersec|Dev|Business","title":"...","summary":"...","importance":1-5,"emoji":"..."}],"trending_tool":{"name":"...","description":"...","url":"..."},"stat":"..."}
Maximum 8 items. Utilise en priorité les articles fournis.`;
      const rawResult = await callClaude(sys, `Génère le digest tech du jour en français.${articlesCtx}`, { grounding: !articlesCtx, maxTokens: 1400 });
      const rawText = (rawResult && typeof rawResult === "object" && rawResult.text) ? rawResult.text : (rawResult || "");
      const json = safeParseJsonBlock(rawText);
      if (json) {
        setDigest(json);
        try { safeStorage.setJSON(key, json); } catch { }
      }
    } catch (e) {
      console.warn("digest fail", e);
      const topItems = (currentItems || [])
        .filter(i => (i.score || 0) >= 1)
        .sort((a, b) => (trendScore(b) || 0) - (trendScore(a) || 0))
        .slice(0, 6);
      if (topItems.length > 0) {
        const localDigest = {
          headline: "Synthèse des faits marquants du jour",
          items: topItems.map(it => ({
            category: it.kind === "github" ? "Dev" : it.isWorld ? "Monde" : "Tech",
            title: visibleFrenchTitle(it),
            summary: visibleFrenchDescription(it) || "Consultez l'article pour les détails complets.",
            importance: (it.score || 0) >= 100 ? 5 : 3,
            emoji: "💡",
          })),
          stat: `${currentItems.length} actualités disponibles`,
        };
        setDigest(localDigest);
      }
    }
  }, [callClaude, localToday]);

  // ─ Effects ─
  useEffect(() => {
    let active = true;
    async function init() {
      // 1. Restauration instantanée IndexedDB (0ms : actus + corps complets)
      try {
        const [{ items: cachedList, lastListAt }, cachedBodies] = await Promise.all([
          loadArticleListMeta(),
          loadArticleBodies(),
        ]);
        if (!active) return;
        if (cachedBodies && typeof cachedBodies === "object" && Object.keys(cachedBodies).length > 0) {
          setFullArticleMap(prev => ({ ...cachedBodies, ...prev }));
          setBodyFrMap(prev => ({ ...cachedBodies, ...prev }));
        }
        if (Array.isArray(cachedList) && cachedList.length > 0) {
          memoryCache_techIntel = { items: cachedList, ts: lastListAt || Date.now() };
          setItems(enrichWithVault(cachedList));
          updateLastRefresh(lastListAt || Date.now());
          setLoading(false);
          // Le flux est présent et stable : AUCUN rafraîchissement automatique en tâche de fond.
          // Les actualités ne bougent pas sans clic explicite de l'utilisateur sur "Actualiser".
          return;
        }
      } catch (err) {
        console.warn("[TechIntel] Erreur chargement initial IndexedDB:", err);
      }

      // 2. Vérification session
      try {
        const sess = sessionStorage.getItem(CACHE_KEY);
        if (sess) {
          const c = JSON.parse(sess);
          if (c?.items?.length > 0) {
            memoryCache_techIntel = c;
            setItems(enrichWithVault(c.items));
            updateLastRefresh(c.ts || 0);
            setLoading(false);
            // Cache session présent : flux stable sans rechargement intempestif
            return;
          }
        }
      } catch {}

      // 3. Fallback réseau UNIQUEMENT si aucun cache (premier lancement)
      if (typeof navigator !== "undefined" && navigator.onLine) {
        fetchAll(false);
      } else {
        setLoading(false);
      }
    }
    init();
    tickTimer.current = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => { active = false; clearInterval(tickTimer.current); };
  }, [fetchAll, updateLastRefresh]);

  useEffect(() => {
    try { safeStorage.set("tiv_auto_translate", JSON.stringify(autoTranslate)); } catch { }
  }, [autoTranslate]);

  useEffect(() => {
    try { safeStorage.set("tech_intel_deleted_ids_v1", JSON.stringify([...deletedIds])); } catch { }
  }, [deletedIds]);

  useEffect(() => {
    try { safeStorage.set("tech_intel_saved_ids_v1", JSON.stringify([...savedIds])); } catch { }
  }, [savedIds]);

  useEffect(() => {
    try { safeStorage.set("tech_intel_sources_v1", JSON.stringify([...enabledSources])); } catch { }
  }, [enabledSources]);

  useEffect(() => {
    try {
      safeStorage.set("tech_intel_custom_feeds_v2", JSON.stringify(customFeeds));
      safeStorage.set("tech_intel_custom_feeds_v1", JSON.stringify(customFeeds));
    } catch { }
  }, [customFeeds]);

  // Briefing IA automatique à la sélection de l'onglet
  useEffect(() => {
    if (tab === "digest" && !digest && items.length > 0 && !loading) {
      fetchDigest(items);
    }
  }, [tab, digest, items, loading, fetchDigest]);

  // Pas de boucle de traduction intempestive en arrière-plan qui insère brusquement des cartes dans le flux visible.
  // Les articles prioritaires sont traduits à l'actualisation, et la lecture individuelle traduit à la demande.

  // ✅ Phase 2.2 — Prefetch automatique avec Circuit-Breaker (God Mode Offline)
  const runPrefetch = useCallback(async () => {
    if (prefetchRunning || !callClaude || !navigator.onLine || prefetchAttemptedRef.current) return;
    prefetchAttemptedRef.current = true;
    setPrefetchRunning(true);
    prefetchAttemptedRef.current = true;
    
    // On limite à 5 articles maximum
    const toProcess = items
      .filter(i => i.score >= 1 && !summaryCache.current[i.id])
      .slice(0, 5);
      
    if (toProcess.length === 0) { setPrefetchRunning(false); return; }
    setPrefetchProgress({ done: 0, total: toProcess.length });
    
    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      if (isGeminiLikelyUnavailable()) break;
      
      if (i > 0) await new Promise(r => setTimeout(r, 2000));
      
      try {
        const story = await generateCompleteStory(item, callClaude);
        if (story?.paragraphs?.length > 0) {
          setSummaryEntry(summaryCache.current, item.id, story);
          persistCache(SUMMARY_LS_KEY, summaryCache.current);
          setSummaryVersion(v => v + 1);
        }
      } catch (e) {
        console.warn("[TechIntel] Prefetch suspendu — IA indisponible", e);
        break; // Arrêt d'urgence immédiat pour libérer le thread UI
      }
      
      setPrefetchProgress({ done: i + 1, total: toProcess.length });
      await new Promise(r => setTimeout(r, 1200));
    }
    
    setTimeout(() => setPrefetchProgress(null), 2000);
    setPrefetchRunning(false);
  }, [items, callClaude, prefetchRunning]);

  // Le prefetch automatique en arrière-plan a été supprimé pour éviter les requêtes IA non sollicitées


  // ✅ Phase 2.1 — IntersectionObserver pour le scroll virtuel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount(n => n + PAGE_SIZE);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [items.length, tab, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset visible count quand l'onglet change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [tab, query]);


  useEffect(() => () => { try { window.speechSynthesis.cancel(); } catch { } }, []);

  // ─ Filtered items ─
  const filtered = useMemo(() => {
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    
    let res = items.filter(i => {
      if (deletedIds.has(i.id)) return false;
      // En ligne : plus de 24h = masqué. Hors ligne : on garde le cache lisible.
      if (savedIds.has(i.id)) return true;
      return (nowMs - (i.ts || 0)) <= ageLimit;
    });
    
    const tokens = normalizeText(query).split(" ").filter(Boolean);

    // 🔎 Recherche globale — cherche dans tout le flux
    if (tokens.length) {
      res = res.filter(i => matchesQuery(i, tokens));
      if (feedFilter === "relevant" && tab !== "github") {
        res = res.filter(i => (i.score || 0) >= 3 || trendScore(i) >= 7);
      }
      return [...res].sort((a, b) => (b.score - a.score) || (b.ts - a.ts));
    }

    if (tab === "saved")   res = res.filter(i => savedIds.has(i.id));
    // ✅ Phase 3.3 — Score de tendance réel (décroissance temporelle)
    else if (tab === "top")     res = [...res].sort((a, b) => trendScore(b) - trendScore(a)).slice(0, 300);
    else if (tab === "fr")      res = res.filter(i => i.lang === "fr" || (Boolean(i.titleFr) && i.titleFr.trim() !== (i.title || "").trim()));
    else if (tab === "github")  res = res.filter(i => i.kind === "github");
    else if (tab === "youtube") res = res.filter(i => i.kind === "youtube");
    else if (tab === "digest")  res = [];
    else {
      const rx = FILTERS[tab];
      if (rx) res = res.filter(i => rx.test(`${i.title} ${i.description || ""}`));
    }

    // ⭐ Filtrage par popularité uniquement si l'utilisateur l'active
    if (feedFilter === "popular" && tab !== "github") {
      res = res.filter(i => (i.score || 0) >= 3 || trendScore(i) >= 7);
    }

    // 🏷️ Filtrage Thématique Haute Précision (IA, Cyber, Dev, Cloud, Monde)
    if (selectedTheme && selectedTheme !== "all") {
      const themeObj = THEME_FILTERS.find(t => t.id === selectedTheme);
      if (themeObj?.rx) {
        res = res.filter(i => themeObj.rx.test(`${i.title || ""} ${i.titleFr || ""} ${i.description || ""} ${i.descriptionFr || ""}`));
      }
    }

    // ✅ Phase 2.4 — Filtre temporel
    if (dateFilter === 'today') res = res.filter(i => Date.now() - (i.ts || 0) < 86400000);
    else if (dateFilter === 'week') res = res.filter(i => Date.now() - (i.ts || 0) < 604800000);

    // ✅ Phase 2.4 — Tri explicite
    return [...res].sort((a, b) => {
      if (sortMode === 'recent')  return (b.ts || 0) - (a.ts || 0);
      if (sortMode === 'popular') return ((b.votes || b.stars || 0) - (a.votes || a.stars || 0));
      // 'relevance' : par score puis par timestamp (stable)
      return (b.score - a.score) || (b.ts - a.ts);
    });
  }, [items, tab, readIds, deletedIds, savedIds, query, sortMode, dateFilter, feedFilter, selectedTheme, ageLimit]);

  const listItems = filtered;

  const readArticle = useCallback(async (item) => {
    if (!item) return;
    if (summaryCache.current[item.id]) {
      setReadSummary(summaryCache.current[item.id]);
      return;
    }
    if (!navigator.onLine) {
      const offlineBody = bodyFrMapRef.current[item.id] || fullArticleMapRef.current[item.id] || "";
      const offlineParas = offlineBody ? offlineBody.split(/\n{2,}/).map(p => p.trim()).filter(Boolean) : [];
      const fallback = {
        headline: visibleFrenchTitle(item),
        paragraphs: offlineParas.length ? offlineParas : [(visibleFrenchDescription(item) || "Contenu complet non disponible hors ligne.")],
        key_takeaways: [offlineParas.length ? "Mode hors-ligne : article enregistré sur l'appareil." : "Mode hors-ligne : résumé généré à partir de la description."],
        level: "N/A", read_time: 1
      };
      setReadSummary(fallback);
      return;
    }
    setReading(true);
    try {
      const story = await generateCompleteStory(item, callClaude);
      setSummaryEntry(summaryCache.current, item.id, story);
      persistCache(SUMMARY_LS_KEY, summaryCache.current);
      setReadSummary(story);
      setSummaryVersion(v => v + 1);
      
      setReadIds(prev => {
        if (prev.has(item.id)) return prev;
        const next = new Set(prev);
        next.add(item.id);
        try { safeStorage.set('tech_intel_read_ids_v1', JSON.stringify([...next])); } catch {}
        return next;
      });
    } catch { showToast?.("Chargement impossible", "error"); }
    finally { setReading(false); }
  }, [showToast, callClaude]);

  // Pas de boucle de traduction automatique continue qui fait pop-in de nouvelles cartes sous les yeux de l'utilisateur.
  // Les actus anglophones prioritaires sont déjà francisées lors du fetch, et le reste se traduit à la demande (JIT).

  // La lecture automatique de l'article actif au montage a été supprimée (l'IA n'est sollicitée que sur clic explicite)


  // ─── Traduction intégrale à la demande (Just-In-Time) ─────────────────────
  // Les articles complets ne sont plus scrapés ni traduits en avance en masse
  // (ce qui provoquait des tempêtes 429). La francisation complète s'opère
  // de manière ciblée dans handleToggleExpand lors du clic utilisateur.


  // ─── Passer un article (Mode lecture fluide sans scroll) ─────────────────
  const handleDismissArticle = useCallback((item, e) => {
    e?.stopPropagation?.();
    if (!item?.id) return;

    if (speakingId === item.id) {
      try { window.speechSynthesis?.cancel?.(); } catch {}
      setSpeakingId(null);
      setTtsProgress(null);
    }

    setDismissingIds(prev => new Set(prev).add(item.id));

    setTimeout(() => {
      setDeletedIds(prev => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      setDismissingIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }, 280);

    // Filet de sécurité Undo (5 secondes)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoArticle(item);
    undoTimerRef.current = setTimeout(() => {
      setUndoArticle(null);
      undoTimerRef.current = null;
    }, 5000);
  }, [speakingId]);

  const handleUndoDismiss = useCallback(() => {
    if (!undoArticle?.id) return;

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    const restoredId = undoArticle.id;
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.delete(restoredId);
      return next;
    });

    setUndoArticle(null);
    showToast?.("Article restauré dans le flux", "success");
  }, [undoArticle, showToast]);

  // ─── Pipeline « article complet en français » (dédupliqué + préchargé) ───
  // Récupère le texte intégral, le traduit EN ENTIER (mode strict : jamais de
  // mélange anglais/français) et le garde en mémoire. Lancé en arrière-plan
  // pour les actus visibles : à l'ouverture, tout est déjà là.
  const articleJobsRef = useRef(new Map());
  const [articleStatus, setArticleStatus] = useState({}); // id -> 'loading' | 'failed'
  const ensureFrenchArticle = useCallback((item, force = false) => {
    if (!item?.id) return Promise.resolve();
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Hors-ligne : le texte local et résumés déjà stockés sont utilisés immédiatement sans requête
      const local = bodyFrMapRef.current[item.id] || fullArticleMapRef.current[item.id] || item.descriptionFr || item.description || "";
      if (local && (item.lang === "fr" || item.descriptionFr)) {
        saveFrenchBody(item.id, cleanEditorialText(local) || local);
      }
      return Promise.resolve();
    }
    const existing = bodyFrMapRef.current[item.id] || fullArticleMapRef.current[item.id] || "";
    if (!force && existing && !isTeaserSnippet(existing, item)) return Promise.resolve();
    const jobs = articleJobsRef.current;
    if (jobs.has(item.id)) return jobs.get(item.id);

    // Extraction 100% silencieuse en arrière-plan sans bloquer l'UI
    const job = (async () => {
      let source = fullArticleMapRef.current[item.id] || "";
      if (isTeaserSnippet(source, item)) source = "";
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (!source && item.url) {
        const raw = await extractFullArticleText(item).catch(() => "");
        const paras = extractUniversalArticleParagraphs(raw || "", item);
        const cleaned = paras.join("\n\n").trim();
        if (cleaned && !isTeaserSnippet(cleaned, item)) {
          source = cleaned;
          saveFullArticle(item.id, cleaned);
        }
      }
      if (!source && callClaude && item.url) {
        try {
          const aiContext = await callClaude(
            "Tu es un journaliste et analyste tech expert. Rédige un article complet et approfondi en français (4 à 6 paragraphes détaillés) expliquant cette actualité, le contexte technique, les acteurs impliqués et les implications pratiques pour les développeurs.",
            `Titre : "${item.titleFr || item.title}"\nSource : ${item.source || "Tech"}\nLien : ${item.url}\nRésumé initial : ${item.description || item.descriptionFr || ""}`,
            { maxTokens: 1200 }
          );
          const aiText = typeof aiContext === 'string' ? aiContext : (aiContext?.text || '');
          if (aiText && aiText.trim().length > 300) {
            source = aiText.trim();
            saveFullArticle(item.id, source);
          }
        } catch {}
      }
      if (!source) source = cleanEditorialText(item.description || item.descriptionFr || "");
      if (!source) return;
      const frenchBody = item.lang === "fr" ? source : await translateToFrench(source, { strict: true });
      if (!frenchBody) return;
      saveFrenchBody(item.id, frenchBody);
    })()
      .catch(() => {})
      .finally(() => { setTimeout(() => jobs.delete(item.id), 20000); });
    jobs.set(item.id, job);
    return job;
  }, [saveFullArticle, saveFrenchBody, callClaude]);

  // 📶 Suivi réseau : mise à jour du statut en ligne/hors-ligne sans rechargement intempestif
  useEffect(() => {
    return onNetworkChange((st) => {
      setIsOnline(st.online);
    });
  }, []);

  // 💾 Nombre total d'articles avec texte complet déjà prêt sur l'appareil (IndexedDB)
  const offlineReadyCount = useMemo(() => {
    return items.filter(i => {
      const id = i.id;
      return Boolean(
        (bodyFrMap[id] && !isTeaserSnippet(bodyFrMap[id], i)) ||
        (fullArticleMap[id] && !isTeaserSnippet(fullArticleMap[id], i)) ||
        (i.fullContent && !isTeaserSnippet(i.fullContent, i))
      );
    }).length;
  }, [items, bodyFrMap, fullArticleMap]);

  // 📥 Préparation silencieuse hors-ligne : extrait en tâche de fond le texte complet des
  // 35 articles les plus récents et pertinents avec un pool de 3 workers concurrents.
  const offlinePrefetchRunning = useRef(false);
  useEffect(() => {
    prefetchOfflineRef.current = async (list) => {
      if (offlinePrefetchRunning.current || !Array.isArray(list) || list.length === 0) return;
      if (shouldReduceData()) return;
      offlinePrefetchRunning.current = true;
      try {
        const targets = list
          .filter(i => i?.id && i.kind !== "github" && i.kind !== "youtube" && isTeaserSnippet(bodyFrMapRef.current[i.id], i) && isTeaserSnippet(fullArticleMapRef.current[i.id], i))
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, 35);
        if (!targets.length) return;
        let cursor = 0;
        const concurrency = 3;
        const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
          while (cursor < targets.length) {
            const it = targets[cursor++];
            if (!it) break;
            if (typeof navigator !== "undefined" && navigator.onLine === false) break;
            await ensureFrenchArticle(it).catch(() => {});
            await new Promise(r => setTimeout(r, 120));
          }
        });
        await Promise.all(workers);
      } finally {
        offlinePrefetchRunning.current = false;
      }
    };
  }, [ensureFrenchArticle]);

  // ⚡ Zéro blocage : l'affichage s'appuie directement et immédiatement sur les contenus disponibles.
  const handleToggleExpand = useCallback((item, e) => {
    e?.stopPropagation?.();
    if (!item?.id) return;

    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });

    if (typeof navigator !== "undefined" && navigator.onLine) {
      const currentText = bodyFrMapRef.current[item.id] || fullArticleMapRef.current[item.id] || item.fullContent || "";
      if (isTeaserSnippet(currentText, item)) {
        ensureFrenchArticle(item, false);
      }
    }
  }, [ensureFrenchArticle]);

  const analyze = useCallback(async (item) => {
    setSelected(item);
    setAnalysis(null);
    // ✅ Phase 1.3 — Lire depuis summaryCache pour le résumé, analysisCache pour l'analyse
    const cachedSummary = summaryCache.current[item.id];
    const fallbackDesc = visibleFrenchDescription(item);
    setReadSummary(cachedSummary || (fallbackDesc ? { headline: visibleFrenchTitle(item), lede: fallbackDesc } : null));
    const cachedAnalysis = analysisCache.current?.[item.id];
    if (cachedAnalysis && typeof cachedAnalysis === "object" && Object.keys(cachedAnalysis).length) {
      setAnalysis(cachedAnalysis.data || cachedAnalysis);
      return;
    }
    if (navigator.onLine === false || !callClaude) return; // hors ligne ou sans IA : la fiche s'ouvre avec les infos disponibles
    setAnalyzing(true);
    try {
      const raw = await callClaude(
        "Tu es analyste tech. Réponds UNIQUEMENT avec le JSON demandé, en français.",
        `Analyse cet article tech : ${item.titleFr || item.title} — ${item.descriptionFr || item.description || ""}\nRetourne JSON : {"summary":"résumé 3 phrases","key_points":["p1","p2","p3"],"relevance":"pourquoi c'est important pour un dev","create_card":true,"card_front":"concept clé","card_back":"explication structurée"}`,
        { maxTokens: 600 }
      );
      const rawText = typeof raw === 'string' ? raw : (raw?.text || '');
      const parsedAnalysis = safeParseJsonBlock(rawText);
      setAnalysis(parsedAnalysis);
      // ✅ Phase 1.3 — Stocker l'analyse dans analysisCache (séparé du résumé)
      setSummaryEntry(analysisCache.current, item.id, parsedAnalysis);
      persistCache(ANALYSIS_LS_KEY, analysisCache.current);
    } catch { showToast?.("Analyse impossible", "error"); }
    finally { setAnalyzing(false); }
  }, [callClaude, showToast]);

  const createCardFromItem = useCallback((item) => {
    if (!item) return;
    const summaryData = summaryCache.current?.[item.id];
    const keyTakeaway = summaryData?.key_takeaways?.[0] || summaryData?.why_it_matters || item.descriptionFr || item.description || "";
    
    let category = "💻 Dev & Tech";
    const text = `${item.title} ${item.description || ""}`.toLowerCase();
    if (item.isWorld || /présidentielle|élection|guerre|conflit|diplomatie|traité|sommet|onu|otan|brics|banque centrale|inflation|climat|cop|prix nobel|santé mondiale/i.test(text)) category = "🌍 Géopolitique & Monde";
    else if (/ai|llm|gpt|claude|gemini|llama|intelligence artificielle/i.test(text)) category = "🤖 IA & Data";
    else if (/cyber|security|vulnerab|cve|exploit|hack/i.test(text)) category = "🔐 Cybersec";
    else if (/cloud|aws|azure|k8s|kubernetes|docker/i.test(text)) category = "☁️ Cloud & DevOps";
    else if (item.lang === "en" || item.source === "HN") category = "🇬🇧 Tech English";

    const tagPrefix = (item.isWorld || category === "🌍 Géopolitique & Monde") ? "[Monde]" : "[Actu]";
    const card = {
      id: `tech_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      front: `${tagPrefix} ${item.titleFr || item.title}`,
      back: keyTakeaway ? `${keyTakeaway}\n\n↳ Source : ${item.sourceName || item.source}` : `${item.titleFr || item.title}\n\n↳ Source : ${item.sourceName || item.source}`,
      example: item.url || "",
      category,
      level: 0,
      repetitions: 0,
      interval: 1,
      stability: null,
      difficulty: null,
      easeFactor: 2.5,
      nextReview: localToday || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      _source: item.source,
      _url: item.url,
    };

    if (onCreateCard) {
      onCreateCard(card);
    } else if (setExpressions) {
      setExpressions(prev => [card, ...(prev || [])]);
    }
    showToast?.("⚡ Fiche ajoutée à vos révisions FSRS !", "success");
  }, [localToday, onCreateCard, setExpressions, showToast]);

  const createCardFromAnalysis = useCallback(() => {
    if (!analysis?.card_front && !selected) return;
    const item = selected;
    let category = "💻 Dev & Tech";
    const text = `${item?.title || ""} ${item?.description || ""}`.toLowerCase();
    if (item?.isWorld || /présidentielle|élection|guerre|conflit|diplomatie|traité|sommet|onu|otan|brics|banque centrale|inflation|climat|cop|prix nobel|santé mondiale/i.test(text)) category = "🌍 Géopolitique & Monde";
    else if (/ai|llm|gpt|claude|gemini|llama|intelligence artificielle/i.test(text)) category = "🤖 IA & Data";
    else if (/cyber|security|vulnerab|cve|exploit|hack/i.test(text)) category = "🔐 Cybersec";
    else if (/cloud|aws|azure|k8s|kubernetes|docker/i.test(text)) category = "☁️ Cloud & DevOps";

    const card = {
      id: `tech_${Date.now()}`,
      front: analysis?.card_front || `[Actu] ${item?.titleFr || item?.title || "Concept Tech"}`,
      back: analysis?.card_back || analysis?.summary || item?.descriptionFr || item?.description || "",
      example: item?.url || "",
      category,
      level: 0,
      repetitions: 0,
      interval: 1,
      stability: null,
      difficulty: null,
      easeFactor: 2.5,
      nextReview: localToday || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    if (onCreateCard) onCreateCard(card);
    else if (setExpressions) setExpressions(prev => [card, ...(prev || [])]);
    showToast?.("⚡ Fiche créée et ajoutée à FSRS !", "success");
    setSelected(null);
    setAnalysis(null);
  }, [analysis, selected, localToday, onCreateCard, setExpressions, showToast]);

  const deleteArticle = useCallback((item) => {
    if (!item?.id) return;
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    showToast?.("Article masqué", "info");
  }, [showToast]);

  const toggleSave = useCallback((item) => {
    if (!item?.id) return;
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        showToast?.("Retiré des favoris", "info");
      } else {
        next.add(item.id);
        showToast?.("Ajouté aux favoris 🔖", "success");
      }
      return next;
    });
  }, [showToast]);

  const speak = useCallback((item) => {
    try {
      if (speakingId) {
        window.speechSynthesis.cancel();
        setTtsProgress(null);
        if (speakingId === item.id) { setSpeakingId(null); return; }
      }
      // Phase 2.3 — TTS complet : lit tous les paragraphes
      const cached = summaryCache.current[item.id];
      const frenchFull = bodyFrMapRef.current?.[item.id] || "";
      const localFull = frenchFull || (item.lang === "fr" ? (fullArticleMapRef.current?.[item.id] || item.fullContent) : "");
      const offlineParas = localFull ? localFull.split(/\n{2,}/).map(p => p.trim()).filter(Boolean) : [];
      const parts = [
        visibleFrenchTitle(item),
        cached?.lede || '',
        ...(cached?.paragraphs || (offlineParas.length > 0 ? offlineParas : [])),
        cached?.why_it_matters ? `Pourquoi c'est important : ${cached.why_it_matters}` : '',
        (!cached && !offlineParas.length) ? visibleFrenchDescription(item) : '',
      ].filter(Boolean);
      
      setSpeakingId(item.id);
      setTtsProgress({ current: 0, total: parts.length });
      
      const speakNext = (idx) => {
        if (idx >= parts.length) { 
          setSpeakingId(null); 
          setTtsProgress(null); 
          if (podcastModeRef.current) {
            setTimeout(() => {
              const btn = document.getElementById('btn-passer-next');
              if (btn) btn.click();
            }, 1000);
          }
          return; 
        }
        setTtsProgress({ current: idx + 1, total: parts.length });
        const u = new SpeechSynthesisUtterance(parts[idx]);
        u.lang = "fr-FR";
        u.rate = 0.95;
        u.onend = () => speakNext(idx + 1);
        u.onerror = () => { setSpeakingId(null); setTtsProgress(null); };
        window.speechSynthesis.speak(u);
      };
      speakNext(0);
    } catch { setSpeakingId(null); setTtsProgress(null); }
  }, [speakingId]);

  // ─ Render ─
  const allCount = items.filter(i => !deletedIds.has(i.id) && (Date.now() - (i.ts || 0)) <= ageLimit).length;
  const frBase = items.filter(i => !deletedIds.has(i.id) && (Date.now() - (i.ts || 0)) <= ageLimit && (i.lang === "fr" || Boolean(i.titleFr)));
  const frCount = feedFilter === "popular" ? frBase.filter(i => (i.score || 0) >= 3 || trendScore(i) >= 7).length : frBase.length;
  const relevantCount = frCount || allCount;
  const freshCount = items.filter(i => isBreaking(i.ts)).length;
  const savedCount = items.filter(i => savedIds.has(i.id) && !deletedIds.has(i.id)).length;
  // 🏷️ Décompte dynamique en temps réel pour chaque pilule thématique
  const themeCounts = useMemo(() => {
    let base = items.filter(i => !deletedIds.has(i.id) && (Date.now() - (i.ts || 0)) <= ageLimit);
    if (tab === "fr") {
      base = base.filter(i => i.lang === "fr" || (Boolean(i.titleFr) && i.titleFr.trim() !== (i.title || "").trim()));
    }
    if (feedFilter === "popular" && tab !== "github") {
      base = base.filter(i => (i.score || 0) >= 3 || trendScore(i) >= 7);
    }
    const counts = { all: base.length };
    for (const t of THEME_FILTERS) {
      if (t.id !== "all" && t.rx) {
        counts[t.id] = base.filter(i => t.rx.test(`${i.title || ""} ${i.titleFr || ""} ${i.description || ""} ${i.descriptionFr || ""}`)).length;
      }
    }
    return counts;
  }, [items, deletedIds, tab, feedFilter, ageLimit]);
  const isSearching = query.trim().length > 0;
  // ✅ Phase 1.5 — Badge LIVE uniquement si données < 5 min
  const isLive = !loading && lastRefresh && (Date.now() - lastRefresh < 5 * 60 * 1000);
  // ✅ Phase 2.4 — Stats du tri/filtre courant
  const SORT_LABELS = { relevance: '⭐ Pertinence', recent: '🕐 Récent', popular: '🔥 Populaire' };
  const DATE_LABELS = { all: 'Tout', today: "Aujourd'hui", week: 'Cette semaine' };

  return (
    <div style={{ background: "var(--mm-bg)", minHeight: "100vh", color: "var(--mm-fg)" }}>
      {!isOnline && (
        <div role="status" style={{ position: "sticky", top: 0, zIndex: 50, padding: "8px 14px", fontSize: 12, fontWeight: 700, textAlign: "center", background: "rgba(16, 185, 129, 0.18)", color: isDarkMode ? "#6EE7B7" : "#065F46", borderBottom: "1px solid rgba(16, 185, 129, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span>📴 Mode Hors-Ligne</span>
          <span>·</span>
          <span>Dernières actualités générées prêtes pour lecture sans connexion</span>
        </div>
      )}
      <style>{`
        @keyframes tiv-pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes tiv-fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes tiv-dismiss{
          0%{opacity:1;transform:scale(1) translateY(0);max-height:800px;margin-bottom:10px}
          40%{opacity:0.25;transform:scale(0.96) translateX(16px)}
          100%{opacity:0;transform:scale(0.92) translateX(36px);max-height:0;margin-bottom:0;padding-top:0;padding-bottom:0;border-width:0;overflow:hidden}
        }
        .tiv-dismissing{
          animation:tiv-dismiss 0.28s cubic-bezier(0.16,1,0.3,1) forwards !important;
          pointer-events:none;
        }
        @keyframes tiv-spin{to{transform:rotate(360deg)}}
        @keyframes tiv-shimmer{0%{background-position:-600px 0}100%{background-position:600px 0}}
        @keyframes tiv-modal-in{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
        @keyframes tiv-snackbar-in{
          0%{opacity:0;transform:translate(-50%,20px) scale(0.95)}
          100%{opacity:1;transform:translate(-50%,0) scale(1)}
        }
        @keyframes tiv-countdown{
          0%{width:100%}
          100%{width:0%}
        }
        .tiv-undo-bar{
          position:fixed;
          bottom:24px;
          left:50%;
          transform:translateX(-50%);
          z-index:9999;
          display:flex;
          align-items:center;
          gap:12px;
          padding:10px 16px;
          border-radius:16px;
          backdrop-filter:blur(20px);
          -webkit-backdrop-filter:blur(20px);
          animation:tiv-snackbar-in 0.25s cubic-bezier(0.16,1,0.3,1) both;
          box-shadow:0 12px 36px rgba(0,0,0,0.35);
          max-width:calc(100vw - 32px);
        }
        @keyframes soundwave-bounce{0%{transform:scaleY(.3)}100%{transform:scaleY(1)}}
        @keyframes tiv-slide-r{from{transform:translateX(-8px);opacity:0}to{transform:none;opacity:1}}
        
        .soundwave{display:inline-flex;align-items:flex-end;gap:2px;width:14px;height:12px}
        .soundwave-bar{width:2px;height:100%;background:var(--mm-primary-glow,var(--mm-primary-glow));border-radius:1px;transform-origin:bottom;animation:soundwave-bounce .6s ease-in-out infinite alternate}
        .soundwave-bar:nth-child(1){animation-delay:.1s}.soundwave-bar:nth-child(2){animation-delay:.3s}.soundwave-bar:nth-child(3){animation-delay:.2s}.soundwave-bar:nth-child(4){animation-delay:.4s}
        
        .tiv-card{animation:tiv-fade .4s cubic-bezier(.16,1,.3,1) both}
        
        .tiv-article{
          background:var(--mm-bg-card,rgba(15,17,35,.6));
          border:1px solid var(--mm-border,color-mix(in srgb, var(--mm-primary) 20.0%, transparent));
          border-radius:16px;margin-bottom:10px;
          transition:all .25s cubic-bezier(.16,1,.3,1);
          overflow:hidden;
        }
        .tiv-article:hover{
          transform:translateY(-2px);
          border-color:var(--mm-border-strong,color-mix(in srgb, var(--mm-primary) 40.0%, transparent));
          box-shadow:0 8px 24px color-mix(in srgb, var(--mm-primary) 12.0%, transparent);
        }
        .tiv-article-expanded{border-color:var(--mm-border-glow,color-mix(in srgb, var(--mm-primary) 60.0%, transparent))!important}
        
        .tiv-tab{
          background:rgba(255,255,255,.04);border:1px solid var(--mm-border);
          color:var(--mm-fg-muted);border-radius:20px;padding:7px 14px;
          font-size:12px;font-weight:600;cursor:pointer;
          transition:all .2s cubic-bezier(.16,1,.3,1);white-space:nowrap;
          display:inline-flex;align-items:center;gap:5px;
        }
        .tiv-tab:hover{background:color-mix(in srgb, var(--mm-primary) 8.0%, transparent);color:var(--mm-fg);border-color:var(--mm-border-strong)}
        .tiv-tab-active{background:var(--mm-grad-primary,linear-gradient(135deg,var(--mm-primary),var(--mm-primary)))!important;color:#fff!important;border-color:transparent!important;box-shadow:0 4px 14px color-mix(in srgb, var(--mm-primary) 35.0%, transparent)}
        .tiv-tab-badge{background:rgba(239,68,68,.15);color:#f87171;font-size:9px;font-weight:900;padding:1px 5px;border-radius:8px;border:1px solid rgba(239,68,68,.2)}
        
        .tiv-btn-refresh{
          background:var(--mm-grad-primary,linear-gradient(135deg,var(--mm-primary),var(--mm-primary)));
          color:#fff;border:none;border-radius:20px;padding:7px 16px;
          cursor:pointer;font-size:12px;font-weight:700;
          box-shadow:0 4px 14px color-mix(in srgb, var(--mm-primary) 35.0%, transparent);
          display:flex;align-items:center;gap:4px;transition:all .2s;
        }
        .tiv-btn-refresh:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
        .tiv-btn-refresh:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px color-mix(in srgb, var(--mm-primary) 45.0%, transparent)}
        
        ::-webkit-scrollbar{width:0}
        @media(max-width:768px){
          .tiv-hero-panel{
            padding:16px 16px 14px!important;
            border-radius:20px!important;
            margin-bottom:14px!important;
          }
          .tiv-btn-header-back{
            padding:7px 13px!important;
            font-size:12px!important;
            border-radius:11px!important;
          }
          .tiv-header-icon{
            width:32px!important;
            height:32px!important;
            font-size:17px!important;
            border-radius:10px!important;
          }
          .tiv-header-title{
            font-size:19px!important;
          }
          .tiv-header-badge{
            font-size:11px!important;
            padding:2px 10px!important;
            margin-top:6px!important;
          }
          .tiv-btn-header-refresh-top{
            padding:7px 13px!important;
            font-size:12px!important;
            border-radius:11px!important;
          }
          .tiv-filter-bar{
            gap:10px!important;
            margin-bottom:10px!important;
          }
          .tiv-segmented-filter{
            padding:3px!important;
            border-radius:13px!important;
          }
          .tiv-segmented-btn{
            padding:6px 10px!important;
            font-size:12px!important;
            border-radius:10px!important;
          }
          .tiv-theme-filter-btn{
            padding:6px 13px!important;
            font-size:12px!important;
            border-radius:13px!important;
          }
          .tiv-category-drawer-btn{
            padding:10px 16px!important;
            border-radius:15px!important;
          }
          .tiv-category-drawer-icon{
            width:28px!important;
            height:28px!important;
            font-size:13px!important;
            border-radius:8px!important;
          }
          .tiv-category-drawer-label{
            font-size:14px!important;
          }
          .tiv-feed-list{
            gap:14px!important;
            padding-bottom:130px!important;
          }
          .tiv-card-hero{
            border-radius:20px!important;
            padding:20px 18px 16px!important;
          }
          .tiv-card-sub{
            border-radius:16px!important;
            padding:16px 16px 14px!important;
          }
          .tiv-badges-row{
            gap:8px!important;
            margin-bottom:12px!important;
          }
          .tiv-badge-une{
            padding:3px 10px!important;
            font-size:10.5px!important;
          }
          .tiv-badge-source{
            padding:2.5px 8px!important;
            font-size:9.5px!important;
          }
          .tiv-badge-lang{
            padding:2.5px 7px!important;
            font-size:9.5px!important;
          }
          .tiv-article-title.tiv-article-title-first{
            font-size:clamp(17.5px,4.5vw,20.5px)!important;
            line-height:1.38!important;
            margin-bottom:12px!important;
          }
          .tiv-article-title.tiv-article-title-regular{
            font-size:16px!important;
            line-height:1.4!important;
            margin-bottom:10px!important;
          }
          .tiv-article-summary-box{
            font-size:13.5px!important;
            line-height:1.66!important;
            margin-bottom:12px!important;
            padding-left:12px!important;
          }
          .tiv-continuer-btn{
            font-size:13px!important;
          }
          .tiv-card-actions-bar{
            gap:8px!important;
          }
          .tiv-card-action-btn{
            padding:7px 12px!important;
            font-size:12px!important;
            border-radius:10px!important;
          }
          .tiv-modal-inner{max-height:92vh!important;border-radius:20px 20px 0 0!important}
        }
      `}</style>

      {/* ── UNIFIED HERO HEADER & CONTROL PANEL ── */}
      <div className="tiv-hero-panel" style={{
        background: isDark
          ? "linear-gradient(165deg, rgba(24, 19, 58, 0.95) 0%, rgba(17, 14, 40, 0.98) 100%)"
          : "linear-gradient(135deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)",
        border: isDark
          ? "1px solid rgba(178, 150, 255, 0.28)"
          : "1.5px solid rgba(255, 255, 255, 0.45)",
        borderRadius: 16,
        padding: "10px 12px 10px",
        marginBottom: 10,
        boxShadow: isDark
          ? "0 10px 28px -4px rgba(7, 6, 15, 0.7), 0 2px 10px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(178, 150, 255, 0.2)"
          : "0 12px 28px rgba(30, 64, 175, 0.32), 0 0 20px rgba(56, 189, 248, 0.2), inset 0 1.5px 0 rgba(255, 255, 255, 0.5)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        color: "#FFFFFF",
      }}>
        {/* ── Ligne 1 : Navigation & Titre Centré (Zéro saut de ligne garanti) ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          width: "100%",
        }}>
          {/* Bouton Retour à gauche */}
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                title="Retour au tableau de bord"
                className="tiv-btn-header-back"
                style={{
                  background: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.2)",
                  border: isDark ? "1px solid rgba(178, 150, 255, 0.22)" : "1px solid rgba(255, 255, 255, 0.35)",
                  color: "#FFFFFF",
                  borderRadius: 10,
                  padding: "5px 10px",
                  fontSize: 11.5,
                  fontWeight: 750,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.12)",
                  transition: "all 0.18s ease",
                  height: 32,
                }}
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>←</span>
                <span>Retour</span>
              </button>
            )}
          </div>

          {/* Titre & Statut au centre */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 0,
            textAlign: "center",
            flex: 1,
            padding: "0 4px",
          }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%" }}>
              <span style={{ fontSize: 13, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))" }}>📡</span>
              <h1 className="tiv-hero-title tiv-header-title" style={{
                margin: 0,
                fontWeight: 850,
                fontSize: 14.5,
                color: "#FFFFFF",
                letterSpacing: "-0.2px",
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                Actus Tech
              </h1>
              {isLive && (
                <span style={{
                  background: "#EF4444",
                  color: "#FFF",
                  fontSize: 7.5,
                  fontWeight: 900,
                  padding: "1.5px 5px",
                  borderRadius: 6,
                  letterSpacing: 0.5,
                  animation: "tiv-pulse 2s infinite",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2.5,
                  boxShadow: "0 2px 5px rgba(239, 68, 68, 0.4)",
                  flexShrink: 0,
                }}>
                  <span style={{ width: 3.5, height: 3.5, borderRadius: "50%", background: "#fff" }} />
                  LIVE
                </span>
              )}
            </div>

            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4.5,
              fontSize: 9.5,
              color: isDark ? "#C4B5FD" : "rgba(255, 255, 255, 0.9)",
              fontWeight: 600,
              marginTop: 2,
              whiteSpace: "nowrap",
            }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: isDark ? "#A78BFA" : "#38BDF8", flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>
                {loading ? "Chargement des actualités…" : lastRefresh ? `${selectedTheme === "all" ? (frCount || items.length) : (themeCounts[selectedTheme] ?? filtered.length)} articles · ${timeAgo(lastRefresh, now)}` : "En direct"}
              </span>
            </div>
          </div>

          {/* Bouton Actualiser à droite */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexShrink: 0 }}>
            <button
              className="tiv-btn-header-refresh-top"
              onClick={async () => {
                if (tab === "scholarships" && scholarshipScanRef.current) {
                  setScholarshipScanning(true);
                  try {
                    await scholarshipScanRef.current();
                  } finally {
                    setScholarshipScanning(false);
                  }
                  return;
                }
                if (tab === "digest") {
                  showToast?.("Génération du briefing IA...", "info");
                  fetchDigest(items);
                  return;
                }
                showToast?.("Actualisation des actualités du jour...", "info");
                fetchAll(false);
              }}
              disabled={tab === "scholarships" ? scholarshipScanning : loading}
              title={tab === "scholarships"
                ? "Relancer le radar des bourses officielles"
                : tab === "digest"
                ? "Régénérer le briefing quotidien"
                : "Cliquer pour actualiser les actualités"}
              style={{
                background: isDark ? "rgba(139, 92, 246, 0.22)" : (tab === "scholarships" ? scholarshipScanning : loading) ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.2)",
                color: "#FFFFFF",
                border: isDark ? "1px solid rgba(178, 150, 255, 0.3)" : "1px solid rgba(255, 255, 255, 0.35)",
                borderRadius: 10,
                padding: "5px 10px",
                fontSize: 11.5,
                fontWeight: 750,
                cursor: (tab === "scholarships" ? scholarshipScanning : loading) ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                backdropFilter: "blur(8px)",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.12)",
                transition: "all 0.15s ease",
                opacity: (tab === "scholarships" ? scholarshipScanning : loading) ? 0.75 : 1,
                height: 32,
              }}
            >
              <span style={{
                fontSize: 12,
                lineHeight: 1,
                display: "inline-block",
                animation: (tab === "scholarships" ? scholarshipScanning : loading) ? "tiv-spin 0.8s linear infinite" : "none",
              }}>
                {(tab === "scholarships" ? scholarshipScanning : loading) ? "⏳" : (tab === "scholarships" ? "🛰️" : tab === "digest" ? "⚡" : "🔄")}
              </span>
              <span>
                {tab === "scholarships"
                  ? (scholarshipScanning ? "Radar..." : "Régénérer")
                  : tab === "digest"
                  ? (loading ? "Briefing..." : "Briefing")
                  : (loading ? "Chargement..." : "Actualiser")}
              </span>
            </button>
          </div>
        </div>

        {/* ── Ligne 2 : Double Sélecteur Harmonieux (Thème Tech + Onglets/Sections) ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
          width: "100%",
        }}>
          {/* 🏷️ Sélecteur de Thème (Thème actif, Liquid Glass) */}
          {tab !== "scholarships" && (() => {
            const activeThemeObj = THEME_FILTERS.find((t) => t.id === selectedTheme) || THEME_FILTERS[0];
            const activeCount = selectedTheme === "all" ? (frCount || items.length) : (themeCounts[activeThemeObj.id] ?? 0);
            return (
              <div
                ref={themeMenuRef}
                style={{
                  position: "relative",
                  flex: 1,
                  minWidth: 0,
                  zIndex: 65,
                }}
              >
                <button
                  type="button"
                  className="tiv-theme-filter-btn"
                  onClick={() => {
                    if (window.navigator?.vibrate) window.navigator.vibrate(6);
                    setIsThemeMenuOpen(!isThemeMenuOpen);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    borderRadius: 11,
                    fontSize: 11.5,
                    fontWeight: 750,
                    cursor: "pointer",
                    height: 36,
                    border: isDark ? "1px solid rgba(178, 150, 255, 0.28)" : "1.5px solid rgba(255, 255, 255, 0.6)",
                    background: isDark
                      ? `linear-gradient(135deg, color-mix(in srgb, ${activeThemeObj.color} 30%, #1c1642), #151136)`
                      : `linear-gradient(135deg, ${activeThemeObj.color}, color-mix(in srgb, ${activeThemeObj.color} 80%, black))`,
                    color: isDark ? "#F2EEFF" : "#FFFFFF",
                    boxShadow: isDark ? "0 2px 8px rgba(0, 0, 0, 0.25)" : "0 3px 10px rgba(0, 0, 0, 0.15)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{activeThemeObj.emoji}</span>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {activeThemeObj.label}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, marginLeft: 4 }}>
                    <span style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      padding: "1px 5.5px",
                      borderRadius: 6,
                      background: isDark ? "rgba(178, 150, 255, 0.22)" : "rgba(255, 255, 255, 0.25)",
                      color: isDark ? "#F2EEFF" : "#FFFFFF",
                    }}>
                      {activeCount}
                    </span>
                    <span style={{
                      fontSize: 8.5,
                      opacity: 0.8,
                      transform: isThemeMenuOpen ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s ease",
                    }}>
                      ▼
                    </span>
                  </div>
                </button>

                {isThemeMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      minWidth: 210,
                      maxWidth: "85vw",
                      background: isDark ? "rgba(23, 18, 51, 0.98)" : "rgba(255, 255, 255, 0.97)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      border: isDark ? "1px solid rgba(178, 150, 255, 0.28)" : "1.5px solid rgba(255, 255, 255, 0.8)",
                      borderRadius: 14,
                      padding: "5px",
                      boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.2)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      zIndex: 100,
                      animation: "tiv-fade 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    {THEME_FILTERS.map((t) => {
                      const isSelected = selectedTheme === t.id;
                      const count = t.id === "all" ? (frCount || items.length) : (themeCounts[t.id] ?? 0);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (window.navigator?.vibrate) window.navigator.vibrate(6);
                            setSelectedTheme(t.id);
                            setIsThemeMenuOpen(false);
                            try { safeStorage.set("tech_intel_selected_theme_v1", t.id); } catch {}
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "7px 11px",
                            borderRadius: 10,
                            fontSize: 12,
                            fontWeight: isSelected ? 800 : 600,
                            cursor: "pointer",
                            border: isSelected
                              ? `1px solid ${t.color}`
                              : "1px solid transparent",
                            background: isSelected
                              ? (isDark ? "rgba(139, 92, 246, 0.22)" : "rgba(0, 0, 0, 0.05)")
                              : "transparent",
                            color: isDark ? "#FFFFFF" : "#0F172A",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 13 }}>{t.emoji}</span>
                            <span>{t.label}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 900,
                              padding: "1px 5px",
                              borderRadius: 6,
                              background: isDark ? "rgba(178, 150, 255, 0.15)" : "rgba(0, 0, 0, 0.06)",
                              color: isDark ? "#B6AADA" : "#475569",
                            }}>
                              {count}
                            </span>
                            {isSelected && <span style={{ color: t.color || "#8B5CF6", fontSize: 12, fontWeight: 900 }}>✓</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ⚡ Sélecteur de Section / Onglet (Actus, Favoris, Briefing, Bourses) */}
          <div
            ref={tabsMenuRef}
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              zIndex: 60,
            }}
          >
            <button
              type="button"
              className="tiv-category-drawer-btn"
              onClick={() => {
                if (window.navigator?.vibrate) window.navigator.vibrate(8);
                setIsTabsOpen(!isTabsOpen);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                borderRadius: 11,
                fontSize: 11.5,
                fontWeight: 750,
                cursor: "pointer",
                height: 36,
                background: isDark ? "rgba(255, 255, 255, 0.09)" : "#FFFFFF",
                border: isDark ? "1px solid rgba(178, 150, 255, 0.25)" : "1.5px solid rgba(255, 255, 255, 0.7)",
                color: isDark ? "#F2EEFF" : "#0F172A",
                boxShadow: isDark
                  ? "0 2px 8px rgba(7, 6, 15, 0.3), inset 0 1px 0 rgba(178, 150, 255, 0.12)"
                  : "0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 #FFFFFF",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>
                  {tab === "scholarships" ? "🎓" : tab === "saved" ? "🔖" : tab === "digest" ? "⚡" : "📰"}
                </span>

                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {tab === "scholarships" ? "Bourses" : tab === "saved" ? "Favoris" : tab === "digest" ? "Briefing IA" : "Actus Tech"}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, marginLeft: 4 }}>
                {tab === "scholarships" && (
                  <span style={{ background: "#10B981", color: "#FFFFFF", fontSize: "8.5px", fontWeight: "900", padding: "1px 4.5px", borderRadius: "5px" }}>
                    PRO
                  </span>
                )}

                {tab === "fr" && frCount > 0 && (
                  <span style={{ background: isDark ? "rgba(139, 92, 246, 0.25)" : "color-mix(in srgb, var(--mm-primary) 20%, transparent)", color: isDark ? "#C084FC" : "var(--mm-primary)", fontSize: "9.5px", fontWeight: "900", padding: "1px 5px", borderRadius: "6px" }}>
                    {frCount > 99 ? "99+" : frCount}
                  </span>
                )}

                {tab === "saved" && savedCount > 0 && (
                  <span style={{ background: "rgba(245, 158, 11, 0.25)", color: "#D97706", fontSize: "9.5px", fontWeight: "900", padding: "1px 5px", borderRadius: "6px" }}>
                    {savedCount}
                  </span>
                )}

                {tab === "digest" && (
                  <span style={{ background: "linear-gradient(135deg, #EC4899, #8B5CF6)", color: "#FFFFFF", fontSize: "8.5px", fontWeight: "900", padding: "1px 4.5px", borderRadius: "5px" }}>
                    IA
                  </span>
                )}

                <span style={{
                  fontSize: 8.5,
                  opacity: 0.8,
                  color: isDark ? "#A78BFA" : "var(--mm-primary)",
                  transform: isTabsOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s ease",
                }}>
                  ▼
                </span>
              </div>
            </button>

            {/* Popover contenant les catégories / onglets */}
            {isTabsOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: 220,
                  maxWidth: "90vw",
                  zIndex: 100,
                  background: isDark ? "rgba(23, 18, 51, 0.98)" : "rgba(255, 255, 255, 0.98)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: isDark ? "1px solid rgba(178, 150, 255, 0.28)" : "1px solid color-mix(in srgb, var(--mm-primary) 20%, transparent)",
                  borderRadius: 14,
                  padding: "8px",
                  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.45)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  animation: "tiv-fade 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {TABS.map((t) => {
                  const isActive = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTab(t.id);
                        setIsTabsOpen(false);
                      }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: isActive ? "1px solid var(--mm-primary)" : "1px solid transparent",
                        background: isActive
                          ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))"
                          : isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
                        color: isActive ? "#FFFFFF" : isDark ? "#E2E8F0" : "#0F172A",
                        fontSize: "12px",
                        fontWeight: isActive ? "800" : "600",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "6px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span>{t.id === "scholarships" ? "🎓" : t.id === "saved" ? "🔖" : t.id === "digest" ? "⚡" : "📰"}</span>
                        <span>{t.label.replace(/^.*? /, "")}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {t.id === "scholarships" && <span style={{ fontSize: "9px", background: "#10B981", color: "#FFF", padding: "1px 5px", borderRadius: "4px" }}>OFFICIEL</span>}
                        {t.id === "fr" && frCount > 0 && <span style={{ fontSize: "10px", opacity: 0.8 }}>{frCount}</span>}
                        {t.id === "saved" && savedCount > 0 && <span style={{ fontSize: "10px", opacity: 0.8 }}>{savedCount}</span>}
                        {t.id === "digest" && <span style={{ fontSize: "9px", background: "linear-gradient(135deg, #EC4899, #8B5CF6)", color: "#FFF", padding: "1px 5px", borderRadius: "4px" }}>IA</span>}
                        {isActive && <span style={{ color: "#FFF", fontSize: "11px", fontWeight: "900" }}>✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Loading Progress Bar */}
        {loading && (
          <div style={{ height: 2.5, background: "rgba(255, 255, 255, 0.15)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: isDark ? "#A78BFA" : "#38BDF8", transition: "width .3s", borderRadius: 3 }} />
          </div>
        )}
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding: "0 4px 90px" }}>

        {/* ── SCHOLARSHIPS TAB ── */}
        {tab === "scholarships" && !isSearching && (
          <ScholarshipHubView
            onRegisterRefresh={(fn) => { scholarshipScanRef.current = fn; }}
            callClaude={callClaude}
            isDarkMode={isDarkMode}
            onCreateCard={onCreateCard}
            showToast={showToast}
          />
        )}

        {/* ── DIGEST IA — GAZETTE TECH FUTURISTE LIQUID GLASS ── */}
        {tab === "digest" && !isSearching && (
          <div style={{
            background: isDarkMode 
              ? "linear-gradient(135deg, rgba(20, 24, 48, 0.75) 0%, rgba(11, 13, 26, 0.9) 100%)" 
              : "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.92) 100%)",
            border: isDarkMode ? "1px solid rgba(96, 165, 250, 0.25)" : "1px solid color-mix(in srgb, var(--mm-primary) 20%, transparent)",
            borderRadius: 24,
            padding: "26px 22px",
            boxShadow: isDarkMode 
              ? "0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)" 
              : "0 16px 40px color-mix(in srgb, var(--mm-primary) 10%, transparent), inset 0 1px 0 #FFFFFF",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}>
            {!digest && (
              <div style={{ textAlign: "center", padding: "50px 16px" }}>
                <div style={{ position: "relative", width: 52, height: 52, margin: "0 auto 18px" }}>
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid color-mix(in srgb, var(--mm-primary) 20%, transparent)", borderTopColor: "var(--mm-primary)", animation: "tiv-spin .8s linear infinite" }} />
                  <div style={{ position: "absolute", inset: 8, borderRadius: "50%", border: "2px solid color-mix(in srgb, var(--mm-primary) 20%, transparent)", borderBottomColor: "var(--mm-primary-glow)", animation: "tiv-spin 1.2s linear infinite reverse" }} />
                </div>
                <p style={{ color: "var(--mm-fg)", fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>Rédaction du briefing par l'IA…</p>
                <p style={{ color: "var(--mm-fg-muted)", fontSize: 12.5, margin: 0 }}>Synthèse et analyse critique des flux en temps réel</p>
              </div>
            )}

            {digest && (
              <>
                {/* En-tête de la Gazette */}
                <div style={{ borderBottom: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.07)", paddingBottom: 20, marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "color-mix(in srgb, var(--mm-primary) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--mm-primary) 30%, transparent)", padding: "3px 10px", borderRadius: 8 }}>
                      <span style={{ fontSize: 13 }}>📰</span>
                      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--mm-primary-glow)" }}>BRIEFING QUOTIDIEN IA</span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--mm-fg-muted)", fontWeight: 600 }}>
                      {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    </span>
                  </div>

                  <h2 style={{
                    margin: 0,
                    color: "var(--mm-fg)",
                    fontSize: 22,
                    fontFamily: "var(--mm-font-display)",
                    fontWeight: 900,
                    lineHeight: 1.35,
                    letterSpacing: "-0.4px",
                    textWrap: "balance",
                  }}>
                    {digest.headline}
                  </h2>
                </div>

                {/* Liste des brèves & analyses */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {digest.items?.map((it, i) => {
                    const importanceColor = it.importance >= 4 ? "#EF4444" : it.importance >= 3 ? "#F59E0B" : "var(--mm-primary)";
                    const importanceLabel = it.importance >= 4 ? "Critique" : it.importance >= 3 ? "Majeur" : "Notable";

                    return (
                      <div
                        key={i}
                        style={{
                          padding: "16px 18px",
                          borderRadius: 16,
                          background: isDarkMode ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.6)",
                          border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.07)" : "1px solid rgba(0, 0, 0, 0.06)",
                          boxShadow: isDarkMode ? "0 4px 16px rgba(0, 0, 0, 0.2)" : "0 2px 10px rgba(0, 0, 0, 0.02)",
                          transition: "transform 0.2s ease, border-color 0.2s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 18 }}>{it.emoji || "💡"}</span>
                          <span style={{
                            fontSize: 10.5,
                            fontWeight: 900,
                            textTransform: "uppercase",
                            letterSpacing: 0.8,
                            background: "color-mix(in srgb, var(--mm-primary) 12%, transparent)",
                            color: "var(--mm-primary-glow)",
                            padding: "2px 8px",
                            borderRadius: 6,
                            border: "1px solid color-mix(in srgb, var(--mm-primary) 25%, transparent)",
                          }}>
                            {it.category}
                          </span>

                          {/* Badge d'Impact HSL */}
                          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: importanceColor, boxShadow: `0 0 8px ${importanceColor}` }} />
                            <span style={{ fontSize: 10, fontWeight: 800, color: importanceColor, letterSpacing: 0.3 }}>
                              {importanceLabel}
                            </span>
                          </div>
                        </div>

                        <div style={{ fontWeight: 800, color: "var(--mm-fg)", fontSize: 15.5, marginBottom: 6, fontFamily: "var(--mm-font-display)", lineHeight: 1.35 }}>
                          {it.title}
                        </div>
                        <div style={{ fontSize: 13.5, color: "var(--mm-fg-muted)", lineHeight: 1.62 }}>
                          {it.summary}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 🛠️ Outil Émergent du Jour */}
                {digest.trending_tool && (
                  <div style={{
                    marginTop: 22,
                    padding: "20px 22px",
                    background: isDarkMode
                      ? "linear-gradient(135deg, rgba(30, 27, 75, 0.5) 0%, rgba(16, 185, 129, 0.08) 100%)"
                      : "linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)",
                    borderRadius: 20,
                    border: isDarkMode ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid #A7F3D0",
                    boxShadow: isDarkMode ? "0 10px 30px rgba(0, 0, 0, 0.3)" : "0 8px 24px rgba(16, 185, 129, 0.08)",
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: "#10B981",
                      marginBottom: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5
                    }}>
                      🛠️ OUTIL ÉMERGENT DU JOUR
                    </div>
                    <div>
                      <a
                        href={digest.trending_tool.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "var(--mm-fg)",
                          fontWeight: 900,
                          textDecoration: "none",
                          fontSize: 18,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontFamily: "var(--mm-font-display)"
                        }}
                      >
                        <span>{digest.trending_tool.name}</span>
                        <span style={{ fontSize: 13, color: "#10B981" }}>↗</span>
                      </a>
                    </div>
                    <div style={{ fontSize: 13.5, color: "var(--mm-fg-muted)", marginTop: 6, lineHeight: 1.55 }}>
                      {digest.trending_tool.description}
                    </div>
                  </div>
                )}

                {/* 📊 Statistique Clé */}
                {digest.stat && (
                  <div style={{
                    marginTop: 16,
                    padding: "14px 18px",
                    background: isDarkMode ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)",
                    border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.07)" : "1px solid rgba(0, 0, 0, 0.06)",
                    borderRadius: 14,
                    fontSize: 12.5,
                    color: "var(--mm-fg-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    <span style={{ fontSize: 16 }}>📊</span>
                    <span style={{ fontWeight: 600 }}>{digest.stat}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── SKELETONS ── */}
        {tab !== "digest" && loading && items.length === 0 && (
          <>
            {/* Hero skeleton */}
            <div style={{
              height: 180, borderRadius: 20, marginBottom: 16,
              background: isDarkMode
                ? "linear-gradient(90deg,#181028 25%,#26153d 50%,#181028 75%)"
                : "linear-gradient(90deg,color-mix(in srgb, var(--mm-primary) 4%, white) 25%,color-mix(in srgb, var(--mm-primary) 10%, white) 50%,color-mix(in srgb, var(--mm-primary) 4%, white) 75%)",
              backgroundSize: "800px 100%", animation: "tiv-shimmer 1.4s linear infinite",
              border: "1px solid var(--mm-border)",
            }} />
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                height: 90, borderRadius: 16, marginBottom: 10,
                background: isDarkMode
                  ? "linear-gradient(90deg,#181028 25%,#26153d 50%,#181028 75%)"
                  : "linear-gradient(90deg,color-mix(in srgb, var(--mm-primary) 4%, white) 25%,color-mix(in srgb, var(--mm-primary) 10%, white) 50%,color-mix(in srgb, var(--mm-primary) 4%, white) 75%)",
                backgroundSize: "800px 100%", animation: "tiv-shimmer 1.4s linear infinite",
                border: "1px solid var(--mm-border)",
                animationDelay: `${i * 0.1}s`,
              }} />
            ))}
          </>
        )}

        {/* ── FLUX D'ARTICLES MAGAZINE LIQUID GLASS ── */}
        {((tab !== "digest" && tab !== "github" && tab !== "scholarships") || isSearching) && listItems.length > 0 && (
          <div className="tiv-feed-list" style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 110 }}>
            {listItems.slice(0, visibleCount).map((item, index) => {
              const isSaved = savedIds.has(item.id);
              const isFirst = index === 0 && !isSearching && tab !== "saved";
              const isExpanded = expandedIds.has(item.id);
              // Jamais de corps anglais affiché : pour une actu étrangère, on montre le
              // chapô français tant que l'article complet traduit n'est pas prêt.
              const frenchFull = bodyFrMap[item.id] || "";
              const fullSource = fullArticleMap[item.id] || (item.fullContent && item.fullContent.length > 400 ? item.fullContent : "");
              const isAlreadyComplete = !isTeaserSnippet(frenchFull, item) || (item.lang === "fr" && !isTeaserSnippet(fullSource, item));
              const fullStatus = isAlreadyComplete ? "ready" : (articleStatus[item.id] || "idle");

              const completeText = (!isTeaserSnippet(frenchFull, item) ? frenchFull : "") ||
                (item.lang === "fr" && !isTeaserSnippet(fullSource, item) ? fullSource : "");
              const rawArticleText = completeText || frenchFull || fullSource || item.descriptionFr || item.description || "";
              const articleText = cleanEditorialText(rawArticleText);
              const universalParas = extractUniversalArticleParagraphs(rawArticleText, item);
              const paragraphs = universalParas.length > 0 ? universalParas : (articleText ? [articleText] : []);
              const hasSummary = Boolean(cleanEditorialText(visibleFrenchDescription(item)) || paragraphs[0] || articleText);
              const isLongText = hasSummary && ((paragraphs.length > 1) || articleText.length > 280);
              // Tout article disposant d'une URL peut être déplié pour révéler le corps complet
              const canExpand = Boolean(item.url || hasSummary || isLongText);

              const isDismissing = dismissingIds.has(item.id);

              return (
                <article
                  key={item.id}
                  className={`tiv-article tiv-card ${isFirst ? "tiv-card-hero" : "tiv-card-sub"} ${isDismissing ? "tiv-dismissing" : ""}`}
                  style={{
                    position: "relative",
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: isFirst ? 14 : 11,
                    padding: isFirst ? "13px 15px 11px" : "11px 13px 9px",
                    cursor: "default",
                    transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                    WebkitTapHighlightColor: "transparent",
                    background: isFirst
                      ? (isDark 
                          ? "linear-gradient(165deg, #18133a 0%, #110e28 100%)" 
                          : "linear-gradient(135deg, #FFFFFF 0%, rgba(248, 250, 252, 0.98) 100%)")
                      : (isDark
                          ? "rgba(23, 18, 51, 0.85)"
                          : "rgba(255, 255, 255, 0.85)"),
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: isFirst
                      ? (isDark ? "1.5px solid rgba(139, 92, 246, 0.35)" : "1.5px solid rgba(59, 130, 246, 0.35)")
                      : (isDark ? "1px solid rgba(178, 150, 255, 0.18)" : "1px solid rgba(0, 0, 0, 0.07)"),
                    boxShadow: isFirst
                      ? (isDark 
                          ? "0 6px 24px -4px rgba(7, 6, 15, 0.7), 0 2px 10px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(178, 150, 255, 0.2)" 
                          : "0 12px 30px -8px rgba(37, 99, 235, 0.1), inset 0 1px 0 #FFFFFF")
                      : (isDark
                          ? "0 3px 14px rgba(7, 6, 15, 0.5), inset 0 1px 0 rgba(178, 150, 255, 0.08)"
                          : "0 2px 8px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.8)"),
                  }}
                >
                  <div className="tiv-badges-row" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: isFirst ? 8 : 6, flexWrap: "wrap" }}>
                    {isFirst && (
                      <span className="tiv-badge-une" style={{
                        background: "linear-gradient(135deg, #FF5722 0%, #EA580C 50%, #DC2626 100%)",
                        border: "none",
                        color: "#FFFFFF",
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 9.5,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        boxShadow: "0 2px 8px rgba(234, 88, 12, 0.35)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3.5,
                        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                      }}>
                        <span>🔥</span>
                        <span>À LA UNE</span>
                      </span>
                    )}
                    <SourceBadge source={item.source} />
                    <LangBadge lang={item.lang} />
                    {(item.isWorld || /présidentielle|élection|guerre|conflit|diplomatie|traité|sommet|onu|otan|brics|banque centrale|inflation|climat|cop|prix nobel|santé mondiale/i.test(`${item.title} ${item.description || ""}`)) && (
                      <WorldBadge isDark={isDark} />
                    )}
                    {(() => {
                      const t = getArticleTheme(item);
                      if (!t || t.id === "all") return null;
                      return (
                        <span style={{
                          background: isDark ? t.bg : colorMix(t.color, 12),
                          color: t.color,
                          border: `1px solid ${isDark ? t.border : colorMix(t.color, 28)}`,
                          borderRadius: 6,
                          padding: "1.5px 6px",
                          fontSize: 9.5,
                          fontWeight: 800,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          letterSpacing: 0.25,
                        }}>
                          <span>{t.emoji}</span>
                          <span>{t.shortLabel || t.label}</span>
                        </span>
                      );
                    })()}
                    {isLongText && isExpanded && (
                      <button
                        type="button"
                        onClick={(e) => handleToggleExpand(item, e)}
                        title="Replier l'article"
                        className="tiv-btn-collapse tiv-btn-collapse-top"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="18 15 12 9 6 15" />
                        </svg>
                        <span>Fermer</span>
                      </button>
                    )}
                    {isBreaking(item.ts) && <BreakingBadge />}
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--mm-fg-muted)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <span style={{ opacity: 0.7 }}>🕒</span>
                      <span>{timeAgo(item.ts, now)}</span>
                    </span>
                  </div>

                  <h3
                    className={`tiv-article-title ${isFirst ? "tiv-article-title-first" : "tiv-article-title-regular"}`}
                    onClick={(e) => handleToggleExpand(item, e)}
                    style={{
                      margin: "0 0 6px",
                      cursor: "pointer",
                    }}
                    title="Cliquer pour afficher ou replier l'article complet"
                  >
                    {visibleFrenchTitle(item)}
                  </h3>

                  <div
                    className="tiv-article-summary-box"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: 12.2,
                      color: "var(--mm-fg-muted)",
                      lineHeight: 1.54,
                      marginBottom: 6,
                      borderLeft: isFirst
                        ? (isDark ? "2.5px solid #8B5CF6" : "2.5px solid #2563EB")
                        : (isDark ? "2px solid rgba(139, 92, 246, 0.45)" : "2px solid #3B82F6"),
                      paddingLeft: 9,
                    }}
                  >
                    {isExpanded ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {paragraphs.map((p, idx) => {
                          const isHeading = p.length < 80 && (p.endsWith(":") || !p.endsWith("."));
                          if (isHeading && idx > 0) {
                            return (
                              <h4 key={idx} style={{ margin: "14px 0 4px", fontSize: 14.5, fontWeight: 700, color: "var(--mm-fg)" }}>
                                {p}
                              </h4>
                            );
                          }
                          return (
                            <p key={idx} className="tiv-article-summary" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: "var(--mm-fg)" }}>
                              {p}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      (() => {
                        const cardSummary = (paragraphs.length > 0 && paragraphs[0])
                          ? paragraphs[0]
                          : (cleanEditorialText(visibleFrenchDescription(item)) || articleText);
                        if (!cardSummary) {
                          return (
                            <div style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)",
                              border: isDark ? "1px dashed rgba(255, 255, 255, 0.12)" : "1px dashed rgba(0, 0, 0, 0.1)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: 10,
                              margin: "6px 0 10px",
                            }}>
                              <span style={{ fontSize: 12, color: "var(--mm-fg-muted)" }}>
                                Fil d'actualité direct
                              </span>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleExpand(item, e)}
                                  style={{
                                    background: isDark ? "rgba(99, 102, 241, 0.2)" : "#EEF2FF",
                                    border: isDark ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid #C7D2FE",
                                    color: isDark ? "#A5B4FC" : "#4338CA",
                                    borderRadius: 7,
                                    padding: "4px 10px",
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  📖 Extraire l'article ▼
                                </button>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    background: isDark ? "rgba(255, 255, 255, 0.06)" : "#F1F5F9",
                                    border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #CBD5E1",
                                    color: isDark ? "#E2E8F0" : "#475569",
                                    borderRadius: 7,
                                    padding: "4px 10px",
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    textDecoration: "none",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  ↗ Source
                                </a>
                              </div>
                            </div>
                          );
                        }
                        const rawText = (cardSummary || "")
                          .replace(/\*\*([^*]+)\*\*/g, "$1")
                          .replace(/__([^_]+)__/g, "$1")
                          .replace(/<[^>]+>/g, "")
                          .trim();
                        const baseText = rawText.replace(/[\s.…]+$/, "");

                        return (
                          <p
                            className="tiv-article-summary"
                            onClick={(e) => {
                              if (canExpand && !isExpanded) handleToggleExpand(item, e);
                            }}
                            title={canExpand && !isExpanded ? "Cliquer pour lire l'article complet" : undefined}
                            style={{
                              margin: 0,
                              color: isDark ? "#B6AADA" : "#475569",
                              whiteSpace: "pre-line",
                              lineHeight: 1.54,
                              fontSize: 12.2,
                              fontWeight: 400,
                              fontStyle: "normal",
                              hyphens: "none",
                              WebkitHyphens: "none",
                              wordBreak: "normal",
                              cursor: canExpand && !isExpanded ? "pointer" : "default",
                              fontFamily: "var(--mm-font-body), system-ui, -apple-system, sans-serif",
                            }}
                          >
                            <span>{baseText}… </span>
                            {canExpand && (
                              <span
                                role="button"
                                tabIndex={0}
                                className="tiv-continuer-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleExpand(item, e);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    handleToggleExpand(item, e);
                                  }
                                }}
                                title="Afficher l'article complet"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 2.5,
                                  color: isDark ? "#A78BFA" : "#2563EB",
                                  fontWeight: 650,
                                  fontSize: 11.5,
                                  cursor: "pointer",
                                  textDecoration: "none",
                                  marginLeft: 4,
                                  whiteSpace: "nowrap",
                                  transition: "opacity 0.15s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                              >
                                <span>Continuer</span>
                                <span style={{ fontSize: 11.5, marginLeft: 2 }}>→</span>
                              </span>
                            )}
                          </p>
                        );
                      })()
                    )}

                    {isExpanded && (
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 10, paddingTop: 8, borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.06)" }}>
                        <button
                          type="button"
                          onClick={(e) => handleToggleExpand(item, e)}
                          title="Replier l'article"
                          className="tiv-btn-collapse tiv-btn-collapse-bottom"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                          <span>Réduire</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="tiv-card-actions-bar" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>

                      <button
                        type="button"
                        className="tiv-card-action-btn"
                        onClick={(e) => handleDismissArticle(item, e)}
                        title="Passer cet article pour afficher le suivant sans scroller"
                        style={{
                          background: isDark ? "rgba(139, 92, 246, 0.12)" : "rgba(0, 0, 0, 0.04)",
                          border: `1px solid ${isDark ? "rgba(178, 150, 255, 0.22)" : "rgba(0, 0, 0, 0.08)"}`,
                          color: isDark ? "#B6AADA" : "#334155",
                          borderRadius: 8,
                          padding: "4px 9px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4.5,
                          fontSize: 11,
                          fontWeight: 700,
                          transition: "all 0.18s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.2)" : "#FEE2E2";
                          e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.4)";
                          e.currentTarget.style.color = "#EF4444";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isDark ? "rgba(139, 92, 246, 0.12)" : "rgba(0, 0, 0, 0.04)";
                          e.currentTarget.style.borderColor = isDark ? "rgba(178, 150, 255, 0.22)" : "rgba(0, 0, 0, 0.08)";
                          e.currentTarget.style.color = isDark ? "#B6AADA" : "#334155";
                        }}
                      >
                        <span>⏭️</span>
                        <span>Passer</span>
                      </button>

                      {needsFrenchTranslation(item) && (
                        <button
                          type="button"
                          className="tiv-card-action-btn"
                          onClick={(e) => { e.stopPropagation(); translateSingle(item); }}
                          disabled={translating}
                          title="Traduire cet article en français"
                          style={{
                            background: "rgba(59, 130, 246, 0.15)",
                            border: "1px solid rgba(59, 130, 246, 0.35)",
                            color: "#3B82F6",
                            borderRadius: 8,
                            padding: "4px 9px",
                            cursor: translating ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          <span>✨ Traduire</span>
                        </button>
                      )}


                      <button
                        type="button"
                        className="tiv-card-action-btn"
                        onClick={(e) => { e.stopPropagation(); window.open(item.url, '_blank'); }}
                        title="Consulter le site officiel"
                        style={{
                          background: isDark ? "rgba(139, 92, 246, 0.12)" : "rgba(0, 0, 0, 0.04)",
                          border: `1px solid ${isDark ? "rgba(178, 150, 255, 0.22)" : "rgba(0, 0, 0, 0.08)"}`,
                          color: isDark ? "#B6AADA" : "var(--mm-fg-muted)",
                          borderRadius: 8,
                          padding: "4px 9px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 650,
                          transition: "all 0.18s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDark ? "rgba(139, 92, 246, 0.25)" : "rgba(0, 0, 0, 0.08)";
                          e.currentTarget.style.borderColor = isDark ? "rgba(178, 150, 255, 0.4)" : "rgba(0, 0, 0, 0.15)";
                          e.currentTarget.style.color = isDark ? "#FFFFFF" : "#0F172A";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isDark ? "rgba(139, 92, 246, 0.12)" : "rgba(0, 0, 0, 0.04)";
                          e.currentTarget.style.borderColor = isDark ? "rgba(178, 150, 255, 0.22)" : "rgba(0, 0, 0, 0.08)";
                          e.currentTarget.style.color = isDark ? "#B6AADA" : "var(--mm-fg-muted)";
                        }}
                      >
                        <span>Source</span>
                        <span style={{ fontSize: 10 }}>↗</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {(tab !== "digest" || isSearching) && !loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{isSearching ? "🔍" : tab === "saved" ? "🔖" : "📭"}</div>
            <div style={{ color: "var(--mm-fg-muted)", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              {isSearching
                ? `Aucun résultat pour « ${query.trim()} »`
                : selectedTheme !== "all"
                ? `Aucun article pour le thème ${THEME_FILTERS.find(t => t.id === selectedTheme)?.label || selectedTheme}`
                : tab === "saved"
                ? "Aucun favori pour l'instant"
                : "Aucun article disponible"}
            </div>
            <div style={{ color: "var(--mm-fg-faint)", fontSize: 12, marginBottom: (isSearching || selectedTheme !== "all") ? 16 : 0 }}>
              {isSearching
                ? "Essaie un autre terme ou élargis ta recherche."
                : selectedTheme !== "all"
                ? "Réinitialise le filtre ou sélectionne un autre domaine pour afficher les articles."
                : tab === "saved"
                ? "Touche 🏷️ sur un article pour le retrouver ici."
                : "Actualise pour charger les derniers articles."}
            </div>
            {isSearching && (
              <button onClick={() => setQuery("")} className="tiv-btn-refresh" style={{ margin: "0 auto" }}>
                ✕ Effacer la recherche
              </button>
            )}
            {selectedTheme !== "all" && !isSearching && (
              <button
                type="button"
                onClick={() => { setSelectedTheme("all"); try { safeStorage.set("tech_intel_selected_theme_v1", "all"); } catch {} }}
                className="tiv-btn-refresh"
                style={{ margin: "0 auto" }}
              >
                ⚡ Voir toutes les actus tech
              </button>
            )}
          </div>
        )}

        {/* Error summary */}
        {errors.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setShowErrors(p => !p)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--mm-fg-faint)", fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              ⚠️ {errors.length} source{errors.length > 1 ? "s" : ""} indisponible{errors.length > 1 ? "s" : ""}
              {showErrors ? " ▲" : " ▼"}
            </button>
            {showErrors && (
              <div style={{ marginTop: 6, padding: "10px 14px", background: "rgba(239,68,68,.06)", borderRadius: 10, border: "1px solid rgba(239,68,68,.15)", fontSize: 11, color: "#f87171", lineHeight: 1.7 }}>
                {errors.join(", ")}
              </div>
            )}
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 20 }} />
      </div>

      {/* ── MODAL ── */}
      {selected && (
        <div
          onClick={() => { setSelected(null); setAnalysis(null); setReadSummary(null); setReading(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(4,6,15,.8)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
        >
          <div onClick={e => e.stopPropagation()} className="tiv-modal-inner" style={{
            background: "var(--mm-bg-elev, #0b0d1e)",
            borderRadius: "24px 24px 0 0",
            padding: 0, maxWidth: 640, width: "100%", maxHeight: "90vh", overflow: "auto",
            animation: "tiv-modal-in .3s cubic-bezier(.16,1,.3,1)",
            border: "1px solid var(--mm-border-strong)", borderBottom: "none",
            boxShadow: "0 -8px 40px rgba(0,0,0,.5)",
          }}>
            {/* Handle */}
            <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ width: 40, height: 4, background: "var(--mm-border)", borderRadius: 2, margin: "0 auto" }} />
            </div>
            <button
              onClick={() => { setSelected(null); setAnalysis(null); setReadSummary(null); setReading(false); }}
              style={{ position: "absolute", top: 12, right: 16, background: "rgba(255,255,255,.06)", border: "1px solid var(--mm-border)", color: "var(--mm-fg-muted)", cursor: "pointer", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
            >✕</button>

            <div style={{ padding: "14px 20px 32px" }}>
              {/* Meta */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <SourceBadge source={selected.source} size="lg" />
                <LangBadge lang={selected.lang} />
                {isBreaking(selected.ts) && <BreakingBadge />}
                <span style={{ fontSize: 11, color: "var(--mm-fg-faint)" }}>{timeAgo(selected.ts, now)}</span>
                <a href={selected.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  style={{ marginLeft: "auto", fontSize: 11, color: "var(--mm-primary-glow)", textDecoration: "none", fontWeight: 700, background: "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)", padding: "4px 10px", borderRadius: 8, border: "1px solid var(--mm-border-strong)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  🔗 Source
                </a>
              </div>

              {/* Title */}
              <h2 style={{ margin: "0 0 18px", fontSize: 20, fontWeight: 900, lineHeight: 1.35, color: "var(--mm-fg)", fontFamily: "var(--mm-font-display)", letterSpacing: "-0.3px" }}>
                {visibleFrenchTitle(selected)}
              </h2>

              {/* Reading state */}
              {reading && (
                <div style={{ padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                  <div style={{ position: "relative", width: 44, height: 44 }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid var(--mm-border)", borderTopColor: "var(--mm-primary)", animation: "tiv-spin .7s linear infinite" }} />
                    <div style={{ position: "absolute", inset: 7, borderRadius: "50%", border: "2px solid var(--mm-border)", borderBottomColor: "var(--mm-primary-glow)", animation: "tiv-spin 1.1s linear infinite reverse" }} />
                  </div>
                  <span style={{ fontSize: 13, color: "var(--mm-fg-muted)", fontWeight: 600 }}>Analyse de l'article…</span>
                </div>
              )}

              {/* Summary */}
              {!reading && readSummary && (
                <div style={{ marginBottom: 16 }}>
                  {readSummary.headline && (
                    <div style={{ background: "linear-gradient(135deg,color-mix(in srgb, var(--mm-primary) 10.0%, transparent),transparent)", border: "1px solid var(--mm-border-strong)", borderLeft: "3px solid var(--mm-primary)", borderRadius: "0 12px 12px 0", padding: "12px 16px", marginBottom: 16, fontSize: 15, fontWeight: 700, color: "var(--mm-fg)", lineHeight: 1.5 }}>
                      {readSummary.headline}
                    </div>
                  )}
                  {readSummary.lede && (
                    <p style={{ fontSize: 15, fontWeight: 600, color: "var(--mm-fg)", lineHeight: 1.65, margin: "0 0 14px" }}>{readSummary.lede}</p>
                  )}
                  {readSummary.paragraphs?.map((p, i) => (
                    <p key={i} style={{ fontSize: 14, color: "var(--mm-fg-muted)", lineHeight: 1.7, margin: "0 0 12px" }}>{p}</p>
                  ))}
                  {readSummary.why_it_matters && (
                    <div style={{ marginTop: 12, marginBottom: 4, background: "color-mix(in srgb, var(--mm-primary) 8.0%, transparent)", border: "1px solid var(--mm-border-strong)", borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--mm-primary-glow)", marginBottom: 8 }}>Pourquoi c'est important</div>
                      <p style={{ fontSize: 13.5, color: "var(--mm-fg)", lineHeight: 1.6, margin: 0 }}>{readSummary.why_it_matters}</p>
                    </div>
                  )}
                  {readSummary.key_takeaways?.length > 0 && (
                    <div style={{ marginTop: 16, background: "var(--mm-bg)", borderRadius: 14, padding: "14px 16px", border: "1px solid var(--mm-border)" }}>
                      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--mm-primary-glow)", marginBottom: 10 }}>Points clés</div>
                      {readSummary.key_takeaways.map((k, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 13, color: "var(--mm-fg)", alignItems: "flex-start", lineHeight: 1.5 }}>
                          <span style={{ color: "var(--mm-primary-glow)", fontWeight: 900, flexShrink: 0, marginTop: 1 }}>›</span>{k}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, marginTop: 12, fontSize: 11 }}>
                    {readSummary.level && <span style={{ background: "color-mix(in srgb, var(--mm-primary) 12.0%, transparent)", color: "var(--mm-primary-glow)", padding: "3px 10px", borderRadius: 6, fontWeight: 700, border: "1px solid var(--mm-border)" }}>🎯 {readSummary.level}</span>}
                    {readSummary.read_time && <span style={{ color: "var(--mm-fg-faint)" }}>⏱ ~{readSummary.read_time} min</span>}
                  </div>
                </div>
              )}

              {!reading && !readSummary && visibleFrenchDescription(selected) && (
                <p style={{ color: "var(--mm-fg-muted)", fontSize: 14, lineHeight: 1.65 }}>{visibleFrenchDescription(selected)}</p>
              )}

              {/* ── BENTO D'ACTIONS ÉLITE LIQUID GLASS ── */}
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Action Principale Reine : Création Fiche FSRS */}
                <button
                  type="button"
                  onClick={() => {
                    if (window.navigator?.vibrate) window.navigator.vibrate(10);
                    createCardFromItem(selected);
                  }}
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary-deep) 100%)",
                    color: "#FFFFFF",
                    border: "1px solid rgba(255, 255, 255, 0.25)",
                    borderRadius: 16,
                    padding: "15px 20px",
                    fontSize: 14.5,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 9,
                    boxShadow: "0 8px 24px color-mix(in srgb, var(--mm-primary) 40%, transparent)",
                    transition: "transform 0.15s ease",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span style={{ fontSize: 16 }}>⚡</span>
                  <span>Créer une fiche de révision FSRS</span>
                </button>

                {/* Actions Secondaires en 2x2 Bento */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => speak(selected)}
                    style={{
                      background: speakingId === selected.id ? "rgba(239, 68, 68, 0.15)" : (isDarkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)"),
                      color: speakingId === selected.id ? "#EF4444" : "var(--mm-fg)",
                      border: `1px solid ${speakingId === selected.id ? "rgba(239, 68, 68, 0.3)" : "var(--mm-border)"}`,
                      borderRadius: 14,
                      padding: "13px 16px",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <span>{speakingId === selected.id ? "⏹️" : "🔊"}</span>
                    <span>{speakingId === selected.id ? "Arrêter Audio" : "Écouter"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSave(selected)}
                    style={{
                      background: savedIds.has(selected.id) ? "rgba(245, 158, 11, 0.15)" : (isDarkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)"),
                      color: savedIds.has(selected.id) ? "#F59E0B" : "var(--mm-fg)",
                      border: `1px solid ${savedIds.has(selected.id) ? "rgba(245, 158, 11, 0.35)" : "var(--mm-border)"}`,
                      borderRadius: 14,
                      padding: "13px 16px",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <span>{savedIds.has(selected.id) ? "⭐" : "🔖"}</span>
                    <span>{savedIds.has(selected.id) ? "Enregistré" : "Favori"}</span>
                  </button>

                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      textDecoration: "none",
                      background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
                      color: "var(--mm-fg)",
                      border: "1px solid var(--mm-border)",
                      borderRadius: 14,
                      padding: "13px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span>Source</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>↗</span>
                  </a>
                </div>
              </div>

              {/* Deep analysis */}
              {analysis && (
                <div style={{ marginTop: 20, background: "var(--mm-bg)", borderRadius: 14, padding: 18, border: "1px solid var(--mm-border)" }}>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--mm-primary-glow)", marginBottom: 12 }}>Analyse approfondie</div>
                  <p style={{ fontSize: 14, color: "var(--mm-fg-muted)", lineHeight: 1.65, margin: "0 0 12px" }}>{analysis.summary}</p>
                  {analysis.key_points && (
                    <ul style={{ paddingLeft: 18, fontSize: 13, color: "var(--mm-fg)", lineHeight: 1.7, margin: "0 0 10px" }}>
                      {analysis.key_points.map((k, i) => <li key={i}>{k}</li>)}
                    </ul>
                  )}
                  {analysis.relevance && <p style={{ fontSize: 12, color: "var(--mm-fg-faint)", fontStyle: "italic", margin: "0 0 12px" }}>💡 {analysis.relevance}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS (READER MODE & CUSTOM FEED MANAGER) ── */}
      {readerArticle && (
        <ReaderModeModal
          article={readerArticle}
          onClose={() => setReaderArticle(null)}
          onCreateCard={onCreateCard}
          showToast={showToast}
        />
      )}

      {showSourcesModal && (
        <CustomFeedManagerModal
          isOpen={showSourcesModal}
          onClose={() => setShowSourcesModal(false)}
          onFeedsUpdated={(updated) => {
            if (Array.isArray(updated)) setCustomFeeds(updated);
            fetchAll(false);
          }}
          isDarkMode={isDark}
          showToast={showToast}
        />
      )}

      {/* ── SNACKBAR UNDO FLOTTANT LIQUID GLASS (5 SECONDES) ── */}
      {undoArticle && (
        <div
          className="tiv-undo-bar"
          style={{
            background: isDark ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.95)",
            border: `1px solid ${isDark ? "rgba(99, 102, 241, 0.35)" : "rgba(59, 130, 246, 0.35)"}`,
            color: isDark ? "#FFFFFF" : "#0F172A",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <span>🗑️</span>
            <span style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Article passé
            </span>
          </div>

          <button
            type="button"
            onClick={handleUndoDismiss}
            style={{
              background: isDark ? "linear-gradient(135deg, #4F46E5, #6366F1)" : "linear-gradient(135deg, #2563EB, #3B82F6)",
              border: "none",
              color: "#FFFFFF",
              borderRadius: 10,
              padding: "6px 14px",
              fontSize: 12.5,
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 8px rgba(79, 70, 229, 0.35)",
              transition: "all 0.15s ease",
            }}
          >
            <span>↩️</span>
            <span>Annuler (5s)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              setUndoArticle(null);
            }}
            aria-label="Fermer"
            style={{
              background: "transparent",
              border: "none",
              color: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.4)",
              cursor: "pointer",
              fontSize: 14,
              padding: 4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>

          {/* Jauge temporelle dégressive de 5 secondes */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 12,
              right: 12,
              height: 2.5,
              background: isDark ? "rgba(99, 102, 241, 0.25)" : "rgba(59, 130, 246, 0.2)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: isDark ? "#818CF8" : "#3B82F6",
                animation: "tiv-countdown 5s linear forwards",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
