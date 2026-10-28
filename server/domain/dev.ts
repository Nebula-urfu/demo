import { getDb } from '../db'
import { getGateways } from '../gateway'
import type { Ctx } from '../utils/session'
import { nowIso } from '../utils/time'
import { Checker, isObj, type Obj } from '../utils/validate'
import { notFound, validation } from '../utils/errors'
import { createZip } from '../utils/zip'
import { loadRequest, uuid } from './store'
import { packageDocument } from './tender'

const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '-')

/** docs/MOCKS.md section 1: any body is accepted, nothing is validated. */
export function login(body: unknown) {
  const o: Obj = isObj(body) ? body : {}
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '')
  const username = str('username')
  const lower = username.toLowerCase()
  let role: 'RESIDENT' | 'STAFF' | 'REVIEWER'
  const given = str('role').toUpperCase()
  if (given === 'RESIDENT' || given === 'STAFF' || given === 'REVIEWER') role = given
  else if (lower.includes('staff') || lower.includes('сотрудник')) role = 'STAFF'
  else if (lower.includes('review') || lower.includes('проверя')) role = 'REVIEWER'
  else role = 'RESIDENT'
  const userId = slug(username) || 'guest'
  const session = {
    token: `demo-${uuid()}`,
    userId,
    displayName: str('displayName') || username || 'Гость',
    role,
    orgId: str('orgId') || 'demo-org',
    address: str('address') || 'ул. Демонстрационная, д. 1 (ДЕМО)',
  }
  getDb()
    .prepare('INSERT INTO sessions (token, user_id, display_name, role, org_id, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(session.token, session.userId, session.displayName, session.role, session.orgId, session.address, nowIso())
  return session
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/** JSON body (name, type, size only) or multipart content: image content is stored so the photo can be shown. */
export function registerFile(ctx: Ctx, body: unknown, upload?: { name?: string; mediaType?: string; data: Buffer }) {
  if (upload) {
    if (upload.data.length > MAX_PHOTO_BYTES) throw validation([{ field: 'file', message: 'Файл больше 5 МБ' }])
    const isImage = (upload.mediaType ?? '').startsWith('image/')
    return getGateways().documents.registerFile(ctx.orgId, {
      name: upload.name,
      mediaType: upload.mediaType,
      sizeBytes: upload.data.length,
      content: isImage ? upload.data : undefined,
    })
  }
  const o: Obj = isObj(body) ? body : {}
  return getGateways().documents.registerFile(ctx.orgId, {
    name: typeof o.name === 'string' && o.name ? o.name : undefined,
    mediaType: typeof o.mediaType === 'string' && o.mediaType ? o.mediaType : undefined,
    sizeBytes: typeof o.sizeBytes === 'number' ? o.sizeBytes : undefined,
  })
}

/** ZIP with all documents of a package version (stub texts, see docs/MOCKS.md section 3). */
export function packageZip(ctx: Ctx, requestId: string, version?: number) {
  const req = loadRequest(ctx, requestId)
  const pkg = packageDocument(requestId, version)
  if (!pkg.documents.length) throw notFound('Пакет')
  const docs = getGateways().documents
  const used = new Set<string>()
  const entries = pkg.documents.map((d, i) => {
    let name = `${String(i + 1).padStart(2, '0')} ${d.name}.txt`.replace(/[\\/:*?"<>|]/g, '-')
    while (used.has(name)) name = `_${name}`
    used.add(name)
    return { name, data: Buffer.from(d.fileId ? docs.downloadText(ctx.orgId, d.fileId) : 'ДЕМО-ДОКУМЕНТ\n', 'utf8') }
  })
  return { filename: `package-${req.id.slice(0, 6)}-v${pkg.version}.zip`, data: createZip(entries) }
}

export function listContractors() {
  return { items: getGateways().reference.listContractors() }
}

export function listEvents(ctx: Ctx, q: Record<string, string | undefined>) {
  const c = new Checker()
  if (q.topic !== undefined && !['ai.jobs', 'ai.results', 'notifications'].includes(q.topic)) c.err('topic', 'Недопустимое значение')
  let limit = 100
  if (q.limit !== undefined) {
    const n = Number(q.limit)
    if (!Number.isInteger(n) || n < 1 || n > 500) c.err('limit', 'От 1 до 500')
    else limit = n
  }
  c.done()
  let sql = 'SELECT * FROM event_log WHERE org_id = ?'
  const args: unknown[] = [ctx.orgId]
  if (q.requestId) (sql += ' AND request_id = ?'), args.push(q.requestId)
  if (q.topic) (sql += ' AND topic = ?'), args.push(q.topic)
  sql += ' ORDER BY id DESC LIMIT ?'
  args.push(limit)
  const rows = getDb().prepare(sql).all(...args) as {
    id: number
    ts: string
    topic: string
    type: string
    request_id: string | null
    payload_json: string
  }[]
  return {
    items: rows.map((r) => ({ id: r.id, ts: r.ts, topic: r.topic, type: r.type, requestId: r.request_id, payload: JSON.parse(r.payload_json) })),
  }
}
