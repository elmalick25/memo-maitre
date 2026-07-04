// ═══════════════════════════════════════════════════════════════════════════
// DATA HELPERS — heatmap sessions, génération de semaines, import CSV/JSON
// Extrait de MemoMaster.jsx
// ═══════════════════════════════════════════════════════════════════════════
import { today, toLocalISODate } from "../utils/dateUtils";

export function buildHeatmap(sessions) {
  const map = {};
  (sessions || []).forEach((s) => { map[s.date] = (map[s.date] || 0) + s.count; });
  return map;
}

export function getLast12Weeks() {
  const weeks = [];
  const endDate = new Date();
  const day = endDate.getDay();
  endDate.setDate(endDate.getDate() - day);
  for (let w = 12; w >= 0; w--) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(endDate);
      dt.setDate(endDate.getDate() - w * 7 + d);
      week.push(toLocalISODate(dt));
    }
    weeks.push(week);
  }
  return weeks;
}

export function parseImport(text) {
  try {
    const data = JSON.parse(text);
    if (data.expressions && Array.isArray(data.expressions)) return { expressions: data.expressions, categories: data.categories || [] };
  } catch { }
  try {
    const lines = text.trim().split("\n").filter(Boolean);
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const expressions = lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj = {};
      header.forEach((h, i) => { obj[h] = vals[i]?.trim() || ""; });
      return {
        id: crypto.randomUUID(),
        front: obj.front || obj.recto || "", back: obj.back || obj.verso || "", example: obj.example || obj.exemple || "", category: obj.category || obj.categorie || obj.module || "Import",
        level: 0, nextReview: today(), createdAt: today(), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null
      };
    }).filter((e) => e.front && e.back);
    return { expressions, categories: [] };
  } catch { }
  return null;
}
