import { getDb } from '../db'
import type { Contractor, ReferenceGateway } from '../gateway'

interface Row {
  id: string
  name: string
  email: string
  nonstandard_contract: number
}

const map = (r: Row): Contractor => ({ id: r.id, name: r.name, email: r.email, nonstandardContract: r.nonstandard_contract === 1 })

export class MockReference implements ReferenceGateway {
  listContractors() {
    return (getDb().prepare('SELECT * FROM mock_contractors ORDER BY id').all() as Row[]).map(map)
  }

  getContractor(id: string) {
    const r = getDb().prepare('SELECT * FROM mock_contractors WHERE id = ?').get(id) as Row | undefined
    return r ? map(r) : null
  }
}
