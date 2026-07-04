import React, { useState, useEffect, useRef } from "react";

// ── UTILITAIRES ─────────────────────────────────────────────────────────────
function safeParseJSON(str) {
  let s = str.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* ignore */ }
  const trimmed = s.replace(/,\s*$/, "");
  const repaired = trimmed.trimStart().startsWith("[")
    ? trimmed.replace(/([^\]])\s*$/, "$1]")
    : trimmed.replace(/([^}])\s*$/, "$1}");
  try { return JSON.parse(repaired); } catch { /* ignore */ }
  throw new Error("JSON invalide");
}

// ── TYPES DE DÉFIS ─────────────────────────────────────────────────────────
const CHALLENGES = [
  {
    id: "word_combo",
    title: "Word Combo",
    icon: "🧩",
    desc: "Utilise ces 5 mots dans UNE seule phrase.",
    timeLimit: 45,
    generator: () => "Mots à utiliser : ancient, whisper, collapse, inevitable, mirror.",
    promptTarget: "Word Combo",
  },
  {
    id: "forbidden_word",
    title: "Forbidden Word",
    icon: "🚫",
    desc: "Explique ton métier sans utiliser les mots interdits.",
    timeLimit: 30,
    generator: () => "Mots interdits : 'work', 'job', 'do', 'company', 'make'.",
    promptTarget: "Forbidden Word",
  },
  {
    id: "synonym_sprint",
    title: "Synonyme Sprint",
    icon: "⚡",
    desc: "Donne 5 synonymes pour un mot donné.",
    timeLimit: 20,
    generator: () => "Mot cible : 'happy'.",
    promptTarget: "Synonyme Sprint",
  },
  {
    id: "translation_trap",
    title: "Translation Trap",
    icon: "🪤",
    desc: "Traduis une expression idiomatique française en anglais natif.",
    timeLimit: 25,
    generator: () => "Expression : 'Il pleut des cordes'.",
    promptTarget: "Translation Trap",
  },
  {
    id: "grammar_duel",
    title: "Grammar Duel",
    icon: "⚔️",
    desc: "Corrige cette phrase avec l'anglais le plus naturel possible.",
    timeLimit: 20,
    generator: () => "Phrase : 'Yesterday I have went to the cinema for watching a movie.'",
    promptTarget: "Grammar Duel",
  },
  {
    id: "story_chain",
    title: "Story Chain",
    icon: "📖",
    desc: "Ping-pong avec Claude. Alterne 3 phrases pour créer une histoire.",
    timeLimit: 60, // 60s total pour l'utilisateur
    generator: () => "Claude commence : 'The old grandfather clock in the hallway struck thirteen.'",
    promptTarget: "Story Chain",
    isChain: true,
  },
  {
    id: "pronunciation_battle",
    title: "Pronunciation Battle",
    icon: "🎙️",
    desc: "Lis cette phrase complexe à voix haute sans trébucher.",
    timeLimit: 15,
    generator: () => "Phrase : 'The sixth sick sheik's sixth sheep's sick.'",
    promptTarget: "Pronunciation Battle",
    requiresAudio: true,
  }
];

