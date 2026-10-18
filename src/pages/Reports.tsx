import { Fragment, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Filter, RefreshCw, CloudOff, ChevronRight, ChevronDown, Megaphone, TrendingDown, Layers, Info, CheckCircle2, CalendarRange, SearchX } from 'lucide-react'
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, PageHeader, PendingTag, Segmented, Select, Skeleton, SimTag, Tabs, th, td, cn } from '@/components/ui'
import { toast } from '@/components/ui/overlay'
import { CompanyTag } from '@/components/domain'
import { useAppData, useRun, useStore } from '@/store/store'
import { useScope } from '@/store/hooks'
import { refreshInsights } from '@/domain/insights'
import { byPeriod, derived, filterInsights, filterLeads, funnel, lossBreakdown, metaApplies, metaPerformance, safeDiv, sumMoney, type MetaRow, type Period, type ReportFilters, type StatusCounts } from '@/domain/reports'
import { ALL_SOURCES, ALL_STATUSES, SOURCE_LABEL, STATUS_CHART_COLOR, STATUS_LABEL, STATUS_SHORT } from '@/domain/constants'
import { DAY, fmtDateShort, fmtDateTime, fmtMonthKey, fmtRelative, dateKeyToStart, monthStart, pktDateKey } from '@/lib/time'
import { dec, money, NA, num, pct } from '@/lib/format'
import { INSIGHTS_START } from '@/domain/insights'
import type { CompanyId, LeadSource } from '@/domain/types'

type Preset = 'mtd' | '7d' | '30d' | 'prev' | 'all' | 'custom'
type Tab = 'funnel' | 'meta' | 'loss'

function periodLabel(p: Period, key: string) {
  if (p === 'monthly') return fmtMonthKey(key)
  const t = dateKeyToStart(key)
  return p === 'weekly' ? `Week of ${fmtDateShort(t)}` : fmtDateShort(t)
}

const NAcell = ({ v }: { v: string }) => <span className={cn(v === NA && 'text-slate-400')}>{v}</span>

