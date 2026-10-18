import { useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Moon, PauseCircle, PhoneCall, Timer, UserX, Pencil, Plus, Trophy, Filter, Shuffle, Scale, StickyNote, MinusCircle } from 'lucide-react'
import { Avatar, Badge, Button, Callout, Card, CardHeader, EmptyState, Field, PendingTag, Select, Textarea, cn } from '../ui'
import { Dialog } from '../ui/overlay'
import { AgentStateBadge, slaInfo, StatusPill } from '../domain'
import { useAppData, useMe } from '@/store/store'
import { useAction } from '@/store/hooks'
import {
  addNote, agentState, activeLeadCount, companyAgents, editNote, fairnessScore, manualAssign, recordFirstContact, setStatus, userName, isAbsent,
} from '@/domain/engine'
import { ALL_STATUSES, FUNNEL_ORDER, STATUS_DESC, STATUS_LABEL } from '@/domain/constants'
import type { FunnelStatus, Lead, OwnershipChangeKind } from '@/domain/types'
import { SLA_MS, fmtDateTime, fmtDuration, fmtTime, monthKey } from '@/lib/time'

// ------------------------------------------------------------------ Assign / reassign (P3-FR-002)

export function AssignDialog({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [agentId, setAgentId] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const agents = companyAgents(S, lead.companyId) // only agents of the Lead's own company (AC-P3-002-6)
  const month = monthKey(S.clock.now)
  const target = agents.find((a) => a.id === agentId)
  const targetState = target ? agentState(S, target, S.clock.now) : null
  const warn = targetState && targetState !== 'available'
  const reasonRequired = S.params.requireReassignReason
  const isReassign = !!lead.ownerId

  const submit = () => {
    setTried(true)
    if (!agentId || (reasonRequired && !reason.trim())) return
    const res = act((d) => manualAssign(d, lead.id, agentId, me.id, reason), isReassign ? 'Lead reassigned' : 'Lead assigned', `${lead.ref} now belongs to ${target?.name}.`)
    if (res.ok) { onClose(); setAgentId(''); setReason(''); setTried(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg"
      title={isReassign ? `Reassign ${lead.ref}` : `Assign ${lead.ref}`}
      description={<>Manual assignment skips the automatic eligibility filters and is recorded in the ownership history and audit log. Only agents of <b>{S.companies.find((c) => c.id === lead.companyId)?.name}</b> can be chosen.</>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={!agentId}>{warn ? (isReassign ? 'Reassign anyway' : 'Assign anyway') : isReassign ? 'Reassign Lead' : 'Assign Lead'}</Button>
      </>}
    >
      {agents.length === 0 ? (
        <EmptyState compact icon={UserX} title="This company has no sales agents" description="Trip2GoGlobal has no agents yet, so its Leads stay Unassigned." />
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              <span>Agent</span><span>Status</span><span className="w-16 text-right">Active</span><span className="w-12 text-right">Score</span>
            </div>
            <div role="radiogroup" className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {agents.map((a) => {
                const st = agentState(S, a, S.clock.now)
                const isOwner = a.id === lead.ownerId
                const sc = fairnessScore(S, a.id, month)
                return (
                  <label key={a.id} className={cn('grid cursor-pointer grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 transition', agentId === a.id ? 'bg-brand-50/70' : 'hover:bg-slate-50', isOwner && 'cursor-not-allowed opacity-50')}>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <input type="radio" name="agent" className="accent-brand-600" disabled={isOwner} checked={agentId === a.id} onChange={() => setAgentId(a.id)} />
                      <Avatar name={a.name} size="sm" />
                      <span className="truncate text-[13px] font-medium text-slate-800">{a.name}{isOwner && <span className="ml-1.5 text-[11.5px] font-normal text-slate-500">(current owner)</span>}</span>
                    </span>
                    <AgentStateBadge state={st} />
                    <span className="w-16 text-right text-[12.5px] text-slate-600 tabular-nums">{activeLeadCount(S, a.id)} / {S.params.capacity}</span>
                    <span className="w-12 text-right text-[12.5px] font-semibold text-slate-700 tabular-nums">{sc.score}</span>
                  </label>
                )
              })}
            </div>
          </div>
          {warn && target && (
            <Callout tone="warning" icon={AlertTriangle} title={`${target.name} is ${targetState === 'at-capacity' ? 'at capacity' : targetState}`}>
              A manual assignment skips the eligibility filters. Please confirm this override. <PendingTag title="Whether a manual assignment may override capacity or an Unavailable status is to be confirmed (P3-FR-002).">Override rule to be confirmed</PendingTag>
            </Callout>
          )}
          <Field label={<span className="flex items-center gap-2">Reason <PendingTag title="Whether a reassignment needs a reason field is to be confirmed.">To be confirmed</PendingTag></span>} required={reasonRequired} error={tried && reasonRequired && !reason.trim() ? 'A reason is required (demo parameter)' : undefined} hint={reasonRequired ? undefined : 'Optional in this prototype.'}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Original owner left the shift early" className="min-h-16" />
          </Field>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-slate-500">
            <span>SLA for new owner: <b className="text-slate-700">{S.params.slaRestartsOnReassign ? 'restarts' : 'continues'}</b> <PendingTag>Pending</PendingTag></span>
            <span>Counts toward fairness: <b className="text-slate-700">{S.params.manualCountsTowardFairness ? 'yes' : 'no'}</b> <PendingTag>Pending</PendingTag></span>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export function UnassignDialog({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [reason, setReason] = useState('')
  const required = S.params.requireReassignReason
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={`Unassign ${lead.ref}?`}
      description={<>The Lead will be removed from <b>{userName(S, lead.ownerId)}</b> and listed under Unassigned Leads. It is not redistributed automatically.</>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" icon={MinusCircle} disabled={required && !reason.trim()} onClick={() => { const r = act((d) => manualAssign(d, lead.id, null, me.id, reason), 'Lead unassigned'); if (r.ok) onClose() }}>Unassign</Button>
      </>}
    >
      <Field label={<span className="flex items-center gap-2">Reason <PendingTag>To be confirmed</PendingTag></span>} required={required} hint={required ? undefined : 'Optional in this prototype.'}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16" />
      </Field>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Funnel status (P2-FR-001)

export function LostReasonDialog({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const save = () => {
    setTried(true)
    if (!reason) return
    const r = act((d) => setStatus(d, lead.id, 'lost', me.id, reason), 'Marked as Lost', `Reason: ${reason}`)
    if (r.ok) { onClose(); setReason(''); setTried(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Mark as Lost" description="The enquiry will not proceed. A loss reason is mandatory (MKT-BR-012)."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save Lost</Button></>}
    >
      <Field label={<span className="flex items-center gap-2">Loss reason <PendingTag title="The allowed Lost reasons are to be confirmed. This list is a placeholder for design.">Placeholder list</PendingTag></span>} required error={tried && !reason ? 'Lost cannot be saved without a loss reason' : undefined}>
        <Select value={reason} onChange={(e) => setReason(e.target.value)} className={cn(tried && !reason && 'ring-rose-300')}>
          <option value="">Select a reason…</option>
          {S.params.lossReasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>
    </Dialog>
  )
}

export function StatusControl({ lead, editable }: { lead: Lead; editable: boolean }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [lostOpen, setLostOpen] = useState(false)
  const blockedReason = (to: FunnelStatus): string | null => {
    if (to === lead.status) return null
    if (lead.status === 'lost' && !S.params.allowReopenLost) return 'Reopening a Lost Lead is a pending decision (currently off)'
    const fi = FUNNEL_ORDER.indexOf(lead.status), ti = FUNNEL_ORDER.indexOf(to)
    if (fi >= 0 && ti >= 0 && ti < fi && !S.params.allowBackwardStatus) return 'Moving backward is a pending decision (currently off)'
    return null
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {ALL_STATUSES.map((s) => {
          const active = lead.status === s
          const blocked = blockedReason(s)
          return (
            <button
              key={s}
              disabled={!editable || !!blocked}
              title={blocked ?? STATUS_DESC[s]}
              onClick={() => { if (active) return; if (s === 'lost') setLostOpen(true); else act((d) => setStatus(d, lead.id, s, me.id), `Status: ${STATUS_LABEL[s]}`) }}
              className={cn(
                'rounded-lg px-2 py-2 text-left ring-1 transition ring-inset disabled:cursor-not-allowed',
                active
                  ? { lead: 'bg-sky-50 ring-sky-300', mature: 'bg-violet-50 ring-violet-300', hot: 'bg-orange-50 ring-orange-300', booked: 'bg-emerald-50 ring-emerald-300', lost: 'bg-slate-100 ring-slate-300' }[s]
                  : 'bg-white ring-slate-200 enabled:hover:bg-slate-50 disabled:opacity-50',
              )}
            >
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-800">
                <span className={cn('size-2 rounded-full', { lead: 'bg-sky-500', mature: 'bg-violet-500', hot: 'bg-orange-500', booked: 'bg-emerald-500', lost: 'bg-slate-400' }[s])} />
                {STATUS_LABEL[s].replace(' Lead', '')}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-slate-500">{STATUS_DESC[s]}</span>
            </button>
          )
        })}
      </div>
      {lead.status === 'lost' && lead.lossReason && <p className="mt-2 text-[12.5px] text-slate-600">Loss reason: <b>{lead.lossReason}</b></p>}
      {!editable && <p className="mt-2 text-[12px] text-slate-500">The funnel status is maintained by the owning Sales Agent (MKT-BR-012).</p>}
      <LostReasonDialog lead={lead} open={lostOpen} onClose={() => setLostOpen(false)} />
    </div>
  )
}

// ------------------------------------------------------------------ SLA panel (P1-FR-004)

export function SlaPanel({ lead, canContact }: { lead: Lead; canContact: boolean }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const now = S.clock.now
  const info = slaInfo(S, lead, now)
  const pct = Math.min(100, (info.counted / SLA_MS) * 100)
  const remaining = SLA_MS - info.counted
  const owner = lead.ownerId ? S.users.find((u) => u.id === lead.ownerId) : null

  const head: Record<typeof info.state, { icon: typeof Timer; title: string; body: string; tone: string }> = {
    running: { icon: Timer, title: `${fmtDuration(remaining)} left to make first contact`, body: 'The timer counts while it is shift time, the Lead is assigned and the owner is Available.', tone: 'text-brand-700 bg-brand-50 ring-brand-200' },
    'paused-unavailable': { icon: PauseCircle, title: `Paused · ${fmtDuration(remaining)} left`, body: `${owner?.name} is Unavailable. The timer resumes when they are Available again.`, tone: 'text-amber-700 bg-amber-50 ring-amber-200' },
    'paused-absent': { icon: PauseCircle, title: `Paused · ${fmtDuration(remaining)} left`, body: `${owner?.name} is marked Absent for this shift.`, tone: 'text-amber-700 bg-amber-50 ring-amber-200' },
    offtime: { icon: Moon, title: 'Off-time · no SLA running', body: 'Between 22:00 and 14:00 PKT Leads are assigned without a response SLA. The timer starts at shift start if the owner is Available.', tone: 'text-indigo-700 bg-indigo-50 ring-indigo-200' },
    overdue: { icon: AlertTriangle, title: `SLA missed · overdue by ${fmtDuration(info.overdueBy)}`, body: `Alert raised at ${fmtTime(lead.slaAlertAt!)} to the Manager / Team Lead. The Lead stays with ${owner?.name} until a manager acts — it is never reassigned automatically.`, tone: 'text-rose-700 bg-rose-50 ring-rose-200' },
    contacted: { icon: CheckCircle2, title: `First contact recorded at ${lead.firstContactAt ? fmtDateTime(lead.firstContactAt) : ''}`, body: `${fmtDuration(info.counted)} of counted SLA time${lead.slaAlertAt ? ' — after the one-hour alert' : ' — within one hour'}. By ${userName(S, lead.firstContactByUserId)}.`, tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
    closed: { icon: CheckCircle2, title: 'Closed without first contact', body: 'This Lead is Booked or Lost, so no SLA applies.', tone: 'text-slate-600 bg-slate-50 ring-slate-200' },
    unassigned: { icon: UserX, title: 'Unassigned · no SLA', body: 'No SLA alert is raised for an Unassigned Lead.', tone: 'text-slate-600 bg-slate-50 ring-slate-200' },
  }
  const h = head[info.state]
  const showBar = ['running', 'paused-unavailable', 'paused-absent', 'overdue'].includes(info.state) || (info.state === 'offtime' && info.counted > 0)

  return (
    <Card>
      <CardHeader icon={Clock} title="One-hour contact SLA" description="P1-FR-004 · MKT-BR-010, MKT-BR-011" />
      <div className="space-y-4 p-5">
        <div className={cn('flex items-start gap-3 rounded-xl px-3.5 py-3 ring-1 ring-inset', h.tone, info.state === 'overdue' && 'pulse-ring')}>
          <h.icon className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold tabular-nums">{h.title}</p>
            <p className="mt-0.5 text-[12.5px]">{h.body}</p>
          </div>
        </div>
        {showBar && (
          <div>
            <div className="mb-1.5 flex justify-between text-[11.5px] text-slate-500 tabular-nums"><span>Counted {fmtDuration(info.counted)}</span><span>60m 00s</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={cn('h-full rounded-full transition-all duration-700', info.state === 'overdue' ? 'bg-rose-500' : info.state.startsWith('paused') ? 'bg-amber-400' : pct > 75 ? 'bg-orange-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {canContact && !lead.firstContactAt && lead.status !== 'booked' && lead.status !== 'lost' && (
          <Button variant="primary" icon={PhoneCall} className="w-full" onClick={() => act((d) => recordFirstContact(d, lead.id, me.id), 'First contact recorded', 'The SLA timer stopped and any pending alert was cleared.')}>Record first contact</Button>
        )}
        {!lead.firstContactAt && (
          <p className="text-[11.5px] text-slate-500">Which action counts as first contact is <PendingTag>To be confirmed</PendingTag> — the prototype uses the “Record first contact” button.</p>
        )}
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ Distribution explanation (P2-FR-003)

export function TraceCard({ lead }: { lead: Lead }) {
  const S = useAppData()
  const t = lead.lastTrace
  if (!t) return null
  const name = (id: string) => userName(S, id)
  const Step = ({ icon: Icon, label, people, tone }: { icon: typeof Filter; label: string; people: string[]; tone: string }) => (
    <li className="flex items-start gap-3">
      <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', tone)}><Icon className="size-3" strokeWidth={2.4} /></span>
      <div className="min-w-0 text-[12.5px]">
        <p className="font-medium text-slate-700">{label}</p>
        <p className="text-slate-500">{people.length ? people.map(name).join(', ') : 'None'}</p>
      </div>
    </li>
  )
  return (
    <Card>
      <CardHeader icon={Scale} title="Why this assignment?" description={`Automatic distribution at ${fmtDateTime(t.at)} · ${t.inShift ? 'shift time' : 'off-time'}`} />
      <div className="p-5">
        <ol className="space-y-3">
          <Step icon={Filter} label={`Company pool (${t.pool.length})`} people={t.pool} tone="bg-slate-50 text-slate-500 ring-slate-200" />
          {t.inShift ? (
            <>
              <Step icon={MinusCircle} label="1 · Removed Absent" people={t.removedAbsent} tone="bg-rose-50 text-rose-500 ring-rose-200" />
              <Step icon={MinusCircle} label="2 · Removed Unavailable" people={t.removedUnavailable} tone="bg-amber-50 text-amber-600 ring-amber-200" />
            </>
          ) : (
            <li className="rounded-lg bg-indigo-50/70 px-3 py-2 text-[12px] text-indigo-800">Off-time: availability is ignored (Absent is marked at shift start).</li>
          )}
          {t.capacityApplied
            ? <Step icon={MinusCircle} label={`3 · Removed at capacity (${t.capacity} active)`} people={t.removedAtCapacity} tone="bg-violet-50 text-violet-500 ring-violet-200" />
            : <li className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">Capacity not applied off-time <PendingTag>Pending</PendingTag></li>}
        </ol>
        {t.scores.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-slate-200">
            <table className="w-full text-[12.5px]">
              <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase"><tr><th className="px-3 py-1.5 text-left font-semibold">Eligible agent</th><th className="px-3 py-1.5 text-right font-semibold">Count</th><th className="px-3 py-1.5 text-right font-semibold">Offset</th><th className="px-3 py-1.5 text-right font-semibold">Score</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...t.scores].sort((a, b) => a.score - b.score).map((s) => (
                  <tr key={s.agentId} className={cn(s.agentId === t.winnerId && 'bg-emerald-50/60')}>
                    <td className="px-3 py-1.5 font-medium text-slate-700"><span className="flex items-center gap-1.5">{s.agentId === t.winnerId && <Trophy className="size-3.5 text-emerald-600" />}{name(s.agentId)}</span></td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{s.count}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{s.offset}</td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{s.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Callout tone="warning" className="mt-4" icon={UserX}>No agent was eligible, so the Lead was left Unassigned and the Manager was notified.</Callout>
        )}
        {t.winnerId && <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-slate-600">{t.tieBreak ? <Shuffle className="size-3.5 text-slate-400" /> : <ArrowRight className="size-3.5 text-slate-400" />}Lowest score wins{t.tieBreak ? '; tied scores broken by the rotating order' : ''} → <b>{name(t.winnerId)}</b></p>}
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ Histories & notes

const OWNERSHIP_LABEL: Record<OwnershipChangeKind, string> = {
  auto: 'Assigned automatically',
  'manual-assign': 'Assigned manually',
  'manual-unassign': 'Unassigned manually',
  'manual-reassign': 'Reassigned manually',
  'released-absent': 'Released — owner marked Absent',
  'unassigned-no-eligible': 'Left Unassigned — no eligible agent',
}

export function OwnershipHistory({ lead }: { lead: Lead }) {
  const S = useAppData()
  if (!lead.ownershipHistory.length) return <EmptyState compact icon={UserX} title="No ownership changes yet" />
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {[...lead.ownershipHistory].reverse().map((h, i) => (
        <li key={i} className="relative">
          <span className={cn('absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-white', h.kind.startsWith('manual') ? 'bg-brand-500' : h.kind === 'released-absent' || h.kind === 'unassigned-no-eligible' ? 'bg-amber-500' : 'bg-slate-400')} />
          <p className="text-[13px] font-medium text-slate-800">{OWNERSHIP_LABEL[h.kind]}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-slate-600">
            <span className={cn(!h.fromAgentId && 'text-slate-400')}>{h.fromAgentId ? userName(S, h.fromAgentId) : 'Unassigned'}</span>
            <ArrowRight className="size-3 text-slate-400" />
            <span className={cn('font-medium', !h.toAgentId && 'text-slate-400')}>{h.toAgentId ? userName(S, h.toAgentId) : 'Unassigned'}</span>
          </p>
          {h.reason && <p className="mt-1 text-[12px] text-slate-500 italic">“{h.reason}”</p>}
          <p className="mt-0.5 text-[11.5px] text-slate-400">{fmtDateTime(h.at)} · by {userName(S, h.byUserId)}</p>
        </li>
      ))}
    </ol>
  )
}

export function StatusHistory({ lead }: { lead: Lead }) {
  const S = useAppData()
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {[...lead.statusHistory].reverse().map((h, i) => (
        <li key={i} className="relative">
          <span className="absolute top-1 -left-[25px] size-2.5 rounded-full bg-slate-300 ring-4 ring-white" />
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
            {h.from ? <><StatusPill status={h.from} /><ArrowRight className="size-3 text-slate-400" /></> : <span className="text-slate-500">Created as</span>}
            <StatusPill status={h.to} />
          </div>
          {h.lossReason && <p className="mt-1 text-[12.5px] text-slate-600">Reason: <b>{h.lossReason}</b></p>}
          <p className="mt-0.5 text-[11.5px] text-slate-400">{fmtDateTime(h.at)} · by {userName(S, h.byUserId)}</p>
        </li>
      ))}
    </ol>
  )
}

export function NotesPanel({ lead, editable }: { lead: Lead; editable: boolean }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  return (
    <div className="space-y-4">
      {editable && (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note — e.g. quotation or outcome context" />
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] text-slate-500">Note format <PendingTag>To be confirmed</PendingTag></span>
            <Button size="sm" variant="primary" icon={Plus} disabled={!text.trim()} onClick={() => { const r = act((d) => addNote(d, lead.id, text, me.id), 'Note added'); if (r.ok) setText('') }}>Add note</Button>
          </div>
        </div>
      )}
      {lead.notes.length === 0 ? (
        <EmptyState compact icon={StickyNote} title="No notes yet" description={editable ? 'Notes you add here are visible to Marketing and management.' : undefined} />
      ) : (
        <ul className="space-y-2.5">
          {[...lead.notes].reverse().map((n) => (
            <li key={n.id} className="rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200/70">
              {editing === n.id ? (
                <div className="space-y-2">
                  <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    <Button size="xs" variant="primary" onClick={() => { const r = act((d) => editNote(d, lead.id, n.id, editText, me.id), 'Note updated'); if (r.ok) setEditing(null) }}>Save</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[13px] whitespace-pre-wrap text-slate-700">{n.text}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-[11.5px] text-slate-400">{userName(S, n.byUserId)} · {fmtDateTime(n.at)}{n.editedAt ? ` · edited ${fmtDateTime(n.editedAt)}` : ''}</p>
                    {editable && n.byUserId === me.id && <button onClick={() => { setEditing(n.id); setEditText(n.text) }} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-500 hover:text-brand-700"><Pencil className="size-3" />Edit</button>}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function OwnerCell({ lead }: { lead: Lead }) {
  const S = useAppData()
  if (!lead.ownerId) return <Badge tone="amber" dot>Unassigned</Badge>
  const owner = S.users.find((u) => u.id === lead.ownerId)
  const absent = owner && isAbsent(owner, S.clock.now)
  return (
    <span className="inline-flex items-center gap-2 text-[13px] whitespace-nowrap text-slate-700">
      <Avatar name={owner?.name ?? '?'} size="xs" />
      {owner?.name}
      {absent && <Badge tone="red">Absent</Badge>}
      {!absent && owner?.availability === 'unavailable' && <span className="size-1.5 rounded-full bg-amber-500" title="Unavailable" />}
    </span>
  )
}
