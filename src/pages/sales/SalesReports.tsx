import { useMemo, useState } from 'react'
import { BarChart3, Briefcase, PhoneCall, CircleDollarSign, RotateCcw, Share2, Moon, XCircle, Lock } from 'lucide-react'
import { Avatar, Badge, Callout, Card, CardHeader, EmptyState, Field, Input, PageHeader, PendingTag, Select, Stat, th, td, cn } from '@/components/ui'
import { CompanyTag, SourceBadge } from '@/components/domain'
import { useCalmData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { salesReport } from '@/domain/salesReports'
import { userName } from '@/domain/engine'
import { OUTCOME_LABEL, SALES_STAGE_LABEL, STATUS_LABEL, STATUS_CHART_COLOR } from '@/domain/constants'
import { fmtMoney, fmtMonthKey, pktDateKey, fmtDateTime } from '@/lib/time'
import { findLead } from '@/domain/lookup'

/** Single-series horizontal bar: one hue, value label in text ink, hover title (dataviz mark spec). */
function HBar({ label, value, max, color = '#2a78d6', sub }: { label: React.ReactNode; value: number; max: number; color?: string; sub?: string }) {
  const pct = max ? (value / max) * 100 : 0
  return (
    <div className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3 py-1.5" title={`${typeof label === 'string' ? label : ''} ${value}${sub ? ` · ${sub}` : ''}`}>
      <span className="truncate text-[12.5px] text-slate-600">{label}</span>
      <span className="h-3 rounded-r-[4px] bg-slate-100"><span className="block h-3 rounded-r-[4px]" style={{ width: `${Math.max(pct, value ? 1.5 : 0)}%`, background: color }} /></span>
      <span className="w-20 text-right text-[12.5px] font-semibold text-slate-800 tabular-nums">{value}{sub && <span className="ml-1 font-normal text-slate-400">{sub}</span>}</span>
    </div>
  )
}

/** SAL-FR-007 Sales performance reports — Managers and Admins only (AC-SAL-007-2). */
export default function SalesReportsPage() {
  const S = useCalmData()
  const { companies } = useScope()
  const [from, setFrom] = useState('2026-09-01')
  const [to, setTo] = useState(pktDateKey(S.clock.now))
  const [agentId, setAgentId] = useState('all')
  const r = useMemo(() => salesReport(S, { from, to, companies, agentId }), [S, from, to, companies, agentId])
  const agents = S.users.filter((u) => u.role === 'agent' && companies.includes(u.companyIds[0]))
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : 'N/A')
  const maxReach = Math.max(1, ...r.stageReach.map((s) => s.reached))
  const maxOutcome = Math.max(1, ...r.outcomes.map((o) => o.count))
  const maxFunnel = Math.max(1, ...r.funnel.map((f) => f.count))
  const maxLoss = Math.max(1, ...r.losses.map((l) => l.count))
  const actualKnown = r.monthly.some((m) => m.actual !== null)

  return (
    <div>
      <PageHeader title="Sales performance" eyebrow={<><Badge tone="neutral" icon={Lock}>Managers & Admins only</Badge><span>SAL-FR-007 · AC-SAL-007-2/3/4/5</span></>}
        description="Leads per agent, company and source; contact performance; stage conversion and the shared funnel; bookings and value; expected, actual and refund-adjusted margin; loss reasons, low intent and referrals; refunds. Marketing sees the shared funnel only." />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
          <Field label="Agent"><Select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-52"><option value="all">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <p className="ml-auto max-w-md text-[11.5px] text-slate-500">Company comes from the switcher in the top bar. Leads are counted by creation date; bookings by booking date; refunds by approval date. <PendingTag title="Report layouts and filters are to be confirmed (SAL-FR-007).">Layouts & filters TBC</PendingTag></p>
        </div>
      </Card>

      {r.totals.oppCount === 0 ? <Card><EmptyState icon={BarChart3} title="No data" description="Nothing matches these filters." /></Card> : <>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat label="Leads" value={r.totals.leads} icon={Briefcase} tone="brand" />
          <Stat label="Contact attempts" value={r.totals.attempts} sub={`${pct(r.totals.answered, r.totals.attempts)} answered`} icon={PhoneCall} />
          <Stat label="Bookings" value={r.totals.bookings} sub={`${r.totals.overrides} via margin override`} icon={Briefcase} tone="green" />
          <Stat label="Booking value" value={fmtMoney(r.totals.value)} icon={CircleDollarSign} />
          <Stat label="Expected margin" value={fmtMoney(r.totals.expected)} icon={CircleDollarSign} />
          <Stat label="Refunds approved" value={fmtMoney(r.totals.refundsApproved)} sub={`${r.totals.refundsRequested} awaiting Accounts`} icon={RotateCcw} tone={r.totals.refundsApproved ? 'amber' : 'neutral'} />
        </div>

        <Card className="mb-5">
          <CardHeader title="By agent" description="Leads, contact performance, bookings, value and margins per agent. Actual margin includes only bookings for which Accounts has recorded actual expenses; refunds are approved refunds in the range." />
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[1180px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr>
                <th className={th}>Agent</th><th className={cn(th, 'text-right')}>Leads</th><th className={cn(th, 'text-right')}>Attempts</th><th className={cn(th, 'text-right')}>Answered</th><th className={cn(th, 'text-right')}>First contact ≤ 1h</th>
                <th className={cn(th, 'text-right')}>Bookings</th><th className={cn(th, 'text-right')}>Value</th><th className={cn(th, 'text-right')}>Expected margin</th><th className={cn(th, 'text-right')}>Actual margin</th><th className={cn(th, 'text-right')}>Refunds</th>
                <th className={cn(th, 'text-right')}>Lost</th><th className={cn(th, 'text-right')}>Low intent</th><th className={cn(th, 'text-right')}>Referrals</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {r.rows.map((a) => (
                  <tr key={a.agentId}>
                    <td className={td}><span className="flex items-center gap-2 whitespace-nowrap"><Avatar name={userName(S, a.agentId)} size="xs" /><span className="font-medium text-slate-800">{userName(S, a.agentId)}</span></span><CompanyTag id={a.companyId} className="text-[11px] font-normal" /></td>
                    <td className={cn(td, 'text-right tabular-nums')}>{a.leads}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{a.attempts}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{pct(a.answered, a.attempts)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{pct(a.firstContactWithinSla, a.firstContacts)}</td>
                    <td className={cn(td, 'text-right font-semibold tabular-nums')}>{a.bookings}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(a.value)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(a.expected)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{a.actual === null ? <span className="text-[12px] text-slate-400">Accounts data pending</span> : fmtMoney(a.actual)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{a.refunds ? fmtMoney(a.refunds) : '—'}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{a.lost}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{a.dormant}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{a.referrals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="mb-5">
          <CardHeader icon={CircleDollarSign} title="Margin by month" description="Expected margin is stored at booking. Actual margin = Accounts-confirmed payments − actual expenses, only for bookings with Accounts expense data. Approved refunds reduce the month they were approved in; the Booking still counts."
            actions={<PendingTag title="The actual-margin formula is a placeholder built from the inputs SAL-FR-007 names.">Formula = placeholder</PendingTag>} />
          {!actualKnown && <Callout tone="neutral" className="m-5">Accounts data pending — no booking in this range has actual expenses recorded, so actual margin is not shown (AC-SAL-007-4).</Callout>}
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Month</th><th className={cn(th, 'text-right')}>Bookings</th><th className={cn(th, 'text-right')}>Value</th><th className={cn(th, 'text-right')}>Expected margin</th><th className={cn(th, 'text-right')}>Actual margin</th><th className={cn(th, 'text-right')}>Refunds approved</th><th className={cn(th, 'text-right')}>Refund-adjusted actual</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {r.monthly.map((m) => (
                  <tr key={m.month}>
                    <td className={cn(td, 'font-medium')}>{fmtMonthKey(m.month)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{m.bookings}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(m.value)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(m.expected)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{m.actual === null ? <span className="text-[12px] text-slate-400">Pending</span> : fmtMoney(m.actual)}{m.actual !== null && m.actualPendingBookings > 0 && <span className="block text-[11px] text-slate-400">{m.actualPendingBookings} booking(s) without Accounts data excluded</span>}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{m.refunds ? <span className="text-rose-700">−{fmtMoney(m.refunds)}</span> : '—'}</td>
                    <td className={cn(td, 'text-right font-semibold tabular-nums')}>{m.refundAdjusted === null ? <span className="text-[12px] font-normal text-slate-400">Pending</span> : fmtMoney(m.refundAdjusted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mb-5 grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
          <Card>
            <CardHeader title="Stage conversion" description="Opportunities that ever reached each Sales stage (bars) and how many sit there now." />
            <div className="px-5 py-3">
              {r.stageReach.map((s) => <HBar key={s.stage} label={SALES_STAGE_LABEL[s.stage]} value={s.reached} max={maxReach} sub={`${s.current} now`} />)}
              <p className="mt-2 text-[11.5px] text-slate-500">Reached Booked: {pct(r.stageReach.find((s) => s.stage === 'booked')!.reached, r.totals.leads)} of Leads. Lost: {r.totals.lost}.</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Shared funnel" description="Lead → Mature → Hot → Booked / Lost (P2-FR-001), fed by Sales outcomes. This is what Marketing sees." />
            <div className="px-5 py-3">
              {r.funnel.map((f) => <HBar key={f.status} label={STATUS_LABEL[f.status]} value={f.count} max={maxFunnel} color={STATUS_CHART_COLOR[f.status]} />)}
            </div>
          </Card>
          <Card>
            <CardHeader icon={PhoneCall} title="Contact performance" description="Every logged attempt by outcome (entered by hand — no telephony)." />
            <div className="px-5 py-3">
              {r.outcomes.map((o) => <HBar key={o.outcome} label={OUTCOME_LABEL[o.outcome]} value={o.count} max={maxOutcome} />)}
            </div>
          </Card>
          <Card>
            <CardHeader icon={XCircle} title="Loss reasons" description="Lost opportunities by reason." />
            <div className="px-5 py-3">
              {r.losses.length === 0 ? <p className="py-4 text-center text-[13px] text-slate-500">No Lost opportunities</p> : r.losses.map((l) => <HBar key={l.reason} label={l.reason} value={l.count} max={maxLoss} color="#6b6a64" />)}
              <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-[12.5px] text-slate-600">
                <span className="inline-flex items-center gap-1.5"><Moon className="size-3.5 text-slate-400" />Low Intent / Dormant: <b>{r.totals.dormant}</b></span>
                <span className="inline-flex items-center gap-1.5"><Share2 className="size-3.5 text-slate-400" />Referral Leads: <b>{r.totals.referrals}</b></span>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
          <Card>
            <CardHeader title="Leads per company and source" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <table className="w-full text-[12.5px]"><thead><tr className="text-left text-[11px] text-slate-500 uppercase"><th className="pb-1.5 font-semibold">Company</th><th className="pb-1.5 text-right font-semibold">Leads</th><th className="pb-1.5 text-right font-semibold">Bookings</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{r.byCompany.map((c) => <tr key={c.companyId}><td className="py-1.5"><CompanyTag id={c.companyId} /></td><td className="py-1.5 text-right tabular-nums">{c.leads}</td><td className="py-1.5 text-right tabular-nums">{c.bookings}</td></tr>)}</tbody></table>
              <table className="w-full text-[12.5px]"><thead><tr className="text-left text-[11px] text-slate-500 uppercase"><th className="pb-1.5 font-semibold">Source</th><th className="pb-1.5 text-right font-semibold">Leads</th><th className="pb-1.5 text-right font-semibold">Booked</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{r.bySource.map((s) => <tr key={s.source}><td className="py-1.5"><SourceBadge source={s.source} /></td><td className="py-1.5 text-right tabular-nums">{s.leads}</td><td className="py-1.5 text-right tabular-nums">{s.booked}</td></tr>)}</tbody></table>
            </div>
          </Card>
          <Card>
            <CardHeader icon={RotateCcw} title="Refunds" description="Requested in this range. Approved refunds keep the Booking." />
            {r.refundList.length === 0 ? <EmptyState compact icon={RotateCcw} title="No refunds" /> : (
              <ul className="divide-y divide-slate-100">
                {r.refundList.map((x) => {
                  const b = S.bookings.find((y) => y.id === x.bookingId)!
                  return <li key={x.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-[12.5px]"><b className="tabular-nums">{fmtMoney(x.amount)}</b><span className="font-mono text-slate-500">{b.ref}</span><span className="text-slate-500">{userName(S, findLead(S, b.leadId)!.ownerId)}</span><Badge tone={x.status === 'approved' ? 'green' : x.status === 'rejected' ? 'red' : 'amber'} className="ml-auto">{x.status}</Badge><span className="w-full text-[11.5px] text-slate-400">{fmtDateTime(x.requestedAt)} · {x.note}</span></li>
                })}
              </ul>
            )}
          </Card>
        </div>
      </>}
    </div>
  )
}