export default function BattleMode({ callClaude, storage, showToast, theme, isDarkMode, addXP }) {
  // ── ÉTATS GLOBAUX ─────────────────────────────────────────────────────────
  const [stats, setStats] = useState({
    currentStreak: 0,
    longestStreak: 0,
    totalWins: 0,
    totalLosses: 0,
    bestScores: {},
    badges: []
  });

  const [activeChallenge, setActiveChallenge] = useState(null); // definition
  const [challengeData, setChallengeData] = useState("");       // generated prompt
  const [phase, setPhase] = useState("select");                 // select | play | eval | result
  const [result, setResult] = useState(null);

  // ── ÉTATS DE JEU ──────────────────────────────────────────────────────────
  const [userInput, setUserInput] = useState("");
  const [chainHistory, setChainHistory] = useState([]); // for story chain
  const [isRecording, setIsRecording] = useState(false);

  // ── TIMER (Haute perf, sans re-render) ────────────────────────────────────
  const timerDisplayRef = useRef(null);
  const timeRemainingRef = useRef(0);
  const rAFRef = useRef(null);
  const lastTimeRef = useRef(0);

  // ── CHARGEMENT STATS ──────────────────────────────────────────────────────
  useEffect(() => {
    if (storage?.get) {
      storage.get("battle_stats_v1").then(s => {
        if (s) setStats(s);
      }).catch(()=>{ /* ignore */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    if (storage?.set) storage.set("battle_stats_v1", newStats).catch(()=>{ /* ignore */ });
  };

  // ── LOGIQUE TIMER ─────────────────────────────────────────────────────────
  const startTimer = (seconds) => {
    timeRemainingRef.current = seconds;
    // eslint-disable-next-line react-hooks/purity
    lastTimeRef.current = performance.now();
    
    const updateTimer = (currentTime) => {
      if (phase !== "play") return; // Arrêt propre
      
      const deltaTime = (currentTime - lastTimeRef.current) / 1000;
      lastTimeRef.current = currentTime;
      timeRemainingRef.current = Math.max(0, timeRemainingRef.current - deltaTime);
      
      if (timerDisplayRef.current) {
        timerDisplayRef.current.innerText = timeRemainingRef.current.toFixed(1) + "s";
        if (timeRemainingRef.current <= 5) {
          timerDisplayRef.current.style.color = "#EF4444";
          timerDisplayRef.current.style.transform = `scale(${1 + (5 - timeRemainingRef.current)*0.05})`;
        } else {
          timerDisplayRef.current.style.color = theme.text;
          timerDisplayRef.current.style.transform = "scale(1)";
        }
      }

      if (timeRemainingRef.current > 0) {
        rAFRef.current = requestAnimationFrame(updateTimer);
      } else {
        handleTimeUp();
      }
    };
    
    rAFRef.current = requestAnimationFrame(updateTimer);
  };

  const stopTimer = () => {
    if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
  };

  const handleTimeUp = () => {
    stopTimer();
    showToast?.("⏰ Temps écoulé !", "info");
    submitAnswer();
  };

  // ── DÉMARRER DÉFI ─────────────────────────────────────────────────────────
  const startChallenge = (challenge) => {
    // eslint-disable-next-line react-hooks/purity
    const c = challenge === "random" ? CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)] : challenge;
    setActiveChallenge(c);
    
    const data = c.generator();
    setChallengeData(data);
    setUserInput("");
    setChainHistory(c.isChain ? [{ role: "claude", content: data }] : []);
    
    setPhase("play");
    setResult(null);
    
    // Auto start timer
    setTimeout(() => startTimer(c.timeLimit), 100);
  };

  // ── SOUMETTRE RÉPONSE ─────────────────────────────────────────────────────
  const submitAnswer = async (forceSubmit = false) => {
    if (!userInput.trim() && !forceSubmit) return;
    
    if (activeChallenge.isChain && !forceSubmit) {
      // Logique Story Chain (tour par tour)
      const newHistory = [...chainHistory, { role: "user", content: userInput }];
      setUserInput("");
      
      if (newHistory.length >= 5) { // Claude -> User -> Claude -> User -> Claude
        stopTimer();
        evaluateAnswer(newHistory);
      } else {
        // Pause timer pendant réponse Claude
        const savedTime = timeRemainingRef.current;
        stopTimer();
        setPhase("eval");
        try {
          const prompt = `Continue cette histoire en 1 phrase courte : ${newHistory.map(m => m.content).join(" ")}`;
          const reply = await callClaude(prompt, "Story Chain Reply");
          newHistory.push({ role: "claude", content: reply });
          setChainHistory(newHistory);
          setPhase("play");
          startTimer(savedTime); // Resume
        } catch {
          showToast?.("Erreur IA", "error");
          setPhase("select");
        }
      }
      return;
    }

    stopTimer();
    evaluateAnswer(userInput);
  };

  const evaluateAnswer = async (answerPayload) => {
    setPhase("eval");
    
    let answerStr = typeof answerPayload === "string" ? answerPayload : answerPayload.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join("\n");
    
    const prompt = `Évalue cette réponse au défi '${activeChallenge.promptTarget}' :
Défi : ${challengeData}
Réponse : ${answerStr}

Retourne UNIQUEMENT ce JSON valide (sois strict, un native speaker aurait minimum 80) :
{
  "score": 0-100,
  "passed": true/false (true si score >= 70),
  "feedback": "...",
  "nativeAlternative": "...",
  "xpEarned": 0-150
}`;

    try {
      const raw = await callClaude(prompt, "Battle Eval");
      const res = safeParseJSON(raw);
      handleResult(res);
    } catch (error) {
      console.error(error);
      showToast?.("Erreur lors de l'évaluation.", "error");
      setPhase("select");
    }
  };

  const handleResult = (res) => {
    setResult(res);
    setPhase("result");

    const newStats = { ...stats };
    if (res.passed) {
      newStats.currentStreak += 1;
      newStats.longestStreak = Math.max(newStats.longestStreak, newStats.currentStreak);
      newStats.totalWins += 1;
      
      if (!newStats.bestScores[activeChallenge.id] || res.score > newStats.bestScores[activeChallenge.id]) {
        newStats.bestScores[activeChallenge.id] = res.score;
      }

      // Check badges
      if (newStats.currentStreak >= 10 && !newStats.badges.includes("Word Warrior")) {
        newStats.badges.push("Word Warrior");
        showToast?.("🏆 BADGE DÉBLOQUÉ : Word Warrior !", "success");
      }

      if (addXP) {
        let xp = res.xpEarned || 50;
        if (newStats.currentStreak >= 3) xp = Math.round(xp * 1.5);
        if (newStats.currentStreak >= 10) xp = Math.round(xp * 2.0);
        addXP(xp, "Battle Won");
      }
    } else {
      newStats.currentStreak = 0;
      newStats.totalLosses += 1;
    }

    saveStats(newStats);
  };

  // ── SPEECH RECOGNITION ────────────────────────────────────────────────────
  const toggleRecording = () => {
    if (isRecording) {
      window.speechRecognitionInstance?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast?.("Reconnaissance vocale non supportée par ton navigateur.", "error");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setUserInput(prev => (prev + " " + finalTranscript).trim());
      }
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognition.start();
    window.speechRecognitionInstance = recognition;
    setIsRecording(true);
  };

  useEffect(() => {
    return () => {
      stopTimer();
      window.speechRecognitionInstance?.stop();
    };
  }, []);

  // ── STYLES ────────────────────────────────────────────────────────────────
  const cardStyle = { background: theme.cardBg, borderRadius: 20, padding: 24, border: `1px solid ${theme.border}` };
  const btnStyle = (bg, disabled=false) => ({
    padding: "12px 20px", background: disabled ? (isDarkMode ? "#1F1F1F" : "#E5E7EB") : bg, color: disabled ? theme.textMuted : "white",
    border: "none", borderRadius: 14, fontWeight: 800, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.2s"
  });

  // ── RENDU ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 60 }}>
      {/* ANIMATIONS CSS PURES */}
      <style>{`
        @keyframes battleWin { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes battleLose { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-10px); } 40%, 80% { transform: translateX(10px); } }
        @keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(77,107,254,0.4); } 70% { box-shadow: 0 0 0 15px rgba(77,107,254,0); } 100% { box-shadow: 0 0 0 0 rgba(77,107,254,0); } }
      `}</style>

      {/* HEADER STREAK */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, padding: "16px 24px", background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(77,107,254,0.1))", borderRadius: 20, border: `1px solid ${theme.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32 }}>{stats.currentStreak >= 10 ? "🏆" : stats.currentStreak >= 5 ? "⚡" : stats.currentStreak >= 3 ? "🔥" : "⚔️"}</div>
          <div>
            <div style={{ fontWeight: 900, color: theme.text, fontSize: 18 }}>Streak: {stats.currentStreak}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Record: {stats.longestStreak}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800, color: theme.text, fontSize: 16 }}>{stats.totalWins} Victoires</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>Ratio W/L: {stats.totalLosses ? (stats.totalWins / stats.totalLosses).toFixed(1) : stats.totalWins}</div>
        </div>
      </div>

      {phase === "select" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {CHALLENGES.map(c => (
            <div key={c.id} onClick={() => startChallenge(c)} style={{ ...cardStyle, cursor: "pointer", transition: "transform 0.2s, boxShadow 0.2s", ":hover": { transform: "translateY(-4px)" } }} className="hov">
              <div style={{ fontSize: 36, marginBottom: 12 }}>{c.icon}</div>
              <div style={{ fontWeight: 900, fontSize: 16, color: theme.text, marginBottom: 8 }}>{c.title}</div>
              <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.4 }}>{c.desc}</div>
              <div style={{ marginTop: 12, fontSize: 11, fontWeight: 800, color: "#4D6BFE", background: "rgba(77,107,254,0.1)", display: "inline-block", padding: "4px 8px", borderRadius: 6 }}>⏱️ {c.timeLimit}s</div>
            </div>
          ))}
          <div onClick={() => startChallenge("random")} style={{ ...cardStyle, background: "linear-gradient(135deg, #4D6BFE, #3451D1)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white" }} className="hov">
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎲</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Défi Aléatoire</div>
          </div>
        </div>
      )}

      {phase === "play" && activeChallenge && (
        <div style={{ ...cardStyle, border: "2px solid #4D6BFE50", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 4, background: "rgba(255,255,255,0.1)" }}>
             {/* Progression barre animée CSS possible ici, mais timer num gère déjà l'urgence */}
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>{activeChallenge.icon}</span>
              <span style={{ fontWeight: 900, fontSize: 18, color: theme.text }}>{activeChallenge.title}</span>
            </div>
            {/* TIMER HAUTE PERFORMANCE */}
            <div ref={timerDisplayRef} style={{ fontSize: 32, fontWeight: 900, fontFamily: "monospace", transition: "color 0.3s" }}>
              {activeChallenge.timeLimit.toFixed(1)}s
            </div>
          </div>

          <div style={{ padding: 20, background: isDarkMode ? "rgba(77,107,254,0.2)" : "var(--mm-bg-elev)", borderRadius: 16, marginBottom: 20, fontSize: 16, color: theme.text, lineHeight: 1.6, fontWeight: 600 }}>
            {activeChallenge.isChain ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {chainHistory.map((msg, i) => (
                  <div key={i} style={{ padding: 12, borderRadius: 12, background: msg.role === "claude" ? "rgba(77,107,254,0.1)" : "rgba(16,185,129,0.1)", alignSelf: msg.role === "claude" ? "flex-start" : "flex-end", maxWidth: "80%", border: `1px solid ${msg.role === "claude" ? "#4D6BFE30" : "#10B98130"}` }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: msg.role === "claude" ? "#4D6BFE" : "#10B981", marginBottom: 4 }}>{msg.role.toUpperCase()}</div>
                    {msg.content}
                  </div>
                ))}
              </div>
            ) : challengeData}
          </div>

          <div style={{ position: "relative" }}>
            <textarea
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAnswer(); } }}
              placeholder="Tape ta réponse ici..."
              rows={4}
              style={{ width: "100%", padding: "16px 16px 16px 50px", borderRadius: 16, border: `2px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 15, outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
            <button 
              onClick={toggleRecording}
              style={{ position: "absolute", left: 12, top: 16, background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: isRecording ? "#EF4444" : theme.textMuted, animation: isRecording ? "pulseGlow 1.5s infinite" : "none" }}
            >
              🎤
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => submitAnswer()} disabled={!userInput.trim()} style={btnStyle("#4D6BFE", !userInput.trim())}>
              Envoyer 🚀
            </button>
          </div>
        </div>
      )}

      {phase === "eval" && (
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, animation: "bounce 1s infinite" }}>⚖️</div>
          <div style={{ fontWeight: 900, fontSize: 20, color: theme.text, marginTop: 16 }}>Claude évalue ta réponse...</div>
        </div>
      )}

      {phase === "result" && result && (
        <div style={{ ...cardStyle, animation: result.passed ? "battleWin 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)" : "battleLose 0.4s ease", border: `3px solid ${result.passed ? "#10B981" : "#EF4444"}`, textAlign: "center", position: "relative", overflow: "hidden" }}>
          
          <div style={{ fontSize: 80, marginBottom: 16 }}>{result.passed ? "🎉" : "💀"}</div>
          <div style={{ fontWeight: 900, fontSize: 32, color: result.passed ? "#10B981" : "#EF4444", marginBottom: 8 }}>
            {result.passed ? "VICTOIRE !" : "DÉFAITE..."}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: theme.text, marginBottom: 24 }}>Score: {result.score}/100</div>

          <div style={{ padding: 20, background: isDarkMode ? "rgba(77,107,254,0.2)" : "var(--mm-bg-elev)", borderRadius: 16, marginBottom: 20, textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Feedback de Claude</div>
            <div style={{ fontSize: 15, color: theme.text, lineHeight: 1.6 }}>{result.feedback}</div>
            
            {result.nativeAlternative && (
              <div style={{ marginTop: 16, padding: 12, background: "rgba(77,107,254,0.1)", borderLeft: "4px solid #4D6BFE", borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#4D6BFE", marginBottom: 4 }}>ALTERNATIVE NATIVE</div>
                <div style={{ fontSize: 14, color: theme.text, fontStyle: "italic" }}>{result.nativeAlternative}</div>
              </div>
            )}
          </div>

          <button onClick={() => setPhase("select")} style={{ ...btnStyle("#4D6BFE"), width: "100%", padding: 16, fontSize: 16 }}>
            Continuer la bataille ⚔️
          </button>
        </div>
      )}

    </div>
  );
}
