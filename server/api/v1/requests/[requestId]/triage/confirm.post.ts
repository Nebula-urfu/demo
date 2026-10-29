// Contract operation, see docs/API.md
import { confirmTriage } from '../../../../../domain/triage'
export default defineApi({ roles: ['STAFF'] }, async ({ ctx, params, body }) => confirmTriage(ctx, params.requestId!, await body()))
