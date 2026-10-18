// FR tracker, acceptance criteria and open decisions transcribed from
// "Trip2Go CRM — Marketing Functional Requirements & Acceptance Criteria" (10 Oct 2026).

export interface FR {
  id: string
  title: string
  phase: 1 | 2 | 3
  priority: 'Must Have' | 'Should Have'
  route: string
  where: string
  acs: { id: string; text: string }[]
}

export const FRS: FR[] = [
  {
    id: 'P1-FR-001', title: 'Lead Capture, Attribution & Social Qualification', phase: 1, priority: 'Must Have', route: '/inbox',
    where: 'Marketing Inbox, Enquiry detail, New manual lead, Lead detail · Demo console → Simulate an incoming enquiry',
    acs: [
      { id: 'AC-P1-001-1', text: 'A submitted Meta Instant Form creates a Lead with its company, and its campaign and ad where Meta provides them.' },
      { id: 'AC-P1-001-2', text: 'A website form, phone call or manual email enquiry creates a Lead.' },
      { id: 'AC-P1-001-3', text: 'A Facebook/Instagram DM or comment creates an Unqualified Enquiry that is not assigned to any agent.' },
      { id: 'AC-P1-001-4', text: 'Marketing can convert an Unqualified Enquiry into a Lead, and its company and source carry over.' },
      { id: 'AC-P1-001-5', text: 'A Lead with no campaign data is created and marked as such.' },
      { id: 'AC-P1-001-6', text: 'An Unqualified Enquiry never enters distribution before conversion.' },
    ],
  },
  {
    id: 'P1-FR-002', title: 'Company-Level Routing & Agent Eligibility', phase: 1, priority: 'Must Have', route: '/team',
    where: 'Team & shift, Unassigned leads, Assign dialog, Lead detail → “Why this assignment?”, agent availability toggle in the top bar',
    acs: [
      { id: 'AC-P1-002-1', text: 'A Lead is evaluated only against agents of its own company.' },
      { id: 'AC-P1-002-2', text: 'Absent agents are removed first.' },
      { id: 'AC-P1-002-3', text: 'Unavailable agents are removed before fairness selection.' },
      { id: 'AC-P1-002-4', text: 'Agents at capacity receive no new assignment.' },
      { id: 'AC-P1-002-5', text: 'If no agent is eligible, the Lead stays Unassigned and the Manager is notified.' },
      { id: 'AC-P1-002-6', text: 'A Manager can assign, unassign and reassign a Lead by hand, and each change is kept in history.' },
    ],
  },
  {
    id: 'P1-FR-003', title: 'Monthly Fairness, Capacity & New-Agent Baseline', phase: 1, priority: 'Must Have', route: '/distribution',
    where: 'Distribution & SLA (fairness table, month selector), Team & shift → Add agent · Demo console → Next month',
    acs: [
      { id: 'AC-P1-003-1', text: 'Among eligible agents, the one with the lowest score receives the next Lead.' },
      { id: 'AC-P1-003-2', text: 'Scores carry across days within the same calendar month.' },
      { id: 'AC-P1-003-3', text: 'Scores reset automatically at the start of a new month.' },
      { id: 'AC-P1-003-4', text: 'A mid-month new agent starts with a baseline offset and a real count of 0.' },
      { id: 'AC-P1-003-5', text: 'An agent at capacity receives no new Leads and their score is unchanged.' },
      { id: 'AC-P1-003-6', text: 'Equal scores do not reset the cycle, and ties rotate between agents.' },
      { id: 'AC-P1-003-7', text: 'A redistributed Lead counts for its new owner.' },
    ],
  },
  {
    id: 'P1-FR-004', title: 'Shift, Off-Time & One-Hour Contact SLA', phase: 1, priority: 'Must Have', route: '/my-leads',
    where: 'Lead detail SLA panel, My leads, Distribution & SLA alerts, Team & shift Absent switches, Audit log · Demo console clock',
    acs: [
      { id: 'AC-P1-004-1', text: 'No SLA alert is raised for an unassigned Lead.' },
      { id: 'AC-P1-004-2', text: 'No SLA alert is raised during 22:00–14:00 PKT.' },
      { id: 'AC-P1-004-3', text: 'The timer pauses while the owner is Unavailable and resumes when they are Available.' },
      { id: 'AC-P1-004-4', text: 'After one hour of counted time without first contact, the Manager/Team Lead receives an alert.' },
      { id: 'AC-P1-004-5', text: 'Recording first contact stops the timer and clears the pending flag.' },
      { id: 'AC-P1-004-6', text: 'Missing the SLA never reassigns the Lead automatically.' },
      { id: 'AC-P1-004-7', text: 'At shift start, an Absent agent’s pending off-time Leads are redistributed and counted for the new owner.' },
      { id: 'AC-P1-004-8', text: 'Availability changes and manual reassignments appear in the audit log.' },
    ],
  },
  {
    id: 'P2-FR-001', title: 'Lead Outcome & Funnel Tracking', phase: 2, priority: 'Must Have', route: '/my-leads',
    where: 'Lead detail (status control, histories, notes), My leads end-of-shift update',
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
    id: 'P2-FR-002', title: 'Marketing Funnel, Campaign & Meta Insights Reporting', phase: 2, priority: 'Must Have', route: '/reports',
    where: 'Reports (three tabs, filters, daily/weekly/monthly) · Demo console → Meta insights reachable / Refresh',
    acs: [
      { id: 'AC-P2-002-1', text: 'The funnel report shows Lead, Mature, Hot, Booked and Lost counts.' },
      { id: 'AC-P2-002-2', text: 'The Meta performance report shows the agreed metrics per campaign and per ad, next to the funnel counts.' },
      { id: 'AC-P2-002-3', text: 'Date range, company, campaign, ad and source filters all work.' },
      { id: 'AC-P2-002-4', text: 'Daily, weekly and monthly views show consistent figures.' },
      { id: 'AC-P2-002-5', text: 'CPL and cost per booking show “N/A” when their inputs are missing or zero.' },
      { id: 'AC-P2-002-6', text: 'Leads without attribution appear under “Unattributed”.' },
      { id: 'AC-P2-002-7', text: 'The screen shows when the Meta data was last refreshed.' },
      { id: 'AC-P2-002-8', text: 'If Meta data cannot be fetched, a message appears and the CRM funnel still loads.' },
      { id: 'AC-P2-002-9', text: 'The loss-reason breakdown matches the Lost Leads in the same filter.' },
      { id: 'AC-P2-002-10', text: 'The screens offer no campaign creation, budget editing or audience controls.' },
    ],
  },
  {
    id: 'P2-FR-003', title: 'Operational Monitoring for Distribution & SLA', phase: 2, priority: 'Should Have', route: '/distribution',
    where: 'Distribution & SLA (as Admin, and as a Team Lead)',
    acs: [
      { id: 'AC-P2-003-1', text: 'The Manager can see Leads allocated per agent.' },
      { id: 'AC-P2-003-2', text: 'Each agent’s real count, offset and fairness score are visible.' },
      { id: 'AC-P2-003-3', text: 'Unassigned and uncontacted Leads are listed.' },
      { id: 'AC-P2-003-4', text: 'SLA alerts are visible with the Lead and its owner.' },
      { id: 'AC-P2-003-5', text: 'Manual assignment history and availability changes are visible.' },
      { id: 'AC-P2-003-6', text: 'The view never changes a Lead’s owner automatically.' },
      { id: 'AC-P2-003-7', text: 'A Team Lead sees only their own team’s data.' },
    ],
  },
  {
    id: 'P3-FR-001', title: 'Company-Based Access & Permissions', phase: 3, priority: 'Must Have', route: '/access',
    where: 'Access & roles, company switcher, “View the CRM as…” user switcher, permission-denied screens',
    acs: [
      { id: 'AC-P3-001-1', text: 'A Marketing employee can manage only the companies assigned to them.' },
      { id: 'AC-P3-001-2', text: 'Editing another company’s data is blocked.' },
      { id: 'AC-P3-001-3', text: 'The Manager can view all six companies.' },
      { id: 'AC-P3-001-4', text: 'Only the Manager can set Absent.' },
      { id: 'AC-P3-001-5', text: 'A Sales Agent can set only their own Available/Unavailable status.' },
      { id: 'AC-P3-001-6', text: 'A Sales Agent sees only their own Leads.' },
      { id: 'AC-P3-001-7', text: 'Role restrictions are visible in the prototype.' },
    ],
  },
  {
    id: 'P3-FR-002', title: 'Management Controls & Reassignment Audit', phase: 3, priority: 'Should Have', route: '/unassigned',
    where: 'Lead detail → Assign / Reassign / Unassign, Unassigned leads, ownership history, Audit log',
    acs: [
      { id: 'AC-P3-002-1', text: 'An authorised manager can assign, unassign and reassign a Lead.' },
      { id: 'AC-P3-002-2', text: 'The new owner is visible straight after the change.' },
      { id: 'AC-P3-002-3', text: 'Every previous owner stays in the ownership history with the user and time.' },
      { id: 'AC-P3-002-4', text: 'An SLA breach alone never reassigns the Lead.' },
      { id: 'AC-P3-002-5', text: 'A user without permission, or from another company, cannot change ownership.' },
      { id: 'AC-P3-002-6', text: 'A Lead can only be given to an agent of its own company.' },
    ],
  },
  {
    id: 'P3-FR-003', title: 'External Integration & Failure Handling', phase: 3, priority: 'Must Have', route: '/integrations',
    where: 'Integrations · Demo console → Re-deliver last Meta event, Simulate failure',
    acs: [
      { id: 'AC-P3-003-1', text: 'A Meta Instant Form submission reaches the CRM as a Lead with its attribution.' },
      { id: 'AC-P3-003-2', text: 'A repeated delivery of the same Meta event does not create a second Lead.' },
      { id: 'AC-P3-003-3', text: 'Connections not yet confirmed are labelled “pending”, not shown as working.' },
      { id: 'AC-P3-003-4', text: 'Company, source, campaign and ad details are kept wherever available.' },
      { id: 'AC-P3-003-5', text: 'A connection failure is visible to the Manager.' },
      { id: 'AC-P3-003-6', text: 'After a failure, missed events are recovered or flagged, and none are lost silently.' },
      { id: 'AC-P3-003-7', text: 'Each connection’s state (working, pending, error) appears in the prototype.' },
    ],
  },
]

