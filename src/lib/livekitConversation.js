// ============================================================================
// livekitConversation.js — Qualité de la conversation vocale (NOVA / LiveKit)
// ============================================================================
// Les transcriptions LiveKit arrivent en fragments (streaming). Brut, ça donne
// des demi-phrases dupliquées, des tours mélangés, et un LLM qui répond à côté.
// Ce module transforme ce flux en une VRAIE conversation :
//
//   • aggregateTurns()      : fragments → tours de parole propres et ordonnés
//   • dedupeSegments()      : supprime les répétitions / echos coach↔élève
//   • conversationStats()   : temps de parole élève, nb de tours, mots/tour
//   • buildTranscriptText() : rendu lisible pour analyse post-session
//   • detectStall()         : silence anormal → relance côté UI
// ============================================================================

/** Fenêtre (ms) sous laquelle deux fragments du même locuteur = un seul tour. */
export const TURN_MERGE_WINDOW_MS = 3500;

const norm = (t) => String(t || "").trim().replace(/\s+/g, " ");
const key = (t) => norm(t).toLowerCase().replace(/[.,!?;:]/g, "");

/** Retire les doublons exacts et les fragments contenus dans un autre. */
export function dedupeSegments(segments = []) {
  const out = [];
  const seen = new Set();
  for (const seg of segments) {
    const text = norm(seg?.text);
    if (!text) continue;
    const k = `${seg.role}:${key(text)}`;
    if (seen.has(k)) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === seg.role) {
      const a = key(prev.text);
      const b = key(text);
      if (a.includes(b)) continue;
      if (b.includes(a)) {
        out[out.length - 1] = { ...prev, ...seg, text };
        seen.add(k);
        continue;
      }
    }
    seen.add(k);
    out.push({ ...seg, text });
  }
  return out;
}

/**
 * Fragments → tours de parole. Deux fragments consécutifs du même locuteur
 * espacés de moins de TURN_MERGE_WINDOW_MS sont concaténés.
 */
export function aggregateTurns(segments = [], { windowMs = TURN_MERGE_WINDOW_MS } = {}) {
  const ordered = dedupeSegments(
    [...segments].filter((s) => s && norm(s.text)).sort((a, b) => (a.ts || 0) - (b.ts || 0))
  );
  const turns = [];
  for (const seg of ordered) {
    const text = norm(seg.text);
    const prev = turns[turns.length - 1];
    const gap = prev ? Math.abs((seg.ts || 0) - (prev.endTs || 0)) : Infinity;
    if (prev && prev.role === seg.role && gap <= windowMs) {
      prev.text = `${prev.text} ${text}`.replace(/\s+/g, " ").trim();
      prev.endTs = seg.ts || prev.endTs;
      prev.isFinal = Boolean(seg.isFinal);
      continue;
    }
    turns.push({
      id: seg.id || `${seg.role}-${seg.ts || Date.now()}`,
      role: seg.role === "agent" ? "agent" : "user",
      text,
      startTs: seg.ts || Date.now(),
      endTs: seg.ts || Date.now(),
      isFinal: Boolean(seg.isFinal),
    });
  }
  return turns;
}

export const lastTurnOf = (turns = [], role) =>
  [...turns].reverse().find((t) => t.role === role) || null;

/** Indicateurs de qualité : c'est l'élève qui doit parler, pas le coach. */
export function conversationStats(turns = []) {
  const userTurns = turns.filter((t) => t.role === "user");
  const agentTurns = turns.filter((t) => t.role === "agent");
  const words = (list) => list.reduce((n, t) => n + norm(t.text).split(" ").filter(Boolean).length, 0);
  const userWords = words(userTurns);
  const agentWords = words(agentTurns);
  const total = userWords + agentWords;
  return {
    userTurns: userTurns.length,
    agentTurns: agentTurns.length,
    userWords,
    agentWords,
    avgUserWordsPerTurn: userTurns.length ? Math.round(userWords / userTurns.length) : 0,
    studentTalkRatio: total ? Math.round((userWords / total) * 100) : 0,
  };
}

/** Transcript lisible pour l'analyse post-session (LLM ou journal). */
export function buildTranscriptText(turns = []) {
  return turns.map((t) => `${t.role === "agent" ? "NOVA" : "STUDENT"}: ${t.text}`).join("\n");
}

/** Vrai si personne n'a parlé depuis `ms` — l'UI peut proposer une relance. */
export function detectStall(turns = [], ms = 12000, now = Date.now()) {
  const last = turns[turns.length - 1];
  if (!last) return false;
  return now - (last.endTs || last.startTs || now) > ms;
}
