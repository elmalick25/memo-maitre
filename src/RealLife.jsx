// RealLife.jsx — Immersion anglais réel : catalogue vidéo + transcript interactif
// Props : callClaude, storage, setExpressions, showToast, today, isDarkMode, awardXP

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { resolveKey } from "./lib/security/apiKeys.js";
import { extractExpressions, buildWildCard } from "./EnglishInTheWild.jsx";
import AudioPlayButton from "./components/AudioPlayButton.jsx";
import { safeParseJSON } from "./lib/textUtils.js";

import {
  CATEGORIES,
  PIPED_HOSTS,
  INVIDIOUS_HOSTS,
  getRotatingFallback,
} from "./lib/realLifeCatalog.js";
import { getOfficialYouTubeTranscript } from "./lib/youtubeTranscript.js";
import { curateExpressions } from "./lib/realLifeCuration.js";

export { CATEGORIES, PIPED_HOSTS, INVIDIOUS_HOSTS, getRotatingFallback, curateExpressions };

const YT_API = "https://www.googleapis.com/youtube/v3";

// ── Vidéos d'une chaîne (par handle @...) avec pagination ────────────────────
async function fetchChannelVideos(cat, n, pageToken = "", pageNum = 1) {
  const key = resolveKey("VITE_YOUTUBE_API_KEY");
  if (key) {
    try {
      const r = await fetch(`${YT_API}/channels?part=contentDetails&forHandle=${encodeURIComponent(cat.channelHandle)}&key=${key}`, { signal: AbortSignal.timeout(12000) });
      const d = r.ok ? await r.json() : null;
      const uploads = d?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (uploads) {
        const url = `${YT_API}/playlistItems?part=snippet&maxResults=${n}&playlistId=${uploads}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}&key=${key}`;
        const r2 = await fetch(url, { signal: AbortSignal.timeout(12000) });
        const d2 = r2.ok ? await r2.json() : null;
        const list = (d2?.items || []).map(it => ({
          id: it.snippet?.resourceId?.videoId,
          title: decodeEntities(it.snippet?.title),
          channel: it.snippet?.channelTitle || cat.channelName,
          thumb: it.snippet?.thumbnails?.medium?.url,
        })).filter(v => v.id);
        if (list.length) return { list, nextPageToken: d2?.nextPageToken || "" };
      }
    } catch { /* on passe aux instances publiques */ }
  }
  for (const h of INVIDIOUS_HOSTS) {
    try {
      const r = await fetch(`${h}/api/v1/resolveurl?url=${encodeURIComponent(`https://www.youtube.com/@${cat.channelHandle}`)}`, { signal: AbortSignal.timeout(10000) });
      const ucid = r.ok ? (await r.json())?.ucid : null;
      if (!ucid) continue;
      const r2 = await fetch(`${h}/api/v1/channels/${ucid}/videos?page=${pageNum}`, { signal: AbortSignal.timeout(10000) });
      if (!r2.ok) continue;
      const d2 = await r2.json();
      const arr = Array.isArray(d2) ? d2 : (d2?.videos || []);
      const list = arr.filter(it => it.videoId).slice(0, n).map(it => ({
        id: it.videoId, title: decodeEntities(it.title || ""), channel: cat.channelName,
        thumb: `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`,
      }));
      if (list.length) return { list, nextPageToken: String(pageNum + 1) };
    } catch { /* instance suivante */ }
  }
  // Dernier recours : recherche publique filtrée sur le nom de la chaîne
  const found = await searchWithoutKey(cat.query, 50, pageNum);
  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z]/g, "");
  const mine = (Array.isArray(found) ? found : []).filter(v => norm(v.channel) === norm(cat.channelName));
  const list = (mine.length ? mine : (Array.isArray(found) ? found : [])).slice(0, n);
  return { list, nextPageToken: String(pageNum + 1) };
}


// ── Recherche par titre DANS une chaîne précise avec pagination ──────────────
const normTxt = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function matchesQuery(title, q) {
  const words = normTxt(q).split(" ").filter(w => w.length > 1);
  const t = normTxt(title);
  return words.length ? words.every(w => t.includes(w)) : true;
}
async function searchInChannel(cat, q, n, pageToken = "", pageNum = 1) {
  const key = resolveKey("VITE_YOUTUBE_API_KEY");
  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key) {
    try {
      const r = await fetch(`${YT_API}/channels?part=id,contentDetails&forHandle=${encodeURIComponent(cat.channelHandle)}&key=${key}`, { signal: AbortSignal.timeout(12000) });
      const d = r.ok ? await r.json() : null;
      const chId = d?.items?.[0]?.id;
      if (chId) {
        const url = `${YT_API}/search?part=snippet&type=video&maxResults=${Math.max(n, 25)}&channelId=${chId}&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}&key=${key}`;
        const r2 = await fetch(url, { signal: AbortSignal.timeout(12000) });
        const d2 = r2.ok ? await r2.json() : null;
        const list = (d2?.items || []).map(it => ({
          id: it.id?.videoId, title: decodeEntities(it.snippet?.title),
          channel: it.snippet?.channelTitle || cat.channelName, thumb: it.snippet?.thumbnails?.medium?.url,
        })).filter(v => v.id);
        if (list.length) return { list: list.slice(0, n), nextPageToken: d2?.nextPageToken || "" };
        // Fallback : parcourir les uploads et filtrer par titre
        const uploads = d?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        let token = pageToken, acc = [];
        for (let page = 0; uploads && page < 5 && acc.length < n; page++) {
          const r3 = await fetch(`${YT_API}/playlistItems?part=snippet&maxResults=50&playlistId=${uploads}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}&key=${key}`, { signal: AbortSignal.timeout(12000) });
          const d3 = r3.ok ? await r3.json() : null;
          if (!d3) break;
          for (const it of d3.items || []) {
            const title = decodeEntities(it.snippet?.title);
            if (matchesQuery(title, q)) acc.push({ id: it.snippet?.resourceId?.videoId, title, channel: cat.channelName, thumb: it.snippet?.thumbnails?.medium?.url });
          }
          token = d3.nextPageToken; if (!token) break;
        }
        if (acc.length) return { list: acc.slice(0, n), nextPageToken: token || "" };
      }
    } catch { /* instances publiques */ }
  }
  for (const h of INVIDIOUS_HOSTS) {
    try {
      const r = await fetch(`${h}/api/v1/resolveurl?url=${encodeURIComponent(`https://www.youtube.com/@${cat.channelHandle}`)}`, { signal: AbortSignal.timeout(10000) });
      const ucid = r.ok ? (await r.json())?.ucid : null;
      if (!ucid) continue;
      const r2 = await fetch(`${h}/api/v1/channels/${ucid}/search?q=${encodeURIComponent(q)}&page=${pageNum}`, { signal: AbortSignal.timeout(10000) });
      if (!r2.ok) continue;
      const d2 = await r2.json();
      const list = (Array.isArray(d2) ? d2 : []).filter(it => it.videoId).slice(0, n).map(it => ({
        id: it.videoId, title: decodeEntities(it.title || ""), channel: cat.channelName,
        thumb: `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`,
      }));
      if (list.length) return { list, nextPageToken: String(pageNum + 1) };
    } catch { /* instance suivante */ }
  }
  const found = await searchWithoutKey(`${q} ${cat.channelName}`, 50, pageNum);
  const mine = (Array.isArray(found) ? found : []).filter(v => norm(v.channel) === norm(cat.channelName));
  return { list: mine.slice(0, n), nextPageToken: String(pageNum + 1) };
}

