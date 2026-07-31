// src/components/BadgesView.jsx
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIERS 3 + 5 + 7 — Vue Badges refondue.
//   • Palette de rareté différenciée (gris → bleu → violet → or animé).
//   • Filtres catégorie / rareté / statut.
//   • Pagination par lots (pas de millier de nœuds DOM avec glow simultanés).
//   • Délai d'animation plafonné : Math.min(index, 30) × 0.04s.
//   • Vitrine des unlocks concrets liés au niveau.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useState, memo } from "react";
import { BADGES, BADGE_CATEGORIES, RARITY_STYLES, RARITY_ORDER } from "../constants/gamification";
import { UNLOCKS, getUnlocks, getNextUnlock } from "../lib/unlocks";

const PAGE_SIZE = 48;
const MAX_ANIM_INDEX = 30;

const BadgeCard = memo(function BadgeCard({ badge, index, isUnlocked, prog, theme, isDarkMode }) {
  const rar = RARITY_STYLES[badge.rarity] || RARITY_STYLES.commun;
  const pct = prog && prog.max ? Math.round((prog.cur / prog.max) * 100) : 0;
  return (
    <div
      style={{
        background: isUnlocked ? (isDarkMode ? rar.bgDark : rar.bgLight) : (isDarkMode ? "rgba(15,26,58,0.6)" : "var(--mm-bg-elev)"),
        border: `2px solid ${isUnlocked ? rar.color : theme.border}`,
        borderRadius: 20,
        padding: "20px 18px 18px",
        textAlign: "center",
        filter: isUnlocked ? "none" : "grayscale(75%)",
        position: "relative",
        boxShadow: isUnlocked ? rar.glow : "none",
        overflow: "hidden",
        animation: "fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        animationDelay: `${Math.min(index, MAX_ANIM_INDEX) * 0.04}s`,
        opacity: 0,
        contentVisibility: "auto",
        containIntrinsicSize: "200px 210px",
      }}
      className={isUnlocked ? "card-hov" : ""}
      title={`${badge.label} — ${badge.desc}`}
    >
      {isUnlocked && rar.animated && (
        <div style={{ position: "absolute", inset: 0, background: rar.gradient, backgroundSize: "300% 300%", opacity: 0.18, animation: "gradientShift 6s ease infinite", pointerEvents: "none" }} />
      )}
      <div style={{ position: "relative", zIndex: 1, opacity: isUnlocked ? 1 : 0.65 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: rar.color }}>
          <span>{rar.label}</span>
          <span style={{ opacity: 0.7, color: theme.textMuted }}>{badge.cat}</span>
        </div>
        <div style={{ fontSize: 42, margin: "14px 0 10px" }}>{badge.icon}</div>
        <div style={{ fontWeight: 800, color: theme.text, fontSize: 14, marginBottom: 4 }}>{badge.label}</div>
        <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>{badge.desc}</div>
        {!isUnlocked && prog && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: theme.textMuted, fontWeight: 700, marginBottom: 4 }}>
              <span>{prog.cur}</span><span>{prog.max}</span>
            </div>
            <div style={{ height: 5, background: theme.border, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: rar.color, borderRadius: 3 }} />
            </div>
          </div>
        )}
        {isUnlocked && <div style={{ marginTop: 10, fontSize: 11, fontWeight: 800, color: rar.color }}>✔ Débloqué</div>}
      </div>
    </div>
  );
});

