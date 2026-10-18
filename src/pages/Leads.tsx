import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Users2, UserPlus, ChevronLeft, ChevronRight, FileX } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, th, td, cn } from '@/components/ui'
import { CompanyTag, SlaChip, SourceBadge, StatusPill } from '@/components/domain'
import { OwnerCell } from '@/components/leads/LeadWidgets'
import { useAppData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { canCreateManualLead } from '@/domain/permissions'
import { ALL_SOURCES, ALL_STATUSES, SOURCE_LABEL, STATUS_LABEL } from '@/domain/constants'
import { fmtDateTime, fmtRelative } from '@/lib/time'
import type { FunnelStatus, LeadSource } from '@/domain/types'

const PAGE = 25

export default function LeadsPage() {
  const S = useAppData()
  const { companies, me } = useScope()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const status = (params.get('status') ?? 'all') as FunnelStatus | 'all'
  const source = (params.get('source') ?? 'all') as LeadSource | 'all'
  const assign = params.get('assign') ?? 'all'
  const attribution = params.get('attr') ?? 'all'
  const owner = params.get('owner') ?? 'all'
  const [page, setPage] = useState(0)
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v === 'all') p.delete(k); else p.set(k, v); setParams(p, { replace: true }); setPage(0) }

  const scoped = useMemo(() => S.leads.filter((l) => companies.includes(l.companyId)), [S.leads, companies])
  const agents = S.users.filter((u) => u.role === 'agent' && companies.includes(u.companyIds[0]))
  const rows = useMemo(() => scoped
    .filter((l) => status === 'all' || l.status === status)
    .filter((l) => source === 'all' || l.source === source)
    .filter((l) => assign === 'all' || (assign === 'unassigned' ? !l.ownerId : assign === 'uncontacted' ? !!l.ownerId && !l.firstContactAt && l.status !== 'lost' && l.status !== 'booked' : !!l.ownerId))
    .filter((l) => attribution === 'all' || (attribution === 'none' ? !l.campaignId : !!l.campaignId))
    .filter((l) => owner === 'all' || l.ownerId === owner)
    .filter((l) => !q || `${l.fields.fullName} ${l.ref} ${l.fields.phone} ${l.fields.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt), [scoped, status, source, assign, attribution, owner, q])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE)
  const campaignName = (id: string | null) => S.campaigns.find((c) => c.id === id)?.name
  const adName = (id: string | null) => S.ads.find((a) => a.id === id)?.name

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Every Lead from Meta Instant Forms, company websites, converted social enquiries, phone calls and emails — with company, source, campaign and ad attribution."
        actions={canCreateManualLead(S, me) && <Link to="/leads/new"><Button variant="primary" icon={UserPlus}>New manual lead</Button></Link>}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3">
          <div className="relative w-full md:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Search name, ref, phone, email" className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => set('status', e.target.value)} className="w-36" aria-label="Status">
            <option value="all">All statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
          <Select value={source} onChange={(e) => set('source', e.target.value)} className="w-44" aria-label="Source">
            <option value="all">All sources</option>
            {ALL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </Select>
          <Select value={assign} onChange={(e) => set('assign', e.target.value)} className="w-40" aria-label="Assignment">
            <option value="all">Any assignment</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="uncontacted">Awaiting first contact</option>
          </Select>
          <Select value={owner} onChange={(e) => set('owner', e.target.value)} className="w-40" aria-label="Owner">
            <option value="all">Any owner</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Select value={attribution} onChange={(e) => set('attr', e.target.value)} className="w-44" aria-label="Campaign data">
            <option value="all">Any attribution</option>
            <option value="with">With campaign data</option>
            <option value="none">No campaign data</option>
          </Select>
          <span className="ml-auto text-[12.5px] text-slate-500 tabular-nums">{rows.length.toLocaleString()} leads</span>
        </div>

        {slice.length === 0 ? (
          <EmptyState icon={Users2} title="No leads match" description="Try clearing a filter or switching company." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px]">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className={th}>Lead</th><th className={th}>Company</th><th className={th}>Source</th><th className={th}>Campaign / ad</th>
                  <th className={th}>Owner</th><th className={th}>Status</th><th className={th}>SLA</th><th className={cn(th, 'text-right')}>Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slice.map((l) => (
                  <tr key={l.id} onClick={() => navigate(`/leads/${l.id}`)} className="cursor-pointer transition hover:bg-slate-50/80">
                    <td className={td}>
                      <p className="font-medium text-slate-900">{l.fields.fullName}</p>
                      <p className="font-mono text-[11.5px] text-slate-400">{l.ref}</p>
                    </td>
                    <td className={td}><CompanyTag id={l.companyId} /></td>
                    <td className={td}><SourceBadge source={l.source} /></td>
                    <td className={cn(td, 'max-w-60')}>
                      {l.campaignId
                        ? <><p className="truncate text-[12.5px] font-medium text-slate-700">{campaignName(l.campaignId)}</p><p className="truncate text-[11.5px] text-slate-400">{adName(l.adId)}</p></>
                        : <Badge tone="neutral" icon={FileX}>No campaign data</Badge>}
                    </td>
                    <td className={td}><OwnerCell lead={l} /></td>
                    <td className={td}><StatusPill status={l.status} /></td>
                    <td className={td}><SlaChip lead={l} /></td>
                    <td className={cn(td, 'text-right text-[12px] whitespace-nowrap text-slate-500')} title={fmtDateTime(l.createdAt)}>{fmtRelative(l.createdAt, S.clock.now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
            <span className="text-[12.5px] text-slate-500 tabular-nums">Page {page + 1} of {pages}</span>
            <div className="flex gap-1.5">
              <Button size="sm" icon={ChevronLeft} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" iconRight={ChevronRight} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
