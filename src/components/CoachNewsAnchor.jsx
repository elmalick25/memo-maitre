import React, { useState, useEffect, useRef } from "react";

export default function CoachNewsAnchor({ callClaude, practiceLevel, theme, isDarkMode, awardXP, storage }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null); // { wpm, precision, level, timeStr }
  const [personalRecord, setPersonalRecord] = useState(0);
  
  const recogRef = useRef(null);
  const startTimeRef = useRef(0);

  // Load personal record and exercise data from storage
  useEffect(() => {
    storage.get("news_anchor_pr").then(val => {
      if (val) setPersonalRecord(val);
    }).catch(() => {});

    storage.get("news_anchor_data").then(saved => {
      if (saved) {
        setText(saved.text || "");
        setResult(saved.result || null);
        setTranscript(saved.transcript || "");
      }
    }).catch(() => {});
  }, [storage]);

  // Auto-save exercise data
  useEffect(() => {
    if (text) {
      storage.set("news_anchor_data", { text, result, transcript }).catch(() => {});
    } else {
      storage.set("news_anchor_data", null).catch(() => {});
    }
  }, [text, result, transcript, storage]);

  const generateText = async () => {
    setLoading(true);
    setResult(null);
    setTranscript("");
    try {
      const prompt = `Tu es un journaliste anglophone. Rédige une dépêche (News) d'exactement 100 mots environ, niveau ${practiceLevel}.
Ne mets ni titre, ni introduction, renvoie UNIQUEMENT le texte du paragraphe, brut, sans guillemets.`;
      const raw = await callClaude(prompt, "Génération News Anchor");
      setText(raw.trim());
    } catch (e) {
      console.error(e);
      alert("Erreur de génération");
    }
    setLoading(false);
  };

  const getWpmLevel = (wpm) => {
    if (wpm < 80) return "Beginner reader 🐢";
    if (wpm < 110) return "Elementary 🚶";
    if (wpm < 140) return "Intermediate 🏃";
    if (wpm < 170) return "Advanced ⚡";
    return "Near-native 🏆";
  };

  const calculateResult = (finalTranscript, durationMs) => {
    if (durationMs < 2000) return alert("Trop court ! Lis le texte correctement.");
    
    const minutes = durationMs / 60000;
    
    const targetWords = text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
    const spokenWords = finalTranscript.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
    
    // Count matches (simple precision)
    let matchCount = 0;
    const spokenSet = new Set(spokenWords);
    targetWords.forEach(w => {
      if (spokenSet.has(w)) matchCount++;
    });

    // Mots reconnus (on cap le max au nombre de mots cible pour éviter la triche en répétant)
    const recognizedWords = Math.min(spokenWords.length, targetWords.length);
    const wpm = Math.round(recognizedWords / minutes);
    const precision = Math.round((matchCount / targetWords.length) * 100);

    const level = getWpmLevel(wpm);
    const timeStr = (durationMs / 1000).toFixed(1);

    setResult({ wpm, precision, level, timeStr });

    if (wpm > personalRecord && precision > 60) {
      setPersonalRecord(wpm);
      storage.set("news_anchor_pr", wpm);
    }

    if (precision > 70) {
      awardXP(30, 5, `News Anchor: ${wpm} WPM`);
    }
  };

  const toggleRecording = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return alert("SpeechRecognition non supporté sur ce navigateur.");

    if (isRecording) {
      // Stop
      recogRef.current?.stop();
      setIsRecording(false);
      return;
    }

    // Start
    const recog = new SpeechRec();
    recog.lang = "en-US";
    recog.continuous = true; // Empêche l'arrêt sur une petite respiration
    recog.interimResults = true;
    recogRef.current = recog;

    setTranscript("");
    setResult(null);
    let finalTranscript = "";

    recog.onstart = () => {
      setIsRecording(true);
      startTimeRef.current = performance.now();
    };

    recog.onresult = (e) => {
      let temp = "";
      for (let i = 0; i < e.results.length; i++) {
        temp += e.results[i][0].transcript;
      }
      setTranscript(temp);
      finalTranscript = temp;
    };

    recog.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
         console.error("Mic error", e);
      }
    };

    recog.onend = () => {
      setIsRecording(false);
      const duration = performance.now() - startTimeRef.current;
      if (finalTranscript) {
        calculateResult(finalTranscript, duration);
      }
    };

    recog.start();
  };

  const bgColor = isDarkMode ? "var(--mm-bg-card)" : "white";
  const borderColor = isDarkMode ? "var(--mm-border)" : "var(--mm-border)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp 0.3s ease" }}>
      
      {/* ── HEADER ── */}
      <div style={{ background: bgColor, borderRadius: 24, border: `1px solid ${borderColor}`, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: "0 0 8px", color: theme.text, fontSize: 20 }}>🎙️ News Anchor</h3>
            <p style={{ margin: 0, color: theme.textMuted, fontSize: 14 }}>
              Lis le texte à voix haute le plus vite possible (sans sacrifier la prononciation).
            </p>
          </div>
          <div style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", padding: "8px 16px", borderRadius: 16, fontWeight: 800 }}>
             PR : {personalRecord} WPM
          </div>
        </div>
      </div>

      {!text && (
        <button onClick={generateText} disabled={loading} style={{
          padding: "16px", background: theme.primary, color: "white", borderRadius: 16,
          fontWeight: 800, fontSize: 16, border: "none", cursor: loading ? "wait" : "pointer"
        }}>
          {loading ? "⏳ Génération de la News..." : "📝 Générer une dépêche"}
        </button>
      )}

      {text && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          
          <div style={{ 
            background: isDarkMode ? "rgba(255,255,255,0.02)" : "var(--mm-bg-elev)", 
            padding: 32, borderRadius: 24, border: `1px solid ${borderColor}`,
            fontSize: 20, lineHeight: 1.6, color: theme.text, fontFamily: "serif"
          }}>
            {text}
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "center" }}>
            <button onClick={toggleRecording} style={{
              width: 80, height: 80, borderRadius: "50%", border: "none",
              background: isRecording ? "#EF4444" : theme.primary, color: "white",
              fontSize: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 10px 30px ${isRecording ? "rgba(239,68,68,0.4)" : "rgba(77, 107, 254,0.3)"}`,
              animation: isRecording ? "pulseAstral 1s infinite" : "none"
            }}>
              {isRecording ? "🛑" : "🎙️"}
            </button>
            <div style={{ fontSize: 16, fontWeight: 700, color: isRecording ? "#EF4444" : theme.textMuted }}>
              {isRecording ? "Lecture en cours... (clique pour stopper)" : "Clique pour démarrer le chrono"}
            </div>
          </div>

          {transcript && (
            <div style={{ fontSize: 13, color: theme.textMuted, fontStyle: "italic", textAlign: "center" }}>
               "{transcript.slice(0, 50)}..."
            </div>
          )}

          {result && !isRecording && (
            <div style={{ background: "linear-gradient(135deg, rgba(77, 107, 254,0.1), rgba(77, 107, 254,0.1))", borderRadius: 24, padding: 32, border: `1px solid ${theme.primary}40`, display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "space-around" }}>
               
               <div style={{ textAlign: "center" }}>
                 <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: theme.primary, marginBottom: 8 }}>Vitesse WPM</div>
                 <div style={{ fontSize: 48, fontWeight: 900, color: theme.text }}>{result.wpm}</div>
                 <div style={{ fontSize: 14, fontWeight: 700, color: theme.textMuted }}>{result.level}</div>
               </div>

               <div style={{ width: 1, background: `${theme.primary}20` }} />

               <div style={{ textAlign: "center" }}>
                 <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: theme.primary, marginBottom: 8 }}>Précision</div>
                 <div style={{ fontSize: 48, fontWeight: 900, color: result.precision > 80 ? "#10B981" : "#F59E0B" }}>{result.precision}%</div>
                 <div style={{ fontSize: 14, fontWeight: 700, color: theme.textMuted }}>Mots reconnus</div>
               </div>

               <div style={{ width: 1, background: `${theme.primary}20` }} />

               <div style={{ textAlign: "center" }}>
                 <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: theme.primary, marginBottom: 8 }}>Temps</div>
                 <div style={{ fontSize: 48, fontWeight: 900, color: theme.text }}>{result.timeStr}s</div>
                 <div style={{ fontSize: 14, fontWeight: 700, color: theme.textMuted }}>Durée de lecture</div>
               </div>

               <div style={{ width: "100%", textAlign: "center", marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.primary}20` }}>
                 <span style={{ fontSize: 14, color: theme.text }}>
                    💡 <strong>Natif américain moyen :</strong> 150 WPM. Tu es à {result.wpm} WPM. 
                    {result.wpm >= 150 ? " Wow, tu parles comme un natif !" : " Encore un peu d'entraînement !"}
                 </span>
               </div>
            </div>
          )}

          <button onClick={generateText} disabled={loading} style={{
            padding: "12px", background: "transparent", color: theme.textMuted, borderRadius: 12,
            fontWeight: 600, border: `1px solid ${borderColor}`, cursor: "pointer", alignSelf: "center", marginTop: 16
          }}>
            Générer un autre texte
          </button>
        </div>
      )}
    </div>
  );
}
