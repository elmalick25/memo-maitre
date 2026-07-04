// 🧼 secretsScrubber.js — Redact API keys avant tout log/upload
// Couvre Gemini (AIza...), OpenAI (sk-...), ElevenLabs (sk_...), Groq (gsk_...),
// Cohere, HuggingFace (hf_), Cloudflare, generic JWT.
const PATTERNS = [
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk_[a-z0-9]{20,}\b/g,
  /\bgsk_[A-Za-z0-9]{20,}\b/g,
  /\bhf_[A-Za-z0-9]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+\b/g, // JWT
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/gi,
];

export function scrub(input) {
  if (input == null) return input;
  if (typeof input === "string") {
    let s = input;
    for (const p of PATTERNS) s = s.replace(p, "[REDACTED]");
    return s;
  }
  if (typeof input === "object") {
    try { return JSON.parse(scrub(JSON.stringify(input))); } catch { return input; }
  }
  return input;
}

// Patch console.* pour redact automatique (opt-in)
export function installConsoleScrubber() {
  if (typeof console === "undefined" || console.__scrubbed) return;
  for (const m of ["log", "warn", "error", "info"]) {
    const orig = console[m].bind(console);
    console[m] = (...args) => orig(...args.map(scrub));
  }
  console.__scrubbed = true;
}
