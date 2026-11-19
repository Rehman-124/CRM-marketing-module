// Business engine for the Marketing module. Functions mutate an AppData draft
// (the store wraps them in immer). Each rule cites the FRD requirement it implements.

import { SOURCE_LABEL, SYSTEM_ID, CONNECTION_LABEL, FUNNEL_ORDER } from './constants'
import { canAssign } from './permissions'
import { createOpportunity, onLeadAssigned, syncLostToSales, salesTick, isUnworked } from './sales'
import type {
  AppData, AuditEntry, AuditType, AppNotification, CompanyId, CustomerFields, DistributionTrace, Enquiry,
  EnquiryChannel, FunnelStatus, Lead, LeadSource, NotificationType, OwnershipChangeKind, Permission, PreferredContact, User, FailedEvent,
} from './types'
import { SLA_MS, isShiftTime, nextShiftBoundary, pktHour, shiftKey, pktDateKey, fmtTime } from '../lib/time'

export type Result = { ok: true; id?: string } | { ok: false; error: string; id?: undefined }
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

/** Leads assigned to the agent that have no first contact yet (shown for monitoring only — v1.4 has no capacity limit). */
export function uncontactedCount(S: AppData, agentId: string): number {
  return S.leads.filter((l) => l.ownerId === agentId && l.firstContactAt === null && isOpenOutcome(l)).length
}

/** Counted, non-voided assignments since the agent joined. The score never resets automatically (v1.4: "does not reset at midnight"; any other reset is to be confirmed). */
export function assignmentCount(S: AppData, agentId: string): number {
  return S.assignments.filter((a) => a.agentId === agentId && a.counted && !a.voided).length
}

export function offsetFor(S: AppData, agentId: string): number {
  return S.offsets.find((o) => o.agentId === agentId)?.offset ?? 0
}

/**
 * Fair-distribution score. v1.4 leaves the calculation and a new agent's starting score "to be confirmed".
 * PLACEHOLDER (product-owner choice, 19 Nov 2026): counted assignments + a starting score equal to the team
 * average when the agent was added.
 */
export function fairnessScore(S: AppData, agentId: string) {
  const count = assignmentCount(S, agentId)
  const offset = offsetFor(S, agentId)
  return { count, offset, score: count + offset }
}

/** Agent status in v1.4: Available and Unavailable are set by the agent; Absent by a Manager or Admin. */
export type AgentState = 'available' | 'unavailable' | 'absent'

export function agentState(_S: AppData, agent: User, t: number): AgentState {
  if (isAbsent(agent, t)) return 'absent'
  if (agent.availability === 'unavailable') return 'unavailable'
  return 'available'
}

export function audit(S: AppData, type: AuditType, actorId: string, companyId: CompanyId | null, summary: string, extra: Partial<AuditEntry> = {}) {
  S.audit.push({ id: nextId(S, 'au'), at: S.clock.now, type, actorId, companyId, summary, ...extra })
}

export function notify(S: AppData, type: NotificationType, companyId: CompanyId | null, title: string, body: string, leadId?: string, extra: Partial<AppNotification> = {}) {
  const n: AppNotification = { id: nextId(S, 'nt'), at: S.clock.now, type, companyId, title, body, leadId, read: false, cleared: false, ...extra }
  S.notifications.push(n)
}

export function clearSlaAlerts(S: AppData, leadId: string) {
  for (const n of S.notifications) if (n.type === 'sla' && n.leadId === leadId) n.cleared = true
}

function setOwner(S: AppData, lead: Lead, toAgentId: string | null, kind: OwnershipChangeKind, byUserId: string, reason?: string) {
  const t = S.clock.now
  lead.ownershipHistory.push({ at: t, kind, fromAgentId: lead.ownerId, toAgentId, byUserId, reason })
  lead.ownerId = toAgentId
  lead.assignedAt = toAgentId ? t : null
  lead.assignedInOffTime = toAgentId ? !isShiftTime(t) : false
  // SAL-FR-001: the Lead arrives in the new owner's My Opportunities with its contact task or contact prompt
  if (toAgentId) onLeadAssigned(S, lead)
}

