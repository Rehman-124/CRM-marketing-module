import { describe, expect, test, beforeEach } from 'vitest'
import { createBaseData, buildSeed } from '@/domain/seed'
import * as E from '@/domain/engine'
import * as SA from '@/domain/sales'
import type { AppData, CompanyId, CustomerFields } from '@/domain/types'
import { fromPkt, HOUR, MIN } from '@/lib/time'
import { byPeriod, derived, filterLeads, funnel, lossBreakdown, sumMoney, type ReportFilters } from '@/domain/reports'
import { canAssign, canManageEnquiry, canSetAbsent, canSetOwnAvailability, canViewLead } from '@/domain/permissions'
import { refreshInsights } from '@/domain/insights'

const F: CustomerFields = { nationality: 'British', fullName: 'Test Person', phone: '+44 7000 000000', email: 't@example.com', city: 'London', tripDetails: '' }
let S: AppData
const FN: CompanyId = 'flightnest'
const agents = () => E.companyAgents(S, FN)
const newLead = (c: CompanyId = FN, source: 'website' | 'meta_form' = 'website') => E.createLead(S, { companyId: c, source, fields: F, assignment: { mode: 'auto' } }, 'system')
const contactAll = () => { for (const l of S.leads) if (l.ownerId && !l.firstContactAt) E.recordFirstContact(S, l.id, l.ownerId) }
const setScores = (D: AppData, scores: number[]) => E.companyAgents(D, FN).forEach((a, i) => D.offsets.push({ agentId: a.id, offset: scores[i], baselineNote: 'test', at: D.clock.now }))

beforeEach(() => {
  S = createBaseData()
  S.clock.now = fromPkt(2026, 10, 5, 15, 0) // shift time
})

