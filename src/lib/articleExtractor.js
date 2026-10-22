import { repairFrenchElisions, cleanFrenchTypography } from "./newsTextPresentation.js";

// ─── 1) Chaîne de proxies CORS ──────────────────────────────────────────────
// Ordre choisi pour MAXIMISER les chances de succès :
//   - Cloudflare Worker personnalisé (si VITE_PROXY_URL configuré)
//   - En DEV : proxy local Node ultra-rapide sans CORS ni rate-limit
//   - En PROD : codetabs (HTML) + r.jina.ai (Markdown nettoyé) + allorigins
import {
  ARTICLE_READER_PROXIES as PROXIES,
  isProxyCoolingDown,
  markProxyCooldown,
  markProxySuccess
} from "./proxyPool.js";

export function isUnscrapableUrl(url) {
  if (!url || typeof url !== "string") return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /(?:^|\.)(?:twitter\.com|x\.com|t\.co|instagram\.com|facebook\.com|linkedin\.com|ashbyhq\.com|greenhouse\.io|lever\.co|reddit\.com|youtube\.com|youtu\.be)$/.test(host);
  } catch {
    return true;
  }
}

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

// Récupère le contenu via un proxy avec détection de format et gestion de timeout
async function tryProxy(p, url, timeoutMs, parentSignal) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  parentSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(p.build(url), { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) {
      if (res.status === 403 || res.status === 401 || res.status === 429) {
        markProxyCooldown(p.name, res.status === 429 ? 60_000 : 120_000);
      } else {
        markProxyCooldown(p.name, 30_000);
      }
      throw new Error(`${p.name}:HTTP${res.status}`);
    }
    let body;
    if (p.kind === "allorigins-json") {
      const data = await res.json().catch(() => null);
      body = data?.contents || "";
    } else {
      const buf = await res.arrayBuffer();
      const cType = res.headers.get("content-type") || "";
      let decoded = "";
      if (/iso-8859|windows-1252|latin1/i.test(cType)) {
        try { decoded = new TextDecoder("windows-1252").decode(buf); } catch {}
      }
      if (!decoded) {
        try {
          const testUtf8 = new TextDecoder("utf-8").decode(buf);
          if (testUtf8.includes("\uFFFD") || /<meta[^>]+charset=["']?(iso-8859-1|windows-1252|latin1)/i.test(testUtf8.slice(0, 2500))) {
            decoded = new TextDecoder("windows-1252").decode(buf);
          } else {
            decoded = testUtf8;
          }
        } catch {
          decoded = new TextDecoder("windows-1252").decode(buf);
        }
      }
      body = decoded;
    }
    if (looksLikeProxyError(body)) throw new Error(`${p.name}:error-envelope`);
    markProxySuccess(p.name);
    return { kind: p.kind === "markdown" ? "markdown" : "html", body, proxy: p.name };
  } catch (e) {
    if (/429|quota|rate/i.test(e?.message || "")) markProxyCooldown(p.name, 60_000);
    throw e;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onAbort);
  }
}

