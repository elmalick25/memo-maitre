// 📰 articleExtractor.js — Récupération + extraction lisible d'articles web
// Inspiré de Mozilla Readability (version allégée, sans dépendance) + chaîne
// de proxies CORS résiliente avec détection d'erreurs (Jina 401, AllOrigins
// vide, HTML d'erreur, etc.). Tout est conçu pour fonctionner depuis le
// navigateur, sans backend, avec mise en cache IndexedDB côté appelant.

// ─── 1) Chaîne de proxies CORS ──────────────────────────────────────────────
// Ordre choisi pour MAXIMISER les chances de succès :
//   - corsproxy.io et allorigins renvoient le HTML brut (meilleur pour Readability)
//   - r.jina.ai renvoie du Markdown nettoyé (excellent fallback même si HTML KO)
//   - Jina est mis EN DERNIER car il bloque souvent les ASN datacenter (401)
const PROXIES = [
  { name: "corsproxy", build: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`, kind: "html" },
  { name: "allorigins-raw", build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, kind: "html" },
  { name: "allorigins", build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, kind: "allorigins-json" },
  { name: "codetabs", build: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`, kind: "html" },
  { name: "jina-reader", build: (u) => `https://r.jina.ai/${u}`, kind: "markdown" },
];

// Détecte les enveloppes d'erreur renvoyées en 200 (Jina renvoie du JSON
// d'erreur avec un code 401/403 dans le corps, AllOrigins peut renvoyer "").
function looksLikeProxyError(text) {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 80) return true;
  if (t.startsWith("{") && /"(code|status)"\s*:\s*4\d\d/.test(t)) return true;
  if (/AuthenticationRequiredError|blocked from performing|bad network reputation/i.test(t)) return true;
  if (/^\s*<!doctype html[^>]*>\s*<html[^>]*>\s*<head>[^<]*<title>\s*(403|401|429|5\d\d|error)/i.test(t)) return true;
  return false;
}

