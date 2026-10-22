import { sanitizeInput } from "./textUtils.js";
import { callGeminiGenerateContent as defaultGeminiCall, getGeminiKeyCount as defaultKeyCount, isGeminiLikelyUnavailable as defaultGeminiUnavailable } from "./geminiClient.js";
import { aiCall as defaultAiCall } from "./aiRouter.js";

const GEMINI_MODEL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_MODEL) || (typeof process !== "undefined" && process.env?.VITE_GEMINI_MODEL) || "gemini-flash-latest";

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export async function callClaude(systemPrompt, userMessage, isVisionOrOptions = false, imageUrl = null, deps = {}) {
  const isVisionFlag = isVisionOrOptions === true;
  const opts = (isVisionOrOptions && typeof isVisionOrOptions === "object") ? isVisionOrOptions : {};
  const effectiveImageUrl = imageUrl || opts.imageUrl || null;
  const isVision = isVisionFlag || Boolean(effectiveImageUrl);
  const maxTokens = opts.maxTokens || 4096;
  const wantsGrounding = Boolean(opts.grounding);
  const temperature = opts.temperature !== undefined ? opts.temperature : 0.7;
  const task = opts.task || (opts.fast ? "fast" : (isVision ? "vision" : "chat"));

  const aiCallFn = deps.aiCall || defaultAiCall;
  const geminiCallFn = deps.callGeminiGenerateContent || defaultGeminiCall;
  const getKeyCountFn = deps.getGeminiKeyCount || defaultKeyCount;
  const isGeminiUnavailableFn = deps.isGeminiLikelyUnavailable || defaultGeminiUnavailable;

  const safeUser = sanitizeInput(userMessage);

  const wrapReturn = (text, sources = []) =>
    wantsGrounding ? { text, sources, grounded: false } : text;

  // ─── 1. MODE VISION : Google Gemini avec support natif inlineData ────────
  if (isVision && getKeyCountFn() > 0 && !isGeminiUnavailableFn()) {
    try {
      const parsedImg = effectiveImageUrl ? parseDataUrl(effectiveImageUrl) : null;
      const parts = [];
      if (parsedImg) {
        parts.push({ inlineData: { mimeType: parsedImg.mimeType, data: parsedImg.data } });
      }
      parts.push({ text: safeUser || "Extrais et analyse fidèlement le texte de cette image." });

      const modelsToTry = ["gemini-flash-latest", GEMINI_MODEL, "gemini-3.5-flash"];
      for (const model of [...new Set(modelsToTry.filter(Boolean))]) {
        try {
          const data = await geminiCallFn({
            model,
            body: {
              systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
              contents: [{ role: "user", parts }],
              generationConfig: { maxOutputTokens: maxTokens, temperature }
            }
          });
          const candidate = data?.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;
          if (text) {
            return wrapReturn(text, []);
          }
        } catch (mErr) {
          console.warn(`[callClaude] Gemini vision avec ${model} en échec:`, mErr?.message || mErr);
        }
      }
    } catch (gErr) {
      console.warn("[callClaude] Pipeline Gemini vision erreur:", gErr?.message || gErr);
    }
  }

  // ─── 2. GROUNDING (Recherche Web via Gemini) ─────────────────────────────
  if (wantsGrounding && getKeyCountFn() > 0 && !isGeminiUnavailableFn()) {
    try {
      const data = await geminiCallFn({
        model: GEMINI_MODEL,
        body: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: safeUser }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: maxTokens, temperature }
        }
      });
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (text) {
        const chunks = candidate?.groundingMetadata?.groundingChunks || [];
        const sources = chunks.map(c => {
          const uri = c.web?.uri;
          if (!uri) return null;
          let domain = uri;
          try { domain = new URL(uri).hostname.replace("www.", ""); } catch { }
          return { link: uri, title: c.web?.title || domain, source: domain, viaGemini: true };
        }).filter(Boolean);
        return { text, sources, grounded: sources.length > 0 };
      }
    } catch (err) {
      console.warn("Gemini Grounding error:", err?.message || err);
    }
  }

  // ─── 3. AI ROUTER (OpenRouter / Cohere / Groq / Mistral) ─────────────────
  if (!opts.directGemini) {
    const taskChain = isVision
      ? ["vision"]
      : [...new Set([task, "chat"].filter(Boolean))];

    for (const t of taskChain) {
      try {
        const res = await aiCallFn({
          task: t,
          system: systemPrompt,
          user: safeUser,
          imageUrl: isVision ? effectiveImageUrl : undefined,
          maxTokens,
          temperature,
          json: opts.json || t === "fast-json",
          callerContext: opts.callerContext || opts.context,
        });
        const text = res?.text;
        if (typeof text === "string" && text.trim().length > 0) {
          return wrapReturn(text, []);
        }
      } catch (err) {
        console.warn(`aiRouter task '${t}' failed:`, err?.message || err);
      }
    }
  }

  // ─── 4. Filet de sécurité ultime (Gemini standard texte / JSON) ───────────
  if (!isVision && getKeyCountFn() > 0 && !isGeminiUnavailableFn()) {
    try {
      const generationConfig = { maxOutputTokens: maxTokens, temperature };
      if (opts.json) {
        generationConfig.responseMimeType = "application/json";
      }
      const data = await geminiCallFn({
        model: GEMINI_MODEL,
        body: {
          systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
          contents: [{ role: "user", parts: [{ text: safeUser }] }],
          generationConfig
        }
      });
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (typeof text === "string" && text.trim().length > 0) {
        return wrapReturn(text, []);
      }
    } catch (gErr) {
      console.warn("[callClaude] Gemini ultimate fallback error:", gErr?.message || gErr);
    }
  }

  throw new Error("Tous les providers IA sont temporairement indisponibles. Réessaie dans 1-2 minutes.");
}
