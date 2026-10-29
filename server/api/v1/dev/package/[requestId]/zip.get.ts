import { packageZip } from '../../../../../domain/dev'
import { validation } from '../../../../../utils/errors'

// GET /api/v1/dev/package/{requestId}/zip[?version=N]: all documents of the package in one archive
export default defineApi({ roles: ['STAFF', 'REVIEWER'] }, ({ ctx, params, query, event }) => {
  let version: number | undefined
  if (query.version !== undefined) {
    version = Number(query.version)
    if (!Number.isInteger(version) || version < 1) throw validation([{ field: 'version', message: 'Целое число от 1' }])
  }
  const { filename, data } = packageZip(ctx, params.requestId!, version)
  setResponseHeader(event, 'content-type', 'application/zip')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${filename}"`)
  return data
})
