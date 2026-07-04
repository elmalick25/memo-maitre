// ⚡ TechIntelView.jsx — Agrégateur d'actualités tech — Version Magazine Premium
// Design: French-first, hero card, glassmorphism, animations fluides.
// Props : { callClaude, theme, isDarkMode, expressions, setExpressions, storage, showToast, localToday, onCreateCard, onPickArticle }

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { safeStorage } from '../lib/safeStorage';
import { storage } from "../lib/firebase";
import { isGeminiLikelyUnavailable } from "../lib/geminiClient";

const CACHE_KEY = "tech_intel_cache_v3";
const CACHE_TTL_MS = 30 * 60 * 1000;
const DIGEST_KEY_PREFIX = "tech_intel_digest_v2_";

// CACHE EN MÉMOIRE POUR ZÉRO-LATENCE (ANTI-FLICKER)
let memoryCache_techIntel = null;

// ─── CORS / Proxy ────────────────────────────────────────────────────────────
const IS_DEV = typeof import.meta !== "undefined" && import.meta.env?.DEV;

/**
 * Fallback proxy — utilisé si rss2json échoue, ou pour Reddit/YT.
 * Utilise une liste de proxies publics fiables avec failover automatique.
 */
async function fetchViaProxy(url) {
  const baseProxies = [
    {
      name: "allorigins",
      build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
      parse: async (r) => {
        const j = await r.json();
        if (!j.contents) throw new Error("allorigins: empty contents");
        return j.contents;
      }
    },
    {
      name: "corsproxy",
      build: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      parse: async (r) => r.text()
    },
    {
      name: "r.jina.ai",
      build: (u) => `https://r.jina.ai/${u}`,
      parse: async (r) => r.text(),
    },
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
      }
    }
  ];

  // Randomize to distribute load and avoid instant rate limits
  const proxies = [...baseProxies].sort(() => Math.random() - 0.5);

  let lastErr = new Error("No proxy available");
  for (const p of proxies) {
    try {
      const res = await fetch(p.build(url), { headers: { Accept: "text/xml, application/xml, application/json, */*" } });
      if (!res.ok) throw new Error(`${p.name} HTTP ${res.status}`);
      const text = await p.parse(res);
      if (!text || text.length < 10) throw new Error(`${p.name}: empty body`);
      return text;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// ─── Scoring ────────────────────────────────────────────────────────────────
const WEIGHTS = {
  "LLM": 5, "GPT": 5, "Claude": 5, "Gemini": 5, "Llama": 5, "zero-day": 5, "CVE": 5,
  "open source": 4, "AI": 4, "intelligence artificielle": 4, "IA": 4, "kubernetes": 4,
  "vulnérabilité": 4, "exploit": 4, "machine learning": 4,
  "release": 3, "framework": 3, "AWS": 3, "Azure": 3, "financement": 3, "acquisition": 3,
  "Python": 2, "JavaScript": 2, "TypeScript": 2, "Rust": 2, "Docker": 2, "API": 2,
  "développeur": 1, "startup": 1, "cloud": 1, "sécurité": 1, "données": 1,
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
  { name: "Next INpact",     source: "NextINpact",      url: "https://www.nextinpact.com/rss/news.xml",                lang: "fr", priority: 1 },
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
];

const YOUTUBE_CHANNELS = [
  { name: "Underscore_",    id: "UC5Tj9Z_Fv-bB8-tGIX_aQfA", lang: "fr" },
  { name: "Grafikart",      id: "UCx5WYOf83SG5fVyYDjsY5Eg", lang: "fr" },
  { name: "Fireship",       id: "UCsBjURrPoezykLs9EqgamOA", lang: "en" },
  { name: "Theo",           id: "UCbRP3c757lWg9M-U7TyEkXA", lang: "en" },
  { name: "Two Minute Papers", id: "UCbfYPyITQ-7l4upoX8nvctg", lang: "en" },
];

const TABS = [
  { id: "fr",      label: "🇫🇷 Actus FR",   desc: "Presse francophone" },
  { id: "top",     label: "🔥 Tendances",   desc: "Articles les plus pertinents" },
  { id: "ai",      label: "🤖 IA & LLM",   desc: "Intelligence artificielle" },
  { id: "dev",     label: "💻 Dev",         desc: "Développement & outils" },
  { id: "cyber",   label: "🔐 Cybersec",   desc: "Sécurité informatique" },
  { id: "github",  label: "⭐ GitHub",      desc: "Repos tendance" },
  { id: "youtube", label: "🎥 Vidéos",     desc: "Chaînes tech" },
  { id: "saved",   label: "🔖 Favoris",     desc: "Articles sauvegardés" },
  { id: "digest",  label: "📰 Digest IA",  desc: "Résumé quotidien" },
];

const FILTERS = {
  ai:    /\b(AI|LLM|GPT|Claude|Gemini|Llama|neural|transformer|model|machine learning|intelligence artificielle|IA generative)\b/i,
  dev:   /\b(framework|release|library|SDK|API|code|developer|développeur|programming|open source|React|Node|Python|Rust)\b/i,
  cyber: /\b(security|sécurité|vulnerability|vulnérabilité|CVE|breach|ransomware|malware|exploit|hack|patch|zero-day)\b/i,
};

// ─── Utils ──────────────────────────────────────────────────────────────────
function scoreArticle(text) {
  if (!text) return 0;
  let score = 0;
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
    "Source :",
    "Source:"
  ];
  
  let cutoffIndex = cleaned.length;
  for (const marker of cutoffMarkers) {
    const idx = cleaned.indexOf(marker);
    if (idx !== -1 && idx < cutoffIndex) {
      cutoffIndex = idx;
    }
  }
  
  cleaned = cleaned.substring(0, cutoffIndex);
  return cleaned.trim().replace(/\n{3,}/g, '\n\n');
}

// ─── Cache LRU pour les résumés (max 80 entrées, TTL 7 jours) ───────────────
const SUMMARY_LS_KEY = 'tech_intel_summaries_v2';
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
    .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
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
  const r = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
  if (!r.ok) throw new Error(`HN HTTP ${r.status}`);
  const ids = (await r.json()).slice(0, 30);
  const items = await Promise.all(
    ids.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json()).catch(() => null))
  );
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

async function fetchReddit() {
  const REDDIT_URL = "https://www.reddit.com/r/programming+artificial+MachineLearning+cybersecurity+webdev+devops+golang+rust.json?limit=50&raw_json=1";
  let text;
  try {
    text = await fetchViaProxy(REDDIT_URL);
  } catch (e) {
    throw new Error(`Reddit fetch failed: ${e.message}`);
  }
  let j;
  try { j = JSON.parse(text); } catch { throw new Error("Reddit JSON parse error"); }
  if (!j?.data?.children) throw new Error("Reddit: unexpected format");
  return (j.data?.children || []).map(c => {
    const d = c.data;
    const url = d.url_overridden_by_dest || `https://reddit.com${d.permalink}`;
    return {
      id: stableId('rd', url), source: "Reddit",
      title: d.title, url,
      description: stripHtml(d.selftext || "").slice(0, 1500),
      ts: (d.created_utc || 0) * 1000, score: scoreArticle(`${d.title} ${d.selftext || ""}`),
      votes: d.score, comments: d.num_comments, subreddit: d.subreddit,
      thumbnail: d.thumbnail?.startsWith("http") ? d.thumbnail : null,
      extraUrl: `https://reddit.com${d.permalink}`, lang: "en",
    };
  });
}


async function fetchRSS(feed) {
  try {
    const xmlText = await fetchViaProxy(feed.url);
    const xml = new DOMParser().parseFromString(xmlText, "text/xml");
    if (xml.querySelector("parsererror")) throw new Error(`Parse error ${feed.source}`);
    const items = [...xml.querySelectorAll("item, entry")].slice(0, 15);
    return items.map((it) => {
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
      const ts = pub ? new Date(pub).getTime() : Date.now();
      return {
        // ✅ ID stable basé sur l'URL canonique
        id: stableId(`rss_${feed.source}`, url || title),
        source: feed.source, sourceName: feed.name,
        title, url, description: desc, ts,
        score: scoreArticle(`${title} ${desc}`),
        lang: feed.lang || "fr",
        priority: feed.priority || 2,
      };
    }).filter(x => x.title);
  } catch (e) {
    throw new Error(`fetchRSS error: ${e.message}`);
  }
}


