import { database } from './index'
import { Q } from '@nozbe/watermelondb'
import { normalizeDate, today } from '../../utils/dateUtils'

let mirrorMap = new Map()
let isInitialLoad = true

export async function loadInitialExpressionsFromWatermelon() {
  const collection = database.get('expressions')
  const records = await collection.query().fetch()
  
  const mapped = records.map(r => ({
    id: r.id,
    front: r.front,
    back: r.back,
    example: r.example,
    category: r.category,
    type: r.type,
    imageUrl: r.imageUrl,
    audioUrl: r.audioUrl,
    layers: r.layers,
    level: r.level,
    nextReview: r.nextReview ? normalizeDate(r.nextReview) : null,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    easeFactor: r.easeFactor,
    interval: r.interval,
    repetitions: r.repetitions,
    reviewHistory: r.reviewHistory
  }))

  mirrorMap = new Map(mapped.map(c => [c.id, c]))
  isInitialLoad = false
  return mapped
}

const mapCardToRecord = (card, exp) => {
  exp._raw.id = card.id
  exp.front = card.front || ''
  exp.back = card.back || ''
  exp.example = card.example || ''
  exp.category = card.category || 'Général'
  exp.type = card.type || 'qa'
  exp.imageUrl = card.imageUrl || null
  exp.audioUrl = card.audioUrl || null
  exp.layers = card.layers || []
  exp.level = card.level || 0
  exp.nextReview = card.nextReview ? normalizeDate(card.nextReview) : today()
  exp.easeFactor = card.easeFactor || 2.5
  exp.interval = card.interval || 1
  exp.repetitions = card.repetitions || 0
  exp.reviewHistory = card.reviewHistory || []
  
  if (card.createdAt) {
    const dt = new Date(card.createdAt).getTime()
    if (!isNaN(dt)) exp._raw.created_at = dt
  }
}

export async function mirrorToWatermelon(newArray) {
  if (isInitialLoad) return // Don't mirror before loading

  const collection = database.get('expressions')
  const newMap = new Map(newArray.map(c => [c.id, c]))
  
  const toCreate = []
  const toUpdate = []
  const toDelete = []

  for (const [id, newCard] of newMap.entries()) {
    const oldCard = mirrorMap.get(id)
    if (!oldCard) {
      toCreate.push(newCard)
    } else if (JSON.stringify(oldCard) !== JSON.stringify(newCard)) {
      toUpdate.push(newCard)
    }
  }

  for (const id of mirrorMap.keys()) {
    if (!newMap.has(id)) {
      toDelete.push(id)
    }
  }

  // 🛡️ SÉCURITÉ ANTI-CATASTROPHE (Fix pour le bug de suppression massive)
  // Si le script essaie de supprimer TOUTES les fiches d'un coup (et qu'il y en a plus de 5),
  // c'est à 99% un bug d'état React (tableau vide envoyé au miroir). On bloque l'action.
  if (toDelete.length > 0 && toDelete.length === mirrorMap.size && mirrorMap.size > 5) {
    if (window.__EXPLICIT_CLEAR_ALL__) {
      window.__EXPLICIT_CLEAR_ALL__ = false; // consume the flag
    } else {
      console.error("⚠️ BLOCAGE DE SÉCURITÉ : Tentative de suppression de TOUTES les fiches détectée. Action annulée pour protéger vos données.");
      return;
    }
  }

  if (toCreate.length || toUpdate.length || toDelete.length) {
    try {
      await database.write(async () => {
        const batches = []
        
        // Creates
        for (const card of toCreate) {
          batches.push(collection.prepareCreate(exp => mapCardToRecord(card, exp)))
        }
        
        // Updates
        if (toUpdate.length > 0) {
          const ids = toUpdate.map(c => c.id)
          // Fetch in chunks to avoid URL too long issues if thousands
          const recordsToUpdate = await collection.query(Q.where('id', Q.oneOf(ids))).fetch()
          for (const record of recordsToUpdate) {
            const card = newMap.get(record.id)
            if (card) {
              batches.push(record.prepareUpdate(exp => mapCardToRecord(card, exp)))
            }
          }
        }
        
        // Deletes (mark as deleted)
        if (toDelete.length > 0) {
          const recordsToDelete = await collection.query(Q.where('id', Q.oneOf(toDelete))).fetch()
          for (const record of recordsToDelete) {
            batches.push(record.prepareMarkAsDeleted()) // Important pour la synchro Firebase
          }
        }
        
        if (batches.length > 0) {
          // Splitting into chunks of 500
          const CHUNK_SIZE = 500
          for (let i = 0; i < batches.length; i += CHUNK_SIZE) {
            await database.batch(...batches.slice(i, i + CHUNK_SIZE))
          }
        }
      })
      
      // Update mirror map only on success
      mirrorMap = newMap
    } catch (err) {
      console.error("[Watermelon Mirror] Sync failed:", err)
    }
  }
}