describe('P1-FR-002 company routing & fair distribution (v1.4)', () => {
  test('AC-P1-002-1: only own-company agents are considered', () => {
    const l = newLead()
    expect(l.lastTrace!.pool.every((id) => E.userById(S, id)!.companyIds[0] === FN)).toBe(true)
    expect(E.userById(S, l.ownerId)!.companyIds[0]).toBe(FN)
  })

  test('AC-P1-002-2 / AC-P3-001-4/5: Manager or Admin marks Absent; agents set only their own availability', () => {
    const [a1, a2] = agents()
    expect(E.setAbsent(S, a1.id, true, 'u-mgr').ok).toBe(true)
    expect(E.setAbsent(S, a2.id, true, 'u-tl-flightnest').ok).toBe(false)
    expect(E.setAbsent(S, a2.id, true, a2.id).ok).toBe(false)
    expect(E.setAvailability(S, a2.id, 'unavailable', a1.id).ok).toBe(false)
    expect(E.setAvailability(S, a2.id, 'unavailable', a2.id).ok).toBe(true)
  })

  test('AC-P1-002-3: Absent agents are excluded; only the lowest-score group is considered', () => {
    const [a1, a2, a3, a4] = agents()
    setScores(S, [0, 0, 1, 1])
    E.setAbsent(S, a1.id, true, 'u-admin')
    const l = newLead()
    expect(l.lastTrace!.removedAbsent).toEqual([a1.id])
    expect(l.lastTrace!.group).toEqual([a2.id])
    expect(l.ownerId).toBe(a2.id)
    expect([a3.id, a4.id]).not.toContain(l.ownerId)
  })

  test('AC-P1-002-5/6: FRD example — A (6, Unavailable), B (6, Unavailable), C (7, Available), D (8, Available) → A or B', () => {
    const [A, B, C, D] = agents()
    setScores(S, [6, 6, 7, 8])
    E.setAvailability(S, A.id, 'unavailable', A.id)
    E.setAvailability(S, B.id, 'unavailable', B.id)
    const l = newLead()
    expect([A.id, B.id]).toContain(l.ownerId)
    expect([C.id, D.id]).not.toContain(l.ownerId)
    expect(l.lastTrace!.allGroupUnavailable).toBe(true)
    expect([...l.lastTrace!.group].sort()).toEqual([A.id, B.id].sort())
  })

  test('AC-P1-002-4: during shift an Available agent inside the group is preferred', () => {
    const [A, B] = agents()
    setScores(S, [6, 6, 7, 8])
    E.setAvailability(S, A.id, 'unavailable', A.id)
    const l = newLead()
    expect(l.ownerId).toBe(B.id)
    expect(l.lastTrace!.availableInGroup).toEqual([B.id])
  })

  test('AC-P1-002-7: ties rotate between agents', () => {
    const owners: string[] = []
    for (let i = 0; i < 4; i++) { owners.push(newLead().ownerId!); contactAll() }
    expect(new Set(owners).size).toBe(4)
    expect(S.leads.slice(0, 3).every((l) => l.lastTrace!.tieBreak)).toBe(true)
    // Second round: everyone tied again. Rotation continues after the last tie winner, so agent 4 is picked, not agent 1.
    const fifth = newLead()
    expect(fifth.lastTrace!.tieBreak).toBe(true)
    expect(fifth.ownerId).toBe(agents()[3].id)
  })

  test('AC-P1-002-8: scores carry across days and months — no automatic reset', () => {
    for (let i = 0; i < 8; i++) { newLead(); contactAll() }
    expect(agents().map((a) => E.fairnessScore(S, a.id).score)).toEqual([2, 2, 2, 2])
    E.advanceTo(S, S.clock.now + 24 * HOUR)
    expect(agents().map((a) => E.fairnessScore(S, a.id).score)).toEqual([2, 2, 2, 2])
    E.advanceTo(S, fromPkt(2026, 11, 2, 15, 0))
    expect(agents().map((a) => E.fairnessScore(S, a.id).score)).toEqual([2, 2, 2, 2])
  })

  test('Placeholder: a new agent starts at the team average score; only the Admin configures teams', () => {
    for (let i = 0; i < 8; i++) { newLead(); contactAll() }
    expect(E.addAgent(S, { name: 'New Agent', companyId: FN }, 'u-mgr').ok).toBe(false)
    E.addAgent(S, { name: 'New Agent', companyId: FN }, 'u-admin')
    const na = agents().at(-1)!
    expect(E.fairnessScore(S, na.id)).toEqual({ count: 0, offset: 2, score: 2 })
  })

  test('Placeholder: every agent Absent → Unassigned and Managers notified', () => {
    for (const a of agents()) E.setAbsent(S, a.id, true, 'u-admin')
    const l = newLead()
    expect(l.ownerId).toBeNull()
    expect(S.notifications.some((n) => n.type === 'no-eligible' && n.leadId === l.id)).toBe(true)
  })

  test('Trip2GoGlobal has no agents → Leads stay Unassigned', () => {
    expect(newLead('trip2goglobal').ownerId).toBeNull()
  })

  test('AC-P1-002-10/11: Reassignment permission holders assign, unassign and reassign with history; others are blocked', () => {
    for (const a of agents()) E.setAbsent(S, a.id, true, 'u-admin')
    const l = newLead()
    for (const a of agents()) E.setAbsent(S, a.id, false, 'u-admin')
    const [a1, a2] = agents()
    expect(E.manualAssign(S, l.id, a1.id, 'u-tl-flightnest').ok).toBe(false) // Team Lead: no permission by default
    expect(E.manualAssign(S, l.id, a1.id, 'u-mkt1').ok).toBe(false)
    expect(E.manualAssign(S, l.id, a1.id, 'u-mgr').ok).toBe(true) // Manager is assigned the permission
    expect(E.manualAssign(S, l.id, a2.id, 'u-admin', 'cover').ok).toBe(true) // Admin holds it by default
    expect(E.manualAssign(S, l.id, null, 'u-admin').ok).toBe(true)
    expect(l.ownershipHistory.map((h) => h.kind)).toEqual(['unassigned-no-eligible', 'manual-assign', 'manual-reassign', 'manual-unassign'])
    expect(l.ownershipHistory[2].fromAgentId).toBe(a1.id)
    expect(l.ownershipHistory[2].byUserId).toBe('u-admin')
    expect(E.manualAssign(S, l.id, E.companyAgents(S, 'holidaynest')[0].id, 'u-admin').ok).toBe(false)
    // granting the permission (Admin only) lets a Team Lead act inside their own company only
    expect(E.setPermissions(S, 'u-tl-flightnest', ['reassignment'], 'u-mgr').ok).toBe(false)
    expect(E.setPermissions(S, 'u-tl-flightnest', ['reassignment'], 'u-admin').ok).toBe(true)
    expect(E.manualAssign(S, l.id, a1.id, 'u-tl-flightnest').ok).toBe(true)
    expect(canAssign(S, E.userById(S, 'u-tl-flightnest')!, 'holidaynest')).toBe(false)
  })
})

