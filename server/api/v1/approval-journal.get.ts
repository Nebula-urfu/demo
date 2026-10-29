// Contract operation, see docs/API.md
import { listJournal } from '../../domain/approvals'
export default defineApi({ roles: ['REVIEWER', 'STAFF'] }, ({ ctx, query }) => {
  const { limit, offset } = pageParams(query)
  return paginate(listJournal(ctx, query), limit, offset)
})
