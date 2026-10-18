import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRightCircle, CheckCircle2, Hash, Lock, Save, ShieldCheck, Radio, Clock } from 'lucide-react'
import { Badge, Button, Callout, Field, Input, PendingTag, Textarea, cn } from '../ui'
import { CompanyTag, ReadOnlyBadge, StatusPill } from '../domain'
import { PlatformBadge, PlatformIcon, ModeBadge } from './parts'
import { useAppData, useMe, useRun } from '@/store/store'
import { useAction } from '@/store/hooks'
import { canManageEnquiry, isViewOnlyCompany } from '@/domain/permissions'
import { convertEnquiry, userName } from '@/domain/engine'
import { canReply, isCommentThread, replyOptions, threadNow } from '@/domain/messaging'
import { FIELD_LABEL, STANDARD_FIELDS } from '@/domain/constants'
import type { CustomerFields, Enquiry } from '@/domain/types'
import { fmtDateTime, fmtDuration } from '@/lib/time'

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Hash; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-4 py-4 last:border-0">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase"><Icon className="size-3.5" />{title}</h2>
      {children}
    </section>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[12.5px]">
      <dt className="shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 text-right font-medium break-words text-slate-800">{children}</dd>
    </div>
  )
}

export function ClientPanel({ e, live, checking, reason }: { e: Enquiry; live: boolean; checking: boolean; reason: string }) {
  const S = useAppData()
  const me = useMe()
  const run = useRun()
  const act = useAction()
  const [fields, setFields] = useState<CustomerFields>({ ...e.fields })
  const [tried, setTried] = useState(false)
  useEffect(() => { setFields({ ...e.fields }); setTried(false) }, [e.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const now = threadNow(S, e)
  const canManage = canManageEnquiry(me, e)
  const required = S.params.conversionRequiredFields
  const dirty = JSON.stringify(fields) !== JSON.stringify(e.fields)
  const missing = required.filter((k) => !fields[k]?.trim())
  const lead = e.convertedLeadId ? S.leads.find((l) => l.id === e.convertedLeadId) : null
  const opts = replyOptions(e, now)
  const comment = isCommentThread(e)

  const save = () => run((d) => { const x = d.enquiries.find((y) => y.id === e.id); if (x) x.fields = { ...fields } })
  const convert = () => {
    setTried(true)
    save()
    if (missing.length) return
    // Success is confirmed in place by the "Converted to …" panel; a toast here would cover the Open Lead button.
    act((d) => convertEnquiry(d, e.id, me.id))
  }

  return (
    <div>
      <div className="flex flex-col items-center border-b border-slate-100 px-4 py-5 text-center">
        <PlatformIcon e={e} size="lg" />
        <p className="mt-2.5 text-[15px] font-semibold text-slate-900">{e.fields.fullName || e.handle}</p>
        {e.fields.fullName && <p className="text-[12.5px] text-slate-500">{e.handle}</p>}
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <PlatformBadge e={e} />
          {e.status === 'converted' ? <Badge tone="green" dot>Converted</Badge> : <Badge tone="neutral" dot>Unqualified</Badge>}
          {isViewOnlyCompany(me, e.companyId) && <ReadOnlyBadge />}
        </div>
      </div>

      <Section title="Conversation" icon={Hash}>
        <dl>
          <Row k="Company"><CompanyTag id={e.companyId} /></Row>
          <Row k="Reference"><span className="font-mono text-[11.5px]">{e.ref}</span></Row>
          <Row k="Meta thread"><span className="font-mono text-[11.5px]">{e.conversationRef}</span></Row>
          <Row k={comment ? 'Commenter id' : 'Client id'}><span className="font-mono text-[11.5px]">{e.platformUserId}</span></Row>
          <Row k="Started">{fmtDateTime(e.createdAt)}</Row>
          {e.postContext && <Row k="Post">{e.postContext.replace(/^Comment on post: /, '')}</Row>}
        </dl>
      </Section>

      <Section title="Messaging" icon={Radio}>
        <div className="mb-2"><ModeBadge live={live} checking={checking} /></div>
        <p className="mb-2 text-[12px] text-slate-500">{reason}</p>
        <dl>
          {(!comment || e.lastInboundDmAt !== null) && (
            <Row k="Reply window">
              {opts.dm.allowed ? <span className="text-emerald-700">Open · {fmtDuration(opts.dm.closesAt! - now)} left</span> : <span className="text-amber-700">{e.lastInboundDmAt ? 'Closed' : 'Not open'}</span>}
            </Row>
          )}
          {comment && <Row k="Private reply">{e.privateReplyAt ? `Sent ${fmtDateTime(e.privateReplyAt)}` : opts['private-reply'].allowed ? <span className="text-emerald-700">Available until {fmtDateTime(opts['private-reply'].closesAt!)}</span> : <span className="text-amber-700">Expired</span>}</Row>}
          {comment && <Row k="Public reply"><span className="text-emerald-700">Available</span></Row>}
          <Row k="You can reply">{canReply(me, e) ? <span className="text-emerald-700">Yes</span> : <span className="inline-flex items-center gap-1 text-slate-500"><Lock className="size-3" />No</span>}</Row>
        </dl>
        <p className="mt-2 flex items-start gap-1 text-[11.5px] text-slate-500"><Clock className="mt-0.5 size-3 shrink-0" />Reply windows are Meta platform rules: 24 hours after the client’s last message, and one private reply per comment within 7 days.</p>
      </Section>

      {e.status === 'converted' && lead ? (
        <Section title="Lead" icon={CheckCircle2}>
          <Callout tone="success" icon={CheckCircle2} title={`Converted to ${lead.ref}`}>
            {fmtDateTime(e.convertedAt!)} by {userName(S, e.convertedByUserId)}. {lead.ownerId ? <>Owner: <b>{userName(S, lead.ownerId)}</b>.</> : <>Unassigned — the Manager was notified.</>}
            <span className="mt-1.5 flex items-center gap-2">Status: <StatusPill status={lead.status} /></span>
          </Callout>
          <Link to={`/leads/${lead.id}`} className="mt-2.5 block"><Button size="sm" className="w-full" iconRight={ArrowRightCircle}>Open Lead</Button></Link>
        </Section>
      ) : (
        <Section title="Qualify & convert" icon={ShieldCheck}>
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500">
            Required: {required.map((k) => <Badge key={k} tone="neutral">{FIELD_LABEL[k]}</Badge>)}
            <PendingTag title="The required fields for converting a social enquiry are to be confirmed with Marketing. This set is a placeholder.">To be confirmed</PendingTag>
          </div>
          {tried && missing.length > 0 && <Callout tone="danger" icon={AlertCircle} className="mb-3" title="Required fields missing">Add {missing.map((k) => FIELD_LABEL[k]).join(', ')} before converting.</Callout>}
          {!canManage && <Callout tone="neutral" icon={Lock} className="mb-3">{isViewOnlyCompany(me, e.companyId) ? 'This company is view-only for you. Editing and converting are blocked.' : 'Only Marketing employees assigned to this company can qualify and convert.'}</Callout>}
          <div className="space-y-3">
            {[...STANDARD_FIELDS, 'tripDetails' as const].map((k) => {
              const isReq = required.includes(k)
              const invalid = tried && isReq && !fields[k]?.trim()
              return (
                <Field key={k} label={FIELD_LABEL[k]} required={isReq} htmlFor={`f-${k}`} error={invalid ? 'Required to convert' : undefined}>
                  {k === 'tripDetails'
                    ? <Textarea id={`f-${k}`} value={fields[k]} disabled={!canManage} onChange={(ev) => setFields({ ...fields, [k]: ev.target.value })} placeholder="Optional — destination, dates, travellers…" invalid={invalid} className="min-h-16" />
                    : <Input id={`f-${k}`} value={fields[k]} disabled={!canManage} onChange={(ev) => setFields({ ...fields, [k]: ev.target.value })} invalid={invalid} type={k === 'email' ? 'email' : 'text'} />}
                </Field>
              )
            })}
          </div>
          {canManage && (
            <div className={cn('mt-4 flex items-center justify-between gap-2')}>
              <Button size="sm" variant="ghost" icon={Save} disabled={!dirty} onClick={save}>Save details</Button>
              <Button size="sm" variant="primary" icon={ArrowRightCircle} onClick={convert}>Convert to Lead</Button>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
