import { useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { Button, Callout, Card, CardHeader, Field, Input, PageHeader, PendingTag, th, td, cn } from '@/components/ui'
import { useAppData, useMe } from '@/store/store'
import { useAction } from '@/store/hooks'
import { setSalesConfig } from '@/domain/sales'
import { SERVICE_ITEM_LABEL } from '@/domain/constants'
import type { ServiceItemKey } from '@/domain/types'

/** Admin configuration for the Sales values v1.4 leaves "to be confirmed". Every value here is a placeholder. */
export default function SalesSettingsPage() {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const cfg = S.salesConfig
  const [costs, setCosts] = useState<Record<ServiceItemKey, string>>(() => Object.fromEntries(Object.entries(cfg.expectedCosts).map(([k, v]) => [k, String(v)])) as Record<ServiceItemKey, string>)
  const [rem, setRem] = useState(cfg.invoiceReminderDays?.toString() ?? '')
  const [esc, setEsc] = useState(cfg.invoiceEscalationDays?.toString() ?? '')
  const [ret, setRet] = useState(cfg.retentionDays?.toString() ?? '')
  const [link, setLink] = useState(String(cfg.linkMinutes))
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Sales settings" description="Values that v1.4 marks “to be confirmed”. They are demo placeholders, not approved business rules, and every change is audit-logged." eyebrow={<span>SAL-FR-003 · SAL-FR-005 · SAL-FR-008</span>} />
      <Callout tone="warning" className="mb-5" title="Placeholders only">The expected-cost items per package, who maintains them, the margin formula, the unsigned-invoice periods, the retention period and the link lifetime are all pending decisions.</Callout>
      <Card className="mb-5">
        <CardHeader icon={Settings2} title="Configured expected case costs" description="Used for the expected margin: agreed amount − the cost of each included item that costs the company money." actions={<PendingTag title="SAL-FR-003: expected-cost items per package, who maintains them and the formula are to be confirmed.">To be confirmed</PendingTag>} />
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Service item</th><th className={cn(th, 'text-right')}>Expected cost (£)</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(Object.keys(SERVICE_ITEM_LABEL) as ServiceItemKey[]).map((k) => (
              <tr key={k}><td className={td}>{SERVICE_ITEM_LABEL[k]}</td><td className={cn(td, 'text-right')}><Input aria-label={`${SERVICE_ITEM_LABEL[k]} cost`} type="number" min={0} step="0.01" value={costs[k]} onChange={(e) => setCosts({ ...costs, [k]: e.target.value })} className="ml-auto w-28 text-right" /></td></tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <Button variant="primary" icon={Save} onClick={() => act((d) => setSalesConfig(d, { expectedCosts: Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, Number(v)])) as Record<ServiceItemKey, number> }, me.id), 'Expected costs saved', 'Margins of open quotes recalculate. Existing Bookings keep the margin stored at booking.')}>Save costs</Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Periods & data protection" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label={<span className="flex items-center gap-2">Unsigned invoice → agent reminder (days) <PendingTag>§13 Q7</PendingTag></span>} hint="Empty = not configured (no reminders run)."><Input type="number" min={1} value={rem} onChange={(e) => setRem(e.target.value)} /></Field>
          <Field label={<span className="flex items-center gap-2">Unsigned invoice → Manager alert (days) <PendingTag>§13 Q7</PendingTag></span>} hint="Must be longer than the reminder period."><Input type="number" min={1} value={esc} onChange={(e) => setEsc(e.target.value)} /></Field>
          <Field label={<span className="flex items-center gap-2">Raw sensitive file retention (days) <PendingTag>TBC</PendingTag></span>} hint="Empty = not configured. When set, scheduled deletion removes raw files and keeps metadata."><Input type="number" min={1} value={ret} onChange={(e) => setRet(e.target.value)} /></Field>
          <Field label={<span className="flex items-center gap-2">Short-lived file link (minutes) <PendingTag>TBC</PendingTag></span>} hint="1–60 minutes."><Input type="number" min={1} max={60} value={link} onChange={(e) => setLink(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <Button variant="primary" icon={Save} onClick={() => act((d) => setSalesConfig(d, { invoiceReminderDays: num(rem), invoiceEscalationDays: num(esc), retentionDays: num(ret), linkMinutes: Number(link) }, me.id), 'Settings saved', 'Reminders and retention run on the simulated clock.')}>Save settings</Button>
        </div>
      </Card>
    </div>
  )
}
