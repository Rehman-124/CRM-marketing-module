import { MessageSquare, RefreshCw, CheckCircle2, CircleDashed, WifiOff, Ban } from 'lucide-react'
import { Badge, Button, Callout, Card, CardHeader, th, td, cn } from '../ui'
import { CompanyTag } from '../domain'
import { useAppData } from '@/store/store'
import { checkMessagingServer, useMessagingRuntime } from '@/messaging/service'
import { fmtRelative } from '@/lib/time'
import type { CompanyId } from '@/domain/types'

/** Two-way messaging readiness per company and channel, as reported by the messaging server. */
export function MessagingStatusCard() {
  const S = useAppData()
  const rt = useMessagingRuntime()
  const channels = rt.status?.channels ?? []
  const row = (c: CompanyId, ch: 'messenger' | 'instagram') => channels.find((x) => x.companyId === c && x.channel === ch)
  const cell = (c: CompanyId, ch: 'messenger' | 'instagram') => {
    if (rt.backend !== 'online') return <Badge tone="neutral" icon={WifiOff}>Server offline</Badge>
    const s = row(c, ch)
    if (s?.live) return <Badge tone="green" icon={CheckCircle2}>Live</Badge>
    return <span title={s?.missing.join(' · ')}><Badge tone="amber" icon={CircleDashed}>Needs configuration</Badge></span>
  }
  return (
    <Card className="mb-5">
      <CardHeader icon={MessageSquare} title="Two-way messaging (Marketing Inbox replies)"
        description="Replies leave the CRM only through the messaging server, which holds the Meta tokens. A channel is live only when its credentials are configured there."
        actions={<Button size="sm" icon={RefreshCw} onClick={() => void checkMessagingServer()}>{rt.backend === 'checking' ? 'Checking…' : 'Check again'}</Button>} />
      <div className="px-5 pt-4">
        {rt.backend === 'online' ? (
          <Callout tone={channels.some((c) => c.live) ? 'success' : 'warning'}>
            Messaging server reachable{rt.checkedAt ? ` (checked ${fmtRelative(rt.checkedAt, Date.now())})` : ''} · Graph API {rt.status?.graphVersion} · webhook {rt.status?.webhookConfigured ? 'configured' : 'not configured'} · event stream {rt.events}.
            {!channels.some((c) => c.live) && ' No company channel has credentials yet, so every conversation stays simulated.'}
          </Callout>
        ) : rt.backend === 'offline' ? (
          <Callout tone="warning" icon={WifiOff} title="Messaging server not reachable">Start it with <code className="rounded bg-amber-100 px-1">npm run server</code>. Until then the inbox works in simulated mode only, and real conversations cannot be replied to. See docs/messaging.md.</Callout>
        ) : (
          <Callout tone="neutral">Checking the messaging server…</Callout>
        )}
      </div>
      <div className="overflow-x-auto p-5">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-slate-100"><tr><th className={th}>Company</th><th className={th}>Messenger</th><th className={th}>Instagram Direct</th><th className={th}>Comments (private & public replies)</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {S.companies.map((c) => (
              <tr key={c.id}>
                <td className={td}><CompanyTag id={c.id} /></td>
                <td className={td}>{cell(c.id, 'messenger')}</td>
                <td className={td}>{cell(c.id, 'instagram')}</td>
                <td className={cn(td, 'text-[12.5px] text-slate-500')}>Follows the Messenger / Instagram row; needs comment permissions in App Review</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rt.backend === 'online' && channels.some((c) => !c.live) && (
          <p className="mt-3 text-[12px] text-slate-500">Missing items (hover a badge for details): {[...new Set(channels.flatMap((c) => c.missing))].join(' · ')}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
          <Ban className="size-3.5" /><b className="text-slate-600">Not supported:</b> WhatsApp and other Meta channels are not sources in the Marketing FRD; attachments are shown as a placeholder and must be opened in Meta.
        </div>
      </div>
    </Card>
  )
}
