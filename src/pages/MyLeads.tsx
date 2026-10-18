import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, CheckCircle2, ListChecks, PhoneCall, Timer, AlertTriangle, Gauge, ChevronRight, Moon } from 'lucide-react'
import { Badge, Button, Callout, Card, CardHeader, EmptyState, PageHeader, PendingTag, Segmented, Select, Stat, th, td, cn } from '@/components/ui'
import { CompanyTag, SlaChip, SourceBadge } from '@/components/domain'
import { LostReasonDialog } from '@/components/leads/LeadWidgets'
import { useAppData, useMe } from '@/store/store'
import { useAction } from '@/store/hooks'
import { activeLeadCount, isAbsent, recordFirstContact, setStatus } from '@/domain/engine'
import { ALL_STATUSES, STATUS_LABEL, FUNNEL_ORDER } from '@/domain/constants'
import type { FunnelStatus, Lead } from '@/domain/types'
import { fmtDateTime, fmtRelative, isShiftTime, pktDayStart, monthStart, HOUR, SHIFT_START_HOUR, SHIFT_END_HOUR } from '@/lib/time'

const lastUpdate = (l: Lead) => Math.max(l.assignedAt ?? 0, l.firstContactAt ?? 0, ...l.statusHistory.map((h) => h.at), ...l.notes.map((n) => n.editedAt ?? n.at))

