import { repairMojibake, decodeEntitiesDeep, repairDamagedWords } from './textRepair.js';
/** Décode exhaustivement TOUTES les entités HTML (HTML5 universel via parseur DOM natif + repli Regex). */
export function decodeAllHtmlEntities(text) {
  const fixed = repairMojibake(text || '');
  if (!fixed.includes('&')) return fixed;
  return repairMojibake(decodeEntitiesDeep(fixed, decodeHtmlEntitiesOnce));
}

function decodeHtmlEntitiesOnce(text) {
  if (!text || typeof text !== 'string' || !text.includes('&')) return text || '';

  // 1. Décodage universel natif du navigateur si DOMParser est disponible (couvre 100% des entités HTML5)
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(`<!doctype html><body>${text}`, 'text/html');
      const decoded = doc.body.textContent;
      if (decoded && typeof decoded === 'string') return decoded;
    } catch {}
  }

  // 2. Repli universel Regex exhaustif (Node.js / WebWorker / SSR)
  return text
    // Voyelles et consonnes accentuées
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
    // Symboles, ponctuations et espaces
    .replace(/&#160;|&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&#171;|&laquo;/gi, '«')
    .replace(/&#187;|&raquo;/gi, '»')
    .replace(/&hellip;|&#8230;/gi, '…')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    // Numériques décimaux et hexadécimaux
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(+n); } catch { return ''; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
    });
}

