// youtubeTranscript.js — Récupération robuste des sous-titres officiels YouTube
// Contourne le verrouillage anti-robot grâce au protocole mobile Android 20.10.38 + extraction de clé de session Innertube

const transcriptCache = new Map();

function decodeHtml(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Analyse les formats de sous-titres YouTube (XML srv3, XML srv1 et JSON3)
 */
export function parseYouTubeTimedText(raw) {
  if (!raw) return [];
  const segs = [];

  // Format 1 : JSON3
  if (typeof raw === "object" || (typeof raw === "string" && raw.trim().startsWith("{"))) {
    try {
      const data = typeof raw === "object" ? raw : JSON.parse(raw);
      if (Array.isArray(data?.events)) {
        for (const e of data.events) {
          if (!e.segs) continue;
          const text = decodeHtml(e.segs.map(s => s.utf8 || "").join(""));
          if (text) {
            segs.push({
              start: (e.tStartMs || 0) / 1000,
              dur: (e.dDurationMs || 3000) / 1000,
              text,
            });
          }
        }
        if (segs.length) return segs;
      }
      const rawSegs = data.segments || data.transcript;
      if (Array.isArray(rawSegs) && rawSegs.length) {
        return rawSegs.map(s => ({
          start: Number(s.start ?? s.offset ?? 0) > 10000 ? Number(s.start ?? s.offset) / 1000 : Number(s.start ?? s.offset ?? 0),
          dur: Number(s.dur ?? s.duration ?? 3) > 1000 ? Number(s.dur ?? s.duration) / 1000 : Number(s.dur ?? s.duration ?? 3),
          text: decodeHtml(s.text || s.content || ""),
        })).filter(s => s.text);
      }
    } catch { /* parse XML fallback */ }
  }

  // Format 2 : XML srv3 (<p t="2800" d="4559"><s>...</s></p>)
  const str = String(raw);
  for (const m of str.matchAll(/<p\b[^>]*?\bt="(\d+)"(?:[^>]*?\bd="(\d+)")?[^>]*>([\s\S]*?)<\/p>/gi)) {
    const start = (parseInt(m[1], 10) || 0) / 1000;
    const dur = (parseInt(m[2], 10) || 3000) / 1000;
    const text = decodeHtml(m[3]);
    if (text) segs.push({ start, dur, text });
  }
  if (segs.length) return segs;

  // Format 3 : XML srv1 (<text start="2.8" dur="4.5">...</text>)
  for (const m of str.matchAll(/<text\b[^>]*?\bstart="([\d.]+)"(?:[^>]*?\bdur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/gi)) {
    const start = parseFloat(m[1]) || 0;
    const dur = parseFloat(m[2]) || 3;
    const text = decodeHtml(m[3]);
    if (text) segs.push({ start, dur, text });
  }

  return segs;
}

/**
 * Récupère le transcript via l'API Android Innertube avec extraction de clé de session
 */
async function fetchViaInnerTubeAndroid(videoId, proxyBase = "") {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
    const targetUrl = proxyBase ? `${proxyBase}/?url=${encodeURIComponent(watchUrl)}` : watchUrl;
    const r = await fetch(targetUrl, {
      signal: AbortSignal.timeout(12000),
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!r.ok) return null;
    const html = await r.text();

    const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || html.match(/INNERTUBE_API_KEY\\":\\"([^\\"]+)\\"/);
    if (!keyMatch) return null;
    const apiKey = keyMatch[1];

    const playerTarget = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
    const playerUrl = proxyBase ? `${proxyBase}/?url=${encodeURIComponent(playerTarget)}` : playerTarget;

    const pr = await fetch(playerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Youtube-Client-Name": "3",
        "X-Youtube-Client-Version": "20.10.38",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            hl: "en",
            gl: "US",
          },
        },
        videoId,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!pr.ok) return null;
    const pj = await pr.json().catch(() => null);
    const tracklist = pj?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!tracklist.length) return null;

    // Priorité aux sous-titres anglais
    const track = tracklist.find(t => /^en/i.test(t.languageCode)) || tracklist[0];
    if (!track?.baseUrl) return null;

    const subTarget = proxyBase ? `${proxyBase}/?url=${encodeURIComponent(track.baseUrl)}` : track.baseUrl;
    const subRes = await fetch(subTarget, { signal: AbortSignal.timeout(15000) });
    if (!subRes.ok) return null;
    const subText = await subRes.text();
    return parseYouTubeTimedText(subText);
  } catch (err) {
    return null;
  }
}

/**
 * Fonction universelle de récupération de sous-titres :
 * 1. Tente youtube-transcript-plus en priorité
 * 1. Tente le protocole Android Innertube 20.10.38 via le proxy Cloudflare
 * 2. Tente la route dédiée /yt/transcript du Worker
 * 3. Tente directement l'InnerTube Android (si environnement sans restriction CORS)
 */
export async function getOfficialYouTubeTranscript(videoId) {
  if (!videoId || videoId.length !== 11) return [];
  if (transcriptCache.has(videoId)) return transcriptCache.get(videoId);

  const PROXY = (import.meta.env?.VITE_PROXY_URL || "").replace(/\/$/, "");

  // 1) Essai via le protocole Android Innertube relayé par le proxy
  if (PROXY) {
    const segs = await fetchViaInnerTubeAndroid(videoId, PROXY);
    if (Array.isArray(segs) && segs.length) {
      transcriptCache.set(videoId, segs);
      return segs;
    }

    // 3) Route /yt/transcript du Cloudflare Worker
    try {
      const r = await fetch(`${PROXY}/yt/transcript?v=${videoId}`, { signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const data = await r.json().catch(() => null);
        const segments = parseYouTubeTimedText(data);
        if (segments.length) {
          transcriptCache.set(videoId, segments);
          return segments;
        }
      }
    } catch { /* échec */ }
  }

  // 4) Tente directement l'InnerTube Android sans proxy (si environnement direct sans restriction CORS)
  try {
    const directSegs = await fetchViaInnerTubeAndroid(videoId, "");
    if (Array.isArray(directSegs) && directSegs.length) {
      transcriptCache.set(videoId, directSegs);
      return directSegs;
    }
  } catch { /* pas de sous-titres dispo */ }

  return [];
}
