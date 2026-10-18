import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, UserCog, UserPlus, UserMinus, Contact, Megaphone, FileX, History, StickyNote, Activity, ExternalLink } from 'lucide-react'
import { Avatar, Badge, Button, Card, CardHeader, KV, PageHeader, Tabs } from '@/components/ui'
import { CompanyTag, ReadOnlyBadge, SourceBadge, StatusPill } from '@/components/domain'
import { AssignDialog, NotesPanel, OwnershipHistory, SlaPanel, StatusControl, StatusHistory, TraceCard, UnassignDialog } from '@/components/leads/LeadWidgets'
import { useAppData, useMe } from '@/store/store'
import { canAssign, canEditOutcome, canViewLead, isViewOnlyCompany, ROLE_LABEL } from '@/domain/permissions'
import { userName, companyName } from '@/domain/engine'
import { FIELD_LABEL, STANDARD_FIELDS, SOURCE_LABEL } from '@/domain/constants'
import { fmtDateTime } from '@/lib/time'
import { NotFound, PermissionDenied } from './Errors'

export default function LeadDetailPage() {
  const { id } = useParams()
  const S = useAppData()
  const me = useMe()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'status' | 'ownership' | 'notes' | 'audit'>('status')
  const [assignOpen, setAssignOpen] = useState(false)
  const [unassignOpen, setUnassignOpen] = useState(false)
  const lead = S.leads.find((l) => l.id === id)
  if (!lead) return <NotFound />
  if (!canViewLead(S, me, lead)) return <PermissionDenied message={me.role === 'agent' ? 'Sales Agents see only their own Leads (P3-FR-001).' : undefined} />

  const editable = canEditOutcome(me, lead)
  const manage = canAssign(S, me, lead.companyId)
  const campaign = S.campaigns.find((c) => c.id === lead.campaignId)
  const ad = S.ads.find((a) => a.id === lead.adId)
  const owner = S.users.find((u) => u.id === lead.ownerId)
  const enquiry = lead.enquiryId ? S.enquiries.find((e) => e.id === lead.enquiryId) : null
  const audit = S.audit.filter((a) => a.leadId === lead.id).slice().reverse()

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Back</button>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{lead.fields.fullName}<StatusPill status={lead.status} /></span>}
        eyebrow={<><span className="font-mono">{lead.ref}</span><span>·</span><CompanyTag id={lead.companyId} /><span>·</span><SourceBadge source={lead.source} full /><span>·</span><span>Created {fmtDateTime(lead.createdAt)}</span>{isViewOnlyCompany(me, lead.companyId) && <ReadOnlyBadge />}</>}
        actions={manage && (
          <>
            {lead.ownerId && <Button variant="danger" icon={UserMinus} onClick={() => setUnassignOpen(true)}>Unassign</Button>}
            <Button variant="primary" icon={lead.ownerId ? UserCog : UserPlus} onClick={() => setAssignOpen(true)}>{lead.ownerId ? 'Reassign' : 'Assign'}</Button>
          </>
        )}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Funnel status" description={editable ? 'Update the status as the enquiry progresses. Lost requires a reason.' : 'P2-FR-001 · Lead → Mature → Hot → Booked, or Lost'} />
            <div className="p-5"><StatusControl lead={lead} editable={editable} /></div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader icon={Contact} title="Customer details" />
              <dl className="divide-y divide-slate-100 px-5 py-1">
                {STANDARD_FIELDS.map((k) => <KV key={k} label={FIELD_LABEL[k]}>{lead.fields[k] || <span className="font-normal text-slate-400">Not provided</span>}</KV>)}
                <KV label={FIELD_LABEL.tripDetails}>{lead.fields.tripDetails || <span className="font-normal text-slate-400">—</span>}</KV>
              </dl>
            </Card>
            <Card>
              <CardHeader icon={Megaphone} title="Attribution" />
              <dl className="divide-y divide-slate-100 px-5 py-1">
                <KV label="Company">{companyName(S, lead.companyId)}</KV>
                <KV label="Source">{SOURCE_LABEL[lead.source]}</KV>
                <KV label="Campaign">{campaign ? campaign.name : <Badge tone="neutral" icon={FileX}>No campaign data</Badge>}</KV>
                <KV label="Ad">{ad ? ad.name : <span className="font-normal text-slate-400">—</span>}</KV>
                {lead.conversationRef && <KV label="Conversation">
                  <span className="font-mono text-[12px]">{lead.conversationRef}</span>
                  {enquiry && <Link to={`/inbox/${enquiry.id}`} className="ml-2 inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline">{enquiry.ref}<ExternalLink className="size-3" /></Link>}
                </KV>}
                {lead.externalEventId && <KV label="External event"><span className="font-mono text-[12px]">{lead.externalEventId}</span></KV>}
                <KV label="Created by">{userName(S, lead.createdByUserId)}</KV>
              </dl>
            </Card>
          </div>

          <Card>
            <div className="px-5 pt-2">
              <Tabs value={tab} onChange={setTab} tabs={[
                { value: 'status', label: 'Status history', icon: History, count: lead.statusHistory.length },
                { value: 'ownership', label: 'Ownership history', icon: UserCog, count: lead.ownershipHistory.length },
                { value: 'notes', label: 'Notes', icon: StickyNote, count: lead.notes.length },
                { value: 'audit', label: 'Audit trail', icon: Activity, count: audit.length },
              ]} />
            </div>
            <div className="p-5">
              {tab === 'status' && <StatusHistory lead={lead} />}
              {tab === 'ownership' && <OwnershipHistory lead={lead} />}
              {tab === 'notes' && <NotesPanel lead={lead} editable={editable} />}
              {tab === 'audit' && (
                <ul className="space-y-2.5">
                  {audit.map((a) => (
                    <li key={a.id} className="flex gap-3 text-[13px]"><span className="w-28 shrink-0 text-[12px] text-slate-400 tabular-nums">{fmtDateTime(a.at)}</span><span className="text-slate-700">{a.summary}<span className="text-slate-400"> · {userName(S, a.actorId)}</span></span></li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Owner" />
            <div className="p-5">
              {owner ? (
                <div className="flex items-center gap-3">
                  <Avatar name={owner.name} size="lg" />
                  <div>
                    <p className="text-[14px] font-semibold text-slate-900">{owner.name}</p>
                    <p className="text-[12.5px] text-slate-500">{ROLE_LABEL[owner.role]} · since {fmtDateTime(lead.assignedAt!)}{lead.assignedInOffTime ? ' (off-time)' : ''}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200"><UserPlus className="size-4" /></span>
                  <div>
                    <p className="text-[14px] font-semibold text-slate-900">Unassigned</p>
                    <p className="text-[12.5px] text-slate-500">{manage ? 'Assign this Lead manually.' : 'Waiting for a manager to act.'}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
          <SlaPanel lead={lead} canContact={editable} />
          <TraceCard lead={lead} />
        </div>
      </div>

      <AssignDialog lead={lead} open={assignOpen} onClose={() => setAssignOpen(false)} />
      {lead.ownerId && <UnassignDialog lead={lead} open={unassignOpen} onClose={() => setUnassignOpen(false)} />}
    </div>
  )
}
