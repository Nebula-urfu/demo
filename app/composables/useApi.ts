import type { FileRef } from '~/types'

export interface ProblemField {
  field: string
  message: string
}

/** problem+json error from the server (docs/API.md, schema Problem). */
export class ApiProblem extends Error {
  constructor(
    public status: number,
    public code: string,
    public title: string,
    public detail?: string,
    public errors: ProblemField[] = [],
  ) {
    super(detail || title)
  }

  /** Short human-readable text for the screen. */
  get text(): string {
    if (this.code === 'STALE_VERSION') return 'Данные изменились. Обновите страницу.'
    if (this.code === 'STEP_NOT_ALLOWED') return 'Действие сейчас недоступно.'
    if (this.code === 'VALIDATION_ERROR' && this.errors.length) return this.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
    return this.detail ? `${this.title}. ${this.detail}` : this.title
  }
}

interface RawError {
  status?: number
  statusCode?: number
  data?: { title?: string; detail?: string; code?: string; status?: number; errors?: ProblemField[] }
}

/** Calls /api/v1 with the token, turns problem+json into ApiProblem, sends 401 to /login. */
export function useApi() {
  const { token, logout } = useSession()

  async function api<T>(
    path: string,
    opts: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; query?: Record<string, string | number | undefined>; headers?: Record<string, string> } = {},
  ): Promise<T> {
    try {
      return (await $fetch(`/api/v1${path}`, {
        method: opts.method ?? 'GET',
        body: opts.body as Record<string, unknown> | undefined,
        query: opts.query,
        headers: { ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}), ...opts.headers },
      })) as T
    } catch (e) {
      const err = e as RawError
      const status = err.status ?? err.statusCode ?? 0
      if (status === 401) {
        logout()
        await navigateTo('/login')
      }
      const d = err.data
      throw new ApiProblem(status, d?.code ?? 'ERROR', d?.title ?? 'Не удалось выполнить запрос', d?.detail, d?.errors ?? [])
    }
  }

  async function fetchBlob(path: string): Promise<Blob> {
    try {
      return (await $fetch(`/api/v1${path}`, { responseType: 'blob', headers: token.value ? { Authorization: `Bearer ${token.value}` } : {} })) as Blob
    } catch (e) {
      const err = e as RawError
      throw new ApiProblem(err.status ?? err.statusCode ?? 0, err.data?.code ?? 'ERROR', err.data?.title ?? 'Не удалось скачать файл', err.data?.detail)
    }
  }

  function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  /** The download endpoint needs the Authorization header, so a plain link does not work: fetch a blob. */
  async function download(fileId: string, name: string) {
    saveBlob(await fetchBlob(`/dev/files/${fileId}/download`), name.endsWith('.txt') ? name : `${name}.txt`)
  }

  /** All package documents in one zip (built by the server). */
  async function downloadPackageZip(requestId: string, version?: number) {
    saveBlob(await fetchBlob(`/dev/package/${requestId}/zip${version ? `?version=${version}` : ''}`), `package-${requestId.slice(0, 6)}${version ? `-v${version}` : ''}.zip`)
  }

  /** Uploads the real photo content (multipart) so that it can be shown later. */
  function upload(file: File) {
    const body = new FormData()
    body.append('file', file, file.name)
    return api<FileRef>('/dev/files', { method: 'POST', body })
  }

  return { api, download, downloadPackageZip, fetchBlob, upload }
}
