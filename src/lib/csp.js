// 🔒 csp.js — Helpers CSP (à ajouter en <meta http-equiv> si tu n'as pas accès au header)
// Suggestion de policy stricte compatible avec ton stack actuel.
export const SUGGESTED_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Vite inline pour le boot ; remplace par nonce en prod
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://generativelanguage.googleapis.com https://api.elevenlabs.io https://api.cohere.ai https://api.groq.com https://openrouter.ai https://api-inference.huggingface.co https://*.cloudflare.com https://*.youtubetranscript.com https://yt.lemnoslife.com",
  "media-src 'self' blob: data: https:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// À injecter dans index.html :
//   <meta http-equiv="Content-Security-Policy" content="..." />
// ou via Cloudflare Pages Headers (préféré).

export function installCSPReporter() {
  if (typeof document === "undefined") return;
  document.addEventListener("securitypolicyviolation", (e) => {
    try {
      window.dispatchEvent(new CustomEvent("app:csp-violation", {
        detail: { directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile },
      }));
    } catch {}
  });
}
