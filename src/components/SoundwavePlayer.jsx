import React, { useRef, useEffect } from "react";

const SoundwavePlayer = ({ src, isPlaying, onPlay, onPause, onEnded, color = "#EA580C" }) => {
  const audioRef = useRef(null);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      if (onPause) onPause();
    } else {
      audio.play().catch(() => {});
      if (onPlay) onPlay();
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isPlaying && !audio.paused) {
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
        onClick={handlePlayPause}
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

export default SoundwavePlayer;
