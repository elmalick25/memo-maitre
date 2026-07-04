import React, { useState, useEffect, useRef } from "react";

function playAlarm() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const playBeep = (time, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.5, time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + 0.5);
    };

    const now = ctx.currentTime;
    // Nice double chime sequence
    playBeep(now, 880);
    playBeep(now + 0.2, 880);
    playBeep(now + 0.6, 1046.50);
  } catch (e) {
    console.error("Audio API non supportée", e);
  }
}

export default function RoutineTimerOverlay({ timerInfo, onDismiss }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const timerId = useRef(null);
  
  useEffect(() => {
    if (!timerInfo) {
      setIsFinished(false);
      return;
    }
    
    // Convert duration (minutes) to seconds
    const totalSeconds = timerInfo.duration * 60;
    const targetTime = Date.now() + totalSeconds * 1000;
    
    setIsFinished(false);
    setTimeLeft(totalSeconds);
    
    const tick = () => {
      const remaining = Math.round((targetTime - Date.now()) / 1000);
      if (remaining <= 0) {
        setTimeLeft(0);
        setIsFinished(true);
        playAlarm();
        clearInterval(timerId.current);
      } else {
        setTimeLeft(remaining);
      }
    };
    
    timerId.current = setInterval(tick, 1000);
    
    return () => clearInterval(timerId.current);
  }, [timerInfo]);
  
  if (!timerInfo) return null;
  
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  // Si terminé, on affiche un message d'alerte complet
  if (isFinished) {
    return (
      <div style={{
        position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
        background: "linear-gradient(135deg, #10B981, #059669)",
        color: "white", padding: "20px 30px", borderRadius: 24,
        boxShadow: "0 20px 40px rgba(16,185,129,0.4)", zIndex: 9999,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        animation: "fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)"
      }}>
        <div style={{ fontSize: 32 }}>🔔</div>
        <div style={{ fontWeight: 900, fontSize: 20 }}>Temps écoulé !</div>
        <div style={{ fontSize: 14, opacity: 0.9, textAlign: "center", maxWidth: 250 }}>
          L'étape <strong>{timerInfo.label}</strong> est terminée.
        </div>
        <button 
          onClick={onDismiss}
          style={{
            marginTop: 10, background: "white", color: "#059669",
            border: "none", padding: "10px 20px", borderRadius: 12,
            fontWeight: 800, cursor: "pointer"
          }}
        >
          Fermer
        </button>
      </div>
    );
  }
  
  // En cours, affichage d'une mini-pilule flottante
  return (
    <div style={{
      position: "fixed", top: 20, right: 20,
      background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(12px)",
      color: "white", padding: "8px 16px", borderRadius: 30,
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 9998,
      display: "flex", alignItems: "center", gap: 12,
      border: "1px solid rgba(255,255,255,0.1)",
      animation: "fadeUp 0.3s ease"
    }}>
      <div style={{ 
        width: 8, height: 8, borderRadius: "50%", 
        background: "#F59E0B", boxShadow: "0 0 8px #F59E0B",
        animation: "pulse 2s infinite"
      }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700, textTransform: "uppercase", maxWidth: 100, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {timerInfo.label}
        </span>
        <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1 }}>
          {formattedTime}
        </span>
      </div>
      <button 
        onClick={onDismiss}
        style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.5)",
          fontSize: 16, cursor: "pointer", marginLeft: 8
        }}
      >
        ×
      </button>
    </div>
  );
}
