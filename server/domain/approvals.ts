import { getDb, tx } from '../db'
import { getGateways } from '../gateway'
import { staleVersion, stepNotAllowed } from '../utils/errors'
import type { Ctx } from '../utils/session'
import { nowIso } from '../utils/time'
import { asObject, Checker } from '../utils/validate'
import { nmcDocument } from './quotes'
import { approvalRowById, approvalView, SELECT_APPROVAL, type ApprovalJoin, type SubjectType } from './review'
import { setStep, userRef, uuid } from './store'
import { packageDocument } from './tender'
import { tzDocument } from './tz'

export function listApprovals(ctx: Ctx, q: Record<string, string | undefined>) {
  const c = new Checker()
  if (q.state !== undefined && !['PENDING', 'APPROVED', 'REJECTED'].includes(q.state)) c.err('state', 'Недопустимое значение')
  if (q.subjectType !== undefined && !['TZ', 'NMC', 'PACKAGE'].includes(q.subjectType)) c.err('subjectType', 'Недопустимое значение')
  if (q.requestId !== undefined) c.uuid(q.requestId, 'requestId')
  c.done()
  let sql = `${SELECT_APPROVAL} WHERE a.org_id = ?`
  const args: unknown[] = [ctx.orgId]
  if (q.state) (sql += ' AND a.state = ?'), args.push(q.state)
  if (q.subjectType) (sql += ' AND a.subject_type = ?'), args.push(q.subjectType)
  if (q.requestId) (sql += ' AND a.request_id = ?'), args.push(q.requestId)
  sql += " ORDER BY (a.state = 'PENDING') DESC, (r.urgency = 'EMERGENCY') DESC, a.submitted_at DESC"
  return (getDb().prepare(sql).all(...args) as ApprovalJoin[]).map(approvalView)
}

interface JournalRow {
  id: string
  request_id: string
  subject_type: SubjectType
  subject_version: number
  decision: 'APPROVED' | 'REJECTED'
  decided_by_id: string
  decided_by_name: string
  decided_at: string
  comment: string | null
}

const journalView = (j: JournalRow) => ({
  id: j.id,
  requestId: j.request_id,
  subjectType: j.subject_type,
  subjectVersion: j.subject_version,
  decision: j.decision,
  decidedBy: userRef(j.decided_by_id, j.decided_by_name),
  decidedAt: j.decided_at,
  comment: j.comment,
})

export function listJournal(ctx: Ctx, q: Record<string, string | undefined>) {
  const c = new Checker()
  if (q.subjectType !== undefined && !['TZ', 'NMC', 'PACKAGE'].includes(q.subjectType)) c.err('subjectType', 'Недопустимое значение')
  if (q.requestId !== undefined) c.uuid(q.requestId, 'requestId')
  for (const f of ['from', 'to'] as const) if (q[f] !== undefined && Number.isNaN(Date.parse(q[f]!))) c.err(f, 'Ожидается date-time')
  c.done()
  let sql = 'SELECT * FROM approval_journal WHERE org_id = ?'
  const args: unknown[] = [ctx.orgId]
  if (q.requestId) (sql += ' AND request_id = ?'), args.push(q.requestId)
  if (q.subjectType) (sql += ' AND subject_type = ?'), args.push(q.subjectType)
  if (q.from) (sql += ' AND decided_at >= ?'), args.push(new Date(q.from).toISOString())
  if (q.to) (sql += ' AND decided_at <= ?'), args.push(new Date(q.to).toISOString())
  sql += ' ORDER BY decided_at DESC, rowid DESC'
  return (getDb().prepare(sql).all(...args) as JournalRow[]).map(journalView)
}

export function getApproval(ctx: Ctx, id: string) {
  const a = approvalRowById(ctx, id)
  const subject =
    a.subject_type === 'TZ'
      ? tzDocument(a.request_id, a.subject_version)
      : a.subject_type === 'NMC'
        ? nmcDocument(a.request_id, a.subject_version)
        : packageDocument(a.request_id, a.subject_version)
  const prev = getDb()
    .prepare('SELECT * FROM approval_journal WHERE org_id = ? AND request_id = ? AND subject_type = ? ORDER BY decided_at DESC, rowid DESC')
    .all(ctx.orgId, a.request_id, a.subject_type) as JournalRow[]
  return { ...approvalView(a), subject, previousDecisions: prev.map(journalView) }
}

