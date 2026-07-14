import { database } from './index'
import { today } from '../../utils/dateUtils'

const MIGRATION_KEY = 'memomaitre_watermelondb_migrated'

let isMigrating = false

export async function migrateFromLocalStorage() {
  if (isMigrating) return
  if (localStorage.getItem(MIGRATION_KEY) === 'true') {
    return // Already migrated
  }
  isMigrating = true

  // Retrieve data from localStorage shards
  const LS_PREFIX = "memomaitre_"
  const key = "expressions_v3"
  
  let allExpressions = []
  try {
    const rawLocal = localStorage.getItem(LS_PREFIX + key)
    if (rawLocal) {
      allExpressions = JSON.parse(rawLocal)
    }
  } catch (err) {
    console.error('Migration failed to read localStorage', err)
  }

  try {
    if (allExpressions && allExpressions.length > 0) {
      console.info(`[Migration] Migrating ${allExpressions.length} expressions to WatermelonDB...`)
      
      const expressionsCollection = database.get('expressions')
      
      // Get existing IDs to avoid duplicate inserts if migration was interrupted or run concurrently
      const existingRecords = await expressionsCollection.query().fetch()
      const existingIds = new Set(existingRecords.map(r => r.id))
      
      await database.write(async () => {
        const batches = []
        for (const card of allExpressions) {
          const cardId = card.id || crypto.randomUUID()
          if (existingIds.has(cardId)) continue; // Skip existing
          
          batches.push(
            expressionsCollection.prepareCreate(exp => {
              exp._raw.id = cardId
              exp.front = card.front || ''
              exp.back = card.back || ''
              exp.example = card.example || ''
              exp.category = card.category || 'Général'
              exp.type = card.type || 'qa'
              exp.imageUrl = card.imageUrl || null
              exp.audioUrl = card.audioUrl || null
              exp.layers = card.layers || []
              exp.level = card.level || 0
              exp.nextReview = card.nextReview ? card.nextReview : today()
              exp.easeFactor = card.easeFactor || 2.5
              exp.interval = card.interval || 1
              exp.repetitions = card.repetitions || 0
              exp.reviewHistory = card.reviewHistory || []
              
              // Convert createdAt to number for WatermelonDB @date
              if (card.createdAt) {
                const dt = new Date(card.createdAt).getTime()
                if (!isNaN(dt)) exp._raw.created_at = dt
              }
            })
          )
        }
        
        // Batch execute in chunks of 500 to avoid locking
        const CHUNK_SIZE = 500
        for (let i = 0; i < batches.length; i += CHUNK_SIZE) {
          await database.batch(...batches.slice(i, i + CHUNK_SIZE))
        }
      })
      console.info(`[Migration] Done migrating expressions to WatermelonDB.`)
    }

    localStorage.setItem(MIGRATION_KEY, 'true')
    // Nettoyage de l'ancienne clé pour libérer les 5 Mo de quota (Demandé par l'utilisateur)
    localStorage.removeItem(LS_PREFIX + key)
    localStorage.removeItem(LS_PREFIX + key + "_ts")
    localStorage.removeItem(LS_PREFIX + key + "_dirty")
  } catch (err) {
    console.error('[Migration] Failed during WatermelonDB insertion:', err)
  } finally {
    isMigrating = false
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// migrateOrphanSRSData — récupère les révisions faites via l'ancien onglet SRS
// (SM-2, store séparé "srs_data_v1") qui n'auraient PAS d'entrée équivalente
// dans expression.reviewHistory. Ne touche NI interval NI nextReview des fiches
// (on ne rejoue pas un scheduling FSRS rétroactif fictif — on préserve
// uniquement l'historique brut pour les stats).
//
// Idempotent : protégée par la clé 'migrated_srs_v1_done'.
// ══════════════════════════════════════════════════════════════════════════════

const ORPHAN_SRS_MIGRATION_KEY = 'migrated_srs_v1_done'
const SRS_LEGACY_LS_KEY = 'memomaitre_srs_data_v1'  // = LS_PREFIX + "srs_data_v1"

// Convert SM-2 score (0..5) → FSRS q (0/1/3/5) pour uniformiser reviewHistory.
function sm2ScoreToQ(score) {
  if (typeof score !== 'number') return 3
  if (score <= 0) return 0
  if (score <= 2) return 1
  if (score <= 4) return 3
  return 5
}

export async function migrateOrphanSRSData() {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(ORPHAN_SRS_MIGRATION_KEY) === 'true') return

  let srsStore
  try {
    const raw = localStorage.getItem(SRS_LEGACY_LS_KEY)
    if (!raw) {
      // Rien à migrer — on marque quand même pour ne pas re-scanner à chaque boot
      localStorage.setItem(ORPHAN_SRS_MIGRATION_KEY, 'true')
      console.info('[Migration SRS→FSRS] Aucun store srs_data_v1 trouvé, rien à migrer.')
      return
    }
    srsStore = JSON.parse(raw)
  } catch (e) {
    console.warn('[Migration SRS→FSRS] Lecture srs_data_v1 impossible :', e)
    return
  }

  if (!srsStore || typeof srsStore !== 'object') {
    localStorage.setItem(ORPHAN_SRS_MIGRATION_KEY, 'true')
    return
  }

  const cardIds = Object.keys(srsStore)
  if (cardIds.length === 0) {
    localStorage.setItem(ORPHAN_SRS_MIGRATION_KEY, 'true')
    console.info('[Migration SRS→FSRS] Store srs_data_v1 vide.')
    return
  }

  const collection = database.get('expressions')
  let cardsTouched = 0
  let entriesMigrated = 0

  try {
    await database.write(async () => {
      for (const cardId of cardIds) {
        const legacy = srsStore[cardId]
        if (!legacy || !Array.isArray(legacy.history) || legacy.history.length === 0) continue

        // Récupérer la fiche depuis WatermelonDB
        let record
        try {
          record = await collection.find(cardId)
        } catch {
          // La fiche n'existe plus → on ignore silencieusement
          continue
        }

        const currentHistory = Array.isArray(record.reviewHistory) ? record.reviewHistory : []
        // Index des dates déjà présentes dans reviewHistory (peu importe la source)
        const knownDates = new Set(currentHistory.map(h => h && h.date).filter(Boolean))

        const missing = legacy.history
          .filter(h => h && h.date && !knownDates.has(h.date))
          .map(h => ({
            date: h.date,
            q: sm2ScoreToQ(h.score),
            newLevel: null,                    // inconnu depuis SM-2
            interval: typeof h.interval === 'number' ? h.interval : 1,
            migratedFromSM2: true,
          }))

        if (missing.length === 0) continue

        const merged = [...currentHistory, ...missing]
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

        await record.update(exp => {
          exp.reviewHistory = merged
          // NE PAS toucher : interval, nextReview, stability, difficulty, level
        })

        cardsTouched += 1
        entriesMigrated += missing.length
      }
    })

    // Nettoyage de la clé legacy — plus aucun consommateur (SRSEngine renommé en .legacy.js)
    try { localStorage.removeItem(SRS_LEGACY_LS_KEY) } catch {}
    localStorage.setItem(ORPHAN_SRS_MIGRATION_KEY, 'true')
    console.info(
      `[Migration SRS→FSRS] Terminée : ${cardsTouched} fiche(s) enrichie(s), ` +
      `${entriesMigrated} révision(s) SM-2 orphelin(es) fusionnée(s) dans reviewHistory. ` +
      `(interval/nextReview inchangés — historique brut préservé pour les stats)`
    )
  } catch (err) {
    console.error('[Migration SRS→FSRS] Échec :', err)
    // On NE marque PAS la clé → nouvelle tentative au prochain démarrage
  }
}
