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

import { useEffect, useMemo, useRef, useState } from "react";
import { computeNearMiss } from "../lib/nearMiss";
import { haptic } from "../lib/haptics";
import { today as todayStr } from "../utils/dateUtils";
import RoutineAlertCard from "./RoutineAlertCard";

// CHANTIER 19 — Rituel de réouverture : UNE fois par jour, pas à chaque
// navigation. Même logique de garde journalière que monthKey/refillFreezeTokens
// dans streakGuard.js : un flag daté en localStorage, rien de plus.
const RITUAL_KEY = "mm_home_ritual_day";

function shouldPlayRitual() {
  try {
    if (localStorage.getItem(RITUAL_KEY) === todayStr()) return false;
    localStorage.setItem(RITUAL_KEY, todayStr());
    return true;
  } catch { return false; }
}

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
  // ── CHANTIER 16 — icône de streak débloquée par le niveau (parité desktop) ──
  streakIcon = "🔥",
  // ── CHANTIER 18 — le near-miss dès l'accueil, pas seulement en fin de session ──
  nearMissInput = null,
  // ── CHANTIER 28 — l'alerte routine, identique à celle du desktop ──
  routine = null,
  onOpenRoutine,
}) {
  const [isSelectingModule, setIsSelectingModule] = useState(false);
  const [ritual, setRitual] = useState(false);
  const [hookIndex, setHookIndex] = useState(0);
  const ritualDone = useRef(false);

  // ── CHANTIER 18 — un SEUL near-miss affiché, le plus proche (hooks[0] est
  //    déjà trié par priorité/proximité), recalculé à chaque ouverture. ──
  const hooks = useMemo(
    () => (nearMissInput ? computeNearMiss(nearMissInput).slice(0, 3) : []),
    [nearMissInput],
  );
  const activeHook = hooks.length ? hooks[hookIndex % hooks.length] : null;

  // Rotation lente : on donne plusieurs raisons de revenir sans jamais noyer
  // le hero (une ligne à la fois).
  useEffect(() => {
    if (hooks.length < 2) return undefined;
    const id = setInterval(() => setHookIndex((i) => i + 1), 6000);
    return () => clearInterval(id);
  }, [hooks.length]);

  // ── CHANTIER 19 — le rituel : la flamme s'anime, un haptique discret, une
  //    seule fois dans la journée. Ouvrir l'app devient gratifiant en soi. ──
  useEffect(() => {
    if (ritualDone.current) return;
    ritualDone.current = true;
    if (streak > 0 && shouldPlayRitual()) {
      setRitual(true);
      haptic("ritual");
      const t = setTimeout(() => setRitual(false), 2200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [streak]);

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
    { id: "routine", icon: "🌟", label: "Routine", sub: "Du Jour", onClick: onOpenRoutine },
    { id: "quests", icon: "🎯", label: "Quêtes", sub: `${questsProgress.done}/${questsProgress.total || 3} faites`, onClick: onOpenQuests },
    { id: "report", icon: "📊", label: "Rapport", sub: "Cette semaine", onClick: () => onOpenStats?.("report") },
    { id: "list", icon: "🗂️", label: "Mes fiches", sub: "Toutes les cartes" },
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
            <span
              className={`mhv2-hero-stat-ico${ritual ? " mhv2-ritual" : ""}`}
              data-tone="fire"
            >{streakIcon}</span>
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

        {/* ── CHANTIER 18 — la raison de rentrer, AVANT même de commencer ── */}
        {activeHook && (
          <div className="mhv2-hero-hook" key={activeHook.id} aria-live="polite">
            <span className="mhv2-hero-hook-ico" aria-hidden="true">{activeHook.icon}</span>
            <span className="mhv2-hero-hook-text">{activeHook.text}</span>
          </div>
        )}
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
        <div className="mhv2-cta-content">
          <div className="mhv2-cta-badge">
            <span className="mhv2-cta-icon">{hasDue ? "▶" : "🧪"}</span>
          </div>
          <div className="mhv2-cta-body">
            <span className="mhv2-cta-title">
              {hasDue ? "Réviser maintenant" : "Explorer le Lab"}
            </span>
            <div className="mhv2-cta-meta">
              {hasDue ? (
                <>
                  <span className="mhv2-cta-pill mhv2-cta-pill-count">{dueCount} fiche{dueCount > 1 ? "s" : ""}</span>
                  <span className="mhv2-cta-pill mhv2-cta-pill-time">~{estMinutes || Math.max(1, Math.ceil(dueCount * 0.5))} min</span>
                </>
              ) : (
                <span className="mhv2-cta-sub">Explorer une nouvelle session</span>
              )}
            </div>
          </div>
          <div className="mhv2-cta-arrow" aria-hidden="true">
            ➜
          </div>
        </div>
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
        <button
          type="button"
          className="mhv2-tile mhv2-tile-chat"
          onClick={() => { haptic("tap"); window.dispatchEvent(new CustomEvent("open_beta_chat")); }}
        >
          <div className="mhv2-tile-value mhv2-tile-value-icon">💬</div>
          <div className="mhv2-tile-label">Discussion</div>
        </button>
        <button
          type="button"
          className="mhv2-tile mhv2-tile-agent"
          onClick={() => { haptic("tap"); window.dispatchEvent(new CustomEvent("open_agent_panel")); }}
        >
          <div className="mhv2-tile-value mhv2-tile-value-icon">🤖</div>
          <div className="mhv2-tile-label">Assistant IA</div>
        </button>

      </div>

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

