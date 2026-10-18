import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Pause, FastForward, Sun, Moon, CalendarRange, FileText, Globe, MessageCircle, MessagesSquare, Repeat2, Zap, RotateCcw, RefreshCw, FileX, Info } from 'lucide-react'
import { Drawer, toast } from '../ui/overlay'
import { Button, Select, Switch, SimTag, Callout, cn } from '../ui'
import { useAppData, useRun, useStore } from '@/store/store'
import { advanceTo, receiveExternalEvent, setConnectionError, setConnectionState, userName, type ExternalPayload } from '@/domain/engine'
import { refreshInsights } from '@/domain/insights'
import { makePerson, SOCIAL_OPENERS } from '@/domain/seed'
import { CONNECTION_LABEL } from '@/domain/constants'
import type { AppData, CompanyId, ConnectionKind, EnquiryChannel, LeadSource } from '@/domain/types'
import { HOUR, MIN, fmtDate, fmtTimeSec, isShiftTime, nextMonthStart, nextShiftEnd, nextShiftStart, fmtDow } from '@/lib/time'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-5 py-5">
      <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-0.5 mb-3 text-[12px] text-slate-500">{description}</p>}
      <div className={cn(!description && 'mt-3')}>{children}</div>
    </section>
  )
}

let extCounter = Math.floor(Math.random() * 1e6)

