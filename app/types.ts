export type Role = 'RESIDENT' | 'STAFF' | 'REVIEWER'
export type StepName = 'TRIAGE' | 'TZ' | 'QUOTES_NMC' | 'TENDER' | 'PACKAGE'
export type StepState =
  | 'NOT_STARTED'
  | 'PROCESSING'
  | 'DRAFT_READY'
  | 'IN_REVIEW'
  | 'NEEDS_REWORK'
  | 'APPROVED'
  | 'AI_FAILED'
export type RequestStatus = 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED'
export type Urgency = 'EMERGENCY' | 'PLANNED'

export interface Profile {
  userId: string
  displayName: string
  role: Role
  orgId: string
  address: string
}

export interface Money {
  amount: string
  currency: string
}

export interface FileRef {
  fileId: string
  name: string
  mediaType: string
  sizeBytes: number
}

export interface StepInfo {
  step: StepName
  state: StepState
  updatedAt: string
}

export interface RequestSummary {
  id: string
  status: RequestStatus
  urgency?: Urgency | null
  currentStep?: StepName | null
  currentStepState?: StepState | null
  address: string
  entrance: string
  description: string
  photoId?: string | null
  createdAt: string
  updatedAt: string
}

export interface RequestDetail extends RequestSummary {
  photos: FileRef[]
  author?: { userId: string; displayName?: string }
  steps?: StepInfo[]
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface TriageValues {
  urgency: Urgency
  workType: string
  route: string
}

export interface Triage {
  state: StepState
  proposal: TriageValues | null
  confirmed: TriageValues | null
  confirmedBy?: { userId: string; displayName?: string }
  confirmedAt?: string
}

export interface TzSection {
  id: string
  title: string
  text: string
  sources?: string[]
  editedByStaff?: boolean
}

export interface TzQuestion {
  id: string
  text: string
  answer: string | null
}

export interface TzDocument {
  state: StepState
  version: number
  sections?: TzSection[]
  openQuestions?: TzQuestion[]
  origin?: 'AI' | 'STAFF'
  lastReviewComment?: string | null
  updatedAt?: string
}

export interface QuoteItem {
  name: string
  quantity?: number
  unit?: string
  unitPrice?: Money
  price?: Money
}

export interface QuoteData {
  contractorName?: string
  totalPrice?: Money
  termsDays?: number
  warranty?: string
  items?: QuoteItem[]
  discrepancies?: string[]
}

export interface Quote {
  id: string
  contractorId: string | null
  extraction: 'EXTRACTING' | 'EXTRACTED' | 'AI_FAILED'
  version: number
  files: FileRef[]
  data: QuoteData | null
  editedByStaff?: boolean
  createdAt?: string
}

export interface Comparison {
  quotes: { quoteId: string; contractorName: string; totalPrice?: Money; termsDays?: number; warranty?: string }[]
  rows: {
    name: string
    unit?: string
    quantity?: number
    cells: { quoteId: string; unitPrice?: Money; price?: Money; flag: 'NONE' | 'MISSING' | 'MISMATCH' | 'OUTLIER'; note?: string }[]
  }[]
  discrepancies?: string[]
}

export interface NmcCalculation {
  state: StepState
  version: number
  method?: string
  amount?: Money
  justification?: string
  quoteIds?: string[]
  lastReviewComment?: string | null
  calculatedAt?: string
}

export interface QuoteRequestDraft {
  id: string
  recipients: { contractorId: string; name: string; email?: string }[]
  subject: string
  body: string
  attachments?: FileRef[]
}

export interface Contractor {
  id: string
  name: string
  email: string
  nonstandardContract: boolean
}

export interface DocumentRef {
  kind: 'TZ' | 'QUOTE_FORM' | 'TENDER_DOCUMENTATION' | 'EVALUATION_PROTOCOL' | 'CONTRACT'
  name: string
  fileId: string | null
  version?: number
}

export interface Tender {
  state: StepState
  documents?: DocumentRef[]
  winnerProposal: { quoteId: string; rationale: string; scores?: { quoteId: string; criterion: string; score: number }[] } | null
  selectedWinner: { quoteId: string; selectedBy: { userId: string; displayName?: string }; selectedAt: string; comment?: string } | null
  contract: { type: 'STANDARD' | 'NON_STANDARD'; document?: DocumentRef; lawyerNotes?: string[] } | null
  lastReviewComment?: string | null
}

export interface ProcurementPackage {
  state: StepState
  version?: number
  documents: DocumentRef[]
  approvedAt?: string | null
  lastReviewComment?: string | null
}

export type SubjectType = 'TZ' | 'NMC' | 'PACKAGE'

export interface Approval {
  id: string
  requestId: string
  subjectType: SubjectType
  subjectVersion: number
  state: 'PENDING' | 'APPROVED' | 'REJECTED'
  urgency?: Urgency | null
  address?: string
  submittedBy: { userId: string; displayName?: string }
  submittedAt: string
  decidedBy?: { userId: string; displayName?: string }
  decidedAt?: string
  comment?: string | null
}

export interface JournalEntry {
  id: string
  requestId: string
  subjectType: SubjectType
  subjectVersion: number
  decision: 'APPROVED' | 'REJECTED'
  decidedBy: { userId: string; displayName?: string }
  decidedAt: string
  comment?: string | null
}

export interface ApprovalDetail extends Approval {
  subject: TzDocument | NmcCalculation | ProcurementPackage
  previousDecisions?: JournalEntry[]
}

export interface DevEvent {
  id: number
  ts: string
  topic: 'ai.jobs' | 'ai.results' | 'notifications'
  type: string
  requestId: string | null
  payload: Record<string, unknown>
}
