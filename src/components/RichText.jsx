// src/components/RichText.jsx
// Rendu Markdown "God-Tier" pour les fiches MemoMaster.
//
// CORRECTIFS livrés :
//   1. Les TABLEAUX Markdown sont rendus comme de VRAIS <table> stylisés
//      (header sticky, lignes alternées, hover, scroll horizontal, thème
//      jour/nuit). Plus de conversion forcée en liste à puces.
//   2. Le CODE est toujours indenté/coloré correctement, même quand l'IA
//      le livre "plat" (tout sur une ligne ou sans retours). Un
//      pretty-printer générique gère les langages à parenthèses
//      (Common Lisp, Scheme, Clojure) et à accolades (JS, Java, C…).
//   3. Détection auto du langage améliorée (ajout de plus d'alias, fallback
//      heuristique). Le bloc reste lisible même sans fence ```.
//   4. whiteSpace: "pre" garanti sur tous les <pre>/<code> blocs pour
//      préserver l'indentation reçue.

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

// ───────────────────────────────────────────────────────────────────────────
// Langages reconnus
// ───────────────────────────────────────────────────────────────────────────
const LANG_ALIASES = {
  python: "python", py: "python",
  javascript: "javascript", js: "javascript",
  typescript: "typescript", ts: "typescript", tsx: "tsx", jsx: "jsx",
  java: "java", kotlin: "kotlin", swift: "swift",
  "common-lisp": "lisp", commonlisp: "lisp", cl: "lisp", lisp: "lisp",
  clojure: "clojure", clj: "clojure", scheme: "scheme", racket: "scheme",
  c: "c", "c++": "cpp", cpp: "cpp", "c#": "csharp", csharp: "csharp",
  rust: "rust", rs: "rust", go: "go", golang: "go", ruby: "ruby", rb: "ruby",
  php: "php", html: "html", css: "css", scss: "scss", sass: "scss",
  json: "json", yaml: "yaml", yml: "yaml", xml: "xml", toml: "toml",
  sql: "sql", bash: "bash", shell: "bash", sh: "bash", zsh: "bash",
  haskell: "haskell", hs: "haskell", elixir: "elixir", ex: "elixir",
  erlang: "erlang", scala: "scala", dart: "dart", r: "r", matlab: "matlab",
  perl: "perl", lua: "lua", powershell: "powershell", ps1: "powershell",
};

const PAREN_LANGS = new Set(["lisp", "clojure", "scheme"]);
const BRACE_LANGS = new Set([
  "javascript", "typescript", "tsx", "jsx", "java", "c", "cpp",
  "csharp", "rust", "go", "kotlin", "swift", "scala", "php", "dart",
]);

// ───────────────────────────────────────────────────────────────────────────
// Pretty-printer "indent on the fly" — utilisé quand le code arrive plat
// ───────────────────────────────────────────────────────────────────────────
function indentParenLang(src) {
  // Formatte du code lispien sans casser les chaînes ni les commentaires.
  let out = "";
  let depth = 0;
  let i = 0;
  const writeIndent = () => { out += "\n" + "  ".repeat(Math.max(depth, 0)); };
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      out += c; i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i]; i++;
      }
      if (i < src.length) { out += src[i]; i++; }
      continue;
    }
    if (c === ";") {
      while (i < src.length && src[i] !== "\n") { out += src[i]; i++; }
      continue;
    }
    if (c === "(") { writeIndent(); out += "("; depth++; i++; continue; }
    if (c === ")") { depth = Math.max(0, depth - 1); out += ")"; i++; continue; }
    if (c === "\n" || c === "\r") { i++; continue; }
    // collapse runs of whitespace
    if (/\s/.test(c)) {
      if (out.length && !/\s/.test(out[out.length - 1])) out += " ";
      i++; continue;
    }
    out += c; i++;
  }
  return out.trim();
}

function indentBraceLang(src) {
  let out = "";
  let depth = 0;
  let i = 0;
  const nl = () => { out += "\n" + "  ".repeat(Math.max(depth, 0)); };
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c; out += c; i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < src.length) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i]; i++;
      }
      if (i < src.length) { out += src[i]; i++; }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") { out += src[i]; i++; }
      continue;
    }
    if (c === "{") { out += "{"; depth++; nl(); i++; continue; }
    if (c === "}") { depth = Math.max(0, depth - 1); nl(); out += "}"; i++; continue; }
    if (c === ";") { out += ";"; nl(); i++; while (i < src.length && /\s/.test(src[i])) i++; continue; }
    if (c === "\n" || c === "\r") { i++; continue; }
    if (/\s/.test(c)) {
      if (out.length && !/\s|\n/.test(out[out.length - 1])) out += " ";
      i++; continue;
    }
    out += c; i++;
  }
  return out.split("\n").map(l => l.trimEnd()).filter((l, idx, arr) => !(l === "" && arr[idx - 1] === "")).join("\n").trim();
}

