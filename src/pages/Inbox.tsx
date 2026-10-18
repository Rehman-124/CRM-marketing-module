import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Inbox as InboxIcon, Search, MessageCircle, MessagesSquare, ArrowRight, PlugZap, ShieldCheck } from 'lucide-react'
import { Badge, Callout, Card, EmptyState, Input, PageHeader, Segmented, Select, cn } from '@/components/ui'
import { CompanyTag, ReadOnlyBadge } from '@/components/domain'
import { useAppData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { SOURCE_LABEL, ENQUIRY_CHANNELS, CONNECTION_LABEL } from '@/domain/constants'
import { fmtRelative, fmtDateTime } from '@/lib/time'
import { companyName } from '@/domain/engine'
import type { EnquiryChannel } from '@/domain/types'

type View = 'open' | 'unread' | 'converted' | 'all'

export default function InboxPage() {
  const S = useAppData()
  const { companies, me, viewOnly } = useScope()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('open')
  const [channel, setChannel] = useState<EnquiryChannel | 'all'>('all')
  const [q, setQ] = useState('')

  const scoped = useMemo(() => S.enquiries.filter((e) => companies.includes(e.companyId)), [S.enquiries, companies])
  const counts = {
    open: scoped.filter((e) => e.status === 'open').length,
    unread: scoped.filter((e) => e.status === 'open' && !e.read).length,
    converted: scoped.filter((e) => e.status === 'converted').length,
    all: scoped.length,
  }
  const rows = scoped
    .filter((e) => view === 'all' || (view === 'open' ? e.status === 'open' : view === 'unread' ? e.status === 'open' && !e.read : e.status === 'converted'))
    .filter((e) => channel === 'all' || e.channel === channel)
    .filter((e) => !q || `${e.handle} ${e.fields.fullName} ${e.messages.map((m) => m.text).join(' ')} ${e.ref}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 200)

  const errors = S.connections.filter((c) => c.kind === 'meta_inbox' && companies.includes(c.companyId) && c.state === 'error')

  return (
    <div>
      <PageHeader
        title="Marketing Inbox"
        description="Facebook and Instagram DMs and comments arrive here as Unqualified Enquiries. They stay unassigned and never enter distribution until Marketing converts them to a Lead."
        eyebrow={<><Badge tone="brand" icon={ShieldCheck}>MKT-BR-002</Badge><span>P1-FR-001 · Lead Capture & Social Qualification</span></>}
      />

      {errors.map((c) => (
        <Callout key={c.id} tone="danger" icon={PlugZap} className="mb-4" title={`Source connection error · ${companyName(S, c.companyId)}`}
          action={me.role === 'admin' ? <Link to="/integrations" className="text-[12.5px] font-semibold text-rose-700 hover:underline">View integration</Link> : undefined}>
          {CONNECTION_LABEL[c.kind]}: {c.lastError}. New messages are flagged for the Manager and are not lost silently.
        </Callout>
      ))}
      {me.role === 'admin' && <Callout tone="neutral" className="mb-4">You are viewing the inbox as Admin / CRM Manager. Qualifying and converting enquiries is done by Marketing employees for their assigned companies.</Callout>}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <Segmented value={view} onChange={setView} options={[
            { value: 'open', label: 'Open', count: counts.open },
            { value: 'unread', label: 'Unread', count: counts.unread },
            { value: 'converted', label: 'Converted', count: counts.converted },
            { value: 'all', label: 'All', count: counts.all },
          ]} />
          <div className="flex-1" />
          <Select value={channel} onChange={(e) => setChannel(e.target.value as EnquiryChannel | 'all')} className="w-44" aria-label="Channel">
            <option value="all">All channels</option>
            {ENQUIRY_CHANNELS.map((c) => <option key={c} value={c}>{SOURCE_LABEL[c]}</option>)}
          </Select>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, handle, message…" className="pl-9" />
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={InboxIcon} title={view === 'unread' ? 'No unread enquiries' : view === 'open' ? 'Inbox zero' : 'No enquiries'} description={view === 'open' || view === 'unread' ? 'New Facebook and Instagram DMs and comments will appear here.' : 'Nothing matches the current filters.'} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((e) => {
              const last = e.messages[e.messages.length - 1]
              const Icon = e.channel.endsWith('dm') ? MessageCircle : MessagesSquare
              const unread = e.status === 'open' && !e.read
              return (
                <li key={e.id}>
                  <button onClick={() => navigate(`/inbox/${e.id}`)} className="group flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition hover:bg-slate-50/80 sm:px-5">
                    <span className={cn('relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1', e.channel.startsWith('instagram') ? 'bg-pink-50 text-pink-600 ring-pink-100' : 'bg-blue-50 text-blue-600 ring-blue-100')}>
                      <Icon className="size-4" strokeWidth={2} />
                      {unread && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-brand-500 ring-2 ring-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={cn('text-[13.5px]', unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-800')}>{e.fields.fullName || e.handle}</span>
                        {e.fields.fullName && <span className="text-[12px] text-slate-400">{e.handle}</span>}
                        <span className="text-[12px] text-slate-400">· {SOURCE_LABEL[e.channel]}</span>
                      </span>
                      <span className={cn('mt-0.5 block truncate text-[13px]', unread ? 'text-slate-700' : 'text-slate-500')}>{last.from === 'marketing' ? 'You: ' : ''}{last.text}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2">
                        <CompanyTag id={e.companyId} />
                        {e.postContext && <span className="truncate text-[11.5px] text-slate-400">{e.postContext}</span>}
                        {viewOnly(e.companyId) && <ReadOnlyBadge />}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[11.5px] text-slate-400" title={fmtDateTime(e.createdAt)}>{fmtRelative(e.createdAt, S.clock.now)}</span>
                      {e.status === 'converted' ? <Badge tone="green" dot>Converted</Badge> : unread ? <Badge tone="brand" dot>New</Badge> : <Badge tone="neutral" dot>Unqualified</Badge>}
                      <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
