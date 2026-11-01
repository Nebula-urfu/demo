const cache = new Map<string, Promise<string | null>>()

/** Object URL of an uploaded photo (the image request needs the token, so <img src> cannot point to the API). Cached per file. */
export function usePhotoUrl() {
  const { fetchBlob } = useApi()
  return (fileId: string): Promise<string | null> => {
    let p = cache.get(fileId)
    if (!p) {
      p = fetchBlob(`/dev/files/${fileId}/download`)
        .then((b) => (b.type.startsWith('image/') ? URL.createObjectURL(b) : null))
        .catch(() => null)
      cache.set(fileId, p)
    }
    return p
  }
}
