// 📰 GET /article?url=...  — extraction serveur gratuite, sans dépendance.
// 1) répare le lien (Google News, paramètres de suivi)  2) récupère la page en se présentant
// comme un navigateur  3) lance en parallèle : JSON-LD articleBody, extracteur "densité"
// (type Defuddle) et extracteur "Readability-like" ; garde le meilleur
// 4) page vide → AMP, Jina Reader (clé JINA_API_KEY optionnelle), archive.org
// 5) cache edge 24 h.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const HDRS = { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" };
const TRACK = /^(utm_|fbclid|gclid|mc_|igshid|ref$|ref_src|cmpid|xtor|at_medium|at_campaign|ocid|sr_share)/i;
const MIN = 600;

const decode = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const strip = (h) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function cleanUrl(raw) {
  const u = new URL(raw);
  for (const k of [...u.searchParams.keys()]) if (TRACK.test(k)) u.searchParams.delete(k);
  u.hash = "";
  return u.toString();
}

async function fetchHtml(url, ms = 8000) {
  const r = await fetch(url, { headers: HDRS, redirect: "follow", signal: AbortSignal.timeout(ms), cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { html: await r.text(), finalUrl: r.url || url };
}

async function resolveGoogleNews(url) {
  const u = new URL(url);
  if (!/news\.google\./.test(u.hostname)) return url;
  // Ancien format : base64 contenant l'URL en clair
  const id = u.pathname.split("/").pop();
  try {
    const bin = atob(id.replace(/-/g, "+").replace(/_/g, "/"));
    const m = bin.match(/https?:\/\/[\x21-\x7e]+/);
    if (m && !m[0].includes("AU_yqL")) return m[0];
  } catch {}
  // Nouveau format : on suit la page, puis on cherche l'URL réelle dans le HTML
  try {
    const { html, finalUrl } = await fetchHtml(url, 6000);
    if (!/news\.google\./.test(new URL(finalUrl).hostname)) return finalUrl;
    const m = html.match(/data-n-au="([^"]+)"/) || html.match(/<a[^>]+href="(https?:\/\/(?!news\.google)[^"]+)"/);
    if (m) return decode(m[1]);
  } catch {}
  return url;
}

function meta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i");
  const m = html.match(re) || html.match(re2);
  return m ? decode(m[1]).trim() : "";
}

function fromJsonLd(html) {
  let best = "";
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (typeof o.articleBody === "string" && o.articleBody.length > best.length) best = o.articleBody;
        for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
      };
      walk(JSON.parse(m[1].trim()));
    } catch {}
  }
  best = decode(best.replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").trim();
  return best.split(/\n+|(?<=[.!?»])\s{2,}/).map(s => s.trim()).filter(Boolean).join("\n\n");
}

function prune(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|iframe|form|button|select|template|nav|footer|aside|header|figure)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(div|section|ul|ol)[^>]+(class|id)=["'][^"']*(cookie|consent|newsletter|share|social|related|comment|promo|advert|\bad-|banner|subscribe|paywall|breadcrumb|menu|sidebar|footer|outbrain|taboola)[^"']*["'][^>]*>/gi, "<$1 data-junk>");
}

