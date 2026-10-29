// Contract operation, see docs/API.md
import { listApprovals } from '../../domain/approvals'
export default defineApi({ roles: ['REVIEWER', 'STAFF'] }, ({ ctx, query }) => {
  const { limit, offset } = pageParams(query)
  return paginate(listApprovals(ctx, query), limit, offset)
})
