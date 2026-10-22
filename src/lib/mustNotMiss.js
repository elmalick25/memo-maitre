// 🛰️ « Ne rien rater » : sources incontournables + mots-clés surveillés en continu.

export const DEFAULT_WATCH_KEYWORDS = [
  "Elon Musk", "Tesla", "Roadster", "SpaceX", "Starship", "xAI", "Grok",
  "Gemini", "Google", "OpenAI", "ChatGPT", "GPT", "Anthropic", "Claude",
  "Apple", "iPhone", "Microsoft", "Nvidia", "Meta", "Amazon", "DeepSeek",
];

const WATCH_KEY = "tech_intel_watch_keywords_v1";

export function loadWatchKeywords(storage) {
  try {
    const raw = storage?.get?.(WATCH_KEY);
    const list = raw ? JSON.parse(raw) : null;
    if (Array.isArray(list) && list.length) return list;
  } catch {}
  return DEFAULT_WATCH_KEYWORDS;
}

export function saveWatchKeywords(storage, list) {
  try { storage?.set?.(WATCH_KEY, JSON.stringify(list)); } catch {}
}

const gn = (q, lang) => lang === "fr"
  ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR:fr`
  : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

/** Flux toujours actifs, même si la liste de sources de l'utilisateur est déjà enregistrée. */
export const MUST_NOT_MISS_FEEDS = [
  { name: "Google News Tech FR", source: "GoogleAI", url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=fr&gl=FR&ceid=FR:fr", lang: "fr", priority: 1, mustNotMiss: true },
  { name: "Google News Tech EN", source: "GoogleAI", url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en", lang: "en", priority: 1, mustNotMiss: true },
  { name: "Google News Monde FR", source: "France24", url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=fr&gl=FR&ceid=FR:fr", lang: "fr", priority: 1, mustNotMiss: true },
  { name: "Google News Musk/Tesla", source: "Verge", url: gn("Elon Musk OR Tesla OR Roadster OR SpaceX OR xAI when:2d", "en"), lang: "en", priority: 1, mustNotMiss: true },
  { name: "Google News IA (Gemini, OpenAI)", source: "GoogleAI", url: gn("Gemini OR OpenAI OR ChatGPT OR Anthropic OR Claude launch when:2d", "en"), lang: "en", priority: 1, mustNotMiss: true },
  { name: "Google News IA FR", source: "GoogleAI", url: gn("intelligence artificielle OR Gemini OR OpenAI OR Tesla when:2d", "fr"), lang: "fr", priority: 1, mustNotMiss: true },
  { name: "Bing News Tech", source: "TechCrunch", url: "https://www.bing.com/news/search?q=technology+launch&format=rss", lang: "en", priority: 1, mustNotMiss: true },
  { name: "Techmeme", source: "TechCrunch", url: "https://www.techmeme.com/feed.xml", lang: "en", priority: 1, mustNotMiss: true },
  { name: "HN Best", source: "HN", url: "https://hnrss.org/best", lang: "en", priority: 1, mustNotMiss: true },
  { name: "Electrek", source: "Verge", url: "https://electrek.co/feed/", lang: "en", priority: 1, mustNotMiss: true },
  { name: "Teslarati", source: "Verge", url: "https://www.teslarati.com/feed/", lang: "en", priority: 1, mustNotMiss: true },
  { name: "Google Blog", source: "GoogleAI", url: "https://blog.google/rss/", lang: "en", priority: 1, mustNotMiss: true },
  { name: "Anthropic News", source: "Anthropic", url: "https://news.google.com/rss/search?q=site:anthropic.com&hl=en-US&gl=US&ceid=US:en", lang: "en", priority: 1, mustNotMiss: true },
  { name: "Apple Newsroom", source: "Verge", url: "https://www.apple.com/newsroom/rss-feed.rss", lang: "en", priority: 1, mustNotMiss: true },
  { name: "Reddit Technology", source: "Reddit", url: "https://www.reddit.com/r/technology/top/.rss?t=day", lang: "en", priority: 2, mustNotMiss: true },
];

function norm(s = "") {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Renvoie les mots-clés surveillés présents dans le titre/résumé. */
export function matchWatchKeywords(item = {}, keywords = DEFAULT_WATCH_KEYWORDS) {
  const hay = ` ${norm(`${item.title || ""} ${item.titleFr || ""} ${item.description || ""}`)} `;
  return keywords.filter((k) => {
    const n = norm(k).trim();
    if (!n) return false;
    const rx = new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    return rx.test(hay);
  });
}

const LAUNCH_RX = /\b(launch|launches|launched|unveil|unveils|announce|announces|release|releases|lance|lancement|dévoile|devoile|annonce|sortie|disponible|available|rolls? out|demo)\b/i;

/** Événement majeur : mot-clé surveillé + verbe de lancement, ou repris par ≥ 3 sources. */
export function isMajorEvent(item = {}, keywords = DEFAULT_WATCH_KEYWORDS) {
  const hits = matchWatchKeywords(item, keywords);
  const text = `${item.title || ""} ${item.titleFr || ""}`;
  if (hits.length && LAUNCH_RX.test(text)) return true;
  if (hits.length >= 2) return true;
  return (item.sourceCount || 1) >= 3;
}

/** Bonus de classement pour les actus à ne pas rater. */
export function mustNotMissBoost(item = {}, keywords = DEFAULT_WATCH_KEYWORDS) {
  if (isMajorEvent(item, keywords)) return 10;
  return matchWatchKeywords(item, keywords).length ? 3 : 0;
}

/** Fenêtre de rattrapage : on garde tout ce qui date de moins de 48 h. */
export const CATCHUP_WINDOW_MS = 48 * 3600000;
