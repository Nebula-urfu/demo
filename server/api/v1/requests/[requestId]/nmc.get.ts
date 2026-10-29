// Contract operation, see docs/API.md
import { getNmc } from '../../../../domain/quotes'
export default defineApi({ roles: ['STAFF', 'REVIEWER'] }, ({ ctx, params }) => getNmc(ctx, params.requestId!))
