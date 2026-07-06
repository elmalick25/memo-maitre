// Lab.jsx – Laboratoire IA v2 (PDF→Fiches · Résumé Complet · Audio Fiche · Photo Fiche)
// Communique avec MemoMaster via onAddCards callback
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import GodTierContent from "./components/GodTierContent";
import { callGeminiGenerateContent, getGeminiKeyCount, isGeminiLikelyUnavailable } from "./lib/geminiClient";
import { aiCall } from "./lib/aiRouter";
import { today as localToday, addDays } from "./utils/dateUtils";

// ── IndexedDB Helper pour la persistance des Blobs audio ─────────────────────
const DB_NAME = "lab_audio_db";
const STORE_NAME = "audio_blobs";

function initAudioDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveAudioBlob(id, blob) {
  try {
    const db = await initAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("Failed to save audio blob to IndexedDB:", err);
  }
}

async function getAudioBlob(id) {
  try {
    const db = await initAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("Failed to get audio blob from IndexedDB:", err);
    return null;
  }
}

async function deleteAudioBlob(id) {
  try {
    const db = await initAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("Failed to delete audio blob from IndexedDB:", err);
  }
}

// ── SRS helpers pour les fiches audio (algo SM-2 simplifié) ───────────────────
// Les fiches audio entrent dans le même cycle de révision que les fiches texte.
// On stocke level / easeFactor / interval / nextReview / reviewHistory sur
// chaque audio card. Au "rappel", l'utilisateur écoute l'audio puis évalue
// son niveau de souvenir, ce qui décale la prochaine révision.
function scheduleAudioReview(card, grade) {
  // grade: "again" (0), "good" (1), "easy" (2)
  const prev = {
    level: card.level || 0,
    easeFactor: card.easeFactor || 2.5,
    interval: card.interval || 1,
    repetitions: card.repetitions || 0,
    reviewHistory: card.reviewHistory || [],
  };
  let { level, easeFactor, interval, repetitions } = prev;

  if (grade === "again") {
    level = Math.max(0, level - 1);
    repetitions = 0;
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (grade === "good") {
    level = Math.min(7, level + 1);
    repetitions += 1;
    interval = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(interval * easeFactor);
  } else if (grade === "easy") {
    level = Math.min(7, level + 2);
    repetitions += 1;
    interval = repetitions === 1 ? 3 : Math.round(interval * easeFactor * 1.3);
    easeFactor = Math.min(3.0, easeFactor + 0.15);
  }
  const nextReview = addDays(localToday(), interval);
  return {
    ...card,
    level, easeFactor, interval, repetitions, nextReview,
    reviewHistory: [...prev.reviewHistory, { date: localToday(), grade }].slice(-30),
  };
}



// ── 🔮 GOD MODE : HoloCard (Bento 3D & Glassmorphism) ─────────────────────────
const HoloCard = ({ children, className, style, theme, glowColor, onClick, onDragOver, onDragLeave, onDrop }) => {
  const cardRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [coord, setCoord] = useState({ x: 0, y: 0, rx: 0, ry: 0 });
  const rafRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    if (rafRef.current) return; // throttle via requestAnimationFrame
    const clientX = e.clientX;
    const clientY = e.clientY;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rx = ((cy - y) / cy) * 4;
      const ry = ((x - cx) / cx) * 4;
      setCoord({ x, y, rx, ry });
    });
  };

  const innerStyle = {
    position: "relative", zIndex: 1, width: "100%", height: "100%",
    transform: hover ? "translateZ(20px)" : "translateZ(0)",
    transition: hover ? "none" : "all 0.4s cubic-bezier(0.23, 1, 0.32, 1)",
  };

  const outerStyle = { ...style };
  const borderRadius = outerStyle.borderRadius || 24;

  return (
    <div ref={cardRef} className={className} onClick={onClick}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setCoord({ x: 0, y: 0, rx: 0, ry: 0 }); }}
      onMouseMove={handleMouseMove}
      style={{
        ...outerStyle,
        perspective: "1000px", transformStyle: "preserve-3d",
        transition: hover ? "none" : "all 0.4s cubic-bezier(0.23, 1, 0.32, 1)",
        transform: hover ? `rotateX(${coord.rx}deg) rotateY(${coord.ry}deg) scale3d(1.02, 1.02, 1.02)` : "rotateX(0) rotateY(0) scale3d(1, 1, 1)",
        zIndex: hover ? 10 : 1,
        borderRadius,
        overflow: "hidden", // Contient l'aura et le glassmorphism
        background: outerStyle.background || (theme ? theme.cardBg : "transparent"),
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      }}>
      {/* Lueur radiale de survol (Aura) */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(circle 350px at ${coord.x}px ${coord.y}px, ${glowColor || '#4D6BFE'}30, transparent 100%)`,
        opacity: hover ? 1 : 0, transition: "opacity 0.4s ease", pointerEvents: "none", zIndex: 0
      }} />
      <div style={innerStyle}>{children}</div>
    </div>
  );
};

// ── 🌌 GOD MODE : Vortex Drop Zone (Drag & Drop) ──────────────────────────
const VortexDropZone = ({ isDragging, onDragOver, onDragLeave, onDrop, onClick, color, icon, title, subtitle, theme, disabled }) => (
  <div
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    onClick={disabled ? undefined : onClick}
    style={{
      position: "relative",
      background: isDragging ? `${color}15` : "var(--mm-bg-card)",
      border: `2px ${isDragging ? 'solid' : 'dashed'} ${isDragging ? color : "var(--mm-border)"}`,
      borderRadius: 24,
      padding: "40px 20px",
      textAlign: "center",
      cursor: disabled ? "default" : "pointer",
      overflow: "hidden",
      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      transform: isDragging ? "scale(1.03)" : "scale(1)",
      boxShadow: isDragging ? `0 0 60px ${color}50, inset 0 0 30px ${color}30` : "var(--mm-shadow)",
      minHeight: 220,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(20px)",
    }}
  >
    {/* Default minimal neon ring */}
    <div style={{
      position: "absolute", top: "50%", left: "50%", width: 100, height: 100,
      marginTop: -50, marginLeft: -50, borderRadius: "50%",
      border: `2px solid ${color}30`, boxShadow: `0 0 15px ${color}20`,
      opacity: isDragging ? 0 : 1, transition: "all 0.4s", pointerEvents: "none"
    }} />

    {/* Active Vortex Rings */}
    <div style={{
      position: "absolute", top: "50%", left: "50%", width: 140, height: 140,
      marginTop: -70, marginLeft: -70, borderRadius: "50%",
      border: `3px solid transparent`, borderTopColor: color, borderBottomColor: color,
      animation: isDragging ? "vortex-spin 1.5s linear infinite, vortex-pulse 2s ease-in-out infinite" : "none",
      opacity: isDragging ? 1 : 0, transition: "opacity 0.4s", pointerEvents: "none"
    }} />
    <div style={{
      position: "absolute", top: "50%", left: "50%", width: 200, height: 200,
      marginTop: -100, marginLeft: -100, borderRadius: "50%",
      border: `1px dashed ${color}`,
      animation: isDragging ? "vortex-spin 2.5s linear infinite reverse" : "none",
      opacity: isDragging ? 0.5 : 0, transition: "opacity 0.4s", pointerEvents: "none"
    }} />

    {/* Particles */}
    {isDragging && Array.from({ length: 24 }).map((_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      const dist = 140;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      return (
        <div key={i} style={{
          position: "absolute", top: "50%", left: "50%", width: 6, height: 6, borderRadius: "50%",
          background: color, boxShadow: `0 0 15px ${color}, 0 0 30px ${color}`, "--dx": `${dx}px`, "--dy": `${dy}px`,
          animation: `particle-suck 1.2s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.05}s infinite`,
          opacity: 0, pointerEvents: "none"
        }} />
      );
    })}

    <div style={{ position: "relative", zIndex: 10 }}>
      <div style={{ fontSize: 48, marginBottom: 12, transform: isDragging ? "scale(1.2)" : "scale(1)", transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)", filter: isDragging ? `drop-shadow(0 0 15px ${color}80)` : "none" }}>{icon}</div>
      <div style={{ fontWeight: 900, color: theme.text, fontSize: 18, marginBottom: 6 }}>{isDragging ? "Lâche pour aspirer les données..." : title}</div>
      <div style={{ color: theme.textMuted, fontSize: 13, maxWidth: 350, margin: "0 auto", lineHeight: 1.5 }}>{subtitle}</div>
    </div>
  </div>
);

// ── 🧠 GOD MODE : Visualiseur Cerveau IA (Neuromorphic Loading) ───────────────
const NeuromorphicLoader = ({ text, color, theme, isDone }) => {
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    if (!text) return;
    if (isDone) {
      setDisplayText(text);
      return;
    }
    let i = 0;
    setDisplayText("");
    const timer = setInterval(() => {
      setDisplayText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [text, isDone]);

  if (!text) return null;

  if (isDone) {
    return (
      <div style={{
        marginTop: 12, padding: "14px 20px",
        background: `${color}15`, borderRadius: 16,
        border: `1px solid ${color}40`, color,
        fontWeight: 800, fontSize: 14, textAlign: "center",
        animation: "fadeUp 0.4s ease"
      }}>
        {text}
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 16, padding: "24px 20px",
      background: "var(--mm-bg-card)", borderRadius: 16,
      border: `1px solid ${color}40`,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
      position: "relative", overflow: "hidden",
      boxShadow: `inset 0 0 30px ${color}20, 0 8px 30px rgba(0,0,0,0.3)`,
      backdropFilter: "blur(20px)",
      "--glow-color": color
    }}>
      {/* Grille de données défilante */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.15, pointerEvents: "none",
        backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
        backgroundSize: "20px 20px",
        animation: "matrix-pan 3s linear infinite"
      }} />

      {/* Nodes du Cerveau IA */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, zIndex: 1 }}>
        {[0, 1, 2].map(i => (
          <React.Fragment key={i}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%", background: color,
              boxShadow: `0 0 15px ${color}`,
              animation: `ai-pulse 1.2s ${i * 0.4}s infinite alternate ease-in-out`
            }} />
            {i < 2 && <div style={{ width: 20, height: 2, background: `${color}40` }} />}
          </React.Fragment>
        ))}
      </div>

      {/* Typewriter Text */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
        color: theme.text, fontWeight: 700, zIndex: 1, textAlign: "center"
      }}>
        <span style={{ color }}>{"[IA] > "}</span>
        {displayText}
        <span style={{
          display: "inline-block", width: 8, height: 14, background: color,
          marginLeft: 4, verticalAlign: "middle", animation: "blink-cursor 0.8s infinite step-end"
        }} />
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// API KEYS — Masquées via Cloud Functions (aiProxy)

// ══════════════════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════════════════
function safeJsonParse(raw) {
  // Étape 1 : strip markdown fences
  let clean = raw.replace(/```json\b/gi, "").replace(/```/g, "").trim();
  // Étape 2 : isoler le bloc JSON
  const f = clean.indexOf("{") !== -1 ? clean.indexOf("{") : clean.indexOf("[");
  const l = clean.lastIndexOf("}") !== -1 ? clean.lastIndexOf("}") : clean.lastIndexOf("]");
  if (f === -1 || l === -1) throw new Error("Pas de JSON dans la réponse");
  let jsonStr = clean.substring(f, l + 1);
  // Étape 3 : nettoyage renforcé — tous les caractères de contrôle dans les strings JSON
  jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
    return match
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ") // control chars illégaux
      .replace(/\n/g, "\\n")   // newlines littéraux → escaped
      .replace(/\r/g, "\\r")   // carriage returns → escaped
      .replace(/\t/g, "\\t");  // tabs littéraux → escaped
  });
  return JSON.parse(jsonStr);
}

async function callGroq(systemPrompt, userMsg, maxTokens = 4000, isJson = false) {
  // Délègue à aiRouter (qui utilise le proxy)
  try {
    const { text } = await aiCall({
      task: isJson ? "batch-json" : "chat",
      system: systemPrompt,
      user: userMsg.slice(0, 24000),
      maxTokens,
      json: isJson,
    });
    if (text) return text;
  } catch (err) { 
    console.error("aiRouter failed in Lab.jsx:", err);
  }
  throw new Error("Tous les services AI sont épuisés.");
}

async function callVisionAI(systemPrompt, userMsg, base64Data, mimeType = "image/jpeg") {
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  // ── 1. Gemini direct (si quota dispo, skip si cooldown actif) ─────────────
  if (getGeminiKeyCount() > 0 && !isGeminiLikelyUnavailable()) {
    try {
      const d = await callGeminiGenerateContent({
        model: GEMINI_MODEL,
        body: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            parts: [
              { inlineData: { mimeType: mimeType, data: base64Data } },
              { text: userMsg }
            ]
          }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.2 }
        }
      });
      const t = d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (t) return t;
    } catch (e) { console.warn("Gemini vision error:", e?.message); }
  }

  // ── 2. aiRouter vision : Mistral Pixtral → OpenRouter → AIMLAPI ───────────
  try {
    const { text, provider, model } = await aiCall({
      task: "vision",
      system: systemPrompt,
      user: userMsg,
      imageUrl: dataUrl,
      maxTokens: 4096,
      temperature: 0.2,
    });
    if (text) {
      console.info(`[Lab vision] OK via ${provider}/${model}`);
      return text;
    }
  } catch (e) { console.warn("aiRouter vision error:", e?.message); }

  // ── 3. OpenRouter manuel (rotation 7 clés) ────────────────────────────────
  for (let i = 0; i < Math.max(OPENROUTER_KEYS.length, 0); i++) {
    const p = pickKey(OPENROUTER_KEYS, _cd.or, _idx.or);
    if (!p) break;
    const visionModels = [
      "google/gemini-2.0-flash-001",
      "qwen/qwen2.5-vl-32b-instruct:free",
      "meta-llama/llama-4-maverick:free",
    ];
    for (const model of visionModels) {
      try {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.key}`,
            "HTTP-Referer": "https://memo-app.local",
            "X-Title": "MemoMaster Lab",
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            temperature: 0.2,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: userMsg },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
        });
        if (r.status === 429 || r.status === 401) { markCd(_cd.or, p.idx); break; }
        if (!r.ok) continue;
        const d = await r.json();
        const t = d.choices?.[0]?.message?.content;
        if (t) {
          console.info(`[Lab vision] OK via openrouter/${model}`);
          return t;
        }
      } catch { /* try next model */ }
    }
  }

  throw new Error("Vision IA indisponible (quota Gemini atteint, fallbacks épuisés). Réessaie dans 1-2 minutes.");
}

/** @deprecated alias — utilise callVisionAI */
const callGeminiVision = callVisionAI;

async function extractPdfText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            s.onload = res; s.onerror = rej; document.head.appendChild(s);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += `\n[Page ${i}]\n` + content.items.map(item => item.str).join(" ");
        }
        resolve({ text: text.trim(), pages: pdf.numPages });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      resolve({ base64: result.split(",")[1], dataUrl: result, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTE PROMPT — Préservation vocabulaire exact + contenu riche
// ══════════════════════════════════════════════════════════════════════════════
const FIDELITY_RULE = `RÈGLE ABSOLUE DE FIDÉLITÉ AU SOURCE (PRIORITÉ MAXIMALE) :
Tu es un EXTRACTEUR, pas un rédacteur. Tu ne dois RIEN inventer, RIEN ajouter, RIEN compléter.
- Le champ "back" doit reprendre le contenu du document/de l'image MOT POUR MOT (ou au plus près possible), sans rien ajouter.
  → Si le document dit "la récursivité est une fonction qui s'appelle elle-même", la fiche dit EXACTEMENT "la récursivité est une fonction qui s'appelle elle-même" — PAS de définition plus longue, PAS d'exemple inventé, PAS de contexte ajouté.
- INTERDIT d'ajouter des connaissances extérieures, des exemples qui ne sont pas dans le source, des explications supplémentaires, des analogies ou des reformulations "améliorées".
- Si une information n'est PAS écrite dans le document/l'image, elle ne doit PAS apparaître sur la fiche.
- Conserve EXACTEMENT le vocabulaire, les termes, les noms propres, les procédures, les chiffres, les dates et les formules du source.
  → "envoyer de l'argent" reste "envoyer de l'argent" (JAMAIS "transférer des fonds") ; "compte courant" reste "compte courant".
- Le champ "front" peut être une question courte qui cible le concept, mais la RÉPONSE ("back") doit être la phrase/le passage source tel quel.
- En cas de doute : copie le texte source, ne le reformule pas.
`;

const RICH_CONTENT_RULE = `RÈGLE DE CONTENU RICHE — le champ "back" accepte du MARKDOWN :
- Si le passage contient du CODE (extrait, fonction, script, examen de code, sortie console, requête SQL, JSON, YAML, HTML, etc.) → reproduis-le INTÉGRALEMENT et SANS MODIFICATION dans un bloc fenced markdown avec le bon langage :
  \`\`\`python
  def fact(n): return 1 if n<=1 else n*fact(n-1)
  \`\`\`
  Ne paraphrase JAMAIS du code. Ne tronque pas. Garde l'indentation et les commentaires d'origine.
- Si le passage contient un TABLEAU (notes, comparatif, matrice, données chiffrées, conjugaisons, grille, planning…) → reproduis-le EN TABLE MARKDOWN GFM :
  | Colonne A | Colonne B |
  |-----------|-----------|
  | val 1     | val 2     |
- Tu peux mélanger texte + code + table dans la même fiche (type "mixed") si le concept l'exige.
- Tu peux utiliser : titres (## ###), gras **x**, italique *x*, listes -, code inline \`x\`, citations >, liens [t](u).
- Pour un EXAMEN DE CODE : crée des fiches du style « Que fait cette fonction ? », « Quelle est la sortie ? », « Corrige le bug », « Complète la ligne manquante » — et inclus toujours le bloc de code complet dans "back" pour pouvoir réviser.
- Champ "type" obligatoire : "qa" | "code" | "table" | "definition" | "concept" | "mixed".
`;

// ══════════════════════════════════════════════════════════════════════════════
// 🧠 GOD-TIER SUMMARY PIPELINE — onglet "Résumé Complet"
// Map-Reduce hiérarchique + extraction forensique structurée + audit couverture.
// Objectif : ne RIEN perdre du PDF, tout en produisant un résumé intelligent.
// ══════════════════════════════════════════════════════════════════════════════

// Découpe respectueuse des paragraphes / headings, avec overlap pour ne pas
// couper un concept à cheval entre deux chunks.
function smartChunkForSummary(text, maxChars = 12000, overlap = 600) {
  const out = [];
  if (!text) return out;
  if (text.length <= maxChars) return [text];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + maxChars, text.length);
    if (end < text.length) {
      const slice = text.slice(pos, end);
      const candidates = [
        slice.lastIndexOf("\n# "),
        slice.lastIndexOf("\n## "),
        slice.lastIndexOf("\n### "),
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
      ].filter(i => i > maxChars * 0.55);
      const cut = candidates.length ? Math.max(...candidates) : -1;
      if (cut > 0) end = pos + cut;
    }
    const piece = text.slice(pos, end).trim();
    if (piece.length > 80) out.push(piece);
    if (end >= text.length) break;
    pos = Math.max(end - overlap, pos + 1);
  }
  return out;
}

