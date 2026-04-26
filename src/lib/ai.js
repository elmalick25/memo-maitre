// src/lib/ai.js
import { GROQ_API_KEY, GROQ_MODEL, GROQ_VISION } from "../config/constants";

export async function callClaude(systemPrompt, userMessage, isVision = false, imageUrl = null) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const messages = [{ role: "system", content: systemPrompt }];

  if (isVision && imageUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userMessage },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    });
  } else {
    messages.push({ role: "user", content: userMessage });
  }

  for (let i = 0; i <= 2; i++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: isVision ? GROQ_VISION : GROQ_MODEL,
          max_tokens: 1024,
          temperature: 0.7,
          messages
        }),
      });
      if (res.status === 429) throw new Error("QUOTA_EXCEEDED");
      if (!res.ok) throw new Error(`Status: ${res.status}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response");
      return text;
    } catch (err) {
      if (err.message === "QUOTA_EXCEEDED" || i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}