const Chip = ({ active, onClick, children, accent, theme }) => (
  <button
    onClick={onClick}
    style={{
      padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer",
      background: active ? accent : "transparent",
      color: active ? "#fff" : theme.textMuted,
      border: `1.5px solid ${active ? accent : theme.border}`,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </button>
);

export default function BadgesView({
  badgeState,
  unlockedBadges = [],
  theme,
  isDarkMode,
  archetype,
}) {
  const [cat, setCat] = useState("Toutes");
  const [rarity, setRarity] = useState("toutes");
  const [status, setStatus] = useState("tous"); // tous | unlocked | locked
  const [limit, setLimit] = useState(PAGE_SIZE);
  const unlockedSet = useMemo(() => new Set(unlockedBadges), [unlockedBadges]);

  const decorated = useMemo(() => BADGES.map((b) => {
    const isUnlocked = unlockedSet.has(b.id);
    const prog = b.progress ? b.progress(badgeState) : null;
    const pct = prog && prog.max ? prog.cur / prog.max : 0;
    return { b, isUnlocked, prog, pct };
  }), [badgeState, unlockedSet]);

  const filtered = useMemo(() => {
    const list = decorated.filter(({ b, isUnlocked }) => {
      if (cat !== "Toutes" && b.cat !== cat) return false;
      if (rarity !== "toutes" && b.rarity !== rarity) return false;
      if (status === "unlocked" && !isUnlocked) return false;
      if (status === "locked" && isUnlocked) return false;
      return true;
    });
    return list.sort((x, y) => {
      if (x.isUnlocked !== y.isUnlocked) return x.isUnlocked ? -1 : 1;
      if (x.isUnlocked) {
        const ra = RARITY_ORDER[x.b.rarity] ?? 9, rb = RARITY_ORDER[y.b.rarity] ?? 9;
        if (ra !== rb) return ra - rb;
        return x.b.label.localeCompare(y.b.label);
      }
      if (y.pct !== x.pct) return y.pct - x.pct;
      return (RARITY_ORDER[x.b.rarity] ?? 9) - (RARITY_ORDER[y.b.rarity] ?? 9);
    });
  }, [decorated, cat, rarity, status]);

  const unlockedCount = decorated.filter(d => d.isUnlocked).length;
  const rarityCount = useMemo(() => {
    const acc = { legendaire: 0, epique: 0, rare: 0, commun: 0 };
    decorated.forEach(d => { if (d.isUnlocked) acc[d.b.rarity] = (acc[d.b.rarity] || 0) + 1; });
    return acc;
  }, [decorated]);

  const nextTarget = decorated.filter(d => !d.isUnlocked && d.prog).sort((a, b) => b.pct - a.pct)[0];
  const level = archetype?.level || 0;
  const myUnlocks = getUnlocks(level);
  const nextUnlock = getNextUnlock(level);

  const visible = filtered.slice(0, limit);

  return (
    <div style={{ animation: "fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 28, position: "relative", padding: "34px 28px", borderRadius: 28, overflow: "hidden", background: isDarkMode ? "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(2,6,23,0.96))" : "linear-gradient(135deg, #1E3A8A, #312E81)", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", background: "conic-gradient(from 0deg, transparent, rgba(245,158,11,0.12), transparent)", animation: "spin 24s linear infinite", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 18 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: "white", margin: 0, letterSpacing: "-1px" }}>✨ Hauts Faits</h1>
            <p style={{ color: "rgba(255,255,255,0.72)", marginTop: 6, fontSize: 15 }}>
              {unlockedCount} / {BADGES.length} badges · Niveau {level} {archetype?.icon} {archetype?.title}
            </p>
            {nextTarget && (
              <p style={{ color: "rgba(255,255,255,0.6)", marginTop: 4, fontSize: 13 }}>
                Prochain : <b style={{ color: "#FDE68A" }}>{nextTarget.b.label}</b> — {nextTarget.prog.cur}/{nextTarget.prog.max}
              </p>
            )}
          </div>
          <div style={{ fontSize: 44, filter: "drop-shadow(0 0 18px rgba(245,158,11,0.7))" }}>🏆</div>
        </div>
      </div>

      {/* ── Compteurs de rareté ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        {["legendaire", "epique", "rare", "commun"].map(r => {
          const st = RARITY_STYLES[r];
          return (
            <div key={r} style={{ background: isDarkMode ? st.bgDark : st.bgLight, border: `1.5px solid ${st.color}55`, borderRadius: 16, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: st.color, textTransform: "uppercase", letterSpacing: 0.6 }}>{st.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: theme.text }}>{rarityCount[r] || 0}</div>
            </div>
          );
        })}
      </div>

      {/* ── Unlocks concrets (chantier 5) ── */}
      <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 20, padding: 20, marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: theme.text }}>🎁 Récompenses débloquées</h3>
          {nextUnlock && (
            <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>
              Prochaine au niveau {nextUnlock.level} : {nextUnlock.icon} {nextUnlock.label}
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {UNLOCKS.map(u => {
            const owned = myUnlocks.some(x => x.id === u.id);
            return (
              <div key={u.id} title={u.desc} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
                fontSize: 12, fontWeight: 700,
                background: owned ? (u.type === "functional" ? "rgba(16,185,129,0.14)" : "rgba(59,130,246,0.14)") : "transparent",
                border: `1.5px solid ${owned ? (u.type === "functional" ? "#10B981" : "#3B82F6") : theme.border}`,
                color: owned ? theme.text : theme.textMuted,
                filter: owned ? "none" : "grayscale(70%)",
              }}>
                <span>{u.icon}</span><span>{u.label}</span>
                <span style={{ opacity: 0.6 }}>Niv.{u.level}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Filtres (chantier 7) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          <Chip theme={theme} accent="#4D6BFE" active={cat === "Toutes"} onClick={() => { setCat("Toutes"); setLimit(PAGE_SIZE); }}>Toutes</Chip>
          {BADGE_CATEGORIES.map(c => (
            <Chip key={c} theme={theme} accent="#4D6BFE" active={cat === c} onClick={() => { setCat(c); setLimit(PAGE_SIZE); }}>{c}</Chip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip theme={theme} accent="#64748B" active={rarity === "toutes"} onClick={() => { setRarity("toutes"); setLimit(PAGE_SIZE); }}>Toutes raretés</Chip>
          {["commun", "rare", "epique", "legendaire"].map(r => (
            <Chip key={r} theme={theme} accent={RARITY_STYLES[r].color} active={rarity === r} onClick={() => { setRarity(r); setLimit(PAGE_SIZE); }}>{RARITY_STYLES[r].label}</Chip>
          ))}
          <span style={{ width: 12 }} />
          <Chip theme={theme} accent="#0EA5E9" active={status === "tous"} onClick={() => { setStatus("tous"); setLimit(PAGE_SIZE); }}>Tous</Chip>
          <Chip theme={theme} accent="#10B981" active={status === "unlocked"} onClick={() => { setStatus("unlocked"); setLimit(PAGE_SIZE); }}>Débloqués</Chip>
          <Chip theme={theme} accent="#F59E0B" active={status === "locked"} onClick={() => { setStatus("locked"); setLimit(PAGE_SIZE); }}>À débloquer</Chip>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 12 }}>
        {filtered.length} badge{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", background: theme.cardBg, borderRadius: 20, border: `1.5px dashed ${theme.border}`, color: theme.textMuted, fontWeight: 600 }}>
          Aucun badge ne correspond à ces filtres.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
            {visible.map((d, i) => (
              <BadgeCard key={d.b.id} badge={d.b} index={i % PAGE_SIZE} isUnlocked={d.isUnlocked} prog={d.prog} theme={theme} isDarkMode={isDarkMode} />
            ))}
          </div>
          {filtered.length > limit && (
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={() => setLimit(v => v + PAGE_SIZE)} style={{ background: isDarkMode ? "#1E293B" : "#F1F5F9", color: theme.text, border: "none", padding: "12px 24px", borderRadius: 999, fontWeight: 800, cursor: "pointer" }}>
                Afficher {Math.min(PAGE_SIZE, filtered.length - limit)} de plus ({filtered.length - limit} restants)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