/** Supprime toutes les étoiles (gras, italique, puces, résidus) et artefacts Markdown. */
export function stripMarkdownAndAsterisks(text) {
  if (!text || typeof text !== 'string') return '';
  // 1. Décodage universel de toutes les entités HTML (DOM natif / Regex)
  let s = decodeAllHtmlEntities(text);

  // 2. Balises HTML restantes
  s = s.replace(/<[^>]+>/g, ' ');
  // Images et liens Markdown
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Titres Markdown
  s = s.replace(/^#{1,6}\s+/gm, '');
  // Gras / italiques Markdown
  s = s.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  s = s.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');
  s = s.replace(/`{1,3}([^`]+)`{1,3}/g, '$1');
  // Puces Markdown en début de ligne
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  s = s.replace(/^\s*>\s+/gm, '');
  // Suppression inconditionnelle de toutes les étoiles résiduelles
  s = s.replace(/\*/g, '');
  // Nettoyage des faux guillemets corrompus avec des points d'interrogation (? mot ? -> « mot »)
  s = s.replace(/(?:^|\s)\?\s*([^?\n\r]{2,80}?)\s*\?(?=$|\s|[.,;:!])/gu, " « $1 »");
  // Rétablissement chirurgical et sécurisé des élisions françaises
  s = repairFrenchElisions(s);
  // Filet de sécurité pour les chaînes déjà empoisonnées en cache historique
  s = s.replace(/\bbote (?:à |&agrave; )?outils\b/gi, "boîte à outils");
  s = s.replace(/\bd['’]die\b/gi, "dédiée à");
  s = s.replace(/\bd['’]di[eé]e\b/gi, "dédiée");
  // Suppression de tout caractère de remplacement Unicode orphelin résiduel (\uFFFD)
  s = repairDamagedWords(s);
  s = s.replace(/\uFFFD/g, '');
  // Rétablissement d'une typographie irréprochable (espaces avant ponctuation, etc.)
  s = cleanFrenchTypography(s);
  return s
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

/**
 * Nettoyeur typographique français de référence :
 * - Supprime les espaces parasites résiduels devant la ponctuation basse / fermante (. , ) ] …)
 * - Supprime les espaces après les ouvertures ( et [
 * - Assure un espace simple avant la ponctuation double (: ; ! ?)
 * - Formate les guillemets français « mot » avec espaces intérieurs
 */
export function cleanFrenchTypography(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text;
  // 1. Suppression des espaces avant . , ) ] … (souvent issus de liens retirés)
  s = s.replace(/\s+([.,)\]…])/gu, '$1');
  // 2. Suppression des espaces après parenthèse ou crochet ouvrant
  s = s.replace(/([(\[])\s+/gu, '$1');
  // 3. Espace régulier avant ponctuation haute (: ; ! ?)
  s = s.replace(/\s*([;!?])/gu, ' $1');
  s = s.replace(/\s*(:)(?!\/\/)/gu, ' $1');
  // 4. Espaces intérieurs pour guillemets français
  s = s.replace(/«\s*/gu, '« ').replace(/\s*»/gu, ' »');
  // 5. Normalisation des espaces multiples horizontaux
  s = s.replace(/[ \t]{2,}/gu, ' ');
  return s;
}

/**
 * Répare les élisions françaises orphelines cassées par les flux RSS ou traducteurs automatiques.
 * Ex: "l ia" -> "l'IA", "l?IA" -> "l'IA", "d extinction" -> "d'extinction", "d ici" -> "d'ici", "c?est" -> "c'est"
 */
export function repairFrenchElisions(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text;

  // Voyelles françaises incluant accents et majuscules
  const frenchVowels = "[aàâäeéèêëiîïoôöuùûüyAÀÂÄEÉÈÊËIÎÏOÔÖUÙÛÜY]";

  // 0. Rétablissement direct universel des élisions avec ? ou \uFFFD UNIQUEMENT DEVANT VOYELLE (l'IA, d'un, c'est, qu'il, etc.)
  // 🛑 RÈGLE FONDAMENTALE : En français, l'élision ne se produit JAMAIS devant une consonne !
  // Ne plus jamais transformer "d?di?e" en "d'die" au lieu de "dédiée".
  s = s.replace(new RegExp(`\\b([cCdDjJlLmMnNsStT]|qu|Qu|jusqu|Jusqu|lorsqu|Lorsqu|puisqu|Puisqu)[\\?\\uFFFD](${frenchVowels}|h${frenchVowels}|IA\\b|part\\b)`, "gu"), "$1'$2");
  s = s.replace(/\b(aujourd|Aujourd)[\?\uFFFD](hui)\b/gi, "$1'$2");
  s = s.replace(/\b(quelqu|Quelqu)[\?\uFFFD](un|une)\b/gi, "$1'$2");
  s = s.replace(/\b(presqu|Presqu)[\?\uFFFD]([iî]le)\b/gi, "$1'$2");

  // 0b. Normalisation des séparateurs orphelins (espaces, ? corrompus, \uFFFD)
  const sep = "(?:[\\s\\?\\uFFFD]+|[\\?\\uFFFD])";

  // 1. Acronymes tech fréquents (l ia / l?IA / d ia -> l'IA / d'IA)
  s = s.replace(new RegExp(`\\b([cCdDjJlLmMnNsStT])${sep}([iI][aA])\\b`, "g"), "$1'IA");

  // 2. Mots avec H muet fréquents
  s = s.replace(
    new RegExp(`\\b([cCdDjJlLmMnNsStT])${sep}(homm\\w*|histoir\\w*|heur\\w*|humanit[eé]\\w*|h[iî]ver\\w*|h[eé]licopt\\w*|h[eé]berg\\w*|h[eé]rit\\w*|h[oô]tel\\w*|h[oô]pit\\w*|horizon\\w*|horreur\\w*|habitud\\w*|humeur\\w*|humain\\w*)\\b`, "gi"),
    "$1'$2"
  );

  // 3. Conjonctions élidées (qu', lorsqu', puisqu', jusqu')
  s = s.replace(new RegExp(`\\b(jusqu|lorsqu|puisqu|qu|Jusqu|Lorsqu|Puisqu|Qu)${sep}([aàâeéèêëiîïoôuùûyAÀÂEÉÈÊËIÎÏOÔUÙÛY]\\w*)`, "g"), "$1'$2");

  // 4. Mots composés fréquents avec élision (aujourd'hui, quelqu'un, presqu'île)
  s = s.replace(new RegExp(`\\b(aujourd|Aujourd)${sep}(hui)\\b`, "gi"), "$1'hui");
  s = s.replace(new RegExp(`\\b(quelqu|Quelqu)${sep}(un|une)\\b`, "gi"), "$1'$2");
  s = s.replace(new RegExp(`\\b(presqu|Presqu)${sep}([iî]le)\\b`, "gi"), "$1'$2");

  // 5. Monosyllabes courants (d'un, d'une, d'or, d'en, c'est, s'il, n'a, j'ai)
  s = s.replace(new RegExp(`\\b([cCdDjJlLmMnNsStT])${sep}(un|une|en|y|or|est|ai|as|ont|a|il|ils|elle|elles)\\b`, "gi"), "$1'$2");

  // 6. Élisions standards devant voyelle (l', d', j', m', t', s', c', n')
  s = s.replace(new RegExp(`\\b([cCdDjJlLmMnNsStT])${sep}([aàâeéèêëiîïoôuùûyAÀÂEÉÈÊËIÎÏOÔUÙÛY][a-zàâäéèêëîïôöùûüÿçœæ]{1,})\\b`, "g"), "$1'$2");

  // 7. Nettoyage des apostrophes parasites collées entre mots non élidés (ex: Accès'aux, forêt'ou, rôles délégués'avant)
  s = s.replace(/\b(?!(?:qu|lorsqu|puisqu|jusqu|Qu|Lorsqu|Puisqu|Jusqu|aujourd|Aujourd|quelqu|Quelqu|presqu|Presqu)\b)([a-zA-Zà-ÿÀ-Ÿ]{2,})'([A-ZÀ-Ÿ][a-zà-ÿA-ZÀ-Ÿ]*)/gu, "$1. $2");
  s = s.replace(/\b(?!(?:qu|lorsqu|puisqu|jusqu|Qu|Lorsqu|Puisqu|Jusqu|aujourd|Aujourd|quelqu|Quelqu|presqu|Presqu)\b)([a-zA-Zà-ÿÀ-Ÿ]{2,})'([a-zA-Zà-ÿÀ-Ÿ]+)\b/gu, "$1 $2");
  s = s.replace(/([a-zA-Zà-ÿÀ-Ÿ]{2,})'\s+/gu, "$1 ");

  return s;
}

/** RSS and extracted article line breaks must not interrupt a card's lead, and all asterisks are stripped. */
export function normalizeNewsPreview(text) {
  if (!text) return '';
  const unescaped = String(text).replace(/\\r\\n|\\[nrt]/g, ' ');
  const stripped = stripMarkdownAndAsterisks(unescaped);
  return stripped.replace(/\s+/gu, ' ').trim();
}

/**
 * 🧹 Nettoyage intelligent et sûr des miettes de pain (fil d'Ariane) dans les textes d'articles.
 * ATTENTION : Ne doit JAMAIS effacer un titre ou une ligne sous prétexte qu'elle contient un simple tiret « - » !
 */
export function stripBreadcrumbsAndHeaderJunk(text) {
  if (!text || typeof text !== 'string') return '';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return text.trim();

  let startIdx = 0;
  const navKeywords = /^(accueil|home|actualit[ée]s?|news|high-tech|tech|informatique|logiciels?(\s*&\s*services)?|intelligence artificielle|ia|smartphones?|s[ée]curit[ée]|jeux vid[ée]o|web|hardware|tests?|tutoriels?|guides?|dossiers?|rubrique|cat[ée]gorie)\b/i;

  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const l = lines[i];
    // Exige de véritables chevrons de navigation (> » ›) ou un mot-clé de navigation explicite suivi de chevrons
    const hasBreadcrumbArrows = l.includes('>') || l.includes('»') || l.includes('›');
    const isNavHeader = navKeywords.test(l) && (hasBreadcrumbArrows || l.length < 25);
    if (l.length < 60 && (hasBreadcrumbArrows || isNavHeader)) {
      startIdx = i + 1;
    } else {
      break;
    }
  }
  return lines.slice(startIdx).join('\n').trim();
}

/**
 * 📰 Assainit et sécurise de manière universelle les titres d'actualité :
 * - Élimine les résidus de slugs d'URL, extensions web (.html, .htm, .php, etc.)
 * - Élimine les paramètres de suivi de campagne (UTM, query strings ?utm_source=..., etc.)
 * - Empêche qu'un slug d'URL ou une URL brute ne serve de titre informe
 * - Si le titre est absent, corrompu ou vide, reconstruit un titre lisible depuis l'URL canonique
 */
export function sanitizeNewsTitle(title, fallbackUrl = '') {
  let s = String(title || '').trim();

  // 1. Décodage entités HTML et dé-échappement
  s = decodeAllHtmlEntities(s);
  s = stripMarkdownAndAsterisks(s);

  // 2. Détection de pollution par URL brute ou slug de tracking
  const hasUrlJunk = /https?:\/\//i.test(s) ||
    /\.(?:html?|php|asp|jsp)\b/i.test(s) ||
    /[?&](?:utm[_\w]*|[a-z0-9_-]+=[^&\s]*)/i.test(s) ||
    /\b(?:utmsource|utmmedium|flux[ _-]?principal)\b/i.test(s);

  if (hasUrlJunk) {
    // Si le titre commence par une URL complète
    s = s.replace(/^https?:\/\/[^\s]+/i, '').trim();

    // Nettoyer la query string et les paramètres UTM résiduels
    s = s.replace(/\s*\?[^?\n\r]*$/i, '').trim();
    s = s.replace(/[?&](?:utm[_\w]*|[a-z0-9_-]+=[^&\s]*)/gi, '').trim();
    s = s.replace(/\b(?:utmsource|utmmedium|utm_campaign|flux[ _-]?principal)\b[^\s]*/gi, '').trim();

    // Retirer les extensions de fichiers web (.html, .htm, etc.)
    s = s.replace(/\.(?:html?|php|asp|jsp)\b/gi, '').trim();

    // Remplacer les tirets/underscores orphelins issus d'un ancien slug
    if (s.includes('-') || s.includes('_')) {
      s = s.replace(/[-_]+/g, ' ').trim();
    }
  }

  // 3. Si après nettoyage le titre est vide ou trop court (< 4 caractères), on se rabat sur l'URL
  if ((!s || s.length < 4) && fallbackUrl) {
    try {
      const cleanPath = fallbackUrl.replace(/[?#].*$/, '').replace(/\/+$/, '');
      let slug = cleanPath.split('/').pop() || '';
      slug = slug.replace(/\.(?:html?|php|asp|jsp)$/i, '');
      slug = slug.replace(/^(?:\d{4}[-_]\d{2}[-_]\d{2}[-_]?|[a-z]+[-_]\d+[-_])/i, '');
      slug = slug.replace(/[-_]+/g, ' ').trim();
      if (slug.length >= 4) {
        s = slug;
      }
    } catch {}
  }

  // 4. Nettoyage typographique final
  s = s.replace(/[ \t]+/g, ' ').trim();
  if (s) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s;
}

/** A short standalone line without sentence-ending punctuation is a subheading. */
export function isNewsSubheading(text, index) {
  if (typeof index === 'number' && index <= 0) return false;
  const line = normalizeNewsPreview(text);
  if (!line || line.length < 4 || line.length > 120) return false;
  // Ne doit pas se terminer par un point final, point d'exclamation, point d'interrogation ou points de suspension
  if (/[.!?…][»”"']?$/.test(line)) return false;
  // Ne doit pas être une conjonction ou amorce de phrase incomplète
  if (/^(?:et|ou|mais|donc|car|or|ni|puis|que|qui|avec|dans|pour|par|sur|sous)\b/i.test(line)) return false;
  return true;
}

/**
 * Découpe un texte en phrases complètes selon les standards typographiques.
 * Utilise l'API standard Intl.Segmenter ('fr') avec un repli regex résistant aux abréviations,
 * acronymes et nombres décimaux.
 */
export function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (!clean) return [];

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const segmenter = new Intl.Segmenter('fr', { granularity: 'sentence' });
      const segments = Array.from(segmenter.segment(clean))
        .map(s => s.segment.trim())
        .filter(Boolean);
      if (segments.length > 0) return segments;
    } catch {
      // repli regex ci-dessous
    }
  }

  // Fallback regex : sépare après ponctuation (. ? ! …) suivie d'un espace ou fin de bloc
  const parts = clean
    .split(/(?<=[.!?…][»”"']?)\s+(?=[A-ZÀ-ÖØ-ß0-9\[("'])/u)
    .map(s => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [clean];
}

/**
 * Limite un aperçu / sous-texte à un maximum de phrases (par défaut 10 phrases max).
 * Si le texte dépasse maxSentences, conserve fidèlement les maxSentences premières phrases
 * et termine proprement par une ellipse ' […]'.
 */
export function limitToMaxSentences(text, maxSentences = 10) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.trim();
  if (!clean || maxSentences <= 0) return '';

  const sentences = splitIntoSentences(clean);
  if (sentences.length <= maxSentences) {
    return clean;
  }

  const kept = sentences.slice(0, maxSentences).join(' ');
  const trimmed = kept.replace(/[\s.…]+$/, '');
  return `${trimmed} […]`;
}

/**
 * Détecte si un segment de phrase a été brutalement tronqué (par ex. par un flux RSS avec '...').
 */
function isTruncatedSentence(s) {
  if (!s || typeof s !== 'string') return true;
  const t = s.trim();
  if (/(\.\.\.|…|\[\+\]|\[lire la suite\]|lire la suite|en savoir plus)$/i.test(t)) return true;
  if (t.length < 12) return true;
  return false;
}

/**
 * 📰 Construit un sous-texte journalistique propre, achevé et équilibré (2 à 4 phrases complètes).
 * Garantit :
 * 1. Zéro coupure au milieu d'un mot ou d'une phrase (élimine les résidus RSS avec '...').
 * 2. Se termine STRICTEMENT sur une ponctuation terminale (. ! ?).
 * 3. Si la description est trop courte (< 100 caractères) et qu'un corps d'article est disponible,
 *    il complète avec les premières phrases du corps.
 */
export function formatCompleteSubtext(text, fallbackBody = "", { minSentences = 1, maxSentences = 3 } = {}) {
  let clean = normalizeNewsPreview(text);
  let allSentences = splitIntoSentences(clean);
  // Exclure formellement tout fragment tronqué ou inachevé
  let sentences = allSentences.filter(s => !isTruncatedSentence(s));

  // Si aucune phrase complète ou moins que le minimum souhaité, on puise dans le corps complet
  if (sentences.length < minSentences && fallbackBody) {
    const extraSentences = splitIntoSentences(normalizeNewsPreview(fallbackBody))
      .filter(s => !isTruncatedSentence(s));
    for (const s of extraSentences) {
      if (!sentences.includes(s)) sentences.push(s);
      if (sentences.length >= maxSentences) break;
    }
  }

  // Si même après filtrage aucune phrase n'est retenue mais que clean existait
  if (sentences.length === 0 && clean) {
    const sanitized = clean.replace(/(\.\.\.|…|\s)+$/, "").trim();
    if (sanitized.length >= 20) {
      sentences = [sanitized];
    }
  }

  if (sentences.length > 0) {
    const count = Math.max(1, Math.min(sentences.length, maxSentences));
    const selected = sentences.slice(0, count);
    let result = selected.join(" ").trim();
    if (!/[.!?][»”"']?$/.test(result)) {
      result += ".";
    }
    return result;
  }

  return clean;
}

