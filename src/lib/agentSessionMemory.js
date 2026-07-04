// agentSessionMemory.js — Journal de session persistant du coach vocal
// ══════════════════════════════════════════════════════════════════════════════
// Sauve chaque conversation vocale (transcript + méta) dans localStorage.
// Sert à alimenter la mémoire de continuité de la session suivante.
// ══════════════════════════════════════════════════════════════════════════════

const KEY = "mm_agent_diary_v1";
const MAX_ENTRIES = 30;
const MAX_TRANSCRIPT_TURNS = 40;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {}
}

export function appendSession({ transcript = [], agent = null, mode = "chat", meta = {} } = {}) {
  if (!transcript.length) return;
  const list = load();
  const trimmed = transcript.slice(-MAX_TRANSCRIPT_TURNS).map(t => ({
    r: t.role === "agent" ? "a" : "u",
    t: String(t.text || "").slice(0, 500),
  }));
  list.push({
    ts: Date.now(),
    mode,
    agent: agent?.name || null,
    turns: trimmed,
    meta,
  });
  save(list);
}

export function getRecentSessions(limit = 5) {
  return load().slice(-limit);
}

/** Résumé court style [CONTINUITY MEMORY] pour prompt système. */
export function summarizeForContinuity(limit = 3) {
  const sessions = getRecentSessions(limit);
  if (!sessions.length) return null;
  return sessions.map(s => {
    const date = new Date(s.ts).toISOString().slice(0, 10);
    const preview = s.turns.slice(-6).map(t => `${t.r}:${t.t}`).join(" | ");
    return `[${date} · ${s.mode}] ${preview}`;
  }).join("\n");
}

export function clearDiary() {
  try { localStorage.removeItem(KEY); } catch {}
}
