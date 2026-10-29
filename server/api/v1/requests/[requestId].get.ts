// Contract operation, see docs/API.md
import { getRequest } from '../../../domain/requests'
export default defineApi({}, ({ ctx, params }) => getRequest(ctx, params.requestId!))
