import { getDb, tx } from '../db'
import { getGateways } from '../gateway'
import { notFound, staleVersion, stepNotAllowed, validation } from '../utils/errors'
import type { Ctx } from '../utils/session'
import { nowIso } from '../utils/time'
import { asObject, Checker, isObj, MONEY_RE } from '../utils/validate'
import { averageAmount, buildComparison, type QuoteData } from './compare'
import { approvalById, createApproval } from './review'
import { loadRequest, parse, setStep, stepState, uuid, type FileRef } from './store'

interface QuoteRow {
  id: string
  request_id: string
  org_id: string
  contractor_id: string | null
  extraction: 'EXTRACTING' | 'EXTRACTED' | 'AI_FAILED'
  version: number
  data_json: string | null
  edited_by_staff: number
  seq: number
  created_at: string
}

function quoteFiles(quoteId: string): FileRef[] {
  return (
    getDb().prepare('SELECT file_id, name, media_type, size_bytes FROM quote_files WHERE quote_id = ?').all(quoteId) as {
      file_id: string
      name: string
      media_type: string
      size_bytes: number
    }[]
  ).map((f) => ({ fileId: f.file_id, name: f.name, mediaType: f.media_type, sizeBytes: f.size_bytes }))
}

function quoteView(q: QuoteRow) {
  return {
    id: q.id,
    contractorId: q.contractor_id,
    extraction: q.extraction,
    version: q.version,
    files: quoteFiles(q.id),
    data: parse<QuoteData | null>(q.data_json, null),
    editedByStaff: q.edited_by_staff === 1,
    createdAt: q.created_at,
  }
}

function quoteRows(ctx: Ctx, requestId: string): QuoteRow[] {
  return getDb().prepare('SELECT * FROM quotes WHERE request_id = ? AND org_id = ? ORDER BY seq').all(requestId, ctx.orgId) as QuoteRow[]
}

function quoteRow(ctx: Ctx, requestId: string, quoteId: string): QuoteRow {
  const q = getDb()
    .prepare('SELECT * FROM quotes WHERE id = ? AND request_id = ? AND org_id = ?')
    .get(quoteId, requestId, ctx.orgId) as QuoteRow | undefined
  if (!q) throw notFound('КП')
  return q
}

const locked = (s: string) => s === 'IN_REVIEW' || s === 'APPROVED'

