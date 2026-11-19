import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Briefcase, Search, ChevronRight, PhoneCall } from 'lucide-react'
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Select, th, td, cn } from '@/components/ui'
import { CompanyTag, SourceBadge, StatusPill } from '@/components/domain'
import { DormantBadge, StageBadge, UnsignedFlag } from '@/components/sales/SalesWidgets'
import { useCalmData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { canViewOpportunity } from '@/domain/permissions'
import { userName } from '@/domain/engine'
import { bookingOf, isTaskOverdue } from '@/domain/sales'
import { SALES_STAGES, SALES_STAGE_LABEL } from '@/domain/constants'
import type { SalesStage } from '@/domain/types'
import { fmtDateTime, fmtRelative } from '@/lib/time'

const PAGE = 60

/** SAL-FR-001 My Opportunities (agents) / company opportunities (Managers and Admins, read-only). */
export default function OpportunitiesPage() {
  const S = useCalmData()
  const { me, companies } = useScope()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const stage = (params.get('stage') ?? 'open') as SalesStage | 'open' | 'all'
  const [q, setQ] = useState('')
  const [dormant, setDormant] = useState<'all' | 'only' | 'hide'>('all')
  const [agent, setAgent] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  const isAgent = me.role === 'agent'
  const leadById = useMemo(() => new Map(S.leads.map((l) => [l.id, l])), [S.leads])

  const rows = useMemo(() => S.opportunities
    .filter((o) => companies.includes(o.companyId) && canViewOpportunity(S, me, o))
    .filter((o) => stage === 'all' || (stage === 'open' ? o.stage !== 'booked' && o.stage !== 'lost' : o.stage === stage))
    .filter((o) => dormant === 'all' || (dormant === 'only' ? !!o.dormant : !o.dormant))
    .filter((o) => agent === 'all' || leadById.get(o.leadId)!.ownerId === agent)
    .filter((o) => {
      if (!q.trim()) return true
      const l = leadById.get(o.leadId)!
      const s = q.toLowerCase()
      return l.fields.fullName.toLowerCase().includes(s) || l.ref.toLowerCase().includes(s) || l.fields.phone.replace(/\s/g, '').includes(s.replace(/\s/g, '')) || l.fields.email.toLowerCase().includes(s)
    })
    .sort((a, b) => (leadById.get(b.leadId)!.assignedAt ?? 0) - (leadById.get(a.leadId)!.assignedAt ?? 0)), [S, me, companies, stage, dormant, agent, q, leadById])
  const agents = S.users.filter((u) => u.role === 'agent' && companies.includes(u.companyIds[0]))

  return (
    <div>
      <PageHeader title={isAgent ? 'My opportunities' : 'Opportunities'} description={isAgent ? 'Leads arrive here already assigned by the shared distribution, with company, source, attribution, nationality and preferred contact time. There is no second Sales distribution.' : 'Opportunities in the companies you oversee. Only the owning agent works an opportunity.'} eyebrow={<span>SAL-FR-001 · AC-SAL-001-1</span>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} placeholder="Search name, ref, phone or email" className="pl-9" aria-label="Search opportunities" />
          </div>
          <Select value={stage} onChange={(e) => { setParams(e.target.value === 'open' ? {} : { stage: e.target.value }); setLimit(PAGE) }} className="w-52" aria-label="Stage">
            <option value="open">All open stages</option>
            <option value="all">All stages</option>
            {SALES_STAGES.map((s) => <option key={s} value={s}>{SALES_STAGE_LABEL[s]}</option>)}
          </Select>
          <Select value={dormant} onChange={(e) => setDormant(e.target.value as typeof dormant)} className="w-56" aria-label="Low Intent / Dormant">
            <option value="all">Include Low Intent / Dormant</option>
            <option value="only">Only Low Intent / Dormant</option>
            <option value="hide">Hide Low Intent / Dormant</option>
          </Select>
          {!isAgent && <Select value={agent} onChange={(e) => setAgent(e.target.value)} className="w-52" aria-label="Agent"><option value="all">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
          <span className="ml-auto text-[12.5px] text-slate-500 tabular-nums">{rows.length.toLocaleString()} opportunities</span>
        </div>
        {rows.length === 0 ? <EmptyState icon={Briefcase} title="No opportunities" description="Nothing matches these filters." /> : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[1040px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Customer</th><th className={th}>Stage</th><th className={th}>Funnel</th>{!isAgent && <th className={th}>Owner</th>}<th className={th}>Assigned</th><th className={th}>Source & attribution</th><th className={th}>Next action</th><th className={cn(th, 'relative')}><span className="sr-only">Open</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, limit).map((o) => {
                  const l = leadById.get(o.leadId)!
                  const next = S.tasks.filter((t) => t.oppId === o.id && !t.doneAt).sort((a, b) => a.due.at - b.due.at)[0]
                  const b = bookingOf(S, o)
                  const camp = S.campaigns.find((c) => c.id === l.campaignId)
                  return (
                    <tr key={o.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => navigate(`/sales/opportunities/${o.id}`)}>
                      <td className={td}>
                        <p className="font-medium text-slate-900">{l.fields.fullName}</p>
                        <p className="text-[11.5px] text-slate-400"><span className="font-mono">{l.ref}</span> · {l.fields.nationality || 'Nationality not given'}</p>
                      </td>
                      <td className={td}><span className="flex flex-wrap items-center gap-1"><StageBadge stage={o.stage} />{o.dormant && <DormantBadge />}{b && <UnsignedFlag booking={b} />}</span></td>
                      <td className={td}><StatusPill status={l.status} short /></td>
                      {!isAgent && <td className={td}><span className="inline-flex items-center gap-1.5 text-[12.5px]"><Avatar name={userName(S, l.ownerId)} size="xs" />{userName(S, l.ownerId)}</span></td>}
                      <td className={cn(td, 'text-[12.5px] whitespace-nowrap text-slate-500')} title={l.assignedAt ? fmtDateTime(l.assignedAt) : undefined}>{l.assignedAt ? fmtRelative(l.assignedAt, S.clock.now) : '—'}</td>
                      <td className={td}><SourceBadge source={l.source} /><span className="block text-[11.5px] text-slate-400"><CompanyTag id={o.companyId} className="text-[11.5px] font-normal" /> · {camp ? camp.name : 'No campaign data'}</span></td>
                      <td className={td}>
                        {o.contactPrompt ? <Badge tone="amber" icon={PhoneCall}>Contact now</Badge>
                          : next ? <span className={cn('text-[12px]', isTaskOverdue(next, S.clock.now) ? 'font-semibold text-rose-700' : 'text-slate-600')}>{next.title}{isTaskOverdue(next, S.clock.now) && ' · overdue'}</span>
                            : <span className="text-[12px] text-slate-400">—</span>}
                      </td>
                      <td className={cn(td, 'text-right')}><ChevronRight className="inline size-4 text-slate-300" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > limit && <div className="border-t border-slate-100 p-3 text-center"><Button size="sm" onClick={() => setLimit(limit + PAGE)}>Show more ({rows.length - limit} left)</Button></div>}
      </Card>
    </div>
  )
}
