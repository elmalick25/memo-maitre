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
  @field('audio_id') audioId
  
  @json('layers', sanitizeJson) layers
  @field('level') level
  @field('next_review') nextReview
  
  @readonly @date('created_at') createdAt
  @readonly @date('updated_at') updatedAt
  
  @field('ease_factor') easeFactor
  @field('interval') interval
  @field('repetitions') repetitions
  @json('review_history', sanitizeJson) reviewHistory
}
