// mediaTranscribe.js — Récupérer le texte d'une vidéo QUAND YouTube ne fournit
// aucun sous-titre, notamment quand les sous-titres sont INCRUSTÉS dans l'image
// (hardcoded / burned-in). Deux moteurs complémentaires :
//   1) transcribeMediaFile  → Whisper large-v3-turbo (Groq) sur la piste audio.
//   2) ocrBurnedSubtitles   → OCR (tesseract.js) sur les images de la vidéo.

// ─────────────────────────── Whisper (audio) ────────────────────────────────
function groqKeys() {
  return [
    import.meta.env.VITE_GROQ_API_KEY,
    import.meta.env.VITE_GROQ_API_KEY_5,
    import.meta.env.VITE_GROQ_API_KEY_6,
    import.meta.env.VITE_GROQ_API_KEY_7,
  ].filter(Boolean);
}

// Encode des samples PCM float en WAV 16 kHz mono (format accepté partout).
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const w = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  w(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

async function decodeToMono16k(file) {
  const arrayBuffer = await file.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();

  const target = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * target), target);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

async function whisperChunk(blob, language) {
  const keys = groqKeys();
  if (!keys.length) throw new Error("Clé Groq manquante (VITE_GROQ_API_KEY) — impossible de transcrire l'audio.");
  let lastErr = null;
  for (const key of keys) {
    try {
      const fd = new FormData();
      fd.append("file", blob, "audio.wav");
      fd.append("model", "whisper-large-v3-turbo");
      if (language) fd.append("language", language);
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: fd,
      });
      if (!r.ok) { lastErr = new Error(`Groq ${r.status}: ${await r.text().catch(() => "")}`); continue; }
      const data = await r.json();
      if (data?.text) return data.text;
      lastErr = new Error("Réponse Whisper vide.");
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Transcription audio impossible.");
}

/**
 * Transcrit un fichier vidéo/audio local via Whisper.
 * Découpe en tranches de 8 minutes pour rester sous les limites d'upload.
 */
export async function transcribeMediaFile(file, { language = "en", onProgress } = {}) {
  onProgress?.("🎧 Décodage de la piste audio…");
  const pcm = await decodeToMono16k(file);
  const sr = 16000;
  const CHUNK_SEC = 480; // 8 min
  const chunkLen = CHUNK_SEC * sr;
  const total = Math.max(1, Math.ceil(pcm.length / chunkLen));
  const parts = [];
  for (let i = 0; i < total; i++) {
    onProgress?.(`🗣️ Transcription Whisper… (${i + 1}/${total})`);
    const slice = pcm.subarray(i * chunkLen, Math.min((i + 1) * chunkLen, pcm.length));
    const text = await whisperChunk(encodeWav(slice, sr), language);
    parts.push(text.trim());
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// ─────────────────────── OCR des sous-titres incrustés ──────────────────────
function normalizeLine(s) {
  return s.replace(/\s+/g, " ").replace(/[|_]+/g, "").trim();
}

function similar(a, b) {
  if (!a || !b) return 0;
  const A = new Set(a.toLowerCase().split(" "));
  const B = new Set(b.toLowerCase().split(" "));
  let inter = 0;
  A.forEach(w => { if (B.has(w)) inter++; });
  return inter / Math.max(A.size, B.size);
}

/**
 * Lit les sous-titres GRAVÉS DANS L'IMAGE d'un fichier vidéo local.
 * Échantillonne une image toutes `intervalSec` secondes, recadre le bas de
 * l'écran (zone des sous-titres), passe l'OCR puis déduplique les répétitions.
 * Nécessite la dépendance `tesseract.js` (npm i tesseract.js).
 */
export async function ocrBurnedSubtitles(file, { intervalSec = 1.2, cropRatio = 0.32, onProgress } = {}) {
  let Tesseract;
  try {
    Tesseract = (await import("tesseract.js")).default || (await import("tesseract.js"));
  } catch {
    throw new Error("Module OCR absent. Installe-le avec : npm i tesseract.js");
  }

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = URL.createObjectURL(file);
  await new Promise((res, rej) => {
    video.onloadedmetadata = res;
    video.onerror = () => rej(new Error("Impossible de lire ce fichier vidéo."));
  });

  const duration = video.duration;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  onProgress?.("🔤 Initialisation du moteur OCR…");
  const worker = await Tesseract.createWorker("eng");

  const lines = [];
  const steps = Math.max(1, Math.floor(duration / intervalSec));
  try {
    for (let i = 0; i < steps; i++) {
      const t = i * intervalSec;
      await new Promise((res) => {
        video.onseeked = res;
        video.currentTime = Math.min(t, duration - 0.05);
      });

      const cropH = Math.round(video.videoHeight * cropRatio);
      canvas.width = video.videoWidth;
      canvas.height = cropH;
      ctx.drawImage(
        video,
        0, video.videoHeight - cropH, video.videoWidth, cropH,
        0, 0, canvas.width, canvas.height
      );

      // Binarisation : texte blanc sur fond variable → seuil haut
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let p = 0; p < d.length; p += 4) {
        const lum = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        const v = lum > 190 ? 0 : 255; // texte en noir sur blanc pour l'OCR
        d[p] = d[p + 1] = d[p + 2] = v;
      }
      ctx.putImageData(img, 0, 0);

      const { data } = await worker.recognize(canvas);
      const text = normalizeLine(data?.text || "");
      if (text.length >= 4) {
        const prev = lines[lines.length - 1];
        if (!prev || similar(prev, text) < 0.6) lines.push(text);
        else if (text.length > prev.length) lines[lines.length - 1] = text;
      }
      if (i % 5 === 0) onProgress?.(`🔤 OCR des sous-titres incrustés… ${Math.round((i / steps) * 100)}%`);
    }
  } finally {
    await worker.terminate();
    URL.revokeObjectURL(video.src);
  }

  return lines.join(" ").replace(/\s+/g, " ").trim();
}

export default { transcribeMediaFile, ocrBurnedSubtitles };
