// Contract operation, see docs/API.md
import { listQuotes } from '../../../../domain/quotes'
export default defineApi({ roles: ['STAFF', 'REVIEWER'] }, ({ ctx, params }) => listQuotes(ctx, params.requestId!))
