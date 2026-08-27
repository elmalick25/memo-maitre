// 📖 src/lib/readerUtils.js
// ============================================================================
// UTILITAIRES POUR LE MODE LECTEUR "GOD-TIER", LECTURE BIONIQUE & OPML
// ============================================================================

/**
 * Applique l'effet Bionic Reading sur un texte en mettant en valeur
 * le point de fixation initial de chaque mot (40-50% des lettres).
 */
export function applyBionicReading(text = "") {
  if (!text || typeof text !== "string") return "";

  // Découpe le texte en conservant les séparateurs d'espaces et de ponctuation
  return text
    .split(/(\s+|[.,!?:;«»"()[\]{}—–\n])/g)
    .map((token) => {
      // Si c'est un séparateur ou vide
      if (!token || /^[\s.,!?:;«»"()[\]{}—–]+$/.test(token)) {
        return token;
      }

      // Si le token contient des balises HTML, on ne le touche pas
      if (token.startsWith("<") || token.endsWith(">")) {
        return token;
      }

      const len = token.length;
      if (len <= 1) return `<strong>${token}</strong>`;
      if (len <= 3) return `<strong>${token.slice(0, 1)}</strong>${token.slice(1)}`;
      
      const mid = Math.ceil(len * 0.45);
      return `<strong>${token.slice(0, mid)}</strong>${token.slice(mid)}`;
    })
    .join("");
}

/**
 * Calcule le temps de lecture estimé en minutes
 */
export function estimateReadingTime(text = "") {
  if (!text) return 1;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

/**
 * Génère un document OPML XML standard à partir d'une liste de flux
 */
export function generateOpml(feeds = [], title = "MemoMaster Custom Feeds") {
  const feedItems = feeds.map((f) => {
    const cleanTitle = (f.name || f.title || "Flux").replace(/"/g, "&quot;");
    const cleanUrl = (f.url || "").replace(/"/g, "&quot;");
    const category = (f.category || "General").replace(/"/g, "&quot;");
    return `    <outline text="${cleanTitle}" title="${cleanTitle}" type="rss" xmlUrl="${cleanUrl}" category="${category}" />`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${title}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${feedItems}
  </body>
</opml>`;
}

/**
 * Parse un document OPML XML et extrait les flux configurés
 */
export function parseOpml(opmlText = "") {
  if (!opmlText) return [];
  const feeds = [];

  try {
    if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(opmlText, "text/xml");
      const outlines = Array.from(xmlDoc.querySelectorAll('outline[xmlUrl], outline[type="rss"], outline[type="atom"]'));

      outlines.forEach((node) => {
        const url = node.getAttribute("xmlUrl") || node.getAttribute("url") || node.getAttribute("htmlUrl");
        if (url) {
          feeds.push({
            id: `custom_${btoa(unescape(encodeURIComponent(url))).slice(0, 24)}`,
            name: node.getAttribute("title") || node.getAttribute("text") || "Flux Importé",
            url,
            category: node.getAttribute("category") || "general",
            enabled: true,
          });
        }
      });
      if (feeds.length > 0) return feeds;
    }
  } catch {}

  // Fallback Regex
  const outlineRegex = /<outline[^>]+(?:xmlUrl|url)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = outlineRegex.exec(opmlText)) !== null) {
    const tag = match[0];
    const url = match[1];
    const titleMatch = tag.match(/(?:title|text)=["']([^"']+)["']/i);
    const categoryMatch = tag.match(/category=["']([^"']+)["']/i);

    feeds.push({
      id: `custom_${btoa(unescape(encodeURIComponent(url))).slice(0, 24)}`,
      name: titleMatch ? titleMatch[1] : "Flux Importé",
      url,
      category: categoryMatch ? categoryMatch[1] : "general",
      enabled: true,
    });
  }

  return feeds;
}

/**
 * Regroupe sémantiquement les articles similaires provenant de sources multiples (Story Clustering)
 */
export function clusterSimilarArticles(articles = []) {
  if (!articles || articles.length === 0) return [];
  
  const clusters = [];
  const processedIds = new Set();

  function computeJaccardSimilarity(textA, textB) {
    const tokenize = (s) => new Set((s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(w => w.length > 3));
    const setA = tokenize(textA);
    const setB = tokenize(textB);
    if (setA.size === 0 || setB.size === 0) return 0;
    
    let intersection = 0;
    for (const elem of setA) {
      if (setB.has(elem)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  for (let i = 0; i < articles.length; i++) {
    const main = articles[i];
    if (processedIds.has(main.id)) continue;

    const cluster = {
      mainArticle: main,
      relatedArticles: [],
    };
    processedIds.add(main.id);

    for (let j = i + 1; j < articles.length; j++) {
      const candidate = articles[j];
      if (processedIds.has(candidate.id)) continue;

      const sim = computeJaccardSimilarity(main.title, candidate.title);
      if (sim >= 0.45) {
        cluster.relatedArticles.push(candidate);
        processedIds.add(candidate.id);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}
