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
import RichText from "./RichText";

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
  return <RichText content={text} isDarkMode={isDarkMode} showAudio={false} />;
}

function _legacyRenderFormattedText(text, isDarkMode) {
  if (!text) return "";

  function inlineFormat(str) {
    if (!str) return "";
    const parts = String(str).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, pIdx) => {
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
  }

  const lines = String(text).split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Bloc de Code Fenced (``` ... ```)
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // 2. Tableau Markdown (| Col1 | Col2 | ...)
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (r) => r.slice(1, -1).split("|").map((c) => c.trim());
        const headers = parseRow(tableLines[0]);
        let startRowIdx = 1;
        if (tableLines.length > 1 && /^\|(\s*:?-+:?\s*\|)+$/.test(tableLines[1])) {
          startRowIdx = 2;
        }
        const rows = tableLines.slice(startRowIdx).map(parseRow);
        blocks.push({ type: "table", headers, rows });
        continue;
      }
    }

    // 3. Ligne normale, puce ou titre de section
    blocks.push({ type: "line", line: rawLine });
    i++;
  }

  return blocks.map((block, idx) => {
    if (block.type === "code") {
      return (
        <div
          key={`code-${idx}`}
          style={{
            margin: "10px 0",
            borderRadius: 8,
            overflow: "hidden",
            border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid #CBD5E1",
            background: isDarkMode ? "#0B0D17" : "#0F172A",
          }}
        >
          {block.lang && (
            <div
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "4px 10px", background: "rgba(255,255,255,0.06)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.65)",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}
            >
              <span>{block.lang}</span>
            </div>
          )}
          <pre
            style={{
              margin: 0, padding: "9px 12px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 11.5, lineHeight: 1.5,
              overflowX: "auto",
              color: "#E2E8F0",
              whiteSpace: "pre",
            }}
          >
            <code>{block.code}</code>
          </pre>
        </div>
      );
    }

    if (block.type === "table") {
      return (
        <div
          key={`table-${idx}`}
          style={{
            overflowX: "auto",
            margin: "10px 0",
            borderRadius: 8,
            border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid #E2E8F0",
            boxShadow: isDarkMode ? "0 2px 8px rgba(0,0,0,0.25)" : "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, textAlign: "left" }}>
            <thead>
              <tr style={{ background: isDarkMode ? "#1A1D2D" : "#F1F5F9" }}>
                {block.headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    style={{
                      padding: "7px 10px",
                      fontWeight: 800,
                      color: isDarkMode ? "#E2E8F0" : "#1E293B",
                      borderBottom: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid #CBD5E1",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inlineFormat(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  style={{
                    background: rIdx % 2 === 1
                      ? (isDarkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)")
                      : "transparent",
                    borderBottom: rIdx < block.rows.length - 1
                      ? (isDarkMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid #F1F5F9")
                      : "none",
                  }}
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      style={{
                        padding: "7px 10px",
                        color: isDarkMode ? "#CBD5E1" : "#334155",
                        lineHeight: 1.4,
                      }}
                    >
                      {inlineFormat(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Ligne standard
    const line = block.line;
    const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ") || line.trim().startsWith("• ");
    const content = isBullet ? line.trim().replace(/^[-*•]\s*/, "") : line;
    const isSectionHeader = /^(###|⚡|⚔️|🔬|⚠️|🧠)/.test(line.trim());

    if (isSectionHeader) {
      const headerText = line.trim().startsWith("###") ? line.trim().slice(3).trim() : line.trim();
      return (
        <div
          key={`header-${idx}`}
          style={{
            fontWeight: 800,
            fontSize: 12.5,
            marginTop: 8,
            marginBottom: 4,
            color: isDarkMode ? "#FFFFFF" : "#0F172A",
            letterSpacing: "-0.1px",
          }}
        >
          {inlineFormat(headerText)}
        </div>
      );
    }

    if (isBullet) {
      return (
        <div key={`bullet-${idx}`} style={{ display: "flex", gap: 6, marginTop: 3, marginBottom: 3 }}>
          <span style={{ color: "var(--mm-primary)", fontWeight: 800 }}>•</span>
          <span>{inlineFormat(content)}</span>
        </div>
      );
    }

    return (
      <span key={`line-${idx}`}>
        {inlineFormat(line)}
        {idx < blocks.length - 1 && <br />}
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
  const [imageAttachment, setImageAttachment] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const listRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const isScrolledUpRef = useRef(false);
  const prevMsgCountRef = useRef(messages.length);

  const { keyboardHeight } = useVirtualKeyboard();

  const handleImageFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Veuillez sélectionner un fichier image valide (PNG, JPEG, WebP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("L'image est trop volumineuse (max 10 Mo).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (typeof dataUrl === "string") {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const cCtx = canvas.getContext("2d");
            cCtx.drawImage(img, 0, 0, width, height);
            const optimized = canvas.toDataURL("image/jpeg", 0.85);
            setImageAttachment({ dataUrl: optimized, name: file.name || "image.jpg" });
          } else {
            setImageAttachment({ dataUrl, name: file.name || "image.png" });
          }
          setError(null);
        };
        img.onerror = () => {
          setImageAttachment({ dataUrl, name: file.name || "image.png" });
          setError(null);
        };
        img.src = dataUrl;
      }
    };
    reader.onerror = () => {
      setError("Erreur de lecture de l'image.");
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback((e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    const items = clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleImageFile(file);
          break;
        }
      }
    }
  }, [handleImageFile]);

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

  useEffect(() => {
    const handleCardFocus = (e) => {
      const card = e.detail?.card;
      if (!card) return;
      const isRevealed = Boolean(e.detail?.revealed);
      const title = card.front ? `« **${card.front}** »` : "cette fiche";
      const greetingText = `Je vois la fiche ${title} affichée à ton écran.\n\nQu'est-ce que tu aimerais comprendre ou approfondir sur cette notion ?`;
      const suggestions = isRevealed
        ? [
            "Explique-moi la nuance clé et l'image mentale",
            "Comment l'utiliser naturellement à l'oral ?",
            "Quels sont les pièges et calques à éviter ?",
          ]
        : [
            "Donne-moi un indice sans spoiler la réponse",
            "Quel est le contexte ou le modèle mental ?",
            "Quel est le piège classique à éviter ici ?",
          ];

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.cardId === card.id && last.role === "assistant") {
          return prev;
        }
        return [
          ...prev,
          {
            role: "assistant",
            content: greetingText,
            cardId: card.id,
            suggestions,
          },
        ];
      });
    };

    window.addEventListener("memomaster:agent-card-focus", handleCardFocus);
    return () => window.removeEventListener("memomaster:agent-card-focus", handleCardFocus);
  }, []);

  const send = useCallback(async (raw, explicitImage = null) => {
    const text = (raw ?? "").trim();
    const imgToSend = explicitImage || imageAttachment;
    if ((!text && !imgToSend) || busy) return;
    setError(null);
    setInput("");
    setImageAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    isScrolledUpRef.current = false;
    setHasNewBelow(false);
    const userMessageContent = text || "Peux-tu analyser cette image et m'expliquer son contenu pédagogique ?";
    const nextMessages = [...messages, { role: "user", content: userMessageContent, image: imgToSend?.dataUrl || null }];
    setMessages(nextMessages);
    requestAnimationFrame(() => scrollToBottom(true));
    setBusy(true);
    recordCommunityQuestion(userMessageContent);
    try {
      const live = typeof getContext === "function" ? getContext(userMessageContent) : {};
      if (live.isMobile === undefined) {
        const detectedMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
        live.isMobile = detectedMobile;
        live.device = detectedMobile ? "mobile" : "desktop";
      }
      const system = buildAgentSystemPrompt(live);
      const payload = buildConversationPayload(messages, userMessageContent);
      const answer = await ask(system, payload, imgToSend?.dataUrl || null);
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
  const suggestions = suggestionsForView(ctx.view, ctx.currentCard);

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
        width: isExpanded ? "min(720px, 94vw)" : 390,
        maxHeight: isExpanded ? "88vh" : "72vh",
        height: isExpanded ? "88vh" : undefined,
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
        transition: "width 0.25s cubic-bezier(0.16, 1, 0.3, 1), height 0.25s cubic-bezier(0.16, 1, 0.3, 1), max-height 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
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

      {/* ── En-tête Studio Copilot (Harmonisé Jour / Nuit & Anti-chevauchement) ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, padding: "10px 14px",
        background: isDarkMode
          ? "linear-gradient(180deg, #17192A 0%, #111322 100%)"
          : "#FFFFFF",
        borderBottom: isDarkMode
          ? "1px solid rgba(255, 255, 255, 0.08)"
          : "1px solid #E2E8F0",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 32, height: 32, minWidth: 32, minHeight: 32, borderRadius: 9,
            background: isDarkMode
              ? "linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(139, 92, 246, 0.22) 100%)"
              : "rgba(99, 102, 241, 0.12)",
            border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(99, 102, 241, 0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isDarkMode ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 6px rgba(99, 102, 241, 0.1)",
            flexShrink: 0,
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: isDarkMode ? "#A5B4FC" : "#4F46E5" }}>
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              <path d="M5 3v4"/>
              <path d="M19 17v4"/>
              <path d="M3 5h4"/>
              <path d="M17 19h4"/>
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
              <span style={{
                fontSize: 13.5, fontWeight: 800, letterSpacing: "-0.2px",
                color: isDarkMode ? "#FFFFFF" : "#0F172A",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                Maodo
              </span>
              <span style={{
                fontSize: 9, fontWeight: 900, letterSpacing: "0.4px",
                padding: "2px 6px", borderRadius: 999,
                background: isDarkMode
                  ? "linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(217, 119, 6, 0.35) 100%)"
                  : "#FEF3C7",
                border: isDarkMode ? "1px solid rgba(245, 158, 11, 0.55)" : "1px solid #F59E0B",
                color: isDarkMode ? "#FDE68A" : "#B45309",
                boxShadow: isDarkMode ? "0 1px 4px rgba(245, 158, 11, 0.2)" : "none",
                display: "inline-flex", alignItems: "center", gap: 3,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                <span>⚡</span> NIV. 100
              </span>
            </div>
            <div style={{
              fontSize: 10.5,
              color: isDarkMode ? "rgba(255, 255, 255, 0.72)" : "#64748B",
              fontWeight: 500, display: "flex", alignItems: "center", gap: 5, marginTop: 1,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              <span style={{ whiteSpace: "nowrap" }}>Stratège Cognitif</span>
              <span style={{ opacity: 0.35 }}>•</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: isDarkMode ? "#34D399" : "#059669", fontWeight: 600, whiteSpace: "nowrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }} />
                En direct
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); setError(null); }}
              style={{
                height: 28,
                background: isDarkMode ? "rgba(255, 255, 255, 0.1)" : "#F1F5F9",
                border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #E2E8F0",
                color: isDarkMode ? "#E2E8F0" : "#475569",
                cursor: "pointer", fontSize: 10.5, fontWeight: 700,
                borderRadius: 7, padding: "0 8px",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s ease", flexShrink: 0,
              }}
              title="Effacer la conversation"
            >
              Effacer
            </button>
          )}

          {!isSheet && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              style={{
                width: 28, height: 28, minWidth: 28, minHeight: 28, flexShrink: 0,
                borderRadius: 7, padding: 0,
                background: isDarkMode ? "rgba(255, 255, 255, 0.1)" : "#F1F5F9",
                border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #E2E8F0",
                color: isDarkMode ? "#CBD5E1" : "#64748B",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s ease",
              }}
              title={isExpanded ? "Réduire la fenêtre" : "Agrandir la fenêtre"}
              aria-label={isExpanded ? "Réduire la fenêtre" : "Agrandir la fenêtre"}
            >
              {isExpanded ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20"></polyline>
                  <polyline points="20 10 14 10 14 4"></polyline>
                  <line x1="14" y1="10" x2="21" y2="3"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28, minWidth: 28, minHeight: 28, flexShrink: 0,
              borderRadius: 7, padding: 0,
              background: isDarkMode ? "rgba(255, 255, 255, 0.1)" : "#F1F5F9",
              border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #E2E8F0",
              color: isDarkMode ? "#CBD5E1" : "#64748B",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s ease",
            }}
            aria-label="Fermer Maodo"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
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
          padding: "14px 14px 22px",
          display: "flex", flexDirection: "column", minHeight: 0,
          maxHeight: "100%",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          background: isDarkMode ? "#090A12" : "#F8FAFC",
        }}
      >
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 2 }}>
            <div style={{
              background: isDarkMode ? "#131524" : "#FFFFFF",
              border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #E2E8F0",
              borderRadius: 16,
              padding: "16px",
              boxShadow: isDarkMode ? "0 4px 16px rgba(0,0,0,0.3)" : "0 4px 14px rgba(15, 23, 42, 0.03)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: isDarkMode ? "rgba(99, 102, 241, 0.2)" : "#EEF2FF",
                  color: "#6366F1",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, flexShrink: 0,
                }}>
                  ✨
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: isDarkMode ? "#F8FAFC" : "#0F172A" }}>
                    Stratège Cognitif MémoMaître
                  </div>
                  <div style={{ fontSize: 11.5, color: isDarkMode ? "#94A3B8" : "#64748B" }}>
                    {typeof ctx.dueCount === "number" && ctx.dueCount > 0
                      ? `🎯 ${ctx.dueCount} fiche${ctx.dueCount > 1 ? "s prêtes" : " prête"} pour votre session`
                      : "Prêt à propulser vos apprentissages"}
                  </div>
                </div>
              </div>

              {ctx.currentCard ? (
                <div style={{
                  marginTop: 10,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: isDarkMode ? "#1A1D30" : "#F8FAFC",
                  border: isDarkMode ? "1px solid rgba(99, 102, 241, 0.3)" : "1.5px solid #E0E7FF",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px",
                      color: "#6366F1", display: "inline-flex", alignItems: "center", gap: 5,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366F1" }} />
                      Fiche en cours de révision
                    </span>
                    {ctx.currentCard.category && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                        background: isDarkMode ? "rgba(255,255,255,0.08)" : "#E2E8F0",
                        color: isDarkMode ? "#94A3B8" : "#475569",
                      }}>
                        {ctx.currentCard.category}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: isDarkMode ? "#F1F5F9" : "#1E293B",
                    lineHeight: 1.4, marginBottom: 10,
                    maxHeight: 48, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>
                    {ctx.currentCard.front || "Concept"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => send(`🎯 Interroge-moi sur cette fiche (« ${ctx.currentCard.front || "cette notion"} ») : pose-moi une question concrète ou une mise en situation pour tester ma compréhension active.`)}
                      disabled={busy}
                      className="hov btn-glow"
                      style={{
                        width: "100%", padding: "10px 14px", borderRadius: 10,
                        background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
                        color: "#FFFFFF", border: "none", fontSize: 12.5, fontWeight: 800,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        boxShadow: "0 3px 12px rgba(99, 102, 241, 0.35)",
                        transition: "transform 0.15s ease",
                      }}
                    >
                      <span style={{ fontSize: 14 }}>🎯</span>
                      <span>Interroge-moi sur cette fiche (Quiz actif)</span>
                    </button>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => send(`💡 Explique-moi le vrai sens, le modèle mental et la nuance clé de cette fiche (« ${ctx.currentCard.front || "cette notion"} »).`)}
                        disabled={busy}
                        className="hov"
                        style={{
                          padding: "7px 10px", borderRadius: 8,
                          background: isDarkMode ? "#131524" : "#EEF2FF",
                          border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #E0E7FF",
                          color: isDarkMode ? "#E2E8F0" : "#3730A3",
                          fontSize: 11.5, fontWeight: 700,
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        }}
                      >
                        <span>💡</span>
                        <span>Nuance & Vrai sens</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => send(`⚠️ Quels sont les pièges classiques, confusions ou faux calques à éviter avec « ${ctx.currentCard.front || "cette notion"} » ?`)}
                        disabled={busy}
                        className="hov"
                        style={{
                          padding: "7px 10px", borderRadius: 8,
                          background: isDarkMode ? "#131524" : "#FEF2F2",
                          border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #FEE2E2",
                          color: isDarkMode ? "#FCA5A5" : "#991B1B",
                          fontSize: 11.5, fontWeight: 700,
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        }}
                      >
                        <span>⚠️</span>
                        <span>Pièges à éviter</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  marginTop: 6, fontSize: 12, color: isDarkMode ? "#94A3B8" : "#64748B",
                  lineHeight: 1.45,
                }}>
                  Posez n'importe quelle question sur vos cours, fiches ou révisions. Vous pouvez également <strong>joindre ou coller directement une capture d'écran (Ctrl+V)</strong> !
                </div>
              )}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="mm-chat-msg" style={{ display: "flex", width: "100%", maxWidth: "100%", flexShrink: 0, boxSizing: "border-box", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: m.role === "user" ? "84%" : "96%", padding: m.role === "user" ? "10px 14px" : "12px 16px",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              fontSize: 13.5, lineHeight: 1.5, wordBreak: "break-word",
              background: m.role === "user"
                ? "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary) 100%)"
                : (isDarkMode ? "#171929" : "#FFFFFF"),
              color: m.role === "user" ? "#FFFFFF" : (isDarkMode ? "#F1F5F9" : "#0F172A"),
              border: m.role === "user"
                ? "none"
                : (isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1.5px solid rgba(226, 232, 240, 0.9)"),
              boxShadow: m.role === "user"
                ? "0 4px 14px rgba(158, 71, 36, 0.25)"
                : (isDarkMode ? "0 4px 16px rgba(0, 0, 0, 0.25)" : "0 4px 14px rgba(0, 0, 0, 0.04)"),
            }}>
              {m.image && (
                <div style={{ marginBottom: 8 }}>
                  <img
                    src={m.image}
                    alt="Image envoyée"
                    onClick={() => setZoomedImage(m.image)}
                    style={{
                      maxWidth: "100%",
                      maxHeight: 200,
                      borderRadius: 10,
                      display: "block",
                      objectFit: "cover",
                      cursor: "pointer",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                    }}
                    title="Cliquer pour agrandir"
                  />
                </div>
              )}
              {m.role === "user" ? (
                <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
              ) : (
                renderFormattedText(m.content, isDarkMode)
              )}
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
              {Array.isArray(m.suggestions) && m.suggestions.length > 0 && (
                <div
                  className="mm-no-scrollbar"
                  style={{
                    display: "flex",
                    flexWrap: "nowrap",
                    overflowX: "auto",
                    overflowY: "hidden",
                    gap: 6,
                    marginTop: 10,
                    paddingBottom: 2,
                    WebkitOverflowScrolling: "touch",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                  }}
                >
                  {m.suggestions.map((sug, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => send(sug)}
                      disabled={busy}
                      className="hov"
                      style={{
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                        background: isDarkMode ? "rgba(99, 102, 241, 0.15)" : "#EEF2FF",
                        border: isDarkMode ? "1px solid rgba(99, 102, 241, 0.3)" : "1.5px solid #C7D2FE",
                        color: isDarkMode ? "#C7D2FE" : "#4338CA",
                        padding: "5px 11px",
                        borderRadius: 14,
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: busy ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        transition: "all 0.15s ease",
                        textAlign: "left",
                      }}
                    >
                      <span>💡</span>
                      <span>{sug}</span>
                    </button>
                  ))}
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
          display: "flex", flexDirection: "column", gap: 6, flexShrink: 0,
          padding: "4px 14px 10px",
          background: isDarkMode ? "#090A12" : "#F8FAFC",
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: isDarkMode ? "#64748B" : "#94A3B8",
            textTransform: "uppercase", letterSpacing: "0.5px", paddingLeft: 2,
          }}>
            {ctx.currentCard ? "Questions sur cette fiche" : "Actions rapides"}
          </div>
          <div
            className="mm-no-scrollbar"
            style={{
              display: "flex",
              flexWrap: "nowrap",
              overflowX: "auto",
              overflowY: "hidden",
              gap: 8,
              paddingBottom: 4,
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={busy}
                className="hov"
                style={{
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  background: isDarkMode ? "#151829" : "#FFFFFF",
                  border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #E2E8F0",
                  color: isDarkMode ? "#E2E8F0" : "#334155",
                  borderRadius: 10,
                  padding: "6px 12px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: isDarkMode ? "none" : "0 1px 3px rgba(0,0,0,0.03)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ color: "#6366F1", fontSize: 10 }}>✦</span>
                <span>{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Saisie unifiée (Command Bar) ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        onPaste={handlePaste}
        style={{
          display: "flex", flexDirection: "column", flexShrink: 0,
          borderTop: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #E2E8F0",
          background: isDarkMode ? "#0F111E" : "#FFFFFF",
          padding: isSheet
            ? (keyboardHeight > 0
                ? "8px 14px 12px"
                : "10px 14px calc(14px + env(safe-area-inset-bottom, 0px))")
            : "10px 14px 12px",
        }}
      >
        {imageAttachment && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            padding: "8px 12px", marginBottom: 8,
            borderRadius: 12,
            background: isDarkMode ? "#1A1D30" : "#F8FAFC",
            border: isDarkMode ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid #E2E8F0",
            boxShadow: isDarkMode ? "0 2px 8px rgba(0,0,0,0.2)" : "0 2px 6px rgba(15, 23, 42, 0.03)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <img
                src={imageAttachment.dataUrl}
                alt="Aperçu"
                style={{
                  width: 38, height: 38, objectFit: "cover",
                  borderRadius: 8, flexShrink: 0,
                  border: isDarkMode ? "1.5px solid rgba(255, 255, 255, 0.15)" : "1.5px solid #E2E8F0",
                }}
              />
              <div style={{ minWidth: 0, fontSize: 11.5 }}>
                <div style={{
                  fontWeight: 700,
                  color: isDarkMode ? "#F1F5F9" : "#0F172A",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {imageAttachment.name}
                </div>
                <div style={{ color: isDarkMode ? "#94A3B8" : "#64748B", fontSize: 10.5 }}>
                  Image prête pour l'analyse
                </div>
              </div>
            </div>

            {/* Bouton de retrait épuré avec icône vectorielle moderne */}
            <button
              type="button"
              onClick={() => setImageAttachment(null)}
              style={{
                width: 28, height: 28, minWidth: 28, minHeight: 28, flexShrink: 0,
                borderRadius: 8, padding: 0,
                background: isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#F1F5F9",
                border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #E2E8F0",
                color: isDarkMode ? "#94A3B8" : "#64748B",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s ease",
              }}
              title="Retirer l'image"
              aria-label="Retirer l'image"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#EF4444";
                e.currentTarget.style.background = isDarkMode ? "rgba(239, 68, 68, 0.15)" : "#FEE2E2";
                e.currentTarget.style.borderColor = isDarkMode ? "rgba(239, 68, 68, 0.3)" : "#FCA5A5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isDarkMode ? "#94A3B8" : "#64748B";
                e.currentTarget.style.background = isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#F1F5F9";
                e.currentTarget.style.borderColor = isDarkMode ? "rgba(255, 255, 255, 0.12)" : "#E2E8F0";
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )}

        {/* Capsule intégrée Command Bar */}
        <div style={{
          display: "flex", alignItems: "flex-end", gap: 6,
          background: isDarkMode ? "#171929" : "#F8FAFC",
          border: isDarkMode ? "1.5px solid rgba(255, 255, 255, 0.12)" : "1.5px solid #E2E8F0",
          borderRadius: 18,
          padding: "5px 6px 5px 8px",
          boxShadow: isDarkMode ? "0 2px 6px rgba(0,0,0,0.2)" : "0 2px 6px rgba(15, 23, 42, 0.03)",
        }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: "transparent",
              color: isDarkMode ? "#94A3B8" : "#64748B",
              border: "none",
              cursor: busy ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s ease",
              marginBottom: 2,
            }}
            title="Joindre une image (ou coller avec Ctrl+V)"
            aria-label="Joindre une image"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          <textarea
            ref={inputRef}
            className="mm-agent-cmd-textarea"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onFocus={(e) => {
              e.currentTarget.style.outline = "none";
              e.currentTarget.style.boxShadow = "none";
              setTimeout(() => scrollToBottom(true), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            placeholder={imageAttachment ? "Posez une question sur l'image à Maodo…" : "Demander à Maodo, expliquer une fiche… (Ctrl+V)"}
            style={{
              flex: 1, resize: "none", maxHeight: 110, minHeight: 32, height: 34,
              boxSizing: "border-box", overflowY: "auto", display: "block",
              background: "transparent",
              color: isDarkMode ? "#FFFFFF" : "#0F172A",
              border: "none", outline: "none", boxShadow: "none",
              borderRadius: 0,
              padding: "6px 4px", fontSize: 13, fontFamily: "'Outfit', sans-serif",
            }}
          />

          <button
            type="submit"
            disabled={busy || (!input.trim() && !imageAttachment)}
            style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: (!input.trim() && !imageAttachment)
                ? (isDarkMode ? "rgba(255,255,255,0.06)" : "#E2E8F0")
                : "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)",
              color: (!input.trim() && !imageAttachment)
                ? (isDarkMode ? "#64748B" : "#94A3B8")
                : "#FFFFFF",
              border: "none",
              cursor: busy || (!input.trim() && !imageAttachment) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: (input.trim() || imageAttachment) ? "0 2px 8px rgba(79, 70, 229, 0.3)" : "none",
              transition: "all 0.15s ease",
              marginBottom: 2,
            }}
            aria-label="Envoyer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>
      </form>

      {/* Lightbox pour zoomer sur une image cliquée */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 999999,
            background: "rgba(0, 0, 0, 0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, cursor: "zoom-out",
          }}
        >
          <img
            src={zoomedImage}
            alt="Image agrandie"
            style={{ maxWidth: "95vw", maxHeight: "90vh", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}
          />
        </div>
      )}
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
