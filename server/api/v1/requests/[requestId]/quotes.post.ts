// Contract operation, see docs/API.md
import { createQuote } from '../../../../domain/quotes'
export default defineApi({ roles: ['STAFF'], status: 202 }, async ({ ctx, params, body }) => createQuote(ctx, params.requestId!, await body()))
