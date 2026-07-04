// 🧠 memoryGuard.js — Surveille la mémoire JS (Chrome) et préviens si proche limite
import { logEvent } from "./telemetry";

export function getMemoryUsage() {
  const m = performance?.memory;
  if (!m) return null;
  return {
    usedMB: +(m.usedJSHeapSize / 1048576).toFixed(1),
    totalMB: +(m.totalJSHeapSize / 1048576).toFixed(1),
    limitMB: +(m.jsHeapSizeLimit / 1048576).toFixed(1),
    ratio: m.usedJSHeapSize / m.jsHeapSizeLimit,
  };
}

export function installMemoryGuard({ thresholdRatio = 0.85, intervalMs = 30_000 } = {}) {
  if (typeof window === "undefined" || !performance?.memory) return () => {};
  let warned = false;
  const id = setInterval(() => {
    const u = getMemoryUsage();
    if (!u) return;
    if (u.ratio > thresholdRatio && !warned) {
      warned = true;
      logEvent("mem:high", u);
      window.dispatchEvent(new CustomEvent("mem:pressure", { detail: u }));
    } else if (u.ratio < thresholdRatio * 0.8) {
      warned = false;
    }
  }, intervalMs);
  return () => clearInterval(id);
}
