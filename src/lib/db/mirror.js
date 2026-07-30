import { database } from './index'
import { Q } from '@nozbe/watermelondb'
import { normalizeDate, today } from '../../utils/dateUtils'

let mirrorMap = new Map()
let isInitialLoad = true

const mapRecordToCard = (r) => ({
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
  reviewHistory: r.reviewHistory,
  // FIX : ces champs existaient déjà en base (colonnes créées) mais n'étaient
  // jamais relus ici → toujours réinitialisés au reload (paused revenait à
  // false, masteryStage/productiveUses revenaient à leur valeur par défaut).
  paused: !!r.paused,
  masteryStage: r.masteryStage || undefined,
  productiveUses: r.productiveUses || [],
  lastProductiveUseAt: r.lastProductiveUseAt || null,
})

// requestIdleCallback n'existe pas sur Safari/iOS → fallback setTimeout.
const idle = (typeof window !== 'undefined' && window.requestIdleCallback)
  ? window.requestIdleCallback
  : (cb) => setTimeout(() => cb({ timeRemaining: () => 8 }), 0)

// Mappe les enregistrements par petits paquets, en cédant la main entre
// chaque paquet, pour ne jamais bloquer le thread principal d'un coup même
// sur une collection de plusieurs centaines de fiches.
function mapRecordsInChunks(records, chunkSize = 80) {
  return new Promise((resolve) => {
    const out = new Array(records.length)
    let i = 0
    const step = () => {
      const end = Math.min(i + chunkSize, records.length)
      for (; i < end; i++) out[i] = mapRecordToCard(records[i])
      if (i < records.length) idle(step)
      else resolve(out)
    }
    step()
  })
}

export async function loadInitialExpressionsFromWatermelon() {
  const collection = database.get('expressions')
  const records = await collection.query().fetch()

  const mapped = records.length > 80
    ? await mapRecordsInChunks(records)
    : records.map(mapRecordToCard)

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
  // FIX : mêmes champs que ci-dessus, côté écriture — sans ça, une fiche mise
  // en pause n'était jamais écrite en base et redevenait active au reload.
  exp.paused = !!card.paused
  exp.masteryStage = card.masteryStage || 'discovered'
  exp.productiveUses = card.productiveUses || []
  exp.lastProductiveUseAt = card.lastProductiveUseAt || null

  if (card.createdAt) {
    const dt = new Date(card.createdAt).getTime()
    if (!isNaN(dt)) exp._raw.created_at = dt
  } else if (!exp._raw.created_at) {
    exp._raw.created_at = Date.now()
  }

  // Update updated_at to ensure sync engine picks up the change for Firebase
  exp._raw.updated_at = Date.now()
}

const isCardDifferent = (oldCard, newCard) => {
  const fields = ['front', 'back', 'example', 'category', 'type', 'imageUrl', 'audioUrl', 'level', 'nextReview', 'easeFactor', 'interval', 'repetitions', 'masteryStage', 'lastProductiveUseAt'];
  for (const f of fields) {
    if (oldCard[f] !== newCard[f]) return true;
  }
  // FIX : "paused" était absent de cette comparaison → un simple changement de
  // pause ne déclenchait jamais d'écriture en base ni de sync (perte silencieuse).
  if (!!oldCard.paused !== !!newCard.paused) return true;
  if (JSON.stringify(oldCard.layers || []) !== JSON.stringify(newCard.layers || [])) return true;
  if (JSON.stringify(oldCard.reviewHistory || []) !== JSON.stringify(newCard.reviewHistory || [])) return true;
  if (JSON.stringify(oldCard.productiveUses || []) !== JSON.stringify(newCard.productiveUses || [])) return true;
  return false;
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
    } else if (isCardDifferent(oldCard, newCard)) {
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