export const OPEN_DECISIONS: { group: string; items: { id: string; text: string; placeholder?: string }[] }[] = [
  {
    group: 'Distribution',
    items: [
      { id: 'OD-1', text: 'Which rule is final: availability and capacity first (this document), or strict lowest-score-first (TO-BE v0.2 §§6–7). v0.2 has no capacity limit, monthly cycle or new-agent baseline.', placeholder: 'Prototype implements the FRD rule: Absent → Unavailable → capacity → lowest score.' },
      { id: 'OD-2', text: 'The active-lead capacity value, the new-agent baseline calculation and rounding, and the treatment of long absences.', placeholder: 'Capacity 3 (FRD example); baseline = team average score, rounded; long absence not modelled.' },
      { id: 'OD-3', text: 'Whether capacity applies to off-time allocation, and whether manual assignments count toward fairness.', placeholder: 'Demo parameters below.' },
      { id: 'OD-4', text: 'Manager weighting is not included unless separately approved.', placeholder: 'Not implemented.' },
    ],
  },
  {
    group: 'Sales outcomes and SLA',
    items: [
      { id: 'OD-5', text: 'The allowed Lost reasons, and whether agents can move a Lead backward or reopen a Lost Lead.', placeholder: 'Placeholder reason list; backward/reopen are demo parameters.' },
      { id: 'OD-6', text: 'Which action counts as first contact, whether the end-of-shift update is enforced, and how alerts are delivered.', placeholder: '“Record first contact” button; end-of-shift reminder only; in-app alerts only.' },
      { id: 'OD-7', text: 'Whether a reassignment needs a reason, and whether the SLA timer restarts for the new owner.', placeholder: 'Demo parameters below.' },
    ],
  },
  {
    group: 'Meta insights and reporting',
    items: [
      { id: 'OD-8', text: 'The final metric set and its priority, the refresh frequency, and the report views.', placeholder: 'Working default metric list; manual refresh in the prototype.' },
      { id: 'OD-9', text: 'Funnel-ratio formulas. CPA is not defined in the TO-BE; only CPL and cost per booking are named. Ad-set reporting is not specified.', placeholder: 'Share of total Leads and Booked ÷ Leads shown as placeholders; no CPA; no ad-set level.' },
      { id: 'OD-10', text: 'Sample insights data from the technical team to confirm the proof-of-concept claims.', placeholder: 'Insights are simulated.' },
    ],
  },
  {
    group: 'Access and enquiries',
    items: [
      { id: 'OD-11', text: 'The required fields for converting a social enquiry into a Lead.', placeholder: 'Demo parameter below (default: full name, phone, nationality).' },
      { id: 'OD-12', text: 'The field-level permission matrix, whether agents see teammates’ Leads, and how read-only access to other companies is granted.', placeholder: 'Agents see own Leads only; view-only grants toggled on Access & roles.' },
    ],
  },
  {
    group: 'Technical dependencies',
    items: [
      { id: 'OD-13', text: 'Six-company Meta authorisation, business-owned long-lived credentials and any app review.' },
      { id: 'OD-14', text: 'Production permissions for inbox, engagement and comments across all six profiles, and whether those paths use webhooks.' },
      { id: 'OD-15', text: 'Website-form integration with anti-spam controls.' },
      { id: 'OD-16', text: 'The failure-recovery method: retries, monitoring and operational fallback.' },
    ],
  },
]

/** Ambiguities found while implementing — interpretations used in the prototype. */
export const INTERPRETATIONS: { topic: string; text: string }[] = [
  { topic: 'Active-lead capacity', text: '“Unresolved leads held at one time” is read as assigned Leads with no first contact yet that are not Booked or Lost (“until they deal with some”). Confirm the definition.' },
  { topic: 'Absent and the SLA', text: 'An agent marked Absent is not treated as Available, so their SLA timers do not run.' },
  { topic: '“Pending off-time Leads”', text: 'Read as Leads assigned during off-time that have no first contact and are not Booked/Lost.' },
  { topic: 'Unassign and the SLA', text: 'Unassigning pauses the timer (no SLA for Unassigned Leads) and clears an open alert.' },
  { topic: 'Team Lead and availability', text: 'P3-FR-001 says only agents set their own availability, while Team Leads “help with agent availability according to company policy”. The prototype does not let Team Leads change availability.' },
  { topic: 'Admin and social enquiries', text: 'Converting enquiries is listed only for Marketing employees, so Admin sees the inbox read-only.' },
  { topic: 'Manual entry by “authorised users”', text: 'Admin and (by demo parameter) Marketing employees for their companies can create manual Leads; only managers can choose manual assignment.' },
]
