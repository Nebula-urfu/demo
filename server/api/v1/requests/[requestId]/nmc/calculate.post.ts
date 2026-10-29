// Contract operation, see docs/API.md
import { calculateNmc } from '../../../../../domain/quotes'
export default defineApi({ roles: ['STAFF'] }, async ({ ctx, params, body }) => calculateNmc(ctx, params.requestId!, await body()))
