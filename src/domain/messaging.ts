// Two-way messaging rules for the Marketing Inbox. Pure functions over AppData (like engine.ts).
// Business decisions not in the FRD were made by the product owner on 18 Oct 2026:
//  - Marketing employees (own companies) and Admin / CRM Manager may reply.
//  - A conversation stays open for replies after it is converted to a Lead.
//  - Comments can receive Meta's one private reply and public replies.
// Everything else here is a Meta platform constraint, not a business rule.

import { ERROR_TEXT, MESSAGING_LIMITS, mayReply, type InboundEvent, type MessagingChannel, type MessagingError, type SendKind, type SendResult } from '../messaging/contract'
import { createEnquiry, nextId, userById, companyName, type Result } from './engine'
import type { AppData, Enquiry, EnquiryChannel, EnquiryMessage, User } from './types'
import { SOURCE_LABEL } from './constants'

export const channelOf = (c: EnquiryChannel): MessagingChannel => (c.startsWith('facebook') ? 'messenger' : 'instagram')
export const isCommentThread = (e: Enquiry) => e.channel.endsWith('comment')

/**
 * The clock a conversation runs on. Real (live) conversations use real time — Meta's timestamps and
 * reply windows are real. Simulated conversations follow the demo clock like the rest of the prototype.
 */
export function threadNow(S: AppData, e: Enquiry): number {
  return e.origin === 'live' ? Date.now() : S.clock.now
}

export function canReply(u: User, e: Enquiry): boolean {
  return mayReply(u, e.companyId)
}

export interface ReplyOption {
  allowed: boolean
  reason?: string
  /** When the option stops being available (reply windows) */
  closesAt?: number
}

/** What a reply can be right now, given Meta's messaging windows. */
export function replyOptions(e: Enquiry, now: number): Record<SendKind, ReplyOption> {
  const comment = isCommentThread(e)
  const dmCloses = e.lastInboundDmAt !== null ? e.lastInboundDmAt + MESSAGING_LIMITS.dmWindowMs : undefined
  let dm: ReplyOption
  if (e.lastInboundDmAt === null) {
    dm = { allowed: false, reason: comment ? 'Send a private reply first. If the client answers it, the conversation continues here as a direct message.' : 'Waiting for a message from the client.' }
  } else if (now < dmCloses!) {
    dm = { allowed: true, closesAt: dmCloses }
  } else {
    dm = { allowed: false, closesAt: dmCloses, reason: ERROR_TEXT.outside_window }
  }
  if (!comment) return { dm, 'private-reply': { allowed: false, reason: 'Private replies apply to comments only.' }, 'public-reply': { allowed: false, reason: 'Public replies apply to comments only.' } }

  const commentAt = e.messages.find((m) => m.kind === 'comment')?.at ?? e.createdAt
  const prCloses = commentAt + MESSAGING_LIMITS.privateReplyWindowMs
  const privateReply: ReplyOption = e.privateReplyAt
    ? { allowed: false, reason: ERROR_TEXT.private_reply_used }
    : now < prCloses
      ? { allowed: true, closesAt: prCloses }
      : { allowed: false, closesAt: prCloses, reason: 'Private replies are only possible within 7 days of the comment.' }
  return { dm, 'private-reply': privateReply, 'public-reply': { allowed: true } }
}

export function textLimit(e: Enquiry, kind: SendKind): number {
  return kind === 'public-reply' ? MESSAGING_LIMITS.maxPublicReply : MESSAGING_LIMITS.maxText[channelOf(e.channel)]
}

/** Add an outbound message in the 'sending' state. Returns its id. */
export function queueReply(S: AppData, enquiryId: string, kind: SendKind, text: string, userId: string, simulated: boolean): Result {
  const e = S.enquiries.find((x) => x.id === enquiryId)
  if (!e) return { ok: false, error: 'Conversation not found' }
  const u = userById(S, userId)
  if (!u || !canReply(u, e)) return { ok: false, error: ERROR_TEXT.forbidden }
  const now = threadNow(S, e)
  const opt = replyOptions(e, now)[kind]
  if (!opt.allowed) return { ok: false, error: opt.reason ?? 'This reply is not possible right now.' }
  const body = text.trim()
  if (!body) return { ok: false, error: 'Write a message first.' }
  if (body.length > textLimit(e, kind)) return { ok: false, error: `Messages are limited to ${textLimit(e, kind)} characters on this channel.` }
  const m: EnquiryMessage = { id: nextId(S, 'msg'), from: 'marketing', kind, text: body, at: now, byUserId: userId, via: 'crm', status: 'sending', simulated }
  e.messages.push(m)
  e.lastActivityAt = m.at
  return { ok: true, id: m.id }
}

/** Record the transport's answer for a queued message. */
export function completeReply(S: AppData, enquiryId: string, messageId: string, result: SendResult) {
  const e = S.enquiries.find((x) => x.id === enquiryId)
  const m = e?.messages.find((x) => x.id === messageId)
  if (!e || !m) return
  if (result.ok) {
    m.status = 'sent'
    m.externalId = result.externalId
    m.error = undefined
    if (m.kind === 'private-reply') {
      e.privateReplyAt = m.at
      // Meta returns the commenter's messaging id with the private reply; later DMs from them join this thread.
      if (result.recipientId) e.platformUserId = result.recipientId
    }
    const kindLabel = m.kind === 'dm' ? SOURCE_LABEL[e.channel] : m.kind === 'private-reply' ? 'private reply' : 'public reply'
    S.audit.push({
      id: nextId(S, 'au'), at: threadNow(S, e), type: 'message', actorId: m.byUserId ?? 'system', companyId: e.companyId,
      summary: `${userById(S, m.byUserId)?.name ?? 'User'} sent a ${kindLabel} on ${e.ref}${m.simulated ? ' (simulated — not sent to Meta)' : ''}`,
    })
  } else {
    m.status = 'failed'
    m.error = result.error
  }
}