const NOTIFY_APPROVED: Record<SubjectType, string> = {
  TZ: 'ТЗ утверждено',
  NMC: 'Расчёт НМЦ утверждён',
  PACKAGE: 'Пакет утверждён, документы готовы',
}

function decide(ctx: Ctx, id: string, decision: 'APPROVED' | 'REJECTED', body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const subjectVersion = c.int(o, 'subjectVersion')
  const comment = c.string(o, 'comment', { optional: true, max: 2000 })
  if (decision === 'REJECTED' && !comment) c.err('comment', 'Комментарий обязателен')
  c.done()
  return tx((db) => {
    const a = approvalRowById(ctx, id)
    if (a.state !== 'PENDING') throw stepNotAllowed('Решение по задаче уже принято')
    if (a.subject_version !== subjectVersion) throw staleVersion()
    const now = nowIso()
    db.prepare('UPDATE approvals SET state = ?, decided_by_id = ?, decided_by_name = ?, decided_at = ?, comment = ? WHERE id = ?').run(
      decision,
      ctx.userId,
      ctx.displayName,
      now,
      comment || null,
      id,
    )
    db.prepare(
      'INSERT INTO approval_journal (id, org_id, request_id, subject_type, subject_version, decision, decided_by_id, decided_by_name, decided_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(uuid(), ctx.orgId, a.request_id, a.subject_type, a.subject_version, decision, ctx.userId, ctx.displayName, now, comment || null)

    const gw = getGateways()
    const rid = a.request_id
    if (decision === 'APPROVED') {
      if (a.subject_type === 'TZ') setStep(rid, 'TZ', 'APPROVED')
      else if (a.subject_type === 'NMC') {
        setStep(rid, 'QUOTES_NMC', 'APPROVED')
        setStep(rid, 'TENDER', 'PROCESSING')
        gw.ai.submit({ orgId: ctx.orgId, requestId: rid, jobType: 'tender_package' })
      } else {
        setStep(rid, 'PACKAGE', 'APPROVED')
        setStep(rid, 'TENDER', 'APPROVED')
        db.prepare('UPDATE package_versions SET approved_at = ? WHERE request_id = ? AND version = ?').run(now, rid, a.subject_version)
        db.prepare("UPDATE requests SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(now, rid)
      }
      gw.notifications.notify(ctx.orgId, rid, 'STAFF', NOTIFY_APPROVED[a.subject_type], a.urgency === 'EMERGENCY')
    } else {
      if (a.subject_type === 'TZ') {
        setStep(rid, 'TZ', 'PROCESSING')
        gw.ai.submit({ orgId: ctx.orgId, requestId: rid, jobType: 'tz_revision', payload: { comment } })
      } else if (a.subject_type === 'NMC') {
        setStep(rid, 'QUOTES_NMC', 'NEEDS_REWORK')
        db.prepare('UPDATE nmc_versions SET last_review_comment = ? WHERE request_id = ? AND version = ?').run(comment, rid, a.subject_version)
      } else {
        setStep(rid, 'PACKAGE', 'NEEDS_REWORK')
        setStep(rid, 'TENDER', 'NEEDS_REWORK')
        db.prepare('UPDATE package_versions SET last_review_comment = ? WHERE request_id = ? AND version = ?').run(comment, rid, a.subject_version)
        db.prepare('UPDATE tender SET last_review_comment = ? WHERE request_id = ?').run(comment, rid)
      }
      gw.notifications.notify(ctx.orgId, rid, 'STAFF', `Возвращено на доработку: ${comment}`, a.urgency === 'EMERGENCY')
    }
    return approvalView(approvalRowById(ctx, id))
  })
}

export const approve = (ctx: Ctx, id: string, body: unknown) => decide(ctx, id, 'APPROVED', body)
export const reject = (ctx: Ctx, id: string, body: unknown) => decide(ctx, id, 'REJECTED', body)

