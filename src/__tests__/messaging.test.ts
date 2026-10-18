import { beforeEach, describe, expect, test } from 'vitest'
import { createBaseData } from '@/domain/seed'
import * as E from '@/domain/engine'
import { applyInbound, canReply, completeReply, prepareRetry, queueReply, replyOptions } from '@/domain/messaging'
import type { AppData, Enquiry } from '@/domain/types'
import { fromPkt, HOUR, DAY } from '@/lib/time'

let S: AppData
const user = (id: string) => E.userById(S, id)!
const dm = (company: 'flightnest' | 'travelope' = 'flightnest') => E.createEnquiry(S, { companyId: company, channel: 'instagram_dm', handle: '@client', text: 'Hi, can I know more?' })
const comment = () => E.createEnquiry(S, { companyId: 'flightnest', channel: 'facebook_comment', handle: 'Client', text: 'Price?' })
const ok = { ok: true as const, externalId: 'mid.1', acceptedAt: 0 }
const queued = (r: E.Result) => { if (!r.ok) throw new Error(r.error); return { id: r.id! } }

beforeEach(() => {
  S = createBaseData()
  S.clock.now = fromPkt(2026, 10, 18, 15, 0)
})

describe('who can reply (product-owner decision, 18 Oct 2026)', () => {
  test('Marketing for own companies and Admin; not view-only, Team Lead or Sales Agent', () => {
    const own = dm('flightnest')
    const viewOnly = dm('travelope') // Hamza has Travelope view-only
    expect(canReply(user('u-mkt1'), own)).toBe(true)
    expect(canReply(user('u-mkt1'), viewOnly)).toBe(false)
    expect(canReply(user('u-admin'), viewOnly)).toBe(true)
    expect(canReply(user('u-tl-flightnest'), own)).toBe(false)
    expect(canReply(user('u-flightnest-1'), own)).toBe(false)
    expect(queueReply(S, viewOnly.id, 'dm', 'hello', 'u-mkt1', true).ok).toBe(false)
  })
})

describe('Meta reply windows', () => {
  test('DM: open for 24h after the client’s last message, then closed', () => {
    const e = dm()
    expect(replyOptions(e, S.clock.now).dm.allowed).toBe(true)
    expect(replyOptions(e, S.clock.now + 23 * HOUR).dm.allowed).toBe(true)
    expect(replyOptions(e, S.clock.now + 24 * HOUR).dm.allowed).toBe(false)
    S.clock.now += 25 * HOUR
    expect(queueReply(S, e.id, 'dm', 'late', 'u-mkt1', true).ok).toBe(false)
  })

  test('A new client message reopens the window', () => {
    const e = dm()
    S.clock.now += 30 * HOUR
    applyInbound(S, { type: 'message', companyId: 'flightnest', channel: 'instagram', senderId: e.platformUserId, text: 'Still there?', externalId: 'in.2', at: S.clock.now, echo: false }, 'simulated')
    expect(replyOptions(e, S.clock.now).dm.allowed).toBe(true)
    expect(e.read).toBe(false)
  })

  test('Comment: one private reply within 7 days; public replies any time; DM only after the client answers', () => {
    const e = comment()
    let o = replyOptions(e, S.clock.now)
    expect(o['private-reply'].allowed).toBe(true)
    expect(o['public-reply'].allowed).toBe(true)
    expect(o.dm.allowed).toBe(false)
    const q = queued(queueReply(S, e.id, 'private-reply', 'Sent you a message', 'u-mkt1', true))
    completeReply(S, e.id, q.id, { ...ok, recipientId: 'psid-123' })
    o = replyOptions(e, S.clock.now)
    expect(o['private-reply'].allowed).toBe(false)
    expect(e.platformUserId).toBe('psid-123')
    // the commenter answers privately → the thread continues as a DM
    applyInbound(S, { type: 'message', companyId: 'flightnest', channel: 'messenger', senderId: 'psid-123', text: 'Thanks!', externalId: 'in.9', at: S.clock.now, echo: false })
    expect(e.messages.at(-1)!.text).toBe('Thanks!')
    expect(replyOptions(e, S.clock.now).dm.allowed).toBe(true)
    const late = comment()
    expect(replyOptions(late, S.clock.now + 8 * DAY)['private-reply'].allowed).toBe(false)
    expect(replyOptions(late, S.clock.now + 8 * DAY)['public-reply'].allowed).toBe(true)
  })

  test('Text limits per channel (Instagram 1000, Messenger 2000)', () => {
    const e = dm()
    expect(queueReply(S, e.id, 'dm', 'x'.repeat(1001), 'u-mkt1', true).ok).toBe(false)
    expect(queueReply(S, e.id, 'dm', 'x'.repeat(1000), 'u-mkt1', true).ok).toBe(true)
  })
})

