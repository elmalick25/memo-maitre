// 🎓 src/components/ScholarshipHubView.jsx
// ============================================================================
// HUB INTELLIGENT DES BOURSES DE MASTER INTERNATIONALES — ÉDITION GOD TIER
// ============================================================================
// Palette : Mauve Améthyste (#8B5CF6), Violet Royal (#6D28D9), Blanc Nacré (#FFFFFF)
// Mode Sombre / Mode Clair avec Glassmorphism givré, reflets néon et micro-animations.
// ============================================================================

import React, { useState, useMemo } from "react";
import {
  MASTER_SCHOLARSHIPS_DATABASE,
  FUNDING_TYPES,
  filterScholarships,
  computeScholarshipDeadlineInfo,
  getScholarshipStats,
} from "../lib/scholarshipCatalog.js";
import { safeStorage } from "../lib/safeStorage.js";

const SAVED_SCHOLARSHIPS_KEY = "memo_saved_scholarships_v1";

export default function ScholarshipHubView({
  theme = {},
  isDarkMode = false,
  onCreateCard = null,
  showToast = () => {},
}) {
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [selectedFunding, setSelectedFunding] = useState("all");
  const [selectedField, setSelectedField] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScholarshipModal, setSelectedScholarshipModal] = useState(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Favoris / Candidatures suivies
  const [savedIds, setSavedIds] = useState(() => {
    try {
      return new Set(JSON.parse(safeStorage.get(SAVED_SCHOLARSHIPS_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });

  const toggleSaveScholarship = (id) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast?.("Bourse retirée de vos candidatures suivies.", "info");
      } else {
        next.add(id);
        showToast?.("⭐ Bourse ajoutée à vos candidatures suivies !", "success");
      }
      safeStorage.set(SAVED_SCHOLARSHIPS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Liste des pays uniques
  const availableCountries = useMemo(() => {
    const map = new Map();
    MASTER_SCHOLARSHIPS_DATABASE.forEach((item) => {
      if (!map.has(item.countryCode)) {
        map.set(item.countryCode, { code: item.countryCode, name: item.country, flag: item.flag });
      }
    });
    return Array.from(map.values());
  }, []);

  // Filtrage
  const filteredList = useMemo(() => {
    let list = filterScholarships(MASTER_SCHOLARSHIPS_DATABASE, {
      country: selectedCountry,
      fundingType: selectedFunding,
      field: selectedField,
      status: selectedStatus,
      searchQuery,
    });

    if (selectedStatus === "saved") {
      list = list.filter((item) => savedIds.has(item.id));
    }
    return list;
  }, [selectedCountry, selectedFunding, selectedField, selectedStatus, searchQuery, savedIds]);

  const stats = useMemo(() => getScholarshipStats(MASTER_SCHOLARSHIPS_DATABASE), []);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        padding: "8px 4px 80px",
        color: isDarkMode ? "#F8FAFC" : "#1E1B4B",
        fontFamily: "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style>{`
        @keyframes god-shimmer {
          0% { background-position: -800px 0; }
          100% { background-position: 800px 0; }
        }
        @keyframes god-glow-pulse {
          0%, 100% { box-shadow: 0 0 25px rgba(139, 92, 246, 0.35); }
          50% { box-shadow: 0 0 45px rgba(167, 139, 250, 0.6); }
        }
        @keyframes god-card-fade {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes tag-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        
        .god-scholarship-card {
          animation: god-card-fade 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .god-scholarship-card:hover {
          transform: translateY(-4px);
          border-color: rgba(167, 139, 250, 0.7) !important;
          box-shadow: 0 16px 36px rgba(139, 92, 246, 0.22) !important;
        }

        .god-pill-btn {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .god-pill-btn:hover {
          transform: translateY(-1px);
        }
      `}</style>

      {/* ─── HERO BANNER GOD TIER (MAUVE & BLANC) ─────────────────────────── */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "28px",
          padding: "30px 32px",
          marginBottom: "26px",
          background: isDarkMode
            ? "linear-gradient(135deg, #1E1B4B 0%, #171236 40%, #0F0E26 100%)"
            : "linear-gradient(135deg, #FAF5FF 0%, #F3E8FF 50%, #EDE9FE 100%)",
          border: isDarkMode
            ? "1px solid rgba(167, 139, 250, 0.35)"
            : "1px solid rgba(196, 181, 253, 0.8)",
          boxShadow: isDarkMode
            ? "0 20px 50px rgba(10, 8, 30, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)"
            : "0 16px 40px rgba(139, 92, 246, 0.12), inset 0 1px 0 #FFFFFF",
        }}
      >
        {/* Glow Spheres */}
        <div
          style={{
            position: "absolute",
            top: "-50px",
            right: "-30px",
            width: "220px",
            height: "220px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(167, 139, 250, 0.35) 0%, transparent 70%)",
            filter: "blur(30px)",
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px", position: "relative", zIndex: 2 }}>
          <div style={{ maxWidth: "680px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #8B5CF6, #8B5CF6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  boxShadow: "0 6px 18px rgba(139, 92, 246, 0.4)",
                }}
              >
                🎓
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "26px",
                  fontWeight: "900",
                  letterSpacing: "-0.5px",
                  backgroundImage: isDarkMode
                    ? "linear-gradient(90deg, #FFFFFF 0%, #E9D5FF 60%, #C4B5FD 100%)"
                    : "linear-gradient(90deg, #4C1D95 0%, #6D28D9 60%, #7C3AED 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Hub Bourses Master Internationales
              </h1>
              <span
                style={{
                  background: "linear-gradient(135deg, #10B981, #059669)",
                  color: "#FFFFFF",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: "900",
                  letterSpacing: "0.6px",
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)",
                }}
              >
                ✓ 100% OFFICIEL
              </span>
            </div>

            <p style={{ margin: 0, fontSize: "14px", color: isDarkMode ? "#C4B5FD" : "#5B21B6", lineHeight: "1.6", fontWeight: "500" }}>
              Opportunités vérifiées et programmes d'excellence mondiaux (Eiffel, Erasmus Mundus, DAAD, Chevening, Fulbright, MEXT, GKS). Montants réels, critères d'éligibilité, dates limites et accès direct aux portails gouvernementaux officiels.
            </p>
          </div>

          {/* Cartes KPI Glassmorphism Mauve & Blanc */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div
              style={{
                background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#FFFFFF",
                backdropFilter: "blur(12px)",
                border: isDarkMode ? "1px solid rgba(167, 139, 250, 0.3)" : "1px solid rgba(196, 181, 253, 0.6)",
                padding: "12px 18px",
                borderRadius: "18px",
                textAlign: "center",
                minWidth: "90px",
                boxShadow: isDarkMode ? "0 8px 20px rgba(0,0,0,0.3)" : "0 6px 16px rgba(139,92,246,0.08)",
              }}
            >
              <div style={{ fontSize: "24px", fontWeight: "900", color: "#8B5CF6" }}>{stats.total}</div>
              <div style={{ fontSize: "11px", color: isDarkMode ? "#E2E8F0" : "#6B21A8", fontWeight: "700" }}>Grandes Bourses</div>
            </div>

            <div
              style={{
                background: isDarkMode ? "rgba(16, 185, 129, 0.12)" : "#ECFDF5",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                padding: "12px 18px",
                borderRadius: "18px",
                textAlign: "center",
                minWidth: "110px",
                boxShadow: "0 6px 16px rgba(16, 185, 129, 0.12)",
              }}
            >
              <div style={{ fontSize: "24px", fontWeight: "900", color: "#10B981" }}>{stats.fullRideCount}</div>
              <div style={{ fontSize: "11px", color: "#059669", fontWeight: "700" }}>👑 100% Tout Compris</div>
            </div>

            <div
              style={{
                background: isDarkMode ? "rgba(245, 158, 11, 0.12)" : "#FFFBEB",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(245, 158, 11, 0.4)",
                padding: "12px 18px",
                borderRadius: "18px",
                textAlign: "center",
                minWidth: "95px",
                boxShadow: "0 6px 16px rgba(245, 158, 11, 0.12)",
              }}
            >
              <div style={{ fontSize: "24px", fontWeight: "900", color: "#F59E0B" }}>{stats.closingSoonCount}</div>
              <div style={{ fontSize: "11px", color: "#D97706", fontWeight: "700" }}>🔥 Clôture &lt; 45j</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── BARRE DE CONTRÔLE GOD TIER (RECHERCHE + BOUTON UNIQUE DE FILTRES) ─── */}
      <div
        style={{
          background: isDarkMode ? "rgba(30, 27, 75, 0.5)" : "#FFFFFF",
          backdropFilter: "blur(16px)",
          border: isDarkMode ? "1px solid rgba(167, 139, 250, 0.2)" : "1px solid #EDE9FE",
          borderRadius: "22px",
          padding: "14px 18px",
          marginBottom: "24px",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center",
          boxShadow: isDarkMode ? "0 12px 30px rgba(0, 0, 0, 0.25)" : "0 6px 20px rgba(139, 92, 246, 0.06)",
          position: "relative",
          zIndex: 40,
        }}
      >
        {/* Champ de recherche */}
        <div style={{ flex: "1 1 240px", position: "relative" }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Rechercher une bourse (Eiffel, Erasmus, DAAD, Canada, 1 400 €...)"
            style={{
              width: "100%",
              padding: "11px 16px",
              borderRadius: "14px",
              border: isDarkMode ? "1px solid rgba(167, 139, 250, 0.3)" : "1px solid #DDD6FE",
              background: isDarkMode ? "rgba(15, 14, 38, 0.7)" : "#FAF5FF",
              color: isDarkMode ? "#FFFFFF" : "#1E1B4B",
              fontSize: "13px",
              fontWeight: "600",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Bouton Unique de Filtres God Tier */}
        <button
          onClick={() => setIsFiltersOpen(!isFiltersOpen)}
          className="god-pill-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            padding: "11px 18px",
            borderRadius: "14px",
            background: isFiltersOpen || selectedCountry !== "all" || selectedFunding !== "all" || selectedStatus !== "all"
              ? "linear-gradient(135deg, #8B5CF6, #6D28D9)"
              : isDarkMode
              ? "rgba(255, 255, 255, 0.08)"
              : "#F3E8FF",
            color: isFiltersOpen || selectedCountry !== "all" || selectedFunding !== "all" || selectedStatus !== "all"
              ? "#FFFFFF"
              : isDarkMode
              ? "#C4B5FD"
              : "#6D28D9",
            border: "none",
            fontSize: "13px",
            fontWeight: "800",
            cursor: "pointer",
            boxShadow: isFiltersOpen ? "0 6px 20px rgba(139, 92, 246, 0.4)" : "none",
            whiteSpace: "nowrap",
          }}
        >
          <span>🎯</span>
          <span>
            {selectedCountry !== "all"
              ? availableCountries.find(c => c.code === selectedCountry)?.name || selectedCountry
              : selectedFunding === "full_ride"
              ? "👑 100% Tout Compris"
              : selectedStatus === "saved"
              ? "⭐ Suivies"
              : "Filtrer & Destinations"}
          </span>
          <span style={{ fontSize: "11px", transform: isFiltersOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            ▼
          </span>
        </button>

        {/* POPOVER GOD TIER DES FILTRES DE BOURSES */}
        {isFiltersOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              left: 0,
              right: 0,
              background: isDarkMode ? "#13112E" : "#FFFFFF",
              backdropFilter: "blur(24px)",
              border: isDarkMode ? "1px solid rgba(167, 139, 250, 0.4)" : "1px solid #DDD6FE",
              borderRadius: "22px",
              padding: "20px",
              boxShadow: isDarkMode
                ? "0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
                : "0 16px 40px rgba(139, 92, 246, 0.15), inset 0 1px 0 #FFFFFF",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              zIndex: 50,
              animation: "tiv-fade 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Section 1 : Type de Financement */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: isDarkMode ? "#A78BFA" : "#7C3AED", letterSpacing: "0.5px", marginBottom: "10px" }}>
                Type de Bourse :
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={() => { setSelectedStatus("all"); setSelectedFunding("all"); setIsFiltersOpen(false); }}
                  className="god-pill-btn"
                  style={{
                    padding: "8px 14px",
                    borderRadius: "10px",
                    border: "none",
                    background: selectedStatus === "all" && selectedFunding === "all" ? "linear-gradient(135deg, #8B5CF6, #6D28D9)" : isDarkMode ? "rgba(255,255,255,0.06)" : "#F3E8FF",
                    color: selectedStatus === "all" && selectedFunding === "all" ? "#FFFFFF" : isDarkMode ? "#C4B5FD" : "#6D28D9",
                    fontSize: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  Toutes les bourses ({MASTER_SCHOLARSHIPS_DATABASE.length})
                </button>

                <button
                  onClick={() => { setSelectedFunding("full_ride"); setSelectedStatus("all"); setIsFiltersOpen(false); }}
                  className="god-pill-btn"
                  style={{
                    padding: "8px 14px",
                    borderRadius: "10px",
                    border: "none",
                    background: selectedFunding === "full_ride" ? "linear-gradient(135deg, #10B981, #059669)" : isDarkMode ? "rgba(16, 185, 129, 0.1)" : "#ECFDF5",
                    color: selectedFunding === "full_ride" ? "#FFFFFF" : "#059669",
                    fontSize: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  👑 100% Tout Compris (Full Ride)
                </button>

                <button
                  onClick={() => { setSelectedStatus("saved"); setSelectedFunding("all"); setIsFiltersOpen(false); }}
                  className="god-pill-btn"
                  style={{
                    padding: "8px 14px",
                    borderRadius: "10px",
                    border: "none",
                    background: selectedStatus === "saved" ? "linear-gradient(135deg, #F59E0B, #D97706)" : isDarkMode ? "rgba(245, 158, 11, 0.1)" : "#FFFBEB",
                    color: selectedStatus === "saved" ? "#FFFFFF" : "#D97706",
                    fontSize: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  ⭐ Candidatures Suivies ({savedIds.size})
                </button>
              </div>
            </div>

            {/* Section 2 : Destinations par Pays */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: isDarkMode ? "#A78BFA" : "#7C3AED", letterSpacing: "0.5px", marginBottom: "10px" }}>
                Destinations d'Études :
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px" }}>
                <button
                  onClick={() => { setSelectedCountry("all"); setIsFiltersOpen(false); }}
                  className="god-pill-btn"
                  style={{
                    padding: "8px 12px",
                    borderRadius: "10px",
                    border: selectedCountry === "all" ? "none" : isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid #DDD6FE",
                    background: selectedCountry === "all" ? "linear-gradient(135deg, #8B5CF6, #8B5CF6)" : "transparent",
                    color: selectedCountry === "all" ? "#FFFFFF" : isDarkMode ? "#E2E8F0" : "#4C1D95",
                    fontSize: "12px",
                    fontWeight: selectedCountry === "all" ? "800" : "600",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  🌐 Tous les pays
                </button>

                {availableCountries.map((c) => {
                  const isSel = selectedCountry === c.code;
                  return (
                    <button
                      key={c.code}
                      onClick={() => { setSelectedCountry(c.code); setIsFiltersOpen(false); }}
                      className="god-pill-btn"
                      style={{
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: isSel ? "none" : isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid #DDD6FE",
                        background: isSel ? "linear-gradient(135deg, #8B5CF6, #8B5CF6)" : "transparent",
                        color: isSel ? "#FFFFFF" : isDarkMode ? "#E2E8F0" : "#4C1D95",
                        fontSize: "12px",
                        fontWeight: isSel ? "800" : "600",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span>{c.flag}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bouton de Réinitialisation */}
            {(selectedCountry !== "all" || selectedFunding !== "all" || selectedStatus !== "all") && (
              <div style={{ display: "flex", justifyContent: "flex-end", borderTop: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid #EDE9FE", paddingTop: "12px" }}>
                <button
                  onClick={() => {
                    setSelectedCountry("all");
                    setSelectedFunding("all");
                    setSelectedStatus("all");
                    setIsFiltersOpen(false);
                  }}
                  style={{
                    background: "transparent",
                    color: "#EF4444",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  ↺ Réinitialiser tous les filtres
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── GRILLE DES CARTES GOD TIER ─────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
          gap: "22px",
        }}
      >
        {filteredList.map((item) => {
          const deadline = computeScholarshipDeadlineInfo(item.nextDeadline);
          const isSaved = savedIds.has(item.id);

          return (
            <div
              key={item.id}
              className="god-scholarship-card"
              style={{
                background: isDarkMode
                  ? "linear-gradient(135deg, rgba(30, 27, 75, 0.7) 0%, rgba(19, 17, 39, 0.9) 100%)"
                  : "linear-gradient(135deg, #FFFFFF 0%, #FAF5FF 100%)",
                backdropFilter: "blur(20px)",
                border: isSaved
                  ? "2px solid #F59E0B"
                  : isDarkMode
                  ? "1px solid rgba(167, 139, 250, 0.25)"
                  : "1px solid #EDE9FE",
                borderRadius: "24px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "16px",
                boxShadow: isDarkMode
                  ? "0 10px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)"
                  : "0 8px 24px rgba(139, 92, 246, 0.08), inset 0 1px 0 #FFFFFF",
              }}
            >
              {/* En-tête : Drapeau, Pays, Badge vérifié & Favori */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        fontSize: "26px",
                        background: isDarkMode ? "rgba(255,255,255,0.08)" : "#F3E8FF",
                        padding: "6px 8px",
                        borderRadius: "12px",
                        border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid #DDD6FE",
                      }}
                    >
                      {item.flag}
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: isDarkMode ? "#C4B5FD" : "#6D28D9", letterSpacing: "0.6px" }}>
                        {item.country}
                      </div>
                      <div style={{ fontSize: "11px", color: isDarkMode ? "#C084FC" : "#9333EA", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}>
                        <span>🏛️</span>
                        <span>{item.verifiedOrg}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleSaveScholarship(item.id)}
                    className="god-pill-btn"
                    title={isSaved ? "Retirer des suivis" : "Sauvegarder cette bourse"}
                    style={{
                      background: isSaved ? "#FEF3C7" : isDarkMode ? "rgba(255,255,255,0.06)" : "#F3E8FF",
                      border: isSaved ? "1px solid #F59E0B" : "1px solid transparent",
                      borderRadius: "10px",
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "800",
                      color: isSaved ? "#B45309" : isDarkMode ? "#C4B5FD" : "#6D28D9",
                    }}
                  >
                    {isSaved ? "⭐ Suivie" : "☆ Suivre"}
                  </button>
                </div>

                {/* Titre & Diplôme visé */}
                <h3
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: "18px",
                    fontWeight: "900",
                    lineHeight: "1.3",
                    letterSpacing: "-0.3px",
                    color: isDarkMode ? "#FFFFFF" : "#1E1B4B",
                  }}
                >
                  {item.title}
                </h3>
                <div style={{ fontSize: "12px", color: isDarkMode ? "#A78BFA" : "#7C3AED", fontWeight: "700", marginBottom: "14px" }}>
                  🎯 {item.targetDegree}
                </div>

                {/* Bloc Financement : Mauve & Vert Fluo */}
                <div
                  style={{
                    background: isDarkMode
                      ? "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)"
                      : "linear-gradient(135deg, #ECFDF5 0%, #F5F3FF 100%)",
                    border: isDarkMode ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "14px",
                    padding: "12px 16px",
                    marginBottom: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: "900", textTransform: "uppercase", color: "#059669", letterSpacing: "0.5px" }}>
                      Allocation Mensuelle
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "900", color: "#10B981" }}>
                      {item.monthlyStipend}
                    </div>
                  </div>
                  <span
                    style={{
                      background: "linear-gradient(135deg, #10B981, #059669)",
                      color: "#FFFFFF",
                      padding: "4px 10px",
                      borderRadius: "8px",
                      fontSize: "11px",
                      fontWeight: "900",
                      boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    👑 100% FINANCÉ
                  </span>
                </div>

                {/* Avantages Clés */}
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "14px" }}>
                  {item.benefits.slice(0, 3).map((b, idx) => (
                    <div key={idx} style={{ fontSize: "12px", color: isDarkMode ? "#CBD5E1" : "#6D28D9", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#10B981", fontWeight: "900" }}>✓</span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>

                {/* Badges d'éligibilité */}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                  {item.eligibility.maxAge && (
                    <span style={{ background: isDarkMode ? "rgba(255,255,255,0.06)" : "#F3E8FF", color: isDarkMode ? "#C4B5FD" : "#6D28D9", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                      🎂 {item.eligibility.maxAge}
                    </span>
                  )}
                  <span style={{ background: isDarkMode ? "rgba(255,255,255,0.06)" : "#F3E8FF", color: isDarkMode ? "#C4B5FD" : "#6D28D9", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                    🗣️ {item.eligibility.languageReq}
                  </span>
                </div>
              </div>

              {/* Pied de Carte : Compte à Rebours & Boutons d'Action */}
              <div>
                <div
                  style={{
                    background: isDarkMode ? "rgba(15, 14, 38, 0.7)" : "#FAF5FF",
                    border: isDarkMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid #EDE9FE",
                    borderRadius: "12px",
                    padding: "9px 14px",
                    marginBottom: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "11px", color: isDarkMode ? "#94A3B8" : "#6B21A8", fontWeight: "700" }}>
                    Date Limite :
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: "900", color: deadline.color }}>
                    {deadline.label}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <a
                    href={item.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="god-pill-btn"
                    style={{
                      flex: 1,
                      textAlign: "center",
                      background: "linear-gradient(135deg, #8B5CF6, #8B5CF6)",
                      color: "#FFFFFF",
                      padding: "10px 14px",
                      borderRadius: "12px",
                      textDecoration: "none",
                      fontSize: "12px",
                      fontWeight: "800",
                      display: "inline-block",
                      boxShadow: "0 4px 14px rgba(139, 92, 246, 0.35)",
                    }}
                  >
                    🌐 Portail Officiel
                  </a>

                  <button
                    onClick={() => setSelectedScholarshipModal(item)}
                    className="god-pill-btn"
                    style={{
                      background: isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#EDE9FE",
                      color: isDarkMode ? "#F8FAFC" : "#5B21B6",
                      border: "none",
                      padding: "10px 14px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: "800",
                      cursor: "pointer",
                    }}
                  >
                    📋 Dossier
                  </button>

                  {onCreateCard && (
                    <button
                      onClick={() => {
                        onCreateCard({
                          front: `Bourse Master ${item.country} : ${item.title}`,
                          back: `Conditions & Avantages :\n- Financement : ${item.monthlyStipend}\n- Critères : ${item.eligibility.level}, ${item.eligibility.maxAge}\n- Date limite : ${item.deadlineMonth}\n- Lien : ${item.officialUrl}`,
                          category: "Bourses Master",
                        });
                        showToast?.("Fiche FSRS créée dans votre deck !", "success");
                      }}
                      className="god-pill-btn"
                      title="Créer une fiche mémo FSRS"
                      style={{
                        background: "rgba(139, 92, 246, 0.2)",
                        color: "#8B5CF6",
                        border: "1px solid rgba(139, 92, 246, 0.3)",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        fontSize: "15px",
                        cursor: "pointer",
                      }}
                    >
                      🧠
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── MODAL GOD TIER (DÉTAILS & DOSSIER) ─────────────────────────────── */}
      {selectedScholarshipModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(7, 6, 20, 0.8)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 9999,
          }}
          onClick={() => setSelectedScholarshipModal(null)}
        >
          <div
            style={{
              background: isDarkMode ? "#13112E" : "#FFFFFF",
              border: isDarkMode ? "1px solid rgba(167, 139, 250, 0.3)" : "1px solid #DDD6FE",
              borderRadius: "24px",
              maxWidth: "620px",
              width: "100%",
              maxHeight: "88vh",
              overflowY: "auto",
              padding: "30px",
              color: isDarkMode ? "#F8FAFC" : "#1E1B4B",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "36px" }}>{selectedScholarshipModal.flag}</span>
                <div>
                  <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: isDarkMode ? "#FFFFFF" : "#1E1B4B" }}>
                    {selectedScholarshipModal.title}
                  </h2>
                  <div style={{ fontSize: "12px", color: isDarkMode ? "#C084FC" : "#9333EA", fontWeight: "700" }}>
                    🏛️ {selectedScholarshipModal.provider}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedScholarshipModal(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "20px",
                  color: isDarkMode ? "#94A3B8" : "#6B21A8",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Prise en charge financière */}
            <div
              style={{
                background: isDarkMode ? "rgba(16, 185, 129, 0.12)" : "#ECFDF5",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "16px",
                padding: "16px",
                marginBottom: "20px",
              }}
            >
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#059669", fontWeight: "800" }}>
                🎁 Couverture financière complète :
              </h4>
              <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: isDarkMode ? "#E2E8F0" : "#1E293B", lineHeight: "1.6" }}>
                {selectedScholarshipModal.benefits.map((b, idx) => (
                  <li key={idx}><strong>{b}</strong></li>
                ))}
              </ul>
            </div>

            {/* Critères d'admissibilité */}
            <div
              style={{
                background: isDarkMode ? "rgba(139, 92, 246, 0.1)" : "#F5F3FF",
                border: isDarkMode ? "1px solid rgba(139, 92, 246, 0.25)" : "1px solid #DDD6FE",
                borderRadius: "16px",
                padding: "16px",
                marginBottom: "24px",
              }}
            >
              <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#8B5CF6", fontWeight: "800" }}>
                📋 Critères d'éligibilité et pièces du dossier :
              </h4>
              <div style={{ fontSize: "13px", color: isDarkMode ? "#E2E8F0" : "#334155", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div>• <strong>Diplôme requis :</strong> {selectedScholarshipModal.eligibility.level}</div>
                <div>• <strong>Âge limite :</strong> {selectedScholarshipModal.eligibility.maxAge}</div>
                <div>• <strong>Niveau linguistique :</strong> {selectedScholarshipModal.eligibility.languageReq}</div>
                <div>• <strong>Nationalités éligibles :</strong> {selectedScholarshipModal.eligibility.nationality}</div>
              </div>
            </div>

            {/* CTA */}
            <a
              href={selectedScholarshipModal.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: "100%",
                textAlign: "center",
                background: "linear-gradient(135deg, #8B5CF6, #8B5CF6)",
                color: "#FFFFFF",
                padding: "14px",
                borderRadius: "14px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "900",
                display: "block",
                boxSizing: "border-box",
                boxShadow: "0 6px 20px rgba(139, 92, 246, 0.4)",
              }}
            >
              🚀 Déposer mon dossier sur le portail officiel
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
