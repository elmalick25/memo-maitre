// src/components/ui/BadgeNotification.jsx
export function BadgeNotification({ badge }) {
  if (!badge) return null;
  return (
    <div style={{
      position: "fixed", top: 32, right: 32, background: "linear-gradient(135deg, #F59E0B, #EF4444)",
      color: "white", padding: "20px 28px", borderRadius: 20, zIndex: 9999,
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)", animation: "fadeUp 0.5s ease", maxWidth: 300
    }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>{badge.icon}</div>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Nouveau badge !</div>
      <div style={{ fontWeight: 700 }}>{badge.label}</div>
      <div style={{ fontSize: 13, opacity: 0.9 }}>{badge.desc}</div>
    </div>
  );
}