export async function fetchViaProxies(url, { timeoutMs = 9000 } = {}) {
  if (isUnscrapableUrl(url)) {
    throw new Error("URL non scrapable (réseau social ou plateforme fermée)");
  }
  const usable = PROXIES.filter((p) => !isProxyCoolingDown(p.name));
  const pool = usable.length ? usable : PROXIES;

  // 1. Tenter d'abord le proxy local Node ou le Cloudflare Worker dédié (0ms CORS, zéro pollution)
  const primary = pool.find((p) => (p.name === "local-article-proxy" || p.name === "worker-article-proxy" || p.name === "local-dev-proxy" || p.name === "cloudflare-worker-proxy") && !isProxyCoolingDown(p.name));
  if (primary) {
    try {
      return await tryProxy(primary, url, timeoutMs);
    } catch {
      // En cas d'échec du proxy local, bascule défensive sur les fallbacks externes
    }
  }

  // 2. Repli séquentiel sur les proxies externes (évite de spammer simultanément le réseau)
  const fallbackPool = pool.filter((p) => p !== primary);
  let lastErr = null;
  for (const p of fallbackPool) {
    try {
      return await tryProxy(p, url, timeoutMs);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All proxies failed");
}

// Récupère le corps d'article déclaré par l'éditeur (JSON-LD schema.org
// "articleBody") : c'est souvent le texte INTÉGRAL, sans pub ni cookies.
function extractJsonLdBody(doc) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  let best = "";
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node.articleBody === "string" && node.articleBody.length > best.length) best = node.articleBody;
    if (node["@graph"]) visit(node["@graph"]);
  };
  scripts.forEach((s) => { try { visit(JSON.parse(s.textContent || "")); } catch {} });
  if (!best) return "";
  const txt = best.replace(/<[^>]+>/g, " ").replace(/\r/g, "");
  // Ré-injecte des sauts de paragraphe (groupes de 3 phrases) si l'éditeur a tout mis sur une ligne.
  let withParas = txt;
  if (!/\n\s*\n/.test(txt)) {
    const sentences = txt.match(/[^.!?]+[.!?]+["»]?\s*|[^.!?]+$/g) || [txt];
    const groups = [];
    for (let i = 0; i < sentences.length; i += 3) groups.push(sentences.slice(i, i + 3).join(" "));
    withParas = groups.join("\n\n");
  }
  return withParas.split(/\n\s*\n+/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n");
}

// ─── 2) Extraction "Readability-lite" ───────────────────────────────────────
// Score chaque conteneur potentiel en fonction de la densité de texte et de
// la présence de paragraphes "vrais", ignore nav/footer/aside/scripts.
const NEGATIVE_RE = /comment|meta|footer|footnote|share|social|newsletter|breadcrumb|advert|promo|sponsor|related|popup|cookie|consent|paywall|sidebar|nav|menu/i;
const POSITIVE_RE = /article|content|post|story|entry|main|body|page|text/i;

function cleanDoc(doc) {
  const trash = doc.querySelectorAll(
    "script, style, link, noscript, iframe, svg, canvas, form, button, " +
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

// ============================================================================
// 🧼 DÉTECTION DES TEXTES PARASITES — ÉDITION GOD TIER
// ----------------------------------------------------------------------------
// Objectif : plus jamais afficher un bandeau cookies, un mur de consentement
// TCF/IAB, un appel à l'abonnement ou un pied de page social à la place du
// véritable contenu de l'article.
// ============================================================================

// Signaux FAIBLES : il en faut au moins deux dans un même paragraphe.
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
  /gratuit[ée] de l'information/i,
  /co[ûu]t de production/i,
  /communaut[ée] de passionn[ée]s/i,
  /par mois/i,
  /€ ?\/ ?mois|\d+[,.]\d+ ?€/i,
];

// Signaux FORTS : une seule occurrence suffit à disqualifier le paragraphe.
export const STRONG_BOILERPLATE_PATTERNS = [
  // Murs de consentement / RGPD / IAB TCF
  /accept(er|ez)? (l'utilisation de |nos |les )?cookies/i,
  /nos cookies (soutien|soutient|nous)/i,
  /traiter vos donn[ée]es personnelles/i,
  /we and our partners (process|store|use)/i,
  /(store|access) information on a device/i,
  /personalised (advertising|content|ads)/i,
  /measure (advertising|content) performance/i,
  /use precise geolocation data/i,
  /audience measurement/i,
  /develop and improve services/i,
  /scan device characteristics for identification/i,
  /l[ée]gitimate interest/i,
  /g[ée]rer mes choix|param[ée]trer les cookies|accepter et fermer|tout accepter|tout refuser/i,
  // Appels à l'abonnement / soutien éditorial
  /pour p[ée]renniser (son|notre) mod[èe]le/i,
  /abonnement .*? sans publicit[ée]/i,
  /article r[ée]serv[ée] aux abonn[ée]s/i,
  /soutenir (notre|encore plus notre) travail/i,
  /croit fermement en la gratuit[ée] de l'information/i,
  /co[ûu]t de production [ée]lev[ée]/i,
  /rejoindre une communaut[ée] de passionn[ée]s/i,
  /acc[ée]dez [àa] numerama\+/i,
  /rejoignez numerama\+/i,
  /profitez d'avantages exceptionnels/i,
  /choisissez votre mode de lecture/i,
  /d[ée]j[àa] abonn[ée] ?\?/i,
  /cr[ée]er un compte|cr[ée]ez votre compte|cr[ée]ez-en un|vous [êe]tes nouveau sur|vous devez avoir un compte|l'inscription est gratuite|si vous disposez d[ée]j[àa] d'un compte/i,
  /pensez-vous que cette analyse|quel est votre avis sur|qu'en pensez-vous|avez-vous d[ée]j[àa] test[ée]|partagez votre exp[ée]rience/i,
  /offres? d'emploi de d[ée]veloppeur/i,
  /nous g[ée]n[ée]rons pour vous un r[ée]sum[ée]/i,
  /r[ée]sum[ée] par l'?[iI][aA],? v[ée]rifi[ée] par/i,
  /recevez tous les soirs un r[ée]sum[ée]/i,
  /suivez-nous|ajoutez-nous [àa] vos favoris/i,
  /vous avez lu \d+ articles/i,
  /bonne raison de ne pas s'abonner/i,
  /trois bonnes raisons de soutenir/i,
  /d[ée]couvrez les (nombreux )?avantages/i,
  /d[ée]couvrez les bonus/i,
  /signaler une erreur|une erreur dans cette actualit[ée]|signalez-nous-la/i,
  /^(la solution (tout-en-un|id[ée]ale)|t[ée]l[ée]chargez notre livre blanc|d[ée]couvrez nos offres|sponsoris[ée]|en partenariat avec)\b/i,
  /pour ne rien manquer de l'actualit[ée]/i,
  // Blocs Newsletter / Inscription / Réseaux au milieu ou en fin d'article
  /[📩📬🔔]/u,
  /recevez (?:la|notre|tous les|chaque) newsletter/i,
  /(?:inscrivez-vous|inscription|abonn(?:ez-vous|ement))\s+(?:[àa]\s+)?(?:la\s+|notre\s+)?newsletter/i,
  /en vous inscrivant/i,
  /politique de protection des donn[ée]es/i,
  /l['’]actu (?:digitale|tech|du jour|ia)\s+[ée]volue vite/i,
  /restez [àa] jour/i,
  /votre adresse (?:e-?mail|courriel)/i,
  /newsletter (?:quotidienne|hebdomadaire|gratuite)/i,
  // Pieds de page / barres sociales collées
  /^(youtube|instagram|tiktok|facebook|whatsapp|twitter|linkedin|threads|bluesky|mastodon|x)[a-z]*$/i,
  /suivez-nous sur/i,
  /partager sur (facebook|twitter|x|whatsapp|linkedin)/i,
  // Navigation résiduelle
  /^(accueil|menu|rechercher|newsletter|contact|connexion|s'identifier)\s*$/i,
];

/**
 * Concaténation de noms de réseaux sociaux sans séparateur
 * (ex: "YouTubeInstagramTikTokXFacebookWhatsApp") — signature d'un footer.
 */
const SOCIAL_RUN_RE = /(youtube|instagram|tiktok|facebook|whatsapp|twitter|linkedin|threads|bluesky|snapchat|telegram|pinterest|mastodon)/gi;

function looksLikeSocialRun(str) {
  const compact = str.replace(/[\s|·•,/-]/g, "");
  const matches = compact.match(SOCIAL_RUN_RE);
  if (!matches || matches.length < 3) return false;
  const covered = matches.join("").length;
  return covered / Math.max(compact.length, 1) > 0.6;
}

/**
 * Liste à énumération de finalités publicitaires (mur TCF) :
 * beaucoup de virgules, peu de phrases, vocabulaire marketing.
 */
function looksLikePurposeList(str) {
  const commas = (str.match(/,/g) || []).length;
  const sentences = (str.match(/[.!?](\s|$)/g) || []).length;
  if (commas < 6 || sentences > 2) return false;
  return /(advertising|content|profiles|audience|device|donn[ée]es|publicit|profils)/i.test(str);
}

/**
 * Détection des menus de navigation et listings de catégories collées.
 */
function looksLikeNavMenu(str) {
  const s = str.toLowerCase();
  if (/(guidesbons|casquesp2p|t[ée]l[ée]comsobjets|[ée]couteurssmartphone|jeux et jouetsjeux|autres\d+)/.test(s)) return true;
  if (/(\d+\s*box internet|\d+\s*forfait mobile|\d+\s*offre svod|\d+\s*meilleur vpn)/.test(s)) return true;
  const catHits = (s.match(/\b(guides|bons plans|vid[ée]os|tests|glossaire|enqu[êe]tes|casques|t[ée]l[ée]coms|informatique|smartphone|sciences|pop culture|cyberguerre|soci[ée]t[ée]|vroom)\b/g) || []).length;
  const sentenceCount = (str.match(/[.!?](\s|$)/g) || []).length;
  if (catHits >= 4 && sentenceCount <= 1) return true;
  return false;
}

export function isBoilerplateOrConsentText(str) {
  if (!str || typeof str !== "string") return false;
  // Normaliser les apostrophes typographiques pour garantir l'efficacité des regex
  const s = str.trim().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D«»]/g, '"');
  if (s.length < 15) return false;

  for (const pattern of STRONG_BOILERPLATE_PATTERNS) {
    if (pattern.test(s)) return true;
  }
  if (looksLikeSocialRun(s)) return true;
  if (looksLikePurposeList(s)) return true;
  if (looksLikeNavMenu(s)) return true;

  let matchCount = 0;
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(s)) matchCount++;
  }
  return matchCount >= 2;
}

// ─── Pertinence thématique : le texte parle-t-il bien du sujet du titre ? ────

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "en", "au", "aux",
  "pour", "par", "sur", "avec", "dans", "que", "qui", "quoi", "dont", "ses", "son",
  "sa", "leur", "leurs", "ce", "cet", "cette", "ces", "est", "sont", "plus", "moins",
  "the", "of", "and", "to", "in", "for", "on", "with", "a", "an", "is", "are", "its",
  "son", "nos", "notre", "vous", "nous", "ils", "elle", "elles", "il",
]);

