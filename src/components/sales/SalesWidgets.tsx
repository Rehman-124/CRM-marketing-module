import { useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDollarSign, FileSignature, Phone, MessageCircle, ShieldAlert, Share2, XCircle, Clock } from 'lucide-react'
import { Badge, Button, Callout, Field, Input, PendingTag, Select, Textarea, cn, type Tone } from '../ui'
import { Dialog } from '../ui/overlay'
import { useAppData, useMe } from '@/store/store'
import { useAction } from '@/store/hooks'
import {
  OUTCOME_LABEL, OUTCOMES, SALES_STAGE_LABEL, TASK_KIND_LABEL, MIN_PARTIAL_PAYMENT, BOOKING_MARGIN_THRESHOLD, EMPTY_FIELDS, FIELD_LABEL, STANDARD_FIELDS,
} from '@/domain/constants'
import {
  createReferral, createTask, expectedMargin, fmtDue, isTaskOverdue, logAttempt, markLost, overrideMargin, paymentTotals, requestRefund, submitPayment,
  recordExpense, decidePayment,
} from '@/domain/sales'
import type { Booking, ContactOutcome, CustomerFields, Opportunity, PaymentRequest, SalesStage, SalesTask, SignatureStatus, TaskKind } from '@/domain/types'
import { fmtMoney, fmtUK, fromUKInput, toUKInput, HOUR } from '@/lib/time'
import { findLead, findOpp } from '@/domain/lookup'

export const STAGE_TONE: Record<SalesStage, Tone> = {
  new: 'sky', contacting: 'brand', qualified: 'violet', quoted: 'orange', data_verification: 'amber', awaiting_payment: 'teal', booked: 'green', lost: 'neutral',
}

export function StageBadge({ stage }: { stage: SalesStage }) {
  return <Badge tone={STAGE_TONE[stage]} dot>{SALES_STAGE_LABEL[stage]}</Badge>
}

export function DormantBadge() {
  return <Badge tone="neutral" title="Low Intent / Dormant — searchable and can be reactivated">Low Intent / Dormant</Badge>
}

const SIG_LABEL: Record<SignatureStatus, string> = { not_generated: 'Not Generated', sent: 'Sent', signed: 'Signed' }
export function SignatureBadge({ status }: { status: SignatureStatus }) {
  return <Badge tone={status === 'signed' ? 'green' : status === 'sent' ? 'sky' : 'neutral'} icon={FileSignature}>{SIG_LABEL[status]}</Badge>
}

/** SAL-FR-005: shown on the Booking and case while unsigned; never blocks work. */
export function UnsignedFlag({ booking }: { booking: Booking }) {
  if (booking.invoice.status === 'signed') return null
  return <Badge tone="amber" icon={AlertTriangle} title="Unsigned Invoice — never blocks appointment or document work and never cancels the Booking">Unsigned Invoice</Badge>
}

export function PaymentStatusBadge({ p }: { p: PaymentRequest }) {
  if (p.status === 'awaiting') return <Badge tone="amber" dot>Awaiting verification</Badge>
  if (p.status === 'confirmed') return <Badge tone="green" icon={CheckCircle2}>Confirmed</Badge>
  return <Badge tone="red" icon={XCircle}>Rejected</Badge>
}

export function TaskDue({ task, now }: { task: SalesTask; now: number }) {
  const overdue = isTaskOverdue(task, now)
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12px] whitespace-nowrap tabular-nums', task.doneAt ? 'text-slate-400' : overdue ? 'font-semibold text-rose-700' : 'text-slate-600')}>
      {overdue ? <AlertTriangle className="size-3.5" /> : <CalendarClock className="size-3.5" />}
      {fmtDue(task.due)}{overdue && ' · overdue'}
    </span>
  )
}

