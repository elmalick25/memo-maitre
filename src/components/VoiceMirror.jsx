import React from "react";

export function VoiceMirror({
  agent,
  transcript,
  onStop,
  onTerminateSession,
  theme,
  isDarkMode,
  targetExpressions = [],
}) {
  const isSpeaking = agent?.isSpeaking;
  const isConnected = agent?.status === "connected" || agent?.isNova;
  const isNova = agent?.isNova;
  const isNovaRecording = agent?.novaIsRecording;
  const isNovaLoading = agent?.novaIsLoading;

  const reversedTranscript = [...(transcript || [])].reverse();
  const lastUserMsg = reversedTranscript.find((m) => m.role === "user");
  const lastAgentMsg = reversedTranscript.find((m) => m.role === "agent");

  const cleanText = (text) => {
    if (!text) return "";
    return text.replace(/\[.*?\]|\*.*?\*|\(.*?\)/g, "").trim();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: isDarkMode
          ? "radial-gradient(circle at center, var(--mm-bg-elev), var(--mm-bg))"
          : "radial-gradient(circle at center, var(--mm-bg-elev), var(--mm-border))",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {targetExpressions && targetExpressions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 30,
            left: 30,
            zIndex: 20,
            background: isDarkMode ? "rgba(30, 41, 59, 0.7)" : "rgba(255, 255, 255, 0.7)",
            backdropFilter: "blur(12px)",
            borderRadius: 16,
            padding: "20px",
            border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            width: 280,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 2,
              color: "#10B981",
              marginBottom: 12,
            }}
          >
            🎯 Missions de session
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {targetExpressions.map((ex) => {
              const isUsed = reversedTranscript.some(
                (m) => m.role === "user" && m.text.toLowerCase().includes(ex.front.toLowerCase())
              );
              return (
                <div key={ex.id || ex.front} style={{ display: "flex", alignItems: "flex-start", gap: 10, transition: "all 0.3s" }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: isUsed ? "#10B981" : isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontSize: 12,
                      transition: "all 0.5s",
                      boxShadow: isUsed ? "0 0 10px rgba(16,185,129,0.5)" : "none",
                    }}
                  >
                    {isUsed ? "✓" : ""}
                  </div>
                  <div style={{ opacity: isUsed ? 0.5 : 1, textDecoration: isUsed ? "line-through" : "none", transition: "all 0.3s" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: isDarkMode ? "#FFF" : "#000" }}>{ex.front}</div>
                    <div style={{ fontSize: 12, color: isDarkMode ? "#94A3B8" : "#64748B", marginTop: 2 }}>{ex.back}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Voice Display Area */}
      <div style={{ position: "relative", zIndex: 10, textAlign: "center", maxWidth: 800, padding: "0 20px" }}>
        {lastUserMsg && (
          <div
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: isDarkMode ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)",
              marginBottom: 20,
              animation: "fadeUp 0.3s ease",
            }}
          >
            "{cleanText(lastUserMsg.text)}"
          </div>
        )}
        {lastAgentMsg && (
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: isDarkMode ? "#FFFFFF" : "#000000",
              lineHeight: 1.4,
              animation: "fadeUp 0.4s ease",
            }}
          >
            {cleanText(lastAgentMsg.text)}
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div style={{ position: "absolute", bottom: 60, zIndex: 10, display: "flex", gap: 20 }}>
        {isNova && (
          <button
            onClick={async () => {
              if (isNovaRecording) {
                const blob = await agent.novaStopRecording();
                if (blob) {
                  try {
                    const text = await agent.novaTranscribe(blob);
                    if (text && agent.onNovaTranscript) agent.onNovaTranscript(text);
                  } catch (e) {
                    console.error(e);
                  }
                }
              } else {
                await agent.novaStartRecording();
              }
            }}
            disabled={isNovaLoading && !isNovaRecording}
            style={{
              padding: "16px 36px",
              borderRadius: 100,
              border: `2px solid ${isNovaRecording ? "#EF4444" : "#10B981"}`,
              cursor: isNovaLoading && !isNovaRecording ? "wait" : "pointer",
              background: isNovaRecording ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)",
              color: isNovaRecording ? "#EF4444" : "#10B981",
              fontWeight: 800,
              fontSize: 16,
              backdropFilter: "blur(10px)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: `0 10px 30px ${isNovaRecording ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)"}`,
              transition: "all 0.3s",
            }}
          >
            <span style={{ fontSize: 22, animation: isNovaRecording ? "pulse 1.5s infinite" : isNovaLoading ? "spin 2s linear infinite" : "none" }}>
              {isNovaRecording ? "🔴" : isNovaLoading ? "⏳" : "🎙️"}
            </span>
            {isNovaRecording ? "Terminer" : isNovaLoading ? "Transcription..." : "Parler à Nova"}
          </button>
        )}
        <button
          onClick={() => {
            if (onTerminateSession) onTerminateSession();
            onStop();
          }}
          style={{
            padding: "16px 36px",
            borderRadius: 100,
            border: `2px solid ${isDarkMode ? "rgba(148, 163, 184, 0.3)" : "rgba(100, 116, 139, 0.3)"}`,
            cursor: "pointer",
            background: isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)",
            color: isDarkMode ? "var(--mm-border)" : "var(--mm-fg)",
            fontWeight: 800,
            fontSize: 16,
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 10px 30px color-mix(in srgb, var(--mm-primary) 10.0%, transparent)",
            transition: "all 0.3s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isDarkMode ? "rgba(71, 85, 105, 0.6)" : "rgba(203, 213, 225, 0.6)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isDarkMode ? "var(--mm-bg-elev)" : "var(--mm-bg-elev)";
          }}
        >
          <span style={{ fontSize: 22 }}>📝</span> Mode Texte
        </button>
        <button
          onClick={() => {
            if (onTerminateSession) onTerminateSession();
            onStop();
          }}
          style={{
            padding: "16px 36px",
            borderRadius: 100,
            border: "2px solid rgba(239, 68, 68, 0.3)",
            cursor: "pointer",
            background: "rgba(239, 68, 68, 0.15)",
            color: "#EF4444",
            fontWeight: 800,
            fontSize: 16,
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 10px 30px rgba(239, 68, 68, 0.2)",
            transition: "all 0.3s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#EF4444";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
            e.currentTarget.style.color = "#EF4444";
          }}
        >
          <span style={{ fontSize: 22 }}>⏹️</span> Terminer l'Ascension
        </button>
      </div>

      <style>{`
        @keyframes spin { 100% { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes pulse { 0% { transform: scale(1); } 100% { transform: scale(1.08); } }
        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default VoiceMirror;
