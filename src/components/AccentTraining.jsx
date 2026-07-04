import React, { useState, useEffect, useRef } from 'react';

const PROBLEMATIC_SOUNDS = {
  th_voiced: { 
    symbol: "/ð/", pairs: [["they","day"],["that","dat"],["there","dare"]],
    tip: "Langue entre les dents, vibration" 
  },
  th_unvoiced: { 
    symbol: "/θ/", pairs: [["think","tink"],["three","tree"],["through","true"]],
    tip: "Langue entre les dents, pas de vibration" 
  },
  short_i: { 
    symbol: "/ɪ/ vs /iː/", pairs: [["ship","sheep"],["live","leave"],["bit","beat"]],
    tip: "/ɪ/ court et relâché, /iː/ long et tendu" 
  },
  ae: { 
    symbol: "/æ/", pairs: [["bad","bed"],["man","men"],["cat","cut"]],
    tip: "Bouche grande ouverte, langue basse" 
  },
  schwa: { 
    symbol: "/ə/", words: ["about","taken","problem","button"],
    tip: "Son neutre, comme un grognement" 
  }
};

export default function AccentTraining({ callClaude, storage, theme, isDarkMode, showToast }) {
  const [activeSound, setActiveSound] = useState(Object.keys(PROBLEMATIC_SOUNDS)[0]);
  const [activeTab, setActiveTab] = useState("discrimination"); // discrimination, pronunciation, phrases
  
  // Storage state
  const [scores, setScores] = useState({});

  useEffect(() => {
    if (storage?.get) {
      storage.get("accent_scores_v1").then(s => { if (s) setScores(s); }).catch(() => {});
    }
  }, [storage]);

  const saveScore = (soundId, newAccuracy) => {
    setScores(prev => {
      const existing = prev[soundId];
      // Moyenne glissante
      const updatedAccuracy = existing ? Math.round((existing.accuracy + newAccuracy) / 2) : newAccuracy;
      const newScores = { ...prev, [soundId]: { accuracy: updatedAccuracy } };
      if (storage?.set) storage.set("accent_scores_v1", newScores).catch(() => {});
      return newScores;
    });
  };

  const currentProfile = PROBLEMATIC_SOUNDS[activeSound];

  // Helper TTS
  const speakBrowser = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(vo => vo.name.includes("Google US English")) || voices.find(vo => vo.lang.startsWith("en"));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── HEADER & HEATMAP ── */}
      <div style={{ background: theme.cardBg, borderRadius: 16, padding: 20, border: `1px solid ${theme.border}` }}>
        <h2 style={{ margin: "0 0 16px 0", color: theme.text, fontSize: 20 }}>🌐 Accent Training</h2>
        <p style={{ color: theme.textMuted, fontSize: 14, marginTop: 0 }}>Cible tes sons faibles de francophone. Heatmap de progression :</p>
        
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {Object.entries(PROBLEMATIC_SOUNDS).map(([key, data]) => {
            const sc = scores[key]?.accuracy || 0;
            // Heatmap color
            let bg = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(77,107,254,0.05)";
            if (sc >= 80) bg = "#22C55E"; // Vert = maîtrisé
            else if (sc >= 50) bg = "#F59E0B"; // Jaune = moyen
            else if (sc > 0) bg = "#EF4444"; // Rouge = problématique

            return (
              <button
                key={key}
                onClick={() => setActiveSound(key)}
                style={{
                  padding: "10px 16px", borderRadius: 12, border: "none", cursor: "pointer",
                  background: activeSound === key ? theme.primary : bg,
                  color: (activeSound === key || sc > 0) ? "white" : theme.text,
                  fontWeight: 700, fontSize: 14,
                  transform: activeSound === key ? "scale(1.05)" : "none",
                  transition: "all 0.2s",
                  boxShadow: activeSound === key ? `0 4px 12px ${theme.primary}66` : "none"
                }}
              >
                {data.symbol}
                {sc > 0 && <span style={{ fontSize: 10, marginLeft: 6 }}>{sc}%</span>}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: theme.primary, fontWeight: 600 }}>
          💡 Tip: {currentProfile.tip}
        </div>
      </div>

      {/* ── TABS EXERCISES ── */}
      <div style={{ display: "flex", gap: 10, borderBottom: `1px solid ${theme.border}`, paddingBottom: 10 }}>
        {[
          { id: "discrimination", label: "🎧 Discrimination" },
          { id: "pronunciation", label: "🎙️ Prononciation" },
          { id: "phrases", label: "📝 En contexte" }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: "none", border: "none", padding: "8px 12px", cursor: "pointer",
              fontWeight: 700, fontSize: 14,
              color: activeTab === t.id ? theme.primary : theme.textMuted,
              borderBottom: activeTab === t.id ? `2px solid ${theme.primary}` : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── EXERCISE CONTENT ── */}
      {activeTab === "discrimination" && (
        <DiscriminationExercise 
          key={activeSound}
          profile={currentProfile} 
          soundId={activeSound}
          speakBrowser={speakBrowser} 
          saveScore={saveScore}
          theme={theme}
          isDarkMode={isDarkMode}
        />
      )}
      {activeTab === "pronunciation" && (
        <PronunciationExercise 
          key={activeSound}
          profile={currentProfile}
          soundId={activeSound}
          saveScore={saveScore}
          theme={theme}
          isDarkMode={isDarkMode}
          showToast={showToast}
        />
      )}
      {activeTab === "phrases" && (
        <PhrasesExercise 
          key={activeSound}
          profile={currentProfile}
          soundId={activeSound}
          callClaude={callClaude}
          saveScore={saveScore}
          theme={theme}
          isDarkMode={isDarkMode}
          showToast={showToast}
          storage={storage}
        />
      )}
    </div>
  );
}

// ── EX 1: DISCRIMINATION ────────────────────────────────────────────────────────
function DiscriminationExercise({ profile, soundId, speakBrowser, saveScore, theme }) {
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [currentPair, setCurrentPair] = useState(null);
  const [targetWord, setTargetWord] = useState("");
  const [feedback, setFeedback] = useState(null); // { correct: bool, text: string }

  const nextRound = () => {
    if (!profile.pairs || profile.pairs.length === 0) return;
    const pair = profile.pairs[Math.floor(Math.random() * profile.pairs.length)];
    const target = pair[Math.floor(Math.random() * 2)];
    setCurrentPair(pair);
    setTargetWord(target);
    setFeedback(null);
    speakBrowser(target);
  };

  useEffect(() => {
    nextRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!profile.pairs) {
    return <div style={{ color: theme.textMuted, padding: 20 }}>Cet exercice nécessite des paires minimales (non dispo pour ce son).</div>;
  }

  const handleGuess = (guess) => {
    if (feedback) return; // already guessed
    const isCorrect = guess === targetWord;
    if (isCorrect) setScore(s => s + 1);
    
    setFeedback({
      correct: isCorrect,
      text: isCorrect ? "Correct !" : `C'était "${targetWord}".`
    });

    const newRound = round + 1;
    if (newRound >= 10) {
      const finalScore = isCorrect ? score + 1 : score;
      const accuracy = (finalScore / 10) * 100;
      saveScore(soundId, accuracy);
      setTimeout(() => {
        setFeedback({ correct: true, text: `Exercice terminé ! Score: ${finalScore}/10 (${accuracy}%). Focus recommandé si < 80%.` });
      }, 1000);
    } else {
      setTimeout(() => {
        setRound(newRound);
        nextRound();
      }, 1500);
    }
  };

  return (
    <div style={{ background: theme.cardBg, padding: 20, borderRadius: 16, border: `1px solid ${theme.border}`, textAlign: "center" }}>
      <h3 style={{ margin: "0 0 16px", color: theme.text }}>Écoute et choisis le bon mot</h3>
      <div style={{ marginBottom: 20, fontSize: 14, color: theme.textMuted }}>Essai {round + 1} / 10</div>
      
      <button 
        onClick={() => speakBrowser(targetWord)}
        style={{
          width: 64, height: 64, borderRadius: "50%", background: theme.primary, color: "white", 
          border: "none", fontSize: 24, cursor: "pointer", marginBottom: 30,
          boxShadow: `0 4px 15px ${theme.primary}66`
        }}
      >
        🔊
      </button>

      <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
        {currentPair && currentPair.map((w, idx) => (
          <button
            key={idx}
            onClick={() => handleGuess(w)}
            style={{
              padding: "16px 32px", fontSize: 20, fontWeight: 800, borderRadius: 12, border: "none",
              background: feedback ? (w === targetWord ? "#22C55E" : (feedback.correct ? theme.surface : "#EF4444")) : theme.surface,
              color: feedback ? "white" : theme.text,
              cursor: feedback ? "default" : "pointer",
              transition: "all 0.2s"
            }}
          >
            {w}
          </button>
        ))}
      </div>

      {feedback && (
        <div style={{ marginTop: 24, fontSize: 18, fontWeight: 700, color: feedback.correct ? "#22C55E" : "#EF4444", animation: "fadeUp 0.3s ease" }}>
          {feedback.text}
        </div>
      )}
    </div>
  );
}

// ── EX 2: PRONUNCIATION ───────────────────────────────────────────────────────
function PronunciationExercise({ profile, soundId, saveScore, theme, showToast }) {
  const [listening, setListening] = useState(false);
  const [targetWord, setTargetWord] = useState("");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null); // "correct" | "wrong"
  
  const recRef = useRef(null);

  const newWord = () => {
    let choices = profile.pairs ? profile.pairs.flat() : (profile.words || []);
    if (choices.length === 0) return;
    setTargetWord(choices[Math.floor(Math.random() * choices.length)]);
    setResult(null);
    setTranscript("");
  };

  useEffect(() => {
    newWord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return showToast?.("Reconnaissance vocale non supportée", "error");
    
    if (recRef.current) { recRef.current.stop(); }
    
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript.toLowerCase().trim();
      // Enlever la ponctuation finale éventuelle (souvent le cas avec SpeechRecognition)
      const cleanText = text.replace(/[.,!?]+$/, '');
      setTranscript(cleanText);
      
      const words = cleanText.split(/\s+/);
      // Vérifier si le transcript contient le mot cible
      if (words.includes(targetWord.toLowerCase())) {
        setResult("correct");
        saveScore(soundId, 100);
      } else {
        setResult("wrong");
        saveScore(soundId, 0); // Ouch
      }
    };
    
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    
    recRef.current = rec;
    rec.start();
    setListening(true);
    setResult(null);
    setTranscript("");
  };

  return (
    <div style={{ background: theme.cardBg, padding: 20, borderRadius: 16, border: `1px solid ${theme.border}`, textAlign: "center" }}>
      <h3 style={{ margin: "0 0 16px", color: theme.text }}>Lis ce mot à voix haute</h3>
      <div style={{ fontSize: 40, fontWeight: 900, color: theme.primary, letterSpacing: 2, margin: "30px 0" }}>
        {targetWord}
      </div>
      
      <button 
        onClick={startListening}
        style={{
          padding: "16px 32px", borderRadius: 100, border: "none", background: listening ? "#EF4444" : theme.primary,
          color: "white", fontSize: 16, fontWeight: 800, cursor: "pointer", transition: "all 0.2s",
          boxShadow: listening ? "0 4px 20px rgba(239,68,68,0.5)" : "none"
        }}
      >
        {listening ? "🔴 Écoute en cours..." : "🎙️ Maintenir ou cliquer pour parler"}
      </button>

      {transcript && (
        <div style={{ marginTop: 24, padding: 16, background: theme.surface, borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>Tu as dit :</div>
          <div style={{ fontSize: 18, color: theme.text, fontWeight: 600 }}>"{transcript}"</div>
          
          {result === "correct" && <div style={{ color: "#22C55E", fontWeight: 800, marginTop: 10 }}>✨ Parfait !</div>}
          {result === "wrong" && (
            <div style={{ color: "#EF4444", fontWeight: 800, marginTop: 10 }}>
              ❌ L'IA a entendu autre chose. Fais bien attention au son {profile.symbol}.<br/>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Tip: {profile.tip}</span>
            </div>
          )}
        </div>
      )}

      {result && (
        <button onClick={newWord} style={{ marginTop: 20, padding: "8px 16px", background: "none", color: theme.primary, border: `1px solid ${theme.primary}`, borderRadius: 8, cursor: "pointer" }}>
          Mot suivant ➡️
        </button>
      )}
    </div>
  );
}

// ── EX 3: PHRASES EN CONTEXTE ────────────────────────────────────────────────
function PhrasesExercise({ profile, soundId, callClaude, saveScore, theme, showToast, storage }) {
  const [phrases, setPhrases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null);

  const recRef = useRef(null);

  // Load saved phrases on sound change/mount
  useEffect(() => {
    if (storage?.get) {
      storage.get("accent_phrases_" + soundId).then(saved => {
        if (saved && saved.length > 0) {
          setPhrases(saved);
        }
      }).catch(() => {});
    }
  }, [storage, soundId]);

  const generatePhrases = async () => {
    setLoading(true);
    setPhrases([]);
    try {
      const prompt = `Génère 5 phrases courtes en anglais spécialement conçues pour pratiquer le son ${profile.symbol} (ex: ${profile.tip}). La phrase doit contenir plusieurs mots avec ce son. Retourne UNIQUEMENT un tableau JSON natif de 5 strings. Exemple: ["Phrase une.", "Phrase deux."]`;
      const res = await callClaude(prompt, "Accent Phrases");
      const match = res.match(/\[([\s\S]*?)\]/);
      if (match) {
        const parsed = JSON.parse(`[${match[1]}]`);
        setPhrases(parsed);
        if (storage?.set) {
          storage.set("accent_phrases_" + soundId, parsed).catch(() => {});
        }
      } else {
        throw new Error("Invalid response format");
      }
    } catch {
      showToast?.("Erreur génération phrases", "error");
    } finally {
      setLoading(false);
    }
  };



  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return showToast?.("Reconnaissance vocale non supportée", "error");
    
    if (recRef.current) recRef.current.stop();
    
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      
      // Calculate simple accuracy (words matched)
      const targetWords = phrases[activeIdx].toLowerCase().replace(/[^\w\s']/g, '').split(/\s+/);
      const spokenWords = text.toLowerCase().replace(/[^\w\s']/g, '').split(/\s+/);
      
      let matched = 0;
      targetWords.forEach(tw => {
        if (spokenWords.includes(tw)) matched++;
      });
      
      const accuracy = Math.round((matched / targetWords.length) * 100);
      setResult(accuracy);
      saveScore(soundId, accuracy);
    };
    
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    
    recRef.current = rec;
    rec.start();
    setListening(true);
    setResult(null);
    setTranscript("");
  };

  return (
    <div style={{ background: theme.cardBg, padding: 20, borderRadius: 16, border: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0, color: theme.text }}>Phrases en contexte</h3>
        <button onClick={generatePhrases} disabled={loading} style={{ padding: "8px 16px", borderRadius: 8, background: theme.primary, color: "white", border: "none", cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Génération..." : (phrases.length > 0 ? "Générer à nouveau" : "Générer des phrases")}
        </button>
      </div>

      {phrases.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: theme.text, textAlign: "center", fontStyle: "italic", padding: 20, background: theme.surface, borderRadius: 12, width: "100%" }}>
            "{phrases[activeIdx]}"
          </div>
          
          <button 
            onClick={startListening}
            style={{
              padding: "16px 32px", borderRadius: 100, border: "none", background: listening ? "#EF4444" : theme.primary,
              color: "white", fontSize: 16, fontWeight: 800, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            {listening ? "🔴 Écoute en cours..." : "🎙️ Lire la phrase"}
          </button>

          {transcript && (
            <div style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 12, color: theme.textMuted }}>Tu as dit :</div>
              <div style={{ fontSize: 16, color: theme.text, marginTop: 4 }}>"{transcript}"</div>
              
              {result !== null && (
                <div style={{ marginTop: 12, fontSize: 18, fontWeight: 800, color: result >= 80 ? "#22C55E" : (result >= 50 ? "#F59E0B" : "#EF4444") }}>
                  Précision : {result}%
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {phrases.map((_, idx) => (
              <button 
                key={idx} 
                onClick={() => { setActiveIdx(idx); setResult(null); setTranscript(""); }}
                style={{
                  width: 12, height: 12, borderRadius: "50%", padding: 0, border: "none", cursor: "pointer",
                  background: activeIdx === idx ? theme.primary : theme.border
                }}
                aria-label={`Phrase ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
