// Sales engine (FRD v1.4 Part 2, SAL-FR-001 … SAL-FR-008). Same pattern as engine.ts: pure functions that
// mutate an AppData draft and return a Result. Every placeholder for a "To be confirmed" item is marked.

import {
  BOOKING_MARGIN_THRESHOLD, MIN_PARTIAL_PAYMENT, SALES_STAGE_LABEL, SERVICE_ITEM_LABEL, STANDARD_DELIVERABLES, SYSTEM_ID,
  SYSTEM_STAGES, OUTCOME_LABEL, ALL_QUAL_FIELDS,
} from './constants'
import { applyFunnelStatus, audit, createLead, nextId, notify, userById, userName, type Result } from './engine'
import { canOverrideMargin, canRequestRefund, canSeeSensitive, canWorkOpportunity, oppOwnerId, visibleCompanies } from './permissions'
import { findLead, findOpp, findOppByLead } from './lookup'
import type {
  AppData, Applicant, Booking, ChecklistItem, ContactOutcome, CustomerFields, DraftVersion, Lead, Opportunity, PaymentRequest,
  Quote, SalesConfig, SalesStage, SalesTask, ServiceCase, ServiceItemKey, TaskDue, TaskKind, User,
} from './types'
import { DAY, MIN, fmtUK, ukDayEnd } from '../lib/time'

const ok = (id?: string): Result => ({ ok: true, id })
const fail = (error: string): Result => ({ ok: false, error })
export const money = (n: number) => Math.round(n * 100) / 100

// ================================================================ lookups

export const oppById = (S: AppData, id: string | null | undefined) => findOpp(S, id)
export const oppForLead = (S: AppData, leadId: string) => findOppByLead(S, leadId)
export const leadOf = (S: AppData, o: Opportunity) => findLead(S, o.leadId)!
export const bookingOf = (S: AppData, o: Opportunity) => (o.bookingId ? S.bookings.find((b) => b.id === o.bookingId) : undefined)
export const caseOf = (S: AppData, o: Opportunity) => {
  const b = bookingOf(S, o)
  return b ? S.cases.find((c) => c.id === b.caseId) : undefined
}
export const oppTasks = (S: AppData, oppId: string) => S.tasks.filter((t) => t.oppId === oppId)
export const oppPayments = (S: AppData, oppId: string) => S.payments.filter((p) => p.oppId === oppId)
export const threadOf = (S: AppData, oppId: string) => S.waThreads.find((w) => w.oppId === oppId)

function notifyUser(S: AppData, toUserId: string | null, o: Opportunity, title: string, body: string, caseId?: string) {
  if (!toUserId) return
  notify(S, 'sales', o.companyId, title, body, o.leadId, { toUserId, oppId: o.id, caseId })
}
function notifyRole(S: AppData, toRole: User['role'], o: Opportunity, title: string, body: string, caseId?: string) {
  notify(S, 'sales', o.companyId, title, body, o.leadId, { toRole, oppId: o.id, caseId })
}
/** Untargeted Sales notification = Managers of the company and Admins (see receivesNotification). */
function notifyManagement(S: AppData, o: Opportunity, title: string, body: string) {
  notify(S, 'sales', o.companyId, title, body, o.leadId, { oppId: o.id })
}

function changeStage(S: AppData, o: Opportunity, to: SalesStage, actorId: string, reason?: string) {
  if (o.stage === to) return
  o.stageHistory.push({ at: S.clock.now, from: o.stage, to, byUserId: actorId, reason })
  audit(S, 'stage', actorId, o.companyId, `${leadOf(S, o).ref} Sales stage ${SALES_STAGE_LABEL[o.stage]} → ${SALES_STAGE_LABEL[to]}${reason ? ` (“${reason}”)` : ''}`, { leadId: o.leadId, oppId: o.id })
  o.stage = to
}

function requireOwner(S: AppData, o: Opportunity | undefined, actorId: string): Opportunity | string {
  if (!o) return 'Opportunity not found'
  const actor = userById(S, actorId)
  if (!actor || !canWorkOpportunity(S, actor, o)) return 'Permission denied — only the owning Sales Agent works this opportunity'
  return o
}

// ================================================================ SAL-FR-001 opportunity, contact & follow-up

/** Every Lead is also a Sales opportunity. Known Lead details prefill the first applicant (no retyping, AC-SAL-002-2). */
export function createOpportunity(S: AppData, lead: Lead): Opportunity {
  const t = S.clock.now
  const data: Record<string, string> = {}
  const f = lead.fields
  if (f.fullName) data['applicant.fullName'] = f.fullName
  if (f.nationality) data['applicant.nationality'] = f.nationality
  if (f.phone) data['contact.phone'] = f.phone
  if (f.email) data['contact.email'] = f.email
  if (f.city) data['contact.city'] = f.city
  const o: Opportunity = {
    id: nextId(S, 'op'), leadId: lead.id, companyId: lead.companyId, createdAt: t, stage: 'new',
    stageHistory: [{ at: t, from: null, to: 'new', byUserId: SYSTEM_ID }], lossReason: null, dormant: null, attempts: [],
    applicants: [{ id: nextId(S, 'ap'), data }], qualificationUpdatedAt: null, drafts: [], quote: null, bookingId: null, contactPrompt: false,
  }
  S.opportunities.push(o)
  return o
}

/** Unworked = no first contact, Sales stage New and no contact attempt (SAL-FR-001: only these follow redistribution). */
export function isUnworked(S: AppData, lead: Lead): boolean {
  const o = oppForLead(S, lead.id)
  return lead.firstContactAt === null && lead.status !== 'booked' && lead.status !== 'lost' && (!o || (o.stage === 'new' && o.attempts.length === 0))
}

/**
 * Called whenever a Lead gets an owner. A preferred contact time becomes a UK-local contact task (a vague value stays a
 * window); without one the CRM prompts immediate contact (AC-SAL-001-3). Already-worked opportunities keep their tasks.
 */
export function onLeadAssigned(S: AppData, lead: Lead) {
  const o = oppForLead(S, lead.id)
  if (!o || o.attempts.length > 0 || o.stage !== 'new') return
  const openContact = S.tasks.some((t) => t.oppId === o.id && t.kind === 'contact' && !t.doneAt)
  if (openContact) return
  const pc = lead.preferredContact
  if (pc) {
    const due: TaskDue = pc.mode === 'exact' ? { mode: 'exact', at: pc.at } : { mode: 'window', label: pc.label, at: S.clock.now }
    S.tasks.push({ id: nextId(S, 'tk'), oppId: o.id, kind: 'contact', title: 'Contact the client at their preferred time', due, createdAt: S.clock.now, createdBy: SYSTEM_ID, doneAt: null, doneBy: null })
    o.contactPrompt = false
  } else {
    o.contactPrompt = true
  }
}

export function isTaskOverdue(task: SalesTask, now: number): boolean {
  if (task.doneAt) return false
  return task.due.mode === 'exact' ? now > task.due.at : now >= ukDayEnd(task.due.at)
}

export function fmtDue(due: TaskDue): string {
  return due.mode === 'exact' ? fmtUK(due.at) : `${due.label} (window, ${fmtUK(due.at).split(',')[0]})`
}

export interface AttemptInput {
  channel: 'call' | 'whatsapp'
  outcome: ContactOutcome
  note?: string
  /** Callback requested: becomes a dated follow-up task (AC-SAL-001-5) */
  callbackAt?: number | null
  /** Agent ticks the open contact task as done */
  completeContactTask?: boolean
  /** Agent chooses to record first contact for the SLA too (which event counts is to be confirmed, P1-FR-003) */
  recordFirstContact?: boolean
}

