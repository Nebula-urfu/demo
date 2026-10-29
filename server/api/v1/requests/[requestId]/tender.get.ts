// Contract operation, see docs/API.md
import { getTender } from '../../../../domain/tender'
export default defineApi({ roles: ['STAFF', 'REVIEWER'] }, ({ ctx, params }) => getTender(ctx, params.requestId!))
