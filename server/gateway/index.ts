import type { FileRef } from '../domain/store'
import { createMockGateways } from '../mock'

export type JobType = 'triage_and_tz_draft' | 'tz_revision' | 'quotes_extraction' | 'tender_package'

export interface AiGateway {
  /** Puts a job into the ai.jobs queue (ai_jobs table). Returns the job id. */
  submit(job: { orgId: string; requestId: string; jobType: JobType; payload?: Record<string, unknown> }): string
  /** Applies the results of due jobs as if they arrived from ai.results. Returns the number of jobs processed. */
  runDue(): number
}

export interface DocumentsGateway {
  registerFile(orgId: string, file: { name?: string; mediaType?: string; sizeBytes?: number; content?: Buffer }): FileRef
  /** Content of an uploaded photo, if it was stored. */
  getContent(orgId: string, fileId: string): { mediaType: string; data: Buffer } | null
  /** Creates a new mock document and returns its id. */
  createDocument(orgId: string, name: string, mediaType?: string): string
  describeFile(orgId: string, fileId: string): FileRef | null
  downloadText(orgId: string, fileId: string): string
}

export interface Contractor {
  id: string
  name: string
  email: string
  nonstandardContract: boolean
}

export interface ReferenceGateway {
  listContractors(): Contractor[]
  getContractor(id: string): Contractor | null
}

export interface NotificationsGateway {
  /** Writes a notification into event_log (topic notifications). */
  notify(orgId: string, requestId: string | null, to: 'STAFF' | 'REVIEWER', text: string, urgent?: boolean): void
  /** Writes any event into event_log (a future outbox). */
  record(orgId: string, topic: 'ai.jobs' | 'ai.results' | 'notifications', type: string, requestId: string | null, payload: unknown): void
}

export interface Gateways {
  ai: AiGateway
  documents: DocumentsGateway
  reference: ReferenceGateway
  notifications: NotificationsGateway
}

let gateways: Gateways | null = null

export function getGateways(): Gateways {
  if (!gateways) gateways = createMockGateways()
  return gateways
}

export type { FileRef }
