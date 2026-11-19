import { useState } from 'react'
import { Ban, CalendarCheck2, CheckCircle2, ClipboardList, Globe2, MapPin, PackageCheck, Plus, Send, ShieldCheck, ThumbsDown, ThumbsUp, Users, Lock, Milestone } from 'lucide-react'
import { Avatar, Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, PendingTag, Select, cn } from '../ui'
import { Dialog } from '../ui/overlay'
import { useAppData, useMe } from '@/store/store'
import { useAction } from '@/store/hooks'
import { CASE_STATUSES, QUAL_FIELD_LABEL, SERVICE_ITEM_LABEL } from '@/domain/constants'
import {
  addVisaOption, balanceBlocked, bookingOf, completenessCheck, markPackSent, paymentTotals, recordAppointment, recordOutcome, recordSelection, sendOptionsToAgent,
  setCaseStatus, toggleChecklistItem, leadOf,
} from '@/domain/sales'
import { canWorkOpportunity, oppOwnerId, visibleCompanies } from '@/domain/permissions'
import { userName } from '@/domain/engine'
import type { ServiceCase } from '@/domain/types'
import { fmtDateTime, fmtMoney } from '@/lib/time'
import { UnsignedFlag } from './SalesWidgets'
import { findOpp } from '@/domain/lookup'

function OptionDialog({ c, open, onClose }: { c: ServiceCase; open: boolean; onClose: () => void }) {
  const me = useMe()
  const act = useAction()
  const S = useAppData()
  const opp = findOpp(S, c.oppId)!
  const [v, setV] = useState({ country: opp.applicants[0]?.data['travel.destination'] ?? '', centre: '', date: '', time: '' })
  return (
    <Dialog open={open} onClose={onClose} title="Record a visa option" description="Processing records the options; the CRM never chooses one (AC-SAL-006-2)."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = act((d) => addVisaOption(d, c.id, v, me.id), 'Option recorded'); if (r.ok) { onClose(); setV({ ...v, centre: '', date: '', time: '' }) } }}>Add option</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country" required><Input value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} /></Field>
        <Field label="Centre" required><Input value={v.centre} onChange={(e) => setV({ ...v, centre: e.target.value })} placeholder="e.g. London" /></Field>
        <Field label="Date" required><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label="Time" required><Input type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} /></Field>
      </div>
    </Dialog>
  )
}

function AppointmentDialog({ c, open, onClose }: { c: ServiceCase; open: boolean; onClose: () => void }) {
  const me = useMe()
  const act = useAction()
  const [ref, setRef] = useState('')
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Record the booked appointment" description="The agent is notified. Any outstanding balance becomes a hard gate from this point (AC-SAL-006-4)."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = act((d) => recordAppointment(d, c.id, ref, me.id), 'Appointment recorded', 'The agent was notified.'); if (r.ok) { onClose(); setRef('') } }}>Save appointment</Button></>}>
      <Field label="Appointment reference" required><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. TLS-123456" /></Field>
    </Dialog>
  )
}

