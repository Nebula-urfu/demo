// Contract operation, see docs/API.md
import { updateTz } from '../../../../domain/tz'
export default defineApi({ roles: ['STAFF'] }, async ({ ctx, params, body }) => updateTz(ctx, params.requestId!, await body()))
