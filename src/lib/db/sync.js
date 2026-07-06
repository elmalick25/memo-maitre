import { synchronize } from '@nozbe/watermelondb/sync'
import { database } from './index'
import { db as firestoreDb, getFbUser } from '../firebase'
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore'
import { normalizeDate } from '../../utils/dateUtils'
import { logEvent } from '../telemetry'
let isSyncing = false
let rerunRequested = false
let hasReconciledThisSession = false

const expressionsPath = (uid) => `users/${uid}/expressions`
const toMs = (value, fallback = Date.now()) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()
  if (value && typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}
const safeArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  return []
}
const stripUndefined = (value) => JSON.parse(JSON.stringify(value))

export async function pushExpressionsToFirebase() {
  const uid = getFbUser()
  const OWNER_UID = import.meta.env.VITE_OWNER_UID
  if (!uid || uid !== OWNER_UID) return

  const expressionsRef = collection(firestoreDb, `users/${uid}/expressions`)
  const q = query(expressionsRef)
  const existingDocs = await getDocs(q)
  const existingIds = new Set()
  existingDocs.forEach(doc => existingIds.add(doc.id))

  const collectionLocal = database.collections.get('expressions')
  const allRecords = await collectionLocal.query().fetch()

  const batch = writeBatch(firestoreDb)
  let count = 0

  for (const record of allRecords) {
    if (!existingIds.has(record.id)) {
      const docRef = doc(firestoreDb, `users/${uid}/expressions`, record.id)
      batch.set(docRef, {
        front: record.front,
        back: record.back,
        nextReview: record.nextReview,
        level: record.level,
        consecutiveCorrect: record.consecutiveCorrect,
        tags: record.tags,
        updatedAt: record.updatedAt || Date.now()
      })
      count++
    }
  }

  if (count > 0) {
    await batch.commit()
    console.info(`[sync] ${count} fiches poussées vers Firebase`)
  }
}

export async function forceResetSync() {
  if (window.confirm("Voulez-vous vraiment réinitialiser la base locale ? Cela va tout retélécharger depuis le serveur.")) {
    try {
      await database.write(async () => {
        await database.unsafeResetDatabase();
      });
      alert("Base locale réinitialisée. L'application va redémarrer.");
      window.location.reload();
    } catch (e) {
      console.error("Erreur lors de la réinitialisation :", e);
      logEvent("sync:fail", { context: "forceResetSync", error: e?.message || String(e) });
      alert("Erreur lors de la réinitialisation.");
    }
  }
}

export async function syncWithFirebase(forceReconcile = false) {
  const uid = getFbUser()
  const OWNER_UID = import.meta.env.VITE_OWNER_UID
  if (!uid || uid !== OWNER_UID) return false
  if (isSyncing) {
    rerunRequested = true
    return false
  }
  isSyncing = true
  let localChanged = false

  try {
    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt }) => {
        const q = lastPulledAt
          ? query(collection(firestoreDb, expressionsPath(uid)), where('updatedAt', '>', lastPulledAt))
          : collection(firestoreDb, expressionsPath(uid))

        const snapshot = await getDocs(q)
        const created = []
        const updated = []
        const deleted = []
        const localIds = await database.collections.get('expressions').query().fetchIds()
        const existingIds = new Set(localIds)

        snapshot.forEach(docSnap => {
          const data = docSnap.data() || {}
          if (data._deleted) {
            if (existingIds.has(docSnap.id)) deleted.push(docSnap.id)
            return
          }

          const record = firebaseDocToRaw(docSnap)
          if (existingIds.has(docSnap.id)) updated.push(record)
          else created.push(record)
        })

        if (created.length || updated.length || deleted.length) localChanged = true
        return { changes: { expressions: { created, updated, deleted } }, timestamp: Date.now() }
      },
      pushChanges: async ({ changes }) => {
        const writes = []
        const expressionsChanges = changes.expressions
        if (expressionsChanges) {
          expressionsChanges.created.forEach(record => writes.push({ id: record.id, data: { ...rawToCamelCase(record), _deleted: false } }))
          expressionsChanges.updated.forEach(record => writes.push({ id: record.id, data: { ...rawToCamelCase(record), _deleted: false }, merge: true }))
          expressionsChanges.deleted.forEach(id => writes.push({ id, data: { _deleted: true, updatedAt: Date.now() }, merge: true }))
        }
        await commitExpressionWrites(uid, writes)
      },
    })

    // On ne lance la réconciliation complète qu'une seule fois par session pour économiser les lectures Firestore
    if (!hasReconciledThisSession || forceReconcile) {
      localChanged = (await reconcileAllExpressions(uid)) || localChanged
      hasReconciledThisSession = true
    }
  } catch (err) {
    console.error('Sync failed:', err)
    logEvent("sync:fail", { context: "syncWithFirebase", error: err?.message || String(err) });
  } finally {
    isSyncing = false
  }

  if (localChanged && typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('cards_synced')) } catch (_) { }
  }
  if (rerunRequested) {
    rerunRequested = false
    setTimeout(() => syncWithFirebase().catch(err => {
      console.warn('Follow-up sync KO:', err);
      logEvent("sync:fail", { context: "syncWithFirebase_followup", error: err?.message || String(err) });
    }), 250)
  }
  return localChanged
}

