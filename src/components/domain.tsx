import { FileText, Globe, MessageCircle, MessagesSquare, Phone, Mail, Timer, PauseCircle, Moon, CheckCircle2, AlertTriangle, UserX, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge, cn, type Tone } from './ui'
import { COMPANY_COLORS, CONNECTION_STATE_LABEL, SOURCE_SHORT, SOURCE_LABEL, STATUS_LABEL } from '@/domain/constants'
import type { AppData, CompanyId, ConnectionState, FunnelStatus, Lead, LeadSource, User } from '@/domain/types'
import { agentState, isAbsent, userById, type AgentState } from '@/domain/engine'
import { SLA_MS, fmtDuration, isShiftTime } from '@/lib/time'
import { useAppData, useData } from '@/store/store'

export const STATUS_TONE: Record<FunnelStatus, Tone> = { lead: 'sky', mature: 'violet', hot: 'orange', booked: 'green', lost: 'neutral' }

export function StatusPill({ status, short }: { status: FunnelStatus; short?: boolean }) {
  return <Badge tone={STATUS_TONE[status]} dot>{short ? STATUS_LABEL[status].replace(' Lead', '') : STATUS_LABEL[status]}</Badge>
}

const AGENT_STATE: Record<AgentState, { label: string; tone: Tone }> = {
  available: { label: 'Available', tone: 'green' },
  unavailable: { label: 'Unavailable', tone: 'amber' },
  absent: { label: 'Absent', tone: 'red' },
  'at-capacity': { label: 'At capacity', tone: 'violet' },
}

export function AgentStateBadge({ state }: { state: AgentState }) {
  const s = AGENT_STATE[state]
  return <Badge tone={s.tone} dot>{s.label}</Badge>
}

export function useAgentState(agent: User): AgentState {
  return useData((d) => agentState(d, agent, d.clock.now))
}

export const SOURCE_ICON: Record<LeadSource, LucideIcon> = {
  meta_form: FileText, website: Globe, facebook_dm: MessageCircle, instagram_dm: MessageCircle,
  facebook_comment: MessagesSquare, instagram_comment: MessagesSquare, phone: Phone, email: Mail,
}

export function SourceBadge({ source, full }: { source: LeadSource; full?: boolean }) {
  const Icon = SOURCE_ICON[source]
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap text-slate-600">
      <Icon className="size-3.5 text-slate-400" strokeWidth={2} />
      {full ? SOURCE_LABEL[source] : SOURCE_SHORT[source]}
    </span>
  )
}

export function CompanyTag({ id, className }: { id: CompanyId; className?: string }) {
  const name = useData((d) => d.companies.find((c) => c.id === id)?.name ?? id)
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap text-slate-700', className)}>
      <span className="size-2 rounded-[3px]" style={{ background: COMPANY_COLORS[id] }} />
      {name}
    </span>
  )
}

export const CONNECTION_TONE: Record<ConnectionState, Tone> = { confirmed: 'green', pending: 'amber', error: 'red', recovering: 'sky', recovered: 'teal', 'no-events': 'neutral' }

export function ConnectionStateBadge({ state }: { state: ConnectionState }) {
  return <Badge tone={CONNECTION_TONE[state]} dot>{CONNECTION_STATE_LABEL[state]}</Badge>
}

// ------------------------------------------------------------------ SLA

export type SlaState = 'contacted' | 'closed' | 'unassigned' | 'offtime' | 'paused-unavailable' | 'paused-absent' | 'running' | 'overdue'

export function slaInfo(S: AppData, lead: Lead, now: number): { state: SlaState; counted: number; overdueBy: number } {
  const counted = lead.slaCountedMs
  const overdueBy = Math.max(0, counted - SLA_MS)
  if (lead.firstContactAt) return { state: 'contacted', counted, overdueBy }
  if (lead.status === 'booked' || lead.status === 'lost') return { state: 'closed', counted, overdueBy }
  if (!lead.ownerId) return { state: 'unassigned', counted, overdueBy }
  if (lead.slaAlertAt) return { state: 'overdue', counted, overdueBy }
  if (!isShiftTime(now)) return { state: 'offtime', counted, overdueBy }
  const owner = userById(S, lead.ownerId)
  if (owner && isAbsent(owner, now)) return { state: 'paused-absent', counted, overdueBy }
  if (owner?.availability === 'unavailable') return { state: 'paused-unavailable', counted, overdueBy }
  return { state: 'running', counted, overdueBy }
}

/** Compact SLA indicator for tables and cards. Off-time hides the timer (P1-FR-004 states). */
export function SlaChip({ lead }: { lead: Lead }) {
  const d = useAppData()
  const info = slaInfo(d, lead, d.clock.now)
  const remaining = SLA_MS - info.counted
  switch (info.state) {
    case 'contacted':
      return <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700"><CheckCircle2 className="size-3.5" />Contacted</span>
    case 'closed':
      return <span className="text-[12px] text-slate-400">—</span>
    case 'unassigned':
      return <span className="inline-flex items-center gap-1 text-[12px] text-slate-500"><UserX className="size-3.5" />No SLA</span>
    case 'offtime':
      return <span className="inline-flex items-center gap-1 text-[12px] text-slate-500" title="Off-time (22:00–14:00 PKT): no SLA runs"><Moon className="size-3.5" />Off-time</span>
    case 'paused-unavailable':
    case 'paused-absent':
      return <span className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-700 tabular-nums" title={info.state === 'paused-absent' ? 'Owner marked Absent' : 'Owner is Unavailable — timer paused'}><PauseCircle className="size-3.5" />{fmtDuration(remaining)} left</span>
    case 'overdue':
      return <span className="pulse-ring inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[12px] font-semibold text-rose-700 tabular-nums ring-1 ring-rose-200"><AlertTriangle className="size-3.5" />+{fmtDuration(info.overdueBy)}</span>
    case 'running':
      return <span className={cn('inline-flex items-center gap-1 text-[12px] font-medium tabular-nums', remaining < 15 * 60_000 ? 'text-orange-600' : 'text-brand-700')}><Timer className="size-3.5" />{fmtDuration(remaining)} left</span>
  }
}

export function ReadOnlyBadge() {
  return <Badge tone="neutral" icon={Lock}>View only</Badge>
}
