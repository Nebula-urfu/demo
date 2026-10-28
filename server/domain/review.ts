import { getDb } from '../db'
import { getGateways } from '../gateway'
import type { Ctx } from '../utils/session'
import { nowIso } from '../utils/time'
import { notFound } from '../utils/errors'
import { userRef, uuid, type RequestRow } from './store'

export type SubjectType = 'TZ' | 'NMC' | 'PACKAGE'

const TITLES: Record<SubjectType, string> = { TZ: 'ТЗ', NMC: 'расчёт НМЦ', PACKAGE: 'пакет документов' }

export interface ApprovalRow {
  id: string
  org_id: string
  request_id: string
  subject_type: SubjectType
  subject_version: number
  state: 'PENDING' | 'APPROVED' | 'REJECTED'
  submitted_by_id: string
  submitted_by_name: string
  submitted_at: string
  decided_by_id: string | null
  decided_by_name: string | null
  decided_at: string | null
  comment: string | null
}

/** Creates a review task and notifies REVIEWER. Call inside a transaction. */
export function createApproval(ctx: Ctx, req: RequestRow, subject: SubjectType, version: number) {
  const id = uuid()
  getDb()
    .prepare(
      "INSERT INTO approvals (id, org_id, request_id, subject_type, subject_version, state, submitted_by_id, submitted_by_name, submitted_at) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)",
    )
    .run(id, ctx.orgId, req.id, subject, version, ctx.userId, ctx.displayName, nowIso())
  getGateways().notifications.notify(ctx.orgId, req.id, 'REVIEWER', `Задача на проверку: ${TITLES[subject]}`, req.urgency === 'EMERGENCY')
  return id
}

interface ApprovalJoin extends ApprovalRow {
  urgency: 'EMERGENCY' | 'PLANNED' | null
  address: string
}

export function approvalView(a: ApprovalJoin) {
  return {
    id: a.id,
    requestId: a.request_id,
    subjectType: a.subject_type,
    subjectVersion: a.subject_version,
    state: a.state,
    urgency: a.urgency,
    address: a.address,
    submittedBy: userRef(a.submitted_by_id, a.submitted_by_name),
    submittedAt: a.submitted_at,
    ...(a.decided_by_id ? { decidedBy: userRef(a.decided_by_id, a.decided_by_name), decidedAt: a.decided_at } : {}),
    comment: a.comment,
  }
}

const SELECT_APPROVAL =
  'SELECT a.*, r.urgency AS urgency, r.address AS address FROM approvals a JOIN requests r ON r.id = a.request_id'

export function approvalRowById(ctx: Ctx, id: string): ApprovalJoin {
  const a = getDb().prepare(`${SELECT_APPROVAL} WHERE a.id = ? AND a.org_id = ?`).get(id, ctx.orgId) as ApprovalJoin | undefined
  if (!a) throw notFound('Задача проверки')
  return a
}

export function approvalById(ctx: Ctx, id: string) {
  return approvalView(approvalRowById(ctx, id))
}

export { SELECT_APPROVAL }
export type { ApprovalJoin }
