// Contract operation, see docs/API.md
import { submitTz } from '../../../../../domain/tz'
export default defineApi({ roles: ['STAFF'], status: 201 }, async ({ ctx, params, body }) => submitTz(ctx, params.requestId!, await body()))
