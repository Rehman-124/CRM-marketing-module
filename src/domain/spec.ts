// FR tracker, acceptance criteria and open decisions transcribed from
// "Trip2Go CRM — Functional Requirements & Acceptance Criteria (Marketing & Sales)", v1.4, 17 November 2026.

export interface FR {
  id: string
  title: string
  part: 'Marketing' | 'Sales'
  phase: 1 | 2 | 3
  priority: 'Must Have' | 'Should Have'
  status: 'Ready for Design' | 'Pending technical validation'
  route: string
  where: string
  acs: { id: string; text: string }[]
}

export const FRS: FR[] = [
  // ------------------------------------------------------------ Part 1 — Marketing
  {
    id: 'P1-FR-001', part: 'Marketing', title: 'Lead Capture & Social Qualification', phase: 1, priority: 'Must Have', status: 'Ready for Design', route: '/inbox',
    where: 'Marketing Inbox (conversation list, thread, client details with Convert to Lead), New manual lead, Lead detail · Demo console → Simulate an incoming enquiry / Meta form',
    acs: [
      { id: 'AC-P1-001-1', text: 'A submitted Meta Instant Form creates a Lead with its company, and its campaign and ad where Meta provides them.' },
      { id: 'AC-P1-001-2', text: 'A website form, phone call or manual email enquiry creates a Lead.' },
      { id: 'AC-P1-001-3', text: 'A Facebook/Instagram DM or comment creates an Unqualified Enquiry that is not assigned to any agent.' },
      { id: 'AC-P1-001-4', text: 'Marketing can convert an Unqualified Enquiry into a Lead, and its company and source carry over.' },
      { id: 'AC-P1-001-5', text: 'An Unqualified Enquiry never enters distribution before conversion.' },
      { id: 'AC-P1-001-6', text: 'A Lead with no campaign data is created and labelled as such.' },
    ],
  },
  {
    id: 'P1-FR-002', part: 'Marketing', title: 'Company Routing, Fair Distribution & Manual Assignment', phase: 1, priority: 'Must Have', status: 'Ready for Design', route: '/team',
    where: 'Team & shift (Absent switches), top-bar availability toggle (as an agent), Lead detail → “Why this assignment?”, Assign / Reassign / Unassign dialogs, Unassigned leads, Access → Permission settings',
    acs: [
      { id: 'AC-P1-002-1', text: 'A Lead is evaluated only against agents of its own company.' },
      { id: 'AC-P1-002-2', text: 'A Manager or Admin can mark an agent Absent, and an agent can set their own Available and Unavailable status.' },
      { id: 'AC-P1-002-3', text: 'Only the non-Absent agent(s) with the lowest score are considered for an automatic assignment.' },
      { id: 'AC-P1-002-4', text: 'During shift, if one or more agents in that group are Available, the Lead goes to an Available agent in the group.' },
      { id: 'AC-P1-002-5', text: 'If every agent in the group is Unavailable, the Lead is still assigned to an agent in the group.' },
      { id: 'AC-P1-002-6', text: 'A higher-score agent never receives the Lead while a lower-score non-Absent agent exists, even if the higher-score agent is Available.' },
      { id: 'AC-P1-002-7', text: 'When agents are tied on the lowest score, the rotating tie-breaker alternates between them.' },
      { id: 'AC-P1-002-8', text: 'Scores carry across days and do not reset at midnight.' },
      { id: 'AC-P1-002-9', text: 'A redistributed Lead counts toward its new owner.' },
      { id: 'AC-P1-002-10', text: 'A user with Reassignment permission can assign, unassign and reassign a Lead; Managers are assigned this permission and Admin has it by default. The new owner is visible immediately and every previous owner stays in history with the user and time.' },
      { id: 'AC-P1-002-11', text: 'A Lead can only be given to an agent of its own company, and a user without permission, or from another company, cannot change ownership.' },
    ],
  },
  {
    id: 'P1-FR-003', part: 'Marketing', title: 'Shift, Off-Time & One-Hour Contact SLA', phase: 1, priority: 'Must Have', status: 'Ready for Design', route: '/distribution',
    where: 'Lead detail SLA panel, My leads, Distribution & SLA alerts, Team & shift Absent switches, Audit log · Demo console clock',
    acs: [
      { id: 'AC-P1-003-1', text: 'No SLA alert is raised for an unassigned Lead.' },
      { id: 'AC-P1-003-2', text: 'No SLA alert is raised during 22:00–14:00 PKT.' },
      { id: 'AC-P1-003-3', text: 'The timer pauses while the owner is Unavailable and resumes when they are Available.' },
      { id: 'AC-P1-003-4', text: 'A Lead assigned to an Unavailable owner raises no alert until that owner becomes Available.' },
      { id: 'AC-P1-003-5', text: 'After one hour of counted time without first contact, the Manager/Team Lead receives an alert.' },
      { id: 'AC-P1-003-6', text: 'Recording first contact stops the timer and clears the pending flag.' },
      { id: 'AC-P1-003-7', text: 'Missing the SLA never reassigns the Lead automatically.' },
      { id: 'AC-P1-003-8', text: 'At shift start, an Absent agent’s pending off-time Leads are redistributed and counted for the new owner.' },
      { id: 'AC-P1-003-9', text: 'Availability changes and manual reassignments appear in the audit log.' },
    ],
  },
  {
    id: 'P2-FR-001', part: 'Marketing', title: 'Lead Outcome & Funnel Tracking', phase: 2, priority: 'Must Have', status: 'Ready for Design', route: '/my-leads',
    where: 'Lead detail (status control, histories, notes), My leads end-of-shift update (as an agent)',
    acs: [
      { id: 'AC-P2-001-1', text: 'All five approved statuses are available to the agent.' },
      { id: 'AC-P2-001-2', text: 'Lost cannot be saved without a loss reason.' },
      { id: 'AC-P2-001-3', text: 'First-contact time is stored separately from the funnel status.' },
      { id: 'AC-P2-001-4', text: 'Every status change is kept in history with date and user.' },
      { id: 'AC-P2-001-5', text: 'After a manual reassignment, the previous owner stays visible in the history.' },
      { id: 'AC-P2-001-6', text: 'An agent can add and edit notes on their own Leads.' },
    ],
  },
  {
    id: 'P2-FR-002', part: 'Marketing', title: 'Marketing Funnel & Meta Insights Reporting', phase: 2, priority: 'Must Have', status: 'Ready for Design', route: '/reports',
    where: 'Reports (three tabs, filters, daily/weekly/monthly) · Demo console → Meta insights reachable / Refresh',
    acs: [
      { id: 'AC-P2-002-1', text: 'The funnel report shows Lead, Mature, Hot, Booked and Lost counts.' },
      { id: 'AC-P2-002-2', text: 'The Meta performance report shows the agreed metrics per campaign and per ad, next to the funnel counts.' },
      { id: 'AC-P2-002-3', text: 'Date range, company, campaign, ad and source filters all work.' },
      { id: 'AC-P2-002-4', text: 'Daily, weekly and monthly views show consistent figures.' },
      { id: 'AC-P2-002-5', text: 'CPL and cost per booking show “N/A” when their inputs are missing or cannot be calculated.' },
      { id: 'AC-P2-002-6', text: 'Leads without attribution appear under “Unattributed”.' },
      { id: 'AC-P2-002-7', text: 'The screen shows when the Meta data was last refreshed.' },
      { id: 'AC-P2-002-8', text: 'If Meta data cannot be fetched, a message appears and the CRM funnel still loads.' },
      { id: 'AC-P2-002-9', text: 'The loss-reason breakdown matches the Lost Leads in the same filter.' },
    ],
  },
  {
    id: 'P2-FR-003', part: 'Marketing', title: 'Management Monitoring: Distribution & SLA', phase: 2, priority: 'Must Have', status: 'Ready for Design', route: '/distribution',
    where: 'Distribution & SLA (as Admin, Manager, and as a Team Lead)',
    acs: [
      { id: 'AC-P2-003-1', text: 'The Manager can see Leads allocated per agent.' },
      { id: 'AC-P2-003-2', text: 'Each agent’s current fair-distribution score is visible.' },
      { id: 'AC-P2-003-3', text: 'Unassigned and uncontacted Leads are listed.' },
      { id: 'AC-P2-003-4', text: 'SLA alerts are visible with the Lead and its owner.' },
      { id: 'AC-P2-003-5', text: 'Manual assignment history and availability changes are visible.' },
      { id: 'AC-P2-003-6', text: 'The view never changes a Lead’s owner automatically.' },
      { id: 'AC-P2-003-7', text: 'A Team Lead sees only their own team’s data.' },
    ],
  },
  {
    id: 'P3-FR-001', part: 'Marketing', title: 'Company-Based Access & Permissions', phase: 3, priority: 'Must Have', status: 'Ready for Design', route: '/access',
    where: 'Access, roles & permissions, company switcher, “View the CRM as…” user switcher, permission-denied screens',
    acs: [
      { id: 'AC-P3-001-1', text: 'A Marketing employee can manage only the companies assigned to them.' },
      { id: 'AC-P3-001-2', text: 'Editing another company’s data is blocked.' },
      { id: 'AC-P3-001-3', text: 'The Manager can view all six companies.' },
      { id: 'AC-P3-001-4', text: 'A Manager or Admin can mark an agent Absent.' },
      { id: 'AC-P3-001-5', text: 'A Sales Agent can set their own Available and Unavailable status.' },
      { id: 'AC-P3-001-6', text: 'A Sales Agent can see only their own assigned Leads/opportunities and customer conversations; role restrictions are visible in the prototype.' },
    ],
  },
  {
    id: 'P3-FR-002', part: 'Marketing', title: 'External Integration & Failure Handling', phase: 3, priority: 'Must Have', status: 'Pending technical validation', route: '/integrations',
    where: 'Integrations · Demo console → Re-deliver last Meta event, Simulate failure',
    acs: [
      { id: 'AC-P3-002-1', text: 'A Meta Instant Form submission reaches the CRM as a Lead with its attribution.' },
      { id: 'AC-P3-002-2', text: 'A repeated delivery of the same Meta event does not create a second Lead.' },
      { id: 'AC-P3-002-3', text: 'Connections not yet confirmed are labelled “pending”, not shown as working.' },
      { id: 'AC-P3-002-4', text: 'Company, source, campaign and ad details are kept wherever available.' },
      { id: 'AC-P3-002-5', text: 'A connection failure is visible to the Manager.' },
      { id: 'AC-P3-002-6', text: 'After a failure, missed events are recovered or flagged, and none are lost silently.' },
      { id: 'AC-P3-002-7', text: 'Each connection’s state (working, pending, error) appears in the prototype.' },
    ],
  },
  // ------------------------------------------------------------ Part 2 — Sales
  {
    id: 'SAL-FR-001', part: 'Sales', title: 'Assigned Opportunity Workspace, Contact & Follow-up', phase: 1, priority: 'Must Have', status: 'Ready for Design', route: '/sales/opportunities',
    where: 'My opportunities, opportunity detail (timeline, Call / WhatsApp quick actions, outcome picker, task dialog, Lost, Low Intent / Dormant, referral), Conversations (My / Company Inbox)',
    acs: [
      { id: 'AC-SAL-001-1', text: 'An assigned Lead appears in its owner’s list with owner, assignment time and attribution.' },
      { id: 'AC-SAL-001-2', text: 'A referral Lead is assigned to the agent who owns the referring customer.' },
      { id: 'AC-SAL-001-3', text: 'A preferred contact time creates a UK-local contact task, and a Lead without one prompts immediate contact.' },
      { id: 'AC-SAL-001-4', text: 'Every contact attempt is saved on the timeline with one of the five outcomes.' },
      { id: 'AC-SAL-001-5', text: 'A callback creates a dated task, overdue tasks are flagged, and tasks never change the stage.' },
      { id: 'AC-SAL-001-6', text: 'The CRM never closes an opportunity automatically, and Lost cannot be saved without a reason.' },
      { id: 'AC-SAL-001-7', text: 'An agent cannot see another agent’s WhatsApp conversations; a Manager and an Admin can view all agent inboxes/conversations within their permitted company scope.' },
      { id: 'AC-SAL-001-8', text: 'An absent agent’s active opportunities/bookings keep their owner unless an authorised user with Reassignment permission changes ownership; only new/pending unworked Leads are redistributed.' },
    ],
  },
  {
    id: 'SAL-FR-002', part: 'Sales', title: 'Qualification & Client Information Draft', phase: 1, priority: 'Must Have', status: 'Ready for Design', route: '/sales/opportunities',
    where: 'Opportunity → Qualification & draft tab (applicants, draft preview, verification dialog, version history)',
    acs: [
      { id: 'AC-SAL-002-1', text: 'The four qualification groups are stored as structured fields for one or more applicants.' },
      { id: 'AC-SAL-002-2', text: 'The draft is generated from stored data with no retyping.' },
      { id: 'AC-SAL-002-3', text: 'An approval is saved with channel, agent and time.' },
      { id: 'AC-SAL-002-4', text: 'A correction request keeps the draft unverified.' },
      { id: 'AC-SAL-002-5', text: 'A material change creates a new unverified version, and earlier versions stay in history.' },
    ],
  },
  {
    id: 'SAL-FR-003', part: 'Sales', title: 'Quote & Expected Margin', phase: 1, priority: 'Must Have', status: 'Ready for Design', route: '/sales/opportunities',
    where: 'Opportunity → Quote tab (quote form, expected-margin panel)',
    acs: [
      { id: 'AC-SAL-003-1', text: 'Package, included services and amount can be recorded, and the CRM never changes the amount or proposes a price.' },
      { id: 'AC-SAL-003-2', text: 'Every visa-service package includes the five standard deliverables; a flight reservation can be added when required by the case/country; actual flight or hotel bookings are added only when the customer requests those add-on services.' },
      { id: 'AC-SAL-003-3', text: 'The expected margin is shown when the quote is saved and recalculated when it changes.' },
      { id: 'AC-SAL-003-4', text: 'The included services appear as the case checklist after booking.' },
    ],
  },
  {
    id: 'SAL-FR-004', part: 'Sales', title: 'Payment Verification, Booking & Refunds', phase: 1, priority: 'Must Have', status: 'Ready for Design', route: '/sales/accounts',
    where: 'Opportunity → Payments & booking tab (payment request form, override), Accounts queue (as Accounts), Bookings (refund form as Helpline)',
    acs: [
      { id: 'AC-SAL-004-1', text: 'A partial payment below £50 cannot be submitted.' },
      { id: 'AC-SAL-004-2', text: 'A Sales user cannot confirm or reject a payment; an Accounts user can.' },
      { id: 'AC-SAL-004-3', text: 'The opportunity stays Awaiting Payment until Accounts confirms.' },
      { id: 'AC-SAL-004-4', text: 'A confirmed payment with margin above £60 creates a Booking automatically; a margin of £60 or less does not.' },
      { id: 'AC-SAL-004-5', text: 'Only a user with Booking Margin Override permission can override the £60 threshold; Managers are assigned this permission, Admin has it by default, and the CRM records the user and time.' },
      { id: 'AC-SAL-004-6', text: 'Each confirmed payment updates the amount paid and the balance.' },
      { id: 'AC-SAL-004-7', text: 'A Sales user cannot approve a refund, and an approved refund keeps the Booking and reduces actual margin.' },
    ],
  },
  {
    id: 'SAL-FR-005', part: 'Sales', title: 'Invoice/Terms & Signature Tracking', phase: 1, priority: 'Must Have', status: 'Pending technical validation', route: '/sales/invoices',
    where: 'Opportunity → Payments & booking tab (invoice panel, Unsigned Invoice flag), Invoices & escalations · Demo console → DigiSigner reachable, Customer signs',
    acs: [
      { id: 'AC-SAL-005-1', text: 'Creating a Booking fills the template and sends it through DigiSigner.' },
      { id: 'AC-SAL-005-2', text: 'Signature status shows Not Generated, Sent or Signed and does not change the Booking status.' },
      { id: 'AC-SAL-005-3', text: 'An unsigned invoice shows the flag, which clears on signing.' },
      { id: 'AC-SAL-005-4', text: 'An unsigned invoice never blocks work or cancels the Booking.' },
      { id: 'AC-SAL-005-5', text: 'After the period, the agent is reminded and then a Manager is alerted.' },
    ],
  },
  {
    id: 'SAL-FR-006', part: 'Sales', title: 'Service Case Handoff & Fulfilment Coordination', phase: 1, priority: 'Must Have', status: 'Ready for Design', route: '/sales/cases',
    where: 'Service cases (as Processing) and the opportunity Case tab (as the agent): owners, options and selection, balance banner, deliverables checklist, completeness check, pack sent, status, Granted / Refused',
    acs: [
      { id: 'AC-SAL-006-1', text: 'A Booking creates one linked case with the verified draft and both owners.' },
      { id: 'AC-SAL-006-2', text: 'The CRM never selects a country; the agent’s recorded selection notifies Processing.' },
      { id: 'AC-SAL-006-3', text: 'A recorded appointment notifies the agent.' },
      { id: 'AC-SAL-006-4', text: 'After appointment booking, an outstanding balance blocks all further service-document preparation and final pack release until Accounts confirms the full balance.' },
      { id: 'AC-SAL-006-5', text: 'The checklist always contains the five mandatory deliverables with the correct responsible owner; conditional flight reservation and optional actual flight/hotel add-ons appear only when applicable.' },
      { id: 'AC-SAL-006-6', text: 'The pack cannot be marked sent before the completeness check.' },
      { id: 'AC-SAL-006-7', text: 'A Refused outcome leaves the Booking as Booked, and a Granted outcome creates review and referral tasks.' },
    ],
  },
  {
    id: 'SAL-FR-007', part: 'Sales', title: 'Sales Workspace & Reporting', phase: 2, priority: 'Should Have', status: 'Ready for Design', route: '/sales',
    where: 'Sales workspace (as an agent), Sales reports (as Manager or Admin; denied for agents and Marketing)',
    acs: [
      { id: 'AC-SAL-007-1', text: 'The workspace shows own opportunities, tasks, and payment, invoice and case status.' },
      { id: 'AC-SAL-007-2', text: 'A Manager or Admin can open the Sales performance reports, and a Sales Agent cannot.' },
      { id: 'AC-SAL-007-3', text: 'The reports show each listed measure.' },
      { id: 'AC-SAL-007-4', text: 'Actual margin appears only when Accounts data exists.' },
      { id: 'AC-SAL-007-5', text: 'An approved refund lowers that month’s actual margin while the Booking still counts.' },
    ],
  },
  {
    id: 'SAL-FR-008', part: 'Sales', title: 'Sales Access, Overrides & Sensitive Data', phase: 3, priority: 'Must Have', status: 'Ready for Design', route: '/access',
    where: 'Access → Permission settings & sensitive matrix, opportunity Qualification (masked fields) and Documents tabs, Sales settings (retention), Audit log → Sensitive data & permissions',
    acs: [
      { id: 'AC-SAL-008-1', text: 'Only a user with Reassignment permission can reassign an opportunity; Managers are assigned this permission and Admin has it by default.' },
      { id: 'AC-SAL-008-2', text: 'Only a user with the relevant Override permission can override a controlled rule; Managers receive approved override permissions and Admin holds all permissions by default.' },
      { id: 'AC-SAL-008-3', text: 'Sensitive metadata is stored in the CRM database, raw documents are stored in private object storage, users without a need cannot access them, and frontline users have no bulk download.' },
      { id: 'AC-SAL-008-4', text: 'Sensitive-data access and important status changes appear in the audit log, and raw document access is never provided through a permanent public URL.' },
      { id: 'AC-SAL-008-5', text: 'The CRM supports scheduled deletion of raw sensitive documents under the approved retention policy while preserving appropriate non-sensitive business history.' },
    ],
  },
]

