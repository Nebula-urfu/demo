import { resetDb } from '../../../db'

export default defineEventHandler(() => {
  resetDb()
  return { ok: true }
})
