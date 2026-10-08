// RealLife.jsx — Immersion anglais réel : catalogue vidéo + lecteur 3 passes
// Protocole d'or : Passe 1 SANS sous-titres (verrouillés) → Passe 2 AVEC (blur/peek + transcript cliquable) → Passe 3 SANS.
// Props : callClaude, storage, setExpressions, showToast, today, isDarkMode, awardXP

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { resolveKey } from "./lib/security/apiKeys.js";
import { extractExpressions, buildWildCard } from "./EnglishInTheWild.jsx";

// ── Catalogue : catégories + requêtes de recherche ──────────────────────────
const CATEGORIES = [
  {
    id: "ielts",
    icon: "🎓",
    label: "IELTS Speaking",
    query: "IELTS speaking test band 8 full interview",
    fallback: ["MOfDdaVeCFo", "Q-oOOGkVs_Y", "9V-hltafDrY", "3TQjWo1TA8I", "l0iGnP0Vw4Q", "5J3Q0YQEDkE"],
  },
  {
    id: "leaders",
    icon: "🏛️",
    label: "Leaders & Speech",
    query: "Obama Trump Steve Jobs famous speech english",
    fallback: ["UF8uR6Z6KLc", "Bhu6endZ_9E", "d-diB65scQU", "Hq38pgSlF4Q", "1AT5klu_yAQ", "TBuIGBCF9jc"],
  },
  {
    id: "realtalk",
    icon: "🎤",
    label: "Real Talk & Accents",
    query: "street interview native english accents talk show",
    fallback: ["MMkGvo_MJoc", "9Nlqzz3Zn1s", "N4-eZzWLFtM", "0Q0dGKvA0Bk", "z6EchXyieos", "eIho2S0ZahI"],
  },
  {
    id: "podcast",
    icon: "🎧",
    label: "Podcasts & TED",
    query: "TED talk english fast natural speech",
    fallback: ["arj7oStGLkU", "8S0FDjFBj8o", "Ks-_Mh1QhMc", "iCvmsMzlF7o", "H14bBuluwB8", "RcGyVTAoXEU"],
  },
];

// Chaîne YouTube dédiée (vidéos de la chaîne elle-même, pas une recherche)
CATEGORIES.push({
  id: "tvseries",
  icon: "📺",
  label: "Learn English With TV Series",
  query: "Learn English With TV Series",
  channelHandle: "LearnEnglishWithTVSeries",
  channelName: "Learn English With TV Series",
  fallback: [],
});

const YT_API = "https://www.googleapis.com/youtube/v3";

// ── Vidéos d'une chaîne (par handle @...) ───────────────────────────────────
async function fetchChannelVideos(cat, n) {
  const key = resolveKey("VITE_YOUTUBE_API_KEY");
  if (key) {
    try {
      const r = await fetch(`${YT_API}/channels?part=contentDetails&forHandle=${encodeURIComponent(cat.channelHandle)}&key=${key}`, { signal: AbortSignal.timeout(12000) });
      const d = r.ok ? await r.json() : null;
      const uploads = d?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (uploads) {
        const r2 = await fetch(`${YT_API}/playlistItems?part=snippet&maxResults=${n}&playlistId=${uploads}&key=${key}`, { signal: AbortSignal.timeout(12000) });
        const d2 = r2.ok ? await r2.json() : null;
        const list = (d2?.items || []).map(it => ({
          id: it.snippet?.resourceId?.videoId,
          title: decodeEntities(it.snippet?.title),
          channel: it.snippet?.channelTitle || cat.channelName,
          thumb: it.snippet?.thumbnails?.medium?.url,
        })).filter(v => v.id);
        if (list.length) return list;
      }
    } catch { /* on passe aux instances publiques */ }
  }
  for (const h of INVIDIOUS_HOSTS) {
    try {
      const r = await fetch(`${h}/api/v1/resolveurl?url=${encodeURIComponent(`https://www.youtube.com/@${cat.channelHandle}`)}`, { signal: AbortSignal.timeout(10000) });
      const ucid = r.ok ? (await r.json())?.ucid : null;
      if (!ucid) continue;
      const r2 = await fetch(`${h}/api/v1/channels/${ucid}/videos`, { signal: AbortSignal.timeout(10000) });
      if (!r2.ok) continue;
      const d2 = await r2.json();
      const arr = Array.isArray(d2) ? d2 : (d2?.videos || []);
      const list = arr.filter(it => it.videoId).slice(0, n).map(it => ({
        id: it.videoId, title: decodeEntities(it.title || ""), channel: cat.channelName,
        thumb: `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`,
      }));
      if (list.length) return list;
    } catch { /* instance suivante */ }
  }
  // Dernier recours : recherche publique filtrée sur le nom de la chaîne
  const found = await searchWithoutKey(cat.query, 50);
  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z]/g, "");
  const mine = found.filter(v => norm(v.channel) === norm(cat.channelName));
  return (mine.length ? mine : found).slice(0, n);
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