/** Put a failed message back into 'sending' so it can be re-sent with the same client id. */
export function prepareRetry(S: AppData, enquiryId: string, messageId: string): Result {
  const e = S.enquiries.find((x) => x.id === enquiryId)
  const m = e?.messages.find((x) => x.id === messageId)
  if (!e || !m || m.status !== 'failed') return { ok: false, error: 'Only failed messages can be retried.' }
  if (m.error && !m.error.retryable) return { ok: false, error: m.error.message }
  const opt = replyOptions(e, threadNow(S, e))[m.kind as SendKind]
  if (!opt.allowed) return { ok: false, error: opt.reason ?? 'This reply is no longer possible.' }
  m.status = 'sending'
  m.error = undefined
  return { ok: true, id: m.id }
}

export function discardFailed(S: AppData, enquiryId: string, messageId: string) {
  const e = S.enquiries.find((x) => x.id === enquiryId)
  if (!e) return
  e.messages = e.messages.filter((m) => !(m.id === messageId && m.status === 'failed'))
}

function threadFor(S: AppData, companyId: string, channel: MessagingChannel, userId: string): Enquiry | undefined {
  return S.enquiries
    .filter((e) => e.companyId === companyId && channelOf(e.channel) === channel && e.platformUserId === userId)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0]
}

const shortId = (id: string) => `…${id.slice(-4)}`

/** Apply an event pushed by the messaging server (Meta webhook) or by the simulation. Returns the affected conversation id. */
export function applyInbound(S: AppData, ev: InboundEvent, origin: 'live' | 'simulated' = 'live'): string | null {
  const allMsgs = () => S.enquiries.flatMap((e) => e.messages)
  if (ev.type === 'message') {
    if (ev.externalId && allMsgs().some((m) => m.externalId === ev.externalId)) return null // already have it (e.g. echo of a CRM send)
    if (ev.echo) {
      // Sent by the page from Meta's own inbox — show it so the thread stays complete.
      const e = ev.recipientId ? threadFor(S, ev.companyId, ev.channel, ev.recipientId) : undefined
      if (!e) return null
      e.messages.push({ id: nextId(S, 'msg'), from: 'marketing', kind: 'dm', text: ev.text, at: ev.at, via: 'meta', status: 'sent', externalId: ev.externalId, simulated: origin === 'simulated' })
      e.lastActivityAt = Math.max(e.lastActivityAt, ev.at)
      return e.id
    }
    const e = threadFor(S, ev.companyId, ev.channel, ev.senderId)
    if (!e) {
      const created = createEnquiry(S, {
        companyId: ev.companyId, channel: ev.channel === 'messenger' ? 'facebook_dm' : 'instagram_dm',
        handle: ev.senderName ?? `${ev.channel === 'messenger' ? 'Messenger' : 'Instagram'} user ${shortId(ev.senderId)}`,
        text: ev.text, origin, platformUserId: ev.senderId, messageExternalId: ev.externalId, at: ev.at,
      })
      return created.id
    }
    e.messages.push({ id: nextId(S, 'msg'), from: 'customer', kind: 'dm', text: ev.text, at: ev.at, externalId: ev.externalId })
    e.lastInboundDmAt = ev.at
    e.lastActivityAt = Math.max(e.lastActivityAt, ev.at)
    e.read = false
    return e.id
  }
  if (ev.type === 'comment') {
    const existing = S.enquiries.find((e) => e.commentId === ev.commentId)
    if (existing) return null
    const created = createEnquiry(S, {
      companyId: ev.companyId, channel: ev.channel === 'messenger' ? 'facebook_comment' : 'instagram_comment',
      handle: ev.senderName || `Commenter ${shortId(ev.senderId)}`, text: ev.text, origin,
      platformUserId: ev.senderId, commentId: ev.commentId, messageExternalId: ev.commentId, at: ev.at,
      postContext: ev.postId ? `Comment on post ${ev.postId} · ${companyName(S, ev.companyId)}` : undefined,
    })
    return created.id
  }
  // Delivery and read receipts update outbound messages in the client's thread.
  const e = threadFor(S, ev.companyId, ev.channel, ev.senderId)
  if (!e) return null
  for (const m of e.messages) {
    if (m.from !== 'marketing' || m.kind === 'public-reply') continue
    if (ev.type === 'delivery' && m.status === 'sent' && ((m.externalId && ev.externalIds.includes(m.externalId)) || m.at <= ev.watermark)) m.status = 'delivered'
    if (ev.type === 'read' && (m.status === 'sent' || m.status === 'delivered') && m.at <= ev.watermark) m.status = 'read'
  }
  return e.id
}

export function lastMessage(e: Enquiry) {
  return e.messages[e.messages.length - 1]
}

export function hasFailedSend(e: Enquiry) {
  return e.messages.some((m) => m.status === 'failed')
}

export function failure(code: MessagingError['code'], retryable: boolean, extra: Partial<MessagingError> = {}): MessagingError {
  return { code, message: ERROR_TEXT[code], retryable, ...extra }
}
