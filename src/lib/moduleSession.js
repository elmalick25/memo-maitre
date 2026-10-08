// Sessions de révision LIBRE par module, indépendantes du plan du jour.
// Persistées par module et par jour : sortir puis revenir reprend là où on
// s'était arrêté. Un nouveau jour repart de zéro.
import { today } from "../utils/dateUtils";

export const MODULE_SESSION_KEY = "memomaitre_moduleSessions_v1";

function readAll() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(MODULE_SESSION_KEY) : null;
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch { return {}; }
}
function writeAll(obj) {
  try { localStorage.setItem(MODULE_SESSION_KEY, JSON.stringify(obj)); } catch { /* quota */ }
}

export function loadModuleSession(moduleName, todayISO = today()) {
  const s = readAll()[moduleName];
  if (!s || s.date !== todayISO || !Array.isArray(s.ids) || s.ids.length === 0) return null;
  const index = Number.isFinite(s.index) ? Math.max(0, s.index) : 0;
  if (index >= s.ids.length) return null;
  return { ids: s.ids, index };
}

export function saveModuleSession(moduleName, ids, index, todayISO = today()) {
  const all = readAll();
  for (const k of Object.keys(all)) if (all[k]?.date !== todayISO) delete all[k];
  all[moduleName] = { date: todayISO, ids, index };
  writeAll(all);
}

export function clearModuleSession(moduleName) {
  const all = readAll();
  delete all[moduleName];
  writeAll(all);
}