/** Every attempt is saved on the timeline with one of the five outcomes, entered manually (no telephony). Never changes the stage. */
export function logAttempt(S: AppData, oppId: string, input: AttemptInput, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const o = r
  if (!input.outcome) return fail('Choose the outcome of the attempt')
  if (input.callbackAt != null && input.callbackAt <= S.clock.now) return fail('The callback time must be in the future')
  const t = S.clock.now
  o.attempts.push({ id: nextId(S, 'at'), at: t, byUserId: actorId, channel: input.channel, outcome: input.outcome, note: input.note?.trim() || undefined })
  o.contactPrompt = false
  const lead = leadOf(S, o)
  audit(S, 'contact-attempt', actorId, o.companyId, `${lead.ref}: ${input.channel === 'call' ? 'call' : 'WhatsApp'} attempt — ${OUTCOME_LABEL[input.outcome]}`, { leadId: lead.id, oppId: o.id })
  if (input.completeContactTask) {
    for (const tk of S.tasks.filter((x) => x.oppId === o.id && x.kind === 'contact' && !x.doneAt)) { tk.doneAt = t; tk.doneBy = actorId }
  }
  if (input.callbackAt != null) {
    S.tasks.push({ id: nextId(S, 'tk'), oppId: o.id, kind: 'callback', title: 'Call the client back', due: { mode: 'exact', at: input.callbackAt }, createdAt: t, createdBy: actorId, doneAt: null, doneBy: null })
    audit(S, 'task', actorId, o.companyId, `${lead.ref}: callback task due ${fmtUK(input.callbackAt)}`, { leadId: lead.id, oppId: o.id })
  }
  if (input.recordFirstContact && lead.firstContactAt === null) {
    lead.firstContactAt = t
    lead.firstContactByUserId = actorId
    for (const n of S.notifications) if (n.type === 'sla' && n.leadId === lead.id) n.cleared = true
    audit(S, 'first-contact', actorId, lead.companyId, `First contact recorded on ${lead.ref} with a contact attempt`, { leadId: lead.id, agentId: actorId })
  }
  return ok()
}

export function createTask(S: AppData, oppId: string, input: { kind: TaskKind; title: string; due: TaskDue }, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  if (!input.title.trim()) return fail('Give the task a title')
  if (input.due.mode === 'exact' && !Number.isFinite(input.due.at)) return fail('Choose a due date and time')
  if (input.due.mode === 'window' && !input.due.label.trim()) return fail('Describe the contact window')
  const id = nextId(S, 'tk')
  S.tasks.push({ id, oppId, kind: input.kind, title: input.title.trim(), due: input.due, createdAt: S.clock.now, createdBy: actorId, doneAt: null, doneBy: null })
  audit(S, 'task', actorId, r.companyId, `${leadOf(S, r).ref}: task “${input.title.trim()}” due ${fmtDue(input.due)}`, { leadId: r.leadId, oppId })
  return ok(id)
}

/** Completing a task never changes the stage (AC-SAL-001-5). */
export function completeTask(S: AppData, taskId: string, actorId: string): Result {
  const tk = S.tasks.find((x) => x.id === taskId)
  if (!tk) return fail('Task not found')
  const r = requireOwner(S, oppById(S, tk.oppId), actorId)
  if (typeof r === 'string') return fail(r)
  if (tk.doneAt) return fail('This task is already done')
  if (tk.kind === 'balance_payment') return fail('The balance task closes when Accounts confirms the full balance')
  tk.doneAt = S.clock.now
  tk.doneBy = actorId
  audit(S, 'task', actorId, r.companyId, `${leadOf(S, r).ref}: task “${tk.title}” completed`, { leadId: r.leadId, oppId: r.id })
  return ok()
}

/** The agent sets the operational stage. Awaiting Payment and Booked are set only by the CRM (SAL-FR-004). */
export function setStage(S: AppData, oppId: string, to: SalesStage, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const o = r
  if (SYSTEM_STAGES.includes(to)) return fail(`${SALES_STAGE_LABEL[to]} is set by the CRM, not by hand`)
  if (to === 'lost') return fail('Use Mark as Lost — a reason is required')
  if (o.stage === 'booked') return fail('A Booked opportunity keeps its Booking')
  if (oppPayments(S, o.id).some((p) => p.status === 'awaiting')) return fail('The opportunity stays Awaiting Payment until Accounts decides (AC-SAL-004-3)')
  if (o.stage === 'lost') {
    if (!S.params.allowReopenLost) return fail('Reopening a Lost opportunity is not allowed (pending decision)')
    const lead = leadOf(S, o)
    applyFunnelStatus(S, lead, 'lead', actorId)
    o.lossReason = null
  }
  changeStage(S, o, to, actorId)
  return ok()
}

/** Lost with a mandatory reason (AC-SAL-001-6). Mirrors to the shared funnel with the same reason (product-owner decision 19 Nov 2026). */
export function markLost(S: AppData, oppId: string, reason: string, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const o = r
  if (!reason?.trim()) return fail('A loss reason is required to save Lost')
  if (o.bookingId) return fail('A Booked opportunity cannot be Lost — a Booking is never cancelled; refunds go through Accounts')
  if (oppPayments(S, o.id).some((p) => p.status === 'awaiting')) return fail('A payment is awaiting Accounts verification')
  o.lossReason = reason.trim()
  changeStage(S, o, 'lost', actorId, reason.trim())
  applyFunnelStatus(S, leadOf(S, o), 'lost', actorId, reason.trim())
  return ok()
}

/** Shared funnel → Sales: called when the agent sets or leaves Lost from the funnel control. */
export function syncLostToSales(S: AppData, lead: Lead, actorId: string) {
  const o = oppForLead(S, lead.id)
  if (!o) return
  if (lead.status === 'lost') {
    o.lossReason = lead.lossReason
    changeStage(S, o, 'lost', actorId, lead.lossReason ?? undefined)
  } else if (o.stage === 'lost') {
    const prev = [...o.stageHistory].reverse().find((h) => h.to !== 'lost' && !SYSTEM_STAGES.includes(h.to))?.to ?? 'contacting'
    o.lossReason = null
    changeStage(S, o, prev, actorId, 'Reopened from the funnel')
  }
}

/** Low Intent / Dormant: a searchable flag the agent can set and clear. The CRM never closes an opportunity itself. */
export function setDormant(S: AppData, oppId: string, dormant: boolean, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  if (dormant && (r.stage === 'booked' || r.stage === 'lost')) return fail('Only open opportunities can be marked Low Intent / Dormant')
  r.dormant = dormant ? { at: S.clock.now, byUserId: actorId } : null
  audit(S, 'stage', actorId, r.companyId, `${leadOf(S, r).ref} ${dormant ? 'marked Low Intent / Dormant' : 'reactivated'}`, { leadId: r.leadId, oppId: r.id })
  return ok()
}

/**
 * A referral is assigned to the agent who owns the referring customer (AC-SAL-001-2). Required details for a referral are
 * not stated in v1.4; the prototype asks for a name and one contact detail (placeholder).
 */
export function createReferral(S: AppData, oppId: string, fields: CustomerFields, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  if (!fields.fullName.trim()) return fail('Enter the referred person’s name')
  if (!fields.phone.trim() && !fields.email.trim()) return fail('Enter a phone number or email')
  const referrer = leadOf(S, r)
  const lead = createLead(S, { companyId: r.companyId, source: 'referral', fields, campaignId: null, adId: null, assignment: { mode: 'referral', agentId: actorId, fromLeadId: referrer.id } }, actorId)
  for (const tk of S.tasks.filter((x) => x.oppId === r.id && x.kind === 'referral' && !x.doneAt)) { tk.doneAt = S.clock.now; tk.doneBy = actorId }
  return ok(lead.id)
}

// ---------------------------------------------------------------- WhatsApp (simulated — integration pending technical validation)

export function sendWhatsApp(S: AppData, oppId: string, text: string, actorId: string): Result {
  const o = oppById(S, oppId)
  if (!o) return fail('Opportunity not found')
  const actor = userById(S, actorId)
  const mgmtReply = !!actor && (actor.role === 'admin' || actor.role === 'manager') && S.params.managerInboxReplies && visibleCompanies(S, actor).includes(o.companyId)
  if (!actor || !(canWorkOpportunity(S, actor, o) || mgmtReply)) return fail('Permission denied — only the owning agent replies in this conversation')
  if (!text.trim()) return fail('Write a message first')
  let th = threadOf(S, oppId)
  if (!th) { th = { id: nextId(S, 'wa'), oppId, companyId: o.companyId, messages: [], lastActivityAt: S.clock.now }; S.waThreads.push(th) }
  th.messages.push({ id: nextId(S, 'wm'), from: 'agent', text: text.trim(), at: S.clock.now, byUserId: actorId })
  th.lastActivityAt = S.clock.now
  return ok()
}

