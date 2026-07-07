// ============================================================================
// LiveKitAgentBar.jsx — Placeholder pour l'agent vocal LiveKit + Gemini
// ============================================================================
// Ce composant remplacera à terme AgentVoiceBar (ElevenLabs). Pour l'instant
// il n'ouvre AUCUNE connexion : il affiche seulement l'état de configuration.
//
// Étapes d'intégration à venir :
//   1. `bun add @livekit/components-react livekit-client`
//   2. Créer un backend endpoint `/api/livekit/token` qui signe les JWT
//      avec LIVEKIT_API_KEY / LIVEKIT_API_SECRET (côté serveur uniquement).
//   3. Déployer un worker "voice agent" (Node ou Python) qui rejoint la room
//      LiveKit avec l'une des 3 clés Gemini réservées (livekitConfig.js).
//   4. Wrapper l'app dans <LiveKitRoom> ou instancier `Room` à la demande.
// ============================================================================

import { useMemo } from "react";
import {
  LIVEKIT_CONFIG,
  isLiveKitConfigured,
  getLiveKitGeminiKeys,
} from "../lib/livekitConfig";

export default function LiveKitAgentBar({ label = "Voice AI" } = {}) {
  const status = useMemo(() => {
    const configured = isLiveKitConfigured();
    const geminiKeysReady = getLiveKitGeminiKeys().filter(Boolean).length;
    if (!configured) return { color: "#b45309", text: "LiveKit non configuré (VITE_LIVEKIT_URL manquante)" };
    if (geminiKeysReady === 0) return { color: "#b45309", text: "Aucune clé Gemini réservée LiveKit" };
    return { color: "#047857", text: `Prêt (Gemini ×${geminiKeysReady}, model=${LIVEKIT_CONFIG.geminiModel})` };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999, fontSize: 12,
        fontFamily: "system-ui, sans-serif",
        background: "rgba(120, 120, 160, 0.10)",
        border: `1px solid ${status.color}33`,
        color: "inherit",
      }}
      title={status.text}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: status.color }} />
      🎙️ {label} — {status.text}
    </div>
  );
}
