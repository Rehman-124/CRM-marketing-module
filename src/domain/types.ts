// Central data model for the Trip2Go CRM prototype (Marketing + Sales, FRD v1.4).
// Every screen reads from and writes to one AppData object (see store/store.ts),
// so changes made on one screen are reflected everywhere.

export type CompanyId =
  | 'flightnest'
  | 'holidaynest'
  | 'trip2go'
  | 'travelope'
  | 'schengentravel'
  | 'trip2goglobal'

export interface Company {
  id: CompanyId
  name: string
  /** Trip2GoGlobal is configured but currently inactive (P3-FR-001). */
  active: boolean
}

/** FRD v1.4 roles. 'admin' is the Admin / CRM Manager; 'manager' is a Manager (distinct from Admin in v1.4). */
export type Role = 'admin' | 'manager' | 'marketing' | 'teamlead' | 'agent' | 'accounts' | 'processing' | 'helpline'

/** Separate grantable permissions (v1.4 P1-FR-002, SAL-FR-004, SAL-FR-008). Admin holds every permission by default. */
export type Permission = 'reassignment' | 'booking_margin_override'

export interface User {
  id: string
  name: string
  role: Role
  title: string
  /** Marketing: companies they manage. Team Lead / Agent: their single company (team). Admin/Manager: overseen companies. */
  companyIds: CompanyId[]
  /** Marketing only: other companies made view-only by management (P3-FR-001). */
  viewOnlyCompanyIds: CompanyId[]
  /** Agents only */
  availability?: 'available' | 'unavailable'
  /** Agents only: shift key (YYYY-MM-DD) for which a Manager/Admin marked the agent Absent. */
  absentShiftKey?: string | null
  joinedAt: number
  /** Agents only: display order used for the rotating deterministic tie-breaker. */
  rosterOrder?: number
  /** Explicitly granted permissions (Managers are assigned Reassignment and Booking Margin Override). */
  permissions: Permission[]
}

export type LeadSource =
  | 'meta_form'
  | 'website'
  | 'facebook_dm'
  | 'instagram_dm'
  | 'facebook_comment'
  | 'instagram_comment'
  | 'phone'
  | 'email'
  | 'referral' // SAL-FR-001: assigned to the agent who owns the referring customer

export type EnquiryChannel = 'facebook_dm' | 'instagram_dm' | 'facebook_comment' | 'instagram_comment'

/** Shared reporting funnel (P2-FR-001) — separate from the Sales stage. */
export type FunnelStatus = 'lead' | 'mature' | 'hot' | 'booked' | 'lost'

export interface CustomerFields {
  nationality: string // passport / nationality
  fullName: string
  phone: string
  email: string
  city: string
  tripDetails: string // extra trip details (optional, free text)
}

export interface Campaign {
  id: string
  companyId: CompanyId
  name: string
}

export interface Ad {
  id: string
  campaignId: string
  name: string
}

export interface StatusChange {
  at: number
  from: FunnelStatus | null
  to: FunnelStatus
  byUserId: string
  lossReason?: string
}

export type OwnershipChangeKind = 'auto' | 'manual-assign' | 'manual-unassign' | 'manual-reassign' | 'released-absent' | 'unassigned-no-eligible' | 'referral'

export interface OwnershipChange {
  at: number
  kind: OwnershipChangeKind
  fromAgentId: string | null
  toAgentId: string | null
  /** 'system' for the distribution engine */
  byUserId: string
  reason?: string
}

export interface Note {
  id: string
  at: number
  byUserId: string
  text: string
  editedAt?: number
}

/** Why the engine chose an agent (v1.4 P1-FR-002: lowest-score group and chosen agent). */
export interface DistributionTrace {
  at: number
  inShift: boolean
  pool: string[]
  removedAbsent: string[]
  /** Every non-Absent agent with their score and live status at the moment of assignment */
  scores: { agentId: string; count: number; offset: number; score: number; available: boolean }[]
  lowestScore: number | null
  /** Agents on the lowest score */
  group: string[]
  /** During shift: Available agents inside the group (preferred). Empty off-time. */
  availableInGroup: string[]
  /** During shift, every agent in the group was Unavailable, so the Lead was still assigned inside it */
  allGroupUnavailable: boolean
  winnerId: string | null
  tieBreak: boolean
}

