// Business engine for the Marketing module. Functions mutate an AppData draft
// (the store wraps them in immer). Each rule cites the FRD requirement it implements.

import { SOURCE_LABEL, SYSTEM_ID, CONNECTION_LABEL, FUNNEL_ORDER } from './constants'
import type {
  AppData, AuditEntry, AuditType, AppNotification, CompanyId, CustomerFields, DistributionTrace, Enquiry,
  EnquiryChannel, FunnelStatus, Lead, LeadSource, NotificationType, OwnershipChangeKind, User, FailedEvent,
} from './types'
import { SLA_MS, isShiftTime, monthKey, nextShiftBoundary, pktHour, shiftKey, pktDateKey, fmtTime } from '../lib/time'

export type Result = { ok: true; id?: string } | { ok: false; error: string }
const ok = (id?: string): Result => ({ ok: true, id })
const fail = (error: string): Result => ({ ok: false, error })

// ---------------------------------------------------------------- helpers

export function nextId(S: AppData, prefix: string) {
  S.seq += 1
  return `${prefix}-${S.seq}`
}

export function userById(S: AppData, id: string | null | undefined): User | undefined {
  if (!id) return undefined
  return S.users.find((u) => u.id === id)
}

export function userName(S: AppData, id: string | null | undefined): string {
  if (!id) return '—'
  if (id === SYSTEM_ID) return 'CRM (automatic)'
  return userById(S, id)?.name ?? 'Unknown user'
}

export function companyName(S: AppData, id: CompanyId | null) {
  return S.companies.find((c) => c.id === id)?.name ?? '—'
}

/** Sales agents of one company, in roster order. */
export function companyAgents(S: AppData, companyId: CompanyId): User[] {
  return S.users
    .filter((u) => u.role === 'agent' && u.companyIds[0] === companyId)
    .sort((a, b) => (a.rosterOrder ?? 0) - (b.rosterOrder ?? 0))
}

/** Absent = Manager has marked the agent as not working this shift (P1-FR-002). */
export function isAbsent(agent: User, t: number): boolean {
  return !!agent.absentShiftKey && agent.absentShiftKey === shiftKey(t)
}

/** Owner counts as Available for the SLA only when Available and not marked Absent. */
export function isEffectivelyAvailable(agent: User, t: number): boolean {
  return agent.availability === 'available' && !isAbsent(agent, t)
}

const isOpenOutcome = (l: Lead) => l.status !== 'booked' && l.status !== 'lost'

/**
 * Active (unresolved) leads held right now: assigned, not yet dealt with (no first contact),
 * and not closed. Counted against the active-lead capacity (P1-FR-002).
 */
export function activeLeadCount(S: AppData, agentId: string): number {
  return S.leads.filter((l) => l.ownerId === agentId && l.firstContactAt === null && isOpenOutcome(l)).length
}

export function monthlyCount(S: AppData, agentId: string, month: string): number {
  return S.assignments.filter((a) => a.agentId === agentId && a.counted && !a.voided && monthKey(a.at) === month).length
}

export function offsetFor(S: AppData, agentId: string, month: string): number {
  return S.offsets.find((o) => o.agentId === agentId && o.month === month)?.offset ?? 0
}

/** Effective score = actual monthly assignments + starting offset (P1-FR-003). */
export function fairnessScore(S: AppData, agentId: string, month: string) {
  const count = monthlyCount(S, agentId, month)
  const offset = offsetFor(S, agentId, month)
  return { count, offset, score: count + offset }
}

export type AgentState = 'available' | 'unavailable' | 'absent' | 'at-capacity'

export function agentState(S: AppData, agent: User, t: number): AgentState {
  if (isAbsent(agent, t)) return 'absent'
  if (agent.availability === 'unavailable') return 'unavailable'
  if (activeLeadCount(S, agent.id) >= S.params.capacity) return 'at-capacity'
  return 'available'
}

function audit(S: AppData, type: AuditType, actorId: string, companyId: CompanyId | null, summary: string, extra: Partial<AuditEntry> = {}) {
  S.audit.push({ id: nextId(S, 'au'), at: S.clock.now, type, actorId, companyId, summary, ...extra })
}

