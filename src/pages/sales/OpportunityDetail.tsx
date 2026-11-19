import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Activity, ListTodo, CheckCircle2, ClipboardList, FileText, Receipt, Briefcase, MessageCircle, FolderLock, Plus, Moon, Sun, Share2, XCircle, UserCog,
  Eye, EyeOff, Lock, Save, UserPlus, Trash2, FileSignature, RotateCw, ShieldAlert, CircleDollarSign, Send, Link2, Upload, FileCheck2, History, Megaphone,
} from 'lucide-react'
import { Avatar, Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, KV, PageHeader, PendingTag, Select, SimTag, Switch, Tabs, Textarea, th, td, cn } from '@/components/ui'
import { Dialog } from '@/components/ui/overlay'
import { CompanyTag, SourceBadge, StatusPill } from '@/components/domain'
import { AssignDialog } from '@/components/leads/LeadWidgets'
import {
  ContactPrompt, DormantBadge, ExpenseDialog, MarginPill, OppLostDialog, OverrideDialog, PaymentDialog, PaymentStatusBadge, QuickActions, ReferralDialog, RefundDialog,
  SignatureBadge, StageBadge, TaskDialog, TaskDue, UnsignedFlag,
} from '@/components/sales/SalesWidgets'
import { CasePanel } from '@/components/sales/CasePanel'
import { useAppData, useMe, useStore } from '@/store/store'
import { useAction } from '@/store/hooks'
import {
  canAssign, canOverrideMargin, canRecordExpenses, canRequestRefund, canSeeSensitive, canViewOpportunity, canWorkOpportunity, oppOwnerId, visibleCompanies,
} from '@/domain/permissions'
import { userName, companyName } from '@/domain/engine'
import {
  bookingOf, caseOf, completeTask, draftOutOfDate, expectedCostLines, expectedMargin, generateDraft, includedItems, isBookableMargin, isNotBookable, latestDraft,
  missingDraftFields, oppPayments, paymentTotals, recordDraftApproval, requestDocumentLink, requestDraftCorrections, retryInvoice, revealSensitive, saveQualification, saveQuote,
  sendWhatsApp, setDormant, setStage, threadOf, uploadDocument, type QuoteInput, deleteDocumentNow,
} from '@/domain/sales'
import {
  BOOKING_MARGIN_THRESHOLD, OUTCOME_LABEL, QUAL_FIELD_LABEL, QUAL_GROUPS, SALES_STAGE_LABEL, SALES_STAGES, SERVICE_ITEM_LABEL, SOURCE_LABEL, STANDARD_DELIVERABLES, SYSTEM_STAGES, TASK_KIND_LABEL,
} from '@/domain/constants'
import type { Applicant, Opportunity, SalesStage } from '@/domain/types'
import { fmtDateTime, fmtMoney, fmtRelative, fmtUK, fmtDuration } from '@/lib/time'
import { NotFound, PermissionDenied } from '../Errors'
import { findLead, findOpp } from '@/domain/lookup'

type Tab = 'overview' | 'qualification' | 'quote' | 'payments' | 'case' | 'conversation' | 'documents'

export default function OpportunityDetailPage() {
  const { id } = useParams()
  const S = useAppData()
  const me = useMe()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const opp = findOpp(S, id)
  if (!opp) return <NotFound />
  if (!canViewOpportunity(S, me, opp)) return <PermissionDenied message={me.role === 'agent' ? 'Sales Agents see only their own opportunities and conversations (AC-P3-001-6, AC-SAL-001-7).' : 'This role has no access to Sales opportunities.'} />
  return <OppView opp={opp} tab={tab} setTab={setTab} navigate={navigate} />
}

