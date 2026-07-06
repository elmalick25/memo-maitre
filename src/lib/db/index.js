import { Database } from '@nozbe/watermelondb'
import LokiJSAdapterRaw from '@nozbe/watermelondb/adapters/lokijs'
import { mySchema } from './schema'
import { migrations } from './migrations'
import Expression from './models/Expression'

const LokiJSAdapter = LokiJSAdapterRaw.default || LokiJSAdapterRaw

const adapter = new LokiJSAdapter({
  schema: mySchema,
  migrations,  // ← permet la migration v1→v2 sans effacer les données
  useWebWorker: false, // Plus simple pour commencer, set à true si perf critique
  useIncrementalIndexedDB: true,
  onIndexedDBVersionChange: () => {
    if (window.confirm('La base de données a été mise à jour. Veuillez recharger.')) {
      window.location.reload()
    }
  },
})

export const database = new Database({
  adapter,
  modelClasses: [
    Expression,
  ],
})
