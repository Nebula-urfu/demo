// Contract operation, see docs/API.md
import { getTz } from '../../../../domain/tz'
export default defineApi({ roles: ['STAFF', 'REVIEWER'] }, ({ ctx, params }) => getTz(ctx, params.requestId!))
