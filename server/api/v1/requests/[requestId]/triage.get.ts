// Contract operation, see docs/API.md
import { getTriage } from '../../../../domain/triage'
export default defineApi({ roles: ['STAFF', 'REVIEWER'] }, ({ ctx, params }) => getTriage(ctx, params.requestId!))
