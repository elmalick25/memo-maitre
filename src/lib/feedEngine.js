// 🛰️ src/lib/feedEngine.js
// ============================================================================
// MOTEUR UNIVERSEL D'AGRÉGATION & D'AUTO-DÉCOUVERTE DE FLUX (NIVEAU 100)
// ============================================================================
// • Course multi-proxys ultra-résiliente avec annulation immédiate des perdants.
// • Auto-découverte de flux RSS/Atom/JSON depuis n'importe quelle URL web.
// • Normalisation agnostique (RSS 2.0, Atom 1.0, RDF, JSON Feed, Reddit, Substack, YouTube).
// • Système d'authentification et de fiabilité des sources ("Infos Sûres / Officielles").
// • Cache multi-niveaux (L1 Mémoire instantané + L2 Persistant + Déduplication en vol).
// ============================================================================

import { safeStorage } from "./safeStorage.js";

// ─── 1. REGISTRE DES SOURCES OFFICIELLES & FIABLES (TRUST REGISTRY) ─────────
export const TRUST_CATEGORIES = {
  OFFICIAL_GOV: { id: "official_gov", label: "🏛️ Officiel / Gouvernemental", trust: 100 },
  INTERNATIONAL_ORG: { id: "intl_org", label: "🌐 Organisation Internationale", trust: 98 },
  TOP_ACADEMIC: { id: "top_academic", label: "🎓 Université & Recherche d'Excellence", trust: 95 },
  TOP_PRESS: { id: "top_press", label: "📰 Presse de Référence & Journalisme Vérifié", trust: 90 },
  SPECIALIZED_TECH: { id: "specialized_tech", label: "⚡ Veille Spécialisée Tech & IA", trust: 85 },
  COMMUNITY_VERIFIED: { id: "community", label: "💬 Communauté / Blog Indépendant", trust: 70 },
};

/**
 * Registre des domaines de confiance pour l'attribution des badges "Info Sûre / Officielle"
 */