describe('message lifecycle', () => {
  test('sending → sent → delivered → read', () => {
    const e = E.createEnquiry(S, { companyId: 'flightnest', channel: 'facebook_dm', handle: 'C', text: 'hi' })
    const q = queued(queueReply(S, e.id, 'dm', 'Hello!', 'u-mkt1', true))
    const m = () => e.messages.find((x) => x.id === q.id)!
    expect(m().status).toBe('sending')
    completeReply(S, e.id, q.id, { ...ok, externalId: 'mid.A' })
    expect(m().status).toBe('sent')
    applyInbound(S, { type: 'delivery', companyId: 'flightnest', channel: 'messenger', senderId: e.platformUserId, externalIds: ['mid.A'], watermark: S.clock.now })
    expect(m().status).toBe('delivered')
    applyInbound(S, { type: 'read', companyId: 'flightnest', channel: 'messenger', senderId: e.platformUserId, watermark: S.clock.now })
    expect(m().status).toBe('read')
    expect(S.audit.at(-1)!.type).toBe('message')
  })

  test('failed → retry only when retryable', () => {
    const e = dm()
    const q = queued(queueReply(S, e.id, 'dm', 'Hello', 'u-mkt1', true))
    completeReply(S, e.id, q.id, { ok: false, error: { code: 'rate_limited', message: 'slow down', retryable: true } })
    expect(e.messages.at(-1)!.status).toBe('failed')
    expect(prepareRetry(S, e.id, q.id).ok).toBe(true)
    expect(e.messages.at(-1)!.status).toBe('sending')
    completeReply(S, e.id, q.id, { ok: false, error: { code: 'token_invalid', message: 'expired', retryable: false } })
    expect(prepareRetry(S, e.id, q.id).ok).toBe(false)
  })

  test('conversation stays open for replies after conversion to a Lead', () => {
    const e: Enquiry = dm()
    e.fields = { nationality: 'British', fullName: 'Client Name', phone: '+44 7700 900000', email: '', city: '', tripDetails: '' }
    expect(E.convertEnquiry(S, e.id, 'u-mkt1').ok).toBe(true)
    expect(queueReply(S, e.id, 'dm', 'Your agent will call you', 'u-mkt1', true).ok).toBe(true)
  })
})

describe('clocks', () => {
  test('live conversations use real time; simulated ones use the demo clock', () => {
    const live = E.createEnquiry(S, { companyId: 'flightnest', channel: 'facebook_dm', handle: 'C', text: 'hi', origin: 'live', platformUserId: 'psid-r', at: Date.now() })
    const q = queued(queueReply(S, live.id, 'dm', 'reply', 'u-mkt1', false))
    const m = live.messages.find((x) => x.id === q.id)!
    expect(Math.abs(m.at - Date.now())).toBeLessThan(5000)
    expect(m.at).toBeGreaterThanOrEqual(live.messages[0].at) // never stamped before the client's message
    const sim = dm()
    const q2 = queued(queueReply(S, sim.id, 'dm', 'reply', 'u-mkt1', true))
    expect(sim.messages.find((x) => x.id === q2.id)!.at).toBe(S.clock.now)
  })
})

describe('inbound sync from Meta', () => {
  test('a message from an unknown client starts a new live conversation; duplicates are ignored', () => {
    const ev = { type: 'message' as const, companyId: 'holidaynest' as const, channel: 'messenger' as const, senderId: 'psid-9', text: 'Hello', externalId: 'mid.X', at: S.clock.now, echo: false }
    const id = applyInbound(S, ev)
    const e = S.enquiries.find((x) => x.id === id)!
    expect(e.origin).toBe('live')
    expect(e.channel).toBe('facebook_dm')
    expect(e.status).toBe('open')
    expect(S.leads.length).toBe(0) // stays an Unqualified Enquiry (MKT-BR-002)
    expect(applyInbound(S, ev)).toBeNull()
    expect(e.messages.length).toBe(1)
  })

  test('echo of a reply sent from the CRM is not duplicated; a reply sent from Meta’s inbox is added', () => {
    const e = E.createEnquiry(S, { companyId: 'flightnest', channel: 'facebook_dm', handle: 'C', text: 'hi', platformUserId: 'psid-1', origin: 'live' })
    const q = queued(queueReply(S, e.id, 'dm', 'From CRM', 'u-mkt1', false))
    completeReply(S, e.id, q.id, { ...ok, externalId: 'mid.CRM' })
    applyInbound(S, { type: 'message', companyId: 'flightnest', channel: 'messenger', senderId: 'page', recipientId: 'psid-1', text: 'From CRM', externalId: 'mid.CRM', at: S.clock.now, echo: true })
    expect(e.messages.filter((m) => m.text === 'From CRM').length).toBe(1)
    applyInbound(S, { type: 'message', companyId: 'flightnest', channel: 'messenger', senderId: 'page', recipientId: 'psid-1', text: 'From Business Suite', externalId: 'mid.META', at: S.clock.now, echo: true })
    expect(e.messages.at(-1)!.via).toBe('meta')
  })

  test('a new comment becomes a comment conversation', () => {
    const id = applyInbound(S, { type: 'comment', companyId: 'trip2go', channel: 'instagram', commentId: 'c-1', senderId: 'ig-5', senderName: '@sam', text: 'How much?', at: S.clock.now })
    const e = S.enquiries.find((x) => x.id === id)!
    expect(e.channel).toBe('instagram_comment')
    expect(e.commentId).toBe('c-1')
    expect(replyOptions(e, S.clock.now)['private-reply'].allowed).toBe(true)
  })
})
