// Contract operation, see docs/API.md
import { updateQuoteData } from '../../../../../../domain/quotes'
export default defineApi({ roles: ['STAFF'] }, async ({ ctx, params, body }) => updateQuoteData(ctx, params.requestId!, params.quoteId!, await body()))
