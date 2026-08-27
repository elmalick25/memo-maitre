import React, { useState, useMemo } from "react";
import HoloCard from "./HoloCard";
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
  setExamConfig,
  examHistory = [],
  today,
  isDue,
  pauseDripQuota,
  setPauseDripQuota,
}) {
  const [newCat, setNewCat] = useState({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#8B5CF6" });
  const [catsViewMode, setCatsViewMode] = useState("cards"); // cards | table | timeline | prep
  const [catsMergeSource, setCatsMergeSource] = useState("");
  const [catsMergeTarget, setCatsMergeTarget] = useState("");
  const [catsFavorites, setCatsFavorites] = useState([]);
  const [catsAlerts, setCatsAlerts] = useState([]);
  const [catsAiReport, setCatsAiReport] = useState(null);
  const [catsLearningCurve, setCatsLearningCurve] = useState({});
  const [prepLoading, setPrepLoading] = useState({});

  const moduleStatsList = useMemo(
    () => computeModuleComparison(categories, expressions),
    [categories, expressions]
  );

  const catsStats = useMemo(() => {
    const map = {};
    moduleStatsList.forEach(m => { map[m.name] = m; });
    return map;
  }, [moduleStatsList]);

  const catsTimelineData = useMemo(() => {
    return (categories || [])
      .filter(c => c && c.examDate)
      .map(c => ({
        date: c.examDate,
        label: `Examen ${c.name}`,
        module: c.name,
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [categories]);

  const handleAddCat = () => {
    const trimmed = newCat.name.trim();
    if (!trimmed || categories.find((c) => c.name === trimmed)) {
      showToast?.("Nom invalide ou existant.", "error");
      return;
    }
    setCategories?.((prev) => [...prev, { ...newCat, name: trimmed }]);
    setNewCat({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#8B5CF6" });
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
    setExpressions?.((prev) =>
      prev.map((e) => (e.category === catsMergeSource ? { ...e, category: catsMergeTarget } : e))
    );
    setCategories?.((prev) => prev.filter((c) => c.name !== catsMergeSource));
    showToast?.(`Module "${catsMergeSource}" fusionné dans "${catsMergeTarget}".`);
    setCatsMergeSource("");
    setCatsMergeTarget("");
  };

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: theme?.highlight || "#8B5CF6", marginBottom: 8 }}>◉ Gestion des Modules</h1>
          <p style={{ color: theme?.textMuted }}>Statistiques avancées, prérequis, planification et coaching par module.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          {["cards", "table", "timeline", "prep"].map((mode) => (
            <button
              key={mode}
              onClick={() => setCatsViewMode(mode)}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: `1px solid ${catsViewMode === mode ? theme?.highlight || "#8B5CF6" : theme?.border || "#ccc"}`,
                background: catsViewMode === mode ? (theme?.highlight || "#8B5CF6") : (theme?.cardBg || "transparent"),
                color: catsViewMode === mode ? "#fff" : theme?.text,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {mode === "cards" ? "Cartes" : mode === "table" ? "Tableau" : mode === "timeline" ? "Timeline" : "Certifications (Prep)"}
            </button>
          ))}
        </div>
      </div>

      {/* Dosage automatique des fiches en pause */}
      {setPauseDripQuota && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, background: "#8B5CF612", border: "1px solid #8B5CF640", borderRadius: 14, padding: "12px 16px", marginBottom: 20 }}>
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
              <span style={{ color: alert.type === "danger" ? "#EF4444" : "#8B5CF6" }}>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rapport IA */}
      {catsAiReport && (
        <div style={{ background: theme?.cardBg, borderRadius: 16, padding: 20, marginBottom: 20, border: "2px solid #8B5CF6" }}>
          <h3 style={{ margin: "0 0 8px", color: "#8B5CF6" }}>🧠 Plan d'action IA</h3>
          <p><strong>Module critique :</strong> {catsAiReport.criticalModule}</p>
          <ul>{catsAiReport.recommendations?.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <button onClick={() => setCatsAiReport(null)} style={{ background: "none", border: "none", color: theme?.textMuted, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Ajout de module (compact) */}
      <div style={{ background: theme?.cardBg, border: `1px solid ${theme?.border}`, borderRadius: 18, padding: "20px", marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", color: theme?.text, fontWeight: 800 }}>➕ Ajouter un module</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <input value={newCat.name} onChange={e => setNewCat(c => ({ ...c, name: e.target.value }))} style={{ padding: 10, background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 8, color: theme?.text }} placeholder="Nom" />
          <input type="color" value={newCat.color} onChange={e => setNewCat(c => ({ ...c, color: e.target.value }))} style={{ height: 42, padding: 4, background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 8 }} />
          <input type="date" value={newCat.examDate} onChange={e => setNewCat(c => ({ ...c, examDate: e.target.value }))} style={{ padding: 10, background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 8, color: theme?.text }} />
          <select value={newCat.priority} onChange={e => setNewCat(c => ({ ...c, priority: e.target.value }))} style={{ padding: 10, background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 8, color: theme?.text }}>
            <option value="haute">Haute</option>
            <option value="normale">Normale</option>
            <option value="basse">Basse</option>
          </select>
          <button onClick={handleAddCat} disabled={!newCat.name.trim()} style={{ padding: "10px 18px", background: "linear-gradient(135deg,#7C3AED,#8B5CF6)", color: "white", border: "none", borderRadius: 8, fontWeight: 800, cursor: !newCat.name.trim() ? "not-allowed" : "pointer" }}>Créer</button>
        </div>
      </div>

      {/* Fusion de modules */}
      <div style={{ background: theme?.cardBg, borderRadius: 16, padding: 16, marginBottom: 20, border: `1px solid ${theme?.border}` }}>
        <h4 style={{ margin: "0 0 8px", color: theme?.text }}>🔀 Fusionner des modules</h4>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select value={catsMergeSource || ""} onChange={e => setCatsMergeSource(e.target.value)} style={{ padding: 8, borderRadius: 8, border: `1px solid ${theme?.border}`, background: theme?.inputBg, color: theme?.text }}>
            <option value="">Source...</option>
            {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <span>→</span>
          <select value={catsMergeTarget || ""} onChange={e => setCatsMergeTarget(e.target.value)} style={{ padding: 8, borderRadius: 8, border: `1px solid ${theme?.border}`, background: theme?.inputBg, color: theme?.text }}>
            <option value="">Cible...</option>
            {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <button onClick={mergeModules} disabled={!catsMergeSource || !catsMergeTarget} style={{ padding: "8px 16px", background: "#A855F7", color: "white", border: "none", borderRadius: 8, fontWeight: 700, cursor: (!catsMergeSource || !catsMergeTarget) ? "not-allowed" : "pointer" }}>Fusionner</button>
        </div>
      </div>

      {/* Vue cartes */}
      {catsViewMode === "cards" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 20 }}>
          {categories.sort((a, b) => {
            if (catsFavorites.includes(a.name)) return -1;
            if (catsFavorites.includes(b.name)) return 1;
            return 0;
          }).map(cat => {
            const isFav = catsFavorites.includes(cat.name);
            const catExps = expressions.filter(e => e.category === cat.name);
            const dueCount = catExps.filter(e => isDue(e.nextReview, today()) && (e.level || 0) < 7 && !e.paused).length;
            const mastered = catExps.filter(e => (e.level || 0) >= 7).length;
            const pausedCount = catExps.filter(e => e.paused).length;
            const newUnpausedCount = catExps.filter(e => !e.paused && (e.level || 0) === 0).length;
            const pct = catExps.length ? Math.round((catExps.reduce((s, e) => s + Math.min(7, e.level || 0), 0) / (catExps.length * 7)) * 100) : 0;
            const daysToExam = cat.examDate ? Math.ceil((new Date(cat.examDate) - new Date()) / 86400000) : null;
            const catColor = cat.color || "#8B5CF6";
            return (
              <div key={cat.name} style={{
                background: theme?.cardBg, borderRadius: 22, padding: "22px", border: `1px solid ${theme?.border}`,
                borderTop: `4px solid ${catColor}`, boxShadow: isFav ? "0 0 15px rgba(139, 92, 246,0.3)" : "0 2px 8px rgba(139, 92, 246,0.05)"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontWeight: 900, fontSize: 18, color: theme?.text }}>{cat.name}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => toggleFavorite(cat.name)} style={{ background: "none", border: "none", color: isFav ? "#A855F7" : theme?.textMuted, cursor: "pointer", fontSize: 18 }}>{isFav ? "★" : "☆"}</button>
                    <button onClick={() => exportModule?.(cat.name)} style={{ background: "none", border: "none", color: theme?.textMuted, cursor: "pointer" }}>📥</button>
                    <button onClick={() => deleteCategory?.(cat.name)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer" }}>🗑️</button>
                  </div>
                </div>
                {cat.examDate && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: daysToExam <= 7 ? "#EF4444" : "#8B5CF6", marginBottom: 8 }}>
                    🗓️ Examen : {new Date(cat.examDate).toLocaleDateString("fr-FR")} {daysToExam !== null && `(J-${daysToExam})`}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 8, background: theme?.inputBg, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: pct >= 80 ? "#8B5CF6" : catColor }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: catColor, minWidth: 40 }}>{pct}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: theme?.textMuted, flexWrap: "wrap", gap: 4 }}>
                  <span>{catExps.length} fiches</span>
                  <span>{mastered} maîtrisées</span>
                  <span style={{ color: dueCount > 0 ? "#EF4444" : theme?.textMuted }}>{dueCount} en retard</span>
                  {pausedCount > 0 && <span style={{ color: "#F59E0B" }}>⏸ {pausedCount} en pause</span>}
                </div>
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <button onClick={() => { startReview?.(cat.name, "exam"); }} className="hov" title="Réviser pour examen (toutes les fiches du module)" style={{ padding: "3px 8px", fontSize: 11, background: "#8B5CF6", color: "white", border: "none", borderRadius: 6, fontWeight: 600 }}>🎯 Réviser</button>
                  {pausedCount === 0 ? (
                    <button
                      onClick={() => pauseNewCards?.(cat.name)}
                      disabled={newUnpausedCount === 0}
                      className="hov"
                      title="Met en pause les fiches pas encore apprises (level 0) pour ne pas les voir en retard"
                      style={{ padding: "3px 8px", fontSize: 11, background: newUnpausedCount === 0 ? theme?.inputBg : "#F59E0B", color: newUnpausedCount === 0 ? theme?.textMuted : "white", border: "none", borderRadius: 6, fontWeight: 600, cursor: newUnpausedCount === 0 ? "default" : "pointer" }}
                    >⏸ Pause nouvelles</button>
                  ) : (
                    <>
                      <button onClick={() => reviewPausedCards?.(cat.name)} className="hov" title="Étudier (sans notation) les fiches en pause, puis les envoyer en révision une fois apprises" style={{ padding: "3px 8px", fontSize: 11, background: "#8B5CF6", color: "white", border: "none", borderRadius: 6, fontWeight: 600 }}>📖 Apprendre en pause ({pausedCount})</button>
                      <button onClick={() => releaseAllPaused?.(cat.name)} className="hov" style={{ padding: "3px 8px", fontSize: 11, background: "#10B981", color: "white", border: "none", borderRadius: 6, fontWeight: 600 }}>🔓 Libérer ({pausedCount})</button>
                      <button
                        onClick={() => {
                          setPauseManagerModule?.(cat.name);
                          setPauseManagerSelected?.(new Set());
                          setFilterCat?.(cat.name);
                          setFilterLevel?.("En pause");
                          setSearchQuery?.("");
                          setSelectionMode?.(true);
                          setSelectedCards?.([]);
                          setView?.("list");
                        }}
                        className="hov"
                        title="Parcourir les fiches en pause et choisir celles à ajouter à la révision"
                        style={{ padding: "3px 8px", fontSize: 11, background: "none", color: theme?.textMuted, border: `1px solid ${theme?.border}`, borderRadius: 6, fontWeight: 600 }}
                      >Choisir...</button>
                    </>
                  )}
                  <button onClick={() => { if (window.confirm(`Supprimer toutes les fiches de "${cat.name}" ? Cette action est irréversible.`)) { setExpressions?.(prev => prev.filter(e => e.category !== cat.name)); showToast?.(`Toutes les fiches de "${cat.name}" supprimées.`); } }} className="hov" title="Supprimer toutes les fiches de ce module" style={{ padding: "3px 8px", fontSize: 11, background: "none", color: "#EF4444", border: `1px solid #EF444455`, borderRadius: 6, fontWeight: 600 }}>🗑️ Supprimer tout</button>
                </div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: theme?.textMuted }}>
                  <span>🗓️ Date d'examen :</span>
                  <input type="date" value={cat.examDate || ""} onChange={(e) => { const v = e.target.value; setCategories?.(prev => prev.map(c => c.name === cat.name ? { ...c, examDate: v } : c)); showToast?.(v ? `Examen planifié pour ${cat.name} — révision auto 3 jours avant` : "Date d'examen retirée"); }} style={{ padding: "4px 8px", background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 8, color: theme?.text, fontSize: 12 }} />
                </div>

                {/* Courbe mini */}
                {catsLearningCurve[cat.name] && (
                  <div style={{ marginTop: 12, display: "flex", alignItems: "flex-end", gap: 2, height: 40 }}>
                    {catsLearningCurve[cat.name].map((point, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "100%", background: "#8B5CF6", borderRadius: "2px 2px 0 0", height: `${point.avgLevel * 8}px` }} />
                        <span style={{ fontSize: 8, marginTop: 2, color: theme?.textMuted }}>{point.week.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
                <th>Examen</th>
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
                    <td style={{ textAlign: "center", color: (s.due || 0) > 0 ? "#EF4444" : theme?.text }}>{s.due || 0}</td>
                    <td style={{ textAlign: "center" }}>{s.lastReview || "-"}</td>
                    <td style={{ textAlign: "center" }}>{cat.examDate || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Vue timeline */}
      {catsViewMode === "timeline" && (
        <div style={{ background: theme?.cardBg, borderRadius: 22, padding: 24, border: `1px solid ${theme?.border}` }}>
          <h3 style={{ color: theme?.text, marginTop: 0 }}>📅 Timeline des examens</h3>
          {catsTimelineData.length === 0 ? <p style={{ color: theme?.textMuted }}>Aucun examen programmé.</p> :
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {catsTimelineData.map((event, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: theme?.inputBg, borderRadius: 12, borderLeft: `4px solid ${categories.find(c => c.name === event.module)?.color || "#8B5CF6"}` }}>
                  <div style={{ minWidth: 90, fontWeight: 800, color: theme?.highlight }}>{new Date(event.date).toLocaleDateString("fr-FR")}</div>
                  <div>{event.label}</div>
                </div>
              ))}
            </div>
          }
        </div>
      )}

      {/* ══ GOD LEVEL : PREP-MODE CERTIFICATIONS ══ */}
      {catsViewMode === "prep" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24, animation: "fadeUp 0.4s ease" }}>
          {categories.map(cat => {
            const catExps = expressions.filter(e => e.category === cat.name);
            const mastered = catExps.filter(e => (e.level || 0) >= 7).length;
            const fsrsScore = catExps.length > 0 ? Math.round((mastered / catExps.length) * 100) : 0;

            const catExams = examHistory.filter(h => h.category === cat.name);
            const recentExams = catExams.slice(0, 3);
            const mockScore = recentExams.length > 0 ? Math.round(recentExams.reduce((s, x) => s + x.score, 0) / recentExams.length) : 0;

            const readiness = Math.round((fsrsScore * 0.6) + (mockScore * 0.4));
            const isReady = readiness >= 95;

            return (
              <HoloCard key={cat.name} theme={theme} glowColor={isReady ? "#10B981" : "#8B5CF6"} style={{ background: theme?.cardBg, borderRadius: 24, padding: "28px", border: `2px solid ${isReady ? "#10B98150" : theme?.border}`, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: isReady ? "#10B981" : theme?.highlight, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>PREP-MODE CERTIFICATION</div>
                <h3 style={{ margin: "0 0 16px", color: theme?.text, fontSize: 20, fontWeight: 900 }}>{cat.name}</h3>

                <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
                  <div style={{ position: "relative", width: 160, height: 160 }}>
                    <svg viewBox="0 0 36 36" style={{ width: 160, height: 160, transform: "rotate(-90deg)" }}>
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke={theme?.inputBg} strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke={isReady ? "#10B981" : "#8B5CF6"} strokeWidth="4" strokeDasharray={`${readiness} 100`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1.5s cubic-bezier(0.16, 1, 0.3, 1)", filter: isReady ? "drop-shadow(0 0 12px rgba(16,185,129,0.5))" : "drop-shadow(0 0 12px rgba(139, 92, 246,0.3))" }} />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 36, fontWeight: 900, color: isReady ? "#10B981" : theme?.text, lineHeight: 1 }}>{readiness}%</span>
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
                    <div style={{ fontSize: 18, fontWeight: 900, color: theme?.text }}>{mockScore}%</div>
                    <div style={{ fontSize: 10, color: theme?.textMuted, fontWeight: 700, marginTop: 2 }}>Exams Blancs</div>
                  </div>
                </div>

                {isReady ? (
                  <div style={{ marginTop: "auto", textAlign: "center", animation: "fadeUp 0.5s ease" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#10B981", marginBottom: 12 }}>🎉 Tu es prêt à passer l'examen officiel !</div>
                    <button onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(cat.name + " certification official exam registration")}`, "_blank")} className="btn-glow hov" style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #10B981, #059669)", color: "white", border: "none", borderRadius: 14, fontWeight: 900, fontSize: 14, cursor: "pointer", boxShadow: "0 8px 20px rgba(16,185,129,0.4)" }}>
                      Passer l'examen ↗
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                    <button onClick={() => { setExamConfig?.(p => ({ ...p, category: cat.name, mode: "standard" })); setView?.("exam"); }} className="hov" style={{ padding: "12px", background: "linear-gradient(135deg, #8B5CF6, #7C3AED)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                      📝 Lancer un examen blanc
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
                    }} disabled={prepLoading[cat.name]} className="hov" style={{ padding: "12px", background: "transparent", color: theme?.highlight || "#8B5CF6", border: `1px solid ${theme?.border}`, borderRadius: 12, fontWeight: 800, cursor: prepLoading[cat.name] ? "not-allowed" : "pointer", fontSize: 13, opacity: prepLoading[cat.name] ? 0.5 : 1 }}>
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