/** Preferred contact time captured with the Lead (SAL-FR-001). Exact = a UK-local moment; window = a vague value such as "evening". */
export type PreferredContact = { mode: 'exact'; at: number } | { mode: 'window'; label: string }

export interface Lead {
  id: string
  ref: string
  companyId: CompanyId
  source: LeadSource
  campaignId: string | null
  adId: string | null
  fields: CustomerFields
  createdAt: number
  createdByUserId: string // 'system' for automatic sources
  /** Enquiry this Lead was converted from (social sources) */
  enquiryId?: string
  conversationRef?: string
  externalEventId?: string

  ownerId: string | null
  assignedAt: number | null
  /** True when the current assignment happened during off-time (22:00–14:00 PKT). */
  assignedInOffTime: boolean

  status: FunnelStatus
  lossReason: string | null
  statusHistory: StatusChange[]
  ownershipHistory: OwnershipChange[]
  notes: Note[]

  firstContactAt: number | null
  firstContactByUserId: string | null
  /** Counted SLA time in ms (shift time, assigned, owner Available). */
  slaCountedMs: number
  slaAlertAt: number | null
  lastTrace: DistributionTrace | null
  /** SAL-FR-001 */
  preferredContact?: PreferredContact | null
  /** Referral Leads: the Lead of the referring customer */
  referralFromLeadId?: string
}

export type MessageKind = 'dm' | 'comment' | 'private-reply' | 'public-reply'
/** sending → sent (accepted by Meta) → delivered (Messenger receipts) → read; or failed */
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface EnquiryMessage {
  id: string
  from: 'customer' | 'marketing'
  kind: MessageKind
  text: string
  at: number
  /** Outbound only: CRM user who sent it */
  byUserId?: string
  /** Outbound only: sent from the CRM, or from Meta's own inbox (seen via webhook echo) */
  via?: 'crm' | 'meta'
  status?: MessageStatus
  /** Meta message / comment id once accepted */
  externalId?: string
  error?: import('../messaging/contract').MessagingError
  /** True when the message never went through Meta (simulated transport) */
  simulated?: boolean
}

export interface Enquiry {
  id: string
  ref: string
  companyId: CompanyId
  channel: EnquiryChannel
  handle: string
  conversationRef: string
  messages: EnquiryMessage[]
  /** Details collected by Marketing before conversion */
  fields: CustomerFields
  read: boolean
  status: 'open' | 'converted'
  convertedLeadId: string | null
  convertedAt: number | null
  convertedByUserId: string | null
  createdAt: number
  postContext?: string // comments: the post / ad the comment was left on
  /** 'live' threads came from a real Meta webhook; 'simulated' threads were generated by the prototype and are never sent to Meta. */
  origin: 'live' | 'simulated'
  /** PSID (Messenger) or IGSID (Instagram) of the client */
  platformUserId: string
  /** Comment threads: Meta comment id, and when its one private reply was sent */
  commentId?: string
  privateReplyAt?: number | null
  /** Last direct message from the client — opens Meta's 24-hour reply window */
  lastInboundDmAt: number | null
  /** Last activity in the thread, for sorting */
  lastActivityAt: number
}

/** One automatic (or, if the pending decision allows, manual) assignment counted toward the fair-distribution score. */
export interface AssignmentRecord {
  id: string
  leadId: string
  agentId: string
  companyId: CompanyId
  at: number
  kind: 'auto' | 'manual' | 'referral'
  counted: boolean
  /** Voided when the Lead is released from an Absent agent (counts toward the new owner, not the absent one). */
  voided: boolean
}

/** Starting score of an agent added later (placeholder: team average when added — v1.4 leaves this to be confirmed). */
export interface FairnessOffset {
  agentId: string
  offset: number
  baselineNote: string
  at: number
}

export type AuditType =
  | 'availability'
  | 'absent'
  | 'auto-assign'
  | 'manual-assign'
  | 'manual-unassign'
  | 'manual-reassign'
  | 'released-absent'
  | 'no-eligible'
  | 'agent-added'
  | 'access'
  | 'lead-created'
  | 'enquiry-converted'
  | 'status'
  | 'first-contact'
  | 'integration'
  | 'sla-alert'
  | 'message'
  | 'permission'
  | 'referral'
  // Sales (SAL-FR-008: sensitive-data access and important status changes are audit-logged)
  | 'stage'
  | 'contact-attempt'
  | 'task'
  | 'qualification'
  | 'draft'
  | 'quote'
  | 'payment'
  | 'booking'
  | 'override'
  | 'refund'
  | 'expense'
  | 'invoice'
  | 'case'
  | 'sensitive-access'
  | 'document'
  | 'retention'
  | 'sales-config'

