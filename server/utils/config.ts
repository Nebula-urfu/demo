import { resolve } from 'node:path'

export function dbPath(): string {
  const p = process.env.DEMO_DB_PATH
  if (p === ':memory:') return p
  return resolve(process.cwd(), p || 'data/demo.db')
}

export function resetOnStart(): boolean {
  return (process.env.DEMO_RESET_ON_START ?? 'true') !== 'false'
}

export function aiDelayMs(): number {
  const n = Number(process.env.DEMO_AI_DELAY_MS ?? 1500)
  return Number.isFinite(n) && n >= 0 ? n : 1500
}
