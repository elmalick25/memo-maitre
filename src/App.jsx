import { Suspense, lazy, useEffect, useState, useRef } from 'react'
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider'
import { database } from './lib/db'
import { migrateFromLocalStorage } from './lib/db/migration'
import { syncWithFirebase } from './lib/db/sync'
import { auth, provider, setFbUser } from './lib/firebase'
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
} from 'firebase/auth'
const MemoMaster = lazy(() => import('./MemoMaster'))
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

async function startLogin() {
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
        setLoginError(e?.message || 'Erreur de connexion après redirection')
      })

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return

      // Utilisateur connecté mais NON autorisé (ni propriétaire, ni bêta-testeur) → refus.
      if (user && !isAuthorizedUser(user)) {
        try { await auth.signOut() } catch { }
        setAccessDenied(true)
        setAuthChecking(false)
        setLoginError("Ce compte Google n'est pas autorisé à accéder à l'application.")
        return
      }

      // Pas d'utilisateur authentifié → on DOIT afficher l'écran de connexion.
      // (Sinon la sync Firestore échoue silencieusement faute de token d'auth
      // et l'utilisateur voit "0 fiche" sur mobile, alors qu'il en a 174 sur PC.)
      if (!user) {
        setAccessDenied(true)
        setAuthChecking(false)
        return
      }

      // ✅ Auth OK + utilisateur autorisé : on aligne le UID interne (vue isolée) et on démarre.
      setFbUser(user.uid)
      setAccessDenied(false)
      setAuthChecking(false)

      if (!initStarted.current) {
        initStarted.current = true
        try { await migrateFromLocalStorage() } catch (e) { console.warn('Migration KO:', e) }
        try { await syncWithFirebase() } catch (e) { console.warn('Sync init KO:', e) }
        if (cancelled) return
        setDbReady(true)
      }
    })

    const SYNC_PERIOD_MS = 60 * 1000
    const forceSync = (reason) => {
      if (navigator.onLine === false || !initStarted.current) return
      syncWithFirebase()
        .then((changed) => console.info(`[sync] ${reason}${changed ? ' — fiches mises à jour' : ''}`))
        .catch((e) => console.warn('Sync KO:', e))
    }

    const handleSync = () => forceSync('storage-update')
    window.addEventListener('firebase_sync_updated', handleSync)

    const doSync = () => forceSync('auto')
    const onVis = () => { if (document.visibilityState === 'visible') forceSync('visible') }
    const onFocus = () => forceSync('focus')
    const onPageShow = () => forceSync('pageshow')
    const onPageHide = () => forceSync('pagehide')

    window.addEventListener('online', doSync)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVis)

    const interval = setInterval(doSync, SYNC_PERIOD_MS)

    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener('firebase_sync_updated', handleSync)
      window.removeEventListener('online', doSync)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('pagehide', onPageHide)
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
            await auth.signOut()
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
        <Suspense fallback={<div style={{ color: 'white', display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit', sans-serif", fontSize: '18px' }}>🚀 Chargement de l'interface principale…</div>}>
          <MemoMaster />
        </Suspense>
        <OfflineBanner />
        <UpdatePrompt />
        <BetaChat />
      </ErrorBoundary>
    </DatabaseProvider>
  )
}

export default App
