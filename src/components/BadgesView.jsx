// src/components/BadgesView.jsx
// ═══════════════════════════════════════════════════════════════════════════
// HAUTS FAITS & TROPHÉES — GOD TIER EXPERIENCE
// ═══════════════════════════════════════════════════════════════════════════
import React, { useMemo, useState, memo, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BADGES,
  BADGE_CATEGORIES,
  RARITY_STYLES,
  RARITY_ORDER,
} from "../constants/gamification";
import { UNLOCKS, getUnlocks, getNextUnlock } from "../lib/unlocks";
import { colorMix } from "../lib/colorMix";

const PAGE_SIZE = 48;

const CATEGORY_ICONS = {
  "Toutes": "🌟",
  "Création": "🌱",
  "Streak": "🔥",
  "Révisions": "📖",
  "Mémoire (FSRS)": "🧠",
  "Production active": "🗣️",
  "IA": "🤖",
  "Discipline": "🧭",
  "Découverte": "🔭",
  "Progression": "⭐",
};

// ── Badge Card Component ────────────────────────────────────────────────────
// forwardRef requis : AnimatePresence (mode popLayout) attache une ref à
// l'enfant. Sans cela React émet un warning et l'animation de sortie casse.
const BadgeCard = memo(forwardRef(function BadgeCard({
  badge,
  isUnlocked,
  prog,
  theme,
  isDarkMode,
  onSelect,
}, ref) {
  const rar = RARITY_STYLES[badge.rarity] || RARITY_STYLES.commun;
  const pct = prog && prog.max ? Math.min(100, Math.round((prog.cur / prog.max) * 100)) : (isUnlocked ? 100 : 0);

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ duration: 0.22 }}
      onClick={() => onSelect?.(badge, isUnlocked, prog, pct)}
      style={{
        background: isUnlocked
          ? (isDarkMode
              ? `linear-gradient(135deg, rgba(30, 41, 59, 0.75), rgba(15, 23, 42, 0.9))`
              : `linear-gradient(135deg, #FFFFFF, color-mix(in srgb, var(--mm-primary) 4%, white))`)
          : (isDarkMode
              ? "rgba(15, 23, 42, 0.4)"
              : "rgba(248, 250, 252, 0.8)"),
        border: `1.5px solid ${isUnlocked ? rar.color : (isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)")}`,
        borderRadius: 20,
        padding: "18px 16px 16px",
        textAlign: "center",
        filter: isUnlocked ? "none" : "grayscale(85%) opacity(0.7)",
        position: "relative",
        boxShadow: isUnlocked
          ? (isDarkMode ? `0 8px 24px ${colorMix(rar.color, 13)}` : `0 8px 20px ${colorMix(rar.color, 8)}`)
          : "none",
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      title={`${badge.label} — ${badge.desc}`}
    >
      {/* Légendaire Conic Sheen */}
      {isUnlocked && rar.animated && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: rar.gradient,
            backgroundSize: "300% 300%",
            opacity: 0.15,
            animation: "gradientShift 6s ease infinite",
            pointerEvents: "none",
          }}
        />
      )}

      <div>
        {/* Top bar (Rareté + Catégorie) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: rar.color,
              background: `${colorMix(rar.color, 9)}`,
              padding: "2px 8px",
              borderRadius: 99,
            }}
          >
            {rar.label}
          </span>
          <span style={{ fontSize: 11, color: theme?.textMuted || "#64748B", fontWeight: 600 }}>
            {CATEGORY_ICONS[badge.cat] || "🏷️"} {badge.cat}
          </span>
        </div>

        {/* Grand Icone */}
        <div
          style={{
            fontSize: 42,
            margin: "6px 0 10px",
            filter: isUnlocked ? "drop-shadow(0 4px 12px rgba(0,0,0,0.15))" : "none",
            transform: isUnlocked ? "scale(1.05)" : "scale(0.95)",
            transition: "transform 0.2s ease",
          }}
        >
          {badge.icon}
        </div>

        {/* Titre & Description */}
        <div style={{ fontWeight: 800, color: theme?.text || "#0F172A", fontSize: 14, marginBottom: 4, lineHeight: 1.3 }}>
          {badge.label}
        </div>
        <div style={{ fontSize: 11, color: theme?.textMuted || "#64748B", fontWeight: 500, lineHeight: 1.4, minHeight: 32 }}>
          {badge.desc}
        </div>
      </div>

      {/* Barre de progression ou badge débloqué */}
      <div style={{ marginTop: 12 }}>
        {!isUnlocked && prog ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: theme?.textMuted || "#64748B", fontWeight: 700, marginBottom: 4 }}>
              <span>Progression</span>
              <span>{prog.cur} / {prog.max} ({pct}%)</span>
            </div>
            <div style={{ height: 6, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${colorMix(rar.color, 53)}, ${rar.color})`,
                  borderRadius: 4,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        ) : isUnlocked ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: rar.color, background: `${colorMix(rar.color, 8)}`, padding: "3px 10px", borderRadius: 99 }}>
            <span>✔ Débloqué</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, fontWeight: 600, color: theme?.textMuted || "#64748B" }}>
            🔒 Verrouillé
          </div>
        )}
      </div>
    </motion.div>
  );
}));

// ── Detail Modal Component ──────────────────────────────────────────────────
function BadgeDetailModal({ data, onClose, theme, isDarkMode, showToast }) {
  if (!data) return null;
  const { badge, isUnlocked, prog, pct } = data;
  const rar = RARITY_STYLES[badge.rarity] || RARITY_STYLES.commun;

  const copyShareText = () => {
    const text = isUnlocked
      ? `🏆 J'ai débloqué le haut fait "${badge.label}" (${rar.label}) sur MemoMaster ! ${badge.icon}\n${badge.desc}`
      : `🎯 Objectif sur MemoMaster : débloquer "${badge.label}" (${pct}% accompli) ! ${badge.icon}`;
    navigator.clipboard?.writeText(text);
    showToast?.("📋 Texte copié dans le presse-papier !", "success");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isDarkMode ? "#0F172A" : "#FFFFFF",
          border: `2px solid ${rar.color}`,
          borderRadius: 28,
          padding: "32px 28px 24px",
          maxWidth: 440,
          width: "100%",
          boxShadow: `0 24px 60px rgba(0,0,0,0.4), 0 0 40px ${colorMix(rar.color, 15)}`,
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
            border: "none",
            borderRadius: "50%",
            width: 32,
            height: 32,
            cursor: "pointer",
            color: theme?.text || "#0F172A",
            fontWeight: 800,
          }}
        >
          ✕
        </button>

        {/* Icone avec aura */}
        <div style={{ position: "relative", display: "inline-block", margin: "10px 0 16px" }}>
          <div
            style={{
              position: "absolute",
              inset: -14,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${colorMix(rar.color, 25)} 0%, transparent 70%)`,
              filter: "blur(8px)",
              pointerEvents: "none",
            }}
          />
          <div style={{ fontSize: 64, position: "relative" }}>{badge.icon}</div>
        </div>

        {/* Tags */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              color: rar.color,
              background: `${colorMix(rar.color, 13)}`,
              padding: "3px 10px",
              borderRadius: 99,
            }}
          >
            {rar.label}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: theme?.textMuted || "#64748B",
              background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
              padding: "3px 10px",
              borderRadius: 99,
            }}
          >
            {CATEGORY_ICONS[badge.cat] || "🏷️"} {badge.cat}
          </span>
        </div>

        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 900, color: theme?.text || "#0F172A" }}>
          {badge.label}
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: theme?.textMuted || "#64748B", lineHeight: 1.5 }}>
          {badge.desc}
        </p>

        {/* Progression détaillée */}
        <div
          style={{
            background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
            borderRadius: 16,
            padding: "16px 20px",
            border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: theme?.textMuted || "#64748B" }}>Statut</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: isUnlocked ? "#10B981" : rar.color }}>
              {isUnlocked ? "✔ Débloqué & Actif" : `En cours (${pct}%)`}
            </span>
          </div>

          {prog && (
            <div>
              <div style={{ height: 8, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${colorMix(rar.color, 53)}, ${rar.color})`,
                    borderRadius: 99,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: theme?.textMuted || "#64748B", textAlign: "right", fontWeight: 600 }}>
                {prog.cur} / {prog.max}
              </div>
            </div>
          )}
        </div>

        {/* Boutons d'action */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={copyShareText}
            style={{
              flex: 1,
              padding: "12px 18px",
              background: `linear-gradient(135deg, ${rar.color}, ${colorMix(rar.color, 80)})`,
              color: "#FFFFFF",
              border: "none",
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: `0 6px 18px ${colorMix(rar.color, 21)}`,
            }}
          >
            📢 Partager / Copier
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "12px 20px",
              background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
              color: theme?.text || "#0F172A",
              border: "none",
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Fermer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Unlock Category Helper ──────────────────────────────────────────────────
const UNLOCK_CATEGORIES = [
  { id: "all", label: "Tous", icon: "🌟" },
  { id: "bonus", label: "Bonus & Capacités", icon: "⚡" },
  { id: "themes", label: "Thèmes & Décors", icon: "🎨" },
  { id: "visuals", label: "Streaks & Halos", icon: "✨" },
  { id: "system", label: "Système & Prestige", icon: "🧪" },
];

function getUnlockCategory(u) {
  if (u.id.startsWith("theme_")) return "themes";
  if (u.id.startsWith("streak_icon_") || u.id.startsWith("holo_") || u.id.startsWith("card_frame_")) return "visuals";
  if (u.id.startsWith("freeze_") || u.id.startsWith("intake_") || u.id.startsWith("chest_")) return "bonus";
  return "system";
}

function getCategoryBadgeInfo(catId) {
  switch (catId) {
    case "themes": return { label: "Thème", color: "var(--mm-primary)", bg: "color-mix(in srgb, var(--mm-primary) 14.0%, transparent)" };
    case "visuals": return { label: "Effet Visuel", color: "#EC4899", bg: "rgba(236,72,153,0.14)" };
    case "bonus": return { label: "Bonus Jeu", color: "#10B981", bg: "rgba(16,185,129,0.14)" };
    default: return { label: "Système", color: "#F59E0B", bg: "rgba(245,158,11,0.14)" };
  }
}

// ── Chip Component ──────────────────────────────────────────────────────────
const FilterChip = ({ active, onClick, children, accent = "var(--mm-primary)", theme, isDarkMode }) => (
  <button
    onClick={onClick}
    style={{
      padding: "8px 16px",
      borderRadius: 999,
      fontSize: 12.5,
      fontWeight: 800,
      cursor: "pointer",
      background: active ? accent : (isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
      color: active ? "#FFFFFF" : (theme?.textMuted || "#64748B"),
      border: `1.5px solid ${active ? accent : (isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)")}`,
      whiteSpace: "nowrap",
      transition: "all 0.2s ease",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    }}
  >
    {children}
  </button>
);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BADGES VIEW
// ═══════════════════════════════════════════════════════════════════════════
export default function BadgesView({
  badgeState = {},
  unlockedBadges = [],
  theme,
  isDarkMode = false,
  archetype,
  showToast,
  onBack,
}) {
  const [activeTab, setActiveTab] = useState("badges"); // "badges" | "privileges"
  const [cat, setCat] = useState("Toutes");
  const [rarity, setRarity] = useState("toutes");
  const [status, setStatus] = useState("tous"); // tous | unlocked | locked
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedBadge, setSelectedBadge] = useState(null);

  // Filtres spécifiques aux Privilèges RPG
  const [privilegeCat, setPrivilegeCat] = useState("all");
  const [privilegeStatus, setPrivilegeStatus] = useState("tous"); // "tous" | "unlocked" | "locked"

  const unlockedSet = useMemo(() => new Set(unlockedBadges), [unlockedBadges]);

  const decorated = useMemo(() => {
    return BADGES.map((b) => {
      const isUnlocked = unlockedSet.has(b.id);
      const prog = b.progress ? b.progress(badgeState) : null;
      const pct = prog && prog.max ? Math.min(100, Math.round((prog.cur / prog.max) * 100)) : (isUnlocked ? 100 : 0);
      return { b, isUnlocked, prog, pct };
    });
  }, [badgeState, unlockedSet]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = decorated.filter(({ b, isUnlocked }) => {
      if (cat !== "Toutes" && b.cat !== cat) return false;
      if (rarity !== "toutes" && b.rarity !== rarity) return false;
      if (status === "unlocked" && !isUnlocked) return false;
      if (status === "locked" && isUnlocked) return false;
      if (q && !b.label.toLowerCase().includes(q) && !b.desc.toLowerCase().includes(q)) {
        return false;
      }
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
  }, [decorated, cat, rarity, status, search]);

  const unlockedCount = decorated.filter((d) => d.isUnlocked).length;
  const totalBadges = BADGES.length;
  const completionPct = Math.round((unlockedCount / Math.max(1, totalBadges)) * 100);

  const rarityCount = useMemo(() => {
    const acc = { legendaire: 0, epique: 0, rare: 0, commun: 0 };
    decorated.forEach((d) => {
      if (d.isUnlocked) acc[d.b.rarity] = (acc[d.b.rarity] || 0) + 1;
    });
    return acc;
  }, [decorated]);

  const nextTarget = useMemo(() => {
    return decorated
      .filter((d) => !d.isUnlocked && d.prog && d.pct < 100)
      .sort((a, b) => b.pct - a.pct)[0];
  }, [decorated]);

  const level = archetype?.level || 0;
  const myUnlocks = getUnlocks(level);
  const nextUnlock = getNextUnlock(level);

  // Filtrage des privilèges RPG
  const filteredUnlocks = useMemo(() => {
    return UNLOCKS.filter((u) => {
      const owned = myUnlocks.some((x) => x.id === u.id);
      if (privilegeCat !== "all" && getUnlockCategory(u) !== privilegeCat) return false;
      if (privilegeStatus === "unlocked" && !owned) return false;
      if (privilegeStatus === "locked" && owned) return false;
      return true;
    });
  }, [myUnlocks, privilegeCat, privilegeStatus]);

  const visible = filtered.slice(0, limit);

  return (
    <div style={{ paddingBottom: 40, animation: "fadeUp 0.4s ease" }}>
      {/* ─── EN-TÊTE HALL OF FAME ROYAL ─── */}
      <div
        style={{
          marginBottom: 24,
          position: "relative",
          padding: "32px 28px",
          borderRadius: 32,
          overflow: "hidden",
          background: isDarkMode
            ? "linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.98))"
            : "linear-gradient(135deg, color-mix(in srgb, var(--mm-primary) 4%, white), color-mix(in srgb, var(--mm-primary) 10%, white))",
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "color-mix(in srgb, var(--mm-primary) 20.0%, transparent)"}`,
          boxShadow: isDarkMode
            ? "0 20px 50px rgba(0,0,0,0.4)"
            : "0 20px 50px color-mix(in srgb, var(--mm-primary) 15.0%, transparent)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-50%",
            right: "-20%",
            width: "80%",
            height: "200%",
            background: "radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 65%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", padding: "4px 12px", borderRadius: 99, marginBottom: 10 }}>
              <span style={{ fontSize: 13 }}>👑</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Panthéon des Réussites & Paliers RPG
              </span>
            </div>
            <h1 style={{ fontSize: "clamp(24px, 3.8vw, 34px)", fontWeight: 900, color: theme?.text || "#0F172A", margin: 0, letterSpacing: "-1px" }}>
              🏆 Galerie & Progression
            </h1>
            <p style={{ color: theme?.textMuted || "#64748B", marginTop: 6, fontSize: 14, fontWeight: 500 }}>
              <strong style={{ color: "#F59E0B" }}>{unlockedCount}</strong>/{totalBadges} hauts faits ({completionPct}%) · <strong style={{ color: "#10B981" }}>{myUnlocks.length}</strong>/{UNLOCKS.length} privilèges débloqués · Rang <strong style={{ color: theme?.text }}>{archetype?.icon} {archetype?.title}</strong> (Niv. {level})
            </p>

            {/* Jauge globale de complétion */}
            <div style={{ maxWidth: 420, marginTop: 12 }}>
              <div style={{ height: 8, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", borderRadius: 99, overflow: "hidden" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${completionPct}%` }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  style={{ height: "100%", background: "linear-gradient(90deg, var(--mm-primary), #F59E0B)", borderRadius: 99 }}
                />
              </div>
            </div>
          </div>

          {/* Near-Miss Target Card */}
          {nextTarget && (
            <motion.div
              whileHover={{ scale: 1.03 }}
              onClick={() => setSelectedBadge(nextTarget)}
              style={{
                background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.9)",
                border: "1.5px solid rgba(245,158,11,0.4)",
                borderRadius: 20,
                padding: "14px 18px",
                maxWidth: 280,
                cursor: "pointer",
                boxShadow: "0 8px 24px rgba(245,158,11,0.12)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                🎯 Prochain haut fait accessible
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 26 }}>{nextTarget.b.icon}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: theme?.text || "#0F172A" }}>{nextTarget.b.label}</div>
                  <div style={{ fontSize: 11, color: theme?.textMuted || "#64748B" }}>{nextTarget.prog.cur} / {nextTarget.prog.max} ({nextTarget.pct}%)</div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ─── ONGLET PRINCIPAL DE NAVIGATION (HAUTS FAITS vs PRIVILÈGES RPG) ─── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          background: isDarkMode ? "rgba(15, 23, 42, 0.6)" : "rgba(255, 255, 255, 0.8)",
          padding: "6px",
          borderRadius: 20,
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
          boxShadow: isDarkMode ? "0 4px 20px rgba(0,0,0,0.2)" : "0 4px 16px rgba(0,0,0,0.03)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <button
          onClick={() => setActiveTab("badges")}
          style={{
            flex: 1,
            padding: "12px 20px",
            borderRadius: 16,
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "all 0.25s ease",
            background: activeTab === "badges"
              ? (isDarkMode ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : "linear-gradient(135deg, var(--mm-primary), var(--mm-primary))")
              : "transparent",
            color: activeTab === "badges" ? "#FFFFFF" : (theme?.textMuted || "#64748B"),
            boxShadow: activeTab === "badges" ? "0 6px 20px color-mix(in srgb, var(--mm-primary) 35.0%, transparent)" : "none",
          }}
        >
          <span>🏆</span>
          <span>Hauts Faits & Trophées</span>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 99,
              background: activeTab === "badges" ? "rgba(255,255,255,0.25)" : (isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
              color: activeTab === "badges" ? "#FFFFFF" : (theme?.textMuted || "#64748B"),
            }}
          >
            {unlockedCount}/{totalBadges}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("privileges")}
          style={{
            flex: 1,
            padding: "12px 20px",
            borderRadius: 16,
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "all 0.25s ease",
            background: activeTab === "privileges"
              ? (isDarkMode ? "linear-gradient(135deg, #10B981, #059669)" : "linear-gradient(135deg, #10B981, #047857)")
              : "transparent",
            color: activeTab === "privileges" ? "#FFFFFF" : (theme?.textMuted || "#64748B"),
            boxShadow: activeTab === "privileges" ? "0 6px 20px rgba(16,185,129,0.35)" : "none",
          }}
        >
          <span>🎁</span>
          <span>Paliers & Privilèges de Niveau</span>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 99,
              background: activeTab === "privileges" ? "rgba(255,255,255,0.25)" : (isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
              color: activeTab === "privileges" ? "#FFFFFF" : (theme?.textMuted || "#64748B"),
            }}
          >
            {myUnlocks.length}/{UNLOCKS.length}
          </span>
        </button>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* VUE 1 : HAUTS FAITS & TROPHÉES                                        */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === "badges" && (
        <>
          {/* ─── STATS DE RARETÉ ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
            {["legendaire", "epique", "rare", "commun"].map((r) => {
              const st = RARITY_STYLES[r];
              const count = rarityCount[r] || 0;
              return (
                <div
                  key={r}
                  style={{
                    background: isDarkMode ? st.bgDark : st.bgLight,
                    border: `1.5px solid ${colorMix(st.color, 25)}`,
                    borderRadius: 20,
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    boxShadow: isDarkMode ? "0 4px 20px rgba(0,0,0,0.15)" : "0 4px 16px rgba(0,0,0,0.03)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: st.color, textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {st.label}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: theme?.text || "#0F172A", marginTop: 2 }}>
                      {count}
                    </div>
                  </div>
                  <div style={{ fontSize: 26, opacity: 0.85 }}>
                    {r === "legendaire" ? "👑" : r === "epique" ? "💎" : r === "rare" ? "⚡" : "🌱"}
                  </div>
                </div>
              );
            })}
          </div>

      {/* ─── BARRE DE RECHERCHE & FILTRES ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
        {/* Champ de recherche */}
        <div style={{ position: "relative", maxWidth: 420 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLimit(PAGE_SIZE); }}
            placeholder="🔍 Rechercher un badge par nom ou mot-clé..."
            style={{
              width: "100%",
              padding: "12px 18px",
              borderRadius: 16,
              background: isDarkMode ? "rgba(255,255,255,0.05)" : "#FFFFFF",
              border: `1.5px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
              color: theme?.text || "#0F172A",
              fontSize: 13.5,
              fontWeight: 600,
              outline: "none",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: theme?.textMuted || "#64748B",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Catégories */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <FilterChip
            theme={theme}
            isDarkMode={isDarkMode}
            accent="var(--mm-primary)"
            active={cat === "Toutes"}
            onClick={() => { setCat("Toutes"); setLimit(PAGE_SIZE); }}
          >
            🌟 Toutes
          </FilterChip>
          {BADGE_CATEGORIES.map((c) => (
            <FilterChip
              key={c}
              theme={theme}
              isDarkMode={isDarkMode}
              accent="var(--mm-primary)"
              active={cat === c}
              onClick={() => { setCat(c); setLimit(PAGE_SIZE); }}
            >
              {CATEGORY_ICONS[c] || "🏷️"} {c}
            </FilterChip>
          ))}
        </div>

        {/* Rareté & Statut */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <FilterChip
            theme={theme}
            isDarkMode={isDarkMode}
            accent="#64748B"
            active={rarity === "toutes"}
            onClick={() => { setRarity("toutes"); setLimit(PAGE_SIZE); }}
          >
            Toutes raretés
          </FilterChip>
          {["commun", "rare", "epique", "legendaire"].map((r) => (
            <FilterChip
              key={r}
              theme={theme}
              isDarkMode={isDarkMode}
              accent={RARITY_STYLES[r].color}
              active={rarity === r}
              onClick={() => { setRarity(r); setLimit(PAGE_SIZE); }}
            >
              {RARITY_STYLES[r].label}
            </FilterChip>
          ))}

          <span style={{ width: 12 }} />

          <FilterChip
            theme={theme}
            isDarkMode={isDarkMode}
            accent="var(--mm-primary)"
            active={status === "tous"}
            onClick={() => { setStatus("tous"); setLimit(PAGE_SIZE); }}
          >
            Tous les statuts
          </FilterChip>
          <FilterChip
            theme={theme}
            isDarkMode={isDarkMode}
            accent="#10B981"
            active={status === "unlocked"}
            onClick={() => { setStatus("unlocked"); setLimit(PAGE_SIZE); }}
          >
            ✔ Débloqués ({unlockedCount})
          </FilterChip>
          <FilterChip
            theme={theme}
            isDarkMode={isDarkMode}
            accent="#F59E0B"
            active={status === "locked"}
            onClick={() => { setStatus("locked"); setLimit(PAGE_SIZE); }}
          >
            🔒 À débloquer ({totalBadges - unlockedCount})
          </FilterChip>
        </div>
      </div>

      {/* Compteur affiché */}
      <div style={{ fontSize: 13, fontWeight: 700, color: theme?.textMuted || "#64748B", marginBottom: 16 }}>
        {filtered.length} haut{filtered.length > 1 ? "s" : ""} fait{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
      </div>

      {/* ─── GRILLE DES BADGES ─── */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            background: isDarkMode ? "rgba(15, 23, 42, 0.4)" : "#F8FAFC",
            borderRadius: 24,
            border: `1.5px dashed ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            color: theme?.textMuted || "#64748B",
            fontWeight: 600,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
          <div>Aucun haut fait ne correspond à ces critères de recherche.</div>
        </div>
      ) : (
        <>
          <motion.div
            layout
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: 16,
            }}
          >
            <AnimatePresence mode="popLayout">
              {visible.map((d) => (
                <BadgeCard
                  key={d.b.id}
                  badge={d.b}
                  isUnlocked={d.isUnlocked}
                  prog={d.prog}
                  theme={theme}
                  isDarkMode={isDarkMode}
                  onSelect={() => setSelectedBadge(d)}
                />
              ))}
            </AnimatePresence>
          </motion.div>

          {filtered.length > limit && (
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <button
                onClick={() => setLimit((v) => v + PAGE_SIZE)}
                style={{
                  background: isDarkMode ? "#1E293B" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                  color: "var(--mm-primary)",
                  border: "none",
                  padding: "14px 28px",
                  borderRadius: 999,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  boxShadow: "0 4px 16px color-mix(in srgb, var(--mm-primary) 15.0%, transparent)",
                }}
              >
                Afficher {Math.min(PAGE_SIZE, filtered.length - limit)} de plus ({filtered.length - limit} restants)
              </button>
            </div>
          )}
        </>
      )}
        </>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* VUE 2 : PALIERS & PRIVILÈGES DE NIVEAU (ROADMAP RPG)                 */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === "privileges" && (
        <div style={{ animation: "fadeUp 0.3s ease" }}>
          {/* ─── CARTE SPOTLIGHT : PROCHAIN DÉBLOCAGE ─── */}
          <div
            style={{
              background: isDarkMode
                ? "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 78, 59, 0.25))"
                : "linear-gradient(135deg, #ECFDF5, #D1FAE5)",
              border: `1.5px solid ${isDarkMode ? "rgba(16, 185, 129, 0.35)" : "rgba(16, 185, 129, 0.4)"}`,
              borderRadius: 24,
              padding: "24px 28px",
              marginBottom: 24,
              boxShadow: isDarkMode ? "0 8px 32px rgba(0,0,0,0.3)" : "0 8px 28px rgba(16,185,129,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 20,
            }}
          >
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "#059669", background: "rgba(16,185,129,0.18)", padding: "3px 10px", borderRadius: 99, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <span>🎯</span>
                <span>{nextUnlock ? `Objectif Palier : Niveau ${nextUnlock.level}` : "Paliers Maximaux Atteints"}</span>
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 900, color: theme?.text || "#0F172A" }}>
                {nextUnlock ? `${nextUnlock.icon} ${nextUnlock.label}` : "👑 Tous les privilèges actuels débloqués !"}
              </h3>
              <p style={{ margin: 0, fontSize: 13.5, color: theme?.textMuted || "#64748B", maxWidth: 520 }}>
                {nextUnlock ? nextUnlock.desc : "Tu as atteint le sommet des récompenses de progression. Prépare-toi pour le Prestige au niveau 100 !"}
              </p>
            </div>

            {nextUnlock ? (
              <div
                style={{
                  background: isDarkMode ? "rgba(15, 23, 42, 0.6)" : "#FFFFFF",
                  border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"}`,
                  borderRadius: 18,
                  padding: "12px 20px",
                  textAlign: "center",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: "#10B981", textTransform: "uppercase" }}>
                  Progression Requise
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: theme?.text || "#0F172A", margin: "2px 0" }}>
                  Plus que {Math.max(1, nextUnlock.level - level)} Niv.
                </div>
                <div style={{ fontSize: 11, color: theme?.textMuted || "#64748B", fontWeight: 600 }}>
                  Actuel : Niv. {level} → Cible : Niv. {nextUnlock.level}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 36 }}>🌟</div>
            )}
          </div>

          {/* ─── FILTRES DES PRIVILÈGES ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
            {/* Filtres par Catégorie */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {UNLOCK_CATEGORIES.map((catItem) => {
                const count = catItem.id === "all"
                  ? UNLOCKS.length
                  : UNLOCKS.filter((u) => getUnlockCategory(u) === catItem.id).length;
                return (
                  <FilterChip
                    key={catItem.id}
                    theme={theme}
                    isDarkMode={isDarkMode}
                    accent="#10B981"
                    active={privilegeCat === catItem.id}
                    onClick={() => setPrivilegeCat(catItem.id)}
                  >
                    <span>{catItem.icon}</span>
                    <span>{catItem.label}</span>
                    <span style={{ opacity: 0.7, fontSize: 11 }}>({count})</span>
                  </FilterChip>
                );
              })}
            </div>

            {/* Filtres par Statut */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <FilterChip
                theme={theme}
                isDarkMode={isDarkMode}
                accent="#64748B"
                active={privilegeStatus === "tous"}
                onClick={() => setPrivilegeStatus("tous")}
              >
                Toutes ({UNLOCKS.length})
              </FilterChip>
              <FilterChip
                theme={theme}
                isDarkMode={isDarkMode}
                accent="#10B981"
                active={privilegeStatus === "unlocked"}
                onClick={() => setPrivilegeStatus("unlocked")}
              >
                ✔ Débloqués ({myUnlocks.length})
              </FilterChip>
              <FilterChip
                theme={theme}
                isDarkMode={isDarkMode}
                accent="#F59E0B"
                active={privilegeStatus === "locked"}
                onClick={() => setPrivilegeStatus("locked")}
              >
                🔒 À débloquer ({UNLOCKS.length - myUnlocks.length})
              </FilterChip>
            </div>
          </div>

          {/* Compteur de privilèges */}
          <div style={{ fontSize: 13, fontWeight: 700, color: theme?.textMuted || "#64748B", marginBottom: 16 }}>
            {filteredUnlocks.length} privilège{filteredUnlocks.length > 1 ? "s" : ""} affiché{filteredUnlocks.length > 1 ? "s" : ""}
          </div>

          {/* ─── GRILLE STRUCTURÉE DES PRIVILÈGES ─── */}
          {filteredUnlocks.length === 0 ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                background: isDarkMode ? "rgba(15, 23, 42, 0.4)" : "#F8FAFC",
                borderRadius: 24,
                border: `1.5px dashed ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                color: theme?.textMuted || "#64748B",
                fontWeight: 600,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 10 }}>🎁</div>
              <div>Aucun privilège ne correspond à ce filtre.</div>
            </div>
          ) : (
            <motion.div
              layout
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              {filteredUnlocks.map((u) => {
                const owned = myUnlocks.some((x) => x.id === u.id);
                const catId = getUnlockCategory(u);
                const badgeInfo = getCategoryBadgeInfo(catId);
                const isNext = nextUnlock?.id === u.id;

                return (
                  <motion.div
                    key={u.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -3, scale: 1.015 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => {
                      if (owned) {
                        showToast?.(`✔ Privilège actif : ${u.label} — ${u.desc}`, "success");
                      } else {
                        showToast?.(`🔒 Déblocage au Niveau ${u.level} (dans ${u.level - level} niveau(x))`, "info");
                      }
                    }}
                    style={{
                      background: owned
                        ? (isDarkMode
                            ? "linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95))"
                            : "linear-gradient(135deg, #FFFFFF, #F0FDF4)")
                        : (isDarkMode
                            ? "rgba(15, 23, 42, 0.45)"
                            : "rgba(248, 250, 252, 0.8)"),
                      border: `1.5px solid ${
                        owned
                          ? (isDarkMode ? "rgba(16, 185, 129, 0.4)" : "rgba(16, 185, 129, 0.35)")
                          : isNext
                            ? "#F59E0B"
                            : (isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)")
                      }`,
                      borderRadius: 22,
                      padding: "20px 18px",
                      position: "relative",
                      boxShadow: owned
                        ? (isDarkMode ? "0 8px 24px rgba(16,185,129,0.15)" : "0 6px 20px rgba(16,185,129,0.08)")
                        : isNext
                          ? "0 8px 24px rgba(245,158,11,0.15)"
                          : "none",
                      filter: owned ? "none" : "grayscale(70%) opacity(0.75)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Bannière de prochain objectif */}
                    {isNext && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          background: "linear-gradient(135deg, #F59E0B, #D97706)",
                          color: "#FFFFFF",
                          fontSize: 9.5,
                          fontWeight: 900,
                          letterSpacing: 0.5,
                          padding: "3px 10px",
                          borderBottomLeftRadius: 10,
                          textTransform: "uppercase",
                        }}
                      >
                        🎯 Cible immédiate
                      </div>
                    )}

                    <div>
                      {/* Ligne d'en-tête (Niveau + Catégorie) */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            letterSpacing: 0.5,
                            color: owned ? "#10B981" : (theme?.textMuted || "#64748B"),
                            background: owned ? "rgba(16,185,129,0.15)" : (isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"),
                            padding: "3px 9px",
                            borderRadius: 8,
                          }}
                        >
                          PALIER NIV. {u.level}
                        </span>

                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            color: badgeInfo.color,
                            background: badgeInfo.bg,
                            padding: "3px 8px",
                            borderRadius: 99,
                          }}
                        >
                          {badgeInfo.label}
                        </span>
                      </div>

                      {/* Icone + Titre */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0 10px" }}>
                        <div
                          style={{
                            fontSize: 32,
                            width: 48,
                            height: 48,
                            borderRadius: 14,
                            background: owned
                              ? (isDarkMode ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.1)")
                              : (isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {u.icon}
                        </div>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 14.5, color: theme?.text || "#0F172A", lineHeight: 1.25 }}>
                            {u.label}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: owned ? "#10B981" : (theme?.textMuted || "#64748B"), marginTop: 2 }}>
                            {owned ? "✔ Débloqué & Actif" : `🔒 Verrouillé (Niv. ${u.level})`}
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p style={{ margin: "6px 0 0", fontSize: 12, color: theme?.textMuted || "#64748B", lineHeight: 1.45 }}>
                        {u.desc}
                      </p>
                    </div>

                    {/* Statut bas de carte */}
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                      {owned ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 800, color: "#10B981" }}>
                          <span>Avantage permanent</span>
                          <span>✔ Actif</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: isNext ? "#F59E0B" : (theme?.textMuted || "#64748B") }}>
                          <span>Requis : Niveau {u.level}</span>
                          <span>Dans {Math.max(1, u.level - level)} niveau(x)</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      )}

      {/* ─── MODAL DÉTAIL / CÉLÉBRATION ─── */}
      <AnimatePresence>
        {selectedBadge && (
          <BadgeDetailModal
            data={selectedBadge}
            onClose={() => setSelectedBadge(null)}
            theme={theme}
            isDarkMode={isDarkMode}
            showToast={showToast}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

