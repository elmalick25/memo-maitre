import { Database } from '@nozbe/watermelondb'
import LokiJSAdapterRaw from '@nozbe/watermelondb/adapters/lokijs'
import { mySchema } from './schema'
import { migrations } from './migrations'
import Expression from './models/Expression'

const LokiJSAdapter = LokiJSAdapterRaw.default || LokiJSAdapterRaw

const adapter = new LokiJSAdapter({
  schema: mySchema,
  migrations,
  // ⚡ Activé : les opérations Loki/IndexedDB tournent dans un Web Worker au
  // lieu du thread principal. C'est ce qui causait les gels de plusieurs
  // secondes ("'success' handler took 11632ms") au chargement des fiches.
  useWebWorker: false,
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
