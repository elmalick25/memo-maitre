// src/components/AudioPlayButton.jsx — Bouton Écouter God Mode
import React, { useState } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { playEnglishAudio, extractEnglishSpeechText, stopEnglishAudio } from "../lib/speakUtils";

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

  // 🛡️ Garde-fou strict anti-français : n'affiche le bouton QUE s'il y a de l'anglais réel
  const speechText = extractEnglishSpeechText(text);
  if (!speechText) return null;

  const handlePlay = (e) => {
    e.stopPropagation();
    if (isPlaying) {
      stopEnglishAudio();
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    setError(false);

    const ok = playEnglishAudio(speechText, {
      raw: true,
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
  const iconSize = isSmall ? 12 : 14;

  const bg = isPlaying
    ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
    : error
    ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
    : isDarkMode
    ? "rgba(192, 132, 252, 0.14)"
    : "color-mix(in srgb, var(--mm-primary) 12.0%, transparent)";

  const borderColor = isPlaying
    ? "rgba(16, 185, 129, 0.5)"
    : isDarkMode
    ? "rgba(192, 132, 252, 0.3)"
    : "color-mix(in srgb, var(--mm-primary) 24.0%, transparent)";

  const color = isPlaying || error ? "#FFFFFF" : isDarkMode ? "color-mix(in srgb, var(--mm-primary) 22%, white)" : "var(--mm-primary)";

  const btnDimension = isSmall ? 22 : 26;

  return (
    <button
      type="button"
      onClick={handlePlay}
      className="audio-play-btn"
      title={`Écouter la prononciation : ${text}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: showLabel ? 6 : 0,
        background: bg,
        border: `1px solid ${borderColor}`,
        color: color,
        borderRadius: showLabel ? 20 : "50%",
        width: showLabel ? "auto" : btnDimension,
        height: showLabel ? "auto" : btnDimension,
        minWidth: showLabel ? "auto" : btnDimension,
        minHeight: showLabel ? "auto" : btnDimension,
        maxWidth: showLabel ? "none" : btnDimension,
        maxHeight: showLabel ? "none" : btnDimension,
        padding: showLabel ? (isSmall ? "2px 8px" : "4px 10px") : 0,
        fontSize: isSmall ? 11 : 12,
        fontWeight: 700,
        cursor: "pointer",
        transition: "all 0.18s cubic-bezier(0.23, 1, 0.32, 1)",
        boxShadow: isPlaying ? "0 0 10px rgba(16,185,129,0.4)" : "none",
        transform: isPlaying ? "scale(1.08)" : "none",
        verticalAlign: "middle",
        userSelect: "none",
        flexShrink: 0,
        lineHeight: 1,
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
