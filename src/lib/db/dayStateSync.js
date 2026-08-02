// src/lib/db/dayStateSync.js
//
// ═══════════════════════════════════════════════════════════════════════════
// TEMPS RÉEL DU COMPTEUR « fiches à réviser » — 1 document, 1 écoute
// ═══════════════════════════════════════════════════════════════════════════
//
// Le nombre affiché est dérivé du PLAN DU JOUR. Ce plan vivait dans le
// localStorage de chaque appareil → deux appareils = deux compteurs. Ici on le
// partage via UN SEUL document Firestore par jour :
//
//     users/{uid}/day_state/{YYYY-MM-DD}
//     { sealedAt, target, ids[], doneIds[], bonusIds[], admittedIds[] }
//
// COÛT FIRESTORE (volontairement minuscule) :
//   • Écoute      : 1 document. Chaque révision sur l'autre appareil = 1 lecture.
//     Une journée de 40 révisions ≈ 40 lectures, contre plusieurs centaines
//     pour une réconciliation complète des fiches.
//   • Écriture    : regroupée (debounce 800 ms) → une salve de révisions
//     rapides ne coûte qu'une seule écriture.
//   • Hors ligne  : les écritures sont mises en file par Firestore et les
//     `doneIds` sont fusionnés par UNION (arrayUnion) → aucune révision perdue,
//     aucun écrasement entre appareils.

import { doc, onSnapshot, setDoc, getDoc, arrayUnion } from 'firebase/firestore'
import { db as firestoreDb, reportFirestoreError } from '../firebase'
import { mergeDayState, normalizeDayState } from '../dayStateMerge'

const DEBOUNCE_MS = 800

const dayDocRef = (uid, dateISO) => doc(firestoreDb, 'users', uid, 'day_state', dateISO)

/** Identifiant d'appareil stable (débogage multi-appareils). */
function deviceId() {
  try {
    let id = localStorage.getItem('memo_device_id')
    if (!id) {
      id = Math.random().toString(36).slice(2, 10)
      localStorage.setItem('memo_device_id', id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

/**
 * Écoute l'état du jour en temps réel.
 *
 * ⚠️ On ne filtre PAS sur `snapshot.metadata.hasPendingWrites` : c'était l'un
 * des bugs des écoutes existantes. Quand l'appareil a une écriture en attente,
 * Firestore marque TOUT l'instantané comme « pending » — y compris les
 * changements venus de l'autre appareil, qui étaient donc jetés et ne
 * revenaient jamais. La fusion étant une union idempotente, réappliquer notre
 * propre écriture est inoffensif.
 *
 * @returns {() => void} fonction d'arrêt.
 */
export function subscribeDayState(uid, dateISO, onRemote) {
  if (!uid || !dateISO || typeof onRemote !== 'function') return () => {}

  return onSnapshot(
    dayDocRef(uid, dateISO),
    { includeMetadataChanges: false },
    (snap) => {
      if (!snap.exists()) return
      onRemote(normalizeDayState({ ...snap.data(), date: dateISO }, dateISO))
    },
    (err) => reportFirestoreError(err, 'subscribeDayState'),
  )
}

/** Lecture ponctuelle (au démarrage, avant que l'écoute ne soit établie). */
export async function fetchDayState(uid, dateISO) {
  if (!uid || !dateISO) return null
  try {
    const snap = await getDoc(dayDocRef(uid, dateISO))
    if (!snap.exists()) return null
    return normalizeDayState({ ...snap.data(), date: dateISO }, dateISO)
  } catch (err) {
    reportFirestoreError(err, 'fetchDayState')
    return null
  }
}

// ─── Publication groupée ─────────────────────────────────────────────────────
let pendingTimer = null
let pendingState = null
let pendingKey = null

async function flushDayState() {
  pendingTimer = null
  const state = pendingState
  const key = pendingKey
  pendingState = null
  pendingKey = null
  if (!state || !key) return

  const [uid, dateISO] = key.split('|')
  // ⚠️ `arrayUnion()` sans argument lève une exception Firestore : un tableau
  // vide doit être écrit tel quel (c'est le cas au tout premier scellement,
  // quand aucune fiche n'a encore été révisée).
  const union = (list) => (list.length > 0 ? arrayUnion(...list) : [])
  try {
    await setDoc(
      dayDocRef(uid, dateISO),
      {
        date: dateISO,
        sealedAt: state.sealedAt ?? Date.now(),
        target: state.target === undefined ? null : state.target,
        ids: state.ids,
        // Union : deux appareils qui révisent en parallèle ne s'écrasent jamais.
        doneIds: union(state.doneIds),
        bonusIds: union(state.bonusIds),
        admittedIds: union(state.admittedIds),
        updatedAt: Date.now(),
        device: deviceId(),
      },
      { merge: true },
    )
  } catch (err) {
    reportFirestoreError(err, 'publishDayState')
  }
}

/**
 * Publie l'état du jour (groupé). Les appels successifs sont fusionnés entre
 * eux avant l'envoi, donc 10 révisions en 5 secondes = 1 seule écriture.
 */
export function publishDayState(uid, dateISO, state) {
  if (!uid || !dateISO || !state) return
  const key = `${uid}|${dateISO}`
  if (pendingKey && pendingKey !== key) {
    // Changement de jour en cours de route : on envoie l'état précédent d'abord.
    if (pendingTimer) clearTimeout(pendingTimer)
    flushDayState()
  }
  pendingKey = key
  pendingState = pendingState ? mergeDayState(pendingState, state) : normalizeDayState(state, dateISO)
  if (pendingTimer) return
  pendingTimer = setTimeout(flushDayState, DEBOUNCE_MS)
}

/** Force l'envoi immédiat (fermeture d'onglet, passage en arrière-plan). */
export function flushDayStateNow() {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  return flushDayState()
}
