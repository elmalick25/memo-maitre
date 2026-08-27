// src/components/AccentTraining.jsx
// ─────────────────────────────────────────────────────────────────────────────
// LE DOJO PHONÉTIQUE & SHADOWING LAB (ACCENT & CONNECTED SPEECH)
//
// 1. Sons clés bêtes noires des francophones (/θ/, /ð/, /ɪ/ vs /iː/, /æ/ vs /e/, /ə/)
// 2. Connected Speech (Liaisons, élisions, contractions: should've, gonna, wanna)
// 3. Audio natif immédiat + Enregistrement vocal et scoring instantané
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from "react";
import { Volume2, Mic, Square, Sparkles, CheckCircle2, RotateCcw, Award } from "lucide-react";
import { playEnglishAudio } from "../lib/speakUtils";

const PROBLEMATIC_SOUNDS = {
  th_voiced: {
    symbol: "/ð/",
    title: "TH doux (vibrant)",
    pairs: [["they", "day"], ["that", "dat"], ["there", "dare"], ["breathe", "breed"]],
    tip: "Langue entre les dents, fais vibrer tes cordes vocales.",
  },
  th_unvoiced: {
    symbol: "/θ/",
    title: "TH sourd (soufflé)",
    pairs: [["think", "tink"], ["three", "tree"], ["through", "true"], ["bath", "bat"]],
    tip: "Langue entre les dents, souffle sans faire vibrer la gorge.",
  },
  short_i: {
    symbol: "/ɪ/ vs /iː/",
    title: "I court relâché vs I long tendu",
    pairs: [["ship", "sheep"], ["live", "leave"], ["bit", "beat"], ["fit", "feet"], ["hit", "heat"]],
    tip: "/ɪ/ est très court et relâché (proche de 'é'), /iː/ est souriant et étiré.",
  },
  ae: {
    symbol: "/æ/ vs /e/",
    title: "A ouvert vs E neutre",
    pairs: [["bad", "bed"], ["man", "men"], ["cat", "cut"], ["pan", "pen"], ["flash", "flesh"]],
    tip: "Bouche grande ouverte, mâchoire détendue pour le son /æ/.",
  },
  schwa: {
    symbol: "/ə/",
    title: "Le Schwa (Le son le plus important)",
    words: ["about", "taken", "problem", "button", "focus", "occur", "banana"],
    tip: "Son neutre et paresseux, non accentué. Il remplace la plupart des voyelles faibles.",
  },
  connected_speech: {
    symbol: "🔗 Linking",
    title: "Connected Speech & Contractions",
    words: [
      "should've known",
      "gonna make it",
      "wanna talk about it",
      "gotta get out",
      "kind of weird",
      "out of time",
    ],
    tip: "Les mots ne sont jamais coupés : lis la phrase comme un seul long mot continu.",
  },
};

