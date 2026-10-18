import { PlugZap, FlaskConical, CircleDashed, AlertOctagon, CheckCircle2, ShieldAlert, Globe, KeyRound, LifeBuoy, ListX, Repeat2, Info } from 'lucide-react'
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, SimTag, th, td, cn } from '@/components/ui'
import { CompanyTag, ConnectionStateBadge } from '@/components/domain'
import { MessagingStatusCard } from '@/components/inbox/MessagingStatusCard'
import { useAppData } from '@/store/store'
import { CONNECTION_LABEL, CONNECTION_STATE_LABEL } from '@/domain/constants'
import { companyName } from '@/domain/engine'
import { fmtDateTime, fmtRelative } from '@/lib/time'
import type { ConnectionState } from '@/domain/types'

const CAPABILITIES = [
  { icon: FlaskConical, title: 'Meta Instant Forms', status: 'tested', body: 'Meta notifies the CRM automatically and the submitted lead data can be retrieved.', todo: 'Production: durable credentials, idempotency, retries and monitoring.' },
  { icon: FlaskConical, title: 'Facebook/Instagram inbox & engagement', status: 'tested', body: 'Tested on the test company’s assets.', todo: 'Final production permissions and coverage for all six company profiles. Whether these paths use webhooks is to be confirmed.' },
  { icon: FlaskConical, title: 'Campaign & ad insights', status: 'tested', body: 'Campaign- and ad-level performance data can be retrieved.', todo: 'Exact metric set, refresh frequency and report views still to be finalised.' },
  { icon: KeyRound, title: 'Six-company authorisation', status: 'required', body: 'Business-owned long-lived credentials, asset permissions and any Meta app review or business verification.', todo: 'Still required.' },
  { icon: Globe, title: 'Website forms', status: 'required', body: 'Each company website connects directly to the CRM with company and source attribution, anti-spam and validation.', todo: 'Still required · not yet tested.' },
  { icon: LifeBuoy, title: 'Failure handling', status: 'required', body: 'Retries, monitoring and an operational fallback so a failing connection does not lose enquiries.', todo: 'Still required · recovery method not decided.' },
] as const

const STATE_HELP: Record<ConnectionState, string> = {
  confirmed: 'Production connection tested and confirmed. No connection is in this state yet.',
  pending: 'Not yet confirmed for production — never shown as working.',
  error: 'Delivery or retrieval is failing. Incoming events are flagged, not lost.',
  recovering: 'The failure is being worked on.',
  recovered: 'The connection is working again after a failure; flagged events were processed.',
  'no-events': 'Connected but nothing has been received yet.',
}