async function fetchWithTimeout(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Récupère le contenu via la chaîne de proxies. Renvoie { kind, body, proxy }.
export async function fetchViaProxies(url, { timeoutMs = 15000 } = {}) {
  const errors = [];
  for (const p of PROXIES) {
    try {
      const proxiedUrl = p.build(url);
      const res = await fetchWithTimeout(proxiedUrl, timeoutMs);
      if (!res.ok) { errors.push(`${p.name}:HTTP${res.status}`); continue; }
      let body;
      if (p.kind === "allorigins-json") {
        const data = await res.json().catch(() => null);
        body = data?.contents || "";
      } else {
        body = await res.text();
      }
      if (looksLikeProxyError(body)) { errors.push(`${p.name}:error-envelope`); continue; }
      return { kind: p.kind === "markdown" ? "markdown" : "html", body, proxy: p.name };
    } catch (e) {
      errors.push(`${p.name}:${e?.name || "ERR"}`);
    }
  }
  const err = new Error(`All proxies failed: ${errors.join(" | ")}`);
  err.attempts = errors;
  throw err;
}

// ─── 2) Extraction "Readability-lite" ───────────────────────────────────────
// Score chaque conteneur potentiel en fonction de la densité de texte et de
// la présence de paragraphes "vrais", ignore nav/footer/aside/scripts.
const NEGATIVE_RE = /comment|meta|footer|footnote|share|social|newsletter|breadcrumb|advert|promo|sponsor|related|popup|cookie|consent|paywall|sidebar|nav|menu/i;
const POSITIVE_RE = /article|content|post|story|entry|main|body|page|text/i;

function cleanDoc(doc) {
  const trash = doc.querySelectorAll(
    "script, style, noscript, iframe, svg, canvas, form, button, " +
    "nav, footer, aside, header, " +
    '[role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], ' +
    ".advert, .ads, .ad, .share, .social, .newsletter, .cookie, .consent, .paywall, .related, .breadcrumb"
  );
  trash.forEach((n) => n.remove());
}

function scoreNode(node) {
  const ps = node.querySelectorAll("p");
  if (ps.length === 0) return 0;
  let textLen = 0;
  ps.forEach((p) => { textLen += (p.textContent || "").trim().length; });
  let score = textLen + ps.length * 25;
  const cls = `${node.className || ""} ${node.id || ""}`;
  if (POSITIVE_RE.test(cls)) score += 200;
  if (NEGATIVE_RE.test(cls)) score -= 300;
  // bonus structurel
  if (node.tagName === "ARTICLE") score += 250;
  if (node.tagName === "MAIN") score += 150;
  return score;
}

function pickBest(doc) {
  const candidates = doc.querySelectorAll("article, main, section, div");
  let best = null;
  let bestScore = 0;
  candidates.forEach((c) => {
    const s = scoreNode(c);
    if (s > bestScore) { bestScore = s; best = c; }
  });
  return best;
}

function nodeToParagraphs(node) {
  if (!node) return [];
  const out = [];
  const blocks = node.querySelectorAll("h1, h2, h3, h4, p, li, blockquote");
  blocks.forEach((b) => {
    const txt = (b.textContent || "").replace(/\s+/g, " ").trim();
    if (txt.length < 30) return;
    // skip duplicate consecutive
    if (out.length && out[out.length - 1] === txt) return;
    out.push(txt);
  });
  return out;
}

// Détecte les textes parasites : bandeaux cookies, mentions RGPD, bannières d'abonnement / paywalls, newsletter
export const BOILERPLATE_PATTERNS = [
  /cookies?/i,
  /traceurs?/i,
  /partenaires/i,
  /donn[ée]es personnelles/i,
  /personnalisation publicitaire/i,
  /consentement/i,
  /politique de confidentialit[ée]/i,
  /mentions l[ée]gales/i,
  /abonnez-vous/i,
  /abonnement/i,
  /soutenez (notre|le) (m[ée]dia|club|journalisme|travail)/i,
  /pour p[ée]renniser (son|notre) mod[èe]le/i,
  /d[ée]fend une information/i,
  /vous avez lu gratuitement/i,
  /article r[ée]serv[ée] aux abonn[ée]s/i,
  /inscrivez-vous (à|a) la newsletter/i,
  /tous droits r[ée]serv[ée]s/i,
  /privacy policy/i,
  /terms of service/i,
  /subscribe to/i,
  /all rights reserved/i,
];

export function isBoilerplateOrConsentText(str) {
  if (!str || typeof str !== "string") return false;
  const s = str.trim();
  if (s.length < 15) return false;
  let matchCount = 0;
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(s)) matchCount++;
  }
  if (matchCount >= 2) return true;
  if (/accept(er)? (l'utilisation de |les )?cookies/i.test(s)) return true;
  if (/traiter vos donn[ée]es personnelles/i.test(s)) return true;
  if (/pour p[ée]renniser (son|notre) mod[èe]le/i.test(s)) return true;
  if (/abonnement .*? sans publicit[ée]/i.test(s)) return true;
  if (/article r[ée]serv[ée] aux abonn[ée]s/i.test(s)) return true;
  if (/accepter et fermer|param[ée]trer les cookies/i.test(s)) return true;
  return false;
}

export function sanitizeArticleText(text) {
  if (!text) return "";
  const paragraphs = text.split(/\n\n+/);
  const cleanParas = paragraphs.filter(p => {
    const trimmed = p.trim();
    if (trimmed.length < 30) return false;
    return !isBoilerplateOrConsentText(trimmed);
  });
  return cleanParas.join("\n\n").trim();
}

// Extrait un texte lisible depuis du HTML brut. Retourne string vide si échec.
export function extractReadableFromHtml(html) {
  if (!html) return "";
  try {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      cleanDoc(doc);
      const best = pickBest(doc) || doc.body;
      let paras = nodeToParagraphs(best);
      if (paras.join(" ").length < 400) {
        // fallback : tout le body
        paras = nodeToParagraphs(doc.body);
      }
      return sanitizeArticleText(paras.join("\n\n"));
    }
  } catch {}

  // Fallback regex pour Node / SSR / Worker sans DOMParser
  try {
    const stripped = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, "")
      .replace(/<div\b[^>]*class=["'][^"']*(?:ads?|share|social|cookie|consent|paywall)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    return sanitizeArticleText(stripped);
  } catch {
    return "";
  }
}

// Extrait du texte propre depuis le Markdown que renvoie Jina Reader.
export function extractReadableFromMarkdown(md) {
  if (!md) return "";
  // Jina préfixe parfois par "Title: ...\nURL Source: ...\nMarkdown Content:\n"
  const idx = md.indexOf("Markdown Content:");
  const body = idx >= 0 ? md.slice(idx + "Markdown Content:".length) : md;
  const rawClean = body
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")     // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // liens -> texte
    .replace(/^#+\s+/gm, "")                  // titres markdown
    .replace(/[*_`>]/g, "")                   // emphases/blockquote markers
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return sanitizeArticleText(rawClean);
}

// API publique : récupère + extrait. Renvoie { text, source, html }.
export async function fetchReadableArticle(url, opts = {}) {
  const { kind, body, proxy } = await fetchViaProxies(url, opts);
  let text = "";
  if (kind === "markdown") {
    text = extractReadableFromMarkdown(body);
  } else {
    text = extractReadableFromHtml(body);
    if (text.length < 400) {
      // dernière chance : interpréter comme markdown si l'HTML donne peu
      const alt = extractReadableFromMarkdown(body);
      if (alt.length > text.length) text = alt;
    }
  }
  return { text, source: proxy, kind };
}
