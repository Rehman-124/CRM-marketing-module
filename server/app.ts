// Trip2Go messaging server: the only component that holds Meta credentials.
//   GET  /api/messaging/status   which company channels are configured (no secrets)
//   POST /api/messaging/send     send a reply through the Graph API (idempotent per clientMessageId)
//   GET  /api/messaging/events   server-sent events: normalised webhook events for the CRM
//   GET  /webhooks/meta          Meta subscription handshake
//   POST /webhooks/meta          Meta webhook deliveries (signature-verified)

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { MESSAGING_LIMITS, mayReply, type InboundEvent, type MessagingErrorCode, type SendRequest, type SendResult, type StatusResponse } from '../src/messaging/contract.ts'
import { accountFor, channelStatuses, redact, type Config } from './config.ts'
import { eventKey, normalise, verifySignature, verifySubscription } from './meta/webhook.ts'
import { sendToMeta, type GraphOptions } from './meta/graph.ts'

const MAX_BODY = 1024 * 1024

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const fail = (code: MessagingErrorCode, message: string, retryable = false): SendResult => ({ ok: false, error: { code, message, retryable } })

export interface ServerDeps extends GraphOptions {
  log?: (msg: string) => void
}

export function createMessagingServer(cfg: Config, deps: ServerDeps = {}): { server: Server; publish: (e: InboundEvent) => void } {
  const log = (m: string) => (deps.log ?? console.log)(redact(m, cfg))

  // ---- event stream to CRM clients, with a short replay buffer for reconnects
  const clients = new Set<ServerResponse>()
  const recent: { id: number; data: string }[] = []
  let seq = 0
  const seen = new Set<string>()
  const publish = (e: InboundEvent) => {
    const key = eventKey(e)
    if (key) {
      if (seen.has(key)) return // Meta may deliver the same webhook more than once
      seen.add(key)
      if (seen.size > 5000) seen.delete(seen.values().next().value as string)
    }
    const item = { id: ++seq, data: JSON.stringify(e) }
    recent.push(item)
    if (recent.length > 200) recent.shift()
    for (const c of clients) c.write(`id: ${item.id}\ndata: ${item.data}\n\n`)
  }

  // ---- idempotency: one Graph call per clientMessageId (in memory — production needs a shared store)
  const sends = new Map<string, Promise<SendResult>>()

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      if (req.method === 'GET' && url.pathname === '/api/messaging/status') {
        const body: StatusResponse = { server: 'ok', graphVersion: cfg.graphVersion, webhookConfigured: !!(cfg.appSecret && cfg.verifyToken), channels: channelStatuses(cfg) }
        return json(res, 200, body)
      }

      if (req.method === 'GET' && url.pathname === '/api/messaging/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        res.write('retry: 3000\n\n')
        const last = Number(req.headers['last-event-id'] ?? 0)
        for (const r of recent) if (r.id > last) res.write(`id: ${r.id}\ndata: ${r.data}\n\n`)
        clients.add(res)
        const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
        req.on('close', () => { clearInterval(ping); clients.delete(res) })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/messaging/send') {
        // PLACEHOLDER AUTH: the prototype has no login, so the CRM passes the user in a header.
        // Production must authenticate the session (cookie/JWT) here instead — headers can be forged.
        let user: { id: string; role: string; companyIds: string[] } | null = null
        try { user = JSON.parse(String(req.headers['x-crm-user'] ?? 'null')) } catch { user = null }
        let body: SendRequest
        try { body = JSON.parse((await readBody(req)).toString('utf8')) } catch { return json(res, 400, fail('invalid_request', 'Request body must be JSON.')) }

        if (!user || !Array.isArray(user.companyIds)) return json(res, 401, fail('forbidden', 'Not signed in.'))
        if (!mayReply(user, body.companyId)) return json(res, 403, fail('forbidden', 'You are not allowed to reply for this company.'))
        if (!body.clientMessageId || !['dm', 'private-reply', 'public-reply'].includes(body.kind) || !['messenger', 'instagram'].includes(body.channel)) return json(res, 400, fail('invalid_request', 'Missing or invalid fields.'))
        const text = String(body.text ?? '').trim()
        const limit = body.kind === 'public-reply' ? MESSAGING_LIMITS.maxPublicReply : MESSAGING_LIMITS.maxText[body.channel]
        if (!text || text.length > limit) return json(res, 400, fail('invalid_request', `Text must be 1–${limit} characters.`))
        if (body.kind === 'dm' ? !body.recipientId : !body.commentId) return json(res, 400, fail('invalid_request', body.kind === 'dm' ? 'recipientId is required.' : 'commentId is required.'))

        const acc = accountFor(cfg, body.companyId)
        const status = channelStatuses(cfg).find((c) => c.companyId === body.companyId && c.channel === body.channel)
        if (!acc || !status?.live) return json(res, 200, fail('not_configured', 'Live messaging is not configured for this company and channel.'))

        let p = sends.get(body.clientMessageId)
        if (!p) {
          p = sendToMeta(cfg, acc, { ...body, text }, deps)
          sends.set(body.clientMessageId, p)
          if (sends.size > 10_000) sends.delete(sends.keys().next().value as string)
        }
        const result = await p
        if (!result.ok && result.error.retryable) sends.delete(body.clientMessageId) // allow a real retry
        log(`send ${body.kind} ${body.channel} ${body.companyId} by ${user.id}: ${result.ok ? 'ok ' + result.externalId : 'failed ' + result.error.code}`)
        if (!result.ok) result.error.message = redact(result.error.message, cfg)
        return json(res, 200, result)
      }

      if (url.pathname === '/webhooks/meta') {
        if (req.method === 'GET') {
          const challenge = verifySubscription(url.searchParams, cfg.verifyToken)
          if (challenge === null) { res.writeHead(403).end(); return }
          res.writeHead(200, { 'Content-Type': 'text/plain' }).end(challenge)
          return
        }
        if (req.method === 'POST') {
          if (!cfg.appSecret) { res.writeHead(503).end('webhook secret not configured'); return }
          const raw = await readBody(req)
          if (!verifySignature(raw, req.headers['x-hub-signature-256'] as string | undefined, cfg.appSecret)) {
            log('webhook rejected: bad signature')
            res.writeHead(401).end()
            return
          }
          let payload: unknown
          try { payload = JSON.parse(raw.toString('utf8')) } catch { res.writeHead(400).end(); return }
          const events = normalise(payload as Record<string, unknown>, cfg)
          for (const e of events) publish(e)
          log(`webhook: ${events.length} event(s)`)
          res.writeHead(200, { 'Content-Type': 'text/plain' }).end('EVENT_RECEIVED')
          return
        }
      }

      json(res, 404, { error: 'not found' })
    } catch (err) {
      log(`error: ${(err as Error).message}`)
      if (!res.headersSent) json(res, 500, fail('unknown', 'Messaging server error.', true))
    }
  })

  return { server, publish }
}