export function DemoConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const S = useAppData()
  const run = useRun()
  const resetDemo = useStore((s) => s.resetDemo)
  const navigate = useNavigate()
  const [company, setCompany] = useState<CompanyId>('flightnest')
  const [connId, setConnId] = useState('cn-flightnest-meta_forms')
  const [lastMeta, setLastMeta] = useState<{ company: CompanyId; payload: ExternalPayload } | null>(null)
  const now = S.clock.now
  const shift = isShiftTime(now)

  const jump = (t: number, label: string) => { run((d) => advanceTo(d, t)); toast.info('Clock moved', label) }

  const send = (source: LeadSource, opts: { noCampaign?: boolean } = {}) => {
    const fields = makePerson(company)
    let payload: ExternalPayload
    if (source === 'meta_form' || source === 'website') {
      const cmps = S.campaigns.filter((c) => c.companyId === company)
      const cmp = source === 'meta_form' && !opts.noCampaign && cmps.length ? cmps[Math.floor(Math.random() * cmps.length)] : null
      const ads = cmp ? S.ads.filter((a) => a.campaignId === cmp.id) : []
      const ad = ads.length ? ads[Math.floor(Math.random() * ads.length)] : null
      payload = { kind: 'lead', source, fields, campaignId: cmp?.id ?? null, adId: ad?.id ?? null, externalId: `${source === 'meta_form' ? 'leadgen' : 'web'}_demo_${++extCounter}` }
    } else {
      const channel = source as EnquiryChannel
      const cmp = S.campaigns.find((c) => c.companyId === company)
      payload = {
        kind: 'enquiry', source, channel, fields, campaignId: null, adId: null, externalId: `msg_demo_${++extCounter}`,
        handle: `@${fields.fullName.toLowerCase().replace(' ', '.')}`,
        text: SOCIAL_OPENERS[Math.floor(Math.random() * SOCIAL_OPENERS.length)],
        postContext: channel.endsWith('comment') && cmp ? `Comment on post: “${cmp.name}”` : undefined,
      }
    }
    if (source === 'meta_form') setLastMeta({ company, payload })
    const res = run((d) => receiveExternalEvent(d, company, payload))
    report(res, payload)
  }

  const report = (res: { outcome: string; recordId: string | null }, payload: ExternalPayload) => {
    const d = useStore.getState().data
    if (res.outcome === 'flagged') return toast.warning('Event flagged — not lost', 'The connection is in error. See Integrations → failed events.')
    if (res.outcome === 'duplicate-ignored') return toast.info('Repeated delivery ignored', `Event ${payload.externalId} was already received — no second record was created.`)
    if (payload.kind === 'enquiry') {
      const e = d.enquiries.find((x) => x.id === res.recordId)
      toast.success(`Unqualified Enquiry ${e?.ref}`, 'Added to the Marketing Inbox, unassigned. It will not enter distribution until Marketing converts it.')
      return
    }
    const l = d.leads.find((x) => x.id === res.recordId)
    if (!l) return
    toast.success(`Lead ${l.ref} created`, l.ownerId ? `Assigned to ${userName(d, l.ownerId)}${isShiftTime(d.clock.now) ? '' : ' (off-time — no SLA)'}.` : 'No eligible agent — left Unassigned and the Manager was notified.')
  }

  const conn = S.connections.find((c) => c.id === connId)!
  const connCompanies = S.companies

  return (
    <Drawer open={open} onClose={onClose} title={<span className="flex items-center gap-2">Demo console <SimTag>Simulation only</SimTag></span>} description="Drive the prototype for a client walkthrough. Nothing here represents a live production capability." width="max-w-[440px]">
      <Section title="Simulated clock (PKT)" description="Shift 14:00–22:00 PKT · Off-time 22:00–14:00 PKT. The SLA timer only counts shift time while the owner is Available.">
        <div className="rounded-xl bg-slate-950 p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-300">{fmtDow(now)}, {fmtDate(now)}</p>
              <p className="mt-0.5 text-3xl font-semibold tracking-tight tabular-nums">{fmtTimeSec(now)}</p>
            </div>
            <span className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold', shift ? 'bg-emerald-500/15 text-emerald-300' : 'bg-indigo-500/20 text-indigo-200')}>
              {shift ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}{shift ? 'Shift time' : 'Off-time'}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={() => run((d) => { d.clock.running = !d.clock.running })} className="flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[12.5px] font-medium hover:bg-white/15">
              {S.clock.running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{S.clock.running ? 'Pause' : 'Play'}
            </button>
            <div className="flex rounded-lg bg-white/10 p-0.5">
              {[1, 10, 60, 300].map((sp) => (
                <button key={sp} onClick={() => run((d) => { d.clock.speed = sp; d.clock.running = true })} className={cn('h-7 rounded-md px-2.5 text-[12px] font-medium tabular-nums', S.clock.speed === sp ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white')}>{sp}×</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button size="sm" icon={FastForward} onClick={() => jump(now + 5 * MIN, '+5 minutes')}>+5 min</Button>
          <Button size="sm" icon={FastForward} onClick={() => jump(now + 15 * MIN, '+15 minutes')}>+15 min</Button>
          <Button size="sm" icon={FastForward} onClick={() => jump(now + HOUR, '+1 hour')}>+1 hour</Button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button size="sm" icon={Sun} onClick={() => jump(nextShiftStart(now), 'Shift start 14:00 PKT — mark any Absent agents on Team & shift')}>Shift start</Button>
          <Button size="sm" icon={Moon} onClick={() => jump(nextShiftEnd(now), 'Off-time from 22:00 PKT — Leads are assigned without an SLA')}>Off-time</Button>
          <Button size="sm" icon={CalendarRange} onClick={() => jump(nextMonthStart(now) + 14 * HOUR + MIN, 'New month — fairness counts reset automatically')}>Next month</Button>
        </div>
      </Section>

      <Section title="Simulate an incoming enquiry" description="Creates records exactly as the six sources would. Phone calls and rare emails are entered manually from “New manual lead”.">
        <Select value={company} onChange={(e) => setCompany(e.target.value as CompanyId)} aria-label="Company">
          {S.companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inactive · no agents)'}</option>)}
        </Select>
        <p className="mt-3 mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Creates a Lead → distribution</p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" icon={FileText} onClick={() => send('meta_form')}>Meta Instant Form</Button>
          <Button size="sm" icon={FileX} onClick={() => send('meta_form', { noCampaign: true })}>Meta form · no campaign</Button>
          <Button size="sm" icon={Globe} onClick={() => send('website')} className="col-span-2">Company website form</Button>
        </div>
        <p className="mt-3 mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Creates an Unqualified Enquiry → Marketing Inbox</p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" icon={MessageCircle} onClick={() => send('facebook_dm')}>Facebook DM</Button>
          <Button size="sm" icon={MessageCircle} onClick={() => send('instagram_dm')}>Instagram DM</Button>
          <Button size="sm" icon={MessagesSquare} onClick={() => send('facebook_comment')}>Facebook comment</Button>
          <Button size="sm" icon={MessagesSquare} onClick={() => send('instagram_comment')}>Instagram comment</Button>
        </div>
      </Section>

      <Section title="Integration behaviour" description="Repeated delivery protection (idempotency) and failure states. The recovery method is not decided, so recovery here is only a state change.">
        <Button size="sm" icon={Repeat2} disabled={!lastMeta} className="w-full" onClick={() => {
          if (!lastMeta) return
          const res = run((d) => receiveExternalEvent(d, lastMeta.company, lastMeta.payload))
          report(res, lastMeta.payload)
        }}>Re-deliver the last Meta form event</Button>
        {!lastMeta && <p className="mt-1.5 text-[11.5px] text-slate-500">Send a Meta Instant Form first.</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Select value={conn.companyId} onChange={(e) => setConnId(`cn-${e.target.value}-${conn.kind}`)} aria-label="Connection company">
            {connCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={conn.kind} onChange={(e) => setConnId(`cn-${conn.companyId}-${e.target.value as ConnectionKind}`)} aria-label="Connection type">
            {(Object.keys(CONNECTION_LABEL) as ConnectionKind[]).map((k) => <option key={k} value={k}>{CONNECTION_LABEL[k]}</option>)}
          </Select>
        </div>
        <p className="mt-2 text-[12px] text-slate-500">Current state: <span className="font-semibold text-slate-700">{conn.state}</span></p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="sm" variant="danger" icon={Zap} onClick={() => { run((d) => setConnectionError(d, connId, 'Connection failure (simulated)')); toast.warning('Connection failure simulated', 'The Manager is alerted; incoming events are flagged.') }}>Simulate failure</Button>
          <Button size="sm" icon={RefreshCw} disabled={conn.state !== 'error'} onClick={() => run((d) => setConnectionState(d, connId, 'recovering'))}>Mark recovering</Button>
          <Button size="sm" disabled={conn.state !== 'recovering' && conn.state !== 'error'} onClick={() => { run((d) => setConnectionState(d, connId, 'recovered')); toast.success('Marked recovered', 'Flagged events for this connection were processed (simulation).') }}>Mark recovered</Button>
          <Button size="sm" variant="ghost" onClick={() => run((d) => setConnectionState(d, connId, 'pending'))}>Reset to pending</Button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
          <div>
            <p className="text-[12.5px] font-medium text-slate-800">Meta insights reachable</p>
            <p className="text-[11.5px] text-slate-500">Turn off to show the “Meta data unavailable” state in Reports.</p>
          </div>
          <Switch checked={S.metaAvailable} onChange={(v) => run((d) => { d.metaAvailable = v })} label="Meta insights reachable" />
        </div>
        <Button size="sm" icon={RefreshCw} className="mt-2 w-full" onClick={() => {
          const okRefresh = run((d: AppData) => refreshInsights(d))
          if (okRefresh) toast.success('Meta insights refreshed', 'Reports now show the latest simulated insights.')
          else toast.error('Meta insights could not be fetched', 'The CRM funnel still loads in Reports.')
        }}>Refresh Meta insights now</Button>
      </Section>

      <Section title="Messaging simulation" description="Applies to simulated conversations only. Real conversations (from Meta webhooks) always go through the messaging server.">
        <label htmlFor="sim-outcome" className="mb-1.5 block text-[12.5px] font-medium text-slate-700">Outcome of the next simulated reply</label>
        <Select id="sim-outcome" value={S.messagingSim.nextOutcome} onChange={(e) => run((d) => { d.messagingSim.nextOutcome = e.target.value as AppData['messagingSim']['nextOutcome'] })}>
          <option value="success">Sent successfully</option>
          <option value="rate_limited">Fails: rate limited (retryable)</option>
          <option value="network">Fails: network error (retryable)</option>
          <option value="token_invalid">Fails: page token expired</option>
          <option value="permission_missing">Fails: permission missing</option>
          <option value="recipient_unavailable">Fails: client unavailable</option>
        </Select>
        <p className="mt-1.5 text-[11.5px] text-slate-500">Resets to “Sent successfully” after one use. To show the connection-error state, use “Simulate failure” on Facebook/Instagram inbox & engagement above. In an open simulated conversation, “Simulate client message” makes the client write in.</p>
      </Section>

      <Section title="Demo data">
        <Callout tone="neutral" icon={Info}>Data is stored in this browser only. Resetting rebuilds the demo history (1 Sep – 17 Oct 2026) and the clock.</Callout>
        <Button size="sm" variant="danger" icon={RotateCcw} className="mt-3 w-full" onClick={() => {
          if (!window.confirm('Reset all demo data to the starting state?')) return
          resetDemo(); navigate('/'); toast.success('Demo data reset')
        }}>Reset demo data</Button>
      </Section>
    </Drawer>
  )
}

