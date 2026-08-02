// ════════════════════════════════════════════════════════════════════════════
// 🛡️ htmlSanitizer — Sanitisation HTML par allow-list (anti-XSS)
// ────────────────────────────────────────────────────────────────────────────
// Utilisé partout où on fait dangerouslySetInnerHTML avec du contenu qui
// pourrait venir d'une IA ou d'une source externe (Magic Ink, Mermaid, etc.)
// Pas de dépendance externe — utilise DOMParser natif.
// ════════════════════════════════════════════════════════════════════════════

const DEFAULT_ALLOWED_TAGS = new Set([
  "a","abbr","b","blockquote","br","caption","code","col","colgroup","dd","div",
  "dl","dt","em","figcaption","figure","h1","h2","h3","h4","h5","h6","hr","i",
  "img","kbd","li","mark","ol","p","pre","q","s","small","span","strong","sub",
  "sup","table","tbody","td","tfoot","th","thead","tr","u","ul",
  // SVG (pour Mermaid + diagrammes)
  "svg","g","path","rect","circle","ellipse","line","polyline","polygon","text",
  "tspan","defs","marker","use","foreignObject","style","title","desc","clipPath",
]);

const DEFAULT_ALLOWED_ATTRS = new Set([
  "class","id","style","href","src","alt","title","width","height","colspan",
  "rowspan","target","rel",
  // SVG
  "viewBox","xmlns","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin",
  "d","x","y","x1","y1","x2","y2","cx","cy","r","rx","ry","points","transform",
  "text-anchor","dominant-baseline","font-size","font-family","font-weight",
  "marker-end","marker-start","marker-mid","clip-path","opacity","preserveAspectRatio",
  "orient","refX","refY","markerWidth","markerHeight","markerUnits",
]);

const URL_ATTRS = new Set(["href","src"]);
const SAFE_URL_RE = /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);|\/|#|\.|[^a-z]*$)/i;

function isSafeUrl(value) {
  if (!value) return true;
  const v = String(value).trim();
  // bloque javascript:, vbscript:, data:text/html
  if (/^\s*(javascript|vbscript|data:text\/html)/i.test(v)) return false;
  return SAFE_URL_RE.test(v);
}

function stripDangerousStyle(style) {
  if (!style) return "";
  // bloque expression(), url(javascript:), behaviors IE, imports
  return String(style)
    .replace(/expression\s*\(/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/vbscript\s*:/gi, "")
    .replace(/-moz-binding\s*:/gi, "")
    .replace(/@import/gi, "");
}

function sanitizeNode(node, opts) {
  const { allowedTags, allowedAttrs } = opts;
  // Element node
  if (node.nodeType === 1) {
    const tag = node.tagName?.toLowerCase();
    if (!allowedTags.has(tag)) {
      // remplace par ses enfants (sauf script/style/iframe/object → suppression totale)
      if (/^(script|style|iframe|object|embed|link|meta|form|input|button|video|audio|source|track)$/.test(tag)) {
        node.remove();
        return;
      }
      // unwrap
      const parent = node.parentNode;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
      return;
    }
    // attrs
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      // on bloque tout on* (onerror, onclick, onload…)
      if (name.startsWith("on")) { node.removeAttribute(attr.name); continue; }
      if (!allowedAttrs.has(name) && !allowedAttrs.has(attr.name)) {
        node.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRS.has(name) && !isSafeUrl(attr.value)) {
        node.removeAttribute(attr.name);
        continue;
      }
      if (name === "style") {
        const clean = stripDangerousStyle(attr.value);
        if (clean !== attr.value) node.setAttribute("style", clean);
      }
      if (name === "target" && node.getAttribute("target") === "_blank") {
        // force rel pour éviter le tab-nabbing
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
    // récursion
    for (const child of Array.from(node.childNodes)) sanitizeNode(child, opts);
  } else if (node.nodeType === 8) {
    // commentaires → on supprime (peuvent contenir des conditional IE)
    node.remove();
  }
}

/**
 * Sanitize un fragment HTML. Retourne une string HTML safe à injecter
 * via dangerouslySetInnerHTML.
 *
 * @param {string} html
 * @param {{ allowedTags?: Set<string>, allowedAttrs?: Set<string> }} [opts]
 */
export function sanitizeHTML(html, opts = {}) {
  if (!html || typeof html !== "string") return "";
  if (typeof window === "undefined" || !window.DOMParser) {
    // SSR fallback — on retire au moins les scripts/handlers basiques
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/on\w+\s*=\s*'[^']*'/gi, "")
      .replace(/javascript:/gi, "");
  }
  try {
    const allowedTags = opts.allowedTags || DEFAULT_ALLOWED_TAGS;
    const allowedAttrs = opts.allowedAttrs || DEFAULT_ALLOWED_ATTRS;
    // On utilise un wrapper div pour préserver les fragments
    const doc = new DOMParser().parseFromString(`<div id="__sx__">${html}</div>`, "text/html");
    const root = doc.getElementById("__sx__");
    if (!root) return "";
    for (const child of Array.from(root.childNodes)) {
      sanitizeNode(child, { allowedTags, allowedAttrs });
    }
    return root.innerHTML;
  } catch (e) {
    console.warn("[htmlSanitizer] échec, fallback texte", e);
    // fallback safe : texte échappé
    const div = document.createElement("div");
    div.textContent = html;
    return div.innerHTML;
  }
}

/**
 * Helper React : retourne un objet prêt pour dangerouslySetInnerHTML.
 */
export function safeHTML(html, opts) {
  return { __html: sanitizeHTML(html, opts) };
}