/** Every "To be confirmed" item in v1.4, with the placeholder the prototype uses until it is decided. */
export const OPEN_DECISIONS: { group: string; items: { id: string; text: string; placeholder?: string }[] }[] = [
  {
    group: 'P1-FR-001 · P1-FR-002 · P1-FR-003 (Marketing distribution & SLA)',
    items: [
      { id: 'TBC-1', text: 'The required fields before a social enquiry can be converted.', placeholder: 'Demo parameter (default: full name, phone, nationality).' },
      { id: 'TBC-2', text: 'How the fair-distribution score is calculated.', placeholder: 'Counted automatic assignments + starting score (product-owner placeholder, 19 Nov 2026).' },
      { id: 'TBC-3', text: 'What score a newly added agent starts with.', placeholder: 'Team average score when added, rounded.' },
      { id: 'TBC-4', text: 'Whether the score is ever reset beyond “not at midnight”.', placeholder: 'No automatic reset.' },
      { id: 'TBC-5', text: 'Whether a manual assignment counts toward the score.', placeholder: 'Demo parameter (default: no). Referrals use a separate parameter (default: no).' },
      { id: 'TBC-6', text: 'What happens to a Lead when every agent is Absent or the company has no agents (for example Trip2GoGlobal).', placeholder: 'Lead stays Unassigned and Managers are notified.' },
      { id: 'TBC-7', text: 'The order of the tie-breaker.', placeholder: 'Roster order, rotating after the previous tie winner.' },
      { id: 'TBC-8', text: 'Whether a reassignment needs a reason, restarts the SLA timer or notifies the previous owner.', placeholder: 'Demo parameters: reason optional, timer restarts; previous owner not notified.' },
      { id: 'TBC-9', text: 'Which action counts as the “dealing/contact” event (must match the first-contact timestamp).', placeholder: '“Record first contact”, or the explicit option when logging a contact attempt.' },
      { id: 'TBC-10', text: 'How alerts are delivered (in-app, email or both).', placeholder: 'In-app only.' },
    ],
  },
  {
    group: 'P2-FR-001 · P2-FR-002 · P2-FR-003 (outcomes, reporting, monitoring)',
    items: [
      { id: 'TBC-11', text: 'The allowed Lost reasons; whether a Lead can move backward or a Lost Lead be reopened.', placeholder: 'Placeholder reason list; backward/reopen are demo parameters.' },
      { id: 'TBC-12', text: 'Whether the end-of-shift update is enforced or only a reminder, and the format of notes.', placeholder: 'Reminder only; free-text notes.' },
      { id: 'TBC-13', text: 'The final metric set and its priority; refresh frequency; report layouts; funnel-ratio formulas.', placeholder: 'Working default metric list; manual refresh; share-of-Leads ratios.' },
      { id: 'TBC-14', text: 'How CPL and cost per booking are calculated (whether “leads” means lead results reported by Meta or Leads in the CRM). CPA is not defined; ad-set reporting is not specified.', placeholder: 'CPL = spend ÷ CRM Leads attributed to a campaign; cost per booking = spend ÷ CRM Booked Leads; no CPA; no ad-set level.' },
      { id: 'TBC-15', text: 'How long alerts and history are kept, whether data can be exported, and what a Team Lead sees.', placeholder: 'Kept for the demo; no export; Team Lead sees own team (demo parameter).' },
    ],
  },
  {
    group: 'P3-FR-001 · P3-FR-002 (access & integrations)',
    items: [
      { id: 'TBC-16', text: 'The detailed field-level permission matrix (Roles & Permissions document).', placeholder: 'Summary matrix from v1.4; back-office roles scoped to all companies.' },
      { id: 'TBC-17', text: 'Whether one person can hold several roles; how read-only access to other companies is switched on.', placeholder: 'One role per user; view-only toggles on Access.' },
      { id: 'TBC-18', text: 'The integration recovery method (retry timing, any fallback such as a sync of missed leads, who is alerted). The design must not invent one.', placeholder: 'Failed events are flagged; recovery states are simulated only.' },
    ],
  },
  {
    group: 'SAL-FR-001 · SAL-FR-002 · SAL-FR-003 (Sales workspace, draft, quote)',
    items: [
      { id: 'TBC-19', text: 'The final detailed Sales stage list.', placeholder: 'The eight stages named in v1.4.' },
      { id: 'TBC-20', text: 'Whether Manager/Admin inbox access is view-only or also permits replies.', placeholder: 'View-only (demo parameter).' },
      { id: 'TBC-21', text: 'Whether an exact-phone possible-duplicate warning is included.', placeholder: 'Not included; duplicates are never merged automatically.' },
      { id: 'TBC-22', text: 'The fields required before a Client Information Draft can be generated.', placeholder: 'Demo parameter (default: applicant full name, destination).' },
      { id: 'TBC-23', text: 'Which changes count as material.', placeholder: 'Any change to a verified draft’s data.' },
      { id: 'TBC-24', text: 'The expected-cost items per package, who maintains them, and the margin formula.', placeholder: 'Demo costs per item on Sales settings; margin = agreed amount − Σ costs of included cost items.' },
    ],
  },
  {
    group: 'SAL-FR-004 · SAL-FR-005 · SAL-FR-006 (payments, invoice, case)',
    items: [
      { id: 'TBC-25', text: 'Whether a margin override requires a mandatory reason and whether a payment rejection requires a reason.', placeholder: 'Demo parameters (default: optional).' },
      { id: 'TBC-26', text: 'The unsigned period before the reminder and the Manager alert (§13 Q7).', placeholder: 'Not configured — no reminders run until the Admin sets them on Sales settings.' },
      { id: 'TBC-27', text: 'The final Service/Visa Case milestone/status list.', placeholder: 'Placeholder list of seven statuses + Granted/Refused.' },
      { id: 'TBC-28', text: 'The approved invoice/terms template (not provided).', placeholder: 'Placeholder preview built from the Booking; DigiSigner simulated.' },
    ],
  },
  {
    group: 'SAL-FR-007 · SAL-FR-008 (reporting, data protection)',
    items: [
      { id: 'TBC-29', text: 'How detailed Sales stages map to the shared Mature and Hot funnel statuses; report layouts and filters.', placeholder: 'Mature/Hot stay agent-set; Booked/Lost follow Sales (product-owner decision 19 Nov 2026).' },
      { id: 'TBC-30', text: 'The exact retention period and deletion schedule; which reassignment/override actions require a mandatory reason.', placeholder: 'Retention not configured by default; reasons are demo parameters.' },
      { id: 'TBC-31', text: 'The lifetime of a “short-lived” file-access link.', placeholder: '5 minutes (Sales settings).' },
    ],
  },
  {
    group: 'Technical validation (not built in the prototype)',
    items: [
      { id: 'TV-1', text: 'Meta: credentials, six-company authorisation, webhook behaviour, production inbox/comment permissions (Integration Specifications).' },
      { id: 'TV-2', text: 'Company website forms with anti-spam controls.' },
      { id: 'TV-3', text: 'DigiSigner: template filling, sending and signature status webhooks (SAL-FR-005, pending technical validation).' },
      { id: 'TV-4', text: 'Company WhatsApp integration for agent conversations (not specified as validated).' },
      { id: 'TV-5', text: 'Private object storage for raw documents and short-lived signed links.' },
    ],
  },
]

