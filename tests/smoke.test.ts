import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetDb, setSchema } from '../server/db'
import { approve, getApproval, listApprovals, listJournal, reject } from '../server/domain/approvals'
import { login } from '../server/domain/dev'
import { createQuote, createQuoteRequest, calculateNmc, getQuoteComparison, submitNmc } from '../server/domain/quotes'
import { createRequest, getRequest, listRequests, restartAiStep } from '../server/domain/requests'
import { confirmTriage, getTriage } from '../server/domain/triage'
import { getPackage, getTender, selectWinner, submitPackage } from '../server/domain/tender'
import { getTz, submitTz, updateTz } from '../server/domain/tz'
import { getGateways } from '../server/gateway'
import { createZip } from '../server/utils/zip'
import { packageZip, registerFile } from '../server/domain/dev'
import { ApiError } from '../server/utils/errors'
import type { Ctx } from '../server/utils/session'

const as = (body: object): Ctx => {
  const s = login(body)
  return { userId: s.userId, displayName: s.displayName, role: s.role, orgId: s.orgId, address: s.address }
}
const tick = () => getGateways().ai.runDue()
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${e.code}`
    throw e
  }
  return 'no error'
}
const stepOf = (ctx: Ctx, id: string, step: string) =>
  (getRequest(ctx, id) as { steps: { step: string; state: string }[] }).steps.find((s) => s.step === step)!.state

beforeEach(() => {
  setSchema(readFileSync(new URL('../server/db/schema.sql', import.meta.url), 'utf8'))
  resetDb()
})

function submitRequest(resident: Ctx, description = 'Протечка кровли над подъездом', key = 'key-12345678') {
  const file = getGateways().documents.registerFile(resident.orgId, {})
  return createRequest(resident, key, { description, entrance: '1', photoFileIds: [file.fileId] }) as { id: string; status: string }
}

describe('YKit demo: full path from request to COMPLETED', () => {
  it('goes through all steps with three roles', () => {
    const resident = as({ username: 'anna' })
    const staff = as({ username: 'staff-ivan' })
    const reviewer = as({ role: 'REVIEWER' })
    const req = submitRequest(resident)
    expect(req.status).toBe('ACCEPTED')
    expect(submitRequest(resident).id).toBe(req.id) // idempotency

    expect(stepOf(staff, req.id, 'TRIAGE')).toBe('PROCESSING')
    tick()
    expect(stepOf(staff, req.id, 'TRIAGE')).toBe('DRAFT_READY')
    expect((getRequest(staff, req.id) as { status: string }).status).toBe('IN_PROGRESS')

    const triage = getTriage(staff, req.id)
    confirmTriage(staff, req.id, triage.proposal)

    const tz1 = getTz(staff, req.id)
    const tz2 = updateTz(staff, req.id, { baseVersion: tz1.version, answers: [{ questionId: 'q1', answer: '30' }] })
    expect(tz2.version).toBe(2)
    expect(code(() => updateTz(staff, req.id, { baseVersion: 1 }))).toBe('409 STALE_VERSION')
    const ap1 = submitTz(staff, req.id, { version: 2 })
    expect(code(() => reject(reviewer, ap1.id, { subjectVersion: 2 }))).toBe('400 VALIDATION_ERROR')
    reject(reviewer, ap1.id, { subjectVersion: 2, comment: 'Уточните' })
    tick()
    const tz3 = getTz(staff, req.id)
    expect([tz3.version, tz3.origin, tz3.lastReviewComment]).toEqual([3, 'AI', 'Уточните'])
    approve(reviewer, submitTz(staff, req.id, { version: 3 }).id, { subjectVersion: 3 })

    const contractors = getGateways().reference.listContractors()
    const draft = createQuoteRequest(staff, req.id, { contractorIds: contractors.map((c) => c.id) })
    expect(draft.attachments).toHaveLength(2)
    for (let i = 0; i < 3; i++) {
      const f = getGateways().documents.registerFile(staff.orgId, { name: `kp-${i}.pdf` })
      createQuote(staff, req.id, { fileIds: [f.fileId] })
    }
    expect(stepOf(staff, req.id, 'QUOTES_NMC')).toBe('PROCESSING')
    tick()
    expect(stepOf(staff, req.id, 'QUOTES_NMC')).toBe('DRAFT_READY')

    const cmp = getQuoteComparison(staff, req.id)
    const q3 = cmp.quotes[2]!.quoteId
    const flag = (name: string) => cmp.rows.find((r) => r.name === name)!.cells.find((c) => c.quoteId === q3)!.flag
    expect(flag('Вывоз мусора (ДЕМО)')).toBe('MISSING')
    expect(flag('Материалы (ДЕМО)')).toBe('OUTLIER')

    const nmc = calculateNmc(staff, req.id, {})
    expect(nmc.amount).toEqual({ amount: '60000.00', currency: 'RUB' })
    approve(reviewer, submitNmc(staff, req.id, { version: 1 }).id, { subjectVersion: 1 })
    tick()
    const tender = getTender(staff, req.id)
    expect(tender.state).toBe('DRAFT_READY')
    expect(tender.documents).toHaveLength(2)
    const q1 = cmp.quotes[0]!.quoteId
    expect((tender.winnerProposal as { quoteId: string }).quoteId).toBe(q1)

    expect((selectWinner(staff, req.id, { quoteId: q1 }).contract as { type: string }).type).toBe('STANDARD')
    const pkg1 = getPackage(staff, req.id)
    expect(pkg1.documents).toHaveLength(4)
    reject(reviewer, submitPackage(staff, req.id, { version: pkg1.version }).id, { subjectVersion: 1, comment: 'Другой победитель' })
    expect(stepOf(staff, req.id, 'PACKAGE')).toBe('NEEDS_REWORK')
    const contract = selectWinner(staff, req.id, { quoteId: q3 }).contract as { type: string; lawyerNotes: string[] }
    expect([contract.type, contract.lawyerNotes.length]).toEqual(['NON_STANDARD', 2])
    expect(getPackage(staff, req.id).version).toBe(2)
    approve(reviewer, submitPackage(staff, req.id, { version: 2 }).id, { subjectVersion: 2 })

    const done = getRequest(resident, req.id) as Record<string, unknown>
    expect(done.status).toBe('COMPLETED')
    expect(done).not.toHaveProperty('steps')
    expect(done).not.toHaveProperty('author')
    expect(listJournal(reviewer, { requestId: req.id })).toHaveLength(5)
    expect(code(() => submitTz(staff, req.id, { version: 3 }))).toBe('409 STEP_NOT_ALLOWED')
    expect(listApprovals(reviewer, { state: 'PENDING' })).toHaveLength(0)
    expect(getApproval(reviewer, ap1.id).previousDecisions.length).toBeGreaterThan(0)

    const topics = new Set((getDb().prepare('SELECT DISTINCT topic FROM event_log').all() as { topic: string }[]).map((r) => r.topic))
    expect([...topics].sort()).toEqual(['ai.jobs', 'ai.results', 'notifications'])
  })
})

describe('isolation and roles', () => {
  it('hides requests of other organizations and other residents', () => {
    const resident = as({ username: 'anna' })
    const req = submitRequest(resident)
    expect(code(() => getRequest(as({ username: 'staff-x', orgId: 'other-org' }), req.id))).toBe('404 NOT_FOUND')
    expect(code(() => getRequest(as({ username: 'boris' }), req.id))).toBe('404 NOT_FOUND')
    expect(listRequests(as({ username: 'staff-x', orgId: 'other-org' }), {})).toHaveLength(0)
    expect(listRequests(as({ username: 'boris' }), {})).toHaveLength(0)
    expect(listRequests(as({ username: 'staff-ivan' }), {})).toHaveLength(1)
  })
})

describe('AI failure and urgency', () => {
  it('fails once on [fail], then restarts successfully', () => {
    const resident = as({ username: 'anna' })
    const staff = as({ username: 'staff-ivan' })
    const req = submitRequest(resident, 'Течёт крыша [fail]')
    tick()
    expect(stepOf(staff, req.id, 'TRIAGE')).toBe('AI_FAILED')
    expect(stepOf(staff, req.id, 'TZ')).toBe('AI_FAILED')
    restartAiStep(staff, req.id, 'TRIAGE')
    tick()
    expect(stepOf(staff, req.id, 'TRIAGE')).toBe('DRAFT_READY')
  })

  it('marks emergencies and puts them first', () => {
    const resident = as({ username: 'anna' })
    const staff = as({ username: 'staff-ivan' })
    submitRequest(resident, 'Протечка кровли', 'key-aaaaaaaa')
    const e = submitRequest(resident, 'Прорыв трубы, затопило подъезд', 'key-bbbbbbbb')
    tick()
    expect((getTriage(staff, e.id).proposal as { urgency: string }).urgency).toBe('EMERGENCY')
    expect((listRequests(staff, {})[0] as { id: string }).id).toBe(e.id)
  })
})

describe('approval journal', () => {
  it('is append-only', () => {
    const db = getDb()
    db.prepare(
      "INSERT INTO approval_journal (id, org_id, request_id, subject_type, subject_version, decision, decided_by_id, decided_by_name, decided_at) VALUES ('j1','o','r','TZ',1,'APPROVED','u','U','2026-01-01T00:00:00Z')",
    ).run()
    expect(() => db.prepare("UPDATE approval_journal SET comment = 'x'").run()).toThrow('approval_journal is append-only')
    expect(() => db.prepare('DELETE FROM approval_journal').run()).toThrow('approval_journal is append-only')
  })
})

describe('photos and zip', () => {
  it('stores uploaded image content and returns it', () => {
    const ctx = as({ username: 'anna' })
    const png = Buffer.from('89504e470d0a1a0a', 'hex')
    const ref = registerFile(ctx, {}, { name: 'a.png', mediaType: 'image/png', data: png })
    expect(ref.sizeBytes).toBe(png.length)
    expect(getGateways().documents.getContent(ctx.orgId, ref.fileId)?.data.equals(png)).toBe(true)
    expect(getGateways().documents.getContent('other-org', ref.fileId)).toBeNull()
    const doc = registerFile(ctx, {}, { name: 'a.pdf', mediaType: 'application/pdf', data: png })
    expect(getGateways().documents.getContent(ctx.orgId, doc.fileId)).toBeNull()
    expect(code(() => registerFile(ctx, {}, { name: 'big.png', mediaType: 'image/png', data: Buffer.alloc(5 * 1024 * 1024 + 1) }))).toBe('400 VALIDATION_ERROR')
  })

  it('writes a valid zip', () => {
    const zip = createZip([{ name: 'один.txt', data: Buffer.from('ДЕМО') }, { name: 'b.txt', data: Buffer.from('x') }])
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50)
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2)
  })

  it('refuses a zip without a package and for another organization', () => {
    const staff = as({ username: 'staff-ivan' })
    const req = submitRequest(as({ username: 'anna' }))
    expect(code(() => packageZip(staff, req.id))).toBe('404 NOT_FOUND')
    expect(code(() => packageZip(as({ username: 'staff-x', orgId: 'other-org' }), req.id))).toBe('404 NOT_FOUND')
  })
})
