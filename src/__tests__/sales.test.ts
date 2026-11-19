import { describe, expect, test, beforeEach } from 'vitest'
import { createBaseData } from '@/domain/seed'
import * as E from '@/domain/engine'
import * as SA from '@/domain/sales'
import type { AppData, CustomerFields, Opportunity } from '@/domain/types'
import { DAY, HOUR, fromPkt, fromUK } from '@/lib/time'
import { canDecidePayments, canSeeSensitive, canViewOpportunity, canViewSalesReports, canViewCompanyInbox, receivesNotification } from '@/domain/permissions'

const F: CustomerFields = { nationality: 'British', fullName: 'Amina Khan', phone: '+44 7000 000001', email: 'a@example.com', city: 'Leeds', tripDetails: '' }
let S: AppData
let o: Opportunity
let owner: string
const FN = 'schengentravel' as const
const quote = { packageName: 'Schengen visa service — France', agreedAmount: 300, flightReservation: { required: false, paid: false }, hotelReservationCompanyCost: true, addOns: { actualFlight: false, actualHotel: false } }

function freshOpp(extra: Partial<Parameters<typeof E.createLead>[1]> = {}) {
  const l = E.createLead(S, { companyId: FN, source: 'website', fields: F, assignment: { mode: 'auto' }, ...extra }, 'system')
  return { lead: l, opp: SA.oppForLead(S, l.id)! }
}
function readyToPay() {
  SA.saveQualification(S, o.id, [{ id: o.applicants[0].id, data: { ...o.applicants[0].data, 'travel.destination': 'France' } }], owner)
  SA.generateDraft(S, o.id, owner)
  SA.recordDraftApproval(S, o.id, 'whatsapp', owner)
  expect(SA.saveQuote(S, o.id, quote, owner).ok).toBe(true)
}
function bookFull() {
  readyToPay()
  const p = SA.submitPayment(S, o.id, { type: 'full', amount: 0, proofName: 'proof.pdf' }, owner)
  expect(p.ok).toBe(true)
  expect(SA.decidePayment(S, p.id!, 'confirm', 'u-acc').ok).toBe(true)
  return SA.bookingOf(S, o)!
}

beforeEach(() => {
  S = createBaseData()
  S.clock.now = fromPkt(2026, 11, 3, 15, 0)
  const r = freshOpp()
  o = r.opp
  owner = r.lead.ownerId!
})

