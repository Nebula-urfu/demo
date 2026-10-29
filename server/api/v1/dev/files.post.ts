import { registerFile } from '../../../domain/dev'

export default defineApi({ status: 201 }, async ({ ctx, event }) => {
  const type = getHeader(event, 'content-type') || ''
  if (type.includes('multipart/form-data')) {
    const part = (await readMultipartFormData(event))?.find((p) => p.filename)
    return part ? registerFile(ctx, {}, { name: part.filename, mediaType: part.type, data: part.data }) : registerFile(ctx, {})
  }
  let body: unknown = {}
  try {
    body = await readBody(event)
  } catch {
    body = {}
  }
  return registerFile(ctx, body)
})