function notify(S: AppData, type: NotificationType, companyId: CompanyId | null, title: string, body: string, leadId?: string) {
  const n: AppNotification = { id: nextId(S, 'nt'), at: S.clock.now, type, companyId, title, body, leadId, read: false, cleared: false }
  S.notifications.push(n)
}

function clearSlaAlerts(S: AppData, leadId: string) {
  for (const n of S.notifications) if (n.type === 'sla' && n.leadId === leadId) n.cleared = true
}

function setOwner(S: AppData, lead: Lead, toAgentId: string | null, kind: OwnershipChangeKind, byUserId: string, reason?: string) {
  const t = S.clock.now
  lead.ownershipHistory.push({ at: t, kind, fromAgentId: lead.ownerId, toAgentId, byUserId, reason })
  lead.ownerId = toAgentId
  lead.assignedAt = toAgentId ? t : null
  lead.assignedInOffTime = toAgentId ? !isShiftTime(t) : false
}

// ---------------------------------------------------------------- distribution (P1-FR-002, P1-FR-003)

/**
 * Distribution rule used in the FRD: eligibility first (Absent → Unavailable → capacity),
 * then fairness picks the lowest score among the agents left.
 * During off-time availability is ignored (P1-FR-004); whether capacity applies off-time is a pending decision.
 */
export function distribute(S: AppData, leadId: string): DistributionTrace | null {
  const lead = S.leads.find((l) => l.id === leadId)
  if (!lead) return null
  const t = S.clock.now
  const inShift = isShiftTime(t)
  const month = monthKey(t)
  const cap = S.params.capacity
  const capacityApplied = inShift || S.params.capacityAppliesOffTime

  const pool = companyAgents(S, lead.companyId) // MKT-BR-003: own company only
  let remaining = pool
  const removedAbsent = inShift ? remaining.filter((a) => isAbsent(a, t)) : []
  remaining = remaining.filter((a) => !removedAbsent.includes(a))
  const removedUnavailable = inShift ? remaining.filter((a) => a.availability === 'unavailable') : []
  remaining = remaining.filter((a) => !removedUnavailable.includes(a))
  const removedAtCapacity = capacityApplied ? remaining.filter((a) => activeLeadCount(S, a.id) >= cap) : []
  remaining = remaining.filter((a) => !removedAtCapacity.includes(a))

  const scores = remaining.map((a) => ({ agentId: a.id, ...fairnessScore(S, a.id, month) }))
  const trace: DistributionTrace = {
    at: t, inShift, pool: pool.map((a) => a.id),
    removedAbsent: removedAbsent.map((a) => a.id),
    removedUnavailable: removedUnavailable.map((a) => a.id),
    removedAtCapacity: removedAtCapacity.map((a) => a.id),
    scores, winnerId: null, tieBreak: false, capacityApplied, capacity: cap,
  }

  if (remaining.length === 0) {
    // AC-P1-002-5: stays Unassigned and the Manager is notified.
    lead.lastTrace = trace
    setOwner(S, lead, null, 'unassigned-no-eligible', SYSTEM_ID)
    const why = pool.length === 0 ? `${companyName(S, lead.companyId)} has no sales agents yet` : 'no agent passed the Absent, Unavailable and capacity checks'
    audit(S, 'no-eligible', SYSTEM_ID, lead.companyId, `${lead.ref} left Unassigned — ${why}`, { leadId: lead.id })
    notify(S, 'no-eligible', lead.companyId, `No eligible agent for ${lead.ref}`, `${lead.fields.fullName || 'New lead'} (${companyName(S, lead.companyId)}) is Unassigned — ${why}. Assign it manually.`, lead.id)
    return trace
  }

  const min = Math.min(...scores.map((s) => s.score))
  const tied = remaining.filter((a) => scores.find((s) => s.agentId === a.id)!.score === min)
  let winner = tied[0]
  if (tied.length > 1) {
    // Rotating deterministic tie-break: next agent in roster order after the previous tie winner.
    trace.tieBreak = true
    const last = userById(S, S.tieRotation[lead.companyId])
    const lastOrder = last?.rosterOrder ?? -Infinity
    winner = tied.find((a) => (a.rosterOrder ?? 0) > lastOrder) ?? tied[0]
    S.tieRotation[lead.companyId] = winner.id
  }
  trace.winnerId = winner.id
  lead.lastTrace = trace

  setOwner(S, lead, winner.id, 'auto', SYSTEM_ID)
  lead.slaCountedMs = 0
  lead.slaAlertAt = null
  S.assignments.push({ id: nextId(S, 'as'), leadId: lead.id, agentId: winner.id, companyId: lead.companyId, at: t, kind: 'auto', counted: true, voided: false })
  const sc = scores.find((s) => s.agentId === winner.id)!
  audit(S, 'auto-assign', SYSTEM_ID, lead.companyId,
    `${lead.ref} assigned to ${winner.name} (score ${sc.score}${trace.tieBreak ? ', tie broken by rotation' : ''}${inShift ? '' : ', off-time — no SLA'})`,
    { leadId: lead.id, agentId: winner.id })
  return trace
}