export default function AccentTraining({ callClaude, storage, theme, isDarkMode, showToast, awardXP }) {
  const [activeSound, setActiveSound] = useState(Object.keys(PROBLEMATIC_SOUNDS)[0]);
  const [activeTab, setActiveTab] = useState("discrimination"); // discrimination, pronunciation, phrases
  const [scores, setScores] = useState({});

  useEffect(() => {
    if (storage?.get) {
      storage.get("accent_scores_v2").then((s) => {
        if (s) setScores(s);
      }).catch(() => {});
    }
  }, [storage]);

  const saveScore = (soundId, newAccuracy) => {
    setScores((prev) => {
      const existing = prev[soundId];
      const updatedAccuracy = existing ? Math.round((existing.accuracy + newAccuracy) / 2) : newAccuracy;
      const newScores = { ...prev, [soundId]: { accuracy: updatedAccuracy } };
      if (storage?.set) storage.set("accent_scores_v2", newScores).catch(() => {});
      return newScores;
    });
  };

  const currentProfile = PROBLEMATIC_SOUNDS[activeSound];

  const playAudio = (text) => {
    playEnglishAudio(text);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── HEADER & HEATMAP DES SONS ── */}
      <div
        style={{
          background: theme.cardBg,
          borderRadius: 18,
          padding: 24,
          border: `1px solid ${theme.border}`,
          boxShadow: isDarkMode ? "0 8px 24px rgba(0,0,0,0.3)" : "0 4px 16px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, color: theme.text, fontSize: 20, fontWeight: 900 }}>
              🗣️ Le Dojo Phonétique & Accent
            </h2>
            <p style={{ color: theme.textMuted, fontSize: 13, margin: "4px 0 0" }}>
              Élimine les blocages de prononciation typiques et fluidifie ton élocution orale.
            </p>
          </div>
        </div>

        {/* Sélecteur de sons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {Object.entries(PROBLEMATIC_SOUNDS).map(([key, data]) => {
            const sc = scores[key]?.accuracy || 0;
            const isSelected = activeSound === key;

            let badgeBg = isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(139, 92, 246, 0.06)";
            if (sc >= 80) badgeBg = "#22C55E22";
            else if (sc >= 50) badgeBg = "#F59E0B22";
            else if (sc > 0) badgeBg = "#EF444422";

            return (
              <button
                key={key}
                onClick={() => setActiveSound(key)}
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: isSelected ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  cursor: "pointer",
                  background: isSelected ? theme.primary : badgeBg,
                  color: isSelected ? "white" : theme.text,
                  fontWeight: 800,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.2s",
                }}
              >
                <span>{data.symbol}</span>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{data.title}</span>
                {sc > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 10,
                      background: isSelected ? "rgba(255,255,255,0.2)" : (sc >= 80 ? "#22C55E" : "#F59E0B"),
                      color: "white",
                    }}
                  >
                    {sc}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 13,
            color: isDarkMode ? "#C4B5FD" : "#6D28D9",
            background: isDarkMode ? "rgba(139, 92, 246, 0.1)" : "rgba(139, 92, 246, 0.06)",
            padding: "10px 14px",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          💡 <strong>Coach Tip :</strong> {currentProfile.tip}
        </div>
      </div>

      {/* ── ONGLETS EXERCICES ── */}
      <div style={{ display: "flex", gap: 10, borderBottom: `1px solid ${theme.border}`, paddingBottom: 8 }}>
        {[
          { id: "discrimination", label: "🎧 1. Discrimination Auditive" },
          { id: "pronunciation", label: "🎙️ 2. Prononciation Ciblée" },
          { id: "phrases", label: "📝 3. Phrases en Contexte" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: "none",
              border: "none",
              padding: "8px 16px",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 14,
              color: activeTab === t.id ? theme.primary : theme.textMuted,
              borderBottom: activeTab === t.id ? `3px solid ${theme.primary}` : "3px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CONTENU DES EXERCICES ── */}
      {activeTab === "discrimination" && (
        <DiscriminationExercise
          key={activeSound}
          profile={currentProfile}
          soundId={activeSound}
          playAudio={playAudio}
          saveScore={saveScore}
          theme={theme}
          isDarkMode={isDarkMode}
          awardXP={awardXP}
        />
      )}
      {activeTab === "pronunciation" && (
        <PronunciationExercise
          key={activeSound}
          profile={currentProfile}
          soundId={activeSound}
          playAudio={playAudio}
          saveScore={saveScore}
          theme={theme}
          isDarkMode={isDarkMode}
          showToast={showToast}
          awardXP={awardXP}
        />
      )}
      {activeTab === "phrases" && (
        <PhrasesExercise
          key={activeSound}
          profile={currentProfile}
          soundId={activeSound}
          playAudio={playAudio}
          callClaude={callClaude}
          saveScore={saveScore}
          theme={theme}
          isDarkMode={isDarkMode}
          showToast={showToast}
          storage={storage}
          awardXP={awardXP}
        />
      )}
    </div>
  );
}

// ── EXERCICE 1: DISCRIMINATION AUDITIVE ──────────────────────────────────────
function DiscriminationExercise({ profile, soundId, playAudio, saveScore, theme, awardXP }) {
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [currentPair, setCurrentPair] = useState(null);
  const [targetWord, setTargetWord] = useState("");
  const [feedback, setFeedback] = useState(null);

  const nextRound = () => {
    const list = profile.pairs || (profile.words ? profile.words.map((w) => [w, w]) : []);
    if (!list || list.length === 0) return;
    const pair = list[Math.floor(Math.random() * list.length)];
    const target = pair[Math.floor(Math.random() * pair.length)];
    setCurrentPair(pair);
    setTargetWord(target);
    setFeedback(null);
    playAudio(target);
  };

  useEffect(() => {
    nextRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const handleGuess = (guess) => {
    if (feedback) return;
    const isCorrect = guess === targetWord;
    if (isCorrect) setScore((s) => s + 1);

    setFeedback({
      correct: isCorrect,
      text: isCorrect ? "✓ Parfait ! Bonne oreille." : `C'était "${targetWord}".`,
    });

    const newRound = round + 1;
    if (newRound >= 5) {
      const finalScore = isCorrect ? score + 1 : score;
      const accuracy = (finalScore / 5) * 100;
      saveScore(soundId, accuracy);
      if (accuracy >= 80) awardXP?.(20, 2, "Discrimination phonétique réussie");
      setTimeout(() => {
        setFeedback({
          correct: true,
          text: `Série terminée ! Score : ${finalScore}/5 (${accuracy}%).`,
        });
      }, 800);
    } else {
      setTimeout(() => {
        setRound(newRound);
        nextRound();
      }, 1200);
    }
  };

  return (
    <div
      style={{
        background: theme.cardBg,
        padding: 28,
        borderRadius: 18,
        border: `1px solid ${theme.border}`,
        textAlign: "center",
      }}
    >
      <h3 style={{ margin: "0 0 10px", color: theme.text, fontSize: 18 }}>Écoute et clique sur le mot prononcé</h3>
      <div style={{ marginBottom: 20, fontSize: 13, color: theme.textMuted }}>Essai {round + 1} / 5</div>

      <button
        onClick={() => playAudio(targetWord)}
        style={{
          width: 70,
          height: 70,
          borderRadius: "50%",
          background: theme.primary,
          color: "white",
          border: "none",
          fontSize: 26,
          cursor: "pointer",
          marginBottom: 28,
          boxShadow: `0 6px 20px ${theme.primary}55`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Volume2 size={32} />
      </button>

      <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
        {currentPair &&
          currentPair.map((w, idx) => (
            <button
              key={idx}
              onClick={() => handleGuess(w)}
              style={{
                padding: "16px 36px",
                fontSize: 22,
                fontWeight: 800,
                borderRadius: 14,
                border: "none",
                background: feedback
                  ? w === targetWord
                    ? "#22C55E"
                    : feedback.correct
                    ? theme.surface
                    : "#EF4444"
                  : theme.surface,
                color: feedback ? "white" : theme.text,
                cursor: feedback ? "default" : "pointer",
                transition: "all 0.2s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              {w}
            </button>
          ))}
      </div>

      {feedback && (
        <div
          style={{
            marginTop: 20,
            fontSize: 16,
            fontWeight: 800,
            color: feedback.correct ? "#22C55E" : "#EF4444",
          }}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}

// ── EXERCICE 2: PRONONCIATION CIBLÉE ─────────────────────────────────────────
function PronunciationExercise({ profile, soundId, playAudio, saveScore, theme, showToast, awardXP }) {
  const [listening, setListening] = useState(false);
  const [targetWord, setTargetWord] = useState("");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null);
  const recRef = useRef(null);

  const newWord = () => {
    let choices = profile.pairs ? profile.pairs.flat() : profile.words || [];
    if (choices.length === 0) return;
    setTargetWord(choices[Math.floor(Math.random() * choices.length)]);
    setResult(null);
    setTranscript("");
  };

  useEffect(() => {
    newWord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return showToast?.("Reconnaissance vocale non supportée", "error");

    if (recRef.current) recRef.current.stop();

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;

    rec.onresult = (e) => {
      const text = e.results[0][0].transcript.toLowerCase().trim();
      const cleanText = text.replace(/[.,!?]+$/, "");
      setTranscript(cleanText);

      const words = cleanText.split(/\s+/);
      if (words.includes(targetWord.toLowerCase()) || cleanText.includes(targetWord.toLowerCase())) {
        setResult("correct");
        saveScore(soundId, 100);
        awardXP?.(15, 1, "Prononciation réussie");
      } else {
        setResult("wrong");
        saveScore(soundId, 30);
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
    <div
      style={{
        background: theme.cardBg,
        padding: 28,
        borderRadius: 18,
        border: `1px solid ${theme.border}`,
        textAlign: "center",
      }}
    >
      <h3 style={{ margin: "0 0 10px", color: theme.text, fontSize: 18 }}>Prononce ce mot à voix haute</h3>
      <div
        style={{
          fontSize: 38,
          fontWeight: 900,
          color: theme.primary,
          letterSpacing: 1.5,
          margin: "24px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        {targetWord}
        <button
          onClick={() => playAudio(targetWord)}
          style={{
            background: "none",
            border: "none",
            color: theme.primary,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
          }}
          title="Écouter le modèle"
        >
          <Volume2 size={24} />
        </button>
      </div>

      <button
        onClick={startListening}
        style={{
          padding: "16px 36px",
          borderRadius: 100,
          border: "none",
          background: listening ? "#EF4444" : "linear-gradient(135deg, #10B981, #059669)",
          color: "white",
          fontSize: 16,
          fontWeight: 800,
          cursor: "pointer",
          transition: "all 0.2s",
          boxShadow: listening ? "0 4px 20px rgba(239,68,68,0.5)" : "0 4px 16px rgba(16,185,129,0.3)",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {listening ? <Square size={18} /> : <Mic size={20} />}
        {listening ? "Écoute en cours..." : "Cliquer et Prononcer"}
      </button>

      {transcript && (
        <div style={{ marginTop: 24, padding: 16, background: theme.surface, borderRadius: 14 }}>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>Tu as dit :</div>
          <div style={{ fontSize: 18, color: theme.text, fontWeight: 700 }}>"{transcript}"</div>

          {result === "correct" && (
            <div style={{ color: "#22C55E", fontWeight: 800, marginTop: 10, fontSize: 16 }}>
              ✨ Parfaitement reconnu !
            </div>
          )}
          {result === "wrong" && (
            <div style={{ color: "#EF4444", fontWeight: 800, marginTop: 10, fontSize: 14 }}>
              ❌ Entendu autre chose. Attention au son {profile.symbol}.<br />
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted }}>Tip : {profile.tip}</span>
            </div>
          )}
        </div>
      )}

      {result && (
        <button
          onClick={newWord}
          style={{
            marginTop: 20,
            padding: "10px 20px",
            background: theme.primary,
            color: "white",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Mot suivant ➡️
        </button>
      )}
    </div>
  );
}

// ── EXERCICE 3: PHRASES EN CONTEXTE ──────────────────────────────────────────
function PhrasesExercise({ profile, soundId, playAudio, callClaude, saveScore, theme, showToast, storage, awardXP }) {
  const [phrases, setPhrases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null);
  const recRef = useRef(null);

  useEffect(() => {
    if (storage?.get) {
      storage.get("accent_phrases_v2_" + soundId).then((saved) => {
        if (saved && saved.length > 0) setPhrases(saved);
      }).catch(() => {});
    }
  }, [storage, soundId]);

  const generatePhrases = async () => {
    setLoading(true);
    setPhrases([]);
    try {
      if (callClaude) {
        const prompt = `Génère 5 phrases courtes d'anglais conversationnel spécialement calibrées pour pratiquer le son ${profile.symbol} (${profile.title}).
Chaque phrase doit faire entre 6 et 12 mots et être très naturelle.
Retourne UNIQUEMENT un tableau JSON de strings. Exemple: ["They think that this is the best way.", "Three trees grew near the path."]`;

        const res = await callClaude(prompt, "Accent Phrases");
        const match = res.match(/\[([\s\S]*?)\]/);
        if (match) {
          const parsed = JSON.parse(`[${match[1]}]`);
          setPhrases(parsed);
          if (storage?.set) storage.set("accent_phrases_v2_" + soundId, parsed).catch(() => {});
          return;
        }
      }
      // Fallback
      setPhrases([
        `I think this is three times better than that.`,
        `They should've known about the issue earlier.`,
        `We need to focus on this problem together.`,
      ]);
    } catch {
      showToast?.("Erreur lors de la génération", "error");
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

      const targetWords = phrases[activeIdx].toLowerCase().replace(/[^\w\s']/g, "").split(/\s+/);
      const spokenWords = text.toLowerCase().replace(/[^\w\s']/g, "").split(/\s+/);

      let matched = 0;
      targetWords.forEach((tw) => {
        if (spokenWords.includes(tw)) matched++;
      });

      const accuracy = Math.round((matched / Math.max(1, targetWords.length)) * 100);
      setResult(accuracy);
      saveScore(soundId, accuracy);
      if (accuracy >= 70) awardXP?.(20, 2, "Phrase en contexte validée");
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
    <div style={{ background: theme.cardBg, padding: 28, borderRadius: 18, border: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>Phrases en contexte naturel</h3>
        <button
          onClick={generatePhrases}
          disabled={loading}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            background: theme.primary,
            color: "white",
            border: "none",
            cursor: loading ? "wait" : "pointer",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {loading ? "Génération..." : phrases.length > 0 ? "Générer à nouveau" : "Générer 5 phrases"}
        </button>
      </div>

      {phrases.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: theme.text,
              textAlign: "center",
              padding: 24,
              background: theme.surface,
              borderRadius: 14,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            "{phrases[activeIdx]}"
            <button
              onClick={() => playAudio(phrases[activeIdx])}
              style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer" }}
            >
              <Volume2 size={22} />
            </button>
          </div>

          <button
            onClick={startListening}
            style={{
              padding: "16px 36px",
              borderRadius: 100,
              border: "none",
              background: listening ? "#EF4444" : "linear-gradient(135deg, #10B981, #059669)",
              color: "white",
              fontSize: 16,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.2s",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {listening ? <Square size={18} /> : <Mic size={20} />}
            {listening ? "Écoute en cours..." : "Lire la phrase au micro"}
          </button>

          {transcript && (
            <div style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 12, color: theme.textMuted }}>Tu as dit :</div>
              <div style={{ fontSize: 16, color: theme.text, fontWeight: 700, marginTop: 4 }}>"{transcript}"</div>

              {result !== null && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 16,
                    fontWeight: 800,
                    color: result >= 80 ? "#22C55E" : result >= 50 ? "#F59E0B" : "#EF4444",
                  }}
                >
                  Précision : {result}%
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {phrases.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setActiveIdx(idx);
                  setResult(null);
                  setTranscript("");
                }}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  padding: 0,
                  border: "none",
                  cursor: "pointer",
                  background: activeIdx === idx ? theme.primary : theme.border,
                }}
                aria-label={`Phrase ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: 40, color: theme.textMuted }}>
          Clique sur "Générer 5 phrases" pour démarrer l'entraînement en contexte.
        </div>
      )}
    </div>
  );
}
