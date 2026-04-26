// src/components/views/BadgesView.jsx
import { BADGES } from "../../config/constants";

export function BadgesView({ unlockedBadges, theme, isDarkMode }) {
  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: theme.highlight }}>🏆 Tes Hauts Faits</h1>
          <p style={{ color: theme.textMuted }}>Débloqués : {unlockedBadges.length} / {BADGES.length}</p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 20 }}>
        {BADGES.map((badge) => {
          const isUnlocked = unlockedBadges.includes(badge.id);
          return (
            <div key={badge.id} style={{
              background: isUnlocked ? (isDarkMode ? "#1E293B" : "white") : (isDarkMode ? "#0F172A" : "#F8FAFC"),
              border: `2px solid ${isUnlocked ? "#F59E0B" : theme.border}`,
              borderRadius: 24, padding: "24px", textAlign: "center",
              opacity: isUnlocked ? 1 : 0.4, filter: isUnlocked ? "none" : "grayscale(100%)",
              transition: "all 0.3s", position: "relative"
            }} className={isUnlocked ? "card-hov" : ""}>
              {isUnlocked && <div style={{ position: "absolute", top: 12, right: 12, fontSize: 16 }}>✨</div>}
              <div style={{ fontSize: 48, marginBottom: 16 }}>{badge.icon}</div>
              <div style={{ fontWeight: 800, color: theme.text, fontSize: 15, marginBottom: 6 }}>{badge.label}</div>
              <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>{badge.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}