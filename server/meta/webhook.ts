// Meta webhook handling: signature verification and payload normalisation.
// Messenger (object "page") and Instagram (object "instagram") events.

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { InboundEvent } from '../../src/messaging/contract.ts'
import type { Config } from '../config.ts'

/** Meta signs each delivery with HMAC-SHA256 of the raw body using the App Secret (X-Hub-Signature-256). */
export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const given = header.slice('sha256='.length)
  if (given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'))
}

/** GET handshake when the webhook is registered in the Meta app dashboard. */
export function verifySubscription(query: URLSearchParams, verifyToken: string | null): string | null {
  if (!verifyToken) return null
  if (query.get('hub.mode') === 'subscribe' && query.get('hub.verify_token') === verifyToken) return query.get('hub.challenge') ?? ''
  return null
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const ATTACHMENT_TEXT = '[Attachment — open the conversation in Meta to view it]'

/** Turn a webhook payload into CRM events. Unknown pages/accounts and unsupported items are skipped. */
export function normalise(payload: Json, cfg: Config): InboundEvent[] {
  const out: InboundEvent[] = []
  const object = payload?.object
  if (object !== 'page' && object !== 'instagram') return out
  const channel = object === 'page' ? 'messenger' : 'instagram'
  for (const entry of payload.entry ?? []) {
    const acc = cfg.accounts.find((a) => (channel === 'messenger' ? a.pageId : a.igUserId) === String(entry.id))
    if (!acc) continue
    const companyId = acc.companyId
    const ownId = String(entry.id)

    for (const ev of entry.messaging ?? []) {
      const senderId = String(ev.sender?.id ?? '')
      const recipientId = String(ev.recipient?.id ?? '')
      const at = Number(ev.timestamp ?? Date.now())
      if (ev.message) {
        if (ev.message.is_deleted || ev.message.is_unsupported) continue
        const text = ev.message.text ?? (ev.message.attachments ? ATTACHMENT_TEXT : '')
        if (!text) continue
        const echo = !!ev.message.is_echo || senderId === ownId
        out.push({ type: 'message', companyId, channel, senderId: echo ? ownId : senderId, recipientId: echo ? recipientId : ownId, text, externalId: String(ev.message.mid), at, echo })
      } else if (ev.delivery) {
        out.push({ type: 'delivery', companyId, channel, senderId, externalIds: (ev.delivery.mids ?? []).map(String), watermark: Number(ev.delivery.watermark ?? at) })
      } else if (ev.read) {
        // Messenger sends a watermark; Instagram sends the mid of the seen message — use the event time.
        out.push({ type: 'read', companyId, channel, senderId, watermark: Number(ev.read.watermark ?? at) })
      }
    }

    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {}
      if (channel === 'messenger' && ch.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
        if (String(v.from?.id) === ownId) continue // the Page's own comment
        out.push({ type: 'comment', companyId, channel, commentId: String(v.comment_id), senderId: String(v.from?.id ?? ''), senderName: String(v.from?.name ?? ''), text: String(v.message ?? ''), at: v.created_time ? Number(v.created_time) * 1000 : Date.now(), postId: v.post_id ? String(v.post_id) : undefined })
      }
      if (channel === 'instagram' && ch.field === 'comments') {
        if (String(v.from?.id) === ownId) continue
        out.push({ type: 'comment', companyId, channel, commentId: String(v.id), senderId: String(v.from?.id ?? ''), senderName: v.from?.username ? `@${v.from.username}` : '', text: String(v.text ?? ''), at: entry.time ? Number(entry.time) * (String(entry.time).length <= 10 ? 1000 : 1) : Date.now(), postId: v.media?.id ? String(v.media.id) : undefined })
      }
    }
  }
  return out
}

export function eventKey(e: InboundEvent): string | null {
  if (e.type === 'message') return `m:${e.externalId}`
  if (e.type === 'comment') return `c:${e.commentId}`
  return null // receipts are idempotent to apply
}
