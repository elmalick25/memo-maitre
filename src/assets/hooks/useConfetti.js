// src/hooks/useConfetti.js
export const useConfetti = () => {
  return () => {
    if (window.confetti) {
      window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };
};