import { useState } from 'react'
import { Sun, Moon, UserPlus, Gauge, Save, Calculator, Lock, Sparkles } from 'lucide-react'
import { Avatar, Badge, Button, Callout, Card, CardHeader, Field, Input, PageHeader, PendingTag, Switch, th, td, cn } from '@/components/ui'
import { Dialog } from '@/components/ui/overlay'
import { AgentStateBadge, CompanyTag } from '@/components/domain'
import { useAppData, useMe } from '@/store/store'
import { useAction, useScope } from '@/store/hooks'
import { canSetAbsent, canAdminister } from '@/domain/permissions'
import { activeLeadCount, addAgent, agentState, companyAgents, fairnessScore, isAbsent, newAgentBaseline, setAbsent, setCapacity } from '@/domain/engine'
import { fmtDate, isShiftTime, monthKey, shiftKey, fmtMonthKey } from '@/lib/time'
import type { CompanyId } from '@/domain/types'

function AddAgentDialog({ companyId, open, onClose }: { companyId: CompanyId; open: boolean; onClose: () => void }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [name, setName] = useState('')
  const b = newAgentBaseline(S, companyId)
  const company = S.companies.find((c) => c.id === companyId)!
  return (
    <Dialog open={open} onClose={onClose} title={`Add agent to ${company.name}`} description="A new agent joining mid-month starts with an offset equal to the team’s current baseline, so they are not given a false backlog. Their real count stays 0, so reports stay truthful."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={UserPlus} onClick={() => { const r = act((d) => addAgent(d, { name, companyId }, me.id), 'Agent added', `${name} starts with offset ${b.baseline}.`); if (r.ok) { setName(''); onClose() } }}>Add agent</Button></>}
    >
      <div className="space-y-4">
        <Field label="Full name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayaan Siddiqui" /></Field>
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800"><Calculator className="size-4 text-slate-400" />Starting baseline · {fmtMonthKey(b.month)}</div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200"><p className="text-[11px] text-slate-500">Team average score</p><p className="mt-0.5 text-lg font-semibold tabular-nums">{b.average.toFixed(2)}</p></div>
            <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200"><p className="text-[11px] text-slate-500">Starting offset</p><p className="mt-0.5 text-lg font-semibold text-violet-700 tabular-nums">{b.baseline}</p></div>
            <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200"><p className="text-[11px] text-slate-500">Real count</p><p className="mt-0.5 text-lg font-semibold tabular-nums">0</p></div>
          </div>
          <p className="mt-3 text-[12px] text-slate-500">Calculated from {b.agents} current agents. <PendingTag title="How the new-agent baseline is calculated and rounded is to be confirmed. The FRD example is the team average.">Calculation & rounding to be confirmed</PendingTag></p>
        </div>
      </div>
    </Dialog>
  )
}

