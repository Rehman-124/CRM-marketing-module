import { useEffect, useRef, useState } from 'react'
import { Globe, Lock, MessageCircle, Send, Clock, Info } from 'lucide-react'
import { cn, Segmented } from '../ui'
import { toast } from '../ui/overlay'
import type { Enquiry, User } from '@/domain/types'
import { isCommentThread, replyOptions, textLimit } from '@/domain/messaging'
import { sendReply } from '@/messaging/service'
import type { SendKind } from '@/messaging/contract'
import { fmtDateTime, fmtDuration } from '@/lib/time'

const KIND_LABEL: Record<SendKind, string> = { dm: 'Direct message', 'private-reply': 'Private reply', 'public-reply': 'Public reply' }

export function Composer({ e, me, now, live, connectionError }: { e: Enquiry; me: User; now: number; live: boolean; connectionError: boolean }) {
  const opts = replyOptions(e, now)
  const comment = isCommentThread(e)
  const available: SendKind[] = comment ? (['private-reply', 'public-reply', 'dm'] as SendKind[]).filter((k) => k !== 'dm' || opts.dm.allowed || e.lastInboundDmAt !== null) : ['dm']
  const preferred = (): SendKind => (comment ? (opts['private-reply'].allowed ? 'private-reply' : opts.dm.allowed ? 'dm' : 'public-reply') : 'dm')
  const [kind, setKind] = useState<SendKind>(preferred)
  const [text, setText] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  // Reset when switching conversations
  useEffect(() => { setKind(preferred()); setText('') }, [e.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!available.includes(kind)) setKind(preferred()) }) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = area.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px' }
  }, [text])

  const opt = opts[kind]
  const limit = textLimit(e, kind)
  const tooLong = text.trim().length > limit
  const canSend = opt.allowed && !!text.trim() && !tooLong

  const send = async () => {
    if (!canSend) return
    const res = await sendReply(e.id, kind, text, me)
    if (!res.ok) toast.error('Message not sent', res.error)
    else setText('')
  }

  return (
    <div className="border-t border-slate-200 bg-white px-3 pt-2.5 pb-3 sm:px-4">
      {connectionError && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] text-rose-800 ring-1 ring-rose-200" role="status">
          <Info className="mt-0.5 size-3.5 shrink-0" />The Meta inbox connection for this company is in error. Messages may fail to send until it is fixed.
        </p>
      )}
      {comment && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={kind} onChange={setKind} options={available.map((k) => ({ value: k, label: <span className="inline-flex items-center gap-1">{k === 'private-reply' ? <Lock className="size-3" /> : k === 'public-reply' ? <Globe className="size-3" /> : <MessageCircle className="size-3" />}{KIND_LABEL[k]}</span> }))} />
        </div>
      )}
      <p className={cn('mb-1.5 flex items-start gap-1.5 text-[12px]', opt.allowed ? 'text-slate-500' : 'text-amber-800')}>
        <Clock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {!opt.allowed ? opt.reason
            : kind === 'dm' ? `Reply window open — closes in ${fmtDuration(opt.closesAt! - now)} (24 hours after the client’s last message).`
              : kind === 'private-reply' ? `Sends one private message to ${e.handle}. Allowed once, until ${fmtDateTime(opt.closesAt!)}.`
                : 'Posts publicly under the comment. Anyone who can see the post can read it.'}
        </span>
      </p>
      <div className={cn('flex items-end gap-2 rounded-xl bg-white p-1.5 ring-1 ring-slate-200 transition focus-within:ring-2 focus-within:ring-brand-500', !opt.allowed && 'bg-slate-50')}>
        <label htmlFor={`composer-${e.id}`} className="sr-only">{KIND_LABEL[kind]} to {e.handle}</label>
        <textarea
          id={`composer-${e.id}`}
          ref={area}
          rows={1}
          value={text}
          disabled={!opt.allowed}
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void send() } }}
          placeholder={opt.allowed ? `${KIND_LABEL[kind]} to ${e.handle}…` : 'Replying is not possible right now'}
          className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[13.5px] text-slate-900 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300', kind === 'public-reply' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-brand-600 hover:bg-brand-700')}
        >
          <Send className="size-4" />{kind === 'public-reply' ? 'Post publicly' : 'Send'}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{live ? 'Delivered through Meta.' : 'Simulated conversation — replies are not sent to Meta.'} Enter to send · Shift+Enter for a new line</span>
        <span className={cn('tabular-nums', tooLong && 'font-semibold text-rose-600')}>{text.trim().length} / {limit}</span>
      </div>
    </div>
  )
}
