import { getGateways } from '../../../../../gateway'

// Uploaded photos come back as they were uploaded, other mock files as the stub text.
export default defineApi({}, ({ ctx, params, event }) => {
  const docs = getGateways().documents
  const stored = docs.getContent(ctx.orgId, params.fileId!)
  if (stored) {
    setResponseHeader(event, 'content-type', stored.mediaType)
    setResponseHeader(event, 'cache-control', 'private, max-age=300')
    return stored.data
  }
  const name = docs.describeFile(ctx.orgId, params.fileId!)?.name
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name ?? 'demo.txt')}`)
  return docs.downloadText(ctx.orgId, params.fileId!)
})
