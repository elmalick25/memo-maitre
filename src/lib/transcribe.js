export async function transcribeAudio(audioBlob, language = "fr") {
  const keys = [
    import.meta.env.VITE_GROQ_API_KEY,
    import.meta.env.VITE_GROQ_API_KEY_5,
    import.meta.env.VITE_GROQ_API_KEY_6,
    import.meta.env.VITE_GROQ_API_KEY_7,
  ].filter(Boolean);

  if (keys.length === 0) throw new Error("Clé Groq manquante");

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-large-v3-turbo");
  if (language) formData.append("language", language);

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
  throw lastErr || new Error("Le service de transcription est temporairement indisponible.");
}
