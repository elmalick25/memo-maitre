import React from "react";
import AgentPanel from "./AgentPanel";

export default function AppStatusBar({
  isDarkMode = false,
  setIsDarkMode = () => {},
  theme = {},
  appSessionTime = 0,
  expressions = [],
  repairSyncNow = async () => {},
  showToast = () => {},
  showLofiPlayer = false,
  setShowLofiPlayer = () => {},
  lofiPlaying = false,
  setLofiPlaying = () => {},
  lofiVolume = 0.5,
  setLofiVolume = () => {},
  lofiStation = 0,
  setLofiStation = () => {},
  currentTrack = null,
  downloadedIds = [],
  dlProgress = {},
  dlAllProgress = null,
  isOnline = true,
  offlineSize = 0,
  handleDownloadAll = () => {},
  handleDownloadTrack = () => {},
  handleDeleteTrack = () => {},
  totalPlaylistBytes = () => 0,
  formatBytes = (b) => `${b} B`,
  FOCUS_PLAYLIST = [],
  OFFLINE_TRACKS = [],
  CATEGORY_LABELS = {},
  showAgentPanel = false,
  setShowAgentPanel = () => {},
  buildAgentContext = () => ({}),
  runAgentTool = async () => {},
  agentAsk = async () => {},
  isPomoActive = false,
  setIsPomoActive = () => {},
  pomoTime = 1500,
  zenFocusMode = false,
  setZenFocusMode = () => {},
}) {
  return (
    <footer
      className="hide-mobile"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 26,
        zIndex: 9999,
        background: "var(--mm-bg-elev)",
        borderTop: `1px solid ${isDarkMode ? "var(--mm-border-strong)" : "var(--mm-border)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        color: isDarkMode ? "var(--mm-fg-muted)" : "var(--mm-fg)",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", gap: 20, alignItems: "center", height: "100%" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10 }}>{typeof navigator !== "undefined" && navigator.onLine ? "🟢" : "🟡"}</span> Firebase: {typeof navigator !== "undefined" && navigator.onLine ? "Sync" : "Offline"}
        </span>
        <span
          className="hov"
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          onClick={() => showToast("Sélecteur de modèle LLM à venir", "info")}
          title="Changer le modèle d'IA"
        >
          <span style={{ fontSize: 12 }}>🧠</span> LLM: Groq (Llama-3.3)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12 }}>⏱️</span> Session: {Math.floor(appSessionTime / 60)}m
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", height: "100%" }}>
        <span style={{ opacity: 0.6 }}>MémoMaître God Mode • {expressions.length} fiches</span>
        <button
          className="hov"
          title="Forcer la synchronisation : aligne cet appareil sur le serveur (supprime les fiches fantômes)"
          onClick={async () => {
            showToast("Réparation de la synchro en cours…", "info");
            const res = await repairSyncNow();
            if (res?.ok) {
              showToast(`Synchro OK — ${res.local} fiche(s)${res.remote != null ? ` (serveur : ${res.remote})` : ""}`, "success");
            } else {
              showToast("Réparation impossible : " + (res?.reason || "erreur inconnue"), "error");
            }
          }}
          style={{
            background: "none",
            border: `1px solid ${isDarkMode ? "#30363D" : "var(--mm-border)"}`,
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 700,
            color: "inherit",
            opacity: 0.75,
            cursor: "pointer",
          }}
        >
          🩺 Réparer la synchro
        </button>

        <div style={{ width: 1, height: 12, background: isDarkMode ? "#30363D" : "var(--mm-border)" }} />

        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {/* BOUTON ET POPUP LECTEUR AUDIO */}
          <div style={{ position: "relative" }}>
            {showLofiPlayer && (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 16px)",
                  right: -40,
                  width: 300,
                  maxHeight: "70vh",
                  overflowY: "auto",
                  background: isDarkMode ? "rgba(13,21,53,0.95)" : "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.15)" : "color-mix(in srgb, var(--mm-primary) 15.0%, transparent)"}`,
                  borderRadius: 20,
                  padding: 18,
                  boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  zIndex: 10000,
                  animation: "fadeUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: theme?.text || "#0F172A", letterSpacing: 1, textTransform: "uppercase" }}>RADIO FOCUS</span>
                  <button onClick={() => setShowLofiPlayer(false)} style={{ background: "none", border: "none", color: theme?.textMuted || "#64748B", cursor: "pointer", fontSize: 16 }}>✕</button>
                </div>

                {!isOnline && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", background: "rgba(245,158,11,0.12)", padding: "6px 10px", borderRadius: 8 }}>
                    📴 Hors-ligne — seules les pistes téléchargées sont lisibles.
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => setLofiPlaying(!lofiPlaying)}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))",
                      color: "white",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      boxShadow: "0 4px 12px color-mix(in srgb, var(--mm-primary) 40.0%, transparent)",
                    }}
                  >
                    {lofiPlaying ? "⏸" : "▶"}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: theme?.text || "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {currentTrack?.title}
                    </div>
                    <div style={{ fontSize: 11, color: lofiPlaying ? "#22C55E" : (theme?.textMuted || "#64748B"), fontWeight: 600, marginTop: 2 }}>
                      {lofiPlaying ? (currentTrack?.live ? "En direct…" : "Lecture en cours…") : "En pause"}
                      {!currentTrack?.live && downloadedIds.includes(currentTrack?.id) ? " • hors-ligne" : ""}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, background: isDarkMode ? "rgba(255,255,255,0.05)" : "color-mix(in srgb, var(--mm-primary) 5.0%, transparent)", padding: "8px 12px", borderRadius: 10 }}>
                  <span style={{ fontSize: 13 }}>🔉</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={lofiVolume}
                    onChange={(e) => setLofiVolume(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: theme?.highlight || "var(--mm-primary)", cursor: "pointer" }}
                  />
                </div>

                {/* Téléchargement global + espace utilisé */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    onClick={handleDownloadAll}
                    disabled={!isOnline || !!dlAllProgress}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.15)" : "color-mix(in srgb, var(--mm-primary) 20.0%, transparent)"}`,
                      background: "transparent",
                      color: theme?.text || "#0F172A",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: (!isOnline || dlAllProgress) ? "not-allowed" : "pointer",
                      opacity: (!isOnline || dlAllProgress) ? 0.5 : 1,
                    }}
                  >
                    {dlAllProgress ? `⬇️ Téléchargement ${dlAllProgress.index}/${dlAllProgress.total}…` : `⬇️ Télécharger toute la playlist (~${formatBytes(totalPlaylistBytes())})`}
                  </button>
                  <div style={{ fontSize: 10, color: theme?.textMuted || "#64748B", fontWeight: 600 }}>
                    {downloadedIds.length}/{OFFLINE_TRACKS.length} piste(s) hors-ligne • {formatBytes(offlineSize)} utilisés
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: theme?.textMuted || "#64748B", padding: "4px 2px" }}>
                    PISTES ({OFFLINE_TRACKS.length})
                  </div>
                  {FOCUS_PLAYLIST.map((station, idx) => {
                    const downloaded = downloadedIds.includes(station.id);
                    const progress = dlProgress[station.id];
                    const disabled = station.live ? !isOnline : (!isOnline && !downloaded);
                    const isLiveHeader = station.live && FOCUS_PLAYLIST[idx - 1] && !FOCUS_PLAYLIST[idx - 1].live;
                    return (
                      <div key={station.id}>
                        {isLiveHeader && (
                          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: theme?.textMuted || "#64748B", padding: "10px 2px 4px" }}>
                            RADIOS EN DIRECT (en ligne uniquement)
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: disabled ? 0.4 : 1 }}>
                          <button
                            disabled={disabled}
                            onClick={() => { if (disabled) return; setLofiStation(idx); setLofiPlaying(true); }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 10px",
                              borderRadius: 10,
                              background: lofiStation === idx ? (isDarkMode ? "rgba(255,255,255,0.1)" : "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)") : "transparent",
                              border: "none",
                              color: theme?.text || "#0F172A",
                              cursor: disabled ? "not-allowed" : "pointer",
                              textAlign: "left",
                              fontSize: 12,
                              fontWeight: 700,
                              transition: "background 0.2s",
                            }}
                          >
                            <span style={{ fontSize: 15 }}>{station.emoji}</span>
                            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {station.title}
                              <span style={{ display: "block", fontSize: 9, fontWeight: 600, color: theme?.textMuted || "#64748B" }}>
                                {CATEGORY_LABELS[station.category] || station.category}
                              </span>
                            </span>
                            {station.live && (
                              <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 0.5, color: "#EF4444", border: "1px solid #EF4444", borderRadius: 5, padding: "1px 4px" }}>EN DIRECT</span>
                            )}
                            {lofiStation === idx && lofiPlaying && <span style={{ color: theme?.highlight || "var(--mm-primary)", fontSize: 12 }}>♪</span>}
                          </button>
                          {!station.live && (
                            progress != null ? (
                              <div title="Téléchargement…" style={{ width: 34, height: 4, borderRadius: 3, background: isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)", overflow: "hidden", flexShrink: 0 }}>
                                <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: theme?.highlight || "var(--mm-primary)", transition: "width 0.2s" }} />
                              </div>
                            ) : (
                              <button
                                title={downloaded ? "Disponible hors-ligne — cliquer pour supprimer" : "Télécharger pour écouter hors-ligne"}
                                onClick={() => (downloaded ? handleDeleteTrack(station) : handleDownloadTrack(station))}
                                disabled={!downloaded && !isOnline}
                                style={{ background: "none", border: "none", cursor: (!downloaded && !isOnline) ? "not-allowed" : "pointer", fontSize: 13, padding: 2, flexShrink: 0 }}
                              >
                                {downloaded ? "✅" : "⬇️"}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button onClick={() => setShowLofiPlayer((p) => !p)} className="hov" style={{ background: "none", border: "none", color: lofiPlaying ? (theme?.highlight || "var(--mm-primary)") : "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }} title="Lecteur Audio">
              🎧 {lofiPlaying && <span style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 10, opacity: 0.8 }}><span style={{ width: 2, height: "60%", background: theme?.highlight || "var(--mm-primary)", animation: "pulse 0.8s infinite alternate" }} /><span style={{ width: 2, height: "100%", background: theme?.highlight || "var(--mm-primary)", animation: "pulse 0.8s infinite alternate 0.2s" }} /><span style={{ width: 2, height: "40%", background: theme?.highlight || "var(--mm-primary)", animation: "pulse 0.8s infinite alternate 0.4s" }} /></span>}
            </button>
          </div>

          {/* BOUTON ET POPUP ASSISTANT IA */}
          <div style={{ position: "relative" }}>
            <AgentPanel
              open={showAgentPanel}
              onClose={() => setShowAgentPanel(false)}
              variant="popup"
              theme={theme}
              isDarkMode={isDarkMode}
              getContext={buildAgentContext}
              runTool={runAgentTool}
              ask={agentAsk}
            />
            <button
              onClick={() => setShowAgentPanel((p) => !p)}
              className="hov robot-assistant-btn"
              style={{ background: "none", border: "none", color: showAgentPanel ? (theme?.highlight || "var(--mm-primary)") : "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              title="Assistant IA (⌘J)"
            >
              <span className="robot-assistant-icon">🤖</span>
            </button>
          </div>

          <button onClick={() => setIsPomoActive(!isPomoActive)} style={{ background: "none", border: "none", color: isPomoActive ? (theme?.highlight || "var(--mm-primary)") : "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: "bold" }}>
            ⏱ {Math.floor(pomoTime / 60)}:{String(pomoTime % 60).padStart(2, "0")}
          </button>

          <button onClick={() => setIsDarkMode((d) => !d)} className="hov" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", fontSize: 13 }} title="Mode Sombre/Clair">
            {isDarkMode ? "🌙" : "☀️"}
          </button>
          <button onClick={() => setZenFocusMode((z) => !z)} className="hov" style={{ background: "none", border: "none", color: zenFocusMode ? (theme?.highlight || "var(--mm-primary)") : "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", fontSize: 13 }} title="Mode Zen/Focus">
            👁️
          </button>
        </div>
      </div>
    </footer>
  );
}