// ── Transcript horodaté ─────────────────────────────────────────────────────
function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

function parseTimedText(raw) {
  const out = [];
  const matches = [...String(raw).matchAll(/<text[^>]*start="([\d.]+)"[^>]*(?:dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)];
  for (const m of matches) {
    const text = decodeEntities(m[3]);
    if (!text) continue;
    out.push({ start: parseFloat(m[1]) || 0, dur: parseFloat(m[2]) || 3, text });
  }
  return out;
}

function parseJson3(data) {
  return (data?.events || []).filter(e => e.segs).map(e => ({
    start: (e.tStartMs || 0) / 1000,
    dur: (e.dDurationMs || 3000) / 1000,
    text: decodeEntities(e.segs.map(x => x.utf8 || "").join("")),
  })).filter(x => x.text);
}

// Normalise une réponse JSON de transcript (worker maison ou service compatible)
function segmentsFromJson(data) {
  if (!data) return [];
  if (Array.isArray(data.events)) return parseJson3(data);
  const segs = data.segments || data.transcript;
  if (!Array.isArray(segs) || !segs.length || (segs[0].start == null && segs[0].offset == null)) return [];
  return segs.map(s => ({
    start: Number(s.start ?? s.offset ?? 0) > 10000 ? Number(s.start ?? s.offset) / 1000 : Number(s.start ?? s.offset ?? 0),
    dur: Number(s.dur ?? s.duration ?? 3) > 1000 ? Number(s.dur ?? s.duration) / 1000 : Number(s.dur ?? s.duration ?? 3),
    text: decodeEntities(s.text || s.content || ""),
  })).filter(s => s.text);
}

// Mémoire de session : évite de re-télécharger un transcript déjà obtenu
const transcriptMemo = new Map();

// Récupération des sous-titres horodatés via le protocole InnerTube Android 20.10.38 + fallbacks Worker
async function fetchTimedTranscript(videoId) {
  if (transcriptMemo.has(videoId)) return transcriptMemo.get(videoId);

  // 1) Protocole officiel InnerTube Android 20.10.38 (contourne le blocage BotGuard sans IA)
  try {
    const list = await getOfficialYouTubeTranscript(videoId);
    if (Array.isArray(list) && list.length) {
      transcriptMemo.set(videoId, list);
      return list;
    }
  } catch (err) {
    console.warn("[RealLife] getOfficialYouTubeTranscript fallback:", err?.message || err);
  }

  // 2) Fallback direct Cloudflare Worker route /yt/transcript
  const PROXY = (import.meta.env.VITE_PROXY_URL || "").replace(/\/$/, "");
  const WORKER_URL = import.meta.env.VITE_TRANSCRIPT_WORKER_URL;
  const tries = [];
  if (PROXY) tries.push({ kind: "proxy", url: `${PROXY}/yt/transcript?v=${videoId}` });
  if (WORKER_URL) tries.push({ kind: "worker", url: `${WORKER_URL}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}` });

  for (const t of tries) {
    try {
      const r = await fetch(t.url, { signal: AbortSignal.timeout(30000) });
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) {
        const body = await r.text().catch(() => "");
        if (r.ok) {
          const parsed = parseTimedText(body);
          if (parsed.length) { transcriptMemo.set(videoId, parsed); return parsed; }
        }
        continue;
      }
      const data = await r.json().catch(() => null);
      const segs = segmentsFromJson(data);
      if (segs.length) { transcriptMemo.set(videoId, segs); return segs; }
    } catch (e) {
      console.warn("[RealLife] Transcript indisponible via", t.kind, e?.message || e);
    }
  }
  return [];
}

// ── Recherche vidéo sans clé API (instances publiques Piped / Invidious) avec pagination ─────
async function searchWithoutKey(query, n, page = 1) {
  const p = Math.max(1, Number(page) || 1);
  for (const h of PIPED_HOSTS) {
    try {
      const r = await fetch(`${h}/search?q=${encodeURIComponent(query)}&filter=videos&page=${p}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const d = await r.json();
      const items = (d.items || d || []).filter(it => (it.url || it.id));
      const list = items.map(it => {
        const id = it.url ? String(it.url).split("v=")[1] : it.id;
        return id ? {
          id,
          title: decodeEntities(it.title || ""),
          channel: it.uploaderName || it.uploader || "",
          thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        } : null;
      }).filter(Boolean).slice(0, n);
      if (list.length) return list;
    } catch { /* instance suivante */ }
  }
  for (const h of INVIDIOUS_HOSTS) {
    try {
      const r = await fetch(`${h}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=${p}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const d = await r.json();
      const list = (Array.isArray(d) ? d : []).filter(it => it.videoId).map(it => ({
        id: it.videoId,
        title: decodeEntities(it.title || ""),
        channel: it.author || "",
        thumb: `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`,
      })).slice(0, n);
      if (list.length) return list;
    } catch { /* instance suivante */ }
  }
  return [];
}

const fmt = (s) => {
  const n = Math.max(0, Math.floor(s || 0));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};

// ── Chargement de l'API IFrame YouTube ──────────────────────────────────────
let ytApiPromise = null;
function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (typeof prev === "function") prev(); resolve(window.YT); };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function extractYouTubeId(url) {
  if (!url) return "";
  const m = String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : "";
}

