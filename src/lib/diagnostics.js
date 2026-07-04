// 🩺 diagnostics.js — window.__diag() : un dump complet pour debug rapide
import { getEvents } from "./telemetry";
import { getNetworkStatus } from "./networkStatus";
import { getMemoryUsage } from "./memoryGuard";
import { allFlags } from "./featureFlags";

export function installDiagnostics() {
  if (typeof window === "undefined") return;
  window.__diag = async () => {
    const storageKB = (() => {
      try {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          total += (k?.length || 0) + (localStorage.getItem(k)?.length || 0);
        }
        return Math.round(total / 1024);
      } catch { return -1; }
    })();
    let cacheStorage = "unsupported";
    try {
      if ("caches" in self) cacheStorage = (await caches.keys()).length;
    } catch {}
    return {
      time: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: location.href,
      network: getNetworkStatus(),
      memory: getMemoryUsage(),
      localStorageKB: storageKB,
      cacheStorages: cacheStorage,
      flags: allFlags(),
      recentEvents: getEvents().slice(-20),
    };
  };
}