export default function ReportsPage() {
  const S = useAppData()
  const run = useRun()
  const { visible, filter, me } = useScope()
  const setSession = useStore((s) => s.setSession)
  const now = S.clock.now
  const today = pktDateKey(now)
  const [preset, setPreset] = useState<Preset>('mtd')
  const [from, setFrom] = useState(pktDateKey(monthStart(now)))
  const [to, setTo] = useState(today)
  const [campaignId, setCampaignId] = useState('all')
  const [adId, setAdId] = useState('all')
  const [source, setSource] = useState<LeadSource | 'all'>('all')
  const [period, setPeriod] = useState<Period>('daily')
  const [tab, setTab] = useState<Tab>('funnel')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p === 'mtd') { setFrom(pktDateKey(monthStart(now))); setTo(today) }
    if (p === '7d') { setFrom(pktDateKey(now - 6 * DAY)); setTo(today) }
    if (p === '30d') { setFrom(pktDateKey(now - 29 * DAY)); setTo(today) }
    if (p === 'prev') { const ms = monthStart(now); setFrom(pktDateKey(monthStart(ms - DAY))); setTo(pktDateKey(ms - DAY)) }
    if (p === 'all') { setFrom(pktDateKey(INSIGHTS_START)); setTo(today) }
  }

  const companies: CompanyId[] = filter === 'all' ? visible : [filter]
  const f: ReportFilters = { from, to, companies, campaignId, adId, source }
  const campaigns = S.campaigns.filter((c) => companies.includes(c.companyId))
  const ads = S.ads.filter((a) => campaigns.some((c) => c.id === a.campaignId) && (campaignId === 'all' || a.campaignId === campaignId))

  const key = JSON.stringify([f, period, tab])
  useEffect(() => { setLoading(true); const t = setTimeout(() => setLoading(false), 320); return () => clearTimeout(t) }, [key])

  const leads = useMemo(() => filterLeads(S, f), [S.leads, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => funnel(leads), [leads])
  const periods = useMemo(() => byPeriod(S, f, period), [S.leads, S.insights, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const metaRows = useMemo(() => metaPerformance(S, f), [S.leads, S.insights, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const insightRows = useMemo(() => filterInsights(S, f), [S.insights, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const losses = useMemo(() => lossBreakdown(leads), [leads])
  const metaOk = S.metaAvailable
  const unattributed = counts.total ? leads.filter((l) => !l.campaignId).length : 0

  const refresh = () => {
    const ok = run((d) => refreshInsights(d))
    if (ok) toast.success('Meta insights refreshed', 'Simulated retrieval in the proof-of-concept data shape.')
    else toast.error('Meta insights could not be fetched', 'Showing the CRM funnel only.')
  }

  return (
    <div>
      <PageHeader
        title="Marketing reports"
        description="Which companies, campaigns and ads bring enquiries with real intent — and what the advertising cost to get them. CRM outcomes combined with selected Meta campaign and ad insights."
        eyebrow={<><span>P2-FR-002 · MKT-BR-013</span></>}
        actions={<>
          <div className={cn('flex h-9 items-center gap-2 rounded-lg px-3 text-[12.5px] ring-1 ring-inset', metaOk ? 'bg-white text-slate-600 ring-slate-200' : 'bg-rose-50 text-rose-700 ring-rose-200')}>
            {metaOk ? <CheckCircle2 className="size-4 text-emerald-500" /> : <CloudOff className="size-4" />}
            <span>Meta data last refreshed <b className="font-semibold">{S.metaLastRefreshedAt ? `${fmtDateTime(S.metaLastRefreshedAt)} PKT` : 'never'}</b>{S.metaLastRefreshedAt && <span className="text-slate-400"> · {fmtRelative(S.metaLastRefreshedAt, now)}</span>}</span>
          </div>
          <Button icon={RefreshCw} onClick={refresh}>Refresh</Button>
        </>}
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex items-center gap-2 self-center text-[12.5px] font-semibold text-slate-500"><Filter className="size-4" />Filters</div>
          <Field label="Date range">
            <Segmented size="sm" value={preset} onChange={applyPreset} options={[{ value: 'mtd', label: 'This month' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'prev', label: 'Last month' }, { value: 'all', label: 'All' }]} />
          </Field>
          <div className="flex items-end gap-1.5">
            <Field label="From"><Input type="date" value={from} min={pktDateKey(INSIGHTS_START)} max={to} onChange={(e) => { setFrom(e.target.value); setPreset('custom') }} className="h-8 w-[140px] text-[12.5px]" /></Field>
            <Field label="To"><Input type="date" value={to} min={from} max={today} onChange={(e) => { setTo(e.target.value); setPreset('custom') }} className="h-8 w-[140px] text-[12.5px]" /></Field>
          </div>
          <Field label="Company">
            <Select value={filter} onChange={(e) => { setSession({ companyFilter: e.target.value as CompanyId | 'all' }); setCampaignId('all'); setAdId('all') }} className="h-8 w-40 text-[12.5px]">
              {visible.length > 1 && <option value="all">{me.role === 'admin' ? 'All six companies' : 'All my companies'}</option>}
              {visible.map((c) => <option key={c} value={c}>{S.companies.find((x) => x.id === c)?.name}</option>)}
            </Select>
          </Field>
          <Field label="Campaign">
            <Select value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setAdId('all') }} className="h-8 w-48 text-[12.5px]">
              <option value="all">All campaigns</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Ad">
            <Select value={adId} onChange={(e) => setAdId(e.target.value)} className="h-8 w-44 text-[12.5px]">
              <option value="all">All ads</option>
              {ads.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Source">
            <Select value={source} onChange={(e) => setSource(e.target.value as LeadSource | 'all')} className="h-8 w-44 text-[12.5px]">
              <option value="all">All sources</option>
              {ALL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      {!metaOk && (
        <Callout tone="danger" icon={CloudOff} className="mb-5" title="Meta data unavailable">
          Meta campaign and ad insights could not be fetched. The CRM funnel below still loads from live CRM data; spend-based metrics show N/A.
        </Callout>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'funnel', label: 'Campaign funnel', icon: Layers },
          { value: 'meta', label: 'Meta performance with outcomes', icon: Megaphone },
          { value: 'loss', label: 'Loss reasons', icon: TrendingDown, count: counts.lost },
        ]} />
        <Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
      </div>

      {loading ? (
        <Card className="space-y-4 p-6"><Skeleton className="h-6 w-56" /><div className="grid grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64" /></Card>
      ) : counts.total === 0 && insightRows.length === 0 ? (
        <Card><EmptyState icon={SearchX} title="No data for these filters" description="No Leads or Meta insights match the selected date range, company, campaign, ad and source." /></Card>
      ) : (
        <>
          {tab === 'funnel' && <FunnelTab counts={counts} periods={periods} period={period} unattributed={unattributed} />}
          {tab === 'meta' && <MetaTab rows={metaRows} periods={periods} period={period} metaOk={metaOk} applies={metaApplies(f)} expanded={expanded} setExpanded={setExpanded} />}
          {tab === 'loss' && <LossTab losses={losses} lostTotal={counts.lost} periods={periods} period={period} />}
        </>
      )}

      <Callout tone="neutral" icon={Info} className="mt-6">
        <span className="flex flex-wrap items-center gap-2">
          The CRM shows selected Meta insights only. Campaign creation, audience setup, budget editing, placements and full creative analysis stay in Meta Ads Manager.
          <SimTag title="Meta insights retrieval worked in the proof of concept; production setup is pending. The prototype uses simulated insights in the same shape.">Insights simulated</SimTag>
          <PendingTag title="The final metric set and priority, refresh frequency and report layouts are to be confirmed. The listed metrics are the working default.">Metric set & refresh frequency to be confirmed</PendingTag>
        </span>
      </Callout>
    </div>
  )
}

// ------------------------------------------------------------------ funnel

function FunnelTab({ counts, periods, period, unattributed }: { counts: StatusCounts; periods: ReturnType<typeof byPeriod>; period: Period; unattributed: number }) {
  const max = Math.max(1, ...ALL_STATUSES.map((s) => counts[s]))
  const chart = periods.map((p) => ({ name: periodLabel(period, p.key), ...p.counts }))
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Funnel" description="Current status of Leads created in the range." actions={<PendingTag title="Funnel-ratio formulas are to be confirmed. Placeholder: each status as a share of all Leads; booking rate = Booked ÷ Leads (FRD example).">Ratio formulas placeholder</PendingTag>} />
          <div className="p-5">
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><p className="text-[12px] text-slate-500">Leads</p><p className="text-2xl font-semibold">{counts.total.toLocaleString()}</p></div>
              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><p className="text-[12px] text-slate-500">Booked ÷ Leads</p><p className="text-2xl font-semibold">{pct(safeDiv(counts.booked, counts.total))}</p></div>
            </div>
            <ul className="space-y-3">
              {ALL_STATUSES.map((s) => (
                <li key={s}>
                  <div className="mb-1 flex items-baseline justify-between text-[13px]">
                    <span className="font-medium text-slate-700">{STATUS_LABEL[s]}</span>
                    <span className="text-slate-500 tabular-nums"><b className="font-semibold text-slate-900">{counts[s]}</b> · {pct(safeDiv(counts[s], counts.total))}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${(counts[s] / max) * 100}%`, background: STATUS_CHART_COLOR[s] }} /></div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-slate-500"><b className="text-slate-700">{unattributed}</b> of these Leads have no campaign data and are counted as Unattributed in the Meta report.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title={`Leads by status · ${period}`} description="Stacked by current funnel status" actions={
            <div className="flex flex-wrap gap-3">{ALL_STATUSES.map((s) => <span key={s} className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-600"><span className="size-2.5 rounded-[3px]" style={{ background: STATUS_CHART_COLOR[s] }} />{STATUS_SHORT[s]}</span>)}</div>
          } />
          <div className="h-[320px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap={period === 'daily' ? '18%' : '35%'}>
                <CartesianGrid vertical={false} stroke="#e1e0d9" strokeDasharray="0" />
                <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: '#c3c2b7' }} tick={{ fontSize: 11, fill: '#898781' }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#898781' }} />
                <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<ChartTip />} />
                {ALL_STATUSES.map((s, i) => <Bar key={s} dataKey={s} name={STATUS_LABEL[s]} stackId="a" fill={STATUS_CHART_COLOR[s]} stroke="#fff" strokeWidth={1} radius={i === ALL_STATUSES.length - 1 ? [4, 4, 0, 0] : 0} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <PeriodTable period={period} periods={periods} cols={[
        ...ALL_STATUSES.map((s) => ({ label: STATUS_SHORT[s], get: (p: (typeof periods)[number]) => p.counts[s], fmt: num })),
        { label: 'Total', get: (p) => p.counts.total, fmt: num, strong: true },
        { label: 'Booked ÷ Leads', get: (p) => safeDiv(p.counts.booked, p.counts.total), fmt: pct, total: (ps) => safeDiv(ps.reduce((a, p) => a + p.counts.booked, 0), ps.reduce((a, p) => a + p.counts.total, 0)) },
      ]} />
    </div>
  )
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((a, p) => a + (p.value ?? 0), 0)
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-[12px] shadow-lg ring-1 ring-slate-900/10">
      <p className="mb-1 font-semibold text-slate-800">{label}</p>
      {[...payload].reverse().map((p) => <p key={p.name} className="flex items-center justify-between gap-4 text-slate-600"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: p.color }} />{p.name}</span><b className="font-semibold text-slate-800 tabular-nums">{p.value}</b></p>)}
      <p className="mt-1 flex justify-between gap-4 border-t border-slate-100 pt-1 text-slate-500"><span>Total</span><b className="text-slate-800 tabular-nums">{total}</b></p>
    </div>
  )
}

// ------------------------------------------------------------------ period table (daily / weekly / monthly)

type PRow = ReturnType<typeof byPeriod>[number]
interface Col { label: string; get: (p: PRow) => number | null; fmt: (n: number | null) => string; strong?: boolean; total?: (ps: PRow[]) => number | null }

function PeriodTable({ period, periods, cols, title }: { period: Period; periods: PRow[]; cols: Col[]; title?: string }) {
  const totals = cols.map((c) => c.total ? c.total(periods) : sumMoney(periods.map((p) => c.get(p) ?? 0)))
  return (
    <Card>
      <CardHeader icon={CalendarRange} title={title ?? `${period[0].toUpperCase()}${period.slice(1)} view`} description="Built from the same live data — period rows add up to the totals." />
      <div className="scroll-thin max-h-[420px] overflow-auto focus-visible:outline-2 focus-visible:outline-brand-500" tabIndex={0} role="region" aria-label={`${title ?? period} table`}>
        <table className="w-full min-w-[640px]">
          <thead className="sticky top-0 z-10 border-b border-slate-100 bg-white"><tr><th className={th}>Period</th>{cols.map((c) => <th key={c.label} className={cn(th, 'text-right')}>{c.label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {periods.map((p) => (
              <tr key={p.key} className="hover:bg-slate-50/60">
                <td className={cn(td, 'font-medium whitespace-nowrap text-slate-700')}>{periodLabel(period, p.key)}</td>
                {cols.map((c) => <td key={c.label} className={cn(td, 'text-right tabular-nums', c.strong && 'font-semibold text-slate-900')}><NAcell v={c.fmt(c.get(p))} /></td>)}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 border-t-2 border-slate-200 bg-slate-50">
            <tr><td className={cn(td, 'font-semibold text-slate-900')}>Total</td>{cols.map((c, i) => <td key={c.label} className={cn(td, 'text-right font-semibold text-slate-900 tabular-nums')}><NAcell v={c.fmt(totals[i])} /></td>)}</tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ Meta performance

function MetaTab({ rows, periods, period, metaOk, applies, expanded, setExpanded }: { rows: MetaRow[]; periods: PRow[]; period: Period; metaOk: boolean; applies: boolean; expanded: Record<string, boolean>; setExpanded: (v: Record<string, boolean>) => void }) {
  const showMeta = metaOk && applies
  const totalSpend = sumMoney(rows.map((r) => r.meta?.spend ?? 0))
  const totalCounts = rows.reduce((a, r) => ({ total: a.total + r.counts.total, booked: a.booked + r.counts.booked }), { total: 0, booked: 0 })
  const attributedLeads = rows.filter((r) => r.level === 'campaign').reduce((a, r) => a + r.counts.total, 0)
  const attributedBooked = rows.filter((r) => r.level === 'campaign').reduce((a, r) => a + r.counts.booked, 0)
  const m = (v: string) => showMeta ? v : '—'

  const Row = ({ r, depth = 0 }: { r: MetaRow; depth?: number }) => {
    const d = derived(showMeta ? r.meta : null, r.counts)
    const open = expanded[r.id]
    return (
      <tr className={cn('hover:bg-slate-50/60', r.level === 'campaign' && 'bg-white', r.level === 'ad' && 'bg-slate-50/40', r.level === 'unattributed' && 'bg-amber-50/30')}>
        <td className={cn(td, 'sticky left-0 z-[1] min-w-64 bg-inherit')}>
          <div className="flex items-center gap-2" style={{ paddingLeft: depth * 22 }}>
            {r.children?.length ? (
              <button onClick={() => setExpanded({ ...expanded, [r.id]: !open })} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={open ? 'Collapse' : 'Expand'}>
                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ) : <span className="w-5" />}
            <div className="min-w-0">
              <p className={cn('truncate', r.level === 'ad' ? 'text-[12.5px] text-slate-600' : 'font-medium text-slate-800')}>{r.name}</p>
              {r.level === 'campaign' && r.companyId && <CompanyTag id={r.companyId} className="text-[11px] font-normal text-slate-500" />}
              {r.level === 'unattributed' && <p className="text-[11px] text-slate-500">Leads with no campaign or ad data</p>}
            </div>
          </div>
        </td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.meta ? m(money(r.meta.spend)) : '—'}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.meta ? m(num(r.meta.impressions)) : '—'}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.meta ? m(num(r.meta.reach)) : '—'}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.meta ? m(num(r.meta.clicks)) : '—'}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.meta ? <NAcell v={m(pct(d.ctr, 2))} /> : '—'}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.meta ? <NAcell v={m(money(d.cpc))} /> : '—'}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.meta ? <NAcell v={m(money(d.cpm))} /> : '—'}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.meta ? <NAcell v={m(dec(d.frequency))} /> : '—'}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.meta ? m(num(r.meta.results)) : '—'}</td>
        <td className={cn(td, 'border-l border-slate-100 text-right font-semibold text-slate-900 tabular-nums')}>{r.counts.total}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.counts.mature}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.counts.hot}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.counts.booked}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{r.counts.lost}</td>
        <td className={cn(td, 'border-l border-slate-100 text-right font-medium tabular-nums')}>{r.meta ? <NAcell v={m(money(d.cpl))} /> : <span className="text-slate-400">{NA}</span>}</td>
        <td className={cn(td, 'text-right font-medium tabular-nums')}>{r.meta ? <NAcell v={m(money(d.costPerBooking))} /> : <span className="text-slate-400">{NA}</span>}</td>
      </tr>
    )
  }

  return (
    <div className="space-y-5">
      {!applies && <Callout tone="info">The selected source is not a Meta ad source, so no ad spend applies. Funnel counts are still shown.</Callout>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { l: 'Spend', v: showMeta ? money(totalSpend) : NA },
          { l: 'Attributed Leads', v: attributedLeads.toLocaleString() },
          { l: 'CPL', v: showMeta ? money(safeDiv(totalSpend, attributedLeads)) : NA, hint: 'Spend ÷ Leads' },
          { l: 'Booked (attributed)', v: attributedBooked.toLocaleString() },
          { l: 'Cost per booking', v: showMeta ? money(safeDiv(totalSpend, attributedBooked)) : NA, hint: 'Spend ÷ Booked Leads' },
        ].map((k) => (
          <Card key={k.l} className="p-4">
            <p className="text-[12px] font-medium text-slate-500">{k.l}</p>
            <p className={cn('mt-1.5 text-xl font-semibold tracking-tight tabular-nums', k.v === NA ? 'text-slate-400' : 'text-slate-900')}>{k.v}</p>
            {k.hint && <p className="mt-0.5 text-[11px] text-slate-400">{k.hint}</p>}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader icon={BarChart3} title="Campaigns and ads" description="Selected Meta insights next to CRM funnel outcomes. Expand a campaign to see its ads." actions={<Badge tone="neutral">{totalCounts.total} Leads in table</Badge>} />
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[1500px]">
            <thead className="border-b border-slate-100 bg-slate-50/70">
              <tr>
                <th className={cn(th, 'sticky left-0 z-[1] bg-slate-50')} rowSpan={2}>Campaign / ad</th>
                <th className={cn(th, 'border-b border-slate-100 text-center text-sky-700')} colSpan={9}>Meta insights {!metaOk && '· unavailable'}</th>
                <th className={cn(th, 'border-b border-l border-slate-100 text-center text-brand-700')} colSpan={5}>CRM outcomes</th>
                <th className={cn(th, 'border-b border-l border-slate-100 text-center')} colSpan={2}>Derived</th>
              </tr>
              <tr>
                {['Spend', 'Impr.', 'Reach', 'Clicks', 'CTR', 'CPC', 'CPM', 'Freq.', 'Results'].map((h) => <th key={h} className={cn(th, 'text-right')}>{h}</th>)}
                <th className={cn(th, 'border-l border-slate-100 text-right')}>Leads</th>
                {['Mature', 'Hot', 'Booked', 'Lost'].map((h) => <th key={h} className={cn(th, 'text-right')}>{h}</th>)}
                <th className={cn(th, 'border-l border-slate-100 text-right')}>CPL</th>
                <th className={cn(th, 'text-right')}>Cost / booking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <Row r={r} />
                  {expanded[r.id] && r.children?.map((c) => <Row key={c.id} r={c} depth={1} />)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-2.5 text-[11.5px] text-slate-500">CPL = spend ÷ Leads; cost per booking = spend ÷ Booked Leads; N/A where a value cannot be calculated. CPA is not defined in the TO-BE. Reach and frequency are summed from daily rows in this simulation. Ad-set reporting is not specified.</p>
      </Card>
      <PeriodTable period={period} periods={periods} title={`${period[0].toUpperCase()}${period.slice(1)} spend & outcomes`} cols={[
        { label: 'Spend', get: (p) => showMeta ? p.meta.spend : null, fmt: (n) => showMeta ? money(n) : '—' },
        { label: 'Impressions', get: (p) => showMeta ? p.meta.impressions : null, fmt: (n) => showMeta ? num(n) : '—' },
        { label: 'Clicks', get: (p) => showMeta ? p.meta.clicks : null, fmt: (n) => showMeta ? num(n) : '—' },
        { label: 'Attributed Leads', get: (p) => p.attributed.total, fmt: num, strong: true },
        { label: 'Booked (attr.)', get: (p) => p.attributed.booked, fmt: num },
        { label: 'CPL', get: (p) => showMeta ? safeDiv(p.meta.spend, p.attributed.total) : null, fmt: money, total: (ps) => showMeta ? safeDiv(sumMoney(ps.map((p) => p.meta.spend)), ps.reduce((a, p) => a + p.attributed.total, 0)) : null },
        { label: 'Cost / booking', get: (p) => showMeta ? safeDiv(p.meta.spend, p.attributed.booked) : null, fmt: money, total: (ps) => showMeta ? safeDiv(sumMoney(ps.map((p) => p.meta.spend)), ps.reduce((a, p) => a + p.attributed.booked, 0)) : null },
      ]} />
      <p className="text-[11.5px] text-slate-500">CPL and cost per booking use Leads attributed to a Meta campaign, so the period totals match the figures above. Unattributed Leads have no ad spend.</p>
    </div>
  )
}

// ------------------------------------------------------------------ loss reasons

function LossTab({ losses, lostTotal, periods, period }: { losses: { reason: string; count: number }[]; lostTotal: number; periods: PRow[]; period: Period }) {
  const sum = losses.reduce((a, l) => a + l.count, 0)
  const max = Math.max(1, ...losses.map((l) => l.count))
  const reasons = losses.map((l) => l.reason)
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader icon={TrendingDown} title="Loss reasons" description="Count and breakdown of Lost Leads in the same filter."
          actions={<span className="flex items-center gap-2">{sum === lostTotal ? <Badge tone="green" icon={CheckCircle2}>Matches {lostTotal} Lost Leads</Badge> : <Badge tone="red">Mismatch</Badge>}<PendingTag title="The allowed Lost reasons are to be confirmed.">Reason list placeholder</PendingTag></span>} />
        {losses.length === 0 ? <EmptyState compact icon={TrendingDown} title="No Lost Leads in this filter" /> : (
          <ul className="space-y-3.5 p-5">
            {losses.map((l) => (
              <li key={l.reason} className="grid grid-cols-[minmax(140px,220px)_1fr_auto] items-center gap-4">
                <span className="truncate text-[13px] font-medium text-slate-700">{l.reason}</span>
                <div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(l.count / max) * 100}%` }} /></div>
                <span className="w-24 text-right text-[13px] text-slate-500 tabular-nums"><b className="font-semibold text-slate-900">{l.count}</b> · {pct(safeDiv(l.count, sum))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {reasons.length > 0 && <PeriodTable period={period} periods={periods} title={`${period[0].toUpperCase()}${period.slice(1)} loss reasons`} cols={[
        ...reasons.map((r) => ({ label: r, get: (p: PRow) => p.lost[r] ?? 0, fmt: num })),
        { label: 'Total Lost', get: (p) => p.counts.lost, fmt: num, strong: true },
      ]} />}
    </div>
  )
}