describe('SAL-FR-001 workspace, contact & follow-up', () => {
  test('AC-SAL-001-1: the assigned Lead appears with owner, assignment time and attribution; no second distribution', () => {
    const l = SA.leadOf(S, o)
    expect(l.ownerId).toBe(owner)
    expect(l.assignedAt).toBe(S.clock.now)
    expect(o.stage).toBe('new')
    expect(S.assignments.length).toBe(1)
    expect(o.applicants[0].data['applicant.nationality']).toBe('British')
  })

  test('AC-SAL-001-2: a referral goes to the agent who owns the referring customer', () => {
    const res = SA.createReferral(S, o.id, { ...F, fullName: 'Bilal Khan' }, owner)
    expect(res.ok).toBe(true)
    const ref = S.leads.find((l) => l.id === res.id)!
    expect(ref.source).toBe('referral')
    expect(ref.ownerId).toBe(owner)
    expect(ref.referralFromLeadId).toBe(o.leadId)
    expect(S.assignments.find((a) => a.leadId === ref.id)!.counted).toBe(false) // pending decision default
    expect(SA.createReferral(S, o.id, { ...F }, 'u-mgr').ok).toBe(false)
  })

  test('AC-SAL-001-3: exact preferred time → UK-local task; vague window stays a window; none → immediate-contact prompt', () => {
    expect(o.contactPrompt).toBe(true)
    const at = fromUK(2026, 11, 4, 18, 30)
    const a = freshOpp({ preferredContact: { mode: 'exact', at } })
    const tk = S.tasks.find((t) => t.oppId === a.opp.id)!
    expect(tk.kind).toBe('contact')
    expect(tk.due).toEqual({ mode: 'exact', at })
    expect(a.opp.contactPrompt).toBe(false)
    const b = freshOpp({ preferredContact: { mode: 'window', label: 'Evening' } })
    expect(S.tasks.find((t) => t.oppId === b.opp.id)!.due.mode).toBe('window')
  })

  test('AC-SAL-001-4/5: attempts saved with one of five outcomes; callback creates a dated task; overdue flagged; tasks never change stage', () => {
    const cb = S.clock.now + 2 * HOUR
    expect(SA.logAttempt(S, o.id, { channel: 'call', outcome: 'no_answer', callbackAt: cb }, owner).ok).toBe(true)
    expect(o.attempts[0].outcome).toBe('no_answer')
    expect(o.contactPrompt).toBe(false)
    const task = S.tasks.find((t) => t.oppId === o.id && t.kind === 'callback')!
    expect(task.due).toEqual({ mode: 'exact', at: cb })
    expect(SA.isTaskOverdue(task, S.clock.now)).toBe(false)
    E.advanceTo(S, cb + 1)
    expect(SA.isTaskOverdue(task, S.clock.now)).toBe(true)
    const stage = o.stage
    SA.completeTask(S, task.id, owner)
    expect(o.stage).toBe(stage)
    expect(SA.logAttempt(S, o.id, { channel: 'call', outcome: 'answered' }, 'u-mgr').ok).toBe(false)
  })

  test('AC-SAL-001-6: never closed automatically; Lost needs a reason and mirrors to the funnel; Dormant can be reactivated', () => {
    E.advanceTo(S, S.clock.now + 60 * DAY)
    expect(o.stage).toBe('new')
    expect(SA.markLost(S, o.id, '', owner).ok).toBe(false)
    const b = freshOpp().opp
    const bOwner = SA.leadOf(S, b).ownerId!
    expect(SA.setDormant(S, b.id, true, bOwner).ok).toBe(true)
    expect(b.dormant).not.toBeNull()
    expect(SA.setDormant(S, b.id, false, bOwner).ok).toBe(true)
    expect(SA.markLost(S, b.id, 'Booked elsewhere', bOwner).ok).toBe(true)
    expect(SA.leadOf(S, b).status).toBe('lost')
    expect(SA.leadOf(S, b).lossReason).toBe('Booked elsewhere')
  })

  test('System stages cannot be set by hand', () => {
    expect(SA.setStage(S, o.id, 'awaiting_payment', owner).ok).toBe(false)
    expect(SA.setStage(S, o.id, 'booked', owner).ok).toBe(false)
    expect(SA.setStage(S, o.id, 'contacting', owner).ok).toBe(true)
  })

  test('AC-SAL-001-7: agents see only their own conversations; Managers and Admins see all in scope', () => {
    SA.sendWhatsApp(S, o.id, 'Hello', owner)
    const other = E.companyAgents(S, FN).find((a) => a.id !== owner)!
    expect(canViewOpportunity(S, other, o)).toBe(false)
    expect(SA.sendWhatsApp(S, o.id, 'Hi', other.id).ok).toBe(false)
    expect(canViewOpportunity(S, E.userById(S, 'u-mgr')!, o)).toBe(true)
    expect(canViewCompanyInbox(E.userById(S, 'u-admin')!)).toBe(true)
    // Manager replies are a pending decision — off by default
    expect(SA.sendWhatsApp(S, o.id, 'Manager here', 'u-mgr').ok).toBe(false)
    S.params.managerInboxReplies = true
    expect(SA.sendWhatsApp(S, o.id, 'Manager here', 'u-mgr').ok).toBe(true)
  })
})