export default function IntegrationsPage() {
  const S = useAppData()
  const errors = S.connections.filter((c) => c.state === 'error')
  const failed = [...S.failedEvents].reverse()
  const events = [...S.externalEvents].slice(-12).reverse()
  const duplicates = S.externalEvents.filter((e) => e.deliveries > 1).length

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Which Marketing connections are confirmed, which are pending, and any failures. A failed connection must never silently lose a Lead."
        eyebrow={<span>P3-FR-003 · TO-BE v0.2 §14</span>}
      />

      {errors.map((c) => (
        <Callout key={c.id} tone="danger" icon={AlertOctagon} className="mb-3" title={`Connection failure · ${companyName(S, c.companyId)} · ${CONNECTION_LABEL[c.kind]}`}>
          {c.lastError}. Since then, incoming events for this connection are flagged in the failed-event list below.
        </Callout>
      ))}

      <h2 className="mt-2 mb-3 text-[13px] font-semibold tracking-wide text-slate-500 uppercase">Proof-of-concept status</h2>
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CAPABILITIES.map((c) => (
          <Card key={c.title} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <span className={cn('flex size-9 items-center justify-center rounded-lg ring-1 ring-inset', c.status === 'tested' ? 'bg-emerald-50 text-emerald-600 ring-emerald-200' : 'bg-amber-50 text-amber-600 ring-amber-200')}><c.icon className="size-4" /></span>
              {c.status === 'tested' ? <Badge tone="green" icon={CheckCircle2}>Tested in PoC</Badge> : <Badge tone="amber" icon={CircleDashed}>Still required</Badge>}
            </div>
            <p className="mt-3 text-[13.5px] font-semibold text-slate-900">{c.title}</p>
            <p className="mt-1 text-[12.5px] text-slate-600">{c.body}</p>
            <p className="mt-2 text-[12px] text-slate-500">{c.todo}</p>
          </Card>
        ))}
      </div>
      <Callout tone="warning" icon={ShieldAlert} className="mb-6">The proof-of-concept results should be confirmed with sample data before they are treated as complete. Production authorisation for all six companies is still required, so every production connection below is <b>Pending</b> unless a failure is being simulated.</Callout>

      <Card className="mb-5">
        <CardHeader icon={PlugZap} title="Connection status" description="One row per connection per company" actions={<SimTag>Failures are simulated from the demo console</SimTag>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Company</th><th className={th}>Connection</th><th className={th}>Proof of concept</th><th className={th}>Production state</th><th className={th}>Last event</th><th className={th}>Detail</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {S.connections.map((c, i) => {
                const first = i === 0 || S.connections[i - 1].companyId !== c.companyId
                return (
                  <tr key={c.id} className={cn(first && i > 0 && 'border-t-2 border-slate-100', c.state === 'error' && 'bg-rose-50/40')}>
                    <td className={td}>{first && <CompanyTag id={c.companyId} />}</td>
                    <td className={cn(td, 'font-medium text-slate-800')}>{CONNECTION_LABEL[c.kind]}</td>
                    <td className={td}>{c.pocTested ? <Badge tone="green" icon={CheckCircle2}>Tested</Badge> : <Badge tone="neutral">Not tested</Badge>}</td>
                    <td className={td}><ConnectionStateBadge state={c.state} /></td>
                    <td className={cn(td, 'text-[12.5px] text-slate-500')}>{c.lastEventAt ? <span title={fmtDateTime(c.lastEventAt)}>{fmtRelative(c.lastEventAt, S.clock.now)}</span> : 'No events yet'}</td>
                    <td className={cn(td, 'max-w-72 text-[12px]', c.lastError ? 'text-rose-700' : 'text-slate-400')}>{c.lastError ?? (c.kind === 'website' ? 'Website integration depends on the technical team' : '—')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader icon={ListX} title="Failed events" description="Events that could not be processed are flagged here — none are dropped silently." />
          {failed.length === 0 ? <EmptyState compact icon={CheckCircle2} title="No failed events" /> : (
            <ul className="divide-y divide-slate-100">
              {failed.map((f) => (
                <li key={f.id} className="flex items-start gap-3 px-5 py-3">
                  <span className={cn('mt-0.5 flex size-7 items-center justify-center rounded-lg', f.status === 'flagged' ? 'bg-rose-50 text-rose-600' : 'bg-teal-50 text-teal-600')}>{f.status === 'flagged' ? <AlertOctagon className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-slate-800">{f.summary}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">{companyName(S, f.companyId)} · {CONNECTION_LABEL[S.connections.find((c) => c.id === f.connectionId)!.kind]} · <span className="font-mono">{f.payload.externalId}</span></p>
                  </div>
                  <div className="text-right">
                    {f.status === 'flagged' ? <Badge tone="red">Flagged</Badge> : <Badge tone="teal">Recovered</Badge>}
                    <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(f.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-slate-100 px-5 py-2.5 text-[11.5px] text-slate-500">The recovery method (retry timing, any fallback such as a sync of missed leads, who is alerted) is not decided. No recovery flow is drawn here.</p>
        </Card>

        <Card>
          <CardHeader icon={Repeat2} title="Recent external events" description="A repeated delivery of the same event is treated as one record, not two." actions={<Badge tone="neutral">{duplicates} with repeated deliveries</Badge>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead className="border-b border-slate-100"><tr><th className={th}>Event</th><th className={th}>Company</th><th className={th}>Outcome</th><th className={cn(th, 'text-right')}>Deliveries</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => {
                  const conn = S.connections.find((c) => c.id === e.connectionId)!
                  return (
                    <tr key={e.externalId}>
                      <td className={td}><p className="font-mono text-[12px] text-slate-700">{e.externalId}</p><p className="text-[11px] text-slate-400">{fmtDateTime(e.receivedAt)}</p></td>
                      <td className={td}><CompanyTag id={conn.companyId} /></td>
                      <td className={td}>{e.outcome === 'created' ? <Badge tone="green">Record created</Badge> : <Badge tone="red">Flagged</Badge>}</td>
                      <td className={cn(td, 'text-right tabular-nums')}>{e.deliveries > 1 ? <Badge tone="amber">{e.deliveries} · duplicates ignored</Badge> : e.deliveries}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-5"><MessagingStatusCard /></div>

      <Card className="mt-5">
        <CardHeader icon={Info} title="Connection states" description="Every state a connection can show in this prototype" />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(CONNECTION_STATE_LABEL) as ConnectionState[]).map((s) => (
            <div key={s} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200/70">
              <ConnectionStateBadge state={s} />
              <p className="mt-1.5 text-[12px] text-slate-600">{STATE_HELP[s]}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
