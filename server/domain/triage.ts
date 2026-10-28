import { getDb, tx } from '../db'
import { stepNotAllowed } from '../utils/errors'
import type { Ctx } from '../utils/session'
import { nowIso } from '../utils/time'
import { asObject, Checker } from '../utils/validate'
import { loadRequest, parse, setStep, stepState, userRef } from './store'

interface TriageRow {
  proposal_json: string | null
  confirmed_json: string | null
  confirmed_by_id: string | null
  confirmed_by_name: string | null
  confirmed_at: string | null
}

export function getTriage(ctx: Ctx, id: string) {
  loadRequest(ctx, id)
  const t = getDb().prepare('SELECT * FROM triage WHERE request_id = ?').get(id) as TriageRow | undefined
  return {
    state: stepState(id, 'TRIAGE'),
    proposal: parse(t?.proposal_json, null),
    confirmed: parse(t?.confirmed_json, null),
    ...(t?.confirmed_by_id ? { confirmedBy: userRef(t.confirmed_by_id, t.confirmed_by_name), confirmedAt: t.confirmed_at } : {}),
  }
}

export function confirmTriage(ctx: Ctx, id: string, body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const urgency = c.enum(o, 'urgency', ['EMERGENCY', 'PLANNED'] as const)
  const workType = c.string(o, 'workType', { min: 1, max: 200 })
  const route = c.string(o, 'route', { min: 1, max: 100 })
  c.done()
  return tx((db) => {
    const r = loadRequest(ctx, id)
    if (stepState(id, 'TRIAGE') !== 'DRAFT_READY') throw stepNotAllowed('Триаж не в состоянии DRAFT_READY')
    const now = nowIso()
    db.prepare('UPDATE triage SET confirmed_json = ?, confirmed_by_id = ?, confirmed_by_name = ?, confirmed_at = ? WHERE request_id = ?').run(
      JSON.stringify({ urgency, workType, route }),
      ctx.userId,
      ctx.displayName,
      now,
      id,
    )
    db.prepare('UPDATE requests SET urgency = ? WHERE id = ?').run(urgency, r.id)
    setStep(id, 'TRIAGE', 'APPROVED')
    return getTriage(ctx, id)
  })
}