const PIPED_HOSTS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.drgns.space",
];
const INVIDIOUS_HOSTS = [
  "https://invidious.privacydev.net",
  "https://inv.nadeko.net",
  "https://yewtu.be",
  "https://invidious.f5.si",
];
// Proxies CORS utilisés uniquement en dernier recours pour les sous-titres YouTube natifs
const CORS_PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

async function fetchTimedTranscript(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const WORKER_URL = import.meta.env.VITE_TRANSCRIPT_WORKER_URL;
  const tries = [];
  if (WORKER_URL) tries.push({ kind: "worker", url: `${WORKER_URL}?url=${encodeURIComponent(videoUrl)}` });
  for (const h of PIPED_HOSTS) tries.push({ kind: "piped", url: `${h}/streams/${videoId}` });
  for (const h of INVIDIOUS_HOSTS) tries.push({ kind: "invidious", url: `${h}/api/v1/captions/${videoId}` });
  // Dernier recours : piste timedtext YouTube via un proxy CORS
  for (const lang of ["en", "en-US", "en-GB"]) {
    const direct = `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}`;
    for (const mk of CORS_PROXIES) tries.push({ kind: "timedtext", url: mk(direct) });
  }

  for (const t of tries) {
    try {
      const r = await fetch(t.url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("json")) {
        const data = await r.json();
        const segs = data.segments || data.transcript;
        if (Array.isArray(segs) && segs.length && (segs[0].start != null || segs[0].offset != null)) {
          return segs.map(s => ({
            start: Number(s.start ?? s.offset ?? 0) > 10000 ? Number(s.start ?? s.offset) / 1000 : Number(s.start ?? s.offset ?? 0),
            dur: Number(s.dur ?? s.duration ?? 3) > 1000 ? Number(s.dur ?? s.duration) / 1000 : Number(s.dur ?? s.duration ?? 3),
            text: decodeEntities(s.text || s.content || ""),
          })).filter(s => s.text);
        }
        const list = data.subtitles || data.captions;
        if (Array.isArray(list) && list.length) {
          const origin = new URL(t.url).origin;
          const ordered = [
            ...list.filter(c => /^en/i.test(c.code || c.languageCode || c.label || "")),
            ...list,
          ];
          for (const pick of ordered) {
            let url = pick.url;
            if (url && url.startsWith("/")) url = origin + url;
            if (!url) continue;
            try {
              const cr = await fetch(url, { signal: AbortSignal.timeout(12000) });
              if (!cr.ok) continue;
              const parsed = parseTimedText(await cr.text());
              if (parsed.length) return parsed;
            } catch { /* piste suivante */ }
          }
        }
      } else {
        const parsed = parseTimedText(await r.text());
        if (parsed.length) return parsed;
      }
    } catch { /* on essaie la source suivante */ }
  }
  return [];
}