describe('SAL-FR-002 qualification & Client Information Draft', () => {
  test('AC-SAL-002-1/2: structured groups for several applicants; draft generated from stored data', () => {
    expect(SA.generateDraft(S, o.id, owner).ok).toBe(false) // required placeholder fields missing (destination)
    SA.saveQualification(S, o.id, [
      { id: o.applicants[0].id, data: { ...o.applicants[0].data, 'travel.destination': 'France', 'work.status': 'Employed' } },
      { id: '', data: { 'applicant.fullName': 'Child Khan', 'travel.destination': 'France' } },
    ], owner)
    expect(o.applicants.length).toBe(2)
    expect(SA.generateDraft(S, o.id, owner).ok).toBe(true)
    expect(o.drafts[0].snapshot[1].data['applicant.fullName']).toBe('Child Khan')
    expect(o.drafts[0].snapshot[0].data['applicant.fullName']).toBe('Amina Khan') // carried from the Lead, no retyping
  })

  test('AC-SAL-002-3/4/5: approval with channel/agent/time; corrections keep unverified; material change → new version', () => {
    SA.saveQualification(S, o.id, [{ id: o.applicants[0].id, data: { ...o.applicants[0].data, 'travel.destination': 'France' } }], owner)
    SA.generateDraft(S, o.id, owner)
    SA.requestDraftCorrections(S, o.id, 'Wrong postcode', owner)
    expect(o.drafts[0].status).toBe('corrections_requested')
    expect(SA.recordDraftApproval(S, o.id, 'email', owner).ok).toBe(true)
    expect(o.drafts[0].approval).toMatchObject({ channel: 'email', byUserId: owner, at: S.clock.now })
    SA.saveQualification(S, o.id, [{ id: o.applicants[0].id, data: { ...o.applicants[0].data, 'contact.postcode': 'LS1 1AA' } }], owner)
    expect(o.drafts.length).toBe(2)
    expect(o.drafts[1]).toMatchObject({ version: 2, status: 'unverified', reverification: true })
    expect(o.drafts[0].status).toBe('verified')
    expect(o.drafts[0].supersededAt).not.toBeNull()
  })
})

describe('SAL-FR-003 quote & expected margin', () => {
  test('AC-SAL-003-1/2/3: amount stored as entered; five standard deliverables; margin recalculated', () => {
    SA.saveQuote(S, o.id, quote, owner)
    expect(o.quote!.agreedAmount).toBe(300)
    expect(SA.includedItems(o.quote!)).toEqual(['appointment_letter', 'travel_insurance', 'visa_application_form', 'hotel_reservation', 'cover_letter'])
    const m1 = SA.expectedMargin(S.salesConfig, o.quote!)
    SA.saveQuote(S, o.id, { ...quote, agreedAmount: 250, flightReservation: { required: true, paid: true }, addOns: { actualFlight: true, actualHotel: false } }, owner)
    expect(SA.includedItems(o.quote!)).toContain('flight_reservation')
    expect(SA.includedItems(o.quote!)).toContain('actual_flight')
    expect(SA.expectedMargin(S.salesConfig, o.quote!)).toBeLessThan(m1)
    expect(o.quote!.history.length).toBe(2)
  })
})

