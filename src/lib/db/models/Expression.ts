import { Model } from '@nozbe/watermelondb'

// ⚠️ IMPORTANT — Pas de décorateurs ici (@field / @json / @date).
// Les décorateurs "legacy" de WatermelonDB ne sont PAS transpilés par esbuild /
// Rollup dans une build Vite standard : le bundle final contenait littéralement
// `@((0,field)("front")) front;`, ce qui est du JS invalide → le navigateur
// lançait "SyntaxError: Invalid or unexpected token" au chargement du tout
// premier chunk, donc écran blanc TOTAL de l'application (aucun composant monté).
// On utilise donc l'API publique équivalente `_getRaw` / `_setRaw`, qui produit
// exactement le même comportement sans dépendre d'une transpilation spéciale.

const sanitizeJson = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || raw.length === 0) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const toTimestamp = (raw: unknown): Date | null => {
  if (raw === null || raw === undefined) return null
  const time = typeof raw === 'number' ? raw : Date.parse(String(raw))
  return Number.isFinite(time) ? new Date(time) : null
}

export default class Expression extends Model {
  static table = 'expressions'

  get front() { return this._getRaw('front') }
  set front(value) { this._setRaw('front', value) }

  get back() { return this._getRaw('back') }
  set back(value) { this._setRaw('back', value) }

  get example() { return this._getRaw('example') }
  set example(value) { this._setRaw('example', value) }

  get category() { return this._getRaw('category') }
  set category(value) { this._setRaw('category', value) }

  get type() { return this._getRaw('type') }
  set type(value) { this._setRaw('type', value) }

  get imageUrl() { return this._getRaw('image_url') }
  set imageUrl(value) { this._setRaw('image_url', value) }

  get audioUrl() { return this._getRaw('audio_url') }
  set audioUrl(value) { this._setRaw('audio_url', value) }

  get audioId() { return this._getRaw('audio_id') }
  set audioId(value) { this._setRaw('audio_id', value) }

  get layers() { return sanitizeJson(this._getRaw('layers')) }
  set layers(value) { this._setRaw('layers', JSON.stringify(Array.isArray(value) ? value : [])) }

  get level() { return this._getRaw('level') }
  set level(value) { this._setRaw('level', value) }

  get nextReview() { return this._getRaw('next_review') }
  set nextReview(value) { this._setRaw('next_review', value) }

  // createdAt / updatedAt : lecture seule (équivalent @readonly @date)
  get createdAt() { return toTimestamp(this._getRaw('created_at')) }
  get updatedAt() { return toTimestamp(this._getRaw('updated_at')) }

  get easeFactor() { return this._getRaw('ease_factor') }
  set easeFactor(value) { this._setRaw('ease_factor', value) }

  get interval() { return this._getRaw('interval') }
  set interval(value) { this._setRaw('interval', value) }

  get repetitions() { return this._getRaw('repetitions') }
  set repetitions(value) { this._setRaw('repetitions', value) }

  get reviewHistory() { return sanitizeJson(this._getRaw('review_history')) }
  set reviewHistory(value) {
    this._setRaw('review_history', JSON.stringify(Array.isArray(value) ? value : []))
  }

  // ── Production active (Phase 1) ────────────────────────────────────────────
  // masteryStage : "discovered" | "recognized" | "recalled" | "produced" | "mastered"
  get masteryStage() { return this._getRaw('mastery_stage') }
  set masteryStage(value) { this._setRaw('mastery_stage', value) }

  // productiveUses : [{ date, context: "voice"|"chat"|"writing"|"dictation", correct, note? }]
  get productiveUses() { return sanitizeJson(this._getRaw('productive_uses')) }
  set productiveUses(value) {
    this._setRaw('productive_uses', JSON.stringify(Array.isArray(value) ? value : []))
  }

  get lastProductiveUseAt() { return this._getRaw('last_productive_use_at') }
  set lastProductiveUseAt(value) { this._setRaw('last_productive_use_at', value) }

  // Fiche mise en pause (n'apparaît plus dans les révisions dues) — persistée.
  get paused() { return this._getRaw('paused') }
  set paused(value) { this._setRaw('paused', value) }

  // NOTE : `distinctProductiveContexts` n'est PAS stocké — dérivé à la volée depuis
  // productiveUses via masteryStages.js#getDistinctProductiveContexts.
}