export function MarginPill({ margin }: { margin: number }) {
  const ok = margin > BOOKING_MARGIN_THRESHOLD
  return <Badge tone={ok ? 'green' : 'red'} icon={CircleDollarSign} title={ok ? 'Above £60 — bookable once Accounts confirms payment' : '£60 or less — not bookable without an authorised override'}>{fmtMoney(margin)} {ok ? '· bookable' : '· not bookable'}</Badge>
}

// ------------------------------------------------------------------ Contact attempt (SAL-FR-001)

export function AttemptDialog({ opp, channel, open, onClose }: { opp: Opportunity; channel: 'call' | 'whatsapp'; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const lead = findLead(S, opp.leadId)!
  const openContactTask = S.tasks.some((t) => t.oppId === opp.id && t.kind === 'contact' && !t.doneAt)
  const [outcome, setOutcome] = useState<ContactOutcome | ''>('')
  const [note, setNote] = useState('')
  const [callback, setCallback] = useState(false)
  const [cbAt, setCbAt] = useState(toUKInput(S.clock.now + 2 * HOUR))
  const [doneTask, setDoneTask] = useState(true)
  const [firstContact, setFirstContact] = useState(false)
  const [tried, setTried] = useState(false)
  const cbTime = callback ? fromUKInput(cbAt) : null
  const save = () => {
    setTried(true)
    if (!outcome || (callback && !cbTime)) return
    const r = act((d) => logAttempt(d, opp.id, { channel, outcome, note, callbackAt: cbTime, completeContactTask: openContactTask && doneTask, recordFirstContact: firstContact }, me.id), 'Contact attempt saved', `${OUTCOME_LABEL[outcome]} — added to the timeline.${callback ? ' Callback task created.' : ''}`)
    if (r.ok) { onClose(); setOutcome(''); setNote(''); setCallback(false); setTried(false); setFirstContact(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title={channel === 'call' ? 'Log a call' : 'Log a WhatsApp contact'}
      description={<>No telephony is connected, so the outcome is entered by hand. Logging an attempt never changes the Sales stage. {channel === 'call' ? <>Number: <b>{lead.fields.phone || 'not provided'}</b></> : null}</>}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save attempt</Button></>}>
      <div className="space-y-4">
        <Field label="Outcome" required error={tried && !outcome ? 'Choose one of the five outcomes' : undefined}>
          <div role="radiogroup" aria-label="Outcome" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {OUTCOMES.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => setOutcome(o)} className={cn('h-9 rounded-lg text-[13px] font-medium ring-1 ring-inset', outcome === o ? 'bg-brand-50 text-brand-700 ring-brand-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>{OUTCOME_LABEL[o]}</button>
            ))}
          </div>
        </Field>
        <Field label="Note" hint="Optional."><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" /></Field>
        <label className="flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" className="size-4 accent-brand-600" checked={callback} onChange={(e) => setCallback(e.target.checked)} />The client asked for a callback</label>
        {callback && (
          <Field label="Callback time (UK)" required error={tried && !cbTime ? 'Choose the callback date and time' : undefined} hint="Becomes a dated follow-up task. Overdue tasks are flagged.">
            <Input type="datetime-local" value={cbAt} onChange={(e) => setCbAt(e.target.value)} />
          </Field>
        )}
        {openContactTask && <label className="flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" className="size-4 accent-brand-600" checked={doneTask} onChange={(e) => setDoneTask(e.target.checked)} />Mark the open contact task as done</label>}
        {!lead.firstContactAt && (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
            <label className="flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" className="size-4 accent-brand-600" checked={firstContact} onChange={(e) => setFirstContact(e.target.checked)} />Also record this as first contact for the one-hour SLA</label>
            <p className="mt-1 text-[11.5px] text-slate-500">Which action counts as first contact is <PendingTag>To be confirmed</PendingTag> (P1-FR-003), so it is never recorded automatically.</p>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Task (SAL-FR-001)

export function TaskDialog({ opp, open, onClose }: { opp: Opportunity; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [kind, setKind] = useState<TaskKind>('follow_up')
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'exact' | 'window'>('exact')
  const [at, setAt] = useState(toUKInput(S.clock.now + 24 * HOUR))
  const [label, setLabel] = useState('')
  const [tried, setTried] = useState(false)
  const save = () => {
    setTried(true)
    const t = fromUKInput(at)
    if (!title.trim() || !t || (mode === 'window' && !label.trim())) return
    const r = act((d) => createTask(d, opp.id, { kind, title, due: mode === 'exact' ? { mode: 'exact', at: t } : { mode: 'window', label, at: t } }, me.id), 'Task added', 'Tasks never change the Sales stage.')
    if (r.ok) { onClose(); setTitle(''); setLabel(''); setTried(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add a task" description="The next action with a due date, in UK-local time. Tasks never change the stage."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add task</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>{(['follow_up', 'callback', 'contact'] as TaskKind[]).map((k) => <option key={k} value={k}>{TASK_KIND_LABEL[k]}</option>)}</Select></Field>
          <Field label="Due as"><Select value={mode} onChange={(e) => setMode(e.target.value as 'exact' | 'window')}><option value="exact">Exact time</option><option value="window">Window (e.g. evening)</option></Select></Field>
        </div>
        <Field label="Title" required error={tried && !title.trim() ? 'Give the task a title' : undefined}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send revised quote" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={mode === 'exact' ? 'Due (UK)' : 'Day (UK)'} required error={tried && !fromUKInput(at) ? 'Choose a date' : undefined}><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
          {mode === 'window' && <Field label="Window" required error={tried && !label.trim() ? 'Describe the window' : undefined}><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Evening" /></Field>}
        </div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Lost (SAL-FR-001)

export function OppLostDialog({ opp, open, onClose }: { opp: Opportunity; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const save = () => {
    setTried(true)
    if (!reason) return
    const r = act((d) => markLost(d, opp.id, reason, me.id), 'Marked as Lost', 'The shared funnel shows Lost with the same reason.')
    if (r.ok) { onClose(); setReason(''); setTried(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Mark the opportunity as Lost" description="The CRM never closes an opportunity by itself. A reason is mandatory and is copied to the shared funnel."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={save}>Save Lost</Button></>}>
      <Field label={<span className="flex items-center gap-2">Loss reason <PendingTag title="The allowed Lost reasons are to be confirmed.">Placeholder list</PendingTag></span>} required error={tried && !reason ? 'Lost cannot be saved without a reason' : undefined}>
        <Select value={reason} onChange={(e) => setReason(e.target.value)} className={cn(tried && !reason && 'ring-rose-300')}>
          <option value="">Select a reason…</option>
          {S.params.lossReasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Referral (SAL-FR-001)

export function ReferralDialog({ opp, open, onClose, onCreated }: { opp: Opportunity; open: boolean; onClose: () => void; onCreated?: (leadId: string) => void }) {
  const me = useMe()
  const act = useAction()
  const [fields, setFields] = useState<CustomerFields>({ ...EMPTY_FIELDS })
  const save = () => {
    const r = act((d) => createReferral(d, opp.id, fields, me.id), 'Referral Lead created', 'Assigned to you as the owner of the referring customer.')
    if (r.ok && r.id) { onClose(); setFields({ ...EMPTY_FIELDS }); onCreated?.(r.id) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add a referral" description="The new Lead (source: Referral) is assigned to you, the agent who owns the referring customer (AC-SAL-001-2). It does not go through the shared distribution."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Share2} onClick={save}>Create referral Lead</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {STANDARD_FIELDS.map((k) => <Field key={k} label={FIELD_LABEL[k]} required={k === 'fullName'}><Input value={fields[k]} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} /></Field>)}
      </div>
      <p className="mt-3 text-[11.5px] text-slate-500">Required details for a referral are not stated in v1.4 — the prototype asks for a name and a phone or email. <PendingTag>Placeholder</PendingTag> Counts toward your score: <b>no</b> <PendingTag>Pending</PendingTag></p>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Payment request (SAL-FR-004)

export function PaymentDialog({ opp, open, onClose }: { opp: Opportunity; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const totals = paymentTotals(S, opp)
  const [type, setType] = useState<'full' | 'partial'>('full')
  const [amount, setAmount] = useState('')
  const [proof, setProof] = useState('')
  const [tried, setTried] = useState(false)
  const n = Number(amount)
  const partialErr = type === 'partial' && (!amount || !Number.isFinite(n) || n < MIN_PARTIAL_PAYMENT) ? `A partial payment must be at least £${MIN_PARTIAL_PAYMENT}` : type === 'partial' && n >= totals.outstanding ? 'A partial payment must be less than the outstanding amount' : null
  const save = () => {
    setTried(true)
    if (partialErr || !proof) return
    const r = act((d) => submitPayment(d, opp.id, { type, amount: n, proofName: proof }, me.id), 'Payment Verification Request sent', opp.bookingId ? 'Accounts will verify the balance payment.' : 'The opportunity is Awaiting Payment until Accounts confirms.')
    if (r.ok) { onClose(); setAmount(''); setProof(''); setTried(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title={opp.bookingId ? 'Request balance verification' : 'Submit a Payment Verification Request'}
      description="Only Accounts confirms or rejects a payment (manual check in the MVP)."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Submit for verification</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['Total value', totals.total], ['Paid (confirmed)', totals.paid], ['Outstanding', totals.outstanding]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200"><p className="text-[11px] text-slate-500">{l}</p><p className="mt-0.5 text-[15px] font-semibold tabular-nums">{fmtMoney(v as number)}</p></div>
          ))}
        </div>
        <Field label="Payment">
          <div role="radiogroup" aria-label="Payment type" className="grid grid-cols-2 gap-2">
            {(['full', 'partial'] as const).map((t) => <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cn('h-9 rounded-lg text-[13px] font-medium ring-1 ring-inset', type === t ? 'bg-brand-50 text-brand-700 ring-brand-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>{t === 'full' ? `Full · ${fmtMoney(totals.outstanding)}` : 'Partial (min £50)'}</button>)}
          </div>
        </Field>
        {type === 'partial' && (
          <Field label="Amount (£)" required error={tried && partialErr ? partialErr : undefined}>
            <Input type="number" min={MIN_PARTIAL_PAYMENT} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={tried && !!partialErr} />
          </Field>
        )}
        <Field label="Payment proof" required error={tried && !proof ? 'Attach the payment proof' : undefined} hint="Only the file name is kept in the prototype; in production the file goes to private storage.">
          <Input type="file" accept="image/*,.pdf" onChange={(e) => setProof(e.target.files?.[0]?.name ?? '')} />
        </Field>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Accounts decision (SAL-FR-004)

export function RejectPaymentDialog({ payment, open, onClose }: { payment: PaymentRequest; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [reason, setReason] = useState('')
  const required = S.params.rejectionReasonRequired
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={`Reject ${fmtMoney(payment.amount)}?`} description="The agent is notified and can submit new proof."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={required && !reason.trim()} onClick={() => { const r = act((d) => decidePayment(d, payment.id, 'reject', me.id, reason), 'Payment rejected'); if (r.ok) onClose() }}>Reject payment</Button></>}>
      <Field label={<span className="flex items-center gap-2">Reason <PendingTag title="Whether a payment rejection requires a reason is to be confirmed (SAL-FR-004).">To be confirmed</PendingTag></span>} required={required} hint={required ? undefined : 'Optional in this prototype.'}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16" />
      </Field>
    </Dialog>
  )
}

export function OverrideDialog({ opp, open, onClose }: { opp: Opportunity; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [reason, setReason] = useState('')
  const required = S.params.overrideReasonRequired
  const margin = opp.quote ? expectedMargin(S.salesConfig, opp.quote) : 0
  return (
    <Dialog open={open} onClose={onClose} title="Override the £60 margin threshold" icon={<span className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200"><ShieldAlert className="size-4" /></span>}
      description={<>Accounts confirmed the payment, but the expected margin is <b>{fmtMoney(margin)}</b> (not above £{BOOKING_MARGIN_THRESHOLD}). Overriding creates the Booking and records your name and the time.</>}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={required && !reason.trim()} onClick={() => { const r = act((d) => overrideMargin(d, opp.id, me.id, reason), 'Override applied — Booking created'); if (r.ok) onClose() }}>Override and book</Button></>}>
      <Field label={<span className="flex items-center gap-2">Reason <PendingTag title="Whether a margin override requires a mandatory reason is to be confirmed.">To be confirmed</PendingTag></span>} required={required} hint={required ? undefined : 'Optional in this prototype.'}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16" />
      </Field>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Refund & expenses

export function RefundDialog({ booking, open, onClose }: { booking: Booking; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const opp = findOpp(S, booking.oppId)!
  const t = paymentTotals(S, opp)
  const pending = S.refunds.filter((r) => r.bookingId === booking.id && r.status === 'requested').reduce((s, r) => s + r.amount, 0)
  const max = Math.max(0, t.paid - t.refunded - pending)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const save = () => {
    const r = act((d) => requestRefund(d, booking.id, Number(amount), note, me.id), 'Refund Request submitted', 'Only Accounts decides. The Booking is never deleted.')
    if (r.ok) { onClose(); setAmount(''); setNote('') }
  }
  return (
    <Dialog open={open} onClose={onClose} title={`Refund Request · ${booking.ref}`} description="Linked to the Booking and its service case. Only Accounts approves or rejects it."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Submit request</Button></>}>
      <div className="space-y-4">
        <Field label="Amount (£)" required hint={`Up to ${fmtMoney(max)} (confirmed payments minus approved and pending refunds).`}><Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Note" required><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why the customer is asking for a refund" className="min-h-16" /></Field>
      </div>
    </Dialog>
  )
}

export function ExpenseDialog({ booking, open, onClose }: { booking: Booking; open: boolean; onClose: () => void }) {
  const me = useMe()
  const act = useAction()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={`Record actual expense · ${booking.ref}`} description="Actual margin comes from Accounts-confirmed payments, actual expenses and refunds (SAL-FR-007)."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = act((d) => recordExpense(d, booking.id, Number(amount), note, me.id), 'Expense recorded'); if (r.ok) { onClose(); setAmount(''); setNote('') } }}>Record</Button></>}>
      <div className="space-y-4">
        <Field label="Amount (£)" required><Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="What was paid" required><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Appointment fee + insurance policy" /></Field>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ small pieces

export function QuickActions({ opp, disabled }: { opp: Opportunity; disabled?: boolean }) {
  const [dialog, setDialog] = useState<'call' | 'whatsapp' | null>(null)
  return (
    <>
      <Button icon={Phone} variant="primary" disabled={disabled} onClick={() => setDialog('call')}>Call</Button>
      <Button icon={MessageCircle} disabled={disabled} onClick={() => setDialog('whatsapp')}>WhatsApp</Button>
      {dialog && <AttemptDialog opp={opp} channel={dialog} open onClose={() => setDialog(null)} />}
    </>
  )
}

export function ContactPrompt({ opp }: { opp: Opportunity }) {
  if (!opp.contactPrompt) return null
  return <Callout tone="warning" icon={Clock} title="Contact this client now">No preferred contact time was given, so the CRM prompts immediate contact (AC-SAL-001-3). The prompt clears when you log an attempt.</Callout>
}

export function fmtTaskLine(t: SalesTask) {
  return `${TASK_KIND_LABEL[t.kind]} · ${fmtUK(t.due.at)}`
}
