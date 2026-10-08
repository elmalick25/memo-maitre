import { useEffect, useState, useRef } from 'react'
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider'
import { database } from './lib/db'
import { migrateFromLocalStorage, migrateOrphanSRSData } from './lib/db/migration'
import { syncWithFirebase, listenToSyncSignal, setRemoteSignature } from './lib/db/sync'
import { startRealtimeExpressions, stopRealtimeExpressions, ensureRealtimeExpressions } from './lib/db/realtimeExpressions'
import { auth, provider, setFbUser } from './lib/firebase'
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
} from 'firebase/auth'
import MemoMaster from './MemoMaster'
import ErrorBoundary from './components/ErrorBoundary'
import OfflineBanner from './components/OfflineBanner'
import UpdatePrompt from './components/UpdatePrompt'
import BetaChat from './components/BetaChat'

// ── Contrôle d'accès : propriétaire + bêta-testeurs autorisés ──
// L'accès reste réservé, MAIS on peut désormais autoriser d'autres personnes
// par leur adresse e-mail Google via la variable VITE_ALLOWED_EMAILS
// (liste séparée par des virgules). Chaque personne autorisée obtient sa
// PROPRE vue : les données sont rangées dans Firestore sous users/{uid},
// donc personne ne voit les fiches d'un autre.
//   Ex : VITE_ALLOWED_EMAILS="ami@gmail.com, testeur@outlook.com"
const OWNER_UID = import.meta.env.VITE_OWNER_UID
const ALLOWED_EMAILS = String(import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

function isAuthorizedUser(user) {
  if (!user) return false
  // Propriétaire (par UID) toujours autorisé.
  if (OWNER_UID && user.uid === OWNER_UID) return true
  // Bêta-testeurs autorisés par e-mail.
  const email = String(user.email || '').toLowerCase()
  if (email && ALLOWED_EMAILS.includes(email)) return true
  return false
}

// ── Détection PWA / mobile ──
// signInWithPopup est bloqué/instable dans une PWA installée (display: standalone)
// → on bascule sur redirect. Sur mobile standard, on préfère popup (plus stable).
function shouldUseRedirect() {
  if (typeof window === 'undefined') return false
  
  // Sur iOS (Safari ou Chrome PWA), signInWithRedirect est souvent silencieusement bloqué par l'ITP d'Apple.
  // signInWithPopup ouvre une WebView sécurisée native (SFAuthenticationSession) qui fonctionne parfaitement.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) return false;

  try {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator.standalone === true
    return standalone
  } catch {
    return false
  }
}

// ── Mode hors-ligne d'abord ──
// UID du dernier compte autorisé sur CET appareil (posé par setFbUser).
function getKnownLocalUid() {
  try { return localStorage.getItem('memo_user_uid') || '' } catch { return '' }
}
function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function startLogin() {
  if (!auth || !provider) {
    throw new Error("Connexion indisponible : configuration du compte manquante.")
  }
  if (shouldUseRedirect()) {
    await signInWithRedirect(auth, provider)
    return null
  }
  return await signInWithPopup(auth, provider)
}

function App() {
  const [dbReady, setDbReady] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [loginError, setLoginError] = useState(null)
  const initStarted = useRef(false)

  useEffect(() => {
    let cancelled = false

    // ⚠️ BUGFIX — mode local seul.
    // Si Firebase n'a pas pu s'initialiser, l'app restait bloquée sur
    // « Vérification de la sécurité… » (ou écran blanc). On démarre alors
    // directement sur les données locales : rien n'est perdu, seule la
    // synchro multi-appareils est indisponible.
    if (!auth) {
      ;(async () => {
        try { await migrateFromLocalStorage() } catch (e) { console.warn('Migration KO:', e) }
        try { await migrateOrphanSRSData() } catch (e) { console.warn('Migration SRS→FSRS KO:', e) }
        if (cancelled) return
        initStarted.current = true
        setAccessDenied(false)
        setAuthChecking(false)
        setDbReady(true)
      })()
      return () => { cancelled = true }
    }

    // ⚠️ BUGFIX — plantage hors-ligne (raccourci écran d'accueil iPhone).
    // Sans réseau, Firebase Auth ne peut pas restaurer/valider la session :
    // l'app restait bloquée 12 s puis affichait « Connexion requise », sans
    // aucun moyen de se connecter. L'app est offline-first : si un compte
    // autorisé a déjà utilisé cet appareil, on démarre directement sur les
    // données locales. La synchro reprendra dès le retour du réseau.
    let localModeStarted = false
    const startLocalMode = async (reason) => {
      if (localModeStarted || initStarted.current) {
        setAccessDenied(false)
        setAuthChecking(false)
        return
      }
      localModeStarted = true
      console.info(`[auth] Démarrage en mode local (${reason}).`)
      try { await migrateFromLocalStorage() } catch (e) { console.warn('Migration KO:', e) }
      try { await migrateOrphanSRSData() } catch (e) { console.warn('Migration SRS→FSRS KO:', e) }
      if (cancelled) return
      initStarted.current = true
      setLoginError(null)
      setAccessDenied(false)
      setAuthChecking(false)
      setDbReady(true)
    }
    const canRunLocally = () => Boolean(getKnownLocalUid())

    if (isOffline() && canRunLocally()) {
      startLocalMode('hors-ligne au démarrage')
    }

    // ── 1) Récupère le résultat d'un éventuel signInWithRedirect précédent ──
    getRedirectResult(auth)
      .then((res) => {
        if (!res) return
        if (res.user && isAuthorizedUser(res.user)) {
          setFbUser(res.user.uid)
        }
      })
      .catch((e) => {
        console.warn('[auth] getRedirectResult KO:', e)
        // Hors-ligne : erreur réseau attendue, pas une vraie erreur de connexion.
        if (isOffline() || e?.code === 'auth/network-request-failed') return
        setLoginError(e?.message || 'Erreur de connexion après redirection')
      })

    // ⚠️ BUGFIX — écran « Vérification de la sécurité… » infini.
    // Si Firebase Auth ne répond jamais (réseau coupé, domaine non autorisé),
    // onAuthStateChanged ne se déclenche pas et l'utilisateur restait bloqué
    // pour toujours. Au bout de 12 s on affiche l'écran de connexion.
    let authResponded = false
    const authWatchdog = setTimeout(() => {
      if (cancelled || authResponded || initStarted.current) return
      console.warn('[auth] Aucune réponse de Firebase Auth à temps.')
      if (canRunLocally()) { startLocalMode('Auth injoignable'); return }
      setAccessDenied(true)
      setAuthChecking(false)
    }, isOffline() ? 3000 : 12000)

    let unsubscribeRealtime = null;
    let unsubscribeCards = null;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return
      authResponded = true
      clearTimeout(authWatchdog)
      if (!initStarted.current) setAuthChecking(true)
      
      // Utilisateur connecté mais NON autorisé (ni propriétaire, ni bêta-testeur) → refus.
      if (user && !isAuthorizedUser(user)) {
        try { await auth.signOut() } catch { }
        setAccessDenied(true)
        setAuthChecking(false)
        setLoginError("Ce compte Google n'est pas autorisé à accéder à l'application.")
        return
      }

      // Pas d'utilisateur authentifié → on DOIT afficher l'écran de connexion.
      if (!user) {
        if (unsubscribeRealtime) { unsubscribeRealtime(); unsubscribeRealtime = null }
        if (unsubscribeCards) { unsubscribeCards(); unsubscribeCards = null }
        stopRealtimeExpressions();
        // Hors-ligne, Firebase peut renvoyer « null » faute de pouvoir
        // rafraîchir la session : on reste sur les données locales.
        if (isOffline() && canRunLocally()) {
          startLocalMode('session non vérifiable hors-ligne')
          return
        }
        setAccessDenied(true)
        setAuthChecking(false)
        return
      }

      // ✅ Auth OK + utilisateur autorisé : on aligne le UID interne (vue isolée) et on démarre.
      setFbUser(user.uid)
      setAccessDenied(false)
      setAuthChecking(false)

      if (unsubscribeRealtime) unsubscribeRealtime();
      unsubscribeRealtime = listenToSyncSignal(user.uid, (data) => {
        // La signature distante voyage dans le document sentinelle : elle rend
        // la détection de divergence instantanée ET gratuite.
        if (data?.signature) setRemoteSignature(data.signature);
        console.info("[sync] Changement distant détecté → synchronisation.");
        forceSync('realtime');
      });

      // ⚡ TEMPS RÉEL FICHE PAR FICHE — c'est ce qui aligne le compteur
      // « fiches à réviser » entre le téléphone et le PC en une seconde,
      // sans réconciliation complète : Firestore ne facture que les fiches
      // réellement modifiées (3 fiches révisées = 3 lectures).
      if (unsubscribeCards) unsubscribeCards();
      unsubscribeCards = startRealtimeExpressions(user.uid);

      if (initStarted.current) {
        // Session retrouvée après un démarrage en mode local → on rattrape la synchro.
        forceSync('session-restaurée')
      } else {
        initStarted.current = true
        if (localStorage.getItem("memo_db_needs_reset") === "true") {
          try {
            await database.write(async () => {
              await database.unsafeResetDatabase();
            });
            localStorage.removeItem("memo_db_needs_reset");
            console.info("[db] Base locale réinitialisée pour le nouvel utilisateur.");
          } catch (e) {
            console.error("Erreur reset DB:", e);
          }
        }
        try { await migrateFromLocalStorage() } catch (e) { console.warn('Migration KO:', e) }
        // Récupération one-shot des révisions SM-2 orphelines (ancien onglet SRS)
        try { await migrateOrphanSRSData() } catch (e) { console.warn('Migration SRS→FSRS KO:', e) }
        if (cancelled) return
        // ⚡ Démarrage instantané : on affiche l'app tout de suite avec les données locales.
        // La sync Firestore (potentiellement lente : ~1 min sur mobile) tourne en arrière-plan
        // et un événement `cards_synced` rafraîchira l'UI dès que de nouvelles fiches arrivent.
        setDbReady(true)
        setTimeout(() => {
          // `true` = réconciliation complète autoritaire au démarrage : c'est ce
          // qui aligne un appareil resté en retard (fiches fantômes) sur le serveur.
          syncWithFirebase(true).catch((e) => console.warn('Sync init KO:', e))
        }, 0)
      }
    })

    // ── Anti-quota Firestore ─────────────────────────────────────────────
    // On coalesce tous les déclencheurs de sync (focus, visibility, pageshow,
    // online, sync_signal, interval, storage-update) derrière un throttle
    // partagé. Avant : chaque événement lançait une sync complète →
    // amplification massive de lectures Firestore → quota dépassé.
    const SYNC_PERIOD_MS = 5 * 60 * 1000 // interval de fond : 5 min
    const MIN_SYNC_GAP_MS = 5 * 1000     // au moins 5 s entre deux syncs (restaure le temps réel)
    let lastSyncAt = 0
    let pendingTimer = null
    const forceSync = (reason) => {
      if (navigator.onLine === false || !initStarted.current) return
      // Mode local sans session Firebase : rien à synchroniser pour l'instant.
      if (!auth.currentUser) return
      const now = Date.now()
      const wait = Math.max(0, MIN_SYNC_GAP_MS - (now - lastSyncAt))
      if (pendingTimer) return // déjà planifiée
      pendingTimer = setTimeout(() => {
        pendingTimer = null
        lastSyncAt = Date.now()
        syncWithFirebase()
          .then((changed) => console.info(`[sync] ${reason}${changed ? ' — fiches mises à jour' : ''}`))
          .catch((e) => console.warn('Sync KO:', e))
      }, wait)
    }

    // Réveil du PC / retour d'onglet / retour du réseau : on vérifie que
    // l'écoute temps réel est toujours vivante. Sans ça, un PC laissé ouvert
    // toute la nuit gardait une écoute morte et restait figé sur son ancien
    // compteur jusqu'au rechargement complet de la page.
    const reviveRealtime = () => {
      const uid = auth.currentUser?.uid
      if (uid && isAuthorizedUser(auth.currentUser)) ensureRealtimeExpressions(uid)
    }

    const handleSync = () => forceSync('storage-update')
    window.addEventListener('firebase_sync_updated', handleSync)

    const doSync = () => { reviveRealtime(); forceSync('auto') }
    const onVis = () => { if (document.visibilityState === 'visible') { reviveRealtime(); forceSync('visible') } }
    const onFocus = () => { reviveRealtime(); forceSync('focus') }
    const onPageShow = () => { reviveRealtime(); forceSync('pageshow') }
    // NB : on retire volontairement le sync sur `pagehide` — il doublait chaque
    //      cycle focus/blur et n'apportait aucune donnée fraîche.

    window.addEventListener('online', doSync)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVis)

    const interval = setInterval(doSync, SYNC_PERIOD_MS)

    return () => {
      cancelled = true
      clearTimeout(authWatchdog)
      unsubAuth()
      if (unsubscribeRealtime) unsubscribeRealtime();
      if (unsubscribeCards) unsubscribeCards();
      stopRealtimeExpressions();
      if (pendingTimer) clearTimeout(pendingTimer)
      window.removeEventListener('firebase_sync_updated', handleSync)
      window.removeEventListener('online', doSync)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(interval)
    }
  }, [])

  if (authChecking) {
    return <div style={{ color: 'white', display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit', sans-serif", fontSize: '18px' }}>🔐 Vérification de la sécurité…</div>
  }

  if (!dbReady && !accessDenied) {
    return <div style={{ color: 'white', display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit', sans-serif", fontSize: '18px' }}>🚀 Préparation de la base locale…</div>
  }

  if (accessDenied) {
    const handleLogin = async () => {
      setLoginError(null)
      try {
        const result = await startLogin()
        // Cas popup : on vérifie tout de suite. Cas redirect : la page recharge.
        if (result && result.user) {
          if (isAuthorizedUser(result.user)) {
            setFbUser(result.user.uid)
            window.location.reload()
          } else {
            try { await auth?.signOut() } catch { /* ignore */ }
            setLoginError("Ce compte Google n'est pas autorisé à accéder à l'application.")
          }
        }
      } catch (e) {
        console.error('Erreur de connexion', e)
        // Popup bloquée / annulée → fallback redirect.
        const code = e && e.code
        if (
          code === 'auth/popup-blocked' ||
          code === 'auth/popup-closed-by-user' ||
          code === 'auth/cancelled-popup-request' ||
          code === 'auth/operation-not-supported-in-this-environment'
        ) {
          try {
            if (!auth || !provider) throw new Error('Connexion indisponible')
            await signInWithRedirect(auth, provider)
            return
          } catch (e2) {
            console.error('Redirect KO:', e2)
            setLoginError(e2?.message || 'Erreur de connexion')
            return
          }
        }
        setLoginError(e?.message || 'Erreur de connexion')
      }
    }

    return (
      <div style={{
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Outfit', sans-serif",
        gap: '16px',
        background: '#0a0a0a',
        padding: '0 20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Connexion requise</div>
        <div style={{ fontSize: 14, color: '#888', marginBottom: '8px', maxWidth: 420 }}>
          Connectez-vous avec un compte Google autorisé pour accéder à vos fiches. Chaque compte autorisé dispose de son propre espace privé.
        </div>
        <button
          onClick={handleLogin}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: '#ffffff',
            color: '#000000',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <img src="https://www.google.com/favicon.ico" width="18" height="18" alt="Google" />
          Se connecter avec Google
        </button>
        {isOffline() && (
          <div style={{ color: '#FBBF24', fontSize: 13, maxWidth: 420 }}>
            Pas de connexion internet. La première connexion nécessite le réseau ; ensuite l'app fonctionne hors-ligne.
          </div>
        )}
        {loginError && (
          <div style={{ color: '#F87171', fontSize: 13, maxWidth: 420 }}>
            {loginError}
          </div>
        )}
      </div>
    )
  }

  return (
    <DatabaseProvider database={database}>
      <ErrorBoundary>
        <MemoMaster />
        {/* Widgets secondaires isolés : leur plantage ne doit jamais
            emporter l'application entière. */}
        <ErrorBoundary silent scope="OfflineBanner"><OfflineBanner /></ErrorBoundary>
        <ErrorBoundary silent scope="UpdatePrompt"><UpdatePrompt /></ErrorBoundary>
        <ErrorBoundary silent scope="BetaChat"><BetaChat /></ErrorBoundary>
      </ErrorBoundary>
    </DatabaseProvider>
  )
}

export default App
