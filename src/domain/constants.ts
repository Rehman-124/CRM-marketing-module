import type {
  Company, CompanyId, ConnectionKind, ConnectionState, ContactOutcome, CustomerFields, EnquiryChannel, FunnelStatus, LeadSource,
  PendingDecisionParams, SalesConfig, SalesStage, ServiceItemKey, TaskKind,
} from './types'

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
  referral: 'Referral',
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
  referral: 'Referral',
}

export const ALL_SOURCES: LeadSource[] = ['meta_form', 'website', 'facebook_dm', 'instagram_dm', 'facebook_comment', 'instagram_comment', 'phone', 'email', 'referral']

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
  booked: 'The client proceeds and books',
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
  confirmed: 'Working',
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
 * Placeholders for decisions FRD v1.4 marks "To be confirmed". None is an approved rule;
 * each is shown with a Pending tag and can be switched on the Requirements & decisions page.
 */
export const DEFAULT_PARAMS: PendingDecisionParams = {
  manualCountsTowardFairness: false,
  referralCountsTowardFairness: false,
  slaRestartsOnReassign: true,
  requireReassignReason: false,
  allowBackwardStatus: true,
  allowReopenLost: false,
  teamLeadMonitoring: true,
  teamLeadReceivesSla: true,
  marketingCanCreateManualLeads: true,
  conversionRequiredFields: ['fullName', 'phone', 'nationality'],
  lossReasons: ['Price too high', 'Booked elsewhere', 'No response from client', 'Travel plans changed', 'Visa / documents issue', 'Other'],
  draftRequiredFields: ['applicant.fullName', 'travel.destination'],
  managerInboxReplies: false,
  overrideReasonRequired: false,
  rejectionReasonRequired: false,
}

export const SYSTEM_ID = 'system'

// ================================================================ Sales (FRD v1.4 Part 2)

/** SAL-FR-004 thresholds stated in v1.4 */
export const BOOKING_MARGIN_THRESHOLD = 60 // Booked only when expected margin is strictly greater than £60
export const MIN_PARTIAL_PAYMENT = 50 // partial payments must be at least £50

export const SALES_STAGES: SalesStage[] = ['new', 'contacting', 'qualified', 'quoted', 'data_verification', 'awaiting_payment', 'booked', 'lost']
export const SALES_STAGE_LABEL: Record<SalesStage, string> = {
  new: 'New',
  contacting: 'Contacting',
  qualified: 'Qualified',
  quoted: 'Quoted',
  data_verification: 'Data Verification',
  awaiting_payment: 'Awaiting Payment',
  booked: 'Booked',
  lost: 'Lost',
}
/** Stages the CRM sets itself (SAL-FR-004): Awaiting Payment on a payment request, Booked on an Accounts-confirmed booking. */
export const SYSTEM_STAGES: SalesStage[] = ['awaiting_payment', 'booked']

export const OUTCOME_LABEL: Record<ContactOutcome, string> = {
  answered: 'Answered',
  no_answer: 'No Answer',
  voicemail: 'Voicemail',
  busy: 'Busy',
  wrong_number: 'Wrong Number',
}
export const OUTCOMES: ContactOutcome[] = ['answered', 'no_answer', 'voicemail', 'busy', 'wrong_number']

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  contact: 'Contact',
  callback: 'Callback',
  follow_up: 'Follow-up',
  balance_payment: 'Balance payment',
  review: 'Review',
  referral: 'Referral',
}

export interface QualField { key: string; label: string; sensitive?: boolean; type?: 'text' | 'date' }
export interface QualGroup { key: string; label: string; fields: QualField[] }

/**
 * SAL-FR-002 qualification groups. The four group names are from v1.4; the fields inside them are
 * PLACEHOLDERS — the real list is in the Data Model document, which was not provided.
 */
