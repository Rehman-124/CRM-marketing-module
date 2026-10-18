import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ScrollText, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, th, td, cn, type Tone } from '@/components/ui'
import { CompanyTag } from '@/components/domain'
import { useAppData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { userName } from '@/domain/engine'
import { fmtDateTime } from '@/lib/time'
import type { AuditType } from '@/domain/types'

const TYPE: Record<AuditType, { label: string; tone: Tone }> = {
  availability: { label: 'Availability', tone: 'amber' },
  absent: { label: 'Absent', tone: 'red' },
  'auto-assign': { label: 'Auto-assign', tone: 'neutral' },
  'manual-assign': { label: 'Manual assign', tone: 'brand' },
  'manual-unassign': { label: 'Manual unassign', tone: 'brand' },
  'manual-reassign': { label: 'Manual reassign', tone: 'brand' },
  'released-absent': { label: 'Absent release', tone: 'violet' },
  'no-eligible': { label: 'No eligible agent', tone: 'orange' },
  capacity: { label: 'Capacity', tone: 'teal' },
  'agent-added': { label: 'Agent added', tone: 'teal' },
  access: { label: 'Access', tone: 'teal' },
  'lead-created': { label: 'Lead created', tone: 'sky' },
  'enquiry-converted': { label: 'Converted', tone: 'sky' },
  status: { label: 'Status', tone: 'neutral' },
  'first-contact': { label: 'First contact', tone: 'green' },
  integration: { label: 'Integration', tone: 'red' },
  'sla-alert': { label: 'SLA alert', tone: 'red' },
  message: { label: 'Message sent', tone: 'sky' },
}
const PAGE = 40

export default function AuditPage() {
  const S = useAppData()
  const { companies } = useScope()
  const [type, setType] = useState<AuditType | 'all' | 'manual'>('manual')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const rows = useMemo(() => S.audit
    .filter((a) => !a.companyId || companies.includes(a.companyId))
    .filter((a) => type === 'all' || (type === 'manual' ? ['manual-assign', 'manual-unassign', 'manual-reassign', 'availability', 'absent', 'released-absent'].includes(a.type) : a.type === type))
    .filter((a) => !q || a.summary.toLowerCase().includes(q.toLowerCase()))
    .slice().reverse(), [S.audit, companies, type, q])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE)

  return (
    <div>
      <PageHeader title="Audit log" description="Manual assignment history, availability and Absent changes, automatic distribution decisions, SLA alerts and integration events." eyebrow={<span>P1-FR-004 · P3-FR-002 · AC-P1-004-8</span>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3">
          <Select value={type} onChange={(e) => { setType(e.target.value as AuditType | 'all' | 'manual'); setPage(0) }} className="w-64" aria-label="Event type">
            <option value="manual">Manual changes & availability</option>
            <option value="all">All events</option>
            {(Object.keys(TYPE) as AuditType[]).filter((t) => S.audit.some((a) => a.type === t)).map((t) => <option key={t} value={t}>{TYPE[t].label}</option>)}
          </Select>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Search events" className="pl-9" />
          </div>
          <span className="ml-auto text-[12.5px] text-slate-500 tabular-nums">{rows.length.toLocaleString()} events</span>
        </div>
        {slice.length === 0 ? <EmptyState icon={ScrollText} title="No events" description="Nothing matches the current filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>When (PKT)</th><th className={th}>Type</th><th className={th}>Event</th><th className={th}>Company</th><th className={th}>By</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {slice.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className={cn(td, 'text-[12.5px] whitespace-nowrap text-slate-500 tabular-nums')}>{fmtDateTime(a.at)}</td>
                    <td className={td}><Badge tone={TYPE[a.type].tone}>{TYPE[a.type].label}</Badge></td>
                    <td className={td}>{a.leadId ? <Link to={`/leads/${a.leadId}`} className="hover:text-brand-700 hover:underline">{a.summary}</Link> : a.summary}</td>
                    <td className={td}>{a.companyId ? <CompanyTag id={a.companyId} /> : <span className="text-slate-400">All</span>}</td>
                    <td className={cn(td, 'whitespace-nowrap')}>{userName(S, a.actorId)}</td>
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
