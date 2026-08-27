import { useState, useEffect, useRef, useCallback } from "react";
import { FOCUS_PLAYLIST, OFFLINE_TRACKS, formatBytes } from "../lib/musicLibrary";
import {
  listDownloadedIds,
  downloadTrack,
  downloadAll,
  deleteTrack as deleteMusicTrack,
  getDownloadedSize,
  getTrackObjectUrl,
  revokeObjectUrl,
} from "../lib/musicStore";
import { getNetworkStatus, onNetworkChange, shouldReduceData } from "../lib/networkStatus";

export function useFocusRadio({ showToast } = {}) {
  const [lofiPlaying, setLofiPlaying] = useState(false);
  const [lofiVolume, setLofiVolume] = useState(0.4);
  const [lofiStation, setLofiStation] = useState(0);
  const [showLofiPlayer, setShowLofiPlayer] = useState(false);

  const audioRef = useRef(null);

  const [isOnline, setIsOnline] = useState(() => getNetworkStatus().online);
  const [downloadedIds, setDownloadedIds] = useState([]);
  const [dlProgress, setDlProgress] = useState({});
  const [dlAllProgress, setDlAllProgress] = useState(null);
  const [offlineSize, setOfflineSize] = useState(0);
  const [trackSrc, setTrackSrc] = useState(null);

  useEffect(() => onNetworkChange((s) => setIsOnline(Boolean(s.online))), []);

  const currentTrack = FOCUS_PLAYLIST[lofiStation] || FOCUS_PLAYLIST[0];

  const refreshOfflineState = useCallback(async () => {
    try {
      const ids = await listDownloadedIds();
      setDownloadedIds(ids);
      setOfflineSize(await getDownloadedSize());
    } catch (e) {
      console.error("musicStore refresh:", e);
    }
  }, []);

  useEffect(() => {
    refreshOfflineState();
  }, [refreshOfflineState]);

  useEffect(() => {
    if (isOnline || !currentTrack?.live) return;
    const fallback = FOCUS_PLAYLIST.findIndex((t) => !t.live && downloadedIds.includes(t.id));
    if (fallback >= 0) setLofiStation(fallback);
    else setLofiPlaying(false);
  }, [isOnline, currentTrack, downloadedIds]);

  useEffect(() => {
    let cancelled = false;
    let created = null;
    (async () => {
      const { url } = await getTrackObjectUrl(currentTrack);
      if (cancelled) {
        revokeObjectUrl(url);
        return;
      }
      created = url;
      setTrackSrc(url);
    })();
    return () => {
      cancelled = true;
      revokeObjectUrl(created);
    };
  }, [currentTrack, downloadedIds]);

  const handleDownloadTrack = useCallback(
    async (track) => {
      if (!track || track.live) return;
      setDlProgress((p) => ({ ...p, [track.id]: 0 }));
      const res = await downloadTrack(track, (ratio) =>
        setDlProgress((p) => ({ ...p, [track.id]: ratio }))
      );
      setDlProgress((p) => {
        const n = { ...p };
        delete n[track.id];
        return n;
      });
      if (res.ok) {
        showToast?.(`« ${track.title} » disponible hors-ligne`, "success");
      } else {
        showToast?.(`Téléchargement impossible : ${res.reason}`, "error");
      }
      refreshOfflineState();
    },
    [showToast, refreshOfflineState]
  );

  const handleDeleteTrack = useCallback(
    async (track) => {
      await deleteMusicTrack(track.id);
      showToast?.(`« ${track.title} » retiré du hors-ligne`, "info");
      refreshOfflineState();
    },
    [showToast, refreshOfflineState]
  );

  const handleDownloadAll = useCallback(async () => {
    const missing = OFFLINE_TRACKS.filter((t) => !downloadedIds.includes(t.id));
    if (!missing.length) {
      showToast?.("Toute la playlist est déjà hors-ligne", "info");
      return;
    }
    const bytes = missing.reduce((sum, t) => sum + (t.approxBytes || 0), 0);
    const heavy = bytes > 5 * 1024 * 1024 || shouldReduceData();
    if (
      heavy &&
      typeof window !== "undefined" &&
      !window.confirm(
        `Télécharger ${missing.length} piste(s) — environ ${formatBytes(bytes)}.\nSur données mobiles, cela peut consommer votre forfait. Continuer ?`
      )
    )
      return;

    setDlAllProgress({ index: 0, total: missing.length });
    const res = await downloadAll(missing, ({ index, total, trackId, ratio }) => {
      setDlAllProgress({ index, total });
      setDlProgress((p) => ({ ...p, [trackId]: ratio }));
    });
    setDlAllProgress(null);
    setDlProgress({});
    if (res.ok) {
      showToast?.(`Playlist hors-ligne prête (${formatBytes(res.bytes)})`, "success");
    } else {
      showToast?.(
        `${res.failed.length} piste(s) non téléchargée(s) : ${res.failed[0]?.reason || ""}`,
        "error"
      );
    }
    refreshOfflineState();
  }, [downloadedIds, showToast, refreshOfflineState]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = lofiVolume;
      if (lofiPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.error("Audio Player Play Error:", err);
            if (err.name === "NotAllowedError" || err.name === "AbortError") {
              setLofiPlaying(false);
            }
          });
        }
      } else {
        audioRef.current.pause();
      }
    }
  }, [lofiPlaying, lofiStation, lofiVolume]);

  return {
    lofiPlaying,
    setLofiPlaying,
    lofiVolume,
    setLofiVolume,
    lofiStation,
    setLofiStation,
    showLofiPlayer,
    setShowLofiPlayer,
    audioRef,
    isOnline,
    downloadedIds,
    dlProgress,
    dlAllProgress,
    offlineSize,
    trackSrc,
    currentTrack,
    handleDownloadTrack,
    handleDeleteTrack,
    handleDownloadAll,
  };
}

export default useFocusRadio;
