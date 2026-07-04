// src/components/GodTierContent.jsx
//
// Wrapper qui délègue le rendu au composant RichText "god-tier".
// → Vrais tableaux HTML (et non plus du texte brut "| col | col |").
// → Code indenté/coloré, avec auto-indentation des langages à parenthèses
//   (Lisp, Scheme, Clojure) et à accolades (JS, Java…).
// → whiteSpace: pre garanti dans les blocs de code.
//
// L'API reste identique : `<GodTierContent text={...} theme={...} />`.

import React from "react";
import RichText from "./RichText";

export default function GodTierContent({ text, theme, isDarkMode: explicitIsDarkMode }) {
  if (!text) return null;
  // Heuristique pour le mode sombre (utilisée en fallback)
  const bg = theme?.bg || theme?.cardBg || "";
  let isDarkMode = true;
  
  if (typeof explicitIsDarkMode === "boolean") {
    isDarkMode = explicitIsDarkMode;
  } else if (typeof bg === "string" && bg.startsWith("#")) {
    // Convertit hex → luminance ; un bg clair → mode jour
    const m = bg.length === 7 ? bg : null;
    if (m) {
      const r = parseInt(m.slice(1, 3), 16);
      const g = parseInt(m.slice(3, 5), 16);
      const b = parseInt(m.slice(5, 7), 16);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      isDarkMode = lum < 0.5;
    }
  }
  return (
    <div style={{ width: "100%", color: theme?.text || "inherit" }}>
      <RichText content={text} isDarkMode={isDarkMode} style={{ color: theme?.text }} />
    </div>
  );
}