export interface AuditEntry {
  id: string
  at: number
  type: AuditType
  actorId: string // 'system' for engine actions
  companyId: CompanyId | null
  leadId?: string
  agentId?: string
  oppId?: string
  summary: string
}

export type NotificationType = 'sla' | 'no-eligible' | 'integration' | 'shift-start' | 'sales'

export interface AppNotification {
  id: string
  at: number
  type: NotificationType
  companyId: CompanyId | null
  leadId?: string
  title: string
  body: string
  read: boolean
  /** SLA alerts clear when first contact is recorded */
  cleared: boolean
  /** Sales notifications go to one user or to everyone holding a role */
  toUserId?: string
  toRole?: Role
  oppId?: string
  caseId?: string
}

export type ConnectionKind = 'meta_forms' | 'meta_inbox' | 'meta_insights' | 'website'

/**
 * confirmed = working (connected & confirmed in production); pending = not yet confirmed;
 * error / recovering / recovered = failure states; no-events = connected but nothing received yet.
 */
export type ConnectionState = 'confirmed' | 'pending' | 'error' | 'recovering' | 'recovered' | 'no-events'

export interface Connection {
  id: string
  companyId: CompanyId
  kind: ConnectionKind
  state: ConnectionState
  /** What the proof of concept reported for this capability (P3-FR-002). */
  pocTested: boolean
  lastEventAt: number | null
  lastError: string | null
}

export interface ExternalEvent {
  externalId: string
  connectionId: string
  receivedAt: number
  outcome: 'created' | 'duplicate-ignored' | 'flagged'
  recordId: string | null
  deliveries: number
}

export interface FailedEvent {
  id: string
  connectionId: string
  companyId: CompanyId
  at: number
  summary: string
  status: 'flagged' | 'recovered'
  payload: { kind: 'lead' | 'enquiry'; source: LeadSource; fields: CustomerFields; campaignId: string | null; adId: string | null; externalId: string; channel?: EnquiryChannel }
}

export interface InsightRow {
  adId: string
  date: string // YYYY-MM-DD (PKT)
  spend: number
  impressions: number
  reach: number
  clicks: number
  results: number
}

/** Demo parameters standing in for open decisions. None of these is an approved business rule. */
export interface PendingDecisionParams {
  manualCountsTowardFairness: boolean
  referralCountsTowardFairness: boolean
  slaRestartsOnReassign: boolean
  requireReassignReason: boolean
  allowBackwardStatus: boolean
  allowReopenLost: boolean
  /** "Team Lead view where authorised" (P2-FR-003) and "monitor availability where authorised" (P1-FR-002) */
  teamLeadMonitoring: boolean
  teamLeadReceivesSla: boolean
  marketingCanCreateManualLeads: boolean
  conversionRequiredFields: (keyof CustomerFields)[]
  lossReasons: string[]
  /** SAL-FR-002: fields required before a Client Information Draft can be generated (to be confirmed) */
  draftRequiredFields: string[]
  /** SAL-FR-001: whether Manager/Admin may reply in agent conversations (to be confirmed) */
  managerInboxReplies: boolean
  /** SAL-FR-004: whether a margin override / payment rejection needs a mandatory reason (to be confirmed) */
  overrideReasonRequired: boolean
  rejectionReasonRequired: boolean
}

// ================================================================ Sales (FRD v1.4 Part 2)

/** SAL-FR-001 Sales stage list as stated in v1.4 (final detailed list to be confirmed). */
export type SalesStage = 'new' | 'contacting' | 'qualified' | 'quoted' | 'data_verification' | 'awaiting_payment' | 'booked' | 'lost'
export type ContactOutcome = 'answered' | 'no_answer' | 'voicemail' | 'busy' | 'wrong_number'

export interface StageChange { at: number; from: SalesStage | null; to: SalesStage; byUserId: string; reason?: string }

