import React, { useState, useEffect } from "react";

export default function CoachSpeedListening({ callClaude, practiceLevel, theme, isDarkMode, awardXP, storage }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null); // { text, questions: [{q, options:[], answerIndex}] }
  const [speed, setSpeed] = useState(1);
  const [answers, setAnswers] = useState({}); // { questionIndex: selectedOptionIndex }
  const [score, setScore] = useState(null);
  const [maxSpeed, setMaxSpeed] = useState(1);

  // Load max speed and exercise data from storage
  useEffect(() => {
    storage.get("speed_listening_max").then(val => {
      if (val) setMaxSpeed(val);
    }).catch(() => {});

    storage.get("speed_listening_data").then(saved => {
      if (saved) {
        setData(saved.data);
        setAnswers(saved.answers || {});
        setScore(saved.score || null);
        setSpeed(saved.speed || 1);
      }
    }).catch(() => {});
  }, [storage]);

  // Auto-save exercise data
  useEffect(() => {
    if (data) {
      storage.set("speed_listening_data", { data, answers, score, speed }).catch(() => {});
    } else {
      storage.set("speed_listening_data", null).catch(() => {});
    }
  }, [data, answers, score, speed, storage]);

  const generateExercise = async () => {
    setLoading(true);
    setData(null);
    setAnswers({});
    setScore(null);
    try {
      const prompt = `Tu es un créateur d'exercices d'anglais. Génère un court paragraphe (80-120 mots) adapté au niveau ${practiceLevel}. 
Puis, crée 3 questions à choix multiples (QCM) sur ce texte pour tester la compréhension.
Retourne UNIQUEMENT un JSON valide avec cette structure stricte :
{
  "text": "The English paragraph...",
  "questions": [
    {
      "q": "What is the main topic?",
      "options": ["A", "B", "C"],
      "answerIndex": 1
    }
  ]
}`;
      const raw = await callClaude(prompt, "Génération d'exercice Speed Listening");
      const jsonStr = raw.replace(/```json|```/gi, "").trim();
      setData(JSON.parse(jsonStr));
    } catch (e) {
      console.error(e);
      alert("Erreur de génération");
    }
    setLoading(false);
  };

  const playAudio = () => {
    if (!data?.text) return;
    window.speechSynthesis.cancel(); // Arrêter toute lecture en cours
    const u = new SpeechSynthesisUtterance(data.text);
    u.rate = speed;
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  };

  const checkAnswers = () => {
    if (Object.keys(answers).length < 3) return alert("Réponds à toutes les questions !");
    
    let correct = 0;
    data.questions.forEach((q, i) => {
      if (answers[i] === q.answerIndex) correct++;
    });
    
    const percentage = Math.round((correct / 3) * 100);
    setScore({ percentage, correct });
    
    if (percentage >= 80) {
      awardXP(30, 5, `Speed Listening x${speed} validé !`);
      if (speed > maxSpeed) {
        setMaxSpeed(speed);
        storage.set("speed_listening_max", speed);
      }
    }
  };

  const speeds = [1, 1.25, 1.5, 1.75, 2];

  const bgColor = isDarkMode ? "var(--mm-bg-card)" : "white";
  const borderColor = isDarkMode ? "var(--mm-border)" : "var(--mm-border)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp 0.3s ease" }}>
      
      {/* ── HEADER ── */}
      <div style={{ background: bgColor, borderRadius: 24, border: `1px solid ${borderColor}`, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: "0 0 8px", color: theme.text, fontSize: 20 }}>🎧 Speed Listening</h3>
            <p style={{ margin: 0, color: theme.textMuted, fontSize: 14 }}>
              Écoute un texte à différentes vitesses et teste ta compréhension.
            </p>
          </div>
          <div style={{ background: "rgba(77, 107, 254,0.1)", color: theme.primary, padding: "8px 16px", borderRadius: 16, fontWeight: 800 }}>
             Record : x{maxSpeed}
          </div>
        </div>
      </div>

      {/* ── CONTROLS ── */}
      {!data && (
        <button onClick={generateExercise} disabled={loading} style={{
          padding: "16px", background: theme.primary, color: "white", borderRadius: 16,
          fontWeight: 800, fontSize: 16, border: "none", cursor: loading ? "wait" : "pointer"
        }}>
          {loading ? "⏳ Génération en cours..." : "✨ Démarrer un exercice"}
        </button>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          <div style={{ background: bgColor, borderRadius: 24, border: `1px solid ${borderColor}`, padding: 24 }}>
             
             {/* Speed Selector */}
             <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
               <span style={{ fontSize: 14, fontWeight: 700, color: theme.textMuted, alignSelf: "center", marginRight: 10 }}>Vitesse :</span>
               {speeds.map(s => (
                 <button key={s} onClick={() => setSpeed(s)} style={{
                   padding: "8px 16px", borderRadius: 100, border: "none", cursor: "pointer", fontWeight: 800,
                   background: speed === s ? theme.primary : "rgba(77,107,254,0.05)",
                   color: speed === s ? "white" : theme.textMuted
                 }}>x{s}</button>
               ))}
             </div>

             <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
               <button onClick={playAudio} style={{
                 padding: "16px 32px", background: "linear-gradient(135deg, #10B981, #059669)", 
                 color: "white", border: "none", borderRadius: 16, fontWeight: 900, fontSize: 18, cursor: "pointer",
                 boxShadow: "0 8px 24px rgba(16,185,129,0.3)"
               }}>
                 ▶️ Écouter l'audio
               </button>
               <span style={{ fontSize: 13, color: theme.textMuted, fontStyle: "italic" }}>
                 Tu peux l'écouter plusieurs fois. Ne regarde pas le texte tout de suite !
               </span>
             </div>
          </div>

          {/* QUESTIONS */}
          <div style={{ background: bgColor, borderRadius: 24, border: `1px solid ${borderColor}`, padding: 24 }}>
            <h4 style={{ margin: "0 0 20px", color: theme.text, fontSize: 18 }}>Questions de compréhension</h4>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {data.questions.map((q, i) => (
                <div key={i}>
                  <div style={{ fontWeight: 700, color: theme.text, marginBottom: 12 }}>{i+1}. {q.q}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {q.options.map((opt, oIndex) => {
                       const isSelected = answers[i] === oIndex;
                       return (
                         <label key={oIndex} style={{ 
                           display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", 
                           borderRadius: 12, border: `2px solid ${isSelected ? theme.primary : isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.05)"}`,
                           background: isSelected ? "rgba(77, 107, 254,0.05)" : "transparent",
                           cursor: score ? "default" : "pointer"
                         }}>
                           <input type="radio" name={`q${i}`} checked={isSelected} 
                             onChange={() => !score && setAnswers(prev => ({...prev, [i]: oIndex}))} 
                             disabled={score !== null} style={{ margin: 0 }} 
                           />
                           <span style={{ color: theme.text, fontSize: 14, fontWeight: isSelected ? 700 : 500 }}>{opt}</span>
                         </label>
                       )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {!score ? (
              <button onClick={checkAnswers} style={{
                marginTop: 24, width: "100%", padding: 16, background: theme.primary, 
                color: "white", border: "none", borderRadius: 16, fontWeight: 800, fontSize: 16, cursor: "pointer"
              }}>✅ Valider mes réponses</button>
            ) : (
              <div style={{ marginTop: 24, padding: 24, borderRadius: 16, background: score.percentage >= 80 ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", border: `1px solid ${score.percentage >= 80 ? "#10B981" : "#F59E0B"}` }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: score.percentage >= 80 ? "#059669" : "#D97706", marginBottom: 8 }}>
                   Score: {score.percentage}% ({score.correct}/3)
                </div>
                <div style={{ fontSize: 15, color: theme.text, fontWeight: 600 }}>
                  {score.percentage >= 80 
                    ? `Excellent ! Tu as compris à la vitesse x${speed}. ${speed < 2 ? `Essaie de passer à x${speeds[speeds.indexOf(speed)+1] || 2} pour le prochain !` : "Tu maîtrises la vitesse maximum !"}`
                    : "C'était un peu difficile. Essaie de réduire la vitesse ou de réécouter le texte avant de regarder la transcription."}
                </div>
                <button onClick={generateExercise} style={{
                  marginTop: 16, padding: "12px 24px", background: theme.bg, color: theme.text,
                  border: `1px solid ${borderColor}`, borderRadius: 12, fontWeight: 700, cursor: "pointer"
                }}>🔄 Nouvel exercice</button>
              </div>
            )}
          </div>

          {/* TRANSCRIPT (Shown only after scoring) */}
          {score && (
            <div style={{ background: bgColor, borderRadius: 24, border: `1px solid ${borderColor}`, padding: 24 }}>
              <h4 style={{ margin: "0 0 12px", color: theme.text, fontSize: 16 }}>Transcription</h4>
              <p style={{ color: theme.text, fontSize: 15, lineHeight: 1.6, margin: 0, padding: 16, background: isDarkMode ? "rgba(255,255,255,0.05)" : "var(--mm-bg-elev)", borderRadius: 12 }}>
                {data.text}
              </p>
            </div>
          )}
          
        </div>
      )}
    </div>
  );
}
