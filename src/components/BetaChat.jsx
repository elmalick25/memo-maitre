// src/components/BetaChat.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Espace de discussion privé entre le propriétaire et chaque bêta-testeur.
//
// Données Firestore :
//   chats/{testerUid}                     → { email, displayName, lastMessageAt, unreadForOwner, unreadForTester }
//   chats/{testerUid}/messages/{msgId}    → { senderUid, senderEmail, text, createdAt }
//
// Règles Firestore : voir firestore.rules (accès accordé au tester lui-même
// OU au propriétaire dont l'UID est configuré dans les règles).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useRef, useMemo } from "react";
import {
  collection, doc, setDoc, addDoc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, getDocs,
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";

const OWNER_UID = import.meta.env.VITE_OWNER_UID || "";

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function BetaChat() {
  const user = auth.currentUser;
  const isOwner = !!user && OWNER_UID && user.uid === OWNER_UID;
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

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!dragRef.current.isDragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
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
      if (dragRef.current.isDragging) {
        dragRef.current.isDragging = false;
        // The state isn't perfectly synced here for localStorage due to closure,
        // but we'll save it on pointer up via a ref if needed. Actually it's fine
        // to just save on window unload or rely on the state update.
        // A simpler way: we'll use an effect dependency or just rely on state.
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    // We only attach these temporarily during drag.
    // However, exposing them for the pointer down handler is needed.
    // Let's bind them dynamically in handlePointerDown.
  }, []);

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
      // save to local storage (approximate because btnPos in closure might be old, 
      // but we can just save it via a separate effect)
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
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, activeTester]);

  const send = async () => {
    const value = text.trim();
    if (!value || !user || !chatUid || sending) return;
    setSending(true);
    try {
      // Assure que le doc parent existe (nécessaire pour que le tester apparaisse
      // dans la liste côté owner, et pour stocker lastMessageAt).
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
    // Simple badge : dernier message non envoyé par moi
    const last = messages[messages.length - 1];
    if (!last) return false;
    return last.senderUid && last.senderUid !== user?.uid;
  }, [messages, user]);

  if (!user) return null;

  return (
    <>
      {/* Bouton flottant */}
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
          background: "linear-gradient(135deg,#8b5cf6,#6366f1)",
          color: "#fff", cursor: "pointer", fontSize: 22,
          boxShadow: "0 8px 22px rgba(139,92,246,.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        💬
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
            background: "rgba(0,0,0,.55)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            fontFamily: "'Outfit', sans-serif",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{
            width: "100%", maxWidth: 520, height: "min(80vh, 640px)",
            background: "#0f0f13", color: "#fff",
            borderRadius: "20px 20px 0 0",
            display: "flex", flexDirection: "column",
            border: "1px solid rgba(139,92,246,.25)",
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
              background: "linear-gradient(135deg,rgba(139,92,246,.15),rgba(99,102,241,.1))",
              borderBottom: "1px solid rgba(255,255,255,.08)",
            }}>
              <div style={{ fontSize: 20 }}>💬</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {isOwner ? "Discussions bêta-testeurs" : "Discussion avec le créateur"}
                </div>
                <div style={{ fontSize: 11, color: "#a1a1aa" }}>
                  {isOwner
                    ? `${threads.length} conversation${threads.length > 1 ? "s" : ""}`
                    : "Un espace privé pour tes retours et questions"}
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{
                background: "transparent", border: "none", color: "#a1a1aa",
                fontSize: 22, cursor: "pointer", padding: 4,
              }}>×</button>
            </div>

            {/* Sélecteur de tester (owner uniquement) */}
            {isOwner && (
              <div style={{
                padding: "8px 12px", display: "flex", gap: 6, overflowX: "auto",
                borderBottom: "1px solid rgba(255,255,255,.06)",
                background: "rgba(255,255,255,.02)",
              }}>
                {threads.length === 0 && (
                  <div style={{ color: "#71717a", fontSize: 12, padding: "6px 4px" }}>
                    Aucun bêta-testeur n'a encore ouvert la discussion.
                  </div>
                )}
                {threads.map((t) => {
                  const label = t.displayName || t.email || t.id.slice(0, 6);
                  const active = t.id === activeTester;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTester(t.id)}
                      style={{
                        background: active ? "linear-gradient(135deg,#8b5cf6,#6366f1)" : "rgba(255,255,255,.05)",
                        color: active ? "#fff" : "#d4d4d8",
                        border: "1px solid " + (active ? "transparent" : "rgba(255,255,255,.08)"),
                        borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Messages */}
            <div ref={listRef} style={{
              flex: 1, overflowY: "auto", padding: "14px 14px 6px",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {(!chatUid) ? (
                <div style={{ color: "#71717a", fontSize: 13, textAlign: "center", marginTop: 24 }}>
                  {isOwner ? "Sélectionne une conversation." : "Écris ton premier message ↓"}
                </div>
              ) : messages.length === 0 ? (
                <div style={{ color: "#71717a", fontSize: 13, textAlign: "center", marginTop: 24 }}>
                  Aucun message pour le moment.
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.senderUid === user.uid;
                  return (
                    <div key={m.id} style={{
                      alignSelf: mine ? "flex-end" : "flex-start",
                      maxWidth: "82%",
                      background: mine
                        ? "linear-gradient(135deg,#8b5cf6,#6366f1)"
                        : "rgba(255,255,255,.06)",
                      color: "#fff",
                      padding: "8px 12px", borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      fontSize: 14, lineHeight: 1.4, wordBreak: "break-word",
                      border: mine ? "none" : "1px solid rgba(255,255,255,.08)",
                    }}>
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                      <div style={{
                        fontSize: 10, opacity: .7, marginTop: 4, textAlign: "right",
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
                padding: 10, display: "flex", gap: 8,
                borderTop: "1px solid rgba(255,255,255,.08)",
                background: "rgba(255,255,255,.02)",
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
                  background: "rgba(255,255,255,.05)", color: "#fff",
                  border: "1px solid rgba(255,255,255,.1)", borderRadius: 12,
                  padding: "10px 12px", fontSize: 14, fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={!chatUid || sending || !text.trim()}
                style={{
                  background: "linear-gradient(135deg,#8b5cf6,#6366f1)",
                  color: "#fff", border: "none", borderRadius: 12,
                  padding: "0 16px", fontWeight: 800, cursor: "pointer",
                  opacity: (!chatUid || sending || !text.trim()) ? .5 : 1,
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
