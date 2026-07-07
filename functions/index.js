const { onRequest, onCall } = require("firebase-functions/v2/https");
const { AccessToken } = require('livekit-server-sdk');

const admin = require("firebase-admin");

admin.initializeApp();

const URLS = {
  cerebras:  "https://api.cerebras.ai/v1/chat/completions",
  groq:      "https://api.groq.com/openai/v1/chat/completions",
  mistral:   "https://api.mistral.ai/v1/chat/completions",
  or:        "https://openrouter.ai/api/v1/chat/completions",
  fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
  cohere:    "https://api.cohere.com/v2/chat",
  sambanova: "https://api.sambanova.ai/v1/chat/completions",
  aimlapi:   "https://api.aimlapi.com/v1/chat/completions",
  deepseek:  "https://api.deepseek.com/chat/completions",
};

// Simplified key retrieval from environment variables
function getKeysForProvider(provider) {
  const envKey = provider.toUpperCase();
  const keys = [];
  
  if (process.env[`VITE_${envKey}_API_KEY`]) {
    keys.push(process.env[`VITE_${envKey}_API_KEY`]);
  }
  
  for (let i = 1; i <= 12; i++) {
    if (process.env[`VITE_${envKey}_API_KEY_${i}`]) {
      keys.push(process.env[`VITE_${envKey}_API_KEY_${i}`]);
    }
  }
  
  // Custom mappings for providers with different naming conventions
  if (provider === 'or') {
    for (let i = 1; i <= 7; i++) {
      if (process.env[`VITE_OPENROUTER_API_KEY_${i}`]) {
        keys.push(process.env[`VITE_OPENROUTER_API_KEY_${i}`]);
      }
    }
  }
  
  return keys;
}

exports.aiProxy = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const provider = req.headers["x-provider"];
  const body = req.body;
  if (!provider || !URLS[provider]) {
    return res.status(400).send("Invalid provider in X-Provider header");
  }

  const keys = getKeysForProvider(provider);
  if (keys.length === 0) {
    return res.status(500).send(`No API keys configured for ${provider}`);
  }

  // Simple random key picking for simplicity in this proxy
  const apiKey = keys[Math.floor(Math.random() * keys.length)];
  let url = URLS[provider];
  
  if (provider === "gemini") {
    // For Gemini, URL is passed in the body or we construct it
    const model = body.model || "gemini-2.0-flash-lite";
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    // Gemini does not use body.model in payload, let's keep it as is if body already has the correct format
  }
  
  const headers = {
    "Content-Type": "application/json",
  };
  
  if (provider !== "gemini" && provider !== "elevenlabs-signed-url") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  // Special headers
  if (provider === "or") {
    headers["HTTP-Referer"] = "https://memo-maitre.web.app";
    headers["X-Title"] = "MemoMaster";
  } else if (provider === "elevenlabs-signed-url") {
    const agentId = body.agent_id;
    let elKey = apiKey; 
    for (let i = 1; i <= 10; i++) {
      if (process.env[`VITE_ELEVENLABS_AGENT_ID_${i}`] === agentId && process.env[`VITE_ELEVENLABS_API_KEY_${i}`]) {
        elKey = process.env[`VITE_ELEVENLABS_API_KEY_${i}`];
        break;
      }
    }
    headers["xi-api-key"] = elKey;
    url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`;
  } else if (provider === "youtube-details") {
    const ytKey = process.env.VITE_YOUTUBE_API_KEY;
    if (!ytKey) return res.status(500).send("YouTube API key not configured");
    url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${body.videoId}&key=${ytKey}`;
  } else if (provider === "unsplash") {
    const unsplashKey = process.env.VITE_UNSPLASH_API_KEY;
    if (!unsplashKey) return res.status(500).send("Unsplash API key not configured");
    url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(body.query)}&per_page=8&client_id=${unsplashKey}`;
  } else if (provider === "whisper") {
    url = "https://api.groq.com/openai/v1/audio/transcriptions";
    const groqKeys = getKeysForProvider("groq");
    if (!groqKeys.length) return res.status(500).send("No Groq keys configured");
    const groqKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];
    headers["Authorization"] = `Bearer ${groqKey}`;
    delete headers["Content-Type"];
  } else if (provider === "groq-tts") {
    url = "https://api.groq.com/openai/v1/audio/speech";
    const groqKeys = getKeysForProvider("groq");
    if (!groqKeys.length) return res.status(500).send("No Groq keys configured");
    const groqKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];
    headers["Authorization"] = `Bearer ${groqKey}`;
  }

  try {
    const method = (provider === "elevenlabs-signed-url" || provider === "youtube-details" || provider === "unsplash") ? "GET" : "POST";
    let reqBody;
    
    if (provider === "elevenlabs-signed-url" || provider === "youtube-details" || provider === "unsplash") {
      reqBody = undefined;
    } else if (provider === "whisper") {
      const formData = new FormData();
      // body.audioBase64 is the file, body.language is lang
      const binaryString = atob(body.audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/webm' });
      formData.append("file", blob, "audio.webm");
      formData.append("model", "whisper-large-v3-turbo");
      if (body.language) formData.append("language", body.language);
      reqBody = formData;
    } else if (provider === "hf-stt") {
      url = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";
      headers["Authorization"] = `Bearer ${process.env.VITE_HF_TOKEN}`;
      delete headers["Content-Type"];
      
      const binaryString = atob(body.audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      reqBody = new Blob([bytes], { type: 'audio/webm' });
    } else if (provider === "hf-tts") {
      url = "https://api-inference.huggingface.co/models/hexgrad/Kokoro-82M";
      headers["Authorization"] = `Bearer ${process.env.VITE_HF_TOKEN}`;
      reqBody = JSON.stringify(body);
    } else {
      reqBody = JSON.stringify(body);
    }
    
    const upstreamRes = await fetch(url, {
      method,
      headers,
      body: reqBody,
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      console.error(`Upstream error ${upstreamRes.status}:`, errText);
      return res.status(upstreamRes.status).send(errText);
    }

    if (provider === "whisper" || provider === "hf-stt") {
      const data = await upstreamRes.json();
      return res.json(data);
    }

    if (provider === "groq-tts" || provider === "hf-tts") {
      res.setHeader("Content-Type", "audio/wav");
      upstreamRes.body.pipe(res);
      
      upstreamRes.body.on('error', (err) => {
        console.error('Stream error:', err);
        res.end();
      });
      return;
    }

    if (body.stream && provider !== "elevenlabs-signed-url" && provider !== "youtube-details") {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      
      upstreamRes.body.pipe(res);
      
      upstreamRes.body.on('error', (err) => {
        console.error('Stream error:', err);
        res.end();
      });
    } else {
      const data = await upstreamRes.json();
      res.json(data);
    }
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).send("Internal proxy error");
  }
});

exports.generateLivekitToken = onCall((request) => {
  const data = request.data;
  
  const roomName = data.roomName || 'agent-room';
  const participantName = data.participantName || `user-${Math.floor(Math.random() * 1000)}`;

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: participantName }
  );

  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

  return { token: at.toJwt() };
});
