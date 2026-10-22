import { resolveAll, KNOWN_KEY_NAMES } from "./security/apiKeys.js";

async function transcribeWithDeepgram(audioBlob, language = "fr") {
  const deepgramKeys = resolveAll(KNOWN_KEY_NAMES?.deepgram || ["VITE_DEEPGRAM_API_KEY", "VITE_DEEPGRAM_API_KEY_1", "VITE_DEEPGRAM_API_KEY_2", "VITE_DEEPGRAM_API_KEY_3"]);
  if (deepgramKeys.length === 0) return null;

  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-2");
  url.searchParams.set("smart_format", "true");
  if (language) {
    url.searchParams.set("language", language);
  }

  for (const apiKey of deepgramKeys) {
    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": audioBlob.type || "audio/webm",
        },
        body: audioBlob,
      });

      if (!res.ok) {
        console.warn(`[Deepgram] Erreur HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
      if (typeof text === "string" && text.length > 0) {
        return text;
      }
    } catch (dgErr) {
      console.warn("[Deepgram] Échec transcription:", dgErr?.message);
    }
  }
  return null;
}

export async function transcribeAudio(audioBlob, language = "fr") {
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-large-v3-turbo");
  if (language) formData.append("language", language);

  const aiProxy = (typeof import.meta !== "undefined" && import.meta.env?.VITE_AI_PROXY_URL || "").replace(/\/+$/, "");
  if (aiProxy) {
    try {
      const pRes = await fetch(`${aiProxy}/ai/transcribe`, {
        method: "POST",
        body: formData,
      });
      if (pRes.ok) {
        const data = await pRes.json();
        if (data && typeof data.text === "string") {
          return data.text.trim();
        }
      }
    } catch (proxyErr) {
      console.debug("[Transcribe] Proxy fallback vers clés locales:", proxyErr?.message);
    }
  }

  const keys = resolveAll(KNOWN_KEY_NAMES?.groq || ["VITE_GROQ_API_KEY", "VITE_GROQ_API_KEY_1", "VITE_GROQ_API_KEY_2", "VITE_GROQ_API_KEY_3", "VITE_GROQ_API_KEY_4", "VITE_GROQ_API_KEY_5", "VITE_GROQ_API_KEY_6", "VITE_GROQ_API_KEY_7", "VITE_GROQ_API_KEY_8", "VITE_GROQ_API_KEY_9"]);

  let lastErr = null;
  for (const apiKey of keys) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Erreur API ${res.status}`);
      }

      const data = await res.json();
      return data.text?.trim() || "";
    } catch (err) {
      lastErr = err;
    }
  }

  // Fallback résilient : Deepgram Nova-2
  try {
    const deepgramText = await transcribeWithDeepgram(audioBlob, language);
    if (deepgramText) {
      return deepgramText;
    }
  } catch (dgErr) {
    console.warn("[Transcribe] Deepgram fallback a échoué:", dgErr?.message);
  }

  throw lastErr || new Error("Le service de transcription est temporairement indisponible.");
}
