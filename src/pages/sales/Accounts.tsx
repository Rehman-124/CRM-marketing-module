import { useState } from 'react'
import { CheckCircle2, XCircle, Receipt, RotateCcw, Wallet, Clock } from 'lucide-react'
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PendingTag, Segmented, Stat, th, td, cn } from '@/components/ui'
import { CompanyTag } from '@/components/domain'
import { ExpenseDialog, MarginPill, PaymentStatusBadge, RejectPaymentDialog } from '@/components/sales/SalesWidgets'
import { useCalmData, useMe } from '@/store/store'
import { useAction, useScope } from '@/store/hooks'
import { decidePayment, decideRefund, expectedMargin, paymentTotals } from '@/domain/sales'
import { userName } from '@/domain/engine'
import type { Booking, PaymentRequest } from '@/domain/types'
import { fmtDateTime, fmtMoney, fmtRelative } from '@/lib/time'
import { findLead } from '@/domain/lookup'

/** SAL-FR-004 Accounts verification queue: only Accounts confirms or rejects payments and decides refunds. */
export default function AccountsPage() {
  const S = useCalmData()
  const me = useMe()
  const { companies } = useScope()
  const act = useAction()
  const [view, setView] = useState<'queue' | 'decided' | 'refunds' | 'expenses'>('queue')
  const [reject, setReject] = useState<PaymentRequest | null>(null)
  const [expense, setExpense] = useState<Booking | null>(null)
  const oppById = new Map(S.opportunities.map((o) => [o.id, o]))
  const leadOf = (oppId: string) => S.leads.find((l) => l.id === oppById.get(oppId)!.leadId)!
  const pays = S.payments.filter((p) => companies.includes(oppById.get(p.oppId)!.companyId))
  const queue = pays.filter((p) => p.status === 'awaiting').sort((a, b) => a.submittedAt - b.submittedAt)
  const decided = pays.filter((p) => p.status !== 'awaiting').sort((a, b) => b.decidedAt! - a.decidedAt!)
  const refunds = S.refunds.filter((r) => companies.includes(S.bookings.find((b) => b.id === r.bookingId)!.companyId)).sort((a, b) => (a.status === 'requested' ? -1 : 1) - (b.status === 'requested' ? -1 : 1) || b.requestedAt - a.requestedAt)
  const bookings = S.bookings.filter((b) => companies.includes(b.companyId)).sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div>
      <PageHeader title="Accounts" description="Verify payment proof by hand (MVP), decide refunds and record actual expenses. A confirmed first payment with expected margin above £60 creates the Booking automatically." eyebrow={<span>SAL-FR-004 · AC-SAL-004-2 · AC-SAL-004-7</span>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting verification" value={queue.length} icon={Clock} tone={queue.length ? 'amber' : 'neutral'} onClick={() => setView('queue')} />
        <Stat label="Refunds to decide" value={refunds.filter((r) => r.status === 'requested').length} icon={RotateCcw} tone={refunds.some((r) => r.status === 'requested') ? 'red' : 'neutral'} onClick={() => setView('refunds')} />
        <Stat label="Bookings without actual expenses" value={bookings.filter((b) => !b.expenses.length).length} icon={Wallet} sub="Actual margin pending Accounts data" onClick={() => setView('expenses')} />
        <Stat label="Confirmed payments" value={decided.filter((p) => p.status === 'confirmed').length} icon={CheckCircle2} tone="green" onClick={() => setView('decided')} />
      </div>
      <div className="mb-4"><Segmented value={view} onChange={setView} options={[{ value: 'queue', label: 'Verification queue', count: queue.length }, { value: 'decided', label: 'Decided' }, { value: 'refunds', label: 'Refunds', count: refunds.filter((r) => r.status === 'requested').length }, { value: 'expenses', label: 'Actual expenses' }]} /></div>

      {(view === 'queue' || view === 'decided') && (
        <Card>
          {(view === 'queue' ? queue : decided).length === 0 ? <EmptyState icon={Receipt} title={view === 'queue' ? 'Nothing to verify' : 'No decided payments'} /> : (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[1000px]">
                <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Customer</th><th className={th}>Agent</th><th className={th}>Type</th><th className={cn(th, 'text-right')}>Amount</th><th className={th}>Proof</th><th className={th}>Expected margin</th><th className={th}>{view === 'queue' ? 'Waiting' : 'Decision'}</th><th className={cn(th, 'relative')}><span className="sr-only">Actions</span></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(view === 'queue' ? queue : decided.slice(0, 120)).map((p) => {
                    const o = oppById.get(p.oppId)!
                    const l = leadOf(p.oppId)
                    const t = paymentTotals(S, o)
                    return (
                      <tr key={p.id}>
                        <td className={td}><p className="font-medium text-slate-900">{l.fields.fullName}</p><p className="text-[11.5px] text-slate-400"><span className="font-mono">{l.ref}</span> · <CompanyTag id={o.companyId} className="text-[11.5px] font-normal" /></p></td>
                        <td className={cn(td, 'text-[12.5px]')}>{userName(S, p.submittedBy)}</td>
                        <td className={td}>{p.balance ? <Badge tone="violet">Balance</Badge> : p.type === 'full' ? 'Full' : 'Partial'}</td>
                        <td className={cn(td, 'text-right tabular-nums')}><b>{fmtMoney(p.amount)}</b><span className="block text-[11px] text-slate-400">of {fmtMoney(t.total)}</span></td>
                        <td className={cn(td, 'text-[12px] text-slate-500')}>{p.proofName}</td>
                        <td className={td}>{o.quote && !p.balance ? <MarginPill margin={expectedMargin(S.salesConfig, o.quote)} /> : <span className="text-slate-400">—</span>}</td>
                        <td className={cn(td, 'text-[12px] text-slate-500')}>{view === 'queue' ? fmtRelative(p.submittedAt, S.clock.now) : <><PaymentStatusBadge p={p} /><span className="block">{fmtDateTime(p.decidedAt!)} · {userName(S, p.decidedBy)}</span></>}</td>
                        <td className={cn(td, 'text-right whitespace-nowrap')}>
                          {view === 'queue' && <>
                            <Button size="xs" variant="primary" icon={CheckCircle2} onClick={() => act((d) => decidePayment(d, p.id, 'confirm', me.id), 'Payment confirmed', p.balance ? 'Balance updated.' : 'If the expected margin is above £60 the Booking was created automatically.')}>Confirm</Button>
                            <Button size="xs" variant="danger" icon={XCircle} className="ml-1.5" onClick={() => setReject(p)}>Reject</Button>
                          </>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-slate-100 px-5 py-2.5 text-[11.5px] text-slate-500">Rejection reason: {S.params.rejectionReasonRequired ? 'required' : 'optional'} <PendingTag>To be confirmed</PendingTag></p>
        </Card>
      )}

      {view === 'refunds' && (
        <Card>
          <CardHeader icon={RotateCcw} title="Refund Requests" description="Linked to the Booking and case. Approving never deletes the Booking; the amount reduces actual margin in the month it is approved." />
          {refunds.length === 0 ? <EmptyState compact icon={RotateCcw} title="No refund requests" /> : (
            <ul className="divide-y divide-slate-100">
              {refunds.map((r) => {
                const b = S.bookings.find((x) => x.id === r.bookingId)!
                const l = findLead(S, b.leadId)!
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-slate-800">{fmtMoney(r.amount)} · {l.fields.fullName} <span className="font-mono text-[11.5px] text-slate-400">{b.ref}</span></span>
                      <span className="block text-[12px] text-slate-500">{r.note}</span>
                      <span className="block text-[11.5px] text-slate-400">Requested by {userName(S, r.requestedBy)} · {fmtDateTime(r.requestedAt)}</span>
                    </span>
                    {r.status === 'requested' ? <>
                      <Button size="sm" variant="primary" onClick={() => act((d) => decideRefund(d, r.id, true, me.id), 'Refund approved', 'The Booking stays Booked.')}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => act((d) => decideRefund(d, r.id, false, me.id), 'Refund rejected')}>Reject</Button>
                    </> : <Badge tone={r.status === 'approved' ? 'green' : 'red'}>{r.status === 'approved' ? 'Approved' : 'Rejected'} · {fmtDateTime(r.decidedAt!)}</Badge>}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {view === 'expenses' && (
        <Card>
          <CardHeader icon={Wallet} title="Actual expenses" description="Actual margin appears in Sales reports only when Accounts data exists (AC-SAL-007-4)." />
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Booking</th><th className={th}>Customer</th><th className={cn(th, 'text-right')}>Total value</th><th className={cn(th, 'text-right')}>Expected margin</th><th className={cn(th, 'text-right')}>Actual expenses</th><th className={cn(th, 'relative')}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.slice(0, 120).map((b) => (
                  <tr key={b.id}>
                    <td className={cn(td, 'font-mono text-[12px]')}>{b.ref}</td>
                    <td className={td}>{findLead(S, b.leadId)!.fields.fullName}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(b.totalValue)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(b.expectedMargin)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{b.expenses.length ? fmtMoney(b.expenses.reduce((s, e) => s + e.amount, 0)) : <span className="text-slate-400">Not recorded</span>}</td>
                    <td className={cn(td, 'text-right')}><Button size="xs" onClick={() => setExpense(b)}>Record expense</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {reject && <RejectPaymentDialog payment={reject} open onClose={() => setReject(null)} />}
      {expense && <ExpenseDialog booking={expense} open onClose={() => setExpense(null)} />}
    </div>
  )
}
