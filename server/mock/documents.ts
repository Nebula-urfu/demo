import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import type { DocumentsGateway } from '../gateway'
import type { FileRef } from '../domain/store'
import { nowIso } from '../utils/time'

export class MockDocuments implements DocumentsGateway {
  registerFile(orgId: string, file: { name?: string; mediaType?: string; sizeBytes?: number; content?: Buffer }): FileRef {
    const ref: FileRef = {
      fileId: randomUUID(),
      name: file.name || 'demo-photo.jpg',
      mediaType: file.mediaType || 'image/jpeg',
      sizeBytes: file.content ? file.content.length : Number.isInteger(file.sizeBytes) && (file.sizeBytes as number) >= 0 ? (file.sizeBytes as number) : 1024,
    }
    this.insert(orgId, ref, file.content)
    return ref
  }

  createDocument(orgId: string, name: string, mediaType = 'application/pdf') {
    const ref: FileRef = { fileId: randomUUID(), name, mediaType, sizeBytes: 1024 }
    this.insert(orgId, ref)
    return ref.fileId
  }

  getContent(orgId: string, fileId: string) {
    const r = getDb()
      .prepare('SELECT media_type, content FROM mock_files WHERE file_id = ? AND org_id = ? AND content IS NOT NULL')
      .get(fileId, orgId) as { media_type: string; content: Buffer } | undefined
    return r ? { mediaType: r.media_type, data: r.content } : null
  }

  describeFile(orgId: string, fileId: string): FileRef | null {
    const r = getDb()
      .prepare('SELECT file_id, name, media_type, size_bytes FROM mock_files WHERE file_id = ? AND org_id = ?')
      .get(fileId, orgId) as { file_id: string; name: string; media_type: string; size_bytes: number } | undefined
    return r ? { fileId: r.file_id, name: r.name, mediaType: r.media_type, sizeBytes: r.size_bytes } : null
  }

  downloadText(orgId: string, fileId: string) {
    const name = this.describeFile(orgId, fileId)?.name ?? 'неизвестно'
    return `ДЕМО-ДОКУМЕНТ\nИмя: ${name}\nИдентификатор файла: ${fileId}\nЭто заглушка. Настоящего документа в прототипе нет.\n`
  }

  private insert(orgId: string, f: FileRef, content?: Buffer) {
    getDb()
      .prepare('INSERT INTO mock_files (file_id, org_id, name, media_type, size_bytes, created_at, content) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(f.fileId, orgId, f.name, f.mediaType, f.sizeBytes, nowIso(), content ?? null)
  }
}
