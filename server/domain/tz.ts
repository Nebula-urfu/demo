import { getDb, tx } from '../db'
import { staleVersion, stepNotAllowed, validation } from '../utils/errors'
import type { Ctx } from '../utils/session'
import { nowIso } from '../utils/time'
import { asObject, Checker, isObj } from '../utils/validate'
import { approvalById, createApproval } from './review'
import { loadRequest, parse, setStep, stepState } from './store'

interface TzRow {
  version: number
  origin: 'AI' | 'STAFF'
  sections_json: string
  questions_json: string
  last_review_comment: string | null
  created_at: string
}

interface Section {
  id: string
  title: string
  text: string
  sources?: string[]
  editedByStaff?: boolean
}

interface Question {
  id: string
  text: string
  answer: string | null
}

export function tzRow(requestId: string, version?: number): TzRow | undefined {
  const db = getDb()
  return (
    version === undefined
      ? db.prepare('SELECT * FROM tz_versions WHERE request_id = ? ORDER BY version DESC LIMIT 1').get(requestId)
      : db.prepare('SELECT * FROM tz_versions WHERE request_id = ? AND version = ?').get(requestId, version)
  ) as TzRow | undefined
}

export function tzDocument(requestId: string, version?: number) {
  const state = stepState(requestId, 'TZ')
  const r = tzRow(requestId, version)
  if (!r) return { state, version: 0, sections: [], openQuestions: [] }
  return {
    state,
    version: r.version,
    sections: parse<Section[]>(r.sections_json, []),
    openQuestions: parse<Question[]>(r.questions_json, []),
    origin: r.origin,
    lastReviewComment: r.last_review_comment,
    updatedAt: r.created_at,
  }
}

export function getTz(ctx: Ctx, id: string) {
  loadRequest(ctx, id)
  return tzDocument(id)
}

export function updateTz(ctx: Ctx, id: string, body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const baseVersion = c.int(o, 'baseVersion')
  const secs: { id: string; title?: string; text: string }[] = []
  if (o.sections !== undefined) {
    if (!Array.isArray(o.sections)) c.err('sections', 'Должен быть массив')
    else
      o.sections.forEach((s, i) => {
        if (!isObj(s)) return c.err(`sections[${i}]`, 'Должен быть объект')
        const sid = c.string(s, 'id', { min: 1 })
        const text = c.string(s, 'text', { trim: false })
        const title = c.string(s, 'title', { optional: true })
        if (sid !== undefined && text !== undefined) secs.push({ id: sid, text, title })
      })
  }
  const answers: { questionId: string; answer: string }[] = []
  if (o.answers !== undefined) {
    if (!Array.isArray(o.answers)) c.err('answers', 'Должен быть массив')
    else
      o.answers.forEach((a, i) => {
        if (!isObj(a)) return c.err(`answers[${i}]`, 'Должен быть объект')
        const qid = c.string(a, 'questionId', { min: 1 })
        const ans = c.string(a, 'answer', { trim: false })
        if (qid !== undefined && ans !== undefined) answers.push({ questionId: qid, answer: ans })
      })
  }
  c.done()

  return tx((db) => {
    loadRequest(ctx, id)
    if (stepState(id, 'TZ') !== 'DRAFT_READY') throw stepNotAllowed('ТЗ не в состоянии DRAFT_READY')
    const cur = tzRow(id)
    if (!cur || cur.version !== baseVersion) throw staleVersion()
    const sections = parse<Section[]>(cur.sections_json, [])
    const questions = parse<Question[]>(cur.questions_json, [])
    const bad: { field: string; message: string }[] = []
    for (const s of secs) {
      const t = sections.find((x) => x.id === s.id)
      if (!t) bad.push({ field: 'sections', message: `Неизвестная секция ${s.id}` })
      else {
        const title = s.title ?? t.title
        if (s.text !== t.text || title !== t.title) t.editedByStaff = true
        t.text = s.text
        t.title = title
      }
    }
    for (const a of answers) {
      const q = questions.find((x) => x.id === a.questionId)
      if (!q) bad.push({ field: 'answers', message: `Неизвестный вопрос ${a.questionId}` })
      else q.answer = a.answer
    }
    if (bad.length) throw validation(bad)
    db.prepare(
      "INSERT INTO tz_versions (request_id, version, origin, sections_json, questions_json, last_review_comment, created_at) VALUES (?, ?, 'STAFF', ?, ?, ?, ?)",
    ).run(id, cur.version + 1, JSON.stringify(sections), JSON.stringify(questions), cur.last_review_comment, nowIso())
    setStep(id, 'TZ', 'DRAFT_READY')
    return tzDocument(id)
  })
}

export function submitTz(ctx: Ctx, id: string, body: unknown) {
  const o = asObject(body)
  const c = new Checker()
  const version = c.int(o, 'version')
  c.done()
  return tx(() => {
    const req = loadRequest(ctx, id)
    if (stepState(id, 'TZ') !== 'DRAFT_READY') throw stepNotAllowed('ТЗ не в состоянии DRAFT_READY')
    const cur = tzRow(id)
    if (!cur || cur.version !== version) throw staleVersion()
    const approvalId = createApproval(ctx, req, 'TZ', cur.version)
    setStep(id, 'TZ', 'IN_REVIEW')
    return approvalById(ctx, approvalId)
  })
}
