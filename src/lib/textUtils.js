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

// Parse une réponse IA en JSON, même imparfaite (markdown fences, virgules, etc.)
export function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") throw new Error("Réponse IA vide");
  let s = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const isArray = s.indexOf("[") !== -1 && (s.indexOf("[") < (s.indexOf("{") === -1 ? Infinity : s.indexOf("{")));
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";
  const first = s.indexOf(open);
  const last = s.lastIndexOf(close);
  if (first === -1 || last === -1) throw new Error("Aucun objet JSON trouvé dans la réponse");
  s = s.substring(first, last + 1);
  s = repairUnescapedQuotes(s);
  s = s.replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(s); } catch {
    // eslint-disable-next-line no-control-regex
    const aggressive = s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(aggressive);
  }
}
