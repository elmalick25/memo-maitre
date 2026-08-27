// AgentPanel.jsx — L'assistant IA de MémoMaître
// ─────────────────────────────────────────────────────────────────────────────
// Deux enveloppes, un seul cerveau :
//   variant="popup" → desktop, popup flottant façon "RADIO FOCUS" (footer)
//   variant="sheet" → mobile, bottom sheet plein écran moderne et réactif Jour / Nuit
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { buildAgentSystemPrompt, buildConversationPayload, suggestionsForView } from "../lib/appKnowledge";
import safeParseJSON from "../lib/jsonRepair";

const HISTORY_KEY = "mm_agent_history_v1";
const MAX_PERSISTED = 40;

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveHistory(messages) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_PERSISTED)));
  } catch { /* quota — on ignore */ }
}

export default function AgentPanel({
  open,
  onClose,
  variant = "popup",
  theme,
  isDarkMode = false,
  getContext,            // () => contexte live
  runTool,               // (tool, args) => string|void  — exécute l'action
  ask,                   // (systemPrompt, userMessage) => Promise<string>
}) {
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const ctx = open && typeof getContext === "function" ? getContext() : {};

  useEffect(() => { saveHistory(messages); }, [messages]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const stick = () => { el.scrollTop = el.scrollHeight; };
    stick();
    const raf = requestAnimationFrame(stick);
    const t = setTimeout(stick, 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = useCallback(async (raw) => {
    const text = (raw ?? "").trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setBusy(true);
    try {
      const live = typeof getContext === "function" ? getContext() : {};
      const system = buildAgentSystemPrompt(live);
      const payload = buildConversationPayload(messages, text);
      const answer = await ask(system, payload);
      const parsed = safeParseJSON(typeof answer === "string" ? answer : answer?.text || "");
      const reply = (parsed && parsed.reply) || (typeof answer === "string" ? answer : "") || "Je n'ai pas de réponse pour l'instant.";
      let done = null;
      if (parsed?.action?.tool && typeof runTool === "function") {
        done = runTool(parsed.action.tool, parsed.action.args || {});
      }
      setMessages((m) => [...m, { role: "assistant", content: reply, action: done || null }]);
    } catch (e) {
      setError(e?.message || "L'assistant est indisponible pour le moment.");
      setMessages((m) => [...m, { role: "assistant", content: "Je n'arrive pas à joindre le moteur IA. Réessaie dans un instant." }]);
    } finally {
      setBusy(false);
    }
  }, [messages, busy, ask, getContext, runTool]);

  if (!open) return null;

  const isSheet = variant === "sheet";
  const suggestions = suggestionsForView(ctx.view);

  const panelBg = isDarkMode ? "#12121c" : "#ffffff";
  const softBg = isDarkMode ? "#1c1c2b" : "#f1f5f9";
  const inputBgSolid = isDarkMode ? "#181826" : "#f8fafc";

  const sheetWrapperStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 12000,
    background: isDarkMode ? "rgba(10, 12, 20, 0.7)" : "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    fontFamily: "'Outfit', sans-serif",
    animation: "betaFadeIn 0.2s ease-out",
  };

  const containerStyle = isSheet
    ? {
        width: "100%",
        maxWidth: 540,
        height: "min(88dvh, 720px)",
        maxHeight: "88dvh",
        background: isDarkMode
          ? "linear-gradient(180deg, #10121e 0%, #151829 100%)"
          : "linear-gradient(180deg, #FFFFFF 0%, #FAF5FF 100%)",
        color: isDarkMode ? "#FFFFFF" : "#0F172A",
        borderRadius: "28px 28px 0 0",
        display: "flex",
        flexDirection: "column",
        border: isDarkMode
          ? "1.5px solid rgba(139, 92, 246, 0.3)"
          : "1.5px solid rgba(168, 85, 247, 0.25)",
        boxShadow: isDarkMode
          ? "0 -10px 40px rgba(0, 0, 0, 0.6)"
          : "0 -10px 40px rgba(124, 58, 237, 0.2)",
        overflow: "hidden",
      }
    : {
        position: "absolute",
        bottom: "calc(100% + 16px)",
        right: -40,
        width: 390,
        maxHeight: "72vh",
        background: panelBg,
        color: isDarkMode ? "#FFFFFF" : "#0F172A",
        border: isDarkMode ? "1.5px solid rgba(139, 92, 246, 0.3)" : "1.5px solid rgba(168, 85, 247, 0.25)",
        borderRadius: 22,
        boxShadow: isDarkMode ? "0 20px 50px rgba(0,0,0,0.6)" : "0 20px 50px rgba(124, 58, 237, 0.2)",
        display: "flex",
        flexDirection: "column",
        zIndex: 10000,
        overflow: "hidden",
        animation: "fadeUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      };

  const content = (
    <div style={containerStyle} role="dialog" aria-label="Assistant MémoMaître">
      {/* Poignée mobile */}
      {isSheet && (
        <div style={{
          width: "100%",
          paddingTop: 8,
          paddingBottom: 4,
          display: "flex",
          justifyContent: "center",
          background: isDarkMode
            ? "linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)"
            : "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
        }}>
          <div style={{
            width: 40, height: 4, borderRadius: 999,
            background: "rgba(255, 255, 255, 0.4)",
          }} />
        </div>
      )}

      {/* ── En-tête ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: "12px 18px 14px",
        background: isDarkMode
          ? "linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)"
          : "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
        borderBottom: isDarkMode ? "1px solid rgba(139, 92, 246, 0.25)" : "1px solid rgba(255, 255, 255, 0.25)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: "rgba(255, 255, 255, 0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0,
            boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
          }}>
            🤖
          </div>
          <div>
            <div style={{
              fontSize: 15, fontWeight: 900, letterSpacing: "-0.2px",
              color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              Assistant IA
            </div>
            <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.85)", fontWeight: 600 }}>
              Intelligence MémoMaître • En direct
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); setError(null); }}
              style={{
                background: "rgba(255, 255, 255, 0.2)",
                border: "none", color: "#FFFFFF",
                cursor: "pointer", fontSize: 11, fontWeight: 800,
                borderRadius: 999, padding: "5px 10px",
                transition: "background 0.2s ease",
              }}
              title="Effacer la conversation"
            >
              Effacer
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.2)",
              border: "none", color: "#FFFFFF",
              cursor: "pointer", fontSize: 16, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s ease",
            }}
            aria-label="Fermer l'assistant"
          >✕</button>
        </div>
      </div>

      {/* ── Conversation ── */}
      <div ref={listRef} className="mm-chat-scroll" style={{
        flex: 1, overflowY: "auto", padding: "16px 16px 8px",
        display: "flex", flexDirection: "column", gap: 10, minHeight: 0,
        maxHeight: "100%",
        background: isDarkMode ? "#090a12" : "#F8FAFC",
      }}>
        {messages.length === 0 && (
          <div style={{
            color: isDarkMode ? "#94a3b8" : "#64748b",
            fontSize: 13, lineHeight: 1.5, textAlign: "center", marginTop: 20,
            padding: "0 10px",
          }}>
            👋 Je connais tout votre espace de révision
            {typeof ctx.dueCount === "number" ? ` (${ctx.dueCount} fiche${ctx.dueCount > 1 ? "s" : ""} prêtes)` : ""}.
            Posez-moi une question ou demandez-moi une action !
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="mm-chat-msg" style={{ display: "flex", width: "100%", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "84%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: m.role === "user"
                ? "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)"
                : (isDarkMode ? "#171929" : "#FFFFFF"),
              color: m.role === "user" ? "#FFFFFF" : (isDarkMode ? "#F1F5F9" : "#0F172A"),
              border: m.role === "user"
                ? "none"
                : (isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1.5px solid rgba(226, 232, 240, 0.9)"),
              boxShadow: m.role === "user"
                ? "0 4px 14px rgba(124, 58, 237, 0.25)"
                : (isDarkMode ? "0 2px 8px rgba(0, 0, 0, 0.2)" : "0 2px 8px rgba(0, 0, 0, 0.04)"),
            }}>
              {m.content}
              {m.action && (
                <div style={{
                  marginTop: 8, fontSize: 11, fontWeight: 800,
                  color: isDarkMode ? "#C084FC" : "#7C3AED",
                  background: isDarkMode ? "rgba(139, 92, 246, 0.15)" : "#F3E8FF",
                  padding: "4px 8px", borderRadius: 8, display: "inline-block",
                }}>
                  ⚡ {m.action}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div style={{ color: isDarkMode ? "#C084FC" : "#7C3AED", fontSize: 12, fontWeight: 700, paddingLeft: 4 }}>
            🤖 L'assistant prépare sa réponse…
          </div>
        )}
        {error && (
          <div style={{ color: "var(--mm-danger, #EF4444)", fontSize: 12, fontWeight: 700, paddingLeft: 4 }}>{error}</div>
        )}
      </div>

      {/* ── Suggestions contextuelles ── */}
      {messages.length === 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6,
          padding: "8px 16px 10px",
          background: isDarkMode ? "#090a12" : "#F8FAFC",
        }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              style={{
                background: isDarkMode ? "#171929" : "#FFFFFF",
                border: isDarkMode ? "1px solid rgba(139, 92, 246, 0.25)" : "1.5px solid rgba(168, 85, 247, 0.25)",
                color: isDarkMode ? "#C4B5FD" : "#6D28D9",
                borderRadius: 999, padding: "6px 12px", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
                boxShadow: isDarkMode ? "none" : "0 2px 6px rgba(139, 92, 246, 0.06)",
                transition: "all 0.15s ease",
              }}
            >{s}</button>
          ))}
        </div>
      )}

      {/* ── Saisie ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        style={{
          display: "flex", gap: 10, alignItems: "center", flexShrink: 0,
          padding: isSheet ? "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))" : "12px 16px",
          borderTop: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(226, 232, 240, 0.9)",
          background: isDarkMode ? "#0f111e" : "#FFFFFF",
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
          }}
          placeholder="Demandez une explication ou une action…"
          style={{
            flex: 1, resize: "none", maxHeight: 110,
            background: isDarkMode ? "#181a2b" : "#F1F5F9",
            color: isDarkMode ? "#FFFFFF" : "#0F172A",
            border: isDarkMode ? "1.5px solid rgba(255, 255, 255, 0.12)" : "1.5px solid rgba(203, 213, 225, 0.9)",
            borderRadius: 16,
            padding: "10px 14px", fontSize: 13.5, fontFamily: "inherit", outline: "none",
            transition: "border-color 0.2s ease",
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            width: 42, height: 42, borderRadius: 14, flexShrink: 0,
            background: "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)",
            color: "#FFFFFF", border: "none",
            cursor: busy || !input.trim() ? "not-allowed" : "pointer",
            opacity: busy || !input.trim() ? 0.45 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            boxShadow: "0 4px 14px rgba(124, 58, 237, 0.35)",
            transition: "transform 0.15s ease",
          }}
          aria-label="Envoyer"
        >➜</button>
      </form>
    </div>
  );

  if (isSheet) {
    return (
      <div
        style={sheetWrapperStyle}
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      >
        {content}
      </div>
    );
  }

  return content;
}