async function reconcileAllExpressions(uid) {
  const OWNER_UID = import.meta.env.VITE_OWNER_UID
  if (OWNER_UID && uid !== OWNER_UID) {
    console.warn('[sync] reconcile bloqué : UID non autorisé')
    return false
  }

  const expressions = database.collections.get('expressions')
  const [localRecords, remoteSnap] = await Promise.all([
    expressions.query().fetch(),
    getDocs(collection(firestoreDb, expressionsPath(uid))),
  ])

  const localById = new Map(localRecords.map(record => [record.id, record]))
  const remoteIds = new Set()
  const localOps = []
  const remoteWrites = []

  remoteSnap.forEach(docSnap => {
    const data = docSnap.data() || {}
    const id = docSnap.id
    remoteIds.add(id)
    const local = localById.get(id)

    if (data._deleted) {
      if (local) localOps.push(local.prepareMarkAsDeleted())
      return
    }

    const raw = firebaseDocToRaw(docSnap)
    if (!local) {
      localOps.push(expressions.prepareCreate(exp => applyRawToExpression(exp, raw)))
      return
    }

    const remoteUpdated = toMs(data.updatedAt, 0)
    const localUpdated = toMs(local.updatedAt ?? local._raw?.updated_at, 0)
    if (remoteUpdated > localUpdated + 1000) {
      localOps.push(local.prepareUpdate(exp => applyRawToExpression(exp, raw)))
    } else if (localUpdated > remoteUpdated + 1000) {
      remoteWrites.push({ id, data: { ...recordToFirestore(local), _deleted: false }, merge: true })
    }
  })

  localRecords.forEach(local => {
    if (!remoteIds.has(local.id)) {
      remoteWrites.push({ id: local.id, data: { ...recordToFirestore(local), _deleted: false }, merge: true })
    }
  })

  if (localOps.length) {
    await database.write(async () => {
      for (let i = 0; i < localOps.length; i += 450) {
        await database.batch(...localOps.slice(i, i + 450))
      }
    })
  }
  await commitExpressionWrites(uid, remoteWrites)
  return localOps.length > 0
}

async function commitExpressionWrites(uid, writes) {
  const clean = writes.filter(w => w?.id && w.data)
  for (let i = 0; i < clean.length; i += 450) {
    const batch = writeBatch(firestoreDb)
    clean.slice(i, i + 450).forEach(({ id, data, merge }) => {
      const ref = doc(firestoreDb, expressionsPath(uid), id)
      if (merge) batch.set(ref, stripUndefined(data), { merge: true })
      else batch.set(ref, stripUndefined(data))
    })
    await batch.commit()
  }
}

function firebaseDocToRaw(docSnap) {
  const data = docSnap.data() || {}
  const updatedAt = toMs(data.updatedAt, Date.now())
  return {
    id: docSnap.id,
    front: data.front || '',
    back: data.back || '',
    example: data.example || '',
    category: data.category || 'Général',
    type: data.type || 'qa',
    image_url: data.imageUrl || null,
    audio_url: data.audioUrl || null,
    audio_id: data.audioId || null,  // NEW v2
    layers: JSON.stringify(safeArray(data.layers)),
    level: Number(data.level || 0),
    next_review: data.nextReview ? normalizeDate(data.nextReview) : null,
    created_at: toMs(data.createdAt, updatedAt),
    updated_at: updatedAt,
    ease_factor: Number(data.easeFactor || 2.5),
    interval: Number(data.interval || 1),
    repetitions: Number(data.repetitions || 0),
    review_history: JSON.stringify(safeArray(data.reviewHistory)),
  }
}

function applyRawToExpression(exp, raw) {
  exp._raw.id = raw.id
  exp.front = raw.front || ''
  exp.back = raw.back || ''
  exp.example = raw.example || ''
  exp.category = raw.category || 'Général'
  exp.type = raw.type || 'qa'
  exp.imageUrl = raw.image_url || null
  exp.audioUrl = raw.audio_url || null
  exp.audioId = raw.audio_id || null  // NEW v2
  exp.layers = safeArray(raw.layers)
  exp.level = Number(raw.level || 0)
  exp.nextReview = raw.next_review ? normalizeDate(raw.next_review) : null
  exp.easeFactor = Number(raw.ease_factor || 2.5)
  exp.interval = Number(raw.interval || 1)
  exp.repetitions = Number(raw.repetitions || 0)
  exp.reviewHistory = safeArray(raw.review_history)
  exp._raw.created_at = toMs(raw.created_at)
  exp._raw.updated_at = toMs(raw.updated_at)
}

function recordToFirestore(record) {
  return {
    front: record.front || '',
    back: record.back || '',
    example: record.example || '',
    category: record.category || 'Général',
    type: record.type || 'qa',
    imageUrl: record.imageUrl || null,
    audioUrl: record.audioUrl || null,
    audioId: record.audioId || null,  // NEW v2
    layers: safeArray(record.layers),
    level: Number(record.level || 0),
    nextReview: record.nextReview ? normalizeDate(record.nextReview) : null,
    createdAt: toMs(record.createdAt ?? record._raw?.created_at),
    updatedAt: toMs(record.updatedAt ?? record._raw?.updated_at),
    easeFactor: Number(record.easeFactor || 2.5),
    interval: Number(record.interval || 1),
    repetitions: Number(record.repetitions || 0),
    reviewHistory: safeArray(record.reviewHistory),
  }
}

function rawToCamelCase(record) {
  return {
    front: record.front || '',
    back: record.back || '',
    example: record.example || '',
    category: record.category || 'Général',
    type: record.type || 'qa',
    imageUrl: record.image_url || null,
    audioUrl: record.audio_url || null,
    audioId: record.audio_id || null,  // NEW v2
    layers: safeArray(record.layers),
    level: Number(record.level || 0),
    nextReview: record.next_review ? normalizeDate(record.next_review) : null,
    createdAt: toMs(record.created_at),
    updatedAt: toMs(record.updated_at),
    easeFactor: Number(record.ease_factor || 2.5),
    interval: Number(record.interval || 1),
    repetitions: Number(record.repetitions || 0),
    reviewHistory: safeArray(record.review_history),
  }
}