export function CasePanel({ c }: { c: ServiceCase }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [optOpen, setOptOpen] = useState(false)
  const [aptOpen, setAptOpen] = useState(false)
  const [via, setVia] = useState<'whatsapp' | 'email'>('whatsapp')
  const [status, setStatus] = useState('')
  const opp = findOpp(S, c.oppId)!
  const lead = leadOf(S, opp)
  const booking = bookingOf(S, opp)!
  const ownerId = oppOwnerId(S, opp)
  const isProc = me.role === 'processing' && visibleCompanies(S, me).includes(c.companyId)
  const isAgent = canWorkOpportunity(S, me, opp)
  const blocked = balanceBlocked(S, c)
  const totals = paymentTotals(S, opp)
  const draft = c.draftVersion != null ? opp.drafts.find((d) => d.version === c.draftVersion) : null
  const selected = c.selection ? c.options.find((o) => o.id === c.selection!.optionId) : null
  const open = c.checklist.filter((i) => !i.doneAt).length

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Users} title={`Service / Visa Case ${c.ref}`} description={`Linked to ${booking.ref} · created ${fmtDateTime(c.createdAt)}`} actions={<UnsignedFlag booking={booking} />} />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Fulfilment Owner</p>
              <p className="mt-1 text-[13.5px] font-semibold text-slate-800">Processing</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Customer Relationship Owner</p>
              <p className="mt-1 flex items-center gap-2 text-[13.5px] font-semibold text-slate-800"><Avatar name={userName(S, ownerId)} size="xs" />{userName(S, ownerId)}</p>
              <p className="text-[11.5px] text-slate-500">Handles all customer communication</p>
            </div>
            <div className="sm:col-span-2 rounded-xl p-3 ring-1 ring-slate-200">
              <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Verified Client Information Draft</p>
              {draft ? (
                <div className="mt-1">
                  <p className="text-[13px] font-medium text-slate-800">Version {draft.version} · approved via {draft.approval?.channel === 'email' ? 'email' : 'WhatsApp'} {draft.approval ? `on ${fmtDateTime(draft.approval.at)}` : ''}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">{draft.snapshot.length} applicant(s): {draft.snapshot.map((a) => a.data['applicant.fullName'] || 'Unnamed').join(', ')} · {QUAL_FIELD_LABEL['travel.destination']}: {draft.snapshot[0]?.data['travel.destination'] || '—'}</p>
                </div>
              ) : <p className="mt-1 text-[12.5px] text-amber-700">No verified draft yet. The agent must get the customer’s approval; the case will then hold it.</p>}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={Milestone} title="Status & milestones" description="Processing updates the status by hand." actions={<PendingTag title="The final Service/Visa Case milestone/status list is to be confirmed (SAL-FR-006).">Status list to be confirmed</PendingTag>} />
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={c.outcome ? (c.outcome.result === 'granted' ? 'green' : 'red') : 'brand'} dot>{c.status}</Badge>
              {c.packSent && <Badge tone="green" icon={PackageCheck}>Pack sent by {c.packSent.via === 'whatsapp' ? 'WhatsApp' : 'email'}</Badge>}
            </div>
            {isProc && !c.outcome && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="Update status">
                  <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-60">
                    <option value="">Choose…</option>
                    {CASE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
                <Button disabled={!status} onClick={() => { const r = act((d) => setCaseStatus(d, c.id, status, me.id), 'Status updated'); if (r.ok) setStatus('') }}>Save</Button>
              </div>
            )}
            <ol className="mt-4 space-y-2 border-l border-slate-200 pl-4">
              {[...c.statusHistory].reverse().map((h, i) => (
                <li key={i} className="relative text-[12.5px]"><span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-slate-300 ring-4 ring-white" /><b className="text-slate-700">{h.status}</b><span className="text-slate-400"> · {fmtDateTime(h.at)} · {userName(S, h.byUserId)}</span></li>
              ))}
            </ol>
            {isProc && !c.outcome && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Button icon={ThumbsUp} onClick={() => { if (window.confirm('Record the visa as Granted? Review and referral tasks will be created for the agent.')) act((d) => recordOutcome(d, c.id, 'granted', me.id), 'Granted recorded', 'Review and referral tasks were created for the agent.') }}>Record Granted</Button>
                <Button variant="danger" icon={ThumbsDown} onClick={() => { if (window.confirm('Record the visa as Refused? The Booking stays Booked.')) act((d) => recordOutcome(d, c.id, 'refused', me.id), 'Refused recorded', 'The Booking stays Booked.') }}>Record Refused</Button>
              </div>
            )}
            {c.outcome && <p className="mt-3 text-[12.5px] text-slate-600">{c.outcome.result === 'granted' ? 'Granted — review and referral tasks were created.' : 'Refused — the Booking stays Booked (AC-SAL-006-7).'} Recorded {fmtDateTime(c.outcome.at)} by {userName(S, c.outcome.byUserId)}.</p>}
          </div>
        </Card>
      </div>

      {blocked && (
        <Callout tone="danger" icon={Ban} title={`Balance gate · ${fmtMoney(totals.outstanding)} outstanding`}>
          The appointment is booked and a service balance is outstanding. No further service-document preparation or final pack release can proceed until Accounts confirms the full balance (AC-SAL-006-4). A Balance Payment task is on the agent’s list.
        </Callout>
      )}

      <Card>
        <CardHeader icon={Globe2} title="Visa options & customer selection" description="Processing records the options → the agent records the customer’s choice → Processing books the appointment. Each step notifies the other side."
          actions={isProc && !c.selection && <><Button size="sm" icon={Plus} onClick={() => setOptOpen(true)}>Add option</Button><Button size="sm" variant="primary" icon={Send} disabled={!c.options.length} onClick={() => act((d) => sendOptionsToAgent(d, c.id, me.id), 'Options sent', 'The agent was notified.')}>Notify agent</Button></>} />
        {c.options.length === 0 ? <EmptyState compact icon={MapPin} title="Options pending" description={isProc ? 'Record the visa options for the agent.' : 'Processing has not recorded options yet.'} /> : (
          <ul className="divide-y divide-slate-100">
            {c.options.map((o) => {
              const isSel = c.selection?.optionId === o.id
              return (
                <li key={o.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3', isSel && 'bg-emerald-50/50')}>
                  <MapPin className="size-4 text-slate-400" />
                  <span className="min-w-0 flex-1 text-[13px]"><b className="text-slate-800">{o.country}</b> · {o.centre} · {o.date} {o.time}</span>
                  {isSel && <Badge tone="green" icon={CheckCircle2}>Customer’s choice</Badge>}
                  {isAgent && !c.selection && <Button size="xs" onClick={() => act((d) => recordSelection(d, c.id, o.id, me.id), 'Customer choice recorded', 'Processing was notified.')}>Record as customer’s choice</Button>}
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3 text-[12.5px]">
          <CalendarCheck2 className="size-4 text-slate-400" />
          {c.appointment ? <span>Appointment booked: <b>{c.appointment.reference}</b> · {selected ? `${selected.centre}, ${selected.date} ${selected.time}` : ''} · {fmtDateTime(c.appointment.at)}</span>
            : c.selection ? <span className="text-slate-600">Customer chose an option. Waiting for Processing to book the appointment.</span>
              : <span className="text-slate-500">No appointment yet.</span>}
          {isProc && c.selection && !c.appointment && <Button size="sm" variant="primary" className="ml-auto" onClick={() => setAptOpen(true)}>Record appointment</Button>}
        </div>
      </Card>

      <Card>
        <CardHeader icon={ClipboardList} title="Deliverables checklist" description="From the quote’s included services. Each side completes only the items it owns." actions={<span className="text-[12px] text-slate-500 tabular-nums">{c.checklist.length - open} of {c.checklist.length} complete</span>} />
        <ul className="divide-y divide-slate-100">
          {c.checklist.map((i) => {
            const mine = i.owner === 'processing' ? isProc : isAgent
            return (
              <li key={i.key} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <input type="checkbox" aria-label={`${SERVICE_ITEM_LABEL[i.key]} complete`} className="size-4 accent-emerald-600 disabled:opacity-50" checked={!!i.doneAt} disabled={!mine || blocked || !!c.packSent}
                  onChange={(e) => act((d) => toggleChecklistItem(d, c.id, i.key, e.target.checked, me.id))} />
                <span className={cn('min-w-0 flex-1 text-[13px]', i.doneAt ? 'text-slate-500 line-through' : 'text-slate-800')}>{SERVICE_ITEM_LABEL[i.key]}</span>
                <Badge tone={i.kind === 'mandatory' ? 'neutral' : i.kind === 'conditional' ? 'sky' : 'violet'}>{i.kind === 'mandatory' ? 'Mandatory' : i.kind === 'conditional' ? 'Conditional' : 'Add-on'}</Badge>
                <Badge tone={i.owner === 'processing' ? 'teal' : 'brand'}>{i.owner === 'processing' ? 'Processing' : 'Sales'}</Badge>
                {i.kind === 'addon' && <PendingTag title="SAL-FR-006 does not state who completes actual flight/hotel add-ons. Interpretation: Processing.">Owner = interpretation</PendingTag>}
                {i.doneAt && <span className="w-full pl-7 text-[11.5px] text-slate-400 sm:w-auto sm:pl-0">{userName(S, i.doneBy)} · {fmtDateTime(i.doneAt)}</span>}
                {!mine && !i.doneAt && <Lock className="size-3.5 text-slate-300" aria-label="Owned by the other side" />}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <ShieldCheck className={cn('size-4', c.completenessCheck ? 'text-emerald-600' : 'text-slate-400')} />
          <span className="min-w-0 flex-1 text-[12.5px] text-slate-600">{c.completenessCheck ? `Final completeness check done by ${userName(S, c.completenessCheck.byUserId)} · ${fmtDateTime(c.completenessCheck.at)}` : 'The agent completes the final completeness check before the pack is sent.'}</span>
          {isAgent && !c.completenessCheck && !c.packSent && <Button size="sm" disabled={blocked || open > 0 || !c.appointment} title={open ? 'Complete every item first' : !c.appointment ? 'The appointment is not booked yet' : undefined} onClick={() => act((d) => completenessCheck(d, c.id, me.id), 'Completeness check done')}>Complete the final check</Button>}
        </div>
        {isAgent && !c.packSent && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
            <span className="text-[12.5px] text-slate-600">Send the pack by</span>
            <Select value={via} onChange={(e) => setVia(e.target.value as 'whatsapp' | 'email')} className="h-8 w-48 text-[12.5px]" aria-label="Send by">
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email (customer requested)</option>
            </Select>
            <Button size="sm" variant="primary" icon={PackageCheck} disabled={!c.completenessCheck || blocked} title={!c.completenessCheck ? 'The pack cannot be marked sent before the completeness check (AC-SAL-006-6)' : undefined} onClick={() => act((d) => markPackSent(d, c.id, via, me.id), 'Pack marked as sent', 'Processing was notified.')}>Mark pack sent</Button>
          </div>
        )}
        <p className="border-t border-slate-100 px-5 py-2.5 text-[11.5px] text-slate-500">Interpretation: the completeness check needs every item complete and the appointment booked. <PendingTag>To confirm</PendingTag> · Customer: {lead.fields.fullName}</p>
      </Card>

      <OptionDialog c={c} open={optOpen} onClose={() => setOptOpen(false)} />
      <AppointmentDialog c={c} open={aptOpen} onClose={() => setAptOpen(false)} />
    </div>
  )
}
