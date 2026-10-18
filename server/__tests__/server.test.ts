// Messaging server tests. Meta is replaced by a local mock Graph API server — no real Meta calls.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHmac } from 'node:crypto'
import { createMessagingServer } from '../app.ts'
import { loadConfig, type Config } from '../config.ts'
import { normalise, verifySignature, verifySubscription } from '../meta/webhook.ts'
import { buildRequest, mapGraphError, sendToMeta } from '../meta/graph.ts'
import type { InboundEvent, SendRequest } from '../../src/messaging/contract.ts'

const SECRET = 'test-app-secret'
const TOKEN = 'PAGE-TOKEN-SECRET-123'
const baseEnv = (graphBase = 'http://graph.invalid') => ({
  META_APP_SECRET: SECRET, META_VERIFY_TOKEN: 'verify-me', META_GRAPH_BASE: graphBase,
  META_ACCOUNTS: JSON.stringify([{ companyId: 'flightnest', pageId: 'PAGE1', pageToken: TOKEN, igUserId: 'IG1' }, { companyId: 'holidaynest', pageId: 'PAGE2', pageToken: 'tok2' }]),
})
const sign = (body: string) => 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')

describe('webhook security', () => {
  test('signature: valid accepted, tampered or missing rejected', () => {
    const body = Buffer.from('{"object":"page"}')
    expect(verifySignature(body, sign(body.toString()), SECRET)).toBe(true)
    expect(verifySignature(Buffer.from('{"object":"pagex"}'), sign(body.toString()), SECRET)).toBe(false)
    expect(verifySignature(body, undefined, SECRET)).toBe(false)
    expect(verifySignature(body, 'sha256=abc', SECRET)).toBe(false)
  })
  test('subscription handshake needs the verify token', () => {
    const q = (t: string) => new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': t, 'hub.challenge': '42' })
    expect(verifySubscription(q('verify-me'), 'verify-me')).toBe('42')
    expect(verifySubscription(q('wrong'), 'verify-me')).toBeNull()
    expect(verifySubscription(q('verify-me'), null)).toBeNull()
  })
})

describe('webhook payload normalisation', () => {
  const { config } = loadConfig(baseEnv())
  test('Messenger message, echo, delivery and read', () => {
    const ev = normalise({ object: 'page', entry: [{ id: 'PAGE1', messaging: [
      { sender: { id: 'PSID1' }, recipient: { id: 'PAGE1' }, timestamp: 1000, message: { mid: 'm1', text: 'Hi' } },
      { sender: { id: 'PAGE1' }, recipient: { id: 'PSID1' }, timestamp: 2000, message: { mid: 'm2', text: 'Hello from Suite', is_echo: true } },
      { sender: { id: 'PSID1' }, recipient: { id: 'PAGE1' }, timestamp: 3000, delivery: { mids: ['m2'], watermark: 2500 } },
      { sender: { id: 'PSID1' }, recipient: { id: 'PAGE1' }, timestamp: 4000, read: { watermark: 3500 } },
      { sender: { id: 'PSID1' }, recipient: { id: 'PAGE1' }, timestamp: 5000, message: { mid: 'm3', attachments: [{ type: 'image' }] } },
    ] }] }, config)
    expect(ev.map((e) => e.type)).toEqual(['message', 'message', 'delivery', 'read', 'message'])
    expect(ev[0]).toMatchObject({ companyId: 'flightnest', channel: 'messenger', senderId: 'PSID1', echo: false, externalId: 'm1' })
    expect(ev[1]).toMatchObject({ echo: true, recipientId: 'PSID1' })
    expect((ev[4] as Extract<InboundEvent, { type: 'message' }>).text).toMatch(/Attachment/)
  })
  test('Instagram DM and comment; Facebook comment; own comments and unknown pages skipped', () => {
    const ig = normalise({ object: 'instagram', entry: [{ id: 'IG1', time: 1700000000, messaging: [{ sender: { id: 'IGSID' }, recipient: { id: 'IG1' }, timestamp: 1, message: { mid: 'g1', text: 'yo' } }], changes: [{ field: 'comments', value: { id: 'C9', text: 'price?', from: { id: 'IGSID2', username: 'sam' }, media: { id: 'MEDIA' } } }] }] }, config)
    expect(ig[0]).toMatchObject({ type: 'message', channel: 'instagram', companyId: 'flightnest' })
    expect(ig[1]).toMatchObject({ type: 'comment', commentId: 'C9', senderName: '@sam' })
    const fb = normalise({ object: 'page', entry: [{ id: 'PAGE2', changes: [
      { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'FC1', post_id: 'P1', from: { id: 'U1', name: 'Ann' }, message: 'Info pls', created_time: 1700000000 } },
      { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'FC2', from: { id: 'PAGE2', name: 'HolidayNest' }, message: 'our reply' } },
    ] }] }, config)
    expect(fb).toHaveLength(1)
    expect(fb[0]).toMatchObject({ companyId: 'holidaynest', commentId: 'FC1', at: 1700000000000 })
    expect(normalise({ object: 'page', entry: [{ id: 'UNKNOWN', messaging: [{ sender: { id: 'x' }, message: { mid: 'q', text: 'hi' } }] }] }, config)).toHaveLength(0)
  })
})

