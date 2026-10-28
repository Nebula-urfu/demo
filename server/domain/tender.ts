import { getDb, tx } from '../db'
import { getGateways } from '../gateway'
import { notFound, staleVersion, stepNotAllowed, validation } from '../utils/errors'
import type { Ctx } from '../utils/session'
import { nowIso } from '../utils/time'
import { asObject, Checker } from '../utils/validate'
import { approvalById, createApproval } from './review'
import { loadRequest, parse, setStep, stepState, userRef, type DocumentRef } from './store'
import { tzRow } from './tz'

interface TenderRow {
  documents_json: string
  winner_proposal_json: string | null
  selected_winner_json: string | null
  contract_json: string | null
  last_review_comment: string | null
}

export function tenderDocument(requestId: string) {
  const state = stepState(requestId, 'TENDER')
  const t = getDb().prepare('SELECT * FROM tender WHERE request_id = ?').get(requestId) as TenderRow | undefined
  return {
    state,
    documents: parse<DocumentRef[]>(t?.documents_json, []),
    winnerProposal: parse(t?.winner_proposal_json, null),
    selectedWinner: parse(t?.selected_winner_json, null),
    contract: parse(t?.contract_json, null),
    lastReviewComment: t?.last_review_comment ?? null,
  }
}

export function getTender(ctx: Ctx, id: string) {
  loadRequest(ctx, id)
  return tenderDocument(id)
}

interface PackageRow {
  version: number
  documents_json: string
  approved_at: string | null
  last_review_comment: string | null
}

export function packageRow(requestId: string, version?: number): PackageRow | undefined {
  const db = getDb()
  return (
    version === undefined
      ? db.prepare('SELECT * FROM package_versions WHERE request_id = ? ORDER BY version DESC LIMIT 1').get(requestId)
      : db.prepare('SELECT * FROM package_versions WHERE request_id = ? AND version = ?').get(requestId, version)
  ) as PackageRow | undefined
}

/** `version` is an addition to the contract schema (needed to call submitPackage); see docs/DECISIONS.md. */
export function packageDocument(requestId: string, version?: number) {
  const state = stepState(requestId, 'PACKAGE')
  const p = packageRow(requestId, version)
  if (!p) return { state, version: 0, documents: [], approvedAt: null, lastReviewComment: null }
  return {
    state,
    version: p.version,
    documents: parse<DocumentRef[]>(p.documents_json, []),
    approvedAt: p.approved_at,
    lastReviewComment: p.last_review_comment,
  }
}

export function getPackage(ctx: Ctx, id: string) {
  loadRequest(ctx, id)
  return packageDocument(id)
}

export function selectWinner(ctx: Ctx, id: string, body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const quoteId = c.uuid(o.quoteId, 'quoteId')
  const comment = c.string(o, 'comment', { optional: true, max: 2000 })
  c.done()
  return tx((db) => {
    loadRequest(ctx, id)
    const st = stepState(id, 'TENDER')
    if (st !== 'DRAFT_READY' && st !== 'NEEDS_REWORK') throw stepNotAllowed('Выбор победителя сейчас недоступен')
    const q = db.prepare('SELECT contractor_id FROM quotes WHERE id = ? AND request_id = ? AND org_id = ?').get(quoteId, id, ctx.orgId) as
      | { contractor_id: string | null }
      | undefined
    if (!q) throw validation([{ field: 'quoteId', message: 'КП не принадлежит заявке' }])
    const gw = getGateways()
    const contractor = q.contractor_id ? gw.reference.getContractor(q.contractor_id) : null
    const nonStandard = contractor?.nonstandardContract === true
    const tender = tenderDocument(id)
    const evaluation = tender.documents.find((d) => d.kind === 'EVALUATION_PROTOCOL')
    const contractDoc: DocumentRef = {
      kind: 'CONTRACT',
      name: nonStandard ? 'Проект договора, черновик (ДЕМО)' : 'Типовой договор подряда (ДЕМО)',
      fileId: gw.documents.createDocument(ctx.orgId, nonStandard ? 'Проект договора, черновик (ДЕМО).pdf' : 'Типовой договор подряда (ДЕМО).pdf'),
      version: 1,
    }
    const contract = {
      type: nonStandard ? 'NON_STANDARD' : 'STANDARD',
      document: contractDoc,
      lawyerNotes: nonStandard ? ['ДЕМО. Проверить раздел об ответственности сторон', 'ДЕМО. Согласовать порядок приёмки работ'] : [],
    }
    const selected = { quoteId, selectedBy: userRef(ctx.userId, ctx.displayName), selectedAt: nowIso(), ...(comment ? { comment } : {}) }
    db.prepare(
      `INSERT INTO tender (request_id, selected_winner_json, contract_json) VALUES (?, ?, ?)
       ON CONFLICT(request_id) DO UPDATE SET selected_winner_json = excluded.selected_winner_json, contract_json = excluded.contract_json`,
    ).run(id, JSON.stringify(selected), JSON.stringify(contract))
    setStep(id, 'TENDER', 'DRAFT_READY')

    const prevPkg = packageRow(id)
    const tzVersion = tzRow(id)?.version ?? 1
    const documents: DocumentRef[] = [
      { kind: 'TZ', name: `Техническое задание, версия ${tzVersion} (ДЕМО)`, fileId: gw.documents.createDocument(ctx.orgId, `Техническое задание, версия ${tzVersion} (ДЕМО).pdf`), version: tzVersion },
      { kind: 'QUOTE_FORM', name: 'Форма КП (ДЕМО)', fileId: gw.documents.createDocument(ctx.orgId, 'Форма КП (ДЕМО).xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), version: 1 },
      contractDoc,
      { kind: 'EVALUATION_PROTOCOL', name: 'Протокол оценки (ДЕМО)', fileId: evaluation?.fileId ?? gw.documents.createDocument(ctx.orgId, 'Протокол оценки (ДЕМО).pdf'), version: 1 },
    ]
    db.prepare(
      'INSERT INTO package_versions (request_id, version, documents_json, approved_at, last_review_comment, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run(id, (prevPkg?.version ?? 0) + 1, JSON.stringify(documents), prevPkg?.last_review_comment ?? null, nowIso())
    setStep(id, 'PACKAGE', 'DRAFT_READY')
    return tenderDocument(id)
  })
}

export function submitPackage(ctx: Ctx, id: string, body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const version = c.int(o, 'version')
  c.done()
  return tx(() => {
    const req = loadRequest(ctx, id)
    if (stepState(id, 'PACKAGE') !== 'DRAFT_READY') throw stepNotAllowed('Пакет сейчас нельзя отправить')
    const cur = packageRow(id)
    if (!cur) throw notFound('Пакет')
    if (cur.version !== version) throw staleVersion()
    const aid = createApproval(ctx, req, 'PACKAGE', cur.version)
    setStep(id, 'PACKAGE', 'IN_REVIEW')
    return approvalById(ctx, aid)
  })
}

