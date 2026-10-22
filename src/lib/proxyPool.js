/**
 * proxyPool.js — Pool résilient de 20+ proxies gratuits pour le scraping RSS,
 * l'extraction d'articles et la traduction automatique.
 *
 * Fonctionnalités clés :
 * - Détection automatique et mise en quarantaine immédiate sur 429 (Too Many Requests) et 403 (Forbidden).
 * - Rotation automatique vers le proxy suivant disponible sans bloquer l'UI.
 * - Circuit breaker intelligent avec délais de récupération progressifs.
 */

const CUSTOM_PROXY = (typeof import.meta !== "undefined" && (import.meta.env?.VITE_PROXY_URL || import.meta.env?.VITE_AI_PROXY_URL)) || "https://memomasterproxy.elmalick25formcybersecu.workers.dev";
const IS_DEV = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

// ─── ÉTAT DU CIRCUIT BREAKER ──────────────────────────────────────────────────
const _cooldowns = new Map(); // name -> timestamp ms
const _failCounts = new Map(); // name -> consecutive fails

export function isProxyCoolingDown(name) {
  const until = _cooldowns.get(name);
  return typeof until === "number" && Date.now() < until;
}

export function markProxyCooldown(name, ms = 45000) {
  const count = (_failCounts.get(name) || 0) + 1;
  _failCounts.set(name, count);
  // Backoff progressif si échecs répétés (max 5 minutes)
  const penalty = Math.min(ms * Math.min(count, 4), 300_000);
  _cooldowns.set(name, Date.now() + penalty);
}

export function markProxySuccess(name) {
  _failCounts.delete(name);
}

// ─── 1. POOL DE 12+ PROXIES CORS POUR FLUX RSS & SCRAPING HTML ────────────────
export const RSS_CORS_PROXIES = [
  // Priorité 1 : Proxy Worker dédié (si configuré)
  ...(CUSTOM_PROXY ? [{
    name: "worker-custom",
    type: "raw",
    build: (u) => `${CUSTOM_PROXY.replace(/\/+$/, "")}?url=${encodeURIComponent(u)}`,
    timeout: 8000
  }] : []),

  // Priorité 2 : Proxy local Node Vite (en Dev uniquement)
  ...(IS_DEV ? [{
    name: "local-dev-proxy",
    type: "raw",
    build: (u) => `/api/proxy?url=${encodeURIComponent(u)}`,
    timeout: 6000
  }] : []),

  // 1. CodeTabs CORS Proxy
  {
    name: "codetabs",
    type: "raw",
    build: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
    timeout: 7000
  },


  // 3. AllOrigins (Raw text)
  {
    name: "allorigins-raw",
    type: "raw",
    build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    timeout: 8000
  },

  // 4. AllOrigins (JSON wrapper)
  {
    name: "allorigins-json",
    type: "allorigins-json",
    build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    timeout: 8000
  },

  // 5. ThingProxy (Freeboard)
  {
    name: "thingproxy",
    type: "raw",
    build: (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
    timeout: 7000
  },

  // 6. CorsProxy.org
  {
    name: "corsproxy-org",
    type: "raw",
    build: (u) => `https://corsproxy.org/?url=${encodeURIComponent(u)}`,
    timeout: 7000
  },

  // 7. WhateverOrigin (JSON wrapper)
  {
    name: "whateverorigin",
    type: "whateverorigin-json",
    build: (u) => `https://whateverorigin.org/get?url=${encodeURIComponent(u)}`,
    timeout: 8000
  },

  // 8. Yacdn Proxy
  {
    name: "yacdn",
    type: "raw",
    build: (u) => `https://yacdn.org/proxy/${u}`,
    timeout: 7000
  },

  // 9. Proxy.cors.sh
  {
    name: "proxy-cors-sh",
    type: "raw",
    build: (u) => `https://proxy.cors.sh/${u}`,
    timeout: 7000
  },

  // 10. rss2json (Transforme un flux RSS en JSON puis reconstitue le XML)
  {
    name: "rss2json",
    type: "rss2json",
    build: (u) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}`,
    timeout: 7000
  },

  // 11. Feed2json (Transforme un flux RSS en JSON Feed)
  {
    name: "feed2json",
    type: "feed2json",
    build: (u) => `https://feed2json.org/convert?url=${encodeURIComponent(u)}`,
    timeout: 7000
  }
];