/** Demo console only: a customer WhatsApp message arriving in the company number. */
export function simulateWhatsAppInbound(S: AppData, oppId: string, text: string): Result {
  const o = oppById(S, oppId)
  if (!o) return fail('Opportunity not found')
  let th = threadOf(S, oppId)
  if (!th) { th = { id: nextId(S, 'wa'), oppId, companyId: o.companyId, messages: [], lastActivityAt: S.clock.now }; S.waThreads.push(th) }
  th.messages.push({ id: nextId(S, 'wm'), from: 'customer', text, at: S.clock.now })
  th.lastActivityAt = S.clock.now
  return ok()
}

// ================================================================ SAL-FR-002 qualification & Client Information Draft

const sameData = (a: Applicant[], b: Applicant[]) =>
  a.length === b.length && a.every((x, i) => {
    const y = b[i]
    const keys = new Set([...Object.keys(x.data), ...Object.keys(y.data)])
    return [...keys].every((k) => (x.data[k] ?? '').trim() === (y.data[k] ?? '').trim())
  })

export const latestDraft = (o: Opportunity): DraftVersion | undefined => o.drafts.at(-1)
export const verifiedDraft = (o: Opportunity): DraftVersion | undefined => [...o.drafts].reverse().find((d) => d.status === 'verified' && !d.supersededAt)

/** Qualification differs from the latest draft snapshot */
export const draftOutOfDate = (o: Opportunity) => { const d = latestDraft(o); return !!d && !sameData(d.snapshot, o.applicants) }

export function missingDraftFields(S: AppData, o: Opportunity): { applicant: number; field: string }[] {
  const out: { applicant: number; field: string }[] = []
  o.applicants.forEach((a, i) => { for (const f of S.params.draftRequiredFields) if (!a.data[f]?.trim()) out.push({ applicant: i + 1, field: f }) })
  return out
}

function newDraftVersion(S: AppData, o: Opportunity, actorId: string, reverification: boolean): DraftVersion {
  const prev = latestDraft(o)
  if (prev && !prev.supersededAt) prev.supersededAt = S.clock.now
  const d: DraftVersion = {
    version: (prev?.version ?? 0) + 1, createdAt: S.clock.now, createdBy: actorId,
    snapshot: o.applicants.map((a) => ({ id: a.id, data: { ...a.data } })), status: 'unverified', approval: null, corrections: [], supersededAt: null, reverification,
  }
  o.drafts.push(d)
  return d
}

/**
 * Saves the structured qualification for one or more applicants (AC-SAL-002-1). "Which changes count as material" is to be
 * confirmed: PLACEHOLDER — any change to a field of a verified draft counts as material and creates a new unverified version
 * (AC-SAL-002-5).
 */
export function saveQualification(S: AppData, oppId: string, applicants: Applicant[], actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const o = r
  if (applicants.length === 0) return fail('An opportunity needs at least one applicant')
  const known = new Set(ALL_QUAL_FIELDS.map((f) => f.key))
  const clean = applicants.map((a) => ({ id: a.id || nextId(S, 'ap'), data: Object.fromEntries(Object.entries(a.data).filter(([k, v]) => known.has(k) && v.trim()).map(([k, v]) => [k, v.trim()])) }))
  if (sameData(clean, o.applicants)) return ok()
  o.applicants = clean
  o.qualificationUpdatedAt = S.clock.now
  const lead = leadOf(S, o)
  audit(S, 'qualification', actorId, o.companyId, `${lead.ref}: qualification saved (${clean.length} applicant${clean.length > 1 ? 's' : ''})`, { leadId: lead.id, oppId: o.id })
  const v = verifiedDraft(o)
  if (v && latestDraft(o) === v) {
    const d = newDraftVersion(S, o, actorId, true)
    audit(S, 'draft', actorId, o.companyId, `${lead.ref}: material change after verification — draft v${d.version} created, re-verification needed`, { leadId: lead.id, oppId: o.id })
  }
  return ok()
}

/** Generated from stored data, no retyping (AC-SAL-002-2). It is an information draft, not the official visa form. */
export function generateDraft(S: AppData, oppId: string, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const o = r
  const missing = missingDraftFields(S, o)
  if (missing.length) return fail('Complete the required fields before generating the draft')
  const latest = latestDraft(o)
  if (latest && !latest.supersededAt && sameData(latest.snapshot, o.applicants)) return fail(`Draft v${latest.version} already matches the current data`)
  const d = newDraftVersion(S, o, actorId, false)
  audit(S, 'draft', actorId, o.companyId, `${leadOf(S, o).ref}: Client Information Draft v${d.version} generated`, { leadId: o.leadId, oppId: o.id })
  return ok()
}

/** The agent records the customer's approval with its channel; the CRM stores the agent and time (AC-SAL-002-3). */
export function recordDraftApproval(S: AppData, oppId: string, channel: 'whatsapp' | 'email', actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const o = r
  const d = latestDraft(o)
  if (!d || d.supersededAt) return fail('Generate the draft first')
  if (d.status === 'verified') return fail('This version is already verified')
  if (!sameData(d.snapshot, o.applicants)) return fail('The data changed after this draft was generated — generate a new version first')
  d.status = 'verified'
  d.approval = { channel, byUserId: actorId, at: S.clock.now }
  audit(S, 'draft', actorId, o.companyId, `${leadOf(S, o).ref}: draft v${d.version} approved by the customer via ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}`, { leadId: o.leadId, oppId: o.id })
  const c = caseOf(S, o)
  if (c) {
    c.draftVersion = d.version
    notifyRole(S, 'processing', o, `Verified draft v${d.version} · ${c.ref}`, `The customer re-verified their Client Information Draft. The case now holds v${d.version}.`, c.id)
  }
  return ok()
}

/** A correction request keeps the draft unverified (AC-SAL-002-4). */
export function requestDraftCorrections(S: AppData, oppId: string, note: string, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const d = latestDraft(r)
  if (!d || d.supersededAt) return fail('Generate the draft first')
  if (d.status === 'verified') return fail('This version is verified — change the data to create a new version')
  if (!note.trim()) return fail('Describe the corrections the customer asked for')
  d.status = 'corrections_requested'
  d.corrections.push({ note: note.trim(), byUserId: actorId, at: S.clock.now })
  audit(S, 'draft', actorId, r.companyId, `${leadOf(S, r).ref}: customer asked for corrections on draft v${d.version}`, { leadId: r.leadId, oppId: r.id })
  return ok()
}

// ================================================================ SAL-FR-003 quote & expected margin

export type QuoteInput = Pick<Quote, 'packageName' | 'agreedAmount' | 'flightReservation' | 'hotelReservationCompanyCost' | 'addOns'>

/** Included services: the five standard deliverables, plus the conditional flight reservation and any requested add-ons (AC-SAL-003-2). */
export function includedItems(q: QuoteInput): ServiceItemKey[] {
  const items: ServiceItemKey[] = [...STANDARD_DELIVERABLES]
  if (q.flightReservation.required) items.push('flight_reservation')
  if (q.addOns.actualFlight) items.push('actual_flight')
  if (q.addOns.actualHotel) items.push('actual_hotel')
  return items
}

/**
 * Expected margin. The formula and the cost items are to be confirmed (SAL-FR-003).
 * PLACEHOLDER: agreed amount − the configured expected cost of each included item that costs the company money.
 * A free flight reservation and a hotel reservation without company expenditure add no cost.
 */
