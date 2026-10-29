// Contract operation, see docs/API.md
import { createQuoteRequest } from '../../../../domain/quotes'
export default defineApi({ roles: ['STAFF'], status: 201 }, async ({ ctx, params, body }) => createQuoteRequest(ctx, params.requestId!, await body()))
