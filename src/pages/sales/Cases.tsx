import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Briefcase, Search, Ban } from 'lucide-react'
import { Avatar, Badge, Card, EmptyState, Input, PageHeader, Select, Stat, th, td, cn } from '@/components/ui'
import { CompanyTag } from '@/components/domain'
import { CasePanel } from '@/components/sales/CasePanel'
import { UnsignedFlag } from '@/components/sales/SalesWidgets'
import { useAppData, useCalmData, useMe } from '@/store/store'
import { useScope } from '@/store/hooks'
import { canViewCase } from '@/domain/permissions'
import { userName } from '@/domain/engine'
import { balanceBlocked } from '@/domain/sales'
import { fmtDateTime } from '@/lib/time'
import { NotFound, PermissionDenied } from '../Errors'
import { findOpp } from '@/domain/lookup'

/** SAL-FR-006 Service/Visa Cases (Processing is the Fulfilment Owner). */
export default function CasesPage() {
  const S = useCalmData()
  const { me, companies } = useScope()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [view, setView] = useState<'action' | 'open' | 'done' | 'all'>('action')
  const rows = useMemo(() => S.cases
    .filter((c) => companies.includes(c.companyId) && canViewCase(S, me, c))
    .map((c) => ({ c, l: S.leads.find((l) => l.id === findOpp(S, c.oppId)!.leadId)!, b: S.bookings.find((b) => b.id === c.bookingId)! }))
    .filter(({ c }) => view === 'all' || (view === 'done' ? !!c.outcome : view === 'open' ? !c.outcome : !c.outcome && (c.options.length === 0 || (c.selection && !c.appointment) || c.checklist.some((i) => i.owner === 'processing' && !i.doneAt))))
    .filter(({ c, l }) => !q.trim() || l.fields.fullName.toLowerCase().includes(q.toLowerCase()) || c.ref.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.c.createdAt - a.c.createdAt), [S, me, companies, view, q])
  const all = S.cases.filter((c) => companies.includes(c.companyId))

  return (
    <div>
      <PageHeader title="Service / Visa Cases" description="Created by every Booking with the verified draft. Processing records options, books the appointment, completes cost items and records Granted or Refused; the agent stays the Customer Relationship Owner." eyebrow={<span>SAL-FR-006</span>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Options pending" value={all.filter((c) => !c.options.length).length} icon={Briefcase} tone="brand" />
        <Stat label="Waiting for appointment" value={all.filter((c) => c.selection && !c.appointment).length} icon={Briefcase} tone="amber" />
        <Stat label="Balance gate" value={all.filter((c) => balanceBlocked(S, c)).length} icon={Ban} tone="red" />
        <Stat label="Outcome recorded" value={all.filter((c) => c.outcome).length} icon={Briefcase} tone="green" />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer or case ref" className="pl-9" aria-label="Search cases" />
          </div>
          <Select value={view} onChange={(e) => setView(e.target.value as typeof view)} className="w-56" aria-label="View">
            <option value="action">Needs Processing action</option>
            <option value="open">All open cases</option>
            <option value="done">Outcome recorded</option>
            <option value="all">All cases</option>
          </Select>
          <span className="ml-auto text-[12.5px] text-slate-500 tabular-nums">{rows.length} cases</span>
        </div>
        {rows.length === 0 ? <EmptyState icon={Briefcase} title="No cases here" /> : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[960px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Case</th><th className={th}>Customer</th><th className={th}>Relationship owner</th><th className={th}>Status</th><th className={th}>Checklist</th><th className={th}>Flags</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 150).map(({ c, l, b }) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => navigate(`/sales/cases/${c.id}`)}>
                    <td className={td}><span className="font-mono text-[12px]">{c.ref}</span><span className="block text-[11px] text-slate-400">{b.ref} · {fmtDateTime(c.createdAt)}</span></td>
                    <td className={td}><p className="font-medium text-slate-900">{l.fields.fullName}</p><CompanyTag id={c.companyId} className="text-[11.5px] font-normal" /></td>
                    <td className={cn(td, 'text-[12.5px]')}><span className="inline-flex items-center gap-1.5"><Avatar name={userName(S, l.ownerId)} size="xs" />{userName(S, l.ownerId)}</span></td>
                    <td className={td}><Badge tone={c.outcome ? (c.outcome.result === 'granted' ? 'green' : 'red') : 'brand'} dot>{c.status}</Badge></td>
                    <td className={cn(td, 'text-[12.5px] tabular-nums')}>{c.checklist.filter((i) => i.doneAt).length}/{c.checklist.length}</td>
                    <td className={td}><span className="flex flex-wrap gap-1">{balanceBlocked(S, c) && <Badge tone="red" icon={Ban}>Balance gate</Badge>}<UnsignedFlag booking={b} />{c.draftVersion == null && <Badge tone="amber">No verified draft</Badge>}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export function CaseDetailPage() {
  const { id } = useParams()
  const S = useAppData()
  const me = useMe()
  const navigate = useNavigate()
  const c = S.cases.find((x) => x.id === id)
  if (!c) return <NotFound />
  if (!canViewCase(S, me, c)) return <PermissionDenied />
  const l = S.leads.find((x) => x.id === findOpp(S, c.oppId)!.leadId)!
  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Back</button>
      <PageHeader title={`${l.fields.fullName} · ${c.ref}`} eyebrow={<><CompanyTag id={c.companyId} /><span>·</span><span>SAL-FR-006</span></>} description="Processing works the case; the agent handles all customer communication." />
      <CasePanel c={c} />
    </div>
  )
}
