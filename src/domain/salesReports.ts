// SAL-FR-007 Sales performance reporting (Managers and Admins only). Report layouts and filters are to be confirmed;
// the actual-margin formula below is a PLACEHOLDER built from the inputs v1.4 names (Accounts-confirmed payments,
// actual expenses and approved refunds).

import type { AppData, CompanyId, ContactOutcome, LeadSource, SalesStage } from './types'
import { ALL_SOURCES, OUTCOMES, SALES_STAGES } from './constants'
import { companyAgents } from './engine'
import { money } from './sales'
import { SLA_MS, dateKeyToStart, monthKey, DAY } from '../lib/time'

export interface SalesFilter { from: string; to: string; companies: CompanyId[]; agentId: string | 'all' }

export interface AgentRow {
  agentId: string
  companyId: CompanyId
  leads: number
  attempts: number
  answered: number
  firstContactWithinSla: number
  firstContacts: number
  bookings: number
  value: number
  expected: number
  actual: number | null
  refunds: number
  lost: number
  dormant: number
  referrals: number
}

export interface MonthRow { month: string; bookings: number; value: number; expected: number; actual: number | null; actualPendingBookings: number; refunds: number; refundAdjusted: number | null }

export function salesReport(S: AppData, f: SalesFilter) {
  const t0 = dateKeyToStart(f.from)
  const t1 = dateKeyToStart(f.to) + DAY
  const inRange = (t: number) => t >= t0 && t < t1
  const leadById = new Map(S.leads.map((l) => [l.id, l]))
  const opps = S.opportunities.filter((o) => {
    const l = leadById.get(o.leadId)!
    return f.companies.includes(o.companyId) && inRange(l.createdAt) && (f.agentId === 'all' || l.ownerId === f.agentId)
  })
  const oppIds = new Set(opps.map((o) => o.id))
  const leads = opps.map((o) => leadById.get(o.leadId)!)
  const bookings = S.bookings.filter((b) => f.companies.includes(b.companyId) && inRange(b.createdAt) && (f.agentId === 'all' || leadById.get(b.leadId)!.ownerId === f.agentId))
  const refundsApproved = S.refunds.filter((r) => r.status === 'approved' && r.decidedAt != null && inRange(r.decidedAt) && bookings.concat(S.bookings).some((b) => b.id === r.bookingId && f.companies.includes(b.companyId) && (f.agentId === 'all' || leadById.get(b.leadId)!.ownerId === f.agentId)))

  const confirmedPaid = (oppId: string) => S.payments.filter((p) => p.oppId === oppId && p.status === 'confirmed').reduce((s, p) => s + p.amount, 0)
  /** Actual margin of a booking — only when Accounts has recorded actual expenses (AC-SAL-007-4). Placeholder formula. */
  const actualOf = (bId: string): number | null => {
    const b = S.bookings.find((x) => x.id === bId)!
    if (!b.expenses.length) return null
    return money(confirmedPaid(b.oppId) - b.expenses.reduce((s, e) => s + e.amount, 0))
  }

  // ---- by agent
  const agentIds = new Set<string>()
  for (const c of f.companies) for (const a of companyAgents(S, c)) if (f.agentId === 'all' || a.id === f.agentId) agentIds.add(a.id)
  const rows: AgentRow[] = [...agentIds].map((agentId) => {
    const a = S.users.find((u) => u.id === agentId)!
    const myOpps = opps.filter((o) => leadById.get(o.leadId)!.ownerId === agentId)
    const myLeads = myOpps.map((o) => leadById.get(o.leadId)!)
    const attempts = myOpps.flatMap((o) => o.attempts)
    const myBookings = bookings.filter((b) => leadById.get(b.leadId)!.ownerId === agentId)
    const actuals = myBookings.map((b) => actualOf(b.id))
    const withActual = actuals.filter((x): x is number => x !== null)
    return {
      agentId, companyId: a.companyIds[0],
      leads: myLeads.length,
      attempts: attempts.length,
      answered: attempts.filter((x) => x.outcome === 'answered').length,
      firstContacts: myLeads.filter((l) => l.firstContactAt).length,
      firstContactWithinSla: myLeads.filter((l) => l.firstContactAt && l.slaCountedMs <= SLA_MS).length,
      bookings: myBookings.length,
      value: money(myBookings.reduce((s, b) => s + b.totalValue, 0)),
      expected: money(myBookings.reduce((s, b) => s + b.expectedMargin, 0)),
      actual: withActual.length ? money(withActual.reduce((s, x) => s + x, 0)) : null,
      refunds: money(refundsApproved.filter((r) => leadById.get(S.bookings.find((b) => b.id === r.bookingId)!.leadId)!.ownerId === agentId).reduce((s, r) => s + r.amount, 0)),
      lost: myOpps.filter((o) => o.stage === 'lost').length,
      dormant: myOpps.filter((o) => o.dormant).length,
      referrals: myLeads.filter((l) => l.source === 'referral').length,
    }
  }).sort((a, b) => b.bookings - a.bookings || b.leads - a.leads)

  // ---- leads per company and source
  const byCompany = f.companies.map((c) => ({ companyId: c, leads: leads.filter((l) => l.companyId === c).length, bookings: bookings.filter((b) => b.companyId === c).length })).filter((r) => r.leads || r.bookings)
  const bySource = ALL_SOURCES.map((s: LeadSource) => ({ source: s, leads: leads.filter((l) => l.source === s).length, booked: leads.filter((l) => l.source === s && l.status === 'booked').length })).filter((r) => r.leads)

  // ---- contact performance
  const allAttempts = opps.flatMap((o) => o.attempts)
  const outcomes = OUTCOMES.map((o: ContactOutcome) => ({ outcome: o, count: allAttempts.filter((a) => a.outcome === o).length }))

  // ---- stage conversion: how many opportunities ever reached each stage (from stage history)
  const reached = (st: SalesStage) => opps.filter((o) => o.stageHistory.some((h) => h.to === st)).length
  const stageReach = SALES_STAGES.filter((s) => s !== 'lost').map((s) => ({ stage: s, reached: reached(s), current: opps.filter((o) => o.stage === s).length }))
  const funnel = (['lead', 'mature', 'hot', 'booked', 'lost'] as const).map((s) => ({ status: s, count: leads.filter((l) => l.status === s).length }))

  // ---- loss reasons, low intent, referrals
  const lossMap = new Map<string, number>()
  for (const o of opps) if (o.stage === 'lost') lossMap.set(o.lossReason ?? 'Unknown', (lossMap.get(o.lossReason ?? 'Unknown') ?? 0) + 1)
  const losses = [...lossMap].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)

  // ---- monthly margin table (approved refunds reduce the month in which they were approved)
  const months = new Set<string>([...bookings.map((b) => monthKey(b.createdAt)), ...refundsApproved.map((r) => monthKey(r.decidedAt!))])
  const monthly: MonthRow[] = [...months].sort().map((m) => {
    const mb = bookings.filter((b) => monthKey(b.createdAt) === m)
    const acts = mb.map((b) => actualOf(b.id))
    const known = acts.filter((x): x is number => x !== null)
    const refunds = money(refundsApproved.filter((r) => monthKey(r.decidedAt!) === m).reduce((s, r) => s + r.amount, 0))
    const actual = known.length ? money(known.reduce((s, x) => s + x, 0)) : null
    return {
      month: m, bookings: mb.length, value: money(mb.reduce((s, b) => s + b.totalValue, 0)), expected: money(mb.reduce((s, b) => s + b.expectedMargin, 0)),
      actual, actualPendingBookings: acts.length - known.length, refunds, refundAdjusted: actual === null ? null : money(actual - refunds),
    }
  })

  const refundList = S.refunds.filter((r) => { const b = S.bookings.find((x) => x.id === r.bookingId)!; return f.companies.includes(b.companyId) && inRange(r.requestedAt) && (f.agentId === 'all' || leadById.get(b.leadId)!.ownerId === f.agentId) })

  return {
    totals: {
      leads: leads.length, attempts: allAttempts.length, answered: allAttempts.filter((a) => a.outcome === 'answered').length,
      bookings: bookings.length, value: money(bookings.reduce((s, b) => s + b.totalValue, 0)), expected: money(bookings.reduce((s, b) => s + b.expectedMargin, 0)),
      overrides: bookings.filter((b) => b.createdVia === 'override').length,
      lost: opps.filter((o) => o.stage === 'lost').length, dormant: opps.filter((o) => o.dormant).length, referrals: leads.filter((l) => l.source === 'referral').length,
      refundsApproved: money(refundsApproved.reduce((s, r) => s + r.amount, 0)), refundsRequested: refundList.filter((r) => r.status === 'requested').length,
      oppCount: oppIds.size,
    },
    rows, byCompany, bySource, outcomes, stageReach, funnel, losses, monthly, refundList,
  }
}
