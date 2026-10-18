import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, Shuffle, Hand, UserPlus, Info } from 'lucide-react'
import { Avatar, Button, Callout, Card, CardHeader, Field, Input, PageHeader, PendingTag, Select, Textarea, cn } from '@/components/ui'
import { AgentStateBadge } from '@/components/domain'
import { toast } from '@/components/ui/overlay'
import { useAppData, useMe, useRun, useStore } from '@/store/store'
import { canAssign, canCreateManualLead, manageableCompanies } from '@/domain/permissions'
import { activeLeadCount, agentState, companyAgents, createLead, userName } from '@/domain/engine'
import { EMPTY_FIELDS, FIELD_LABEL, STANDARD_FIELDS } from '@/domain/constants'
import type { CompanyId, CustomerFields } from '@/domain/types'
import { isShiftTime } from '@/lib/time'

export default function NewLeadPage() {
  const S = useAppData()
  const me = useMe()
  const run = useRun()
  const navigate = useNavigate()
  const companies = manageableCompanies(S, me).filter((c) => canCreateManualLead(S, me, c))
  const [companyId, setCompanyId] = useState<CompanyId>(companies[0])
  const [source, setSource] = useState<'phone' | 'email'>('phone')
  const [fields, setFields] = useState<CustomerFields>({ ...EMPTY_FIELDS })
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [agentId, setAgentId] = useState('')
  const [tried, setTried] = useState(false)
  const allowManual = canAssign(S, me, companyId)
  const agents = companyAgents(S, companyId)

  const submit = () => {
    setTried(true)
    if (!fields.fullName.trim()) return
    if (mode === 'manual' && !agentId) return
    const lead = run((d) => createLead(d, { companyId, source, fields, assignment: mode === 'manual' && allowManual ? { mode: 'manual', agentId } : { mode: 'auto' } }, me.id))
    toast.success(`Lead ${lead.ref} created`, lead.ownerId ? `Assigned to ${userName(useStore.getState().data, lead.ownerId)}.` : 'No eligible agent — left Unassigned and the Manager was notified.')
    navigate(`/leads/${lead.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New manual lead" description="Enter a Lead from a direct phone call or a rare email enquiry. Full mailbox synchronisation is not part of this module." eyebrow={<span>P1-FR-001 · Manual entry</span>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader title="Lead details" />
          <div className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company" required>
                <Select value={companyId} onChange={(e) => { setCompanyId(e.target.value as CompanyId); setAgentId('') }}>
                  {companies.map((c) => <option key={c} value={c}>{S.companies.find((x) => x.id === c)?.name}{S.companies.find((x) => x.id === c)?.active ? '' : ' (inactive)'}</option>)}
                </Select>
              </Field>
              <Field label="Source" required>
                <div className="grid grid-cols-2 gap-2">
                  {([['phone', 'Phone call', Phone], ['email', 'Email', Mail]] as const).map(([v, label, Icon]) => (
                    <button key={v} type="button" onClick={() => setSource(v)} className={cn('flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-medium ring-1 transition ring-inset', source === v ? 'bg-brand-50 text-brand-700 ring-brand-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
                      <Icon className="size-4" />{label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {STANDARD_FIELDS.map((k) => (
                <Field key={k} label={FIELD_LABEL[k]} required={k === 'fullName'} error={tried && k === 'fullName' && !fields.fullName.trim() ? 'Enter the customer’s full name' : undefined}>
                  <Input value={fields[k]} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} type={k === 'email' ? 'email' : 'text'} invalid={tried && k === 'fullName' && !fields.fullName.trim()} />
                </Field>
              ))}
            </div>
            <Field label={FIELD_LABEL.tripDetails} hint="Optional extra trip details.">
              <Textarea value={fields.tripDetails} onChange={(e) => setFields({ ...fields, tripDetails: e.target.value })} placeholder="Destination, dates, number of travellers…" />
            </Field>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Assignment" />
            <div className="space-y-3 p-5">
              {([['auto', 'Automatic', 'Apply the distribution rules (eligibility, then fairness).', Shuffle], ['manual', 'Manual', 'Choose an agent of this company yourself.', Hand]] as const).map(([v, label, desc, Icon]) => {
                const disabled = v === 'manual' && !allowManual
                return (
                  <button key={v} type="button" disabled={disabled} onClick={() => setMode(v)} className={cn('flex w-full items-start gap-3 rounded-xl p-3 text-left ring-1 transition ring-inset disabled:cursor-not-allowed disabled:opacity-50', mode === v ? 'bg-brand-50/70 ring-brand-300' : 'ring-slate-200 enabled:hover:bg-slate-50')}>
                    <Icon className={cn('mt-0.5 size-4', mode === v ? 'text-brand-600' : 'text-slate-400')} />
                    <span>
                      <span className="block text-[13px] font-semibold text-slate-800">{label}</span>
                      <span className="block text-[12px] text-slate-500">{desc}</span>
                    </span>
                  </button>
                )
              })}
              {!allowManual && <p className="text-[12px] text-slate-500">Manual assignment is available to the Admin / Manager (MKT-BR-006).</p>}
              {mode === 'manual' && allowManual && (
                <Field label="Agent" required error={tried && !agentId ? 'Choose an agent' : undefined}>
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {agents.length === 0 && <p className="text-[12.5px] text-slate-500">This company has no agents yet.</p>}
                    {agents.map((a) => (
                      <label key={a.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 ring-1 ring-inset', agentId === a.id ? 'bg-brand-50/60 ring-brand-200' : 'ring-transparent hover:bg-slate-50')}>
                        <input type="radio" name="agent" className="accent-brand-600" checked={agentId === a.id} onChange={() => setAgentId(a.id)} />
                        <Avatar name={a.name} size="xs" />
                        <span className="flex-1 truncate text-[12.5px] font-medium text-slate-700">{a.name}</span>
                        <span className="text-[11px] text-slate-400 tabular-nums">{activeLeadCount(S, a.id)}/{S.params.capacity}</span>
                        <AgentStateBadge state={agentState(S, a, S.clock.now)} />
                      </label>
                    ))}
                  </div>
                </Field>
              )}
              {mode === 'manual' && <p className="text-[11.5px] text-slate-500">Counts toward fairness: {S.params.manualCountsTowardFairness ? 'yes' : 'no'} <PendingTag>Pending</PendingTag></p>}
            </div>
          </Card>
          {!isShiftTime(S.clock.now) && <Callout tone="info" icon={Info}>It is off-time. Automatic assignment ignores availability and no SLA runs until the shift starts.</Callout>}
          <Button variant="primary" icon={UserPlus} className="w-full" onClick={submit}>Create lead</Button>
        </div>
      </div>
    </div>
  )
}
