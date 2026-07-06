import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations'

// ─────────────────────────────────────────────────────────────────────────────
// Migrations WatermelonDB — Ajouter ici toute nouvelle migration avant de
// bumper la version du schéma dans schema.js
// ─────────────────────────────────────────────────────────────────────────────

export const migrations = schemaMigrations({
  migrations: [
    // v1 → v2 : ajout de la colonne audio_id pour les fiches audio importées
    // depuis le Lab (stockage du blob dans IndexedDB, la clé est audio_id)
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'expressions',
          columns: [
            { name: 'audio_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
  ],
})