describe('SAL-FR-004 payments, booking & refunds', () => {
  test('AC-SAL-004-1/2/3: partial below £50 refused; only Accounts decides; Awaiting Payment until confirmed', () => {
    readyToPay()
    expect(SA.submitPayment(S, o.id, { type: 'partial', amount: 49.99, proofName: 'p.jpg' }, owner).ok).toBe(false)
    const p = SA.submitPayment(S, o.id, { type: 'partial', amount: 50, proofName: 'p.jpg' }, owner)
    expect(p.ok).toBe(true)
    expect(o.stage).toBe('awaiting_payment')
    expect(SA.decidePayment(S, p.id!, 'confirm', owner).ok).toBe(false)
    expect(SA.decidePayment(S, p.id!, 'confirm', 'u-mgr').ok).toBe(false)
    expect(SA.decidePayment(S, p.id!, 'confirm', 'u-admin').ok).toBe(false)
    expect(canDecidePayments(E.userById(S, 'u-acc')!)).toBe(true)
    expect(SA.setStage(S, o.id, 'quoted', owner).ok).toBe(false)
    expect(o.stage).toBe('awaiting_payment')
  })

  test('AC-SAL-004-4/6: confirmed payment with margin > £60 books automatically; balances update', () => {
    readyToPay()
    const p = SA.submitPayment(S, o.id, { type: 'partial', amount: 100, proofName: 'p.jpg' }, owner)
    SA.decidePayment(S, p.id!, 'confirm', 'u-acc')
    const b = SA.bookingOf(S, o)!
    expect(b).toBeTruthy()
    expect(o.stage).toBe('booked')
    expect(SA.leadOf(S, o).status).toBe('booked')
    expect(b.totalValue).toBe(300)
    expect(SA.paymentTotals(S, o)).toMatchObject({ paid: 100, outstanding: 200 })
    const p2 = SA.submitPayment(S, o.id, { type: 'full', amount: 0, proofName: 'bal.pdf' }, owner)
    SA.decidePayment(S, p2.id!, 'confirm', 'u-acc')
    expect(SA.paymentTotals(S, o)).toMatchObject({ paid: 300, outstanding: 0 })
  })

  test('AC-SAL-004-4/5: margin £60 or less is not bookable; only an override holder can override, with user and time', () => {
    SA.saveQualification(S, o.id, [{ id: o.applicants[0].id, data: { ...o.applicants[0].data, 'travel.destination': 'France' } }], owner)
    const costs = 95 // placeholder costs with hotel company cost
    SA.saveQuote(S, o.id, { ...quote, agreedAmount: costs + 60 }, owner)
    expect(SA.expectedMargin(S.salesConfig, o.quote!)).toBe(60)
    const p = SA.submitPayment(S, o.id, { type: 'full', amount: 0, proofName: 'p.pdf' }, owner)
    SA.decidePayment(S, p.id!, 'confirm', 'u-acc')
    expect(o.bookingId).toBeNull()
    expect(SA.isNotBookable(S, o)).toBe(true)
    expect(SA.overrideMargin(S, o.id, owner).ok).toBe(false)
    expect(SA.overrideMargin(S, o.id, 'u-tl-schengentravel').ok).toBe(false)
    const r = SA.overrideMargin(S, o.id, 'u-mgr')
    expect(r.ok).toBe(true)
    const b = SA.bookingOf(S, o)!
    expect(b.createdVia).toBe('override')
    expect(b.override).toMatchObject({ byUserId: 'u-mgr', at: S.clock.now })
  })

  test('AC-SAL-004-7: Sales cannot approve a refund; an approved refund keeps the Booking', () => {
    const b = bookFull()
    const r = SA.requestRefund(S, b.id, 50, 'Visa refused', 'u-help')
    expect(r.ok).toBe(true)
    expect(SA.decideRefund(S, r.id!, true, owner).ok).toBe(false)
    expect(SA.decideRefund(S, r.id!, true, 'u-mgr').ok).toBe(false)
    expect(SA.decideRefund(S, r.id!, true, 'u-acc').ok).toBe(true)
    expect(S.bookings.length).toBe(1)
    expect(o.stage).toBe('booked')
    expect(SA.paymentTotals(S, o).refunded).toBe(50)
  })
})

describe('SAL-FR-005 invoice & signature (DigiSigner simulated)', () => {
  test('AC-SAL-005-1/2/3/4: booking sends the invoice; signature status is separate and never blocks work', () => {
    const b = bookFull()
    expect(b.invoice.status).toBe('sent')
    expect(b.invoice.simulated).toBe(true)
    expect(o.stage).toBe('booked')
    const c = SA.caseOf(S, o)!
    expect(SA.addVisaOption(S, c.id, { country: 'France', centre: 'London', date: '2026-11-20', time: '10:00' }, 'u-proc').ok).toBe(true)
    SA.simulateSignature(S, b.id)
    expect(b.invoice.status).toBe('signed')
    expect(o.stage).toBe('booked')
  })

  test('DigiSigner unreachable → nothing pretends to be sent; retry works once reachable', () => {
    S.salesConfig.digiSignerReachable = false
    const b = bookFull()
    expect(b.invoice.status).toBe('not_generated')
    expect(b.invoice.lastError).toMatch(/did not respond/)
    S.salesConfig.digiSignerReachable = true
    expect(SA.retryInvoice(S, b.id, owner).ok).toBe(true)
    expect(b.invoice.status).toBe('sent')
  })

  test('AC-SAL-005-5: reminder then Manager alert only after the configured periods (unset by default)', () => {
    const b = bookFull()
    E.advanceTo(S, S.clock.now + 30 * DAY)
    expect(b.invoice.remindedAt).toBeNull()
    expect(SA.setSalesConfig(S, { invoiceReminderDays: 3, invoiceEscalationDays: 5 }, 'u-admin').ok).toBe(true)
    expect(b.invoice.remindedAt).not.toBeNull()
    expect(b.invoice.escalatedAt).not.toBeNull()
    const n = S.notifications.find((x) => x.title.startsWith('Unsigned invoice escalated'))!
    expect(receivesNotification(S, E.userById(S, 'u-mgr')!, n)).toBe(true)
    expect(receivesNotification(S, E.userById(S, owner)!, n)).toBe(false)
  })
})