/** Decisions taken by the product owner for items the FRD leaves open or does not cover. */
export const OWNER_DECISIONS: { date: string; topic: string; text: string }[] = [
  { date: '18 Oct 2026', topic: 'Who replies from the Marketing Inbox', text: 'Marketing employees for their assigned companies, and the Admin / CRM Manager for any company. Outside FRD v1.4 — kept as a product-owner decision (19 Nov 2026).' },
  { date: '18 Oct 2026', topic: 'After conversion', text: 'The Marketing conversation stays open for replies after the enquiry is converted to a Lead.' },
  { date: '18 Oct 2026', topic: 'Comment replies', text: 'Both Meta’s one private reply (within 7 days) and public replies under the comment are allowed.' },
  { date: '18 Oct 2026', topic: 'Messaging server', text: 'A Node messaging server in this repository holds the Meta tokens; the CRM never sees them.' },
  { date: '19 Nov 2026', topic: 'Booked / Lost in the shared funnel', text: 'Booked Lead is set only when a Booking is created (Accounts-confirmed payment + margin rule or override). Lost mirrors the Sales Lost with the same reason. Mature and Hot stay agent-set until the mapping is confirmed.' },
  { date: '19 Nov 2026', topic: 'Score placeholder', text: 'Score = counted assignments; a new agent starts at the team average; no automatic reset. All marked “to be confirmed”.' },
  { date: '19 Nov 2026', topic: 'Placeholders for missing documents', text: 'Clearly labelled placeholders for the Data Model qualification fields, expected costs, invoice template and Roles & Permissions matrix.' },
]

