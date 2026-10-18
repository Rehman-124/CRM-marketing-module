// Central data model for the Trip2Go CRM Marketing module prototype.
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
  /** Trip2GoGlobal is inactive and has no agents yet (P3-FR-001). */
  active: boolean
}

export type Role = 'admin' | 'marketing' | 'teamlead' | 'agent'

export interface User {
  id: string
  name: string
  role: Role
  title: string
  /** Marketing: companies they manage. Team Lead / Agent: their single company (team). Admin: all. */
  companyIds: CompanyId[]
  /** Marketing only: other companies made view-only by management (P3-FR-001). */
  viewOnlyCompanyIds: CompanyId[]
  /** Agents only */
  availability?: 'available' | 'unavailable'
  /** Agents only: shift key (YYYY-MM-DD) for which the Manager marked the agent Absent. */
  absentShiftKey?: string | null
  joinedAt: number
  /** Agents only: display order used for deterministic tie-break rotation. */
  rosterOrder?: number
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

export type EnquiryChannel = 'facebook_dm' | 'instagram_dm' | 'facebook_comment' | 'instagram_comment'

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

export type OwnershipChangeKind = 'auto' | 'manual-assign' | 'manual-unassign' | 'manual-reassign' | 'released-absent' | 'unassigned-no-eligible'

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

/** Explains why the engine chose an agent (P2-FR-003: distribution must be explainable). */
export interface DistributionTrace {
  at: number
  inShift: boolean
  pool: string[]
  removedAbsent: string[]
  removedUnavailable: string[]
  removedAtCapacity: string[]
  scores: { agentId: string; count: number; offset: number; score: number }[]
  winnerId: string | null
  tieBreak: boolean
  capacityApplied: boolean
  capacity: number
}

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
}

export interface EnquiryMessage {
  from: 'customer' | 'marketing'
  text: string
  at: number
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
}

/** One automatic (or, if the pending decision allows, manual) assignment counted toward fairness. */
export interface AssignmentRecord {
  id: string
  leadId: string
  agentId: string
  companyId: CompanyId
  at: number
  kind: 'auto' | 'manual'
  counted: boolean
  /** Voided when the Lead is released from an Absent agent (P1-FR-003: counts for new owner, not the absent one). */
  voided: boolean
}

export interface FairnessOffset {
  agentId: string
  month: string // YYYY-MM (PKT)
  offset: number
  baselineNote: string
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
  | 'capacity'
  | 'agent-added'
  | 'access'
  | 'lead-created'
  | 'enquiry-converted'
  | 'status'
  | 'first-contact'
  | 'integration'
  | 'sla-alert'

export interface AuditEntry {
  id: string
  at: number
  type: AuditType
  actorId: string // 'system' for engine actions
  companyId: CompanyId | null
  leadId?: string
  agentId?: string
  summary: string
}

export type NotificationType = 'sla' | 'no-eligible' | 'integration' | 'shift-start'

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
}

export type ConnectionKind = 'meta_forms' | 'meta_inbox' | 'meta_insights' | 'website'

/**
 * working = connected & confirmed in production; pending = not yet confirmed;
 * error / recovering / recovered = failure states; no-events = connected but nothing received yet.
 */
export type ConnectionState = 'confirmed' | 'pending' | 'error' | 'recovering' | 'recovered' | 'no-events'

export interface Connection {
  id: string
  companyId: CompanyId
  kind: ConnectionKind
  state: ConnectionState
  /** What the proof of concept reported for this capability (P3-FR-003). */
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
  capacity: number
  capacityAppliesOffTime: boolean
  manualCountsTowardFairness: boolean
  slaRestartsOnReassign: boolean
  requireReassignReason: boolean
  allowBackwardStatus: boolean
  allowReopenLost: boolean
  teamLeadCanAssign: boolean
  teamLeadReceivesSla: boolean
  marketingCanCreateManualLeads: boolean
  conversionRequiredFields: (keyof CustomerFields)[]
  lossReasons: string[]
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
  clock: ClockState
  seq: number
}
