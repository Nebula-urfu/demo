// Contract operation, see docs/API.md
import { reject } from '../../../../domain/approvals'
export default defineApi({ roles: ['REVIEWER'] }, async ({ ctx, params, body }) => reject(ctx, params.approvalId!, await body()))