// ─── 2. POOL DE PROXIES POUR EXTRACTION D'ARTICLES ET CONTENU ÉPURÉ ───────────
export const ARTICLE_READER_PROXIES = [
  // Priorité 1 : Worker Cloudflare dédié
  ...(CUSTOM_PROXY ? [{
    name: "worker-article-proxy",
    kind: "html",
    build: (u) => `${CUSTOM_PROXY.replace(/\/+$/, "")}?url=${encodeURIComponent(u)}`,
    timeout: 10000
  }] : []),

  // Priorité 2 : Local Dev Proxy
  ...(IS_DEV ? [{
    name: "local-article-proxy",
    kind: "html",
    build: (u) => `/api/proxy?url=${encodeURIComponent(u)}`,
    timeout: 8000
  }] : []),

  // Jina Reader Officiel (Markdown haute fidélité)
  {
    name: "jina-reader",
    kind: "markdown",
    build: (u) => `https://r.jina.ai/${u}`,
    timeout: 9000
  },

  // Jina Mirror 2 (Search & Read)
  {
    name: "jina-mirror-s",
    kind: "markdown",
    build: (u) => `https://s.jina.ai/${u}`,
    timeout: 9000
  },

  // Jina encapsulé via CodeTabs (évite les 429 liés à l'IP client navigateur)
  {
    name: "codetabs-jina",
    kind: "markdown",
    build: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(`https://r.jina.ai/${u}`)}`,
    timeout: 9000
  },

  // CodeTabs direct HTML
  {
    name: "codetabs-html",
    kind: "html",
    build: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
    timeout: 8000
  },

  // AllOrigins Raw
  {
    name: "allorigins-raw-article",
    kind: "html",
    build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    timeout: 9000
  },

  // AllOrigins JSON
  {
    name: "allorigins-json-article",
    kind: "allorigins-json",
    build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    timeout: 9000
  }
];

// ─── 3. POOL DE MIROIRS DE TRADUCTION SANS BLOCAGE CORS ───────────────────────
export const TRANSLATION_PROXIES = [
  // 1. Google Translate GTX via CodeTabs
  {
    name: "gtx-via-codetabs",
    translate: async (text, signal) => {
      const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(text)}`;
      const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(gtxUrl)}`;
      const res = await fetch(proxyUrl, { signal: signal || AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data?.[0])) {
        return data[0].map(p => p?.[0] || "").join("").trim();
      }
      return "";
    }
  },


  // 3. Google Translate GTX via AllOrigins
  {
    name: "gtx-via-allorigins",
    translate: async (text, signal) => {
      const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(text)}`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(gtxUrl)}`;
      const res = await fetch(proxyUrl, { signal: signal || AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data?.[0])) {
        return data[0].map(p => p?.[0] || "").join("").trim();
      }
      return "";
    }
  },

  // 4. MyMemory via CodeTabs (pour textes courts/moyens)
  {
    name: "mymemory-via-proxy",
    translate: async (text, signal) => {
      if (text.length > 500) throw new Error("Text too long for MyMemory");
      const targetUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|fr`;
      const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { signal: signal || AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const match = data?.responseData?.translatedText;
      return (match && !/MYMEMORY WARNING/i.test(match)) ? match.trim() : "";
    }
  },


  // 6. Lingva Garuda via CodeTabs (textes courts uniquement < 280 chars pour éviter 500)
  {
    name: "lingva-garuda-cors",
    translate: async (text, signal) => {
      if (text.length > 280) throw new Error("Text too long for Lingva GET");
      const target = `https://lingva.garudalinux.org/api/v1/en/fr/${encodeURIComponent(text)}`;
      const url = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(target)}`;
      const res = await fetch(url, { signal: signal || AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data?.translation || "").trim();
    }
  }
];

// ─── FONCTION UNIFIÉE DE RÉCUPÉRATION RSS AVEC FAILOVER ──────────────────────
export async function fetchRssWithFailover(feedUrl, customTimeout = 7000) {
  const available = RSS_CORS_PROXIES.filter(p => !isProxyCoolingDown(p.name));

  for (const proxy of available) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), proxy.timeout || customTimeout);
    try {
      const proxyUrl = proxy.build(feedUrl);
      const res = await fetch(proxyUrl, {
        signal: ctrl.signal,
        headers: { Accept: "text/xml, application/xml, application/json, text/plain, */*" }
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status === 403) {
        markProxyCooldown(proxy.name, res.status === 429 ? 60000 : 120000);
        continue;
      }
      if (!res.ok) {
        markProxyCooldown(proxy.name, 25000);
        continue;
      }

      let xmlText = "";
      if (proxy.type === "raw") {
        xmlText = await res.text();
      } else if (proxy.type === "allorigins-json") {
        const j = await res.json();
        xmlText = j?.contents || "";
      } else if (proxy.type === "whateverorigin-json") {
        const j = await res.json();
        xmlText = j?.contents || "";
      } else if (proxy.type === "rss2json") {
        const j = await res.json();
        if (j.status === "ok" && Array.isArray(j.items) && j.items.length) {
          const isYT = j.feed?.url?.includes("youtube.com");
          const itemTag = isYT ? "entry" : "item";
          const itemsXml = j.items.map(it => `
            <${itemTag}>
              <title><![CDATA[${it.title || ""}]]></title>
              <link href="${it.link || ""}"><![CDATA[${it.link || ""}]]></link>
              <description><![CDATA[${it.description || it.content || ""}]]></description>
              <pubDate>${it.pubDate || ""}</pubDate>
              <published>${it.pubDate || ""}</published>
            </${itemTag}>
          `).join("");
          xmlText = `<rss><channel>${itemsXml}</channel></rss>`;
        }
      } else if (proxy.type === "feed2json") {
        const j = await res.json();
        if (Array.isArray(j?.items) && j.items.length) {
          const itemsXml = j.items.map(it => `
            <item>
              <title><![CDATA[${it.title || ""}]]></title>
              <link><![CDATA[${it.url || ""}]]></link>
              <description><![CDATA[${it.content_html || it.summary || ""}]]></description>
              <pubDate>${it.date_published || ""}</pubDate>
            </item>
          `).join("");
          xmlText = `<rss><channel>${itemsXml}</channel></rss>`;
        }
      }

      if (xmlText && xmlText.length > 50 && /<(rss|feed|channel|item|entry)\b/i.test(xmlText)) {
        markProxySuccess(proxy.name);
        return xmlText;
      }
    } catch {
      clearTimeout(timer);
      markProxyCooldown(proxy.name, 25000);
    }
  }

  return "";
}

// ─── FONCTION UNIFIÉE DE TRADUCTION AVEC FAILOVER ─────────────────────────────
export async function translateWithFailover(text, signal) {
  const clean = String(text || "").trim();
  if (!clean || clean.length < 3) return clean;

  const available = TRANSLATION_PROXIES.filter(p => !isProxyCoolingDown(p.name));

  for (const proxy of available) {
    try {
      const translated = await proxy.translate(clean, signal);
      if (translated && translated.length > 2 && translated !== clean) {
        markProxySuccess(proxy.name);
        return translated;
      }
    } catch (err) {
      const is429or403 = /429|403|quota|rate/i.test(err?.message || "");
      markProxyCooldown(proxy.name, is429or403 ? 60000 : 30000);
    }
  }

  return "";
}
