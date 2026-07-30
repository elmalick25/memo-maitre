// src/components/AudioPlayButton.jsx — Bouton Écouter God Mode
import React, { useState } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { playEnglishAudio } from "../lib/speakUtils";

export default function AudioPlayButton({
  text,
  size = "md", // "sm" | "md" | "lg"
  label = "Écouter",
  showLabel = true,
  style = {},
  isDarkMode = true,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(false);

  const handlePlay = (e) => {
    e.stopPropagation();
    if (isPlaying) {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    setError(false);

    const ok = playEnglishAudio(text, {
      onStart: () => setIsPlaying(true),
      onEnd: () => setIsPlaying(false),
      onError: () => {
        setIsPlaying(false);
        setError(true);
        setTimeout(() => setError(false), 2000);
      },
    });

    if (!ok) {
      setIsPlaying(false);
    }
  };

  const isSmall = size === "sm";
  const padding = isSmall ? "2px 6px" : "4px 10px";
  const fontSize = isSmall ? 11 : 12;
  const iconSize = isSmall ? 13 : 15;

  const bg = isPlaying
    ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
    : error
    ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
    : isDarkMode
    ? "linear-gradient(135deg, rgba(77,107,254,0.22) 0%, rgba(123,147,255,0.12) 100%)"
    : "linear-gradient(135deg, rgba(77,107,254,0.14) 0%, rgba(77,107,254,0.06) 100%)";

  const borderColor = isPlaying
    ? "rgba(16, 185, 129, 0.4)"
    : isDarkMode
    ? "rgba(123, 147, 255, 0.35)"
    : "rgba(77, 107, 254, 0.3)";

  const color = isPlaying || error ? "#FFFFFF" : isDarkMode ? "#B9C8FF" : "#4D6BFE";

  return (
    <button
      type="button"
      onClick={handlePlay}
      className="audio-play-btn"
      title={`Écouter la prononciation : ${text}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: bg,
        border: `1px solid ${borderColor}`,
        color: color,
        borderRadius: 20,
        padding: padding,
        fontSize: fontSize,
        fontWeight: 700,
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.23, 1, 0.32, 1)",
        boxShadow: isPlaying ? "0 0 12px rgba(16,185,129,0.5)" : "none",
        transform: isPlaying ? "scale(1.03)" : "none",
        verticalAlign: "middle",
        userSelect: "none",
        ...style,
      }}
    >
      {isPlaying ? (
        <Volume2 size={iconSize} className="animate-pulse" />
      ) : error ? (
        <VolumeX size={iconSize} />
      ) : (
        <Volume2 size={iconSize} />
      )}
      {showLabel && (
        <span>{isPlaying ? "En écoute…" : label}</span>
      )}
    </button>
  );
}
