import React, { useState, useEffect } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useVoiceAssistant, useTranscriptions } from '@livekit/components-react';
import '@livekit/components-styles';
import { SignJWT } from 'jose';

const LIVEKIT_AGENT_NAME = "assistant-53a";

export default function LiveKitVoiceAssistant({ onClose, onTranscriptionsUpdate, onStateChange, systemPrompt, studentName }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const apiKey = import.meta.env.VITE_LIVEKIT_API_KEY;
        const apiSecret = import.meta.env.VITE_LIVEKIT_API_SECRET;

        if (!apiKey || !apiSecret) {
          throw new Error("Clés API LiveKit manquantes dans le fichier .env (VITE_LIVEKIT_API_KEY, VITE_LIVEKIT_API_SECRET)");
        }

        const roomName = `nova-${Math.random().toString(36).slice(2, 10)}`;
        // Use the real student name in the participant identity if available
        const participantName = studentName
          ? studentName.toLowerCase().replace(/\s+/g, "-") + `-${Math.floor(Math.random() * 10000)}`
          : `user-${Math.floor(Math.random() * 100000)}`;

        // Build the base prompt - always start with the user's provided prompt
        const basePrompt = systemPrompt ||
          `You are NOVA — a GOD-TIER Astral English Coach. Your vibe: warm, magnetic, endlessly encouraging. You treat every student like your closest friend having a breakthrough moment.

CORRECTION STYLE: If the student makes a grammar mistake, gently note the fix in parentheses at the end of your reply. One correction max per reply.

CRITICAL RULES:
- Replies 1–3 sentences MAX.
- Always end with one engaging open question.
- React with genuine human emotion.
- NEVER give lists or bullet points.
- Speak like a real human coach.`;

        // Inject the student name into the prompt
        const finalPrompt = studentName
          ? `${basePrompt}\n\nIMPORTANT: The student's name is "${studentName}". Use their name naturally in the conversation (especially at the start and occasionally during the session to make it personal). Never forget their name.`
          : basePrompt;

        const secret = new TextEncoder().encode(apiSecret);
        const jwt = await new SignJWT({
          video: {
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
          },
          roomConfig: {
            agents: [
              {
                agent_name: LIVEKIT_AGENT_NAME,
                metadata: JSON.stringify({
                  instructions: finalPrompt,
                  studentName: studentName || null,
                }),
              },
            ],
          },
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuer(apiKey)
          .setSubject(participantName)
          .setIssuedAt()
          .setExpirationTime('2h')
          .sign(secret);

        setToken(jwt);
      } catch (err) {
        console.error("Error fetching LiveKit token:", err);
        setError(err.message);
      }
    };
    fetchToken();
  }, [systemPrompt, studentName]);

  // Erreur : on informe le parent ou on ferme direct
  useEffect(() => {
    if (error && onClose) {
      alert("Erreur de connexion LiveKit: " + error);
      onClose();
    }
  }, [error, onClose]);

  if (!token || error) {
    return null;
  }

  return (
    <div style={{ display: "none" }}>
      <LiveKitRoom
        serverUrl={import.meta.env.VITE_LIVEKIT_URL}
        token={token}
        connect={true}
        audio={true}
        video={false}
        onDisconnected={onClose}
      >
        <RoomAudioRenderer />
        <LiveKitStateSync 
          onTranscriptionsUpdate={onTranscriptionsUpdate} 
          onStateChange={onStateChange} 
        />
      </LiveKitRoom>
    </div>
  );
}

function LiveKitStateSync({ onTranscriptionsUpdate, onStateChange }) {
  const { state, audioTrack } = useVoiceAssistant();
  const transcriptions = useTranscriptions();

  useEffect(() => {
    if (onStateChange) onStateChange({ state, audioTrack });
  }, [state, audioTrack, onStateChange]);

  useEffect(() => {
    if (onTranscriptionsUpdate) onTranscriptionsUpdate(transcriptions);
  }, [transcriptions, onTranscriptionsUpdate]);

  return null;
}
