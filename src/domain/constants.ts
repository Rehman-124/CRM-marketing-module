import type { Company, CompanyId, ConnectionKind, ConnectionState, CustomerFields, EnquiryChannel, FunnelStatus, LeadSource, PendingDecisionParams } from './types'

export const COMPANIES: Company[] = [
  { id: 'flightnest', name: 'FlightNest', active: true },
  { id: 'holidaynest', name: 'HolidayNest', active: true },
  { id: 'trip2go', name: 'Trip2Go', active: true },
  { id: 'travelope', name: 'Travelope', active: true },
  { id: 'schengentravel', name: 'SchengenTravel', active: true },
  { id: 'trip2goglobal', name: 'Trip2GoGlobal', active: false },
]

export const COMPANY_COLORS: Record<CompanyId, string> = {
  flightnest: '#2563eb',
  holidaynest: '#0d9488',
  trip2go: '#7c3aed',
  travelope: '#db2777',
  schengentravel: '#d97706',
  trip2goglobal: '#64748b',
}

export const SOURCE_LABEL: Record<LeadSource, string> = {
  meta_form: 'Meta Instant Form',
  website: 'Company website form',
  facebook_dm: 'Facebook DM',
  instagram_dm: 'Instagram DM',
  facebook_comment: 'Facebook comment',
  instagram_comment: 'Instagram comment',
  phone: 'Direct phone call',
  email: 'Email enquiry',
}

export const SOURCE_SHORT: Record<LeadSource, string> = {
  meta_form: 'Meta form',
  website: 'Website',
  facebook_dm: 'FB DM',
  instagram_dm: 'IG DM',
  facebook_comment: 'FB comment',
  instagram_comment: 'IG comment',
  phone: 'Phone',
  email: 'Email',
}

export const ALL_SOURCES: LeadSource[] = ['meta_form', 'website', 'facebook_dm', 'instagram_dm', 'facebook_comment', 'instagram_comment', 'phone', 'email']

export const ENQUIRY_CHANNELS: EnquiryChannel[] = ['facebook_dm', 'instagram_dm', 'facebook_comment', 'instagram_comment']

export const STATUS_LABEL: Record<FunnelStatus, string> = {
  lead: 'Lead',
  mature: 'Mature Lead',
  hot: 'Hot Lead',
  booked: 'Booked Lead',
  lost: 'Lost',
}

export const STATUS_SHORT: Record<FunnelStatus, string> = {
  lead: 'Lead',
  mature: 'Mature',
  hot: 'Hot',
  booked: 'Booked',
  lost: 'Lost',
}

export const STATUS_DESC: Record<FunnelStatus, string> = {
  lead: 'Given to a sales agent',
  mature: 'The client picks up or meaningfully engages',
  hot: 'The client is expected to proceed',
  booked: 'The client proceeds and books with the agent',
  lost: 'The enquiry will not proceed — a reason is mandatory',
}

export const FUNNEL_ORDER: FunnelStatus[] = ['lead', 'mature', 'hot', 'booked']
export const ALL_STATUSES: FunnelStatus[] = ['lead', 'mature', 'hot', 'booked', 'lost']

/** Ordinal blue ramp for the ordered funnel stages; Lost is neutral (dataviz reference palette). */
export const STATUS_CHART_COLOR: Record<FunnelStatus, string> = {
  lead: '#86b6ef',
  mature: '#5598e7',
  hot: '#2a78d6',
  booked: '#1c5cab',
  lost: '#a8a69e',
}

export const CONNECTION_LABEL: Record<ConnectionKind, string> = {
  meta_forms: 'Meta Instant Forms (lead webhooks)',
  meta_inbox: 'Facebook/Instagram inbox & engagement',
  meta_insights: 'Meta campaign & ad insights',
  website: 'Company website form',
}

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  confirmed: 'Connected & confirmed',
  pending: 'Pending',
  error: 'Error',
  recovering: 'Recovering',
  recovered: 'Recovered',
  'no-events': 'No events yet',
}

export const FIELD_LABEL: Record<keyof CustomerFields, string> = {
  nationality: 'Passport / nationality',
  fullName: 'Full name',
  phone: 'Phone number',
  email: 'Email',
  city: 'City',
  tripDetails: 'Extra trip details',
}

export const STANDARD_FIELDS: (keyof CustomerFields)[] = ['nationality', 'fullName', 'phone', 'email', 'city']

export const EMPTY_FIELDS: CustomerFields = { nationality: '', fullName: '', phone: '', email: '', city: '', tripDetails: '' }

/**
 * Placeholders for open decisions (FRD "Open Decisions & Technical Dependencies").
 * The FRD tells designers to use placeholders until each is decided. None is an approved rule.
 */
export const DEFAULT_PARAMS: PendingDecisionParams = {
  capacity: 3, // FRD example value: "for example 3"
  capacityAppliesOffTime: true,
  manualCountsTowardFairness: false,
  slaRestartsOnReassign: true,
  requireReassignReason: false,
  allowBackwardStatus: true,
  allowReopenLost: false,
  teamLeadCanAssign: true,
  teamLeadReceivesSla: true,
  marketingCanCreateManualLeads: true,
  conversionRequiredFields: ['fullName', 'phone', 'nationality'],
  lossReasons: ['Price too high', 'Booked elsewhere', 'No response from client', 'Travel plans changed', 'Visa / documents issue', 'Other'],
}

export const SYSTEM_ID = 'system'
