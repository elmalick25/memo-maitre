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
          onClick={() => onStartSession?.(null)}
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
        {dueModules.length === 0 ? (
          <p style={{ color: "var(--muted, #64748b)", fontSize: 14, marginLeft: 4 }}>
            Aucun module en retard pour l'instant.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            {dueModules.map(mod => (
              <button
                key={mod.name}
                type="button"
                onClick={() => onStartSession?.(mod.name)}
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
        )}
      </div>
    );
  }

  return (
    <div className="mhv2">
      {/* ── HERO — Redesign "wow effect" (aurora + glass + ring) ── */}
      <div className="mhv2-hero" role="banner">
        <div className="mhv2-hero-aurora" aria-hidden="true" />
        <div className="mhv2-hero-noise" aria-hidden="true" />
        <div className="mhv2-hero-shine" aria-hidden="true" />

        <div className="mhv2-hero-row">
          <div className="mhv2-hero-avatar" aria-hidden="true">
            <svg className="mhv2-hero-ring" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="mhv2RingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="50%" stopColor="#f472b6" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="44" className="mhv2-ring-track" />
              <circle
                cx="50" cy="50" r="44" className="mhv2-ring-fill"
                strokeDasharray={2 * Math.PI * 44}
                strokeDashoffset={2 * Math.PI * 44 * (1 - xpPct / 100)}
              />
            </svg>
            <div className="mhv2-hero-avatar-face">
              <span className="mhv2-hero-avatar-init">{(userName || "?").trim().charAt(0).toUpperCase()}</span>
              <span className="mhv2-hero-avatar-level">Nv&nbsp;{level}</span>
            </div>
          </div>

          <div className="mhv2-hero-head">
            <span className="mhv2-hero-greet">{greeting} · Niveau {level}</span>
            <h1 className="mhv2-hero-name">{userName}</h1>
            <span className="mhv2-hero-sub">
              {xpPct}% vers <strong>Niv&nbsp;{level + 1}</strong>
            </span>
          </div>
        </div>

        <div className="mhv2-hero-xpbar" aria-label={`Progression XP ${xpPct}%`}>
          <div className="mhv2-hero-xpbar-fill" style={{ width: `${xpPct}%` }} />
          <span className="mhv2-hero-xpbar-label">{xp}<em>/{xpToNext} XP</em></span>
        </div>

        <div className="mhv2-hero-stats">
          <div className="mhv2-hero-stat" title={`Série de ${streak} jours`}>
            <span className="mhv2-hero-stat-ico" data-tone="fire">🔥</span>
            <span className="mhv2-hero-stat-body">
              <strong>{streak}</strong>
              <em>Jour{streak > 1 ? "s" : ""}</em>
            </span>
          </div>
          <div className="mhv2-hero-stat" title={`Énergie ${energy}%`}>
            <span className="mhv2-hero-stat-ico" data-tone="volt">⚡</span>
            <span className="mhv2-hero-stat-body">
              <strong>{energy}</strong>
              <em>Énergie</em>
            </span>
          </div>
          <div className="mhv2-hero-stat" title={`${xp} XP`}>
            <span className="mhv2-hero-stat-ico" data-tone="star">✨</span>
            <span className="mhv2-hero-stat-body">
              <strong>{xp}</strong>
              <em>XP total</em>
            </span>
          </div>
        </div>
      </div>

      {/* ── CTA UNIQUE — Le seul élément dominant ── */}
      <button
        type="button"
        className="mhv2-cta"
        disabled={!hasDue && typeof onExploreLab !== "function"}
        onClick={() => {
          if (hasDue) {
            if (dueModules.length > 1) {
              setIsSelectingModule(true);
            } else if (dueModules.length === 1) {
              onStartSession?.(dueModules[0].name);
            } else {
              onStartSession?.(null);
            }
          } else {
            onExploreLab?.();
          }
        }}
      >
        <span className="mhv2-cta-icon">
          {hasDue ? "▶" : "🧪"}
        </span>
        <span className="mhv2-cta-title">
          {hasDue ? "Réviser maintenant" : "Explorer le Lab"}
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

