// src/components/BetaChat.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Espace de discussion privé entre le propriétaire et chaque bêta-testeur.
// Design moderne, professionnel et 100% réactif aux modes Jour / Nuit.
//
// Données Firestore :
//   chats/{testerUid}                     → { email, displayName, lastMessageAt, unreadForOwner, unreadForTester }
//   chats/{testerUid}/messages/{msgId}    → { senderUid, senderEmail, text, createdAt }
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useRef, useMemo } from "react";
import {
  collection, doc, setDoc, addDoc, onSnapshot, orderBy, query,
  serverTimestamp, getDocs,
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";

const OWNER_UID = import.meta.env.VITE_OWNER_UID || "";

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
  const user = auth.currentUser;
  const isOwner = !!user && OWNER_UID && user.uid === OWNER_UID;
  const isDark = useIsDarkMode();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState([]);              // owner only
  const [activeTester, setActiveTester] = useState(null);  // owner only
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const [btnPos, setBtnPos] = useState(() => {
    const saved = localStorage.getItem("betaChatPos");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return { left: 18, bottom: 18 };
  });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initLeft: 0, initBottom: 0, hasMoved: false });

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

  const chatUid = isOwner ? activeTester : user?.uid;

  // ── Enregistre le thread côté tester dès l'ouverture ──────────────────────
  useEffect(() => {
    if (!open || !user || isOwner) return;
    setDoc(
      doc(db, "chats", user.uid),
      {
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        lastSeenByTesterAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((e) => console.warn("[betachat] init tester thread KO:", e?.message));
  }, [open, user, isOwner]);

  // ── Owner : liste des threads ─────────────────────────────────────────────
  useEffect(() => {
    if (!open || !isOwner) return;
    getDocs(collection(db, "chats"))
      .then((snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => {
          const ta = a.lastMessageAt?.toMillis?.() || 0;
          const tb = b.lastMessageAt?.toMillis?.() || 0;
          return tb - ta;
        });
        setThreads(arr);
        if (!activeTester && arr.length > 0) setActiveTester(arr[0].id);
      })
      .catch((e) => console.warn("[betachat] list threads KO:", e?.message));
  }, [open, isOwner, activeTester]);

  // ── Abonnement aux messages du chat actif ─────────────────────────────────
  useEffect(() => {
    if (!open || !chatUid) { setMessages([]); return; }
    const q = query(
      collection(db, "chats", chatUid, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("[betachat] onSnapshot KO:", err?.message)
    );
    return () => unsub();
  }, [open, chatUid]);

  // ── Scroll auto ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const stick = () => { el.scrollTop = el.scrollHeight; };
    stick();
    const raf = requestAnimationFrame(stick);
    const t = setTimeout(stick, 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [messages, open, activeTester]);

  const send = async () => {
    const value = text.trim();
    if (!value || !user || !chatUid || sending) return;
    setSending(true);
    try {
      await setDoc(
        doc(db, "chats", chatUid),
        {
          email: isOwner ? (threads.find((t) => t.id === chatUid)?.email || "") : (user.email || ""),
          displayName: isOwner ? (threads.find((t) => t.id === chatUid)?.displayName || "") : (user.displayName || ""),
          lastMessageAt: serverTimestamp(),
          lastMessageBy: user.uid,
          lastMessageText: value.slice(0, 200),
        },
        { merge: true }
      );
      await addDoc(collection(db, "chats", chatUid, "messages"), {
        senderUid: user.uid,
        senderEmail: user.email || "",
        senderName: user.displayName || "",
        senderIsOwner: isOwner,
        text: value,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (e) {
      console.error("[betachat] send KO:", e);
      alert("Envoi impossible : " + (e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const unreadHint = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return false;
    return last.senderUid && last.senderUid !== user?.uid;
  }, [messages, user]);

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
          background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
          color: "#fff", cursor: "pointer", fontSize: 22,
          boxShadow: "0 8px 24px rgba(139, 92, 246, 0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}
      >
        <span className="beta-chat-icon">💬</span>
        {unreadHint && !open && (
          <span style={{
            position: "absolute", top: 4, right: 4,
            width: 12, height: 12, borderRadius: "50%",
            background: "#ef4444", border: "2px solid #0a0a0a",
          }} />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Discussion bêta"
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: isDark ? "rgba(10, 12, 20, 0.7)" : "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            fontFamily: "'Outfit', sans-serif",
            animation: "betaFadeIn 0.2s ease-out",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{
            width: "100%", maxWidth: 540,
            height: "min(88dvh, 720px)",
            maxHeight: "88dvh",
            background: isDark
              ? "linear-gradient(180deg, #10121e 0%, #151829 100%)"
              : "linear-gradient(180deg, #FFFFFF 0%, #FAF5FF 100%)",
            color: isDark ? "#FFFFFF" : "#0F172A",
            borderRadius: "28px 28px 0 0",
            display: "flex", flexDirection: "column",
            border: isDark
              ? "1.5px solid rgba(139, 92, 246, 0.3)"
              : "1.5px solid rgba(168, 85, 247, 0.25)",
            boxShadow: isDark
              ? "0 -10px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.2)"
              : "0 -10px 40px rgba(124, 58, 237, 0.2), 0 4px 16px rgba(0, 0, 0, 0.06)",
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
                : "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
            }}>
              <div style={{
                width: 40, height: 4, borderRadius: 999,
                background: "rgba(255, 255, 255, 0.4)",
              }} />
            </div>

            {/* Header */}
            <div style={{
              padding: "12px 18px 16px",
              display: "flex", alignItems: "center", gap: 12,
              background: isDark
                ? "linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)"
                : "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
              borderBottom: isDark
                ? "1px solid rgba(139, 92, 246, 0.25)"
                : "1px solid rgba(255, 255, 255, 0.25)",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 14,
                background: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(8px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, flexShrink: 0,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}>
                💬
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 16, color: "#FFFFFF", letterSpacing: "-0.2px" }}>
                  {isOwner ? "Discussions bêta-testeurs" : "Discussion avec le créateur"}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.85)", marginTop: 2, fontWeight: 500 }}>
                  {isOwner
                    ? `${threads.length} conversation${threads.length > 1 ? "s" : ""}`
                    : "Espace direct pour tes suggestions et questions"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.2)",
                  border: "none", color: "#FFFFFF",
                  fontSize: 18, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.2s ease, transform 0.2s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.35)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"; }}
              >
                ✕
              </button>
            </div>

            {/* Sélecteur de tester (owner uniquement) */}
            {isOwner && (
              <div style={{
                padding: "10px 14px", display: "flex", gap: 8, overflowX: "auto",
                borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(168, 85, 247, 0.15)",
                background: isDark ? "#0d0f1a" : "#F3E8FF",
              }}>
                {threads.length === 0 && (
                  <div style={{ color: isDark ? "#94a3b8" : "#6D28D9", fontSize: 12, padding: "6px 4px", fontWeight: 600 }}>
                    Aucun bêta-testeur n'a encore ouvert la discussion.
                  </div>
                )}
                {threads.map((t) => {
                  const label = t.displayName || t.email || t.id.slice(0, 6);
                  const active = t.id === activeTester;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTester(t.id)}
                      style={{
                        background: active
                          ? "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)"
                          : (isDark ? "#181a2a" : "#FFFFFF"),
                        color: active
                          ? "#FFFFFF"
                          : (isDark ? "#C4B5FD" : "#6D28D9"),
                        border: active
                          ? "none"
                          : (isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168, 85, 247, 0.25)"),
                        borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800,
                        cursor: "pointer", whiteSpace: "nowrap",
                        boxShadow: active ? "0 4px 12px rgba(124, 58, 237, 0.35)" : "none",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Messages */}
            <div ref={listRef} className="mm-chat-scroll" style={{
              flex: 1, overflowY: "auto", padding: "16px 16px 8px",
              display: "flex", flexDirection: "column", gap: 10,
              minHeight: 0, maxHeight: "100%",
              background: isDark ? "#090a12" : "#F8FAFC",
            }}>
              {(!chatUid) ? (
                <div style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 13, textAlign: "center", marginTop: 32, fontWeight: 600 }}>
                  {isOwner ? "Sélectionne une conversation." : "Écris ton premier message ci-dessous ↓"}
                </div>
              ) : messages.length === 0 ? (
                <div style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 13, textAlign: "center", marginTop: 32, fontWeight: 600 }}>
                  Aucun message pour le moment. Dis bonjour ! 👋
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.senderUid === user.uid;
                  return (
                    <div key={m.id} style={{
                      alignSelf: mine ? "flex-end" : "flex-start",
                      maxWidth: "82%",
                      background: mine
                        ? "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)"
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
                        ? "0 4px 14px rgba(124, 58, 237, 0.25)"
                        : (isDark ? "0 2px 8px rgba(0, 0, 0, 0.2)" : "0 2px 8px rgba(0, 0, 0, 0.04)"),
                    }}>
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                      <div style={{
                        fontSize: 10,
                        opacity: 0.8,
                        marginTop: 4,
                        textAlign: "right",
                        fontWeight: 600,
                        color: mine ? "#FFFFFF" : (isDark ? "#94a3b8" : "#64748b"),
                      }}>
                        {m.senderIsOwner ? "👑 " : ""}{formatTime(m.createdAt)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              style={{
                padding: "12px 14px",
                display: "flex", gap: 10, alignItems: "center",
                borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(226, 232, 240, 0.9)",
                background: isDark ? "#0f111e" : "#FFFFFF",
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder={chatUid ? "Écris un message…" : "Sélectionne d'abord une conversation"}
                disabled={!chatUid || sending}
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
                disabled={!chatUid || sending || !text.trim()}
                style={{
                  background: "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)",
                  color: "#FFFFFF", border: "none", borderRadius: 16,
                  padding: "10px 18px", fontWeight: 900, cursor: "pointer",
                  fontSize: 14,
                  boxShadow: "0 4px 14px rgba(124, 58, 237, 0.35)",
                  opacity: (!chatUid || sending || !text.trim()) ? 0.45 : 1,
                  transition: "transform 0.15s ease, opacity 0.2s ease",
                }}
              >
                {sending ? "…" : "Envoyer"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