export const QUAL_GROUPS: QualGroup[] = [
  {
    key: 'travel', label: 'Travel / visa', fields: [
      { key: 'travel.destination', label: 'Destination country' },
      { key: 'travel.visaType', label: 'Visa type' },
      { key: 'travel.travelDate', label: 'Intended travel date', type: 'date' },
      { key: 'travel.purpose', label: 'Purpose of travel' },
    ],
  },
  {
    key: 'applicant', label: 'Applicant status', fields: [
      { key: 'applicant.fullName', label: 'Full name (as on passport)' },
      { key: 'applicant.dob', label: 'Date of birth', type: 'date' },
      { key: 'applicant.nationality', label: 'Nationality' },
      { key: 'applicant.passportNumber', label: 'Passport number', sensitive: true },
      { key: 'applicant.passportExpiry', label: 'Passport expiry', type: 'date', sensitive: true },
      { key: 'applicant.visaStatus', label: 'UK immigration / visa status', sensitive: true },
      { key: 'applicant.shareCode', label: 'Share code', sensitive: true },
    ],
  },
  {
    key: 'contact', label: 'Contact / residence', fields: [
      { key: 'contact.address', label: 'Address' },
      { key: 'contact.city', label: 'City' },
      { key: 'contact.postcode', label: 'Postcode' },
      { key: 'contact.phone', label: 'Phone' },
      { key: 'contact.email', label: 'Email' },
    ],
  },
  {
    key: 'work', label: 'Work / study', fields: [
      { key: 'work.status', label: 'Employment or study status' },
      { key: 'work.organisation', label: 'Employer or institution' },
      { key: 'work.role', label: 'Job title or course' },
    ],
  },
]
export const ALL_QUAL_FIELDS = QUAL_GROUPS.flatMap((g) => g.fields)
export const QUAL_FIELD_LABEL: Record<string, string> = Object.fromEntries(ALL_QUAL_FIELDS.map((f) => [f.key, f.label]))
export const SENSITIVE_FIELDS = ALL_QUAL_FIELDS.filter((f) => f.sensitive).map((f) => f.key)

/** SAL-FR-003 / SAL-FR-006 service items (names from v1.4). */
export const SERVICE_ITEM_LABEL: Record<ServiceItemKey, string> = {
  appointment_letter: 'Appointment / appointment letter',
  travel_insurance: 'Travel insurance',
  visa_application_form: 'Official visa application form',
  hotel_reservation: 'Hotel reservation for visa purpose',
  cover_letter: 'Cover letter',
  flight_reservation: 'Flight reservation',
  actual_flight: 'Actual flight booking (add-on)',
  actual_hotel: 'Actual hotel booking (add-on)',
}
/** The five standard deliverables every visa-service package includes. */
export const STANDARD_DELIVERABLES: ServiceItemKey[] = ['appointment_letter', 'travel_insurance', 'visa_application_form', 'hotel_reservation', 'cover_letter']

/**
 * Placeholder "configured expected case costs" (£ per included item). DEMO VALUES ONLY — the expected-cost
 * items per package, their values and who maintains them are to be confirmed (SAL-FR-003).
 */
export const DEFAULT_SALES_CONFIG: SalesConfig = {
  expectedCosts: {
    appointment_letter: 35,
    travel_insurance: 25,
    visa_application_form: 20,
    hotel_reservation: 10,
    cover_letter: 5,
    flight_reservation: 20,
    actual_flight: 0,
    actual_hotel: 0,
  },
  invoiceReminderDays: null,
  invoiceEscalationDays: null,
  retentionDays: null,
  linkMinutes: 5,
  digiSignerReachable: true,
}

/** Placeholder Service/Visa Case status list — the final milestone/status list is to be confirmed (SAL-FR-006). */
export const CASE_STATUSES = ['Options pending', 'Options sent to agent', 'Customer selection recorded', 'Appointment booked', 'Documents in preparation', 'Pack sent', 'Awaiting decision']
