import { AlertCircle, Check, CheckCheck, Clock, Eye, Globe, Loader2, Lock, MessageCircle, MessagesSquare, RotateCcw, Trash2 } from 'lucide-react'
import { Badge, cn } from '../ui'
import type { Enquiry, EnquiryMessage } from '@/domain/types'
import { channelOf, isCommentThread } from '@/domain/messaging'
import { fmtDateShort, fmtTime, pktDateKey } from '@/lib/time'

// ------------------------------------------------------------------ platform indicators
// Brand-neutral: colour + label, no third-party logos.

export function PlatformIcon({ e, size = 'md' }: { e: Enquiry; size?: 'sm' | 'md' | 'lg' }) {
  const ig = channelOf(e.channel) === 'instagram'
  const Icon = isCommentThread(e) ? MessagesSquare : MessageCircle
  const s = { sm: 'size-6 [&>svg]:size-3', md: 'size-9 [&>svg]:size-4', lg: 'size-11 [&>svg]:size-5' }[size]
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full text-white shadow-sm', s, ig ? 'bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600' : 'bg-gradient-to-br from-sky-500 to-blue-600')} aria-hidden>
      <Icon strokeWidth={2.2} />
    </span>
  )
}

export function platformName(e: Enquiry) {
  const p = channelOf(e.channel) === 'instagram' ? 'Instagram' : 'Messenger'
  return isCommentThread(e) ? `${p === 'Messenger' ? 'Facebook' : 'Instagram'} comment` : p === 'Messenger' ? 'Messenger' : 'Instagram Direct'
}

export function PlatformBadge({ e }: { e: Enquiry }) {
  const ig = channelOf(e.channel) === 'instagram'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap ring-1 ring-inset', ig ? 'bg-pink-50 text-pink-700 ring-pink-200' : 'bg-sky-50 text-sky-700 ring-sky-200')}>
      <span className={cn('size-1.5 rounded-full', ig ? 'bg-pink-500' : 'bg-sky-500')} />
      {platformName(e)}
    </span>
  )
}

// ------------------------------------------------------------------ message bubble

const STATUS: Record<NonNullable<EnquiryMessage['status']>, { icon: typeof Check; label: string; cls: string }> = {
  sending: { icon: Loader2, label: 'Sending…', cls: 'text-slate-500 [&>svg]:animate-spin' },
  sent: { icon: Check, label: 'Sent', cls: 'text-slate-500' },
  delivered: { icon: CheckCheck, label: 'Delivered', cls: 'text-slate-500' },
  read: { icon: Eye, label: 'Seen', cls: 'text-brand-700' },
  failed: { icon: AlertCircle, label: 'Not sent', cls: 'text-rose-600' },
}

export function DaySeparator({ t }: { t: number }) {
  return (
    <div className="my-4 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-[11px] font-medium text-slate-500">{fmtDateShort(t)}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  )
}

export function sameDay(a: number, b: number) {
  return pktDateKey(a) === pktDateKey(b)
}

export function MessageBubble({ m, e, author, onRetry, onDiscard, canAct }: { m: EnquiryMessage; e: Enquiry; author: string; onRetry: () => void; onDiscard: () => void; canAct: boolean }) {
  const inbound = m.from === 'customer'
  const st = m.status ? STATUS[m.status] : null
  const kindLabel = m.kind === 'comment' ? 'Public comment' : m.kind === 'private-reply' ? 'Private reply' : m.kind === 'public-reply' ? 'Public reply' : null
  const KindIcon = m.kind === 'private-reply' ? Lock : Globe
  return (
    <div className={cn('flex', !inbound && 'justify-end')}>
      <div className={cn('max-w-[85%] sm:max-w-[72%]', !inbound && 'items-end')}>
        {kindLabel && (
          <p className={cn('mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-500', !inbound && 'justify-end')}>
            {m.kind !== 'comment' && <KindIcon className="size-3" />}{kindLabel}
          </p>
        )}
        <div className={cn(
          'rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap',
          inbound ? 'rounded-bl-md bg-slate-100 text-slate-800' : m.status === 'failed' ? 'rounded-br-md bg-white text-slate-800 ring-1 ring-rose-300' : m.kind === 'public-reply' ? 'rounded-br-md bg-emerald-600 text-white' : 'rounded-br-md bg-brand-600 text-white',
          m.status === 'sending' && 'opacity-75',
        )}>
          {m.text}
        </div>
        <p className={cn('mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500', !inbound && 'justify-end')}>
          <span>{inbound ? e.handle : author}</span>
          <span aria-hidden>·</span>
          <time>{fmtTime(m.at)}</time>
          {st && (
            <span className={cn('inline-flex items-center gap-0.5 font-medium', st.cls)}>
              <span aria-hidden>·</span><st.icon className="size-3" />{st.label}
            </span>
          )}
        </p>
        {m.status === 'failed' && (
          <div className="mt-1.5 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-800 ring-1 ring-rose-200" role="alert">
            <p>{m.error?.message ?? 'The message could not be sent.'}{m.error?.retryAfterSec ? ` Retry in about ${m.error.retryAfterSec}s.` : ''}</p>
            {canAct && (
              <div className="mt-1.5 flex justify-end gap-3">
                {m.error?.retryable !== false && <button onClick={onRetry} className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:underline"><RotateCcw className="size-3" />Retry</button>}
                <button onClick={onDiscard} className="inline-flex items-center gap-1 font-medium text-rose-700/80 hover:underline"><Trash2 className="size-3" />Remove</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ModeBadge({ live, checking }: { live: boolean; checking?: boolean }) {
  if (checking) return <Badge tone="neutral" icon={Clock}>Checking messaging server…</Badge>
  return live
    ? <Badge tone="green" dot>Live via Meta</Badge>
    : <span title="This conversation is simulated. Replies are not sent to Meta." className="inline-flex items-center gap-1 rounded-md bg-fuchsia-50 px-1.5 py-0.5 text-[11px] font-medium text-fuchsia-700 ring-1 ring-fuchsia-200 ring-inset">Simulated — not sent to Meta</span>
}