export interface ContactAttempt {
  id: string
  at: number
  byUserId: string
  channel: 'call' | 'whatsapp'
  outcome: ContactOutcome
  note?: string
}

export type TaskKind = 'contact' | 'callback' | 'follow_up' | 'balance_payment' | 'review' | 'referral'
/** exact = a UK-local due moment; window = a vague contact window such as "evening" (stays a window; `at` is the day it belongs to). */
export type TaskDue = { mode: 'exact'; at: number } | { mode: 'window'; label: string; at: number }

export interface SalesTask {
  id: string
  oppId: string
  kind: TaskKind
  title: string
  due: TaskDue
  createdAt: number
  createdBy: string
  doneAt: number | null
  doneBy: string | null
}

/** SAL-FR-002: one applicant's qualification as field → value. The field list is a placeholder for the Data Model document. */
export interface Applicant {
  id: string
  data: Record<string, string>
}

export type DraftStatus = 'unverified' | 'corrections_requested' | 'verified'
export interface DraftVersion {
  version: number
  createdAt: number
  createdBy: string
  snapshot: Applicant[]
  status: DraftStatus
  approval: { channel: 'whatsapp' | 'email'; byUserId: string; at: number } | null
  corrections: { note: string; byUserId: string; at: number }[]
  /** Set when a newer version replaced this one */
  supersededAt: number | null
  /** Created because a verified version had a material change */
  reverification: boolean
}

export type ServiceItemKey =
  | 'appointment_letter' | 'travel_insurance' | 'visa_application_form' | 'hotel_reservation' | 'cover_letter'
  | 'flight_reservation' | 'actual_flight' | 'actual_hotel'

export interface Quote {
  packageName: string
  agreedAmount: number
  /** Conditional: required by destination/country or case; may be free or paid */
  flightReservation: { required: boolean; paid: boolean }
  /** Whether the hotel reservation for visa purpose requires company expenditure (decides its checklist owner, SAL-FR-006) */
  hotelReservationCompanyCost: boolean
  /** Optional customer-requested add-ons — never part of the five standard deliverables */
  addOns: { actualFlight: boolean; actualHotel: boolean }
  savedAt: number
  savedBy: string
  history: { at: number; byUserId: string; agreedAmount: number; expectedMargin: number }[]
}

export interface PaymentRequest {
  id: string
  oppId: string
  type: 'full' | 'partial'
  amount: number
  proofName: string
  submittedAt: number
  submittedBy: string
  status: 'awaiting' | 'confirmed' | 'rejected'
  decidedAt: number | null
  decidedBy: string | null
  rejectionReason?: string
  /** True when this request pays a balance on an existing Booking */
  balance: boolean
}

export type SignatureStatus = 'not_generated' | 'sent' | 'signed'
export interface Invoice {
  status: SignatureStatus
  sentAt: number | null
  signedAt: number | null
  remindedAt: number | null
  escalatedAt: number | null
  lastError: string | null
  /** DigiSigner is pending technical validation — every send/sign in the prototype is simulated */
  simulated: true
}

export interface Booking {
  id: string
  ref: string
  oppId: string
  leadId: string
  companyId: CompanyId
  createdAt: number
  createdVia: 'margin' | 'override'
  /** SAL-FR-004: total value (the agreed amount) and expected margin at booking. Amount paid and balance come from Accounts-confirmed payments. */
  totalValue: number
  expectedMargin: number
  override: { byUserId: string; at: number; reason?: string; expectedMargin: number } | null
  expenses: { id: string; amount: number; note: string; at: number; byUserId: string }[]
  invoice: Invoice
  caseId: string
}

export interface RefundRequest {
  id: string
  bookingId: string
  caseId: string
  amount: number
  note: string
  requestedBy: string
  requestedAt: number
  status: 'requested' | 'approved' | 'rejected'
  decidedBy: string | null
  decidedAt: number | null
}

export interface ChecklistItem {
  key: ServiceItemKey
  label: string
  owner: 'processing' | 'sales'
  kind: 'mandatory' | 'conditional' | 'addon'
  doneAt: number | null
  doneBy: string | null
}

export interface VisaOption { id: string; country: string; centre: string; date: string; time: string; addedAt: number; addedBy: string }

