// src/lib/db/migrations.js
// Migrations WatermelonDB — additives uniquement (aucune donnée détruite).
import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations'

export const migrations = schemaMigrations({
  migrations: [
    {
      // v1 → v2 : ajout des colonnes de suivi de production active (Phase 1)
      toVersion: 2,
      steps: [
        addColumns({
          table: 'expressions',
          columns: [
            { name: 'mastery_stage', type: 'string', isOptional: true },
            { name: 'productive_uses', type: 'string', isOptional: true },
            { name: 'last_productive_use_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
  ],
})
