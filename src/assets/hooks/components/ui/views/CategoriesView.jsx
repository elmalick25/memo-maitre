// src/components/views/CategoriesView.jsx
import { useState } from "react";

export function CategoriesView({ categories, expressions, onAddCategory, onDeleteCategory, theme }) {
  const [newCat, setNewCat] = useState({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#4F8EF7" });

  const handleAdd = () => {
    if (!newCat.name.trim()) return;
    onAddCategory({ ...newCat });
    setNewCat({ name: "", examDate: "", targetScore: 80, priority: "normale", color: "#4F8EF7" });
  };

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight, marginBottom: 32 }}>◉ Gestion des Modules</h1>
      <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 24, padding: "32px", marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: theme.text, marginBottom: 20 }}>Créer un nouveau module</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, display: "block", marginBottom: 8 }}>Nom du module</label>
            <input
              value={newCat.name}
              onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))}
              style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }}
              placeholder="Ex: Algorithmique..."
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, display: "block", marginBottom: 8 }}>Couleur</label>
            <input type="color" value={newCat.color} onChange={(e) => setNewCat((c) => ({ ...c, color: e.target.value }))}
              style={{ width: "100%", height: 50, padding: 4, background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, cursor: "pointer" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, display: "block", marginBottom: 8 }}>Date d'examen (Optionnel)</label>
            <input type="date" value={newCat.examDate} onChange={(e) => setNewCat((c) => ({ ...c, examDate: e.target.value }))}
              style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, display: "block", marginBottom: 8 }}>Objectif (%)</label>
            <input type="number" min={50} max={100} value={newCat.targetScore}
              onChange={(e) => setNewCat((c) => ({ ...c, targetScore: +e.target.value }))}
              style={{ width: "100%", padding: "14px", background: theme.inputBg, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.text }} />
          </div>
        </div>
        <button onClick={handleAdd} className="hov btn-glow" disabled={!newCat.name.trim()}
          style={{ width: "100%", padding: "16px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, marginTop: 16, cursor: "pointer" }}>
          Créer le module
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
        {categories.map((cat) => (
          <div key={cat.name} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 22, padding: "26px", borderTop: `3px solid ${cat.color || "#3B82F6"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 900, color: theme.text, fontSize: 18 }}>{cat.name}</span>
              <button onClick={() => { if (window.confirm(`Supprimer "${cat.name}" ?`)) onDeleteCategory(cat.name); }}
                style={{ background: "#FEF2F2", border: "none", padding: "6px 10px", borderRadius: 8, color: "#EF4444", cursor: "pointer" }}>🗑️</button>
            </div>
            <div style={{ color: theme.textMuted, fontSize: 13 }}>
              {expressions.filter((e) => e.category === cat.name).length} fiches
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}