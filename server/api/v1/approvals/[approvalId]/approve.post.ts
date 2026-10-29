// Contract operation, see docs/API.md
import { approve } from '../../../../domain/approvals'
export default defineApi({ roles: ['REVIEWER'] }, async ({ ctx, params, body }) => approve(ctx, params.approvalId!, await body()))