/** Ambiguities found while implementing — interpretations used in the prototype. */
export const INTERPRETATIONS: { topic: string; text: string }[] = [
  { topic: 'Manager scope', text: 'v1.4: “The Manager sees all companies through a company switcher.” The seeded Manager oversees all six companies.' },
  { topic: 'Who confirms payments', text: '“Only Accounts confirms or rejects” is applied strictly, even though Admin “holds every permission” — Admin cannot confirm payments.' },
  { topic: 'Unworked Lead (Absent release)', text: 'Released only when assigned off-time, no first contact, Sales stage New and no contact attempt.' },
  { topic: 'Stage changes', text: 'The agent sets Sales stages by hand, except Awaiting Payment (set on a payment request) and Booked (set on booking).' },
  { topic: 'Low Intent / Dormant', text: 'A flag on the opportunity, not a stage; searchable and reactivatable.' },
  { topic: 'Hotel reservation owner', text: 'Processing owns it when it needs company expenditure, otherwise Sales; the quote records which.' },
  { topic: 'Flight reservation cost', text: 'A free flight reservation adds no expected cost and is owned by Sales; a paid one adds cost and is owned by Processing.' },
  { topic: 'Add-on owner', text: 'Actual flight and hotel add-ons are assigned to Processing on the checklist.' },
  { topic: 'Completeness check', text: 'Requires every checklist item to be complete and the appointment to be booked.' },
  { topic: 'Balance gate', text: 'Blocks ticking checklist items, the completeness check and pack release; recording options and the appointment are not blocked.' },
  { topic: 'Partial payment', text: 'Must be at least £50 and less than the outstanding amount; “full” pays the whole outstanding amount.' },
  { topic: 'One request at a time', text: 'Only one payment request can await Accounts at a time, and the quote is locked while one is waiting or after booking.' },
  { topic: 'Refund amount', text: 'Cannot exceed confirmed payments minus approved and pending refunds.' },
  { topic: 'Absent and the SLA', text: 'An agent marked Absent is not treated as Available, so their SLA timers do not run.' },
  { topic: 'Unassign and the SLA', text: 'Unassigning pauses the timer (no SLA for Unassigned Leads) and clears an open alert.' },
  { topic: 'Manual entry by “authorised users”', text: 'Admin and Manager, and (by demo parameter) Marketing employees for their companies, can create manual Leads; only Reassignment holders can choose manual assignment.' },
]
