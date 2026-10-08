// src/components/NotificationCenter.jsx
// ═══════════════════════════════════════════════════════════════════════════
// LA CLOCHE — centre de notifications, niveau god.
//
// Remplace les blocs qui saturaient l'accueil (routine, quêtes, fiches qui
// bloquent). Tout arrive ici, priorisé, groupé, actionnable, avec :
//   • pastille de non-lus animée + résumé « 2 urgentes · 3 à faire »
//   • filtres par groupe (Urgent / Aujourd'hui / Progression / Infos)
//   • action directe par notification (réviser, ouvrir les quêtes, synchro…)
//   • « reporter à demain » et « tout marquer comme lu », persistés en local
//   • fermeture au clic extérieur / Échap, plein écran sur mobile
// ═══════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NOTIF_GROUPS,
  buildNotifications,
  countUnread,
  groupNotifications,
  isSnoozed,
  isExpiredInsight,
  loadNotifState,
  saveNotifState,
} from "../lib/notifications";

const TONE = {
  danger: "#EF4444",
  warn: "#F59E0B",
  accent: "var(--mm-primary)",
  info: "var(--mm-primary)",
  success: "#10B981",
};

const tomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export default function NotificationCenter({
  context = {},
  onAction,
  isDarkMode = true,
  theme = {},
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [state, setState] = useState(() => loadNotifState());
  const rootRef = useRef(null);

  const all = useMemo(() => buildNotifications(context), [context]);
  const visible = useMemo(
    () => all.filter((n) => !isSnoozed(n, state) && !isExpiredInsight(n, state)),
    [all, state]
  );
  const unread = useMemo(() => countUnread(all, state), [all, state]);
  const urgentCount = visible.filter((n) => n.group === "urgent").length;
  const insightsCount = visible.filter((n) => n.group === "insights").length;
  const todayCount = visible.filter((n) => n.group === "today").length;

  const shown = filter === "all" ? visible : visible.filter((n) => n.group === filter);
  const groups = useMemo(() => groupNotifications(shown), [shown]);

  const patch = useCallback((updater) => {
    setState((prev) => {
      const next = updater(prev);
      saveNotifState(next);
      return next;
    });
  }, []);

  // Fermeture Échap + clic extérieur
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const markAllRead = () =>
    patch((prev) => {
      const read = { ...prev.read };
      const now = Date.now();
      visible.forEach((n) => {
        read[n.id] = now;
      });
      return { ...prev, read, lastOpen: now };
    });

  const markRead = (id) =>
    patch((prev) => ({ ...prev, read: { ...prev.read, [id]: Date.now() } }));

  const snooze = (id) =>
    patch((prev) => ({ ...prev, snoozed: { ...prev.snoozed, [id]: tomorrowISO() } }));

  const dismissInsight = (id) =>
    patch((prev) => ({
      ...prev,
      dismissedInsights: { ...(prev.dismissedInsights || {}), [id]: Date.now() },
    }));

  const handleAction = (notif) => {
    markRead(notif.id);
    setOpen(false);
    onAction?.(notif.cta?.action, notif);
  };

  const surface = isDarkMode ? "#0F1629" : "#FFFFFF";
  const surfaceAlt = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.035)";
  const border = theme.border || (isDarkMode ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.1)");
  const fg = theme.text || (isDarkMode ? "#EAF2FF" : "#0F172A");
  const muted = theme.textMuted || (isDarkMode ? "#94A3B8" : "#64748B");

  return (
    <div ref={rootRef} className="mm-notif" style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) patch((prev) => ({ ...prev, lastOpen: Date.now() }));
        }}
        aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}
        aria-expanded={open}
        title="Notifications"
        className="mm-notif-bell"
        style={{
          position: "relative",
          width: 38,
          height: 38,
          borderRadius: 12,
          border: `1px solid ${border}`,
          background: open ? "color-mix(in srgb, var(--mm-primary) 18.0%, transparent)" : surfaceAlt,
          color: fg,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 17,
          flexShrink: 0,
          transition: "background .18s ease, transform .18s ease",
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 999,
              background: urgentCount > 0 ? TONE.danger : TONE.info,
              color: "#fff",
              fontSize: 10,
              fontWeight: 900,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 0 2px ${surface}, 0 0 12px ${urgentCount > 0 ? "rgba(239,68,68,.7)" : "color-mix(in srgb, var(--mm-primary) 60.0%, transparent)"}`,
              animation: urgentCount > 0 ? "mmNotifPulse 1.8s ease-in-out infinite" : "none",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="mm-notif-panel"
          role="dialog"
          aria-label="Centre de notifications"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 380,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "min(70vh, 560px)",
            display: "flex",
            flexDirection: "column",
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: 18,
            boxShadow: "0 30px 70px -20px rgba(2,6,23,0.65)",
            zIndex: 400,
            overflow: "hidden",
          }}
        >
          {/* En-tête */}
          <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: 14, color: fg, flex: 1, minWidth: 0 }}>
                Notifications
              </strong>
              {visible.length > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  style={{
                    background: "none",
                    border: "none",
                    color: TONE.info,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Tout marquer comme lu
                </button>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: muted, marginTop: 3, fontWeight: 600 }}>
              {visible.length === 0
                ? "Esprit libre : aucun signal critique"
                : [
                    urgentCount ? `${urgentCount} urgente${urgentCount > 1 ? "s" : ""}` : null,
                    insightsCount ? `${insightsCount} insight${insightsCount > 1 ? "s" : ""}` : null,
                    todayCount ? `${todayCount} à réviser` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || `${visible.length} info${visible.length > 1 ? "s" : ""}`}
            </div>

            {/* Filtres */}
            <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
              {[{ id: "all", label: "Tout", icon: "✳️" }, ...NOTIF_GROUPS].map((g) => {
                const n = g.id === "all" ? visible.length : visible.filter((x) => x.group === g.id).length;
                if (g.id !== "all" && n === 0) return null;
                const active = filter === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setFilter(g.id)}
                    style={{
                      flexShrink: 0,
                      padding: "5px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      border: `1px solid ${active ? "transparent" : border}`,
                      background: active ? "linear-gradient(135deg,var(--mm-primary),var(--mm-primary))" : surfaceAlt,
                      color: active ? "#fff" : muted,
                    }}
                  >
                    {g.icon} {g.label} {n > 0 ? `· ${n}` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Flux */}
          <div style={{ overflowY: "auto", padding: "8px 10px 12px", flex: 1 }}>
            {shown.length === 0 && (
              <div style={{ textAlign: "center", padding: "34px 18px", color: muted }}>
                <div style={{ fontSize: 32 }} aria-hidden="true">🌱</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 8, color: fg }}>
                  Aucun signal critique
                </div>
                <div style={{ fontSize: 11.5, marginTop: 4, maxWidth: 280, marginInline: "auto", lineHeight: 1.45 }}>
                  Tes révisions et tes statistiques sont équilibrées. Aucune anomalie ni alerte à signaler.
                </div>
              </div>
            )}

            {groups.map((g) => (
              <div key={g.id} style={{ marginTop: 6 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: g.color,
                    padding: "8px 8px 6px",
                  }}
                >
                  {g.icon} {g.label}
                </div>
                {g.items.map((n) => {
                  const accent = TONE[n.tone] || g.color;
                  const isRead = !!state.read?.[n.id];
                  return (
                    <div
                      key={n.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "11px 12px",
                        borderRadius: 14,
                        marginBottom: 6,
                        background: isRead ? "transparent" : surfaceAlt,
                        border: `1px solid ${isRead ? "transparent" : border}`,
                        borderLeft: `3px solid ${accent}`,
                        opacity: isRead ? 0.62 : 1,
                        transition: "opacity .2s ease",
                      }}
                    >
                      <span style={{ fontSize: 17, lineHeight: 1.2 }} aria-hidden="true">
                        {n.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 800,
                            color: fg,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>{n.title}</span>
                          {n.group === "insights" && (
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 900,
                                textTransform: "uppercase",
                                padding: "2px 7px",
                                borderRadius: 6,
                                background: "rgba(139, 92, 246, 0.15)",
                                color: "#8B5CF6",
                                letterSpacing: 0.5,
                              }}
                            >
                              Insight
                            </span>
                          )}
                          {!isRead && (
                            <span
                              aria-hidden="true"
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: 999,
                                background: accent,
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </div>
                        {n.body && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: muted,
                              marginTop: 3,
                              lineHeight: 1.45,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {n.body}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          {n.cta && (
                            <button
                              type="button"
                              onClick={() => handleAction(n)}
                              style={{
                                padding: "5px 11px",
                                borderRadius: 999,
                                border: "none",
                                background: accent,
                                color: "#fff",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              {n.cta.label}
                            </button>
                          )}
                          {!isRead && (
                            <button
                              type="button"
                              onClick={() => markRead(n.id)}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 999,
                                border: `1px solid ${border}`,
                                background: "transparent",
                                color: muted,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Lu
                            </button>
                          )}
                          {n.group === "insights" ? (
                            <button
                              type="button"
                              onClick={() => dismissInsight(n.id)}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 999,
                                border: `1px solid ${border}`,
                                background: "transparent",
                                color: muted,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Ignorer
                            </button>
                          ) : (
                            !n.sticky && (
                              <button
                                type="button"
                                onClick={() => snooze(n.id)}
                                style={{
                                padding: "5px 10px",
                                borderRadius: 999,
                                border: `1px solid ${border}`,
                                background: "transparent",
                                color: muted,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Demain
                            </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes mmNotifPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.18); }
        }
        @media (max-width: 768px) {
          .mm-notif-panel {
            position: fixed !important;
            top: 64px !important;
            left: 10px !important;
            right: 10px !important;
            width: auto !important;
            max-width: none !important;
            max-height: calc(100dvh - 150px) !important;
          }
        }
      `}</style>
    </div>
  );
}
