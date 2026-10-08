// 🌐 src/components/CustomFeedManagerModal.jsx
// ============================================================================
// GESTIONNAIRE UNIVERSEL DE FLUX PERSONNALISÉS (NIVEAU 100)
// ============================================================================
// • Ajout de n'importe quelle source/URL dans le monde (Auto-Discovery).
// • Évaluation de la fiabilité (Badges officiels et Trust Score).
// • Organisation par Catégories, Emojis, Activation/Désactivation.
// • Import / Export standardisé OPML pour sauvegarder sa veille.
// ============================================================================

import React, { useState, useRef } from "react";
import { autoDiscoverFeed, evaluateSourceTrust } from "../lib/feedEngine.js";
import { generateOpml, parseOpml } from "../lib/readerUtils.js";
import { safeStorage } from "../lib/safeStorage.js";

const CUSTOM_FEEDS_KEY = "tech_intel_custom_feeds_v2";

export default function CustomFeedManagerModal({
  isOpen,
  onClose,
  onFeedsUpdated,
  isDarkMode = false,
  showToast = () => {},
}) {
  const [customFeeds, setCustomFeeds] = useState(() => {
    try {
      const v2 = safeStorage.get(CUSTOM_FEEDS_KEY);
      if (v2) return JSON.parse(v2);
      const v1 = safeStorage.get("tech_intel_custom_feeds_v1");
      if (v1) return JSON.parse(v1);
      return [];
    } catch {
      return [];
    }
  });

  const [inputUrl, setInputUrl] = useState("");
  const [feedName, setFeedName] = useState("");
  const [category, setCategory] = useState("general");
  const [emoji, setEmoji] = useState("📰");
  const [isValidating, setIsValidating] = useState(false);
  const [discoveredInfo, setDiscoveredInfo] = useState(null);
  const [activeTab, setActiveTab] = useState("add"); // 'add' | 'manage' | 'opml'

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Auto-découverte et validation du flux
  const handleValidateUrl = async () => {
    if (!inputUrl.trim()) {
      showToast?.("Veuillez saisir une URL", "error");
      return;
    }
    setIsValidating(true);
    setDiscoveredInfo(null);

    try {
      const discovery = await autoDiscoverFeed(inputUrl);
      const trust = evaluateSourceTrust(discovery.feedUrl, feedName || inputUrl);
      
      setDiscoveredInfo({
        feedUrl: discovery.feedUrl,
        candidates: discovery.candidateFeeds || [],
        trust,
      });

      if (!feedName) {
        try {
          const domain = new URL(inputUrl).hostname.replace(/^www\./, "");
          setFeedName(domain.charAt(0).toUpperCase() + domain.slice(1));
        } catch {
          setFeedName("Flux Découvert");
        }
      }

      showToast?.("Flux détecté avec succès !", "success");
    } catch (e) {
      showToast?.(`Échec de détection : ${e.message}`, "error");
    } finally {
      setIsValidating(false);
    }
  };

  // Ajout du flux à la liste
  const handleAddFeed = () => {
    const finalUrl = discoveredInfo ? discoveredInfo.feedUrl : inputUrl.trim();
    if (!finalUrl) {
      showToast?.("URL invalide", "error");
      return;
    }

    const trust = evaluateSourceTrust(finalUrl, feedName);
    const newFeed = {
      id: `feed_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: feedName.trim() || "Source Personnalisée",
      url: finalUrl,
      category,
      emoji,
      color: "var(--mm-primary)",
      enabled: true,
      trust,
      addedAt: Date.now(),
    };

    const updated = [...customFeeds, newFeed];
    setCustomFeeds(updated);
    safeStorage.set(CUSTOM_FEEDS_KEY, JSON.stringify(updated));
    onFeedsUpdated?.(updated);

    // Reset formulaire
    setInputUrl("");
    setFeedName("");
    setDiscoveredInfo(null);
    showToast?.(`Source "${newFeed.name}" ajoutée !`, "success");
    setActiveTab("manage");
  };

  // Basculer l'état actif/inactif
  const toggleFeedEnabled = (id) => {
    const updated = customFeeds.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f));
    setCustomFeeds(updated);
    safeStorage.set(CUSTOM_FEEDS_KEY, JSON.stringify(updated));
    onFeedsUpdated?.(updated);
  };

  // Supprimer un flux
  const handleDeleteFeed = (id) => {
    const updated = customFeeds.filter((f) => f.id !== id);
    setCustomFeeds(updated);
    safeStorage.set(CUSTOM_FEEDS_KEY, JSON.stringify(updated));
    onFeedsUpdated?.(updated);
    showToast?.("Flux supprimé.", "info");
  };

  // Export OPML
  const handleExportOpml = () => {
    const opmlText = generateOpml(customFeeds, "MemoMaster Feeds Export");
    const blob = new Blob([opmlText], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memomaster_feeds_${new Date().toISOString().split("T")[0]}.opml`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.("Fichier OPML téléchargé !", "success");
  };

  // Import OPML
  const handleImportOpml = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result;
        const imported = parseOpml(text);
        if (imported.length === 0) {
          showToast?.("Aucun flux valide trouvé dans le fichier OPML", "error");
          return;
        }

        const existingUrls = new Set(customFeeds.map((f) => f.url));
        const newOnes = imported.filter((f) => !existingUrls.has(f.url));
        const merged = [...customFeeds, ...newOnes];

        setCustomFeeds(merged);
        safeStorage.set(CUSTOM_FEEDS_KEY, JSON.stringify(merged));
        onFeedsUpdated?.(merged);
        showToast?.(`${newOnes.length} nouveaux flux importés avec succès !`, "success");
      } catch {
        showToast?.("Erreur lors de la lecture du fichier OPML", "error");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10001,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          maxHeight: "85vh",
          background: isDarkMode ? "#0F172A" : "#FFFFFF",
          color: isDarkMode ? "#F8FAFC" : "#0F172A",
          border: isDarkMode ? "1px solid rgba(255,255,255,0.15)" : "1px solid #CBD5E1",
          borderRadius: "20px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px" }}>📡</span>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "800" }}>
              Gestionnaire Universel de Sources & Flux
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: isDarkMode ? "#94A3B8" : "#64748B", fontSize: "18px", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* Onglets internes */}
        <div style={{ display: "flex", gap: "8px", borderBottom: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid #E2E8F0", paddingBottom: "10px" }}>
          <button
            onClick={() => setActiveTab("add")}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "add" ? "var(--mm-primary)" : "transparent",
              color: activeTab === "add" ? "#FFFFFF" : isDarkMode ? "#94A3B8" : "#64748B",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            ➕ Ajouter une Source
          </button>
          <button
            onClick={() => setActiveTab("manage")}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "manage" ? "var(--mm-primary)" : "transparent",
              color: activeTab === "manage" ? "#FFFFFF" : isDarkMode ? "#94A3B8" : "#64748B",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            📋 Mes Sources ({customFeeds.length})
          </button>
          <button
            onClick={() => setActiveTab("opml")}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "opml" ? "var(--mm-primary)" : "transparent",
              color: activeTab === "opml" ? "#FFFFFF" : isDarkMode ? "#94A3B8" : "#64748B",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            🔄 Import / Export OPML
          </button>
        </div>

        {/* ── ONGLET 1 : AJOUTER UNE SOURCE ───────────────────────────────── */}
        {activeTab === "add" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <p style={{ margin: 0, fontSize: "13px", color: isDarkMode ? "#94A3B8" : "#64748B" }}>
              Entrez n'importe quelle URL de site (ex: <code>https://lemonde.fr</code>, <code>https://techcrunch.com</code> ou <code>https://campusfrance.org</code>). Le moteur découvrira et validera automatiquement le flux.
            </p>

            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://exemple.com ou https://exemple.com/rss"
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: isDarkMode ? "1px solid rgba(255,255,255,0.2)" : "1px solid #CBD5E1",
                  background: isDarkMode ? "rgba(15, 23, 42, 0.6)" : "#F8FAFC",
                  color: isDarkMode ? "#F8FAFC" : "#0F172A",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
              <button
                onClick={handleValidateUrl}
                disabled={isValidating}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "none",
                  background: "var(--mm-primary)",
                  color: "#FFFFFF",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: isValidating ? "wait" : "pointer",
                }}
              >
                {isValidating ? "⏳ Détection..." : "🔍 Détecter"}
              </button>
            </div>

            {/* Résultat de détection */}
            {discoveredInfo && (
              <div
                style={{
                  background: isDarkMode ? "rgba(30, 41, 59, 0.8)" : "#F1F5F9",
                  border: "1px solid color-mix(in srgb, var(--mm-primary) 30.0%, transparent)",
                  borderRadius: "12px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#10B981" }}>
                    ✅ Flux détecté : {discoveredInfo.feedUrl}
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--mm-primary)" }}>
                    {discoveredInfo.trust.badgeEmoji} {discoveredInfo.trust.categoryLabel}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "11px", fontWeight: "700", color: isDarkMode ? "#94A3B8" : "#64748B" }}>
                      Nom de la source :
                    </label>
                    <input
                      type="text"
                      value={feedName}
                      onChange={(e) => setFeedName(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: isDarkMode ? "1px solid rgba(255,255,255,0.15)" : "1px solid #CBD5E1",
                        background: isDarkMode ? "#0F172A" : "#FFFFFF",
                        color: isDarkMode ? "#F8FAFC" : "#0F172A",
                        fontSize: "12px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", fontWeight: "700", color: isDarkMode ? "#94A3B8" : "#64748B" }}>
                      Catégorie :
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: isDarkMode ? "1px solid rgba(255,255,255,0.15)" : "1px solid #CBD5E1",
                        background: isDarkMode ? "#0F172A" : "#FFFFFF",
                        color: isDarkMode ? "#F8FAFC" : "#0F172A",
                        fontSize: "12px",
                      }}
                    >
                      <option value="general">Général</option>
                      <option value="scholarships">Bourses Master</option>
                      <option value="ai">IA & LLM</option>
                      <option value="tech">Tech & Dev</option>
                      <option value="cyber">Cybersécurité</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleAddFeed}
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#10B981",
                    color: "#FFFFFF",
                    fontSize: "13px",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  🚀 Enregistrer et activer cette source
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ONGLET 2 : GÉRER LES SOURCES ────────────────────────────────── */}
        {activeTab === "manage" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {customFeeds.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px", color: isDarkMode ? "#94A3B8" : "#64748B", fontSize: "13px" }}>
                Aucune source personnalisée pour le moment. Cliquez sur "Ajouter une Source" pour en intégrer une !
              </div>
            ) : (
              customFeeds.map((feed) => (
                <div
                  key={feed.id}
                  style={{
                    background: isDarkMode ? "rgba(30, 41, 59, 0.6)" : "#F8FAFC",
                    border: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid #E2E8F0",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "16px" }}>{feed.emoji || "📰"}</span>
                      <strong style={{ fontSize: "13px" }}>{feed.name}</strong>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: isDarkMode ? "rgba(255,255,255,0.1)" : "#E2E8F0",
                          color: isDarkMode ? "#CBD5E1" : "#475569",
                        }}
                      >
                        {feed.category}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: isDarkMode ? "#64748B" : "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {feed.url}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      onClick={() => toggleFeedEnabled(feed.id)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "11px",
                        fontWeight: "700",
                        background: feed.enabled ? "#10B981" : isDarkMode ? "rgba(255,255,255,0.1)" : "#E2E8F0",
                        color: feed.enabled ? "#FFFFFF" : isDarkMode ? "#94A3B8" : "#64748B",
                        cursor: "pointer",
                      }}
                    >
                      {feed.enabled ? "Actif" : "Inactif"}
                    </button>

                    <button
                      onClick={() => handleDeleteFeed(feed.id)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "11px",
                        fontWeight: "700",
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#EF4444",
                        cursor: "pointer",
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── ONGLET 3 : IMPORT / EXPORT OPML ─────────────────────────────── */}
        {activeTab === "opml" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ margin: 0, fontSize: "13px", color: isDarkMode ? "#94A3B8" : "#64748B" }}>
              Le format OPML est le standard universel de synchronisation des flux RSS (compatible avec Feedly, Inoreader, NetNewsWire, etc.).
            </p>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                onClick={handleExportOpml}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "var(--mm-primary)",
                  color: "#FFFFFF",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                📥 Exporter mes flux en OPML
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#10B981",
                  color: "#FFFFFF",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                📤 Importer un fichier OPML
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".opml,.xml"
                style={{ display: "none" }}
                onChange={handleImportOpml}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
