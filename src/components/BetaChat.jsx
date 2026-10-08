// src/components/BetaChat.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Espace de discussion privé entre le propriétaire et chaque bêta-testeur.
// Design moderne, professionnel et 100% réactif aux modes Jour / Nuit.
//
// Données Firestore :
//   chats/{testerUid}                     → { email, displayName, lastMessageAt, unreadForOwner, unreadForTester }
//   chats/{testerUid}/messages/{msgId}    → { senderUid, senderEmail, text, createdAt }
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  collection, doc, getDocs, setDoc, onSnapshot, orderBy, query,
  serverTimestamp, writeBatch, increment,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../lib/firebase";
import { useVirtualKeyboard } from "../hooks/useVirtualKeyboard";
import { useBetaUnreadCount } from "../hooks/useBetaUnreadCount";

const OWNER_UID = import.meta.env.VITE_OWNER_UID || "huOVzj2YnVZbdhw34hJ2BeZlHdD3";

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== "undefined") {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr) return attr === "dark";
      const saved = localStorage.getItem("mm_theme");
      if (saved) return saved === "dark";
    }
    return true;
  });

  useEffect(() => {
    const updateTheme = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr) {
        setIsDark(attr === "dark");
      } else {
        const saved = localStorage.getItem("mm_theme");
        setIsDark(saved !== "light");
      }
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("storage", updateTheme);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", updateTheme);
    };
  }, []);

  return isDark;
}

