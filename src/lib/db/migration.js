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