// Limiteur de concurrence — évite de saturer les rate-limits providers.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      try { results[idx] = await fn(items[idx], idx, items.length); }
      catch { results[idx] = null; }
    }
  });
  await Promise.all(workers);
  return results;
}

// Extraction forensique d'un chunk → digest JSON structuré (zéro perte).
async function extractChunkDigest(chunk, idx, total) {
  const sys = `Tu es un EXTRACTEUR FORENSIQUE de niveau God-Tier. Mission : extraire TOUT ce qui a la moindre valeur informative dans le passage, sans RIEN inventer.

RÈGLES NON NÉGOCIABLES :
- Aucune invention, aucune connaissance extérieure : tu n'extrais que ce qui est dans le PASSAGE.
- Conserve les termes EXACTS : vocabulaire, noms propres, formules, chiffres, dates, citations.
- Sois EXHAUSTIF : si le passage contient 30 concepts, liste-les tous. Mieux vaut 50 items courts qu'en oublier 3.
- Réponds UNIQUEMENT en JSON valide, sans markdown autour, sans texte avant/après.

SCHÉMA JSON (champs obligatoires, tableau vide si rien) :
{
 "sectionTitle": "titre court synthétisant ce passage",
 "tldr": "1 à 3 phrases résumant l'essentiel du passage",
 "keyConcepts": ["concept 1 (avec qualificatifs précis)", "concept 2", "..."],
 "definitions": [{"term":"X","def":"définition telle qu'elle apparaît dans le passage"}],
 "formulas":    [{"name":"optionnel","expr":"formule ou équation telle quelle"}],
 "numbers":     ["chiffres importants AVEC contexte (ex: '42% des cas en 2023')"],
 "dates":       ["dates ou périodes clés AVEC contexte"],
 "entities":    ["personnes, organisations, lieux, produits, technos cités"],
 "procedures":  [{"name":"...","steps":["étape 1","étape 2","..."]}],
 "examples":    ["exemples ou cas concrets cités tels quels"],
 "quotes":      ["phrases verbatim importantes du passage"],
 "warnings":    ["pièges, exceptions, contre-indications, erreurs courantes"],
 "openQuestions": ["questions ouvertes / points à creuser soulevés par le texte"]
}`;
  const user = `PASSAGE ${idx + 1}/${total} :\n\n${chunk}`;
  const raw = await callGroq(sys, user, 4000, true);
  try { return safeJsonParse(raw); } catch { return null; }
}

// Fusion + déduplication des digests en un seul digest global.
function mergeDigests(digests) {
  const out = {
    sections: [],
    keyConcepts: [], definitions: [], formulas: [], numbers: [],
    dates: [], entities: [], procedures: [], examples: [],
    quotes: [], warnings: [], openQuestions: [],
  };
  const seen = Object.fromEntries(Object.keys(out).map(k => [k, new Set()]));
  const norm = s => (typeof s === "string" ? s : "").trim().toLowerCase();
  const pushUniq = (bucket, value, keyFn) => {
    const k = norm(keyFn(value));
    if (!k || seen[bucket].has(k)) return;
    seen[bucket].add(k);
    out[bucket].push(value);
  };
  digests.forEach((d, i) => {
    if (!d || typeof d !== "object") return;
    out.sections.push({
      title: d.sectionTitle || `Section ${i + 1}`,
      tldr: d.tldr || "",
      keyConcepts: Array.isArray(d.keyConcepts) ? d.keyConcepts : [],
    });
    (d.keyConcepts || []).forEach(v => pushUniq("keyConcepts", v, x => x));
    (d.definitions || []).forEach(v => pushUniq("definitions", v, x => x?.term || ""));
    (d.formulas || []).forEach(v => pushUniq("formulas", v, x => x?.expr || x?.name || ""));
    (d.numbers || []).forEach(v => pushUniq("numbers", v, x => x));
    (d.dates || []).forEach(v => pushUniq("dates", v, x => x));
    (d.entities || []).forEach(v => pushUniq("entities", v, x => x));
    (d.procedures || []).forEach(v => pushUniq("procedures", v, x => x?.name || JSON.stringify(x?.steps || [])));
    (d.examples || []).forEach(v => pushUniq("examples", v, x => x));
    (d.quotes || []).forEach(v => pushUniq("quotes", v, x => x));
    (d.warnings || []).forEach(v => pushUniq("warnings", v, x => x));
    (d.openQuestions || []).forEach(v => pushUniq("openQuestions", v, x => x));
  });
  return out;
}

// Synthèse finale Markdown selon le mode (DEEP / TLDR / ACTION / ELI5 / STUDY).
async function synthesizeFinalSummary(merged, mode, sourceText) {
  const digestJson = JSON.stringify(merged).slice(0, 28000);
  const sourceTaste = sourceText.slice(0, 6000);

  const briefs = {
    DEEP: `MODE EXHAUSTIF — produis le résumé LE PLUS COMPLET possible. Si le digest contient 40 définitions, le résumé doit toutes les mentionner. Le rendu peut (doit !) être très long.

Structure OBLIGATOIRE en markdown :
# 📌 Synthèse complète du document
## ⚡ TL;DR
3 à 5 phrases de synthèse globale.
## 🎯 Idées-forces
5 à 12 puces. Mets en **gras** les mots-clés EXACTS du document.
## 📚 Plan détaillé
Liste numérotée reprenant les titres exacts des sections du digest.
## 🧠 Résumé exhaustif structuré
Pour CHAQUE section du digest, un sous-titre \`### N. Titre\` puis 1 paragraphe dense + sous-listes couvrant TOUS ses keyConcepts/définitions/exemples. Aucune notion oubliée.
## 🔑 Glossaire
Tableau \`| Terme | Définition |\` listant TOUTES les définitions du digest.
## 📊 Données chiffrées
Toutes les entrées de "numbers" en puces avec contexte.
## 📐 Formules & équations
Bloc code ou table reprenant les formulas (omettre la rubrique seulement si tableau vide).
## 📅 Chronologie
Liste \`AAAA — événement\` triée chronologiquement.
## 💬 Citations notables
Bloc \`>\` pour chaque quote du digest, telle quelle.
## ⚠️ Pièges & exceptions
Toutes les warnings.
## ❓ FAQ générée
6 à 10 paires Q/R utiles à la révision (réponses tirées EXCLUSIVEMENT du document).
## ✅ Takeaways actionnables
6 à 12 puces : ce qu'il faut RETENIR ou FAIRE.
## 🗺️ Mind-map
Arborescence en listes imbriquées (thèmes → sous-thèmes → détails).`,
    TLDR: `MODE TL;DR — synthèse exécutive (300-450 mots) :
## ⚡ TL;DR
3 à 5 phrases.
## 🎯 Idées-forces
5-7 puces, **gras** sur les mots-clés exacts.
## ✅ À retenir
3-5 puces actionnables.`,
    ACTION: `MODE ACTIONS — orienté pratique :
## 🚀 Mission
1 phrase de contexte.
## ✅ Plan d'action
Liste numérotée de verbes à l'infinitif, regroupés par thème.
## ⚠️ Pièges à éviter
Toutes les warnings.
## 🧰 Boîte à outils
Outils, méthodes, formules, ressources nommés.
## 📊 Métriques à suivre
Chiffres-clés, KPIs, dates butoirs.`,
    ELI5: `MODE ELI5 — vulgarise comme à un enfant de 10 ans (analogies OK, faits hors digest INTERDITS) :
## 🤓 L'idée en 1 phrase
## 🌍 Imagine que…
Une analogie filée.
## 🧱 Les briques principales
Concepts clés réécrits simplement, en gardant le terme exact entre parenthèses.
## 🪄 Pourquoi c'est cool
2-3 phrases.
## 🧪 Petit récap
3-5 puces.`,
    STUDY: `MODE RÉVISION — orienté étudiant qui prépare un examen :
## 🎯 Objectifs d'apprentissage
5-8 puces "À la fin tu sauras…"
## 🧠 Concepts clés
Tableau \`| Concept | Définition courte | Pourquoi c'est important |\`.
## 🔁 Cartes mentales (Q/R)
8-15 paires Q/R prêtes à devenir des flashcards.
## 🧪 Exemples & cas
Tous les "examples" du digest, expliqués brièvement.
## ⚠️ Pièges classiques
Toutes les warnings.
## 🏁 Mini quiz auto-correctif
5 questions + réponses (cachées sous \`<details>\`).`,
  };

  const sys = `Tu es un rédacteur scientifique GOD-TIER, fidèle à la source.

RÈGLES NON NÉGOCIABLES :
1. Tu utilises EXCLUSIVEMENT les informations du DIGEST_JSON ci-dessous (et l'EXTRAIT_SOURCE pour le ton/le vocabulaire). Aucune invention, aucune connaissance extérieure.
2. Conserve termes, noms propres, chiffres, formules, dates EXACTEMENT comme dans le digest.
3. Markdown propre : hiérarchie de titres respectée, listes à puces, tableaux, blocs code quand pertinent.
4. Mets en **gras** les mots-clés exacts (l'app utilise un mode "Rayon-X" sur les **gras**).
5. Si une rubrique demandée est vide dans le digest, conserve la rubrique mais écris _(non couvert dans le document)_.
6. JAMAIS de "Voici le résumé :" ni de blabla d'intro/outro hors structure.

${briefs[mode] || briefs.DEEP}`;

  const user = `EXTRAIT_SOURCE (échantillon, pour préserver ton et vocabulaire) :
"""
${sourceTaste}
"""

DIGEST_JSON (structure exhaustive de référence — utilise TOUT) :
${digestJson}`;

  // DEEP / STUDY : on privilégie un modèle "pedagogy" (mistral-large) avec gros budget tokens.
  if (mode === "DEEP" || mode === "STUDY") {
    try {
      const { text } = await aiCall({
        task: "pedagogy",
        system: sys,
        user,
        maxTokens: 8192,
        temperature: 0.2,
      });
      if (text && text.trim().length > 200) return text.trim();
    } catch { /* fallback */ }
  }
  const raw = await callGroq(sys, user, mode === "DEEP" || mode === "STUDY" ? 8000 : 3500);
  return raw.trim();
}

// Audit de couverture : repère les éléments du digest qui n'apparaissent pas
// dans le résumé final (utile pour le mode DEEP / STUDY).
function buildCoverageReport(merged, summary) {
  const lower = (summary || "").toLowerCase();
  const missing = [];
  const probe = (term) => {
    if (!term) return null;
    const words = String(term).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4);
    return words.slice(0, 2).join(" ").toLowerCase() || null;
  };
  const check = (kind, items, pick) => {
    (items || []).forEach(it => {
      const term = pick(it);
      const p = probe(term);
      if (p && !lower.includes(p)) missing.push({ kind, item: term, raw: it });
    });
  };
  check("définition", merged.definitions, x => x?.term);
  check("formule", merged.formulas, x => x?.expr || x?.name);
  check("chiffre", merged.numbers, x => x);
  check("date", merged.dates, x => x);
  check("entité", merged.entities, x => x);
  check("procédure", merged.procedures, x => x?.name);
  check("citation", merged.quotes, x => x);
  return missing.slice(0, 50);
}

async function appendCoverageRescue(summary, missing) {
  if (!missing.length) return summary;
  const sys = `Tu es un complétiste forensique. On te donne un résumé Markdown et une liste d'éléments du digest source ABSENTS de ce résumé.

Mission : produire UNIQUEMENT une section additionnelle "## 🛟 Compléments — à ne pas oublier" qui :
- liste TOUS les éléments manquants ci-dessous,
- regroupés par type (Définitions / Formules / Chiffres / Dates / Entités / Procédures / Citations),
- en utilisant les termes EXACTS, sans inventer,
- formatage : tableau pour Définitions, blocs code pour Formules, listes à puces pour le reste.

Réponds en markdown brut, en commençant directement par "## 🛟 Compléments — à ne pas oublier".`;
  const user = `RÉSUMÉ ACTUEL (extrait de fin) :
"""
${summary.slice(-10000)}
"""

ÉLÉMENTS MANQUANTS (JSON) :
${JSON.stringify(missing).slice(0, 12000)}`;

  try {
    const raw = await callGroq(sys, user, 3500);
    if (raw && raw.trim()) return summary + "\n\n" + raw.trim();
  } catch { /* fallback déterministe ci-dessous */ }

  const groups = missing.reduce((acc, m) => { (acc[m.kind] ||= []).push(m); return acc; }, {});
  const md = ["## 🛟 Compléments — à ne pas oublier"];
  for (const [kind, list] of Object.entries(groups)) {
    md.push(`\n### ${kind.charAt(0).toUpperCase() + kind.slice(1)}s`);
    list.forEach(m => {
      const r = m.raw;
      if (typeof r === "string") md.push(`- ${r}`);
      else if (r?.term && r?.def) md.push(`- **${r.term}** — ${r.def}`);
      else if (r?.expr) md.push("- `" + r.expr + "`");
      else if (r?.name && Array.isArray(r?.steps)) md.push(`- **${r.name}** : ${r.steps.join(" → ")}`);
      else md.push(`- ${JSON.stringify(r)}`);
    });
  }
  return summary + "\n\n" + md.join("\n");
}





// ── 🎵 SoundwavePlayer — Lecteur audio avec visualisation ondes ───────────────
const SoundwavePlayer = ({ src, isPlaying, onPlay, onPause, onEnded, color = "#EA580C" }) => {
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => { });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [onEnded]);

  const BAR_COUNT = 5;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Bouton Play/Pause */}
      <button
        onClick={isPlaying ? onPause : onPlay}
        style={{
          width: 36, height: 36, borderRadius: "50%", border: "none",
          background: isPlaying ? color : `${color}22`,
          color: isPlaying ? "white" : color,
          cursor: "pointer", fontSize: 14, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
          boxShadow: isPlaying ? `0 0 14px ${color}60` : "none",
        }}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      {/* Barres ondes sonores */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, height: 28, "--glow-color": color }}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 4, borderRadius: 3,
              background: color,
              height: isPlaying ? "100%" : "30%",
              animation: isPlaying
                ? `soundwave-bar 0.6s ${i * 0.1}s infinite alternate ease-in-out`
                : "none",
              transition: "height 0.3s ease",
              opacity: isPlaying ? 1 : 0.4,
            }}
          />
        ))}
      </div>

      <audio ref={audioRef} src={src} preload="metadata" style={{ display: "none" }} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
// ── ModuleSelect : défini HORS de Lab pour éviter le démontage/remontage à chaque render ──
const ModuleSelect = ({ value, onChange, label = "Module cible", categories, theme }) => (
  <div
    style={{ marginBottom: 16 }}
    onMouseMove={e => e.stopPropagation()}
    onMouseEnter={e => e.stopPropagation()}
    onMouseLeave={e => e.stopPropagation()}
    onMouseDown={e => e.stopPropagation()}
  >
    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: theme.textMuted, marginBottom: 6 }}>
      {label}
    </label>
    <select
      value={value}
      onChange={e => { e.stopPropagation(); onChange(e.target.value); }}
      onMouseDown={e => e.stopPropagation()}
      onMouseMove={e => e.stopPropagation()}
      style={{
        width: "100%", padding: "10px 36px 10px 14px",
        background: theme.inputBg, border: `1.5px solid ${value ? "#4D6BFE" : theme.border}`,
        borderRadius: 12, color: theme.text, fontSize: 14, fontWeight: 600,
        cursor: "pointer",
        appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 14px center",
        outline: "none",
      }}
    >
      <option value="">— Choisir un module —</option>
      {(categories || []).map(cat => (
        <option key={cat.name} value={cat.name}>{cat.name}</option>
      ))}
      <option value="📚 Lab Import">📚 Lab Import</option>
    </select>
  </div>
);