export function expectedCostLines(cfg: SalesConfig, q: QuoteInput): { key: ServiceItemKey; cost: number }[] {
  return includedItems(q).map((key) => {
    let cost = cfg.expectedCosts[key] ?? 0
    if (key === 'flight_reservation' && !q.flightReservation.paid) cost = 0
    if (key === 'hotel_reservation' && !q.hotelReservationCompanyCost) cost = 0
    return { key, cost }
  })
}
export function expectedMargin(cfg: SalesConfig, q: QuoteInput): number {
  return money(q.agreedAmount - expectedCostLines(cfg, q).reduce((s, l) => s + l.cost, 0))
}
export const isBookableMargin = (m: number) => m > BOOKING_MARGIN_THRESHOLD

/** The CRM records the agreed amount exactly as entered and never sets or suggests a price (AC-SAL-003-1). */
export function saveQuote(S: AppData, oppId: string, input: QuoteInput, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const o = r
  if (o.bookingId) return fail('The quote is locked after booking')
  if (oppPayments(S, o.id).some((p) => p.status === 'awaiting')) return fail('A payment is awaiting Accounts verification — the quote cannot change now')
  if (!input.packageName.trim()) return fail('Enter the agreed package')
  if (!Number.isFinite(input.agreedAmount) || input.agreedAmount <= 0) return fail('Enter the agreed amount')
  const margin = expectedMargin(S.salesConfig, input)
  const t = S.clock.now
  o.quote = {
    packageName: input.packageName.trim(), agreedAmount: money(input.agreedAmount), flightReservation: { ...input.flightReservation, paid: input.flightReservation.required && input.flightReservation.paid },
    hotelReservationCompanyCost: input.hotelReservationCompanyCost, addOns: { ...input.addOns }, savedAt: t, savedBy: actorId,
    history: [...(o.quote?.history ?? []), { at: t, byUserId: actorId, agreedAmount: money(input.agreedAmount), expectedMargin: margin }],
  }
  audit(S, 'quote', actorId, o.companyId, `${leadOf(S, o).ref}: quote saved — ${input.packageName.trim()}, £${money(input.agreedAmount).toFixed(2)}, expected margin £${margin.toFixed(2)}`, { leadId: o.leadId, oppId: o.id })
  // Both booking conditions now hold (Accounts-confirmed payment + margin above £60) → the CRM books (SAL-FR-004)
  if (oppPayments(S, o.id).some((p) => p.status === 'confirmed' && !p.balance) && isBookableMargin(margin)) createBooking(S, o, 'margin', SYSTEM_ID)
  return ok()
}

// ================================================================ SAL-FR-004 payments, booking & refunds

export function paymentTotals(S: AppData, o: Opportunity) {
  const b = bookingOf(S, o)
  const total = b ? b.totalValue : (o.quote?.agreedAmount ?? 0)
  const paid = money(oppPayments(S, o.id).filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0))
  const refunded = b ? money(S.refunds.filter((x) => x.bookingId === b.id && x.status === 'approved').reduce((s, x) => s + x.amount, 0)) : 0
  return { total, paid, outstanding: money(Math.max(0, total - paid)), refunded }
}

/** Accounts-confirmed payment exists, no Booking yet, margin £60 or less → needs an authorised override. */
export function isNotBookable(S: AppData, o: Opportunity): boolean {
  return !o.bookingId && !!o.quote && oppPayments(S, o.id).some((p) => p.status === 'confirmed' && !p.balance) && !isBookableMargin(expectedMargin(S.salesConfig, o.quote))
}

export interface PaymentInput { type: 'full' | 'partial'; amount: number; proofName: string }

