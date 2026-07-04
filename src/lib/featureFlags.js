// 🚩 featureFlags.js — Active/désactive des features à chaud
// Priorité : URL ?ff_xxx=1  >  localStorage  >  défaut
import { safeStorage } from "./safeStorage";

const DEFAULTS = {
  newsLiveAutoRefresh: true,
  voiceMirrorAnimations: true,
  labAggressiveDedup: true,
  telemetryConsoleLog: false,
};

export function getFlag(name) {
  try {
    if (typeof window !== "undefined") {
      const u = new URLSearchParams(window.location.search);
      const v = u.get(`ff_${name}`);
      if (v != null) return v === "1" || v === "true";
    }
  } catch {}
  const stored = safeStorage.getJSON("feature_flags") || {};
  return stored[name] ?? DEFAULTS[name] ?? false;
}

export function setFlag(name, value) {
  const stored = safeStorage.getJSON("feature_flags") || {};
  stored[name] = !!value;
  safeStorage.setJSON("feature_flags", stored);
}

export function allFlags() {
  const stored = safeStorage.getJSON("feature_flags") || {};
  return { ...DEFAULTS, ...stored };
}