describe('SAL-FR-006 service case', () => {
  test('AC-SAL-006-1/2/3: one case with verified draft and both owners; CRM never selects; each step notifies', () => {
    const b = bookFull()
    const cases = S.cases.filter((c) => c.bookingId === b.id)
    expect(cases.length).toBe(1)
    const c = cases[0]
    expect(c.draftVersion).toBe(1)
    expect(c.selection).toBeNull()
    expect(SA.recordSelection(S, c.id, 'nope', owner).ok).toBe(false)
    SA.addVisaOption(S, c.id, { country: 'France', centre: 'London', date: '2026-11-20', time: '10:00' }, 'u-proc')
    expect(SA.addVisaOption(S, c.id, { country: 'France', centre: 'X', date: '2026-11-21', time: '10:00' }, owner).ok).toBe(false)
    SA.recordSelection(S, c.id, c.options[0].id, owner)
    expect(S.notifications.some((n) => n.toRole === 'processing' && n.title.startsWith('Customer choice'))).toBe(true)
    SA.recordAppointment(S, c.id, 'APT-1', 'u-proc')
    expect(S.notifications.some((n) => n.toUserId === owner && n.title.startsWith('Appointment booked'))).toBe(true)
  })

  test('AC-SAL-006-4: outstanding balance after appointment blocks document work and pack release until Accounts confirms', () => {
    readyToPay()
    const p = SA.submitPayment(S, o.id, { type: 'partial', amount: 150, proofName: 'p.jpg' }, owner)
    SA.decidePayment(S, p.id!, 'confirm', 'u-acc')
    const c = SA.caseOf(S, o)!
    SA.addVisaOption(S, c.id, { country: 'France', centre: 'London', date: '2026-11-20', time: '10:00' }, 'u-proc')
    SA.recordSelection(S, c.id, c.options[0].id, owner)
    SA.recordAppointment(S, c.id, 'APT-2', 'u-proc')
    expect(SA.balanceBlocked(S, c)).toBe(true)
    expect(S.tasks.some((t) => t.oppId === o.id && t.kind === 'balance_payment' && !t.doneAt)).toBe(true)
    expect(SA.toggleChecklistItem(S, c.id, 'travel_insurance', true, 'u-proc').ok).toBe(false)
    expect(SA.toggleChecklistItem(S, c.id, 'cover_letter', true, owner).ok).toBe(false)
    const bal = SA.submitPayment(S, o.id, { type: 'full', amount: 0, proofName: 'bal.pdf' }, owner)
    expect(SA.balanceBlocked(S, c)).toBe(true) // still blocked until Accounts confirms
    SA.decidePayment(S, bal.id!, 'confirm', 'u-acc')
    expect(SA.balanceBlocked(S, c)).toBe(false)
    expect(S.tasks.find((t) => t.oppId === o.id && t.kind === 'balance_payment')!.doneAt).not.toBeNull()
    expect(SA.toggleChecklistItem(S, c.id, 'travel_insurance', true, 'u-proc').ok).toBe(true)
  })

  test('AC-SAL-006-5/6: checklist owners; conditional and add-on items only when applicable; pack needs the completeness check', () => {
    expect(SA.buildChecklist({ ...quote, savedAt: 0, savedBy: '', history: [] }).map((i) => [i.key, i.owner])).toEqual([
      ['visa_application_form', 'processing'], ['appointment_letter', 'processing'], ['travel_insurance', 'processing'], ['hotel_reservation', 'processing'], ['cover_letter', 'sales'],
    ])
    const withExtras = SA.buildChecklist({ ...quote, hotelReservationCompanyCost: false, flightReservation: { required: true, paid: false }, addOns: { actualFlight: false, actualHotel: true }, savedAt: 0, savedBy: '', history: [] })
    expect(withExtras.find((i) => i.key === 'hotel_reservation')!.owner).toBe('sales')
    expect(withExtras.find((i) => i.key === 'flight_reservation')).toMatchObject({ owner: 'sales', kind: 'conditional' })
    expect(withExtras.find((i) => i.key === 'actual_hotel')!.kind).toBe('addon')
    bookFull()
    const c = SA.caseOf(S, o)!
    SA.addVisaOption(S, c.id, { country: 'France', centre: 'London', date: '2026-11-20', time: '10:00' }, 'u-proc')
    SA.recordSelection(S, c.id, c.options[0].id, owner)
    SA.recordAppointment(S, c.id, 'APT-3', 'u-proc')
    expect(SA.markPackSent(S, c.id, 'whatsapp', owner).ok).toBe(false)
    expect(SA.completenessCheck(S, c.id, owner).ok).toBe(false)
    for (const i of c.checklist) SA.toggleChecklistItem(S, c.id, i.key, true, i.owner === 'processing' ? 'u-proc' : owner)
    expect(SA.completenessCheck(S, c.id, owner).ok).toBe(true)
    expect(SA.markPackSent(S, c.id, 'email', owner).ok).toBe(true)
  })

  test('AC-SAL-006-7: Refused keeps the Booking; Granted creates review and referral tasks', () => {
    bookFull()
    const c = SA.caseOf(S, o)!
    expect(SA.recordOutcome(S, c.id, 'refused', 'u-proc').ok).toBe(true)
    expect(o.stage).toBe('booked')
    expect(SA.leadOf(S, o).status).toBe('booked')
    const second = freshOpp()
    o = second.opp; owner = second.lead.ownerId!
    bookFull()
    SA.recordOutcome(S, SA.caseOf(S, o)!.id, 'granted', 'u-proc')
    expect(S.tasks.filter((t) => t.oppId === o.id).map((t) => t.kind)).toEqual(expect.arrayContaining(['review', 'referral']))
  })
})

