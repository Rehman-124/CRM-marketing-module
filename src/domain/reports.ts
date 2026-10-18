// Marketing reporting (P2-FR-002). Every figure comes from the same live CRM data
// plus the latest (simulated) Meta insights, so daily, weekly and monthly views agree.

import type { AppData, CompanyId, FunnelStatus, InsightRow, Lead, LeadSource } from './types'
import { pktDateKey, weekKey, monthKey, dateKeyToStart, DAY } from '../lib/time'

export type Period = 'daily' | 'weekly' | 'monthly'

export interface ReportFilters {
  from: string // YYYY-MM-DD inclusive (PKT)
  to: string // YYYY-MM-DD inclusive (PKT)
  companies: CompanyId[]
  campaignId: string | 'all'
  adId: string | 'all'
  source: LeadSource | 'all'
}

export type StatusCounts = Record<FunnelStatus, number> & { total: number }

export interface MetaTotals { spend: number; impressions: number; reach: number; clicks: number; results: number; days: number }

export const emptyCounts = (): StatusCounts => ({ total: 0, lead: 0, mature: 0, hot: 0, booked: 0, lost: 0 })
const emptyMeta = (): MetaTotals => ({ spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, days: 0 })

function addLead(c: StatusCounts, l: Lead) { c.total += 1; c[l.status] += 1 }
/** Money is summed to the penny so every view (daily/weekly/monthly, campaign/ad) gives identical totals. */
export const addMoney = (a: number, b: number) => Math.round((a + b) * 100) / 100
export const sumMoney = (xs: number[]) => xs.reduce(addMoney, 0)

function addRow(m: MetaTotals, r: InsightRow) { m.spend = addMoney(m.spend, r.spend); m.impressions += r.impressions; m.reach += r.reach; m.clicks += r.clicks; m.results += r.results; m.days += 1 }

export function periodKey(p: Period, t: number) {
  return p === 'daily' ? pktDateKey(t) : p === 'weekly' ? weekKey(t) : monthKey(t)
}

export function filterLeads(S: AppData, f: ReportFilters): Lead[] {
  const from = dateKeyToStart(f.from)
  const to = dateKeyToStart(f.to) + DAY
  return S.leads.filter((l) =>
    l.createdAt >= from && l.createdAt < to &&
    f.companies.includes(l.companyId) &&
    (f.source === 'all' || l.source === f.source) &&
    (f.campaignId === 'all' || l.campaignId === f.campaignId) &&
    (f.adId === 'all' || l.adId === f.adId))
}

/** Meta insights apply to Meta ads; a non-Meta source filter has no ad spend. */
export function metaApplies(f: ReportFilters) { return f.source === 'all' || f.source === 'meta_form' }

export function filterInsights(S: AppData, f: ReportFilters): InsightRow[] {
  if (!metaApplies(f)) return []
  const ads = new Map(S.ads.map((a) => [a.id, a]))
  const camps = new Map(S.campaigns.map((c) => [c.id, c]))
  return S.insights.filter((r) => {
    if (r.date < f.from || r.date > f.to) return false
    const ad = ads.get(r.adId)
    const camp = ad && camps.get(ad.campaignId)
    if (!ad || !camp || !f.companies.includes(camp.companyId)) return false
    if (f.campaignId !== 'all' && camp.id !== f.campaignId) return false
    if (f.adId !== 'all' && ad.id !== f.adId) return false
    return true
  })
}

export function funnel(leads: Lead[]): StatusCounts {
  const c = emptyCounts()
  for (const l of leads) addLead(c, l)
  return c
}

export function byPeriod(S: AppData, f: ReportFilters, p: Period) {
  const leads = filterLeads(S, f)
  const rows = filterInsights(S, f)
  const map = new Map<string, { key: string; counts: StatusCounts; attributed: StatusCounts; meta: MetaTotals; lost: Record<string, number> }>()
  const get = (k: string) => { let v = map.get(k); if (!v) { v = { key: k, counts: emptyCounts(), attributed: emptyCounts(), meta: emptyMeta(), lost: {} }; map.set(k, v) } return v }
  for (const l of leads) {
    const g = get(periodKey(p, l.createdAt))
    addLead(g.counts, l)
    if (l.campaignId) addLead(g.attributed, l)
    if (l.status === 'lost') g.lost[l.lossReason ?? 'Unknown'] = (g.lost[l.lossReason ?? 'Unknown'] ?? 0) + 1
  }
  for (const r of rows) addRow(get(periodKey(p, dateKeyToStart(r.date))).meta, r)
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export interface MetaRow {
  id: string
  name: string
  level: 'campaign' | 'ad' | 'unattributed'
  companyId: CompanyId | null
  meta: MetaTotals | null
  counts: StatusCounts
  children?: MetaRow[]
}

export function metaPerformance(S: AppData, f: ReportFilters): MetaRow[] {
  const leads = filterLeads(S, f)
  const rows = filterInsights(S, f)
  const campaigns = S.campaigns.filter((c) => f.companies.includes(c.companyId) && (f.campaignId === 'all' || c.id === f.campaignId))
  const out: MetaRow[] = campaigns.map((c) => {
    const ads = S.ads.filter((a) => a.campaignId === c.id && (f.adId === 'all' || a.id === f.adId))
    const children: MetaRow[] = ads.map((a) => {
      const m = emptyMeta()
      for (const r of rows) if (r.adId === a.id) addRow(m, r)
      return { id: a.id, name: a.name, level: 'ad', companyId: c.companyId, meta: m, counts: funnel(leads.filter((l) => l.adId === a.id)) }
    })
    const m = emptyMeta()
    for (const ch of children) { m.spend = addMoney(m.spend, ch.meta!.spend); m.impressions += ch.meta!.impressions; m.reach += ch.meta!.reach; m.clicks += ch.meta!.clicks; m.results += ch.meta!.results; m.days = Math.max(m.days, ch.meta!.days) }
    return { id: c.id, name: c.name, level: 'campaign', companyId: c.companyId, meta: m, counts: funnel(leads.filter((l) => l.campaignId === c.id)), children }
  })
  if (f.campaignId === 'all' && f.adId === 'all') {
    out.push({ id: 'unattributed', name: 'Unattributed', level: 'unattributed', companyId: null, meta: null, counts: funnel(leads.filter((l) => !l.campaignId)) })
  }
  return out
}

export function lossBreakdown(leads: Lead[]) {
  const map = new Map<string, number>()
  for (const l of leads) if (l.status === 'lost') map.set(l.lossReason ?? 'Unknown', (map.get(l.lossReason ?? 'Unknown') ?? 0) + 1)
  return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
}

// ---------------- derived metrics: shown as N/A when inputs are missing or zero (AC-P2-002-5)

export const safeDiv = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a == null || b == null || b === 0 ? null : a / b

export function derived(meta: MetaTotals | null, counts: StatusCounts) {
  const hasMeta = !!meta && meta.days > 0
  return {
    ctr: hasMeta ? safeDiv(meta!.clicks, meta!.impressions) : null,
    cpc: hasMeta ? safeDiv(meta!.spend, meta!.clicks) : null,
    cpm: hasMeta ? safeDiv(meta!.spend * 1000, meta!.impressions) : null,
    frequency: hasMeta ? safeDiv(meta!.impressions, meta!.reach) : null,
    cpl: hasMeta ? safeDiv(meta!.spend, counts.total) : null, // CPL = spend ÷ leads
    costPerBooking: hasMeta ? safeDiv(meta!.spend, counts.booked) : null, // spend ÷ Booked Leads
  }
}
