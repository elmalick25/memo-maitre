// AgentPanel.jsx — L'assistant IA de MémoMaître
// ─────────────────────────────────────────────────────────────────────────────
// Deux enveloppes, un seul cerveau :
//   variant="popup" → desktop, popup flottant façon "RADIO FOCUS" (footer)
//   variant="sheet" → mobile, bottom sheet plein écran moderne et réactif Jour / Nuit
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { buildAgentSystemPrompt, buildConversationPayload, suggestionsForView } from "../lib/appKnowledge";
import safeParseJSON from "../lib/jsonRepair";
import { useVirtualKeyboard } from "../hooks/useVirtualKeyboard";
import { recordCommunityQuestion } from "../lib/communityLearningEngine";

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

function renderFormattedText(text, isDarkMode) {
  if (!text) return "";
  const lines = String(text).split("\n");
  return lines.map((line, lineIdx) => {
    const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
    const content = isBullet ? line.trim().slice(2) : line;
    const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

    const formattedParts = parts.map((part, pIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={pIdx} style={{ fontWeight: 800 }}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={pIdx}
            style={{
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: "0.88em",
              fontFamily: "monospace",
              background: isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.07)",
              color: isDarkMode ? "var(--mm-primary-glow, #FDBA74)" : "var(--mm-primary-deep, #C2410C)",
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });

    if (isBullet) {
      return (
        <div key={lineIdx} style={{ display: "flex", gap: 6, marginTop: 3, marginBottom: 3 }}>
          <span style={{ color: "var(--mm-primary)", fontWeight: 800 }}>•</span>
          <span>{formattedParts}</span>
        </div>
      );
    }

    return (
      <span key={lineIdx}>
        {formattedParts}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    );
  });
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
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const listRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const isScrolledUpRef = useRef(false);
  const prevMsgCountRef = useRef(messages.length);

  const { keyboardHeight } = useVirtualKeyboard();

  const ctx = open && typeof getContext === "function" ? getContext() : {};

  useEffect(() => { saveHistory(messages); }, [messages]);

  const scrollToBottom = useCallback((smooth = true) => {
    if (listRef.current) {
      try {
        listRef.current.scrollLeft = 0;
        listRef.current.scrollTo({
          top: listRef.current.scrollHeight,
          left: 0,
          behavior: smooth ? "smooth" : "auto",
        });
      } catch {
        listRef.current.scrollTop = listRef.current.scrollHeight;
        listRef.current.scrollLeft = 0;
      }
    }
  }, []);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isUp = scrollHeight - scrollTop - clientHeight > 90;
    isScrolledUpRef.current = isUp;
    if (!isUp) {
      setHasNewBelow(false);
    }
  }, []);

  // Ajuste automatiquement la hauteur de la zone de saisie
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 110) + "px";
  }, [input, open]);

  // Bloque le défilement de la page derrière le panneau mobile
  useEffect(() => {
    if (!open || variant !== "sheet") return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  // Défilement automatique vers le bas fiable et fluide lors de chaque échange
  useEffect(() => {
    const hasNew = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    // Si l'utilisateur est remonté pour lire et qu'un message arrive, afficher le bouton discret
    if (isScrolledUpRef.current && (hasNew || busy)) {
      setHasNewBelow(true);
      return undefined;
    }

    setHasNewBelow(false);
    scrollToBottom(false);
    const raf = requestAnimationFrame(() => scrollToBottom(true));
    const t = setTimeout(() => scrollToBottom(true), 80);
    const t2 = setTimeout(() => scrollToBottom(true), 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [messages, busy, open, scrollToBottom]);

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
    isScrolledUpRef.current = false;
    setHasNewBelow(false);
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    requestAnimationFrame(() => scrollToBottom(true));
    setBusy(true);
    recordCommunityQuestion(text);
    try {
      const live = typeof getContext === "function" ? getContext() : {};
      if (live.isMobile === undefined) {
        const detectedMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
        live.isMobile = detectedMobile;
        live.device = detectedMobile ? "mobile" : "desktop";
      }
      const system = buildAgentSystemPrompt(live);
      const payload = buildConversationPayload(messages, text);
      const answer = await ask(system, payload);
      const rawText = typeof answer === "string" ? answer : (answer?.text || "");
      let parsed = null;
      try { parsed = safeParseJSON(rawText); } catch { parsed = null; }
      let reply = parsed && typeof parsed.reply === "string" ? parsed.reply.trim() : "";
      if (!reply) {
        const match = rawText.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/s);
        if (match) {
          try { reply = JSON.parse(`"${match[1]}"`).trim(); } catch { reply = match[1].replace(/\\"/g, '"').trim(); }
        }
      }
      if (!reply) {
        const cleaned = rawText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
        reply = cleaned || "Je n'ai pas de réponse pour l'instant.";
      }
      const actionData = parsed?.action?.tool ? parsed.action : null;
      const proposalData = parsed?.proposal?.tool ? parsed.proposal : null;
      let initialActionLabel = null;
      if (actionData) {
        if (actionData.tool === "navigate" && actionData.args?.view) {
          initialActionLabel = `Redirection vers « ${actionData.args.view} » dans un instant...`;
        } else if (actionData.tool === "start_review") {
          initialActionLabel = "Lancement de la révision dans un instant...";
        } else if (actionData.tool === "create_card") {
          initialActionLabel = "Création de la fiche...";
        } else {
          initialActionLabel = `Action : ${actionData.tool}`;
        }
      }

      const msgIndex = nextMessages.length;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: reply,
          action: initialActionLabel,
          isExecuting: Boolean(actionData),
          proposal: proposalData,
          proposalExecuted: false,
        },
      ]);

      if (actionData && typeof runTool === "function") {
        // Laisser 1.8s à l'utilisateur pour lire le message confortablement avant d'exécuter la redirection / action
        const delay = actionData.tool === "navigate" || actionData.tool === "start_review" ? 1800 : 700;
        setTimeout(() => {
          let res = null;
          try {
            res = runTool(actionData.tool, actionData.args || {});
          } catch {
            res = "Action impossible à exécuter";
          }
          const finalLabel = typeof res === "string" && res.trim() ? res : initialActionLabel;
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === msgIndex ? { ...msg, action: finalLabel, isExecuting: false } : msg
            )
          );
        }, delay);
      }
    } catch (e) {
      setError(null);
      setMessages((m) => [...m, { role: "assistant", content: "Je n'arrive pas à joindre le moteur IA. Réessaie dans un instant." }]);
    } finally {
      setBusy(false);
    }
  }, [messages, busy, ask, getContext, runTool]);

  const handleExecuteProposal = useCallback((proposal, msgIndex) => {
    if (!proposal || typeof runTool !== "function") return;
    try {
      runTool(proposal.tool, proposal.args || {});
      setMessages((prev) =>
        prev.map((msg, idx) =>
          idx === msgIndex ? { ...msg, proposalExecuted: true } : msg
        )
      );
    } catch (e) {
      console.error("[AgentPanel] Erreur d'exécution de la proposition :", e);
    }
  }, [runTool]);

  if (!open) return null;

  const isSheet = variant === "sheet";
  const suggestions = suggestionsForView(ctx.view);

  const panelBg = isDarkMode ? "#12121c" : "#ffffff";
  const softBg = isDarkMode ? "#1c1c2b" : "#f1f5f9";
  const inputBgSolid = isDarkMode ? "#181826" : "#f8fafc";

  const sheetWrapperStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: keyboardHeight > 0 ? `${keyboardHeight}px` : 0,
    zIndex: 12000,
    background: isDarkMode ? "rgba(10, 12, 20, 0.7)" : "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    fontFamily: "'Outfit', sans-serif",
    animation: "betaFadeIn 0.2s ease-out",
    transition: "bottom 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  };

  const containerStyle = isSheet
    ? {
        width: "100%",
        maxWidth: 540,
        height: "min(88dvh, 720px)",
        maxHeight: "88dvh",
        background: isDarkMode
          ? "linear-gradient(180deg, #10121e 0%, #151829 100%)"
          : "linear-gradient(180deg, #FFFFFF 0%, color-mix(in srgb, var(--mm-primary) 4%, white) 100%)",
        color: isDarkMode ? "#FFFFFF" : "#0F172A",
        borderRadius: "28px 28px 0 0",
        display: "flex",
        flexDirection: "column",
        border: isDarkMode
          ? "1.5px solid color-mix(in srgb, var(--mm-primary) 30.0%, transparent)"
          : "1.5px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)",
        boxShadow: isDarkMode
          ? "0 -10px 40px rgba(0, 0, 0, 0.6)"
          : "0 -10px 40px rgba(158, 71, 36, 0.2)",
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
        border: isDarkMode ? "1.5px solid color-mix(in srgb, var(--mm-primary) 30.0%, transparent)" : "1.5px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)",
        borderRadius: 22,
        boxShadow: isDarkMode ? "0 20px 50px rgba(0,0,0,0.6)" : "0 20px 50px rgba(158, 71, 36, 0.2)",
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
            : "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary-deep) 100%)",
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
          : "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary-deep) 100%)",
        borderBottom: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)" : "1px solid rgba(255, 255, 255, 0.25)",
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
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{
                fontSize: 15, fontWeight: 900, letterSpacing: "-0.2px",
                color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                Assistant IA
              </span>
              <span style={{
                fontSize: 10, fontWeight: 900, letterSpacing: "0.5px",
                padding: "2px 7px", borderRadius: 6,
                background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                color: "#FFFFFF", boxShadow: "0 2px 6px rgba(217, 119, 6, 0.4)",
              }}>
                NIV. 100 ⚡
              </span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.88)", fontWeight: 600 }}>
              Stratège Cognitif MémoMaître • En direct
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
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="mm-chat-scroll"
        style={{
          flex: 1, overflowY: "auto", overflowX: "hidden", flexWrap: "nowrap",
          width: "100%", boxSizing: "border-box",
          padding: "16px 16px 28px",
          display: "flex", flexDirection: "column", minHeight: 0,
          maxHeight: "100%",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          background: isDarkMode ? "#090a12" : "#F8FAFC",
        }}
      >
        {messages.length === 0 && (
          <div style={{
            color: isDarkMode ? "#94a3b8" : "#64748b",
            fontSize: 13, lineHeight: 1.5, textAlign: "center", marginTop: 20,
            padding: "0 10px",
          }}>
            👋 <strong>Stratège Cognitif MémoMaître (Niveau 100)</strong> à votre service.
            {typeof ctx.dueCount === "number" ? ` Vous avez ${ctx.dueCount} fiche${ctx.dueCount > 1 ? "s prêtes" : " prête"} à réviser.` : ""}
            <br />Posez-moi une question sur vos révisions ou demandez-moi une action !
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="mm-chat-msg" style={{ display: "flex", width: "100%", maxWidth: "100%", flexShrink: 0, boxSizing: "border-box", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "84%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word",
              background: m.role === "user"
                ? "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary) 100%)"
                : (isDarkMode ? "#171929" : "#FFFFFF"),
              color: m.role === "user" ? "#FFFFFF" : (isDarkMode ? "#F1F5F9" : "#0F172A"),
              border: m.role === "user"
                ? "none"
                : (isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1.5px solid rgba(226, 232, 240, 0.9)"),
              boxShadow: m.role === "user"
                ? "0 4px 14px rgba(158, 71, 36, 0.25)"
                : (isDarkMode ? "0 2px 8px rgba(0, 0, 0, 0.2)" : "0 2px 8px rgba(0, 0, 0, 0.04)"),
            }}>
              {renderFormattedText(m.content, isDarkMode)}
              {m.action && (
                <div style={{
                  marginTop: 8, fontSize: 11, fontWeight: 800,
                  color: isDarkMode ? "var(--mm-primary-glow)" : "var(--mm-primary)",
                  background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 15.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                  padding: "4px 9px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 6,
                  border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 30%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 20%, transparent)",
                  boxShadow: m.isExecuting ? "0 0 10px rgba(249, 115, 22, 0.3)" : "none",
                  transition: "all 0.2s ease",
                }}>
                  <span>{m.isExecuting ? "⏳" : "⚡"}</span>
                  <span>{m.action}</span>
                </div>
              )}
              {m.proposal && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => handleExecuteProposal(m.proposal, i)}
                    disabled={m.proposalExecuted}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "7px 13px",
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: m.proposalExecuted ? "default" : "pointer",
                      border: "none",
                      background: m.proposalExecuted
                        ? (isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)")
                        : "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary-deep) 100%)",
                      color: m.proposalExecuted
                        ? (isDarkMode ? "#94a3b8" : "#64748b")
                        : "#FFFFFF",
                      boxShadow: m.proposalExecuted
                        ? "none"
                        : (isDarkMode ? "0 4px 14px rgba(0, 0, 0, 0.4)" : "0 4px 12px rgba(158, 71, 36, 0.25)"),
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!m.proposalExecuted) {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 6px 16px rgba(158, 71, 36, 0.35)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!m.proposalExecuted) {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(158, 71, 36, 0.25)";
                      }
                    }}
                  >
                    <span>{m.proposalExecuted ? "✅" : "🚀"}</span>
                    <span>{m.proposalExecuted ? "Vue ouverte" : (m.proposal.label || "Ouvrir la vue")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div style={{ color: isDarkMode ? "var(--mm-primary-glow)" : "var(--mm-primary)", fontSize: 12, fontWeight: 700, paddingLeft: 4 }}>
            🤖 L'assistant prépare sa réponse…
          </div>
        )}
        {error && (
          <div style={{ color: "var(--mm-danger, #EF4444)", fontSize: 12, fontWeight: 700, paddingLeft: 4 }}>{error}</div>
        )}

        {/* Ancre sentinelle invisible pour garantir le défilement jusqu'au dernier message */}
        <div ref={messagesEndRef} style={{ height: 1, minHeight: 1, clear: "both" }} />
      </div>

      {/* ── Micro-bouton flottant discret « ⬇ Nouveau message » ── */}
      {hasNewBelow && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom(true);
            setHasNewBelow(false);
          }}
          className="ev-floating-scroll-down-btn"
          style={{
            bottom: suggestions.length > 0 && messages.length === 0 ? 120 : 72,
          }}
          aria-label="Faire défiler vers les nouveaux messages"
        >
          <span className="ev-scroll-down-dot" /> ⬇ Nouveau message
        </button>
      )}

      {/* ── Suggestions contextuelles ── */}
      {messages.length === 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0,
          padding: "8px 16px 10px",
          background: isDarkMode ? "#090a12" : "#F8FAFC",
        }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={busy}
              style={{
                background: isDarkMode ? "#171929" : "#FFFFFF",
                border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)" : "1.5px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)",
                color: isDarkMode ? "#C4B5FD" : "var(--mm-primary-deep)",
                borderRadius: 999, padding: "6px 12px", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
                boxShadow: isDarkMode ? "none" : "0 2px 6px color-mix(in srgb, var(--mm-primary) 6.0%, transparent)",
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
          display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0,
          padding: isSheet
            ? (keyboardHeight > 0
                ? "10px 16px 12px"
                : "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))")
            : "12px 16px",
          borderTop: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(226, 232, 240, 0.9)",
          background: isDarkMode ? "#0f111e" : "#FFFFFF",
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => {
            setTimeout(() => scrollToBottom(true), 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
          }}
          placeholder="Demandez une explication ou une action…"
          style={{
            flex: 1, resize: "none", maxHeight: 110, minHeight: 42, height: 42,
            boxSizing: "border-box", overflowY: "auto", display: "block",
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
            background: "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary) 100%)",
            color: "#FFFFFF", border: "none",
            cursor: busy || !input.trim() ? "not-allowed" : "pointer",
            opacity: busy || !input.trim() ? 0.45 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            boxShadow: "0 4px 14px rgba(158, 71, 36, 0.35)",
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
