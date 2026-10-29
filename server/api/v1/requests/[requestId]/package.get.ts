// Contract operation, see docs/API.md
import { getPackage } from '../../../../domain/tender'
export default defineApi({ roles: ['STAFF', 'REVIEWER'] }, ({ ctx, params }) => getPackage(ctx, params.requestId!))
