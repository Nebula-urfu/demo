import { getDb, tx } from '../db'
import { getGateways } from '../gateway'
import { notFound, stepNotAllowed, validation } from '../utils/errors'
import type { Ctx } from '../utils/session'
import { nowIso } from '../utils/time'
import { asObject, Checker } from '../utils/validate'
import {
  currentStep, getSteps, loadRequest, setStep, stepState, STEPS, uuid, userRef,
  type FileRef, type RequestRow, type Step,
} from './store'


function photos(requestId: string): FileRef[] {
  return (
    getDb().prepare('SELECT file_id, name, media_type, size_bytes FROM request_files WHERE request_id = ?').all(requestId) as {
      file_id: string
      name: string
      media_type: string
      size_bytes: number
    }[]
  ).map((f) => ({ fileId: f.file_id, name: f.name, mediaType: f.media_type, sizeBytes: f.size_bytes }))
}

function firstPhotoId(requestId: string): string | null {
  const r = getDb().prepare('SELECT file_id FROM request_files WHERE request_id = ? ORDER BY rowid LIMIT 1').get(requestId) as { file_id: string } | undefined
  return r?.file_id ?? null
}

function summary(ctx: Ctx, r: RequestRow) {
  const base = {
    id: r.id,
    status: r.status,
    address: r.address,
    entrance: r.entrance,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // addition to RequestSummary (docs/DECISIONS.md): the first photo for the list thumbnail
    photoId: firstPhotoId(r.id),
  }
  if (ctx.role === 'RESIDENT') return base
  const cur = currentStep(getSteps(r.id))
  return { ...base, urgency: r.urgency, currentStep: cur?.step ?? null, currentStepState: cur?.state ?? null }
}

export function toDetail(ctx: Ctx, r: RequestRow) {
  const d = { ...summary(ctx, r), photos: photos(r.id) }
  if (ctx.role === 'RESIDENT') return d
  return {
    ...d,
    author: userRef(r.author_user_id, r.author_name),
    steps: getSteps(r.id).map((s) => ({ step: s.step, state: s.state, updatedAt: s.updatedAt })),
  }
}

export function createRequest(ctx: Ctx, idempotencyKey: string | undefined, body: unknown) {
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)
    throw validation([{ field: 'Idempotency-Key', message: 'Заголовок обязателен, длина 8..128' }])
  const o = asObject(body)
  const c = new Checker()
  const description = c.string(o, 'description', { min: 3, max: 2000 })
  const entrance = c.string(o, 'entrance', { min: 1, max: 20 })
  const ids = o.photoFileIds
  if (!Array.isArray(ids) || ids.length < 1) c.err('photoFileIds', 'Нужен хотя бы один файл')
  else ids.forEach((id, i) => c.uuid(id, `photoFileIds[${i}]`))
  c.done()

  return tx((db) => {
    const prev = db
      .prepare('SELECT request_id FROM idempotency_keys WHERE user_id = ? AND key = ?')
      .get(ctx.userId, idempotencyKey) as { request_id: string } | undefined
    if (prev) return toDetail(ctx, loadRequest(ctx, prev.request_id))

    const id = uuid()
    const now = nowIso()
    db.prepare(
      "INSERT INTO requests (id, org_id, author_user_id, author_name, status, urgency, address, entrance, description, created_at, updated_at) VALUES (?, ?, ?, ?, 'ACCEPTED', NULL, ?, ?, ?, ?, ?)",
    ).run(id, ctx.orgId, ctx.userId, ctx.displayName, ctx.address, entrance, description, now, now)
    db.prepare('INSERT INTO idempotency_keys (user_id, key, request_id) VALUES (?, ?, ?)').run(ctx.userId, idempotencyKey, id)
    const insStep = db.prepare('INSERT INTO request_steps (request_id, step, state, updated_at) VALUES (?, ?, ?, ?)')
    for (const s of STEPS) insStep.run(id, s, s === 'TRIAGE' || s === 'TZ' ? 'PROCESSING' : 'NOT_STARTED', now)
    const insFile = db.prepare('INSERT OR IGNORE INTO request_files (request_id, file_id, name, media_type, size_bytes) VALUES (?, ?, ?, ?, ?)')
    const gw = getGateways()
    for (const fid of ids as string[]) {
      const f = gw.documents.describeFile(ctx.orgId, fid)
      insFile.run(id, fid, f?.name ?? 'demo-photo.jpg', f?.mediaType ?? 'image/jpeg', f?.sizeBytes ?? 1024)
    }
    gw.ai.submit({ orgId: ctx.orgId, requestId: id, jobType: 'triage_and_tz_draft' })
    return toDetail(ctx, loadRequest(ctx, id))
  })
}

