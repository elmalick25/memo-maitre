import React, { useState, useTransition, useRef } from "react";
import HoloCard from "./HoloCard";
import BulkRestructureBar from "./BulkRestructureBar";
import AudioFichePlayer from "./AudioFichePlayer";
import GodTierContent from "./GodTierContent";
import { Minimap, getCardHealth } from "../MemoMasterUpgrades";
import { cognitiveTag, addDays } from "../lib/fsrs";

export default function CardListView({
  expressions = [],
  setExpressions,
  categories = [],
  setCategories,
  filteredExps = [],
  searchQuery = "",
  setSearchQuery,
  filterCat = "Toutes",
  setFilterCat,
  filterLevel = "Tous",
  setFilterLevel,
  selectionMode = false,
  setSelectionMode,
  selectedCards = [],
  setSelectedCards,
  listXRayMode = false,
  setListXRayMode,
  pauseManagerModule = null,
  setPauseManagerModule,
  pauseManagerSelected = new Set(),
  setPauseManagerSelected,
  masteredCount = 0,
  optimizeAllLoading = false,
  optimizeAllProgress = { done: 0, total: 0 },
  handleOptimizeAllInModule,
  startEdit,
  deleteExp,
  theme,
  isDarkMode = false,
  isMobile = false,
  showToast,
  callClaude,
  playSound,
  today,
  setView,
  cardsSort = "date",
  setCardsSort,
  cardsViewMode = "grid",
  setCardsViewMode,
  cardsActionMode = "contextual",
  setCardsActionMode,
  cardsAudioPlaying = false,
  setCardsAudioPlaying,
  cardsPlaylist = [],
  setCardsPlaylist,
  startPlaylist,
  clearPlaylist,
  addToPlaylist,
  cardsTags = {},
  setCardsTags,
  cardsTagsLoading = false,
  setCardsTagsLoading,
  listTagsDrawerOpen = false,
  setListTagsDrawerOpen,
  listSelectedTag = null,
  setListSelectedTag,
  listAdvancedOverlayOpen = false,
  setListAdvancedOverlayOpen,
  cardsAdvancedSearch = { boolQuery: "", minDifficulty: 0, maxDifficulty: 10, minLevel: 0, maxLevel: 7, dateFrom: "", dateTo: "" },
  setCardsAdvancedSearch,
  setCardsSearchOpen,
  listBiblioPanelOpen = false,
  setListBiblioPanelOpen,
  cardsCommunity = [],
  cardsCommunityLoading = false,
  loadCommunityCards,
  importCommunityCard,
  cmdPaletteOpen = false,
  setCmdPaletteOpen,
  cmdPaletteCard = null,
  setCmdPaletteCard,
  cmdPaletteQuery = "",
  setCmdPaletteQuery,
  handleSemanticSearch,
  semanticLoading = false,
  cardKebabOpen = null,
  setCardKebabOpen,
  cardAccordionOpen = null,
  setCardAccordionOpen,
  cardSwipeState = {},
  setCardSwipeState,
  cardsHoveredId = null,
  setCardsHoveredId,
  cardsFortressActive = {},
  toggleFortress,
  handleOptimizeOneCard,
  handleOptimizeSelected,
  handleRestructureSelectedRetroEngineering,
  godHandGenerateStory,
  godHandCreateMCQ,
  godHandMerge,
  godHandDelete,
  releaseSelectedPaused,
  expandedCard = null,
  setExpandedCard,
  cardsFakeCards = [],
  setCardsFakeCards,
  startDuel,
  handleLearnNow,
  isYoungCard = () => false,
  newCardsRemainingToday = 0,
  newCardBudget = 20,
  generateVariants,
  visibleCardsCount = 60,
  loadMoreCardsRef,
  handleMinimapClick,
  cardsGraphLoading = false,
  cardsGraphData = { nodes: [], links: [] },
  graphTransform = { x: 0, y: 0, scale: 1 },
  setGraphTransform,
  graphDragRef,
  cardsClusters = [],
  cardsTimeline = [],
  timelineScrollRatio = 0,
  setTimelineScrollRatio,
  cardsDuelActive = false,
  setCardsDuelActive,
  cardsDuelCard = null,
  cardsDuelPlayer1 = null,
  cardsDuelPlayer2 = null,
  cardsDuelInput1 = "",
  setCardsDuelInput1,
  cardsDuelInput2 = "",
  setCardsDuelInput2,
  handleDuelAnswer,
}) {
  const [, startTransition] = useTransition();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [listHoveredBtn, setListHoveredBtn] = useState(null);
  const [listRippleEffect, setListRippleEffect] = useState(false);

  const catNames = categories.map((c) => c.name);
  const hasActiveFilters = filterCat !== "Toutes" || filterLevel !== "Tous" || searchQuery !== "" || listSelectedTag !== null || listXRayMode || cardsSort !== "date";

  const formatDate = (isoStr) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    } catch {
      return isoStr;
    }
  };

  return (
    <div style={{ animation: "fadeUp 0.4s ease", background: listXRayMode ? "#020617" : "transparent", padding: listXRayMode ? "20px" : 0, borderRadius: listXRayMode ? 32 : 0, transition: "all 0.5s" }}>
      {/* Bandeau : mode "Choisir" */}
      {pauseManagerModule && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
          background: "#8B5CF622", border: "1px solid #8B5CF655", borderRadius: 14, padding: "12px 16px", marginBottom: 16
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#8B5CF6" }}>
            🔓 Choisis les fiches de « {pauseManagerModule} » à ajouter à la révision, puis valide en bas.
          </span>
          <button
            onClick={() => {
              setPauseManagerModule?.(null);
              setPauseManagerSelected?.(new Set());
              setSelectionMode?.(false);
              setSelectedCards?.([]);
              setFilterLevel?.("Tous");
            }}
            style={{ padding: "6px 12px", fontSize: 12, background: "none", border: "1px solid #8B5CF655", borderRadius: 8, color: "#8B5CF6", fontWeight: 700, cursor: "pointer" }}
          >
            Terminer
          </button>
        </div>
      )}

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }} className="dash-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 900, color: theme?.highlight || "#8B5CF6" }}>◈ Le Second Cerveau</h1>
          <p style={{ color: theme?.textMuted || "#64748B", margin: 0 }}>Explore, visualise et forge tes connaissances.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ background: theme?.cardBg || "#FFFFFF", padding: "10px 16px", borderRadius: 14, border: `1px solid ${theme?.border || "#E2E8F0"}`, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: theme?.highlight || "#8B5CF6" }}>{filteredExps.length}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme?.textMuted || "#64748B" }}>Fiches</div>
          </div>
          <div style={{ background: theme?.cardBg || "#FFFFFF", padding: "10px 16px", borderRadius: 14, border: `1px solid ${theme?.border || "#E2E8F0"}`, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#8B5CF6" }}>{masteredCount}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme?.textMuted || "#64748B" }}>Maîtrisées</div>
          </div>

          {/* Mode Sélection */}
          <button
            onClick={() => {
              setSelectionMode?.((p) => {
                const next = !p;
                if (!next) setSelectedCards?.([]);
                return next;
              });
            }}
            title={selectionMode ? "Quitter le mode sélection" : "Sélectionner plusieurs fiches pour agir en masse"}
            className="hov"
            style={{
              padding: "10px 16px",
              borderRadius: 14,
              border: `1px solid ${selectionMode ? (theme?.highlight || "#8B5CF6") : (theme?.border || "#E2E8F0")}`,
              background: selectionMode ? (theme?.highlight || "#8B5CF6") + "22" : (theme?.cardBg || "#FFFFFF"),
              color: selectionMode ? (theme?.highlight || "#8B5CF6") : (theme?.textMuted || "#64748B"),
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {selectionMode ? `☑️ ${selectedCards.length} sélectionnée(s)` : "☐ Sélection"}
          </button>
          {selectionMode && (
            <button
              onClick={() => setSelectedCards?.((prev) => prev.length === filteredExps.length ? [] : filteredExps.map((e) => e.id))}
              className="hov"
              style={{ padding: "10px 16px", borderRadius: 14, border: `1px solid ${theme?.border || "#E2E8F0"}`, background: theme?.cardBg || "#FFFFFF", color: theme?.textMuted || "#64748B", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {selectedCards.length === filteredExps.length ? "Aucune" : "Tout sélectionner"}
            </button>
          )}

          {/* Optimiser toutes les fiches */}
          <button
            onClick={handleOptimizeAllInModule}
            disabled={optimizeAllLoading || filterCat === "Toutes" || filteredExps.length === 0}
            title={filterCat === "Toutes" ? "Sélectionne d'abord un module précis" : `Optimiser toutes les fiches de "${filterCat}" pour viser 100% de rétention`}
            className="hov btn-glow"
            style={{
              padding: "10px 16px",
              borderRadius: 14,
              border: "none",
              background: (optimizeAllLoading || filterCat === "Toutes" || filteredExps.length === 0)
                ? "linear-gradient(135deg, #94a3b8, #64748b)"
                : "linear-gradient(135deg, #8B5CF6, #7C3AED)",
              color: "white",
              fontWeight: 900,
              fontSize: 12,
              cursor: (optimizeAllLoading || filterCat === "Toutes" || filteredExps.length === 0) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 8px 20px rgba(139, 92, 246,0.35)"
            }}
          >
            {optimizeAllLoading
              ? `⏳ ${optimizeAllProgress.done}/${optimizeAllProgress.total}`
              : `✨ Optimiser le module`}
          </button>
        </div>
      </div>

      {/* OMNIBAR FLOTTANTE */}
      <div className="fiches-omnibar" style={{
        background: listXRayMode ? "rgba(0,0,0,0.85)" : (isDarkMode ? "rgba(15,23,42,0.75)" : "rgba(255,255,255,0.75)"),
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        padding: "12px 20px", borderRadius: 999, border: `1px solid ${theme?.highlight || "#8B5CF6"}40`,
        marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
        boxShadow: "0 12px 40px rgba(139, 92, 246,0.1)", position: "sticky", top: 80, zIndex: 40,
        transition: "all 0.4s ease"
      }}>
        {/* Actions rapides */}
        <div className="fiches-actions-cluster" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* Sélecteur de tri */}
          <select value={cardsSort} onChange={(e) => setCardsSort?.(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 10, background: theme?.inputBg || "#F8FAFC", border: `1px solid ${theme?.border || "#E2E8F0"}`, color: theme?.textMuted || "#64748B", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            <option value="date">🕐 Récentes</option>
            <option value="due">📅 À réviser</option>
            <option value="level">⭐ Niveau</option>
            <option value="alpha">🔤 A-Z</option>
          </select>

          {/* Avancé */}
          <button
            onMouseEnter={() => setListHoveredBtn("advanced")} onMouseLeave={() => setListHoveredBtn(null)}
            onClick={() => setListAdvancedOverlayOpen?.(true)}
            style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "advanced" ? 6 : 0, padding: "8px 12px", borderRadius: 12, background: "transparent", border: `1px solid ${theme?.border || "#E2E8F0"}`, color: theme?.textMuted || "#64748B", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 16 }}>🔍</span><span style={{ maxWidth: listHoveredBtn === "advanced" ? 60 : 0, opacity: listHoveredBtn === "advanced" ? 1 : 0, transition: "all 0.3s ease" }}>Avancé</span>
          </button>

          {/* Pièges (Rayon-X) */}
          <button
            onMouseEnter={() => setListHoveredBtn("xray")} onMouseLeave={() => setListHoveredBtn(null)}
            onClick={() => { setListXRayMode?.(!listXRayMode); if (!listXRayMode) showToast?.("🕶️ Mode Rayon-X activé : Seuls les pièges s'illuminent."); }}
            style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "xray" ? 6 : 0, padding: "8px 12px", borderRadius: 12, background: listXRayMode ? "#39FF1420" : "transparent", border: `1px solid ${listXRayMode ? "#39FF14" : (theme?.border || "#E2E8F0")}`, color: listXRayMode ? "#39FF14" : (theme?.textMuted || "#64748B"), fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 16 }}>🖊️</span><span style={{ maxWidth: listHoveredBtn === "xray" || listXRayMode ? 60 : 0, opacity: listHoveredBtn === "xray" || listXRayMode ? 1 : 0, transition: "all 0.3s ease" }}>Pièges</span>
          </button>

          {/* Biblio */}
          <button
            onMouseEnter={() => setListHoveredBtn("biblio")} onMouseLeave={() => setListHoveredBtn(null)}
            onClick={() => { setListBiblioPanelOpen?.(true); loadCommunityCards?.(); }}
            style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "biblio" ? 6 : 0, padding: "8px 12px", borderRadius: 12, background: "transparent", border: `1px solid ${theme?.border || "#E2E8F0"}`, color: theme?.textMuted || "#64748B", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 16 }}>🏛️</span><span style={{ maxWidth: listHoveredBtn === "biblio" ? 60 : 0, opacity: listHoveredBtn === "biblio" ? 1 : 0, transition: "all 0.3s ease" }}>Biblio</span>
          </button>

          {/* Playlist Audio */}
          <button
            onMouseEnter={() => setListHoveredBtn("playlist")} onMouseLeave={() => setListHoveredBtn(null)}
            onClick={() => {
              if (cardsAudioPlaying) {
                window.speechSynthesis?.pause();
                setCardsAudioPlaying?.(false);
              } else if (window.speechSynthesis?.paused) {
                window.speechSynthesis?.resume();
                setCardsAudioPlaying?.(true);
              } else {
                startPlaylist?.();
              }
            }}
            disabled={cardsPlaylist.length === 0}
            style={{ display: "flex", alignItems: "center", gap: listHoveredBtn === "playlist" ? 6 : 0, padding: "8px 12px", borderRadius: 12, background: cardsAudioPlaying ? (theme?.highlight || "#8B5CF6") : "transparent", border: `1px solid ${cardsAudioPlaying ? (theme?.highlight || "#8B5CF6") : (theme?.border || "#E2E8F0")}`, color: cardsAudioPlaying ? "white" : (theme?.textMuted || "#64748B"), fontWeight: 600, fontSize: 13, cursor: cardsPlaylist.length === 0 ? "not-allowed" : "pointer", opacity: cardsPlaylist.length === 0 ? 0.5 : 1, transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", overflow: "hidden", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 16 }}>{cardsAudioPlaying ? "⏸️" : "▶️"}</span>
            <span style={{ maxWidth: listHoveredBtn === "playlist" || cardsAudioPlaying ? 80 : 0, opacity: listHoveredBtn === "playlist" || cardsAudioPlaying ? 1 : 0, transition: "all 0.3s ease", display: "flex", alignItems: "center", gap: 4 }}>
              Playlist
            </span>
          </button>
          {cardsPlaylist.length > 0 && (
            <button onClick={clearPlaylist} style={{ padding: "8px", borderRadius: "50%", background: "#FEF2F2", border: "1px solid #C4B5FD", color: "#EF4444", fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          )}

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                setFilterCat?.("Toutes");
                setFilterLevel?.("Tous");
                setSearchQuery?.("");
                setListSelectedTag?.(null);
                setListXRayMode?.(false);
                setCardsSort?.("date");
                setListRippleEffect(true);
                setTimeout(() => setListRippleEffect(false), 600);
              }}
              style={{
                padding: "8px", borderRadius: "50%", background: "#EF4444", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
              }}
            >✕</button>
          )}
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div style={{ position: "relative", zIndex: 50, background: isDarkMode ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.4)", padding: "12px 16px", borderRadius: 24, border: `1px solid ${theme?.border || "#E2E8F0"}`, marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", boxShadow: "0 4px 20px rgba(139, 92, 246,0.05)", backdropFilter: "blur(12px)" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: searchQuery ? 600 : 400, transition: "max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: theme?.textMuted || "#64748B" }}>🔍</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery?.(e.target.value)}
            style={{ width: "100%", padding: "14px 50px 14px 44px", background: theme?.inputBg || "#F8FAFC", border: `1px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 16, fontSize: 15, color: theme?.text || "#0F172A", outline: "none", fontWeight: 600 }}
            placeholder="Chercher un concept ou taper une commande..."
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery?.("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: theme?.cardBg || "#FFFFFF", border: `1px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 10, color: theme?.textMuted || "#64748B", cursor: "pointer", fontSize: 12, padding: "6px 10px", fontWeight: 800 }}>✕</button>
          ) : (
            <button onClick={() => { setCmdPaletteOpen?.(true); setCmdPaletteQuery?.(""); }} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: theme?.cardBg || "#FFFFFF", border: `1px solid ${theme?.border || "#E2E8F0"}`, color: theme?.textMuted || "#64748B", cursor: "pointer", fontSize: 12, padding: "6px 10px", borderRadius: 10, fontWeight: 800, fontFamily: "'JetBrains Mono'" }}>⌘K</button>
          )}
        </div>

        <button onClick={handleSemanticSearch} disabled={semanticLoading} className="btn-glow hov" style={{ background: "linear-gradient(135deg, #8B5CF6, #4C1D95)", color: "white", border: "none", padding: "14px 20px", borderRadius: 16, fontWeight: 800, cursor: "pointer", fontSize: 14 }}>
          {semanticLoading ? "🧠 Analyse..." : "🧠 Sémantique"}
        </button>

        <div style={{ position: "relative", width: isMobile ? "100%" : "auto" }}>
          <button onClick={() => setFilterSheetOpen((v) => !v)} className="hov" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 18px", borderRadius: 20, background: (filterCat !== "Toutes" || filterLevel !== "Tous") ? (theme?.highlight || "#8B5CF6") : (theme?.cardBg || "#FFFFFF"), border: `1px solid ${(filterCat !== "Toutes" || filterLevel !== "Tous") ? (theme?.highlight || "#8B5CF6") : (theme?.border || "#E2E8F0")}`, color: (filterCat !== "Toutes" || filterLevel !== "Tous") ? "white" : (theme?.text || "#0F172A"), fontWeight: 700, fontSize: 14, width: "100%" }}>
            <span>🎯 Filtrer{(filterCat !== "Toutes" || filterLevel !== "Tous") ? " (Actif)" : ""}</span>
            <span style={{ fontSize: 10 }}>▼</span>
          </button>
          {filterSheetOpen && (
            <>
              <div onClick={() => setFilterSheetOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 900 }} />
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 8, background: isDarkMode ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.85)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", padding: 16, borderRadius: 16, border: `1px solid ${theme?.border || "#E2E8F0"}`, boxShadow: "0 20px 50px rgba(0,0,0,0.2)", zIndex: 9999, width: 340, maxHeight: "60vh", overflowY: "auto" }}>
                <div style={{ fontWeight: 800, marginBottom: 12, color: theme?.text || "#0F172A", fontSize: 14 }}>Filtrer par catégorie</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                  {["Toutes", ...catNames].map((c) => (
                    <button key={c} onClick={() => startTransition(() => setFilterCat?.(c))} style={{ padding: "8px 14px", borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: "pointer", background: filterCat === c ? (theme?.highlight || "#8B5CF6") : (theme?.inputBg || "#F8FAFC"), color: filterCat === c ? "white" : (theme?.text || "#0F172A"), border: `1px solid ${filterCat === c ? (theme?.highlight || "#8B5CF6") : (theme?.border || "#E2E8F0")}` }}>{c}</button>
                  ))}
                </div>
                <div style={{ fontWeight: 800, marginBottom: 12, color: theme?.text || "#0F172A", fontSize: 14 }}>Filtrer par niveau</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["Tous", "Nouvelles", "En retard", "Maîtrisées", "En pause"].map((l) => (
                    <button key={l} onClick={() => startTransition(() => setFilterLevel?.(l))} style={{ padding: "8px 14px", borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: "pointer", background: filterLevel === l ? (theme?.highlight || "#8B5CF6") : (theme?.inputBg || "#F8FAFC"), color: filterLevel === l ? "white" : (theme?.text || "#0F172A"), border: `1px solid ${filterLevel === l ? (theme?.highlight || "#8B5CF6") : (theme?.border || "#E2E8F0")}` }}>{l}</button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MINIMAP */}
      {cardsViewMode === "grid" && filteredExps.length > 50 && (
        <Minimap cards={filteredExps} onPixelClick={handleMinimapClick} theme={theme} isDarkMode={isDarkMode} />
      )}

      {/* VUE GRILLE (défaut) */}
      {cardsViewMode === "grid" && (
        <>
          {selectionMode && (
            <BulkRestructureBar
              selectedCards={expressions.filter((e) => selectedCards.includes(e.id))}
              allCards={filteredExps}
              setSelectedCardIds={setSelectedCards}
              setExpressions={setExpressions}
              callClaude={callClaude}
              showToast={showToast}
              theme={theme}
              isDarkMode={isDarkMode}
            />
          )}

          {filteredExps.length === 0 ? (
            <div style={{ background: theme?.cardBg || "#FFFFFF", border: `2px dashed ${theme?.border || "#E2E8F0"}`, borderRadius: 32, padding: "80px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
              <h3 style={{ color: theme?.text || "#0F172A", fontSize: 20, fontWeight: 800 }}>Aucune fiche trouvée</h3>
              <p style={{ color: theme?.textMuted || "#64748B", marginTop: 8, marginBottom: 24 }}>Élargis ta recherche ou crée un nouveau concept.</p>
              <button onClick={() => setView?.("add")} className="btn-glow hov" style={{ padding: "14px 28px", background: "linear-gradient(135deg, #7C3AED, #8B5CF6)", color: "white", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                ⚡ Créer une fiche
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <style>{`
                .smart-grid {
                  display: grid;
                  grid-template-columns: 1fr;
                  gap: 40px 16px;
                  width: 100%;
                  align-items: start;
                }
                .smart-full { grid-column: 1 / -1 !important; }
                @media (min-width: 640px) {
                  .smart-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
                  .smart-big { grid-column: span 6; }
                  .smart-small { grid-column: span 3; }
                }
                @media (min-width: 1024px) {
                  .smart-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
                  .smart-big { grid-column: span 3; }
                  .smart-small { grid-column: span 2; }
                }
                @media (min-width: 1536px) {
                  .smart-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); }
                  .smart-big { grid-column: span 6; }
                  .smart-small { grid-column: span 4; }
                }
                .smart-card { min-width: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; }
              `}</style>
              <div className="smart-grid">
                {filteredExps.slice(0, visibleCardsCount).map((exp) => {
                  const lvl = exp.level || 0;
                  const lvlColor = lvl >= 7 ? "#8B5CF6" : lvl >= 5 ? "#8B5CF6" : lvl >= 3 ? "#C084FC" : lvl >= 1 ? "#A855F7" : "#9CA3AF";
                  const catColor = categories.find((c) => c.name === exp.category)?.color || "#8B5CF6";
                  const tag = cognitiveTag(exp);
                  const isSelected = selectedCards.includes(exp.id);

                  return (
                    <div
                      key={exp.id}
                      id={`card-${exp.id}`}
                      className={`smart-card card-hov smart-small ${listRippleEffect ? "ripple-anim" : ""}`}
                      style={{
                        background: theme?.cardBg || "#FFFFFF",
                        border: isSelected ? `2px solid ${theme?.highlight || "#8B5CF6"}` : `1px solid ${theme?.border || "#E2E8F0"}`,
                        borderRadius: 20,
                        overflow: "hidden",
                        boxShadow: isSelected ? `0 20px 50px ${theme?.highlight || "#8B5CF6"}50` : "0 8px 30px rgba(139, 92, 246,0.05)",
                        position: "relative",
                        animation: "fadeIn 0.4s ease-out",
                        transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      }}
                    >
                      {selectionMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCards?.((prev) => prev.includes(exp.id) ? prev.filter((id) => id !== exp.id) : [...prev, exp.id]);
                          }}
                          style={{
                            position: "absolute", top: 14, left: 14, zIndex: 30,
                            width: 24, height: 24, borderRadius: 8,
                            border: `2px solid ${isSelected ? (theme?.highlight || "#8B5CF6") : (theme?.border || "#E2E8F0")}`,
                            background: isSelected ? (theme?.highlight || "#8B5CF6") : "rgba(255,255,255,0.8)",
                            color: "white", fontSize: 13, fontWeight: 900,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          {isSelected ? "✓" : ""}
                        </button>
                      )}
                      <div style={{ padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, background: catColor + "22", color: catColor, marginLeft: selectionMode ? 30 : 0 }}>
                          {exp.category}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ background: tag.color + "22", color: tag.color, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>
                            {tag.icon} {tag.label}
                          </span>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: lvlColor }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: theme?.textMuted || "#64748B", fontFamily: "'JetBrains Mono'" }}>
                            N{lvl}
                          </span>
                        </div>
                      </div>
                      <div
                        style={{ padding: "0 24px", flex: 1, cursor: "pointer" }}
                        onClick={() => {
                          if (selectionMode) {
                            setSelectedCards?.((prev) => prev.includes(exp.id) ? prev.filter((id) => id !== exp.id) : [...prev, exp.id]);
                          } else {
                            setExpandedCard?.(exp);
                          }
                        }}
                      >
                        <div style={{ fontSize: 20, fontWeight: 800, color: theme?.highlight || "#8B5CF6", marginBottom: 12, lineHeight: 1.3 }}>
                          {exp.front}
                        </div>
                        <div style={{ fontSize: 14, color: theme?.text || "#0F172A", lineHeight: 1.6, marginBottom: 16 }}>
                          {(exp.type === "audio" && (exp.audioUrl || exp.audioId)) ? (
                            <AudioFichePlayer card={exp} />
                          ) : (
                            <GodTierContent text={exp.back} theme={theme} isDarkMode={isDarkMode} />
                          )}
                        </div>
                        {exp.example && !/exemples?/i.test(exp.back || "") && (
                          <div style={{ background: theme?.inputBg || "#F8FAFC", padding: "12px", borderRadius: 12, fontSize: 13, color: theme?.textMuted || "#64748B", fontStyle: "italic", borderLeft: "3px solid #8B5CF6", marginBottom: 16 }}>
                            <span style={{ color: "#8B5CF6", fontSize: 10 }}>// exemple</span><br />
                            <div style={{ marginTop: 8 }}>
                              <GodTierContent text={exp.example} theme={theme} isDarkMode={isDarkMode} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Card Bottom Actions */}
                      <div style={{ padding: "10px 16px", background: theme?.inputBg || "#F8FAFC", borderTop: `1px solid ${theme?.border || "#E2E8F0"}`, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: theme?.textMuted || "#64748B", fontFamily: "'JetBrains Mono'", flex: 1 }}>
                          {lvl >= 7 ? "✅ Maîtrisée" : `📅 ${formatDate(exp.nextReview)}`}
                        </span>
                        <button onClick={() => startEdit?.(exp)} className="hov" style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: `1px solid ${theme?.border || "#E2E8F0"}`, background: theme?.cardBg || "#FFFFFF", color: theme?.textMuted || "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          ✏️ Éditer
                        </button>
                        <button onClick={() => handleOptimizeOneCard?.(exp)} className="hov btn-glow" style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #8B5CF6, #7C3AED)", color: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                          ✨ Optimiser
                        </button>
                        <button onClick={() => deleteExp?.(exp.id)} className="hov" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${theme?.border || "#E2E8F0"}`, background: "#FEF2F2", color: "#EF4444", fontSize: 13, cursor: "pointer" }} title="Supprimer">
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filteredExps.length > visibleCardsCount && (
                <div ref={loadMoreCardsRef} style={{ height: "20px", marginTop: "20px" }} />
              )}
            </div>
          )}
        </>
      )}

      {/* EXPANSION HOLOGRAPHIQUE MODAL */}
      {expandedCard && (() => {
        const lvl = expandedCard.level || 0;
        const catColor = categories.find((c) => c.name === expandedCard.category)?.color || "#8B5CF6";
        const health = getCardHealth(expandedCard);

        return (
          <div
            onClick={() => setExpandedCard?.(null)}
            style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640 }}>
              <HoloCard theme={theme} glowColor={catColor} style={{ background: isDarkMode ? "rgba(15,23,42,0.8)" : "rgba(255,255,255,0.9)", border: `1px solid ${catColor}50`, borderRadius: 32, padding: "36px", boxShadow: `0 30px 80px rgba(0,0,0,0.4)` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                  <span style={{ padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 800, background: catColor + "22", color: catColor, textTransform: "uppercase", letterSpacing: 1 }}>
                    {expandedCard.category}
                  </span>
                  <button onClick={() => setExpandedCard?.(null)} style={{ background: "none", border: "none", color: theme?.textMuted || "#64748B", fontSize: 24, cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ fontSize: 32, fontWeight: 900, color: theme?.text || "#0F172A", marginBottom: 16, lineHeight: 1.2 }}>
                  {expandedCard.front}
                </div>

                <div style={{ background: isDarkMode ? "rgba(139, 92, 246,0.2)" : "rgba(255,255,255,0.5)", padding: 20, borderRadius: 20, marginBottom: 24, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
                  <div style={{ fontSize: 16, color: theme?.text || "#0F172A", lineHeight: 1.6 }}>
                    <GodTierContent text={expandedCard.back} theme={theme} isDarkMode={isDarkMode} />
                  </div>
                  {expandedCard.example && !/exemples?/i.test(expandedCard.back || "") && (
                    <div style={{ marginTop: 16, padding: "12px 16px", background: theme?.cardBg || "#FFFFFF", borderRadius: 12, fontSize: 14, color: theme?.textMuted || "#64748B", fontStyle: "italic", borderLeft: `3px solid ${catColor}` }}>
                      <GodTierContent text={expandedCard.example} theme={theme} isDarkMode={isDarkMode} />
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                  <div style={{ background: theme?.inputBg || "#F8FAFC", padding: 16, borderRadius: 16, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme?.textMuted || "#64748B", marginBottom: 8, letterSpacing: 1 }}>SANTÉ FSRS</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 24 }}>{health.status === "healthy" ? "💚" : health.status === "shaky" ? "💛" : "💔"}</div>
                      <div>
                        <div style={{ fontWeight: 800, color: health.color, fontSize: 14 }}>{health.label}</div>
                        <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B" }}>Niveau {lvl} · EF: {(expandedCard.easeFactor || 2.5).toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: theme?.inputBg || "#F8FAFC", padding: 16, borderRadius: 16, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme?.textMuted || "#64748B", marginBottom: 8, letterSpacing: 1 }}>HISTORIQUE</div>
                    <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B" }}>
                      {(expandedCard.reviewHistory || []).length} révision(s)
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => { startDuel?.(expandedCard); setExpandedCard?.(null); }} className="btn-glow hov" style={{ flex: 1, padding: "16px", background: "linear-gradient(135deg, #8B5CF6, #4C1D95)", color: "white", border: "none", borderRadius: 16, fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>⚔️</span> Duel IA Instantané
                  </button>
                  <button onClick={() => { startEdit?.(expandedCard); setExpandedCard?.(null); }} className="hov" style={{ padding: "16px", background: theme?.inputBg || "#F8FAFC", color: theme?.text || "#0F172A", border: `1px solid ${theme?.border || "#E2E8F0"}`, borderRadius: 16, fontWeight: 700, cursor: "pointer" }}>
                    ✏️ Éditer
                  </button>
                </div>
              </HoloCard>
            </div>
          </div>
        );
      })()}

      {/* GOD HAND DYNAMIC ISLAND */}
      {selectedCards.length > 0 && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
          zIndex: 100000, display: "flex", alignItems: "center", gap: 12,
          background: isDarkMode ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.95)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          padding: "12px 24px", borderRadius: 999, border: `1px solid ${theme?.highlight || "#8B5CF6"}50`,
          boxShadow: `0 30px 60px rgba(0,0,0,0.4)`,
          animation: "fadeUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 16, borderRight: `1px solid ${theme?.border || "#E2E8F0"}` }}>
            <span style={{ fontSize: 24 }}>🖐️</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: theme?.text || "#0F172A" }}>God Hand</span>
              <span style={{ fontSize: 11, color: theme?.highlight || "#8B5CF6", fontWeight: 700 }}>{selectedCards.length} sél.</span>
            </div>
          </div>
          <button onClick={godHandGenerateStory} className="hov" style={{ background: "transparent", border: "none", color: theme?.text || "#0F172A", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span>🧬</span> <span>Histoire</span>
          </button>
          <button onClick={godHandCreateMCQ} className="hov" style={{ background: "transparent", border: "none", color: theme?.text || "#0F172A", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span>⚔️</span> <span>QCM</span>
          </button>
          <button onClick={handleOptimizeSelected} disabled={optimizeAllLoading} className="hov" style={{ background: "transparent", border: "none", color: "#8B5CF6", cursor: optimizeAllLoading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span>✨</span> <span>Optimiser</span>
          </button>
          <button onClick={godHandDelete} className="hov" style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span>🗑️</span> <span>Supprimer</span>
          </button>
          <button onClick={() => { setSelectedCards?.([]); setSelectionMode?.(false); }} style={{ background: theme?.inputBg || "#F8FAFC", border: `1px solid ${theme?.border || "#E2E8F0"}`, borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: theme?.textMuted || "#64748B", cursor: "pointer", marginLeft: 8 }}>✕</button>
        </div>
      )}
    </div>
  );
}