/** Rotating deterministic tie-breaker: the next agent in roster order after the previous tie winner (order to be confirmed). */
function rotate(S: AppData, companyId: CompanyId, candidates: User[]): User {
  const last = userById(S, S.tieRotation[companyId])
  const lastOrder = last?.rosterOrder ?? -Infinity
  const winner = candidates.find((a) => (a.rosterOrder ?? 0) > lastOrder) ?? candidates[0]
  S.tieRotation[companyId] = winner.id
  return winner
}

// ---------------------------------------------------------------- distribution (v1.4 P1-FR-002)

/**
 * For every automatic assignment the CRM (v1.4 P1-FR-002):
 *  1. excludes Absent agents;
 *  2. finds the lowest score among the remaining agents — the lowest-score group;
 *  3. during shift, prefers an Available agent inside that group, chosen with a rotating tie-breaker;
 *  4. if every agent in the group is Unavailable, still assigns inside the same group;
 *  5. never gives the Lead to a higher-score agent just because that agent is Available.
 * Off-time: assigned by fair share across the normal roster, availability ignored, no SLA (P1-FR-003).
 */
export function distribute(S: AppData, leadId: string): DistributionTrace | null {
  const lead = S.leads.find((l) => l.id === leadId)
  if (!lead) return null
  const t = S.clock.now
  const inShift = isShiftTime(t)

  const pool = companyAgents(S, lead.companyId) // MKT-BR-003: own company only
  const removedAbsent = pool.filter((a) => isAbsent(a, t))
  const remaining = pool.filter((a) => !removedAbsent.includes(a))
  const scores = remaining.map((a) => ({ agentId: a.id, ...fairnessScore(S, a.id), available: a.availability === 'available' }))
  const trace: DistributionTrace = {
    at: t, inShift, pool: pool.map((a) => a.id), removedAbsent: removedAbsent.map((a) => a.id),
    scores, lowestScore: null, group: [], availableInGroup: [], allGroupUnavailable: false, winnerId: null, tieBreak: false,
  }

  if (remaining.length === 0) {
    // To be confirmed in v1.4: what happens when every agent is Absent or the company has no agents.
    // Placeholder: the Lead stays Unassigned and Managers are notified.
    lead.lastTrace = trace
    setOwner(S, lead, null, 'unassigned-no-eligible', SYSTEM_ID)
    const why = pool.length === 0 ? `${companyName(S, lead.companyId)} has no sales agents yet` : 'every agent is marked Absent'
    audit(S, 'no-eligible', SYSTEM_ID, lead.companyId, `${lead.ref} left Unassigned — ${why}`, { leadId: lead.id })
    notify(S, 'no-eligible', lead.companyId, `No agent for ${lead.ref}`, `${lead.fields.fullName || 'New lead'} (${companyName(S, lead.companyId)}) is Unassigned — ${why}. Assign it manually.`, lead.id)
    return trace
  }

  const min = Math.min(...scores.map((s) => s.score))
  const group = remaining.filter((a) => scores.find((s) => s.agentId === a.id)!.score === min)
  const availableInGroup = inShift ? group.filter((a) => a.availability === 'available') : []
  // During shift an Available agent in the group is preferred; if all are Unavailable the Lead still stays in the group.
  const candidates = inShift && availableInGroup.length ? availableInGroup : group
  const winner = candidates.length > 1 ? rotate(S, lead.companyId, candidates) : candidates[0]
  Object.assign(trace, {
    lowestScore: min, group: group.map((a) => a.id), availableInGroup: availableInGroup.map((a) => a.id),
    allGroupUnavailable: inShift && availableInGroup.length === 0, winnerId: winner.id, tieBreak: candidates.length > 1,
  })
  lead.lastTrace = trace

  lead.slaCountedMs = 0
  lead.slaAlertAt = null
  S.assignments.push({ id: nextId(S, 'as'), leadId: lead.id, agentId: winner.id, companyId: lead.companyId, at: t, kind: 'auto', counted: true, voided: false })
  setOwner(S, lead, winner.id, 'auto', SYSTEM_ID)
  audit(S, 'auto-assign', SYSTEM_ID, lead.companyId,
    `${lead.ref} assigned to ${winner.name} (lowest score ${min}${group.length > 1 ? `, ${group.length} agents in the group` : ''}${trace.allGroupUnavailable ? ', all Unavailable — assigned inside the group' : ''}${trace.tieBreak ? ', tie broken by rotation' : ''}${inShift ? '' : ', off-time — no SLA'})`,
    { leadId: lead.id, agentId: winner.id })
  return trace
}

