// richContent.js — Rendu markdown léger pour fiches god-tier
// Supporte : code fenced ```lang ... ```, tables GFM, titres, gras, italique,
// inline code, listes, citations, liens. Aucun import externe.
//
// API : renderRich(text, highlightCode?) -> string HTML
//   - text : contenu markdown brut (string)
//   - highlightCode : fonction optionnelle (str) => htmlStr, pour le surlignage
//     des fenced code blocks et du contenu sans markdown détectable.

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const detectRichness = (text) => {
  if (!text) return { fence: false, table: false, md: false };
  const fence = /```/.test(text);
  const table = /(^|\n)\s*\|.+\|\s*\n\s*\|[\s\-:|]+\|/.test(text);
  const md =
    /(^|\n)#{1,6}\s/.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text) ||
    /(^|\n)\s*[-*+]\s+/.test(text) ||
    /(^|\n)\s*\d+\.\s+/.test(text) ||
    /(^|\n)>\s+/.test(text) ||
    /`[^`\n]+`/.test(text);
  return { fence, table, md };
};

// ── Tables GFM ────────────────────────────────────────────────────────────────
const renderTable = (lines) => {
  const split = (l) =>
    l
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());
  const header = split(lines[0]);
  const align = split(lines[1]).map((s) => {
    const l = s.startsWith(":"),
      r = s.endsWith(":");
    return r && l ? "center" : r ? "right" : l ? "left" : null;
  });
  const rows = lines.slice(2).map(split);
  const th = header
    .map(
      (h, i) =>
        `<th style="padding:8px 12px;border-bottom:2px solid currentColor;text-align:${
          align[i] || "left"
        };font-weight:700;">${inline(h)}</th>`
    )
    .join("");
  const trs = rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c, i) =>
              `<td style="padding:6px 12px;border-bottom:1px solid #8884;text-align:${
                align[i] || "left"
              };vertical-align:top;">${inline(c)}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `<div style="margin:10px 0;max-width:100%;"><table style="border-collapse:collapse;font-size:13px;width:100%;table-layout:fixed;word-break:break-word;overflow-wrap:anywhere;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
};

// ── Inline (gras, italique, code, liens) ──────────────────────────────────────
const inline = (s) => {
  let out = escapeHtml(s);
  // inline code
  out = out.replace(
    /`([^`\n]+)`/g,
    '<code style="background:#8882;padding:1px 6px;border-radius:6px;font-family:\'JetBrains Mono\',monospace;font-size:0.9em;">$1</code>'
  );
  // bold
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // italic
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // links
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" style="color:#4D6BFE;text-decoration:underline;">$1</a>'
  );
  return out;
};

// ── Pipeline principal ────────────────────────────────────────────────────────
const mdToHtml = (text, highlightCode) => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const raw = buf.join("\n");
      const inner = highlightCode ? highlightCode(raw) : escapeHtml(raw);
      out.push(
        `<pre style="background:#0d1117;color:#e6edf3;padding:14px 16px;border-radius:12px;margin:10px 0;font-family:'JetBrains Mono',monospace;font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;max-width:100%;"><code data-lang="${escapeHtml(
          lang
        )}" style="white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;display:block;">${inner}</code></pre>`
      );
      continue;
    }

    // GFM table
    if (
      /^\s*\|.+\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|[\s\-:|]+\|\s*$/.test(lines[i + 1])
    ) {
      const tbl = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        tbl.push(lines[i]);
        i++;
      }
      out.push(renderTable(tbl));
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const lvl = h[1].length;
      const size = [20, 18, 16, 15, 14, 13][lvl - 1];
      out.push(
        `<h${lvl} style="font-size:${size}px;font-weight:800;margin:12px 0 6px;">${inline(
          h[2]
        )}</h${lvl}>`
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote style="border-left:3px solid #4D6BFE;padding:6px 12px;margin:8px 0;color:inherit;opacity:0.85;font-style:italic;">${inline(
          buf.join(" ")
        )}</blockquote>`
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out.push(
        `<ul style="margin:6px 0;padding-left:22px;">${items
          .map((it) => `<li style="margin:3px 0;">${inline(it)}</li>`)
          .join("")}</ul>`
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        `<ol style="margin:6px 0;padding-left:24px;">${items
          .map((it) => `<li style="margin:3px 0;">${inline(it)}</li>`)
          .join("")}</ol>`
      );
      continue;
    }

    // Paragraph (collect until blank line)
    if (line.trim() === "") {
      i++;
      continue;
    }
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(
        /^\s*\|.+\|\s*$/.test(lines[i]) &&
        i + 1 < lines.length &&
        /^\s*\|[\s\-:|]+\|\s*$/.test(lines[i + 1])
      )
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      `<p style="margin:6px 0;line-height:1.6;">${inline(para.join(" "))}</p>`
    );
  }

  return out.join("");
};

export function renderRich(text, highlightCode) {
  if (text == null) return "";
  const s = String(text);
  const { fence, table, md } = detectRichness(s);
  if (!fence && !table && !md) {
    // Aucun markdown : on garde le comportement historique (surlignage simple)
    return highlightCode ? highlightCode(s) : escapeHtml(s).replace(/\n/g, "<br/>");
  }
  return mdToHtml(s, highlightCode);
}

export default renderRich;
