import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDKV8PbTisinWWfSL4g6BwzmQdt1yAgA-U",
  authDomain: "memo-maitre.firebaseapp.com",
  projectId: "memo-maitre",
  storageBucket: "memo-maitre.firebasestorage.app",
  messagingSenderId: "320016571088",
  appId: "1:320016571088:web:b4f2417a995a1b6d6d9cd5"
};

export const FB_USER = "el_hadji_malick";

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(firebaseApp);
export const fbStorage = getStorage(firebaseApp);

export const storage = {
  async get(key) {
    try {
      const snap = await getDoc(doc(db, "users", FB_USER, "data", key));
      if (snap.exists()) return snap.data().value !== undefined ? snap.data().value : null;
      return null;
    } catch {
      try { const raw = localStorage.getItem("memomaitre_" + key); return raw ? JSON.parse(raw) : null; } catch { return null; }
    }
  },
  async set(key, val) {
    try {
      await setDoc(doc(db, "users", FB_USER, "data", key), { value: val, updatedAt: Date.now() });
    } catch {
      try { localStorage.setItem("memomaitre_" + key, JSON.stringify(val)); } catch {}
    }
  },
};