describe('Graph API client', () => {
  const { config } = loadConfig(baseEnv('https://graph.facebook.com'))
  const acc = config.accounts[0]
  const req = (kind: SendRequest['kind'], channel: SendRequest['channel'] = 'messenger'): SendRequest => ({ clientMessageId: 'c1', companyId: 'flightnest', channel, kind, recipientId: 'PSID1', commentId: 'CMT1', text: 'Hello' })
  test('builds the documented endpoints and bodies', () => {
    expect(buildRequest(config, acc, req('dm'))).toEqual({ url: 'https://graph.facebook.com/v21.0/PAGE1/messages', body: { recipient: { id: 'PSID1' }, messaging_type: 'RESPONSE', message: { text: 'Hello' } } })
    expect(buildRequest(config, acc, req('private-reply'))).toEqual({ url: 'https://graph.facebook.com/v21.0/PAGE1/messages', body: { recipient: { comment_id: 'CMT1' }, message: { text: 'Hello' } } })
    expect(buildRequest(config, acc, req('public-reply')).url).toBe('https://graph.facebook.com/v21.0/CMT1/comments')
    expect(buildRequest(config, acc, req('public-reply', 'instagram')).url).toBe('https://graph.facebook.com/v21.0/CMT1/replies')
  })
  test('maps Meta errors', () => {
    const h = new Headers()
    expect(mapGraphError(400, { error: { code: 10, error_subcode: 2018278 } }, h)).toMatchObject({ code: 'outside_window', retryable: false })
    expect(mapGraphError(400, { error: { code: 613 } }, new Headers({ 'x-business-use-case-usage': JSON.stringify({ PAGE1: [{ estimated_time_to_regain_access: 5 }] }) }))).toMatchObject({ code: 'rate_limited', retryable: true, retryAfterSec: 300 })
    expect(mapGraphError(401, { error: { code: 190 } }, h)).toMatchObject({ code: 'token_invalid', retryable: false })
    expect(mapGraphError(403, { error: { code: 200, message: 'Requires pages_messaging permission' } }, h).message).toMatch(/pages_messaging/)
    expect(mapGraphError(400, { error: { code: 551 } }, h).code).toBe('recipient_unavailable')
    expect(mapGraphError(502, null, h)).toMatchObject({ code: 'unknown', retryable: true })
  })
  test('retries 5xx, does not retry rate limits, keeps the token out of errors', async () => {
    let calls = 0
    const flaky = (async () => { calls++; return calls < 2 ? new Response('{}', { status: 503 }) : Response.json({ recipient_id: 'PSID1', message_id: 'mid.ok' }) }) as unknown as typeof fetch
    expect(await sendToMeta(config, acc, req('dm'), { fetch: flaky, backoffMs: [1, 1] })).toMatchObject({ ok: true, externalId: 'mid.ok', recipientId: 'PSID1' })
    expect(calls).toBe(2)
    calls = 0
    const limited = (async () => { calls++; return Response.json({ error: { code: 4, message: 'limit' } }, { status: 400 }) }) as unknown as typeof fetch
    const r = await sendToMeta(config, acc, req('dm'), { fetch: limited, backoffMs: [1, 1] })
    expect(calls).toBe(1)
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain(TOKEN)
    const down = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    expect(await sendToMeta(config, acc, req('dm'), { fetch: down, backoffMs: [1] })).toMatchObject({ ok: false, error: { code: 'network', retryable: true } })
  })
})

