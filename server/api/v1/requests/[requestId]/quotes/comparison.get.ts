// Contract operation, see docs/API.md
import { getQuoteComparison } from '../../../../../domain/quotes'
export default defineApi({ roles: ['STAFF', 'REVIEWER'] }, ({ ctx, params }) => getQuoteComparison(ctx, params.requestId!))
