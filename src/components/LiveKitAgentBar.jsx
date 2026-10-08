// ============================================================================
// LiveKitAgentBar.jsx — Entrée vocale LiveKit unifiée
// ============================================================================
// Ce composant est strictement unifié avec AgentVoiceBar : il délègue à
// l'entrée vocale réelle connectée à <LiveKitVoiceAssistant /> pour éliminer
// toute ambiguïté de composant provisoire ou de faux bouton inerte.
// ============================================================================

import React from "react";
import AgentVoiceBar, {
  AGENT_VOICES,
  MODE_CONFIGS,
  useElevenLabsAgent,
  AgentSelector,
} from "../AgentVoiceBar";

export {
  AGENT_VOICES,
  MODE_CONFIGS,
  useElevenLabsAgent,
  AgentSelector,
};

export default function LiveKitAgentBar(props) {
  return <AgentVoiceBar {...props} />;
}
