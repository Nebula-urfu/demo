import { getDb } from '../db'
import { forbidden, unauthorized } from './errors'

export type Role = 'RESIDENT' | 'STAFF' | 'REVIEWER'

export interface Ctx {
  userId: string
  displayName: string
  role: Role
  orgId: string
  address: string
}

export function authenticate(token: string | undefined): Ctx {
  if (!token) throw unauthorized()
  const row = getDb()
    .prepare('SELECT user_id, display_name, role, org_id, address FROM sessions WHERE token = ?')
    .get(token) as { user_id: string; display_name: string; role: Role; org_id: string; address: string } | undefined
  if (!row) throw unauthorized()
  return { userId: row.user_id, displayName: row.display_name, role: row.role, orgId: row.org_id, address: row.address }
}

export function requireRole(ctx: Ctx, roles: Role[] | undefined) {
  if (roles && !roles.includes(ctx.role)) throw forbidden()
}