function autoIndentCode(code, lang) {
  if (!code) return code;
  const lineCount = code.split("\n").length;
  const hasIndent = /\n[ \t]+\S/.test(code);
  // Si le code a déjà des sauts de ligne ET de l'indentation, on respecte.
  if (lineCount > 1 && hasIndent) return code;
  try {
    if (PAREN_LANGS.has(lang)) return indentParenLang(code);
    if (BRACE_LANGS.has(lang)) return indentBraceLang(code);
  } catch { /* fall through */ }
  return code;
}

// Détection heuristique du langage à partir du contenu
function sniffLanguage(code) {
  if (!code || typeof code !== "string") return null;
  const s = code;
  // Lisp / Scheme / Clojure
  if (/^\s*\(\s*(defun|defvar|defparameter|defmacro|let\*?|lambda|cond|car|cdr|cons)\b/m.test(s)) return "lisp";
  if (/^\s*\(\s*(ns|defn|def|fn)\b/m.test(s)) return "clojure";
  // Python
  if (/^\s*(def |class |import |from .+ import |print\()/m.test(s)) return "python";
  // Java
  if (/\b(public|private|protected)\s+(static\s+)?(class|void|int|String|boolean)\b/.test(s)
      || /^\s*import\s+java\./m.test(s)
      || /System\.out\.println/.test(s)) return "java";
  // TypeScript / JS
  if (/\b(interface|type)\s+\w+\s*[=<{]/.test(s) || /:\s*(string|number|boolean)\b/.test(s)) return "typescript";
  if (/\b(const|let|var)\s+\w+\s*=/.test(s) || /=>\s*[{(]/.test(s) || /console\.log\(/.test(s)) return "javascript";
  // C / C++
  if (/#include\s*<[^>]+>/.test(s) || /\bstd::/.test(s)) return "cpp";
  // Rust
  if (/\bfn\s+\w+\s*\(/.test(s) && /->\s*\w+/.test(s)) return "rust";
  // Go
  if (/^\s*package\s+\w+/m.test(s) && /\bfunc\s+\w+\s*\(/.test(s)) return "go";
  // HTML / XML
  if (/^\s*<\/?[a-zA-Z][^>]*>/m.test(s)) return "html";
  // CSS
  if (/^[.#]?\w+\s*\{[^}]*:[^}]*\}/m.test(s)) return "css";
  // JSON
  if (/^\s*[{\[]/.test(s.trim()) && /"\s*:\s*/.test(s)) return "json";
  // SQL
  if (/\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE)\b/i.test(s)) return "sql";
  // Bash
  if (/^\s*(#!\/bin\/(ba)?sh|sudo |apt-get |npm |yarn |git )/m.test(s)) return "bash";
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Pré-traitement du contenu Markdown
// ───────────────────────────────────────────────────────────────────────────
function preprocessContent(content) {
  if (!content || typeof content !== "string") return "";
  let text = content.replace(/\r\n?/g, "\n");

  // Fenced code block manquant : si la 1re ligne non vide est un nom de
  // langage seul, on encapsule le reste.
  if (!/```/.test(text)) {
    const lines = text.split("\n");
    const idx = lines.findIndex(l => l.trim().length > 0);
    if (idx >= 0) {
      const candidate = lines[idx].trim().toLowerCase().replace(/[:.,;]$/, "");
      const lang = LANG_ALIASES[candidate];
      if (lang) {
        const before = lines.slice(0, idx).join("\n");
        const after = lines.slice(idx + 1).join("\n");
        text = `${before}${before ? "\n" : ""}\`\`\`${lang}\n${after.trim()}\n\`\`\``;
      } else {
        // Heuristique générique : indices forts de code
        const all = lines.length;
        const codey = lines.filter(l =>
          /^\s{2,}\S/.test(l) || /[;{}]\s*$/.test(l) ||
          /^\s*[(\[]/.test(l) || /=>\s*/.test(l) ||
          /^\s*(def|class|function|fn|let|const|var|public|private)\b/.test(l)
        ).length;
        if (all >= 3 && codey / all >= 0.5) {
          text = `\`\`\`\n${text}\n\`\`\``;
        }
      }
    }
  }

  // Listes "• texte" → "- texte"
  text = text.replace(/^[•·]\s+/gm, "- ");

  // Sauts de ligne avant les titres emoji
  const SECTION_EMOJI = /^([\u{1F300}-\u{1FFFF}✅🚫💬🎬🔄⚙️💡💻⚠️📌🔑⚡🌟❗❓✨🗣📋🧭🔁])\s+([A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ][^:\n]*:?)/gmu;
  text = text.replace(SECTION_EMOJI, (_, emoji, title) => `\n**${emoji} ${title}**`);

  return text;
}

// ───────────────────────────────────────────────────────────────────────────
// Composant principal
// ───────────────────────────────────────────────────────────────────────────
const styleCodeScroll = `
  .code-scroll-wrapper::-webkit-scrollbar {
    height: 12px !important;
  }
  .code-scroll-wrapper::-webkit-scrollbar-track {
    background: rgba(128, 128, 128, 0.1) !important;
    border-radius: 12px;
  }
  .code-scroll-wrapper::-webkit-scrollbar-thumb {
    background: rgba(77, 107, 254, 0.5) !important;
    border-radius: 12px;
    border: 2px solid transparent;
    background-clip: content-box !important;
  }
  .code-scroll-wrapper::-webkit-scrollbar-thumb:hover {
    background: rgba(77, 107, 254, 0.8) !important;
    background-clip: content-box !important;
  }
`;

export default function RichText({ content, style = {}, isDarkMode = true }) {
  const processed = useMemo(() => preprocessContent(content), [content]);

  const tableBorder = isDarkMode ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.10)";
  const tableHeaderBg = isDarkMode
    ? "linear-gradient(180deg, rgba(77,107,254,0.25), rgba(77,107,254,0.12))"
    : "linear-gradient(180deg, rgba(77,107,254,0.18), rgba(77,107,254,0.06))";
  const tableRowAltBg = isDarkMode ? "rgba(255,255,255,0.025)" : "rgba(15,23,42,0.025)";
  const textColor = isDarkMode ? "#E6EDFF" : "#0F172A";
  const codeTheme = isDarkMode ? vscDarkPlus : oneLight;
  const codeBg = isDarkMode ? "#1e1e1e" : "#FAFAFA";

  return (
    <div className="rich-text-renderer" style={{ ...baseStyle, color: textColor, ...style }}>
      <style>{styleCodeScroll}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Blocs de code ────────────────────────────────────────────
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            let lang = match ? (LANG_ALIASES[match[1].toLowerCase()] || match[1]) : "text";
            let codeString = String(children).replace(/\n$/, "");
            // Si pas de langue fournie (ou "text"), tenter une détection auto
            if ((!match || lang === "text") && !inline) {
              const sniffed = sniffLanguage(codeString);
              if (sniffed) lang = sniffed;
            }

            if (!inline && (match || codeString.includes("\n") || codeString.length > 60)) {
              codeString = autoIndentCode(codeString, lang);
              const langLabel = (lang && lang !== "text" ? lang : "code").toUpperCase();
              return (
                <div style={{
                  margin: "12px 0",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `1px solid ${isDarkMode ? "rgba(77,107,254,0.25)" : "rgba(77,107,254,0.18)"}`,
                  background: codeBg,
                  boxShadow: isDarkMode ? "0 6px 18px rgba(0,0,0,0.18)" : "0 6px 18px rgba(77,107,254,0.08)",
                  maxWidth: "100%",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: isDarkMode
                      ? "linear-gradient(180deg, #2a2d3a 0%, #1f222e 100%)"
                      : "linear-gradient(180deg, #F0F2FA 0%, #E4E8F7 100%)",
                    padding: "6px 12px",
                    borderBottom: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)"}`,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57", display: "inline-block" }} />
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E", display: "inline-block" }} />
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840", display: "inline-block" }} />
                      <span style={{ marginLeft: 10, fontSize: 10, fontWeight: 800, color: isDarkMode ? "#7B93FF" : "#4D6BFE", letterSpacing: "0.08em" }}>
                        {langLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => { try { await navigator.clipboard.writeText(codeString); } catch { /* noop */ } }}
                      style={{
                        background: isDarkMode ? "rgba(123,147,255,0.12)" : "rgba(77,107,254,0.10)",
                        border: `1px solid ${isDarkMode ? "rgba(123,147,255,0.25)" : "rgba(77,107,254,0.25)"}`,
                        color: isDarkMode ? "#B9C8FF" : "#4D6BFE",
                        fontSize: 10, fontWeight: 700, padding: "3px 9px",
                        borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                      }}
                      title="Copier le code"
                    >
                      ⧉ Copier
                    </button>
                  </div>
                  <SyntaxHighlighter
                    className="code-scroll-wrapper"
                    style={codeTheme}
                    language={lang}
                    PreTag="div"
                    customStyle={{
                      margin: 0, borderRadius: 0,
                      fontSize: "13px", lineHeight: 1.65,
                      padding: "14px 16px",
                      background: codeBg,
                      // ── Plus de scroll horizontal : tout le code reste visible
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                      overflowX: "visible",
                      overflowY: "visible",
                      maxWidth: "100%",
                    }}
                    codeTagProps={{ style: { whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere", fontFamily: "'JetBrains Mono','Fira Code',monospace", display: "block", width: "100%" } }}
                    showLineNumbers={codeString.split("\n").length > 3}
                    wrapLongLines={true}
                    lineNumberStyle={{ minWidth: "2.25em", paddingRight: "1em", textAlign: "right", verticalAlign: "top", opacity: 0.55, userSelect: "none" }}
                    lineProps={() => ({ style: { display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere" } })}
                    {...props}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              );
            }

            // Inline code
            return (
              <code
                style={{
                  background: isDarkMode ? "rgba(77,107,254,0.14)" : "rgba(77,107,254,0.08)",
                  color: isDarkMode ? "#7B93FF" : "#4D6BFE",
                  padding: "2px 6px",
                  borderRadius: 5,
                  fontFamily: "'JetBrains Mono','Fira Code',monospace",
                  fontSize: "0.88em",
                  fontWeight: 600,
                }}
                {...props}
              >
                {children}
              </code>
            );
          },

          p({ children }) { return <p style={{ margin: "6px 0", lineHeight: 1.65 }}>{children}</p>; },
          strong({ children }) {
            return (
              <strong style={{
                display: "block", marginTop: 10, marginBottom: 4,
                fontSize: 13, fontWeight: 800,
                color: isDarkMode ? "#7B93FF" : "#4D6BFE",
                letterSpacing: "0.02em",
              }}>{children}</strong>
            );
          },
          ul({ children }) { return <ul style={{ margin: "6px 0", paddingLeft: 20, lineHeight: 1.65 }}>{children}</ul>; },
          ol({ children }) { return <ol style={{ margin: "6px 0", paddingLeft: 20, lineHeight: 1.65 }}>{children}</ol>; },
          li({ children }) { return <li style={{ marginBottom: 3 }}>{children}</li>; },

          // ── VRAIS tableaux ───────────────────────────────────────────
          table({ children }) {
            return (
              <div className="rich-table-wrap" style={{
                margin: "14px 0",
                // ── Plus de scroll horizontal : le tableau s'adapte à la fiche
                overflowX: "visible",
                maxWidth: "100%",
                borderRadius: 12,
                border: `1px solid ${tableBorder}`,
                boxShadow: isDarkMode ? "0 4px 14px rgba(0,0,0,0.25)" : "0 4px 14px rgba(15,23,42,0.06)",
              }}>
                <style>{`
                  .rich-table-wrap table tbody tr:nth-child(even) td {
                    background: ${isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.025)"};
                  }
                  .rich-table-wrap table tbody tr:hover td {
                    background: ${isDarkMode ? "rgba(123,147,255,0.08)" : "rgba(77,107,254,0.06)"};
                  }
                `}</style>
                <table style={{
                  width: "100%",
                  tableLayout: "fixed",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "inherit",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                }}>
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead style={{ background: tableHeaderBg }}>{children}</thead>;
          },
          tbody({ children }) { return <tbody>{children}</tbody>; },
          tr({ children, ...props }) {
            // Lignes alternées via :nth-child impossible inline → handled par td bg via index n'est pas trivial,
            // on garde un style neutre et on délègue à td.
            return <tr {...props}>{children}</tr>;
          },
          th({ children, style: thStyle }) {
            return (
              <th style={{
                padding: "10px 14px",
                textAlign: "left",
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: isDarkMode ? "#B9C8FF" : "#4D6BFE",
                borderBottom: `1px solid ${tableBorder}`,
                position: "sticky",
                top: 0,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                whiteSpace: "normal",
                ...thStyle,
              }}>{children}</th>
            );
          },
          td({ children, style: tdStyle }) {
            return (
              <td style={{
                padding: "10px 14px",
                verticalAlign: "top",
                borderBottom: `1px solid ${tableBorder}`,
                fontSize: 13,
                fontWeight: 500,
                // ── Force un texte foncé, plus de cellules délavées
                color: isDarkMode ? "#E6EDFF" : "#0F172A",
                opacity: 1,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                whiteSpace: "normal",
                ...tdStyle,
              }}>{children}</td>
            );
          },

          hr() {
            return <hr style={{ border: "none", borderTop: `1px solid ${tableBorder}`, margin: "10px 0" }} />;
          },
          blockquote({ children }) {
            return (
              <blockquote style={{
                borderLeft: `3px solid ${isDarkMode ? "#7B93FF" : "#4D6BFE"}`,
                paddingLeft: 12,
                margin: "8px 0",
                color: "inherit",
                opacity: 0.85,
                fontStyle: "italic",
              }}>{children}</blockquote>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

const baseStyle = {
  fontSize: 14,
  lineHeight: 1.65,
  wordBreak: "break-word",
};
