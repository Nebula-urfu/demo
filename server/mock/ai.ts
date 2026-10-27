import { getDb, tx } from '../db'
import { getGateways, type AiGateway, type JobType } from '../gateway'
import { proposeWinner, type QuoteData } from '../domain/compare'
import { loadRequestById, parse, setStep, stepState, uuid, type DocumentRef, type RequestRow, type Urgency } from '../domain/store'
import { aiDelayMs } from '../utils/config'
import { inMs, nowIso } from '../utils/time'
import quoteFixtures from './quote-fixtures.json'
import tzFixtures from './tz-fixtures.json'

interface JobRow {
  job_id: string
  org_id: string
  request_id: string
  job_type: JobType
  payload_json: string
}

type TzFixture = (typeof tzFixtures)['roof']

const EMERGENCY_WORDS = ['прорыв', 'затоплен', 'авари', 'пожар', 'запах газа', 'замыкани']

/** docs/MOCKS.md 2.1: keyword rules instead of a real model. */
export function triageProposal(description: string) {
  const text = description.toLowerCase()
  const urgency: Urgency = EMERGENCY_WORDS.some((w) => text.includes(w)) ? 'EMERGENCY' : 'PLANNED'
  let fixture: 'roof' | 'tile' | 'general' = 'general'
  if (['кровл', 'протеч', 'крыш'].some((w) => text.includes(w))) fixture = 'roof'
  else if (['плитк', 'ступен', 'пол'].some((w) => text.includes(w))) fixture = 'tile'
  const workType = {
    roof: 'Кровельные работы (ДЕМО)',
    tile: 'Ремонт плитки и покрытий (ДЕМО)',
    general: 'Прочие ремонтные работы (ДЕМО)',
  }[fixture]
  const route = urgency === 'EMERGENCY' ? 'EMERGENCY_CONTRACTOR_CALL' : 'PLANNED_PROCUREMENT'
  return { fixture, proposal: { urgency, workType, route } }
}

export class MockAi implements AiGateway {
  submit(job: { orgId: string; requestId: string; jobType: JobType; payload?: Record<string, unknown> }) {
    const id = uuid()
    getDb()
      .prepare(
        "INSERT INTO ai_jobs (job_id, org_id, request_id, job_type, payload_json, state, run_at, created_at) VALUES (?, ?, ?, ?, ?, 'QUEUED', ?, ?)",
      )
      .run(id, job.orgId, job.requestId, job.jobType, JSON.stringify(job.payload ?? {}), inMs(aiDelayMs()), nowIso())
    getGateways().notifications.record(job.orgId, 'ai.jobs', 'job.created', job.requestId, {
      jobId: id,
      jobType: job.jobType,
      requestId: job.requestId,
    })
    return id
  }

  runDue(): number {
    let done = 0
    for (let i = 0; i < 50; i++) {
      const job = getDb()
        .prepare("SELECT job_id, org_id, request_id, job_type, payload_json FROM ai_jobs WHERE state = 'QUEUED' AND run_at <= ? ORDER BY created_at, rowid LIMIT 1")
        .get(nowIso()) as JobRow | undefined
      if (!job) break
      try {
        tx(() => this.execute(job))
      } catch (e) {
        console.error('[ai] job failed with an exception', job.job_id, e)
        getDb().prepare("UPDATE ai_jobs SET state = 'FAILED' WHERE job_id = ?").run(job.job_id)
      }
      done++
    }
    return done
  }

  private finish(job: JobRow, state: 'DONE' | 'FAILED') {
    getDb().prepare('UPDATE ai_jobs SET state = ? WHERE job_id = ?').run(state, job.job_id)
    getGateways().notifications.record(job.org_id, 'ai.results', state === 'DONE' ? 'job.done' : 'job.failed', job.request_id, {
      jobId: job.job_id,
      jobType: job.job_type,
      requestId: job.request_id,
    })
  }

  private execute(job: JobRow) {
    const req = loadRequestById(job.org_id, job.request_id)
    if (!req) return this.finish(job, 'DONE')
    const payload = parse<Record<string, unknown>>(job.payload_json, {})
    if (job.job_type === 'triage_and_tz_draft') this.triageAndTz(job, req)
    else if (job.job_type === 'tz_revision') this.tzRevision(job, req, String(payload.comment ?? ''))
    else if (job.job_type === 'quotes_extraction') this.quotesExtraction(job, req, String(payload.quoteId ?? ''))
    else this.tenderPackage(job, req)
  }