/**
 * Extrait les mots significatifs d'un titre (≥ 4 caractères, hors mots vides).
 */
export function extractTopicTokens(title = "") {
  return Array.from(
    new Set(
      String(title)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    )
  );
}

/**
 * Score de pertinence 0→1 : proportion des mots-clés du titre présents dans le texte.
 */
export function scoreTopicalRelevance(text = "", title = "") {
  const tokens = extractTopicTokens(title);
  if (!tokens.length) return 1;
  const haystack = String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return hits / tokens.length;
}

/**
 * ⭐ Filtre final : supprime les paragraphes parasites ET hors sujet.
 * Un paragraphe est conservé s'il n'est pas du boilerplate et s'il est soit
 * lié au sujet, soit entouré de paragraphes pertinents (continuité narrative).
 */
export function filterRelevantParagraphs(text, title = "", { minRelevance = 0.12 } = {}) {
  if (!text) return "";
  const tokens = extractTopicTokens(title);
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 30 && !isBoilerplateOrConsentText(p));

  if (!tokens.length || paragraphs.length === 0) return paragraphs.join("\n\n").trim();

  const relevance = paragraphs.map((p) => scoreTopicalRelevance(p, title));
  // Index du premier paragraphe réellement lié au sujet : tout ce qui précède
  // est presque toujours un préambule éditorial (mur de consentement, pub…).
  const firstRelevant = relevance.findIndex((r) => r >= minRelevance);
  if (firstRelevant === -1) return "";

  const kept = [];
  for (let i = firstRelevant; i < paragraphs.length; i++) {
    const prevOk = i > firstRelevant && relevance[i - 1] >= minRelevance;
    const nextOk = i + 1 < paragraphs.length && relevance[i + 1] >= minRelevance;
    if (relevance[i] >= minRelevance || prevOk || nextOk) kept.push(paragraphs[i]);
  }
  return kept.join("\n\n").trim();
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
  // 🛡️ Élimine préventivement les balises link (preloads, styles) et style du HTML
  // pour empêcher le navigateur de déclencher des requêtes réseau de polices ou CSS externes relatives.
  const sanitizedHtml = typeof html === "string"
    ? html.replace(/<link\b[^>]*>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    : html;

  try {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(sanitizedHtml, "text/html");
      const ld = sanitizeArticleText(extractJsonLdBody(doc));
      cleanDoc(doc);
      const best = pickBest(doc) || doc.body;
      let paras = nodeToParagraphs(best);
      if (paras.join(" ").length < 400) {
        // fallback : tout le body
        paras = nodeToParagraphs(doc.body);
      }
      const dom = sanitizeArticleText(paras.join("\n\n"));
      // Le JSON-LD gagne s'il est au moins aussi complet que l'extraction DOM.
      return ld.length >= dom.length * 0.8 && ld.length > 300 ? ld : dom;
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
  if (isUnscrapableUrl(url)) {
    return { text: "", source: "unscrapable", kind: "none" };
  }
  // 0) Extraction serveur (Worker /article) : récupération + JSON-LD/densité/Readability + AMP/Jina/archive.
  const WORKER = (import.meta.env?.VITE_PROXY_URL || import.meta.env?.VITE_AI_PROXY_URL || "https://memomasterproxy.elmalick25formcybersecu.workers.dev").replace(/\/$/, "");
  if (WORKER) {
    try {
      const r = await fetch(`${WORKER}/article?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(opts.timeoutMs ? opts.timeoutMs + 6000 : 15000) });
      if ((r.headers.get("content-type") || "").includes("json")) {
        const d = await r.json();
        if (d?.text && d.text.length >= 200) {
          return { text: sanitizeArticleText(d.text), source: `worker:${d.method}`, kind: "worker", title: d.title, image: d.image, resolvedUrl: d.url };
        }
      } else {
        console.warn("[articleExtractor] Worker obsolète (route /article absente) : redéploie-le.");
      }
    } catch (e) {
      console.warn("[articleExtractor] /article indisponible :", e?.message || e);
    }
  }
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

/**
 * 🧵 Répare la continuité des phrases brisées par des balises, pubs ou sauts de ligne CMS intempestifs.
 * Évite les césures en plein milieu d'une proposition (ex: "servir à les \n\n exploiter").
 */
export function repairBrokenSentenceFlow(text) {
  if (!text || typeof text !== "string") return "";
  let s = text;

  // 1. Recolle les mots coupés par un tiret suivi d'un saut de ligne (césure typographique)
  s = s.replace(/(\b\p{L}+)-\s*\n+\s*(\p{L}+\b)/gu, "$1$2");

  // 2. Mots de liaison, déterminants, prépositions terminant une ligne : recollage obligatoire
  // Ex: "avec son \n\n confrère", "servir à les \n\n exploiter", "dans \n\n un"
  const connectives = "(?:de|du|des|le|la|les|un|une|ce|cet|cette|ces|mon|ton|son|sa|ses|notre|votre|leur|leurs|à|au|aux|en|dans|par|pour|sur|avec|sans|sous|et|ou|mais|donc|or|ni|car|que|qui|dont|où|d'|l'|qu'|c'|s'|n'|j'|the|a|an|of|in|to|for|with|on|at|by|from|into)";
  const connRegex = new RegExp(`(\\b${connectives})\\s*\\n+\\s*`, "giu");
  s = s.replace(connRegex, "$1 ");

  // 3. Virgules, points-virgules, deux-points et parenthèses ouvrantes
  s = s.replace(/([,;(\[«“])\s*\n+\s*/g, "$1 ");

  // 4. Si la ligne ne se termine PAS par une ponctuation de fin de phrase (. ? ! : » ” ")
  // et que la suite débute par une minuscule, un chiffre ou une ponctuation de liaison
  s = s.replace(/([^\s.?!:»”"])\s*\n+\s*([a-zà-ÿ0-9])/gu, "$1 $2");

  // 5. Cas où le saut de ligne arrive après une parenthèse fermante non terminée par un point
  s = s.replace(/\)\s*\n+\s*([a-zà-ÿ0-9])/gu, ") $1");

  return s;
}

/**
 * 📰 Segmente les pavés de texte monolithiques en paragraphes éditoriaux digestes.
 * Isole les intertitres journalistiques et aère les blocs trop denses (> 400 caractères).
 */
function segmentLongTextIntoParagraphs(text) {
  if (!text || typeof text !== "string") return [];
  let s = text;

  // Isole les intertitres sur une seule ligne (ex: "Titre court\nTexte...")
  s = s.replace(/(^|\n)\s*([A-ZÀ-Ÿ0-9][a-zà-ÿ0-9\s'’—–-]{3,90}[^.!?…:\n\s])\s*\n+(?=[A-ZÀ-Ÿ0-9])/gu, "$1\n\n$2\n\n");

  const pieces = s.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  const out = [];

  for (const piece of pieces) {
    if (piece.length <= 480) {
      out.push(piece);
      continue;
    }
    const sentences = piece.match(/[^.!?…]+[.!?…]+[\s]*|[^.!?…]+$/gu) || [piece];
    let currentPara = "";
    for (const sent of sentences) {
      const sTrim = sent.trim();
      if (!sTrim) continue;
      if (currentPara && (currentPara.length + sTrim.length > 380)) {
        out.push(currentPara.trim());
        currentPara = sTrim;
      } else {
        currentPara = currentPara ? `${currentPara} ${sTrim}` : sTrim;
      }
    }
    if (currentPara.trim()) out.push(currentPara.trim());
  }

  return out.length > 0 ? out : [text];
}

/**
 * 🌐 Extracteur Universel par Densité Textuelle & Heuristique Journalistique
 * Fonctionne de façon autonome pour TOUS les sites web d'actualité dans le monde.
 */
export function extractUniversalArticleParagraphs(rawText, item = {}) {
  if (!rawText || typeof rawText !== "string") return [];
  const repaired = repairBrokenSentenceFlow(rawText);
  const initialBlocks = repaired.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  if (!initialBlocks.length) return [];

  // Recollage de continuité narrative : si un paragraphe a été coupé en plein milieu
  const rawBlocks = [];
  const segmented = [];
  for (const block of initialBlocks) {
    segmented.push(...segmentLongTextIntoParagraphs(block));
  }

  for (const block of segmented) {
    if (rawBlocks.length === 0) {
      rawBlocks.push(block);
      continue;
    }
    const prev = rawBlocks[rawBlocks.length - 1];
    const prevEndsSentence = /[.!?»”"]\s*$/.test(prev);
    const currStartsLower = /^[a-zà-ÿ0-9]/.test(block);

    if (!prevEndsSentence && currStartsLower) {
      rawBlocks[rawBlocks.length - 1] = `${prev} ${block}`.replace(/\s+/g, " ").trim();
    } else {
      rawBlocks.push(block);
    }
  }
  if (!rawBlocks.length) return [];

  const itemTitle = String(item?.titleFr || item?.title || "").toLowerCase().trim();

  // 1. Élimination universelle du bruit immédiat, métadonnées de tête et répétitions de titre
  const candidates = [];
  for (const block of rawBlocks) {
    if (isBoilerplateOrConsentText(block)) continue;
    if (isDateOrMetadataOnly(block)) continue;

    // Titre de l'article répété en tête (uniquement s'il s'agit du titre seul sans développement)
    const bLower = block.toLowerCase().trim();
    if (itemTitle && (bLower === itemTitle || (itemTitle.length > 25 && bLower.startsWith(itemTitle) && Math.abs(bLower.length - itemTitle.length) < 20))) {
      continue;
    }

    // Métadonnées courtes (auteur, date, temps de lecture, etc.)
    if (block.length < 85 && /^(par\s*[a-zà-ÿ]+|publi[ée]\s*le|mis [àa] jour|auteur|source\s*:|cr[ée]dit\s*:|temps de lecture)/i.test(block)) {
      continue;
    }

    // Blocs de navigation collée ou de liens
    const sentenceCount = (block.match(/[.!?](\s|$)/g) || []).length;
    if (block.length > 100 && sentenceCount === 0 && !block.includes(",")) {
      continue;
    }

    // Appels d'interaction de bas de page ou slogans publicitaires isolés
    if (block.length < 130 && /^(une erreur dans cette actualit|signalez-nous|et vous\s*\?|qu'en pensez-vous|donnez votre avis|la solution (tout-en-un|id[ée]ale))/i.test(block)) {
      continue;
    }

    candidates.push(block);
  }

  if (!candidates.length) return [];

  // 2. Détection du point de départ narratif (premier paragraphe substantiel ou intertitre introductif)
  let startIndex = 0;
  for (let i = 0; i < Math.min(candidates.length, 5); i++) {
    const p = candidates[i];
    const sentenceCount = (p.match(/[.!?](\s|$)/g) || []).length;
    if (p.length >= 65 && sentenceCount >= 1) {
      if (i > 0 && candidates[i - 1].length >= 6 && candidates[i - 1].length <= 100 && !/[.!?…]$/.test(candidates[i - 1])) {
        startIndex = i - 1;
      } else {
        startIndex = i;
      }
      break;
    }
  }

  // 3. Coupure nette universelle dès que la queue de page/footer ou les recommandations débutent
  const result = [];
  const cutoffRegex = /^(quels sont les meilleurs|sur le m[êe]me sujet|[àa] lire aussi|articles? recommand[ée]s?|articles? li[ée]s?|voir aussi|sources?\s*:|abonnez-vous|retrouvez-nous|dans la m[êe]me th[ée]matique|commentaires?|discussions?|r[ée]actions?|r[ée]ponses?|d[ée]crivez l'erreur|envoy[ée] par|une erreur dans cette|signalez-nous|et vous\s*\?|donnez votre avis|cet article a [ée]t[ée] publi[ée]|disponible [ée]galement en)\b/i;

  for (let i = startIndex; i < candidates.length; i++) {
    const p = candidates[i];
    if (cutoffRegex.test(p) || /envoy[ée] par \w+|showthread\.php|d[ée]crivez l'erreur/i.test(p)) break;

    // Détection d'énumérations d'articles similaires en queue de page
    if (p.length < 130 && /^(framework |iphone |samsung |xiaomi |nvidia |intel |amd |apple |google |guide d'achat)/i.test(p) && (p.includes(":") || !/[.!?]$/.test(p))) {
      if (result.length >= 2) break;
    }

    // Élagage des mentions de traduction ou sources parasites en bas d'article
    const footerIdx = p.search(/(?:Cet article a [ée]t[ée] publi[ée]|Disponible [ée]galement en\s+[A-Za-zÀ-ÿ]+)/i);
    if (footerIdx >= 0) {
      const kept = p.slice(0, footerIdx).trim();
      if (kept.length > 30) result.push(kept);
      break;
    }

    result.push(p);
  }

  const outputList = result.length > 0 ? result : (candidates.length > 0 ? candidates : [rawText.trim()]);
  return outputList
    .map(p => cleanFrenchTypography(repairFrenchElisions(String(p || '').replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1').replace(/\*/g, '').replace(/[ \t]+/g, ' ').trim())))
    .filter(Boolean);
}

/**
 * Détecte si une chaîne est uniquement une date, une URL,
 * une métadonnée technique ou du bruit sans valeur éditoriale.
 */
export function isDateOrMetadataOnly(str) {
  if (!str || typeof str !== 'string') return true;
  const s = str.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1').replace(/\*/g, '').trim();
  if (!s || s.length === 0) return true;
  // URL nue ou lien Markdown nu
  if (/^https?:\/\/\S+$/i.test(s) || /^\[https?:\/\/[^\]]+\]\([^)]+\)$/i.test(s)) return true;
  // Date RFC 822 / 1123 / HTTP Date (ex: Sat, 10 Oct 2026 15:23:00 GMT)
  if (/^(?:mon|tue|wed|thu|fri|sat|sun),?\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s)) return true;
  // Date ISO ou numérique (2026-10-10 ou 10/10/2026)
  if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s)) return true;
  // Formats de date explicites en français (ex: "29 septembre 2026 à 14h51")
  if (/^(?:(?:le|mis à jour le|publié le)\s+)?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*\d{1,2}\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\s+\d{2,4}(?:\s+[àa]\s+\d{1,2}[h:]\d{2})?$/i.test(s)) return true;
  // Date en anglais avec mois en tête: October 10, 2026
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i.test(s)) return true;
  // Métadonnées d'attribution brèves
  if (s.length < 80 && /^(?:par\s+[a-zà-ÿ]+|publi[ée]\s+le|mis [àa] jour|auteur|source\s*:|cr[ée]dit\s*:|temps de lecture)/i.test(s)) return true;
  return false;
}
