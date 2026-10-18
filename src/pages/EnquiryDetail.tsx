import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRightCircle, CheckCircle2, ExternalLink, Hash, Lock, MessageCircle, MessagesSquare, Save, ShieldCheck, AlertCircle } from 'lucide-react'
import { Badge, Button, Callout, Card, CardHeader, Field, Input, PageHeader, PendingTag, Textarea, cn } from '@/components/ui'
import { CompanyTag, ReadOnlyBadge, StatusPill } from '@/components/domain'
import { useAppData, useMe, useRun } from '@/store/store'
import { useAction } from '@/store/hooks'
import { canManageEnquiry, canViewEnquiry, isViewOnlyCompany } from '@/domain/permissions'
import { convertEnquiry, missingConversionFields, userName } from '@/domain/engine'
import { FIELD_LABEL, SOURCE_LABEL, STANDARD_FIELDS } from '@/domain/constants'
import { fmtDateTime, fmtTime } from '@/lib/time'
import type { CustomerFields } from '@/domain/types'
import { PermissionDenied, NotFound } from './Errors'

export default function EnquiryDetailPage() {
  const { id } = useParams()
  const S = useAppData()
  const me = useMe()
  const run = useRun()
  const act = useAction()
  const e = S.enquiries.find((x) => x.id === id)
  const [fields, setFields] = useState<CustomerFields | null>(null)
  const [triedConvert, setTriedConvert] = useState(false)

  const canManage = !!e && canManageEnquiry(me, e)
  useEffect(() => {
    if (e && canManage && !e.read) run((d) => { const x = d.enquiries.find((y) => y.id === e.id); if (x) x.read = true })
  }, [e?.id, canManage]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (e) setFields({ ...e.fields }) }, [e?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!e) return <NotFound />
  if (!canViewEnquiry(S, me, e)) return <PermissionDenied />
  const f = fields ?? e.fields
  const required = S.params.conversionRequiredFields
  const dirty = JSON.stringify(f) !== JSON.stringify(e.fields)
  const missing = required.filter((k) => !f[k]?.trim())
  const lead = e.convertedLeadId ? S.leads.find((l) => l.id === e.convertedLeadId) : null
  const isComment = e.channel.endsWith('comment')
  const Icon = isComment ? MessagesSquare : MessageCircle

  const save = () => run((d) => { const x = d.enquiries.find((y) => y.id === e.id); if (x) x.fields = { ...f } })
  const convert = () => {
    setTriedConvert(true)
    save()
    if (missing.length) return
    act((d) => convertEnquiry(d, e.id, me.id), 'Converted to Lead', 'The Lead kept its company and source and was sent to distribution.')
  }

  return (
    <div>
      <Link to="/inbox" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Marketing Inbox</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{e.fields.fullName || e.handle}{e.status === 'converted' ? <Badge tone="green" dot>Converted</Badge> : <Badge tone="neutral" dot>Unqualified Enquiry</Badge>}</span>}
        eyebrow={<><span className="font-mono">{e.ref}</span><span>·</span><CompanyTag id={e.companyId} /><span>·</span><span>{SOURCE_LABEL[e.channel]}</span>{isViewOnlyCompany(me, e.companyId) && <ReadOnlyBadge />}</>}
      />

      {e.status === 'converted' && lead && (
        <Callout tone="success" icon={CheckCircle2} className="mb-5" title={`Converted to ${lead.ref} on ${fmtDateTime(e.convertedAt!)} by ${userName(S, e.convertedByUserId)}`}
          action={<Link to={`/leads/${lead.id}`}><Button size="sm" variant="secondary" iconRight={ArrowRightCircle}>Open Lead</Button></Link>}>
          {lead.ownerId ? <>Assigned to <b>{userName(S, lead.ownerId)}</b>. </> : <>No eligible agent — the Lead is Unassigned and the Manager was notified. </>}
          Current status: <span className="inline-block align-middle"><StatusPill status={lead.status} /></span>
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="flex flex-col">
          <CardHeader icon={Icon} title="Conversation" description={isComment ? 'Comment on a public post. Marketing normally moves the conversation to a private context to qualify the person.' : 'Direct message thread'}
            actions={<span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 font-mono text-[11.5px] text-slate-500 ring-1 ring-slate-200"><Hash className="size-3" />{e.conversationRef}</span>} />
          {e.postContext && <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[12.5px] text-slate-500">{e.postContext}</div>}
          <div className="flex-1 space-y-3 px-5 py-5">
            {e.messages.map((m, i) => (
              <div key={i} className={cn('flex', m.from === 'marketing' && 'justify-end')}>
                <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed', m.from === 'customer' ? 'rounded-bl-md bg-slate-100 text-slate-800' : 'rounded-br-md bg-brand-600 text-white')}>
                  {m.text}
                  <span className={cn('mt-1 block text-[10.5px]', m.from === 'customer' ? 'text-slate-400' : 'text-brand-100')}>{m.from === 'customer' ? e.handle : 'Marketing'} · {fmtTime(m.at)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
            <ExternalLink className="size-3.5" />
            Replies are handled in the Meta inbox. The CRM stores the conversation reference with the record.
          </div>
        </Card>

        <Card>
          <CardHeader icon={ShieldCheck} title="Qualify & convert" description="Collect the required details, then convert deliberately. There is no AI qualification." />
          <div className="space-y-4 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
              Required to convert: {required.map((k) => <Badge key={k} tone="neutral">{FIELD_LABEL[k]}</Badge>)}
              <PendingTag title="The required fields for converting a social enquiry are to be confirmed with Marketing. This set is a placeholder.">To be confirmed</PendingTag>
            </div>
            {triedConvert && missing.length > 0 && e.status === 'open' && (
              <Callout tone="danger" icon={AlertCircle} title="Required fields missing">Add {missing.map((k) => FIELD_LABEL[k]).join(', ')} before converting.</Callout>
            )}
            {!canManage && e.status === 'open' && (
              <Callout tone="neutral" icon={Lock}>{isViewOnlyCompany(me, e.companyId) ? 'This company is view-only for you. Editing and converting are blocked.' : 'Only Marketing employees assigned to this company can qualify and convert.'}</Callout>
            )}
            {[...STANDARD_FIELDS, 'tripDetails' as const].map((k) => {
              const isReq = required.includes(k)
              const invalid = triedConvert && isReq && !f[k]?.trim() && e.status === 'open'
              return (
                <Field key={k} label={FIELD_LABEL[k]} required={isReq} htmlFor={`f-${k}`} error={invalid ? 'Required to convert' : undefined}>
                  {k === 'tripDetails'
                    ? <Textarea id={`f-${k}`} value={f[k]} disabled={!canManage || e.status === 'converted'} onChange={(ev) => setFields({ ...f, [k]: ev.target.value })} placeholder="Optional — destination, dates, travellers…" invalid={invalid} />
                    : <Input id={`f-${k}`} value={f[k]} disabled={!canManage || e.status === 'converted'} onChange={(ev) => setFields({ ...f, [k]: ev.target.value })} invalid={invalid} type={k === 'email' ? 'email' : 'text'} />}
                </Field>
              )
            })}
          </div>
          {canManage && e.status === 'open' && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
              <Button variant="ghost" icon={Save} disabled={!dirty} onClick={() => { save(); setFields({ ...f }) }}>Save details</Button>
              <Button variant="primary" icon={ArrowRightCircle} onClick={convert}>Convert to Lead</Button>
            </div>
          )}
          {e.status === 'open' && missingConversionFields(S, e).length === 0 && !dirty && canManage && (
            <p className="px-5 pb-3 text-[12px] text-emerald-700">All required details are present.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
