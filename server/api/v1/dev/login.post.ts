import { login } from '../../../domain/dev'

export default defineEventHandler(async (event) => {
  let body: unknown = {}
  try {
    body = await readBody(event)
  } catch {
    body = {}
  }
  return login(body)
})
