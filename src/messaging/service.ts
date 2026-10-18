// Chooses a transport per conversation and drives the message lifecycle:
// queue (sending) → transport → sent / failed → (receipts) delivered / read.
//
// Live: only for conversations that arrived through a real Meta webhook AND whose company/channel
//       has credentials configured on the messaging server.
// Simulated: everything else. Simulated messages are labelled as such and never reach Meta.

import { create } from 'zustand'
import { useStore } from '@/store/store'
import { applyInbound, channelOf, completeReply, prepareRetry, queueReply, failure } from '@/domain/messaging'
import type { Enquiry, User } from '@/domain/types'
import type { ChannelStatus, InboundEvent, SendKind, SendRequest, SendResult, StatusResponse } from './contract'
import { connectEvents, fetchStatus, sendLive } from './http'
import type { Result } from '@/domain/engine'

interface Runtime {
  backend: 'checking' | 'offline' | 'online'
  status: StatusResponse | null
  events: 'closed' | 'open' | 'reconnecting'
  checkedAt: number | null
}

export const useMessagingRuntime = create<Runtime>(() => ({ backend: 'checking', status: null, events: 'closed', checkedAt: null }))

let disconnect: (() => void) | null = null

export async function checkMessagingServer() {
  useMessagingRuntime.setState({ backend: 'checking' })
  const status = await fetchStatus()
  useMessagingRuntime.setState({ backend: status ? 'online' : 'offline', status, checkedAt: Date.now() })
  if (status && !disconnect) {
    disconnect = connectEvents(
      (ev) => useStore.getState().run((d) => { applyInbound(d, ev, 'live') }),
      (s) => useMessagingRuntime.setState({ events: s }),
    )
  }
  if (!status && disconnect) { disconnect(); disconnect = null; useMessagingRuntime.setState({ events: 'closed' }) }
}

export function initMessaging() {
  void checkMessagingServer()
  setInterval(() => { void checkMessagingServer() }, 60_000)
}

export function channelStatus(e: Enquiry): ChannelStatus | undefined {
  return useMessagingRuntime.getState().status?.channels.find((c) => c.companyId === e.companyId && c.channel === channelOf(e.channel))
}

/** True when a reply in this conversation would really be sent to Meta. */
export function isLive(e: Enquiry): boolean {
  const rt = useMessagingRuntime.getState()
  return e.origin === 'live' && rt.backend === 'online' && !!channelStatus(e)?.live
}

function requestFor(e: Enquiry, messageId: string, kind: SendKind, text: string): SendRequest {
  return { clientMessageId: messageId, companyId: e.companyId, channel: channelOf(e.channel), kind, recipientId: e.platformUserId, commentId: e.commentId, text }
}

// ---------------------------------------------------------------- simulated transport

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function sendSimulated(e: Enquiry): Promise<SendResult> {
  await sleep(700 + Math.random() * 500)
  const { data, run } = useStore.getState()
  const conn = data.connections.find((c) => c.companyId === e.companyId && c.kind === 'meta_inbox')
  if (conn?.state === 'error') return { ok: false, error: failure('network', true, { message: 'The Meta inbox connection is in error (simulated). The message was not sent.' }) }
  const outcome = data.messagingSim.nextOutcome
  if (outcome !== 'success') {
    run((d) => { d.messagingSim.nextOutcome = 'success' }) // one-shot
    const retryable = outcome === 'rate_limited' || outcome === 'network' || outcome === 'unknown'
    return { ok: false, error: failure(outcome, retryable, outcome === 'rate_limited' ? { retryAfterSec: 30 } : {}) }
  }
  return { ok: true, externalId: `sim_mid_${Date.now().toString(36)}`, acceptedAt: Date.now(), recipientId: e.platformUserId }
}

/** Simulated delivery/read receipts. Messenger reports delivery and read; Instagram reports "seen". */
function simulateReceipts(e: Enquiry, kind: SendKind) {
  if (kind === 'public-reply') return
  const run = useStore.getState().run
  const base = { companyId: e.companyId, channel: channelOf(e.channel), senderId: e.platformUserId }
  if (base.channel === 'messenger') {
    setTimeout(() => run((d) => { applyInbound(d, { type: 'delivery', ...base, externalIds: [], watermark: d.clock.now }, 'simulated') }), 1500)
  }
  setTimeout(() => run((d) => { applyInbound(d, { type: 'read', ...base, watermark: d.clock.now }, 'simulated') }), 4500)
}

const CLIENT_LINES = ['Thanks! What would the total be for 2 adults?', 'Great, can you send the dates available?', 'Is breakfast included?', 'OK, my number is +44 7700 900456', 'Perfect, thank you 🙏']

/** Demo only: make the client send a message into this conversation. */
export function simulateClientReply(enquiryId: string) {
  const { data, run } = useStore.getState()
  const e = data.enquiries.find((x) => x.id === enquiryId)
  if (!e) return
  const ev: InboundEvent = {
    type: 'message', companyId: e.companyId, channel: channelOf(e.channel), senderId: e.platformUserId,
    text: CLIENT_LINES[Math.floor(Math.random() * CLIENT_LINES.length)], externalId: `sim_in_${Date.now().toString(36)}`, at: data.clock.now, echo: false,
  }
  run((d) => { applyInbound(d, ev, 'simulated') })
}

// ---------------------------------------------------------------- public API

async function deliver(enquiryId: string, messageId: string, user: User) {
  const e = useStore.getState().data.enquiries.find((x) => x.id === enquiryId)!
  const m = e.messages.find((x) => x.id === messageId)!
  let result: SendResult
  if (e.origin === 'live') {
    // A real client: never fall back to simulation. If live sending isn't available, fail visibly.
    const rt = useMessagingRuntime.getState()
    if (isLive(e)) result = await sendLive(requestFor(e, messageId, m.kind as SendKind, m.text), user)
    else if (rt.backend !== 'online') result = { ok: false, error: failure('network', true, { message: 'The messaging server is unreachable. The message was not sent.' }) }
    else result = { ok: false, error: failure('not_configured', false) }
  } else {
    result = await sendSimulated(e)
  }
  useStore.getState().run((d) => completeReply(d, enquiryId, messageId, result))
  if (result.ok && e.origin === 'simulated') simulateReceipts(e, m.kind as SendKind)
}

export async function sendReply(enquiryId: string, kind: SendKind, text: string, user: User): Promise<Result> {
  const e = useStore.getState().data.enquiries.find((x) => x.id === enquiryId)
  if (!e) return { ok: false, error: 'Conversation not found' }
  const res = useStore.getState().run((d) => queueReply(d, enquiryId, kind, text, user.id, e.origin === 'simulated'))
  if (!res.ok || !res.id) return res
  void deliver(enquiryId, res.id, user)
  return res
}

export async function retryReply(enquiryId: string, messageId: string, user: User): Promise<Result> {
  const res = useStore.getState().run((d) => prepareRetry(d, enquiryId, messageId))
  if (!res.ok) return res
  void deliver(enquiryId, messageId, user)
  return res
}
