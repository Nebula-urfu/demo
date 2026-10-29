// Contract operation, see docs/API.md
import { deleteQuote } from '../../../../../domain/quotes'
export default defineApi({ roles: ['STAFF'], status: 204 }, ({ ctx, params }) => {
  deleteQuote(ctx, params.requestId!, params.quoteId!)
})