function paragraphs(fragment) {
  const out = [];
  for (const m of fragment.matchAll(/<(p|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = strip(m[2]);
    if (t.length >= (m[1].toLowerCase() === "p" ? 40 : 20) && !/^(lire aussi|à lire|read more|publicité|advertisement|partager|share)/i.test(t)) out.push(t);
  }
  return [...new Set(out)];
}

// Extracteur "Readability-like" : <article>/<main>/itemprop=articleBody prioritaires
function readabilityLike(html) {
  const p = prune(html);
  const zones = [
    /<[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>\s*(?:<\/|$)/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];
  for (const re of zones) {
    const m = p.match(re);
    if (m) { const t = paragraphs(m[1]).join("\n\n"); if (t.length >= MIN) return t; }
  }
  return paragraphs(p).join("\n\n");
}

// Extracteur "densité" (inspiré Defuddle) : garde le bloc contenant le plus de texte en <p>
function densityExtract(html) {
  const p = prune(html);
  const blocks = p.split(/<(?:div|section|article)[^>]*>/i);
  let best = [], score = 0;
  for (let i = 0; i < blocks.length; i++) {
    const win = blocks.slice(i, i + 6).join(" ");
    if (/data-junk/.test(blocks[i])) continue;
    const ps = paragraphs(win);
    const s = ps.reduce((a, t) => a + t.length - (t.match(/\|/g) || []).length * 30, 0);
    if (s > score) { score = s; best = ps; }
  }
  return best.join("\n\n");
}

const quality = (t) => !t ? 0 : t.length - (t.match(/cookie|abonn|subscribe|newsletter|javascript/gi) || []).length * 300;

function pickBest(html) {
  const c = [
    ["jsonld", fromJsonLd(html)],
    ["density", densityExtract(html)],
    ["readability", readabilityLike(html)],
  ];
  // JSON-LD prioritaire s'il est complet (propre, fourni par le site)
  if (c[0][1].length >= MIN) return { text: c[0][1], method: "jsonld" };
  c.sort((a, b) => quality(b[1]) - quality(a[1]));
  return { text: c[0][1], method: c[0][0] };
}

async function viaJina(url, env) {
  const h = { "Accept": "text/plain", "X-Return-Format": "text" };
  if (env.JINA_API_KEY) h.Authorization = `Bearer ${env.JINA_API_KEY}`;
  const r = await fetch(`https://r.jina.ai/${url}`, { headers: h, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`jina ${r.status}`);
  const t = (await r.text()).replace(/^[\s\S]*?Markdown Content:\n/, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  return t.split(/\n+/).map(s => s.replace(/^[#*\-\s]+/, "").trim()).filter(s => s.length > 60 && !/^(menu|recherche|s.abonner|se connecter)/i.test(s)).join("\n\n");
}

async function viaArchive(url) {
  const r = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
  const snap = (await r.json())?.archived_snapshots?.closest;
  if (!snap?.available) throw new Error("no snapshot");
  const raw = snap.url.replace(/\/web\/(\d+)\//, "/web/$1id_/");
  return pickBest((await fetchHtml(raw, 10000)).html).text;
}

export async function handleArticle(reqUrl, env, ctx, CORS) {
  const json = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extra } });
  const target = reqUrl.searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) return json({ error: "Paramètre url manquant" }, 400);

  const cache = caches.default;
  const key = new Request(`https://cache.local/article?u=${encodeURIComponent(target)}`);
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), "X-Cache": "HIT" } });

  const attempts = [];
  let url = target, title = "", image = "", text = "", method = "";
  try { url = cleanUrl(await resolveGoogleNews(target)); } catch {}

  try {
    const { html, finalUrl } = await fetchHtml(url);
    url = finalUrl;
    title = meta(html, "og:title") || strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    image = meta(html, "og:image");
    ({ text, method } = pickBest(html));
    attempts.push({ step: method, len: text.length });
    if (text.length < MIN) {
      const amp = (html.match(/<link[^>]+rel=["']amphtml["'][^>]*href=["']([^"']+)["']/i) || [])[1];
      if (amp) {
        try {
          const a = pickBest((await fetchHtml(new URL(decode(amp), url).toString(), 6000)).html);
          attempts.push({ step: "amp", len: a.text.length });
          if (a.text.length > text.length) { text = a.text; method = "amp"; }
        } catch (e) { attempts.push({ step: "amp", error: e.message }); }
      }
    }
  } catch (e) {
    attempts.push({ step: "direct", error: e.message });
    if (/HTTP 40[4]|HTTP 410/.test(e.message)) return json({ ok: false, url, error: "Article introuvable", attempts }, 404);
  }

  for (const [name, fn] of [["jina", () => viaJina(url, env)], ["archive", () => viaArchive(url)]]) {
    if (text.length >= MIN) break;
    try {
      const t = await fn();
      attempts.push({ step: name, len: t.length });
      if (t.length > text.length) { text = t; method = name; }
    } catch (e) { attempts.push({ step: name, error: e.message }); }
  }

  const ok = text.length >= 200;
  const res = json({ ok, url, title, image, method, text, attempts }, ok ? 200 : 422, { "Cache-Control": "public, max-age=86400" });
  if (ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
