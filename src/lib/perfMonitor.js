// ⚡ perfMonitor.js — Web Vitals lite (LCP / CLS / INP) sans dépendance
import { logEvent } from "./telemetry";

export function installPerfMonitor() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
  // LCP
  try {
    new PerformanceObserver((list) => {
      const e = list.getEntries().pop();
      if (e) logEvent("perf:lcp", { value: Math.round(e.startTime), element: e.element?.tagName });
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  // CLS
  try {
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value;
      logEvent("perf:cls", { value: +cls.toFixed(3) });
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
  // INP (approx via event timing)
  try {
    let worst = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const dur = e.processingEnd - e.startTime;
        if (dur > worst) { worst = dur; logEvent("perf:inp", { value: Math.round(worst), name: e.name }); }
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 40 });
  } catch {}
  // Long tasks
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) logEvent("perf:longtask", { value: Math.round(e.duration) });
    }).observe({ type: "longtask", buffered: true });
  } catch {}
}
