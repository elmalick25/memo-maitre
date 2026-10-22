import { handleArticle } from "./article-extract.js";
/**
 * Cloudflare Worker — Proxy, Relais IA Sécurisé & Pré-agrégateur Haute Performance pour MémoMaître
 * 
 * Fonctionnalités :
 *  - 🛡️ CORS universel & filtrage ALLOWED_ORIGINS
 *  - 🔐 Relais IA sécurisé : POST /ai/<groq|cerebras|mistral|or|fireworks|cohere|sambanova|aimlapi|deepseek>
 *  - 💎 Relais Gemini sécurisé : POST /ai/gemini?model=...
 *  - 🎙️ Relais Transcription sécurisé : POST /ai/transcribe (Whisper Large v3 Groq)
 *  - 🎬 Sous-titres YouTube horodatés : GET /yt/transcript?v=ID
 *  - 🎟️ Délivrance de token LiveKit sécurisée : POST /livekit/token (signature HMAC-SHA256)
 *  - 🚀 Endpoint /news-ready.json : Pré-calcul < 1s (KV / Edge Cache)
 *  - ⚡ Endpoint /feed.json : Agrégation Edge pré-mise en cache
 *  - ⏰ Support Cron Trigger (scheduled) toutes les 15 min pour réchauffer le cache
 *  - 🔍 Proxy d'URL transparent (?url=...) avec contournement CORS et cache
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const FEEDS_TO_AGGREGATE = [
  { name: "TechCrunch", source: "TechCrunch", url: "https://techcrunch.com/feed/", lang: "en" },
  { name: "The Verge", source: "Verge", url: "https://www.theverge.com/rss/index.xml", lang: "en" },
  { name: "Wired", source: "Wired", url: "https://www.wired.com/feed/rss", lang: "en" },
  { name: "Ars Technica", source: "ArsTechnica", url: "https://feeds.arstechnica.com/arstechnica/index", lang: "en" },
  { name: "MIT Tech Review", source: "MITTechReview", url: "https://www.technologyreview.com/feed/", lang: "en" },
  { name: "Hugging Face", source: "HuggingFace", url: "https://huggingface.co/blog/feed.xml", lang: "en" },
  { name: "GitHub Blog", source: "GitHubBlog", url: "https://github.blog/feed/", lang: "en" },
  { name: "Numerama", source: "Numerama", url: "https://www.numerama.com/feed/", lang: "fr" },
  { name: "Journal du Geek", source: "JournalDuGeek", url: "https://www.journaldugeek.com/feed/", lang: "fr" },
  { name: "Clubic", source: "Clubic", url: "https://www.clubic.com/feed/news.rss", lang: "fr" },
  { name: "Les Numériques", source: "LesNumeriques", url: "https://www.lesnumeriques.com/rss.xml", lang: "fr" },
  { name: "Next.ink", source: "NextINpact", url: "https://next.ink/feed/", lang: "fr" },
  { name: "Developpez.com", source: "Developpez", url: "https://www.developpez.com/index/rss", lang: "fr" },
  { name: "Dark Reading", source: "DarkReading", url: "https://www.darkreading.com/rss.xml", lang: "en" },
  { name: "France 24", source: "France24", url: "https://www.france24.com/fr/rss", lang: "fr" },
  { name: "Le Monde International", source: "LeMondeWorld", url: "https://www.lemonde.fr/international/rss_full.xml", lang: "fr" },
  { name: "RFI Monde", source: "RFI", url: "https://www.rfi.fr/fr/monde/rss", lang: "fr" },
  { name: "France Info Monde", source: "FranceInfo", url: "https://www.francetvinfo.fr/monde.rss", lang: "fr" },
  { name: "BBC World", source: "BBCWorld", url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang: "en" },
  { name: "Al Jazeera", source: "AlJazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", lang: "en" },
  { name: "The Guardian World", source: "GuardianWorld", url: "https://www.theguardian.com/world/rss", lang: "en" },
  { name: "NYT World", source: "NYTWorld", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", lang: "en" },
  { name: "NPR World", source: "NPRWorld", url: "https://feeds.npr.org/1004/rss.xml", lang: "en" },
  { name: "DW World", source: "DWWorld", url: "https://rss.dw.com/rdf/rss-en-world", lang: "en" },
  { name: "CISA Alerts", source: "CISA", url: "https://www.cisa.gov/cybersecurity-advisories/all.xml", lang: "en" },
  { name: "CERT-FR", source: "CERTFR", url: "https://www.cert.ssi.gouv.fr/feed/", lang: "fr" },
  { name: "SecurityWeek", source: "SecurityWeek", url: "https://www.securityweek.com/feed/", lang: "en" },
  { name: "Anthropic News", source: "Anthropic", url: "https://www.anthropic.com/news/rss.xml", lang: "en" },
  { name: "The Decoder", source: "TheDecoder", url: "https://the-decoder.com/feed/", lang: "en" },
  { name: "Bleeping Computer", source: "ArsTechnica", url: "https://www.bleepingcomputer.com/feed/", lang: "en" },
  { name: "OpenAI Blog", source: "GoogleAI", url: "https://openai.com/blog/rss.xml", lang: "en" },
  { name: "Hacker News", source: "GitHub", url: "https://hnrss.org/frontpage", lang: "en" },
];

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string' || !str.includes('&')) return str || '';
  return str
    .replace(/&eacute;/gi, 'é').replace(/&Eacute;/g, 'É')
    .replace(/&egrave;/gi, 'è').replace(/&Egrave;/g, 'È')
    .replace(/&ecirc;/gi, 'ê').replace(/&Ecirc;/g, 'Ê')
    .replace(/&euml;/gi, 'ë').replace(/&Euml;/g, 'Ë')
    .replace(/&agrave;/gi, 'à').replace(/&Agrave;/g, 'À')
    .replace(/&acirc;/gi, 'â').replace(/&Acirc;/g, 'Â')
    .replace(/&auml;/gi, 'ä').replace(/&Auml;/g, 'Ä')
    .replace(/&ccedil;/gi, 'ç').replace(/&Ccedil;/g, 'Ç')
    .replace(/&icirc;/gi, 'î').replace(/&Icirc;/g, 'Î')
    .replace(/&iuml;/gi, 'ï').replace(/&Iuml;/g, 'Ï')
    .replace(/&ocirc;/gi, 'ô').replace(/&Ocirc;/g, 'Ô')
    .replace(/&ouml;/gi, 'ö').replace(/&Ouml;/g, 'Ö')
    .replace(/&ugrave;/gi, 'ù').replace(/&Ugrave;/g, 'Ù')
    .replace(/&ucirc;/gi, 'û').replace(/&Ucirc;/g, 'Û')
    .replace(/&uuml;/gi, 'ü').replace(/&Uuml;/g, 'Ü')
    .replace(/&oelig;/gi, 'œ').replace(/&OElig;/g, 'Œ')
    .replace(/&aelig;/gi, 'æ').replace(/&AElig;/g, 'Æ')
    .replace(/&#160;|&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#171;|&laquo;/gi, '«').replace(/&#187;|&raquo;/gi, '»')
    .replace(/&hellip;|&#8230;/gi, '…').replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ''; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } });
}

function cleanSubtext(raw) {
  if (!raw) return "";
  const clean = decodeHtmlEntities(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= 400) return clean;
  const match = clean.slice(0, 650).match(/^([\s\S]*?[.!?])(?:\s+|$)/);
  if (match && match[1] && match[1].length >= 100) return match[1].trim();
  return clean.slice(0, 450).trim();
}

function parseRssXml(xml, feed) {
  const items = [];
  const entries = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  for (const entry of entries.slice(0, 30)) {
    const titleMatch = entry.match(/<title\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
    const rawTitle = (titleMatch ? (titleMatch[1] || titleMatch[2] || "") : "").replace(/<[^>]+>/g, "").trim();
    const title = decodeHtmlEntities(rawTitle);
    if (!title) continue;

    const linkMatch = entry.match(/<link\b[^>]*href=["']([^"']+)["']/i) || entry.match(/<link\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/i);
    const url = (linkMatch ? (linkMatch[1] || linkMatch[2] || "") : "").trim();

    const descMatch = entry.match(/<(?:description|summary)\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:description|summary)>/i);
    const rawDesc = (descMatch ? (descMatch[1] || descMatch[2] || "") : "").replace(/<[^>]+>/g, "").trim();
    const desc = cleanSubtext(rawDesc);

    const dateMatch = entry.match(/<(?:pubDate|published|updated)\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:pubDate|published|updated)>/i);
    const dateStr = (dateMatch ? (dateMatch[1] || dateMatch[2] || "") : "").trim();
    const ts = dateStr ? new Date(dateStr).getTime() || Date.now() : Date.now();

    items.push({
      id: `rss_${feed.source}_${url || title}`,
      source: feed.source,
      sourceName: feed.name,
      title,
      titleFr: feed.lang === "fr" ? title : "",
      url,
      description: desc,
      descriptionFr: feed.lang === "fr" ? desc : "",
      ts,
      lang: feed.lang || "fr",
      priority: feed.lang === "fr" ? 1 : 2,
    });
  }
  return items;
}

async function aggregateFeeds() {
  const results = await Promise.allSettled(
    FEEDS_TO_AGGREGATE.map(async (feed) => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetch(feed.url, {
          signal: ctrl.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml, application/atom+xml, text/xml, */*",
          },
        });
        if (!res.ok) return [];
        const text = await res.text();
        return parseRssXml(text, feed);
      } catch {
        return [];
      } finally {
        clearTimeout(tid);
      }
    })
  );

  const allItems = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      allItems.push(...r.value);
    }
  }
  allItems.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return allItems.slice(0, 200);
}

