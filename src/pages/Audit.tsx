import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ScrollText, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, th, td, cn, type Tone } from '@/components/ui'
import { CompanyTag } from '@/components/domain'
import { useCalmData } from '@/store/store'
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
  'no-eligible': { label: 'Left Unassigned', tone: 'orange' },
  'agent-added': { label: 'Agent added', tone: 'teal' },
  access: { label: 'Access', tone: 'teal' },
  'lead-created': { label: 'Lead created', tone: 'sky' },
  'enquiry-converted': { label: 'Converted', tone: 'sky' },
  status: { label: 'Status', tone: 'neutral' },
  'first-contact': { label: 'First contact', tone: 'green' },
  integration: { label: 'Integration', tone: 'red' },
  'sla-alert': { label: 'SLA alert', tone: 'red' },
  message: { label: 'Message sent', tone: 'sky' },
  permission: { label: 'Permission', tone: 'teal' },
  referral: { label: 'Referral', tone: 'sky' },
  stage: { label: 'Sales stage', tone: 'neutral' },
  'contact-attempt': { label: 'Contact attempt', tone: 'green' },
  task: { label: 'Task', tone: 'neutral' },
  qualification: { label: 'Qualification', tone: 'neutral' },
  draft: { label: 'Client draft', tone: 'violet' },
  quote: { label: 'Quote', tone: 'brand' },
  payment: { label: 'Payment', tone: 'amber' },
  booking: { label: 'Booking', tone: 'green' },
  override: { label: 'Margin override', tone: 'orange' },
  refund: { label: 'Refund', tone: 'red' },
  expense: { label: 'Actual expense', tone: 'teal' },
  invoice: { label: 'Invoice', tone: 'sky' },
  case: { label: 'Service case', tone: 'violet' },
  'sensitive-access': { label: 'Sensitive access', tone: 'red' },
  document: { label: 'Document', tone: 'neutral' },
  retention: { label: 'Retention deletion', tone: 'orange' },
  'sales-config': { label: 'Sales configuration', tone: 'teal' },
}
const SALES_TYPES: AuditType[] = ['stage', 'contact-attempt', 'task', 'qualification', 'draft', 'quote', 'payment', 'booking', 'override', 'refund', 'expense', 'invoice', 'case', 'referral']
const SECURITY_TYPES: AuditType[] = ['sensitive-access', 'document', 'retention', 'permission', 'access', 'sales-config']
const PAGE = 40

export default function AuditPage() {
  const S = useCalmData()
  const { companies } = useScope()
  const [type, setType] = useState<AuditType | 'all' | 'manual' | 'sales' | 'security'>('manual')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const rows = useMemo(() => S.audit
    .filter((a) => !a.companyId || companies.includes(a.companyId))
    .filter((a) => type === 'all' || (type === 'manual' ? ['manual-assign', 'manual-unassign', 'manual-reassign', 'availability', 'absent', 'released-absent'].includes(a.type) : type === 'sales' ? SALES_TYPES.includes(a.type) : type === 'security' ? SECURITY_TYPES.includes(a.type) : a.type === type))
    .filter((a) => !q || a.summary.toLowerCase().includes(q.toLowerCase()))
    .slice().reverse(), [S.audit, companies, type, q])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE)

  return (
    <div>
      <PageHeader title="Audit log" description="Manual assignment history, availability and Absent changes, distribution decisions, SLA alerts, integration events, important Sales status changes, permission changes and sensitive-data access." eyebrow={<span>AC-P1-003-9 · AC-P2-003-5 · AC-SAL-008-4</span>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3">
          <Select value={type} onChange={(e) => { setType(e.target.value as typeof type); setPage(0) }} className="w-64" aria-label="Event type">
            <option value="manual">Manual changes & availability</option>
            <option value="sales">Sales status changes</option>
            <option value="security">Sensitive data & permissions</option>
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
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>When (PKT)</th><th className={th}>Type</th><th className={th}>Event</th><th className={th}>Company</th><th className={th}>By</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {slice.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className={cn(td, 'text-[12.5px] whitespace-nowrap text-slate-500 tabular-nums')}>{fmtDateTime(a.at)}</td>
                    <td className={td}><Badge tone={TYPE[a.type].tone}>{TYPE[a.type].label}</Badge></td>
                    <td className={td}>{a.oppId ? <Link to={`/sales/opportunities/${a.oppId}`} className="hover:text-brand-700 hover:underline">{a.summary}</Link> : a.leadId ? <Link to={`/leads/${a.leadId}`} className="hover:text-brand-700 hover:underline">{a.summary}</Link> : a.summary}</td>
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
