// Contract operation, see docs/API.md
import { listRequests } from '../../domain/requests'
export default defineApi({}, ({ ctx, query }) => {
  const { limit, offset } = pageParams(query)
  return paginate(listRequests(ctx, query), limit, offset)
})