export default function BetaChat() {
  // Firebase peut être indisponible (config manquante) : le chat se désactive
  // proprement au lieu de faire planter toute l'application.
  const [user, setUser] = useState(() => auth?.currentUser || null);
  const isOwner = !!user && OWNER_UID && user.uid === OWNER_UID;
  const isDark = useIsDarkMode();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const listRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const isScrolledUpRef = useRef(false);
  const prevMsgCountRef = useRef(0);

  const { keyboardHeight } = useVirtualKeyboard();
  const { unreadCount } = useBetaUnreadCount();

  const [btnPos, setBtnPos] = useState(() => {
    const saved = localStorage.getItem("betaChatPos");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return { left: 18, bottom: 18 };
  });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initLeft: 0, initBottom: 0, hasMoved: false });

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const handlePointerDown = (e) => {
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initLeft: btnPos.left,
      initBottom: btnPos.bottom,
      hasMoved: false
    };

    const handlePointerMove = (eMove) => {
      if (!dragRef.current.isDragging) return;
      const dx = eMove.clientX - dragRef.current.startX;
      const dy = eMove.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.hasMoved = true;
      }
      let newLeft = dragRef.current.initLeft + dx;
      let newBottom = dragRef.current.initBottom - dy;

      const maxX = window.innerWidth - 52;
      const maxY = window.innerHeight - 52;
      newLeft = Math.max(0, Math.min(newLeft, maxX));
      newBottom = Math.max(0, Math.min(newBottom, maxY));

      setBtnPos({ left: newLeft, bottom: newBottom });
    };

    const handlePointerUp = () => {
      dragRef.current.isDragging = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  useEffect(() => {
    if (dragRef.current.hasMoved) {
      localStorage.setItem("betaChatPos", JSON.stringify(btnPos));
    }
  }, [btnPos]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener('open_beta_chat', handleOpen);
    return () => window.removeEventListener('open_beta_chat', handleOpen);
  }, []);

  const [threads, setThreads] = useState([]);
  const [activeChatUid, setActiveChatUid] = useState("group");

  // ── Pour le propriétaire : écoute temps réel de tous les salons de testeurs ──
  useEffect(() => {
    if (!open || !user || !isOwner) {
      setThreads([]);
      return undefined;
    }
    const q = query(collection(db, "chats"), orderBy("lastMessageAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => d.id !== "group" && d.id !== OWNER_UID && d.id !== user.uid);
        setThreads(list);
      },
      (err) => console.warn("[betachat] threads onSnapshot KO:", err?.message)
    );
  }, [open, user, isOwner]);

  const currentThread = isOwner && activeChatUid !== "group" ? threads.find((t) => t.id === activeChatUid) : null;

  // ── Abonnement aux messages du salon actif (Général ou Privé) ─────────────
  useEffect(() => {
    if (!open || !user || !activeChatUid) {
      setMessages([]);
      return undefined;
    }
    const q = query(
      collection(db, "chats", activeChatUid, "messages"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("[betachat] messages onSnapshot KO:", err?.message)
    );
  }, [open, user, activeChatUid]);

  // ── Marquer le salon actif comme lu dès l'ouverture ou au changement ───────
  useEffect(() => {
    if (!open || !user || !activeChatUid || !db) return;
    const timer = setTimeout(() => {
      try {
        if (isOwner) {
          // Ne jamais écrire sur le salon général group à chaque ouverture
          if (activeChatUid === "group") return;
          const target = threads.find((t) => t.id === activeChatUid);
          // Évite tout appel réseau si le salon est déjà lu
          if (!target || (!target.unreadForOwner && !target.unreadCountForOwner)) return;
          setDoc(doc(db, "chats", activeChatUid), { unreadForOwner: false, unreadCountForOwner: 0 }, { merge: true }).catch(() => {});
        } else if (activeChatUid === user.uid) {
          setDoc(doc(db, "chats", activeChatUid), { unreadForTester: false, unreadCountForTester: 0 }, { merge: true }).catch(() => {});
        }
      } catch (e) {
        console.warn("[betachat] markAsRead error:", e);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [open, user, activeChatUid, isOwner, threads]);

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        try {
          messagesEndRef.current.scrollIntoView({
            behavior: smooth ? "smooth" : "auto",
            block: "end",
          });
        } catch {
          if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
          }
        }
      }
    });
  }, []);

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distanceFromBottom > 60;
    isScrolledUpRef.current = isUp;
    if (!isUp) {
      setHasNewBelow(false);
    }
  }, []);

  // Défilement automatique vers le bas à l'ouverture ou au changement de salon
  useEffect(() => {
    if (open && activeChatUid) {
      isScrolledUpRef.current = false;
      setHasNewBelow(false);
      const timer = setTimeout(() => scrollToBottom(false), 50);
      return () => clearTimeout(timer);
    }
  }, [open, activeChatUid, scrollToBottom]);

  // Réception de nouveaux messages : scroll vers le bas UNIQUEMENT si l'utilisateur est déjà en bas
  useEffect(() => {
    if (!open) return undefined;
    const hasNew = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (hasNew) {
      if (isScrolledUpRef.current) {
        setHasNewBelow(true);
      } else {
        scrollToBottom(true);
      }
    }
  }, [messages, open, scrollToBottom]);

  const send = async () => {
    const value = text.trim();
    if (!value || !user || sending || !activeChatUid) return;
    isScrolledUpRef.current = false;
    setHasNewBelow(false);
    requestAnimationFrame(() => scrollToBottom(true));
    setSending(true);
    try {
      const myName = user.displayName || user.email?.split("@")[0] || "Membre Bêta";
      const isGroup = activeChatUid === "group";
      const batch = writeBatch(db);

      const threadUpdate = {
        lastMessageAt: serverTimestamp(),
        lastMessageBy: user.uid,
        lastMessageByName: isOwner ? `${myName} (Créateur)` : myName,
        lastMessageText: value.slice(0, 200),
        unreadForOwner: !isOwner,
        unreadForTester: isOwner,
        unreadCountForOwner: !isOwner ? increment(1) : 0,
        unreadCountForTester: isOwner ? increment(1) : 0,
      };

      if (isGroup) {
        threadUpdate.name = "Bêta Testeurs MémoMaître";
      } else if (!isOwner) {
        threadUpdate.displayName = myName;
        threadUpdate.email = user.email || "";
        threadUpdate.photoURL = user.photoURL || "";
      }

      batch.set(
        doc(db, "chats", activeChatUid),
        threadUpdate,
        { merge: true },
      );

      batch.set(doc(collection(db, "chats", activeChatUid, "messages")), {
        senderUid: user.uid,
        senderEmail: user.email || "",
        senderName: isOwner ? `${myName} (Créateur)` : myName,
        senderPhoto: user.photoURL || "",
        senderIsOwner: isOwner,
        text: value,
        replyTo: replyTo
          ? {
              id: replyTo.id,
              senderName: replyTo.senderName,
              text: replyTo.text.slice(0, 140),
            }
          : null,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setText("");
      setReplyTo(null);
      setTimeout(() => scrollToBottom(true), 60);
    } catch (e) {
      console.error("[betachat] send KO:", e);
      alert("Envoi impossible : " + (e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const [clearing, setClearing] = useState(false);

  const clearCurrentChat = async () => {
    if (!activeChatUid || !user || clearing) return;
    const isGroup = activeChatUid === "group";

    // Un testeur ne peut pas effacer le Salon Général (réservé au créateur)
    if (isGroup && !isOwner) {
      alert("Seul le créateur peut effacer les messages du Salon Général.");
      return;
    }

    const targetLabel = isGroup
      ? "du Salon Général (Groupe Bêta)"
      : isOwner
        ? `de votre discussion avec ${currentThread?.displayName || currentThread?.email?.split("@")[0] || "ce bêta-testeur"}`
        : "de votre discussion privée avec le Créateur";

    const ok = window.confirm(
      `⚠️ Confirmation de nettoyage :\n\nVoulez-vous vraiment effacer tous les messages ${targetLabel} ?\n\nCette action est irréversible.`
    );
    if (!ok) return;

    setClearing(true);
    try {
      const snap = await getDocs(collection(db, "chats", activeChatUid, "messages"));
      if (snap.empty) {
        setClearing(false);
        return;
      }

      // Firestore limite les batchs à 500 opérations
      const docs = snap.docs;
      const CHUNK_SIZE = 450;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Réinitialiser les métadonnées du document parent
      const updateBatch = writeBatch(db);
      const parentUpdate = {
        lastMessageText: "Discussion effacée",
        lastMessageAt: serverTimestamp(),
        unreadForOwner: false,
        unreadForTester: false,
        unreadCountForOwner: 0,
        unreadCountForTester: 0,
      };
      updateBatch.set(doc(db, "chats", activeChatUid), parentUpdate, { merge: true });
      await updateBatch.commit();
    } catch (e) {
      console.error("[betachat] clear KO:", e);
      alert("Erreur lors de l'effacement : " + (e?.message || e));
    } finally {
      setClearing(false);
    }
  };

  const [replyTo, setReplyTo] = useState(null);
  const unreadHint = isOwner
    ? threads.some((t) => t.unreadForOwner)
    : false;

  if (!user) return null;

  return (
    <>
      {/* Bouton flottant (Desktop) */}
      <button
        className="beta-chat-fab show-desktop-only"
        onClick={(e) => {
          if (dragRef.current.hasMoved) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          setOpen((v) => !v);
        }}
        onPointerDown={handlePointerDown}
        aria-label="Espace de discussion"
        title="Discussion"
        style={{
          touchAction: "none",
          position: "fixed", bottom: btnPos.bottom, left: btnPos.left, zIndex: 9998,
          width: 52, height: 52, borderRadius: "50%", border: "none",
          background: "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary) 100%)",
          color: "#fff", cursor: "pointer", fontSize: 22,
          boxShadow: "0 8px 24px color-mix(in srgb, var(--mm-primary) 45.0%, transparent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}
      >
        <span className="beta-chat-icon" style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          💬
          <span
            className={`mhv2-chat-badge ${unreadCount > 0 ? "has-unread" : "is-zero"}`}
            style={{
              position: "absolute",
              top: -8,
              right: -10,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        </span>
      </button>

      {open && (
        <div
          className="beta-chat-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Discussion bêta"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: keyboardHeight > 0 ? `${keyboardHeight}px` : 0,
            zIndex: 9999,
            background: isDark ? "rgba(10, 12, 20, 0.7)" : "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            fontFamily: "'Outfit', sans-serif",
            animation: "betaFadeIn 0.2s ease-out",
            transition: "bottom 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="beta-chat-panel" style={{
            position: "relative",
            width: "100%", maxWidth: 540,
            height: "min(88dvh, 720px)",
            maxHeight: "88dvh",
            background: isDark
              ? "linear-gradient(180deg, #10121e 0%, #151829 100%)"
              : "linear-gradient(180deg, #FFFFFF 0%, color-mix(in srgb, var(--mm-primary) 4%, white) 100%)",
            color: isDark ? "#FFFFFF" : "#0F172A",
            borderRadius: "28px 28px 0 0",
            display: "flex", flexDirection: "column",
            border: isDark
              ? "1.5px solid color-mix(in srgb, var(--mm-primary) 30.0%, transparent)"
              : "1.5px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)",
            boxShadow: isDark
              ? "0 -10px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px color-mix(in srgb, var(--mm-primary) 20.0%, transparent)"
              : "0 -10px 40px rgba(158, 71, 36, 0.2), 0 4px 16px rgba(0, 0, 0, 0.06)",
            overflow: "hidden",
          }}>
            {/* Poignée mobile */}
            <div style={{
              width: "100%",
              paddingTop: 8,
              paddingBottom: 4,
              display: "flex",
              justifyContent: "center",
              background: isDark
                ? "linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)"
                : "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary-deep) 100%)",
            }}>
              <div style={{
                width: 40, height: 4, borderRadius: 999,
                background: "rgba(255, 255, 255, 0.4)",
              }} />
            </div>

            {/* Header du Chat */}
            {/* Header du Chat */}
            <div className="beta-chat-header" style={{
              padding: "12px 18px 14px",
              display: "flex", alignItems: "center", gap: 12,
              background: isDark
                ? "linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)"
                : "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary-deep) 100%)",
              borderBottom: isDark
                ? "1px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)"
                : "1px solid rgba(255, 255, 255, 0.25)",
              flexShrink: 0,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 14,
                background: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(8px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, flexShrink: 0,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}>
                {activeChatUid === "group" ? "🌐" : isOwner ? "👑" : "💬"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 16, color: "#FFFFFF", letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {activeChatUid === "group"
                    ? "Salon Général (Bêta WhatsApp)"
                    : isOwner
                      ? (currentThread ? `Discussion avec ${currentThread.displayName || currentThread.email?.split("@")[0] || "Bêta-testeur"}` : "Discussions Bêta-testeurs")
                      : "Discussion privée avec le Créateur"}
                </div>
                <div style={{ fontSize: 11.5, color: "rgba(255, 255, 255, 0.85)", marginTop: 2, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {activeChatUid === "group"
                    ? "Groupe ouvert à tous les testeurs & créateur"
                    : isOwner
                      ? `${threads.length} contact${threads.length > 1 ? "s" : ""} enregistré${threads.length > 1 ? "s" : ""}`
                      : "Canal privé et confidentiel • En direct"}
                </div>
              </div>
              {/* Bouton Effacer / Nettoyer (Créateur partout, ou Testeur sur sa discussion privée) */}
              {(isOwner || activeChatUid !== "group") && (
                <button
                  type="button"
                  onClick={clearCurrentChat}
                  disabled={clearing || messages.length === 0}
                  title={messages.length === 0 ? "La discussion est déjà vide" : "Effacer tous les messages de cette discussion"}
                  aria-label="Effacer tous les messages"
                  style={{
                    background: isDark ? "rgba(239, 68, 68, 0.18)" : "rgba(255, 255, 255, 0.2)",
                    border: isDark ? "1px solid rgba(239, 68, 68, 0.35)" : "1px solid rgba(255, 255, 255, 0.35)",
                    color: isDark ? "#fca5a5" : "#FFFFFF",
                    borderRadius: 12,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: (clearing || messages.length === 0) ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    opacity: (clearing || messages.length === 0) ? 0.45 : 1,
                    transition: "all 0.2s ease",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!clearing && messages.length > 0) {
                      e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.35)" : "rgba(239, 68, 68, 0.9)";
                      e.currentTarget.style.color = "#FFFFFF";
                      e.currentTarget.style.transform = "scale(1.03)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.18)" : "rgba(255, 255, 255, 0.2)";
                    e.currentTarget.style.color = isDark ? "#fca5a5" : "#FFFFFF";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  <span>🗑️</span>
                  <span style={{ fontSize: 11.5 }}>{clearing ? "…" : "Effacer"}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer la discussion"
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.2)",
                  border: "none", color: "#FFFFFF",
                  fontSize: 18, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.2s ease, transform 0.2s ease",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.35)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"; }}
              >
                ✕
              </button>
            </div>

            {/* Contrôle segmenté moderne (Tabs ultra-lisibles) */}
            <div style={{
              padding: "10px 16px",
              display: "flex",
              gap: 8,
              background: isDark ? "rgba(15, 17, 30, 0.75)" : "rgba(241, 245, 249, 0.85)",
              backdropFilter: "blur(12px)",
              borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.06)",
              flexShrink: 0,
            }}>
              {/* Onglet 1 : Salon Général WhatsApp */}
              <button
                type="button"
                onClick={() => setActiveChatUid("group")}
                style={{
                  flex: isOwner ? "0 0 45%" : "1",
                  padding: "9px 12px",
                  borderRadius: 14,
                  border: activeChatUid === "group"
                    ? "1px solid rgba(255, 255, 255, 0.25)"
                    : isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(0, 0, 0, 0.06)",
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  background: activeChatUid === "group"
                    ? "var(--mm-primary)"
                    : isDark ? "rgba(255, 255, 255, 0.05)" : "#FFFFFF",
                  color: activeChatUid === "group" ? "#FFFFFF" : isDark ? "#94a3b8" : "#475569",
                  boxShadow: activeChatUid === "group"
                    ? "0 4px 12px rgba(158, 71, 36, 0.35)"
                    : isDark ? "none" : "0 2px 5px rgba(0,0,0,0.03)",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <span>🌐</span>
                <span style={{ whiteSpace: "nowrap" }}>Salon Général</span>
              </button>

              {/* Onglet 2 : Support Privé */}
              {isOwner ? (
                <div style={{ flex: "1", minWidth: 0, position: "relative" }}>
                  <select
                    id="beta-tester-select"
                    value={activeChatUid === "group" ? "" : activeChatUid}
                    onChange={(e) => {
                      if (e.target.value) setActiveChatUid(e.target.value);
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      padding: "9px 28px 9px 12px",
                      borderRadius: 14,
                      border: activeChatUid !== "group"
                        ? "1px solid rgba(255, 255, 255, 0.25)"
                        : isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(0, 0, 0, 0.06)",
                      background: activeChatUid !== "group"
                        ? "var(--mm-primary)"
                        : isDark ? "rgba(255, 255, 255, 0.05)" : "#FFFFFF",
                      color: activeChatUid !== "group" ? "#FFFFFF" : isDark ? "#94a3b8" : "#475569",
                      fontSize: 12.5,
                      fontWeight: 800,
                      outline: "none",
                      cursor: "pointer",
                      appearance: "none",
                      WebkitAppearance: "none",
                      boxShadow: activeChatUid !== "group"
                        ? "0 4px 12px rgba(158, 71, 36, 0.35)"
                        : isDark ? "none" : "0 2px 5px rgba(0,0,0,0.03)",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    <option value="" disabled style={{ background: isDark ? "#171929" : "#FFFFFF", color: isDark ? "#94a3b8" : "#64748b" }}>
                      👥 Choisir un testeur ({threads.length}){unreadCount > 0 ? ` • ${unreadCount} non lu${unreadCount > 1 ? "s" : ""}` : ""}
                    </option>
                    {threads.length === 0 ? (
                      <option value="" disabled style={{ background: isDark ? "#171929" : "#FFFFFF", color: isDark ? "#94a3b8" : "#64748b" }}>
                        Aucun testeur connecté
                      </option>
                    ) : (
                      [...threads]
                        .sort((a, b) => {
                          const aUnread = a.unreadForOwner ? 1 : 0;
                          const bUnread = b.unreadForOwner ? 1 : 0;
                          if (bUnread !== aUnread) return bUnread - aUnread;
                          const aTime = a.lastMessageAt?.toMillis ? a.lastMessageAt.toMillis() : (a.lastMessageAt || 0);
                          const bTime = b.lastMessageAt?.toMillis ? b.lastMessageAt.toMillis() : (b.lastMessageAt || 0);
                          return bTime - aTime;
                        })
                        .map((t) => {
                          const name = t.displayName || t.email?.split("@")[0] || t.id.slice(0, 8);
                          const count = typeof t.unreadCountForOwner === "number" && t.unreadCountForOwner > 0
                            ? t.unreadCountForOwner
                            : (t.unreadForOwner ? 1 : 0);
                          const unreadMark = t.unreadForOwner ? `🔴 (${count}) ` : "👤 ";
                          return (
                            <option key={t.id} value={t.id} style={{ background: isDark ? "#171929" : "#FFFFFF", color: isDark ? "#FFFFFF" : "#0F172A" }}>
                              {unreadMark}{name}
                            </option>
                          );
                        })
                    )}
                  </select>
                  <div style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    fontSize: 10,
                    color: activeChatUid !== "group" ? "#FFFFFF" : isDark ? "#94a3b8" : "#64748b",
                  }}>
                    ▼
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveChatUid(user.uid)}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    borderRadius: 14,
                    border: activeChatUid !== "group"
                      ? "1px solid rgba(255, 255, 255, 0.25)"
                      : isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(0, 0, 0, 0.06)",
                    fontWeight: 800,
                    fontSize: 12.5,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    background: activeChatUid !== "group"
                      ? "var(--mm-primary)"
                      : isDark ? "rgba(255, 255, 255, 0.05)" : "#FFFFFF",
                    color: activeChatUid !== "group" ? "#FFFFFF" : isDark ? "#94a3b8" : "#475569",
                    boxShadow: activeChatUid !== "group"
                      ? "0 4px 12px rgba(158, 71, 36, 0.35)"
                      : isDark ? "none" : "0 2px 5px rgba(0,0,0,0.03)",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <span>🔒</span>
                  <span style={{ whiteSpace: "nowrap" }}>Support Privé</span>
                </button>
              )}
            </div>

            {/* Messages du salon */}
            <div
              ref={listRef}
              onScroll={handleScroll}
              className="mm-chat-scroll"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                padding: "20px 16px 28px",
                display: "flex",
                flexDirection: "column",
                flexWrap: "nowrap",
                gap: 12,
                minHeight: 0,
                maxHeight: "100%",
                width: "100%",
                boxSizing: "border-box",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                background: isDark ? "#090a12" : "#F8FAFC",
                position: "relative",
              }}>
              {messages.length === 0 ? (
                <div style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 13, textAlign: "center", marginTop: 32, fontWeight: 600 }}>
                  {isOwner
                    ? (threads.length === 0 ? "Aucun message pour le moment." : `Discussion avec ${currentThread?.displayName || "ce testeur"} vide. Écris un message pour lui répondre !`)
                    : "Bienvenue dans ton espace privé avec le créateur ! Pose tes questions ou partage tes retours 👋"}
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.senderUid === user.uid;
                  const senderDisplayName = m.senderIsOwner
                    ? `👑 ${m.senderName || "Créateur"}`
                    : (m.senderName || m.senderEmail?.split("@")[0] || "Bêta-testeur");
                  return (
                    <div key={m.id} className="mm-chat-msg" style={{
                      alignSelf: mine ? "flex-end" : "flex-start",
                      maxWidth: "82%",
                      width: "100%",
                      flexShrink: 0,
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: mine ? "flex-end" : "flex-start",
                    }}>
                      {/* Nom de l'auteur affiché comme sur WhatsApp */}
                      <span style={{
                        fontSize: 11,
                        fontWeight: 800,
                        marginBottom: 3,
                        marginRight: mine ? 4 : 0,
                        marginLeft: mine ? 0 : 4,
                        color: mine
                          ? (isDark ? "#93c5fd" : "var(--mm-primary)")
                          : (isDark ? "#c4b5fd" : "#0284c7"),
                        letterSpacing: "0.2px",
                      }}>
                        {mine ? `Vous (${m.senderName || "Moi"})` : senderDisplayName}
                      </span>
                      <div style={{
                        background: mine
                          ? "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary) 100%)"
                          : (isDark ? "#171929" : "#FFFFFF"),
                        color: mine
                          ? "#FFFFFF"
                          : (isDark ? "#F1F5F9" : "#0F172A"),
                        padding: "10px 14px",
                        borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        fontSize: 14, lineHeight: 1.45, wordBreak: "break-word",
                        border: mine
                          ? "none"
                          : (isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1.5px solid rgba(226, 232, 240, 0.9)"),
                        boxShadow: mine
                          ? "0 4px 14px rgba(158, 71, 36, 0.25)"
                          : (isDark ? "0 2px 8px rgba(0, 0, 0, 0.2)" : "0 2px 8px rgba(0, 0, 0, 0.04)"),
                      }}>
                        {/* Encart de citation WhatsApp si c'est une réponse */}
                        {m.replyTo && (
                          <div style={{
                            padding: "6px 10px",
                            marginBottom: 6,
                            borderRadius: 8,
                            borderLeft: `3px solid ${mine ? "#FFFFFF" : "var(--mm-primary)"}`,
                            background: mine
                              ? "rgba(0, 0, 0, 0.18)"
                              : (isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)"),
                            fontSize: 12,
                            lineHeight: 1.35,
                          }}>
                            <div style={{
                              fontWeight: 800,
                              fontSize: 11,
                              color: mine ? "#FFFFFF" : "var(--mm-primary)",
                              marginBottom: 2,
                            }}>
                              {m.replyTo.senderName}
                            </div>
                            <div style={{
                              opacity: 0.85,
                              fontSize: 12,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: 240,
                            }}>
                              {m.replyTo.text}
                            </div>
                          </div>
                        )}

                        <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          marginTop: 6,
                          fontSize: 10,
                          opacity: 0.85,
                          fontWeight: 600,
                          color: mine ? "#FFFFFF" : (isDark ? "#94a3b8" : "#64748b"),
                        }}>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo({ id: m.id, senderName: senderDisplayName.replace("👑 ", ""), text: m.text });
                              inputRef.current?.focus();
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "0 2px",
                              color: "inherit",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              opacity: 0.8,
                              transition: "opacity 0.15s ease",
                            }}
                            title="Répondre à ce message"
                          >
                            ↩️ Répondre
                          </button>
                          <div>{formatTime(m.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {/* Ancre sentinelle invisible pour garantir le défilement automatique vers le dernier message */}
              <div ref={messagesEndRef} style={{ height: 1, minHeight: 1, clear: "both" }} />
            </div>

            {/* ── Micro-bouton flottant discret « ⬇ Nouveau message » ── */}
            {hasNewBelow && (
              <button
                type="button"
                onClick={() => {
                  scrollToBottom(true);
                  setHasNewBelow(false);
                }}
                className="ev-floating-scroll-down-btn"
                style={{
                  bottom: replyTo ? 135 : 78,
                }}
                aria-label="Faire défiler vers les nouveaux messages"
              >
                <span className="ev-scroll-down-dot" /> ⬇ Nouveau message
              </button>
            )}

            {/* Composer avec bandeau de réponse WhatsApp */}
            <form
              className="beta-chat-composer"
              onSubmit={(e) => { e.preventDefault(); send(); }}
              style={{
                padding: keyboardHeight > 0
                  ? "10px 14px 12px"
                  : "10px 14px calc(14px + env(safe-area-inset-bottom, 0px))",
                display: "flex", flexDirection: "column", gap: 8,
                borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(226, 232, 240, 0.9)",
                background: isDark ? "#0f111e" : "#FFFFFF",
              }}
            >
              {/* Bandeau de réponse WhatsApp au-dessus du champ */}
              {replyTo && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 12px",
                  background: isDark ? "rgba(30, 27, 75, 0.75)" : "rgba(238, 242, 255, 0.9)",
                  borderLeft: "4px solid var(--mm-primary)",
                  borderRadius: "10px",
                  fontSize: 12,
                  animation: "betaFadeIn 0.15s ease-out",
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, color: "var(--mm-primary)", fontSize: 11 }}>
                      ↩️ Réponse à {replyTo.senderName}
                    </div>
                    <div style={{
                      color: isDark ? "#cbd5e1" : "#475569",
                      fontSize: 11.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 320,
                    }}>
                      {replyTo.text}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: isDark ? "#94a3b8" : "#64748b",
                      cursor: "pointer",
                      fontSize: 15,
                      padding: "2px 6px",
                      lineHeight: 1,
                    }}
                    title="Annuler la réponse"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%" }}>
                <textarea
                  ref={inputRef}
                  className="beta-chat-input"
                  aria-label="Message"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onFocus={() => {
                    setTimeout(() => scrollToBottom(true), 150);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder={
                    replyTo
                      ? `Répondre à ${replyTo.senderName}…`
                      : activeChatUid === "group"
                        ? "Écris un message au groupe…"
                        : isOwner
                          ? (currentThread ? `Écris à ${currentThread.displayName || currentThread.email?.split("@")[0] || "ce testeur"}…` : "Sélectionne un testeur…")
                          : "Écris un message privé au créateur…"
                  }
                  disabled={sending}
                  rows={1}
                  style={{
                    flex: 1, resize: "none", maxHeight: 120,
                    background: isDark ? "#1a1d30" : "#F1F5F9",
                    color: isDark ? "#FFFFFF" : "#0F172A",
                    border: isDark ? "1.5px solid rgba(255, 255, 255, 0.12)" : "1.5px solid rgba(203, 213, 225, 0.9)",
                    borderRadius: 16,
                    padding: "10px 14px", fontSize: 14, fontFamily: "inherit",
                    outline: "none",
                    transition: "border-color 0.2s ease, background 0.2s ease",
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || !text.trim()}
                  style={{
                    background: "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary) 100%)",
                    color: "#FFFFFF", border: "none", borderRadius: 16,
                    padding: "10px 18px", fontWeight: 900, cursor: "pointer",
                    fontSize: 14,
                    boxShadow: "0 4px 14px rgba(158, 71, 36, 0.35)",
                    opacity: (sending || !text.trim()) ? 0.45 : 1,
                    transition: "transform 0.15s ease, opacity 0.2s ease",
                  }}
                >
                  {sending ? "…" : "Envoyer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