export default function MyLeadsPage() {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const navigate = useNavigate()
  const [view, setView] = useState<'open' | 'closed' | 'all'>('open')
  const [lostFor, setLostFor] = useState<Lead | null>(null)
  const now = S.clock.now
  const shift = isShiftTime(now)
  const shiftStart = pktDayStart(now) + SHIFT_START_HOUR * HOUR
  const shiftEnd = pktDayStart(now) + SHIFT_END_HOUR * HOUR

  const mine = S.leads.filter((l) => l.ownerId === me.id)
  const open = mine.filter((l) => l.status !== 'booked' && l.status !== 'lost')
  const awaiting = open.filter((l) => !l.firstContactAt).sort((a, b) => b.slaCountedMs - a.slaCountedMs)
  const overdue = awaiting.filter((l) => l.slaAlertAt)
  const notUpdated = shift ? open.filter((l) => lastUpdate(l) < shiftStart) : []
  const lastHour = shift && shiftEnd - now <= HOUR
  const rows = (view === 'open' ? open : view === 'closed' ? mine.filter((l) => l.status === 'booked' || l.status === 'lost') : mine).sort((a, b) => b.createdAt - a.createdAt)

  const blocked = (l: Lead, to: FunnelStatus) => {
    if (l.status === 'lost' && to !== 'lost' && !S.params.allowReopenLost) return true
    const fi = FUNNEL_ORDER.indexOf(l.status), ti = FUNNEL_ORDER.indexOf(to)
    return fi >= 0 && ti >= 0 && ti < fi && !S.params.allowBackwardStatus
  }

  return (
    <div>
      <PageHeader
        title="My leads"
        description="Your assigned Leads. Record first contact quickly, and by the end of each shift update the status, loss reason, notes and first-contact time of the Leads you handled."
        eyebrow={<span>P2-FR-001 · End-of-shift update</span>}
      />

      {isAbsent(me, now) && <Callout tone="danger" className="mb-4" title="You are marked Absent for this shift">The Manager marked you Absent. You receive no new Leads, and pending off-time Leads were released and redistributed.</Callout>}
      {shift && notUpdated.length > 0 && (
        <Callout tone={lastHour ? 'warning' : 'info'} icon={BellRing} className="mb-4" title={lastHour ? 'End-of-shift reminder — the shift ends at 22:00 PKT' : `Update your Leads by the end of the shift (22:00 PKT)`}>
          {notUpdated.length} open {notUpdated.length === 1 ? 'Lead has' : 'Leads have'} not been updated this shift. <PendingTag title="Whether the end-of-shift update is enforced or only a reminder is to be confirmed. The prototype shows a reminder.">Reminder only — enforcement to be confirmed</PendingTag>
        </Callout>
      )}
      {!shift && <Callout tone="info" icon={Moon} className="mb-4">It is off-time (22:00–14:00 PKT). Leads may still be assigned to you, but no SLA runs until the shift starts.</Callout>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting first contact" value={awaiting.length} icon={Timer} tone="brand" />
        <Stat label="SLA missed" value={overdue.length} icon={AlertTriangle} tone={overdue.length ? 'red' : 'neutral'} />
        <Stat label="Active vs capacity" value={<span className="tabular-nums">{activeLeadCount(S, me.id)} / {S.params.capacity}</span>} sub="Uncontacted Leads you hold" icon={Gauge} tone={activeLeadCount(S, me.id) >= S.params.capacity ? 'amber' : 'neutral'} />
        <Stat label="Booked this month" value={mine.filter((l) => l.status === 'booked' && l.statusHistory.at(-1)!.at >= monthStart(now)).length} icon={CheckCircle2} tone="green" />
      </div>

      {awaiting.length > 0 && (
        <Card className="mb-5">
          <CardHeader icon={PhoneCall} title="Needs first contact" description="Ordered by counted SLA time. The timer pauses while you are Unavailable." />
          <ul className="divide-y divide-slate-100">
            {awaiting.map((l) => (
              <li key={l.id} className={cn('flex flex-col gap-2.5 px-5 py-3 sm:flex-row sm:items-center sm:gap-3', l.slaAlertAt && 'bg-rose-50/40')}>
                <button onClick={() => navigate(`/leads/${l.id}`)} className="min-w-0 flex-1 text-left">
                  <p className="text-[13.5px] font-semibold text-slate-900">{l.fields.fullName} <span className="ml-1 font-mono text-[11.5px] font-normal text-slate-400">{l.ref}</span></p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500"><CompanyTag id={l.companyId} /><SourceBadge source={l.source} /><span className="whitespace-nowrap">{l.fields.phone}</span></p>
                </button>
                <div className="flex items-center justify-between gap-3">
                <SlaChip lead={l} />
                <Button size="sm" variant="primary" icon={PhoneCall} onClick={() => act((d) => recordFirstContact(d, l.id, me.id), 'First contact recorded', `${l.ref} — SLA timer stopped.`)}>Record first contact</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader icon={ListChecks} title="End-of-shift update" description="Update each Lead’s funnel status inline. Lost asks for a reason." actions={
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'open', label: 'Open', count: open.length }, { value: 'closed', label: 'Closed', count: mine.length - open.length }, { value: 'all', label: 'All', count: mine.length }]} />
        } />
        {rows.length === 0 ? (
          <EmptyState icon={ListChecks} title="No leads here" description="Leads assigned to you will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Lead</th><th className={th}>Status</th><th className={th}>First contact</th><th className={th}>Last update</th><th className={th}>Notes</th><th className={cn(th, "relative")}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 80).map((l) => {
                  const updated = lastUpdate(l) >= shiftStart && shift
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/60">
                      <td className={td}>
                        <p className="font-medium text-slate-900">{l.fields.fullName}</p>
                        <p className="text-[11.5px] text-slate-400"><span className="font-mono">{l.ref}</span> · {l.fields.tripDetails || 'No trip details'}</p>
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <Select
                            value={l.status}
                            aria-label="Funnel status"
                            className="h-8 w-36 text-[12.5px]"
                            onChange={(e) => {
                              const to = e.target.value as FunnelStatus
                              if (to === 'lost') setLostFor(l)
                              else act((d) => setStatus(d, l.id, to, me.id), `${l.ref}: ${STATUS_LABEL[to]}`)
                            }}
                          >
                            {ALL_STATUSES.map((s) => <option key={s} value={s} disabled={s !== l.status && blocked(l, s)}>{STATUS_LABEL[s]}</option>)}
                          </Select>
                          {l.status === 'lost' && <span className="truncate text-[11.5px] text-slate-500">{l.lossReason}</span>}
                        </div>
                      </td>
                      <td className={td}>{l.firstContactAt ? <span className="text-[12.5px] text-slate-600">{fmtDateTime(l.firstContactAt)}</span> : (l.status === 'lost' || l.status === 'booked') ? <span className="text-slate-400">—</span> : <Button size="xs" icon={PhoneCall} onClick={() => act((d) => recordFirstContact(d, l.id, me.id), 'First contact recorded')}>Record</Button>}</td>
                      <td className={td}>
                        <span className="text-[12.5px] text-slate-500">{fmtRelative(lastUpdate(l), now)}</span>
                        {updated && <Badge tone="green" className="ml-2">This shift</Badge>}
                      </td>
                      <td className={td}><span className="text-[12.5px] text-slate-500">{l.notes.length || '—'}</span></td>
                      <td className={cn(td, 'text-right')}><Button size="xs" variant="ghost" iconRight={ChevronRight} onClick={() => navigate(`/leads/${l.id}`)}>Open</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {lostFor && <LostReasonDialog lead={lostFor} open onClose={() => setLostFor(null)} />}
    </div>
  )
}