export function listRequests(ctx: Ctx, q: Record<string, string | undefined>) {
  const c = new Checker()
  const status = q.status
  if (status !== undefined && !['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(status)) c.err('status', 'Недопустимое значение')
  if (q.urgency !== undefined && !['EMERGENCY', 'PLANNED'].includes(q.urgency)) c.err('urgency', 'Недопустимое значение')
  if (q.step !== undefined && !(STEPS as readonly string[]).includes(q.step)) c.err('step', 'Недопустимое значение')
  if (q.q !== undefined && q.q.length > 200) c.err('q', 'Максимум 200 символов')
  for (const f of ['createdFrom', 'createdTo'] as const)
    if (q[f] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(q[f]!)) c.err(f, 'Формат YYYY-MM-DD')
  c.done()

  let sql = 'SELECT * FROM requests WHERE org_id = ?'
  const args: unknown[] = [ctx.orgId]
  if (ctx.role === 'RESIDENT') (sql += ' AND author_user_id = ?'), args.push(ctx.userId)
  if (status) (sql += ' AND status = ?'), args.push(status)
  if (q.createdFrom) (sql += ' AND created_at >= ?'), args.push(q.createdFrom)
  if (q.createdTo) (sql += ' AND created_at < date(?, \'+1 day\')'), args.push(q.createdTo)
  if (ctx.role !== 'RESIDENT') {
    if (q.urgency) (sql += ' AND urgency = ?'), args.push(q.urgency)
    if (q.q) (sql += " AND (lower(address) LIKE ? OR lower(description) LIKE ?)"), args.push(`%${q.q.toLowerCase()}%`, `%${q.q.toLowerCase()}%`)
  }
  sql += " ORDER BY (urgency = 'EMERGENCY') DESC, created_at DESC"
  const rows = getDb().prepare(sql).all(...args) as RequestRow[]
  let items = rows.map((r) => summary(ctx, r) as ReturnType<typeof summary> & { currentStep?: string | null })
  if (ctx.role !== 'RESIDENT' && q.step) items = items.filter((i) => i.currentStep === q.step)
  return items
}

export function getRequest(ctx: Ctx, id: string) {
  return tx((db) => {
    let r = loadRequest(ctx, id)
    if (ctx.role === 'STAFF' && r.status === 'ACCEPTED') {
      db.prepare("UPDATE requests SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ?").run(nowIso(), id)
      r = loadRequest(ctx, id)
    }
    return toDetail(ctx, r)
  })
}

export function restartAiStep(ctx: Ctx, id: string, step: string) {
  if (!['TRIAGE', 'TZ', 'QUOTES_NMC', 'TENDER'].includes(step)) throw notFound('Шаг')
  const st = step as Step
  return tx((db) => {
    loadRequest(ctx, id)
    if (stepState(id, st) !== 'AI_FAILED') throw stepNotAllowed('Шаг не в состоянии AI_FAILED')
    const ai = getGateways().ai
    if (st === 'TRIAGE' || st === 'TZ') {
      setStep(id, 'TRIAGE', 'PROCESSING')
      setStep(id, 'TZ', 'PROCESSING')
      ai.submit({ orgId: ctx.orgId, requestId: id, jobType: 'triage_and_tz_draft' })
    } else if (st === 'QUOTES_NMC') {
      const failed = db.prepare("SELECT id FROM quotes WHERE request_id = ? AND org_id = ? AND extraction = 'AI_FAILED'").all(id, ctx.orgId) as { id: string }[]
      for (const f of failed) {
        db.prepare("UPDATE quotes SET extraction = 'EXTRACTING' WHERE id = ?").run(f.id)
        ai.submit({ orgId: ctx.orgId, requestId: id, jobType: 'quotes_extraction', payload: { quoteId: f.id } })
      }
      setStep(id, 'QUOTES_NMC', 'PROCESSING')
    } else {
      setStep(id, 'TENDER', 'PROCESSING')
      ai.submit({ orgId: ctx.orgId, requestId: id, jobType: 'tender_package' })
    }

    const s = getSteps(id).find((x) => x.step === st)!
    return { step: s.step, state: s.state, updatedAt: s.updatedAt }
  })
}

