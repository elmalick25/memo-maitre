// 📖 src/components/ReaderModeModal.jsx
// ============================================================================
// MODE LECTEUR IMMERSIF "GOD-TIER" (NIVEAU 100)
// ============================================================================
// • Épuration intégrale (zéro pub, zéro distraction, typographie haute lisibilité).
// • Lecture Bionique (Bionic Reading) avec fixation visuelle guidée.
// • Thèmes de confort visuel : Sombre Profond, Sépia Doux, Papier Propre, Noir Pur OLED.
// • Réglage de la taille de texte et interlignage dynamique.
// • Synthèse vocale intégrée et création instantanée de fiches de mémorisation FSRS.
// ============================================================================

import React, { useState, useMemo, useEffect } from "react";
import { applyBionicReading, estimateReadingTime } from "../lib/readerUtils.js";
import { extractReadableFromHtml, extractReadableFromMarkdown } from "../lib/articleExtractor.js";

const THEMES = {
  dark: { id: "dark", name: "🌙 Sombre", bg: "#0F172A", text: "#F1F5F9", muted: "#94A3B8", border: "#334155", card: "#1E293B" },
  sepia: { id: "sepia", name: "📜 Sépia", bg: "#FBF0D9", text: "#433422", muted: "#7F6A52", border: "#E6D3B3", card: "#F4E5C7" },
  white: { id: "white", name: "☀️ Papier", bg: "#FFFFFF", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", card: "#F8FAFC" },
  oled: { id: "oled", name: "🖤 Noir OLED", bg: "#000000", text: "#FFFFFF", muted: "#A1A1AA", border: "#27272A", card: "#18181B" },
};

export default function ReaderModeModal({
  article,
  onClose,
  onCreateCard = null,
  showToast = () => {},
}) {
  const [themeKey, setThemeKey] = useState("dark");
  const [fontSize, setFontSize] = useState(18);
  const [isBionic, setIsBionic] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isReadingAloud, setIsReadingAloud] = useState(false);

  const theme = THEMES[themeKey] || THEMES.dark;

  // Extraction du corps de texte lisible
  const cleanBody = useMemo(() => {
    if (!article) return "";
    if (article.fullContent && article.fullContent.length > 100) {
      if (article.fullContent.startsWith("<") || article.fullContent.includes("</")) {
        return extractReadableFromHtml(article.fullContent);
      }
      return extractReadableFromMarkdown(article.fullContent);
    }
    return article.description || article.summary || "";
  }, [article]);

  const readTimeMin = useMemo(() => estimateReadingTime(cleanBody), [cleanBody]);

  // Contenu formaté (Bionique ou Standard)
  const renderedContent = useMemo(() => {
    if (!cleanBody) return "";
    const paragraphs = cleanBody.split("\n\n").filter(Boolean);

    return paragraphs.map((p, idx) => {
      const formatted = isBionic ? applyBionicReading(p) : p;
      return (
        <p
          key={idx}
          style={{
            marginBottom: "1.4em",
            lineHeight: "1.75",
            fontSize: `${fontSize}px`,
          }}
          dangerouslySetInnerHTML={isBionic ? { __html: formatted } : undefined}
        >
          {!isBionic ? p : undefined}
        </p>
      );
    });
  }, [cleanBody, isBionic, fontSize]);

  // Suivi de la barre de progression de lecture
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - clientHeight > 0) {
      const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;
      setScrollProgress(Math.min(100, Math.max(0, progress)));
    }
  };

  // Lecture audio TTS
  const toggleTextToSpeech = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      showToast?.("Synthèse vocale non supportée sur ce navigateur", "error");
      return;
    }

    if (isReadingAloud) {
      window.speechSynthesis.cancel();
      setIsReadingAloud(false);
    } else {
      window.speechSynthesis.cancel();
      const textToRead = `${article.title}. ${cleanBody}`;
      const utterance = new SpeechSynthesisUtterance(textToRead.slice(0, 4000));
      utterance.lang = "fr-FR";
      utterance.rate = 1.0;
      utterance.onend = () => setIsReadingAloud(false);
      utterance.onerror = () => setIsReadingAloud(false);
      window.speechSynthesis.speak(utterance);
      setIsReadingAloud(true);
    }
  };

  // Arrêter l'audio à la fermeture
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!article) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 10000,
        padding: "16px",
        fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
      onClick={onClose}
    >
      {/* ─── BARRE DE CONTRÔLE SUPÉRIEURE ─────────────────────────────────── */}
      <div
        style={{
          width: "100%",
          maxWidth: "840px",
          background: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: "16px 16px 0 0",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          position: "relative",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barre de progression de lecture */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: "3px",
            width: `${scrollProgress}%`,
            background: "#8B5CF6",
            transition: "width 0.1s ease-out",
          }}
        />

        {/* Info source & temps de lecture */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>{article.emoji || "📰"}</span>
          <div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: theme.text }}>
              {article.source || "Article"}
            </div>
            <div style={{ fontSize: "11px", color: theme.muted }}>
              ⏱️ {readTimeMin} min de lecture • {Math.round(scrollProgress)}% lu
            </div>
          </div>
        </div>

        {/* Contrôles du Lecteur : Thème, Taille, Bionic, Audio */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Toggle Bionic Reading */}
          <button
            onClick={() => setIsBionic(!isBionic)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: isBionic ? "1px solid #8B5CF6" : `1px solid ${theme.border}`,
              background: isBionic ? "rgba(139, 92, 246, 0.2)" : "transparent",
              color: isBionic ? "#8B5CF6" : theme.text,
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
            }}
            title="Active la mise en gras des débuts de mots pour une lecture ultra-rapide"
          >
            ⚡ <strong>Bio</strong>nic
          </button>

          {/* Sélecteur de Taille de Police */}
          <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "2px" }}>
            <button
              onClick={() => setFontSize((s) => Math.max(14, s - 2))}
              style={{ padding: "4px 8px", background: "transparent", border: "none", color: theme.text, cursor: "pointer", fontSize: "12px", fontWeight: "700" }}
              title="Diminuer la taille du texte"
            >
              A-
            </button>
            <span style={{ fontSize: "11px", color: theme.muted, padding: "0 4px" }}>{fontSize}px</span>
            <button
              onClick={() => setFontSize((s) => Math.min(26, s + 2))}
              style={{ padding: "4px 8px", background: "transparent", border: "none", color: theme.text, cursor: "pointer", fontSize: "14px", fontWeight: "700" }}
              title="Agrandir la taille du texte"
            >
              A+
            </button>
          </div>

          {/* Sélecteur de Thème */}
          <select
            value={themeKey}
            onChange={(e) => setThemeKey(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: `1px solid ${theme.border}`,
              background: theme.bg,
              color: theme.text,
              fontSize: "11px",
              fontWeight: "600",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {Object.values(THEMES).map((t) => (
              <option key={t.id} value={t.id} style={{ background: t.bg, color: t.text }}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Synthèse Vocale */}
          <button
            onClick={toggleTextToSpeech}
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: "none",
              background: isReadingAloud ? "#EF4444" : "#10B981",
              color: "#FFFFFF",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
            }}
            title={isReadingAloud ? "Arrêter la lecture" : "Écouter l'article"}
          >
            {isReadingAloud ? "⏹️ Stop" : "🔊 Écouter"}
          </button>

          {/* Fermer */}
          <button
            onClick={onClose}
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: "none",
              background: "rgba(255,255,255,0.1)",
              color: theme.text,
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ─── CORPS DE L'ARTICLE ÉPURÉ ─────────────────────────────────────── */}
      <div
        onScroll={handleScroll}
        style={{
          width: "100%",
          maxWidth: "840px",
          flex: 1,
          background: theme.bg,
          color: theme.text,
          borderLeft: `1px solid ${theme.border}`,
          borderRight: `1px solid ${theme.border}`,
          borderBottom: `1px solid ${theme.border}`,
          borderRadius: "0 0 16px 16px",
          padding: "36px 44px 60px",
          overflowY: "auto",
          boxSizing: "border-box",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Titre & Métadonnées */}
        <h1
          style={{
            margin: "0 0 16px 0",
            fontSize: `${fontSize * 1.55}px`,
            fontWeight: "800",
            lineHeight: "1.25",
            letterSpacing: "-0.5px",
          }}
        >
          {article.title}
        </h1>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "12px",
            color: theme.muted,
            marginBottom: "28px",
            paddingBottom: "16px",
            borderBottom: `1px solid ${theme.border}`,
            flexWrap: "wrap",
          }}
        >
          <span>✍️ {article.author || article.source}</span>
          {article.pubDate && <span>📅 {new Date(article.pubDate).toLocaleDateString("fr-FR")}</span>}
          {article.link && (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#8B5CF6", textDecoration: "none", fontWeight: "600" }}
            >
              🔗 Source originale
            </a>
          )}
        </div>

        {/* Image principale si présente */}
        {article.image && (
          <div style={{ marginBottom: "28px", borderRadius: "12px", overflow: "hidden" }}>
            <img
              src={article.image}
              alt={article.title}
              style={{ width: "100%", maxHeight: "400px", objectFit: "cover", display: "block" }}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
        )}

        {/* Texte de l'article */}
        <div style={{ maxWidth: "700px", margin: "0 auto" }}>
          {renderedContent}
        </div>

        {/* Barre d'action inférieure : Fiche FSRS */}
        <div
          style={{
            marginTop: "40px",
            paddingTop: "20px",
            borderTop: `1px solid ${theme.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ fontSize: "12px", color: theme.muted }}>
            Fin de l'article • {article.source}
          </div>

          {onCreateCard && (
            <button
              onClick={() => {
                onCreateCard({
                  front: article.title,
                  back: cleanBody.slice(0, 400),
                  category: "Veille & Actus",
                });
                showToast?.("Fiche ajoutée à MemoMaster !", "success");
              }}
              style={{
                background: "#8B5CF6",
                color: "#FFFFFF",
                border: "none",
                padding: "8px 16px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              🧠 Mémoriser avec FSRS
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
