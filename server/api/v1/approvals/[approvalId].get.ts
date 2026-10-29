// Contract operation, see docs/API.md
import { getApproval } from '../../../domain/approvals'
export default defineApi({ roles: ['REVIEWER', 'STAFF'] }, ({ ctx, params }) => getApproval(ctx, params.approvalId!))
