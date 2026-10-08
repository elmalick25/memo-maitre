import { useState, useEffect } from "react";
import { getAudioObjectUrl } from "../lib/audioStore";
import SoundwavePlayer from "./SoundwavePlayer";

export default function AudioFichePlayer({ card }) {
  const [src, setSrc] = useState(card?.audioUrl || null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let revoked = null;
    let active = true;
    if (card?.audioUrl) {
      setSrc(card.audioUrl);
    } else if (card?.audioId) {
      getAudioObjectUrl(card.audioId).then((url) => {
        if (active && url) {
          setSrc(url);
          revoked = url;
        }
      });
    } else {
      setSrc(null);
    }
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [card?.audioUrl, card?.audioId]);

  if (!src) {
    if (card?.audioId) {
      return (
        <div style={{ marginTop: 16, fontSize: 12, color: "#EF4444", fontWeight: 700 }}>
          🎧 Audio introuvable (fichier perdu). Ré-importe la fiche audio depuis le Lab.
        </div>
      );
    }
    return null;
  }

  return (
    <div style={{ marginTop: 16, marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>
        🎧 Fiche audio — écoute puis évalue
      </div>
      <SoundwavePlayer
        src={src}
        isPlaying={isPlaying}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        color="var(--mm-primary)"
      />
    </div>
  );
}