describe('P1-FR-003 shift, off-time and SLA', () => {
  test('AC-P1-003-2: off-time assigns by fair share, ignoring availability, with no SLA', () => {
    S.clock.now = fromPkt(2026, 10, 5, 23, 0)
    for (const a of agents()) E.setAvailability(S, a.id, 'unavailable', a.id)
    const l = newLead()
    expect(l.ownerId).not.toBeNull()
    E.advanceTo(S, fromPkt(2026, 10, 6, 13, 59))
    expect(l.slaCountedMs).toBe(0)
    expect(l.slaAlertAt).toBeNull()
  })

  test('Off-time Lead starts its SLA at shift start when the owner is Available', () => {
    S.clock.now = fromPkt(2026, 10, 5, 23, 0)
    const l = newLead()
    E.advanceTo(S, fromPkt(2026, 10, 6, 14, 30))
    expect(l.slaCountedMs).toBe(30 * MIN)
  })

  test('AC-P1-003-3/5/7: pause while Unavailable, alert after one counted hour, never reassigned', () => {
    const l = newLead()
    const owner = l.ownerId!
    E.advanceTo(S, S.clock.now + 40 * MIN)
    E.setAvailability(S, owner, 'unavailable', owner)
    E.advanceTo(S, S.clock.now + 60 * MIN)
    expect(l.slaCountedMs).toBe(40 * MIN)
    expect(l.slaAlertAt).toBeNull()
    E.setAvailability(S, owner, 'available', owner)
    E.advanceTo(S, S.clock.now + 25 * MIN)
    expect(l.slaAlertAt).not.toBeNull()
    expect(S.notifications.some((n) => n.type === 'sla' && n.leadId === l.id)).toBe(true)
    expect(l.ownerId).toBe(owner)
  })

  test('AC-P1-003-4: a Lead assigned to an Unavailable owner raises no alert until they are Available', () => {
    for (const a of agents()) E.setAvailability(S, a.id, 'unavailable', a.id)
    const l = newLead()
    expect(l.ownerId).not.toBeNull()
    E.advanceTo(S, S.clock.now + 3 * HOUR)
    expect(l.slaCountedMs).toBe(0)
    expect(l.slaAlertAt).toBeNull()
  })

  test('AC-P1-003-1: no alert for an Unassigned Lead', () => {
    for (const a of agents()) E.setAbsent(S, a.id, true, 'u-admin')
    const l = newLead()
    E.advanceTo(S, S.clock.now + 3 * HOUR)
    expect(l.slaAlertAt).toBeNull()
  })

  test('AC-P1-003-6: first contact stops the timer and clears the alert', () => {
    const l = newLead()
    E.advanceTo(S, S.clock.now + 70 * MIN)
    expect(S.notifications.find((n) => n.leadId === l.id && n.type === 'sla')!.cleared).toBe(false)
    E.recordFirstContact(S, l.id, l.ownerId!)
    const counted = l.slaCountedMs
    E.advanceTo(S, S.clock.now + 30 * MIN)
    expect(l.slaCountedMs).toBe(counted)
    expect(S.notifications.find((n) => n.leadId === l.id && n.type === 'sla')!.cleared).toBe(true)
  })

  test('AC-P1-003-8 / AC-P1-002-9 / AC-SAL-001-8: unworked off-time Leads of an Absent agent move and count for the new owner; worked ones stay', () => {
    S.clock.now = fromPkt(2026, 10, 5, 23, 0)
    const leads = [newLead(), newLead(), newLead(), newLead(), newLead(), newLead()]
    const absentee = leads[0].ownerId!
    const worked = leads.find((l, i) => i > 0 && l.ownerId === absentee)!
    const o = S.opportunities.find((x) => x.leadId === worked.id)!
    expect(SA.logAttempt(S, o.id, { channel: 'whatsapp', outcome: 'answered' }, absentee).ok).toBe(true)
    E.advanceTo(S, fromPkt(2026, 10, 6, 14, 2))
    E.setAbsent(S, absentee, true, 'u-admin')
    expect(leads[0].ownerId).not.toBe(absentee)
    expect(leads[0].ownershipHistory.some((h) => h.kind === 'released-absent')).toBe(true)
    expect(worked.ownerId).toBe(absentee) // active opportunity keeps its owner
    expect(E.assignmentCount(S, absentee)).toBe(1)
    expect(E.assignmentCount(S, leads[0].ownerId!)).toBe(2)
    expect(S.audit.some((a) => a.type === 'absent')).toBe(true)
  })

  test('AC-P1-003-9: availability changes and manual reassignments are audit-logged', () => {
    const a = agents()[0]
    E.setAvailability(S, a.id, 'unavailable', a.id)
    expect(S.audit.at(-1)!.type).toBe('availability')
    const l = newLead()
    E.manualAssign(S, l.id, agents().find((x) => x.id !== l.ownerId)!.id, 'u-mgr')
    expect(S.audit.at(-1)!.type).toBe('manual-reassign')
  })
})

