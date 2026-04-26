// src/hooks/useHighlight.js
import { useCallback } from "react";

export const useHighlight = () => {
  return useCallback((text) => {
    if (!text || typeof text !== "string") return text;
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    return text.replace(codeBlockRegex, (_, lang, code) => {
      try {
        if (window.hljs) {
          const highlighted = lang && window.hljs.getLanguage(lang)
            ? window.hljs.highlight(code, { language: lang }).value
            : window.hljs.highlightAuto(code).value;
          return `<pre><code class="hljs ${lang}">${highlighted}</code></pre>`;
        }
      } catch {}
      return `<pre><code>${code}</code></pre>`;
    });
  }, []);
};