// ---------------------------------------------------------------- clock & SLA (P1-FR-004)

function slaQualifies(S: AppData, lead: Lead, t: number): boolean {
  if (!lead.ownerId || lead.firstContactAt !== null || !isOpenOutcome(lead)) return false
  const owner = userById(S, lead.ownerId)
  return !!owner && isEffectivelyAvailable(owner, t)
}

function raiseSlaAlert(S: AppData, lead: Lead, at: number) {
  lead.slaAlertAt = at
  const owner = userName(S, lead.ownerId)
  audit(S, 'sla-alert', SYSTEM_ID, lead.companyId, `${lead.ref}: one hour of counted time without first contact (owner ${owner})`, { leadId: lead.id, agentId: lead.ownerId ?? undefined })
  const n: AppNotification = {
    id: nextId(S, 'nt'), at, type: 'sla', companyId: lead.companyId, leadId: lead.id,
    title: `SLA alert · ${lead.ref}`,
    body: `${lead.fields.fullName} has waited one hour of counted time without first contact. Owner: ${owner}. The Lead stays with its owner until a manager acts.`,
    read: false, cleared: false,
  }
  S.notifications.push(n)
}

/**
 * Advance simulated time. The one-hour timer counts only while it is shift time,
 * the Lead is assigned, and the owner is Available (AC-P1-004-2/3).
 */
export function advanceTo(S: AppData, t1: number) {
  let t = S.clock.now
  if (t1 <= t) return
  while (t < t1) {
    const boundary = nextShiftBoundary(t)
    const nb = Math.min(boundary, t1)
    if (isShiftTime(t)) {
      for (const lead of S.leads) {
        if (!slaQualifies(S, lead, t)) continue
        const before = lead.slaCountedMs
        lead.slaCountedMs += nb - t
        if (lead.slaCountedMs >= SLA_MS && lead.slaAlertAt === null) {
          raiseSlaAlert(S, lead, t + Math.max(0, SLA_MS - before))
        }
      }
    }
    t = nb
    S.clock.now = t
    if (nb === boundary && pktHour(nb) === 14) {
      notify(S, 'shift-start', null, `Shift started · ${pktDateKey(nb)}`, 'Mark any Absent agents. Pending off-time Leads they own will be released and redistributed (MKT-BR-009).')
    }
  }
  S.clock.now = t1
}

// ---------------------------------------------------------------- lead creation (P1-FR-001)

export interface NewLeadInput {
  companyId: CompanyId
  source: LeadSource
  fields: CustomerFields
  campaignId?: string | null
  adId?: string | null
  enquiryId?: string
  conversationRef?: string
  externalEventId?: string
  assignment: { mode: 'auto' } | { mode: 'manual'; agentId: string }
}

