// Contract operation, see docs/API.md
import { createRequest } from '../../domain/requests'
export default defineApi({ roles: ['RESIDENT'], status: 201 }, async ({ ctx, event, body }) => {
  const key = getHeader(event, 'idempotency-key')
  const res = await createRequest(ctx, key, await body())
  setResponseHeader(event, 'Location', `/api/v1/requests/${res.id}`)
  return res
})