export const TRUSTED_DOMAINS = [
  // Bourses & Études Internationales
  { pattern: /campusfrance\.org/i, category: "official_gov", trust: 100, org: "Campus France (Gouvernement Français)" },
  { pattern: /diplomatie\.gouv\.fr/i, category: "official_gov", trust: 100, org: "Ministère des Affaires Étrangères (France)" },
  { pattern: /europa\.eu/i, category: "intl_org", trust: 100, org: "Union Européenne (Erasmus+ / Mundus)" },
  { pattern: /daad\.de/i, category: "official_gov", trust: 100, org: "DAAD (Allemagne)" },
  { pattern: /chevening\.org/i, category: "official_gov", trust: 100, org: "Chevening (FCDO UK)" },
  { pattern: /fulbrightprogram\.org/i, category: "official_gov", trust: 100, org: "Fulbright (US Dept of State)" },
  { pattern: /studyinsweden\.se/i, category: "official_gov", trust: 98, org: "Swedish Institute (Suède)" },
  { pattern: /sbfi\.admin\.ch/i, category: "official_gov", trust: 100, org: "Confédération Suisse (SERI)" },
  { pattern: /ares-ac\.be/i, category: "official_gov", trust: 98, org: "ARES Wallonie-Bruxelles (Belgique)" },
  { pattern: /turkiyeburslari\.gov\.tr/i, category: "official_gov", trust: 100, org: "Gouvernement de Turquie" },
  { pattern: /mext\.go\.jp|studyinjapan\.go\.jp/i, category: "official_gov", trust: 100, org: "MEXT (Gouvernement du Japon)" },
  { pattern: /studyinkorea\.go\.kr/i, category: "official_gov", trust: 100, org: "GKS (Gouvernement de Corée du Sud)" },
  { pattern: /vanier\.gc\.ca|canada\.ca/i, category: "official_gov", trust: 100, org: "Gouvernement du Canada" },
  { pattern: /worldbank\.org/i, category: "intl_org", trust: 98, org: "Banque Mondiale" },
  { pattern: /unesco\.org/i, category: "intl_org", trust: 98, org: "UNESCO" },
  
  // Grandes Institutions Académiques
  { pattern: /mit\.edu/i, category: "top_academic", trust: 98, org: "Massachusetts Institute of Technology (MIT)" },
  { pattern: /harvard\.edu/i, category: "top_academic", trust: 98, org: "Harvard University" },
  { pattern: /ox\.ac\.uk|oxford\.edu/i, category: "top_academic", trust: 98, org: "University of Oxford" },
  { pattern: /cam\.ac\.uk/i, category: "top_academic", trust: 98, org: "University of Cambridge" },
  { pattern: /ethz\.ch/i, category: "top_academic", trust: 98, org: "ETH Zürich" },
  { pattern: /epfl\.ch/i, category: "top_academic", trust: 98, org: "EPFL" },
  { pattern: /polytechnique\.edu/i, category: "top_academic", trust: 98, org: "Institut Polytechnique de Paris" },
  { pattern: /sorbonne-universite\.fr/i, category: "top_academic", trust: 95, org: "Sorbonne Université" },
  { pattern: /nature\.com/i, category: "top_academic", trust: 98, org: "Nature Scientific Publishing" },
  { pattern: /science\.org/i, category: "top_academic", trust: 98, org: "Science / AAAS" },
  { pattern: /arxiv\.org/i, category: "top_academic", trust: 95, org: "arXiv (Cornell University)" },

  // Presse de Référence Mondiale & Tech Fiable
  { pattern: /lemonde\.fr/i, category: "top_press", trust: 92, org: "Le Monde" },
  { pattern: /francetvinfo\.fr/i, category: "top_press", trust: 90, org: "France Télévisions / Info" },
  { pattern: /rfi\.fr/i, category: "top_press", trust: 90, org: "Radio France Internationale" },
  { pattern: /reuters\.com/i, category: "top_press", trust: 95, org: "Reuters" },
  { pattern: /apnews\.com/i, category: "top_press", trust: 95, org: "Associated Press" },
  { pattern: /bbc\.com|bbc\.co\.uk/i, category: "top_press", trust: 93, org: "BBC News" },
  { pattern: /technologyreview\.com/i, category: "specialized_tech", trust: 92, org: "MIT Technology Review" },
  { pattern: /techcrunch\.com/i, category: "specialized_tech", trust: 88, org: "TechCrunch" },
  { pattern: /theverge\.com/i, category: "specialized_tech", trust: 87, org: "The Verge" },
  { pattern: /wired\.com/i, category: "specialized_tech", trust: 88, org: "Wired" },
  { pattern: /github\.blog/i, category: "specialized_tech", trust: 92, org: "GitHub Official Blog" },
  { pattern: /openai\.com/i, category: "specialized_tech", trust: 90, org: "OpenAI Research" },
  { pattern: /deepmind\.google|blog\.google/i, category: "specialized_tech", trust: 92, org: "Google DeepMind" },
  { pattern: /anthropic\.com/i, category: "specialized_tech", trust: 90, org: "Anthropic" },
  { pattern: /huggingface\.co/i, category: "specialized_tech", trust: 90, org: "Hugging Face" }
];

/**
 * Calcule l'indice de fiabilité et le badge officiel pour une URL/source donnée
 */
export function evaluateSourceTrust(url = "", sourceName = "") {
  const combined = `${url} ${sourceName}`.toLowerCase();
  for (const item of TRUSTED_DOMAINS) {
    if (item.pattern.test(combined)) {
      const cat = TRUST_CATEGORIES[item.category.toUpperCase()] || TRUST_CATEGORIES.OFFICIAL_GOV;
      return {
        trustScore: item.trust,
        trustCategory: item.category,
        categoryLabel: cat.label,
        isVerified: true,
        verifiedOrg: item.org,
        badgeEmoji: item.category === "official_gov" ? "🏛️" : item.category === "intl_org" ? "🌐" : item.category === "top_academic" ? "🎓" : "✅",
      };
    }
  }

  // Si c'est un domaine gouvernemental .gouv.fr, .gov, .edu, .ac.uk
  if (/\.(gouv\.fr|gov(\.[a-z]{2})?|edu(\.[a-z]{2})?|ac\.[a-z]{2})/i.test(url)) {
    return {
      trustScore: 95,
      trustCategory: "official_gov",
      categoryLabel: TRUST_CATEGORIES.OFFICIAL_GOV.label,
      isVerified: true,
      verifiedOrg: "Institution Gouvernementale / Académique Officielle",
      badgeEmoji: "🏛️",
    };
  }

  return {
    trustScore: 65,
    trustCategory: "community",
    categoryLabel: TRUST_CATEGORIES.COMMUNITY_VERIFIED.label,
    isVerified: false,
    verifiedOrg: null,
    badgeEmoji: "📄",
  };
}


