// Contract operation, see docs/API.md
import { submitPackage } from '../../../../../domain/tender'
export default defineApi({ roles: ['STAFF'], status: 201 }, async ({ ctx, params, body }) => submitPackage(ctx, params.requestId!, await body()))
