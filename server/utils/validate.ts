import { validation, type FieldError } from './errors'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const MONEY_RE = /^-?\d+(\.\d{1,2})?$/

export type Obj = Record<string, unknown>

export function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export class Checker {
  errors: FieldError[] = []
  err(field: string, message: string) {
    this.errors.push({ field, message })
  }
  done() {
    if (this.errors.length) throw validation(this.errors)
  }
  string(o: Obj, field: string, opts: { min?: number; max?: number; optional?: boolean; trim?: boolean } = {}): string | undefined {
    const v = o[field]
    if (v === undefined || v === null) {
      if (!opts.optional) this.err(field, 'Обязательное поле')
      return undefined
    }
    if (typeof v !== 'string') {
      this.err(field, 'Должна быть строка')
      return undefined
    }
    const s = opts.trim === false ? v : v.trim()
    if (opts.min !== undefined && s.length < opts.min) this.err(field, `Минимальная длина ${opts.min}`)
    if (opts.max !== undefined && s.length > opts.max) this.err(field, `Максимальная длина ${opts.max}`)
    return s
  }
  int(o: Obj, field: string): number | undefined {
    const v = o[field]
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      this.err(field, 'Должно быть целое число')
      return undefined
    }
    return v
  }
  enum<T extends string>(o: Obj, field: string, values: readonly T[]): T | undefined {
    const v = o[field]
    if (typeof v !== 'string' || !values.includes(v as T)) {
      this.err(field, `Допустимые значения: ${values.join(', ')}`)
      return undefined
    }
    return v as T
  }
  uuid(v: unknown, field: string): string | undefined {
    if (typeof v !== 'string' || !UUID_RE.test(v)) {
      this.err(field, 'Должен быть UUID')
      return undefined
    }
    return v
  }
}

export function asObject(body: unknown): Obj {
  if (!isObj(body)) throw validation([{ field: 'body', message: 'Ожидается JSON-объект' }])
  return body
}

/** Decimal string -> integer cents. */
export function toCents(amount: string): bigint {
  const neg = amount.startsWith('-')
  const [i = '0', f = ''] = amount.replace('-', '').split('.')
  const cents = BigInt(i) * BigInt(100) + BigInt((f + '00').slice(0, 2))
  return neg ? -cents : cents
}

export function fromCents(c: bigint): string {
  const neg = c < BigInt(0)
  const a = neg ? -c : c
  return `${neg ? '-' : ''}${a / BigInt(100)}.${String(a % BigInt(100)).padStart(2, '0')}`
}
