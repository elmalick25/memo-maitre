// 🎵 musicLibrary.js — Catalogue déclaratif de la playlist "Radio Focus"
//
// Deux familles techniquement différentes :
//  - FOCUS_TRACKS  : fichiers audio possédés par l'app (/audio/focus/*.mp3)
//                    → téléchargeables et écoutables 100 % hors-ligne.
//  - LIVE_STATIONS : flux radio en direct (streaming continu)
//                    → nécessitent OBLIGATOIREMENT une connexion, non cachables.
//
// Le champ `license` est obligatoire pour tracer la provenance de chaque piste.

/** Pistes possédées — générées spécifiquement pour MémoMaître (synthèse sonore
 *  originale, aucune source tierce) → CC0 / domaine public, aucun risque de droits. */
export const FOCUS_TRACKS = [
  {
    id: "lofi-01",
    title: "Slow Desk Loop",
    artist: "MémoMaître Studio",
    category: "lofi",
    emoji: "📚",
    fileUrl: "/audio/focus/lofi-01.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "lofi-02",
    title: "Night Notebook",
    artist: "MémoMaître Studio",
    category: "lofi",
    emoji: "🌙",
    fileUrl: "/audio/focus/lofi-02.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "piano-01",
    title: "Clair Study",
    artist: "MémoMaître Studio",
    category: "piano",
    emoji: "🎹",
    fileUrl: "/audio/focus/piano-01.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "piano-02",
    title: "Neoclassical Drift",
    artist: "MémoMaître Studio",
    category: "piano",
    emoji: "🎼",
    fileUrl: "/audio/focus/piano-02.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "ambient-01",
    title: "Deep Space Pad",
    artist: "MémoMaître Studio",
    category: "ambient",
    emoji: "🌌",
    fileUrl: "/audio/focus/ambient-01.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "ambient-02",
    title: "Slow Horizon",
    artist: "MémoMaître Studio",
    category: "ambient",
    emoji: "🪐",
    fileUrl: "/audio/focus/ambient-02.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "noise-pink",
    title: "Bruit rose",
    artist: "MémoMaître Studio",
    category: "noise",
    emoji: "🌸",
    fileUrl: "/audio/focus/noise-pink.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "noise-brown",
    title: "Bruit brun",
    artist: "MémoMaître Studio",
    category: "noise",
    emoji: "🟤",
    fileUrl: "/audio/focus/noise-brown.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "nature-rain",
    title: "Pluie sur la fenêtre",
    artist: "MémoMaître Studio",
    category: "nature",
    emoji: "🌧️",
    fileUrl: "/audio/focus/nature-rain.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "nature-forest",
    title: "Ruisseau en forêt",
    artist: "MémoMaître Studio",
    category: "nature",
    emoji: "🌲",
    fileUrl: "/audio/focus/nature-forest.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "binaural-alpha",
    title: "Ondes Alpha 10 Hz",
    artist: "MémoMaître Studio",
    category: "binaural",
    emoji: "🧠",
    fileUrl: "/audio/focus/binaural-alpha.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
  {
    id: "binaural-theta",
    title: "Ondes Thêta 6 Hz",
    artist: "MémoMaître Studio",
    category: "binaural",
    emoji: "🌀",
    fileUrl: "/audio/focus/binaural-theta.mp3",
    durationSec: 74,
    approxBytes: 894685,
    license: "CC0 — création originale MémoMaître",
  },
];

/** Flux radio en direct — EN LIGNE UNIQUEMENT (aucun fichier à mettre en cache). */
export const LIVE_STATIONS = [
  { id: "live-lofi", title: "Lofi Study (Deep Work)", artist: "Webradio", category: "live", emoji: "📻", fileUrl: "https://streams.ilovemusic.de/iloveradio17.mp3", live: true, license: "Flux tiers — diffusion en direct" },
  { id: "live-piano", title: "Piano Focus (Classique)", artist: "Webradio", category: "live", emoji: "🎹", fileUrl: "https://live.radioart.com/fSolo_piano.mp3", live: true, license: "Flux tiers — diffusion en direct" },
  { id: "live-alpha", title: "Alpha Waves & Ambient", artist: "SomaFM", category: "live", emoji: "🌌", fileUrl: "https://ice1.somafm.com/deepspaceone-128-mp3", live: true, license: "Flux tiers — diffusion en direct" },
  { id: "live-flow", title: "Flow State (Minimalist)", artist: "SomaFM", category: "live", emoji: "🌊", fileUrl: "https://ice1.somafm.com/groovesalad-128-mp3", live: true, license: "Flux tiers — diffusion en direct" },
];

/**
 * ⚠️ Pistes historiques à licence non vérifiée (RDR2, Train).
 * Elles ne sont PAS incluses dans la playlist par défaut : ce sont des morceaux
 * commerciaux dont les droits doivent être vérifiés avant redistribution.
 * Passer INCLUDE_LEGACY_TRACKS à true (à vos risques) pour les réafficher.
 */
export const INCLUDE_LEGACY_TRACKS = false;
export const LEGACY_TRACKS = [
  { id: "legacy-unshaken", title: "RDR2 — Stand Unshaken", artist: "Inconnu", category: "legacy", emoji: "🤠", fileUrl: "/audio/unshaken.mp3", durationSec: 0, approxBytes: 0, license: "⚠️ Non vérifiée — morceau commercial" },
  { id: "legacy-seethefire", title: "RDR2 — See The Fire", artist: "Inconnu", category: "legacy", emoji: "🔥", fileUrl: "/audio/seethefire.mp3", durationSec: 0, approxBytes: 0, license: "⚠️ Non vérifiée — morceau commercial" },
  { id: "legacy-train", title: "Train — Conor & Jay", artist: "Inconnu", category: "legacy", emoji: "🚂", fileUrl: "/audio/train.mp3", durationSec: 0, approxBytes: 0, license: "⚠️ Non vérifiée — morceau commercial" },
];

export const CATEGORY_LABELS = {
  lofi: "Lofi hip-hop",
  piano: "Piano ambiant",
  ambient: "Nappes ambient",
  noise: "Bruit rose / brun",
  nature: "Sons de la nature",
  binaural: "Binaural / focus",
  live: "Radio en direct",
  legacy: "Archives",
};

/** Pistes téléchargeables (hors-ligne possible). */
export const OFFLINE_TRACKS = INCLUDE_LEGACY_TRACKS
  ? [...FOCUS_TRACKS, ...LEGACY_TRACKS]
  : FOCUS_TRACKS;

/** Playlist complète affichée dans le popup : pistes possédées d'abord, flux live ensuite. */
export const FOCUS_PLAYLIST = [...OFFLINE_TRACKS, ...LIVE_STATIONS];

export function getTrackById(id) {
  return FOCUS_PLAYLIST.find((t) => t.id === id) || null;
}

/** Taille totale approximative (octets) de la playlist téléchargeable. */
export function totalPlaylistBytes() {
  return OFFLINE_TRACKS.reduce((sum, t) => sum + (t.approxBytes || 0), 0);
}

export function formatBytes(bytes) {
  if (!bytes) return "0 Mo";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