// 🔐 Signature JWT LiveKit côté Edge (Web Crypto HMAC-SHA256)
async function signLiveKitJwt(apiKey, apiSecret, { roomName, identity, metadata, agentName }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    sub: identity || "student",
    jti: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    nbf: now - 5,
    exp: now + 15 * 60,
    metadata: metadata || "",
    video: {
      roomJoin: true,
      room: roomName || "nova-room",
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
      roomCreate: true,
    },
    roomConfig: {
      agents: [
        {
          ...(agentName && agentName !== "auto" ? { agentName } : {}),
          metadata: metadata || "",
        },
      ],
    },
  };

  const b64Url = (obj) => {
    const str = typeof obj === "string" ? obj : JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const encHeader = b64Url(header);
  const encPayload = b64Url(payload);
  const data = new TextEncoder().encode(`${encHeader}.${encPayload}`);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const sigBytes = new Uint8Array(sig);
  let sigBinary = "";
  for (let i = 0; i < sigBytes.length; i++) sigBinary += String.fromCharCode(sigBytes[i]);
  const encSig = btoa(sigBinary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${encHeader}.${encPayload}.${encSig}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎬 Sous-titres YouTube
// Les pistes renvoyées par la page watch / client WEB exigent désormais un « PO token »
// (paramètre exp=xpe) et reviennent vides. Les clients mobiles (ANDROID / IOS) renvoient
// des pistes lisibles sans jeton : on les essaie en priorité.
// ─────────────────────────────────────────────────────────────────────────────
const YT_TRANSCRIPT_VERSION = 2;
const YT_CLIENTS = [
  {
    name: "ANDROID",
    ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
    header: "3",
    client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, osName: "Android", osVersion: "14", hl: "en", gl: "US" },
  },
  {
    name: "IOS",
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    header: "5",
    client: { clientName: "IOS", clientVersion: "20.10.4", deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82", hl: "en", gl: "US" },
  },
  {
    name: "TV_EMBED",
    ua: "Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    header: "85",
    client: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "en", gl: "US" },
    thirdParty: { embedUrl: "https://www.youtube.com/" },
  },
];

function ytDecode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ").trim();
}

