// Contract operation, see docs/API.md
import { listEvents } from '../../../domain/dev'
export default defineApi({}, ({ ctx, query }) => listEvents(ctx, query))