export function createLead(S: AppData, input: NewLeadInput, actorId: string): Lead {
  const t = S.clock.now
  const lead: Lead = {
    id: nextId(S, 'ld'),
    ref: `LD-${24000 + S.leads.length + 1}`,
    companyId: input.companyId,
    source: input.source,
    campaignId: input.campaignId ?? null,
    adId: input.adId ?? null,
    fields: { ...input.fields },
    createdAt: t,
    createdByUserId: actorId,
    enquiryId: input.enquiryId,
    conversationRef: input.conversationRef,
    externalEventId: input.externalEventId,
    ownerId: null,
    assignedAt: null,
    assignedInOffTime: false,
    status: 'lead',
    lossReason: null,
    statusHistory: [{ at: t, from: null, to: 'lead', byUserId: actorId }],
    ownershipHistory: [],
    notes: [],
    firstContactAt: null,
    firstContactByUserId: null,
    slaCountedMs: 0,
    slaAlertAt: null,
    lastTrace: null,
  }
  S.leads.push(lead)
  if (input.assignment.mode === 'manual') {
    manualAssign(S, lead.id, input.assignment.agentId, actorId)
  } else {
    distribute(S, lead.id)
  }
  return lead
}

// ---------------------------------------------------------------- social enquiries (P1-FR-001, MKT-BR-002)

export interface NewEnquiryInput {
  companyId: CompanyId
  channel: EnquiryChannel
  handle: string
  text: string
  postContext?: string
  externalEventId?: string
  /** Defaults to 'simulated'. Only threads created from real Meta webhooks are 'live'. */
  origin?: 'live' | 'simulated'
  platformUserId?: string
  commentId?: string
  /** Meta message / comment id of the first message */
  messageExternalId?: string
  at?: number
}

export function createEnquiry(S: AppData, input: NewEnquiryInput): Enquiry {
  const t = input.at ?? S.clock.now
  const isComment = input.channel.endsWith('comment')
  const token = (S.seq * 7919 + 104729).toString(36)
  const e: Enquiry = {
    id: nextId(S, 'eq'),
    ref: `EQ-${7000 + S.enquiries.length + 1}`,
    companyId: input.companyId,
    channel: input.channel,
    handle: input.handle,
    conversationRef: `${input.channel.startsWith('facebook') ? 'fb' : 'ig'}_${isComment ? 'comment' : 'thread'}_${token}`,
    messages: [{ id: nextId(S, 'msg'), from: 'customer', kind: isComment ? 'comment' : 'dm', text: input.text, at: t, externalId: input.messageExternalId }],
    fields: { nationality: '', fullName: '', phone: '', email: '', city: '', tripDetails: '' },
    read: false,
    status: 'open',
    convertedLeadId: null,
    convertedAt: null,
    convertedByUserId: null,
    createdAt: t,
    postContext: input.postContext,
    origin: input.origin ?? 'simulated',
    platformUserId: input.platformUserId ?? `sim_${input.channel.startsWith('facebook') ? 'psid' : 'igsid'}_${token}`,
    commentId: isComment ? (input.commentId ?? `sim_comment_${token}`) : undefined,
    privateReplyAt: isComment ? null : undefined,
    lastInboundDmAt: isComment ? null : t,
    lastActivityAt: t,
  }
  S.enquiries.push(e)
  return e
}

export function missingConversionFields(S: AppData, e: Enquiry): (keyof CustomerFields)[] {
  return S.params.conversionRequiredFields.filter((f) => !e.fields[f]?.trim())
}

/** Convert to Lead is a deliberate Marketing action — no AI qualification (MKT-BR-002). */
export function convertEnquiry(S: AppData, enquiryId: string, actorId: string): Result {
  const e = S.enquiries.find((x) => x.id === enquiryId)
  if (!e) return fail('Enquiry not found')
  if (e.status === 'converted') return fail('This enquiry has already been converted')
  const missing = missingConversionFields(S, e)
  if (missing.length) return fail('Required fields are missing')
  const lead = createLead(S, {
    companyId: e.companyId, source: e.channel, fields: e.fields, campaignId: null, adId: null,
    enquiryId: e.id, conversationRef: e.conversationRef, assignment: { mode: 'auto' },
  }, actorId)
  e.status = 'converted'
  e.convertedLeadId = lead.id
  e.convertedAt = S.clock.now
  e.convertedByUserId = actorId
  e.read = true
  audit(S, 'enquiry-converted', actorId, e.companyId, `${e.ref} (${SOURCE_LABEL[e.channel]}) converted to ${lead.ref}`, { leadId: lead.id })
  return ok(lead.id)
}

