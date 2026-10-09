/** Supprime toutes les étoiles (gras, italique, puces, résidus) et artefacts Markdown. */
export function stripMarkdownAndAsterisks(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text;
  // Décodage des entités HTML courantes
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&hellip;/g, '…')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  // Balises HTML restantes
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
  return s
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

/** RSS and extracted article line breaks must not interrupt a card's lead, and all asterisks are stripped. */
export function normalizeNewsPreview(text) {
  if (!text) return '';
  const unescaped = String(text).replace(/\\r\\n|\\[nrt]/g, ' ');
  const stripped = stripMarkdownAndAsterisks(unescaped);
  return stripped.replace(/\s+/gu, ' ').trim();
}

/** A short standalone line without sentence-ending punctuation is a subheading. */
export function isNewsSubheading(text, index) {
  const line = normalizeNewsPreview(text);
  return index > 0 && line.length > 0 && line.length <= 140 &&
    !/[.!?…][»”"']?$/.test(line);
}