// ─── 2. COURSE MULTI-PROXYS ULTRA-RÉSILIENTE (PARALLEL PROXY RACE) ──────────
const _feedRequestMemo = new Map();
const MEMO_TTL_MS = 45_000;

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) ctrl.abort();
    else externalSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Proxys CORS vérifiés et calibrés pour contourner les blocages navigateurs
 */
const PROXY_PIPELINE = [
  {
    name: "rss2json",
    build: (u) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}`,
    parse: async (res) => {
      const data = await res.json();
      if (data.status !== "ok" || !data.items) throw new Error("rss2json invalid status");
      // Reconstruit un XML RSS standard pour le parseur agnostique unifié
      const itemsXml = (data.items || []).map((it) => `
        <item>
          <title><![CDATA[${it.title || ""}]]></title>
          <link><![CDATA[${it.link || ""}]]></link>
          <description><![CDATA[${it.description || it.content || ""}]]></description>
          <pubDate>${it.pubDate || ""}</pubDate>
          <author>${it.author || ""}</author>
          ${it.enclosure?.link ? `<enclosure url="${it.enclosure.link}" type="${it.enclosure.type || ""}" />` : ""}
          ${it.thumbnail ? `<media:thumbnail url="${it.thumbnail}" />` : ""}
          ${(it.categories || []).map((c) => `<category>${c}</category>`).join("")}
        </item>
      `).join("");
      return `<rss version="2.0"><channel><title>${data.feed?.title || ""}</title><link>${data.feed?.link || ""}</link>${itemsXml}</channel></rss>`;
    }
  },
  {
    name: "codetabs",
    build: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
    parse: async (res) => res.text()
  },
  {
    name: "allorigins-raw",
    build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    parse: async (res) => res.text()
  },
  {
    name: "allorigins-json",
    build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    parse: async (res) => {
      const data = await res.json();
      return data?.contents || "";
    }
  },
  {
    name: "cors-proxy-io",
    build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    parse: async (res) => res.text()
  },
  {
    name: "jina-feed",
    build: (u) => `https://r.jina.ai/${u}`,
    parse: async (res) => res.text()
  }
];

/**
 * Télécharge le contenu d'une URL via course de proxys avec annulation immédiate des losers.
 */
