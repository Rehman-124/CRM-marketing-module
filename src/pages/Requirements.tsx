import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, ChevronDown, ChevronRight, ArrowUpRight, CircleDashed, SlidersHorizontal, GitCompareArrows, HelpCircle, UserCheck } from 'lucide-react'
import { Badge, Callout, Card, CardHeader, Input, PageHeader, PendingTag, Select, Switch, Textarea, td, cn } from '@/components/ui'
import { useAppData, useRun } from '@/store/store'
import { FRS, INTERPRETATIONS, OPEN_DECISIONS, OWNER_DECISIONS } from '@/domain/spec'
import { FIELD_LABEL, STANDARD_FIELDS } from '@/domain/constants'
import type { PendingDecisionParams } from '@/domain/types'

const KEY = 'trip2go-mkt-tracker'
type Tracker = { design: Record<string, string>; acs: Record<string, boolean>; decisions: Record<string, boolean> }
function load(): Tracker {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) } catch { /* ignore */ }
  return { design: {}, acs: {}, decisions: {} }
}
const DESIGN_STATUSES = ['Ready for Design', 'In Design', 'Design Review', 'Design Approved', 'In Development', 'In QA', 'Done']

export default function RequirementsPage() {
  const S = useAppData()
  const run = useRun()
  const [tracker, setTracker] = useState<Tracker>(load)
  const [open, setOpen] = useState<Record<string, boolean>>({ 'P1-FR-001': true })
  const update = (t: Tracker) => { setTracker(t); try { localStorage.setItem(KEY, JSON.stringify(t)) } catch { /* ignore */ } }
  const p = S.params
  const setParam = <K extends keyof PendingDecisionParams>(k: K, v: PendingDecisionParams[K]) => run((d) => { d.params[k] = v })
  const totalAcs = FRS.reduce((a, f) => a + f.acs.length, 0)
  const passed = Object.values(tracker.acs).filter(Boolean).length

  return (
    <div>
      <PageHeader title="Requirements & decisions" description="Traceability to the Marketing FRD (10 Oct 2026): track each requirement through design, tick acceptance criteria as they pass testing, and see every open decision and the placeholder the prototype uses for it." eyebrow={<Badge tone="brand" icon={ClipboardCheck}>Prototype</Badge>} />

      <Callout tone="warning" icon={GitCompareArrows} className="mb-5" title="Distribution rule conflict with TO-BE v0.2 — open decision">
        This prototype implements the FRD rule: eligibility first (Absent → Unavailable → active-lead capacity), then the lowest fairness score among the agents left. TO-BE v0.2 §§6–7 describes strict lowest-score-first (assigning inside the lowest group even if all are Unavailable), with no capacity limit, monthly cycle or new-agent baseline. The two need aligning.
      </Callout>

      <Card className="mb-5">
        <CardHeader title="FR tracker" description={`10 functional requirements · ${passed} of ${totalAcs} acceptance criteria ticked`} actions={<div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(passed / totalAcs) * 100}%` }} /></div>} />
        <div className="divide-y divide-slate-100">
          {FRS.map((fr) => {
            const done = fr.acs.filter((a) => tracker.acs[a.id]).length
            const isOpen = open[fr.id]
            return (
              <div key={fr.id}>
                <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <button onClick={() => setOpen({ ...open, [fr.id]: !isOpen })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {isOpen ? <ChevronDown className="size-4 shrink-0 text-slate-400" /> : <ChevronRight className="size-4 shrink-0 text-slate-400" />}
                    <span className="w-24 shrink-0 font-mono text-[12px] font-semibold text-brand-700">{fr.id}</span>
                    <span className="min-w-0 truncate text-[13.5px] font-medium text-slate-800">{fr.title}</span>
                  </button>
                  <Badge tone="neutral">Phase {fr.phase}</Badge>
                  <Badge tone={fr.priority === 'Must Have' ? 'red' : 'amber'}>{fr.priority}</Badge>
                  <span className={cn('w-14 text-right text-[12px] tabular-nums', done === fr.acs.length ? 'font-semibold text-emerald-700' : 'text-slate-500')}>{done}/{fr.acs.length} AC</span>
                  <Select value={tracker.design[fr.id] ?? 'Ready for Design'} onChange={(e) => update({ ...tracker, design: { ...tracker.design, [fr.id]: e.target.value } })} className="h-8 w-40 text-[12.5px]" aria-label="Design status">
                    {DESIGN_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                  <Link to={fr.route} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline">Open<ArrowUpRight className="size-3.5" /></Link>
                </div>
                {isOpen && (
                  <div className="bg-slate-50/60 px-5 pt-1 pb-4 pl-12">
                    <p className="mb-2 text-[12px] text-slate-500"><b className="text-slate-600">Where to verify:</b> {fr.where}</p>
                    <ul className="space-y-1.5">
                      {fr.acs.map((a) => (
                        <li key={a.id}>
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white">
                            <input type="checkbox" className="mt-0.5 size-4 accent-emerald-600" checked={!!tracker.acs[a.id]} onChange={(e) => update({ ...tracker, acs: { ...tracker.acs, [a.id]: e.target.checked } })} />
                            <span className="text-[13px] text-slate-700"><b className="mr-1.5 font-mono text-[11.5px] text-slate-500">{a.id}</b>{a.text}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card>
          <CardHeader icon={CircleDashed} title="Open decisions & technical dependencies" description="Tick a decision once it is resolved. Until then the prototype uses the placeholder shown." />
          <div className="divide-y divide-slate-100">
            {OPEN_DECISIONS.map((g) => (
              <div key={g.group} className="px-5 py-4">
                <p className="mb-2 text-[11.5px] font-semibold tracking-wide text-slate-500 uppercase">{g.group}</p>
                <ul className="space-y-2">
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <input type="checkbox" className="mt-0.5 size-4 accent-emerald-600" checked={!!tracker.decisions[it.id]} onChange={(e) => update({ ...tracker, decisions: { ...tracker.decisions, [it.id]: e.target.checked } })} />
                        <span className="text-[13px]">
                          <span className={cn('text-slate-700', tracker.decisions[it.id] && 'text-slate-400 line-through')}>{it.text}</span>
                          {it.placeholder && <span className="mt-0.5 block text-[12px] text-amber-800">Placeholder: {it.placeholder}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader icon={SlidersHorizontal} title="Demo parameters" description="Stand-ins for open decisions so each option can be shown. None is an approved business rule." actions={<PendingTag />} />
            <div className="divide-y divide-slate-100">
              {([
                ['capacityAppliesOffTime', 'Capacity applies to off-time allocation'],
                ['manualCountsTowardFairness', 'Manual assignments count toward fairness'],
                ['slaRestartsOnReassign', 'SLA timer restarts for the new owner'],
                ['requireReassignReason', 'Reassignment needs a reason'],
                ['allowBackwardStatus', 'Agents can move a Lead backward'],
                ['allowReopenLost', 'Agents can reopen a Lost Lead'],
                ['teamLeadCanAssign', 'Team Leads can assign/reassign (company policy)'],
                ['teamLeadReceivesSla', 'Team Leads receive SLA alerts (where authorised)'],
                ['marketingCanCreateManualLeads', 'Marketing employees are “authorised users” for manual entry'],
              ] as const).map(([k, label]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <span className="text-[13px] text-slate-700">{label}</span>
                  <Switch checked={p[k] as boolean} onChange={(v) => setParam(k, v)} label={label} />
                </div>
              ))}
              <div className="px-5 py-3">
                <p className="mb-2 text-[13px] text-slate-700">Required fields to convert a social enquiry</p>
                <div className="flex flex-wrap gap-1.5">
                  {STANDARD_FIELDS.map((f) => {
                    const on = p.conversionRequiredFields.includes(f)
                    return <button key={f} onClick={() => setParam('conversionRequiredFields', on ? p.conversionRequiredFields.filter((x) => x !== f) : [...p.conversionRequiredFields, f])} className={cn('rounded-md px-2 py-1 text-[12px] font-medium ring-1 ring-inset', on ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50')}>{FIELD_LABEL[f]}</button>
                  })}
                </div>
              </div>
              <div className="px-5 py-3">
                <p className="mb-2 text-[13px] text-slate-700">Lost reasons (one per line)</p>
                <Textarea aria-label="Lost reasons, one per line" value={p.lossReasons.join('\n')} onChange={(e) => setParam('lossReasons', e.target.value.split('\n').map((s) => s.trimStart()).filter((s, i, a) => s || i === a.length - 1))} className="min-h-32 text-[12.5px]" />
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="text-[13px] text-slate-700">Active-lead capacity</span>
                <Input aria-label="Active-lead capacity" type="number" min={1} max={50} value={p.capacity} onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 50) setParam('capacity', n) }} className="h-8 w-20" />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader icon={UserCheck} title="Product-owner decisions outside the FRD" description="Taken for the inbox reply feature, which the FRD does not cover." />
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {OWNER_DECISIONS.map((d) => (
                  <tr key={d.topic}><td className={cn(td, 'w-36 align-top font-medium text-slate-800')}>{d.topic}<span className="block text-[11px] font-normal text-slate-500">{d.date}</span></td><td className={cn(td, 'text-[12.5px] text-slate-600')}>{d.text}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHeader icon={HelpCircle} title="Interpretations to confirm" description="Ambiguities found while building; how the prototype reads them." />
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {INTERPRETATIONS.map((i) => (
                  <tr key={i.topic}><td className={cn(td, 'w-36 align-top font-medium text-slate-800')}>{i.topic}</td><td className={cn(td, 'text-[12.5px] text-slate-600')}>{i.text}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  )
}