// ---------------------------------------------------------------- manual controls (MKT-BR-006, P3-FR-002)

/** Assign (to an agent), unassign (null) or reassign. Manual assignment skips the eligibility filters. */
export function manualAssign(S: AppData, leadId: string, toAgentId: string | null, actorId: string, reason?: string): Result {
  const lead = S.leads.find((l) => l.id === leadId)
  if (!lead) return fail('Lead not found')
  if (toAgentId) {
    const agent = userById(S, toAgentId)
    if (!agent || agent.role !== 'agent') return fail('Choose a sales agent')
    if (agent.companyIds[0] !== lead.companyId) return fail('A Lead can only be given to an agent of its own company')
    if (agent.id === lead.ownerId) return fail('This agent already owns the Lead')
  } else if (!lead.ownerId) {
    return fail('The Lead is already Unassigned')
  }
  const kind: OwnershipChangeKind = !toAgentId ? 'manual-unassign' : lead.ownerId ? 'manual-reassign' : 'manual-assign'
  const from = lead.ownerId
  setOwner(S, lead, toAgentId, kind, actorId, reason?.trim() || undefined)

  if (!toAgentId || S.params.slaRestartsOnReassign) {
    lead.slaCountedMs = toAgentId ? 0 : lead.slaCountedMs
    lead.slaAlertAt = null
    clearSlaAlerts(S, lead.id)
  }
  if (toAgentId) {
    S.assignments.push({ id: nextId(S, 'as'), leadId: lead.id, agentId: toAgentId, companyId: lead.companyId, at: S.clock.now, kind: 'manual', counted: S.params.manualCountsTowardFairness, voided: false })
  }
  const verb = kind === 'manual-assign' ? 'assigned to' : kind === 'manual-unassign' ? 'unassigned from' : 'reassigned to'
  const summary = kind === 'manual-unassign'
    ? `${lead.ref} unassigned from ${userName(S, from)}`
    : kind === 'manual-reassign'
      ? `${lead.ref} reassigned from ${userName(S, from)} to ${userName(S, toAgentId)}`
      : `${lead.ref} ${verb} ${userName(S, toAgentId)}`
  audit(S, kind, actorId, lead.companyId, summary + (reason?.trim() ? ` — “${reason.trim()}”` : ''), { leadId: lead.id, agentId: toAgentId ?? from ?? undefined })
  return ok(lead.id)
}

// ---------------------------------------------------------------- availability, absence, capacity

/** Only agents set their own Available/Unavailable (P3-FR-001). Audit-logged (P1-FR-004). */
export function setAvailability(S: AppData, agentId: string, value: 'available' | 'unavailable', actorId: string): Result {
  const a = userById(S, agentId)
  if (!a || a.role !== 'agent') return fail('Agent not found')
  if (a.availability === value) return ok()
  a.availability = value
  audit(S, 'availability', actorId, a.companyIds[0], `${a.name} set themselves ${value === 'available' ? 'Available' : 'Unavailable'}${isShiftTime(S.clock.now) ? '' : ' (off-time)'}`, { agentId })
  return ok()
}

/**
 * Manager marks an agent Absent for the current shift. Pending off-time Leads they own become
 * Unassigned and are redistributed; the new owner gets the count (MKT-BR-009, AC-P1-004-7).
 */
