// 📡 telemetry.js — Collecte locale d'erreurs & métriques (no-network par défaut)
// Ring-buffer en mémoire + miroir localStorage. Exportable via window.__telemetry().
// Écoute `app:error` (dispatché par ErrorBoundary) + window.error + unhandledrejection.
import { safeStorage } from "./safeStorage";

const KEY = "telemetry_buf_v1";
const MAX = 200;
const buf = [];

function push(evt) {
  const e = { ts: Date.now(), ...evt };
  buf.push(e);
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  try { safeStorage.setJSON(KEY, buf.slice(-50)); } catch {}
}

export function logEvent(type, data = {}) { push({ type, ...data }); }

export function getEvents() { return buf.slice(); }
export function clearEvents() { buf.length = 0; try { safeStorage.remove(KEY); } catch {} }

let installed = false;
export function installTelemetry() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // restore previous session
  try { const prev = safeStorage.getJSON(KEY); if (Array.isArray(prev)) buf.push(...prev); } catch {}

  window.addEventListener("app:error", (e) => push({ type: "boundary", ...(e.detail || {}) }));
  window.addEventListener("error", (e) => push({ type: "error", message: e?.message, source: e?.filename, line: e?.lineno }));
  window.addEventListener("unhandledrejection", (e) => push({ type: "rejection", message: e?.reason?.message || String(e?.reason || "") }));

  window.__telemetry = () => ({ events: getEvents(), clear: clearEvents });
}