// ── Recherche vidéo sans clé API (instances publiques Piped / Invidious) ─────
async function searchWithoutKey(query, n) {
  for (const h of PIPED_HOSTS) {
    try {
      const r = await fetch(`${h}/search?q=${encodeURIComponent(query)}&filter=videos`, { signal: AbortSignal.timeout(10000) });
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
      const r = await fetch(`${h}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { signal: AbortSignal.timeout(10000) });
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

  // ── Session ──
  const [active, setActive] = useState(null); // { id, title, channel }
  const [pass, setPass] = useState(1);        // 1 blind · 2 decoding · 3 mastery
  const [unlocked, setUnlocked] = useState(false); // sous-titres débloqués ?
  const [peek, setPeek] = useState(false);    // survol → révélation
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

  // ── Recherche du catalogue ──
  const search = useCallback(async () => {
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];
    const n = Math.max(1, Math.min(25, Number(count) || 6));
    setSearching(true);
    try {
      // Recherche par titre : l'utilisateur a tapé le nom d'une vidéo
      const q = query.trim();
      if (q) {
        const term = cat.channelHandle ? `${q} ${cat.channelName}` : q;
        const key = resolveKey("VITE_YOUTUBE_API_KEY");
        if (key) {
          try {
            const r = await fetch(`${YT_API}/search?part=snippet&type=video&maxResults=${n}&videoCaption=closedCaption&videoEmbeddable=true&relevanceLanguage=en&q=${encodeURIComponent(term)}&key=${key}`, { signal: AbortSignal.timeout(12000) });
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
                toast(`${list.length} vidéo(s) trouvée(s) pour « ${q} »`, "success");
                return;
              }
            }
          } catch { /* on tente la recherche publique */ }
        }
        const found = await searchWithoutKey(term, Math.max(n, 10));
        if (found.length) {
          setVideos(found.slice(0, n));
          toast(`${Math.min(found.length, n)} vidéo(s) trouvée(s) pour « ${q} »`, "success");
        } else {
          setVideos([]);
          toast(`Aucune vidéo trouvée pour « ${q} » — vérifie le titre ou colle l'URL directe.`, "warning");
        }
        return;
      }
      if (cat.channelHandle) {
        const list = await fetchChannelVideos(cat, n);
        setVideos(list);
        toast(list.length ? `${list.length} vidéo(s) de la chaîne ${cat.channelName}` : "Chaîne momentanément inaccessible — réessaie ou colle une URL.", list.length ? "success" : "warning");
        return;
      }
      const key = resolveKey("VITE_YOUTUBE_API_KEY");
      if (key) {
        const url = `${YT_API}/search?part=snippet&type=video&maxResults=${n}&videoCaption=closedCaption&videoEmbeddable=true&relevanceLanguage=en&q=${encodeURIComponent(cat.query)}&key=${key}`;
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
            toast(`${list.length} vidéo(s) trouvée(s) — ${cat.label}`, "success");
            return;
          }
        }
      }
      // Sans clé (ou clé en échec) : recherche via instances publiques
      const open = await searchWithoutKey(cat.query, n);
      if (open.length) {
        setVideos(open);
        toast(`${open.length} vidéo(s) trouvée(s) — ${cat.label} (recherche publique)`, "success");
        return;
      }
      // Dernier recours : sélection curatée
      const list = cat.fallback.slice(0, n).map(id => ({
        id, title: `${cat.label} — capsule ${id}`, channel: "Sélection curatée",
        thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      }));
      setVideos(list);
      toast(`Recherche en ligne indisponible — ${list.length} capsule(s) curatée(s) affichée(s).`, "info");
    } catch (e) {
      let list = [];
      try { list = await searchWithoutKey(cat.query, n); } catch { /* ignore */ }
      if (!list.length) {
        list = cat.fallback.slice(0, n).map(id => ({
          id, title: `${cat.label} — capsule ${id}`, channel: "Sélection curatée",
          thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        }));
        toast("Recherche échouée — sélection curatée affichée.", "warning");
      } else {
        toast(`${list.length} vidéo(s) trouvée(s) (recherche publique).`, "success");
      }
      setVideos(list);
    } finally {
      setSearching(false);
    }
  }, [catId, count, query, toast]);

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
    const isTv = catId === "tvseries" || v?.category === "tvseries" || /learn english with/i.test(v?.channel || "") || /learn english with/i.test(v?.title || "");
    setPass(isTv ? 2 : 1); setUnlocked(isTv); setPeek(isTv);
    setSegments([]); setTime(0); setDuration(0); setWord(null);
    wildRunRef.current = null;
    setWild({ status: "idle", items: [], done: 0, total: 0 });
    setWildSelected([]); setShowWild(false); setWildPrompted(false);
    await loadTranscript(v.id);
  }, [catId, loadTranscript]);

  const closeVideo = useCallback(() => {
    try { playerRef.current?.destroy?.(); } catch { }
    playerRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    setActive(null);
  }, []);

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
    if (!active || !segments.length || !callClaude) return;
    if (wildRunRef.current === active.id) return;
    const runId = active.id;
    wildRunRef.current = runId;
    const full = segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
    const chunks = [];
    for (let i = 0; i < full.length && chunks.length < 6; i += 6000) chunks.push(full.slice(i, i + 6000));
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

  // ── Fin de visionnage → proposer les fiches ──
  const [endedTick, setEndedTick] = useState(0);
  const nearEnd = duration > 0 && time / duration >= 0.98;
  useEffect(() => {
    if (!active || wildPrompted) return;
    if (endedTick > 0 || nearEnd) {
      setWildPrompted(true);
      setShowWild(true);
    }
  }, [endedTick, nearEnd, active, wildPrompted]);

  const normFront = (v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
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

  // ── Verrou de la passe 1 : 90 % de la vidéo écoutée ──
  const progress = duration ? Math.min(1, time / duration) : 0;
  const canUnlock = progress >= 0.9;

  useEffect(() => {
    if (pass === 1 && canUnlock && !unlocked) {
      setUnlocked(true);
      toast("🔓 Passe 1 validée — sous-titres débloqués avec succès !", "success");
      awardXP?.(20);
    }
  }, [canUnlock, pass, unlocked]); // eslint-disable-line

  // ── Ligne courante ──
  const currentIdx = useMemo(() => {
    if (!segments.length) return -1;
    let idx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start <= time + 0.15) idx = i; else break;
    }
    return idx;
  }, [segments, time]);

  useEffect(() => {
    if (pass === 2 && currentIdx >= 0) {
      lineRefs.current[currentIdx]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [currentIdx, pass]);

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

  // ── Changement de passe ──
  const goPass = (n) => {
    if (n > 1 && !unlocked) { toast("🔒 Termine d'abord la passe 1 (écoute à l'aveugle à 90 %).", "warning"); return; }
    setPass(n);
    setPeek(false);
    if (n === 2 || n === 3) seek(0);
    if (n === 3) awardXP?.(15);
    const wantNative = n === 2 && !segments.length;
    const p = playerRef.current;
    try {
      if (wantNative) {
        p?.loadModule?.("captions");
        p?.loadModule?.("cc");
        p?.setOption?.("captions", "track", { languageCode: "en" });
        p?.setOption?.("cc", "track", { languageCode: "en" });
      } else {
        p?.setOption?.("captions", "track", {});
        p?.setOption?.("cc", "track", {});
      }
    } catch { }
  };

  const retriedRef = useRef(false);
  useEffect(() => { retriedRef.current = false; }, [active?.id]);
  useEffect(() => {
    if (pass === 2 && !loadingTx && !segments.length && active && !retriedRef.current) {
      retriedRef.current = true;
      loadTranscript(active.id, true);
    }
  }, [pass, loadingTx, segments.length, active, loadTranscript]);

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

  // ── Design Tokens & Couleurs (Bleu Roi & Fond Blanc) ──
  const royalBlue = "#2563EB";
  const royalBlueDark = "#1D4ED8";
  const royalBlueSoft = "rgba(37, 99, 235, 0.08)";
  const royalBlueBorder = "rgba(37, 99, 235, 0.25)";

  const cardStyle = {
    background: isDarkMode ? "rgba(15, 23, 42, 0.85)" : "#FFFFFF",
    border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)"}`,
    borderRadius: 20,
    padding: 22,
    boxShadow: isDarkMode ? "0 8px 32px rgba(0, 0, 0, 0.25)" : "0 4px 20px rgba(0, 0, 0, 0.04)",
  };

  const txtColor = isDarkMode ? "#F1F5F9" : "#0F172A";
  const dimColor = isDarkMode ? "rgba(241, 245, 249, 0.65)" : "rgba(15, 23, 42, 0.65)";
  const inputBg = isDarkMode ? "rgba(0, 0, 0, 0.3)" : "#F8FAFC";
  const inputBorder = isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.12)";

  // ════════════════════════ VUE CATALOGUE ════════════════════════
  if (!active) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* En-tête Hero en Bleu Pastel Lumineux (Identique à "Modes & outils") */}
        <div style={{
          ...cardStyle,
          position: "relative",
          overflow: "hidden",
          background: isDarkMode
            ? "linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(99, 102, 241, 0.35))"
            : "linear-gradient(135deg, rgba(37, 99, 235, 0.14), rgba(59, 130, 246, 0.22))",
          border: `1px solid ${isDarkMode ? "rgba(99, 102, 241, 0.4)" : "rgba(59, 130, 246, 0.35)"}`,
          boxShadow: "0 4px 16px rgba(37, 99, 235, 0.12)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 38,
              height: 38,
              borderRadius: 12,
              background: isDarkMode ? "rgba(37, 99, 235, 0.25)" : "rgba(37, 99, 235, 0.15)",
              border: `1px solid ${isDarkMode ? "rgba(99, 102, 241, 0.4)" : "rgba(59, 130, 246, 0.35)"}`,
              fontSize: 20,
            }}>🌍</span>
            <div style={{
              fontSize: 20,
              fontWeight: 900,
              color: isDarkMode ? "#93C5FD" : "#1D4ED8",
              letterSpacing: "-0.02em",
            }}>
              RealLife · Immersion Anglais Réel
            </div>
            <span style={{
              marginLeft: "auto",
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 800,
              background: isDarkMode ? "rgba(37, 99, 235, 0.25)" : "rgba(37, 99, 235, 0.15)",
              color: isDarkMode ? "#93C5FD" : "#1D4ED8",
              border: `1px solid ${isDarkMode ? "rgba(99, 102, 241, 0.4)" : "rgba(59, 130, 246, 0.35)"}`,
              backdropFilter: "blur(8px)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Protocole 3 Passes
            </span>
          </div>

          <p style={{
            margin: 0,
            fontSize: 13,
            color: isDarkMode ? "rgba(241, 245, 249, 0.85)" : "#334155",
            lineHeight: 1.6,
            maxWidth: 840,
          }}>
            Entraîne ton oreille sur des flux réels sans sous-titres artificiels. Applique la méthode d'or :
            <strong style={{ color: isDarkMode ? "#93C5FD" : "#1D4ED8", fontWeight: 800 }}> 1. Blind</strong> (écoute pure) →
            <strong style={{ color: isDarkMode ? "#93C5FD" : "#1D4ED8", fontWeight: 800 }}> 2. Decoding</strong> (transcript interactif) →
            <strong style={{ color: isDarkMode ? "#93C5FD" : "#1D4ED8", fontWeight: 800 }}> 3. Mastery</strong> (ancrage définitif).
          </p>
        </div>

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
                    boxShadow: activeCat ? "0 4px 14px rgba(37, 99, 235, 0.35)" : "none",
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
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span>{searching ? "⏳" : "🔍"}</span>
              <span>{searching ? "Recherche en cours…" : "Rechercher"}</span>
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
              Choisis une thématique ci-dessus ou colle un lien YouTube direct pour lancer le protocole 3 Passes (Blind → Decoding → Mastery).
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════ VUE SESSION ════════════════════════
  const passes = [
    { n: 1, icon: "🎧", label: "Blind", hint: "0 sous-titre" },
    { n: 2, icon: "👁️", label: "Decoding", hint: "transcript interactif" },
    { n: 3, icon: "👑", label: "Mastery", hint: "validation finale" },
  ];

  const isTvSeries = catId === "tvseries" || active?.category === "tvseries" || /learn english with/i.test(active?.channel || "") || /learn english with/i.test(active?.title || "");

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
          onClick={() => setShowWild(true)}
          className="hov"
          title="Extraction In the Wild en arrière-plan"
          style={{ padding: "8px 12px", borderRadius: 10, cursor: "pointer", background: royalBlueSoft, color: txtColor, border: `1px solid ${royalBlueBorder}`, fontWeight: 800, fontSize: 12 }}
        >
          {wild.status === "running" && `⛏️ Extraction… ${wild.done}/${wild.total} · ${wild.items.length} fiche(s)`}
          {wild.status === "ready" && `🃏 ${wild.items.length} fiche(s) prêtes`}
          {wild.status === "empty" && "🃏 Aucune fiche"}
          {wild.status === "idle" && (loadingTx ? "⏳ Transcript…" : segments.length ? "⛏️ Extraction…" : "🃏 Fiches (transcript requis)")}
        </button>
      </div>

      {/* Mode TV Series : 1 seul visionnage direct OU Timeline Protocole 3 Passes */}
      {isTvSeries ? (
        <div style={{
          padding: "10px 16px",
          borderRadius: 14,
          background: isDarkMode ? "rgba(37, 99, 235, 0.12)" : "rgba(37, 99, 235, 0.08)",
          border: `1px solid ${royalBlueBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          fontWeight: 700,
          color: txtColor,
        }}>
          <span style={{ fontSize: 18 }}>📺</span>
          <span>Visionnage unique direct · Learn English With TV Series (accès libre aux sous-titres et transcript interactif)</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {passes.map(p => {
            const locked = p.n > 1 && !unlocked;
            const on = pass === p.n;
            return (
              <button
                key={p.n}
                onClick={() => goPass(p.n)}
                className="hov"
                style={{
                  flex: "1 1 180px",
                  padding: "10px 14px",
                  borderRadius: 14,
                  cursor: locked ? "not-allowed" : "pointer",
                  opacity: locked ? 0.45 : 1,
                  fontWeight: 800,
                  fontSize: 13,
                  textAlign: "left",
                  color: on ? "#FFFFFF" : txtColor,
                  background: on
                    ? `linear-gradient(135deg, ${royalBlue}, ${royalBlueDark})`
                    : isDarkMode ? "rgba(255, 255, 255, 0.03)" : "#FFFFFF",
                  border: `1px solid ${on ? "transparent" : inputBorder}`,
                  boxShadow: on ? "0 4px 14px rgba(37, 99, 235, 0.3)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{locked ? "🔒" : p.icon}</span>
                  <span>Passe {p.n} · {p.label}</span>
                </div>
                <div style={{ opacity: on ? 0.85 : 0.6, fontWeight: 600, fontSize: 11, marginTop: 2 }}>
                  {p.hint}
                </div>
              </button>
            );
          })}
        </div>
      )}

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

        {/* Barre de Progression de Déblocage (Passe 1) */}
        {!unlocked && (
          <div style={{ padding: "0 16px 14px", background: isDarkMode ? "rgba(0, 0, 0, 0.2)" : "#F8FAFC" }}>
            <div style={{
              height: 7,
              borderRadius: 99,
              background: isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${Math.round(progress * 100)}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${royalBlue}, #3B82F6)`,
                transition: "width 0.2s linear",
              }} />
            </div>
            <div style={{ fontSize: 11, color: dimColor, marginTop: 6, fontWeight: 600 }}>
              🔒 Sous-titres verrouillés — écoute encore {Math.max(0, 90 - Math.round(progress * 100))}% pour débloquer la Passe 2.
            </div>
          </div>
        )}
      </div>

      {/* Guide Passe 1 */}
      {pass === 1 && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "28px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🎧</div>
          <div style={{ fontWeight: 900, color: txtColor, fontSize: 16 }}>Passe 1 · Écoute Active Pure</div>
          <div style={{ color: dimColor, fontSize: 13, marginTop: 6, lineHeight: 1.6, maxWidth: 600, margin: "6px auto 0" }}>
            Aucun texte ni sous-titre. Concentre-toi sur l'intonation, le débit et le sens général.
            Capter 50 à 60% est normal et constitue le cœur du déblocage auditif.
          </div>
        </div>
      )}

      {/* Guide Passe 3 */}
      {pass === 3 && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "28px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>👑</div>
          <div style={{ fontWeight: 900, color: txtColor, fontSize: 16 }}>Passe 3 · Validation Auditive Finale</div>
          <div style={{ color: dimColor, fontSize: 13, marginTop: 6, lineHeight: 1.6, maxWidth: 600, margin: "6px auto 0" }}>
            Réécoute sans assistance : les liaisons et structures décodées en Passe 2 doivent maintenant être instantanément perçues.
          </div>
        </div>
      )}

      {/* Transcript Intelligent Passe 2 */}
      {pass === 2 && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, color: txtColor, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>📝</span>
              <span>Smart Transcript Interactif</span>
            </div>

            <label style={{
              color: dimColor,
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginLeft: "auto",
              cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={peek}
                onChange={e => setPeek(e.target.checked)}
                style={{ accentColor: royalBlue }}
              />
              Tout révéler (sinon : survole une phrase)
            </label>
          </div>

          {loadingTx && (
            <div style={{ color: dimColor, fontSize: 13, padding: "16px 0", textAlign: "center" }}>
              ⏳ Récupération et synchronisation des sous-titres horodatés…
            </div>
          )}

          {!loadingTx && !segments.length && (
            <div style={{ color: dimColor, fontSize: 13, lineHeight: 1.6 }}>
              Transcript horodaté non disponible directement : les sous-titres natifs YouTube ont été activés dans le lecteur.
              <div style={{ marginTop: 10 }}>
                <button
                  className="hov"
                  onClick={() => active && loadTranscript(active.id, true)}
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

          <div style={{
            maxHeight: 360,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            paddingRight: 6,
          }}>
            {segments.map((s, i) => {
              const isCur = i === currentIdx;
              const revealed = peek || isCur;
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
                      filter: revealed ? "none" : "blur(5px)",
                      transition: "filter 0.18s ease",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = "none"; }}
                    onMouseLeave={e => { if (!revealed) e.currentTarget.style.filter = "blur(5px)"; }}
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
            <div style={{ fontWeight: 900, fontSize: 18, color: txtColor }}>🃏 Fiches extraites de la vidéo</div>
            <div style={{ fontSize: 13, color: dimColor }}>
              {wild.status === "running" && `Extraction en cours (${wild.done}/${wild.total})… les fiches apparaissent au fur et à mesure.`}
              {wild.status === "ready" && "Sélectionne les fiches à ajouter à tes révisions."}
              {wild.status === "empty" && "Aucune expression exploitable n'a été trouvée."}
              {wild.status === "idle" && (segments.length ? "Préparation…" : "Pas de transcript disponible pour cette vidéo : l'extraction ne peut pas démarrer.")}
            </div>
            {wild.items.map((e, i) => {
              const on = wildSelected.includes(i);
              return (
                <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 12, cursor: "pointer", border: `1px solid ${on ? royalBlueBorder : inputBorder}`, background: on ? royalBlueSoft : "transparent" }}>
                  <input type="checkbox" checked={on} onChange={() => setWildSelected(p => on ? p.filter(x => x !== i) : [...p, i])} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 800, color: txtColor }}>{e.expr} {e.ipa ? <span style={{ fontWeight: 500, color: dimColor, fontSize: 12 }}>· {e.ipa}</span> : null}</div>
                    <div style={{ fontSize: 13, color: dimColor }}>{e.meaning}</div>
                    {e.examples?.[0] && <div style={{ fontSize: 12, color: dimColor, fontStyle: "italic", marginTop: 4 }}>“{e.examples[0].en || e.examples[0]}”</div>}
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