// ─── Composant interne : réserve organisée en rayons (type BU) ──────────────
function ReserveList({ reserveCards, addFromReserve, setShowReservePanel, theme, activeColor }) {
  const [reserveSelected, setReserveSelected] = useState(new Set());
  const [openShelves, setOpenShelves] = useState({});

  const toggleReserveCard = (i) => {
    setReserveSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  // Regrouper par module (rayon), en conservant l'index global d'origine
  const shelves = useMemo(() => {
    const map = {};
    reserveCards.forEach((card, i) => {
      const key = card.sourceDoc || `[Module] ${card.module || "Sans module"}`;
      if (!map[key]) map[key] = [];
      map[key].push({ card, i });
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [reserveCards]);

  const toggleShelfOpen = (name) => setOpenShelves(prev => ({ ...prev, [name]: prev[name] === false ? true : false }));
  const isShelfOpen = (name) => openShelves[name] !== false; // ouvert par défaut

  const toggleShelfSelect = (items) => {
    const idxs = items.map(it => it.i);
    const allSelected = idxs.every(i => reserveSelected.has(i));
    setReserveSelected(prev => {
      const next = new Set(prev);
      idxs.forEach(i => { if (allSelected) next.delete(i); else next.add(i); });
      return next;
    });
  };

  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted }}>
          📚 {shelves.length} rayon{shelves.length > 1 ? "s" : ""} · {reserveCards.length} fiche{reserveCards.length > 1 ? "s" : ""} en réserve
        </span>
        {reserveSelected.size > 0 && (
          <button
            onClick={() => { addFromReserve(reserveSelected); setShowReservePanel(false); }}
            style={{
              marginLeft: "auto", padding: "8px 16px", background: "linear-gradient(135deg,#059669,#10B981)",
              color: "white", border: "none", borderRadius: 10,
              cursor: "pointer", fontWeight: 800, fontSize: 13,
            }}
          >
            🚀 Ajouter {reserveSelected.size} fiche{reserveSelected.size > 1 ? "s" : ""} à l'algo
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {shelves.map(([shelfName, items]) => {
          const selectedInShelf = items.filter(it => reserveSelected.has(it.i)).length;
          const open = isShelfOpen(shelfName);
          return (
            <div key={shelfName} style={{ border: `1px solid ${theme.border}`, borderRadius: 16, overflow: "hidden", background: theme.cardBg }}>
              {/* Étiquette du rayon */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: `${activeColor}10`, borderLeft: `4px solid ${activeColor}` }}>
                <button onClick={() => toggleShelfOpen(shelfName)} style={{ background: "none", border: "none", cursor: "pointer", color: theme.text, fontSize: 14, fontWeight: 900 }}>
                  {open ? "▾" : "▸"}
                </button>
                <span style={{ fontWeight: 900, color: theme.text, fontSize: 14, flex: 1 }}>
                  📦 {shelfName}
                  <span style={{ marginLeft: 8, fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>
                    {items.length} fiche{items.length > 1 ? "s" : ""}{selectedInShelf > 0 ? ` · ${selectedInShelf} sélectionnée${selectedInShelf > 1 ? "s" : ""}` : ""}
                  </span>
                </span>
                <button onClick={() => toggleShelfSelect(items)} style={{
                  padding: "6px 12px", background: theme.inputBg, color: theme.text,
                  border: `1px solid ${theme.border}`, borderRadius: 8, cursor: "pointer",
                  fontSize: 11, fontWeight: 700,
                }}>
                  {items.every(it => reserveSelected.has(it.i)) ? "Tout désélectionner" : "Tout le rayon"}
                </button>
              </div>

              {open && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
                  {items.map(({ card, i }) => (
                    <div
                      key={i}
                      onClick={() => toggleReserveCard(i)}
                      style={{
                        background: reserveSelected.has(i) ? `${activeColor}12` : theme.inputBg,
                        border: `1px solid ${reserveSelected.has(i) ? activeColor : theme.border}`,
                        borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
                          border: `2px solid ${reserveSelected.has(i) ? activeColor : theme.border}`,
                          background: reserveSelected.has(i) ? activeColor : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s",
                        }}>
                          {reserveSelected.has(i) && <span style={{ color: "white", fontSize: 11 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, color: theme.text, fontSize: 14, marginBottom: 4 }}>{card.front}</div>
                          <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
                            {(card.back || "").substring(0, 120)}{(card.back || "").length > 120 ? "..." : ""}
                          </div>
                          <div style={{ fontSize: 10, color: activeColor, marginTop: 6, fontWeight: 700 }}>
                            {card.source ? `${card.source} · ` : ""}Ajouté le {card.reservedAt ? new Date(card.reservedAt).toLocaleDateString("fr-FR") : "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {shelves.length === 0 && (
          <div style={{ textAlign: "center", color: theme.textMuted, fontSize: 13, padding: "40px 0" }}>
            Aucune fiche en réserve pour l'instant.
          </div>
        )}
      </div>
    </>
  );
}


export default function Lab({ theme, isDarkMode, categories = [], onAddCards, onShowToast }) {
  const [tab, setTab] = useState("pdf");

  // ── 🔍 GOD MODE : Rayon-X Sémantique ───────────────────────────────────────
  const [xrayKeyword, setXrayKeyword] = useState(null);

  // ─── PDF state ─────────────────────────────────────────────────────────────
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfDrag, setPdfDrag] = useState(false);
  const [pdfText, setPdfText] = useState("");
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfModule, setPdfModule] = useState("");
  const [pdfCards, setPdfCards] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const [pdfPreview, setPdfPreview] = useState(false);
  const pdfInputRef = useRef(null);

  // ─── Réserve : sélection et stockage ───────────────────────────────────────
  const [selectedCardIndexes, setSelectedCardIndexes] = useState(new Set()); // indices sélectionnés parmi pdfCards
  const [showReservePanel, setShowReservePanel] = useState(false);
  const [reserveCards, setReserveCards] = useState(() => {
    try { return JSON.parse(localStorage.getItem("lab_reserve_cards") || "[]"); } catch { return []; }
  });
  const [reserveTab, setReserveTab] = useState("preview"); // "preview" | "reserve"

  // Persist reserveCards
  useEffect(() => {
    try { localStorage.setItem("lab_reserve_cards", JSON.stringify(reserveCards)); } catch {}
  }, [reserveCards]);

  // ─── Résumé state (Extreme God Tier) ───────────────────────────────────────
  const [resFile, setResFile] = useState(null);
  const [resDrag, setResDrag] = useState(false);
  const [resText, setResText] = useState("");
  const [resPages, setResPages] = useState(0);
  const [resParsing, setResParsing] = useState(false);
  const [photoItems, setPhotoItems] = useState([]);
  const [photoModule, setPhotoModule] = useState("🧪 Lab Import");
  const [photoDrag, setPhotoDrag] = useState(false);
  const [pendingPhotoType, setPendingPhotoType] = useState("mixte");
  const [resSummary, setResSummary] = useState("");
  const [resLoading, setResLoading] = useState(false);
  const [resProgress, setResProgress] = useState("");
  const [resMode, setResMode] = useState("DEEP");
  const [resChatMessages, setResChatMessages] = useState([]);
  const [resChatInput, setResChatInput] = useState("");
  const [resChatLoading, setResChatLoading] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [estimatedReadTime, setEstimatedReadTime] = useState(0);

  // NOUVEAU: Historique des résumés
  const [resHistory, setResHistory] = useState(() => {
    try {
      const stored = localStorage.getItem("lab_resumes_history");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const resChatEndRef = useRef(null);
  const audioUtteranceRef = useRef(null);
  const resInputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem("lab_resumes_history", JSON.stringify(resHistory.slice(0, 15))); // Garder les 15 derniers max
    } catch (e) { console.error("History save error", e); }
  }, [resHistory]);

  useEffect(() => {
    if (resChatEndRef.current) {
      resChatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [resChatMessages]);

  // ─── Audio state ───────────────────────────────────────────────────────────
  const [audioCards, setAudioCards] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("lab_audio_cards") || "[]");
      // Migration : assure que les fiches existantes ont les champs SRS.
      return raw.map(c => ({
        level: 0, easeFactor: 2.5, interval: 1, repetitions: 0,
        nextReview: c.createdAt || localToday(), reviewHistory: [],
        ...c,
      }));
    } catch { return []; }
  });
  const [audioModule, setAudioModule] = useState("📚 Lab Import");
  const [audioDrag, setAudioDrag] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(null);
  const [expandedAudioModules, setExpandedAudioModules] = useState({});

  const toggleAudioModule = useCallback((moduleName) => {
    setExpandedAudioModules(prev => ({ ...prev, [moduleName]: !prev[moduleName] }));
  }, []);

  const reserveAudioCard = (card) => {
    setReserveCards(prev => [...prev, {
      ...card, front: card.label, back: "Fiche Audio", example: card.fileName,
      reservedAt: new Date().toISOString(), sourceDoc: card.sourceDoc || [Audio] , source: "🎙️ Audio"
    }]);
    setAudioCards(prev => prev.filter(c => c.id !== card.id));
    toast("🎙️ Audio mis en réserve !");
  };


  // Restore audio URLs on mount
  useEffect(() => {
    const restoreAudio = async () => {
      let changed = false;
      const updated = await Promise.all(audioCards.map(async c => {
        if (c.audioUrl && c.audioUrl.startsWith('blob:')) {
           // We can't easily check if blob is alive, but usually on reload they aren't.
           const newUrl = await getAudioObjectUrl(c.id);
           if (newUrl && newUrl !== c.audioUrl) {
             changed = true;
             return { ...c, audioUrl: newUrl };
           }
        }
        return c;
      }));
      if (changed) setAudioCards(updated);
    };
    if (audioCards.length > 0) restoreAudio();
  }, []);

  // ── État de la session de révision audio ──────────────────────────────────
  const [audioReviewOpen, setAudioReviewOpen] = useState(false);
  const [audioReviewQueue, setAudioReviewQueue] = useState([]);
  const [audioReviewIndex, setAudioReviewIndex] = useState(0);
  const [audioReviewRevealed, setAudioReviewRevealed] = useState(false);

  const audioInputRef = useRef(null);
  const audioRefs = useRef({});

  // ─── Photo state ───────────────────────────────────────────────────────────
  const [photoExpanded, setPhotoExpanded] = useState(null);
  const photoInputRef = useRef(null);

  const toast = useCallback((msg, type = "success") => {
    if (onShowToast) onShowToast(msg, type);
  }, [onShowToast]);

  // Auto-sélectionne le premier module dispo si les catégories se chargent après le montage
  useEffect(() => {
    if (categories.length > 0) {
      setPdfModule(prev => prev === "" ? categories[0].name : prev);
      setAudioModule(prev => prev === "📚 Lab Import" ? categories[0].name : prev);
      setPhotoModule(prev => prev === "📚 Lab Import" ? categories[0].name : prev);
    }
  }, [categories]);

  // Restaure les URLs d'objets pour les Blobs audio depuis IndexedDB au montage
  useEffect(() => {
    let active = true;
    const restoreUrls = async () => {
      const restored = await Promise.all(
        audioCards.map(async (c) => {
          if (c.audioUrl) return c;
          const blob = await getAudioBlob(c.id);
          if (blob && active) {
            return { ...c, audioUrl: URL.createObjectURL(blob) };
          }
          return c;
        })
      );
      if (active) {
        setAudioCards(restored);
      }
    };
    restoreUrls();
    return () => {
      active = false;
    };
  }, []);

  // Sauvegarde audio cards en localStorage (sans blobs)
  const saveAudioCards = (cards) => {
    const meta = cards.map(c => ({ ...c, audioUrl: null, blob: null }));
    try { localStorage.setItem("lab_audio_cards", JSON.stringify(meta)); } catch { }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PDF → FICHES : génère des fiches en plusieurs passes si le doc est long
  // ══════════════════════════════════════════════════════════════════════════
  const generatePdfCards = async () => {
    if (!pdfText.trim()) { toast("Charge d'abord un PDF.", "error"); return; }
    if (!pdfModule) { toast("Sélectionne un module cible.", "error"); return; }

    setPdfLoading(true);
    setPdfCards([]);
    setPdfProgress("Découpage du document...");

    // Découpage intelligent : coupure aux paragraphes + overlap de 400 chars pour ne rien rater
    const CHUNK = 8000;
    const OVERLAP = 400;
    const chunks = [];
    let pos = 0;
    while (pos < pdfText.length) {
      let end = Math.min(pos + CHUNK, pdfText.length);
      // Recule jusqu'à une fin de paragraphe pour ne pas couper un concept
      if (end < pdfText.length) {
        const boundary = pdfText.lastIndexOf("\n\n", end);
        if (boundary > pos + 2000) end = boundary;
      }
      const chunk = pdfText.slice(pos, end).trim();
      if (chunk.length > 50) chunks.push(chunk); // ignore les chunks quasi-vides
      // Avance en laissant un overlap pour ne pas rater les concepts à cheval
      pos = end - (end < pdfText.length ? OVERLAP : 0);
      if (pos <= 0 || (end === pdfText.length)) break; // sécurité anti-boucle infinie
    }

    const allCards = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      setPdfProgress(`Génération des fiches — partie ${ci + 1}/${chunks.length}...`);
      try {
        const raw = await callGroq(
          `Tu es un système de création de fiches de révision GOD-TIER.
${FIDELITY_RULE}
${RICH_CONTENT_RULE}
Génère UNE FICHE PAR CONCEPT présent dans ce passage — entre 6 et 20 fiches selon la densité du contenu. RÈGLE ABSOLUE : ne saute AUCUN concept, AUCUNE définition, AUCUNE formule, AUCUN exemple, AUCUNE procédure. Si le passage contient 15 notions distinctes, génère 15 fiches. Adapte le TYPE de fiche au contenu : un extrait de code → fiche "code" avec bloc fenced complet ; un tableau → fiche "table" avec table markdown ; une définition → "definition" ; un mélange → "mixed".
Réponds UNIQUEMENT en JSON valide, sans markdown autour :
{"cards":[{"front":"Question précise","back":"Réponse markdown (peut contenir \`\`\`code\`\`\` et tables |...|)","type":"qa|code|table|definition|concept|mixed","keyword":"mot-clé EXACT du texte","hint":"astuce courte optionnelle"}]}`,
          `MODULE CIBLE : ${pdfModule}\n\nPASSAGE DU DOCUMENT :\n${chunks[ci]}`,
          8000,
          true
        );
        const parsed = safeJsonParse(raw);
        const cards = (parsed.cards || []).map(c => ({
          ...c,
          category: pdfModule,
          keyword: c.keyword || "",
          type: c.type || "qa",
          source: "pdf",
        }));
        allCards.push(...cards);
      } catch (e) {
        // En cas d'erreur JSON (réponse tronquée), on réessaie en demandant moins de fiches
        try {
          const raw2 = await callGroq(
            `Tu es un système de création de fiches de révision.
${FIDELITY_RULE}
Génère entre 5 et 10 fiches sur les points CLÉS de ce passage. Réponds UNIQUEMENT en JSON valide :
{"cards":[{"front":"Question","back":"Réponse","type":"qa","keyword":"mot-clé","hint":""}]}`,
            `MODULE CIBLE : ${pdfModule}\n\nPASSAGE DU DOCUMENT :\n${chunks[ci].slice(0, 6000)}`,
            4000,
            true
          );
          const parsed2 = safeJsonParse(raw2);
          const cards2 = (parsed2.cards || []).map(c => ({
            ...c, category: pdfModule, keyword: c.keyword || "", type: c.type || "qa", source: "pdf",
          }));
          allCards.push(...cards2);
        } catch (e2) {
          toast(`Partie ${ci + 1} ignorée après 2 tentatives`, "error");
        }
      }
    }

    setPdfCards(allCards);
    setPdfProgress(`✅ ${allCards.length} fiches générées !`);
    setPdfLoading(false);
    setPdfPreview(true);
    toast(`📄 ${allCards.length} fiches prêtes — vérifie avant d'ajouter !`);
  };

  const addPdfCardsToDeck = (indexesToAdd = null) => {
    if (!pdfCards.length) return;
    const cardsToAdd = indexesToAdd !== null
      ? pdfCards.filter((_, i) => indexesToAdd.has(i))
      : (selectedCardIndexes.size > 0
          ? pdfCards.filter((_, i) => selectedCardIndexes.has(i))
          : pdfCards);
    if (!cardsToAdd.length) { toast("Aucune fiche sélectionnée.", "error"); return; }
    if (onAddCards) onAddCards(cardsToAdd.map(c => ({
      front: c.front, back: c.back, example: c.hint || "",
      category: c.category, type: c.type || "qa",
    })), { source: 'pdf' });
    toast(`🚀 ${cardsToAdd.length} fiches ajoutées au module "${pdfModule}" !`);
    // Retirer les ajoutées de pdfCards
    const addedSet = new Set(cardsToAdd.map(c => c.front));
    setPdfCards(prev => prev.filter(c => !addedSet.has(c.front)));
    setSelectedCardIndexes(new Set());
    if (pdfCards.length - cardsToAdd.length === 0) { setPdfPreview(false); setPdfProgress(""); }
  };

  const putInReserve = (indexesToReserve = null) => {
    if (!pdfCards.length) return;
    const toReserve = indexesToReserve !== null
      ? pdfCards.filter((_, i) => indexesToReserve.has(i))
      : (selectedCardIndexes.size > 0
          ? pdfCards.filter((_, i) => selectedCardIndexes.has(i))
          : []);
    if (!toReserve.length) { toast("Sélectionne des fiches à mettre en réserve.", "error"); return; }
    const reserveWithMeta = toReserve.map(c => ({ ...c, reservedAt: new Date().toISOString(), module: pdfModule, source: "📄 PDF" }));
    setReserveCards(prev => [...prev, ...reserveWithMeta]);
    // Retirer de pdfCards
    const reservedSet = new Set(toReserve.map(c => c.front));
    setPdfCards(prev => prev.filter(c => !reservedSet.has(c.front)));
    setSelectedCardIndexes(new Set());
    toast(`📦 ${toReserve.length} fiche${toReserve.length > 1 ? "s" : ""} mise${toReserve.length > 1 ? "s" : ""} en réserve`);
  };

  const addFromReserve = (indexes) => {
    const toAdd = reserveCards.filter((_, i) => indexes.has(i));
    if (!toAdd.length) return;
    if (onAddCards) onAddCards(toAdd.map(c => ({
      front: c.front, back: c.back, example: c.hint || c.example || "",
      category: c.module || pdfModule, type: c.type || "qa",
      audioId: c.audioId, imageUrl: c.imageUrl
    })), { source: 'reserve' });
    toast(`🚀 ${toAdd.length} fiche${toAdd.length > 1 ? "s" : ""} sorties de réserve et ajoutées !`);
    setReserveCards(prev => prev.filter((_, i) => !indexes.has(i)));
  };

  const toggleCardSelection = (i) => {
    setSelectedCardIndexes(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCardIndexes.size === pdfCards.length) {
      setSelectedCardIndexes(new Set());
    } else {
      setSelectedCardIndexes(new Set(pdfCards.map((_, i) => i)));
    }
  };

  const handlePdfUpload = async (file) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    // Accepte texte + tout fichier de code / examen (py, js, ts, java, c, cpp, cs,
    // go, rs, rb, php, swift, kt, sql, sh, yml, yaml, json, csv, html, css, xml,
    // md, ipynb, log, tex, r, scala, dart, lua, pl, ex, etc.)
    const CODE_EXT = /\.(txt|md|markdown|csv|tsv|log|tex|json|jsonl|ya?ml|toml|ini|env|html?|xml|svg|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|py|ipynb|java|kt|kts|c|h|cc|cpp|cxx|hpp|cs|go|rs|rb|php|swift|sql|sh|bash|zsh|ps1|bat|pl|pm|lua|r|scala|dart|ex|exs|erl|hs|clj|cljs|fs|fsx|m|mm|asm|s|gradle|make|mk|dockerfile|conf|gitignore|graphql|gql|proto|vue|svelte|astro)$/i;
    const isCode = CODE_EXT.test(file.name) || file.type.startsWith("text/");
    if (!isPdf && !isCode) { toast("Format non supporté (PDF, texte ou code uniquement).", "error"); return; }

    setPdfFile(file); setPdfParsing(true); setPdfText(""); setPdfCards([]); setPdfPreview(false); setPdfProgress("");
    try {
      if (isPdf) {
        const { text, pages } = await extractPdfText(file);
        setPdfText(text); setPdfPages(pages);
        toast(`✅ ${pages} pages · ${text.split(" ").length.toLocaleString()} mots extraits`);
      } else if (/\.ipynb$/i.test(file.name)) {
        // Notebook Jupyter : on extrait code + markdown en préservant les blocs
        const raw = await file.text();
        try {
          const nb = JSON.parse(raw);
          const parts = (nb.cells || []).map(cell => {
            const src = Array.isArray(cell.source) ? cell.source.join("") : (cell.source || "");
            if (cell.cell_type === "code") {
              const lang = nb.metadata?.kernelspec?.language || "python";
              return "```" + lang + "\n" + src + "\n```";
            }
            return src;
          });
          const text = parts.join("\n\n");
          setPdfText(text); setPdfPages(1);
          toast(`✅ Notebook (${nb.cells?.length || 0} cellules) chargé !`);
        } catch {
          setPdfText(raw); setPdfPages(1);
          toast("⚠️ Notebook illisible — chargé en brut.");
        }
      } else {
        // Fichier code / texte : on l'enveloppe dans un fence si c'est du code,
        // pour que l'IA voie clairement la structure et la préserve.
        const raw = await file.text();
        const isPlain = /\.(txt|md|markdown|log|tex|csv|tsv)$/i.test(file.name);
        const lang = (file.name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
        const text = isPlain ? raw : `Fichier source : ${file.name}\n\n\`\`\`${lang}\n${raw}\n\`\`\``;
        setPdfText(text); setPdfPages(1);
        toast(`✅ ${file.name} chargé (${raw.length.toLocaleString()} caractères) !`);
      }
    } catch (err) { toast("Erreur lecture : " + err.message, "error"); }
    setPdfParsing(false);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RÉSUMÉ EXTREME GOD TIER — Multimodes, Chat, Audio
  // ══════════════════════════════════════════════════════════════════════════
  const generateFullSummary = async (modeOverride) => {
    if (!resText.trim()) { toast("Charge d'abord un document.", "error"); return; }

    const targetMode = modeOverride || resMode;
    setResMode(targetMode);
    setResLoading(true);
    setResSummary("");
    setResChatMessages([]);
    if (isAudioPlaying) toggleAudioSummary();

    try {
      // 1) DÉCOUPAGE intelligent (paragraphes / headings respectés)
      const chunks = smartChunkForSummary(resText, 12000, 600);
      setResProgress(`📚 Découpage : ${chunks.length} section${chunks.length > 1 ? "s" : ""} détectée${chunks.length > 1 ? "s" : ""}`);

      // 2) MAP — extraction forensique structurée par chunk (3 en parallèle)
      let done = 0;
      const digests = await mapWithConcurrency(chunks, 3, async (c, idx, total) => {
        const d = await extractChunkDigest(c, idx, total);
        done++;
        setResProgress(`🔬 Extraction forensique ${done}/${total} — concepts · définitions · formules · chiffres…`);
        return d;
      });

      // 3) REDUCE — fusion + déduplication globale
      setResProgress("🧬 Fusion du digest global…");
      const merged = mergeDigests(digests);

      const stats = {
        sec: merged.sections.length, kc: merged.keyConcepts.length,
        defs: merged.definitions.length, nums: merged.numbers.length,
        dates: merged.dates.length, ents: merged.entities.length,
      };

      // 4) SYNTHÈSE finale selon le mode
      setResProgress(`✍️ Synthèse ${targetMode} (${stats.sec} sections · ${stats.kc} concepts · ${stats.defs} définitions)…`);
      let summary = await synthesizeFinalSummary(merged, targetMode, resText);

      // 5) AUDIT DE COUVERTURE — DEEP / STUDY (exhaustivité garantie)
      if (targetMode === "DEEP" || targetMode === "STUDY") {
        const missing = buildCoverageReport(merged, summary);
        if (missing.length > 0) {
          setResProgress(`🛟 Audit couverture — rattrapage de ${missing.length} élément${missing.length > 1 ? "s" : ""}…`);
          summary = await appendCoverageRescue(summary, missing);
        }
      }

      if (!summary || summary.trim().length < 50) {
        throw new Error("Le modèle n'a pas renvoyé de résumé exploitable.");
      }

      setResSummary(summary);
      setEstimatedReadTime(Math.ceil(summary.split(/\s+/).length / 200));

      // Sauvegarde historique (digest inclus pour pouvoir re-synthétiser un autre mode)
      const newEntry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        fileName: resFile?.name || "Texte brut",
        mode: targetMode,
        summary,
        digest: merged,
        sourceText: resText.substring(0, 15000),
      };
      setResHistory(prev => [newEntry, ...prev.filter(x => x.summary !== summary)]);

      setResProgress("✅ Résumé God-Tier prêt !");
      toast(`📝 Résumé exhaustif généré (${stats.kc} concepts · ${stats.defs} définitions) !`);
    } catch (e) {
      toast("Erreur résumé : " + (e?.message || e), "error");
      setResProgress("");
    } finally {
      setResLoading(false);
    }
  };

  const handleGenerateCardsFromSummary = async () => {
    if (!resSummary) return;
    setResLoading(true);
    setResProgress("Création des fiches...");
    try {
      const prompt = `Convertis ce résumé en une liste de flashcards (question/réponse).
Réponds UNIQUEMENT avec un tableau JSON valide (liste d'objets). Chaque objet doit avoir:
- "front": la question (texte clair et direct)
- "back": la réponse détaillée (au format markdown, avec listes ou gras si pertinent)
Ne mets AUCUN texte avant ou après le JSON. Ni balises markdown autour.
RÉSUMÉ SOURCE:
${resSummary.slice(0, 8000)}`;

      const raw = await callGroq(prompt, "JSON uniquement", 4000, true);
      let jsonStr = raw.trim();
      if (jsonStr.startsWith("\`\`\`json")) jsonStr = jsonStr.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
      if (jsonStr.startsWith("\`\`\`")) jsonStr = jsonStr.replace(/\`\`\`/g, "").trim();

      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cards = parsed.map(c => ({
          id: crypto.randomUUID(),
          front: c.front,
          back: c.back,
          level: 0,
          interval: 1,
          easeFactor: 2.5,
          deckId: "default",
          tags: ["résumé-ia"]
        }));
        if (onAddCards) {
          onAddCards(cards);
          toast(`✅ ${cards.length} fiches ajoutées au deck !`);
        } else {
          toast("MemoMaster non connecté, impossible d'ajouter.", "error");
        }
      } else {
        toast("Aucune fiche extraite.", "error");
      }
    } catch (e) {
      toast("Erreur fiches : " + e.message, "error");
    } finally {
      setResLoading(false);
      setResProgress("");
    }
  };

  const loadFromHistory = (entry) => {
    setResFile({ name: entry.fileName });
    setResText(entry.sourceText || "");
    setResMode(entry.mode || "DEEP");
    setResSummary(entry.summary);
    setEstimatedReadTime(Math.ceil(entry.summary.split(/\s+/).length / 200));
    setResChatMessages([]);
    if (isAudioPlaying) toggleAudioSummary();
    toast("📚 Ancien résumé chargé !");
  };

  const deleteFromHistory = (id, e) => {
    e.stopPropagation();
    setResHistory(prev => prev.filter(x => x.id !== id));
    toast("🗑️ Résumé supprimé de l'historique.");
  };

  const handleDocChat = async () => {
    if (!resChatInput.trim() || !resText) return;
    const userMsg = resChatInput.trim();
    setResChatInput("");
    setResChatMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setResChatLoading(true);

    try {
      // Historique court pour la mémoire
      const history = resChatMessages.slice(-4).map(m => `${m.role === "user" ? "Utilisateur" : "Assistant"}: ${m.text}`).join("\n");
      const prompt = `Tu es un assistant de lecture expert. Réponds à la question de l'utilisateur EN TE BASANT STRICTEMENT sur le document fourni ci-dessous. Si la réponse n'est pas dans le document, dis-le poliment. Sois concis et précis.
      
[DOCUMENT SOURCE]
${resText.slice(0, 15000)}... (tronqué si trop long)

[HISTORIQUE]
${history}`;

      const reply = await callGroq(prompt, userMsg, 1500);
      setResChatMessages(prev => [...prev, { role: "assistant", text: reply.trim() }]);
    } catch (e) {
      toast("Erreur Chat : " + e.message, "error");
    } finally {
      setResChatLoading(false);
    }
  };

  const toggleAudioSummary = () => {
    if (!("speechSynthesis" in window)) { toast("Audio non supporté sur ce navigateur.", "error"); return; }

    if (isAudioPlaying) {
      window.speechSynthesis.cancel();
      setIsAudioPlaying(false);
      return;
    }

    if (!resSummary) return;

    const cleanText = resSummary.replace(/[#*`_>-]/g, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "fr-FR";
    utterance.rate = 1.05;

    utterance.onend = () => setIsAudioPlaying(false);
    utterance.onerror = () => setIsAudioPlaying(false);

    audioUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsAudioPlaying(true);
    toast("🎧 Lecture audio démarrée");
  };

  const handleResUpload = async (file) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const CODE_EXT = /\.(txt|md|markdown|csv|tsv|log|tex|json|jsonl|ya?ml|toml|ini|env|html?|xml|svg|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|py|ipynb|java|kt|kts|c|h|cc|cpp|cxx|hpp|cs|go|rs|rb|php|swift|sql|sh|bash|zsh|ps1|bat|pl|pm|lua|r|scala|dart|ex|exs|erl|hs|clj|cljs|fs|fsx|m|mm|gradle|graphql|gql|proto|vue|svelte|astro)$/i;
    const isCode = CODE_EXT.test(file.name) || file.type.startsWith("text/");
    if (!isPdf && !isCode) { toast("Format non supporté (PDF, texte ou code).", "error"); return; }

    setResFile(file); setResParsing(true); setResText(""); setResSummary(""); setResProgress("");
    try {
      if (isPdf) {
        const { text, pages } = await extractPdfText(file);
        setResText(text); setResPages(pages);
        toast(`✅ ${pages} pages · ${text.split(" ").length.toLocaleString()} mots`);
      } else if (/\.ipynb$/i.test(file.name)) {
        const raw = await file.text();
        try {
          const nb = JSON.parse(raw);
          const parts = (nb.cells || []).map(cell => {
            const src = Array.isArray(cell.source) ? cell.source.join("") : (cell.source || "");
            if (cell.cell_type === "code") {
              const lang = nb.metadata?.kernelspec?.language || "python";
              return "```" + lang + "\n" + src + "\n```";
            }
            return src;
          });
          setResText(parts.join("\n\n")); setResPages(1);
          toast(`✅ Notebook chargé !`);
        } catch { setResText(raw); setResPages(1); toast("⚠️ Notebook illisible — chargé en brut."); }
      } else {
        const raw = await file.text();
        const isPlain = /\.(txt|md|markdown|log|tex|csv|tsv)$/i.test(file.name);
        const lang = (file.name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
        const text = isPlain ? raw : `Fichier source : ${file.name}\n\n\`\`\`${lang}\n${raw}\n\`\`\``;
        setResText(text); setResPages(1);
        toast(`✅ ${file.name} chargé !`);
      }
    } catch (err) { toast("Erreur : " + err.message, "error"); }
    setResParsing(false);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // AUDIO → FICHE : chaque audio devient une fiche audio, organisée par module
  // ══════════════════════════════════════════════════════════════════════════
  const handleAudioFiles = (files) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("audio/") || f.name.match(/\.(mp3|m4a|ogg|wav|webm|aac)$/i));
    if (!arr.length) { toast("Aucun fichier audio valide.", "error"); return; }
    if (!audioModule) { toast("Sélectionne d'abord un module.", "error"); return; }

    const todayStr = localToday();
    const newCards = arr.map((file, i) => ({
      id: `audio_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      label: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      module: audioModule,
      sourceDoc: `[Audio] ${file.name}`,
      audioUrl: URL.createObjectURL(file),
      createdAt: todayStr,
      // Cycle SRS — identique aux fiches texte
      level: 0,
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      nextReview: todayStr,
      reviewHistory: [],
    }));

    // Sauvegarde les Blobs dans IndexedDB
    newCards.forEach((card, idx) => {
      saveAudioBlob(card.id, arr[idx]);
    });

    setAudioCards(prev => {
      const updated = [...prev, ...newCards];
      saveAudioCards(updated);
      return updated;
    });

    // ── Ajout dans MemoMaster (vue review unifiée) ──────────────────────────
    // On crée une fiche de type "audio" pour chaque enregistrement.
    // Le champ "audioId" pointe vers la clé IndexedDB du blob audio.
    // MemoMaster récupère le blob via getAudioBlob(audioId) à l'affichage.
    if (onAddCards) {
      onAddCards(
        newCards.map(c => ({
          front: c.label,        // Nom du fichier = face recto de la fiche
          back: c.label,         // Idem (le contenu sera l'audio)
          example: c.fileName,   // Nom du fichier complet
          category: audioModule,
          type: "audio",
          audioId: c.id,         // Clé IndexedDB pour retrouver le blob
        })),
        { source: "audio" }
      );
    }

    toast(`🎵 ${newCards.length} fiche(s) audio ajoutée(s) au module "${audioModule}" ! Tu pourras les réviser dès aujourd'hui.`);
  };

  // ── Helpers SRS audio ─────────────────────────────────────────────────────
  const audioDueCards = useMemo(
    () => audioCards.filter(c => c.audioUrl && String(c.nextReview || "") <= String(localToday())),
    [audioCards]
  );

  const startAudioReview = () => {
    if (audioDueCards.length === 0) {
      toast("Aucune fiche audio à réviser pour le moment 🎉", "info");
      return;
    }
    // Mélanger légèrement la file pour éviter l'ordre alphabétique systématique
    const queue = [...audioDueCards].sort(() => Math.random() - 0.5);
    setAudioReviewQueue(queue);
    setAudioReviewIndex(0);
    setAudioReviewRevealed(false);
    setAudioReviewOpen(true);
  };

  const gradeCurrentAudio = (grade) => {
    const current = audioReviewQueue[audioReviewIndex];
    if (!current) return;
    setAudioCards(prev => {
      const updated = prev.map(c => c.id === current.id ? scheduleAudioReview(c, grade) : c);
      saveAudioCards(updated);
      return updated;
    });
    if (audioReviewIndex + 1 >= audioReviewQueue.length) {
      setAudioReviewOpen(false);
      setAudioReviewQueue([]);
      toast(`✅ Session audio terminée — ${audioReviewQueue.length} fiche(s) révisée(s) !`, "success");
    } else {
      setAudioReviewIndex(i => i + 1);
      setAudioReviewRevealed(false);
    }
  };

  const deleteAudioCard = (id) => {
    deleteAudioBlob(id);
    setAudioCards(prev => {
      const card = prev.find(c => c.id === id);
      if (card?.audioUrl) URL.revokeObjectURL(card.audioUrl);
      const updated = prev.filter(c => c.id !== id);
      saveAudioCards(updated);
      return updated;
    });
    if (audioPlaying === id) setAudioPlaying(null);
  };

  const groupedAudio = audioCards.reduce((acc, card) => {
    if (!acc[card.module]) acc[card.module] = [];
    acc[card.module].push(card);
    return acc;
  }, {});

  // ══════════════════════════════════════════════════════════════════════════
  // PHOTO → FICHE : Vision IA — détecte type + extrait texte + génère fiches
  // ══════════════════════════════════════════════════════════════════════════
  const handlePhotoFiles = async (files, mode = "mixte") => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!arr.length) { toast("Aucune image valide.", "error"); return; }
    if (!photoModule) { toast("Sélectionne d'abord un module.", "error"); return; }

    const newItems = [];
    for (const file of arr) {
      try {
        const { base64, dataUrl, mimeType } = await fileToBase64(file);
        newItems.push({
          id: `photo_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
          name: file.name, dataUrl, base64, mimeType,
          module: photoModule,
          sourceDoc: `[Photo] ${file.name}`,
          status: "idle", imageType: mode,
          extractedText: "", cards: [], summary: "", error: null,
        });
      } catch { toast(`Erreur lecture ${file.name}`, "error"); }
    }
    setPhotoItems(prev => [...prev, ...newItems]);
    toast(`📸 ${newItems.length} photo(s) chargée(s) — L'IA va analyser automatiquement...`);

    // Analyse automatique — délai entre chaque photo pour éviter les 429
    for (let i = 0; i < newItems.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 2000));
      await analyzePhoto(newItems[i], photoModule);
    }
  };

  const updatePhoto = (id, patch) => setPhotoItems(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  const analyzePhoto = async (photo, targetModule) => {
    updatePhoto(photo.id, { status: "loading" });
    try {
      // Étape 1 : Détection type + extraction texte
      const mode = photo.imageType;
      let promptOcr = `Tu es un expert OCR et pédagogique. Analyse cette image de cours.\nRéponds UNIQUEMENT en JSON (sans markdown) :\n{"imageType":"mixte","subject":"matière","extractedText":"TOUT le texte","summary":"résumé"}`;
      if (mode === "Tableau de cours") {
         promptOcr = `Tu es un expert OCR. Extrais TOUT le tableau de cette image sous forme de TABLEAU MARKDOWN STRICT (GFM).\nRéponds UNIQUEMENT en JSON (sans markdown) :\n{"imageType":"tableau","subject":"matière","extractedText":"| Col 1 |...\\n","summary":"résumé"}`;
      } else if (mode === "Notes manuscrites") {
         promptOcr = `Tu es un expert OCR pour déchiffrer l'écriture manuscrite. Extrais fidèlement le texte de ces notes.\nRéponds UNIQUEMENT en JSON (sans markdown) :\n{"imageType":"notes","subject":"matière","extractedText":"texte exact","summary":"résumé"}`;
      } else if (mode === "Formules & maths") {
         promptOcr = `Tu es un expert en mathématiques. Extrais toutes les formules de l'image en format LaTeX strict encadré par $$.\nRéponds UNIQUEMENT en JSON (sans markdown) :\n{"imageType":"formules","subject":"maths","extractedText":"texte avec $$formules$$","summary":"résumé"}`;
      } else if (mode === "Schémas & diagrammes") {
         promptOcr = `Tu es un expert OCR. Identifie chaque élément, label et relation de ce schéma.\nRéponds UNIQUEMENT en JSON (sans markdown) :\n{"imageType":"schema","subject":"matière","extractedText":"description de tous les éléments du schéma","summary":"résumé"}`;
      }
      
      const step1 = await callGeminiVision(promptOcr, "Analyse cette image.", photo.base64, photo.mimeType);
      const info = safeJsonParse(step1);

      // Étape 2 : génération texte-seul (pas de 2e appel vision → économise le quota Gemini)
      const extractedSnippet = (info.extractedText || "").slice(0, 4000).replace(/[\x00-\x1F\x7F]/g, " ");
      const cardPrompt = `Tu es un expert en mémorisation GOD-TIER.
${FIDELITY_RULE}
${RICH_CONTENT_RULE}
À partir de ce contenu de cours (type image: ${info.imageType}, matière: ${info.subject || "inconnue"}),
génère entre 4 et 8 fiches FIDÈLES au texte extrait. Si le contenu contient du CODE → fiche type "code" avec bloc fenced markdown intégral. Si TABLEAU → fiche type "table" avec table markdown GFM. Sinon "qa"/"definition"/"concept".
Réponds UNIQUEMENT en JSON valide (sans markdown autour) :
{"cards":[{"front":"Question précise","back":"Réponse markdown (peut contenir code fences et tables)","type":"qa|code|table|definition|concept|mixed","keyword":"mot-clé exact","hint":"astuce optionnelle"}]}`;

      let step2;
      try {
        step2 = await callGroq(cardPrompt, `Texte extrait de l'image :\n${extractedSnippet}`, 4096, true);
      } catch {
        // Repli vision uniquement si l'OCR était trop pauvre
        step2 = await callVisionAI(
          cardPrompt,
          `Texte partiel : "${extractedSnippet.slice(0, 800)}"`,
          photo.base64, photo.mimeType
        );
      }
      const cardsData = safeJsonParse(step2);

      const cards = (cardsData.cards || []).map(c => ({
        ...c,
        category: targetModule,
        image: photo.dataUrl,
        keyword: c.keyword || "",
        type: c.type || "qa",
        imageType: info.imageType,
      }));

      updatePhoto(photo.id, {
        status: "done", imageType: info.imageType,
        extractedText: info.extractedText || "",
        subject: info.subject || "",
        summary: info.summary || "",
        cards,
      });
      toast(`✅ ${cards.length} fiches générées depuis "${photo.name}"`);
    } catch (e) {
      updatePhoto(photo.id, { status: "error", error: e.message });
      toast(`Erreur photo "${photo.name}" : ${e.message}`, "error");
    }
  };

  const addPhotocardsToDeck = (photo) => {
    if (!photo.cards?.length) return;
    if (onAddCards) onAddCards(photo.cards.map(c => ({
      front: c.front, back: c.back, example: c.hint || "",
      category: c.category, imageUrl: c.image || null, type: c.type || "qa",
    })));
    toast(`🚀 ${photo.cards.length} fiches de "${photo.name}" ajoutées au module "${photo.module || photoModule}" !`);
  };

  const reserveAllPhotoCards = () => {
    const all = photoItems.filter(p => p.status === "done" && p.cards.length > 0).flatMap(p => 
      p.cards.map(c => ({
        front: c.front, back: c.back, example: c.hint || "",
        category: c.category, imageUrl: c.image || null, type: c.type || "qa",
        reservedAt: new Date().toISOString(), module: p.module, sourceDoc: p.sourceDoc || [Photo] , source: "📸 Photo"
      }))
    );
    if (!all.length) { toast("Aucune fiche à mettre en réserve.", "error"); return; }
    setReserveCards(prev => [...prev, ...all]);
    toast("📦  fiches photos mises en réserve !");
  };

  const addAllPhotoCards = () => {
    const all = photoItems.filter(p => p.status === "done" && p.cards.length > 0).flatMap(p => p.cards);
    if (!all.length) { toast("Aucune fiche à envoyer.", "error"); return; }
    if (onAddCards) onAddCards(all.map(c => ({
      front: c.front, back: c.back, example: c.hint || "",
      category: c.category, imageUrl: c.image || null, type: c.type || "qa",
    })));
    toast(`🚀 ${all.length} fiches photos ajoutées !`);
  };

  const addPhotoTelQuel = (photo) => {
    const category = photo.module || photoModule;
    if (onAddCards) {
      onAddCards([{
        front: photo.subject || photo.name.replace(/\.[^.]+$/, ""),
        back: photo.extractedText || "Image",
        category,
        imageUrl: photo.dataUrl,
        type: "concept",
      }]);
      toast(`🚀 Fiche "${photo.name}" ajoutée telle quelle au module "${category}" !`);
    }
  };

  const removePhoto = (id) => setPhotoItems(prev => prev.filter(p => p.id !== id));

  // MODULE SELECTOR — défini hors du composant, passé via props (voir ModuleSelect au-dessus de Lab)

  // Palette de couleurs pour les onglets
  const TABS = [
    { id: "pdf", icon: "📄", label: "PDF → Fiches", color: "#4D6BFE" },
    { id: "resume", icon: "📝", label: "Résumé Complet", color: "#3451D1" },
    {
      id: "audio", icon: "🎵", label: "Audio → Fiche", color: "#EA580C",
      badge: audioCards.length > 0 ? audioCards.length : null
    },
    {
      id: "photo", icon: "📸", label: "Photo → Fiche", color: "#059669",
      badge: photoItems.filter(p => p.status === "done").length > 0
        ? photoItems.filter(p => p.status === "done").length : null
    },
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU
  // ══════════════════════════════════════════════════════════════════════════

  // Mapping des couleurs d'aura selon l'onglet actif
  const tabColors = {
    pdf: "#4D6BFE",    // Bleu
    resume: "#3451D1", // Violet
    audio: "#EA580C",  // Orange
    photo: "#059669",  // Émeraude
  };
  const activeColor = tabColors[tab] || "#4D6BFE";

  return (
    <div style={{
      animation: "fadeUp 0.4s ease",
      background: isDarkMode
        ? `radial-gradient(circle at 50% -20%, ${activeColor}25 0%, transparent 80%), radial-gradient(circle at -20% 50%, rgba(77, 107, 254,0.15) 0%, transparent 60%), radial-gradient(circle at 120% 50%, rgba(77,107,254,0.15) 0%, transparent 60%)`
        : `radial-gradient(circle at 50% -20%, ${activeColor}15 0%, transparent 80%), radial-gradient(circle at -20% 50%, rgba(77, 107, 254,0.05) 0%, transparent 60%), radial-gradient(circle at 120% 50%, rgba(77,107,254,0.05) 0%, transparent 60%)`,
      transition: "background 0.6s ease-in-out",
      position: "relative",
    }}>
      <style>{`
          @media (max-width: 768px) {
            .lab-split-screen { flex-direction: column !important; }
            .lab-sticky-panel { position: relative !important; top: 0 !important; width: 100% !important; margin-bottom: 20px; }
            .lab-card-mobile { padding: 16px !important; }
          }
        `}</style>
      <style>{`
        @keyframes vortex-spin { 100% { transform: rotate(360deg); } }
        @keyframes vortex-pulse { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.1); opacity: 1; } }
        @keyframes particle-suck {
          0% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translate(0, 0) scale(0.1); opacity: 0; }
        }
        @keyframes matrix-pan { 0% { background-position: 0px 0px; } 100% { background-position: 20px 20px; } }
        @keyframes ai-pulse { 0% { transform: scale(0.8); opacity: 0.5; } 100% { transform: scale(1.2); opacity: 1; } }
        @keyframes blink-cursor { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes soundwave-bar { 0% { transform: scaleY(0.2); opacity: 0.5; } 100% { transform: scaleY(1); opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      {/* En-tête */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, margin: 0 }}>🧪 Laboratoire</h1>
        <p style={{ color: theme.textMuted, fontSize: 14, margin: "4px 0 0" }}>
          PDF · Résumé complet · Fiches Audio · Fiches Photo — tout s'organise dans tes modules
        </p>
      </div>

      {/* Onglets */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 20px", borderRadius: 14, position: "relative",
            background: tab === t.id
              ? `linear-gradient(135deg, ${t.color}, ${t.color}cc)`
              : theme.cardBg,
            color: tab === t.id ? "white" : theme.textMuted,
            border: `1.5px solid ${tab === t.id ? "transparent" : theme.border}`,
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            transition: "all 0.2s",
            boxShadow: tab === t.id ? `0 4px 16px ${t.color}44` : "none",
          }}>
            {t.icon} {t.label}
            {t.badge && (
              <span style={{
                position: "absolute", top: -6, right: -6,
                background: "#EF4444", color: "white",
                borderRadius: "50%", width: 20, height: 20,
                fontSize: 11, fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          📄 PDF → FICHES
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "pdf" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme.border}` }}>
            <VortexDropZone
              isDragging={pdfDrag}
              onDragOver={e => { e.preventDefault(); setPdfDrag(true); }}
              onDragLeave={() => setPdfDrag(false)}
              onDrop={e => { e.preventDefault(); setPdfDrag(false); if (!pdfParsing) handlePdfUpload(e.dataTransfer.files[0]); }}
              onClick={() => !pdfParsing && pdfInputRef.current?.click()}
              color={activeColor}
              icon={pdfParsing ? "⏳" : pdfText ? "✅" : "📄"}
              title={pdfParsing ? "Extraction en cours..." : pdfText ? `"${pdfFile?.name}" chargé` : "Charge ton cours PDF"}
              subtitle={pdfText ? <><strong style={{ color: activeColor, display: "block", marginBottom: 8 }}>{pdfPages} pages · {pdfText.split(" ").length.toLocaleString()} mots</strong><span style={{ fontSize: 12 }}>Clique ou glisse un autre fichier pour le modifier</span></> : "Glisse un PDF, texte, code ou examen ici (.pdf .py .js .ts .java .sql .ipynb .csv .json .md…). L'IA conserve le vocabulaire exact, le code dans des blocs et les tableaux."}
              theme={theme}
              disabled={pdfParsing}
            />
            <input ref={pdfInputRef} type="file" accept=".pdf,.txt,.md,.markdown,.csv,.tsv,.log,.tex,.json,.jsonl,.yaml,.yml,.toml,.ini,.env,.html,.htm,.xml,.svg,.css,.scss,.sass,.less,.js,.jsx,.mjs,.cjs,.ts,.tsx,.py,.ipynb,.java,.kt,.kts,.c,.h,.cc,.cpp,.cxx,.hpp,.cs,.go,.rs,.rb,.php,.swift,.sql,.sh,.bash,.zsh,.ps1,.bat,.pl,.pm,.lua,.r,.scala,.dart,.ex,.exs,.erl,.hs,.clj,.cljs,.fs,.fsx,.m,.mm,.gradle,.dockerfile,.graphql,.gql,.proto,.vue,.svelte,.astro" style={{ display: "none" }} onChange={e => handlePdfUpload(e.target.files[0])} disabled={pdfParsing} />
            {!pdfText && (
              <p style={{ color: theme.textMuted, fontSize: 12, marginTop: 16, textAlign: "center" }}>
                L'IA génère des fiches avec le vocabulaire EXACT de ton document — aucune reformulation
              </p>
            )}
          </HoloCard>

          {pdfText && (
            <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme.border}` }}>
              <ModuleSelect value={pdfModule} onChange={setPdfModule} label="Module cible pour les fiches" categories={categories} theme={theme} isDarkMode={isDarkMode} />

              <button
                onClick={generatePdfCards}
                disabled={pdfLoading || !pdfModule}
                style={{
                  width: "100%", padding: "14px 20px",
                  background: pdfLoading || !pdfModule
                    ? theme.inputBg
                    : "linear-gradient(135deg,#3451D1,#4D6BFE)",
                  color: pdfLoading || !pdfModule ? theme.textMuted : "white",
                  border: "none", borderRadius: 14, fontWeight: 800, fontSize: 15,
                  cursor: pdfLoading || !pdfModule ? "default" : "pointer",
                }}
              >
                {pdfLoading ? "🧠 Analyse neuronale en cours..." : "🃏 Générer les fiches"}
              </button>

              <NeuromorphicLoader text={pdfProgress} color={activeColor} theme={theme} isDone={pdfProgress.startsWith("✅")} />

              <div style={{
                marginTop: 14, padding: "12px 16px",
                background: "#FFFBEB", borderRadius: 12,
                border: "1px solid #FDE68A", fontSize: 12, color: "#92400E"
              }}>
                💡 <strong>Fidélité garantie</strong> — Si ton cours dit "envoyer de l'argent",
                la fiche dira exactement "envoyer de l'argent". Aucun terme n'est modifié.
              </div>
            </HoloCard>
          )}

          {/* Prévisualisation des fiches */}
          {pdfPreview && pdfCards.length > 0 && (
            <div className="lab-split-screen" style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* Panneau gauche : Source & Actions (Sticky) */}
              <div className="lab-sticky-panel" style={{ flex: "1 1 30%", minWidth: 280, position: "sticky", top: 20 }}>
                <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `2px solid ${activeColor}` }}>
                  <h3 style={{ color: theme.text, fontWeight: 900, margin: 0, fontSize: 18 }}>
                    📄 Document Source
                  </h3>
                  <div style={{ marginTop: 12, color: theme.textMuted, fontSize: 13, lineHeight: 1.5 }}>
                    <strong>{pdfFile?.name || "Document texte"}</strong><br />
                    {pdfPages} pages · {pdfText.split(" ").length.toLocaleString()} mots
                  </div>
                  {/* Panneau Rayon-X Dynamique */}
                  <div style={{ marginTop: 16, padding: "12px", background: theme.inputBg, borderRadius: 12, fontSize: 12, color: theme.text, maxHeight: 180, overflowY: "auto", border: `1px solid ${theme.border}`, transition: "all 0.3s ease" }}>
                    {(() => {
                      if (!xrayKeyword || !pdfText.toLowerCase().includes(xrayKeyword.toLowerCase())) {
                        return <em style={{ opacity: 0.7 }}>{pdfText.substring(0, 300)}...</em>;
                      }
                      // Mode Rayon-X Sémantique Activé
                      const idx = pdfText.toLowerCase().indexOf(xrayKeyword.toLowerCase());
                      const start = Math.max(0, idx - 120);
                      const end = Math.min(pdfText.length, idx + xrayKeyword.length + 120);
                      const before = pdfText.substring(start, idx);
                      const match = pdfText.substring(idx, idx + xrayKeyword.length);
                      const after = pdfText.substring(idx + xrayKeyword.length, end);
                      return (
                        <div style={{ animation: "fadeIn 0.3s ease" }}>
                          <div style={{ fontSize: 10, fontWeight: 900, color: activeColor, marginBottom: 8, letterSpacing: 1 }}>🔍 RAYON-X SÉMANTIQUE</div>
                          <em style={{ opacity: 0.7 }}>{start > 0 ? "..." : ""}{before}</em>
                          <mark style={{ background: `${activeColor}33`, color: activeColor, textShadow: `0 0 12px ${activeColor}`, fontWeight: 900, borderRadius: 4, padding: "2px 4px", boxShadow: `0 0 10px ${activeColor}40` }}>{match}</mark>
                          <em style={{ opacity: 0.7 }}>{after}{end < pdfText.length ? "..." : ""}</em>
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{ marginTop: 24, borderTop: `1px solid ${theme.border}`, paddingTop: 16 }}>
                    <h4 style={{ margin: "0 0 4px", color: theme.text, fontSize: 15 }}>🃏 {pdfCards.length} fiches extraites</h4>
                    <p style={{ color: theme.textMuted, fontSize: 13, margin: "0 0 4px" }}>Module : <strong style={{ color: activeColor }}>{pdfModule}</strong></p>

                    {/* Sélection rapide */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 14px" }}>
                      <button onClick={toggleSelectAll} style={{
                        flex: 1, padding: "7px 10px", background: theme.inputBg, color: theme.text,
                        border: `1px solid ${theme.border}`, borderRadius: 10, cursor: "pointer",
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {selectedCardIndexes.size === pdfCards.length ? "✅ Tout désélectionner" : "☑️ Tout sélectionner"}
                      </button>
                      {selectedCardIndexes.size > 0 && (
                        <span style={{ fontSize: 11, color: activeColor, fontWeight: 800, whiteSpace: "nowrap" }}>
                          {selectedCardIndexes.size}/{pdfCards.length}
                        </span>
                      )}
                    </div>

                    {/* Bouton Ajouter */}
                    <button
                      onClick={() => addPdfCardsToDeck()}
                      style={{
                        width: "100%", padding: "13px 20px", background: "linear-gradient(135deg,#059669,#10B981)",
                        color: "white", border: "none", borderRadius: 14,
                        fontWeight: 800, fontSize: 14, cursor: "pointer",
                        boxShadow: "0 8px 20px rgba(16,185,129,0.3)", transition: "all 0.2s",
                        marginBottom: 10,
                      }}
                    >
                      {selectedCardIndexes.size > 0
                        ? `🚀 Ajouter ${selectedCardIndexes.size} fiche${selectedCardIndexes.size > 1 ? "s" : ""} sélectionnée${selectedCardIndexes.size > 1 ? "s" : ""}`
                        : `🚀 Ajouter toutes (${pdfCards.length})`}
                    </button>

                    {/* Bouton Réserve */}
                    <button
                      onClick={() => putInReserve()}
                      style={{
                        width: "100%", padding: "12px 20px",
                        background: selectedCardIndexes.size > 0 ? "linear-gradient(135deg,#7c3aed,#8b5cf6)" : theme.inputBg,
                        color: selectedCardIndexes.size > 0 ? "white" : theme.textMuted,
                        border: `1px solid ${selectedCardIndexes.size > 0 ? "#7c3aed" : theme.border}`,
                        borderRadius: 14, fontWeight: 800, fontSize: 13, cursor: selectedCardIndexes.size > 0 ? "pointer" : "not-allowed",
                        opacity: selectedCardIndexes.size > 0 ? 1 : 0.5,
                        transition: "all 0.2s", marginBottom: 10,
                      }}
                    >
                      📦 Mettre en réserve ({selectedCardIndexes.size || 0})
                    </button>

                    {/* Bouton voir réserve */}
                    {reserveCards.length > 0 && (
                      <button onClick={() => setShowReservePanel(true)} style={{
                        width: "100%", padding: "10px 16px",
                        background: "rgba(124,58,237,0.1)", color: "#7c3aed",
                        border: "1px dashed #7c3aed", borderRadius: 12,
                        fontWeight: 700, fontSize: 13, cursor: "pointer",
                      }}>
                        🗄️ Voir la réserve ({reserveCards.length} fiche{reserveCards.length > 1 ? "s" : ""})
                      </button>
                    )}
                  </div>
                </HoloCard>
              </div>

              {/* Panneau droit : Cascade de fiches */}
              <div style={{ flex: "1 1 60%", minWidth: 320, display: "flex", flexDirection: "column", gap: 14 }}>
                {pdfCards.map((card, i) => (
                  <div
                    key={i}
                    onMouseEnter={() => setXrayKeyword(card.keyword || card.front)}
                    onMouseLeave={() => setXrayKeyword(null)}
                    style={{
                      background: theme.cardBg, borderRadius: 16,
                      border: `1px solid ${selectedCardIndexes.has(i) ? activeColor : theme.border}`,
                      overflow: "hidden",
                      animation: `fadeUp 0.5s ease forwards`,
                      animationDelay: `${i * 0.08}s`,
                      opacity: 0,
                      boxShadow: selectedCardIndexes.has(i) ? `0 4px 15px ${activeColor}30` : "0 4px 15px rgba(77,107,254,0.05)",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                    }}>
                    {/* Checkbox header */}
                    <div
                      onClick={() => toggleCardSelection(i)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                        background: selectedCardIndexes.has(i) ? `${activeColor}15` : "transparent",
                        cursor: "pointer", borderBottom: `1px solid ${theme.border}`,
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 5, border: `2px solid ${selectedCardIndexes.has(i) ? activeColor : theme.border}`,
                        background: selectedCardIndexes.has(i) ? activeColor : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        transition: "all 0.15s",
                      }}>
                        {selectedCardIndexes.has(i) && <span style={{ color: "white", fontSize: 11, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: selectedCardIndexes.has(i) ? activeColor : theme.textMuted }}>
                        Fiche #{i + 1} {selectedCardIndexes.has(i) ? "· Sélectionnée" : "· Cliquer pour sélectionner"}
                      </span>
                    </div>
                    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${theme.border}`, background: theme.inputBg }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: activeColor, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                        RECTO — Question
                      </div>
                      <div style={{ fontWeight: 800, color: theme.text, fontSize: 15, lineHeight: 1.5 }}>
                        {card.front}
                        {card.keyword && (
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: `${activeColor}15`, color: activeColor, marginLeft: 8, verticalAlign: "middle", border: `1px solid ${activeColor}40`, transition: "all 0.2s", filter: xrayKeyword ? "drop-shadow(0 0 4px currentColor)" : "none" }}>
                            🔑 {card.keyword}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: "14px 18px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#059669", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                        VERSO — Réponse
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <GodTierContent text={card.back} theme={theme} isDarkMode={isDarkMode} />
                      </div>
                      {card.hint && (
                        <div style={{ marginTop: 10, fontSize: 12, color: "#B45309", background: "#FFFBEB", borderRadius: 8, padding: "8px 12px", border: "1px solid #FDE68A" }}>
                          💡 {card.hint}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          📝 RÉSUMÉ EXTREME GOD TIER
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "resume" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Header & Modes Selector */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: theme.text, margin: 0 }}>Analyse Documentaire IA</h2>
              <p style={{ color: theme.textMuted, fontSize: 13, margin: "4px 0 0" }}>Sélectionne un mode d'analyse adapté à ton besoin de révision.</p>
            </div>
            {resText && (
              <div style={{ display: "flex", background: theme.cardBg, borderRadius: 16, padding: 6, border: `1px solid ${theme.border}` }}>
                {[
                  { id: "TLDR", icon: "⚡", label: "TL;DR" },
                  { id: "DEEP", icon: "🧠", label: "Exhaustif" },
                  { id: "STUDY", icon: "🎓", label: "Révision" },
                  { id: "ACTION", icon: "🎯", label: "Actions" },
                  { id: "ELI5", icon: "🤓", label: "ELI5" }
                ].map(m => (
                  <button key={m.id} onClick={() => setResMode(m.id)} style={{
                    padding: "8px 16px", borderRadius: 12, border: "none", cursor: "pointer",
                    background: resMode === m.id ? activeColor : "transparent",
                    color: resMode === m.id ? "white" : theme.textMuted,
                    fontWeight: 800, fontSize: 12, transition: "all 0.2s"
                  }}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme.border}` }}>
            <VortexDropZone
              isDragging={resDrag}
              onDragOver={e => { e.preventDefault(); setResDrag(true); }}
              onDragLeave={() => setResDrag(false)}
              onDrop={e => { e.preventDefault(); setResDrag(false); if (!resParsing) handleResUpload(e.dataTransfer.files[0]); }}
              onClick={() => !resParsing && resInputRef.current?.click()}
              color={activeColor}
              icon={resParsing ? "⏳" : resText ? "✅" : "📝"}
              title={resParsing ? "Extraction en cours..." : resText ? `"${resFile?.name}" chargé` : "Glisse un document pour l'analyser"}
              subtitle={resText ? <><strong style={{ color: activeColor, display: "block", marginBottom: 8 }}>{resPages} pages · {resText.split(" ").length.toLocaleString()} mots</strong><span style={{ fontSize: 12 }}>Clique ou glisse un autre fichier pour remplacer</span></> : "PDF, Texte, Code, Notebook..."}
              theme={theme}
              disabled={resParsing}
            />
            <input ref={resInputRef} type="file" accept=".pdf,.txt,.md,.csv,.json,.html,.xml,.js,.ts,.py,.java,.c,.cpp,.go,.rs,.php,.sql,.sh" style={{ display: "none" }} onChange={e => handleResUpload(e.target.files[0])} disabled={resParsing} />
          </HoloCard>

          {/* Bibliothèque de Résumés */}
          {!resSummary && resHistory.length > 0 && (
            <div style={{ marginTop: 8, animation: "fadeIn 0.5s ease" }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: theme.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                📚 Bibliothèque de Résumés
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {resHistory.map(entry => (
                  <div key={entry.id} onClick={() => loadFromHistory(entry)} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16, cursor: "pointer", transition: "all 0.2s", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <strong style={{ fontSize: 14, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "85%" }}>{entry.fileName}</strong>
                      <button onClick={(e) => deleteFromHistory(entry.id, e)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, opacity: 0.6 }}>❌</button>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted, display: "flex", justifyContent: "space-between" }}>
                      <span>{new Date(entry.date).toLocaleDateString()}</span>
                      <span style={{ background: `${activeColor}20`, color: activeColor, padding: "2px 8px", borderRadius: 8, fontWeight: 800 }}>{entry.mode}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resText && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -8 }}>
              <button
                onClick={() => generateFullSummary()}
                disabled={resLoading}
                style={{
                  padding: "14px 28px",
                  background: resLoading ? theme.inputBg : `linear-gradient(135deg, ${activeColor}, #4F46E5)`,
                  color: resLoading ? theme.textMuted : "white",
                  border: "none", borderRadius: 16, fontWeight: 800, fontSize: 15,
                  cursor: resLoading ? "default" : "pointer",
                  boxShadow: resLoading ? "none" : `0 8px 24px ${activeColor}40`,
                  display: "flex", alignItems: "center", gap: 10
                }}
              >
                {resLoading ? "🧠 Analyse God-Tier en cours..." : `✨ Générer l'analyse (${resMode})`}
              </button>
            </div>
          )}

          {resLoading && <NeuromorphicLoader text={resProgress} color={activeColor} theme={theme} isDone={resProgress.startsWith("✅")} />}

          {/* BENTO GRID: Source + Chat (Left) & Summary (Right) */}
          {resSummary && (
            <div className="lab-split-screen" style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", animation: "fadeUp 0.6s ease" }}>

              {/* PANNEAU GAUCHE : Outils & Contexte */}
              <div className="lab-sticky-panel" style={{ flex: "1 1 30%", minWidth: 300, position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 16 }}>

                {/* 1. Bloc Source & Actions */}
                <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>📄</span>
                      <h3 style={{ color: theme.text, fontWeight: 900, margin: 0, fontSize: 16 }}>Document</h3>
                    </div>
                    {estimatedReadTime > 0 && (
                      <span style={{ fontSize: 11, background: `${activeColor}15`, color: activeColor, padding: "4px 8px", borderRadius: 8, fontWeight: 800 }}>
                        ⏳ ~{estimatedReadTime} min
                      </span>
                    )}
                  </div>

                  <div style={{ padding: "12px", background: theme.inputBg, borderRadius: 12, fontSize: 12, color: theme.text, maxHeight: 120, overflowY: "auto", border: `1px solid ${theme.border}` }}>
                    {(() => {
                      if (!xrayKeyword || !resText.toLowerCase().includes(xrayKeyword.toLowerCase())) return <em style={{ opacity: 0.7 }}>{resText.substring(0, 200)}...</em>;
                      const idx = resText.toLowerCase().indexOf(xrayKeyword.toLowerCase());
                      const start = Math.max(0, idx - 80);
                      const end = Math.min(resText.length, idx + xrayKeyword.length + 80);
                      const before = resText.substring(start, idx);
                      const match = resText.substring(idx, idx + xrayKeyword.length);
                      const after = resText.substring(idx + xrayKeyword.length, end);
                      return (
                        <div style={{ animation: "fadeIn 0.3s ease" }}>
                          <div style={{ fontSize: 10, fontWeight: 900, color: activeColor, marginBottom: 8 }}>🔍 RAYON-X</div>
                          <em style={{ opacity: 0.7 }}>{start > 0 ? "..." : ""}{before}</em>
                          <mark style={{ background: `${activeColor}33`, color: activeColor, fontWeight: 900, borderRadius: 4, padding: "0 4px" }}>{match}</mark>
                          <em style={{ opacity: 0.7 }}>{after}{end < resText.length ? "..." : ""}</em>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions export & audio */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
                    <button onClick={toggleAudioSummary} style={{ padding: "10px", background: isAudioPlaying ? "#EF4444" : theme.inputBg, color: isAudioPlaying ? "white" : theme.text, border: `1px solid ${isAudioPlaying ? "#EF4444" : theme.border}`, borderRadius: 12, fontWeight: 800, fontSize: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all 0.2s" }}>
                      <span style={{ fontSize: 16 }}>{isAudioPlaying ? "⏹️" : "🎧"}</span>
                      {isAudioPlaying ? "Stop" : "Podcast"}
                    </button>
                    <button onClick={() => navigator.clipboard.writeText(resSummary).then(() => toast("✅ Copié !"))} style={{ padding: "10px", background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 12, fontWeight: 800, fontSize: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 16 }}>📋</span>
                      Copier
                    </button>
                  </div>
                  <button onClick={handleGenerateCardsFromSummary} disabled={resLoading} style={{ marginTop: 8, width: "100%", padding: "12px", background: "linear-gradient(135deg, #059669, #10B981)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: resLoading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
                    <span style={{ fontSize: 16 }}>✨</span>
                    Créer des fiches
                  </button>
                </HoloCard>

                {/* 2. Bloc Chat with Doc (God-Tier) */}
                <HoloCard className="lab-card-mobile" theme={theme} glowColor="#A855F7" style={{ background: theme.cardBg, borderRadius: 22, border: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ padding: "16px", borderBottom: `1px solid ${theme.border}`, background: "rgba(168, 85, 247, 0.05)" }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#A855F7", display: "flex", alignItems: "center", gap: 8 }}>
                      💬 Ask The Doc
                    </h3>
                  </div>

                  <div style={{ height: 280, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12, background: theme.inputBg }}>
                    {resChatMessages.length === 0 && (
                      <div style={{ textAlign: "center", color: theme.textMuted, fontSize: 12, marginTop: "auto", marginBottom: "auto" }}>
                        Pose une question pointue sur le document. L'IA te répondra en utilisant uniquement la source.
                      </div>
                    )}
                    {resChatMessages.map((msg, i) => (
                      <div key={i} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                        <div style={{ padding: "10px 14px", borderRadius: 16, borderBottomRightRadius: msg.role === "user" ? 4 : 16, borderBottomLeftRadius: msg.role === "assistant" ? 4 : 16, background: msg.role === "user" ? "#A855F7" : theme.cardBg, color: msg.role === "user" ? "white" : theme.text, border: msg.role === "assistant" ? `1px solid ${theme.border}` : "none", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {resChatLoading && (
                      <div style={{ alignSelf: "flex-start", background: theme.cardBg, padding: "10px 14px", borderRadius: 16, border: `1px solid ${theme.border}` }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <span style={{ width: 6, height: 6, background: "#A855F7", borderRadius: "50%", animation: "kg-pulse 1s infinite" }} />
                          <span style={{ width: 6, height: 6, background: "#A855F7", borderRadius: "50%", animation: "kg-pulse 1s infinite 0.2s" }} />
                          <span style={{ width: 6, height: 6, background: "#A855F7", borderRadius: "50%", animation: "kg-pulse 1s infinite 0.4s" }} />
                        </div>
                      </div>
                    )}
                    <div ref={resChatEndRef} />
                  </div>

                  <div style={{ padding: "12px", borderTop: `1px solid ${theme.border}`, background: theme.cardBg }}>
                    <input
                      type="text"
                      placeholder="Demande un détail précis..."
                      value={resChatInput}
                      onChange={e => setResChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleDocChat()}
                      disabled={resChatLoading}
                      style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 13, outline: "none" }}
                    />
                  </div>
                </HoloCard>

              </div>

              {/* PANNEAU DROIT : Contenu du Résumé */}
              <div style={{ flex: "1 1 60%", minWidth: 320 }}>
                <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} style={{ background: theme.cardBg, borderRadius: 24, padding: "36px 40px", border: `1px solid ${theme.border}`, boxShadow: `0 20px 40px rgba(0,0,0,0.1)` }}>
                  {/* Effet visuel Premium */}
                  <div style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200, background: `radial-gradient(circle at top right, ${activeColor}15, transparent 70%)`, pointerEvents: "none" }} />

                  <div style={{ position: "relative", zIndex: 1 }}>
                    <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.text, margin: "0 0 8px" }}>
                      Analyse {resMode === "TLDR" ? "Éclair (TL;DR)" : resMode === "DEEP" ? "Exhaustive" : resMode === "STUDY" ? "Révision (Étudiant)" : resMode === "ACTION" ? "Actionnable" : "Vulgarisée (ELI5)"}
                    </h1>
                    <div style={{ height: 4, width: 60, background: activeColor, borderRadius: 2, marginBottom: 32 }} />

                    <div style={{ lineHeight: 1.8, fontSize: 16, color: theme.text, whiteSpace: "pre-wrap" }}>
                      {resSummary.split("\n").map((line, i) => {
                        // Rayon-X helper
                        const renderBoldRayonX = (text) => {
                          const parts = text.split(/(\*\*.*?\*\*)/g);
                          return parts.map((p, j) => {
                            if (p.startsWith('**') && p.endsWith('**')) {
                              const kw = p.slice(2, -2);
                              const isHovered = xrayKeyword && kw.toLowerCase() === xrayKeyword.toLowerCase();
                              return (
                                <strong key={j} onMouseEnter={() => setXrayKeyword(kw)} onMouseLeave={() => setXrayKeyword(null)}
                                  style={{ cursor: "pointer", color: isHovered ? activeColor : theme.highlight, textShadow: isHovered ? `0 0 12px ${activeColor}` : "none", transition: "all 0.2s" }}>
                                  {kw}
                                </strong>
                              );
                            }
                            return p;
                          });
                        };

                        if (line.startsWith("### ")) return <h3 key={i} style={{ color: theme.text, fontWeight: 800, fontSize: 18, margin: "24px 0 8px" }}>{line.slice(4)}</h3>;
                        if (line.startsWith("## ")) return <h2 key={i} style={{ color: activeColor, fontWeight: 900, fontSize: 22, margin: "32px 0 12px", borderBottom: `1px solid ${theme.border}`, paddingBottom: 8 }}>{line.slice(3)}</h2>;
                        if (line.startsWith("# ")) return <h1 key={i} style={{ color: activeColor, fontWeight: 900, fontSize: 26, margin: "36px 0 16px" }}>{line.slice(2)}</h1>;
                        if (line.startsWith("- ") || line.startsWith("• ")) return <div key={i} style={{ paddingLeft: 20, position: "relative", marginBottom: 8, background: theme.inputBg, padding: "12px 16px 12px 32px", borderRadius: 12, border: `1px solid ${theme.border}` }}><span style={{ position: "absolute", left: 14, color: activeColor, fontWeight: 900 }}>•</span>{renderBoldRayonX(line.slice(2))}</div>;
                        if (line === "---") return <hr key={i} style={{ border: "none", borderTop: `2px dashed ${theme.border}`, margin: "32px 0" }} />;
                        if (!line.trim()) return <div key={i} style={{ height: 16 }} />;
                        return <p key={i} style={{ margin: "0 0 12px", fontSize: 16 }}>{renderBoldRayonX(line)}</p>;
                      })}
                    </div>
                  </div>
                </HoloCard>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          🎵 AUDIO → FICHE
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "audio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Barre de révision audio — visible dès qu'il y a au moins une fiche due */}
          {audioCards.length > 0 && (
            <HoloCard className="lab-card-mobile" theme={theme} glowColor="#EA580C" style={{
              background: audioDueCards.length > 0 ? (theme.cardBg) : theme.cardBg,
              borderRadius: 18, padding: "14px 18px",
              border: `1px solid ${audioDueCards.length > 0 ? "#FED7AA" : theme.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🎧</span>
                <div>
                  <div style={{ fontWeight: 800, color: theme.text, fontSize: 14 }}>
                    Révision audio
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                    {audioDueCards.length > 0
                      ? `${audioDueCards.length} fiche${audioDueCards.length > 1 ? "s" : ""} audio à réviser aujourd'hui`
                      : "Aucune fiche audio à réviser pour le moment 🎉"}
                  </div>
                </div>
              </div>
              <button
                onClick={startAudioReview}
                disabled={audioDueCards.length === 0}
                style={{
                  padding: "10px 18px",
                  background: audioDueCards.length > 0 ? "linear-gradient(135deg, #EA580C, #DC2626)" : theme.inputBg,
                  color: audioDueCards.length > 0 ? "white" : theme.textMuted,
                  border: "none", borderRadius: 12, fontWeight: 800, fontSize: 13,
                  cursor: audioDueCards.length > 0 ? "pointer" : "not-allowed",
                  boxShadow: audioDueCards.length > 0 ? "0 6px 16px rgba(234,88,12,0.25)" : "none"
                }}
              >
                🚀 Réviser maintenant
              </button>
            </HoloCard>
          )}

          {/* Zone upload */}
          <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme.border}` }}>
            <h3 style={{ color: theme.text, fontWeight: 800, margin: "0 0 16px", fontSize: 16 }}>
              🎵 Ajouter des fiches audio
            </h3>
            <ModuleSelect value={audioModule} onChange={setAudioModule} label="Module pour ces fiches audio" categories={categories} theme={theme} isDarkMode={isDarkMode} />


            <VortexDropZone
              isDragging={audioDrag}
              onDragOver={e => { e.preventDefault(); setAudioDrag(true); }}
              onDragLeave={() => setAudioDrag(false)}
              onDrop={e => { e.preventDefault(); setAudioDrag(false); handleAudioFiles(e.dataTransfer.files); }}
              onClick={() => audioModule ? audioInputRef.current?.click() : toast("Sélectionne d'abord un module.", "error")}
              color={activeColor}
              icon="🎙️"
              title="Glisse tes enregistrements ici"
              subtitle={<>MP3 · M4A · WAV · OGG · WebM · AAC<br /><span style={{ fontSize: 12, marginTop: 4, display: "block" }}>Chaque fichier devient une fiche audio dans le module sélectionné</span></>}
              theme={theme}
            />
            <input ref={audioInputRef} type="file" accept="audio/*" multiple style={{ display: "none" }} onChange={e => handleAudioFiles(e.target.files)} />

            <div style={{
              marginTop: 14, padding: "12px 16px",
              background: "#FFF7ED", borderRadius: 12,
              border: "1px solid #FED7AA", fontSize: 12, color: "#92400E"
            }}>
              🎵 <strong>Fiche audio pure</strong> — Aucune transcription. L'audio EST la fiche. Tu écoutes, tu mémorises.
            </div>
          </HoloCard>

          {/* Fiches audio organisées par module */}
          {audioCards.length === 0 ? (
            <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} style={{
              background: theme.cardBg, borderRadius: 20, padding: "40px 24px",
              textAlign: "center", border: `1px solid ${theme.border}`
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎧</div>
              <div style={{ fontWeight: 800, color: theme.text, fontSize: 16, marginBottom: 8 }}>
                Aucune fiche audio pour l'instant
              </div>
              <div style={{ color: theme.textMuted, fontSize: 14 }}>
                Charge un enregistrement de cours pour créer ta première fiche audio.
              </div>
            </HoloCard>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {Object.entries(groupedAudio).map(([module, cards], idx) => {
                const isExpanded = expandedAudioModules[module] !== undefined ? expandedAudioModules[module] : idx === 0;
                
                return (
                  <div key={module} style={{
                    background: theme.cardBg, borderRadius: 20, overflow: "hidden",
                    border: `1px solid ${isExpanded ? activeColor + "50" : theme.border}`,
                    transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                    boxShadow: isExpanded ? `0 10px 30px ${activeColor}15` : "none"
                  }}>
                    {/* En-tête du dossier (Accordéon) */}
                    <div 
                      onClick={() => toggleAudioModule(module)}
                      className="hov"
                      style={{ 
                        padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
                        cursor: "pointer", background: isExpanded ? `${activeColor}08` : "transparent",
                        transition: "background 0.3s"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{
                          width: 46, height: 46, borderRadius: 14, background: isExpanded ? activeColor : theme.inputBg,
                          color: isExpanded ? "#FFF" : activeColor, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 22, transition: "all 0.3s", boxShadow: isExpanded ? `0 6px 16px ${activeColor}40` : "none",
                          border: isExpanded ? "none" : `1px solid ${theme.border}`
                        }}>
                          {isExpanded ? "📂" : "📁"}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: theme.text, fontSize: 17 }}>{module}</div>
                          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4, fontWeight: 600 }}>{cards.length} piste{cards.length > 1 ? "s" : ""} audio</div>
                        </div>
                      </div>
                      <div style={{ 
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", 
                        transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                        color: isExpanded ? activeColor : theme.textMuted, fontSize: 18,
                        background: theme.inputBg, width: 32, height: 32, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${theme.border}`
                      }}>
                        ▼
                      </div>
                    </div>

                    {/* Contenu du dossier (Liste des audios) */}
                    <div style={{
                      maxHeight: isExpanded ? 2000 : 0, opacity: isExpanded ? 1 : 0,
                      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                      background: isDarkMode ? "rgba(0,0,0,0.15)" : "#F8FAFF",
                      borderTop: isExpanded ? `1px solid ${theme.border}` : "none",
                    }}>
                      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                        {cards.map(card => (
                          <div key={card.id} style={{
                            background: theme.cardBg, borderRadius: 16,
                            padding: "16px", border: `1px solid ${theme.border}`,
                            display: "flex", alignItems: "center", gap: 16,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                            transition: "transform 0.2s",
                            transform: audioPlaying === card.id ? "scale(1.01)" : "scale(1)"
                          }}>
                            {/* Indicateur audio */}
                            <div style={{
                              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                              background: audioPlaying === card.id ? "#FFF7ED" : "#EEF2FF",
                              border: `2px solid ${audioPlaying === card.id ? "#EA580C" : "#4D6BFE"}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 20, boxShadow: audioPlaying === card.id ? "0 4px 12px rgba(234,88,12,0.3)" : "none"
                            }}>
                              {audioPlaying === card.id ? "🔊" : "🎵"}
                            </div>

                            {/* Infos */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontWeight: 800, color: theme.text, fontSize: 15,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                              }}>
                                {card.label}
                              </div>
                              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                                {card.createdAt} <span style={{ opacity: 0.5 }}>•</span> {card.fileName}
                              </div>
                            </div>

                            {/* Player */}
                            {card.audioUrl ? (
                              <div style={{ minWidth: 200, flexShrink: 0 }}>
                                <SoundwavePlayer
                                  src={card.audioUrl}
                                  isPlaying={audioPlaying === card.id}
                                  onPlay={() => setAudioPlaying(card.id)}
                                  onPause={() => setAudioPlaying(null)}
                                  onEnded={() => setAudioPlaying(null)}
                                  color="#EA580C"
                                />
                              </div>
                            ) : (
                              <div style={{
                                padding: "6px 12px", background: "#FFFBEB",
                                border: "1px solid #FDE68A", borderRadius: 8,
                                fontSize: 11, color: "#D97706", fontWeight: 700
                              }}>
                                ⚠️ Rechargement requis
                              </div>
                            )}

                            {/* Supprimer */}
                            <button
                              onClick={() => deleteAudioCard(card.id)}
                              className="hov"
                              title="Supprimer cet audio"
                              style={{
                                width: 36, height: 36, background: "#FEF2F2",
                                border: "1px solid #FECACA", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#EF4444", cursor: "pointer", fontSize: 16, flexShrink: 0
                              }}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Modale de révision audio ───────────────────────────────── */}
          {audioReviewOpen && audioReviewQueue[audioReviewIndex] && (() => {
            const card = audioReviewQueue[audioReviewIndex];
            const progress = ((audioReviewIndex + 1) / audioReviewQueue.length) * 100;
            return (
              <div
                onClick={(e) => { if (e.target === e.currentTarget) setAudioReviewOpen(false); }}
                style={{
                  position: "fixed", inset: 0, background: "rgba(8,12,28,0.78)",
                  backdropFilter: "blur(8px)", zIndex: 9999,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 20, animation: "fadeUp 0.25s ease"
                }}
              >
                <div style={{
                  background: theme.cardBg, borderRadius: 24, maxWidth: 560, width: "100%",
                  padding: 28, border: `1px solid ${theme.border}`,
                  boxShadow: "0 30px 80px rgba(0,0,0,0.4)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontWeight: 800, color: theme.text, fontSize: 14 }}>
                      🎧 Révision audio · <span style={{ color: "#EA580C" }}>{audioReviewIndex + 1}</span> / {audioReviewQueue.length}
                    </div>
                    <button
                      onClick={() => setAudioReviewOpen(false)}
                      style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 22, cursor: "pointer" }}
                    >✕</button>
                  </div>
                  <div style={{ height: 6, background: theme.inputBg, borderRadius: 4, overflow: "hidden", marginBottom: 20 }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #EA580C, #DC2626)", transition: "width 0.4s" }} />
                  </div>

                  <div style={{
                    background: theme.inputBg, borderRadius: 18, padding: 22,
                    border: `1px solid ${theme.border}`, marginBottom: 20
                  }}>
                    <div style={{ fontSize: 11, color: "#EA580C", fontWeight: 800, marginBottom: 6, letterSpacing: 1 }}>
                      MODULE · {card.module}
                    </div>
                    <div style={{ fontWeight: 800, color: theme.text, fontSize: 18, marginBottom: 14, lineHeight: 1.3 }}>
                      {card.label}
                    </div>
                    {card.audioUrl ? (
                      <audio
                        controls
                        autoPlay
                        src={card.audioUrl}
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <div style={{ color: "#D97706", fontSize: 13, fontWeight: 600 }}>
                        ⚠️ Le fichier audio n'est plus en mémoire. Recharge-le depuis l'écran d'import pour pouvoir le réviser.
                      </div>
                    )}
                    {!audioReviewRevealed ? (
                      <button
                        onClick={() => setAudioReviewRevealed(true)}
                        style={{
                          marginTop: 14, width: "100%", padding: "12px",
                          background: "#EEF2FF", color: "#3451D1", border: "1px solid #C7D2FE",
                          borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13
                        }}
                      >
                        👁 J'ai écouté — révéler les options
                      </button>
                    ) : (
                      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 14, fontStyle: "italic" }}>
                        Évalue ton souvenir de cet audio :
                      </div>
                    )}
                  </div>

                  {audioReviewRevealed && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <button
                        onClick={() => gradeCurrentAudio("again")}
                        style={{ padding: "12px", background: "#FEE2E2", color: "#DC2626", border: "1px solid #FCA5A5", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13 }}
                      >
                        🔁 À revoir
                      </button>
                      <button
                        onClick={() => gradeCurrentAudio("good")}
                        style={{ padding: "12px", background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #93C5FD", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13 }}
                      >
                        👍 Bien
                      </button>
                      <button
                        onClick={() => gradeCurrentAudio("easy")}
                        style={{ padding: "12px", background: "#DCFCE7", color: "#15803D", border: "1px solid #86EFAC", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13 }}
                      >
                        ✨ Facile
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}



      {/* ════════════════════════════════════════════════════════════════════
          📸 PHOTO → FICHE
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "photo" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Stats globales */}
          {photoItems.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { icon: "📸", label: "Photos", value: photoItems.length, color: activeColor },
                { icon: "✅", label: "Analysées", value: photoItems.filter(p => p.status === "done").length, color: "#059669" },
                { icon: "🃏", label: "Fiches", value: photoItems.reduce((a, p) => a + (p.cards?.length || 0), 0), color: "#4D6BFE" },
                { icon: "⏳", label: "En cours", value: photoItems.filter(p => p.status === "loading").length, color: "#D97706" },
              ].map(s => (
                <HoloCard theme={theme} glowColor={s.color} key={s.label} style={{
                  background: theme.cardBg, borderRadius: 16, padding: "14px 16px",
                  border: `1px solid ${theme.border}`, textAlign: "center"
                }}>
                  <div style={{ fontSize: 22 }}>{s.icon}</div>
                  <div style={{ fontWeight: 900, fontSize: 22, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>{s.label}</div>
                </HoloCard>
              ))}
            </div>
          )}

          {/* Zone upload */}
          <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} style={{ background: theme.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme.border}` }}>
            <ModuleSelect value={photoModule} onChange={setPhotoModule} label="Module cible pour les fiches" categories={categories} theme={theme} isDarkMode={isDarkMode} />

            <VortexDropZone
              isDragging={photoDrag}
              onDragOver={e => { e.preventDefault(); setPhotoDrag(true); }}
              onDragLeave={() => setPhotoDrag(false)}
              onDrop={e => { e.preventDefault(); setPhotoDrag(false); if (!photoModule) { toast("Sélectionne d'abord un module.", "error"); return; } handlePhotoFiles(e.dataTransfer.files); }}
              onClick={() => photoModule ? photoInputRef.current?.click() : toast("Sélectionne d'abord un module.", "error")}
              color={activeColor}
              icon={photoDrag ? "📥" : "📸"}
              title="Glisse tes photos de cours ici"
              subtitle={<>Notes manuscrites · Tableaux · Schémas · Formules<br /><span style={{ fontSize: 12, marginTop: 4, display: "block" }}>JPG · PNG · WEBP — L'IA lit le texte automatiquement</span></>}
              theme={theme}
            />
            <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handlePhotoFiles(e.target.files, pendingPhotoType)} />

            {photoItems.some(p => p.status === "done" && p.cards.length > 0) && (
              <button
                onClick={addAllPhotoCards}
                style={{
                  width: "100%", marginTop: 14, padding: "12px 20px",
                  background: "linear-gradient(135deg,#059669,#10B981)",
                  color: "white", border: "none", borderRadius: 12,
                  fontWeight: 800, fontSize: 14, cursor: "pointer"
                }}
              >
                🚀 Ajouter toutes les fiches au module
              </button>
            )}
          </HoloCard>

          {/* Liste des photos */}
          {photoItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {photoItems.map(photo => {
                const isExpanded = photoExpanded === photo.id;
                return (
                  <HoloCard className="lab-card-mobile" theme={theme} glowColor={activeColor} key={photo.id} style={{
                    background: theme.cardBg, borderRadius: 20,
                    border: `2px solid ${photo.status === "done" ? "#10B98133" :
                      photo.status === "loading" ? "#4D6BFE33" :
                        photo.status === "error" ? "#EF444433" : theme.border
                      }`
                    // HoloCard gère le overflow: hidden pour nous
                  }}>
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
                      {/* Miniature */}
                      <img src={photo.dataUrl} alt="" style={{
                        width: 60, height: 60, objectFit: "cover",
                        borderRadius: 10, border: `1px solid ${theme.border}`, flexShrink: 0
                      }} />

                      {/* Infos */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 700, color: theme.text, fontSize: 14,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}>
                          {photo.name}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 3, display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {photo.imageType && (
                            <span style={{ background: "#EEF2FF", color: "#4D6BFE", borderRadius: 8, padding: "2px 8px", fontWeight: 700 }}>
                              {photo.imageType.replace("_", " ")}
                            </span>
                          )}
                          {photo.subject && (
                            <span style={{ background: "#F0FDF4", color: "#059669", borderRadius: 8, padding: "2px 8px", fontWeight: 700 }}>
                              {photo.subject}
                            </span>
                          )}
                          <span style={{
                            color: photo.status === "done" ? "#059669" :
                              photo.status === "loading" ? "#4D6BFE" :
                                photo.status === "error" ? "#EF4444" : theme.textMuted,
                            fontWeight: 700,
                            display: "flex", alignItems: "center", gap: 4
                          }}>
                            {photo.status === "loading" && <><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4D6BFE", "--glow-color": "#4D6BFE", animation: "ai-pulse 1s infinite alternate" }} /> Analyse Neuronale...</>}
                            {photo.status === "done" && `✅ ${photo.cards.length} fiches`}
                            {photo.status === "error" && `❌ ${photo.error}`}
                            {photo.status === "idle" && "⏳ En attente"}
                          </span>
                        </div>
                        {photo.summary && !isExpanded && (
                          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, fontStyle: "italic" }}>
                            {photo.summary}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        {photo.status === "done" && (
                          <>
                            <button
                              onClick={() => setPhotoExpanded(isExpanded ? null : photo.id)}
                              style={{
                                padding: "7px 12px", borderRadius: 10,
                                background: theme.inputBg, border: `1px solid ${theme.border}`,
                                color: theme.text, fontWeight: 700, fontSize: 12, cursor: "pointer"
                              }}
                            >{isExpanded ? "▲" : "▼ Fiches"}</button>
                            <button
                              onClick={() => addPhotoTelQuel(photo)}
                              style={{
                                padding: "7px 12px", borderRadius: 10,
                                background: "#FFFBEB", border: "1px solid #FDE68A",
                                color: "#D97706", fontWeight: 700, fontSize: 12, cursor: "pointer"
                              }}
                            >📝 Ajouter tel quel</button>
                            <button
                              onClick={() => addPhotocardsToDeck(photo)}
                              style={{
                                padding: "7px 12px", borderRadius: 10,
                                background: "#ECFDF5", border: "1px solid #059669",
                                color: "#059669", fontWeight: 700, fontSize: 12, cursor: "pointer"
                              }}
                            >🚀 Ajouter fiches générées</button>
                          </>
                        )}
                        {photo.status === "error" && (
                          <button
                            onClick={() => analyzePhoto(photo, photoModule || photo.module)}
                            style={{
                              padding: "7px 12px", borderRadius: 10,
                              background: "#FEF2F2", border: "1px solid #EF4444",
                              color: "#EF4444", fontWeight: 700, fontSize: 12, cursor: "pointer"
                            }}
                          >🔄 Réessayer</button>
                        )}
                        <button
                          onClick={() => removePhoto(photo.id)}
                          style={{
                            padding: "7px 10px", borderRadius: 10, background: "none",
                            border: `1px solid ${theme.border}`, color: theme.textMuted,
                            cursor: "pointer", fontSize: 14
                          }}
                        >✕</button>
                      </div>
                    </div>

                    {/* Fiches expandées */}
                    {isExpanded && photo.status === "done" && (
                      <div style={{ borderTop: `1px solid ${theme.border}`, padding: 24, background: theme.inputBg }}>
                        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
                          {/* Panneau gauche : Image (Sticky) */}
                          <div style={{ width: 220, flexShrink: 0, position: "sticky", top: 20 }}>
                            <img src={photo.dataUrl} alt="" style={{
                              width: "100%", borderRadius: 16,
                              border: `2px solid ${activeColor}40`, objectFit: "contain", maxHeight: 300,
                              boxShadow: "0 10px 30px rgba(77,107,254,0.1)"
                            }} />
                            {photo.extractedText && (
                              <details style={{ marginTop: 12, background: theme.cardBg, borderRadius: 12, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
                                <summary style={{ color: theme.text, fontSize: 12, cursor: "pointer", fontWeight: 800, padding: "10px 14px", background: theme.inputBg }}>
                                  📝 Voir le texte extrait
                                </summary>
                                <div style={{
                                  fontSize: 11, color: theme.text,
                                  padding: 12, maxHeight: 220, overflowY: "auto", lineHeight: 1.6
                                }}>
                                  {(() => {
                                    if (!xrayKeyword || !photo.extractedText) return <span style={{ opacity: 0.8 }}>{photo.extractedText}</span>;
                                    const parts = photo.extractedText.split(new RegExp(`(${xrayKeyword})`, 'gi'));
                                    return parts.map((part, pIdx) =>
                                      part.toLowerCase() === xrayKeyword.toLowerCase() ? (
                                        <mark key={pIdx} style={{ background: `${activeColor}33`, color: activeColor, textShadow: `0 0 12px ${activeColor}`, fontWeight: 900, borderRadius: 4, padding: "2px 4px", boxShadow: `0 0 10px ${activeColor}40` }}>{part}</mark>
                                      ) : <span key={pIdx} style={{ opacity: 0.5 }}>{part}</span>
                                    );
                                  })()}
                                </div>
                              </details>
                            )}
                          </div>

                          {/* Panneau droit : Cascade de fiches */}
                          <div style={{ flex: 1, minWidth: 300, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16, alignContent: "start" }}>
                            
                            {/* Fiche "Tel quel" (Aperçu) */}
                            <div
                              style={{
                                background: "#FFFBEB", borderRadius: 16,
                                border: `2px dashed #FDE68A`, overflow: "hidden",
                                animation: `fadeUp 0.5s ease forwards`,
                                opacity: 0,
                                boxShadow: "0 4px 15px rgba(217,119,6,0.1)",
                                display: "flex", flexDirection: "column"
                              }}>
                              <div style={{ padding: "14px 16px", borderBottom: `1px solid #FDE68A` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <div style={{ fontSize: 10, fontWeight: 900, color: "#D97706", textTransform: "uppercase", letterSpacing: 1 }}>RECTO (Tel quel)</div>
                                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "#FEF3C7", color: "#B45309", fontWeight: 800 }}>APERÇU</span>
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: theme.text, lineHeight: 1.4 }}>
                                  {photo.subject || photo.name.replace(/\.[^.]+$/, "")}
                                </div>
                              </div>
                              <div style={{ padding: "14px 16px", background: theme.inputBg, flex: 1 }}>
                                <div style={{ fontSize: 10, fontWeight: 900, color: "#D97706", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>VERSO (Tel quel)</div>
                                <div style={{ marginTop: 10 }}>
                                  <GodTierContent text={photo.extractedText || "Image"} theme={theme} isDarkMode={isDarkMode} />
                                </div>
                              </div>
                              <div style={{ padding: "10px 16px", background: "#FFFBEB", borderTop: "1px solid #FDE68A" }}>
                                <button
                                  onClick={() => addPhotoTelQuel(photo)}
                                  style={{
                                    width: "100%", padding: "8px", borderRadius: 8,
                                    background: "#D97706", border: "none",
                                    color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer"
                                  }}
                                >📝 Ajouter cette fiche</button>
                              </div>
                            </div>

                            {photo.cards.map((card, ci) => (
                              <div
                                key={ci}
                                onMouseEnter={() => setXrayKeyword(card.keyword || card.front)}
                                onMouseLeave={() => setXrayKeyword(null)}
                                style={{
                                  background: theme.cardBg, borderRadius: 16,
                                  border: `1px solid ${theme.border}`, overflow: "hidden",
                                  animation: `fadeUp 0.5s ease forwards`,
                                  animationDelay: `${ci * 0.1}s`,
                                  opacity: 0,
                                  boxShadow: "0 4px 15px rgba(77,107,254,0.05)"
                                }}>
                                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${theme.border}` }}>
                                  <div style={{ fontSize: 10, fontWeight: 900, color: activeColor, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>RECTO</div>
                                  <div style={{ fontSize: 14, fontWeight: 800, color: theme.text, lineHeight: 1.4 }}>
                                    {card.front}
                                    {card.keyword && (
                                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: `${activeColor}15`, color: activeColor, marginLeft: 8, verticalAlign: "middle", border: `1px solid ${activeColor}40`, transition: "all 0.2s", filter: xrayKeyword ? "drop-shadow(0 0 4px currentColor)" : "none" }}>
                                        🔑 {card.keyword}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ padding: "14px 16px", background: theme.inputBg }}>
                                  <div style={{ fontSize: 10, fontWeight: 900, color: "#059669", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>VERSO</div>
                                  <div style={{ marginTop: 10 }}>
                                    <GodTierContent text={card.back} theme={theme} isDarkMode={isDarkMode} />
                                  </div>
                                  {card.hint && (
                                    <div style={{ marginTop: 8, fontSize: 11, color: "#B45309", background: "#FFFBEB", borderRadius: 8, padding: "6px 10px", border: "1px solid #FDE68A" }}>
                                      💡 {card.hint}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </HoloCard>
                );
              })}
            </div>
          )}

          {/* État vide */}
          {photoItems.length === 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              {[
                { emoji: "✍️", title: "Notes manuscrites", desc: "Photos de tes notes → fiches Q/R instantanées" },
                { emoji: "📊", title: "Tableau de cours", desc: "Photo du tableau en classe → extraction + mémorisation" },
                { emoji: "🔷", title: "Schémas & diagrammes", desc: "L'IA identifie chaque élément et génère des fiches" },
                { emoji: "🧮", title: "Formules & maths", desc: "Chaque formule détectée devient une fiche mémo" },
                { emoji: "📄", title: "Pages de manuel", desc: "Photos de pages de livre → définitions extraites" },
                { emoji: "🗺️", title: "Mind maps papier", desc: "Tes cartes mentales → fiches structurées" },
              ].map(t => (
                <HoloCard theme={theme} glowColor={activeColor}
                  key={t.title}
                  onClick={() => {
                    if (!photoModule) { toast("Sélectionne d'abord un module.", "error"); return; }
                    setPendingPhotoType(t.title);
                    photoInputRef.current?.click();
                  }}
                  style={{
                    background: theme.cardBg, borderRadius: 16, padding: 18,
                    border: `1px solid ${theme.border}`, cursor: "pointer", textAlign: "center",
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{t.emoji}</div>
                  <div style={{ fontWeight: 800, color: theme.text, fontSize: 13, marginBottom: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.5 }}>{t.desc}</div>
                </HoloCard>
              ))}
            </div>
          )}
        </div>
      )}


      {/* ════ 🗄️ PANNEAU RÉSERVE ════ */}
      {reserveCards.length > 0 && !showReservePanel && (
        <button
          onClick={() => setShowReservePanel(true)}
          style={{
            position: "fixed", bottom: 90, right: 20, zIndex: 500,
            background: "linear-gradient(135deg,#7c3aed,#8b5cf6)",
            color: "white", border: "none", borderRadius: 20,
            padding: "12px 18px", fontWeight: 800, fontSize: 13,
            cursor: "pointer", boxShadow: "0 8px 24px rgba(124,58,237,0.5)",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          🗄️ Réserve · {reserveCards.length}
        </button>
      )}

      {showReservePanel && (
        <div
          onClick={() => setShowReservePanel(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: theme.cardBg, borderRadius: "24px 24px 0 0",
              padding: 24, maxWidth: 680, width: "100%", maxHeight: "85vh",
              overflow: "auto", border: `1px solid ${theme.border}`, borderBottom: "none",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, color: theme.text, fontSize: 20, fontWeight: 900 }}>🗄️ Module Réserve</h3>
                <p style={{ margin: "4px 0 0", color: theme.textMuted, fontSize: 13 }}>
                  {reserveCards.length} fiche{reserveCards.length > 1 ? "s" : ""} en attente · Sélectionne celles que tu veux ajouter à l'algo
                </p>
              </div>
              <button onClick={() => setShowReservePanel(false)} style={{
                background: "transparent", border: "none", color: theme.textMuted,
                fontSize: 20, cursor: "pointer", padding: 4,
              }}>✕</button>
            </div>
            <ReserveList
              reserveCards={reserveCards}
              addFromReserve={addFromReserve}
              setShowReservePanel={setShowReservePanel}
              theme={theme}
              activeColor={activeColor}
            />
          </div>
        </div>
      )}
    </div>
  );
}
