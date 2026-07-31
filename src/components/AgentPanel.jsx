// AgentPanel.jsx — L'assistant IA de MémoMaître
// ─────────────────────────────────────────────────────────────────────────────
// Deux enveloppes, un seul cerveau :
//   variant="popup" → desktop, popup flottant façon "RADIO FOCUS" (footer)
//   variant="sheet" → mobile, bottom sheet plein écran (pattern du drawer "Plus")
//
// PRINCIPE DE DESIGN : zéro couleur ad-hoc. Tout vient des tokens du thème
// (theme.cardBg / theme.text / theme.textMuted / theme.border / theme.highlight),
// exactement comme les tuiles et le footer existants.
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
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

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

  const shell = isSheet
    ? {
        position: "fixed", left: 0, right: 0, bottom: 0, top: 0,
        background: theme.bg || panelBg, zIndex: 12000,
        display: "flex", flexDirection: "column",
        animation: "drawerUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
      }
    : {
        position: "absolute", bottom: "calc(100% + 16px)", right: -40,
        width: 380, maxHeight: "70vh",
        background: panelBg,
        border: `1px solid ${theme.border}`,
        borderRadius: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        display: "flex", flexDirection: "column", zIndex: 10000,
        animation: "fadeUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      };

  return (
    <div style={shell} role="dialog" aria-label="Assistant MémoMaître">
      {/* ── En-tête ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: isSheet ? "16px 18px" : "16px 18px 12px",
        borderBottom: `1px solid ${theme.border}`, flexShrink: 0,
        paddingTop: isSheet ? "calc(16px + env(safe-area-inset-top, 0px))" : 16,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 16 }} aria-hidden="true">🤖</span>
          <span style={{
            fontSize: 13, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase",
            color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>Assistant</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); setError(null); }}
              style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 11, fontWeight: 800 }}
              title="Effacer la conversation"
            >
              Effacer
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
            aria-label="Fermer l'assistant"
          >✕</button>
        </span>
      </div>

      {/* ── Conversation ── */}
      <div ref={listRef} style={{
        flex: 1, overflowY: "auto", padding: isSheet ? "16px 18px" : "14px 16px",
        display: "flex", flexDirection: "column", gap: 10, minHeight: isSheet ? 0 : 160,
      }}>
        {messages.length === 0 && (
          <div style={{ color: theme.textMuted, fontSize: 13, lineHeight: 1.5 }}>
            Je connais toute l'app et ton état du moment
            {typeof ctx.dueCount === "number" ? ` (${ctx.dueCount} fiche${ctx.dueCount > 1 ? "s" : ""} à réviser)` : ""}.
            Demande-moi une explication… ou une action.
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "88%", padding: "9px 12px", borderRadius: 14,
              fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: m.role === "user" ? theme.highlight : softBg,
              color: m.role === "user" ? "var(--mm-on-primary, #fff)" : theme.text,
              border: m.role === "user" ? "none" : `1px solid ${theme.border}`,
            }}>
              {m.content}
              {m.action && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: theme.highlight }}>
                  ⚡ {m.action}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div style={{ color: theme.textMuted, fontSize: 12, fontWeight: 700 }}>L'assistant réfléchit…</div>
        )}
        {error && (
          <div style={{ color: "var(--mm-danger, #EF4444)", fontSize: 12, fontWeight: 700 }}>{error}</div>
        )}
      </div>

      {/* ── Suggestions contextuelles ── */}
      {messages.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: isSheet ? "0 18px 12px" : "0 16px 10px" }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              style={{
                background: softBg, border: `1px solid ${theme.border}`, color: theme.text,
                borderRadius: 999, padding: "6px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              }}
            >{s}</button>
          ))}
        </div>
      )}

      {/* ── Saisie ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        style={{
          display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0,
          padding: isSheet ? "12px 18px calc(16px + env(safe-area-inset-bottom, 0px))" : "12px 16px 14px",
          borderTop: `1px solid ${theme.border}`,
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
          placeholder="Pose une question ou demande une action…"
          style={{
            flex: 1, resize: "none", maxHeight: 110,
            background: inputBgSolid, color: theme.text,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: theme.gradient || theme.highlight,
            color: "var(--mm-on-primary, #fff)", border: "none",
            cursor: busy || !input.trim() ? "not-allowed" : "pointer",
            opacity: busy || !input.trim() ? 0.5 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}
          aria-label="Envoyer"
        >➜</button>
      </form>
    </div>
  );
}