describe('SAL-FR-007 / SAL-FR-008 access, overrides & sensitive data', () => {
  test('AC-SAL-007-2: Managers and Admins open Sales reports; agents and Marketing cannot', () => {
    expect(canViewSalesReports(E.userById(S, 'u-mgr')!)).toBe(true)
    expect(canViewSalesReports(E.userById(S, 'u-admin')!)).toBe(true)
    expect(canViewSalesReports(E.userById(S, owner)!)).toBe(false)
    expect(canViewSalesReports(E.userById(S, 'u-mkt1')!)).toBe(false)
  })

  test('AC-SAL-008-1: reassigning an opportunity needs the Reassignment permission', () => {
    const other = E.companyAgents(S, FN).find((a) => a.id !== owner)!
    expect(E.manualAssign(S, o.leadId, other.id, 'u-tl-schengentravel').ok).toBe(false)
    expect(E.manualAssign(S, o.leadId, other.id, 'u-mgr').ok).toBe(true)
    expect(SA.leadOf(S, o).ownerId).toBe(other.id)
  })

  test('AC-SAL-008-3/4: sensitive data restricted and audit-logged; short-lived links only', () => {
    const doc = SA.uploadDocument(S, o.id, { name: 'passport.pdf', kind: 'passport', sizeKb: 800 }, owner)
    expect(doc.ok).toBe(true)
    expect(canSeeSensitive(S, E.userById(S, 'u-mkt2')!, o)).toBe(false)
    expect(SA.requestDocumentLink(S, doc.id!, 'u-mkt2').ok).toBe(false)
    const link = SA.requestDocumentLink(S, doc.id!, owner)
    expect(link.ok).toBe(true)
    const d = S.documents[0]
    expect(d.links[0].expiresAt - d.links[0].issuedAt).toBe(S.salesConfig.linkMinutes * 60_000)
    expect(S.audit.filter((a) => a.type === 'sensitive-access').length).toBe(2)
  })

  test('AC-SAL-008-5: scheduled deletion removes the raw file and keeps metadata — only when a period is configured', () => {
    SA.uploadDocument(S, o.id, { name: 'share-code.pdf', kind: 'share_code', sizeKb: 120 }, owner)
    E.advanceTo(S, S.clock.now + 400 * DAY)
    expect(S.documents[0].deletedAt).toBeNull()
    SA.setSalesConfig(S, { retentionDays: 30 }, 'u-admin')
    expect(S.documents[0].deletedAt).not.toBeNull()
    expect(S.documents[0].name).toBe('share-code.pdf')
    expect(SA.requestDocumentLink(S, S.documents[0].id, owner).ok).toBe(false)
  })
})
