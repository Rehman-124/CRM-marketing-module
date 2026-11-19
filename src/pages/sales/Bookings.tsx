import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookCheck, Search, RotateCcw } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, th, td, cn } from '@/components/ui'
import { CompanyTag } from '@/components/domain'
import { RefundDialog, SignatureBadge, UnsignedFlag } from '@/components/sales/SalesWidgets'
import { useCalmData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { canRequestRefund, canViewOpportunity } from '@/domain/permissions'
import { userName } from '@/domain/engine'
import { caseOf, paymentTotals } from '@/domain/sales'
import type { Booking } from '@/domain/types'
import { fmtDateTime, fmtMoney } from '@/lib/time'
import { findLead, findOpp } from '@/domain/lookup'

/** SAL-FR-004 Booking list: total value, amount paid, outstanding balance, expected margin and owner. Helpline submits refunds here. */
export default function BookingsPage() {
  const S = useCalmData()
  const { me, companies } = useScope()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'balance' | 'unsigned' | 'refund'>('all')
  const [refundFor, setRefundFor] = useState<Booking | null>(null)
  const rows = useMemo(() => S.bookings
    .filter((b) => companies.includes(b.companyId))
    .map((b) => ({ b, o: findOpp(S, b.oppId)!, l: findLead(S, b.leadId)! }))
    .filter(({ b, o }) => filter === 'all' || (filter === 'balance' ? paymentTotals(S, o).outstanding > 0 : filter === 'unsigned' ? b.invoice.status !== 'signed' : S.refunds.some((r) => r.bookingId === b.id)))
    .filter(({ b, l }) => !q.trim() || l.fields.fullName.toLowerCase().includes(q.toLowerCase()) || b.ref.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.b.createdAt - a.b.createdAt), [S, companies, filter, q])

  return (
    <div>
      <PageHeader title="Bookings" description="Every Booking with total value, amount paid, outstanding balance, expected margin and owner. A refunded Booking is never deleted." eyebrow={<span>SAL-FR-004</span>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer or booking ref" className="pl-9" aria-label="Search bookings" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-56" aria-label="Filter">
            <option value="all">All bookings</option>
            <option value="balance">Balance outstanding</option>
            <option value="unsigned">Unsigned invoice</option>
            <option value="refund">With refund requests</option>
          </Select>
          <span className="ml-auto text-[12.5px] text-slate-500 tabular-nums">{rows.length} bookings</span>
        </div>
        {rows.length === 0 ? <EmptyState icon={BookCheck} title="No bookings" /> : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[1120px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Booking</th><th className={th}>Customer</th><th className={th}>Owner</th><th className={cn(th, 'text-right')}>Total</th><th className={cn(th, 'text-right')}>Paid</th><th className={cn(th, 'text-right')}>Outstanding</th><th className={cn(th, 'text-right')}>Expected margin</th><th className={th}>Invoice</th><th className={th}>Case</th><th className={cn(th, 'relative')}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 150).map(({ b, o, l }) => {
                  const t = paymentTotals(S, o)
                  const c = caseOf(S, o)
                  const canOpen = canViewOpportunity(S, me, o)
                  return (
                    <tr key={b.id} className={cn(canOpen && 'cursor-pointer hover:bg-slate-50/60')} onClick={() => canOpen && navigate(`/sales/opportunities/${o.id}`)}>
                      <td className={td}><span className="font-mono text-[12px]">{b.ref}</span><span className="block text-[11px] text-slate-400">{fmtDateTime(b.createdAt)}{b.createdVia === 'override' ? ' · override' : ''}</span></td>
                      <td className={td}><p className="font-medium text-slate-900">{l.fields.fullName}</p><CompanyTag id={b.companyId} className="text-[11.5px] font-normal" /></td>
                      <td className={cn(td, 'text-[12.5px]')}>{userName(S, l.ownerId)}</td>
                      <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(b.totalValue)}</td>
                      <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(t.paid)}</td>
                      <td className={cn(td, 'text-right tabular-nums')}>{t.outstanding > 0 ? <span className="font-medium text-amber-700">{fmtMoney(t.outstanding)}</span> : '—'}</td>
                      <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(b.expectedMargin)}</td>
                      <td className={td}><span className="flex flex-wrap gap-1"><SignatureBadge status={b.invoice.status} /><UnsignedFlag booking={b} /></span></td>
                      <td className={cn(td, 'text-[12px]')}>{c?.outcome ? <Badge tone={c.outcome.result === 'granted' ? 'green' : 'red'}>{c.outcome.result === 'granted' ? 'Granted' : 'Refused'}</Badge> : c?.status}</td>
                      <td className={cn(td, 'text-right')} onClick={(e) => e.stopPropagation()}>{canRequestRefund(S, me, o) && <Button size="xs" icon={RotateCcw} onClick={() => setRefundFor(b)}>Refund</Button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {refundFor && <RefundDialog booking={refundFor} open onClose={() => setRefundFor(null)} />}
    </div>
  )
}
