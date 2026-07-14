import { Model } from '@nozbe/watermelondb'
import { field, json, date, readonly } from '@nozbe/watermelondb/decorators'

const sanitizeJson = (raw) => {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

export default class Expression extends Model {
  static table = 'expressions'

  @field('front') front
  @field('back') back
  @field('example') example
  @field('category') category
  @field('type') type
  @field('image_url') imageUrl
  @field('audio_url') audioUrl

  @json('layers', sanitizeJson) layers
  @field('level') level
  @field('next_review') nextReview

  @readonly @date('created_at') createdAt
  @readonly @date('updated_at') updatedAt

  @field('ease_factor') easeFactor
  @field('interval') interval
  @field('repetitions') repetitions
  @json('review_history', sanitizeJson) reviewHistory

  // ── Production active (Phase 1) ────────────────────────────────────────────
  // masteryStage : "discovered" | "recognized" | "recalled" | "produced" | "mastered"
  // Défaut "discovered" (sûr : rétrocompatible, ne modifie aucun scheduling existant).
  @field('mastery_stage') masteryStage
  // productiveUses : [{ date, context: "voice"|"chat"|"writing"|"dictation", correct: bool, note? }]
  @json('productive_uses', sanitizeJson) productiveUses
  // Timestamp du dernier usage productif correct (null si aucun)
  @field('last_productive_use_at') lastProductiveUseAt
  // NOTE : `distinctProductiveContexts` n'est PAS stocké — dérivé à la volée depuis
  // productiveUses via masteryStages.js#getDistinctProductiveContexts (choix : un
  // seul point de vérité, évite les désynchronisations entre stockage et calcul).
}
