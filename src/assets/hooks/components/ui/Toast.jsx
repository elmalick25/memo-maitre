// src/components/ui/Toast.jsx
export function Toast({ toast, theme }) {
  if (!toast) return null;
  const bg = toast.type === "error" ? "#EF4444" : toast.type === "info" ? "#3B82F6" : "#10B981";
  return (
    <div style={{
      position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "white", padding: "16px 28px", borderRadius: 16,
      fontWeight: 700, fontSize: 15, zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      animation: "fadeUp 0.3s ease"
    }}>
      {toast.msg}
    </div>
  );
}