import { fromCents, toCents } from '../utils/validate'

export interface Money {
  amount: string
  currency: string
}

export interface QuoteItem {
  name: string
  quantity?: number
  unit?: string
  unitPrice?: Money
  price?: Money
}

export interface QuoteData {
  contractorName?: string
  totalPrice?: Money
  termsDays?: number
  warranty?: string
  items?: QuoteItem[]
  discrepancies?: string[]
}

export type Flag = 'NONE' | 'MISSING' | 'MISMATCH' | 'OUTLIER'

export interface Comparison {
  quotes: { quoteId: string; contractorName: string; totalPrice?: Money; termsDays?: number; warranty?: string }[]
  rows: {
    name: string
    unit?: string
    quantity?: number
    cells: { quoteId: string; unitPrice?: Money; price?: Money; flag: Flag; note?: string }[]
  }[]
  discrepancies: string[]
}

const key = (s: string) => s.trim().toLowerCase()

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Comparison rules from docs/API.md, section 6. Input: quotes already in EXTRACTED state. */
export function buildComparison(quotes: { id: string; data: QuoteData | null }[]): Comparison {
  const names = new Map<string, string>() // key -> first seen name
  for (const q of quotes) for (const it of q.data?.items ?? []) if (!names.has(key(it.name))) names.set(key(it.name), it.name)

  const rows: Comparison['rows'] = []
  const discrepancies: string[] = []
  const cname = (id: string) => quotes.find((q) => q.id === id)?.data?.contractorName ?? '—'

  for (const [k, name] of names) {
    const found = quotes.map((q) => ({ q, item: (q.data?.items ?? []).find((i) => key(i.name) === k) }))
    const present = found.filter((f) => f.item)
    // majority unit: most frequent, ties go to the first seen
    const counts = new Map<string, number>()
    for (const f of present) if (f.item!.unit) counts.set(f.item!.unit!, (counts.get(f.item!.unit!) ?? 0) + 1)
    let majority: string | undefined
    let best = 0
    for (const [u, c] of counts) if (c > best) ((majority = u), (best = c))

    const prices = present.filter((f) => f.item!.unitPrice).map((f) => Number(toCents(f.item!.unitPrice!.amount)))
    const med = prices.length >= 3 ? median(prices) : null

    const cells = found.map(({ q, item }) => {
      if (!item) {
        discrepancies.push(`«${name}»: MISSING у «${cname(q.id)}»`)
        return { quoteId: q.id, flag: 'MISSING' as Flag, note: 'Позиции нет в этом КП, а в других есть' }
      }
      let flag: Flag = 'NONE'
      let note: string | undefined
      if (item.unit && majority && item.unit !== majority) {
        flag = 'MISMATCH'
        note = `Единица измерения «${item.unit}» отличается от большинства КП («${majority}»)`
      } else if (med !== null && item.unitPrice && Number(toCents(item.unitPrice.amount)) > med * 1.3) {
        flag = 'OUTLIER'
        note = 'Цена за единицу больше 1,3 медианы по этой позиции'
      }
      if (flag !== 'NONE') discrepancies.push(`«${name}»: ${flag} у «${cname(q.id)}»`)
      return { quoteId: q.id, unitPrice: item.unitPrice, price: item.price, flag, ...(note ? { note } : {}) }
    })
    const first = present[0]?.item
    rows.push({ name, unit: majority ?? first?.unit, quantity: first?.quantity, cells })
  }

  return {
    quotes: quotes.map((q) => ({
      quoteId: q.id,
      contractorName: q.data?.contractorName ?? '—',
      totalPrice: q.data?.totalPrice,
      termsDays: q.data?.termsDays,
      warranty: q.data?.warranty,
    })),
    rows,
    discrepancies,
  }
}

/** Arithmetic mean of amounts in cents, rounded to kopecks HALF_UP. */
export function averageAmount(amounts: string[]): string {
  const n = BigInt(amounts.length)
  const sum = amounts.reduce((a, x) => a + toCents(x), BigInt(0))
  return fromCents((BigInt(2) * sum + n) / (BigInt(2) * n))
}

export function warrantyMonths(w: string | undefined): number {
  const m = /\d+/.exec(w ?? '')
  return m ? Number(m[0]) : 0
}

/** HALF_UP of 10*num/den to one decimal. */
function score(num: bigint, den: bigint): number {
  if (den <= BigInt(0)) return 0
  const tenths = (BigInt(200) * num + den) / (BigInt(2) * den)
  return Number(tenths) / 10
}

export interface WinnerProposalResult {
  quoteId: string
  rationale: string
  scores: { quoteId: string; criterion: string; score: number }[]
}

/** docs/MOCKS.md 2.5: lowest price among quotes without MISSING/OUTLIER, else lowest price overall. */
export function proposeWinner(quotes: { id: string; data: QuoteData | null }[]): WinnerProposalResult | null {
  const priced = quotes.filter((q) => q.data?.totalPrice)
  if (!priced.length) return null
  const cmp = buildComparison(quotes)
  const flagged = new Set<string>()
  for (const r of cmp.rows) for (const c of r.cells) if (c.flag === 'MISSING' || c.flag === 'OUTLIER') flagged.add(c.quoteId)
  const total = (q: { data: QuoteData | null }) => toCents(q.data!.totalPrice!.amount)
  const lowest = (list: typeof priced) => list.reduce((a, b) => (total(b) < total(a) ? b : a))
  const clean = priced.filter((q) => !flagged.has(q.id))
  const winner = lowest(clean.length ? clean : priced)

  const minPrice = total(lowest(priced))
  const terms = priced.map((q) => q.data!.termsDays ?? 0).filter((t) => t > 0)
  const minTerms = terms.length ? Math.min(...terms) : 0
  const maxWarranty = Math.max(0, ...priced.map((q) => warrantyMonths(q.data!.warranty)))
  const scores: WinnerProposalResult['scores'] = []
  for (const q of priced) {
    scores.push({ quoteId: q.id, criterion: 'Цена', score: score(minPrice, total(q)) })
    scores.push({ quoteId: q.id, criterion: 'Срок', score: score(BigInt(minTerms), BigInt(q.data!.termsDays ?? 0)) })
    scores.push({
      quoteId: q.id,
      criterion: 'Гарантия',
      score: score(BigInt(warrantyMonths(q.data!.warranty)), BigInt(maxWarranty)),
    })
  }
  return { quoteId: winner.id, rationale: 'ДЕМО. Наименьшая цена среди КП без расхождений.', scores }
}
