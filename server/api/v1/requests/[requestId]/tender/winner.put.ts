// Contract operation, see docs/API.md
import { selectWinner } from '../../../../../domain/tender'
export default defineApi({ roles: ['STAFF'] }, async ({ ctx, params, body }) => selectWinner(ctx, params.requestId!, await body()))