function OppView({ opp, tab, setTab, navigate }: { opp: Opportunity; tab: Tab; setTab: (t: Tab) => void; navigate: ReturnType<typeof useNavigate> }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const lead = findLead(S, opp.leadId)!
  const owner = oppOwnerId(S, opp)
  const mine = canWorkOpportunity(S, me, opp)
  const booking = bookingOf(S, opp)
  const kase = caseOf(S, opp)
  const tasks = S.tasks.filter((t) => t.oppId === opp.id)
  const openTasks = tasks.filter((t) => !t.doneAt)
  const [dlg, setDlg] = useState<null | 'task' | 'lost' | 'referral' | 'assign'>(null)
  const campaign = S.campaigns.find((c) => c.id === lead.campaignId)
  const ad = S.ads.find((a) => a.id === lead.adId)
  const closed = opp.stage === 'booked' || opp.stage === 'lost'
  const awaiting = oppPayments(S, opp.id).some((p) => p.status === 'awaiting')

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Back</button>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{lead.fields.fullName}<StageBadge stage={opp.stage} />{opp.dormant && <DormantBadge />}{booking && <UnsignedFlag booking={booking} />}</span>}
        eyebrow={<><span className="font-mono">{lead.ref}</span><span>·</span><CompanyTag id={opp.companyId} /><span>·</span><SourceBadge source={lead.source} full /><span>·</span><span className="inline-flex items-center gap-1.5"><Avatar name={userName(S, owner)} size="xs" />{userName(S, owner)}</span></>}
        actions={<>
          {mine && !closed && <QuickActions opp={opp} />}
          {mine && <Button icon={Plus} onClick={() => setDlg('task')}>Task</Button>}
          {canAssign(S, me, opp.companyId) && <Button icon={UserCog} onClick={() => setDlg('assign')}>Reassign</Button>}
          {me.role !== 'agent' && <Button variant="ghost" icon={Megaphone} onClick={() => navigate(`/leads/${lead.id}`)}>Lead view</Button>}
        </>}
      />
      {!mine && <Callout tone="neutral" icon={Eye} className="mb-4">You are viewing {userName(S, owner)}’s opportunity. Only the owning Sales Agent works it; changing ownership needs the Reassignment permission.</Callout>}
      <div className="mb-4"><ContactPrompt opp={opp} /></div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-slate-500">Sales stage</span>
            <Select aria-label="Sales stage" value={opp.stage} disabled={!mine || opp.stage === 'booked' || awaiting} onChange={(e) => {
              const to = e.target.value as SalesStage
              if (to === 'lost') setDlg('lost')
              else act((d) => setStage(d, opp.id, to, me.id), `Stage: ${SALES_STAGE_LABEL[to]}`)
            }} className="h-8 w-52 text-[12.5px]">
              {SALES_STAGES.map((s) => <option key={s} value={s} disabled={SYSTEM_STAGES.includes(s) && s !== opp.stage}>{SALES_STAGE_LABEL[s]}{SYSTEM_STAGES.includes(s) ? ' (set by the CRM)' : ''}</option>)}
            </Select>
            <PendingTag title="The final detailed Sales stage list is to be confirmed (SAL-FR-001).">Stage list TBC</PendingTag>
          </div>
          <div className="flex items-center gap-2 text-[12.5px] text-slate-600"><span className="font-medium text-slate-500">Shared funnel</span><StatusPill status={lead.status} /></div>
          {opp.stage === 'lost' && <span className="text-[12.5px] text-slate-600">Reason: <b>{opp.lossReason}</b></span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {mine && !closed && <Button size="sm" variant={opp.dormant ? 'subtle' : 'ghost'} icon={opp.dormant ? Sun : Moon} onClick={() => act((d) => setDormant(d, opp.id, !opp.dormant, me.id), opp.dormant ? 'Reactivated' : 'Marked Low Intent / Dormant', opp.dormant ? undefined : 'Still searchable; reactivate any time. The CRM never closes it.')}>{opp.dormant ? 'Reactivate' : 'Low Intent / Dormant'}</Button>}
            {mine && !closed && <Button size="sm" variant="danger" icon={XCircle} onClick={() => setDlg('lost')}>Mark Lost</Button>}
            {mine && <Button size="sm" icon={Share2} onClick={() => setDlg('referral')}>Add referral</Button>}
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 py-2 text-[11.5px] text-slate-500">Awaiting Payment and Booked are set by the CRM (payment request / Accounts-confirmed booking). Tasks never change the stage. Booked and Lost feed the shared funnel; Mature and Hot stay agent-set <PendingTag title="SAL-FR-007: how detailed Sales stages map to Mature and Hot is to be confirmed.">mapping TBC</PendingTag></div>
      </Card>

      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'overview', label: 'Overview', icon: Activity, count: openTasks.length || undefined },
          { value: 'qualification', label: 'Qualification & draft', icon: ClipboardList },
          { value: 'quote', label: 'Quote', icon: CircleDollarSign },
          { value: 'payments', label: 'Payments & booking', icon: Receipt },
          { value: 'case', label: 'Service case', icon: Briefcase },
          { value: 'conversation', label: 'Conversation', icon: MessageCircle },
          { value: 'documents', label: 'Documents', icon: FolderLock },
        ]} />
      </div>

      {tab === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader icon={ListTodo} title="Tasks" description="Next actions with due dates (UK-local). Overdue tasks are flagged." actions={mine && <Button size="sm" icon={Plus} onClick={() => setDlg('task')}>Add task</Button>} />
              {tasks.length === 0 ? <EmptyState compact icon={ListTodo} title="No tasks" /> : (
                <ul className="divide-y divide-slate-100">
                  {[...openTasks.sort((a, b) => a.due.at - b.due.at), ...tasks.filter((t) => t.doneAt).sort((a, b) => b.doneAt! - a.doneAt!)].map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                      <Badge tone={t.kind === 'balance_payment' ? 'red' : t.kind === 'review' || t.kind === 'referral' ? 'green' : 'neutral'}>{TASK_KIND_LABEL[t.kind]}</Badge>
                      <span className={cn('min-w-0 flex-1 text-[13px]', t.doneAt ? 'text-slate-400 line-through' : 'text-slate-800')}>{t.title}</span>
                      <TaskDue task={t} now={S.clock.now} />
                      {mine && !t.doneAt && t.kind !== 'balance_payment' && <Button size="xs" icon={CheckCircle2} onClick={() => act((d) => completeTask(d, t.id, me.id), 'Task done', 'The stage did not change.')}>Done</Button>}
                      {t.kind === 'balance_payment' && !t.doneAt && <span className="text-[11.5px] text-slate-500">Closes when Accounts confirms the full balance</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader icon={Activity} title="Activity timeline" description="Contact attempts, stage changes, tasks, draft, quote, payment, booking and case events." />
              <Timeline opp={opp} />
            </Card>
          </div>
          <div className="space-y-5">
            <Card>
              <CardHeader title="Client & attribution" />
              <dl className="divide-y divide-slate-100 px-5 py-1">
                <KV label="Phone">{lead.fields.phone || '—'}</KV>
                <KV label="Email">{lead.fields.email || '—'}</KV>
                <KV label="Nationality">{lead.fields.nationality || '—'}</KV>
                <KV label="Preferred contact">{lead.preferredContact ? (lead.preferredContact.mode === 'exact' ? fmtUK(lead.preferredContact.at) : `${lead.preferredContact.label} (window)`) : 'Not given'}</KV>
                <KV label="Company">{companyName(S, opp.companyId)}</KV>
                <KV label="Source">{SOURCE_LABEL[lead.source]}</KV>
                <KV label="Campaign / ad">{campaign ? `${campaign.name}${ad ? ` · ${ad.name}` : ''}` : <Badge tone="neutral">No campaign data</Badge>}</KV>
                <KV label="Assigned">{lead.assignedAt ? fmtDateTime(lead.assignedAt) : '—'}</KV>
                <KV label="First contact (SLA)">{lead.firstContactAt ? `${fmtDateTime(lead.firstContactAt)} · ${fmtDuration(lead.slaCountedMs)} counted` : 'Not recorded'}</KV>
                {lead.referralFromLeadId && <KV label="Referred by">{S.leads.find((l) => l.id === lead.referralFromLeadId)?.fields.fullName}</KV>}
              </dl>
            </Card>
            <Card>
              <CardHeader title="Status at a glance" description="AC-SAL-007-1" />
              <dl className="divide-y divide-slate-100 px-5 py-1">
                <KV label="Payment">{paymentSummary(S, opp)}</KV>
                <KV label="Invoice">{booking ? <SignatureBadge status={booking.invoice.status} /> : '—'}</KV>
                <KV label="Case milestone">{kase ? kase.status : '—'}</KV>
                <KV label="Contact attempts">{opp.attempts.length}</KV>
              </dl>
            </Card>
          </div>
        </div>
      )}
      {tab === 'qualification' && <QualificationTab opp={opp} mine={mine} />}
      {tab === 'quote' && <QuoteTab opp={opp} mine={mine} />}
      {tab === 'payments' && <PaymentsTab opp={opp} mine={mine} />}
      {tab === 'case' && (kase ? <CasePanel c={kase} /> : <Card><EmptyState icon={Briefcase} title="No service case yet" description="A Booked opportunity creates one linked Service/Visa Case holding the verified draft (SAL-FR-006)." /></Card>)}
      {tab === 'conversation' && <ConversationPanel opp={opp} />}
      {tab === 'documents' && <DocumentsTab opp={opp} />}

      {dlg === 'task' && <TaskDialog opp={opp} open onClose={() => setDlg(null)} />}
      {dlg === 'lost' && <OppLostDialog opp={opp} open onClose={() => setDlg(null)} />}
      {dlg === 'referral' && <ReferralDialog opp={opp} open onClose={() => setDlg(null)} onCreated={(leadId) => { const o = S.opportunities.find((x) => x.leadId === leadId); if (o) navigate(`/sales/opportunities/${o.id}`) }} />}
      {dlg === 'assign' && <AssignDialog lead={lead} open onClose={() => setDlg(null)} />}
      <p className="mt-6 text-center text-[11.5px] text-slate-400"><Link to={`/leads/${lead.id}`} className="hover:underline">{lead.ref}</Link> · opportunity created {fmtDateTime(opp.createdAt)} · possible duplicates are never merged automatically <PendingTag title="Whether an exact-phone possible-duplicate warning is included is to be confirmed.">duplicate warning TBC</PendingTag></p>
    </div>
  )
}

function paymentSummary(S: ReturnType<typeof useAppData>, opp: Opportunity) {
  if (!opp.quote) return <span className="text-slate-400">No quote yet</span>
  const t = paymentTotals(S, opp)
  const awaiting = oppPayments(S, opp.id).some((p) => p.status === 'awaiting')
  return <span>{fmtMoney(t.paid)} of {fmtMoney(t.total)}{t.outstanding > 0 && <span className="text-amber-700"> · {fmtMoney(t.outstanding)} outstanding</span>}{awaiting && <Badge tone="amber" className="ml-1.5">Awaiting Accounts</Badge>}</span>
}

// ------------------------------------------------------------------ timeline

function Timeline({ opp }: { opp: Opportunity }) {
  const S = useAppData()
  const entries = useMemo(() => {
    const audit = S.audit.filter((a) => (a.oppId === opp.id || a.leadId === opp.leadId) && a.type !== 'contact-attempt').map((a) => ({ at: a.at, kind: a.type as string, text: a.summary, by: a.actorId }))
    const attempts = opp.attempts.map((a) => ({ at: a.at, kind: 'attempt', text: `${a.channel === 'call' ? 'Call' : 'WhatsApp'} — ${OUTCOME_LABEL[a.outcome]}${a.note ? ` · “${a.note}”` : ''}`, by: a.byUserId, outcome: a.outcome }))
    return [...audit, ...attempts].sort((a, b) => b.at - a.at)
  }, [S.audit, opp])
  if (!entries.length) return <EmptyState compact icon={Activity} title="No activity yet" />
  return (
    <ol className="scroll-thin max-h-[560px] space-y-3 overflow-y-auto px-5 py-4">
      {entries.map((e, i) => (
        <li key={i} className="flex gap-3">
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', e.kind === 'attempt' ? ('outcome' in e && e.outcome === 'answered' ? 'bg-emerald-500' : 'bg-amber-500') : e.kind === 'booking' ? 'bg-emerald-600' : e.kind === 'stage' ? 'bg-brand-500' : 'bg-slate-300')} />
          <div className="min-w-0 text-[13px]">
            <p className="text-slate-700">{e.kind === 'attempt' && <Badge tone={'outcome' in e && e.outcome === 'answered' ? 'green' : 'amber'} className="mr-1.5">Contact attempt</Badge>}{e.text}</p>
            <p className="text-[11.5px] text-slate-400">{fmtDateTime(e.at)} · {userName(S, e.by)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ------------------------------------------------------------------ qualification & draft (SAL-FR-002)

function QualificationTab({ opp, mine }: { opp: Opportunity; mine: boolean }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [apps, setApps] = useState<Applicant[]>(() => opp.applicants.map((a) => ({ id: a.id, data: { ...a.data } })))
  const [revealed, setRevealed] = useState(false)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [corrOpen, setCorrOpen] = useState(false)
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<number | null>(null)
  const sensitiveOk = canSeeSensitive(S, me, opp)
  const dirty = JSON.stringify(apps.map((a) => a.data)) !== JSON.stringify(opp.applicants.map((a) => a.data))
  const latest = latestDraft(opp)
  const missing = missingDraftFields(S, opp)
  const outOfDate = draftOutOfDate(opp)
  const set = (i: number, k: string, v: string) => setApps(apps.map((a, j) => (j === i ? { ...a, data: { ...a.data, [k]: v } } : a)))

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="min-w-0">
        <CardHeader icon={ClipboardList} title="Qualification" description="Structured data in four groups for one or more applicants. Known Lead details are carried over — no retyping."
          actions={<>
            <PendingTag title="The fields inside each group come from the Data Model document, which was not provided. These are labelled placeholders.">Field list = placeholder</PendingTag>
            {sensitiveOk ? <Button size="sm" variant="ghost" icon={revealed ? EyeOff : Eye} onClick={() => { if (!revealed) { const r = act((d) => revealSensitive(d, opp.id, me.id)); if (r.ok) setRevealed(true) } else setRevealed(false) }}>{revealed ? 'Hide sensitive' : 'Reveal sensitive'}</Button> : <Badge tone="neutral" icon={Lock}>Sensitive data hidden</Badge>}
          </>} />
        <div className="space-y-6 p-5">
          {apps.map((a, i) => (
            <div key={a.id || i} className="rounded-xl ring-1 ring-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2">
                <p className="text-[13px] font-semibold text-slate-800">Applicant {i + 1}{a.data['applicant.fullName'] ? ` · ${a.data['applicant.fullName']}` : ''}</p>
                {mine && apps.length > 1 && <Button size="xs" variant="ghost" icon={Trash2} onClick={() => setApps(apps.filter((_, j) => j !== i))}>Remove</Button>}
              </div>
              <div className="space-y-4 p-4">
                {QUAL_GROUPS.map((g) => (
                  <fieldset key={g.key}>
                    <legend className="mb-2 text-[11.5px] font-semibold tracking-wide text-slate-500 uppercase">{g.label}</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {g.fields.map((f) => {
                        const required = S.params.draftRequiredFields.includes(f.key)
                        const hidden = f.sensitive && (!sensitiveOk || !revealed)
                        return (
                          <Field key={f.key} label={<span className="flex items-center gap-1.5">{f.label}{f.sensitive && <Lock className="size-3 text-slate-400" aria-label="Sensitive" />}</span>} required={required}>
                            {hidden
                              ? <Input value={a.data[f.key] ? '•••••••' : ''} disabled placeholder={sensitiveOk ? 'Reveal to edit' : 'Restricted'} aria-label={`${f.label} (hidden)`} />
                              : <Input type={f.type === 'date' ? 'date' : 'text'} value={a.data[f.key] ?? ''} disabled={!mine} onChange={(e) => set(i, f.key, e.target.value)} />}
                          </Field>
                        )
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>
          ))}
          {mine && (
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={UserPlus} onClick={() => setApps([...apps, { id: '', data: { 'travel.destination': apps[0]?.data['travel.destination'] ?? '' } }])}>Add applicant</Button>
              <div className="flex-1" />
              {dirty && <span className="text-[12px] text-amber-700">Unsaved changes</span>}
              <Button variant="primary" icon={Save} disabled={!dirty} onClick={() => { const r = act((d) => saveQualification(d, opp.id, apps, me.id), 'Qualification saved'); if (r.ok) { const fresh = useStore.getState().data.opportunities.find((o) => o.id === opp.id)!; setApps(fresh.applicants.map((a) => ({ id: a.id, data: { ...a.data } }))) } }}>Save qualification</Button>
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader icon={FileText} title="Client Information Draft" description="Generated from the stored data. It is an information draft, not the official visa application form." />
          <div className="space-y-3 p-5">
            {latest ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-slate-800">Version {latest.version}</span>
                <Badge tone={latest.status === 'verified' ? 'green' : latest.status === 'corrections_requested' ? 'red' : 'amber'} dot>{latest.status === 'verified' ? 'Verified' : latest.status === 'corrections_requested' ? 'Corrections requested' : latest.reverification ? 'Re-verification needed' : 'Unverified'}</Badge>
                <Button size="xs" variant="ghost" icon={Eye} onClick={() => setPreview(latest.version)}>Preview</Button>
              </div>
            ) : <p className="text-[13px] text-slate-500">No draft generated yet.</p>}
            {latest?.approval && <p className="text-[12.5px] text-slate-600">Approved by the customer via <b>{latest.approval.channel === 'whatsapp' ? 'WhatsApp' : 'email'}</b> · recorded by {userName(S, latest.approval.byUserId)} · {fmtDateTime(latest.approval.at)}</p>}
            {latest?.reverification && latest.status !== 'verified' && <Callout tone="warning" title="Re-verification needed">A material change was made after verification, so a new version was created. Earlier versions stay in history. <PendingTag title="Which changes count as material is to be confirmed. Placeholder: any change.">“Material” TBC</PendingTag></Callout>}
            {outOfDate && latest?.status !== 'verified' && <Callout tone="warning">The qualification changed after this version was generated. Generate a new version before recording approval.</Callout>}
            {missing.length > 0 && <Callout tone="neutral">Required before generating: {[...new Set(missing.map((m) => QUAL_FIELD_LABEL[m.field]))].join(', ')} <PendingTag title="The fields required before a draft can be generated are to be confirmed. Change them on Requirements & decisions.">Required fields TBC</PendingTag></Callout>}
            {mine && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="primary" icon={FileCheck2} disabled={missing.length > 0 || dirty || (!!latest && !latest.supersededAt && !outOfDate)} title={dirty ? 'Save the qualification first' : undefined} onClick={() => act((d) => generateDraft(d, opp.id, me.id), 'Draft generated', 'Share it with the customer and record their response.')}>Generate {latest ? 'new version' : 'draft'}</Button>
                <Button icon={CheckCircle2} disabled={!latest || latest.status === 'verified' || outOfDate} onClick={() => setApprovalOpen(true)}>Record approval</Button>
                <Button variant="ghost" disabled={!latest || latest.status === 'verified'} onClick={() => setCorrOpen(true)}>Customer asked for corrections</Button>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader icon={History} title="Version history" />
          {opp.drafts.length === 0 ? <EmptyState compact icon={History} title="No versions yet" /> : (
            <ul className="divide-y divide-slate-100">
              {[...opp.drafts].reverse().map((d) => (
                <li key={d.version} className="px-5 py-2.5 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-2"><b className="text-slate-800">v{d.version}</b><Badge tone={d.status === 'verified' ? 'green' : d.status === 'corrections_requested' ? 'red' : 'amber'}>{d.status.replace('_', ' ')}</Badge>{d.supersededAt && <Badge tone="neutral">Superseded</Badge>}<button className="ml-auto text-[12px] font-medium text-brand-700 hover:underline" onClick={() => setPreview(d.version)}>Preview</button></div>
                  <p className="mt-0.5 text-slate-500">{fmtDateTime(d.createdAt)} · {userName(S, d.createdBy)}{d.reverification ? ' · created by a material change' : ''}</p>
                  {d.corrections.map((c, i) => <p key={i} className="mt-0.5 text-slate-600">Correction: “{c.note}” · {fmtDateTime(c.at)}</p>)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Dialog open={approvalOpen} onClose={() => setApprovalOpen(false)} size="sm" title="Record the customer’s approval" description="The CRM stores your name and the time with the channel."
        footer={<><Button variant="ghost" onClick={() => setApprovalOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { const r = act((d) => recordDraftApproval(d, opp.id, channel, me.id), 'Draft verified'); if (r.ok) setApprovalOpen(false) }}>Save approval</Button></>}>
        <Field label="Approved via" required>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as 'whatsapp' | 'email')}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></Select>
        </Field>
      </Dialog>
      <Dialog open={corrOpen} onClose={() => setCorrOpen(false)} size="sm" title="Customer asked for corrections" description="The draft stays unverified. Update the qualification and generate a new version."
        footer={<><Button variant="ghost" onClick={() => setCorrOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { const r = act((d) => requestDraftCorrections(d, opp.id, note, me.id), 'Corrections noted'); if (r.ok) { setCorrOpen(false); setNote('') } }}>Save</Button></>}>
        <Field label="What should change" required><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Dialog>
      {preview != null && <DraftPreview opp={opp} version={preview} onClose={() => setPreview(null)} sensitiveOk={sensitiveOk && revealed} />}
    </div>
  )
}

function DraftPreview({ opp, version, onClose, sensitiveOk }: { opp: Opportunity; version: number; onClose: () => void; sensitiveOk: boolean }) {
  const S = useAppData()
  const d = opp.drafts.find((x) => x.version === version)!
  const lead = findLead(S, opp.leadId)!
  return (
    <Dialog open onClose={onClose} size="lg" title={`Client Information Draft · v${d.version}`} description={`${companyName(S, opp.companyId)} · ${lead.ref} · generated ${fmtDateTime(d.createdAt)} — information draft, not the official visa application form.`}
      footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        {d.snapshot.map((a, i) => (
          <div key={i} className="rounded-xl ring-1 ring-slate-200">
            <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[13px] font-semibold">Applicant {i + 1}</p>
            <dl className="grid gap-x-6 px-4 py-2 sm:grid-cols-2">
              {QUAL_GROUPS.flatMap((g) => g.fields).map((f) => (
                <KV key={f.key} label={f.label}>{a.data[f.key] ? (f.sensitive && !sensitiveOk ? '•••••••' : a.data[f.key]) : <span className="font-normal text-slate-400">—</span>}</KV>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ quote (SAL-FR-003)

function QuoteTab({ opp, mine }: { opp: Opportunity; mine: boolean }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const q = opp.quote
  const [v, setV] = useState<QuoteInput>(() => q ? { packageName: q.packageName, agreedAmount: q.agreedAmount, flightReservation: { ...q.flightReservation }, hotelReservationCompanyCost: q.hotelReservationCompanyCost, addOns: { ...q.addOns } }
    : { packageName: '', agreedAmount: 0, flightReservation: { required: false, paid: false }, hotelReservationCompanyCost: true, addOns: { actualFlight: false, actualHotel: false } })
  const [amount, setAmount] = useState(q ? String(q.agreedAmount) : '')
  const locked = !mine || !!opp.bookingId || oppPayments(S, opp.id).some((p) => p.status === 'awaiting')
  const draftInput = { ...v, agreedAmount: Number(amount) || 0 }
  const lines = expectedCostLines(S.salesConfig, draftInput)
  const margin = expectedMargin(S.salesConfig, draftInput)
  const savedMargin = q ? expectedMargin(S.salesConfig, q) : null
  const changed = !q || JSON.stringify({ ...draftInput }) !== JSON.stringify({ packageName: q.packageName, agreedAmount: q.agreedAmount, flightReservation: q.flightReservation, hotelReservationCompanyCost: q.hotelReservationCompanyCost, addOns: q.addOns })

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card className="min-w-0">
        <CardHeader icon={CircleDollarSign} title="Quote" description="You negotiate the price. The CRM records the agreed package, included services and amount exactly as entered — it never sets or suggests a price." actions={opp.bookingId ? <Badge tone="neutral" icon={Lock}>Locked after booking</Badge> : undefined} />
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Agreed package" required><Input value={v.packageName} disabled={locked} onChange={(e) => setV({ ...v, packageName: e.target.value })} placeholder="e.g. Schengen visa service — France" /></Field>
            <Field label="Agreed amount (£)" required><Input type="number" min={0} step="0.01" value={amount} disabled={locked} onChange={(e) => setAmount(e.target.value)} /></Field>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-slate-700">Included services</p>
            <ul className="space-y-1.5">
              {STANDARD_DELIVERABLES.map((k) => <li key={k} className="flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" checked disabled aria-label={SERVICE_ITEM_LABEL[k]} className="size-4 accent-brand-600" />{SERVICE_ITEM_LABEL[k]}<Badge tone="neutral">Standard · always included</Badge>
                {k === 'hotel_reservation' && <label className="ml-auto flex items-center gap-2 text-[12px] text-slate-600"><Switch size="sm" checked={v.hotelReservationCompanyCost} disabled={locked} onChange={(x) => setV({ ...v, hotelReservationCompanyCost: x })} label="Needs company expenditure" />Needs company expenditure</label>}
              </li>)}
            </ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl p-3 ring-1 ring-slate-200">
              <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700"><input type="checkbox" className="size-4 accent-brand-600" checked={v.flightReservation.required} disabled={locked} onChange={(e) => setV({ ...v, flightReservation: { required: e.target.checked, paid: e.target.checked && v.flightReservation.paid } })} />Flight reservation <Badge tone="sky">Conditional</Badge></label>
              <p className="mt-1 text-[11.5px] text-slate-500">Add when the destination/country or case requires it.</p>
              {v.flightReservation.required && <label className="mt-2 flex items-center gap-2 text-[12.5px] text-slate-600"><Switch size="sm" checked={v.flightReservation.paid} disabled={locked} onChange={(x) => setV({ ...v, flightReservation: { required: true, paid: x } })} label="Paid flight reservation" />{v.flightReservation.paid ? 'Paid (Processing handles it)' : 'Free (Sales handles it)'}</label>}
            </div>
            <div className="rounded-xl p-3 ring-1 ring-slate-200">
              <p className="text-[13px] font-medium text-slate-700">Customer-requested add-ons <Badge tone="violet">Optional</Badge></p>
              <p className="mt-1 text-[11.5px] text-slate-500">Not part of the five standard deliverables.</p>
              <label className="mt-2 flex items-center gap-2 text-[12.5px] text-slate-700"><input type="checkbox" className="size-4 accent-brand-600" checked={v.addOns.actualFlight} disabled={locked} onChange={(e) => setV({ ...v, addOns: { ...v.addOns, actualFlight: e.target.checked } })} />Actual flight booking</label>
              <label className="mt-1 flex items-center gap-2 text-[12.5px] text-slate-700"><input type="checkbox" className="size-4 accent-brand-600" checked={v.addOns.actualHotel} disabled={locked} onChange={(e) => setV({ ...v, addOns: { ...v.addOns, actualHotel: e.target.checked } })} />Actual hotel booking</label>
            </div>
          </div>
          {mine && !locked && (
            <div className="flex justify-end">
              <Button variant="primary" icon={Save} disabled={!changed} onClick={() => act((d) => saveQuote(d, opp.id, draftInput, me.id), 'Quote saved', `Expected margin ${fmtMoney(margin)}.`)}>Save quote</Button>
            </div>
          )}
          {mine && locked && !opp.bookingId && <Callout tone="neutral">A payment is awaiting Accounts verification, so the quote cannot change now.</Callout>}
        </div>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Expected margin" description={`Recalculated on every change. Booked only when Accounts confirms payment and the margin is above £${BOOKING_MARGIN_THRESHOLD}.`} actions={<PendingTag title="The expected-cost items per package, who maintains them and the margin formula are to be confirmed. Demo costs are on Sales settings.">Formula & costs = placeholder</PendingTag>} />
          <div className="p-5">
            <table className="w-full text-[12.5px]">
              <tbody className="divide-y divide-slate-100">
                <tr><td className="py-1.5 text-slate-600">Agreed amount</td><td className="py-1.5 text-right font-semibold tabular-nums">{fmtMoney(draftInput.agreedAmount)}</td></tr>
                {lines.map((l) => <tr key={l.key}><td className="py-1.5 text-slate-500">− {SERVICE_ITEM_LABEL[l.key]}</td><td className="py-1.5 text-right text-slate-500 tabular-nums">{fmtMoney(l.cost)}</td></tr>)}
              </tbody>
              <tfoot><tr className="border-t-2 border-slate-200"><td className="pt-2 font-semibold">Expected margin</td><td className="pt-2 text-right"><MarginPill margin={margin} /></td></tr></tfoot>
            </table>
            {!isBookableMargin(margin) && draftInput.agreedAmount > 0 && <Callout tone="warning" className="mt-3" icon={ShieldAlert}>Margin £{BOOKING_MARGIN_THRESHOLD} or less is not bookable. Only a user with the Booking Margin Override permission can override after Accounts confirms payment.</Callout>}
            {q && savedMargin !== null && <p className="mt-3 text-[11.5px] text-slate-500">Saved: {fmtMoney(q.agreedAmount)} → margin {fmtMoney(savedMargin)} · {fmtDateTime(q.savedAt)}</p>}
          </div>
        </Card>
        {q && (
          <Card>
            <CardHeader icon={History} title="Quote history" />
            <ul className="divide-y divide-slate-100">
              {[...q.history].reverse().map((h, i) => <li key={i} className="flex justify-between px-5 py-2 text-[12.5px]"><span className="text-slate-500">{fmtDateTime(h.at)}</span><span className="tabular-nums">{fmtMoney(h.agreedAmount)} · margin {fmtMoney(h.expectedMargin)}</span></li>)}
            </ul>
          </Card>
        )}
        <Card className="p-4 text-[12px] text-slate-500">Included services become the case checklist after booking: {includedItems(draftInput).map((k) => SERVICE_ITEM_LABEL[k]).join(', ')}.</Card>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ payments, booking, invoice, refunds (SAL-FR-004, SAL-FR-005)

function PaymentsTab({ opp, mine }: { opp: Opportunity; mine: boolean }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [dlg, setDlg] = useState<null | 'pay' | 'override' | 'refund' | 'expense' | 'invoice'>(null)
  const pays = oppPayments(S, opp.id)
  const totals = paymentTotals(S, opp)
  const booking = bookingOf(S, opp)
  const notBookable = isNotBookable(S, opp)
  const awaiting = pays.some((p) => p.status === 'awaiting')
  const refunds = booking ? S.refunds.filter((r) => r.bookingId === booking.id) : []
  const margin = opp.quote ? expectedMargin(S.salesConfig, opp.quote) : null
  const canPay = mine && !!opp.quote && !awaiting && totals.outstanding > 0 && opp.stage !== 'lost'

  return (
    <div className="space-y-5">
      {notBookable && (
        <Callout tone="warning" icon={ShieldAlert} title={`Not bookable · expected margin ${fmtMoney(margin!)} is not above £${BOOKING_MARGIN_THRESHOLD}`}
          action={canOverrideMargin(me) && visibleCompanies(S, me).includes(opp.companyId) ? <Button variant="primary" onClick={() => setDlg('override')}>Override threshold</Button> : undefined}>
          Accounts confirmed the payment, but the CRM does not mark it Booked. Only a user with the Booking Margin Override permission can override; Managers are assigned it and Admin holds it by default.{!canOverrideMargin(me) && ' You do not have this permission.'}
        </Callout>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="min-w-0">
          <CardHeader icon={Receipt} title="Payment Verification Requests" description="Full, or partial of at least £50, with proof. Only Accounts confirms or rejects. Balance payments use the same flow."
            actions={mine && <Button size="sm" variant="primary" icon={Send} disabled={!canPay} title={!opp.quote ? 'Save the quote first' : awaiting ? 'A request is awaiting Accounts' : totals.outstanding <= 0 ? 'Nothing is outstanding' : undefined} onClick={() => setDlg('pay')}>{opp.bookingId ? 'Balance payment' : 'Submit payment'}</Button>} />
          {pays.length === 0 ? <EmptyState compact icon={Receipt} title="No payment requests yet" description={opp.quote ? undefined : 'Save a quote before requesting payment.'} /> : (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[620px]">
                <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Submitted</th><th className={th}>Type</th><th className={cn(th, 'text-right')}>Amount</th><th className={th}>Proof</th><th className={th}>Status</th><th className={th}>Decided</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {[...pays].reverse().map((p) => (
                    <tr key={p.id}>
                      <td className={cn(td, 'text-[12.5px] whitespace-nowrap')}>{fmtDateTime(p.submittedAt)}</td>
                      <td className={td}>{p.balance ? 'Balance' : p.type === 'full' ? 'Full' : 'Partial'}</td>
                      <td className={cn(td, 'text-right font-medium tabular-nums')}>{fmtMoney(p.amount)}</td>
                      <td className={cn(td, 'text-[12px] text-slate-500')}>{p.proofName}</td>
                      <td className={td}><PaymentStatusBadge p={p} />{p.rejectionReason && <span className="mt-0.5 block text-[11.5px] text-slate-500">“{p.rejectionReason}”</span>}</td>
                      <td className={cn(td, 'text-[12px] text-slate-500')}>{p.decidedAt ? `${fmtDateTime(p.decidedAt)} · ${userName(S, p.decidedBy)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Booking summary" description="SAL-FR-004" actions={booking && <Badge tone="green" dot>Booked · {booking.ref}</Badge>} />
          <dl className="divide-y divide-slate-100 px-5 py-1">
            <KV label="Total value">{fmtMoney(totals.total)}</KV>
            <KV label="Amount paid">{fmtMoney(totals.paid)}</KV>
            <KV label="Outstanding balance">{totals.outstanding > 0 ? <span className="text-amber-700">{fmtMoney(totals.outstanding)}</span> : fmtMoney(0)}</KV>
            <KV label="Expected margin">{booking ? fmtMoney(booking.expectedMargin) : margin !== null ? <MarginPill margin={margin} /> : '—'}</KV>
            <KV label="Owner">{userName(S, oppOwnerId(S, opp))}</KV>
            {booking && <KV label="Created">{fmtDateTime(booking.createdAt)} · {booking.createdVia === 'override' ? 'margin override' : 'margin above £60'}</KV>}
            {booking?.override && <KV label="Override">{userName(S, booking.override.byUserId)} · {fmtDateTime(booking.override.at)}{booking.override.reason ? ` · “${booking.override.reason}”` : ''}</KV>}
            {totals.refunded > 0 && <KV label="Refunded (approved)">{fmtMoney(totals.refunded)}</KV>}
            {booking && booking.expenses.length > 0 && <KV label="Actual expenses (Accounts)">{fmtMoney(booking.expenses.reduce((s, e) => s + e.amount, 0))}</KV>}
          </dl>
          {booking && canRecordExpenses(me) && <div className="border-t border-slate-100 px-5 py-3"><Button size="sm" onClick={() => setDlg('expense')}>Record actual expense</Button></div>}
        </Card>
      </div>

      {booking && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader icon={FileSignature} title="Invoice / terms & signature" description="Filled from the approved template and sent through DigiSigner after booking. Signature status is separate from the Booking status."
              actions={<><SimTag title="DigiSigner is pending technical validation; nothing is sent.">DigiSigner simulated</SimTag><PendingTag title="The approved invoice/terms template was not provided.">Template = placeholder</PendingTag></>} />
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2"><SignatureBadge status={booking.invoice.status} /><UnsignedFlag booking={booking} /></div>
              <dl className="divide-y divide-slate-100">
                <KV label="Sent">{booking.invoice.sentAt ? fmtDateTime(booking.invoice.sentAt) : '—'}</KV>
                <KV label="Signed">{booking.invoice.signedAt ? fmtDateTime(booking.invoice.signedAt) : '—'}</KV>
                <KV label="Agent reminder">{booking.invoice.remindedAt ? fmtDateTime(booking.invoice.remindedAt) : S.salesConfig.invoiceReminderDays == null ? <span className="font-normal text-slate-500">Period not configured <PendingTag>§13 Q7</PendingTag></span> : `after ${S.salesConfig.invoiceReminderDays} day(s)`}</KV>
                <KV label="Manager alert">{booking.invoice.escalatedAt ? fmtDateTime(booking.invoice.escalatedAt) : S.salesConfig.invoiceEscalationDays == null ? <span className="font-normal text-slate-500">Period not configured</span> : `after ${S.salesConfig.invoiceEscalationDays} day(s)`}</KV>
              </dl>
              {booking.invoice.lastError && <Callout tone="danger">{booking.invoice.lastError}</Callout>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={Eye} onClick={() => setDlg('invoice')}>Preview</Button>
                {booking.invoice.status === 'not_generated' && (mine || me.role === 'admin' || me.role === 'manager') && <Button size="sm" icon={RotateCw} onClick={() => act((d) => retryInvoice(d, booking.id, me.id), 'Invoice sent (simulated)')}>Retry sending</Button>}
              </div>
              <p className="text-[11.5px] text-slate-500">An unsigned invoice never blocks appointment or document work and never cancels the Booking.</p>
            </div>
          </Card>
          <Card>
            <CardHeader icon={RotateCw} title="Refunds" description="Requested by the agent or a helpline user; only Accounts decides. A refunded Booking is never deleted; the approved amount reduces actual margin."
              actions={canRequestRefund(S, me, opp) && <Button size="sm" onClick={() => setDlg('refund')}>Request refund</Button>} />
            {refunds.length === 0 ? <EmptyState compact icon={RotateCw} title="No refund requests" /> : (
              <ul className="divide-y divide-slate-100">
                {refunds.map((r) => (
                  <li key={r.id} className="px-5 py-2.5 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-2"><b className="tabular-nums">{fmtMoney(r.amount)}</b><Badge tone={r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : 'amber'}>{r.status === 'requested' ? 'Requested' : r.status === 'approved' ? 'Approved' : 'Rejected'}</Badge></div>
                    <p className="mt-0.5 text-slate-600">{r.note}</p>
                    <p className="text-[11.5px] text-slate-400">{userName(S, r.requestedBy)} · {fmtDateTime(r.requestedAt)}{r.decidedAt ? ` · decided ${fmtDateTime(r.decidedAt)} by ${userName(S, r.decidedBy)}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {dlg === 'pay' && <PaymentDialog opp={opp} open onClose={() => setDlg(null)} />}
      {dlg === 'override' && <OverrideDialog opp={opp} open onClose={() => setDlg(null)} />}
      {dlg === 'refund' && booking && <RefundDialog booking={booking} open onClose={() => setDlg(null)} />}
      {dlg === 'expense' && booking && <ExpenseDialog booking={booking} open onClose={() => setDlg(null)} />}
      {dlg === 'invoice' && booking && (
        <Dialog open onClose={() => setDlg(null)} size="lg" title={`Invoice / terms · ${booking.ref}`} description="Placeholder preview — the approved template was not provided. Values come from the Booking." footer={<Button onClick={() => setDlg(null)}>Close</Button>}>
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/30 p-5 text-[13px]">
            <p className="text-[11px] font-semibold tracking-wide text-amber-800 uppercase">Placeholder template</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{companyName(S, booking.companyId)}</p>
            <p className="text-slate-600">Invoice for {findLead(S, booking.leadId)!.fields.fullName} · {booking.ref}</p>
            <table className="mt-4 w-full">
              <tbody className="divide-y divide-amber-200/60">
                <tr><td className="py-1.5">{opp.quote!.packageName}</td><td className="py-1.5 text-right tabular-nums">{fmtMoney(booking.totalValue)}</td></tr>
                {includedItems(opp.quote!).map((k) => <tr key={k}><td className="py-1 pl-4 text-[12px] text-slate-500">{SERVICE_ITEM_LABEL[k]}</td><td /></tr>)}
                <tr><td className="py-1.5">Paid to date</td><td className="py-1.5 text-right tabular-nums">{fmtMoney(totals.paid)}</td></tr>
                <tr><td className="py-1.5 font-semibold">Balance due</td><td className="py-1.5 text-right font-semibold tabular-nums">{fmtMoney(totals.outstanding)}</td></tr>
              </tbody>
            </table>
            <p className="mt-4 text-[12px] text-slate-500">Terms and conditions: <i>approved wording to be supplied</i>. Signature through DigiSigner.</p>
          </div>
        </Dialog>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ conversation (SAL-FR-001)

export function ConversationPanel({ opp }: { opp: Opportunity }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [text, setText] = useState('')
  const thread = threadOf(S, opp.id)
  const lead = findLead(S, opp.leadId)!
  const mine = canWorkOpportunity(S, me, opp)
  const mgmt = me.role === 'admin' || me.role === 'manager'
  const canReply = mine || (mgmt && S.params.managerInboxReplies)
  return (
    <Card>
      <CardHeader icon={MessageCircle} title={`WhatsApp · ${lead.fields.fullName}`} description={`Company WhatsApp for ${companyName(S, opp.companyId)}. CRM ownership controls visibility: only ${userName(S, oppOwnerId(S, opp))} and Managers/Admins in scope can see it.`}
        actions={<><SimTag title="Company WhatsApp is not validated for this prototype. Messages are stored in the CRM only and never sent.">WhatsApp simulated</SimTag>{mgmt && <PendingTag title="Whether Manager/Admin inbox access is view-only or also permits replies is to be confirmed.">{S.params.managerInboxReplies ? 'Replies on (demo)' : 'View-only (TBC)'}</PendingTag>}</>} />
      <div className="scroll-thin max-h-[460px] min-h-48 space-y-2 overflow-y-auto bg-slate-50/60 px-5 py-4">
        {!thread || thread.messages.length === 0 ? <p className="py-10 text-center text-[13px] text-slate-500">No WhatsApp messages yet.</p> : thread.messages.map((m) => (
          <div key={m.id} className={cn('flex', m.from === 'agent' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] shadow-xs', m.from === 'agent' ? 'rounded-br-md bg-emerald-600 text-white' : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200')}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className={cn('mt-0.5 text-[10.5px]', m.from === 'agent' ? 'text-emerald-100' : 'text-slate-400')}>{m.from === 'agent' ? `${userName(S, m.byUserId)} · ` : ''}{fmtRelative(m.at, S.clock.now)}</p>
            </div>
          </div>
        ))}
      </div>
      {canReply ? (
        <div className="flex gap-2 border-t border-slate-100 p-3">
          <Textarea aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a WhatsApp message…" className="min-h-10 flex-1" />
          <Button variant="primary" icon={Send} disabled={!text.trim()} onClick={() => { const r = act((d) => sendWhatsApp(d, opp.id, text, me.id)); if (r.ok) setText('') }}>Send</Button>
        </div>
      ) : <p className="border-t border-slate-100 px-5 py-3 text-[12.5px] text-slate-500"><Lock className="mr-1 inline size-3.5" />View-only. Only the owning agent replies in this conversation.</p>}
    </Card>
  )
}

// ------------------------------------------------------------------ documents (SAL-FR-008)

function DocumentsTab({ opp }: { opp: Opportunity }) {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const [kind, setKind] = useState<'passport' | 'share_code' | 'visa_status' | 'other'>('passport')
  const docs = S.documents.filter((d) => d.oppId === opp.id)
  const mine = canWorkOpportunity(S, me, opp)
  const canUpload = mine || (me.role === 'processing' && !!opp.bookingId)
  const sensitiveOk = canSeeSensitive(S, me, opp)
  return (
    <Card>
      <CardHeader icon={FolderLock} title="Documents" description="Metadata is stored in the CRM; raw files belong in a private object-storage bucket and open only through a short-lived link after a permission check — never a permanent public URL. No bulk download."
        actions={<><SimTag title="Private object storage is not built in the prototype. Only file metadata is kept; links are simulated tokens.">Storage simulated</SimTag><Badge tone="neutral">Links last {S.salesConfig.linkMinutes} min <PendingTag>TBC</PendingTag></Badge></>} />
      {canUpload && (
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-5 py-3">
          <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-44"><option value="passport">Passport</option><option value="share_code">Share code</option><option value="visa_status">Visa status</option><option value="other">Other</option></Select></Field>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs ring-1 ring-slate-200 ring-inset hover:bg-slate-50">
            <Upload className="size-4" />Upload file
            <input type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) act((d) => uploadDocument(d, opp.id, { name: f.name, kind, sizeKb: f.size / 1024 }, me.id), 'Document metadata saved', 'The file itself is not uploaded anywhere in the prototype.'); e.target.value = '' }} />
          </label>
        </div>
      )}
      {docs.length === 0 ? <EmptyState compact icon={FolderLock} title="No documents" /> : (
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>File</th><th className={th}>Type</th><th className={th}>Uploaded</th><th className={th}>Raw file</th><th className={cn(th, 'relative')}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((d) => {
                const link = d.links.filter((l) => l.userId === me.id && l.expiresAt > S.clock.now).at(-1)
                return (
                  <tr key={d.id}>
                    <td className={cn(td, 'font-medium')}>{d.name}<span className="block text-[11.5px] font-normal text-slate-400">{Math.round(d.sizeKb)} KB</span></td>
                    <td className={td}>{d.kind.replace('_', ' ')}</td>
                    <td className={cn(td, 'text-[12px] text-slate-500')}>{fmtDateTime(d.uploadedAt)} · {userName(S, d.uploadedBy)}</td>
                    <td className={td}>{d.deletedAt ? <Badge tone="orange">Deleted {fmtDateTime(d.deletedAt)} — metadata kept</Badge> : <Badge tone="green">In private storage</Badge>}</td>
                    <td className={cn(td, 'text-right')}>
                      {link ? <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-700"><Link2 className="size-3.5" />Link valid {fmtDuration(link.expiresAt - S.clock.now)}</span>
                        : <Button size="xs" icon={Link2} disabled={!!d.deletedAt || !sensitiveOk} title={!sensitiveOk ? 'Restricted' : undefined} onClick={() => act((d2) => requestDocumentLink(d2, d.id, me.id), 'Short-lived link issued', `Valid ${S.salesConfig.linkMinutes} minutes. Access was audit-logged.`)}>Open</Button>}
                      {me.role === 'admin' && !d.deletedAt && <Button size="xs" variant="ghost" icon={Trash2} className="ml-1" onClick={() => { if (window.confirm('Delete the raw file now? Metadata stays.')) act((d2) => deleteDocumentNow(d2, d.id, me.id), 'Raw file deleted') }}>Delete raw</Button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!sensitiveOk && <p className="border-t border-slate-100 px-5 py-2.5 text-[12px] text-slate-500"><Lock className="mr-1 inline size-3.5" />You can see the file list but not open sensitive files (placeholder matrix).</p>}
    </Card>
  )
}
