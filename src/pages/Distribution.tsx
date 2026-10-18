import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Eye, Inbox, Timer, UserX, Users2, History, Scale, Sparkles, Shuffle, CalendarDays } from 'lucide-react'
import { Avatar, Badge, Callout, Card, CardHeader, EmptyState, PageHeader, PendingTag, Segmented, Select, Stat, th, td, cn } from '@/components/ui'
import { AgentStateBadge, CompanyTag, SlaChip } from '@/components/domain'
import { OwnerCell } from '@/components/leads/LeadWidgets'
import { useAppData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { agentState, activeLeadCount, companyAgents, fairnessScore, userName } from '@/domain/engine'
import { fmtDateTime, fmtDuration, fmtMonthKey, fmtRelative, monthKey, SLA_MS } from '@/lib/time'
import type { AuditType, CompanyId } from '@/domain/types'

const CHANGE_TYPES: AuditType[] = ['manual-assign', 'manual-unassign', 'manual-reassign', 'availability', 'absent', 'released-absent']

export default function DistributionPage() {
  const S = useAppData()
  const { companies, me } = useScope()
  const navigate = useNavigate()
  const current = monthKey(S.clock.now)
  const [month, setMonth] = useState(current)
  const [changes, setChanges] = useState<'all' | 'assign' | 'availability'>('all')
  const [showAll, setShowAll] = useState(false)
  const scope: CompanyId[] = me.role === 'teamlead' ? companies.filter((c) => me.companyIds.includes(c)) : companies

  const months = useMemo(() => {
    const set = new Set(S.assignments.map((a) => monthKey(a.at)))
    set.add(current)
    return [...set].sort().reverse()
  }, [S.assignments, current])

  const leads = S.leads.filter((l) => scope.includes(l.companyId))
  const monthLeads = leads.filter((l) => monthKey(l.createdAt) === month)
  const unassigned = leads.filter((l) => !l.ownerId).sort((a, b) => a.createdAt - b.createdAt)
  const uncontacted = leads.filter((l) => l.ownerId && !l.firstContactAt && l.status !== 'lost' && l.status !== 'booked').sort((a, b) => a.createdAt - b.createdAt)
  const alerts = uncontacted.filter((l) => l.slaAlertAt).sort((a, b) => b.slaCountedMs - a.slaCountedMs)
  const history = S.audit
    .filter((a) => CHANGE_TYPES.includes(a.type) && (!a.companyId || scope.includes(a.companyId)))
    .filter((a) => changes === 'all' || (changes === 'assign' ? a.type.startsWith('manual') || a.type === 'released-absent' : a.type === 'availability' || a.type === 'absent'))
    .slice(-60).reverse()
  const teamCompanies = scope.filter((c) => S.companies.find((x) => x.id === c))

  return (
    <div>
      <PageHeader
        title="Distribution & SLA monitoring"
        description="How Leads are shared and which Leads need attention. This view only shows information — any change goes through the manual controls on the Lead."
        eyebrow={<><Badge tone="neutral" icon={Eye}>Read-only view</Badge><span>P2-FR-003</span>{me.role === 'teamlead' && <Badge tone="brand">Your team only</Badge>}</>}
        actions={
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-slate-400" />
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-56" aria-label="Month">
              {months.map((m) => <option key={m} value={m}>{fmtMonthKey(m)}{m === current ? ' (current)' : ''}</option>)}
            </Select>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Leads · ${fmtMonthKey(month)}`} value={monthLeads.length.toLocaleString()} icon={Users2} tone="brand" />
        <Stat label="Unassigned" value={unassigned.length} icon={UserX} tone={unassigned.length ? 'amber' : 'neutral'} onClick={() => document.getElementById('pending')?.scrollIntoView({ behavior: 'smooth' })} />
        <Stat label="Awaiting first contact" value={uncontacted.length} icon={Timer} onClick={() => document.getElementById('pending')?.scrollIntoView({ behavior: 'smooth' })} />
        <Stat label="Active SLA alerts" value={alerts.length} icon={AlertTriangle} tone={alerts.length ? 'red' : 'neutral'} onClick={() => document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth' })} />
      </div>

      <Card className="mb-5">
        <CardHeader icon={Scale} title={`Allocation & fairness · ${fmtMonthKey(month)}`}
          description="Score = real monthly count + starting offset. The lowest-score eligible agent receives the next automatic Lead. Counts reset automatically on the 1st."
          actions={month !== current ? <Badge tone="neutral">Agent state shown as of now</Badge> : undefined} />
        {teamCompanies.map((c) => {
          const agents = companyAgents(S, c)
          const company = S.companies.find((x) => x.id === c)!
          const scores = agents.map((a) => ({ a, ...fairnessScore(S, a.id, month) }))
          const max = Math.max(1, ...scores.map((s) => s.score))
          const lastTie = S.tieRotation[c]
          const monthTotal = scores.reduce((x, s) => x + s.count, 0)
          return (
            <div key={c} className="border-b border-slate-100 last:border-0">
              <div className="flex flex-wrap items-center gap-3 bg-slate-50/60 px-5 py-2.5">
                <CompanyTag id={c} />
                {!company.active && <Badge tone="neutral">Inactive</Badge>}
                <span className="text-[12px] text-slate-500">{agents.length} agents · {monthTotal} counted assignments</span>
                {lastTie && <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-slate-500"><Shuffle className="size-3" />Last tie-break: {userName(S, lastTie)}</span>}
              </div>
              {agents.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-slate-500">No sales agents yet — Leads stay Unassigned.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px]">
                    <thead><tr className="border-b border-slate-100"><th className={th}>Agent</th><th className={th}>State</th><th className={cn(th, 'text-right')}>Real count</th><th className={cn(th, 'text-right')}>Offset</th><th className={th}>Fairness score</th><th className={cn(th, 'text-right')}>Active / capacity</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {scores.sort((x, y) => x.score - y.score).map(({ a, count, offset, score }) => {
                        const active = activeLeadCount(S, a.id)
                        const isNew = offset > 0
                        return (
                          <tr key={a.id}>
                            <td className={td}><span className="flex items-center gap-2.5"><Avatar name={a.name} size="sm" /><span className="font-medium text-slate-800">{a.name}</span>{isNew && <Badge tone="violet" icon={Sparkles}>New · offset</Badge>}</span></td>
                            <td className={td}><AgentStateBadge state={agentState(S, a, S.clock.now)} /></td>
                            <td className={cn(td, 'text-right font-medium tabular-nums')}>{count}</td>
                            <td className={cn(td, 'text-right tabular-nums text-slate-500')}>{offset ? `+${offset}` : '0'}</td>
                            <td className={cn(td, 'w-64')}>
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-2 flex-1 gap-[2px] overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full rounded-l-full bg-brand-500" style={{ width: `${(count / max) * 100}%` }} title={`Real count ${count}`} />
                                  {offset > 0 && <div className="h-full bg-violet-300" style={{ width: `${(offset / max) * 100}%` }} title={`Offset ${offset}`} />}
                                </div>
                                <span className="w-8 text-right text-[13px] font-semibold text-slate-800 tabular-nums">{score}</span>
                              </div>
                            </td>
                            <td className={cn(td, 'text-right tabular-nums')}><span className={cn(active >= S.params.capacity ? 'font-semibold text-violet-700' : 'text-slate-600')}>{active} / {S.params.capacity}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-2.5 text-[11.5px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-brand-500" />Real count</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-violet-300" />Starting offset (new agent)</span>
          <span>Capacity value <b className="text-slate-700">{S.params.capacity}</b> <PendingTag>Placeholder</PendingTag></span>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
        <Card id="pending">
          <CardHeader icon={Inbox} title="Pending Leads" description="Unassigned Leads and assigned Leads with no first contact yet — oldest first." />
          {unassigned.length + uncontacted.length === 0 ? (
            <EmptyState compact icon={Inbox} title="No pending Leads" description="Every Lead has an owner and a recorded first contact." />
          ) : (
            <ul className="scroll-thin max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {[...unassigned, ...uncontacted].sort((a, b) => a.createdAt - b.createdAt).map((l) => (
                <li key={l.id}>
                  <button onClick={() => navigate(`/leads/${l.id}`)} className="flex w-full flex-wrap items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-slate-800">{l.fields.fullName} <span className="font-mono text-[11px] text-slate-400">{l.ref}</span></span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-500"><CompanyTag id={l.companyId} /> · {fmtRelative(l.createdAt, S.clock.now)}</span>
                    </span>
                    <OwnerCell lead={l} />
                    <span className="w-28 text-right"><SlaChip lead={l} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card id="alerts">
          <CardHeader icon={AlertTriangle} title="SLA alerts" description="Leads past one hour of counted time. An alert never reassigns the Lead; it clears when first contact is recorded." />
          {alerts.length === 0 ? (
            <EmptyState compact icon={Timer} title="No active SLA alerts" description="All assigned Leads were contacted within one hour of counted time." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((l) => (
                <li key={l.id}>
                  <button onClick={() => navigate(`/leads/${l.id}`)} className="flex w-full items-center gap-3 bg-rose-50/30 px-5 py-3 text-left hover:bg-rose-50/60">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600"><AlertTriangle className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-800">{l.fields.fullName} <span className="font-mono text-[11px] font-normal text-slate-400">{l.ref}</span></span>
                      <span className="text-[12px] text-slate-500">Owner <b className="font-medium text-slate-700">{userName(S, l.ownerId)}</b> · alert at {fmtDateTime(l.slaAlertAt!)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[13px] font-semibold text-rose-700 tabular-nums">+{fmtDuration(l.slaCountedMs - SLA_MS)}</span>
                      <span className="text-[11px] text-slate-400">overdue</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader icon={History} title="Manual changes & availability history" description="Manual assignment, unassignment and reassignment, Absent releases and availability changes — all audit-logged."
          actions={<Segmented size="sm" value={changes} onChange={setChanges} options={[{ value: 'all', label: 'All' }, { value: 'assign', label: 'Assignments' }, { value: 'availability', label: 'Availability' }]} />} />
        {history.length === 0 ? (
          <EmptyState compact icon={History} title="No changes recorded" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(showAll ? history : history.slice(0, 12)).map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-[13px]">
                <span className="w-24 shrink-0 text-[12px] text-slate-400 tabular-nums">{fmtDateTime(h.at)}</span>
                <Badge tone={h.type.startsWith('manual') ? 'brand' : h.type === 'availability' ? 'amber' : h.type === 'absent' ? 'red' : 'violet'}>{h.type.replace('manual-', '').replace('-', ' ')}</Badge>
                <span className="min-w-0 flex-1 text-slate-700">{h.summary}</span>
                <span className="text-[12px] text-slate-400">by {userName(S, h.actorId)}</span>
              </li>
            ))}
            {history.length > 12 && (
              <li className="px-5 py-2.5 text-center">
                <button onClick={() => setShowAll(!showAll)} className="text-[12.5px] font-medium text-brand-700 hover:underline">{showAll ? 'Show fewer' : `Show ${history.length - 12} more`}</button>
              </li>
            )}
          </ul>
        )}
      </Card>
      <Callout tone="neutral" className="mt-5">How long alerts and history are kept, whether data can be exported, and how alerts are delivered are open decisions. <PendingTag /></Callout>
    </div>
  )
}
