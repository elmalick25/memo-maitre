import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const mySchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'expressions',
      columns: [
        { name: 'front', type: 'string' },
        { name: 'back', type: 'string' },
        { name: 'example', type: 'string', isOptional: true },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'type', type: 'string', isOptional: true },
        { name: 'image_url', type: 'string', isOptional: true },
        { name: 'audio_url', type: 'string', isOptional: true },
        { name: 'layers', type: 'string', isOptional: true }, // JSON array
        { name: 'level', type: 'number', isOptional: true },
        { name: 'next_review', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'ease_factor', type: 'number', isOptional: true },
        { name: 'interval', type: 'number', isOptional: true },
        { name: 'repetitions', type: 'number', isOptional: true },
        { name: 'review_history', type: 'string', isOptional: true }, // JSON array
      ]
    }),
  ]
})
