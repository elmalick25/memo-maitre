// 📱 MobileHomeV2.jsx — Home mobile repensée
// Une page = une action dominante. Hero compact + CTA unique + 3 tuiles
// + quêtes simplifiées + 4 raccourcis. Tout le reste vit dans ses propres écrans.
//
// Props :
//   userName, level, xp, xpToNext, streak, energy
//   dueCount       : nombre de fiches à réviser maintenant
//   estMinutes     : durée estimée de session
//   onStartSession : () => void  -> démarre la révision
//   onExploreLab   : () => void  -> ouvre le Lab si rien à réviser
//   stats          : { forme, mastery, nextExamDays }
//   onOpenStats    : (which) => void
//   quests         : [{id, label, done}]
//   questsProgress : { done, total }
//   onOpenQuests   : () => void
//   shortcuts      : [{id, icon, label, sub, onClick}]
//
// Aucune dépendance externe au design system existant (utilise mobile-redesign.css).

import { useMemo, useState } from "react";

export default function MobileHomeV2({
  userName = "Mémorisateur",
  level = 1,
  xp = 0,
  xpToNext = 100,
  streak = 0,
  energy = 100,
  dueCount = 0,
  estMinutes = 0,
  dueModules = [],
  onStartSession,
  onExploreLab,
  stats = { forme: 0, mastery: 0, nextExamDays: null },
  onOpenStats,
  quests = [],
  questsProgress = { done: 0, total: 0 },
  onOpenQuests,
  shortcuts,
  children,
}) {
  const [isSelectingModule, setIsSelectingModule] = useState(false);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Bonne nuit";
    if (h < 12) return "Bon matin";
    if (h < 18) return "Bon après-midi";
    return "Bonsoir";
  }, []);

  const xpPct = Math.max(0, Math.min(100, Math.round((xp / Math.max(1, xpToNext)) * 100)));
  const questPct = questsProgress.total > 0
    ? Math.round((questsProgress.done / questsProgress.total) * 100)
    : 0;

  const hasDue = dueCount > 0;

  const defaultShortcuts = [
    { id: "plan", icon: "🎯", label: "Plan IA", sub: "Recommandé du jour" },
    { id: "report", icon: "📊", label: "Rapport", sub: "Cette semaine" },
    { id: "graph", icon: "🌌", label: "Constellation", sub: "Carte des savoirs" },
    { id: "act", icon: "🔥", label: "Activité", sub: "Heatmap année" },
  ];
  const finalShortcuts = shortcuts && shortcuts.length ? shortcuts : defaultShortcuts;

  if (isSelectingModule) {
    return (
      <div className="mhv2" style={{ paddingTop: 24, paddingBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <button 
            onClick={() => setIsSelectingModule(false)} 
            style={{ 
              background: "var(--mm-bg-card, #fff)", border: "1px solid var(--border)", 
              borderRadius: "50%", width: 44, height: 44, display: "flex", alignItems: "center", 
              justifyContent: "center", color: "var(--text)", cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text)" }}>Que réviser ?</h2>
        </div>

        <button
          type="button"
          onClick={() => onStartSession(null)}
          style={{ 
            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
            padding: "24px", borderRadius: 24, border: "none", color: "white",
            display: "flex", alignItems: "center", gap: 20, cursor: "pointer",
            boxShadow: "0 12px 32px rgba(124,58,237,0.35)", width: "100%", marginBottom: 24,
            textAlign: "left"
          }}
        >
          <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 16, width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
            🔀
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", flex: 1 }}>
            <span style={{ fontSize: 19, fontWeight: 900, marginBottom: 4 }}>Tout mélanger</span>
            <span style={{ fontSize: 14, opacity: 0.9, fontWeight: 600 }}>{dueCount} fiche{dueCount > 1 ? "s" : ""} au total</span>
          </div>
        </button>

        <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 16, marginLeft: 4 }}>Modules en retard</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {dueModules.map(mod => (
            <button
              key={mod.name}
              type="button"
              onClick={() => onStartSession(mod.name)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between",
                padding: "16px", background: "var(--bg)", borderRadius: 20,
                border: "1px solid var(--border)", color: "var(--text)", cursor: "pointer", textAlign: "left",
                minHeight: "110px", boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                transition: "transform 0.2s"
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3, marginBottom: 16, wordBreak: "break-word" }}>{mod.name}</div>
              <div style={{ background: "rgba(77, 107, 254, 0.1)", color: "#4D6BFE", padding: "6px 12px", borderRadius: 12, fontSize: 13, fontWeight: 800 }}>
                {mod.count} fiche{mod.count > 1 ? "s" : ""}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mhv2">
      {/* ── HERO compact ── */}
      <div className="mhv2-hero" role="banner">
        <p className="mhv2-hero-greet">{greeting} · Niveau {level}</p>
        <h1 className="mhv2-hero-name">{userName}</h1>
        <div className="mhv2-hero-stats">
          <span className="mhv2-hero-stat" title={`${xp} / ${xpToNext} XP`}>
            <strong>{xp}</strong> XP
          </span>
          <span className="mhv2-hero-stat" title={`Série de ${streak} jours`}>
            🔥 <strong>{streak}</strong>j
          </span>
          <span className="mhv2-hero-stat" title={`Énergie ${energy}%`}>
            ⚡ <strong>{energy}</strong>%
          </span>
        </div>
        {/* mini barre XP intégrée */}
        <div
          aria-label={`Progression XP ${xpPct}%`}
          style={{
            marginTop: 12, height: 4, background: "rgba(255,255,255,0.2)",
            borderRadius: 2, overflow: "hidden", position: "relative"
          }}
        >
          <div style={{
            width: `${xpPct}%`, height: "100%", background: "#fff",
            transition: "width .3s"
          }} />
        </div>
      </div>

      {/* ── CTA UNIQUE — Le seul élément dominant ── */}
      <button
        type="button"
        className="mhv2-cta"
        onClick={() => {
          if (hasDue) {
            if (dueModules.length > 1) {
              setIsSelectingModule(true);
            } else {
              onStartSession(null);
            }
          } else {
            onExploreLab();
          }
        }}
      >
        <span className="mhv2-cta-icon">
          {hasDue ? "▶" : "🧪"}
          <span className="mhv2-cta-title">
            {hasDue ? "Réviser maintenant" : "Explorer le Lab"}
          </span>
        </span>
        <span className="mhv2-cta-sub">
          {hasDue
            ? `${dueCount} fiche${dueCount > 1 ? "s" : ""} · ~${estMinutes || Math.max(1, Math.ceil(dueCount * 0.5))} min`
            : "Rien à réviser pour l'instant — explore une nouvelle session"}
        </span>
      </button>

      {/* ── 3 tuiles compactes ── */}
      <div className="mhv2-tiles">
        <button type="button" className="mhv2-tile" onClick={() => onOpenStats?.("forme")}>
          <div className="mhv2-tile-value">{stats.forme ?? 0}<span style={{ fontSize: "0.8rem" }}>%</span></div>
          <div className="mhv2-tile-label">Forme</div>
        </button>
        <button type="button" className="mhv2-tile" onClick={() => onOpenStats?.("mastery")}>
          <div className="mhv2-tile-value">{stats.mastery ?? 0}<span style={{ fontSize: "0.8rem" }}>%</span></div>
          <div className="mhv2-tile-label">Maîtrise</div>
        </button>
        <button type="button" className="mhv2-tile" onClick={() => window.dispatchEvent(new CustomEvent('open_beta_chat'))}>
          <div className="mhv2-tile-value" style={{ marginTop: '0.1rem', marginBottom: '4px' }}>💬</div>
          <div className="mhv2-tile-label">Discussion</div>
        </button>
      </div>

      {/* ── Quêtes simplifiées ── */}
      {(quests.length > 0 || questsProgress.total > 0) && (
        <>
          <div className="mhv2-section-title">Quêtes de la semaine</div>
          <div className="mhv2-quests" onClick={onOpenQuests} role="button" tabIndex={0}>
            <div className="mhv2-quests-head">
              <span className="mhv2-quests-title">
                {questsProgress.done}/{questsProgress.total} complétée{questsProgress.done > 1 ? "s" : ""}
              </span>
              <span className="mhv2-quests-count">{questPct}%</span>
            </div>
            <div className="mhv2-quest-bar">
              <div className="mhv2-quest-bar-fill" style={{ width: `${questPct}%` }} />
            </div>
            {quests.slice(0, 3).map(q => (
              <div key={q.id} className={`mhv2-quest ${q.done ? "done" : ""}`}>
                <span className={`mhv2-quest-check ${q.done ? "done" : "todo"}`}>
                  {q.done ? "✓" : "○"}
                </span>
                <span className="mhv2-quest-label">{q.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Raccourcis ── */}
      <div className="mhv2-section-title">Raccourcis</div>
      <div className="mhv2-shortcuts">
        {finalShortcuts.map(s => (
          <button
            key={s.id}
            type="button"
            className="mhv2-shortcut"
            onClick={s.onClick}
          >
            <span className="mhv2-shortcut-icon">{s.icon}</span>
            <span className="mhv2-shortcut-text">
              <span className="mhv2-shortcut-label">{s.label}</span>
              {s.sub && <span className="mhv2-shortcut-sub">{s.sub}</span>}
            </span>
          </button>
        ))}
      </div>

      {/* ── Contenu additionnel (ex: DailyRoutineTracker) ── */}
      {children}
    </div>
  );
}