async function fetchGitHubTrending() {
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const ghToken = (typeof import.meta !== "undefined" && import.meta.env?.VITE_GITHUB_TOKEN) || "";
  const headers = { Accept: "application/vnd.github+json" };
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
  const r = await fetch(
    `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=25`,
    { headers }
  );
  if (!r.ok) throw new Error(`GitHub API HTTP ${r.status}`);
  const j = await r.json();
  return (j.items || []).map((repo) => ({
    id: stableId('gh', repo.html_url),
    source: "GitHub", kind: "github",
    title: repo.full_name, url: repo.html_url,
    description: repo.description || "", ts: new Date(repo.created_at).getTime(),
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
    throw new Error(`YT fetch fail: ${e.message}`);
  }

  const xml = new DOMParser().parseFromString(xmlText, "text/xml");
  if (xml.querySelector("parsererror")) throw new Error(`YT parse ${channel.name}`);
  return [...xml.querySelectorAll("entry")].slice(0, 5).map((e) => {
    const title = stripHtml(e.querySelector("title")?.textContent || "");
    const linkEl = [...e.querySelectorAll("link")].find(l => l.getAttribute("rel") === "alternate") || e.querySelector("link");
    const link = linkEl?.getAttribute("href") || "";
    const pub = e.querySelector("published, updated")?.textContent;
    const videoId =
      e.getElementsByTagNameNS("http://www.youtube.com/xml/schemas/2015", "videoId")[0]?.textContent ||
      (link.match(/[?&]v=([^&]+)/)?.[1] || "");
    return {
      id: stableId(`yt_${channel.id}`, link),
      source: "YouTube", kind: "youtube",
      title, url: link, description: channel.name,
      ts: pub ? new Date(pub).getTime() : Date.now(),
      score: scoreArticle(title),
      thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null,
      channelName: channel.name, lang: channel.lang || "fr",
    };
  }).filter(x => x.title);
}


// ─── Sub-components ──────────────────────────────────────────────────────────
function SourceBadge({ source, lang, size = "sm" }) {
  const meta = SOURCE_META[source] || { color: "#8b5cf6", emoji: "📰" };
  const fs = size === "lg" ? 11 : 9;
  const pad = size === "lg" ? "3px 10px" : "2px 7px";
  return (
    <span style={{
      background: meta.color + "20", color: meta.color,
      fontSize: fs, fontWeight: 800, padding: pad, borderRadius: 6,
      border: `1px solid ${meta.color}40`, letterSpacing: 0.3,
      textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 3,
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {meta.emoji} {source}
    </span>
  );
}

function LangBadge({ lang }) {
  const isFr = lang === "fr";
  return (
    <span style={{
      background: isFr ? "rgba(34, 197, 94, 0.1)" : "rgba(139, 92, 246, 0.1)",
      color: isFr ? "#22c55e" : "#a78bfa",
      fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 6,
      border: `1px solid ${isFr ? "rgba(34, 197, 94, 0.25)" : "rgba(139, 92, 246, 0.25)"}`,
      display: "inline-flex", alignItems: "center", flexShrink: 0,
    }}>
      {isFr ? "🇫🇷" : "🌐"}
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
  const color = score >= 7 ? "#22c55e" : score >= 4 ? "#f59e0b" : "#8b5cf6";
  return (
    <span title={`Pertinence ${score}/10`} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: color + "15", border: `1px solid ${color}30`,
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
        <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(139,92,246,0.3)", borderTopColor: "#8b5cf6", animation: "tiv-spin .7s linear infinite" }} />
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
          borderLeft: "3px solid #8b5cf6", paddingLeft: 14, marginBottom: 14,
          fontSize: 15, fontWeight: 700, color: isDarkMode ? "#f1f5f9" : "#0f172a", lineHeight: 1.5,
          background: "rgba(139,92,246,0.06)", borderRadius: "0 8px 8px 0", padding: "10px 14px",
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
        <div style={{ marginTop: 12, background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "#818cf8", marginBottom: 6 }}>Pourquoi c'est important</div>
          <p style={{ fontSize: 13, color: isDarkMode ? "#cbd5e1" : "#334155", lineHeight: 1.6, margin: 0 }}>{cachedSummary.why_it_matters}</p>
        </div>
      )}
      {cachedSummary.key_takeaways?.length > 0 && (
        <div style={{ marginTop: 12, background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(139,92,246,0.04)", borderRadius: 12, padding: "12px 14px", border: "1px solid rgba(139,92,246,0.15)" }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "#a78bfa", marginBottom: 8 }}>Points clés</div>
          {cachedSummary.key_takeaways.map((k, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 13, color: isDarkMode ? "#e2e8f0" : "#334155", alignItems: "flex-start", lineHeight: 1.5 }}>
              <span style={{ color: "#8b5cf6", fontWeight: 900, flexShrink: 0, marginTop: 1 }}>›</span>{k}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", fontSize: 11 }}>
        {cachedSummary.level && <span style={{ background: "rgba(139,92,246,0.1)", color: "#a78bfa", padding: "3px 9px", borderRadius: 6, fontWeight: 650, border: "1px solid rgba(139,92,246,0.2)" }}>🎯 {cachedSummary.level}</span>}
        {cachedSummary.read_time && <span style={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}>⏱ ~{cachedSummary.read_time} min</span>}
        <a href={item.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12, color: "#8b5cf6", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
          Lire la source ↗
        </a>
      </div>
    </>
  );
}


// ─── GitHub Card ─────────────────────────────────────────────────────────────
function GitHubCard({ item, isDarkMode }) {
  const langColor = { JavaScript: "#f7df1e", TypeScript: "#3178c6", Python: "#3776ab", Rust: "#dea584", Go: "#00add8" };
  const lc = langColor[item.language] || "#8b5cf6";
  return (
    <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "block" }}>
      <div className="tiv-article" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>🐙</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: isDarkMode ? "#e2e8f0" : "#0f172a", fontSize: 14, fontFamily: "var(--mm-font-display)", marginBottom: 4 }}>
              {item.title}
            </div>
            {item.description && (
              <div style={{ fontSize: 13, color: isDarkMode ? "#cbd5e1" : "#475569", lineHeight: 1.6, marginBottom: 8 }}>
                {item.description}
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

// ─── Main Component ──────────────────────────────────────────────────────────
export default function TechIntelView({
  callClaude, theme = {}, isDarkMode, setExpressions, showToast, onCreateCard, onPickArticle, localToday,
}) {
  const [tab, setTab] = useState("fr");
  const [autoTranslate, setAutoTranslate] = useState(() => {
    try { const s = safeStorage.get("tiv_auto_translate"); return s !== null ? JSON.parse(s) : true; }
    catch { return true; }
  });
  const [items, setItems] = useState(() => memoryCache_techIntel?.items || []);
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(() => !memoryCache_techIntel);
  const [progress, setProgress] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(() => memoryCache_techIntel?.ts || 0);
  const [errors, setErrors] = useState([]);
  const [selected, setSelected] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [translating, setTranslating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [readSummary, setReadSummary] = useState(null);
  const [reading, setReading] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [ttsProgress, setTtsProgress] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [inlineLoadingId, setInlineLoadingId] = useState(null);
  const [readIds, setReadIds] = useState(() => {
    try { return new Set(JSON.parse(safeStorage.get('tech_intel_read_ids_v1') || '[]')); }
    catch { return new Set(); }
  });
  const [deletedIds, setDeletedIds] = useState(() => {
    try { return new Set(JSON.parse(safeStorage.get('tech_intel_deleted_ids_v1') || '[]')); }
    catch { return new Set(); }
  });
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
  const [bionicReading, setBionicReading] = useState(false);
  const [podcastMode, setPodcastMode] = useState(false);
  const podcastModeRef = useRef(podcastMode);
  useEffect(() => { podcastModeRef.current = podcastMode; }, [podcastMode]);
  const [showSortMenu, setShowSortMenu] = useState(false);
  // Phase 2.1 — Virtualisation infinite scroll
  const [visibleCount, setVisibleCount] = useState(15);
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
    try { return JSON.parse(safeStorage.get('tech_intel_custom_feeds_v1') || '[]'); }
    catch { return []; }
  });

  const refreshTimer = useRef(null);
  const tickTimer = useRef(null);
  const seenIds = useRef(new Set());
  // ✅ Phase 1.2+1.3 — Deux caches séparés avec LRU
  const summaryCache = useRef(null);
  if (!summaryCache.current) {
    try { summaryCache.current = JSON.parse(safeStorage.get(SUMMARY_LS_KEY) || '{}'); }
    catch { summaryCache.current = {}; }
  }
  const analysisCache = useRef(null);
  if (!analysisCache.current) {
    try { analysisCache.current = JSON.parse(safeStorage.get(ANALYSIS_LS_KEY) || '{}'); }
    catch { analysisCache.current = {}; }
  }

  // ─ Cache ─
  const loadCache = useCallback(async () => {
    try {
      const c = await storage.get(CACHE_KEY);
      return c || null;
    } catch { return null; }
  }, []);

  // ─ Translation ─
  const translateItems = useCallback(async (rawItems) => {
    if (!callClaude || !rawItems.length) return rawItems;
    const toTranslate = rawItems.filter(i => !i.titleFr && i.title && i.lang !== "fr");
    if (!toTranslate.length) return rawItems;
    
    const translated = new Map();
    // Batch unique jusqu'à 10 articles
    const batch = toTranslate.slice(0, 10);
    
    const batchPrompt = `Traduis ces ${batch.length} titres et descriptions en français naturel.
Réponds UNIQUEMENT avec un tableau JSON de ce format : [{"id":"...","title":"...","desc":"..."},...]

${batch.map(i => `{"id":"${i.id}","title":"${i.title}","desc":"${(i.description||'').replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0,300)}"}`).join('\n')}`;

    try {
      const raw = await callClaude(
        "Tu es un journaliste tech expert. Réponds UNIQUEMENT avec le tableau JSON demandé.",
        batchPrompt,
        { maxTokens: 1500 }
      );
      const rawText = typeof raw === 'string' ? raw : raw?.text || "[]";
      const match = rawText.match(/\[[\s\S]*\]/);
      const jsonArr = safeParseJsonBlock(match ? match[0] : rawText, []);
      if (Array.isArray(jsonArr)) {
        jsonArr.forEach(item => {
          if (item.id && (item.title || item.desc)) {
            translated.set(item.id, { titleFr: item.title, descriptionFr: item.desc });
          }
        });
      }
    } catch (e) { console.warn("batch enrich fail", e); }

    if (!translated.size) return rawItems;
    return rawItems.map(it => translated.has(it.id) ? { ...it, ...translated.get(it.id) } : it);
  }, [callClaude]);

  const translateSingle = useCallback(async (item) => {
    if (translating || !callClaude || item.lang === "fr" || item.titleFr) return;
    setTranslating(true);
    try {
      const raw = await callClaude(
        "Tu es un traducteur expert tech FR. Réponds UNIQUEMENT avec le JSON demandé.",
        `Traduis en français naturel :\nTitre : ${item.title}\nDescription : ${item.description || ""}\n\nRéponds avec ce format JSON : {"title":"...","desc":"..."}`,
        { maxTokens: 400 }
      );
      const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
      if (json.title) {
        setItems(prev => {
          const next = prev.map(i => i.id === item.id ? { ...i, titleFr: json.title, descriptionFr: json.desc || "" } : i);
          return next;
        });
        showToast?.("Traduction réussie ✨", "success");
      }
    } catch (e) {
      showToast?.("Erreur de traduction", "error");
    } finally { setTranslating(false); }
  }, [callClaude, translating, showToast]);

  const translateVisible = useCallback(async () => {
    if (loading || translating || !callClaude) return;
    const currentFiltered = (() => {
      if (tab === "top")     return items.filter(i => i.score >= 1).slice(0, 50);
      if (tab === "fr")      return items.filter(i => i.lang === "fr");
      if (tab === "github")  return items.filter(i => i.kind === "github");
      if (tab === "youtube") return items.filter(i => i.kind === "youtube");
      if (tab === "digest")  return [];
      const rx = FILTERS[tab];
      return items.filter(i => rx?.test(`${i.title} ${i.description || ""}`));
    })();
    const visibleEnItems = currentFiltered.filter(i => i.lang !== "fr" && !i.titleFr).slice(0, 10);
    if (visibleEnItems.length === 0) return;
    setTranslating(true);
    try {
      const translated = await translateItems(visibleEnItems);
      setItems(prev => {
        const next = prev.map(item => { const t = translated.find(x => x.id === item.id); return t ? { ...item, ...t } : item; });
        return next;
      });
    } catch (e) { console.warn("translateVisible failed", e); }
    finally { setTranslating(false); }
  }, [tab, items, loading, translating, callClaude, translateItems]);

  // ─ Fetching ─
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setProgress(0);
    setVisibleCount(15); // reset scroll virtuel

    const activeFeeds = [...RSS_FEEDS, ...customFeeds].filter(f => enabledSources.has(f.name));

    const sources = [
      ["HN", fetchHN()],
      ["Reddit", fetchReddit()],
      ["GitHub", fetchGitHubTrending()],
      ...activeFeeds.map(f => [f.name, fetchRSS(f)]),
      ...YOUTUBE_CHANNELS.map(c => [`YT ${c.name}`, fetchYouTube(c)]),
    ];
    const total = sources.length;
    let done = 0;
    const failed = [];
    const all = [];
    await Promise.allSettled(sources.map(async ([name, p]) => {
      try { all.push(...(await p)); }
      catch (e) { failed.push(name); console.warn(`RSS [${name}]:`, e?.message); }
      finally { done++; setProgress(Math.round((done / total) * 100)); }
    }));
    // ✅ Phase 1.1 — Déduplication par URL canonique (évite les doublons cross-sources)
    const seenUrls = new Set();
    const deduped = all.filter(item => {
      const key = (item.url || item.id).replace(/[?#].*$/, '').toLowerCase().trim();
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });
    deduped.sort((a, b) => (b.score - a.score) || (b.ts - a.ts));
    setItems(deduped);
    const now = Date.now();
    setLastRefresh(now);
    const c = { items: deduped, ts: now };
    memoryCache_techIntel = c;
    try {
      const safeCache = JSON.parse(JSON.stringify(c));
      await storage.set(CACHE_KEY, safeCache);
    } catch (e) {
      console.warn("Cache Firestore KO:", e);
      // ✅ Phase 4.4 — Fallback sessionStorage (survie à la session)
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
    }
    setErrors(failed);
    setLoading(false);

    // ✅ GOD MODE : Préchauffage des articles en arrière-plan
    setTimeout(async () => {
      const topItems = deduped.slice(0, 30);
      for (const item of topItems) {
        if (!navigator.onLine) break;
        if (summaryCache.current[item.id] && summaryCache.current[item.id].paragraphs[0].length > 100) continue; 
        
        try {
          const res = await fetch(`https://r.jina.ai/${item.url}`, { headers: { Accept: "text/plain" } });
          if (res.ok) {
            const pageContent = await res.text();
            if (pageContent && pageContent.length > 50) {
              const contentStr = cleanJinaText(pageContent);
              
              let finalParagraphs = contentStr.split('\n\n').filter(p => p.trim().length > 50).slice(0, 3);
              
              if (callClaude && contentStr.length > 500) {
                try {
                  const prompt = `Résume cet article de manière exhaustive et très instructive en français. Fais au minimum 5 phrases complètes pour bien détailler les faits et enjeux techniques. Ne retourne QUE le texte du résumé (sans formatage Markdown).\n\nTexte: ${contentStr.substring(0, 15000)}`;
                  const raw = await callClaude("Tu es un journaliste tech d'élite.", prompt, { maxTokens: 1000 });
                  const rawText = typeof raw === 'string' ? raw : (raw?.text || '');
                  if (rawText.trim()) {
                    finalParagraphs = [rawText.trim()];
                  }
                } catch (e) { console.warn("AI prefetch failed", e); }
              }

              const json = {
                headline: item.titleFr || item.title,
                paragraphs: finalParagraphs,
                key_takeaways: [], why_it_matters: "", level: "",
                read_time: Math.max(1, Math.ceil(finalParagraphs.join(" ").split(/\s+/).length / 200))
              };
              setSummaryEntry(summaryCache.current, item.id, json);
              setNow(Date.now()); // ⬅️ Force le composant à s'actualiser en temps réel !
            }
          }
        } catch { }
      }
      persistCache(SUMMARY_LS_KEY, summaryCache.current);
    }, 1000);

  }, []);

  const fetchDigest = useCallback(async (currentItems = []) => {
    if (!callClaude || !navigator.onLine) return;
    const today = localToday || new Date().toISOString().slice(0, 10);
    const key = DIGEST_KEY_PREFIX + today;
    try {
      const cached = await storage.get(key);
      if (cached) { setDigest(cached); return; }
    } catch { }
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
      setDigest(json);
      try { await storage.set(key, json); } catch { }
    } catch (e) { console.warn("digest fail", e); }
  }, [callClaude, localToday]);

  // ─ Effects ─
  useEffect(() => {
    let active = true;
    async function init() {
      if (memoryCache_techIntel) {
        if (!active) return;
        // Cache mémoire déjà chargé — lancer le digest avec les items en cache
        fetchDigest(memoryCache_techIntel.items || []);
        return;
      }
      // Tenter la cache sessionStorage en premier (plus rapide)
      try {
        const sess = sessionStorage.getItem(CACHE_KEY);
        if (sess) {
          const c = JSON.parse(sess);
          if (c?.items?.length > 0) {
            memoryCache_techIntel = c;
            setItems(c.items);
            setLastRefresh(c.ts);
            setLoading(false);
            fetchDigest(c.items);
            return;
          }
        }
      } catch {}
      const c = await loadCache();
      if (!active) return;
      if (c?.items && c.items.length > 0) {
        memoryCache_techIntel = c;
        setItems(c.items);
        setLastRefresh(c.ts);
        setLoading(false);
        fetchDigest(c.items);
      } else {
        fetchAll(false);
      }
    }
    init();
    tickTimer.current = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => { active = false; clearInterval(tickTimer.current); };
  }, [fetchAll, fetchDigest, loadCache]); // eslint-disable-line react-hooks/exhaustive-deps

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
    try { safeStorage.set("tech_intel_custom_feeds_v1", JSON.stringify(customFeeds)); } catch { }
  }, [customFeeds]);

  useEffect(() => {
    // 🛡️ Protection quota Gemini : ne traduit pas si le quota est épuisé
    if (!autoTranslate) return;
    if (items.length === 0 || loading) return;
    if (isGeminiLikelyUnavailable()) {
      console.warn("[TechIntel] autoTranslate suspendu — quota Gemini atteint, réessaie dans quelques minutes");
      return;
    }
    const t = setTimeout(() => translateVisible(), 800);
    return () => clearTimeout(t);
  }, [tab, items.length, loading, autoTranslate, translateVisible]);

  // ✅ Phase 2.2 — Prefetch automatique (God Mode Offline)
  const runPrefetch = useCallback(async () => {
    if (prefetchRunning || !callClaude || !navigator.onLine) return;
    setPrefetchRunning(true);
    
    // On preload les 10 prochains articles les plus pertinents non mis en cache
    const toProcess = items
      .filter(i => i.score >= 1 && !summaryCache.current[i.id])
      .slice(0, 10);
      
    if (toProcess.length === 0) { setPrefetchRunning(false); return; }
    setPrefetchProgress({ done: 0, total: toProcess.length });
    
    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      if (isGeminiLikelyUnavailable()) break;
      try {
        let pageContent = "";
        try {
          const res = await fetch(`https://r.jina.ai/${item.url}`, { headers: { Accept: "text/plain" } });
          if (res.ok) pageContent = await res.text();
        } catch { }
        const contentStr = cleanJinaText(pageContent) || item.descriptionFr || item.description || "Contenu non disponible.";
        let finalParagraphs = [];
        if (contentStr.length > 500) {
          const prompt = `Voici un article. Résume-le en UN SEUL paragraphe très riche, fluide et extrêmement instructif en français (environ 5 à 8 phrases). Ne retourne QUE le texte du paragraphe, sans aucune fioriture ni formatage Markdown. Cible les faits marquants.\n\nTexte: ${contentStr.substring(0, 15000)}`;
          const raw = await callClaude("Tu es un journaliste tech d'élite.", prompt, { maxTokens: 1000 });
          const rawText = typeof raw === 'string' ? raw : (raw?.text || '');
          if (rawText.trim()) finalParagraphs = [rawText.trim()];
          else finalParagraphs = contentStr.split('\n\n').filter(p => p.trim().length > 50).slice(0, 2);
        } else {
          finalParagraphs = contentStr.split('\n\n').filter(p => p.trim().length > 50).slice(0, 2);
        }
        
        const json = {
          headline: item.titleFr || item.title,
          paragraphs: finalParagraphs,
          read_time: Math.max(1, Math.ceil(finalParagraphs.join(" ").split(/\s+/).length / 200))
        };
        setSummaryEntry(summaryCache.current, item.id, json);
        persistCache(SUMMARY_LS_KEY, summaryCache.current);
      } catch (e) { console.warn("Prefetch error:", e); }
      
      setPrefetchProgress({ done: i + 1, total: toProcess.length });
      await new Promise(r => setTimeout(r, 1200)); // Pause pour API limit
    }
    
    setTimeout(() => setPrefetchProgress(null), 3000);
    setPrefetchRunning(false);
  }, [items, callClaude, prefetchRunning]);

  // Déclencheur automatique de prefetch après 3 secondes d'inactivité
  useEffect(() => {
    if (items.length > 0 && !loading && !prefetchRunning) {
      const missing = items.filter(i => i.score >= 1 && !summaryCache.current[i.id]).length;
      if (missing > 0) {
        const t = setTimeout(() => runPrefetch(), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [items, loading, prefetchRunning, runPrefetch]);

  // ✅ Phase 2.1 — IntersectionObserver pour le scroll virtuel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount(n => n + 15);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [sentinelRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset visible count quand l'onglet change
  useEffect(() => { setVisibleCount(15); }, [tab, query]);


  useEffect(() => () => { try { window.speechSynthesis.cancel(); } catch { } }, []);

  // ─ Filtered items ─
  const filtered = useMemo(() => {
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    
    let res = items.filter(i => {
      if (deletedIds.has(i.id)) return false;
      if (savedIds.has(i.id)) return true; // Keep saved items
      // Max 2 days limit
      return (nowMs - (i.ts || 0)) <= TWO_DAYS_MS;
    });
    
    const tokens = normalizeText(query).split(" ").filter(Boolean);

    // 🔎 Recherche globale — cherche dans tout le flux
    if (tokens.length) {
      res = res.filter(i => matchesQuery(i, tokens));
      return [...res].sort((a, b) => (b.score - a.score) || (b.ts - a.ts));
    }

    if (tab === "saved")   res = res.filter(i => savedIds.has(i.id));
    // ✅ Phase 3.3 — Score de tendance réel (décroissance temporelle)
    else if (tab === "top")     res = [...res].sort((a, b) => trendScore(b) - trendScore(a)).slice(0, 50);
    else if (tab === "fr")      res = res.filter(i => i.lang === "fr");
    else if (tab === "github")  res = res.filter(i => i.kind === "github");
    else if (tab === "youtube") res = res.filter(i => i.kind === "youtube");
    else if (tab === "digest")  res = [];
    else {
      const rx = FILTERS[tab];
      if (rx) res = res.filter(i => rx.test(`${i.title} ${i.description || ""}`));
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
  }, [items, tab, readIds, deletedIds, savedIds, query, sortMode, dateFilter]);

  const listItems = filtered;

  // ─ Actions ─
  const deleteArticle = useCallback((item) => {
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
  }, []);

  const toggleSave = useCallback((item) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) { next.delete(item.id); showToast?.("Retiré des favoris", "info"); }
      else { next.add(item.id); showToast?.("Ajouté aux favoris 🔖", "success"); }
      return next;
    });
  }, [showToast]);

  const readArticle = useCallback(async (item) => {
    if (!item) return;
    if (summaryCache.current[item.id]) {
      setReadSummary(summaryCache.current[item.id]);
      return;
    }
    if (!navigator.onLine) {
      const fallback = {
        headline: item.titleFr || item.title,
        paragraphs: [(item.descriptionFr || item.description || "Contenu complet non disponible hors ligne.")],
        key_takeaways: ["Mode hors-ligne : résumé généré à partir de la description."],
        level: "N/A", read_time: 1
      };
      setReadSummary(fallback);
      return;
    }
    setReading(true);
    try {
      let pageContent = "";
      try {
        const res = await fetch(`https://r.jina.ai/${item.url}`, { headers: { Accept: "text/plain" } });
        if (res.ok) pageContent = await res.text();
      } catch { }
      
      const contentStr = cleanJinaText(pageContent) || item.descriptionFr || item.description || "Contenu complet non disponible.";
      
      let finalParagraphs = [];
      // Si le texte est long et qu'on a l'IA, on demande un résumé en UN riche paragraphe (God Mode)
      if (callClaude && contentStr.length > 500) {
        try {
          const prompt = `Voici un article. Résume-le en UN SEUL paragraphe très riche, fluide et extrêmement instructif en français (environ 5 à 8 phrases). Ne retourne QUE le texte du paragraphe, sans aucune fioriture ni formatage Markdown. Cible les faits marquants.\n\nTexte: ${contentStr.substring(0, 15000)}`;
          const raw = await callClaude("Tu es un journaliste tech d'élite.", prompt, { maxTokens: 1000 });
          const rawText = typeof raw === 'string' ? raw : (raw?.text || '');
          if (rawText.trim()) {
            finalParagraphs = [rawText.trim()];
          } else {
            throw new Error("Empty AI response");
          }
        } catch (e) {
          // Fallback : on prend juste les 2 premiers vrais paragraphes
          finalParagraphs = contentStr.split('\n\n').filter(p => p.trim().length > 50).slice(0, 2);
        }
      } else {
        // Fallback sans IA ou texte court
        finalParagraphs = contentStr.split('\n\n').filter(p => p.trim().length > 50).slice(0, 2);
      }

      const json = {
        headline: item.titleFr || item.title,
        paragraphs: finalParagraphs,
        key_takeaways: [],
        why_it_matters: "",
        level: "",
        read_time: Math.max(1, Math.ceil(finalParagraphs.join(" ").split(/\s+/).length / 200))
      };
      
      setSummaryEntry(summaryCache.current, item.id, json);
      persistCache(SUMMARY_LS_KEY, summaryCache.current);
      setReadSummary(json);
      
      setReadIds(prev => {
        if (prev.has(item.id)) return prev;
        const next = new Set(prev);
        next.add(item.id);
        try { safeStorage.set('tech_intel_read_ids_v1', JSON.stringify([...next])); } catch {}
        return next;
      });
    } catch { showToast?.("Chargement impossible", "error"); }
    finally { setReading(false); }
  }, [showToast]);

  useEffect(() => {
    const item = listItems[activeIndex];
    const isSearchingQuery = query.trim().length > 0;
    if (item && !isSearchingQuery && tab !== "digest" && tab !== "github") {
      readArticle(item);
    }
  }, [activeIndex, listItems, readArticle, query, tab]);
  const analyze = useCallback(async (item) => {
    if (!callClaude) { window.open(item.url, "_blank"); return; }
    setSelected(item);
    setAnalyzing(true);
    setAnalysis(null);
    // ✅ Phase 1.3 — Lire depuis summaryCache pour le résumé, analysisCache pour l'analyse
    const cachedSummary = summaryCache.current[item.id];
    setReadSummary(cachedSummary || null);
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

  const createCardFromAnalysis = useCallback(() => {
    if (!analysis?.card_front) return;
    const card = {
      id: `tech_${Date.now()}`,
      front: analysis.card_front,
      back: analysis.card_back || analysis.summary,
      category: "⚡ Tech Intel",
      easeFactor: 2.5, interval: 0, repetitions: 0,
      nextReview: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    if (onCreateCard) onCreateCard(card);
    else if (setExpressions) setExpressions(prev => [card, ...(prev || [])]);
    showToast?.("Fiche créée ✓", "success");
    setSelected(null); setAnalysis(null);
  }, [analysis, onCreateCard, setExpressions, showToast]);

  const speak = useCallback((item) => {
    try {
      if (speakingId) {
        window.speechSynthesis.cancel();
        setTtsProgress(null);
        if (speakingId === item.id) { setSpeakingId(null); return; }
      }
      // Phase 2.3 — TTS complet : lit tous les paragraphes
      const cached = summaryCache.current[item.id];
      const parts = [
        item.titleFr || item.title,
        cached?.lede || '',
        ...(cached?.paragraphs || []),
        cached?.why_it_matters ? `Pourquoi c'est important : ${cached.why_it_matters}` : '',
        !cached ? (item.descriptionFr || item.description || '') : '',
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
  const frCount = items.filter(i => i.lang === "fr").length;
  const freshCount = items.filter(i => isBreaking(i.ts)).length;
  const savedCount = items.filter(i => savedIds.has(i.id) && !deletedIds.has(i.id)).length;
  const isSearching = query.trim().length > 0;
  // ✅ Phase 1.5 — Badge LIVE uniquement si données < 5 min
  const isLive = !loading && lastRefresh && (Date.now() - lastRefresh < 5 * 60 * 1000);
  // ✅ Phase 2.4 — Stats du tri/filtre courant
  const SORT_LABELS = { relevance: '⭐ Pertinence', recent: '🕐 Récent', popular: '🔥 Populaire' };
  const DATE_LABELS = { all: 'Tout', today: "Aujourd'hui", week: 'Cette semaine' };

  return (
    <div style={{ background: "var(--mm-bg)", minHeight: "100vh", color: "var(--mm-fg)" }}>
      <style>{`
        @keyframes tiv-pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes tiv-fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes tiv-spin{to{transform:rotate(360deg)}}
        @keyframes tiv-shimmer{0%{background-position:-600px 0}100%{background-position:600px 0}}
        @keyframes tiv-modal-in{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
        @keyframes soundwave-bounce{0%{transform:scaleY(.3)}100%{transform:scaleY(1)}}
        @keyframes tiv-slide-r{from{transform:translateX(-8px);opacity:0}to{transform:none;opacity:1}}
        
        .soundwave{display:inline-flex;align-items:flex-end;gap:2px;width:14px;height:12px}
        .soundwave-bar{width:2px;height:100%;background:var(--mm-primary-glow,#a78bfa);border-radius:1px;transform-origin:bottom;animation:soundwave-bounce .6s ease-in-out infinite alternate}
        .soundwave-bar:nth-child(1){animation-delay:.1s}.soundwave-bar:nth-child(2){animation-delay:.3s}.soundwave-bar:nth-child(3){animation-delay:.2s}.soundwave-bar:nth-child(4){animation-delay:.4s}
        
        .tiv-card{animation:tiv-fade .4s cubic-bezier(.16,1,.3,1) both}
        
        .tiv-article{
          background:var(--mm-bg-card,rgba(15,17,35,.6));
          border:1px solid var(--mm-border,rgba(139,92,246,.2));
          border-radius:16px;margin-bottom:10px;
          transition:all .25s cubic-bezier(.16,1,.3,1);
          overflow:hidden;
        }
        .tiv-article:hover{
          transform:translateY(-2px);
          border-color:var(--mm-border-strong,rgba(139,92,246,.4));
          box-shadow:0 8px 24px rgba(139,92,246,.12);
        }
        .tiv-article-expanded{border-color:var(--mm-border-glow,rgba(139,92,246,.6))!important}
        
        .tiv-tab{
          background:rgba(255,255,255,.04);border:1px solid var(--mm-border);
          color:var(--mm-fg-muted);border-radius:20px;padding:7px 14px;
          font-size:12px;font-weight:600;cursor:pointer;
          transition:all .2s cubic-bezier(.16,1,.3,1);white-space:nowrap;
          display:inline-flex;align-items:center;gap:5px;
        }
        .tiv-tab:hover{background:rgba(139,92,246,.08);color:var(--mm-fg);border-color:var(--mm-border-strong)}
        .tiv-tab-active{background:var(--mm-grad-primary,linear-gradient(135deg,#8b5cf6,#6366f1))!important;color:#fff!important;border-color:transparent!important;box-shadow:0 4px 14px rgba(139,92,246,.35)}
        .tiv-tab-badge{background:rgba(239,68,68,.15);color:#f87171;font-size:9px;font-weight:900;padding:1px 5px;border-radius:8px;border:1px solid rgba(239,68,68,.2)}
        
        .tiv-btn-refresh{
          background:var(--mm-grad-primary,linear-gradient(135deg,#8b5cf6,#6366f1));
          color:#fff;border:none;border-radius:20px;padding:7px 16px;
          cursor:pointer;font-size:12px;font-weight:700;
          box-shadow:0 4px 14px rgba(139,92,246,.35);
          display:flex;align-items:center;gap:4px;transition:all .2s;
        }
        .tiv-btn-refresh:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
        .tiv-btn-refresh:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(139,92,246,.45)}
        
        ::-webkit-scrollbar{width:0}
        @media(max-width:480px){
          .tiv-hero-title{font-size:17px!important}
          .tiv-modal-inner{max-height:92vh!important;border-radius:20px 20px 0 0!important}
        }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        position: "relative", zIndex: 20,
        background: isDarkMode ? "rgba(4,6,15,.92)" : "rgba(248,250,252,.94)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--mm-border)",
      }}>
        {/* Top bar */}
        <div style={{ padding: "12px 16px 0", display: "flex", alignItems: "center", gap: 10 }}>
          {/* Logo + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 11, flexShrink: 0,
              background: "linear-gradient(135deg,#8b5cf6,#6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, boxShadow: "0 4px 14px rgba(139,92,246,.4)",
            }}>📡</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15, color: "var(--mm-fg)", letterSpacing: "-0.4px", fontFamily: "var(--mm-font-display)", lineHeight: 1.2 }}>
                Veille Tech
              </div>
              <div style={{ fontSize: 10, color: "var(--mm-fg-muted)", fontWeight: 500, lineHeight: 1.2 }}>
                {loading ? "Chargement…" : lastRefresh ? `${frCount} articles FR · Mis à jour ${timeAgo(lastRefresh, now)}` : "Actualités tech"}
                {prefetchProgress && <span style={{ marginLeft: 6, color: "#a78bfa" }}>· 📥 Hors-ligne {prefetchProgress.done}/{prefetchProgress.total}</span>}
              </div>
            </div>
            {/* LIVE badge */}
            {isLive && (
              <span style={{
                background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 900,
                padding: "2px 7px", borderRadius: 10, letterSpacing: 0.8,
                animation: "tiv-pulse 2s infinite", display: "flex", alignItems: "center", gap: 3, flexShrink: 0,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />
                LIVE
              </span>
            )}
            {loading && <span style={{ fontSize: 13, animation: "tiv-spin 1s linear infinite" }}>⌛</span>}
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setShowSourcesModal(true)} style={{
              background: "rgba(255,255,255,.04)", border: "1px solid var(--mm-border)",
              color: "var(--mm-fg-muted)", borderRadius: 20, padding: "6px 12px", cursor: "pointer",
              fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5,
            }}>
              ⚙️ Sources
            </button>
            <button onClick={() => setAutoTranslate(p => !p)} title="Traduction automatique"
              style={{
                background: autoTranslate ? "rgba(139,92,246,.12)" : "rgba(255,255,255,.04)",
                color: autoTranslate ? "var(--mm-primary-glow)" : "var(--mm-fg-muted)",
                border: `1px solid ${autoTranslate ? "var(--mm-border-strong)" : "var(--mm-border)"}`,
                borderRadius: 20, padding: "6px 12px", cursor: "pointer",
                fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5,
                transition: "all .2s",
              }}>
              {translating ? <><div style={{ width: 10, height: 10, border: "1.5px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "tiv-spin .5s linear infinite" }} />FR</> : (autoTranslate ? "🪄 FR" : "🌐 EN")}
            </button>
            <button onClick={runPrefetch} disabled={prefetchRunning || !callClaude} style={{
              background: "rgba(255,255,255,.04)", border: "1px solid var(--mm-border)",
              color: "var(--mm-fg-muted)", borderRadius: 20, padding: "6px 12px", cursor: "pointer",
              fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5,
            }}>
              📥 Hors-ligne
            </button>
            {/* Refresh */}
            <button onClick={() => fetchAll(false)} disabled={loading} className="tiv-btn-refresh">
              <span style={{ display: "inline-block", animation: loading ? "tiv-spin 1s linear infinite" : "none" }}>↻</span>
              <span>Regénérer</span>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {loading && (
          <div style={{ height: 2, background: "var(--mm-border)", marginTop: 8, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#8b5cf6,#6366f1)", transition: "width .3s", borderRadius: 2 }} />
          </div>
        )}

        {/* Search bar */}
        <div style={{ padding: "10px 16px 0" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,.04)",
            border: `1px solid ${isSearching ? "var(--mm-border-strong)" : "var(--mm-border)"}`,
            borderRadius: 14, padding: "0 12px",
            transition: "border-color .2s",
          }}>
            <span style={{ fontSize: 14, opacity: .7, flexShrink: 0 }}>🔎</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (ex : IA générative, kubernetes, CVE…)"
              aria-label="Rechercher dans l'actualité"
              style={{
                flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
                color: "var(--mm-fg)", fontSize: 13, fontWeight: 500, padding: "11px 0",
              }}
            />
            {isSearching && (
              <button onClick={() => setQuery("")} aria-label="Effacer la recherche" style={{
                background: "rgba(255,255,255,.06)", border: "none", color: "var(--mm-fg-muted)",
                cursor: "pointer", borderRadius: 8, width: 22, height: 22, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
              }}>✕</button>
            )}
          </div>
          {isSearching && (
            <div style={{ fontSize: 11, color: "var(--mm-fg-muted)", fontWeight: 600, margin: "8px 2px 0" }}>
              {filtered.length} résultat{filtered.length > 1 ? "s" : ""} pour « {query.trim()} » · recherche dans tout le flux
            </div>
          )}
          {!isSearching && tab !== "digest" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, padding: "0 4px" }}>
              <select value={sortMode} onChange={e => setSortMode(e.target.value)} style={{ background: "rgba(255,255,255,.05)", color: "var(--mm-fg)", border: "1px solid var(--mm-border)", borderRadius: 8, padding: "4px 8px", fontSize: 11, outline: "none", cursor: "pointer" }}>
                <option value="relevance" style={{ color: "#000" }}>⭐ Pertinence</option>
                <option value="recent" style={{ color: "#000" }}>🕐 Récent</option>
                <option value="popular" style={{ color: "#000" }}>🔥 Populaire</option>
              </select>
              <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ background: "rgba(255,255,255,.05)", color: "var(--mm-fg)", border: "1px solid var(--mm-border)", borderRadius: 8, padding: "4px 8px", fontSize: 11, outline: "none", cursor: "pointer" }}>
                <option value="all" style={{ color: "#000" }}>Tout</option>
                <option value="today" style={{ color: "#000" }}>Aujourd'hui</option>
                <option value="week" style={{ color: "#000" }}>Cette semaine</option>
              </select>
            </div>
          )}
        </div>

        {/* Tabs Dropdown */}
        <div style={{ position: "relative", padding: "10px 16px 10px", opacity: isSearching ? 0.45 : 1, pointerEvents: isSearching ? "none" : "auto" }}>
          <button 
            onClick={() => setIsTabsOpen(!isTabsOpen)} 
            className="tiv-tab tiv-tab-active"
            style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderRadius: 16 }}
          >
            <span>{TABS.find(t => t.id === tab)?.label || "Catégories"}</span>
            <span style={{ transform: isTabsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", fontSize: 10 }}>▼</span>
          </button>
          
          {isTabsOpen && (
            <div style={{
              position: "absolute", top: "100%", left: 16, right: 16, zIndex: 30,
              background: isDarkMode ? "#0f1123" : "#ffffff", border: "1px solid var(--mm-border-strong)",
              borderRadius: 16, padding: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              display: "flex", flexDirection: "column", gap: 4,
              maxHeight: "300px", overflowY: "auto"
            }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => { setTab(t.id); setIsTabsOpen(false); }} 
                  style={{
                    background: tab === t.id ? "rgba(139,92,246,.15)" : "transparent",
                    color: tab === t.id ? "var(--mm-fg)" : "var(--mm-fg-muted)",
                    border: "none", borderRadius: 12, padding: "10px 14px",
                    textAlign: "left", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                    transition: "all .2s"
                  }}
                >
                  {t.label}
                  {t.id === "fr" && frCount > 0 && <span className="tiv-tab-badge" style={{ marginLeft: "auto" }}>{frCount > 99 ? "99+" : frCount}</span>}
                  {t.id === "top" && freshCount > 0 && <span className="tiv-tab-badge" style={{ marginLeft: "auto" }}>{freshCount}</span>}
                  {t.id === "saved" && savedCount > 0 && <span className="tiv-tab-badge" style={{ marginLeft: "auto" }}>{savedCount}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding: "14px 12px 90px" }}>

        {/* ── DIGEST TAB ── */}
        {tab === "digest" && !isSearching && (
          <div style={{
            background: "var(--mm-bg-card)", border: "1px solid var(--mm-border-strong)",
            borderRadius: 24, padding: 24, boxShadow: "var(--mm-shadow-lg)",
            backdropFilter: "var(--mm-blur)", WebkitBackdropFilter: "var(--mm-blur)",
          }}>
            {!digest && (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <div style={{ position: "relative", width: 48, height: 48, margin: "0 auto 16px" }}>
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(139,92,246,.2)", borderTopColor: "#8b5cf6", animation: "tiv-spin .7s linear infinite" }} />
                  <div style={{ position: "absolute", inset: 8, borderRadius: "50%", border: "2px solid rgba(139,92,246,.2)", borderBottomColor: "#a78bfa", animation: "tiv-spin 1.1s linear infinite reverse" }} />
                </div>
                <p style={{ color: "var(--mm-fg-muted)", fontSize: 14, fontWeight: 600 }}>Rédaction du digest par l'IA…</p>
                {!callClaude && <p style={{ color: "var(--mm-fg-faint)", fontSize: 12 }}>Connectez votre agent IA pour générer le digest.</p>}
              </div>
            )}
            {digest && (
              <>
                {/* Header */}
                <div style={{ borderBottom: "1px solid var(--mm-border)", paddingBottom: 18, marginBottom: 22 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--mm-primary-glow)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>📰</span> BRIEFING QUOTIDIEN
                    <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--mm-fg-faint)", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
                      {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    </span>
                  </div>
                  <h2 style={{ margin: 0, color: "var(--mm-fg)", fontSize: 22, fontFamily: "var(--mm-font-display)", fontWeight: 900, lineHeight: 1.3, letterSpacing: "-0.5px" }}>
                    {digest.headline}
                  </h2>
                </div>

                {/* Items */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {digest.items?.map((it, i) => {
                    const importanceColor = it.importance >= 4 ? "#ef4444" : it.importance >= 3 ? "#f59e0b" : "#8b5cf6";
                    return (
                      <div key={i} style={{
                        padding: 16, borderRadius: 16,
                        background: "rgba(255,255,255,.02)", border: "1px solid var(--mm-border)",
                        transition: "all .2s",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 18 }}>{it.emoji || "💡"}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1,
                            background: "rgba(139,92,246,.12)", color: "var(--mm-primary-glow)",
                            padding: "2px 8px", borderRadius: 6, border: "1px solid var(--mm-border)"
                          }}>{it.category}</span>
                          <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                            {Array.from({ length: 5 }).map((_, k) => (
                              <div key={k} style={{ width: 6, height: 6, borderRadius: 1, background: k < it.importance ? importanceColor : "rgba(255,255,255,.08)" }} />
                            ))}
                          </div>
                        </div>
                        <div style={{ fontWeight: 800, color: "var(--mm-fg)", fontSize: 15, marginBottom: 6, fontFamily: "var(--mm-font-display)" }}>{it.title}</div>
                        <div style={{ fontSize: 13, color: "var(--mm-fg-muted)", lineHeight: 1.6 }}>{it.summary}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Trending tool */}
                {digest.trending_tool && (
                  <div style={{
                    marginTop: 22, padding: 20,
                    background: "linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.15))",
                    borderRadius: 18, border: "1px solid var(--mm-border-strong)",
                    boxShadow: "var(--mm-shadow-glow)", position: "relative", overflow: "hidden",
                  }}>
                    <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,.25),transparent 70%)" }} />
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--mm-primary-glow)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      🛠️ OUTIL DU JOUR
                    </div>
                    <a href={digest.trending_tool.url} target="_blank" rel="noreferrer"
                      style={{ color: "#fff", fontWeight: 900, textDecoration: "none", fontSize: 17, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {digest.trending_tool.name} <span style={{ fontSize: 13 }}>↗</span>
                    </a>
                    <div style={{ fontSize: 13, color: "var(--mm-fg-muted)", marginTop: 6, lineHeight: 1.5 }}>{digest.trending_tool.description}</div>
                  </div>
                )}

                {/* Stat */}
                {digest.stat && (
                  <div style={{
                    marginTop: 16, padding: "12px 16px",
                    background: "rgba(255,255,255,.01)", border: "1px solid var(--mm-border)", borderRadius: 12,
                    fontSize: 12, color: "var(--mm-fg-muted)", fontStyle: "italic",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    📊 {digest.stat}
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
                ? "linear-gradient(90deg,#0d1626 25%,#111d33 50%,#0d1626 75%)"
                : "linear-gradient(90deg,#eef2ff 25%,#e0e7ff 50%,#eef2ff 75%)",
              backgroundSize: "800px 100%", animation: "tiv-shimmer 1.4s linear infinite",
              border: "1px solid var(--mm-border)",
            }} />
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                height: 90, borderRadius: 16, marginBottom: 10,
                background: isDarkMode
                  ? "linear-gradient(90deg,#0d1626 25%,#111d33 50%,#0d1626 75%)"
                  : "linear-gradient(90deg,#eef2ff 25%,#e0e7ff 50%,#eef2ff 75%)",
                backgroundSize: "800px 100%", animation: "tiv-shimmer 1.4s linear infinite",
                border: "1px solid var(--mm-border)",
                animationDelay: `${i * 0.1}s`,
              }} />
            ))}
          </>
        )}

        {/* ── ARTICLE LIST FEED ── */}
        {((tab !== "digest" && tab !== "github") || isSearching) && listItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {listItems.slice(0, visibleCount).map((item, index) => {
              const isSaved = savedIds.has(item.id);
              const isFirst = index === 0;
              
              return (
                <div key={item.id} className="tiv-article tiv-card" style={{ 
                  padding: isFirst ? "24px" : "20px", 
                  position: "relative", 
                  boxSizing: "border-box", 
                  width: "100%", 
                  overflow: "hidden",
                  background: isFirst ? (isDarkMode ? "radial-gradient(120% 120% at 50% 0%, rgba(139,92,246,0.2) 0%, rgba(15,23,42,0.9) 100%)" : "radial-gradient(120% 120% at 50% 0%, rgba(139,92,246,0.15) 0%, rgba(245,247,255,0.9) 100%)") : undefined,
                  border: isFirst ? (isDarkMode ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(139,92,246,0.3)") : undefined,
                  boxShadow: isFirst ? (isDarkMode ? "0 10px 40px rgba(139,92,246,0.25), inset 0 1px 0 rgba(255,255,255,0.1)" : "0 10px 40px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.5)") : undefined,
                  borderRadius: isFirst ? "20px" : "16px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    {isFirst && (
                      <span style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#fff", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 900, letterSpacing: 0.5, boxShadow: "0 2px 8px rgba(245,158,11,0.4)", display: "flex", alignItems: "center", gap: 4 }}>
                        🔥 À LA UNE
                      </span>
                    )}
                    <SourceBadge source={item.source} />
                    <LangBadge lang={item.lang} />
                    {isBreaking(item.ts) && <BreakingBadge />}
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--mm-fg-muted)" }}>{timeAgo(item.ts, now)}</span>
                  </div>

                  <div style={
                    isFirst 
                    ? { 
                        fontWeight: 900, 
                        fontSize: 24, 
                        lineHeight: 1.35, 
                        fontFamily: "var(--mm-font-display)", 
                        marginBottom: 16,
                        backgroundImage: isDarkMode ? "linear-gradient(90deg, #ffffff, #c4b5fd)" : "linear-gradient(90deg, #312e81, #6d28d9)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        color: "transparent"
                      }
                    : { 
                        fontWeight: 900, 
                        color: "var(--mm-fg)", 
                        fontSize: 18, 
                        lineHeight: 1.4, 
                        fontFamily: "var(--mm-font-display)", 
                        marginBottom: 16 
                      }
                  }>
                    {item.titleFr || item.title}
                  </div>

                  <div style={{ fontSize: 14, color: "var(--mm-fg-muted)", lineHeight: 1.6, marginBottom: 16, whiteSpace: "pre-line" }}>
                    {summaryCache.current[item.id]?.paragraphs?.length > 0
                      ? summaryCache.current[item.id].paragraphs.join("\n\n")
                      : (item.descriptionFr || item.description || "")}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <ScoreChip score={item.score} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={(e) => { e.stopPropagation(); window.open(item.url, '_blank'); }} style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "var(--mm-primary-glow)", borderRadius: 10, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                        🔗 Source
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteArticle(item); }} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", borderRadius: 10, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {(tab !== "digest" || isSearching) && !loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{isSearching ? "🔍" : tab === "saved" ? "🔖" : "📭"}</div>
            <div style={{ color: "var(--mm-fg-muted)", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              {isSearching ? `Aucun résultat pour « ${query.trim()} »` : tab === "saved" ? "Aucun favori pour l'instant" : "Aucun article disponible"}
            </div>
            <div style={{ color: "var(--mm-fg-faint)", fontSize: 12, marginBottom: isSearching ? 16 : 0 }}>
              {isSearching ? "Essaie un autre terme ou élargis ta recherche." : tab === "saved" ? "Touche 🏷️ sur un article pour le retrouver ici." : "Actualise pour charger les derniers articles."}
            </div>
            {isSearching && (
              <button onClick={() => setQuery("")} className="tiv-btn-refresh" style={{ margin: "0 auto" }}>
                ✕ Effacer la recherche
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
                  style={{ marginLeft: "auto", fontSize: 11, color: "var(--mm-primary-glow)", textDecoration: "none", fontWeight: 700, background: "rgba(139,92,246,.1)", padding: "4px 10px", borderRadius: 8, border: "1px solid var(--mm-border-strong)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  🔗 Source
                </a>
              </div>

              {/* Title */}
              <h2 style={{ margin: "0 0 18px", fontSize: 20, fontWeight: 900, lineHeight: 1.35, color: "var(--mm-fg)", fontFamily: "var(--mm-font-display)", letterSpacing: "-0.3px" }}>
                {selected.titleFr || selected.title}
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
                    <div style={{ background: "linear-gradient(135deg,rgba(139,92,246,.1),transparent)", border: "1px solid var(--mm-border-strong)", borderLeft: "3px solid var(--mm-primary)", borderRadius: "0 12px 12px 0", padding: "12px 16px", marginBottom: 16, fontSize: 15, fontWeight: 700, color: "var(--mm-fg)", lineHeight: 1.5 }}>
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
                    <div style={{ marginTop: 12, marginBottom: 4, background: "rgba(99,102,241,.08)", border: "1px solid var(--mm-border-strong)", borderRadius: 14, padding: "14px 16px" }}>
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
                    {readSummary.level && <span style={{ background: "rgba(139,92,246,.12)", color: "var(--mm-primary-glow)", padding: "3px 10px", borderRadius: 6, fontWeight: 700, border: "1px solid var(--mm-border)" }}>🎯 {readSummary.level}</span>}
                    {readSummary.read_time && <span style={{ color: "var(--mm-fg-faint)" }}>⏱ ~{readSummary.read_time} min</span>}
                  </div>
                </div>
              )}

              {!reading && !readSummary && (selected.descriptionFr || selected.description) && (
                <p style={{ color: "var(--mm-fg-muted)", fontSize: 14, lineHeight: 1.65 }}>{selected.descriptionFr || selected.description}</p>
              )}

              {/* Actions (Retour seulement) */}
              <div style={{ marginTop: 24 }}>
                <button onClick={() => { setSelected(null); setAnalysis(null); setReadSummary(null); setReading(false); }}
                  style={{ width: "100%", background: "var(--mm-bg-card, rgba(255,255,255,.08))", color: "var(--mm-fg, #fff)", border: "1px solid var(--mm-border, rgba(255,255,255,.15))", borderRadius: 12, padding: "16px", cursor: "pointer", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 4px 15px rgba(0,0,0,0.1)" }}>
                  ⬅️ Revenir en arrière
                </button>
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
                  {analysis.create_card && (
                    <button onClick={createCardFromAnalysis}
                      style={{ background: "linear-gradient(135deg,#8b5cf6,#6366f1)", color: "#fff", border: 0, borderRadius: 12, padding: "12px 0", cursor: "pointer", fontSize: 14, fontWeight: 800, width: "100%", boxShadow: "0 4px 14px rgba(139,92,246,.4)" }}>
                      ➕ Créer une fiche mémo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SOURCES MODAL ── */}
      {showSourcesModal && (
        <div onClick={() => setShowSourcesModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(4,6,15,.8)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--mm-bg-elev, #0b0d1e)", borderRadius: "24px 24px 0 0",
            padding: "20px", maxWidth: 640, width: "100%", maxHeight: "80vh", overflow: "auto",
            animation: "tiv-modal-in .3s cubic-bezier(.16,1,.3,1)",
            border: "1px solid var(--mm-border-strong)", borderBottom: "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontFamily: "var(--mm-font-display)", color: "var(--mm-fg)" }}>⚙️ Sources & Flux RSS</h3>
              <button onClick={() => setShowSourcesModal(false)} style={{ background: "transparent", border: "none", color: "var(--mm-fg-muted)", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--mm-primary-glow)", marginBottom: 12, letterSpacing: 1 }}>Ajouter un flux</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={customFeedUrl} onChange={e => setCustomFeedUrl(e.target.value)} placeholder="URL du flux RSS ou Atom..." style={{ flex: 1, background: "rgba(255,255,255,.05)", border: "1px solid var(--mm-border)", borderRadius: 12, padding: "10px 14px", color: "var(--mm-fg)", fontSize: 13, outline: "none" }} />
                <button 
                  onClick={async () => {
                    if (!customFeedUrl) return;
                    try {
                      const name = new URL(customFeedUrl).hostname.replace('www.', '');
                      setCustomFeeds(prev => [...prev, { name, source: name, url: customFeedUrl, lang: "fr" }]);
                      setEnabledSources(prev => new Set([...prev, name]));
                      setCustomFeedUrl("");
                      showToast?.("Flux ajouté avec succès", "success");
                    } catch {
                      showToast?.("Erreur: Impossible de lire ce flux", "error");
                    }
                  }}
                  style={{ background: "var(--mm-primary, #8b5cf6)", color: "#fff", border: "none", borderRadius: 12, padding: "0 16px", cursor: "pointer", fontWeight: 700 }}
                >
                  Ajouter
                </button>
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--mm-primary-glow)", marginBottom: 12, letterSpacing: 1 }}>Flux actifs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...RSS_FEEDS, ...customFeeds].map(f => {
                const isActive = enabledSources.has(f.name);
                return (
                  <label key={f.name} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,.03)", padding: "12px 16px", borderRadius: 12, cursor: "pointer", border: `1px solid ${isActive ? "var(--mm-border-strong, #8b5cf6)" : "var(--mm-border)"}` }}>
                    <input type="checkbox" checked={isActive} onChange={() => {
                      setEnabledSources(prev => {
                        const next = new Set(prev);
                        if (isActive) next.delete(f.name);
                        else next.add(f.name);
                        return next;
                      });
                    }} style={{ cursor: "pointer" }} />
                    <span style={{ color: "var(--mm-fg)", fontSize: 14, fontWeight: 600 }}>{f.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--mm-fg-faint)" }}>{f.lang.toUpperCase()}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
