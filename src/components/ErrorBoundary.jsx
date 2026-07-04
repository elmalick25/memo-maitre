// ════════════════════════════════════════════════════════════════════════════
// 🛡️ ErrorBoundary — empêche tout l'app de planter à cause d'un seul widget
// ────────────────────────────────────────────────────────────────────────────
// - Compteur de re-essais pour éviter les boucles infinies
// - Dispatch d'un CustomEvent "app:error" pour télémétrie globale
// - Reset auto via key prop (resetKeys)
// - Mode `silent` pour sections non-critiques (rend rien)
// ════════════════════════════════════════════════════════════════════════════
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      console.error("[ErrorBoundary]", error, info?.componentStack);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("app:error", {
          detail: {
            message: String(error?.message || error),
            stack: String(error?.stack || "").slice(0, 1000),
            componentStack: String(info?.componentStack || "").slice(0, 1000),
            scope: this.props.scope || "unknown",
            at: Date.now(),
          },
        }));
      }
    } catch {}
  }

  componentDidUpdate(prevProps) {
    // Auto-reset si les resetKeys changent (ex: route change)
    if (this.state.hasError && this.props.resetKeys) {
      const prev = prevProps.resetKeys || [];
      const cur = this.props.resetKeys || [];
      if (prev.length !== cur.length || prev.some((v, i) => v !== cur[i])) {
        this.handleReset();
      }
    }
  }

  handleReset = () => {
    this.setState((s) => ({ hasError: false, error: null, retryCount: s.retryCount + 1 }));
  };

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.silent) return null;

    if (this.props.fallback) {
      return typeof this.props.fallback === "function"
        ? this.props.fallback(this.state.error, this.handleReset)
        : this.props.fallback;
    }

    const msg = String(this.state.error?.message || this.state.error || "Erreur inconnue").slice(0, 300);
    const tooMany = this.state.retryCount >= 3;

    return (
      <div style={{
        minHeight: this.props.inline ? "auto" : "100vh",
        display: "grid", placeItems: "center",
        background: this.props.inline ? "transparent" : "#0b1020",
        color: "#e5e7eb", padding: 24,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🛡️</div>
          <h1 style={{ fontSize: 20, margin: "12px 0 8px" }}>
            {this.props.scope ? `Section "${this.props.scope}" a planté` : "Cette section a planté"}
          </h1>
          <p style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.5 }}>{msg}</p>
          {tooMany && (
            <p style={{ color: "#f59e0b", fontSize: 12, marginTop: 8 }}>
              Plusieurs tentatives ont échoué — essayez de recharger la page.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
            {!tooMany && <button onClick={this.handleReset} style={btn("#3b82f6")}>Réessayer</button>}
            <button onClick={this.handleReload} style={btn("#374151")}>Recharger la page</button>
          </div>
        </div>
      </div>
    );
  }
}

const btn = (bg) => ({
  padding: "10px 18px",
  background: bg,
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
});
