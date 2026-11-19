import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Briefcase, CalendarClock, CheckCircle2, ClipboardList, FileSignature, ListTodo, Receipt, PhoneCall, ChevronRight } from 'lucide-react'
import { Badge, Button, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, th, td, cn } from '@/components/ui'
import { CompanyTag } from '@/components/domain'
import { SignatureBadge, StageBadge, TaskDue, UnsignedFlag } from '@/components/sales/SalesWidgets'
import { useCalmData, useMe } from '@/store/store'
import { useAction } from '@/store/hooks'
import { SALES_STAGES, SALES_STAGE_LABEL, TASK_KIND_LABEL } from '@/domain/constants'
import { bookingOf, caseOf, completeTask, isTaskOverdue, oppPayments, paymentTotals, balanceBlocked } from '@/domain/sales'
import { isAbsent } from '@/domain/engine'
import { fmtMoney, ukDateKey } from '@/lib/time'
import { findOpp } from '@/domain/lookup'

/** SAL-FR-007: own opportunities by stage; tasks due, overdue and upcoming; payment, balance and invoice status; case milestone. */
export default function SalesWorkspacePage() {
  const S = useCalmData()
  const me = useMe()
  const act = useAction()
  const navigate = useNavigate()
  const now = S.clock.now
  const leadById = new Map(S.leads.map((l) => [l.id, l]))
  const mine = S.opportunities.filter((o) => leadById.get(o.leadId)!.ownerId === me.id)
  const ids = new Set(mine.map((o) => o.id))
  const openTasks = S.tasks.filter((t) => ids.has(t.oppId) && !t.doneAt)
  const overdue = openTasks.filter((t) => isTaskOverdue(t, now)).sort((a, b) => a.due.at - b.due.at)
  const today = ukDateKey(now)
  const dueToday = openTasks.filter((t) => !isTaskOverdue(t, now) && ukDateKey(t.due.at) === today).sort((a, b) => a.due.at - b.due.at)
  const upcoming = openTasks.filter((t) => !isTaskOverdue(t, now) && ukDateKey(t.due.at) > today).sort((a, b) => a.due.at - b.due.at)
  const prompts = mine.filter((o) => o.contactPrompt)
  const awaitingPay = mine.filter((o) => oppPayments(S, o.id).some((p) => p.status === 'awaiting'))
  const booked = mine.filter((o) => o.bookingId)
  const withBalance = booked.filter((o) => paymentTotals(S, o).outstanding > 0)
  const unsigned = booked.filter((o) => bookingOf(S, o)!.invoice.status !== 'signed')
  const activeCases = booked.filter((o) => !caseOf(S, o)?.outcome)

  const TaskList = ({ items, empty }: { items: typeof openTasks; empty: string }) => items.length === 0 ? <EmptyState compact icon={CheckCircle2} title={empty} /> : (
    <ul className="divide-y divide-slate-100">
      {items.slice(0, 12).map((t) => {
        const o = findOpp(S, t.oppId)!
        const l = leadById.get(o.leadId)!
        return (
          <li key={t.id} className={cn('px-5 py-2.5', isTaskOverdue(t, now) && 'bg-rose-50/40')}>
            <div className="flex items-start gap-3">
              <button onClick={() => navigate(`/sales/opportunities/${o.id}`)} className="min-w-0 flex-1 text-left">
                <p className="text-[13px] font-medium text-slate-800">{t.title}</p>
                <p className="truncate text-[11.5px] text-slate-500">{TASK_KIND_LABEL[t.kind]} · {l.fields.fullName} <span className="font-mono">{l.ref}</span></p>
              </button>
              {t.kind !== 'balance_payment' && <Button size="xs" icon={CheckCircle2} onClick={() => act((d) => completeTask(d, t.id, me.id), 'Task done')}>Done</Button>}
            </div>
            <div className="mt-1"><TaskDue task={t} now={now} /></div>
          </li>
        )
      })}
      {items.length > 12 && <li className="px-5 py-2 text-center text-[12px] text-slate-500">+{items.length - 12} more</li>}
    </ul>
  )

  return (
    <div>
      <PageHeader title="My Sales workspace" description="Your own opportunities, tasks, payments, invoices and service cases. Team Sales-performance dashboards are for Managers and Admins only." eyebrow={<span>SAL-FR-007 · AC-SAL-007-1</span>}
        actions={<Button variant="primary" icon={Briefcase} onClick={() => navigate('/sales/opportunities')}>My opportunities</Button>} />
      {isAbsent(me, now) && <Callout tone="danger" className="mb-4" title="You are marked Absent for this shift">Your active opportunities and bookings stay with you unless someone with Reassignment permission moves them.</Callout>}
      {prompts.length > 0 && (
        <Callout tone="warning" icon={PhoneCall} className="mb-4" title={`${prompts.length} new ${prompts.length === 1 ? 'Lead needs' : 'Leads need'} immediate contact`}
          action={<Button size="sm" onClick={() => navigate(`/sales/opportunities/${prompts[0].id}`)}>Open first</Button>}>
          No preferred contact time was given for {prompts.slice(0, 3).map((o) => leadById.get(o.leadId)!.fields.fullName).join(', ')}{prompts.length > 3 ? ' and others' : ''}.
        </Callout>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Overdue tasks" value={overdue.length} icon={AlertTriangle} tone={overdue.length ? 'red' : 'neutral'} />
        <Stat label="Due today (UK)" value={dueToday.length} icon={CalendarClock} tone="brand" />
        <Stat label="Awaiting Accounts" value={awaitingPay.length} icon={Receipt} tone={awaitingPay.length ? 'amber' : 'neutral'} />
        <Stat label="Balances outstanding" value={withBalance.length} icon={Receipt} tone={withBalance.length ? 'amber' : 'neutral'} />
        <Stat label="Unsigned invoices" value={unsigned.length} icon={FileSignature} tone={unsigned.length ? 'amber' : 'neutral'} />
      </div>

      <Card className="mb-5">
        <CardHeader icon={Briefcase} title="My opportunities by stage" description="Click a stage to open the filtered list." />
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 xl:grid-cols-8">
          {SALES_STAGES.map((s) => {
            const n = mine.filter((o) => o.stage === s).length
            return (
              <button key={s} onClick={() => navigate(`/sales/opportunities?stage=${s}`)} className="rounded-xl p-3 text-left ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-slate-300">
                <StageBadge stage={s} />
                <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{n}</p>
              </button>
            )
          })}
        </div>
        <p className="border-t border-slate-100 px-5 py-2 text-[12px] text-slate-500">{mine.filter((o) => o.dormant).length} marked Low Intent / Dormant · nothing is ever closed automatically.</p>
      </Card>

      <div className="mb-5 grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <Card><CardHeader icon={AlertTriangle} title="Overdue" description="Flagged — act on these first." /><TaskList items={overdue} empty="Nothing overdue" /></Card>
        <Card><CardHeader icon={ListTodo} title="Due today" description="UK-local day." /><TaskList items={dueToday} empty="Nothing due today" /></Card>
        <Card><CardHeader icon={CalendarClock} title="Upcoming" /><TaskList items={upcoming} empty="No upcoming tasks" /></Card>
      </div>

      <Card>
        <CardHeader icon={ClipboardList} title="Bookings in progress" description="Payment, balance, invoice status and case milestone of your booked opportunities." />
        {activeCases.length === 0 ? <EmptyState compact icon={ClipboardList} title="No active bookings" /> : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Customer</th><th className={th}>Booking</th><th className={cn(th, 'text-right')}>Paid / total</th><th className={th}>Invoice</th><th className={th}>Case milestone</th><th className={cn(th, 'relative')}><span className="sr-only">Open</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {activeCases.sort((a, b) => b.createdAt - a.createdAt).map((o) => {
                  const l = leadById.get(o.leadId)!
                  const b = bookingOf(S, o)!
                  const c = caseOf(S, o)!
                  const t = paymentTotals(S, o)
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/60">
                      <td className={td}><p className="font-medium text-slate-900">{l.fields.fullName}</p><CompanyTag id={o.companyId} /></td>
                      <td className={td}><span className="font-mono text-[12px]">{b.ref}</span></td>
                      <td className={cn(td, 'text-right tabular-nums')}>{fmtMoney(t.paid)} / {fmtMoney(t.total)}{t.outstanding > 0 && <span className="block text-[11.5px] text-amber-700">{fmtMoney(t.outstanding)} due</span>}</td>
                      <td className={td}><span className="flex flex-wrap gap-1"><SignatureBadge status={b.invoice.status} /><UnsignedFlag booking={b} /></span></td>
                      <td className={td}><span className="text-[12.5px]">{c.status}</span>{balanceBlocked(S, c) && <Badge tone="red" className="ml-1.5">Balance gate</Badge>}</td>
                      <td className={cn(td, 'text-right')}><Button size="xs" variant="ghost" iconRight={ChevronRight} onClick={() => navigate(`/sales/opportunities/${o.id}`)}>Open</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-4 text-[11.5px] text-slate-400">Stages: {SALES_STAGES.map((s) => SALES_STAGE_LABEL[s]).join(' · ')}</p>
    </div>
  )
}
