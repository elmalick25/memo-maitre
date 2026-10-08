// src/hooks/useBetaUnreadCount.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook temps-réel comptabilisant les messages bêta non lus (0, 1, 2, ...).
// - Propriétaire : somme des messages non lus des bêta-testeurs (tous salons).
// - Bêta-testeur : messages non lus envoyés par le créateur.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, query } from "firebase/firestore";
import { db, auth } from "../lib/firebase";

const OWNER_UID = import.meta.env.VITE_OWNER_UID || "huOVzj2YnVZbdhw34hJ2BeZlHdD3";

export function useBetaUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [user, setUser] = useState(() => auth?.currentUser || null);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setUnreadCount(0);
      return undefined;
    }

    const isOwner = !!user && OWNER_UID && user.uid === OWNER_UID;

    if (isOwner) {
      // Le propriétaire écoute l'ensemble des salons de discussion
      const q = query(collection(db, "chats"));
      const unsubscribe = onSnapshot(
        q,
        (snap) => {
          let count = 0;
          snap.docs.forEach((d) => {
            const data = d.data();
            // Ignorer son propre document utilisateur s'il existe
            if (d.id === OWNER_UID || d.id === user.uid) return;

            if (data.unreadForOwner) {
              const c = typeof data.unreadCountForOwner === "number" && data.unreadCountForOwner > 0
                ? data.unreadCountForOwner
                : 1;
              count += c;
            }
          });
          setUnreadCount(count);
        },
        (err) => {
          console.warn("[useBetaUnreadCount] owner onSnapshot KO:", err?.message);
        }
      );
      return unsubscribe;
    } else {
      // Le bêta-testeur écoute son propre salon privé
      const docRef = doc(db, "chats", user.uid);
      const unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            setUnreadCount(0);
            return;
          }
          const data = snap.data();
          if (data?.unreadForTester) {
            const c = typeof data.unreadCountForTester === "number" && data.unreadCountForTester > 0
              ? data.unreadCountForTester
              : 1;
            setUnreadCount(c);
          } else {
            setUnreadCount(0);
          }
        },
        (err) => {
          console.warn("[useBetaUnreadCount] tester onSnapshot KO:", err?.message);
        }
      );
      return unsubscribe;
    }
  }, [user]);

  return { unreadCount, isOwner: !!user && OWNER_UID && user?.uid === OWNER_UID };
}
