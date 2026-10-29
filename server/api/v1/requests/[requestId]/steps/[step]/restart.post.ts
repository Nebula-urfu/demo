// Contract operation, see docs/API.md
import { restartAiStep } from '../../../../../../domain/requests'
export default defineApi({ roles: ['STAFF'], status: 202 }, ({ ctx, params }) => restartAiStep(ctx, params.requestId!, params.step!))