describe('messaging server end to end (mock Graph API)', () => {
  let graph: Server, app: Server, base = '', publish: (e: InboundEvent) => void
  const graphCalls: { url: string; auth: string; body: unknown }[] = []
  let cfg: Config

  beforeAll(async () => {
    graph = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      graphCalls.push({ url: req.url!, auth: String(req.headers.authorization), body: JSON.parse(Buffer.concat(chunks).toString() || '{}') })
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ recipient_id: 'PSID1', message_id: `mid.${graphCalls.length}` }))
    })
    await new Promise<void>((r) => graph.listen(0, '127.0.0.1', r))
    cfg = loadConfig(baseEnv(`http://127.0.0.1:${(graph.address() as AddressInfo).port}`)).config
    const made = createMessagingServer(cfg, { log: () => {}, backoffMs: [1] })
    app = made.server
    publish = made.publish
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
  })
  afterAll(() => { app.close(); graph.close() })

  const send = (body: Partial<SendRequest>, user: object | null = { id: 'u-mkt1', role: 'marketing', companyIds: ['flightnest', 'holidaynest', 'trip2go'] }) =>
    fetch(`${base}/api/messaging/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { 'X-CRM-User': JSON.stringify(user) } : {}) }, body: JSON.stringify({ clientMessageId: crypto.randomUUID(), companyId: 'flightnest', channel: 'messenger', kind: 'dm', recipientId: 'PSID1', text: 'Hello', ...body }) })

  test('status lists live channels without exposing secrets', async () => {
    const res = await fetch(`${base}/api/messaging/status`)
    const text = await res.text()
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain(SECRET)
    const body = JSON.parse(text)
    expect(body.channels.find((c: { companyId: string; channel: string }) => c.companyId === 'flightnest' && c.channel === 'instagram').live).toBe(true)
    expect(body.channels.find((c: { companyId: string; channel: string }) => c.companyId === 'holidaynest' && c.channel === 'instagram').live).toBe(false)
  })

  test('permission: unauthenticated 401, Sales Agent 403, view-only company 403, Admin allowed', async () => {
    expect((await send({}, null)).status).toBe(401)
    expect((await send({}, { id: 'a', role: 'agent', companyIds: ['flightnest'] })).status).toBe(403)
    expect((await send({ companyId: 'travelope' })).status).toBe(403)
    expect(await (await send({}, { id: 'u-admin', role: 'admin', companyIds: [] })).json()).toMatchObject({ ok: true })
  })

  test('not configured channel is reported, never sent', async () => {
    const before = graphCalls.length
    expect(await (await send({ companyId: 'trip2go' })).json()).toMatchObject({ ok: false, error: { code: 'not_configured' } })
    expect(graphCalls.length).toBe(before)
  })

  test('send reaches Graph with the server-held token; retries with the same id are idempotent', async () => {
    const before = graphCalls.length
    const id = 'client-msg-1'
    const r1 = await (await send({ clientMessageId: id })).json()
    const r2 = await (await send({ clientMessageId: id })).json()
    expect(r1).toMatchObject({ ok: true })
    expect(r2.externalId).toBe(r1.externalId)
    expect(graphCalls.length).toBe(before + 1)
    const call = graphCalls.at(-1)!
    expect(call.url).toBe('/v21.0/PAGE1/messages')
    expect(call.auth).toBe(`Bearer ${TOKEN}`)
    expect(call.body).toEqual({ recipient: { id: 'PSID1' }, messaging_type: 'RESPONSE', message: { text: 'Hello' } })
  })

  test('validation: empty or too-long text, missing recipient', async () => {
    expect((await send({ text: '   ' })).status).toBe(400)
    expect((await send({ text: 'x'.repeat(2001) })).status).toBe(400)
    expect((await send({ recipientId: undefined })).status).toBe(400)
  })

  test('signed webhook → event stream to the CRM; bad signature rejected; duplicate deliveries collapsed', async () => {
    const received: InboundEvent[] = []
    const ctrl = new AbortController()
    const stream = await fetch(`${base}/api/messaging/events`, { signal: ctrl.signal })
    const reader = stream.body!.getReader()
    const pump = (async () => {
      const dec = new TextDecoder()
      let buf = ''
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value)
          const lines = buf.split('\n')
          buf = lines.pop() ?? '' // keep a partial line for the next chunk
          for (const line of lines) if (line.startsWith('data: ')) received.push(JSON.parse(line.slice(6))) // no client-side de-duplication
        }
      } catch { /* aborted */ }
    })()
    const payload = JSON.stringify({ object: 'page', entry: [{ id: 'PAGE1', messaging: [{ sender: { id: 'PSID7' }, recipient: { id: 'PAGE1' }, timestamp: 1, message: { mid: 'mid.hook', text: 'Is it available?' } }] }] })
    const post = (sig: string) => fetch(`${base}/webhooks/meta`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig }, body: payload })
    expect((await post('sha256=deadbeef')).status).toBe(401)
    expect((await post(sign(payload))).status).toBe(200)
    expect((await post(sign(payload))).status).toBe(200) // Meta retry of the same delivery
    await new Promise((r) => setTimeout(r, 150))
    ctrl.abort()
    await pump
    const msgs = received.filter((e) => e.type === 'message' && e.externalId === 'mid.hook')
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ companyId: 'flightnest', senderId: 'PSID7', text: 'Is it available?' })
    void publish
  })

  test('webhook handshake', async () => {
    expect(await (await fetch(`${base}/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc`)).text()).toBe('abc')
    expect((await fetch(`${base}/webhooks/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc`)).status).toBe(403)
  })
})