export function setAbsent(S: AppData, agentId: string, absent: boolean, actorId: string): Result {
  const a = userById(S, agentId)
  if (!a || a.role !== 'agent') return fail('Agent not found')
  const t = S.clock.now
  if (!isShiftTime(t)) return fail('Absent is marked during the shift (14:00–22:00 PKT)')
  if (absent === isAbsent(a, t)) return ok()
  a.absentShiftKey = absent ? shiftKey(t) : null
  audit(S, 'absent', actorId, a.companyIds[0], `${a.name} marked ${absent ? 'Absent' : 'back at work'} for the ${shiftKey(t)} shift`, { agentId })
  if (!absent) return ok()

  const pending = S.leads.filter((l) => l.ownerId === a.id && l.assignedInOffTime && l.firstContactAt === null && isOpenOutcome(l))
  for (const lead of pending) {
    const rec = [...S.assignments].reverse().find((r) => r.leadId === lead.id && r.agentId === a.id && !r.voided)
    if (rec) rec.voided = true
    setOwner(S, lead, null, 'released-absent', SYSTEM_ID, `${a.name} marked Absent`)
    lead.slaCountedMs = 0
    lead.slaAlertAt = null
    clearSlaAlerts(S, lead.id)
    audit(S, 'released-absent', SYSTEM_ID, lead.companyId, `${lead.ref} released from ${a.name} (Absent) for redistribution`, { leadId: lead.id, agentId: a.id })
    distribute(S, lead.id)
  }
  return ok()
}

export function setCapacity(S: AppData, value: number, actorId: string): Result {
  if (!Number.isInteger(value) || value < 1 || value > 50) return fail('Capacity must be a whole number between 1 and 50')
  const prev = S.params.capacity
  S.params.capacity = value
  audit(S, 'capacity', actorId, null, `Active-lead capacity changed from ${prev} to ${value} (placeholder value — to be confirmed)`)
  return ok()
}

/**
 * Team baseline for a new mid-month agent. Placeholder calculation (FRD: "for example the average"):
 * average effective score of the company's current agents this month, rounded to the nearest whole number.
 */
export function newAgentBaseline(S: AppData, companyId: CompanyId) {
  const month = monthKey(S.clock.now)
  const agents = companyAgents(S, companyId)
  if (agents.length === 0) return { baseline: 0, month, average: 0, agents: 0 }
  const scores = agents.map((a) => fairnessScore(S, a.id, month).score)
  const average = scores.reduce((x, y) => x + y, 0) / scores.length
  return { baseline: Math.round(average), month, average, agents: agents.length }
}

export function addAgent(S: AppData, input: { name: string; companyId: CompanyId }, actorId: string): Result {
  const name = input.name.trim()
  if (!name) return fail('Enter the agent’s name')
  const { baseline, month, average, agents } = newAgentBaseline(S, input.companyId)
  const roster = companyAgents(S, input.companyId)
  const user: User = {
    id: nextId(S, 'u'), name, role: 'agent', title: 'Sales Agent', companyIds: [input.companyId], viewOnlyCompanyIds: [],
    availability: 'available', absentShiftKey: null, joinedAt: S.clock.now,
    rosterOrder: (roster.at(-1)?.rosterOrder ?? 0) + 1,
  }
  S.users.push(user)
  // On the 1st the team baseline is 0, so a mid-month joiner is the only case with a non-zero offset.
  const offset = baseline
  S.offsets.push({ agentId: user.id, month, offset, baselineNote: agents ? `Average of ${agents} agent scores = ${average.toFixed(2)}, rounded` : 'No existing agents' })
  audit(S, 'agent-added', actorId, input.companyId, `${name} added to ${companyName(S, input.companyId)} with starting offset ${offset} (real count 0)`, { agentId: user.id })
  return ok(user.id)
}

// ---------------------------------------------------------------- outcomes (P2-FR-001)

export function recordFirstContact(S: AppData, leadId: string, actorId: string): Result {
  const lead = S.leads.find((l) => l.id === leadId)
  if (!lead) return fail('Lead not found')
  if (lead.ownerId !== actorId) return fail('Only the owning agent can record first contact')
  if (lead.firstContactAt) return fail('First contact is already recorded')
  lead.firstContactAt = S.clock.now
  lead.firstContactByUserId = actorId
  clearSlaAlerts(S, lead.id)
  audit(S, 'first-contact', actorId, lead.companyId, `First contact recorded on ${lead.ref} at ${fmtTime(S.clock.now)}`, { leadId: lead.id, agentId: actorId })
  return ok()
}

