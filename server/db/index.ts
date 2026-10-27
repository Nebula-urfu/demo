import Database from 'better-sqlite3'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { dbPath } from '../utils/config'
import { nowIso } from '../utils/time'

export type Db = Database.Database

// Fixed contractor ids from docs/MOCKS.md (mock Reference Data).
const CONTRACTORS: [string, string, string, number][] = [
  ['11111111-1111-4111-8111-111111111111', 'ООО «Демо-Кровля» (ДЕМО)', 'demo-krovlya@example.com', 0],
  ['22222222-2222-4222-8222-222222222222', 'ИП Демонстрационный А. Б. (ДЕМО)', 'demo-ip@example.com', 0],
  ['33333333-3333-4333-8333-333333333333', 'ООО «Тест-Строй» (ДЕМО)', 'demo-test@example.com', 1],
]

let db: Db | null = null
let schemaSql = ''

/** The DDL from server/db/schema.sql is passed in by the Nitro plugin (or by tests). */
export function setSchema(sql: string) {
  schemaSql = sql
}

function open(reset: boolean): Db {
  const path = dbPath()
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
    if (reset) for (const s of ['', '-wal', '-shm']) rmSync(path + s, { force: true })
  }
  const fresh = path === ':memory:' || reset || !existsSync(path)
  const conn = new Database(path)
  if (path !== ':memory:') conn.pragma('journal_mode = WAL')
  conn.pragma('busy_timeout = 5000')
  conn.pragma('foreign_keys = ON')
  if (fresh) {
    if (!schemaSql) throw new Error('schema.sql is not loaded: call setSchema() first')
    conn.exec(schemaSql)
    const ins = conn.prepare('INSERT INTO mock_contractors (id, name, email, nonstandard_contract) VALUES (?, ?, ?, ?)')
    for (const c of CONTRACTORS) ins.run(...c)
  }
  return conn
}

export function getDb(): Db {
  if (!db) db = open(false)
  return db
}

/** Drops and recreates the whole database (tables cannot be cleaned row by row: triggers protect the journal). */
export function resetDb(): Db {
  if (db) db.close()
  db = open(true)
  return db
}

export function initDb(reset: boolean): Db {
  if (db) db.close()
  db = open(reset)
  return db
}

export function tx<T>(fn: (db: Db) => T): T {
  const d = getDb()
  return d.transaction(() => fn(d))()
}

export { nowIso }