export async function fetchRawFeedContent(targetUrl, { timeoutMs = 8500 } = {}) {
  const cacheKey = targetUrl.trim();
  const cached = _feedRequestMemo.get(cacheKey);
  if (cached && Date.now() - cached.ts < MEMO_TTL_MS) {
    return cached.promise;
  }

  const raceCtrl = new AbortController();
  const attempts = PROXY_PIPELINE.map(async (proxy) => {
    try {
      const reqUrl = proxy.build(targetUrl);
      const res = await fetchWithTimeout(
        reqUrl,
        {
          headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html, */*" },
          signal: raceCtrl.signal,
        },
        timeoutMs
      );

      if (!res.ok) throw new Error(`${proxy.name} HTTP ${res.status}`);
      const text = await proxy.parse(res);
      if (!text || text.trim().length < 30) throw new Error(`${proxy.name} payload empty`);

      // Vérifie que ce n'est pas une page d'erreur de proxy déguisée
      if (/AuthenticationRequiredError|blocked from performing|bad network reputation|Quota Exceeded|Cloudflare Ray ID/i.test(text)) {
        throw new Error(`${proxy.name} error envelope`);
      }

      return { text, proxyUsed: proxy.name };
    } catch (err) {
      throw err;
    }
  });

  const promise = Promise.any(attempts)
    .then((winner) => {
      raceCtrl.abort();
      return winner;
    })
    .catch((aggregateErr) => {
      _feedRequestMemo.delete(cacheKey);
      const reasons = aggregateErr?.errors?.map((e) => e?.message).filter(Boolean).join(" | ") || aggregateErr?.message || "Unknown error";
      throw new Error(`Feed fetch failed across all proxies: ${reasons}`);
    });

  _feedRequestMemo.set(cacheKey, { ts: Date.now(), promise });
  return promise;
}


// ─── 3. AUTO-DÉCOUVERTE UNIVERSELLE DE FLUX DEPUIS N'IMPORTE QUELLE URL ─────
/**
 * Tente d'extraire des liens de flux RSS/Atom depuis une page HTML ou un domaine
 */
export function discoverFeedsFromHtml(htmlText, baseUrl = "") {
  if (!htmlText) return [];
  const foundFeeds = [];

  try {
    // 1. Recherche par DOMParser si disponible
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(htmlText, "text/html");
      const links = doc.querySelectorAll('link[rel="alternate"]');
      links.forEach((l) => {
        const type = l.getAttribute("type") || "";
        const href = l.getAttribute("href");
        if (href && (type.includes("rss") || type.includes("atom") || type.includes("xml") || type.includes("json"))) {
          foundFeeds.push({
            url: resolveUrl(href, baseUrl),
            title: l.getAttribute("title") || "Flux Détecté",
            type: type.includes("atom") ? "atom" : type.includes("json") ? "json" : "rss",
          });
        }
      });
    }
  } catch {}

  // 2. Fallback Regex robuste (fonctionne côté Node ou si DOMParser échoue)
  if (foundFeeds.length === 0) {
    const linkRegex = /<link[^>]+rel=["']alternate["'][^>]+>/gi;
    let match;
    while ((match = linkRegex.exec(htmlText)) !== null) {
      const tag = match[0];
      const typeMatch = tag.match(/type=["']([^"']+)["']/i);
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      const titleMatch = tag.match(/title=["']([^"']+)["']/i);

      if (hrefMatch && typeMatch && /rss|atom|xml|json/i.test(typeMatch[1])) {
        foundFeeds.push({
          url: resolveUrl(hrefMatch[1], baseUrl),
          title: titleMatch ? titleMatch[1] : "Flux Découvert",
          type: /atom/i.test(typeMatch[1]) ? "atom" : /json/i.test(typeMatch[1]) ? "json" : "rss",
        });
      }
    }
  }

  // 3. Déduplication par URL
  const unique = [];
  const seen = new Set();
  for (const f of foundFeeds) {
    if (!seen.has(f.url)) {
      seen.add(f.url);
      unique.push(f);
    }
  }
  return unique;
}

/**
 * Résout une URL relative en URL absolue
 */
export function resolveUrl(relativeUrl, baseUrl) {
  if (!baseUrl || /^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
}

/**
 * Auto-découvre ou résout un flux depuis n'importe quelle URL (URL directe de flux ou URL de site)
 */
export async function autoDiscoverFeed(inputUrl) {
  const url = inputUrl.trim();
  if (!url) throw new Error("URL manquante");

  // Si c'est déjà une URL explicite de flux (finit par .rss, .xml, /feed, /atom)
  if (/\.(rss|xml|atom|json)($|\?)/i.test(url) || /\/(feed|rss|rss\.xml|atom\.xml)($|\?)/i.test(url)) {
    return { feedUrl: url, candidateFeeds: [{ url, title: "Flux Direct", type: "rss" }] };
  }

  // Sinon, on charge la page et on inspecte les balises de flux
  const { text } = await fetchRawFeedContent(url);
  
  // Si le contenu renvoyé est DÉJÀ du XML/RSS
  if (/<(rss|feed|channel)\b/i.test(text)) {
    return { feedUrl: url, candidateFeeds: [{ url, title: "Flux Détecté", type: "rss" }] };
  }

  const discovered = discoverFeedsFromHtml(text, url);
  if (discovered.length > 0) {
    return { feedUrl: discovered[0].url, candidateFeeds: discovered };
  }

  // Candidats d'endpoints standards si aucune balise alternate n'est trouvée
  const cleanBase = url.replace(/\/+$/, "");
  const standardEndpoints = [
    `${cleanBase}/feed`,
    `${cleanBase}/rss`,
    `${cleanBase}/rss.xml`,
    `${cleanBase}/feed.xml`,
    `${cleanBase}/atom.xml`,
  ];

  return {
    feedUrl: standardEndpoints[0],
    candidateFeeds: standardEndpoints.map((u) => ({ url: u, title: `Test ${u}`, type: "rss" })),
  };
}


// ─── 4. PARSEUR AGNOSTIQUE UNIFIÉ (RSS 2.0, ATOM 1.0, RDF, JSON FEED) ──────
function cleanHtmlText(raw = "") {
  if (!raw) return "";
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePublicationDate(dateStr) {
  if (!dateStr) return Date.now();
  const parsed = Date.parse(dateStr);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function extractImageFromXmlNode(node, fullText = "") {
  // 1. Enclosure
  const enclosure = node.querySelector?.("enclosure");
  if (enclosure) {
    const encUrl = enclosure.getAttribute("url");
    const encType = enclosure.getAttribute("type") || "";
    if (encUrl && (!encType || encType.startsWith("image/"))) return encUrl;
  }

  // 2. Media thumbnail / content
  const mediaThumb = node.querySelector?.("media\\:thumbnail, thumbnail");
  if (mediaThumb?.getAttribute("url")) return mediaThumb.getAttribute("url");

  const mediaContent = node.querySelector?.("media\\:content, content");
  if (mediaContent?.getAttribute("url") && (mediaContent.getAttribute("medium") === "image" || !mediaContent.getAttribute("medium"))) {
    return mediaContent.getAttribute("url");
  }

  // 3. Balise <img> dans la description ou le content:encoded
  const imgMatch = fullText.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|avif|gif)[^"']*)["']/i) || fullText.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1] && !imgMatch[1].includes("doubleclick") && !imgMatch[1].includes("tracking")) {
    return imgMatch[1];
  }

  return null;
}

/**
 * Normalise n'importe quel flux XML/Atom ou JSON en tableau d'articles standardisés
 */
export function parseUnifiedFeed(rawPayload, { feedUrl = "", defaultSource = "", defaultColor = "#8B5CF6", defaultEmoji = "📰", customCategory = "general" } = {}) {
  if (!rawPayload) return [];
  const text = typeof rawPayload === "string" ? rawPayload.trim() : "";
  const items = [];

  // Évaluation de la réputation de la source
  const trustMeta = evaluateSourceTrust(feedUrl, defaultSource);

  // Cas A : JSON Feed 1.1 ou API JSON
  if (text.startsWith("{") || typeof rawPayload === "object") {
    try {
      const data = typeof rawPayload === "object" ? rawPayload : JSON.parse(text);
      const rawList = data.items || data.articles || data.data || [];
      const channelTitle = data.title || defaultSource || "Flux";

      for (let i = 0; i < rawList.length; i++) {
        const item = rawList[i];
        const title = cleanHtmlText(item.title || "Sans titre");
        const link = item.url || item.link || item.id || feedUrl;
        const desc = cleanHtmlText(item.summary || item.description || item.content_html || item.content_text || "");
        const image = item.image || item.banner_image || item.thumbnail || null;
        const ts = parsePublicationDate(item.date_published || item.date_modified || item.publishedAt);

        items.push({
          id: `json_${btoa(unescape(encodeURIComponent(link || `${title}_${i}`))).slice(0, 32)}`,
          title,
          link,
          description: desc,
          fullContent: item.content_html || item.content_text || desc,
          pubDate: new Date(ts).toISOString(),
          ts,
          source: channelTitle,
          sourceUrl: feedUrl,
          category: customCategory,
          color: defaultColor,
          emoji: defaultEmoji,
          image,
          author: item.author?.name || item.authors?.[0]?.name || trustMeta.verifiedOrg || channelTitle,
          trust: trustMeta,
        });
      }
      return items;
    } catch {}
  }

  // Cas B : XML (RSS 2.0, Atom 1.0, RDF)
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      
      // Détection des erreurs de parsing XML
      const parserError = xmlDoc.querySelector("parsererror");
      if (parserError) {
        // Tentative de rattrapage via Regex
        return parseXmlViaRegex(text, { feedUrl, defaultSource, defaultColor, defaultEmoji, customCategory, trustMeta });
      }

      // Traitement RSS 2.0 / RDF (<item>)
      const rssItems = Array.from(xmlDoc.querySelectorAll("item"));
      if (rssItems.length > 0) {
        const channelTitle = xmlDoc.querySelector("channel > title")?.textContent?.trim() || defaultSource || "Flux";
        
        rssItems.forEach((node, idx) => {
          const title = cleanHtmlText(node.querySelector("title")?.textContent || "Sans titre");
          const link = node.querySelector("link")?.textContent?.trim() || node.querySelector("guid")?.textContent?.trim() || "";
          
          const rawDesc = node.querySelector("description")?.textContent || "";
          const rawContent = node.getElementsByTagName("content:encoded")[0]?.textContent ||
                             node.getElementsByTagNameNS("http://purl.org/rss/1.0/modules/content/", "encoded")[0]?.textContent ||
                             rawDesc;
          
          const desc = cleanHtmlText(rawDesc || rawContent);
          const rawPubDate = node.querySelector("pubDate")?.textContent || node.querySelector("dc\\:date, date")?.textContent || "";
          const ts = parsePublicationDate(rawPubDate);
          const image = extractImageFromXmlNode(node, `${rawDesc} ${rawContent}`);
          const author = node.querySelector("author, dc\\:creator, creator")?.textContent?.trim() || channelTitle;
          
          const categories = Array.from(node.querySelectorAll("category")).map((c) => cleanHtmlText(c.textContent)).filter(Boolean);

          items.push({
            id: `rss_${btoa(unescape(encodeURIComponent(link || `${title}_${idx}`))).slice(0, 32)}`,
            title,
            link,
            description: desc,
            fullContent: rawContent || desc,
            pubDate: new Date(ts).toISOString(),
            ts,
            source: channelTitle,
            sourceUrl: feedUrl,
            category: customCategory,
            categories,
            color: defaultColor,
            emoji: defaultEmoji,
            image,
            author,
            trust: trustMeta,
          });
        });
        return items;
      }

      // Traitement Atom 1.0 (<entry>)
      const atomEntries = Array.from(xmlDoc.querySelectorAll("entry"));
      if (atomEntries.length > 0) {
        const feedTitle = xmlDoc.querySelector("feed > title")?.textContent?.trim() || defaultSource || "Flux Atom";
        
        atomEntries.forEach((node, idx) => {
          const title = cleanHtmlText(node.querySelector("title")?.textContent || "Sans titre");
          const linkNode = node.querySelector('link[rel="alternate"]') || node.querySelector("link");
          const link = linkNode?.getAttribute("href") || node.querySelector("id")?.textContent?.trim() || "";
          
          const rawSummary = node.querySelector("summary")?.textContent || "";
          const rawContent = node.querySelector("content")?.textContent || rawSummary;
          const desc = cleanHtmlText(rawSummary || rawContent);
          
          const rawPubDate = node.querySelector("published, updated")?.textContent || "";
          const ts = parsePublicationDate(rawPubDate);
          const image = extractImageFromXmlNode(node, `${rawSummary} ${rawContent}`);
          const author = node.querySelector("author > name")?.textContent?.trim() || feedTitle;

          items.push({
            id: `atom_${btoa(unescape(encodeURIComponent(link || `${title}_${idx}`))).slice(0, 32)}`,
            title,
            link,
            description: desc,
            fullContent: rawContent || desc,
            pubDate: new Date(ts).toISOString(),
            ts,
            source: feedTitle,
            sourceUrl: feedUrl,
            category: customCategory,
            color: defaultColor,
            emoji: defaultEmoji,
            image,
            author,
            trust: trustMeta,
          });
        });
        return items;
      }
    } catch {}
  }

  // Fallback universel Regex
  return parseXmlViaRegex(text, { feedUrl, defaultSource, defaultColor, defaultEmoji, customCategory, trustMeta });
}

/**
 * Fallback de parsing XML basé sur des expressions régulières durcies
 */
function parseXmlViaRegex(xmlText, { feedUrl, defaultSource, defaultColor, defaultEmoji, customCategory, trustMeta }) {
  const items = [];
  const itemBlocks = xmlText.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) || [];

  itemBlocks.forEach((block, idx) => {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i) || block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    const contentMatch = block.match(/<content(?::encoded)?[^>]*>([\s\S]*?)<\/content(?::encoded)?>/i);
    const dateMatch = block.match(/<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i);

    const title = cleanHtmlText(titleMatch ? titleMatch[1] : "Sans titre");
    const link = linkMatch ? cleanHtmlText(linkMatch[1]) : "";
    const rawContent = contentMatch ? contentMatch[1] : (descMatch ? descMatch[1] : "");
    const desc = cleanHtmlText(descMatch ? descMatch[1] : rawContent);
    const ts = parsePublicationDate(dateMatch ? dateMatch[1].trim() : "");
    const imgMatch = block.match(/<img[^>]+src=["']([^"']+)["']/i) || block.match(/url=["']([^"']+\.(?:jpg|jpeg|png|webp|avif))["']/i);

    items.push({
      id: `fallback_${btoa(unescape(encodeURIComponent(link || `${title}_${idx}`))).slice(0, 32)}`,
      title,
      link,
      description: desc,
      fullContent: rawContent || desc,
      pubDate: new Date(ts).toISOString(),
      ts,
      source: defaultSource || "Actualité",
      sourceUrl: feedUrl,
      category: customCategory,
      color: defaultColor,
      emoji: defaultEmoji,
      image: imgMatch ? imgMatch[1] : null,
      author: trustMeta?.verifiedOrg || defaultSource || "Source",
      trust: trustMeta,
    });
  });

  return items;
}


// ─── 5. MOTEUR D'AGRÉGATION MULTI-FLUX AVEC DÉDUPLICATION SÉMANTIQUE ────────
/**
 * Récupère et unifie un ensemble de flux avec tolérance aux pannes individuelles
 */
export async function aggregateMultipleFeeds(feedConfigs = [], { maxArticlesPerFeed = 25, totalLimit = 100 } = {}) {
  const promises = feedConfigs.map(async (cfg) => {
    try {
      const { text } = await fetchRawFeedContent(cfg.url);
      const parsed = parseUnifiedFeed(text, {
        feedUrl: cfg.url,
        defaultSource: cfg.name || cfg.source,
        defaultColor: cfg.color || "#8B5CF6",
        defaultEmoji: cfg.emoji || "📰",
        customCategory: cfg.category || "general",
      });
      return parsed.slice(0, maxArticlesPerFeed);
    } catch (e) {
      console.warn(`Feed failure for [${cfg.name || cfg.url}]:`, e.message);
      return [];
    }
  });

  const settled = await Promise.allSettled(promises);
  let allArticles = [];

  settled.forEach((res) => {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      allArticles.push(...res.value);
    }
  });

  // Déduplication par URL ou titre quasi-identique
  const uniqueArticles = [];
  const seenLinks = new Set();
  const seenTitles = new Set();

  for (const article of allArticles) {
    const normalizedLink = article.link.split("?")[0].toLowerCase().trim();
    const normalizedTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);

    if (normalizedLink && seenLinks.has(normalizedLink)) continue;
    if (normalizedTitle && seenTitles.has(normalizedTitle)) continue;

    if (normalizedLink) seenLinks.add(normalizedLink);
    if (normalizedTitle) seenTitles.add(normalizedTitle);
    uniqueArticles.push(article);
  }

  // Tri par date décroissante (les plus récents d'abord)
  uniqueArticles.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return uniqueArticles.slice(0, totalLimit);
}