// ---------------------------------------------------------------- clock & SLA (P1-FR-003)

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
 * the Lead is assigned, and the owner is Available (AC-P1-003-2/3).
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
      notify(S, 'shift-start', null, `Shift started · ${pktDateKey(nb)}`, 'Mark any Absent agents. Their pending, unworked off-time Leads will be released and redistributed (P1-FR-003). Active opportunities and bookings stay with their owner.')
    }
  }
  S.clock.now = t1
  salesTick(S)
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
  /** referral: SAL-FR-001 — assigned to the agent who owns the referring customer */
  assignment: { mode: 'auto' } | { mode: 'manual'; agentId: string } | { mode: 'referral'; agentId: string; fromLeadId: string }
  /** SAL-FR-001: kept with the Lead and turned into a UK-local contact task on assignment */
  preferredContact?: PreferredContact | null
}

export function createLead(S: AppData, input: NewLeadInput, actorId: string): Lead {
  if (input.assignment.mode === 'manual' && actorId !== SYSTEM_ID) {
    const actor = userById(S, actorId)
    // AC-P1-002-11: manual assignment at entry needs the Reassignment permission for that company
    if (!actor || !canAssign(S, actor, input.companyId)) throw new Error('Manual assignment needs the Reassignment permission for this company')
  }
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
    preferredContact: input.preferredContact ?? null,
  }
  S.leads.push(lead)
  createOpportunity(S, lead) // SAL-FR-001: every Lead is also a Sales opportunity (stage New)
  audit(S, 'lead-created', actorId, lead.companyId, `${lead.ref} created from ${SOURCE_LABEL[lead.source]}${lead.campaignId ? '' : ' (no campaign data)'}`, { leadId: lead.id })
  if (input.assignment.mode === 'manual') {
    manualAssign(S, lead.id, input.assignment.agentId, actorId)
  } else if (input.assignment.mode === 'referral') {
    const agentId = input.assignment.agentId
    lead.referralFromLeadId = input.assignment.fromLeadId
    // Whether a referral counts toward the fair-distribution score is not stated in v1.4 (pending decision).
    S.assignments.push({ id: nextId(S, 'as'), leadId: lead.id, agentId, companyId: lead.companyId, at: t, kind: 'referral', counted: S.params.referralCountsTowardFairness, voided: false })
    setOwner(S, lead, agentId, 'referral', actorId, 'Referral — assigned to the agent who owns the referring customer')
    audit(S, 'referral', actorId, lead.companyId, `${lead.ref} (referral) assigned to ${userName(S, agentId)}, owner of the referring customer`, { leadId: lead.id, agentId })
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

// ---------------------------------------------------------------- manual controls (P1-FR-002)

/** Assign (to an agent), unassign (null) or reassign. Manual assignment skips the eligibility filters. */
export function manualAssign(S: AppData, leadId: string, toAgentId: string | null, actorId: string, reason?: string): Result {
  const lead = S.leads.find((l) => l.id === leadId)
  if (!lead) return fail('Lead not found')
  const actor = userById(S, actorId)
  // AC-P1-002-11 / AC-SAL-008-1: blocked for users without Reassignment permission or from another company
  if (!actor || !canAssign(S, actor, lead.companyId)) return fail('Permission denied — changing ownership needs the Reassignment permission for this company')
  if (S.params.requireReassignReason && lead.ownerId && toAgentId && !reason?.trim()) return fail('A reason is required for a reassignment (pending decision switched on)')
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
  if (toAgentId) {
    S.assignments.push({ id: nextId(S, 'as'), leadId: lead.id, agentId: toAgentId, companyId: lead.companyId, at: S.clock.now, kind: 'manual', counted: S.params.manualCountsTowardFairness, voided: false })
  }
  setOwner(S, lead, toAgentId, kind, actorId, reason?.trim() || undefined)

  if (!toAgentId || S.params.slaRestartsOnReassign) {
    lead.slaCountedMs = toAgentId ? 0 : lead.slaCountedMs
    lead.slaAlertAt = null
    clearSlaAlerts(S, lead.id)
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

// ---------------------------------------------------------------- availability & absence (P1-FR-002, P1-FR-003)

/** Only agents set their own Available/Unavailable (AC-P3-001-5). Audit-logged (AC-P1-003-9). */
export function setAvailability(S: AppData, agentId: string, value: 'available' | 'unavailable', actorId: string): Result {
  const a = userById(S, agentId)
  if (!a || a.role !== 'agent') return fail('Agent not found')
  if (actorId !== agentId) return fail('Agents set their own Available or Unavailable status')
  if (a.availability === value) return ok()
  a.availability = value
  audit(S, 'availability', actorId, a.companyIds[0], `${a.name} set themselves ${value === 'available' ? 'Available' : 'Unavailable'}${isShiftTime(S.clock.now) ? '' : ' (off-time)'}`, { agentId })
  return ok()
}

/**
 * Manager or Admin marks an agent Absent for the shift (AC-P1-002-2, AC-P3-001-4). Pending off-time Leads the agent
 * owns that are still unworked (no first contact, Sales stage New, no contact attempt) become Unassigned and are
 * redistributed; the new owner gets the count (AC-P1-003-8, AC-P1-002-9). Active opportunities and bookings keep
 * their owner (AC-SAL-001-8).
 */
export function setAbsent(S: AppData, agentId: string, absent: boolean, actorId: string): Result {
  const a = userById(S, agentId)
  if (!a || a.role !== 'agent') return fail('Agent not found')
  const actor = userById(S, actorId)
  if (!actor || !(actor.role === 'admin' || (actor.role === 'manager' && actor.companyIds.includes(a.companyIds[0])))) return fail('Only a Manager or Admin can mark an agent Absent')
  const t = S.clock.now
  if (!isShiftTime(t)) return fail('Absent is marked at shift start, during the shift (14:00–22:00 PKT)')
  if (absent === isAbsent(a, t)) return ok()
  a.absentShiftKey = absent ? shiftKey(t) : null
  audit(S, 'absent', actorId, a.companyIds[0], `${a.name} marked ${absent ? 'Absent' : 'back at work'} for the ${shiftKey(t)} shift`, { agentId })
  if (!absent) return ok()

  const pending = S.leads.filter((l) => l.ownerId === a.id && l.assignedInOffTime && isUnworked(S, l))
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

/**
 * Starting score for an agent added later. v1.4: "what score a newly added agent starts with" is to be confirmed.
 * PLACEHOLDER (product-owner choice, 19 Nov 2026): the average current score of the company's agents, rounded.
 */
export function newAgentBaseline(S: AppData, companyId: CompanyId) {
  const agents = companyAgents(S, companyId)
  if (agents.length === 0) return { baseline: 0, average: 0, agents: 0 }
  const scores = agents.map((a) => fairnessScore(S, a.id).score)
  const average = scores.reduce((x, y) => x + y, 0) / scores.length
  return { baseline: Math.round(average), average, agents: agents.length }
}

export function addAgent(S: AppData, input: { name: string; companyId: CompanyId }, actorId: string): Result {
  const name = input.name.trim()
  if (!name) return fail('Enter the agent’s name')
  const actor = userById(S, actorId)
  if (!actor || actor.role !== 'admin') return fail('Only the Admin configures company teams')
  const { baseline, average, agents } = newAgentBaseline(S, input.companyId)
  const roster = companyAgents(S, input.companyId)
  const user: User = {
    id: nextId(S, 'u'), name, role: 'agent', title: 'Sales Agent', companyIds: [input.companyId], viewOnlyCompanyIds: [],
    availability: 'available', absentShiftKey: null, joinedAt: S.clock.now,
    rosterOrder: (roster.at(-1)?.rosterOrder ?? 0) + 1, permissions: [],
  }
  S.users.push(user)
  S.offsets.push({ agentId: user.id, offset: baseline, at: S.clock.now, baselineNote: agents ? `Team average of ${agents} agent scores = ${average.toFixed(2)}, rounded (placeholder)` : 'No existing agents — starts at 0 (placeholder)' })
  audit(S, 'agent-added', actorId, input.companyId, `${name} added to ${companyName(S, input.companyId)} with starting score ${baseline} (placeholder — to be confirmed)`, { agentId: user.id })
  return ok(user.id)
}

/** Admin grants or removes the separate Reassignment and Booking Margin Override permissions (SAL-FR-008). */
export function setPermissions(S: AppData, userId: string, permissions: Permission[], actorId: string): Result {
  const actor = userById(S, actorId)
  if (!actor || actor.role !== 'admin') return fail('Only the Admin manages permissions')
  const u = userById(S, userId)
  if (!u) return fail('User not found')
  if (u.role === 'admin') return fail('Admin holds every permission by default')
  const before = u.permissions.join(', ') || 'none'
  u.permissions = [...new Set(permissions)]
  audit(S, 'permission', actorId, null, `${u.name}: permissions changed from ${before} to ${u.permissions.join(', ') || 'none'}`)
  return ok()
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

/** Writes the shared funnel status and its history. Used by the agent (setStatus) and by Sales booking / Lost sync. */
export function applyFunnelStatus(S: AppData, lead: Lead, to: FunnelStatus, actorId: string, lossReason?: string) {
  if (lead.status === to && to !== 'lost') return
  const from = lead.status
  lead.status = to
  lead.lossReason = to === 'lost' ? (lossReason ?? '').trim() : null
  lead.statusHistory.push({ at: S.clock.now, from, to, byUserId: actorId, lossReason: to === 'lost' ? lossReason?.trim() : undefined })
  if (to === 'booked' || to === 'lost') clearSlaAlerts(S, lead.id)
  audit(S, 'status', actorId, lead.companyId, `${lead.ref} funnel status ${from} → ${to}${to === 'lost' ? ` (“${lossReason?.trim()}”)` : ''}`, { leadId: lead.id })
}

/**
 * The owning agent sets the shared funnel status (P2-FR-001). Product-owner decision (19 Nov 2026):
 * Booked Lead is set only by the CRM when a Booking is created (SAL-FR-004), and Lost mirrors the Sales
 * opportunity's Lost with the same reason. Mature and Hot stay agent-set until the stage mapping is confirmed.
 */
export function setStatus(S: AppData, leadId: string, to: FunnelStatus, actorId: string, lossReason?: string): Result {
  const lead = S.leads.find((l) => l.id === leadId)
  if (!lead) return fail('Lead not found')
  if (lead.ownerId !== actorId) return fail('Only the owning Sales Agent maintains the funnel status')
  if (lead.status === to && to !== 'lost') return ok()
  if (to === 'booked') return fail('Booked Lead is set automatically when Accounts confirms payment and a Booking is created (SAL-FR-004)')
  if (lead.status === 'booked') return fail('This Lead has a Booking. A Booking is never cancelled from the funnel — refunds go through Accounts')
  if (to === 'lost' && !lossReason?.trim()) return fail('A loss reason is required to save Lost')
  if (lead.status === 'lost' && to !== 'lost' && !S.params.allowReopenLost) return fail('Reopening a Lost Lead is not allowed (pending decision)')
  const fromIdx = FUNNEL_ORDER.indexOf(lead.status)
  const toIdx = FUNNEL_ORDER.indexOf(to)
  if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx && !S.params.allowBackwardStatus) return fail('Moving a Lead backward is not allowed (pending decision)')
  const wasLost = lead.status === 'lost'
  applyFunnelStatus(S, lead, to, actorId, lossReason)
  if (to === 'lost' || wasLost) syncLostToSales(S, lead, actorId)
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

// ---------------------------------------------------------------- integrations (P3-FR-002)

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
  /** SAL-FR-001: a preferred contact time captured by the form, where provided */
  preferredContact?: PreferredContact | null
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
  const lead = createLead(S, { companyId, source: p.source, fields: p.fields, campaignId: p.campaignId, adId: p.adId, externalEventId: p.externalId, assignment: { mode: 'auto' }, preferredContact: p.preferredContact ?? null }, SYSTEM_ID)
  return lead.id
}

/**
 * Receive an external event. A repeated delivery of the same event is one record, not two (AC-P3-002-2).
 * A failing connection never drops an event silently: it is flagged (AC-P3-002-6).
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
