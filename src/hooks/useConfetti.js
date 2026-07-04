// src/hooks/useConfetti.js
export default function useConfetti() {
  const fire = () => {
    if (window.confetti) {
      window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };
  return fire;
}