describe('P1-FR-001 capture & social qualification', () => {
  test('AC-P1-001-3/4/5/6: DM creates an Unqualified Enquiry outside distribution', () => {
    const e = E.createEnquiry(S, { companyId: FN, channel: 'instagram_dm', handle: '@x', text: 'Can I know more?' })
    expect(S.leads.length).toBe(0)
    expect(S.assignments.length).toBe(0)
    expect(E.convertEnquiry(S, e.id, 'u-mkt1').ok).toBe(false) // required fields missing
    e.fields = { ...F }
    expect(E.convertEnquiry(S, e.id, 'u-mkt1').ok).toBe(true)
    const l = S.leads[0]
    expect(l.companyId).toBe(FN)
    expect(l.source).toBe('instagram_dm')
    expect(l.campaignId).toBeNull()
    expect(l.ownerId).not.toBeNull()
  })

  test('AC-P3-002-2/6: a repeated Meta delivery does not create a second Lead; a failing connection flags events', () => {
    const p = { kind: 'lead' as const, source: 'meta_form' as const, fields: F, campaignId: 'cmp-flightnest-1', adId: 'cmp-flightnest-1-ad1', externalId: 'leadgen_1' }
    E.receiveExternalEvent(S, FN, p)
    E.receiveExternalEvent(S, FN, p)
    expect(S.leads.length).toBe(1)
    expect(S.leads[0].campaignId).toBe('cmp-flightnest-1')
    E.setConnectionError(S, 'cn-flightnest-meta_forms', 'down')
    const r = E.receiveExternalEvent(S, FN, { ...p, externalId: 'leadgen_2' })
    expect(r.outcome).toBe('flagged')
    expect(S.failedEvents.length).toBe(1)
    E.setConnectionState(S, 'cn-flightnest-meta_forms', 'recovered')
    expect(S.leads.length).toBe(2)
  })
})

