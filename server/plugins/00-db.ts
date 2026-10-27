import { initDb, setSchema } from '../db'
import { resetOnStart } from '../utils/config'

export default defineNitroPlugin(async () => {
  const raw = await useStorage('assets:db').getItem<string | Uint8Array>('schema.sql')
  if (raw == null) throw new Error('server/db/schema.sql not found in server assets')
  setSchema(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8'))
  initDb(resetOnStart())
})