export interface ServiceCase {
  id: string
  ref: string
  bookingId: string
  oppId: string
  companyId: CompanyId
  createdAt: number
  /** Verified Client Information Draft version handed to Processing */
  draftVersion: number | null
  options: VisaOption[]
  selection: { optionId: string; at: number; byUserId: string } | null
  appointment: { optionId: string; reference: string; at: number; byUserId: string } | null
  checklist: ChecklistItem[]
  completenessCheck: { at: number; byUserId: string } | null
  packSent: { at: number; byUserId: string; via: 'whatsapp' | 'email' } | null
  /** Manual status updated by Processing (milestone list to be confirmed) */
  status: string
  statusHistory: { at: number; status: string; byUserId: string }[]
  outcome: { result: 'granted' | 'refused'; at: number; byUserId: string } | null
}

export interface WaMessage { id: string; from: 'customer' | 'agent'; text: string; at: number; byUserId?: string }
/** Company WhatsApp conversation for an opportunity — visibility follows CRM ownership (SAL-FR-001). Simulated. */
export interface WaThread { id: string; oppId: string; companyId: CompanyId; messages: WaMessage[]; lastActivityAt: number }

export interface SalesDocument {
  id: string
  oppId: string
  name: string
  kind: 'passport' | 'share_code' | 'visa_status' | 'other'
  sizeKb: number
  uploadedAt: number
  uploadedBy: string
  /** Raw file deleted under the retention policy; metadata is kept */
  deletedAt: number | null
  /** Short-lived access links issued through the CRM after a permission check — never permanent public URLs */
  links: { token: string; userId: string; issuedAt: number; expiresAt: number }[]
}

export interface Opportunity {
  id: string
  leadId: string
  companyId: CompanyId
  createdAt: number
  stage: SalesStage
  stageHistory: StageChange[]
  lossReason: string | null
  /** Low Intent / Dormant: searchable and can be reactivated (the CRM never closes an opportunity itself) */
  dormant: { at: number; byUserId: string } | null
  attempts: ContactAttempt[]
  applicants: Applicant[]
  qualificationUpdatedAt: number | null
  drafts: DraftVersion[]
  quote: Quote | null
  bookingId: string | null
  /** No preferred contact time: the CRM prompts immediate contact until the agent logs an attempt */
  contactPrompt: boolean
}

/** Configuration placeholders for Sales (values marked "to be confirmed" in v1.4 or held in documents not provided). */
export interface SalesConfig {
  /** Expected cost per included service item — placeholder for the "configured expected case costs" */
  expectedCosts: Record<ServiceItemKey, number>
  /** SAL-FR-005 §13 Q7: unsigned period before the agent reminder, then the Manager alert. Null = not configured. */
  invoiceReminderDays: number | null
  invoiceEscalationDays: number | null
  /** SAL-FR-008: raw sensitive file retention period. Null = not configured. */
  retentionDays: number | null
  /** SAL-FR-008: lifetime of a controlled file-access link (placeholder for "short-lived") */
  linkMinutes: number
  /** Simulation switch: whether the (pending) DigiSigner integration responds */
  digiSignerReachable: boolean
}

export interface ClockState {
  now: number
  running: boolean
  speed: number
}

export interface AppData {
  version: number
  companies: Company[]
  users: User[]
  campaigns: Campaign[]
  ads: Ad[]
  leads: Lead[]
  enquiries: Enquiry[]
  assignments: AssignmentRecord[]
  offsets: FairnessOffset[]
  tieRotation: Partial<Record<CompanyId, string>> // last tie-break winner per company
  audit: AuditEntry[]
  notifications: AppNotification[]
  connections: Connection[]
  externalEvents: ExternalEvent[]
  failedEvents: FailedEvent[]
  insights: InsightRow[]
  metaLastRefreshedAt: number | null
  metaAvailable: boolean
  params: PendingDecisionParams
  // Sales
  opportunities: Opportunity[]
  tasks: SalesTask[]
  payments: PaymentRequest[]
  bookings: Booking[]
  refunds: RefundRequest[]
  cases: ServiceCase[]
  waThreads: WaThread[]
  documents: SalesDocument[]
  salesConfig: SalesConfig
  /** Simulated messaging only: the outcome of the next simulated send (demo console) */
  messagingSim: { nextOutcome: 'success' | import('../messaging/contract').MessagingErrorCode }
  clock: ClockState
  seq: number
}