export default function TeamPage() {
  const S = useAppData()
  const { companies, me } = useScope()
  const act = useAction()
  const [cap, setCap] = useState(String(S.params.capacity))
  const [addFor, setAddFor] = useState<CompanyId | null>(null)
  const now = S.clock.now
  const shift = isShiftTime(now)
  const month = monthKey(now)
  const scope = me.role === 'teamlead' ? companies.filter((c) => me.companyIds.includes(c)) : companies
  const admin = canAdminister(me)

  return (
    <div>
      <PageHeader title="Team & shift" description="Agent availability, Absent marking at shift start, the active-lead capacity and new agents. Agents set their own Available / Unavailable status; only the Manager sets Absent." eyebrow={<span>P1-FR-002 · P1-FR-003 · P1-FR-004</span>} />

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Callout tone={shift ? 'success' : 'info'} icon={shift ? Sun : Moon}
          title={shift ? `Shift in progress · ${fmtDate(now)} · 14:00–22:00 PKT` : 'Off-time · 22:00–14:00 PKT'}>
          {shift
            ? 'Mark any agent who is not working this shift as Absent. Their pending off-time Leads become Unassigned and are redistributed right away; the new owner gets the count (MKT-BR-009).'
            : `Leads are still captured and assigned by fairness, ignoring availability, with no SLA. Absent is marked at the start of the next shift (${shiftKey(now)}).`}
        </Callout>
        <Card>
          <CardHeader icon={Gauge} title="Active-lead capacity" description="Maximum unresolved Leads an agent holds at one time — not a daily limit." />
          <div className="p-5">
            <div className="flex items-end gap-2">
              <Field label={<span className="flex items-center gap-2">Leads per agent <PendingTag title="The capacity value is to be confirmed. The FRD gives 3 as an example.">To be confirmed</PendingTag></span>}>
                <Input type="number" min={1} max={50} value={cap} disabled={!admin} onChange={(e) => setCap(e.target.value)} className="w-24" />
              </Field>
              {admin && <Button icon={Save} disabled={Number(cap) === S.params.capacity} onClick={() => act((d) => setCapacity(d, Number(cap), me.id), 'Capacity updated')}>Save</Button>}
            </div>
            <p className="mt-2.5 text-[12px] text-slate-500">“Unresolved” here means assigned and not yet contacted. Applies off-time: <b>{S.params.capacityAppliesOffTime ? 'yes' : 'no'}</b> <PendingTag>Pending</PendingTag></p>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        {scope.map((c) => {
          const agents = companyAgents(S, c)
          const company = S.companies.find((x) => x.id === c)!
          return (
            <Card key={c}>
              <CardHeader title={<span className="flex items-center gap-2"><CompanyTag id={c} className="text-[14px]" />{!company.active && <Badge tone="neutral">Inactive</Badge>}</span>}
                description={`${agents.length} sales agents`}
                actions={admin && <Button size="sm" icon={UserPlus} onClick={() => setAddFor(c)}>Add agent</Button>} />
              {agents.length === 0 ? (
                <p className="px-5 py-5 text-[13px] text-slate-500">No sales agents yet. Leads for this company stay Unassigned until agents are added.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead className="border-b border-slate-100"><tr><th className={th}>Agent</th><th className={th}>Current state</th><th className={th}>Availability (set by agent)</th><th className={cn(th, 'text-right')}>Active / cap</th><th className={cn(th, 'text-right')}>Score</th><th className={th}>Absent this shift</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {agents.map((a) => {
                        const absent = isAbsent(a, now)
                        const sc = fairnessScore(S, a.id, month)
                        return (
                          <tr key={a.id} className={cn(absent && 'bg-rose-50/30')}>
                            <td className={td}><span className="flex items-center gap-2.5"><Avatar name={a.name} size="sm" /><span className="font-medium text-slate-800">{a.name}</span>{sc.offset > 0 && <Badge tone="violet" icon={Sparkles}>Offset +{sc.offset}</Badge>}</span></td>
                            <td className={td}><AgentStateBadge state={agentState(S, a, now)} /></td>
                            <td className={td}><span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-600"><span className={cn('size-2 rounded-full', a.availability === 'available' ? 'bg-emerald-500' : 'bg-amber-500')} />{a.availability === 'available' ? 'Available' : 'Unavailable'}<Lock className="size-3 text-slate-300" /></span></td>
                            <td className={cn(td, 'text-right tabular-nums')}>{activeLeadCount(S, a.id)} / {S.params.capacity}</td>
                            <td className={cn(td, 'text-right font-semibold tabular-nums')}>{sc.score}</td>
                            <td className={td}>
                              <div className="flex items-center gap-2" title={!canSetAbsent(me) ? 'Only the Manager sets Absent' : !shift ? 'Absent is marked during the shift' : undefined}>
                                <Switch checked={absent} disabled={!canSetAbsent(me) || !shift} label={`Mark ${a.name} Absent`} onChange={(v) => act((d) => setAbsent(d, a.id, v, me.id), v ? `${a.name} marked Absent` : `${a.name} back at work`, v ? 'Pending off-time Leads were released and redistributed.' : undefined)} />
                                <span className={cn('text-[12.5px]', absent ? 'font-medium text-rose-700' : 'text-slate-500')}>{absent ? 'Absent' : 'Working'}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })}
      </div>
      {me.role === 'teamlead' && <Callout tone="neutral" icon={Lock} className="mt-5">Only the Manager sets Absent and only agents set their own availability (P3-FR-001). How a Team Lead “helps with agent availability according to company policy” is not yet defined.</Callout>}
      {addFor && <AddAgentDialog companyId={addFor} open onClose={() => setAddFor(null)} />}
    </div>
  )
}