/** Full, or partial of at least £50, with proof (AC-SAL-004-1). Balance payments use the same flow. */
export function submitPayment(S: AppData, oppId: string, input: PaymentInput, actorId: string): Result {
  const r = requireOwner(S, oppById(S, oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const o = r
  if (!o.quote) return fail('Save the quote first')
  if (o.stage === 'lost') return fail('This opportunity is Lost')
  if (oppPayments(S, o.id).some((p) => p.status === 'awaiting')) return fail('A payment request is already awaiting Accounts verification')
  const { outstanding } = paymentTotals(S, o)
  if (outstanding <= 0) return fail('Nothing is outstanding')
  if (!input.proofName.trim()) return fail('Attach the payment proof')
  const amount = input.type === 'full' ? outstanding : money(input.amount)
  if (input.type === 'partial') {
    if (!Number.isFinite(amount) || amount < MIN_PARTIAL_PAYMENT) return fail(`A partial payment must be at least £${MIN_PARTIAL_PAYMENT}`)
    if (amount >= outstanding) return fail('A partial payment must be less than the outstanding amount — choose Full instead')
  }
  const p: PaymentRequest = {
    id: nextId(S, 'py'), oppId, type: input.type, amount, proofName: input.proofName.trim(), submittedAt: S.clock.now, submittedBy: actorId,
    status: 'awaiting', decidedAt: null, decidedBy: null, balance: !!o.bookingId,
  }
  S.payments.push(p)
  const lead = leadOf(S, o)
  if (!o.bookingId) changeStage(S, o, 'awaiting_payment', SYSTEM_ID, 'Payment Verification Request submitted')
  audit(S, 'payment', actorId, o.companyId, `${lead.ref}: ${p.balance ? 'balance' : input.type} payment of £${amount.toFixed(2)} submitted for verification`, { leadId: lead.id, oppId: o.id })
  notifyRole(S, 'accounts', o, `Payment to verify · ${lead.ref}`, `${userName(S, actorId)} submitted a ${p.balance ? 'balance' : input.type} payment of £${amount.toFixed(2)} (${p.proofName}).`)
  return ok(p.id)
}

/** Only Accounts confirms or rejects (AC-SAL-004-2). A confirmed payment with margin above £60 creates the Booking (AC-SAL-004-4). */
export function decidePayment(S: AppData, paymentId: string, decision: 'confirm' | 'reject', actorId: string, reason?: string): Result {
  const p = S.payments.find((x) => x.id === paymentId)
  if (!p) return fail('Payment request not found')
  const o = oppById(S, p.oppId)!
  const actor = userById(S, actorId)
  if (!actor || actor.role !== 'accounts' || !visibleCompanies(S, actor).includes(o.companyId)) return fail('Permission denied — only Accounts confirms or rejects payments')
  if (p.status !== 'awaiting') return fail('This request has already been decided')
  const lead = leadOf(S, o)
  const owner = oppOwnerId(S, o)
  if (decision === 'reject') {
    if (S.params.rejectionReasonRequired && !reason?.trim()) return fail('A rejection reason is required (pending decision switched on)')
    p.status = 'rejected'; p.decidedAt = S.clock.now; p.decidedBy = actorId; p.rejectionReason = reason?.trim() || undefined
    audit(S, 'payment', actorId, o.companyId, `${lead.ref}: payment of £${p.amount.toFixed(2)} rejected${p.rejectionReason ? ` (“${p.rejectionReason}”)` : ''}`, { leadId: lead.id, oppId: o.id })
    notifyUser(S, owner, o, `Payment rejected · ${lead.ref}`, `Accounts rejected the £${p.amount.toFixed(2)} payment${p.rejectionReason ? `: ${p.rejectionReason}` : ''}. Submit new proof when ready.`)
    return ok()
  }
  p.status = 'confirmed'; p.decidedAt = S.clock.now; p.decidedBy = actorId
  audit(S, 'payment', actorId, o.companyId, `${lead.ref}: payment of £${p.amount.toFixed(2)} confirmed by Accounts`, { leadId: lead.id, oppId: o.id })
  if (p.balance) {
    const { outstanding } = paymentTotals(S, o)
    notifyUser(S, owner, o, `Balance payment confirmed · ${lead.ref}`, `Accounts confirmed £${p.amount.toFixed(2)}. Outstanding balance: £${outstanding.toFixed(2)}.`)
    if (outstanding <= 0) {
      for (const tk of S.tasks.filter((x) => x.oppId === o.id && x.kind === 'balance_payment' && !x.doneAt)) { tk.doneAt = S.clock.now; tk.doneBy = SYSTEM_ID }
      const c = caseOf(S, o)
      if (c) notifyRole(S, 'processing', o, `Balance received · ${c.ref}`, 'Accounts confirmed the full outstanding balance. Document preparation and pack release can continue.', c.id)
    }
    return ok()
  }
  const margin = expectedMargin(S.salesConfig, o.quote!)
  if (isBookableMargin(margin)) {
    createBooking(S, o, 'margin', SYSTEM_ID)
  } else {
    notifyUser(S, owner, o, `Not bookable · ${lead.ref}`, `Payment confirmed, but the expected margin is £${margin.toFixed(2)} (£${BOOKING_MARGIN_THRESHOLD} or less). A user with Booking Margin Override permission can override.`)
    notifyManagement(S, o, `Margin override needed · ${lead.ref}`, `Payment confirmed for ${lead.fields.fullName}; expected margin £${margin.toFixed(2)} is not above £${BOOKING_MARGIN_THRESHOLD}.`)
  }
  return ok()
}

/** Only a Booking Margin Override holder may override the £60 threshold; the CRM records user and time (AC-SAL-004-5). */
export function overrideMargin(S: AppData, oppId: string, actorId: string, reason?: string): Result {
  const o = oppById(S, oppId)
  if (!o) return fail('Opportunity not found')
  const actor = userById(S, actorId)
  if (!actor || !canOverrideMargin(actor) || !visibleCompanies(S, actor).includes(o.companyId)) return fail('Permission denied — overriding the £60 threshold needs the Booking Margin Override permission')
  if (!isNotBookable(S, o)) return fail('An override applies only after Accounts confirms payment on a margin of £60 or less')
  if (S.params.overrideReasonRequired && !reason?.trim()) return fail('A reason is required for an override (pending decision switched on)')
  const margin = expectedMargin(S.salesConfig, o.quote!)
  const b = createBooking(S, o, 'override', actorId)
  b.override = { byUserId: actorId, at: S.clock.now, reason: reason?.trim() || undefined, expectedMargin: margin }
  audit(S, 'override', actorId, o.companyId, `${leadOf(S, o).ref}: £${BOOKING_MARGIN_THRESHOLD} margin threshold overridden by ${actor.name} (expected margin £${margin.toFixed(2)})${reason?.trim() ? ` — “${reason.trim()}”` : ''}`, { leadId: o.leadId, oppId: o.id })
  return ok(b.id)
}

/** Placeholder ownership split from SAL-FR-006 (add-ons → Processing is an interpretation, marked in the UI). */
export function buildChecklist(q: Quote): ChecklistItem[] {
  const item = (key: ServiceItemKey, owner: ChecklistItem['owner'], kind: ChecklistItem['kind']): ChecklistItem => ({ key, label: SERVICE_ITEM_LABEL[key], owner, kind, doneAt: null, doneBy: null })
  const list: ChecklistItem[] = [
    item('visa_application_form', 'processing', 'mandatory'),
    item('appointment_letter', 'processing', 'mandatory'),
    item('travel_insurance', 'processing', 'mandatory'),
    item('hotel_reservation', q.hotelReservationCompanyCost ? 'processing' : 'sales', 'mandatory'),
    item('cover_letter', 'sales', 'mandatory'),
  ]
  if (q.flightReservation.required) list.push(item('flight_reservation', q.flightReservation.paid ? 'processing' : 'sales', 'conditional'))
  if (q.addOns.actualFlight) list.push(item('actual_flight', 'processing', 'addon'))
  if (q.addOns.actualHotel) list.push(item('actual_hotel', 'processing', 'addon'))
  return list
}

function createBooking(S: AppData, o: Opportunity, via: 'margin' | 'override', actorId: string): Booking {
  const t = S.clock.now
  const lead = leadOf(S, o)
  const q = o.quote!
  const caseId = nextId(S, 'cs')
  const b: Booking = {
    id: nextId(S, 'bk'), ref: `BK-${5000 + S.bookings.length + 1}`, oppId: o.id, leadId: lead.id, companyId: o.companyId, createdAt: t,
    createdVia: via, override: null, totalValue: q.agreedAmount, expectedMargin: expectedMargin(S.salesConfig, q), expenses: [],
    invoice: { status: 'not_generated', sentAt: null, signedAt: null, remindedAt: null, escalatedAt: null, lastError: null, simulated: true }, caseId,
  }
  S.bookings.push(b)
  o.bookingId = b.id
  o.dormant = null
  changeStage(S, o, 'booked', SYSTEM_ID, via === 'margin' ? 'Accounts confirmed payment and expected margin is above £60' : 'Booking Margin Override')
  applyFunnelStatus(S, lead, 'booked', SYSTEM_ID) // shared funnel follows Sales (product-owner decision 19 Nov 2026)
  audit(S, 'booking', actorId, o.companyId, `${b.ref} created for ${lead.ref} (total £${b.totalValue.toFixed(2)}, expected margin £${b.expectedMargin.toFixed(2)}${via === 'override' ? ', margin override' : ''})`, { leadId: lead.id, oppId: o.id })

  const v = verifiedDraft(o)
  const c: ServiceCase = {
    id: caseId, ref: `CS-${3000 + S.cases.length + 1}`, bookingId: b.id, oppId: o.id, companyId: o.companyId, createdAt: t,
    draftVersion: v?.version ?? null, options: [], selection: null, appointment: null, checklist: buildChecklist(q), completenessCheck: null,
    packSent: null, status: 'Options pending', statusHistory: [{ at: t, status: 'Options pending', byUserId: SYSTEM_ID }], outcome: null,
  }
  S.cases.push(c)
  audit(S, 'case', SYSTEM_ID, o.companyId, `${c.ref} created for ${b.ref}${v ? ` with verified draft v${v.version}` : ' — no verified draft yet'}`, { leadId: lead.id, oppId: o.id })
  sendInvoice(S, b)
  notifyUser(S, oppOwnerId(S, o), o, `Booked · ${lead.ref}`, `${b.ref} created. Service case ${c.ref} is with Processing; you remain the Customer Relationship Owner.`, c.id)
  notifyRole(S, 'processing', o, `New service case · ${c.ref}`, `${lead.fields.fullName} (${b.ref}). Record the visa options for the agent.`, c.id)
  return b
}

// ================================================================ SAL-FR-005 invoice / terms (DigiSigner — pending technical validation, simulated)

function sendInvoice(S: AppData, b: Booking) {
  const o = oppById(S, b.oppId)!
  if (!S.salesConfig.digiSignerReachable) {
    b.invoice.status = 'not_generated'
    b.invoice.lastError = 'DigiSigner did not respond (simulated). Nothing was sent.'
    audit(S, 'invoice', SYSTEM_ID, b.companyId, `${b.ref}: invoice/terms could not be sent — DigiSigner unreachable (simulated)`, { oppId: o.id })
    notifyManagement(S, o, `Invoice not sent · ${b.ref}`, 'DigiSigner did not respond (simulated). Retry from the invoice panel.')
    return
  }
  b.invoice.status = 'sent'
  b.invoice.sentAt = S.clock.now
  b.invoice.lastError = null
  audit(S, 'invoice', SYSTEM_ID, b.companyId, `${b.ref}: invoice/terms filled from the placeholder template and sent through DigiSigner (simulated)`, { oppId: o.id })
}

export function retryInvoice(S: AppData, bookingId: string, actorId: string): Result {
  const b = S.bookings.find((x) => x.id === bookingId)
  if (!b) return fail('Booking not found')
  const o = oppById(S, b.oppId)!
  const actor = userById(S, actorId)
  const allowed = !!actor && (canWorkOpportunity(S, actor, o) || ((actor.role === 'admin' || actor.role === 'manager') && visibleCompanies(S, actor).includes(b.companyId)))
  if (!allowed) return fail('Permission denied')
  if (b.invoice.status !== 'not_generated') return fail('The invoice has already been sent')
  sendInvoice(S, b)
  return (b.invoice.status as string) === 'sent' ? ok() : fail(b.invoice.lastError ?? 'DigiSigner did not respond')
}

/** Demo console: DigiSigner reports the customer's signature (simulated webhook). Signature status never changes the Booking. */
export function simulateSignature(S: AppData, bookingId: string): Result {
  const b = S.bookings.find((x) => x.id === bookingId)
  if (!b) return fail('Booking not found')
  if (b.invoice.status !== 'sent') return fail('Only a sent invoice can be signed')
  b.invoice.status = 'signed'
  b.invoice.signedAt = S.clock.now
  audit(S, 'invoice', SYSTEM_ID, b.companyId, `${b.ref}: invoice/terms signed (simulated DigiSigner status)`, { oppId: b.oppId })
  return ok()
}

export const invoiceOverdue = (S: AppData, b: Booking) =>
  b.invoice.status === 'sent' && S.salesConfig.invoiceReminderDays != null && S.clock.now - (b.invoice.sentAt ?? 0) >= S.salesConfig.invoiceReminderDays * DAY

/**
 * Runs on every clock advance: unsigned-invoice reminder then Manager alert (only when the periods are configured —
 * they are pending, §13 Q7), and scheduled deletion of raw sensitive files (only when a retention period is configured).
 */
export function salesTick(S: AppData) {
  const now = S.clock.now
  const cfg = S.salesConfig
  for (const b of S.bookings) {
    if (b.invoice.status !== 'sent' || b.invoice.sentAt == null) continue
    const o = oppById(S, b.oppId)!
    const age = now - b.invoice.sentAt
    if (cfg.invoiceReminderDays != null && !b.invoice.remindedAt && age >= cfg.invoiceReminderDays * DAY) {
      b.invoice.remindedAt = now
      notifyUser(S, oppOwnerId(S, o), o, `Unsigned invoice · ${b.ref}`, `The invoice/terms are still unsigned after ${cfg.invoiceReminderDays} day(s). Remind the customer.`)
      audit(S, 'invoice', SYSTEM_ID, b.companyId, `${b.ref}: unsigned-invoice reminder sent to the agent`, { oppId: o.id })
    }
    if (cfg.invoiceEscalationDays != null && b.invoice.remindedAt && !b.invoice.escalatedAt && age >= cfg.invoiceEscalationDays * DAY) {
      b.invoice.escalatedAt = now
      notifyManagement(S, o, `Unsigned invoice escalated · ${b.ref}`, `Still unsigned after ${cfg.invoiceEscalationDays} day(s). The Booking stays active.`)
      audit(S, 'invoice', SYSTEM_ID, b.companyId, `${b.ref}: unsigned invoice escalated to a Manager`, { oppId: o.id })
    }
  }
  if (cfg.retentionDays != null) {
    for (const d of S.documents) {
      if (d.deletedAt || now - d.uploadedAt < cfg.retentionDays * DAY) continue
      d.deletedAt = now
      d.links = []
      const o = oppById(S, d.oppId)
      audit(S, 'retention', SYSTEM_ID, o?.companyId ?? null, `Raw file “${d.name}” deleted under the retention policy (${cfg.retentionDays} days); metadata kept`, { oppId: d.oppId })
    }
  }
}

// ---------------------------------------------------------------- refunds & expenses

/** An agent (owner) or helpline user submits a Refund Request linked to the Booking and case. Only Accounts decides. */
export function requestRefund(S: AppData, bookingId: string, amount: number, note: string, actorId: string): Result {
  const b = S.bookings.find((x) => x.id === bookingId)
  if (!b) return fail('Booking not found')
  const o = oppById(S, b.oppId)!
  const actor = userById(S, actorId)
  if (!actor || !canRequestRefund(S, actor, o) || (actor.role === 'helpline' && !visibleCompanies(S, actor).includes(b.companyId))) return fail('Permission denied — refunds are requested by the owning agent or a helpline user')
  const { paid, refunded } = paymentTotals(S, o)
  const pending = S.refunds.filter((r) => r.bookingId === b.id && r.status === 'requested').reduce((s, r) => s + r.amount, 0)
  if (!Number.isFinite(amount) || amount <= 0) return fail('Enter the refund amount')
  if (money(amount) > money(paid - refunded - pending)) return fail(`The refund cannot exceed the confirmed amount paid that is not already refunded or requested (£${money(paid - refunded - pending).toFixed(2)})`)
  if (!note.trim()) return fail('Add a note explaining the request')
  const id = nextId(S, 'rf')
  S.refunds.push({ id, bookingId: b.id, caseId: b.caseId, amount: money(amount), note: note.trim(), requestedBy: actorId, requestedAt: S.clock.now, status: 'requested', decidedBy: null, decidedAt: null })
  audit(S, 'refund', actorId, b.companyId, `${b.ref}: refund of £${money(amount).toFixed(2)} requested`, { oppId: o.id })
  notifyRole(S, 'accounts', o, `Refund to decide · ${b.ref}`, `${actor.name} requested £${money(amount).toFixed(2)}: ${note.trim()}`)
  return ok(id)
}

/** A Sales user cannot approve a refund; an approved refund keeps the Booking and reduces actual margin (AC-SAL-004-7). */
export function decideRefund(S: AppData, refundId: string, approve: boolean, actorId: string): Result {
  const r = S.refunds.find((x) => x.id === refundId)
  if (!r) return fail('Refund request not found')
  const b = S.bookings.find((x) => x.id === r.bookingId)!
  const actor = userById(S, actorId)
  if (!actor || actor.role !== 'accounts' || !visibleCompanies(S, actor).includes(b.companyId)) return fail('Permission denied — only Accounts decides refunds')
  if (r.status !== 'requested') return fail('This refund has already been decided')
  r.status = approve ? 'approved' : 'rejected'
  r.decidedBy = actorId
  r.decidedAt = S.clock.now
  const o = oppById(S, b.oppId)!
  audit(S, 'refund', actorId, b.companyId, `${b.ref}: refund of £${r.amount.toFixed(2)} ${approve ? 'approved — Booking kept' : 'rejected'}`, { oppId: o.id })
  notifyUser(S, r.requestedBy, o, `Refund ${approve ? 'approved' : 'rejected'} · ${b.ref}`, `Accounts ${approve ? 'approved' : 'rejected'} the £${r.amount.toFixed(2)} refund. The Booking stays Booked.`)
  return ok()
}

/** Accounts records actual case expenses; actual margin appears only when Accounts data exists (AC-SAL-007-4). */
export function recordExpense(S: AppData, bookingId: string, amount: number, note: string, actorId: string): Result {
  const b = S.bookings.find((x) => x.id === bookingId)
  if (!b) return fail('Booking not found')
  const actor = userById(S, actorId)
  if (!actor || actor.role !== 'accounts' || !visibleCompanies(S, actor).includes(b.companyId)) return fail('Permission denied — actual expenses are recorded by Accounts')
  if (!Number.isFinite(amount) || amount <= 0) return fail('Enter the expense amount')
  if (!note.trim()) return fail('Describe the expense')
  b.expenses.push({ id: nextId(S, 'ex'), amount: money(amount), note: note.trim(), at: S.clock.now, byUserId: actorId })
  audit(S, 'expense', actorId, b.companyId, `${b.ref}: actual expense £${money(amount).toFixed(2)} recorded (${note.trim()})`, { oppId: b.oppId })
  return ok()
}

// ================================================================ SAL-FR-006 service case

const caseById = (S: AppData, id: string) => S.cases.find((c) => c.id === id)

function requireProcessing(S: AppData, c: ServiceCase | undefined, actorId: string): ServiceCase | string {
  if (!c) return 'Case not found'
  const a = userById(S, actorId)
  if (!a || a.role !== 'processing' || !visibleCompanies(S, a).includes(c.companyId)) return 'Permission denied — Processing is the Fulfilment Owner'
  return c
}

function setCaseStatusInternal(S: AppData, c: ServiceCase, status: string, actorId: string) {
  if (c.status === status) return
  c.status = status
  c.statusHistory.push({ at: S.clock.now, status, byUserId: actorId })
}

/** After appointment booking, any outstanding balance is a hard gate (AC-SAL-006-4). */
export function balanceBlocked(S: AppData, c: ServiceCase): boolean {
  if (!c.appointment) return false
  const o = oppById(S, c.oppId)!
  return paymentTotals(S, o).outstanding > 0
}

/** Processing records the visa options; the CRM never chooses (AC-SAL-006-2). */
export function addVisaOption(S: AppData, caseId: string, input: { country: string; centre: string; date: string; time: string }, actorId: string): Result {
  const r = requireProcessing(S, caseById(S, caseId), actorId)
  if (typeof r === 'string') return fail(r)
  if (r.selection) return fail('The customer has already chosen an option')
  if (!input.country.trim() || !input.centre.trim() || !input.date || !input.time) return fail('Enter country, centre, date and time')
  r.options.push({ id: nextId(S, 'vo'), country: input.country.trim(), centre: input.centre.trim(), date: input.date, time: input.time, addedAt: S.clock.now, addedBy: actorId })
  const o = oppById(S, r.oppId)!
  audit(S, 'case', actorId, r.companyId, `${r.ref}: visa option added — ${input.country.trim()}, ${input.centre.trim()}, ${input.date} ${input.time}`, { oppId: o.id })
  return ok()
}

export function sendOptionsToAgent(S: AppData, caseId: string, actorId: string): Result {
  const r = requireProcessing(S, caseById(S, caseId), actorId)
  if (typeof r === 'string') return fail(r)
  if (r.options.length === 0) return fail('Add at least one option')
  const o = oppById(S, r.oppId)!
  setCaseStatusInternal(S, r, 'Options sent to agent', actorId)
  notifyUser(S, oppOwnerId(S, o), o, `Visa options ready · ${r.ref}`, `Processing recorded ${r.options.length} option(s). Ask the customer and record their choice.`, r.id)
  audit(S, 'case', actorId, r.companyId, `${r.ref}: options sent to the agent`, { oppId: o.id })
  return ok()
}

/** The agent records the customer's choice; this notifies Processing (AC-SAL-006-2). */
export function recordSelection(S: AppData, caseId: string, optionId: string, actorId: string): Result {
  const c = caseById(S, caseId)
  if (!c) return fail('Case not found')
  const r = requireOwner(S, oppById(S, c.oppId), actorId)
  if (typeof r === 'string') return fail(r)
  const opt = c.options.find((x) => x.id === optionId)
  if (!opt) return fail('Choose one of the options Processing recorded')
  if (c.appointment) return fail('The appointment is already booked')
  c.selection = { optionId, at: S.clock.now, byUserId: actorId }
  setCaseStatusInternal(S, c, 'Customer selection recorded', actorId)
  audit(S, 'case', actorId, c.companyId, `${c.ref}: customer chose ${opt.country}, ${opt.centre}, ${opt.date} ${opt.time}`, { oppId: r.id })
  notifyRole(S, 'processing', r, `Customer choice recorded · ${c.ref}`, `${opt.country}, ${opt.centre}, ${opt.date} ${opt.time}. Book the appointment.`, c.id)
  return ok()
}

/** Processing books the appointment; this notifies the agent (AC-SAL-006-3) and starts the balance gate (AC-SAL-006-4). */
export function recordAppointment(S: AppData, caseId: string, reference: string, actorId: string): Result {
  const r = requireProcessing(S, caseById(S, caseId), actorId)
  if (typeof r === 'string') return fail(r)
  if (!r.selection) return fail('Wait for the agent to record the customer’s choice')
  if (r.appointment) return fail('The appointment is already recorded')
  if (!reference.trim()) return fail('Enter the appointment reference')
  r.appointment = { optionId: r.selection.optionId, reference: reference.trim(), at: S.clock.now, byUserId: actorId }
  setCaseStatusInternal(S, r, 'Appointment booked', actorId)
  const o = oppById(S, r.oppId)!
  const owner = oppOwnerId(S, o)
  audit(S, 'case', actorId, r.companyId, `${r.ref}: appointment booked (${reference.trim()})`, { oppId: o.id })
  notifyUser(S, owner, o, `Appointment booked · ${r.ref}`, `Reference ${reference.trim()}.`, r.id)
  const { outstanding } = paymentTotals(S, o)
  if (outstanding > 0) {
    S.tasks.push({ id: nextId(S, 'tk'), oppId: o.id, kind: 'balance_payment', title: `Collect the outstanding balance of £${outstanding.toFixed(2)}`, due: { mode: 'window', label: 'As soon as possible', at: S.clock.now }, createdAt: S.clock.now, createdBy: SYSTEM_ID, doneAt: null, doneBy: null })
    notifyUser(S, owner, o, `Balance gate · ${r.ref}`, `£${outstanding.toFixed(2)} is outstanding. Document preparation and pack release are blocked until Accounts confirms the full balance.`, r.id)
    audit(S, 'case', SYSTEM_ID, r.companyId, `${r.ref}: balance gate — £${outstanding.toFixed(2)} outstanding, Balance Payment task created`, { oppId: o.id })
  }
  return ok()
}

/** Each side completes only the items it owns. Blocked behind the balance gate. */
export function toggleChecklistItem(S: AppData, caseId: string, key: ServiceItemKey, done: boolean, actorId: string): Result {
  const c = caseById(S, caseId)
  if (!c) return fail('Case not found')
  const item = c.checklist.find((i) => i.key === key)
  if (!item) return fail('Item not in this case')
  const actor = userById(S, actorId)
  const o = oppById(S, c.oppId)!
  const isOwner = item.owner === 'processing'
    ? !!actor && actor.role === 'processing' && visibleCompanies(S, actor).includes(c.companyId)
    : !!actor && canWorkOpportunity(S, actor, o)
  if (!isOwner) return fail(`Permission denied — this item is owned by ${item.owner === 'processing' ? 'Processing' : 'the Sales Agent'}`)
  if (balanceBlocked(S, c)) return fail('Blocked — Accounts has not confirmed the full outstanding balance')
  if (c.packSent) return fail('The pack has already been sent')
  item.doneAt = done ? S.clock.now : null
  item.doneBy = done ? actorId : null
  if (!done) c.completenessCheck = null
  if (done && c.appointment) setCaseStatusInternal(S, c, 'Documents in preparation', actorId)
  audit(S, 'case', actorId, c.companyId, `${c.ref}: “${item.label}” marked ${done ? 'complete' : 'not complete'}`, { oppId: o.id })
  return ok()
}

/** The agent completes the final completeness check (interpretation: every checklist item must be complete). */
export function completenessCheck(S: AppData, caseId: string, actorId: string): Result {
  const c = caseById(S, caseId)
  if (!c) return fail('Case not found')
  const r = requireOwner(S, oppById(S, c.oppId), actorId)
  if (typeof r === 'string') return fail(r)
  if (balanceBlocked(S, c)) return fail('Blocked — Accounts has not confirmed the full outstanding balance')
  if (!c.appointment) return fail('The appointment is not booked yet')
  const open = c.checklist.filter((i) => !i.doneAt)
  if (open.length) return fail(`${open.length} checklist item(s) are not complete`)
  c.completenessCheck = { at: S.clock.now, byUserId: actorId }
  audit(S, 'case', actorId, c.companyId, `${c.ref}: final completeness check done`, { oppId: r.id })
  return ok()
}

/** The pack cannot be marked sent before the completeness check (AC-SAL-006-6). WhatsApp by default, email on request. */
export function markPackSent(S: AppData, caseId: string, via: 'whatsapp' | 'email', actorId: string): Result {
  const c = caseById(S, caseId)
  if (!c) return fail('Case not found')
  const r = requireOwner(S, oppById(S, c.oppId), actorId)
  if (typeof r === 'string') return fail(r)
  if (balanceBlocked(S, c)) return fail('Blocked — the final pack cannot be released until Accounts confirms the full balance')
  if (!c.completenessCheck) return fail('Complete the final completeness check first')
  if (c.packSent) return fail('The pack has already been sent')
  c.packSent = { at: S.clock.now, byUserId: actorId, via }
  setCaseStatusInternal(S, c, 'Pack sent', actorId)
  audit(S, 'case', actorId, c.companyId, `${c.ref}: document pack sent by ${via === 'whatsapp' ? 'WhatsApp' : 'email'}`, { oppId: r.id })
  notifyRole(S, 'processing', r, `Pack sent · ${c.ref}`, `The agent sent the document pack by ${via === 'whatsapp' ? 'WhatsApp' : 'email'}.`, c.id)
  return ok()
}

/** Processing updates the status manually (milestone list to be confirmed). */
export function setCaseStatus(S: AppData, caseId: string, status: string, actorId: string): Result {
  const r = requireProcessing(S, caseById(S, caseId), actorId)
  if (typeof r === 'string') return fail(r)
  if (!status.trim()) return fail('Choose a status')
  if (r.outcome) return fail('The outcome is already recorded')
  setCaseStatusInternal(S, r, status.trim(), actorId)
  audit(S, 'case', actorId, r.companyId, `${r.ref}: status set to “${status.trim()}”`, { oppId: r.oppId })
  return ok()
}

/** Refused never makes the Booking Lost; Granted creates review and referral tasks (AC-SAL-006-7). */
export function recordOutcome(S: AppData, caseId: string, result: 'granted' | 'refused', actorId: string): Result {
  const r = requireProcessing(S, caseById(S, caseId), actorId)
  if (typeof r === 'string') return fail(r)
  if (r.outcome) return fail('The outcome is already recorded')
  r.outcome = { result, at: S.clock.now, byUserId: actorId }
  setCaseStatusInternal(S, r, result === 'granted' ? 'Granted' : 'Refused', actorId)
  const o = oppById(S, r.oppId)!
  const owner = oppOwnerId(S, o)
  audit(S, 'case', actorId, r.companyId, `${r.ref}: visa ${result === 'granted' ? 'Granted' : 'Refused'}${result === 'refused' ? ' — Booking stays Booked' : ''}`, { oppId: o.id })
  if (result === 'granted') {
    const due: TaskDue = { mode: 'window', label: 'After the grant', at: S.clock.now }
    S.tasks.push({ id: nextId(S, 'tk'), oppId: o.id, kind: 'review', title: 'Ask the customer for a review', due, createdAt: S.clock.now, createdBy: SYSTEM_ID, doneAt: null, doneBy: null })
    S.tasks.push({ id: nextId(S, 'tk'), oppId: o.id, kind: 'referral', title: 'Ask the customer for a referral', due, createdAt: S.clock.now, createdBy: SYSTEM_ID, doneAt: null, doneBy: null })
  }
  notifyUser(S, owner, o, `Visa ${result === 'granted' ? 'Granted' : 'Refused'} · ${r.ref}`, result === 'granted' ? 'Review and referral tasks were added to your list.' : 'The Booking stays Booked. Talk to the customer about next steps.', r.id)
  return ok()
}

// ================================================================ SAL-FR-008 sensitive data & documents (storage simulated)

/** Revealing masked sensitive fields is audit-logged (AC-SAL-008-4). */
export function revealSensitive(S: AppData, oppId: string, actorId: string): Result {
  const o = oppById(S, oppId)
  const actor = userById(S, actorId)
  if (!o || !actor) return fail('Not found')
  if (!canSeeSensitive(S, actor, o)) {
    audit(S, 'sensitive-access', actorId, o.companyId, `Denied: ${actor.name} tried to view sensitive applicant data on ${leadOf(S, o).ref}`, { oppId: o.id })
    return fail('Permission denied — sensitive applicant data is restricted')
  }
  audit(S, 'sensitive-access', actorId, o.companyId, `${actor.name} viewed sensitive applicant data on ${leadOf(S, o).ref}`, { oppId: o.id })
  return ok()
}

/** Stores metadata only. In production the raw file goes to a private object-storage bucket (not built — simulated). */
export function uploadDocument(S: AppData, oppId: string, input: { name: string; kind: 'passport' | 'share_code' | 'visa_status' | 'other'; sizeKb: number }, actorId: string): Result {
  const o = oppById(S, oppId)
  const actor = userById(S, actorId)
  if (!o || !actor) return fail('Not found')
  const c = caseOf(S, o)
  const allowed = canWorkOpportunity(S, actor, o) || (actor.role === 'processing' && !!c && visibleCompanies(S, actor).includes(o.companyId))
  if (!allowed) return fail('Permission denied')
  if (!input.name.trim()) return fail('Choose a file')
  const id = nextId(S, 'dc')
  S.documents.push({ id, oppId, name: input.name.trim(), kind: input.kind, sizeKb: Math.max(1, Math.round(input.sizeKb)), uploadedAt: S.clock.now, uploadedBy: actorId, deletedAt: null, links: [] })
  audit(S, 'document', actorId, o.companyId, `${leadOf(S, o).ref}: document “${input.name.trim()}” uploaded (metadata stored; raw file in private storage — simulated)`, { oppId })
  return ok(id)
}

/** File access only after a permission check, through a short-lived link — never a permanent public URL (AC-SAL-008-4). */
export function requestDocumentLink(S: AppData, docId: string, actorId: string): Result {
  const d = S.documents.find((x) => x.id === docId)
  if (!d) return fail('Document not found')
  const o = oppById(S, d.oppId)!
  const actor = userById(S, actorId)
  if (!actor) return fail('Not found')
  if (!canSeeSensitive(S, actor, o)) {
    audit(S, 'sensitive-access', actorId, o.companyId, `Denied: ${actor.name} requested “${d.name}”`, { oppId: o.id })
    return fail('Permission denied — this file is restricted')
  }
  if (d.deletedAt) return fail('The raw file was deleted under the retention policy; only its metadata remains')
  const token = `sim-${nextId(S, 'lk')}-${(S.seq * 2654435761 % 1e9).toString(36)}`
  d.links.push({ token, userId: actorId, issuedAt: S.clock.now, expiresAt: S.clock.now + S.salesConfig.linkMinutes * MIN })
  audit(S, 'sensitive-access', actorId, o.companyId, `${actor.name} opened “${d.name}” through a ${S.salesConfig.linkMinutes}-minute controlled link`, { oppId: o.id })
  return ok(token)
}

export function deleteDocumentNow(S: AppData, docId: string, actorId: string): Result {
  const d = S.documents.find((x) => x.id === docId)
  if (!d) return fail('Document not found')
  const actor = userById(S, actorId)
  if (!actor || actor.role !== 'admin') return fail('Only the Admin runs retention deletion by hand')
  if (d.deletedAt) return fail('Already deleted')
  d.deletedAt = S.clock.now
  d.links = []
  audit(S, 'retention', actorId, oppById(S, d.oppId)?.companyId ?? null, `Raw file “${d.name}” deleted by ${actor.name}; metadata kept`, { oppId: d.oppId })
  return ok()
}

export function setSalesConfig(S: AppData, patch: Partial<SalesConfig>, actorId: string): Result {
  const actor = userById(S, actorId)
  if (!actor || actor.role !== 'admin') return fail('Only the Admin changes Sales configuration')
  const nums = [patch.invoiceReminderDays, patch.invoiceEscalationDays, patch.retentionDays].filter((v) => v !== undefined && v !== null) as number[]
  if (nums.some((n) => !Number.isFinite(n) || n < 1 || !Number.isInteger(n))) return fail('Periods are whole numbers of days (1 or more), or empty for “not configured”')
  if (patch.linkMinutes !== undefined && (!Number.isInteger(patch.linkMinutes) || patch.linkMinutes < 1 || patch.linkMinutes > 60)) return fail('Link lifetime is 1–60 minutes')
  if (patch.expectedCosts && Object.values(patch.expectedCosts).some((v) => !Number.isFinite(v) || v < 0)) return fail('Expected costs must be zero or more')
  const rem = patch.invoiceReminderDays !== undefined ? patch.invoiceReminderDays : S.salesConfig.invoiceReminderDays
  const esc = patch.invoiceEscalationDays !== undefined ? patch.invoiceEscalationDays : S.salesConfig.invoiceEscalationDays
  if (esc != null && (rem == null || esc <= rem)) return fail('The Manager alert comes after the agent reminder — set a reminder period and a longer escalation period')
  Object.assign(S.salesConfig, patch)
  audit(S, 'sales-config', actorId, null, `Sales configuration changed: ${Object.keys(patch).join(', ')} (placeholder values — to be confirmed)`)
  salesTick(S)
  return ok()
}

