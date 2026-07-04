// src/hooks/useAudioFeedback.js
import { useRef } from "react";

export default function useAudioFeedback() {
  const audioCtxRef = useRef(null);
  const getCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };
  const playTone = (freq, type, duration) => {
    const ctx = getCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  };
  const playCorrect = () => playTone(800, "sine", 0.15);
  const playHard = () => playTone(400, "triangle", 0.2);
  const playAgain = () => playTone(200, "sawtooth", 0.3);
  return { playCorrect, playHard, playAgain };
}