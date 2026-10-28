import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { notFound } from '../utils/errors'
import type { Ctx } from '../utils/session'
import { nowIso } from '../utils/time'

export const STEPS = ['TRIAGE', 'TZ', 'QUOTES_NMC', 'TENDER', 'PACKAGE'] as const
export type Step = (typeof STEPS)[number]
export type StepState =
  | 'NOT_STARTED'
  | 'PROCESSING'
  | 'DRAFT_READY'
  | 'IN_REVIEW'
  | 'NEEDS_REWORK'
  | 'APPROVED'
  | 'AI_FAILED'
export type Urgency = 'EMERGENCY' | 'PLANNED'

export interface RequestRow {
  id: string
  org_id: string
  author_user_id: string
  author_name: string
  status: 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED'
  urgency: Urgency | null
  address: string
  entrance: string
  description: string
  created_at: string
  updated_at: string
}

export interface FileRef {
  fileId: string
  name: string
  mediaType: string
  sizeBytes: number
}

export interface DocumentRef {
  kind: 'TZ' | 'QUOTE_FORM' | 'TENDER_DOCUMENTATION' | 'EVALUATION_PROTOCOL' | 'CONTRACT'
  name: string
  fileId: string | null
  version?: number
}

export const uuid = () => randomUUID()
export const parse = <T>(s: string | null | undefined, fallback: T): T => (s ? (JSON.parse(s) as T) : fallback)

/** Request of the caller's organization (residents: only their own). Otherwise 404. */
export function loadRequest(ctx: Ctx, id: string): RequestRow {
  const row = getDb().prepare('SELECT * FROM requests WHERE id = ? AND org_id = ?').get(id, ctx.orgId) as
    | RequestRow
    | undefined
  if (!row || (ctx.role === 'RESIDENT' && row.author_user_id !== ctx.userId)) throw notFound('Заявка')
  return row
}

export function loadRequestById(orgId: string, id: string): RequestRow | undefined {
  return getDb().prepare('SELECT * FROM requests WHERE id = ? AND org_id = ?').get(id, orgId) as RequestRow | undefined
}

export function getSteps(requestId: string): { step: Step; state: StepState; updatedAt: string }[] {
  const rows = getDb()
    .prepare('SELECT step, state, updated_at FROM request_steps WHERE request_id = ?')
    .all(requestId) as { step: Step; state: StepState; updated_at: string }[]
  return STEPS.map((s) => {
    const r = rows.find((x) => x.step === s)
    return { step: s, state: r?.state ?? 'NOT_STARTED', updatedAt: r?.updated_at ?? '' }
  })
}

export function stepState(requestId: string, step: Step): StepState {
  const r = getDb().prepare('SELECT state FROM request_steps WHERE request_id = ? AND step = ?').get(requestId, step) as
    | { state: StepState }
    | undefined
  return r?.state ?? 'NOT_STARTED'
}

export function setStep(requestId: string, step: Step, state: StepState) {
  const now = nowIso()
  const db = getDb()
  db.prepare('UPDATE request_steps SET state = ?, updated_at = ? WHERE request_id = ? AND step = ?').run(
    state,
    now,
    requestId,
    step,
  )
  db.prepare('UPDATE requests SET updated_at = ? WHERE id = ?').run(now, requestId)
}

export function currentStep(steps: { step: Step; state: StepState }[]) {
  const s = steps.find((x) => x.state !== 'APPROVED')
  return s ? { step: s.step, state: s.state } : null
}

export function userRef(id: string | null, name: string | null) {
  return id ? { userId: id, displayName: name ?? id } : undefined
}