// ════════════════════════════════════════════════════════════════════════════
export default function RealLife({
  callClaude,
  storage,
  setExpressions,
  expressions = [],
  showToast,
  today,
  awardXP,
  isDarkMode = true,
}) {
  const toast = useCallback((m, t = "info") => { if (showToast) showToast(m, t); }, [showToast]);

  // ── Catalogue ──
  const [catId, setCatId] = useState("ielts");
  const [count, setCount] = useState(6);
  const [videos, setVideos] = useState([]);
  const [searching, setSearching] = useState(false);
  const [freeUrl, setFreeUrl] = useState("");
  const [query, setQuery] = useState("");

  // ── Pagination & Rotation dynamique des recherches ──
  const [pageTokens, setPageTokens] = useState({});
  const [pageNumbers, setPageNumbers] = useState({});

  // ── Session ──
  const [active, setActive] = useState(null); // { id, title, channel }
  const [segments, setSegments] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [word, setWord] = useState(null);     // { w, ipa, def, loading }

  // ── Extraction "In the Wild" en arrière-plan pendant le visionnage ──
  const [wild, setWild] = useState({ status: "idle", items: [], done: 0, total: 0 }); // idle|running|ready|error|empty
  const [wildSelected, setWildSelected] = useState([]);
  const [showWild, setShowWild] = useState(false);
  const [wildPrompted, setWildPrompted] = useState(false);
  const wildRunRef = useRef(null);

  const playerRef = useRef(null);
  const tickRef = useRef(null);
  const lineRefs = useRef({});
  const transcriptContainerRef = useRef(null);
  const [autoScrollTranscript, setAutoScrollTranscript] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);

  // Option : Création automatique des fiches à la fin de la vidéo (ON/OFF)
  const [autoCreateCards, setAutoCreateCards] = useState(() => {
    try {
      const v = typeof window !== "undefined" ? localStorage.getItem("reallife_auto_create_cards") : null;
      return v === null ? true : v === "1";
    } catch { return true; }
  });

  // Restaure la dernière catégorie
  useEffect(() => {
    storage?.get?.("reallife_state").then(s => {
      if (s?.catId) setCatId(s.catId);
      if (s?.count) setCount(s.count);
      if (typeof s?.query === "string") setQuery(s.query);
      if (Array.isArray(s?.videos)) setVideos(s.videos);
    }).catch(() => { });
  }, []); // eslint-disable-line

  useEffect(() => {
    storage?.set?.("reallife_state", { catId, count, videos, query }).catch?.(() => { });
  }, [catId, count, videos, query]); // eslint-disable-line

  // ── Recherche du catalogue avec rotation continue ──
  const search = useCallback(async () => {
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];
    const n = Math.max(1, Math.min(25, Number(count) || 6));
    const q = query.trim();
    const searchScopeKey = q ? `q:${q.toLowerCase()}` : `cat:${cat.id}`;
    const curPage = pageNumbers[searchScopeKey] || 0;
    const nextPage = curPage + 1;
    const curToken = pageTokens[searchScopeKey] || "";

    setSearching(true);
    try {
      // 1. Recherche par titre textuel (requête directe utilisateur)
      if (q) {
        if (cat.channelHandle) {
          const res = await searchInChannel(cat, q, n, curToken, nextPage);
          const list = res.list || [];
          setVideos(list);
          setPageTokens(prev => ({ ...prev, [searchScopeKey]: res.nextPageToken || "" }));
          setPageNumbers(prev => ({ ...prev, [searchScopeKey]: nextPage }));
          toast(list.length ? `${list.length} vidéo(s) de ${cat.channelName} pour « ${q} » (Lot ${nextPage})` : `Aucune vidéo « ${q} » trouvée sur ${cat.channelName}.`, list.length ? "success" : "warning");
          return;
        }
        const term = q;
        const key = resolveKey("VITE_YOUTUBE_API_KEY");
        if (key) {
          try {
            const url = `${YT_API}/search?part=snippet&type=video&maxResults=${n}&videoEmbeddable=true&q=${encodeURIComponent(term)}${curToken ? `&pageToken=${encodeURIComponent(curToken)}` : ""}&key=${key}`;
            const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
            if (r.ok) {
              const d = await r.json();
              const list = (d.items || []).map(it => ({
                id: it.id?.videoId,
                title: decodeEntities(it.snippet?.title),
                channel: it.snippet?.channelTitle || "",
                thumb: it.snippet?.thumbnails?.medium?.url,
              })).filter(v => v.id);
              if (list.length) {
                setVideos(list);
                setPageTokens(prev => ({ ...prev, [searchScopeKey]: d.nextPageToken || "" }));
                setPageNumbers(prev => ({ ...prev, [searchScopeKey]: nextPage }));
                toast(`${list.length} vidéo(s) trouvée(s) pour « ${q} » (Lot ${nextPage})`, "success");
                return;
              }
            }
          } catch { /* recherche publique fallback */ }
        }
        const found = await searchWithoutKey(term, Math.max(n, 10), nextPage);
        if (found.length) {
          setVideos(found.slice(0, n));
          setPageNumbers(prev => ({ ...prev, [searchScopeKey]: nextPage }));
          toast(`${Math.min(found.length, n)} vidéo(s) trouvée(s) pour « ${q} » (Lot ${nextPage})`, "success");
        } else {
          setVideos([]);
          toast(`Aucune autre vidéo trouvée pour « ${q} » — réessaie ou colle l'URL directe.`, "warning");
        }
        return;
      }

      // 2. Chaîne officielle (Learn English With TV Series) avec pagination YouTube & Invidious
      if (cat.channelHandle) {
        const res = await fetchChannelVideos(cat, n, curToken, nextPage);
        let list = res.list || [];
        if (!list.length && cat.fallback?.length) {
          list = getRotatingFallback(cat, n, nextPage);
        }
        setVideos(list);
        setPageTokens(prev => ({ ...prev, [searchScopeKey]: res.nextPageToken || "" }));
        setPageNumbers(prev => ({ ...prev, [searchScopeKey]: nextPage }));
        toast(list.length ? `${list.length} nouvelle(s) vidéo(s) de ${cat.channelName} (Lot ${nextPage})` : "Chaîne momentanément inaccessible — réessaie ou colle une URL.", list.length ? "success" : "warning");
        return;
      }

      // 3. Recherche thématique (IELTS Speaking) avec rotation continue de requêtes et de pages
      const queriesList = Array.isArray(cat.queries) && cat.queries.length ? cat.queries : [cat.query];
      const qIndex = (nextPage - 1) % queriesList.length;
      const targetQuery = queriesList[qIndex];

      const key = resolveKey("VITE_YOUTUBE_API_KEY");
      if (key) {
        const url = `${YT_API}/search?part=snippet&type=video&maxResults=${n}&videoCaption=closedCaption&videoEmbeddable=true&relevanceLanguage=en&q=${encodeURIComponent(targetQuery)}${curToken ? `&pageToken=${encodeURIComponent(curToken)}` : ""}&key=${key}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (r.ok) {
          const d = await r.json();
          const list = (d.items || []).map(it => ({
            id: it.id?.videoId,
            title: decodeEntities(it.snippet?.title),
            channel: it.snippet?.channelTitle || "",
            thumb: it.snippet?.thumbnails?.medium?.url,
          })).filter(v => v.id);
          if (list.length) {
            setVideos(list);
            setPageTokens(prev => ({ ...prev, [searchScopeKey]: d.nextPageToken || "" }));
            setPageNumbers(prev => ({ ...prev, [searchScopeKey]: nextPage }));
            toast(`${list.length} nouvelle(s) vidéo(s) chargée(s) — ${cat.label} (Lot ${nextPage})`, "success");
            return;
          }
        }
      }

      // Sans clé (ou clé en échec) : recherche via instances publiques avec pagination
      const open = await searchWithoutKey(targetQuery, n, nextPage);
      if (open.length) {
        setVideos(open);
        setPageNumbers(prev => ({ ...prev, [searchScopeKey]: nextPage }));
        toast(`${open.length} nouvelle(s) vidéo(s) trouvée(s) — ${cat.label} (Lot ${nextPage})`, "success");
        return;
      }

      // Dernier recours : rotation cyclique continue dans la sélection curatée (garantit du contenu neuf à chaque clic)
      const list = getRotatingFallback(cat, n, nextPage);
      setVideos(list);
      setPageNumbers(prev => ({ ...prev, [searchScopeKey]: nextPage }));
      toast(`Sélection curatée renouvelée — Lot ${nextPage} (${list.length} capsules).`, "info");
    } catch (e) {
      const list = getRotatingFallback(cat, n, nextPage);
      if (list.length) {
        setVideos(list);
        setPageNumbers(prev => ({ ...prev, [searchScopeKey]: nextPage }));
        toast(`Connexion lente : Lot ${nextPage} affiché depuis la sélection.`, "warning");
      } else {
        toast("Erreur de chargement des vidéos.", "warning");
      }
    } finally {
      setSearching(false);
    }
  }, [catId, count, query, pageTokens, pageNumbers, toast]);

  // ── Ouverture d'une session ──
  const loadTranscript = useCallback(async (videoId, silent = false) => {
    setLoadingTx(true);
    try {
      const segs = await fetchTimedTranscript(videoId);
      setSegments(segs);
      if (!segs.length && !silent) {
        toast("Sous-titres horodatés indisponibles : utilise le bouton CC du lecteur, ou réessaie.", "warning");
      } else if (segs.length && silent) {
        toast(`📝 Transcript récupéré (${segs.length} lignes).`, "success");
      }
      return segs;
    } finally {
      setLoadingTx(false);
    }
  }, [toast]);

  const openVideo = useCallback(async (v) => {
    setActive(v);
    setSegments([]); setTime(0); setDuration(0); setWord(null);
    setShowTranscript(false);
    wildRunRef.current = null;
    setWild({ status: "idle", items: [], done: 0, total: 0 });
    setWildSelected([]); setShowWild(false); setWildPrompted(false);
    if (autoCreateCards) {
      await loadTranscript(v.id);
    }
  }, [loadTranscript, autoCreateCards]);

  const toggleTranscript = useCallback(() => {
    setShowTranscript(prev => {
      const next = !prev;
      if (next && active?.id && !segments.length && !loadingTx) {
        loadTranscript(active.id);
      }
      return next;
    });
  }, [active, segments.length, loadingTx, loadTranscript]);

  const closeVideo = useCallback(() => {
    try { playerRef.current?.destroy?.(); } catch { }
    playerRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    setActive(null);
    setShowTranscript(false);
  }, []);

  const toggleAutoCreateCards = useCallback(() => {
    setAutoCreateCards(prev => {
      const next = !prev;
      try { localStorage.setItem("reallife_auto_create_cards", next ? "1" : "0"); } catch {}
      toast(next ? "⚡ Création de fiches & transcription activées" : "⏸️ Mode visionnage pur : transcription et fiches désactivées", "info");
      if (next && active?.id && !segments.length && !loadingTx) {
        loadTranscript(active.id);
      } else if (!next) {
        wildRunRef.current = null;
        setSegments([]);
        setWild({ status: "idle", items: [], done: 0, total: 0 });
      }
      return next;
    });
  }, [toast, active, segments, loadingTx, loadTranscript]);

  const normFront = useCallback((v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim(), []);

  const existingDeckCardsForVideo = useMemo(() => {
    if (!active?.title || !expressions?.length) return [];
    const normTitle = normFront(active.title);
    return expressions.filter(e => {
      const cat = normFront(e.category || "");
      return cat.includes(normTitle) || (e.tags && e.tags.some(t => normFront(t).includes(normTitle)));
    });
  }, [active, expressions, normFront]);

  const alreadyInDeckCount = useMemo(() => {
    if (!wild.items.length) {
      return existingDeckCardsForVideo.length;
    }
    const existing = new Set((expressions || []).map(e => normFront(e.front)));
    return wild.items.filter(item => existing.has(normFront(item?.expr))).length;
  }, [wild.items, expressions, existingDeckCardsForVideo, normFront]);

  // ── Player YouTube ──
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !YT) return;
      try { playerRef.current?.destroy?.(); } catch { }
      playerRef.current = new YT.Player("reallife-player", {
        videoId: active.id,
        playerVars: {
          rel: 0, modestbranding: 1, cc_load_policy: 0, iv_load_policy: 3, playsinline: 1,
          enablejsapi: 1, origin: window.location.origin,
        },
        events: {
          onReady: (e) => { setDuration(e.target.getDuration() || 0); },
          onStateChange: (e) => { if (e.data === 0) setEndedTick(t => t + 1); },
        },
      });
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = setInterval(() => {
        const p = playerRef.current;
        if (p?.getCurrentTime) {
          setTime(p.getCurrentTime() || 0);
          if (!duration && p.getDuration) setDuration(p.getDuration() || 0);
        }
      }, 300);
    });
    return () => {
      cancelled = true;
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [active]); // eslint-disable-line

  // ── Lancement de l'extraction dès que le transcript est disponible ──
  useEffect(() => {
    if (!autoCreateCards || !active || !segments.length || !callClaude) return;
    if (wildRunRef.current === active.id) return;
    const runId = active.id;
    wildRunRef.current = runId;
    const full = segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
    const chunks = [];
    // Aucun plafond arbitraire : on analyse 100% de la vidéo par blocs de 6000 caractères
    for (let i = 0; i < full.length; i += 6000) chunks.push(full.slice(i, i + 6000));
    setWild({ status: "running", items: [], done: 0, total: chunks.length });
    (async () => {
      const seen = new Set();
      const all = [];
      for (let i = 0; i < chunks.length; i++) {
        if (wildRunRef.current !== runId) return;
        try {
          const parsed = await extractExpressions(callClaude, chunks[i]);
          const arr = Array.isArray(parsed) ? parsed : (parsed?.expressions || parsed?.items || []);
          for (const e of arr) {
            const k = String(e?.expr || "").toLowerCase().trim();
            if (k && !seen.has(k)) { seen.add(k); all.push(e); }
          }
        } catch (err) { console.warn("RealLife · extraction chunk échouée", err); }
        if (wildRunRef.current !== runId) return;
        setWild({ status: "running", items: [...all], done: i + 1, total: chunks.length });
      }
      if (wildRunRef.current !== runId) return;
      setWild({ status: all.length ? "ready" : "empty", items: all, done: chunks.length, total: chunks.length });
      setWildSelected(all.map((_, i) => i));
    })();
  }, [active, segments, callClaude]);

  // ── Fin de visionnage → Curation IA & Création des fiches ──
  const [endedTick, setEndedTick] = useState(0);
  const [isCurating, setIsCurating] = useState(false);
  const nearEnd = duration > 0 && time / duration >= 0.98;

  const performCurationAndCreate = useCallback(async (isAuto = false) => {
    if (!active || !wild.items.length || isCurating) return;
    setIsCurating(true);
    toast("✨ Analyse IA en cours : sélection des expressions les plus percutantes...", "info");

    let bestItems = wild.items;
    if (callClaude && wild.items.length > 6) {
      try {
        bestItems = await curateExpressions(callClaude, wild.items, active.title);
      } catch (err) {
        console.warn("RealLife curation IA fallback", err);
      }
    }

    setWild(prev => ({ ...prev, items: bestItems, isCurated: true }));
    setWildSelected(bestItems.map((_, i) => i));
    setIsCurating(false);

    if (isAuto && autoCreateCards && setExpressions) {
      const existing = new Set((expressions || []).map(e => normFront(e.front)));
      const now = Date.now();
      const cards = [];
      bestItems.forEach((e, i) => {
        const k = normFront(e?.expr);
        if (!k || existing.has(k)) return;
        existing.add(k);
        cards.push(buildWildCard(e, `reallife_${now}_${i}`, `RealLife · ${active?.title || ""}`));
      });
      if (cards.length) {
        setExpressions(prev => [...cards, ...prev]);
        toast(`✨ IA : ${cards.length} fiche(s) pépite(s) ajoutée(s) automatiquement à MemoMaster !`, "success");
        awardXP?.(cards.length * 3);
      } else {
        toast("Toutes les meilleures expressions de cette vidéo sont déjà dans ton deck !", "info");
      }
    } else {
      setShowWild(true);
    }
  }, [active, wild.items, isCurating, callClaude, autoCreateCards, setExpressions, expressions, awardXP, toast]);

  useEffect(() => {
    if (!active || wildPrompted) return;
    if (endedTick > 0 || nearEnd) {
      setWildPrompted(true);
      if (autoCreateCards) {
        performCurationAndCreate(true);
      } else {
        toast("🎬 Vidéo terminée. Expressions disponibles dans le bouton Fiches en haut !", "info");
      }
    }
  }, [endedTick, nearEnd, active, wildPrompted, autoCreateCards, performCurationAndCreate, toast]);

  const addWildCards = () => {
    if (!setExpressions) return;
    const existing = new Set((expressions || []).map(e => normFront(e.front)));
    const now = Date.now();
    const cards = [];
    wildSelected.forEach(i => {
      const e = wild.items[i];
      const k = normFront(e?.expr);
      if (!k || existing.has(k)) return;
      existing.add(k);
      cards.push(buildWildCard(e, `reallife_${now}_${i}`, `RealLife · ${active?.title || ""}`));
    });
    if (cards.length) {
      setExpressions(prev => [...cards, ...prev]);
      toast(`⚡ ${cards.length} fiche(s) ajoutée(s) à MemoMaster !`, "success");
      awardXP?.(cards.length * 2);
    } else {
      toast("Ces fiches existent déjà dans MemoMaster.", "info");
    }
    setShowWild(false);
  };

  // ── Ligne courante ──
  const currentIdx = useMemo(() => {
    if (!segments.length) return -1;
    let idx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start <= time + 0.15) idx = i; else break;
    }
    return idx;
  }, [segments, time]);

  // Défilement fluide confiné au conteneur des sous-titres (la vidéo et la page restent immobiles)
  useEffect(() => {
    if (!autoScrollTranscript || currentIdx < 0) return;
    const container = transcriptContainerRef.current;
    const el = lineRefs.current[currentIdx];
    if (container && el) {
      const targetTop = el.offsetTop - container.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2);
      container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }
  }, [currentIdx, autoScrollTranscript]);

  // ── Contrôles réflexes ──
  const seek = (t) => { try { playerRef.current?.seekTo(Math.max(0, t), true); playerRef.current?.playVideo?.(); } catch { } };
  const replay5 = () => seek((playerRef.current?.getCurrentTime?.() || 0) - 5);
  const replayLine = () => { if (currentIdx >= 0) seek(segments[currentIdx].start); };

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (e.key === "r" || e.key === "R") { e.preventDefault(); replay5(); }
      if (e.key === "l" || e.key === "L") { e.preventDefault(); replayLine(); }
      if (e.key === " ") {
        e.preventDefault();
        const p = playerRef.current;
        if (p?.getPlayerState?.() === 1) p.pauseVideo(); else p?.playVideo?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, currentIdx, segments]); // eslint-disable-line

  const retriedRef = useRef(false);
  useEffect(() => { retriedRef.current = false; }, [active?.id]);
  useEffect(() => {
    if ((autoCreateCards || showTranscript) && !loadingTx && !segments.length && active && !retriedRef.current) {
      retriedRef.current = true;
      loadTranscript(active.id, true);
    }
  }, [autoCreateCards, showTranscript, loadingTx, segments.length, active, loadTranscript]);

  // ── Clic sur un mot ──
  const onWordClick = useCallback(async (w, sentence) => {
    const clean = w.replace(/[^A-Za-z'’-]/g, "");
    if (!clean) return;
    setWord({ w: clean, loading: true, sentence });
    try {
      const raw = await callClaude?.(
        "Tu es un lexicographe. Réponds UNIQUEMENT en JSON valide.",
        `Mot : "${clean}" dans la phrase : "${sentence}".\nJSON : {"ipa":"/.../","meaning":"définition en français, en contexte, courte","example":"phrase d'exemple en anglais"}`,
        { maxTokens: 400, temperature: 0.2, json: true, task: "fast-json" }
      );
      const txt = typeof raw === "string" ? raw : String(raw?.text || raw?.content || "");
      const m = txt.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : {};
      setWord({ w: clean, sentence, ipa: parsed.ipa || "", meaning: parsed.meaning || "", example: parsed.example || sentence, loading: false });
    } catch {
      setWord({ w: clean, sentence, ipa: "", meaning: "", example: sentence, loading: false });
    }
  }, [callClaude]);

  const addToFSRS = useCallback(() => {
    if (!word || !setExpressions) return;
    const now = new Date().toISOString();
    const card = {
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 7),
      front: word.w,
      back: [word.ipa, word.meaning].filter(Boolean).join(" — ") || word.sentence || "",
      example: word.example || word.sentence || "",
      category: "Anglais",
      type: "qa",
      level: 0,
      nextReview: typeof today === "function" ? today() : new Date().toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now,
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewHistory: [],
      source: `RealLife · ${active?.title || ""}`,
    };
    setExpressions(prev => [card, ...prev]);
    toast(`🧠 "${word.w}" ajouté à tes révisions FSRS.`, "success");
    setWord(null);
    awardXP?.(5);
  }, [word, setExpressions, today, active, toast, awardXP]);

  // ── Design Tokens & Couleurs (Adaptatifs Jour/Nuit & Design System) ──
  const royalBlue = "var(--mm-primary, #6366F1)";
  const royalBlueDark = "var(--mm-primary-hover, #4F46E5)";
  const royalBlueSoft = "color-mix(in srgb, var(--mm-primary, #6366F1) 12%, transparent)";
  const royalBlueBorder = "color-mix(in srgb, var(--mm-primary, #6366F1) 28%, transparent)";

  const cardStyle = {
    background: isDarkMode ? "color-mix(in srgb, var(--mm-bg-surface, #0f172a) 85%, transparent)" : "#FFFFFF",
    border: `1px solid ${isDarkMode ? "color-mix(in srgb, var(--mm-border, #ffffff) 10%, transparent)" : "color-mix(in srgb, var(--mm-border, #0f172a) 10%, transparent)"}`,
    borderRadius: 20,
    padding: 22,
    boxShadow: isDarkMode ? "0 8px 32px rgba(0, 0, 0, 0.35)" : "0 4px 20px rgba(0, 0, 0, 0.05)",
  };

  const txtColor = isDarkMode ? "var(--mm-fg, #F1F5F9)" : "var(--mm-fg, #0F172A)";
  const dimColor = isDarkMode ? "var(--mm-fg-muted, rgba(241, 245, 249, 0.65))" : "var(--mm-fg-muted, rgba(15, 23, 42, 0.65))";
  const inputBg = isDarkMode ? "color-mix(in srgb, var(--mm-bg, #000000) 45%, transparent)" : "var(--mm-bg-elev, #F8FAFC)";
  const inputBorder = isDarkMode ? "color-mix(in srgb, var(--mm-border, #ffffff) 14%, transparent)" : "color-mix(in srgb, var(--mm-border, #0f172a) 14%, transparent)";

  // ════════════════════════ VUE CATALOGUE ════════════════════════
  if (!active) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>


        {/* Barre de Recherche & Filtres */}
        <div style={cardStyle}>
          {/* Grille 2 par 2 des catégories */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10,
            marginBottom: 16,
            width: "100%",
          }}>
            {CATEGORIES.map(c => {
              const activeCat = catId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCatId(c.id)}
                  className="hov"
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: 14,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    color: activeCat ? "#FFFFFF" : txtColor,
                    background: activeCat ? `linear-gradient(135deg, ${royalBlue}, ${royalBlueDark})` : (isDarkMode ? "rgba(255, 255, 255, 0.04)" : "#F8FAFC"),
                    border: `1px solid ${activeCat ? "transparent" : inputBorder}`,
                    boxShadow: activeCat ? "0 4px 14px color-mix(in srgb, var(--mm-primary, #6366F1) 35%, transparent)" : "none",
                    transition: "all 0.18s ease",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{c.icon}</span>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                </button>
              );
            })}
          </div>

          {/* Ligne recherche par titre */}
          <div style={{ display: "flex", gap: 10, width: "100%", marginBottom: 12 }}>
            <input
              placeholder="Tape le nom d'une vidéo pour la trouver (ex. Learn English with Friends)…"
              value={query}
              onChange={e => {
                const val = e.target.value;
                setQuery(val);
                if (val.trim()) setCount(1);
              }}
              onKeyDown={e => { if (e.key === "Enter" && !searching) search(); }}
              style={{
                flex: 1,
                padding: "11px 14px",
                borderRadius: 12,
                color: txtColor,
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                fontSize: 13,
              }}
            />
          </div>

          {/* Ligne Vidéos pleine largeur */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", marginBottom: 12 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "#F8FAFC",
              border: `1px solid ${inputBorder}`,
              borderRadius: 12,
              padding: "6px 12px",
            }}>
              <label style={{ color: dimColor, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Vidéos
              </label>
              <input
                type="number"
                min={1}
                max={25}
                value={count}
                onChange={e => setCount(e.target.value)}
                style={{
                  width: 55,
                  padding: "6px 4px",
                  borderRadius: 8,
                  color: txtColor,
                  background: isDarkMode ? "rgba(0, 0, 0, 0.3)" : "#FFFFFF",
                  border: `1px solid ${inputBorder}`,
                  fontWeight: 800,
                  fontSize: 14,
                  textAlign: "center",
                }}
              />
            </div>

            <button
              onClick={search}
              disabled={searching}
              className="hov"
              style={{
                flex: 1,
                padding: "12px 18px",
                borderRadius: 12,
                border: "none",
                cursor: searching ? "not-allowed" : "pointer",
                background: `linear-gradient(135deg, ${royalBlue}, ${royalBlueDark})`,
                color: "#FFFFFF",
                fontWeight: 800,
                fontSize: 14,
                boxShadow: "0 4px 14px color-mix(in srgb, var(--mm-primary, #6366F1) 30%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span>{searching ? "⏳" : ((pageNumbers[query.trim() ? `q:${query.trim().toLowerCase()}` : `cat:${catId}`] || 0) > 0 ? "🔄" : "🔍")}</span>
              <span>
                {searching
                  ? "Recherche en cours…"
                  : (pageNumbers[query.trim() ? `q:${query.trim().toLowerCase()}` : `cat:${catId}`] || 0) > 0
                    ? `Nouvelles vidéos (Lot ${(pageNumbers[query.trim() ? `q:${query.trim().toLowerCase()}` : `cat:${catId}`] || 0) + 1})`
                    : "Rechercher"}
              </span>
            </button>
          </div>

          {/* Ligne URL YouTube directe pleine largeur */}
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <input
              placeholder="…ou colle une URL YouTube directe"
              value={freeUrl}
              onChange={e => setFreeUrl(e.target.value)}
              style={{
                flex: 1,
                padding: "11px 14px",
                borderRadius: 12,
                color: txtColor,
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                fontSize: 13,
              }}
            />
            <button
              className="hov"
              onClick={() => {
                const id = extractYouTubeId(freeUrl);
                if (!id) { toast("URL YouTube invalide.", "error"); return; }
                openVideo({ id, title: "Vidéo personnalisée", channel: "Source YouTube" });
              }}
              style={{
                padding: "11px 18px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 13,
                background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#F8FAFC",
                color: txtColor,
                border: `1px solid ${inputBorder}`,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
              }}
            >
              <span>▶</span>
              <span>Ouvrir</span>
            </button>
          </div>
        </div>

        {/* Grille des Vidéos */}
        {videos.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {videos.map(v => (
              <button
                key={v.id}
                onClick={() => openVideo(v)}
                className="hov"
                style={{
                  ...cardStyle,
                  padding: 0,
                  overflow: "hidden",
                  textAlign: "left",
                  cursor: "pointer",
                  border: `1px solid ${inputBorder}`,
                  transition: "transform 0.18s ease, box-shadow 0.18s ease",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000" }}>
                  <img
                    src={v.thumb}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 10,
                  }}>
                    <span style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      background: "rgba(37, 99, 235, 0.9)",
                      color: "#FFFFFF",
                      backdropFilter: "blur(4px)",
                    }}>
                      ▶ Démarrer session
                    </span>
                  </div>
                </div>
                <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: txtColor, lineHeight: 1.45, marginBottom: 6 }}>
                    {v.title}
                  </div>
                  <div style={{ fontSize: 11, color: dimColor, fontWeight: 600 }}>
                    {v.channel}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : !searching && (
          <div style={{ ...cardStyle, textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎬</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: txtColor, marginBottom: 6 }}>Aucune vidéo sélectionnée</div>
            <div style={{ fontSize: 13, color: dimColor, maxWidth: 420, margin: "0 auto", lineHeight: 1.5 }}>
              Choisis une capsule ci-dessus ou colle un lien YouTube direct pour lancer la vidéo avec transcript interactif.
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════ VUE SESSION ════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Barre Supérieure Vidéo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={closeVideo}
          className="hov"
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            cursor: "pointer",
            background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#FFFFFF",
            color: txtColor,
            border: `1px solid ${inputBorder}`,
            fontWeight: 800,
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>←</span>
          <span>Catalogue</span>
        </button>

        <div style={{ fontWeight: 900, color: txtColor, fontSize: 15, flex: 1, minWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {active.title}
        </div>
        <button
          onClick={toggleAutoCreateCards}
          className="hov"
          title={autoCreateCards ? "Mode apprentissage actif (fiches et transcription) : clique pour passer en visionnage pur" : "Mode visionnage pur : clique pour activer la transcription et les fiches"}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            cursor: "pointer",
            background: autoCreateCards ? "rgba(99, 102, 241, 0.22)" : "rgba(255, 255, 255, 0.05)",
            color: autoCreateCards ? (isDarkMode ? "#C4B5FD" : "#4338CA") : dimColor,
            border: `1px solid ${autoCreateCards ? "rgba(99, 102, 241, 0.45)" : inputBorder}`,
            fontWeight: 800,
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.2s ease",
            boxShadow: autoCreateCards ? "0 2px 10px rgba(99, 102, 241, 0.2)" : "none",
          }}
        >
          <span>{autoCreateCards ? "⚡ Mode Fiches : ON" : "🎬 Visionnage pur"}</span>
        </button>

        {/* Le bouton d'action des fiches n'apparaît que s'il est pertinent : soit en mode Fiches actif, soit si des fiches ont déjà été créées */}
        {(alreadyInDeckCount > 0 || autoCreateCards) && (
          <button
            onClick={() => {
              if (wild.items.length || existingDeckCardsForVideo.length) setShowWild(true);
            }}
            className="hov"
            title={
              alreadyInDeckCount > 0
                ? `${alreadyInDeckCount} fiche(s) de cette vidéo sont déjà créées et enregistrées dans MemoMaster. Clique pour les voir.`
                : "Voir les fiches extraites par l'IA"
            }
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              cursor: "pointer",
              background: alreadyInDeckCount > 0 ? "rgba(34, 197, 94, 0.16)" : royalBlueSoft,
              color: alreadyInDeckCount > 0 ? (isDarkMode ? "#86EFAC" : "#15803D") : txtColor,
              border: `1px solid ${alreadyInDeckCount > 0 ? "rgba(34, 197, 94, 0.35)" : royalBlueBorder}`,
              fontWeight: 800,
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s ease",
            }}
          >
            {alreadyInDeckCount > 0 ? `✅ ${alreadyInDeckCount} fiche(s) créée(s)` : (
              <>
                {wild.status === "running" && `⛏️ Extraction… ${wild.done}/${wild.total} · ${wild.items.length} fiche(s)`}
                {wild.status === "ready" && (wild.isCurated ? `✨ ${wild.items.length} pépite(s) prête(s)` : `🃏 ${wild.items.length} fiche(s) prêtes`)}
                {wild.status === "empty" && "🃏 Aucune fiche"}
                {wild.status === "idle" && (loadingTx ? "⏳ Transcript…" : segments.length ? "⛏️ Extraction…" : "🃏 Fiches")}
              </>
            )}
          </button>
        )}
      </div>

      {/* Lecteur Vidéo & Dock Contrôles (taille compacte centrée) */}
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden", maxWidth: 560, width: "100%", margin: "0 auto" }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000" }}>
          <div id="reallife-player" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        </div>

        {/* Barre de Commandes Rapides */}
        <div style={{
          padding: "12px 16px",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          borderTop: `1px solid ${inputBorder}`,
          background: isDarkMode ? "rgba(0, 0, 0, 0.2)" : "#F8FAFC",
        }}>
          <button
            onClick={replay5}
            className="hov"
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12,
              color: txtColor,
              background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#FFFFFF",
              border: `1px solid ${inputBorder}`,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>⏪</span>
            <span>−5s</span>
            <kbd style={{ fontSize: 10, opacity: 0.7, padding: "1px 4px", borderRadius: 4, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" }}>R</kbd>
          </button>

          <button
            onClick={replayLine}
            disabled={currentIdx < 0}
            className="hov"
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              cursor: currentIdx < 0 ? "not-allowed" : "pointer",
              fontWeight: 800,
              fontSize: 12,
              color: txtColor,
              opacity: currentIdx < 0 ? 0.45 : 1,
              background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#FFFFFF",
              border: `1px solid ${inputBorder}`,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🔁</span>
            <span>Répéter phrase</span>
            <kbd style={{ fontSize: 10, opacity: 0.7, padding: "1px 4px", borderRadius: 4, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" }}>L</kbd>
          </button>

          <div style={{ color: dimColor, fontSize: 12, fontWeight: 700, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
            {fmt(time)} / {fmt(duration)}
          </div>
        </div>

      </div>

      {/* Emplacement Transcript : Bouton pour afficher la transcription */}
      {!showTranscript && (
        <div style={{
          ...cardStyle,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>📝</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: txtColor }}>
                Sous-titres & Transcription
              </div>
              <div style={{ fontSize: 12, color: dimColor }}>
                {segments.length > 0
                  ? `${segments.length} segments horodatés disponibles pour cette vidéo`
                  : "Transcription interactive avec suivi dynamique et décodage de mots au clic"}
              </div>
            </div>
          </div>

          <button
            onClick={toggleTranscript}
            className="hov"
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 13,
              color: royalBlue,
              background: royalBlueSoft,
              border: `1px solid ${royalBlueBorder}`,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <span>{loadingTx ? "⏳" : "📝"}</span>
            <span>{loadingTx ? "Chargement des sous-titres…" : "Afficher les transcriptions ▼"}</span>
            {segments.length > 0 && !loadingTx && (
              <span style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                background: royalBlue,
                color: "#fff",
                fontWeight: 800,
              }}>
                {segments.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Transcript Intelligent Interactif (affiché à la demande) */}
      {showTranscript && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, color: txtColor, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>📝</span>
              <span>Smart Transcript Interactif</span>
              {segments.length > 0 && (
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 999, background: royalBlueSoft, color: royalBlue, fontWeight: 800 }}>
                  {segments.length} segments
                </span>
              )}
            </div>
            <div style={{ color: dimColor, fontSize: 12, marginLeft: "auto", fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>Clique sur un mot pour sa définition</span>
              <button
                onClick={() => setAutoScrollTranscript(p => !p)}
                className="hov"
                title={autoScrollTranscript ? "Le sous-titre actif défile dans ce cadre (la vidéo reste immobile en haut)" : "Défilement automatique des sous-titres désactivé"}
                style={{
                  padding: "4px 9px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  background: autoScrollTranscript ? royalBlueSoft : "transparent",
                  color: autoScrollTranscript ? royalBlue : dimColor,
                  border: `1px solid ${autoScrollTranscript ? royalBlueBorder : inputBorder}`,
                }}
              >
                {autoScrollTranscript ? "📜 Suivi auto : ON" : "📜 Suivi auto : OFF"}
              </button>
              <button
                onClick={() => setShowTranscript(false)}
                className="hov"
                title="Masquer la transcription"
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 800,
                  background: isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#F1F5F9",
                  color: txtColor,
                  border: `1px solid ${inputBorder}`,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                ✕ Masquer les sous-titres ▲
              </button>
            </div>
          </div>

          {loadingTx && (
            <div style={{ color: dimColor, fontSize: 13, padding: "16px 0", textAlign: "center" }}>
              ⏳ Récupération et synchronisation des sous-titres horodatés…
            </div>
          )}

          {!loadingTx && !segments.length && (
            <div style={{ color: dimColor, fontSize: 13, lineHeight: 1.6, padding: "10px 0" }}>
              Transcript horodaté non disponible directement : utilise les sous-titres natifs YouTube (bouton CC dans le lecteur).
              <div style={{ marginTop: 10 }}>
                <button
                  className="hov"
                  onClick={() => active && loadTranscript(active.id, false)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 12,
                    color: txtColor,
                    background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#FFFFFF",
                    border: `1px solid ${inputBorder}`,
                  }}
                >
                  🔄 Réessayer le transcript
                </button>
              </div>
            </div>
          )}

          {segments.length > 0 && (
            <div
              ref={transcriptContainerRef}
              style={{
                maxHeight: 360,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                paddingRight: 6,
              }}
            >
              {segments.map((s, i) => {
                const isCur = i === currentIdx;
                return (
                  <div
                    key={i}
                    ref={el => (lineRefs.current[i] = el)}
                    onDoubleClick={() => seek(s.start)}
                    className="reallife-line"
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: isCur ? royalBlueSoft : "transparent",
                      borderLeft: isCur ? `3px solid ${royalBlue}` : "3px solid transparent",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <button
                      onClick={() => seek(s.start)}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: isCur ? royalBlue : dimColor,
                        fontSize: 11,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        padding: 0,
                        minWidth: 42,
                        textAlign: "left",
                      }}
                    >
                      {fmt(s.start)}
                    </button>

                    <div
                      style={{
                        flex: 1,
                        color: txtColor,
                        fontSize: 14,
                        lineHeight: 1.65,
                      }}
                    >
                      {s.text.split(/\s+/).map((w, j) => (
                        <span
                          key={j}
                          onClick={() => onWordClick(w, s.text)}
                          style={{ cursor: "pointer", borderRadius: 3, padding: "1px 2px" }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = royalBlueSoft;
                            e.currentTarget.style.color = royalBlue;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "inherit";
                          }}
                        >
                          {w}{" "}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Popover Mot Décodé */}
      {word && (
        <div style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: 2000,
          width: 320,
          ...cardStyle,
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          border: `1px solid ${royalBlueBorder}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 17, color: royalBlue }}>{word.w}</div>
            <AudioPlayButton text={word.w} size="sm" showLabel={false} isDarkMode={isDarkMode} />
            <button
              onClick={() => setWord(null)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: dimColor,
                cursor: "pointer",
                fontSize: 16,
                padding: "2px 6px",
              }}
            >
              ✕
            </button>
          </div>

          {word.loading ? (
            <div style={{ color: dimColor, fontSize: 13, marginTop: 8 }}>
              ⏳ Décodage du sens en contexte…
            </div>
          ) : (
            <>
              {word.ipa && (
                <div style={{ color: royalBlue, fontSize: 13, marginTop: 4, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {word.ipa}
                </div>
              )}
              <div style={{ color: txtColor, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                {word.meaning || "Définition indisponible."}
              </div>
              {word.example && (
                <div style={{ color: dimColor, fontSize: 12, marginTop: 8, fontStyle: "italic", borderLeft: `2px solid ${royalBlueBorder}`, paddingLeft: 8 }}>
                  “{word.example}”
                </div>
              )}
              <button
                onClick={addToFSRS}
                className="hov"
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: "9px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: `linear-gradient(135deg, ${royalBlue}, ${royalBlueDark})`,
                  color: "#FFFFFF",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                }}
              >
                + Ajouter aux cartes FSRS
              </button>
            </>
          )}
        </div>
      )}
      {showWild && (
        <div onClick={() => setShowWild(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: "min(720px, 100%)", maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: txtColor, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span>{wild.isCurated ? "✨ Pépites sélectionnées par l'IA" : "🃏 Fiches extraites de la vidéo"}</span>
                {alreadyInDeckCount > 0 && (
                  <span style={{ fontSize: 12, background: "rgba(34, 197, 94, 0.16)", color: isDarkMode ? "#86EFAC" : "#15803D", padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>
                    ✅ {alreadyInDeckCount} déjà créée(s) dans ton deck
                  </span>
                )}
              </div>
              {wild.items.length > 6 && (
                <button
                  disabled={isCurating}
                  onClick={() => performCurationAndCreate(false)}
                  className="hov"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    cursor: isCurating ? "wait" : "pointer",
                    background: "rgba(99, 102, 241, 0.15)",
                    color: isDarkMode ? "#A5B4FC" : "#4338CA",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {isCurating ? "⏳ Orpaillage IA..." : "✨ Orpailler avec l'IA"}
                </button>
              )}
            </div>
            <div style={{ fontSize: 13, color: dimColor }}>
              {wild.isCurated && "L'IA a passé en revue tout le transcript pour retenir uniquement les expressions idiomatiques et structures natives les plus intéressantes."}
              {!wild.isCurated && wild.status === "running" && `Extraction en cours (${wild.done}/${wild.total})… les fiches apparaissent au fur et à mesure.`}
              {!wild.isCurated && wild.status === "ready" && "Sélectionne les fiches à ajouter à tes révisions."}
              {wild.status === "empty" && "Aucune expression exploitable n'a été trouvée."}
              {wild.status === "idle" && (segments.length ? "Préparation de l'analyse…" : "Cette capsule n'a pas de sous-titres fournis par son auteur sur YouTube : active le bouton CC dans le lecteur ou choisis une capsule avec sous-titres.")}
            </div>
            {wild.items.map((e, i) => {
              const on = wildSelected.includes(i);
              const isAlreadyAdded = expressions.some(exp => normFront(exp.front) === normFront(e.expr));
              return (
                <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 12, cursor: "pointer", border: `1px solid ${on ? royalBlueBorder : inputBorder}`, background: on ? royalBlueSoft : "transparent" }}>
                  <input type="checkbox" checked={on} onChange={() => setWildSelected(p => on ? p.filter(x => x !== i) : [...p, i])} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 800, color: txtColor, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>{e.expr}</span>
                      <span onClick={ev => ev.preventDefault()}><AudioPlayButton text={e.expr} size="sm" showLabel={false} isDarkMode={isDarkMode} /></span>
                      {e.ipa ? <span style={{ fontWeight: 500, color: dimColor, fontSize: 12 }}>· {e.ipa}</span> : null}
                      {isAlreadyAdded && (
                        <span style={{ fontSize: 11, background: "rgba(34, 197, 94, 0.16)", color: isDarkMode ? "#86EFAC" : "#15803D", padding: "2px 7px", borderRadius: 6, fontWeight: 700 }}>
                          ✅ Déjà créée
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: dimColor }}>{e.meaning}</div>
                    {(e.examples || []).slice(0, 3).map((ex, j) => {
                      const en = typeof ex === "string" ? ex : ex?.en;
                      if (!en) return null;
                      return (
                        <div key={j} style={{ fontSize: 12, color: dimColor, fontStyle: "italic", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                          <span onClick={ev => ev.preventDefault()}><AudioPlayButton text={en} size="sm" showLabel={false} isDarkMode={isDarkMode} /></span>
                          <span>“{en}”{ex?.fr ? <span style={{ fontStyle: "normal", opacity: 0.8 }}> — {ex.fr}</span> : null}</span>
                        </div>
                      );
                    })}
                  </div>
                </label>
              );
            })}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {wild.items.length > 0 && (
                <button onClick={() => setWildSelected(wildSelected.length === wild.items.length ? [] : wild.items.map((_, i) => i))} style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${inputBorder}`, background: "transparent", color: txtColor, fontWeight: 700, cursor: "pointer" }}>
                  {wildSelected.length === wild.items.length ? "Tout désélectionner" : "Tout sélectionner"}
                </button>
              )}
              <button onClick={() => setShowWild(false)} style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${inputBorder}`, background: "transparent", color: txtColor, fontWeight: 700, cursor: "pointer" }}>Plus tard</button>
              <button disabled={!wildSelected.length} onClick={addWildCards} style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${royalBlue}, ${royalBlueDark})`, color: "#FFFFFF", fontWeight: 800, cursor: wildSelected.length ? "pointer" : "not-allowed", opacity: wildSelected.length ? 1 : 0.5 }}>
                + Ajouter {wildSelected.length} fiche(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
