import React, { useState, useMemo } from "react";
import HoloCard from "./HoloCard";
import ModuleButton from "./modules/ModuleButton";
import { getModuleCards, isAvailableModuleName, mergeModuleData } from "../lib/moduleActions";
import "../styles/modules.css";
import { safeParseJSON } from "../lib/textUtils";
import { computeModuleComparison } from "../lib/reviewStats";

export default function CategoriesView({
  categories = [],
  setCategories,
  expressions = [],
  setExpressions,
  theme,
  isDarkMode,
  showToast,
  callClaude,
  navigate,
  setView,
  startReview,
  reviewPausedCards,
  pauseNewCards,
  releaseAllPaused,
  exportModule,
  deleteCategory,
  setPauseManagerModule,
  setPauseManagerSelected,
  setFilterCat,
  setFilterLevel,
  setSearchQuery,
  setSelectionMode,
  setSelectedCards,
  setAddBatchQueue,
  today,
  isDue,
  pauseDripQuota,
  setPauseDripQuota,
}) {
  const [newCat, setNewCat] = useState({ name: "", targetScore: 80, color: "var(--mm-primary)" });
  const [creationOpen, setCreationOpen] = useState(false);
  const [catsViewMode, setCatsViewMode] = useState("cards"); // cards | table | timeline | prep
  const [catsMergeSource, setCatsMergeSource] = useState("");
  const [catsMergeTarget, setCatsMergeTarget] = useState("");
  const [catsFavorites, setCatsFavorites] = useState([]);
  const [catsAlerts, setCatsAlerts] = useState([]);
  const [catsAiReport, setCatsAiReport] = useState(null);
  const [catsLearningCurve, setCatsLearningCurve] = useState({});
  const [prepLoading, setPrepLoading] = useState({});

  const [moduleStatsList] = useState([]);
  const [moduleSearch, setModuleSearch] = useState("");

  const calculatedModuleStatsList = useMemo(
    () => computeModuleComparison(categories, expressions),
    [categories, expressions]
  );

  const catsStats = useMemo(() => {
    const map = {};
    calculatedModuleStatsList.forEach(m => { map[m.name] = m; });
    return map;
  }, [calculatedModuleStatsList]);

  const filteredCategories = useMemo(() => {
    let list = categories || [];
    if (moduleSearch.trim()) {
      const q = moduleSearch.trim().toLowerCase();
      list = list.filter((c) => (c?.name || "").toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const favA = catsFavorites.includes(a.name);
      const favB = catsFavorites.includes(b.name);
      if (favA && !favB) return -1;
      if (!favA && favB) return 1;
      return 0;
    });
  }, [categories, moduleSearch, catsFavorites]);

  const handleAddCat = () => {
    const trimmed = newCat.name.trim();
    if (!isAvailableModuleName(categories, trimmed)) {
      showToast?.("Nom invalide ou existant.", "error");
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem("mm_deleted_categories") || "[]");
      const next = stored.filter((n) => n !== trimmed);
      localStorage.setItem("mm_deleted_categories", JSON.stringify(next));
    } catch {}
    setCategories?.((prev) => [...prev, { ...newCat, name: trimmed }]);
    setNewCat({ name: "", targetScore: 80, color: "var(--mm-primary)" });
    showToast?.("Module créé !");
  };

  const toggleFavorite = (name) => {
    setCatsFavorites((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const mergeModules = () => {
    if (!catsMergeSource || !catsMergeTarget || catsMergeSource === catsMergeTarget) {
      showToast?.("Veuillez sélectionner deux modules distincts.", "error");
      return;
    }
    let merged;
    try { merged = mergeModuleData(categories, expressions, catsMergeSource, catsMergeTarget); }
    catch (error) { showToast?.(error.message, "error"); return; }
    if (!window.confirm(`Fusionner "${catsMergeSource}" dans "${catsMergeTarget}" ? Les fiches seront conservées, le module source sera supprimé.`)) return;
    setExpressions?.(merged.expressions);
    setCategories?.(merged.categories);
    try {
      const stored = JSON.parse(localStorage.getItem("mm_deleted_categories") || "[]");
      localStorage.setItem("mm_deleted_categories", JSON.stringify([...new Set([...stored, catsMergeSource])]));
    } catch {}
    showToast?.(`Module "${catsMergeSource}" fusionné dans "${catsMergeTarget}".`);
    setCatsMergeSource("");
    setCatsMergeTarget("");
  };

  const handleDeleteCat = (catName) => {
    if (deleteCategory) {
      deleteCategory(catName);
      return;
    }
    const catExps = (expressions || []).filter((e) => e.category === catName);
    const confirmMsg = catExps.length > 0
      ? `Supprimer le module "${catName}" et ses ${catExps.length} fiche(s) ? Cette action est irréversible.`
      : `Supprimer le module "${catName}" ?`;
    if (typeof window !== "undefined" && window.confirm && !window.confirm(confirmMsg)) {
      return;
    }
    if (catExps.length > 0) {
      setExpressions?.((prev) => prev.filter((e) => e.category !== catName));
    }
    setCategories?.((prev) => prev.filter((c) => c.name !== catName));
    try {
      const stored = JSON.parse(localStorage.getItem("mm_deleted_categories") || "[]");
      if (!stored.includes(catName)) {
        stored.push(catName);
        localStorage.setItem("mm_deleted_categories", JSON.stringify(stored));
      }
    } catch {}
    showToast?.(`Module "${catName}" supprimé.`);
  };

  const handleExportModule = (catName) => {
    if (exportModule) {
      exportModule(catName);
      return;
    }
    const catExps = (expressions || []).filter((e) => e.category === catName);
    const dataStr = JSON.stringify(catExps, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `module_${catName.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast?.(`Module "${catName}" exporté (${catExps.length} fiches).`);
  };

  const handlePauseNewCards = (catName) => {
    if (pauseNewCards) {
      pauseNewCards(catName);
      return;
    }
    setExpressions?.((prev) =>
      prev.map((e) =>
        e.category === catName && (e.level || 0) === 0 && !e.paused
          ? { ...e, paused: true }
          : e
      )
    );
    showToast?.(`Nouvelles fiches de "${catName}" mises en pause.`);
  };

  const handleReleaseAllPaused = (catName) => {
    if (releaseAllPaused) {
      releaseAllPaused(catName);
      return;
    }
    setExpressions?.((prev) =>
      prev.map((e) => (e.category === catName && e.paused ? { ...e, paused: false } : e))
    );
    showToast?.(`Toutes les fiches en pause de "${catName}" ont été libérées.`);
  };

  const handleReviewPausedCards = (catName) => {
    if (reviewPausedCards) {
      reviewPausedCards(catName);
      return;
    }
    const paused = (expressions || []).filter((e) => e.category === catName && e.paused);
    if (paused.length === 0) {
      showToast?.("Aucune fiche en pause dans ce module.", "info");
      return;
    }
    startReview?.(catName, "module", paused);
  };

  return (
    <div className="modules-view" style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: theme?.highlight || "var(--mm-primary)", marginBottom: 8 }}>◉ Gestion des Modules</h1>
          <p style={{ color: theme?.textMuted }}>Statistiques avancées, prérequis, planification et coaching par module.</p>
        </div>
        {/* Barre de recherche Maître-Design */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: "min(320px, 100%)" }}>
          <div style={{ position: "relative", width: "100%" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: theme?.textMuted, pointerEvents: "none" }}>
              🔍
            </span>
            <input
              type="text"
              value={moduleSearch}
              onChange={(e) => setModuleSearch(e.target.value)}
              placeholder="Rechercher un module..."
              style={{
                width: "100%",
                padding: "10px 36px 10px 38px",
                borderRadius: 14,
                border: `1px solid ${moduleSearch ? theme?.highlight || "var(--mm-primary)" : theme?.border || "#ccc"}`,
                background: theme?.cardBg || "transparent",
                color: theme?.text || "inherit",
                fontSize: 13,
                fontWeight: 600,
                outline: "none",
                boxShadow: moduleSearch ? "0 0 0 3px color-mix(in srgb, var(--mm-primary) 20%, transparent)" : "none",
                transition: "all 0.2s ease"
              }}
            />
            {moduleSearch && (
              <button
                type="button"
                onClick={() => setModuleSearch("")}
                title="Effacer la recherche"
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "color-mix(in srgb, var(--mm-primary) 15%, transparent)",
                  color: theme?.textMuted || "#666",
                  border: "none",
                  borderRadius: "50%",
                  width: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 900,
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dosage automatique des fiches en pause */}
      {setPauseDripQuota && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, background: "color-mix(in srgb, var(--mm-primary) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--mm-primary) 25%, transparent)", borderRadius: 14, padding: "12px 16px", marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: theme?.text }}>
            🔁 <strong>Dosage quotidien :</strong> chaque jour, les fiches en pause les plus anciennes sont libérées automatiquement pour ne pas s'accumuler.
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: theme?.textMuted, fontWeight: 700 }}>
            Fiches/jour :
            <input
              type="number"
              min={0}
              max={200}
              value={pauseDripQuota}
              onChange={(e) => setPauseDripQuota(Math.max(0, parseInt(e.target.value, 10) || 0))}
              style={{ width: 60, padding: "6px 8px", background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 8, color: theme?.text, fontSize: 12 }}
            />
          </label>
        </div>
      )}

      {/* Alertes globales */}
      {catsAlerts.length > 0 && (
        <div style={{ background: "#FEF2F2", borderRadius: 16, padding: 16, marginBottom: 20, border: "1px solid #FECACA" }}>
          <h3 style={{ margin: "0 0 12px", color: "#991B1B" }}>🚨 Alertes modules</h3>
          {catsAlerts.map((alert, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ fontWeight: 700 }}>{alert.module}</span>
              <span style={{ color: alert.type === "danger" ? "var(--mm-danger)" : "var(--mm-primary)" }}>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rapport IA */}
      {catsAiReport && (
        <div style={{ background: theme?.cardBg, borderRadius: 16, padding: 20, marginBottom: 20, border: "2px solid var(--mm-primary)" }}>
          <h3 style={{ margin: "0 0 8px", color: "var(--mm-primary)" }}>🧠 Plan d'action IA</h3>
          <p><strong>Module critique :</strong> {catsAiReport.criticalModule}</p>
          <ul>{catsAiReport.recommendations?.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <button onClick={() => setCatsAiReport(null)} style={{ background: "none", border: "none", color: theme?.textMuted, cursor: "pointer" }}>✕</button>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <ModuleButton variant="primary" aria-expanded={creationOpen} aria-controls="module-create-panel" onClick={() => setCreationOpen(open => !open)}>
          {creationOpen ? "Fermer" : "Créer un module"}
        </ModuleButton>
      </div>
      {creationOpen && <section id="module-create-panel" className="module-create-panel">
        <h3>Ajouter un module</h3>
        <form className="module-create-fields" onSubmit={event => { event.preventDefault(); handleAddCat(); }}>
          <input aria-label="Nom du nouveau module" value={newCat.name} onChange={e => setNewCat(c => ({ ...c, name: e.target.value }))} placeholder="Nom du module" autoFocus />
          <ModuleButton variant="primary" type="submit" disabled={!newCat.name.trim()}>Créer</ModuleButton>
        </form>
        <h3>Fusionner des modules</h3>
        <div className="module-merge-fields">
          <select aria-label="Module à fusionner" value={catsMergeSource} onChange={e => setCatsMergeSource(e.target.value)}>
            <option value="">Module à fusionner</option>
            {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <select aria-label="Module à conserver" value={catsMergeTarget} onChange={e => setCatsMergeTarget(e.target.value)}>
            <option value="">Module à conserver</option>
            {categories.filter(c => c.name !== catsMergeSource).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <ModuleButton onClick={mergeModules} disabled={!catsMergeSource || !catsMergeTarget || catsMergeSource === catsMergeTarget}>Fusionner</ModuleButton>
        </div>
      </section>}

      {/* Vue cartes */}
      {catsViewMode === "cards" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 20 }}>
          {filteredCategories.length === 0 ? (
            <div style={{
              gridColumn: "1 / -1",
              padding: "40px 20px",
              textAlign: "center",
              background: theme?.cardBg,
              borderRadius: 20,
              border: `1px dashed ${theme?.border || "#ccc"}`,
              color: theme?.textMuted
            }}>
              <span style={{ fontSize: 36, display: "block", marginBottom: 10 }}>🔍</span>
              <p style={{ fontWeight: 800, fontSize: 16, margin: "0 0 8px", color: theme?.text }}>
                {moduleSearch ? `Aucun module ne correspond à « ${moduleSearch} »` : "Aucun module configuré"}
              </p>
              {moduleSearch && (
                <button
                  type="button"
                  onClick={() => setModuleSearch("")}
                  style={{
                    marginTop: 8,
                    padding: "7px 16px",
                    background: "var(--mm-primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Effacer la recherche
                </button>
              )}
            </div>
          ) : (
            filteredCategories.map(cat => {
            const isFav = catsFavorites.includes(cat.name);
            const catExps = expressions.filter(e => e.category === cat.name);
            const selection = getModuleCards(expressions, cat.name, isDue, today());
            const dueCount = selection.due.length;
            const mastered = catExps.filter(e => (e.level || 0) >= 7).length;
            const pausedCount = catExps.filter(e => e.paused).length;
            const newUnpausedCount = catExps.filter(e => !e.paused && (e.level || 0) === 0).length;
            const pct = catExps.length ? Math.round((catExps.reduce((s, e) => s + Math.min(7, e.level || 0), 0) / (catExps.length * 7)) * 100) : 0;
            const catColor = cat.color || "var(--mm-primary)";
            return (
              <div key={cat.name} style={{
                background: theme?.cardBg, borderRadius: 22, padding: "22px", border: `1px solid ${theme?.border}`,
                borderTop: `4px solid ${catColor}`, boxShadow: isFav ? "0 0 15px color-mix(in srgb, var(--mm-primary) 30.0%, transparent)" : "0 2px 8px color-mix(in srgb, var(--mm-primary) 5.0%, transparent)"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontWeight: 900, fontSize: 18, color: theme?.text }}>{cat.name}</span>
                  <ModuleButton aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"} title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={() => toggleFavorite(cat.name)}>{isFav ? "★" : "☆"}</ModuleButton>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 8, background: theme?.inputBg, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: pct >= 80 ? "var(--mm-primary)" : catColor }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: catColor, minWidth: 40 }}>{pct}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: theme?.textMuted, flexWrap: "wrap", gap: 4 }}>
                  <span>{catExps.length} fiches</span>
                  <span>{mastered} maîtrisées</span>
                  <span style={{ color: dueCount > 0 ? "var(--mm-danger)" : theme?.textMuted }}>{dueCount} en retard</span>
                  {pausedCount > 0 && <span style={{ color: "var(--mm-warning)" }}>⏸ {pausedCount} en pause</span>}
                </div>
                <div className="module-actions">
                  <ModuleButton variant="primary" disabled={dueCount === 0} onClick={() => startReview?.(cat.name, "module", selection.due)}>
                    Réviser les fiches à revoir ({dueCount})
                  </ModuleButton>
                  <ModuleButton onClick={() => { setFilterCat?.(cat.name); setFilterLevel?.("Tous"); setSearchQuery?.(""); setSelectionMode?.(false); setSelectedCards?.([]); setView?.("list"); }}>Voir les fiches ({catExps.length})</ModuleButton>
                  <details className="module-menu">
                    <summary>Autres actions</summary>
                    <div className="module-menu-list">
                      <ModuleButton disabled={!selection.active.length} onClick={() => startReview?.(cat.name, "module", selection.active)}>Réviser toutes les fiches actives ({selection.active.length})</ModuleButton>
                      <ModuleButton disabled={!selection.active.length} onClick={() => startReview?.(cat.name, "free", selection.active)} style={{ borderLeft: "3px solid #10B981" }}>
                        🎮 Entraînement libre ({selection.active.length}) — sans impact SRS
                      </ModuleButton>
                      <ModuleButton disabled={newUnpausedCount === 0} onClick={() => handlePauseNewCards(cat.name)}>Mettre les nouvelles fiches en pause ({newUnpausedCount})</ModuleButton>
                      {pausedCount > 0 && <>
                        <ModuleButton onClick={() => handleReviewPausedCards(cat.name)}>Étudier les fiches en pause ({pausedCount})</ModuleButton>
                        <ModuleButton onClick={() => handleReleaseAllPaused(cat.name)}>Reprendre toutes les fiches en pause</ModuleButton>
                        <ModuleButton onClick={() => { setPauseManagerModule?.(cat.name); setPauseManagerSelected?.(new Set()); setFilterCat?.(cat.name); setFilterLevel?.("En pause"); setSearchQuery?.(""); setSelectionMode?.(true); setSelectedCards?.([]); setView?.("list"); }}>Choisir les fiches à reprendre</ModuleButton>
                      </>}
                      <ModuleButton onClick={() => handleExportModule(cat.name)}>Exporter les fiches</ModuleButton>
                      <ModuleButton variant="danger" onClick={() => handleDeleteCat(cat.name)}>Supprimer le module</ModuleButton>
                    </div>
                  </details>
                </div>

                {/* Courbe mini */}
                {catsLearningCurve[cat.name] && (
                  <div style={{ marginTop: 12, display: "flex", alignItems: "flex-end", gap: 2, height: 40 }}>
                    {catsLearningCurve[cat.name].map((point, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "100%", background: "var(--mm-primary)", borderRadius: "2px 2px 0 0", height: `${point.avgLevel * 8}px` }} />
                        <span style={{ fontSize: 8, marginTop: 2, color: theme?.textMuted }}>{point.week.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      )}

      {/* Vue tableau */}
      {catsViewMode === "table" && (
        <div style={{ background: theme?.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme?.border}`, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme?.border}`, color: theme?.textMuted, fontWeight: 700 }}>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Module</th>
                <th>Fiches</th>
                <th>Maîtrise</th>
                <th>Difficulté moy.</th>
                <th>En retard</th>
                <th>Dernière révision</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => {
                const s = catsStats[cat.name] || {};
                return (
                  <tr key={cat.name} style={{ borderBottom: `1px solid ${theme?.border}` }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: theme?.text }}>{cat.name}</td>
                    <td style={{ textAlign: "center" }}>{s.total || 0}</td>
                    <td style={{ textAlign: "center" }}>{s.pct || 0}%</td>
                    <td style={{ textAlign: "center" }}>{s.avgDiff || "-"}</td>
                    <td style={{ textAlign: "center", color: (s.due || 0) > 0 ? "var(--mm-danger)" : theme?.text }}>{s.due || 0}</td>
                    <td style={{ textAlign: "center" }}>{s.lastReview || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Vue chronologie : charge de révision des 14 prochains jours par module */}
      {catsViewMode === "timeline" && (
        <div style={{ background: theme?.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme?.border}`, overflowX: "auto" }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: theme?.text, marginBottom: 4 }}>Chronologie des révisions — 14 prochains jours</h3>
          <p style={{ color: theme?.textMuted, fontSize: 12, marginBottom: 18 }}>Repérez les pics de charge et rééquilibrez vos modules avant la surcharge.</p>
          {(() => {
            const start = today();
            const days = Array.from({ length: 14 }, (_, i) => {
              const d = new Date(`${start}T00:00:00`);
              d.setDate(d.getDate() + i);
              return d.toISOString().slice(0, 10);
            });
            const rows = categories.map((cat) => {
              const catCards = expressions.filter((e) => e.category === cat.name && !e.paused);
              const counts = days.map((day, i) => {
                if (i === 0) return catCards.filter((e) => isDue(e.nextReview, start)).length;
                return catCards.filter((e) => (e.nextReview || "") === day).length;
              });
              return { name: cat.name, color: cat.color || theme?.highlight || "var(--mm-primary)", counts, total: counts.reduce((a, b) => a + b, 0) };
            });
            const peak = Math.max(1, ...rows.flatMap((r) => r.counts));
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 640 }}>
                <div style={{ display: "grid", gridTemplateColumns: `160px repeat(14, 1fr)`, gap: 4, fontSize: 9, color: theme?.textMuted }}>
                  <span />
                  {days.map((day) => (
                    <span key={day} style={{ textAlign: "center" }}>{day.slice(5)}</span>
                  ))}
                </div>
                {rows.map((row) => (
                  <div key={row.name} style={{ display: "grid", gridTemplateColumns: `160px repeat(14, 1fr)`, gap: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme?.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name} <span style={{ color: theme?.textMuted, fontWeight: 500 }}>({row.total})</span>
                    </span>
                    {row.counts.map((n, i) => (
                      <div
                        key={i}
                        title={`${row.name} — ${days[i]} : ${n} fiche(s)`}
                        style={{
                          height: 22,
                          borderRadius: 6,
                          background: n > 0 ? row.color : `${theme?.border || "#ccc"}55`,
                          opacity: n > 0 ? 0.35 + 0.65 * (n / peak) : 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          fontWeight: 800,
                          color: n > 0 ? "#fff" : "transparent",
                        }}
                      >
                        {n > 0 ? n : ""}
                      </div>
                    ))}
                  </div>
                ))}
                {rows.length === 0 && <p style={{ color: theme?.textMuted, fontSize: 13 }}>Aucun module à planifier pour l'instant.</p>}
              </div>
            );
          })()}
        </div>
      )}

      {/* ══ GOD LEVEL : PREP-MODE CERTIFICATIONS ══ */}
      {catsViewMode === "prep" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24, animation: "fadeUp 0.4s ease" }}>
          {categories.map(cat => {
            const catExps = expressions.filter(e => e.category === cat.name);
            const mastered = catExps.filter(e => (e.level || 0) >= 7).length;
            const fsrsScore = catExps.length > 0 ? Math.round((mastered / catExps.length) * 100) : 0;

            const dueCount = catExps.filter(e => isDue(e.nextReview, today()) && !e.paused).length;
            const retention = catExps.length > 0 ? Math.max(0, 100 - Math.round((dueCount / catExps.length) * 100)) : 0;

            const readiness = Math.round((fsrsScore * 0.6) + (retention * 0.4));
            const isReady = readiness >= 95;

            return (
              <HoloCard key={cat.name} theme={theme} glowColor={isReady ? "var(--mm-success)" : "var(--mm-primary)"} style={{ background: theme?.cardBg, borderRadius: 24, padding: "28px", border: `2px solid ${isReady ? "#10B98150" : theme?.border}`, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: isReady ? "var(--mm-success)" : theme?.highlight, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>PREP-MODE CERTIFICATION</div>
                <h3 style={{ margin: "0 0 16px", color: theme?.text, fontSize: 20, fontWeight: 900 }}>{cat.name}</h3>

                <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
                  <div style={{ position: "relative", width: 160, height: 160 }}>
                    <svg viewBox="0 0 36 36" style={{ width: 160, height: 160, transform: "rotate(-90deg)" }}>
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke={theme?.inputBg} strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke={isReady ? "var(--mm-success)" : "var(--mm-primary)"} strokeWidth="4" strokeDasharray={`${readiness} 100`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1.5s cubic-bezier(0.16, 1, 0.3, 1)", filter: isReady ? "drop-shadow(0 0 12px rgba(16,185,129,0.5))" : "drop-shadow(0 0 12px color-mix(in srgb, var(--mm-primary) 30.0%, transparent))" }} />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 36, fontWeight: 900, color: isReady ? "var(--mm-success)" : theme?.text, lineHeight: 1 }}>{readiness}%</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: theme?.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>Readiness</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                  <div style={{ flex: 1, background: theme?.inputBg, borderRadius: 12, padding: "12px", border: `1px solid ${theme?.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: theme?.text }}>{fsrsScore}%</div>
                    <div style={{ fontSize: 10, color: theme?.textMuted, fontWeight: 700, marginTop: 2 }}>Maîtrise FSRS</div>
                  </div>
                  <div style={{ flex: 1, background: theme?.inputBg, borderRadius: 12, padding: "12px", border: `1px solid ${theme?.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: theme?.text }}>{retention}%</div>
                    <div style={{ fontSize: 10, color: theme?.textMuted, fontWeight: 700, marginTop: 2 }}>Rétention</div>
                  </div>
                </div>

                {isReady ? (
                  <div style={{ marginTop: "auto", textAlign: "center", animation: "fadeUp 0.5s ease" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--mm-success)", marginBottom: 12 }}>🎉 Module maîtrisé — prêt pour la certification !</div>
                    <button onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(cat.name + " certification officielle inscription")}`, "_blank")} className="btn-glow hov" style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #10B981, #059669)", color: "white", border: "none", borderRadius: 14, fontWeight: 900, fontSize: 14, cursor: "pointer", boxShadow: "0 8px 20px rgba(16,185,129,0.4)" }}>
                      Voir la certification ↗
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                    <button onClick={() => { startReview?.(cat.name, "module"); }} className="hov" style={{ padding: "12px", background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                      🎯 Réviser ce module (SRS)
                    </button>
                    <button onClick={() => { startReview?.(cat.name, "free"); }} className="hov" style={{ padding: "12px", background: "transparent", border: `1px solid ${theme?.border || "#CBD5E1"}`, color: theme?.text, borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                      🎮 Entraînement libre (sans impact SRS)
                    </button>
                    <button onClick={async () => {
                      setPrepLoading(p => ({ ...p, [cat.name]: true }));
                      try {
                        const raw = await callClaude?.(
                          "Tu es un expert en certifications informatiques. Génère les concepts clés du syllabus officiel pour cette certification.",
                          `Syllabus pour "${cat.name}"\nJSON: {"conceptsCles":["concept 1","concept 2"]}`
                        );
                        const parsed = safeParseJSON(raw);
                        if (parsed?.conceptsCles) {
                          parsed.conceptsCles.forEach(c => setAddBatchQueue?.(prev => [...prev, `${cat.name}: ${c}`]));
                          showToast?.(`➕ ${parsed.conceptsCles.length} concepts ajoutés à la file d'attente (Batch) !`, "success");
                          navigate?.("add/batch");
                        }
                      } catch (e) {
                        showToast?.("Erreur d'import du syllabus.", "error");
                      }
                      setPrepLoading(p => ({ ...p, [cat.name]: false }));
                    }} disabled={prepLoading[cat.name]} className="hov" style={{ padding: "12px", background: "transparent", color: theme?.highlight || "var(--mm-primary)", border: `1px solid ${theme?.border}`, borderRadius: 12, fontWeight: 800, cursor: prepLoading[cat.name] ? "not-allowed" : "pointer", fontSize: 13, opacity: prepLoading[cat.name] ? 0.5 : 1 }}>
                      {prepLoading[cat.name] ? "⏳ Importation..." : "📥 Importer syllabus (IA)"}
                    </button>
                  </div>
                )}
              </HoloCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
