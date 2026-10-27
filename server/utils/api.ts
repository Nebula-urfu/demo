import type { H3Event } from 'h3'
import { authenticate, requireRole, type Ctx, type Role } from './session'
import { ApiError, validation } from './errors'

interface ApiArgs {
  ctx: Ctx
  event: H3Event
  params: Record<string, string>
  query: Record<string, string | undefined>
  body: () => Promise<unknown>
}

function sendProblem(event: H3Event, e: ApiError) {
  setResponseStatus(event, e.status)
  setResponseHeader(event, 'content-type', 'application/problem+json; charset=utf-8')
  return JSON.stringify(e.toProblem())
}

/** Wraps a handler: token, role check, problem+json errors. */
export function defineApi(
  opts: { roles?: Role[]; status?: number },
  fn: (a: ApiArgs) => unknown | Promise<unknown>,
) {
  return defineEventHandler(async (event) => {
    try {
      const header = getHeader(event, 'authorization') || ''
      const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : undefined
      const ctx = authenticate(token)
      requireRole(ctx, opts.roles)
      const q = getQuery(event)
      const query: Record<string, string | undefined> = {}
      for (const [k, v] of Object.entries(q)) query[k] = Array.isArray(v) ? String(v[0]) : v === undefined ? undefined : String(v)
      const result = await fn({
        ctx,
        event,
        params: (event.context.params || {}) as Record<string, string>,
        query,
        body: async () => {
          try {
            return await readBody(event)
          } catch {
            throw validation([{ field: 'body', message: 'Тело запроса не является JSON' }])
          }
        },
      })
      if (opts.status) setResponseStatus(event, opts.status)
      if (result === undefined) {
        setResponseStatus(event, opts.status ?? 204)
        return null
      }
      return result
    } catch (e) {
      if (e instanceof ApiError) return sendProblem(event, e)
      console.error(e)
      setResponseStatus(event, 500)
      setResponseHeader(event, 'content-type', 'application/problem+json; charset=utf-8')
      return JSON.stringify({ type: 'about:blank', title: 'Внутренняя ошибка', status: 500, code: 'VALIDATION_ERROR' })
    }
  })
}

/** Reads limit/cursor (offset) pagination parameters. */
export function pageParams(query: Record<string, string | undefined>) {
  const errors = []
  let limit = 25
  if (query.limit !== undefined) {
    const n = Number(query.limit)
    if (!Number.isInteger(n) || n < 1 || n > 100) errors.push({ field: 'limit', message: 'От 1 до 100' })
    else limit = n
  }
  let offset = 0
  if (query.cursor !== undefined) {
    const n = Number(query.cursor)
    if (!Number.isInteger(n) || n < 0) errors.push({ field: 'cursor', message: 'Некорректный курсор' })
    else offset = n
  }
  if (errors.length) throw validation(errors)
  return { limit, offset }
}

export function paginate<T>(rows: T[], limit: number, offset: number) {
  const items = rows.slice(offset, offset + limit)
  return { items, nextCursor: offset + limit < rows.length ? String(offset + limit) : null }
}
