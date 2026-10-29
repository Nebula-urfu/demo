// Contract operation, see docs/API.md
import { submitNmc } from '../../../../../domain/quotes'
export default defineApi({ roles: ['STAFF'], status: 201 }, async ({ ctx, params, body }) => submitNmc(ctx, params.requestId!, await body()))
