import type { Money, StepName, StepState, RequestStatus, SubjectType } from '~/types'

export const STEP_ORDER: StepName[] = ['TRIAGE', 'TZ', 'QUOTES_NMC', 'TENDER', 'PACKAGE']
export const STEP_LABEL: Record<StepName, string> = {
  TRIAGE: 'Триаж',
  TZ: 'ТЗ',
  QUOTES_NMC: 'КП и НМЦ',
  TENDER: 'Документы',
  PACKAGE: 'Пакет',
}
export const STATE_LABEL: Record<StepState, string> = {
  NOT_STARTED: 'Не начат',
  PROCESSING: 'Обрабатывается',
  DRAFT_READY: 'Черновик готов',
  IN_REVIEW: 'На проверке',
  NEEDS_REWORK: 'На доработке',
  APPROVED: 'Утверждено',
  AI_FAILED: 'Сбой ИИ',
}
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  ACCEPTED: 'Принята',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Выполнена',
}
export const SUBJECT_LABEL: Record<SubjectType, string> = { TZ: 'ТЗ', NMC: 'Расчёт НМЦ', PACKAGE: 'Пакет документов' }
export const ROLE_LABEL = { RESIDENT: 'Житель', STAFF: 'Сотрудник УК', REVIEWER: 'Проверяющий' } as const

export const shortId = (id: string) => id.slice(0, 6).toUpperCase()

export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

export function formatMoney(m?: Money): string {
  if (!m) return '—'
  const [i, f] = m.amount.split('.')
  const grouped = i!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const cur = m.currency === 'RUB' ? '₽' : m.currency
  return `${grouped}${f && f !== '00' ? ',' + f : ''} ${cur}`
}

/** Russian plural: plural(2, 'заявка', 'заявки', 'заявок') */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}