  private triageAndTz(job: JobRow, req: RequestRow) {
    const db = getDb()
    const failedBefore = db
      .prepare("SELECT 1 FROM ai_jobs WHERE request_id = ? AND job_type = 'triage_and_tz_draft' AND state = 'FAILED'")
      .get(req.id)
    if (/\[fail\]/i.test(req.description) && !failedBefore) {
      setStep(req.id, 'TRIAGE', 'AI_FAILED')
      setStep(req.id, 'TZ', 'AI_FAILED')
      return this.finish(job, 'FAILED')
    }
    const { fixture, proposal } = triageProposal(req.description)
    const now = nowIso()
    db.prepare(
      'INSERT INTO triage (request_id, proposal_json) VALUES (?, ?) ON CONFLICT(request_id) DO UPDATE SET proposal_json = excluded.proposal_json',
    ).run(req.id, JSON.stringify(proposal))
    const fx: TzFixture = tzFixtures[fixture]
    const next =
      ((db.prepare('SELECT MAX(version) AS v FROM tz_versions WHERE request_id = ?').get(req.id) as { v: number | null }).v ?? 0) + 1
    db.prepare(
      "INSERT INTO tz_versions (request_id, version, origin, sections_json, questions_json, last_review_comment, created_at) VALUES (?, ?, 'AI', ?, ?, NULL, ?)",
    ).run(req.id, next, JSON.stringify(fx.sections), JSON.stringify(fx.questions), now)
    db.prepare('UPDATE requests SET urgency = ?, updated_at = ? WHERE id = ?').run(proposal.urgency, now, req.id)
    setStep(req.id, 'TRIAGE', 'DRAFT_READY')
    setStep(req.id, 'TZ', 'DRAFT_READY')
    getGateways().notifications.notify(req.org_id, req.id, 'STAFF', 'По заявке готов предварительный результат', proposal.urgency === 'EMERGENCY')
    this.finish(job, 'DONE')
  }

  private tzRevision(job: JobRow, req: RequestRow, comment: string) {
    const db = getDb()
    const prev = db
      .prepare('SELECT version, sections_json, questions_json FROM tz_versions WHERE request_id = ? ORDER BY version DESC LIMIT 1')
      .get(req.id) as { version: number; sections_json: string; questions_json: string } | undefined
    if (prev) {
      const sections = parse<{ id: string; text: string }[]>(prev.sections_json, [])
      const s1 = sections.find((s) => s.id === 's1')
      if (s1) s1.text = `${s1.text}\n\nДЕМО. Учтён комментарий проверяющего: ${comment}`
      db.prepare(
        "INSERT INTO tz_versions (request_id, version, origin, sections_json, questions_json, last_review_comment, created_at) VALUES (?, ?, 'AI', ?, ?, ?, ?)",
      ).run(req.id, prev.version + 1, JSON.stringify(sections), prev.questions_json, comment, nowIso())
    }
    setStep(req.id, 'TZ', 'DRAFT_READY')
    getGateways().notifications.notify(req.org_id, req.id, 'STAFF', 'Обновлённый черновик ТЗ готов')
    this.finish(job, 'DONE')
  }

  private quotesExtraction(job: JobRow, req: RequestRow, quoteId: string) {
    const db = getDb()
    const q = db
      .prepare("SELECT id, seq, contractor_id FROM quotes WHERE id = ? AND request_id = ? AND org_id = ? AND extraction = 'EXTRACTING'")
      .get(quoteId, req.id, req.org_id) as { id: string; seq: number; contractor_id: string | null } | undefined
    if (q) {
      const fx = quoteFixtures[(q.seq - 1) % 3]!
      db.prepare("UPDATE quotes SET extraction = 'EXTRACTED', data_json = ?, contractor_id = ? WHERE id = ?").run(
        JSON.stringify(fx.data satisfies QuoteData),
        q.contractor_id ?? fx.contractorId,
        q.id,
      )
      const pending = db.prepare("SELECT 1 FROM quotes WHERE request_id = ? AND extraction = 'EXTRACTING'").get(req.id)
      if (!pending && stepState(req.id, 'QUOTES_NMC') === 'PROCESSING') {
        setStep(req.id, 'QUOTES_NMC', 'DRAFT_READY')
        getGateways().notifications.notify(req.org_id, req.id, 'STAFF', 'КП обработано')
      }
    }
    this.finish(job, 'DONE')
  }

  private tenderPackage(job: JobRow, req: RequestRow) {
    const db = getDb()
    const gw = getGateways()
    const quotes = (
      db
        .prepare("SELECT id, data_json FROM quotes WHERE request_id = ? AND org_id = ? AND extraction = 'EXTRACTED' ORDER BY seq")
        .all(req.id, req.org_id) as { id: string; data_json: string | null }[]
    ).map((q) => ({ id: q.id, data: parse<QuoteData | null>(q.data_json, null) }))
    const documents: DocumentRef[] = [
      { kind: 'TENDER_DOCUMENTATION', name: 'Конкурсная документация (ДЕМО)', fileId: gw.documents.createDocument(req.org_id, 'Конкурсная документация (ДЕМО).pdf'), version: 1 },
      { kind: 'EVALUATION_PROTOCOL', name: 'Протокол оценки (ДЕМО)', fileId: gw.documents.createDocument(req.org_id, 'Протокол оценки (ДЕМО).pdf'), version: 1 },
    ]
    const proposal = proposeWinner(quotes)
    db.prepare(
      `INSERT INTO tender (request_id, documents_json, winner_proposal_json) VALUES (?, ?, ?)
       ON CONFLICT(request_id) DO UPDATE SET documents_json = excluded.documents_json, winner_proposal_json = excluded.winner_proposal_json`,
    ).run(req.id, JSON.stringify(documents), proposal ? JSON.stringify(proposal) : null)
    setStep(req.id, 'TENDER', 'DRAFT_READY')
    gw.notifications.notify(req.org_id, req.id, 'STAFF', 'Конкурсная документация готова')
    this.finish(job, 'DONE')
  }
}