export function setStatus(S: AppData, leadId: string, to: FunnelStatus, actorId: string, lossReason?: string): Result {
  const lead = S.leads.find((l) => l.id === leadId)
  if (!lead) return fail('Lead not found')
  if (lead.ownerId !== actorId) return fail('Only the owning Sales Agent maintains the funnel status (MKT-BR-012)')
  if (lead.status === to && to !== 'lost') return ok()
  if (to === 'lost' && !lossReason?.trim()) return fail('A loss reason is required to save Lost')
  if (lead.status === 'lost' && to !== 'lost' && !S.params.allowReopenLost) return fail('Reopening a Lost Lead is not allowed (pending decision)')
  const fromIdx = FUNNEL_ORDER.indexOf(lead.status)
  const toIdx = FUNNEL_ORDER.indexOf(to)
  if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx && !S.params.allowBackwardStatus) return fail('Moving a Lead backward is not allowed (pending decision)')
  const from = lead.status
  lead.status = to
  lead.lossReason = to === 'lost' ? lossReason!.trim() : null
  lead.statusHistory.push({ at: S.clock.now, from, to, byUserId: actorId, lossReason: to === 'lost' ? lossReason!.trim() : undefined })
  if (to === 'booked' || to === 'lost') clearSlaAlerts(S, lead.id)
  return ok()
}

export function addNote(S: AppData, leadId: string, text: string, actorId: string): Result {
  const lead = S.leads.find((l) => l.id === leadId)
  if (!lead) return fail('Lead not found')
  if (lead.ownerId !== actorId) return fail('Agents add notes to their own Leads')
  if (!text.trim()) return fail('Write a note first')
  lead.notes.push({ id: nextId(S, 'no'), at: S.clock.now, byUserId: actorId, text: text.trim() })
  return ok()
}

export function editNote(S: AppData, leadId: string, noteId: string, text: string, actorId: string): Result {
  const lead = S.leads.find((l) => l.id === leadId)
  const note = lead?.notes.find((n) => n.id === noteId)
  if (!lead || !note) return fail('Note not found')
  if (lead.ownerId !== actorId || note.byUserId !== actorId) return fail('Agents edit their own notes on their own Leads')
  if (!text.trim()) return fail('A note cannot be empty')
  note.text = text.trim()
  note.editedAt = S.clock.now
  return ok()
}

// ---------------------------------------------------------------- integrations (P3-FR-003)

export interface ExternalPayload {
  kind: 'lead' | 'enquiry'
  source: LeadSource
  fields: CustomerFields
  campaignId: string | null
  adId: string | null
  externalId: string
  channel?: EnquiryChannel
  handle?: string
  text?: string
  postContext?: string
}

export function connectionFor(S: AppData, companyId: CompanyId, source: LeadSource) {
  const kind = source === 'meta_form' ? 'meta_forms' : source === 'website' ? 'website' : 'meta_inbox'
  return S.connections.find((c) => c.companyId === companyId && c.kind === kind)
}

function materialise(S: AppData, companyId: CompanyId, p: ExternalPayload): string {
  if (p.kind === 'enquiry') {
    const e = createEnquiry(S, { companyId, channel: p.channel!, handle: p.handle ?? p.fields.fullName, text: p.text ?? '', postContext: p.postContext, externalEventId: p.externalId })
    return e.id
  }
  const lead = createLead(S, { companyId, source: p.source, fields: p.fields, campaignId: p.campaignId, adId: p.adId, externalEventId: p.externalId, assignment: { mode: 'auto' } }, SYSTEM_ID)
  return lead.id
}

/**
 * Receive an external event. A repeated delivery of the same event is one record, not two (AC-P3-003-2).
 * A failing connection never drops an event silently: it is flagged (AC-P3-003-6).
 */
