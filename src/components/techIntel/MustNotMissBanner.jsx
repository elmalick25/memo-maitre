// Bandeau « À ne pas rater » : articles non lus à très haute note.
export default function MustNotMissBanner({ items = [], onOpen, onClose, onManageKeywords }) {
  if (!items.length) return null;
  return (
    <div className="tiv-must-not-miss" role="region" aria-label="À ne pas rater" style={{
      margin: "0 0 10px", padding: "10px 12px", borderRadius: 12,
      border: "1px solid rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.10)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <strong style={{ fontSize: 12, color: "#f59e0b" }}>🔥 À ne pas rater</strong>
          {onManageKeywords && (
            <button
              type="button"
              onClick={onManageKeywords}
              title="Personnaliser les sujets surveillés"
              style={{
                background: "rgba(245,158,11,0.15)",
                border: "1px solid rgba(245,158,11,0.3)",
                color: "#f59e0b",
                borderRadius: "6px",
                padding: "2px 6px",
                fontSize: "10px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px"
              }}
            >
              <span>⚙️</span> Gérer
            </button>
          )}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Masquer" style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", fontSize: 14 }}>×</button>
        )}
      </div>
      {items.map((it) => (
        <button key={it.id} type="button" onClick={() => onOpen?.(it)} style={{
          display: "block", width: "100%", textAlign: "left", background: "none", border: 0,
          color: "inherit", cursor: "pointer", padding: "4px 0", fontSize: 13, lineHeight: 1.35,
        }}>
          • {it.titleFr || it.title} <span style={{ opacity: 0.6, fontSize: 11 }}>— {it.source}{it.sourceCount > 1 ? ` +${it.sourceCount - 1}` : ""}</span>
        </button>
      ))}
    </div>
  );
}
