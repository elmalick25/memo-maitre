// ═══════════════════════════════════════════════════════════════════════════
// TEXT UTILS — sanitization input + parsing JSON robuste IA
// Extrait de MemoMaster.jsx
// ═══════════════════════════════════════════════════════════════════════════

// Sanitize user input to prevent prompt injection
export function sanitizeInput(text) {
  if (typeof text !== "string") return "";
  return text.replace(/<\|.*?\|>/g, "").replace(/\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>/g, "").slice(0, 10000);
}

// Répare les guillemets non échappés à l'intérieur de chaînes JSON
export function repairUnescapedQuotes(s) {
  let result = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!inString) {
      if (ch === '"') { inString = true; }
      result += ch;
    } else {
      if (ch === "\\" && i + 1 < s.length) { result += ch + s[i + 1]; i++; }
      else if (ch === '"') {
        let j = i + 1;
        while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === "\n" || s[j] === "\r")) j++;
        const next = s[j] || "";
        if (next === "}" || next === "]" || next === "," || next === ":") {
          inString = false; result += ch;
        } else { result += '\\"'; }
      } else { result += ch; }
    }
  }
  return result;
}

// Répare un flux JSON tronqué en plein vol (coupure de token / LLM)
export function repairTruncatedJSON(str) {
  if (!str || typeof str !== "string") return "{}";
  let s = str.trim();
  let inString = false;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
  }
  if (inString) s += '"';

  s = s.replace(/,\s*"[^"]*"\s*:\s*$/, "");
  s = s.replace(/:\s*$/, ": null");
  s = s.replace(/,\s*"[^"]*"\s*$/, "");
  s = s.replace(/,\s*$/, "");

  const finalStack = [];
  inString = false;
  escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '{') finalStack.push('}');
      else if (ch === '[') finalStack.push(']');
      else if (ch === '}' || ch === ']') {
        if (finalStack.length && finalStack[finalStack.length - 1] === ch) {
          finalStack.pop();
        }
      }
    }
  }

  while (finalStack.length > 0) {
    s += finalStack.pop();
  }
  return s;
}

// Parse une réponse IA en JSON, même imparfaite (markdown fences, virgules, etc.)
export function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") throw new Error("Réponse IA vide");
  let s = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const isArray = s.indexOf("[") !== -1 && (s.indexOf("[") < (s.indexOf("{") === -1 ? Infinity : s.indexOf("{")));
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";
  const first = s.indexOf(open);
  if (first === -1) throw new Error("Aucun objet JSON trouvé dans la réponse");
  const last = s.lastIndexOf(close);
  if (last === -1 || last < first) {
    s = s.substring(first);
    s = repairTruncatedJSON(s);
  } else {
    s = s.substring(first, last + 1);
  }
  s = repairUnescapedQuotes(s);
  s = s.replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(s); } catch {
    try {
      // eslint-disable-next-line no-control-regex
      const aggressive = s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(aggressive);
    } catch {
      const repaired = repairTruncatedJSON(s);
      return JSON.parse(repaired);
    }
  }
}

export function levenshtein(a, b) {
  if (!a || !b) return (a || b || "").length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = temp;
    }
  }
  return dp[b.length];
}

export function findSimilarCards(front, expressions, threshold = 0.75) {
  const norm = s => (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const target = norm(front);
  if (target.length < 3) return [];
  return (expressions || [])
    .map(e => {
      const f = norm(e?.front);
      if (!f) return null;
      const dist = levenshtein(target, f);
      const sim = 1 - dist / Math.max(target.length, f.length);
      return sim >= threshold ? { card: e, similarity: sim } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}