export function receiveExternalEvent(S: AppData, companyId: CompanyId, p: ExternalPayload): { outcome: 'created' | 'duplicate-ignored' | 'flagged'; recordId: string | null } {
  const conn = connectionFor(S, companyId, p.source)!
  const existing = S.externalEvents.find((e) => e.externalId === p.externalId)
  if (existing) {
    existing.deliveries += 1
    audit(S, 'integration', SYSTEM_ID, companyId, `Repeated delivery of event ${p.externalId} ignored (delivery #${existing.deliveries}) — no second record created`)
    return { outcome: 'duplicate-ignored', recordId: existing.recordId }
  }
  conn.lastEventAt = S.clock.now
  if (conn.state === 'error' || conn.state === 'recovering') {
    const fe: FailedEvent = {
      id: nextId(S, 'fe'), connectionId: conn.id, companyId, at: S.clock.now, status: 'flagged',
      summary: `${p.kind === 'lead' ? SOURCE_LABEL[p.source] : SOURCE_LABEL[p.channel!]} from ${p.fields.fullName || p.handle || 'unknown'} could not be processed`,
      payload: { kind: p.kind, source: p.source, fields: p.fields, campaignId: p.campaignId, adId: p.adId, externalId: p.externalId, channel: p.channel },
    }
    S.failedEvents.push(fe)
    S.externalEvents.push({ externalId: p.externalId, connectionId: conn.id, receivedAt: S.clock.now, outcome: 'flagged', recordId: null, deliveries: 1 })
    audit(S, 'integration', SYSTEM_ID, companyId, `Event ${p.externalId} flagged — ${CONNECTION_LABEL[conn.kind]} is in error`)
    return { outcome: 'flagged', recordId: null }
  }
  const recordId = materialise(S, companyId, p)
  S.externalEvents.push({ externalId: p.externalId, connectionId: conn.id, receivedAt: S.clock.now, outcome: 'created', recordId, deliveries: 1 })
  return { outcome: 'created', recordId }
}

export function setConnectionError(S: AppData, connectionId: string, message: string) {
  const c = S.connections.find((x) => x.id === connectionId)
  if (!c) return
  c.state = 'error'
  c.lastError = message
  audit(S, 'integration', SYSTEM_ID, c.companyId, `${CONNECTION_LABEL[c.kind]} (${companyName(S, c.companyId)}) failed: ${message}`)
  notify(S, 'integration', c.companyId, `Connection error · ${companyName(S, c.companyId)}`, `${CONNECTION_LABEL[c.kind]}: ${message}. Incoming events are flagged, not lost.`)
}

/** Simulation only — the recovery method (retry timing, fallback, who is alerted) is not decided. */
export function setConnectionState(S: AppData, connectionId: string, state: 'recovering' | 'recovered' | 'pending') {
  const c = S.connections.find((x) => x.id === connectionId)
  if (!c) return
  c.state = state
  if (state !== 'recovering') c.lastError = null
  if (state === 'recovered') {
    for (const fe of S.failedEvents.filter((f) => f.connectionId === c.id && f.status === 'flagged')) {
      const recordId = materialise(S, fe.companyId, { ...fe.payload, handle: fe.payload.fields.fullName, text: 'Message recovered after connection failure.' })
      fe.status = 'recovered'
      const ev = S.externalEvents.find((e) => e.externalId === fe.payload.externalId)
      if (ev) { ev.outcome = 'created'; ev.recordId = recordId }
    }
  }
  audit(S, 'integration', SYSTEM_ID, c.companyId, `${CONNECTION_LABEL[c.kind]} (${companyName(S, c.companyId)}) set to ${state} (simulation)`)
}

// ---------------------------------------------------------------- access (P3-FR-001)

/** Admin configures a Marketing employee's assigned companies and view-only grants. */
export function setMarketingAccess(S: AppData, userId: string, companyIds: CompanyId[], viewOnlyCompanyIds: CompanyId[], actorId: string): Result {
  const u = userById(S, userId)
  if (!u || u.role !== 'marketing') return fail('Only Marketing employees have company assignments here')
  u.companyIds = [...companyIds]
  u.viewOnlyCompanyIds = viewOnlyCompanyIds.filter((c) => !companyIds.includes(c))
  const names = (ids: CompanyId[]) => ids.map((c) => companyName(S, c)).join(', ') || 'none'
  audit(S, 'access', actorId, null, `${u.name}: manages ${names(u.companyIds)}; view-only ${names(u.viewOnlyCompanyIds)}`)
  return ok()
}