function ytParseJson3(cj) {
  return (cj?.events || []).filter((e) => e.segs).map((e) => ({
    start: (e.tStartMs || 0) / 1000,
    dur: (e.dDurationMs || 3000) / 1000,
    text: ytDecode(e.segs.map((x) => x.utf8 || "").join("")),
  })).filter((x) => x.text);
}

function ytParseXml(xml) {
  const out = [];
  // Format srv1 : <text start="1.2" dur="3.4">…</text>
  for (const m of String(xml).matchAll(/<text[^>]*?start="([\d.]+)"(?:[^>]*?dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) {
    const text = ytDecode(m[3]);
    if (text) out.push({ start: parseFloat(m[1]) || 0, dur: parseFloat(m[2]) || 3, text });
  }
  if (out.length) return out;
  // Format srv3 : <p t="1200" d="3400">…</p>
  for (const m of String(xml).matchAll(/<p[^>]*?\bt="(\d+)"(?:[^>]*?\bd="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = ytDecode(m[3]);
    if (text) out.push({ start: (parseInt(m[1], 10) || 0) / 1000, dur: (parseInt(m[2], 10) || 3000) / 1000, text });
  }
  return out;
}

function ytOrderTracks(tracks) {
  const en = tracks.filter((t) => /^en/i.test(t.languageCode || ""));
  const seen = new Set();
  return [...en.filter((t) => t.kind !== "asr"), ...en, ...tracks].filter((t) => {
    const k = t.baseUrl;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function ytDownloadTrack(track, ua) {
  const base = String(track.baseUrl || "").replace(/\\u0026/g, "&").replace(/&fmt=[^&]*/g, "");
  if (!base) return [];
  const headers = { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" };
  try {
    const r = await fetch(base + "&fmt=json3", { headers });
    if (r.ok) {
      const txt = await r.text();
      if (txt) {
        try { const segs = ytParseJson3(JSON.parse(txt)); if (segs.length) return segs; } catch { /* format XML ? */ }
        const segs = ytParseXml(txt);
        if (segs.length) return segs;
      }
    }
  } catch { /* format suivant */ }
  try {
    const r = await fetch(base, { headers });
    if (r.ok) return ytParseXml(await r.text());
  } catch { /* rien */ }
  return [];
}

async function ytGetVisitorData() {
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/visitor_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Youtube-Client-Name": "1",
        "X-Youtube-Client-Version": "2.20241001.01.00",
        "Origin": "https://www.youtube.com",
      },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20241001.01.00" } } }),
    });
    const j = await res.json().catch(() => null);
    return j?.responseContext?.visitorData || "";
  } catch {
    return "";
  }
}

async function ytFromPlainDarkness(videoId) {
  try {
    const r = await fetch(`https://plain-darkness-f42c.elhadjimalicksy18.workers.dev?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const transcript = j?.transcript;
    if (typeof transcript === "string" && transcript.trim().length >= 40) {
      const parts = transcript.split(/(?:>>|\n+)/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
      let curTime = 0;
      const segments = parts.map((part) => {
        const words = part.split(/\s+/).length;
        const dur = Math.max(2, Math.min(10, Math.round((words / 2.5) * 10) / 10));
        const seg = { start: curTime, dur, text: ytDecode(part) };
        curTime = Math.round((curTime + dur + 0.2) * 10) / 10;
        return seg;
      });
      return { segments, lang: "en", auto: true, source: "SUPADATA_FALLBACK" };
    }
  } catch {
    // fallback failed
  }
  return null;
}

async function ytTracksFromClient(videoId, c, visitorData, apiKey = "") {
  const clientObj = { ...c.client };
  if (visitorData) clientObj.visitorData = visitorData;
  const body = { videoId, context: { client: clientObj }, contentCheckOk: true, racyCheckOk: true };
  if (c.thirdParty) body.context.thirdParty = c.thirdParty;
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": c.ua,
    "X-Youtube-Client-Name": c.header,
    "X-Youtube-Client-Version": c.client.clientVersion,
    "Origin": "https://www.youtube.com",
  };
  if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;
  const endpoint = apiKey ? `https://www.youtube.com/youtubei/v1/player?key=${apiKey}` : "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
  const r = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  return {
    status: j?.playabilityStatus?.status || `HTTP ${r.status}`,
    tracks: j?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [],
  };
}

async function ytTracksFromWatchPage(videoId) {
  const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&has_verified=1&bpctr=9999999999`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": "CONSENT=YES+1; SOCS=CAI",
    },
  });
  const html = await r.text();
  const m = html.match(/"captionTracks":(\[.*?\])/);
  if (!m) return { status: /not a bot/i.test(html) ? "BOT_CHECK" : `HTTP ${r.status}`, tracks: [] };
  try { return { status: "OK", tracks: JSON.parse(m[1]) }; } catch { return { status: "PARSE_ERROR", tracks: [] }; }
}

async function handleYouTubeTranscript(url, ctx) {
  const v = (url.searchParams.get("v") || "").replace(/[^\w-]/g, "").slice(0, 11);
  const json = (o, st = 200, cacheable = false) => new Response(JSON.stringify(o), {
    status: st,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheable ? "public, max-age=86400" : "no-store",
    },
  });
  if (v.length !== 11) return json({ error: "missing or invalid v", segments: [], version: YT_TRANSCRIPT_VERSION }, 400);

  const cache = caches.default;
  const cacheKey = new Request(`https://yt-transcript-cache.internal/v${YT_TRANSCRIPT_VERSION}/${v}`, { method: "GET" });
  const fresh = url.searchParams.get("fresh") === "1";
  if (!fresh) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const attempts = [];
  let apiKey = "";
  try {
    const wr = await fetch(`https://www.youtube.com/watch?v=${v}&hl=en`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (wr.ok) {
      const html = await wr.text();
      const km = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || html.match(/INNERTUBE_API_KEY\\":\\"([^\\"]+)\\"/);
      if (km) apiKey = km[1];
    }
  } catch { /* ignore */ }

  const visitorData = await ytGetVisitorData();
  if (visitorData) attempts.push("VISITOR:OK");

  const sources = [
    ...YT_CLIENTS.map((c) => ({ name: c.name, ua: c.ua, get: () => ytTracksFromClient(v, c, visitorData, apiKey) })),
    { name: "WATCH", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36", get: () => ytTracksFromWatchPage(v) },
  ];
  for (const src of sources) {
    try {
      const { status, tracks } = await src.get();
      attempts.push(`${src.name}:${status}:${tracks.length}`);
      for (const track of ytOrderTracks(tracks).slice(0, 3)) {
        const segments = await ytDownloadTrack(track, src.ua);
        if (segments.length) {
          const res = json({
            segments,
            lang: track.languageCode,
            auto: track.kind === "asr",
            source: src.name,
            version: YT_TRANSCRIPT_VERSION,
          }, 200, true);
          ctx.waitUntil(cache.put(cacheKey, res.clone()));
          return res;
        }
        attempts.push(`${src.name}:track-${track.languageCode}-empty`);
      }
    } catch (err) {
      attempts.push(`${src.name}:error:${String(err?.message || err).slice(0, 80)}`);
    }
  }

  // Fallback haute fiabilité sur plain-darkness (Supadata) si YouTube bloque l'Edge
  const fallback = await ytFromPlainDarkness(v);
  if (fallback && fallback.segments?.length) {
    const res = json({
      segments: fallback.segments,
      lang: fallback.lang,
      auto: fallback.auto,
      source: fallback.source,
      version: YT_TRANSCRIPT_VERSION,
      attempts,
    }, 200, true);
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  return json({ segments: [], attempts, version: YT_TRANSCRIPT_VERSION });
}

function checkOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(origin)) {
    return false;
  }
  return true;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);

    // 🎟️ 0.1 Délivrance de token LiveKit sécurisé (POST /livekit/token)
    if (url.pathname === "/livekit/token" && request.method === "POST") {
      if (!checkOrigin(request, env)) {
        return new Response("Origine refusée", { status: 403, headers: CORS_HEADERS });
      }
      try {
        const payload = await request.json().catch(() => ({}));
        const apiKey = env.LIVEKIT_API_KEY || env.VITE_LIVEKIT_API_KEY;
        const apiSecret = env.LIVEKIT_API_SECRET || env.VITE_LIVEKIT_API_SECRET;
        if (!apiKey || !apiSecret) {
          return new Response(JSON.stringify({ error: "LiveKit non configuré côté Worker" }), {
            status: 503,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        const token = await signLiveKitJwt(apiKey, apiSecret, payload);
        return new Response(JSON.stringify({ token }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // 🎬 0.15 Sous-titres YouTube (GET /yt/transcript?v=ID) — manuel EN > auto EN > autre
    // Plusieurs clients YouTube sont essayés (ANDROID → IOS → TV embarqué → page watch),
    // et les résultats non vides sont mis en cache 24 h sur l'edge.
    // 📰 0.14 Extraction d'article côté serveur (GET /article?url=...)
    if (url.pathname === "/article") {
      return handleArticle(url, env, ctx, CORS_HEADERS);
    }
    if (url.pathname === "/yt/transcript") {
      return handleYouTubeTranscript(url, ctx);
    }
    // 🎙️ 0.2 Relais de transcription audio Groq Whisper (POST /ai/transcribe)
    if (url.pathname === "/ai/transcribe" && request.method === "POST") {
      if (!checkOrigin(request, env)) {
        return new Response("Origine refusée", { status: 403, headers: CORS_HEADERS });
      }
      const rawKeys = env.GROQ_KEYS || env.VITE_GROQ_API_KEY || "";
      const keys = String(rawKeys).split(",").map((k) => k.trim()).filter(Boolean);
      if (!keys.length) {
        return new Response(JSON.stringify({ error: "Clés Groq indisponibles" }), {
          status: 503,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      const chosenKey = keys[Math.floor(Math.random() * keys.length)];
      try {
        const formData = await request.formData();
        const upstream = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${chosenKey}` },
          body: formData,
        });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { ...CORS_HEADERS, "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // 💎 0.3 Relais Google Gemini (POST /ai/gemini)
    if (url.pathname.startsWith("/ai/gemini") && request.method === "POST") {
      if (!checkOrigin(request, env)) {
        return new Response("Origine refusée", { status: 403, headers: CORS_HEADERS });
      }
      const rawKeys = env.GEMINI_KEYS || env.VITE_GEMINI_API_KEY || env.VITE_GEMINI_API_KEY_1 || "";
      const keys = String(rawKeys).split(",").map((k) => k.trim()).filter(Boolean);
      if (!keys.length) {
        return new Response(JSON.stringify({ error: "Clés Gemini indisponibles" }), {
          status: 503,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      const model = url.searchParams.get("model") || env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
      const chosenKey = keys[Math.floor(Math.random() * keys.length)];
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(chosenKey)}`;
      const body = await request.text();
      try {
        const upstream = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { ...CORS_HEADERS, "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // 🔐 0.4 Relais IA Chat / Completions : les clés restent côté Worker
    if (url.pathname.startsWith("/ai/") && request.method === "POST") {
      if (!checkOrigin(request, env)) {
        return new Response("Origine refusée", { status: 403, headers: CORS_HEADERS });
      }

      const AI = {
        groq: ["https://api.groq.com/openai/v1/chat/completions", env.GROQ_KEYS || env.VITE_GROQ_API_KEY],
        cerebras: ["https://api.cerebras.ai/v1/chat/completions", env.CEREBRAS_KEYS || env.VITE_CEREBRAS_API_KEY],
        mistral: ["https://api.mistral.ai/v1/chat/completions", env.MISTRAL_KEYS || env.VITE_MISTRAL_API_KEY],
        or: ["https://openrouter.ai/api/v1/chat/completions", env.OPENROUTER_KEYS || env.VITE_OPENROUTER_API_KEY],
        fireworks: ["https://api.fireworks.ai/inference/v1/chat/completions", env.FIREWORKS_KEYS || env.VITE_FIREWORKS_API_KEY],
        cohere: ["https://api.cohere.com/v2/chat", env.COHERE_KEYS || env.VITE_COHERE_API_KEY],
        sambanova: ["https://api.sambanova.ai/v1/chat/completions", env.SAMBANOVA_KEYS || env.VITE_SAMBANOVA_API_KEY],
        aimlapi: ["https://api.aimlapi.com/v1/chat/completions", env.AIMLAPI_KEYS || env.VITE_AIMLAPI_API_KEY || env.VITE_AIML_API_KEY],
        deepseek: ["https://api.deepseek.com/chat/completions", env.DEEPSEEK_KEYS || env.VITE_DEEPSEEK_API_KEY],
      };

      const provider = url.pathname.slice(4);
      const entry = AI[provider];
      const keys = String(entry?.[1] || "").split(",").map((k) => k.trim()).filter(Boolean);
      if (!entry || !keys.length) return new Response("Fournisseur indisponible", { status: 404, headers: CORS_HEADERS });
      
      const body = await request.text();
      if (body.length > 500000) return new Response("Requête trop lourde", { status: 413, headers: CORS_HEADERS });
      
      const start = Math.floor(Math.random() * keys.length);
      let last;
      for (let i = 0; i < Math.min(3, keys.length); i++) {
        last = await fetch(entry[0], {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keys[(start + i) % keys.length]}`,
          },
          body,
        });
        if (last.status !== 429 && last.status !== 401) break;
      }
      return new Response(last.body, {
        status: last.status,
        headers: { ...CORS_HEADERS, "Content-Type": last.headers.get("Content-Type") || "application/json" },
      });
    }

    // 🚀 1.1 Endpoint /news-ready.json : Pré-calcul < 1s (KV / Edge Cache)
    if (url.pathname === "/news-ready.json") {
      if (env.NEWS_KV) {
        try {
          const stored = await env.NEWS_KV.get("news-ready", "json");
          if (stored && Array.isArray(stored.items) && stored.items.length > 0) {
            return new Response(JSON.stringify(stored), {
              headers: {
                ...CORS_HEADERS,
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "public, max-age=900",
              },
            });
          }
        } catch { /* fallback to cache/generation */ }
      }

      const cache = caches.default;
      const cacheKey = new Request("https://edge-rss-cache.internal/news-ready.json", { method: "GET" });
      let cached = await cache.match(cacheKey);
      if (cached) return cached;

      const items = await aggregateFeeds();
      const readyData = { items, ts: Date.now(), count: items.length, ready: true };
      const response = new Response(JSON.stringify(readyData), {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900",
        },
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // 🚀 1.2 Endpoint /feed.json : Agrégation Edge ultra-rapide pré-mise en cache
    if (url.pathname === "/feed.json" || url.searchParams.get("feed") === "tech") {
      const cache = caches.default;
      const cacheKey = new Request("https://edge-rss-cache.internal/feed.json", { method: "GET" });
      let cached = await cache.match(cacheKey);
      if (cached) return cached;

      const items = await aggregateFeeds();
      const response = new Response(JSON.stringify({ items, ts: Date.now(), count: items.length }), {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900",
        },
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // 🔍 2. Proxy d'URL transparent pour articles complets (?url=...)
    const target = url.searchParams.get("url");
    if (!target) {
      if (/\.(woff2?|ttf|otf|eot|css|png|jpe?g|svg|webp|ico)(\?.*)?$/i.test(url.pathname)) {
        return new Response(null, {
          status: 404,
          headers: CORS_HEADERS,
        });
      }
      return new Response("Missing url query parameter", {
        status: 400,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    try {
      const cache = caches.default;
      const cacheKey = new Request(target, { method: "GET" });
      let response = await cache.match(cacheKey);

      if (!response) {
        const upstream = await fetch(target, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*",
          },
          cf: { cacheTtl: 600, cacheEverything: true },
        });

        const newHeaders = new Headers(upstream.headers);
        newHeaders.set("Access-Control-Allow-Origin", "*");
        newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        newHeaders.set("Cache-Control", "public, max-age=600");

        response = new Response(upstream.body, {
          status: upstream.status,
          headers: newHeaders,
        });

        if (upstream.status === 200) {
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }
      }

      return response;
    } catch (err) {
      return new Response(err.message || "Proxy error", {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
  },

  // ⏰ 3. Tâche planifiée automatique (Cloudflare Cron Triggers)
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const cache = caches.default;
      const items = await aggregateFeeds();
      const readyData = { items, ts: Date.now(), count: items.length, ready: true };

      // Cache /feed.json
      const feedCacheKey = new Request("https://edge-rss-cache.internal/feed.json", { method: "GET" });
      const feedResponse = new Response(JSON.stringify({ items, ts: Date.now(), count: items.length }), {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900",
        },
      });
      await cache.put(feedCacheKey, feedResponse);

      // Cache /news-ready.json
      const readyCacheKey = new Request("https://edge-rss-cache.internal/news-ready.json", { method: "GET" });
      const readyResponse = new Response(JSON.stringify(readyData), {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900",
        },
      });
      await cache.put(readyCacheKey, readyResponse);

      // KV store si configuré
      if (env.NEWS_KV) {
        try {
          await env.NEWS_KV.put("news-ready", JSON.stringify(readyData), { expirationTtl: 3600 });
        } catch { /* best effort */ }
      }
    })());
  },
};
