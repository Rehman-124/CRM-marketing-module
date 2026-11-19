import { useNavigate } from 'react-router-dom'
import { FileSignature, AlertTriangle, BellRing, CheckCircle2 } from 'lucide-react'
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, PendingTag, SimTag, Stat, th, td, cn } from '@/components/ui'
import { SignatureBadge, UnsignedFlag } from '@/components/sales/SalesWidgets'
import { useCalmData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { canViewOpportunity } from '@/domain/permissions'
import { userName } from '@/domain/engine'
import { fmtDateTime, fmtRelative } from '@/lib/time'
import { findLead, findOpp } from '@/domain/lookup'

/** SAL-FR-005 invoice panel list and escalation list. */
export default function InvoicesPage() {
  const S = useCalmData()
  const { me, companies } = useScope()
  const navigate = useNavigate()
  const cfg = S.salesConfig
  const rows = S.bookings.filter((b) => companies.includes(b.companyId)).filter((b) => me.role !== 'agent' || findLead(S, b.leadId)!.ownerId === me.id)
  const notGenerated = rows.filter((b) => b.invoice.status === 'not_generated')
  const sent = rows.filter((b) => b.invoice.status === 'sent')
  const escalated = sent.filter((b) => b.invoice.escalatedAt)
  const reminded = sent.filter((b) => b.invoice.remindedAt && !b.invoice.escalatedAt)
  const list = [...notGenerated, ...escalated, ...reminded, ...sent.filter((b) => !b.invoice.remindedAt)]

  return (
    <div>
      <PageHeader title="Invoices & escalations" eyebrow={<span>SAL-FR-005 · Pending technical validation</span>}
        description="Signature status (Not Generated → Sent → Signed) is separate from the Booking. An unsigned invoice never blocks work and never cancels the Booking."
        actions={<SimTag title="DigiSigner is pending technical validation. Sending and signing are simulated; nothing leaves the CRM.">DigiSigner simulated</SimTag>} />
      {(cfg.invoiceReminderDays == null || cfg.invoiceEscalationDays == null) && (
        <Callout tone="warning" className="mb-5" icon={BellRing} title="Reminder and escalation periods are not configured">
          v1.4 leaves the unsigned period before the agent reminder and the Manager alert pending (§13 Q7), so no reminders run. The Admin can enter demo values on Sales settings. <PendingTag>To be confirmed</PendingTag>
        </Callout>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Not generated" value={notGenerated.length} icon={AlertTriangle} tone={notGenerated.length ? 'red' : 'neutral'} sub="DigiSigner did not respond" />
        <Stat label="Sent · unsigned" value={sent.length} icon={FileSignature} tone={sent.length ? 'amber' : 'neutral'} />
        <Stat label="Escalated to a Manager" value={escalated.length} icon={BellRing} tone={escalated.length ? 'red' : 'neutral'} />
        <Stat label="Signed" value={rows.filter((b) => b.invoice.status === 'signed').length} icon={CheckCircle2} tone="green" />
      </div>
      <Card>
        <CardHeader title="Unsigned and failed invoices" description={`Reminder after ${cfg.invoiceReminderDays ?? '—'} day(s) · Manager alert after ${cfg.invoiceEscalationDays ?? '—'} day(s)`} />
        {list.length === 0 ? <EmptyState compact icon={CheckCircle2} title="Every invoice is signed" /> : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Booking</th><th className={th}>Customer</th><th className={th}>Agent</th><th className={th}>Signature</th><th className={th}>Sent</th><th className={th}>Escalation</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.slice(0, 150).map((b) => {
                  const o = findOpp(S, b.oppId)!
                  const l = findLead(S, b.leadId)!
                  const canOpen = canViewOpportunity(S, me, o)
                  return (
                    <tr key={b.id} className={cn(canOpen && 'cursor-pointer hover:bg-slate-50/60', b.invoice.escalatedAt && 'bg-rose-50/30')} onClick={() => canOpen && navigate(`/sales/opportunities/${o.id}`)}>
                      <td className={cn(td, 'font-mono text-[12px]')}>{b.ref}</td>
                      <td className={td}>{l.fields.fullName}</td>
                      <td className={cn(td, 'text-[12.5px]')}>{userName(S, l.ownerId)}</td>
                      <td className={td}><span className="flex flex-wrap gap-1"><SignatureBadge status={b.invoice.status} /><UnsignedFlag booking={b} /></span>{b.invoice.lastError && <span className="mt-0.5 block text-[11.5px] text-rose-600">{b.invoice.lastError}</span>}</td>
                      <td className={cn(td, 'text-[12px] text-slate-500')}>{b.invoice.sentAt ? `${fmtDateTime(b.invoice.sentAt)} (${fmtRelative(b.invoice.sentAt, S.clock.now)})` : '—'}</td>
                      <td className={td}>{b.invoice.escalatedAt ? <Badge tone="red">Manager alerted {fmtDateTime(b.invoice.escalatedAt)}</Badge> : b.invoice.remindedAt ? <Badge tone="amber">Agent reminded {fmtDateTime(b.invoice.remindedAt)}</Badge> : <span className="text-[12px] text-slate-400">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
