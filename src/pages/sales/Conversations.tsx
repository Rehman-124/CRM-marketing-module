import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageCircle, Search, ExternalLink } from 'lucide-react'
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, PendingTag, Select, SimTag, cn } from '@/components/ui'
import { CompanyTag } from '@/components/domain'
import { ConversationPanel } from './OpportunityDetail'
import { useCalmData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { canViewOpportunity } from '@/domain/permissions'
import { userName } from '@/domain/engine'
import { fmtRelative } from '@/lib/time'
import { findLead, findOpp } from '@/domain/lookup'

/** SAL-FR-001: My Inbox / My Conversations for agents; Company Inbox for Manager/Admin oversight (view-only unless the pending decision allows replies). */
export default function ConversationsPage() {
  const S = useCalmData()
  const { me, companies } = useScope()
  const { id } = useParams()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [agent, setAgent] = useState('all')
  const isAgent = me.role === 'agent'
  const threads = useMemo(() => S.waThreads
    .map((w) => ({ w, o: findOpp(S, w.oppId)! }))
    .filter(({ o }) => companies.includes(o.companyId) && canViewOpportunity(S, me, o))
    .map((x) => ({ ...x, l: findLead(S, x.o.leadId)! }))
    .filter(({ l }) => agent === 'all' || l.ownerId === agent)
    .filter(({ l }) => !q.trim() || l.fields.fullName.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.w.lastActivityAt - a.w.lastActivityAt), [S, me, companies, agent, q])
  const selected = threads.find((t) => t.o.id === id) ?? null
  const agents = S.users.filter((u) => u.role === 'agent' && companies.includes(u.companyIds[0]))

  return (
    <div>
      <PageHeader title={isAgent ? 'My conversations' : 'Company Inbox'} eyebrow={<span>SAL-FR-001 · AC-SAL-001-7</span>}
        description={isAgent ? 'Customer WhatsApp conversations for the opportunities you own. You cannot see other agents’ conversations.' : 'All agent conversations in the companies you oversee. Visibility follows CRM ownership.'}
        actions={<><SimTag title="Company WhatsApp integration is not validated; messages are stored in the CRM only.">WhatsApp simulated</SimTag>{!isAgent && <PendingTag title="Whether Manager/Admin access is view-only or also permits replies is to be confirmed.">{S.params.managerInboxReplies ? 'Replies on (demo)' : 'View-only (TBC)'}</PendingTag>}</>} />
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer" className="pl-9" aria-label="Search conversations" />
            </div>
            {!isAgent && <Select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent"><option value="all">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
          </div>
          {threads.length === 0 ? <EmptyState compact icon={MessageCircle} title="No conversations" /> : (
            <ul className="scroll-thin max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
              {threads.slice(0, 120).map(({ w, o, l }) => {
                const last = w.messages.at(-1)
                return (
                  <li key={w.id}>
                    <button onClick={() => navigate(`/sales/inbox/${o.id}`)} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50', selected?.o.id === o.id && 'bg-brand-50/60')}>
                      <Avatar name={l.fields.fullName} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="truncate text-[13px] font-semibold text-slate-800">{l.fields.fullName}</span><span className="ml-auto shrink-0 text-[11px] text-slate-400">{fmtRelative(w.lastActivityAt, S.clock.now)}</span></span>
                        <span className="mt-0.5 block truncate text-[12px] text-slate-500">{last ? `${last.from === 'agent' ? 'You: ' : ''}${last.text}` : 'No messages'}</span>
                        <span className="mt-1 flex items-center gap-2 text-[11px] text-slate-400"><CompanyTag id={o.companyId} className="text-[11px] font-normal" />{!isAgent && <span>· {userName(S, l.ownerId)}</span>}{last?.from === 'customer' && <Badge tone="brand">Customer</Badge>}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <div className="min-w-0">
          {selected ? (
            <div className="space-y-3">
              <ConversationPanel opp={selected.o} />
              <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => navigate(`/sales/opportunities/${selected.o.id}`)}>Open the opportunity</Button>
            </div>
          ) : <Card><EmptyState icon={MessageCircle} title="Choose a conversation" description="WhatsApp is a communication channel after assignment, not a new-Lead source." /></Card>}
        </div>
      </div>
    </div>
  )
}