export function createQuoteRequest(ctx: Ctx, id: string, body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const ids = o.contractorIds
  if (!Array.isArray(ids) || ids.length < 1) c.err('contractorIds', 'Нужен хотя бы один подрядчик')
  else ids.forEach((x, i) => c.uuid(x, `contractorIds[${i}]`))
  c.done()
  const req = loadRequest(ctx, id)
  if (stepState(id, 'TZ') !== 'APPROVED') throw stepNotAllowed('ТЗ ещё не утверждено')
  const gw = getGateways()
  const recipients = (ids as string[]).map((cid) => gw.reference.getContractor(cid))
  const missing = (ids as string[]).filter((_, i) => !recipients[i])
  if (missing.length) throw validation(missing.map((m) => ({ field: 'contractorIds', message: `Нет в справочнике: ${m}` })))
  const attach = (name: string, mediaType: string): FileRef => {
    const fileId = gw.documents.createDocument(ctx.orgId, name, mediaType)
    return { fileId, name, mediaType, sizeBytes: 1024 }
  }
  return tx(() => ({
    id: uuid(),
    recipients: recipients.map((r) => ({ contractorId: r!.id, name: r!.name, email: r!.email })),
    subject: 'Запрос коммерческого предложения (ДЕМО)',
    body: `Здравствуйте! Просим направить коммерческое предложение на работы по адресу: ${req.address}. Техническое задание и форма КП во вложении. Это демонстрационное письмо, оно никуда не отправляется.`,
    attachments: [
      attach(`Техническое задание (ДЕМО).pdf`, 'application/pdf'),
      attach('Форма КП (ДЕМО).xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ],
  }))
}

export function listQuotes(ctx: Ctx, id: string) {
  loadRequest(ctx, id)
  return { items: quoteRows(ctx, id).map(quoteView) }
}

export function createQuote(ctx: Ctx, id: string, body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const fileIds = o.fileIds
  if (!Array.isArray(fileIds) || fileIds.length < 1) c.err('fileIds', 'Нужен хотя бы один файл')
  else fileIds.forEach((x, i) => c.uuid(x, `fileIds[${i}]`))
  let contractorId: string | null = null
  if (o.contractorId !== undefined && o.contractorId !== null) contractorId = c.uuid(o.contractorId, 'contractorId') ?? null
  c.done()
  return tx((db) => {
    loadRequest(ctx, id)
    if (stepState(id, 'TZ') !== 'APPROVED') throw stepNotAllowed('ТЗ ещё не утверждено')
    if (locked(stepState(id, 'QUOTES_NMC'))) throw stepNotAllowed('Приём КП закрыт: расчёт НМЦ на проверке или утверждён')
    const seq = ((db.prepare('SELECT MAX(seq) AS m FROM quotes WHERE request_id = ?').get(id) as { m: number | null }).m ?? 0) + 1
    const qid = uuid()
    db.prepare(
      "INSERT INTO quotes (id, request_id, org_id, contractor_id, extraction, version, data_json, edited_by_staff, seq, created_at) VALUES (?, ?, ?, ?, 'EXTRACTING', 1, NULL, 0, ?, ?)",
    ).run(qid, id, ctx.orgId, contractorId, seq, nowIso())
    const gw = getGateways()
    const insFile = db.prepare('INSERT OR IGNORE INTO quote_files (quote_id, file_id, name, media_type, size_bytes) VALUES (?, ?, ?, ?, ?)')
    for (const fid of fileIds as string[]) {
      const f = gw.documents.describeFile(ctx.orgId, fid)
      insFile.run(qid, fid, f?.name ?? 'неизвестно', f?.mediaType ?? 'application/octet-stream', f?.sizeBytes ?? 0)
    }
    setStep(id, 'QUOTES_NMC', 'PROCESSING')
    gw.ai.submit({ orgId: ctx.orgId, requestId: id, jobType: 'quotes_extraction', payload: { quoteId: qid } })
    return quoteView(quoteRow(ctx, id, qid))
  })
}

export function getQuoteComparison(ctx: Ctx, id: string) {
  loadRequest(ctx, id)
  const quotes = quoteRows(ctx, id)
    .filter((q) => q.extraction === 'EXTRACTED')
    .map((q) => ({ id: q.id, data: parse<QuoteData | null>(q.data_json, null) }))
  return buildComparison(quotes)
}

export function deleteQuote(ctx: Ctx, id: string, quoteId: string) {
  tx((db) => {
    loadRequest(ctx, id)
    quoteRow(ctx, id, quoteId)
    const st = stepState(id, 'QUOTES_NMC')
    if (locked(st)) throw stepNotAllowed('Удаление закрыто: расчёт НМЦ на проверке или утверждён')
    db.prepare('DELETE FROM quotes WHERE id = ?').run(quoteId)
    const left = quoteRows(ctx, id)
    if (!left.length) setStep(id, 'QUOTES_NMC', 'NOT_STARTED')
    else if (st === 'PROCESSING' && !left.some((q) => q.extraction === 'EXTRACTING')) setStep(id, 'QUOTES_NMC', 'DRAFT_READY')
  })
}

function validateQuoteData(data: unknown, c: Checker): QuoteData | undefined {
  if (!isObj(data)) {
    c.err('data', 'Должен быть объект')
    return undefined
  }
  const money = (v: unknown, f: string) => {
    if (v === undefined) return
    if (!isObj(v) || typeof v.amount !== 'string' || !MONEY_RE.test(v.amount)) c.err(f, 'Ожидается {amount: "123.45", currency}')
  }
  money(data.totalPrice, 'data.totalPrice')
  if (data.items !== undefined) {
    if (!Array.isArray(data.items)) c.err('data.items', 'Должен быть массив')
    else
      data.items.forEach((it, i) => {
        if (!isObj(it) || typeof it.name !== 'string' || !it.name.trim()) return c.err(`data.items[${i}].name`, 'Обязательное поле')
        money(it.unitPrice, `data.items[${i}].unitPrice`)
        money(it.price, `data.items[${i}].price`)
      })
  }
  if (data.termsDays !== undefined && (typeof data.termsDays !== 'number' || !Number.isInteger(data.termsDays))) c.err('data.termsDays', 'Целое число')
  return data as QuoteData
}

export function updateQuoteData(ctx: Ctx, id: string, quoteId: string, body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const baseVersion = c.int(o, 'baseVersion')
  const data = validateQuoteData(o.data, c)
  let contractorId: string | null | undefined
  if (o.contractorId !== undefined) contractorId = o.contractorId === null ? null : c.uuid(o.contractorId, 'contractorId')
  c.done()
  return tx((db) => {
    loadRequest(ctx, id)
    const q = quoteRow(ctx, id, quoteId)
    if (q.extraction !== 'EXTRACTED' || locked(stepState(id, 'QUOTES_NMC'))) throw stepNotAllowed('Данные КП сейчас нельзя менять')
    if (q.version !== baseVersion) throw staleVersion()
    db.prepare('UPDATE quotes SET data_json = ?, version = version + 1, edited_by_staff = 1, contractor_id = ? WHERE id = ?').run(
      JSON.stringify(data),
      contractorId === undefined ? q.contractor_id : contractorId,
      quoteId,
    )
    return quoteView(quoteRow(ctx, id, quoteId))
  })
}

interface NmcRow {
  version: number
  method: string
  amount: string
  currency: string
  justification: string
  quote_ids_json: string
  last_review_comment: string | null
  calculated_at: string
}

export function nmcRow(requestId: string, version?: number): NmcRow | undefined {
  const db = getDb()
  return (
    version === undefined
      ? db.prepare('SELECT * FROM nmc_versions WHERE request_id = ? ORDER BY version DESC LIMIT 1').get(requestId)
      : db.prepare('SELECT * FROM nmc_versions WHERE request_id = ? AND version = ?').get(requestId, version)
  ) as NmcRow | undefined
}

export function nmcDocument(requestId: string, version?: number) {
  const state = stepState(requestId, 'QUOTES_NMC')
  const r = nmcRow(requestId, version)
  if (!r) return { state, version: 0 }
  return {
    state,
    version: r.version,
    method: r.method,
    amount: { amount: r.amount, currency: r.currency },
    justification: r.justification,
    quoteIds: parse<string[]>(r.quote_ids_json, []),
    lastReviewComment: r.last_review_comment,
    calculatedAt: r.calculated_at,
  }
}

export function getNmc(ctx: Ctx, id: string) {
  loadRequest(ctx, id)
  return nmcDocument(id)
}

export function calculateNmc(ctx: Ctx, id: string, body: unknown) {
  const o = body === undefined || body === null ? {} : asObject(body)
  const c = new Checker()
  const method = c.string(o, 'method', { optional: true })
  if (method !== undefined && method !== 'average_of_quotes') c.err('method', 'Поддерживается только average_of_quotes')
  let quoteIds: string[] | undefined
  if (o.quoteIds !== undefined) {
    if (!Array.isArray(o.quoteIds)) c.err('quoteIds', 'Должен быть массив')
    else {
      o.quoteIds.forEach((x, i) => c.uuid(x, `quoteIds[${i}]`))
      quoteIds = o.quoteIds as string[]
    }
  }
  c.done()
  return tx((db) => {
    loadRequest(ctx, id)
    const st = stepState(id, 'QUOTES_NMC')
    if (st !== 'DRAFT_READY' && st !== 'NEEDS_REWORK') throw stepNotAllowed('Расчёт НМЦ сейчас недоступен')
    const extracted = quoteRows(ctx, id).filter((q) => q.extraction === 'EXTRACTED')
    if (!extracted.length) throw validation([{ field: 'quoteIds', message: 'Нет КП с извлечёнными данными' }])
    let chosen = extracted
    if (quoteIds) {
      const bad = quoteIds.filter((qid) => !extracted.some((q) => q.id === qid))
      if (bad.length) throw validation(bad.map((b) => ({ field: 'quoteIds', message: `КП не найдено или не обработано: ${b}` })))
      chosen = extracted.filter((q) => quoteIds!.includes(q.id))
      if (!chosen.length) throw validation([{ field: 'quoteIds', message: 'Список пуст' }])
    }
    const totals: string[] = []
    for (const q of chosen) {
      const t = parse<QuoteData | null>(q.data_json, null)?.totalPrice?.amount
      if (!t || !MONEY_RE.test(t)) throw validation([{ field: 'quoteIds', message: `У КП ${q.id} нет итоговой цены` }])
      totals.push(t)
    }
    const amount = averageAmount(totals)
    const prev = nmcRow(id)
    db.prepare(
      'INSERT INTO nmc_versions (request_id, version, method, amount, currency, justification, quote_ids_json, last_review_comment, calculated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      (prev?.version ?? 0) + 1,
      'average_of_quotes',
      amount,
      'RUB',
      `ДЕМО. Среднее арифметическое итоговых цен ${chosen.length} КП. Метод условный, расчёт не основан на реальных нормативах.`,
      JSON.stringify(chosen.map((q) => q.id)),
      prev?.last_review_comment ?? null,
      nowIso(),
    )
    setStep(id, 'QUOTES_NMC', 'DRAFT_READY')
    return nmcDocument(id)
  })
}

export function submitNmc(ctx: Ctx, id: string, body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const version = c.int(o, 'version')
  c.done()
  return tx(() => {
    const req = loadRequest(ctx, id)
    if (stepState(id, 'QUOTES_NMC') !== 'DRAFT_READY') throw stepNotAllowed('Расчёт НМЦ сейчас нельзя отправить')
    const cur = nmcRow(id)
    if (!cur) throw stepNotAllowed('Расчёт НМЦ ещё не выполнен')
    if (cur.version !== version) throw staleVersion()
    const aid = createApproval(ctx, req, 'NMC', cur.version)
    setStep(id, 'QUOTES_NMC', 'IN_REVIEW')
    return approvalById(ctx, aid)
  })
}