describe('P2-FR-001 outcomes', () => {
  test('AC-P2-001-2/4: Lost needs a reason; history keeps date and user; Lost mirrors to Sales', () => {
    const l = newLead()
    const owner = l.ownerId!
    expect(E.setStatus(S, l.id, 'lost', owner).ok).toBe(false)
    expect(E.setStatus(S, l.id, 'mature', owner).ok).toBe(true)
    expect(E.setStatus(S, l.id, 'lost', owner, 'Price too high').ok).toBe(true)
    expect(l.statusHistory.map((h) => h.to)).toEqual(['lead', 'mature', 'lost'])
    expect(l.statusHistory[2].byUserId).toBe(owner)
    expect(E.setStatus(S, l.id, 'hot', 'u-admin').ok).toBe(false)
    const o = S.opportunities.find((x) => x.leadId === l.id)!
    expect(o.stage).toBe('lost')
    expect(o.lossReason).toBe('Price too high')
  })

  test('Booked Lead is never set by hand — only by a Booking (product-owner decision 19 Nov 2026)', () => {
    const l = newLead()
    expect(E.setStatus(S, l.id, 'booked', l.ownerId!).ok).toBe(false)
    expect(l.status).toBe('lead')
  })
})

describe('P3-FR-001 permissions', () => {
  test('roles and company scope', () => {
    const l = newLead()
    const owner = E.userById(S, l.ownerId)!
    const other = agents().find((a) => a.id !== owner.id)!
    const admin = E.userById(S, 'u-admin')!
    const mgr = E.userById(S, 'u-mgr')!
    const mkt1 = E.userById(S, 'u-mkt1')!
    expect(canViewLead(S, owner, l)).toBe(true)
    expect(canViewLead(S, other, l)).toBe(false)
    expect(canSetAbsent(admin)).toBe(true)
    expect(canSetAbsent(mgr)).toBe(true)
    expect(canSetAbsent(E.userById(S, 'u-tl-flightnest')!)).toBe(false)
    expect(canSetOwnAvailability(owner, other.id)).toBe(false)
    const tvEnquiry = E.createEnquiry(S, { companyId: 'travelope', channel: 'facebook_dm', handle: '@y', text: 'hi' })
    expect(canManageEnquiry(mkt1, tvEnquiry)).toBe(false) // view-only company
    expect(canAssign(S, E.userById(S, 'u-tl-holidaynest')!, FN)).toBe(false)
    expect(canAssign(S, mgr, FN)).toBe(true)
  })
})

describe('P2-FR-002 reporting on the seeded demo', () => {
  const D = buildSeed()
  refreshInsights(D)
  const f: ReportFilters = { from: '2026-09-01', to: '2026-10-17', companies: D.companies.map((c) => c.id), campaignId: 'all', adId: 'all', source: 'all' }
  test('AC-P2-002-4: daily, weekly and monthly totals agree', () => {
    const total = funnel(filterLeads(D, f)).total
    for (const p of ['daily', 'weekly', 'monthly'] as const) {
      const rows = byPeriod(D, f, p)
      expect(rows.reduce((a, r) => a + r.counts.total, 0)).toBe(total)
      expect(sumMoney(rows.map((r) => r.meta.spend))).toBe(sumMoney(byPeriod(D, f, 'daily').map((r) => r.meta.spend)))
    }
  })
  test('AC-P2-002-9: loss breakdown matches Lost Leads', () => {
    const leads = filterLeads(D, f)
    expect(lossBreakdown(leads).reduce((a, r) => a + r.count, 0)).toBe(funnel(leads).lost)
  })
  test('AC-P2-002-5: CPL and cost per booking are N/A without inputs', () => {
    const d = derived({ spend: 100, impressions: 1000, reach: 800, clicks: 10, results: 0, days: 1 }, { total: 0, lead: 0, mature: 0, hot: 0, booked: 0, lost: 0 })
    expect(d.cpl).toBeNull()
    expect(d.costPerBooking).toBeNull()
    expect(derived(null, funnel([])).cpl).toBeNull()
  })
  test('Sales feeds the shared funnel: Booked and Lost always agree between Sales stage and funnel status', () => {
    for (const o of D.opportunities) {
      const l = D.leads.find((x) => x.id === o.leadId)!
      expect(o.stage === 'booked').toBe(l.status === 'booked')
      expect(o.stage === 'lost').toBe(l.status === 'lost')
    }
  })
})
