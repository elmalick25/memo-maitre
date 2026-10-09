import React, { useState, useMemo, useTransition, useRef, useEffect } from "react";
import HoloCard from "./HoloCard";
import BulkRestructureBar from "./BulkRestructureBar";
import GodTierContent from "./GodTierContent";
import AudioFichePlayer from "./AudioFichePlayer";
import AudioPlayButton from "./AudioPlayButton";
import { getCardHealth } from "../MemoMasterUpgrades";
import { cognitiveTag, addDays } from "../lib/fsrs";
import { colorMix } from "../lib/colorMix";
import {
  getUnmigratedNovaCards,
  migrateNovaCardsBatch,
  isNovaCard,
  isNovaV8Format,
} from "../lib/novaCardMigrator";
import {
  getUnmodernizedEnglishCards,
  migrateEnglishCardsBatch,
} from "../lib/retroCardMigrator";
import { isEnglishCategory } from "../lib/englishCardEngine";
import { restructureAllEnglishCards } from "../lib/retroEngineeringRestructurer";

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

  // ── Pagination dynamique & Infinite Scroll (Brique 84) ──
  const [localVisibleCount, setLocalVisibleCount] = useState(40);
  const infiniteSentinelRef = useRef(null);

  // Réinitialiser la pagination lors d'un changement de filtre ou de recherche
  useEffect(() => {
    setLocalVisibleCount(40);
  }, [filterCat, filterLevel, searchQuery, listSelectedTag, listXRayMode, cardsSort]);

  // Observer automatique pour charger la suite au scroll
  useEffect(() => {
    const sentinel = infiniteSentinelRef.current;
    if (!sentinel || localVisibleCount >= filteredExps.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting) {
          setLocalVisibleCount((prev) => Math.min(prev + 40, filteredExps.length));
        }
      },
      {
        root: null,
        rootMargin: "450px", // Précharge 450px avant le bas
        threshold: 0.05,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredExps.length, localVisibleCount]);

  // ── Fiches Nova à moderniser (Brique 86) ──
  const unmigratedNovaCards = useMemo(
    () => getUnmigratedNovaCards(expressions),
    [expressions]
  );
  const [isMigratingNova, setIsMigratingNova] = useState(false);
  const [novaProgress, setNovaProgress] = useState({ current: 0, total: 0 });
  // Verrou synchrone : immunise le bouton contre un double-clic rapide
  // (un state React n'est pas appliqué assez tôt pour bloquer le 2e clic).
  const novaLockRef = useRef(false);

  // Règle stricte demandée : si toutes les fiches Nova sont transformées et que le filtre actif était Nova, reset vers "Toutes"
  useEffect(() => {
    if (unmigratedNovaCards.length === 0 && filterCat === "🎙️ Live Nova") {
      setFilterCat?.("Toutes");
    }
  }, [unmigratedNovaCards.length, filterCat, setFilterCat]);

  const handleMigrateAllNova = async () => {
    if (novaLockRef.current || englishLockRef.current) {
      if (englishLockRef.current) showToast?.("⏳ Attends la fin de la modernisation des anciennes fiches.", "info");
      return;
    }
    if (!unmigratedNovaCards.length || isMigratingNova) return;
    novaLockRef.current = true;
    setIsMigratingNova(true);
    setNovaProgress({ current: 0, total: unmigratedNovaCards.length });
    try {
      await migrateNovaCardsBatch({
        cards: unmigratedNovaCards,
        setExpressions,
        callClaude,
        instant: true,
        onProgress: (cur, tot) => setNovaProgress({ current: cur, total: tot }),
        showToast,
      });
    } catch (e) {
      console.warn("[CardListView] Migration Nova interrompue:", e);
      showToast?.(
        "❌ La modernisation des fiches Nova s'est interrompue. Aucune fiche n'a été perdue : relance-la quand tu veux.",
        "error"
      );
    } finally {
      setIsMigratingNova(false);
      setNovaProgress({ current: 0, total: 0 });
      novaLockRef.current = false;
    }
  };

  // ── Anciennes fiches d'anglais à moderniser (Brique 88) ──
  const unmodernizedEnglishCards = useMemo(
    () => getUnmodernizedEnglishCards(expressions),
    [expressions]
  );
  const [isMigratingEnglish, setIsMigratingEnglish] = useState(false);
  const [englishProgress, setEnglishProgress] = useState({ current: 0, total: 0 });
  const englishLockRef = useRef(false);

  // Règle stricte demandée : si toutes les anciennes fiches sont transformées et que le filtre actif était "🔄 Anciennes fiches", reset vers "Toutes"
  useEffect(() => {
    if (unmodernizedEnglishCards.length === 0 && filterCat === "🔄 Anciennes fiches") {
      setFilterCat?.("Toutes");
    }
  }, [unmodernizedEnglishCards.length, filterCat, setFilterCat]);

  const [isTransformingEnglish, setIsTransformingEnglish] = useState(false);
  const [englishTransformProgress, setEnglishTransformProgress] = useState({ done: 0, total: 0 });

  const handleMigrateAllEnglish = async () => {
    if (englishLockRef.current || novaLockRef.current) {
      if (novaLockRef.current) showToast?.("⏳ Attends la fin de la modernisation des fiches Live Nova.", "info");
      return;
    }
    if (!unmodernizedEnglishCards.length || isMigratingEnglish) return;
    englishLockRef.current = true;
    setIsMigratingEnglish(true);
    setEnglishProgress({ current: 0, total: unmodernizedEnglishCards.length });
    try {
      await migrateEnglishCardsBatch({
        cards: unmodernizedEnglishCards,
        setExpressions,
        callClaude,
        instant: !callClaude,
        onProgress: (cur, tot) => setEnglishProgress({ current: cur, total: tot }),
        showToast,
      });
    } catch (e) {
      console.warn("[CardListView] Migration anciennes fiches interrompue:", e);
      showToast?.(
        "❌ La métamorphose des anciennes fiches s'est interrompue. Aucune fiche n'a été perdue : relance-la quand tu veux.",
        "error"
      );
    } finally {
      setIsMigratingEnglish(false);
      setEnglishProgress({ current: 0, total: 0 });
      englishLockRef.current = false;
    }
  };

  const handleTransformAllEnglish = async () => {
    if (isTransformingEnglish || isMigratingEnglish) return;
    const isFilteredOnEnglish = filterCat !== "Toutes" && isEnglishCategory(filterCat);
    const targetCards = isFilteredOnEnglish
      ? filteredExps
      : expressions.filter((c) => isEnglishCategory(c?.category));

    if (!targetCards.length) {
      showToast?.("Aucune fiche d'anglais à métamorphoser.", "info");
      return;
    }

    if (
      !window.confirm(
        `⚡ Métamorphoser ${targetCards.length} fiches d'anglais avec le pool Multi-IA ?\n\nChaque fiche sera analysée, la grammaire corrigée, et enrichie d'un Vrai sens en français, d'un mini-dialogue A/B vivant et de la règle réflexe.`
      )
    ) {
      return;
    }

    setIsTransformingEnglish(true);
    setEnglishTransformProgress({ done: 0, total: targetCards.length });
    try {
      await restructureAllEnglishCards({
        allCards: targetCards,
        setExpressions,
        callClaude,
        onProgress: (cur, tot) => setEnglishTransformProgress({ done: cur, total: tot }),
        showToast,
        concurrency: 4,
      });
    } catch (err) {
      console.error("[CardListView] Erreur métamorphose IA:", err);
      showToast?.("Erreur lors de la métamorphose IA des fiches.", "error");
    } finally {
      setIsTransformingEnglish(false);
      setEnglishTransformProgress({ done: 0, total: 0 });
    }
  };


  const catNames = categories.map((c) => c.name);
  // Les filtres "🎙️ Live Nova" et "🔄 Anciennes fiches" n'existent QUE s'il reste des fiches à moderniser.
  // Dès que leur nombre tombe à 0, ils sont immédiatement et définitivement supprimés de la liste.
  const availableCatFilters = useMemo(() => {
    const list = ["Toutes", ...catNames];
    if (unmigratedNovaCards.length > 0) {
      list.push("🎙️ Live Nova");
    }
    if (unmodernizedEnglishCards.length > 0) {
      list.push("🔄 Anciennes fiches");
    }
    return list;
  }, [catNames, unmigratedNovaCards.length, unmodernizedEnglishCards.length]);

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
          background: "color-mix(in srgb, var(--mm-primary) 13%, transparent)", border: "1px solid color-mix(in srgb, var(--mm-primary) 33%, transparent)", borderRadius: 14, padding: "12px 16px", marginBottom: 16
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--mm-primary)" }}>
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
            style={{ padding: "6px 12px", fontSize: 12, background: "none", border: "1px solid color-mix(in srgb, var(--mm-primary) 33%, transparent)", borderRadius: 8, color: "var(--mm-primary)", fontWeight: 700, cursor: "pointer" }}
          >
            Terminer
          </button>
        </div>
      )}

      {/* HEADER BENTO LIQUID GLASS */}
      <div
        className="dash-header card-list-hero-bento"
        style={{
          background: isDarkMode
            ? "linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.85) 100%)"
            : "linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(248, 250, 252, 0.98) 100%)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(226, 232, 240, 0.9)",
          borderRadius: 20,
          padding: isMobile ? "14px 16px" : "18px 22px",
          marginBottom: 20,
          boxShadow: isDarkMode
            ? "0 10px 30px -10px rgba(0, 0, 0, 0.5)"
            : "0 10px 25px -5px rgba(37, 99, 235, 0.06), 0 2px 6px rgba(0, 0, 0, 0.02)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, width: isMobile ? "100%" : "auto" }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              flexShrink: 0,
              background: "linear-gradient(135deg, var(--mm-primary, #2563EB), #4F46E5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              fontSize: 18,
              fontWeight: 900,
              boxShadow: "0 6px 16px -2px color-mix(in srgb, var(--mm-primary, #2563EB) 40%, transparent)",
            }}
          >
            ◈
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(19px, 4.5vw, 24px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: isDarkMode ? "#F8FAFC" : "#0F172A",
                fontFamily: "'Outfit', var(--font-sans, system-ui), sans-serif",
              }}
            >
              Le Second Cerveau
            </h1>
            <p
              style={{
                margin: "2px 0 0 0",
                fontSize: 12.5,
                color: isDarkMode ? "#94A3B8" : "#64748B",
                fontWeight: 500,
              }}
            >
              Explore, visualise et forge tes connaissances.
            </p>
          </div>
        </div>

        {/* STAT PILLS & ACTIONS */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
          {/* Pill Fiches */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 14px",
              borderRadius: 999,
              background: isDarkMode ? "rgba(37, 99, 235, 0.14)" : "rgba(37, 99, 235, 0.08)",
              border: `1px solid ${isDarkMode ? "rgba(59, 130, 246, 0.28)" : "rgba(37, 99, 235, 0.2)"}`,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 900, color: "var(--mm-primary, #2563EB)" }}>
              {filteredExps.length}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isDarkMode ? "#93C5FD" : "#1E40AF",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              fiches
            </span>
          </div>

          {/* Pill Maîtrisées */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 14px",
              borderRadius: 999,
              background: isDarkMode ? "rgba(16, 185, 129, 0.14)" : "rgba(16, 185, 129, 0.08)",
              border: `1px solid ${isDarkMode ? "rgba(16, 185, 129, 0.28)" : "rgba(16, 185, 129, 0.2)"}`,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 900, color: "#10B981" }}>{masteredCount}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isDarkMode ? "#6EE7B7" : "#065F46",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              maîtrisées
            </span>
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
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 999,
              border: selectionMode
                ? "1px solid var(--mm-primary, #2563EB)"
                : isDarkMode
                ? "1px solid rgba(255,255,255,0.12)"
                : "1px solid #E2E8F0",
              background: selectionMode
                ? "var(--mm-primary, #2563EB)"
                : isDarkMode
                ? "rgba(255,255,255,0.05)"
                : "#FFFFFF",
              color: selectionMode ? "#FFFFFF" : isDarkMode ? "#CBD5E1" : "#475569",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
              boxShadow: selectionMode
                ? "0 4px 12px color-mix(in srgb, var(--mm-primary, #2563EB) 30%, transparent)"
                : "none",
              transition: "all 0.2s ease",
            }}
          >
            <span>{selectionMode ? "☑️" : "☐"}</span>
            <span>{selectionMode ? `${selectedCards.length} sél.` : "Sélection"}</span>
          </button>
          {selectionMode && (
            <button
              onClick={() =>
                setSelectedCards?.((prev) =>
                  prev.length === filteredExps.length ? [] : filteredExps.map((e) => e.id)
                )
              }
              className="hov"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "7px 14px",
                borderRadius: 999,
                border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid #E2E8F0",
                background: isDarkMode ? "rgba(255,255,255,0.05)" : "#FFFFFF",
                color: isDarkMode ? "#CBD5E1" : "#475569",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {selectedCards.length === filteredExps.length ? "Aucune" : "Tout sélectionner"}
            </button>
          )}

          {/* Optimiser toutes les fiches */}
          <button
            onClick={handleOptimizeAllInModule}
            disabled={optimizeAllLoading || filterCat === "Toutes" || filteredExps.length === 0}
            title={
              filterCat === "Toutes"
                ? "Sélectionne d'abord un module précis pour l'optimiser"
                : `Optimiser toutes les fiches de "${filterCat}" pour viser 100% de rétention`
            }
            className="hov btn-glow"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 16px",
              borderRadius: 999,
              border:
                filterCat === "Toutes" || filteredExps.length === 0
                  ? isDarkMode
                    ? "1px dashed rgba(255,255,255,0.15)"
                    : "1px dashed #CBD5E1"
                  : "none",
              background:
                optimizeAllLoading || filterCat === "Toutes" || filteredExps.length === 0
                  ? isDarkMode
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(241, 245, 249, 0.9)"
                  : "linear-gradient(135deg, var(--mm-primary, #2563EB), #4F46E5)",
              color:
                optimizeAllLoading || filterCat === "Toutes" || filteredExps.length === 0
                  ? isDarkMode
                    ? "#64748B"
                    : "#94A3B8"
                  : "#FFFFFF",
              fontWeight: 800,
              fontSize: 12,
              cursor:
                optimizeAllLoading || filterCat === "Toutes" || filteredExps.length === 0
                  ? "not-allowed"
                  : "pointer",
              boxShadow:
                optimizeAllLoading || filterCat === "Toutes" || filteredExps.length === 0
                  ? "none"
                  : "0 4px 14px color-mix(in srgb, var(--mm-primary, #2563EB) 35%, transparent)",
              transition: "all 0.2s ease",
            }}
          >
            {optimizeAllLoading
              ? `⏳ ${optimizeAllProgress.done}/${optimizeAllProgress.total}`
              : `✨ Optimiser le module`}
          </button>

          {/* Bouton Métamorphose Multi-IA Anglais */}
          {isEnglishCategory(filterCat) && (
            <button
              type="button"
              onClick={handleTransformAllEnglish}
              disabled={isTransformingEnglish || filteredExps.length === 0}
              title={`Métamorphoser les ${filteredExps.length} fiches d'anglais avec le pool IA`}
              className="hov btn-glow"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 16px",
                borderRadius: 999,
                border: "none",
                background: isTransformingEnglish
                  ? "rgba(100, 116, 139, 0.6)"
                  : "linear-gradient(135deg, #06B6D4, #2563EB)",
                color: "#FFFFFF",
                fontWeight: 800,
                fontSize: 12,
                cursor: isTransformingEnglish ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(6, 182, 212, 0.35)",
                transition: "all 0.2s ease",
              }}
            >
              {isTransformingEnglish
                ? `⏳ ${englishTransformProgress.done}/${englishTransformProgress.total}`
                : `⚡ Métamorphoser le module IA (${filteredExps.length})`}
            </button>
          )}
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div style={{ position: "relative", zIndex: 50, background: isDarkMode ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.4)", padding: isMobile ? "10px 12px" : "12px 16px", borderRadius: 24, border: `1px solid ${theme?.border || "#E2E8F0"}`, marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", boxShadow: "0 4px 20px color-mix(in srgb, var(--mm-primary) 5.0%, transparent)", backdropFilter: "blur(12px)" }}>
        <div style={{ position: "relative", flex: 1, width: isMobile ? "100%" : "auto", minWidth: isMobile ? "100%" : 200, maxWidth: isMobile ? "100%" : (searchQuery ? 600 : 400), transition: "max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
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

        <div style={{ position: "relative", width: isMobile ? "100%" : "auto" }}>
          <button
            onClick={() => setFilterSheetOpen((v) => !v)}
            className="hov btn-glow"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "12px 20px",
              borderRadius: 16,
              background: "linear-gradient(135deg, var(--mm-primary, #2563EB), #1D4ED8)",
              border: "none",
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: 14,
              width: "100%",
              boxShadow: "0 4px 14px color-mix(in srgb, var(--mm-primary, #2563EB) 30%, transparent)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <span>🎯 Filtrer{(filterCat !== "Toutes" || filterLevel !== "Tous") ? " (Actif)" : ""}</span>
            <span style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.85)" }}>▼</span>
          </button>
          {filterSheetOpen && (
            <>
              <div
                onClick={() => setFilterSheetOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 998,
                  background: "rgba(0, 0, 0, 0.45)",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                }}
              />
              <div
                style={
                  isMobile
                    ? {
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        background: isDarkMode ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)",
                        backdropFilter: "blur(24px)",
                        WebkitBackdropFilter: "blur(24px)",
                        padding: "16px 20px calc(env(safe-area-inset-bottom, 20px) + 32px) 20px",
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        borderTop: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.12)" : "#E2E8F0"}`,
                        boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.35)",
                        maxHeight: "75vh",
                        overflowY: "auto",
                      }
                    : {
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        marginTop: 8,
                        zIndex: 1000,
                        background: isDarkMode ? "rgba(15, 23, 42, 0.94)" : "rgba(255, 255, 255, 0.96)",
                        backdropFilter: "blur(24px)",
                        WebkitBackdropFilter: "blur(24px)",
                        padding: 18,
                        borderRadius: 20,
                        border: `1px solid ${theme?.border || "#E2E8F0"}`,
                        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.25)",
                        width: 360,
                        maxHeight: "65vh",
                        overflowY: "auto",
                      }
                }
              >
                {/* Poignée de drag sur mobile */}
                {isMobile && (
                  <div
                    style={{
                      width: 40,
                      height: 4,
                      borderRadius: 2,
                      background: isDarkMode ? "rgba(255, 255, 255, 0.25)" : "#CBD5E1",
                      margin: "0 auto 14px auto",
                    }}
                  />
                )}

                {/* Header de la modale */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 900,
                      color: theme?.text || "#0F172A",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>🎯</span>
                    <span>Filtrer les fiches</span>
                  </div>
                  <button
                    onClick={() => setFilterSheetOpen(false)}
                    style={{
                      background: isDarkMode ? "rgba(255, 255, 255, 0.1)" : "#F1F5F9",
                      border: "none",
                      borderRadius: 999,
                      width: 30,
                      height: 30,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: theme?.textMuted || "#64748B",
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Filtrer par catégorie */}
                <div style={{ fontWeight: 800, marginBottom: 10, color: theme?.text || "#0F172A", fontSize: 13 }}>
                  Filtrer par catégorie
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                  {availableCatFilters.map((c) => {
                    const isNovaFilter = c === "🎙️ Live Nova";
                    const isOldFilter = c === "🔄 Anciennes fiches";
                    const isSelected = filterCat === c;
                    return (
                      <button
                        key={c}
                        onClick={() => startTransition(() => setFilterCat?.(c))}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          background: isSelected
                            ? (isNovaFilter
                                ? "linear-gradient(135deg, #2563EB, #7C3AED)"
                                : isOldFilter
                                ? "linear-gradient(135deg, #06B6D4, #2563EB)"
                                : (theme?.highlight || "var(--mm-primary)"))
                            : (isNovaFilter
                                ? (isDarkMode ? "rgba(124, 58, 237, 0.18)" : "#F5F3FF")
                                : isOldFilter
                                ? (isDarkMode ? "rgba(6, 182, 212, 0.18)" : "#ECFEFF")
                                : (theme?.inputBg || "#F8FAFC")),
                          color: isSelected
                            ? "white"
                            : (isNovaFilter
                                ? (isDarkMode ? "#C4B5FD" : "#6D28D9")
                                : isOldFilter
                                ? (isDarkMode ? "#67E8F9" : "#0891B2")
                                : (theme?.text || "#0F172A")),
                          border: `1px solid ${
                            isSelected
                              ? "transparent"
                              : (isNovaFilter
                                  ? "rgba(124, 58, 237, 0.4)"
                                  : isOldFilter
                                  ? "rgba(6, 182, 212, 0.4)"
                                  : (theme?.border || "#E2E8F0"))
                          }`,
                          transition: "all 0.15s ease",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>{c}</span>
                        {isNovaFilter && (
                          <span style={{
                            fontSize: 10,
                            background: isSelected ? "rgba(255, 255, 255, 0.25)" : "rgba(124, 58, 237, 0.2)",
                            padding: "1px 6px",
                            borderRadius: 999,
                            fontWeight: 800,
                          }}>
                            {unmigratedNovaCards.length}
                          </span>
                        )}
                        {isOldFilter && (
                          <span style={{
                            fontSize: 10,
                            background: isSelected ? "rgba(255, 255, 255, 0.25)" : "rgba(6, 182, 212, 0.25)",
                            padding: "1px 6px",
                            borderRadius: 999,
                            fontWeight: 800,
                          }}>
                            {unmodernizedEnglishCards.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Filtrer par niveau */}
                <div style={{ fontWeight: 800, marginBottom: 10, color: theme?.text || "#0F172A", fontSize: 13 }}>
                  Filtrer par niveau
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  {["Tous", "Nouvelles", "En retard", "Maîtrisées", "En pause"].map((l) => (
                    <button
                      key={l}
                      onClick={() => startTransition(() => setFilterLevel?.(l))}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 100,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        background:
                          filterLevel === l ? theme?.highlight || "var(--mm-primary)" : theme?.inputBg || "#F8FAFC",
                        color: filterLevel === l ? "white" : theme?.text || "#0F172A",
                        border: `1px solid ${
                          filterLevel === l ? theme?.highlight || "var(--mm-primary)" : theme?.border || "#E2E8F0"
                        }`,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                {/* Bouton de réinitialisation si actif */}
                {(filterCat !== "Toutes" || filterLevel !== "Tous") && (
                  <button
                    onClick={() => {
                      setFilterCat?.("Toutes");
                      setFilterLevel?.("Tous");
                    }}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 12,
                      border: `1px solid ${theme?.border || "#E2E8F0"}`,
                      background: "transparent",
                      color: "#EF4444",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      marginBottom: 10,
                    }}
                  >
                    Réinitialiser les filtres
                  </button>
                )}

                {/* Bouton d'application mobile */}
                {isMobile && (
                  <button
                    onClick={() => setFilterSheetOpen(false)}
                    style={{
                      width: "100%",
                      padding: "13px",
                      borderRadius: 14,
                      background: "linear-gradient(135deg, var(--mm-primary, #2563EB), #1D4ED8)",
                      border: "none",
                      color: "#FFFFFF",
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: "pointer",
                      boxShadow: "0 4px 14px color-mix(in srgb, var(--mm-primary, #2563EB) 30%, transparent)",
                    }}
                  >
                    Appliquer les filtres
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>


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

          {/* BANNIÈRE MODERNISATION NOVA (Brique 86) — Masquée dès que count === 0 */}
          {unmigratedNovaCards.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "stretch" : "center",
                justifyContent: "space-between",
                gap: 14,
                padding: isMobile ? "14px 16px" : "16px 20px",
                borderRadius: 20,
                marginBottom: 20,
                background: isDarkMode
                  ? "linear-gradient(135deg, rgba(37, 99, 235, 0.16) 0%, rgba(147, 51, 234, 0.16) 100%)"
                  : "linear-gradient(135deg, rgba(239, 246, 255, 0.95) 0%, rgba(245, 243, 255, 0.95) 100%)",
                border: `1.5px solid ${isDarkMode ? "rgba(147, 51, 234, 0.35)" : "rgba(147, 51, 234, 0.25)"}`,
                boxShadow: "0 8px 24px rgba(37, 99, 235, 0.12)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: "linear-gradient(135deg, #2563EB, #7C3AED)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                    flexShrink: 0,
                  }}
                >
                  🎙️
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: theme?.text || "#0F172A", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{unmigratedNovaCards.length} fiche(s) Live Nova à moderniser</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: "rgba(124, 58, 237, 0.15)", color: "#7C3AED", fontWeight: 800 }}>
                      Format v8
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: theme?.textMuted || "#64748B", marginTop: 2 }}>
                    Mets à niveau l'ancien format vers le verso neuro-cognitif (Tu as dit vs En réalité, comparatif, anti-pattern).
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
                {(
                  <button
                    type="button"
                    aria-pressed={filterCat === "🎙️ Live Nova"}
                    onClick={() => setFilterCat?.(filterCat === "🎙️ Live Nova" ? "Toutes" : "🎙️ Live Nova")}
                    style={{
                      padding: "9px 14px",
                      borderRadius: 12,
                      border: `1px solid ${theme?.border || "#CBD5E1"}`,
                      background: "transparent",
                      color: theme?.text || "#0F172A",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: isMobile ? 1 : "initial",
                      gap: 6,
                    }}
                  >
                    <span>{filterCat === "🎙️ Live Nova" ? "✖️ Tout afficher" : `👁️ Isoler (${unmigratedNovaCards.length})`}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isMigratingNova || isMigratingEnglish}
                  onClick={handleMigrateAllNova}
                  className="btn-glow hov"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: isMobile ? 1 : "initial",
                    gap: 8,
                    padding: "10px 18px",
                    borderRadius: 12,
                    border: "none",
                    background: isMigratingNova
                      ? "rgba(100, 116, 139, 0.6)"
                      : "linear-gradient(135deg, #2563EB, #7C3AED)",
                    color: "#FFFFFF",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: isMigratingNova ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {isMigratingNova ? (
                    <>
                      <span>⏳</span>
                      <span>Modernisation ({novaProgress.current}/{novaProgress.total})...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Moderniser {unmigratedNovaCards.length > 1 ? `les ${unmigratedNovaCards.length} fiches` : "la fiche"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}



          {filteredExps.length === 0 ? (
            <div style={{ background: theme?.cardBg || "#FFFFFF", border: `2px dashed ${theme?.border || "#E2E8F0"}`, borderRadius: 32, padding: "80px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
              <h3 style={{ color: theme?.text || "#0F172A", fontSize: 20, fontWeight: 800 }}>Aucune fiche trouvée</h3>
              <p style={{ color: theme?.textMuted || "#64748B", marginTop: 8, marginBottom: 24 }}>Élargis ta recherche ou crée un nouveau concept.</p>
              <button onClick={() => setView?.("add")} className="btn-glow hov" style={{ padding: "14px 28px", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))", color: "white", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
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
                {filteredExps.slice(0, localVisibleCount).map((exp) => {
                  const lvl = exp.level || 0;
                  const lvlColor = lvl >= 7 ? "var(--mm-primary)" : lvl >= 5 ? "var(--mm-primary)" : lvl >= 3 ? "var(--mm-primary-glow)" : lvl >= 1 ? "var(--mm-primary)" : "#9CA3AF";
                  const catColor = categories.find((c) => c.name === exp.category)?.color || "var(--mm-primary)";
                  const tag = cognitiveTag(exp);
                  const isSelected = selectedCards.includes(exp.id);

                  return (
                    <div
                      key={exp.id}
                      id={`card-${exp.id}`}
                      className={`smart-card card-hov smart-small ${listRippleEffect ? "ripple-anim" : ""}`}
                      style={{
                        background: theme?.cardBg || "#FFFFFF",
                        border: isSelected ? `2px solid ${theme?.highlight || "var(--mm-primary)"}` : `1px solid ${theme?.border || "#E2E8F0"}`,
                        borderRadius: 20,
                        overflow: "hidden",
                        boxShadow: isSelected ? `0 20px 50px ${colorMix(theme?.highlight || "var(--mm-primary)", 31)}` : "0 8px 30px color-mix(in srgb, var(--mm-primary) 5.0%, transparent)",
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
                            border: `2px solid ${isSelected ? (theme?.highlight || "var(--mm-primary)") : (theme?.border || "#E2E8F0")}`,
                            background: isSelected ? (theme?.highlight || "var(--mm-primary)") : "rgba(255,255,255,0.8)",
                            color: "white", fontSize: 13, fontWeight: 900,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          {isSelected ? "✓" : ""}
                        </button>
                      )}
                      <div style={{ padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, background: colorMix(catColor, 13), color: catColor, marginLeft: selectionMode ? 30 : 0 }}>
                          {exp.category}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ background: colorMix(tag.color, 13), color: tag.color, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>
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
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: theme?.highlight || "var(--mm-primary)", lineHeight: 1.3 }}>
                            {exp.front}
                          </div>
                          {isEnglishCategory(exp.category) && (
                            <AudioPlayButton text={exp.front} size="sm" showLabel={false} isDarkMode={isDarkMode} />
                          )}
                        </div>
                        <div style={{ fontSize: 14, color: theme?.text || "#0F172A", lineHeight: 1.6, marginBottom: 16 }}>
                          {(exp.type === "audio" && (exp.audioUrl || exp.audioId)) ? (
                            <AudioFichePlayer card={exp} />
                          ) : (
                            <GodTierContent text={exp.back} theme={theme} isDarkMode={isDarkMode} showAudio={isEnglishCategory(exp.category)} />
                          )}
                        </div>
                        {exp.example && !isEnglishCategory(exp.category) && !/exemples?|mini-dialogue|dialogue/i.test(exp.back || "") && (
                          <div style={{ background: theme?.inputBg || "#F8FAFC", padding: "12px", borderRadius: 12, fontSize: 13, color: theme?.textMuted || "#64748B", fontStyle: "italic", borderLeft: "3px solid var(--mm-primary)", marginBottom: 16 }}>
                            <span style={{ color: "var(--mm-primary)", fontSize: 10 }}>// exemple</span><br />
                            <div style={{ marginTop: 8 }}>
                              <GodTierContent text={exp.example} theme={theme} isDarkMode={isDarkMode} showAudio={isEnglishCategory(exp.category)} />
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
                        <button onClick={() => handleOptimizeOneCard?.(exp)} className="hov btn-glow" style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))", color: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
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
              {/* ── SENTINELLE INFINITE SCROLL & CONTRÔLES (Brique 84) ── */}
              {filteredExps.length > localVisibleCount ? (
                <div style={{ marginTop: 32, padding: "20px 10px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div
                    ref={(node) => {
                      infiniteSentinelRef.current = node;
                      if (loadMoreCardsRef) loadMoreCardsRef.current = node;
                    }}
                    style={{ height: "24px", width: "100%" }}
                  />
                  <div style={{ fontSize: 13, color: theme?.textMuted || "#64748B", fontWeight: 700, fontFamily: "'JetBrains Mono'" }}>
                    Affichage de {Math.min(localVisibleCount, filteredExps.length)} sur {filteredExps.length} fiches
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                      onClick={() => setLocalVisibleCount((prev) => Math.min(prev + 40, filteredExps.length))}
                      className="hov btn-glow"
                      style={{
                        padding: "10px 22px",
                        background: "linear-gradient(135deg, var(--mm-primary), color-mix(in srgb, var(--mm-primary) 80%, black))",
                        color: "white",
                        border: "none",
                        borderRadius: 12,
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: "pointer",
                        boxShadow: "0 4px 14px color-mix(in srgb, var(--mm-primary) 30%, transparent)",
                      }}
                    >
                      ▶ Charger 40 fiches de plus
                    </button>
                    <button
                      onClick={() => setLocalVisibleCount(filteredExps.length)}
                      className="hov"
                      style={{
                        padding: "10px 20px",
                        background: theme?.cardBg || "#FFFFFF",
                        color: theme?.text || "#0F172A",
                        border: `1px solid ${theme?.border || "#E2E8F0"}`,
                        borderRadius: 12,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      ⚡ Tout afficher ({filteredExps.length})
                    </button>
                  </div>
                </div>
              ) : filteredExps.length > 40 ? (
                <div style={{ marginTop: 32, padding: "16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#10B981", fontFamily: "'JetBrains Mono'" }}>
                  ✅ Toutes les fiches sont chargées ({filteredExps.length} fiches)
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* EXPANSION HOLOGRAPHIQUE MODAL */}
      {expandedCard && (() => {
        const lvl = expandedCard.level || 0;
        const catColor = categories.find((c) => c.name === expandedCard.category)?.color || "var(--mm-primary)";
        const health = getCardHealth(expandedCard);

        return (
          <div
            onClick={() => setExpandedCard?.(null)}
            style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640 }}>
              <HoloCard theme={theme} glowColor={catColor} style={{ background: isDarkMode ? "rgba(15,23,42,0.8)" : "rgba(255,255,255,0.9)", border: `1px solid ${colorMix(catColor, 31)}`, borderRadius: 32, padding: "36px", boxShadow: `0 30px 80px rgba(0,0,0,0.4)` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                  <span style={{ padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 800, background: colorMix(catColor, 13), color: catColor, textTransform: "uppercase", letterSpacing: 1 }}>
                    {expandedCard.category}
                  </span>
                  <button onClick={() => setExpandedCard?.(null)} style={{ background: "none", border: "none", color: theme?.textMuted || "#64748B", fontSize: 24, cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: theme?.text || "#0F172A", lineHeight: 1.2 }}>
                    {expandedCard.front}
                  </div>
                  {isEnglishCategory(expandedCard.category) && (
                    <AudioPlayButton text={expandedCard.front} size="md" isDarkMode={isDarkMode} />
                  )}
                </div>

                <div style={{ background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "rgba(255,255,255,0.5)", padding: 20, borderRadius: 20, marginBottom: 24, border: `1px solid ${theme?.border || "#E2E8F0"}` }}>
                  <div style={{ fontSize: 16, color: theme?.text || "#0F172A", lineHeight: 1.6 }}>
                    <GodTierContent text={expandedCard.back} theme={theme} isDarkMode={isDarkMode} showAudio={isEnglishCategory(expandedCard.category)} />
                  </div>
                  {expandedCard.example && !isEnglishCategory(expandedCard.category) && !/exemples?|mini-dialogue|dialogue/i.test(expandedCard.back || "") && (
                    <div style={{ marginTop: 16, padding: "12px 16px", background: theme?.cardBg || "#FFFFFF", borderRadius: 12, fontSize: 14, color: theme?.textMuted || "#64748B", fontStyle: "italic", borderLeft: `3px solid ${catColor}` }}>
                      <GodTierContent text={expandedCard.example} theme={theme} isDarkMode={isDarkMode} showAudio={isEnglishCategory(expandedCard.category)} />
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
                  <button onClick={() => { startDuel?.(expandedCard); setExpandedCard?.(null); }} className="btn-glow hov" style={{ flex: 1, padding: "16px", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))", color: "white", border: "none", borderRadius: 16, fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
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
          padding: "12px 24px", borderRadius: 999, border: `1px solid ${colorMix(theme?.highlight || "var(--mm-primary)", 31)}`,
          boxShadow: `0 30px 60px rgba(0,0,0,0.4)`,
          animation: "fadeUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 16, borderRight: `1px solid ${theme?.border || "#E2E8F0"}` }}>
            <span style={{ fontSize: 24 }}>🖐️</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: theme?.text || "#0F172A" }}>God Hand</span>
              <span style={{ fontSize: 11, color: theme?.highlight || "var(--mm-primary)", fontWeight: 700 }}>{selectedCards.length} sél.</span>
            </div>
          </div>
          <button onClick={godHandGenerateStory} className="hov" style={{ background: "transparent", border: "none", color: theme?.text || "#0F172A", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span>🧬</span> <span>Histoire</span>
          </button>
          <button onClick={godHandCreateMCQ} className="hov" style={{ background: "transparent", border: "none", color: theme?.text || "#0F172A", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span>⚔️</span> <span>QCM</span>
          </button>
          {handleRestructureSelectedRetroEngineering && (
            <button onClick={handleRestructureSelectedRetroEngineering} disabled={optimizeAllLoading} className="hov" style={{ background: "transparent", border: "none", color: "var(--mm-primary)", cursor: optimizeAllLoading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <span>🧩</span> <span>{optimizeAllLoading ? "En cours…" : "Restructurer"}</span>
            </button>
          )}
          <button onClick={handleOptimizeSelected} disabled={optimizeAllLoading} className="hov" style={{ background: "transparent", border: "none", color: "var(--mm-primary)", cursor: optimizeAllLoading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>

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
